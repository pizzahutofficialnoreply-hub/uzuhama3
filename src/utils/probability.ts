import { parseISO, differenceInDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BroadcastLog } from '../types';

/**
 * 당일 방송 통계 및 가우시안 밀도 기반 최고 유력 시간대 산출
 * - 메인 카드, 자세히 보기, 푸시 알림 100% 동일 로직 및 값 적용 (자세히 보기 값으로 완전 통일)
 */
export function calculateTodayPeakMinute(
  logs: BroadcastLog[], 
  currentTime: Date = new Date()
): { peakMinute: number; formattedTime: string; isToday: boolean } | null {
  if (!logs || logs.length === 0) return null;

  const currentDayIndex = currentTime.getDay();
  const timeFreqByDay: { [key: number]: { minute: number; weight: number }[] } = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
  };

  const streamLogs = logs.filter((l) => !l.isAbsence);
  let lastLogDate: Date | null = null;

  streamLogs.forEach((log) => {
    try {
      if (!log.date) return;
      const d = parseISO(log.date);
      const diffDays = differenceInDays(currentTime, d);
      if (diffDays < 0) return;
      // Exponential weight (Lambda ~0.023 -> Half life 30 days)
      const weight = Math.exp(-0.023 * diffDays);

      if (!lastLogDate || d > lastLogDate) lastLogDate = d;

      const dayIdx = d.getDay();
      if (isNaN(dayIdx)) return;

      if (!log.time) return;
      const [h, m] = log.time.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const timeInMins = h * 60 + m;
        timeFreqByDay[dayIdx].push({ minute: timeInMins, weight });
      }
    } catch {}
  });

  // Late End Penalty: If recent stream ended late, apply shift
  let shiftMinutes = 0;
  if (lastLogDate) {
    const lastLog = streamLogs.find(
      (l) => l.date === format(lastLogDate as Date, "yyyy-MM-dd"),
    );
    if (lastLog && !lastLog.isAbsence && lastLog.time) {
      const [h] = lastLog.time.split(":").map(Number);
      if (!isNaN(h)) {
        const endHour = (h + 4) % 24;
        if (endHour >= 3 && endHour <= 7) {
          shiftMinutes = (endHour - 2) * 60;
        }
      }
    }
  }

  const calculateDensity = (
    dayIdx: number,
    targetMinute: number,
    useGlobal: boolean = false
  ) => {
    let density = 0;
    let totalPtsWeight = 0;
    const points = useGlobal
      ? Object.values(timeFreqByDay).reduce((a, b) => a.concat(b), [])
      : timeFreqByDay[dayIdx];
    if (!points || points.length === 0) return 0;

    points.forEach((pt) => {
      let dist = Math.abs(targetMinute - pt.minute);
      if (dist > 720) dist = 1440 - dist;
      density += pt.weight * Math.exp(-(dist * dist) / (2 * 45 * 45)); // 45 min variance
      totalPtsWeight += pt.weight;
    });
    return totalPtsWeight > 0 ? (density / totalPtsWeight) * 100 : 0;
  };

  const findPeaks = (dayIdx: number, useGlobal: boolean = false) => {
    const peaks: { minute: number; density: number }[] = [];
    const windowSize = 60;
    const densities: { minute: number; density: number }[] = [];
    for (let m = 0; m < 1440; m += 5) {
      densities.push({
        minute: m,
        density: calculateDensity(dayIdx, m, useGlobal),
      });
    }

    densities.sort((a, b) => b.density - a.density);

    for (const d of densities) {
      if (d.density < 2) continue;

      let tooClose = false;
      for (const p of peaks) {
        let dist = Math.abs(d.minute - p.minute);
        if (dist > 720) dist = 1440 - dist;
        if (dist < windowSize) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        peaks.push(d);
        if (peaks.length >= 3) break;
      }
    }

    return peaks
      .map((p) => ({
        minute: (p.minute + shiftMinutes) % 1440,
        density: p.density,
      }))
      .sort((a, b) => a.minute - b.minute);
  };

  const todayPeaks = findPeaks(currentDayIndex, true);
  const currentMinuteOfDay =
    (currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes() + 540) % 1440;

  let nextPeak: { minute: number; density: number } | null = null;
  let isToday = true;

  for (const p of todayPeaks) {
    if (p.minute > currentMinuteOfDay) {
      nextPeak = p;
      break;
    }
  }

  if (!nextPeak) {
    const tomorrowIdx = (currentDayIndex + 1) % 7;
    const tomorrowPeaks = findPeaks(tomorrowIdx, true);
    if (tomorrowPeaks.length > 0) {
      nextPeak = tomorrowPeaks[0];
      isToday = false;
    }
  }

  if (!nextPeak) return null;

  // 10분 단위 정규화 (지터 없는 실제 계산 방식 그대로)
  const adjustedMinute = (Math.round(nextPeak.minute / 10) * 10) % 1440;
  const h = Math.floor(adjustedMinute / 60);
  const m = adjustedMinute % 60;

  const targetDate = new Date(currentTime);
  targetDate.setHours(h, m, 0, 0);

  const formattedTime = format(targetDate, 'a h:mm', { locale: ko });

  return {
    peakMinute: adjustedMinute,
    formattedTime,
    isToday
  };
}
