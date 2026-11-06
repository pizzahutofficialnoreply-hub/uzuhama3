import { useEffect, useRef } from 'react';

/**
 * 뒤로 가기(안드로이드 뒤로 버튼·브라우저 뒤로·아이폰 쓸어 넘기기)로 열린 창 닫기
 * - 창이 열릴 때 방문 기록을 한 칸 쌓고, 뒤로 가기를 누르면 맨 위 창만 닫음 (사이트를 나가지 않음)
 * - 화면의 X 로 닫으면 쌓아 둔 한 칸을 조용히 되돌림
 * App 의 설정·의견·공지 뒤로 가기 처리와 겹치지 않게, 여기서 처리한 뒤로 가기는 layerHandledPop() 으로 알림
 */
type Layer = { close: () => void; byBack: boolean };
const stack: Layer[] = [];
let ignore = 0;
let handledAt = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; handledAt = Date.now(); return; }
    const top = stack.pop();
    if (top) { top.byBack = true; handledAt = Date.now(); top.close(); }
  });
}

/** 방금 뒤로 가기를 여기서 처리했는지 (App 의 다른 뒤로 가기 처리가 건너뛰도록) */
export const layerHandledPop = () => Date.now() - handledAt < 50;
/** 지금 열린 창이 있는지 */
export const hasOpenLayer = () => stack.length > 0;

export function useBackToClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const layer: Layer = { close: () => ref.current(), byBack: false };
    stack.push(layer);
    try { window.history.pushState({ ...(window.history.state || {}), uzuhamaLayer: stack.length }, ''); } catch { /* 무시 */ }
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (!layer.byBack) {
        ignore++;
        try { window.history.back(); } catch { ignore--; }
      }
    };
  }, [open]);
}
