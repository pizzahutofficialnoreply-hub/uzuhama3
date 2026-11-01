import { setCorsHeaders } from '../_cors.js';

/**
 * 우주하마 유튜브 채널의 쇼츠 전체 (GET /api/videos/shorts)
 * - 채널 쇼츠 목록은 유튜브가 자동으로 만드는 'UUSH' 재생목록(UC → UUSH)으로 가져옴
 * - YouTube API 는 처음 한 번만 부르고 Firestore 에 저장, 이후엔 저장된 것만 돌려줌 (자동 재조회 없음)
 * - 관리자만 새로고침: ?refresh=1 + Authorization: Bearer <관리자 ID 토큰>
 * - 저장: youtube_cache/shorts { channelId, fetchedAt, count, chunks }, youtube_shorts_items/{n} { items }
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

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, verifyAdmin } = await import('../_firebase.js');
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
