/**
 * 조사 고르기 (을/를 · 은/는 · 이/가 · 과/와 · 으로/로 · 이에요/예요)
 * 단어의 마지막 소리에 받침이 있는지로 정함
 *  - 한글: 마지막 글자의 받침 (ㄹ 받침은 '로')
 *  - 숫자: 한국어로 읽은 마지막 소리 (1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 · 0 영 · 10 십 · 100 백 · 1000 천 …)
 *  - 영어: 국립국어원 외래어 표기법으로 적었을 때의 끝소리를 어림
 *      · 짧은 모음 뒤 p/t/k → 받침 (book 북, cat 캣, top 톱)
 *      · l → ㄹ 받침 (apple 애플), m/n/ng → 받침 (game 게임, plane 플레인, king 킹)
 *      · b/d/g/f/v/s/z/x/ch/sh/th/j/ge → '으/이'로 끝나서 받침 없음 (cake 케이크, bus 버스)
 *      · 모음·y·w·r 로 끝나면 받침 없음 (player 플레이어, data 데이터)
 *      · 한 글자씩 읽는 약자(대문자 3자 이하)는 알파벳 이름의 끝소리 (PC 피시, XL 엑스엘, LOL 엘오엘)
 *  - 일본어 가나: ん·ン → 받침, 나머지는 없음
 *  - 괄호·기호로 끝나면 그 앞 글자로
 */

type Pair = '을/를' | '은/는' | '이/가' | '과/와' | '으로/로' | '이에요/예요' | '이나/나' | '이랑/랑';

/** 알파벳 이름 끝소리: 받침 있음(true) / ㄹ 받침('l') / 없음(false) */
const LETTER: Record<string, boolean | 'l'> = {
  a: false, b: false, c: false, d: false, e: false, f: false, g: false, h: false, i: false, j: false, k: false,
  l: 'l', m: true, n: true, o: false, p: false, q: false, r: 'l', s: false, t: false, u: false, v: false, w: false, x: false, y: false, z: false,
};

/** 숫자 마지막 읽는 소리 */
function numberEnd(n: string): boolean | 'l' {
  const digits = n.replace(/^0+(?=\d)/, '');
  const last = digits[digits.length - 1];
  if (last !== '0' || digits === '0') return ({ '0': true, '1': 'l', '2': false, '3': true, '4': false, '5': false, '6': true, '7': 'l', '8': 'l', '9': false } as Record<string, boolean | 'l'>)[last];
  // 0으로 끝나는 큰 수: 십 백 천 만 억
  const zeros = (digits.match(/0+$/) || [''])[0].length;
  if (zeros >= 8) return true; // 억
  if (zeros >= 4) return true; // 만
  if (zeros === 3) return true; // 천
  if (zeros === 2) return true; // 백
  return true; // 십
}

function englishEnd(word: string): boolean | 'l' {
  const w = word.toLowerCase();
  // 약자: 대문자 3자 이하 (PC, XL, LOL) → 알파벳 이름으로 읽음
  if (/^[A-Z]{2,3}$/.test(word)) return LETTER[w[w.length - 1]] ?? false;
  if (w.length === 1) return LETTER[w] ?? false;
  const last = w[w.length - 1];
  const prev = w[w.length - 2] || '';
  const prev2 = w[w.length - 3] || '';
  const vowel = (c: string) => /[aeiou]/.test(c);
  if (/ng$/.test(w)) return true;
  if (/(ge|ce|se|ze|ve|the|che|she|ke|te|pe|de|be|fe)$/.test(w)) {
    // 끝 e 를 읽지 않음: 앞 자음이 위 목록이면 '으'로 끝남 (cake 케이크, page 페이지)
    return false;
  }
  if (last === 'e') {
    if (prev === 'l') return 'l'; // apple 애플, title 타이틀
    if (prev === 'm' || prev === 'n') return true; // game 게임, plane 플레인
    if (prev === 'r') return false; // fire 파이어
    return false; // 그 밖에 e (cafe 카페 · free 프리)
  }
  if (last === 'l') return 'l';
  if (last === 'm' || last === 'n') return true;
  if (/[ptk]/.test(last) || /ck$/.test(w)) {
    // 짧은 모음(모음 한 글자) 뒤의 p t k → 받침 (cat 캣, book 북 은 oo 라도 짧게)
    if (/ck$/.test(w)) return true;
    if (vowel(prev) && !vowel(prev2)) return true;
    if (/oo$/.test(w.slice(0, -1))) return true; // book, look
    return false; // cake 류는 위에서 · street 스트리트
  }
  if (last === 'r') return /[aeiou]r$/.test(w) ? false : 'l'; // player 플레이어 / (드물게) r 로 끝나는 자음 뒤
  if (last === 'y' || last === 'w' || vowel(last)) return false;
  return false; // b d g f v s z x h j q
}

/** 단어의 끝소리: true 받침 · 'l' ㄹ 받침 · false 받침 없음 */
export function finalSound(word: string): boolean | 'l' {
  // 끝의 (설명)·[설명] 은 빼고 그 앞 말로 (예: '후르츠 박스 (사과게임)' → '박스'), 그다음 끝 기호 정리
  const s = String(word || '').trim().replace(/(\s*[(\[][^()[\]]*[)\]])+$/, '').replace(/[\s)\]}>"'’”.,!?~·…:;/\\-]+$/, '');
  if (!s) return false;
  const ch = s[s.length - 1];
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return false;
    return jong === 8 ? 'l' : true;
  }
  if (/\d/.test(ch)) return numberEnd((s.match(/\d+$/) || ['0'])[0]);
  if (/[a-zA-Z]/.test(ch)) {
    const w = (s.match(/[A-Za-z]+$/) || [''])[0];
    return englishEnd(w);
  }
  if (/[んン]/.test(ch)) return true;
  if (/[ぁ-ゖァ-ヺー]/.test(ch)) return false;
  return false;
}

/** 단어 + 알맞은 조사 */
export function josa(word: string, pair: Pair): string {
  const f = finalSound(word);
  const [withBatchim, without] = pair.split('/');
  if (pair === '으로/로') return word + (f === true ? '으로' : '로'); // ㄹ 받침은 '로'
  return word + (f ? withBatchim : without);
}
