import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown } from 'lucide-react';
import { toast } from '../../utils/ui';

/**
 * 홈 화면에 추가한 앱(PWA)에서 맨 위에서 아래로 당기면 '정보만' 새로고침
 *  - 사파리·크롬 브라우저의 당겨서 새로고침은 브라우저 기능이라, 홈 화면 앱에는 없음 → 여기서 따로
 *  - 페이지를 다시 불러오지 않고 바뀐 기록만 받아서 바꿈 (실시간 확률처럼 원래 알아서 바뀌는 건 그대로)
 *  - 창·시트가 열려 있거나 안쪽 목록이 스크롤된 상태면 동작 안 함
 */
export const DATA_REFRESH_EVENT = 'uzuhama-data-refresh';
const TRIGGER = 72;
const MAX = 110;

const isStandalone = () => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true; } catch { return false; }
};

function scrolledParent(el: EventTarget | null): boolean {
  let n = el as HTMLElement | null;
  while (n && n !== document.body) {
    if (n.scrollTop > 0) return true;
    if (n.closest?.('[role="dialog"],[aria-modal="true"],input,textarea,select,iframe,[data-no-ptr]')) return true;
    n = n.parentElement;
  }
  return false;
}

export default function PullToRefresh({ onRefresh, force = false }: { onRefresh: () => Promise<unknown>; force?: boolean }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = useRef<{ y: number; x: number; on: boolean } | null>(null);
  const busyRef = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!force && !isStandalone()) return;
    const start = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1) return;
      if (window.scrollY > 0 || document.body.style.position === 'fixed' || scrolledParent(e.target)) { st.current = null; return; }
      st.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, on: false };
    };
    const move = (e: TouchEvent) => {
      const s = st.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y;
      const dx = Math.abs(e.touches[0].clientX - s.x);
      if (!s.on) {
        if (dy < 8 || dx > dy) { if (dy < 0 || dx > 12) st.current = null; return; }
        s.on = true;
      }
      if (window.scrollY > 0) { st.current = null; setPull(0); return; }
      const v = Math.min(MAX, Math.max(0, dy * 0.5));
      pullRef.current = v;
      setPull(v);
      if (e.cancelable) e.preventDefault();
    };
    const end = async () => {
      const s = st.current;
      st.current = null;
      if (!s?.on) return;
      const v = pullRef.current;
      pullRef.current = 0;
      if (v < TRIGGER) { setPull(0); return; }
      busyRef.current = true;
      setBusy(true);
      setPull(56);
      try { (navigator as any).vibrate?.(8); } catch { /* */ }
      window.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT));
      try { await Promise.race([onRefresh(), new Promise((r) => setTimeout(r, 12000))]); toast('최신 정보로 바꿨어요', 'success'); } catch { toast('새로 받지 못했어요. 잠시 후 다시 해 주세요', 'error'); }
      busyRef.current = false;
      setBusy(false);
      setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onRefresh, force]);

  if (pull <= 0 && !busy) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className="fixed inset-x-0 top-0 z-[650] flex justify-center pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top)' }} role="status" aria-live="polite" aria-label={busy ? '새로 받는 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}>
      <motion.div
        animate={{ y: Math.min(pull, MAX) - 8, opacity: Math.min(1, pull / 40) }}
        transition={busy ? { type: 'spring', stiffness: 400, damping: 30 } : { duration: 0 }}
        className="mt-1 w-10 h-10 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center"
      >
        {busy ? (
          <span className="w-5 h-5 rounded-full border-2 border-purple-200 border-t-purple-600 animate-spin" />
        ) : (
          <motion.span animate={{ rotate: ready ? 180 : 0 }} className="text-purple-600"><ArrowDown className="w-5 h-5" /></motion.span>
        )}
      </motion.div>
    </div>
  );
}
