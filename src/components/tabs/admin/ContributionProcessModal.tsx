import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { AppData, BroadcastLog, ContributionItem } from '../../../types';
import { useBodyScrollLock } from '../../../utils';

interface ContributionProcessModalProps {
  item: ContributionItem;
  logs: Record<string, BroadcastLog>;
  onClose: () => void;
  onSubmit: (item: ContributionItem, status: 'approved' | 'rejected', comment: string) => Promise<void>;
}

export function ContributionProcessModal({ item, logs, onClose, onSubmit }: ContributionProcessModalProps) {
  const [status, setStatus] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');
  const [editedItem, setEditedItem] = useState<ContributionItem>({ ...item });
  
  const [searchQuery, setSearchQuery] = useState('');
  
  useBodyScrollLock(true);

  const matchingLogs = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return Object.values(logs)
      .filter(log => {
        if (!log.date) return false;
        if (log.date.includes(query)) return true;
        if (log.game?.toLowerCase().includes(query)) return true;
        if (log.games?.some(g => g.name?.toLowerCase().includes(query))) return true;
        return false;
      })
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
      .slice(0, 5);
  }, [logs, searchQuery]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(editedItem, status, comment);
      onClose();
    } catch (err) {
      console.error('제보 처리 중 오류 발생:', err);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">추가 요청 처리</h2>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-purple-600">데이터 수정 (승인 시 이 데이터로 반영됨)</h3>
            
            {editedItem.type === 'live' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">방송 날짜</label>
                  <input type="date" value={editedItem.liveDate || ''} onChange={e => setEditedItem({...editedItem, liveDate: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">시작 시간</label>
                    <input type="time" value={editedItem.startTime || ''} onChange={e => setEditedItem({...editedItem, startTime: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">종료 시간</label>
                    <input type="time" value={editedItem.endTime || ''} onChange={e => setEditedItem({...editedItem, endTime: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">게임/컨텐츠 이름</label>
                  <input type="text" value={editedItem.gameName || ''} onChange={e => setEditedItem({...editedItem, gameName: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">카테고리</label>
                  <input type="text" value={editedItem.gameCategory || ''} onChange={e => setEditedItem({...editedItem, gameCategory: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">제목</label>
                  <input type="text" value={editedItem.videoTitle || ''} onChange={e => setEditedItem({...editedItem, videoTitle: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">링크</label>
                  <input type="url" value={editedItem.videoLink || ''} onChange={e => setEditedItem({...editedItem, videoLink: e.target.value})} className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">연관 생방송 찾기 (승인 시 이 기록들에 추가됨)</label>
                  <input 
                    type="text"
                    placeholder="방송 날짜 또는 게임 이름 검색"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-2"
                  />
                  {searchQuery.trim() && matchingLogs.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg max-h-40 overflow-y-auto mb-2">
                      {matchingLogs.map(log => {
                        const isSelected = (editedItem.linkedLogIds || []).includes(log.id!);
                        return (
                          <div 
                            key={log.id} 
                            onClick={() => {
                              const curr = editedItem.linkedLogIds || [];
                              if (isSelected) {
                                setEditedItem({...editedItem, linkedLogIds: curr.filter(id => id !== log.id)});
                              } else {
                                setEditedItem({...editedItem, linkedLogIds: [...curr, log.id!]});
                              }
                            }}
                            className={`p-2 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 cursor-pointer flex items-center justify-between text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isSelected ? 'bg-purple-50 dark:bg-purple-900/30' : ''}`}
                          >
                            <span>{log.date} - {log.game}</span>
                            {isSelected && <span className="text-purple-600 font-bold">선택됨</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(editedItem.linkedLogIds || []).map(id => {
                      const log = logs[id];
                      return log ? (
                        <span key={id} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                          {log.date}
                          <button onClick={() => setEditedItem({...editedItem, linkedLogIds: (editedItem.linkedLogIds || []).filter(l => l !== id)})}>
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ) : <span key={id} className="text-[10px] text-red-500">기록 없음({id})</span>;
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">처리 상태</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus('approved')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${status === 'approved' ? 'bg-green-100 text-green-700 border-2 border-green-500' : 'bg-zinc-100 text-zinc-500 border-2 border-transparent hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                승인 (데이터 반영)
              </button>
              <button
                onClick={() => setStatus('rejected')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${status === 'rejected' ? 'bg-red-100 text-red-700 border-2 border-red-500' : 'bg-zinc-100 text-zinc-500 border-2 border-transparent hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                거절
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">코멘트 / 사유</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="제안자에게 보낼 피드백 코멘트를 작성해주세요."
              className="w-full p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-20 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg font-bold text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm text-white transition-colors ${status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {status === 'approved' ? '승인 및 저장' : '거절 처리'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
