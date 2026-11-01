import fs from 'fs';
import path from 'path';
import { db, hasAdminCredentials } from './_firebase.js';
import { normalizeHistorical, overlayMonthDocs } from '../src/utils/archiveOverlay.js';

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

/** UTC 시각 (끝에 Z) — 서버 시간대와 상관없이 모든 캘린더 앱이 같은 시각으로 표시 */
function formatDateToIcs(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** RFC 5545: 한 줄은 75바이트 이하, 넘으면 줄바꿈 + 공백으로 이어 씀 (구글 캘린더 호환) */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 앞 공백 1바이트
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; }
    cur += ch; curBytes += b;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
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

  if (log.time || log.durationHours) {
    const timeInfo = log.time ? (log.endTime ? `${log.time} ~ ${log.endTime}` : log.time) : '';
    const duration = log.durationHours ? ` (${log.durationHours}시간)` : '';
    descLines.push(`⏰ 방송 시간: ${timeInfo}${duration}`);
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

  const siteOrigin = (!origin || origin.includes('vercel.app')) ? 'https://uzuhama.web.app' : origin;
  descLines.push('');
  descLines.push(`📌 우주하마 방송 예측: ${siteOrigin}`);

  const description = descLines.join('\n');
  // 기록이 추가돼도 바뀌지 않는 고유 ID (순서 번호를 쓰면 구독 캘린더에서 일정이 뒤섞임)
  const stableKey = String((log as any).id || `${(log.time || 'allday').replace(/[^0-9a-z]/gi, '')}-${index}`).replace(/[^0-9A-Za-z_-]/g, '');
  const uid = `uzuhama-${dateStr}-${stableKey}@uzuhama-prediction`;

  let timeFields = '';
  if (log.time) {
    try {
      const [h, m] = log.time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const [y, mon, d] = dateStr.split('-').map(Number);
        // 기록 시각은 한국 시간(KST, UTC+9)
        const startDate = new Date(Date.UTC(y, mon - 1, d, h - 9, m, 0));
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
    // 종일 일정의 끝 날짜는 다음 날 (RFC 5545: DTEND 는 포함하지 않음)
    timeFields = [
      `DTSTART;VALUE=DATE:${dStr}`,
      `DTEND;VALUE=DATE:${nextDay(dateStr)}`
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
  ].map(foldLine).join('\r\n');
}

function parseFirestoreValue(valueObj: any): any {
  if (!valueObj || typeof valueObj !== 'object') return valueObj;
  if ('stringValue' in valueObj) return valueObj.stringValue;
  if ('integerValue' in valueObj) return Number(valueObj.integerValue);
  if ('doubleValue' in valueObj) return Number(valueObj.doubleValue);
  if ('booleanValue' in valueObj) return Boolean(valueObj.booleanValue);
  if ('timestampValue' in valueObj) return valueObj.timestampValue;
  if ('nullValue' in valueObj) return null;
  if ('arrayValue' in valueObj) {
    const arr = valueObj.arrayValue?.values || [];
    return arr.map((item: any) => parseFirestoreValue(item));
  }
  if ('mapValue' in valueObj) {
    const fields = valueObj.mapValue?.fields || {};
    const res: any = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  return valueObj;
}

function parseFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return {};
  const res: any = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    res[k] = parseFirestoreValue(v);
  }
  return res;
}

/**
 * 전체 방송 로그를 수집하여 iCalendar(RFC 5545) 포맷 문자열 생성
 */
export async function buildFullCalendarFeed(origin: string): Promise<string> {
  // 1. 과거 아카이브 JSON (사이트와 같은 원본)
  let historical: Record<string, any> = {};
  try {
    const jsonPath = path.resolve(process.cwd(), 'public/data/historical_logs.json');
    if (fs.existsSync(jsonPath)) historical = normalizeHistorical(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
  } catch (err) {
    console.warn('[Calendar Feed] Historical logs read warning:', err);
  }

  // 2. Firestore logs_by_month (관리자 권한이 있으면 Admin SDK, 없으면 공개 REST)
  //    logs 컬렉션은 읽지 않음 (사이트와 동일: 예전 사본이 섞여 일정이 중복되던 원인)
  const monthDocs: any[] = [];
  let loaded = false;
  if (hasAdminCredentials && db) {
    try {
      const snaps = await db.collection('logs_by_month').get();
      snaps.forEach((d: any) => monthDocs.push(d.data()));
      loaded = true;
    } catch (e) {
      console.warn('[Calendar Feed] Admin SDK read failed, falling back to REST:', e);
    }
  }
  if (!loaded) {
    try {
      const base = 'https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents/logs_by_month';
      let pageToken = '';
      do {
        const r = await fetch(`${base}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) break;
        const json: any = await r.json();
        (json?.documents || []).forEach((doc: any) => monthDocs.push(parseFirestoreDoc(doc)));
        pageToken = json?.nextPageToken || '';
      } while (pageToken);
    } catch (restErr) {
      console.warn('[Calendar Feed] Firestore REST fetch notice:', restErr);
    }
  }

  const logsMap: Record<string, BroadcastLog> = overlayMonthDocs(historical, monthDocs);

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
    'X-WR-RELOAD:PT15M',
  ].map(foldLine).concat([
    ...vevents,
    'END:VCALENDAR'
  ]);

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
    const queryOrigin = req.query?.siteUrl;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    let origin = queryOrigin || (host ? `${proto}://${host}` : 'https://uzuhama.web.app');
    if (!origin || origin.includes('vercel.app')) {
      origin = 'https://uzuhama.web.app';
    }

    const icsContent = await buildFullCalendarFeed(origin);

    // RFC 5545 준수 iCalendar 헤더 설정
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="uzuhama_calendar.ics"');
    // 실시간 동기화를 위해 CDN 및 브라우저 캐시 무효화 (제때제때 새로고침 보장)
    // 구독 캘린더 앱이 자주 불러도 Firestore 를 매번 읽지 않도록 Vercel CDN 에 30분 보관
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).send(icsContent);
  } catch (error: any) {
    console.error('[Calendar Feed Error]:', error);
    return res.status(500).send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Error//EN\r\nEND:VCALENDAR');
  }
}
