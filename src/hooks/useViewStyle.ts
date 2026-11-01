import { useEffect, useState } from 'react';

/** 영상 목록 보기 방식 (카드 / 유튜브식 목록) — 추천 영상 탭과 재생목록이 같은 설정을 공유 */
export type ViewStyle = 'card' | 'list';
const KEY = 'uzuhama_view_style';
const EVENT = 'uzuhama-view-style';

const read = (): ViewStyle => {
  try { return localStorage.getItem(KEY) === 'list' ? 'list' : 'card'; } catch { return 'card'; }
};

export function useViewStyle(): [ViewStyle, (v: ViewStyle) => void] {
  const [style, setStyle] = useState<ViewStyle>(read);
  useEffect(() => {
    const sync = () => setStyle(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const update = (v: ViewStyle) => {
    try { localStorage.setItem(KEY, v); } catch {}
    setStyle(v);
    window.dispatchEvent(new Event(EVENT));
  };
  return [style, update];
}
