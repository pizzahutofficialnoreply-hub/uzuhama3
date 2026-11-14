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
    const { verifyAdmin, db, auth: adminAuth } = await import('../_firebase.js');
    const { FieldValue } = await import('firebase-admin/firestore');

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

    // ── 2단계 인증 (구글 로그인만 된 상태에서 쓰는 것) ──
    if (String(action).startsWith('mfa')) {
      const u = await verifyAdmin(req, { require2fa: false });
      const m = await import('../_adminAuth.js');
      const logA = (entry: any) => db.collection('admin_audit').add({ ...entry, by: u.email || null, at: new Date().toISOString() }).catch(() => {});
      if (action === 'mfaStatus') return res.status(200).json({ success: true, ...(await m.mfaStatus(db, u)) });
      if (action === 'mfaBeginSetup') return res.status(200).json({ success: true, ...(await m.mfaBeginSetup(db, u)) });
      if (action === 'mfaConfirmSetup') { const r = await m.mfaConfirmSetup(db, adminAuth, u, String(payload.code || ''), req); await logA({ action: 'mfa_setup' }); return res.status(200).json({ success: true, ...r }); }
      if (action === 'mfaVerify') {
        try { const r = await m.mfaVerify(db, adminAuth, u, String(payload.code || ''), req); await logA({ action: 'mfa_login' }); return res.status(200).json({ success: true, ...r }); }
        catch (e: any) { await logA({ action: 'mfa_fail', reason: String(e?.message || e).slice(0, 80) }); throw e; }
      }
      if (action === 'mfaLogoutAll') { await m.mfaLogoutAll(db, adminAuth, u); await logA({ action: 'mfa_logout_all' }); return res.status(200).json({ success: true, summary: '모든 기기에서 관리자 로그아웃했어요' }); }
      if (action === 'mfaGoogleOnce') { const r = await m.mfaGoogleOnce(db, adminAuth, u, req); await logA({ action: 'mfa_login', how: 'google_only_temp' }); return res.status(200).json({ success: true, ...r }); }
      if (action === 'mfaChallenge') return res.status(200).json({ success: true, ...(await m.mfaChallenge(db)) });
      if (action === 'mfaNewRecovery') { const r = await m.mfaNewRecovery(db, u); await logA({ action: 'mfa_new_recovery' }); return res.status(200).json({ success: true, ...r }); }
      if (action === 'mfaReset') { await m.mfaReset(db, adminAuth, u); await logA({ action: 'mfa_reset' }); return res.status(200).json({ success: true }); }
      return res.status(400).json({ error: 'unknown mfa action' });
    }

    // 관리자 토큰 검증 (보안 필수): 구글 + 2단계 인증
    const adminUser = await verifyAdmin(req);
    console.log(`[Admin Mutate] Authorized request by ${adminUser.email}`);

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
      case 'uploadImage': {
        // 헤더 장식 그림·GIF: 그림 저장소(images)에 바이너리로 → 주소
        const { saveImage } = await import('../health.js');
        try {
          const out = await saveImage(db, String(payload.data || ''), { kind: 'decor', by: adminUser.email || null });
          await audit({ action: 'uploadImage', target: out.id });
          return res.status(200).json({ success: true, ...out });
        } catch (e: any) { return res.status(e?.status || 500).json({ error: String(e?.message || e) }); }
      }
      // ── DB 전체 백업·복원 ──
      case 'backupList': {
        const b = await import('../_backup.js');
        return res.status(200).json({ success: true, format: b.BACKUP_FORMAT, version: b.BACKUP_VERSION, collections: await b.listBackupCollections(db) });
      }
      case 'backupExport': {
        const b = await import('../_backup.js');
        const col = String(payload.col || '');
        if (!/^[\w-]{1,100}$/.test(col)) return res.status(400).json({ error: '컬렉션 이름이 이상해요' });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, ...(await b.exportPage(db, col, payload.after ? String(payload.after) : null, Number(payload.limit) || 300)) });
      }
      case 'backupImport': {
        const b = await import('../_backup.js');
        const r = await b.importDocs(db, String(payload.col || ''), Array.isArray(payload.docs) ? payload.docs : []);
        if (payload.first) { await b.noteImport(db, { file: String(payload.file || '').slice(0, 120), exportedAt: String(payload.exportedAt || '').slice(0, 40), by: adminUser?.email ? 'admin' : '' }); await audit({ action: 'backupImport', target: String(payload.file || '').slice(0, 80) }); }
        return res.status(200).json({ success: true, ...r });
      }
      case 'tuneSearch': {
        // 관리자 '지금 조정': 오늘 이미 했어도 다시
        const { tuneSearch } = await import('../_searchTune.js');
        const r = await tuneSearch(db, { force: true });
        return res.status(200).json({ success: true, ...r });
      }
      case 'dataCheck': {
        // 데이터 검증: get(결과 보기) · run(지금 검증) · apply(제안 적용) · ignore(무시)
        const dc = await import('../_dataCheck.js');
        const op = String(payload.op || 'get');
        if (op === 'run') return res.status(200).json({ success: true, ...(await dc.runDataCheck(db)) });
        if (op === 'apply') {
          const before = (await db.collection('admin_data').doc('dataCheck').get()).data();
          const issue = (before?.issues || []).find((x: any) => x.id === payload.id);
          if (issue?.logId) await audit({ action: 'data_fix', target: issue.logId, before: (await db.collection('logs').doc(issue.logId).get()).data() || null });
          return res.status(200).json({ success: true, ...(await dc.applyDataFix(db, String(payload.id || ''))) });
        }
        if (op === 'ignore') { await dc.ignoreDataIssue(db, String(payload.id || '')); return res.status(200).json({ success: true }); }
        const d = (await db.collection('admin_data').doc('dataCheck').get()).data() || {};
        return res.status(200).json({ success: true, at: d.at || null, stats: d.stats || null, counts: d.counts || {}, issues: d.issues || [], applied: (d.applied || []).slice(-20) });
      }
      case 'checkDeadVideos': {
        const { checkDeadVideos } = await import('../_deadVideos.js');
        const r = await checkDeadVideos(db, { force: true });
        return res.status(200).json({ success: true, ...r });
      }
      case 'resetSearchTuning': {
        // 직접 추가한 검색 결과(pins)는 남김
        await db.collection('config').doc('searchTuning').set({ updatedAt: new Date().toISOString(), demote: {}, conceptDemote: {}, synonyms: {}, conceptAdd: {}, log: [] }, { mergeFields: ['updatedAt', 'demote', 'conceptDemote', 'synonyms', 'conceptAdd', 'log'] });
        await db.collection('notification_state').doc('searchTune').set({ conceptCounts: {} }, { merge: true });
        return res.status(200).json({ success: true });
      }
      case 'pinSearch': {
        // 검색 결과 추가하기: 이 검색어에 이 영상(장면)을 맨 위에
        const sq = (x: string) => String(x || '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
        const p = payload || {};
        const key = sq(p.query);
        const vid = String(p.videoId || '');
        if (!key || !/^[\w-]{11}$/.test(vid)) return res.status(400).json({ error: '검색어와 유튜브 영상이 필요해요' });
        let title = String(p.title || '').slice(0, 200);
        if (!title) {
          try {
            const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}`, { signal: AbortSignal.timeout(4000) });
            if (r.ok) title = String(((await r.json()) as any).title || '');
          } catch { /* 제목 없이 */ }
        }
        const ref = db.collection('config').doc('searchTuning');
        const cur = (await ref.get()).data() || {};
        const pins = { ...(cur.pins || {}) };
        const t = Number.isFinite(Number(p.t)) && Number(p.t) > 0 ? Math.round(Number(p.t)) : null;
        const entry = { id: vid, t, title, note: String(p.note || '').slice(0, 200), source: String(p.sourceUrl || '').slice(0, 300), query: String(p.query).slice(0, 60), at: new Date().toISOString() };
        pins[key] = [entry, ...(pins[key] || []).filter((x: any) => !(x.id === vid && (x.t || null) === t))].slice(0, 10);
        await ref.set({ pins, updatedAt: new Date().toISOString() }, { merge: true });
        if (p.feedbackId) await db.collection('feedbacks').doc(String(p.feedbackId)).set({ status: 'applied', appliedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        await audit({ action, query: entry.query, videoId: vid });
        return res.status(200).json({ success: true, summary: `'${entry.query}' 검색에 추가했어요${title ? `: ${title}` : ''}` });
      }
      case 'unpinSearch': {
        const p = payload || {};
        const ref = db.collection('config').doc('searchTuning');
        const cur = (await ref.get()).data() || {};
        const pins = { ...(cur.pins || {}) };
        pins[p.key] = (pins[p.key] || []).filter((x: any) => !(x.id === p.videoId && (x.t || null) === (p.t ?? null)));
        if (!pins[p.key].length) delete pins[p.key];
        await ref.set({ pins }, { merge: true });
        await ref.update({ [`pins.${p.key}`]: pins[p.key] || (await import('firebase-admin/firestore')).FieldValue.delete() }).catch(() => {});
        return res.status(200).json({ success: true, summary: '뺐어요' });
      }
      case 'rulesStatus':
      case 'deployRules': {
        // Firestore 보안 규칙: 지금 적용된 것과 저장소의 firestore.rules 비교 / 적용
        const { getSecurityRules } = await import('firebase-admin/security-rules');
        const { adminApp } = await import('../_firebase.js');
        const { FIRESTORE_RULES } = await import('../_firestoreRules.js');
        const sr = getSecurityRules(adminApp);
        let deployed = '';
        let deployedAt = '';
        try { const rs = await sr.getFirestoreRuleset(); deployed = rs.source?.[0]?.content || ''; deployedAt = rs.createTime || ''; } catch (e: any) { deployed = ''; deployedAt = `읽기 실패: ${String(e?.message || e).slice(0, 120)}`; }
        const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
        const same = Boolean(deployed) && norm(deployed) === norm(FIRESTORE_RULES);
        if (action === 'rulesStatus') return res.status(200).json({ success: true, same, deployedAt, deployedPreview: deployed.slice(0, 4000) });
        if (same) return res.status(200).json({ success: true, summary: '이미 최신 보안 규칙이에요' });
        const rs = await sr.releaseFirestoreRulesetFromSource(FIRESTORE_RULES);
        await audit({ action, ruleset: rs.name });
        return res.status(200).json({ success: true, summary: `보안 규칙을 적용했어요 (${rs.createTime})` });
      }
      case 'weeklyReports': {
        // 주간 점검 보고서 (최근 8개)
        const snap = await db.collection('weekly_reports').orderBy('at', 'desc').limit(9).get();
        return res.status(200).json({ success: true, reports: snap.docs.filter((d: any) => d.id !== '_meta').map((d: any) => d.data()).slice(0, 8) });
      }
      case 'aiVideo': {
        // AI 영상 분석: 멈춤 / 다시 / 지금 한 구간
        const op = String(payload?.op || '');
        const stRef = db.collection('youtube_cache').doc('ai_state');
        if (op === 'pause' || op === 'resume') {
          await stRef.set({ paused: op === 'pause' }, { merge: true });
          return res.status(200).json({ success: true, summary: op === 'pause' ? '멈췄어요' : '다시 시작해요' });
        }
        if (op === 'refreshQueue') {
          await db.collection('youtube_cache').doc('ai_queue').set({ fetchedAt: '1970-01-01T00:00:00Z' }, { merge: true });
          return res.status(200).json({ success: true, summary: '다음 분석 때 영상 목록을 새로 받아요 (방송 기록의 생방송 다시보기 포함)' });
        }
        const ai = await import('../_aiVideo.js');
        if (op === 'run') {
          // 분석은 최대 몇 분 걸려서 바로 돌아오고, 이 함수가 뒤에서 이어서 (최대 300초)
          await stRef.set({ coolUntil: 0 }, { merge: true });
          const { waitUntil } = await import('@vercel/functions');
          waitUntil(ai.runAiVideoLoop(db, 120000).catch(() => {}));
          return res.status(200).json({ success: true, summary: '분석을 시작했어요. 1~4분 뒤 새로 고침해 보세요.' });
        }
        return res.status(200).json({ success: true, ...(await ai.aiVideoStatus(db)) });
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
              if (k !== log.id && v?.date === log.date && !v?._patch) updates[`items.${k}`] = FieldValue.delete();
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
      error: error?.status ? error.message : /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(error?.message || error)) ? '오늘 DB 무료 사용량(하루 5만 번 읽기)을 다 써서 지금은 저장할 수 없어요. 한국 시간 오후 5시쯤 다시 풀려요.' : `저장 중 서버 오류: ${String(error?.message || error).slice(0, 120)}`,
      ...(error?.code === 'mfa_required' ? { code: 'mfa_required' } : {}),
    });
  }
}
