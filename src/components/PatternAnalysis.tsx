import { Target } from 'lucide-react';
import { PatternGuide } from '../types';
import React from 'react';
import { WidgetShareButton } from './common/WidgetShareButton';

interface PatternAnalysisProps {
  guides: PatternGuide[];
}

export function PatternAnalysis({ guides }: PatternAnalysisProps) {
  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-900/30 px-1 rounded mx-0.5">{part.slice(2, -2)}</strong>;
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
                {renderContent(guide.content)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
