/**
 * AI 요약 말투 맞추기: '~한다', '~합니다', '~함' 처럼 섞여 나오는 문장 끝을 사이트 말투(~해요)로
 * - 문장 끝(마침표·느낌표·물음표·줄 끝 앞)만 바꿈. 확실한 꼴만 바꾸고 애매하면 그대로 둠
 */
const BASE = 0xac00;
const isHangul = (c: string) => { const n = c.charCodeAt(0) - BASE; return n >= 0 && n < 11172; };
const split = (c: string) => { const n = c.charCodeAt(0) - BASE; return { i: Math.floor(n / 588), v: Math.floor((n % 588) / 28), f: n % 28 }; };
const join = (i: number, v: number, f = 0) => String.fromCharCode(BASE + i * 588 + v * 28 + f);
// 모음 번호: ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅓ4 ㅔ5 ㅕ6 ㅖ7 ㅗ8 ㅘ9 ㅙ10 ㅚ11 ㅛ12 ㅜ13 ㅝ14 ㅞ15 ㅟ16 ㅠ17 ㅡ18 ㅢ19 ㅣ20
// 받침 번호: ㄴ4 ㅁ16 ㅂ17 ㅄ18 ㅆ20
const F = { N: 4, M: 16, B: 17, BS: 18, SS: 20 };

/** 받침 없는 동사 어간 한 글자 + 요 (가→가요, 보→봐요, 주→줘요, 지→져요, 하→해요, 되→돼요) */
function openStem(c: string): string | null {
  if (c === '하') return '해요';
  if (c === '되') return '돼요';
  const { i, v } = split(c);
  const to: Record<number, number> = { 8: 9, 13: 14, 20: 6, 18: 4 }; // ㅗ→ㅘ ㅜ→ㅝ ㅣ→ㅕ ㅡ→ㅓ
  if (to[v] != null) return `${join(i, to[v])}요`;
  if ([0, 1, 4, 5, 6].includes(v)) return `${c}요`; // 가 내 서 세 켜
  if (v === 16 || v === 19) return `${c}어요`; // 쉬 → 쉬어요
  return null;
}
/** 받침 없는 어간의 지난 일 (보→봤어요, 가→갔어요, 채→챘어요, 하→했어요) */
function openPast(c: string): string | null {
  if (c === '하') return '했어요';
  if (c === '되') return '됐어요';
  const { i, v } = split(c);
  if (i === 5 && v === 18) return null; // 르 (지름 → 질렀어요) 는 꼴이 달라 그대로
  const to: Record<number, number> = { 8: 9, 13: 14, 20: 6, 18: 4 };
  const nv = to[v] ?? ([0, 1, 4, 5, 6].includes(v) ? v : -1);
  return nv < 0 ? null : `${join(i, nv, F.SS)}어요`;
}
// 'ㅁ'으로 끝나도 명사인 말 (바꾸지 않음)
const NOUN_M = new Set(['게임', '마음', '그림', '이름', '처음', '다음', '기쁨', '슬픔', '웃음', '울음', '꿈', '몸', '밤', '잠', '힘', '춤', '짐', '점', '참', '삶', '앎', '사람', '시점', '장면', '마지막', '느낌', '고음', '저음', '소음', '하이햄', '아이템']);

/** 받침 있는 어간 + 아요/어요 (먹→먹어요, 찾→찾아요) */
const closedStem = (c: string) => `${c}${[0, 8].includes(split(c).v) ? '아요' : '어요'}`;

function convertEnd(word: string): string | null {
  const w = word;
  const last = (n: number) => w.slice(-n);
  const before = (n: number) => w.slice(0, -n);
  const prev = (n: number) => w.charAt(w.length - n - 1);
  // ~습니다 / ~ㅂ니다
  if (last(3) === '습니다' && w.length > 3) {
    const p = prev(3);
    if (!isHangul(p)) return null;
    const { f } = split(p);
    if (f === F.SS) return `${before(3)}어요`; // 했습니다 → 했어요
    return `${before(4)}${closedStem(p)}`; // 좋습니다 → 좋아요, 없습니다 → 없어요
  }
  if (last(2) === '니다' && w.length > 2) {
    const p = prev(2);
    if (!isHangul(p) || split(p).f !== F.B) return null;
    const { i, v } = split(p);
    const open = join(i, v);
    if (open === '이') { const q = prev(3); if (!q || !isHangul(q)) return null; return `${before(3)}${split(q).f ? '이에요' : '예요'}`; }
    const r = openStem(open);
    return r ? `${before(3)}${r}` : null;
  }
  // ~음 / ~함 / ~됨 (보고서 말투)
  if (last(1) === '함' && w.length >= 1) return `${before(1)}해요`;
  if (last(1) === '됨') return `${before(1)}돼요`;
  // ~봄 / ~돌아감 / ~알아챔 (받침 ㅁ 으로 끝낸 말) → ~했어요 (명사는 그대로, 한 글자는 앞에 '을/를' 이 있을 때만: 호출하는 쪽에서 확인)
  if (w.length >= 1 && !NOUN_M.has(w) && last(1) !== '음' && last(1) !== '함' && isHangul(last(1)) && split(last(1)).f === F.M) {
    const { i, v } = split(last(1));
    const r = openPast(join(i, v));
    if (r) return `${before(1)}${r}`;
  }
  if (last(1) === '음' && w.length > 1) {
    const p = prev(1);
    if (isHangul(p) && split(p).f === F.SS) return `${before(1)}어요`; // 했음 → 했어요
    if (p === '없') return `${before(1)}어요`;
    return null;
  }
  // ~다
  if (last(1) !== '다' || w.length < 2) return null;
  const p = prev(1);
  if (!isHangul(p)) return null;
  const { i, v, f } = split(p);
  if (f === F.SS) return `${before(1)}어요`; // 했다 → 했어요, 있다 → 있어요
  if (p === '없') return `${before(1)}어요`;
  if (p === '는' && w.length >= 3) { const s = prev(2); return isHangul(s) && split(s).f ? `${before(3)}${closedStem(s)}` : null; } // 먹는다 → 먹어요
  if (p === '이' && w.length >= 3) { const s = prev(2); return isHangul(s) ? `${before(2)}${split(s).f ? '이에요' : '예요'}` : null; } // 게임이다 → 게임이에요
  if (f === F.N) { const r = openStem(join(i, v)); return r ? `${before(2)}${r}` : null; } // 한다 → 해요, 간다 → 가요
  return null;
}

/** 문장 끝 말투를 ~해요 로 */
export function politeKo(text: string): string {
  if (!text) return text;
  return String(text).replace(/([가-힣]+)(?=[.!?…~)"'」』]*(?:\s|$))/g, (m, word: string, off: number, all: string) => {
    // 문장 끝인지: 뒤에 마침표류가 오거나 글 끝·줄 끝
    const rest = all.slice(off + m.length);
    if (!/^[.!?…~)"'」』]*(\n|$)/.test(rest) && !/^[.!?…]/.test(rest)) return m;
    // 한 글자 'ㅁ' 말(봄·감)은 앞에 '을/를' 이 붙은 말이 있을 때만
    if (word.length === 1 && isHangul(word) && split(word).f === F.M && !/[을를]\s+$/.test(all.slice(0, off))) return m;
    if (/[가-힣]$/.test(all.slice(0, off))) return m; // 단어 중간부터 잡힌 경우
    return convertEnd(word) ?? m;
  });
}
