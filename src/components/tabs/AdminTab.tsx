import { useState } from 'react';
import { 
  PlusCircle, 
  FileEdit, 
  Settings, 
  MessageSquare,
  FileCode2,
  Link2,
  History
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppData, BroadcastLog, SystemConfig } from '../../types';
import { AdminAddTab } from './admin/AdminAddTab';
import { AdminLogsTab } from './admin/AdminLogsTab';
import { AdminSystemTab } from './admin/AdminSystemTab';
import { AdminSuggestionsTab } from './admin/AdminSuggestionsTab';
import { AdminPatchesTab } from './admin/AdminPatchesTab';
import { AdminUnlinkedTab } from './admin/AdminUnlinkedTab';
import { AdminAuditTab } from './admin/AdminAuditTab';
import { AdminHealthBanner } from './admin/AdminHealthBanner';
import { cn } from '../../utils';

interface AdminTabProps {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog: (log: BroadcastLog) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  onDeleteAllLogs: () => Promise<void>;
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
}

type AdminViewMode = 'add' | 'edit' | 'link' | 'system' | 'suggestions' | 'patches' | 'audit';

export function AdminTab({ data, onAddLog, onUpdateLog, onDeleteLog, onDeleteAllLogs, onUpdateSystemConfig }: AdminTabProps) {
  const [viewMode, setViewMode] = useState<AdminViewMode>('add');

  const adminNavTabs: { id: AdminViewMode; label: string; fullLabel: string; icon: React.ElementType }[] = [
    { id: 'add', label: '등록', fullLabel: '신규 기록 추가', icon: PlusCircle },
    { id: 'edit', label: '수정', fullLabel: '전체 기록 수정', icon: FileEdit },
    { id: 'link', label: '연동', fullLabel: '영상·쇼츠 연동', icon: Link2 },
    { id: 'system', label: '시스템', fullLabel: '시스템/공지사항 관리', icon: Settings },
    { id: 'suggestions', label: '피드백', fullLabel: '피드백 (제안/버그)', icon: MessageSquare },
    { id: 'patches', label: '패치', fullLabel: '패치노트 등록/관리', icon: FileCode2 },
    { id: 'audit', label: '이력', fullLabel: '수정 이력·되돌리기', icon: History },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <AdminHealthBanner onGo={(m) => setViewMode(m as AdminViewMode)} />
      
      {/* 상단: 지금 보는 곳 + (데스크톱) 탭 */}
      <header className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wide text-purple-600 dark:text-purple-400">관리자</p>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight truncate">{adminNavTabs.find((t) => t.id === viewMode)?.fullLabel}</h2>
          </div>
        </div>
        <nav aria-label="관리자 메뉴" className="hidden sm:flex flex-wrap gap-1 p-1 bg-zinc-100/80 dark:bg-zinc-800/60 rounded-2xl w-fit">
          {adminNavTabs.map((tab) => {
            const isActive = viewMode === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl transition-colors cursor-pointer',
                  isActive ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive && 'text-purple-600 dark:text-purple-400')} />
                {tab.fullLabel}
              </button>
            );
          })}
        </nav>
      </header>

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

        {viewMode === 'link' && <AdminUnlinkedTab data={data} onUpdateLog={onUpdateLog} />}

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

        {viewMode === 'patches' && (
          <AdminPatchesTab />
        )}
        {viewMode === 'audit' && (
          <AdminAuditTab onAddLog={onAddLog} onUpdateLog={onUpdateLog} onDeleteLog={onDeleteLog} onUpdateSystemConfig={onUpdateSystemConfig} />
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

      {/* 모바일 하단 탭바: 네이버 카페 앱처럼 화면 폭 안에 7개가 다 들어가는 캡슐 + 짧은 회색 캡슐 */}
      <div
        id="admin-floating-bottom-dock"
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 flex justify-center pointer-events-none px-3 select-none pb-[max(10px,calc(env(safe-area-inset-bottom)-12px))]"
      >
        <nav
          aria-label="관리자 하단 네비게이션"
          style={{ WebkitBackdropFilter: 'blur(28px) saturate(180%)', backdropFilter: 'blur(28px) saturate(180%)' }}
          className="pointer-events-auto w-full max-w-[440px] flex items-center h-[58px] px-1 rounded-full bg-white/85 dark:bg-zinc-900/85 border border-black/[0.06] dark:border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)]"
        >
          {adminNavTabs.map((tab) => {
            const isActive = viewMode === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex-1 min-w-0 h-[50px] flex flex-col items-center justify-center touch-manipulation cursor-pointer select-none active:scale-95 outline-none',
                  isActive ? 'text-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'
                )}
                title={tab.fullLabel}
              >
                {isActive && (
                  <motion.span
                    layoutId="adminFloatingActiveTabPill"
                    className="absolute inset-y-0 inset-x-0.5 rounded-full bg-zinc-200/80 dark:bg-white/15"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <Icon className={cn('relative w-[19px] h-[19px]', isActive ? 'stroke-[2.4]' : 'stroke-[2]')} />
                <span className={cn('relative text-[10px] leading-none mt-1 truncate max-w-full', isActive ? 'font-bold' : 'font-medium')}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

    </div>
  );
}

