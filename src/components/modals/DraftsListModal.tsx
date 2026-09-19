import { SavedDraft } from '../../types';
import { X, Clock, Trash2, Download, AlertCircle } from 'lucide-react';
import { useBodyScrollLock } from '../../utils';

interface DraftsListModalProps {
  isOpen: boolean;
  drafts: SavedDraft[];
  onClose: () => void;
  onLoadDraft: (draft: SavedDraft) => void;
  onDeleteDraft: (id: string) => void;
  onClearAllDrafts: () => void;
}

export function DraftsListModal({
  isOpen,
  drafts,
  onClose,
  onLoadDraft,
  onDeleteDraft,
  onClearAllDrafts,
}: DraftsListModalProps) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-5 sm:p-6 shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
              임시 저장 목록 ({drafts.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2.5 custom-scrollbar">
          {drafts.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 stroke-1" />
              <p className="text-sm">저장된 임시 저장 내역이 없습니다.</p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3 hover:border-purple-300 dark:hover:border-purple-800 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200/60 dark:border-purple-800/60">
                      {draft.savedAtFormatted}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white line-clamp-2 break-all">
                    {draft.summary || '내용 요약 없음'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onLoadDraft(draft)}
                    className="p-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                    title="이 임시 저장 내용 불러오기"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>불러오기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDraft(draft.id)}
                    className="p-2 rounded-xl text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {drafts.length > 0 && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClearAllDrafts}
              className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>전체 목록 삭제</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
