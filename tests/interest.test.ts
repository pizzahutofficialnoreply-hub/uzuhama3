import { describe, it, expect, vi } from 'vitest';
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

import { setInterestPaused, clearWatchHistory, clearInterest, interestSummary } from '../src/utils/interest';
describe('맞춤 추천 설정', () => {
  it('일시 중지 중에는 기록 안 함', () => {
    const before = JSON.stringify(loadInterest().tokens);
    vi.stubGlobal('localStorage', { store: {} as Record<string, string>, getItem(k: string) { return (this as any).store[k] ?? null; }, setItem(k: string, v: string) { (this as any).store[k] = v; }, removeItem(k: string) { delete (this as any).store[k]; } });
    setInterestPaused(true);
    recordInterest(v('x1', 'New Game', '퍼즐'), 'play');
    expect(JSON.stringify(loadInterest().tokens)).toBe(before);
    setInterestPaused(false);
    vi.unstubAllGlobals();
  });
  it('시청 기록 삭제·초기화', () => {
    recordInterest(v('y1', 'Some', '공포'), 'play');
    expect(interestSummary().watched).toBeGreaterThan(0);
    clearWatchHistory();
    expect(interestSummary().watched).toBe(0);
    expect(interestSummary().genres.length).toBeGreaterThan(0);
    clearInterest();
    expect(interestSummary().genres.length).toBe(0);
  });
});
