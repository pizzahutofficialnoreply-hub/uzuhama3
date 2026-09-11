import { useEffect, useRef } from 'react';
import { BroadcastLog } from '../types';

const DAILY_NOTIF_KEY = 'uzuhama_daily_prob_notif_date_v1';

export function useRealtimeNotification(logs: BroadcastLog[]) {
  // 브라우저 네이티브 알림 팝업 트리거 함수 (iOS 및 Android/데스크톱 호환)
  const triggerNativeNotification = async (title: string, body: string, url: string = '/', tag?: string) => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const notificationTag = tag || `uzuhama-${title.slice(0, 10)}-${body.slice(0, 15)}`;

    try {
      if ('serviceWorker' in navigator) {
        try {
          let reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
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

      if (!isIOS) {
        try {
          new Notification(title, {
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
      const todayStr = now.toISOString().slice(0, 10);
      
      // 이미 오늘 발송했는지 확인
      const lastSentDate = localStorage.getItem(DAILY_NOTIF_KEY);
      if (lastSentDate === todayStr) return;

      const currentDayIdx = now.getDay();
      
      // 요일별 빈도 계산
      const timeFreq = Array(1440).fill(0);
      logs.forEach(log => {
        if (log.isAbsence) return;
        const d = new Date(log.date);
        if (isNaN(d.getTime()) || d.getDay() !== currentDayIdx) return;
        
        if (log.time) {
          const [h, m] = log.time.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            timeFreq[h * 60 + m] += 1;
          }
        }
      });

      // 가장 빈도가 높은 1시간 구간(60분) 찾기
      let maxCount = 0;
      let peakMinute = -1;
      
      for (let m = 0; m < 1440; m += 10) { // 10분 단위로 스캔
        let count = 0;
        for (let i = -30; i <= 30; i++) {
          const target = (m + i + 1440) % 1440;
          count += timeFreq[target];
        }
        if (count > maxCount) {
          maxCount = count;
          peakMinute = m;
        }
      }

      if (peakMinute === -1 || maxCount === 0) return;

      const currentMinute = now.getHours() * 60 + now.getMinutes();
      
      // 최고 확률 시간 기준 1시간 ~ 30분 전인지 확인
      let diff = peakMinute - currentMinute;
      if (diff < -720) diff += 1440; // 자정 넘김 처리
      if (diff > 720) diff -= 1440;
      
      // 30분 ~ 60분 전일 때 발송
      if (diff >= 30 && diff <= 60) {
        const peakHour = Math.floor(peakMinute / 60);
        const peakMin = peakMinute % 60;
        const timeStr = `${String(peakHour).padStart(2, '0')}:${String(peakMin).padStart(2, '0')}`;
        
        triggerNativeNotification(
          '[우주하마] 방송 예상 안내',
          `오늘 방송 확률이 가장 높은 시간대(${timeStr})가 다가오고 있습니다!`,
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
