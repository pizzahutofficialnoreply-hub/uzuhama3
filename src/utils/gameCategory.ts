/**
 * 사이트 방송 기록에 적힌 게임 카테고리 (관리자가 정한 값)
 * AI 요약 카드에서 AI 가 짐작한 장르 대신 이걸 씀 — App 이 데이터를 받으면 채워 둠
 */
const nz = (s: string) => String(s || '').normalize('NFKC').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}]/gu, '');
let map = new Map<string, string>();
export function setGameCategories(logs: any) {
  const m = new Map<string, Map<string, number>>();
  (Array.isArray(logs) ? logs : Object.values(logs || {})).forEach((l: any) => {
    const gs = Array.isArray(l?.games) && l.games.length ? l.games : l?.game ? [{ name: l.game, category: l.category }] : [];
    gs.forEach((g: any) => {
      const k = nz(g?.name); const c = String(g?.category || l?.category || '').trim();
      if (!k || !c) return;
      const cm = m.get(k) || new Map<string, number>(); cm.set(c, (cm.get(c) || 0) + 1); m.set(k, cm);
    });
  });
  const out = new Map<string, string>();
  m.forEach((cm, k) => out.set(k, [...cm].sort((a, b) => b[1] - a[1])[0][0])); // 가장 많이 쓴 카테고리
  map = out;
}
export function gameCategoryOf(name: string): string { return map.get(nz(name)) || ''; }
