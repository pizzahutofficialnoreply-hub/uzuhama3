import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ddayLabel } from '../../utils/dday';

type Item = { id: string; title: string; date: string; left: number };

/** 헤더 제목 옆 D-day: 회색 캡슐 'D-12 10주년' (여러 개면 4초마다 바뀜, 누르면 날짜) */
export function HeaderDday({ items }: { items: Item[] }) {
  const [i, setI] = useState(0);
  const [showDate, setShowDate] = useState(false);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = window.setInterval(() => { setI((x) => (x + 1) % items.length); setShowDate(false); }, 4000);
    return () => window.clearInterval(t);
  }, [items.length]);
  const it = items[i % items.length];
  if (!it) return null;
  const today = it.left === 0;
  return (
    <button
      type="button"
      onClick={() => setShowDate((v) => !v)}
      data-testid="dday-chip"
      title={`${it.title} · ${it.date}`}
      className="shrink min-w-0 max-w-[46vw] sm:max-w-xs h-7 sm:h-8 px-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border-[1.5px] border-purple-500/80 dark:border-purple-400/70 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={`${it.id}-${showDate}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }} className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 text-[12px] sm:text-[13px] font-black tabular-nums text-purple-600 dark:text-purple-400`}>{showDate ? it.date.slice(5).replace('-', '.') : ddayLabel(it.left)}</span>
          <span className="text-[11.5px] sm:text-[12.5px] font-bold text-zinc-500 dark:text-zinc-400 truncate">{it.title}</span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
