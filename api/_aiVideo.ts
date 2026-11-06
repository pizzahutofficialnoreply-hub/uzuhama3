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
 *  - ai_video/{videoId}: { title, kind, publishedAt, duration, status, seg, segTotal, segSec, summary, parts[], scenes[{t,d,k}], keywords, games, mood, kw[] }
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
const MODELS = [process.env.GEMINI_VIDEO_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest'].filter(Boolean) as string[];
const TEXT_MODELS = [process.env.GEMINI_VIDEO_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[];

type QItem = { id: string; title: string; publishedAt: string; kind?: 'video' | 'short' | 'live'; duration?: number; live?: string };
export type Scene = { t: number; d: string; k: string[] };

const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const isRate = (m: string) => /429|quota|RESOURCE_EXHAUSTED|rate limit|Too Many Requests/i.test(m);
/** 잠깐 붐빔 (다른 모델로 바꾸거나 조금 뒤에) */
const isBusy = (m: string) => /503|UNAVAILABLE|overloaded|high demand|try again later|500|INTERNAL/i.test(m);
const isTimeout = (m: string) => /timeout|timed out|aborted|deadline|DEADLINE_EXCEEDED|504/i.test(m);
/** 한 번 분석에 기다릴 시간 (이 함수는 최대 300초) */
const AI_TIMEOUT = Number(process.env.AI_VIDEO_TIMEOUT_MS || 230000);
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
  if (cur?.items?.length && Date.now() - Date.parse(cur.fetchedAt || '0') < QUEUE_TTL) return { items: cur.items, fresh: false };
  const cid = await channelId(db);
  if (!cid) throw new Error('채널을 찾지 못했어요');
  const all = await playlistIds(`UU${cid.slice(2)}`);
  let shorts = new Set<string>();
  try { shorts = new Set((await playlistIds(`UUSH${cid.slice(2)}`)).map((x) => x.id)); } catch { /* 길이로 판단 */ }
  const prev = new Map<string, QItem>((cur?.items || []).map((x: QItem) => [x.id, x]));
  const items: QItem[] = all.map((x) => ({ ...prev.get(x.id), ...x }));
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
      x.kind = shorts.has(x.id) ? 'short' : v.liveStreamingDetails ? 'live' : 'video';
    });
  }
  items.forEach((x) => { if (!x.kind) x.kind = shorts.has(x.id) ? 'short' : 'video'; });
  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  await ref.set({ items, fetchedAt: new Date().toISOString(), count: items.length });
  return { items, fresh: true };
}

/* ── Gemini ── */
async function gen(parts: any[], json: boolean, timeoutMs: number, models = MODELS, extra: any = {}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: aiKey() });
  let lastErr: any;
  for (const model of models) {
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
    }
  }
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
${desc ? `설명: ${desc.slice(0, 600)}\n` : ''}${whole ? '' : `지금 보는 건 원본 영상의 ${fmt(start)} ~ ${fmt(end)} 구간이야.\n`}
화면·자막·말소리를 모두 보고 아래 JSON 으로만 답해. 모르는 건 지어내지 마.
{
 "summary": "이 ${whole ? '영상' : '구간'}에서 일어난 일 2~3문장 (한국어)",
 "scenes": [{"t": "원본 영상 기준 시작 시각 MM:SS 또는 H:MM:SS", "d": "무슨 장면인지 한 문장", "k": ["검색 키워드 3~8개: 장면 성격(점프스케어, 귀신, 비명, 웃음, 노래, 보스전, 엔딩, 사망, 실패, 성공 등)·등장 대상·감정"]}],
 "games": [{"name": "화면에 나온 게임 정식 이름(영문이면 영문 그대로)", "ko": "한국어 이름이나 흔히 부르는 이름"}],
 "keywords": ["이 ${whole ? '영상' : '구간'} 전체를 대표하는 검색어 5~15개 (한국어)"],
 "mood": ["분위기 단어 1~5개 (공포, 웃김, 힐링, 긴장감, 감동, 혼돈 등)"]
}
scenes 는 눈에 띄는 순간마다 (${whole ? '최대 15개' : '최대 25개'}), 시간 순서로.`;
  const part: any = { fileData: { fileUri: `https://www.youtube.com/watch?v=${item.id}`, mimeType: 'video/*' } };
  if (!whole) part.videoMetadata = { startOffset: `${start}s`, endOffset: `${end}s` };
  const { text, model } = await gen([part, { text: prompt }], true, AI_TIMEOUT, MODELS, { mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  const out = parseJson(text);
  let scenes: Scene[] = (Array.isArray(out.scenes) ? out.scenes : []).map((s: any) => ({ t: toSec(s?.t), d: String(s?.d || '').slice(0, 160), k: words(s?.k, 8) }))
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
async function analyzeGame(db: any, name: string, ko: string) {
  const ref = db.collection('ai_games').doc(slug(name));
  const cur = (await ref.get()).data();
  if (cur?.about) return cur;
  const prompt = `게임 "${name}"${ko ? ` (한국어로 "${ko}")` : ''}이 어떤 게임인지 구글 검색으로 확인해 줘. 공식 소개·스토어 페이지·리뷰, 그리고 이 게임을 플레이한 다른 유튜버·스트리머 영상의 제목과 반응을 참고해.
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
  if (st.paused) return { skipped: '관리자가 멈춤' };
  if (Number(st.lockUntil || 0) > now) return { skipped: '다른 요청이 분석 중' };
  if (Number(st.coolUntil || 0) > now) return { skipped: `한도 · ${new Date(st.coolUntil).toISOString()} 까지 쉼` };
  const day = kstDay();
  const usedSec = st.day === day ? Number(st.usedSec || 0) : 0;
  const calls = st.day === day ? Number(st.calls || 0) : 0;
  if (usedSec >= DAILY_SEC || calls >= DAILY_CALLS) return { skipped: `오늘 한도 다 씀 (${Math.round(usedSec / 60)}분 · ${calls}번)` };
  await stRef.set({ lockUntil: now + AI_TIMEOUT + 60000, day, usedSec, calls }, { merge: true });

  const release = (patch: any = {}) => stRef.set({ lockUntil: 0, lastRunAt: new Date().toISOString(), ...patch }, { merge: true });
  try {
    const { items: queue, fresh } = await loadQueue(db);
    // 목록을 방금 새로 받았으면 시간이 빠듯하니 분석은 다음 차례에
    if (fresh) { await release({ lastError: '' }); return { queue: queue.length }; }
    // 아직 안 끝난 첫 영상 (최신부터, 30개씩 확인)
    let item: QItem | undefined;
    let cur: any;
    const col = db.collection('ai_video');
    for (let i = 0; i < queue.length && !item; i += 30) {
      const part = queue.slice(i, i + 30).filter((q) => q.live !== 'live' && q.live !== 'upcoming' && (!opts.kind || q.kind === opts.kind));
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
    const segTotal = item.kind === 'short' || !dur ? 1 : Math.max(1, Math.ceil(dur / segSec));
    const seg = Number(cur?.seg || 0);

    // 1) 구간 분석
    if (seg < segTotal) {
      const start = segTotal === 1 ? 0 : seg * segSec;
      const end = segTotal === 1 ? dur : Math.min(dur, start + segSec);
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
        if (isRate(msg)) {
          // 하루 한도(유튜브 8시간 등) → 6시간 뒤, 분당 한도 → 10분 뒤
          const daily = /per day|daily|PerDay/i.test(msg);
          const cool = Date.now() + (daily ? 6 * 3600000 : 10 * 60000);
          await release({ coolUntil: cool, lastError: msg });
          return { error: msg, cool: new Date(cool).toISOString() };
        }
        if (isBusy(msg) && !isTimeout(msg)) {
          // 모델이 붐빔: 이 영상 실패로 치지 않고 5분 쉬기
          await release({ coolUntil: Date.now() + 5 * 60000, lastError: msg, calls: calls + 1 });
          return { error: msg, busy: true };
        }
        const timeout = isTimeout(msg);
        const tries = Number(cur?.tries || 0) + 1;
        await ref.set({
          id: item.id, title: item.title, kind: item.kind, publishedAt: item.publishedAt, duration: dur, desc,
          ...(timeout && segSec > MIN_SEG_SEC ? { segSec: Math.max(MIN_SEG_SEC, Math.floor(segSec / 2)), seg: 0, parts: [], scenes: [] } : {}),
          status: /Video unavailable|private video|INVALID_ARGUMENT|PERMISSION_DENIED|not supported/i.test(msg) && tries >= 2 ? 'skip' : 'error', tries, error: msg, updatedAt: new Date().toISOString(),
        }, { merge: true });
        await release({ lastError: msg, calls: calls + 1 });
        return { error: msg, id: item.id };
      }
      const scenes = [...(cur?.scenes || []), ...r.scenes].sort((a: Scene, b: Scene) => a.t - b.t).slice(0, 400);
      const games = [...(cur?.games || [])];
      r.games.forEach((g: any) => { if (!games.some((x: any) => slug(x.name) === slug(g.name))) games.push(g); });
      const next = {
        id: item.id, title: item.title, kind: item.kind, publishedAt: item.publishedAt, duration: dur, desc,
        segSec, segTotal, seg: seg + 1,
        parts: [...(cur?.parts || []), { from: start, to: end, summary: r.summary }].slice(0, 60),
        scenes, games,
        keywords: [...new Set([...(cur?.keywords || []), ...r.keywords])].slice(0, 60),
        mood: [...new Set([...(cur?.mood || []), ...r.mood])].slice(0, 8),
        status: seg + 1 >= segTotal ? 'finishing' : 'partial', model: r.model, tries: 0, error: '', updatedAt: new Date().toISOString(),
      };
      await ref.set({ ...next, kw: buildKw(next) }, { merge: true });
      await release({ usedSec: usedSec + lenSec, calls: calls + 1, lastError: '', lastId: item.id, model: r.model, idle: false });
      return { id: item.id, title: item.title, seg: seg + 1, segTotal, scenes: r.scenes.length };
    }

    // 2) 마무리: 게임 알아보기 (한 번에 하나) → 전체 요약
    const games = [...(cur?.games || [])];
    const unknown = games.find((g: any) => !g.about && !g.checked);
    if (unknown) {
      try {
        const info = await analyzeGame(db, unknown.name, unknown.ko || '');
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
  return { ...st, lockUntil: undefined, total: q?.count || 0, done, partial, dailySec: DAILY_SEC, models: MODELS };
}

/** AI 검색: 키워드로 1단계 거르고 장면 단위로 점수 */
export async function aiSearch(db: any, q: string) {
  const tokens = queryTokens(q);
  if (!tokens.length) return { tokens, results: [] };
  const snap = await db.collection('ai_video').where('kw', 'array-contains-any', tokens.slice(0, 30)).limit(40).get();
  const has = (text: string) => { const t = normWord(text); return tokens.filter((k) => t.includes(k)); };
  const results = snap.docs.map((d: any) => {
    const v = d.data();
    let score = 0;
    const titleHit = has(v.title || '').length;
    score += titleHit * 2;
    const kwHit = tokens.filter((t) => (v.kw || []).includes(t)).length;
    score += kwHit;
    const scenes = (v.scenes || []).map((s: Scene) => {
      const hit = new Set<string>([...has(s.d), ...(s.k || []).flatMap((k) => has(k))]);
      return { t: s.t, d: s.d, n: hit.size };
    }).filter((s: any) => s.n > 0).sort((a: any, b: any) => b.n - a.n || a.t - b.t);
    if (scenes.length) score += scenes[0].n * 3 + Math.min(3, scenes.length) * 0.5;
    const gameHit = (v.games || []).some((g: any) => has([g.name, g.ko, ...(g.tags || []), ...(g.aliases || []), g.genre].join(' ')).length);
    if (gameHit) score += 1.5;
    return {
      id: v.id || d.id, title: v.title, kind: v.kind, publishedAt: v.publishedAt, duration: v.duration,
      summary: String(v.summary || v.parts?.[0]?.summary || '').slice(0, 220),
      scenes: scenes.slice(0, 3).map((s: any) => ({ t: s.t, d: s.d })),
      games: (v.games || []).map((g: any) => g.ko || g.name).slice(0, 3),
      partial: v.status !== 'done',
      score,
    };
  }).filter((r: any) => r.score >= 2)
    .sort((a: any, b: any) => b.score - a.score || (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 8);
  return { tokens, results };
}

/** 진단: 모델·유튜브 주소 읽기가 되는지 짧게 시험 */
export async function aiDiag(id: string, model: string, variant: string) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: aiKey() });
  const t0 = Date.now();
  try {
    const parts: any[] = variant === 'text' ? [{ text: '안녕이라고만 답해' }] : [
      { fileData: { fileUri: `https://www.youtube.com/watch?v=${id}`, ...(variant === 'mime' ? { mimeType: 'video/*' } : {}) } },
      { text: '이 영상을 한 문장으로 요약해 줘' },
    ];
    const r = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { httpOptions: { timeout: 100000 }, ...(variant === 'low' ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' as any } : {}) } });
    return { ok: true, ms: Date.now() - t0, text: (r.text || '').slice(0, 200), usage: r.usageMetadata };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 300) };
  }
}
