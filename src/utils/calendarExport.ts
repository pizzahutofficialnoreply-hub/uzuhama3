import { BroadcastLog } from '../types';
import { parseTimeTo24, formatTimeRange, formatDuration } from '../utils';

/**
 * iCalendar (RFC 5545) 날짜/시간 포맷 (UTC 또는 로컬 날짜 기준)
 * format: YYYYMMDDTHHMMSS
 */
function formatDateToIcs(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatDateOnlyToIcs(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

export interface CalendarEventDetails {
  title: string;
  description: string;
  location: string;
  startDate: Date | null;
  endDate: Date | null;
  isAllDay: boolean;
  dateStr: string;
  url: string;
}

/**
 * BroadcastLog로부터 캘린더 이벤트 상세 정보 구성
 */
export function buildCalendarEventDetails(log: BroadcastLog): CalendarEventDetails {
  const dateStr = log.date; // YYYY-MM-DD
  const gameName = log.games && log.games.length > 0 
    ? log.games.map(g => g.name).join(', ') 
    : (log.game || '생방송');

  const title = `[우주하마] ${gameName}`;
  const location = '치지직 / 유튜브 (우주하마 생방송)';
  const primaryUrl = log.chzzkUrl || log.youtubeUrl || (log.vods && log.vods[0]?.url) || window.location.origin;

  // 설명 본문 구성
  const descLines: string[] = [
    `🎮 게임: ${gameName}`,
    `📅 방송일: ${dateStr}`
  ];

  // 게임 링크 추가 (각 게임별 다운로드/스토어 링크 및 VOD 구간 링크)
  if (log.games && log.games.length > 0) {
    const gamesWithLinks = log.games.filter(g => Boolean(g.link || g.vodUrl));
    if (gamesWithLinks.length > 0) {
      descLines.push('');
      descLines.push('🔗 게임 링크:');
      gamesWithLinks.forEach(g => {
        if (g.link) {
          descLines.push(`- ${g.name} 링크: ${g.link}`);
        }
        if (g.vodUrl) {
          descLines.push(`- ${g.name} 구간 VOD: ${g.vodUrl}`);
        }
      });
    }
  }

  if (log.time || log.durationHours) {
    const timeRange = formatTimeRange(log.time, log.endTime, log.durationHours);
    const duration = log.durationHours ? ` (${formatDuration(log.durationHours)})` : '';
    descLines.push(`⏰ 방송 시간: ${timeRange}${duration}`);
  }

  if (log.category) {
    descLines.push(`📂 카테고리: ${log.category}`);
  }

  descLines.push('');
  descLines.push('📺 다시보기 및 방송 링크:');
  if (log.chzzkUrl) descLines.push(`- 치지직 생방송/다시보기: ${log.chzzkUrl}`);
  if (log.youtubeUrl) descLines.push(`- 유튜브 생방송/다시보기: ${log.youtubeUrl}`);
  if (log.vods && log.vods.length > 0) {
    log.vods.forEach((v, idx) => {
      const vodTitle = v.title ? v.title : `다시보기 영상 ${idx + 1}`;
      descLines.push(`- [풀영상/다시보기] ${vodTitle}: ${v.url}`);
    });
  }

  if (log.edited && log.edited.length > 0) {
    descLines.push('');
    descLines.push('🎬 유튜브 편집 영상:');
    log.edited.forEach((e, idx) => {
      const editTitle = e.title ? e.title : `편집 영상 ${idx + 1}`;
      descLines.push(`- [편집본] ${editTitle}: ${e.url}`);
    });
  }

  if (log.shorts && log.shorts.length > 0) {
    descLines.push('');
    descLines.push('📱 유튜브 쇼츠:');
    log.shorts.forEach((s, idx) => {
      const shortsTitle = s.title ? s.title : `쇼츠 ${idx + 1}`;
      descLines.push(`- [쇼츠] ${shortsTitle}: ${s.url}`);
    });
  }

  descLines.push('');
  descLines.push('우주하마 방송 예측:');
  descLines.push(typeof window !== 'undefined' ? window.location.origin : 'https://uzuhama-prediction.web.app');

  const description = descLines.join('\n');

  // 시작 시간 및 종료 시간 파싱
  let isAllDay = true;
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (log.time && dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const { hour, minute } = parseTimeTo24(log.time);
      startDate = new Date(y, m - 1, d, hour, minute, 0);
      isAllDay = false;

      if (log.endTime) {
        const endObj = parseTimeTo24(log.endTime);
        // 다음 날 새벽으로 넘어가는 경우 (예: 22시 시작, 02시 종료)
        let endDay = d;
        if (endObj.hour < hour) {
          endDay += 1;
        }
        endDate = new Date(y, m - 1, endDay, endObj.hour, endObj.minute, 0);
      } else if (log.durationHours && log.durationHours > 0) {
        const endMs = startDate.getTime() + Math.round(log.durationHours * 60 * 60 * 1000);
        endDate = new Date(endMs);
      } else {
        // 기본 2시간으로 설정
        endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      }
    }
  }

  return {
    title,
    description,
    location,
    startDate,
    endDate,
    isAllDay,
    dateStr,
    url: primaryUrl
  };
}

/**
 * iCalendar (.ics) 파일 문자열 생성
 */
export function generateIcsContent(details: CalendarEventDetails): string {
  const nowStr = formatDateToIcs(new Date());
  const uid = `uzuhama-${details.dateStr}-${Date.now()}@uzuhama-archive`;

  let timeFields = '';
  if (!details.isAllDay && details.startDate && details.endDate) {
    timeFields = [
      `DTSTART:${formatDateToIcs(details.startDate)}`,
      `DTEND:${formatDateToIcs(details.endDate)}`
    ].join('\r\n');
  } else {
    const dStr = formatDateOnlyToIcs(details.dateStr);
    timeFields = [
      `DTSTART;VALUE=DATE:${dStr}`,
      `DTEND;VALUE=DATE:${dStr}`
    ].join('\r\n');
  }

  // 텍스트 이스케이프 (개행, 쉼표, 세미콜론)
  const escapeIcs = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Uzuhama Prediction//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:우주하마 방송 일정',
    'X-WR-TIMEZONE:Asia/Seoul',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    timeFields,
    `SUMMARY:${escapeIcs(details.title)}`,
    `DESCRIPTION:${escapeIcs(details.description)}`,
    `LOCATION:${escapeIcs(details.location)}`,
    `URL:${details.url}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}

/**
 * 기기 캘린더 (.ics) 파일 다운로드 및 실행
 * 모바일(iOS Safari, Android Chrome, Samsung Internet) 및 PWA 환경에서
 * .ics 파일 다운로드 시 네이티브 캘린더 앱(iOS 캘린더, 구글 캘린더 등)이 자동 연동됩니다.
 */
export async function exportToDeviceCalendar(log: BroadcastLog): Promise<boolean> {
  try {
    const details = buildCalendarEventDetails(log);
    const icsContent = generateIcsContent(details);
    const fileName = `uzuhama_${details.dateStr}.ics`;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });

    // 공유 창(Web Share API) 없이 곧바로 기기 캘린더 등록 확인 창(ICS 다운로드 및 기본 캘린더 앱 연동)으로 진입
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.error('Failed to export calendar event:', error);
    return false;
  }
}

/**
 * 복수 개의 이벤트를 하나의 iCalendar (.ics) 파일로 묶어서 생성
 */
export function generateMultipleIcsContent(logs: BroadcastLog[], calendarTitle = '우주하마 방송 일정'): string {
  const nowStr = formatDateToIcs(new Date());

  const escapeIcs = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const vevents: string[] = [];

  logs.forEach((log, index) => {
    try {
      const details = buildCalendarEventDetails(log);
      const uid = `uzuhama-${details.dateStr}-${index}-${Date.now()}@uzuhama-archive`;

      let timeFields = '';
      if (!details.isAllDay && details.startDate && details.endDate) {
        timeFields = [
          `DTSTART:${formatDateToIcs(details.startDate)}`,
          `DTEND:${formatDateToIcs(details.endDate)}`
        ].join('\r\n');
      } else {
        const dStr = formatDateOnlyToIcs(details.dateStr);
        timeFields = [
          `DTSTART;VALUE=DATE:${dStr}`,
          `DTEND;VALUE=DATE:${dStr}`
        ].join('\r\n');
      }

      const eventLines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowStr}`,
        timeFields,
        `SUMMARY:${escapeIcs(details.title)}`,
        `DESCRIPTION:${escapeIcs(details.description)}`,
        `LOCATION:${escapeIcs(details.location)}`,
        `URL:${details.url}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      ];
      vevents.push(eventLines.join('\r\n'));
    } catch (err) {
      console.error('Error generating event for log:', log, err);
    }
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Uzuhama Prediction//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarTitle)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
    ...vevents,
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}

/**
 * 선택한 기간의 방송 목록 전체를 하나의 캘린더 (.ics) 파일로 다운로드 및 기기 연동
 */
export async function exportMultipleToDeviceCalendar(
  logs: BroadcastLog[], 
  rangeText = '일정'
): Promise<boolean> {
  if (!logs || logs.length === 0) return false;

  try {
    const calendarTitle = `우주하마 방송 일정 (${rangeText})`;
    const icsContent = generateMultipleIcsContent(logs, calendarTitle);
    const fileName = `uzuhama_schedule_${rangeText.replace(/[^0-9a-zA-Z가-힣_-]/g, '_')}.ics`;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });

    // 공유 창(Web Share API) 없이 곧바로 기기 캘린더 등록 확인 창(ICS 다운로드 및 기본 캘린더 앱 연동)으로 진입
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.error('Failed to export multiple calendar events:', error);
    return false;
  }
}

/**
 * 구글 캘린더 웹 인텐트 URL 생성
 */
export function getGoogleCalendarUrl(log: BroadcastLog): string {
  const details = buildCalendarEventDetails(log);
  const pad = (n: number) => n.toString().padStart(2, '0');

  let datesParam = '';
  if (!details.isAllDay && details.startDate && details.endDate) {
    datesParam = `${formatDateToIcs(details.startDate)}/${formatDateToIcs(details.endDate)}`;
  } else {
    const dStr = formatDateOnlyToIcs(details.dateStr);
    datesParam = `${dStr}/${dStr}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: details.title,
    dates: datesParam,
    details: details.description,
    location: details.location
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
