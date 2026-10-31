import { useEffect, useRef } from 'react';
import { BroadcastLog } from '../types';
import { calculateTodayPeakMinute } from '../utils/probability';

const DAILY_NOTIF_KEY = 'uzuhama_daily_prob_notif_date_v1';

export function useRealtimeNotification(logs: BroadcastLog[]) {
  // 브라우저 네이티브 알림 팝업 트리거 함수 (iOS 및 Android/데스크톱 호환)
  const triggerNativeNotification = async (title: string, body: string, url: string = '/', tag?: string) => {
    if (typeof window === 'undefined') return;

    const hasNotification = 'Notification' in window && typeof window.Notification !== 'undefined';
    if (!hasNotification || window.Notification.permission !== 'granted') {
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const notificationTag = tag || `uzuhama-${title.slice(0, 10)}-${body.slice(0, 15)}`;

    try {
      if ('serviceWorker' in navigator) {
        try {
          let reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
          if (!reg || !reg.active) {
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
            reg = await Promise.race([navigator.serviceWorker.ready, timeoutPromise]);
          }

          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, {
              body,
              icon: '/icon.png',
              badge: '/icon.png',
              tag: notificationTag,
              data: { url }
            } as any);
            return;
          }
        } catch (swErr) {
          console.debug('SW showNotification retry:', swErr);
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
            tag: notificationTag,
            data: { url }
          }
        });
        return;
      }

      if (!isIOS && hasNotification) {
        try {
          new window.Notification(title, {
            body,
            icon: '/icon.png',
            tag: notificationTag
          });
        } catch (e) {
          console.debug('Standard Notification constructor not supported:', e);
        }
      }
    } catch (err) {
      console.warn('알림 팝업 호출 실패:', err);
    }
  };

  useEffect(() => {
    if (!logs || logs.length === 0) return;

    const checkPeakProbability = () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      // 이미 오늘 발송했는지 확인 (하루 1회 제한)
      const lastSentDate = localStorage.getItem(DAILY_NOTIF_KEY);
      if (lastSentDate === todayStr) return;

      // 포그라운드 활성 탭에서만 동작하도록 분리 (백그라운드/앱 종료 시에는 서버 FCM이 전담)
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      // 사용자 설정 불러오기 (기본값 30분 전)
      let leadTime = 30;
      let notifyPeak = true;
      try {
        const raw = localStorage.getItem('uzuhama_push_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.leadTimeMinutes !== undefined) leadTime = Number(parsed.leadTimeMinutes);
          if (parsed.notifyPeakProb !== undefined) notifyPeak = Boolean(parsed.notifyPeakProb);
        }
      } catch {}

      if (!notifyPeak) return;

      const peakData = calculateTodayPeakMinute(logs, now);
      if (!peakData) return;

      const { peakMinute, formattedTime } = peakData;
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      
      // 최고 확률 시간 기준 남은 시간 계산
      let diff = peakMinute - currentMinute;
      if (diff < -720) diff += 1440; // 자정 넘김 처리
      if (diff > 720) diff -= 1440;
      
      // 유저가 설정한 사전 알림 시점 (예: 30분 전) 도달 여부 확인 (오차범위 ±5분)
      const minDiff = Math.max(5, leadTime - 5);
      const maxDiff = leadTime + 5;

      if (diff >= minDiff && diff <= maxDiff) {
        const title = '우주하마 방송 예측';
        const body = leadTime > 0
          ? `오늘 방송 최고 유력 시간(${formattedTime})이 약 ${leadTime}분 후 시작될 예정입니다.`
          : `지금은 오늘 방송 최고 유력 시간(${formattedTime})입니다!`;

        triggerNativeNotification(
          title,
          body,
          '/',
          `prob-notif-${todayStr}`
        );
        localStorage.setItem(DAILY_NOTIF_KEY, todayStr);
      }
    };

    // 5분마다 체크
    checkPeakProbability();
    const interval = setInterval(checkPeakProbability, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [logs]);

  return { triggerNativeNotification };
}
