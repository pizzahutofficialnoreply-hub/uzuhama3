import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc,
  writeBatch,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { ActionModal } from './ActionModal';
import { ContributionProcessModal } from './ContributionProcessModal';

const RAW_VERCEL_API = import.meta.env.VITE_VERCEL_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
const VERCEL_API_BASE = (RAW_VERCEL_API || '').replace(/\/+$/, '');
const SEND_NOTIFICATION_URL = `${VERCEL_API_BASE}/api/notifications/send`;
import { 
  MessageSquare, 
  Trash2, 
  Check, 
  RefreshCw,
  Search,
  User,
  AlertCircle,
  Image as ImageIcon,
  Bug,
  Lightbulb,
  Video,
  PlaySquare,
  Youtube,
  XCircle,
  Plus,
  Bell
} from 'lucide-react';
import { format } from 'date-fns';
import { ContributionItem, AppData, BroadcastLog, PushSubscriptionItem } from '../../../types';

export interface FeedbackItem {
  id: string;
  type: 'suggestion' | 'bug';
  title: string;
  content: string;
  os?: string;
  problemArea?: string;
  fileUrl?: string;
  uid?: string;
  email?: string;
  createdAt: any;
  status?: 'pending' | 'approved' | 'rejected';
  adminComment?: string;
}

export function AdminSuggestionsTab({ 
  data, 
  onAddLog, 
  onUpdateLog 
}: { 
  data: AppData; 
  onAddLog: (log: BroadcastLog) => Promise<void>; 
  onUpdateLog: (log: BroadcastLog) => Promise<void>; 
}) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [contributions, setContributions] = useState<ContributionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<{ id: string; type: 'feedback' | 'contribution'; uid?: string; title?: string; item?: any } | null>(null);
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'contributions'>('feedbacks');
  
  const [selectedFeedbacks, setSelectedFeedbacks] = useState<Set<string>>(new Set());
  const [selectedContributions, setSelectedContributions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const qFeed = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
    const unFeed = onSnapshot(qFeed, (snapshot) => {
      const items: FeedbackItem[] = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() } as FeedbackItem));
      setFeedbacks(items);
    }, (err) => {
      console.warn('feedbacks snapshot error:', err);
    });

    const qCont = query(collection(db, 'contributions'), orderBy('createdAt', 'desc'));
    const unCont = onSnapshot(qCont, (snapshot) => {
      const items: ContributionItem[] = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() } as ContributionItem));
      setContributions(items);
      setLoading(false);
    }, (err) => {
      console.warn('contributions snapshot error:', err);
      setLoading(false);
    });

    return () => {
      unFeed();
      unCont();
    };
  }, []);

  const handleDeleteFeedback = async (id: string) => {
    if (confirm('이 피드백을 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'feedbacks', id));
    }
  };

  const handleBulkDeleteFeedbacks = async () => {
    if (selectedFeedbacks.size === 0) return;
    if (confirm(`선택한 ${selectedFeedbacks.size}개의 피드백을 삭제하시겠습니까?`)) {
      const batch = writeBatch(db);
      selectedFeedbacks.forEach(id => {
        batch.delete(doc(db, 'feedbacks', id));
      });
      await batch.commit();
      setSelectedFeedbacks(new Set());
    }
  };

  const handleDeleteContribution = async (id: string) => {
    if (confirm('이 추가 요청을 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'contributions', id));
    }
  };

  const handleBulkDeleteContributions = async () => {
    if (selectedContributions.size === 0) return;
    if (confirm(`선택한 ${selectedContributions.size}개의 요청을 삭제하시겠습니까?`)) {
      const batch = writeBatch(db);
      selectedContributions.forEach(id => {
        batch.delete(doc(db, 'contributions', id));
      });
      await batch.commit();
      setSelectedContributions(new Set());
    }
  };

  const sendPushNotificationToUser = async (_uid: string, _title: string, _body: string, _url: string = '/') => {
    // push_queue는 보안을 위해 잠겨있으며, 개별 제보 알림은 브라우저 백엔드 마이그레이션 대상입니다.
    // 에러 없이 안전하게 통과시킵니다.
    return;
  };

  const handleUpdateStatus = async (status: 'approved' | 'rejected', comment: string) => {
    if (!actionTarget) return;
    const { id, type, uid, title } = actionTarget;
    const targetUid = uid || (actionTarget as any).userId;
    
    const collectionName = type === 'feedback' ? 'feedbacks' : 'contributions';
    await updateDoc(doc(db, collectionName, id), { 
      status, 
      adminComment: comment,
      reviewedAt: serverTimestamp()
    });

    if (type === 'feedback') {
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status, adminComment: comment } : f));
    } else {
      setContributions(prev => prev.map(c => c.id === id ? { ...c, status, adminComment: comment } : c));
    }

    if (targetUid) {
      await addDoc(collection(db, 'notifications'), {
        userId: targetUid,
        type: 'status_update',
        targetType: type,
        targetTitle: title || '제보/제안',
        status,
        comment,
        isRead: false,
        createdAt: serverTimestamp()
      });

      const statusText = status === 'approved' ? '승인' : '반려';
      const pushTitle = `[제보 심사] ${statusText}되었습니다`;
      const pushBody = comment ? `사유: ${comment}` : `제출해주신 '${title || '제보'}' 건이 ${statusText} 처리되었습니다.`;
      await sendPushNotificationToUser(targetUid, pushTitle, pushBody);
    }
  };

  const handleUpdateContribution = async (item: ContributionItem, status: 'approved' | 'rejected', comment: string) => {
    const targetUid = item.uid || (item as any).userId;
    
    if (status === 'approved') {
      if (item.type === 'live') {
        // 방송 시간 계산
        let durationHours = 0;
        if (item.startTime && item.endTime) {
          const [sh, sm] = item.startTime.split(':').map(Number);
          const [eh, em] = item.endTime.split(':').map(Number);
          let diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff < 0) diff += 24 * 60; // 자정을 넘긴 방송
          durationHours = Math.round((diff / 60) * 10) / 10;
        }

        const newLog: BroadcastLog = {
          id: `log-${Date.now()}`,
          date: item.liveDate || new Date().toISOString().slice(0, 10),
          time: item.startTime || '',
          endTime: item.endTime || '',
          isAbsence: false,
          category: item.gameCategory || '',
          game: item.gameName || '게임',
          games: [{ name: item.gameName || '게임', category: item.gameCategory || '', link: '' }],
          durationHours,
          vods: [],
          edited: [],
          shorts: []
        };
        await onAddLog(newLog);
      } else if (item.type === 'video' || item.type === 'shorts') {
        const linkedIds = item.linkedLogIds || [];
        let connected = false;

        // 1. 지정된 연결 로그에 추가
        if (linkedIds.length > 0) {
          for (const logId of linkedIds) {
            const targetLog = data.logs?.[logId];
            if (targetLog) {
              const arrName = item.type === 'shorts' ? 'shorts' : 'edited';
              const arr = targetLog[arrName] || [];
              await onUpdateLog({
                ...targetLog,
                [arrName]: [...arr, { title: item.videoTitle || '', url: item.videoLink || '' }]
              });
              connected = true;
            }
          }
        }

        // 2. 연결 ID가 없거나 실패한 경우 방송 일자(liveDate)와 일치하는 방송 로그 검색
        if (!connected && item.liveDate) {
          const matchingLog = Object.values(data.logs || {}).find(l => l.date === item.liveDate);
          if (matchingLog) {
            const arrName = item.type === 'shorts' ? 'shorts' : 'edited';
            const arr = matchingLog[arrName] || [];
            await onUpdateLog({
              ...matchingLog,
              [arrName]: [...arr, { title: item.videoTitle || '', url: item.videoLink || '' }]
            });
            connected = true;
          }
        }

        // 3. 일치하는 날짜도 없는 경우 새 로그를 생성하여 비디오 등록
        if (!connected) {
          const arrName = item.type === 'shorts' ? 'shorts' : 'edited';
          const newLog: BroadcastLog = {
            id: `log-${Date.now()}`,
            date: item.liveDate || new Date().toISOString().slice(0, 10),
            time: '',
            isAbsence: false,
            category: '',
            game: item.videoTitle || '유튜브 영상',
            games: [{ name: item.videoTitle || '유튜브 영상', category: '', link: item.videoLink || '' }],
            durationHours: 0,
            vods: [],
            edited: item.type === 'video' ? [{ title: item.videoTitle || '', url: item.videoLink || '' }] : [],
            shorts: item.type === 'shorts' ? [{ title: item.videoTitle || '', url: item.videoLink || '' }] : []
          };
          await onAddLog(newLog);
        }
      }
    }
    
    // 제보 문서 상태 업데이트 (id 제외하고 status를 최우선으로 저장)
    const { id: itemId, ...cleanItem } = item;
    const updatePayload = {
      ...cleanItem,
      status,
      adminComment: comment || '',
      reviewedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, 'contributions', item.id!), updatePayload);

    // 즉시 로컬 state 갱신 (화면에 '승인됨' or '거절됨' 즉각 반영)
    setContributions(prev => prev.map(c => c.id === item.id ? { 
      ...c, 
      ...cleanItem, 
      status, 
      adminComment: comment || '' 
    } : c));

    // 유저에게 심사 결과 알림 발송
    if (targetUid) {
      await addDoc(collection(db, 'notifications'), {
        userId: targetUid,
        type: 'status_update',
        targetType: item.type,
        targetTitle: item.videoTitle || item.gameName || '제보/제안',
        status,
        comment: comment || '',
        isRead: false,
        createdAt: serverTimestamp()
      });

      const statusText = status === 'approved' ? '승인' : '반려';
      const targetName = item.videoTitle || item.gameName || '기여 제보';
      const pushTitle = `[제보 심사] ${statusText} 완료`;
      const pushBody = comment ? `사유: ${comment}` : `제출해주신 '${targetName}' 제보가 ${statusText} 처리되었습니다.`;
      await sendPushNotificationToUser(targetUid, pushTitle, pushBody);
    }
  };

  // 관리자 테스트 전체 알림 발송 핸들러
  const handleSendTestNotification = async () => {
    try {
      // 1. 브라우저 네이티브 알림 팝업 즉시 발생 (관리자 화면 즉시 피드백)
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          try {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.ready;
              await reg.showNotification('[우주하마] 테스트 알림 발송', {
                body: '치지직 방송 알림 시스템이 정상 작동 중입니다!',
                icon: '/icon.png',
                badge: '/icon.png',
                data: { url: '/' }
              } as any);
            } else {
              new Notification('[우주하마] 테스트 알림 발송', {
                body: '치지직 방송 알림 시스템이 정상 작동 중입니다!',
                icon: '/icon.png'
              });
            }
          } catch {
            new Notification('[우주하마] 테스트 알림 발송', {
              body: '치지직 방송 알림 시스템이 정상 작동 중입니다!',
              icon: '/icon.png'
            });
          }
        }
      }

      // 2. Vercel 백엔드 API를 통해 모든 구독 기기에 실제 FCM 푸시 발송
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        alert('관리자 인증 세션이 만료되었습니다. 다시 로그인 후 시도해주세요.');
        return;
      }

      const res = await fetch(SEND_NOTIFICATION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          title: '[우주하마 방송 예측] 테스트 전체 알림',
          body: '푸시 알림 수신이 정상적으로 연결되어 있습니다.',
          url: '/'
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || '알림 발송 서버 응답 오류');
      }

      if (resData.message && !resData.success) {
        alert(`⚠️ 알림 발송 안내\n\n${resData.message}`);
        return;
      }

      alert(`🔔 전체 기기 테스트 알림 발송 완료!\n- 성공: ${resData.successCount ?? 0}대\n- 실패/만료: ${resData.failureCount ?? 0}대${resData.cleanedTokens ? `\n- 만료 정리된 토큰: ${resData.cleanedTokens}개` : ''}`);
    } catch (err: any) {
      console.error('테스트 알림 발송 오류:', err);
      alert(`테스트 알림 발송 중 오류: ${err?.message || err}`);
    }
  };

  const toggleFeedbackSelect = (id: string) => {
    const newSet = new Set(selectedFeedbacks);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedFeedbacks(newSet);
  };

  const toggleContributionSelect = (id: string) => {
    const newSet = new Set(selectedContributions);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContributions(newSet);
  };

  const toggleAllFeedbacks = () => {
    if (selectedFeedbacks.size === feedbacks.length) setSelectedFeedbacks(new Set());
    else setSelectedFeedbacks(new Set(feedbacks.map(f => f.id)));
  };

  const toggleAllContributions = () => {
    if (selectedContributions.size === contributions.length) setSelectedContributions(new Set());
    else setSelectedContributions(new Set(contributions.map(c => c.id)));
  };

  if (loading) {
    return <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-zinc-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('feedbacks')}
            className={`shrink-0 px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm transition-colors ${activeTab === 'feedbacks' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            피드백 및 버그 ({feedbacks.length})
          </button>
          <button 
            onClick={() => setActiveTab('contributions')}
            className={`shrink-0 px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm transition-colors ${activeTab === 'contributions' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            데이터 추가 요청 ({contributions.length})
          </button>
        </div>

        <button
          onClick={handleSendTestNotification}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-bold transition-colors border border-purple-200 dark:border-purple-800 w-full sm:w-auto"
          title="모든 구독 기기 및 현재 브라우저에 테스트 알림을 발송합니다"
        >
          <Bell className="w-3.5 h-3.5" />
          <span>테스트 전체 알림 발송</span>
        </button>
      </div>

      {activeTab === 'feedbacks' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 sm:p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              피드백 및 버그 리스트
            </h3>
            {selectedFeedbacks.size > 0 && (
              <button onClick={handleBulkDeleteFeedbacks} className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors">
                <Trash2 className="w-4 h-4" /> 선택 삭제 ({selectedFeedbacks.size})
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <input type="checkbox" checked={selectedFeedbacks.size === feedbacks.length && feedbacks.length > 0} onChange={toggleAllFeedbacks} className="w-4 h-4 text-purple-600 rounded" />
              <span className="text-xs font-bold text-zinc-500">전체 선택</span>
            </div>
            
            {feedbacks.map(item => {
              const date = item.createdAt?.toDate ? format(item.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : '날짜 없음';
              return (
                <div key={item.id} className="flex gap-4 p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
                  <input type="checkbox" checked={selectedFeedbacks.has(item.id)} onChange={() => toggleFeedbackSelect(item.id)} className="w-4 h-4 text-purple-600 rounded mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.type === 'bug' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        {item.type === 'bug' ? <Bug className="w-3 h-3 inline mr-1"/> : <Lightbulb className="w-3 h-3 inline mr-1"/>}
                        {item.type === 'bug' ? '버그' : '제안'}
                      </span>
                      <h4 className="font-bold text-zinc-900 dark:text-white">{item.title}</h4>
                      <span className="text-xs text-zinc-400 ml-auto">{date}</span>
                    </div>
                    {item.type === 'bug' && (
                      <div className="flex gap-2 mb-2 text-xs text-zinc-500">
                        <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded">{item.os}</span>
                        <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded">{item.problemArea}</span>
                      </div>
                    )}
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{item.content}</p>
                    
                    {item.fileUrl && (
                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 text-xs text-blue-500 hover:underline">
                        <ImageIcon className="w-3 h-3" /> 첨부 이미지 보기
                      </a>
                    )}
                    <div className="mt-2 text-xs text-zinc-400 flex items-center gap-1">
                      <User className="w-3 h-3" /> {item.email || '익명 사용자'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {(!item.status || item.status === 'pending') && (
                      <button onClick={() => setActionTarget({ id: item.id, type: 'feedback', uid: item.uid, title: item.title })} className="p-2 text-zinc-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title="처리하기">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {item.status === 'approved' && <span className="p-2 text-green-500" title="승인됨"><Check className="w-4 h-4" /></span>}
                    {item.status === 'rejected' && <span className="p-2 text-red-500" title="거절됨"><XCircle className="w-4 h-4" /></span>}
                    <button onClick={() => handleDeleteFeedback(item.id)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            
            {feedbacks.length === 0 && (
              <div className="text-center py-12 text-zinc-500">피드백 내역이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'contributions' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 sm:p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-600" />
              데이터 추가 요청 리스트
            </h3>
            {selectedContributions.size > 0 && (
              <button onClick={handleBulkDeleteContributions} className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors">
                <Trash2 className="w-4 h-4" /> 선택 삭제 ({selectedContributions.size})
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <input type="checkbox" checked={selectedContributions.size === contributions.length && contributions.length > 0} onChange={toggleAllContributions} className="w-4 h-4 text-purple-600 rounded" />
              <span className="text-xs font-bold text-zinc-500">전체 선택</span>
            </div>
            
            {contributions.map(item => {
              const date = item.createdAt?.toDate ? format(item.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : '날짜 없음';
              return (
                <div key={item.id} className="flex gap-3 sm:gap-4 p-3.5 sm:p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
                  <input type="checkbox" checked={selectedContributions.has(item.id)} onChange={() => toggleContributionSelect(item.id)} className="w-4 h-4 text-purple-600 rounded mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1
                        ${item.type === 'live' ? 'bg-purple-100 text-purple-600' : 
                          item.type === 'video' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                        {item.type === 'live' && <PlaySquare className="w-3 h-3" />}
                        {item.type === 'video' && <Video className="w-3 h-3" />}
                        {item.type === 'shorts' && <Youtube className="w-3 h-3" />}
                        {item.type === 'live' ? '생방송' : item.type === 'video' ? '영상' : '쇼츠'}
                      </span>
                      <span className="text-xs text-zinc-400">{date}</span>
                      
                      <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto justify-end mt-1 sm:mt-0">
                        {(!item.status || item.status === 'pending') && (
                          <button onClick={() => setActionTarget({ id: item.id!, type: 'contribution', uid: item.uid, title: item.videoTitle || item.gameName, item })} className="px-2 py-1 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                            처리하기
                          </button>
                        )}
                        {item.status === 'approved' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> 승인됨</span>}
                        {item.status === 'rejected' && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> 거절됨</span>}
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      {item.type === 'live' && (
                        <>
                          <div><span className="font-bold text-zinc-500 w-16 inline-block">방송일</span> {item.liveDate}</div>
                          <div><span className="font-bold text-zinc-500 w-16 inline-block">시간</span> {item.startTime} ~ {item.endTime}</div>
                          <div><span className="font-bold text-zinc-500 w-16 inline-block">게임/컨텐츠</span> {item.gameName} {item.gameCategory && `(${item.gameCategory})`}</div>
                        </>
                      )}
                      {item.type !== 'live' && (
                        <>
                          <div><span className="font-bold text-zinc-500 w-16 inline-block">제목</span> {item.videoTitle}</div>
                          <div><span className="font-bold text-zinc-500 w-16 inline-block">링크</span> <a href={item.videoLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{item.videoLink}</a></div>
                          {item.linkedLogIds && item.linkedLogIds.length > 0 && <div><span className="font-bold text-zinc-500 w-16 inline-block">연결 기록</span> {item.linkedLogIds.join(', ')}</div>}
                        </>
                      )}
                    </div>

                    <div className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                      <User className="w-3 h-3" /> {item.email || '익명 사용자'}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteContribution(item.id)} className="self-start p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            
            {contributions.length === 0 && (
              <div className="text-center py-12 text-zinc-500">추가 요청 내역이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      <ActionModal 
        isOpen={!!actionTarget && actionTarget.type === 'feedback'} 
        onClose={() => setActionTarget(null)} 
        onSubmit={handleUpdateStatus} 
        title="피드백/버그 처리"
      />

      {actionTarget?.type === 'contribution' && (
        <ContributionProcessModal 
          item={actionTarget.item as ContributionItem}
          logs={data.logs || {}}
          onClose={() => setActionTarget(null)}
          onSubmit={handleUpdateContribution}
        />
      )}
    </div>
  );
}
