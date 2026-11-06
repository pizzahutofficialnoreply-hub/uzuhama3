import React, { useState } from 'react';
import { DEFAULT_PRIVACY, DEFAULT_TERMS, LEGAL_VERSION_DATE } from '../../../../content/legal';
import { SystemConfig, TermsRevision } from '../../../../types';
import { Shield, Plus, Check, Eye, Calendar, AlertTriangle, FileText } from 'lucide-react';
import { format, addDays, differenceInCalendarDays } from 'date-fns';
import { TermsRevisionModal } from '../../../TermsRevisionModal';
import { deleteField } from 'firebase/firestore';

interface TermsPolicySubTabProps {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
  onSave?: () => void;
  saving?: boolean;
}

export const TermsPolicySubTab: React.FC<TermsPolicySubTabProps> = ({
  systemEdit,
  handleChange,
  onUpdateSystemConfig,
  onSave,
  saving = false
}) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const defaultNormalEffective = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const [revisionForm, setRevisionForm] = useState<Partial<TermsRevision>>({
    type: 'normal',
    title: '',
    target: 'all',
    noticeDate: todayStr,
    effectiveDate: defaultNormalEffective,
    changesSummary: '',
    objectionGuide: '',
  });

  const [previewRevision, setPreviewRevision] = useState<TermsRevision | null>(null);
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  const handleRevisionTypeChange = (type: 'normal' | 'important') => {
    const noticeDate = revisionForm.noticeDate ? new Date(revisionForm.noticeDate) : new Date();
    const daysToAdd = type === 'important' ? 30 : 7;
    const newEffective = format(addDays(noticeDate, daysToAdd), 'yyyy-MM-dd');
    setRevisionForm(prev => ({
      ...prev,
      type,
      effectiveDate: newEffective
    }));
  };

  const handlePublishRevision = async () => {
    if (!revisionForm.title?.trim()) {
      return alert('개정 안내 제목을 입력해주세요.');
    }
    if (!revisionForm.changesSummary?.trim()) {
      return alert('직전 버전 대비 변경 사항을 입력해주세요.');
    }
    if (!revisionForm.noticeDate || !revisionForm.effectiveDate) {
      return alert('공지 일자와 적용 일자를 입력해주세요.');
    }

    const noticeDate = new Date(revisionForm.noticeDate);
    const effectiveDate = new Date(revisionForm.effectiveDate);
    const diffDays = differenceInCalendarDays(effectiveDate, noticeDate);

    if (revisionForm.type === 'important' && diffDays < 30) {
      return alert(`'중요 (30일)' 개정은 공지일로부터 최소 30일 후부터 시행해야 합니다.\n(현재 설정 간격: ${diffDays}일)`);
    }

    const nextVersion = (systemEdit.termsVersion || 1) + 1;
    const newRevision: TermsRevision = {
      version: nextVersion,
      type: revisionForm.type || 'normal',
      title: revisionForm.title.trim(),
      noticeDate: revisionForm.noticeDate,
      effectiveDate: revisionForm.effectiveDate,
      target: revisionForm.target || 'all',
      changesSummary: revisionForm.changesSummary.trim(),
      ...(revisionForm.objectionGuide?.trim() ? { objectionGuide: revisionForm.objectionGuide.trim() } : {}),
      previousTerms: systemEdit.termsOfService || '',
      newTerms: systemEdit.termsOfService || '',
      previousPrivacy: systemEdit.privacyPolicy || '',
      newPrivacy: systemEdit.privacyPolicy || '',
    };

    const nextHistory = [newRevision, ...(systemEdit.termsHistory || [])];
    const updatedSystem: Partial<SystemConfig> = {
      ...systemEdit,
      termsVersion: nextVersion,
      termsRevision: newRevision,
      termsHistory: nextHistory,
    };

    handleChange('termsVersion', nextVersion);
    handleChange('termsRevision', newRevision);
    handleChange('termsHistory', nextHistory);

    if (onUpdateSystemConfig) {
      try {
        await onUpdateSystemConfig(updatedSystem);
        alert(`약관 개정안 (v${nextVersion})이 성공적으로 발행되었습니다.`);
        setShowRevisionForm(false);
      } catch (err: any) {
        console.error('handlePublishRevision error:', err);
        alert('약관 개정안 발행 중 오류: ' + (err?.message || err));
      }
    }
  };

  const handleCancelActiveRevision = async () => {
    if (!window.confirm('현재 활성화된 약관 개정 안내 팝업을 중단하시겠습니까?')) {
      return;
    }
    const updatedSystem: any = {
      ...systemEdit,
      termsRevision: deleteField(),
    };
    handleChange('termsRevision', undefined);
    if (onUpdateSystemConfig) {
      try {
        await onUpdateSystemConfig(updatedSystem);
        alert('활성 개정 안내가 해제되었습니다.');
      } catch (err: any) {
        console.error('handleCancelActiveRevision error:', err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 약관 개정안 발행 및 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shield className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">약관 개정안 발행 및 전자고지</h3>
              <p className="text-xs text-zinc-500">
                약관 변경 시 7일(일반) 또는 30일(중요) 사전 고지 팝업을 발행합니다. (현재 버전: v{systemEdit.termsVersion || 1})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRevisionForm(!showRevisionForm)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{showRevisionForm ? '작성 닫기' : '새 개정안 작성'}</span>
          </button>
        </div>

        {/* 현재 활성 개정안 상태 */}
        {systemEdit.termsRevision ? (
          <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white">
                현재 활성화된 개정안 (v{systemEdit.termsRevision.version})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewRevision(systemEdit.termsRevision!)}
                  className="px-3 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>팝업 미리보기</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelActiveRevision}
                  className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-red-200"
                >
                  개정안 중단
                </button>
              </div>
            </div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              {systemEdit.termsRevision.title}
            </div>
            <div className="text-xs text-zinc-500">
              공지일: {systemEdit.termsRevision.noticeDate} | 시행일: {systemEdit.termsRevision.effectiveDate}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl text-xs text-zinc-400 text-center">
            현재 뷰어에 활성화된 약관 개정 안내 팝업이 없습니다.
          </div>
        )}

        {/* 신규 개정안 작성 폼 */}
        {showRevisionForm && (
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleRevisionTypeChange('normal')}
                className={`p-3 rounded-xl border text-left ${revisionForm.type === 'normal' ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 ring-2 ring-purple-500' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}
              >
                <div className="font-bold text-xs mb-1">일반 개정 (7일 후 시행)</div>
                <p className="text-[11px] text-zinc-500">직전 버전 대비 변경 사항 안내 후 자동 동의 간주되는 팝업</p>
              </button>
              <button
                type="button"
                onClick={() => handleRevisionTypeChange('important')}
                className={`p-3 rounded-xl border text-left ${revisionForm.type === 'important' ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}
              >
                <div className="font-bold text-xs mb-1">중요 개정 (30일 사전 고지)</div>
                <p className="text-[11px] text-zinc-500">최소 30일 전 고지 및 사용자의 체크박스 필수 동의 확인</p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">개정 안내 제목</label>
              <input
                type="text"
                placeholder="예: 2026년 서비스 이용약관 개정 안내"
                value={revisionForm.title || ''}
                onChange={e => setRevisionForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">공지 일자</label>
                <input
                  type="date"
                  value={revisionForm.noticeDate || todayStr}
                  onChange={e => setRevisionForm(prev => ({ ...prev, noticeDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">적용(시행) 일자</label>
                <input
                  type="date"
                  value={revisionForm.effectiveDate || ''}
                  onChange={e => setRevisionForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">주요 변경 사항 비교 요약</label>
              <textarea
                rows={4}
                placeholder="직전 버전 대비 변경 사항을 입력하세요..."
                value={revisionForm.changesSummary || ''}
                onChange={e => setRevisionForm(prev => ({ ...prev, changesSummary: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handlePublishRevision}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
              >
                개정안 즉시 발행 및 뷰어 적용
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. 이용약관 및 개인정보처리방침 원문 전문 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">이용약관 및 개인정보처리방침 원문 편집</h3>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`${LEGAL_VERSION_DATE} 기준 새 기본 문서로 편집 칸을 바꿀까요?\n[대괄호] 부분(운영자 이메일·이름)은 직접 고쳐 주세요. 저장 전까지는 반영되지 않아요.\n이미 공개된 문서를 바꾸는 거라면 위 '개정 공지'로 7일(불리하면 30일) 전에 알리세요.`)) return;
              handleChange('termsOfService', DEFAULT_TERMS);
              handleChange('privacyPolicy', DEFAULT_PRIVACY);
            }}
            className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer"
          >
            새 기본 문서 불러오기 ({LEGAL_VERSION_DATE})
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">개인정보 보호법·작성지침(2025)과 약관규제법을 바탕으로, 이 사이트가 실제로 모으는 정보(알림 토큰, 제보·신고·만족도, 오류 기록, 구글 로그인, 유튜브 저장)에 맞춰 쓴 문서예요. [대괄호]는 꼭 실제 정보로 바꿔 주세요.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">서비스 이용약관</label>
            <textarea 
              rows={12}
              value={systemEdit.termsOfService || ''}
              onChange={e => handleChange('termsOfService', e.target.value)}
              placeholder="제 1조 (목적)..."
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs text-zinc-900 dark:text-white font-mono leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">개인정보처리방침</label>
            <textarea 
              rows={12}
              value={systemEdit.privacyPolicy || ''}
              onChange={e => handleChange('privacyPolicy', e.target.value)}
              placeholder="본 사이트는 서비스 제공을 위해 최소한의..."
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs text-zinc-900 dark:text-white font-mono leading-relaxed"
            />
          </div>
        </div>
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
            <span>{saving ? '저장 중...' : '약관/정책 저장하기'}</span>
          </button>
        </div>
      )}

      {previewRevision && (
        <TermsRevisionModal
          revision={previewRevision}
          isPreview={true}
          onClose={() => setPreviewRevision(null)}
          onAcknowledge={() => setPreviewRevision(null)}
        />
      )}
    </div>
  );
};
