import { noteReads } from '../../../utils/readStats';
import HoldButton from './HoldButton';
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, limit, 
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
  XCircle,
  Database,
  FileEdit,
  PlusCircle,
  Calendar,
  ExternalLink,
  Video,
  Zap,
  Gamepad2,
  AlertCircle,
  Flag
} from 'lucide-react';
import { format } from 'date-fns';
import { AppData, BroadcastLog } from '../../../types';
import { confirmSheet } from '../../../utils/ui';

export interface FeedbackItem {
  id: string;
  type: 'suggestion' | 'bug' | 'data_request';
  dataRequestType?: 'edit' | 'delete' | 'add';
  targetLogId?: string;
  targetLogDate?: string;
  targetLogSummary?: string;
  selectedSubItemCount?: number;
  selectedSubItems?: { id: string; type: string; label: string; value: string }[];
  fieldDate?: string;
  fieldVideoTitle?: string;
  fieldVideoLink?: string;
  fieldGameTitle?: string;
  fieldGameLink?: string;
  fieldShortsTitle?: string;
  fieldShortsLink?: string;
  fieldAbsenceReason?: string;
  fieldMemo?: string;
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
    // 최근 200개만 (예전엔 화면 오류·검색 만족도까지 전부 실시간으로 받아서, 탭이 다시 연결될 때마다 수천 번씩 읽혔음)
    const qFeed = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'), limit(200));
    const unFeed = onSnapshot(qFeed, (snapshot) => {
      if (!snapshot.metadata.fromCache) noteReads('feedbacks(관리자 제보함 실시간)', Math.max(1, snapshot.docChanges().length));
      const items: FeedbackItem[] = [];
      // ⋮ › 신고 · 검색 결과 추가도 여기 (검색 만족도 👍👎 와 화면 오류는 자동화 탭에서)
      snapshot.forEach(docSnap => { const d = docSnap.data(); if (d.type !== 'search_rating' && d.type !== 'client_error') items.push({ id: docSnap.id, ...d } as FeedbackItem); });
      setFeedbacks(items);
      setLoading(false);
    }, (err) => {
      console.warn('feedbacks snapshot error:', err);
      setLoading(false);
    });

    return () => unFeed();
  }, []);

  const handleDeleteFeedback = async (id: string) => {
    if (await confirmSheet('이 피드백을 삭제할까요?')) {
      await deleteDoc(doc(db, 'feedbacks', id));
    }
  };

  const handleBulkDeleteFeedbacks = async () => {
    if (selectedFeedbacks.size === 0) return;
    if (await confirmSheet(`선택한 ${selectedFeedbacks.size}개의 피드백을 삭제할까요?`)) {
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
            <p className="text-xs text-zinc-500 mt-1">사용자가 제출한 기능 제안 및 버그 리포트를 확인하고 처리해요.</p>
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
                    {item.type === 'suggestion' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300">
                        <Lightbulb className="w-3 h-3" />
                        기능 제안
                      </span>
                    ) : item.type === 'bug' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300">
                        <Bug className="w-3 h-3" />
                        버그 제보
                      </span>
                    ) : (item.type as string) === 'search_report' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300">
                        <Flag className="w-3 h-3" />
                        {(item as any).reason === 'wrong_ai_summary' ? 'AI 요약 신고' : '신고'}
                      </span>
                    ) : (item.type as string) === 'search_add' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                        <PlusCircle className="w-3 h-3" />
                        검색 결과 추가
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${
                        item.dataRequestType === 'edit'
                          ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : item.dataRequestType === 'delete'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {item.dataRequestType === 'edit' ? (
                          <FileEdit className="w-3 h-3" />
                        ) : item.dataRequestType === 'delete' ? (
                          <Trash2 className="w-3 h-3" />
                        ) : (
                          <PlusCircle className="w-3 h-3" />
                        )}
                        {item.dataRequestType === 'edit'
                          ? '데이터 수정 요청'
                          : item.dataRequestType === 'delete'
                          ? '데이터 삭제 요청'
                          : '데이터 추가 요청'
                        }
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{date}</span>
                    {item.os && <span className="text-xs px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">{item.os}</span>}
                    {item.problemArea && <span className="text-xs px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">{item.problemArea}</span>}
                    
                    <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto justify-end mt-1 sm:mt-0">
                      {(item.type as string) === 'search_report' && <HoldButton videoId={(item as any).videoId} reason={(item as any).reason} />}
                      {(!item.status || item.status === 'pending') && (
                        <button onClick={() => setActionTarget({ id: item.id, type: 'feedback', uid: item.uid, title: item.title })} className="px-2.5 py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer">
                          심사/답변
                        </button>
                      )}
                      {item.status === 'approved' && <span className="px-2 py-1 bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 rounded text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> 반영완료</span>}
                      {item.status === 'rejected' && <span className="px-2 py-1 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-xs font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> 보류됨</span>}
                    </div>
                  </div>

                  {item.targetLogSummary && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center gap-1.5 text-xs text-indigo-900 dark:text-indigo-200">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="font-bold">대상 일지:</span>
                      <span className="truncate">{item.targetLogSummary}</span>
                    </div>
                  )}

                  {/* 데이터 요청 시: 선택된 세부 항목 및 각각 분류된 상세 필드 시각화 */}
                  {item.type === 'data_request' && (item.fieldDate || item.fieldVideoTitle || item.fieldVideoLink || item.fieldGameTitle || item.fieldGameLink || item.fieldShortsTitle || item.fieldShortsLink || item.fieldAbsenceReason || (item.selectedSubItems && item.selectedSubItems.length > 0)) && (
                    <div className="mb-3 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2 text-xs">
                      {item.selectedSubItems && item.selectedSubItems.length > 0 && (
                        <div className="pb-1.5 border-b border-indigo-100/80 dark:border-indigo-900/40">
                          <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 block mb-1">
                            선택된 수정 대상 항목 ({item.selectedSubItems.length}개):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.selectedSubItems.map((sub, sIdx) => (
                              <span key={sIdx} className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 text-[11px] text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">{sub.label}:</span>
                                <span className="truncate max-w-[200px]">{sub.value}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 text-zinc-700 dark:text-zinc-300">
                        {item.fieldDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span className="font-bold text-zinc-500">일자:</span>
                            <span className="font-semibold">{item.fieldDate}</span>
                          </div>
                        )}
                        {item.fieldVideoTitle && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <Video className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-bold text-zinc-500">영상 제목:</span>
                            <span className="font-semibold">{item.fieldVideoTitle}</span>
                          </div>
                        )}
                        {item.fieldVideoLink && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <ExternalLink className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-bold text-zinc-500">영상 링크:</span>
                            <a href={item.fieldVideoLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">
                              {item.fieldVideoLink}
                            </a>
                          </div>
                        )}
                        {item.fieldShortsTitle && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-bold text-zinc-500">쇼츠 제목:</span>
                            <span className="font-semibold">{item.fieldShortsTitle}</span>
                          </div>
                        )}
                        {item.fieldShortsLink && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <ExternalLink className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-bold text-zinc-500">쇼츠 링크:</span>
                            <a href={item.fieldShortsLink} target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 hover:underline truncate">
                              {item.fieldShortsLink}
                            </a>
                          </div>
                        )}
                        {item.fieldGameTitle && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <Gamepad2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-bold text-zinc-500">게임 제목:</span>
                            <span className="font-semibold">{item.fieldGameTitle}</span>
                          </div>
                        )}
                        {item.fieldGameLink && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-bold text-zinc-500">게임 링크:</span>
                            <a href={item.fieldGameLink} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline truncate">
                              {item.fieldGameLink}
                            </a>
                          </div>
                        )}
                        {item.fieldAbsenceReason && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="font-bold text-zinc-500">휴방 사유:</span>
                            <span className="font-semibold text-rose-600 dark:text-rose-400">{item.fieldAbsenceReason}</span>
                          </div>
                        )}
                        {item.fieldMemo && (
                          <div className="sm:col-span-2 text-zinc-600 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
                            <span className="font-bold text-zinc-500 block mb-0.5">추가 요청 사항:</span>
                            <span>{item.fieldMemo}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <h4 className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base mb-1">{item.title}</h4>
                  {(item as any).feedbackKind && <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400">{(item as any).feedbackKind}{(item as any).problemArea ? ` · ${(item as any).problemArea}` : ''}</p>}
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                  {(item as any).attachments && (() => {
                    const at = (item as any).attachments;
                    return (
                      <div className="mt-2 space-y-1.5 text-[11px]">
                        {at.device && <p className="text-zinc-500">📱 {at.device.device} · {at.device.os} · {at.device.browser} · {at.device.app}</p>}
                        {at.diagnose && <details className="rounded-lg bg-zinc-50 dark:bg-zinc-950 px-2 py-1"><summary className="cursor-pointer font-semibold">앱 진단</summary><pre className="whitespace-pre-wrap break-all text-[10.5px] text-zinc-600 dark:text-zinc-300 mt-1 max-h-64 overflow-auto">{at.diagnose}</pre></details>}
                        {at.selftest && <details className="rounded-lg bg-zinc-50 dark:bg-zinc-950 px-2 py-1"><summary className="cursor-pointer font-semibold">앱 점검 결과 · {String(at.selftest).split('\n')[0]}</summary><pre className="whitespace-pre-wrap break-all text-[10.5px] text-zinc-600 dark:text-zinc-300 mt-1 max-h-64 overflow-auto">{at.selftest}</pre></details>}
                        {Array.isArray(at.images) && at.images.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">{at.images.map((src: string, i: number) => <img key={i} src={src} alt={`첨부 ${i + 1}`} onClick={(e) => (e.currentTarget as HTMLImageElement).classList.toggle('w-20')} className="w-20 max-w-full rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 cursor-zoom-in" />)}</div>
                        )}
                      </div>
                    );
                  })()}

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
            <div className="text-center py-12 text-zinc-500">접수된 피드백이 없어요.</div>
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
