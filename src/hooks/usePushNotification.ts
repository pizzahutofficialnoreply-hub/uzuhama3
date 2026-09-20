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

const checkIsIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const checkIsStandalone = () => {
  if (typeof window === 'undefined') return false;
  return ('standalone' in window.navigator && (window.navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;
};

// 서비스 워커 등록 상태 탐색 및 신규 등록 함수
async function getReadyServiceWorker(timeoutMs: number = 3500): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    let existingSw = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (existingSw && existingSw.active) return existingSw;

    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), timeoutMs)
    );
    const reg = await Promise.race([readyPromise, timeoutPromise]);
    if (reg) return reg;

    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  } catch (err) {
    console.debug('Service Worker Registration 획득 실패:', err);
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
  const currentTokenRef = useRef<string | null>(null);

  const checkSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const isIOS = checkIsIOS();
    const supported = isIOS || ('Notification' in window && 'serviceWorker' in navigator);
    setIsSupported(supported);

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if (!supported || Notification.permission !== 'granted') {
      setIsSubscribed(false);
      setLoading(false);
      return;
    }

    try {
      const reg = await getReadyServiceWorker();
      const msg = await messaging();

      if (reg && msg) {
        const token = await getToken(msg, {
          vapidKey: DEFAULT_VAPID_KEY,
          serviceWorkerRegistration: reg
        }).catch(() => null);

        if (token) {
          currentTokenRef.current = token;
          setIsSubscribed(true);

          // 백엔드 상태 동기화
          fetch(SUBSCRIBE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              settings: loadStoredSettings()
            })
          }).catch(() => {});
        } else {
          setIsSubscribed(false);
        }
      }
    } catch (err) {
      console.warn('푸시 알림 상태 확인 중 오류:', err);
      setIsSubscribed(false);
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

      const msg = await messaging();
      if (!msg) {
        throw new Error('Firebase Messaging 객체를 불러올 수 없습니다.');
      }

      // 정식 FCM 토큰 획득
      let token: string | null = null;
      try {
        token = await getToken(msg, {
          vapidKey: DEFAULT_VAPID_KEY,
          serviceWorkerRegistration: registration
        });
      } catch (fcmErr) {
        console.error('FCM Token 발급 실패:', fcmErr);
        throw new Error('FCM 토큰 발급에 실패했습니다. VAPID Key 설정을 확인하세요.');
      }

      if (!token) {
        throw new Error('유효한 푸시 토큰을 얻지 못했습니다.');
      }

      currentTokenRef.current = token;

      const newSettings: PushSettings = {
        notifyLive: initialSettings?.notifyLive ?? settings.notifyLive ?? true,
        notifyAbsence: initialSettings?.notifyAbsence ?? settings.notifyAbsence ?? true,
      };
      setSettings(newSettings);
      saveStoredSettings(newSettings);

      const idToken = user?.uid ? await firebaseAuth.currentUser?.getIdToken() : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token,
          settings: newSettings
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Vercel API 구독 등록 실패:', response.status, errData);
        throw new Error(`서버 구독 등록 실패 (Status: ${response.status})`);
      }

      console.log('✅ FCM 토큰 서버 등록 성공:', token);
      setIsSubscribed(true);

      // 테스트 수신용 초기 로컬 알림
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
      alert(`알림 설정 중 오류가 발생했습니다: ${errMsg}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const msg = await messaging();
      const token = currentTokenRef.current;

      if (token) {
        await fetch(SUBSCRIBE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'unsubscribe' })
        }).catch(() => {});
      }

      if (msg) {
        await deleteToken(msg);
      }
      
      currentTokenRef.current = null;
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
    if (Notification.permission !== 'granted') return;

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