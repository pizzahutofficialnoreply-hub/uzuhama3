import { useState } from 'react';
import { 
  PlusCircle, 
  FileEdit, 
  Settings, 
  CheckCircle2 
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppData, BroadcastLog, SystemConfig } from '../../types';
import { AdminAddTab } from './admin/AdminAddTab';
import { AdminLogsTab } from './admin/AdminLogsTab';
import { AdminSystemTab } from './admin/AdminSystemTab';
import { AdminSuggestionsTab } from './admin/AdminSuggestionsTab';
import { cn } from '../../utils';

interface AdminTabProps {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog: (log: BroadcastLog) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  onDeleteAllLogs: () => Promise<void>;
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
}

type AdminViewMode = 'add' | 'edit' | 'system' | 'suggestions';

export function AdminTab({ data, onAddLog, onUpdateLog, onDeleteLog, onDeleteAllLogs, onUpdateSystemConfig }: AdminTabProps) {
  const [viewMode, setViewMode] = useState<AdminViewMode>('add');

  const adminNavTabs: { id: AdminViewMode; label: string; fullLabel: string; icon: React.ElementType }[] = [
    { id: 'add', label: '등록', fullLabel: '신규 기록 추가', icon: PlusCircle },
    { id: 'edit', label: '수정', fullLabel: '전체 기록 수정', icon: FileEdit },
    { id: 'system', label: '시스템', fullLabel: '시스템/공지사항 관리', icon: Settings },
    { id: 'suggestions', label: '승인', fullLabel: '피드백 (제안/버그)', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Desktop Tab Navigation (sm 이상에서만 표시) */}
      <div className="hidden sm:flex overflow-x-auto no-scrollbar sm:flex-wrap gap-1.5 sm:gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl w-full sm:w-fit">
        {adminNavTabs.map((tab) => {
          const isActive = viewMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`shrink-0 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
                isActive 
                  ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
            >
              {tab.fullLabel}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="pb-32 sm:pb-0">
        {viewMode === 'add' && <AdminAddTab onAddLog={onAddLog} onUpdateLog={onUpdateLog} data={data} />}
        
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

      {/* Mobile Backdrop Gradient Blur Layer (탭바 뒤쪽 하단만 부드럽게 감싸고 탭바/버튼과 겹치지 않도록 높이 및 z-index 최적화) */}
      <div 
        aria-hidden="true"
        className="sm:hidden fixed bottom-0 inset-x-0 h-16 pointer-events-none z-20 transition-opacity duration-300"
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Mobile Floating Bottom Nav: 등록, 수정, 시스템, 승인 (PWA 기준 위치 및 세로 높이 조정) */}
      <div 
        id="admin-floating-bottom-dock"
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 flex items-center justify-center pointer-events-none px-3 select-none pb-[max(0rem,calc(env(safe-area-inset-bottom)-8px))]"
      >
        <nav 
          aria-label="관리자 하단 네비게이션"
          style={{ WebkitBackdropFilter: 'blur(32px) saturate(190%)', backdropFilter: 'blur(32px) saturate(190%)' }}
          className={cn(
            "pointer-events-auto flex items-center h-[60px] p-1 rounded-full backdrop-blur-3xl backdrop-saturate-180 transition-all duration-300 gap-1",
            // Dark Mode
            "dark:bg-zinc-950/80 dark:border dark:border-white/15 dark:shadow-[0_12px_36px_rgba(0,0,0,0.7)]",
            // Light Mode
            "bg-white/80 border border-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
          )}
        >
          {adminNavTabs.map((tab) => {
            const isActive = viewMode === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center w-[76px] h-[51px] rounded-full transition-colors duration-150 touch-manipulation cursor-pointer select-none active:scale-95 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ring-0 border-0",
                  isActive
                    ? "dark:text-white text-zinc-950 font-bold"
                    : "dark:text-zinc-400 dark:hover:text-zinc-200 text-zinc-500 hover:text-zinc-900 font-medium"
                )}
                title={tab.label}
              >
                {/* Active Indicator Pill */}
                {isActive && (
                  <motion.div
                    layoutId="adminFloatingActiveTabPill"
                    style={{ WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
                    className="absolute inset-0 rounded-full bg-zinc-300/60 dark:bg-white/20 dark:border dark:border-white/10 backdrop-blur-md"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}

                <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                  <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive && "scale-105 text-purple-600 dark:text-purple-400")} />
                  <span className="text-[10px] tracking-tight mt-0.5">
                    {tab.label}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

    </div>
  );
}

