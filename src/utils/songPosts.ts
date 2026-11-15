/**
 * 팬카페 '생방쏭' 글 (방송 켤 때 올리는 알림 · 다시보기 링크) → 날짜·게임 이름
 * 제목 예: "[다시보기 링크] 8/23 일요일 생방쏭 (게임이름- Librarian: Tidy Up the Arcane Library!)"
 * - 카페 모으기로 모은 글: "===== 제목 ⟪2026-08-23 19:13 · 작성자⟫"
 * - 화면을 그대로 복사한 글: 제목 줄 아래 "2026.08.23. 19:13조회 393"
 * 연도는 글 쓴 날에서 (1월에 쓴 12월 글은 그 전 해)
 */
export type SongPost = { date: string; games: string[]; title: string; postedAt: string };

const gameKey = (s: string) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '');
export const sameGame = (a: string, b: string) => {
  const x = gameKey(a); const y = gameKey(b);
  return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y)));
};

export function songGames(title: string): string[] {
  const t = title.replace(/^\[[^\]]*\]\s*/, '');
  // '(게임이름- …)', '(게임 - …)', '게임: …'
  const m = t.match(/게임\s*(?:이름|명)?\s*[-:：]\s*([^)]*)\)?\s*$/) || t.match(/\(([^()]*)\)\s*$/);
  const raw = (m?.[1] || '').trim();
  if (!raw) return [];
  return raw.split(/\s*(?:,|\s\/\s|\s\+\s|\s&\s|、)\s*/).map((x) => x.trim()).filter((x) => x && x.length <= 120);
}

export function parseSongPosts(text: string): SongPost[] {
  const lines = String(text || '').split(/\r?\n/);
  const out: SongPost[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!/생방\s*쏭/.test(line) || /^\[출처\]/.test(line)) continue;
    line = line.replace(/^=+\s*/, '');
    const md = line.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!md) continue;
    // 글 쓴 시각
    let posted = (line.match(/⟪\s*(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/) || []).slice(1);
    if (!posted.length) {
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const p = lines[j].match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{2}:\d{2})?/);
        if (p) { posted = [p[1], p[2].padStart(2, '0'), p[3].padStart(2, '0'), p[4] || '']; break; }
        if (/생방\s*쏭/.test(lines[j]) && j > i + 1) break;
      }
    }
    const title = line.replace(/\s*⟪.*⟫\s*$/, '').trim();
    const mon = Number(md[1]); const day = Number(md[2]);
    if (!(mon >= 1 && mon <= 12 && day >= 1 && day <= 31)) continue;
    let year = Number(posted[0] || 0);
    if (!year) continue;
    if (Number(posted[1]) < mon - 6) year -= 1; // 1월에 쓴 12월 글
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const key = `${date}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, games: songGames(title), title, postedAt: posted[0] ? `${posted[0]}-${posted[1]}-${posted[2]}${posted[3] ? ` ${posted[3]}` : ''}` : '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
