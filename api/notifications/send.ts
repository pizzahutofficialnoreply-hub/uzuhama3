import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// --- [Firebase Admin 초기화 (auth 제거로 ERR_REQUIRE_ESM 원천 차단)] ---
let app: App;

if (getApps().length > 0) {
  app = getApps()[0];
} else {
  let serviceAccount: any = null;
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawKey) {
    try {
      serviceAccount = JSON.parse(rawKey);
    } catch {
      try {
        const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
      } catch {
        try {
          serviceAccount = JSON.parse(rawKey.replace(/[\r\n\t]/g, ' '));
        } catch (error) {
          console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
        }
      }
    }

    if (serviceAccount?.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'uzuhama',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    };
  }

  app = serviceAccount?.private_key
    ? initializeApp({ credential: cert(serviceAccount) })
    : initializeApp();
}

const db = getFirestore(app);
const messaging = getMessaging(app);

function setCorsHeaders(req: any, res: any) {
  const origin = req?.headers?.origin;
  const method = req?.method;
  const url = req?.url;

  if (process.env.DEBUG_CORS || process.env.NODE_ENV !== 'production') {
    console.log(`[CORS Request] ${method} ${url} | Origin: ${origin || '(same-origin/no-origin)'}`);
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret, X-Cron-Secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

// --- [API 핸들러] ---
export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 요청 페이로드 파싱
    let reqPayload = req.body;
    if (typeof reqPayload === 'string') {
      try {
        reqPayload = JSON.parse(reqPayload);
      } catch {}
    }
    const { title, body, url } = reqPayload || {};

    // 2. 푸시 토큰 조회 (token, fcmToken, 및 endpoint의 /fcm/send/ 토큰 완벽 지원)
    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokens: string[] = [];

    tokensSnapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data();
      let t = data.token || data.fcmToken;
      if (!t && data.endpoint && typeof data.endpoint === 'string' && data.endpoint.includes('/fcm/send/')) {
        t = data.endpoint.split('/fcm/send/')[1];
      }
      if (t && typeof t === 'string' && t.trim().length > 0 && !tokens.includes(t.trim())) {
        tokens.push(t.trim());
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({
        success: false,
        successCount: 0,
        failureCount: 0,
        message: '등록된 유효 FCM 푸시 구독 토큰이 없습니다. 기기 설정에서 알림을 허용한 후 앱을 새로고침하여 기기 토큰을 재등록해주세요.'
      });
    }

    const cleanTitle = (title || '우주하마 방송 예측')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim() || '우주하마 방송 예측';
    const cleanBody = (body || '')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim();

    // 3. 알림 멀티캐스트 발송
    const response = await messaging.sendEachForMulticast({
      tokens,
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

    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (error: any) {
    console.error('FCM notification send failed:', error);
    return res.status(500).json({
      error: error?.message || '알림 발송 중 오류가 발생했습니다.',
    });
  }
}