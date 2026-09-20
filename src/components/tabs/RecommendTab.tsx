import React, { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, ChevronDown, ThumbsUp, ThumbsDown, Star, CheckCircle, Search, Filter, Cloud, CloudDownload, X, Loader2, AlertCircle, Calendar, Layers } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { fuzzyKoreanMatch, fuzzyDateMatch, cn } from '../../utils';
import { extractYoutubeId, extractChzzkId, isVideoUrl, matchMediaUrl, matchLogMedia } from '../../utils/urlUtils';
import { formatRecommendShareText, shareTextOrClipboard } from '../../utils/shareUtils';
import { ShareBoxArrowIcon } from '../common/ShareIcon';
import { BroadcastDetailModal } from './BroadcastDetailModal';

const YoutubeLogo = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const ShortsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.23 6.74l1.2.49L6 14.93a3.75 3.75 0 003.5 6.63l8.5-4.5a3.74 3.74 0 00-.23-6.74zM10 14.65v-5.3L15 12l-5 2.65z" />
  </svg>
);

const PlaySquare = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <polygon points="10 8 16 12 10 16 10 8"></polygon>
  </svg>
);

const VideoCard = ({ 
  video,
  allLogs,
  onNavigateToCalendar,
  onOpenBroadcastModal,
}: { 
  video: any;
  allLogs?: Record<string, any>;
  onNavigateToCalendar?: (dateStr: string) => void;
  onOpenBroadcastModal?: (video: any) => void;
}) => {
  const [showShortsMenu, setShowShortsMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const dateBadgeRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const shorts = video.parentLog?.shorts || [];
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

  // 게임 목록 추출
  const gamesList: { name: string; link?: string; category?: string }[] = useMemo(() => {
    if (video.games && Array.isArray(video.games) && video.games.length > 0) {
      return video.games;
    }
    const logGames = video.parentLog?.games || [];
    if (logGames.length > 0) {
      return logGames;
    }
    if (video.parentLog?.game) {
      return [{ name: video.parentLog.game, category: video.parentLog.category || '' }];
    }
    return [];
  }, [video]);

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
      className="group flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <a href={video.videoUrl} target="_blank" rel="noreferrer" className="block w-full h-full">
          <img 
            src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} 
            alt={video.videoTitle} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
          />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300"></div>
        </a>

        {/* 생방일 뱃지: 몰아보기인 경우 특별 강조색, 일반 다중 생방인 경우 심플 모던 뱃지 */}
        {isMultiBroadcastOrCompilation ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenBroadcastModal?.(video);
            }}
            className={cn(
              "absolute bottom-2 right-2 z-20 text-xs font-semibold px-2.5 py-1 rounded-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105",
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
            <span>{video.isCompilation ? `몰아보기 (${broadcastDates.length}개)` : `${broadcastDates.length}개 생방`}</span>
          </button>
        ) : (mostRecentDate || displayDate) ? (
          <div 
            ref={dateBadgeRef}
            className="absolute bottom-2 right-2 z-20"
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
              className="bg-black/80 hover:bg-black/95 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1 cursor-pointer transition-colors shadow-sm select-none"
              title="클릭하여 방송 목록 해당일로 이동"
            >
              <span>생방일: {mostRecentDate || displayDate}</span>
            </button>
          </div>
        ) : null}
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <a href={video.videoUrl} target="_blank" rel="noreferrer" className="font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex-1">
            {video.videoTitle}
          </a>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="p-1.5 -mr-1 -mt-0.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center"
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
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01]",
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
                <span className={video.isCompilation ? "font-bold text-purple-900 dark:text-purple-200" : ""}>
                  {video.isCompilation ? '몰아보기 연동 생방 펼치기' : '연동 생방 펼치기'}
                </span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-md",
                video.isCompilation
                  ? "bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200"
                  : "bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300"
              )}>
                {broadcastDates.length}개 생방
              </span>
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
                    <span className={`px-2 py-0.5 text-[10px] rounded-full select-none inline-flex items-center gap-1 ${
                      g.link 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}>
                      <span>{g.name}</span>
                      {hasSeparateCategory && (
                        <span className="opacity-60 font-normal border-l border-current pl-1">
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
                    className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
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
            className={`w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
              video.videoUrl
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs hover:scale-[1.01]'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            <YoutubeLogo className="w-4 h-4 text-zinc-600 dark:text-zinc-400" /> 영상 보기
          </a>
          
          {!isMultiBroadcastOrCompilation && (
            <div className="flex gap-2">
              {vods.length > 0 && vods[0].url ? (
                <a 
                  href={vods[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20"
                >
                  <PlaySquare className="w-4 h-4" /> 생방송 (풀영상)
                </a>
              ) : null}

              {shorts.length === 1 && (
                <a 
                  href={shorts[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                >
                  <ShortsIcon className="w-4 h-4" /> 쇼츠 보기
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
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-20 flex flex-col">
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
  onClearTarget,
  isActive = true,
  onNavigateToCalendar,
}: { 
  data: AppData | null; 
  rateVideo?: (id: string, score: number) => void;
  targetCategory?: string | null;
  targetSearchTerm?: string | null;
  onClearTarget?: () => void;
  isActive?: boolean;
  onNavigateToCalendar?: (dateStr: string) => void;
}) {
// const { data } = useFirebaseData();
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('rec_searchTerm') || '');
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
      // 외부에서 건너온 임시 카테고리/검색어였다면 사용자가 선택했던 원래 상태로 복구
      if (isNavigatedFromExternalRef.current) {
        setSelectedCategories(userChosenCategoriesRef.current || ['전체']);
        setSearchTerm('');
        isNavigatedFromExternalRef.current = false;
      }
    }
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (targetCategory) {
      isNavigatedFromExternalRef.current = true;
      setSelectedCategories([targetCategory]);
      setSearchTerm('');
      onClearTarget?.();
    }
  }, [targetCategory]);

  useEffect(() => {
    if (targetSearchTerm) {
      isNavigatedFromExternalRef.current = true;
      setSearchTerm(targetSearchTerm);
      setSelectedCategories(['전체']);
      onClearTarget?.();
    }
  }, [targetSearchTerm]);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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
      setSyncMessage('클라우드에 저장되었습니다.');
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
        setSyncMessage('코드를 찾을 수 없습니다.');
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

  const allVideos = useMemo(() => {
    if (!data || !data.logs) return [];

    // 각 영상의 관련 게임 추출 함수 (몰아보기: 등록된 모든 게임 취합 / 일반 영상: 해당 영상 관련 게임만 추출)
    const extractRelevantGames = (edit: any, log: any) => {
      const isComp = !!(edit.isCompilation || edit.compilationId);

      // 1. 몰아보기: 등록된 모든 게임 가져오기
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
        if (Array.isArray(log.games)) log.games.forEach(addGame);
        if (compGames.length === 0 && (log.game || edit.game || edit.category)) {
          addGame({ name: edit.game || log.game || edit.category, category: '' });
        }
        return compGames;
      }

      // 2. 일반 영상: 해당 영상 관련 게임만 추출 (영상 카테고리/게임명 형태 매칭)
      if (Array.isArray(edit.games) && edit.games.length > 0) {
        return edit.games;
      }

      const logGames: any[] = Array.isArray(log.games) ? log.games : [];
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
        return [{ name: editGame, link: '', category: '' }];
      }

      // (2) edit.category (영상 카테고리가 게임명 형태인 경우)와 일치하는 게임 찾기
      if (editCat && editCat !== '전체' && editCat !== '몰아보기' && editCat !== '종합') {
        const matched = logGames.find((g: any) => 
          g.name && (
            g.name.toLowerCase() === editCat.toLowerCase() ||
            editCat.toLowerCase().includes(g.name.toLowerCase()) ||
            g.name.toLowerCase().includes(editCat.toLowerCase())
          )
        );
        if (matched) {
          return [{
            name: matched.name,
            link: matched.link || '',
            category: matched.category && matched.category.toLowerCase() !== matched.name.toLowerCase() ? matched.category : ''
          }];
        }
        return [{ name: editCat, link: '', category: '' }];
      }

      // (3) 영상 제목(edit.title)에 포함된 logGames 찾기
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

      // (4) log.games가 1개뿐인 경우
      if (logGames.length === 1) {
        const g = logGames[0];
        return [{
          name: g.name,
          link: g.link || '',
          category: g.category && g.category.toLowerCase() !== g.name.toLowerCase() ? g.category : ''
        }];
      }

      // (5) log.game이 단일 게임명인 경우
      if (log.game && !log.game.includes(',')) {
        return [{ name: log.game.trim(), link: '', category: '' }];
      }

      return logGames.length > 0 ? [logGames[0]] : [];
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
                if (Array.isArray(log.games)) log.games.forEach(addGame);
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
          const matchedLog = Object.values(data.logs).find((l: any) => l.date === dateStr);
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

    return Array.from(videoMap.values());
  }, [data]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    allVideos.forEach(v => {
      const addCats = (catStr?: string) => {
        if (!catStr) return;
        catStr.split(',').map(c => c.trim()).filter(Boolean).forEach(c => cats.add(c));
      };
      // 영상 자체의 카테고리(edited[].category)는 섞지 않고,
      // 상위 방송 로그(parentLog)의 카테고리와 games의 카테고리만 사용합니다.
      addCats(v.parentLog?.category);
      v.parentLog?.games?.forEach((g: any) => addCats(g.category));
    });
    const otherCats = Array.from(cats).filter(c => c !== '몰아보기').sort();
    return ['전체', '몰아보기', ...otherCats];
  }, [allVideos]);

  const recommended = useMemo(() => {
    if (allVideos.length === 0) return [];

    let vids = allVideos;

    if (!selectedCategories.includes('전체')) {
      vids = vids.filter(v => {
        if (selectedCategories.includes('몰아보기') && v.isCompilation) {
          return true;
        }
        const hasCat = (catStr?: string) => {
          if (!catStr) return false;
          return catStr.split(',').map(c => c.trim()).some(c => selectedCategories.includes(c));
        };
        // 상위 로그의 카테고리만 필터링 대상으로 삼습니다.
        if (hasCat(v.parentLog?.category)) return true;
        if (v.parentLog?.games?.some((g: any) => hasCat(g.category))) return true;
        return false;
      });
    }

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
        if (v.category && fuzzyKoreanMatch(term, v.category)) return true;
        if (v.games?.some((g: any) => fuzzyKoreanMatch(term, g.name) || (g.category && fuzzyKoreanMatch(term, g.category)))) return true;
        if (v.parentLog?.games?.some((g: any) => fuzzyKoreanMatch(term, g.name) || (g.category && fuzzyKoreanMatch(term, g.category)))) return true;
        if (v.parentLog?.game && fuzzyKoreanMatch(term, v.parentLog.game)) return true;
        if (v.parentLog?.category && fuzzyKoreanMatch(term, v.parentLog.category)) return true;
        return false;
      });
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

       if (searchTerm.trim()) {
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
         else if (primaryGame.includes(q) || category.includes(q)) {
           matchScore = 70;
           isHighConfidence = true;
         }
         // 5. 연관 서브 게임 목록에 직접 포함
         else if (v.parentLog?.games?.some((g: any) => (g.name || '').toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q))) {
           matchScore = 60;
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

       return { ...v, rType, weight, matchScore, isHighConfidence };
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

    if (sortOrder === 'accuracy') {
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
    } else if (sortOrder === 'desc') {
      scoredVids.sort((a, b) => {
        const timeA = getVideoSortTime(a);
        const timeB = getVideoSortTime(b);
        if (timeA !== timeB) return timeB - timeA;
        return (b.parentLog?.date || '').localeCompare(a.parentLog?.date || '');
      });
    } else if (sortOrder === 'asc') {
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
    return scoredVids;
  }, [allVideos, selectedCategories, searchTerm, shuffleSeed, sortOrder]); // Removed ratings and history to prevent jumping on watch

  const handleRefresh = () => {
    Object.keys(baseWeights.current).forEach(id => {
       baseWeights.current[id] = Math.random();
    });
    setShuffleSeed(Date.now());
    setCurrentPage(1);
  };

  // 선택된 다중 생방/몰아보기 상세 모달
  const [selectedBroadcastModalVideo, setSelectedBroadcastModalVideo] = useState<any | null>(null);

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

  const isAccuracySort = sortOrder === 'accuracy' && Boolean(searchTerm.trim());
  const hasAnyHighConfidence = useMemo(() => {
    return isAccuracySort && recommended.some(v => v.isHighConfidence);
  }, [isAccuracySort, recommended]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <YoutubeLogo className="w-6 h-6 text-red-600 dark:text-red-500" />
            우주하마 맞춤 영상
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">방송 기록에 기반한 맞춤 추천 영상입니다.</p>
        </div>
      </div>

      <div id="recommend-main-card" className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-zinc-900 p-5 sm:p-6 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="게임명, 날짜, 링크 검색…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-zinc-200"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md cursor-pointer"
              title="검색어 지우기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        <div className="relative min-w-[150px] sm:w-[200px]">
          <button 
            onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
            className="w-full flex items-center justify-between pl-4 pr-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-zinc-200 font-medium cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <Filter className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              <span className="truncate">{selectedCategories.includes('전체') ? '전체 카테고리' : `${selectedCategories.length}개 선택됨`}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          </button>
          
          <AnimatePresence>
            {isCatDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsCatDropdownOpen(false)}></div>
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1"
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
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCategories.includes(cat) 
                          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold' 
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        selectedCategories.includes(cat)
                          ? 'bg-purple-500 border-purple-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {selectedCategories.includes(cat) && <CheckCircle className="w-3 h-3" />}
                      </div>
                      {cat}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative min-w-[110px]">
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
            className="w-full pl-4 pr-8 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none dark:text-zinc-200 font-medium cursor-pointer"
          >
            {Boolean(searchTerm.trim()) && <option value="accuracy">정확도순</option>}
            <option value="desc">최신순</option>
            <option value="asc">과거순 (첫 기록부터)</option>
            <option value="recommend">추천순 (랜덤)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
        
        {sortOrder === 'recommend' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRefresh}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors font-medium text-sm whitespace-nowrap border border-indigo-100 dark:border-indigo-900/50 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              추천 새로고침
            </button>
          </div>
        )}
      </div>

      {/* 영상 카드 영역: 연동 생방 펼치기 시 나머지 영상 카드들을 덮는 커버 뷰로 전환 */}
      <div id="recommend-cards-container" className="min-h-[400px]">
        {selectedBroadcastModalVideo ? (
          <BroadcastDetailModal
            video={selectedBroadcastModalVideo}
            allLogs={data?.logs}
            onClose={() => setSelectedBroadcastModalVideo(null)}
            onNavigateToCalendar={onNavigateToCalendar}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedVids.map((video, idx) => {
                // 일치 확률이 낮은 결과 구분선 표시 조건:
                // 정확도순 검색 중이고 일치 확률이 비교적 낮은(isHighConfidence === false) 항목인 경우
                const isFirstLowConfidenceOnPage = isAccuracySort && !video.isHighConfidence && (
                  (idx === 0 && (currentPage > 1 || !hasAnyHighConfidence)) ||
                  (idx > 0 && paginatedVids[idx - 1]?.isHighConfidence)
                );

                return (
                  <React.Fragment key={`${video.id}-${idx}`}>
                    {isFirstLowConfidenceOnPage && (
                      <div className="col-span-full my-2 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-xs font-semibold text-amber-700 dark:text-amber-300 shadow-sm">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{hasAnyHighConfidence ? '일치 확률이 비교적 낮은 검색 결과' : '유사 검색 결과 (직접 일치 항목 없음)'}</span>
                          </div>
                          <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                        </div>
                      </div>
                    )}
                    <VideoCard 
                      video={video} 
                      allLogs={data?.logs} 
                      onNavigateToCalendar={onNavigateToCalendar} 
                      onOpenBroadcastModal={(v) => setSelectedBroadcastModalVideo(v)}
                    />
                  </React.Fragment>
                );
              })}
              
              {recommended.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
                  <YoutubeLogo className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>조건에 맞는 추천 영상을 찾을 수 없습니다.</p>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-1 sm:gap-2 mt-8">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - (isMobile ? 5 : 10)))}
                  disabled={currentPage <= (isMobile ? 5 : 10)}
                  className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm font-semibold"
                >
                  &lt;&lt;
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm font-semibold"
                >
                  &lt;
                </button>
                
                <div className="flex gap-1">
                  {(() => {
                    const blockSize = isMobile ? 5 : 10;
                    const currentBlock = Math.floor((currentPage - 1) / blockSize);
                    const startPage = currentBlock * blockSize + 1;
                    const endPage = Math.min(startPage + blockSize - 1, totalPages);
                    
                    return Array.from({ length: endPage - startPage + 1 }).map((_, i) => {
                      const page = startPage + i;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                            currentPage === page 
                              ? 'bg-purple-600 text-white border border-purple-600' 
                              : 'border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    });
                  })()}
                </div>

                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm font-semibold"
                >
                  &gt;
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + (isMobile ? 5 : 10)))}
                  disabled={currentPage > totalPages - (isMobile ? 5 : 10)}
                  className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm font-semibold"
                >
                  &gt;&gt;
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 푸터 바로 윗부분: 과거 데이터 안내문구 */}
      <div className="mt-8 p-5 rounded-[24px] bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-2 leading-relaxed">
        <div>
          <strong className="text-zinc-700 dark:text-zinc-300">과거 데이터 안내:</strong> 본 사이트의 데이터 중 {firstYear}~2025년 데이터는 스프레드시트 기록을 변환한 것으로, 파일 변환 시에 누락된 데이터나 잘못된 정보가 포함되어 있을 수 있습니다. (또한 {firstYear}~2025년 데이터에는 쇼츠 영상 정보가 포함되지 않습니다)
        </div>
      </div>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 mt-8 text-center text-zinc-500 dark:text-zinc-500 text-sm">
        <p className="mt-1 text-xs">※ 최신순 영상의 정렬 기준은 방송일(생방일)입니다.</p>
      </footer>
    </div>
  );
}
