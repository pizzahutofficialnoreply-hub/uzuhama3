import React from 'react';
import { Bookmark } from 'lucide-react';
import { cn } from '../../utils';
import { requestSave, useMyPlaylists, type MyItemKind } from '../../utils/myPlaylists';

/** 카드·목록·쇼츠의 저장 버튼 (담겨 있으면 채워진 모양) */
export function SaveButton({ id, kind, title, className, compact = false, onSave }: {
  id: string; kind: MyItemKind; title: string; className?: string; compact?: boolean; onSave?: () => void;
}) {
  const { lists } = useMyPlaylists();
  const saved = Boolean(id) && lists.some((l) => l.items.some((x) => x.id === id));
  if (!id) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave?.(); requestSave({ id, kind, title }); }}
      className={cn('rounded-lg transition-colors shrink-0 cursor-pointer flex items-center justify-center', saved ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200', 'hover:bg-zinc-100 dark:hover:bg-zinc-800', compact ? 'p-1' : 'p-1.5', className)}
      title={saved ? '저장됨 (눌러서 바꾸기)' : '재생목록에 저장'}
      aria-label={saved ? '저장됨' : '저장'}
      aria-pressed={saved}
    >
      <Bookmark className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
