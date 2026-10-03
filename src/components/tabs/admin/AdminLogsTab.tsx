import { useState, useMemo } from 'react';
import { AppData, BroadcastLog } from '../../../types';
import { List, Video, PlaySquare, ChevronDown, ChevronUp, Trash2, Youtube, Search, X } from 'lucide-react';
import { fuzzyKoreanMatch, fuzzyDateMatch } from '../../../utils';
import { matchLogMedia, matchMediaUrl } from '../../../utils/urlUtils';

const ShortsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <polygon points="10 8 16 12 10 16 10 8"></polygon>
  </svg>
);
import { LogEditorForm } from './LogEditorForm';
import { format } from 'date-fns';

export function AdminLogsTab({ 
  data, 
  onAddLog,
  onUpdateLog, 
  onDeleteLog, 
  onDeleteAllLogs 
}: { 
  data: AppData,
  onAddLog: (log: BroadcastLog) => Promise<void>,
  onUpdateLog: (log: BroadcastLog) => Promise<void>,
  onDeleteLog: (id: string) => Promise<void>,
  onDeleteAllLogs: () => Promise<void>
}) {
  const currentYear = new Date().getFullYear();
  const [filterStartDate, setFilterStartDate] = useState(`${currentYear}-01-01`);
  const [filterEndDate, setFilterEndDate] = useState(`${currentYear}-12-31`);
  const [searchTerm, setSearchTerm] = useState('');

  const allLogs = Object.values(data.logs || {}).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (!log.date) return false;
      const withinDate = log.date >= filterStartDate && log.date <= filterEndDate;
      if (!withinDate) return false;

      if (!searchTerm.trim()) return true;

      const q = searchTerm.trim().toLowerCase();
      if (fuzzyDateMatch(q, log.date)) return true;
      if (log.date.includes(q)) return true;
      if (log.time && log.time.includes(q)) return true;
      if (fuzzyKoreanMatch(q, log.game || '')) return true;
      if (fuzzyKoreanMatch(q, log.category || '')) return true;
      if (log.games?.some(g => fuzzyKoreanMatch(q, g.name) || fuzzyKoreanMatch(q, g.category || ''))) return true;
      if (log.absenceReasons?.some(r => fuzzyKoreanMatch(q, r))) return true;
      if (log.vods?.some(v => fuzzyKoreanMatch(q, v.title || ''))) return true;
      if (log.edited?.some(v => fuzzyKoreanMatch(q, v.title || ''))) return true;
      if (log.shorts?.some(v => fuzzyKoreanMatch(q, v.title || ''))) return true;

      return false;
    });
  }, [allLogs, filterStartDate, filterEndDate, searchTerm]);

  const [editingLogs, setEditingLogs] = useState<Record<string, Partial<BroadcastLog>>>({});
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <List className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          방송 기록 ({filteredLogs.length}개)
        </h3>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-2 bg-zinc-50 dark:bg-zinc-800 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 w-full sm:w-auto">
            <input 
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="bg-transparent border-none text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:ring-0 p-1 outline-none w-full sm:w-auto"
            />
            <span className="text-zinc-400 shrink-0">~</span>
            <input 
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="bg-transparent border-none text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:ring-0 p-1 outline-none w-full sm:w-auto"
            />
          </div>
          <button 
            onClick={async () => {
              if (confirm('정말로 기록을 전체 초기화하시겠습니까? (필터 무관 모든 데이터) 이 작업은 되돌릴 수 없습니다.')) {
                await onDeleteAllLogs();
              }
            }}
            className="px-3 py-2 sm:py-1.5 text-xs sm:text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            전체 초기화
          </button>
        </div>
      </div>

      {/* 관리자 검색 바 */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input 
          type="text"
          placeholder="게임명, 날짜(YYYY-MM-DD), 카테고리, 결방 사유 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {searchTerm && (
          <button 
            type="button" 
            onClick={() => setSearchTerm('')} 
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md cursor-pointer"
            title="검색어 지우기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 sm:space-y-4">
        {filteredLogs.map(log => {
          const isEditing = expandedLogId === log.id;
          const editState = editingLogs[log.id] || log;
          
          return (
            <div key={log.id} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div 
                className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
                onClick={() => {
                  if (isEditing) {
                    setExpandedLogId(null);
                  } else {
                    setExpandedLogId(log.id);
                    if (!editingLogs[log.id]) {
                      setEditingLogs(prev => ({
                        ...prev,
                        [log.id]: {
                          ...log,
                          games: log.games ? [...log.games] : (log.game ? [{ name: log.game, link: '', category: log.category || '' }] : []),
                          vods: log.vods ? [...log.vods] : [],
                          edited: log.edited ? [...log.edited] : [],
                          shorts: log.shorts ? [...log.shorts] : [],
                          absenceReasons: log.absenceReasons ? [...log.absenceReasons] : []
                        }
                      }));
                    }
                  }
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg font-bold font-mono text-xs sm:text-sm shrink-0">
                      {log.date}
                    </div>
                    <div className="text-zinc-900 dark:text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shrink-0">
                      {log.time} 
                      {log.endTime && <span className="text-xs font-normal text-zinc-500">~ {log.endTime}</span>}
                    </div>
                  </div>
                  <div className="text-zinc-500 text-xs sm:text-sm truncate">
                    {log.isAbsence ? (
                      <span className="text-red-500 font-medium mr-1.5">[휴방]</span>
                    ) : (
                      log.category && <span className="mr-1.5 text-purple-600 dark:text-purple-400">[{log.category}]</span>
                    )}
                    <span>{log.isAbsence ? (log.absenceReasons || []).join(', ') : log.game}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <div className="hidden md:flex gap-2">
                    {log.vods?.length > 0 && <span className="flex items-center gap-1 text-xs text-blue-500" title="풀영상"><Video className="w-3 h-3"/> {log.vods.length}</span>}
                    {log.edited?.length > 0 && <span className="flex items-center gap-1 text-xs text-red-500" title="편집본"><Youtube className="w-3 h-3"/> {log.edited.length}</span>}
                    {log.shorts?.length > 0 && <span className="flex items-center gap-1 text-xs text-red-600" title="쇼츠"><ShortsIcon className="w-3 h-3"/> {log.shorts.length}</span>}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if(confirm('이 기록을 삭제하시겠습니까?')) onDeleteLog(log.id);
                    }}
                    className="p-1.5 sm:p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-xs sm:text-sm"
                  >
                    삭제
                  </button>
                  {isEditing ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                </div>
              </div>
              
              {isEditing && (
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-in slide-in-from-top-2">
                  <LogEditorForm 
                    log={editState} 
                    system={data.system}
                    onChange={(updates) => {
                      setEditingLogs(prev => ({
                        ...prev,
                        [log.id]: {
                          ...log,
                          ...(prev[log.id] || {}),
                          ...updates
                        }
                      }));
                    }}
                  />
                  
                  <div className="mt-4 flex justify-end gap-2">
                    <button 
                      onClick={() => {
                        setExpandedLogId(null);
                        setEditingLogs(prev => {
                          const next = { ...prev };
                          delete next[log.id];
                          return next;
                        });
                      }}
                      className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      취소
                    </button>
                    <button 
                      onClick={async () => {
                        const fullLogToSave = {
                          ...log,
                          ...(editingLogs[log.id] || {}),
                        } as BroadcastLog;
                        await onUpdateLog(fullLogToSave);
                        setExpandedLogId(null);
                        setEditingLogs(prev => {
                          const next = { ...prev };
                          delete next[log.id];
                          return next;
                        });
                      }}
                      className="px-6 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                    >
                      저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
        {filteredLogs.length === 0 && (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
            해당 기간에 저장된 기록이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
