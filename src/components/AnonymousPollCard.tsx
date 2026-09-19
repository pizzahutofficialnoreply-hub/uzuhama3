import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CheckCircle2, ChevronDown, ChevronUp, 
  RotateCcw, RefreshCw, Lock, Share2, AlertCircle,
  ChevronLeft, ChevronRight, Download, Copy, Check, X, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, getDoc, deleteDoc, runTransaction, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Poll, SystemConfig } from '../types';
import { format, isAfter, isBefore } from 'date-fns';
import { generatePollResultImage } from '../utils/generatePollImage';
import { useBodyScrollLock } from '../utils';

interface AnonymousPollCardProps {
  system?: SystemConfig;
  polls?: Poll[];
}

// 클라이언트 고유 로컬 무기명 식별자 (IP 획득 전 또는 오프라인 fallback용)
function getFallbackVoterId(): string {
  if (typeof window === 'undefined') return 'v_local_default';
  let vid = localStorage.getItem('uzuhama_poll_voter_id');
  if (!vid) {
    vid = 'v_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('uzuhama_poll_voter_id', vid);
  }
  return vid;
}

export function AnonymousPollCard({ system, polls: propsPolls }: AnonymousPollCardProps) {
  const { user } = useAuth();

  // 비로그인 사용자 IP 감지 상태
  const [clientIp, setClientIp] = useState<string>('');

  // 실시간 투표 목록 관리
  const [livePolls, setLivePolls] = useState<Poll[]>([]);
  const [selectedPollIndex, setSelectedPollIndex] = useState<number>(0);

  // 현재 투표에 대한 선택 및 진행 상태
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [hasVotedLocally, setHasVotedLocally] = useState<boolean>(false);
  const [ipLocked, setIpLocked] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 기본적으로 제목과 필수 정보만 표시하고 접힌 상태 (토글 지원)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // 결과 공유 상태
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  useBodyScrollLock(isShareModalOpen);
  const [generatedImageBlob, setGeneratedImageBlob] = useState<Blob | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // 배너 수동 조작 시 일시정지 타이머 (timestamp)
  const [manualPauseUntil, setManualPauseUntil] = useState<number>(0);

  const hasVoted = Boolean(hasVotedLocally || ipLocked);

  // 배너 자동 넘기기 (투표 여러 개일 때)
  useEffect(() => {
    if (livePolls.length <= 1) return;
    // 펼쳐져 있거나, 투표 입력 중(선택된 옵션이 있고 아직 미완료)이면 정지
    if (isExpanded) return;
    if (selectedOptions.length > 0 && !hasVoted) return;

    const timer = setInterval(() => {
      if (Date.now() < manualPauseUntil) return;
      setSelectedPollIndex((prev) => (prev + 1) % livePolls.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [livePolls.length, isExpanded, selectedOptions.length, hasVoted, manualPauseUntil]);

  // 1. 클라이언트 IP 획득 (비로그인 1인 1투표 식별용)
  useEffect(() => {
    let isCancelled = false;
    const fetchIp = async () => {
      try {
        const res = await fetch('/api/poll/my-ip');
        if (res.ok) {
          const data = await res.json();
          if (data?.ip && !isCancelled) {
            setClientIp(data.ip);
            return;
          }
        }
      } catch {}

      // fallback: 외부 ipify
      try {
        const res2 = await fetch('https://api.ipify.org?format=json');
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2?.ip && !isCancelled) {
            setClientIp(data2.ip);
          }
        }
      } catch {}
    };

    fetchIp();
    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. 현재 사용자 또는 IP 기준 고유 voterId 산출
  // - 로그인 시: 계정 UID 단위 (acc_UID) -> 스마트폰/PC 어디서 접속해도 1회 제한
  // - 비로그인 시: 클라이언트 IP 단위 (ip_IP) -> 브라우저를 지우거나 시크릿 모드로 와도 1회 제한
  const effectiveVoterId = useMemo(() => {
    if (user?.uid) {
      return `acc_${user.uid}`;
    }
    if (clientIp) {
      const cleanIp = clientIp.replace(/[^a-zA-Z0-9]/g, '_');
      return `ip_${cleanIp}`;
    }
    return getFallbackVoterId();
  }, [user?.uid, clientIp]);

  // 3. Firestore 실시간 구독으로 활성화된 투표 목록 동기화
  useEffect(() => {
    let unsubscribeLive: () => void;
    let unsubscribeLegacy: () => void;

    try {
      const livePollsRef = collection(db, 'live_status', 'polls', 'items');
      unsubscribeLive = onSnapshot(
        livePollsRef,
        (snapshot) => {
          const list: Poll[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ ...docSnap.data(), id: docSnap.id } as Poll);
          });

          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          const activeOnly = list.filter(p => p.isActive);

          if (activeOnly.length > 0) {
            setLivePolls(activeOnly);
          } else if (propsPolls && propsPolls.length > 0) {
            setLivePolls(propsPolls.filter(p => p.isActive));
          } else {
            setLivePolls([]);
          }
        },
        () => {
          if (propsPolls && propsPolls.length > 0) {
            setLivePolls(propsPolls.filter(p => p.isActive));
          }
        }
      );
    } catch {
      if (propsPolls && propsPolls.length > 0) {
        setLivePolls(propsPolls.filter(p => p.isActive));
      }
    }

    try {
      const legacyPollRef = doc(db, 'config', 'system');
      unsubscribeLegacy = onSnapshot(
        legacyPollRef, 
        (snap) => {
          if (snap.exists()) {
            const sysData = snap.data() as SystemConfig;
            if (sysData && sysData.activePoll && sysData.activePoll.isActive) {
              setLivePolls(prev => {
                if (prev.length === 0) return [sysData.activePoll!];
                const exists = prev.some(p => p.id === sysData.activePoll!.id);
                if (!exists) return [sysData.activePoll!, ...prev];
                return prev;
              });
            }
          }
        },
        (error) => {
          console.debug('Legacy poll config snapshot notice:', error);
        }
      );
    } catch {}

    return () => {
      if (unsubscribeLive) unsubscribeLive();
      if (unsubscribeLegacy) unsubscribeLegacy();
    };
  }, [propsPolls]);

  // 시스템 설정의 투표도 반영 (무한 루프 방지를 위해 기본 프로퍼티 의존)
  const systemActivePollId = system?.activePoll?.id;
  const systemActivePollIsActive = system?.activePoll?.isActive;
  useEffect(() => {
    if (system?.activePoll && system.activePoll.isActive) {
      setLivePolls(prev => {
        if (prev.length === 0) return [system.activePoll!];
        const exists = prev.some(p => p.id === system.activePoll!.id);
        if (!exists) return [system.activePoll!, ...prev];
        return prev;
      });
    }
  }, [systemActivePollId, systemActivePollIsActive]);

  // 현재 선택된 투표 객체
  const currentPoll = useMemo(() => {
    if (livePolls.length === 0) return null;
    const idx = Math.min(selectedPollIndex, livePolls.length - 1);
    return livePolls[Math.max(0, idx)];
  }, [livePolls, selectedPollIndex]);

  // 4. 투표 상태 동기화 (한번 투표하면 취소하기 전까지 영구 유지)
  useEffect(() => {
    if (!currentPoll?.id) {
      setSelectedOptions([]);
      setHasVotedLocally(false);
      setIpLocked(false);
      return;
    }

    const pollId = currentPoll.id;
    let isCancelled = false;

    // 1단계: localStorage 확인 (취소하지 않는 한 보존)
    const localData = localStorage.getItem(`poll_voted_${pollId}`);
    let localValid = false;
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.selectedOptions) {
          setSelectedOptions(Array.isArray(parsed.selectedOptions) ? parsed.selectedOptions : []);
          setHasVotedLocally(true);
          localValid = true;
        } else if (Array.isArray(parsed)) {
          setSelectedOptions(parsed);
          setHasVotedLocally(true);
          localValid = true;
        } else {
          setSelectedOptions([localData]);
          setHasVotedLocally(true);
          localValid = true;
        }
      } catch {
        setSelectedOptions([localData]);
        setHasVotedLocally(true);
        localValid = true;
      }
    } else {
      setSelectedOptions([]);
      setHasVotedLocally(false);
    }

    // 2단계: Firestore voter 문서 확인 (계정 단위 or IP 단위)
    const checkVoterDoc = async () => {
      try {
        const liveVoterRef = doc(db, 'live_status', 'polls', 'items', pollId, 'voters', effectiveVoterId);
        const liveVoterSnap = await getDoc(liveVoterRef);
        
        if (isCancelled) return;

        if (liveVoterSnap.exists()) {
          const vData = liveVoterSnap.data();
          setIpLocked(true);

          // 본 브라우저에서 직접 투표한 기록이 있을 때만 내 선택지(selectedOptions)를 표시
          if (localValid) {
            if (Array.isArray(vData?.selectedOptions) && vData.selectedOptions.length > 0) {
              setSelectedOptions(vData.selectedOptions);
            }
          } else {
            // 다른 기기/브라우저이지만 동일 IP 네트워크인 경우
            setSelectedOptions([]);
          }
          return;
        } else {
          setIpLocked(false);
        }

        // 비로그인 상태일 때 fallback 로컬 ID도 함께 확인
        if (!user?.uid) {
          const fallbackId = getFallbackVoterId();
          if (fallbackId !== effectiveVoterId) {
            const fallbackRef = doc(db, 'live_status', 'polls', 'items', pollId, 'voters', fallbackId);
            const fallbackSnap = await getDoc(fallbackRef);
            if (fallbackSnap.exists() && !isCancelled) {
              const vData = fallbackSnap.data();
              setIpLocked(true);
              if (localValid && Array.isArray(vData?.selectedOptions)) {
                setSelectedOptions(vData.selectedOptions);
              }
            }
          }
        }
      } catch (err) {
        console.debug('Voter sync check notice:', err);
      }
    };

    checkVoterDoc();

    return () => {
      isCancelled = true;
    };
  }, [currentPoll?.id, effectiveVoterId, user?.uid]);

  // 에러 메시지 자동 해제
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const now = new Date();
  const isScheduled = currentPoll?.startDate ? isBefore(now, new Date(currentPoll.startDate)) : false;
  const isExpired = currentPoll?.endDate ? isAfter(now, new Date(currentPoll.endDate)) : false;
  const canVote = Boolean(!isScheduled && !isExpired && !hasVotedLocally && !ipLocked && currentPoll);

  // [중요 버그 해결] 백분율 계산의 기준은 항상 실제 옵션별 득표수의 총합!
  // totalVotes 값이 틀어지거나 누적되어 140%가 되는 현상을 원천 방지
  const totalOptionVotes = useMemo(() => {
    return (currentPoll?.options || []).reduce((acc, opt) => acc + (opt.votes || 0), 0);
  }, [currentPoll]);

  // 날짜 포맷 (월일만: MM.dd)
  const pollDateStr = useMemo(() => {
    const raw = currentPoll?.endDate || currentPoll?.startDate || currentPoll?.createdAt;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return format(d, 'MM.dd');
      }
    } catch {}
    return null;
  }, [currentPoll]);

  // 옵션 선택 토글
  const handleSelectOption = (optionId: string) => {
    if (!canVote) return;
    if (currentPoll.allowMultiple) {
      if (selectedOptions.includes(optionId)) {
        setSelectedOptions(selectedOptions.filter(id => id !== optionId));
      } else {
        setSelectedOptions([...selectedOptions, optionId]);
      }
    } else {
      setSelectedOptions([optionId]);
    }
  };

  // 투표 제출 (24시간 제한 없이 자유롭게 투표 및 변경 가능)
  const handleSubmitVote = async () => {
    if (!canVote || selectedOptions.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const chosenOptions = [...selectedOptions];
    const voterId = effectiveVoterId;
    const nowTimestamp = Date.now();

    try {
      const livePollRef = doc(db, 'live_status', 'polls', 'items', currentPoll.id);
      const liveVoterRef = doc(db, 'live_status', 'polls', 'items', currentPoll.id, 'voters', voterId);

      await runTransaction(db, async (transaction) => {
        // 기존 투표 이력 확인: 이미 투표한 경우 기존 표를 안전하게 차감 후 새 표 반영
        const existingVoterSnap = await transaction.get(liveVoterRef);
        let previousOptions: string[] = [];
        if (existingVoterSnap.exists()) {
          const existingData = existingVoterSnap.data();
          if (Array.isArray(existingData?.selectedOptions)) {
            previousOptions = existingData.selectedOptions;
          }
        }

        const pollSnap = await transaction.get(livePollRef);
        let pollData: Poll;

        if (pollSnap.exists()) {
          pollData = pollSnap.data() as Poll;
        } else {
          pollData = { ...currentPoll, totalVotes: 0 };
        }

        // 이전 선택지 표 차감 및 신규 선택지 표 가산
        const updatedOptions = (pollData.options || []).map((opt) => {
          let v = opt.votes || 0;
          if (previousOptions.includes(opt.id)) {
            v = Math.max(0, v - 1);
          }
          if (chosenOptions.includes(opt.id)) {
            v = v + 1;
          }
          return { ...opt, votes: v };
        });

        // totalVotes는 항상 모든 옵션 득표수의 합으로 일치
        const nextTotal = updatedOptions.reduce((acc, opt) => acc + (opt.votes || 0), 0);
        const isFirstTimeVoter = !existingVoterSnap.exists();
        const currentVoterCount = typeof pollData.voterCount === 'number' ? pollData.voterCount : 0;
        const nextVoterCount = isFirstTimeVoter ? currentVoterCount + 1 : currentVoterCount;

        transaction.set(livePollRef, {
          ...pollData,
          options: updatedOptions,
          totalVotes: nextTotal,
          voterCount: nextVoterCount,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // voter 문서에 타임스탬프와 선택지 보존
        transaction.set(liveVoterRef, {
          voterId,
          type: user?.uid ? 'account' : 'ip',
          selectedOptions: chosenOptions,
          votedAt: new Date().toISOString(),
          votedTimestamp: nowTimestamp
        });
      });

      // 로컬 스토리지에 내 선택과 타임스탬프 저장
      localStorage.setItem(`poll_voted_${currentPoll.id}`, JSON.stringify({
        selectedOptions: chosenOptions,
        votedAt: nowTimestamp
      }));
      setHasVotedLocally(true);
      setIpLocked(true);
    } catch (e: any) {
      console.error('Error voting:', e);
      setErrorMessage(e?.message || '투표 반영 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 재투표: 내가 직접 투표한 경우 즉시 취소 후 다시 선택 가능
  const handleDirectResetVote = async () => {
    if (!hasVotedLocally || isCancelling || isExpired) return;

    setIsCancelling(true);
    setErrorMessage(null);
    const voterId = effectiveVoterId;
    const prevOptions = [...selectedOptions];

    try {
      const livePollRef = doc(db, 'live_status', 'polls', 'items', currentPoll.id);
      const liveVoterRef = doc(db, 'live_status', 'polls', 'items', currentPoll.id, 'voters', voterId);

      await runTransaction(db, async (transaction) => {
        const pollSnap = await transaction.get(livePollRef);
        if (pollSnap.exists()) {
          const pollData = pollSnap.data() as Poll;
          const nextOptions = (pollData.options || []).map((opt) => {
            if (prevOptions.includes(opt.id)) {
              return { ...opt, votes: Math.max(0, (opt.votes || 0) - 1) };
            }
            return opt;
          });

          const nextTotal = nextOptions.reduce((acc, opt) => acc + (opt.votes || 0), 0);
          const currentVoterCount = typeof pollData.voterCount === 'number' ? pollData.voterCount : 1;

          transaction.update(livePollRef, {
            options: nextOptions,
            totalVotes: nextTotal,
            voterCount: Math.max(0, currentVoterCount - 1),
            updatedAt: new Date().toISOString()
          });
        }

        transaction.delete(liveVoterRef);
      });

      localStorage.removeItem(`poll_voted_${currentPoll.id}`);
      setSelectedOptions([]);
      setHasVotedLocally(false);
      setIpLocked(false);
    } catch (e: any) {
      console.error('Error cancelling vote:', e);
      setErrorMessage('재투표 처리 중 오류가 발생했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  // 투표 결과 공유 모달 열기 및 이미지 생성
  const handleOpenShareModal = async () => {
    if (!currentPoll) return;
    setIsShareModalOpen(true);
    setIsSharing(true);
    setShareToast(null);

    try {
      const blob = await generatePollResultImage(currentPoll, totalOptionVotes);
      setGeneratedImageBlob(blob);
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
      const url = URL.createObjectURL(blob);
      setPreviewImageUrl(url);
    } catch (err: any) {
      console.error('Failed to generate poll image for preview:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
      setPreviewImageUrl(null);
    }
    setGeneratedImageBlob(null);
    setShareToast(null);
  };

  // 이미지 파일 다운로드
  const handleDownloadImage = async () => {
    if (!currentPoll) return;
    try {
      let blob = generatedImageBlob;
      if (!blob) {
        setIsSharing(true);
        blob = await generatePollResultImage(currentPoll, totalOptionVotes);
        setGeneratedImageBlob(blob);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanTitle = (currentPoll.title || '투표결과').replace(/[/\\?%*:|"<>]/g, '_').substring(0, 30);
      link.download = `우주하마_투표_${cleanTitle}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShareToast('이미지 파일이 저장되었습니다.');
      setTimeout(() => setShareToast(null), 2500);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsSharing(false);
    }
  };

  // 기기 네이티브 공유하기
  const handleNativeShare = async () => {
    if (!currentPoll) return;
    try {
      let blob = generatedImageBlob;
      if (!blob) {
        blob = await generatePollResultImage(currentPoll, totalOptionVotes);
        setGeneratedImageBlob(blob);
      }
      const cleanTitle = (currentPoll.title || '투표결과').replace(/[/\\?%*:|"<>]/g, '_').substring(0, 30);
      const file = new File([blob], `우주하마_투표_${cleanTitle}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `우주하마 투표 결과: ${currentPoll.title}`,
          text: `[우주하마] ${currentPoll.title} 실시간 투표 결과`,
          files: [file]
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `우주하마 투표 결과: ${currentPoll.title}`,
          text: `[우주하마] ${currentPoll.title} 실시간 투표 결과`,
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareToast('링크가 클립보드에 복사되었습니다.');
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch (err) {
      console.debug('Native share cancelled or error:', err);
    }
  };

  // 클립보드 복사 (이미지 또는 링크)
  const handleCopyImageToClipboard = async () => {
    try {
      let blob = generatedImageBlob;
      if (!blob && currentPoll) {
        blob = await generatePollResultImage(currentPoll, totalOptionVotes);
        setGeneratedImageBlob(blob);
      }
      if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setShareToast('이미지가 클립보드에 복사되었습니다.');
        setTimeout(() => setShareToast(null), 2500);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareToast('투표 링크가 복사되었습니다.');
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch {
      await navigator.clipboard.writeText(window.location.href);
      setShareToast('투표 링크가 복사되었습니다.');
      setTimeout(() => setShareToast(null), 2500);
    }
  };

  const showResults = Boolean(hasVoted || isExpired || !currentPoll?.hideResultsBeforeVote);

  // 화살표 직접 클릭 시 넘기기 및 일정 시간 자동 넘기기 중지
  const handlePrevPoll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPollIndex <= 0) return;
    setManualPauseUntil(Date.now() + 7000);
    setSelectedPollIndex((prev) => Math.max(0, prev - 1));
    setErrorMessage(null);
  };

  const handleNextPoll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPollIndex >= livePolls.length - 1) return;
    setManualPauseUntil(Date.now() + 7000);
    setSelectedPollIndex((prev) => Math.min(livePolls.length - 1, prev + 1));
    setErrorMessage(null);
  };

  const isFirstPoll = selectedPollIndex <= 0;
  const isLastPoll = selectedPollIndex >= livePolls.length - 1;

  // 모든 훅 호출 완료 후 렌더링 조건 검사 (React Rules of Hooks 준수)
  if (!currentPoll || !currentPoll.isActive) {
    return null;
  }

  return (
    <div 
      id="anonymous-poll-card"
      className="bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/40 rounded-[24px] overflow-hidden shadow-xs hover:shadow-md transition-all relative"
    >
      {/* 1. 상단 카드 헤더 & 배너 넘기기 컨트롤 */}
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* 다중 투표 시 좌측 넘기기 화살표 */}
          {livePolls.length > 1 && (
            <button
              type="button"
              onClick={handlePrevPoll}
              disabled={isFirstPoll}
              title={isFirstPoll ? "첫 번째 투표입니다" : "이전 투표"}
              aria-label="이전 투표"
              className={`p-1.5 rounded-xl border transition-all shrink-0 ${
                isFirstPoll
                  ? 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-600 opacity-40 cursor-not-allowed bg-zinc-50 dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-purple-50 dark:hover:bg-purple-950/50 hover:text-purple-600 hover:border-purple-300 cursor-pointer bg-white dark:bg-zinc-800'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0 space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 투표 중 배지 & 날짜 표시 (월일만) */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{isExpired ? '투표 마감' : '투표 중'}</span>
                {pollDateStr && (
                  <span className="text-[10px] font-semibold opacity-90 ml-0.5">
                    ({pollDateStr})
                  </span>
                )}
              </span>

              {/* 투표 순서 인디케이터 (2개 이상일 때) */}
              {livePolls.length > 1 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {selectedPollIndex + 1}/{livePolls.length}
                </span>
              )}

              {hasVotedLocally ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3 h-3" />
                  투표 완료
                </span>
              ) : ipLocked ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  <Lock className="w-3 h-3" />
                  참여 완료 (동일 IP)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  미참여
                </span>
              )}

              {currentPoll.allowMultiple && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  복수 선택 가능
                </span>
              )}
            </div>

            <h4 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white truncate">
              {currentPoll.title}
            </h4>

            {currentPoll.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                {currentPoll.description}
              </p>
            )}
          </div>

          {/* 다중 투표 시 우측 넘기기 화살표 */}
          {livePolls.length > 1 && (
            <button
              type="button"
              onClick={handleNextPoll}
              disabled={isLastPoll}
              title={isLastPoll ? "마지막 투표입니다" : "다음 투표"}
              aria-label="다음 투표"
              className={`p-1.5 rounded-xl border transition-all shrink-0 ${
                isLastPoll
                  ? 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-600 opacity-40 cursor-not-allowed bg-zinc-50 dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-purple-50 dark:hover:bg-purple-950/50 hover:text-purple-600 hover:border-purple-300 cursor-pointer bg-white dark:bg-zinc-800'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 접기/펼치기 제어 버튼 */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/70 dark:hover:bg-purple-900/80 text-purple-700 dark:text-purple-300"
          >
            <span>{isExpanded ? '투표 접기' : hasVoted ? '결과 및 내 선택 보기' : '투표 참여하기'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 에러 발생 시에만 최소한으로 표시 */}
      {errorMessage && (
        <div className="mx-5 sm:mx-6 mb-3 p-2.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. 본문 영역 (펼쳤을 때 표시 - 익명 투표 안내 표기) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-zinc-100 dark:border-zinc-800"
          >
            <div className="p-5 sm:p-6 space-y-4">
              
              {/* 펼쳤을 때 익명 투표 명확히 표기 */}
              <div className="flex items-center justify-between pb-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold text-[11px]">
                  <Lock className="w-3.5 h-3.5" />
                  무기명 익명 투표 (누가 투표했는지 기록되지 않는 안전한 투표입니다)
                </span>
                {livePolls.length > 1 && (
                  <span className="text-[11px] text-zinc-400 font-medium">
                    {selectedPollIndex + 1} / {livePolls.length}
                  </span>
                )}
              </div>

              {/* 투표 항목 리스트 */}
              <div className="space-y-2.5">
                {(currentPoll.options || []).map((option) => {
                  const isSelected = selectedOptions.includes(option.id);
                  const optVotes = option.votes || 0;
                  const pct = totalOptionVotes > 0 ? Math.min(100, Math.round((optVotes / totalOptionVotes) * 100)) : 0;

                  return (
                    <div
                      key={option.id}
                      onClick={() => {
                        if (canVote) handleSelectOption(option.id);
                      }}
                      className={`relative overflow-hidden rounded-2xl border transition-all ${
                        canVote ? 'cursor-pointer hover:border-purple-300 dark:hover:border-purple-700' : 'cursor-default'
                      } ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40'
                      }`}
                    >
                      {/* 백분율 프로그레스 바 */}
                      {showResults && (
                        <div
                          className={`absolute top-0 bottom-0 left-0 transition-all duration-700 ${
                            isSelected
                              ? 'bg-purple-200/70 dark:bg-purple-900/50'
                              : 'bg-zinc-200/60 dark:bg-zinc-700/50'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}

                      <div className="relative p-3.5 sm:p-4 flex items-center justify-between gap-3 z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* 체크마크 아이콘 */}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-purple-600 text-white'
                              : 'border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>

                          <span className={`text-xs sm:text-sm font-semibold truncate ${
                            isSelected ? 'text-purple-900 dark:text-purple-200 font-bold' : 'text-zinc-800 dark:text-zinc-200'
                          }`}>
                            {option.text}
                          </span>
                        </div>

                        {/* 결과 백분율 표시 (명수 표시 제거) */}
                        {showResults && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs sm:text-sm font-bold text-purple-700 dark:text-purple-300 font-mono">
                              {pct}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 하단 액션 버튼 바 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-xs text-zinc-500">
                  {currentPoll.hideResultsBeforeVote && !hasVoted && (
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3 text-zinc-400" />
                      투표 참여 전에는 결과가 숨겨집니다.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                  {/* 재투표 버튼 (원클릭 즉시 취소 후 재선택 활성화 - 본인이 직접 투표한 경우만) */}
                  {hasVotedLocally && !isExpired && (
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={handleDirectResetVote}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-zinc-200 dark:border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="선택한 표를 취소하고 다시 투표합니다"
                    >
                      {isCancelling ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>재투표</span>
                    </button>
                  )}

                  {/* 결과 공유: 클릭 시 공유 모달 오픈 */}
                  {showResults && (
                    <button
                      type="button"
                      disabled={isSharing}
                      onClick={handleOpenShareModal}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-100 hover:bg-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="투표 결과 공유 및 이미지 저장"
                    >
                      {isSharing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                      <span>{isSharing ? '공유 준비 중...' : '결과 공유'}</span>
                    </button>
                  )}

                  {/* 투표하기 제출 버튼 (미투표 상태) - 아이콘 제거 */}
                  {canVote && (
                    <button
                      type="button"
                      disabled={selectedOptions.length === 0 || isSubmitting}
                      onClick={handleSubmitVote}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 transition-all flex items-center justify-center cursor-pointer shadow-xs"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>투표 중...</span>
                        </span>
                      ) : (
                        <span>투표하기</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 투표 결과 공유 및 이미지 다운로드 모달 */}
      <AnimatePresence>
        {isShareModalOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={handleCloseShareModal}
          >
            <div 
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm sm:text-base">
                  <Share2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>투표 결과 공유</span>
                </div>
                <button
                  type="button"
                  onClick={handleCloseShareModal}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 이미지 미리보기 */}
              <div className="w-full aspect-[16/10] sm:aspect-video rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                {previewImageUrl ? (
                  <img 
                    src={previewImageUrl} 
                    alt="투표 결과 미리보기" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                    <span className="text-xs">결과 이미지 생성 중...</span>
                  </div>
                )}
              </div>

              {/* 알림 토스트 */}
              {shareToast && (
                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold text-center animate-in fade-in">
                  {shareToast}
                </div>
              )}

              {/* 액션 버튼 목록 */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* 이미지 다운로드 */}
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>이미지 다운로드</span>
                </button>

                {/* 기기 공유하기 */}
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-100 hover:bg-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>기기 공유하기</span>
                </button>

                {/* 이미지 복사 */}
                <button
                  type="button"
                  onClick={handleCopyImageToClipboard}
                  className="w-full py-2 px-3 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>이미지 복사</span>
                </button>

                {/* 투표 링크 복사 */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setShareToast('투표 링크가 복사되었습니다.');
                    setTimeout(() => setShareToast(null), 2500);
                  }}
                  className="w-full py-2 px-3 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>링크 복사</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
