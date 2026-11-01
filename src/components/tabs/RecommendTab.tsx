import React, { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Star, CheckCircle, Search, Filter, Cloud, CloudDownload, X, Loader2, AlertCircle, AlertTriangle, Calendar, Layers, Play, Sparkles, Clock } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { fuzzyKoreanMatch, fuzzyDateMatch, cn } from '../../utils';
import { extractYoutubeId, extractChzzkId, isVideoUrl, matchMediaUrl, matchLogMedia } from '../../utils/urlUtils';
import { formatRecommendShareText, shareTextOrClipboard } from '../../utils/shareUtils';
import { ShareBoxArrowIcon } from '../common/ShareIcon';
import { BroadcastDetailModal } from './BroadcastDetailModal';
import { getMolabogiCache, setMolabogiCache } from '../../utils/molabogiCache';
import { GameTitle } from '../common/GameTitle';
import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { ShortsFeed } from './recommend/ShortsFeed';
import { CompilationDetail } from './recommend/CompilationDetail';
import { Pagination } from '../common/Pagination';
import { VideoListRow } from '../common/VideoListRow';
import { ViewStyleToggle } from '../common/ViewStyleToggle';
import { useViewStyle } from '../../hooks/useViewStyle';
import { YoutubeLogo, ShortsIcon, PlaySquare, GlassPlayButton } from '../common/MediaIcons';
import { PlaylistsFeed } from './recommend/PlaylistsFeed';
import { usePlaylists } from '../../hooks/usePlaylists';
import { buildGameCatalog, buildPlaylistGameMap } from '../../utils/playlistGames';
import { useSearchIndex, matchTag, matchRelated, gamesMatchingKeyword, normSearch } from '../../hooks/useSearchIndex';

type RecommendSubTab = 'home' | 'recommend' | 'videos' | 'shorts' | 'playlists';
const RECOMMEND_SUB_TABS: { id: RecommendSubTab; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 'recommend', label: '추천' },
  { id: 'videos', label: '동영상' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'playlists', label: '재생목록' },
];


export const VideoCard = ({ 
  video,
  allLogs,
  onNavigateToCalendar,
  onOpenBroadcastModal,
  isCompact = false,
  isExpanded = false,
}: { 
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

  const shorts = video.parentLog?.shorts || [];
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
            }}
            className={`w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all font-hanna font-pro ${
              video.videoUrl
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs hover:scale-[1.01]'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            <YoutubeLogo className="w-4 h-4 text-zinc-600 dark:text-zinc-400" /> <span className="font-hanna font-pro">영상 보기</span>
          </a>
          
          {!isMultiBroadcastOrCompilation && (
            <div className="flex gap-2">
              {vods.length > 0 && vods[0].url ? (
                <a 
                  href={vods[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20 font-hanna font-pro"
                >
                  <PlaySquare className="w-4 h-4" /> <span className="font-hanna font-pro">생방송 (풀영상)</span>
                </a>
              ) : null}

              {shorts.length === 1 && (
                <a 
                  href={shorts[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 font-hanna font-pro"
                >
                  <ShortsIcon className="w-4 h-4" /> <span className="font-hanna font-pro">쇼츠 보기</span>
                </a>
              )}

              {shorts.length > 1 && (
                <div className="flex-1 relative" ref={menuRef}>
                  <button 
                    onClick={() => setShowShortsMenu(!showShortsMenu)} 
                    className="w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <ShortsIcon className="w-4 h-4" /> 쇼츠 ({shorts.length}) <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                  {showShortsMenu && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-[0_14px_36px_-6px_rgba(0,0,0,0.28),0_3px_8px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_44px_-6px_rgba(0,0,0,0.85),0_3px_10px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden z-30 flex flex-col">
                      <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-700">
                        쇼츠 선택
                      </div>
                      {shorts.map((s: any, idx: number) => (
                        <a 
                          key={idx} 
                          href={s.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-0 truncate"
                        >
                          {s.title || `쇼츠 ${idx + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
    if (saved === 'recommend') return 'desc'; // 추천순은 '추천' 탭으로 옮김
    return saved || 'desc';
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

    // 1. 검색어 입력 시 정확도순 자동 선택
    if (!prevTerm && currTerm) {
      if (sortOrder !== 'accuracy') {
        previousNonAccuracySortRef.current = sortOrder;
      }
      userSelectedOtherSortDuringSearchRef.current = false;
      setSortOrder('accuracy');
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

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('uzuhama_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean || clean.length < 2) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== clean.toLowerCase());
      const next = [clean, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('uzuhama_recent_searches', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches(prev => {
      const next = prev.filter(s => s !== term);
      try {
        localStorage.setItem('uzuhama_recent_searches', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('uzuhama_recent_searches');
    } catch {}
  };

  const [showAllWithoutSearch, setShowAllWithoutSearch] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileViewMode, setMobileViewMode] = useState<'1' | '2'>(() => {
    if (typeof window === 'undefined') return '1';
    return (localStorage.getItem('uzuhama_recommend_view_mode') as '1' | '2') || '1';
  });

  const [viewStyle, setViewStyle] = useViewStyle();
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

  const handleWatch = (id: string) => {
    const newHistory = { ...history, [id]: Date.now() };
    setHistory(newHistory);
    localStorage.setItem('userVideoHistory', JSON.stringify(newHistory));
  };

  // 재생목록 이름(예: 우주하마 배틀그라운드)으로, 게임이 안 붙은 영상에 그 게임을 기본으로 붙임
  const { data: playlistData } = usePlaylists();
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

    return Array.from(videoMap.values());
  }, [data, playlistGameMap]);

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
      Boolean(target.closest('.overflow-x-auto, .no-scrollbar, input, textarea, select, iframe, .recharts-wrapper, [data-no-swipe]'));
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

  const recommended = useMemo(() => {
    if (allVideos.length === 0) return [];

    // 동영상 탭: 몰아보기를 뺀 편집본만
    let vids = subTab === 'videos' ? allVideos.filter((v) => !v.isCompilation) : allVideos;

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
      const term = searchTerm.trim();
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
      const searchTarget = isUrl ? allVideos : vids;
      const entryOf = (v: any) => searchIndex[extractYoutubeId(v.videoUrl) || v.id];

      if (isTagMode) {
        // '#태그' 검색: 유튜브 태그(설명의 #해시태그 포함)로만 찾음. 완전히 같은 태그가 위, 일부만 같은 태그는 아래
        vids = searchTarget.filter((v) => {
          const m = matchTag(entryOf(v), tagQuery);
          if (m) tagMatches.set(v.id, m);
          return Boolean(m);
        });
      } else {
      vids = searchTarget.filter(v => {
        // 1. 영상, 쇼츠, 생방 링크 대조 (11자리 Video ID 고유 식별자 파싱 및 LIKE 대조)
        if (isUrl) {
          // (1-1) 영상 자체 ID 및 URL 대조 (풀링크/단축/라이브/쇼츠/임베드 무관 100% 식별)
          if (ytId && (v.id === ytId || extractYoutubeId(v.videoUrl) === ytId || v.videoUrl?.includes(ytId))) return true;
          if (matchMediaUrl(v.videoUrl, term)) return true;

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

        // 3. 제목 및 초성 검색
        if (fuzzyKoreanMatch(term, v.videoTitle)) return true;
        
        // 4. 카테고리 및 게임명 검색
        const qLower = term.toLowerCase();
        if (v.category && (fuzzyKoreanMatch(term, v.category) || v.category.toLowerCase().includes(qLower))) return true;
        if (v.games?.some((g: any) => fuzzyKoreanMatch(term, g.name) || (g.category && (fuzzyKoreanMatch(term, g.category) || g.category.toLowerCase().includes(qLower))))) return true;
        if (v.parentLog?.games?.some((g: any) => fuzzyKoreanMatch(term, g.name) || (g.category && (fuzzyKoreanMatch(term, g.category) || g.category.toLowerCase().includes(qLower))))) return true;
        if (v.parentLog?.game && fuzzyKoreanMatch(term, v.parentLog.game)) return true;
        if (v.parentLog?.category && (fuzzyKoreanMatch(term, v.parentLog.category) || v.parentLog.category.toLowerCase().includes(qLower))) return true;
        return false;
      });

      // 장르 검색: 검색어가 장르 이름과 같으면 옆 카테고리 필터와 똑같은 영상을 모두 포함
      if (genreKey) {
        const found = new Set(vids.map((v) => v.id));
        const extra = searchTarget.filter((v) => !found.has(v.id) && categoryIndex.videoTokens(v).some((t) => normSearch(t) === genreKey));
        vids = [...vids, ...extra];
      }

      // 연관 검색: 제목 등에는 없지만 썸네일 글자·키워드·태그·설명, 또는 게임의 한국어 키워드(예: 도서관 → Librarian)에 검색어가 있는 영상 (맨 아래)
      if (!isUrl) {
        const found = new Set(vids.map((v) => v.id));
        const kwGames = gamesMatchingKeyword(gameKeywordMap, term);
        const gameNamesOf = (v: any) => [v.parentLog?.game, ...(v.parentLog?.games || []).map((g: any) => g?.name), ...(v.games || []).map((g: any) => g?.name)]
          .filter(Boolean).map((n: string) => normSearch(n));
        const extra = searchTarget.filter((v) => {
          if (found.has(v.id)) return false;
          const via = matchRelated(entryOf(v), term) || (kwGames.size && gameNamesOf(v).some((n) => kwGames.has(n)) ? '게임' : null);
          if (via) relatedVia.set(v.id, via);
          return Boolean(via);
        });
        vids = [...vids, ...extra];
      }
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
       if (isTagMode) {
         const m = tagMatches.get(v.id);
         matchScore = m === 'exact' ? 90 : 40;
         isHighConfidence = m === 'exact';
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
         }
         // 3. 방송 날짜 직접 일치
         else if (v.parentLog?.date && fuzzyDateMatch(q, v.parentLog.date)) {
           matchScore = 75;
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
           if (fuzzyKoreanMatch(q, v.videoTitle)) {
             fuzzyScore = 35;
           } else if (fuzzyKoreanMatch(q, category) || fuzzyKoreanMatch(q, primaryGame)) {
             fuzzyScore = 30;
           }
           matchScore = fuzzyScore;
           isHighConfidence = false;
         }
       }

       return { ...v, rType, weight, matchScore, isHighConfidence, isRelated, relatedVia: relatedVia.get(v.id) };
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
  }, [allVideos, categoryIndex, categories, selectedCategories, searchTerm, shuffleSeed, effectiveSortOrder, pinnedVideoId, subTab, searchIndex, gameKeywordMap]); // Removed ratings and history to prevent jumping on watch

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

  const totalPages = Math.max(1, Math.ceil(recommended.length / itemsPerPage));
  const paginatedVids = recommended.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  // 검색 결과 구분선: ① 일치 확률이 낮은 결과 ② 썸네일·태그 등에서 찾은 연관 검색 결과 (카드·목록 공통)
  const renderSearchDivider = (video: any, idx: number, className: string) => {
    const prev = idx > 0 ? paginatedVids[idx - 1] : null;
    const firstRelated = video.isRelated && (prev ? !prev.isRelated : true);
    const firstLow = !video.isRelated && isAccuracySort && !video.isHighConfidence &&
      (prev ? (prev.isHighConfidence || prev.isRelated) : (currentPage > 1 || !hasAnyHighConfidence));
    if (!firstRelated && !firstLow) return null;
    const label = firstRelated
      ? (hasMainResults ? '연관 검색 결과 · 썸네일·태그·게임 정보에서 찾았어요' : '제목엔 없지만 썸네일·태그·게임 정보에서 찾았어요')
      : isTagSearch
        ? (hasAnyHighConfidence ? '비슷한 태그' : '비슷한 태그 (같은 태그 없음)')
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
      {subTab === 'shorts' ? (
        <ShortsFeed logs={data?.logs} searchTerm={searchTerm} selectedCategories={['전체']} onNavigateToCalendar={onNavigateToCalendar} genresOfLog={genresOfLog} />
      ) : subTab === 'playlists' ? (
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
                  '<span className="text-purple-600 dark:text-purple-400 font-extrabold">{searchTerm}</span>' 검색 결과: <b className="text-zinc-900 dark:text-white font-black">{recommended.length}개</b> 영상
                </>
              ) : (
                <>
                  {subTab === 'videos' ? '편집본 영상' : subTab === 'recommend' ? '추천 영상' : '전체 영상'}: <b className="text-zinc-900 dark:text-white font-black">{recommended.length}개</b>
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
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
                <option value="desc">최신순</option>
                <option value="asc">과거순 (첫 기록부터)</option>
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
        {recentSearches.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
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
              onClick={clearAllRecentSearches} 
              className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline shrink-0 ml-1 cursor-pointer"
            >
              전체 삭제
            </button>
          </div>
        )}
      </div>

      {/* 검색 결과 영상 카드 영역 (카드가 아래로/사각형으로 펼쳐지는 인라인 확장 UX) */}
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
          <div className="flex flex-col gap-1 -mx-2 sm:mx-0">
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
                          liveUrl={!isMulti ? video.parentLog?.vods?.find((v: any) => v?.url)?.url : undefined}
                          onLiveClick={isMulti ? toggle : undefined}
                          liveActive={isExpanded}
                          shorts={!isMulti ? (video.parentLog?.shorts || []) : []}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {recommended.length === 0 && (
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
              
              {recommended.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
                  <YoutubeLogo className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>조건에 맞는 추천 영상을 찾을 수 없어요.</p>
                </div>
              )}
            </div>
        )}

            <Pagination currentPage={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
      </div>
      
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
            <strong className="font-bold text-amber-900 dark:text-amber-200">외부 링크 및 보안 주의 안내:</strong> 본 검색 결과에 표시되는 모든 외부 링크(유튜브 영상, 치지직 다시보기, 게임 및 외부 웹페이지 등)는 단순 검색 및 팬 아카이브 결과에 불과하며, 당 사이트에서 직접 보증하거나 관리하지 않아요. 외부 링크 접속으로 인해 발생할 수 있는 해킹, 악성코드 감염, 피싱, 개인정보 유출 및 보안 피해 등에 대해 본 사이트는 일체의 책임을 지지 않으므로 링크 클릭 및 이용 시 각별히 주의하시기 바라요.
          </div>
        </div>
      </div>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 mt-8 text-center text-zinc-500 dark:text-zinc-500 text-sm">
        <p className="mt-1 text-xs">※ 최신순 영상의 정렬 기준은 방송일(생방일)이에요.</p>
      </footer>
    </div>
  );
}
