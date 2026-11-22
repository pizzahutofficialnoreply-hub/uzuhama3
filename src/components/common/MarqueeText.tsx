import { useEffect, useRef, useState } from 'react';

/**
 * 글이 칸보다 길어 잘릴 때만 천천히 옆으로 흘러가며 끝까지 보여 줌 (띠 공지 제목 등)
 *  - 처음 1.6초 멈춤 → 초당 약 36px 로 끝까지 → 1.4초 멈춤 → 처음으로 돌아가 다시
 *  - 잘리지 않으면 그냥 가만히 / '동작 줄이기'를 켠 기기는 예전처럼 … 로 자름
 */
export function MarqueeText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const b = box.current, i = inner.current;
    if (!b || !i || reduce) return;
    const measure = () => setOver(Math.max(0, Math.ceil(i.scrollWidth - b.clientWidth)));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(b); ro?.observe(i);
    return () => ro?.disconnect();
  }, [children, reduce]);

  useEffect(() => {
    const i = inner.current;
    if (!i || !over || !i.animate) return;
    const move = (over + 8) / 36 * 1000;
    const total = 1600 + move + 1400;
    const a = i.animate([
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: 1600 / total, easing: 'linear' },
      { transform: `translateX(-${over + 8}px)`, offset: (1600 + move) / total },
      { transform: `translateX(-${over + 8}px)`, offset: 1 },
    ], { duration: total, iterations: Infinity });
    return () => a.cancel();
  }, [over]);

  return (
    <span ref={box} className={`block overflow-hidden ${reduce ? 'truncate' : ''} ${className}`}
      style={over ? { WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 14px), transparent)', maskImage: 'linear-gradient(to right, #000 calc(100% - 14px), transparent)' } : undefined}>
      <span ref={inner} className="inline-block whitespace-nowrap will-change-transform">{children}</span>
    </span>
  );
}
