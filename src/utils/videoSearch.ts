import { squash } from './smartSearch';

/**
 * 추천 영상 검색에서 쓰는 작은 판단들 (화면 코드와 분리해 자동 테스트)
 */

/** 날짜처럼 생긴 검색어인지 (2024, 5월, 5/12, 24년 5월, 2024.05.12, 2024-05 …) */
export function isDateQuery(q: string): boolean {
  return /^(\d{4}|\d{1,2}\s*월(\s*\d{1,2}\s*일?)?|\d{1,2}\s*[./-]\s*\d{0,2}|\d{2,4}\s*년(\s*\d{1,2}\s*월)?(\s*\d{1,2}\s*일?)?|\d{2,4}\.\d{1,2}\.\d{1,2}|\d{4}-\d{2}(-\d{2})?)$/.test(String(q || '').trim());
}

/** 제목이 검색어와 맞는지: 띄어쓰기·기호 무시, 여러 단어면 순서 상관없이 모두 포함 */
export function titleMatches(query: string, title: string): boolean {
  const raw = String(query || '').trim().replace(/^#+/, '');
  if (raw.length < 2) return false;
  const t = squash(title);
  const q = squash(raw);
  if (q && t.includes(q)) return true;
  const words = raw.split(/\s+/).map(squash).filter(Boolean);
  return words.length > 1 && words.every((w) => t.includes(w));
}

/** 제목 속 #해시태그가 검색 태그와 같은지 */
export function titleHasHashtag(title: string, tag: string): boolean {
  const want = squash(tag.replace(/^#+/, ''));
  return Boolean(want) && (String(title || '').match(/#[^\s#]+/g) || []).some((h) => squash(h) === want);
}
