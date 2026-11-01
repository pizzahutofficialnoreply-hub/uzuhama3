import React from 'react';

export const YoutubeLogo = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

export const ShortsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.23 6.74l1.2.49L6 14.93a3.75 3.75 0 003.5 6.63l8.5-4.5a3.74 3.74 0 00-.23-6.74zM10 14.65v-5.3L15 12l-5 2.65z" />
  </svg>
);

export const PlaySquare = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <polygon points="10 8 16 12 10 16 10 8"></polygon>
  </svg>
);

/**
 * 사이트 공통 재생 버튼: 블러가 들어간 반투명 회색 원 (쇼츠 카드와 같은 모양)
 * 삼각형은 무게중심이 원의 정중앙에 오도록 그려서 눈으로 봐도 가운데에 있어 보임
 */
export const GlassPlayButton = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const box = size === 'sm' ? 'w-11 h-11' : size === 'lg' ? 'w-16 h-16' : 'w-14 h-14';
  const icon = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-7 h-7';
  return (
    <span className={`${box} rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/25 text-white flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover/thumb:scale-110 group-hover/short:scale-110 group-active/thumb:scale-95`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={icon} aria-hidden="true">
        {/* 꼭짓점 (8.5,5.5) (8.5,18.5) (19,12) → 무게중심 x≈12 */}
        <path d="M9.6 5.9c-.7-.42-1.6.08-1.6.9v10.4c0 .82.9 1.32 1.6.9l8.66-5.2a1.05 1.05 0 0 0 0-1.8L9.6 5.9z" />
      </svg>
    </span>
  );
};
