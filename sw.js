// InSort service worker v2 — швидкий запуск
// • Сторінка і власні файли: віддаємо миттєво з кешу, а свіжу версію підтягуємо у фоні.
// • Бібліотеки Firebase (gstatic, версія в адресі) та фото товарів: з кешу, у мережу ходимо лише якщо їх там ще немає.
// • Запити до бази Firebase не чіпаємо — товари кешує сам сайт (IndexedDB).
const SHELL = 'insort-shell-v3';
const STATIC = 'insort-static-v3';
const IMAGES = 'insort-img-v3';
const MAX_IMAGES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [SHELL, STATIC, IMAGES];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function staleWhileRevalidate(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) { net.catch(() => {}); return cached; }
  const res = await net;
  return res || (fallbackKey ? cache.match(fallbackKey) : null) || Response.error();
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).then(() => max && trim(cacheName, max)).catch(() => {});
    }
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.indexOf('/api/') === 0) return;   // запити до двигуна — завжди напряму

  // сторінка
  if (req.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(req, SHELL, '/'));
    return;
  }
  // бібліотеки Firebase (версія вказана в адресі — безпечно кешувати надовго)
  if (url.hostname === 'www.gstatic.com' && /\.js$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req, STATIC, 0));
    return;
  }
  // фото
  if (req.destination === 'image') {
    e.respondWith(cacheFirst(req, IMAGES, MAX_IMAGES));
    return;
  }
  // власні файли сайту
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  // решта (зокрема база Firebase) — напряму
});
