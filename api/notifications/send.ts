const ALLOWED_ORIGINS = new Set([
  'https://uzuhama-beta.web.app',
  'https://uzuhama.web.app',
]);

function setCorsHeaders(req: any, res: any) {
  const origin = req?.headers?.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,POST,PUT,PATCH,DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-CSRF-Token, x-cron-secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req: any, res: any) {
  // CORS preflight is intentionally handled before Firebase Admin is loaded.
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Load Firebase Admin only for a real request.
    const { verifyAdmin, db, messaging } = await import('../_firebase');

    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      await verifyAdmin(req);
    }

    if (!req.headers['content-type']?.toLowerCase().includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }

    const { title, body, url } = req.body ?? {};

    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokens = tokensSnapshot.docs
      .map((doc: any) => doc.data().token)
      .filter((token: unknown): token is string => typeof token === 'string' && token.length > 0);

    if (tokens.length === 0) {
      return res.status(200).json({
        message: '등록된 구독 토큰이 없습니다.'
      });
    }

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: title || '우주하마 알림',
        body: body || '',
      },
      data: {
        url: url || '/',
      },
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
