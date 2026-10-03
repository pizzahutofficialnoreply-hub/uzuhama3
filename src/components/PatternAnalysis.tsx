import { Target, Activity } from 'lucide-react';
import { PatternGuide } from '../types';
import React from 'react';
import { WidgetShareButton } from './common/WidgetShareButton';

interface PatternAnalysisProps {
  guides: PatternGuide[];
  onIllnessClick?: (illness: { name: string; summary?: string; source?: string; sourceUrl?: string }) => void;
}

export function PatternAnalysis({ guides, onIllnessClick }: PatternAnalysisProps) {
  const renderContent = (guide: PatternGuide) => {
    const text = guide.content;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const rawInner = part.slice(2, -2);
        if (guide.illnessName && rawInner.includes(guide.illnessName)) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onIllnessClick?.({
                name: guide.illnessName!,
                summary: guide.illnessSummary,
                source: guide.illnessSource,
                sourceUrl: guide.illnessSourceUrl
              })}
              className="inline-flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400 bg-red-100/80 dark:bg-red-950/70 hover:bg-red-200/90 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-800 px-2 py-0.5 rounded-lg mx-1 my-0.5 transition-all cursor-pointer shadow-xs active:scale-95 group underline decoration-red-400 underline-offset-2"
              title="클릭하여 병명 의학 정보 및 구글 검색 결과 확인"
            >
              <Activity className="w-3.5 h-3.5 text-red-600 dark:text-red-400 animate-pulse" />
              <span>{rawInner}</span>
              <span className="text-[10.5px] font-semibold bg-red-500 text-white dark:bg-red-600 px-1.5 py-0.2 rounded-md no-underline">
                정보 보기
              </span>
            </button>
          );
        }

        return (
          <strong key={i} className="text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-900/30 px-1 rounded mx-0.5">
            {rawInner}
          </strong>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  return (
    <div id="summary-pattern-guide-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2 break-keep">
          <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          예측 가이드
        </h3>
        <WidgetShareButton targetId="summary-pattern-guide-card" title="예측 가이드" />
      </div>
      
      <div className="space-y-6">
        {guides.map((guide, index) => (
          <div key={guide.id} className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
              {index + 1}
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-semibold text-zinc-800 dark:text-zinc-100 mb-2 break-keep">{guide.title}</h4>
              <div className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap break-keep">
                {renderContent(guide)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
