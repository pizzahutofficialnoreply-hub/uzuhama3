/**
 * 카페 '[다시보기] 8/23 일요일 생방송 노가리요약 …' 글에서 그날 정보 빼 오기
 *  ✔️오팬무 초록 · ✔️오음무 콜라 · ✔️오저무/오점무 된장찌개 → sheetExtra 의 pan · eum · jeo
 * - 글 하나 = 'M/D (요일)' 머리부터 다음 머리 전까지 (여러 글을 한꺼번에 붙여 넣어도 됨)
 * - 연도: 카페 글 모으기(북마클릿)가 붙인 글 올린 날 '===== 제목 ⟪2026-08-24 01:10 · …⟫' 의 연도
 *   (방송일이 올린 날보다 뒤면 그 전 해) · 그게 없으면 요일이 맞는 가장 가까운 지난 해
 */
import type { SheetExtra } from './sheetExtra';

export type ExtraKey = keyof SheetExtra;
export const EXTRA_LABEL: Record<ExtraKey, string> = { pan: '오팬무', eum: '오음무', jeo: '오저무' };
const KEY_OF: Record<string, ExtraKey> = { 오팬무: 'pan', 오음무: 'eum', 오저무: 'jeo', 오점무: 'jeo' };
const WD = '일월화수목금토';
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const valid = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

export function pickYear(m: number, d: number, wd: number | null, today: string): number | null {
  const ty = Number(today.slice(0, 4));
  for (let y = ty; y >= ty - 12; y--) {
    if (!valid(y, m, d) || iso(y, m, d) > today) continue;
    if (wd == null || new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) return y;
  }
  return null;
}

export type CafeExtraDay = { date: string; header: string; values: SheetExtra };

const HEAD = /(?:(\d{4})\s*[./년]\s*)?(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?\s*(?:\(?\s*([일월화수목금토])(?:요일)?\s*\)?)?\s*(?=[^\n]{0,30}(?:생방|방송|다시보기|노가리))/g;

export function parseCafeExtras(text: string, today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)): CafeExtraDay[] {
  const s = String(text || '').replace(/[​-‍﻿]/g, '');
  const heads = [...s.matchAll(HEAD)].filter((m) => /\[\s*다시보기\s*\]|생방|방송/.test(s.slice(Math.max(0, (m.index || 0) - 15), (m.index || 0) + m[0].length + 30)));
  const out = new Map<string, CafeExtraDay>();
  // 글 올린 날: 머리 앞에 있는 가장 가까운 '===== … ⟪YYYY-MM-DD' 
  const posted = [...s.matchAll(/=====[^\n]*?⟪\s*(\d{4})-(\d{2})-(\d{2})/g)].map((x) => ({ at: x.index || 0, d: `${x[1]}-${x[2]}-${x[3]}` }));
  heads.forEach((m, i) => {
    const mo = Number(m[2]); const da = Number(m[3]);
    const wd = m[4] ? WD.indexOf(m[4]) : null;
    const up = [...posted].reverse().find((x) => x.at <= (m.index || 0))?.d;
    const upY = up ? Number(up.slice(0, 4)) : 0;
    const y = m[1] ? Number(m[1]) : up ? (iso(upY, mo, da) > up ? upY - 1 : upY) : pickYear(mo, da, wd, today);
    if (!y || !valid(y, mo, da)) return;
    const body = s.slice((m.index || 0) + m[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined);
    const values: SheetExtra = {};
    // '✔️오팬무 초록' · '오저무: 된장찌개' — 값은 다음 ✔️ · 줄바꿈 · 다음 '오○무' 앞까지
    for (const x of body.matchAll(/(오[팬음저점]무)\s*[:：=\-)]?\s*([^\n✔✅☑️]*?)(?=\s*(?:[✔✅☑]|\n|오[가-힣]무|$))/g)) {
      const k = KEY_OF[x[1]]; const v = x[2].replace(/[\s,.·]+$/, '').trim().slice(0, 40);
      if (!k || !v || /^[?？x×-]+$/i.test(v)) continue;
      values[k] = values[k] && values[k] !== v ? `${values[k]}, ${v}` : v; // 오점무 + 오저무 → 같이
    }
    if (!Object.keys(values).length) return;
    const date = iso(y, mo, da);
    const prev = out.get(date);
    out.set(date, { date, header: s.slice(m.index || 0, (m.index || 0) + 40).split('\n')[0].trim(), values: { ...(prev?.values || {}), ...values } });
  });
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** '초록' 과 '초록색', 띄어쓰기·문장부호 차이는 같은 것으로 */
export const sameExtra = (a: string, b: string) => {
  const n = (x: string) => String(x || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').replace(/색$/, '');
  return n(a) === n(b);
};

export type ExtraRow = { date: string; key: ExtraKey; cafe: string; sheet: string; kind: 'new' | 'diff' };
/** 시트에 없는 것(new)과 둘 다 있는데 다른 것(diff)만 — 같은 건 빼고 */
export function compareExtras(days: CafeExtraDay[], sheet: Record<string, SheetExtra>): ExtraRow[] {
  const rows: ExtraRow[] = [];
  days.forEach((d) => (Object.keys(d.values) as ExtraKey[]).forEach((k) => {
    const cafe = d.values[k] || ''; const cur = sheet[d.date]?.[k] || '';
    if (!cur) rows.push({ date: d.date, key: k, cafe, sheet: '', kind: 'new' });
    else if (!sameExtra(cafe, cur)) rows.push({ date: d.date, key: k, cafe, sheet: cur, kind: 'diff' });
  }));
  return rows;
}
