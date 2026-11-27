import { Activity } from 'lucide-react';
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
              className="inline font-bold underline decoration-purple-500 underline-offset-4 text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 cursor-pointer transition-colors mx-0.5"
              title="클릭하여 병명 의학 정보 확인"
            >
              {rawInner}
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
    <div id="summary-pattern-guide-card" className="bg-white dark:bg-zinc-900 rounded-[26px] px-6 pt-5 pb-5 relative">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[length:calc(20px*var(--fs,1))] sm:text-[length:calc(22px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em] flex items-center gap-2 break-keep">
          예측 가이드
        </h3>
        <WidgetShareButton targetId="summary-pattern-guide-card" title="예측 가이드" />
      </div>
      
      <div className="space-y-6">
        {guides.map((guide, index) => (
          <div key={guide.id} className="flex gap-4">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
              {index + 1}
            </div>
            <div>
              <h4 className="text-[length:calc(17px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-zinc-100 mb-1 break-keep">{guide.title}</h4>
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
