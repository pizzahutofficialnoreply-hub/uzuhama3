import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { TOAST_EVENT } from './ItemMenu';
import { CONFIRM_EVENT, CHOOSE_EVENT, type ConfirmOpts, type ChooseOption } from '../../utils/ui';
import { EyeOff, Flag, Trash2, Share, Bookmark } from 'lucide-react';
import { cn } from '../../utils';

/**
 * 앱 공통 알림 자리
 *  - 토스트: 안내만 하는 알림 (예전 alert 창 대신). 화면 아래에 잠깐 떴다 사라짐, 눌러서 닫기
 *  - 확인 시트: 고르거나 지우는 것처럼 선택이 필요한 확인 (예전 confirm 창 대신). 밑에서 올라옴
 */
type ToastItem = { id: number; text: string; kind: 'info' | 'success' | 'error' };
let seq = 0;

const kindOf = (t: string): ToastItem['kind'] =>
  /실패|못했|못 했|오류|에러|없어요|안 돼|안돼|할 수 없|잘못|초과|막혔|거절/.test(t) ? 'error' : /했어요|됐어요|되었어요|완료|저장|복사|보냈|반영/.test(t) ? 'success' : 'info';

export function UiHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d: any = (e as CustomEvent).detail;
      const text = String(typeof d === 'string' ? d : d?.text || '').trim();
      if (!text) return;
      const kind: ToastItem['kind'] = (typeof d === 'object' && d?.kind) || kindOf(text);
      const id = ++seq;
      setToasts((list) => [...list.filter((x) => x.text !== text), { id, text, kind }].slice(-3));
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), Math.min(7000, 2400 + text.length * 55));
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);

  useEffect(() => {
    const on = (e: Event) => setConfirm((e as CustomEvent).detail);
    window.addEventListener(CONFIRM_EVENT, on);
    return () => window.removeEventListener(CONFIRM_EVENT, on);
  }, []);

  const [choose, setChoose] = useState<{ title?: string; message?: string; options: ChooseOption[]; resolve: (v: string | null) => void } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setChoose((e as CustomEvent).detail);
    window.addEventListener(CHOOSE_EVENT, on);
    return () => window.removeEventListener(CHOOSE_EVENT, on);
  }, []);
  const pick = (v: string | null) => { choose?.resolve(v); setChoose(null); };
  useEffect(() => {
    if (!choose) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') pick(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [choose]); // eslint-disable-line react-hooks/exhaustive-deps
  const OptIcon = { hide: EyeOff, flag: Flag, trash: Trash2, share: Share, save: Bookmark };

  const answer = (v: boolean) => { confirm?.resolve(v); setConfirm(null); };
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => okRef.current?.focus(), 60);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false); };
    window.addEventListener('keydown', key);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', key); };
  }, [confirm]); // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = { info: Info, success: CheckCircle2, error: XCircle };
  return createPortal(
    <>
      <div className="fixed left-0 right-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[600] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const I = Icon[t.kind];
            return (
              <motion.button
                key={t.id}
                type="button"
                // 끊김 없게: 위치 다시 계산(layout)·뒤 흐림 없이 transform·opacity 만
                initial={{ y: 24, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ y: 10, opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                style={{ willChange: 'transform, opacity' }}
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
                className="pointer-events-auto max-w-[min(92vw,480px)] flex items-start gap-2.5 pl-3.5 pr-4 py-2.5 rounded-2xl bg-zinc-900 dark:bg-zinc-800 text-white text-sm shadow-[0_8px_24px_rgba(0,0,0,0.22)] text-left cursor-pointer"
              >
                <I className={cn('w-4 h-4 mt-0.5 shrink-0', t.kind === 'error' ? 'text-red-400' : t.kind === 'success' ? 'text-emerald-400' : 'text-purple-300')} />
                <span className="font-semibold whitespace-pre-line break-keep leading-snug">{t.text}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 z-[610] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={confirm.title || '확인'}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/45" onClick={() => answer(false)} />
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="sheet-fill relative w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl"
            >
              <div className="sm:hidden mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
              <div className="flex items-start gap-3">
                {confirm.danger && <span className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0"><AlertTriangle className="w-4.5 h-4.5 text-red-500" /></span>}
                <div className="min-w-0">
                  {confirm.title && <p className="text-[17px] font-bold text-zinc-900 dark:text-white break-keep">{confirm.title}</p>}
                  {confirm.message && <p className={cn('text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line break-keep leading-relaxed', confirm.title && 'mt-1')}>{confirm.message}</p>}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => answer(false)} className="py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer">{confirm.cancelText || '취소'}</button>
                <button ref={okRef} type="button" onClick={() => answer(true)} className={cn('py-3 rounded-2xl text-sm font-bold text-white cursor-pointer', confirm.danger ? 'bg-red-500' : 'bg-purple-600')}>{confirm.confirmText || '확인'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {choose && (
          <div className="fixed inset-0 z-[610] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={choose.title || '고르기'}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/45" onClick={() => pick(null)} />
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="sheet-fill relative w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-4 shadow-2xl"
            >
              <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
              {choose.title && <p className="px-1 text-[15px] font-bold text-zinc-900 dark:text-white line-clamp-2 break-keep">{choose.title}</p>}
              {choose.message && <p className="px-1 mt-0.5 text-xs text-zinc-500 break-keep">{choose.message}</p>}
              <div className="mt-3 space-y-1.5">
                {choose.options.map((o) => {
                  const I = o.icon ? OptIcon[o.icon] : null;
                  return (
                    <button key={o.value} type="button" onClick={() => pick(o.value)} className={cn('w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left cursor-pointer bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/70 dark:hover:bg-zinc-800', o.danger && 'text-red-600')}>
                      {I && <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', o.danger ? 'bg-red-100 dark:bg-red-950/50' : 'bg-white dark:bg-zinc-900')}><I className="w-4 h-4" /></span>}
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{o.label}</span>
                        {o.desc && <span className="block text-[11.5px] text-zinc-500 break-keep">{o.desc}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => pick(null)} className="mt-2 w-full py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer">취소</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
