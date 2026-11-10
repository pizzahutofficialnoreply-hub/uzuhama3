/**
 * 팝업·밑에서 올라오는 창이 떠 있는 동안 뒷화면이 스크롤되지 않게 (모든 화면 공통)
 * - 화면에 [role="dialog"] 또는 [aria-modal="true"] 가 보이면 잠금, 다 사라지면 원래 위치로
 * - iOS 사파리는 body overflow:hidden 만으로는 뒤가 같이 움직여서 body 를 그 자리에 고정(position: fixed)
 * - 창 안쪽(목록 등)은 그대로 스크롤됨
 */
let locked = false;
let savedY = 0;
let saved: Partial<CSSStyleDeclaration> = {};

function anyOverlay(): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 화면 대부분을 덮는 고정 층(팝업 배경·밑에서 올라오는 창·설정처럼 화면 전체를 덮는 창) 또는 dialog 표시
  const els = document.querySelectorAll<HTMLElement>('.fixed, [role="dialog"], [aria-modal="true"], [data-overlay="true"]');
  for (const el of els) {
    if (el.closest('[data-no-scroll-lock]') || el.tagName === 'IFRAME') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    if (el.matches('[role="dialog"], [aria-modal="true"], [data-overlay="true"]')) return true;
    if (cs.position === 'fixed' && r.width >= vw * 0.9 && r.height >= vh * 0.9) return true;
  }
  return false;
}

function lock() {
  if (locked) return;
  locked = true;
  const b = document.body;
  savedY = window.scrollY;
  saved = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, width: b.style.width, overflow: b.style.overflow };
  Object.assign(b.style, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
  document.documentElement.classList.add('overlay-open');
}

function unlock() {
  if (!locked) return;
  locked = false;
  Object.assign(document.body.style, saved);
  document.documentElement.classList.remove('overlay-open');
  window.scrollTo(0, savedY);
}

let raf = 0;
const check = () => { raf = 0; if (anyOverlay()) lock(); else unlock(); };
const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };

export function startOverlayScrollLock() {
  if (typeof window === 'undefined' || (window as any).__overlayLock) return;
  (window as any).__overlayLock = true;
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal', 'data-overlay', 'hidden'] });
  schedule();
}

/** 지금 잠겨 있으면 원래 스크롤 위치 (잠긴 동안 window.scrollY 는 0) */
export const overlayScrollY = () => (locked ? savedY : window.scrollY);
