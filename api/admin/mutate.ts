import { setCorsHeaders } from '../_cors.js';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 실제 POST 요청에서 Firebase Admin 모듈 안전 로드
    const { verifyAdmin, db } = await import('../_firebase.js');
    const { FieldValue } = await import('firebase-admin/firestore');

    // 관리자 토큰 검증 (보안 필수)
    const adminUser = await verifyAdmin(req);
    console.log(`[Admin Mutate] Authorized request by ${adminUser.email}`);

    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (parseErr) {
        console.error('[Admin Mutate] Failed to parse JSON body:', parseErr);
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { action, log, id, config, guide } = payload || {};

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    // 수정 기록: 방송 기록·시스템 설정을 바꾸기 전 모습을 남겨 두어 되돌릴 수 있게 (최근 것만 보관)
    const audit = async (entry: Record<string, any>) => {
      try {
        await db.collection('admin_audit').add({ ...entry, by: adminUser.email || null, at: new Date().toISOString() });
      } catch (e) { console.error('[Admin Mutate] audit failed', e); }
    };
    const before = async (logId: string) => {
      try { const d = await db.collection('logs').doc(logId).get(); return d.exists ? d.data() : null; } catch { return null; }
    };

    switch (action) {
      case 'tuneSearch': {
        // 관리자 '지금 조정': 오늘 이미 했어도 다시
        const { tuneSearch } = await import('../_searchTune.js');
        const r = await tuneSearch(db, { force: true });
        return res.status(200).json({ success: true, ...r });
      }
      case 'checkDeadVideos': {
        const { checkDeadVideos } = await import('../_deadVideos.js');
        const r = await checkDeadVideos(db, { force: true });
        return res.status(200).json({ success: true, ...r });
      }
      case 'resetSearchTuning': {
        await db.collection('config').doc('searchTuning').set({ updatedAt: new Date().toISOString(), demote: {}, conceptDemote: {}, synonyms: {}, conceptAdd: {}, log: [] });
        await db.collection('notification_state').doc('searchTune').set({ conceptCounts: {} }, { merge: true });
        return res.status(200).json({ success: true });
      }
      case 'addLog': {
        if (!log || !log.id || !log.date) {
          return res.status(400).json({ error: 'Invalid log payload' });
        }
        await audit({ action: 'addLog', logId: log.id, date: log.date, before: await before(log.id), after: log });
        await db.collection('logs').doc(log.id).set(log);

        const monthKey = log.date.slice(0, 7);
        const monthRef = db.collection('logs_by_month').doc(monthKey);
        await monthRef.set({
          month: monthKey,
          updatedAt: new Date().toISOString(),
          items: { [log.id]: log }
        }, { merge: true });

        return res.status(200).json({ success: true, id: log.id });
      }

      case 'updateLog': {
        if (!log || !log.id || !log.date) {
          return res.status(400).json({ error: 'Invalid log payload' });
        }
        // log._patch === true: 아카이브(JSON) 기록의 수정분(바뀐 필드만)
        await audit({ action: 'updateLog', logId: log.id, date: log.date, before: await before(log.id), after: log });
        await db.collection('logs').doc(log.id).set(log);

        const monthKey = log.date.slice(0, 7);
        const monthRef = db.collection('logs_by_month').doc(monthKey);
        await db.runTransaction(async (tx: any) => {
          const snap = await tx.get(monthRef);
          const now = new Date().toISOString();
          if (!snap.exists) {
            tx.set(monthRef, { month: monthKey, updatedAt: now, items: { [log.id]: log } });
            return;
          }
          // 항목은 깊은 병합이 아니라 통째로 교체 (지운 필드가 남지 않도록)
          const updates: Record<string, any> = { updatedAt: now, [`items.${log.id}`]: log };
          if (log._patch) {
            // 같은 날짜의 옛 전체 사본(id 가 다른 항목) 정리
            Object.entries(snap.data()?.items || {}).forEach(([k, v]: [string, any]) => {
              if (k !== log.id && v?.date === log.date) updates[`items.${k}`] = FieldValue.delete();
            });
          }
          tx.update(monthRef, updates);
        });

        return res.status(200).json({ success: true, id: log.id });
      }

      case 'deleteLog': {
        if (!id) {
          return res.status(400).json({ error: 'Missing log id' });
        }
        const logDoc = await db.collection('logs').doc(id).get();
        const logData = logDoc.exists ? logDoc.data() : null;
        const monthKey = logData?.date ? logData.date.slice(0, 7) : null;
        await audit({ action: 'deleteLog', logId: id, date: logData?.date || null, before: logData, after: null });

        await db.collection('logs').doc(id).delete();

        if (monthKey) {
          const monthRef = db.collection('logs_by_month').doc(monthKey);
          await monthRef.update({
            [`items.${id}`]: FieldValue.delete(),
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }

        return res.status(200).json({ success: true, id });
      }

      case 'updateSystemConfig': {
        if (!config || typeof config !== 'object') {
          return res.status(400).json({ error: 'Invalid config payload' });
        }
        try {
          const prev = (await db.collection('config').doc('system').get()).data() || {};
          // 바뀐 칸만 남김 (약관 전문 같은 긴 값도 그대로)
          const changedBefore = Object.fromEntries(Object.keys(config).map((k) => [k, prev[k] === undefined ? null : prev[k]]));
          await audit({ action: 'updateSystemConfig', before: changedBefore, after: config });
        } catch { /* 기록 실패해도 저장은 진행 */ }
        await db.collection('config').doc('system').set(config, { merge: true });
        return res.status(200).json({ success: true });
      }

      case 'updateGuide': {
        if (!guide || !guide.id) {
          return res.status(400).json({ error: 'Invalid guide payload' });
        }
        await db.collection('config').doc('patternGuides').set({
          [guide.id]: guide
        }, { merge: true });
        return res.status(200).json({ success: true });
      }

      case 'savePatchNote': {
        const { note } = payload || {};
        if (!note || !note.id) {
          return res.status(400).json({ error: 'Invalid patch note payload' });
        }
        await db.collection('patch_notes').doc(note.id).set(note, { merge: true });
        return res.status(200).json({ success: true, id: note.id });
      }

      case 'deletePatchNote': {
        const { id: patchId } = payload || {};
        if (!patchId) {
          return res.status(400).json({ error: 'Missing patch note id' });
        }
        await db.collection('patch_notes').doc(patchId).delete().catch(() => {});
        return res.status(200).json({ success: true, id: patchId });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[Admin Mutate Error]', {
      url: req.url,
      method: req.method,
      origin: req.headers?.origin || 'unknown',
      message: error?.message || error
    });
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : 'Server error occurred during data mutation'
    });
  }
}
