import { hideVideo } from '../../utils/hiddenVideos';
import { EyeOff } from 'lucide-react';
import { usePrefs } from '../../utils/userPrefs';
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, Flag, Link2, MoreVertical, Sparkles } from 'lucide-react';
import { openAiSummary, useAiStarted } from './AiSummaryHost';
import { cn } from '../../utils';
import { requestSave, useMyPlaylists, type MyItemKind } from '../../utils/myPlaylists';
import { shareTextOrClipboard } from '../../utils/shareUtils';
import { ShareBoxArrowIcon } from './ShareIcon';
import { POPOVER_CLS } from './LinkMenu';

/**
 * 카드·목록·쇼츠의 ⋮ 메뉴: 저장 / 신고
 * 신고는 지금 검색어·해석(수면방송 등)을 함께 보내서, 하루 한 번 검색 조정에 쓰임
 */
export type SearchInfo = { query: string; concepts: string[]; understood: string };
export const SearchContext = createContext<SearchInfo>({ query: '', concepts: [], understood: '' });

export const REPORT_EVENT = 'uzuhama-open-report';
export type ReportTarget = { id: string; kind: MyItemKind; title: string; search: SearchInfo; aiSummary?: boolean; reason?: string };
/** 짧은 알림 (저장 알림과 같은 자리) */
export const TOAST_EVENT = 'uzuhama-toast';
export const toast = (text: string) => window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: text }));

export function requestReport(t: ReportTarget) {
  window.dispatchEvent(new CustomEvent(REPORT_EVENT, { detail: t }));
}

export function ItemMenu({ id, kind, title, className, compact = false, onSave, shareText, onShare, extraItems = [], noReport = false }: {
  id: string; kind: MyItemKind; title: string; className?: string; compact?: boolean; onSave?: () => void;
  /** 공유할 글 (있으면 메뉴에 '공유') */
  shareText?: () => string;
  onShare?: () => void;
  /** 메뉴 맨 위에 더 넣을 항목 (예: 기록에서 삭제) */
  extraItems?: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
  /** 신고 항목 숨기기 */
  noReport?: boolean;
}) {
  const search = useContext(SearchContext);
  const { lists } = useMyPlaylists();
  const saved = Boolean(id) && lists.some((l) => l.items.some((x) => x.id === id));
  const [open, setOpen] = useState(false);
  const labAi = usePrefs().labAiSummary; // 설정 › 실험실에서 끌 수 있음
  const aiStarted = useAiStarted(id, open && labAi); // AI가 보기 시작한 영상만 'AI 영상 요약'
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = r.bottom + 264 + extraItems.length * 44 > window.innerHeight - 80; // 아래 공간이 없으면 위로
    const left = Math.max(8, Math.min(window.innerWidth - 188, r.right - 180));
    setPos(up ? { bottom: window.innerHeight - r.top + 6, left, up } : { top: r.bottom + 6, left, up });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    // 많이 스크롤하면 닫기 (조금 흔들리는 건 무시: 아이폰은 메뉴가 뜰 때 살짝 스크롤이 생김)
    const y0 = window.scrollY;
    const onScroll = () => { if (Math.abs(window.scrollY - y0) > 40) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); window.removeEventListener('scroll', onScroll); };
  }, [open]);

  if (!id) return null;
  const item = 'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/60';
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={cn('rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer flex items-center justify-center relative', compact ? 'p-1' : 'p-1.5', className)}
        title="더 보기 (저장·공유·신고)"
        aria-label="더 보기"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" />
        {saved && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-purple-500" aria-hidden />}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              role="menu"
              initial={{ opacity: 0, scale: 0.95, y: pos.up ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, transformOrigin: pos.up ? 'bottom right' : 'top right' }}
              className={cn('z-[380] w-[180px]', POPOVER_CLS)}
            >
              <div>
                {extraItems.map((x, i) => (
                  <button key={i} type="button" role="menuitem" className={cn(item, i > 0 && 'border-t border-zinc-100 dark:border-zinc-700', x.danger && 'text-red-600')} onClick={(e) => { e.stopPropagation(); setOpen(false); x.onClick(); }}>
                    {x.icon}{x.label}
                  </button>
                ))}
                {/^[\w-]{11}$/.test(id) && labAi && aiStarted && (
                  <button type="button" role="menuitem" className={cn(item, extraItems.length > 0 && 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => { e.stopPropagation(); setOpen(false); openAiSummary({ id, title, kind }); }}>
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    AI 영상 요약
                  </button>
                )}
                <button type="button" role="menuitem" className={cn(item, (extraItems.length > 0 || /^[\w-]{11}$/.test(id)) && 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => { e.stopPropagation(); setOpen(false); onSave?.(); requestSave({ id, kind, title }); }}>
                  <Bookmark className={cn('w-4 h-4', saved ? 'text-purple-600' : 'text-zinc-500')} fill={saved ? 'currentColor' : 'none'} />
                  {saved ? '저장됨 · 바꾸기' : '저장'}
                </button>
                {shareText && (
                  <button type="button" role="menuitem" className={cn(item, 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onShare?.();
                    // 공유 창은 누른 그 순간에 열어야 해서 바로 부름
                    shareTextOrClipboard(shareText(), `${title} 정보`).catch(() => {});
                  }}>
                    <ShareBoxArrowIcon className="w-4 h-4 text-zinc-500" />
                    공유
                  </button>
                )}
                <button type="button" role="menuitem" className={cn(item, 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  // 카톡 등에 붙이면 제목·썸네일 카드가 뜨고, 누르면 이 사이트의 그 영상으로
                  const link = `https://uzuhama.vercel.app/${kind === 'short' ? 's' : 'v'}/${id}`;
                  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => toast('사이트 링크를 복사했어요')).catch(() => window.prompt('사이트 링크', link));
                  else window.prompt('사이트 링크', link);
                }}>
                  <Link2 className="w-4 h-4 text-zinc-500" />
                  사이트 링크 복사
                </button>
                {/^[\w-]{11}$/.test(id) && <button type="button" role="menuitem" className={cn(item, 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => { e.stopPropagation(); setOpen(false); hideVideo({ id, kind, title }); }}>
                  <EyeOff className="w-4 h-4 text-zinc-500" />
                  이 영상 가리기
                </button>}
                {!noReport && <button type="button" role="menuitem" className={cn(item, 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => { e.stopPropagation(); setOpen(false); requestReport({ id, kind, title, search }); }}>
                  <Flag className="w-4 h-4 text-zinc-500" />
                  {search.query ? '이 결과 신고' : '신고'}
                </button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
