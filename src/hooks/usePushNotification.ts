import { useState, useEffect, useCallback, useRef } from 'react';
import { messaging, auth as firebaseAuth } from '../lib/firebase';
// 푸시 알림 모듈은 필요할 때만 불러옴
const getToken: typeof import('firebase/messaging').getToken = (...args) => import('firebase/messaging').then((m) => m.getToken(...args));
const deleteToken: typeof import('firebase/messaging').deleteToken = (...args) => import('firebase/messaging').then((m) => m.deleteToken(...args));
import { useAuth } from './useAuth';
import { openSetupGuide } from '../utils/setupStatus';

export interface PushSettings {
  notifyLive: boolean;
  notifyAbsence: boolean;
  notifyPeakProb?: boolean;
  leadTimeMinutes?: number;
  notifyReports?: boolean;
  /** 생방송 알림을 이 게임·장르일 때만 (비우면 모든 방송) */
  liveKeywords?: string[];
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
  notifyReports: true,
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
  if (typeof window === 'undefined' || !('Notification' in window) || typeof window.Notification === 'undefined') return 'denied';
  try {
    return await window.Notification.requestPermission();
  } catch {
    return new Promise((resolve) => {
      try {
        window.Notification.requestPermission((p) => resolve(p));
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

    const hasNotification = 'Notification' in window && typeof window.Notification !== 'undefined';
    const isIOS = checkIsIOS();
    const isStandalone = checkIsStandalone();
    const supported = (isIOS && !isStandalone) || (hasNotification && 'serviceWorker' in navigator);
    setIsSupported(supported);

    if (hasNotification) {
      setPermission(window.Notification.permission);
    } else {
      setPermission('default');
    }

    if (!supported || !hasNotification || window.Notification.permission !== 'granted') {
      setIsSubscribed(false);
      setLoading(false);
      return;
    }

    try {
      const reg = await getReadyServiceWorker();
      const msg = await messaging();

      if (reg && msg) {
        let token = await getToken(msg, {
          vapidKey: DEFAULT_VAPID_KEY,
          serviceWorkerRegistration: reg
        }).catch(() => null);

        // 이전 가짜 토큰(local_dev_) 정리
        if (token && (token.startsWith('local_dev_') || token.length < 20)) {
          token = null;
        }

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
          currentTokenRef.current = null;
          setIsSubscribed(false);
        }
      }
    } catch (err) {
      console.warn('푸시 알림 상태 확인 중 오류:', err);
      currentTokenRef.current = null;
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // 이전 로컬 가짜 디바이스 토큰 잔재 정리
    try {
      localStorage.removeItem('uzuhama_local_device_token');
    } catch {}
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = async (initialSettings?: Partial<PushSettings>, opts?: { silent?: boolean }): Promise<boolean> => {
    // silent: 안내 화면처럼 자체적으로 결과를 보여 주는 곳에서는 alert 를 띄우지 않음
    const say = (m: string) => { if (!opts?.silent) alert(m); };
    const isIOS = checkIsIOS();
    const isStandalone = checkIsStandalone();

    if (isIOS && !isStandalone) {
      // 아이폰 사파리 탭에서는 알림이 안 됨 → 홈 화면에 추가하는 안내 화면을 바로 열어 줌
      if (!opts?.silent) openSetupGuide('notify');
      return false;
    }

    const hasNotification = typeof window !== 'undefined' && 'Notification' in window && typeof window.Notification !== 'undefined';
    if (!hasNotification) {
      say('이 브라우저는 웹 푸시 알림을 지원하지 않아요.');
      return false;
    }

    setLoading(true);
    try {
      const perm = await requestPermissionDirectly();
      setPermission(perm);

      if (perm !== 'granted') {
        say('알림 권한이 허용되지 않았어요. 브라우저 설정에서 알림을 허용해주세요.');
        setLoading(false);
        return false;
      }

      const registration = await getReadyServiceWorker();
      if (!registration) {
        throw new Error('Service Worker 준비에 실패했어요. 페이지를 새로고침 후 다시 시도해주세요.');
      }

      const msg = await messaging();
      if (!msg) {
        throw new Error('Firebase Messaging 객체를 불러올 수 없어요.');
      }

      // 정식 FCM 토큰 획득 (가짜 토큰 발급 금지)
      let token: string | null = null;
      try {
        token = await getToken(msg, {
          vapidKey: DEFAULT_VAPID_KEY,
          serviceWorkerRegistration: registration
        });
      } catch (fcmErr: any) {
        console.error('FCM Token 발급 실패:', fcmErr);
        const detail = String(fcmErr?.message || fcmErr);
        const setupHint = detail.includes('401') || detail.includes('authentication credential')
          ? ' Firebase Console에서 uzuhama Web API key의 HTTP referrer 제한에 현재 사이트 도메인이 포함되어 있는지, Cloud Messaging Web Push 인증서의 VAPID 공개 키가 VITE_VAPID_PUBLIC_KEY와 일치하는지 확인하세요.'
          : '';
        throw new Error(`FCM token registration failed: ${detail}.${setupHint}`);
      }

      if (!token || typeof token !== 'string' || token.trim().length < 20 || token.startsWith('local_dev_')) {
        throw new Error('유효한 FCM 토큰을 발급받지 못했어요.');
      }

      const newSettings: PushSettings = {
        notifyLive: initialSettings?.notifyLive ?? settings.notifyLive ?? true,
        notifyAbsence: initialSettings?.notifyAbsence ?? settings.notifyAbsence ?? true,
        notifyPeakProb: initialSettings?.notifyPeakProb ?? settings.notifyPeakProb ?? true,
        leadTimeMinutes: initialSettings?.leadTimeMinutes ?? settings.leadTimeMinutes ?? 30,
        notifyReports: initialSettings?.notifyReports ?? settings.notifyReports ?? true,
        liveKeywords: initialSettings?.liveKeywords ?? settings.liveKeywords ?? [],
      };

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
        throw new Error(errData.error || `서버 구독 등록에 실패했어요 (상태 코드: ${response.status})`);
      }

      currentTokenRef.current = token;
      setSettings(newSettings);
      saveStoredSettings(newSettings);
      setIsSubscribed(true);

      console.log('✅ FCM 푸시 구독 완료:', token);

      // 테스트 수신용 초기 로컬 알림
      try {
        if (registration && 'showNotification' in registration) {
          await registration.showNotification('[우주하마] 알림 설정 완료', {
            body: '방송 시작 및 휴방 알림을 정상적으로 수신하실 수 있어요.',
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
      currentTokenRef.current = null;
      setIsSubscribed(false);
      const errMsg = String(err?.message || err);
      say(`알림 설정 실패: ${errMsg}`);
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
        try {
          await deleteToken(msg);
        } catch {}
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

    if (currentTokenRef.current) {
      fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: currentTokenRef.current,
          settings: updated
        })
      }).catch(() => {});
    }
  };

  const triggerLocalNotification = async (title: string, body: string, url: string = '/') => {
    if (typeof window === 'undefined') return;
    const hasNotification = 'Notification' in window && typeof window.Notification !== 'undefined';
    if (!hasNotification || window.Notification.permission !== 'granted') return;

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

      if (!checkIsIOS() && hasNotification) {
        try {
          new window.Notification(title, {
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
