import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Loader2, Image as ImageIcon, 
  Save, Download, Check, Plus, Trash2, 
  List, AlertCircle, Film, Radio, Video,
  Maximize2, Minimize2
} from 'lucide-react';
import { motion, PanInfo } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BroadcastLog, SavedDraft } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock, cn, fuzzyKoreanMatch, fuzzyDateMatch } from '../utils';
import { extractYoutubeId, matchLogMedia } from '../utils/urlUtils';
import { DraftsListModal } from './modals/DraftsListModal';

interface UserContributeModalProps {
  type?: 'live' | 'video' | 'shorts';
  onClose: () => void;
  logs?: Record<string, BroadcastLog>;
}

export interface LiveEntry {
  id: string;
  liveDate: string;
  startTime: string;
  endTime: string;
  gameCategory: string;
  gameName: string;
}

export interface VideoSubItem {
  id: string;
  videoTitle: string;
  videoLink: string;
}

export interface VideoBlock {
  id: string;
  searchQuery: string;
  linkedLogIds: string[];
  videos: VideoSubItem[];
}

export function UserContributeModal({ type = 'live', onClose, logs }: UserContributeModalProps) {
  useBodyScrollLock(true);
  const { user } = useAuth();
  const [currentType, setCurrentType] = useState<'live' | 'video' | 'shorts'>(type);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live entries
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([
    { id: 'live-1', liveDate: '', startTime: '', endTime: '', gameCategory: '', gameName: '' }
  ]);

  // Video / Shorts blocks
  const [videoBlocks, setVideoBlocks] = useState<VideoBlock[]>([
    {
      id: 'block-1',
      searchQuery: '',
      linkedLogIds: [],
      videos: [{ id: 'v-1', videoTitle: '', videoLink: '' }]
    }
  ]);

  // Drafts
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [showDraftListModal, setShowDraftListModal] = useState(false);
  const [autoRestoredNotice, setAutoRestoredNotice] = useState(false);
  const [manualSavedNotice, setManualSavedNotice] = useState(false);

  // 1. Initial Load: Load saved drafts list & auto-draft recovery
  useEffect(() => {
    const draftsKey = `uzuhama_contribute_saved_drafts_${currentType}`;
    const autoKey = `uzuhama_contribute_auto_draft_${currentType}`;

    try {
      const storedDrafts = localStorage.getItem(draftsKey);
      if (storedDrafts) {
        setSavedDrafts(JSON.parse(storedDrafts));
      } else {
        setSavedDrafts([]);
      }
    } catch (e) {
      console.error('Failed to load saved drafts:', e);
    }

    try {
      const autoDraftRaw = localStorage.getItem(autoKey);
      if (autoDraftRaw) {
        const d = JSON.parse(autoDraftRaw);
        let restored = false;
        if (currentType === 'live' && Array.isArray(d.liveEntries) && d.liveEntries.length > 0) {
          const hasVal = d.liveEntries.some((e: LiveEntry) => e.liveDate || e.gameName || e.startTime || e.endTime);
          if (hasVal) {
            setLiveEntries(d.liveEntries);
            restored = true;
          }
        } else if ((currentType === 'video' || currentType === 'shorts') && Array.isArray(d.videoBlocks) && d.videoBlocks.length > 0) {
          const hasVal = d.videoBlocks.some((b: VideoBlock) => 
            b.linkedLogIds.length > 0 || b.videos.some(v => v.videoLink || v.videoTitle)
          );
          if (hasVal) {
            setVideoBlocks(d.videoBlocks);
            restored = true;
          }
        }
        if (restored) {
          setAutoRestoredNotice(true);
        }
      }
    } catch (err) {
      console.error('Failed to parse auto draft:', err);
    }
  }, [currentType]);

  // 2. Continuous Auto-save for emergency crash/accidental exit
  useEffect(() => {
    const autoKey = `uzuhama_contribute_auto_draft_${currentType}`;
    if (currentType === 'live') {
      const hasVal = liveEntries.some(e => e.liveDate.trim() || e.gameName.trim() || e.startTime || e.endTime || e.gameCategory);
      if (hasVal) {
        localStorage.setItem(autoKey, JSON.stringify({ liveEntries }));
      }
    } else {
      const hasVal = videoBlocks.some(b => b.linkedLogIds.length > 0 || b.videos.some(v => v.videoLink.trim() || v.videoTitle.trim()));
      if (hasVal) {
        localStorage.setItem(autoKey, JSON.stringify({ videoBlocks }));
      }
    }
  }, [currentType, liveEntries, videoBlocks]);

  // Check if there is actual content to save
  const checkHasContent = () => {
    if (currentType === 'live') {
      return liveEntries.some(e => e.liveDate.trim() || e.gameName.trim() || e.gameCategory.trim() || e.startTime.trim() || e.endTime.trim());
    } else {
      return videoBlocks.some(b => b.linkedLogIds.length > 0 || b.videos.some(v => v.videoLink.trim() || v.videoTitle.trim()));
    }
  };

  // Safe Close with draft save
  const handleSafeClose = () => {
    if (checkHasContent()) {
      const autoKey = `uzuhama_contribute_auto_draft_${currentType}`;
      if (currentType === 'live') {
        localStorage.setItem(autoKey, JSON.stringify({ liveEntries }));
      } else {
        localStorage.setItem(autoKey, JSON.stringify({ videoBlocks }));
      }
    }
    onClose();
  };

  // Handle Drag Gesture on handle / sheet header
  const handleDragEnd = (_: any, info: PanInfo) => {
    // If dragged downward significantly, close sheet
    if (info.offset.y > 110 || info.velocity.y > 350) {
      handleSafeClose();
    } 
    // If dragged upward significantly, expand to full screen
    else if (info.offset.y < -60 || info.velocity.y < -250) {
      setIsExpanded(true);
    }
  };

  // Generate summary string for draft
  const generateDraftSummary = () => {
    if (type === 'live') {
      const valid = liveEntries.filter(e => e.liveDate.trim() || e.gameName.trim());
      if (valid.length === 0) return '생방송 정보';
      const first = valid[0];
      const desc = `[${first.liveDate || '날짜 미정'}] ${first.gameName || '게임 미정'}`;
      return valid.length > 1 ? `${desc} 외 ${valid.length - 1}건` : desc;
    } else {
      let totalVideos = 0;
      let firstTitle = '';
      videoBlocks.forEach(b => {
        b.videos.forEach(v => {
          if (v.videoTitle.trim() || v.videoLink.trim()) {
            totalVideos++;
            if (!firstTitle) firstTitle = v.videoTitle.trim() || v.videoLink.trim();
          }
        });
      });
      const prefix = type === 'shorts' ? '쇼츠' : '영상';
      if (totalVideos === 0) return `${prefix} 정보`;
      return totalVideos > 1 ? `[${prefix}] ${firstTitle} 외 ${totalVideos - 1}건` : `[${prefix}] ${firstTitle}`;
    }
  };

  // Manual save handler
  const handleManualSave = () => {
    if (!checkHasContent()) {
      alert('저장할 내용이 없습니다. 최소 한 개 이상의 항목을 입력해주세요.');
      return;
    }

    const now = new Date();
    const formatted = new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const newDraft: SavedDraft = {
      id: 'draft_' + Date.now(),
      savedAt: Date.now(),
      savedAtFormatted: formatted,
      summary: generateDraftSummary(),
      type,
      data: type === 'live' ? { liveEntries } : { videoBlocks }
    };

    const updated = [newDraft, ...savedDrafts.slice(0, 19)];
    setSavedDrafts(updated);
    localStorage.setItem(`uzuhama_contribute_saved_drafts_${type}`, JSON.stringify(updated));

    setManualSavedNotice(true);
    setTimeout(() => setManualSavedNotice(false), 3000);
  };

  // Load draft from list
  const handleLoadDraft = (draft: SavedDraft) => {
    if (draft.type === 'live' && draft.data?.liveEntries) {
      setLiveEntries(draft.data.liveEntries);
    } else if (draft.data?.videoBlocks) {
      setVideoBlocks(draft.data.videoBlocks);
    }
    setShowDraftListModal(false);
    setAutoRestoredNotice(false);
  };

  // Delete individual draft
  const handleDeleteDraft = (id: string) => {
    const updated = savedDrafts.filter(d => d.id !== id);
    setSavedDrafts(updated);
    localStorage.setItem(`uzuhama_contribute_saved_drafts_${type}`, JSON.stringify(updated));
  };

  // Clear all drafts
  const handleClearAllDrafts = () => {
    if (!window.confirm('임시 저장된 모든 목록을 삭제하시겠습니까?')) return;
    setSavedDrafts([]);
    localStorage.removeItem(`uzuhama_contribute_saved_drafts_${type}`);
  };

  // Clear auto draft
  const handleClearAutoDraft = () => {
    localStorage.removeItem(`uzuhama_contribute_auto_draft_${type}`);
    if (type === 'live') {
      setLiveEntries([{ id: 'live-' + Date.now(), liveDate: '', startTime: '', endTime: '', gameCategory: '', gameName: '' }]);
    } else {
      setVideoBlocks([{
        id: 'block-' + Date.now(),
        searchQuery: '',
        linkedLogIds: [],
        videos: [{ id: 'v-' + Date.now(), videoTitle: '', videoLink: '' }]
      }]);
    }
    setAutoRestoredNotice(false);
  };

  // Live Entries handlers
  const handleAddLiveEntry = () => {
    setLiveEntries(prev => [
      ...prev,
      { id: 'live-' + Date.now(), liveDate: '', startTime: '', endTime: '', gameCategory: '', gameName: '' }
    ]);
  };

  const handleUpdateLiveEntry = (id: string, field: keyof LiveEntry, value: string) => {
    setLiveEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleRemoveLiveEntry = (id: string) => {
    if (liveEntries.length <= 1) return;
    setLiveEntries(prev => prev.filter(e => e.id !== id));
  };

  // Video Blocks & Items handlers
  const handleAddVideoBlock = () => {
    setVideoBlocks(prev => [
      ...prev,
      {
        id: 'block-' + Date.now(),
        searchQuery: '',
        linkedLogIds: [],
        videos: [{ id: 'v-' + Date.now(), videoTitle: '', videoLink: '' }]
      }
    ]);
  };

  const handleRemoveVideoBlock = (blockId: string) => {
    if (videoBlocks.length <= 1) return;
    setVideoBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const handleAddVideoToBlock = (blockId: string) => {
    setVideoBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        videos: [...b.videos, { id: 'v-' + Date.now() + Math.random(), videoTitle: '', videoLink: '' }]
      };
    }));
  };

  const handleRemoveVideoFromBlock = (blockId: string, videoId: string) => {
    setVideoBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      if (b.videos.length <= 1) return b;
      return {
        ...b,
        videos: b.videos.filter(v => v.id !== videoId)
      };
    }));
  };

  const handleUpdateVideoItem = (blockId: string, videoId: string, field: keyof VideoSubItem, value: string) => {
    setVideoBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        videos: b.videos.map(v => v.id === videoId ? { ...v, [field]: value } : v)
      };
    }));
  };

  const handleUpdateBlockSearch = (blockId: string, query: string) => {
    setVideoBlocks(prev => prev.map(b => b.id === blockId ? { ...b, searchQuery: query } : b));
  };

  const handleToggleBlockLinkedLog = (blockId: string, logId: string) => {
    setVideoBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const exists = b.linkedLogIds.includes(logId);
      return {
        ...b,
        linkedLogIds: exists ? b.linkedLogIds.filter(id => id !== logId) : [...b.linkedLogIds, logId]
      };
    }));
  };

  const getYoutubeVideoId = (url: string) => {
    return extractYoutubeId(url);
  };

  // Submit all entries
  const handleSubmit = async () => {
    if (currentType === 'live') {
      const validEntries = liveEntries.filter(e => e.liveDate.trim() && e.gameName.trim());
      if (validEntries.length === 0) {
        alert('최소 한 개 이상의 생방송 항목에 날짜와 게임 이름을 입력해주세요.');
        return;
      }

      setIsSubmitting(true);
      try {
        const promises = validEntries.map(entry => addDoc(collection(db, 'contributions'), {
          type: 'live',
          uid: user?.uid || null,
          email: user?.email || null,
          status: 'pending',
          liveDate: entry.liveDate.trim(),
          startTime: entry.startTime.trim(),
          endTime: entry.endTime.trim(),
          gameName: entry.gameName.trim(),
          gameCategory: entry.gameCategory.trim(),
          createdAt: serverTimestamp(),
        }));

        await Promise.all(promises);
        localStorage.removeItem(`uzuhama_contribute_auto_draft_${currentType}`);
        alert(`총 ${validEntries.length}건의 생방송 추가 요청이 접수되었습니다! 관리자 승인 후 반영됩니다.`);
        onClose();
      } catch (e) {
        console.error(e);
        alert('접수 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const validItems: { title: string; link: string; linkedLogIds: string[] }[] = [];
      videoBlocks.forEach(block => {
        block.videos.forEach(v => {
          if (v.videoLink.trim() && v.videoTitle.trim()) {
            validItems.push({
              title: v.videoTitle.trim(),
              link: v.videoLink.trim(),
              linkedLogIds: block.linkedLogIds,
            });
          }
        });
      });

      if (validItems.length === 0) {
        alert('최소 한 개 이상의 영상에 제목과 링크를 입력해주세요.');
        return;
      }

      setIsSubmitting(true);
      try {
        const promises = validItems.map(item => addDoc(collection(db, 'contributions'), {
          type: currentType,
          uid: user?.uid || null,
          email: user?.email || null,
          status: 'pending',
          videoTitle: item.title,
          videoLink: item.link,
          linkedLogIds: item.linkedLogIds,
          createdAt: serverTimestamp(),
        }));

        await Promise.all(promises);
        localStorage.removeItem(`uzuhama_contribute_auto_draft_${currentType}`);
        alert(`총 ${validItems.length}건의 ${currentType === 'shorts' ? '쇼츠' : '영상'} 추가 요청이 접수되었습니다! 관리자 승인 후 반영됩니다.`);
        onClose();
      } catch (e) {
        console.error(e);
        alert('접수 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const totalCount = currentType === 'live' 
    ? liveEntries.length 
    : videoBlocks.reduce((acc, b) => acc + b.videos.length, 0);

  const getTitle = () => {
    switch (currentType) {
      case 'live': return '생방송 기록 제보';
      case 'video': return '유튜브 영상 등록';
      case 'shorts': return '쇼츠 영상 등록';
    }
  };

  // Bottom Sheet Modal View
  return (
    <div className="fixed inset-0 z-[115] flex flex-col justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSafeClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Bottom Sheet */}
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300, mass: 0.8 }}
        className={cn(
          "relative z-10 w-full max-w-2xl mx-auto bg-white dark:bg-zinc-900 border-t border-x border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-300",
          isExpanded ? "h-[100dvh] rounded-t-none" : "h-[85dvh] max-h-[92dvh] rounded-t-[28px]"
        )}
      >
        {/* Top Drag Handle Line (당기면 화면 채우고, 내리면 닫기) */}
        <div 
          className="w-full flex items-center justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
          onClick={() => setIsExpanded(prev => !prev)}
          title={isExpanded ? "축소하기" : "전체화면으로 확장하기"}
        >
          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 pb-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white truncate">
              {getTitle()}
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
              총 {totalCount}건
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title={isExpanded ? "축소" : "전체 화면"}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button 
              type="button"
              onClick={handleSafeClose} 
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="닫기 (자동 임시저장)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* In-Sheet Tab Switcher: 생방송 / 영상 / 쇼츠 */}
        <div className="px-5 sm:px-6 shrink-0">
          <div className="grid grid-cols-3 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl mb-2">
            <button
              type="button"
              onClick={() => setCurrentType('live')}
              className={cn(
                "py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                currentType === 'live'
                  ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <Radio className="w-3.5 h-3.5 text-red-500" />
              <span>생방송 등록</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentType('video')}
              className={cn(
                "py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                currentType === 'video'
                  ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <Video className="w-3.5 h-3.5 text-purple-500" />
              <span>영상 등록</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentType('shorts')}
              className={cn(
                "py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                currentType === 'shorts'
                  ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <Film className="w-3.5 h-3.5 text-pink-500" />
              <span>쇼츠 등록</span>
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 shrink-0">
          {/* Notices */}
          {autoRestoredNotice && (
            <div className="mb-2.5 px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 flex items-center justify-between text-xs text-purple-700 dark:text-purple-300">
              <span className="font-medium">이전 작성 중이던 내용이 자동 복원되었습니다.</span>
              <button
                type="button"
                onClick={handleClearAutoDraft}
                className="text-[11px] underline text-purple-600 dark:text-purple-400 hover:text-purple-800 cursor-pointer ml-2"
              >
                새로 쓰기
              </button>
            </div>
          )}

          {manualSavedNotice && (
            <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold">작성 내용이 임시 저장 목록에 저장되었습니다.</span>
            </div>
          )}

          {/* Draft Actions Toolbar */}
          <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800/80 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualSave}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-colors cursor-pointer"
                title="작성 중인 내용을 임시 저장 목록에 추가합니다"
              >
                <Save className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>임시 저장</span>
              </button>

              {savedDrafts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDraftListModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200/70 dark:border-purple-800/60 transition-colors cursor-pointer"
                  title="임시 저장 목록을 열어 원하는 내용을 불러옵니다"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>임시 저장 목록 ({savedDrafts.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 space-y-4 custom-scrollbar">
          {currentType === 'live' ? (
            /* Live Entries */
            <div className="space-y-4">
              {liveEntries.map((entry, idx) => (
                <div 
                  key={entry.id} 
                  className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 relative space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-700/60">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                      생방송 항목 #{idx + 1}
                    </span>
                    {liveEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLiveEntry(entry.id)}
                        className="p-1 rounded-lg text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="이 항목 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      방송 날짜 *
                    </label>
                    <input 
                      type="date"
                      value={entry.liveDate}
                      onChange={e => handleUpdateLiveEntry(entry.id, 'liveDate', e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        시작 시간
                      </label>
                      <input 
                        type="time"
                        value={entry.startTime}
                        onChange={e => handleUpdateLiveEntry(entry.id, 'startTime', e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        종료 시간
                      </label>
                      <input 
                        type="time"
                        value={entry.endTime}
                        onChange={e => handleUpdateLiveEntry(entry.id, 'endTime', e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      게임 / 컨텐츠 카테고리
                    </label>
                    <input 
                      type="text"
                      placeholder="예: 종겜, 저챗, 마인크래프트"
                      value={entry.gameCategory}
                      onChange={e => handleUpdateLiveEntry(entry.id, 'gameCategory', e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      게임 / 컨텐츠 이름 *
                    </label>
                    <input 
                      type="text"
                      placeholder="예: 배틀그라운드"
                      value={entry.gameName}
                      onChange={e => handleUpdateLiveEntry(entry.id, 'gameName', e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              ))}

              {/* 생방송 항목 추가 버튼 (+) */}
              <button
                type="button"
                onClick={handleAddLiveEntry}
                className="w-full py-2.5 px-4 border border-dashed border-purple-400 dark:border-purple-700 hover:border-purple-600 rounded-2xl text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>생방송 항목 추가 (+)</span>
              </button>
            </div>
          ) : (
            /* Video / Shorts Blocks */
            <div className="space-y-6">
              {videoBlocks.map((block, bIdx) => {
                const query = block.searchQuery.trim();
                const matchingLogs = (!logs || !query) ? [] : Object.values(logs)
                  .filter(log => {
                    if (matchLogMedia(log, query)) return true;
                    if (log.date && (log.date.includes(query) || fuzzyDateMatch(query, log.date))) return true;
                    if (log.game && fuzzyKoreanMatch(query, log.game)) return true;
                    if (log.category && fuzzyKoreanMatch(query, log.category)) return true;
                    if (log.games?.some(g => (g.name && fuzzyKoreanMatch(query, g.name)) || (g.category && fuzzyKoreanMatch(query, g.category)))) return true;
                    return false;
                  })
                  .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
                  .slice(0, 5);

                return (
                  <div 
                    key={block.id} 
                    className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-4"
                  >
                    {videoBlocks.length > 1 && (
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-700">
                        <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                          요청 묶음 #{bIdx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveVideoBlock(block.id)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="이 묶음 양식 전체 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* 연관된 생방송 찾기 */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        연관된 생방송 찾기 (선택사항)
                      </label>
                      <input 
                        type="text"
                        placeholder="방송 날짜(YYYY-MM-DD) 또는 게임 이름 검색"
                        value={block.searchQuery}
                        onChange={e => handleUpdateBlockSearch(block.id, e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      
                      {block.searchQuery.trim() && matchingLogs.length > 0 && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl max-h-36 overflow-y-auto mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                          {matchingLogs.map(log => {
                            const isSelected = block.linkedLogIds.includes(log.id!);
                            return (
                              <div 
                                key={log.id} 
                                onClick={() => handleToggleBlockLinkedLog(block.id, log.id!)}
                                className={cn(
                                  "p-2.5 cursor-pointer flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                                  isSelected ? "bg-purple-50 dark:bg-purple-900/30" : ""
                                )}
                              >
                                <div>
                                  <p className="text-xs font-bold text-zinc-900 dark:text-white">{log.date}</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{log.game || '게임 정보 없음'}</p>
                                </div>
                                {isSelected && (
                                  <span className="text-[10px] font-bold text-purple-600 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded">
                                    선택됨
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {block.linkedLogIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {block.linkedLogIds.map(id => {
                            const log = logs?.[id];
                            return log ? (
                              <span key={id} className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-lg flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                                <span>{log.date} {log.game}</span>
                                <button type="button" onClick={() => handleToggleBlockLinkedLog(block.id, id)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    {/* Video Items inside this block */}
                    <div className="space-y-3 pt-2">
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {type === 'shorts' ? '쇼츠 목록' : '영상 목록'} ({block.videos.length}개)
                      </div>

                      {block.videos.map((video, vIdx) => {
                        const ytId = getYoutubeVideoId(video.videoLink);
                        return (
                          <div 
                            key={video.id} 
                            className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                                {currentType === 'shorts' ? '쇼츠' : '영상'} #{vIdx + 1}
                              </span>
                              {block.videos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVideoFromBlock(block.id, video.id)}
                                  className="text-zinc-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="이 영상 삭제"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                URL (링크) *
                              </label>
                              <input 
                                type="url"
                                placeholder="유튜브 링크를 입력하세요"
                                value={video.videoLink}
                                onChange={e => handleUpdateVideoItem(block.id, video.id, 'videoLink', e.target.value)}
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />

                              {video.videoLink && (
                                <div className="mt-2 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden flex flex-col items-center justify-center p-1.5">
                                  {ytId ? (
                                    <img 
                                      src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} 
                                      alt="미리보기" 
                                      className="w-full h-auto max-h-28 object-cover rounded"
                                    />
                                  ) : (
                                    <div className="text-zinc-400 flex items-center gap-1.5 py-1 text-[11px]">
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      <span>미리보기를 지원하지 않는 URL입니다.</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                {currentType === 'shorts' ? '쇼츠 제목 *' : '영상 제목 *'}
                              </label>
                              <input 
                                type="text"
                                placeholder="제목을 입력하세요"
                                value={video.videoTitle}
                                onChange={e => handleUpdateVideoItem(block.id, video.id, 'videoTitle', e.target.value)}
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* 영상 필드 부분에 있는 + 버튼 (링크와 제목 추가) */}
                      <button
                        type="button"
                        onClick={() => handleAddVideoToBlock(block.id)}
                        className="w-full py-2 px-3 border border-dashed border-purple-300 dark:border-purple-800 rounded-xl text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{currentType === 'shorts' ? '쇼츠 링크 및 제목 추가 (+)' : '영상 링크 및 제목 추가 (+)'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 전체 + 버튼: 같은 양식 선으로 구분해서 추가 */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAddVideoBlock}
                  className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-sm"
                >
                  <Plus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>새로운 방송 연관 양식 전체 추가 (+)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Submit Footer */}
        <div className="mt-2 px-5 sm:px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs">
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full py-3 text-sm font-bold bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-purple-600/20"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
            ) : (
              `총 ${totalCount}건 요청하기`
            )}
          </button>
        </div>
      </motion.div>

      <DraftsListModal
        isOpen={showDraftListModal}
        drafts={savedDrafts}
        onClose={() => setShowDraftListModal(false)}
        onLoadDraft={handleLoadDraft}
        onDeleteDraft={handleDeleteDraft}
        onClearAllDrafts={handleClearAllDrafts}
      />
    </div>
  );
}
