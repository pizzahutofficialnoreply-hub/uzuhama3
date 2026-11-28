import { setCorsHeaders } from '../_cors.js';

/**
 * 유튜브 영상 길이·업로드일 조회 (GET /api/videos/meta?ids=id1,id2,...)
 * - YouTube Data API v3 (videos.list contentDetails,snippet: 호출 1회당 1단위, part 를 늘려도 비용 동일), 키: YOUTUBE_API_KEY 또는 VITE_YOUTUBE_API_KEY
 * - 한 번 조회한 길이는 Firestore video_meta 에 저장해 두고 재사용 (영상 길이는 바뀌지 않으므로 할당량 절약)
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const DAILY_NEW_LOOKUP_LIMIT = 10000; // 하루에 처음 보는 영상 조회 최대 개수 (기존 영상은 저장된 값 사용)

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


/**
 * 게임 썸네일 찾기 (GET /api/videos/meta?gimg=<게임 링크>) → 그림 주소로 302
 *  - 스팀: 2024년쯤부터 새 게임은 그림 주소에 해시가 붙어서 옛 주소(header.jpg)가 없음 → 스팀 appdetails 의 header_image
 *  - 그 밖(앱 스토어·로블록스·넥슨 등): 그 페이지의 og:image
 *  - CDN 에 30일 보관 (못 찾으면 1일) → 게임마다 한 달에 한 번 정도만 실제로 물어봄
 *  - 내부 주소·IP 직접 입력은 막음
 */
async function gameImage(req: any, res: any) {
  const raw = String(req.query?.gimg || '').slice(0, 500);
  const miss = () => { res.setHeader('Cache-Control', 'public, s-maxage=86400'); return res.status(404).end(); };
  let u: URL;
  try { u = new URL(raw); } catch { return miss(); }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname) || /\.(local|internal)$/i.test(u.hostname)) return miss();
  let img = '';
  try {
    const steam = raw.match(/store\.steampowered\.com\/app\/(\d+)/i) || raw.match(/steamcommunity\.com\/app\/(\d+)/i);
    if (steam) {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steam[1]}&filters=basic`, { signal: AbortSignal.timeout(6000) });
      const j: any = r.ok ? await r.json() : null;
      img = j?.[steam[1]]?.data?.header_image || '';
    } else {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; uzuhama-thumb)', Accept: 'text/html' }, redirect: 'follow' });
      if (r.ok && /text\/html/i.test(r.headers.get('content-type') || '')) {
        const html = (await r.text()).slice(0, 300000);
        const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        if (m) img = new URL(m[1].replace(/&amp;/g, '&'), u).toString();
      }
    }
  } catch { /* 못 찾음 */ }
  if (!/^https:\/\//.test(img)) return miss();
  res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000');
  res.setHeader('Location', img);
  return res.status(302).end();
}

/**
 * 게임 장르 (GET /api/videos/meta?ggenre=<스팀·앱스토어 링크>) → { genres: string[] }
 *  - 카드 확장의 게임 칸: AI 가 짐작한 장르 대신 '방송 기록 카테고리 + 스토어에 적힌 장르'만 보여 주려고
 *  - 스팀 appdetails(genres, 한국어) · 앱스토어 lookup(genres, '게임' 은 뺌) · 그 밖 링크는 빈 목록
 *  - CDN 30일 보관 → DB 읽기 없음, 게임마다 한 달에 한 번 정도만 실제로 물어봄
 */
async function gameGenres(req: any, res: any) {
  const raw = String(req.query?.ggenre || '').slice(0, 500);
  let genres: string[] = [];
  let ok = false;
  try {
    const steam = raw.match(/store\.steampowered\.com\/app\/(\d+)/i) || raw.match(/steamcommunity\.com\/app\/(\d+)/i);
    const apple = raw.match(/apps\.apple\.com\/.*\/id(\d+)/i);
    if (steam) {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steam[1]}&filters=genres&l=koreana&cc=kr`, { signal: AbortSignal.timeout(6000) });
      const j: any = r.ok ? await r.json() : null;
      genres = (j?.[steam[1]]?.data?.genres || []).map((g: any) => String(g?.description || '')); ok = !!j;
    } else if (apple) {
      const r = await fetch(`https://itunes.apple.com/lookup?id=${apple[1]}&country=kr&lang=ko_kr`, { signal: AbortSignal.timeout(6000) });
      const j: any = r.ok ? await r.json() : null;
      genres = (j?.results?.[0]?.genres || []).map(String); ok = !!j;
    } else ok = true;
  } catch { /* 못 찾음 */ }
  genres = [...new Set(genres.map((g) => g.trim()).filter((g) => g && !/^(게임|games?|앞서 해보기|early access|무료 플레이|free to play)$/i.test(g)))].slice(0, 6);
  res.setHeader('Cache-Control', ok ? 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000' : 'public, s-maxage=3600');
  return res.status(200).json({ genres });
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.query?.share) return sharePage(req, res);
  if (req.query?.gimg) return gameImage(req, res);
  if (req.query?.ggenre) return gameGenres(req, res);

  const raw = String(req.query?.ids || '');
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => ID_RE.test(s)))].slice(0, 50);
  if (ids.length === 0) return res.status(400).json({ error: 'ids 파라미터가 필요합니다.' });

  // live=1: 생방송이었다면 실제로 켠 시각(liveAt)도 (카페 가져오기에서 생방 날짜 확인용)
  const wantLive = !!req.query?.live;
  // desc=1: 영상 설명 앞부분도 (설명에 적힌 생방 날짜로 교차 확인)
  const wantDesc = !!req.query?.desc;
  try {
    const { db } = await import('../_firebase.js');
    const result: Record<string, { durationSec: number | null; publishedAt: string | null; liveAt?: string | null; title?: string } | null> = {};

    // 1. 저장된 값
    const refs = ids.map((id) => db.collection('video_meta').doc(id));
    const snaps = await db.getAll(...refs);
    const missing: string[] = [];
    snaps.forEach((snap: any, i: number) => {
      const d = snap.exists ? snap.data() : null;
      if (d && typeof d.durationSec === 'number' && typeof d.publishedAt === 'string' && (!wantLive || ('liveAt' in d && 'title' in d)) && (!wantDesc || 'desc' in d)) {
        result[ids[i]] = { durationSec: d.durationSec, publishedAt: d.publishedAt, ...('liveAt' in d ? { liveAt: d.liveAt ?? null } : {}), ...('title' in d ? { title: d.title } : {}), ...(wantDesc && 'desc' in d ? { desc: d.desc } : {}) } as any;
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
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,liveStreamingDetails&id=${missing.join(',')}&key=${encodeURIComponent(key)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const json: any = await r.json().catch(() => null);
      if (!r.ok) {
        return res.status(200).json({ videos: result, error: json?.error?.message || `YouTube API HTTP ${r.status}` });
      }
      const found = new Map<string, { durationSec: number | null; publishedAt: string | null; liveAt: string | null; title: string; desc: string }>();
      (json?.items || []).forEach((it: any) => {
        if (!it?.id) return;
        found.set(it.id, {
          durationSec: parseIsoDuration(it?.contentDetails?.duration),
          publishedAt: typeof it?.snippet?.publishedAt === 'string' ? it.snippet.publishedAt : null,
          liveAt: it?.liveStreamingDetails?.actualStartTime || it?.liveStreamingDetails?.scheduledStartTime || null,
          title: String(it?.snippet?.title || ''),
          desc: String(it?.snippet?.description || '').slice(0, 1500),
        });
      });
      const batch = db.batch();
      const now = new Date().toISOString();
      missing.forEach((id) => {
        const meta = found.get(id);
        result[id] = meta ? (wantDesc ? meta : (({ desc, ...rest }) => rest)(meta)) : null;
        batch.set(
          db.collection('video_meta').doc(id),
          meta ? { durationSec: meta.durationSec ?? 0, publishedAt: meta.publishedAt || '', liveAt: meta.liveAt, title: meta.title, desc: meta.desc, fetchedAt: now } : { notFound: true, fetchedAt: now }
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
