/**
 * 실험실 '과거 영상 생방 연동'이 꺼져 있으면: 2020년 전 기록에서 팬카페 정리로 가져온 것(cafe 표시)을 숨김
 * - cafe: 1 → 숨김 / cafe: 'multi' (원래 있던 영상을 여러 생방 연결로 바꾼 것) → 연결만 빼고 원래 영상으로
 * - 카페로 새로 만든 기록(log.cafe)이 비면 그 기록도 숨김
 */
export const CAFE_OLD_BEFORE = '2020-01-01';

function stripItem(x: any) {
  if (!x || typeof x !== 'object' || !x.cafe) return x;
  if (x.cafe === 'multi') { const { multiId, allBroadcastDates, cafe, ...rest } = x; return rest; }
  return null;
}

export function hideOldCafe<T extends { logs: Record<string, any> }>(data: T): T {
  if (!data?.logs) return data;
  let changed = false;
  const logs: Record<string, any> = {};
  for (const [id, l] of Object.entries(data.logs)) {
    if (!l || !(String(l.date || '') < CAFE_OLD_BEFORE)) { logs[id] = l; continue; }
    const has = ['vods', 'edited', 'shorts'].some((k) => (l[k] || []).some((x: any) => x?.cafe));
    if (!has && !l.cafe) { logs[id] = l; continue; }
    changed = true;
    const next = { ...l };
    ['vods', 'edited', 'shorts'].forEach((k) => { if (Array.isArray(l[k])) next[k] = l[k].map(stripItem).filter(Boolean); });
    const empty = !next.vods?.length && !next.edited?.length && !next.shorts?.length && !(next.games || []).length && !next.game && !next.time;
    if (l.cafe && empty) continue;
    logs[id] = next;
  }
  return changed ? { ...data, logs } : data;
}
