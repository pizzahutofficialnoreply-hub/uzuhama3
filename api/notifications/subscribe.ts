import crypto from 'crypto';
import { setCorsHeaders, verifyUserTokenOptional, db } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { token, endpoint, keys, action } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'FCM 토큰이 누락되었습니다.' });
    }

    // 토큰의 SHA-256 해시를 문서 ID로 사용하여 다중 기기 지원 및 충돌 방지
    const docId = crypto.createHash('sha256').update(token).digest('hex');
    const docRef = db.collection('push_subscriptions').doc(docId);

    // 구독 해제 요청인 경우 문서 삭제
    if (action === 'unsubscribe' || req.method === 'DELETE') {
      await docRef.delete();
      return res.status(200).json({ success: true, message: '구독이 해제되었습니다.' });
    }

    // 로그인된 사용자 토큰이 있으면 uid 획득 (비로그인 사용자도 허용)
    const user = await verifyUserTokenOptional(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    // 푸시 구독 정보 저장 (토큰 단위 다중 기기 저장)
    await docRef.set({
      token,
      uid: user ? user.uid : null,
      email: user ? (user.email || null) : null,
      endpoint: endpoint || null,
      keys: keys || null,
      userAgent,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, subscribed: true });
  } catch (error: any) {
    console.error('푸시 구독 처리 오류:', error);
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
