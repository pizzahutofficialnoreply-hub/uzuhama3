import { setCorsHeaders, verifyAdmin, db, messaging } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const cronSecretHeader = req.headers['x-cron-secret'] || req.headers['X-Cron-Secret'];
    const isCronAuthorized = Boolean(
      process.env.CRON_SECRET &&
      (cronSecretHeader === process.env.CRON_SECRET ||
       authHeader === `Bearer ${process.env.CRON_SECRET}`)
    );

    if (!isCronAuthorized) {
      await verifyAdmin(req);
    }

    let reqPayload = req.body;
    if (typeof reqPayload === 'string') {
      try {
        reqPayload = JSON.parse(reqPayload);
      } catch {}
    }
    const { title, body, url } = reqPayload || {};

    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokens = tokensSnapshot.docs
      .map((doc: any) => doc.data().token)
      .filter((token: unknown): token is string => typeof token === 'string' && token.length > 0);

    if (tokens.length === 0) {
      return res.status(200).json({ message: '등록된 구독 토큰이 없습니다.' });
    }

    const cleanTitle = (title || '우주하마 방송 예측')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim() || '우주하마 방송 예측';
    const cleanBody = (body || '')
      .replace(/^(from\s*우주하마\s*예측[:\s]*|\[from\s*우주하마\s*예측\]\s*)/i, '')
      .trim();

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
