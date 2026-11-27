import React from 'react';
import { cn } from '../../utils';

interface StatInsightSummaryProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * StatInsightSummary
 * 
 * 통계 차트 및 테이블의 핵심 인사이트를 요약해 보여주는 한줄 정리 컴포넌트입니다.
 * 은은한 보라/중립 테마와 선명한 가독성(WCAG AA 준수)으로 눈에 띄게 배치됩니다.
 */
export const StatInsightSummary: React.FC<StatInsightSummaryProps> = ({ children, className }) => {
  if (!children) return null;

  return (
    <div 
      className={cn(
        // 토스식: 테두리·보라 상자 대신 옅은 회색 면에 문장 하나
        "px-4 py-3 rounded-2xl",
        "bg-zinc-100/80 dark:bg-zinc-800/60",
        "text-[length:calc(13px*var(--fs,1))] text-zinc-700 dark:text-zinc-300 leading-relaxed transition-colors",
        className
      )}
    >
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
};
