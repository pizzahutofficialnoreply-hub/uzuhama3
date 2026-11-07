import { describe, expect, it } from 'vitest';
import { activeDdays, daysUntil, ddayLabel } from './dday';

const NOW = Date.parse('2026-11-07T15:00:00Z'); // 한국 11/8 00:00
describe('D-day', () => {
  it('한국 날짜 기준', () => {
    expect(daysUntil('2026-11-08', NOW)).toBe(0);
    expect(daysUntil('2026-11-20', NOW)).toBe(12);
  });
  it('표시 기간·순서', () => {
    const r = activeDdays([
      { id: 'a', title: '10주년', date: '2026-11-20' },
      { id: 'b', title: '먼 일', date: '2026-12-31' },
      { id: 'c', title: '지난 일', date: '2026-11-01' },
      { id: 'd', title: '오늘', date: '2026-11-08' },
      { id: 'e', title: '꺼짐', date: '2026-11-09', active: false },
      { id: 'f', title: '길게', date: '2026-12-31', daysBefore: 60 },
    ], NOW);
    expect(r.map((x) => x.id)).toEqual(['d', 'a', 'f']);
    expect(ddayLabel(r[0].left)).toBe('D-DAY');
    expect(ddayLabel(r[1].left)).toBe('D-12');
  });
});
