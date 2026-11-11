import { toInternal } from '../utils/internalLink';
import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, X, Info, AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { NoticeItem, NoticeLink } from '../types';
import { formatNoticeText } from '../App';
import { cn } from '../utils';
import { plainText } from './common/RichTextRenderer';

export type BannerColorTheme = 'default' | 'yellow' | 'green';

export interface BannerDisplayItem {
  id: string;
  type: 'notice' | 'maintenance_upcoming' | 'maintenance_completed';
  title: string;
  content?: string;
  markdownContent?: string;
  color: BannerColorTheme;
  badgeText: string;
  links?: NoticeLink[];
  dismissable?: boolean;
  dismissMode?: 'session' | 'permanent';
}

interface NoticeBannerProps {
  notices: NoticeItem[];
  fallbackContent?: string;
  maintenanceUpcoming?: {
    title?: string;
    text: string;
  } | null;
  maintenanceCompleted?: {
    title?: string;
    markdown: string;
  } | null;
  onNavigateInternal?: (url: string) => void;
  activeTab?: string;
  isHeaderHidden?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  systemDismissMode?: 'session' | 'permanent';
  defaultPrefix?: string;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({ 
  notices, 
  fallbackContent,
  maintenanceUpcoming,
  maintenanceCompleted,
  onNavigateInternal,
  activeTab,
  isHeaderHidden = false,
  onExpandedChange,
  systemDismissMode = 'session',
  defaultPrefix
}) => {
  const basePrefix = (defaultPrefix || '').trim() || '[공지]';
  // 1. 일회성 표시 (permanent): localStorage 저장
  const [permanentDismissedIds, setPermanentDismissedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('uzuhama_dismissed_banners');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. 세션 표시 (session): sessionStorage 저장
  const [sessionDismissedIds, setSessionDismissedIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('uzuhama_session_dismissed_banners');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [isSliding, setIsSliding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const bannerContainerRef = useRef<HTMLDivElement>(null);
  const wasExpandedRef = useRef(false);

  // 슬라이드 전환 시 부드러운 모션 블러 효과 트리거
  useEffect(() => {
    setIsSliding(true);
    const timer = setTimeout(() => setIsSliding(false), 360);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  // 공지 펼쳤다가 닫으면 원래 공지 펼친 지점으로 부드럽게 스크롤 복귀
  // 공지 열고 닫을 때 자동 스크롤 없음 (사용자 위치 유지)
  useEffect(() => {
    wasExpandedRef.current = isExpanded;
  }, [isExpanded]);

  // 통합 배너 목록 생성
  const displayItems: BannerDisplayItem[] = [];

  // (1) 점검 예고 공지 (노란색)
  if (maintenanceUpcoming?.text && !sessionDismissedIds.includes('maint-upcoming')) {
    displayItems.push({
      id: 'maint-upcoming',
      type: 'maintenance_upcoming',
      title: maintenanceUpcoming.title?.trim() || '시스템 점검 예정 안내',
      content: maintenanceUpcoming.text,
      color: 'yellow',
      badgeText: '[점검 예고]',
      dismissable: true,
      dismissMode: 'session'
    });
  }

  // (2) 점검 완료 공지 (초록색)
  if (maintenanceCompleted?.markdown && !sessionDismissedIds.includes('maint-completed')) {
    displayItems.push({
      id: 'maint-completed',
      type: 'maintenance_completed',
      title: maintenanceCompleted.title?.trim() || '시스템 점검 완료 및 업데이트 안내',
      markdownContent: maintenanceCompleted.markdown,
      color: 'green',
      badgeText: '[점검 완료]',
      dismissable: true,
      dismissMode: 'session'
    });
  }

  // (3) 일반 공지사항 (기존 보라색 띠 공지 색상 유지)
  const activeRegularNotices = notices.filter(n => {
    const mode = n.dismissMode || systemDismissMode || 'session';
    if (mode === 'permanent') {
      return !permanentDismissedIds.includes(n.id);
    }
    return !sessionDismissedIds.includes(n.id);
  });

  activeRegularNotices.forEach(n => {
    displayItems.push({
      id: n.id,
      type: 'notice',
      title: plainText(n.title) || '공지사항',
      content: n.content,
      links: (n.links && n.links.length > 0)
        ? n.links
        : (n.linkUrl ? [{ url: n.linkUrl, title: n.linkText || '자세히 보기' }] : []),
      color: 'default',
      badgeText: (n.prefix || '').trim() || basePrefix,
      dismissable: true,
      dismissMode: n.dismissMode || systemDismissMode
    });
  });

  // (4) fallback 단문 공지
  if (displayItems.length === 0 && fallbackContent && !sessionDismissedIds.includes('fallback-notice')) {
    displayItems.push({
      id: 'fallback-notice',
      type: 'notice',
      title: '공지사항',
      content: fallbackContent,
      color: 'default',
      badgeText: basePrefix,
      dismissable: true,
      dismissMode: 'session'
    });
  }

  const totalItems = displayItems.length;

  // 인덱스 범위 보정
  const safeIndex = totalItems > 0 ? ((currentIndex % totalItems) + totalItems) % totalItems : 0;
  const currentItem = displayItems[safeIndex];

  // 부모 컴포넌트에 펼침 상태 알림
  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  // 검색 탭 진입 시 자동으로 펼침 해제
  const isSearchTab = activeTab === 'recommend';
  useEffect(() => {
    if (isSearchTab && isExpanded) {
      setIsExpanded(false);
    }
  }, [isSearchTab, isExpanded]);

  // 여러 개일 때: 펼치기가 아닐 시 5초마다 자동 넘기기 (부드러운 슬라이드 애니메이션 및 모션 블러)
  useEffect(() => {
    if (totalItems <= 1 || isExpanded || isSearchTab) return;

    const timer = window.setInterval(() => {
      setSlideDirection(1);
      setIsSliding(true);
      setCurrentIndex(prev => (prev + 1) % totalItems);
      window.setTimeout(() => setIsSliding(false), 420);
    }, 9000); // 자동 넘김 간격 (머무는 시간 9초)

    return () => window.clearInterval(timer);
  }, [totalItems, isExpanded, isSearchTab]);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (totalItems <= 1) return;
    setSlideDirection(-1);
    setIsSliding(true);
    setCurrentIndex(prev => (prev - 1 + totalItems) % totalItems);
    setIsExpanded(false);
    window.setTimeout(() => setIsSliding(false), 420);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (totalItems <= 1) return;
    setSlideDirection(1);
    setIsSliding(true);
    setCurrentIndex(prev => (prev + 1) % totalItems);
    setIsExpanded(false);
    window.setTimeout(() => setIsSliding(false), 420);
  };

  const handleSelectIndex = (idx: number) => {
    if (idx === safeIndex || totalItems <= 1) return;
    setSlideDirection(idx > safeIndex ? 1 : -1);
    setIsSliding(true);
    setCurrentIndex(idx);
    setIsExpanded(false);
    window.setTimeout(() => setIsSliding(false), 420);
  };

  const collapseBanner = () => {
    setIsHovered(false);
    setIsExpanded(false);
  };

  const toggleExpand = () => {
    setIsHovered(false);
    if (isExpanded) {
      collapseBanner();
    } else {
      setIsExpanded(true);
    }
  };

  const handleDismiss = (item: BannerDisplayItem) => {
    const id = item.id;
    const mode = item.dismissMode || systemDismissMode;

    if (mode === 'permanent') {
      const next = [...permanentDismissedIds, id];
      setPermanentDismissedIds(next);
      try {
        localStorage.setItem('uzuhama_dismissed_banners', JSON.stringify(next));
      } catch {}
    } else {
      const next = [...sessionDismissedIds, id];
      setSessionDismissedIds(next);
      try {
        sessionStorage.setItem('uzuhama_session_dismissed_banners', JSON.stringify(next));
      } catch {}
    }

    setIsExpanded(false);
    if (safeIndex >= totalItems - 1) {
      setCurrentIndex(0);
    }
  };

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url) return;

    const trimmed = url.trim();
    const internal = toInternal(trimmed);
    if (internal && onNavigateInternal) {
      onNavigateInternal(internal);
      return;
    }
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  };

  if (totalItems === 0 || !currentItem) {
    return null;
  }

  // 테마 색상 클래스 계산
  const getThemeClasses = (color: BannerColorTheme) => {
    if (color === 'yellow') {
      return {
        wrapperBorder: 'border-amber-400/70 dark:border-amber-500/60',
        wrapperBg: 'bg-amber-500/15 dark:bg-amber-500/20',
        text: 'text-amber-950 dark:text-amber-100',
        badge: 'text-amber-700 dark:text-amber-300',
        iconBg: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        linkBtn: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100',
        arrowBtn: 'text-amber-800/80 dark:text-amber-200/80 hover:text-amber-950 dark:hover:text-white hover:bg-amber-500/20',
        closeBtn: 'text-amber-700/80 hover:text-amber-950 dark:text-amber-300/80 dark:hover:text-white hover:bg-amber-500/20',
        borderDivider: 'border-amber-500/30 dark:border-amber-400/30'
      };
    }
    if (color === 'green') {
      return {
        wrapperBorder: 'border-emerald-500/60 dark:border-emerald-400/50',
        wrapperBg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        text: 'text-emerald-950 dark:text-emerald-100',
        badge: 'text-emerald-700 dark:text-emerald-300',
        iconBg: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
        icon: <Check className="w-3.5 h-3.5" />,
        linkBtn: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-100',
        arrowBtn: 'text-emerald-800/80 dark:text-emerald-200/80 hover:text-emerald-950 dark:hover:text-white hover:bg-emerald-500/20',
        closeBtn: 'text-emerald-700/80 hover:text-emerald-950 dark:text-emerald-300/80 dark:hover:text-white hover:bg-emerald-500/20',
        borderDivider: 'border-emerald-500/30 dark:border-emerald-400/30'
      };
    }
    // default (기존 보라색 띠 공지 색상)
    return {
      wrapperBorder: 'border-purple-500/35 dark:border-purple-400/30',
      wrapperBg: 'bg-purple-500/10 dark:bg-purple-500/15',
      text: 'text-purple-950 dark:text-purple-100',
      badge: 'text-purple-700 dark:text-purple-300',
      iconBg: 'bg-purple-600/15 dark:bg-purple-400/20 text-purple-600 dark:text-purple-300',
      icon: <Info className="w-3.5 h-3.5" />,
      linkBtn: 'bg-purple-500/15 dark:bg-purple-400/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300',
      arrowBtn: 'text-purple-700/80 dark:text-purple-300/80 hover:text-purple-950 dark:hover:text-white hover:bg-purple-500/15',
      closeBtn: 'text-purple-600/70 hover:text-purple-900 dark:text-purple-300/70 dark:hover:text-white hover:bg-purple-500/15',
      borderDivider: 'border-purple-500/20 dark:border-purple-400/20'
    };
  };

  const theme = getThemeClasses(currentItem.color);

  return (
    <>
      {/* 1. 상단 고정 헤더 역할 (스크롤로 메인 헤더가 숨겨진 상태에서 펼쳐졌을 때) */}
      <AnimatePresence>
        {!isSearchTab && isExpanded && isHeaderHidden && (
          <div
            key="pinned-notice-wrapper"
            className="fixed inset-x-0 z-50 pointer-events-none"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            }}
          >
            <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8">
              <motion.div
                key={`pinned-notice-${currentItem.id}`}
                initial={{ opacity: 0, filter: 'blur(3px)', scale: 0.99 }}
                animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, filter: 'blur(3px)', scale: 0.99 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm shadow-md",
                  theme.wrapperBorder,
                  theme.wrapperBg,
                  theme.text
                )}
              >
                <div className="flex items-center justify-between gap-2 min-h-[28px]">
                  <div 
                    onClick={collapseBanner}
                    className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden cursor-pointer select-none"
                    title="공지 접기"
                  >
                    <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0", theme.iconBg)}>
                      {theme.icon}
                    </span>
                    <span className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm truncate flex-1 min-w-0">
                      <span className={cn("font-black mr-1.5", theme.badge)}>{currentItem.badgeText}</span>
                      {currentItem.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
                    {(currentItem.links || []).map((link, lIdx) => (
                      <button
                        key={lIdx}
                        type="button"
                        onClick={(e) => handleLinkClick(e, link.url)}
                        className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 transition-all cursor-pointer", theme.linkBtn)}
                      >
                        <span>{link.title || '바로가기'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={collapseBanner}
                      className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all cursor-pointer", theme.arrowBtn)}
                    >
                      <motion.span animate={{ rotate: 180 }}>
                        <ChevronDown className="w-4 h-4" />
                      </motion.span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDismiss(currentItem)}
                      className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all cursor-pointer", theme.closeBtn)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. 본문 띠 공지 배너 */}
      <AnimatePresence>
        {!isSearchTab && (
          <motion.div
            key="notice-banner-container-wrapper"
            id="notice-banner-container"
            ref={bannerContainerRef}
            onMouseEnter={() => {
              if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
                setIsHovered(true);
              }
            }}
            onMouseLeave={() => setIsHovered(false)}
            onTouchEnd={() => setIsHovered(false)}
            onTouchCancel={() => setIsHovered(false)}
            initial={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
            animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
            exit={{ 
              height: 0, 
              opacity: 0, 
              filter: 'blur(3px)',
              overflow: 'hidden',
              transition: { 
                height: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.25 },
                filter: { duration: 0.25 }
              }
            }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full relative z-40 bg-zinc-50/70 dark:bg-black/50 border-b border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-2 sm:px-5 lg:px-8 py-2 sm:py-2.5 flex items-start gap-1.5">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              
              {/* 공지 카드 본문: 다음 공지가 바로 옆에 붙어있는 연속 트랙 및 부드러운 모션 블러 전환 */}
              <div className="w-full min-w-0 overflow-hidden relative rounded-xl">
                <motion.div
                  className="flex items-start w-full"
                  style={{ willChange: 'transform, filter' }}
                  animate={{ 
                    x: `-${safeIndex * 100}%`,
                    filter: isSliding ? 'blur(2.5px)' : 'blur(0px)'
                  }}
                  transition={{ 
                    x: { type: "spring", stiffness: 280, damping: 28, mass: 0.75 },
                    filter: { duration: 0.32, ease: "easeOut" }
                  }}
                  drag={totalItems > 1 && !isExpanded ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.88}
                  onDragStart={() => setIsSliding(true)}
                  onDragEnd={(_, info) => {
                    setIsSliding(true);
                    if (Math.abs(info.offset.x) > 30 || Math.abs(info.velocity.x) > 180) {
                      if (info.offset.x < 0) {
                        handleNext();
                      } else {
                        handlePrev();
                      }
                    }
                    window.setTimeout(() => setIsSliding(false), 380);
                  }}
                >
                  {displayItems.map((item, idx) => {
                    const itemTheme = getThemeClasses(item.color);
                    const isItemActive = idx === safeIndex;

                    return (
                      <div key={item.id} className="w-full min-w-full shrink-0">
                        <div
                          className={cn(
                            "relative overflow-hidden rounded-xl border backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm shadow-xs transition-colors duration-300",
                            totalItems > 1 && !isExpanded ? "cursor-grab active:cursor-grabbing touch-pan-y" : "",
                            itemTheme.wrapperBorder,
                            itemTheme.wrapperBg,
                            itemTheme.text
                          )}
                        >
                          {/* 첫 줄: 오직 제목만 깔끔하게 1줄로 표시 */}
                          <div className="flex items-center justify-between gap-2 min-h-[28px]">
                            {/* 좌측: 아이콘 + [배지] + 제목 */}
                            <div 
                              onClick={toggleExpand}
                              className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden cursor-pointer select-none"
                              title={isExpanded ? "공지 접기" : "공지 펼쳐보기"}
                            >
                              <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0", itemTheme.iconBg)}>
                                {itemTheme.icon}
                              </span>

                              <span className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm truncate flex-1 min-w-0">
                                <span className={cn("font-black mr-1.5", itemTheme.badge)}>{item.badgeText}</span>
                                {item.title}
                              </span>
                            </div>

                            {/* 우측 조작부 */}
                            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
                              {/* 다중 공지 번호 인디케이터 */}
                              {totalItems > 1 && (
                                <span className="text-[10px] sm:text-xs font-bold opacity-60 mr-1 select-none">
                                  {idx + 1}/{totalItems}
                                </span>
                              )}

                              {(item.links || []).map((link, lIdx) => (
                                <React.Fragment key={lIdx}>
                                  <button
                                    type="button"
                                    onClick={(e) => handleLinkClick(e, link.url)}
                                    aria-label={link.title || '링크 바로가기'}
                                    title={link.title || '링크 바로가기'}
                                    className={cn("sm:hidden inline-flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all shrink-0 cursor-pointer", itemTheme.linkBtn)}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => handleLinkClick(e, link.url)}
                                    className={cn("hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 transition-all shrink-0 cursor-pointer", itemTheme.linkBtn)}
                                  >
                                    <span>{link.title || '바로가기'}</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </React.Fragment>
                              ))}

                              {/* 펼치기/접기 버튼 */}
                              <button
                                type="button"
                                onClick={toggleExpand}
                                aria-label={isExpanded ? "내용 접기" : "내용 펼쳐보기"}
                                title={isExpanded ? "접기" : "내용 펼쳐보기"}
                                className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all cursor-pointer shrink-0", itemTheme.arrowBtn)}
                              >
                                <motion.span
                                  animate={{ rotate: isExpanded && isItemActive ? 180 : 0 }}
                                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                  className="inline-flex items-center justify-center pointer-events-none"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </motion.span>
                              </button>

                              {/* 닫기 버튼 */}
                              <button
                                type="button"
                                onClick={() => handleDismiss(item)}
                                aria-label="공지 닫기"
                                title="공지 닫기"
                                className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all cursor-pointer shrink-0", itemTheme.closeBtn)}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* 펼쳐보기 영역 */}
                          <AnimatePresence initial={false}>
                            {isExpanded && isItemActive && (
                              <motion.div
                                key={`expanded-${item.id}`}
                                initial={{ opacity: 0, height: 0, filter: 'blur(2px)' }}
                                animate={{ 
                                  opacity: 1, 
                                  height: 'auto',
                                  filter: 'blur(0px)',
                                  transition: {
                                    height: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                                    opacity: { duration: 0.24, delay: 0.04 },
                                    filter: { duration: 0.24 }
                                  }
                                }}
                                exit={{ 
                                  opacity: 0, 
                                  height: 0, 
                                  filter: 'blur(2px)',
                                  transition: {
                                    height: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
                                    opacity: { duration: 0.16 },
                                    filter: { duration: 0.16 }
                                  }
                                }}
                                className="overflow-hidden"
                              >
                                <div className={cn("pt-2.5 mt-2 border-t text-xs sm:text-sm font-medium leading-relaxed text-zinc-900 dark:text-zinc-100 select-text", itemTheme.borderDivider)}>
                                  {item.markdownContent ? (
                                    <div className="prose dark:prose-invert prose-xs text-xs sm:text-sm max-w-none prose-h3:text-sm prose-h3:font-bold prose-h3:mb-1.5 prose-h3:mt-2 prose-ul:my-1.5 prose-li:my-0.5 prose-p:my-1">
                                      <ReactMarkdown>
                                        {item.markdownContent}
                                      </ReactMarkdown>
                                    </div>
                                  ) : (
                                    <div className="whitespace-pre-wrap break-keep">
                                      {formatNoticeText(item.content || item.title)}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </div>

              {/* 공지 여러 개일 때: 하단 작은 점(Dots) 인디케이터로 부드러운 전환 지원 */}
              {totalItems > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-0.5 pb-0.5 select-none">
                  {displayItems.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectIndex(idx)}
                      aria-label={`${idx + 1}번째 공지 보기`}
                      aria-current={idx === safeIndex ? 'true' : undefined}
                      title={`${idx + 1}/${totalItems} ${item.title}`}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300 cursor-pointer touch-manipulation",
                        idx === safeIndex
                          ? (item.color === 'yellow' ? "w-4 bg-amber-500" : item.color === 'green' ? "w-4 bg-emerald-500" : "w-4 bg-purple-600 dark:bg-purple-400")
                          : "w-1.5 bg-zinc-300/80 hover:bg-zinc-400 dark:bg-zinc-700/80 dark:hover:bg-zinc-600"
                      )}
                    />
                  ))}
                </div>
              )}

            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
