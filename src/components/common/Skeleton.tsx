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

/** 기록 탭 모양: 달력 + 기간 버튼 + 검색창 + 표 */
export function CalendarTabSkeleton() {
  return (
    <div className="py-2 space-y-5" role="status" aria-label="기록을 불러오는 중">
      <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between"><Skeleton className="h-6 w-32" /><div className="flex gap-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-8 w-8 rounded-full" /></div></div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      </div>
      <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">{['w-16', 'w-20', 'w-20', 'w-16', 'w-14'].map((w, i) => <Skeleton key={i} className={cn('h-9 rounded-full', w)} />)}</div>
        <Skeleton className="h-12 w-full rounded-full" />
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-start gap-4 py-3.5">
              <div className="w-28 space-y-1.5 shrink-0"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-20" /></div>
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-16 rounded-md" /><Skeleton className="h-4 w-3/4" /></div>
              <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 분석 탭 모양: 숫자 칸 + 그래프 */
export function StatsTabSkeleton() {
  return (
    <div className="py-2 space-y-5" role="status" aria-label="분석을 불러오는 중">
      <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-3xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-20" /></div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex items-end gap-2 h-40">{[40, 70, 55, 90, 65, 30, 80, 50, 75, 45, 60, 85].map((h, j) => <span key={j} className="skeleton flex-1 rounded-md" style={{ height: `${h}%` }} />)}</div>
        </div>
      ))}
    </div>
  );
}

/** 검색 탭 모양: 검색창 + 하위 탭 + 영상 카드 */
export function SearchTabSkeleton() {
  return (
    <div className="py-2 space-y-5" role="status" aria-label="불러오는 중">
      <Skeleton className="h-12 w-full rounded-full" />
      <div className="flex gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-16 rounded-full" />)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}</div>
    </div>
  );
}
