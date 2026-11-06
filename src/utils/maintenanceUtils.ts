import { SystemConfig } from '../types';

/**
 * 안전한 날짜/시간 문자열 밀리초 파싱 함수
 * 공백 구분자 ("YYYY-MM-DD HH:mm"), ISO 문자열, 로컬 문자열 등을 브라우저 편차 없이 안전하게 변환합니다.
 */
export function parseDateSafe(dateInput?: string | Date | number): number {
  if (!dateInput) return 0;
  if (typeof dateInput === 'number') return dateInput;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? 0 : dateInput.getTime();
  
  const trimmed = String(dateInput).trim();
  if (!trimmed) return 0;
  
  // "YYYY-MM-DD HH:mm" 형태의 공백을 'T'로 정규화 (Safari/iOS 호환성 확보)
  const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
  let d = new Date(normalized);
  if (!isNaN(d.getTime())) return d.getTime();

  // 대시를 슬래시로 변경한 형식 시도
  const slashNormalized = normalized.replace(/-/g, '/');
  d = new Date(slashNormalized);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

/**
 * 한국 표준시(KST, UTC+9) 기준 Date 객체 정보 도출
 */
export function getKSTDate(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  dayOfWeek: number; // 0=일, 1=월, ...
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  dayOfWeekKorean: string;
} {
  // UTC+9 밀리초 변환
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const kstTime = new Date(utc + (9 * 60 * 60 * 1000));

  const year = kstTime.getFullYear();
  const month = kstTime.getMonth() + 1;
  const day = kstTime.getDate();
  const hours = kstTime.getHours();
  const minutes = kstTime.getMinutes();
  const dayOfWeek = kstTime.getDay();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  return {
    year,
    month,
    day,
    hours,
    minutes,
    dayOfWeek,
    dateStr: `${year}-${pad(month)}-${pad(day)}`,
    timeStr: `${pad(hours)}:${pad(minutes)}`,
    dayOfWeekKorean: dayNames[dayOfWeek]
  };
}

/**
 * KST 기준 날짜/시간 포맷: "2026. 9. 12 (토) 10:00"
 */
export function formatKSTDateTime(dateInput: string | Date, includeDayOfWeek = true): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const kst = getKSTDate(d);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dayPart = includeDayOfWeek ? ` (${kst.dayOfWeekKorean})` : '';

  return `${kst.year}. ${kst.month}. ${kst.day}${dayPart} ${pad(kst.hours)}:${pad(kst.minutes)}`;
}

/**
 * 점검 시작/종료 시간 범위 문자열 생성
 * 같은 날짜: "2026. 9. 12 (토) 10:00 ~ 16:00 (KST)"
 * 다른 날짜: "2026. 9. 12 (토) 22:00 ~ 2026. 9. 13 (일) 04:00 (KST)"
 */
export function formatMaintenanceRange(startStr?: string, endStr?: string): {
  fullText: string;
  isDifferentDay: boolean;
  durationText: string;
} {
  if (!startStr && !endStr) return { fullText: '', isDifferentDay: false, durationText: '' };
  if (!endStr) return { fullText: `${formatKSTDateTime(startStr!)} ~ (종료 미정) (KST)`, isDifferentDay: false, durationText: '' };
  if (!startStr) return { fullText: `~ ${formatKSTDateTime(endStr)} (KST)`, isDifferentDay: false, durationText: '' };

  const startD = new Date(startStr);
  const endD = new Date(endStr);

  const startKst = getKSTDate(startD);
  const endKst = getKSTDate(endD);
  const pad = (n: number) => n.toString().padStart(2, '0');

  const diffMs = endD.getTime() - startD.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const durationText = diffHours > 0 
    ? (diffHours % 1 === 0 ? `약 ${diffHours}시간` : `약 ${diffHours.toFixed(1)}시간`)
    : '';

  const isDifferentDay = startKst.dateStr !== endKst.dateStr;

  let fullText = '';
  if (isDifferentDay) {
    fullText = `${startKst.year}. ${startKst.month}. ${startKst.day} (${startKst.dayOfWeekKorean}) ${pad(startKst.hours)}:${pad(startKst.minutes)} ~ ${endKst.year}. ${endKst.month}. ${endKst.day} (${endKst.dayOfWeekKorean}) ${pad(endKst.hours)}:${pad(endKst.minutes)} (KST)`;
  } else {
    fullText = `${startKst.year}. ${startKst.month}. ${startKst.day} (${startKst.dayOfWeekKorean}요일) ${pad(startKst.hours)}:${pad(startKst.minutes)} ~ ${pad(endKst.hours)}:${pad(endKst.minutes)} (KST)`;
  }

  return { fullText, isDifferentDay, durationText };
}

/**
 * 당일 0시 (KST) 타임스탬프 계산
 */
export function getKSTStartOfDay(dateInput: string | Date): number {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const kst = getKSTDate(d);
  // YYYY-MM-DDT00:00:00+09:00의 UTC 타임스탬프
  return new Date(`${kst.dateStr}T00:00:00+09:00`).getTime();
}

/**
 * 완료 익일 0시 (KST) 타임스탬프 계산
 * 예: 2026-09-12 16:00에 점검 완료 -> 익일 0시는 2026-09-13 00:00:00+09:00
 */
export function getKSTNextDayMidnight(dateInput: string | Date): number {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const startOfDay = getKSTStartOfDay(d);
  return startOfDay + (24 * 60 * 60 * 1000);
}

/**
 * 점검 공지 본문 기본 마크다운 템플릿 생성
 */
export function generateMaintenanceNoticeMarkdown(options: {
  startStr: string;
  endStr: string;
  scope?: string;
  impact?: string;
  noticeGuide?: string;
  durationNote?: string;
  status?: string;
  note?: string;
  history?: Array<{ time: string; event: string }>;
}): string {
  const { 
    startStr, 
    endStr, 
    scope = '사이트 전체', 
    impact = '점검 시간 동안 **서비스에 접속 불가해요.**',
    noticeGuide = '점검 완료 및 변경사항 발생 시 본 공지에 업데이트할 거예요.',
    durationNote = '(상황에 따라 변동/연장될 수 있어요)',
    status = '점검 진행 중', 
    note = '없음', 
    history 
  } = options;
  const { fullText, durationText } = formatMaintenanceRange(startStr, endStr);

  const defaultHistory = history && history.length > 0
    ? history.map(h => `- ${h.time} — ${h.event}`).join('\n')
    : `- ${formatKSTDateTime(startStr, false)} — 점검 시작\n- ${formatKSTDateTime(endStr, false)} — 점검 종료 예정`;

  return `## 점검 공지

안녕하세요. 서비스 안정화를 위해 아래와 같이 점검을 진행해요.

### 1) 점검 일정

- **일시**: ${fullText}
- **소요 시간**: ${durationText || '약 6시간'} ${durationNote}

### 2) 서비스 영향도

- ${impact}
- 영향 범위: ${scope}

### 3) 점검 안내

- ${noticeGuide}

---

### 진행 상태

- **현재 상태: ${status}**
- **특이 사항: ${note}**

---

## 변경 이력

${defaultHistory}`;
}

/**
 * 점검 완료 요약 공지 기본 마크다운 템플릿 생성
 */
export function generateCompletedNoticeMarkdown(options: {
  startStr: string;
  endStr: string;
  changes?: string[];
}): string {
  const { startStr, endStr, changes } = options;
  const { fullText } = formatMaintenanceRange(startStr, endStr);

  const changeList = changes && changes.length > 0
    ? changes.map(c => `    - ${c}`).join('\n')
    : `    - 데이터베이스 점검 및 최적화\n    - 서버 연동 점검\n    - 서비스 코드 수정 및 테스트`;

  return `### 점검 완료
- **점검 시간**: ${fullText}
- **변경 사항**
${changeList}`;
}

/**
 * 정기점검 설정에 따라 다음 점검 시작/종료 일시 계산
 * intervalWeeks: 1 (매주), 2 (격주), etc.
 * dayOfWeek: 0(일) ~ 6(토)
 * startTime: "10:00"
 * endTime: "16:00"
 */
export function calculateNextRecurringMaintenance(config: {
  intervalWeeks: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): { nextStart: string; nextEnd: string } {
  const now = new Date();
  const kstNow = getKSTDate(now);

  const targetDay = config.dayOfWeek % 7;
  let daysUntil = (targetDay - kstNow.dayOfWeek + 7) % 7;

  // 만약 오늘이 점검 요일인데 이미 시작 시간이 지났으면 다음 주기로 넘김
  const [startH, startM] = config.startTime.split(':').map(Number);
  if (daysUntil === 0) {
    if (kstNow.hours > startH || (kstNow.hours === startH && kstNow.minutes >= (startM || 0))) {
      daysUntil = (config.intervalWeeks || 1) * 7;
    }
  }

  const targetDate = new Date(now.getTime() + (daysUntil * 24 * 60 * 60 * 1000));
  const targetKst = getKSTDate(targetDate);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const [endH, endM] = config.endTime.split(':').map(Number);

  const nextStart = `${targetKst.dateStr}T${pad(startH)}:${pad(startM || 0)}`;
  const nextEnd = `${targetKst.dateStr}T${pad(endH)}:${pad(endM || 0)}`;

  return { nextStart, nextEnd };
}

/**
 * 점검 라이프사이클 상태 검사
 */
export function checkMaintenanceStatus(system?: SystemConfig, currentTimeMs?: number): {
  isScheduledToday: boolean; // 당일 0시부터 점검 시작 전
  isInProgress: boolean;     // 점검 진행 중
  isCompletedRecently: boolean; // 완료 후 익일 0시 이전
  upcomingNoticeText: string;
  completedNoticeMarkdown: string;
} {
  const empty = {
    isScheduledToday: false,
    isInProgress: false,
    isCompletedRecently: false,
    upcomingNoticeText: '',
    completedNoticeMarkdown: ''
  };

  if (!system) return empty;

  const nowMs = typeof currentTimeMs === 'number' && !isNaN(currentTimeMs) ? currentTimeMs : Date.now();
  const { maintenance, maintenanceStart, maintenanceEnd, maintenanceChanges } = system;

  if (!maintenanceStart && !maintenanceEnd && !maintenance) {
    return empty;
  }

  const startMs = parseDateSafe(maintenanceStart);
  const endMs = parseDateSafe(maintenanceEnd);

  // 1. 점검 진행 중인지 확인 (수동 ON이거나, 예약 시작 일시 도달 시 자동 시작)
  let isInProgress = false;
  if (maintenance) {
    if (startMs && nowMs < startMs) {
      isInProgress = false;
    } else if (endMs && nowMs >= endMs) {
      isInProgress = false;
    } else {
      isInProgress = true;
    }
  } else {
    // 수동 maintenance 스위치가 false여도 시작 일시가 도래했고 종료 일시 전이면 자동 점검 시작
    if (startMs && nowMs >= startMs && (!endMs || nowMs < endMs)) {
      isInProgress = true;
    }
  }

  // 2. 당일 0시(KST)부터 점검 시작 전 사전 안내 확인
  let isScheduledToday = false;
  let upcomingNoticeText = '';
  if (startMs && nowMs < startMs) {
    const todayMidnight = getKSTStartOfDay(maintenanceStart);
    if (nowMs >= todayMidnight) {
      isScheduledToday = true;
      const { fullText } = formatMaintenanceRange(maintenanceStart, maintenanceEnd);
      upcomingNoticeText = `⚠️ 잠시 후 ${fullText} 에 시스템 점검이 시작될 예정이에요. 점검 시간 동안 사이트에 들어올 수 없으니 이용에 참고해 주세요.`;
    }
  }

  // 3. 점검 완료 후 익일 0시까지인지 확인
  let isCompletedRecently = false;
  let completedNoticeMarkdown = '';
  if (endMs && nowMs >= endMs) {
    const nextDayMidnight = getKSTNextDayMidnight(maintenanceEnd);
    if (nowMs < nextDayMidnight) {
      isCompletedRecently = true;
      completedNoticeMarkdown = generateCompletedNoticeMarkdown({
        startStr: maintenanceStart || '',
        endStr: maintenanceEnd || '',
        changes: maintenanceChanges
      });
    }
  }

  return {
    isScheduledToday,
    isInProgress,
    isCompletedRecently,
    upcomingNoticeText,
    completedNoticeMarkdown
  };
}

/**
 * 정기 점검 자동 켜기: 관리자가 '정기 점검'을 켜 두면(autoApply), 매 주기 그 시간에 저절로 점검 화면이 뜨고
 * 당일 0시부터 예고, 끝난 날 밤 12시까지 완료 안내가 나옴 (관리자가 매번 버튼을 누르지 않아도 됨)
 * - 직접 넣은 점검 일정(maintenanceStart/End)이 아직 안 끝났으면 그것이 우선
 * - 서버에 쓰지 않고 화면에서 계산 (Firestore 읽기·쓰기 없음)
 */
export function recurringMaintenanceWindow(
  rec: NonNullable<SystemConfig['recurringMaintenance']> & { anchorDate?: string },
  nowMs: number
): { start: string; end: string } | null {
  if (!rec?.enabled || rec.autoApply === false) return null;
  const interval = Math.max(1, Number(rec.intervalWeeks) || 1);
  const dow = ((Number(rec.dayOfWeek ?? 6) % 7) + 7) % 7;
  const [sh, sm] = String(rec.startTime || '10:00').split(':').map(Number);
  const [eh, em] = String(rec.endTime || '16:00').split(':').map(Number);
  const pad = (n: number) => String(n || 0).padStart(2, '0');
  const DAY = 86400000;
  // 격주 등은 기준 주(anchorDate 가 속한 주)부터 interval 주마다
  const anchorMs = Date.parse(`${rec.anchorDate || '2026-01-04'}T00:00:00+09:00`);
  const anchorWeek = Math.floor((anchorMs + 9 * 3600000 - 3 * DAY) / (7 * DAY)); // 일요일 시작 주 번호
  const windows: { s: number; e: number; date: string }[] = [];
  const todayKst = new Date(nowMs + 9 * 3600000);
  for (let off = -7 * interval - 1; off <= 7 * interval + 7; off++) {
    const d = new Date(Date.UTC(todayKst.getUTCFullYear(), todayKst.getUTCMonth(), todayKst.getUTCDate() + off));
    if (d.getUTCDay() !== dow) continue;
    const week = Math.floor((d.getTime() - 3 * DAY) / (7 * DAY));
    if (((week - anchorWeek) % interval + interval) % interval !== 0) continue;
    const date = d.toISOString().slice(0, 10);
    const s = Date.parse(`${date}T${pad(sh)}:${pad(sm)}:00+09:00`);
    let e = Date.parse(`${date}T${pad(eh)}:${pad(em)}:00+09:00`);
    if (e <= s) e += DAY; // 자정을 넘기는 점검
    windows.push({ s, e, date });
  }
  windows.sort((a, b) => a.s - b.s);
  const fmt = (ms: number) => {
    const k = new Date(ms + 9 * 3600000);
    return `${k.toISOString().slice(0, 10)}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:00+09:00`;
  };
  // 진행 중이거나, 끝난 날 밤 12시 전이면 그 회차 / 아니면 다음 회차
  for (const w of windows) {
    const nextMidnight = Date.parse(`${new Date(w.e + 9 * 3600000).toISOString().slice(0, 10)}T00:00:00+09:00`) + DAY;
    if (nowMs < nextMidnight) return { start: fmt(w.s), end: fmt(w.e) };
  }
  return null;
}

export function effectiveMaintenanceSystem(system: SystemConfig | undefined, nowMs: number = Date.now()): SystemConfig | undefined {
  if (!system?.recurringMaintenance) return system;
  const manualEnd = parseDateSafe(system.maintenanceEnd);
  const manualStart = parseDateSafe(system.maintenanceStart);
  // 직접 넣은 일정이 아직 살아 있으면(안 끝났거나 오늘 끝남) 그대로
  if ((manualStart || manualEnd) && (!manualEnd || nowMs < getKSTNextDayMidnight(system.maintenanceEnd!))) return system;
  if (system.maintenance) return system;
  const w = recurringMaintenanceWindow(system.recurringMaintenance as any, nowMs);
  if (!w) return system;
  return { ...system, maintenanceStart: w.start, maintenanceEnd: w.end };
}
