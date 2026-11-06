/**
 * 제보·신고 남발 막기 (이 기기 기준)
 * - 기기마다 임의 번호(vid)를 만들어 보내는 글에 붙임 → 서버는 같은 기기의 반복을 한 번으로 셈
 * - 짧은 시간에 너무 많이 보내면 잠시 막음, 같은 대상에 같은 사유는 하루 한 번
 * 개인을 알아보는 정보는 아님 (브라우저 저장소를 지우면 새 번호)
 */
const VID_KEY = 'uzuhama_visitor_id';
const LOG_KEY = 'uzuhama_submit_log_v1';

export function visitorId(): string {
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v) { v = `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; localStorage.setItem(VID_KEY, v); }
    return v;
  } catch { return 'v_unknown'; }
}

type Kind = 'report' | 'rating' | 'feedback' | 'error';
const LIMITS: Record<Kind, { per10min: number; perDay: number }> = {
  report: { per10min: 5, perDay: 20 },
  rating: { per10min: 10, perDay: 40 },
  feedback: { per10min: 3, perDay: 10 },
  error: { per10min: 3, perDay: 10 },
};

type Entry = { k: Kind; key?: string; at: number };
const read = (): Entry[] => { try { const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

/** 보내도 되는지: 안 되면 이유 문구 */
export function checkSubmit(kind: Kind, key?: string): string | null {
  const now = Date.now();
  const log = read().filter((e) => now - e.at < 86400000);
  const mine = log.filter((e) => e.k === kind);
  if (key && mine.some((e) => e.key === key)) return '같은 내용은 오늘 이미 보냈어요. 고마워요!';
  if (mine.filter((e) => now - e.at < 600000).length >= LIMITS[kind].per10min) return '조금 많이 보냈어요. 10분쯤 뒤에 다시 보내 주세요.';
  if (mine.length >= LIMITS[kind].perDay) return '오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요.';
  return null;
}
/** 보냈다고 기록 */
export function noteSubmit(kind: Kind, key?: string) {
  try {
    const now = Date.now();
    const log = read().filter((e) => now - e.at < 86400000);
    log.push({ k: kind, key, at: now });
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-200)));
  } catch { /* 무시 */ }
}
