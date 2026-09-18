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
  let notificationTitle = payload.notification?.title || payload.data?.title || '우주하마 방송 예측';
  // 'from 우주하마 예측' 접두사 제거
  notificationTitle = notificationTitle.replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim() || '우주하마 방송 예측';

  let body = payload.notification?.body || payload.data?.body || '';
  body = body.replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '').trim();

  const notificationOptions = {
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: {
      url: payload.data?.url || payload.fcmOptions?.link || '/'
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
