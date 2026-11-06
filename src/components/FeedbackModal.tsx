import React, { useState, useMemo, useEffect } from 'react';
import { checkSubmit, noteSubmit, visitorId } from '../utils/submitGuard';
import { 
  X, 
  Loader2, 
  ArrowLeft, 
  MessageSquare, 
  Bug, 
  Lightbulb, 
  CheckCircle2, 
  Search, 
  Calendar, 
  Database,
  Trash2,
  PlusCircle,
  FileEdit,
  Gamepad2,
  AlertCircle,
  Film,
  Video,
  Check,
  CheckSquare,
  Square,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  Play
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock } from '../utils';
import { extractYoutubeId } from '../utils/urlUtils';
import { motion, AnimatePresence } from 'motion/react';
import { SystemConfig, AppData, BroadcastLog, GameItem, LinkItem } from '../types';

interface FeedbackModalProps {
  onClose: () => void;
  system?: SystemConfig;
  data?: AppData;
}

// 개별 선택 가능한 항목 인터페이스
export interface SelectableItem {
  id: string; // e.g. "logId::date", "logId::game::0", "logId::video::0", "logId::shorts::0"
  logId: string;
  logDate: string;
  type: 'date' | 'game' | 'video' | 'shorts';
  index?: number;
  // 기존 정보 (미리보기 바탕)
  originalTitle?: string;
  originalName?: string;
  originalLink?: string;
  originalUrl?: string;
  originalDate?: string;
  originalTime?: string;
  originalEndTime?: string;
  // 수정 요청 필드 (사용자 입력)
  requestedTitle?: string;
  requestedName?: string;
  requestedLink?: string;
  requestedUrl?: string;
  requestedDate?: string;
  requestedTime?: string;
  requestedEndTime?: string;
}

export function FeedbackModal({ onClose, system, data }: FeedbackModalProps) {
  useBodyScrollLock(true);
  const [tab, setTab] = useState<'suggestion' | 'bug' | 'data_request'>('suggestion');
  
  // 기능 제안 & 버그 제보 공통 필드
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [os, setOs] = useState('iOS 및 iPadOS');
  
  // 데이터 추가/수정/삭제 요청 전용 필드
  const [dataRequestType, setDataRequestType] = useState<'edit' | 'delete' | 'add'>('edit');
  const [searchQuery, setSearchQuery] = useState('');

  // 복수 선택된 항목 키 Set
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  // 선택 및 추가된 필드 데이터 맵 (id -> SelectableItem)
  const [itemDetails, setItemDetails] = useState<Record<string, SelectableItem>>({});
  // 검색 결과 중 펼쳐진 방송 일지 카드 ID Set
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  // 신규 추가(add) 전용 분류 필드 상태
  const [newLogDate, setNewLogDate] = useState('');
  const [newLogTime, setNewLogTime] = useState('');
  const [newLogEndTime, setNewLogEndTime] = useState('');
  const [newGames, setNewGames] = useState<{ name: string; link: string }[]>([{ name: '', link: '' }]);
  const [newVideos, setNewVideos] = useState<{ title: string; url: string }[]>([{ title: '', url: '' }]);
  const [newShorts, setNewShorts] = useState<{ title: string; url: string }[]>([{ title: '', url: '' }]);

  const tabOptions = useMemo(() => {
    if (system?.feedbackTabs && Array.isArray(system.feedbackTabs) && system.feedbackTabs.length > 0) {
      return [...system.feedbackTabs, '직접 입력'];
    }
    return ['직접 입력'];
  }, [system?.feedbackTabs]);

  const [problemArea, setProblemArea] = useState(() => tabOptions[0] || '직접 입력');

  useEffect(() => {
    if (tabOptions.length > 0 && !tabOptions.includes(problemArea)) {
      setProblemArea(tabOptions[0]);
    }
  }, [tabOptions, problemArea]);

  const [customProblemArea, setCustomProblemArea] = useState('');
  const [consoleLog, setConsoleLog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const { user } = useAuth();

  // 방송 일지 제목 및 게임 설명 헬퍼
  const getLogTitle = (log: BroadcastLog) => {
    if (log.isAbsence) {
      return log.illnessName 
        ? `휴방 (${log.illnessName})` 
        : (log.absenceReasons && log.absenceReasons.length > 0 ? `휴방 (${log.absenceReasons.join(', ')})` : '휴방 기록');
    }
    const mainVod = log.vods?.[0]?.title || log.edited?.[0]?.title;
    if (mainVod) return mainVod;
    const gameNames = log.games?.map(g => g.name).filter(Boolean).join(', ') || log.game;
    if (gameNames) return gameNames;
    return `${log.date} 생방송`;
  };

  // 모든 방송 로그 정렬 (최신순)
  const allLogs = useMemo(() => {
    return Object.values(data?.logs || {}).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data?.logs]);

  // 검색 쿼리에 따른 일지 필터링: 날짜, 영상 제목/링크, 쇼츠 제목/링크, 게임 제목/링크 전체 매칭
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allLogs.filter(log => {
      // 1. 날짜 검색
      const dateMatch = (log.date || '').toLowerCase().includes(q);
      
      // 2. 영상 제목 및 영상 링크 검색 (vods 및 edited)
      const vodMatch = (log.vods || []).some(v => 
        (v.title || '').toLowerCase().includes(q) || (v.url || '').toLowerCase().includes(q)
      );
      const editedMatch = (log.edited || []).some(e => 
        (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q)
      );

      // 3. 쇼츠 제목 및 쇼츠 링크 검색
      const shortsMatch = (log.shorts || []).some(s => 
        (s.title || '').toLowerCase().includes(q) || (s.url || '').toLowerCase().includes(q)
      );

      // 4. 게임 제목 및 게임 링크 검색
      const gamesMatch = (log.games || []).some(g => 
        (g.name || '').toLowerCase().includes(q) || (g.link || '').toLowerCase().includes(q)
      );
      const singleGameMatch = (log.game || '').toLowerCase().includes(q);

      // 5. 휴방 및 질환명 매칭
      const illnessMatch = (log.illnessName || '').toLowerCase().includes(q);
      const absenceMatch = Boolean(log.isAbsence && (
        (log.absenceReasons || []).some(r => r.toLowerCase().includes(q)) || illnessMatch
      ));

      return dateMatch || vodMatch || editedMatch || shortsMatch || gamesMatch || singleGameMatch || absenceMatch;
    }).slice(0, 15);
  }, [allLogs, searchQuery]);

  // 방송 로그에서 선택 가능한 하위 항목 목록 추출 헬퍼
  const getLogSelectableItems = (log: BroadcastLog): SelectableItem[] => {
    const items: SelectableItem[] = [];

    // 1. 방송 날짜 및 시간 항목
    items.push({
      id: `${log.id}::date`,
      logId: log.id,
      logDate: log.date,
      type: 'date',
      originalDate: log.date,
      originalTime: log.time || '',
      originalEndTime: log.endTime || '',
      requestedDate: itemDetails[`${log.id}::date`]?.requestedDate ?? log.date,
      requestedTime: itemDetails[`${log.id}::date`]?.requestedTime ?? (log.time || ''),
      requestedEndTime: itemDetails[`${log.id}::date`]?.requestedEndTime ?? (log.endTime || '')
    });

    // 2. 게임 항목들
    if (log.games && log.games.length > 0) {
      log.games.forEach((g, idx) => {
        const itemId = `${log.id}::game::${idx}`;
        const origLink = g.link || (g as any).url || (g as any).gameUrl || (g as any).steamUrl || (log as any)?.gameLink || '';
        items.push({
          id: itemId,
          logId: log.id,
          logDate: log.date,
          type: 'game',
          index: idx,
          originalName: g.name,
          originalLink: origLink,
          requestedName: itemDetails[itemId]?.requestedName ?? g.name,
          requestedLink: itemDetails[itemId]?.requestedLink ?? origLink
        });
      });
    } else if (log.game) {
      const origLink = (log as any)?.gameLink || '';
      const itemId = `${log.id}::game::0`;
      items.push({
        id: itemId,
        logId: log.id,
        logDate: log.date,
        type: 'game',
        index: 0,
        originalName: log.game,
        originalLink: origLink,
        requestedName: itemDetails[itemId]?.requestedName ?? log.game,
        requestedLink: itemDetails[itemId]?.requestedLink ?? origLink
      });
    }

    // 3. 영상 / 다시보기 항목들 (vods + edited)
    const allVideos = [...(log.vods || []), ...(log.edited || [])];
    allVideos.forEach((v, idx) => {
      const itemId = `${log.id}::video::${idx}`;
      items.push({
        id: itemId,
        logId: log.id,
        logDate: log.date,
        type: 'video',
        index: idx,
        originalTitle: v.title,
        originalUrl: v.url || '',
        requestedTitle: itemDetails[itemId]?.requestedTitle ?? v.title,
        requestedUrl: itemDetails[itemId]?.requestedUrl ?? (v.url || '')
      });
    });

    // 4. 쇼츠 항목들
    (log.shorts || []).forEach((s, idx) => {
      const itemId = `${log.id}::shorts::${idx}`;
      items.push({
        id: itemId,
        logId: log.id,
        logDate: log.date,
        type: 'shorts',
        index: idx,
        originalTitle: s.title,
        originalUrl: s.url || '',
        requestedTitle: itemDetails[itemId]?.requestedTitle ?? s.title,
        requestedUrl: itemDetails[itemId]?.requestedUrl ?? (s.url || '')
      });
    });

    return items;
  };

  // 단일 항목 선택 토글
  const toggleItemSelection = (item: SelectableItem) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
        // 기본값 세팅
        setItemDetails(curr => ({
          ...curr,
          [item.id]: {
            ...item,
            ...(curr[item.id] || {})
          }
        }));
      }
      return next;
    });
  };

  // 한 방송의 모든 하위 항목 일괄 선택/해제 토글
  const toggleSelectAllLogItems = (log: BroadcastLog) => {
    const items = getLogSelectableItems(log);
    const allSelected = items.every(it => selectedItemIds.has(it.id));

    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach(it => next.delete(it.id));
      } else {
        items.forEach(it => {
          next.add(it.id);
          setItemDetails(curr => ({
            ...curr,
            [it.id]: {
              ...it,
              ...(curr[it.id] || {})
            }
          }));
        });
      }
      return next;
    });
  };

  // 세부 필드 값 업데이트
  const updateItemField = (id: string, field: keyof SelectableItem, value: string) => {
    setItemDetails(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || { id, type: 'game', logId: '', logDate: '' }),
        [field]: value
      }
    }));
  };

  // 선택된 항목 목록 계산
  const selectedItemsList = useMemo(() => {
    return Array.from(selectedItemIds)
      .map(id => itemDetails[id])
      .filter(Boolean) as SelectableItem[];
  }, [selectedItemIds, itemDetails]);

  // 선택된 항목들의 방송 일지 ID 목록
  const distinctSelectedLogDates = useMemo(() => {
    const dates = new Set<string>();
    selectedItemsList.forEach(it => {
      if (it.logDate) dates.add(it.logDate);
    });
    return Array.from(dates).sort().reverse();
  }, [selectedItemsList]);

  // 상세정보 양식: 분류된 필드들
  const selectedDateItems = useMemo(() => selectedItemsList.filter(it => it.type === 'date'), [selectedItemsList]);
  const selectedGameItems = useMemo(() => selectedItemsList.filter(it => it.type === 'game'), [selectedItemsList]);
  const selectedVideoItems = useMemo(() => selectedItemsList.filter(it => it.type === 'video'), [selectedItemsList]);
  const selectedShortsItems = useMemo(() => selectedItemsList.filter(it => it.type === 'shorts'), [selectedItemsList]);

  // 새로운 커스텀 추가 필드 핸들러 (사용자가 누락된 영상/게임/쇼츠 추가 시)
  const handleAddNewItemToLog = (type: 'game' | 'video' | 'shorts') => {
    const baseDate = distinctSelectedLogDates[0] || new Date().toISOString().substring(0, 10);
    const customId = `custom::${type}::${Date.now()}`;
    const newItem: SelectableItem = {
      id: customId,
      logId: 'custom',
      logDate: baseDate,
      type,
      originalName: '(신규 추가)',
      originalTitle: '(신규 추가)',
      originalLink: '',
      originalUrl: '',
      requestedName: '',
      requestedTitle: '',
      requestedLink: '',
      requestedUrl: ''
    };
    setItemDetails(prev => ({ ...prev, [customId]: newItem }));
    setSelectedItemIds(prev => new Set(prev).add(customId));
  };

  // 선택된 항목 바탕으로 기본 제목 및 분류 요약 본문 자동 생성
  useEffect(() => {
    if (tab !== 'data_request') return;

    if (dataRequestType === 'edit' && selectedItemsList.length > 0) {
      if (!title || title.startsWith('[데이터 수정]')) {
        const dateStr = distinctSelectedLogDates.join(', ');
        const countStr = selectedItemsList.length;
        setTitle(`[데이터 수정] ${dateStr} (${countStr}개 항목 수정 요청)`);
      }
    } else if (dataRequestType === 'delete' && selectedItemsList.length > 0) {
      if (!title || title.startsWith('[데이터 삭제]')) {
        const dateStr = distinctSelectedLogDates.join(', ');
        setTitle(`[데이터 삭제] ${dateStr} 기록 삭제 요청`);
      }
    }
  }, [tab, dataRequestType, selectedItemsList.length, distinctSelectedLogDates]);

  const handleSafeClose = () => {
    try {
      if (window.history.state?.view === 'feedback_modal') {
        window.history.back();
        return;
      }
    } catch {}
    onClose();
  };

  useEffect(() => {
    try {
      if (window.history.state?.view !== 'feedback_modal') {
        window.history.pushState({ view: 'feedback_modal' }, '', window.location.pathname);
      }
    } catch {}

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  const isAppleDevice = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod|Macintosh|Mac OS X/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  // 최종 전송 본문 조합
  const generateFinalContent = () => {
    if (tab !== 'data_request') return content.trim();

    const sections: string[] = [];

    if (dataRequestType === 'edit' || dataRequestType === 'delete') {
      sections.push(`[선택 대상 방송: ${distinctSelectedLogDates.join(', ') || '직접 입력'}]`);
      sections.push(`요청 구분: ${dataRequestType === 'edit' ? '데이터 수정' : '데이터 삭제'}\n`);

      // 1. 방송 일자 및 시간 필드
      if (selectedDateItems.length > 0) {
        sections.push('■ [방송 일자 및 시간]');
        selectedDateItems.forEach(it => {
          sections.push(`- 기존: ${it.originalDate} (${it.originalTime || '시작 미기재'} ~ ${it.originalEndTime || '종료 미기재'})`);
          if (dataRequestType === 'edit') {
            sections.push(`- 요청: ${it.requestedDate || it.originalDate} (${it.requestedTime || it.originalTime || '시작 미기재'} ~ ${it.requestedEndTime || it.originalEndTime || '종료 미기재'})`);
          }
        });
        sections.push('');
      }

      // 2. 게임 정보 필드
      if (selectedGameItems.length > 0) {
        sections.push('■ [게임 정보]');
        selectedGameItems.forEach(it => {
          sections.push(`- 기존 게임: ${it.originalName || '(없음)'} (링크: ${it.originalLink || '없음'})`);
          if (dataRequestType === 'edit') {
            sections.push(`- 변경 요청: ${it.requestedName || it.originalName} (링크: ${it.requestedLink || it.originalLink || '없음'})`);
          }
        });
        sections.push('');
      }

      // 3. 다시보기 및 영상 필드
      if (selectedVideoItems.length > 0) {
        sections.push('■ [영상 및 다시보기]');
        selectedVideoItems.forEach(it => {
          sections.push(`- 기존 영상: ${it.originalTitle || '(없음)'} (URL: ${it.originalUrl || '없음'})`);
          if (dataRequestType === 'edit') {
            sections.push(`- 변경 요청: ${it.requestedTitle || it.originalTitle} (URL: ${it.requestedUrl || it.originalUrl || '없음'})`);
          }
        });
        sections.push('');
      }

      // 4. 쇼츠 필드
      if (selectedShortsItems.length > 0) {
        sections.push('■ [쇼츠]');
        selectedShortsItems.forEach(it => {
          sections.push(`- 기존 쇼츠: ${it.originalTitle || '(없음)'} (URL: ${it.originalUrl || '없음'})`);
          if (dataRequestType === 'edit') {
            sections.push(`- 변경 요청: ${it.requestedTitle || it.originalTitle} (URL: ${it.requestedUrl || it.originalUrl || '없음'})`);
          }
        });
        sections.push('');
      }

      if (content.trim()) {
        sections.push(`■ [상세 설명 및 추가 요청 사유]\n${content.trim()}`);
      }
    } else if (dataRequestType === 'add') {
      sections.push('[신규 방송 데이터 추가 요청]\n');
      sections.push(`- 방송 일자: ${newLogDate || '미입력'}`);
      if (newLogTime || newLogEndTime) {
        sections.push(`- 방송 시간: ${newLogTime || '미입력'} ~ ${newLogEndTime || '미입력'}`);
      }
      
      const validGames = newGames.filter(g => g.name.trim() || g.link.trim());
      if (validGames.length > 0) {
        sections.push('■ 플레이 게임:');
        validGames.forEach((g, idx) => {
          sections.push(`  ${idx + 1}. ${g.name} (링크: ${g.link || '없음'})`);
        });
      }

      const validVideos = newVideos.filter(v => v.title.trim() || v.url.trim());
      if (validVideos.length > 0) {
        sections.push('■ 영상 목록:');
        validVideos.forEach((v, idx) => {
          sections.push(`  ${idx + 1}. ${v.title} (URL: ${v.url || '없음'})`);
        });
      }

      const validShorts = newShorts.filter(s => s.title.trim() || s.url.trim());
      if (validShorts.length > 0) {
        sections.push('■ 쇼츠 목록:');
        validShorts.forEach((s, idx) => {
          sections.push(`  ${idx + 1}. ${s.title} (URL: ${s.url || '없음'})`);
        });
      }

      if (content.trim()) {
        sections.push(`\n■ 추가 설명:\n${content.trim()}`);
      }
    }

    return sections.join('\n');
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    if (tab === 'data_request' && dataRequestType !== 'add' && selectedItemsList.length === 0 && !content.trim()) {
      alert('수정 또는 삭제할 항목을 검색하여 1개 이상 선택하거나 변경 내용을 작성해주세요.');
      return;
    }

    if (tab !== 'data_request' && !content.trim()) {
      alert('상세 내용을 입력해주세요.');
      return;
    }

    // 짧은 시간에 여러 번 보내지 않게 (같은 제목·내용은 하루 한 번)
    const guardKey = `${tab}|${title.trim().slice(0, 40)}|${content.trim().slice(0, 80)}|${selectedItemsList.length}`;
    const blocked = checkSubmit('feedback', guardKey);
    if (blocked) { alert(blocked); return; }
    setIsSubmitting(true);
    try {
      const area = problemArea === '직접 입력' ? customProblemArea : problemArea;
      const finalContent = tab === 'bug' && consoleLog 
        ? `${content}\n\n[Console Log]\n${consoleLog}` 
        : generateFinalContent();

      await addDoc(collection(db, 'feedbacks'), {
        type: tab,
        dataRequestType: tab === 'data_request' ? dataRequestType : null,
        targetLogDates: tab === 'data_request' ? distinctSelectedLogDates : null,
        targetLogSummary: tab === 'data_request' && distinctSelectedLogDates.length > 0
          ? `${distinctSelectedLogDates.join(', ')} (${selectedItemsList.length}개 항목)`
          : null,
        selectedItemsCount: selectedItemsList.length,
        selectedItemDetails: selectedItemsList.map(it => ({
          id: it.id,
          type: it.type,
          logDate: it.logDate,
          originalName: it.originalName || null,
          originalTitle: it.originalTitle || null,
          originalLink: it.originalLink || it.originalUrl || null,
          requestedName: it.requestedName || null,
          requestedTitle: it.requestedTitle || null,
          requestedLink: it.requestedLink || it.requestedUrl || null,
          requestedDate: it.requestedDate || null,
          requestedTime: it.requestedTime || null
        })),
        title: title.trim(),
        content: finalContent.trim(),
        os: tab === 'bug' ? os : null,
        problemArea: tab === 'bug' ? area : null,
        uid: user?.uid || null,
        email: user?.email || null,
        vid: visitorId(),
        createdAt: serverTimestamp()
      });
      noteSubmit('feedback', guardKey);

      setIsSubmitted(true);
      setTimeout(() => {
        handleSafeClose();
      }, 1400);
    } catch (e: any) {
      console.error(e);
      alert('전송 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSafeClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs"
      />

      {/* Main Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%', transition: { type: 'spring', damping: 36, stiffness: 360, mass: 0.9 } }}
        transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
        className="relative z-10 w-full lg:max-w-2xl h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col shadow-2xl overflow-hidden feedback-modal"
      >
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5 min-h-[56px] sm:min-h-[60px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSafeClose}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="뒤로가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                의견 보내기
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-2 -mr-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {isSubmitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">소중한 의견이 접수되었어요!</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
                보내주신 피드백을 신속히 검토하여 더 쾌적한 트래커를 만들겠어요. 감사해요.
              </p>
            </div>
          ) : (
            <div className="space-y-5 max-w-xl mx-auto">
              {/* 3-Way Type Switcher Tab: 기능 제안 / 버그 제보 / 데이터 요청 */}
              <div className="grid grid-cols-3 p-1 bg-zinc-200/70 dark:bg-zinc-800/80 rounded-2xl shrink-0 gap-1">
                <button 
                  type="button"
                  onClick={() => setTab('suggestion')} 
                  className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    tab === 'suggestion' 
                      ? 'bg-white dark:bg-zinc-900 shadow-sm text-purple-600 dark:text-purple-400' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                  <span>기능 제안</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setTab('bug')} 
                  className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    tab === 'bug' 
                      ? 'bg-white dark:bg-zinc-900 shadow-sm text-red-600 dark:text-red-400' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Bug className="w-3.5 h-3.5 shrink-0" />
                  <span>버그 제보</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setTab('data_request')} 
                  className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    tab === 'data_request' 
                      ? 'bg-white dark:bg-zinc-900 shadow-sm text-indigo-600 dark:text-indigo-400' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Database className="w-3.5 h-3.5 shrink-0" />
                  <span>데이터 요청</span>
                </button>
              </div>

              {/* Form Cards */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-5 sm:p-6 shadow-xs space-y-4">
                
                {/* 데이터 요청 탭일 경우: 추가/수정/삭제 서브타입 선택 */}
                {tab === 'data_request' && (
                  <div className="space-y-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      요청 구분 <span className="text-purple-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setDataRequestType('edit')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          dataRequestType === 'edit'
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 shadow-xs'
                            : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-100'
                        }`}
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>데이터 수정</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDataRequestType('delete')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          dataRequestType === 'delete'
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border-red-300 dark:border-red-700 shadow-xs'
                            : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-100'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>데이터 삭제</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDataRequestType('add')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          dataRequestType === 'add'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-xs'
                            : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-100'
                        }`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>신규 추가</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 데이터 수정/삭제 시: 통합 검색창 및 딸린 항목 복수 선택 패널 */}
                {tab === 'data_request' && dataRequestType !== 'add' && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        수정 대상 검색 (날짜, 영상 제목/링크, 쇼츠 제목/링크, 게임명/링크) <span className="text-purple-500">*</span>
                      </label>
                      {selectedItemIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedItemIds(new Set())}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          전체 선택 해제 ({selectedItemIds.size}개)
                        </button>
                      )}
                    </div>

                    {/* 검색창 */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="날짜(예: 2024-05), 영상 제목/링크, 쇼츠, 게임명 검색..."
                        className="w-full pl-9 pr-8 py-2.5 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 검색 결과 리스트 & 방송에 딸린 세부 항목 복수 선택 */}
                    {searchQuery.trim() && (
                      <div className="border border-zinc-200 dark:border-zinc-700/80 rounded-2xl bg-zinc-50/90 dark:bg-zinc-800/40 p-2 max-h-72 overflow-y-auto space-y-2">
                        {searchResults.length > 0 ? (
                          searchResults.map(log => {
                            const items = getLogSelectableItems(log);
                            const isAllLogSelected = items.every(it => selectedItemIds.has(it.id));
                            const someSelected = items.some(it => selectedItemIds.has(it.id));
                            const isExpanded = expandedLogIds.has(log.id) || searchResults.length <= 3;

                            return (
                              <div
                                key={log.id}
                                className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-3 space-y-2.5 shadow-2xs transition-all"
                              >
                                {/* 방송 메인 헤더 */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {log.date}
                                      </span>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        log.isAbsence ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      }`}>
                                        {log.isAbsence ? '휴방' : '생방송'}
                                      </span>
                                    </div>
                                    <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                                      {getLogTitle(log)}
                                    </h4>
                                  </div>

                                  {/* 전체 선택 토글 버튼 */}
                                  <button
                                    type="button"
                                    onClick={() => toggleSelectAllLogItems(log)}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors border cursor-pointer ${
                                      isAllLogSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                        : someSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200'
                                    }`}
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>{isAllLogSelected ? '전체 해제' : '전체 선택'}</span>
                                  </button>
                                </div>

                                {/* 딸린 하위 항목들 (복수 선택 가능) */}
                                <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                                  <div className="text-[10px] font-bold text-zinc-400 flex items-center justify-between">
                                    <span>수정할 세부 항목 선택 (복수 선택 가능):</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedLogIds(curr => {
                                          const next = new Set(curr);
                                          if (next.has(log.id)) next.delete(log.id);
                                          else next.add(log.id);
                                          return next;
                                        });
                                      }}
                                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-0.5"
                                    >
                                      <span>{isExpanded ? '접기' : `항목 펼치기 (${items.length}개)`}</span>
                                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                  </div>

                                  {isExpanded && (
                                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                                      {items.map(item => {
                                        const isSelected = selectedItemIds.has(item.id);
                                        return (
                                          <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => toggleItemSelection(item)}
                                            className={`w-full text-left p-2 rounded-lg border transition-all flex items-start gap-2 cursor-pointer ${
                                              isSelected
                                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700/80 shadow-2xs'
                                                : 'bg-zinc-50/60 dark:bg-zinc-800/40 border-zinc-200/70 dark:border-zinc-700/50 hover:bg-zinc-100/80'
                                            }`}
                                          >
                                            <div className="mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0">
                                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-zinc-400" />}
                                            </div>
                                            <div className="min-w-0 flex-1 text-xs">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                                  item.type === 'date'
                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                                    : item.type === 'game'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                    : item.type === 'video'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                                }`}>
                                                  {item.type === 'date' ? '날짜/시간' : item.type === 'game' ? '게임' : item.type === 'video' ? '영상' : '쇼츠'}
                                                </span>
                                                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                                  {item.type === 'date'
                                                    ? `${item.originalDate} (${item.originalTime || '시작 미기재'} ~ ${item.originalEndTime || '종료 미기재'})`
                                                    : item.type === 'game'
                                                    ? item.originalName
                                                    : item.originalTitle}
                                                </span>
                                              </div>
                                              {(item.originalLink || item.originalUrl) && (
                                                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                                  링크: {item.originalLink || item.originalUrl}
                                                </div>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-6 text-xs text-zinc-400">
                            일치하는 날짜, 영상, 쇼츠 또는 게임 데이터가 없어요.
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!searchQuery.trim() && selectedItemsList.length === 0 && (
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span>수정할 방송 날짜, 영상 제목, 쇼츠 제목, 게임명을 검색하여 대상을 복수 선택해주세요.</span>
                      </p>
                    )}
                  </div>
                )}

                {/* 상세정보 양식: 기존 미리보기를 바탕으로 각각 필드로 분류 */}
                {tab === 'data_request' && dataRequestType === 'edit' && selectedItemsList.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileEdit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                          선택 항목 상세 수정 양식 ({selectedItemsList.length}개)
                        </h4>
                      </div>
                    </div>

                    {/* 1. 방송 일자 및 시간 필드 */}
                    {selectedDateItems.length > 0 && (
                      <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/50 rounded-2xl space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-300">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          <span>방송 일자 및 시간 분류</span>
                        </div>
                        {selectedDateItems.map(item => (
                          <div key={item.id} className="space-y-2 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                            <div className="text-[11px] text-zinc-500">
                              기존 기록: <strong className="text-zinc-800 dark:text-zinc-200">{item.originalDate}</strong> ({item.originalTime || '시작 미기재'} ~ {item.originalEndTime || '종료 미기재'})
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 날짜</label>
                                <input
                                  type="date"
                                  value={item.requestedDate || ''}
                                  onChange={e => updateItemField(item.id, 'requestedDate', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">시작 시간</label>
                                <input
                                  type="text"
                                  placeholder="예: 20:00"
                                  value={item.requestedTime || ''}
                                  onChange={e => updateItemField(item.id, 'requestedTime', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">종료 시간</label>
                                <input
                                  type="text"
                                  placeholder="예: 23:30"
                                  value={item.requestedEndTime || ''}
                                  onChange={e => updateItemField(item.id, 'requestedEndTime', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 2. 게임 정보 필드 */}
                    {selectedGameItems.length > 0 && (
                      <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                            <Gamepad2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>게임 정보 분류 ({selectedGameItems.length}개)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddNewItemToLog('game')}
                            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> 게임 추가
                          </button>
                        </div>
                        {selectedGameItems.map((item, gIdx) => (
                          <div key={item.id} className="space-y-2 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-zinc-500">게임 #{gIdx + 1} ({item.logDate})</span>
                              <span className="text-[10px] text-zinc-400">기존명: {item.originalName}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 게임 제목</label>
                                <input
                                  type="text"
                                  placeholder="게임 제목 입력"
                                  value={item.requestedName ?? item.originalName ?? ''}
                                  onChange={e => updateItemField(item.id, 'requestedName', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 게임 링크 (URL)</label>
                                <input
                                  type="url"
                                  placeholder="스팀 또는 공식 웹사이트 링크"
                                  value={item.requestedLink ?? item.originalLink ?? ''}
                                  onChange={e => updateItemField(item.id, 'requestedLink', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 3. 다시보기 및 영상 필드 */}
                    {selectedVideoItems.length > 0 && (
                      <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/50 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                            <Film className="w-3.5 h-3.5 text-blue-600" />
                            <span>영상 및 다시보기 정보 분류 ({selectedVideoItems.length}개)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddNewItemToLog('video')}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> 영상 추가
                          </button>
                        </div>
                        {selectedVideoItems.map((item, vIdx) => {
                          const activeUrl = item.requestedUrl ?? item.originalUrl ?? '';
                          const ytId = extractYoutubeId(activeUrl);
                          return (
                            <div key={item.id} className="space-y-2.5 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-zinc-500">영상 #{vIdx + 1} ({item.logDate})</span>
                                {item.originalUrl && (
                                  <a
                                    href={item.originalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
                                  >
                                    기존 링크 확인 <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>

                              {/* 영상 미리보기 썸네일 */}
                              {ytId && (
                                <div className="relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 max-w-[200px] aspect-video bg-black flex items-center justify-center">
                                  <img 
                                    src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} 
                                    alt="영상 미리보기" 
                                    className="w-full h-full object-cover" 
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
                                    <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white">
                                      <Play className="w-3 h-3 fill-current ml-0.5" />
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 영상 제목</label>
                                  <input
                                    type="text"
                                    placeholder="영상 제목 입력"
                                    value={item.requestedTitle ?? item.originalTitle ?? ''}
                                    onChange={e => updateItemField(item.id, 'requestedTitle', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 영상 링크 (URL)</label>
                                  <input
                                    type="url"
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    value={item.requestedUrl ?? item.originalUrl ?? ''}
                                    onChange={e => updateItemField(item.id, 'requestedUrl', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 4. 쇼츠 필드 */}
                    {selectedShortsItems.length > 0 && (
                      <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/50 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 dark:text-rose-300">
                            <Video className="w-3.5 h-3.5 text-rose-600" />
                            <span>쇼츠 정보 분류 ({selectedShortsItems.length}개)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddNewItemToLog('shorts')}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> 쇼츠 추가
                          </button>
                        </div>
                        {selectedShortsItems.map((item, sIdx) => {
                          const activeUrl = item.requestedUrl ?? item.originalUrl ?? '';
                          const ytId = extractYoutubeId(activeUrl);
                          return (
                            <div key={item.id} className="space-y-2.5 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-zinc-500">쇼츠 #{sIdx + 1} ({item.logDate})</span>
                                {item.originalUrl && (
                                  <a
                                    href={item.originalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-rose-500 hover:underline flex items-center gap-0.5"
                                  >
                                    기존 링크 확인 <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>

                              {ytId && (
                                <div className="relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 max-w-[130px] aspect-[9/16] bg-black flex items-center justify-center">
                                  <img 
                                    src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} 
                                    alt="쇼츠 미리보기" 
                                    className="w-full h-full object-cover" 
                                  />
                                </div>
                              )}

                              <div className="space-y-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 쇼츠 제목</label>
                                  <input
                                    type="text"
                                    placeholder="쇼츠 제목 입력"
                                    value={item.requestedTitle ?? item.originalTitle ?? ''}
                                    onChange={e => updateItemField(item.id, 'requestedTitle', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">수정할 쇼츠 링크 (URL)</label>
                                  <input
                                    type="url"
                                    placeholder="https://www.youtube.com/shorts/..."
                                    value={item.requestedUrl ?? item.originalUrl ?? ''}
                                    onChange={e => updateItemField(item.id, 'requestedUrl', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 신규 추가(add) 전용 분류 필드 양식 */}
                {tab === 'data_request' && dataRequestType === 'add' && (
                  <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      <PlusCircle className="w-4 h-4" />
                      <span>신규 방송 데이터 등록 양식</span>
                    </div>

                    {/* 1. 방송 일자 및 시간 */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl space-y-2 border border-zinc-200 dark:border-zinc-700/60">
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        방송 일자 및 시간 *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="date"
                          value={newLogDate}
                          onChange={e => setNewLogDate(e.target.value)}
                          className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="시작 시간 (예: 20:00)"
                          value={newLogTime}
                          onChange={e => setNewLogTime(e.target.value)}
                          className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="종료 시간 (예: 23:30)"
                          value={newLogEndTime}
                          onChange={e => setNewLogEndTime(e.target.value)}
                          className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* 2. 게임 목록 */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl space-y-2 border border-zinc-200 dark:border-zinc-700/60">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">게임 목록</label>
                        <button
                          type="button"
                          onClick={() => setNewGames(prev => [...prev, { name: '', link: '' }])}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> 게임 추가
                        </button>
                      </div>
                      {newGames.map((g, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="게임 제목"
                            value={g.name}
                            onChange={e => {
                              const val = e.target.value;
                              setNewGames(prev => prev.map((item, i) => i === idx ? { ...item, name: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                          <input
                            type="url"
                            placeholder="게임 링크 (선택)"
                            value={g.link}
                            onChange={e => {
                              const val = e.target.value;
                              setNewGames(prev => prev.map((item, i) => i === idx ? { ...item, link: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                        </div>
                      ))}
                    </div>

                    {/* 3. 영상 목록 */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl space-y-2 border border-zinc-200 dark:border-zinc-700/60">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">다시보기 / 영상 목록</label>
                        <button
                          type="button"
                          onClick={() => setNewVideos(prev => [...prev, { title: '', url: '' }])}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> 영상 추가
                        </button>
                      </div>
                      {newVideos.map((v, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="영상 제목"
                            value={v.title}
                            onChange={e => {
                              const val = e.target.value;
                              setNewVideos(prev => prev.map((item, i) => i === idx ? { ...item, title: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                          <input
                            type="url"
                            placeholder="유튜브 링크 URL"
                            value={v.url}
                            onChange={e => {
                              const val = e.target.value;
                              setNewVideos(prev => prev.map((item, i) => i === idx ? { ...item, url: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                        </div>
                      ))}
                    </div>

                    {/* 4. 쇼츠 목록 */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl space-y-2 border border-zinc-200 dark:border-zinc-700/60">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">쇼츠 목록</label>
                        <button
                          type="button"
                          onClick={() => setNewShorts(prev => [...prev, { title: '', url: '' }])}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> 쇼츠 추가
                        </button>
                      </div>
                      {newShorts.map((s, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="쇼츠 제목"
                            value={s.title}
                            onChange={e => {
                              const val = e.target.value;
                              setNewShorts(prev => prev.map((item, i) => i === idx ? { ...item, title: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                          <input
                            type="url"
                            placeholder="쇼츠 링크 URL"
                            value={s.url}
                            onChange={e => {
                              const val = e.target.value;
                              setNewShorts(prev => prev.map((item, i) => i === idx ? { ...item, url: val } : item));
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 제목 입력 필드 */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    제목 <span className="text-purple-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={
                      tab === 'suggestion' 
                        ? '예: 캘린더 요일별 필터 기능 제안' 
                        : tab === 'bug'
                        ? '예: 모바일에서 통계 툴팁 짤림 현상'
                        : dataRequestType === 'edit'
                        ? '예: 2024-05-10 방송 게임 이름 및 영상 링크 수정 요청'
                        : dataRequestType === 'delete'
                        ? '예: 2023-11-04 중복 등록된 방송 기록 삭제 요청'
                        : '예: 2024-08-15 누락된 방송 기록 추가 요청'
                    }
                    className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  />
                </div>

                {/* 버그 제보 탭 전용 옵션 */}
                {tab === 'bug' && (
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">사용 기기 / OS</label>
                        <select 
                          value={os}
                          onChange={e => setOs(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option>iOS 및 iPadOS</option>
                          <option>Android</option>
                          <option>Windows</option>
                          <option>MacOS</option>
                          <option>기타</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">발생 위치 (영역)</label>
                        <select 
                          value={problemArea}
                          onChange={e => setProblemArea(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          {tabOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {problemArea === '직접 입력' && (
                      <input 
                        type="text" 
                        value={customProblemArea}
                        onChange={e => setCustomProblemArea(e.target.value)}
                        placeholder="문제가 발생한 위치를 직접 입력해주세요"
                        className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    )}

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                        <span>오류 로그 / 콘솔 텍스트 (선택)</span>
                        <span className="text-[10px] text-zinc-400 font-normal">PC: F12 → Console 붉은 에러 문구</span>
                      </label>
                      <textarea 
                        placeholder="복사한 에러 로그나 비정상 동작 증상을 적어주시면 빠른 원인 파악이 가능해요."
                        className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 text-xs min-h-[60px] text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono resize-y"
                        value={consoleLog}
                        onChange={e => setConsoleLog(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 상세 설명 (자유 설명 및 추가 사유) */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    {tab === 'data_request'
                      ? dataRequestType === 'edit'
                        ? '추가 설명 및 요청 사유 (선택 또는 상세)'
                        : dataRequestType === 'delete'
                        ? '삭제 요청 사유 *'
                        : '추가할 방송 상세 정보 (날짜, 제목, 게임 목록 등) *'
                      : '상세 설명 *'
                    }
                  </label>
                  <textarea 
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={
                      tab === 'suggestion' 
                        ? '제안하시고자 하는 내용과 기대되는 효과를 자유롭게 작성해주세요.' 
                        : tab === 'bug'
                        ? '어떤 상황에서 오류가 발생했는지 구체적인 상황을 적어주세요.'
                        : dataRequestType === 'edit'
                        ? '수정 사유나 관리자에게 전달할 추가 요청 사항을 자유롭게 적어주세요.'
                        : dataRequestType === 'delete'
                        ? '예시:\n- 삭제 요청 사유: 해당 날짜는 방송이 진행되지 않았거나 잘못 등록된 중복 데이터예요.'
                        : '예시:\n- 방송 일자: 2024-08-15\n- 방송 제목: 특별 생방송\n- 플레이 게임: 게임A (2시간), 게임B (1시간)\n- 참고 출처/다시보기 링크: https://...'
                    }
                    className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3.5 text-sm min-h-[100px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button 
                  type="button"
                  onClick={handleSubmit} 
                  disabled={isSubmitting || !title.trim()}
                  className={`w-full py-3.5 px-4 text-sm font-bold text-white rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none shadow-md cursor-pointer ${
                    tab === 'data_request'
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                      : tab === 'bug'
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>전송하는 중...</span>
                    </>
                  ) : (
                    <span>
                      {tab === 'data_request'
                        ? '데이터 요청 전송 완료'
                        : tab === 'bug'
                        ? '버그 제보 완료'
                        : '의견 보내기 완료'
                      }
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
