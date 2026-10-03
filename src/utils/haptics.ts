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

// 전역 클릭/터치 이벤트 리스너를 통해 모든 버튼 및 인터랙티브 요소에 햅틱 피드백 자동 부여
export function setupGlobalHaptics(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleInteraction = (e: Event) => {
    // 마우스 클릭은 햅틱 제외 (터치/펜 인터랙션만)
    if ('pointerType' in e && (e as PointerEvent).pointerType === 'mouse') return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // opt-out 요소
    if (target.closest('[data-no-haptic="true"]')) return;

    // button, a, [role="button"], input[type="submit"] 등 인터랙티브 요소 확인
    const interactive = target.closest('button, [role="button"], a, input[type="button"], input[type="submit"], [data-haptic="true"]');
    if (interactive) {
      triggerHaptic(12);
    }
  };

  const usePointer = typeof window.PointerEvent !== 'undefined';
  const eventName = usePointer ? 'pointerdown' : 'touchstart';

  window.addEventListener(eventName, handleInteraction, { passive: true });

  return () => {
    window.removeEventListener(eventName, handleInteraction);
  };
}
