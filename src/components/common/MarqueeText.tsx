import { useEffect, useRef, useState } from 'react';

/**
 * 글이 칸보다 길어 잘릴 때만 옆으로 흘러가며 끝까지 보여 줌 (띠 공지 제목 등)
 *  - 글 뒤에 같은 글을 한 번 더 이어 붙여 두고 한 바퀴 돌면 처음과 똑같은 자리 → 되돌아가는 순간이 안 보이고 툭 끊기지 않음
 *  - 처음 1.6초 멈춤 → 초당 약 36px 로 한 바퀴 → 다시 멈춤 … 반복
 *  - 잘리지 않으면 가만히 / '동작 줄이기'를 켠 기기는 … 로 자름
 */
const GAP = 40;
export function MarqueeText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0); // 넘칠 때 글 한 줄 너비 (안 넘치면 0)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const b = box.current, f = first.current;
    if (!b || !f || reduce) return;
    const measure = () => { const fw = Math.ceil(f.scrollWidth); setW(fw > b.clientWidth + 1 ? fw : 0); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(b); ro?.observe(f);
    return () => ro?.disconnect();
  }, [children, reduce]);

  useEffect(() => {
    const t = track.current;
    if (!t || !w || !t.animate) return;
    const dist = w + GAP;
    const move = (dist / 36) * 1000;
    const hold = 1600;
    const a = t.animate([
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: hold / (hold + move), easing: 'linear' },
      { transform: `translateX(-${dist}px)`, offset: 1 },
    ], { duration: hold + move, iterations: Infinity });
    return () => a.cancel();
  }, [w]);

  return (
    <span ref={box} className={`block overflow-hidden ${reduce ? 'truncate' : ''} ${className}`}
      style={w ? { WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 14px), transparent)', maskImage: 'linear-gradient(to right, #000 calc(100% - 14px), transparent)' } : undefined}>
      <span ref={track} className="inline-flex whitespace-nowrap will-change-transform">
        <span ref={first} className="inline-block whitespace-nowrap">{children}</span>
        {w > 0 && <span className="inline-block whitespace-nowrap" style={{ paddingLeft: GAP }} aria-hidden>{children}</span>}
      </span>
    </span>
  );
}
