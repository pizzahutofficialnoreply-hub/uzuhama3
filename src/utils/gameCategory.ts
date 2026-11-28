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

/* ── 스토어(스팀·앱스토어) 링크에 적힌 장르 ──
 * 서버(/api/videos/meta?ggenre=)가 CDN 에 30일 보관 · 여기서는 기기에 7일 보관 */
const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const GK = 'uzuhama_store_genres_v1';
const mem = new Map<string, Promise<string[]>>();
const isStore = (l: string) => /store\.steampowered\.com\/app\/\d+|steamcommunity\.com\/app\/\d+|apps\.apple\.com\/.*\/id\d+/i.test(l || '');
export function storeGenres(link: string): Promise<string[]> {
  if (!isStore(link)) return Promise.resolve([]);
  const hit = mem.get(link); if (hit) return hit;
  let all: Record<string, { g: string[]; at: number }> = {};
  try { all = JSON.parse(localStorage.getItem(GK) || '{}'); } catch { /* */ }
  const c = all[link];
  if (c && Date.now() - c.at < 7 * 86400000) { const p = Promise.resolve(c.g); mem.set(link, p); return p; }
  const p = fetch(`${API_BASE}/api/videos/meta?ggenre=${encodeURIComponent(link)}`).then((r) => (r.ok ? r.json() : { genres: [] })).then((j: any) => {
    const g = Array.isArray(j?.genres) ? j.genres.map(String).slice(0, 6) : [];
    try { const cur = JSON.parse(localStorage.getItem(GK) || '{}'); cur[link] = { g, at: Date.now() }; localStorage.setItem(GK, JSON.stringify(cur)); } catch { /* */ }
    return g;
  }).catch(() => []);
  mem.set(link, p);
  return p;
}
/** 게임 칸에 보여 줄 카테고리: 방송 기록에 적힌 것(쉼표로 나눔) + 스토어 장르, 겹치는 건 한 번만 */
export function mergeCategories(recorded: string, store: string[]): string[] {
  const out: string[] = []; const seen = new Set<string>();
  [...String(recorded || '').split(','), ...store].map((s) => s.trim()).filter(Boolean).forEach((s) => { const k = nz(s); if (k && !seen.has(k)) { seen.add(k); out.push(s); } });
  return out;
}
