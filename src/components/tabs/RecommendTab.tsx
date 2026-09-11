import { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, ChevronDown, ThumbsUp, ThumbsDown, Star, CheckCircle, Search, Filter, Cloud, CloudDownload, X } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { fuzzyKoreanMatch } from '../../utils';

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
  video
}: { 
  video: any
}) => {
  const [showShortsMenu, setShowShortsMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shorts = video.parentLog?.shorts || [];
  const vods = video.parentLog?.vods || [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowShortsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      className="group flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a href={video.videoUrl} target="_blank" rel="noreferrer" className="block aspect-video relative overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <img 
          src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} 
          alt={video.videoTitle} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300"></div>
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm">
          생방일: {video.parentLog?.date}
        </div>
      </a>
      
      <div className="p-4 flex-1 flex flex-col">
        <a href={video.videoUrl} target="_blank" rel="noreferrer" className="font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-red-600 dark:hover:text-red-400 transition-colors">
          {video.videoTitle}
        </a>
        
        {video.parentLog && (
          <div className="flex flex-wrap gap-1 mt-3 mb-2">
            {(() => {
              const games = video.parentLog.games || [];
              if (games.length === 0 && video.parentLog.game) {
                return (
                  <div className="px-2 py-0.5 text-[10px] rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {video.parentLog.game}
                  </div>
                );
              }
              
              let matchedGames = [];
              if (video.category) {
                 const vCats = video.category.split(',').map((c: string) => c.trim().toLowerCase());
                 matchedGames = games.filter((g: any) => {
                   const gName = g.name.trim().toLowerCase();
                   return vCats.some((vc: string) => gName.includes(vc) || vc.includes(gName));
                 });
              }
              
              if (matchedGames.length === 0 && video.videoTitle) {
                 const vTitle = video.videoTitle.toLowerCase();
                 matchedGames = games.filter((g: any) => {
                   const gName = g.name.trim().toLowerCase();
                   return vTitle.includes(gName) && gName.length > 1; // Basic title matching to filter unrelated games
                 });
              }
              
              if (matchedGames.length > 0) {
                 return matchedGames.map((g: any, i: number) => {
                   const gameContent = (
                     <span className={`px-2 py-0.5 text-[10px] rounded-full select-none ${g.link ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                       {g.name} {g.category && <span className="opacity-60 font-normal ml-1 border-l border-current pl-1">{g.category}</span>}
                     </span>
                   );
                   return g.link ? (
                     <a key={i} href={g.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                       {gameContent}
                     </a>
                   ) : (
                     <div key={i}>{gameContent}</div>
                   );
                 });
              } else if (video.category) {
                 return video.category.split(',').map((c: string, i: number) => (
                   <div key={i} className="px-2 py-0.5 text-[10px] rounded-full select-none bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                     {c.trim()}
                   </div>
                 ));
              }
              
              let filteredGames = games;

              return filteredGames.map((g: any, i: number) => {
                const gameContent = (
                  <span className={`px-2 py-0.5 text-[10px] rounded-full select-none ${g.link ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                    {g.name} {g.category && <span className="opacity-60 font-normal ml-1 border-l border-current pl-1">{g.category}</span>}
                  </span>
                );
                return g.link ? (
                  <a key={i} href={g.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    {gameContent}
                  </a>
                ) : (
                  <div key={i}>{gameContent}</div>
                );
              });
            })()}
          </div>
        )}
        
        <div className="mt-auto pt-4 flex flex-col gap-2 relative">
          <a 
            href={video.videoUrl} 
            target="_blank"
            rel="noreferrer"
            className="w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <YoutubeLogo className="w-4 h-4" /> 영상 보기
          </a>
          
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
}: { 
  data: AppData | null; 
  rateVideo?: (id: string, score: number) => void;
  targetCategory?: string | null;
  targetSearchTerm?: string | null;
  onClearTarget?: () => void;
  isActive?: boolean;
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
  const [sortOrder, setSortOrder] = useState('desc'); // 항상 최신순 기본 정렬
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
    
    const vids: any[] = [];
    Object.values(data.logs).forEach((log: any) => {
      const getYoutubeId = (url: string) => {
        if (!url) return null;
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/);
        return match ? match[1] : null;
      };

      if (log.edited && Array.isArray(log.edited)) {
        log.edited.forEach((edit: any) => {
          const id = getYoutubeId(edit.url);
          if (id) {
            if (baseWeights.current[id] === undefined) {
              baseWeights.current[id] = Math.random();
            }
            vids.push({
              id,
              videoTitle: edit.title || log.game || log.category || '우주하마 편집본',
              videoUrl: edit.url,
              category: edit.category || (Array.isArray(edit.categories) ? edit.categories.join(', ') : undefined),
              parentLog: log
            });
          }
        });
      }
    });
    return vids;
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
    return ['전체', ...Array.from(cats).sort()];
  }, [allVideos]);

  const recommended = useMemo(() => {
    if (allVideos.length === 0) return [];

    let vids = allVideos;

    if (!selectedCategories.includes('전체')) {
      vids = vids.filter(v => {
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

    if (searchTerm) {
      vids = vids.filter(v => {
        if (fuzzyKoreanMatch(searchTerm, v.videoTitle)) return true;
        
        if (v.category) {
          if (fuzzyKoreanMatch(searchTerm, v.category)) return true;
        } else {
          if (v.parentLog?.games?.some((g: any) => fuzzyKoreanMatch(searchTerm, g.name) || fuzzyKoreanMatch(searchTerm, g.category))) return true;
          if (fuzzyKoreanMatch(searchTerm, v.parentLog?.game || '')) return true;
        }
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

       return { ...v, rType, weight };
    });
    
    if (sortOrder === 'desc') {
      scoredVids.sort((a, b) => (b.parentLog?.date || '').localeCompare(a.parentLog?.date || ''));
    } else if (sortOrder === 'asc') {
      scoredVids.sort((a, b) => (a.parentLog?.date || '').localeCompare(b.parentLog?.date || ''));
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

  const ITEMS_PER_PAGE = 9;
  const totalPages = Math.ceil(recommended.length / ITEMS_PER_PAGE);
  const paginatedVids = recommended.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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

      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="영상 제목, 게임 이름 검색 (초성 검색 지원)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-zinc-200"
          />
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
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full pl-4 pr-8 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none dark:text-zinc-200 font-medium cursor-pointer"
          >
            <option value="asc">과거순 (첫 기록부터)</option>
            <option value="recommend">추천순 (랜덤)</option>
            <option value="desc">최신순</option>
            
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
        
        <button 
          onClick={handleRefresh}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors font-medium text-sm whitespace-nowrap border border-indigo-100 dark:border-indigo-900/50"
        >
          <RefreshCw className="w-4 h-4" />
          추천 새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedVids.map((video, idx) => (
          <VideoCard 
            key={`${video.id}-${idx}`} 
            video={video} 
          />
        ))}
        
        {recommended.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl">
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
            className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            &lt;&lt;
          </button>
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
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
                    className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-xs sm:text-sm font-medium transition-colors ${
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
            className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            &gt;
          </button>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + (isMobile ? 5 : 10)))}
            disabled={currentPage > totalPages - (isMobile ? 5 : 10)}
            className="p-1 sm:p-2 disabled:opacity-30 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            &gt;&gt;
          </button>
        </div>
      )}
      
      {/* 푸터 바로 윗부분: 과거 데이터 안내문구 */}
      <div className="mt-8 p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-2 leading-relaxed">
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
