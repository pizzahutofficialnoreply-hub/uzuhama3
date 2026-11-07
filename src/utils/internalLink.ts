/** 공지 링크가 우리 사이트 주소(절대 주소)면 사이트 안 경로로 바꿔서 같은 창에서 이동 */
const OWN = /^https?:\/\/(uzuhama\.web\.app|uzuhama\.firebaseapp\.com|uzuhama\.vercel\.app)(\/[^#]*)?/i;
export function toInternal(url: string): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  if (u.startsWith('redirect://') || u.startsWith('app://') || u.startsWith('/')) return u;
  const m = u.match(OWN);
  if (m || (typeof location !== 'undefined' && u.startsWith(location.origin))) {
    const path = m ? (m[2] || '/') : u.slice(location.origin.length) || '/';
    return path;
  }
  return null;
}
