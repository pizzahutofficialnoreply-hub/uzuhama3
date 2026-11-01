import { useEffect, useState } from 'react';

/**
 * 영상 검색 보조 색인 (태그·썸네일 글자·키워드·설명 앞부분)
 * - 서버에서 한 번 받아 기기에 6시간 저장, 검색은 전부 기기 안에서 (검색할 때 외부 API 호출 없음)
 * - 아직 색인에 없는 영상은 조용히 서버에 넘겨 한 번만 추출하게 함 (서버가 하루 한도·잠금으로 비용 제한)
 */
export type SearchEntry = { g?: string[]; t?: string; k?: string[]; d?: string; x?: 1 };
export type SearchIndex = Record<string, SearchEntry>;

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const KEY = 'uzuhama_search_index_v1';
const TTL = 6 * 3600 * 1000;
const FULL_AT = 1500; // 이보다 적으면 아직 채우는 중이라 보고 자주 새로 받음
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

let index: SearchIndex = {};
let loadedAt = 0;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.entries) { index = saved.entries; loadedAt = Number(saved.at || 0); }
} catch { /* 저장 공간 없음 */ }

const listeners = new Set<(i: SearchIndex) => void>();
const emit = () => listeners.forEach((fn) => fn(index));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ entries: index, at: loadedAt })); } catch { /* 가득 참 */ } };

let loading: Promise<void> | null = null;
function load() {
  if (loading) return loading;
  if (Date.now() - loadedAt < (Object.keys(index).length >= FULL_AT ? TTL : 5 * 60 * 1000)) return (loading = Promise.resolve());
  loading = fetch(`${API_BASE}/api/videos/search-index`)
    .then((r) => r.json())
    .then((json) => {
      if (json?.entries && typeof json.entries === 'object') {
        index = { ...index, ...json.entries };
        loadedAt = Date.now();
        persist();
        emit();
      }
    })
    .catch(() => { /* 다음에 다시 */ });
  return loading;
}

let enrichRounds = 0;
let enriching = false;
let busyCount = 0;
const tried = new Set<string>();
async function enrich(ids: string[]) {
  // 화면을 열어 둔 동안 계속 조금씩 채움 (서버가 하루 한도·잠금으로 비용 제한)
  if (enriching) return;
  enriching = true;
  try {
  while (enrichRounds < 150) {
    const todo = ids.filter((id) => ID_RE.test(id) && !index[id] && !tried.has(id)).slice(0, 40);
    if (!todo.length) return;
    enrichRounds += 1;
    todo.forEach((id) => tried.add(id));
    try {
      const r = await fetch(`${API_BASE}/api/videos/search-index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: todo }),
      });
      const json = await r.json();
      const added = json?.added && typeof json.added === 'object' ? json.added : {};
      if (Object.keys(added).length) {
        index = { ...index, ...added };
        persist();
        emit();
      }
      // 오류·오늘 한도면 그만. 다른 기기가 처리 중이거나 분당 한도에 걸렸으면 잠시 쉬었다 다시
      if (json?.error) return;
      if (json?.busy || !Object.keys(added).length) {
        if (!json?.busy) return;
        todo.forEach((id) => { if (!added[id]) tried.delete(id); });
        busyCount += 1;
        if (busyCount > 8) return; // 다른 기기가 계속 처리 중이면 이 기기는 그만
        await new Promise((r) => setTimeout(r, Math.max(30, Number(json?.retryAfter) || 30) * 1000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 4000)); // 분당 호출 수를 넘지 않게 조금 간격
      // 서버가 한 번에 일부만 처리하므로, 처리 안 된 것은 다음 차례에 다시 넣을 수 있게
      todo.forEach((id) => { if (!added[id]) tried.delete(id); });
    } catch {
      return;
    }
  }
  } finally {
    enriching = false;
  }
}

/** knownIds: 지금 사이트에 있는 유튜브 영상 ID 목록 (색인에 없는 것을 채우는 데 사용) */
export function useSearchIndex(knownIds?: string[]) {
  const [state, setState] = useState<SearchIndex>(index);
  useEffect(() => {
    listeners.add(setState);
    load();
    return () => { listeners.delete(setState); };
  }, []);
  const idsKey = knownIds?.length || 0;
  useEffect(() => {
    if (!knownIds?.length) return;
    const t = setTimeout(() => { load().then(() => enrich(knownIds)); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
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
  const q = normSearch(query);
  if (q.length < 2) return null;
  if (entry.t && normSearch(entry.t).includes(q)) return '썸네일';
  if (entry.k?.some((k) => normSearch(k).includes(q))) return '키워드';
  if (entry.g?.some((g) => normSearch(g).includes(q))) return '태그';
  if (entry.d && normSearch(entry.d).includes(q)) return '설명';
  return null;
}
