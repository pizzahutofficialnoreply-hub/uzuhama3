import { useRef } from 'react';

/**
 * 밑에서 올라오는 창(바텀시트) 맨 위 손잡이: 모든 시트가 같은 모양 · 실제로 끌어내리면 닫힘
 * - 손잡이를 잡고 아래로 끌면 시트가 따라 내려오고, 충분히(90px) 또는 빠르게 내리면 닫힘 / 덜 내리면 제자리로
 * - 위로 끌면 onUp (있으면: 화면 채우기 등)
 * - 넓은 화면(가운데 창)에서는 안 보임
 */
export function SheetHandle({ onClose, onUp, className = '' }: { onClose: () => void; onUp?: () => void; className?: string }) {
  const st = useRef<{ y0: number; t0: number; el: HTMLElement | null; dy: number } | null>(null);
  const move = (y: number) => {
    const s = st.current;
    if (!s?.el) return;
    s.dy = y - s.y0;
    // 위로는 들리지 않음 (위로 끌어 크게 여는 창만 아주 살짝) — 시트가 바닥에서 떠 보이던 것
    const d = s.dy > 0 ? s.dy : onUp ? Math.max(-10, s.dy / 8) : 0;
    // transform 은 등장·퇴장 애니메이션(motion)이 쓰므로, 끌 때는 따로 있는 translate 속성만 씀 (둘이 겹쳐 튀던 문제)
    s.el.style.translate = `0 ${d}px`;
    s.el.style.transition = 'none';
  };
  const end = () => {
    const s = st.current;
    st.current = null;
    if (!s?.el) return;
    const v = s.dy / Math.max(1, Date.now() - s.t0); // px/ms
    const el = s.el;
    el.style.transition = 'translate 220ms cubic-bezier(.2,.8,.2,1)';
    if (s.dy > 90 || v > 0.6) {
      // 손을 뗀 자리에서 그대로 아래로 내려가며 닫힘 (닫히는 동안 위로 튀지 않게 끝날 때까지 기다렸다가 닫기)
      el.style.translate = '0 110%';
      window.setTimeout(() => { onClose(); window.setTimeout(() => { el.style.transition = ''; el.style.translate = ''; }, 600); }, 200);
    } else {
      el.style.translate = '';
      if (onUp && s.dy < -40) onUp();
    }
  };
  return (
    <div
      data-sheet-handle
      className={`sm:hidden flex justify-center pt-1 pb-3 -mt-1 cursor-grab active:cursor-grabbing touch-none select-none ${className}`}
      onPointerDown={(e) => {
        const el = (e.currentTarget.closest('.sheet-fill') as HTMLElement | null);
        st.current = { y0: e.clientY, t0: Date.now(), el, dy: 0 };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => { if (st.current) move(e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
      role="button"
      aria-label="끌어내려 닫기"
    >
      <span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden />
    </div>
  );
}
