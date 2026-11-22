/**
 * 화면 크기 (아이폰 홈 화면 앱 높이 버그 보정 — index.html 의 window.__vp 설명 참고)
 *  - fullHeight(): 보이는 화면 전체 높이 (크기·어둡게 칠하기 등에 innerHeight 대신)
 *  - bottomBase(): 'position:fixed; bottom: X' 가 기준으로 삼는 줄 (아래에서 띄우는 메뉴 자리 계산에)
 */
type VP = { full: number; inner: number; fixedH: number; bottomAt: number };
const vp = (): VP | null => (typeof window !== 'undefined' ? ((window as any).__vp as VP) || null : null);
export function fullHeight() {
  if (typeof window === 'undefined') return 844;
  const v = vp();
  return v && v.inner === window.innerHeight ? Math.max(v.full, window.innerHeight) : window.innerHeight;
}
export function bottomBase() {
  if (typeof window === 'undefined') return 844;
  const v = vp();
  return v && v.inner === window.innerHeight && v.bottomAt > 0 ? v.bottomAt : window.innerHeight;
}
