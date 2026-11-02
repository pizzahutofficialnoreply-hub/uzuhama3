import { useEffect, useRef } from 'react';
import { recordImpression, recordInterest, type InterestItem } from '../utils/interest';

/**
 * 카드에 붙이면 '관심 있어 보이는' 행동을 조용히 기록
 * - 화면에 절반 넘게 보인 채로 스크롤이 멈춰 2.5초 → dwell, 6초 → dwell-long (빠르게 지나가면 기록 안 함)
 * - PC 에서 마우스를 1.5초 올려 둠 → hover
 * - 1초 넘게 보이면 노출 1회
 * 반환한 ref 를 카드 바깥 요소에 달면 됨
 */
let lastScrollAt = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => { lastScrollAt = Date.now(); }, { passive: true, capture: true });
}

export function useInterestTracker<T extends HTMLElement>(item: InterestItem | null) {
  const ref = useRef<T>(null);
  const itemRef = useRef(item);
  itemRef.current = item;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let visibleSince = 0;
    let timer: number | undefined;
    let impressed = false;
    let dwelled = 0;
    const tick = () => {
      const it = itemRef.current;
      if (!it || !visibleSince) return;
      const still = Date.now() - lastScrollAt > 700; // 스크롤을 멈추고 보고 있음
      const seen = Date.now() - visibleSince;
      if (!impressed && seen > 1000) { impressed = true; recordImpression(it.id); }
      if (still && seen > 2500 && dwelled === 0) { dwelled = 1; recordInterest(it, 'dwell'); }
      if (still && seen > 6000 && dwelled === 1) { dwelled = 2; recordInterest(it, 'dwell-long'); }
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!visibleSince) visibleSince = Date.now();
        window.clearInterval(timer);
        timer = window.setInterval(tick, 500);
      } else {
        visibleSince = 0;
        window.clearInterval(timer);
      }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);

    // PC: 마우스를 올려 두면
    let hoverTimer: number | undefined;
    const enter = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return;
      hoverTimer = window.setTimeout(() => { const it = itemRef.current; if (it) recordInterest(it, 'hover'); }, 1500);
    };
    const leave = () => window.clearTimeout(hoverTimer);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(hoverTimer);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    };
  }, []);

  return ref;
}

/** 버튼 등에서 직접: 펼치기·공유 = engage, 재생 = play */
export function noteInterest(item: InterestItem | null | undefined, signal: 'engage' | 'play') {
  if (item) recordInterest(item, signal);
}
