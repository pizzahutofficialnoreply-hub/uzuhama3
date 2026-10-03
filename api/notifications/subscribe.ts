import { createHash } from 'node:crypto';
import { setCorsHeaders } from '../_cors.js';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await import('../_firebase.js');

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const { token, endpoint, keys, action, settings } = body || {};

    let effectiveToken = typeof token === 'string' ? token.trim() : '';
    if (!effectiveToken && endpoint && typeof endpoint === 'string' && endpoint.includes('/fcm/send/')) {
      effectiveToken = endpoint.split('/fcm/send/')[1].trim();
    }

    const identifier = effectiveToken || (typeof endpoint === 'string' ? endpoint.trim() : '');
    if (!identifier) {
      return res.status(400).json({ error: 'FCM 토큰 또는 구독 엔드포인트 정보가 누락되었습니다.' });
    }

    const docId = createHash('sha256').update(identifier).digest('hex');
    const docRef = db.collection('push_subscriptions').doc(docId);

    if (action === 'unsubscribe' || req.method === 'DELETE') {
      await docRef.delete();
      return res.status(200).json({ success: true, message: '구독이 해제되었습니다.' });
    }

    // 가짜 토큰 및 빈 토큰 엄격 차단
    if (effectiveToken.startsWith('local_dev_') || effectiveToken.length < 20) {
      return res.status(400).json({ 
        error: '유효한 FCM Web Push 토큰이 아닙니다. 실제 브라우저 권한 및 FCM 초기화가 필요합니다.' 
      });
    }

    const userAgent = req.headers['user-agent'] || 'unknown';

    await docRef.set({
      token: effectiveToken,
      endpoint: endpoint || null,
      keys: keys || null,
      notifyLive: settings?.notifyLive !== undefined ? Boolean(settings.notifyLive) : true,
      notifyAbsence: settings?.notifyAbsence !== undefined ? Boolean(settings.notifyAbsence) : true,
      notifyPeakProb: settings?.notifyPeakProb !== undefined ? Boolean(settings.notifyPeakProb) : true,
      leadTimeMinutes: settings?.leadTimeMinutes !== undefined ? Number(settings.leadTimeMinutes) : 30,
      notifyReports: settings?.notifyReports !== undefined ? Boolean(settings.notifyReports) : true,
      userAgent,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({ 
      success: true, 
      subscribed: true,
      hasToken: true
    });
  } catch (error: any) {
    console.error('푸시 구독 처리 오류:', error);
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
