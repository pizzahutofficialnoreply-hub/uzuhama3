import React from 'react';

/**
 * 첨부 이미지(IMG_6232.png) 형태의 공유 아이콘
 * 상단이 열린 둥근 사각형 박스 + 중앙 위로 솟아오르는 화살표
 * 네모 크기를 살짝 줄인 균형 잡힌 비율 (strokeWidth 2.2)
 */
export const ShareBoxArrowIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 상단 개방형 둥근 사각 박스 (네모 크기를 살짝 줄임) */}
      <path d="M7.5 10H6.5C5.39543 10 4.5 10.8954 4.5 12V19C4.5 20.1046 5.39543 21 6.5 21H17.5C18.6046 21 19.5 20.1046 19.5 19V12C19.5 10.8954 18.6046 10 17.5 10H16.5" />
      {/* 위로 솟아오르는 화살표 기둥 */}
      <path d="M12 14.5V3" />
      {/* 화살촉 */}
      <path d="M7.5 7.5L12 3L16.5 7.5" />
    </svg>
  );
};
