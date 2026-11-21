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

    if (token !== undefined && (typeof token !== 'string' || token.length > 4096)) {
      return res.status(400).json({ error: 'Invalid FCM token' });
    }
    if (endpoint !== undefined && (typeof endpoint !== 'string' || endpoint.length > 4096)) {
      return res.status(400).json({ error: 'Invalid subscription endpoint' });
    }

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
    if (effectiveToken.startsWith('local_dev_') || effectiveToken.length < 100 || !/^[A-Za-z0-9_:\-]+$/.test(effectiveToken)) {
      return res.status(400).json({ 
        error: '유효한 FCM Web Push 토큰이 아닙니다. 실제 브라우저 권한 및 FCM 초기화가 필요합니다.' 
      });
    }

    const userAgent = req.headers['user-agent'] || 'unknown';

    const leadTime = Number(settings?.leadTimeMinutes);
    await docRef.set({
      token: effectiveToken,
      endpoint: endpoint || null,
      keys: keys || null,
      notifyLive: settings?.notifyLive !== undefined ? Boolean(settings.notifyLive) : true,
      notifyAbsence: settings?.notifyAbsence !== undefined ? Boolean(settings.notifyAbsence) : true,
      notifyPeakProb: settings?.notifyPeakProb !== undefined ? Boolean(settings.notifyPeakProb) : true,
      leadTimeMinutes: Number.isFinite(leadTime) ? Math.max(0, Math.min(1440, Math.round(leadTime))) : 30,
      notifyReports: settings?.notifyReports !== undefined ? Boolean(settings.notifyReports) : true,
      notifyNewVideo: settings?.notifyNewVideo !== undefined ? Boolean(settings.notifyNewVideo) : true,
      // 종류별 잠깐 끄기: { notifyLive: 다시 켜질 시각(ms) } (최대 72시간)
      mute: Object.fromEntries(Object.entries(settings?.mute && typeof settings.mute === 'object' ? settings.mute : {})
        .filter(([k, v]) => /^notify[A-Za-z]{2,20}$/.test(k) && Number(v) > Date.now())
        .map(([k, v]) => [k, Math.min(Date.now() + 73 * 3600000, Number(v))])),
      // 잠깐 끄기: 이 시각(ms)까지 알림 안 보냄 (0 이면 켜짐)
      muteUntil: Number.isFinite(Number(settings?.muteUntil)) ? Math.max(0, Math.min(Date.now() + 73 * 3600000, Number(settings.muteUntil))) : 0,
      // 생방송 알림을 이 게임·장르일 때만 (최대 10개, 30자)
      liveKeywords: Array.isArray(settings?.liveKeywords)
        ? [...new Set(settings.liveKeywords.map((k: any) => String(k || '').trim().slice(0, 80)).filter(Boolean))].slice(0, 20)
        : [],
      userAgent,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    // 잠깐 끄기 목록은 통째로 바꿈 (merge 로는 '지금 다시 켜기'로 지운 항목이 남음)
    if (settings && 'mute' in settings) await docRef.update({ mute: Object.fromEntries(Object.entries(settings.mute && typeof settings.mute === 'object' ? settings.mute : {}).filter(([k, v]) => /^notify[A-Za-z]{2,20}$/.test(k) && Number(v) > Date.now()).map(([k, v]) => [k, Math.min(Date.now() + 73 * 3600000, Number(v))])) }).catch(() => {});

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
