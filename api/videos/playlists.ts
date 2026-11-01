import { setCorsHeaders } from '../_cors.js';

/**
 * 우주하마 유튜브 채널의 공개 재생목록 (GET /api/videos/playlists)
 * - YouTube Data API 는 처음 한 번만 호출하고 Firestore 에 저장. 이후로는 저장된 것만 읽음 (자동 재조회 없음)
 * - 관리자가 직접 새로고침할 때만 다시 가져옴: GET /api/videos/playlists?refresh=1 (Authorization: Bearer <관리자 ID 토큰>)
 * - 저장 구조 (재생목록 길이 제한 없음, Firestore 문서 1MB 제한을 피하려고 나눠 저장)
 *   youtube_cache/playlists         { channelId, channelTitle, channelThumbnail, fetchedAt, playlists: [{ id, title, ..., chunks }] }
 *   youtube_playlist_items/{id}__{n} { items: [...] }  (재생목록당 1,500개씩)
 * - 채널: 환경 변수 YOUTUBE_CHANNEL_ID 가 있으면 그 값, 없으면 핸들 @uzuhama 로 찾음
 */

const API = 'https://www.googleapis.com/youtube/v3';
const CHUNK = 1500;

type PlaylistItem = { videoId: string; title: string; publishedAt: string; position: number };
type PlaylistMeta = { id: string; title: string; description: string; publishedAt: string; thumbnail: string; itemCount: number; chunks: number };

async function yt(path: string, key: string) {
  const r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(9000),
  });
  const json: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error?.message || `YouTube API HTTP ${r.status}`);
  return json;
}

const bestThumb = (t: any) => t?.maxres?.url || t?.standard?.url || t?.high?.url || t?.medium?.url || t?.default?.url || '';

async function fetchFromYouTube(key: string) {
  let channelId = process.env.YOUTUBE_CHANNEL_ID || '';
  const chPath = channelId
    ? `channels?part=snippet&id=${channelId}`
    : `channels?part=snippet&forHandle=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_HANDLE || '@uzuhama')}`;
  const ch = await yt(chPath, key);
  const channel = ch?.items?.[0];
  channelId = channel?.id || channelId;
  if (!channelId) throw new Error('유튜브 채널을 찾지 못했습니다.');

  const metas: (PlaylistMeta & { items: PlaylistItem[] })[] = [];
  let pageToken = '';
  do {
    const res = await yt(`playlists?part=snippet,contentDetails&channelId=${channelId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`, key);
    (res.items || []).forEach((p: any) => {
      metas.push({
        id: p.id,
        title: p.snippet?.title || '재생목록',
        description: String(p.snippet?.description || '').slice(0, 500),
        publishedAt: p.snippet?.publishedAt || '',
        thumbnail: bestThumb(p.snippet?.thumbnails),
        itemCount: Number(p.contentDetails?.itemCount || 0),
        chunks: 0,
        items: [],
      });
    });
    pageToken = res.nextPageToken || '';
  } while (pageToken);

  // 재생목록 안 영상은 개수 제한 없이 끝까지
  for (const pl of metas) {
    let token = '';
    do {
      const res = await yt(`playlistItems?part=snippet,contentDetails&playlistId=${pl.id}&maxResults=50${token ? `&pageToken=${token}` : ''}`, key);
      (res.items || []).forEach((it: any) => {
        const videoId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
        const title = it.snippet?.title || '';
        if (!videoId || title === 'Private video' || title === 'Deleted video') return; // 비공개·삭제 영상 제외
        pl.items.push({
          videoId,
          title,
          publishedAt: it.contentDetails?.videoPublishedAt || '',
          position: Number(it.snippet?.position ?? pl.items.length),
        });
      });
      token = res.nextPageToken || '';
    } while (token);
    pl.items.sort((a, b) => a.position - b.position);
    if (!pl.thumbnail && pl.items[0]) pl.thumbnail = `https://i.ytimg.com/vi/${pl.items[0].videoId}/hqdefault.jpg`;
  }

  return {
    channelId,
    channelTitle: channel?.snippet?.title || '우주하마',
    channelThumbnail: bestThumb(channel?.snippet?.thumbnails),
    playlists: metas.filter((p) => p.items.length > 0),
  };
}

async function saveToFirestore(db: any, data: Awaited<ReturnType<typeof fetchFromYouTube>>) {
  const index = {
    channelId: data.channelId,
    channelTitle: data.channelTitle,
    channelThumbnail: data.channelThumbnail,
    fetchedAt: new Date().toISOString(),
    playlists: data.playlists.map(({ items, ...meta }) => ({ ...meta, itemCount: items.length, chunks: Math.ceil(items.length / CHUNK) })),
  };
  // 예전 조각 정리 후 새로 저장
  const old = await db.collection('youtube_playlist_items').get();
  let batch = db.batch();
  let ops = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; } };
  for (const d of old.docs) { batch.delete(d.ref); if (++ops >= 400) await flush(); }
  for (const pl of data.playlists) {
    for (let n = 0; n * CHUNK < pl.items.length; n++) {
      batch.set(db.collection('youtube_playlist_items').doc(`${pl.id}__${n}`), { items: pl.items.slice(n * CHUNK, (n + 1) * CHUNK) });
      if (++ops >= 400) await flush();
    }
  }
  batch.set(db.collection('youtube_cache').doc('playlists'), index);
  ops++;
  await flush();
  return index;
}

async function loadFromFirestore(db: any, index: any) {
  const refs: any[] = [];
  (index.playlists || []).forEach((p: any) => {
    for (let n = 0; n < (p.chunks || 0); n++) refs.push(db.collection('youtube_playlist_items').doc(`${p.id}__${n}`));
  });
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const byId = new Map<string, PlaylistItem[]>();
  snaps.forEach((s: any) => {
    const [id] = s.id.split('__');
    byId.set(id, [...(byId.get(id) || []), ...((s.data()?.items as PlaylistItem[]) || [])]);
  });
  return {
    channelTitle: index.channelTitle || '우주하마',
    channelThumbnail: index.channelThumbnail || '',
    fetchedAt: index.fetchedAt || null,
    playlists: (index.playlists || []).map((p: any) => ({ ...p, items: byId.get(p.id) || [] })),
  };
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, verifyAdmin } = await import('../_firebase.js');
    const indexRef = db.collection('youtube_cache').doc('playlists');
    let index = (await indexRef.get()).data();

    // 관리자 새로고침 요청만 유튜브를 다시 부름
    let refresh = false;
    if (String(req.query?.refresh || '') === '1') {
      try { refresh = Boolean(await verifyAdmin(req)); } catch { refresh = false; }
      if (!refresh) return res.status(403).json({ error: '재생목록 새로고침은 관리자만 할 수 있습니다.' });
    }

    // 이전 형식(조각 저장 전)으로 저장된 경우에만 한 번 다시 저장
    const isCurrentFormat = Array.isArray(index?.playlists) && index!.playlists.every((p: any) => typeof p.chunks === 'number');
    if (!isCurrentFormat || refresh) {
      const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
      if (!key) return res.status(200).json({ playlists: [], error: 'YOUTUBE_API_KEY 환경 변수가 없습니다.' });
      try {
        index = await saveToFirestore(db, await fetchFromYouTube(key));
      } catch (e: any) {
        if (!index?.playlists) return res.status(200).json({ playlists: [], error: e?.message || String(e) });
      }
    }

    const out = await loadFromFirestore(db, index);
    res.setHeader('Cache-Control', refresh ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(out);
  } catch (e: any) {
    console.error('[videos/playlists] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
