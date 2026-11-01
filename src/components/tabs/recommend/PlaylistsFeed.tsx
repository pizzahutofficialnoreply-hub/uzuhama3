import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, ListVideo, Loader2, Play, X } from 'lucide-react';
import { cn, fuzzyKoreanMatch } from '../../../utils';

/**
 * 추천 영상 > 재생목록 탭: 우주하마 유튜브 채널의 공개 재생목록을 그대로 보여줌
 * - 카드 모양은 몰아보기와 같은 보라색 계열 (썸네일 배지 + 펼치기 버튼 + 아래로 펼쳐지는 영상 목록)
 * - 서버(/api/videos/playlists)가 6시간마다 유튜브에서 새로 가져오고, 브라우저에는 1시간 보관
 */

export interface PlaylistItem { videoId: string; title: string; publishedAt: string; position: number }
export interface Playlist { id: string; title: string; description: string; publishedAt: string; thumbnail: string; itemCount: number; items: PlaylistItem[] }

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const STORAGE_KEY = 'uzuhama_playlists_v1';
const LOCAL_TTL_MS = 60 * 60 * 1000;

function usePlaylists() {
  const [state, setState] = useState<{ playlists: Playlist[]; loading: boolean; error: string | null }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.playlists) return { playlists: saved.playlists, loading: Date.now() - saved.at > LOCAL_TTL_MS, error: null };
    } catch {}
    return { playlists: [], loading: true, error: null };
  });

  useEffect(() => {
    if (!state.loading) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/videos/playlists`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const playlists: Playlist[] = Array.isArray(json?.playlists) ? json.playlists : [];
        if (playlists.length > 0) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ playlists, at: Date.now() })); } catch {}
        }
        setState((prev) => ({
          playlists: playlists.length > 0 ? playlists : prev.playlists,
          loading: false,
          error: playlists.length === 0 ? (json?.error || null) : null,
        }));
      })
      .catch((e) => !cancelled && setState((prev) => ({ ...prev, loading: false, error: String(e?.message || e) })));
    return () => { cancelled = true; };
  }, [state.loading]);

  return state;
}

function PlaylistCard({ playlist, matchedIds, isExpanded, onToggle }: {
  playlist: Playlist;
  matchedIds: Set<string> | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const count = playlist.items.length;

  return (
    <div className={cn('flex flex-col', isExpanded && 'col-span-full')}>
      <div
        className={cn(
          'group relative isolate flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all',
          isExpanded ? 'rounded-t-[24px] border-b-0 shadow-md' : 'rounded-[24px] overflow-hidden hover:shadow-xl hover:-translate-y-1'
        )}
      >
        <div className={cn('relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800', isExpanded && 'rounded-t-[24px]')}>
          {playing ? (
            <div className="relative w-full h-full bg-black">
              <iframe
                src={`https://www.youtube.com/embed/videoseries?list=${playlist.id}&autoplay=1&rel=0`}
                title={playlist.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button
                type="button"
                onClick={() => setPlaying(false)}
                className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-white text-xs font-semibold flex items-center gap-1 shadow-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>닫기</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group/thumb block w-full h-full relative cursor-pointer"
              title="재생목록 처음부터 재생"
            >
              <img src={playlist.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-black/25 group-hover/thumb:bg-black/10 transition-colors flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-600/90 group-hover/thumb:bg-red-600 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>
              <span className="absolute bottom-2 left-2 z-20 text-xs px-2.5 py-1 font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow-md bg-purple-900/90 text-purple-100 border border-purple-400/50">
                <ListVideo className="w-3.5 h-3.5 text-purple-300" />
                재생목록 ({count}개 영상)
              </span>
            </button>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <a
            href={`https://www.youtube.com/playlist?list=${playlist.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-sm sm:text-base"
          >
            {playlist.title}
          </a>
          {playlist.description && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{playlist.description}</p>
          )}
          {matchedIds && matchedIds.size > 0 && (
            <p className="mt-1 text-xs text-purple-600 dark:text-purple-400 font-semibold">검색어와 맞는 영상 {matchedIds.size}개</p>
          )}
          <div className="mt-auto pt-3">
            <button
              type="button"
              onClick={onToggle}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01] bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90"
            >
              <span className="flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="font-bold text-purple-900 dark:text-purple-200">{isExpanded ? '재생목록 영상 접기' : '재생목록 영상 펼치기'}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200">{count}개 영상</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden w-full rounded-b-[24px] border border-t-0 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-md -mt-px"
          >
            <ol className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {playlist.items.map((it, i) => {
                const hit = matchedIds?.has(it.videoId);
                return (
                  <li key={`${it.videoId}-${i}`}>
                    <a
                      href={`https://www.youtube.com/watch?v=${it.videoId}&list=${playlist.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-xl transition-colors',
                        hit ? 'bg-purple-50 dark:bg-purple-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                      )}
                    >
                      <span className="w-5 text-right text-[11px] text-zinc-400 tabular-nums shrink-0">{i + 1}</span>
                      <img src={`https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="w-28 aspect-video rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs sm:text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">{it.title}</span>
                        {it.publishedAt && (
                          <span className="block mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{it.publishedAt.slice(0, 10)}</span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PlaylistsFeed({ searchTerm }: { searchTerm: string }) {
  const { playlists, loading, error } = usePlaylists();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  return (
    <div>
      <p className="px-1 mb-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
        총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{results.length}</strong>개 재생목록
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.map(({ p, matched }) => (
          <PlaylistCard
            key={p.id}
            playlist={p}
            matchedIds={matched}
            isExpanded={expandedId === p.id}
            onToggle={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
          />
        ))}
      </div>
    </div>
  );
}
