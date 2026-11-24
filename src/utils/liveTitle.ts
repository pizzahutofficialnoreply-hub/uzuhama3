/**
 * 생방송 다시보기 제목 통일
 *  - '우주하마 생방송!' 처럼 날짜·[다시보기]·우주하마·생방송 말고는 내용이 없는 제목 → 'YYYY.MM.DD 생방송'
 *  - 옛날 방송처럼 방제가 따로 있는 제목은 그대로 (게임 이름을 덧붙이지 않음)
 */
export function isGenericLiveTitle(t: string): boolean {
  const rest = String(t || '')
    .replace(/\[?\s*다시\s*보기\s*\]?/g, ' ')
    .replace(/\d{2,4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*[.일]?/g, ' ')
    .replace(/\b\d{6,8}\b/g, ' ')
    .replace(/우주\s*하마|생방송|생방|라이브|live|풀영상|풀버전/gi, ' ')
    .replace(/[\s!?.,·~\-_()[\]{}|:'"]+/g, '');
  return rest.length === 0;
}
export function liveTitle(title: string | undefined | null, date: string | undefined | null): string {
  const t = String(title || '').trim();
  if (t && !isGenericLiveTitle(t)) return t;
  return date ? `${String(date).slice(0, 10).replace(/-/g, '.')} 생방송` : '생방송';
}
