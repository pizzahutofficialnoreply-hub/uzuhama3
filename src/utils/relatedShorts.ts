/**
 * 쇼츠 보기에서 연결된 쇼츠를 다 본 뒤 이어서 볼 추천 쇼츠
 * 같은 게임 쇼츠 → 같은 카테고리 → 최근 순 (이미 있는 것 빼고)
 */
const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1] || '';
const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');

export function recommendShorts(allLogs: any, games: string[], exclude: string[], limit = 30): { url: string; title?: string }[] {
  const logs: any[] = Array.isArray(allLogs) ? allLogs : Object.values(allLogs || {});
  const g = new Set(games.map(norm).filter(Boolean));
  const cats = new Set<string>();
  logs.forEach((l) => (l?.games || []).forEach((x: any) => { if (g.has(norm(x?.name))) String(x?.category || '').split(/[,/]/).forEach((c) => c.trim() && cats.add(c.trim())); }));
  const skip = new Set(exclude.map(ytId).filter(Boolean));
  const seen = new Set<string>();
  const scored: { url: string; title?: string; s: number; date: string }[] = [];
  for (const l of logs) {
    if (!l || !Array.isArray(l.shorts)) continue;
    const lg = (l.games || []).map((x: any) => norm(x?.name));
    const lc = (l.games || []).flatMap((x: any) => String(x?.category || '').split(/[,/]/).map((c: string) => c.trim()));
    const s = lg.some((x: string) => g.has(x)) ? 2 : lc.some((c: string) => cats.has(c)) ? 1 : 0;
    for (const it of l.shorts) {
      const id = ytId(it?.url);
      if (!id || skip.has(id) || seen.has(id)) continue;
      seen.add(id);
      scored.push({ url: `https://www.youtube.com/shorts/${id}`, title: it.title, s, date: String(l.date || '') });
    }
  }
  scored.sort((a, b) => b.s - a.s || b.date.localeCompare(a.date));
  return scored.slice(0, limit).map(({ url, title }) => ({ url, title }));
}
