import type { KeyboardLayout } from './userPrefs';

/**
 * 구글처럼 너그러운 검색 도우미
 *  - squash: 띄어쓰기·기호 무시 ("3.0.만.원" == "30만원")
 *  - 자판 배열을 고려한 오타 보정 ("현강", "혀뇨ㅏㅇ", "현당" → "현상")
 *    쿼티(두벌식)는 옆 자판, 천지인·나랏글은 같은 키·획 추가로 생기는 실수를 가깝게 봄
 *  - 한/영 전환을 깜빡한 입력 ("gustkd" → "현상", "ㅡㅑㅜㄷㅊㄱㅁㄽㅅ" → "minecraft")
 *  - 아무렇게나 친 글자(키보드 막 치기) 알아보기
 */

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 겹글자 → 실제로 누르는 키 순서
const SPLIT: Record<string, string> = {
  'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ',
  'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ',
};

/** 띄어쓰기·기호를 모두 뺀 비교용 문자열 */
export const squash = (s: string) => String(s || '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');

/** 글자를 누른 키(자모) 순서로 */
export function toKeys(s: string): string[] {
  const out: string[] = [];
  for (const ch of squash(s)) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      const parts = [CHO[Math.floor(i / 588)], JUNG[Math.floor((i % 588) / 28)], JONG[i % 28]];
      parts.forEach((p) => { if (p) (SPLIT[p] || p).split('').forEach((k) => out.push(k)); });
    } else {
      (SPLIT[ch] || ch).split('').forEach((k) => out.push(k));
    }
  }
  return out;
}

// ── 두벌식 자판 위치 ──
const QWERTY_ROWS = [
  ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
  ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
  ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ'],
];
const LATIN_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const SHIFT_BASE: Record<string, string> = { 'ㅃ': 'ㅂ', 'ㅉ': 'ㅈ', 'ㄸ': 'ㄷ', 'ㄲ': 'ㄱ', 'ㅆ': 'ㅅ', 'ㅒ': 'ㅐ', 'ㅖ': 'ㅔ' };
const pos = new Map<string, [number, number]>();
QWERTY_ROWS.forEach((row, r) => row.forEach((k, c) => pos.set(k, [r, c + r * 0.4])));
LATIN_ROWS.forEach((row, r) => row.split('').forEach((k, c) => pos.set(k, [r, c + r * 0.4])));
const JAMO_TO_LATIN = new Map<string, string>();
const LATIN_TO_JAMO = new Map<string, string>();
QWERTY_ROWS.forEach((row, r) => row.forEach((k, c) => { JAMO_TO_LATIN.set(k, LATIN_ROWS[r][c]); LATIN_TO_JAMO.set(LATIN_ROWS[r][c], k); }));
Object.entries({ Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ' }).forEach(([l, j]) => { LATIN_TO_JAMO.set(l, j); JAMO_TO_LATIN.set(j, l.toLowerCase()); });

function qwertyCost(a: string, b: string) {
  const A = SHIFT_BASE[a] || a, B = SHIFT_BASE[b] || b;
  if (A === B) return 0.2; // 쌍자음·ㅒㅖ 는 Shift 실수
  const pa = pos.get(A), pb = pos.get(B);
  if (!pa || !pb) return 1;
  const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  return d <= 1.25 ? 0.4 : 1;
}

// ── 천지인: 같은 키에서 여러 번 눌러 바뀌는 자음, ㆍㅡㅣ 조합 모음 ──
const CJ_SAME = [['ㄱ', 'ㅋ', 'ㄲ'], ['ㄴ', 'ㄹ'], ['ㄷ', 'ㅌ', 'ㄸ'], ['ㅂ', 'ㅍ', 'ㅃ'], ['ㅅ', 'ㅎ', 'ㅆ'], ['ㅈ', 'ㅊ', 'ㅉ'], ['ㅇ', 'ㅁ']];
const CJ_KEYS: Record<string, [number, number]> = {
  'ㄱ': [1, 0], 'ㄴ': [1, 1], 'ㄷ': [1, 2], 'ㅂ': [2, 0], 'ㅅ': [2, 1], 'ㅈ': [2, 2], 'ㅇ': [3, 1],
};
// ── 나랏글: 획 추가·쌍자음 키로 만드는 자음 ──
const NR_SAME = [['ㄱ', 'ㅋ', 'ㄲ'], ['ㄴ', 'ㄷ', 'ㅌ', 'ㄸ'], ['ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'], ['ㅅ', 'ㅈ', 'ㅊ', 'ㅆ', 'ㅉ'], ['ㅇ', 'ㅎ'], ['ㄹ']];
// 두 자판 모두 모음을 조합해서 만들어 생기는 실수
const VOWEL_NEAR = [['ㅏ', 'ㅓ'], ['ㅗ', 'ㅜ'], ['ㅑ', 'ㅕ'], ['ㅛ', 'ㅠ'], ['ㅏ', 'ㅑ'], ['ㅓ', 'ㅕ'], ['ㅗ', 'ㅛ'], ['ㅜ', 'ㅠ'], ['ㅐ', 'ㅔ'], ['ㅒ', 'ㅖ'], ['ㅡ', 'ㅣ'], ['ㅐ', 'ㅒ'], ['ㅔ', 'ㅖ']];
const inGroup = (groups: string[][], a: string, b: string) => groups.some((g) => g.includes(a) && g.includes(b));
const groupKey = (groups: string[][], a: string) => groups.find((g) => g.includes(a))?.[0] || a;

function cheonjiinCost(a: string, b: string) {
  if (inGroup(CJ_SAME, a, b)) return 0.3;
  if (inGroup(VOWEL_NEAR, a, b)) return 0.4;
  const pa = CJ_KEYS[groupKey(CJ_SAME, a)], pb = CJ_KEYS[groupKey(CJ_SAME, b)];
  if (pa && pb && Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) === 1) return 0.6;
  return 1;
}
function naratgeulCost(a: string, b: string) {
  if (inGroup(NR_SAME, a, b)) return 0.35;
  if (inGroup(VOWEL_NEAR, a, b)) return 0.4;
  return 1;
}

// 같은 두 키의 비용은 늘 같아서 한 번 계산하면 기억해 둠 (검색할 때 수십만 번 불림)
const SUB_CACHE = new Map<string, Map<string, number>>();
export function substitutionCost(a: string, b: string, layout: KeyboardLayout) {
  if (a === b) return 0;
  const lk = `${layout}|${a}`;
  let row = SUB_CACHE.get(lk);
  if (!row) { row = new Map(); SUB_CACHE.set(lk, row); }
  let v = row.get(b);
  if (v === undefined) { v = rawSubstitutionCost(a, b, layout); row.set(b, v); }
  return v;
}
function rawSubstitutionCost(a: string, b: string, layout: KeyboardLayout) {
  // 소리가 같아 자주 헷갈리는 것
  if ((a === 'ㅐ' && b === 'ㅔ') || (a === 'ㅔ' && b === 'ㅐ')) return 0.3;
  switch (layout) {
    case 'qwerty':
    case 'danmoeum': return qwertyCost(a, b);
    case 'cheonjiin': return cheonjiinCost(a, b);
    case 'naratgeul': return naratgeulCost(a, b);
    default: return Math.min(qwertyCost(a, b), cheonjiinCost(a, b), naratgeulCost(a, b));
  }
}

/** 자판을 고려한 편집 거리 (키 단위, 이웃 바꿔치기 포함) */
export function keyDistance(a: string[], b: string[], layout: KeyboardLayout, limit = Infinity): number {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > limit) return Infinity;
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      // 같은 키를 두 번 누른 실수는 싸게
      const insCost = j > 1 && b[j - 1] === b[j - 2] ? 0.5 : 1;
      const delCost = i > 1 && a[i - 1] === a[i - 2] ? 0.5 : 1;
      let v = Math.min(
        prev[j] + delCost,
        cur[j - 1] + insCost,
        prev[j - 1] + substitutionCost(a[i - 1], b[j - 1], layout)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 0.6);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return Infinity;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

// ── 한/영 전환 ──
/** 영문으로 친 것을 두벌식 한글로 ("gustkd" → "현상") */
export function latinToHangul(s: string): string {
  const jamo: string[] = [];
  for (const ch of s) {
    const j = LATIN_TO_JAMO.get(ch) || LATIN_TO_JAMO.get(ch.toLowerCase());
    if (!j) return '';
    jamo.push(j);
  }
  return composeJamo(jamo);
}
/** 한글 자판 상태로 친 영어를 영문으로 ("ㅡㅑㅜㄷ" → "mine") */
export function hangulToLatin(s: string): string {
  return toKeys(s).map((k) => JAMO_TO_LATIN.get(k) || '').join('');
}

const VOWELS = new Set(['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ']);
const COMBINE_V: Record<string, string> = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const COMBINE_F: Record<string, string> = Object.fromEntries(Object.entries(SPLIT).filter(([k]) => JONG.includes(k)).map(([k, v]) => [v, k]));

/** 자모 나열을 글자로 조합 (두벌식 오토마타) */
export function composeJamo(keys: string[]): string {
  let out = '';
  let cho = '', jung = '', jong = '';
  const flush = () => {
    if (cho && jung) out += String.fromCharCode(0xac00 + CHO.indexOf(cho) * 588 + JUNG.indexOf(jung) * 28 + JONG.indexOf(jong));
    else out += cho + jung + jong;
    cho = jung = jong = '';
  };
  for (const k of keys) {
    if (VOWELS.has(k)) {
      if (cho && !jung) { jung = k; continue; }
      if (cho && jung && !jong && COMBINE_V[jung + k]) { jung = COMBINE_V[jung + k]; continue; }
      if (jong) {
        // 받침이 다음 글자 첫소리로
        const sp = SPLIT[jong];
        let carry = jong;
        if (sp) { jong = sp[0]; carry = sp[1]; } else jong = '';
        flush();
        cho = carry; jung = k;
        continue;
      }
      flush();
      out += k; // 홀로 쓴 모음
      continue;
    }
    if (!CHO.includes(k) && !JONG.includes(k)) { flush(); out += k; continue; }
    if (cho && jung && !jong && JONG.includes(k)) { jong = k; continue; }
    if (cho && jung && jong && COMBINE_F[jong + k]) { jong = COMBINE_F[jong + k]; continue; }
    flush();
    cho = k;
  }
  flush();
  return out;
}

// ── 막 친 글자 알아보기 ──
const RARE_MEDIAL = new Set(['ㅑ', 'ㅕ', 'ㅛ', 'ㅠ', 'ㅒ', 'ㅖ', 'ㅞ', 'ㅙ']);
const RARE_FINAL = new Set(['ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㄲ', 'ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ']);
/** 0~1, 클수록 아무렇게나 친 글자 같음 */
export function keysmashScore(s: string): number {
  // 대문자 줄임말(CCTV, FPS)은 제외
  if (/^[A-Z0-9]{2,6}$/.test(String(s || '').trim())) return 0;
  // 웃음·감탄(ㅋㅋ, ㅎㅎ, ㅠㅠ, ㄷㄷ)과 짧은 초성 줄임말(ㅁㅊ, ㄹㅇ, ㅎㄷㄷ)은 빼고 판단
  const t = squash(s)
    .replace(/[ㅋㅎㅠㅜㄷ]{2,}/g, '')
    .replace(/(^|[^ㄱ-ㅎㅏ-ㅣ])[ㄱ-ㅎ]{1,3}(?=[^ㄱ-ㅎㅏ-ㅣ]|$)/g, '$1');
  if (t.length < 4) return 0;
  // ㅋㅋㅋㅋ, ㅠㅠㅠ, ㄷㄷㄷ 처럼 같은 글자 반복은 웃음·감탄이지 막 친 글자가 아님
  if (new Set(t).size <= 2) return 0;
  if (/^(ㅋ|ㅎ|ㅠ|ㅜ|ㄷ|ㅇ|ㄱ|ㅅ|ㅂ|ㅈ|ㅡ|;|\.)+$/.test(t)) return 0;
  let odd = 0;
  let prev = '';
  for (const ch of t) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      if (RARE_MEDIAL.has(JUNG[Math.floor((i % 588) / 28)])) odd += 0.6;
      if (RARE_FINAL.has(JONG[i % 28])) odd += 0.8;
    } else if (/[ㄱ-ㅎㅏ-ㅣ]/.test(ch)) {
      odd += 1; // 낱자
    } else if (/[a-z]/.test(ch)) {
      // 영문은 모음이 거의 없거나 자판 한 줄을 훑은 경우
      if (!/[aeiouy]/.test(ch) && prev && !/[aeiouy]/.test(prev)) odd += 0.5;
    }
    if (ch === prev) odd += 0.4;
    prev = ch;
  }
  // 'asdf', 'qwer' 처럼 자판을 훑은 문자열
  if (/(asdf|sdfg|qwer|wert|zxcv|jkl;|hjkl|ㅁㄴㅇㄹ|ㅂㅈㄷㄱ)/.test(t)) odd += 2;
  return Math.min(1, odd / t.length);
}
export const isKeysmash = (s: string) => keysmashScore(s) >= 0.42;

// ── 어휘 사전 ──
export type Vocab = { words: { text: string; key: string; keys: string[]; freq: number }[]; corpus: string };

const TOKEN_SPLIT = /[\s,./|·:;!?'"“”‘’()[\]{}<>~\-_+=#@&*^%$]+/;

export function buildVocab(texts: string[]): Vocab {
  const freq = new Map<string, { text: string; freq: number }>();
  const add = (w: string) => {
    const key = squash(w);
    if (key.length < 2 || key.length > 20 || /^\d+$/.test(key)) return;
    const prev = freq.get(key);
    if (prev) prev.freq += 1; else freq.set(key, { text: w.trim(), freq: 1 });
  };
  const corpusParts: string[] = [];
  texts.forEach((t) => {
    if (!t) return;
    corpusParts.push(squash(t));
    const tokens = t.split(TOKEN_SPLIT).filter(Boolean);
    tokens.forEach(add);
    // 두 단어 묶음도 (예: "범죄현장 청소")
    for (let i = 0; i + 1 < tokens.length; i++) add(`${tokens[i]} ${tokens[i + 1]}`);
  });
  return {
    words: [...freq.entries()].map(([key, v]) => ({ text: v.text, key, keys: toKeys(key), freq: v.freq })),
    corpus: `\u0001${corpusParts.join('\u0001')}\u0001`,
  };
}

/** 단어 하나의 가장 가까운 사전 단어 (같은 사전·자판이면 기억해 둠: 글자를 이어 칠 때 앞 단어는 다시 계산 안 함) */
type Nearest = { text: string; d: number; freq: number } | null;
const NEAREST_CACHE = new WeakMap<Vocab, Map<string, Nearest>>();
const BY_LEN = new WeakMap<Vocab, Map<number, Vocab['words']>>();
function nearestWord(t: string, k: string[], vocab: Vocab, layout: KeyboardLayout): Nearest {
  let cache = NEAREST_CACHE.get(vocab);
  if (!cache) { cache = new Map(); NEAREST_CACHE.set(vocab, cache); }
  const ck = `${layout}|${t}`;
  if (cache.has(ck)) return cache.get(ck)!;
  let byLen = BY_LEN.get(vocab);
  if (!byLen) {
    byLen = new Map();
    vocab.words.forEach((w) => { const arr = byLen!.get(w.keys.length) || []; arr.push(w); byLen!.set(w.keys.length, arr); });
    BY_LEN.set(vocab, byLen);
  }
  const limit = Math.max(1, k.length * 0.34);
  let bestW: Nearest = null;
  for (let len = Math.ceil(k.length - limit); len <= Math.floor(k.length + limit); len++) {
    for (const w of byLen.get(len) || []) {
      const d = keyDistance(k, w.keys, layout, bestW ? Math.min(limit, bestW.d + 1e-6) : limit);
      if (d > limit) continue;
      if (!bestW || d < bestW.d - 1e-6 || (Math.abs(d - bestW.d) < 1e-6 && w.freq > bestW.freq)) bestW = { text: w.text, d, freq: w.freq };
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(ck, bestW);
  return bestW;
}

export type Correction = { from: string; to: string; how: 'typo' | 'hanyeong'; cost: number };

/**
 * 검색어 고치기: 단어마다 사전에 없으면 가장 가까운 단어로 (자판 고려). 고칠 게 없으면 null
 */
export function correctQuery(query: string, vocab: Vocab, layout: KeyboardLayout): Correction | null {
  const raw = query.trim();
  if (!raw || raw.length > 40) return null;
  const known = (w: string) => { const k = squash(w); return k.length > 0 && vocab.corpus.includes(k); };
  if (known(raw)) return null;

  // 1) 한/영 전환 실수 (통째로)
  if (/^[a-zA-Z\s]+$/.test(raw)) {
    const h = raw.split(/\s+/).map(latinToHangul).join(' ');
    if (h && known(h)) return { from: raw, to: h, how: 'hanyeong', cost: 0 };
  } else if (/^[ㄱ-ㅎㅏ-ㅣ가-힣\s]+$/.test(raw)) {
    const l = raw.split(/\s+/).map(hangulToLatin).join(' ');
    if (l && known(l)) return { from: raw, to: l, how: 'hanyeong', cost: 0 };
  }

  // 2) 단어별 오타 보정 (띄어쓰기를 안 했을 수도 있으니 통째로도 한 번)
  const tokens = raw.split(/\s+/).filter(Boolean);
  // 단어마다 다 있는 말이면 고치지 않음 (예: "배틀 치킨" → 단어별로 찾기)
  if (tokens.every((t) => known(t) || squash(t).length < 2)) return null;
  // 띄어쓰기 없이 붙여 보는 건 짧은 검색어만 (사전 단어는 20글자까지라 긴 문장은 어차피 안 맞음)
  const candidates = tokens.length > 1 && tokens.length <= 3 && squash(tokens.join('')).length <= 20 ? [tokens, [tokens.join('')]] : [tokens];
  let best: { text: string; cost: number } | null = null;
  for (const toks of candidates) {
    let total = 0;
    let changed = false;
    const fixed: string[] = [];
    for (const t of toks) {
      if (known(t) || squash(t).length < 2) { fixed.push(t); continue; }
      const k = toKeys(t);
      const bestW = nearestWord(t, k, vocab, layout);
      if (!bestW) { total = Infinity; break; }
      fixed.push(bestW.text);
      total += bestW.d / k.length;
      changed = true;
    }
    if (!changed || total === Infinity) continue;
    const text = fixed.join(' ');
    if (!best || total < best.cost) best = { text, cost: total };
  }
  if (best && squash(best.text) !== squash(raw)) return { from: raw, to: best.text, how: 'typo', cost: best.cost };
  return null;
}
