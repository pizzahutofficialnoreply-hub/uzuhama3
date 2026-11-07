import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * 점검 화면: 두 장짜리 (스크롤이 이어지지 않고 페이지가 넘어감)
 *  1장: 자물쇠·점검 중·날짜·시간 (스크롤 없음)
 *  2장: 자세히 보기 (이 장 안에서만 스크롤, 맨 위에서 더 올리면 1장으로)
 */
export function MaintenancePager({ first, detail }: { first: (goDetail: () => void) => React.ReactNode; detail: React.ReactNode }) {
  const [page, setPage] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);
  const lock = useRef(0);

  const go = (p: number) => {
    if (Date.now() < lock.current) return;
    lock.current = Date.now() + 700;
    setPage(p);
    if (p === 1) requestAnimationFrame(() => { if (detailRef.current) detailRef.current.scrollTop = 0; });
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const atTop = () => (detailRef.current?.scrollTop || 0) <= 0;
  const onWheel = (e: React.WheelEvent) => {
    if (page === 0 && e.deltaY > 15) go(1);
    else if (page === 1 && e.deltaY < -15 && atTop()) go(0);
  };
  const onTouchStart = (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchY.current;
    touchY.current = null;
    if (page === 0 && dy < -50) go(1);
    else if (page === 1 && dy > 70 && atTop()) go(0);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (page === 0 && ['ArrowDown', 'PageDown', ' '].includes(e.key)) go(1);
      if (page === 1 && ['ArrowUp', 'PageUp'].includes(e.key) && atTop()) go(0);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <div className="fixed inset-0 overflow-hidden bg-zinc-50 dark:bg-black" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <motion.div className="absolute inset-0" animate={{ y: page === 0 ? '0%' : '-100%' }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
        <section className="absolute inset-0 overflow-hidden">{first(() => go(1))}</section>
        <section ref={detailRef} className="absolute left-0 right-0 top-full h-full overflow-y-auto overscroll-contain select-text">
          {detail}
        </section>
      </motion.div>
    </div>
  );
}
