importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// 1. Firebase 초기화
firebase.initializeApp({
  apiKey: "AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM",
  authDomain: "uzuhama.firebaseapp.com",
  projectId: "uzuhama",
  storageBucket: "uzuhama.firebasestorage.app",
  messagingSenderId: "542360533089",
  appId: "1:542360533089:web:355d9d9ff7b36f0db5c102"
});

const messaging = firebase.messaging();

// 2. PWA 캐싱 설정 및 생명주기 관리
const CACHE_NAME = 'uzuhama-pwa-v2';
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-caching partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

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

// 3. PWA 네트워크 오프라인 대응 (Fetch Interceptor)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 API 및 스트리밍 서비스 요청은 캐싱에서 제외
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('chzzk.naver.com') ||
    url.hostname.includes('youtube.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

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
          return caches.match('/index.html');
        })
    );
    return;
  }
});

// 4. FCM 백그라운드 푸시 알림 수신
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background push message:', payload);

  // FCM에서 notification 객체가 있으면 브라우저가 자동 표시하므로 중복 방지
  if (payload.notification && !payload.data?.forceCustomNotification) {
    return;
  }

  let notificationTitle = payload.notification?.title || payload.data?.title || '우주하마 방송 예측';
  notificationTitle = notificationTitle.replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim() || '우주하마 방송 예측';

  let body = payload.notification?.body || payload.data?.body || '';
  body = body.replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim();

  const targetUrl = payload.data?.url || payload.fcmOptions?.link || '/';

  const notificationOptions = {
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: {
      url: targetUrl
    },
    vibrate: [100, 50, 100],
    tag: payload.data?.tag || `uzuhama-${Date.now()}`
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 5. 알림 클릭 시 해당 페이지 이동 처리
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});