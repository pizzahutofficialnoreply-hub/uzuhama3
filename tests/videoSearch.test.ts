import { describe, it, expect } from 'vitest';
import { isDateQuery, titleMatches, titleHasHashtag } from '../src/utils/videoSearch';
import { fuzzyDateMatch } from '../src/utils';
import { matchTag, matchRelated, gamesMatchingKeyword } from '../src/hooks/useSearchIndex';

describe('날짜 검색', () => {
  it.each(['2024', '5월', '5월 12일', '5/12', '05.12', '24년 5월', '2024년 5월 12일', '2024.05.12', '2024-05'])('%s 는 날짜 검색', (q) => {
    expect(isDateQuery(q)).toBe(true);
  });
  it.each(['배틀그라운드', '2077 사이버펑크', '30만원'])('%s 는 날짜 검색이 아님', (q) => {
    expect(isDateQuery(q)).toBe(false);
  });
  it('여러 날짜 표현이 같은 날을 찾는다', () => {
    expect(fuzzyDateMatch('5월 12일', '2024-05-12')).toBe(true);
    expect(fuzzyDateMatch('5/12', '2024-05-12')).toBe(true);
    expect(fuzzyDateMatch('0512', '2024-05-12')).toBe(true);
    expect(fuzzyDateMatch('2024', '2024-05-12')).toBe(true);
    expect(fuzzyDateMatch('24년 5월', '2024-05-12')).toBe(true);
    expect(fuzzyDateMatch('6월', '2024-05-12')).toBe(false);
  });
});

describe('제목 찾기', () => {
  it('띄어쓰기·기호를 무시하고 여러 단어는 순서 상관없이', () => {
    expect(titleMatches('30만원', '킬당 3.0.만.원 미션')).toBe(true);
    expect(titleMatches('치킨 배틀', '배틀그라운드 치킨 먹기')).toBe(true);
    expect(titleMatches('치킨 피자', '배틀그라운드 치킨 먹기')).toBe(false);
    expect(titleMatches('a', 'abc')).toBe(false);
  });
  it('제목 속 #해시태그', () => {
    expect(titleHasHashtag('엉덩이#shorts', '#shorts')).toBe(true);
    expect(titleHasHashtag('엉덩이 #Shorts', 'shorts')).toBe(true);
    expect(titleHasHashtag('엉덩이 shorts', 'shorts')).toBe(false);
  });
});

describe('태그·썸네일·게임 키워드 색인', () => {
  const entry = { g: ['배틀그라운드', '우주하마', '#shorts'], t: '히말라야 등반 | 범죄현장 청소', k: ['산', '청소'], d: '오늘의 방송' };
  it('# 태그: 같은 태그 / 일부만 같은 태그', () => {
    expect(matchTag(entry, '배틀그라운드')).toBe('exact');
    expect(matchTag(entry, 'shorts')).toBe('exact');
    expect(matchTag(entry, '배틀')).toBe('partial');
    expect(matchTag(entry, '롤')).toBeNull();
  });
  it('썸네일 글자 덩어리를 따로도, 같이도 찾는다', () => {
    expect(matchRelated(entry, '범죄현장')).toBe('썸네일');
    expect(matchRelated(entry, '히말라야 청소')).toBe('썸네일');
    expect(matchRelated(entry, '전혀없는말')).toBeNull();
  });
  it('게임 한국어 키워드 (도서관 → Librarian)', () => {
    const games = { 'Librarian: Tidy Up the Arcane Library!': ['도서관', '사서'], '배틀그라운드': ['배그'] };
    expect([...gamesMatchingKeyword(games, '도서관')]).toEqual(['librariantidyupthearcanelibrary']);
    expect(gamesMatchingKeyword(games, '없음').size).toBe(0);
  });
});

import { cleanShortsTitle } from '../src/utils/videoSearch';
describe('쇼츠 제목 태그 정리', () => {
  it('쇼츠 표시 태그만 뗌', () => {
    expect(cleanShortsTitle('돈이 없지 할 게 없냐#shorts')).toBe('돈이 없지 할 게 없냐');
    expect(cleanShortsTitle('테토남 챗지피티 #shorts #chatgpt')).toBe('테토남 챗지피티 #chatgpt');
    expect(cleanShortsTitle('우주하마 이상형 #Shorts #쇼츠 #youtubeshorts')).toBe('우주하마 이상형');
    expect(cleanShortsTitle('#shortsfunny 그대로')).toBe('#shortsfunny 그대로');
    expect(cleanShortsTitle('#shorts')).toBe('#shorts');
  });
});
