import { setCorsHeaders, verifyUserToken, db } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 유저 인증 토큰 확인
    const user = await verifyUserToken(req);

    const { content, category } = req.body;

    // 2. 서버가 직접 검증된 uid를 부여하여 데이터 저장 (위조 방지)
    const docRef = await db.collection('contributions').add({
      userId: user.uid,
      userEmail: user.email || null,
      content,
      category,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    return res.status(401).json({ error: error.message });
  }
}
