import React, { useState } from 'react';
import { SystemConfig } from '../../../../types';
import { Database, MessageSquare, Plus, Edit2, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { migrateLogsToMonthly, MigrationProgress } from '../../../../utils/migrateLogs';

interface DataOptionsSubTabProps {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const DataOptionsSubTab: React.FC<DataOptionsSubTabProps> = ({
  systemEdit,
  handleChange,
  onSave,
  saving = false
}) => {
  const [newFeedbackTab, setNewFeedbackTab] = useState('');
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  const handleStartMigration = async () => {
    if (!window.confirm('기존 logs 컬렉션의 모든 데이터를 읽어 월별 묶음 문서(logs_by_month)로 이관하시겠습니까?\n\n이관 후에도 기존 logs 데이터는 보존되며 새 컬렉션에 동기화됩니다.')) {
      return;
    }
    setIsMigrating(true);
    try {
      await migrateLogsToMonthly((prog) => {
        setMigrationProgress(prog);
      });
    } catch (e: any) {
      console.error(e);
      alert('마이그레이션 실패: ' + e?.message);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 버전 및 표시 설정 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white">버전 및 데이터 표시 설정</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">앱 버전 (appVersion)</label>
            <input 
              type="text"
              value={systemEdit.appVersion || 'v1.0.0'}
              onChange={e => handleChange('appVersion', e.target.value)}
              placeholder="예: v1.0.0, v0.0.0+00"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 dark:text-white"
            />
            <p className="text-[11px] text-zinc-400 mt-1">버전 뒤에 빌드 번호(예: +00, +01, -beta)를 붙여 v0.0.0+00 형식으로 자유롭게 표기 가능합니다.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">약관 동의 버전 (termsVersion)</label>
            <input 
              type="number"
              value={systemEdit.termsVersion || 1}
              onChange={e => handleChange('termsVersion', Number(e.target.value))}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
            <p className="text-[11px] text-zinc-400 mt-1">숫자를 올리면 사용자들에게 재동의 팝업이 노출됩니다.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            우주하마 생방송 아카이브 링크 (URL)
          </label>
          <input 
            type="url"
            placeholder="https://..."
            value={systemEdit.archiveSourceUrl || ''}
            onChange={e => handleChange('archiveSourceUrl', e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
          />
        </div>
      </div>

      {/* 2. 의견 보내기 위치(탭) 목록 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>의견 제보 대상 탭/위치 목록</span>
            </h3>
            <p className="text-xs text-zinc-500">사용자가 피드백을 보낼 때 선택할 수 있는 위치 목록입니다.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              handleChange('feedbackTabs', [
                "요약 탭",
                "기록 탭",
                "분석 탭",
                "검색 탭",
                "데이터 제보 (+)",
                "설정",
                "패치노트",
                "기타"
              ]);
            }}
            className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline cursor-pointer"
          >
            기본값 복원
          </button>
        </div>

        <div className="flex gap-2">
          <input 
            type="text"
            value={newFeedbackTab}
            onChange={e => setNewFeedbackTab(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = newFeedbackTab.trim();
                if (val && !systemEdit.feedbackTabs?.includes(val)) {
                  handleChange('feedbackTabs', [...(systemEdit.feedbackTabs || []), val]);
                  setNewFeedbackTab('');
                }
              }
            }}
            placeholder="새 위치/탭 이름 입력..."
            className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
          />
          <button
            type="button"
            onClick={() => {
              const val = newFeedbackTab.trim();
              if (val && !systemEdit.feedbackTabs?.includes(val)) {
                handleChange('feedbackTabs', [...(systemEdit.feedbackTabs || []), val]);
                setNewFeedbackTab('');
              }
            }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            추가
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {(systemEdit.feedbackTabs || []).map((tabName, idx) => (
            <div 
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold border border-zinc-200 dark:border-zinc-700"
            >
              <span>{tabName}</span>
              <button
                type="button"
                onClick={() => {
                  const current = systemEdit.feedbackTabs || [];
                  handleChange('feedbackTabs', current.filter((_, i) => i !== idx));
                }}
                className="text-zinc-400 hover:text-red-500 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 월별 데이터베이스 이관 (마이그레이션) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>월별 데이터베이스 이관 (logs → logs_by_month)</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              기존 단일 일지 문서들을 월별 묶음 문서로 일괄 변환하여 트래픽 및 읽기 비용을 절감합니다.
            </p>
          </div>
          <button
            onClick={handleStartMigration}
            disabled={isMigrating}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
          >
            {isMigrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            <span>{isMigrating ? '이관 진행 중...' : '월별 데이터 이관 시작'}</span>
          </button>
        </div>

        {migrationProgress && (
          <div className={`p-3 rounded-xl border text-xs ${
            migrationProgress.status === 'success' 
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' 
              : migrationProgress.status === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
          }`}>
            <div className="flex items-center gap-1.5 font-bold mb-1">
              {migrationProgress.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />}
              {migrationProgress.status === 'success' && <Check className="w-3.5 h-3.5 text-green-600" />}
              {migrationProgress.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
              <span>상태: {migrationProgress.status === 'running' ? '진행 중' : migrationProgress.status === 'success' ? '완료' : '오류'}</span>
            </div>
            <p>{migrationProgress.message}</p>
          </div>
        )}
      </div>

      {onSave && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? '저장 중...' : '데이터 설정 저장하기'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
