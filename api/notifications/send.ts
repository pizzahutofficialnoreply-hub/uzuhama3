import { setCorsHeaders } from '../_cors.js';

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
      if (cronSecretHeader === configuredSecret) {
        isAuthorized = true;
      } else if (authHeader.startsWith('Bearer ') && authHeader.substring(7).trim() === configuredSecret) {
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

    // 3. 푸시 토큰 조회 (push_subscriptions 컬렉션)
    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokenDocMap = new Map<string, string>(); // token -> docId
    const tokens: string[] = [];

    tokensSnapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data();
      let t = data.token || data.fcmToken;
      if (!t && data.endpoint && typeof data.endpoint === 'string' && data.endpoint.includes('/fcm/send/')) {
        t = data.endpoint.split('/fcm/send/')[1];
      }
      if (t && typeof t === 'string') {
        const cleanT = t.trim();
        // 실제 유효한 FCM 토큰만 수집 (local_dev_ 가상 토큰 제외, 길이 20자 이상)
        if (cleanT.length >= 20 && !cleanT.startsWith('local_dev_') && !tokens.includes(cleanT)) {
          tokens.push(cleanT);
          tokenDocMap.set(cleanT, docSnap.id);
        }
      }
    });

    if (tokens.length === 0) {
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

    // 4. 알림 멀티캐스트 발송 (최대 500개씩 청크 처리)
    const CHUNK_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;
    let cleanedTokens = 0;
    const cleanupPromises: Promise<any>[] = [];
    const errorSummary: Record<string, number> = {};
    const sampleErrors: string[] = [];

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunkTokens = tokens.slice(i, i + CHUNK_SIZE);
      const response = await messaging.sendEachForMulticast({
        tokens: chunkTokens,
        notification: {
          title: cleanTitle,
          body: cleanBody,
        },
        data: {
          url: url || '/',
          title: cleanTitle,
          body: cleanBody,
        },
        webpush: {
          notification: {
            icon: '/icon.png',
            badge: '/icon.png',
          },
          fcmOptions: {
            link: url || '/'
          }
        }
      });

      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code || 'unknown';
          const msg = resp.error.message || '';
          errorSummary[code] = (errorSummary[code] || 0) + 1;
          if (sampleErrors.length < 5) {
            sampleErrors.push(`[${code}] ${msg}`);
          }

          // 무효 및 만료 토큰 정리
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            const badToken = chunkTokens[idx];
            const docId = tokenDocMap.get(badToken);
            if (docId) {
              cleanedTokens++;
              cleanupPromises.push(db.collection('push_subscriptions').doc(docId).delete().catch(() => {}));
            }
          }
        }
      });
    }

    if (cleanupPromises.length > 0) {
      await Promise.all(cleanupPromises);
    }

    return res.status(200).json({
      success: totalSuccess > 0,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalCount: tokens.length,
      cleanedTokens,
      sampleErrors,
      errorSummary
    });
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
