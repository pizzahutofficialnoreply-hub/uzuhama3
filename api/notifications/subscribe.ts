import { createHash } from 'node:crypto';
import { setCorsHeaders, verifyUserTokenOptional, db } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { token, endpoint, keys, action } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'FCM 토큰이 누락되었습니다.' });
    }

    const docId = createHash('sha256').update(token).digest('hex');
    const docRef = db.collection('push_subscriptions').doc(docId);

    if (action === 'unsubscribe' || req.method === 'DELETE') {
      await docRef.delete();
      return res.status(200).json({ success: true, message: '구독이 해제되었습니다.' });
    }

    const user = await verifyUserTokenOptional(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    await docRef.set({
      token,
      uid: user ? user.uid : null,
      email: user ? (user.email || null) : null,
      endpoint: endpoint || null,
      keys: keys || null,
      userAgent,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({ success: true, subscribed: true });
  } catch (error: any) {
    console.error('푸시 구독 처리 오류:', error);
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
