import { timingSafeEqual } from 'node:crypto';
import { setCorsHeaders } from '../_cors.js';

/** 비밀값 비교: 길이·내용과 상관없이 같은 시간이 걸리게 (추측 공격 방지) */
function safeEqual(a: unknown, b: string) {
  if (typeof a !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// --- [API 핸들러: FCM 푸시 알림 발송] ---
export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db, messaging, verifyAdmin } = await import('../_firebase.js');

    // 1. 보안 검증: cron secret 또는 관리자 토큰 검증
    const cronSecretHeader = req.headers['x-cron-secret'] || req.headers['x-api-secret'];
    const authHeader = req.headers['authorization'] || '';
    const configuredSecret = process.env.NOTIFICATION_API_SECRET || process.env.CRON_SECRET;

    let isAuthorized = false;

    // A. Secret 기반 인증 (백엔드 Cron / 스크립트 자동화)
    if (configuredSecret && configuredSecret.length > 8) {
      if (safeEqual(cronSecretHeader, configuredSecret)) {
        isAuthorized = true;
      } else if (authHeader.startsWith('Bearer ') && safeEqual(authHeader.substring(7).trim(), configuredSecret)) {
        isAuthorized = true;
      }
    }

    // B. 관리자 ID 토큰 기반 인증 (관리자 UI에서 직접 발송)
    if (!isAuthorized && authHeader.startsWith('Bearer ')) {
      try {
        const adminUser = await verifyAdmin(req);
        if (adminUser) {
          isAuthorized = true;
          console.log(`[Notification Send] Authorized by admin ${adminUser.email}`);
        }
      } catch (authErr: any) {
        console.warn('[Notification Send] Admin auth verification failed:', authErr?.message || authErr);
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        error: '알림 발송 권한이 없습니다. 관리자 로그인 세션이 필요하거나 올바른 X-Cron-Secret 헤더가 요구됩니다.'
      });
    }

    // 2. 요청 페이로드 파싱
    let reqPayload = req.body;
    if (typeof reqPayload === 'string') {
      try {
        reqPayload = JSON.parse(reqPayload);
      } catch {}
    }
    const { title, body, url } = reqPayload || {};

    if ((title !== undefined && typeof title !== 'string') || (body !== undefined && typeof body !== 'string')) {
      return res.status(400).json({ error: 'title and body must be strings' });
    }
    if (typeof title === 'string' && title.length > 200) {
      return res.status(400).json({ error: 'title is too long' });
    }
    if (typeof body === 'string' && body.length > 2000) {
      return res.status(400).json({ error: 'body is too long' });
    }
    const targetUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
      ? url.slice(0, 2048)
      : '/';

    // 3. 구독 기기 조회 후 공통 모듈로 발송 (클릭 링크는 HTTPS 절대 주소로 변환, 해지된 토큰만 정리)
    const { sendPush, loadSubscriptions } = await import('../_push.js');
    const subs = await loadSubscriptions(db);
    if (subs.length === 0) {
      return res.status(200).json({
        success: false,
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        cleanedTokens: 0,
        sampleErrors: [],
        errorSummary: {},
        message: '등록된 유효 FCM 푸시 구독 기기가 없습니다. 사용자 브라우저나 PWA 앱의 [설정 > 알림 설정]에서 알림을 허용해주세요.'
      });
    }

    const cleanTitle = (title || '우주하마 방송 예측')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim() || '우주하마 방송 예측';
    const cleanBody = (body || '')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim();

    const result = await sendPush(db, messaging, subs, { title: cleanTitle, body: cleanBody, url: targetUrl });
    return res.status(200).json({ success: result.successCount > 0, ...result });
  } catch (error: any) {
    console.error('FCM notification send failed:', error);
    const msg = error?.message || '';
    let guide = msg;
    if (msg.includes('credential') || msg.includes('certificate') || msg.includes('service_account')) {
      guide = 'Vercel 환경 변수에 FIREBASE_SERVICE_ACCOUNT (또는 FIREBASE_PRIVATE_KEY 및 FIREBASE_CLIENT_EMAIL)이 올바르게 설정되어 있는지 확인해주세요.';
    }
    return res.status(500).json({
      error: guide,
    });
  }
}
