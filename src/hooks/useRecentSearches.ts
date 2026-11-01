import { useEffect, useState } from 'react';

/**
 * 최근 검색어 (기기에 저장, 모든 화면이 같이 씀)
 * - 검색창에서 Enter 를 누르거나, 같은 검색어를 잠시 그대로 두면 저장 (홈·동영상·쇼츠·재생목록 어디서든)
 */
const KEY = 'uzuhama_recent_searches';
const EVENT = 'uzuhama-recent-searches';
const MAX = 10;

export function readRecentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function write(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장 공간 없음 */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* 무시 */ }
}
export function addRecentSearch(term: string) {
  const clean = String(term || '').trim();
  if (clean.length < 2 || clean.length > 60) return;
  const prev = readRecentSearches();
  if (prev[0]?.toLowerCase() === clean.toLowerCase()) return;
  // 이어서 치던 중간 글자("배틀그" → "배틀그라운드")는 새 검색어로 바꿔치기
  const filtered = prev.filter((s, i) => s.toLowerCase() !== clean.toLowerCase() && !(i === 0 && clean.toLowerCase().startsWith(s.toLowerCase())));
  write([clean, ...filtered].slice(0, MAX));
}
export function removeRecentSearch(term: string) { write(readRecentSearches().filter((s) => s !== term)); }
export function clearRecentSearches() { write([]); }

export function useRecentSearches(): string[] {
  const [list, setList] = useState<string[]>(readRecentSearches);
  useEffect(() => {
    const on = () => setList(readRecentSearches());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return list;
}
