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

/* ── 기기 연결 (로그인 없이 QR·코드로) ──
 * POST ?sync=pair {key}       → 10분짜리 8자리 연결 코드 (한 번만)
 * POST ?sync=join {code}      → 열쇠 (코드는 바로 지움, IP마다 시간당 30번까지)
 * POST ?sync=pull {key}       → {data, rev}
 * POST ?sync=push {key,rev,data} → rev 가 다르면 409 (다시 받아 합치기)
 * POST ?sync=delete {key}     → 모든 기기 연결 끊기
 * 서버에는 열쇠를 SHA-256 으로 바꾼 이름만 (열쇠 자체는 연결 코드 10분 동안만)
 */
const SYNC_MAX = 400_000;
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
async function syncHandler(op: string, req: any, res: any) {
  const { db } = await import('./_firebase.js');
  const crypto = await import('node:crypto');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const hash = (k: string) => crypto.createHash('sha256').update(`uzuhama-sync:${k}`).digest('hex');
  const validKey = (k: any) => typeof k === 'string' && /^[a-f0-9]{40}$/.test(k);
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const limit = async (what: string, max: number) => {
    const id = `${what}_${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}_${new Date().toISOString().slice(0, 13)}`;
    const ref = db.collection('device_sync_rl').doc(id);
    const n = await db.runTransaction(async (tx: any) => { const c = Number(((await tx.get(ref)).data() || {}).n || 0) + 1; tx.set(ref, { n: c, exp: new Date(Date.now() + 2 * 3600000) }); return c; });
    if (n > max) throw Object.assign(new Error('잠시 뒤에 다시 해 주세요'), { status: 429 });
  };
  try {
    if (op === 'join') {
      await limit('join', 30);
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 8) return res.status(400).json({ error: '코드는 8자리예요' });
      const ref = db.collection('device_sync_pair').doc(code);
      const key = await db.runTransaction(async (tx: any) => {
        const d = (await tx.get(ref)).data();
        if (!d) return null;
        tx.delete(ref);
        return Number(d.exp?.toMillis?.() || d.expMs || 0) > Date.now() ? d.key : null;
      });
      if (!key) return res.status(404).json({ error: '코드가 맞지 않거나 시간이 지났어요' });
      return res.status(200).json({ key });
    }
    if (!validKey(body.key)) return res.status(400).json({ error: 'bad key' });
    const ref = db.collection('device_sync').doc(hash(body.key));
    if (op === 'pair') {
      await limit('pair', 40);
      let code = '';
      for (let i = 0; i < 8; i++) code += CODE_ABC[crypto.randomInt(CODE_ABC.length)];
      const expMs = Date.now() + 10 * 60000;
      await db.collection('device_sync_pair').doc(code).set({ key: body.key, expMs, exp: new Date(expMs) });
      // 처음 만드는 연결이면 빈 문서
      await ref.set({ touchedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ code, exp: expMs });
    }
    if (op === 'pull') {
      const d = (await ref.get()).data();
      if (!d) return res.status(404).json({ error: 'not linked' });
      return res.status(200).json({ data: d.data || null, rev: Number(d.rev || 0) });
    }
    if (op === 'push') {
      const data = String(body.data || '');
      if (data.length > SYNC_MAX) return res.status(413).json({ error: '너무 커요' });
      try { JSON.parse(data); } catch { return res.status(400).json({ error: 'bad data' }); }
      const r = await db.runTransaction(async (tx: any) => {
        const d = (await tx.get(ref)).data() || {};
        if (Number(d.rev || 0) !== Number(body.rev || 0)) return { conflict: true };
        tx.set(ref, { data, rev: Number(d.rev || 0) + 1, updatedAt: new Date().toISOString(), touchedAt: new Date().toISOString() }, { merge: true });
        return { rev: Number(d.rev || 0) + 1 };
      });
      if ((r as any).conflict) return res.status(409).json({ error: 'conflict' });
      return res.status(200).json({ ok: true, rev: (r as any).rev });
    }
    if (op === 'delete') {
      await ref.delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'unknown' });
  } catch (e: any) {
    return res.status(e?.status || 500).json({ error: String(e?.message || e).slice(0, 160) });
  }
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

/**
 * 클라우드 점검: 휴대폰 대신 서버 쪽(GitHub 백그라운드 작업의 브라우저, 아이폰 크기·터치)에서 '내 앱 점검'을 돌림
 *  POST ?selftest=request {deep, vid} → 줄 세우기 (한 번에 하나, 기기당 하루 5번)
 *  GET  ?selftest=status&id=          → 진행 상황·결과
 *  POST ?selftest=cancel&id=          → 중단
 */
async function cloudSelftest(op: string, req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const { db, hasAdminCredentials } = await import('./_firebase.js');
  if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
  const col = db.collection('selftest_runs');
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const pub = (id: string, d: any) => ({ id, status: d.status, deep: d.deep, stage: d.stage || '', results: d.results || [], queuedAt: d.queuedAt, startedAt: d.startedAt || null, endedAt: d.endedAt || null, error: d.error || '', position: d.position || 0 });
  if (op === 'status') {
    const id = String(req.query?.id || '');
    if (!/^[\w-]{6,40}$/.test(id)) return res.status(400).json({ error: 'id' });
    const d = (await col.doc(id).get()).data();
    if (!d) return res.status(404).json({ error: '없어요' });
    // 오래 소식 없는 실행은 끝난 것으로 (작업이 꺼진 경우)
    const last = Date.parse(d.beatAt || d.startedAt || d.queuedAt || 0);
    if ((d.status === 'running' && Date.now() - last > 10 * 60000) || (d.status === 'queued' && Date.now() - last > 30 * 60000)) {
      await col.doc(id).set({ status: 'error', error: d.status === 'queued' ? '점검 서버가 받아 가지 않았어요' : '점검이 중간에 멈췄어요', endedAt: new Date().toISOString() }, { merge: true });
      d.status = 'error';
    }
    return res.status(200).json(pub(id, d));
  }
  if (op === 'pending') {
    // 워커가 2분마다: 줄 선 점검이 있으면 GitHub 의 점검 작업(selftest.yml)을 바로 깨움
    const q = await col.where('status', '==', 'queued').limit(5).get();
    return res.status(200).json({ queued: q.size });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  if (op === 'cancel') {
    const id = String(req.query?.id || body.id || '');
    if (!/^[\w-]{6,40}$/.test(id)) return res.status(400).json({ error: 'id' });
    const ref = col.doc(id);
    const d = (await ref.get()).data();
    if (d && (d.status === 'queued' || d.status === 'running')) await ref.set({ status: 'cancel', endedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ ok: true });
  }
  // ── 백그라운드 작업(GitHub)이 가져가고 진행을 적음: 실제로 돌고 있는 이 저장소의 worker 실행인지 GitHub 에 확인 ──
  if (op === 'claim') {
    const q = await col.where('status', '==', 'queued').limit(5).get();
    if (q.empty) return res.status(200).json({});
    const runId = String(body.run || '');
    if (!/^\d{5,20}$/.test(runId)) return res.status(400).json({ error: 'run' });
    const gr = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}`, { headers: { 'User-Agent': 'uzuhama-worker', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    const run: any = gr && gr.ok ? await gr.json() : null;
    if (!run || !/(worker|selftest)\.yml$/.test(run.path || '') || run.status === 'completed') return res.status(403).json({ error: 'not a worker run' });
    const first = q.docs.sort((a: any, b: any) => String(a.data().queuedAt).localeCompare(String(b.data().queuedAt)))[0];
    const took = await db.runTransaction(async (tx: any) => {
      const d = (await tx.get(first.ref)).data();
      if (d?.status !== 'queued') return null;
      tx.update(first.ref, { status: 'running', runId, startedAt: new Date().toISOString(), beatAt: new Date().toISOString(), stage: '점검 서버가 브라우저를 여는 중…' });
      return d;
    });
    return res.status(200).json(took ? { id: first.id, deep: Boolean(took.deep) } : {});
  }
  if (op === 'progress') {
    const id = String(body.id || '');
    if (!/^[\w-]{6,40}$/.test(id)) return res.status(400).json({ error: 'id' });
    const ref = col.doc(id);
    const d = (await ref.get()).data();
    if (!d || String(d.runId || '') !== String(body.run || '')) return res.status(403).json({ error: 'run' });
    if (d.status !== 'running') return res.status(200).json({ status: d.status });
    const results = (Array.isArray(body.results) ? body.results : []).slice(0, 400).map((r: any) => ({ group: String(r.group || '').slice(0, 40), name: String(r.name || '').slice(0, 160), ok: Boolean(r.ok), warn: Boolean(r.warn), ms: Number(r.ms) || 0, ...(r.err ? { err: String(r.err).slice(0, 300) } : {}), details: (Array.isArray(r.details) ? r.details : []).slice(0, 15).map((x: any) => String(x).slice(0, 200)) }));
    const upd: any = { beatAt: new Date().toISOString(), stage: String(body.stage || '').slice(0, 200), results };
    if (body.final === 'done' || body.final === 'error') Object.assign(upd, { status: body.final, endedAt: new Date().toISOString(), error: String(body.error || '').slice(0, 300) });
    await ref.set(upd, { merge: true });
    return res.status(200).json({ status: upd.status || 'running' });
  }
  if (op === 'request') {
    const vid = String(body.vid || '').replace(/[^\w-]/g, '').slice(0, 40) || 'anon';
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const mine = await col.where('vid', '==', vid).where('day', '==', day).limit(6).get();
    if (mine.size >= 5) return res.status(429).json({ error: '오늘은 클라우드 점검을 5번 했어요. 내일 다시 해 주세요.' });
    const active = await col.where('status', 'in', ['queued', 'running']).limit(5).get();
    const ref = col.doc();
    const d = { status: 'queued', deep: Boolean(body.deep), vid, day, queuedAt: new Date().toISOString(), position: active.size };
    await ref.set(d);
    return res.status(200).json(pub(ref.id, d));
  }
  return res.status(400).json({ error: 'op' });
}

/**
 * 그림 저장소: 의견 보내기 사진·헤더 그림·GIF 를 글자(base64)로 문서 안에 넣지 않고
 * images/{id} 에 '바이너리'로 따로 두고, 주소(/api/health?img=id)로 그림 파일처럼 내려 줌 (한 번 받으면 브라우저·CDN 이 1년 보관)
 *  POST ?img=upload {data: dataURL, kind: 'feedback'} → {id, url}   (방문자: 기기당 하루 12장)
 *  GET  ?img=<id>                                     → 그림
 * 관리자 그림(헤더 장식)은 admin/mutate 의 uploadImage 로 (같은 저장 방식)
 */
const IMG_MAX = 950_000;
const IMG_TYPES = /^image\/(jpeg|png|gif|webp)$/;
export async function saveImage(db: any, dataUrl: string, meta: Record<string, any>) {
  const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !IMG_TYPES.test(m[1])) throw Object.assign(new Error('그림 파일(jpg·png·gif·webp)만 올릴 수 있어요'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > IMG_MAX) throw Object.assign(new Error('그림이 너무 커요 (최대 약 900KB)'), { status: 413 });
  const ref = db.collection('images').doc();
  await ref.set({ bytes: buf, type: m[1], size: buf.length, at: new Date().toISOString(), ...meta });
  return { id: ref.id, url: `https://uzuhama.vercel.app/api/health?img=${ref.id}` };
}
/** 예전 의견의 사진(문서 안 base64 글자)을 그림 저장소로 옮기고 주소로 바꿈 (한 번에 최대 100개, 다 옮기면 표시해 두고 안 함) */
export async function migrateFeedbackImages(db: any) {
  const flag = db.collection('notification_state').doc('imageMigrate');
  if ((await flag.get()).data()?.done) return { skipped: true };
  const snap = await db.collection('feedbacks').orderBy('createdAt', 'desc').limit(300).get();
  let moved = 0;
  for (const d of snap.docs) {
    const imgs = d.data()?.attachments?.images;
    if (!Array.isArray(imgs) || !imgs.some((x: any) => /^data:image\//.test(String(x)))) continue;
    const urls: string[] = [];
    for (const x of imgs) {
      if (!/^data:image\//.test(String(x))) { urls.push(String(x)); continue; }
      try { urls.push((await saveImage(db, String(x), { kind: 'feedback', from: d.id })).url); moved++; } catch { /* 너무 크거나 이상한 건 버림 */ }
    }
    await d.ref.set({ attachments: { images: urls } }, { merge: true });
    if (moved >= 100) return { moved, more: true };
  }
  await flag.set({ done: true, at: new Date().toISOString(), moved }, { merge: true });
  return { moved };
}

async function imageHandler(op: string, req: any, res: any) {
  const { db, hasAdminCredentials } = await import('./_firebase.js');
  if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
  if (op === 'upload') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
    const vid = String(body.vid || '').replace(/[^\w-]/g, '').slice(0, 40) || 'anon';
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const cRef = db.collection('notification_state').doc('imageUploads');
    const c = (await cRef.get()).data() || {};
    const n = c.day === day ? Number(c[vid] || 0) : 0;
    if (n >= 12) return res.status(429).json({ error: '오늘은 사진을 더 올릴 수 없어요' });
    try {
      const out = await saveImage(db, body.data, { kind: 'feedback', vid });
      await cRef.set(c.day === day ? { [vid]: n + 1 } : { day, [vid]: 1 }, { merge: c.day === day });
      return res.status(200).json(out);
    } catch (e: any) { return res.status(e?.status || 500).json({ error: String(e?.message || e) }); }
  }
  if (!/^[A-Za-z0-9]{10,40}$/.test(op)) return res.status(400).end();
  const d = (await db.collection('images').doc(op).get()).data();
  if (!d?.bytes) return res.status(404).end();
  const buf: Buffer = Buffer.isBuffer(d.bytes) ? d.bytes : Buffer.from(d.bytes.toUint8Array ? d.bytes.toUint8Array() : d.bytes);
  res.setHeader('Content-Type', d.type || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(buf);
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // naver.me 짧은 주소 → 원래 주소 (카페 글 모으기 북마클릿이 카페 화면에서 부름 · DB 안 읽음 · 주소만 풀어 줌)
  if (req.query?.titles) {
    // 카페 모으기(북마클릿) '4: 사이트 영상 제목으로 찾기': 방송 기록에 있는 편집 영상 제목 목록 (공개 정보만)
    //  need=1: 생방 링크가 없는 기록·자동 연결로 들어간 것·제목만 있는 칸 먼저
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const { loadSiteLogs } = await import('./_siteLogs.js');
    const logs = (await loadSiteLogs(db)).logs as any[];
    const seen = new Set<string>();
    const out: any[] = [];
    for (const l of logs) {
      if (!l || l.isAbsence) continue;
      const noVod = !(l.vods || []).some((v: any) => /youtu/.test(String(v?.url || v || '')));
      for (const e of l.edited || []) {
        const t = String(e?.title || '').trim();
        if (!t || e?.isCompilation || seen.has(t)) continue;
        seen.add(t);
        out.push({ t, d: l.date, need: noVod || Boolean(e?.autoLinked) || !e?.url ? 1 : 0 });
      }
    }
    out.sort((a, b) => b.need - a.need || String(b.d).localeCompare(String(a.d)));
    return res.status(200).json({ titles: out.slice(0, 3000) });
  }
  if (req.query?.unshort) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const u = String(req.query.unshort);
    if (!/^https:\/\/naver\.me\/[\w-]{4,20}$/.test(u)) return res.status(400).json({ error: 'naver.me 주소만 돼요' });
    try {
      let cur = u;
      for (let i = 0; i < 4 && /naver\.me\//.test(cur); i++) {
        const r = await fetch(cur, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
        const loc = r.headers.get('location');
        if (!loc) break;
        cur = new URL(loc, cur).toString();
      }
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return res.status(200).json({ url: cur });
    } catch (e: any) { return res.status(502).json({ error: String(e?.message || e) }); }
  }
  // AI가 영상에서 본 게임 (생방쏭 가져오기: 카페에 적힌 게임이 그 생방송에 나왔는지) — 영상 수만큼 읽기
  if (req.query?.aigames) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const ids = [...new Set(String(req.query.aigames).split(',').filter((x) => /^[\w-]{11}$/.test(x)))].slice(0, 50);
    if (!ids.length) return res.status(400).json({ error: 'ids' });
    const { db } = await import('./_firebase.js');
    const snaps = await db.getAll(...ids.map((i) => db.collection('ai_video').doc(i)));
    const games: Record<string, { status: string; names: string[] }> = {};
    snaps.forEach((d: any, i: number) => { const x = d.exists ? d.data() : null; games[ids[i]] = { status: x?.status || 'none', names: (x?.games || []).flatMap((g: any) => [g?.name, g?.ko, ...(g?.aliases || [])]).filter(Boolean) }; });
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(200).json({ games });
  }
  // 재생목록 영상 + 생방송 시작 시각 (관리자 확인용: 기록과 비교) — DB 안 읽음, 유튜브 50개당 2단위
  if (req.query?.playlist) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const pl = String(req.query.playlist).replace(/[^\w-]/g, '').slice(0, 64);
    try {
      const { playlistIds } = await import('./_aiVideo.js');
      const items: any[] = await playlistIds(pl);
      const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY || '';
      for (let i = 0; i < items.length; i += 50) {
        const part = items.slice(i, i + 50);
        const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,contentDetails&id=${part.map((x) => x.id).join(',')}&key=${key}`, { signal: AbortSignal.timeout(10000) });
        const j: any = await r.json();
        const m = new Map((j.items || []).map((v: any) => [v.id, v]));
        part.forEach((x) => { const v: any = m.get(x.id); x.liveAt = v?.liveStreamingDetails?.actualStartTime || null; x.duration = v?.contentDetails?.duration || ''; });
      }
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(200).json({ items });
    } catch (e: any) { return res.status(502).json({ error: String(e?.message || e) }); }
  }
  // 스팀에서 게임 이름으로 찾기 (생방쏭 가져오기: 게임 링크 채우기) — DB 안 읽음
  if (req.query?.steam) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const term = String(req.query.steam).slice(0, 120);
    try {
      const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=KR`, { signal: AbortSignal.timeout(7000) });
      const j: any = await r.json();
      const items = (j?.items || []).slice(0, 5).map((x: any) => ({ id: x.id, name: x.name, link: `https://store.steampowered.com/app/${x.id}/` }));
      res.setHeader('Cache-Control', 'public, s-maxage=604800');
      return res.status(200).json({ items });
    } catch (e: any) { return res.status(502).json({ error: String(e?.message || e) }); }
  }
  // 공개 설정 (Vercel 환경 변수에서, DB 안 읽음): 유튜브 재생목록 저장용 구글 OAuth 클라이언트 ID 등
  if (req.query?.pubcfg) {
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ youtubeOAuthClientId: String(process.env.YOUTUBE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim() });
  }
  const sync = String(req.query?.sync || '');
  if (sync) return syncHandler(sync, req, res);
  const img = String(req.query?.img || '');
  if (img) return imageHandler(img, req, res);
  const st = String(req.query?.selftest || '');
  if (st) return cloudSelftest(st, req, res);
  // ── Cloudflare 워커(예약 실행)가 부르는 것들 ──
  if (req.query?.yt === 'sync') {
    // 새 편집 영상을 방송 기록 '편집본'에 자동 연결 (10분에 한 번만 실제로)
    res.setHeader('Cache-Control', 'no-store');
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const { ytSync } = await import('./_ytSync.js');
    return res.status(200).json(await ytSync(db));
  }
  if (req.query?.sheetcheck) {
    // 스프레드시트(생방송 아카이브 V3) ↔ 사이트 기록 대조: 관리자가 저장한 구글 시트 주소(링크 있는 사람 보기)에서 xlsx 를 받아 비교
    // 워커가 하루 한 번 부름 (시트가 바뀌었을 때만 다시 비교) · 결과는 관리자 › 연동 › 스프레드시트 대조
    res.setHeader('Cache-Control', 'no-store');
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const sys = (await db.collection('config').doc('system').get()).data() || {};
    const id = (String(sys.archiveSheetUrl || '').match(/\/spreadsheets\/d\/([\w-]{20,})/) || [])[1];
    if (!id) return res.status(200).json({ ok: false, reason: '시트 주소가 없어요 (관리자 › 연동 › 스프레드시트 대조)' });
    try {
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
      if (!r.ok) return res.status(200).json({ ok: false, reason: `시트를 못 받았어요 (${r.status}) · 공유를 '링크가 있는 모든 사용자'로 해 주세요` });
      const buf = new Uint8Array(await r.arrayBuffer());
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha1').update(buf).digest('hex');
      const ref = db.collection('youtube_cache').doc('sheet_check');
      const prev = (await ref.get()).data() || {};
      if (prev.hash === hash && req.query?.force !== '1') return res.status(200).json({ ok: true, same: true, at: prev.at });
      const { readXlsx, compareSheet } = await import('../src/utils/sheetCompare.js');
      const { loadSiteLogs } = await import('./_siteLogs.js');
      const rows = readXlsx(buf);
      const out = compareSheet(rows, (await loadSiteLogs(db, { maxAgeMs: 0 })).logs);
      // 그날 오팬무·오음무·오저무 (AI 요약보다 먼저 보여 줌)
      const byDate: Record<string, any> = {};
      for (const x of rows) { const e: any = {}; if (x.pan) e.pan = x.pan; if (x.eum) e.eum = x.eum; if (x.jeo) e.jeo = x.jeo; if (Object.keys(e).length) byDate[x.date] = { ...(byDate[x.date] || {}), ...e }; }
      await db.collection('config').doc('sheetExtra').set({ at: new Date().toISOString(), byDate });
      await ref.set({ hash, at: new Date().toISOString(), total: out.total, same: out.same, range: out.range, count: out.count, diffs: out.diffs.filter((d) => d.kind !== 'moved').slice(0, 600) });
      return res.status(200).json({ ok: true, total: out.total, same: out.same, count: out.count });
    } catch (e: any) { return res.status(200).json({ ok: false, reason: String(e?.message || e).slice(0, 200) }); }
  }
  if (req.query?.gamecheck) {
    // 게임 이름·링크 대조 한 묶음 (워커가 10분마다, 관리자가 '처음부터'는 reset=1 — 관리자만)
    res.setHeader('Cache-Control', 'no-store');
    const { db, hasAdminCredentials, verifyAdmin } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    let reset = false;
    if (req.query?.reset === '1') { try { await verifyAdmin(req); reset = true; } catch (e: any) { return res.status(e?.status || 401).json({ error: '관리자만' }); } }
    const { gameCheckRun } = await import('./_gameCheck.js');
    return res.status(200).json(await gameCheckRun(db, { reset }));
  }
  if (req.query?.tick === 'status') {
    // 알림 점검이 잘 도는지 (마지막 결과·출처별 마지막 시각 · 개인 정보 없음)
    const { db } = await import('./_firebase.js');
    const d = (await db.collection('notification_state').doc('main').get()).data() || {};
    const y = (await db.collection('youtube_cache').doc('yt_sync_state').get()).data() || {};
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(200).json({ lastResult: d.lastResult || null, lastBySource: d.lastBySource || null, peakSentDate: d.peakSentDate || null, lastAutoLog: d.lastAutoLog || null, yt: { last: y.last || null, lastPush: y.lastPush || null, lastPushError: y.lastPushError || null, at: y.at || null } });
  }
  if (req.query?.cf === 'status') {
    // GitHub 예약 실행이 '워커가 살아 있으면 건너뛰기' 할 때 봄: 워커가 5분 안에 알림 점검을 불렀는지
    res.setHeader('Cache-Control', 'no-store');
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(200).json({ alive: false });
    // DB 한도가 다 찼을 때 등 못 읽으면 '살아 있음'으로 (GitHub 예약 실행까지 같이 돌아서 한도를 더 쓰지 않게)
    let d: any;
    try { d = (await db.collection('notification_state').doc('main').get()).data() || {}; } catch (e: any) { return res.status(200).json({ alive: true, unknown: String(e?.message || e).slice(0, 80) }); }
    const at = Number(d.lastBySource?.cf || 0);
    return res.status(200).json({ alive: Date.now() - at < 5 * 60000, at: at ? new Date(at).toISOString() : null });
  }
  // DB 읽기 출처: 기기가 보낸 숫자 더하기 (POST) / 관리자 화면에서 보기 (GET)
  if (req.query?.fb) {
    // 내가 보낸 의견의 답변: 이 기기(v)가 보낸 문서만 상태·답글을 알려 줌 (다른 사람 것은 안 보임)
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const v = String(req.query.v || '');
    const ids = String(req.query.fb).split(',').map((x) => x.trim()).filter((x) => /^[\w-]{10,40}$/.test(x)).slice(0, 30);
    if (!v || !ids.length) return res.status(400).json({ error: 'bad request' });
    const snaps = await db.getAll(...ids.map((id) => db.collection('feedbacks').doc(id)));
    const items: Record<string, any> = {};
    snaps.forEach((d: any) => {
      const x = d.data();
      if (!x || x.vid !== v) return;
      const at = x.reviewedAt?.toDate ? x.reviewedAt.toDate().toISOString() : x.reviewedAt || x.resolvedAt || null;
      items[d.id] = { status: x.status || (x.resolved ? 'approved' : 'pending'), answer: String(x.adminComment || '').slice(0, 1000), at };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ items });
  }
  if (req.query?.sitelogs) {
    // 주간 점검용: 사이트가 보여 주는 방송 기록 (DB logs 컬렉션 전체 대신 · CDN 1시간)
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    const { loadSiteLogs } = await import('./_siteLogs.js');
    const u = (x: any) => (typeof x === 'string' ? x : x?.url || '');
    const logs = ((await loadSiteLogs(db)).logs as any[]).map((l) => ({ id: l.id, date: l.date, time: l.time, isAbsence: !!l.isAbsence, category: l.category || '', games: (l.games || []).map((g: any) => g?.name).filter(Boolean), game: l.game || '', vods: (l.vods || []).map(u), edited: (l.edited || []).map(u), shorts: (l.shorts || []).map(u) }));
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(200).json({ logs });
  }
  if (req.query?.snapshot === 'logs') {
    // 방송 기록 묶음: 달마다 문서(logs_by_month) + 몰아보기(compilations)를 한 번에 → CDN 에 30분 보관
    // 사람마다 DB 에서 문서 수백 개를 읽던 것을 서버가 30분에 한 번만 읽고 모두 이걸 받음 (DB 읽기가 사람 수와 상관없어짐)
    const { db, hasAdminCredentials } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    // 함수 안에 30분 기억: 그 사이엔 '가장 최근에 바뀐 달' 하나만 읽어 보고(읽기 1번) 안 바뀌었으면 그대로 보냄
    // (CDN 이 지역마다 따로 캐시해서 묶음을 하루에 수십 번 다시 만들며 DB 를 읽었음)
    let latest = '';
    try { const q = await db.collection('logs_by_month').orderBy('updatedAt', 'desc').limit(1).get(); latest = String(q.docs[0]?.data()?.updatedAt || ''); } catch { /* */ }
    const g: any = globalThis as any;
    if (g.__snap && Date.now() - g.__snap.at < 30 * 60000 && g.__snap.latest === latest) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400');
      return res.status(200).json(g.__snap.body);
    }
    const [m, c] = await Promise.all([db.collection('logs_by_month').get(), db.collection('compilations').get()]);
    const months: any[] = [];
    m.forEach((d: any) => months.push({ id: d.id, ...d.data() }));
    const comps: any[] = [];
    c.forEach((d: any) => comps.push({ docId: d.id, comp: d.data() }));
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400');
    const body = { at: new Date().toISOString(), months, comps };
    g.__snap = { at: Date.now(), latest, body };
    return res.status(200).json(body);
  }
  if (req.query?.readstat) {
    const { db, hasAdminCredentials, verifyAdmin } = await import('./_firebase.js');
    if (!hasAdminCredentials) return res.status(500).json({ error: 'no admin credentials' });
    if (req.method === 'POST') {
      let body: any = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      try { const { addClientReads } = await import('./_readStats.js'); await addClientReads(db, body?.c || {}); } catch { /* */ }
      return res.status(204).end();
    }
    // 합계만 (경로별 읽기 수 숫자뿐 · 내용 없음): 점검용
    if (req.query.readstat === 'sum') {
      const dd = (d: number) => new Date(Date.now() + 9 * 3600000 - d * 86400000).toISOString().slice(0, 10);
      const sn = await db.getAll(db.collection('admin_data').doc(`reads_${dd(0)}`), db.collection('admin_data').doc(`reads_${dd(1)}`));
      const sum = (o: any) => Object.fromEntries(Object.entries(o || {}).map(([k, v]: any) => [k, typeof v === 'number' ? v : Object.values(v || {}).reduce((a: number, n: any) => a + (Number(n) || 0), 0)]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 30));
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json(sn.map((x: any, i: number) => { const d = x.data() || {}; return { day: dd(i), server: sum(d.s), client: sum(d.c), hours: sum(d.h) }; }));
    }
    try { if (!(await verifyAdmin(req))) return res.status(403).json({ error: '관리자만' }); } catch { return res.status(403).json({ error: '관리자만' }); }
    const day = (d: number) => new Date(Date.now() + 9 * 3600000 - d * 86400000).toISOString().slice(0, 10);
    const snaps = await db.getAll(db.collection('admin_data').doc(`reads_${day(0)}`), db.collection('admin_data').doc(`reads_${day(1)}`));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ days: snaps.map((x: any, i: number) => ({ day: day(i), ...(x.data() || {}) })) });
  }
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
          selftest: results.selftest ? { summary: results.selftest.summary, error: results.selftest.error || '', results: (results.selftest.results || []).map((r: any) => ({ group: r.group, name: r.name, ok: r.ok, warn: Boolean(r.warn), err: r.err || '', ms: r.ms, details: (r.details || []).slice(0, 40).map((d: any) => String(d).slice(0, 200)) })) } : null,
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
