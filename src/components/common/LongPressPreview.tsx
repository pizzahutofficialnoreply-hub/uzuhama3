/**
 * 길게 누르기 미리보기 (아이폰 사파리의 링크 미리보기처럼)
 *  - 영상·링크를 0.45초 꾹 누르면 '톡' 진동과 함께, 누른 자리에서 미리보기 창이 커져 나옴
 *  - 영상은 소리 없이 바로 재생(작은 화면 속 화면), 아래에 열기 · 유튜브에서 열기 · 링크 복사 · 공유
 *  - 미리보기를 누르면 원래 눌렀을 때와 똑같이 열림 / 바깥을 누르면 누른 자리로 줄어들며 닫힘
 *  - 사이트가 직접 하므로 아이폰(홈 화면 앱 포함)·갤럭시 어디서나 같음
 *
 * 붙이는 법: 영상 요소에 data-lp="유튜브ID" data-lp-title="제목" (외부 a[href] 링크는 자동)
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Link2, Share2, Maximize2 } from 'lucide-react';
import { triggerHaptic, iosHaptic } from '../../utils/haptics';
import { shareTextOrClipboard } from '../../utils/shareUtils';
import { extractYoutubeId } from '../../utils/urlUtils';

const HOLD_MS = 450;
const MOVE_PX = 9;
const SELECTOR = '[data-lp], a[href^="http"]';

type Target = {
  kind: 'video' | 'link';
  id?: string;
  url: string;
  title: string;
  rect: DOMRect;
  /** 처음 손가락을 댄 요소 (열기 = 이걸 그대로 누른 것처럼) */
  press: HTMLElement | null;
};

const toast = (m: string) => window.dispatchEvent(new CustomEvent('uzuhama-toast', { detail: m }));

function readTarget(el: HTMLElement, from: HTMLElement): Target | null {
  const thumb = (el.querySelector('[data-thumb]') as HTMLElement | null) || el;
  const rect = thumb.getBoundingClientRect();
  const press = from.closest('a, button, [role="button"]') as HTMLElement | null;
  const lp = el.getAttribute('data-lp');
  if (lp) {
    return { kind: 'video', id: lp, url: `https://www.youtube.com/watch?v=${lp}`, title: el.getAttribute('data-lp-title') || '', rect, press };
  }
  const href = (el as HTMLAnchorElement).href;
  if (!href) return null;
  const yid = extractYoutubeId(href);
  const title = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80);
  if (yid) return { kind: 'video', id: yid, url: href, title, rect, press: press || el };
  return { kind: 'link', url: href, title, rect, press: press || el };
}

export function LongPressPreview() {
  const [t, setT] = useState<Target | null>(null);
  const [shown, setShown] = useState(false);
  const firedAt = useRef(0);

  useEffect(() => {
    let timer = 0;
    let start: { x: number; y: number; el: HTMLElement; from: HTMLElement } | null = null;
    const clear = () => { if (timer) clearTimeout(timer); timer = 0; start = null; };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const from = e.target as HTMLElement | null;
      if (!from || from.closest('[data-no-lp], [data-lp-layer], input, textarea, [contenteditable="true"]')) return;
      // 영상 요소(data-lp)를 먼저: 그 안의 링크(카드 덮개 링크 등)보다 영상 정보가 정확함
      const el = (from.closest('[data-lp]') || from.closest('a[href^="http"]')) as HTMLElement | null;
      if (!el) return;
      clear();
      start = { x: e.clientX, y: e.clientY, el, from };
      timer = window.setTimeout(() => {
        const s = start; clear();
        if (!s || !s.el.isConnected) return;
        const tg = readTarget(s.el, s.from);
        if (!tg) return;
        firedAt.current = Date.now();
        iosHaptic();
        triggerHaptic(14);
        setT(tg);
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) clear();
    };
    // 미리보기를 띄운 뒤 손을 떼면 오는 '누름'은 버림 (원래 요소가 열리지 않게)
    const swallow = (e: Event) => {
      if (Date.now() - firedAt.current < 700 && !(e.target as HTMLElement)?.closest?.('[data-lp-layer]')) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    // 갤럭시 크롬은 링크를 길게 누르면 자기 메뉴를 띄움 → 우리 미리보기가 맡는 곳에서는 막음
    const onMenu = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR);
      if (el && (start || Date.now() - firedAt.current < 1500)) e.preventDefault();
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', clear, { passive: true });
    window.addEventListener('pointercancel', clear, { passive: true });
    window.addEventListener('scroll', clear, { passive: true, capture: true });
    window.addEventListener('click', swallow, true);
    window.addEventListener('contextmenu', onMenu, true);
    return () => {
      clear();
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('contextmenu', onMenu, true);
    };
  }, []);

  // 열린 다음 프레임에 '커지는' 상태로
  useEffect(() => {
    if (!t) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => { cancelAnimationFrame(r); window.removeEventListener('keydown', esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const close = (after?: () => void) => {
    setShown(false);
    window.setTimeout(() => { setT(null); after?.(); }, 260);
  };

  if (!t) return null;

  // 자리: 가로 가운데, 세로는 누른 자리 근처에서 화면 안에 들어오게
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(vw - 32, 440);
  const PH = t.kind === 'video' ? Math.round((W * 9) / 16) + 64 : 132;
  const MENU = 4 * 50 + 12;
  const total = PH + 12 + MENU;
  const top = Math.max(56, Math.min(vh - total - 24, t.rect.top + t.rect.height / 2 - PH / 2));
  const left = (vw - W) / 2;
  // 원래 자리(썸네일)에서 출발
  const sx = t.rect.width / W, sy = t.rect.height / (t.kind === 'video' ? (W * 9) / 16 : PH);
  const from = `translate(${t.rect.left - left}px, ${t.rect.top - top}px) scale(${Math.max(0.2, sx)}, ${Math.max(0.2, sy)})`;

  const open = () => {
    const p = t.press;
    close(() => { firedAt.current = 0; p?.click(); });
  };
  const yt = () => close(() => window.open(t.url, '_blank', 'noopener'));
  const copy = () => {
    const done = () => toast('링크를 복사했어요');
    try { navigator.clipboard?.writeText(t.url).then(done, () => toast('복사하지 못했어요')); } catch { toast('복사하지 못했어요'); }
    close();
  };
  const share = () => { void shareTextOrClipboard(t.title ? `${t.title}\n${t.url}` : t.url, t.title || '우주하마', toast); close(); };

  const host = (() => { try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return t.url; } })();
  const items: { label: string; icon: React.ReactNode; on: () => void }[] = [
    { label: '열기', icon: <Maximize2 />, on: open },
    ...(t.kind === 'video' ? [{ label: '유튜브에서 열기', icon: <ExternalLink />, on: yt }] : []),
    { label: '링크 복사', icon: <Link2 />, on: copy },
    { label: '공유…', icon: <Share2 />, on: share },
  ];

  return createPortal(
    <div data-lp-layer className="fixed inset-0 z-[2147482000]" style={{ touchAction: 'none' }}>
      <button type="button" aria-label="미리보기 닫기" onClick={() => close()}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(14px) saturate(1.2)', WebkitBackdropFilter: 'blur(14px) saturate(1.2)', opacity: shown ? 1 : 0, transition: 'opacity .26s ease' }} />
      <div className="absolute" style={{ left, top, width: W }}>
        {/* 미리보기 창 */}
        <button type="button" onClick={open}
          className="block w-full text-left rounded-[22px] overflow-hidden bg-white dark:bg-zinc-900 shadow-[0_18px_50px_rgba(0,0,0,.35)]"
          style={{
            transformOrigin: '0 0',
            transform: shown ? 'none' : from,
            opacity: shown ? 1 : 0.6,
            transition: shown ? 'transform .42s cubic-bezier(.2,.9,.25,1.08), opacity .2s ease' : 'transform .26s cubic-bezier(.4,0,.6,1), opacity .26s ease',
          }}>
          {t.kind === 'video' && t.id ? (
            <span className="relative block w-full aspect-video bg-black">
              <img src={`https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover" />
              {shown && (
                <iframe title="미리보기" className="absolute inset-0 w-full h-full pointer-events-none" allow="autoplay; encrypted-media; picture-in-picture"
                  src={`https://www.youtube-nocookie.com/embed/${t.id}?autoplay=1&mute=1&playsinline=1&controls=0&modestbranding=1&rel=0`} />
              )}
            </span>
          ) : (
            <span className="flex items-center gap-3 px-4 pt-4">
              <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              <span className="min-w-0 text-[length:calc(13px*var(--fs,1))] text-zinc-500 truncate">{host}</span>
            </span>
          )}
          <span className="block px-4 py-3">
            <span className="block text-[length:calc(16px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white line-clamp-2 leading-snug">{t.title || host}</span>
            {t.kind === 'link' && <span className="block mt-1 text-[length:calc(12px*var(--fs,1))] text-zinc-400 truncate">{t.url}</span>}
          </span>
        </button>
        {/* 메뉴 */}
        <div className="mt-3 w-[72%] max-w-[280px] rounded-[18px] overflow-hidden bg-white/95 dark:bg-zinc-800/95 shadow-[0_12px_36px_rgba(0,0,0,.28)]"
          style={{ transformOrigin: 'top left', transform: shown ? 'none' : 'scale(.6)', opacity: shown ? 1 : 0, transition: 'transform .32s cubic-bezier(.2,.9,.25,1.08) .04s, opacity .2s ease' }}>
          {items.map((it, i) => (
            <button key={it.label} type="button" onClick={it.on}
              className={'press-row w-full h-[50px] px-4 flex items-center gap-3 text-left text-[length:calc(16px*var(--fs,1))] text-zinc-900 dark:text-white [&>svg]:w-[19px] [&>svg]:h-[19px] [&>svg]:text-zinc-500' + (i ? ' border-t border-zinc-100 dark:border-zinc-700/60' : '')}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
