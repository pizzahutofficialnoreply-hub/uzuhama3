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
    (window.innerWidth < 1024 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

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
