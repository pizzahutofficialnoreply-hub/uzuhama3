importScripts('/firebase-messaging-sw.js');

// Service Worker for Uzuhama Prediction PWA & Push Notifications
const CACHE_NAME = 'uzuhama-pwa-v2';

// Core shell assets to precache for offline availability
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// 1. Service Worker Installation & Precaching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-caching partial failure (normal in dynamic dev mode):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Service Worker Activation & Stale Cache Cleanup
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Smart Network & Offline Fetch Handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass third-party APIs, Firestore, Google Auth, and WebSocket/SSE
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('chzzk.naver.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('firebase') ||
    url.pathname.startsWith('/api/') ||
    request.headers.get('accept')?.includes('text/event-stream')
  ) {
    return;
  }

  // Navigation requests: Network-First with Offline fallback to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response('Offline: Network unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        })
    );
    return;
  }

  // Static Assets (JS, CSS, Images, Fonts): Stale-While-Revalidate
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2|woff|ttf|ico|json)$/i) ||
     url.pathname.startsWith('/assets/'));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Other internal requests: Network first, cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
  }
});

// 4. Background Sync Handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-broadcast-data') {
    event.waitUntil(
      Promise.resolve() // Placeholder for background data sync if needed
    );
  }
});

// 5. Push Notification Handler
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  let title = (data.title || '우주하마 방송 예측').replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim() || '우주하마 방송 예측';
  let body = (data.body || '새로운 방송 정보가 업데이트되었습니다.').replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim();
  const tag = data.tag || (data.id ? `uzuhama-${data.id}` : `uzuhama-${title.slice(0, 10)}-${body.slice(0, 15)}`);
  const options = {
    body: body,
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    tag: tag,
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100]
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('showNotification fallback in SW:', err);
      const safeOptions = {
        body: options.body,
        icon: '/icon.png',
        tag: options.tag,
        data: options.data
      };
      return self.registration.showNotification(title, safeOptions);
    })
  );
});

// 6. Message Handler for Direct in-app Notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const initialOptions = {
      icon: '/icon.png',
      badge: '/icon.png',
      tag: options?.tag || `uzuhama-${(title || '').slice(0, 10)}-${(options?.body || '').slice(0, 15)}`,
      vibrate: [100, 50, 100],
      ...options
    };
    event.waitUntil(
      self.registration.showNotification(title, initialOptions).catch((err) => {
        console.warn('showNotification message error in SW:', err);
        const safeOptions = {
          body: options?.body || '',
          icon: '/icon.png',
          data: options?.data || { url: '/' }
        };
        return self.registration.showNotification(title, safeOptions);
      })
    );
  }
});

// 7. Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin) && !targetUrl.startsWith('http')) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
