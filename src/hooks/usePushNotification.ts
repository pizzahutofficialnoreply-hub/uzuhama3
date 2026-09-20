import { useState, useEffect, useCallback, useRef } from 'react';
import { messaging, auth as firebaseAuth } from '../lib/firebase';
import { getToken, deleteToken } from 'firebase/messaging';
import { useAuth } from './useAuth';

export interface PushSettings {
  notifyLive: boolean;
  notifyAbsence: boolean;
  notifyPeakProb?: boolean;
  leadTimeMinutes?: number;
}

const STORAGE_KEY = 'uzuhama_push_settings';

const RAW_API_BASE = import.meta.env.VITE_VERCEL_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
const VERCEL_API_BASE = (RAW_API_BASE || '').replace(/\/+$/, '');
const SUBSCRIBE_URL = `${VERCEL_API_BASE}/api/notifications/subscribe`;

const DEFAULT_SETTINGS: PushSettings = {
  notifyLive: true,
  notifyAbsence: true,
  notifyPeakProb: true,
  leadTimeMinutes: 30,
};

function loadStoredSettings(): PushSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveStoredSettings(settings: PushSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

const DEFAULT_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 
  'BPMd-q_ZR3_u-Sk2XN5B5KnGO1fKostrYW76tUHtYCefh6KSnh-1Fp9lfiOEjcwyO-TGErUq63lJZoX7MNISBas';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const checkIsIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const checkIsStandalone = () => {
  if (typeof window === 'undefined') return false;
  return ('standalone' in window.navigator && (window.navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;
};

// 서비스 워커 등록 상태 탐색 및 신규 등록 함수 (단일 /firebase-messaging-sw.js 사용)
async function getReadyServiceWorker(timeoutMs: number = 3500): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    // 1. firebase-messaging-sw.js 등록 확인
    let existingSw = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (existingSw && existingSw.active) return existingSw;

    // 2. navigator.serviceWorker.ready 대기
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), timeoutMs)
    );
    const reg = await Promise.race([readyPromise, timeoutPromise]);
    if (reg) return reg;

    // 3. 신규 서비스 워커 등록
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  } catch (err) {
    console.debug('Service Worker Registration 획득 실패 (안내):', err);
    return null;
  }
}

async function requestPermissionDirectly(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return new Promise((resolve) => {
      try {
        Notification.requestPermission((p) => resolve(p));
      } catch {
        resolve('denied');
      }
    });
  }
}

export function usePushNotification() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [settings, setSettings] = useState<PushSettings>(loadStoredSettings);
  const [loading, setLoading] = useState(true);
  const subscriptionRef = useRef<PushSubscription | null>(null);

  const checkSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const isIOS = checkIsIOS();
    const supported = isIOS || ('Notification' in window && 'serviceWorker' in navigator);
    setIsSupported(supported);

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if (!supported) {
      setLoading(false);
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration = (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
                             (await navigator.serviceWorker.ready);
        if (registration && 'pushManager' in registration) {
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            subscriptionRef.current = sub;
            setIsSubscribed(true);

            try {
              let syncToken: string | null = null;
              if (sub.endpoint.includes('/fcm/send/')) {
                syncToken = sub.endpoint.split('/fcm/send/')[1];
              }
              const rawSub = JSON.parse(JSON.stringify(sub));
              fetch(SUBSCRIBE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token: syncToken,
                  endpoint: sub.endpoint,
                  keys: rawSub?.keys || null,
                  settings: loadStoredSettings()
                })
              }).catch(() => {});
            } catch {}
          } else {
            setIsSubscribed(false);
          }
        } else {
          setIsSubscribed(false);
        }
      }
    } catch (err) {
      console.warn('푸시 알림 상태 확인 중 오류:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = async (initialSettings?: Partial<PushSettings>): Promise<boolean> => {
    const isIOS = checkIsIOS();
    const isStandalone = checkIsStandalone();

    if (isIOS && !isStandalone) {
      alert('📱 iPhone(iOS) 알림 설정 안내\n\nApple의 보안 정책상 Safari 브라우저 탭에서는 알림이 제한됩니다.\n\n1. Safari 하단 중앙의 [공유 (네모에 위 화살표)] 아이콘 클릭\n2. [홈 화면에 추가] 선택 후 완료\n3. 홈 화면에 생성된 앱을 열고 알림을 켜주세요!\n\n홈 화면 앱에서 실행하시면 정상적으로 알림을 받으실 수 있습니다.');
      return false;
    }

    if (!('Notification' in window)) {
      alert('이 브라우저는 웹 푸시 알림을 지원하지 않습니다.');
      return false;
    }

    setLoading(true);
    try {
      const perm = await requestPermissionDirectly();
      setPermission(perm);

      if (perm !== 'granted') {
        alert('알림 권한이 허용되지 않았습니다.');
        setLoading(false);
        return false;
      }

      const registration = await getReadyServiceWorker();
      if (!registration) {
        throw new Error('Service Worker 준비에 실패했습니다.');
      }

      let token: string | null = null;
      let pushSub: PushSubscription | null = null;

      try {
        if ('pushManager' in registration) {
          pushSub = await registration.pushManager.getSubscription();
          if (!pushSub && DEFAULT_VAPID_KEY) {
            pushSub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(DEFAULT_VAPID_KEY)
            });
          }
          if (pushSub) {
            subscriptionRef.current = pushSub;
          }
        }
      } catch (pushErr) {
        console.warn('PushManager 구독 시도 안내:', pushErr);
      }

      try {
        const msg = await messaging();
        if (msg) {
          try {
            token = await getToken(msg, {
              vapidKey: DEFAULT_VAPID_KEY,
              serviceWorkerRegistration: registration
            });
          } catch (vapidErr) {
            console.warn('VAPID 지정 FCM 토큰 획득 실패, 기본 모드로 재시도:', vapidErr);
            token = await getToken(msg, {
              serviceWorkerRegistration: registration
            });
          }
        }
      } catch (fcmErr: any) {
        console.warn('FCM 토큰 획득 실패:', fcmErr);
      }

      if (!token && pushSub?.endpoint && pushSub.endpoint.includes('/fcm/send/')) {
        token = pushSub.endpoint.split('/fcm/send/')[1];
      }

      const newSettings: PushSettings = {
        notifyLive: initialSettings?.notifyLive ?? settings.notifyLive ?? true,
        notifyAbsence: initialSettings?.notifyAbsence ?? settings.notifyAbsence ?? true,
      };
      setSettings(newSettings);
      saveStoredSettings(newSettings);

      if (token || pushSub?.endpoint) {
        try {
          const idToken = user?.uid ? await firebaseAuth.currentUser?.getIdToken() : null;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
          }
          const rawSub = pushSub ? JSON.parse(JSON.stringify(pushSub)) : null;

          const response = await fetch(SUBSCRIBE_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              token: token || null,
              endpoint: pushSub?.endpoint || null,
              keys: rawSub?.keys || null,
              settings: newSettings
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Vercel API 구독 등록 실패:', response.status, errData);
            throw new Error(`서버 구독 등록 실패 (Status: ${response.status})`);
          }

          console.log('✅ FCM 토큰 서버 등록 성공:', token || pushSub?.endpoint);
          setIsSubscribed(true);
        } catch (e: any) {
          console.error('Failed to sync subscription via Vercel API:', e);
          alert(`서버 토큰 동기화 실패: ${e.message}`);
          setIsSubscribed(false);
          return false;
        }
      } else {
        throw new Error('유효한 푸시 토큰이나 엔드포인트를 생성하지 못했습니다.');
      }

      try {
        if (registration && 'showNotification' in registration) {
          await registration.showNotification('[우주하마] 알림 설정 완료', {
            body: '방송 시작 및 휴방 알림을 정상적으로 수신하실 수 있습니다.',
            icon: '/icon.png',
            badge: '/icon.png',
            data: { url: '/' }
          } as any);
        }
      } catch (notifyErr) {
        console.debug('초기 알림 발송 안내:', notifyErr);
      }

      return true;
    } catch (err: any) {
      console.error('푸시 구독 실패:', err);
      const errMsg = String(err?.message || err);
      if (errMsg.includes('installations') || errMsg.includes('PERMISSION_DENIED')) {
        setIsSubscribed(true);
        return true;
      }
      alert(`알림 권한 허용 중 오류가 발생했습니다: ${errMsg}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const msg = await messaging();
      if (msg) {
        try {
          const registration = await getReadyServiceWorker();
          if (registration) {
            const token = await getToken(msg, {
              vapidKey: DEFAULT_VAPID_KEY,
              serviceWorkerRegistration: registration
            });
            if (token) {
              await fetch(SUBSCRIBE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action: 'unsubscribe' })
              }).catch(() => {});
            }
          }
        } catch (delErr) {
          console.debug('서버 구독 삭제 호출 안내:', delErr);
        }

        await deleteToken(msg);
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('구독 해제 실패:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<PushSettings>) => {
    const updated: PushSettings = {
      ...settings,
      ...newSettings
    };
    setSettings(updated);
    saveStoredSettings(updated);

    if (!isSubscribed) {
      await subscribe(updated);
      return;
    }
  };

  const triggerLocalNotification = async (title: string, body: string, url: string = '/') => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      console.debug('알림 권한이 허용되지 않아 로컬 알림을 건너뜁니다.');
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const reg = await getReadyServiceWorker();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, {
            body,
            icon: '/icon.png',
            badge: '/icon.png',
            data: { url }
          } as any);
          return;
        }
      }

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: {
            body,
            icon: '/icon.png',
            badge: '/icon.png',
            data: { url }
          }
        });
        return;
      }

      if (!checkIsIOS()) {
        try {
          new Notification(title, {
            body,
            icon: '/icon.png'
          });
        } catch (e) {
          console.debug('new Notification fallback failed:', e);
        }
      }
    } catch (err) {
      console.warn('알림 발송 실패:', err);
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    settings,
    loading,
    subscribe,
    unsubscribe,
    updateSettings,
    checkSubscription,
    triggerLocalNotification
  };
}