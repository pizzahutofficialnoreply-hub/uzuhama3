import { getKoreanHoliday } from './koreanHolidays';

/**
 * 명절 특집: 설·추석(연휴 며칠 전부터 끝날 때까지), 성탄절 무렵이면
 * 홈 위쪽에 '이동하면서 보기 좋은 긴 영상' 모음을 보여 줌 (카테고리와 상관없이)
 */
export type Season = { key: '설날' | '추석' | '성탄절'; title: string; emoji: string };

const kst = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => kst(new Date(Date.parse(`${ymd}T00:00:00+09:00`) + n * 86400000));

/** 오늘이 명절 특집 기간인지 (설·추석은 연휴 3일 전부터, 성탄절은 20일부터 26일까지) */
export function currentSeason(now: Date = new Date()): Season | null {
  const today = kst(now);
  for (let i = -1; i <= 3; i++) {
    const h = getKoreanHoliday(addDays(today, i)) || '';
    if (h.includes('설날')) return { key: '설날', title: '설 특집', emoji: '🧧' };
    if (h.includes('추석')) return { key: '추석', title: '추석 특집', emoji: '🌕' };
  }
  const md = today.slice(5);
  if (md >= '12-20' && md <= '12-26') return { key: '성탄절', title: '크리스마스 특집', emoji: '🎄' };
  return null;
}

/** 그 명절에 한 방송인지 (예전 해 포함) */
export function isSeasonDate(ymd: string, s: Season): boolean {
  if (s.key === '성탄절') { const md = String(ymd).slice(5, 10); return md >= '12-20' && md <= '12-26'; }
  return (getKoreanHoliday(String(ymd).slice(0, 10)) || '').includes(s.key);
}
