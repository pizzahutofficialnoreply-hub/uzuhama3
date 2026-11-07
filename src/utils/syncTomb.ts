/**
 * 기기 연결(동기화)용 지운 기록 표시
 * - 다른 기기와 합칠 때, 이 기기에서 지운 게 다시 살아나지 않게 언제 지웠는지 적어 둠
 */
export type Tomb = { h: Record<string, number>; hClear: number; l: Record<string, number>; s: number };
const KEY = 'uzuhama_sync_tomb_v1';

export function readTomb(): Tomb {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (t && typeof t === 'object') return { h: t.h || {}, hClear: Number(t.hClear || 0), l: t.l || {}, s: Number(t.s || 0) };
  } catch { /* */ }
  return { h: {}, hClear: 0, l: {}, s: 0 };
}
const trim = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 400));
export function writeTomb(t: Tomb) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...t, h: trim(t.h), l: trim(t.l) })); } catch { /* */ }
}
export function markTomb(fn: (t: Tomb) => void) { const t = readTomb(); fn(t); writeTomb(t); }
