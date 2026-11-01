import { setCorsHeaders } from '../_cors.js';

/**
 * 유튜브 영상 길이·업로드일 조회 (GET /api/videos/meta?ids=id1,id2,...)
 * - YouTube Data API v3 (videos.list contentDetails,snippet: 호출 1회당 1단위, part 를 늘려도 비용 동일), 키: YOUTUBE_API_KEY 또는 VITE_YOUTUBE_API_KEY
 * - 한 번 조회한 길이는 Firestore video_meta 에 저장해 두고 재사용 (영상 길이는 바뀌지 않으므로 할당량 절약)
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = String(req.query?.ids || '');
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => ID_RE.test(s)))].slice(0, 50);
  if (ids.length === 0) return res.status(400).json({ error: 'ids 파라미터가 필요합니다.' });

  try {
    const { db } = await import('../_firebase.js');
    const result: Record<string, { durationSec: number | null; publishedAt: string | null } | null> = {};

    // 1. 저장된 값
    const refs = ids.map((id) => db.collection('video_meta').doc(id));
    const snaps = await db.getAll(...refs);
    const missing: string[] = [];
    snaps.forEach((snap: any, i: number) => {
      const d = snap.exists ? snap.data() : null;
      if (d && typeof d.durationSec === 'number' && typeof d.publishedAt === 'string') {
        result[ids[i]] = { durationSec: d.durationSec, publishedAt: d.publishedAt };
      } else if (d && d.notFound) result[ids[i]] = null; // 한 번 조회한 영상은 다시 부르지 않음
      else missing.push(ids[i]);
    });

    // 2. 없는 것만 YouTube API 로 조회
    const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    if (missing.length > 0 && key) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${missing.join(',')}&key=${encodeURIComponent(key)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const json: any = await r.json().catch(() => null);
      if (!r.ok) {
        return res.status(200).json({ videos: result, error: json?.error?.message || `YouTube API HTTP ${r.status}` });
      }
      const found = new Map<string, { durationSec: number | null; publishedAt: string | null }>();
      (json?.items || []).forEach((it: any) => {
        if (!it?.id) return;
        found.set(it.id, {
          durationSec: parseIsoDuration(it?.contentDetails?.duration),
          publishedAt: typeof it?.snippet?.publishedAt === 'string' ? it.snippet.publishedAt : null,
        });
      });
      const batch = db.batch();
      const now = new Date().toISOString();
      missing.forEach((id) => {
        const meta = found.get(id);
        result[id] = meta ?? null;
        batch.set(
          db.collection('video_meta').doc(id),
          meta ? { durationSec: meta.durationSec ?? 0, publishedAt: meta.publishedAt || '', fetchedAt: now } : { notFound: true, fetchedAt: now }
        );
      });
      await batch.commit();
    } else if (missing.length > 0) {
      return res.status(200).json({ videos: result, error: 'YOUTUBE_API_KEY 환경 변수가 없습니다.' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ videos: result });
  } catch (e: any) {
    console.error('[videos/meta] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
