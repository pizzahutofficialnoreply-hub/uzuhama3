import { useEffect, useRef, useState } from 'react';

/**
 * 넘김판 시계 (실제 플립 시계처럼 숫자판이 가운데에서 반으로 접히며 넘어감)
 *  - 위 반쪽(지난 숫자)이 아래로 접혀 내려가고 → 새 숫자의 아래 반쪽이 펼쳐지며 내려앉음
 */
function Half({ ch, pos, anim }: { ch: string; pos: 'top' | 'bottom'; anim?: 'fold' | 'land' }) {
  return (
    <span
      className={`flip-half flip-${pos}${anim ? ` flip-${anim}` : ''} absolute left-0 right-0 overflow-hidden bg-zinc-900 dark:bg-zinc-800 text-white`}
      style={{ height: '50%', top: pos === 'top' ? 0 : '50%', borderRadius: pos === 'top' ? '10px 10px 0 0' : '0 0 10px 10px' }}
    >
      <span className="absolute left-0 right-0 flex items-center justify-center font-black tabular-nums" style={{ height: '200%', top: pos === 'top' ? 0 : '-100%' }}>{ch}</span>
    </span>
  );
}

function FlipDigit({ ch }: { ch: string }) {
  const [cur, setCur] = useState(ch);
  const [prev, setPrev] = useState(ch);
  const [k, setK] = useState(0);
  const curRef = useRef(ch);
  useEffect(() => {
    if (ch === curRef.current) return;
    setPrev(curRef.current);
    curRef.current = ch;
    setCur(ch);
    setK((x) => x + 1);
  }, [ch]);
  return (
    <span className="relative inline-block w-[1.2em] h-[1.55em] mx-[1.5px]" style={{ perspective: '300px' }}>
      <Half ch={cur} pos="top" />
      <Half ch={k ? prev : cur} pos="bottom" />
      {k > 0 && <Half key={`f${k}`} ch={prev} pos="top" anim="fold" />}
      {k > 0 && <Half key={`l${k}`} ch={cur} pos="bottom" anim="land" />}
      {/* 가운데 접히는 선 */}
      <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-black/50 z-10" />
    </span>
  );
}

/** text 의 글자마다 넘김판 하나 */
export function FlipClock({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {text.split('').map((c, i) => <FlipDigit key={i} ch={c} />)}
    </span>
  );
}

/** 남은 시간을 [일] 시간 분 초 넘김판으로 */
export function FlipCountdown({ seconds }: { seconds: number }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts = ([[Math.floor(seconds / 86400), '일'], [Math.floor(seconds / 3600) % 24, '시간'], [Math.floor(seconds / 60) % 60, '분'], [seconds % 60, '초']] as const)
    .filter(([v, u]) => u !== '일' || v > 0);
  return (
    <div className="flex items-start justify-center gap-2.5" aria-label="남은 시간">
      {parts.map(([v, u]) => (
        <div key={u} className="flex flex-col items-center gap-1">
          <FlipClock text={pad(v)} className="text-[30px] sm:text-[36px] leading-none" />
          <span className="text-[12px] font-bold text-zinc-600 dark:text-zinc-300">{u}</span>
        </div>
      ))}
    </div>
  );
}
