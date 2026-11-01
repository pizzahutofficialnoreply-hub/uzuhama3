import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ListVideo, Loader2, X } from 'lucide-react';
import { cn, fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { GlassPlayButton } from '../../common/MediaIcons';
import { Pagination } from '../../common/Pagination';
import { VideoListRow } from '../../common/VideoListRow';
import { ViewStyleToggle } from '../../common/ViewStyleToggle';
import { useViewStyle } from '../../../hooks/useViewStyle';
import { VideoCard } from '../RecommendTab';

/**
 * 추천 영상 > 재생목록 탭: 우주하마 유튜브 채널의 공개 재생목록
 * - 목록: 몰아보기와 같은 보라색 카드
 * - 펼치면: 유튜브 앱의 재생목록 화면처럼 (흐린 배경 위 큰 썸네일·제목·게시자·모두 재생 + 아래 영상 목록)
 *   영상 목록은 '목록'(줄 누르면 영상, 오른쪽 생방송·쇼츠 버튼) / '카드'(사이트 안에서 미리보기) 중 선택
 * - 서버는 유튜브를 처음 한 번만 부르고 저장해 둔 것을 돌려줌. 브라우저에도 하루 보관
 */

export interface PlaylistItem { videoId: string; title: string; publishedAt: string; position: number }
export interface Playlist { id: string; title: string; description: string; publishedAt: string; thumbnail: string; itemCount: number; items: PlaylistItem[] }
interface PlaylistsResponse { playlists: Playlist[]; channelTitle: string; channelThumbnail: string }

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const STORAGE_KEY = 'uzuhama_playlists_v2';
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
const CARDS_PER_PAGE = 9;
// iOS 처럼 살짝 감기며 멈추는 스프링
const IOS_SPRING = { type: 'spring' as const, stiffness: 340, damping: 32, mass: 1 };
const ITEMS_PER_PAGE = 30;

function usePlaylists() {
  const [state, setState] = useState<{ data: PlaylistsResponse | null; loading: boolean; error: string | null }>(() => {
    try {
      localStorage.removeItem('uzuhama_playlists_v1');
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.data?.playlists) return { data: saved.data, loading: Date.now() - saved.at > LOCAL_TTL_MS, error: null };
    } catch {}
    return { data: null, loading: true, error: null };
  });

  useEffect(() => {
    if (!state.loading) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/videos/playlists`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const ok = Array.isArray(json?.playlists) && json.playlists.length > 0;
        const data: PlaylistsResponse | null = ok
          ? { playlists: json.playlists, channelTitle: json.channelTitle || '우주하마', channelThumbnail: json.channelThumbnail || '' }
          : null;
        if (data) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, at: Date.now() })); } catch {}
        }
        setState((prev) => ({ data: data || prev.data, loading: false, error: data ? null : (json?.error || 'empty') }));
      })
      .catch((e) => !cancelled && setState((prev) => ({ ...prev, loading: false, error: String(e?.message || e) })));
    return () => { cancelled = true; };
  }, [state.loading]);

  return state;
}

/** 유튜브 영상 ID → 그 영상이 등록된 방송 기록 (생방송·쇼츠 버튼, 카드 미리보기용) */
function useLogIndex(logs: any) {
  return useMemo(() => {
    const map = new Map<string, { log: any; edit: any }>();
    const list = Array.isArray(logs) ? logs : Object.values(logs || {});
    list.forEach((log: any) => {
      (Array.isArray(log?.edited) ? log.edited : []).forEach((edit: any) => {
        const id = extractYoutubeId(edit?.url || '');
        if (id && !map.has(id)) map.set(id, { log, edit });
      });
    });
    return map;
  }, [logs]);
}

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) {
  const count = playlist.items.length;
  return (
    <div className="group relative isolate flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1">
      <button type="button" onClick={onOpen} className="group/thumb relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer" title="재생목록 열기">
        <img src={playlist.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <span className="absolute inset-0 bg-black/10 flex items-center justify-center">
          <GlassPlayButton />
        </span>
        <span className="absolute bottom-2 left-2 text-xs px-2.5 py-1 font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow-md bg-purple-900/90 text-purple-100 border border-purple-400/50">
          <ListVideo className="w-3.5 h-3.5 text-purple-300" />
          재생목록 ({count}개 영상)
        </span>
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <button type="button" onClick={onOpen} className="text-left font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-sm sm:text-base cursor-pointer">
          {playlist.title}
        </button>
        {playlist.description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{playlist.description}</p>}
        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01] bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90"
          >
            <span className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="font-bold text-purple-900 dark:text-purple-200">재생목록 영상 펼치기</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200">{count}개 영상</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** 유튜브 앱의 재생목록 화면 (저장·공유 버튼 제외) */
function PlaylistDetail({ playlist, channelTitle, channelThumbnail, matchedIds, logIndex, logs, onClose, onNavigateToCalendar }: {
  playlist: Playlist;
  channelTitle: string;
  channelThumbnail: string;
  matchedIds: Set<string> | null;
  logIndex: Map<string, { log: any; edit: any }>;
  logs: any;
  onClose: () => void;
  onNavigateToCalendar?: (date: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [page, setPage] = useState(1);
  const [viewStyle, setViewStyle] = useViewStyle();
  const total = playlist.items.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const pageItems = playlist.items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.30)]"
      aria-label={`${playlist.title} 재생목록`}
    >
      <div className="md:flex">
        {/* 머리 부분: 썸네일을 크게 흐려 깐 배경 */}
        <div className="relative isolate overflow-hidden text-white md:w-[360px] md:shrink-0">
          <img src={playlist.thumbnail} alt="" aria-hidden="true" className="absolute inset-0 -z-10 w-full h-full object-cover scale-150 blur-3xl saturate-150" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/45 to-black/75" />
          <div className="p-4 sm:p-5 md:sticky md:top-20">
            <div className="flex justify-end -mt-1 -mr-1 mb-2">
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md flex items-center justify-center cursor-pointer" aria-label="재생목록 닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/40 shadow-xl">
              {playing ? (
                <iframe
                  src={`https://www.youtube.com/embed/videoseries?list=${playlist.id}&autoplay=1&rel=0`}
                  title={playlist.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button type="button" onClick={() => setPlaying(true)} className="group/thumb absolute inset-0 cursor-pointer" aria-label="재생목록 재생">
                  <img src={playlist.thumbnail} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center"><GlassPlayButton size="lg" /></span>
                </button>
              )}
            </div>
            <h3 className="mt-4 text-xl sm:text-2xl font-extrabold leading-tight break-keep">{playlist.title}</h3>
            <div className="mt-3 flex items-center gap-2 text-sm text-white/85">
              {channelThumbnail ? (
                <img src={channelThumbnail} alt="" className="w-7 h-7 rounded-full object-cover bg-white/20" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">우</span>
              )}
              <span>게시자: <b className="font-semibold text-white">{channelTitle}</b></span>
            </div>
            <p className="mt-2 text-xs sm:text-[13px] text-white/70">재생목록 · 동영상 {total}개</p>
            {playlist.description && <p className="mt-2 text-xs text-white/70 line-clamp-3 whitespace-pre-line">{playlist.description}</p>}
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="mt-4 w-full h-11 rounded-full bg-white text-zinc-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.29-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" /></svg>
              모두 재생
            </button>
          </div>
        </div>

        {/* 영상 목록 (가로 여백 최소) */}
        <div className="flex-1 min-w-0 px-1.5 sm:px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-1.5 mb-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{total}개 영상</span>
            <ViewStyleToggle value={viewStyle} onChange={setViewStyle} />
          </div>

          {viewStyle === 'list' ? (
            <div className="flex flex-col">
              {pageItems.map((it, i) => {
                const hit = logIndex.get(it.videoId);
                return (
                  <VideoListRow
                    key={`${it.videoId}-${i}`}
                    dense
                    index={(page - 1) * ITEMS_PER_PAGE + i + 1}
                    videoId={it.videoId}
                    title={it.title}
                    href={`https://www.youtube.com/watch?v=${it.videoId}&list=${playlist.id}`}
                    liveUrl={hit?.log?.vods?.find((v: any) => v?.url)?.url}
                    shorts={hit?.log?.shorts || []}
                    highlighted={matchedIds?.has(it.videoId)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 px-1.5">
              {pageItems.map((it, i) => {
                const hit = logIndex.get(it.videoId);
                return (
                  <VideoCard
                    key={`${it.videoId}-${i}`}
                    video={{
                      id: it.videoId,
                      videoTitle: it.title,
                      videoUrl: `https://www.youtube.com/watch?v=${it.videoId}`,
                      category: hit?.edit?.category || '',
                      parentLog: hit?.log,
                      allBroadcastDates: hit?.log?.date ? [hit.log.date] : [],
                      games: Array.isArray(hit?.edit?.games) ? hit.edit.games : [],
                    }}
                    allLogs={logs}
                    onNavigateToCalendar={onNavigateToCalendar}
                  />
                );
              })}
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} className="flex justify-center items-center gap-1 sm:gap-2 mt-5" />
        </div>
      </div>
    </section>
  );
}

export function PlaylistsFeed({ searchTerm, logs, onNavigateToCalendar }: { searchTerm: string; logs: any; onNavigateToCalendar?: (date: string) => void }) {
  const { data, loading, error } = usePlaylists();
  const logIndex = useLogIndex(logs);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const playlists = data?.playlists || [];

  const results = useMemo(() => {
    const term = searchTerm.trim();
    return playlists
      .map((p) => {
        if (!term) return { p, matched: null as Set<string> | null };
        const matched = new Set(p.items.filter((it) => fuzzyKoreanMatch(term, it.title)).map((it) => it.videoId));
        const titleHit = fuzzyKoreanMatch(term, p.title) || fuzzyKoreanMatch(term, p.description);
        return titleHit || matched.size > 0 ? { p, matched } : null;
      })
      .filter(Boolean) as { p: Playlist; matched: Set<string> | null }[];
  }, [playlists, searchTerm]);

  useEffect(() => { setPage(1); }, [searchTerm]);

  if (loading && playlists.length === 0) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" /> 재생목록을 불러오는 중이에요
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
        {playlists.length === 0 ? (error ? '재생목록을 가져오지 못했어요. 잠시 후 다시 열어 주세요.' : '공개된 재생목록이 없어요.') : '검색어와 맞는 재생목록이 없어요.'}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(results.length / CARDS_PER_PAGE));
  const pageResults = results.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);

  return (
    <div>
      <p className="px-1 mb-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
        총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{results.length}</strong>개 재생목록
      </p>
      {/* 몰아보기처럼 누른 카드 자리에서 그대로 펼쳐짐 (닫기 전까지 원래 카드는 숨김, 자동 스크롤 없음) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pageResults.map(({ p, matched }) => {
          const isOpen = openId === p.id;
          return (
            <motion.div
              key={p.id}
              layout
              transition={IOS_SPRING}
              className={cn(isOpen && 'col-span-full')}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isOpen ? (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={IOS_SPRING}
                  >
                    <PlaylistDetail
                      playlist={p}
                      channelTitle={data?.channelTitle || '우주하마'}
                      channelThumbnail={data?.channelThumbnail || ''}
                      matchedIds={matched}
                      logIndex={logIndex}
                      logs={logs}
                      onClose={() => setOpenId(null)}
                      onNavigateToCalendar={onNavigateToCalendar}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="card"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={IOS_SPRING}
                  >
                    <PlaylistCard playlist={p} onOpen={() => setOpenId(p.id)} />
                    {matched && matched.size > 0 && (
                      <p className="mt-1.5 px-2 text-xs text-purple-600 dark:text-purple-400 font-semibold">검색어와 맞는 영상 {matched.size}개</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={(n) => { setOpenId(null); setPage(n); }} />
    </div>
  );
}
