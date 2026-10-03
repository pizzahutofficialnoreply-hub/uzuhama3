import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc,
  writeBatch,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ActionModal } from './ActionModal';
import { 
  MessageSquare, 
  Trash2, 
  Check, 
  RefreshCw,
  User,
  Bug,
  Lightbulb,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { AppData, BroadcastLog } from '../../../types';

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
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<{ id: string; type: 'feedback'; uid?: string; title?: string } | null>(null);
  const [selectedFeedbacks, setSelectedFeedbacks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const qFeed = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
    const unFeed = onSnapshot(qFeed, (snapshot) => {
      const items: FeedbackItem[] = [];
      snapshot.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() } as FeedbackItem));
      setFeedbacks(items);
      setLoading(false);
    }, (err) => {
      console.warn('feedbacks snapshot error:', err);
      setLoading(false);
    });

    return () => unFeed();
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

  const handleUpdateStatus = async (status: 'approved' | 'rejected', comment: string) => {
    if (!actionTarget) return;
    const { id, uid, title } = actionTarget;
    
    await updateDoc(doc(db, 'feedbacks', id), { 
      status, 
      adminComment: comment,
      reviewedAt: serverTimestamp()
    });

    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status, adminComment: comment } : f));

    if (uid) {
      await addDoc(collection(db, 'notifications'), {
        userId: uid,
        type: 'status_update',
        targetType: 'feedback',
        targetTitle: title || '제안/버그 피드백',
        status,
        comment,
        isRead: false,
        createdAt: serverTimestamp()
      });
    }
  };

  const toggleFeedbackSelect = (id: string) => {
    const newSet = new Set(selectedFeedbacks);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedFeedbacks(newSet);
  };

  const toggleAllFeedbacks = () => {
    if (selectedFeedbacks.size === feedbacks.length) setSelectedFeedbacks(new Set());
    else setSelectedFeedbacks(new Set(feedbacks.map(f => f.id)));
  };

  if (loading) {
    return <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-zinc-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              피드백 및 버그 제보 ({feedbacks.length}건)
            </h3>
            <p className="text-xs text-zinc-500 mt-1">사용자가 제출한 기능 제안 및 버그 리포트를 확인하고 처리합니다.</p>
          </div>
          {selectedFeedbacks.size > 0 && (
            <button onClick={handleBulkDeleteFeedbacks} className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer">
              <Trash2 className="w-4 h-4" /> 선택 삭제 ({selectedFeedbacks.size})
            </button>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <input 
              type="checkbox" 
              checked={selectedFeedbacks.size === feedbacks.length && feedbacks.length > 0} 
              onChange={toggleAllFeedbacks} 
              className="w-4 h-4 text-purple-600 rounded cursor-pointer" 
            />
            <span className="text-xs font-bold text-zinc-500">전체 선택</span>
          </div>
          
          {feedbacks.map(item => {
            const date = item.createdAt?.toDate ? format(item.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : '날짜 없음';
            return (
              <div key={item.id} className="flex gap-3 sm:gap-4 p-3.5 sm:p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
                <input 
                  type="checkbox" 
                  checked={selectedFeedbacks.has(item.id)} 
                  onChange={() => toggleFeedbackSelect(item.id)} 
                  className="w-4 h-4 text-purple-600 rounded mt-1 shrink-0 cursor-pointer" 
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${item.type === 'suggestion' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300' : 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300'}`}>
                      {item.type === 'suggestion' ? <Lightbulb className="w-3 h-3" /> : <Bug className="w-3 h-3" />}
                      {item.type === 'suggestion' ? '기능 제안' : '버그 제보'}
                    </span>
                    <span className="text-xs text-zinc-400">{date}</span>
                    {item.os && <span className="text-xs px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">{item.os}</span>}
                    {item.problemArea && <span className="text-xs px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">{item.problemArea}</span>}
                    
                    <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto justify-end mt-1 sm:mt-0">
                      {(!item.status || item.status === 'pending') && (
                        <button onClick={() => setActionTarget({ id: item.id, type: 'feedback', uid: item.uid, title: item.title })} className="px-2.5 py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer">
                          심사/답변
                        </button>
                      )}
                      {item.status === 'approved' && <span className="px-2 py-1 bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 rounded text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> 반영완료</span>}
                      {item.status === 'rejected' && <span className="px-2 py-1 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-xs font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> 보류됨</span>}
                    </div>
                  </div>
                  
                  <h4 className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base mb-1">{item.title}</h4>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{item.content}</p>

                  {item.adminComment && (
                    <div className="mt-3 p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 rounded-lg text-xs">
                      <span className="font-bold text-purple-700 dark:text-purple-300">관리자 코멘트: </span>
                      <span className="text-zinc-700 dark:text-zinc-300">{item.adminComment}</span>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                    <User className="w-3 h-3" /> {item.email || '익명 사용자'}
                  </div>
                </div>
                <button onClick={() => handleDeleteFeedback(item.id)} className="self-start p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer" title="삭제">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          
          {feedbacks.length === 0 && (
            <div className="text-center py-12 text-zinc-500">접수된 피드백이 없습니다.</div>
          )}
        </div>
      </div>

      <ActionModal 
        isOpen={!!actionTarget && actionTarget.type === 'feedback'} 
        onClose={() => setActionTarget(null)} 
        onSubmit={handleUpdateStatus} 
        title="피드백 검토 및 답변"
      />
    </div>
  );
}
