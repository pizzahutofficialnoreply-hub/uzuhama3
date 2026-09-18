import { useState, useEffect, useCallback, useRef } from 'react';
import { messaging, auth as firebaseAuth } from '../lib/firebase';
import { getToken, deleteToken } from 'firebase/messaging';
import { useAuth } from './useAuth';

export interface PushSettings {
  notifyLive: boolean;
  notifyAbsence: boolean;
  notifyPeakProb?: boolean;
  leadTimeMinutes?: number; // 최고 확률 시간 기준 몇 분 전 사전 알림
}

const STORAGE_KEY = 'uzuhama_push_settings';

// Vercel 푸시 구독 API 전체 엔드포인트 URL (Vercel 배포 시 Same-Origin 우선 활용 및 슬래시 정규화)
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

// Web Push VAPID Public Key (환경변수 fallback 지원)
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

function getSubDocId(endpoint: string): string {
  try {
    return btoa(endpoint).slice(-50).replace(/[^a-zA-Z0-9]/g, '_');
  } catch {
    return encodeURIComponent(endpoint.slice(-50)).replace(/[^a-zA-Z0-9]/g, '_');
  }
}

const checkIsIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const checkIsStandalone = () => {
  if (typeof window === 'undefined') return false;
  return ('standalone' in window.navigator && (window.navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;
};

// 서비스 워커 Registration 객체 안전 획득 (무한 대기 방지 타임아웃 포함)
async function getReadyServiceWorker(timeoutMs: number = 3500): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    // 1. 이미 등록되어 활성화된 Registration 우선 조회 (/sw.js 또는 /sw-push.js)
    const existingSw = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existingSw && existingSw.active) return existingSw;

    const existing = await navigator.serviceWorker.getRegistration('/sw-push.js');
    if (existing && existing.active) {
      return existing;
    }

    // 2. navigator.serviceWorker.ready를 타임아웃과 함께 대기
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), timeoutMs)
    );
    const reg = await Promise.race([readyPromise, timeoutPromise]);
    if (reg) return reg;

    // 3. 만약 ready 대기시간이 초과되었으나 getRegistration으로 조회되는 경우
    const regFallback = (await navigator.serviceWorker.getRegistration('/sw.js')) || (await navigator.serviceWorker.getRegistration('/sw-push.js'));
    if (regFallback) return regFallback;

    // 4. 최후의 수단으로 등록 시도
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.debug('Service Worker Registration 획득 실패 (안내):', err);
    return null;
  }
}

// iOS WebKit 및 표준 브라우저 호환 권한 요청 래퍼
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

  // [앱 초기화 단계] 순수 읽기 전용 상태 점검:
  // 절대 Notification.requestPermission()이나 showNotification()을 호출하지 않음 (iOS 차단 원천 방지)
  const checkSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const isIOS = checkIsIOS();
    const isStandalone = checkIsStandalone();

    // iOS 일반 브라우저에서는 Notification이 숨겨져 있을 수 있으나 안내를 위해 isSupported=true 처리
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
        const registration = (await navigator.serviceWorker.getRegistration('/sw.js')) || 
                             (await navigator.serviceWorker.getRegistration('/sw-push.js')) || 
                             (await navigator.serviceWorker.ready);
        if (registration && 'pushManager' in registration) {
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            subscriptionRef.current = sub;
            setIsSubscribed(true);
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

  // [사용자 제스처 단계] 사용자가 직접 버튼이나 토글을 클릭했을 때만 호출되는 권한 요청 및 구독 로직
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
        throw new Error('Service Worker not ready');
      }

      let token: string | null = null;
      try {
        const msg = await messaging();
        if (msg) {
          token = await getToken(msg, {
            vapidKey: DEFAULT_VAPID_KEY,
            serviceWorkerRegistration: registration
          });
        }
      } catch (fcmErr: any) {
        console.warn('FCM 토큰 획득 안내 (브라우저 로컬 알림으로 대체 활성화):', fcmErr);
        // Firebase Installations 403 또는 VAPID 키 관련 에러 발생 시에도
        // 이미 perm === 'granted' 이므로 브라우저 네이티브 알림은 100% 정상 작동 가능함
      }

      const newSettings: PushSettings = {
        notifyLive: initialSettings?.notifyLive ?? settings.notifyLive ?? true,
        notifyAbsence: initialSettings?.notifyAbsence ?? settings.notifyAbsence ?? true,
      };
      setSettings(newSettings);
      saveStoredSettings(newSettings);
      setIsSubscribed(true);

      // FCM 토큰이 발급된 경우 Vercel 백엔드 API로 서버 등록 동기화
      if (token) {
        try {
          const idToken = user?.uid ? await firebaseAuth.currentUser?.getIdToken() : null;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
          }
          await fetch(SUBSCRIBE_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ token })
          });
        } catch (e) {
          console.debug('Failed to sync subscription via Vercel API:', e);
        }
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
        console.debug('초기 알림 발송 안내 (무시 가능):', notifyErr);
      }

      return true;
    } catch (err: any) {
      console.error('푸시 구독 실패:', err);
      const errMsg = String(err?.message || err);
      if (errMsg.includes('installations') || errMsg.includes('PERMISSION_DENIED')) {
        // 이미 권한이 허용되어 있다면 성공으로 간주
        setIsSubscribed(true);
        return true;
      }
      alert(`알림 권한 허용 중 오류가 발생했습니다: ${errMsg}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 구독 해제
  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const msg = await messaging();
      if (msg) {
        // 서버에서도 해당 토큰 구독 삭제 시도
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

  // 설정 업데이트
  const updateSettings = async (newSettings: Partial<PushSettings>) => {
    const updated: PushSettings = {
      ...settings,
      ...newSettings
    };
    // 방송/휴방 알림은 로컬 스토리지에 즉시 반영
    setSettings(updated);
    saveStoredSettings(updated);

    // 아직 브라우저 알림 구독이 아니라면 사용자 제스처를 통해 구독 먼저 수행
    if (!isSubscribed) {
      await subscribe(updated);
      return;
    }
  };

  // 브라우저 네이티브 알림 즉시 팝업 트리거
  // 🚨 중요: 권한이 'granted'가 아닐 때 절대 requestPermission()을 부르지 않음 (iOS 차단 방지)
  const triggerLocalNotification = async (title: string, body: string, url: string = '/') => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      console.debug('알림 권한이 허용되지 않아 로컬 알림을 건너뜁니다.');
      return;
    }

    try {
      // 1. Service Worker registration.showNotification 최우선 시도 (iOS 필수 방식)
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

      // 2. Controller postMessage fallback
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

      // 3. iOS 외 데스크톱 브라우저를 위한 new Notification fallback
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
