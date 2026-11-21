/**
 * 관리자 테스트 모드 (이 기기에서만): 서버 DB 는 건드리지 않고, 이 기기 화면에만 '가정한 값'을 덮어씀
 *  - 생방송 켜짐(제목·카테고리·시작 몇 분 전) / 오늘 방송 확률 / 오늘 방송 기록(게임·영상) 추가
 *  - 정한 시간(기본 30분)이 지나거나 '끝내기'를 누르면 저절로 지워짐 → 남는 실험 데이터 없음
 * (DB 를 바꾸면 모든 방문자 화면이 바뀌고 알림을 켠 사람 모두에게 실제 알림이 가서 이렇게 함)
 */
import { useSyncExternalStore } from 'react';

export type TestMode = {
  until: number;
  live?: { title: string; category: string; minAgo: number } | null;
  prob?: number | null;
  log?: { game: string; gameLink?: string; videoTitle?: string; videoUrl?: string; shortUrl?: string } | null;
};
const KEY = 'uzuhama_test_mode_v1';
const EVENT = 'uzuhama-test-mode';
let cache: TestMode | null | undefined;

function read(): TestMode | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as TestMode | null;
    if (v && v.until > Date.now()) return v;
    if (v) localStorage.removeItem(KEY);
  } catch { /* */ }
  return null;
}
export function getTestMode(): TestMode | null {
  if (cache === undefined) cache = read();
  if (cache && cache.until <= Date.now()) { endTestMode(); return null; }
  return cache;
}
export function startTestMode(t: TestMode) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* */ }
  cache = t;
  window.dispatchEvent(new CustomEvent(EVENT));
}
export function endTestMode() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  cache = null;
  window.dispatchEvent(new CustomEvent(EVENT));
}
const sub = (f: () => void) => {
  window.addEventListener(EVENT, f);
  window.addEventListener('storage', f);
  const t = window.setInterval(() => { if (cache && cache.until <= Date.now()) endTestMode(); }, 5000);
  return () => { window.removeEventListener(EVENT, f); window.removeEventListener('storage', f); window.clearInterval(t); };
};
export function useTestMode(): TestMode | null {
  return useSyncExternalStore(sub, () => { const v = getTestMode(); return v; }, () => null);
}

/** 가정한 생방송 → live_status 문서 모양 */
export function testLiveData(t: TestMode | null): any | null {
  if (!t?.live) return null;
  const d = new Date(Date.now() - (t.live.minAgo || 0) * 60000 + 9 * 3600000);
  const openDate = d.toISOString().slice(0, 19).replace('T', ' ');
  return { status: 'OPEN', isLive: true, liveTitle: t.live.title || '테스트 생방송', liveCategoryValue: t.live.category || '', openDate, test: true };
}

/** 가정한 오늘 방송 기록 → 기록 목록에 하나 추가 */
export function withTestLog<T extends Record<string, any>>(logs: T, t: TestMode | null): T {
  if (!t?.log) return logs;
  const kst = new Date(Date.now() + 9 * 3600000);
  const date = kst.toISOString().slice(0, 10);
  const time = `${String(kst.getUTCHours()).padStart(2, '0')}:00`;
  const log: any = {
    id: '__test_log__', date, time, endTime: '', isTest: true,
    game: t.log.game || '테스트 게임', games: [{ name: t.log.game || '테스트 게임', link: t.log.gameLink || '' }],
    vods: [], edited: t.log.videoUrl ? [{ title: t.log.videoTitle || '테스트 영상', url: t.log.videoUrl }] : [],
    shorts: t.log.shortUrl ? [{ title: '테스트 쇼츠', url: t.log.shortUrl }] : [],
  };
  return { ...logs, __test_log__: log };
}
