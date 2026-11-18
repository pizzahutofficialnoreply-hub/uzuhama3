import type { BroadcastLog } from '../types';

/**
 * 연말 결산: 한 해 방송 기록을 모아 숫자로
 * - 방송 = 휴방이 아닌 기록 (하루 한 기록)
 * - 시간은 기록의 방송 시간, 게임별 시간은 그날 게임 수로 나눔
 */
export type GameStat = { name: string; count: number; hours: number; link?: string; video?: string };
export type YearRecap = {
  year: number;
  count: number;
  hours: number;
  avgHours: number;
  prev: { count: number; hours: number } | null;
  first: string | null;
  last: string | null;
  longest: { date: string; hours: number; games: string[]; video?: string } | null;
  topGames: GameStat[];
  newGames: string[];
  gameCount: number;
  categories: { name: string; count: number; share: number }[];
  months: number[]; // 1~12월 방송 수
  bestMonth: number | null; // 1~12
  weekdays: number[]; // 일~토
  bestWeekday: number | null;
  hourBand: { label: string; count: number } | null;
  streak: { days: number; from: string; to: string } | null;
  rest: { days: number; from: string; to: string } | null;
  videos: number;
  shorts: number;
};

const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1] || '';
const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const fromNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

const isOn = (l: BroadcastLog | undefined) => !!l && !l.isAbsence && /^\d{4}-\d{2}-\d{2}$/.test(l.date || '');

export function yearsWithData(logs: Record<string, BroadcastLog> | undefined): number[] {
  const ys = new Set<number>();
  Object.values(logs || {}).forEach((l) => { if (isOn(l)) ys.add(Number(l.date.slice(0, 4))); });
  return [...ys].sort((a, b) => b - a);
}

/** 유튜브 영상 정보 (길이·시작 시각): 기록에 방송 시간이 없으면 생방송 다시보기 길이로 */
export type Meta = Map<string, { durationSec: number | null; publishedAt: string | null } | null>;
let META: Meta = new Map();
const vodIds = (l: BroadcastLog) => (l.vods || []).map((v) => ytId(v.url)).filter(Boolean);
export function liveIdsOf(logs: Record<string, BroadcastLog> | undefined, year: number): string[] {
  return [...new Set(Object.values(logs || {}).filter((l) => isOn(l) && (l.date.startsWith(`${year}-`) || l.date.startsWith(`${year - 1}-`))).flatMap(vodIds))].sort();
}
function hoursOf(l: BroadcastLog): number {
  const h = Number(l.durationHours) || 0;
  if (h > 0) return h;
  const sec = vodIds(l).reduce((a, id) => a + (Number(META.get(id)?.durationSec) || 0), 0);
  return sec / 3600;
}
function startHour(l: BroadcastLog): number | null {
  if (l.time && /^\d{2}:/.test(l.time)) return Number(l.time.slice(0, 2));
  const p = vodIds(l).map((id) => META.get(id)?.publishedAt).find(Boolean);
  if (!p) return null;
  return new Date(Date.parse(p) + 9 * 3600000).getUTCHours();
}

function basic(list: BroadcastLog[]) {
  return { count: list.length, hours: Math.round(list.reduce((a, l) => a + hoursOf(l), 0) * 10) / 10 };
}

export function buildRecap(logs: Record<string, BroadcastLog> | undefined, year: number, meta?: Meta): YearRecap {
  META = meta || new Map();
  const all = Object.values(logs || {}).filter(isOn);
  const mine = all.filter((l) => l.date.startsWith(`${year}-`)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const prevList = all.filter((l) => l.date.startsWith(`${year - 1}-`));
  const { count, hours } = basic(mine);

  // 게임
  const games = new Map<string, GameStat>();
  const cats = new Map<string, number>();
  let catTotal = 0;
  for (const l of mine) {
    const list = (l.games || []).filter((g) => String(g?.name || '').trim());
    const names = list.length ? list : (l.game ? [{ name: l.game, link: '', category: l.category || '' }] : []);
    const per = names.length ? hoursOf(l) / names.length : 0;
    const vid = ytId(l.edited?.[0]?.url || '') || ytId(l.vods?.[0]?.url || '');
    const seen = new Set<string>();
    for (const g of names) {
      const k = norm(g.name);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = games.get(k) || { name: g.name, count: 0, hours: 0, link: (g as any).link || '', video: '' };
      e.count++; e.hours += per;
      if (!e.video && vid) e.video = vid;
      if (!e.link && (g as any).link) e.link = (g as any).link;
      games.set(k, e);
      String((g as any).category || l.category || '').split(/[,/]/).map((c) => c.trim()).filter(Boolean).forEach((c) => { cats.set(c, (cats.get(c) || 0) + 1); catTotal++; });
    }
  }
  const topGames = [...games.values()].map((g) => ({ ...g, hours: Math.round(g.hours * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.hours - a.hours).slice(0, 5);
  // 올해 처음 한 게임 (그 전 해까지 기록에 없던)
  const before = new Set<string>();
  all.filter((l) => l.date < `${year}-01-01`).forEach((l) => (l.games || []).forEach((g) => before.add(norm(g?.name || ''))));
  const newGames = [...games.values()].filter((g) => !before.has(norm(g.name))).map((g) => g.name);

  // 달·요일·시간대
  const months = Array(12).fill(0);
  const weekdays = Array(7).fill(0);
  const bands = { 새벽: 0, 아침: 0, 낮: 0, 저녁: 0, 밤: 0 } as Record<string, number>;
  for (const l of mine) {
    months[Number(l.date.slice(5, 7)) - 1]++;
    weekdays[new Date(`${l.date}T00:00:00Z`).getUTCDay()]++;
    const h = startHour(l);
    if (h != null) bands[h < 6 ? '새벽' : h < 11 ? '아침' : h < 17 ? '낮' : h < 21 ? '저녁' : '밤']++;
  }
  const maxIdx = (a: number[]) => (Math.max(...a) > 0 ? a.indexOf(Math.max(...a)) : null);
  const bestBand = Object.entries(bands).sort((a, b) => b[1] - a[1])[0];

  // 가장 긴 방송
  const longestLog = [...mine].sort((a, b) => hoursOf(b) - hoursOf(a))[0];

  // 연속 방송 · 가장 오래 쉰 기간 (그해 안에서, 해 넘어가는 쉼은 그해 1월 1일부터·12월 31일까지 셈)
  const days = [...new Set(mine.map((l) => dayNum(l.date)))].sort((a, b) => a - b);
  let streak: YearRecap['streak'] = null;
  let rest: YearRecap['rest'] = null;
  if (days.length) {
    let s = days[0], best = { len: 1, a: days[0], b: days[0] };
    for (let i = 1; i <= days.length; i++) {
      if (i < days.length && days[i] === days[i - 1] + 1) continue;
      const len = days[i - 1] - s + 1;
      if (len > best.len) best = { len, a: s, b: days[i - 1] };
      if (i < days.length) s = days[i];
    }
    streak = best.len >= 2 ? { days: best.len, from: fromNum(best.a), to: fromNum(best.b) } : null;
    const start = dayNum(`${year}-01-01`);
    const todayN = dayNum(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
    const end = Math.min(dayNum(`${year}-12-31`), todayN);
    const pts = [start - 1, ...days, end + 1];
    for (let i = 1; i < pts.length; i++) {
      const gap = pts[i] - pts[i - 1] - 1;
      if (gap > (rest?.days || 0)) rest = { days: gap, from: fromNum(pts[i - 1] + 1), to: fromNum(pts[i] - 1) };
    }
  }

  // 올해 기록에 붙은 영상·쇼츠
  const vids = new Set<string>();
  const shorts = new Set<string>();
  Object.values(logs || {}).forEach((l) => {
    if (!l?.date?.startsWith(`${year}-`)) return;
    (l.edited || []).forEach((v) => { const id = ytId(v.url); if (id) vids.add(id); });
    (l.shorts || []).forEach((v) => { const id = ytId(v.url); if (id) shorts.add(id); });
  });

  return {
    year, count, hours,
    avgHours: count ? Math.round((hours / count) * 10) / 10 : 0,
    prev: prevList.length ? basic(prevList) : null,
    first: mine[0]?.date || null,
    last: mine[mine.length - 1]?.date || null,
    longest: longestLog && hoursOf(longestLog) > 0 ? { date: longestLog.date, hours: Math.round(hoursOf(longestLog) * 10) / 10, games: (longestLog.games || []).map((g) => g.name).filter(Boolean), video: vodIds(longestLog)[0] || '' } : null,
    topGames, newGames, gameCount: games.size,
    categories: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, c]) => ({ name, count: c, share: catTotal ? Math.round((c / catTotal) * 1000) / 10 : 0 })),
    months, bestMonth: maxIdx(months) == null ? null : (maxIdx(months) as number) + 1,
    weekdays, bestWeekday: maxIdx(weekdays),
    hourBand: bestBand && bestBand[1] > 0 ? { label: bestBand[0], count: bestBand[1] } : null,
    streak, rest,
    videos: vids.size, shorts: shorts.size,
  };
}

/** 결산을 보여 줄 때: 12월 15일 ~ 다음 해 1월 15일 (1월엔 지난해 결산) */
export function recapYearNow(now = Date.now()): number | null {
  const d = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const y = Number(d.slice(0, 4));
  const md = d.slice(5);
  if (md >= '12-15') return y;
  if (md <= '01-15') return y - 1;
  return null;
}
