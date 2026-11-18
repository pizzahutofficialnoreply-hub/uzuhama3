import { describe, it, expect } from 'vitest';
import { buildRecap, recapYearNow, yearsWithData } from './yearRecap';

const L = (date: string, h: number, games: [string, string][], extra: any = {}) => ({ id: date, date, time: '20:00', durationHours: h, games: games.map(([name, category]) => ({ name, category, link: '' })), vods: [], edited: [], shorts: [], ...extra });
const logs: any = {
  a: L('2025-03-01', 3, [['게임A', '공포']]),
  b: L('2026-01-02', 4, [['게임A', '공포'], ['게임B', '퍼즐']], { edited: [{ url: 'https://youtu.be/AAAAAAAAAAA' }] }),
  c: L('2026-01-03', 2, [['게임B', '퍼즐']]),
  d: L('2026-01-04', 6, [['게임C', '공포']], { time: '23:30' }),
  e: L('2026-03-10', 1, [['게임B', '퍼즐']]),
  f: { id: 'f', date: '2026-02-01', isAbsence: true, games: [], vods: [], edited: [], shorts: [] },
};

describe('buildRecap', () => {
  const r = buildRecap(logs, 2026);
  it('세기', () => {
    expect(r.count).toBe(4);
    expect(r.hours).toBe(13);
    expect(r.prev).toEqual({ count: 1, hours: 3 });
    expect(r.topGames[0].name).toBe('게임B');
    expect(r.topGames[0].count).toBe(3);
    expect(r.newGames.sort()).toEqual(['게임B', '게임C']);
    expect(r.longest?.date).toBe('2026-01-04');
    expect(r.streak).toEqual({ days: 3, from: '2026-01-02', to: '2026-01-04' });
    expect(r.bestMonth).toBe(1);
    expect(r.videos).toBe(1);
    expect(r.categories[0].name).toBe('퍼즐');
  });
  it('가장 오래 쉰 기간', () => {
    expect(r.rest!.from).toBe('2026-03-11');
  });
  it('해 목록·보여 줄 때', () => {
    expect(yearsWithData(logs)).toEqual([2026, 2025]);
    expect(recapYearNow(Date.parse('2026-12-20T03:00:00Z'))).toBe(2026);
    expect(recapYearNow(Date.parse('2027-01-05T03:00:00Z'))).toBe(2026);
    expect(recapYearNow(Date.parse('2026-11-18T03:00:00Z'))).toBe(null);
  });
});
