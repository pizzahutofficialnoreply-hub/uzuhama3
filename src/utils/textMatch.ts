import { useMemo } from 'react';
import { buildVocab, correctQuery, latinToHangul, squash } from './smartSearch';
import { GAME_ALIASES } from './searchPlan';
import { chosungOf } from './gameFind';
import { usePrefs, type UserPrefs } from './userPrefs';

/**
 * 검색 탭 말고 다른 검색창(시청 기록·패치노트·달력·라이선스 등)에도 같은 글자 보정을
 * — 설정 › 검색 도우미의 오타·한/영, 초성, 줄임말 켜고 끄기를 그대로 따름 (AI·검색 탭 전용 순위는 안 씀)
 * 띄어 쓴 낱말은 모두 들어 있어야 맞음
 */
export function makeMatcher(query: string, prefs: Partial<UserPrefs>, texts: string[] = []) {
  const words = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return () => true;
  let vocab: ReturnType<typeof buildVocab> | null = null;
  const variants = words.map((w) => {
    const out = new Set<string>([squash(w)]);
    if (prefs.searchTypo !== false) {
      if (/^[a-z]+$/i.test(w)) { const h = latinToHangul(w); if (h) out.add(squash(h)); }
      if (texts.length && w.length >= 2) {
        try {
          vocab = vocab || buildVocab(texts.slice(0, 3000));
          const fix = correctQuery(w, vocab, (prefs.keyboard || 'unknown') as any);
          if (fix?.to) out.add(squash(fix.to));
        } catch { /* */ }
      }
    }
    if (prefs.searchAlias !== false) ((GAME_ALIASES as any)[squash(w)] || []).forEach((a: string) => out.add(squash(a)));
    const cho = prefs.searchChosung !== false && /^[ㄱ-ㅎ]{2,}$/.test(w) ? w : '';
    return { list: [...out].filter(Boolean), cho };
  });
  return (text: string) => {
    const t = squash(text || '');
    let c = '';
    return variants.every((v) => v.list.some((x) => t.includes(x)) || (v.cho && (c = c || chosungOf(text).replace(/[^ㄱ-ㅎ]/g, '')).includes(v.cho)));
  };
}

/** 목록 거르기 훅: 검색어 + 각 항목의 글자 */
export function useSmartFilter<T>(items: T[], getText: (x: T) => string, query: string): T[] {
  const prefs = usePrefs();
  const texts = useMemo(() => items.map(getText), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!query.trim()) return items;
    const m = makeMatcher(query, prefs, texts);
    return items.filter((_, i) => m(texts[i]));
  }, [items, texts, query, prefs]);
}
