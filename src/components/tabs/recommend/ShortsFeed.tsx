import React, { useEffect, useMemo, useState } from 'react';
import { fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { ShortsCard } from '../../common/ShortsCard';
import { Pagination } from '../../common/Pagination';
import { useVideoMetaMany, toKstDate } from '../../../hooks/useVideoDuration';
import { cn } from '../../../utils';

/** 추천 영상 > Shorts 탭: 채널 쇼츠 전체 + 기록에 등록된 쇼츠 + #shorts 몰아보기 (업로드순 기본 / 생방일순) */
interface ShortsFeedProps {
  logs: any;
  searchTerm: string;
  selectedCategories: string[];
  onNavigateToCalendar?: (date: string) => void;
}

const PAGE = 24;

type ShortEntry = { id: string; url: string; title: string; date: string; category: string; liveUrl?: string; editUrl?: string; publishedAt?: string; isCompilation?: boolean };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const SHORTS_KEY = 'uzuhama_channel_shorts_v1';

/** 채널 쇼츠 전체 (서버가 유튜브에서 한 번만 가져와 저장한 것). 브라우저에도 하루 보관 */
function useChannelShorts() {
  const [items, setItems] = useState<{ videoId: string; title: string; publishedAt: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem(SHORTS_KEY) || 'null')?.items || []; } catch { return []; }
  });
  useEffect(() => {
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(SHORTS_KEY) || 'null'); } catch {}
    if (saved?.at && Date.now() - saved.at < 24 * 3600 * 1000) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/videos/shorts`).then((r) => r.json()).then((json) => {
      if (cancelled || !Array.isArray(json?.shorts) || json.shorts.length === 0) return;
      setItems(json.shorts);
      try { localStorage.setItem(SHORTS_KEY, JSON.stringify({ items: json.shorts, at: Date.now() })); } catch {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return items;
}

export function ShortsFeed({ logs, searchTerm, selectedCategories, onNavigateToCalendar }: ShortsFeedProps) {
  const [page, setPage] = useState(1);
  // 정렬: 생방일순(방송 날짜) / 업로드순(유튜브에 올라온 날짜)
  const [sortBy, setSortBy] = useState<'live' | 'upload'>(() => (sessionStorage.getItem('rec_shorts_sort') === 'live' ? 'live' : 'upload'));
  const changeSort = (v: 'live' | 'upload') => { setSortBy(v); setPage(1); try { sessionStorage.setItem('rec_shorts_sort', v); } catch {} };

  const channelShorts = useChannelShorts();

  const allShorts = useMemo(() => {
    const list = Array.isArray(logs) ? logs : Object.values(logs || {});
    const byId = new Map<string, ShortEntry>();
    const linksOf = (log: any) => ({
      liveUrl: (Array.isArray(log?.vods) ? log.vods : []).find((v: any) => v?.url)?.url,
      editUrl: (Array.isArray(log?.edited) ? log.edited : []).find((v: any) => v?.url && !v.isCompilation && !v.compilationId)?.url,
    });
    list.forEach((log: any) => {
      // 1) 방송 기록에 등록된 쇼츠
      (Array.isArray(log?.shorts) ? log.shorts : []).forEach((s: any) => {
        const url = typeof s === 'string' ? s : s?.url;
        const id = extractYoutubeId(url || '');
        if (!url || !id || byId.has(id)) return;
        if (s?.isCompilation || s?.compilationId) return;
        byId.set(id, {
          id, url,
          title: (typeof s === 'string' ? '' : s?.title) || '',
          date: log?.date || '',
          category: (typeof s === 'string' ? '' : s?.category) || log?.category || '',
          ...linksOf(log),
        });
      });
      // 2) 제목이나 카테고리에 #shorts 가 붙은 몰아보기
      (Array.isArray(log?.edited) ? log.edited : []).forEach((e: any) => {
        if (!(e?.isCompilation || e?.compilationId)) return;
        const tag = `${e?.title || ''} ${e?.category || ''} ${Array.isArray(e?.categories) ? e.categories.join(' ') : ''}`.toLowerCase();
        if (!/#?shorts|쇼츠/.test(tag)) return;
        const id = extractYoutubeId(e?.url || '');
        if (!id || byId.has(id)) return;
        byId.set(id, { id, url: e.url, title: e.title || '', date: log?.date || '', category: e.category || '몰아보기', isCompilation: true });
      });
    });
    // 3) 유튜브 채널의 쇼츠 전체 (기록에 없는 것도 포함, 업로드일은 유튜브 값)
    channelShorts.forEach((c) => {
      const hit = byId.get(c.videoId);
      if (hit) { hit.publishedAt = c.publishedAt; if (!hit.title) hit.title = c.title; return; }
      byId.set(c.videoId, { id: c.videoId, url: `https://www.youtube.com/shorts/${c.videoId}`, title: c.title, date: '', category: '', publishedAt: c.publishedAt });
    });
    return [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [logs, channelShorts]);

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

  // 업로드일을 모르는 것(기록에만 있는 쇼츠)만 한 번 조회
  const metaMap = useVideoMetaMany(filtered.filter((s) => !s.publishedAt).map((s) => s.id), sortBy === 'upload');
  const uploadedAt = (s: ShortEntry) => s.publishedAt || metaMap.get(s.id)?.publishedAt || '';
  const sorted = useMemo(() => {
    if (sortBy !== 'upload') return [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Date.parse(uploadedAt(b)) || 0) - (Date.parse(uploadedAt(a)) || 0));
    const t = (s: ShortEntry) => Date.parse(uploadedAt(s)) || 0;
    return [...filtered].sort((a, b) => t(b) - t(a) || (b.date || '').localeCompare(a.date || ''));
  }, [filtered, sortBy, metaMap]); // eslint-disable-line react-hooks/exhaustive-deps

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
            caption={sortBy === 'upload' && uploadedAt(s)
              ? `${toKstDate(uploadedAt(s))} 업로드`
              : s.date ? `${s.date} 방송` : uploadedAt(s) ? `${toKstDate(uploadedAt(s))} 업로드` : undefined}
            onCaptionClick={s.date && onNavigateToCalendar ? () => onNavigateToCalendar(s.date) : undefined}
          />
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
