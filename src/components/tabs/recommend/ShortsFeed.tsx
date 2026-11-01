import React, { useEffect, useMemo, useState } from 'react';
import { fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { ShortsCard } from '../../common/ShortsCard';
import { ShortsPlayer } from '../../common/ShortsPlayer';
import { Pagination } from '../../common/Pagination';
import { useVideoMetaMany, toKstDate } from '../../../hooks/useVideoDuration';
import { cn } from '../../../utils';

/** 추천 영상 > Shorts 탭: 채널 쇼츠 전체 + 기록에 등록된 쇼츠 + #shorts 몰아보기 (업로드순 기본 / 생방일순) */
interface ShortsFeedProps {
  logs: any;
  searchTerm: string;
  selectedCategories: string[];
  onNavigateToCalendar?: (date: string) => void;
  /** 방송 기록 → 장르 목록 (추천 영상 카테고리 필터와 같은 기준) */
  genresOfLog?: (log: any) => string[];
}

const PAGE = 24;

type ShortEntry = { id: string; url: string; title: string; date: string; category: string; genres: string[]; liveUrl?: string; editUrl?: string; publishedAt?: string; isCompilation?: boolean };

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

export function ShortsFeed({ logs, searchTerm, selectedCategories, onNavigateToCalendar, genresOfLog }: ShortsFeedProps) {
  const [page, setPage] = useState(1);
  // 정렬: 생방일순(방송 날짜) / 업로드순(유튜브에 올라온 날짜)
  const [sortBy, setSortBy] = useState<'live' | 'upload'>(() => (sessionStorage.getItem('rec_shorts_sort') === 'live' ? 'live' : 'upload'));
  const changeSort = (v: 'live' | 'upload') => { setSortBy(v); setPage(1); try { sessionStorage.setItem('rec_shorts_sort', v); } catch {} };
  // 순서: 최신순 / 과거순
  const [order, setOrder] = useState<'desc' | 'asc'>(() => (sessionStorage.getItem('rec_shorts_order') === 'asc' ? 'asc' : 'desc'));
  const changeOrder = (v: 'desc' | 'asc') => { setOrder(v); setPage(1); try { sessionStorage.setItem('rec_shorts_order', v); } catch {} };
  // 장르 (연결된 방송에서 한 게임의 장르)
  const [genre, setGenre] = useState<string>(() => sessionStorage.getItem('rec_shorts_genre') || '전체');
  const changeGenre = (v: string) => { setGenre(v); setPage(1); try { sessionStorage.setItem('rec_shorts_genre', v); } catch {} };
  const [playerAt, setPlayerAt] = useState<number | null>(null);

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
          genres: genresOfLog ? genresOfLog(log) : [],
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
        byId.set(id, { id, url: e.url, title: e.title || '', date: log?.date || '', category: e.category || '몰아보기', genres: genresOfLog ? genresOfLog({ ...log, games: e.games || log?.games }) : [], isCompilation: true });
      });
    });
    // 3) 유튜브 채널의 쇼츠 전체 (기록에 없는 것도 포함, 업로드일은 유튜브 값)
    channelShorts.forEach((c) => {
      const hit = byId.get(c.videoId);
      if (hit) { hit.publishedAt = c.publishedAt; if (!hit.title) hit.title = c.title; return; }
      byId.set(c.videoId, { id: c.videoId, url: `https://www.youtube.com/shorts/${c.videoId}`, title: c.title, date: '', category: '', genres: [], publishedAt: c.publishedAt });
    });
    return [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [logs, channelShorts, genresOfLog]);

  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    allShorts.forEach((s) => s.genres.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([g]) => g);
  }, [allShorts]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim();
    const cats = selectedCategories.includes('전체') ? [] : selectedCategories.filter((c) => c !== '몰아보기');
    const activeGenre = genreOptions.includes(genre) ? genre : '전체';
    const gNorm = activeGenre.replace(/\s+/g, '').toLowerCase();
    const termNorm = term.replace(/\s+/g, '').toLowerCase();
    return allShorts.filter((s) => {
      if (activeGenre !== '전체' && !s.genres.some((g) => g.replace(/\s+/g, '').toLowerCase() === gNorm)) return false;
      if (cats.length > 0) {
        const tokens = s.category.split(',').map((t) => t.trim());
        if (!cats.some((c) => tokens.includes(c))) return false;
      }
      if (!term) return true;
      return fuzzyKoreanMatch(term, s.title) || fuzzyKoreanMatch(term, s.category) || s.date.includes(term)
        || s.genres.some((g) => g.replace(/\s+/g, '').toLowerCase() === termNorm);
    });
  }, [allShorts, searchTerm, selectedCategories, genre, genreOptions]);

  // 업로드일을 모르는 것(기록에만 있는 쇼츠)만 한 번 조회
  const metaMap = useVideoMetaMany(filtered.filter((s) => !s.publishedAt).map((s) => s.id), sortBy === 'upload');
  const uploadedAt = (s: ShortEntry) => s.publishedAt || metaMap.get(s.id)?.publishedAt || '';
  const sorted = useMemo(() => {
    const t = (s: ShortEntry) => Date.parse(uploadedAt(s)) || 0;
    const desc = sortBy !== 'upload'
      ? [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '') || t(b) - t(a))
      : [...filtered].sort((a, b) => t(b) - t(a) || (b.date || '').localeCompare(a.date || ''));
    if (order === 'desc') return desc;
    // 과거순: 날짜를 모르는 것은 맨 뒤
    const known = desc.filter((s) => (sortBy === 'upload' ? t(s) > 0 : Boolean(s.date)));
    const unknown = desc.filter((s) => !(sortBy === 'upload' ? t(s) > 0 : Boolean(s.date)));
    return [...known.reverse(), ...unknown];
  }, [filtered, sortBy, order, metaMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const captionOf = (s: ShortEntry) => (sortBy === 'upload' && uploadedAt(s)
    ? `${toKstDate(uploadedAt(s))} 업로드`
    : s.date ? `${s.date} 방송` : uploadedAt(s) ? `${toKstDate(uploadedAt(s))} 업로드` : undefined);

  useEffect(() => { setPage(1); }, [searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const emptyText = allShorts.length === 0 ? '아직 등록된 쇼츠가 없어요.' : '조건에 맞는 쇼츠가 없어요.';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{filtered.length}</strong>개 쇼츠
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {genreOptions.length > 0 && (
            <select
              value={genreOptions.includes(genre) ? genre : '전체'}
              onChange={(e) => changeGenre(e.target.value)}
              aria-label="쇼츠 장르"
              className="h-8 pl-2.5 pr-7 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-200 cursor-pointer"
            >
              <option value="전체">장르 전체</option>
              {genreOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {([
            ['정렬 기준', [['upload', '업로드일'], ['live', '방송일']], sortBy, changeSort],
            ['순서', [['desc', '최신순'], ['asc', '과거순']], order, changeOrder],
          ] as const).map(([label, opts, value, onChange]) => (
            <div key={label} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60" role="group" aria-label={`쇼츠 ${label}`}>
              {opts.map(([v, text]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => (onChange as (x: any) => void)(v)}
                  aria-pressed={value === v}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                    value === v ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
          {emptyText}
        </div>
      )}
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5">
        {sorted.slice((page - 1) * PAGE, page * PAGE).map((s, i) => (
          <ShortsCard
            key={s.id}
            url={s.url}
            title={s.title}
            liveUrl={s.liveUrl}
            editUrl={s.editUrl}
            caption={captionOf(s)}
            onCaptionClick={s.date && onNavigateToCalendar ? () => onNavigateToCalendar(s.date) : undefined}
            onPlay={() => setPlayerAt((page - 1) * PAGE + i)}
          />
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
      {playerAt !== null && (
        <ShortsPlayer
          items={sorted.map((s) => ({ url: s.url, title: s.title, caption: captionOf(s), liveUrl: s.liveUrl, editUrl: s.editUrl }))}
          startIndex={playerAt}
          onClose={() => setPlayerAt(null)}
        />
      )}
    </div>
  );
}
