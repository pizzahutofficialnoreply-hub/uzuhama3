import { useEffect, useState } from 'react';
import { getPrefs } from '../utils/userPrefs';

/**
 * 영상 목록 보기 방식 (카드 / 유튜브식 목록)
 * - 설정 '모든 화면 같이'(기본): 한 곳에서 바꾸면 추천 영상·재생목록·몰아보기 모두 같이 바뀜
 * - 설정 '화면마다 따로': 화면(scope)마다 따로 기억
 */
export type ViewStyle = 'card' | 'list';
export type ViewScope = 'recommend' | 'playlist' | 'compilation';
const KEY = 'uzuhama_view_style';
const EVENT = 'uzuhama-view-style';

const keyFor = (scope?: ViewScope) => (scope && getPrefs().viewStyleScope === 'per-page' ? `${KEY}_${scope}` : KEY);
const read = (scope?: ViewScope): ViewStyle => {
  try {
    const v = localStorage.getItem(keyFor(scope)) ?? localStorage.getItem(KEY);
    return v === 'list' ? 'list' : 'card';
  } catch { return 'card'; }
};

export function useViewStyle(scope?: ViewScope): [ViewStyle, (v: ViewStyle) => void] {
  const [style, setStyle] = useState<ViewStyle>(() => read(scope));
  useEffect(() => {
    const sync = () => setStyle(read(scope));
    window.addEventListener(EVENT, sync);
    window.addEventListener('uzuhama-prefs-change', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('uzuhama-prefs-change', sync); };
  }, [scope]);
  const update = (v: ViewStyle) => {
    try { localStorage.setItem(keyFor(scope), v); } catch {}
    setStyle(v);
    window.dispatchEvent(new Event(EVENT));
  };
  return [style, update];
}
