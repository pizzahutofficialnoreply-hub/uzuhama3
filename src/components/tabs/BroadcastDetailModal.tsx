import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Layers, Calendar, ExternalLink, ArrowLeft } from 'lucide-react';
import { cn } from '../../utils';
import { extractYoutubeId } from '../../utils/urlUtils';

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

interface BroadcastDetailModalProps {
  video: any;
  allLogs?: Record<string, any> | any[];
  onClose: () => void;
  onNavigateToCalendar?: (dateStr: string) => void;
}

const getKoreanDayOfWeek = (dateStr: string): string => {
  try {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return days[d.getDay()] || '';
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : (days[d.getDay()] || '');
  } catch {
    return '';
  }
};

export const BroadcastDetailModal: React.FC<BroadcastDetailModalProps> = ({
  video,
  allLogs,
  onClose,
  onNavigateToCalendar,
}) => {
  const isCompilation = !!(video.isCompilation || video.compilationId);
  const logsList = useMemo(() => {
    return allLogs ? (Array.isArray(allLogs) ? allLogs : Object.values(allLogs || {})) : [];
  }, [allLogs]);

  // 방송일 순서 추출 (몰아보기 지정 순서 반영)
  const broadcastDates = useMemo(() => {
    if (isCompilation && Array.isArray(video.games) && video.games.length > 0) {
      const datesFromGames: string[] = [];

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
  }, [video, isCompilation, logsList]);

  // 화면 크기 감지: 모바일 5개, PC 8개
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 화면 크기 및 열에 맞춰 8개~9개 유동 조정 (2열 화면 8개, 3열 화면 9개)
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
      setItemsPerPage(width >= 768 && width < 1024 ? 8 : 9);
    };
    handleItemsResize();
    window.addEventListener('resize', handleItemsResize);
    return () => window.removeEventListener('resize', handleItemsResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(broadcastDates.length / itemsPerPage));
  const [currentPage, setCurrentPage] = useState(1);

  // 페이지 바운드 보호
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const currentDates = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return broadcastDates.slice(start, start + itemsPerPage);
  }, [broadcastDates, currentPage, itemsPerPage]);

  const containerRef = useRef<HTMLDivElement>(null);

  // ESC 키 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 커버 뷰 마운트 시 카드 영역 상단으로 부드럽게 스크롤
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = Math.max(0, rect.top + scrollTop - 80);
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="w-full rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-2"
    >
      {/* 1. 상단 컨트롤 바: X 닫기 버튼 */}
      <div className="px-4 sm:px-6 py-3 flex items-center justify-end border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. 대상 영상 요약 배너: 강조색이 가미된 세련된 배너 */}
      <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-purple-50/30 dark:bg-purple-950/20">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* 아이콘: 몰아보기 시 보라빛 강조색 */}
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs border",
            isCompilation
              ? "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-700/80"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-700/80"
          )}>
            {isCompilation ? (
              <Layers className="w-5 h-5" />
            ) : (
              <PlaySquare className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={video.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-base sm:text-lg text-zinc-900 dark:text-white truncate hover:underline flex items-center gap-1.5 hover:text-purple-600 dark:hover:text-purple-400"
                title={video.videoTitle}
              >
                <span className="truncate">{video.videoTitle}</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn(
                "text-[11px] font-semibold px-2.5 py-0.5 rounded-md border",
                isCompilation
                  ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200/70 dark:border-zinc-700/70"
              )}>
                {isCompilation ? '몰아보기 연동' : '영상 연동'} · 총 {broadcastDates.length}개 생방송
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                페이지당 9개씩 표시
              </span>
            </div>
          </div>
        </div>

        {video.videoUrl && (
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 transition-colors shadow-2xs shrink-0 w-full sm:w-auto cursor-pointer active:scale-95"
          >
            <YoutubeLogo className="w-4 h-4 text-white" />
            <span>유튜브 영상 보기</span>
          </a>
        )}
      </div>

      {/* 3. 본문: 한 생방당 한 카드 (PC 9개 그리드, 모바일 9개 스택) */}
      <div className="p-4 sm:p-6 bg-black">
        <div className={
          isMobile
            ? 'flex flex-col gap-3.5'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        }>
            {currentDates.map((dateStr, idx) => {
              const formattedDate = dateStr.replace(/-/g, '.');
              const dayOfWeek = getKoreanDayOfWeek(dateStr);
              const matchedLog = logsList.find((l: any) => l.date === dateStr) || (video.parentLog?.date === dateStr ? video.parentLog : null);

              // 1. 업로드된 개별 영상 (몰아보기 본체 및 몰아보기 영상은 완전 제외)
              const dayVideos: Array<{ title: string; url: string; ytId: string | null }> = [];
              const seenVideoUrls = new Set<string>();

              const addDayVideo = (title: string, url: string) => {
                const cleanUrl = url?.trim();
                if (!cleanUrl || seenVideoUrls.has(cleanUrl)) return;
                const lowerTitle = (title || '').toLowerCase();
                // 몰아보기 영상 완전 제외
                if (lowerTitle.includes('몰아보기')) return;
                if (isCompilation && cleanUrl === video.videoUrl) return;

                seenVideoUrls.add(cleanUrl);
                const ytId = extractYoutubeId(cleanUrl);
                dayVideos.push({ title: title?.trim() || '개별 편집본 영상', url: cleanUrl, ytId });
              };

              if (isCompilation) {
                // 해당 날짜 로그의 개별 편집본만 수집
                if (Array.isArray(matchedLog?.edited)) {
                  matchedLog.edited.forEach((edit: any) => {
                    if (!edit.isCompilation && !edit.compilationId && !edit.title?.includes('몰아보기') && edit.url !== video.videoUrl) {
                      addDayVideo(edit.title || '우주하마 개별 영상', edit.url);
                    }
                  });
                }
              } else {
                // 일반 영상: 영상 자체가 몰아보기가 아닐 때만 포함
                if (video.videoUrl && !video.videoTitle?.includes('몰아보기')) {
                  addDayVideo(video.videoTitle || '우주하마 영상', video.videoUrl);
                }
                if (Array.isArray(matchedLog?.edited)) {
                  matchedLog.edited.forEach((edit: any) => {
                    if (!edit.isCompilation && !edit.compilationId && !edit.title?.includes('몰아보기') && edit.url && edit.url !== video.videoUrl) {
                      addDayVideo(edit.title || '우주하마 개별 영상', edit.url);
                    }
                  });
                }
              }

              // 2. 진행한 게임
              const dayGames: Array<{ name: string; link?: string; category?: string }> = [];
              const seenGameNames = new Set<string>();

              const addDayGame = (g: any) => {
                if (!g) return;
                const name = (typeof g === 'string' ? g : g.name)?.trim();
                const link = (typeof g === 'string' ? '' : g.link)?.trim() || '';
                const category = typeof g === 'string' ? '' : (g.category?.trim() || '');
                if (name && !seenGameNames.has(name.toLowerCase())) {
                  seenGameNames.add(name.toLowerCase());
                  dayGames.push({ name, link, category });
                }
              };

              if (isCompilation && Array.isArray(video.games)) {
                video.games.forEach((g: any) => {
                  if (g.date === dateStr) addDayGame(g);
                });
              }
              if (Array.isArray(matchedLog?.games)) {
                matchedLog.games.forEach((g: any) => {
                  let link = g.link;
                  if (isCompilation && Array.isArray(video.games)) {
                    const vg = video.games.find((x: any) => x.name === g.name);
                    if (vg?.link) link = vg.link;
                  }
                  addDayGame({ ...g, link });
                });
              } else if (matchedLog?.game) {
                addDayGame({ name: matchedLog.game, link: '', category: matchedLog.category });
              }

              // 3. 생방송 VOD 링크
              const dayVods: string[] = [];
              if (Array.isArray(matchedLog?.vods)) {
                matchedLog.vods.forEach((v: any) => {
                  const u = (typeof v === 'string' ? v : v?.url)?.trim();
                  if (u && !dayVods.includes(u)) dayVods.push(u);
                });
              }
              if (matchedLog?.vodUrl) {
                const u = matchedLog.vodUrl.trim();
                if (u && !dayVods.includes(u)) dayVods.push(u);
              }

              // 4. 쇼츠
              const dayShorts: Array<{ title: string; url: string }> = [];
              const seenShortsUrls = new Set<string>();

              if (Array.isArray(matchedLog?.shorts)) {
                matchedLog.shorts.forEach((s: any) => {
                  const url = (typeof s === 'string' ? s : s?.url)?.trim();
                  if (url && !seenShortsUrls.has(url)) {
                    seenShortsUrls.add(url);
                    const title = typeof s === 'string' ? '' : (s?.title?.trim() || '쇼츠');
                    dayShorts.push({ title, url });
                  }
                });
              }

              const primaryVideo = dayVideos[0];
              const primaryYtId = primaryVideo?.ytId || (dayVods[0] ? extractYoutubeId(dayVods[0]) : null);
              const primaryUrl = primaryVideo?.url || dayVods[0] || (dayShorts[0]?.url) || '#';
              const displayTitle = primaryVideo?.title || (matchedLog?.game ? `${matchedLog.game} 방송` : `${formattedDate} 생방송`);

              return (
                <div
                  key={dateStr}
                  className="group flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1"
                >
                  {/* 상단 16:9 썸네일 영역 (추천 영상 카드와 동일한 규격 및 인터랙션) */}
                  <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {/* 좌상단 순서 숫자 표기 (1, 2, 3...) */}
                    <div className="absolute top-2.5 left-2.5 z-20 pointer-events-none">
                      <span className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-lg bg-black/80 backdrop-blur-xs text-white font-bold text-xs font-mono border border-white/15 shadow-md">
                        {idx + 1}
                      </span>
                    </div>

                    <a
                      href={primaryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full h-full relative"
                    >
                      {primaryYtId ? (
                        <img
                          src={`https://img.youtube.com/vi/${primaryYtId}/mqdefault.jpg`}
                          alt={displayTitle}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-900/30 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center text-purple-400 group-hover:scale-105 transition-transform duration-500">
                          <PlaySquare className="w-10 h-10 opacity-70" />
                          <span className="text-xs font-semibold mt-2 text-zinc-300">생방송 다시보기</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
                    </a>

                    {/* 우측 하단 생방일 뱃지 (추천 영상 카드와 동일한 배치 및 클릭 시 달력 이동) */}
                    <div className="absolute bottom-2 right-2 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onNavigateToCalendar) {
                            onNavigateToCalendar(dateStr);
                            onClose();
                          }
                        }}
                        className="bg-black/80 hover:bg-black/95 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1 cursor-pointer transition-colors shadow-sm select-none"
                        title="해당 날짜 방송 기록으로 이동"
                      >
                        <Calendar className="w-3 h-3 text-purple-400" />
                        <span>생방일: {formattedDate} {dayOfWeek ? `(${dayOfWeek})` : ''}</span>
                      </button>
                    </div>
                  </div>

                  {/* 카드 본문 (추천 영상 카드와 동일한 구조) */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={primaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex-1 text-sm sm:text-base"
                        title={displayTitle}
                      >
                        {displayTitle}
                      </a>
                    </div>

                    {/* 게임 태그 목록 */}
                    {dayGames.length > 0 && (
                      <div className="mt-3 mb-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dayGames.map((g, gIdx) => {
                            const hasSeparateCategory = g.category && g.category.trim() !== '' && g.category.trim().toLowerCase() !== g.name.trim().toLowerCase() && g.category !== '종합';
                            const gameContent = (
                              <span className={cn(
                                "px-2 py-0.5 text-[10px] rounded-full select-none inline-flex items-center gap-1",
                                g.link
                                  ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
                                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                              )}>
                                <span>{g.name}</span>
                                {hasSeparateCategory && (
                                  <span className="opacity-60 font-normal border-l border-current pl-1">
                                    {g.category}
                                  </span>
                                )}
                              </span>
                            );

                            return g.link ? (
                              <a key={gIdx} href={g.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`${g.name} 정보 보기`}>
                                {gameContent}
                              </a>
                            ) : (
                              <div key={gIdx}>{gameContent}</div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 하단 액션 버튼 그룹 */}
                    <div className="mt-auto pt-4 flex flex-col gap-2 relative">
                      {/* 영상 보기 버튼 (빨간색 유튜브 스타일) */}
                      {dayVideos.length > 0 && dayVideos[0].url && (
                        <a
                          href={dayVideos[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all shadow-2xs bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:scale-[1.01]"
                        >
                          <YoutubeLogo className="w-4 h-4" />
                          <span>영상 보기</span>
                        </a>
                      )}

                      {/* 생방송 풀영상 다시보기 및 쇼츠 버튼 */}
                      {(dayVods.length > 0 || dayShorts.length > 0) && (
                        <div className="flex gap-2">
                          {dayVods.length > 0 && (
                            <a
                              href={dayVods[0]}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20"
                            >
                              <PlaySquare className="w-4 h-4" />
                              <span>{dayVods.length > 1 ? '생방송 (1부)' : '생방송 (풀영상)'}</span>
                            </a>
                          )}

                          {dayShorts.length > 0 && (
                            <a
                              href={dayShorts[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                            >
                              <ShortsIcon className="w-4 h-4" />
                              <span>쇼츠 ({dayShorts.length})</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {currentDates.length === 0 && (
            <div className="py-16 text-center text-zinc-400">
              연동된 생방 정보를 찾을 수 없습니다.
            </div>
          )}
        </div>

        {/* 하단 페이지네이션: 단정하고 모던한 버튼 */}
        {totalPages > 1 && (
          <div className="px-4 py-3.5 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 flex justify-center items-center gap-1 sm:gap-2">
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
                      className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        currentPage === page 
                          ? 'bg-purple-600 text-white border border-purple-600 shadow-2xs' 
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

        {/* 하단 보조 돌아가기 바 */}
        <div className="px-4 sm:px-6 py-3.5 bg-zinc-50/50 dark:bg-black border-t border-zinc-200/60 dark:border-zinc-800 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-2xs active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>추천 영상 목록으로 돌아가기</span>
          </button>
        </div>
    </div>
  );
};
