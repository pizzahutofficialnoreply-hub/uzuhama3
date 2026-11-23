/**
 * AI 영상 상세 분석 + AI 검색 (함수 아님: '_' 로 시작)
 *
 * 분석 (runAiVideoStep): 점검(tick)이 몇 분마다 한 번 부르면 '한 구간'씩 분석
 *  - 대상: 채널 전체 (일반 영상·생방송 다시보기·쇼츠, 유튜브 'UU' 재생목록), 최신 영상부터
 *  - Gemini 가 유튜브 주소를 직접 봄 (영상을 내려받지 않음). 긴 영상은 10분씩 나눠서 (시간 초과면 그 영상은 더 잘게)
 *  - 무료 한도: 유튜브 영상은 하루 8시간까지 → 기본 7시간(AI_VIDEO_DAILY_SEC)까지만, 한도에 걸리면 다음 날까지 쉼
 *  - 영상을 다 보면: 전체 요약 + 나온 게임을 구글 검색으로 찾아 어떤 게임인지 정리 (다른 유튜버 플레이 반응 포함)
 *  - 모델: GEMINI_VIDEO_MODEL → 3.8 → 3.7 → 3.6 → 3.5 Flash → … → Flash-Lite (무료 한도가 모델마다 따로라 차례로)
 *
 * 저장
 *  - ai_video/{videoId}: { title, kind, publishedAt, duration, status, pos(여기까지 봄), seg, segTotal, segSec, summary, parts[], scenes[{t,d,k}], keywords, games, mood, kw[] }
 *  - ai_games/{slug}: { name, genre, about, tags[], horror, aliases[] }
 *  - youtube_cache/ai_queue: { items: [{ id, title, publishedAt, kind, duration, live }], fetchedAt }
 *  - youtube_cache/ai_state: { lockUntil, day, usedSec, calls, coolUntil, lastError, lastRunAt, lastId }
 *
 * 검색 (aiSearch): 검색어 → 키워드 뽑기 → kw 배열로 Firestore 에서 1단계로 거름(최대 40개만 읽음) → 장면 단위로 점수
 *  - 검색할 때 AI 를 부르지 않음
 */

const SEG_SEC = 6 * 60; // 10분은 AI 쪽 시간 초과(504)가 잦음
const MIN_SEG_SEC = 3 * 60;
const DAILY_SEC = Number(process.env.AI_VIDEO_DAILY_SEC || 7 * 3600);
// 하루 부르는 횟수 상한: 실패(한도·없는 모델)도 한 번으로 세서, 180 이면 실제로 본 건 몇 분인데 하루가 끝나 버렸음 → 넉넉히 (진짜 한도는 구글이 429 로 알려 줌)
const DAILY_CALLS = Number(process.env.AI_VIDEO_DAILY_CALLS || 1200);
const QUEUE_TTL = 12 * 3600 * 1000;
// 무료 한도는 모델마다 따로라서, 하나가 하루 한도에 걸리면 다음 모델로 (좋은 것부터 → 가벼운 것)
const FLASH = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const LITE = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
// 무료로 버티기 (기본): 무료 한도가 Flash 는 하루 20번, Flash-Lite 는 하루 500번이라 Lite 부터 (Flash 는 Lite 를 다 쓴 뒤에)
// 결제해서 한도가 넉넉하면 Vercel 환경 변수 AI_VIDEO_PREFER=flash → 정확한 Flash 부터
const PREFER_FLASH = String(process.env.AI_VIDEO_PREFER || '').toLowerCase() === 'flash';
// 스크립트 모델(gemini-3.5-flash-lite)은 스크립트 몫으로 남기게 분석은 다른 Lite 부터
const LITE_A = [...LITE.filter((m) => m !== (process.env.GEMINI_SCRIPT_MODEL || 'gemini-3.5-flash-lite')), process.env.GEMINI_SCRIPT_MODEL || 'gemini-3.5-flash-lite'];
const MODELS = [...new Set([process.env.GEMINI_VIDEO_MODEL, ...(PREFER_FLASH ? [...FLASH, ...LITE_A] : [...LITE_A, ...FLASH])].filter(Boolean))] as string[];
/** 분석 방식 버전: 바뀌면 예전 방식(가벼운 모델·낮은 화질)으로 본 영상을 다시 봄 */
const PV = 4; // 4: 생방송 노가리·오팬무 // 3: 한 말·함께한 사람도 기록
const TEXT_MODELS = [...new Set([process.env.GEMINI_VIDEO_MODEL, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'].filter(Boolean))] as string[];
// ↑ 끝의 셋: 영상 보기에 쓰는 가벼운 모델 — 위 모델이 다 한도면 정리(이야기·게임)도 이걸로 (전엔 정리 단계만 계속 막혀 영상이 '다 봄'이 안 됐음)

type QItem = { id: string; title: string; publishedAt: string; kind?: 'video' | 'short' | 'live'; duration?: number; live?: string; logDate?: string; games?: string[]; gameLinks?: Record<string, string>; comp?: boolean };
const QUEUE_VER = 4; // 2: 방송 기록의 생방송 다시보기 포함, 3: 몰아보기 표시(분석 안 함), 4: 아카이브 생방송 전부·따로 받은 생방송 재생목록
export type Scene = { t: number; d: string; k: string[]; u?: number /* 1: 확실하지 않음 */; q?: string /* 한 말 */; w?: string[] /* 함께한 사람 */ };

const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const isRate = (m: string) => /429|quota|RESOURCE_EXHAUSTED|rate limit|Too Many Requests/i.test(m);
/** 잠깐 붐빔 (다른 모델로 바꾸거나 조금 뒤에) */
const isBusy = (m: string) => /503|UNAVAILABLE|overloaded|high demand|try again later|500|INTERNAL/i.test(m);
const isTimeout = (m: string) => /timeout|timed out|aborted|deadline|DEADLINE_EXCEEDED|504/i.test(m);
/** 한 번 분석에 기다릴 시간 (이 함수는 최대 300초) */
const AI_TIMEOUT = Number(process.env.AI_VIDEO_TIMEOUT_MS || 120000); // 잘 되는 구간은 20초 안팎
const ytKey = () => process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY || '';
const aiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

/* ── 키워드 정규화 (분석 저장과 검색이 같은 규칙) ── */
const JOSA = /(으로부터|에서부터|이라고|이라는|에게서|한테서|까지|부터|에서|에게|한테|으로|처럼|같은|이랑|하고|이나|이란|라고|라는|은|는|이|가|을|를|에|의|도|만|로|와|과|랑|들)$/;
const STOP = new Set(['영상', '장면', '부분', '방송', '나오는', '나온', '나오던', '있는', '있던', '하는', '했던', '하던', '찾아줘', '찾아', '보여줘', '알려줘', '추천', '추천해줘', '거', '것', '좀', '그', '그거', '뭐', '뭐였지', '어디', '언제', '어떤', '우주하마', '우주하마님', '좜마', '좜마님', '좜마야', '좜마형', '우좜마', '우좜마님', '우좜마야', '우좜마형', '우잠마', '우잠마님', '우잠마야', '우잠마형', '우자마', '우자마님', '우자마야', '우자마형', '하마', '하마님', '하마야', '하마형', '좜마형님', '좜마형야', '좜마형형', '하마형님', '하마형야', '하마형형', '편', '부분이', '나오', '그때', '때', '중', '보면', '보고', '싶어', '싶은', '줘', '해줘', '있어', '같은데', '다시보기', '생방', '생방송']);
export function normWord(w: string): string {
  let s = String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (s.length > 2) s = s.replace(JOSA, '');
  return s;
}
export function queryTokens(q: string): string[] {
  const raw = String(q || '').split(/[\s,.!?~·/|()[\]"'"]+/).map(normWord).filter((w) => w.length >= 2 && !STOP.has(w));
  const out = new Set<string>(raw);
  const joined = normWord(String(q || '').replace(/\s+/g, ''));
  if (raw.length > 1 && joined.length <= 12) out.add(joined); // '점프 스케어' ↔ '점프스케어'
  return [...out].slice(0, 30);
}
function buildKw(doc: any): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const full = normWord(s);
    if (full.length >= 2 && full.length <= 20) out.add(full);
    String(s || '').split(/\s+/).forEach((p) => { const w = normWord(p); if (w.length >= 2 && !STOP.has(w)) out.add(w); });
  };
  (doc.keywords || []).forEach(add);
  (doc.mood || []).forEach(add);
  (doc.games || []).forEach((g: any) => { add(g.name); (g.tags || []).forEach(add); (g.aliases || []).forEach(add); if (g.genre) add(g.genre); });
  (doc.scenes || []).forEach((sc: Scene) => { (sc.k || []).forEach(add); (sc.w || []).forEach(add); if (sc.q) add(sc.q); });
  String(doc.nogari || '').split(/\s+/).forEach(add);
  if (doc.opanmu) { add('오팬무'); String(doc.opanmu).split(/\s+/).forEach(add); }
  (doc.chapters || []).forEach((c: any) => { add(c.title || ''); String(c.summary || '').split(/\s+/).forEach(add); });
  (doc.gameStories || []).forEach((g: any) => { add(g.name || ''); [g.story, g.result, ...(g.highlights || []).map((h: any) => h.d)].join(' ').split(/\s+/).forEach(add); });
  String(doc.title || '').split(/\s+/).forEach(add);
  return [...out].slice(0, 500);
}

/* ── 유튜브 ── */
async function yt(path: string) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(ytKey())}`, { signal: AbortSignal.timeout(9000) });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `YouTube HTTP ${r.status}`);
  return j;
}
const parseDur = (iso: string) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
};
async function channelId(db: any): Promise<string> {
  for (const d of ['shorts', 'playlists']) {
    const c = (await db.collection('youtube_cache').doc(d).get()).data();
    if (c?.channelId) return c.channelId;
  }
  if (process.env.YOUTUBE_CHANNEL_ID) return process.env.YOUTUBE_CHANNEL_ID;
  const ch = await yt(`channels?part=id&forHandle=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_HANDLE || '@uzuhama')}`);
  return ch?.items?.[0]?.id || '';
}
/** 생방송으로 분석할 재생목록 (관리자가 알려 준 것) */
export const EXTRA_LIVE_PLAYLISTS = ['PLbQ644AvftHoSsEoENc4On-gy50g8FHKx'];
export async function playlistIds(pl: string): Promise<{ id: string; title: string; publishedAt: string }[]> {
  const out: { id: string; title: string; publishedAt: string }[] = [];
  let token = '';
  let guard = 0;
  do {
    const res = await yt(`playlistItems?part=snippet,contentDetails&playlistId=${pl}&maxResults=50${token ? `&pageToken=${token}` : ''}`);
    (res.items || []).forEach((it: any) => {
      const id = it.contentDetails?.videoId;
      const title = it.snippet?.title || '';
      if (id && title !== 'Private video' && title !== 'Deleted video') out.push({ id, title, publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || '' });
    });
    token = res.nextPageToken || '';
  } while (token && ++guard < 80);
  return out;
}

/** 분석 목록: 문서 하나가 1MB를 넘지 않게 나눠 저장 (ai_queue + ai_queue_1, _2 …) */
const QUEUE_CHUNK = 1500;
export async function readQueueDoc(db: any): Promise<any> {
  const head = (await db.collection('youtube_cache').doc('ai_queue').get()).data();
  if (!head) return null;
  const n = Number(head.parts || 0);
  if (n <= 1) return head;
  const rest = await db.getAll(...Array.from({ length: n - 1 }, (_, i) => db.collection('youtube_cache').doc(`ai_queue_${i + 1}`)));
  return { ...head, items: [...(head.items || []), ...rest.flatMap((d: any) => (d.exists ? d.data()?.items || [] : []))] };
}
async function writeQueueDoc(db: any, meta: any, items: QItem[]) {
  const chunks: QItem[][] = [];
  for (let i = 0; i < items.length; i += QUEUE_CHUNK) chunks.push(items.slice(i, i + QUEUE_CHUNK));
  if (!chunks.length) chunks.push([]);
  for (let i = 1; i < chunks.length; i++) await db.collection('youtube_cache').doc(`ai_queue_${i}`).set({ items: chunks[i] });
  await db.collection('youtube_cache').doc('ai_queue').set({ ...meta, items: chunks[0], parts: chunks.length });
}
async function loadQueue(db: any): Promise<{ items: QItem[]; fresh: boolean }> {
  const cur = await readQueueDoc(db);
  if (cur?.items?.length && cur.v === QUEUE_VER && Date.now() - Date.parse(cur.fetchedAt || '0') < QUEUE_TTL) return { items: cur.items, fresh: false };
  const cid = await channelId(db);
  if (!cid) throw new Error('채널을 찾지 못했어요');
  const all = await playlistIds(`UU${cid.slice(2)}`);
  let shorts = new Set<string>();
  try { shorts = new Set((await playlistIds(`UUSH${cid.slice(2)}`)).map((x) => x.id)); } catch { /* 길이로 판단 */ }
  const prev = new Map<string, QItem>((cur?.items || []).map((x: QItem) => [x.id, x]));
  const items: QItem[] = all.map((x) => ({ ...prev.get(x.id), ...x }));
  // 방송 기록의 '생방송' 다시보기 링크 (사이트 라이브 탭과 같은 것) → 생방송으로 분석. 다른 채널에 올라간 것도 포함
  const byId = new Map<string, QItem>(items.map((x) => [x.id, x]));
  try {
    // 아카이브 + 고친 기록 전부 (logs 컬렉션만 보면 아카이브 생방송이 빠짐)
    const { loadSiteLogs } = await import('./_siteLogs.js');
    const siteLogs = (await loadSiteLogs(db, { maxAgeMs: 3600000 })).logs as any[];
    const logs = { docs: siteLogs.map((l) => ({ data: () => l })) };
    // 몰아보기: 각 영상을 이어 붙인 것이라 따로 분석 안 함
    const comps = new Set<string>();
    logs.docs.forEach((d: any) => (d.data()?.edited || []).forEach((e: any) => {
      if (!(e?.isCompilation || e?.compilationId)) return;
      const m = String(e?.url || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
      if (m) comps.add(m[1]);
    }));
    items.forEach((x) => { if (comps.has(x.id)) x.comp = true; });
    logs.docs.forEach((d: any) => {
      const log = d.data() || {};
      if (log.isAbsence || !log.date) return;
      const gl: Record<string, string> = {};
      const games = (Array.isArray(log.games) && log.games.length ? log.games : log.game ? [{ name: log.game }] : []).map((g: any) => {
        const name = String(typeof g === 'string' ? g : g?.name || '').trim();
        if (name && g?.link) gl[name] = String(g.link).slice(0, 300);
        return name;
      }).filter(Boolean).slice(0, 6);
      (Array.isArray(log.vods) ? log.vods : []).forEach((v: any) => {
        const url = typeof v === 'string' ? v : v?.url;
        const m = String(url || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
        if (!m) return;
        const id = m[1];
        const t = String((typeof v === 'string' ? '' : v?.title) || '').trim();
        const ex = byId.get(id);
        if (ex) { ex.kind = 'live'; ex.logDate = log.date; ex.games = games; ex.gameLinks = gl; return; }
        const it: QItem = { ...prev.get(id), id, title: t && !/^우주하마\s*생방송!?$/.test(t) ? t : `${String(log.date).replace(/-/g, '.')} 생방송`, publishedAt: `${log.date}T12:00:00Z`, kind: 'live', logDate: log.date, games, gameLinks: gl };
        byId.set(id, it);
        items.push(it);
      });
    });
  } catch { /* 기록 없이 */ }
  // 따로 받은 생방송 재생목록 (다른 채널·아카이브 재생목록)
  for (const pl of EXTRA_LIVE_PLAYLISTS) {
    try {
      for (const x of await playlistIds(pl)) {
        const ex = byId.get(x.id);
        if (ex) { ex.kind = 'live'; continue; }
        const it: QItem = { ...prev.get(x.id), id: x.id, title: x.title, publishedAt: x.publishedAt, kind: 'live' };
        byId.set(x.id, it); items.push(it);
      }
    } catch { /* 재생목록 못 읽음 */ }
  }
  // 길이·생방송 여부 (50개당 1단위)
  const need = items.filter((x) => !x.duration || x.live === 'upcoming' || x.live === 'live');
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const res = await yt(`videos?part=contentDetails,snippet,liveStreamingDetails&id=${part.map((x) => x.id).join(',')}`);
    const map = new Map<string, any>((res.items || []).map((v: any) => [v.id, v]));
    part.forEach((x) => {
      const v = map.get(x.id);
      if (!v) return;
      x.duration = parseDur(v.contentDetails?.duration);
      x.live = v.snippet?.liveBroadcastContent || 'none';
      x.kind = x.logDate ? 'live' : shorts.has(x.id) ? 'short' : v.liveStreamingDetails ? 'live' : 'video';
      if (x.logDate && v.snippet?.title && /생방송$/.test(x.title)) x.title = v.snippet.title;
    });
  }
  items.forEach((x) => {
    if (!x.kind) x.kind = shorts.has(x.id) ? 'short' : 'video';
    if (x.kind !== 'live' && /몰아\s*보기|모아\s*보기|합본/.test(x.title)) x.comp = true;
  });
  // 비공개·삭제된 다시보기(유튜브가 정보를 안 줌)는 빼기
  for (let i = items.length - 1; i >= 0; i--) if (items[i].logDate && !items[i].duration) items.splice(i, 1);
  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  let channelCount = 0;
  try { channelCount = Number((await yt(`channels?part=statistics&id=${cid}`))?.items?.[0]?.statistics?.videoCount || 0); } catch { /* 없어도 됨 */ }
  // 게임 링크는 길어서 목록에는 이름만 남기고 줄임 (문서 크기)
  items.forEach((x) => { if (x.gameLinks) x.gameLinks = Object.fromEntries(Object.entries(x.gameLinks).slice(0, 4).map(([k, v]) => [k, String(v).slice(0, 160)])); if (x.title) x.title = x.title.slice(0, 120); });
  await writeQueueDoc(db, { fetchedAt: new Date().toISOString(), count: items.length, channelCount, v: QUEUE_VER }, items);
  return { items, fresh: true };
}

/* ── Gemini ── */
// 모델별 쉬는 시간 (하루 한도면 다음 한도 초기화까지, 분당 한도면 알려 준 시간만큼, 붐비면 5분)
let modelCool: Record<string, number> = {};
let modelWhy: Record<string, string> = {};
// 한도 걸린 이유 원문 (어느 한도 · 몇 개) — 왜 계속 막히는지 보려고
let modelQuota: Record<string, string> = {};
/** 무료 한도 초기화: 미국 태평양 자정 (한국 오후 4~5시) */
const nextQuotaReset = () => {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 5));
  if (t.getTime() <= Date.now()) t.setUTCDate(t.getUTCDate() + 1);
  return t.getTime();
};
const retryMs = (msg: string) => {
  const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":\s*"(\d+)s"/);
  return m ? Math.ceil(parseFloat(m[1])) * 1000 : 0;
};
function coolModel(model: string, msg: string) {
  if (isRate(msg)) {
    // 하루 한도: 메시지에 PerDay 가 있거나, 다시 하라는 시간이 30분보다 길면
    const ids = [...msg.matchAll(/"quotaId":\s*"([^"]+)"/g)].map((m) => m[1]);
    const vals = [...msg.matchAll(/"quotaValue":\s*"?(\d+)/g)].map((m) => m[1]);
    // 무료로 아예 못 쓰는 모델 (한도 0) → 하루 쉼
    const none = vals.length > 0 && vals.every((v) => v === '0') || /limit:\s*0\b/.test(msg);
    const daily = none || /PerDay|per day|daily|RPD/i.test(msg) || retryMs(msg) > 30 * 60000;
    modelCool[model] = daily ? nextQuotaReset() : Date.now() + Math.max(60000, retryMs(msg) || 10 * 60000);
    modelWhy[model] = none ? 'none' : daily ? 'day' : 'minute';
    modelQuota[model] = `${ids.join(',') || '-'} = ${vals.join(',') || '?'} · retry ${Math.round(retryMs(msg) / 1000)}s`.slice(0, 200);
  } else if (isBusy(msg)) {
    modelCool[model] = Date.now() + 5 * 60000;
    modelWhy[model] = 'busy';
  } else if (/not found|404|no longer available|unsupported|invalid model/i.test(msg)) {
    // 없어진 모델: 하루 동안 다시 부르지 않음 (매번 실패하며 횟수만 씀)
    modelCool[model] = nextQuotaReset();
    modelWhy[model] = 'gone';
  }
}

/**
 * 영상을 넣은 호출이 '할당량 초과'(429)인데 짧은 글은 바로 되면: 진짜 한도가 아니라 그 영상(구간)만 막힌 것
 * → 모델 쉬는 시간을 풀고 그 영상을 실패로 쳐서 다음으로 넘어감 (예전에는 같은 영상에서 하루 종일 멈춤)
 */
async function videoOnlyQuota(): Promise<boolean> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${aiKey()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '1' }] }], generationConfig: { maxOutputTokens: 4 } }) });
    if (!r.ok) return false;
  } catch { return false; }
  for (const m of Object.keys(modelCool)) if (modelWhy[m] === 'minute' || modelWhy[m] === 'day') { delete modelCool[m]; delete modelWhy[m]; }
  lastVideoQuota = true;
  return true;
}
let lastVideoQuota = false;
async function gen(parts: any[], json: boolean, timeoutMs: number, models = MODELS, extraIn: any = {}) {
  // _nextOnTimeout: 시간 초과면 다음 모델로 (검색할 때 확인처럼 기다리는 사람이 있을 때)
  const { _nextOnTimeout, _noCool, ...extra } = extraIn || {};
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: aiKey() });
  let lastErr: any;
  let tried = 0;
  for (const model of models) {
    if ((modelCool[model] || 0) > Date.now()) continue;
    tried++;
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}), httpOptions: { timeout: timeoutMs }, ...extra },
      });
      return { text: r.text || '', model };
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (isTimeout(msg)) { if (_nextOnTimeout) { modelCool[model] = Date.now() + 10 * 60000; modelWhy[model] = 'busy'; continue; } throw e; } // 시간 초과는 보통 다른 모델로 바꿔도 같음
      if (!/not found|404|unsupported|invalid model/i.test(msg) && !isRate(msg) && !isBusy(msg)) throw e;
      // 구글 검색 붙인 호출의 한도(검색 한도는 따로)는 모델을 쉬게 하지 않고 바로 돌려줌 → 검색 없이 다시
      if (_noCool && isRate(msg)) throw e;
      coolModel(model, msg);
    }
  }
  if (!tried) throw new Error('RESOURCE_EXHAUSTED: 모든 모델이 한도·붐빔으로 쉬는 중');
  throw lastErr || new Error('AI 응답 없음');
}
const parseJson = (t: string) => {
  try { return JSON.parse(t); } catch { /* 앞뒤 글자 */ }
  const m = String(t || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : {}; } catch { return {}; }
};
const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const toSec = (v: any): number => {
  if (typeof v === 'number') return v;
  const p = String(v || '').split(':').map(Number);
  if (p.some(isNaN)) return NaN;
  return p.reduce((a, b) => a * 60 + b, 0);
};
const words = (a: any, n: number, len = 30) => [...new Set((Array.isArray(a) ? a : []).map((x: any) => String(x || '').trim()).filter((x: string) => x && x.length <= len))].slice(0, n) as string[];

/**
 * 스크립트(대사): 구간에서 들린 말을 시간과 함께 빠짐없이
 * - 생방송은 자막이 없어서 소리를 듣고 받아 적음 → 잘 안 들리면 지어내지 않고 (잘 안 들림)
 * - 노래는 가사를 적지 않고 '♪' 로만 (저작권)
 */
/** 스크립트 받아 적는 한 번의 길이 (초). 길면 뒤쪽 말이 빠지고 시간이 앞으로 몰림 */
export const SCRIPT_CHUNK = 60;
function cleanLines(a: any, from: number, to: number): { t: number; s: string; w?: string }[] {
  let out: { t: number; s: string; w?: string }[] = (Array.isArray(a) ? a : []).map((x: any) => ({ t: toSec(x?.t), s: String(x?.s || '').replace(/\s+/g, ' ').trim().slice(0, 160), w: String(x?.w || '').trim().replace(/^(후원|게임|우주하마)\S*$/, '$1').slice(0, 20) }))
    .filter((x) => Number.isFinite(x.t) && x.s && x.w !== '후원');
  // 구간 기준(0부터)으로 답했으면 원본 기준으로
  if (from > 0 && out.length && Math.max(...out.map((x) => x.t)) < from) out = out.map((x) => ({ ...x, t: x.t + from }));
  out = out.filter((x) => x.t >= from - 5 && x.t <= to + 5).map((x) => ({ t: Math.max(0, Math.round(x.t)), s: x.s, ...(x.w && x.w !== '우주하마' ? { w: x.w } : {}) }));
  out.sort((a2, b2) => a2.t - b2.t);
  return out.slice(0, 600);
}
/** 스크립트 저장: ai_script/{id} 의 segs.{시작초} 에 구간별로 (다시 봐도 같은 구간은 덮어씀) */
const SCRIPT_V = 5; // 5: 새로 짬 (한 모델·1분·맥락 없이) · 4: // 4: 2분씩 따로 받아 적고 구간 기준 시각 · // 2: 화면 채팅창은 받아 적지 않음 · 3: 화면에 뜬 글자(아이템 이름 등)도 안 적음, 편집본은 말 자막 참고
/** 예전 방식(v5 전)으로 받아 적은 구간: 전부 새로 */
function badScriptSeg(g: any, _kind?: string): boolean {
  return Number(g?.v || 1) < SCRIPT_V;
}
/** 보여 줄 때: 같은 몇 초 안에 몰린 후원 줄(채팅창을 읽은 것)은 빼기 */
export function dropChatLines(lines: any[]): any[] {
  // 후원: 몇 초 안에 2줄 넘게 몰림 = 채팅창을 읽은 것 · 게임: 몇 초 간격으로 줄줄이 = 화면 글자(아이템·책 이름 등)를 읽은 것
  const by = (w: string) => lines.filter((l) => l?.w === w);
  const game = by('게임');
  const busyG = (t: number) => game.filter((l) => Math.abs(l.t - t) <= 6).length >= 3;
  // 후원은 스크립트에 넣지 않음
  return lines.filter((l) => l?.w !== '후원' && !(l?.w === '게임' && busyG(l.t)));
}
/**
 * 생방송 스크립트를 같은 방송의 편집 영상 스크립트로 바로잡기 (편집본은 말 자막을 보고 받아 적어서 글자가 더 정확)
 * 확실할 때만: 거의 같은 말(글자 75% 이상 겹침)이고, 근처의 다른 두 줄 이상이 같은 시간 차이로 맞을 때만 그 줄의 글자를 바꿈
 * (시간은 생방송 그대로, 줄을 새로 넣거나 빼지 않음)
 */
const nrm = (x: string) => String(x || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
/** 글자(음절) 단위 비슷함: 1 - 고칠 글자 수 / 긴 쪽 길이 */
export function textSim(a: string, b: string): number {
  const x = [...nrm(a)], y = [...nrm(b)];
  if (!x.length || !y.length) return 0;
  if (x.join('') === y.join('')) return 1;
  if (Math.abs(x.length - y.length) / Math.max(x.length, y.length) > 0.4) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}
export function alignFromEdit(live: { t: number; s: string; w?: string }[], edit: { t: number; s: string; w?: string }[]) {
  const pairs: { li: number; ei: number; off: number; sim: number }[] = [];
  edit.forEach((e, ei) => {
    if (nrm(e.s).length < 6 || e.w === '게임') return;
    let best = -1, bs = 0;
    live.forEach((l, li) => { if (l.w === '게임') return; const v = textSim(l.s, e.s); if (v > bs) { bs = v; best = li; } });
    if (best >= 0 && bs >= 0.75) pairs.push({ li: best, ei, off: live[best].t - e.t, sim: bs });
  });
  const ok = pairs.filter((p) => pairs.filter((q) => q !== p && Math.abs(q.off - p.off) <= 4 && Math.abs(edit[q.ei].t - edit[p.ei].t) <= 90).length >= 2);
  const out = live.map((l) => ({ ...l }));
  let changed = 0;
  const used = new Set<number>();
  for (const p of ok.sort((a, b) => b.sim - a.sim)) {
    if (used.has(p.li)) continue;
    used.add(p.li);
    const e = edit[p.ei];
    if (out[p.li].s !== e.s) { (out[p.li] as any).o = out[p.li].s; out[p.li].s = e.s; (out[p.li] as any).fx = 1; changed++; }
  }
  return { lines: out, changed, matched: used.size };
}
/** 방금 스크립트를 다 받아 적은 영상과 같은 방송의 생방송↔편집 영상 짝을 찾아 바로잡기 */
async function fixLivesFromEdits(db: any, id: string) {
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db)).logs;
  const yid = (v: any) => ytIdOf(typeof v === 'string' ? v : v?.url);
  for (const l of logs) {
    const lives = (l.vods || []).map(yid).filter(Boolean);
    const edits = (l.edited || []).filter((e: any) => !(e?.isCompilation || e?.compilationId || e?.multiId)).map(yid).filter(Boolean);
    if (!lives.length || !edits.length || !(lives.includes(id) || edits.includes(id))) continue;
    const ids = [...lives, ...edits].slice(0, 10);
    const docs = await db.getAll(...ids.map((x: string) => db.collection('ai_script').doc(x)));
    const map: Record<string, any> = {};
    docs.forEach((d: any, i: number) => { if (d.exists) map[ids[i]] = d.data(); });
    const linesOf = (d: any) => Object.values(d?.segs || {}).filter((x: any) => Number(x.v || 1) >= SCRIPT_V).flatMap((x: any) => x.lines || []);
    const editLines = edits.flatMap((e: string) => linesOf(map[e])).filter((x: any) => x.w !== '후원');
    if (editLines.length < 5) continue;
    for (const lv of lives) {
      const d = map[lv];
      if (!d?.segs) continue;
      const segs = Object.values(d.segs as Record<string, any>).filter((x: any) => Number(x.v || 1) >= SCRIPT_V);
      let total = 0;
      const next: Record<string, any> = {};
      // 구간마다 따로 맞춤 (그 구간 줄만 바뀜)
      for (const g of segs as any[]) {
        const r = alignFromEdit(g.lines || [], editLines);
        if (r.changed) { next[String(g.from)] = { ...g, lines: r.lines }; total += r.changed; }
      }
      if (total) await db.collection('ai_script').doc(lv).set({ segs: next, fixedAt: new Date().toISOString() }, { merge: true });
    }
  }
}
async function saveScript(db: any, id: string, from: number, to: number, lines: any[]) {
  await db.collection('ai_script').doc(id).set({ id, segs: { [String(from)]: { from, to, lines, v: SCRIPT_V } }, updatedAt: new Date().toISOString() }, { merge: true });
}
export async function aiScript(db: any, id: string) {
  if (!/^[\w-]{11}$/.test(id)) return { found: false };
  const d = (await db.collection('ai_script').doc(id).get()).data();
  if (!d?.segs) return { found: false, lines: [] };
  // 새로 짠 방식(v5)으로 받아 적은 것만 (예전 것은 없는 말이 많아서 안 보여 줌)
  const segs = Object.values(d.segs as Record<string, any>).filter((x: any) => Number(x.v || 1) >= SCRIPT_V).sort((a: any, b: any) => a.from - b.from);
  if (!segs.length) return { found: false, lines: [] };
  return { found: true, id, covered: segs.map((x: any) => [x.from, x.to]), lines: dropChatLines(segs.flatMap((x: any) => x.lines || []).sort((a: any, b: any) => a.t - b.t)) };
}
/** 스크립트만 받아 적기 (예전에 스크립트 없이 본 영상 채우기 · 정확도 확인용) */
/**
 * 스크립트 (새로 짬, v5)
 *  - 한 모델로만 (모델마다 받아 적는 버릇이 달라 섞이면 들쭉날쭉) · 한도면 기다림
 *  - 1분씩 잘라서, 제목·게임·설명 같은 앞뒤 맥락은 주지 않음 (맥락을 보고 없는 말을 지어냈음)
 *  - 온도 0
 */
/** config/system.voiceRef = "유튜브 주소 또는 id@시작초-끝초" (예: abcdEFGhijk@120-140) · 10분 동안 기억 */
let vrMemo: { at: number; v: { id: string; from: number; to: number } | null } | null = null;
async function voiceRef() {
  if (vrMemo && Date.now() - vrMemo.at < 600000) return vrMemo.v;
  let v: { id: string; from: number; to: number } | null = null;
  try {
    const { db } = await import('./_firebase.js');
    const raw = String((await db.collection('config').doc('system').get()).data()?.voiceRef || '');
    const m = raw.match(/([\w-]{11})[^@]*@(\d+)-(\d+)/);
    if (m && +m[3] > +m[2] && +m[3] - +m[2] <= 40) v = { id: m[1], from: +m[2], to: +m[3] };
  } catch { /* 없으면 예시 없이 */ }
  vrMemo = { at: Date.now(), v };
  return v;
}
export const SCRIPT_MODEL = process.env.GEMINI_SCRIPT_MODEL || 'gemini-3.5-flash-lite';
function scriptPrompt(kind: string | undefined, len: number) {
  const live = kind === 'live';
  return `이 ${len ? `${Math.round(len)}초짜리 ` : ''}${live ? '방송 녹화' : '영상'} 조각의 소리를 듣고, 사람이 실제로 말한 것만 받아 적어. JSON 으로만 답해:
{"lines": [{"t": "M:SS (이 조각의 시작이 0:00)", "w": "", "s": "들린 말"}]}
규칙:
- 실제로 들린 말만 적어. 앞뒤를 짐작해서 이어 쓰거나 있을 법한 말을 만들어 넣지 마. 단어를 알아들을 수 없으면 그 줄은 빼.
- 우주하마(주인공·남자 방송인, 마이크에 가장 가깝고 크게 들리는 목소리)가 말한 건 짧은 혼잣말·중얼거림·감탄("아", "와 미쳤다")·띄엄띄엄 끊어 말한 것까지 빠짐없이 적어. 말이 끊겼다 이어지면 끊긴 곳마다 새 줄.
- 후원 TTS(기계 목소리)나 게임 소리와 겹쳐서 말해도, 우주하마 목소리는 TTS 와 구분해서 그 말만 적어 (TTS 가 읽은 내용은 적지 말 것).
- 이 조각 앞뒤에 무슨 일이 있었는지는 몰라도 돼. 이 조각 안에서 들린 것만.
- 실제로 반복하지 않은 말을 반복해서 적지 마.
- 말이 하나도 없으면 "lines": [].
- w: 우주하마(주인공)가 말하면 빈칸. 다른 사람이 말하면 그 사람 이름(모르면 "다른 사람"), 게임 캐릭터 목소리는 "게임".
- 적지 말 것: 후원·후원 알림·TTS 목소리, 화면에만 보이는 글자(채팅창, 메뉴, 아이템·책 이름, 안내문, 퀘스트), 효과음, 노래 가사 (노래는 "♪ (노래)" 한 줄만).
- 들린 그대로 (고치거나 요약하거나 번역하지 말 것). 한 줄은 한두 문장. 욕은 ○○.
- t 는 그 말이 시작된 순간을, 조각 시작 기준으로 초 단위까지 정확히.${live ? '' : `
- 편집 영상이라 화면에 '말을 적은 자막'이 있을 수 있어. 들린 말의 글자를 정확히 하는 데만 참고해 (자막과 소리가 다르면 소리대로, 말이 아닌 꾸밈 자막·설명 자막은 적지 마).`}`;
}
export async function transcribeSegment(item: { id: string; title: string; kind?: string; duration?: number }, start: number, end: number) {
  const whole = !item.duration || item.duration <= end - start + 30;
  const len = whole ? (item.duration || 0) : end - start;
  const part: any = { fileData: { fileUri: `https://www.youtube.com/watch?v=${item.id}` } };
  // 생방송은 화면이 거의 필요 없으니 장면을 드물게 (소리에 집중), 편집본은 말 자막을 봐야 해서 1초에 1장
  if (!whole) part.videoMetadata = { startOffset: `${start}s`, endOffset: `${end}s`, ...(item.kind === 'live' ? { fps: 0.2 } : {}) };
  else if (item.kind === 'live') part.videoMetadata = { fps: 0.2 };
  // 우주하마 목소리 예시 (관리자가 정해 두면): 누가 우주하마인지 구분하는 데만 씀
  const ref = await voiceRef();
  const parts: any[] = ref ? [{ text: '먼저 이건 우주하마(주인공) 목소리 예시야. 받아 적지 말고 목소리 구분에만 써.' }, { fileData: { fileUri: `https://www.youtube.com/watch?v=${ref.id}` }, videoMetadata: { startOffset: `${ref.from}s`, endOffset: `${ref.to}s`, fps: 0.1 } }, { text: '이제 받아 적을 조각:' }, part] : [part];
  const { text, model } = await gen([...parts, { text: scriptPrompt(item.kind, len) }], true, AI_TIMEOUT, [SCRIPT_MODEL], { temperature: 0, mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  // 조각 기준 시각 → 원본 기준 (원본 기준으로 답했으면 그대로)
  const raw = (parseJson(text).lines || []) as any[];
  const secs = raw.map((x) => toSec(x?.t)).filter((t) => Number.isFinite(t));
  const relative = !whole && start > 0 && secs.length > 0 && Math.max(...secs) <= len + 5;
  const lines = cleanLines(relative ? raw.map((x) => ({ ...x, t: toSec(x?.t) + start })) : raw, whole ? 0 : start, whole ? (item.duration || 1e9) : end);
  return { model, lines, squeezed: squeezed(lines, whole ? 0 : start, len) };
}
/** 줄은 많은데 시각이 구간 앞쪽에만 몰려 있으면 (시간이 잘못 찍힌 것) */
export function squeezed(lines: { t: number }[], from: number, len: number): boolean {
  if (lines.length < 8 || len < 60) return false;
  const last = Math.max(...lines.map((l) => l.t)) - from;
  return last < len * 0.45;
}

async function analyzeSegment(item: QItem, start: number, end: number, desc: string) {
  const whole = item.kind === 'short' || !item.duration || item.duration <= end - start + 30;
  const prompt = `너는 스트리머 "우주하마"의 영상을 검색용으로 꼼꼼히 정리하는 사람이야. (시청자·함께한 사람들은 우주하마를 좜마·우좜마·우잠마·우자마·하마·좜마형·하마형 등으로 부르기도 해. 그렇게 들리면 우주하마를 말하는 거야. 본인이 직접 이렇게 말하는 일은 드물어.) 시청자가 나중에 "귀신 점프스케어 나오는 장면", "노래 부르는 부분", "엔딩 보고 우는 장면"처럼 찾을 수 있게 정리해.
영상 제목: ${item.title}
종류: ${item.kind === 'short' ? '쇼츠' : item.kind === 'live' ? '생방송 다시보기' : '편집 영상'}${item.duration ? ` / 전체 길이 ${fmt(item.duration)}` : ''}
${item.logDate ? `방송 날짜: ${item.logDate}\n` : ''}${item.games?.length ? `방송 기록에 적힌 게임: ${item.games.join(', ')}\n` : ''}${desc ? `설명: ${desc.slice(0, 600)}\n` : ''}${whole ? '' : `지금 보는 건 원본 영상의 ${fmt(start)} ~ ${fmt(end)} 구간이야.\n`}
화면·자막·말소리를 모두 보고 아래 JSON 으로만 답해. 모르는 건 지어내지 마. 말투: 설명 문장은 모두 '~해요/~했어요' 체로 끝내 (~한다·~합니다·~함 섞지 말 것).
{
 "summary": "이 ${whole ? '영상' : '구간'}에서 일어난 일 2~3문장 (한국어)",
 "scenes": [{"t": "원본 영상 기준 시작 시각 MM:SS 또는 H:MM:SS", "d": "무슨 장면인지 한 문장", "k": ["검색 키워드 3~8개: 장면 성격(점프스케어, 귀신, 비명, 웃음, 노래, 보스전, 엔딩, 사망, 실패, 성공 등)·등장 대상·감정·맵/스테이지 이름"], "say": "그 순간 우주하마나 함께한 사람이 한 인상적인 말 (그대로, 없으면 빈칸)", "who": ["화면·말로 확인되는 함께한 사람 이름이나 닉네임"], "sure": true}],
 "games": [{"name": "화면에 나온 게임 정식 이름(영문이면 영문 그대로)", "ko": "한국어 이름이나 흔히 부르는 이름"}],
 "keywords": ["이 ${whole ? '영상' : '구간'} 전체를 대표하는 검색어 5~15개 (한국어)"],
 "mood": ["분위기 단어 1~5개 (공포, 웃김, 힐링, 긴장감, 감동, 혼돈 등)"],
 "say_note": ""${item.kind === 'live' ? `,
 "nogari": "게임 시작 전 수다(노가리) 부분이 이 구간에 있으면: 무슨 얘기를 했는지 앞뒤 흐름 그대로, 웃긴 말·드립·리액션을 살려서 시청자가 말하듯 편하게 3~8문장. 요약 보고서 말투(~했다, ~를 언급함) 말고 '~했는데 ~해서 빵 터졌어요' 같은 편한 해요체. 노가리가 없으면 빈칸",
 "opanmu": "우주하마가 오늘 입은 팬티 색·무늬를 직접 정확히 말했으면 그 말 그대로 짧게 (예: 파란색, 핑크 땡땡이). 말 안 했거나 애매하면 빈칸"` : ''}
}
k 에는 화면에 실제로 또렷이 나온 것·실제로 들린 것만 넣어. '비명'은 크게 놀라 지르는 소리만 (작은 감탄사·"음~"·웃음·혼잣말은 '비명' 아님). 예: 귀신·괴물이 실제로 화면에 보이면 '귀신', 소리만 나거나 그림자·착각·"귀신인가?" 하는 말뿐이면 '귀신' 대신 '귀신 의심'·'소리'처럼 쓰고 sure 를 false 로. 확실하면 sure 는 true.
scenes 는 눈에 띄는 순간마다 (${whole ? '최대 15개' : '최대 25개'}), 시간 순서로. 방송 끝에 "우주랑 하마를 합치면 우주하마" 노래를 부르며 마무리하는 건 매번 하는 아웃트로라 넣지 마. (say_note 는 비워 둬)`;
  // mimeType 을 붙이면 유튜브 주소를 느린 방식으로 읽어 시간 초과가 남 → 주소만
  const part: any = { fileData: { fileUri: `https://www.youtube.com/watch?v=${item.id}` } };
  if (!whole) part.videoMetadata = { startOffset: `${start}s`, endOffset: `${end}s` };
  // 화질은 '낮음': 무료 한도가 분당·하루 글자(토큰) 수라, 기본 화질이면 6분 한 구간만으로 분당 한도를 거의 다 씀
  // (낮음은 같은 영상을 약 3분의 1 토큰으로 봄 → 같은 한도로 3배 가까이 봄. 소리·말은 그대로 들음)
  const { text, model } = await gen([part, { text: prompt }], true, AI_TIMEOUT, MODELS, { mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  const out = parseJson(text);
  let scenes: Scene[] = (Array.isArray(out.scenes) ? out.scenes : []).map((s: any) => ({ t: toSec(s?.t), d: String(s?.d || '').slice(0, 160), k: words(s?.k, 8), ...(s?.sure === false ? { u: 1 } : {}), ...(String(s?.say || '').trim() ? { q: String(s.say).trim().slice(0, 80) } : {}), ...(words(s?.who, 4, 20).length ? { w: words(s?.who, 4, 20) } : {}) }))
    .filter((s: Scene) => Number.isFinite(s.t) && s.d);
  // 구간을 잘라 보냈는데 모든 시각이 0부터 시작하면 구간 기준으로 답한 것 → 원본 기준으로
  if (!whole && start > 0 && scenes.length && scenes.every((s) => s.t < end - start + 5) && Math.max(...scenes.map((s) => s.t)) < start) {
    scenes = scenes.map((s) => ({ ...s, t: s.t + start }));
  }
  scenes = scenes.map((s) => ({ ...s, t: Math.max(0, Math.round(s.t)) }));
  return {
    model,
    summary: String(out.summary || '').slice(0, 500),
    scenes,
    games: (Array.isArray(out.games) ? out.games : []).map((g: any) => ({ name: String(g?.name || '').trim().slice(0, 80), ko: String(g?.ko || '').trim().slice(0, 80) })).filter((g: any) => g.name),
    keywords: words(out.keywords, 15),
    mood: words(out.mood, 5, 10),
    nogari: String(out.nogari || '').trim().slice(0, 1200),
    lines: [] as { t: number; s: string; w?: string }[], // 스크립트는 따로 짧게 잘라 받아 적음 (같이 하면 줄이 많이 빠지고 시간이 몰렸음)
    opanmu: String(out.opanmu || '').trim().slice(0, 30),
  };
}

const slug = (s: string) => normWord(s).slice(0, 80) || 'x';

/** 게임이 어떤 게임인지: 구글 검색(공식 소개·스토어·다른 유튜버 플레이 영상 반응)으로 */
let searchOffUntil = 0;
async function analyzeGame(db: any, name: string, ko: string, link = '') {
  const ref = db.collection('ai_games').doc(slug(name));
  const cur = (await ref.get()).data();
  if (cur?.about) return cur;
  const prompt = `게임 "${name}"${ko ? ` (한국어로 "${ko}")` : ''}이 어떤 게임인지 구글 검색으로 확인해 줘.${link ? ` 방송 기록에 적힌 게임 링크: ${link} (이 페이지의 소개도 참고)` : ''} 공식 소개·스토어 페이지·리뷰, 그리고 이 게임을 플레이한 다른 유튜버·스트리머 영상의 제목과 반응을 참고해.
아래 JSON 으로만 답해 (한국어). 확인 안 되는 건 비워 둬.
{"name":"정식 이름","aliases":["한국어 이름·줄임말"],"genre":"장르","about":"어떤 게임인지 2~3문장","tags":["검색 키워드 5~12개: 분위기·소재·특징 (예: 점프스케어, 생존, 퍼즐, 협동, 귀여움)"],"horror":true/false,"players":"혼자/협동/대전 등","reactions":"다른 유튜버 플레이 영상에서 흔히 나오는 반응 한두 문장"}`;
  let out: { text: string; model: string };
  if (searchOffUntil > Date.now()) out = await gen([{ text: prompt.replace('구글 검색으로 확인해 줘', '알려 줘') }], false, 30000, TEXT_MODELS);
  else {
    try { out = await gen([{ text: prompt }], false, 30000, TEXT_MODELS, { tools: [{ googleSearch: {} }], _noCool: true }); }
    catch (e: any) {
      if (!isRate(String(e?.message || e))) throw e;
      // 검색 한도만 다 씀 (영상 분석은 됨): 오늘은 검색 없이 아는 만큼만
      searchOffUntil = nextQuotaReset();
      out = await gen([{ text: prompt.replace('구글 검색으로 확인해 줘', '알려 줘') }], false, 30000, TEXT_MODELS);
    }
  }
  const { text, model } = out;
  const g = parseJson(text);
  const doc = {
    name: String(g.name || name).slice(0, 80), input: name, ko,
    aliases: words(g.aliases, 8), genre: String(g.genre || '').slice(0, 40), about: String(g.about || '').slice(0, 400),
    tags: words(g.tags, 12), horror: g.horror === true, players: String(g.players || '').slice(0, 40), reactions: String(g.reactions || '').slice(0, 300),
    model, updatedAt: new Date().toISOString(),
  };
  await ref.set(doc);
  return doc;
}

/** 한 번 부를 때 한 구간 (또는 마무리 한 단계). 결과를 짧게 돌려줌 */
/** 스토리 정리 버전: 바뀌면 이미 본 영상도 (영상은 다시 안 보고) 정리만 다시 */
const SV = 3; // 3: 스크립트(대사) 바탕으로 다시 정리 · 2: 노가리·오팬무
/** 스토리 정리를 다시 할 영상: 예전 방식이거나, 스크립트가 다 만들어졌는데 아직 스크립트로 정리 안 한 것 */
const needStory = (d: any) => d.status === 'done' && !d.noStory && Number(d.storyTries || 0) < 3 && (Number(d.sv || 0) < 2 || (Number(d.sv || 0) < SV && Boolean(d.scriptDone)));

/* ── 분석 목록 색인 (youtube_cache/ai_ids 문서 하나) ──
 * ids: 분석을 시작한 영상, done: 요약까지 끝난 영상, fin: 더 볼 게 없는 영상
 * 매번 ai_video 문서를 수십~수천 개 읽어 '다음 볼 영상'을 찾던 것 → 이 문서 하나로 거르고 남은 것만 읽음 */
export const AI_IDX_VER = 3; // 3: 쇼츠(요약 없음)는 ids·done 에서 빼고 scan 에
export function aiFinished(d: any): boolean {
  if (!d) return false;
  const busySkip = d.status === 'skip' && /high demand|UNAVAILABLE/i.test(d.error || '');
  const redo = d.pv !== PV && d.status !== 'skip';
  const restory = !redo && needStory(d);
  if (busySkip || redo || restory) return false;
  return d.status === 'done' || d.status === 'skip' || (d.status === 'error' && Number(d.tries || 0) >= 3);
}
export function buildAiIndex(docs: { id: string; data: any }[]) {
  return {
    ids: docs.filter((x) => x.data?.status !== 'skip' && !x.data?.noStory).map((x) => x.id),
    done: docs.filter((x) => x.data?.status === 'done' && !x.data?.noStory).map((x) => x.id),
    // 연동 추천용: 요약 없는 쇼츠까지 분석이 끝난 것 전부
    scan: docs.filter((x) => x.data?.status === 'done').map((x) => x.id),
    fin: docs.filter((x) => aiFinished(x.data)).map((x) => x.id),
    v: AI_IDX_VER,
    at: new Date().toISOString(),
  };
}
/** 영상 하나가 바뀌었을 때 색인만 고침 (문서 1개 읽기) */
async function indexAiDoc(db: any, id: string) {
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    const d = (await db.collection('ai_video').doc(id).get()).data();
    const op = (on: boolean) => (on ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id));
    await db.collection('youtube_cache').doc('ai_ids').set({
      ids: op(Boolean(d) && d.status !== 'skip' && !d.noStory),
      done: op(d?.status === 'done' && !d.noStory),
      scan: op(d?.status === 'done'),
      fin: op(aiFinished(d)),
    }, { merge: true });
  } catch { /* 다음 전체 정리 때 맞춰짐 */ }
}
let pickedId = '';

/**
 * 영상 길이를 넘는 시간·기록에 없는 하이라이트 빼기
 * (AI가 게임 소개에서 본 내용을 이 영상 일처럼 지어내 시간까지 붙이는 일이 있었음 → 영상 길이 25분인데 40:25 엔딩 등)
 */
/** 매번 하는 아웃트로("우주랑 하마를 합치면 우주하마" 노래로 마무리)는 요약에서 빼기 */
const OUTRO = /우주(랑|와)\s*하마(를|가)?\s*합치면|합치면\s*우주하마|아웃트로/;
export function dropOutro(d: any): any {
  const sentences = (t: string) => String(t || '').split(/(?<=[.!?요])\s+/).filter((x) => !OUTRO.test(x)).join(' ');
  return {
    ...d,
    summary: sentences(d.summary),
    chapters: (d.chapters || []).filter((c: any) => !OUTRO.test(`${c.title} ${c.summary}`)),
    gameStories: (d.gameStories || []).map((g: any) => ({ ...g, story: sentences(g.story), highlights: (g.highlights || []).filter((h: any) => !OUTRO.test(h.d)) })),
    scenes: (d.scenes || []).filter((x: any) => !OUTRO.test(`${x.d} ${x.q || ''}`)),
  };
}
export function fitTimes<T extends { chapters?: any[]; gameStories?: any[]; scenes?: any[] }>(x: T, duration: number, scenes: { t: number }[] = []): T {
  const dur = Number(duration) || 0;
  const inDur = (t: number) => !dur || t <= dur + 5;
  const near = (t: number) => !scenes.length || scenes.some((s) => Math.abs(s.t - t) <= 45);
  return {
    ...x,
    ...(x.scenes ? { scenes: x.scenes.filter((s: any) => inDur(s.t)) } : {}),
    ...(x.chapters ? { chapters: x.chapters.filter((c: any) => inDur(c.from)).map((c: any) => (dur && c.to > dur ? { ...c, to: dur } : c)) } : {}),
    ...(x.gameStories ? { gameStories: x.gameStories.map((g: any) => ({ ...g, highlights: (g.highlights || []).filter((h: any) => inDur(h.t) && near(h.t)) })).filter((g: any) => g.story || g.highlights.length) } : {}),
  };
}

async function buildStory(title: string, cur: any, games: any[], script: { t: number; s: string; w?: string }[] = []) {
  const parts = (cur?.parts || []).map((p: any) => `[${fmt(p.from)}~${fmt(p.to)}] ${p.summary}`).join('\n').slice(0, 14000);
  const scenes = (cur?.scenes || []).filter((x: Scene) => !x.u).map((x: Scene) => `${fmt(x.t)} ${x.d}${x.q ? ` "${x.q}"` : ''}`).join('\n').slice(0, 16000);
  const nogariRaw = (cur?.parts || []).filter((p: any) => p.nogari).map((p: any) => `[${fmt(p.from)}~${fmt(p.to)}] ${p.nogari}`).join('\n').slice(0, 6000);
  const opanmu = ((cur?.parts || []).find((p: any) => p.opanmu) || {}).opanmu || '';
  // 대사: 너무 길면 고르게 덜어 냄 (긴 생방송)
  const sl = script.filter((l) => l.s && !/^♪/.test(l.s));
  const step = Math.max(1, Math.ceil(sl.map((l) => l.s.length + 10).reduce((a, b) => a + b, 0) / 60000));
  const talk = sl.filter((_, i) => i % step === 0).map((l) => `${fmt(l.t)} ${l.w ? `(${l.w}) ` : ''}${l.s}`).join('\n');
  const gl = games.map((g: any) => `- ${g.ko && g.ko !== g.name ? `${g.ko} (${g.name})` : g.name}${g.about ? `: ${g.about}` : ''}`).join('\n');
  const prompt = `스트리머 우주하마의 영상 "${title}" 을 AI가 보고 정리한 기록이야. 장면 하나하나가 아니라, 시청자가 한눈에 보게 '이야기·사건 단위'로 묶어 줘.
규칙: 한국어. 방송 끝에 "우주랑 하마를 합치면 우주하마" 노래를 부르며 마무리하는 건 매번 하는 아웃트로라 요약·흐름·하이라이트 어디에도 넣지 마. ${talk ? '[대사]는 실제로 들린 말을 받아 적은 거라 가장 믿을 만해: 무슨 일이 있었는지·누가 뭘 했는지는 [대사]를 바탕으로 쓰고, [구간별 정리]·[장면 기록]은 화면 쪽 참고로만. [대사]와 다르면 [대사]를 따라. ' : ''}게임 안의 일은 그 게임에서 쓰는 말 그대로 (아무 데나 비유하지 말 것: 책 정리 게임의 '자동 정리'를 '자율주행'이라 부르는 식 금지). 기록에 없는 건 지어내지 말 것 (게임 소개는 무슨 게임인지만 참고하고, 이 영상에서 실제로 나온 일은 [구간별 정리]·[장면 기록]에 있는 것만). 말투: 설명 문장은 모두 '~해요/~했어요' 체로 끝내 (~한다·~합니다·~함 섞지 말 것). 시간은 초(정수), [대사]·[장면 기록]에 있는 시간만. 너무 잘게 나누지 말고 큰 흐름 위주.
JSON 으로만:
{"summary":"영상 전체 3~4문장",
 "chapters":[{"from":초,"to":초,"title":"이 구간 이름 (짧게)","summary":"무슨 일이 있었는지 1~2문장","game":"이때 하던 게임 이름(없으면 빈칸)"}],
 "gameStories":[{"name":"게임 이름 (아래 목록 그대로)","story":"이 영상에서 이 게임의 줄거리·진행 2~4문장 (스포일러 포함 가능)","result":"이 영상에서의 결과를 아주 짧게 (클리어 / 엔딩 / 포기 / 진행 중 / 1챕터까지 처럼 10자 안팎, 모르면 빈칸)","highlights":[{"t":초,"d":"하이라이트 한 줄"}]}],
 "nogari":"아래 [노가리] 가 있으면 하나로 이어서: 앞뒤 자르지 말고 흐름 그대로, 웃긴 말·드립·리액션을 살려 시청자가 친구한테 얘기하듯 편하게 (보고서 말투 금지, 너무 길지만 않게 4~10문장). 없으면 빈칸",
 "moments":[{"t":초,"d":"검색용 상황 기록 한 문장: 어떤 게임·맵·장소에서, 우주하마가 어떤 캐릭터·옷·무기로, 무엇을 했고(누구한테 밀림·떨어짐·잡힘 등), 결과가 어땠는지(1등·탈락·클리어 등)를 기록에 있는 그대로 구체적으로"}]}
chapters 는 영상 길이에 따라 3~12개, highlights 는 게임마다 최대 5개, moments 는 기억에 남을 만한 순간마다 최대 40개 (기록·대사에 있는 것만, 없는 디테일은 쓰지 말 것).

[나온 게임]
${gl || '(없음)'}

[구간별 정리]
${parts}
${nogariRaw ? `\n[노가리]\n${nogariRaw}\n` : ''}

[장면 기록]
${scenes}
${talk ? `\n[대사] (시각 · 들린 말, 이름 없는 줄은 우주하마)\n${talk}\n` : ''}`;
  const { text } = await gen([{ text: prompt }], true, 40000, TEXT_MODELS);
  const j = parseJson(text) || {};
  const num = (v: any) => Math.max(0, Math.round(Number(v) || 0));
  const chapters = (Array.isArray(j.chapters) ? j.chapters : []).slice(0, 14).map((c: any) => ({
    from: num(c.from), to: num(c.to), title: String(c.title || '').slice(0, 60), summary: String(c.summary || '').slice(0, 300), game: String(c.game || '').slice(0, 60),
  })).filter((c: any) => c.title || c.summary).sort((a: any, b: any) => a.from - b.from);
  const gameStories = (Array.isArray(j.gameStories) ? j.gameStories : []).slice(0, 8).map((g: any) => ({
    name: String(g.name || '').slice(0, 80), story: String(g.story || '').slice(0, 700), result: String(g.result || '').slice(0, 80),
    highlights: (Array.isArray(g.highlights) ? g.highlights : []).slice(0, 6).map((h: any) => ({ t: num(h.t), d: String(h.d || '').slice(0, 160) })).filter((h: any) => h.d),
  })).filter((g: any) => g.name && (g.story || g.highlights.length));
  const fitted = fitTimes({ chapters, gameStories }, Number(cur?.duration || 0) || Math.max(0, ...(cur?.parts || []).map((p: any) => Number(p.to) || 0)), [...(cur?.scenes || []), ...sl]);
  const moments = (Array.isArray(j.moments) ? j.moments : []).slice(0, 40).map((m: any) => ({ t: num(m.t), d: String(m?.d || '').trim().slice(0, 240) })).filter((m: any) => m.d && !OUTRO.test(m.d));
  const durS = Number(cur?.duration || 0);
  return { moments: durS ? moments.filter((m: any) => m.t <= durS + 5) : moments, fromScript: Boolean(talk), summary: String(j.summary || '').slice(0, 800), chapters: fitted.chapters, gameStories: fitted.gameStories, nogari: String(j.nogari || '').trim().slice(0, 2000) || nogariRaw.replace(/\[[^\]]+\]\s*/g, '').slice(0, 2000), opanmu: String(opanmu).slice(0, 30) };
}

/** 몰아보기 가볍게 보기: 오프닝 10분 + 설명란으로 주제·구성 */
async function compOverview(item: QItem, desc: string) {
  const prompt = `이 영상은 스트리머 '우주하마' 채널의 몰아보기(여러 방송을 모은 영상)야. 제목: ${item.title}
설명란: ${desc || '(없음)'}
앞부분(오프닝 약 10분)을 보고, 설명란 목차가 있으면 참고해서 JSON 으로만 답해:
{
 "opening": "오프닝에서 무슨 말·장면으로 시작하는지 2~4문장 (시청자가 말하듯 편하게)",
 "theme": "이 몰아보기가 어떤 주제·기준으로 모은 영상인지 1~2문장",
 "topics": [{"t": "시작 시각(초, 설명란 목차에 있으면 그 시각, 모르면 null)", "title": "다루는 게임·주제 이름"}],
 "games": [{"name": "게임 원래 이름", "ko": "한국어 이름(있으면)"}],
 "keywords": ["검색어 5~12개 (한국어)"]
}
보이고 들린 것·설명란에 적힌 것만. 모르는 건 빈칸. 말투: 문장은 모두 '~해요/~했어요' 체로.`;
  const part: any = { fileData: { fileUri: `https://www.youtube.com/watch?v=${item.id}` }, videoMetadata: { startOffset: '0s', endOffset: `${Math.min(600, Number(item.duration || 600))}s`, fps: 0.5 } };
  const { text, model } = await gen([part, { text: prompt }], true, AI_TIMEOUT, MODELS, { mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  const out = parseJson(text);
  const topics = (Array.isArray(out.topics) ? out.topics : []).map((x: any) => ({ t: Number.isFinite(Number(x?.t)) && x?.t !== null ? Math.max(0, Math.round(Number(x.t))) : null, title: String(x?.title || '').trim().slice(0, 80) })).filter((x: any) => x.title).slice(0, 40);
  return {
    model,
    overview: { opening: String(out.opening || '').trim().slice(0, 600), theme: String(out.theme || '').trim().slice(0, 300) },
    topics,
    games: (Array.isArray(out.games) ? out.games : []).map((g: any) => ({ name: String(g?.name || '').trim().slice(0, 80), ko: String(g?.ko || '').trim().slice(0, 80) })).filter((g: any) => g.name).slice(0, 30),
    keywords: words(out.keywords, 12),
  };
}

export async function runAiVideoStep(db: any, opts: { kind?: string } = {}): Promise<any> {
  pickedId = '';
  const r = await runAiVideoStepInner(db, opts);
  const id = pickedId || r?.id;
  if (id) await indexAiDoc(db, id);
  return r;
}

async function runAiVideoStepInner(db: any, opts: { kind?: string } = {}): Promise<any> {
  if (!aiKey()) return { skipped: 'GEMINI_API_KEY 없음' };
  lastVideoQuota = false;
  if (!ytKey()) return { skipped: 'YOUTUBE_API_KEY 없음' };
  const stRef = db.collection('youtube_cache').doc('ai_state');
  const now = Date.now();
  const st = (await stRef.get()).data() || {};
  modelCool = Object.fromEntries(Object.entries(st.modelCool || {}).filter(([, v]) => Number(v) > now)) as Record<string, number>;
  modelWhy = { ...(st.modelWhy || {}) };
  modelQuota = { ...(st.modelQuota || {}) };
  if (st.paused) return { skipped: '관리자가 멈춤' };
  if (Number(st.lockUntil || 0) > now) return { skipped: '다른 요청이 분석 중' };
  if (Number(st.coolUntil || 0) > now) return { skipped: `한도 · ${new Date(st.coolUntil).toISOString()} 까지 쉼`, why: String(st.lastError || '').slice(0, 300) };
  const day = kstDay();
  const usedSec = st.day === day ? Number(st.usedSec || 0) : 0;
  const calls = st.day === day ? Number(st.calls || 0) : 0;
  if (usedSec >= DAILY_SEC || calls >= DAILY_CALLS) return { skipped: `오늘 한도 다 씀 (${Math.round(usedSec / 60)}분 · ${calls}번)` };
  await stRef.set({ lockUntil: now + AI_TIMEOUT + 60000, day, usedSec, calls }, { merge: true });

  const release = (patch: any = {}) => stRef.set({ lockUntil: 0, lastRunAt: new Date().toISOString(), modelCool, modelWhy, modelQuota, ...patch }, { mergeFields: ['lockUntil', 'lastRunAt', 'modelCool', 'modelWhy', 'modelQuota', ...Object.keys(patch)] });
  try {
    const { items: queue, fresh } = await loadQueue(db);
    // 목록을 방금 새로 받았으면 시간이 빠듯하니 분석은 다음 차례에
    if (fresh) { await release({ lastError: '' }); return { queue: queue.length }; }
    // 아직 안 끝난 첫 영상 (최신부터, 30개씩 확인)
    let item: QItem | undefined;
    let cur: any;
    const col = db.collection('ai_video');
    // 방문자가 '먼저 봐 달라'고 한 영상부터
    const pr: string[] = (st.priority || []).filter((pid: string) => queue.some((q) => q.id === pid));
    for (const pid of pr) {
      if (opts.kind) break;
      const d = (await col.doc(pid).get()).data();
      if (d?.pv === PV && ((d?.status === 'done' && (d?.sv === SV || Number(d?.storyTries || 0) >= 3)) || d?.status === 'skip' || (d?.status === 'error' && (d.tries || 0) >= 3))) continue;
      item = queue.find((q) => q.id === pid); cur = d?.pv === PV ? d : null; break;
    }

    // 하던 영상부터 (매번 목록 앞에서부터 30개씩 읽으면 DB 읽기가 많이 듦)
    if (!item && !opts.kind && st.lastId) {
      const q = queue.find((x) => x.id === st.lastId && x.live !== 'live' && x.live !== 'upcoming');
      if (q) {
        const d = (await col.doc(q.id).get()).data();
        if (d && d.pv === PV && d.status !== 'done' && d.status !== 'skip' && !(d.status === 'error' && (d.tries || 0) >= 3)) { item = q; cur = d; }
      }
    }
    // 다 끝난 영상은 색인으로 미리 걸러서 안 읽음
    let finSet = new Set<string>();
    if (!item) {
      try {
        const ix = (await db.collection('youtube_cache').doc('ai_ids').get()).data();
        if (ix?.v === AI_IDX_VER && Array.isArray(ix.fin)) finSet = new Set(ix.fin);
      } catch { /* 색인 없으면 예전처럼 */ }
    }
    const todo = finSet.size ? queue.filter((q) => !finSet.has(q.id)) : queue;
    for (let i = 0; i < todo.length && !item; i += 30) {
      const part = todo.slice(i, i + 30).filter((q) => q.live !== 'live' && q.live !== 'upcoming' && (!opts.kind || q.kind === opts.kind));
      if (!part.length) continue;
      const snaps = await db.getAll(...part.map((q) => col.doc(q.id)));
      for (let j = 0; j < part.length; j++) {
        const d = snaps[j].exists ? snaps[j].data() : null;
        const busySkip = d?.status === 'skip' && /high demand|UNAVAILABLE/i.test(d?.error || ''); // 예전 규칙으로 잘못 건너뛴 것
        const redo = d && d.pv !== PV && d.status !== 'skip'; // 예전 방식으로 본 영상 → 처음부터 다시
        const restory = d && !redo && needStory(d); // 스토리 정리만 다시 (영상은 안 봄)
        if (restory) { item = part[j]; cur = { ...d, status: 'finishing' }; break; }
        if (!d || busySkip || redo || (d.status !== 'done' && d.status !== 'skip' && !(d.status === 'error' && (d.tries || 0) >= 3))) { item = part[j]; cur = redo ? null : d; break; }
      }
    }
    // 스크립트는 따로 2분씩 받아 적음: 다 봤을 때 + 평소에도 두 번에 한 번 (본 영상마다 스크립트가 생기게)
    const scriptTurn = Boolean(item) && calls % 2 === 1 && !((modelCool[SCRIPT_MODEL] || 0) > Date.now());
    if (!item || scriptTurn) {
      const doneIds = queue.filter((q) => !q.comp && q.live !== 'live' && q.live !== 'upcoming' && (!finSet.size || finSet.has(q.id)));
      for (let i = 0; i < doneIds.length; i += 30) {
        const part = doneIds.slice(i, i + 30);
        const snaps = await db.getAll(...part.map((q) => db.collection('ai_script').doc(q.id)));
        for (let j = 0; j < part.length; j++) {
          const q = part[j];
          const segs = Object.values((snaps[j].exists ? snaps[j].data()?.segs : null) || {}) as any[];
          const dur = Number(q.duration || 0);
          const whole = q.kind === 'short' || !dur;
          // 아직 안 채운 첫 구간
          let from = 0;
          // 채팅창 글을 후원으로 잘못 받아 적은 예전 구간(후원 줄이 너무 많음)은 다시
          const sorted = segs.filter((g) => !badScriptSeg(g, q.kind)).sort((a, b) => a.from - b.from);
          for (const g of sorted) { if (g.from <= from + 5) from = Math.max(from, g.to); }
          if (whole ? sorted.length : from >= dur - 5) continue;
          if (snaps[j].exists && snaps[j].data()?.noSpeech) continue;
          let to = whole ? dur : Math.min(dur, from + SCRIPT_CHUNK);
          pickedId = '';
          try {
            let r = await transcribeSegment(q, from, to);
            // 시간이 앞쪽에만 몰렸으면 절반 길이로 한 번 더 (그것만 저장)
            if (r.squeezed && !whole && to - from > 60) { to = from + 60; r = await transcribeSegment(q, from, to); }
            await saveScript(db, q.id, from, to, r.lines);
            // 끝까지 다 받아 적었으면: 요약을 스크립트 바탕으로 다시 정리하게 표시
            if (whole || to >= dur - 5) { try { await col.doc(q.id).set({ scriptDone: true }, { merge: true }); await indexAiDoc(db, q.id); await fixLivesFromEdits(db, q.id); } catch { /* 다음에 */ } }
            await release({ usedSec: usedSec + Math.max(60, to - from), calls: calls + 1, lastError: '', idle: true, model: r.model });
            return { script: q.id, from, to, lines: r.lines.length, model: r.model };
          } catch (e: any) {
            const msg = String(e?.message || e).slice(0, 1500);
            if ((isRate(msg) || isBusy(msg)) && !(isRate(msg) && await videoOnlyQuota())) {
              const waits = MODELS.map((m) => modelCool[m] || 0);
              const cool = waits.every((w) => w > Date.now()) ? Math.min(...waits) : Date.now() + 5 * 60000;
              await release({ coolUntil: cool, lastError: msg, calls: calls + 1 });
              return { error: msg, cool: new Date(cool).toISOString() };
            }
            // 안 되는 영상은 빈 구간으로 채워 넘어감
            await saveScript(db, q.id, from, to, []);
            if (whole || to >= dur - 5) { try { await col.doc(q.id).set({ scriptDone: true }, { merge: true }); await indexAiDoc(db, q.id); await fixLivesFromEdits(db, q.id); } catch { /* 다음에 */ } }
            await release({ lastError: msg, calls: calls + 1 });
            return { script: q.id, error: msg };
          }
        }
      }
      if (!item) { await release({ lastError: '', idle: true }); return { done: true, message: '모든 영상을 분석했어요' }; }
    }
    pickedId = item.id;

    const ref = col.doc(item.id);
    // 몰아보기: 장면 하나하나는 원본 방송 분석을 모아서 보여 주므로, 여기서는 가볍게 한 번만
    //  → 오프닝(앞 10분)을 보고 무슨 주제·구성의 몰아보기인지 (설명란의 목차도 참고)
    if (item.comp) {
      let desc = '';
      try { desc = String((await yt(`videos?part=snippet&id=${item.id}`))?.items?.[0]?.snippet?.description || '').replace(/https?:\/\/\S+/g, ' ').slice(0, 2500); } catch { /* */ }
      try {
        const ov = await compOverview(item, desc);
        await ref.set({ id: item.id, title: item.title, kind: item.kind || 'video', comp: true, overview: ov.overview, topics: ov.topics, summary: ov.overview.theme, games: ov.games, keywords: ov.keywords, kw: buildKw({ summary: ov.overview.theme, keywords: ov.keywords, games: ov.games }), status: 'done', pv: PV, sv: SV, model: ov.model, doneAt: new Date().toISOString() }, { merge: true });
        await release({ calls: calls + 1, lastError: '', lastId: item.id, model: ov.model, idle: false, doneCount: Number(st.doneCount || 0) + 1 });
        return { id: item.id, title: item.title, comp: true, model: ov.model };
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 1500);
        if ((isRate(msg) || isBusy(msg)) && !(isRate(msg) && await videoOnlyQuota())) {
          const waits = MODELS.map((m) => modelCool[m] || 0);
          const cool = waits.every((w) => w > Date.now()) ? Math.min(...waits) : Date.now() + 5 * 60000;
          await release({ coolUntil: cool, lastError: msg, calls: calls + 1 });
          return { error: msg, cool: new Date(cool).toISOString() };
        }
        const tries = Number(cur?.tries || 0) + 1;
        await ref.set({ id: item.id, title: item.title, comp: true, status: tries >= 3 ? 'error' : 'partial', tries, error: msg, pv: PV }, { merge: true });
        await release({ lastError: msg });
        return { id: item.id, error: msg };
      }
    }
    const dur = Number(item.duration || 0);
    const segSec = Number(cur?.segSec || (item.kind === 'live' ? 5 * 60 : SEG_SEC)); // 생방송은 처음부터 5분씩
    const whole = item.kind === 'short' || !dur;
    // 여기까지 봤음 (예전 문서는 seg × segSec)
    const pos = Number(cur?.pos ?? Number(cur?.seg || 0) * segSec);
    const remaining = whole ? !(cur?.parts?.length) : pos < dur;

    // 1) 구간 분석
    if (remaining) {
      const start = whole ? 0 : pos;
      const end = whole ? dur : Math.min(dur, start + segSec);
      const lenSec = Math.max(1, (end || 60) - start);
      if (usedSec + lenSec > DAILY_SEC + 600) { await release(); return { skipped: '오늘 남은 한도로는 다음 구간이 안 돼요' }; }
      let desc = cur?.desc;
      if (desc === undefined) {
        try { desc = String((await yt(`videos?part=snippet&id=${item.id}`))?.items?.[0]?.snippet?.description || '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800); } catch { desc = ''; }
      }
      let r;
      try {
        r = await analyzeSegment(item, start, end, desc);
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 1500);
        if ((isRate(msg) || isBusy(msg)) && !(isRate(msg) && await videoOnlyQuota())) {
          // 쓸 수 있는 모델이 다 쉬는 중이면 가장 먼저 풀리는 때까지 쉼
          const waits = MODELS.map((m) => modelCool[m] || 0);
          const cool = waits.every((w) => w > Date.now()) ? Math.min(...waits) : Date.now() + 5 * 60000;
          await release({ coolUntil: cool, lastError: msg, calls: calls + 1 });
          return { error: msg, cool: new Date(cool).toISOString() };
        }
        if (isBusy(msg) && !isTimeout(msg)) {
          // 모델이 붐빔: 이 영상 실패로 치지 않고 5분 쉬기
          await release({ coolUntil: Date.now() + 5 * 60000, lastError: msg, calls: calls + 1 });
          return { error: msg, busy: true };
        }
        const vq = lastVideoQuota; lastVideoQuota = false;
        const timeout = isTimeout(msg) || vq; // 이 구간만 막힘 → 시간 초과처럼 더 잘게 나누다가 그래도 안 되면 그 구간을 건너뜀
        const tries = Number(cur?.tries || 0) + 1;
        const base = { id: item.id, title: item.title, kind: item.kind, publishedAt: item.publishedAt, duration: dur, desc, error: msg, updatedAt: new Date().toISOString() };
        if (timeout && !whole) {
          // 오래 걸림: 본 데까지는 그대로 두고, 다음부터 더 잘게. 가장 작은 구간도 두 번 넘으면 그 구간은 건너뜀
          const smaller = segSec > MIN_SEG_SEC;
          const skipChunk = !smaller && tries >= 2;
          await ref.set({ ...base, pos: skipChunk ? end : pos, segSec: smaller ? Math.max(MIN_SEG_SEC, Math.floor(segSec / 2)) : segSec, tries: skipChunk || smaller ? 0 : tries, status: 'partial', ...(skipChunk ? { skipped: [...(cur?.skipped || []), [start, end]].slice(-50) } : {}) }, { merge: true });
        } else {
          await ref.set({ ...base, tries, status: /Video unavailable|private video|INVALID_ARGUMENT|PERMISSION_DENIED|not supported/i.test(msg) && tries >= 2 ? 'skip' : 'error' }, { merge: true });
        }
        await release({ lastError: msg, calls: calls + 1 });
        return { error: msg, id: item.id };
      }
      const scenes = [...(cur?.scenes || []), ...r.scenes].sort((a: Scene, b: Scene) => a.t - b.t).slice(0, 1200);
      const games = [...(cur?.games || [])];
      [...(item.games || []).map((n) => ({ name: n, ko: n })), ...r.games].forEach((g: any) => { if (!games.some((x: any) => slug(x.name) === slug(g.name) || slug(x.ko || '') === slug(g.name))) games.push(g); });
      const next = {
        id: item.id, title: item.title, kind: item.kind, publishedAt: item.publishedAt, duration: dur, desc,
        segSec, pos: whole ? dur : end, seg: (cur?.parts?.length || 0) + 1, segTotal: (cur?.parts?.length || 0) + 1 + (whole ? 0 : Math.ceil(Math.max(0, dur - end) / segSec)),
        parts: [...(cur?.parts || []), { from: start, to: end, summary: r.summary, ...(r.nogari ? { nogari: r.nogari } : {}), ...(r.opanmu ? { opanmu: r.opanmu } : {}) }].slice(0, 200),
        scenes, games,
        keywords: [...new Set([...(cur?.keywords || []), ...r.keywords])].slice(0, 60),
        mood: [...new Set([...(cur?.mood || []), ...r.mood])].slice(0, 8),
        status: whole || end >= dur ? 'finishing' : 'partial', model: r.model, pv: PV, tries: 0, error: '', updatedAt: new Date().toISOString(),
      };
      await ref.set({ ...next, kw: buildKw(next) }, { merge: true });
      await release({ usedSec: usedSec + lenSec, calls: calls + 1, lastError: '', lastId: item.id, model: r.model, idle: false });
      return { id: item.id, title: item.title, seg: next.seg, segTotal: next.segTotal, scenes: r.scenes.length, model: r.model };
    }

    // 2) 마무리: 게임 알아보기 (한 번에 하나) → 전체 요약
    const games = [...(cur?.games || [])];
    const unknown = games.find((g: any) => !g.about && !g.checked);
    if (unknown) {
      try {
        const link = item.gameLinks?.[unknown.name] || Object.entries(item.gameLinks || {}).find(([k]) => normWord(k) === normWord(unknown.name) || normWord(k) === normWord(unknown.ko || ''))?.[1] || '';
        const info = await analyzeGame(db, unknown.name, unknown.ko || '', link);
        Object.assign(unknown, { genre: info.genre, about: info.about, tags: info.tags, aliases: info.aliases, horror: info.horror, checked: true });
      } catch (e: any) {
        unknown.checked = true;
        // 한도면 이 게임은 '확인함'으로 저장하고 넘어감 (예전에는 저장 전에 돌아가서 같은 게임에서 계속 멈춤)
        if (isRate(String(e?.message || e))) { await ref.set({ games, updatedAt: new Date().toISOString() }, { merge: true }); await release({ coolUntil: Date.now() + 10 * 60000, lastError: String(e?.message || e).slice(0, 300), calls: calls + 1 }); return { error: 'rate', game: unknown.name }; }
      }
      const next = { ...cur, games };
      await ref.set({ games, kw: buildKw(next), updatedAt: new Date().toISOString() }, { merge: true });
      await release({ calls: calls + 1 });
      return { id: item.id, game: unknown.name };
    }
    // 전체를 보고 스토리·사건 단위로 묶기 (장면 하나하나가 아니라) + 게임별 줄거리·하이라이트
    let scriptLines: any[] = [];
    try { scriptLines = (await aiScript(db, item.id)).lines || []; } catch { /* 없으면 예전처럼 */ }
    // 쇼츠는 요약(줄거리)을 만들지 않음 — 장면·대사만 남겨 연동 검사에 씀 (AI 무료 한도 절약)
    const isShort = (item.kind || cur?.kind) === 'short';
    const story = isShort ? null : await buildStory(item.title, cur, games, scriptLines).catch((e: any) => {
      if (isRate(String(e?.message || e))) throw e;
      return null;
    });
    const summary = story?.summary || cur?.parts?.[0]?.summary || '';
    const fin = { ...cur, games, summary, chapters: story?.chapters || [], gameStories: story?.gameStories || [], nogari: story?.nogari || '', opanmu: story?.opanmu || '' };
    // 상황 기록(검색용)은 따로 저장: 화면에는 안 불러오고 검색할 때만 읽음 · 낱말은 찾기 목록(kw)에
    const moments = story?.moments || [];
    if (moments.length) { try { await db.collection('ai_moments').doc(item.id).set({ id: item.id, moments, at: new Date().toISOString() }); } catch { /* */ } }
    const kw = buildKw({ ...fin, nogari: `${fin.nogari} ${moments.map((m: any) => m.d).join(' ')}` }).slice(0, 1500);
    await ref.set({ summary: isShort ? '' : summary, chapters: fin.chapters, gameStories: fin.gameStories, nogari: fin.nogari, opanmu: fin.opanmu, sv: isShort ? SV : story ? (story.fromScript ? SV : 2) : 0, storyTries: story || isShort ? 0 : Number(cur?.storyTries || 0) + 1, ...(isShort ? { noStory: true } : {}), kw, hasMoments: moments.length > 0, status: 'done', doneAt: new Date().toISOString() }, { merge: true });
    if ((st.priority || []).includes(item.id)) await stRef.set({ priority: (st.priority || []).filter((x: string) => x !== item!.id) }, { merge: true });
    // 연동 점검: 이 영상과 연결된 생방송·영상·쇼츠 중 AI 분석이 끝난 것과 내용이 맞는지 (글로만 비교, 한도에 걸리면 다음에)
    try { await checkLinks(db, item.id, { ...fin, title: item.title }); } catch (e: any) { if (isRate(String(e?.message || e))) { /* 다음 분석 때 */ } }
    // 연동 추천: 대사가 겹치는 생방송 ↔ 편집 영상·쇼츠를 찾아 연동 탭 '연결 확인'에 (AI 호출 없음)
    try { const { suggestLinks } = await import('./_linkSuggest.js'); await suggestLinks(db, item.id, { ...fin, title: item.title, kind: item.kind || fin.kind, publishedAt: item.publishedAt || fin.publishedAt }); await db.collection('ai_video').doc(item.id).set({ suggestAt: new Date().toISOString() }, { merge: true }); } catch { /* 다음에 */ }
    await release({ calls: calls + 1, doneCount: Number(st.doneCount || 0) + 1 });
    // 웃음참기: 이 영상(또는 이 생방송이 들어 있는 웃음참기)의 어디가 어느 생방송인지 다시 맞춤 (한도면 다음에)
    try { for (const cid of await laughCompsWith(db, item.id)) await compRanges(db, cid); } catch { /* 다음에 */ }
    return { id: item.id, title: item.title, finished: true };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 1500);
    // 유튜브 하루 한도: 다음 초기화(한국 오후 4~5시)까지 쉼 — 계속 다시 부르면 사이트의 다른 기능이 쓸 한도까지 써 버림
    if (/exceeded your.*quota|quotaExceeded|dailyLimitExceeded/i.test(msg)) { await release({ lastError: msg, coolUntil: nextQuotaReset() }); return { error: msg, cool: 'youtube' }; }
    // 그 밖의 오류도 바로 다시 하지 않고 15분 쉼 (목록 저장 실패 등이 계속 되풀이되며 한도를 쓰지 않게)
    await release({ lastError: msg, coolUntil: Date.now() + 15 * 60000 });
    return { error: msg };
  }
}


/**
 * 연동 점검 (AI 분석이 끝난 영상끼리 글로 비교)
 * - 편집 영상 ↔ 연결된 생방송: 영상 내용이 그 생방송의 어느 부분인지
 * - 쇼츠 ↔ 같은 기록의 영상·생방송: 쇼츠 장면이 어디서 나왔는지
 * 결과는 ai_video/{id}.linkCheck, 안 맞아 보이는 것은 youtube_cache/link_check 목록에 (관리자가 확인)
 */
const aiBrief = (d: any) => {
  const ch = (d?.chapters || []).map((c: any) => `[${fmt(Number(c.from) || 0)}~${fmt(Number(c.to) || 0)}] ${c.title}: ${c.summary}${c.game ? ` (${c.game})` : ''}`).join('\n');
  const parts = ch || (d?.parts || []).map((p: any) => `[${fmt(Number(p.from) || 0)}~${fmt(Number(p.to) || 0)}] ${p.summary}`).join('\n');
  const games = (d?.games || []).map((g: any) => g?.ko || g?.name).filter(Boolean).join(', ');
  return `제목: ${d?.title || ''}\n게임: ${games || '-'}\n요약: ${d?.summary || ''}\n${parts}`.slice(0, 9000);
};

const gameKey = (s: string) => normWord(String(s || '').replace(/\(.*?\)|\[.*?\]/g, ' ')).replace(/\s+/g, '');
const sameGame = (a: string, b: string) => { const x = gameKey(a); const y = gameKey(b); return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))); };
async function steamName(db: any, appId: string): Promise<string> {
  const ref = db.collection('youtube_cache').doc('steam_names');
  const cache = (await ref.get()).data() || {};
  if (typeof cache[appId] === 'string') return cache[appId];
  let name = '';
  try { const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&filters=basic`, { signal: AbortSignal.timeout(8000) }); const j: any = await r.json(); name = String(j?.[appId]?.data?.name || ''); } catch { /* */ }
  await ref.set({ [appId]: name }, { merge: true });
  return name;
}
async function checkGames(db: any, id: string, me: any, mine: any[]) {
  if (!mine.length) return;
  const ai = (me?.games || []).flatMap((g: any) => [g?.name, g?.ko, ...(g?.aliases || [])]).filter(Boolean) as string[];
  const out: any[] = [];
  for (const l of mine) {
    const listed = (l.games || []).filter((g: any) => g?.name);
    const notSeen = ai.length ? listed.filter((g: any) => !ai.some((a) => sameGame(a, g.name))).map((g: any) => g.name) : [];
    const notListed = (me?.games || []).filter((g: any) => g?.name && !listed.some((x: any) => sameGame(x.name, g.name) || sameGame(x.name, g.ko || ''))).map((g: any) => g.ko || g.name);
    const badLinks: any[] = [];
    for (const g of listed.slice(0, 8)) {
      const app = String(g.link || '').match(/store\.steampowered\.com\/app\/(\d+)/)?.[1];
      if (!app) continue;
      const sn = await steamName(db, app);
      if (sn && !sameGame(sn, g.name)) badLinks.push({ game: g.name, link: g.link, steam: sn });
    }
    if (notSeen.length || notListed.length || badLinks.length) out.push({ logId: l.id, date: l.date, notSeen, notListed, badLinks });
  }
  const { FieldValue } = await import('firebase-admin/firestore');
  await db.collection('ai_video').doc(id).set({ gameCheck: { at: new Date().toISOString(), out } }, { merge: true });
  await db.collection('youtube_cache').doc('link_check').set({ gameBad: out.length ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id) }, { merge: true });
  // 카테고리: 바로 고치지 않고, 같은 카테고리에 묶인 다른 게임들과 비슷한지 AI가 판단해 '제안'으로만 쌓음 (한 번에 2개씩 차례로)
  if (allowCategory) await checkCategories(db, me, mine);
}

/**
 * 게임 카테고리 점검 (제안만, 관리자가 적용)
 * - 이 게임 ↔ 지금 카테고리에 묶인 게임들, 다른 카테고리(자주 쓰는 것)에 묶인 게임들을 보여 주고 어디가 더 비슷한지
 * - 지금 카테고리보다 20점 넘게 더 맞는 곳이 있을 때만 제안 · 게임마다 한 번만 확인
 */
let allowCategory = true;
async function checkCategories(db: any, me: any, mine: any[]) {
  const ref = db.collection('youtube_cache').doc('category_suggest');
  const done = ((await ref.get()).data() || {}) as Record<string, any>;
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const all = (await loadSiteLogs(db, { maxAgeMs: 3600000 })).logs as any[];
  const byCat = new Map<string, Set<string>>();
  all.forEach((l) => (l.games || []).forEach((g: any) => { if (g?.name && g?.category) (byCat.get(g.category) || byCat.set(g.category, new Set()).get(g.category)!).add(g.name); }));
  const common = [...byCat.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 14);
  const key = (n: string) => gameKey(n).slice(0, 60) || n.slice(0, 60);
  const todo = mine.flatMap((l) => (l.games || []).filter((g: any) => g?.name && g?.category && !done[key(g.name)])).slice(0, 2);
  for (const g of todo) {
    const seen = (me?.chapters || []).filter((c: any) => sameGame(c?.game || '', g.name)).map((c: any) => `${c.title}: ${c.summary}`).join(' / ').slice(0, 1500);
    const peers = [...(byCat.get(g.category) || [])].filter((n) => n !== g.name).slice(0, 10);
    const cands = common.filter(([c]) => c !== g.category).map(([c, ns]) => `- ${c}: ${[...ns].slice(0, 6).join(', ')}`).join('\n');
    const prompt = `스트리머 방송 기록의 게임 카테고리를 점검해. 카테고리는 장르를 쉼표로 묶은 것이고, 같은 카테고리에 묶인 게임끼리 비슷해야 해.
게임: ${g.name}
방송에서 이 게임 장면(AI 정리): ${seen || '(없음)'}
지금 카테고리: ${g.category} — 같이 묶인 게임: ${peers.join(', ') || '(없음)'}
다른 카테고리와 묶인 게임:
${cands}
이 게임이 지금 카테고리의 게임들과 얼마나 비슷한지(0~100), 가장 잘 맞는 카테고리(위 목록 중 하나 또는 지금 것)와 그 점수.
JSON 으로만: {"current":0~100,"best":"카테고리","bestScore":0~100,"reason":"한 줄"}`;
    const { text } = await gen([{ text: prompt }], true, 30000, TEXT_MODELS);
    const r = parseJson(text) || {};
    const cur = Number(r.current) || 0; const bs = Number(r.bestScore) || 0;
    const best = typeof r.best === 'string' && byCat.has(r.best) ? r.best : g.category;
    const suggest = best !== g.category && bs - cur >= 20;
    await ref.set({ [key(g.name)]: { name: g.name, current: g.category, currentScore: cur, best, bestScore: bs, suggest, reason: String(r.reason || '').slice(0, 160), at: new Date().toISOString() } }, { merge: true });
  }
}
/** 카테고리 제안 처리 표시 (적용함·무시) */
export async function markCategory(db: any, key: string, mark: 'applied' | 'ignored') {
  await db.collection('youtube_cache').doc('category_suggest').set({ [key]: { [mark]: true } }, { merge: true });
  return { ok: true };
}
/** 이미 분석이 끝난 생방송도 게임 점검 (AI 호출 없음, 한 번에 25개씩) */
export async function gameCheckBatch(db: any, from = 0) {
  const ix = (await db.collection('youtube_cache').doc('ai_ids').get()).data() || {};
  const ids: string[] = ix.done || [];
  const part = ids.slice(from, from + 25);
  if (!part.length) return { done: true, total: ids.length, next: from };
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db, { maxAgeMs: 3600000 })).logs as any[];
  const snaps = await db.getAll(...part.map((i) => db.collection('ai_video').doc(i)));
  let checked = 0;
  for (let i = 0; i < part.length; i++) {
    const d = snaps[i].exists ? snaps[i].data() : null;
    const mine = logs.filter((l) => (l.vods || []).some((v: any) => ytIdOf(v?.url) === part[i]));
    if (!d || !mine.length) continue;
    allowCategory = false;
    try { await checkGames(db, part[i], d, mine); } finally { allowCategory = true; }
    checked++;
  }
  return { done: from + 25 >= ids.length, total: ids.length, next: from + 25, checked };
}
async function checkLinks(db: any, id: string, me: any) {
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db, { maxAgeMs: 3600000 })).logs as any[];
  const has = (l: any, k: string) => (l?.[k] || []).some((x: any) => ytIdOf(x?.url) === id);
  // 게임 점검: 이 생방송 기록에 적힌 게임 ↔ AI가 본 게임, 그리고 게임 링크(스팀)가 그 게임이 맞는지
  try { await checkGames(db, id, me, logs.filter((l) => has(l, 'vods'))); } catch (e: any) { if (isRate(String(e?.message || e))) throw e; }
  const pairs: { other: string; rel: string }[] = [];
  for (const l of logs) {
    if (has(l, 'edited')) (l.vods || []).forEach((v: any) => { const o = ytIdOf(v?.url); if (o) pairs.push({ other: o, rel: '영상→생방송' }); });
    if (has(l, 'vods')) (l.edited || []).forEach((v: any) => { if (v?.isCompilation || v?.compilationId) return; const o = ytIdOf(v?.url); if (o) pairs.push({ other: o, rel: '생방송→영상' }); });
    if (has(l, 'shorts')) [...(l.edited || []), ...(l.vods || [])].forEach((v: any) => { if (v?.isCompilation || v?.compilationId) return; const o = ytIdOf(v?.url); if (o) pairs.push({ other: o, rel: '쇼츠→영상·생방송' }); });
  }
  const uniq = [...new Map(pairs.filter((p) => p.other !== id).map((p) => [p.other, p])).values()].slice(0, 6);
  if (!uniq.length) return;
  const snaps = await db.getAll(...uniq.map((p) => db.collection('ai_video').doc(p.other)));
  const results: any[] = [];
  const bad: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const o = snaps[i].exists ? snaps[i].data() : null;
    if (!o || o.status !== 'done') continue;
    const [a, b] = uniq[i].rel === '생방송→영상' ? [o, me] : [me, o];
    const prompt = `스트리머 우주하마 채널의 두 영상을 AI가 보고 정리한 기록이야. A가 B에서 나온 것(편집본·쇼츠가 그 생방송/영상의 일부)이 맞는지 판단해 줘.
A (${uniq[i].rel.split('→')[0]}):
${aiBrief(a)}

B (${uniq[i].rel.split('→')[1]}):
${aiBrief(b)}

규칙: 게임·사건·대사가 겹치면 맞음. 같은 게임이어도 다른 날 플레이처럼 내용이 다르면 아님. 모르면 unsure.
JSON 으로만: {"verdict":"match|mismatch|unsure","bFrom":B에서 A 내용이 나오는 시작 초(모르면 null),"bTo":끝 초(모르면 null),"reason":"한 줄"}`;
    const { text } = await gen([{ text: prompt }], true, 30000, TEXT_MODELS);
    const r = parseJson(text);
    const verdict = ['match', 'mismatch', 'unsure'].includes(r?.verdict) ? r.verdict : 'unsure';
    results.push({ other: uniq[i].other, rel: uniq[i].rel, verdict, from: Number.isFinite(r?.bFrom) ? r.bFrom : null, to: Number.isFinite(r?.bTo) ? r.bTo : null, reason: String(r?.reason || '').slice(0, 200) });
    if (verdict === 'mismatch') bad.push(`${id}|${uniq[i].other}`);
  }
  if (!results.length) return;
  const { FieldValue } = await import('firebase-admin/firestore');
  await db.collection('ai_video').doc(id).set({ linkCheck: { at: new Date().toISOString(), results } }, { merge: true });
  await db.collection('youtube_cache').doc('link_check').set({
    bad: bad.length ? FieldValue.arrayUnion(...bad) : FieldValue.arrayUnion(),
    checked: FieldValue.arrayUnion(id), updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/** 진행 상황 (관리자) */
export async function aiVideoStatus(db: any) {
  const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
  const q = await readQueueDoc(db);
  let done = 0;
  let partial = 0;
  try {
    done = (await db.collection('ai_video').where('status', '==', 'done').count().get()).data().count;
    partial = (await db.collection('ai_video').where('status', 'in', ['partial', 'finishing']).count().get()).data().count;
  } catch { /* count 미지원 */ }
  const kinds: Record<string, number> = {};
  (q?.items || []).forEach((x: QItem) => { const k = x.comp ? 'comp' : x.kind || 'video'; kinds[k] = (kinds[k] || 0) + 1; });
  let linkBad: { a: string; b: string; ta: string; tb: string; reason: string }[] = [];
  let linkChecked = 0;
  try {
    const lc = (await db.collection('youtube_cache').doc('link_check').get()).data();
    linkChecked = (lc?.checked || []).length;
    const pairs = (lc?.bad || []).slice(-30).map((x: string) => x.split('|'));
    const ids = [...new Set(pairs.flat())] as string[];
    const docs = ids.length ? await db.getAll(...ids.map((i) => db.collection('ai_video').doc(i))) : [];
    const by = new Map(docs.map((d: any) => [d.id, d.exists ? d.data() : null]));
    linkBad = pairs.map(([a, b]: string[]) => { const da: any = by.get(a); const r = (da?.linkCheck?.results || []).find((x: any) => x.other === b); return { a, b, ta: da?.title || a, tb: (by.get(b) as any)?.title || b, reason: r?.reason || '' }; });
  } catch { /* */ }
  let gameBad: any[] = [];
  try {
    const lc = (await db.collection('youtube_cache').doc('link_check').get()).data();
    const ids = (lc?.gameBad || []).slice(-30) as string[];
    const docs = ids.length ? await db.getAll(...ids.map((i) => db.collection('ai_video').doc(i))) : [];
    gameBad = docs.flatMap((d: any) => { const x = d.exists ? d.data() : null; return (x?.gameCheck?.out || []).map((o: any) => ({ ...o, title: x?.title || d.id })); });
  } catch { /* */ }
  let categorySuggest: any[] = []; let categoryChecked = 0;
  try {
    const cs = (await db.collection('youtube_cache').doc('category_suggest').get()).data() || {};
    const vals = Object.entries(cs).map(([k, v]: [string, any]) => ({ key: k, ...v }));
    categoryChecked = vals.length;
    categorySuggest = vals.filter((v: any) => v.suggest && !v.applied && !v.ignored).sort((a: any, b: any) => (b.bestScore - b.currentScore) - (a.bestScore - a.currentScore)).slice(0, 50);
  } catch { /* */ }
  return { ...st, linkBad, linkChecked, gameBad, categorySuggest, categoryChecked, lockUntil: undefined, total: (q?.items || []).filter((x: QItem) => !x.comp).length || q?.count || 0, channelCount: q?.channelCount || 0, fetchedAt: q?.fetchedAt, kinds, done, partial, dailySec: DAILY_SEC, models: MODELS };
}

/** '애매'한 장면 (확실하지 않다고 표시했거나 말투가 추측) */
const HEDGE = /(인가|인지|것 같|듯|처럼 보|착각|의심|소리만|그림자|비슷|아닌가|헷갈)/;

/** 검색어를 장면 검색용 말로 넓히기 (예: 갑툭튀 → 점프스케어·깜짝). 한 번 넓힌 검색어는 저장해 두고 다시 AI 를 부르지 않음 */
async function expandQuery(db: any, q: string, tokens: string[]): Promise<string[]> {
  const key = normWord(q).slice(0, 60);
  if (!key) return [];
  const ref = db.collection('ai_query').doc(key);
  // 한글·영문·숫자만 (AI 가 가끔 다른 나라 글자를 섞음)
  const clean = (ws: any[]) => [...new Set((ws || []).map((w: any) => normWord(String(w))).filter((w: string) => w.length >= 2 && /^[0-9a-z가-힣]+$/.test(w) && !tokens.includes(w)))].slice(0, 10) as string[];
  const cur = (await ref.get()).data();
  if (cur?.words && cur.v === 2) return clean(cur.words);
  // 하루 AI 확장 횟수 제한 (무료 한도 보호)
  const day = kstDay();
  const cnt = db.collection('youtube_cache').doc('ai_query_count');
  const c = (await cnt.get()).data() || {};
  const used = c.day === day ? Number(c.n || 0) : 0;
  if (used >= Number(process.env.AI_QUERY_DAILY || 300) || !aiKey()) return [];
  await cnt.set({ day, n: used + 1 }, { merge: true });
  try {
    const { text } = await gen([{ text: `팬 사이트에서 스트리머 "우주하마"(좜마·우좜마·우잠마·우자마·하마·좜마형·하마형 등으로도 부름)의 게임 방송 영상 장면을 찾는 검색어야: "${q}"
이 검색어로 찾고 싶은 장면을 AI 가 영상 장면마다 붙여 둔 한국어 키워드(예: 점프스케어, 귀신, 비명, 웃음, 노래, 보스전, 엔딩, 사망, 깜짝 놀람)로 바꿔 줘.
줄임말·신조어·은어(예: 갑툭튀→점프스케어, 깜놀→깜짝 놀람, 겜→게임)는 풀어서. 검색어에 없는 뜻은 넣지 마. 3~10개.
한국어(또는 영어 게임 용어)만, 다른 나라 글자는 쓰지 마.
JSON 으로만: {"words":["..."]}` }], true, 12000, ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
    const words = clean(parseJson(text).words || []);
    await ref.set({ q: q.slice(0, 80), words, at: new Date().toISOString(), v: 2 });
    return words;
  } catch {
    return [];
  }
}

/** AI 검색: 키워드로 1단계 거르고 장면 단위로 점수 (부족하면 검색어를 AI 로 한 번 넓힘 — 저장해 두고 재사용) */
export async function aiSearch(db: any, q: string, sceneLimit = 3) {
  const tokens = queryTokens(q);
  if (!tokens.length) return { tokens, results: [] };
  const run = async (toks: string[], extra: string[]) => {
    const all = [...toks, ...extra].slice(0, 30);
    const snap = await db.collection('ai_video').where('kw', 'array-contains-any', all).limit(40).get();
    const has = (text: string, list: string[]) => { const t = normWord(text); return list.filter((k) => t.includes(k)); };
    return snap.docs.map((d: any) => {
      const v = d.data();
      let score = 0;
      score += has(v.title || '', toks).length * 2 + has(v.title || '', extra).length;
      score += toks.filter((t) => (v.kw || []).includes(t)).length + extra.filter((t) => (v.kw || []).includes(t)).length * 0.6;
      // 스토리·사건 묶음과 게임 하이라이트도 장면처럼 찾음 ('소녀가 실종되는 스토리' 같은 말)
      const pool: Scene[] = [
        ...(v.scenes || []),
        ...(v.chapters || []).map((c: any) => ({ t: c.from, d: `${c.title} — ${c.summary}`, k: c.game ? [c.game] : [] })),
        ...(v.gameStories || []).flatMap((g: any) => (g.highlights || []).map((h: any) => ({ t: h.t, d: h.d, k: [g.name] }))),
      ];
      const scenes = pool.map((s: Scene) => {
        const txt = [s.d, s.q || '', ...(s.w || [])].join(' ');
        const main = new Set<string>([...has(txt, toks), ...(s.k || []).flatMap((k) => has(k, toks))]);
        const ex = new Set<string>([...has(txt, extra), ...(s.k || []).flatMap((k) => has(k, extra))]);
        const vague = s.u === 1 || HEDGE.test(s.d) || (s.k || []).some((k) => /의심/.test(k));
        const n = (main.size + ex.size * 0.6) * (vague ? 0.35 : 1);
        return { t: s.t, d: s.q ? `${s.d} “${s.q}”` : s.d, n, vague };
      }).filter((s: any) => s.n > 0).sort((a: any, b: any) => b.n - a.n || a.t - b.t);
      if (scenes.length) score += scenes[0].n * 3 + Math.min(3, scenes.filter((x: any) => !x.vague).length) * 0.5;
      const gameText = (v.games || []).map((g: any) => [g.name, g.ko, ...(g.tags || []), ...(g.aliases || []), g.genre, g.about].join(' ')).join(' ') + ' ' + (v.gameStories || []).map((g: any) => `${g.story} ${g.result}`).join(' ');
      if (has(gameText, toks).length) score += 1.5; else if (has(gameText, extra).length) score += 0.8;
      return {
        id: v.id || d.id, title: v.title, kind: v.kind, publishedAt: v.publishedAt, duration: v.duration,
        summary: String(v.summary || v.parts?.[0]?.summary || '').slice(0, 220),
        // 확실한 장면 먼저, 애매한 건 뒤로
        scenes: [...scenes.filter((x: any) => !x.vague), ...scenes.filter((x: any) => x.vague)].slice(0, sceneLimit).map((x: any) => ({ t: x.t, d: x.d, ...(x.vague ? { vague: true } : {}) })),
        games: (v.games || []).map((g: any) => g.ko || g.name).slice(0, 3),
        partial: v.status !== 'done',
        hasSummary: v.status === 'done',
        score,
      };
    }).filter((r: any) => r.score >= 2 && !r.partial) // 다 본 영상만 (보는 중인 영상은 끝난 뒤에)
      .sort((a: any, b: any) => b.score - a.score || (b.publishedAt || '').localeCompare(a.publishedAt || ''))
      .slice(0, 8);
  };
  let results = await run(tokens, []);
  let expanded: string[] = [];
  // 결과가 적으면(또는 줄임말 같은 검색어면) 한 번 넓혀서 다시
  if (results.length < 3) {
    expanded = await expandQuery(db, q, tokens);
    if (expanded.length) {
      const more = await run(tokens, expanded);
      const seen = new Set(results.map((r: any) => r.id));
      results = [...results, ...more.filter((r: any) => !seen.has(r.id))].slice(0, 8);
    }
  }
  return { tokens, expanded, results };
}

/** ⋮ › AI 영상 요약: 저장된 분석 결과 (검색용 내부 칸은 빼고) */
/** 관리자: AI 요약 내용 직접 고치기 (요약·노가리·흐름·장면·게임 줄거리). 고친 때를 editedAt 에 남김 */
export async function editSummary(db: any, id: string, patch: any) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error('영상 번호가 이상해요');
  const ref = db.collection('ai_video').doc(id);
  const d = (await ref.get()).data();
  if (!d) throw new Error('요약이 없는 영상이에요');
  const str = (x: any, n: number) => String(x ?? '').replace(/\s+$/g, '').slice(0, n);
  const num = (x: any) => Math.max(0, Math.round(Number(x) || 0));
  const out: any = { editedAt: new Date().toISOString() };
  if (typeof patch?.summary === 'string') out.summary = str(patch.summary, 1500);
  if (typeof patch?.nogari === 'string') out.nogari = str(patch.nogari, 3000);
  if (Array.isArray(patch?.chapters)) out.chapters = patch.chapters.slice(0, 80).map((c: any) => ({ from: num(c.from), to: num(c.to), title: str(c.title, 120), summary: str(c.summary, 800), ...(c.game ? { game: str(c.game, 120) } : {}) }));
  if (Array.isArray(patch?.scenes)) {
    // 장면: 원래 장면(i 번째)의 검색용 정보(k·w)는 그대로 두고 시간·설명·한 말만 바꿈
    const old: Scene[] = d.scenes || [];
    out.scenes = patch.scenes.slice(0, 1500).filter((x: any) => String(x?.d || '').trim()).map((x: any) => {
      const o: any = { ...(Number.isInteger(x.i) && old[x.i] ? old[x.i] : { k: [] }), t: num(x.t), d: str(x.d, 300) };
      if (String(x.q || '').trim()) o.q = str(x.q, 200); else delete o.q;
      return o;
    });
  }
  if (Array.isArray(patch?.gameStories)) {
    const old: any[] = d.gameStories || [];
    out.gameStories = patch.gameStories.slice(0, 20).map((g: any, i: number) => ({ ...(old.find((o) => o.name === g.name) || old[i] || {}), name: str(g.name, 120), story: str(g.story, 2000), ...(g.result != null ? { result: str(g.result, 40) } : {}) }));
  }
  await ref.set(out, { merge: true });
  return { summary: '요약을 고쳤어요', ...(await aiVideoDetail(db, id)) };
}

export async function aiVideoDetail(db: any, id: string) {
  if (!/^[\w-]{11}$/.test(id)) return { found: false };
  const d = (await db.collection('ai_video').doc(id).get()).data();
  if (d?.comp) {
    // 몰아보기: 가볍게 본 오프닝·주제 + 들어 있는 방송들의 분석 모음
    const comp = (await compilationSources(db, id)) || { found: false, compilation: true, id, title: d.title, dates: [], games: [], sources: [], sourceCount: 0 };
    return { ...comp, found: comp.found || d.status === 'done', title: comp.title || d.title, overview: d.status === 'done' ? d.overview : null, topics: d.status === 'done' ? d.topics || [] : [] };
  }
  if (!d || !(d.parts?.length || d.summary)) {
    // 몰아보기: 따로 분석하지 않고, 들어 있는 방송(원본 영상)들의 분석을 모아서
    const comp = await compilationSources(db, id);
    if (comp) return comp;
    const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
    return { found: false, requested: (st.priority || []).includes(id) };
  }
  const games = await Promise.all((d.games || []).slice(0, 4).map(async (g: any) => {
    if (g.about) return g;
    try { const x = (await db.collection('ai_games').doc(slug(g.name)).get()).data(); return x ? { ...g, ...x } : g; } catch { return g; }
  }));
  if (d.status !== 'done') {
    // 아직 보는 중: 내용은 다 끝난 뒤에 (진행 상황만)
    return { found: true, pending: true, id, title: d.title, kind: d.kind, status: d.status, seg: d.seg, segTotal: d.segTotal, pos: d.pos, duration: d.duration };
  }
  const durD = Number(d.duration || 0) || Math.max(0, ...(d.parts || []).map((p: any) => Number(p.to) || 0));
  const fit = dropOutro({ summary: d.summary || '', ...fitTimes({ chapters: d.chapters || [], gameStories: d.gameStories || [], scenes: d.scenes || [] }, durD, d.scenes || []) });
  return {
    found: true, id, title: d.title, kind: d.kind, status: d.status, seg: d.seg, segTotal: d.segTotal, model: d.model,
    chapters: fit.chapters, gameStories: fit.gameStories, nogari: d.nogari || '', opanmu: d.opanmu || '',
    summary: fit.summary, parts: (d.parts || []).map((p: any) => ({ from: p.from, to: p.to, summary: p.summary })),
    scenes: (fit.scenes as Scene[]).map((s: Scene) => ({ t: s.t, d: s.d, ...(s.q ? { q: s.q } : {}), k: s.k, ...(s.u ? { vague: true } : {}) })),
    games: games.map((g: any) => ({ name: g.name, ko: g.ko, genre: g.genre, about: g.about, tags: g.tags, horror: g.horror })),
    keywords: d.keywords || [], mood: d.mood || [],
    ...(Array.isArray(d.ranges) && d.ranges.length ? { ranges: d.ranges } : {}),
  };
}

const ytIdOf = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';

/** 몰아보기 영상 → 들어 있는 방송들의 원본 영상(다시보기·편집본) 분석 모음 */
/** 몰아보기 → 들어 있는 방송·원본 영상 목록을 문서 하나에 모아 둠 (볼 때마다 기록 전체를 읽지 않게, 12시간마다 새로) */
async function compIndex(db: any): Promise<Record<string, { title: string; dates: string[]; games: string[]; ids: string[] }>> {
  const ref = db.collection('youtube_cache').doc('comp_index');
  let old: any = null;
  try {
    old = (await ref.get()).data();
    if (old?.map && Date.now() - Date.parse(old.at || '0') < 12 * 3600000) return old.map;
  } catch { /* 새로 */ }
  // 오래됐으면 한 요청만 새로 만들고 나머지는 지난 것을 그대로 (동시에 여러 명이 열어도 한 번만 읽게)
  if (old?.map) {
    const mine = await db.runTransaction(async (tx: any) => {
      const cur = (await tx.get(ref)).data() || {};
      if (cur.lockUntil && cur.lockUntil > Date.now()) return false;
      tx.set(ref, { lockUntil: Date.now() + 120000 }, { merge: true });
      return true;
    }).catch(() => false);
    if (!mine) return old.map;
  }
  const map: Record<string, { title: string; dates: string[]; games: string[]; ids: string[] }> = {};
  let comps: any[] = [];
  try { comps = (await db.collection('compilations').get()).docs.map((x: any) => x.data()); } catch { /* */ }
  // 사이트가 보여 주는 기록 (logs 컬렉션 전체 대신: 읽기가 기록 수 → 달 수)
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db)).logs;
  comps.forEach((c: any) => {
    const cid = ytIdOf(c.url);
    if (cid) map[cid] = { title: c.title || '', dates: (c.broadcasts || []).map((b: any) => b.date).filter(Boolean), games: (c.broadcasts || []).flatMap((b: any) => b.games || []).map((g: any) => (typeof g === 'string' ? g : g?.name)).filter(Boolean), ids: [] };
  });
  for (const l of logs) for (const e of l.edited || []) {
    if (!(e?.isCompilation || e?.compilationId)) continue;
    const cid = ytIdOf(e.url);
    if (!cid) continue;
    if (!map[cid]) map[cid] = { title: e.title || '', dates: [], games: [], ids: [] };
    if (!map[cid].dates.length) map[cid].dates = e.allBroadcastDates?.length ? e.allBroadcastDates : [l.date];
    if (!map[cid].title) map[cid].title = e.title || '';
  }
  Object.entries(map).forEach(([cid, m]) => {
    const ids: string[] = [];
    logs.filter((l: any) => m.dates.includes(l.date)).sort((a: any, b: any) => a.date.localeCompare(b.date)).forEach((l: any) => {
      [...(l.edited || []).filter((e: any) => !(e?.isCompilation || e?.compilationId)), ...(l.vods || [])].forEach((v: any) => {
        const vid = ytIdOf(typeof v === 'string' ? v : v?.url);
        if (vid && vid !== cid && !ids.includes(vid)) ids.push(vid);
      });
    });
    m.ids = ids.slice(0, 30);
  });
  try { await ref.set({ map, at: new Date().toISOString(), lockUntil: 0 }); } catch { /* 너무 크면 다음에 */ }
  return map;
}

/**
 * 웃음참기(여러 생방송을 모은 영상): 이 영상의 어느 시간이 어느 생방송에서 나온 건지
 * 이 영상의 분석(구간 정리·장면)과 생방송들의 요약을 글로만 맞춰 봄 (영상은 다시 안 봄, 호출 1번)
 * 생방송 분석이 하나 끝날 때마다 다시 맞춤 (다 본 생방송만)
 */
export const isLaughComp = (title: string) => /웃음\s*참기/.test(String(title || ''));
export async function compRanges(db: any, compId: string): Promise<any> {
  const m = (await compIndex(db))[compId];
  if (!m || !isLaughComp(m.title)) return null;
  const me = (await db.collection('ai_video').doc(compId).get()).data();
  if (!me || me.status !== 'done' || !(me.parts || []).length) return null;
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db)).logs;
  // 날짜마다 그날 생방송 다시보기
  const lives: { date: string; id: string }[] = [];
  for (const d of m.dates) for (const l of logs.filter((x: any) => x.date === d)) for (const v of l.vods || []) {
    const vid = ytIdOf(typeof v === 'string' ? v : v?.url);
    if (vid && !lives.some((x) => x.id === vid)) lives.push({ date: d, id: vid });
  }
  if (!lives.length) return null;
  const list = lives.slice(0, 30);
  const snaps = await db.getAll(...list.map((x) => db.collection('ai_video').doc(x.id)));
  const done = list.map((x, i) => ({ ...x, d: snaps[i].exists ? snaps[i].data() : null })).filter((x) => x.d?.status === 'done');
  if (!done.length) return null;
  const key = done.map((x) => x.id).sort().join(',');
  if (me.rangesKey === key) return me.ranges || [];
  const mine = (me.parts || []).map((p: any) => `[${fmt(p.from)}~${fmt(p.to)}] ${p.summary}`).join('\n').slice(0, 12000)
    + '\n' + (me.scenes || []).map((x: Scene) => `${fmt(x.t)} ${x.d}${x.q ? ` "${x.q}"` : ''}`).join('\n').slice(0, 12000);
  const src = done.map((x, i) => `#${i + 1} ${x.date} 생방송: ${String(x.d.summary || '').slice(0, 400)}\n  흐름: ${(x.d.chapters || []).map((c: any) => c.title).filter(Boolean).join(' / ').slice(0, 400)}\n  게임: ${(x.d.games || []).map((g: any) => g.ko || g.name).join(', ').slice(0, 200)}`).join('\n');
  const prompt = `"${m.title}" 은 우주하마의 여러 생방송에서 웃긴 장면을 모은 영상이야. 아래 [이 영상 기록]의 각 시간대가 [생방송 목록] 중 어느 방송에서 나온 장면인지 맞춰 줘.
규칙: 내용(게임·사건·한 말)이 분명히 같을 때만 연결. 애매하면 빼. 목록에 없는 방송에서 나온 부분은 연결하지 마. 같은 방송이 여러 번 나오면 여러 칸으로.
JSON 으로만: {"ranges":[{"n": 생방송 번호, "from": 시작 초, "to": 끝 초}]}

[생방송 목록]
${src}

[이 영상 기록]
${mine}`;
  const { text } = await gen([{ text: prompt }], true, 40000, TEXT_MODELS);
  const dur = Number(me.duration || 0) || Math.max(0, ...(me.parts || []).map((p: any) => Number(p.to) || 0));
  const ranges = ((parseJson(text).ranges || []) as any[]).map((r) => {
    const x = done[Number(r?.n) - 1];
    const from = Math.max(0, Math.round(Number(r?.from) || 0)), to = Math.round(Number(r?.to) || 0);
    return x && to > from && (!dur || from < dur) ? { id: x.id, date: x.date, from, to: dur ? Math.min(to, dur) : to } : null;
  }).filter(Boolean).sort((a: any, b: any) => a.from - b.from).slice(0, 60);
  await db.collection('ai_video').doc(compId).set({ ranges, rangesKey: key, rangesAt: new Date().toISOString() }, { merge: true });
  return ranges;
}
/** 방금 분석이 끝난 영상이 들어 있는 웃음참기 영상들 (그 영상 자신이 웃음참기여도) */
async function laughCompsWith(db: any, id: string): Promise<string[]> {
  const map = await compIndex(db);
  return Object.entries(map).filter(([cid, m]) => isLaughComp(m.title) && (cid === id || m.ids.includes(id))).map(([cid]) => cid).slice(0, 5);
}

/** 몰아보기 영상 → 들어 있는 방송들의 원본 영상(다시보기·편집본) 분석 모음 */
async function compilationSources(db: any, id: string) {
  const m = (await compIndex(db))[id];
  if (!m || !m.dates.length) return null;
  const { title, dates, games } = m;
  const ids = m.ids;
  const snaps = ids.length ? await db.getAll(...ids.slice(0, 30).map((x) => db.collection('ai_video').doc(x))) : [];
  const sources = snaps.map((sn: any, i: number) => ({ sn, id: ids[i] })).filter(({ sn }: any) => sn.exists && sn.data().status === 'done').map(({ sn, id: vid }: any) => {
    const v = sn.data();
    return {
      id: vid, title: v.title, kind: v.kind, status: v.status,
      summary: v.summary || v.parts?.[0]?.summary || '',
      chapters: v.chapters || [], gameStories: v.gameStories || [],
      games: (v.games || []).map((g: any) => g.ko || g.name).slice(0, 4),
    };
  });
  return {
    found: sources.length > 0, compilation: true, id, title, dates, games: [...new Set(games)].map((g) => ({ name: g })),
    sources, sourceCount: ids.length,
  };
}

/** 아직 안 본 영상을 먼저 봐 달라고 (최대 30개, 순서대로) */
export async function aiPrioritize(db: any, id: string) {
  if (!/^[\w-]{11}$/.test(id)) return { ok: false };
  const ref = db.collection('youtube_cache').doc('ai_state');
  const st = (await ref.get()).data() || {};
  const list: string[] = (st.priority || []).filter((x: string) => x !== id);
  if (list.length >= 30) return { ok: false, full: true };
  await ref.set({ priority: [...list, id] }, { merge: true });
  return { ok: true, position: list.length + 1 };
}

/** 시간이 허락하는 만큼 여러 구간 (점검·예약 실행 공통) */
/** 예전에 분석이 끝난 영상도 연동 추천을 조금씩 (정기 실행 한 번에 몇 개 · 문서 몇 개 읽기) */
export async function suggestBackfill(db: any, n = 6) {
  const stRef = db.collection('youtube_cache').doc('ai_state');
  const pos = Number((await stRef.get()).data()?.suggestPos || 0);
  const ix = (await db.collection('youtube_cache').doc('ai_ids').get()).data() || {};
  const done: string[] = (ix.scan || ix.done || []) as string[];
  if (pos >= done.length) return { finished: true, total: done.length };
  const ids = done.slice(pos, pos + n);
  const snaps = await db.getAll(...ids.map((x) => db.collection('ai_video').doc(x)));
  const { suggestLinks } = await import('./_linkSuggest.js');
  const out: any[] = [];
  for (let i = 0; i < ids.length; i++) {
    const d = snaps[i].exists ? snaps[i].data() : null;
    if (!d || d.suggestAt || d.comp) continue;
    try { out.push({ id: ids[i], ...(await suggestLinks(db, ids[i], d)) }); await db.collection('ai_video').doc(ids[i]).set({ suggestAt: new Date().toISOString() }, { merge: true }); } catch (e: any) { out.push({ id: ids[i], error: String(e?.message || e).slice(0, 80) }); }
  }
  await stRef.set({ suggestPos: pos + ids.length }, { merge: true });
  return { pos: pos + ids.length, total: done.length, out };
}
export async function runAiVideoLoop(db: any, budgetMs = 150000, opts: { kind?: string } = {}) {
  const t0 = Date.now();
  const steps: any[] = [];
  while (steps.length < 12) {
    const r = await runAiVideoStep(db, opts);
    steps.push(r);
    // 영상 하나의 실패(시간 초과 등)는 그 영상만 표시하고 다음으로 계속, 한도·쉬는 중·잠금이면 멈춤
    // 목록만 새로 받은 차례면 이어서 바로 분석
    if (r?.queue) { if (Date.now() - t0 > budgetMs) break; continue; }
    if (r?.cool || r?.busy || r?.skipped || r?.done || (r?.error && !r?.id)) break;
    if (Date.now() - t0 > budgetMs) break;
  }
  const last = steps[steps.length - 1] || {};
  // 이어서 더 돌려도 되는지 (한도·쉬는 중·다른 실행 중·다 끝남이 아니면)
  const more = !(last.cool || last.busy || last.skipped || last.done || (last.error && !last.id));
  return { steps, ms: Date.now() - t0, more };
}

/* ── 검색할 때 영상에서 직접 확인 (유튜브 'Gemini 에게 물어보기'처럼) ──
 * 저장된 장면으로 고른 후보 근처(앞뒤 1분)만 AI 에게 실제로 보여 주고, 정말 그 장면인지·정확히 몇 초인지 확인
 * - 한 번 확인한 검색어는 저장해 두고 다시 AI 를 부르지 않음 (새 영상 분석이 늘면 30일 뒤 다시)
 * - 무료 한도(유튜브 영상 하루 약 8시간)를 분석과 같이 쓰므로 하루 횟수 제한
 */
const VERIFY_DAILY = Number(process.env.AI_VERIFY_DAILY || 80);
const CLIP_HALF = 60;

/**
 * 상황으로 찾기: '브로폴즈에서 왕관 먹는 맵, 밀렸는데 바나나 캐릭터로 1등' 같은 말
 * 낱말로 후보 영상을 고르고(aiSearch) → 그 영상들의 상황 기록(ai_moments)만 읽어서 → AI 가 글로만 맞는 순간을 고름 (영상은 안 봄)
 * 같은 검색어는 저장해 두고 다시 씀 · 하루 한도
 */
const FIND_DAILY = 300;
export async function aiFind(db: any, q: string) {
  const key = normWord(q).slice(0, 80);
  if (key.length < 4) return { picks: [] };
  const ref = db.collection('ai_find').doc(key);
  const old = (await ref.get()).data();
  if (old && Date.now() - Date.parse(old.at || '0') < 3 * 86400000) return { picks: old.picks || [], cached: true };
  const { results } = await aiSearch(db, q, 3);
  const cands = results.slice(0, 6);
  if (!cands.length) return { picks: [] };
  const snaps = await db.getAll(...cands.map((c: any) => db.collection('ai_moments').doc(c.id)));
  const withM = cands.map((c: any, i: number) => ({ c, m: snaps[i].exists ? (snaps[i].data().moments || []) : [] })).filter((x: any) => x.m.length || x.c.scenes.length);
  if (!withM.length) return { picks: [] };
  const day = kstDay();
  const cntRef = db.collection('youtube_cache').doc('ai_find_count');
  const cnt = (await cntRef.get()).data() || {};
  const used = cnt.day === day ? Number(cnt.n || 0) : 0;
  if (used >= FIND_DAILY || !aiKey()) return { picks: [], limited: true };
  await cntRef.set({ day, n: used + 1 }, { merge: true });
  const list = withM.map((x: any, i: number) => `#${i + 1} "${x.c.title}" (게임: ${x.c.games.join(', ')})\n` + [...x.m, ...x.c.scenes].map((m: any) => `  ${fmt(m.t)} ${m.d}`).join('\n')).join('\n');
  const prompt = `시청자가 스트리머 우주하마의 영상에서 이 장면을 찾고 있어: "${q}"
아래는 AI가 영상들을 보고 적어 둔 상황 기록이야. 찾는 장면과 분명히 맞는 순간만 골라 (게임·장소·캐릭터·결과 같은 말한 조건이 기록과 맞아야 함, 일부만 맞으면 why 에 어디가 맞는지).
없으면 빈 배열. JSON 으로만: {"picks":[{"n":영상 번호,"t":"M:SS 또는 H:MM:SS","why":"맞는 이유 한 문장","sure":true 또는 false}]}

${list}`;
  const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
  modelCool = Object.fromEntries(Object.entries(st.modelCool || {}).filter(([, v]) => Number(v) > Date.now())) as Record<string, number>;
  const { text } = await gen([{ text: prompt }], true, 30000, TEXT_MODELS);
  const picks = ((parseJson(text).picks || []) as any[]).map((p) => {
    const x = withM[Number(p?.n) - 1];
    const t = toSec(p?.t);
    return x && Number.isFinite(t) ? { id: x.c.id, title: x.c.title, kind: x.c.kind, t: Math.round(t), why: String(p?.why || '').slice(0, 160), sure: p?.sure !== false } : null;
  }).filter(Boolean).slice(0, 5);
  await ref.set({ q: q.slice(0, 120), picks, at: new Date().toISOString() });
  return { picks };
}

export async function aiVerify(db: any, q: string) {
  // 기본은 끔: 정확도 차이가 크지 않아 무료 한도를 영상 분석에 씀 (AI_VERIFY=1 이면 켬)
  if (process.env.AI_VERIFY !== '1') return { verified: [], rejected: [], pending: [], disabled: true };
  const key = normWord(q).slice(0, 60);
  if (!key) return { verified: [] };
  const ref = db.collection('ai_verify').doc(key);
  // 영상마다 확인 결과를 저장 → 같은 검색어·같은 영상은 다시 AI 를 부르지 않음 (새로 분석된 영상만 확인)
  const per: Record<string, any> = ((await ref.get()).data() || {}).per || {};

  const { results } = await aiSearch(db, q, 6);
  const cands = results.slice(0, 4).filter((r: any) => r.scenes?.length);
  if (!cands.length) return { verified: [], none: true };
  const todo = cands.filter((c: any) => !per[c.id]);
  const pack = (fresh: boolean, extra: any = {}) => {
    const list = cands.map((c: any) => per[c.id]).filter(Boolean);
    return { verified: list.filter((x: any) => x.found), rejected: list.filter((x: any) => x.found === false).map((x: any) => x.id), pending: cands.filter((c: any) => !per[c.id]).map((c: any) => c.id), fresh, ...extra };
  };
  if (!todo.length) return pack(false);

  // 하루 한도
  const day = kstDay();
  const cntRef = db.collection('youtube_cache').doc('ai_verify_count');
  const cnt = (await cntRef.get()).data() || {};
  const used = cnt.day === day ? Number(cnt.n || 0) : 0;
  if (used >= VERIFY_DAILY || !aiKey()) return pack(false, { limited: true });
  await cntRef.set({ day, n: used + 1 }, { merge: true });

  const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
  modelCool = Object.fromEntries(Object.entries(st.modelCool || {}).filter(([, v]) => Number(v) > Date.now())) as Record<string, number>;

  let videoSec = 0;
  const checked = await Promise.all(todo.map(async (c: any) => {
    // 이 영상의 후보 장면 최대 2곳 (겹치면 하나로)
    const wins: [number, number][] = [];
    // 가장 잘 맞는 영상은 4곳, 나머지는 2곳까지
    for (const s of c.scenes.slice(0, c === cands[0] ? 4 : 2)) {
      const a = Math.max(0, s.t - CLIP_HALF);
      const b = c.duration ? Math.min(c.duration, s.t + CLIP_HALF) : s.t + CLIP_HALF;
      const near = wins.find(([x, y]) => a <= y && b >= x);
      if (near) { near[0] = Math.min(near[0], a); near[1] = Math.max(near[1], b); } else wins.push([a, b]);
    }
    const whole = c.kind === 'short' || (c.duration && c.duration <= 180);
    const parts: any[] = whole
      ? [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${c.id}` } }]
      : wins.map(([a, b]) => ({ fileData: { fileUri: `https://www.youtube.com/watch?v=${c.id}` }, videoMetadata: { startOffset: `${a}s`, endOffset: `${b}s` } }));
    videoSec += whole ? (c.duration || 60) : wins.reduce((t, [a, b]) => t + (b - a), 0);
    const where = whole ? '영상 전체' : wins.map(([a, b], i) => `클립${i + 1}: 원본 ${fmt(a)}~${fmt(b)}`).join(', ');
    const prompt = `시청자가 스트리머 "우주하마"(좜마·우좜마·우잠마·우자마·하마·좜마형·하마형 등으로도 부름)의 영상에서 이런 장면을 찾고 있어: "${q}"
보내 준 영상(${where})을 직접 보고 듣고, 그 장면이 실제로 있는지 엄격하게 판단해.
- 비명은 크게 놀라 지르는 소리만 (작은 감탄사·"음~"·웃음은 아님)
- 귀신·괴물은 화면에 실제로 보여야 함 (소리·그림자·착각·"귀신인가?" 하는 말만으로는 아님)
- 갑툭튀·점프스케어는 무언가 갑자기 튀어나와 놀라게 하는 순간
있으면 원본 영상 기준 정확한 시작 시각과 무슨 장면인지 한 문장. 없으면 found 를 false.
JSON 으로만: {"found":true,"moments":[{"t":"MM:SS 또는 H:MM:SS","d":"한 문장"}]}`;
    try {
      const { text, model } = await gen([...parts, { text: prompt }], true, 45000, MODELS, { _nextOnTimeout: true });
      const out = parseJson(text);
      let moments = (Array.isArray(out.moments) ? out.moments : []).map((m: any) => ({ t: toSec(m?.t), d: String(m?.d || '').slice(0, 140) })).filter((m: any) => Number.isFinite(m.t) && m.d);
      // 클립 기준으로 답했으면 원본 기준으로
      if (!whole && wins.length && moments.length && moments.every((m: any) => m.t < wins[0][0])) moments = moments.map((m: any) => ({ ...m, t: m.t + wins[0][0] }));
      return { id: c.id, title: c.title, kind: c.kind, found: out.found !== false && moments.length > 0, moments: moments.slice(0, 3).map((m: any) => ({ ...m, t: Math.round(m.t) })), model };
    } catch (e: any) {
      return { id: c.id, title: c.title, kind: c.kind, error: String(e?.message || e).slice(0, 120) };
    }
  }));
  // 유튜브 영상 하루 한도를 분석과 함께 셈
  try {
    const sRef = db.collection('youtube_cache').doc('ai_state');
    const s2 = (await sRef.get()).data() || {};
    await sRef.set({ day, usedSec: (s2.day === day ? Number(s2.usedSec || 0) : 0) + videoSec, modelCool, modelWhy }, { merge: true });
  } catch { /* */ }
  checked.forEach((c: any) => { if (!c.error) per[c.id] = { ...c, at: new Date().toISOString() }; });
  await ref.set({ q: q.slice(0, 80), per, at: new Date().toISOString() }, { merge: true });
  return pack(true, { failed: checked.filter((c: any) => c.error).length });
}

/** 데이터 검증(_dataCheck)에서 같이 씀 */
export { gen as aiGen, parseJson as aiParseJson, yt as ytApi, ytKey as ytApiKey, TEXT_MODELS as AI_TEXT_MODELS, parseDur as ytParseDur };

/** 진단: 쓸 수 있는 Gemini 모델 목록 + 지금 상태 (어느 모델이 왜 쉬는지) */
export async function aiDiag(db: any, ping = false) {
  // ping: 짧은 글 한 번 (한도 오류 원문 그대로 보려고) — 영상 없이 아주 작게
  let pingOut: any = undefined;
  if (ping) {
    pingOut = {};
    for (const m of ['gemini-3.1-flash-lite']) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${aiKey()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '1+1=? 숫자만' }] }] }) });
        pingOut[m] = { status: r.status, body: (await r.text()).slice(0, 2500) };
      } catch (e: any) { pingOut[m] = { error: String(e?.message || e).slice(0, 300) }; }
    }
  }
  const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
  let models: string[] = [];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${aiKey()}`);
    const j: any = await r.json();
    models = (j.models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m: any) => String(m.name).replace('models/', ''));
  } catch (e: any) { models = [`목록 실패: ${String(e?.message || e).slice(0, 80)}`]; }
  let aiDocs = -1;
  try { aiDocs = (await db.collection('ai_video').count().get()).data().count; } catch { /* */ }
  return { ping: pingOut, aiDocs, using: MODELS, models: models.length, state: { day: st.day, usedSec: st.usedSec, calls: st.calls, coolUntil: st.coolUntil ? new Date(st.coolUntil).toISOString() : null, modelCool: Object.fromEntries(Object.entries(st.modelCool || {}).map(([k, v]) => [k, new Date(Number(v)).toISOString()])), modelWhy: st.modelWhy, lastError: String(st.lastError || '').slice(0, 1500), doneCount: st.doneCount, lastId: st.lastId } };
}

/**
 * 유튜브 조회수 (정렬 '유튜브 인기순'에만 씀): 채널 영상 + 방송 기록의 생방 다시보기
 * youtube_cache/views 에 6시간 저장 → 그 사이에는 문서 1개만 읽음
 */
export async function youtubeViews(db: any) {
  const ref = db.collection('youtube_cache').doc('views');
  const cur = (await ref.get()).data();
  if (cur?.v && Date.now() - Date.parse(cur.at || '0') < 6 * 3600000) return { views: cur.v, at: cur.at };
  const q = await readQueueDoc(db);
  const ids: string[] = [...new Set<string>((q?.items || []).map((x: any) => String(x.id)).filter((id: string) => /^[\w-]{11}$/.test(id)))];
  const v: Record<string, number> = { ...(cur?.v || {}) };
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const j = await yt(`videos?part=statistics&id=${ids.slice(i, i + 50).join(',')}`);
      (j.items || []).forEach((it: any) => { v[it.id] = Number(it.statistics?.viewCount || 0); });
    } catch { break; }
  }
  const at = new Date().toISOString();
  try { await ref.set({ v, at }); } catch { /* */ }
  return { views: v, at };
}
