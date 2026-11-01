import React, { useState } from 'react';
import { SystemConfig, NoticeLink } from '../../../../types';
import { 
  AlertTriangle, Clock, Calendar, Check, Plus, Trash2, Link as LinkIcon, 
  Sparkles, RefreshCw, CheckCircle2, ChevronRight, FileText, Play, History,
  Settings2, Eye, ShieldAlert, Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { 
  formatMaintenanceRange, 
  generateMaintenanceNoticeMarkdown, 
  generateCompletedNoticeMarkdown,
  calculateNextRecurringMaintenance,
  formatKSTDateTime,
  getKSTDate,
  getKSTNextDayMidnight
} from '../../../../utils/maintenanceUtils';

interface MaintenanceSubTabProps {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const MaintenanceSubTab: React.FC<MaintenanceSubTabProps> = ({
  systemEdit,
  handleChange,
  onSave,
  saving = false
}) => {
  const [newChangeItem, setNewChangeItem] = useState('');
  const [newHistoryTime, setNewHistoryTime] = useState('');
  const [newHistoryEvent, setNewHistoryEvent] = useState('');
  const [activePreviewMode, setActivePreviewMode] = useState<'editor' | 'preview'>('preview');

  const startStr = systemEdit.maintenanceStart || '';
  const endStr = systemEdit.maintenanceEnd || '';
  const changes = systemEdit.maintenanceChanges || [
    '데이터베이스 점검 및 최적화',
    '서버 연동 점검',
    '서비스 코드 수정 및 테스트'
  ];
  const history = systemEdit.maintenanceHistory || [];
  const recurring = systemEdit.recurringMaintenance || {
    enabled: false,
    intervalWeeks: 1,
    dayOfWeek: 6, // 토요일 기본값
    startTime: '10:00',
    endTime: '16:00',
    autoApply: false
  };

  // 점검 공지 상세 사전 설정 항목들
  const scope = systemEdit.maintenanceScope || '사이트 전체';
  const impact = systemEdit.maintenanceImpact || '점검 시간 동안 **서비스에 접속 불가해요.**';
  const noticeGuide = systemEdit.maintenanceNoticeGuide || '점검 완료 및 변경사항 발생 시 본 공지에 업데이트하겠어요.';
  const durationNote = systemEdit.maintenanceDurationNote || '(상황에 따라 변동/연장될 수 있어요)';
  const statusText = systemEdit.maintenanceStatusText || (systemEdit.maintenance ? '점검 진행 중' : '점검 예정');
  const noteText = systemEdit.maintenanceNote || '없음';

  const { fullText: rangeText, durationText } = formatMaintenanceRange(startStr, endStr);

  // 1. 점검 공지 표준 템플릿 본문 자동 작성 (상세 사전 설정 항목 모두 반영)
  const handleApplyTemplate = (customOverrides?: Partial<{
    startStr: string;
    endStr: string;
    scope: string;
    impact: string;
    noticeGuide: string;
    durationNote: string;
    status: string;
    note: string;
    history: Array<{ time: string; event: string }>;
  }>) => {
    const effectiveStart = customOverrides?.startStr || startStr;
    const effectiveEnd = customOverrides?.endStr || endStr;

    if (!effectiveStart || !effectiveEnd) {
      alert('점검 시작 일시와 종료 예정 일시를 먼저 설정해주세요.');
      return;
    }

    const template = generateMaintenanceNoticeMarkdown({
      startStr: effectiveStart,
      endStr: effectiveEnd,
      scope: customOverrides?.scope ?? scope,
      impact: customOverrides?.impact ?? impact,
      noticeGuide: customOverrides?.noticeGuide ?? noticeGuide,
      durationNote: customOverrides?.durationNote ?? durationNote,
      status: customOverrides?.status ?? statusText,
      note: customOverrides?.note ?? noteText,
      history: customOverrides?.history ?? history
    });

    handleChange('maintenanceContent', template);
    if (!systemEdit.maintenanceTitle) {
      handleChange('maintenanceTitle', '서비스 안정화를 위한 정기 점검 안내');
    }
  };

  // 2. 점검 시작 이력 자동 기록
  const handleRecordEvent = (eventName: string) => {
    const nowKst = formatKSTDateTime(new Date(), false);
    const updated = [...history, { time: nowKst, event: eventName }];
    handleChange('maintenanceHistory', updated);

    // 본문에도 변경 이력 반영
    if (systemEdit.maintenanceContent) {
      const template = generateMaintenanceNoticeMarkdown({
        startStr: startStr || new Date().toISOString(),
        endStr: endStr || new Date().toISOString(),
        scope,
        impact,
        noticeGuide,
        durationNote,
        status: eventName === '점검 완료' ? '점검 완료' : (eventName === '점검 연장' ? '점검 연장' : '점검 진행 중'),
        note: noteText,
        history: updated
      });
      handleChange('maintenanceContent', template);
    }
  };

  // 3. 1시간 연장 핸들러
  const handleExtendOneHour = () => {
    if (!endStr) return;
    const currentEnd = new Date(endStr);
    const extended = new Date(currentEnd.getTime() + (60 * 60 * 1000));
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localIso = `${extended.getFullYear()}-${pad(extended.getMonth() + 1)}-${pad(extended.getDate())}T${pad(extended.getHours())}:${pad(extended.getMinutes())}`;
    handleChange('maintenanceEnd', localIso);
    handleChange('maintenanceStatusText', '점검 연장');
    handleRecordEvent('점검 연장 (1시간 추가)');
  };

  // 4. 점검 완료 처리
  const handleCompleteMaintenance = () => {
    handleChange('maintenanceStatusText', '점검 완료');
    handleRecordEvent('점검 종료');
    handleChange('maintenance', false);
  };

  // 5. 정기 점검 다음 일정 자동 산출 및 적용
  const handleApplyNextRecurring = () => {
    const next = calculateNextRecurringMaintenance({
      intervalWeeks: recurring.intervalWeeks || 1,
      dayOfWeek: recurring.dayOfWeek ?? 6,
      startTime: recurring.startTime || '10:00',
      endTime: recurring.endTime || '16:00'
    });
    handleChange('maintenanceStart', next.nextStart);
    handleChange('maintenanceEnd', next.nextEnd);
    handleChange('maintenanceStatusText', '점검 예정');
    handleChange('maintenance', true);

    // 기본 템플릿도 사전 설정 항목 기반으로 함께 자동 생성
    const defaultHistory = [
      { time: formatKSTDateTime(next.nextStart, false), event: '점검 시작 예정' },
      { time: formatKSTDateTime(next.nextEnd, false), event: '점검 종료 예정' }
    ];
    handleChange('maintenanceHistory', defaultHistory);

    const template = generateMaintenanceNoticeMarkdown({
      startStr: next.nextStart,
      endStr: next.nextEnd,
      scope,
      impact,
      noticeGuide,
      durationNote,
      status: '점검 예정',
      note: '없음',
      history: defaultHistory
    });
    handleChange('maintenanceContent', template);
    handleChange('maintenanceTitle', '서비스 안정화를 위한 정기 점검 안내');

    alert(`다음 정기 점검 일정이 예약되었어요:\n${next.nextStart.replace('T', ' ')} ~ ${next.nextEnd.replace('T', ' ')}`);
  };

  // 변경 사항 항목 추가/삭제
  const handleAddChange = () => {
    if (!newChangeItem.trim()) return;
    handleChange('maintenanceChanges', [...changes, newChangeItem.trim()]);
    setNewChangeItem('');
  };

  const handleRemoveChange = (idx: number) => {
    handleChange('maintenanceChanges', changes.filter((_, i) => i !== idx));
  };

  const dayOptions = [
    { val: 1, label: '월요일' },
    { val: 2, label: '화요일' },
    { val: 3, label: '수요일' },
    { val: 4, label: '목요일' },
    { val: 5, label: '금요일' },
    { val: 6, label: '토요일' },
    { val: 0, label: '일요일' },
  ];

  const nowMs = Date.now();
  const isStartPassed = startStr && new Date(startStr).getTime() <= nowMs;
  const isEndPassed = endStr && new Date(endStr).getTime() <= nowMs;
  const isCurrentlyScheduled = startStr && new Date(startStr).getTime() > nowMs;

  return (
    <div className="space-y-6">
      {/* 1. 점검 마스터 토글 및 실시간 상태 카드 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">점검 모드 마스터 설정</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              점검이 활성화되면 일반 사용자의 사이트 접근이 차단되고 점검 안내 화면이 표시돼요.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={systemEdit.maintenance || false}
              onChange={e => handleChange('maintenance', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-13 h-7 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[3px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-zinc-600 peer-checked:bg-purple-600"></div>
            <span className="ml-3 text-sm font-bold text-zinc-800 dark:text-zinc-200">
              {systemEdit.maintenance ? '점검 ON' : '점검 OFF'}
            </span>
          </label>
        </div>

        {/* 현재 상태 배너 */}
        <div className="mt-4">
          {systemEdit.maintenance ? (
            isCurrentlyScheduled ? (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3.5 flex items-center gap-3 text-amber-800 dark:text-amber-300 text-xs">
                <Clock className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <strong>점검 예약 대기 중:</strong> 시작 시간({startStr.replace('T', ' ')})이 되면 자동으로 일반 사용자 접근이 제한돼요.
                  <div className="mt-0.5 text-amber-700 dark:text-amber-400/90">
                    당일 0시 (KST)부터 일반 사용자 화면 상단에 점검 사전 안내 배너가 자동 노출돼요.
                  </div>
                </div>
              </div>
            ) : isEndPassed ? (
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-center justify-between gap-3 text-blue-800 dark:text-blue-300 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <strong>점검 종료 시간이 경과되었어요.</strong> 점검을 정식 완료 처리하시겠어요?
                    <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                      완료 시 익일 0시(KST)까지 점검 완료 요약 공지가 사이트에 자동 표시돼요.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCompleteMaintenance}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                >
                  점검 완료 처리
                </button>
              </div>
            ) : (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3.5 flex items-center justify-between gap-3 text-red-800 dark:text-red-300 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                  <span><strong>실시간 점검 진행 중:</strong> 사이트 접근이 차단된 상태예요.</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleExtendOneHour}
                    className="px-2.5 py-1 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-700 dark:text-red-300 font-bold text-xs cursor-pointer"
                  >
                    +1시간 연장
                  </button>
                  <button
                    type="button"
                    onClick={handleCompleteMaintenance}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
                  >
                    점검 종료
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              <span>현재 서비스가 정상 운영 중이에요.</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. 정기 점검 (알람처럼 예약 설정: 매주 / 격주 / N주마다 요일 & 시간) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">정기 점검 스케줄러 (알람 예약)</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                매주 또는 격주 등 지정한 요일과 시간에 맞춰 정기점검을 반복 예약해요.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={recurring.enabled}
              onChange={e => handleChange('recurringMaintenance', { ...recurring, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-purple-600"></div>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">반복 주기</label>
            <select
              value={recurring.intervalWeeks || 1}
              onChange={e => handleChange('recurringMaintenance', { ...recurring, intervalWeeks: Number(e.target.value) })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            >
              <option value={1}>매주 (1주마다)</option>
              <option value={2}>격주 (2주마다)</option>
              <option value={3}>3주마다</option>
              <option value={4}>4주마다 (한 달)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">점검 요일</label>
            <select
              value={recurring.dayOfWeek ?? 6}
              onChange={e => handleChange('recurringMaintenance', { ...recurring, dayOfWeek: Number(e.target.value) })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            >
              {dayOptions.map(d => (
                <option key={d.val} value={d.val}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">시작 시간 (KST)</label>
            <input
              type="time"
              value={recurring.startTime || '10:00'}
              onChange={e => handleChange('recurringMaintenance', { ...recurring, startTime: e.target.value })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">종료 예정 (KST)</label>
            <input
              type="time"
              value={recurring.endTime || '16:00'}
              onChange={e => handleChange('recurringMaintenance', { ...recurring, endTime: e.target.value })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            💡 위 스케줄러 버튼을 누르면 다음 해당 요일의 날짜를 자동 계산하여 아래 일시에 예약 세팅해요.
          </div>
          <button
            type="button"
            onClick={handleApplyNextRecurring}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm cursor-pointer active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>다음 정기점검 일정으로 즉시 예약 반영</span>
          </button>
        </div>
      </div>

      {/* 3. [핵심] 점검 중 공지 상세 항목 사전 설정 (미리 설정) */}
      <div className="bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-100 dark:border-purple-950">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-600 text-white">
              <Settings2 className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">점검 중 공지 상세 항목 사전 설정</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                  사전 설정 지원
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                점검 일정, 서비스 영향도, 점검 안내, 진행 상태, 특이 사항 등 상세 항목을 사전에 미리 구성해둘 수 있어요.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleApplyTemplate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold cursor-pointer active:scale-95 transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>사전 설정 기반 본문 동기화</span>
          </button>
        </div>

        {/* 1) 점검 일시 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              점검 시작 일시 (KST)
            </label>
            <input 
              type="datetime-local" 
              value={startStr}
              onChange={e => handleChange('maintenanceStart', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              당일 0시 (KST)부터 일반 사용자 화면 상단에 점검 사전 안내가 자동 표시돼요.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              점검 종료 예정 일시 (KST)
            </label>
            <input 
              type="datetime-local" 
              value={endStr}
              onChange={e => handleChange('maintenanceEnd', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              점검 완료 후 완료 익일 0시 (KST)까지 점검 완료 공지가 유지된 뒤 자동 삭제돼요.
            </p>
          </div>
        </div>

        {/* 2) 소요 시간 보충 설명 & 서비스 영향도 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              소요 시간 보충 설명 (미리 설정)
            </label>
            <input 
              type="text"
              value={durationNote}
              onChange={e => handleChange('maintenanceDurationNote', e.target.value)}
              placeholder="예: (상황에 따라 변동/연장될 수 있어요)"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              계산된 시간({durationText || '예: 약 6시간'}) 뒤에 붙을 안내 문구예요.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              영향 범위 (미리 설정)
            </label>
            <input 
              type="text"
              value={scope}
              onChange={e => handleChange('maintenanceScope', e.target.value)}
              placeholder="예: 사이트 전체, 데이터베이스 및 관리자 모드 등"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>
        </div>

        {/* 3) 서비스 영향도 메인 문구 & 점검 안내 문구 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              서비스 영향도 안내 문구 (서식: **볼드**)
            </label>
            <input 
              type="text"
              value={impact}
              onChange={e => handleChange('maintenanceImpact', e.target.value)}
              placeholder="예: 점검 시간 동안 **서비스에 접속 불가해요.**"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              점검 안내 상세 문구 (미리 설정)
            </label>
            <input 
              type="text"
              value={noticeGuide}
              onChange={e => handleChange('maintenanceNoticeGuide', e.target.value)}
              placeholder="예: 점검 완료 및 변경사항 발생 시 본 공지에 업데이트하겠어요."
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>
        </div>

        {/* 4) 진행 상태 & 특이 사항 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              진행 상태 문구 (미리 설정)
            </label>
            <select
              value={statusText}
              onChange={e => handleChange('maintenanceStatusText', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            >
              <option value="점검 예정">점검 예정</option>
              <option value="점검 진행 중">점검 진행 중</option>
              <option value="점검 연장">점검 연장</option>
              <option value="점검 완료">점검 완료</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              특이 사항 (미리 설정)
            </label>
            <input 
              type="text"
              value={noteText}
              onChange={e => handleChange('maintenanceNote', e.target.value)}
              placeholder="예: 없음 또는 서버 패치 작업으로 인한 연장 등"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            />
          </div>
        </div>

        {/* 5) 사전 변경 이력(History) 타임라인 사전 등록 */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                변경 이력(History) 타임라인 사전 등록
              </label>
              <p className="text-[11px] text-zinc-500">
                점검 시작/연장/종료 시점의 예상 또는 실제 이력을 등록해요.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {history.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl text-xs">
                <span className="font-mono text-zinc-500">{item.time}</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">— {item.event}</span>
                <button
                  type="button"
                  onClick={() => handleChange('maintenanceHistory', history.filter((_, i) => i !== idx))}
                  className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="시간 (예: 2026. 9. 12 10:00)"
              value={newHistoryTime}
              onChange={e => setNewHistoryTime(e.target.value)}
              className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
            <input
              type="text"
              placeholder="내용 (예: 점검 시작, 점검 연장, 점검 종료)"
              value={newHistoryEvent}
              onChange={e => setNewHistoryEvent(e.target.value)}
              className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (!newHistoryTime || !newHistoryEvent) return;
                handleChange('maintenanceHistory', [...history, { time: newHistoryTime, event: newHistoryEvent }]);
                setNewHistoryTime('');
                setNewHistoryEvent('');
              }}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              이력 추가
            </button>
          </div>
        </div>
      </div>

      {/* 4. 점검 공지 제목 및 본문 (마크다운 편집 / 실시간 렌더링 미리보기 탭) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">점검 화면 표시 공지 본문</h3>
          </div>

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setActivePreviewMode('editor')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activePreviewMode === 'editor'
                  ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Edit3 className="w-3 h-3" /> 마크다운 편집
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewMode('preview')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activePreviewMode === 'preview'
                  ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> 실제 화면 미리보기
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            점검 공지 제목
          </label>
          <input 
            type="text" 
            value={systemEdit.maintenanceTitle || ''}
            onChange={e => handleChange('maintenanceTitle', e.target.value)}
            placeholder="예: 서비스 안정화를 위한 정기 점검 안내"
            className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white font-medium"
          />
        </div>

        {activePreviewMode === 'editor' ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                점검 공지 본문 (마크다운)
              </label>
              <button
                type="button"
                onClick={() => handleApplyTemplate()}
                className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>사전 설정 기반 템플릿 재생성</span>
              </button>
            </div>
            <textarea 
              rows={14}
              value={systemEdit.maintenanceContent || ''}
              onChange={e => handleChange('maintenanceContent', e.target.value)}
              placeholder="상단의 '사전 설정 기반 본문 동기화'를 누르면 마크다운이 자동 생성돼요."
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-xs text-zinc-900 dark:text-white font-mono leading-relaxed"
            />
          </div>
        ) : (
          <div className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-xs space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> 점검 진행 중 사용자 화면 실시간 렌더링 미리보기
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="text-base font-extrabold text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2">
                {systemEdit.maintenanceTitle || '서비스 안정화를 위한 정기 점검 안내'}
              </h2>

              <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs">
                <ReactMarkdown
                  components={{
                    h2: ({node, ...props}) => <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-xs font-bold text-purple-600 dark:text-purple-400 mt-2.5 mb-1" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 text-zinc-600 dark:text-zinc-300" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 mb-2 text-zinc-600 dark:text-zinc-300" {...props} />,
                    li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-zinc-900 dark:text-white" {...props} />,
                    hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />
                  }}
                >
                  {systemEdit.maintenanceContent || generateMaintenanceNoticeMarkdown({
                    startStr: startStr || '2026-09-12T10:00',
                    endStr: endStr || '2026-09-12T16:00',
                    scope,
                    impact,
                    noticeGuide,
                    durationNote,
                    status: statusText,
                    note: noteText,
                    history
                  })}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. 점검 완료 요약 공지 (완료 후 익일 0시까지 자동 표시) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">점검 완료 요약 공지 (사전 관리)</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              점검 종료 시점부터 완료 익일 0시 (KST)까지 사이트 상단에 자동 노출되며, 익일 0시 경과 시 자동으로 종료/삭제돼요.
            </p>
          </div>
        </div>

        {/* 변경 사항 항목 목록 */}
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
            점검 완료 변경 사항 항목 (미리 등록)
          </label>
          <div className="space-y-2 mb-3">
            {changes.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl text-xs">
                <span className="text-zinc-700 dark:text-zinc-200 font-medium">• {item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveChange(idx)}
                  className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="새 변경 사항 입력 (예: 데이터베이스 점검 및 최적화)"
              value={newChangeItem}
              onChange={e => setNewChangeItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddChange())}
              className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleAddChange}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              추가
            </button>
          </div>
        </div>

        {/* 완료 요약 미리보기 */}
        <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4 text-xs space-y-2 font-mono">
          <div className="font-bold text-zinc-800 dark:text-zinc-200">점검 완료 요약 공지 미리보기:</div>
          <pre className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-300 text-xs">
            {generateCompletedNoticeMarkdown({
              startStr: startStr || '2026-09-12T10:00',
              endStr: endStr || '2026-09-12T16:00',
              changes
            })}
          </pre>
        </div>
      </div>

      {/* 6. 점검 공지 관련 링크 버튼 목록 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">점검 화면 외부 링크 버튼</h3>
            <p className="text-xs text-zinc-500">치지직 채널, 디스코드, 공지 트위터 등 바로가기 링크를 추가할 수 있어요.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const current = systemEdit.maintenanceLinks || [];
              handleChange('maintenanceLinks', [...current, { url: '', title: '' }]);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 hover:bg-purple-100 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>링크 추가</span>
          </button>
        </div>

        {(!systemEdit.maintenanceLinks || systemEdit.maintenanceLinks.length === 0) ? (
          <p className="text-xs text-zinc-400 italic">추가된 링크가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {systemEdit.maintenanceLinks.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="버튼명 (예: 치지직 채널)"
                  value={link.title || ''}
                  onChange={e => {
                    const list = [...(systemEdit.maintenanceLinks || [])];
                    list[idx] = { ...list[idx], title: e.target.value };
                    handleChange('maintenanceLinks', list);
                  }}
                  className="w-1/3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
                />
                <input
                  type="url"
                  placeholder="URL (https://...)"
                  value={link.url}
                  onChange={e => {
                    const list = [...(systemEdit.maintenanceLinks || [])];
                    list[idx] = { ...list[idx], url: e.target.value };
                    handleChange('maintenanceLinks', list);
                  }}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const list = (systemEdit.maintenanceLinks || []).filter((_, i) => i !== idx);
                    handleChange('maintenanceLinks', list);
                  }}
                  className="p-2 text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 저장 버튼 */}
      {onSave && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? '저장 중...' : '점검 설정 저장하기'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
