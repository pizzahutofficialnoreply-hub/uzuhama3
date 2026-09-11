function setCorsHeaders(req: any, res: any) {
  const origin = req?.headers?.origin;
  const allowedOrigins = [
    'https://uzuhama-beta.web.app',
    'https://uzuhama.web.app',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret'
  );
}

export default async function handler(req: any, res: any) {
  // Handle the browser preflight before importing/initializing Firebase Admin.
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Load Firebase Admin only for an actual API request.
    const { setCorsHeaders: setFirebaseCorsHeaders, verifyAdmin, db, messaging } =
      await import('../_firebase');

    // Keep the shared helper as the source of truth for non-preflight requests.
    setFirebaseCorsHeaders(req, res);

    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      await verifyAdmin(req);
    }

    const { title, body, url } = req.body;

    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokens = tokensSnapshot.docs.map((doc: any) => doc.data().token).filter(Boolean);

    if (tokens.length === 0) {
      return res.status(200).json({ message: '등록된 구독 토큰이 없습니다.' });
    }

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url: url || '/' }
    });

    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
