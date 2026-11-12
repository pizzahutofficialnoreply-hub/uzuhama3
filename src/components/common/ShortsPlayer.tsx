import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Layers, Volume2, VolumeX, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CompilationDetail } from '../tabs/recommend/CompilationDetail';
import { extractYoutubeId } from '../../utils/urlUtils';
import { cleanShortsTitle } from '../../utils/videoSearch';
import { PlaySquare, YoutubeLogo } from './MediaIcons';
import { openAiCard } from './AiCardExpand';
import { usePrefs } from '../../utils/userPrefs';

/**
 * 유튜브 앱처럼 전체 화면으로 보는 쇼츠
 * - 위아래로 밀면(데스크톱은 휠·방향키) 목록 순서대로 이전·다음 쇼츠
 * - 화면을 톡 누르면 일시정지/재생, 끝나면 처음부터 반복
 * - 플레이어 하나를 계속 쓰면서 영상만 바꿈 (한 번 소리를 켜면 다음 쇼츠도 소리 나게, 휴대폰 자동재생 제한 때문)
 */
export type ShortsPlayerItem = {
  url: string; title?: string; caption?: string; liveUrl?: string; editUrl?: string;
  /** 몰아보기 쇼츠: 연결된 생방송 목록 */
  compilation?: { date: string; games: string[]; liveUrl?: string; editUrl?: string }[];
  /** 몰아보기 펼치기 화면에 넘길 영상 정보 (있으면 사이트의 펼치기 목록과 같은 모양) */
  compilationVideo?: any;
};

const SWIPE_PX = 60;

export function ShortsPlayer({ items, startIndex, onClose, allLogs }: { items: ShortsPlayerItem[]; startIndex: number; onClose: () => void; allLogs?: any }) {

  const [index, setIndex] = useState(Math.min(Math.max(0, startIndex), items.length - 1));
  const [drag, setDrag] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 다음 쇼츠로 넘어가는 동안은 플레이어를 숨기고 썸네일을 보여 줌 (이전 영상이 잠깐 보이지 않게)
  const [switching, setSwitching] = useState(true);
  const pausedRef = useRef(false);
  const labCard = usePrefs().labAiCard;
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
      if (d?.event === 'onReady') { setReady(true); hideCaptions(); }
      const state = d?.event === 'onStateChange' ? d.info : d?.event === 'infoDelivery' ? d.info?.playerState : undefined;
      if (state === 0) { command('seekTo', [0, true]); command('playVideo'); }
      if (state === 1) { setPaused(false); setSwitching(false); hideCaptions(); }
      if (state === 2) setPaused(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [command]);

  // 자막 끄기: 주소 옵션(cc_load_policy=0)만으로는 채널이 자막을 기본으로 켜 둔 영상은 계속 나와서, 자막 모듈을 직접 내림
  const hideCaptions = useCallback(() => {
    command('unloadModule', ['captions']);
    command('unloadModule', ['cc']);
    command('setOption', ['captions', 'track', {}]);
  }, [command]);

  // 바뀐 쇼츠 불러오기
  useEffect(() => {
    const id = idOf(index);
    setSheetOpen(false);
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
  const src = `https://www.youtube.com/embed/${firstId.current}?autoplay=1&playsinline=1&mute=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&cc_lang_pref=xx&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  const translate = `translateY(calc(${-index * 100}% + ${drag}px))`;

  return createPortal(
    // 화면 위에 따로 떠 있어도 React 이벤트는 부모로 올라가므로, 뒤쪽 화면(하위 탭 좌우 밀기)에 손가락이 전달되지 않게 막음
    <div
      className="fixed inset-0 z-[300] bg-black text-white select-none overscroll-none"
      role="dialog" aria-modal="true" aria-label="쇼츠 보기" data-no-swipe
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
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

          {/* 멈췄을 때: 유튜브 재생 버튼 모양 */}
          {paused && ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg viewBox="0 0 68 48" className="w-[68px] h-12 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" aria-hidden="true">
                <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#ff0000" />
                <path d="M45 24 27 14v20" fill="#fff" />
              </svg>
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
            <p className="text-[15px] font-bold leading-snug line-clamp-2 break-keep">{cleanShortsTitle(cur.title) || '유튜브 쇼츠'}</p>
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
              {!!cur.compilation?.length && (
                <button type="button" onClick={() => {
                  // 다른 곳의 '자세히 보기'와 같이 전체 화면으로 펼침 (실험실 끄면 아래에서 올라오는 목록)
                  if (labCard && cur.compilationVideo) {
                    command('pauseVideo'); setPaused(true);
                    const v = cur.compilationVideo;
                    const vid = idOf(index);
                    openAiCard(vid, v.videoTitle || cur.title || '몰아보기', stageRef.current, `몰아보기 · ${cur.compilation?.length || 0}개 방송`, {
                      compilation: true,
                      extra: (closeCard) => <CompilationDetail video={v} allLogs={allLogs} onClose={closeCard} listOnly />,
                    });
                  } else setSheetOpen(true);
                }} className="h-9 px-3 rounded-full bg-purple-600/90 backdrop-blur-md flex items-center gap-1 text-xs font-bold cursor-pointer">
                  <Layers className="w-4 h-4" /> 자세히 보기 · {cur.compilation.length}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 몰아보기 목록: 아래에서 위로 올라오는 판 */}
      <AnimatePresence>
        {sheetOpen && cur.compilation?.length ? (
          <>
            <motion.div
              key="sheet-backdrop"
              className="absolute inset-0 z-20 bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-label="몰아보기 연결 생방송"
              className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[min(100vw,calc(100dvh*9/16))] max-h-[70dvh] flex flex-col rounded-t-[28px] bg-white/95 dark:bg-zinc-950/95 text-zinc-900 dark:text-white backdrop-blur-xl border-t border-zinc-200/70 dark:border-white/10 pb-[env(safe-area-inset-bottom)]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) setSheetOpen(false); }}
            >
              <div className="pt-2.5 pb-1 flex justify-center"><span className="w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-white/25" /></div>
              <div className="px-4 pb-1 flex items-center justify-between">
                <p className="text-sm font-bold line-clamp-1">{cur.title || '몰아보기'}</p>
                <button type="button" onClick={() => setSheetOpen(false)} className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/10 flex items-center justify-center cursor-pointer shrink-0" aria-label="닫기"><X className="w-4 h-4" /></button>
              </div>
              <div className="overflow-y-auto pb-3" onPointerDownCapture={(e) => e.stopPropagation()}>
                {cur.compilationVideo ? (
                  // 사이트의 몰아보기 펼치기와 같은 목록 (위쪽 큰 영상 부분만 뺌)
                  <CompilationDetail video={cur.compilationVideo} allLogs={allLogs} onClose={() => setSheetOpen(false)} listOnly />
                ) : null}
                {!cur.compilationVideo && cur.compilation.map((r) => (
                  <div key={r.date} className="flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-white/5">
                    <div className="w-12 shrink-0 text-center">
                      <p className="text-[10px] text-white/50">{r.date.slice(0, 4)}</p>
                      <p className="text-sm font-black tabular-nums">{r.date.slice(5).replace('-', '.')}</p>
                    </div>
                    <p className="flex-1 min-w-0 text-xs text-white/80 line-clamp-2">{r.games.length ? r.games.join(', ') : '게임 정보 없음'}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.liveUrl && <a href={r.liveUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center" aria-label="생방송 보기"><PlaySquare className="w-4 h-4" /></a>}
                      {r.editUrl && <a href={r.editUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center" aria-label="편집본 보기"><YoutubeLogo className="w-4 h-4" /></a>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

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
