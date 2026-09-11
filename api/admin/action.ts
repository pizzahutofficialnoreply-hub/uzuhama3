import { setCorsHeaders, verifyAdmin, db } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 관리자 토큰 검증 (클라이언트 조작 불가)
    const adminUser = await verifyAdmin(req);

    const { actionType, payload } = req.body;

    if (actionType === 'UPDATE_CONFIG') {
      // 관리자 전용 config 수정
      await db.doc(`config/${payload.target}`).set(payload.data, { merge: true });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: '알 수 없는 액션입니다.' });
  } catch (error: any) {
    return res.status(403).json({ error: error.message });
  }
}
