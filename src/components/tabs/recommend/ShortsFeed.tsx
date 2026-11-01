import React, { useEffect, useMemo, useState } from 'react';
import { fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { ShortsCard } from '../../common/ShortsCard';
import { Pagination } from '../../common/Pagination';
import { useVideoMetaMany, toKstDate } from '../../../hooks/useVideoDuration';
import { cn } from '../../../utils';

/** 추천 영상 > Shorts 탭: 기록에 등록된 모든 쇼츠 (생방일순 / 업로드순) */
interface ShortsFeedProps {
  logs: any;
  searchTerm: string;
  selectedCategories: string[];
  onNavigateToCalendar?: (date: string) => void;
}

const PAGE = 24;

export function ShortsFeed({ logs, searchTerm, selectedCategories, onNavigateToCalendar }: ShortsFeedProps) {
  const [page, setPage] = useState(1);
  // 정렬: 생방일순(방송 날짜) / 업로드순(유튜브에 올라온 날짜)
  const [sortBy, setSortBy] = useState<'live' | 'upload'>(() => (sessionStorage.getItem('rec_shorts_sort') === 'upload' ? 'upload' : 'live'));
  const changeSort = (v: 'live' | 'upload') => { setSortBy(v); setPage(1); try { sessionStorage.setItem('rec_shorts_sort', v); } catch {} };

  const allShorts = useMemo(() => {
    const list = Array.isArray(logs) ? logs : Object.values(logs || {});
    const seen = new Set<string>();
    const out: { id: string; url: string; title: string; date: string; category: string; liveUrl?: string; editUrl?: string }[] = [];
    list.forEach((log: any) => {
      (Array.isArray(log?.shorts) ? log.shorts : []).forEach((s: any) => {
        const url = typeof s === 'string' ? s : s?.url;
        const id = extractYoutubeId(url || '');
        if (!url || !id || seen.has(id)) return;
        if (s?.isCompilation || s?.compilationId) return;
        seen.add(id);
        out.push({
          id,
          url,
          title: (typeof s === 'string' ? '' : s?.title) || '',
          date: log?.date || '',
          category: (typeof s === 'string' ? '' : s?.category) || log?.category || '',
          liveUrl: (Array.isArray(log?.vods) ? log.vods : []).find((v: any) => v?.url)?.url,
          editUrl: (Array.isArray(log?.edited) ? log.edited : []).find((v: any) => v?.url && !v.isCompilation && !v.compilationId)?.url,
        });
      });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim();
    const cats = selectedCategories.includes('전체') ? [] : selectedCategories.filter((c) => c !== '몰아보기');
    return allShorts.filter((s) => {
      if (cats.length > 0) {
        const tokens = s.category.split(',').map((t) => t.trim());
        if (!cats.some((c) => tokens.includes(c))) return false;
      }
      if (!term) return true;
      return fuzzyKoreanMatch(term, s.title) || fuzzyKoreanMatch(term, s.category) || s.date.includes(term);
    });
  }, [allShorts, searchTerm, selectedCategories]);

  const metaMap = useVideoMetaMany(filtered.map((s) => s.id), sortBy === 'upload');
  const sorted = useMemo(() => {
    if (sortBy !== 'upload') return filtered;
    const t = (id: string) => Date.parse(metaMap.get(id)?.publishedAt || '') || 0;
    return [...filtered].sort((a, b) => t(b.id) - t(a.id) || b.date.localeCompare(a.date));
  }, [filtered, sortBy, metaMap]);

  useEffect(() => { setPage(1); }, [searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
        {allShorts.length === 0 ? '아직 등록된 쇼츠가 없어요.' : '조건에 맞는 쇼츠가 없어요.'}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1 mb-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{filtered.length}</strong>개 쇼츠
        </span>
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60" role="group" aria-label="쇼츠 정렬">
          {([['live', '생방일순'], ['upload', '업로드순']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => changeSort(v)}
              aria-pressed={sortBy === v}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                sortBy === v ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5">
        {sorted.slice((page - 1) * PAGE, page * PAGE).map((s) => (
          <ShortsCard
            key={s.id}
            url={s.url}
            title={s.title}
            liveUrl={s.liveUrl}
            editUrl={s.editUrl}
            caption={sortBy === 'upload' && metaMap.get(s.id)?.publishedAt
              ? `${toKstDate(metaMap.get(s.id)!.publishedAt!)} 업로드`
              : s.date ? `${s.date} 방송` : undefined}
            onCaptionClick={s.date && onNavigateToCalendar ? () => onNavigateToCalendar(s.date) : undefined}
          />
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
