/**
 * 유튜브 썸네일이 깨질 때 (한 번에 많이 불러오다 실패, 그 크기 썸네일이 없음 등)
 * 사이트 전체에서 한 번에: 다른 주소·크기로 다시 → 그래도 안 되면 빈 회색 그림 (물음표 아이콘 대신)
 */
const BLANK = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#27272a"/></svg>');
const SIZES = ['mqdefault', 'hqdefault', 'default'];

export function nextThumb(src: string, tries: number): string | null {
  const m = src.match(/^https?:\/\/(i\.ytimg\.com|img\.youtube\.com|i\d\.ytimg\.com)\/vi(?:_webp)?\/([\w-]{11})\/([a-z]+)\.(?:jpg|webp)/i);
  if (!m) return null;
  const id = m[2];
  if (!/^[\w-]{11}$/.test(id)) return BLANK;
  // 1: 다른 주소 같은 크기 · 2~3: 다른 크기 · 그 뒤: 빈 그림
  if (tries === 0) return `https://${m[1] === 'img.youtube.com' ? 'i.ytimg.com' : 'img.youtube.com'}/vi/${id}/${m[3]}.jpg`;
  const order = SIZES.filter((s) => s !== m[3]);
  if (tries <= order.length) return `https://i.ytimg.com/vi/${id}/${order[tries - 1]}.jpg`;
  return BLANK;
}

export function installThumbFallback() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    const img = ev.target as HTMLImageElement | null;
    if (!img || img.tagName !== 'IMG') return;
    const src = img.currentSrc || img.src || '';
    if (src.startsWith('data:')) return;
    const tries = Number(img.dataset.thumbTries || 0);
    const next = nextThumb(src, tries);
    if (!next) return;
    img.dataset.thumbTries = String(tries + 1);
    // 잠깐 뒤에 (동시에 많이 실패한 경우 바로 다시 부르면 또 실패)
    setTimeout(() => { img.src = next; }, tries === 0 ? 300 : 800);
  }, true);
}
