import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BroadcastLog } from '../../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { 
  Search, 
  ArrowUpDown, 
  ChevronDown, 
  X,
  ExternalLink,
  Calendar
} from 'lucide-react';
import { cn, fuzzyKoreanMatch } from '../../utils';
import { WidgetShareButton } from '../common/WidgetShareButton';
import { StatInsightSummary } from './StatInsightSummary';

interface CategoryStatsTabProps {
  logs: BroadcastLog[];
  isActive?: boolean;
  onNavigateToCalendar?: (dateStr: string) => void;
  onNavigateToRecommend?: (category?: string, searchTerm?: string) => void;
}

interface CategoryData {
  name: string;
  count: number;
  share: number;
  estimatedHours: number;
  games: { name: string; link?: string; count: number; latestDate?: string }[];
  color: string;
}

// 부드럽고 눈에 편한 파스텔톤 팔레트
const PASTEL_PALETTE = [
  '#a78bfa', // pastel violet (메인 테마 보라)
  '#93c5fd', // pastel blue
  '#6ee7b7', // pastel emerald
  '#fcd34d', // pastel amber
  '#f472b6', // pastel pink
  '#818cf8', // pastel indigo
  '#5eead4', // pastel teal
  '#fdba74', // pastel orange
  '#c084fc', // pastel purple
  '#67e8f9', // pastel cyan
  '#bef264', // pastel lime
  '#cbd5e1', // pastel slate
];

const CategoryPieTooltip = ({ active, payload }: any) => {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<any>(null);
  const currentKeyRef = useRef<string>('');

  const dataKey = (active && payload && payload.length)
    ? `${payload[0]?.name || ''}_${payload[0]?.value}`
    : '';

  useEffect(() => {
    if (active && payload && payload.length) {
      if (currentKeyRef.current !== dataKey) {
        currentKeyRef.current = dataKey;
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 2200);
      }
    } else {
      if (currentKeyRef.current !== '') {
        currentKeyRef.current = '';
        setVisible(false);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [active, dataKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (visible && active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-zinc-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-2xl border border-zinc-700 text-xs space-y-1 pointer-events-none relative z-50">
        <div className="flex items-center gap-2 font-bold text-sm">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: d.color }}
          />
          {d.name}
        </div>
        <div className="text-zinc-300">
          플레이 횟수: <span className="text-white font-bold">{d.value}회</span>
        </div>
        <div className="text-zinc-300">
          비율: <span className="text-purple-300 font-bold">{d.share.toFixed(1)}%</span>
        </div>
        <div className="text-zinc-300">
          누적 시간: <span className="text-zinc-100 font-bold">{d.hours}시간</span>
        </div>
        <div className="pt-1 text-[11px] text-purple-300 font-medium border-t border-zinc-700/60">
          클릭: 선택 / 재클릭: 추천 영상 이동
        </div>
      </div>
    );
  }
  return null;
};

export function CategoryStatsTab({ 
  logs, 
  isActive = true,
  onNavigateToCalendar,
  onNavigateToRecommend
}: CategoryStatsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'count' | 'hours' | 'games' | 'name'>('count');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedCategoryNames, setExpandedCategoryNames] = useState<Set<string>>(new Set());

  const handleCategoryClick = (catName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!catName || catName === '기타 카테고리') return;

    if (selectedCategory === catName) {
      // 이미 선택된 카테고리를 다시 클릭하면 추천 영상 탭으로 즉시 이동하여 해당 카테고리 영상 목록 확인
      onNavigateToRecommend?.(catName);
    } else {
      setSelectedCategory(catName);
    }
  };

  const handleClearCategory = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedCategory(null);
  };

  // 카테고리 및 게임 통계 집계
  const { categories, totalPlays, topCategory, totalGamesCount, topIndividualGames } = useMemo(() => {
    const catMap = new Map<string, {
      count: number;
      estimatedHours: number;
      gamesMap: Map<string, { name: string; link?: string; count: number; latestDate?: string }>;
    }>();

    const allGamesMap = new Map<string, { name: string; count: number; category: string; latestDate?: string }>();

    let playOccurrences = 0;

    // 날짜 역순 정렬로 가장 최근 날짜를 쉽게 추출
    const sortedLogs = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    sortedLogs.forEach(log => {
      if (log.isAbsence) return;

      const duration = log.durationHours || 0;
      const gameList = (log.games && log.games.length > 0)
        ? log.games
        : (log.game ? [{ name: log.game, link: '', category: log.category || '종합' }] : []);

      const durationPerGame = gameList.length > 0 ? duration / gameList.length : duration;

      gameList.forEach(g => {
        const gameName = (g.name || '').trim();
        if (!gameName) return;

        // 쉼표/슬래시 구분자 지원
        const rawCategory = g.category || log.category || '기타';
        const splitted = rawCategory
          .split(/[,/]/)
          .map(c => c.trim())
          .filter(c => c.length > 0);

        const targetCategories = splitted.length > 0 ? splitted : ['기타'];

        targetCategories.forEach(catName => {
          playOccurrences++;

          if (!catMap.has(catName)) {
            catMap.set(catName, {
              count: 0,
              estimatedHours: 0,
              gamesMap: new Map()
            });
          }

          const catEntry = catMap.get(catName)!;
          catEntry.count += 1;
          catEntry.estimatedHours += durationPerGame / targetCategories.length;

          const prevGame = catEntry.gamesMap.get(gameName);
          if (prevGame) {
            prevGame.count += 1;
            if (!prevGame.latestDate && log.date) {
              prevGame.latestDate = log.date;
            }
          } else {
            catEntry.gamesMap.set(gameName, {
              name: gameName,
              link: g.link,
              count: 1,
              latestDate: log.date
            });
          }
        });

        // 전체 게임 집계
        const existingGame = allGamesMap.get(gameName);
        if (existingGame) {
          existingGame.count += 1;
          if (!existingGame.latestDate && log.date) {
            existingGame.latestDate = log.date;
          }
        } else {
          allGamesMap.set(gameName, {
            name: gameName,
            count: 1,
            category: targetCategories[0] || '기타',
            latestDate: log.date
          });
        }
      });
    });

    const categoryList: CategoryData[] = Array.from(catMap.entries()).map(([name, val], idx) => {
      const sortedGames = Array.from(val.gamesMap.values()).sort((a, b) => b.count - a.count);
      return {
        name,
        count: val.count,
        share: playOccurrences > 0 ? (val.count / playOccurrences) * 100 : 0,
        estimatedHours: Math.round(val.estimatedHours * 10) / 10,
        games: sortedGames,
        color: PASTEL_PALETTE[idx % PASTEL_PALETTE.length]
      };
    }).sort((a, b) => b.count - a.count);

    // 상위 카테고리 파스텔 색상 할당
    categoryList.forEach((cat, index) => {
      cat.color = PASTEL_PALETTE[index % PASTEL_PALETTE.length];
    });

    const topGamesList = Array.from(allGamesMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      categories: categoryList,
      totalPlays: playOccurrences,
      topCategory: categoryList[0] || null,
      totalGamesCount: allGamesMap.size,
      topIndividualGames: topGamesList
    };
  }, [logs]);

  // 원그래프용 데이터 구성 (파스텔 톤 적용)
  const chartData = useMemo(() => {
    if (categories.length <= 8) {
      return categories.map(c => ({
        name: c.name,
        value: c.count,
        share: c.share,
        hours: c.estimatedHours,
        color: c.color
      }));
    }

    const top7 = categories.slice(0, 7);
    const others = categories.slice(7);
    const otherCount = others.reduce((acc, c) => acc + c.count, 0);
    const otherHours = others.reduce((acc, c) => acc + c.estimatedHours, 0);
    const otherShare = totalPlays > 0 ? (otherCount / totalPlays) * 100 : 0;

    return [
      ...top7.map(c => ({
        name: c.name,
        value: c.count,
        share: c.share,
        hours: c.estimatedHours,
        color: c.color
      })),
      {
        name: '기타 카테고리',
        value: otherCount,
        share: otherShare,
        hours: Math.round(otherHours * 10) / 10,
        color: '#cbd5e1'
      }
    ];
  }, [categories, totalPlays]);

  // 추천 영상 탭 스타일 초성 검색 및 텍스트 필터링
  const filteredCategories = useMemo(() => {
    let list = categories;

    if (selectedCategory) {
      list = list.filter(c => c.name === selectedCategory);
    }

    if (searchTerm.trim()) {
      list = list.filter(c => {
        if (fuzzyKoreanMatch(searchTerm, c.name)) return true;
        if (c.games.some(g => fuzzyKoreanMatch(searchTerm, g.name))) return true;
        return false;
      });
    }

    const sorted = [...list].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'count') diff = a.count - b.count;
      else if (sortBy === 'hours') diff = a.estimatedHours - b.estimatedHours;
      else if (sortBy === 'games') diff = a.games.length - b.games.length;
      else if (sortBy === 'name') diff = a.name.localeCompare(b.name, 'ko');
      return sortOrder === 'desc' ? -diff : diff;
    });

    return sorted;
  }, [categories, selectedCategory, searchTerm, sortBy, sortOrder]);

  const categoryInsight = useMemo(() => {
    if (!topCategory || totalPlays === 0) return null;
    const topGame = topIndividualGames[0];
    return (
      <span>
        가장 많이 플레이한 장르는 <strong className="text-purple-700 dark:text-purple-300 font-bold">{topCategory.name}</strong>(으)로 전체의 <strong className="font-bold">{topCategory.share.toFixed(1)}%</strong>({topCategory.count}회)를 차지하며, {topGame ? <>대표 게임은 <strong className="text-zinc-900 dark:text-white font-bold">{topGame.name}</strong>({topGame.count}회)입니다.</> : '다양한 게임들을 진행했습니다.'}
      </span>
    );
  }, [topCategory, totalPlays, topIndividualGames]);

  const toggleSort = (type: 'count' | 'hours' | 'games') => {
    if (sortBy === type) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(type);
      setSortOrder('desc');
    }
  };

  const toggleExpand = (catName: string) => {
    setExpandedCategoryNames(prev => {
      const next = new Set(prev);
      if (next.has(catName)) {
        next.delete(catName);
      } else {
        next.add(catName);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* 4대 요약 카드 (모바일 폰트 최적화로 말줄임 최소화 & 클릭 시 추천 영상 탭 이동 연동) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* 1위 최다 플레이 카테고리 -> 클릭 시 추천 영상 탭 해당 카테고리 선택 */}
        <div 
          onClick={() => {
            if (topCategory && onNavigateToRecommend) {
              onNavigateToRecommend(topCategory.name, undefined);
            }
          }}
          className={cn(
            "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-3 sm:p-4 shadow-sm flex flex-col justify-between transition-all group",
            topCategory ? "cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md" : ""
          )}
          title={topCategory ? `클릭 시 추천 영상 탭에서 "${topCategory.name}" 카테고리로 이동합니다.` : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400">
              1위 최다 플레이 카테고리
            </span>
            {topCategory && (
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" />
            )}
          </div>
          <span className="text-sm sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-white truncate my-1">
            {topCategory ? topCategory.name : '없음'}
          </span>
          <span className="text-[11px] sm:text-xs text-purple-600 dark:text-purple-400 font-medium truncate">
            {topCategory ? `${topCategory.count}회 (${topCategory.share.toFixed(1)}%)` : '-'}
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-3 sm:p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400">
            분류된 게임 카테고리 수
          </span>
          <span className="text-sm sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-white my-1">
            {categories.length}개
          </span>
          <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 truncate">
            총 {totalPlays}회 장르 플레이
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-3 sm:p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400">
            플레이한 고유 게임 수
          </span>
          <span className="text-sm sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-white my-1">
            {totalGamesCount}개
          </span>
          <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 truncate">
            다양한 장르 진행
          </span>
        </div>

        {/* 가장 자주 등장한 게임 -> 클릭 시 추천 영상 탭 해당 게임명 검색 */}
        <div 
          onClick={() => {
            if (topIndividualGames[0] && onNavigateToRecommend) {
              onNavigateToRecommend(undefined, topIndividualGames[0].name);
            }
          }}
          className={cn(
            "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-3 sm:p-4 shadow-sm flex flex-col justify-between transition-all group",
            topIndividualGames[0] ? "cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md" : ""
          )}
          title={topIndividualGames[0] ? `클릭 시 추천 영상 탭에서 "${topIndividualGames[0].name}" 검색 결과로 이동합니다.` : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400">
              가장 자주 등장한 게임
            </span>
            {topIndividualGames[0] && (
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" />
            )}
          </div>
          <span className="text-sm sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-white truncate my-1">
            {topIndividualGames[0]?.name || '없음'}
          </span>
          <span className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {topIndividualGames[0] ? `${topIndividualGames[0].count}회 방송 진행` : '-'}
          </span>
        </div>
      </div>

      {/* 카테고리별 비중 원그래프 (크기 키움, 하얀 윤곽선 제거, 부드러운 파스텔톤, 인터랙티브 필터링) */}
      <div 
        id="detailed-category-pie-card"
        onClick={handleClearCategory}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm cursor-default relative"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
          <div>
            <h4 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
              카테고리별 비중 원그래프
            </h4>
            <p className="no-share text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              원하는 카테고리를 클릭하여 필터링하고, 한 번 더 클릭하면 추천 영상 목록으로 이동합니다. (빈 공간 클릭 시 해제)
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {selectedCategory && (
              <button
                type="button"
                onClick={handleClearCategory}
                className="no-share text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>{selectedCategory} 필터링 중</span>
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              총 {totalPlays}회 데이터 기반
            </span>
            <WidgetShareButton targetId="detailed-category-pie-card" title="카테고리별 비중 원그래프" />
          </div>
        </div>

        {/* 한줄 정리 요약 */}
        <StatInsightSummary className="mb-4">
          {categoryInsight}
        </StatInsightSummary>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* 도넛 차트 (외경 135/내경 80으로 칸 크기 키우고 stroke="none"으로 하얀 윤곽선 제거) */}
          <div 
            onClick={handleClearCategory}
            className="lg:col-span-6 h-[320px] sm:h-[360px] relative flex items-center justify-center cursor-pointer select-none"
          >
            {isActive && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart onClick={(e: any) => {
                  if (!e || !e.activePayload) {
                    handleClearCategory();
                  }
                }}>
                  <RechartsTooltip
                    isAnimationActive={false}
                    wrapperStyle={{ zIndex: 50, pointerEvents: 'none' }}
                    content={<CategoryPieTooltip />}
                  />
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={130}
                    paddingAngle={0}
                    dataKey="value"
                    isAnimationActive={false}
                    stroke="none"
                    strokeWidth={0}
                    activeShape={false}
                    className="outline-none focus:outline-none"
                    onClick={(entry: any, index: any, e: any) => {
                      e?.stopPropagation?.();
                      handleCategoryClick(entry?.name, e);
                    }}
                  >
                    {chartData.map((entry, index) => {
                      const isSelected = selectedCategory === entry.name;
                      const isMuted = selectedCategory && !isSelected;
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="none"
                          strokeWidth={0}
                          opacity={isMuted ? 0.35 : 1}
                          className="cursor-pointer transition-opacity duration-200 hover:opacity-90 outline-none focus:outline-none"
                          style={{ outline: 'none' }}
                          onClick={(e: any) => {
                            e?.stopPropagation?.();
                            handleCategoryClick(entry.name, e);
                          }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* 도넛 중앙 고정 요약 텍스트 또는 선택된 카테고리 바로가기 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCategoryClick(selectedCategory, e);
                  }}
                  className="pointer-events-auto flex flex-col items-center justify-center p-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors group cursor-pointer max-w-[140px]"
                  title="다시 클릭하면 해당 카테고리 추천 영상 목록으로 이동합니다"
                >
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold block animate-pulse">
                    선택됨 (재클릭 시 이동)
                  </span>
                  <span className="text-base sm:text-lg font-black text-zinc-900 dark:text-white truncate px-1 block group-hover:underline">
                    {selectedCategory}
                  </span>
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 block">
                    {chartData.find(c => c.name === selectedCategory)?.share.toFixed(1) || ''}%
                  </span>
                </button>
              ) : (
                <div className="text-center pointer-events-none">
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    주요 카테고리
                  </span>
                  <span className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white max-w-[130px] truncate px-1 block">
                    {topCategory?.name || '종합'}
                  </span>
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 block">
                    {topCategory ? `${topCategory.share.toFixed(1)}%` : '0%'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 차트 범례 및 비율 리스트 */}
          <div className="lg:col-span-6 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                주요 카테고리 비중 순위
              </h5>
              {selectedCategory && (
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  재클릭 시 추천 탭 이동
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {chartData.map((item) => {
                const isSelected = selectedCategory === item.name;
                return (
                  <div
                    key={item.name}
                    onClick={(e) => handleCategoryClick(item.name, e)}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all select-none",
                      isSelected
                        ? "border-purple-500 bg-purple-50/90 dark:bg-purple-950/60 ring-2 ring-purple-400/40 shadow-sm"
                        : "border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/40 hover:bg-zinc-100/80 dark:hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className={cn(
                        "truncate",
                        isSelected ? "font-bold text-purple-900 dark:text-purple-200" : "font-medium text-zinc-800 dark:text-zinc-200"
                      )}>
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {item.value}회
                      </span>
                      <span className={cn(
                        "min-w-[38px] text-right font-bold",
                        isSelected ? "text-purple-600 dark:text-purple-400" : "text-zinc-900 dark:text-zinc-100"
                      )}>
                        {item.share.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 가장 많이 플레이한 게임 카테고리 순위표 (검색창이 순위표 상단에 통합, 카테고리 선택 제거) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm">
        {selectedCategory && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-xs text-purple-900 dark:text-purple-200">
            <div className="flex items-center gap-2">
              <span className="font-bold">선택된 카테고리:</span>
              <span className="px-2 py-0.5 rounded-full bg-purple-200 dark:bg-purple-800 font-semibold">{selectedCategory}</span>
              <span className="text-zinc-500 dark:text-zinc-400 hidden sm:inline">(원그래프 또는 아래 버튼을 클릭하면 추천 영상 탭으로 이동합니다)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToRecommend?.(selectedCategory)}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>추천 영상 보기</span>
                <span className="text-[10px]">➔</span>
              </button>
              <button
                type="button"
                onClick={handleClearCategory}
                className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>필터 해제</span>
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* 순위표 헤더 + 통합 검색창 및 정렬 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
              가장 많이 플레이한 게임 카테고리 순위표
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              카테고리별 플레이 횟수, 총 방송 시간, 대표 게임 목록입니다. (게임 클릭 시 해당 방송일 달력으로 이동)
            </p>
          </div>

          {/* 통합된 검색창과 정렬 셀렉터 */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            {/* 초성 지원 검색창 */}
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="카테고리/게임 검색 (초성 지원)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs sm:text-sm dark:text-zinc-200"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 정렬 드롭다운 */}
            <div className="relative shrink-0">
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [sb, so] = e.target.value.split('-') as [any, any];
                  setSortBy(sb);
                  setSortOrder(so);
                }}
                className="pl-3 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs sm:text-sm appearance-none dark:text-zinc-200 font-medium cursor-pointer"
              >
                <option value="count-desc">플레이 많은순</option>
                <option value="count-asc">플레이 적은순</option>
                <option value="hours-desc">방송 시간순</option>
                <option value="games-desc">게임 개수순</option>
                <option value="name-asc">이름순 (가나다)</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 순위표 테이블 (PC에서는 넉넉한 칸 띄움과 정렬, 모바일에서는 최소 스크롤 최적화) */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 custom-scrollbar">
          <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap table-auto lg:table-fixed">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800 text-[11px] sm:text-xs">
              <tr>
                <th className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 w-12 sm:w-16 lg:w-20 text-center">순위</th>
                <th className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 lg:w-44">카테고리</th>
                <th 
                  onClick={() => toggleSort('count')}
                  className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 lg:w-48 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    플레이 횟수 / 비중
                    <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('hours')}
                  className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 lg:w-32 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    방송 시간
                    <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('games')}
                  className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    대표 플레이 게임 (클릭 시 달력 이동)
                    <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400 text-xs sm:text-sm">
                    검색 조건에 일치하는 카테고리가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat, index) => {
                  const rank = index + 1;
                  const maxCount = categories[0]?.count || 1;
                  const barWidth = Math.max(8, (cat.count / maxCount) * 100);
                  const isExpanded = expandedCategoryNames.has(cat.name);
                  const visibleGames = isExpanded ? cat.games : cat.games.slice(0, 3);
                  const hiddenCount = cat.games.length - 3;

                  return (
                    <tr 
                      key={cat.name} 
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* 순위: 금은동 심플 뱃지 */}
                      <td className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 text-center">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px] sm:text-xs border border-amber-500/30">
                            1
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-zinc-400/15 text-zinc-600 dark:text-zinc-300 font-bold text-[10px] sm:text-xs border border-zinc-400/30">
                            2
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-amber-700/15 text-amber-700 dark:text-amber-500 font-bold text-[10px] sm:text-xs border border-amber-700/30">
                            3
                          </span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500 font-medium text-[10px] sm:text-xs">
                            {rank}
                          </span>
                        )}
                      </td>

                      {/* 카테고리명 */}
                      <td className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 font-bold text-zinc-900 dark:text-white">
                          <span 
                            className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: cat.color }} 
                          />
                          <span className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-300">{cat.name}</span>
                        </div>
                      </td>

                      {/* 플레이 횟수 및 게이지 바 */}
                      <td className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4">
                        <div className="flex flex-col gap-1 w-24 sm:w-44">
                          <div className="flex items-center justify-between text-[11px] sm:text-xs">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {cat.count}회
                            </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {cat.share.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-300" 
                              style={{ 
                                width: `${barWidth}%`, 
                                backgroundColor: cat.color 
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 누적 방송 시간 */}
                      <td className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                          {cat.estimatedHours}시간
                        </span>
                      </td>

                      {/* 대표 플레이 게임 목록 (클릭 시 해당 방송일 달력으로 이동!) */}
                      <td className="px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xs sm:max-w-md lg:max-w-none">
                          {visibleGames.map((g, gIdx) => (
                            <button
                              key={gIdx}
                              onClick={() => {
                                if (g.latestDate && onNavigateToCalendar) {
                                  onNavigateToCalendar(g.latestDate);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200 dark:border-zinc-700 truncate max-w-[140px] sm:max-w-[180px] transition-colors cursor-pointer group/btn"
                              title={g.latestDate ? `${g.name} (${g.count}회) - 클릭 시 ${g.latestDate} 방송 기록 달력으로 이동` : `${g.name} (${g.count}회)`}
                            >
                              <span className="truncate">{g.name}</span>
                              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-900 dark:text-white">
                                {g.count}
                              </span>
                              {g.latestDate && (
                                <Calendar className="w-2.5 h-2.5 opacity-40 group-hover/btn:opacity-100 shrink-0" />
                              )}
                            </button>
                          ))}
                          
                          {/* 더보기 / 접기 인터랙티브 버튼 */}
                          {cat.games.length > 3 && (
                            <button
                              onClick={() => toggleExpand(cat.name)}
                              className="inline-flex items-center text-[10px] sm:text-xs px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium border border-zinc-200/80 dark:border-zinc-700 transition-colors cursor-pointer"
                            >
                              {isExpanded ? '접기' : `+${hiddenCount}개`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
