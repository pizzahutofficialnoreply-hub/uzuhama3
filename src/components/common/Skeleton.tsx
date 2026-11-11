import { cn } from '../../utils';

/** 불러오는 동안 자리만 잡아 두는 회색 블록 (반짝이며 지나감) */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-lg', className)} />;
}

/** 영상 카드 모양 자리 */
export function CardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[24px] overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" aria-hidden>
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className={cn('space-y-2', compact ? 'p-3' : 'p-4')}>
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3 mt-3" />
      </div>
    </div>
  );
}

/** 목록 한 줄 모양 자리 */
export function RowSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex items-center gap-3 p-2.5" aria-hidden>
      <Skeleton className="w-[42%] max-w-[176px] aspect-video rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn('h-3.5', i === 0 ? 'w-full' : 'w-2/3')} />)}
      </div>
    </div>
  );
}

/** 여러 줄 글 자리 */
export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="불러오는 중">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />)}
    </div>
  );
}
