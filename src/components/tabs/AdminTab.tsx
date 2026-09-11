import { useState } from 'react';
import { AppData, BroadcastLog, SystemConfig } from '../../types';
import { AdminAddTab } from './admin/AdminAddTab';
import { AdminLogsTab } from './admin/AdminLogsTab';
import { AdminSystemTab } from './admin/AdminSystemTab';
import { AdminSuggestionsTab } from './admin/AdminSuggestionsTab';

interface AdminTabProps {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog: (log: BroadcastLog) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  onDeleteAllLogs: () => Promise<void>;
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
}

export function AdminTab({ data, onAddLog, onUpdateLog, onDeleteLog, onDeleteAllLogs, onUpdateSystemConfig }: AdminTabProps) {
  const [viewMode, setViewMode] = useState<'add' | 'edit' | 'system' | 'suggestions'>('add');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Tab Navigation */}
      <div className="flex overflow-x-auto no-scrollbar sm:flex-wrap gap-1.5 sm:gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => setViewMode('add')}
          className={`shrink-0 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${viewMode === 'add' ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
        >
          신규 기록 추가
        </button>
        <button
          onClick={() => setViewMode('edit')}
          className={`shrink-0 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${viewMode === 'edit' ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
        >
          전체 기록 수정
        </button>
        <button
          onClick={() => setViewMode('system')}
          className={`shrink-0 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${viewMode === 'system' ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
        >
          시스템/공지사항 관리
        </button>
        <button
          onClick={() => setViewMode('suggestions')}
          className={`shrink-0 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5 ${viewMode === 'suggestions' ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
        >
          피드백 (제안/버그)
        </button>
      </div>

      {viewMode === 'add' && <AdminAddTab onAddLog={onAddLog} data={data} />}
      
      {viewMode === 'edit' && (
        <AdminLogsTab 
          data={data} 
          onAddLog={onAddLog}
          onUpdateLog={onUpdateLog} 
          onDeleteLog={onDeleteLog} 
          onDeleteAllLogs={onDeleteAllLogs} 
        />
      )}

      {viewMode === 'system' && (
        <AdminSystemTab 
          data={data} 
          onUpdateSystemConfig={onUpdateSystemConfig} 
        />
      )}

      {viewMode === 'suggestions' && (
        <AdminSuggestionsTab 
          data={data}
          onAddLog={onAddLog}
          onUpdateLog={onUpdateLog}
        />
      )}

    </div>
  );
}
