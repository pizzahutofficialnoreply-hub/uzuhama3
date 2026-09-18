import fs from 'fs';
import path from 'path';
import { db } from './_firebase.js';

interface GameItem {
  name: string;
  category?: string;
  link?: string;
  vodUrl?: string;
}

interface VodItem {
  title?: string;
  url: string;
}

interface BroadcastLog {
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm or similar
  endTime?: string;
  durationHours?: number;
  game?: string;
  games?: GameItem[];
  category?: string;
  chzzkUrl?: string;
  youtubeUrl?: string;
  vods?: VodItem[];
  edited?: VodItem[];
  shorts?: VodItem[];
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateToIcs(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatDateOnlyToIcs(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function escapeIcs(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

/**
 * BroadcastLog를 VEVENT 문자열로 변환
 */
function logToVEvent(log: BroadcastLog, nowStr: string, index: number, origin: string): string {
  const dateStr = log.date;
  const gameName = log.games && log.games.length > 0
    ? log.games.map(g => g.name).join(', ')
    : (log.game || '생방송');

  const title = `[우주하마] ${gameName}`;
  const location = '치지직 / 유튜브 (우주하마 생방송)';
  const primaryUrl = log.chzzkUrl || log.youtubeUrl || (log.vods && log.vods[0]?.url) || origin;

  // 본문 설명 구성 (기록 추가와 완전히 동일한 포맷으로 구성)
  const descLines: string[] = [
    `🎮 게임: ${gameName}`,
    `📅 방송일: ${dateStr}`
  ];

  if (log.games && log.games.length > 0) {
    const withLinks = log.games.filter(g => Boolean(g.link || g.vodUrl));
    if (withLinks.length > 0) {
      descLines.push('');
      descLines.push('🔗 게임 링크:');
      withLinks.forEach(g => {
        if (g.link) descLines.push(`- ${g.name} 링크: ${g.link}`);
        if (g.vodUrl) descLines.push(`- ${g.name} 구간 VOD: ${g.vodUrl}`);
      });
    }
  }

  if (log.time || log.durationHours) {
    const timeInfo = log.time ? (log.endTime ? `${log.time} ~ ${log.endTime}` : log.time) : '';
    const duration = log.durationHours ? ` (${log.durationHours}시간)` : '';
    descLines.push(`⏰ 방송 시간: ${timeInfo}${duration}`);
  }

  if (log.category) {
    descLines.push(`📂 카테고리: ${log.category}`);
  }

  descLines.push('');
  descLines.push('📺 다시보기 및 방송 링크:');
  if (log.chzzkUrl) descLines.push(`- 치지직 생방송/다시보기: ${log.chzzkUrl}`);
  if (log.youtubeUrl) descLines.push(`- 유튜브 생방송/다시보기: ${log.youtubeUrl}`);
  if (log.vods && log.vods.length > 0) {
    log.vods.forEach((v, i) => {
      descLines.push(`- [풀영상/다시보기] ${v.title || `다시보기 ${i + 1}`}: ${v.url}`);
    });
  }
  if (log.edited && log.edited.length > 0) {
    descLines.push('');
    descLines.push('🎬 유튜브 편집 영상:');
    log.edited.forEach((e, i) => {
      descLines.push(`- [편집본] ${e.title || `편집 영상 ${i + 1}`}: ${e.url}`);
    });
  }
  if (log.shorts && log.shorts.length > 0) {
    descLines.push('');
    descLines.push('📱 유튜브 쇼츠:');
    log.shorts.forEach((s, i) => {
      descLines.push(`- [쇼츠] ${s.title || `쇼츠 ${i + 1}`}: ${s.url}`);
    });
  }

  descLines.push('');
  descLines.push(`📌 우주하마 방송 통계: ${origin}`);

  const description = descLines.join('\n');
  const uid = `uzuhama-${dateStr}-${index}@uzuhama-prediction`;

  let timeFields = '';
  if (log.time) {
    try {
      const [h, m] = log.time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const [y, mon, d] = dateStr.split('-').map(Number);
        const startDate = new Date(y, mon - 1, d, h, m, 0);
        let durationMins = (log.durationHours && !isNaN(log.durationHours)) ? Math.round(log.durationHours * 60) : 180;
        const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);
        timeFields = [
          `DTSTART:${formatDateToIcs(startDate)}`,
          `DTEND:${formatDateToIcs(endDate)}`
        ].join('\r\n');
      }
    } catch {}
  }

  if (!timeFields) {
    const dStr = formatDateOnlyToIcs(dateStr);
    timeFields = [
      `DTSTART;VALUE=DATE:${dStr}`,
      `DTEND;VALUE=DATE:${dStr}`
    ].join('\r\n');
  }

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    timeFields,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    `URL:${primaryUrl}`,
    'STATUS:CONFIRMED',
    'END:VEVENT'
  ].join('\r\n');
}

/**
 * 전체 방송 로그를 수집하여 iCalendar(RFC 5545) 포맷 문자열 생성
 */
export async function buildFullCalendarFeed(origin: string): Promise<string> {
  const logsMap: Record<string, BroadcastLog> = {};

  // 1. 과거 아카이브 파일 로드
  try {
    const jsonPath = path.resolve(process.cwd(), 'public/data/historical_logs.json');
    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(logsMap, parsed);
      }
    }
  } catch (err) {
    console.warn('[Calendar Feed] Historical logs read warning:', err);
  }

  // 2. Firestore 실시간 데이터 수집 (logs_by_month 및 logs 컬렉션)
  try {
    if (db) {
      const snaps = await db.collection('logs_by_month').get();
      if (!snaps.empty) {
        snaps.forEach(docSnap => {
          const data = docSnap.data();
          if (data?.items && typeof data.items === 'object') {
            Object.assign(logsMap, data.items);
          }
          Object.entries(data || {}).forEach(([key, val]) => {
            if (key !== 'month' && key !== 'updatedAt' && key !== 'items' && val && typeof val === 'object' && (val as any).date) {
              logsMap[key] = val as BroadcastLog;
            }
          });
        });
      }

      // 실시간으로 새로 추가된 최신 개별 로그도 즉시 병합
      try {
        const directLogsSnap = await db.collection('logs').get();
        if (!directLogsSnap.empty) {
          directLogsSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data && data.date) {
              logsMap[docSnap.id] = data as BroadcastLog;
            }
          });
        }
      } catch (directErr) {
        console.warn('[Calendar Feed] direct logs read notice:', directErr);
      }
    }
  } catch (err) {
    console.warn('[Calendar Feed] Firestore logs read notice:', err);
  }

  // 3. 로그 정렬 (첫 데이터부터 마지막 데이터까지 전체 수집)
  const logsList = Object.values(logsMap).filter(l => Boolean(l && l.date));
  logsList.sort((a, b) => b.date.localeCompare(a.date));

  // 사용자의 요청대로 첫 데이터부터 마지막 데이터까지 100% 온전히 캘린더에 전달
  const targetLogs = logsList;

  const nowStr = formatDateToIcs(new Date());
  const vevents = targetLogs.map((log, idx) => logToVEvent(log, nowStr, idx, origin));

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Uzuhama Broadcast Prediction//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:우주하마 방송 일정',
    'X-WR-CALDESC:우주하마 생방송 및 다시보기 자동 동기화 캘린더',
    'X-WR-TIMEZONE:Asia/Seoul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...vevents,
    'END:VCALENDAR'
  ];

  return icsLines.join('\r\n');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'uzuhama.vercel.app';
    const origin = `${proto}://${host}`;

    const icsContent = await buildFullCalendarFeed(origin);

    // RFC 5545 준수 iCalendar 헤더 설정
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="uzuhama_calendar.ics"');
    // 실시간 동기화를 위해 짧은 캐시 주기 및 재검증 허용
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

    return res.status(200).send(icsContent);
  } catch (error: any) {
    console.error('[Calendar Feed Error]:', error);
    return res.status(500).send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Error//EN\r\nEND:VCALENDAR');
  }
}
