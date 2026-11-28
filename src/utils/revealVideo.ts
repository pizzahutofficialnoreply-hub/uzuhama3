import { rebaseOverlayScroll } from './overlayLock';
/**
 * 요약 탭 '새 영상'에서 펼친 카드를 내리면: 검색 탭 동영상 목록(기본 정렬)의 그 영상 자리로 줄어듦
 *  - requestReveal(id): 검색 탭으로 넘기고(App), 동영상 하위 탭·검색어 없음·기본 정렬로 맞춤(RecommendTab)
 *  - 검색 탭이 아직 안 그려졌으면 처음 그릴 때 takePendingReveal() 로 받아 감
 */
export const REVEAL_EVENT = 'uzuhama-reveal-video';
let pending: string | null = null;
export function requestReveal(id: string) {
  pending = id;
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { id } }));
}
export function takePendingReveal(): string | null { const p = pending; pending = null; return p; }
/** 목록에서 그 영상 칸 찾기 (그려질 때까지 최대 ms 기다림) */
export function waitForCard(id: string, ms = 1500): Promise<HTMLElement | null> {
  const t0 = Date.now();
  return new Promise((res) => {
    const look = () => {
      const all = [...document.querySelectorAll<HTMLElement>(`[data-ai-card="${CSS.escape(id)}"]`)].filter((el) => el.getBoundingClientRect().width > 0);
      if (all.length) return res(all[0]);
      if (Date.now() - t0 > ms) return res(null);
      requestAnimationFrame(look);
    };
    look();
  });
}

/** 그 칸을 화면 가운데로 (탭 바꿀 때 스크롤 되돌리기 등이 뒤따라 움직여도 자리 잡을 때까지 다시 맞춤) */
export function settleIntoView(el: HTMLElement, ms = 1600): Promise<HTMLElement | null> {
  // 목록이 기본 정렬로 다시 그려지는 게 조금 늦게 끝나서, 그 칸의 문서 안 위치가 한동안 안 바뀔 때까지 기다림
  const t0 = Date.now(); let ok = 0; let prev = NaN;
  return new Promise((res) => {
    const step = () => {
      const cur = [...document.querySelectorAll<HTMLElement>(`[data-ai-card="${CSS.escape(el.getAttribute('data-ai-card') || '')}"]`)].find((x) => x.getBoundingClientRect().width > 0) || (el.isConnected ? el : null);
      if (!cur) return res(null);
      el = cur;
      const r = el.getBoundingClientRect();
      const docTop = r.top + window.scrollY;
      if (Math.abs(docTop - prev) > 2) ok = 0; else ok++;
      prev = docTop;
      if (r.top < 40 || r.bottom > window.innerHeight - 40) { el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }); ok = 0; }
      const t = Date.now() - t0;
      if ((ok >= 12 && t > 450) || t > ms) { rebaseOverlayScroll(); return res(el); }
      requestAnimationFrame(step);
    };
    step();
  });
}
