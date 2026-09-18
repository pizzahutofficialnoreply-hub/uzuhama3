import { useState, useEffect } from 'react';
import { Poll, PollOption, SystemConfig } from '../../../types';
import { db } from '../../../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, getCountFromServer } from 'firebase/firestore';
import { cleanFirestoreData } from '../../../hooks/useFirebaseData';
import { 
  Vote, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  BarChart3, 
  Lock, 
  Edit3, 
  ToggleLeft, 
  ToggleRight, 
  X,
  ListOrdered,
  Layers,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';

interface AdminPollSectionProps {
  system?: SystemConfig;
  polls?: Poll[];
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
}

export function AdminPollSection({ system, polls: propsPolls, onUpdateSystemConfig }: AdminPollSectionProps) {
  const [allPolls, setAllPolls] = useState<Poll[]>(propsPolls || []);
  const [isLoadingPolls, setIsLoadingPolls] = useState(false);
  const [pollVoterCounts, setPollVoterCounts] = useState<Record<string, number>>({});
  const [expandedPollStats, setExpandedPollStats] = useState<Record<string, boolean>>({});
  
  // 수정/생성 폼 상태
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [pollForm, setPollForm] = useState<Poll>({
    id: '',
    title: '',
    description: '',
    options: [
      { id: 'opt_1', text: '', votes: 0 },
      { id: 'opt_2', text: '', votes: 0 }
    ],
    isActive: true,
    allowMultiple: false,
    hideResultsBeforeVote: true,
    createdAt: '',
    startDate: '',
    endDate: '',
    totalVotes: 0
  });

  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 인라인 확인 모달 상태 (iframe 호환용: window.confirm 대체)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Firestore polls 실시간 구독 (live_status 하위 컬렉션 기본 + legacy polls 병행)
  useEffect(() => {
    setIsLoadingPolls(true);
    let unsubscribeLive: () => void;
    let unsubscribeLegacy: () => void;

    try {
      const liveRef = collection(db, 'live_status', 'polls', 'items');
      unsubscribeLive = onSnapshot(
        liveRef,
        (snapshot) => {
          const list: Poll[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ ...docSnap.data(), id: docSnap.id } as Poll);
          });
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setAllPolls(list);
          setIsLoadingPolls(false);
        },
        (err) => {
          console.debug('Live polls snapshot in admin notice:', err);
          if (propsPolls && propsPolls.length > 0) {
            setAllPolls(propsPolls);
          }
          setIsLoadingPolls(false);
        }
      );
    } catch (e) {
      console.warn('Failed to listen to live polls in admin:', e);
    }

    try {
      unsubscribeLegacy = onSnapshot(
        collection(db, 'polls'),
        (snapshot) => {
          if (!snapshot.empty) {
            const list: Poll[] = [];
            snapshot.forEach((docSnap) => {
              list.push({ ...docSnap.data(), id: docSnap.id } as Poll);
            });
            list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            setAllPolls(prev => prev.length === 0 ? list : prev);
          }
        },
        (err) => {
          console.debug('Legacy polls admin listener notice:', err);
        }
      );
    } catch {}

    return () => {
      if (unsubscribeLive) unsubscribeLive();
      if (unsubscribeLegacy) unsubscribeLegacy();
    };
  }, [propsPolls]);

  // 투표 참여 인원수(voters) 비동기 조회
  useEffect(() => {
    if (!allPolls || allPolls.length === 0) return;

    let isMounted = true;
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const poll of allPolls) {
        if (typeof poll.voterCount === 'number' && poll.voterCount > 0) {
          counts[poll.id] = poll.voterCount;
        } else {
          try {
            const votersCol = collection(db, 'live_status', 'polls', 'items', poll.id, 'voters');
            const snap = await getCountFromServer(votersCol);
            counts[poll.id] = snap.data().count;
          } catch {
            try {
              const votersCol = collection(db, 'live_status', 'polls', 'items', poll.id, 'voters');
              const snap = await getDocs(votersCol);
              counts[poll.id] = snap.size;
            } catch {
              counts[poll.id] = 0;
            }
          }
        }
      }
      if (isMounted) {
        setPollVoterCounts(prev => ({ ...prev, ...counts }));
      }
    };

    fetchCounts();
    return () => { isMounted = false; };
  }, [allPolls]);

  // 새 투표 작성 시작
  const handleOpenCreateForm = () => {
    setEditingPollId(null);
    setPollForm({
      id: 'poll_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: '',
      description: '',
      options: [
        { id: 'opt_1_' + Date.now(), text: '', votes: 0 },
        { id: 'opt_2_' + (Date.now() + 1), text: '', votes: 0 }
      ],
      isActive: true,
      allowMultiple: false,
      hideResultsBeforeVote: true,
      createdAt: new Date().toISOString(),
      startDate: '',
      endDate: '',
      totalVotes: 0
    });
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  // 기존 투표 수정 시작
  const handleOpenEditForm = (targetPoll: Poll) => {
    setEditingPollId(targetPoll.id);
    setPollForm({
      ...targetPoll,
      options: targetPoll.options && targetPoll.options.length > 0
        ? targetPoll.options.map(o => ({ ...o }))
        : [
            { id: 'opt_1', text: '', votes: 0 },
            { id: 'opt_2', text: '', votes: 0 }
          ]
    });
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  // 선택지 추가
  const handleAddOption = () => {
    const newOptId = 'opt_' + (pollForm.options.length + 1) + '_' + Math.random().toString(36).substring(2, 6);
    setPollForm(prev => ({
      ...prev,
      options: [...prev.options, { id: newOptId, text: '', votes: 0 }]
    }));
  };

  // 선택지 제거
  const handleRemoveOption = (index: number) => {
    if (pollForm.options.length <= 2) {
      setStatusMessage({ type: 'error', text: '선택지는 최소 2개 이상이어야 합니다.' });
      return;
    }
    setPollForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  // 선택지 내용 변경
  const handleOptionTextChange = (index: number, text: string) => {
    setPollForm(prev => {
      const nextOptions = [...prev.options];
      nextOptions[index] = { ...nextOptions[index], text };
      return { ...prev, options: nextOptions };
    });
  };

  // 투표 저장 (신규 등록 or 수정)
  const handleSavePoll = async () => {
    if (!pollForm.title.trim()) {
      setStatusMessage({ type: 'error', text: '투표 제목을 입력해주세요.' });
      return;
    }

    const filledOptions = pollForm.options.filter(o => o.text.trim().length > 0);
    if (filledOptions.length < 2) {
      setStatusMessage({ type: 'error', text: '최소 2개 이상의 선택지 내용을 입력해야 합니다.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const pollToSave: Poll = {
        ...pollForm,
        id: pollForm.id || ('poll_' + Date.now()),
        title: pollForm.title.trim(),
        description: pollForm.description?.trim() || '',
        options: filledOptions,
        createdAt: pollForm.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const sanitized = cleanFirestoreData(pollToSave);

      // 1. live_status 하위 컬렉션에 저장 (모든 사용자 권한 보장)
      await setDoc(doc(db, 'live_status', 'polls', 'items', pollToSave.id), sanitized, { merge: true });

      // 2. legacy polls 컬렉션에도 저장 시도 (관리자 권한 있는 경우)
      try {
        await setDoc(doc(db, 'polls', pollToSave.id), sanitized, { merge: true });
      } catch (legacyErr) {
        console.debug('Legacy poll doc save notice:', legacyErr);
      }

      // 3. 시스템 activePoll에도 활성 투표 동기화 (단일 투표 호환)
      if (onUpdateSystemConfig && pollToSave.isActive) {
        await onUpdateSystemConfig({ activePoll: sanitized });
      }

      setStatusMessage({ 
        type: 'success', 
        text: editingPollId ? '투표가 성공적으로 수정되었습니다.' : '새 투표가 성공적으로 등록되었습니다.' 
      });
      setIsFormOpen(false);
      setEditingPollId(null);
    } catch (e: any) {
      console.error('Error saving poll in admin:', e);
      setStatusMessage({ type: 'error', text: '저장 실패: ' + (e?.message || '알 수 없는 오류') });
    } finally {
      setIsSaving(false);
    }
  };

  // 투표 활성/비활성화 토글
  const handleTogglePollActive = async (targetPoll: Poll) => {
    setIsSaving(true);
    try {
      const newActive = !targetPoll.isActive;
      const updated = {
        ...targetPoll,
        isActive: newActive,
        updatedAt: new Date().toISOString()
      };

      // live_status 업데이트
      await setDoc(doc(db, 'live_status', 'polls', 'items', targetPoll.id), { isActive: newActive, updatedAt: new Date().toISOString() }, { merge: true });

      // legacy polls 업데이트 시도
      try {
        await setDoc(doc(db, 'polls', targetPoll.id), { isActive: newActive, updatedAt: new Date().toISOString() }, { merge: true });
      } catch {}

      // 시스템 activePoll에도 동기화
      if (onUpdateSystemConfig) {
        if (newActive) {
          await onUpdateSystemConfig({ activePoll: cleanFirestoreData(updated) });
        } else if (system?.activePoll?.id === targetPoll.id) {
          // 비활성화된 경우 다른 활성 투표가 있으면 그것으로, 없으면 null
          const nextActive = allPolls.find(p => p.id !== targetPoll.id && p.isActive);
          await onUpdateSystemConfig({ activePoll: nextActive ? cleanFirestoreData(nextActive) : null });
        }
      }

      setStatusMessage({
        type: 'success',
        text: `'${targetPoll.title}' 투표가 ${newActive ? '활성화(메인 화면 노출)' : '비활성화'}되었습니다.`
      });
    } catch (e: any) {
      console.error('Error toggling poll status:', e);
      setStatusMessage({ type: 'error', text: '상태 변경 오류: ' + (e?.message || '') });
    } finally {
      setIsSaving(false);
    }
  };

  // 득표수 초기화 확인 모달 호출
  const handlePromptResetVotes = (targetPoll: Poll) => {
    setConfirmDialog({
      isOpen: true,
      title: '투표 득표수 초기화',
      message: `'${targetPoll.title}' 투표의 모든 참여 기록과 선택지 득표수를 0표로 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다)`,
      actionLabel: '초기화 실행',
      onConfirm: async () => {
        const resetOptions = (targetPoll.options || []).map(o => ({ ...o, votes: 0 }));
        
        // live_status 득표수 초기화
        await setDoc(doc(db, 'live_status', 'polls', 'items', targetPoll.id), {
          options: resetOptions,
          totalVotes: 0,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // legacy polls 초기화 시도
        try {
          await setDoc(doc(db, 'polls', targetPoll.id), {
            options: resetOptions,
            totalVotes: 0,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch {}

        if (onUpdateSystemConfig && system?.activePoll?.id === targetPoll.id) {
          await onUpdateSystemConfig({
            activePoll: cleanFirestoreData({ ...targetPoll, options: resetOptions, totalVotes: 0 })
          });
        }
        setStatusMessage({ type: 'success', text: '득표수가 0표로 초기화되었습니다.' });
      }
    });
  };

  // 투표 삭제 확인 모달 호출
  const handlePromptDeletePoll = (targetPoll: Poll) => {
    setConfirmDialog({
      isOpen: true,
      title: '투표 완전히 삭제',
      message: `'${targetPoll.title}' 투표를 완전히 삭제하시겠습니까? 메인 화면에서도 즉시 내려갑니다.`,
      actionLabel: '삭제하기',
      onConfirm: async () => {
        // live_status 삭제
        await deleteDoc(doc(db, 'live_status', 'polls', 'items', targetPoll.id));

        // legacy polls 삭제 시도
        try {
          await deleteDoc(doc(db, 'polls', targetPoll.id));
        } catch {}

        if (onUpdateSystemConfig && system?.activePoll?.id === targetPoll.id) {
          const remaining = allPolls.filter(p => p.id !== targetPoll.id && p.isActive);
          await onUpdateSystemConfig({
            activePoll: remaining.length > 0 ? cleanFirestoreData(remaining[0]) : null
          });
        }
        setStatusMessage({ type: 'success', text: '투표가 삭제되었습니다.' });
      }
    });
  };

  const activePollsCount = allPolls.filter(p => p.isActive).length;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Vote className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>무기명 투표 관리 (다중 투표 지원)</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300">
              진행 중 {activePollsCount}개 / 전체 {allPolls.length}개
            </span>
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            메인 화면에 노출되는 무기명 투표를 복수로 등록 및 관리할 수 있습니다. 활성화된 모든 투표는 메인 화면 상단에서 탭과 슬라이드로 전환되며 노출됩니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateForm}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>새 투표 등록하기</span>
        </button>
      </div>

      {/* 상태 알림 메시지 (배너 형태) */}
      {statusMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in text-xs font-semibold ${
          statusMessage.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 투표 생성 / 수정 폼 (열렸을 때 표시) */}
      {isFormOpen && (
        <div className="p-5 rounded-2xl border-2 border-purple-500/40 bg-purple-50/30 dark:bg-purple-950/20 space-y-5 animate-in fade-in slide-in-from-top-3">
          <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-900/50 pb-3">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>{editingPollId ? '투표 내용 수정' : '새로운 무기명 투표 만들기'}</span>
            </h4>
            <button
              type="button"
              onClick={() => { setIsFormOpen(false); setEditingPollId(null); }}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* 투표 제목 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                투표 제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pollForm.title}
                onChange={e => setPollForm(p => ({ ...p, title: e.target.value }))}
                placeholder="예: 오늘 우주하마 생방송 플레이 게임 예측 투표!"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>

            {/* 투표 설명 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                투표 상세 설명 / 안내 (선택)
              </label>
              <textarea
                value={pollForm.description || ''}
                onChange={e => setPollForm(p => ({ ...p, description: e.target.value }))}
                placeholder="예: 자유롭게 원하는 게임을 투표해주세요. 실시간 득표율은 투표 완료 후 공개됩니다."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none min-h-[60px]"
              />
            </div>

            {/* 선택지 관리 */}
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>선택지 항목 ({pollForm.options.length}개)</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="px-2.5 py-1 text-xs font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-lg flex items-center gap-1 hover:bg-purple-200 dark:hover:bg-purple-900 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> 선택지 추가
                </button>
              </div>

              <div className="space-y-2">
                {pollForm.options.map((opt, idx) => (
                  <div key={opt.id || idx} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-zinc-400 shrink-0">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={e => handleOptionTextChange(idx, e.target.value)}
                      placeholder={`선택지 ${idx + 1} 내용 입력`}
                      className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    {editingPollId && (
                      <span className="text-xs font-semibold text-zinc-500 w-16 text-right shrink-0">
                        {opt.votes || 0}표
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                      title="선택지 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 일정 설정 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>투표 시작 일시 (선택)</span>
                </label>
                <input
                  type="datetime-local"
                  value={pollForm.startDate || ''}
                  onChange={e => setPollForm(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs sm:text-sm outline-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">미설정 시 저장 즉시 참여 가능</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>투표 자동 종료 일시 (선택)</span>
                </label>
                <input
                  type="datetime-local"
                  value={pollForm.endDate || ''}
                  onChange={e => setPollForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs sm:text-sm outline-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">기한 만료 시 투표 마감 및 결과만 표시</p>
              </div>
            </div>

            {/* 옵션 토글들 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pollForm.isActive}
                  onChange={e => setPollForm(p => ({ ...p, isActive: e.target.checked }))}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">메인 노출 활성화</span>
                  <span className="text-[11px] text-zinc-500">메인 화면에 즉시 노출</span>
                </div>
              </label>

              <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pollForm.allowMultiple || false}
                  onChange={e => setPollForm(p => ({ ...p, allowMultiple: e.target.checked }))}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">복수 선택 허용</span>
                  <span className="text-[11px] text-zinc-500">2개 이상 중복 선택 가능</span>
                </div>
              </label>

              <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pollForm.hideResultsBeforeVote ?? true}
                  onChange={e => setPollForm(p => ({ ...p, hideResultsBeforeVote: e.target.checked }))}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">투표 전 결과 숨김</span>
                  <span className="text-[11px] text-zinc-500">참여 전엔 비율 가림</span>
                </div>
              </label>
            </div>

            {/* 폼 하단 버튼 */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-purple-200 dark:border-purple-900/50">
              <button
                type="button"
                onClick={() => { setIsFormOpen(false); setEditingPollId(null); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSavePoll}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingPollId ? '수정 내용 저장' : '투표 등록하기'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 등록된 투표 목록 (전체 리스트) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>등록된 투표 목록 ({allPolls.length}개)</span>
          </h4>
          <span className="text-xs text-zinc-500">
            * 여러 투표를 동시에 활성화할 수 있으며, 메인 화면에서 탭으로 전환됩니다.
          </span>
        </div>

        {isLoadingPolls && allPolls.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
            <span>투표 목록을 불러오는 중입니다...</span>
          </div>
        ) : allPolls.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 space-y-2">
            <Vote className="w-8 h-8 mx-auto text-zinc-400" />
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">등록된 무기명 투표가 없습니다.</p>
            <p className="text-xs text-zinc-500">상단의 [새 투표 등록하기] 버튼을 눌러 첫 번째 투표를 생성해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {allPolls.map((poll) => {
              const calcVotes = poll.totalVotes !== undefined && poll.totalVotes > 0 
                ? poll.totalVotes 
                : (poll.options || []).reduce((acc, opt) => acc + (opt.votes || 0), 0);

              return (
                <div
                  key={poll.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    poll.isActive
                      ? 'border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/10 shadow-sm'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* 투표 정보 */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${
                          poll.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${poll.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                          {poll.isActive ? '메인 노출 중 (활성)' : '비활성 (미노출)'}
                        </span>

                        {poll.allowMultiple && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                            복수 선택
                          </span>
                        )}

                        {poll.hideResultsBeforeVote && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            사전 결과 숨김
                          </span>
                        )}

                        {/* 투표 참여 인원수 (관리자 모드 전용 핵심 정보) */}
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          <span>참여 {((pollVoterCounts[poll.id] ?? poll.voterCount) || 0).toLocaleString()}명</span>
                        </span>

                        {/* 총 누적 득표수 */}
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                          <Vote className="w-3.5 h-3.5" />
                          <span>누적 {calcVotes.toLocaleString()}표</span>
                        </span>

                        {poll.allowMultiple && ((pollVoterCounts[poll.id] ?? poll.voterCount) || 0) > 0 && (
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            (1인 평균 {(calcVotes / ((pollVoterCounts[poll.id] ?? poll.voterCount) || 1)).toFixed(1)}개)
                          </span>
                        )}

                        <span className="text-[11px] text-zinc-400">
                          선택지 {(poll.options || []).length}개
                        </span>
                      </div>

                      <h5 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                        {poll.title}
                      </h5>

                      {poll.description && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {poll.description}
                        </p>
                      )}

                      {/* 일정 정보 */}
                      {(poll.startDate || poll.endDate) && (
                        <div className="flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap pt-0.5">
                          {poll.startDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-blue-400" />
                              시작: {poll.startDate.replace('T', ' ')}
                            </span>
                          )}
                          {poll.endDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              종료: {poll.endDate.replace('T', ' ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 조작 버튼들 */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                      {/* 활성/비활성화 토글 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleTogglePollActive(poll)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          poll.isActive
                            ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            : 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        }`}
                        title={poll.isActive ? '메인 화면에서 숨기기' : '메인 화면에 활성화 노출'}
                      >
                        {poll.isActive ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>노출 끄기</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-zinc-400" />
                            <span>메인에 노출</span>
                          </>
                        )}
                      </button>

                      {/* 수정 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(poll)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                        title="투표 수정"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>수정</span>
                      </button>

                      {/* 득표수 초기화 */}
                      {calcVotes > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePromptResetVotes(poll)}
                          className="px-2 py-1.5 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="득표수 0표로 초기화"
                        >
                          초기화
                        </button>
                      )}

                      {/* 삭제 버튼 */}
                      <button
                        type="button"
                        onClick={() => handlePromptDeletePoll(poll)}
                        className="p-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="투표 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 항목별 득표 현황 아코디언 */}
                  <div className="pt-2.5 mt-2.5 border-t border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedPollStats(prev => ({ ...prev, [poll.id]: !prev[poll.id] }))}
                        className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>{expandedPollStats[poll.id] ? '항목별 득표 현황 접기' : '항목별 득표 현황 보기'}</span>
                        {expandedPollStats[poll.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        {calcVotes > 0 ? `최다 득표: ${Math.max(...(poll.options || []).map(o => o.votes || 0)).toLocaleString()}표` : '득표 없음'}
                      </span>
                    </div>

                    {expandedPollStats[poll.id] && (
                      <div className="pt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1">
                        {(poll.options || []).map((opt, oIdx) => {
                          const optVotes = opt.votes || 0;
                          const pct = calcVotes > 0 ? ((optVotes / calcVotes) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={opt.id || oIdx} className="space-y-1 bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-xl">
                              <div className="flex justify-between text-xs items-center gap-2">
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate">
                                  {oIdx + 1}. {opt.text || '(내용 없음)'}
                                </span>
                                <span className="text-zinc-600 dark:text-zinc-300 font-bold shrink-0 text-[11px]">
                                  <strong className="text-purple-600 dark:text-purple-400">{optVotes.toLocaleString()}표</strong> ({pct}%)
                                </span>
                              </div>
                              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-purple-500 dark:bg-purple-600 rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 인라인 확인 다이얼로그 (아이프레임 호환: window.confirm 대체) */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-zinc-900 dark:text-white font-bold">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span>{confirmDialog.title}</span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all shadow-md"
              >
                {confirmDialog.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
