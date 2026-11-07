import type { DdayEvent } from '../types';

/** 한국 날짜 기준 남은 일수 (오늘이면 0) */
export function daysUntil(date: string, now = Date.now()): number {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** 지금 보여 줄 D-day (가까운 순) */
export function activeDdays(events: DdayEvent[] | undefined, now = Date.now()) {
  return (events || [])
    .filter((e) => e && e.active !== false && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))
    .map((e) => ({ ...e, left: daysUntil(e.date, now) }))
    .filter((e) => e.left >= 0 && e.left <= Math.max(0, Number(e.daysBefore ?? 14)))
    .sort((a, b) => a.left - b.left);
}

export const ddayLabel = (left: number) => (left === 0 ? 'D-DAY' : `D-${left}`);
