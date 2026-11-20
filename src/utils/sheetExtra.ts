/**
 * 스프레드시트(생방송 아카이브 V3)의 그날 정보: 오팬무(오늘 팬티 무슨 색)·오음무(오늘 음료)·오저무(오늘 저녁·점심)
 * - AI 가 들은 것보다 시트(사람이 적은 것)를 먼저 믿음
 * - /data/sheet_extra.json (처음 넣은 시트) + config/sheetExtra (관리자 › 연동 › 스프레드시트 대조가 새로 적은 것)
 * - 한 번만 읽고 재사용 (AI 요약을 처음 열 때)
 */
import { useEffect, useState } from 'react';

export type SheetExtra = { pan?: string; eum?: string; jeo?: string };
let cache: Promise<Record<string, SheetExtra>> | null = null;

export function loadSheetExtra(): Promise<Record<string, SheetExtra>> {
  if (cache) return cache;
  cache = (async () => {
    const out: Record<string, SheetExtra> = {};
    try { Object.assign(out, (await (await fetch('/data/sheet_extra.json')).json())?.byDate || {}); } catch { /* */ }
    try {
      const [{ doc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../lib/firebase')]);
      const d = await getDoc(doc(db, 'config', 'sheetExtra'));
      Object.assign(out, d.data()?.byDate || {});
    } catch { /* */ }
    return out;
  })();
  return cache;
}

export function useSheetExtra(date?: string | null): SheetExtra | null {
  const [v, setV] = useState<SheetExtra | null>(null);
  useEffect(() => {
    if (!date) { setV(null); return; }
    let on = true;
    loadSheetExtra().then((m) => { if (on) setV(m[date] || null); }).catch(() => {});
    return () => { on = false; };
  }, [date]);
  return v;
}
