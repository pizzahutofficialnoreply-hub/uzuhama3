import { setCorsHeaders } from '../_cors.js';
import { sendPush, loadSubscriptions } from '../_push.js';
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
 */

const CHANNEL_ID = 'c6e1c8cf1b128bd321cc2684c92b5a00';
const CHZZK_URL = `https://api.chzzk.naver.com/service/v2/channels/${CHANNEL_ID}/live-detail`;
const MIN_INTERVAL_MS = 50_000;
const LIVE_NOTIFY_MAX_AGE_MIN = 40; // 방송 시작 후 이 시간이 지나 처음 감지하면 시작 알림은 생략
const PEAK_MIN_DAY_PROB = 25; // 오늘 방송 확률이 이보다 낮으면(휴방 등) 유력 시간 알림 생략
const PEAK_WINDOW_MIN = 15; // 호출 간격이 들쭉날쭉해도 놓치지 않도록 사전 알림 시점부터 15분 안에 한 번 발송

const kstDateTimeToMs = (s: string) => Date.parse(`${s.replace(' ', 'T')}+09:00`);

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
        signal: AbortSignal.timeout(7000),
      });
      content = (await r.json())?.content;
      liveStatus = content?.status === 'OPEN' ? 'OPEN' : content?.status === 'CLOSE' ? 'CLOSE' : 'UNKNOWN';
    } catch (e: any) {
      result.chzzkError = e?.message || String(e);
    }
    result.live = liveStatus;

    // 앱 화면의 실시간 카드가 쓰는 live_status 도 함께 최신화 (변경이 있을 때만)
    if (liveStatus !== 'UNKNOWN') {
      const liveRef = db.collection('live_status').doc(CHANNEL_ID);
      const prev = (await liveRef.get()).data() || {};
      const next = liveStatus === 'OPEN'
        ? { status: 'OPEN', isLive: true, liveTitle: content?.liveTitle || '', liveCategoryValue: content?.liveCategoryValue || '', openDate: content?.openDate || '' }
        : { status: 'CLOSE', isLive: false, liveTitle: '', liveCategoryValue: '', openDate: '' };
      if (prev.status !== next.status || prev.openDate !== next.openDate || prev.liveTitle !== next.liveTitle) {
        await liveRef.set({ ...next, updatedAt: now.toISOString() }, { merge: true });
        result.liveStatusUpdated = true;
      }
    }

    // ── 2. 방송 시작 알림 ──
    if (liveStatus === 'OPEN' && content?.openDate && state.lastLiveOpenDate !== content.openDate) {
      const ageMin = (now.getTime() - kstDateTimeToMs(content.openDate)) / 60000;
      await stateRef.set({ lastLiveOpenDate: content.openDate }, { merge: true });
      if (ageMin <= LIVE_NOTIFY_MAX_AGE_MIN) {
        const subs = (await loadSubscriptions(db)).filter((s) => s.notifyLive);
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
    if (liveStatus !== 'OPEN') {
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
        const subs = (await loadSubscriptions(db)).filter((s) => s.notifyPeakProb);
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

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[notifications/tick] failed:', error);
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
