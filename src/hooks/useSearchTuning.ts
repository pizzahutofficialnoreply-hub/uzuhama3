import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * 하루 한 번 서버가 신고·만족도를 보고 만든 검색 조정 (config/searchTuning)
 * - demote: 검색어 → 뺄 영상, conceptDemote: 느낌 → 뺄 영상
 * - synonyms: 같은 뜻 말, conceptAdd: 느낌별로 더 찾을 말·뺄 장르
 * 한 번 읽어 기기에 6시간 보관 (검색할 때마다 읽지 않음)
 */
export type SearchTuning = {
  updatedAt?: string;
  demote: Record<string, string[]>;
  conceptDemote: Record<string, string[]>;
  synonyms: Record<string, string[]>;
  conceptAdd: Record<string, { expand?: string[]; avoid?: string[] }>;
  /** 검색 결과 추가하기: 검색어(공백·기호 뺀 것) → 맨 위에 보일 영상 */
  pins?: Record<string, { id: string; t?: number | null; title?: string; note?: string; query?: string }[]>;
  log?: { day: string; reports: number; ratings: number; bad: number; summary: string; model?: string }[];
};
export const EMPTY_TUNING: SearchTuning = { demote: {}, conceptDemote: {}, synonyms: {}, conceptAdd: {} };

const KEY = 'uzuhama_search_tuning_v1';
let cache: SearchTuning = EMPTY_TUNING;
let at = 0;
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.t) { cache = { ...EMPTY_TUNING, ...s.t }; at = Number(s.at || 0); } } catch { /* 무시 */ }
let loading: Promise<void> | null = null;
const listeners = new Set<(t: SearchTuning) => void>();

export function loadSearchTuning(force = false) {
  if (!force && (loading || Date.now() - at < 6 * 3600000)) return loading || Promise.resolve();
  loading = getDoc(doc(db, 'config', 'searchTuning')).then((snap) => {
    const d = snap.exists() ? (snap.data() as any) : {};
    cache = { ...EMPTY_TUNING, ...d };
    at = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify({ t: { ...cache, log: undefined }, at })); } catch { /* 무시 */ }
    listeners.forEach((l) => l(cache));
  }).catch(() => { /* 다음에 */ }).finally(() => { loading = null; });
  return loading;
}

export function useSearchTuning(): SearchTuning {
  const [t, setT] = useState(cache);
  useEffect(() => { listeners.add(setT); loadSearchTuning(); return () => { listeners.delete(setT); }; }, []);
  return t;
}
