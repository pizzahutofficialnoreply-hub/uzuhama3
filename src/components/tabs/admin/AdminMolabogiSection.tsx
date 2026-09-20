import { useState, useMemo, useEffect } from 'react';
import { AppData, BroadcastLog, GameItem, LinkItem, GameGroup } from '../../../types';
import { extractYoutubeId, matchLogMedia, matchMediaUrl } from '../../../utils/urlUtils';
import { fuzzyKoreanMatch, fuzzyDateMatch } from '../../../utils';
import { db } from '../../../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  Video, 
  Search, 
  Calendar, 
  Plus, 
  Check, 
  Trash2, 
  ExternalLink, 
  Film, 
  CheckSquare, 
  Square, 
  Layers, 
  RefreshCw,
  Edit3,
  ArrowUp,
  ArrowDown,
  FolderPlus,
  Folder,
  Tag,
  ListOrdered,
  X,
  Sparkles
} from 'lucide-react';

interface AdminMolabogiSectionProps {
  data: AppData;
  onUpdateLog?: (log: BroadcastLog) => Promise<void>;
}

interface SelectedBroadcastState {
  logId: string;
  date: string;
  selectedGameNames: string[]; // 해당 생방에서 선택된 게임 목록
}

interface ExistingCompilation {
  compilationId: string;
  title: string;
  url: string;
  allBroadcastDates: string[];
  games: GameItem[];
  gameSortOrder?: 'latest' | 'oldest' | 'custom';
  gameGroups?: GameGroup[];
  associatedLogIds: string[];
}

export function AdminMolabogiSection({ data, onUpdateLog }: AdminMolabogiSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'form' | 'list'>('form');

  // 편집 폼 상태
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBroadcasts, setSelectedBroadcasts] = useState<Record<string, SelectedBroadcastState>>({});
  
  // 게임 순서 정렬 및 그룹화 상태
  const [gameSortOrder, setGameSortOrder] = useState<'latest' | 'oldest' | 'custom'>('latest');
  const [groupingType, setGroupingType] = useState<'none' | 'broadcast' | 'category' | 'custom'>('none');
  const [customGroups, setCustomGroups] = useState<{ groupName: string; gameNames: string[] }[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  
  // 자유 순서 조정을 위한 커스텀 정렬 게임 배열
  const [customSortedGames, setCustomSortedGames] = useState<GameItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 모든 로그 목록 (날짜 내림차순)
  const allLogs = useMemo(() => {
    return Object.values(data.logs || {}).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.logs]);

  // 기존 등록된 모든 몰아보기 영상 목록 취합
  const existingCompilations = useMemo(() => {
    const map = new Map<string, ExistingCompilation>();

    Object.values(data.logs || {}).forEach(log => {
      if (Array.isArray(log.edited)) {
        log.edited.forEach(item => {
          if (item.isCompilation || item.compilationId) {
            const compId = item.compilationId || `comp_${item.url}`;
            const cleanTitle = item.title.replace(/^\[몰아보기\]\s*/, '');

            if (!map.has(compId)) {
              map.set(compId, {
                compilationId: compId,
                title: cleanTitle,
                url: item.url,
                allBroadcastDates: item.allBroadcastDates ? [...item.allBroadcastDates] : [log.date],
                games: item.games ? [...item.games] : (log.games ? [...log.games] : []),
                gameSortOrder: item.gameSortOrder || 'latest',
                gameGroups: item.gameGroups ? [...item.gameGroups] : undefined,
                associatedLogIds: [log.id]
              });
            } else {
              const existing = map.get(compId)!;
              if (!existing.associatedLogIds.includes(log.id)) {
                existing.associatedLogIds.push(log.id);
              }
              if (log.date && !existing.allBroadcastDates.includes(log.date)) {
                existing.allBroadcastDates.push(log.date);
              }
              // 게임 병합
              const existingNames = new Set(existing.games.map(g => g.name));
              const currentLogGames = item.games || log.games || [];
              currentLogGames.forEach(g => {
                if (g.name && !existingNames.has(g.name)) {
                  existing.games.push(g);
                  existingNames.add(g.name);
                }
              });
            }
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.allBroadcastDates[a.allBroadcastDates.length - 1] || '';
      const dateB = b.allBroadcastDates[b.allBroadcastDates.length - 1] || '';
      return dateB.localeCompare(dateA);
    });
  }, [data.logs]);

  // 검색된 생방 목록 필터링
  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) {
      return allLogs.slice(0, 20);
    }
    return allLogs.filter(log => {
      // 1. 미디어 링크 및 Video ID 대조
      if (matchLogMedia(log, q)) return true;

      // 2. 날짜 대조 (YYYY-MM-DD, M/D, M월 D일 등)
      if (log.date && (log.date.includes(q) || fuzzyDateMatch(q, log.date))) return true;

      // 3. 게임명 및 카테고리 초성/퍼지 매칭
      if (log.game && fuzzyKoreanMatch(q, log.game)) return true;
      if (log.category && fuzzyKoreanMatch(q, log.category)) return true;
      if (log.games && log.games.some(g => (g.name && fuzzyKoreanMatch(q, g.name)) || (g.category && fuzzyKoreanMatch(q, g.category)))) return true;

      // 4. 영상 제목 매칭
      if (log.vods?.some(v => (v.title && fuzzyKoreanMatch(q, v.title)) || matchMediaUrl(typeof v === 'string' ? v : v?.url, q))) return true;
      if (log.shorts?.some(s => (s.title && fuzzyKoreanMatch(q, s.title)) || matchMediaUrl(typeof s === 'string' ? s : s?.url, q))) return true;
      if (log.edited?.some(e => (e.title && fuzzyKoreanMatch(q, e.title)) || matchMediaUrl(typeof e === 'string' ? e : e?.url, q))) return true;

      return false;
    });
  }, [allLogs, searchTerm]);

  // 생방별 게임 목록 추출 헬퍼
  const getGamesFromLog = (log: BroadcastLog): string[] => {
    if (log.games && log.games.length > 0) {
      const names = log.games.map(g => g.name?.trim()).filter(Boolean);
      if (names.length > 0) return names;
    }
    if (log.game?.trim()) return [log.game.trim()];
    return ['종합 게임'];
  };

  // 선택된 모든 게임 아이템 목록 (선택된 생방 및 게임 기준 추출)
  const allSelectedGameItems = useMemo(() => {
    const list: GameItem[] = [];
    const seen = new Set<string>();

    Object.entries(selectedBroadcasts).forEach(([logId, sel]) => {
      const log = data.logs[logId];
      if (!log) return;

      sel.selectedGameNames.forEach(gameName => {
        const key = `${gameName}_${sel.date}`;
        if (!seen.has(key)) {
          seen.add(key);
          const matched = log.games?.find(g => g.name === gameName);
          list.push({
            name: gameName,
            link: matched?.link || '',
            category: matched?.category || (log.category && log.category !== log.game ? log.category : '') || '',
            date: sel.date
          });
        }
      });
    });

    return list;
  }, [selectedBroadcasts, data.logs]);

  // 선택된 게임 목록이 바뀔 때 customSortedGames 동기화 (기존 순서 최우선 보존)
  useEffect(() => {
    setCustomSortedGames(prev => {
      const currentKeys = new Set(allSelectedGameItems.map(item => `${item.name}_${item.date}`));
      
      // 1. 기존 prev에 있던 게임 중 여전히 선택된 게임들은 기존 정렬 순서 그대로 유지
      const retainedList = prev.filter(item => currentKeys.has(`${item.name}_${item.date}`));
      const retainedKeys = new Set(retainedList.map(item => `${item.name}_${item.date}`));

      // 2. 새로 추가된 게임들만 뒤에 덧붙임
      const newlyAdded = allSelectedGameItems.filter(item => !retainedKeys.has(`${item.name}_${item.date}`));
      let nextList = [...retainedList, ...newlyAdded];

      // 3. 최신순 또는 과거순인 경우에만 자동 재정렬, 'custom'일 때는 사용자 배치 순서 엄격 유지
      if (gameSortOrder === 'latest') {
        nextList.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      } else if (gameSortOrder === 'oldest') {
        nextList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      }
      return nextList;
    });
  }, [allSelectedGameItems, gameSortOrder]);

  // 정렬 순서 변경 시 customSortedGames 재정렬
  const handleSortOrderChange = (order: 'latest' | 'oldest' | 'custom') => {
    setGameSortOrder(order);
    setCustomSortedGames(prev => {
      const copy = [...prev];
      if (order === 'latest') {
        copy.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      } else if (order === 'oldest') {
        copy.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      }
      return copy;
    });
  };

  // 게임 순서 위로/아래로 이동 (자유 직접 정렬)
  const handleMoveGame = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= customSortedGames.length) return;

    if (gameSortOrder !== 'custom') {
      setGameSortOrder('custom');
    }

    setCustomSortedGames(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  // 생방 선택 토글
  const handleToggleBroadcast = (log: BroadcastLog) => {
    setSelectedBroadcasts(prev => {
      const next = { ...prev };
      if (next[log.id]) {
        delete next[log.id];
      } else {
        const availableGames = getGamesFromLog(log);
        next[log.id] = {
          logId: log.id,
          date: log.date,
          selectedGameNames: [...availableGames]
        };
      }
      return next;
    });
  };

  // 생방 내 특정 게임 선택/해제 토글
  const handleToggleGame = (logId: string, gameName: string) => {
    setSelectedBroadcasts(prev => {
      const current = prev[logId];
      if (!current) return prev;
      const exists = current.selectedGameNames.includes(gameName);
      let nextGames: string[];
      if (exists) {
        nextGames = current.selectedGameNames.filter(g => g !== gameName);
      } else {
        nextGames = [...current.selectedGameNames, gameName];
      }
      return {
        ...prev,
        [logId]: {
          ...current,
          selectedGameNames: nextGames
        }
      };
    });
  };

  // 사용자 지정 그룹 추가
  const handleAddCustomGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    if (customGroups.some(g => g.groupName === trimmed)) {
      alert('이미 존재하는 그룹명입니다.');
      return;
    }
    setCustomGroups(prev => [...prev, { groupName: trimmed, gameNames: [] }]);
    setNewGroupName('');
  };

  // 사용자 지정 그룹 제거
  const handleRemoveCustomGroup = (groupName: string) => {
    setCustomGroups(prev => prev.filter(g => g.groupName !== groupName));
  };

  // 게임을 사용자 지정 그룹에 할당/해제
  const handleToggleGameInGroup = (groupName: string, gameName: string) => {
    setCustomGroups(prev => prev.map(g => {
      if (g.groupName === groupName) {
        const exists = g.gameNames.includes(gameName);
        return {
          ...g,
          gameNames: exists ? g.gameNames.filter(name => name !== gameName) : [...g.gameNames, gameName]
        };
      }
      return g;
    }));
  };

  // 기존 몰아보기 수정 모드로 진입
  const handleEditCompilation = (comp: ExistingCompilation) => {
    setEditingCompId(comp.compilationId);
    setVideoTitle(comp.title.replace(/^\[몰아보기\]\s*/, ''));
    setVideoUrl(comp.url);
    setGameSortOrder(comp.gameSortOrder || 'custom');

    // 연동된 생방 정보 복원
    const restoredBroadcasts: Record<string, SelectedBroadcastState> = {};
    comp.associatedLogIds.forEach(logId => {
      const log = data.logs[logId];
      if (log) {
        // 이 생방에서 진행한 게임들 중 몰아보기에 등록된 게임들
        const logGames = getGamesFromLog(log);
        const matchedGames = logGames.filter(gName => comp.games.some(cg => cg.name === gName));
        restoredBroadcasts[logId] = {
          logId: log.id,
          date: log.date,
          selectedGameNames: matchedGames.length > 0 ? matchedGames : logGames
        };
      }
    });

    setSelectedBroadcasts(restoredBroadcasts);
    setCustomSortedGames(comp.games ? [...comp.games] : []);

    if (comp.gameGroups && comp.gameGroups.length > 0) {
      setGroupingType('custom');
      setCustomGroups(comp.gameGroups);
    } else {
      setGroupingType('none');
      setCustomGroups([]);
    }

    setActiveSubTab('form');
  };

  // 편집 취소 및 폼 초기화
  const handleCancelEdit = () => {
    setEditingCompId(null);
    setVideoTitle('');
    setVideoUrl('');
    setSelectedBroadcasts({});
    setSearchTerm('');
    setGameSortOrder('latest');
    setGroupingType('none');
    setCustomGroups([]);
  };

  // 몰아보기 삭제 실행
  const handleDeleteCompilation = async (comp: ExistingCompilation) => {
    if (!confirm(`몰아보기 영상 [${comp.title}]을(를) 삭제하시겠습니까?\n연동된 ${comp.associatedLogIds.length}개 생방 기록에서 모두 제거됩니다.`)) {
      return;
    }

    if (!onUpdateLog) {
      alert('로그 수정 기능이 제공되지 않았습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Firestore compilations 컬렉션에서 삭제
      try {
        await deleteDoc(doc(db, 'compilations', comp.compilationId));
      } catch (err) {
        console.warn('Compilations deleteDoc warning:', err);
      }

      // 2. 연동된 각 생방 로그의 edited 배열에서 해당 compilationId 및 url 제거
      for (const logId of comp.associatedLogIds) {
        const log = data.logs[logId];
        if (!log || !Array.isArray(log.edited)) continue;

        const updatedEdited = log.edited.filter(
          item => item.compilationId !== comp.compilationId && item.url !== comp.url
        );

        if (updatedEdited.length !== log.edited.length) {
          await onUpdateLog({
            ...log,
            edited: updatedEdited
          });
        }
      }

      alert('몰아보기 영상이 성공적으로 삭제되었습니다.');
      if (editingCompId === comp.compilationId) {
        handleCancelEdit();
      }
    } catch (e: any) {
      console.error('Delete compilation error:', e);
      alert('삭제 중 오류가 발생했습니다: ' + (e?.message || '알 수 없는 오류'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 몰아보기 등록 / 수정 저장
  const handleSubmit = async () => {
    if (!videoTitle.trim()) {
      alert('몰아보기 영상 제목을 입력해주세요.');
      return;
    }
    if (!videoUrl.trim()) {
      alert('몰아보기 영상 링크를 입력해주세요.');
      return;
    }

    const selectedKeys = Object.keys(selectedBroadcasts);
    if (selectedKeys.length === 0) {
      alert('연동할 생방송을 최소 1개 이상 선택해주세요.');
      return;
    }

    if (!onUpdateLog) {
      alert('로그 수정 기능이 초기화되지 않았습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      const compId = editingCompId || ('compilation_' + Date.now());
      const allSelectedDates = selectedKeys.map(id => selectedBroadcasts[id].date).sort();
      const cleanedTitle = videoTitle.trim().replace(/^\[몰아보기\]\s*/, '');

      // 최종 정렬된 게임 리스트
      const finalGames = customSortedGames.length > 0 ? customSortedGames : allSelectedGameItems;

      // 그룹화 구성
      let finalGroups: GameGroup[] | undefined = undefined;
      if (groupingType === 'broadcast') {
        const dateMap = new Map<string, string[]>();
        finalGames.forEach(g => {
          const d = g.date || '기타 방송';
          if (!dateMap.has(d)) dateMap.set(d, []);
          dateMap.get(d)!.push(g.name);
        });
        finalGroups = Array.from(dateMap.entries()).map(([d, names]) => ({
          groupName: `${d} 방송분`,
          gameNames: names
        }));
      } else if (groupingType === 'category') {
        const catMap = new Map<string, string[]>();
        finalGames.forEach(g => {
          const c = g.category || '미분류';
          if (!catMap.has(c)) catMap.set(c, []);
          catMap.get(c)!.push(g.name);
        });
        finalGroups = Array.from(catMap.entries()).map(([c, names]) => ({
          groupName: `${c} 게임`,
          gameNames: names
        }));
      } else if (groupingType === 'custom' && customGroups.length > 0) {
        finalGroups = customGroups.filter(g => g.gameNames.length > 0);
      }

      // 1. Firestore compilations 컬렉션 저장
      const compilationData = {
        id: compId,
        title: cleanedTitle,
        url: videoUrl.trim(),
        createdAt: new Date().toISOString(),
        gameSortOrder,
        gameGroups: finalGroups,
        broadcasts: Object.values(selectedBroadcasts).map(s => ({
          logId: s.logId,
          date: s.date,
          games: s.selectedGameNames
        }))
      };

      try {
        await setDoc(doc(db, 'compilations', compId), compilationData, { merge: true });
      } catch (err) {
        console.warn('Compilations collection save warning:', err);
      }

      // 2. 수정 모드일 때: 이전에 연동되었으나 이번 선택에서 제외된 생방들에서 해당 링크 삭제
      if (editingCompId) {
        const existingComp = existingCompilations.find(c => c.compilationId === editingCompId);
        if (existingComp) {
          const removedLogIds = existingComp.associatedLogIds.filter(id => !selectedKeys.includes(id));
          for (const logId of removedLogIds) {
            const originalLog = data.logs[logId];
            if (originalLog && Array.isArray(originalLog.edited)) {
              const cleaned = originalLog.edited.filter(
                item => item.compilationId !== editingCompId && item.url !== videoUrl.trim()
              );
              await onUpdateLog({ ...originalLog, edited: cleaned });
            }
          }
        }
      }

      // 3. 선택된 모든 생방 로그에 해당 몰아보기 링크 갱신/추가
      for (const logId of selectedKeys) {
        const originalLog = data.logs[logId];
        if (!originalLog) continue;

        const existingEdited = Array.isArray(originalLog.edited) ? [...originalLog.edited] : [];

        const newCompilationLink: LinkItem = {
          title: cleanedTitle,
          url: videoUrl.trim(),
          isCompilation: true,
          compilationId: compId,
          allBroadcastDates: allSelectedDates,
          games: finalGames,
          gameSortOrder,
          gameGroups: finalGroups,
          createdAt: compilationData.createdAt
        };

        // 기존 동일 URL/동일 compilationId 항목 교체
        const filteredEdited = existingEdited.filter(
          item => item.url !== videoUrl.trim() && item.compilationId !== compId
        );
        filteredEdited.unshift(newCompilationLink);

        const updatedLog: BroadcastLog = {
          ...originalLog,
          edited: filteredEdited
        };

        await onUpdateLog(updatedLog);
      }

      alert(
        editingCompId
          ? `몰아보기 영상이 성공적으로 수정되었습니다!\n연동된 ${selectedKeys.length}개 생방 기록 및 추천 영상에 갱신되었습니다.`
          : `몰아보기 영상이 성공적으로 등록되었습니다!\n선택하신 ${selectedKeys.length}개 생방 기록에 자동으로 연결되었습니다.`
      );

      handleCancelEdit();
      setActiveSubTab('list');
    } catch (e: any) {
      console.error('Error saving compilation video:', e);
      alert('몰아보기 저장 중 오류가 발생했습니다: ' + (e?.message || '알 수 없는 오류'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = Object.keys(selectedBroadcasts).length;

  return (
    <div className="space-y-6">
      {/* 서브 탭 전환 헤더 */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80">
          <button
            type="button"
            onClick={() => setActiveSubTab('form')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'form'
                ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {editingCompId ? (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                <span>몰아보기 수정 중</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>새 몰아보기 등록</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('list')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'list'
                ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>등록된 몰아보기 관리 ({existingCompilations.length}개)</span>
          </button>
        </div>

        {editingCompId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="text-xs text-red-500 hover:text-red-600 font-semibold flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>수정 취소</span>
          </button>
        )}
      </div>

      {/* 탭 1: 등록 / 수정 폼 */}
      {activeSubTab === 'form' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 text-xs sm:text-sm text-purple-900 dark:text-purple-200 leading-relaxed flex items-start gap-3">
            <Film className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold mb-0.5">
                {editingCompId ? '몰아보기 영상 수정' : '몰아보기 영상 등록 및 게임 목록 그룹화/정렬'}
              </strong>
              몰아보기 영상의 제목과 링크를 입력하고, 포함된 생방과 게임을 선택하세요. 
              <strong>게임 순서(최신순, 오래된순, 자유)</strong>를 직접 변경하고, <strong>게임 목록을 따로 그룹화</strong>하여 추천 탭과 캘린더에 일괄 적용할 수 있습니다.
            </div>
          </div>

          {/* 1. 영상 기본 정보 */}
          <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              영상 정보 입력
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  몰아보기 영상 제목 (필수)
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={e => setVideoTitle(e.target.value)}
                  placeholder="예: 2026 공포게임 꿀잼 하이라이트 몰아보기"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  영상 링크 URL (필수)
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="예: https://www.youtube.com/watch?v=..."
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. 포함된 생방송 검색 및 선택 */}
          <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  포함된 생방송 검색 & 선택 (복수 선택)
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  해당 몰아보기에 묶인 생방들을 선택하고, 각 생방에서 진행한 게임 중 포함된 게임을 체크하세요.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                  선택된 생방: {selectedCount}개
                </span>
              </div>
            </div>

            {/* 검색창 */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="게임 이름 또는 방송 날짜(YYYY-MM-DD) 검색..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>

            {/* 생방송 검색 결과 리스트 */}
            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {filteredLogs.map(log => {
                const isSelected = !!selectedBroadcasts[log.id];
                const availableGames = getGamesFromLog(log);
                const selectedGames = selectedBroadcasts[log.id]?.selectedGameNames || [];

                return (
                  <div
                    key={log.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-purple-500 dark:border-purple-400 bg-purple-50/40 dark:bg-purple-950/20 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleBroadcast(log)}
                          className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-zinc-300 dark:border-zinc-700 hover:border-purple-400'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {log.date}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                              {log.category || '종합'}
                            </span>
                            {log.time && (
                              <span className="text-xs text-zinc-400">
                                {log.time} {log.endTime ? `~ ${log.endTime}` : ''}
                              </span>
                            )}
                          </div>

                          {/* 게임 선택 토글 */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {availableGames.map(gameName => {
                              const isGameSelected = isSelected && selectedGames.includes(gameName);
                              return (
                                <button
                                  key={gameName}
                                  type="button"
                                  disabled={!isSelected}
                                  onClick={() => handleToggleGame(log.id, gameName)}
                                  className={`px-2 py-0.5 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                                    !isSelected
                                      ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 opacity-60 cursor-not-allowed'
                                      : isGameSelected
                                      ? 'bg-purple-600 text-white shadow-xs font-bold'
                                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-300'
                                  }`}
                                >
                                  {isGameSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                                  <span>{gameName}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleBroadcast(log)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100'
                            : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
                        }`}
                      >
                        {isSelected ? '선택 해제' : '생방 선택'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. 게임 목록 순서 변경 및 따로 그룹화 영역 */}
          {selectedCount > 0 && (
            <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 sm:p-5 rounded-2xl border border-purple-200 dark:border-purple-900/50 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    게임 순서 변경 & 따로 그룹화 설정
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    연동된 {customSortedGames.length}개 게임의 표시 순서(최신순, 오래된순, 자유)와 그룹화 방식을 설정합니다.
                  </p>
                </div>

                {/* 순서 정렬 선택 버튼 (최신순, 오래된순, 자유) */}
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] font-bold text-zinc-500 px-1.5">순서:</span>
                  {(['latest', 'oldest', 'custom'] as const).map(order => (
                    <button
                      key={order}
                      type="button"
                      onClick={() => handleSortOrderChange(order)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        gameSortOrder === order
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {order === 'latest' ? '최신순' : order === 'oldest' ? '오래된순' : '자유 (수동)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 그룹화 방식 선택 버튼 */}
              <div>
                <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>게임 목록 그룹화 방식:</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'none', label: '그룹 없음 (단일 목록)' },
                    { id: 'broadcast', label: '생방 날짜별 그룹화' },
                    { id: 'category', label: '카테고리별 그룹화' },
                    { id: 'custom', label: '사용자 지정 그룹 생성' },
                  ].map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupingType(g.id as any)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                        groupingType === g.id
                          ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 dark:border-purple-400 text-purple-700 dark:text-purple-300 shadow-xs'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 사용자 지정 그룹 관리 */}
              {groupingType === 'custom' && (
                <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="새 그룹명 (예: 1부 마피아/협동, 2부 공포 등)"
                      className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomGroup}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs flex items-center gap-1 hover:bg-purple-700"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>그룹 생성</span>
                    </button>
                  </div>

                  {customGroups.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      생성된 그룹이 없습니다. 위에서 그룹명을 입력하고 그룹 생성을 눌러주세요.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {customGroups.map(grp => (
                        <div key={grp.groupName} className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-300">
                            <span className="flex items-center gap-1.5">
                              <Folder className="w-3.5 h-3.5" />
                              {grp.groupName} ({grp.gameNames.length}개 게임)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomGroup(grp.groupName)}
                              className="text-red-500 hover:text-red-600 text-[11px]"
                            >
                              그룹 삭제
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {customSortedGames.map(game => {
                              const isInGroup = grp.gameNames.includes(game.name);
                              return (
                                <button
                                  key={game.name}
                                  type="button"
                                  onClick={() => handleToggleGameInGroup(grp.groupName, game.name)}
                                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                                    isInGroup
                                      ? 'bg-purple-600 text-white font-bold'
                                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                                  }`}
                                >
                                  {isInGroup ? '✓ ' : '+ '}
                                  {game.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 게임 순서 리스트 (자유 순서 변경 지원) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <span>게임 목록 순서 조정 ({customSortedGames.length}개)</span>
                  {gameSortOrder === 'custom' && (
                    <span className="text-purple-600 dark:text-purple-400 text-[11px] font-normal">
                      * ▲ / ▼ 버튼을 눌러 자유롭게 순서를 변경할 수 있습니다.
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {customSortedGames.map((game, idx) => (
                    <div
                      key={`${game.name}_${game.date}_${idx}`}
                      className="p-2 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 text-center font-bold text-zinc-400 text-[11px]">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-zinc-900 dark:text-white truncate block">
                            {game.name}
                          </span>
                          <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                            <span>{game.date} 방송</span>
                            <span>·</span>
                            <span>{game.category || '종합'}</span>
                          </span>
                        </div>
                      </div>

                      {/* 순서 조정 버튼 */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveGame(idx, 'up')}
                          className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300 transition-colors"
                          title="위로 이동"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === customSortedGames.length - 1}
                          onClick={() => handleMoveGame(idx, 'down')}
                          className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300 transition-colors"
                          title="아래로 이동"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 저장 / 제출 버튼 */}
          <div className="pt-2 flex items-center justify-end gap-3">
            {editingCompId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting || selectedCount === 0 || !videoTitle.trim() || !videoUrl.trim()}
              onClick={handleSubmit}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  각 생방 목록 및 추천 영상에 연동 저장 중...
                </>
              ) : editingCompId ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  몰아보기 영상 수정 완료 ({selectedCount}개 생방 연동)
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  몰아보기 영상 등록하기 ({selectedCount}개 생방 연동)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 탭 2: 등록된 몰아보기 영상 관리 목록 */}
      {activeSubTab === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                등록된 몰아보기 영상 목록 ({existingCompilations.length}개)
              </h4>
              <p className="text-xs text-zinc-500">
                수정 버튼을 누르면 연동된 생방송, 게임 순서 및 그룹을 언제든지 다시 편집할 수 있습니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                handleCancelEdit();
                setActiveSubTab('form');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새 몰아보기 추가</span>
            </button>
          </div>

          {existingCompilations.length === 0 ? (
            <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
              아직 등록된 몰아보기 영상이 없습니다. [새 몰아보기 등록] 탭에서 추가해보세요!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {existingCompilations.map(comp => {
                const yId = extractYoutubeId(comp.url);

                return (
                  <div
                    key={comp.compilationId}
                    className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-800 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* 썸네일 */}
                      <div className="w-24 h-16 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 relative border border-zinc-200 dark:border-zinc-700">
                        {yId ? (
                          <img
                            src={`https://img.youtube.com/vi/${yId}/mqdefault.jpg`}
                            alt={comp.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <Film className="w-6 h-6" />
                          </div>
                        )}
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-600 text-white">
                          몰아보기
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                            {comp.title}
                          </h5>
                          <a
                            href={comp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-purple-600 transition-colors"
                            title="유튜브에서 영상 열기"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        {/* 연동된 생방 날짜들 */}
                        <div className="flex items-center gap-1 flex-wrap text-[11px] text-zinc-500">
                          <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span>연동 생방 ({comp.allBroadcastDates.length}일):</span>
                          {comp.allBroadcastDates.map(date => (
                            <span
                              key={date}
                              className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-medium"
                            >
                              {date}
                            </span>
                          ))}
                        </div>

                        {/* 게임 태그 목록 */}
                        <div className="flex items-center gap-1 flex-wrap text-[11px] text-zinc-600 dark:text-zinc-400">
                          <Tag className="w-3 h-3 text-zinc-400" />
                          <span>포함 게임:</span>
                          {comp.games.slice(0, 4).map((g, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]"
                            >
                              {g.name}
                            </span>
                          ))}
                          {comp.games.length > 4 && (
                            <span className="text-[10px] text-zinc-400 font-medium">
                              +{comp.games.length - 4}개
                            </span>
                          )}
                          {comp.gameSortOrder && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                              {comp.gameSortOrder === 'latest' ? '최신순' : comp.gameSortOrder === 'oldest' ? '오래된순' : '자유순'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 액션 버튼 (수정, 삭제) */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleEditCompilation(comp)}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>수정하기</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCompilation(comp)}
                        className="px-3.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        title="몰아보기 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
