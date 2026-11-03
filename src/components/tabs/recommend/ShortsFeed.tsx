import React, { useEffect, useMemo, useState } from 'react';
import { fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { ShortsCard } from '../../common/ShortsCard';
import { ShortsPlayer } from '../../common/ShortsPlayer';
import { getPrefs } from '../../../utils/userPrefs';
import { Pagination } from '../../common/Pagination';
import { useVideoMetaMany, toKstDate } from '../../../hooks/useVideoDuration';
import { cn } from '../../../utils';
import { useChannelVideos } from '../../../hooks/useChannelVideos';
import { formatShortsShareText } from '../../../utils/shareUtils';
import { tokensOf } from '../../../utils/interest';
import { cleanShortsTitle } from '../../../utils/videoSearch';
import { applyShortsOverrides, useLinkOverrides } from '../../../utils/linkOverrides';
import { isHit, makeDoc, scoreDoc, type QueryPlan } from '../../../utils/searchPlan';

/** 추천 영상 > Shorts 탭: 채널 쇼츠 전체 + 기록에 등록된 쇼츠 + #shorts 몰아보기 (업로드순 기본 / 생방일순) */
interface ShortsFeedProps {
  logs: any;
  searchTerm: string;
  /** 검색 도우미 (중요한 단어 우선·줄임말·말하듯 검색) */
  plan?: { plan: QueryPlan; weights: number[] } | null;
  /** 초성으로 찾기 */
  chosung?: boolean;
  /** 신고로 이 검색에서 빠진 쇼츠 */
  exclude?: Set<string>;
  selectedCategories: string[];
  onNavigateToCalendar?: (date: string) => void;
  /** 방송 기록 → 장르 목록 (추천 영상 카테고리 필터와 같은 기준) */
  genresOfLog?: (log: any) => string[];
  /** 위 필터 카드의 정렬을 따름 (주면 이 화면의 장르·순서 버튼은 숨김) */
  order?: 'desc' | 'asc' | 'accuracy';
  onCount?: (n: number) => void;
}

const PAGE = 24;

type ShortEntry = { id: string; url: string; title: string; relatedTitle?: string; gameNames?: string[]; date: string; category: string; genres: string[]; liveUrl?: string; editUrl?: string; publishedAt?: string; isCompilation?: boolean; autoLinked?: boolean; compilation?: CompilationRow[]; compilationVideo?: any };
export type CompilationRow = { date: string; games: string[]; liveUrl?: string; editUrl?: string };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const SHORTS_KEY = 'uzuhama_channel_shorts_v1';

/** 채널 쇼츠 전체 (서버가 유튜브에서 한 번만 가져와 저장한 것). 브라우저에도 하루 보관 */
export function useChannelShorts() {
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

const RELATED_KEY = 'uzuhama_shorts_related_v1';
/** 쇼츠 → 그 쇼츠 아래 연결된 일반 영상 (서버가 유튜브에서 확인해 저장). 브라우저에도 반나절 보관 */
/** 쇼츠 → 본영상 (자동 연결 + 관리자가 직접 고친 것) */
export function useShortsRelated(): Record<string, string> {
  const auto = useShortsRelatedAuto();
  const overrides = useLinkOverrides();
  return useMemo(() => applyShortsOverrides(auto, overrides), [auto, overrides]);
}

/** 쇼츠 아래 '관련 동영상'으로 자동 연결된 것만 */
export function useShortsRelatedAuto(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(RELATED_KEY) || 'null')?.map || {}; } catch { return {}; }
  });
  useEffect(() => {
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(RELATED_KEY) || 'null'); } catch {}
    if (saved?.at && Date.now() - saved.at < 12 * 3600 * 1000 && !saved.remaining) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/videos/shorts?kind=related`).then((r) => r.json()).then((json) => {
      if (cancelled || !json?.map) return;
      setMap(json.map);
      try { localStorage.setItem(RELATED_KEY, JSON.stringify({ map: json.map, remaining: json.remaining || 0, at: Date.now() })); } catch {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return map;
}

const gameNamesOfLog = (log: any): string[] => (Array.isArray(log?.games) && log.games.length ? log.games.map((g: any) => g?.name).filter(Boolean) : log?.game ? [log.game] : []);

export function ShortsFeed({ logs, searchTerm, plan, chosung = true, exclude, selectedCategories, onNavigateToCalendar, genresOfLog, order: orderProp, onCount }: ShortsFeedProps) {
  const controlled = orderProp !== undefined;
  const [page, setPage] = useState(1);
  // 정렬: 생방일순(방송 날짜) / 업로드순(유튜브에 올라온 날짜)
  const [sortBy, setSortBy] = useState<'live' | 'upload'>(() => { const v = sessionStorage.getItem('rec_shorts_sort'); return v === 'live' || v === 'upload' ? v : getPrefs().shortsSortBy; });
  const changeSort = (v: 'live' | 'upload') => { setSortBy(v); setPage(1); try { sessionStorage.setItem('rec_shorts_sort', v); } catch {} };
  // 순서: 최신순 / 과거순
  const [orderState, setOrder] = useState<'desc' | 'asc'>(() => { const v = sessionStorage.getItem('rec_shorts_order'); return v === 'asc' || v === 'desc' ? v : getPrefs().shortsOrder; });
  const order: 'desc' | 'asc' | 'accuracy' = controlled ? orderProp! : orderState;
  const changeOrder = (v: 'desc' | 'asc') => { setOrder(v); setPage(1); try { sessionStorage.setItem('rec_shorts_order', v); } catch {} };
  // 장르 (연결된 방송에서 한 게임의 장르)
  const [genre, setGenre] = useState<string>(() => sessionStorage.getItem('rec_shorts_genre') || '전체');
  const changeGenre = (v: string) => { setGenre(v); setPage(1); try { sessionStorage.setItem('rec_shorts_genre', v); } catch {} };
  const [playerAt, setPlayerAt] = useState<number | null>(null);

  const channelShorts = useChannelShorts();
  const relatedMap = useShortsRelated();
  const channelVideos = useChannelVideos();

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
          gameNames: gameNamesOfLog(log),
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
        // 몰아보기 쇼츠: 연결된 생방송 목록 (쇼츠 뷰어에서 아래에서 올라오는 목록으로 보여 줌)
        const dates: string[] = (Array.isArray(e.allBroadcastDates) && e.allBroadcastDates.length ? e.allBroadcastDates : [log?.date]).filter(Boolean);
        const compilation: CompilationRow[] = [...new Set(dates)].sort((a, b) => b.localeCompare(a)).map((d) => {
          const l: any = list.find((x: any) => x?.date === d) || (log?.date === d ? log : null);
          const games = (Array.isArray(e.games) ? e.games : [])
            .filter((g: any) => !g?.date || g.date === d).map((g: any) => (typeof g === 'string' ? g : g?.name)).filter(Boolean);
          return {
            date: d,
            games: games.length ? games : (Array.isArray(l?.games) ? l.games.map((g: any) => g?.name).filter(Boolean) : l?.game ? [l.game] : []),
            ...linksOf(l),
          };
        });
        byId.set(id, { id, url: e.url, title: e.title || '', date: log?.date || '', category: e.category || '몰아보기', genres: genresOfLog ? genresOfLog({ ...log, games: e.games || log?.games }) : [], isCompilation: true, compilation,
          // 펼치기 화면(몰아보기 목록)에 그대로 넘기는 영상 정보
          compilationVideo: { id, videoUrl: e.url, videoTitle: e.title || '', isCompilation: true, compilationId: e.compilationId, games: e.games || [], allBroadcastDates: dates, parentLog: log } });
      });
    });
    // 편집본 영상 ID → 그 방송 기록 (쇼츠 아래 연결된 영상으로 생방송을 찾을 때 씀)
    const logByEdited = new Map<string, any>();
    list.forEach((log: any) => (Array.isArray(log?.edited) ? log.edited : []).forEach((e: any) => {
      if (e?.isCompilation || e?.compilationId) return;
      const eid = extractYoutubeId(e?.url || '');
      if (eid && !logByEdited.has(eid)) logByEdited.set(eid, log);
    }));
    // 3) 유튜브 채널의 쇼츠 전체 (기록에 없는 것도 포함, 업로드일은 유튜브 값)
    channelShorts.forEach((c) => {
      const hit = byId.get(c.videoId);
      if (hit) { hit.publishedAt = c.publishedAt; if (!hit.title) hit.title = c.title; return; }
      // 기록에 없는 쇼츠: 쇼츠 아래 연결된 일반 영상이 방송 기록의 편집본이면 그 생방송과 자동으로 연결
      const rel = relatedMap[c.videoId];
      const relLog = rel ? logByEdited.get(rel) : null;
      byId.set(c.videoId, {
        id: c.videoId, url: `https://www.youtube.com/shorts/${c.videoId}`, title: c.title, publishedAt: c.publishedAt,
        date: relLog?.date || '',
        category: relLog?.category || '',
        genres: relLog && genresOfLog ? genresOfLog(relLog) : [],
        gameNames: relLog ? gameNamesOfLog(relLog) : [],
        ...(relLog ? linksOf(relLog) : {}),
        ...(rel ? { editUrl: `https://www.youtube.com/watch?v=${rel}` } : {}),
        autoLinked: Boolean(rel),
      });
    });
    // 기록에 있는 쇼츠도 편집본이 비어 있으면 연결된 영상으로 채움
    byId.forEach((e) => {
      if (e.editUrl || e.isCompilation) return;
      const rel = relatedMap[e.id];
      if (rel) e.editUrl = `https://www.youtube.com/watch?v=${rel}`;
    });
    // 본영상 제목 (쇼츠를 본영상 제목으로도 찾을 수 있게): 방송 기록의 편집본 → 채널 영상 목록
    const titleOf = new Map<string, string>();
    list.forEach((log: any) => (Array.isArray(log?.edited) ? log.edited : []).forEach((e: any) => {
      const eid = extractYoutubeId(e?.url || '');
      if (eid && e?.title && !titleOf.has(eid)) titleOf.set(eid, e.title);
    }));
    channelVideos.forEach((v) => { if (!titleOf.has(v.videoId) && v.title) titleOf.set(v.videoId, v.title); });
    byId.forEach((e) => {
      const rel = relatedMap[e.id] || extractYoutubeId(e.editUrl || '');
      if (rel) e.relatedTitle = titleOf.get(rel);
    });
    return [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [logs, channelShorts, genresOfLog, relatedMap, channelVideos]);

  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    allShorts.forEach((s) => s.genres.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([g]) => g);
  }, [allShorts]);

  // 검색 도우미 점수 (쇼츠 제목·게임·연결된 본영상 제목)
  const scoreOf = (s: ShortEntry) => (plan ? scoreDoc(plan.plan, plan.weights, makeDoc({ title: s.title, games: [s.category, ...(s.gameNames || []), ...s.genres], extra: s.relatedTitle ? [s.relatedTitle] : [], dates: s.date ? [s.date] : [] })) : null);
  const filtered = useMemo(() => {
    const term = searchTerm.trim();
    const onlyComp = selectedCategories.length === 1 && selectedCategories[0] === '몰아보기';
    const cats = selectedCategories.includes('전체') ? [] : selectedCategories.filter((c) => c !== '몰아보기');
    const activeGenre = genreOptions.includes(genre) ? genre : '전체';
    const gNorm = activeGenre.replace(/\s+/g, '').toLowerCase();
    const termNorm = term.replace(/\s+/g, '').toLowerCase();
    return allShorts.filter((s) => {
      if (exclude?.has(s.id)) return false;
      if (onlyComp && !s.isCompilation) return false;
      if (activeGenre !== '전체' && !s.genres.some((g) => g.replace(/\s+/g, '').toLowerCase() === gNorm)) return false;
      if (cats.length > 0) {
        const tokens = s.category.split(',').map((t) => t.trim());
        if (!cats.some((c) => tokens.includes(c) || s.genres.includes(c))) return false;
      }
      if (!term) return true;
      // 링크로 찾기: 쇼츠 자신, 연결된 본영상, 생방송 링크
      const linkId = extractYoutubeId(term);
      if (linkId || /^https?:\/\//i.test(term)) {
        return Boolean(linkId && [s.url, s.editUrl, s.liveUrl].some((u) => u && extractYoutubeId(u) === linkId))
          || [s.url, s.editUrl, s.liveUrl].some((u) => u && term.length > 8 && u.includes(term.replace(/^https?:\/\/(www\.)?/i, '')));
      }
      return fuzzyKoreanMatch(term, s.title, chosung) || fuzzyKoreanMatch(term, s.category, chosung) || s.date.includes(term)
        || (s.relatedTitle ? fuzzyKoreanMatch(term, s.relatedTitle, chosung) : false)
        || s.genres.some((g) => g.replace(/\s+/g, '').toLowerCase() === termNorm)
        || Boolean(plan && isHit(plan.plan, scoreOf(s)!));
    });
  }, [allShorts, searchTerm, selectedCategories, genre, genreOptions, plan, chosung, exclude]); // eslint-disable-line react-hooks/exhaustive-deps

  // 업로드일을 모르는 것(기록에만 있는 쇼츠)만 한 번 조회
  const metaMap = useVideoMetaMany(filtered.filter((s) => !s.publishedAt).map((s) => s.id), sortBy === 'upload');
  const uploadedAt = (s: ShortEntry) => s.publishedAt || metaMap.get(s.id)?.publishedAt || '';
  const sorted = useMemo(() => {
    const t = (s: ShortEntry) => Date.parse(uploadedAt(s)) || 0;
    const desc = sortBy !== 'upload'
      ? [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '') || t(b) - t(a))
      : [...filtered].sort((a, b) => t(b) - t(a) || (b.date || '').localeCompare(a.date || ''));
    if (order === 'accuracy') {
      // 정확도순: 제목에 검색어가 그대로 있는 쇼츠 먼저
      const q = searchTerm.trim().toLowerCase().replace(/\s+/g, '');
      const hit = (s: ShortEntry) => (s.title.toLowerCase().replace(/\s+/g, '').includes(q) ? 0 : 1);
      if (plan) {
        // 붙여 쓴 그대로 → 중요한 단어가 많이 맞는 순
        const sc = new Map(desc.map((s) => [s, scoreOf(s)!] as const));
        return [...desc].sort((a, b) => Number(sc.get(b)!.phrase) - Number(sc.get(a)!.phrase) || hit(a) - hit(b) || sc.get(b)!.rel - sc.get(a)!.rel);
      }
      return [...desc].sort((a, b) => hit(a) - hit(b));
    }
    if (order === 'desc') return desc;
    // 과거순: 날짜를 모르는 것은 맨 뒤
    const known = desc.filter((s) => (sortBy === 'upload' ? t(s) > 0 : Boolean(s.date)));
    const unknown = desc.filter((s) => !(sortBy === 'upload' ? t(s) > 0 : Boolean(s.date)));
    return [...known.reverse(), ...unknown];
  }, [filtered, sortBy, order, metaMap, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const captionOf = (s: ShortEntry) => (sortBy === 'upload' && uploadedAt(s)
    ? `${toKstDate(uploadedAt(s))} 업로드`
    : s.date ? `${s.date} 방송` : uploadedAt(s) ? `${toKstDate(uploadedAt(s))} 업로드` : undefined);

  useEffect(() => { setPage(1); }, [searchTerm, selectedCategories, order]);
  useEffect(() => { onCount?.(filtered.length); }, [filtered.length, onCount]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const emptyText = allShorts.length === 0 ? '아직 등록된 쇼츠가 없어요.' : '조건에 맞는 쇼츠가 없어요.';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{filtered.length}</strong>개 쇼츠
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {!controlled && genreOptions.length > 0 && (
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
            ...(controlled ? [] : [['순서', [['desc', '최신순'], ['asc', '과거순']], order, changeOrder]]),
          ] as any[]).map(([label, opts, value, onChange]) => (
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
            interest={{ id: s.id, kind: 'short', tokens: tokensOf((s.gameNames || []).map((name) => ({ name })), [...s.genres, s.category]) }}
            shareText={() => formatShortsShareText({ title: cleanShortsTitle(s.title), url: s.url, date: s.date, liveUrl: s.liveUrl, editUrl: s.editUrl, relatedTitle: s.relatedTitle }, logs)}
          />
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
      {playerAt !== null && (
        <ShortsPlayer
          items={sorted.map((s) => ({ url: s.url, title: s.title, caption: captionOf(s), liveUrl: s.liveUrl, editUrl: s.editUrl, compilation: s.compilation, compilationVideo: s.compilationVideo }))}
          allLogs={logs}
          startIndex={playerAt}
          onClose={() => setPlayerAt(null)}
        />
      )}
    </div>
  );
}
