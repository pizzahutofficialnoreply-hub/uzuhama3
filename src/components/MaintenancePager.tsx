import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { fullHeight } from '../utils/viewport';

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

  // 화면 높이: 바깥 창 높이와 문서 높이 중 큰 쪽 (홈 화면 앱에서 아래 안전 영역까지 덮게)
  //  홈 화면 앱(아이폰)은 앱이 화면 전체를 쓰는데도 창 높이가 위쪽 안전 영역만큼 짧게 나올 때가 있어 → 기기 화면 높이를 그대로 씀
  const measure = () => fullHeight();
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? measure() : 0));
  useEffect(() => {
    const on = () => setVh(measure());
    window.addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); window.visualViewport?.removeEventListener('resize', on); };
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

  // body 로 바로 띄움 (부모에 transform 이 있으면 fixed 가 부모 기준이 돼 높이가 짧아지는 것 방지)
  return createPortal(
    // 아이폰 사파리에서 아래 도구 막대 자리만큼 비어 잘려 보이던 것 → 가장 큰 화면 높이(100lvh)까지 덮음
    <div className="fixed left-0 right-0 top-0 overflow-hidden bg-zinc-50 dark:bg-black" style={{ height: `max(100lvh, ${vh}px)` }} onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <motion.div className="absolute inset-0" animate={{ y: page === 0 ? '0%' : '-100%' }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
        <section className="absolute inset-0 overflow-hidden">{first(() => go(1))}</section>
        <section ref={detailRef} className="absolute left-0 right-0 top-full h-full overflow-y-auto overscroll-contain select-text">
          {/* 내용이 화면보다 짧으면 위아래 가운데, 길면 위에서부터 스크롤 */}
          <div className="min-h-full flex flex-col justify-center">{detail}</div>
        </section>
      </motion.div>
    </div>,
    document.body,
  );
}
