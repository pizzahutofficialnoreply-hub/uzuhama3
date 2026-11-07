import { setCorsHeaders } from '../_cors.js';

/**
 * 영상 검색용 추가 정보 (태그·설명 앞부분·썸네일 글자·키워드 + 게임 이름 한국어 키워드)
 *
 * GET  /api/videos/search-index            → 전체 색인 { entries: { [videoId]: Entry }, games: { [게임명]: 키워드[] } }
 * GET  /api/videos/search-index?status=1   → 진행 상황
 * POST /api/videos/search-index {ids, games} → 아직 없는 것만 한 번씩 만들어 저장하고, 바뀐 항목을 돌려줌
 *
 * 단계
 *  1) 태그·설명: YouTube videos.list (50개당 1단위, 하루 할당량 1만 단위라 사실상 무제한) → 바로 저장
 *  2) 썸네일 글자·키워드: Gemini Flash-Lite 무료 한도 안에서 8장씩 천천히 (실패해도 1)은 이미 저장돼 있음)
 *  3) 게임 이름 → 한국어 키워드 ("Librarian" → 도서관, 사서 …): 게임 150개를 Gemini 한 번에
 *
 * 비용 원칙: 영상·게임마다 한 번만 만들고, 검색할 때는 외부 API 를 부르지 않음. 동시에 한 요청만(잠금), 한도에 걸리면 쉬기
 *
 * 저장
 *  - youtube_search_chunks/{n}: { items: { [id]: Entry } } (400개씩)
 *  - youtube_cache/search_index: { chunks, count, pending, lockUntil, coolUntil, day, used, vDay, vUsed, rlCount, lastError }
 *  - youtube_cache/game_keywords: { items: { [게임명]: string[] } }
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const NEW_PER_REQUEST = 100; // 태그 조회 (유튜브 2번 호출)
const VISION_PER_REQUEST = 24; // 썸네일 (8장씩 3번, 차례로)
const VISION_BATCH = 8;
const DAILY_NEW_LIMIT = 4000;
const DAILY_VISION_LIMIT = 1500;
const GAMES_PER_REQUEST = 40; // 한 번에 너무 많으면 응답이 잘리거나 시간 초과
const CHUNK_SIZE = 400;
const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest']
  .filter(Boolean) as string[];

/** g=태그, t=썸네일 글자, k=키워드, d=설명 앞부분, m=분위기·계절 태그, x=영상 없음, p=썸네일 아직 */
type Entry = { g?: string[]; t?: string; k?: string[]; d?: string; m?: string[]; x?: 1; p?: 1 };
/** 썸네일 분위기·계절 태그는 이 목록에서만 (앱의 '말하듯 검색'이 같은 목록을 씀) */
const MOODS = ['봄', '여름', '가을', '겨울', '크리스마스', '할로윈', '설날', '추석', '새해', '공포', '웃김', '힐링', '감동', '긴장감', '귀여움', '분노', '슬픔', '평화', '혼돈', '눈', '바다', '물', '숲', '사막', '우주', '도시', '학교', '밤', '비', '불', '산'];
/** 썸네일을 아직 안 봤거나, 분위기 태그가 생기기 전에 본 것 (한 번만 다시 봄) */
const needsVision = (e?: Entry) => Boolean(e && !e.x && (e.p || e.m === undefined));

const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function cleanDesc(s: string) {
  return String(s || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 220);
}

const cleanList = (arr: any, max: number, maxLen = 40) =>
  [...new Set((Array.isArray(arr) ? arr : []).map((x: any) => String(x || '').trim()).filter((x: string) => x && x.length <= maxLen))].slice(0, max) as string[];

const isRateLimit = (msg: string) => /429|quota|RESOURCE_EXHAUSTED|rate/i.test(msg);

/** 색인 묶음 전체 (묶음 번호까지) */
async function readChunks(db: any, meta: any) {
  const n = Number(meta.chunks || 0);
  if (!n) return [] as Record<string, Entry>[];
  const snaps = await db.getAll(...Array.from({ length: n }, (_, i) => db.collection('youtube_search_chunks').doc(String(i))));
  return snaps.map((s: any) => ((s.exists && s.data()?.items) || {}) as Record<string, Entry>);
}

async function fetchYoutube(ids: string[], key: string) {
  const map = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${part.join(',')}&key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(json?.error?.message || `YouTube API HTTP ${r.status}`);
    (json?.items || []).forEach((it: any) => it?.id && map.set(it.id, it.snippet || {}));
  }
  return map;
}

async function thumbnailBase64(id: string) {
  for (const u of [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, `https://i.ytimg.com/vi/${id}/mqdefault.jpg`]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1500) continue;
      return { data: buf.toString('base64'), mimeType: r.headers.get('content-type') || 'image/jpeg' };
    } catch { /* 다음 주소 */ }
  }
  return null;
}

async function gemini(ai: any, contents: any, temperature = 0.2) {
  const errors: string[] = [];
  for (const model of MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents,
        config: { responseMimeType: 'application/json', temperature, maxOutputTokens: 8192, httpOptions: { timeout: 40000 } },
      });
      return JSON.parse(r.text || 'null');
    } catch (e: any) {
      errors.push(`${model}: ${String(e?.message || e).slice(0, 140)}`);
    }
  }
  throw new Error(errors.join(' / '));
}

/** 썸네일 여러 장 → 글자·키워드 */
async function readThumbnails(ai: any, batch: { id: string; desc: string; img: { data: string; mimeType: string } }[]) {
  const parts: any[] = [{
    text: `아래는 스트리머 "우주하마" 유튜브 영상 썸네일 ${batch.length}장이야. 각 이미지마다:
- texts: 썸네일 그림 안에 실제로 적힌 글자를 보이는 그대로, 떨어져 있는 글자 덩어리마다 따로 (예: ["히말라야 등반", "범죄현장 청소"], 없으면 []). 추측해서 지어내지 말 것.
- keywords: 썸네일 장면을 보고 검색에 쓸 만한 한국어 키워드 최대 8개 (장소, 상황, 등장 사물·인물 특징, 금액·숫자 등).
- moods: 썸네일의 계절·행사·분위기·배경을 다음 목록에서만 0~4개: ${MOODS.join(', ')}. 확실한 것만 (예: 눈 덮인 배경 → 겨울, 눈 / 산타 모자 → 크리스마스).
JSON 배열로만 답해: [{"i":0,"texts":["..."],"keywords":["..."],"moods":["..."]}, ...] (i 는 이미지 순서 번호)`,
  }];
  batch.forEach((b, i) => {
    parts.push({ text: `#${i}${b.desc ? ` 설명: ${b.desc.slice(0, 100)}` : ''}` });
    parts.push({ inlineData: b.img });
  });
  const arr = await gemini(ai, [{ role: 'user', parts }]);
  if (!Array.isArray(arr)) throw new Error('응답 형식 오류');
  const out = new Map<string, { text: string; keywords: string[]; moods: string[] }>();
  arr.forEach((x: any) => {
    const i = Number(x?.i);
    if (!Number.isInteger(i) || !batch[i]) return;
    out.set(batch[i].id, {
      // 글자 덩어리는 ' | ' 로 구분해 저장 (앱에서 덩어리마다 따로 검색)
      text: (Array.isArray(x?.texts) ? x.texts : [x?.text]).map((t: any) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 200),
      keywords: cleanList(x?.keywords, 8, 30),
      moods: cleanList(x?.moods, 4, 10).filter((m) => MOODS.includes(m)),
    });
  });
  return out;
}

/** 게임 이름 → 한국어 검색 키워드 */
async function gameKeywords(ai: any, names: string[]) {
  // 이름을 그대로 키로 쓰면 따옴표·특수문자 때문에 JSON 이 깨지기 쉬워서 번호로 주고받음
  const arr = await gemini(ai, `아래는 게임 방송 스트리머가 했던 게임 이름 목록이야(번호. 이름). 각 게임마다 한국 시청자가 이 게임을 찾을 때 칠 만한 한국어 검색어를 최대 6개 골라줘.
- 영어 이름이면 한국어 이름·번역 (예: "Librarian: Tidy Up the Arcane Library!" → 도서관, 사서, 책 정리)
- 흔히 쓰는 줄임말·별명, 게임의 핵심 소재·장소, 장르 한 단어
- 모르는 게임이면 이름 뜻 번역만. 지어내지 말 것. 키워드 안에 따옴표 쓰지 말 것
JSON 배열로만 답해: [{"i":0,"k":["키워드", ...]}, ...]

${names.map((n, i) => `${i}. ${n.replace(/["\\]/g, ' ')}`).join('\n')}`);
  const out: Record<string, string[]> = {};
  if (!Array.isArray(arr)) throw new Error('응답 형식 오류');
  arr.forEach((x: any) => {
    const i = Number(x?.i);
    if (Number.isInteger(i) && names[i] !== undefined) out[names[i]] = cleanList(x?.k, 6, 20);
  });
  // 답이 없는 게임도 빈 배열로 저장 (다시 묻지 않음)
  names.forEach((n) => { if (!(n in out)) out[n] = []; });
  return out;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { db } = await import('../_firebase.js');
    const metaRef = db.collection('youtube_cache').doc('search_index');
    const gamesRef = db.collection('youtube_cache').doc('game_keywords');

    // ── AI 영상 분석 · AI 검색 (api/_aiVideo.ts) ──
    const aiMode = String(req.query?.ai || '');
    if (aiMode) {
      const ai = await import('../_aiVideo.js');
      if (aiMode === 'search') {
        const q = String(req.query?.q || '').slice(0, 80);
        const out = await ai.aiSearch(db, q);
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
        return res.status(200).json(out);
      }
      if (aiMode === 'verify') {
        const q = String(req.query?.q || '').slice(0, 80);
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.status(200).json(await ai.aiVerify(db, q));
      }
      if (aiMode === 'video') {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.status(200).json(await ai.aiVideoDetail(db, String(req.query?.id || '')));
      }
      if (aiMode === 'prioritize') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(await ai.aiPrioritize(db, String(req.query?.id || '')));
      }
      if (aiMode === 'status') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(await ai.aiVideoStatus(db));
      }
      if (aiMode === 'run') {
        res.setHeader('Cache-Control', 'no-store');
        // 한 번 불렸을 때 시간이 남으면 여러 구간 (이 함수는 최대 300초)
        const kind = ['short', 'video', 'live'].includes(String(req.query?.kind)) ? String(req.query.kind) : undefined;
        const out: any = await ai.runAiVideoLoop(db, 150000, { kind });
        // 백그라운드로 계속: 시간이 다 돼도 할 게 남았으면 스스로 다음 실행을 부름 (한 줄에 최대 80번, 한도·쉬는 중이면 멈춤)
        const chain = Math.max(0, Number(req.query?.chain || 0));
        if (out.more && chain < 80) {
          const host = String(req.headers?.host || 'uzuhama.vercel.app');
          const url = `https://${host}/api/videos/search-index?ai=run&chain=${chain + 1}${kind ? `&kind=${kind}` : ''}`;
          try {
            const { waitUntil } = await import('@vercel/functions');
            waitUntil(fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => {}));
          } catch { /* */ }
          out.chained = chain + 1;
        }
        return res.status(200).json(out);
      }
      return res.status(400).json({ error: 'unknown ai mode' });
    }

    if (req.method === 'GET' && req.query?.status) {
      const m = (await metaRef.get()).data() || {};
      const today = todayKst();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        count: m.count || 0, waitingThumbnail: m.pending ?? null, games: m.gameCount || 0,
        updatedAt: m.updatedAt || null,
        newToday: m.day === today ? m.used || 0 : 0, thumbnailsToday: m.vDay === today ? m.vUsed || 0 : 0,
        restingUntil: m.coolUntil && m.coolUntil > Date.now() ? new Date(m.coolUntil).toISOString() : null,
        lastError: m.lastError || null, lastErrorAt: m.lastErrorAt || null,
        keys: { youtube: Boolean(process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY) },
      });
    }
    if (req.method === 'GET') {
      const meta = (await metaRef.get()).data() || {};
      const [chunks, gamesSnap] = await Promise.all([readChunks(db, meta), gamesRef.get()]);
      const entries: Record<string, Entry> = {};
      chunks.forEach((c) => Object.assign(entries, c));
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=3600');
      return res.status(200).json({ entries, games: gamesSnap.data()?.items || {}, count: Object.keys(entries).length });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const requested = [...new Set((Array.isArray(body?.ids) ? body.ids : []).map((s: any) => String(s || '').trim()).filter((s: string) => ID_RE.test(s)))].slice(0, 300) as string[];
    const reqGames = [...new Set((Array.isArray(body?.games) ? body.games : []).map((s: any) => String(s || '').trim()).filter((s: string) => s.length >= 1 && s.length <= 80))].slice(0, 400) as string[];

    const ytKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    const aiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!ytKey) return res.status(200).json({ added: {}, error: 'YOUTUBE_API_KEY 가 없어요.' });

    // 1) 잠금 (처리 중이면 문서 1개만 읽고 돌려보냄)
    const today = todayKst();
    const gate: any = await db.runTransaction(async (tx: any) => {
      const m = (await tx.get(metaRef)).data() || {};
      const nowMs = Date.now();
      if (m.lockUntil && m.lockUntil > nowMs) return { wait: Math.ceil((m.lockUntil - nowMs) / 1000) };
      tx.set(metaRef, { lockUntil: nowMs + 55000 }, { merge: true });
      return { m };
    });
    if (gate.wait) return res.status(200).json({ added: {}, busy: true, retryAfter: Math.max(20, gate.wait) });
    const m = gate.m || {};

    try {
      const chunks = await readChunks(db, m);
      const where = new Map<string, number>();
      chunks.forEach((c, i) => Object.keys(c).forEach((id) => where.set(id, i)));
      const entryOf = (id: string) => (where.has(id) ? chunks[where.get(id)!][id] : undefined);
      const changed: Record<string, Entry> = {};
      const setEntry = (id: string, e: Entry) => {
        changed[id] = e;
        if (where.has(id)) chunks[where.get(id)!][id] = e;
        else {
          let last = chunks.length - 1;
          if (last < 0 || Object.keys(chunks[last]).length >= CHUNK_SIZE) { chunks.push({}); last = chunks.length - 1; }
          chunks[last][id] = e;
          where.set(id, last);
        }
      };
      const touched = new Set<number>();
      const metaUpdate: Record<string, any> = {};
      let errorMsg = '';

      // 2) 새 영상: 태그·설명부터 바로 저장 (썸네일은 p 표시 후 나중에)
      const usedNew = m.day === today ? Number(m.used || 0) : 0;
      const newIds = requested.filter((id) => !where.has(id)).slice(0, Math.max(0, Math.min(NEW_PER_REQUEST, DAILY_NEW_LIMIT - usedNew)));
      if (newIds.length) {
        try {
          const snippets = await fetchYoutube(newIds, ytKey);
          newIds.forEach((id) => {
            const sn = snippets.get(id);
            if (!sn) { setEntry(id, { x: 1 }); return; }
            const hashtags = cleanList(String(sn.description || '').match(/#[^\s#]+/g)?.map((h: string) => h.slice(1)), 15);
            const tags = [...new Set([...cleanList(sn.tags, 30), ...hashtags])].slice(0, 40);
            const e: Entry = { p: 1 };
            if (tags.length) e.g = tags;
            const d = cleanDesc(sn.description);
            if (d) e.d = d;
            setEntry(id, e);
          });
          metaUpdate.day = today;
          metaUpdate.used = usedNew + newIds.length;
        } catch (e: any) {
          errorMsg = `YouTube: ${String(e?.message || e).slice(0, 200)}`;
        }
      }

      // 3) 썸네일 (한도에 걸려 쉬는 중이 아니면). 요청한 영상 먼저, 그다음 남은 것
      const nowMs = Date.now();
      const vUsed = m.vDay === today ? Number(m.vUsed || 0) : 0;
      const cooling = Number(m.coolUntil || 0) > nowMs;
      let rlCount = Number(m.rlCount || 0);
      const ai = aiKey && !cooling && vUsed < DAILY_VISION_LIMIT
        ? new (await import('@google/genai')).GoogleGenAI({ apiKey: aiKey })
        : null;
      let rateLimited = false;
      if (ai) {
        const order = [...requested, ...where.keys()];
        const pend: string[] = [];
        const seen = new Set<string>();
        for (const id of order) {
          if (seen.has(id)) continue;
          seen.add(id);
          if (needsVision(entryOf(id))) pend.push(id);
          if (pend.length >= Math.min(VISION_PER_REQUEST, DAILY_VISION_LIMIT - vUsed)) break;
        }
        const withImg = (await Promise.all(pend.map(async (id) => ({ id, desc: entryOf(id)?.d || '', img: await thumbnailBase64(id) }))));
        let done = 0;
        for (let i = 0; i < withImg.length; i += VISION_BATCH) {
          const group = withImg.slice(i, i + VISION_BATCH);
          const ok = group.filter((x) => x.img) as any[];
          try {
            const vision = ok.length ? await readThumbnails(ai, ok) : new Map();
            group.forEach((x) => {
              const v = vision.get(x.id);
              const e: Entry = { ...entryOf(x.id) };
              delete e.p;
              if (v?.text) e.t = v.text;
              if (v?.keywords?.length) e.k = v.keywords;
              e.m = v?.moods || []; // 빈 목록도 저장 (다시 보지 않게)
              setEntry(x.id, e);
            });
            done += group.length;
            rlCount = 0;
          } catch (err: any) {
            errorMsg = String(err?.message || err).slice(0, 300);
            rateLimited = isRateLimit(errorMsg);
            break;
          }
        }
        metaUpdate.vDay = today;
        metaUpdate.vUsed = vUsed + done;
        if (rateLimited) {
          // 연속으로 걸리면 점점 길게 쉼 (1분 → 10분 → 1시간)
          rlCount += 1;
          metaUpdate.coolUntil = nowMs + (rlCount >= 4 ? 3600000 : rlCount >= 2 ? 600000 : 65000);
        }
        metaUpdate.rlCount = rlCount;
      }

      // 4) 게임 이름 키워드 (한 번에 150개, 쉬는 중이 아닐 때만)
      let newGames: Record<string, string[]> = {};
      let gameCount = Number(m.gameCount || 0);
      if (ai && !rateLimited && reqGames.length) {
        const gsnap = await gamesRef.get();
        const known: Record<string, string[]> = gsnap.data()?.items || {};
        const missing = reqGames.filter((n) => !(n in known)).slice(0, GAMES_PER_REQUEST);
        if (missing.length) {
          try {
            newGames = await gameKeywords(ai, missing);
            const all = { ...known, ...newGames };
            await gamesRef.set({ items: all });
            gameCount = Object.keys(all).length;
            metaUpdate.gameCount = gameCount;
          } catch (err: any) {
            errorMsg = String(err?.message || err).slice(0, 300);
            if (isRateLimit(errorMsg)) {
              rlCount += 1;
              metaUpdate.rlCount = rlCount;
              metaUpdate.coolUntil = Date.now() + (rlCount >= 4 ? 3600000 : rlCount >= 2 ? 600000 : 65000);
            }
          }
        }
      }

      // 5) 저장 (바뀐 묶음만)
      Object.keys(changed).forEach((id) => touched.add(where.get(id)!));
      const batch = db.batch();
      touched.forEach((i) => batch.set(db.collection('youtube_search_chunks').doc(String(i)), { items: chunks[i] }));
      let count = 0;
      let pending = 0;
      chunks.forEach((c) => (Object.values(c) as Entry[]).forEach((e) => { count += 1; if (needsVision(e)) pending += 1; }));
      batch.set(metaRef, {
        ...metaUpdate, chunks: chunks.length, count, pending,
        updatedAt: new Date().toISOString(),
        ...(errorMsg ? { lastError: errorMsg, lastErrorAt: new Date().toISOString() } : {}),
      }, { merge: true });
      await batch.commit();

      const cool = metaUpdate.coolUntil || (cooling ? m.coolUntil : 0);
      return res.status(200).json({
        added: changed,
        games: newGames,
        pending,
        remainingNew: requested.filter((id) => !where.has(id)).length,
        ...(cool && cool > Date.now() ? { resting: true, retryAfter: Math.ceil((cool - Date.now()) / 1000) } : {}),
        ...(errorMsg && !Object.keys(changed).length && !rateLimited ? { error: errorMsg } : {}),
      });
    } finally {
      await metaRef.set({ lockUntil: 0 }, { merge: true }).catch(() => {});
    }
  } catch (e: any) {
    console.error('[videos/search-index] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
