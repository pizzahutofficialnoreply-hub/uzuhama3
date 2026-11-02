import { setCorsHeaders } from '../_cors.js';

/**
 * 우주하마 유튜브 채널의 쇼츠 전체 (GET /api/videos/shorts)
 * - 채널 쇼츠 목록은 유튜브가 자동으로 만드는 'UUSH' 재생목록(UC → UUSH)으로 가져옴
 * - YouTube API 는 처음 한 번만 부르고 Firestore 에 저장, 이후엔 저장된 것만 돌려줌 (자동 재조회 없음)
 * - 관리자만 새로고침: ?refresh=1 + Authorization: Bearer <관리자 ID 토큰>
 * - 저장: youtube_cache/shorts { channelId, fetchedAt, count, chunks }, youtube_shorts_items/{n} { items }
 * - ?kind=related: 쇼츠 ↔ 관련 일반 영상 (youtube_cache/shorts_related)
 */

const API = 'https://www.googleapis.com/youtube/v3';
const CHUNK = 2000;

type ShortItem = { videoId: string; title: string; publishedAt: string };

async function yt(path: string, key: string) {
  const r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(9000) });
  const json: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error?.message || `YouTube API HTTP ${r.status}`);
  return json;
}

async function resolveChannelId(db: any, key: string) {
  if (process.env.YOUTUBE_CHANNEL_ID) return process.env.YOUTUBE_CHANNEL_ID;
  const cached = (await db.collection('youtube_cache').doc('playlists').get()).data();
  if (cached?.channelId) return cached.channelId as string;
  const ch = await yt(`channels?part=id&forHandle=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_HANDLE || '@uzuhama')}`, key);
  const id = ch?.items?.[0]?.id;
  if (!id) throw new Error('유튜브 채널을 찾지 못했습니다.');
  return id as string;
}

/** 채널 재생목록 전체: UUSH=쇼츠, UULF=일반 영상(쇼츠·생방송 제외), UU=전체 */
async function fetchShorts(channelId: string, key: string, prefix = 'UUSH'): Promise<ShortItem[]> {
  const playlistId = `${prefix}${channelId.slice(2)}`;
  const out: ShortItem[] = [];
  let token = '';
  do {
    const res = await yt(`playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${token ? `&pageToken=${token}` : ''}`, key);
    (res.items || []).forEach((it: any) => {
      const videoId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title || '';
      if (!videoId || title === 'Private video' || title === 'Deleted video') return;
      out.push({ videoId, title, publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || '' });
    });
    token = res.nextPageToken || '';
  } while (token);
  return out;
}


/**
 * 쇼츠 아래에 붙은 '관련 동영상' 링크 (유튜브 Data API 에는 없어서, 유튜브 쇼츠 화면이 쓰는 응답의 쇼츠 정보 칸에서 찾음)
 * - 이 칸에는 [쇼츠 자신, 관련 동영상] 이 들어 있음. 다른 쇼츠를 가리키는 건 버리고 일반 영상만 남김
 * - 실제 기록(관리자가 연결한 쇼츠 ↔ 편집본)과 맞춰 본 결과 일반 영상이 걸린 쇼츠는 모두 일치
 */
const YT_HEADERS = { 'Accept-Language': 'ko-KR,ko;q=0.9', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', Cookie: 'SOCS=CAI; CONSENT=YES+1', 'Content-Type': 'application/json' };
const REL_RECHECK_MS = 3 * 24 * 3600 * 1000; // 관련 영상이 없던 쇼츠는 3일 뒤 다시 확인 (나중에 붙이는 경우)

function metapanelIds(node: any, inPanel = false, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    const here = inPanel || /metapanel/i.test(k);
    if (here && k === 'videoId' && typeof v === 'string' && /^[\w-]{11}$/.test(v)) out.push(v);
    else if (v && typeof v === 'object') metapanelIds(v, here, out);
  }
  return out;
}

async function relatedIdsOf(id: string): Promise<string[]> {
  const body = { context: { client: { clientName: 'WEB', clientVersion: '2.20251030.01.00', hl: 'ko', gl: 'KR' } }, playerRequest: { videoId: id }, params: 'CAUwAg%3D%3D' };
  const r = await fetch('https://www.youtube.com/youtubei/v1/reel/reel_item_watch?prettyPrint=false', { method: 'POST', headers: YT_HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return [...new Set(metapanelIds(await r.json()))].filter((x) => x !== id);
}

async function readItems(db: any, col: string, chunks: number): Promise<ShortItem[]> {
  const refs = Array.from({ length: Number(chunks || 0) }, (_, n) => db.collection(col).doc(String(n)));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const out: ShortItem[] = [];
  snaps.forEach((s: any) => out.push(...((s.data()?.items as ShortItem[]) || [])));
  return out;
}

/** GET ?kind=related → { map: { 쇼츠ID: 관련 일반 영상ID }, total, checked, remaining } (부족한 만큼 조금씩 채움) */
async function handleRelated(db: any, req: any, res: any) {
  const ref = db.collection('youtube_cache').doc('shorts_related');
  const cur = (await ref.get()).data() || {};
  const map: Record<string, string> = cur.map || {};
  const emptyAt: Record<string, number> = cur.emptyAt || {};
  const shortsIndex = (await db.collection('youtube_cache').doc('shorts').get()).data();
  const now = Date.now();
  const due = (cur.basis !== shortsIndex?.fetchedAt) || (cur.remaining > 0) || (now - (cur.updatedAt || 0) > 12 * 3600 * 1000);
  let remaining = Number(cur.remaining || 0);
  let total = Number(cur.total || 0);

  if (shortsIndex?.fetchedAt && due) {
    const locked = await db.runTransaction(async (tx: any) => {
      const d = (await tx.get(ref)).data() || {};
      if (d.lockUntil && d.lockUntil > now) return false;
      tx.set(ref, { lockUntil: now + 55000 }, { merge: true });
      return true;
    }).catch(() => false);
    if (locked) {
      const shorts = await readItems(db, 'youtube_shorts_items', shortsIndex.chunks);
      const shortSet = new Set(shorts.map((x) => x.videoId));
      const pending = shorts.map((x) => x.videoId).filter((id) => !(id in map) || (map[id] === '' && now - (emptyAt[id] || 0) > REL_RECHECK_MS));
      const limit = Math.min(pending.length, Math.max(1, Math.min(200, Number(req.query?.batch) || 120)));
      const started = Date.now();
      let i = 0;
      const worker = async () => {
        while (i < limit && Date.now() - started < 40000) {
          const id = pending[i++];
          try {
            const rel = (await relatedIdsOf(id)).find((x) => !shortSet.has(x)) || '';
            map[id] = rel;
            if (rel) delete emptyAt[id]; else emptyAt[id] = Date.now();
          } catch { /* 이번엔 건너뛰고 다음에 다시 */ }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      total = shorts.length;
      remaining = shorts.filter((x) => !(x.videoId in map)).length;
      await ref.set({ map, emptyAt, basis: shortsIndex.fetchedAt, total, remaining, updatedAt: Date.now(), lockUntil: 0 });
    }
  }
  const linked = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
  res.setHeader('Cache-Control', remaining > 0 ? 'no-store' : 'public, s-maxage=1800, stale-while-revalidate=86400');
  return res.status(200).json({ map: linked, total, checked: Object.keys(map).length, remaining });
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, verifyAdmin } = await import('../_firebase.js');
    // ?kind=related → 쇼츠마다 아래에 연결된 일반 영상 (유튜브 쇼츠 화면 기준)
    if (String(req.query?.kind || '') === 'related') return await handleRelated(db, req, res);
    if (String(req.query?.kind || '') === 'verify-related') { // (임시) 저장된 연결과 관리자 기록 비교
      const map = ((await db.collection('youtube_cache').doc('shorts_related').get()).data()?.map || {}) as Record<string, string>;
      const yid = (u: string) => (/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/.exec(u || '') || [])[1];
      const editedLog = new Map<string, string>();
      const rows: any[] = [];
      const logs: any[] = [];
      (await db.collection('logs_by_month').get()).forEach((d: any) => logs.push(...Object.values(d.data()?.items || {})));
      logs.forEach((l: any) => (l.edited || []).forEach((e: any) => { const id = yid(e.url); if (id && !e.isCompilation && !e.compilationId) editedLog.set(id, l.date); }));
      logs.forEach((l: any) => (l.shorts || []).forEach((x: any) => {
        const sid = yid(x.url); if (!sid || !(sid in map)) return;
        const rel = map[sid];
        rows.push({ sid, date: l.date, rel, relDate: rel ? editedLog.get(rel) || null : null });
      }));
      const withRel = rows.filter((r) => r.rel);
      const sameDay = withRel.filter((r) => r.relDate === r.date);
      const otherDay = withRel.filter((r) => r.relDate && r.relDate !== r.date);
      const notInLogs = withRel.filter((r) => !r.relDate);
      const unlinkedAuto = Object.entries(map).filter(([sid, rel]) => rel && !rows.some((r) => r.sid === sid) && editedLog.has(rel)).length;
      return res.status(200).json({ recordedShorts: rows.length, withRelated: withRel.length, sameBroadcast: sameDay.length, otherBroadcast: otherDay, relatedNotInLogs: notInLogs.length, newlyLinkableShorts: unlinkedAuto });
    }
    // ?kind=uploads → 채널의 일반 영상 전체 (사이트 기록에 없는 영상도 홈에 보이게)
    const kind = String(req.query?.kind || '') === 'uploads' ? 'uploads' : 'shorts';
    const itemsCol = kind === 'uploads' ? 'youtube_uploads_items' : 'youtube_shorts_items';
    const indexRef = db.collection('youtube_cache').doc(kind);
    let index = (await indexRef.get()).data();

    let refresh = false;
    if (String(req.query?.refresh || '') === '1') {
      try { refresh = Boolean(await verifyAdmin(req)); } catch { refresh = false; }
      if (!refresh) return res.status(403).json({ error: '쇼츠 새로고침은 관리자만 할 수 있습니다.' });
    }
    // 새 영상이 올라오니 12시간 지나면 한 번 새로 받음 (동시에 여러 요청이 와도 한 번만: 잠금)
    const stale = index?.fetchedAt && Date.now() - Date.parse(index.fetchedAt) > 12 * 3600 * 1000;
    if (stale && !refresh) {
      refresh = await db.runTransaction(async (tx: any) => {
        const cur = (await tx.get(indexRef)).data() || {};
        if (cur.lockUntil && cur.lockUntil > Date.now()) return false;
        tx.set(indexRef, { lockUntil: Date.now() + 60000 }, { merge: true });
        return true;
      }).catch(() => false);
    }

    if (!index?.fetchedAt || refresh) {
      const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
      if (!key) return res.status(200).json({ shorts: [], error: 'YOUTUBE_API_KEY 환경 변수가 없습니다.' });
      try {
        const channelId = await resolveChannelId(db, key);
        let items: ShortItem[];
        if (kind === 'uploads') {
          try { items = await fetchShorts(channelId, key, 'UULF'); } catch { items = await fetchShorts(channelId, key, 'UU'); }
        } else items = await fetchShorts(channelId, key);
        const old = await db.collection(itemsCol).get();
        const batch = db.batch();
        old.docs.forEach((d: any) => batch.delete(d.ref));
        for (let n = 0; n * CHUNK < items.length; n++) {
          batch.set(db.collection(itemsCol).doc(String(n)), { items: items.slice(n * CHUNK, (n + 1) * CHUNK) });
        }
        index = { channelId, fetchedAt: new Date().toISOString(), count: items.length, chunks: Math.ceil(items.length / CHUNK), lockUntil: 0 };
        batch.set(indexRef, index);
        await batch.commit();
      } catch (e: any) {
        if (!index?.fetchedAt) return res.status(200).json({ shorts: [], error: e?.message || String(e) });
      }
    }

    const refs = Array.from({ length: Number(index?.chunks || 0) }, (_, n) => db.collection(itemsCol).doc(String(n)));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const shorts: ShortItem[] = [];
    snaps.forEach((s: any) => shorts.push(...((s.data()?.items as ShortItem[]) || [])));

    res.setHeader('Cache-Control', refresh ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(kind === 'uploads' ? { videos: shorts, fetchedAt: index?.fetchedAt || null } : { shorts, fetchedAt: index?.fetchedAt || null });
  } catch (e: any) {
    console.error('[videos/shorts] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
