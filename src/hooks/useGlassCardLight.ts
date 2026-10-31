import { useEffect } from 'react';

/**
 * [dev] 위젯 카드(.lg-card) 위 빛 반사
 * - 마우스: 카드 위에 있는 동안 커서 위치를 따라 빛남
 * - 터치: 누르고 있는 동안 손가락을 따라 빛나고, 떼면 천천히 사라짐
 * 화면 전체에 리스너 하나만 두고, 카드에는 CSS 변수(--lg-x, --lg-y, --lg-o)만 바꿈
 */
export function useGlassCardLight() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let raf = 0;
    let pending: { x: number; y: number; target: EventTarget | null } | null = null;
    let fadeTimer = 0;

    const setOff = (el: HTMLElement | null) => {
      if (el) el.style.setProperty('--lg-o', '0');
    };

    const flush = () => {
      raf = 0;
      if (!pending) return;
      const { x, y, target } = pending;
      pending = null;
      const card = target instanceof Element ? (target.closest('.lg-card') as HTMLElement | null) : null;
      if (card !== active) {
        setOff(active);
        active = card;
      }
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--lg-x', `${Math.round(x - r.left)}px`);
      card.style.setProperty('--lg-y', `${Math.round(y - r.top)}px`);
      card.style.setProperty('--lg-o', '1');
    };

    const queue = (e: PointerEvent) => {
      window.clearTimeout(fadeTimer);
      pending = { x: e.clientX, y: e.clientY, target: e.target };
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const onMove = (e: PointerEvent) => {
      // 터치는 누르고 있을 때만 (손가락이 떠 있는 상태는 없음)
      if (e.pointerType !== 'mouse' && e.buttons === 0) return;
      queue(e);
    };
    const onDown = (e: PointerEvent) => queue(e);
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      window.clearTimeout(fadeTimer);
      const el = active;
      fadeTimer = window.setTimeout(() => {
        setOff(el);
        if (active === el) active = null;
      }, 650);
    };
    const onLeave = () => {
      setOff(active);
      active = null;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.clearTimeout(fadeTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
