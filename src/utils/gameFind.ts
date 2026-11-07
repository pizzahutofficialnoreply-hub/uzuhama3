import { buildVocab, correctQuery, latinToHangul, squash } from './smartSearch';
import { GAME_ALIASES, autoAliases } from './searchPlan';
import type { UserPrefs } from './userPrefs';

/**
 * 게임 이름 찾기 (설정 › 알림 › 게임): 검색 탭과 같은 보정을 같은 설정대로
 *  - 오타·한/영 (searchTypo), 초성 (searchChosung), 줄임말 (searchAlias)
 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosungOf(s: string): string {
  return [...String(s || '')].map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : /[ㄱ-ㅎ]/.test(c) ? c : /[0-9a-z]/i.test(c) ? c.toLowerCase() : '';
  }).join('');
}

export function findGames(query: string, names: string[], prefs: Partial<UserPrefs>, limit = 8): { name: string; how?: string }[] {
  const raw = query.trim();
  const q = squash(raw);
  if (!q) return [];
  const list = [...new Set(names.filter(Boolean))];
  const out = new Map<string, { name: string; how?: string; score: number }>();
  const put = (name: string, score: number, how?: string) => {
    const cur = out.get(name);
    if (!cur || cur.score < score) out.set(name, { name, how, score });
  };
  const contains = (term: string, score: number, how?: string) => {
    const t = squash(term);
    if (!t) return;
    list.forEach((n) => {
      const s = squash(n);
      if (s === t) put(n, score + 2, how);
      else if (s.startsWith(t)) put(n, score + 1, how);
      else if (s.includes(t)) put(n, score, how);
    });
  };
  contains(raw, 10);
  if (prefs.searchAlias !== false) {
    const al = { ...autoAliases(list), ...GAME_ALIASES };
    (al[q] || []).forEach((full) => contains(full, 8, `줄임말 '${raw}'`));
  }
  if (prefs.searchChosung !== false && /^[ㄱ-ㅎ]+$/.test(q) && q.length >= 2) {
    list.forEach((n) => { if (chosungOf(n).replace(/[^ㄱ-ㅎ]/g, '').includes(q)) put(n, 7, '초성'); });
  }
  if (prefs.searchTypo !== false && out.size < limit) {
    if (/^[a-z]+$/i.test(raw)) { const h = latinToHangul(raw); if (h && h !== raw) contains(h, 6, `한/영 '${h}'`); }
    try {
      const fix = correctQuery(raw, buildVocab(list), (prefs.keyboard || 'unknown') as any);
      if (fix && fix.to !== raw) contains(fix.to, 5, `'${fix.to}'(으)로 고쳐서`);
    } catch { /* */ }
  }
  return [...out.values()].sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, limit).map(({ name, how }) => ({ name, how }));
}

/** '휴먼 폴 플랫 (Human Fall Flat)' → '휴먼 폴 플랫|Human Fall Flat' (알림은 제목·치지직 카테고리에 둘 중 하나만 있어도) */
export function keywordForGame(name: string): string {
  const parts = String(name || '').split(/[()（）]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join('|') : name.trim();
}
export const keywordLabel = (k: string) => String(k || '').split('|')[0];
