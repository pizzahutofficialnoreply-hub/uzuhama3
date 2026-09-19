import React, { useState } from 'react';
import { X, Check, AlertTriangle, Calendar, Info, Shield, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { TermsRevision } from '../types';
import { useBodyScrollLock } from '../utils';

interface TermsRevisionModalProps {
  revision: TermsRevision;
  adminEmail?: string;
  onAcknowledge: () => void;
  onClose?: () => void;
  isPreview?: boolean;
}

export function TermsRevisionModal({
  revision,
  adminEmail = 'admin@example.com',
  onAcknowledge,
  onClose,
  isPreview = false,
}: TermsRevisionModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [showDiffDetail, setShowDiffDetail] = useState(false);
  useBodyScrollLock(true);

  const isImportant = revision.type === 'important';

  // Calculate days remaining until effective date
  const getDaysRemaining = () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const effective = new Date(revision.effectiveDate);
      effective.setHours(0, 0, 0, 0);
      const diffTime = effective.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return `시행 D-${diffDays}`;
      if (diffDays === 0) return '오늘부터 시행';
      return '시행 중';
    } catch {
      return '';
    }
  };

  const daysRemainingText = getDaysRemaining();

  const defaultObjection = `개정 약관에 동의하지 않으시는 경우 서비스 회원 탈퇴 또는 이용 중단을 요청하실 수 있으며, 관리자 문의(${adminEmail})를 통해 이의를 제기하실 수 있습니다. 시행일 전까지 별도의 거부 의사를 표시하지 아니한 경우 본 개정 약관에 동의한 것으로 간주됩니다.`;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] max-w-xl w-full shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {isImportant ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  중요 개정 (30일 사전 고지)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                  <Info className="w-3.5 h-3.5" />
                  개정 안내 (7일 후 시행)
                </span>
              )}

              {daysRemainingText && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {daysRemainingText}
                </span>
              )}

              {isPreview && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  미리보기 모드
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
              {revision.title || (isImportant ? '[중요] 이용약관 및 개인정보처리방침 개정 안내' : '이용약관 및 개인정보처리방침 개정 안내')}
            </h2>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm">
          {/* Key Dates Summary */}
          <div className="bg-zinc-100/80 dark:bg-zinc-800/60 rounded-xl p-3.5 sm:p-4 border border-zinc-200 dark:border-zinc-700/60 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">개정 공지 일자</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{revision.noticeDate}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">적용(시행) 일자</span>
                <span className="font-bold text-purple-700 dark:text-purple-300">{revision.effectiveDate}</span>
              </div>
            </div>
          </div>

          {/* Section 1: 직전 버전 대비 무엇이 어떻게 바뀌었는지 */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-500" />
              주요 개정 사항 비교 (직전 버전 대비 변경 내용)
            </h3>
            <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans text-sm">
              {revision.changesSummary || '상세 변경 사항이 기록되지 않았습니다.'}
            </div>
          </div>

          {/* Toggle diff detail if previous/new terms are recorded */}
          {(revision.previousTerms || revision.newTerms || revision.previousPrivacy || revision.newPrivacy) && (
            <div>
              <button
                type="button"
                onClick={() => setShowDiffDetail(!showDiffDetail)}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                {showDiffDetail ? '전문 비교 접기 ▲' : '전문 상세 비교 보기 (직전 버전 vs 개정안) ▼'}
              </button>

              {showDiffDetail && (
                <div className="mt-3 space-y-3 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                  {revision.previousTerms && revision.newTerms && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 rounded-lg">
                        <div className="font-bold text-red-700 dark:text-red-400 mb-1">직전 이용약관</div>
                        <pre className="whitespace-pre-wrap font-sans text-[11px] max-h-40 overflow-y-auto text-zinc-600 dark:text-zinc-400">
                          {revision.previousTerms}
                        </pre>
                      </div>
                      <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
                        <div className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">개정 이용약관</div>
                        <pre className="whitespace-pre-wrap font-sans text-[11px] max-h-40 overflow-y-auto text-zinc-700 dark:text-zinc-200">
                          {revision.newTerms}
                        </pre>
                      </div>
                    </div>
                  )}

                  {revision.previousPrivacy && revision.newPrivacy && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 rounded-lg">
                        <div className="font-bold text-red-700 dark:text-red-400 mb-1">직전 개인정보처리방침</div>
                        <pre className="whitespace-pre-wrap font-sans text-[11px] max-h-40 overflow-y-auto text-zinc-600 dark:text-zinc-400">
                          {revision.previousPrivacy}
                        </pre>
                      </div>
                      <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
                        <div className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">개정 개인정보처리방침</div>
                        <pre className="whitespace-pre-wrap font-sans text-[11px] max-h-40 overflow-y-auto text-zinc-700 dark:text-zinc-200">
                          {revision.newPrivacy}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section 2: 이의 제기 방법 및 거부권 안내 */}
          <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-xl p-4 text-xs sm:text-sm text-purple-900 dark:text-purple-300 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-purple-800 dark:text-purple-200">
              <Info className="w-4 h-4 shrink-0" />
              이의 제기 방법 및 거부권(동의 간주) 안내
            </div>
            <p className="leading-relaxed text-xs text-purple-800/90 dark:text-purple-300/90 whitespace-pre-wrap">
              {revision.objectionGuide || defaultObjection}
            </p>
          </div>

          {/* Full Policy Links */}
          <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1">
            <span>약관 전문 확인:</span>
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
            >
              이용약관 전문 <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
            >
              개인정보처리방침 전문 <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Section 3: 중요(30일) 개정일 때만 체크박스로 동의 여부 확인 */}
          {isImportant && (
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 group-hover:border-purple-500 transition-colors shrink-0">
                  <input
                    type="checkbox"
                    className="absolute opacity-0 w-full h-full cursor-pointer"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  {agreed && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 pointer-events-none" />}
                </div>
                <span className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 font-medium leading-snug">
                  [필수] 개정된 이용약관 및 개인정보처리방침의 주요 변경 사항, 시행 일자({revision.effectiveDate}) 및 거부권에 관한 사항을 확인하였으며, 이에 동의합니다.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 text-center sm:text-left">
            {!isImportant && (
              <span>시행일까지 별도 거부 의사가 없으면 동의한 것으로 간주됩니다.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {isImportant ? '나중에 확인' : '닫기'}
              </button>
            )}

            <button
              type="button"
              onClick={onAcknowledge}
              disabled={isImportant && !agreed}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-400 shadow-sm"
            >
              {isImportant ? '동의 및 확인' : '확인했습니다'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
