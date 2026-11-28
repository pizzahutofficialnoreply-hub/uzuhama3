import type { DdayEvent } from '../types';

/** 한국 날짜 기준 남은 일수 (오늘이면 0) */
export function daysUntil(date: string, now = Date.now()): number {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** 매년 하는 일정(생일 등)은 올해(지났으면 내년) 날짜로 */
export function nextDate(e: DdayEvent, now = Date.now()): string {
  if (e.repeat !== 'yearly' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return e.date;
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const y = Number(today.slice(0, 4));
  const md = e.date.slice(5);
  const cand = `${y}-${md}`;
  return cand >= today ? cand : `${y + 1}-${md}`;
}
/** 그날 있는 일정인지 (매년이면 월·일만) */
export function occursOn(e: DdayEvent, day: string): boolean {
  if (!e?.date) return false;
  return e.repeat === 'yearly' ? e.date.slice(5) === day.slice(5) && e.date <= `${day.slice(0, 4)}-12-31` : e.date === day;
}

/** 지금 보여 줄 D-day (가까운 순) */
export function activeDdays(events: DdayEvent[] | undefined, now = Date.now()) {
  return (events || [])
    .filter((e) => e && e.active !== false && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))
    .map((e) => { const date = nextDate(e, now); return { ...e, date, left: daysUntil(date, now) }; })
    .filter((e) => e.left >= 0 && e.left <= Math.max(0, Number(e.daysBefore ?? 14)))
    .sort((a, b) => a.left - b.left);
}

export const ddayLabel = (left: number) => (left === 0 ? 'D-DAY' : `D-${left}`);

/** 기념일 방송 확률 하한 (그날 / 전날). 이름에 '주년'이 있으면 기본으로 켜짐 */
export const BOOST_DEFAULT = { day: 40, before: 12 };
export function boostFor(events: DdayEvent[] | undefined, day: string): { min: number; title: string; before: boolean } | null {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  let best: { min: number; title: string; before: boolean } | null = null;
  for (const e of events || []) {
    if (!e || e.active === false || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) continue;
    const anniv = /주년/.test(e.title || '');
    const dayMin = typeof e.boost === 'number' ? e.boost : anniv ? BOOST_DEFAULT.day : 0;
    const beforeMin = typeof e.boostBefore === 'number' ? e.boostBefore : anniv ? BOOST_DEFAULT.before : 0;
    const cand = occursOn(e, day) ? { min: dayMin, title: e.title, before: false } : occursOn(e, next) ? { min: beforeMin, title: e.title, before: true } : null;
    if (cand && cand.min > 0 && (!best || cand.min > best.min)) best = cand;
  }
  return best;
}
