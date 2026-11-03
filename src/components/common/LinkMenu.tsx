import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils';

/**
 * 쇼츠·편집본 링크 버튼 (카드·목록 공용)
 * - 하나면 바로 열리는 링크, 여러 개면 눌렀을 때 위로 부드럽게 펼쳐지는 목록
 */
export type MenuLink = { url: string; title?: string };

export function LinkMenu({
  items, label, menuTitle, icon, tone, variant = 'card', onOpen,
}: {
  items: MenuLink[];
  /** 버튼 글자 (예: 쇼츠 보기 / 편집본) — variant 'icon' 에서는 숨김 */
  label: string;
  menuTitle: string;
  icon: React.ReactNode;
  tone: 'red' | 'zinc' | 'purple';
  variant?: 'card' | 'icon';
  /** 펼치거나 열 때 (관심 기록 등) */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [open]);

  const valid = items.filter((x) => x?.url);
  if (!valid.length) return null;
  const toneCls = tone === 'red'
    ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20'
    : tone === 'purple'
      ? 'bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20'
      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700';
  const btnCls = variant === 'icon'
    ? cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer relative', toneCls)
    : cn('w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors font-hanna font-pro cursor-pointer', toneCls);

  if (valid.length === 1) {
    return (
      <a href={valid[0].url} target="_blank" rel="noreferrer" onClick={onOpen} title={valid[0].title || label} aria-label={label}
        className={cn(btnCls, variant === 'card' && 'flex-1 min-w-0')}>
        {icon}{variant === 'card' && <span className="truncate font-hanna font-pro">{label}</span>}
      </a>
    );
  }

  return (
    <div className={cn('relative', variant === 'card' && 'flex-1 min-w-0')} ref={ref}>
      <button type="button" onClick={() => { setOpen((v) => !v); if (!open) onOpen?.(); }} className={btnCls} aria-expanded={open} aria-label={`${menuTitle} ${valid.length}개`}>
        {icon}
        {variant === 'card' ? (
          <>
            <span className="truncate">{label} ({valid.length})</span>
            <ChevronDown className={cn('w-3 h-3 opacity-70 transition-transform duration-200', open && 'rotate-180')} />
          </>
        ) : (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">{valid.length}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            style={{ transformOrigin: variant === 'icon' ? 'bottom right' : 'bottom center' }}
            className={cn(
              // ⋮ 메뉴와 같은 둥글기·그림자
              'absolute bottom-full mb-2 w-56 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden z-30 flex flex-col',
              'shadow-[0_14px_36px_-6px_rgba(0,0,0,0.28)] dark:shadow-[0_18px_44px_-6px_rgba(0,0,0,0.85)] ring-1 ring-black/5 dark:ring-white/10',
              variant === 'icon' ? 'right-0' : 'left-1/2 -translate-x-1/2',
            )}
          >
            <div className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-bold text-zinc-500">{menuTitle} 선택</div>
            {valid.map((s, idx) => (
              <motion.a
                key={`${s.url}-${idx}`}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * idx, duration: 0.18 }}
                onClick={() => setOpen(false)}
                className="px-3.5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 border-t border-zinc-100 dark:border-zinc-700 truncate"
              >
                {s.title || `${menuTitle} ${idx + 1}`}
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
