import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/**
 * 헤더 제목 장식 이스터에그: 장식을 빠르게 세 번 누르면 위에 팝업
 *  - exam (수능): 시험지 모양 쪽지에 '수능 화이팅!!' (관리자가 쓴 말 · 없으면 기본 말)
 *  - pumpkin (할로윈): 호박등이 튀어나옴 → 누르면 불이 켜졌다 꺼졌다
 *  - moon (추석·설·정월대보름): 보름달이 떠오름 → 누르면 소원 별이 반짝
 *  - party (주년·생일): 색종이가 터지며 축하 말
 */
export type EggKind = 'exam' | 'pumpkin' | 'moon' | 'party';
const LINE = '#1f1a24';

/** 빠르게 세 번 누르면 true (1.6초 안에) */
export function useTripleTap(onEgg: () => void) {
  const taps = useRef<number[]>([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1600), now];
    if (taps.current.length >= 3) { taps.current = []; onEgg(); }
  };
}

/** 호박등 (작은 장식 · 팝업 공용) */
export function Pumpkin({ lit = true, className }: { lit?: boolean; className?: string }) {
  const face = lit ? '#ffd54a' : '#3b2412';
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" style={{ overflow: 'visible' }}>
      {lit && <ellipse cx="32" cy="38" rx="30" ry="24" fill="#ffb02e" opacity=".22" className="egg-glow" />}
      <path d="M31 14 Q 30 8 35 5" fill="none" stroke={LINE} strokeWidth="5.4" strokeLinecap="round" />
      <path d="M31 14 Q 30 8 35 5" fill="none" stroke="#5a9e3a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="20" cy="37" rx="12" ry="19" fill="#f07a16" stroke={LINE} strokeWidth="2.6" />
      <ellipse cx="44" cy="37" rx="12" ry="19" fill="#f07a16" stroke={LINE} strokeWidth="2.6" />
      <ellipse cx="32" cy="37" rx="12.5" ry="20" fill="#ff8f26" stroke={LINE} strokeWidth="2.6" />
      <g className={lit ? 'egg-flicker' : undefined}>
        <path d="M20 31 L26 24 L29 33 Z" fill={face} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M44 31 L38 24 L35 33 Z" fill={face} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M30 35 L34 35 L32 39 Z" fill={face} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M17 42 Q 32 54 47 42 L43 44 L41 41 L37 46 L34 42 L30 46 L27 41 L24 45 L21 41 Z" fill={face} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 보름달 (작은 장식 · 팝업 공용) */
export function Moon({ className, rabbit = false }: { className?: string; rabbit?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" style={{ overflow: 'visible' }}>
      <circle cx="32" cy="32" r="30" fill="#fff3b0" opacity=".18" className="egg-glow" />
      <circle cx="32" cy="32" r="22" fill="#ffe680" stroke={LINE} strokeWidth="2.6" />
      <circle cx="24" cy="25" r="4" fill="#f4cf5c" />
      <circle cx="39" cy="37" r="5.5" fill="#f4cf5c" />
      <circle cx="27" cy="42" r="2.6" fill="#f4cf5c" />
      <circle cx="41" cy="23" r="2" fill="#f4cf5c" />
      {rabbit && (
        <g fill="#e2b93f" opacity=".85">
          <ellipse cx="34" cy="31" rx="6" ry="4.6" />
          <ellipse cx="30" cy="25" rx="1.6" ry="5" transform="rotate(-15 30 25)" />
          <ellipse cx="33" cy="24.5" rx="1.6" ry="5" transform="rotate(10 33 24.5)" />
          <rect x="39" y="31" width="7" height="2" rx="1" transform="rotate(-35 39 31)" />
          <path d="M40 38 h8 l-1.5 5 h-5 z" />
        </g>
      )}
    </svg>
  );
}

const DEFAULT_MSG: Record<EggKind, string> = {
  exam: '수능 화이팅!!',
  pumpkin: 'Trick or Treat!',
  moon: '보름달처럼 꽉 찬 하루 보내세요',
  party: '축하해요!',
};

function Paper({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div className="relative w-[280px] rounded-[6px] bg-[#fffef8] text-zinc-900 shadow-[0_18px_40px_-10px_rgba(0,0,0,.55)] overflow-hidden" style={{ transform: 'rotate(-2deg)' }}>
      <div className="px-4 py-2 bg-[#dbe9ff] border-b-2 border-[#1f1a24] flex items-center justify-between">
        <span className="text-[length:calc(11px*var(--fs,1))] font-black tracking-tight">대학수학능력시험 · 응원 영역</span>
        <span className="text-[length:calc(10px*var(--fs,1))] font-bold text-zinc-500">제 1 교시</span>
      </div>
      <div className="relative px-5 pt-4 pb-6" style={{ backgroundImage: 'repeating-linear-gradient(transparent 0 27px, #c9d6ea 27px 28px)' }}>
        <p className="text-[length:calc(34px*var(--fs,1))] leading-[56px] text-[#1f3f8f] break-keep" style={{ fontFamily: "'Nanum Pen Script', cursive" }}>{msg}</p>
        {sub && <p className="text-[length:calc(20px*var(--fs,1))] leading-[28px] text-zinc-600 break-keep" style={{ fontFamily: "'Nanum Pen Script', cursive" }}>{sub}</p>}
        <motion.span initial={{ scale: 2.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: -14 }} transition={{ delay: 0.45, type: 'spring', stiffness: 380, damping: 14 }}
          className="absolute right-3 bottom-3 w-[66px] h-[66px] rounded-full border-[3px] border-[#e8344f] text-[#e8344f] flex items-center justify-center text-[length:calc(20px*var(--fs,1))] font-black" style={{ fontFamily: "'Black Han Sans', sans-serif" }}>합격</motion.span>
      </div>
    </div>
  );
}

export function EggPopup({ kind, message, sub, hero, onClose }: { kind: EggKind; message?: string; sub?: string; hero?: React.ReactNode; onClose: () => void }) {
  const [lit, setLit] = useState(true);
  const [wish, setWish] = useState(0);
  useEffect(() => {
    loadFont('Nanum Pen Script'); loadFont('Jua'); loadFont('Black Han Sans', '합격');
    const t = window.setTimeout(onClose, kind === 'pumpkin' || kind === 'moon' ? 12000 : 6000);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [kind, wish, lit]); // eslint-disable-line react-hooks/exhaustive-deps
  const msg = message?.trim() || DEFAULT_MSG[kind];
  return createPortal(
    <motion.div className="fixed inset-0 z-[360] flex items-start justify-center pt-[calc(76px+env(safe-area-inset-top))]" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="title-egg">
      <div className="absolute inset-0 bg-black/30" />
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: -30, scale: 0.6, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -20, scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 20 }} className="relative flex flex-col items-center">
        {kind === 'exam' && <Paper msg={msg} sub={sub} />}
        {kind === 'pumpkin' && (
          <button type="button" onClick={() => setLit((v) => !v)} className="flex flex-col items-center cursor-pointer" aria-label={lit ? '호박등 불 끄기' : '호박등 불 켜기'}>
            <Pumpkin lit={lit} className="w-44 h-44 drop-shadow-xl" />
            <span className="mt-1 px-3 py-1 rounded-full bg-zinc-900/85 text-white text-[length:calc(13px*var(--fs,1))] font-bold">{lit ? msg : '불이 꺼졌어요… 다시 눌러 보세요'}</span>
          </button>
        )}
        {kind === 'moon' && (
          <button type="button" onClick={() => setWish((n) => n + 1)} className="relative flex flex-col items-center cursor-pointer" aria-label="소원 빌기">
            <motion.span initial={{ y: 60 }} animate={{ y: 0 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}><Moon rabbit className="w-48 h-48" /></motion.span>
            <AnimatePresence>
              {wish > 0 && Array.from({ length: 7 }, (_, i) => (
                <motion.span key={`${wish}-${i}`} initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }} animate={{ opacity: [0, 1, 0], x: Math.cos(i) * 110, y: -40 - (i % 3) * 30, scale: 1 }} transition={{ duration: 1.4, delay: i * 0.05 }}
                  className="absolute top-20 text-[#fff3b0] text-xl" aria-hidden="true">✦</motion.span>
              ))}
            </AnimatePresence>
            <span className="mt-1 px-3 py-1 rounded-full bg-zinc-900/85 text-white text-[length:calc(13px*var(--fs,1))] font-bold break-keep">{wish ? '소원이 달에 닿았어요' : `${msg} · 달을 눌러 소원 빌기`}</span>
          </button>
        )}
        {kind === 'party' && (
          <div className="relative flex flex-col items-center">
            {Array.from({ length: 24 }, (_, i) => (
              <motion.i key={i} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos((i / 24) * Math.PI * 2) * (90 + (i % 3) * 30), y: Math.sin((i / 24) * Math.PI * 2) * (60 + (i % 4) * 20) + 40, opacity: 0, rotate: 360 }} transition={{ duration: 1.6, ease: 'easeOut' }}
                className="absolute top-10 w-2.5 h-1.5 rounded-sm" style={{ background: ['#ff5c93', '#3fb6ff', '#ffcf3a', '#7ed957', '#a78bfa'][i % 5] }} />
            ))}
            {hero && <motion.span initial={{ y: 20, scale: 0.6 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} className="mb-2 text-[length:calc(72px*var(--fs,1))] leading-none">{hero}</motion.span>}
            <span className="px-5 py-3 rounded-2xl bg-white text-zinc-900 text-[length:calc(22px*var(--fs,1))] shadow-xl break-keep" style={{ fontFamily: "'Jua', sans-serif" }}>{msg}</span>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** 구글 글꼴을 그 제목 글자만 조금 받아 옴 (몇 KB) */
const loaded = new Set<string>();
export function loadFont(family: string, text?: string, weight?: number) {
  const key = `${family}|${text || ''}|${weight || ''}`;
  if (!family || loaded.has(key) || typeof document === 'undefined') return;
  loaded.add(key);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${weight ? `:wght@${weight}` : ''}${text ? `&text=${encodeURIComponent(text)}` : ''}&display=swap`;
  document.head.appendChild(l);
}

/** 장식 + 세 번 누르면 팝업 */
export function EggTrigger({ kind, message, sub, children, label, hero }: { kind: EggKind; message?: string; sub?: string; children: React.ReactNode; label?: string; hero?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const tap = useTripleTap(() => setOpen(true));
  return (
    <>
      <span onClick={(e) => { e.stopPropagation(); tap(); }} className="inline-flex cursor-pointer" title={label ? `${label} · 세 번 눌러 보세요` : undefined}>{children}</span>
      <AnimatePresence>{open && <EggPopup kind={kind} message={message} sub={sub} hero={hero} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
