import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '../../utils';
import type { ViewStyle } from '../../hooks/useViewStyle';

/** 카드 / 목록 보기 전환 (작은 세그먼트 버튼) */
export function ViewStyleToggle({ value, onChange, className }: { value: ViewStyle; onChange: (v: ViewStyle) => void; className?: string }) {
  const item = (v: ViewStyle, label: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer',
        value === v
          ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs font-bold'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
  return (
    <div className={cn('flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60', className)} role="group" aria-label="보기 방식">
      {item('card', '카드', LayoutGrid)}
      {item('list', '목록', List)}
    </div>
  );
}
