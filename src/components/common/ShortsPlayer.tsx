import { cn } from '../../utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, ChevronDown, ChevronUp, EyeOff, Flag, Layers, Link2, Volume2, VolumeX, X } from 'lucide-react';
import { requestReport } from './ItemMenu';
import { requestSave } from '../../utils/myPlaylists';
import { shareTextOrClipboard } from '../../utils/shareUtils';
import { shortsShareText } from './shortsShare';
import { ShareBoxArrowIcon } from './ShareIcon';
import { hideVideo, unhideVideo, useHidden, HIDE_DELAY } from '../../utils/hiddenVideos';
import { toast } from '../../utils/ui';
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
const SOUND_KEY = 'uzuhama_shorts_sound';

export function ShortsPlayer({ items, startIndex, onClose, allLogs, autoNext = false, zIndex }: { items: ShortsPlayerItem[]; startIndex: number; onClose: () => void; allLogs?: any; /** 끝나면 다음 쇼츠로 (연결된 쇼츠 → 추천 쇼츠) */ autoNext?: boolean; zIndex?: number }) {

  const [index, setIndex] = useState(Math.min(Math.max(0, startIndex), items.length - 1));
  const [drag, setDrag] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [muted, setMuted] = useState(true);
  // 소리 켜기를 휴대폰이 막았는지 (아이폰은 영상 화면을 직접 눌러야 소리가 켜짐) → 그땐 다음 한 번 누르기를 영상으로 바로 보냄
  const unmuteAt = useRef(0);
  const [passThrough, setPassThrough] = useState(false);
  useEffect(() => { if (!muted) { setPassThrough(false); try { localStorage.setItem(SOUND_KEY, '1'); } catch { /* */ } } }, [muted]);
  const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 다음 쇼츠로 넘어가는 동안은 플레이어를 숨기고 썸네일을 보여 줌 (이전 영상이 잠깐 보이지 않게)
  const [switching, setSwitching] = useState(true);
  const pausedRef = useRef(false);
  const prefs = usePrefs();
  const labCard = prefs.labAiCard;
  const [menuOpen, setMenuOpen] = useState(false);
  const longRef = useRef<number | null>(null);
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
  const touchRef = useRef<{ y: number; x: number; t: number; moved: boolean; long?: boolean } | null>(null);
  const wheelLock = useRef(0);
  const firstId = useRef(extractYoutubeId(items[index]?.url || '') || '');
  const loadedId = useRef(firstId.current);

  const idOf = (i: number) => extractYoutubeId(items[i]?.url || '') || '';
  const cur = items[index];

  const command = useCallback((func: string, args: any[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  const autoNextRef = useRef(autoNext); autoNextRef.current = autoNext;
  const idxRef = useRef(index); idxRef.current = index;
  const goRef = useRef<(d: 1 | -1) => void>(() => {});
  // 플레이어 이벤트 받기 (끝나면 처음부터 다시 · autoNext 면 다음 쇼츠)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.origin !== 'string' || !e.origin.includes('youtube')) return;
      let d: any;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d?.event === 'onReady') {
        setReady(true); hideCaptions();
        // 처음부터 소리 켜고 재생 (쇼츠를 누른 손길로 열었으니 대부분 허용됨) · 직접 끈 사람만 끈 채로
        // 휴대폰이 막아서 멈추면 아래(state 2)에서 다시 끄고 이어 재생
        try { if (localStorage.getItem(SOUND_KEY) !== '0') { unmuteAt.current = Date.now(); command('unMute'); command('setVolume', [100]); command('playVideo'); } } catch { /* */ }
      }
      if (d?.event === 'infoDelivery' && typeof d.info?.muted === 'boolean') setMuted(d.info.muted);
      const state = d?.event === 'onStateChange' ? d.info : d?.event === 'infoDelivery' ? d.info?.playerState : undefined;
      if (state === 0) {
        if (autoNextRef.current && idxRef.current < items.length - 1) goRef.current(1);
        else { command('seekTo', [0, true]); command('playVideo'); }
      }
      if (state === 1) { setPaused(false); setSwitching(false); hideCaptions(); }
      if (state === 2) {
        if (Date.now() - unmuteAt.current < 1800) {
          // 소리 켜기가 막혀 멈춘 것 → 소리 끄고 그대로 이어 재생 + 아이폰은 영상 화면을 직접 누르게
          unmuteAt.current = 0;
          command('mute'); command('playVideo'); setMuted(true);
          if (isIOS) setPassThrough(true);
          return;
        }
        setPaused(true);
      }
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
  goRef.current = go;

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
    if (muted) { unmuteAt.current = Date.now(); command('unMute'); command('setVolume', [100]); command('playVideo'); }
    else command('mute');
    try { localStorage.setItem(SOUND_KEY, muted ? '1' : '0'); } catch { /* */ }
    setMuted((m) => !m);
  };
  // 생방송·편집본 버튼: 설정(목록에서 누르면 → 사이트 안 / 유튜브 링크)에 따라
  const openVideo = (url: string, title: string, sub: string) => {
    const vid = extractYoutubeId(url) || '';
    if (prefs.listPlay === 'site' && labCard && vid) {
      command('pauseVideo'); setPaused(true);
      openAiCard(vid, title, stageRef.current, sub);
    } else window.open(url, '_blank', 'noopener');
  };
  // 길게 누르기 메뉴 (⋯ 메뉴와 같은 순서: 저장 · 공유 · 사이트 링크 복사 · 가리기 · 신고)
  const shortsShare = (vid: string) => shortsShareText(vid, cleanShortsTitle(cur.title), { liveUrl: cur.liveUrl, editUrl: cur.editUrl, logs: allLogs });
  const openMenu = () => { try { (navigator as any).vibrate?.(15); } catch { /* */ } setMenuOpen(true); };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { y: t.clientY, x: t.clientX, t: Date.now(), moved: false };
    setAnimating(false);
    if (longRef.current) window.clearTimeout(longRef.current);
    longRef.current = window.setTimeout(() => { const st = touchRef.current; if (st && !st.moved) { st.long = true; openMenu(); } }, 500);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    const dy = e.touches[0].clientY - s.y;
    if (Math.abs(dy) > 8) { s.moved = true; if (longRef.current) window.clearTimeout(longRef.current); }
    if (s.long) return;
    // 처음·끝에서는 살짝만 끌림
    const atEdge = (dy > 0 && index === 0) || (dy < 0 && index === items.length - 1);
    setDrag(atEdge ? dy * 0.25 : dy);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (longRef.current) window.clearTimeout(longRef.current);
    if (!s) return;
    if (s.long) { setDrag(0); return; }
    const dy = e.changedTouches[0].clientY - s.y;
    const fast = Date.now() - s.t < 250 && Math.abs(dy) > 25;
    if (!s.moved) { setDrag(0); if (muted) toggleMute(); else togglePlay(); return; }
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
      style={zIndex ? { zIndex } : undefined}
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
            className={cn('absolute inset-0 touch-none cursor-pointer', passThrough && 'pointer-events-none')}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            onClick={(e) => { if (e.detail > 0 && !('ontouchstart' in window)) { if (muted) toggleMute(); else togglePlay(); } }}
            onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
          />

          {/* 소리 꺼져 있으면 가운데 크게 (누르면 소리 켜짐) */}
          {passThrough && muted && !menuOpen && (
            <div className="absolute left-1/2 top-[18%] -translate-x-1/2 w-max max-w-[86%] px-4 py-2 rounded-2xl bg-black/70 backdrop-blur-md text-[13px] font-bold text-center pointer-events-none break-keep">
              아이폰은 영상을 직접 한 번 눌러야 소리가 켜져요 · 영상에 뜬 소리 버튼을 눌러 주세요
            </div>
          )}
          {passThrough && (
            <button type="button" onClick={() => setPassThrough(false)} className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+56px)] px-3 py-1.5 rounded-full bg-black/60 text-[12px] font-bold cursor-pointer">넘기기로 돌아가기</button>
          )}
          {muted && !menuOpen && !passThrough && (
            <button type="button" onClick={toggleMute} className="absolute left-1/2 top-[58%] -translate-x-1/2 h-11 px-4 rounded-full bg-black/55 backdrop-blur-md flex items-center gap-2 text-sm font-bold cursor-pointer shadow-lg ring-1 ring-white/20 animate-pulse" aria-label="소리 켜기">
              <VolumeX className="w-5 h-5" /> 화면을 누르면 소리가 켜져요
            </button>
          )}

          <HiddenCountdown id={idOf(index)} />

          {/* 멈춰도 따로 아이콘을 띄우지 않음 (넘길 때 잠깐 보이던 것도 없앰) */}

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
                <button type="button" onClick={() => openVideo(cur.liveUrl!, `${cur.caption || ''} 생방송`.trim(), '생방송')} className="h-9 px-3 rounded-full bg-white/15 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <PlaySquare className="w-4 h-4" /> 생방송
                </button>
              )}
              {cur.editUrl && (
                <button type="button" onClick={() => openVideo(cur.editUrl!, cur.title || '편집본', '편집본')} className="h-9 px-3 rounded-full bg-white/15 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <YoutubeLogo className="w-4 h-4" /> 편집본
                </button>
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
                      {r.liveUrl && <button type="button" onClick={() => openVideo(r.liveUrl!, `${r.date.replace(/-/g, '.')} 생방송`, '생방송')} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer" aria-label="생방송 보기"><PlaySquare className="w-4 h-4" /></button>}
                      {r.editUrl && <button type="button" onClick={() => openVideo(r.editUrl!, r.games.join(', ') || '편집본', '편집본')} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer" aria-label="편집본 보기"><YoutubeLogo className="w-4 h-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* 길게 누르면: 아래에서 올라오는 메뉴 (⋯ 메뉴와 같은 순서) */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div key="m-bg" className="absolute inset-0 z-40 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
            <motion.div key="m-sheet" role="menu" aria-label="쇼츠 메뉴"
              className="absolute inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[28px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white pb-[calc(12px+env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) setMenuOpen(false); }}>
              <div className="pt-2.5 pb-2 flex justify-center"><span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" /></div>
              <p className="px-5 pb-2 text-[13px] font-bold text-zinc-500 line-clamp-1">{cleanShortsTitle(cur.title) || '유튜브 쇼츠'}</p>
              {(() => {
                const vid = idOf(index);
                const link = `https://uzuhama.vercel.app/s/${vid}`;
                const row = 'w-full flex items-center gap-3 px-5 py-3.5 text-[15px] font-semibold text-left cursor-pointer active:bg-zinc-100 dark:active:bg-zinc-800';
                const done = () => setMenuOpen(false);
                return (
                  <div>
                    <button type="button" role="menuitem" className={row} onClick={() => { done(); requestSave({ id: vid, kind: 'short', title: cur.title || '' }); }}><Bookmark className="w-5 h-5 text-zinc-500" /> 저장</button>
                    <button type="button" role="menuitem" className={row} onClick={() => { done(); shareTextOrClipboard(shortsShare(vid), '쇼츠 공유').catch(() => {}); }}><ShareBoxArrowIcon className="w-5 h-5 text-zinc-500" /> 공유</button>
                    <button type="button" role="menuitem" className={row} onClick={() => { done(); navigator.clipboard?.writeText(link).then(() => toast('사이트 링크를 복사했어요')).catch(() => window.prompt('사이트 링크', link)); }}><Link2 className="w-5 h-5 text-zinc-500" /> 사이트 링크 복사</button>
                    <button type="button" role="menuitem" className={row} onClick={() => { done(); hideVideo({ id: vid, kind: 'short', title: cur.title || '' }); if (index < items.length - 1) window.setTimeout(() => go(1), 250); }}><EyeOff className="w-5 h-5 text-zinc-500" /> 이 영상 가리기</button>
                    <button type="button" role="menuitem" className={row} onClick={() => { done(); requestReport({ id: vid, kind: 'short', title: cur.title || '', search: { query: '', concepts: [], understood: '' } }); }}><Flag className="w-5 h-5 text-zinc-500" /> 신고</button>
                  </div>
                );
              })()}
            </motion.div>
          </>
        )}
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

/** 가린 쇼츠로 다시 올라오면: 가리기 카운트다운 + 되돌리기 */
function HiddenCountdown({ id }: { id: string; onUndo?: () => void }) {
  const h = useHidden(id);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (h.state !== 'pending') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((h.until - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [h.state, h.until]);
  if (h.state === 'none') return null;
  const pending = h.state === 'pending';
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 pointer-events-none" role="status">
      <div className="flex flex-col items-center gap-2.5 text-center">
        {pending ? (
          <span className="relative w-14 h-14">
            <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
              <circle cx="22" cy="22" r="19" fill="rgba(24,24,27,.75)" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
              <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={119.4} strokeDashoffset={119.4 * (1 - left / (HIDE_DELAY / 1000))} style={{ transition: 'stroke-dashoffset .3s linear' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center"><EyeOff className="w-5 h-5" /></span>
          </span>
        ) : <EyeOff className="w-8 h-8 text-white/70" />}
        <p className="px-3 py-1 rounded-full bg-zinc-900/80 text-[13px] font-bold">{pending ? `가렸어요 · ${left}초 뒤 사라져요` : '가린 영상이에요'}</p>
        <button type="button" onClick={(e) => { e.stopPropagation(); unhideVideo(id); toast('다시 보이게 했어요'); }} className="pointer-events-auto px-4 py-1.5 rounded-full bg-white text-zinc-900 text-[13px] font-black cursor-pointer">되돌리기</button>
      </div>
    </div>
  );
}
