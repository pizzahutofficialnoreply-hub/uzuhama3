/**
 * 길게 눌러 2배속 (유튜브 앱처럼) · 쇼츠·긴 영상 공용
 *  - 가장자리를 꾹 누르면 2배속 + 아래 안내 '↓ 2배속을 고정하려면 아래로 당기세요'
 *  - 누른 채 아래로 당기면 '2배속을 고정하려면 놓으세요' → 놓으면 고정 (위에 '2배속' 표시, 누르면 해제)
 *  - 고정 중 다시 꾹 눌러 아래로 당겼다 놓으면 끝
 *  - 손을 그냥 떼면(고정 안 함) 원래 속도
 * command: 유튜브 퍼가기 재생기에 명령 보내기 (setPlaybackRate 등)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsRight, ArrowDown, Lock } from 'lucide-react';
import { triggerHaptic, iosHaptic } from '../../utils/haptics';

type Hint = null | 'lock' | 'release-lock' | 'end' | 'release-end';
const PULL_PX = 60;

export function useSpeedHold(command: (func: string, args?: any[]) => void) {
  const [rate, setRate] = useState(1);
  const [locked, setLocked] = useState(false);
  const [hint, setHint] = useState<Hint>(null);
  const lockedRef = useRef(false); lockedRef.current = locked;
  const hintRef = useRef<Hint>(null); hintRef.current = hint;
  const st = useRef<{ y: number } | null>(null);
  const tick = () => { iosHaptic(); triggerHaptic(12); };

  const begin = useCallback((y: number) => {
    st.current = { y };
    tick();
    if (!lockedRef.current) { command('setPlaybackRate', [2]); setRate(2); setHint('lock'); }
    else setHint('end');
  }, [command]);
  /** 누르는 중이면 true (그 손가락 움직임은 여기서 씀) */
  const move = useCallback((y: number) => {
    if (!st.current) return false;
    const pulled = y - st.current.y > PULL_PX;
    const next: Hint = lockedRef.current ? (pulled ? 'release-end' : 'end') : (pulled ? 'release-lock' : 'lock');
    if (next !== hintRef.current) { if (pulled) tick(); setHint(next); }
    return true;
  }, []);
  const end = useCallback(() => {
    if (!st.current) return false;
    st.current = null;
    const h = hintRef.current;
    if (h === 'release-lock') setLocked(true);
    else if (h === 'release-end' || !lockedRef.current) { setLocked(false); command('setPlaybackRate', [1]); setRate(1); }
    setHint(null);
    return true;
  }, [command]);
  const unlock = useCallback(() => { setLocked(false); command('setPlaybackRate', [1]); setRate(1); }, [command]);
  /** 영상이 바뀌거나 다시 재생될 때 (재생기가 속도를 1로 되돌림) */
  const reapply = useCallback(() => { if (lockedRef.current) command('setPlaybackRate', [2]); }, [command]);
  const active = () => Boolean(st.current);
  // '2배속' 알약: 누르는 동안·고정 직후에만 보이고 2.5초 지나면 사라짐 (영상을 계속 가리지 않게)
  //  고정 중 다시 꾹 누르면 또 보임 (그때 아래로 당겨 끄거나 알약을 눌러 끔)
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (rate !== 2) { setPeek(false); return; }
    setPeek(true);
    if (hint) return;
    const t = window.setTimeout(() => setPeek(false), 2500);
    return () => window.clearTimeout(t);
  }, [rate, locked, hint]);

  const ui = (
    <>
      {rate === 2 && (
        <button type="button" onClick={locked ? unlock : undefined} data-hidden={peek ? undefined : ''}
          className="transition-opacity duration-300 data-[hidden]:opacity-0 data-[hidden]:pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+60px)] -translate-x-1/2 z-30 h-8 px-3 rounded-full bg-black/60 backdrop-blur-md text-white text-[length:calc(13px*var(--fs,1))] font-bold flex items-center gap-1 cursor-pointer"
          aria-label={locked ? '2배속 고정 해제' : '2배속'}>
          2배속 <ChevronsRight className="w-4 h-4" />{locked && <Lock className="w-3.5 h-3.5 opacity-80" />}
        </button>
      )}
      {hint && (
        <div className="absolute inset-x-0 top-[62%] z-30 flex justify-center pointer-events-none">
          <span className="px-3.5 py-2 rounded-full bg-black/65 backdrop-blur-md text-white text-[length:calc(13px*var(--fs,1))] font-semibold flex items-center gap-1.5">
            {hint === 'lock' && <><ArrowDown className="w-4 h-4" />2배속을 고정하려면 아래로 당기세요</>}
            {hint === 'release-lock' && <><Lock className="w-4 h-4" />2배속을 고정하려면 놓으세요</>}
            {hint === 'end' && <><ArrowDown className="w-4 h-4" />2배속을 끝내려면 아래로 당기세요</>}
            {hint === 'release-end' && <>2배속을 끝내려면 손을 떼세요</>}
          </span>
        </div>
      )}
    </>
  );
  return { rate, locked, begin, move, end, unlock, reapply, active, ui };
}

const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

/** 쇼츠 아래 진행바: 끌어서 원하는 곳으로 (끄는 동안 시간 표시, 화면도 따라감) */
export function ScrubBar({ cur, dur, onSeek, className }: { cur: number; dur: number; onSeek: (t: number, final: boolean) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const last = useRef(0);
  const at = (x: number) => { const r = ref.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * dur; };
  const p = dur > 0 ? ((drag ?? cur) / dur) * 100 : 0;
  if (!(dur > 0)) return null;
  return (
    <div ref={ref} className={'absolute inset-x-0 z-20 h-7 flex items-end touch-none ' + (className || '')}
      onTouchStart={(e) => { e.stopPropagation(); const t = at(e.touches[0].clientX); setDrag(t); }}
      onTouchMove={(e) => { e.stopPropagation(); const t = at(e.touches[0].clientX); setDrag(t); const now = Date.now(); if (now - last.current > 180) { last.current = now; onSeek(t, false); } }}
      onTouchEnd={(e) => { e.stopPropagation(); if (drag !== null) onSeek(drag, true); setDrag(null); }}
      onMouseDown={(e) => { e.stopPropagation(); const t = at(e.clientX); onSeek(t, true); }}
      role="slider" aria-label="재생 위치" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(drag ?? cur)}>
      {drag !== null && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-10 px-3 py-1.5 rounded-xl bg-black/70 text-white text-[length:calc(15px*var(--fs,1))] font-bold tabular-nums pointer-events-none">
          {fmt(drag)} <span className="text-white/60 font-semibold">/ {fmt(dur)}</span>
        </span>
      )}
      <div className={'relative w-full transition-[height] duration-150 ' + (drag !== null ? 'h-1.5' : 'h-[3px]')} style={{ background: 'rgba(255,255,255,.28)' }}>
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${p}%` }} />
        {drag !== null && <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white" style={{ left: `${p}%` }} />}
      </div>
    </div>
  );
}

/**
 * 긴 영상(카드 확장 재생기) 양옆 가장자리: 유튜브 앱처럼
 *  - 꾹 누르기 → 2배속 (아래로 당겨 고정) · 두 번 톡 → 10초 뒤로/앞으로 · 한 번 톡 → 재생/일시정지
 *  - 가운데·아래 조작 막대는 유튜브 재생기 그대로 (덮지 않음)
 */
export function EdgeSpeedZones({ command }: { command: (func: string, args?: any[]) => void }) {
  const speed = useSpeedHold(command);
  const tm = useRef({ cur: 0 });
  const playing = useRef(true);
  const [flash, setFlash] = useState<null | { side: 'l' | 'r'; n: number }>(null);
  // 재생 위치·상태 받기
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (typeof e.origin !== 'string' || !e.origin.includes('youtube')) return;
      let d: any; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d?.event === 'infoDelivery') {
        if (typeof d.info?.currentTime === 'number') tm.current.cur = d.info.currentTime;
        if (typeof d.info?.playerState === 'number') { playing.current = d.info.playerState === 1; if (d.info.playerState === 1) speed.reapply(); }
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [speed.reapply]);
  const zone = (side: 'l' | 'r') => {
    let timer = 0, sy = 0, long = false, lastTap = 0, single = 0, moved = false;
    return {
      onTouchStart: (e: React.TouchEvent) => {
        e.stopPropagation(); long = false; moved = false; sy = e.touches[0].clientY;
        const y = sy;
        timer = window.setTimeout(() => { long = true; speed.begin(y); }, 400);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (long) { speed.move(e.touches[0].clientY); return; }
        if (Math.abs(e.touches[0].clientY - sy) > 10) { moved = true; clearTimeout(timer); }
      },
      onTouchEnd: (e: React.TouchEvent) => {
        e.preventDefault(); clearTimeout(timer);
        if (long) { speed.end(); return; }
        if (moved) return;
        const now = Date.now();
        if (now - lastTap < 300) {
          // 두 번 톡: 10초
          clearTimeout(single); lastTap = 0;
          const t = Math.max(0, tm.current.cur + (side === 'r' ? 10 : -10));
          command('seekTo', [t, true]); tm.current.cur = t;
          setFlash({ side, n: Date.now() }); window.setTimeout(() => setFlash(null), 600);
        } else {
          lastTap = now;
          single = window.setTimeout(() => { command(playing.current ? 'pauseVideo' : 'playVideo'); playing.current = !playing.current; }, 300);
        }
      },
    };
  };
  const L = useState(() => zone('l'))[0];
  const R = useState(() => zone('r'))[0];
  return (
    <>
      <div className="absolute left-0 top-[12%] bottom-[56px] w-[18%] z-10 touch-none" {...L} aria-hidden />
      <div className="absolute right-0 top-[12%] bottom-[56px] w-[18%] z-10 touch-none" {...R} aria-hidden />
      {flash && (
        <span className={'absolute top-1/2 -translate-y-1/2 z-20 px-3 py-1.5 rounded-full bg-black/55 text-white text-xs font-bold pointer-events-none ' + (flash.side === 'l' ? 'left-[6%]' : 'right-[6%]')}>
          {flash.side === 'l' ? '« 10초' : '10초 »'}
        </span>
      )}
      <div className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto">{speed.ui}</div>
    </>
  );
}
