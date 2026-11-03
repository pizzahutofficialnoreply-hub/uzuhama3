import { getKoreanHoliday } from './koreanHolidays';

/**
 * 검색어 해석 (기기 안에서만, 외부 API 없음)
 *
 * 1) 중요한 단어 우선: 드문 단어일수록 무겁게 (예: "IQ 테스트" → IQ 가 테스트보다 중요)
 *    붙어 있는 그대로("IQ테스트")가 제목에 있으면 맨 위, 중요한 단어만 맞아도 그다음, 흔한 단어만 맞는 건 빼기
 * 2) 영어·숫자 단어는 단어 단위로만 (iq 가 unique 안에서 맞지 않게)
 * 3) 띄어쓰기 없는 검색어 나누기 ("iq테스트" → iq + 테스트, "겨울특집" → 겨울 + 특집)
 * 4) 게임 줄임말 (배그 → 배틀그라운드, 콜옵 → 콜 오브 듀티)
 * 5) 자연어 ("겨울 특집 추천해줘", "무서운 거 보여줘") → 부탁하는 말을 빼고, 계절·분위기 말을 비슷한 말·썸네일 분위기·방송한 달로 넓혀 찾기
 */

export type SearchToggles = { smart: boolean; alias: boolean; natural: boolean };

/** 비교용: 소문자, 띄어쓰기·기호 없음 */
export const sq = (s: string) => String(s || '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
const isLatin = (t: string) => /^[0-9a-z]+$/.test(t);

// ── 게임 줄임말 ──
export const GAME_ALIASES: Record<string, string[]> = {
  배그: ['배틀그라운드', 'pubg', 'battlegrounds'],
  배틀그라운드: ['배그', 'pubg'],
  펍지: ['배틀그라운드', 'pubg'],
  롤: ['리그 오브 레전드', 'league of legends'],
  리그오브레전드: ['롤', 'league of legends'],
  롤체: ['전략적 팀 전투', 'tft', '롤토체스'],
  롤토체스: ['전략적 팀 전투', 'tft'],
  옵치: ['오버워치', 'overwatch'],
  오버워치: ['옵치', 'overwatch'],
  콜옵: ['콜 오브 듀티', 'call of duty', '모던 워페어', 'modern warfare', 'warzone', '워존'],
  콜오브: ['콜 오브 듀티', 'call of duty'],
  콜오브듀티: ['call of duty', '모던 워페어', '워존'],
  모던워페어: ['call of duty', '콜 오브 듀티', 'modern warfare'],
  어몽: ['어몽어스', 'among us'],
  어몽어스: ['among us'],
  폴가: ['폴가이즈', 'fall guys'],
  폴가이즈: ['fall guys'],
  휴폴플: ['휴먼 폴 플랫', 'human fall flat'],
  휴먼폴플랫: ['human fall flat'],
  뱀서: ['뱀파이어 서바이버즈', 'vampire survivors'],
  뱀파이어서바이버즈: ['vampire survivors'],
  로블: ['로블록스', 'roblox'],
  로블록스: ['roblox'],
  씨오브: ['씨 오브 시브즈', 'sea of thieves'],
  씨오시: ['씨 오브 시브즈', 'sea of thieves'],
  카스: ['카운터 스트라이크', 'counter-strike', 'cs2', 'csgo'],
  카스고: ['카운터 스트라이크', 'counter-strike', 'csgo'],
  항아리: ['항아리 게임', 'getting over it'],
  항아리게임: ['getting over it'],
  마크: ['마인크래프트', 'minecraft'],
  마인크래프트: ['minecraft', '마크'],
  발로: ['발로란트', 'valorant'],
  발로란트: ['valorant'],
  메이플: ['메이플스토리', 'maplestory'],
  피코파크: ['pico park'],
  리틀나메: ['리틀 나이트메어', 'little nightmares'],
  리틀나이트메어: ['little nightmares'],
  갱비: ['갱 비스트', 'gang beasts'],
  갱비스트: ['gang beasts'],
  탭스: ['totally accurate battle simulator', 'tabs'],
  파애: ['party animals', '파티 애니멀즈'],
  파티애니멀즈: ['party animals'],
  얼불춤: ['불과 얼음의 춤', 'a dance of fire and ice'],
  아이작: ['바인딩 오브 아이작', 'binding of isaac'],
  포피: ['poppy playtime', '파피 플레이타임'],
  파피플레이타임: ['poppy playtime'],
  '8번출구': ['exit 8', '8番出口'],
  벅샷: ['buckshot roulette'],
  수박게임: ['수박 게임', 'watermelon'],
  사과게임: ['후르츠 박스', 'フルーツボックス'],
  체인드: ['chained together'],
  콘워: ['content warning'],
  콘텐츠워닝: ['content warning'],
  레포: ['r.e.p.o', 'repo'],
  엘든: ['엘든 링', 'elden ring'],
  에펙: ['에이펙스 레전드', 'apex legends'],
  에이펙스: ['apex legends'],
  서든: ['서든어택'],
  스타: ['스타크래프트', 'starcraft'],
  크아: ['크레이지 아케이드'],
  카트: ['카트라이더', 'kartrider'],
  동숲: ['동물의 숲', 'animal crossing'],
  팰월드: ['palworld'],
  데바데: ['데드 바이 데이라이트', 'dead by daylight'],
  리썰: ['리썰 컴퍼니', 'lethal company'],
  리썰컴퍼니: ['lethal company'],
  파스모: ['파스모포비아', 'phasmophobia'],
  테라리아: ['terraria'],
  슈애로: ['슈퍼 애니멀 로얄', 'super animal royale'],
  울치홀: ['ultimate chicken horse'],
  얼치홀: ['ultimate chicken horse'],
  가틱폰: ['gartic phone'],
  지렁이게임: ['slither.io'],
  인투더싱크홀: ['into the sinkhole'],
  스트레이: ['stray'],
  백룸: ['backrooms'],
  // 같은 뜻
  iq: ['아이큐', '지능테스트'],
  아이큐: ['iq'],
};

/** 방송 기록의 게임 이름으로 줄임말 만들기: "휴먼 폴 플랫" → 휴폴플, "Totally Accurate Battle Simulator" → tabs */
export function autoAliases(gameNames: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (k: string, full: string) => { if (k.length < 3) return; (out[k] ||= []).includes(full) || out[k].push(full); };
  gameNames.forEach((name) => {
    const parts = String(name || '').split(/[()（）]/).map((s) => s.trim()).filter(Boolean);
    parts.forEach((p) => {
      const words = p.split(/[\s:\-–]+/).filter(Boolean);
      if (words.length < 3) return;
      if (words.every((w) => /^[가-힣]/.test(w))) add(words.map((w) => w[0]).join(''), name);
      else if (words.every((w) => /^[A-Za-z]/.test(w))) add(words.map((w) => w[0].toLowerCase()).join(''), name);
    });
  });
  return out;
}

// ── 자연어: 계절·행사·분위기 ──
/** 말하듯 검색에서 '어떻게 보여 줄지' (라이브 탭으로, 긴 영상 먼저, 최근순 등) */
export type Intent = { tab?: 'live' | 'shorts'; long?: boolean; sort?: 'desc' | 'asc' };
type Concept = { key: string; words: string[]; expand: string[]; moods: string[]; months?: number[]; genres?: string[]; avoid?: string[]; holidays?: string[]; intent?: Intent };
export const CONCEPTS: Concept[] = [
  { key: '겨울', words: ['겨울', '한겨울', '겨울철', '추운', '추위', '눈오는', '겨울특집'], expand: ['겨울', '눈사람', '크리스마스', '성탄', '산타', '스키', '썰매', '얼음', '빙판', '펭귄', '연말', '눈싸움', '폭설', 'winter', 'snow', 'christmas', 'ski'], moods: ['겨울', '눈', '크리스마스'], months: [12, 1, 2] },
  { key: '여름', words: ['여름', '한여름', '여름철', '더위', '더운', '피서', '바캉스', '무더위', '휴가철', '여름특집'], expand: ['여름', '바다', '해변', '물놀이', '수영', '수박', '휴가', '바캉스', '피서', '해수욕', 'summer', 'beach'], moods: ['여름', '바다', '물'], months: [7, 8] },
  { key: '봄', words: ['봄', '봄날', '벚꽃', '봄특집'], expand: ['봄', '벚꽃', '꽃놀이', 'spring'], moods: ['봄'], months: [3, 4, 5] },
  { key: '가을', words: ['가을', '단풍', '가을특집'], expand: ['가을', '단풍', '낙엽', 'autumn'], moods: ['가을'], months: [9, 10, 11] },
  { key: '크리스마스', words: ['크리스마스', '성탄절', '성탄', 'xmas'], expand: ['크리스마스', '성탄', '산타', '트리', 'christmas'], moods: ['크리스마스'], months: [12] },
  { key: '할로윈', words: ['할로윈', '핼러윈'], expand: ['할로윈', '핼러윈', '호박', 'halloween'], moods: ['할로윈'], months: [10] },
  { key: '설날', words: ['설', '설날', '구정', '설특집', '설날특집', '설연휴'], expand: ['설날', '새해', '떡국', '세배', '복주머니', '윷놀이'], moods: ['설날', '새해'], holidays: ['설날'], intent: { long: true } },
  { key: '추석', words: ['추석', '한가위', '추석특집', '추석연휴'], expand: ['추석', '한가위', '송편', '보름달'], moods: ['추석'], holidays: ['추석'], intent: { long: true } },
  { key: '명절', words: ['명절', '명절특집', '연휴', '연휴특집'], expand: ['설날', '추석', '명절', '새해', '떡국', '송편', '세배'], moods: ['설날', '추석', '새해'], holidays: ['설날', '추석'], intent: { long: true } },
  {
    key: '잔잔한 방송', words: ['수면', '수면방송', '잠', '잘때', '자기전', '잠잘때', '잠올때', '잠안올때', '자장가', 'asmr', '불면', '숙면', '백색소음', '틀어놓기', '틀어놓고', '배경음'],
    expand: ['잔잔', '힐링', 'asmr', '자장가', '노가리', '토크', '낚시', '농사', '요리', '평화', '수면'],
    moods: ['힐링', '평화', '밤'], genres: ['시뮬레이션', '퍼즐', '캐주얼', '노가리', '스토리', '교육', '도서', '힐링'],
    avoid: ['공포', 'fps', '배틀로얄', '슈팅', '액션'], intent: { tab: 'live', long: true },
  },
  { key: '공포', words: ['공포', '무서운', '무섭', '호러', '소름', '귀신', '오싹', '쫄리는', '공포게임'], expand: ['공포', '호러', '귀신', '유령', '좀비', '괴물', '소름', 'horror', 'scary'], moods: ['공포'], genres: ['공포'] },
  { key: '웃김', words: ['웃긴', '웃기는', '웃음', '개그', '빵터지는', '꿀잼', '재밌는', '재미있는', '웃음참기'], expand: ['웃긴', '개웃', '빵터', '레전드', '웃음', 'ㅋㅋㅋㅋ'], moods: ['웃김'] },
  { key: '힐링', words: ['힐링', '잔잔한', '잔잔', '편안한', '평화로운', '느긋한', '여유로운'], expand: ['힐링', '잔잔', '평화', '여유'], moods: ['힐링', '평화'] },
  { key: '감동', words: ['감동', '감동적인', '눈물', '슬픈', '뭉클한'], expand: ['감동', '눈물', '슬픈', '오열'], moods: ['감동', '슬픔'] },
  { key: '귀여움', words: ['귀여운', '귀엽', '깜찍한', '귀요미'], expand: ['귀여운', '귀요미', '깜찍', 'cute'], moods: ['귀여움'] },
  { key: '긴장', words: ['긴장', '긴장감', '스릴', '스릴있는', '쫄깃한', '고난도', '빡겜', '극한'], expand: ['긴장', '스릴', '극한', '고인물', '초고수'], moods: ['긴장감'] },
  { key: '분노', words: ['빡치는', '화나는', '분노', '킹받는', '열받는', '개빡치는'], expand: ['빡치', '분노', '킹받', '열받', '개빡'], moods: ['분노'] },
  { key: '바다', words: ['바다', '해변', '물속', '수중', '바닷속'], expand: ['바다', '해변', '물고기', '수중', '상어', '해적', 'ocean', 'sea'], moods: ['바다', '물'] },
  { key: '우주', words: ['우주', '행성', '은하'], expand: ['우주', '행성', '로켓', '외계인', 'space'], moods: ['우주'] },
];
/** 찾을 말이 아니라 보여 주는 방법만 바꾸는 말 (말하듯 검색일 때만) */
const INTENT_WORDS: { words: string[]; intent: Intent; note: string }[] = [
  { words: ['긴', '길게', '긴영상', '오래', '몰아보기', '몰아서', '이동하면서', '이동중', '출퇴근', '기차', '버스', '비행기', '장거리', '정주행'], intent: { long: true }, note: '길게 볼 수 있는 것 먼저' },
  { words: ['짧은', '짧게', '잠깐', '쇼츠'], intent: { tab: 'shorts' }, note: '쇼츠에서' },
  { words: ['생방', '생방송', '라이브', '풀영상', '풀버전', '다시보기'], intent: { tab: 'live' }, note: '라이브에서' },
  { words: ['최근', '요즘', '최신', '새로', '새로운'], intent: { sort: 'desc' }, note: '최근 것부터' },
  { words: ['옛날', '예전', '초창기', '과거', '옛날방송', '추억'], intent: { sort: 'asc' }, note: '옛날 것부터' },
];
const intentOf = (w: string) => INTENT_WORDS.find((x) => x.words.some((y) => sq(y) === w));

/** 썸네일 분위기 태그로 고를 수 있는 말 (서버 썸네일 분석과 같은 목록) */
export const MOOD_TAGS = ['봄', '여름', '가을', '겨울', '크리스마스', '할로윈', '설날', '추석', '새해', '공포', '웃김', '힐링', '감동', '긴장감', '귀여움', '분노', '슬픔', '평화', '혼돈', '눈', '바다', '물', '숲', '사막', '우주', '도시', '학교', '밤', '비', '불', '산'];

const REQUEST_RE = /(추천|보여\s*(줘|주)|찾아\s*(줘|주)|알려\s*(줘|주)|볼\s*만한|보고\s*싶|땡기는|느낌|분위기|있(어|나요|을까)\s*[?？]?\s*$)/;
const REQUEST_PHRASES = /(추천\s*(해\s*)?(줘|주세요|줄래|해|좀|부탁)?|보여\s*(줘|주세요|줄래)|찾아\s*(줘|주세요|줄래)|알려\s*(줘|주세요|줄래)|볼\s*만한|보고\s*싶(어|은|다|네)?|같은\s*(거|것|영상)|있(어|나요|을까|니)\s*[?？]?)/g;
const STOP = new Set(['추천', '영상', '영상들', '동영상', '편집본', '거', '것', '좀', '뭐', '뭔가', '관련', '관련된', '나오는', '들어간', '느낌', '분위기', '해줘', '줘', '주세요', '콘텐츠', '컨텐츠', '같은', '그런', '이런', '좋은', '하나', '몇개', '몇', '게임', '방송']);
const TAIL = /(느낌의|느낌인|느낌|분위기의|분위기|같은|관련된|관련|스러운|스런)$/;
const ADJ_END = /(운|는|한|인|은|진|러운)$/;

/** 말하듯 쓴 검색어인지 (오타 보정을 건너뛰는 데 씀) */
export function isNaturalQuery(text: string): boolean {
  const t = String(text || '').trim();
  return REQUEST_RE.test(t) || /[?？]\s*$/.test(t)
    || t.split(/\s+/).some((w) => { const c = CONCEPTS.find((x) => x.words.some((y) => sq(y) === sq(w))); return Boolean(c && sq(w) !== sq(c.key) && ADJ_END.test(w)); });
}

/** 자연어 검색어에서 부탁하는 말 빼기 ("겨울 특집 추천해줘" → "겨울 특집") */
export function stripRequest(text: string): string {
  return text.replace(REQUEST_PHRASES, ' ').replace(/[?？!.,~]+/g, ' ').split(/\s+/)
    .map((t) => t.trim()).filter(Boolean)
    .map((t) => { const r = t.replace(TAIL, ''); return r.length ? r : t; })
    .filter((t) => !STOP.has(t))
    .join(' ');
}

export type Variant = { text: string; factor: number };
export type Group = { label: string; variants: Variant[]; moods: string[]; months: number[]; genres: string[]; avoid?: string[]; holidays?: string[]; concept?: string };
export type QueryPlan = {
  raw: string;
  /** 예전 방식으로 찾을 검색어 (자연어면 부탁하는 말을 뺀 것) */
  core: string;
  groups: Group[];
  /** 붙여서 제목에 있으면 맨 위로 (예: iq테스트) */
  phrase: string;
  natural: boolean;
  /** 보여 주는 방법 (라이브 탭으로, 긴 영상 먼저 등) */
  intent: Intent;
  /** 결과 위에 보여 줄 안내 (예: '배그' → 배틀그라운드 포함) */
  notes: string[];
};

const conceptOf = (word: string) => CONCEPTS.find((c) => c.words.some((w) => sq(w) === word) || sq(c.key) === word);

/** 한글·영어가 붙은 검색어 나누기, 사전에 있는 두 말로 나누기 */
function splitToken(tok: string, df: (t: string) => number): string[] {
  const parts = tok.match(/[0-9a-z]+|[가-힣ㄱ-ㅎㅏ-ㅣ]+/g) || [tok];
  const out: string[] = [];
  parts.forEach((p) => {
    if (!/^[가-힣]{4,}$/.test(p) || df(p) > 0 || conceptOf(p) || GAME_ALIASES[p]) { out.push(p); return; }
    // 붙여 쓴 한글: 두 말로 나눠서 둘 다 어딘가에 있는 쪽으로 (예: 겨울특집 → 겨울 + 특집)
    let best: [string, string] | null = null;
    let bestScore = 0;
    for (let i = 2; i <= p.length - 2; i++) {
      const a = p.slice(0, i), b = p.slice(i);
      const da = conceptOf(a) ? 50 : df(a), db = conceptOf(b) ? 50 : df(b);
      const s = Math.min(da, db);
      if (s > bestScore) { bestScore = s; best = [a, b]; }
    }
    if (best) out.push(...best); else out.push(p);
  });
  return out;
}

/**
 * 검색어 → 찾을 단어 묶음
 * df: 그 말이 들어간 영상 수 (중요도 계산용), aliases: 게임 줄임말 사전
 */
export function planQuery(raw: string, opts: SearchToggles, df: (t: string) => number, aliases: Record<string, string[]> = GAME_ALIASES,
  /** 하루 한 번 서버가 신고·만족도로 보강한 느낌별 말·뺄 장르 */
  conceptAdd: Record<string, { expand?: string[]; avoid?: string[] }> = {}): QueryPlan {
  const text = String(raw || '').trim();
  // 부탁하는 말이 있거나, '무서운'·'잔잔한' 처럼 느낌을 말하면 자연어로 봄
  const natural = opts.natural && isNaturalQuery(text);
  const stripped = natural ? stripRequest(text) : text;
  // 다 빼고 남은 게 없으면 원래 검색어 그대로
  const coreText = stripped || text;
  const notes: string[] = [];
  let tokens = coreText.split(/\s+/).map(sq).filter(Boolean);
  if (opts.smart) tokens = tokens.flatMap((t) => splitToken(t, df));
  tokens = [...new Set(tokens)];
  // 말하듯 검색: '긴'·'최근'·'라이브' 같은 말은 찾을 말에서 빼고 보여 주는 방법으로
  const intent: Intent = {};
  if (natural) {
    tokens = tokens.filter((t) => {
      const it = intentOf(t);
      if (!it) return true;
      Object.assign(intent, it.intent);
      notes.push(it.note);
      return false;
    });
  }

  const groups: Group[] = tokens.map((t) => {
    const g: Group = { label: t, variants: [{ text: t, factor: 1 }], moods: [], months: [], genres: [] };
    if (opts.alias) {
      const full = aliases[t];
      if (full?.length) {
        full.forEach((f) => g.variants.push({ text: sq(f), factor: 1 }));
        notes.push(`'${t}' → ${full.filter((f) => /[가-힣]/.test(f)).slice(0, 2).join(', ') || full[0]}`);
      }
    }
    const c = opts.natural ? conceptOf(t) : undefined;
    if (c) {
      g.concept = c.key;
      g.label = c.key;
      // 자연어로 물었으면 비슷한 말도 거의 같은 무게, 그냥 '겨울' 이라고만 쳤으면 비슷한 말은 아래쪽에
      c.expand.forEach((e) => { const s = sq(e); if (!g.variants.some((v) => v.text === s)) g.variants.push({ text: s, factor: natural ? 0.85 : 0.5 }); });
      if (sq(c.key) !== t && !g.variants.some((v) => v.text === sq(c.key))) g.variants.push({ text: sq(c.key), factor: natural ? 0.9 : 0.6 });
      g.moods = c.moods;
      g.months = c.months || [];
      g.genres = c.genres || [];
      const extra = conceptAdd[c.key];
      (extra?.expand || []).forEach((e) => { const t2 = sq(e); if (t2 && !g.variants.some((v) => v.text === t2)) g.variants.push({ text: t2, factor: natural ? 0.75 : 0.45 }); });
      g.avoid = [...(c.avoid || []), ...(extra?.avoid || [])];
      g.holidays = c.holidays;
      if (natural && c.intent) Object.entries(c.intent).forEach(([k, v]) => { if ((intent as any)[k] === undefined) (intent as any)[k] = v; });
    }
    g.variants = g.variants.filter((v) => v.text.length >= 1);
    return g;
  }).filter((g) => g.variants.length);

  // 자연어로 물었을 때 어디에도 없는 말(가는, 보는 …)은 빼고 찾기 (남는 게 있을 때만)
  if (natural) {
    const kept = groups.filter((g) => g.concept || g.variants.length > 1 || df(g.variants[0].text) > 0);
    if (kept.length) groups.splice(0, groups.length, ...kept);
  }

  if (natural) {
    const cs = groups.filter((g) => g.concept).map((g) => g.concept);
    if (cs.length) notes.unshift(`'${cs.join(' · ')}' 느낌으로 찾았어요 (비슷한 말·썸네일 분위기·방송한 계절까지)`);
  }
  if (natural && intent.tab === 'live') notes.push('라이브 탭에서 찾았어요');
  if (natural && intent.long && !notes.includes('길게 볼 수 있는 것 먼저')) notes.push('길게 볼 수 있는 것 먼저');
  // 찾을 말이 하나도 안 남으면(예: '긴 영상 추천해줘') 전체에서 보여 주는 방법만 적용
  const core = natural && !groups.length ? '' : coreText;
  return { raw: text, core, groups, phrase: tokens.length > 1 ? tokens.join('') : '', natural, intent, notes: [...new Set(notes)] };
}

// ── 영상 하나 점수 매기기 ──
export type SearchDoc = {
  /** 소문자 원문 (영어 단어 경계용) + 띄어쓰기 없는 것 */
  title: string; titleSq: string;
  games: string; gamesSq: string;
  extra: string; extraSq: string; // 연결된 쇼츠 제목
  meta: string; metaSq: string; // 썸네일 글자·키워드·태그
  desc: string; descSq: string;
  moods: string[];
  months: number[];
  dates: string[];
  genres: string[];
  /** 빨리 걸러내기용: 모든 칸을 붙인 것 */
  allSq: string;
};

export function makeDoc(p: { title?: string; games?: string[]; extra?: string[]; meta?: string[]; desc?: string; moods?: string[]; dates?: string[]; genres?: string[] }): SearchDoc {
  const low = (s: string) => String(s || '').toLowerCase().normalize('NFC');
  const title = low(p.title || ''), games = low((p.games || []).join(' | ')), extra = low((p.extra || []).join(' | ')), meta = low((p.meta || []).join(' | ')), desc = low(p.desc || '');
  return {
    title, titleSq: sq(title), games, gamesSq: sq(games), extra, extraSq: sq(extra), meta, metaSq: sq(meta), desc, descSq: sq(desc),
    moods: p.moods || [],
    months: [...new Set((p.dates || []).map((d) => Number(String(d).slice(5, 7))).filter(Boolean))],
    dates: (p.dates || []).map((d) => String(d).slice(0, 10)),
    genres: (p.genres || []).map(sq),
    allSq: sq(title) + '|' + sq(games) + '|' + sq(extra) + '|' + sq(meta) + '|' + sq(desc),
  };
}

/** 영어·숫자는 단어 단위로, 한글은 띄어쓰기 무시하고 포함 */
export function hasTerm(low: string, lowSq: string, term: string): boolean {
  if (!term) return false;
  // 짧은 한글(두 글자 이하)은 띄어쓰기를 넘어서 맞추지 않음 ('1가지 능력' 에서 '지능' 이 걸리지 않게)
  if (!isLatin(term)) return term.length <= 2 ? low.replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, '').includes(term) : lowSq.includes(term);
  let i = low.indexOf(term);
  while (i >= 0) {
    // 글자끼리·숫자끼리 이어지면 다른 단어 (iq ≠ unique, iq20 = iq + 20)
    const before = i > 0 ? low[i - 1] : ' ';
    const after = low[i + term.length] ?? ' ';
    const kind = (c: string) => (/[a-z]/.test(c) ? 'a' : /[0-9]/.test(c) ? 'n' : '');
    if ((kind(before) === '' || kind(before) !== kind(term[0])) && (kind(after) === '' || kind(after) !== kind(term[term.length - 1]))) return true;
    i = low.indexOf(term, i + 1);
  }
  return false;
}

const FIELD_W = { title: 1, games: 0.85, extra: 0.6, meta: 0.5, desc: 0.25 } as const;

/** 묶음 하나가 이 영상에서 얼마나 맞는지 (0~1) */
export function groupStrength(g: Group, d: SearchDoc): number {
  // 수면 방송에 공포·FPS 처럼 안 어울리는 장르는 빼기
  if (g.avoid?.length && d.genres.some((x) => g.avoid!.some((y) => sq(y) === x))) return 0;
  let s = 0;
  for (const v of g.variants) {
    if (s >= v.factor) continue;
    if (!d.allSq.includes(v.text)) continue; // 어디에도 없으면 칸마다 볼 필요 없음
    let f = 0;
    if (hasTerm(d.title, d.titleSq, v.text)) f = FIELD_W.title;
    else if (hasTerm(d.games, d.gamesSq, v.text)) f = FIELD_W.games;
    else if (hasTerm(d.extra, d.extraSq, v.text)) f = FIELD_W.extra;
    else if (hasTerm(d.meta, d.metaSq, v.text)) f = FIELD_W.meta;
    else if (v.text.length >= 2 && hasTerm(d.desc, d.descSq, v.text)) f = FIELD_W.desc;
    s = Math.max(s, f * v.factor);
  }
  if (g.moods.length && d.moods.some((m) => g.moods.includes(m))) s = Math.max(s, 0.55);
  if (g.genres.length) {
    // 맞는 장르가 많을수록 (예: 시뮬레이션 + 힐링 > 시뮬레이션만)
    const n = d.genres.filter((x) => g.genres.some((y) => sq(y) === x)).length;
    if (n) s = Math.max(s, Math.min(0.85, 0.45 + 0.2 * n));
  }
  // 설·추석 특집: 그 명절 연휴에 한 방송
  if (g.holidays?.length && d.dates.some((dt) => { const h = getKoreanHoliday(dt) || ''; return g.holidays!.some((x) => h.includes(x)); })) s = Math.max(s, 0.75);
  // 방송한 달은 다른 근거가 있을 때만 조금 더 (12월 방송이라고 다 겨울 영상은 아니니까)
  if (s > 0 && g.months.length && d.months.some((m) => g.months.includes(m))) s = Math.min(1, s + 0.12);
  return s;
}

export type DocScore = { rel: number; coverage: number; phrase: boolean };

/** 단어 중요도(드물수록 큼) */
export const idfOf = (df: number, n: number) => Math.log((n + 1) / (df + 1)) + 0.3;

/** 묶음별 중요도 */
// '테스트'·'게임'·'모음' 처럼 뭐든 붙는 말 (앞말을 꾸며 주는 쪽이 더 중요)
const GENERIC = new Set(['게임', '테스트', '모음', '특집', '영상', '미션', '편', '하이라이트', '레전드', '방송', '생방', '다시보기', '모드', '플레이', '공략', '리뷰', '챌린지', '대회', '시리즈', '버전']);
export function groupWeights(plan: QueryPlan, df: (t: string) => number, n: number): number[] {
  const last = plan.groups.length - 1;
  return plan.groups.map((g, i) => {
    // 줄임말·비슷한 말이 있는 묶음은 그중 가장 흔한 말 기준 (영상이 많은 쪽)
    const d = Math.max(...g.variants.filter((v) => v.factor >= 0.8).map((v) => df(v.text)), 0);
    let w = idfOf(d, n);
    if (last > 0 && !g.concept) {
      // 한국어는 뒷말이 '무엇'(테스트·게임), 앞말이 '어떤'(IQ·공포) → 앞말을 더 무겁게
      if (i === last) w *= 0.7;
      if (GENERIC.has(g.variants[0].text)) w *= 0.6;
    }
    return w;
  });
}

export function scoreDoc(plan: QueryPlan, weights: number[], d: SearchDoc): DocScore {
  if (!plan.groups.length) return { rel: 0, coverage: 0, phrase: false };
  let sum = 0, hit = 0, cov = 0;
  plan.groups.forEach((g, i) => {
    const s = groupStrength(g, d);
    sum += weights[i];
    hit += weights[i] * s;
    if (s > 0) cov += weights[i];
  });
  const phrase = Boolean(plan.phrase && plan.phrase.length >= 3 && (d.titleSq.includes(plan.phrase) || d.gamesSq.includes(plan.phrase)));
  return { rel: sum ? hit / sum : 0, coverage: sum ? cov / sum : 0, phrase };
}

/** 결과에 넣을지: 중요한 단어가 맞았는지 (흔한 단어 하나만 맞은 건 빼기) */
export function isHit(plan: QueryPlan, s: DocScore): boolean {
  if (s.phrase) return true;
  if (plan.groups.length <= 1) return s.rel >= 0.2;
  return s.coverage >= 0.5 && s.rel >= 0.3;
}

/** 짧은 글(쇼츠 제목 등) 하나가 검색어에 맞는지 */
export function textHits(plan: QueryPlan, weights: number[], text: string): boolean {
  if (!plan.groups.length) return false;
  return isHit(plan, scoreDoc(plan, weights, makeDoc({ title: text })));
}
