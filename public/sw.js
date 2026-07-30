const CACHE_NAME = 'agenda-kanwil-cache-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/kemenag-seeklogo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

// Reminder Agenda Pimpinan (H-1 / hari-H) — pushed by the
// send-agenda-reminders Supabase Edge Function. Payload shape:
// { title, body, url, tag }
self.addEventListener('push', (event) => {
  let payload = { title: 'Agenda Pimpinan', body: 'Ada agenda yang perlu diperhatikan.', url: '/#/agenda-preview-home', tag: 'agenda-reminder' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // fall back to default payload above
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/#/agenda-preview-home';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsList) {
        if ('focus' in client) {
          client.postMessage({ type: 'agenda-reminder-click', url: targetUrl });
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
