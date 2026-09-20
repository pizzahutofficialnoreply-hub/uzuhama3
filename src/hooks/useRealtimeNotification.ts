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
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      // 이미 오늘 발송했는지 확인 (하루 1회 제한)
      const lastSentDate = localStorage.getItem(DAILY_NOTIF_KEY);
      if (lastSentDate === todayStr) return;

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

      const currentDayIdx = now.getDay();
      
      // 오늘 요일의 방송 시작 시간 통계 분석
      const timeFreq = Array(1440).fill(0);
      let validLogCount = 0;
      logs.forEach(log => {
        if (log.isAbsence) return;
        const d = new Date(log.date);
        if (isNaN(d.getTime()) || d.getDay() !== currentDayIdx) return;
        
        if (log.time) {
          const [h, m] = log.time.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            timeFreq[h * 60 + m] += 1;
            validLogCount++;
          }
        }
      });

      if (validLogCount === 0) return;

      // 당일 방송 확률이 가장 높은 단 1개의 최적 시간대(1시간 윈도우) 자동 선별
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
      
      // 최고 확률 시간 기준 남은 시간 계산
      let diff = peakMinute - currentMinute;
      if (diff < -720) diff += 1440; // 자정 넘김 처리
      if (diff > 720) diff -= 1440;
      
      // 유저가 설정한 사전 알림 시점 (예: 30분 전) 도달 여부 확인 (오차범위 ±5분)
      const minDiff = Math.max(5, leadTime - 5);
      const maxDiff = leadTime + 5;

      if (diff >= minDiff && diff <= maxDiff) {
        const peakHour = Math.floor(peakMinute / 60);
        const peakMin = peakMinute % 60;
        const timeStr = `${String(peakHour).padStart(2, '0')}:${String(peakMin).padStart(2, '0')}`;
        
        const title = '우주하마 방송 예측';
        const body = leadTime > 0
          ? `오늘 방송 확률이 가장 높은 시간대(${timeStr})가 약 ${leadTime}분 후 시작될 예정입니다.`
          : `오늘 방송 확률이 가장 높은 시간대(${timeStr})입니다!`;

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
