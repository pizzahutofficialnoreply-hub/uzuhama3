import { describe, it, expect } from 'vitest';
import { recordInterest, recordImpression, personalize, interestScore, hasInterestProfile, loadInterest, tokensOf, type InterestItem } from '../src/utils/interest';

const v = (id: string, game: string, genre: string, kind: InterestItem['kind'] = 'video'): InterestItem => ({ id, kind, tokens: tokensOf([{ name: game, category: genre }]) });

describe('맞춤 추천', () => {
  const horrorA = v('h1', 'Poppy Playtime', '공포');
  const horrorB = v('h2', 'The Closing Shift', '공포');
  const horrorC = v('h3', 'Night Bus', '공포');
  const racing = v('r1', 'Forza', '레이싱');
  const puzzle = v('p1', 'Tetris', '퍼즐');
  const list = [racing, puzzle, horrorB, horrorC, horrorA];

  it('관심 기록이 없으면 원래 순서', () => {
    expect(hasInterestProfile()).toBe(false);
    expect(personalize(list, (x) => x)).toEqual(list);
  });

  it('틀지 않고 들여다보기만 해도 그 장르가 앞으로', () => {
    recordInterest(horrorA, 'dwell-long');
    recordInterest(horrorA, 'engage');
    expect(hasInterestProfile()).toBe(true);
    const out = personalize(list, (x) => x).map((x) => x.id);
    expect(out.slice(0, 2).sort()).toEqual(['h1', 'h2', 'h3'].filter((id) => out.slice(0, 2).includes(id)).sort());
    expect(out.indexOf('h2')).toBeLessThan(out.indexOf('r1'));
  });

  it('본 영상은 뒤로, 4개마다 새로운 쪽 하나', () => {
    recordInterest(horrorA, 'play');
    expect(interestScore(horrorA)).toBeLessThan(interestScore(horrorB));
    const many = [...Array.from({ length: 6 }, (_, i) => v(`hh${i}`, `Horror ${i}`, '공포')), racing, puzzle];
    const out = personalize(many, (x) => x).map((x) => x.id);
    expect(['r1', 'p1']).toContain(out[3]);
  });

  it('여러 번 보였는데 반응 없으면 조금씩 뒤로', () => {
    const before = interestScore(horrorC);
    for (let i = 0; i < 8; i++) recordImpression('h3');
    expect(interestScore(horrorC)).toBeLessThan(before);
    expect(loadInterest().items.h3.imp).toBe(8);
  });
});
