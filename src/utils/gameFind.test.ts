import { describe, expect, it } from 'vitest';
import { findGames, keywordForGame, keywordLabel, chosungOf } from './gameFind';
import { matchesLiveKeywords } from '../../api/_push';

const names = ['배틀그라운드', '마인크래프트', '휴먼 폴 플랫 (Human Fall Flat)', '리썰 컴퍼니'];

describe('알림 게임 찾기', () => {
  it('그대로·초성·줄임말', () => {
    expect(findGames('마인', names, {})[0].name).toBe('마인크래프트');
    expect(findGames('ㅁㅇㅋㄹㅍㅌ', names, {})[0].name).toBe('마인크래프트');
    expect(findGames('배그', names, {}).map((x) => x.name)).toContain('배틀그라운드');
    expect(findGames('휴폴플', names, {}).map((x) => x.name)).toContain('휴먼 폴 플랫 (Human Fall Flat)');
  });
  it('설정을 끄면 그 보정은 안 함', () => {
    expect(findGames('ㅁㅇㅋㄹㅍㅌ', names, { searchChosung: false })).toHaveLength(0);
    expect(findGames('배그', names, { searchAlias: false })).toHaveLength(0);
  });
  it('한/영', () => {
    expect(findGames('akdlszmfovmxm', names, {})[0]?.name).toBe('마인크래프트');
  });
  it('알림 키워드: 다른 이름 묶음', () => {
    const k = keywordForGame('휴먼 폴 플랫 (Human Fall Flat)');
    expect(k).toBe('휴먼 폴 플랫|Human Fall Flat');
    expect(keywordLabel(k)).toBe('휴먼 폴 플랫');
    expect(matchesLiveKeywords([k], '오늘은', 'Human Fall Flat')).toBe(true);
    expect(matchesLiveKeywords([k], '오늘은', '마인크래프트')).toBe(false);
    expect(chosungOf('마인')).toBe('ㅁㅇ');
  });
});

import { makeMatcher } from './textMatch';
describe('다른 검색창 글자 보정', () => {
  it('설정 따라 초성·한/영·줄임말', () => {
    const m = makeMatcher('ㅁㅇㅋ', {});
    expect(m('마인크래프트 같이 하기')).toBe(true);
    expect(makeMatcher('ㅁㅇㅋ', { searchChosung: false })('마인크래프트')).toBe(false);
    expect(makeMatcher('akdls', {})('마인크래프트')).toBe(true);
    expect(makeMatcher('akdls', { searchTypo: false })('마인크래프트')).toBe(false);
    expect(makeMatcher('배그', {})('배틀그라운드 솔로')).toBe(true);
    expect(makeMatcher('배그 솔로', {})('배틀그라운드 듀오')).toBe(false);
  });
});
