import { useState, useMemo } from 'react';
import { X, Loader2, Image as ImageIcon } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BroadcastLog } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock } from '../utils';

interface UserContributeModalProps {
  type: 'live' | 'video' | 'shorts';
  onClose: () => void;
  logs?: Record<string, BroadcastLog>;
}

export function UserContributeModal({ type, onClose, logs }: UserContributeModalProps) {
  useBodyScrollLock(true);
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live fields
  const [liveDate, setLiveDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [gameName, setGameName] = useState('');
  const [gameCategory, setGameCategory] = useState('');

  // Video/Shorts fields
  const [videoTitle, setVideoTitle] = useState('');
  const [videoLink, setVideoLink] = useState('');
  
  // Link to existing logs
  const [searchQuery, setSearchQuery] = useState('');
  const [linkedLogIds, setLinkedLogIds] = useState<string[]>([]);
  
  const matchingLogs = useMemo(() => {
    if (!logs || !searchQuery.trim()) return [];
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
      .slice(0, 5); // Limit to 5 results
  }, [logs, searchQuery]);

  const getTitle = () => {
    switch (type) {
      case 'live': return '생방송 정보 추가';
      case 'video': return '영상 정보 추가';
      case 'shorts': return '쇼츠 정보 추가';
    }
  };

  const getYoutubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const youtubeId = useMemo(() => getYoutubeVideoId(videoLink), [videoLink]);

  const handleSubmit = async () => {
    if (type === 'live') {
      if (!liveDate || !gameName) {
        alert('생방송 날짜와 게임 이름은 필수입니다.');
        return;
      }
    } else {
      if (!videoTitle || !videoLink) {
        alert('제목과 링크는 필수입니다.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const data: any = {
        type,
        uid: user?.uid,
        email: user?.email,
        status: 'pending',
        createdAt: serverTimestamp(),
      };

      if (type === 'live') {
        data.liveDate = liveDate;
        data.startTime = startTime;
        data.endTime = endTime;
        data.gameName = gameName;
        data.gameCategory = gameCategory;
      } else {
        data.videoTitle = videoTitle;
        data.videoLink = videoLink;
        data.linkedLogIds = linkedLogIds;
      }

      await addDoc(collection(db, 'contributions'), data);
      alert('추가 요청이 성공적으로 접수되었습니다! 관리자 승인 후 반영됩니다.');
      onClose();
    } catch (e) {
      console.error(e);
      alert('접수 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">{getTitle()}</h2>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {type === 'live' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">방송 날짜 *</label>
                <input 
                  type="date"
                  value={liveDate}
                  onChange={e => setLiveDate(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">시작 시간</label>
                  <input 
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">종료 시간</label>
                  <input 
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">게임 / 컨텐츠 카테고리</label>
                <input 
                  type="text"
                  placeholder="예: 종겜, 저챗, 마인크래프트"
                  value={gameCategory}
                  onChange={e => setGameCategory(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">게임 / 컨텐츠 이름 *</label>
                <input 
                  type="text"
                  placeholder="예: 배틀그라운드"
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">URL (링크) *</label>
                <input 
                  type="url"
                  placeholder="유튜브 링크를 입력하세요"
                  value={videoLink}
                  onChange={e => setVideoLink(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                />
                
                {videoLink && (
                  <div className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-[120px] p-2 mt-2">
                    {youtubeId ? (
                      <img 
                        src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`} 
                        alt="미리보기" 
                        className="w-full h-auto object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-zinc-400 flex flex-col items-center">
                        <ImageIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs">미리보기를 지원하지 않는 URL입니다.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">영상 제목 *</label>
                <input 
                  type="text"
                  placeholder="영상 제목을 입력하세요"
                  value={videoTitle}
                  onChange={e => setVideoTitle(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">연관된 생방송 찾기 (선택사항)</label>
                <input 
                  type="text"
                  placeholder="방송 날짜(YYYY-MM-DD) 또는 게임 이름 검색"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                />
                
                {searchQuery.trim() && matchingLogs.length > 0 && (
                  <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg max-h-40 overflow-y-auto mt-2">
                    {matchingLogs.map(log => {
                      const isSelected = linkedLogIds.includes(log.id!);
                      return (
                        <div 
                          key={log.id} 
                          onClick={() => {
                            if (isSelected) {
                              setLinkedLogIds(prev => prev.filter(id => id !== log.id));
                            } else {
                              setLinkedLogIds(prev => [...prev, log.id!]);
                            }
                          }}
                          className={`p-2 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 cursor-pointer flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${isSelected ? 'bg-purple-50 dark:bg-purple-900/30' : ''}`}
                        >
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">{log.date}</p>
                            <p className="text-xs text-zinc-500">{log.game || '게임 정보 없음'}</p>
                          </div>
                          {isSelected && <span className="text-xs font-bold text-purple-600 bg-purple-100 dark:bg-purple-900/50 px-2 py-1 rounded">선택됨</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {searchQuery.trim() && matchingLogs.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-2">검색 결과가 없습니다.</p>
                )}
                {linkedLogIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {linkedLogIds.map(id => {
                      const log = logs?.[id];
                      return log ? (
                        <span key={id} className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded flex items-center gap-1">
                          {log.date} {log.game}
                          <button onClick={() => setLinkedLogIds(prev => prev.filter(l => l !== id))}><X className="w-3 h-3" /></button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
            ) : '요청하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
