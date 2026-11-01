import { useEffect, useState } from 'react';

/**
 * 영상 검색 보조 색인 (태그·설명·썸네일 글자·키워드 + 게임 이름 한국어 키워드)
 * - 서버에서 받아 기기에 저장, 검색은 전부 기기 안에서 (검색할 때 외부 API 호출 없음)
 * - 아직 없는 영상·게임은 화면을 열어 둔 동안 조금씩 서버에 넘겨 한 번만 만들게 함 (서버가 잠금·한도로 비용 제한)
 */
export type SearchEntry = { g?: string[]; t?: string; k?: string[]; d?: string; x?: 1; p?: 1 };
export type SearchIndex = Record<string, SearchEntry>;
export type GameKeywords = Record<string, string[]>;
export type SearchData = { entries: SearchIndex; games: GameKeywords };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const KEY = 'uzuhama_search_index_v2';
const TTL = 6 * 3600 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

let data: SearchData = { entries: {}, games: {} };
let loadedAt = 0;
let complete = false; // 서버에 더 만들 게 없다고 확인됨
try {
  localStorage.removeItem('uzuhama_search_index_v1');
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.entries) { data = { entries: saved.entries, games: saved.games || {} }; loadedAt = Number(saved.at || 0); complete = Boolean(saved.complete); }
} catch { /* 저장 공간 없음 */ }

const listeners = new Set<(d: SearchData) => void>();
const emit = () => listeners.forEach((fn) => fn(data));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...data, at: loadedAt, complete })); } catch { /* 가득 참 */ } };

let loading: Promise<void> | null = null;
function load() {
  if (loading) return loading;
  // 다 채워졌으면 6시간, 아직 채우는 중이면 5분마다 새로 받음
  if (Date.now() - loadedAt < (complete ? TTL : 5 * 60 * 1000)) return (loading = Promise.resolve());
  loading = fetch(`${API_BASE}/api/videos/search-index`)
    .then((r) => r.json())
    .then((json) => {
      if (json?.entries && typeof json.entries === 'object') {
        data = { entries: { ...data.entries, ...json.entries }, games: { ...data.games, ...(json.games || {}) } };
        loadedAt = Date.now();
        persist();
        emit();
      }
    })
    .catch(() => { /* 다음에 다시 */ });
  return loading;
}

let enriching = false;
let rounds = 0;
const wait = (sec: number) => new Promise((r) => setTimeout(r, sec * 1000));
async function enrich(ids: string[], games: string[]) {
  if (enriching) return;
  enriching = true;
  try {
    let busy = 0;
    while (rounds < 120) {
      const newIds = ids.filter((id) => ID_RE.test(id) && !data.entries[id]).slice(0, 150);
      const pendingIds = ids.filter((id) => data.entries[id]?.p).slice(0, 50);
      const newGames = games.filter((g) => !(g in data.games)).slice(0, 200);
      if (!newIds.length && !pendingIds.length && !newGames.length) {
        if (!complete) { complete = true; persist(); }
        return;
      }
      rounds += 1;
      let json: any;
      try {
        const r = await fetch(`${API_BASE}/api/videos/search-index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...newIds, ...pendingIds], games: newGames }),
        });
        json = await r.json();
      } catch {
        return;
      }
      const added = json?.added && typeof json.added === 'object' ? json.added : {};
      const addedGames = json?.games && typeof json.games === 'object' ? json.games : {};
      if (Object.keys(added).length || Object.keys(addedGames).length) {
        data = { entries: { ...data.entries, ...added }, games: { ...data.games, ...addedGames } };
        persist();
        emit();
      }
      if (json?.error) return;
      if (json?.busy) {
        // 다른 기기가 처리 중
        if (++busy > 6) return;
        await wait(Math.max(30, Number(json.retryAfter) || 30));
        continue;
      }
      busy = 0;
      // 새 영상 태그는 다 받았고 썸네일·게임은 한도 때문에 쉬는 중이면 길게 쉬지 않고 그만 (다음 방문 때 이어서)
      if (json?.resting) {
        if (!newIds.length || Number(json.retryAfter) > 120) return;
        await wait(Math.max(5, Number(json.retryAfter) || 65));
        continue;
      }
      await wait(5);
    }
  } finally {
    enriching = false;
  }
}

/**
 * knownIds: 사이트에 있는 유튜브 영상 ID, gameNames: 방송 기록의 게임 이름 (없는 것을 채우는 데 사용)
 */
export function useSearchIndex(knownIds?: string[], gameNames?: string[]): SearchData {
  const [state, setState] = useState<SearchData>(data);
  useEffect(() => {
    listeners.add(setState);
    load();
    return () => { listeners.delete(setState); };
  }, []);
  const key = `${knownIds?.length || 0}|${gameNames?.length || 0}`;
  useEffect(() => {
    if (!knownIds?.length) return;
    const t = setTimeout(() => { load().then(() => enrich(knownIds, gameNames || [])); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** 검색어 비교용: 소문자 + 공백 제거 */
export const normSearch = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');

/** # 태그 검색: 태그 중 하나가 검색어와 같으면 'exact', 포함하면 'partial' */
export function matchTag(entry: SearchEntry | undefined, tagQuery: string): 'exact' | 'partial' | null {
  if (!entry?.g?.length || !tagQuery) return null;
  const q = normSearch(tagQuery);
  let partial = false;
  for (const tag of entry.g) {
    const t = normSearch(tag.replace(/^#/, ''));
    if (t === q) return 'exact';
    if (t.includes(q)) partial = true;
  }
  return partial ? 'partial' : null;
}

/** 일반 검색: 썸네일 글자·키워드·태그·설명 중 어디서 찾았는지 (없으면 null) */
export function matchRelated(entry: SearchEntry | undefined, query: string): string | null {
  if (!entry || entry.x) return null;
  const q = normSearch(query.replace(/^#+/, ''));
  if (q.length < 2) return null;
  if (entry.t && normSearch(entry.t).includes(q)) return '썸네일';
  if (entry.k?.some((k) => normSearch(k).includes(q))) return '키워드';
  if (entry.g?.some((g) => normSearch(g).includes(q))) return '태그';
  if (entry.d && normSearch(entry.d).includes(q)) return '설명';
  return null;
}

/** 게임 키워드에서 검색어를 찾아, 해당하는 게임 이름(정규화) 집합을 돌려줌 */
export function gamesMatchingKeyword(games: GameKeywords, query: string): Set<string> {
  const q = normSearch(query.replace(/^#+/, ''));
  const out = new Set<string>();
  if (q.length < 2) return out;
  Object.entries(games).forEach(([name, kws]) => {
    if (Array.isArray(kws) && kws.some((k) => { const n = normSearch(k); return n === q || (q.length >= 2 && n.includes(q)); })) out.add(normSearch(name));
  });
  return out;
}
