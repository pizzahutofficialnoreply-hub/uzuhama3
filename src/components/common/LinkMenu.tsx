import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils';

/**
 * 쇼츠·편집본 링크 버튼 (카드·목록 공용)
 * - 하나면 바로 열리는 링크, 여러 개면 눌렀을 때 위로 부드럽게 펼쳐지는 목록
 */
export type MenuLink = { url: string; title?: string };

/** ⋮ 메뉴와 쇼츠·편집본·생방송 고르기 메뉴가 같이 쓰는 모양 (둥글기·그림자) */
export const POPOVER_CLS = 'rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 ring-1 ring-black/5 dark:ring-white/10 shadow-[0_18px_40px_-8px_rgba(0,0,0,0.30),0_4px_12px_rgba(0,0,0,0.10)] dark:shadow-[0_20px_46px_-6px_rgba(0,0,0,0.85),0_4px_12px_rgba(0,0,0,0.5)]';

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
  const menu = useRef<HTMLDivElement>(null);
  // 카드 칸을 넘지 않게: 화면 기준으로 버튼 바로 위(공간 없으면 아래)에, 화면 밖으로 안 나가게
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; up: boolean }>({ left: 0, width: 220, up: true });
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const width = Math.min(window.innerWidth - 16, Math.max(r.width, 220));
    let left = variant === 'icon' ? r.right - width : r.left + r.width / 2 - width / 2;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    const need = Math.min(320, 44 + items.length * 42);
    const up = r.top > need + 16;
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + 8, up } : { left, width, top: r.bottom + 8, up });
  }, [open, variant, items.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const y0 = window.scrollY;
    const onScroll = () => { if (Math.abs(window.scrollY - y0) > 40) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); window.removeEventListener('scroll', onScroll); };
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
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              initial={{ opacity: 0, y: pos.up ? 8 : -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, transformOrigin: pos.up ? 'bottom center' : 'top center' }}
              className={cn('z-[380] flex flex-col max-h-80 overflow-y-auto', POPOVER_CLS)}
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
                  className="px-3.5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 border-t border-zinc-100 dark:border-zinc-700 truncate shrink-0"
                >
                  {s.title || `${menuTitle} ${idx + 1}`}
                </motion.a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
