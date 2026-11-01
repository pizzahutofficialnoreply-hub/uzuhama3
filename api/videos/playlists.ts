import { setCorsHeaders } from '../_cors.js';

/**
 * 우주하마 유튜브 채널의 공개 재생목록 (GET /api/videos/playlists)
 * - YouTube Data API v3 (channels / playlists / playlistItems .list: 호출 1회당 1단위)
 * - 결과는 Firestore youtube_cache/playlists 에 저장, 6시간마다만 새로 조회 (할당량 절약)
 * - 채널: 환경 변수 YOUTUBE_CHANNEL_ID 가 있으면 그 값, 없으면 핸들 @uzuhama 로 찾음
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PLAYLISTS = 60;
const MAX_ITEMS_PER_PLAYLIST = 200;
const API = 'https://www.googleapis.com/youtube/v3';

type PlaylistItem = { videoId: string; title: string; publishedAt: string; position: number };
type Playlist = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  itemCount: number;
  items: PlaylistItem[];
};

async function yt(path: string, key: string) {
  const r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error?.message || `YouTube API HTTP ${r.status}`);
  return json;
}

const bestThumb = (t: any) => t?.maxres?.url || t?.standard?.url || t?.high?.url || t?.medium?.url || t?.default?.url || '';

async function fetchPlaylists(key: string): Promise<{ channelId: string; playlists: Playlist[] }> {
  let channelId = process.env.YOUTUBE_CHANNEL_ID || '';
  if (!channelId) {
    const ch = await yt(`channels?part=id&forHandle=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_HANDLE || '@uzuhama')}`, key);
    channelId = ch?.items?.[0]?.id || '';
    if (!channelId) throw new Error('유튜브 채널을 찾지 못했습니다.');
  }

  const playlists: Playlist[] = [];
  let pageToken = '';
  do {
    const res = await yt(`playlists?part=snippet,contentDetails&channelId=${channelId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`, key);
    (res.items || []).forEach((p: any) => {
      playlists.push({
        id: p.id,
        title: p.snippet?.title || '재생목록',
        description: String(p.snippet?.description || '').slice(0, 300),
        publishedAt: p.snippet?.publishedAt || '',
        thumbnail: bestThumb(p.snippet?.thumbnails),
        itemCount: Number(p.contentDetails?.itemCount || 0),
        items: [],
      });
    });
    pageToken = res.nextPageToken || '';
  } while (pageToken && playlists.length < MAX_PLAYLISTS);

  for (const pl of playlists) {
    let token = '';
    do {
      const res = await yt(`playlistItems?part=snippet,contentDetails&playlistId=${pl.id}&maxResults=50${token ? `&pageToken=${token}` : ''}`, key);
      (res.items || []).forEach((it: any) => {
        const videoId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
        const title = it.snippet?.title || '';
        // 비공개·삭제된 영상은 제외
        if (!videoId || title === 'Private video' || title === 'Deleted video') return;
        pl.items.push({
          videoId,
          title,
          publishedAt: it.contentDetails?.videoPublishedAt || '',
          position: Number(it.snippet?.position ?? pl.items.length),
        });
      });
      token = res.nextPageToken || '';
    } while (token && pl.items.length < MAX_ITEMS_PER_PLAYLIST);
    pl.items.sort((a, b) => a.position - b.position);
    if (!pl.thumbnail && pl.items[0]) pl.thumbnail = `https://i.ytimg.com/vi/${pl.items[0].videoId}/hqdefault.jpg`;
  }

  return { channelId, playlists: playlists.filter((p) => p.items.length > 0) };
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db } = await import('../_firebase.js');
    const ref = db.collection('youtube_cache').doc('playlists');
    const cached = (await ref.get()).data();
    const fresh = cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS;

    const send = (data: any, extra: Record<string, any> = {}) => {
      res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=21600');
      return res.status(200).json({ playlists: data?.playlists || [], fetchedAt: data?.fetchedAt || null, ...extra });
    };
    if (fresh) return send(cached);

    const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    if (!key) return send(cached, { error: 'YOUTUBE_API_KEY 환경 변수가 없습니다.' });

    try {
      const { channelId, playlists } = await fetchPlaylists(key);
      // Firestore 문서 1MB 제한: 넘칠 것 같으면 긴 재생목록부터 뒤쪽 항목을 잘라 저장
      let cap = MAX_ITEMS_PER_PLAYLIST;
      while (Buffer.byteLength(JSON.stringify(playlists)) > 900_000 && cap > 20) {
        cap = Math.floor(cap * 0.8);
        playlists.forEach((p) => { if (p.items.length > cap) p.items = p.items.slice(0, cap); });
      }
      const doc = { channelId, playlists, fetchedAt: new Date().toISOString() };
      await ref.set(doc);
      return send(doc);
    } catch (e: any) {
      // 유튜브 조회가 실패해도 예전 결과가 있으면 그대로 보여줌
      return send(cached, { error: e?.message || String(e) });
    }
  } catch (e: any) {
    console.error('[videos/playlists] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
