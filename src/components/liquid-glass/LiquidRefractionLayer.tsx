import React, { useEffect, useId, useRef } from 'react';

/**
 * 아이폰 Liquid Glass 식 굴절 레이어 (탭바 전용)
 *
 * 부모 요소(둥근 유리) 맨 아래에 깔려서, 뒤 화면이 가장자리에서 안쪽으로 크게 휘어 보이게 함.
 * - 실제 둥근 사각형 윤곽을 따라 만든 굴절 지도(feDisplacementMap)를 사용 → 가운데는 그대로, 가장자리만 휨
 * - 크롬 계열: backdrop-filter: url(#필터) 로 뒤 화면 자체를 굴절
 * - 사파리·파이어폭스: backdrop-filter 의 url() 을 지원하지 않으므로, 뒤에 있는 본문(<main>) 중
 *   유리 근처 띠 부분만 복사해 유리 안에 겹쳐 두고 그 복사본을 굴절 (스크롤에 맞춰 위치 동기화)
 */

type Props = {
  /** 휘는 가장자리 폭(px) */
  bevel?: number;
  /** 굴절 세기 (feDisplacementMap scale, 최대 이동 거리는 절반) */
  strength?: number;
  /** 굴절 뒤 아주 약한 흐림(px) */
  blur?: number;
  /** 본문 선택자 (사파리 복사 방식에서 복사할 대상) */
  sourceSelector?: string;
  /** 굴절 위에 얹는 옅은 색 (글자 가독성용) */
  tint?: string;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const BAND_MARGIN = 700; // 유리 위아래로 이만큼만 복사
const REBUILD_SCROLL_DISTANCE = 420; // 마지막 복사 이후 이만큼 스크롤하면 다시 복사
const MUTATION_DEBOUNCE_MS = 700;

const isBackdropUrlCapable = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  return !isIOS && /Chrome\/\d+/.test(ua) && !/Firefox\//.test(ua);
})();

let defsRoot: SVGDefsElement | null = null;
function getDefs(): SVGDefsElement {
  if (defsRoot && document.body.contains(defsRoot)) return defsRoot;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defsRoot = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
  svg.appendChild(defsRoot);
  document.body.appendChild(svg);
  return defsRoot;
}

/** 둥근 사각형 윤곽을 따라 가장자리 띠에서만 안쪽 픽셀을 끌어오는 굴절 지도 */
function makeDisplacementMap(w: number, h: number, radius: number, bevelPx: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(radius, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - rr);
      const qy = Math.abs(py) - (hh - rr);
      const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
      const inside = -sdf;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) nx = Math.sign(px);
      else ny = Math.sign(py);
      let m = 0;
      if (inside > 0 && inside < bevelPx) {
        const s = 1 - inside / bevelPx; // 1 = 가장자리
        m = Math.pow(s, 1.6) * (0.55 + 0.45 * Math.sqrt(1 - s * s * 0.96));
      }
      d[i] = Math.round((-nx * m * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((-ny * m * 0.5 + 0.5) * 255);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function writeFilter(id: string, w: number, h: number, mapUrl: string, strength: number, blur: number) {
  const defs = getDefs();
  let f = defs.querySelector<SVGFilterElement>(`#${CSS.escape(id)}`);
  if (!f) {
    f = document.createElementNS(SVG_NS, 'filter') as SVGFilterElement;
    f.id = id;
    defs.appendChild(f);
  }
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('primitiveUnits', 'userSpaceOnUse');
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', String(w));
  f.setAttribute('height', String(h));
  f.setAttribute('color-interpolation-filters', 'sRGB');
  while (f.firstChild) f.firstChild.remove();

  const map = document.createElementNS(SVG_NS, 'feImage');
  map.setAttribute('href', mapUrl);
  map.setAttributeNS(XLINK_NS, 'xlink:href', mapUrl);
  map.setAttribute('x', '0');
  map.setAttribute('y', '0');
  map.setAttribute('width', String(w));
  map.setAttribute('height', String(h));
  map.setAttribute('preserveAspectRatio', 'none');
  map.setAttribute('result', 'map');

  const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(strength));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');
  disp.setAttribute('result', 'warped');

  const soft = document.createElementNS(SVG_NS, 'feGaussianBlur');
  soft.setAttribute('in', 'warped');
  soft.setAttribute('stdDeviation', String(blur));
  soft.setAttribute('result', 'soft');

  const sat = document.createElementNS(SVG_NS, 'feColorMatrix');
  sat.setAttribute('in', 'soft');
  sat.setAttribute('type', 'saturate');
  sat.setAttribute('values', '1.5');

  f.append(map, disp, soft, sat);
}

/** 본문 중 [top, bottom] 띠에 걸친 부분만 복사 (나머지는 같은 크기의 빈 껍데기로 자리만 유지) */
function cloneBand(real: Element, top: number, bottom: number, depth = 0): Element {
  const out = real.cloneNode(false) as Element;
  real.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(child.cloneNode(false));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') return;
    // 화면에 고정된 요소(모달·팝업 등)는 스크롤되는 본문이 아니므로 복사하지 않음
    if (el.classList.contains('fixed') || el.classList.contains('lg-refr-layer') || el.style.position === 'fixed') return;

    const r = el.getBoundingClientRect();
    const inBand = r.bottom >= top && r.top <= bottom && (r.width > 0 || r.height > 0);

    if (!inBand) {
      const cs = getComputedStyle(el);
      if (cs.display === 'contents') {
        out.appendChild(cloneBand(el, top, bottom, depth + 1));
        return;
      }
      if (cs.display === 'none') {
        out.appendChild(el.cloneNode(false));
        return;
      }
      if (cs.position === 'absolute' || cs.position === 'fixed') return;
      const spacer = el.cloneNode(false) as HTMLElement;
      if (spacer.style) {
        spacer.style.cssText += `;height:${r.height}px;width:${r.width}px;min-height:0;max-height:none;min-width:0;max-width:none;overflow:hidden;flex:none;`;
      }
      out.appendChild(spacer);
      return;
    }

    if (tag === 'canvas') {
      const src = el as HTMLCanvasElement;
      const copy = src.cloneNode(false) as HTMLCanvasElement;
      try {
        copy.getContext('2d')?.drawImage(src, 0, 0);
      } catch {}
      out.appendChild(copy);
      return;
    }
    if (tag === 'iframe' || tag === 'video' || tag === 'audio' || tag === 'object' || tag === 'embed') {
      const ph = document.createElement('div');
      ph.style.cssText = `width:${r.width}px;height:${r.height}px;visibility:hidden;`;
      out.appendChild(ph);
      return;
    }
    if (tag === 'svg' || el.childElementCount === 0 || depth > 40) {
      out.appendChild(el.cloneNode(true));
      return;
    }
    out.appendChild(cloneBand(el, top, bottom, depth + 1));
  });
  return out;
}

function sanitizeClone(root: Element) {
  root.removeAttribute('id');
  root.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  root.querySelectorAll('input, textarea, select, button, a, [tabindex]').forEach((n) => {
    n.setAttribute('tabindex', '-1');
    n.removeAttribute('autofocus');
  });
}

export function LiquidRefractionLayer({ bevel = 18, strength = 64, blur = 0.6, sourceSelector = 'main', tint }: Props) {
  const rawId = useId();
  const filterId = `lg-refr-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layerRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const clip = clipRef.current;
    const host = layer?.parentElement;
    if (!layer || !clip || !host) return;

    let disposed = false;
    let lastSize = '';

    // ── 굴절 필터 (크기·모양이 바뀔 때만 다시 만듦) ──
    const refreshFilter = () => {
      const w = Math.round(host.offsetWidth);
      const h = Math.round(host.offsetHeight);
      if (w < 4 || h < 4) return;
      const radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || h / 2;
      const key = `${w}x${h}x${radius}`;
      if (key === lastSize) return;
      lastSize = key;
      writeFilter(filterId, w, h, makeDisplacementMap(w, h, radius, bevel), strength, blur);
      const value = `url(#${filterId})`;
      if (isBackdropUrlCapable) {
        layer.style.backdropFilter = value;
        (layer.style as any).webkitBackdropFilter = value;
      } else {
        // 사파리는 필터 정의가 바뀌어도 다시 그리지 않는 경우가 있어 한 번 비웠다가 다시 지정
        layer.style.filter = 'none';
        void layer.offsetWidth;
        layer.style.filter = value;
      }
    };

    const ro = new ResizeObserver(refreshFilter);
    ro.observe(host);
    refreshFilter();

    if (isBackdropUrlCapable) {
      return () => {
        disposed = true;
        ro.disconnect();
        getDefs().querySelector(`#${CSS.escape(filterId)}`)?.remove();
      };
    }

    // ── 사파리 등: 본문 일부를 복사해 유리 안에 겹침 ──
    const source = document.querySelector(sourceSelector) as HTMLElement | null;
    if (!source) return () => ro.disconnect();

    let cloneRoot: HTMLElement | null = null;
    let lastBuildScrollY = 0;
    let mutationTimer = 0;
    let followRaf = 0;
    let followUntil = 0;

    const place = () => {
      if (!cloneRoot) return;
      const s = source.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      cloneRoot.style.transform = `translate3d(${s.left - l.left}px, ${s.top - l.top}px, 0)`;
    };

    const rebuild = () => {
      if (disposed) return;
      const l = layer.getBoundingClientRect();
      if (l.width === 0) return;
      const next = cloneBand(source, l.top - BAND_MARGIN, l.bottom + BAND_MARGIN) as HTMLElement;
      sanitizeClone(next);
      next.setAttribute('aria-hidden', 'true');
      next.setAttribute('inert', '');
      next.style.cssText += `;position:absolute;left:0;top:0;margin:0;width:${source.offsetWidth}px;pointer-events:none;will-change:transform;`;
      clip.replaceChildren(next);
      cloneRoot = next;
      lastBuildScrollY = window.scrollY;
      place();
    };

    // 탭바가 들어오는 애니메이션 등 위치가 잠깐 움직이는 동안 매 프레임 맞춤
    const follow = (ms: number) => {
      followUntil = Math.max(followUntil, performance.now() + ms);
      if (followRaf) return;
      const tick = () => {
        place();
        followRaf = performance.now() < followUntil ? requestAnimationFrame(tick) : 0;
      };
      followRaf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (Math.abs(window.scrollY - lastBuildScrollY) > REBUILD_SCROLL_DISTANCE) rebuild();
      else place();
    };
    const scheduleRebuild = () => {
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        rebuild();
        follow(300);
      }, MUTATION_DEBOUNCE_MS);
    };
    const onResize = () => {
      rebuild();
      follow(400);
    };

    const mo = new MutationObserver(scheduleRebuild);
    mo.observe(source, { subtree: true, childList: true, attributes: true, characterData: true });
    const themeMo = new MutationObserver(scheduleRebuild);
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    rebuild();
    follow(900);

    return () => {
      disposed = true;
      ro.disconnect();
      mo.disconnect();
      themeMo.disconnect();
      window.clearTimeout(mutationTimer);
      if (followRaf) cancelAnimationFrame(followRaf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      clip.replaceChildren();
      getDefs().querySelector(`#${CSS.escape(filterId)}`)?.remove();
    };
  }, [filterId, bevel, strength, blur, sourceSelector]);

  return (
    <>
      <div
        ref={layerRef}
        aria-hidden="true"
        className={isBackdropUrlCapable ? 'lg-refr-layer' : 'lg-refr-layer lg-refr-layer--clone'}
      >
        <div ref={clipRef} className="lg-refr-clip" />
      </div>
      <div aria-hidden="true" className="lg-refr-tint" style={tint ? { backgroundColor: tint } : undefined} />
    </>
  );
}

export const liquidRefractionMode = isBackdropUrlCapable ? 'backdrop' : 'clone';
