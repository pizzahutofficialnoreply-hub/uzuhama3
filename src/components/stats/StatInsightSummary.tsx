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
        "px-3.5 py-2.5 rounded-2xl",
        "bg-purple-50/80 dark:bg-purple-950/30 border border-purple-100/90 dark:border-purple-900/40",
        "text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium transition-colors",
        className
      )}
    >
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
};
