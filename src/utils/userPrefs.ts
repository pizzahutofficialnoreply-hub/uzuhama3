import { useEffect, useState } from 'react';

/**
 * 사용자 설정 (기기에 저장). 설정 화면에서 바꾸면 열려 있는 화면에도 바로 반영
 */
export type KeyboardLayout = 'qwerty' | 'cheonjiin' | 'naratgeul' | 'danmoeum' | 'unknown';

export interface UserPrefs {
  /** 재생목록·몰아보기를 펼쳤을 때 한 페이지 영상 수 */
  collectionPageSize: number;
  /** 추천 영상(홈·동영상) 기본 정렬 */
  recommendSort: 'desc' | 'asc';
  /** 쇼츠 기본 정렬 기준·순서 */
  shortsSortBy: 'upload' | 'live';
  shortsOrder: 'desc' | 'asc';
  /** 휴대폰 자판 (검색 오타 보정에 사용) */
  keyboard: KeyboardLayout;
  /** 검색했을 때 기본 정렬 */
  searchSort: 'accuracy' | 'desc' | 'asc';
  /** 카드/목록 보기: 모든 화면 같이 바꾸기 / 화면마다 따로 */
  viewStyleScope: 'global' | 'per-page';
}

export const DEFAULT_PREFS: UserPrefs = {
  collectionPageSize: 8,
  recommendSort: 'desc',
  shortsSortBy: 'upload',
  shortsOrder: 'desc',
  keyboard: 'unknown',
  searchSort: 'accuracy',
  viewStyleScope: 'global',
};

export const PAGE_SIZE_OPTIONS = [8, 12, 20, 30];

const KEY = 'uzuhama_user_prefs_v1';
const EVENT = 'uzuhama-prefs-change';

export function getPrefs(): UserPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_PREFS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPref<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
  const next = { ...getPrefs(), [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 공간 없음 */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* 무시 */ }
}

export function usePrefs(): UserPrefs {
  const [prefs, setPrefs] = useState<UserPrefs>(getPrefs);
  useEffect(() => {
    const on = () => setPrefs(getPrefs());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return prefs;
}

export const KEYBOARD_OPTIONS: { value: KeyboardLayout; label: string; desc: string }[] = [
  { value: 'qwerty', label: '쿼티 (두벌식)', desc: '아이폰 기본 · 갤럭시 쿼티 · 컴퓨터 자판' },
  { value: 'cheonjiin', label: '천지인', desc: '갤럭시 3×4 · ㆍ ㅡ ㅣ 로 모음 만들기' },
  { value: 'naratgeul', label: '나랏글', desc: '획 추가 · 쌍자음 키로 자음 만들기' },
  { value: 'danmoeum', label: '단모음', desc: '아이폰 단모음 · 쿼티와 비슷한 배열' },
  { value: 'unknown', label: '잘 모르겠어요', desc: '모든 자판 기준으로 함께 보정' },
];
