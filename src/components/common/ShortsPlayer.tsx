import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Volume2, VolumeX, X } from 'lucide-react';
import { extractYoutubeId } from '../../utils/urlUtils';
import { PlaySquare, YoutubeLogo } from './MediaIcons';

/**
 * 유튜브 앱처럼 전체 화면으로 보는 쇼츠
 * - 위아래로 밀면(데스크톱은 휠·방향키) 목록 순서대로 이전·다음 쇼츠
 * - 화면을 톡 누르면 일시정지/재생, 끝나면 처음부터 반복
 * - 플레이어 하나를 계속 쓰면서 영상만 바꿈 (한 번 소리를 켜면 다음 쇼츠도 소리 나게, 휴대폰 자동재생 제한 때문)
 */
export type ShortsPlayerItem = { url: string; title?: string; caption?: string; liveUrl?: string; editUrl?: string };

const SWIPE_PX = 60;

export function ShortsPlayer({ items, startIndex, onClose }: { items: ShortsPlayerItem[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.min(Math.max(0, startIndex), items.length - 1));
  const [drag, setDrag] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  // 다음 쇼츠로 넘어가는 동안은 플레이어를 숨기고 썸네일을 보여 줌 (이전 영상이 잠깐 보이지 않게)
  const [switching, setSwitching] = useState(true);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // 화면 비율이 9:16 보다 길쭉한 휴대폰(아이폰 등)에서도 위아래 검은 여백 없이 꽉 차게 (양옆을 조금 잘라 채움)
  const [cover, setCover] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const w = Math.max(W, H * 9 / 16);
      setCover({ w, h: w * 16 / 9 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const touchRef = useRef<{ y: number; x: number; t: number; moved: boolean } | null>(null);
  const wheelLock = useRef(0);
  const firstId = useRef(extractYoutubeId(items[index]?.url || '') || '');
  const loadedId = useRef(firstId.current);

  const idOf = (i: number) => extractYoutubeId(items[i]?.url || '') || '';
  const cur = items[index];

  const command = useCallback((func: string, args: any[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  // 플레이어 이벤트 받기 (끝나면 처음부터 다시)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.origin !== 'string' || !e.origin.includes('youtube')) return;
      let d: any;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d?.event === 'onReady') setReady(true);
      const state = d?.event === 'onStateChange' ? d.info : d?.event === 'infoDelivery' ? d.info?.playerState : undefined;
      if (state === 0) { command('seekTo', [0, true]); command('playVideo'); }
      if (state === 1) { setPaused(false); setSwitching(false); }
      if (state === 2) setPaused(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [command]);

  // 바뀐 쇼츠 불러오기
  useEffect(() => {
    const id = idOf(index);
    if (!id || id === loadedId.current) return;
    loadedId.current = id;
    setSwitching(true);
    command('loadVideoById', [id, 0]);
    setPaused(false);
    const t = window.setTimeout(() => setSwitching(false), 2500);
    return () => window.clearTimeout(t);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => {
      const n = i + dir;
      if (n < 0 || n >= items.length) return i;
      setAnimating(true);
      return n;
    });
    setDrag(0);
  }, [items.length]);

  // 뒤로가기 버튼으로 닫기 + 화면 스크롤 막기 + 키보드
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ shortsPlayer: true }, '');
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.history.back();
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => window.history.back(); // popstate 에서 onClose

  const togglePlay = () => {
    if (pausedRef.current) command('playVideo'); else command('pauseVideo');
    setPaused((p) => !p);
  };
  const toggleMute = () => {
    if (muted) { command('unMute'); command('setVolume', [100]); command('playVideo'); }
    else command('mute');
    setMuted((m) => !m);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { y: t.clientY, x: t.clientX, t: Date.now(), moved: false };
    setAnimating(false);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    const dy = e.touches[0].clientY - s.y;
    if (Math.abs(dy) > 8) s.moved = true;
    // 처음·끝에서는 살짝만 끌림
    const atEdge = (dy > 0 && index === 0) || (dy < 0 && index === items.length - 1);
    setDrag(atEdge ? dy * 0.25 : dy);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const dy = e.changedTouches[0].clientY - s.y;
    const fast = Date.now() - s.t < 250 && Math.abs(dy) > 25;
    if (!s.moved) { setDrag(0); togglePlay(); return; }
    setAnimating(true);
    if (dy < -SWIPE_PX || (fast && dy < 0)) go(1);
    else if (dy > SWIPE_PX || (fast && dy > 0)) go(-1);
    else setDrag(0);
  };
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - wheelLock.current < 600 || Math.abs(e.deltaY) < 20) return;
    wheelLock.current = now;
    go(e.deltaY > 0 ? 1 : -1);
  };

  if (!cur) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `https://www.youtube.com/embed/${firstId.current}?autoplay=1&playsinline=1&mute=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  const translate = `translateY(calc(${-index * 100}% + ${drag}px))`;

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black text-white select-none" role="dialog" aria-modal="true" aria-label="쇼츠 보기">
      <div className="absolute inset-0 flex justify-center">
        <div ref={stageRef} className="relative h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] overflow-hidden">
          {/* 쇼츠 썸네일 줄 (끌 때 다음·이전이 보이게) */}
          <div
            className="absolute inset-0"
            style={{ transform: translate, transition: animating ? 'transform 320ms cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none' }}
            onTransitionEnd={() => setAnimating(false)}
          >
            {items.map((it, i) => {
              if (Math.abs(i - index) > 2) return null;
              const id = idOf(i);
              return (
                <div key={`${id}-${i}`} className="absolute inset-x-0 h-full" style={{ top: `${i * 100}%` }}>
                  {id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-80" />}
                </div>
              );
            })}
          </div>

          {/* 실제 재생은 플레이어 하나 (현재 쇼츠 자리에, 끌면 같이 움직임) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ transform: `translateY(${drag}px)`, transition: 'opacity 150ms', opacity: switching || animating ? 0 : 1 }}
          >
            <iframe
              ref={iframeRef}
              src={src}
              title={cur.title || '쇼츠'}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
              style={cover ? { width: cover.w, height: cover.h } : { width: '100%', height: '100%' }}
              allow="autoplay; encrypted-media; picture-in-picture"
              onLoad={() => {
                iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'uzuhama-shorts' }), '*');
                setReady(true);
                window.setTimeout(() => setSwitching(false), 1200);
              }}
            />
          </div>

          {/* 밀기·누르기를 받는 투명 막 (플레이어가 손가락을 가로채지 않게) */}
          <div
            className="absolute inset-0 touch-none cursor-pointer"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            onClick={(e) => { if (e.detail > 0 && !('ontouchstart' in window)) togglePlay(); }}
          />

          {paused && ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-16 h-16 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 ml-1" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5z" /></svg>
              </span>
            </div>
          )}

          {/* 위: 닫기, 소리 */}
          <div className="absolute top-0 inset-x-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
            <button type="button" onClick={close} className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center cursor-pointer" aria-label="닫기">
              <X className="w-5 h-5" />
            </button>
            <span className="text-xs font-semibold text-white/80 tabular-nums">{index + 1} / {items.length}</span>
            <button type="button" onClick={toggleMute} className="h-10 px-3 rounded-full bg-black/35 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer" aria-label={muted ? '소리 켜기' : '소리 끄기'}>
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              {muted && <span>소리 켜기</span>}
            </button>
          </div>

          {/* 아래: 제목·날짜·링크 */}
          <div className="absolute bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none">
            <p className="text-[15px] font-bold leading-snug line-clamp-2 break-keep">{cur.title || '유튜브 쇼츠'}</p>
            {cur.caption && <p className="mt-1 text-xs text-white/70">{cur.caption}</p>}
            <div className="mt-3 flex items-center gap-2 pointer-events-auto">
              {cur.liveUrl && (
                <a href={cur.liveUrl} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-full bg-white/15 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold">
                  <PlaySquare className="w-4 h-4" /> 생방송
                </a>
              )}
              {cur.editUrl && (
                <a href={cur.editUrl} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-full bg-white/15 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold">
                  <YoutubeLogo className="w-4 h-4" /> 편집본
                </a>
              )}
              <a href={`https://www.youtube.com/shorts/${idOf(index)}`} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-full bg-white/15 backdrop-blur-md flex items-center text-xs font-semibold">
                유튜브에서 보기
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 데스크톱: 위·아래 버튼 */}
      <div className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 flex-col gap-3">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center cursor-pointer" aria-label="이전 쇼츠">
          <ChevronUp className="w-6 h-6" />
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === items.length - 1} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center cursor-pointer" aria-label="다음 쇼츠">
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>
    </div>,
    document.body
  );
}
