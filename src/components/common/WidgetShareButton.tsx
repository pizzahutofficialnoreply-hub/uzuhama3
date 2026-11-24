import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, MoreVertical, Flag } from 'lucide-react';
import { requestReport } from './ItemMenu';
import { POPOVER_CLS } from './LinkMenu';
import { shareElementAsImage } from '../../utils/shareUtils';
import { cn } from '../../utils';
import { ShareBoxArrowIcon } from './ShareIcon';
import { fullHeight, bottomBase } from '../../utils/viewport';

interface WidgetShareButtonProps {
  targetId?: string;
  targetRef?: React.RefObject<HTMLElement | null>;
  title: string;
  className?: string;
  iconClassName?: string;
}

export const WidgetShareButton: React.FC<WidgetShareButtonProps> = ({
  targetId,
  targetRef,
  title,
  className,
  iconClassName,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('uzuhama_setting_enable_widget_share');
    return val === null ? true : val === 'true';
  });

  useEffect(() => {
    const handleStorage = () => {
      const val = localStorage.getItem('uzuhama_setting_enable_widget_share');
      setIsEnabled(val === null ? true : val === 'true');
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('uzuhama_settings_changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('uzuhama_settings_changed', handleStorage);
    };
  }, []);

  if (!isEnabled) return null;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSharing) return;

    const target = targetRef?.current || (targetId ? document.getElementById(targetId) : null);
    if (!target) {
      console.warn('Share target not found', targetId);
      return;
    }

    setIsSharing(true);
    try {
      await shareElementAsImage(target, title);
    } finally {
      setIsSharing(false);
    }
  };

  return <WidgetMenu title={title} sharing={isSharing} onShare={handleShare} className={className} iconClassName={iconClassName} />;
};

/** 분석 그래프·표의 ⋯ 메뉴: 공유(이미지) · 신고 — 검색 탭 카드 메뉴와 같은 모양 */
function WidgetMenu({ title, sharing, onShare, className, iconClassName }: { title: string; sharing: boolean; onShare: (e: React.MouseEvent) => void; className?: string; iconClassName?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; up?: boolean }>({ left: 0 });
  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = r.bottom + 120 > fullHeight() - 80;
    const left = Math.max(8, Math.min(window.innerWidth - 188, r.right - 180));
    setPos(up ? { bottom: bottomBase() - r.top + 6, left, up } : { top: r.bottom + 6, left, up });
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); window.removeEventListener('scroll', onScroll); };
  }, [open]);
  const item = 'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/60';
  return (
    <>
      <button
        ref={btn}
        type="button"
        data-no-share="true"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={sharing}
        className={cn(
          "p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-150 cursor-pointer active:scale-90 outline-none focus:outline-none focus:ring-0 select-none",
          sharing && "opacity-60 cursor-wait",
          className
        )}
        title="더 보기 (공유·신고)"
        aria-label={`${title} 더 보기`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {sharing ? <Loader2 className={cn("w-4 h-4 animate-spin text-purple-600 dark:text-purple-400", iconClassName)} /> : <MoreVertical className={cn("w-4 h-4", iconClassName)} />}
      </button>
      {createPortal(
        // 검색 탭 영상 ⋯ 메뉴와 같은 크기·같은 움직임
        <AnimatePresence>{open && <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-[379] bg-black/15 dark:bg-black/35" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />}{open && (
        <motion.div key="menu" ref={menu} role="menu" data-no-share="true"
          initial={{ opacity: 0, scale: 0.95, y: pos.up ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, transformOrigin: pos.up ? 'bottom right' : 'top right' }} className={cn('z-[380] w-[180px]', POPOVER_CLS)}>
          <button type="button" role="menuitem" className={item} onClick={(e) => { setOpen(false); onShare(e); }}>
            <ShareBoxArrowIcon className="w-4 h-4 text-zinc-500" />
            이미지로 공유
          </button>
          <button type="button" role="menuitem" className={cn(item, 'border-t border-zinc-100 dark:border-zinc-700')} onClick={(e) => { e.stopPropagation(); setOpen(false); requestReport({ id: `widget-${title}`, kind: 'video', title, widget: title, search: { query: '', concepts: [], understood: '' } }); }}>
            <Flag className="w-4 h-4 text-zinc-500" />
            신고
          </button>
        </motion.div>)}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}
