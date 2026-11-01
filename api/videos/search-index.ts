import { setCorsHeaders } from '../_cors.js';

/**
 * 영상 검색용 추가 정보 (태그·썸네일 글자·키워드·설명 앞부분)
 *
 * GET  /api/videos/search-index          → 지금까지 모은 전체 색인 { entries: { [videoId]: Entry } }
 * POST /api/videos/search-index {ids}    → 아직 색인에 없는 영상만 골라 한 번씩 추출해 저장하고, 새로 만든 항목을 돌려줌
 *
 * 비용 원칙
 *  - 영상 하나당 딱 한 번만 추출 (태그는 YouTube videos.list 1단위/50개, 썸네일 글자는 Gemini Flash-Lite 무료 한도 안에서 8장씩 묶어 1회 호출)
 *  - 검색할 때는 외부 API 를 전혀 부르지 않음 (앱이 색인을 한 번 받아 기기에 저장해 두고 그 안에서 찾음)
 *  - 하루 새 추출 수 제한 + 동시에 한 요청만 처리 (잠금)
 *
 * 저장
 *  - video_search/{id}: 영상별 원본 { tags, thumbText, keywords, desc, ... }
 *  - youtube_search_chunks/{n}: 앱에 내려줄 묶음 { items: { [id]: Entry } } (400개씩, 읽기 횟수 절약)
 *  - youtube_cache/search_index: { chunks, count, updatedAt, lockUntil, day, used }
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PER_REQUEST = 24; // 요청 한 번에 새로 추출할 최대 영상 수 (8장씩 3번, 차례로 호출해 분당 한도를 넘지 않게)
const VISION_BATCH = 8; // Gemini 한 번 호출에 넣는 썸네일 수
const DAILY_LIMIT = 4000; // 하루 새 추출 최대 영상 수 (8장 묶음이라 Gemini 호출은 약 500회, 무료 한도 안쪽)
const CHUNK_SIZE = 400;
const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest']
  .filter(Boolean) as string[];

/** 앱에 내려주는 짧은 형태: g=태그, t=썸네일 글자, k=키워드, d=설명 앞부분, x=영상 없음 */
type Entry = { g?: string[]; t?: string; k?: string[]; d?: string; x?: 1 };

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

async function readIndex(db: any): Promise<Record<string, Entry>> {
  const meta = (await db.collection('youtube_cache').doc('search_index').get()).data() || {};
  const n = Number(meta.chunks || 0);
  if (!n) return {};
  const snaps = await db.getAll(...Array.from({ length: n }, (_, i) => db.collection('youtube_search_chunks').doc(String(i))));
  const out: Record<string, Entry> = {};
  snaps.forEach((s: any) => Object.assign(out, (s.exists && s.data()?.items) || {}));
  return out;
}

async function fetchYoutube(ids: string[], key: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error?.message || `YouTube API HTTP ${r.status}`);
  const map = new Map<string, any>();
  (json?.items || []).forEach((it: any) => it?.id && map.set(it.id, it.snippet || {}));
  return map;
}

async function thumbnailBase64(id: string, snippet: any) {
  const urls = [snippet?.thumbnails?.high?.url, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`].filter(Boolean);
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1500) continue;
      return { data: buf.toString('base64'), mimeType: r.headers.get('content-type') || 'image/jpeg' };
    } catch { /* 다음 주소 시도 */ }
  }
  return null;
}

/** 썸네일 여러 장을 한 번에 보내 글자와 키워드를 받음 */
async function readThumbnails(ai: any, batch: { id: string; title: string; desc: string; img: { data: string; mimeType: string } }[]) {
  const parts: any[] = [{
    text: `아래는 스트리머 "우주하마" 유튜브 영상 썸네일 ${batch.length}장이야. 각 이미지마다:
- text: 썸네일 그림 안에 실제로 적힌 글자를 보이는 그대로 (여러 줄이면 공백으로 이어서, 없으면 빈 문자열). 추측해서 지어내지 말 것.
- keywords: 썸네일 장면과 제목·설명을 보고 검색에 쓸 만한 한국어 키워드 최대 8개 (게임 이름, 상황, 등장 사물·인물 특징, 금액·숫자 등). 제목 단어를 그대로 반복할 필요는 없음.
JSON 배열로만 답해: [{"i":0,"text":"...","keywords":["..."]}, ...] (i 는 이미지 순서 번호)`,
  }];
  batch.forEach((b, i) => {
    parts.push({ text: `#${i} 제목: ${b.title}${b.desc ? ` / 설명: ${b.desc.slice(0, 120)}` : ''}` });
    parts.push({ inlineData: b.img });
  });
  const errors: string[] = [];
  for (const model of MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', temperature: 0.2, httpOptions: { timeout: 30000 } },
      });
      const arr = JSON.parse(r.text || '[]');
      if (!Array.isArray(arr)) throw new Error('배열이 아님');
      const out = new Map<string, { text: string; keywords: string[] }>();
      arr.forEach((x: any) => {
        const i = Number(x?.i);
        if (!Number.isInteger(i) || !batch[i]) return;
        out.set(batch[i].id, {
          text: String(x?.text || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          keywords: cleanList(x?.keywords, 8, 30),
        });
      });
      return out;
    } catch (e: any) {
      errors.push(`${model}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  throw new Error(errors.join(' / '));
}

/** 새 항목을 마지막 묶음에 이어 붙임 (가득 차면 새 묶음) */
async function appendToIndex(db: any, add: Record<string, Entry>) {
  const metaRef = db.collection('youtube_cache').doc('search_index');
  const meta = (await metaRef.get()).data() || {};
  let chunks = Number(meta.chunks || 0);
  let count = Number(meta.count || 0);
  let lastIdx = Math.max(0, chunks - 1);
  let last: Record<string, Entry> = chunks ? ((await db.collection('youtube_search_chunks').doc(String(lastIdx)).get()).data()?.items || {}) : {};
  if (!chunks) chunks = 1;
  const batch = db.batch();
  for (const [id, e] of Object.entries(add)) {
    if (Object.keys(last).length >= CHUNK_SIZE) {
      batch.set(db.collection('youtube_search_chunks').doc(String(lastIdx)), { items: last });
      lastIdx += 1;
      chunks = lastIdx + 1;
      last = {};
    }
    if (!last[id]) count += 1;
    last[id] = e;
  }
  batch.set(db.collection('youtube_search_chunks').doc(String(lastIdx)), { items: last });
  batch.set(metaRef, { chunks, count, updatedAt: new Date().toISOString() }, { merge: true });
  await batch.commit();
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { db } = await import('../_firebase.js');

    if (req.method === 'GET' && req.query?.status) {
      // 진행 상황 확인용 (색인 내용은 빼고)
      const m = (await db.collection('youtube_cache').doc('search_index').get()).data() || {};
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        count: m.count || 0, chunks: m.chunks || 0, updatedAt: m.updatedAt || null,
        today: m.day || null, usedToday: m.day === todayKst() ? m.used || 0 : 0,
        lastError: m.lastError || null, lastErrorAt: m.lastErrorAt || null,
        keys: { youtube: Boolean(process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY) },
      });
    }
    if (req.method === 'GET') {
      const entries = await readIndex(db);
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=3600');
      return res.status(200).json({ entries, count: Object.keys(entries).length });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const requested = [...new Set((Array.isArray(body?.ids) ? body.ids : []).map((s: any) => String(s || '').trim()).filter((s: string) => ID_RE.test(s)))].slice(0, 200) as string[];
    if (!requested.length) return res.status(400).json({ error: 'ids 가 필요해요.' });

    const ytKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    const aiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!ytKey || !aiKey) return res.status(200).json({ added: {}, error: 'API 키 환경 변수가 없어요.' });

    // 이미 처리한 영상은 건너뜀
    const snaps = await db.getAll(...requested.map((id) => db.collection('video_search').doc(id)));
    const todo = requested.filter((_, i) => !snaps[i].exists).slice(0, PER_REQUEST);
    if (!todo.length) return res.status(200).json({ added: {}, remaining: 0 });

    // 동시에 한 요청만 + 하루 한도
    const metaRef = db.collection('youtube_cache').doc('search_index');
    const today = todayKst();
    const allowed = await db.runTransaction(async (tx: any) => {
      const m = (await tx.get(metaRef)).data() || {};
      if (m.lockUntil && m.lockUntil > Date.now()) return 0;
      if (m.coolUntil && m.coolUntil > Date.now()) return 0; // 한도에 걸린 직후엔 잠시 쉼
      const used = m.day === today ? Number(m.used || 0) : 0;
      const n = Math.min(todo.length, DAILY_LIMIT - used);
      if (n <= 0) return 0;
      tx.set(metaRef, { lockUntil: Date.now() + 55000, day: today, used: used + n }, { merge: true });
      return n;
    });
    if (!allowed) return res.status(200).json({ added: {}, busy: true });
    const ids = todo.slice(0, allowed);

    try {
      const snippets = await fetchYoutube(ids, ytKey);
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: aiKey });

      const items = await Promise.all(ids.map(async (id) => {
        const sn = snippets.get(id);
        if (!sn) return { id, missing: true as const };
        return {
          id,
          title: String(sn.title || ''),
          tags: cleanList(sn.tags, 30),
          desc: cleanDesc(sn.description),
          hashtags: cleanList(String(sn.description || '').match(/#[^\s#]+/g)?.map((h: string) => h.slice(1)), 15),
          img: await thumbnailBase64(id, sn),
        };
      }));

      const withImg = items.filter((x: any) => !x.missing && x.img) as any[];
      const vision = new Map<string, { text: string; keywords: string[] }>();
      const groups: any[][] = [];
      for (let i = 0; i < withImg.length; i += VISION_BATCH) groups.push(withImg.slice(i, i + VISION_BATCH));
      // 동시에 보내지 않고 하나씩 (무료 한도는 분당 호출 수 제한이 있음). 한도에 걸리면 남은 묶음은 다음에
      const failedIds = new Set<string>();
      let visionError = '';
      let rateLimited = false;
      for (const g of groups) {
        if (rateLimited) { g.forEach((x: any) => failedIds.add(x.id)); continue; }
        try {
          (await readThumbnails(ai, g)).forEach((v, k) => vision.set(k, v));
        } catch (err: any) {
          console.error('[search-index] vision failed:', err);
          visionError = String(err?.message || err).slice(0, 300);
          rateLimited = /429|quota|RESOURCE_EXHAUSTED/i.test(visionError);
          g.forEach((x: any) => failedIds.add(x.id));
        }
      }
      if (visionError) {
        await metaRef.set({
          lastError: visionError, lastErrorAt: new Date().toISOString(),
          ...(rateLimited ? { coolUntil: Date.now() + 65000 } : {}),
        }, { merge: true }).catch(() => {});
      }

      // 썸네일 읽기에 실패한 영상은 저장하지 않고 다음에 다시 시도
      const added: Record<string, Entry> = {};
      const batch = db.batch();
      const now = new Date().toISOString();
      items.forEach((it: any) => {
        if (failedIds.has(it.id)) return;
        if (it.missing) {
          added[it.id] = { x: 1 };
          batch.set(db.collection('video_search').doc(it.id), { notFound: true, at: now });
          return;
        }
        const v = vision.get(it.id);
        const tags = [...new Set([...it.tags, ...it.hashtags])].slice(0, 40);
        const e: Entry = {};
        if (tags.length) e.g = tags;
        if (v?.text) e.t = v.text;
        if (v?.keywords?.length) e.k = v.keywords;
        if (it.desc) e.d = it.desc;
        added[it.id] = e;
        batch.set(db.collection('video_search').doc(it.id), {
          title: it.title, tags, desc: it.desc, thumbText: v?.text || '', keywords: v?.keywords || [], at: now,
        });
      });
      if (Object.keys(added).length) {
        await batch.commit();
        await appendToIndex(db, added);
      }
      // 실패해 저장하지 않은 만큼 한도 되돌림
      if (failedIds.size) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await metaRef.set({ used: FieldValue.increment(-failedIds.size) }, { merge: true }).catch(() => {});
      }
      return res.status(200).json({
        added, failed: failedIds.size,
        ...(rateLimited ? { busy: true, retryAfter: 65 } : {}),
        error: !rateLimited && failedIds.size && !Object.keys(added).length ? visionError : undefined,
      });
    } catch (e: any) {
      await metaRef.set({ lastError: String(e?.message || e).slice(0, 300), lastErrorAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      throw e;
    } finally {
      await metaRef.set({ lockUntil: 0 }, { merge: true }).catch(() => {});
    }
  } catch (e: any) {
    console.error('[videos/search-index] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
