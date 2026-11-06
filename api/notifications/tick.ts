import { setCorsHeaders } from '../_cors.js';
import { sendPush, loadSubscriptions, matchesLiveKeywords } from '../_push.js';
import {
  computeBroadcastProbability,
  formatClockMinute,
  kstParts,
  DAY_BOUNDARY_MIN,
} from '../../src/utils/probability.js';

/**
 * 자동 알림 점검 엔드포인트 (GET/POST /api/notifications/tick)
 *
 * 1~5분마다 외부에서 호출만 해주면 됨 (cron-job.org, GitHub Actions, 앱 접속자 핑 등).
 * - 비밀값 없이 호출해도 안전하도록: 50초 이내 재호출은 무시하고, 같은 이벤트는 한 번만 발송(중복 방지 기록)
 * - 방송 시작: 치지직 상태가 OPEN 이고 이번 방송(openDate)에 대해 아직 안 보냈으면 notifyLive 구독자에게 발송
 * - 유력 시간: 메인 카드와 같은 확률 엔진으로 오늘 유력 시간을 계산, 구독자별 사전 알림(leadTime) 시점에 발송
 * - 방송 종료: 방송 기록 자동 생성 (관리자 기록이 이미 있으면 건너뜀)
 */

const CHANNEL_ID = 'c6e1c8cf1b128bd321cc2684c92b5a00';
const CHZZK_URL = `https://api.chzzk.naver.com/service/v2/channels/${CHANNEL_ID}/live-detail`;
const MIN_INTERVAL_MS = 50_000;
const LIVE_NOTIFY_MAX_AGE_MIN = 40; // 방송 시작 후 이 시간이 지나 처음 감지하면 시작 알림은 생략
const PEAK_MIN_DAY_PROB = 25; // 오늘 방송 확률이 이보다 낮으면(휴방 등) 유력 시간 알림 생략
const PEAK_WINDOW_MIN = 15; // 호출 간격이 들쭉날쭉해도 놓치지 않도록 사전 알림 시점부터 15분 안에 한 번 발송

const kstDateTimeToMs = (s: string) => Date.parse(`${s.replace(' ', 'T')}+09:00`);
const YT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC2NFRq9s2neD_Ml0tPhNC2Q';

/** 방송이 켜질 때 유튜브 동시 송출 주소 (검색 1회 = 할당량 100, 방송마다 한 번) */
async function findYoutubeLiveUrl(): Promise<string> {
  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!key) return '';
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&channelId=${YT_CHANNEL_ID}&eventType=live&type=video&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(6000) });
    const id = (await r.json().catch(() => null))?.items?.[0]?.id?.videoId;
    return id ? `https://www.youtube.com/watch?v=${id}` : '';
  } catch { return ''; }
}

/**
 * 방송이 끝나면 방송 기록을 자동으로 만듦 (예전 Cloudflare 'chzzk-checker' 가 하던 일을 서버로 옮김)
 * - 관리자가 같은 날 비슷한 시각(±90분)으로 이미 기록했으면 만들지 않음
 * - 같은 방송은 한 번만 (ID 를 방송 시작 시각으로 고정)
 * - 관리자 > 시스템 > 자동 시스템에서 끌 수 있음 (system.autoLogEnabled === false)
 */
async function createAutoLog(db: any, prev: any, endMs: number) {
  const open = String(prev.openDate || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(open)) return { ok: false, reason: 'openDate 없음' };
  const startMs = kstDateTimeToMs(open);
  const hours = Math.round(((endMs - startMs) / 3600000) * 100) / 100;
  if (!(hours > 0.15) || hours > 24) return { ok: false, reason: `방송 길이 이상 (${hours}시간)` };
  const date = open.slice(0, 10);
  const time = open.slice(11, 16);
  const end = new Date(endMs + 9 * 3600000);
  const endTime = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`;
  const id = `auto_${open.replace(/\D/g, '').slice(0, 12)}`;
  const category = String(prev.liveCategoryValue || '').trim();
  const log = {
    id, date, time, endTime, durationHours: hours,
    game: category, games: category ? [{ name: category, link: '' }] : [],
    category: '', vods: prev.youtubeLiveUrl ? [{ title: prev.liveTitle || '생방송 다시보기', url: prev.youtubeLiveUrl }] : [],
    edited: [], shorts: [],
    liveTitle: prev.liveTitle || '', autoCreated: true, createdAt: new Date().toISOString(),
  };
  const monthRef = db.collection('logs_by_month').doc(date.slice(0, 7));
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const made = await db.runTransaction(async (tx: any) => {
    const items = ((await tx.get(monthRef)).data()?.items || {}) as Record<string, any>;
    if (items[id]) return 'exists';
    const dup = Object.values(items).find((l: any) => l?.date === date && l?.time && Math.abs(toMin(l.time) - toMin(time)) <= 90);
    if (dup) return `admin:${(dup as any).id}`;
    tx.set(monthRef, { month: date.slice(0, 7), updatedAt: new Date().toISOString(), items: { [id]: log } }, { merge: true });
    tx.set(db.collection('logs').doc(id), log);
    return 'created';
  });
  return made === 'created' ? { ok: true, id, date, time, endTime, hours, game: category } : { ok: false, reason: made === 'exists' ? '이미 만듦' : `관리자 기록 있음 (${made.slice(6)})` };
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, messaging, hasAdminCredentials } = await import('../_firebase.js');
    if (!hasAdminCredentials) {
      return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.' });
    }

    const now = new Date();
    const stateRef = db.collection('notification_state').doc('main');

    // ── 0. 호출 간격 제한 (트랜잭션으로 동시 호출도 한 번만 통과) ──
    const proceed = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(stateRef);
      const last = snap.exists ? Number(snap.data()?.lastRunAt || 0) : 0;
      if (now.getTime() - last < MIN_INTERVAL_MS) return false;
      tx.set(stateRef, { lastRunAt: now.getTime() }, { merge: true });
      return true;
    });
    if (!proceed) return res.status(200).json({ skipped: 'throttled' });

    const state = (await stateRef.get()).data() || {};
    const result: Record<string, any> = { at: now.toISOString() };

    // ── 1. 방송 상태 확인 ──
    let liveStatus: 'OPEN' | 'CLOSE' | 'UNKNOWN' = 'UNKNOWN';
    let content: any = null;
    try {
      const r = await fetch(CHZZK_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; uzuhama-notifier/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      const json = await r.json().catch(() => null);
      content = json?.content;
      liveStatus = content?.status === 'OPEN' ? 'OPEN' : content?.status === 'CLOSE' ? 'CLOSE' : 'UNKNOWN';
      // 방송이 꺼져 있으면 정상 응답(code 200)이면서 상태값이 비어 오는 경우가 있음 → 꺼짐으로 처리
      if (liveStatus === 'UNKNOWN' && r.ok && Number(json?.code) === 200 && !content?.status) liveStatus = 'CLOSE';
      if (liveStatus === 'UNKNOWN') result.chzzkError = `HTTP ${r.status} code=${json?.code ?? '-'} ${String(json?.message ?? '').slice(0, 80)}`;
    } catch (e: any) {
      result.chzzkError = e?.message || String(e);
    }

    // 치지직 응답을 못 받으면 외부 기록기가 갱신하는 live_status 문서로 판단 (최근 15분 내 갱신된 경우만)
    let fromDoc = false;
    if (liveStatus === 'UNKNOWN') {
      const doc = (await db.collection('live_status').doc(CHANNEL_ID).get()).data() || {};
      const updated = Date.parse(doc.updatedAt?.toDate ? doc.updatedAt.toDate().toISOString() : doc.updatedAt || '');
      if (Number.isFinite(updated) && now.getTime() - updated < 15 * 60000) {
        liveStatus = doc.status === 'OPEN' || doc.isLive === true ? 'OPEN' : 'CLOSE';
        content = { status: liveStatus, liveTitle: doc.liveTitle, liveCategoryValue: doc.liveCategoryValue, openDate: doc.openDate };
        fromDoc = true;
      }
    }
    result.live = liveStatus + (fromDoc ? ' (live_status)' : '');

    // 앱 화면의 실시간 카드가 쓰는 live_status 도 함께 최신화 (변경이 있을 때만)
    if (liveStatus !== 'UNKNOWN' && !fromDoc) {
      const liveRef = db.collection('live_status').doc(CHANNEL_ID);
      const prev = (await liveRef.get()).data() || {};
      const next = liveStatus === 'OPEN'
        ? { status: 'OPEN', isLive: true, liveTitle: content?.liveTitle || '', liveCategoryValue: content?.liveCategoryValue || '', openDate: content?.openDate || '' }
        : { status: 'CLOSE', isLive: false, liveTitle: '', liveCategoryValue: '', openDate: '' };
      const extra: Record<string, any> = {};
      // 방송 시작: 유튜브 동시 송출 주소를 찾아 둠 (끝날 때 기록에 '생방송' 링크로 넣음)
      if (next.status === 'OPEN' && (prev.status !== 'OPEN' || prev.openDate !== next.openDate) && !prev.youtubeLiveUrl) {
        extra.youtubeLiveUrl = await findYoutubeLiveUrl();
      }
      // 방송 끝: 방송 기록 자동 생성
      if (next.status === 'CLOSE' && prev.status === 'OPEN' && prev.openDate) {
        let enabled = true;
        try { enabled = (await db.collection('config').doc('system').get()).data()?.autoLogEnabled !== false; } catch { /* 기본 켜짐 */ }
        const closeMs = content?.closeDate ? kstDateTimeToMs(String(content.closeDate)) : NaN;
        const endMs = Number.isFinite(closeMs) && closeMs > kstDateTimeToMs(prev.openDate) ? closeMs : now.getTime();
        const r = enabled ? await createAutoLog(db, prev, endMs).catch((e: any) => ({ ok: false, reason: String(e?.message || e) })) : { ok: false, reason: '꺼져 있음' };
        result.autoLog = r;
        await stateRef.set({ lastAutoLog: { ...r, at: now.toISOString(), openDate: prev.openDate } }, { merge: true });
        extra.youtubeLiveUrl = '';
      }
      if (prev.status !== next.status || prev.openDate !== next.openDate || prev.liveTitle !== next.liveTitle || Object.keys(extra).length) {
        await liveRef.set({ ...next, ...extra, updatedAt: now.toISOString() }, { merge: true });
        result.liveStatusUpdated = true;
      }
    }

    // ── 2. 방송 시작 알림 ──
    if (liveStatus === 'OPEN' && content?.openDate && state.lastLiveOpenDate !== content.openDate) {
      const ageMin = (now.getTime() - kstDateTimeToMs(content.openDate)) / 60000;
      await stateRef.set({ lastLiveOpenDate: content.openDate }, { merge: true });
      if (ageMin <= LIVE_NOTIFY_MAX_AGE_MIN) {
        // 게임·장르를 골라 둔 사람은 그 게임·장르 방송일 때만
        const subs = (await loadSubscriptions(db)).filter((s) => s.notifyLive && matchesLiveKeywords(s.liveKeywords, content?.liveTitle || '', content?.liveCategoryValue || ''));
        const category = content?.liveCategoryValue ? ` · ${content.liveCategoryValue}` : '';
        result.liveNotification = await sendPush(db, messaging, subs, {
          title: '우주하마 방송 시작!',
          body: `${content?.liveTitle || '지금 생방송이 시작됐어요'}${category}`,
          url: '/',
          tag: `live-${content.openDate}`,
        });
      } else {
        result.liveNotification = 'skipped (detected too late)';
      }
    }

    // ── 3. 오늘 유력 시간 사전 알림 ──
    // 사전 알림 확인은 5분에 한 번만 (알림 창이 15분이라 충분, 매번 13개월치 기록을 읽지 않도록)
    const probDue = now.getTime() - Number(state.lastProbAt || 0) >= 5 * 60000;
    if (liveStatus !== 'OPEN' && !probDue) result.prob = 'skipped (5분 간격)';
    if (liveStatus !== 'OPEN' && probDue) {
      await stateRef.set({ lastProbAt: now.getTime() }, { merge: true });
      const { minute: clockMinute, dateStr } = kstParts(now);
      const bToday = clockMinute < DAY_BOUNDARY_MIN
        ? new Date(Date.parse(`${dateStr}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
        : dateStr;

      // 확률 엔진에 필요한 최근 약 13개월치만 읽음
      const startMonth = new Date(now.getTime() - 400 * 86400000).toISOString().slice(0, 7);
      const { FieldPath } = await import('firebase-admin/firestore');
      const monthSnaps = await db.collection('logs_by_month').where(FieldPath.documentId(), '>=', startMonth).get();
      const logs: any[] = [];
      monthSnaps.forEach((d: any) => {
        const items = d.data()?.items;
        if (items && typeof items === 'object') Object.values(items).forEach((l: any) => l?.date && logs.push(l));
      });
      const system = (await db.collection('config').doc('system').get()).data() || {};
      const prob = computeBroadcastProbability(logs, now, { system: system as any });
      result.prob = { day: prob.dayProb, final: prob.finalProb, peak: prob.time.peakMinute, state: prob.pattern.state };

      const peak = prob.time.peakMinute;
      if (
        peak !== null &&
        prob.time.peakIsToday &&
        prob.pattern.state === 'normal' &&
        prob.dayProb >= PEAK_MIN_DAY_PROB
      ) {
        const toB = (m: number) => (m - DAY_BOUNDARY_MIN + 1440) % 1440;
        const minutesUntil = toB(peak) - toB(clockMinute);
        const sentLeads: number[] = state.peakSentDate === bToday && Array.isArray(state.peakSentLeads) ? state.peakSentLeads : [];
        // 구독자 목록은 알림 보낼 수 있는 시간대(유력 시간 3시간 전 ~ 그 시각)에만 읽음
        const subs = minutesUntil >= 0 && minutesUntil <= 180 ? (await loadSubscriptions(db)).filter((s) => s.notifyPeakProb) : [];
        const groups = new Map<number, typeof subs>();
        subs.forEach((s) => {
          const lead = s.leadTimeMinutes;
          const due = minutesUntil <= lead && minutesUntil > lead - PEAK_WINDOW_MIN && minutesUntil >= 0;
          if (due && !sentLeads.includes(lead)) {
            if (!groups.has(lead)) groups.set(lead, []);
            groups.get(lead)!.push(s);
          }
        });
        if (groups.size > 0) {
          const timeText = formatClockMinute(peak);
          const sent: Record<string, any> = {};
          for (const [lead, group] of groups) {
            sent[lead] = await sendPush(db, messaging, group, {
              title: '우주하마 방송 예측',
              body: minutesUntil > 0
                ? `오늘 방송 유력 시간(${timeText})까지 약 ${minutesUntil}분 남았어요. 오늘 방송 확률 ${prob.dayProb.toFixed(0)}%`
                : `지금이 오늘 방송 유력 시간(${timeText})이에요. 오늘 방송 확률 ${prob.dayProb.toFixed(0)}%`,
              url: '/',
              tag: `prob-notif-${bToday}`,
            });
          }
          await stateRef.set({ peakSentDate: bToday, peakSentLeads: [...sentLeads, ...groups.keys()] }, { merge: true });
          result.peakNotification = sent;
        }
      }
    }

    // 관리자 '자동 시스템' 화면에서 볼 수 있게 마지막 결과를 짧게 남김 (호출한 곳: ?src=github|worker|app|admin)
    const src = String(req.query?.src || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'unknown';
    await stateRef.set({
      lastResult: JSON.parse(JSON.stringify({ at: result.at, live: result.live, prob: result.prob ?? null, chzzkError: result.chzzkError ?? null, src })),
      lastBySource: { [src]: now.getTime() }, // merge 라서 다른 출처 기록은 유지
    }, { merge: true }).catch(() => {});

    // ── 하루 한 번: 검색 조정 (신고·만족도 반영, 오전 5시 이후) ──
    if (new Date(now.getTime() + 9 * 3600000).getUTCHours() >= 5) {
      try {
        const { tuneSearch } = await import('../_searchTune.js');
        const t = await tuneSearch(db);
        if (!(t as any).skipped) result.searchTune = t;
      } catch (e: any) {
        result.searchTuneError = String(e?.message || e).slice(0, 200);
      }
      // 사라진(삭제·비공개) 영상 찾기
      try {
        const { checkDeadVideos } = await import('../_deadVideos.js');
        const d = await checkDeadVideos(db);
        if (!(d as any).skipped) result.deadVideos = d;
      } catch (e: any) {
        result.deadVideosError = String(e?.message || e).slice(0, 200);
      }
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[notifications/tick] failed:', error);
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
