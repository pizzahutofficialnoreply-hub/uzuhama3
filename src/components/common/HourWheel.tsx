import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { SheetHandle } from './SheetHandle';

/** 굴러가는 숫자 고르기 (아이폰 시간 고르기처럼): 위아래로 밀면 돌아가고 가운데 칸이 고른 값 */
const ITEM = 40;
export function HourWheel({ min = 1, max = 72, value, onChange }: { min?: number; max?: number; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState((value - min) * ITEM);
  useEffect(() => { if (ref.current) ref.current.scrollTop = (value - min) * ITEM; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const n = max - min + 1;
  return (
    <div className="relative h-[200px] select-none" style={{ perspective: 600 }}>
      {/* 가운데 고른 칸 */}
      <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div
        ref={ref}
        className="relative h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-contain"
        style={{ paddingTop: 80, paddingBottom: 80, maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)' }}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          setScroll(top);
          const v = Math.max(min, Math.min(max, Math.round(top / ITEM) + min));
          if (v !== value) { onChange(v); try { (navigator as any).vibrate?.(3); } catch { /* */ } }
        }}
        role="listbox" aria-label="시간 고르기"
      >
        {Array.from({ length: n }, (_, i) => {
          const d = (i * ITEM - scroll) / ITEM; // 가운데에서 몇 칸 떨어졌는지
          const rot = Math.max(-75, Math.min(75, d * 22));
          return (
            <div key={i} role="option" aria-selected={i + min === value}
              onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
              className="snap-center h-10 flex items-center justify-center cursor-pointer tabular-nums"
              style={{ transform: `rotateX(${-rot}deg)`, opacity: Math.max(0.15, 1 - Math.abs(d) * 0.28) }}>
              <span className={`text-[22px] ${i + min === value ? 'font-black text-zinc-900 dark:text-white' : 'font-semibold text-zinc-500'}`}>{i + min}</span>
              <span className="ml-1 text-[14px] font-bold text-zinc-500">시간</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 알림 끌 때: 'N시간 뒤에 다시 켤까요?' (기본 24시간, 1~72시간) */
export function RemuteSheet({ open, label, onPick, onClose }: { open: boolean; label: string; onPick: (hours: number | null) => void; onClose: () => void }) {
  const [h, setH] = useState(24);
  useEffect(() => { if (open) setH(24); }, [open]);
  const at = new Date(Date.now() + h * 3600000);
  const when = `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label="알림 다시 켜기"
            className="sheet-fill relative w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <SheetHandle onClose={onClose} />
            <p className="text-[17px] font-black text-zinc-900 dark:text-white text-center break-keep"><span className="text-purple-600 dark:text-purple-400 tabular-nums">{h}시간</span> 뒤에 {label}을 다시 켤까요?</p>
            <p className="mt-1 text-[12px] text-zinc-500 text-center tabular-nums">{when}에 다시 켜져요</p>
            <HourWheel value={h} onChange={setH} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onPick(null)} className="py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-[14px] font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer">계속 꺼 두기</button>
              <button type="button" onClick={() => onPick(h)} className="py-3 rounded-2xl bg-purple-600 text-white text-[14px] font-bold cursor-pointer">{h}시간 뒤 켜기</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
export default React.memo(HourWheel);
