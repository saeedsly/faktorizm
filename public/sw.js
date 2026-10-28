// سرویس‌ورک فاکتوریزم — پشتیبانی از کار آفلاین و نصب PWA
// نسخه ۲: HTML همیشه network-first است تا بعد از به‌روزرسانی، هرگز
// index قدیمی به فایل‌های هش‌دار حذف‌شده اشاره نکند (پیشگیری از صفحه سفید).
const CACHE = 'faktorizm-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  if (request.url.includes('/api/')) return; // داده زنده هرگز کش نمی‌شود

  // ناوبری/HTML: اول شبکه، در آفلاین کش و در نهایت شِل برنامه
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // دارایی‌های استاتیک (نام هش‌دار، تغییرناپذیر): اول کش، بعد شبکه
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
