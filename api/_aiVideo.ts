/**
 * AI 영상 상세 분석 + AI 검색 (함수 아님: '_' 로 시작)
 *
 * 분석 (runAiVideoStep): 점검(tick)이 몇 분마다 한 번 부르면 '한 구간'씩 분석
 *  - 대상: 채널 전체 (일반 영상·생방송 다시보기·쇼츠, 유튜브 'UU' 재생목록), 최신 영상부터
 *  - Gemini 가 유튜브 주소를 직접 봄 (영상을 내려받지 않음). 긴 영상은 10분씩 나눠서 (시간 초과면 그 영상은 더 잘게)
 *  - 무료 한도: 유튜브 영상은 하루 8시간까지 → 기본 7시간(AI_VIDEO_DAILY_SEC)까지만, 한도에 걸리면 다음 날까지 쉼
 *  - 영상을 다 보면: 전체 요약 + 나온 게임을 구글 검색으로 찾아 어떤 게임인지 정리 (다른 유튜버 플레이 반응 포함)
 *  - 모델: GEMINI_VIDEO_MODEL → gemini-3.8-flash → gemini-flash-latest (최신 Flash 계열, 2.5 는 새 사용자에게 막힘)
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

const SEG_SEC = 10 * 60;
const MIN_SEG_SEC = 3 * 60;
const DAILY_SEC = Number(process.env.AI_VIDEO_DAILY_SEC || 7 * 3600);
const DAILY_CALLS = Number(process.env.AI_VIDEO_DAILY_CALLS || 180);
const QUEUE_TTL = 12 * 3600 * 1000;
// 최신 Flash 가 붐비거나 무료 한도가 차면 최신 Flash-Lite 로 이어서 (분석이 멈추지 않게)
const MODELS = [process.env.GEMINI_VIDEO_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[];
const TEXT_MODELS = [process.env.GEMINI_VIDEO_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[];

type QItem = { id: string; title: string; publishedAt: string; kind?: 'video' | 'short' | 'live'; duration?: number; live?: string; logDate?: string; games?: string[]; gameLinks?: Record<string, string>; comp?: boolean };
const QUEUE_VER = 3; // 2: 방송 기록의 생방송 다시보기 포함, 3: 몰아보기 표시(분석 안 함)
export type Scene = { t: number; d: string; k: string[]; u?: number /* 1: 확실하지 않음 */ };

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
const STOP = new Set(['영상', '장면', '부분', '방송', '나오는', '나온', '나오던', '있는', '있던', '하는', '했던', '하던', '찾아줘', '찾아', '보여줘', '알려줘', '추천', '추천해줘', '거', '것', '좀', '그', '그거', '뭐', '뭐였지', '어디', '언제', '어떤', '우주하마', '하마', '편', '부분이', '나오', '그때', '때', '중', '보면', '보고', '싶어', '싶은', '줘', '해줘', '있어', '같은데', '다시보기', '생방', '생방송']);
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
  (doc.scenes || []).forEach((sc: Scene) => (sc.k || []).forEach(add));
  String(doc.title || '').split(/\s+/).forEach(add);
  return [...out].slice(0, 400);
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
async function playlistIds(pl: string): Promise<{ id: string; title: string; publishedAt: string }[]> {
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
async function loadQueue(db: any): Promise<{ items: QItem[]; fresh: boolean }> {
  const ref = db.collection('youtube_cache').doc('ai_queue');
  const cur = (await ref.get()).data();
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
    const logs = await db.collection('logs').get();
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
  await ref.set({ items, fetchedAt: new Date().toISOString(), count: items.length, channelCount, v: QUEUE_VER });
  return { items, fresh: true };
}

/* ── Gemini ── */
// 모델별 쉬는 시간 (하루 한도면 다음 한도 초기화까지, 분당 한도면 알려 준 시간만큼, 붐비면 5분)
let modelCool: Record<string, number> = {};
let modelWhy: Record<string, string> = {};
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
    const daily = /PerDay|per day|daily/i.test(msg);
    modelCool[model] = daily ? nextQuotaReset() : Date.now() + Math.max(60000, retryMs(msg) || 10 * 60000);
    modelWhy[model] = daily ? 'day' : 'minute';
  } else if (isBusy(msg)) {
    modelCool[model] = Date.now() + 5 * 60000;
    modelWhy[model] = 'busy';
  }
}

async function gen(parts: any[], json: boolean, timeoutMs: number, models = MODELS, extra: any = {}) {
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
      if (isTimeout(msg)) throw e; // 시간 초과는 다른 모델로 바꿔도 같음
      if (!/not found|404|unsupported|invalid model/i.test(msg) && !isRate(msg) && !isBusy(msg)) throw e;
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

async function analyzeSegment(item: QItem, start: number, end: number, desc: string) {
  const whole = item.kind === 'short' || !item.duration || item.duration <= end - start + 30;
  const prompt = `너는 스트리머 "우주하마"의 영상을 검색용으로 꼼꼼히 정리하는 사람이야. 시청자가 나중에 "귀신 점프스케어 나오는 장면", "노래 부르는 부분", "엔딩 보고 우는 장면"처럼 찾을 수 있게 정리해.
영상 제목: ${item.title}
종류: ${item.kind === 'short' ? '쇼츠' : item.kind === 'live' ? '생방송 다시보기' : '편집 영상'}${item.duration ? ` / 전체 길이 ${fmt(item.duration)}` : ''}
${item.logDate ? `방송 날짜: ${item.logDate}\n` : ''}${item.games?.length ? `방송 기록에 적힌 게임: ${item.games.join(', ')}\n` : ''}${desc ? `설명: ${desc.slice(0, 600)}\n` : ''}${whole ? '' : `지금 보는 건 원본 영상의 ${fmt(start)} ~ ${fmt(end)} 구간이야.\n`}
화면·자막·말소리를 모두 보고 아래 JSON 으로만 답해. 모르는 건 지어내지 마.
{
 "summary": "이 ${whole ? '영상' : '구간'}에서 일어난 일 2~3문장 (한국어)",
 "scenes": [{"t": "원본 영상 기준 시작 시각 MM:SS 또는 H:MM:SS", "d": "무슨 장면인지 한 문장", "k": ["검색 키워드 3~8개: 장면 성격(점프스케어, 귀신, 비명, 웃음, 노래, 보스전, 엔딩, 사망, 실패, 성공 등)·등장 대상·감정"], "sure": true}],
 "games": [{"name": "화면에 나온 게임 정식 이름(영문이면 영문 그대로)", "ko": "한국어 이름이나 흔히 부르는 이름"}],
 "keywords": ["이 ${whole ? '영상' : '구간'} 전체를 대표하는 검색어 5~15개 (한국어)"],
 "mood": ["분위기 단어 1~5개 (공포, 웃김, 힐링, 긴장감, 감동, 혼돈 등)"]
}
k 에는 화면에 실제로 또렷이 나온 것만 넣어. 예: 귀신·괴물이 실제로 화면에 보이면 '귀신', 소리만 나거나 그림자·착각·"귀신인가?" 하는 말뿐이면 '귀신' 대신 '귀신 의심'·'소리'처럼 쓰고 sure 를 false 로. 확실하면 sure 는 true.
scenes 는 눈에 띄는 순간마다 (${whole ? '최대 15개' : '최대 25개'}), 시간 순서로.`;
  // mimeType 을 붙이면 유튜브 주소를 느린 방식으로 읽어 시간 초과가 남 → 주소만
  const part: any = { fileData: { fileUri: `https://www.youtube.com/watch?v=${item.id}` } };
  if (!whole) part.videoMetadata = { startOffset: `${start}s`, endOffset: `${end}s` };
  const { text, model } = await gen([part, { text: prompt }], true, AI_TIMEOUT, MODELS, { mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  const out = parseJson(text);
  let scenes: Scene[] = (Array.isArray(out.scenes) ? out.scenes : []).map((s: any) => ({ t: toSec(s?.t), d: String(s?.d || '').slice(0, 160), k: words(s?.k, 8), ...(s?.sure === false ? { u: 1 } : {}) }))
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
  };
}

const slug = (s: string) => normWord(s).slice(0, 80) || 'x';

/** 게임이 어떤 게임인지: 구글 검색(공식 소개·스토어·다른 유튜버 플레이 영상 반응)으로 */
async function analyzeGame(db: any, name: string, ko: string, link = '') {
  const ref = db.collection('ai_games').doc(slug(name));
  const cur = (await ref.get()).data();
  if (cur?.about) return cur;
  const prompt = `게임 "${name}"${ko ? ` (한국어로 "${ko}")` : ''}이 어떤 게임인지 구글 검색으로 확인해 줘.${link ? ` 방송 기록에 적힌 게임 링크: ${link} (이 페이지의 소개도 참고)` : ''} 공식 소개·스토어 페이지·리뷰, 그리고 이 게임을 플레이한 다른 유튜버·스트리머 영상의 제목과 반응을 참고해.
아래 JSON 으로만 답해 (한국어). 확인 안 되는 건 비워 둬.
{"name":"정식 이름","aliases":["한국어 이름·줄임말"],"genre":"장르","about":"어떤 게임인지 2~3문장","tags":["검색 키워드 5~12개: 분위기·소재·특징 (예: 점프스케어, 생존, 퍼즐, 협동, 귀여움)"],"horror":true/false,"players":"혼자/협동/대전 등","reactions":"다른 유튜버 플레이 영상에서 흔히 나오는 반응 한두 문장"}`;
  const { text, model } = await gen([{ text: prompt }], false, 30000, TEXT_MODELS, { tools: [{ googleSearch: {} }] });
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
export async function runAiVideoStep(db: any, opts: { kind?: string } = {}): Promise<any> {
  if (!aiKey()) return { skipped: 'GEMINI_API_KEY 없음' };
  if (!ytKey()) return { skipped: 'YOUTUBE_API_KEY 없음' };
  const stRef = db.collection('youtube_cache').doc('ai_state');
  const now = Date.now();
  const st = (await stRef.get()).data() || {};
  modelCool = Object.fromEntries(Object.entries(st.modelCool || {}).filter(([, v]) => Number(v) > now)) as Record<string, number>;
  modelWhy = { ...(st.modelWhy || {}) };
  if (st.paused) return { skipped: '관리자가 멈춤' };
  if (Number(st.lockUntil || 0) > now) return { skipped: '다른 요청이 분석 중' };
  if (Number(st.coolUntil || 0) > now) return { skipped: `한도 · ${new Date(st.coolUntil).toISOString()} 까지 쉼` };
  const day = kstDay();
  const usedSec = st.day === day ? Number(st.usedSec || 0) : 0;
  const calls = st.day === day ? Number(st.calls || 0) : 0;
  if (usedSec >= DAILY_SEC || calls >= DAILY_CALLS) return { skipped: `오늘 한도 다 씀 (${Math.round(usedSec / 60)}분 · ${calls}번)` };
  await stRef.set({ lockUntil: now + AI_TIMEOUT + 60000, day, usedSec, calls }, { merge: true });

  const release = (patch: any = {}) => stRef.set({ lockUntil: 0, lastRunAt: new Date().toISOString(), modelCool, modelWhy, ...patch }, { mergeFields: ['lockUntil', 'lastRunAt', 'modelCool', 'modelWhy', ...Object.keys(patch)] });
  try {
    const { items: queue, fresh } = await loadQueue(db);
    // 목록을 방금 새로 받았으면 시간이 빠듯하니 분석은 다음 차례에
    if (fresh) { await release({ lastError: '' }); return { queue: queue.length }; }
    // 아직 안 끝난 첫 영상 (최신부터, 30개씩 확인)
    let item: QItem | undefined;
    let cur: any;
    const col = db.collection('ai_video');
    // 방문자가 '먼저 봐 달라'고 한 영상부터
    const pr: string[] = (st.priority || []).filter((pid: string) => queue.some((q) => q.id === pid && !q.comp));
    for (const pid of pr) {
      if (opts.kind) break;
      const d = (await col.doc(pid).get()).data();
      if (d?.status === 'done' || d?.status === 'skip' || (d?.status === 'error' && (d.tries || 0) >= 3)) continue;
      item = queue.find((q) => q.id === pid); cur = d; break;
    }

    for (let i = 0; i < queue.length && !item; i += 30) {
      const part = queue.slice(i, i + 30).filter((q) => !q.comp && q.live !== 'live' && q.live !== 'upcoming' && (!opts.kind || q.kind === opts.kind));
      if (!part.length) continue;
      const snaps = await db.getAll(...part.map((q) => col.doc(q.id)));
      for (let j = 0; j < part.length; j++) {
        const d = snaps[j].exists ? snaps[j].data() : null;
        const busySkip = d?.status === 'skip' && /high demand|UNAVAILABLE/i.test(d?.error || ''); // 예전 규칙으로 잘못 건너뛴 것
        if (!d || busySkip || (d.status !== 'done' && d.status !== 'skip' && !(d.status === 'error' && (d.tries || 0) >= 3))) { item = part[j]; cur = d; break; }
      }
    }
    if (!item) { await release({ lastError: '', idle: true }); return { done: true, message: '모든 영상을 분석했어요' }; }

    const ref = col.doc(item.id);
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
        const msg = String(e?.message || e).slice(0, 300);
        if (isRate(msg) || isBusy(msg)) {
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
        const timeout = isTimeout(msg);
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
        parts: [...(cur?.parts || []), { from: start, to: end, summary: r.summary }].slice(0, 200),
        scenes, games,
        keywords: [...new Set([...(cur?.keywords || []), ...r.keywords])].slice(0, 60),
        mood: [...new Set([...(cur?.mood || []), ...r.mood])].slice(0, 8),
        status: whole || end >= dur ? 'finishing' : 'partial', model: r.model, tries: 0, error: '', updatedAt: new Date().toISOString(),
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
        if (isRate(String(e?.message || e))) { await release({ coolUntil: Date.now() + 10 * 60000, lastError: String(e?.message || e).slice(0, 300) }); return { error: 'rate' }; }
      }
      const next = { ...cur, games };
      await ref.set({ games, kw: buildKw(next), updatedAt: new Date().toISOString() }, { merge: true });
      await release({ calls: calls + 1 });
      return { id: item.id, game: unknown.name };
    }
    let summary = cur?.parts?.[0]?.summary || '';
    if ((cur?.parts || []).length > 1) {
      try {
        const { text } = await gen([{ text: `스트리머 우주하마의 영상 "${item.title}" 을 구간별로 정리한 내용이야. 영상 전체를 3~4문장으로 요약해 줘. 한국어, 지어내지 말 것. JSON {"summary":""} 로만.\n\n${cur.parts.map((p: any) => `[${fmt(p.from)}~${fmt(p.to)}] ${p.summary}`).join('\n').slice(0, 12000)}` }], true, 25000, TEXT_MODELS);
        summary = String(parseJson(text).summary || summary).slice(0, 700);
      } catch { /* 첫 구간 요약 */ }
    }
    await ref.set({ summary, status: 'done', doneAt: new Date().toISOString() }, { merge: true });
    if ((st.priority || []).includes(item.id)) await stRef.set({ priority: (st.priority || []).filter((x: string) => x !== item!.id) }, { merge: true });
    await release({ calls: calls + 1, doneCount: Number(st.doneCount || 0) + 1 });
    return { id: item.id, title: item.title, finished: true };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await release({ lastError: msg });
    return { error: msg };
  }
}

/** 진행 상황 (관리자) */
export async function aiVideoStatus(db: any) {
  const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
  const q = (await db.collection('youtube_cache').doc('ai_queue').get()).data();
  let done = 0;
  let partial = 0;
  try {
    done = (await db.collection('ai_video').where('status', '==', 'done').count().get()).data().count;
    partial = (await db.collection('ai_video').where('status', 'in', ['partial', 'finishing']).count().get()).data().count;
  } catch { /* count 미지원 */ }
  const kinds: Record<string, number> = {};
  (q?.items || []).forEach((x: QItem) => { const k = x.comp ? 'comp' : x.kind || 'video'; kinds[k] = (kinds[k] || 0) + 1; });
  return { ...st, lockUntil: undefined, total: (q?.items || []).filter((x: QItem) => !x.comp).length || q?.count || 0, channelCount: q?.channelCount || 0, fetchedAt: q?.fetchedAt, kinds, done, partial, dailySec: DAILY_SEC, models: MODELS };
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
    const { text } = await gen([{ text: `팬 사이트에서 스트리머 "우주하마"의 게임 방송 영상 장면을 찾는 검색어야: "${q}"
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
export async function aiSearch(db: any, q: string) {
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
      const scenes = (v.scenes || []).map((s: Scene) => {
        const main = new Set<string>([...has(s.d, toks), ...(s.k || []).flatMap((k) => has(k, toks))]);
        const ex = new Set<string>([...has(s.d, extra), ...(s.k || []).flatMap((k) => has(k, extra))]);
        const vague = s.u === 1 || HEDGE.test(s.d) || (s.k || []).some((k) => /의심/.test(k));
        const n = (main.size + ex.size * 0.6) * (vague ? 0.35 : 1);
        return { t: s.t, d: s.d, n, vague };
      }).filter((s: any) => s.n > 0).sort((a: any, b: any) => b.n - a.n || a.t - b.t);
      if (scenes.length) score += scenes[0].n * 3 + Math.min(3, scenes.filter((x: any) => !x.vague).length) * 0.5;
      const gameText = (v.games || []).map((g: any) => [g.name, g.ko, ...(g.tags || []), ...(g.aliases || []), g.genre].join(' ')).join(' ');
      if (has(gameText, toks).length) score += 1.5; else if (has(gameText, extra).length) score += 0.8;
      return {
        id: v.id || d.id, title: v.title, kind: v.kind, publishedAt: v.publishedAt, duration: v.duration,
        summary: String(v.summary || v.parts?.[0]?.summary || '').slice(0, 220),
        // 확실한 장면 먼저, 애매한 건 뒤로
        scenes: [...scenes.filter((x: any) => !x.vague), ...scenes.filter((x: any) => x.vague)].slice(0, 3).map((x: any) => ({ t: x.t, d: x.d, ...(x.vague ? { vague: true } : {}) })),
        games: (v.games || []).map((g: any) => g.ko || g.name).slice(0, 3),
        partial: v.status !== 'done',
        score,
      };
    }).filter((r: any) => r.score >= 2)
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
export async function aiVideoDetail(db: any, id: string) {
  if (!/^[\w-]{11}$/.test(id)) return { found: false };
  const d = (await db.collection('ai_video').doc(id).get()).data();
  if (!d || !(d.parts?.length || d.summary)) {
    const st = (await db.collection('youtube_cache').doc('ai_state').get()).data() || {};
    return { found: false, requested: (st.priority || []).includes(id) };
  }
  const games = await Promise.all((d.games || []).slice(0, 4).map(async (g: any) => {
    if (g.about) return g;
    try { const x = (await db.collection('ai_games').doc(slug(g.name)).get()).data(); return x ? { ...g, ...x } : g; } catch { return g; }
  }));
  return {
    found: true, id, title: d.title, kind: d.kind, status: d.status, seg: d.seg, segTotal: d.segTotal, model: d.model,
    summary: d.summary || '', parts: (d.parts || []).map((p: any) => ({ from: p.from, to: p.to, summary: p.summary })),
    scenes: (d.scenes || []).map((s: Scene) => ({ t: s.t, d: s.d, k: s.k, ...(s.u ? { vague: true } : {}) })),
    games: games.map((g: any) => ({ name: g.name, ko: g.ko, genre: g.genre, about: g.about, tags: g.tags, horror: g.horror })),
    keywords: d.keywords || [], mood: d.mood || [],
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
export async function runAiVideoLoop(db: any, budgetMs = 150000, opts: { kind?: string } = {}) {
  const t0 = Date.now();
  const steps: any[] = [];
  while (steps.length < 12) {
    const r = await runAiVideoStep(db, opts);
    steps.push(r);
    if (r?.error || r?.skipped || r?.done || r?.queue) break;
    if (Date.now() - t0 > budgetMs) break;
  }
  return { steps, ms: Date.now() - t0 };
}
