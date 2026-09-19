import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin 초기화 (send.ts와 일관된 방식 유지, auth 분리로 안정성 확보)
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
          console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT in subscribe:', error);
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

function setCors(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

export default async function handler(req: any, res: any) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const { token, endpoint, keys, action, settings } = body || {};

    let effectiveToken = token;
    if (!effectiveToken && endpoint && typeof endpoint === 'string' && endpoint.includes('/fcm/send/')) {
      effectiveToken = endpoint.split('/fcm/send/')[1];
    }

    const identifier = effectiveToken || endpoint;
    if (!identifier) {
      return res.status(400).json({ error: 'FCM 토큰 또는 구독 엔드포인트 정보가 누락되었습니다.' });
    }

    const docId = createHash('sha256').update(identifier).digest('hex');
    const docRef = db.collection('push_subscriptions').doc(docId);

    if (action === 'unsubscribe' || req.method === 'DELETE') {
      await docRef.delete();
      return res.status(200).json({ success: true, message: '구독이 해제되었습니다.' });
    }

    const userAgent = req.headers['user-agent'] || 'unknown';

    await docRef.set({
      token: effectiveToken || null,
      endpoint: endpoint || null,
      keys: keys || null,
      notifyLive: settings?.notifyLive !== undefined ? settings.notifyLive : true,
      notifyAbsence: settings?.notifyAbsence !== undefined ? settings.notifyAbsence : true,
      userAgent,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({ 
      success: true, 
      subscribed: true,
      hasToken: Boolean(effectiveToken)
    });
  } catch (error: any) {
    console.error('푸시 구독 처리 오류:', error);
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
