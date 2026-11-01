import React, { useEffect, useState } from 'react';

/** 추천 영상 탭과 같은 숫자 페이지 넘기기 (<< < 1 2 3 > >>) — 모든 목록에서 같은 모양으로 사용 */
export function Pagination({ currentPage, totalPages, onChange, className }: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (totalPages <= 1) return null;
  const blockSize = isMobile ? 5 : 10;
  const currentBlock = Math.floor((currentPage - 1) / blockSize);
  const startPage = currentBlock * blockSize + 1;
  const endPage = Math.min(startPage + blockSize - 1, totalPages);
  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  const arrow = 'p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm font-semibold';

  return (
    <nav aria-label="페이지 이동" className={className ?? 'flex justify-center items-center gap-1 sm:gap-2 mt-8'}>
      <button type="button" onClick={() => go(currentPage - blockSize)} disabled={currentPage <= blockSize} className={arrow} aria-label="이전 묶음">&lt;&lt;</button>
      <button type="button" onClick={() => go(currentPage - 1)} disabled={currentPage === 1} className={arrow} aria-label="이전 페이지">&lt;</button>
      <div className="flex gap-1">
        {Array.from({ length: endPage - startPage + 1 }).map((_, i) => {
          const page = startPage + i;
          return (
            <button
              key={page}
              type="button"
              onClick={() => go(page)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                currentPage === page
                  ? 'bg-purple-600 text-white border border-purple-600'
                  : 'border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => go(currentPage + 1)} disabled={currentPage === totalPages} className={arrow} aria-label="다음 페이지">&gt;</button>
      <button type="button" onClick={() => go(currentPage + blockSize)} disabled={currentPage > totalPages - blockSize} className={arrow} aria-label="다음 묶음">&gt;&gt;</button>
    </nav>
  );
}
