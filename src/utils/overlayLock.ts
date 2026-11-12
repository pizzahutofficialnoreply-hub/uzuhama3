/**
 * 팝업·밑에서 올라오는 창이 떠 있는 동안 뒷화면이 스크롤되지 않게 (모든 화면 공통)
 * - 화면에 [role="dialog"] 또는 [aria-modal="true"] 가 보이면 잠금, 다 사라지면 원래 위치로
 * - html 스크롤을 막고, 창 바깥을 끄는 손가락 움직임은 막음 (body 를 고정하면 위 헤더가 잘려서 안 씀)
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

/** 창 안에서 실제로 스크롤되는 곳이면 그대로 두고, 아니면 뒤 화면이 끌려가지 않게 막음 */
function scrollableInside(t: EventTarget | null, dy: number): boolean {
  let n = t as HTMLElement | null;
  while (n && n !== document.body && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      // 맨 위에서 더 내리거나 맨 아래에서 더 올리면 뒤 화면이 끌려가므로 막음
      if (dy > 0 && n.scrollTop <= 0) return false;
      if (dy < 0 && n.scrollTop + n.clientHeight >= n.scrollHeight - 1) return false;
      return true;
    }
    if (n.matches('input, textarea, [data-swipe-row], [data-allow-touch]')) return true;
    n = n.parentElement;
  }
  return false;
}
let ty = 0;
const onStart = (e: TouchEvent) => { ty = e.touches[0]?.clientY ?? 0; };
const onMove = (e: TouchEvent) => {
  if (!locked || e.touches.length !== 1) return;
  const dy = (e.touches[0]?.clientY ?? 0) - ty;
  if (!scrollableInside(e.target, dy) && e.cancelable) e.preventDefault();
};

function lock() {
  if (locked) return;
  locked = true;
  const h = document.documentElement;
  savedY = window.scrollY;
  // body 를 position:fixed 로 고정하면 위쪽 고정 헤더(sticky)가 화면 밖으로 밀려 잘려 보여서,
  // 스크롤 위치는 그대로 두고 html 스크롤만 막음 + 뒤 화면을 끄는 손가락 움직임만 막음
  saved = { overflow: h.style.overflow, overscrollBehavior: (h.style as any).overscrollBehavior };
  h.style.overflow = 'hidden';
  (h.style as any).overscrollBehavior = 'none';
  h.classList.add('overlay-open');
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
}

function unlock() {
  if (!locked) return;
  locked = false;
  const h = document.documentElement;
  h.style.overflow = saved.overflow || '';
  (h.style as any).overscrollBehavior = (saved as any).overscrollBehavior || '';
  h.classList.remove('overlay-open');
  document.removeEventListener('touchstart', onStart);
  document.removeEventListener('touchmove', onMove);
  // 혹시 브라우저가 위치를 옮겼으면 되돌림
  if (Math.abs(window.scrollY - savedY) > 2) window.scrollTo(0, savedY);
}

let raf = 0;
const check = () => { raf = 0; if (anyOverlay()) lock(); else unlock(); };
const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };

export function startOverlayScrollLock() {
  if (typeof window === 'undefined' || (window as any).__overlayLock) return;
  (window as any).__overlayLock = true;
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal', 'data-overlay', 'hidden'] });
  // 다른 화면(PDF 미리보기 등)에 갔다 돌아오면 다시 확인: 떠 있는 창이 없으면 잠금·overflow 모두 풀기
  const recheck = () => { check(); if (!anyOverlay() && document.body.style.overflow === 'hidden' && !document.querySelector('[role="dialog"]')) document.body.style.overflow = ''; };
  window.addEventListener('pageshow', recheck);
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
  schedule();
}

/** 지금 잠겨 있으면 원래 스크롤 위치 (잠긴 동안 window.scrollY 는 0) */
export const overlayScrollY = () => window.scrollY;
