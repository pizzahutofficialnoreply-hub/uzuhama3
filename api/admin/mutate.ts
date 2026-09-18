import { setCorsHeaders, verifyAdmin, db } from '../_firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 관리자 토큰 검증
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

    switch (action) {
      case 'addLog': {
        if (!log || !log.id || !log.date) {
          return res.status(400).json({ error: 'Invalid log payload' });
        }
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
        await db.collection('logs').doc(log.id).set(log, { merge: true });

        const monthKey = log.date.slice(0, 7);
        const monthRef = db.collection('logs_by_month').doc(monthKey);
        await monthRef.set({
          month: monthKey,
          updatedAt: new Date().toISOString(),
          items: { [log.id]: log }
        }, { merge: true });

        return res.status(200).json({ success: true, id: log.id });
      }

      case 'deleteLog': {
        if (!id) {
          return res.status(400).json({ error: 'Missing log id' });
        }
        const logDoc = await db.collection('logs').doc(id).get();
        const logData = logDoc.exists ? logDoc.data() : null;
        const monthKey = logData?.date ? logData.date.slice(0, 7) : null;

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

      case 'savePoll': {
        const { poll } = payload || {};
        if (!poll || !poll.id) {
          return res.status(400).json({ error: 'Invalid poll payload' });
        }
        await db.collection('polls').doc(poll.id).set(poll, { merge: true });
        await db.collection('config').doc('system').set({ activePoll: poll }, { merge: true });
        return res.status(200).json({ success: true });
      }

      case 'deletePoll': {
        const { pollId } = payload || {};
        if (pollId) {
          await db.collection('polls').doc(pollId).delete().catch(() => {});
        }
        await db.collection('config').doc('system').update({
          activePoll: FieldValue.delete()
        }).catch(async () => {
          await db.collection('config').doc('system').set({ activePoll: null }, { merge: true });
        });
        return res.status(200).json({ success: true });
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
    return res.status(error?.message?.includes('관리자') ? 403 : 500).json({
      error: error?.message || 'Server error occurred during data mutation'
    });
  }
}
