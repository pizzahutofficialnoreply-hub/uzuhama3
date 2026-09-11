import { setCorsHeaders, verifyAdmin, db, messaging } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  // 브라우저의 사전 OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      await verifyAdmin(req);
    }

    const { title, body, url } = req.body;

    const tokensSnapshot = await db.collection('push_subscriptions').get();
    const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);

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

