import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils';
import { shareTextOrClipboard } from '../../utils/shareUtils';
import { ShareBoxArrowIcon } from './ShareIcon';

/**
 * 영상 카드의 공유 버튼과 같은 모양·동작 (휴대폰은 공유 창, 아니면 복사)
 * - 글은 누를 때 만듦 (카드가 많아도 미리 만들지 않음)
 */
export function ShareButton({ getText, title, className, compact = false, onShare }: {
  onShare?: () => void;
  getText: () => string;
  title: string;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    onShare?.();
    try { await shareTextOrClipboard(getText(), title); } catch (err) { console.error('Share error:', err); } finally { setBusy(false); }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn('rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center', compact ? 'p-1' : 'p-1.5', className)}
      title="방송 및 영상 정보 공유"
      aria-label="공유"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600 dark:text-zinc-400" /> : <ShareBoxArrowIcon className="w-4 h-4" />}
    </button>
  );
}
