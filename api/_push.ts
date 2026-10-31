// FCM 웹 푸시 공통 발송 모듈 (수동 발송 /api/notifications/send 와 자동 발송 /api/notifications/tick 공용)

export const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://uzuhama.web.app').replace(/\/+$/, '');

/** FCM webpush.fcmOptions.link 는 HTTPS 절대 주소여야 함 → 상대 경로를 메인 도메인 기준으로 변환 */
export function toAbsoluteLink(url?: string): string {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) return url.slice(0, 2048);
  const path = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  return `${SITE_URL}${path}`.slice(0, 2048);
}

export interface PushTarget {
  token: string;
  docId: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** 등록이 해제됐거나 형식이 깨진 토큰만 정리 (메시지 내용 오류인 invalid-argument 로는 지우지 않음) */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export async function sendPush(db: any, messaging: any, targets: PushTarget[], payload: PushPayload) {
  const link = toAbsoluteLink(payload.url);
  const unique = new Map<string, string>();
  targets.forEach((t) => {
    const token = (t.token || '').trim();
    if (token.length >= 20 && !token.startsWith('local_dev_') && !unique.has(token)) unique.set(token, t.docId);
  });
  const tokens = [...unique.keys()];

  let successCount = 0;
  let failureCount = 0;
  let cleanedTokens = 0;
  const errorSummary: Record<string, number> = {};
  const sampleErrors: string[] = [];
  const cleanups: Promise<any>[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: { title: payload.title, body: payload.body },
      data: { url: link, title: payload.title, body: payload.body, ...(payload.tag ? { tag: payload.tag } : {}) },
      webpush: {
        notification: {
          icon: `${SITE_URL}/icon.png`,
          badge: `${SITE_URL}/icon.png`,
          ...(payload.tag ? { tag: payload.tag, renotify: false } : {}),
        },
        fcmOptions: { link },
      },
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((r: any, idx: number) => {
      if (r.success || !r.error) return;
      const code = r.error.code || 'unknown';
      errorSummary[code] = (errorSummary[code] || 0) + 1;
      if (sampleErrors.length < 5) sampleErrors.push(`[${code}] ${r.error.message || ''}`);
      if (DEAD_TOKEN_CODES.has(code)) {
        const docId = unique.get(chunk[idx]);
        if (docId) {
          cleanedTokens++;
          cleanups.push(db.collection('push_subscriptions').doc(docId).delete().catch(() => {}));
        }
      }
    });
  }
  await Promise.all(cleanups);
  return { successCount, failureCount, totalCount: tokens.length, cleanedTokens, errorSummary, sampleErrors };
}

/** push_subscriptions 전체를 읽어 설정과 함께 반환 */
export async function loadSubscriptions(db: any) {
  const snap = await db.collection('push_subscriptions').get();
  const subs: { token: string; docId: string; notifyLive: boolean; notifyPeakProb: boolean; leadTimeMinutes: number }[] = [];
  snap.docs.forEach((d: any) => {
    const data = d.data() || {};
    let token = data.token || data.fcmToken;
    if (!token && typeof data.endpoint === 'string' && data.endpoint.includes('/fcm/send/')) {
      token = data.endpoint.split('/fcm/send/')[1];
    }
    if (!token || typeof token !== 'string') return;
    const lead = Number(data.leadTimeMinutes);
    subs.push({
      token: token.trim(),
      docId: d.id,
      notifyLive: data.notifyLive !== false,
      notifyPeakProb: data.notifyPeakProb !== false,
      leadTimeMinutes: Number.isFinite(lead) ? Math.max(0, Math.min(180, Math.round(lead))) : 30,
    });
  });
  return subs;
}
