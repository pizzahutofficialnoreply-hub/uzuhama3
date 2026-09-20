importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM",
  authDomain: "uzuhama.firebaseapp.com",
  projectId: "uzuhama",
  storageBucket: "uzuhama.firebasestorage.app",
  messagingSenderId: "542360533089",
  appId: "1:542360533089:web:355d9d9ff7b36f0db5c102"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background push message:', payload);

  // FCM에서 notification 객체가 있으면 브라우저가 알림을 자동으로 표시하므로 중복 방지를 위해 리턴
  // (백엔드에서 data 전용 페이로드를 보냈을 때만 서비스 워커가 직접 알림을 생성함)
  if (payload.notification && !payload.data?.forceCustomNotification) {
    return;
  }

  let notificationTitle = payload.notification?.title || payload.data?.title || '우주하마 방송 예측';
  // 'from 우주하마 예측' 접두사 제거
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

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // 이미 열려 있는 앱/웹 탭이 있다면 해당 탭으로 포커스 이동 및 이동(Navigate)
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 열려 있는 탭이 없으면 새 창/탭으로 열기
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 서비스 워커 생명주기 관리 (즉시 활성화)
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});