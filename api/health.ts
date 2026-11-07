import { setCorsHeaders } from './_cors.js';

/**
 * 상태 확인 + 주간 점검 보고서
 *  GET  /api/health                → 연결 확인
 *  GET  /api/health?weekly=last    → 마지막 주간 점검 시각 (공개: 시각만)
 *  POST /api/health?weekly=report  → GitHub '주간 점검' 결과를 받아 서버 쪽 점검(피드백·오류·DB·AI 분석)을 더해 저장
 *       진짜 GitHub 실행인지 GitHub 에 직접 물어봐서 확인 (공개 저장소라 토큰 없이)
 *       보고서 전체는 관리자만 (관리자 › 시스템 › 자동화 › 주간 점검 보고서). 응답에는 개인 내용 없이 숫자만
 */
const REPO = 'pizzahutofficialnoreply-hub/uzuhama3';
const DAY = 86400000;

async function verifyRun(runId: string) {
  if (!/^\d{5,20}$/.test(runId)) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}`, { headers: { 'User-Agent': 'uzuhama-weekly', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const run: any = await r.json();
  const fresh = Date.now() - Date.parse(run.created_at || '0') < 4 * 3600000;
  if (!fresh || !/weekly-check\.yml$/.test(run.path || '') || run.status === 'completed') return null;
  return run;
}

const toMs = (v: any) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : Date.parse(v || '') || 0);

async function serverSide(db: any) {
  const since = Date.now() - 7 * DAY;
  const out: any = {};
  // 피드백 (지난 7일)
  try {
    const snap = await db.collection('feedbacks').where('createdAt', '>=', new Date(since)).limit(500).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const byType: Record<string, number> = {};
    items.forEach((x: any) => { byType[x.type || 'etc'] = (byType[x.type || 'etc'] || 0) + 1; });
    const human = items.filter((x: any) => !['client_error', 'search_rating'].includes(x.type));
    const errors = items.filter((x: any) => x.type === 'client_error');
    const errTop = Object.entries(errors.reduce((a: any, e: any) => {
      const k = String(e.message || e.title || e.content || '').split('\n')[0].replace(/https?:\/\/\S+/g, '<url>').slice(0, 140);
      a[k] = (a[k] || 0) + 1; return a;
    }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10);
    const ratings = items.filter((x: any) => x.type === 'search_rating');
    out.feedback = {
      total: items.length, byType,
      pending: human.filter((x: any) => !x.status || x.status === 'pending').length,
      list: human.slice(0, 60).map((x: any) => ({ id: x.id, type: x.type, title: String(x.title || '').slice(0, 80), content: String(x.content || '').slice(0, 300), at: new Date(toMs(x.createdAt)).toISOString(), status: x.status || '' })),
      searchGood: ratings.filter((r: any) => r.good).length, searchBad: ratings.filter((r: any) => r.good === false).length,
    };
    out.clientErrors = { total: errors.length, top: errTop };
    // AI 총정리 (개인 정보는 빼고 주제만)
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (key && human.length) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: key });
        const text = human.slice(0, 80).map((x: any) => `- [${x.type}] ${String(x.title || '').slice(0, 60)} :: ${String(x.content || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
        for (const model of ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest']) {
          try {
            const r = await ai.models.generateContent({ model, contents: `팬 사이트 "우주하마 방송 예측"에 지난 7일 들어온 의견이야. 운영자가 한눈에 보게 총정리해 줘. 이름·연락처 같은 개인 정보는 쓰지 마.
JSON 으로만: {"summary":"전체 흐름 2~3문장","themes":[{"title":"주제","count":숫자,"detail":"무슨 내용인지 한 문장","action":"운영자가 할 일 한 문장"}],"urgent":["바로 봐야 할 것"]}

${text}`, config: { responseMimeType: 'application/json', temperature: 0.2, httpOptions: { timeout: 25000 } } });
            out.feedback.ai = JSON.parse(r.text || '{}');
            out.feedback.ai.model = model;
            break;
          } catch { /* 다음 모델 */ }
        }
      } catch { /* AI 없이 */ }
    }
  } catch (e: any) { out.feedbackError = String(e?.message || e).slice(0, 200); }

  // 관리자 작업 기록
  try {
    const a = await db.collection('admin_audit').where('at', '>=', new Date(since).toISOString()).limit(300).get();
    out.adminAudit = { total: a.size };
  } catch { /* 없음 */ }

  // DB 규모 (count 집계: 문서를 읽지 않음)
  out.db = {};
  for (const col of ['logs', 'feedbacks', 'push_subscriptions', 'ai_video', 'video_meta', 'patch_notes']) {
    try { out.db[col] = (await db.collection(col).count().get()).data().count; } catch { /* */ }
  }
  // AI 분석 · 검색 조정 · 끊긴 영상
  try { const ai = await import('./_aiVideo.js'); out.aiVideo = await ai.aiVideoStatus(db); delete out.aiVideo.modelCool; } catch { /* */ }
  try {
    const t = (await db.collection('config').doc('searchTuning').get()).data() || {};
    out.searchTuning = { lastLog: (t.log || [])[0] || null, pins: Object.values(t.pins || {}).reduce((a: number, v: any) => a + (v?.length || 0), 0) };
  } catch { /* */ }
  try {
    const dv = (await db.collection('config').doc('deadVideos').get()).data();
    if (dv) out.deadVideos = { count: dv.count ?? (dv.items || []).length, checkedAt: dv.checkedAt || dv.updatedAt || null };
  } catch { /* */ }
  return out;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const weekly = String(req.query?.weekly || '');
  if (!weekly) {
    return res.status(200).json({ status: 'ok', serverTime: new Date().toISOString(), message: 'Vercel Serverless Function 연결 정상' });
  }

  try {
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const meta = db.collection('weekly_reports').doc('_meta');
    res.setHeader('Cache-Control', 'no-store');

    if (weekly === 'last') {
      const m = (await meta.get()).data() || {};
      return res.status(200).json({ lastAt: m.lastAt || null });
    }

    if (weekly === 'report' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const run = await verifyRun(String(body.runId || ''));
      if (!run) return res.status(403).json({ error: '확인되지 않은 실행' });
      const server = await serverSide(db);
      const at = new Date().toISOString();
      const id = at.slice(0, 10);
      const results = body.results || {};
      const fails: string[] = [];
      const st = results.static || {};
      if (st.tsc === false) fails.push('타입 검사');
      if (st.vitest && st.vitest.failed) fails.push(`로직 테스트 ${st.vitest.failed}개`);
      if (st.build === false) fails.push('빌드');
      if (results.e2e?.failed) fails.push(`e2e ${results.e2e.failed}개`);
      const lu = results.live?.summary || {};
      if (lu.pageErrors) fails.push(`페이지 오류 ${lu.pageErrors}`);
      if (lu.loadFail) fails.push(`열리지 않는 화면 ${lu.loadFail}`);
      if (lu.consoleErrors) fails.push(`콘솔 오류 ${lu.consoleErrors}`);
      if (lu.overflowPages) fails.push(`가로 넘침 ${lu.overflowPages}화면`);
      if (lu.brokenImages) fails.push(`깨진 이미지 ${lu.brokenImages}`);
      const st2 = results.selftest?.summary;
      if (st2?.failed || results.selftest?.error) fails.push(`화면·기능 전체 점검 ${st2?.failed || 0}개${results.selftest?.error ? ' (중단)' : ''}`);
      const apiFails = (results.api?.checks || []).filter((c: any) => !c.ok);
      if (apiFails.length) fails.push(`API·DB·보안 ${apiFails.length}개`);
      if ((server.clientErrors?.total || 0) > 20) fails.push(`방문자 화면 오류 ${server.clientErrors.total}건`);
      const doc = {
        id, at, runId: String(run.id), runUrl: run.html_url, sha: run.head_sha,
        ok: fails.length === 0, fails,
        results: {
          static: st,
          e2e: results.e2e || null,
          live: results.live ? { summary: results.live.summary, problems: (results.live.runs || []).filter((r: any) => !r.ok || r.pageerror?.length || r.console?.length || r.overflow > 2 || r.broken?.length).slice(0, 40).map((r: any) => ({ host: r.host, view: r.view, scheme: r.scheme, page: r.page, err: r.err, pageerror: r.pageerror, console: (r.console || []).slice(0, 5), failed: (r.failed || []).slice(0, 5), overflow: r.overflow, wide: r.wide, broken: r.broken })) } : null,
          api: results.api ? { summary: results.api.summary, stats: results.api.stats, checks: results.api.checks } : null,
          selftest: results.selftest ? { summary: results.selftest.summary, error: results.selftest.error || '', results: (results.selftest.results || []).map((r: any) => ({ group: r.group, name: r.name, ok: r.ok, warn: Boolean(r.warn), err: r.err || '', ms: r.ms })) } : null,
        },
        server,
      };
      await db.collection('weekly_reports').doc(id).set(JSON.parse(JSON.stringify(doc))); // undefined 빼기
      await meta.set({ lastAt: at, lastId: id, lastOk: doc.ok }, { merge: true });
      // 응답(공개 로그에 남음)에는 숫자만
      return res.status(200).json({
        ok: true, id, fails,
        feedback: { total: server.feedback?.total || 0, pending: server.feedback?.pending || 0 },
        clientErrors: server.clientErrors?.total || 0,
        aiVideo: server.aiVideo ? { done: server.aiVideo.done, total: server.aiVideo.total } : null,
      });
    }
    return res.status(400).json({ error: 'unknown' });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e).slice(0, 200) });
  }
}
