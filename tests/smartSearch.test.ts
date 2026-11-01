import { describe, it, expect } from 'vitest';
import { buildVocab, correctQuery, keysmashScore, isKeysmash, latinToHangul, hangulToLatin, squash, toKeys, composeJamo } from '../src/utils/smartSearch';

const vocab = buildVocab([
  '기묘한 현상 발견', '현장 체험 브이로그', '현금 30만원 미션', '마인크래프트 minecraft 건축',
  '배틀그라운드 치킨', '3.0.만.원 미션', '도서관 정리', '배달하는 게임',
]);

describe('글자 다루기', () => {
  it('띄어쓰기·기호를 무시한다', () => {
    expect(squash('3.0.만.원')).toBe('30만원');
    expect(squash(' Cyberpunk 2077! ')).toBe('cyberpunk2077');
  });
  it('글자를 누른 키 순서로 푼다 (겹모음·겹받침 포함)', () => {
    expect(toKeys('현상').join('')).toBe('ㅎㅕㄴㅅㅏㅇ');
    expect(toKeys('괜').join('')).toBe('ㄱㅗㅐㄴ');
    expect(toKeys('닭').join('')).toBe('ㄷㅏㄹㄱ');
  });
  it('자모를 다시 글자로 조합한다', () => {
    expect(composeJamo(['ㅎ', 'ㅕ', 'ㄴ', 'ㅅ', 'ㅏ', 'ㅇ'])).toBe('현상');
    expect(composeJamo(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ', 'ㅣ'])).toBe('달기');
    expect(composeJamo(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ', 'ㅇ', 'ㅣ'])).toBe('닭이');
  });
  it('한/영 전환을 깜빡한 입력을 되돌린다', () => {
    expect(latinToHangul('gustkd')).toBe('현상');
    expect(hangulToLatin('ㅡㅑㅜㄷㅊㄱㅁㄹㅅ')).toBe('minecraft');
  });
});

describe('오타 보정', () => {
  it.each([
    ['현강', '현상'], ['혀뇨ㅏㅇ', '현상'], ['배틀그라운두', '배틀그라운드'], ['뱌틀그라운드', '배틀그라운드'], ['도셔관', '도서관'],
  ])('%s → %s', (q, want) => {
    expect(correctQuery(q, vocab, 'qwerty')?.to).toBe(want);
  });
  it('한/영 전환 실수는 바로 고친다', () => {
    const c = correctQuery('gustkd', vocab, 'unknown');
    expect(c?.to).toBe('현상');
    expect(c?.how).toBe('hanyeong');
  });
  it('있는 말은 고치지 않는다', () => {
    expect(correctQuery('현상', vocab, 'qwerty')).toBeNull();
    expect(correctQuery('30만원', vocab, 'qwerty')).toBeNull();
  });
  it('단어마다 있는 말이면 엉뚱하게 고치지 않는다 (배틀 치킨 ≠ 배달하는)', () => {
    expect(correctQuery('배틀 치킨', vocab, 'unknown')).toBeNull();
  });
});

describe('막 친 글자', () => {
  it('키보드를 막 친 글자를 알아본다', () => {
    expect(isKeysmash('ㅁㄴㅇㄹㄹㄴ')).toBe(true);
    expect(isKeysmash('asdfjkl')).toBe(true);
    expect(isKeysmash('QQQWECASDZXCGHHHHtlqkf')).toBe(true);
  });
  it('웃음·줄임말·약자·보통 제목은 아니다', () => {
    for (const t of ['ㅋㅋㅋㅋㅋ', 'ㅠㅠㅠㅠ', '시뮬레이터ㅋㅋㅋㅋ', 'CCTV', '배틀그라운드 치킨', '기묘한 현상 발견', '퓨쳐 스튜디오']) {
      expect(isKeysmash(t), t).toBe(false);
    }
    expect(keysmashScore('쇼츠')).toBe(0);
  });
});
