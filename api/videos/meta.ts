import { setCorsHeaders } from '../_cors.js';

/**
 * 유튜브 영상 길이·업로드일 조회 (GET /api/videos/meta?ids=id1,id2,...)
 * - YouTube Data API v3 (videos.list contentDetails,snippet: 호출 1회당 1단위, part 를 늘려도 비용 동일), 키: YOUTUBE_API_KEY 또는 VITE_YOUTUBE_API_KEY
 * - 한 번 조회한 길이는 Firestore video_meta 에 저장해 두고 재사용 (영상 길이는 바뀌지 않으므로 할당량 절약)
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const DAILY_NEW_LOOKUP_LIMIT = 3000; // 하루에 처음 보는 영상 조회 최대 개수 (기존 영상은 저장된 값 사용)

function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

const esc = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * 공유 링크 미리보기 (GET /v/:id → /api/videos/meta?share=:id, /s/:id 는 쇼츠)
 * 카톡·디스코드 등이 읽는 제목·썸네일 카드(og 태그)를 만들고, 사람이 열면 사이트의 그 영상으로 바로 이동
 */
async function sharePage(req: any, res: any) {
  const id = String(req.query?.share || '');
  const kind = req.query?.kind === 'short' ? 'short' : 'video';
  const site = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'uzuhama.vercel.app'}`;
  if (!ID_RE.test(id)) { res.setHeader('Location', site); return res.status(302).end(); }
  let title = '우주하마 영상';
  let author = '';
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) { const j: any = await r.json(); title = j.title || title; author = j.author_name || ''; }
  } catch { /* 제목 없이 */ }
  const target = `${site}/?v=${id}${kind === 'short' ? '&kind=short' : ''}`;
  const img = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const desc = `${author ? `${author} · ` : ''}우주하마 방송 예측에서 방송 날짜·게임·생방송 다시보기와 함께 보기`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 우주하마 방송 예측</title>
<meta property="og:type" content="video.other"><meta property="og:site_name" content="우주하마 방송 예측">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="480"><meta property="og:image:height" content="360">
<meta property="og:url" content="${site}/${kind === 'short' ? 's' : 'v'}/${id}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
</head><body><script>location.replace(${JSON.stringify(target)})</script><a href="${esc(target)}">${esc(title)} 보러 가기</a></body></html>`);
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.query?.share) return sharePage(req, res);

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
    // 남이 아무 영상 ID 나 대량으로 넣어 유튜브 할당량을 소진시키지 못하도록 하루 새 조회 수 제한
    if (missing.length > 0 && key) {
      const budgetRef = db.collection('youtube_cache').doc('meta_budget');
      const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const allowed = await db.runTransaction(async (tx: any) => {
        const b = (await tx.get(budgetRef)).data() || {};
        const used = b.day === today ? Number(b.count || 0) : 0;
        if (used + missing.length > DAILY_NEW_LOOKUP_LIMIT) return false;
        tx.set(budgetRef, { day: today, count: used + missing.length });
        return true;
      });
      if (!allowed) return res.status(200).json({ videos: result, error: '오늘 새 영상 조회 한도를 넘었어요.' });
    }
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
