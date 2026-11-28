import { cn } from '../../utils';

/** 불러오는 동안 자리만 잡아 두는 회색 블록 (반짝이며 지나감) */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-lg', className)} />;
}

/** 영상 카드 모양 자리 */
export function CardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[24px] overflow-hidden bg-white dark:bg-zinc-900" aria-hidden>
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

/** 실제 화면과 같은 틀: 흰(다크는 #171719) 둥근 판, 테두리 없음 */
const PANEL = 'rounded-[26px] bg-white dark:bg-zinc-900';

/** 기록 탭 모양: '방송 기록 달력' 판 (제목 · 날짜 설정 · 달 넘기기 · 요일 · 날짜 칸) */
export function CalendarTabSkeleton() {
  return (
    <div className="py-2 space-y-3" role="status" aria-label="기록을 불러오는 중">
      <div className={cn(PANEL, 'p-4 sm:p-6')}>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-8 w-48 rounded-full" />
        <div className="mt-4 flex items-center gap-3"><Skeleton className="h-7 w-7 rounded-full" /><Skeleton className="h-9 w-36 rounded-full" /><Skeleton className="h-7 w-7 rounded-full" /></div>
        <div className="mt-5 grid grid-cols-7 gap-y-[52px] gap-x-2">
          {Array.from({ length: 7 }, (_, i) => <Skeleton key={`w${i}`} className="h-3.5 w-4 mx-auto rounded" />)}
          {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-4 w-5 mx-auto rounded" />)}
        </div>
      </div>
    </div>
  );
}

/** 분석 탭 모양: '상세 분석' 판(기간 버튼) · 하위 탭 · 요약 판(두 줄 제목 + 세 줄) */
export function StatsTabSkeleton() {
  return (
    <div className="py-2 space-y-3" role="status" aria-label="분석을 불러오는 중">
      <div className={cn(PANEL, 'p-4 sm:p-5')}>
        <div className="flex items-center justify-between"><Skeleton className="h-6 w-24" /><Skeleton className="h-5 w-16" /></div>
        <div className="mt-4 flex gap-1.5">{['w-12', 'w-16', 'w-14', 'w-14', 'w-10'].map((w, i) => <Skeleton key={i} className={cn('h-8 rounded-full', w)} />)}</div>
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className={cn(PANEL, 'p-5 space-y-4')}>
        <Skeleton className="h-3 w-32" />
        <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-6 w-28" /></div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 pt-1"><Skeleton className="h-10 w-10 rounded-full shrink-0" /><div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-28" /></div></div>
        ))}
      </div>
    </div>
  );
}

/** 목록 한 줄 (검색 탭 목록 보기와 같은 크기: 왼쪽 썸네일 · 오른쪽 두 줄 제목) */
export function ListRowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-2" aria-hidden>
      <Skeleton className="w-[37%] max-w-[200px] aspect-video rounded-[16px] shrink-0" />
      <div className="flex-1 space-y-2 pt-1"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-1/2" /></div>
    </div>
  );
}

/** 검색 탭 모양: 하위 탭 · 정렬 판 · '총 N개'+보기 방식 · 목록(또는 카드) — 지금 보기 방식 그대로 */
export function SearchTabSkeleton() {
  let card = false;
  try { card = localStorage.getItem('uzuhama_view_style') === 'card'; } catch { /* */ }
  return (
    <div className="py-2 space-y-4" role="status" aria-label="불러오는 중">
      <div className="flex gap-2">{['w-12', 'w-16', 'w-16', 'w-14', 'w-20'].map((w, i) => <Skeleton key={i} className={cn('h-10 rounded-full', w)} />)}</div>
      <div className={cn(PANEL, 'p-4 space-y-3')}>
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-2 gap-2"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
      </div>
      <div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-28 rounded-xl" /></div>
      {card
        ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[24px] overflow-hidden bg-white dark:bg-zinc-900" aria-hidden>
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="p-4 space-y-2"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-10 w-full rounded-xl mt-3" /></div>
            </div>
          ))}</div>
        : <div className="space-y-1">{Array.from({ length: 7 }, (_, i) => <ListRowSkeleton key={i} />)}</div>}
    </div>
  );
}
