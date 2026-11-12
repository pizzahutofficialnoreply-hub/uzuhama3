import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, animate, useMotionValue, useMotionValueEvent } from 'motion/react';
import { cn } from '../../utils';

/**
 * 밀어서 간편 메뉴 (iOS 메시지 목록처럼)
 *  - ← 로 밀면 오른쪽에 right 버튼들, → 로 밀면 왼쪽에 left 버튼들
 *  - 반쯤 밀고 놓으면 버튼이 열린 채로 멈춤 → 눌러서 실행
 *  - 끝까지 밀면 끝 버튼(← 쪽은 맨 오른쪽, → 쪽은 맨 왼쪽)이 넓어지며 나머지는 작아지고 흐려짐 → 놓으면 실행
 *  - 끝까지 밀린 순간 진동 (안드로이드)
 *  - 터치 화면에서만 (마우스는 ⋮ 메뉴로)
 */
export type SwipeAction = {
  key: string;
  label: string;
  icon: ReactNode;
  /** 버튼 색 (배경·글자) */
  tone: string;
  onRun: () => void;
};

const BTN_W = 66;
const GAP = 8;
const OPEN_EVENT = 'uzuhama-swipe-open';
let seq = 0;

const buzz = () => { try { (navigator as any).vibrate?.(12); } catch { /* */ } };

function blocked(t: EventTarget | null, root: HTMLElement): boolean {
  let n = t as HTMLElement | null;
  while (n && n !== root) {
    if (n.matches?.('iframe,input,textarea,select,[data-no-swipe],[role="slider"]')) return true;
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    n = n.parentElement;
  }
  return false;
}

export function SwipeRow({ left = [], right = [], radius = 24, disabled = false, className, children, label = '항목' }: {
  left?: SwipeAction[];
  right?: SwipeAction[];
  /** 버튼 곡률 = 카드 곡률 */
  radius?: number;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [dx, setDx] = useState(0);
  const [h, setH] = useState(0);
  const [w, setW] = useState(0);
  const [armed, setArmed] = useState<0 | -1 | 1>(0);
  const id = useRef(++seq);
  const st = useRef<{ x0: number; y0: number; base: number; dir: 0 | 1 | 2; moved: boolean } | null>(null);
  const openAt = useRef(0);
  const armedRef = useRef<0 | -1 | 1>(0);
  const armedChanged = useRef(false);
  const armedAt = useRef(0);
  const prevArmed = useRef<0 | -1 | 1>(0);
  if (prevArmed.current !== armed) { prevArmed.current = armed; armedAt.current = performance.now(); }
  armedChanged.current = performance.now() - armedAt.current < 280;

  useMotionValueEvent(x, 'change', (v) => setDx(v));

  const RW = right.length * BTN_W + (right.length + 1) * GAP;
  const LW = left.length * BTN_W + (left.length + 1) * GAP;
  const full = (n: number) => Math.max(n + 70, w * 0.58);

  const settle = (to: number) => {
    openAt.current = to;
    animate(x, to, { type: 'spring', stiffness: 520, damping: 44 });
    if (to !== 0) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id.current }));
  };

  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== id.current && openAt.current !== 0) settle(0); };
    window.addEventListener(OPEN_EVENT, other);
    return () => window.removeEventListener(OPEN_EVENT, other);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || disabled || (!left.length && !right.length)) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target, el)) { st.current = null; return; }
      const t = e.touches[0];
      // 화면 왼쪽 끝은 브라우저 '뒤로 가기' 몸짓
      if (t.clientX < 18 && openAt.current === 0) { st.current = null; return; }
      const r = el.getBoundingClientRect();
      setH(r.height); setW(r.width);
      x.stop();
      st.current = { x0: t.clientX, y0: t.clientY, base: x.get(), dir: 0, moved: false };
    };
    const move = (e: TouchEvent) => {
      const s = st.current;
      if (!s) return;
      const t = e.touches[0];
      const ddx = t.clientX - s.x0, ddy = t.clientY - s.y0;
      if (s.dir === 0) {
        if (Math.abs(ddy) > 9 && Math.abs(ddy) > Math.abs(ddx)) { s.dir = 2; return; }
        if (Math.abs(ddx) > 9 && Math.abs(ddx) > Math.abs(ddy) * 1.2) s.dir = 1;
        else return;
      }
      if (s.dir !== 1) return;
      if (e.cancelable) e.preventDefault();
      s.moved = true;
      let nx = s.base + ddx;
      const width = el.getBoundingClientRect().width;
      if (nx < 0 && !right.length) nx = nx / 6;
      if (nx > 0 && !left.length) nx = nx / 6;
      nx = Math.max(-width, Math.min(width, nx));
      x.set(nx);
      const a: 0 | -1 | 1 = nx <= -full(RW) && right.length ? -1 : nx >= full(LW) && left.length ? 1 : 0;
      if (a !== armedRef.current) { if (a) buzz(); armedRef.current = a; setArmed(a); }
    };
    const end = () => {
      const s = st.current;
      st.current = null;
      if (!s || s.dir !== 1) return;
      const v = x.get();
      const a = armedRef.current;
      armedRef.current = 0;
      if (a === -1) { const act = right[right.length - 1]; settle(0); window.setTimeout(() => setArmed(0), 250); act.onRun(); return; }
      if (a === 1) { const act = left[0]; settle(0); window.setTimeout(() => setArmed(0), 250); act.onRun(); return; }
      setArmed(0);
      if (v < 0 && right.length) settle(v < -RW / 2 ? -RW : 0);
      else if (v > 0 && left.length) settle(v > LW / 2 ? LW : 0);
      else settle(0);
    };
    // 밀고 난 뒤의 클릭, 열린 상태에서 카드를 누르면 닫기만
    const click = (e: MouseEvent) => {
      if (openAt.current !== 0 && !(e.target as HTMLElement).closest('[data-swipe-btn]')) {
        e.preventDefault(); e.stopPropagation(); settle(0);
      }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('click', click, true);
    };
  }); // 매번 최신 actions 사용

  const btnH = Math.max(52, Math.min(84, h - 16));
  const side = (acts: SwipeAction[], sideDir: -1 | 1) => {
    const shown = sideDir === -1 ? Math.max(0, -dx) : Math.max(0, dx);
    if (shown <= 0) return null;
    const isArmed = armed === sideDir;
    const fullKey = sideDir === -1 ? acts[acts.length - 1]?.key : acts[0]?.key;
    const total = acts.length * BTN_W + (acts.length + 1) * GAP;
    const scale = Math.min(1, shown / total); // 0~1
    const growW = Math.max(BTN_W, shown - 2 * GAP - (acts.length - 1) * (BTN_W * 0.6 + GAP));
    return (
      <div
        className={cn('absolute inset-y-0 flex items-center', sideDir === -1 ? 'right-0 justify-end' : 'left-0 justify-start')}
        style={{ width: shown, gap: GAP, paddingLeft: GAP, paddingRight: GAP }}
        aria-hidden={openAt.current === 0}
      >
        {acts.map((a) => {
          const isFull = a.key === fullKey;
          const grow = isArmed && isFull;
          const fade = isArmed && !isFull;
          return (
            <button
              key={a.key}
              type="button"
              data-swipe-btn
              tabIndex={openAt.current === 0 ? -1 : 0}
              onClick={(e) => { e.stopPropagation(); settle(0); a.onRun(); }}
              className={cn('shrink-0 flex flex-col items-center justify-center gap-1 overflow-hidden font-bold text-[11.5px] shadow-sm cursor-pointer', a.tone)}
              style={{
                height: btnH,
                width: grow ? growW : fade ? BTN_W * 0.6 : BTN_W,
                borderRadius: radius,
                opacity: fade ? 0.25 : Math.min(1, scale * 1.4),
                transform: `scale(${fade ? 0.6 : 0.7 + 0.3 * scale})`,
                // 끝까지 밀었을 때 넓어지고 줄어드는 것만 부드럽게 (손가락 따라가는 건 바로)
                transition: armedChanged.current ? 'width .24s cubic-bezier(.2,.8,.2,1), opacity .2s, transform .24s cubic-bezier(.2,.8,.2,1)' : 'none',
                willChange: 'width, transform, opacity',
              }}
              aria-label={a.label}
            >
              <span className="[&>svg]:w-5 [&>svg]:h-5">{a.icon}</span>
              <span className="whitespace-nowrap">{a.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={root} data-swipe-row className={cn("relative", className)} style={{ touchAction: "pan-y" }} aria-roledescription={`${label} · 옆으로 밀어서 메뉴`}>
      {side(left, 1)}
      {side(right, -1)}
      <motion.div style={{ x }} className="relative h-full">
        {children}
      </motion.div>
    </div>
  );
}
