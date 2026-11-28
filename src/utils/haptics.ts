import { wideAt } from './layoutSize';
/**
 * Android 및 모바일 기기를 위한 햅틱 피드백 유틸리티
 * PC UI 환경에서는 햅틱을 동작시키지 않으며, 미지원 브라우저에서도 안전하게 통과됩니다.
 */

let lastHapticTime = 0;

export function triggerHaptic(duration: number | number[] = 12): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastHapticTime < 50) return; // 짧은 중복 진동 방지
  lastHapticTime = now;

  // PC 환경(마우스 중심, 큰 화면) 감지: PC에서는 햅틱 피드백 제외
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
    (!wideAt(1024) && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

  if (!isMobile) return;

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
    }
  } catch {
    // 진동 API 미지원 또는 차단 시 오류 없이 통과
  }
}

// 전역: 버튼·링크 등을 '톡' 눌렀을 때만 진동 (스크롤하려고 손가락을 댔다 끈 건 진동 안 함)
export function setupGlobalHaptics(): () => void {
  if (typeof window === 'undefined') return () => {};

  let down: { x: number; y: number; t: number; el: Element } | null = null;
  const findTarget = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.closest('[data-no-haptic="true"]')) return null;
    return target.closest('button, [role="button"], a, input[type="button"], input[type="submit"], [data-haptic="true"]');
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return; // 마우스는 진동 없음
    const el = findTarget(e);
    down = el ? { x: e.clientX, y: e.clientY, t: Date.now(), el } : null;
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || e.pointerType === 'mouse') return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 10 || Date.now() - d.t > 700) return; // 끌었거나 오래 누름 → 스크롤·길게 누르기
    if (!d.el.isConnected) return;
    triggerHaptic(12);
  };
  const cancel = () => { down = null; };

  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', cancel, { passive: true }); // 브라우저가 스크롤로 넘기면 옴
  window.addEventListener('scroll', cancel, { passive: true, capture: true });

  return () => {
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('scroll', cancel, { capture: true } as any);
  };
}

/**
 * 아이폰 '톡' 진동 (사파리 18+): 아이폰은 진동 API가 없지만, 스위치 모양 체크박스를 켜고 끌 때 기기가 진동함
 *  → 화면 밖 스위치를 눌러 진동만 냄. 누름 이벤트는 밖으로 퍼지지 않게 막음 (다른 '바깥 누르면 닫기'에 영향 없게)
 */
let iosSwitch: HTMLLabelElement | null = null;
const IS_IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let lastTapTick = 0; // 손가락이 덮개 스위치를 직접 눌러 '톡'이 난 시각 (겹쳐서 또 울리지 않게)
/** 스크립트로 '톡' (iOS 26.4 까지만 됨 · 26.5부터는 손가락이 직접 누른 것만 울림 → 아래 덮개 방식이 맡음) */
export function iosHaptic(): void {
  if (typeof document === 'undefined') return;
  if (!IS_IOS) return;
  if (Date.now() - lastTapTick < 400) return;
  try {
    if (!iosSwitch || !iosSwitch.isConnected) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      const stop = (e: Event) => e.stopPropagation();
      label.addEventListener('click', stop);
      input.addEventListener('click', stop);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
  } catch { /* 지원 안 하면 조용히 통과 */ }
}


/**
 * 아이폰 '톡' — 손가락이 직접 누르는 방식 (iOS 26.5+ 에서도 됨)
 *  - iOS 26.5(WebKit 309082)부터 스크립트로 스위치를 눌러서는(label.click) 진동이 안 남.
 *    손가락의 진짜 누름이 스위치의 label 에 닿을 때만 울림.
 *  - 그래서 버튼마다 맨 앞에 투명한 label(+숨긴 스위치)을 깔아 둠: 누르면
 *    ① label 누름이 그대로 버튼으로 올라가 원래 onClick 이 돌고 ② label 이 스위치를 켜고 끄며 '톡'
 *  - 스위치 자신의 클릭은 막아서 버튼이 두 번 눌리지 않게
 *  - 안 까는 곳: 링크(a)·제출 버튼(label 이 먼저 받아 이동·제출이 안 되므로), 안에 또 버튼·입력칸이 있는 것,
 *    data-no-haptic="true" 안쪽, 꺼진(disabled) 버튼은 누를 때 진동 안 함
 *  - 끌기·꾹 누르기·흔들기처럼 '톡 누르기'가 아닌 동작은 iOS 에서 진동을 낼 방법이 없음
 */
const HOST = 'button:not([type="submit"]), [role="button"]:not(a), [role="switch"]:not(a), [role="tab"]:not(a), [data-haptic="true"]:not(a)';
const INNER = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"], [contenteditable="true"]';
function makeOverlay(): HTMLLabelElement {
  const label = document.createElement('label');
  label.setAttribute('data-hx', '');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:absolute;inset:0;z-index:5;margin:0;padding:0;border-radius:inherit;cursor:inherit;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none;';
  input.addEventListener('click', (e) => e.stopPropagation()); // 스위치 클릭이 버튼까지 올라가 또 눌리지 않게
  label.appendChild(input);
  label.addEventListener('click', (e) => {
    const host = label.parentElement as HTMLElement | null;
    if (!host || (host as HTMLButtonElement).disabled || host.getAttribute('aria-disabled') === 'true' || host.closest('[data-no-haptic="true"]')) { e.preventDefault(); return; }
    lastTapTick = Date.now();
  });
  return label;
}
function ensure(host: Element) {
  const el = host as HTMLElement;
  const first = el.firstElementChild;
  const has = first && first.hasAttribute('data-hx') ? first : el.querySelector(':scope > label[data-hx]');
  // 안쪽에 진짜 버튼·입력칸이 있으면 덮지 않음 (우리 덮개의 숨긴 스위치는 빼고 셈)
  const bad = el.closest('[data-no-haptic="true"]') || [...el.querySelectorAll(INNER)].some((x) => !x.closest('label[data-hx]'));
  if (bad) { has?.remove(); return; }
  if (has) { if (el.firstChild !== has) el.insertBefore(has, el.firstChild); return; }
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.insertBefore(makeOverlay(), el.firstChild); // 맨 앞: 'space-x' 처럼 마지막 칸을 보는 꾸밈이 안 바뀌게
}
export function setupIosTapHaptics(): () => void {
  if (typeof document === 'undefined' || !IS_IOS) return () => {};
  let pend = new Set<Element>(); let queued = false;
  const flush = () => {
    queued = false;
    const list = [...pend]; pend = new Set();
    for (const n of list) {
      if (!(n as Element).isConnected) continue;
      if ((n as Element).matches?.(HOST)) ensure(n);
      (n as Element).querySelectorAll?.(HOST).forEach(ensure);
      // 안쪽에 버튼이 새로 생기면 바깥 덮개는 걷어야 함
      const outer = (n as Element).parentElement?.closest(HOST); if (outer) ensure(outer);
    }
  };
  const add = (n: Node | null) => { if (n && n.nodeType === 1 && !(n as Element).hasAttribute('data-hx')) pend.add(n as Element); if (!queued) { queued = true; requestAnimationFrame(flush); } };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => add(n.nodeType === 1 ? n : (n.parentElement as Node | null)));
        // 글자만 바꾸며 덮개가 지워진 버튼 (React 가 textContent 로 바꿀 때)
        if (m.removedNodes.length && m.target.nodeType === 1) add(m.target);
      } else if (m.type === 'attributes') add(m.target);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'data-haptic', 'data-no-haptic', 'type'] });
  add(document.body);
  return () => mo.disconnect();
}
