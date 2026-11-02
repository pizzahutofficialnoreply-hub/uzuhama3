import type { BroadcastLog, SystemConfig } from '../types';

/**
 * 방송 켜질 확률 엔진 (메인 카드 · 자세히 보기 · 푸시 알림 공통)
 *
 * 1) 요일 확률     : 최근 60일 같은 요일 방송률을 최근 60일 전체 방송률 쪽으로 축소 보정(베이지안 평활)
 * 2) 방송 간격 보정 : 최근 1년 동안 "마지막 방송 후 N일째"인 날의 실제 방송률 / 평균 방송률 → 로그 오즈로 반영
 * 3) 패턴 보정     : 관리자 휴방 설정, 오늘 이미 방송함 등
 *    → 오늘(방송일 기준 06:00~익일 06:00) 방송할 확률 P
 * 4) 시간대 반영   : 최근 방송 시작 시각 분포 F(t) 로 "아직 안 켰다"는 사실을 조건부 반영
 *    → 남은 시간 동안 켜질 확률 = P·(1−F) / (1 − P·F)
 *
 * 2025-01 ~ 2026-08 실제 기록 백테스트(Brier, 낮을수록 좋음)
 *  - 항상 평균값: 0.250 / 기존 방식(전체40%+60일60%+가감점): 0.242 / 현재 방식: 0.221
 */

export const KST_OFFSET_MIN = 9 * 60;
export const DAY_BOUNDARY_MIN = 6 * 60; // 방송일 경계: 오전 6시
const DAY_MS = 86400000;

const RECENT_WINDOW = 60;
const DOW_SHRINK = 3;
const GAP_WINDOW = 365;
const GAP_HALF_LIFE = 240;
const GAP_CAP = 8;
const GAP_PRIOR = 6;
const TIME_WINDOW = 180;
const TIME_HALF_LIFE = 45;
const TIME_BANDWIDTH = 40;
const ABSENCE_ODDS = 0.15;

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export interface ProbabilityBreakdown {
  /** 메인에 보여줄 최종 확률(%) — 오늘 남은 시간 동안 켜질 확률 */
  finalProb: number;
  /** 다음 2시간 안에 켜질 확률(%) */
  next2hProb: number;
  /** 오늘(방송일) 방송할 확률(%) — 시간대 반영 전 */
  dayProb: number;
  dayName: string;
  weekday: {
    recentCount: number;
    recentOccurrences: number;
    recentRate: number; // %
    recentOverallRate: number; // % (최근 60일 전체 방송률)
    smoothedRate: number; // % (축소 보정된 요일 확률)
    allTimeCount: number;
    allTimeOccurrences: number;
    allTimeRate: number; // % (참고용)
  };
  gap: {
    daysSince: number | null;
    sameGapRate: number; // %
    averageRate: number; // %
    factor: number; // 오즈 배수
  };
  /** 단계별 확률(%) — 자세히 보기 표시용: 요일 → 간격 반영 → 휴방·패턴 반영(=오늘) → 시간대 반영(=최종) */
  steps: { weekday: number; afterGap: number; day: number; final: number };
  pattern: {
    state: 'live' | 'streamedToday' | 'absence' | 'normal' | 'noData';
    factor: number; // 오즈 배수 (1 = 변화 없음)
    label: string;
  };
  time: {
    hasData: boolean;
    sampleCount: number;
    passedShare: number; // % 이미 지나간 시작 시각 비율
    remainingShare: number; // %
    peakMinute: number | null; // 0~1439 (KST 시계 기준)
    peakIsToday: boolean;
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => {
  const q = Math.min(1 - 1e-4, Math.max(1e-4, p));
  return Math.log(q / (1 - q));
};

/** 한국 시간 기준 시각 정보 (기기 시간대와 무관) */
export function kstParts(date: Date) {
  const k = new Date(date.getTime() + KST_OFFSET_MIN * 60000);
  const minute = k.getUTCHours() * 60 + k.getUTCMinutes();
  const dateStr = k.toISOString().slice(0, 10);
  return { dateStr, minute, dow: k.getUTCDay() };
}

const dayNum = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY_MS);
const dowOf = (n: number) => (((n + 4) % 7) + 7) % 7; // 1970-01-01 = 목요일

const parseMinute = (t?: string): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
};

/** 방송일 기준 일자 번호 (새벽 6시 이전 시작은 전날 방송으로 취급) */
const broadcastDayOf = (log: BroadcastLog): number | null => {
  if (!log.date || !/^\d{4}-\d{2}-\d{2}/.test(log.date)) return null;
  const n = dayNum(log.date.slice(0, 10));
  if (isNaN(n)) return null;
  const m = parseMinute(log.time);
  return m !== null && m < DAY_BOUNDARY_MIN ? n - 1 : n;
};

/** 방송일 분(06:00 = 0) */
const toBroadcastMinute = (clockMinute: number) => (clockMinute - DAY_BOUNDARY_MIN + 1440) % 1440;

// 표준정규 CDF (Abramowitz-Stegun)
const normCdf = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

export function isAbsencePeriodActive(system: SystemConfig | undefined, todayStr: string) {
  if (!system?.travelStart) return false;
  const start = system.travelStart.slice(0, 10);
  const end = system.travelEnd ? system.travelEnd.slice(0, 10) : '';
  return todayStr >= start && (!end || todayStr <= end);
}

export function computeBroadcastProbability(
  logs: BroadcastLog[],
  now: Date = new Date(),
  options: { system?: SystemConfig; isLive?: boolean } = {}
): ProbabilityBreakdown {
  const { minute: clockMinute, dateStr: clockDateStr } = kstParts(now);
  const bMinute = toBroadcastMinute(clockMinute);
  const today = dayNum(clockDateStr) - (clockMinute < DAY_BOUNDARY_MIN ? 1 : 0);
  const todayStr = new Date(today * DAY_MS).toISOString().slice(0, 10);
  const todayDow = dowOf(today);

  const streamLogs = (logs || []).filter((l) => l && !l.isAbsence);
  const streamDays = new Set<number>();
  const starts: { day: number; bMinute: number }[] = [];
  let firstDay = Infinity;
  streamLogs.forEach((l) => {
    const d = broadcastDayOf(l);
    if (d === null) return;
    if (d < today || d === today) streamDays.add(d);
    if (d < firstDay) firstDay = d;
    const m = parseMinute(l.time);
    if (m !== null && d <= today) starts.push({ day: d, bMinute: toBroadcastMinute(m) });
  });
  const sorted = [...streamDays].sort((a, b) => a - b);
  const streamedToday = streamDays.has(today);

  // ── 1. 요일 확률 (최근 60일, 오늘 제외) ──
  let recentStreams = 0;
  let recentCount = 0;
  let recentOcc = 0;
  for (let i = 1; i <= RECENT_WINDOW; i++) {
    const d = today - i;
    const s = streamDays.has(d);
    if (s) recentStreams++;
    if (dowOf(d) === todayDow) {
      recentOcc++;
      if (s) recentCount++;
    }
  }
  const recentOverall = recentStreams / RECENT_WINDOW;
  const recentRate = recentOcc ? recentCount / recentOcc : 0;
  const smoothed = (recentCount + DOW_SHRINK * recentOverall) / (recentOcc + DOW_SHRINK);

  // 참고용 전체 기간 요일 통계
  let allOcc = 0;
  let allCount = 0;
  if (isFinite(firstDay)) {
    for (let d = firstDay; d < today; d++) {
      if (dowOf(d) === todayDow) {
        allOcc++;
        if (streamDays.has(d)) allCount++;
      }
    }
  }

  // ── 2. 방송 간격 보정 ──
  const lastBefore = (() => {
    let lo = 0;
    let hi = sorted.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < today) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  })();
  const daysSince = lastBefore >= 0 ? today - sorted[lastBefore] : null;

  const num = new Array(GAP_CAP + 1).fill(0);
  const den = new Array(GAP_CAP + 1).fill(0);
  {
    // 창 시작 직전의 마지막 방송일 찾기
    const startDay = today - GAP_WINDOW;
    let last: number | null = null;
    for (const d of sorted) {
      if (d < startDay) last = d;
      else break;
    }
    for (let x = startDay; x < today; x++) {
      if (last !== null) {
        const g = Math.min(GAP_CAP, x - last);
        const w = Math.pow(0.5, (today - x) / GAP_HALF_LIFE);
        den[g] += w;
        if (streamDays.has(x)) num[g] += w;
      }
      if (streamDays.has(x)) last = x;
    }
  }
  const denTot = den.reduce((a, b) => a + b, 0);
  const avgRate = denTot > 0 ? num.reduce((a, b) => a + b, 0) / denTot : 0.5;
  let sameGap = avgRate;
  if (daysSince !== null && denTot > 0) {
    const gk = Math.min(GAP_CAP, Math.max(1, daysSince));
    sameGap = (num[gk] + GAP_PRIOR * avgRate) / (den[gk] + GAP_PRIOR);
    if (daysSince > GAP_CAP) sameGap *= Math.pow(0.5, (daysSince - GAP_CAP) / 7);
  }
  const gapLogOdds = denTot > 0 ? logit(sameGap) - logit(avgRate) : 0;

  // ── 3. 패턴 보정 ──
  let patternState: ProbabilityBreakdown['pattern']['state'] = 'normal';
  let patternLogOdds = 0;
  let patternLabel = '특이 사항 없음';
  if (options.isLive) {
    patternState = 'live';
    patternLabel = '현재 방송 중';
  } else if (streamedToday) {
    patternState = 'streamedToday';
    patternLabel = '오늘 이미 방송함';
  } else if (isAbsencePeriodActive(options.system, todayStr)) {
    patternState = 'absence';
    patternLogOdds = Math.log(ABSENCE_ODDS);
    patternLabel = '관리자 지정 휴방 기간';
  } else if (sorted.length === 0) {
    patternState = 'noData';
    patternLabel = '방송 기록 없음';
  }

  const dayP =
    patternState === 'live'
      ? 1
      : sigmoid(logit(smoothed) + gapLogOdds + patternLogOdds);

  // ── 4. 시간대 분포 ──
  const pts: { m: number; w: number; sameDow: boolean }[] = [];
  starts.forEach((s) => {
    const age = today - s.day;
    if (age < 0 || age > TIME_WINDOW) return;
    pts.push({ m: s.bMinute, w: Math.pow(0.5, age / TIME_HALF_LIFE), sameDow: dowOf(s.day) === todayDow });
  });
  const hasTime = pts.length >= 3;
  const sameDowCount = pts.filter((p) => p.sameDow).length;
  const blendSame = sameDowCount >= 5 ? 0.3 : 0;
  const weightOf = (p: { w: number; sameDow: boolean }) =>
    p.w * ((1 - blendSame) + (p.sameDow ? blendSame * (pts.length / Math.max(1, sameDowCount)) : 0));
  const fallback = [{ m: toBroadcastMinute(20 * 60), w: 1, sameDow: true }];
  const usePts = hasTime ? pts : fallback;
  const bw = hasTime ? TIME_BANDWIDTH : 120;
  const totalW = usePts.reduce((a, p) => a + weightOf(p), 0) || 1;
  const cdf = (bm: number) =>
    usePts.reduce((a, p) => a + weightOf(p) * (normCdf((bm - p.m) / bw) - normCdf((0 - p.m) / bw)), 0) /
    usePts.reduce((a, p) => a + weightOf(p) * (normCdf((1440 - p.m) / bw) - normCdf((0 - p.m) / bw)), 0);
  const density = (bm: number) =>
    usePts.reduce((a, p) => a + weightOf(p) * Math.exp(-((bm - p.m) ** 2) / (2 * bw * bw)), 0) / totalW;

  const F = Math.min(1, Math.max(0, cdf(bMinute)));
  const F2 = Math.min(1, Math.max(0, cdf(Math.min(1440, bMinute + 120))));

  let finalP: number;
  let next2h: number;
  if (patternState === 'live') {
    finalP = 1;
    next2h = 1;
  } else if (patternState === 'streamedToday') {
    // 하루 두 번 켜는 경우는 기록상 거의 없음
    finalP = Math.min(0.05, dayP * (1 - F) * 0.05);
    next2h = Math.min(finalP, dayP * (F2 - F) * 0.05);
  } else {
    const denom = 1 - dayP * F;
    finalP = denom > 0 ? (dayP * (1 - F)) / denom : 0;
    next2h = denom > 0 ? (dayP * (F2 - F)) / denom : 0;
  }

  // 유력 시간: 남은 시간 중 밀도 최고점, 없으면 내일
  let peak: number | null = null;
  let peakIsToday = true;
  let best = -1;
  for (let m = Math.ceil(bMinute / 5) * 5; m < 1440; m += 5) {
    const d = density(m);
    if (d > best) {
      best = d;
      peak = m;
    }
  }
  const peakTodayStrength = best;
  let maxAll = 0;
  let maxAt = 0;
  for (let m = 0; m < 1440; m += 5) {
    const d = density(m);
    if (d > maxAll) {
      maxAll = d;
      maxAt = m;
    }
  }
  if (peak === null || peakTodayStrength < maxAll * 0.15 || patternState === 'streamedToday') {
    peak = maxAt;
    peakIsToday = false;
  }
  const peakClock = peak === null ? null : (Math.round((peak + DAY_BOUNDARY_MIN) / 10) * 10) % 1440;

  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    steps: {
      weekday: pct(smoothed),
      afterGap: pct(sigmoid(logit(smoothed) + gapLogOdds)),
      day: patternState === 'live' ? 100 : pct(dayP),
      final: patternState === 'live' ? 100 : pct(finalP),
    },
    finalProb: patternState === 'live' ? 100 : Math.min(97, Math.max(1, pct(finalP))),
    next2hProb: patternState === 'live' ? 100 : Math.min(97, Math.max(0, pct(next2h))),
    dayProb: patternState === 'live' ? 100 : Math.min(97, Math.max(1, pct(dayP))),
    dayName: DAY_NAMES[todayDow],
    weekday: {
      recentCount,
      recentOccurrences: recentOcc,
      recentRate: pct(recentRate),
      recentOverallRate: pct(recentOverall),
      smoothedRate: pct(smoothed),
      allTimeCount: allCount,
      allTimeOccurrences: allOcc,
      allTimeRate: allOcc ? pct(allCount / allOcc) : 0,
    },
    gap: {
      daysSince,
      sameGapRate: pct(sameGap),
      averageRate: pct(avgRate),
      factor: Math.round(Math.exp(gapLogOdds) * 100) / 100,
    },
    pattern: {
      state: patternState,
      factor: Math.round(Math.exp(patternLogOdds) * 100) / 100,
      label: patternLabel,
    },
    time: {
      hasData: hasTime,
      sampleCount: pts.length,
      passedShare: pct(F),
      remainingShare: pct(1 - F),
      peakMinute: peakClock,
      peakIsToday,
    },
  };
}

export function formatClockMinute(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}

/**
 * 푸시/실시간 알림용 유력 시간 (메인 카드와 동일 엔진)
 * 오늘 방송 확률이 낮으면(휴방 등) null 을 반환해 불필요한 알림을 막는다.
 */
export function calculateTodayPeakMinute(
  logs: BroadcastLog[],
  currentTime: Date = new Date(),
  system?: SystemConfig,
  minDayProb = 25
): { peakMinute: number; formattedTime: string; isToday: boolean } | null {
  if (!logs || logs.length === 0) return null;
  const r = computeBroadcastProbability(logs, currentTime, { system });
  if (r.time.peakMinute === null) return null;
  if (r.pattern.state === 'streamedToday' || r.dayProb < minDayProb) return null;
  return {
    peakMinute: r.time.peakMinute,
    formattedTime: formatClockMinute(r.time.peakMinute),
    isToday: r.time.peakIsToday,
  };
}

export interface RecentPatternStats {
  windowDays: number;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
  isFallback: boolean; // 최근 60일에 방송이 없어 마지막 방송 직전 60일로 대체했는지
  streamCount: number;
  weeklyAvg: number;
  prevWeeklyAvg: number | null; // 그 이전 60일
  byDow: { day: string; count: number; occurrences: number; rate: number }[];
  topDays: string[];
  bottomDay: string | null;
  typicalStart: string | null; // 시작 시각 중앙값
  nextDayRate: { afterOne: number | null; afterTwo: number | null; afterLong: number | null; samples: { one: number; two: number; long: number } };
}

/** 예측 가이드용 최근 60일 패턴 요약 (확률 엔진과 같은 방송일 기준 사용) */
export function computeRecentPatternStats(
  logs: BroadcastLog[],
  now: Date = new Date(),
  windowDays = RECENT_WINDOW,
  allowFallback = false
): RecentPatternStats {
  const { minute, dateStr } = kstParts(now);
  const today = dayNum(dateStr) - (minute < DAY_BOUNDARY_MIN ? 1 : 0);
  const byDay = new Map<number, { minute: number | null; duration: number }>();
  (logs || []).forEach((l) => {
    if (!l || l.isAbsence) return;
    const d = broadcastDayOf(l);
    if (d === null || d > today) return;
    const prev = byDay.get(d);
    const m = parseMinute(l.time);
    byDay.set(d, {
      minute: prev?.minute ?? m,
      duration: Math.max(prev?.duration || 0, Number(l.durationHours) || 0),
    });
  });
  const days = [...byDay.keys()].sort((a, b) => a - b);

  let end = today; // 오늘 포함 직전까지
  let start = end - windowDays + 1;
  let inWindow = days.filter((d) => d >= start && d <= end);
  let isFallback = false;
  if (allowFallback && inWindow.length === 0 && days.length > 0) {
    isFallback = true;
    end = days[days.length - 1];
    start = end - windowDays + 1;
    inWindow = days.filter((d) => d >= start && d <= end);
  }
  const prevCount = days.filter((d) => d >= start - windowDays && d < start).length;
  const hasPrev = days.length > 0 && days[0] < start;

  const byDow = DAY_NAMES.map((day) => ({ day, count: 0, occurrences: 0, rate: 0 }));
  for (let d = start; d <= end; d++) {
    const w = byDow[dowOf(d)];
    w.occurrences++;
    if (byDay.has(d)) w.count++;
  }
  byDow.forEach((w) => (w.rate = w.occurrences ? Math.round((w.count / w.occurrences) * 1000) / 10 : 0));
  const ranked = [...byDow].filter((w) => w.count > 0).sort((a, b) => b.rate - a.rate || b.count - a.count);
  const topDays = ranked.slice(0, 2).map((w) => w.day);
  const bottomDay = inWindow.length ? [...byDow].sort((a, b) => a.rate - b.rate || a.count - b.count)[0].day : null;

  const mins = inWindow.map((d) => byDay.get(d)!.minute).filter((m): m is number => m !== null).map(toBroadcastMinute).sort((a, b) => a - b);
  const typicalStart = mins.length
    ? formatClockMinute((Math.round((mins[Math.floor(mins.length / 2)] + DAY_BOUNDARY_MIN) / 10) * 10) % 1440)
    : null;

  // 다음 날 방송률 (창 안에서 다음 날도 창 안인 경우만)
  let one = 0, oneNext = 0, two = 0, twoNext = 0, long = 0, longNext = 0;
  inWindow.forEach((d) => {
    if (d + 1 > end) return;
    const next = byDay.has(d + 1);
    if (!byDay.has(d - 1)) { one++; if (next) oneNext++; }
    else { two++; if (next) twoNext++; }
    if ((byDay.get(d)!.duration || 0) >= 3) { long++; if (next) longNext++; }
  });
  const rate = (n: number, k: number) => (n >= 3 ? Math.round((k / n) * 100) : null);
  const iso = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

  return {
    windowDays,
    windowStart: iso(start),
    windowEnd: iso(end),
    isFallback,
    streamCount: inWindow.length,
    weeklyAvg: Math.round((inWindow.length / windowDays) * 7 * 10) / 10,
    prevWeeklyAvg: hasPrev ? Math.round((prevCount / windowDays) * 7 * 10) / 10 : null,
    byDow,
    topDays,
    bottomDay,
    typicalStart,
    nextDayRate: { afterOne: rate(one, oneNext), afterTwo: rate(two, twoNext), afterLong: rate(long, longNext), samples: { one, two, long } },
  };
}

/** 방송일(오전 6시 기준) YYYY-MM-DD */
export function broadcastDayStr(now: Date = new Date()): string {
  const { minute, dateStr } = kstParts(now);
  if (minute >= DAY_BOUNDARY_MIN) return dateStr;
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** 상태 문구용 휴방 사유 텍스트 (휴방 기간이 아니면 빈 문자열) */
export function absenceReasonForMessages(system: SystemConfig | undefined, now: Date = new Date()): string {
  if (!system || !isAbsencePeriodActive(system, broadcastDayStr(now))) return '';
  const s: any = system;
  const reason = s.absenceReason || '';
  if (reason === '기타 (직접 입력)' || reason === '직접 입력') return String(s.customAbsenceReason || '').trim();
  if (reason === '병명') return String(s.illnessName || s.diseaseName || '건강 문제').trim();
  return String(reason).trim();
}

/** AI 상태 문구 묶음 키: 방송일이 바뀌거나 휴방 상황·사유가 바뀌면 새 묶음 */
export function statusMessageKey(system: SystemConfig | undefined, now: Date = new Date()): string {
  return `v5|${broadcastDayStr(now)}|${absenceReasonForMessages(system, now)}`;
}
