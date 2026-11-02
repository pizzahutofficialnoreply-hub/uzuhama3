import React from 'react';
import { SystemConfig, DateOverride } from '../../../../types';
import { Plane, Stethoscope, Info, CalendarClock, Trash2, Plus } from 'lucide-react';

interface AbsenceHealthSubTabProps {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const AbsenceHealthSubTab: React.FC<AbsenceHealthSubTabProps> = ({
  systemEdit,
  handleChange,
  onSave,
  saving = false
}) => {
  // 마크다운 서식 미리보기 헬퍼
  const renderFormattedPreview = (text: string) => {
    if (!text) return null;
    const cleanText = text
      .replace(/<\/?(u|b|strong|em|p|span|div|br)[^>]*>/gi, '')
      .trim();

    const parts = cleanText.split(/(\*\*.*?\*\*)/g);
    return parts.map((p, idx) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return (
          <strong key={idx} className="font-bold text-zinc-900 dark:text-zinc-100 bg-amber-100/60 dark:bg-amber-900/30 px-1 py-0.5 rounded mx-0.5">
            {p.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{p}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-6">
      <DateOverridesCard list={(systemEdit.dateOverrides || []) as DateOverride[]} onChange={(next) => handleChange('dateOverrides', next)} onSave={onSave} saving={saving} />

      {/* 1. 장기 휴방 및 병명 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <Plane className="w-4 h-4 text-purple-600" />
          <h3 className="font-bold text-sm text-zinc-900 dark:text-white">장기 휴방 및 병명 상태 설정</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              장기 휴방 상태 토글
            </label>
            <select
              value={systemEdit.isLongAbsence ? 'true' : 'false'}
              onChange={e => handleChange('isLongAbsence', e.target.value === 'true')}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            >
              <option value="false">일반 방송 상태</option>
              <option value="true">장기 휴방 모드 활성화</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              휴방 사유 카테고리
            </label>
            <select
              value={systemEdit.absenceReason || ''}
              onChange={e => {
                const next = e.target.value;
                handleChange('absenceReason', next);
                if (next !== '병명') {
                  // 병명이 아닌 사유(예: 직접 입력 등)로 변경 시 기존에 존재하던 병명 데이터 완전 삭제
                  handleChange('illnessName', '');
                  handleChange('illnessSummary', '');
                  handleChange('illnessSource', '');
                  handleChange('illnessSourceUrl', '');
                  handleChange('diseaseName', '');
                  handleChange('diseaseSummary', '');
                  handleChange('diseaseSource', '');
                  handleChange('diseaseSourceUrl', '');
                }
                if (next !== '직접 입력' && next !== '기타 (직접 입력)') {
                  handleChange('customAbsenceReason', '');
                }
              }}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
            >
              <option value="">설정 안함</option>
              <option value="병명">병명 (공식 의학 정보 제공)</option>
              <option value="직접 입력">직접 입력</option>
              <option value="건강 문제">건강 문제 (휴방 확률 증가)</option>
              <option value="컨디션 난조">컨디션 난조 (휴방 확률 증가)</option>
              <option value="휴식">휴식</option>
              <option value="개인 일정">개인 일정</option>
              <option value="여행">여행 (휴방 확률 증가)</option>
              <option value="장비 문제">장비 문제</option>
              <option value="기타 (직접 입력)">기타 (직접 입력)</option>
            </select>
          </div>
        </div>

        {/* 직접 입력 선택 시 */}
        {(systemEdit.absenceReason === '직접 입력' || systemEdit.absenceReason === '기타 (직접 입력)') && (
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              직접 입력할 휴방 사유
            </label>
            <input
              type="text"
              value={systemEdit.customAbsenceReason || ''}
              onChange={e => handleChange('customAbsenceReason', e.target.value)}
              placeholder="예: 이사 일정, 병원 방문, 학업 일정 등"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
          </div>
        )}

        {/* 병명 선택 시: 병명 및 의학 정보 설정 */}
        {systemEdit.absenceReason === '병명' && (
          <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-purple-600" />
                <span>병명 및 의학 정보 요약 설정</span>
              </label>
            </div>

            {/* 병명 입력 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                병명 입력 (질환명)
              </label>
              <input
                type="text"
                value={systemEdit.illnessName || ''}
                onChange={e => handleChange('illnessName', e.target.value)}
                placeholder="예: 독감, 감기, 장염, 성대결절, 코로나19 등"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
              />
            </div>

            {/* 병명 설명 요약 에디터 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                병명 설명 요약 (서식: **볼드**)
              </label>
              <textarea
                rows={3}
                value={systemEdit.illnessSummary || ''}
                onChange={e => handleChange('illnessSummary', e.target.value)}
                placeholder="병명에 대한 핵심 요약 설명을 입력해주세요..."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2.5 text-xs text-zinc-900 dark:text-white leading-relaxed"
              />
            </div>

            {/* 실시간 서식 렌더링 미리보기 */}
            {systemEdit.illnessSummary && (
              <div className="bg-amber-50/70 dark:bg-zinc-950/60 border border-amber-200/80 dark:border-zinc-800 rounded-xl p-3 text-xs text-zinc-700 dark:text-zinc-300">
                <div className="text-[11px] font-bold text-amber-800 dark:text-amber-400 mb-1">
                  사용자 화면 표시 미리보기 (볼드 적용)
                </div>
                <div className="leading-relaxed">
                  {renderFormattedPreview(systemEdit.illnessSummary)}
                </div>
              </div>
            )}

            {/* 정보 출처 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">공식 정보 출처</label>
              <input
                type="text"
                value={systemEdit.illnessSource || '질병관리청 국가건강정보포털'}
                onChange={e => handleChange('illnessSource', e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            장기 휴방 중 최근 영상 업로드일 (확률 가산점 반영)
          </label>
          <input
            type="date"
            value={systemEdit.recentVideoUploadDate || ''}
            onChange={e => handleChange('recentVideoUploadDate', e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            업로드된 영상 설명 (예: 풀영상 1개, 숏츠 2개 등)
          </label>
          <input
            type="text"
            value={systemEdit.videoUploadSourceDesc || ''}
            onChange={e => handleChange('videoUploadSourceDesc', e.target.value)}
            placeholder="예: 유튜브 풀영상 1개, 숏츠 영상 업로드"
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
          />
        </div>

        <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl text-xs text-purple-700 dark:text-purple-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">장기 휴방 상태 적용 기준</p>
            <p className="text-[11px] leading-relaxed text-purple-600 dark:text-purple-400">
              장기 휴방 모드가 켜지면 4일 이상 미방송 시 방송 확률이 급격히 떨어지는 대신 점진적인 완만한 감소가 적용돼요. 또한 영상이 업로드되었을 경우 팬들의 복귀 기대감을 반영하여 확률에 보너스 가산점이 부여돼요.
            </p>
          </div>
        </div>

        {onSave && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
            >
              {saving ? '저장 중...' : '휴방 상태 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


/**
 * 날짜 지정: 공지로 "0월 0일 방송합니다 / 휴방합니다" 를 알렸을 때 그날 확률만 맞춤
 * - 지정한 날에만 적용, 지나면 효과 없음 (원래 계산에는 영향 없음)
 * - 방송일 기준: 새벽 6시 전은 전날 방송으로 봄
 */
function DateOverridesCard({ list, onChange, onSave, saving }: { list: DateOverride[]; onChange: (next: DateOverride[]) => void; onSave?: () => void; saving?: boolean }) {
  const kstToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const [date, setDate] = React.useState(kstToday);
  const [type, setType] = React.useState<'on' | 'off'>('off');
  const [time, setTime] = React.useState('');
  const [note, setNote] = React.useState('');
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const add = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const item: DateOverride = { date, type, ...(type === 'on' && time ? { time } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    onChange([...list.filter((o) => o.date !== date), item]);
    setNote('');
    setTime('');
  };
  const field = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xs">
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <CalendarClock className="w-4 h-4 text-purple-600" />
        <h3 className="font-bold text-sm text-zinc-900 dark:text-white">날짜 지정 (방송 예정일 · 휴방일)</h3>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        공지로 "0월 0일 다시 옵니다", "0월 0일 휴방합니다"처럼 알렸을 때 그 날짜만 확률을 맞춰요. 지정한 날이 아니면 원래 계산 그대로예요.
        예정일은 최소 92%, 시각을 적으면 그 시각이 유력 시간이 돼요. 휴방일은 장기 휴방과 같은 정도로 낮춰요. 새벽 6시 전은 전날 방송으로 쳐요.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="날짜" />
        <select value={type} onChange={(e) => setType(e.target.value as 'on' | 'off')} className={field} aria-label="종류">
          <option value="off">휴방일</option>
          <option value="on">방송 예정일</option>
        </select>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={type !== 'on'} className={`${field} disabled:opacity-40`} aria-label="예정 시각 (선택)" />
        <button type="button" onClick={add} className="inline-flex items-center justify-center gap-1 rounded-xl bg-purple-600 text-white text-xs font-bold px-3 py-2 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> 추가
        </button>
      </div>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메인 카드에 보일 문구 (선택, 예: 11월 5일 저녁에 돌아와요!)" className={field} />
      {sorted.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((o) => (
            <div key={o.date} className={`flex items-center gap-3 px-3 py-2.5 text-xs ${o.date < kstToday ? 'opacity-50' : ''}`}>
              <span className="font-bold tabular-nums w-24 shrink-0">{o.date}</span>
              <span className={`px-2 py-0.5 rounded-md font-bold shrink-0 ${o.type === 'on' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>{o.type === 'on' ? `방송 예정${o.time ? ` ${o.time}` : ''}` : '휴방'}</span>
              <span className="flex-1 min-w-0 truncate text-zinc-500">{o.note || (o.date < kstToday ? '지난 날짜' : '')}</span>
              <button type="button" onClick={() => onChange(list.filter((x) => x.date !== o.date))} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer" aria-label={`${o.date} 삭제`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">지정한 날짜가 없어요.</p>
      )}
      {onSave && (
        <div className="flex justify-end">
          <button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold px-4 py-2 disabled:opacity-50 cursor-pointer">{saving ? '저장 중…' : '저장'}</button>
        </div>
      )}
    </div>
  );
}
