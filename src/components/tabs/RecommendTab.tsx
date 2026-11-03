import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LazyInput } from '../common/LazyInput';
import { GAME_ALIASES, autoAliases, groupWeights, hasTerm, isHit, isNaturalQuery, makeDoc, planQuery, scoreDoc, textHits, type SearchDoc } from '../../utils/searchPlan';
import { RefreshCw, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Star, CheckCircle, Search, Filter, Cloud, CloudDownload, X, Loader2, AlertCircle, AlertTriangle, Calendar, Layers, Play, Sparkles, Clock } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { fuzzyKoreanMatch, fuzzyDateMatch, cn, getChosung } from '../../utils';
import { extractYoutubeId, extractChzzkId, isVideoUrl, matchMediaUrl, matchLogMedia } from '../../utils/urlUtils';
import { formatRecommendShareText, shareTextOrClipboard } from '../../utils/shareUtils';
import { ShareBoxArrowIcon } from '../common/ShareIcon';
import { BroadcastDetailModal } from './BroadcastDetailModal';
import { getMolabogiCache, setMolabogiCache } from '../../utils/molabogiCache';
import { GameTitle } from '../common/GameTitle';
import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { ShortsFeed, useChannelShorts, useShortsRelated } from './recommend/ShortsFeed';
import { cleanShortsTitle } from '../../utils/videoSearch';
import { LinkMenu } from '../common/LinkMenu';
import { useInterestTracker, noteInterest } from '../../hooks/useInterestTracker';
import { tokensOf, personalize, hasInterestProfile, loadInterest, type InterestItem } from '../../utils/interest';
import { ShortsShelf } from '../common/ShortsCard';
import { CompilationDetail } from './recommend/CompilationDetail';
import { Pagination } from '../common/Pagination';
import { VideoListRow } from '../common/VideoListRow';
import { ViewStyleToggle } from '../common/ViewStyleToggle';
import { useViewStyle } from '../../hooks/useViewStyle';
import { YoutubeLogo, ShortsIcon, PlaySquare, GlassPlayButton } from '../common/MediaIcons';
import { PlaylistsFeed } from './recommend/PlaylistsFeed';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useChannelVideos } from '../../hooks/useChannelVideos';
import { useRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../../hooks/useRecentSearches';
import { getPrefs, usePrefs } from '../../utils/userPrefs';
import { buildVocab, correctQuery, isKeysmash, squash, type Correction } from '../../utils/smartSearch';
import { isDateQuery as isDateQueryFn, titleMatches, titleHasHashtag } from '../../utils/videoSearch';
import { buildGameCatalog, buildPlaylistGameMap } from '../../utils/playlistGames';
import { useSearchIndex, matchTag, matchRelated, gamesMatchingKeyword, normSearch } from '../../hooks/useSearchIndex';

type RecommendSubTab = 'home' | 'recommend' | 'videos' | 'shorts' | 'live' | 'playlists';
// 순서: 검색 결과를 옆으로 넘기며 볼 수 있는 탭(홈·동영상·Shorts·재생목록) 먼저, 검색과 상관없는 추천은 맨 끝
const RECOMMEND_SUB_TABS: { id: RecommendSubTab; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 'videos', label: '동영상' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'live', label: '라이브' },
  { id: 'playlists', label: '재생목록' },
  { id: 'recommend', label: '추천' },
];


/** 카드 → 맞춤 추천용 정보 (게임·장르, 영상/라이브) */
export function videoInterestItem(video: any): InterestItem {
  const games = [...(Array.isArray(video?.games) ? video.games : []), ...(Array.isArray(video?.parentLog?.games) ? video.parentLog.games : [])];
  if (!games.length && video?.parentLog?.game) games.push({ name: video.parentLog.game, category: video.parentLog.category });
  return { id: String(video?.id || ''), kind: video?.isLive ? 'live' : 'video', tokens: tokensOf(games, [video?.category]) };
}

/** 연결된 쇼츠 + 방송 기록의 쇼츠를 하나로 (같은 쇼츠는 한 번만) */
function mergeShorts(...lists: (any[] | undefined)[]): { url: string; title?: string }[] {
  const seen = new Set<string>();
  const out: { url: string; title?: string }[] = [];
  lists.forEach((list) => (Array.isArray(list) ? list : []).forEach((s: any) => {
    const url = typeof s === 'string' ? s : s?.url;
    const id = extractYoutubeId(url || '') || url;
    if (!url || seen.has(id)) return;
    seen.add(id);
    out.push({ url, title: cleanShortsTitle(typeof s === 'string' ? '' : s?.title) || undefined });
  }));
  return out;
}

export const VideoCard = ({ 
  video,
  allLogs,
  onNavigateToCalendar,
  onOpenBroadcastModal,
  isCompact = false,
  isExpanded = false,
  linkedShorts,
}: { 
  /** 이 영상과 연결된 쇼츠 (쇼츠 아래에 이 영상이 걸린 것) */
  linkedShorts?: { url: string; title?: string }[];
  video: any;
  allLogs?: Record<string, any>;
  onNavigateToCalendar?: (dateStr: string) => void;
  onOpenBroadcastModal?: (video: any) => void;
  isCompact?: boolean;
  isExpanded?: boolean;
}) => {
  const [showShortsMenu, setShowShortsMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const dateBadgeRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isPlayingInline, setIsPlayingInline] = useState(false);

  // 쇼츠: 이 영상에 직접 연결된 쇼츠 먼저, 그다음 같은 방송 기록의 쇼츠 (중복 제거, 쇼츠 표시 태그는 뗌)
  const shorts = useMemo(() => mergeShorts(linkedShorts, video.parentLog?.shorts), [linkedShorts, video.parentLog?.shorts]);
  // 맞춤 추천: 이 카드에 관심 있어 보이는 행동을 조용히 기록
  const interestItem = useMemo(() => videoInterestItem(video), [video]);
  const trackRef = useInterestTracker<HTMLDivElement>(interestItem);
  // 라이브 카드의 편집본 (그 방송 기록의 편집본 + 이 방송에 걸쳐 있는 다른 기록의 편집본)
  const liveEdits = useMemo(() => (video.isLive ? (video.liveEdits || []) : []), [video]);
  const videoMeta = useVideoMeta(video.id);
  const durationSec = videoMeta?.durationSec ?? null;
  const uploadDate = videoMeta?.publishedAt ? toKstDate(videoMeta.publishedAt) : '';
  const vods = video.parentLog?.vods || [];

  // 날짜 계산: 몰아보기의 경우 게임 정렬 순서에 맞춰 방송일 순서 엄격 적용, 일반 영상은 최신순
  const broadcastDates: string[] = useMemo(() => {
    if (video.isCompilation && Array.isArray(video.games) && video.games.length > 0) {
      const datesFromGames: string[] = [];
      const logsList = allLogs ? (Array.isArray(allLogs) ? allLogs : Object.values(allLogs || {})) : [];

      video.games.forEach((g: any) => {
        let d = g.date;
        if (!d && logsList.length > 0) {
          const matched = logsList.find((l: any) => 
            (Array.isArray(l.games) && l.games.some((x: any) => x.name === g.name)) || l.game === g.name
          );
          if (matched?.date) d = matched.date;
        }
        if (d && !datesFromGames.includes(d)) {
          datesFromGames.push(d);
        }
      });

      // 혹시 allBroadcastDates에 추가로 남아있는 날짜가 있다면 순서대로 덧붙임
      if (video.allBroadcastDates && Array.isArray(video.allBroadcastDates)) {
        video.allBroadcastDates.forEach((d: string) => {
          if (d && !datesFromGames.includes(d)) {
            datesFromGames.push(d);
          }
        });
      }

      if (datesFromGames.length > 0) return datesFromGames;
    }

    if (video.allBroadcastDates && Array.isArray(video.allBroadcastDates) && video.allBroadcastDates.length > 0) {
      return Array.from(new Set(video.allBroadcastDates.filter(Boolean) as string[])).sort((a: string, b: string) => b.localeCompare(a));
    }
    if (video.parentLog?.date) {
      return [video.parentLog.date];
    }
    return [];
  }, [video, allLogs]);

  const mostRecentDate = broadcastDates[0];
  const hasMultipleDates = broadcastDates.length > 1;
  const isMultiBroadcastOrCompilation = hasMultipleDates || video.isCompilation || (Array.isArray(video.allBroadcastDates) && video.allBroadcastDates.length > 1);

  // 게임 목록 추출 (게임 링크가 누락되지 않도록 parentLog 및 allLogs와 완벽 연동)
  const gamesList: { name: string; link?: string; category?: string }[] = useMemo(() => {
    let list: { name: string; link?: string; category?: string }[] = [];
    if (video.games && Array.isArray(video.games) && video.games.length > 0) {
      list = [...video.games];
    } else if (video.parentLog?.games && video.parentLog.games.length > 0) {
      list = [...video.parentLog.games];
    } else if (video.parentLog?.game) {
      list = [{ name: video.parentLog.game, link: (video.parentLog as any).gameLink || '', category: video.parentLog.category || '' }];
    }

    // 혹시라도 link가 비어있는 항목이 있다면 parentLog.games 또는 allLogs에서 해당 게임의 스토어 링크를 탐색하여 보강
    return list.map((g: any) => {
      let link = g.link || g.url || g.gameUrl || g.steamUrl || '';
      if (!link && video.parentLog?.games) {
        const found = video.parentLog.games.find((pg: any) => 
          pg.name && g.name && pg.name.trim().toLowerCase() === g.name.trim().toLowerCase()
        );
        if (found?.link) link = found.link;
      }
      if (!link && allLogs) {
        const logsList = Array.isArray(allLogs) ? allLogs : Object.values(allLogs);
        for (const l of logsList) {
          if (Array.isArray(l.games)) {
            const found = l.games.find((lg: any) => 
              lg.name && g.name && lg.name.trim().toLowerCase() === g.name.trim().toLowerCase() && lg.link
            );
            if (found?.link) {
              link = found.link;
              break;
            }
          }
        }
      }
      return { ...g, link };
    });
  }, [video, allLogs]);

  const hasMoreThanTwoGames = gamesList.length > 2;
  const hasGameGroups = video.gameGroups && Array.isArray(video.gameGroups) && video.gameGroups.length > 0;

  const displayedGames = (hasMoreThanTwoGames && !showAllGames) 
    ? gamesList.slice(0, 2) 
    : gamesList;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSharing) return;
    setIsSharing(true);
    noteInterest(interestItem, 'engage');
    try {
      const textToShare = formatRecommendShareText(video, allLogs);
      await shareTextOrClipboard(textToShare, `${video.videoTitle || '추천 영상'} 정보`);
    } catch (err) {
      console.error('Share error:', err);
    } finally {
      setIsSharing(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowShortsMenu(false);
      }
      if (dateBadgeRef.current && !dateBadgeRef.current.contains(event.target as Node)) {
        setShowAllDates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayDate = video.isCompilation 
    ? (video.createdAt ? video.createdAt.substring(0, 10) : (mostRecentDate || video.parentLog?.date))
    : (video.parentLog?.date || mostRecentDate);

  return (
    <div 
      ref={trackRef}
      className={cn(
        "group relative isolate flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all",
        isExpanded 
          ? "rounded-t-[24px] rounded-b-none border-b-0 shadow-md z-10" 
          : "rounded-[24px] overflow-hidden hover:shadow-xl hover:-translate-y-1"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {isPlayingInline ? (
          <div className="relative w-full h-full bg-black z-20">
            <iframe
              src={`https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&rel=0`}
              title={video.videoTitle}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsPlayingInline(false);
              }}
              className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-white text-xs font-semibold flex items-center gap-1 shadow-md transition-colors cursor-pointer"
              title="플레이어 닫기"
            >
              <X className="w-3.5 h-3.5" />
              <span>닫기</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPlayingInline(true);
              noteInterest(interestItem, 'play');
            }}
            className="group/thumb block w-full h-full relative text-left cursor-pointer border-0 p-0 m-0 bg-transparent"
            title="클릭하여 화면 내에서 바로 영상 재생"
          >
            <img 
              src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} 
              alt={video.videoTitle} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            />
            <div className="absolute inset-0 bg-black/10 group-hover/thumb:bg-black/0 transition-colors flex items-center justify-center">
              <GlassPlayButton size={isCompact ? 'sm' : 'md'} />
            </div>
          </button>
        )}

        {/* 썸네일 배지: 우하단 재생 시간 / 좌하단 생방일·몰아보기 (재생 중에는 숨김) */}
        {!isPlayingInline && typeof durationSec === 'number' && durationSec > 0 && (
          <span className={cn(
            "absolute bottom-2 right-2 z-20 bg-black/80 text-white font-bold rounded backdrop-blur-sm shadow-sm select-none tabular-nums pointer-events-none",
            isCompact ? "text-[10px] sm:text-xs px-1.5 py-0.5" : "text-xs px-1.5 py-1"
          )}>
            {formatDuration(durationSec)}
          </span>
        )}
        {!isPlayingInline && (
          <div className={cn("absolute bottom-2 left-2 z-20 flex flex-col items-start gap-1", isCompact ? "max-w-[calc(100%-3.75rem)]" : "max-w-[calc(100%-5rem)]")}>
          {isMultiBroadcastOrCompilation ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenBroadcastModal?.(video);
              }}
              className={cn(
                "font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105 min-w-0",
                isCompact ? "text-[10px] sm:text-xs px-2 py-0.5 sm:px-2.5 sm:py-1" : "text-xs px-2.5 py-1",
                video.isCompilation
                  ? "bg-purple-900/90 hover:bg-purple-950 text-purple-100 border border-purple-400/50 shadow-purple-950/40"
                  : "bg-zinc-900/85 hover:bg-black text-zinc-100 border border-white/20"
              )}
              title="클릭하여 연동 생방 펼치기"
            >
              {video.isCompilation ? (
                <Layers className="w-3.5 h-3.5 text-purple-300" />
              ) : (
                <PlaySquare className="w-3.5 h-3.5 text-zinc-300" />
              )}
              <span>{video.isCompilation ? `몰아보기 (${video.games?.length || broadcastDates.length}개 게임)` : `${broadcastDates.length}개 생방`}</span>
            </button>
          ) : (mostRecentDate || displayDate) ? (
            <div 
              ref={dateBadgeRef}
              className="min-w-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (mostRecentDate || displayDate) {
                    onNavigateToCalendar?.(mostRecentDate || displayDate);
                  }
                }}
                className={cn("bg-black/80 hover:bg-black/95 text-white font-normal rounded backdrop-blur-sm flex items-center gap-1 cursor-pointer transition-colors shadow-sm select-none whitespace-nowrap", isCompact ? "text-[10px] sm:text-xs px-1.5 py-0.5" : "text-xs px-2 py-1")}
                title="클릭하여 방송 목록 해당일로 이동"
              >
                <span>생방일: {mostRecentDate || displayDate}</span>
              </button>
            </div>
          ) : null}
          </div>
        )}
      </div>
      
      <div className={cn("p-4 flex-1 flex flex-col", isCompact && "p-2.5 sm:p-4")}>
        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
          <a href={video.videoUrl} target="_blank" rel="noreferrer" className={cn("font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex-1", isCompact ? "text-xs sm:text-base" : "text-sm sm:text-base")}>
            {video.videoTitle}
          </a>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className={cn("rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center", isCompact ? "p-1 -mr-0.5" : "p-1.5 -mr-1 -mt-0.5")}
            title="방송 및 영상 정보 공유"
            aria-label="공유"
          >
            {isSharing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600 dark:text-zinc-400" />
            ) : (
              <ShareBoxArrowIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 업로드일 · 경과 시간 (유튜브 표기 방식) */}
        {videoMeta?.publishedAt && (
          <p className={cn("mt-1 text-zinc-500 dark:text-zinc-400 tabular-nums", isCompact ? "text-[10px] sm:text-xs" : "text-xs")}>
            <span>{uploadDate}</span>
            <span aria-hidden="true" className="mx-1">·</span>
            <span>{formatRelativeTime(videoMeta.publishedAt)}</span>
          </p>
        )}
        
        {/* 생방이 여러개이거나 몰아보기의 경우 펼치기 UI (몰아보기에는 산뜻하고 감각적인 보라 강조색 적용) */}
        {isMultiBroadcastOrCompilation ? (
          <div className="mt-3 mb-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenBroadcastModal?.(video);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01] font-hanna font-pro",
                video.isCompilation
                  ? "bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90 shadow-purple-500/10"
                  : "bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700/80"
              )}
            >
              <div className="flex items-center gap-2">
                {video.isCompilation ? (
                  <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                ) : (
                  <PlaySquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                )}
                <span className={cn("font-hanna font-pro", video.isCompilation ? "font-bold text-purple-900 dark:text-purple-200" : "")}>
                  {isExpanded
                    ? (video.isCompilation ? '몰아보기 연동 생방 접기' : '연동 생방 접기')
                    : (video.isCompilation ? '몰아보기 연동 생방 펼치기' : '연동 생방 펼치기')
                  }
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-md font-hanna font-pro",
                  video.isCompilation
                    ? "bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200"
                    : "bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300"
                )}>
                  {video.isCompilation ? `${video.games?.length || broadcastDates.length}개 게임` : `${broadcastDates.length}개 생방`}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
                )}
              </div>
            </button>
          </div>
        ) : (
          /* 단일 생방의 경우 기존 게임 태그 표시 */
          gamesList.length > 0 && (
            <div className="mt-3 mb-2 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {displayedGames.map((g: any, i: number) => {
                  const hasSeparateCategory = g.category && g.category.trim() !== '' && g.category.trim().toLowerCase() !== g.name.trim().toLowerCase() && g.category !== '종합';
                  const gameContent = (
                    <span className={`px-2 py-0.5 text-[10px] rounded-full select-none inline-flex items-center gap-1 font-hanna font-pro ${
                      g.link 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}>
                      <span><GameTitle text={g.name} link={g.link} /></span>
                      {hasSeparateCategory && (
                        <span className="opacity-60 font-normal border-l border-current pl-1 font-hanna font-pro">
                          {g.category}
                        </span>
                      )}
                    </span>
                  );

                  return g.link ? (
                    <a key={i} href={g.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      {gameContent}
                    </a>
                  ) : (
                    <div key={i}>{gameContent}</div>
                  );
                })}
              </div>

              {hasMoreThanTwoGames && (
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowAllGames(prev => !prev);
                    }}
                    className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer font-hanna font-pro"
                  >
                    {showAllGames 
                      ? '접기' 
                      : `+${gamesList.length - 2}개 더보기`}
                  </button>
                </div>
              )}
            </div>
          )
        )}
        
        <div className="mt-auto pt-4 flex flex-col gap-2 relative">
          <a 
            href={video.videoUrl || '#'} 
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!video.videoUrl) e.preventDefault();
              else noteInterest(interestItem, 'play');
            }}
            className={`w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all font-hanna font-pro ${
              video.videoUrl
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs hover:scale-[1.01]'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            {video.isLive ? <PlaySquare className="w-4 h-4 text-purple-600 dark:text-purple-400" /> : <YoutubeLogo className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />} <span className="font-hanna font-pro">{video.isLive ? '생방송 보기' : '영상 보기'}</span>
          </a>
          
          {(!isMultiBroadcastOrCompilation || video.isLive) && (
            <div className="flex gap-2">
              {video.isLive ? (
                // 라이브 카드: 카드 자체가 생방송이라 그 방송의 편집본을 (두 방송에 걸친 편집본도 포함)
                <LinkMenu items={liveEdits} label="편집본" menuTitle="편집본" tone="zinc" icon={<YoutubeLogo className="w-4 h-4 shrink-0" />} onOpen={() => noteInterest(interestItem, 'engage')} />
              ) : vods.length > 0 && vods[0].url ? (
                <a 
                  href={vods[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => noteInterest(interestItem, 'play')}
                  className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20 font-hanna font-pro"
                >
                  <PlaySquare className="w-4 h-4" /> <span className="font-hanna font-pro">생방송 (풀영상)</span>
                </a>
              ) : null}

              <LinkMenu items={shorts} label={shorts.length > 1 ? '쇼츠' : '쇼츠 보기'} menuTitle="쇼츠" tone="red" icon={<ShortsIcon className="w-4 h-4" />} onOpen={() => noteInterest(interestItem, 'engage')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { AppData } from "../../types";

export function RecommendTab({ 
  data, 
  rateVideo,
  targetCategory,
  targetSearchTerm,
  pinnedVideoId,
  onClearTarget,
  isActive = true,
  onNavigateToCalendar,
  searchTerm: propSearchTerm,
  onSearchTermChange,
}: { 
  data: AppData | null; 
  rateVideo?: (id: string, score: number) => void;
  targetCategory?: string | null;
  targetSearchTerm?: string | null;
  pinnedVideoId?: string | null;
  onClearTarget?: () => void;
  isActive?: boolean;
  onNavigateToCalendar?: (dateStr: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
}) {
// const { data } = useFirebaseData();
  const [internalSearchTerm, setInternalSearchTerm] = useState(() => sessionStorage.getItem('rec_searchTerm') || '');
  const searchTerm = propSearchTerm !== undefined ? propSearchTerm : internalSearchTerm;
  const setSearchTerm = (term: string) => {
    setInternalSearchTerm(term);
    onSearchTermChange?.(term);
    try {
      sessionStorage.setItem('rec_searchTerm', term);
    } catch {}
  };
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);

  // 사용자가 직접 선택하여 저장된 카테고리
  const userChosenCategoriesRef = useRef<string[]>((() => {
    try {
      const saved = sessionStorage.getItem('rec_user_categories');
      return saved ? JSON.parse(saved) : ['전체'];
    } catch {
      return ['전체'];
    }
  })());

  // 외부(카테고리 탭 등)에서 링크를 통해 이동해온 임시 필터 상태인지 여부
  const isNavigatedFromExternalRef = useRef<boolean>(false);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('rec_user_categories') || sessionStorage.getItem('rec_selectedCategories');
      return saved ? JSON.parse(saved) : ['전체'];
    } catch { return ['전체']; }
  });

  // 탭 재진입 감지: 다른 탭을 갔다가 다시 추천 영상 탭으로 돌아왔을 때
  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    if (!prevIsActiveRef.current && isActive) {
      // 검색탭 나갔다 들어오면 몰아보기 연동 생방 펼치기 상태를 초기화(원래 카드 목록으로 복귀)
      setSelectedBroadcastModalVideo(null);

      // 외부에서 건너온 임시 카테고리/검색어였다면 사용자가 선택했던 원래 상태로 복구
      if (isNavigatedFromExternalRef.current) {
        setSelectedCategories(userChosenCategoriesRef.current || ['전체']);
        setSearchTerm('');
        isNavigatedFromExternalRef.current = false;
      }
    }
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  const [hasSearched, setHasSearched] = useState<boolean>(() => {
    try {
      return Boolean(sessionStorage.getItem('rec_hasSearched') === 'true') ||
        Boolean(sessionStorage.getItem('rec_searchTerm')?.trim()) ||
        Boolean(targetCategory) ||
        Boolean(targetSearchTerm);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('rec_hasSearched', hasSearched ? 'true' : 'false');
    } catch {}
  }, [hasSearched]);

  // 하위 탭: 홈(전체·정렬 자유) / 추천(추천순) / 동영상(편집본만) / Shorts / 재생목록
  const [subTab, setSubTab] = useState<RecommendSubTab>(() => {
    const saved = sessionStorage.getItem('rec_subTab') as RecommendSubTab | null;
    return saved && RECOMMEND_SUB_TABS.some((t) => t.id === saved) ? saved : 'home';
  });
  const [subTabDir, setSubTabDir] = useState(0); // 넘어가는 방향 (밀기 애니메이션용)
  const changeSubTab = (next: RecommendSubTab) => {
    const from = RECOMMEND_SUB_TABS.findIndex((t) => t.id === subTab);
    const to = RECOMMEND_SUB_TABS.findIndex((t) => t.id === next);
    setSubTabDir(to > from ? 1 : to < from ? -1 : 0);
    setSubTab(next);
    // 선택한 탭 버튼이 보이도록 탭 줄을 옆으로 맞춤
    requestAnimationFrame(() => document.getElementById(`rec-subtab-${next}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
    sessionStorage.setItem('rec_subTab', next);
    setCurrentPage(1);
    setSelectedBroadcastModalVideo(null);
  };
  useEffect(() => {
    if (targetCategory) {
      isNavigatedFromExternalRef.current = true;
      setSelectedCategories([targetCategory]);
      setSubTab('home'); sessionStorage.setItem('rec_subTab', 'home'); // 다른 화면에서 넘어오면 홈 탭으로
      setSearchTerm('');
      setHasSearched(true);
      onClearTarget?.();
    }
  }, [targetCategory]);

  useEffect(() => {
    if (targetSearchTerm) {
      isNavigatedFromExternalRef.current = true;
      setSearchTerm(targetSearchTerm);
      setSubTab('home'); sessionStorage.setItem('rec_subTab', 'home'); // 다른 화면에서 넘어오면 홈 탭으로
      setSelectedCategories(['전체']);
      setHasSearched(true);
      onClearTarget?.();
    }
  }, [targetSearchTerm]);

  useEffect(() => {
    if (pinnedVideoId) {
      isNavigatedFromExternalRef.current = true;
      setSubTab('recommend'); sessionStorage.setItem('rec_subTab', 'recommend'); // 특정 영상 추천으로 넘어오면 추천 탭 (맨 앞에 고정)
      setSearchTerm('');
      setSelectedCategories(['전체']);
      setCurrentPage(1);
      setHasSearched(true);
      onClearTarget?.();
    }
  }, [pinnedVideoId]);
  const [shuffleSeed, setShuffleSeed] = useState(() => {
    const saved = sessionStorage.getItem('rec_shuffleSeed');
    return saved ? parseInt(saved, 10) : Date.now();
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = sessionStorage.getItem('rec_currentPage');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [sortOrder, setSortOrder] = useState(() => {
    const saved = sessionStorage.getItem('rec_sortOrder');
    const hasSearch = Boolean(sessionStorage.getItem('rec_searchTerm')?.trim());
    if (saved === 'accuracy' && !hasSearch) return 'desc';
    if (saved === 'recommend') return getPrefs().recommendSort; // 추천순은 '추천' 탭으로 옮김
    return saved || getPrefs().recommendSort; // 기본값은 설정에서
  });

  // 검색 전 사용자가 선택해둔 일반 정렬(최신순, 과거순, 추천순) 보관용 ref
  const previousNonAccuracySortRef = useRef<string>(
    sortOrder !== 'accuracy' ? sortOrder : 'desc'
  );
  // 검색어 입력 상태에서 사용자가 수동으로 다른 정렬을 선택했는지 여부
  const userSelectedOtherSortDuringSearchRef = useRef<boolean>(false);
  const prevSearchTermRef = useRef<string>(searchTerm);

  // 검색어 입력 시 정확도순 자동 선택, 검색어 삭제 시 이전 정렬 복원 (다른 정렬 수동 선택 시 유지)
  useEffect(() => {
    const prevTerm = prevSearchTermRef.current.trim();
    const currTerm = searchTerm.trim();

    // 1. 검색어 입력 시 설정의 '검색 기본 정렬'(기본 정확도순) 자동 선택
    if (!prevTerm && currTerm) {
      if (sortOrder !== 'accuracy') {
        previousNonAccuracySortRef.current = sortOrder;
      }
      userSelectedOtherSortDuringSearchRef.current = false;
      setSortOrder(getPrefs().searchSort || 'accuracy');
    }
    // 2. 검색어 삭제 시
    else if (prevTerm && !currTerm) {
      // 검색 중 정확도순이 아닌 다른 정렬을 선택했을 경우 그 정렬 유지
      if (userSelectedOtherSortDuringSearchRef.current) {
        // 현재 sortOrder 그대로 유지
      } else {
        // 최신순 초기화가 아닌 이전 정렬 순서로 복귀
        setSortOrder(previousNonAccuracySortRef.current || 'desc');
      }
    }

    prevSearchTermRef.current = searchTerm;
  }, [searchTerm, sortOrder]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 최근 검색어 (모든 화면 공통). 같은 검색어를 1.5초 그대로 두면 저장
  const recentSearches = useRecentSearches();
  const clearAllRecentSearches = clearRecentSearches;
  useEffect(() => {
    const t = searchTerm.trim();
    if (t.length < 2 || isVideoUrl(t)) return;
    const id = window.setTimeout(() => addRecentSearch(t), 1500);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  // 추천 탭은 검색과 상관없이 추천만 보여 줌 → 추천 탭에서 검색하면 홈 탭으로 옮겨 결과 표시
  const prevSearchForTabRef = useRef(searchTerm);
  useEffect(() => {
    const prev = prevSearchForTabRef.current;
    prevSearchForTabRef.current = searchTerm;
    if (subTab === 'recommend' && searchTerm.trim() && searchTerm !== prev) changeSubTab('home');
  }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showAllWithoutSearch, setShowAllWithoutSearch] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileViewMode, setMobileViewMode] = useState<'1' | '2'>(() => {
    if (typeof window === 'undefined') return '1';
    return (localStorage.getItem('uzuhama_recommend_view_mode') as '1' | '2') || '1';
  });

  const [viewStyle, setViewStyle] = useViewStyle('recommend');
  const handleViewModeChange = (mode: '1' | '2') => {
    setMobileViewMode(mode);
    try {
      localStorage.setItem('uzuhama_recommend_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const firstYear = useMemo(() => {
    const dates = Object.values(data?.logs || {}).map((l: any) => l.date).filter(Boolean).sort();
    return dates.length > 0 ? dates[0].substring(0, 4) : '2016';
  }, [data?.logs]);

  useEffect(() => {
    sessionStorage.setItem('rec_searchTerm', searchTerm);
    sessionStorage.setItem('rec_selectedCategories', JSON.stringify(selectedCategories));
    sessionStorage.setItem('rec_shuffleSeed', shuffleSeed.toString());
    sessionStorage.setItem('rec_currentPage', currentPage.toString());
    sessionStorage.setItem('rec_sortOrder', sortOrder);
  }, [searchTerm, selectedCategories, shuffleSeed, currentPage, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategories, shuffleSeed, sortOrder]);

  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('userVideoRatings');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  const [syncCode, setSyncCode] = useState<string>(() => {
    return localStorage.getItem('userSyncCode') || Math.random().toString(36).substring(2, 8).toUpperCase();
  });
  const [inputSyncCode, setInputSyncCode] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    localStorage.setItem('userSyncCode', syncCode);
  }, [syncCode]);

  const saveToCloud = async () => {
    setIsSyncing(true);
    setSyncMessage('');
    try {
      await setDoc(doc(db, 'user_preferences', syncCode), { ratings, history, updatedAt: Date.now() });
      setSyncMessage('클라우드에 저장되었어요.');
    } catch (e) {
      setSyncMessage('저장 실패!');
    }
    setIsSyncing(false);
    setTimeout(() => setSyncMessage(''), 3000);
  };

  const loadFromCloud = async () => {
    if (!inputSyncCode) return;
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const docSnap = await getDoc(doc(db, 'user_preferences', inputSyncCode.toUpperCase()));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.ratings) {
          setRatings(data.ratings);
          localStorage.setItem('userVideoRatings', JSON.stringify(data.ratings));
        }
        if (data.history) {
          setHistory(data.history);
          localStorage.setItem('userVideoHistory', JSON.stringify(data.history));
        }
        setSyncCode(inputSyncCode.toUpperCase());
        setSyncMessage('불러오기 완료!');
      } else {
        setSyncMessage('코드를 찾을 수 없어요.');
      }
    } catch (e) {
      setSyncMessage('불러오기 실패!');
    }
    setIsSyncing(false);
    setTimeout(() => setSyncMessage(''), 3000);
  };

  const [history, setHistory] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('userVideoHistory');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  // Random weights for current session so search/filter doesn't re-shuffle randomly
  const baseWeights = useRef<Record<string, number>>({});

  const handleRate = (id: string, score: number) => {
    if (ratings[id] !== undefined) return;
    const newRatings = { ...ratings, [id]: score };
    setRatings(newRatings);
    if (rateVideo) rateVideo(id, score);
    localStorage.setItem('userVideoRatings', JSON.stringify(newRatings));
  };

  // 설정에서 시청 기록을 지우면 화면의 기록도 바로 비움
  useEffect(() => {
    const on = () => setHistory({});
    window.addEventListener('uzuhama-interest-cleared', on);
    return () => window.removeEventListener('uzuhama-interest-cleared', on);
  }, []);

  const handleWatch = (id: string) => {
    const newHistory = { ...history, [id]: Date.now() };
    setHistory(newHistory);
    localStorage.setItem('userVideoHistory', JSON.stringify(newHistory));
  };

  // 재생목록 이름(예: 우주하마 배틀그라운드)으로, 게임이 안 붙은 영상에 그 게임을 기본으로 붙임
  const { data: playlistData } = usePlaylists();
  // 채널의 모든 영상 (기록에 연결 안 된 영상도 홈에 보이게)
  const channelVideos = useChannelVideos();
  const playlistGameMap = useMemo(
    () => buildPlaylistGameMap(playlistData?.playlists, buildGameCatalog(data?.logs)),
    [playlistData, data?.logs]
  );

  const allVideos = useMemo(() => {
    if (!data || !data.logs) return [];

    // 각 영상의 관련 게임 추출 함수 (몰아보기: 등록된 모든 게임 취합 / 일반 영상: 해당 영상 관련 게임만 추출)
    const extractRelevantGames = (edit: any, log: any) => {
      const isComp = !!(edit.isCompilation || edit.compilationId);

      // 1. 몰아보기: 등록 시 체크된 게임만 정확히 가져오기
      if (isComp) {
        const compGames: any[] = [];
        const seenNames = new Set<string>();

        const addGame = (g: any) => {
          if (!g) return;
          const name = (typeof g === 'string' ? g : g.name)?.trim();
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            compGames.push(typeof g === 'string' ? { name } : g);
          }
        };

        if (Array.isArray(edit.games)) edit.games.forEach(addGame);
        if (compGames.length === 0 && (edit.game || edit.category)) {
          addGame({ name: edit.game || edit.category, category: '' });
        }
        return compGames;
      }

      // 2. 일반 영상: 해당 영상 관련 게임 및 링크 정밀 추출 (영상 카테고리가 장르 태그인 경우에도 생방송 진행 게임 보존)
      if (Array.isArray(edit.games) && edit.games.length > 0) {
        return edit.games.map((g: any) => ({
          name: typeof g === 'string' ? g : g.name || '',
          link: typeof g === 'string' ? '' : (g.link || g.url || g.gameUrl || g.steamUrl || ''),
          category: typeof g === 'string' ? '' : (g.category || '')
        }));
      }

      const rawLogGames: any[] = Array.isArray(log.games) ? log.games : [];
      const logGames: any[] = rawLogGames.map((g: any) => ({
        name: typeof g === 'string' ? g : (g.name || g.game || ''),
        link: typeof g === 'string' ? '' : (g.link || g.url || g.gameUrl || g.steamUrl || log.gameLink || log.gameUrl || ''),
        category: typeof g === 'string' ? '' : (g.category || log.category || '')
      })).filter((g: any) => Boolean(g.name));

      const editGame = edit.game?.trim();
      const editCat = edit.category?.trim();
      const editTitle = edit.title?.trim() || '';

      // (1) edit.game과 일치하는 게임 찾기
      if (editGame) {
        const matched = logGames.find((g: any) => 
          g.name && (
            g.name.toLowerCase() === editGame.toLowerCase() ||
            editGame.toLowerCase().includes(g.name.toLowerCase()) ||
            g.name.toLowerCase().includes(editGame.toLowerCase())
          )
        );
        if (matched) {
          return [{
            name: matched.name,
            link: matched.link || '',
            category: matched.category && matched.category.toLowerCase() !== matched.name.toLowerCase() ? matched.category : ''
          }];
        }
        if (logGames.length === 1) {
          return [logGames[0]];
        }
        return [{ name: editGame, link: '', category: '' }];
      }

      // (2) 영상 제목(edit.title)에 포함된 logGames 찾기
      if (logGames.length > 0 && editTitle) {
        const matchedByTitle = logGames.filter((g: any) => 
          g.name && editTitle.toLowerCase().includes(g.name.toLowerCase())
        );
        if (matchedByTitle.length > 0) {
          return matchedByTitle.map((m: any) => ({
            name: m.name,
            link: m.link || '',
            category: m.category && m.category.toLowerCase() !== m.name.toLowerCase() ? m.category : ''
          }));
        }
      }

      // (3) edit.category (영상 카테고리가 게임명 또는 장르 형태인 경우) 매칭
      if (editCat && editCat !== '전체' && editCat !== '몰아보기' && editCat !== '종합') {
        // 게임명과 직접 매칭
        const matchedByName = logGames.find((g: any) => 
          g.name && (
            g.name.toLowerCase() === editCat.toLowerCase() ||
            editCat.toLowerCase().includes(g.name.toLowerCase()) ||
            g.name.toLowerCase().includes(editCat.toLowerCase())
          )
        );
        if (matchedByName) {
          return [{
            name: matchedByName.name,
            link: matchedByName.link || '',
            category: matchedByName.category && matchedByName.category.toLowerCase() !== matchedByName.name.toLowerCase() ? matchedByName.category : ''
          }];
        }

        // 게임 카테고리(장르)와 일치하거나 포함되는 경우 매칭
        const matchedByCat = logGames.filter((g: any) => {
          if (!g.category) return false;
          const gc = g.category.toLowerCase();
          const ec = editCat.toLowerCase();
          return gc === ec || gc.includes(ec) || ec.includes(gc) ||
            ec.split(/[,/]/).some((part: string) => gc.includes(part.trim()));
        });
        if (matchedByCat.length > 0) {
          return matchedByCat.map((m: any) => ({
            name: m.name,
            link: m.link || '',
            category: m.category && m.category.toLowerCase() !== m.name.toLowerCase() ? m.category : ''
          }));
        }
      }

      // (4) log.games가 1개뿐인 경우 (생방송에서 1개 게임만 진행했으므로, 해당 편집본 영상은 당연히 그 게임임)
      if (logGames.length === 1) {
        const g = logGames[0];
        return [{
          name: g.name,
          link: g.link || '',
          category: g.category && g.category.toLowerCase() !== g.name.toLowerCase() ? g.category : ''
        }];
      }

      // (5) log.games가 다수이지만 특정 게임이 좁혀지지 않은 경우 전체 게임 반환
      if (logGames.length > 1) {
        return logGames;
      }

      // (6) log.game이 단일 게임명인 경우
      if (log.game && !log.game.includes(',')) {
        return [{ name: log.game.trim(), link: log.gameLink || log.gameUrl || '', category: log.category || '' }];
      }

      return editCat && editCat !== '전체' && editCat !== '몰아보기' && editCat !== '종합'
        ? [{ name: editCat, link: '', category: '' }]
        : [];
    };

    const videoMap = new Map<string, any>();

    Object.values(data.logs).forEach((log: any) => {
      if (log.edited && Array.isArray(log.edited)) {
        log.edited.forEach((edit: any) => {
          const id = extractYoutubeId(edit.url);
          if (id) {
            if (baseWeights.current[id] === undefined) {
              baseWeights.current[id] = Math.random();
            }

            const uniqueKey = edit.compilationId ? `compilation_${edit.compilationId}` : id;
            const createdAt = edit.createdAt || (edit.compilationId?.startsWith('compilation_') 
              ? new Date(parseInt(edit.compilationId.replace('compilation_', ''), 10)).toISOString() 
              : undefined);

            if (videoMap.has(uniqueKey)) {
              const existing = videoMap.get(uniqueKey);
              if (createdAt && !existing.createdAt) {
                existing.createdAt = createdAt;
              }
              if (log.date && !existing.allBroadcastDates.includes(log.date)) {
                existing.allBroadcastDates.push(log.date);
              }
              if (edit.allBroadcastDates && Array.isArray(edit.allBroadcastDates)) {
                edit.allBroadcastDates.forEach((d: string) => {
                  if (d && !existing.allBroadcastDates.includes(d)) existing.allBroadcastDates.push(d);
                });
              }
              if (edit.gameSortOrder) existing.gameSortOrder = edit.gameSortOrder;
              if (edit.gameGroups) existing.gameGroups = edit.gameGroups;
              
              if (edit.isCompilation || existing.isCompilation) {
                existing.isCompilation = true;
                // 몰아보기는 등록된 모든 게임 누락 없이 병합
                const existingGameNames = new Set(existing.games.map((g: any) => g.name?.trim().toLowerCase()));
                const addGame = (g: any) => {
                  if (!g) return;
                  const name = (typeof g === 'string' ? g : g.name)?.trim();
                  if (name && !existingGameNames.has(name.toLowerCase())) {
                    existingGameNames.add(name.toLowerCase());
                    existing.games.push(typeof g === 'string' ? { name } : g);
                  }
                };

                if (Array.isArray(edit.games)) edit.games.forEach(addGame);
              }
            } else {
              const initialGames = extractRelevantGames(edit, log);

              const initialDates = edit.allBroadcastDates && Array.isArray(edit.allBroadcastDates) && edit.allBroadcastDates.length > 0
                ? [...edit.allBroadcastDates]
                : (log.date ? [log.date] : []);

              videoMap.set(uniqueKey, {
                id,
                compilationId: edit.compilationId,
                isCompilation: !!edit.isCompilation,
                createdAt,
                videoTitle: (edit.title || log.game || log.category || '우주하마 편집본').replace(/^\[몰아보기\]\s*/, ''),
                videoUrl: edit.url,
                category: edit.category || (Array.isArray(edit.categories) ? edit.categories.join(', ') : undefined),
                parentLog: log,
                allBroadcastDates: initialDates,
                games: initialGames,
                gameSortOrder: edit.gameSortOrder,
                gameGroups: edit.gameGroups
              });
            }
          }
        });
      }
    });

    // 몰아보기 영상: 연동된 모든 생방 로그로부터 등록된 게임들을 누락 없이 모두 수집
    videoMap.forEach((v) => {
      if (v.isCompilation && Array.isArray(v.allBroadcastDates)) {
        const existingNames = new Set(v.games.map((g: any) => g.name?.trim().toLowerCase()));
        v.allBroadcastDates.forEach((dateStr: string) => {
          const matchedLog = (data.logs as any)[dateStr] || Object.values(data.logs).find((l: any) => l.date === dateStr);
          if (matchedLog) {
            if (Array.isArray(matchedLog.edited)) {
              matchedLog.edited.forEach((e: any) => {
                if ((e.compilationId === v.compilationId || e.url === v.videoUrl) && Array.isArray(e.games)) {
                  e.games.forEach((g: any) => {
                    const name = (typeof g === 'string' ? g : g.name)?.trim();
                    if (name && !existingNames.has(name.toLowerCase())) {
                      existingNames.add(name.toLowerCase());
                      v.games.push(typeof g === 'string' ? { name } : g);
                    }
                  });
                }
              });
            }
          }
        });
      }
    });

    // 게임이 하나도 없는 영상: 재생목록 이름에서 찾은 게임을 붙임
    if (playlistGameMap.size) {
      videoMap.forEach((v) => {
        const hasGame = (Array.isArray(v.games) && v.games.length > 0) ||
          (Array.isArray(v.parentLog?.games) && v.parentLog.games.length > 0) || Boolean(v.parentLog?.game);
        if (hasGame) return;
        const g = playlistGameMap.get(extractYoutubeId(v.videoUrl) || v.id);
        if (g) { v.games = [{ ...g }]; v.gameFromPlaylist = true; }
      });
    }

    // 방송 기록에 연결되지 않은 채널 영상도 추가 (관리자가 나중에 날짜를 연결하면 그때부터 생방송과 묶임)
    if (channelVideos.length) {
      const known = new Set<string>();
      videoMap.forEach((v) => { const id = extractYoutubeId(v.videoUrl) || v.id; if (id) known.add(id); });
      channelVideos.forEach((c) => {
        if (!c?.videoId || known.has(c.videoId)) return;
        known.add(c.videoId);
        const g = playlistGameMap.get(c.videoId);
        videoMap.set(`yt-${c.videoId}`, {
          id: c.videoId,
          videoTitle: c.title,
          videoUrl: `https://www.youtube.com/watch?v=${c.videoId}`,
          category: '',
          parentLog: null,
          allBroadcastDates: [],
          games: g ? [{ ...g }] : [],
          gameFromPlaylist: Boolean(g),
          isUnlinked: true,
          publishedAt: c.publishedAt,
        });
      });
    }

    return Array.from(videoMap.values());
  }, [data, playlistGameMap, channelVideos]);

  // 태그·썸네일 글자 검색 색인 (한 번 받아 기기에 저장, 없는 영상만 서버가 한 번씩 추출)
  const knownYtIds = useMemo(() => [...new Set(allVideos.map((v: any) => extractYoutubeId(v.videoUrl) || v.id).filter((id: any) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)))] as string[], [allVideos]);
  const knownGameNames = useMemo(() => {
    const set = new Set<string>();
    allVideos.forEach((v: any) => {
      if (v.parentLog?.game) set.add(String(v.parentLog.game).trim());
      [...(v.parentLog?.games || []), ...(v.games || [])].forEach((g: any) => g?.name && set.add(String(g.name).trim()));
    });
    return [...set].filter((n) => n.length > 0 && n.length <= 80);
  }, [allVideos]);
  const searchData = useSearchIndex(knownYtIds, knownGameNames);
  const searchIndex = searchData.entries;
  const gameKeywordMap = searchData.games;

  // ── 구글처럼 너그러운 검색: 오타 보정용 단어 사전 (제목·게임·장르·태그·썸네일 글자·게임 키워드) ──
  const prefs = usePrefs();
  const keyboard = prefs.keyboard;
  const searchVocab = useMemo(() => {
    const texts: string[] = [];
    allVideos.forEach((v: any) => {
      texts.push(v.videoTitle || '', v.category || '', v.parentLog?.game || '', v.parentLog?.category || '');
      [...(v.parentLog?.games || []), ...(v.games || [])].forEach((g: any) => texts.push(g?.name || '', g?.category || ''));
      const e = searchIndex[extractYoutubeId(v.videoUrl) || v.id];
      if (e) texts.push(...String(e.t || '').split('|'), ...(e.k || []), ...(e.g || []));
    });
    Object.entries(gameKeywordMap).forEach(([, kws]) => Array.isArray(kws) && texts.push(...kws));
    return buildVocab(texts);
  }, [allVideos, searchIndex, gameKeywordMap]);
  // 홈에서 검색하면 제목이 맞는 쇼츠를 위쪽 'Shorts' 줄에 따로 (생방송과 연결이 없는 쇼츠도)
  const channelShorts = useChannelShorts();
  const shortsRelatedMap = useShortsRelated();
  const allShortsLite = useMemo(() => {
    const byId = new Map<string, { id?: string; url: string; title: string; caption?: string; liveUrl?: string; editUrl?: string; relatedTitle?: string; interest?: InterestItem }>();
    const logs = Array.isArray(data?.logs) ? data!.logs : Object.values(data?.logs || {});
    (logs as any[]).forEach((log) => (Array.isArray(log?.shorts) ? log.shorts : []).forEach((s: any) => {
      const url = typeof s === 'string' ? s : s?.url;
      const id = extractYoutubeId(url || '');
      if (!id || byId.has(id)) return;
      byId.set(id, { id, interest: { id, kind: 'short', tokens: tokensOf(Array.isArray(log?.games) && log.games.length ? log.games : log?.game ? [{ name: log.game, category: log.category }] : [], [log?.category]) },
        url, title: (typeof s === 'string' ? '' : s?.title) || '', caption: log?.date ? `${log.date} 방송` : undefined,
        liveUrl: (Array.isArray(log?.vods) ? log.vods : []).find((v: any) => v?.url)?.url });
    }));
    channelShorts.forEach((c) => {
      const hit = byId.get(c.videoId);
      if (hit) { if (!hit.title) hit.title = c.title; return; }
      byId.set(c.videoId, { id: c.videoId, url: `https://www.youtube.com/shorts/${c.videoId}`, title: c.title, caption: c.publishedAt ? `${c.publishedAt.slice(0, 10)} 업로드` : undefined });
    });
    // 쇼츠 아래 연결된 본영상 (제목으로도 찾을 수 있게)
    const videoTitleOf = new Map<string, string>();
    const videoById = new Map<string, any>();
    allVideos.forEach((v: any) => { const id = extractYoutubeId(v.videoUrl) || v.id; if (id && v.videoTitle) videoTitleOf.set(id, v.videoTitle); if (id) videoById.set(id, v); });
    byId.forEach((s, id) => {
      const rel = shortsRelatedMap[id];
      if (rel) {
        if (!s.editUrl) s.editUrl = `https://www.youtube.com/watch?v=${rel}`;
        s.relatedTitle = videoTitleOf.get(rel);
      }
      // 맞춤 추천용: 기록에 없는 쇼츠는 연결된 본영상의 게임·장르로
      if (!s.interest || !s.interest.tokens.length) {
        const v = rel ? videoById.get(rel) : null;
        s.interest = { id, kind: 'short', tokens: v ? videoInterestItem(v).tokens : [] };
      }
    });
    return [...byId.values()].filter((s) => s.title).map((s) => ({ ...s, title: cleanShortsTitle(s.title) }));
  }, [data?.logs, channelShorts, shortsRelatedMap, allVideos]);

  // 일반 영상 ID → 그 영상이 걸린 쇼츠들 (쇼츠 아래 '관련 동영상' 기준, 영상 카드에 함께 보여 줌)
  const shortsRelated = shortsRelatedMap;
  const shortsByVideo = useMemo(() => {
    const titleOf = new Map(channelShorts.map((c) => [c.videoId, c.title] as const));
    const m = new Map<string, { url: string; title?: string }[]>();
    Object.entries(shortsRelated).forEach(([sid, vid]) => {
      if (!vid) return;
      const arr = m.get(vid) || [];
      arr.push({ url: `https://www.youtube.com/shorts/${sid}`, title: cleanShortsTitle(titleOf.get(sid)) || undefined });
      m.set(vid, arr);
    });
    return m;
  }, [shortsRelated, channelShorts]);

  // 사용자가 '원래 검색어로' 를 누르면 그 검색어는 고치지 않음
  const [keepOriginalFor, setKeepOriginalFor] = useState<string | null>(null);
  const correction: Correction | null = useMemo(() => {
    const raw = searchTerm.trim();
    if (prefs.searchTypo === false) return null;
    if (!raw || raw.startsWith('#') || raw === keepOriginalFor || isVideoUrl(raw) || extractYoutubeId(raw) || extractChzzkId(raw)) return null;
    // 말하듯 쓴 검색어("겨울 특집 추천해줘")는 고치지 않고 아래에서 해석
    if (prefs.searchNatural !== false && isNaturalQuery(raw)) return null;
    // 줄임말("배그")은 고치지 않음
    if (prefs.searchAlias !== false && GAME_ALIASES[squash(raw)]) return null;
    if (/^\d{1,4}([./-]\d{1,2}){0,2}$/.test(raw) || /\d+\s*월/.test(raw)) return null; // 날짜 검색은 그대로
    return correctQuery(raw, searchVocab, keyboard);
  }, [searchTerm, searchVocab, keyboard, keepOriginalFor, prefs.searchTypo, prefs.searchNatural, prefs.searchAlias]);
  // 확실한 보정(한/영 전환, 아주 가까운 오타)은 바로 그 검색어로 찾고, 애매하면 '혹시 ~?' 로 제안만
  const autoCorrected = correction && (correction.how === 'hanyeong' || correction.cost <= 0.25) ? correction : null;
  const suggestion = correction && !autoCorrected ? correction : null;
  const effectiveSearchTerm = autoCorrected ? autoCorrected.to : searchTerm;

  // ── 검색 도우미: 중요한 단어 우선 · 게임 줄임말 · 말하듯 검색 (설정에서 켜고 끔) ──
  const sOpts = useMemo(() => ({ smart: prefs.searchSmart !== false, alias: prefs.searchAlias !== false, natural: prefs.searchNatural !== false }), [prefs.searchSmart, prefs.searchAlias, prefs.searchNatural]);
  const chos = prefs.searchChosung !== false;
  const useRelated = prefs.searchRelated !== false;
  // 영상마다 검색용으로 한 번만 정리해 둠 (제목·게임·연결된 쇼츠 제목·썸네일 글자·태그·분위기·방송한 달)
  const docOf = useMemo(() => {
    const cache = new WeakMap<object, SearchDoc>();
    return (v: any): SearchDoc => {
      let d = cache.get(v);
      if (d) return d;
      const yid = extractYoutubeId(v.videoUrl) || v.id;
      const e: any = searchIndex[yid];
      const gl = [...(v.parentLog?.games || []), ...(v.games || [])];
      d = makeDoc({
        title: v.videoTitle,
        games: [v.parentLog?.game, v.category, v.parentLog?.category, ...gl.map((g: any) => g?.name)].filter(Boolean),
        extra: (shortsByVideo.get(yid) || []).map((x) => x.title || ''),
        meta: e ? [e.t, ...(e.k || []), ...(e.g || [])].filter(Boolean) : [],
        desc: e?.d,
        moods: e?.m,
        dates: [v.parentLog?.date, ...(Array.isArray(v.allBroadcastDates) ? v.allBroadcastDates : [])].filter(Boolean),
        genres: gl.flatMap((g: any) => String(g?.category || '').split(',')).map((c) => c.trim()).filter(Boolean),
      });
      cache.set(v, d);
      return d;
    };
  }, [searchIndex, shortsByVideo]);
  // 그 말이 제목·게임에 들어간 영상 수 (드물수록 중요한 단어)
  const dfOf = useMemo(() => {
    const docs = allVideos.map(docOf);
    const cache = new Map<string, number>();
    return (t: string) => {
      let n = cache.get(t);
      if (n === undefined) {
        n = 0;
        for (const d of docs) if (hasTerm(d.title, d.titleSq, t) || hasTerm(d.games, d.gamesSq, t)) n++;
        cache.set(t, n);
      }
      return n;
    };
  }, [allVideos, docOf]);
  const aliasDict = useMemo(() => ({ ...autoAliases(knownGameNames), ...GAME_ALIASES }), [knownGameNames]);
  const planBundle = useMemo(() => {
    const t = effectiveSearchTerm.trim();
    if (!t || t.startsWith('#') || isVideoUrl(t) || extractYoutubeId(t) || extractChzzkId(t)) return null;
    if (/^\d{1,4}([./-]\d{1,2}){0,2}$/.test(t) || /^\d+\s*월(\s*\d+\s*일)?$/.test(t)) return null; // 날짜 검색은 예전 방식
    if (!sOpts.smart && !sOpts.alias && !sOpts.natural) return null;
    const plan = planQuery(t, sOpts, dfOf, aliasDict);
    if (!plan.groups.length) return null;
    return { plan, weights: groupWeights(plan, dfOf, Math.max(1, allVideos.length)) };
  }, [effectiveSearchTerm, sOpts, dfOf, aliasDict, allVideos.length]);
  // 예전 방식(제목·초성·날짜 등)으로 찾을 말: 말하듯 썼으면 부탁하는 말을 뺀 것
  const literalTerm = planBundle?.plan.natural ? planBundle.plan.core : effectiveSearchTerm;

  // 최근 검색어 칩 (모든 탭 같은 모양)
  const recentChips = (divider: boolean) => (
          <div className={cn("flex items-center gap-1.5 overflow-x-auto no-scrollbar", divider && "pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60")}>
            <span className="text-[11px] text-zinc-400 shrink-0 font-medium mr-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-400" /> 최근 검색:
            </span>
            {recentSearches.map((s) => (
              <div 
                key={s} 
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 shrink-0 border border-zinc-200/60 dark:border-zinc-700/60 transition-colors"
              >
                <button 
                  type="button" 
                  onClick={() => setSearchTerm(s)} 
                  className="hover:text-purple-600 dark:hover:text-purple-400 font-medium cursor-pointer"
                >
                  {s}
                </button>
                <button 
                  type="button" 
                  onClick={() => removeRecentSearch(s)} 
                  className="text-zinc-400 hover:text-red-500 ml-0.5 cursor-pointer"
                  title="검색어 삭제"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button 
              type="button" 
              onClick={() => { if (window.confirm('최근 검색어를 모두 지울까요?')) clearAllRecentSearches(); }} 
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ml-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200/70 dark:border-red-900/50 cursor-pointer"
            >
              모두 지우기
            </button>
          </div>
  );

  const matchingShorts = useMemo(() => {
    const raw = effectiveSearchTerm.trim().replace(/^#+/, '');
    if (subTab !== 'home' || raw.length < 2) return [];
    // 링크로 찾기: 쇼츠 자신의 링크, 또는 쇼츠가 연결된 본영상·생방송 링크
    const linkId = extractYoutubeId(raw);
    if (linkId || isVideoUrl(raw)) {
      return allShortsLite.filter((s) => (linkId && (extractYoutubeId(s.url) === linkId || extractYoutubeId(s.editUrl || '') === linkId || extractYoutubeId(s.liveUrl || '') === linkId))
        || matchMediaUrl(s.liveUrl, raw)).slice(0, 20);
    }
    // 제목, 또는 쇼츠가 연결된 본영상 제목으로 (검색 도우미: 중요한 단어·줄임말·말하듯 검색)
    const lit = literalTerm.trim().replace(/^#+/, '');
    const pb = planBundle;
    const scoreOf = (s: { title: string; relatedTitle?: string }) => (pb ? scoreDoc(pb.plan, pb.weights, makeDoc({ title: s.title, extra: s.relatedTitle ? [s.relatedTitle] : [] })) : null);
    return allShortsLite
      .map((s) => ({ s, sc: scoreOf(s) }))
      .filter(({ s, sc }) => (lit.length >= 2 && (titleMatches(lit, s.title) || (s.relatedTitle && titleMatches(lit, s.relatedTitle)))) || (sc && pb && isHit(pb.plan, sc)))
      .sort((a, b) => (pb ? Number(b.sc?.phrase) - Number(a.sc?.phrase) || (b.sc?.rel || 0) - (a.sc?.rel || 0) : 0))
      .map(({ s }) => s)
      .slice(0, 20);
  }, [effectiveSearchTerm, literalTerm, planBundle, allShortsLite, subTab]);

  // 카테고리 사전: 게임 장르(games[].category)를 기준으로 만들고, 게임명이 섞여 들어간 값은 제외
  const categoryIndex = useMemo(() => {
    const normKey = (c: string) => c.replace(/\s+/g, '').toLowerCase();
    const recognized = new Set([
      '종합', '액션', '어드벤처', '인디', '캐주얼', '시뮬레이션', '전략', '웹', '플래시', '스포츠',
      '앞서해보기', '노가리', '공포', '퀴즈', '레이싱', 'rpg', '로그라이크', '퍼즐', '8번출구류',
      '미연시', '연애시뮬레이션', '시뮬레이터', '팬게임', '시참', '교육', '스토리', '아포칼립스', '온라인',
      '대규모멀티플레이어', '병맛', '모바일', '도서', '그래픽및디자인', '이상형월드컵', 'mbti',
      '단어', '가족', 'moba', '생존', 'fps', '슈팅', '롤플레잉', '배틀로얄', 'ai', '마추기아이오'
    ]);
    const aliases: Record<string, string[]> = {
      '수박게임': ['캐주얼', '퍼즐'],
      '오버워치': ['FPS', '액션'],
      '발로란트': ['FPS', '액션'],
    };

    const gameKeys = new Set<string>();
    const owners = new Map<string, Set<string>>(); // 카테고리 → 이 카테고리를 쓰는 게임들
    const display = new Map<string, string>();
    const collectGame = (g: any) => {
      if (!g?.name) return;
      const gk = normKey(String(g.name));
      gameKeys.add(gk);
      String(g.category || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => {
        const k = normKey(c);
        if (!owners.has(k)) owners.set(k, new Set());
        owners.get(k)!.add(gk);
        if (!display.has(k)) display.set(k, c);
      });
    };
    allVideos.forEach((v) => {
      if (v.parentLog?.game) gameKeys.add(normKey(String(v.parentLog.game)));
      v.parentLog?.games?.forEach(collectGame);
      v.games?.forEach(collectGame);
    });

    const resolve = (raw: string): string[] => {
      const c = raw.trim();
      if (!c) return [];
      const k = normKey(c);
      if (aliases[c]) return aliases[c];
      if (k.length < 2 || /^[\d.]+$/.test(k)) return [];
      if (recognized.has(k)) return [display.get(k) || c];
      if (gameKeys.has(k)) return [];
      for (const gk of gameKeys) {
        if (k.length >= 4 && (gk.includes(k) || k.includes(gk))) return [];
      }
      // 여러 게임에서 장르로 쓰인 값만 카테고리로 인정 (한 게임 전용 값은 게임명일 가능성이 큼)
      const o = owners.get(k);
      if (o && o.size >= 2) return [display.get(k) || c];
      return [];
    };
    const tokensOf = (catStr?: string) =>
      catStr ? catStr.split(',').flatMap((c) => resolve(c)) : [];
    const videoTokens = (v: any): string[] => {
      const out = new Set<string>();
      tokensOf(v.category).forEach((t) => out.add(t));
      tokensOf(v.parentLog?.category).forEach((t) => out.add(t));
      v.parentLog?.games?.forEach((g: any) => tokensOf(g?.category).forEach((t) => out.add(t)));
      v.games?.forEach((g: any) => tokensOf(g?.category).forEach((t) => out.add(t)));
      return Array.from(out);
    };
    return { videoTokens };
  }, [allVideos]);

  const [shortsCount, setShortsCount] = useState(0);
  const genresOfLog = React.useCallback((log: any) => (log ? categoryIndex.videoTokens({ parentLog: log }) : []), [categoryIndex]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    allVideos.forEach((v) => {
      categoryIndex.videoTokens(v).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    const otherCats = Array.from(counts.keys())
      .filter((c) => c !== '몰아보기' && c !== '전체')
      .sort((a, b) => a.localeCompare(b, 'ko'));
    return ['전체', '몰아보기', ...otherCats];
  }, [allVideos, categoryIndex]);

  // 휴대폰: 화면을 옆으로 밀어 하위 탭 이동 (가로 스크롤 영역·입력칸·영상 위에서는 동작 안 함)
  const swipeRef = useRef<{ x: number; y: number; t: number; ok: boolean } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const target = e.target as HTMLElement;
    const blocked = window.innerWidth >= 640 || e.touches.length > 1 ||
      Boolean(target.closest('.overflow-x-auto, .no-scrollbar, input, textarea, select, iframe, .recharts-wrapper, [data-no-swipe], [role="dialog"]'));
    swipeRef.current = t ? { x: t.clientX, y: t.clientY, t: Date.now(), ok: !blocked } : null;
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s0 = swipeRef.current;
    swipeRef.current = null;
    const t = e.changedTouches[0];
    if (!s0?.ok || !t) return;
    const dx = t.clientX - s0.x;
    const dy = t.clientY - s0.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - s0.t > 700) return;
    const idx = RECOMMEND_SUB_TABS.findIndex((x) => x.id === subTab);
    const next = RECOMMEND_SUB_TABS[idx + (dx < 0 ? 1 : -1)];
    if (next) changeSubTab(next.id);
  };

  // 추천 탭은 항상 추천순 (검색 중에는 정확도순 유지)
  const effectiveSortOrder = subTab === 'recommend' && sortOrder !== 'accuracy' ? 'recommend' : sortOrder;

  // 라이브 탭: 방송 기록의 생방송 다시보기 (유튜브 링크가 있는 것, 영상 길이·편집본·쇼츠까지 다른 카드와 같은 모양)
  const liveVideos = useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    // 방송일 → 그 방송의 편집본 (여러 방송에 걸친 편집본은 걸친 날마다)
    const editsByDate = new Map<string, { url: string; title?: string; id: string }[]>();
    Object.values(data?.logs || {}).forEach((log: any) => (Array.isArray(log?.edited) ? log.edited : []).forEach((e: any) => {
      if (!e?.url || e.isCompilation || e.compilationId) return;
      const eid = extractYoutubeId(e.url) || e.url;
      const dates: string[] = Array.isArray(e.allBroadcastDates) && e.allBroadcastDates.length ? e.allBroadcastDates : [log.date];
      dates.forEach((d) => {
        const arr = editsByDate.get(d) || [];
        if (!arr.some((x) => x.id === eid)) arr.push({ id: eid, url: e.url, title: e.title });
        editsByDate.set(d, arr);
      });
    }));
    Object.values(data?.logs || {}).forEach((log: any) => {
      if (!log || log.isAbsence || !log.date) return;
      (Array.isArray(log.vods) ? log.vods : []).forEach((v: any) => {
        const url = typeof v === 'string' ? v : v?.url;
        const id = extractYoutubeId(url || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        const t = String((typeof v === 'string' ? '' : v?.title) || '').trim();
        const generic = !t || /^우주하마\s*생방송!?$/.test(t) || t === '생방송';
        out.push({
          id, videoUrl: url, isLive: true, parentLog: log, allBroadcastDates: [log.date],
          liveEdits: (editsByDate.get(log.date) || []).map(({ url: u, title }) => ({ url: u, title })),
          videoTitle: generic ? `${log.date.replace(/-/g, '.')} 생방송` : t,
          games: Array.isArray(log.games) ? log.games : [], category: log.category, createdAt: log.date,
        });
      });
    });
    return out.sort((a, b) => b.parentLog.date.localeCompare(a.parentLog.date));
  }, [data?.logs]);

  const recommendedBase = useMemo(() => {
    const pool = subTab === 'live' ? liveVideos : allVideos;
    if (pool.length === 0) return [];
    // 오타를 자동으로 고친 경우 고친 검색어로 찾음 (추천 탭은 검색과 상관없이 추천만)
    const searchTerm = subTab === 'recommend' ? '' : literalTerm;
    const fkm = (q: string, t: string) => fuzzyKoreanMatch(q, t, chos);
    const plan = subTab === 'recommend' ? null : planBundle;
    const planScore = (v: any) => (plan ? scoreDoc(plan.plan, plan.weights, docOf(v)) : null);

    // 동영상 탭: 몰아보기를 뺀 편집본만
    let vids = subTab === 'videos' ? allVideos.filter((v) => !v.isCompilation) : pool;

    if (!selectedCategories.includes('전체')) {
      vids = vids.filter(v => {
        // 몰아보기 영상은 '몰아보기' 카테고리에서만 보임 (게임 카테고리 검색에는 섞지 않음)
        if (v.isCompilation) return selectedCategories.includes('몰아보기');
        const tokens = categoryIndex.videoTokens(v);
        if (tokens.some((t) => selectedCategories.includes(t))) return true;
        return false;
      });
    }

    const rawSearch = searchTerm.trim();
    const isTagMode = rawSearch.startsWith('#') && rawSearch.replace(/^#+/, '').trim().length > 0;
    const tagQuery = isTagMode ? rawSearch.replace(/^#+/, '').trim() : '';
    const tagMatches = new Map<string, 'exact' | 'partial'>();
    const relatedVia = new Map<string, string>();
    // 검색어가 장르(카테고리) 이름과 같은지
    const genreKey = !isTagMode && rawSearch ? (categories.some((c) => c !== '전체' && normSearch(c) === normSearch(rawSearch)) ? normSearch(rawSearch) : '') : '';

    if (searchTerm && searchTerm.trim() !== '') {
      // '#태그' 검색은 태그로 찾은 영상을 맨 위에, '#' 없이 같은 말로 찾은 영상은 '유사 검색'으로 아래에
      const term = isTagMode ? tagQuery : searchTerm.trim();
      const ytId = extractYoutubeId(term);
      const chzzkId = extractChzzkId(term);
      const isUrl = isVideoUrl(term) || !!ytId || !!chzzkId;

      // 1. 영상, 쇼츠, 생방 링크 대조 함수
      // Firestore나 JSON을 새로 호출하지 않고, 기존에 로드된 data.logs와 allVideos 메모리 데이터와만 대조합니다.
      const checkLogMedia = (log: any): boolean => {
        return matchLogMedia(log, term);
      };

      // 만약 term이 미디어 링크라면, 전체 logs 중 매칭되는 방송일 집합을 미리 구해둡니다.
      const matchingDatesFromLogs = new Set<string>();
      if (isUrl && data?.logs) {
        const logEntries = Array.isArray(data.logs) 
          ? data.logs 
          : Object.entries(data.logs).map(([date, val]) => ({ ...(val as any), date }));
        for (const log of logEntries) {
          if (matchLogMedia(log, term) && log.date) {
            matchingDatesFromLogs.add(log.date);
          }
        }
      }

      // 영상 URL 또는 ID 검색 시에는 카테고리 필터와 무관하게 전체 영상 풀에서 대조
      const searchTarget = isUrl ? pool : vids;
      const entryOf = (v: any) => searchIndex[extractYoutubeId(v.videoUrl) || v.id];
      const sqTerm = squash(term);
      const termWords = term.split(/\s+/).map(squash).filter(Boolean);
      // 제목·게임·장르를 붙인 비교용 글 (영상마다 한 번만 만들어 둔 것)
      const videoText = (v: any) => { const d = docOf(v); return d.titleSq + '|' + d.gamesSq + '|' + d.genres.join('|'); };

      // '#태그': 유튜브 태그·설명의 #해시태그·제목의 #단어
      const tagHits = isTagMode ? searchTarget.filter((v) => {
        const titleTag = titleHasHashtag(v.videoTitle, tagQuery);
        const m = matchTag(entryOf(v), tagQuery) || (titleTag ? 'exact' : null);
        if (m) tagMatches.set(v.id, m);
        return Boolean(m);
      }) : [];
      {
      vids = searchTarget.filter(v => {
        // 1. 영상, 쇼츠, 생방 링크 대조 (11자리 Video ID 고유 식별자 파싱 및 LIKE 대조)
        if (isUrl) {
          // (1-1) 영상 자체 ID 및 URL 대조 (풀링크/단축/라이브/쇼츠/임베드 무관 100% 식별)
          if (ytId && (v.id === ytId || extractYoutubeId(v.videoUrl) === ytId || v.videoUrl?.includes(ytId))) return true;
          if (matchMediaUrl(v.videoUrl, term)) return true;
          // (1-1b) 이 영상에 연결된 쇼츠의 링크로 검색해도
          if (ytId && (shortsByVideo.get(extractYoutubeId(v.videoUrl) || v.id) || []).some((s) => extractYoutubeId(s.url) === ytId)) return true;

          // (1-2) 영상 내 games의 link / vodUrl 대조
          if (v.games?.some((g: any) => matchMediaUrl(g?.link, term) || matchMediaUrl(g?.vodUrl, term))) return true;

          // (1-3) 상위 생방 로그 대조
          if (checkLogMedia(v.parentLog)) return true;

          // (1-4) 다중 생방 및 몰아보기 연동 날짜 전체 대조
          if (Array.isArray(v.allBroadcastDates) && data?.logs) {
            for (const dateStr of v.allBroadcastDates) {
              const matchedLog = (data.logs as any)[dateStr];
              if (matchedLog && checkLogMedia(matchedLog)) {
                return true;
              }
              if (matchingDatesFromLogs.has(dateStr)) {
                return true;
              }
            }
          }

          // (1-5) 상위 방송일이 matchingDatesFromLogs에 포함된 경우
          if (v.parentLog?.date && matchingDatesFromLogs.has(v.parentLog.date)) {
            return true;
          }

          return false;
        }

        // 2. 생방일(YYYY-MM-DD) 기준 월/일 조회 (0/00, 0월 0일, 0월 등)
        if (v.parentLog?.date && fuzzyDateMatch(term, v.parentLog.date)) return true;
        if (Array.isArray(v.allBroadcastDates) && v.allBroadcastDates.some((d: string) => fuzzyDateMatch(term, d))) return true;

        // 3. 제목 및 초성 검색 (띄어쓰기·기호 무시: "3.0.만.원" == "30만원")
        if (fkm(term, v.videoTitle)) return true;
        if (sqTerm.length >= 2 && squash(v.videoTitle).includes(sqTerm)) return true;
        // 여러 단어: 단어마다 제목·게임·장르 어디든 있으면
        if (termWords.length > 1 && termWords.every((w) => videoText(v).includes(w))) return true;
        
        // 3-1. 이 영상에 연결된 쇼츠 제목으로도
        const linked = shortsByVideo.get(extractYoutubeId(v.videoUrl) || v.id);
        if (linked?.some((s) => s.title && (fkm(term, s.title) || (sqTerm.length >= 2 && squash(s.title).includes(sqTerm))))) return true;

        // 4. 카테고리 및 게임명 검색
        const qLower = term.toLowerCase();
        if (v.category && (fkm(term, v.category) || v.category.toLowerCase().includes(qLower))) return true;
        if (v.games?.some((g: any) => fkm(term, g.name) || (g.category && (fkm(term, g.category) || g.category.toLowerCase().includes(qLower))))) return true;
        if (v.parentLog?.games?.some((g: any) => fkm(term, g.name) || (g.category && (fkm(term, g.category) || g.category.toLowerCase().includes(qLower))))) return true;
        if (v.parentLog?.game && fkm(term, v.parentLog.game)) return true;
        if (v.parentLog?.category && (fkm(term, v.parentLog.category) || v.parentLog.category.toLowerCase().includes(qLower))) return true;
        // 5. 검색 도우미: 중요한 단어가 맞거나, 줄임말·비슷한 말(겨울 → 눈사람·크리스마스)·썸네일 분위기로 맞으면
        const ps = planScore(v);
        if (ps && plan && isHit(plan.plan, ps)) return true;
        return false;
      });

      // 장르 검색: 검색어가 장르 이름과 같으면 옆 카테고리 필터와 똑같은 영상을 모두 포함
      if (genreKey) {
        const found = new Set(vids.map((v) => v.id));
        const extra = searchTarget.filter((v) => !found.has(v.id) && categoryIndex.videoTokens(v).some((t) => normSearch(t) === genreKey));
        vids = [...vids, ...extra];
      }

      // 연관 검색: 제목 등에는 없지만 썸네일 글자·키워드·태그·설명, 또는 게임의 한국어 키워드(예: 도서관 → Librarian)에 검색어가 있는 영상 (맨 아래)
      if (!isUrl && useRelated) {
        const found = new Set(vids.map((v) => v.id));
        const kwGames = gamesMatchingKeyword(gameKeywordMap, term);
        const gameNamesOf = (v: any) => [v.parentLog?.game, ...(v.parentLog?.games || []).map((g: any) => g?.name), ...(v.games || []).map((g: any) => g?.name)]
          .filter(Boolean).map((n: string) => normSearch(n));
        // 아무렇게나 친 글자로 검색하면, 제목에 막 친 글자가 들어간 영상을 연관으로
        const smash = isKeysmash(term);
        const extra = searchTarget.filter((v) => {
          if (found.has(v.id)) return false;
          const via = matchRelated(entryOf(v), term) || (kwGames.size && gameNamesOf(v).some((n) => kwGames.has(n)) ? '게임' : null)
            || (smash && String(v.videoTitle || '').split(/\s+/).some((w: string) => isKeysmash(w)) ? '막 친 글자' : null);
          if (via) relatedVia.set(v.id, via);
          return Boolean(via);
        });
        vids = [...vids, ...extra];
      }
      }
      if (isTagMode) {
        const seen = new Set(tagHits.map((v) => v.id));
        vids = [...tagHits, ...vids.filter((v) => !seen.has(v.id))];
      }
    }

    const now = Date.now();
    const scoredVids = vids.map(v => {
       const charCode = v.id.length > 0 ? v.id.charCodeAt(0) : 0;
       const rType = (charCode % 2 === 0) ? 'thumbs' : 'stars';
       
       let weight = baseWeights.current[v.id] || 0; 
       
       const rating = ratings[v.id];
       if (rating !== undefined) {
          if (rating >= 4) weight += 2.0;
          else if (rating <= 2) weight -= 2.0;
       }

       // Add global community score to weight
       if (data?.videoStats?.[v.id]) {
         const vStats = data.videoStats[v.id];
         if (vStats.count > 0) {
           weight += (vStats.score / vStats.count) * 1.5;
         }
       }

       const watchedAt = history[v.id];
       if (watchedAt) {
          const hoursSinceWatch = (now - watchedAt) / (1000 * 60 * 60);
          if (hoursSinceWatch < 24) {
             weight -= 10.0;
          } else if (hoursSinceWatch < 72) {
             weight -= 5.0;
          } else {
             weight -= 2.0;
          }
       }

       // 검색 일치 정확도 및 유력 여부 판별
       let matchScore = 0;
       let isHighConfidence = true;

       const isRelated = relatedVia.has(v.id);
       if (isTagMode && tagMatches.has(v.id)) {
         // 태그로 찾은 영상이 우선 (같은 태그 → 비슷한 태그)
         matchScore = tagMatches.get(v.id) === 'exact' ? 95 : 85;
         isHighConfidence = true;
       } else if (isTagMode && !isRelated) {
         // '#' 없이 같은 말로 찾은 영상 → 유사 검색
         matchScore = 30;
         isHighConfidence = false;
       } else if (isRelated) {
         matchScore = 0;
         isHighConfidence = false;
       } else if (genreKey && categoryIndex.videoTokens(v).some((t) => normSearch(t) === genreKey) && !(v.videoTitle || '').toLowerCase().includes(searchTerm.trim().toLowerCase())) {
         matchScore = 72;
         isHighConfidence = true;
       } else if (searchTerm.trim()) {
         const q = searchTerm.trim().toLowerCase();
         const rawTerm = searchTerm.trim();
         const ytId = extractYoutubeId(rawTerm);
         const chzzkId = extractChzzkId(rawTerm);
         const isUrl = isVideoUrl(rawTerm) || !!ytId || !!chzzkId;
         const aTitle = (v.videoTitle || '').toLowerCase();
         const primaryGame = (v.parentLog?.game || '').toLowerCase();
         const category = (v.category || v.parentLog?.category || '').toLowerCase();

         // 1. URL / Video ID 일치 (최고 우선순위: 검색한 바로 그 유튜브 영상 1위)
         if (isUrl) {
           if (ytId && (v.id === ytId || extractYoutubeId(v.videoUrl) === ytId)) {
             matchScore = 150;
             isHighConfidence = true;
           } else if (matchMediaUrl(v.videoUrl, rawTerm)) {
             matchScore = 130;
             isHighConfidence = true;
           } else {
             matchScore = 100;
             isHighConfidence = true;
           }
         }
         // 2. 제목 완전 일치 또는 직접 포함
         else if (aTitle === q) {
           matchScore = 90;
           isHighConfidence = true;
         } else if (aTitle.includes(q)) {
           matchScore = 80;
           isHighConfidence = true;
         } else if (squash(q).length >= 2 && squash(aTitle).includes(squash(q))) {
           // 띄어쓰기·기호만 다른 제목
           matchScore = 78;
           isHighConfidence = true;
         } else if (q.split(/\s+/).filter(Boolean).length > 1 && q.split(/\s+/).map(squash).filter(Boolean).every((w) => squash(aTitle).includes(w))) {
           // 여러 단어가 모두 제목에 (순서 무관)
           matchScore = 76;
           isHighConfidence = true;
         }
         // 3. 게임 이름에 그대로 들어 있으면 날짜보다 먼저 (예: "2077" → 사이버펑크 2077 이 2077년 날짜 결과보다 위)
         else if (primaryGame.includes(q) || [...(v.parentLog?.games || []), ...(v.games || [])].some((g: any) => (g?.name || '').toLowerCase().includes(q))) {
           matchScore = 76;
           isHighConfidence = true;
         }
         // 4. 방송 날짜 일치 (날짜끼리는 아래 정렬에서 최신 날짜부터)
         else if ((v.parentLog?.date && fuzzyDateMatch(q, v.parentLog.date)) || (Array.isArray(v.allBroadcastDates) && v.allBroadcastDates.some((d: string) => fuzzyDateMatch(q, d)))) {
           matchScore = 60;
           isHighConfidence = true;
         }
         // 4. 메인 게임명/카테고리 직접 포함
         else if (primaryGame.includes(q) || category.includes(q) || (v.category && v.category.toLowerCase().includes(q))) {
           matchScore = 75;
           isHighConfidence = true;
         }
         // 5. 연관 서브 게임 목록에 직접 포함
         else if (
           v.parentLog?.games?.some((g: any) => (g.name || '').toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q)) ||
           v.games?.some((g: any) => (g.name || '').toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q))
         ) {
           matchScore = 70;
           isHighConfidence = true;
         }
         // 6. 초성 검색, 오타 교정, 간접 fuzzy 매칭 (일치 확률이 비교적 낮은 검색 결과)
         else {
           let fuzzyScore = 20;
           // 초성 검색: 초성이 이어서 맞으면(ㅂㅌㄱㄹㅇㄷ → 배틀그라운드) 띄엄띄엄 맞는 것보다 위, 게임 이름이 맞으면 더 위
           const qc = /[ㄱ-ㅎ]/.test(q) ? q.replace(/\s+/g, '') : '';
           const chosungOf = (t: string) => getChosung(String(t || '').toLowerCase().replace(/\s+/g, ''));
           const gameNames = [primaryGame, ...[...(v.parentLog?.games || []), ...(v.games || [])].map((g: any) => g?.name || '')];
           if (qc && gameNames.some((n) => n && chosungOf(n).includes(qc))) {
             fuzzyScore = 46;
           } else if (qc && chosungOf(v.videoTitle).includes(qc)) {
             fuzzyScore = 42;
           } else if (fkm(q, v.videoTitle)) {
             fuzzyScore = qc ? 25 : 35;
           } else if (fkm(q, category) || fkm(q, primaryGame)) {
             fuzzyScore = 30;
           }
           matchScore = fuzzyScore;
           // 초성이 이어서 맞은 건 확실한 결과로
           isHighConfidence = fuzzyScore >= 42;
         }
       }

       // 검색 도우미 점수: 붙여 쓴 그대로 제목에 있으면 맨 위, 중요한 단어가 많이 맞을수록 위, 흔한 단어만 맞으면 아래
       let isRel = isRelated;
       if (plan && sOpts.smart && !isTagMode && searchTerm.trim()) {
         const ps = planScore(v)!;
         const hit = isHit(plan.plan, ps);
         if (ps.phrase) { matchScore = Math.max(matchScore, 98); isHighConfidence = true; isRel = false; }
         else if (hit) {
           matchScore = Math.max(matchScore, Math.round(45 + 45 * Math.min(1, ps.rel)));
           if (ps.rel >= 0.45) { isHighConfidence = true; isRel = false; }
         } else if (plan.plan.groups.length > 1 && matchScore < 80 && matchScore !== 60) {
           isHighConfidence = false;
         }
       } else if (plan && !isTagMode && searchTerm.trim() && !matchScore) {
         // 줄임말·말하듯 검색만 켠 경우
         const ps = planScore(v)!;
         if (isHit(plan.plan, ps)) { matchScore = Math.round(45 + 40 * Math.min(1, ps.rel)); isHighConfidence = true; }
       }

       return { ...v, rType, weight, matchScore, isHighConfidence, isRelated: isRel, relatedVia: isRel ? relatedVia.get(v.id) : undefined };
    });
    
    const getVideoSortTime = (v: any): number => {
      if (v.isCompilation) {
        if (v.createdAt) {
          const t = new Date(v.createdAt).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        if (v.compilationId && typeof v.compilationId === 'string' && v.compilationId.startsWith('compilation_')) {
          const ts = parseInt(v.compilationId.replace('compilation_', ''), 10);
          if (!isNaN(ts) && ts > 1000000000000) return ts;
        }
      }
      if (v.parentLog?.date) {
        const t = new Date(v.parentLog.date).getTime();
        if (!isNaN(t)) return t;
      }
      // 기록에 연결 안 된 영상은 유튜브 업로드일로
      if (v.publishedAt) {
        const t = Date.parse(v.publishedAt);
        if (!isNaN(t)) return t;
      }
      return 0;
    };

    if (effectiveSortOrder === 'accuracy') {
      scoredVids.sort((a, b) => {
        if (searchTerm.trim()) {
          // 유력한 검색 결과(isHighConfidence)를 항상 우선 배치
          if (a.isHighConfidence !== b.isHighConfidence) {
            return a.isHighConfidence ? -1 : 1;
          }
          // 동일 그룹 내에서는 세부 일치 점수(matchScore) 내림차순
          if ((b.matchScore || 0) !== (a.matchScore || 0)) {
            return (b.matchScore || 0) - (a.matchScore || 0);
          }
          // 날짜로 찾은 영상끼리는 최신 방송부터
          if (a.matchScore === 60 && b.matchScore === 60) return getVideoSortTime(b) - getVideoSortTime(a);
        }
        return (b.weight || 0) - (a.weight || 0);
      });
    } else if (effectiveSortOrder === 'desc') {
      scoredVids.sort((a, b) => {
        const timeA = getVideoSortTime(a);
        const timeB = getVideoSortTime(b);
        if (timeA !== timeB) return timeB - timeA;
        return (b.parentLog?.date || '').localeCompare(a.parentLog?.date || '');
      });
    } else if (effectiveSortOrder === 'asc') {
      scoredVids.sort((a, b) => {
        const timeA = getVideoSortTime(a);
        const timeB = getVideoSortTime(b);
        if (timeA !== timeB) return timeA - timeB;
        return (a.parentLog?.date || '').localeCompare(b.parentLog?.date || '');
      });
    } else {
      const seedrandom = (s: number) => {
        let t = s += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      scoredVids.sort((a, b) => {
        const idA = String(a.id || a.videoUrl || '');
        const idB = String(b.id || b.videoUrl || '');
        const hA = idA.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hB = idB.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return seedrandom(shuffleSeed + hA) - seedrandom(shuffleSeed + hB);
      });
    }

    // 순서: 직접 일치 → 연관 검색(썸네일·태그·게임 키워드) → 일치 확률이 낮은 결과(초성·오타 등)
    if (relatedVia.size) {
      const main = scoredVids.filter((v) => !v.isRelated && (v.isHighConfidence || effectiveSortOrder !== 'accuracy'));
      const rel = scoredVids.filter((v) => v.isRelated);
      const low = scoredVids.filter((v) => !v.isRelated && !v.isHighConfidence && effectiveSortOrder === 'accuracy');
      scoredVids.length = 0;
      scoredVids.push(...main, ...rel, ...low);
    }

    if (pinnedVideoId && (effectiveSortOrder === 'recommend' || !searchTerm.trim())) {
      const pinIndex = scoredVids.findIndex(v => 
        v.id === pinnedVideoId || 
        v.videoUrl === pinnedVideoId ||
        (extractYoutubeId(v.videoUrl) && extractYoutubeId(v.videoUrl) === extractYoutubeId(pinnedVideoId))
      );
      if (pinIndex > 0) {
        const [pinnedItem] = scoredVids.splice(pinIndex, 1);
        scoredVids.unshift(pinnedItem);
      }
    }

    return scoredVids;
  }, [allVideos, categoryIndex, categories, selectedCategories, literalTerm, shuffleSeed, effectiveSortOrder, pinnedVideoId, subTab, searchIndex, gameKeywordMap, shortsByVideo, liveVideos, planBundle, docOf, chos, useRelated, sOpts]); // Removed ratings and history to prevent jumping on watch

  // 추천 탭 위쪽: 추천 쇼츠·추천 라이브 (관심 기록이 없으면 최근 것부터)
  // 탭에 들어올 때 한 번만 계산 (보는 중에 순서가 바뀌지 않게)
  const interestEpoch = useMemo(() => Date.now(), [subTab, shuffleSeed]); // eslint-disable-line react-hooks/exhaustive-deps
  // 위쪽 카테고리 선택·새로고침도 그대로 따름: 고른 카테고리만, 새로고침하면 관심 상위 후보 안에서 다른 조합으로
  const catFilterActive = !selectedCategories.includes('전체');
  const pickWithSeed = <T,>(list: T[], keyOf: (x: T) => string, n: number, poolSize: number) => {
    const rnd = (k: string) => { let t = (shuffleSeed + k.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 0)) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return list.slice(0, poolSize).map((x) => ({ x, r: rnd(keyOf(x)) })).sort((a, b) => a.r - b.r).slice(0, n).map((o) => o.x);
  };
  const recShorts = useMemo(() => {
    if (subTab !== 'recommend') return [];
    const pool = catFilterActive
      ? allShortsLite.filter((x) => (x.interest?.tokens || []).some((t) => selectedCategories.includes(t.slice(2)) || selectedCategories.some((c) => c.toLowerCase() === t.slice(2))))
      : allShortsLite;
    const ordered = personalize(pool, (x) => x.interest || { id: x.id || x.url, kind: 'short', tokens: [] });
    return pickWithSeed(ordered, (x) => x.id || x.url, 12, hasInterestProfile(loadInterest()) ? 30 : ordered.length);
  }, [subTab, allShortsLite, interestEpoch, shuffleSeed, selectedCategories]); // eslint-disable-line react-hooks/exhaustive-deps
  const recLives = useMemo(() => {
    if (subTab !== 'recommend') return [];
    const pool = catFilterActive
      ? liveVideos.filter((v) => categoryIndex.videoTokens(v).some((t) => selectedCategories.includes(t)))
      : liveVideos;
    const ordered = personalize(pool, videoInterestItem);
    return pickWithSeed(ordered, (v) => v.id, 4, hasInterestProfile(loadInterest()) ? 12 : ordered.length);
  }, [subTab, liveVideos, interestEpoch, shuffleSeed, selectedCategories, categoryIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const personalized = useMemo(() => hasInterestProfile(loadInterest()), [interestEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // 추천 탭: 이 기기에서 관심 보인 게임·장르 순으로 (이미 본 건 뒤로, 4개마다 새로운 쪽 하나)
  // 탭에 들어올 때 한 번만 계산 (보는 중에 순서가 바뀌지 않게)
  const recommended = useMemo(() => {
    if (subTab !== 'recommend') return recommendedBase;
    const pinned = pinnedVideoId ? recommendedBase.filter((v) => v.id === pinnedVideoId) : [];
    const rest = recommendedBase.filter((v) => v.id !== pinnedVideoId);
    const ordered = personalize(rest, videoInterestItem);
    // 새로고침: 관심 순서는 유지하되 8개씩 묶음 안에서 섞어 매번 조금 다르게
    if (!hasInterestProfile(loadInterest())) return [...pinned, ...ordered];
    const rnd = (k: string) => { let t = (shuffleSeed + k.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 0)) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const mixed: any[] = [];
    for (let i = 0; i < ordered.length; i += 8) mixed.push(...ordered.slice(i, i + 8).map((v) => ({ v, r: rnd(String(v.id)) })).sort((x, y) => x.r - y.r).map((o) => o.v));
    return [...pinned, ...mixed];
  }, [recommendedBase, subTab, pinnedVideoId, interestEpoch, shuffleSeed]);

  const handleRefresh = () => {
    Object.keys(baseWeights.current).forEach(id => {
       baseWeights.current[id] = Math.random();
    });
    setShuffleSeed(Date.now());
    setCurrentPage(1);
  };

  // 선택된 다중 생방/몰아보기 상세 모달
  const [selectedBroadcastModalVideo, setSelectedBroadcastModalVideo] = useState<any | null>(null);

  // 검색 탭을 벗어났다 들어오면 몰아보기 연동 생방 펼치기 상태를 초기화하여 원래 추천 목록으로 복귀
  useEffect(() => {
    if (!isActive) {
      setSelectedBroadcastModalVideo(null);
    }
  }, [isActive]);

  // 화면 크기 및 그리드 열에 맞춰 한 페이지당 8개~9개 유동적 조정
  // 2열 그리드(768px~1023px 태블릿/창분할)에서는 2x4 = 8개가 자연스럽고, 3열 데스크탑(>= 1024px)에서는 3x3 = 9개
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width >= 768 && width < 1024) return 8;
    }
    return 9;
  });

  useEffect(() => {
    const handleItemsResize = () => {
      const width = window.innerWidth;
      const count = (width >= 768 && width < 1024) ? 8 : 9;
      setItemsPerPage(count);
    };
    handleItemsResize();
    window.addEventListener('resize', handleItemsResize);
    return () => window.removeEventListener('resize', handleItemsResize);
  }, []);

  // 목록 보기는 한 줄이 작아서 카드의 2배를 한 페이지에
  const perPage = viewStyle === 'list' ? itemsPerPage * 2 : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(recommended.length / perPage));
  const paginatedVids = recommended.slice((currentPage - 1) * perPage, currentPage * perPage);

  // 페이지 바운드 보호
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const isAccuracySort = effectiveSortOrder === 'accuracy' && Boolean(searchTerm.trim());
  const hasAnyHighConfidence = useMemo(() => {
    return isAccuracySort && recommended.some(v => v.isHighConfidence);
  }, [isAccuracySort, recommended]);
  const hasMainResults = useMemo(() => recommended.some((v) => !v.isRelated), [recommended]);
  const isTagSearch = searchTerm.trim().startsWith('#');
  // 날짜처럼 생긴 검색어 (2024, 5월, 5/12, 24년 5월, 2024.05.12 …) → 정렬 이름을 '날짜 최신순/과거순'으로
  const isDateQuery = isDateQueryFn(searchTerm);

  // 검색 결과 구분선: ① 일치 확률이 낮은 결과 ② 썸네일·태그 등에서 찾은 연관 검색 결과 (카드·목록 공통)
  const renderSearchDivider = (video: any, idx: number, className: string) => {
    const prev = idx > 0 ? paginatedVids[idx - 1] : null;
    const firstRelated = video.isRelated && (prev ? !prev.isRelated : true);
    const firstLow = !video.isRelated && isAccuracySort && !video.isHighConfidence &&
      (prev ? (prev.isHighConfidence || prev.isRelated) : (currentPage > 1 || !hasAnyHighConfidence));
    if (!firstRelated && !firstLow) return null;
    const label = firstRelated && video.relatedVia === '막 친 글자'
      ? '아무렇게나 친 글자 같아요 · 제목에 막 친 글자가 있는 영상'
      : firstRelated
      ? (hasMainResults ? '연관 검색 결과 · 썸네일·태그·게임 정보에서 찾았어요' : '제목엔 없지만 썸네일·태그·게임 정보에서 찾았어요')
      : isTagSearch
        ? (hasAnyHighConfidence ? '유사 검색 · 태그는 아니지만 제목 등에 같은 말이 있어요' : '이 태그가 붙은 영상은 없어요 · 제목 등에서 찾은 유사 검색')
        : (hasAnyHighConfidence ? '일치 확률이 비교적 낮은 검색 결과' : '유사 검색 결과 (직접 일치 항목 없음)');
    return (
      <div className={className}>
        <div className="flex items-center gap-3">
          <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
          <div className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold shadow-sm",
            firstRelated
              ? "bg-purple-50 dark:bg-purple-950/40 border-purple-200/80 dark:border-purple-800/60 text-purple-700 dark:text-purple-300"
              : "bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300"
          )}>
            {firstRelated
              ? <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
            <span>{label}</span>
          </div>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-28 sm:pb-12" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
      {/* 하위 탭 (유튜브 채널 화면처럼 홈 / 추천 / 동영상 / Shorts / 재생목록) */}
      <div id="recommend-cards-top" role="tablist" aria-label="추천 영상 보기 방식" className="scroll-mt-24 -mx-3 px-3 sm:mx-0 sm:px-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {RECOMMEND_SUB_TABS.map((t) => (
          <button
            key={t.id}
            id={`rec-subtab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={subTab === t.id}
            onClick={() => changeSubTab(t.id)}
            className={cn(
              "shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap",
              subTab === t.id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <motion.div
        key={subTab}
        initial={subTabDir ? { opacity: 0, x: subTabDir * 36 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="space-y-6"
      >
      {/* 재생목록: 다른 탭과 같은 최근 검색 줄을 같은 모양의 카드 안에 (아래 콘텐츠와 겹치지 않게) */}
      {subTab === 'playlists' && recentSearches.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 px-4 py-3 sm:px-5 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-sm" data-no-swipe>
          {recentChips(false)}
        </div>
      )}
      {subTab === 'playlists' ? (
        <PlaylistsFeed searchTerm={searchTerm} logs={data?.logs} onNavigateToCalendar={onNavigateToCalendar} />
      ) : (<>
      {/* 필터 카드 (최상단 배치: 실시간 연관 검색어 대신 필터가 맨 위에 위치) */}
      <div
        id="recommend-filter-card"
        className="relative z-30 flex flex-col gap-3.5 bg-white dark:bg-zinc-900 p-4 sm:p-5 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200">
              {searchTerm.trim() ? (
                <>
                  '<span className="text-purple-600 dark:text-purple-400 font-extrabold">{effectiveSearchTerm}</span>' 검색 결과: <b className="text-zinc-900 dark:text-white font-black">{subTab === 'shorts' ? shortsCount : recommended.length}개</b> {subTab === 'shorts' ? '쇼츠' : '영상'}
                </>
              ) : (
                <>
                  {subTab === 'shorts' ? '쇼츠' : subTab === 'live' ? '라이브' : subTab === 'videos' ? '편집본 영상' : subTab === 'recommend' ? '추천 영상' : '전체 영상'}: <b className="text-zinc-900 dark:text-white font-black">{subTab === 'shorts' ? shortsCount : recommended.length}개</b>
                </>
              )}
            </span>
            {searchTerm.trim() && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline cursor-pointer"
              >
                검색 초기화
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 데스크톱 전용 검색창 (모바일은 하단 키보드 위 플로팅 검색창 사용) */}
            <div className="hidden sm:flex relative items-center min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <LazyInput
                type="text"
                value={searchTerm}
                onCommit={setSearchTerm}
                placeholder="게임명, 제목 검색…"
                className="w-full pl-8.5 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-zinc-400 dark:focus:ring-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 text-xs dark:text-zinc-200 font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded cursor-pointer"
                  title="검색어 지우기"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 카테고리 드롭다운 (선택형 컴포넌트) */}
            <div className="relative min-w-[130px] flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                className="w-full flex items-center justify-between pl-3 pr-2.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-xs dark:text-zinc-200 font-medium cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <span className="truncate">
                    {selectedCategories.includes('전체') 
                      ? '카테고리 전체' 
                      : selectedCategories.length === 1 
                        ? selectedCategories[0] 
                        : `${selectedCategories[0]} 외 ${selectedCategories.length - 1}개`}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              </button>

              <AnimatePresence>
                {isCatDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsCatDropdownOpen(false)}></div>
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700/80 rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5"
                    >
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            isNavigatedFromExternalRef.current = false;
                            let next: string[];
                            if (cat === '전체') {
                              next = ['전체'];
                            } else {
                              next = selectedCategories.includes('전체') ? [] : [...selectedCategories];
                              if (next.includes(cat)) {
                                next = next.filter(c => c !== cat);
                                if (next.length === 0) next = ['전체'];
                              } else {
                                next.push(cat);
                              }
                            }
                            userChosenCategoriesRef.current = next;
                            sessionStorage.setItem('rec_user_categories', JSON.stringify(next));
                            setSelectedCategories(next);
                          }}
                          className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            selectedCategories.includes(cat)
                              ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold'
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            selectedCategories.includes(cat)
                              ? 'bg-purple-500 border-purple-500 text-white'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}>
                            {selectedCategories.includes(cat) && <CheckCircle className="w-2.5 h-2.5" />}
                          </div>
                          <span className="truncate">{cat}</span>
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* 정렬 옵션 (추천 탭은 추천순 고정이라 숨김) */}
            <div className={cn("relative min-w-[105px]", subTab === 'recommend' && "hidden")}>
              <select
                value={sortOrder}
                onChange={(e) => {
                  const newOrder = e.target.value;
                  setSortOrder(newOrder);
                  if (searchTerm.trim()) {
                    if (newOrder !== 'accuracy') {
                      userSelectedOtherSortDuringSearchRef.current = true;
                      previousNonAccuracySortRef.current = newOrder;
                    } else {
                      userSelectedOtherSortDuringSearchRef.current = false;
                    }
                  } else {
                    previousNonAccuracySortRef.current = newOrder;
                  }
                }}
                className="w-full pl-3 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-xs appearance-none dark:text-zinc-200 font-medium cursor-pointer"
              >
                {Boolean(searchTerm.trim()) && <option value="accuracy">정확도순</option>}
                <option value="desc">{isDateQuery ? '날짜 최신순' : '최신순'}</option>
                <option value="asc">{isDateQuery ? '날짜 과거순' : '과거순 (첫 기록부터)'}</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            </div>

            {effectiveSortOrder === 'recommend' && (
              <button
                type="button"
                onClick={handleRefresh}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors font-medium text-xs whitespace-nowrap border border-purple-100 dark:border-purple-900/50 cursor-pointer"
                title="추천 새로고침"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 최근 검색어 칩 목록 */}
        {recentSearches.length > 0 && recentChips(true)}
      </div>

        {/* 오타 보정 안내: 바로 고친 경우 / 혹시 ~? 제안 */}
        {subTab !== 'recommend' && (autoCorrected || suggestion || (planBundle && planBundle.plan.notes.length > 0)) && (
          <div className="-mt-1 mb-4 px-1 text-sm text-zinc-600 dark:text-zinc-300 break-keep space-y-1">
            {autoCorrected ? (
              <p>
                <button type="button" onClick={() => setSearchTerm(autoCorrected.to)} className="font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer">'{autoCorrected.to}'</button>
                (으)로 검색한 결과예요{autoCorrected.how === 'hanyeong' ? ' (한/영 전환)' : ''}.{' '}
                <button type="button" onClick={() => setKeepOriginalFor(autoCorrected.from)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline cursor-pointer">
                  '{autoCorrected.from}' 그대로 검색
                </button>
              </p>
            ) : suggestion && (
              <p>
                혹시{' '}
                <button type="button" onClick={() => setSearchTerm(suggestion.to)} className="font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer">'{suggestion.to}'</button>
                {' '}을(를) 검색하셨나요?
              </p>
            )}
            {/* 줄임말·말하듯 검색 안내 */}
            {planBundle && planBundle.plan.notes.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 mt-px text-purple-500 shrink-0" />
                <span>{planBundle.plan.notes.join(' · ')}</span>
              </p>
            )}
          </div>
        )}
      {subTab === 'shorts' ? (
        // 쇼츠: 위 필터 카드(카테고리·정렬·최근 검색)를 동영상과 똑같이 쓰고, 목록만 쇼츠로
        <ShortsFeed
          logs={data?.logs}
          searchTerm={literalTerm}
          plan={planBundle}
          chosung={chos}
          selectedCategories={selectedCategories}
          order={sortOrder === 'asc' ? 'asc' : sortOrder === 'accuracy' && searchTerm.trim() ? 'accuracy' : 'desc'}
          onCount={setShortsCount}
          onNavigateToCalendar={onNavigateToCalendar}
          genresOfLog={genresOfLog}
        />
      ) : (<>
      {/* 검색 결과 영상 카드 영역 (카드가 아래로/사각형으로 펼쳐지는 인라인 확장 UX) */}
      {/* 추천 탭 첫 페이지: 맞춤 쇼츠 · 맞춤 라이브 · 그리고 아래에 맞춤 영상 */}
      {subTab === 'recommend' && currentPage === 1 && (recShorts.length > 0 || recLives.length > 0) && (
        <div className="space-y-6 mb-6">
          <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
            {personalized
              ? '그동안 오래 들여다보거나 눌러 본 게임·장르를 바탕으로 골랐어요. 이미 본 건 뒤로 빼고, 가끔은 새로운 것도 섞어요.'
              : '아직 관심 기록이 적어서 골고루 보여 드려요. 둘러볼수록 취향에 맞춰져요.'}
          </p>
          {recShorts.length > 0 && (
            <section>
              <h3 className="px-1 mb-2.5 text-sm font-black text-zinc-900 dark:text-white flex items-center gap-1.5"><ShortsIcon className="w-4 h-4 text-red-500" /> 추천 쇼츠</h3>
              <ShortsShelf items={recShorts} />
            </section>
          )}
          {recLives.length > 0 && (
            <section>
              <h3 className="px-1 mb-1.5 text-sm font-black text-zinc-900 dark:text-white flex items-center gap-1.5"><PlaySquare className="w-4 h-4 text-purple-500" /> 추천 라이브</h3>
              <div className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-1.5 sm:p-2">
                {recLives.map((v) => (
                  <VideoListRow
                    key={v.id}
                    dense
                    videoId={v.id}
                    title={v.videoTitle}
                    href={v.videoUrl}
                    badge={(v.parentLog?.games || []).map((g: any) => g?.name).filter(Boolean).slice(0, 2).join(', ') || undefined}
                    edits={v.liveEdits}
                    shorts={mergeShorts(v.parentLog?.shorts)}
                    interest={videoInterestItem(v)}
                    shareText={() => formatRecommendShareText(v, data?.logs)}
                  />
                ))}
              </div>
            </section>
          )}
          <h3 className="px-1 -mb-3 text-sm font-black text-zinc-900 dark:text-white flex items-center gap-1.5"><YoutubeLogo className="w-4 h-4 text-zinc-500" /> 추천 영상</h3>
        </div>
      )}
      <div id="recommend-cards-container" className="min-h-[400px]">
        {/* 보기 방식: 카드 / 목록(유튜브 동영상 탭처럼) + 모바일 카드 1개·2개씩 */}
        {recommended.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-1 mb-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{recommended.length}</strong>개 영상
            </span>
            <div className="flex items-center gap-1.5">
              {viewStyle === 'card' && (
                <div className="flex sm:hidden items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
                  {(['1', '2'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleViewModeChange(m)}
                      aria-pressed={mobileViewMode === m}
                      className={cn(
                        "px-2 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        mobileViewMode === m
                          ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs font-bold"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                      )}
                    >
                      {m}열
                    </button>
                  ))}
                </div>
              )}
              <ViewStyleToggle value={viewStyle} onChange={setViewStyle} />
            </div>
          </div>
        )}

        {viewStyle === 'list' ? (
          <div className="flex flex-col gap-1.5 -mx-2 sm:mx-0">
            {paginatedVids.map((video, idx) => {
              const ytId = extractYoutubeId(video.videoUrl) || video.id;
              const isMulti = Boolean(video.isCompilation || (Array.isArray(video.allBroadcastDates) && video.allBroadcastDates.length > 1));
              const isExpanded = Boolean(selectedBroadcastModalVideo && (selectedBroadcastModalVideo.id === video.id || (selectedBroadcastModalVideo.videoUrl && selectedBroadcastModalVideo.videoUrl === video.videoUrl)));
              const toggle = () => setSelectedBroadcastModalVideo(isExpanded ? null : video);
              return (
                <div key={`${video.id}-${idx}`} className={cn(isExpanded && "my-2 mx-2 sm:mx-0")}>
                  {renderSearchDivider(video, idx, 'my-2 py-2 px-2 sm:px-0')}
                  <AnimatePresence mode="wait" initial={false}>
                    {isExpanded ? (
                      <motion.div key="detail" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 340, damping: 32 }}>
                        <CompilationDetail video={video} allLogs={data?.logs} onClose={() => setSelectedBroadcastModalVideo(null)} onNavigateToCalendar={onNavigateToCalendar} />
                      </motion.div>
                    ) : (
                      <motion.div key="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        <VideoListRow
                          videoId={ytId}
                          title={video.videoTitle}
                          href={video.videoUrl}
                          isCompilation={video.isCompilation}
                          badge={[
                            video.isCompilation
                              ? `몰아보기 · ${video.games?.length || video.allBroadcastDates?.length || 0}개 게임`
                              : isMulti ? `${video.allBroadcastDates.length}개 생방` : '',
                            video.relatedVia ? `${video.relatedVia}에서 찾음` : '',
                          ].filter(Boolean).join(' · ') || undefined}
                          liveUrl={!isMulti && !video.isLive ? video.parentLog?.vods?.find((v: any) => v?.url)?.url : undefined}
                          edits={video.isLive ? video.liveEdits : undefined}
                          interest={videoInterestItem(video)}
                          onLiveClick={isMulti && !video.isLive ? toggle : undefined}
                          liveActive={isExpanded}
                          shorts={mergeShorts(shortsByVideo.get(ytId), !isMulti ? video.parentLog?.shorts : [])}
                          shareText={() => formatRecommendShareText(video, data?.logs)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {recommended.length === 0 && matchingShorts.length === 0 && (
              <div className="py-12 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
                조건에 맞는 추천 영상을 찾을 수 없어요.
              </div>
            )}
          </div>
        ) : (
        <div className={cn(
          "grid",
          mobileViewMode === '2' 
            ? "grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6" 
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        )}>
          {/* 만약 펼쳐진 영상이 현재 페이지에 없다면 맨 위에 사각형 카드로 펼침 */}
          {selectedBroadcastModalVideo && !paginatedVids.some(v => v.id === selectedBroadcastModalVideo.id || (selectedBroadcastModalVideo.videoUrl && v.videoUrl === selectedBroadcastModalVideo.videoUrl)) && (
            <div className="col-span-full my-1">
              <CompilationDetail
                video={selectedBroadcastModalVideo}
                allLogs={data?.logs}
                onClose={() => setSelectedBroadcastModalVideo(null)}
                onNavigateToCalendar={onNavigateToCalendar}
              />
            </div>
          )}

          {paginatedVids.map((video, idx) => {
            const isExpanded = Boolean(
              selectedBroadcastModalVideo &&
              (selectedBroadcastModalVideo.id === video.id || 
               (selectedBroadcastModalVideo.videoUrl && selectedBroadcastModalVideo.videoUrl === video.videoUrl))
            );

            return (
              <React.Fragment key={`${video.id}-${idx}`}>
                {renderSearchDivider(video, idx, 'col-span-full my-2 py-3')}

                {/* 몰아보기·연동 생방: 누른 카드 자리에서 재생목록 화면처럼 펼쳐짐 (닫기 전까지 원래 카드는 숨김) */}
                <div className={cn(isExpanded && "col-span-full")}>
                  <AnimatePresence mode="wait" initial={false}>
                    {isExpanded ? (
                      <motion.div
                        key="detail"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                      >
                        <CompilationDetail
                          video={video}
                          allLogs={data?.logs}
                          onClose={() => setSelectedBroadcastModalVideo(null)}
                          onNavigateToCalendar={onNavigateToCalendar}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="card"
                        className="flex flex-col h-full"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                      >
 <VideoCard 
                          video={video} 
                          linkedShorts={shortsByVideo.get(extractYoutubeId(video.videoUrl || '') || video.id)}
                          allLogs={data?.logs} 
                          onNavigateToCalendar={onNavigateToCalendar} 
                          onOpenBroadcastModal={(v) => setSelectedBroadcastModalVideo(v)}
                          isExpanded={false}
                          isCompact={mobileViewMode === '2'}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </React.Fragment>
            );
          })}
              
              {recommended.length === 0 && matchingShorts.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
                  <YoutubeLogo className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>조건에 맞는 추천 영상을 찾을 수 없어요.</p>
                </div>
              )}
            </div>
        )}

        {/* 홈 검색: 제목이 맞는 쇼츠 줄 (영상 카드 다음에, 영상이 없으면 맨 위) */}
        {matchingShorts.length > 0 && currentPage === 1 && (
          <div className={cn(recommended.length ? 'mt-6' : 'mb-5')} data-no-swipe>
            <div className="flex items-center gap-1.5 px-1 mb-2 text-sm font-bold text-zinc-900 dark:text-white">
              <ShortsIcon className="w-4 h-4 text-red-500" /> Shorts <span className="text-xs font-semibold text-zinc-400">{matchingShorts.length}개</span>
            </div>
            <ShortsShelf items={matchingShorts} />
          </div>
        )}
            <Pagination currentPage={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
      </div>
      </>)}
      
      </>)}
      </motion.div>

      {/* 푸터 바로 윗부분: 과거 데이터 안내 및 외부 링크 보안 주의 경고 */}
      <div className="mt-8 space-y-3">
        <div className="p-4 sm:p-5 rounded-[24px] bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-2.5 leading-relaxed">
          <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-zinc-700 dark:text-zinc-300">과거 데이터 안내:</strong> 본 사이트의 데이터 중 {firstYear}~2025년 데이터는 스프레드시트 기록을 변환한 것으로, 파일 변환 시에 누락된 데이터나 잘못된 정보가 포함되어 있을 수 있어요. (또한 {firstYear}~2025년 데이터에는 쇼츠 영상 정보가 포함되지 않아요)
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-[24px] bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300/90 flex items-start gap-2.5 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold text-amber-900 dark:text-amber-200">외부 링크 및 보안 주의 안내:</strong> 본 검색 결과에 표시되는 모든 외부 링크(유튜브 영상, 치지직 다시보기, 게임 및 외부 웹페이지 등)는 단순 검색 및 팬 아카이브 결과에 불과하며, 당 사이트에서 직접 보증하거나 관리하지 않아요. 외부 링크 접속으로 인해 발생할 수 있는 해킹, 악성코드 감염, 피싱, 개인정보 유출 및 보안 피해 등에 대해 본 사이트는 일체의 책임을 지지 않으므로 링크 클릭 및 이용 시 각별히 주의해 주세요.
          </div>
        </div>
      </div>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 mt-8 text-center text-zinc-500 dark:text-zinc-500 text-sm">
        <p className="mt-1 text-xs">※ 최신순 영상의 정렬 기준은 방송일(생방일)이에요.</p>
      </footer>
    </div>
  );
}
