import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { MessageSquareWarning } from 'lucide-react';
import { SheetHandle } from './SheetHandle';
import { setPref, usePrefs } from '../../utils/userPrefs';
import { iosHaptic, triggerHaptic } from '../../utils/haptics';
import { cn } from '../../utils';

/**
 * 휴대폰을 흔들면 먼저 뜨는 판 (바로 의견 창으로 가지 않고 한 번 물어봄)
 *  - '문제 알려 주기' → 의견 보내기 창
 *  - 아래 스위치로 흔들기 끄기 (실험실의 같은 설정)
 */
export function ShakeSheet({ open, onClose, onReport }: { open: boolean; onClose: () => void; onReport: () => void }) {
  const on = usePrefs().labShake;
  const tap = () => { iosHaptic(); triggerHaptic(10); };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="shake" className="fixed inset-0 z-[380]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="문제 알려 주기"
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-[28px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white pb-[calc(16px+env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
            <SheetHandle onClose={onClose} />
            <div className="px-6 pt-2 text-center">
              <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center"><MessageSquareWarning className="w-6 h-6" /></span>
              <p className="text-[length:calc(19px*var(--fs,1))] font-black">뭔가 이상했나요?</p>
              <p className="mt-1.5 text-[length:calc(14px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 leading-relaxed break-keep">화면이 멈추거나 버튼이 안 눌리는 등 사이트가 제대로 안 움직였다면 알려 주세요. 고치는 데 큰 도움이 돼요.</p>
            </div>
            <div className="px-5 mt-5">
              <button type="button" onClick={() => { tap(); onClose(); onReport(); }} className="w-full h-13 py-3.5 rounded-2xl bg-purple-600 active:bg-purple-700 text-white text-[length:calc(16px*var(--fs,1))] font-bold cursor-pointer">문제 알려 주기</button>
              <button type="button" onClick={onClose} className="mt-2 w-full py-3 rounded-2xl text-[length:calc(14.5px*var(--fs,1))] font-semibold text-zinc-500 cursor-pointer">괜찮아요</button>
            </div>
            <div className="mt-3 mx-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button type="button" role="switch" aria-checked={on} onClick={() => { tap(); setPref('labShake', !on); }} className="w-full flex items-center justify-between gap-3 text-left cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-[length:calc(15px*var(--fs,1))] font-semibold">흔들어서 문제 알리기</span>
                  <span className="block text-[length:calc(12px*var(--fs,1))] text-zinc-500">끄면 흔들어도 이 창이 안 떠요 · 설정 › 실험실에서 다시 켤 수 있어요</span>
                </span>
                <span className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors', on ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700')}>
                  <span className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
