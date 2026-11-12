import { useEffect, useState } from 'react';
import { hasTerm } from '../utils/searchPlan';

/**
 * 영상 검색 보조 색인 (태그·설명·썸네일 글자·키워드 + 게임 이름 한국어 키워드)
 * - 서버에서 받아 기기에 저장, 검색은 전부 기기 안에서 (검색할 때 외부 API 호출 없음)
 * - 아직 없는 영상·게임은 화면을 열어 둔 동안 조금씩 서버에 넘겨 한 번만 만들게 함 (서버가 잠금·한도로 비용 제한)
 */
/** m = 썸네일 분위기·계절 태그 (정해진 목록에서만) */
export type SearchEntry = { g?: string[]; t?: string; k?: string[]; d?: string; m?: string[]; x?: 1; p?: 1 };
/** 썸네일을 아직 안 봤거나(p), 분위기 태그가 생기기 전에 본 것 */
export const needsVision = (e?: SearchEntry) => Boolean(e && !e.x && (e.p || e.m === undefined));
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
/**
 * 사이트에 있는데 색인에 아직 없는 영상·게임만 서버에 넘겨 만들게 함
 *  - 썸네일 분석(비전)은 서버가 정해진 시간에 혼자 함 (방문자마다 몇 초 간격으로 계속 부르면 DB 읽기가 크게 늘어서)
 *  - 기기마다 6시간에 한 번만, 진행이 없으면 바로 그만
 */
const ENRICH_KEY = 'uzuhama_search_enrich_at';
async function enrich(ids: string[], games: string[]) {
  if (enriching) return;
  try { if (Date.now() - Number(localStorage.getItem(ENRICH_KEY) || 0) < TTL) return; } catch { /* */ }
  enriching = true;
  try {
    while (rounds < 6) {
      const newIds = ids.filter((id) => ID_RE.test(id) && !data.entries[id]).slice(0, 150);
      const newGames = games.filter((g) => !(g in data.games)).slice(0, 200);
      if (!newIds.length && !newGames.length) {
        if (!complete) { complete = true; persist(); }
        break;
      }
      rounds += 1;
      let json: any;
      try {
        const r = await fetch(`${API_BASE}/api/videos/search-index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: newIds, games: newGames }),
        });
        json = await r.json();
      } catch {
        break;
      }
      const added = json?.added && typeof json.added === 'object' ? json.added : {};
      const addedGames = json?.games && typeof json.games === 'object' ? json.games : {};
      const progressed = Object.keys(added).length + Object.keys(addedGames).length;
      if (progressed) {
        data = { entries: { ...data.entries, ...added }, games: { ...data.games, ...addedGames } };
        persist();
        emit();
      }
      // 다른 기기가 처리 중·쉬는 중·오류·진행 없음 → 이번엔 그만 (다음에 이어서)
      if (json?.error || json?.busy || json?.resting || !progressed) break;
      await wait(5);
    }
    try { localStorage.setItem(ENRICH_KEY, String(Date.now())); } catch { /* */ }
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
export const normSearch = (s: string) => String(s || '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');

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
  // 영어·숫자 단어는 단어 단위로만 (iq 가 unique 안에서 맞지 않게)
  const has = (text: string | undefined, w: string) => {
    if (!text) return false;
    if (!/^[0-9a-z]+$/.test(w)) return normSearch(text).includes(w);
    return hasTerm(text.toLowerCase(), normSearch(text), w);
  };
  // 여러 단어면 단어마다 어디든 있으면 (예: 썸네일 글자 덩어리가 둘이어도 각각으로 찾기)
  const words = query.replace(/^#+/, '').split(/\s+/).map(normSearch).filter((w) => w.length >= 1);
  if (words.length > 1) {
    const all = [entry.t, ...(entry.k || []), ...(entry.g || []), entry.d].filter(Boolean).join(' | ');
    if (!normSearch(all).includes(q) && words.every((w) => has(all, w))) {
      return entry.t && words.some((w) => has(entry.t, w)) ? '썸네일' : '태그·설명';
    }
  }
  if (has(entry.t, q)) return '썸네일';
  if (entry.k?.some((k) => has(k, q))) return '키워드';
  if (entry.g?.some((g) => has(g, q))) return '태그';
  if (has(entry.d, q)) return '설명';
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
