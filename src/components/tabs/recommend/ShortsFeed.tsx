import React, { useMemo, useState } from 'react';
import { cn, fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { ShortsCard } from '../../common/ShortsCard';

/** 추천 영상 > Shorts 탭: 기록에 등록된 모든 쇼츠를 최신 방송순으로 */
interface ShortsFeedProps {
  logs: any;
  searchTerm: string;
  selectedCategories: string[];
  onNavigateToCalendar?: (date: string) => void;
}

const PAGE = 24;

export function ShortsFeed({ logs, searchTerm, selectedCategories, onNavigateToCalendar }: ShortsFeedProps) {
  const [visible, setVisible] = useState(PAGE);

  const allShorts = useMemo(() => {
    const list = Array.isArray(logs) ? logs : Object.values(logs || {});
    const seen = new Set<string>();
    const out: { id: string; url: string; title: string; date: string; category: string }[] = [];
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

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
        {allShorts.length === 0 ? '아직 등록된 쇼츠가 없어요.' : '조건에 맞는 쇼츠가 없어요.'}
      </div>
    );
  }

  return (
    <div>
      <p className="px-1 mb-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
        총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{filtered.length}</strong>개 쇼츠
      </p>
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5">
        {filtered.slice(0, visible).map((s) => (
          <ShortsCard
            key={s.id}
            url={s.url}
            title={s.title}
            caption={s.date ? `${s.date} 방송` : undefined}
            onCaptionClick={s.date && onNavigateToCalendar ? () => onNavigateToCalendar(s.date) : undefined}
          />
        ))}
      </div>
      {visible < filtered.length && (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className={cn(
              'px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors',
              'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
            )}
          >
            쇼츠 더 보기 ({filtered.length - visible}개 남음)
          </button>
        </div>
      )}
    </div>
  );
}
