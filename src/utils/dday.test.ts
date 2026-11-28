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

import { boostFor } from './dday';
import { computeBroadcastProbability } from './probability';
describe('기념일 방송 확률', () => {
  const ev = [{ id: 'a', title: '10주년', date: '2026-11-30', active: true }];
  it('주년이면 기본: 당일 40 · 전날 12', () => {
    expect(boostFor(ev as any, '2026-11-30')?.min).toBe(40);
    expect(boostFor(ev as any, '2026-11-29')).toMatchObject({ min: 12, before: true });
    expect(boostFor(ev as any, '2026-11-28')).toBeNull();
  });
  it('0 이면 끔, 주년 아니면 기본 없음', () => {
    expect(boostFor([{ ...ev[0], boost: 0, boostBefore: 0 }] as any, '2026-11-30')).toBeNull();
    expect(boostFor([{ ...ev[0], title: '수능' }] as any, '2026-11-30')).toBeNull();
  });
  it('오래 쉬는 중이어도 당일 하루 확률이 최소 40%', () => {
    const logs = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}`, date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10), time: '20:00', vods: [{ url: 'x' }] }));
    const at = new Date('2026-11-30T03:00:00Z'); // 한국 정오
    const p = computeBroadcastProbability(logs as any, at, { system: { events: ev } as any });
    expect(p.pattern.state).toBe('special');
    expect(p.dayProb).toBeGreaterThanOrEqual(40);
    const off = computeBroadcastProbability(logs as any, at, { system: { events: ev, dateOverrides: [{ date: '2026-11-30', type: 'off' }] } as any });
    expect(off.pattern.state).not.toBe('special');
  });
});
