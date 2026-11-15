/**
 * 방송 오류로 짧게 꺼진 생방 (30분 이하로 끝나고 곧바로 1시간 넘게 다시 켠 것)
 * - 따로 기록된 짧은 방송: 기록에 errorStopOf = 이어서 켠 방송 기록 id → 사이트에서는 그 방송에 합쳐서 하나로 봄
 *   (짧은 방송의 다시보기는 '오류로 꺼짐' 표시로 붙고, 시작 시각은 더 이른 쪽)
 * - 한 기록 안에 다시보기가 여러 개면: 짧은 다시보기에 errorStop: true (표시만)
 * - 관리자 › 기록 추가 › 끊긴 생방 에서 켜고 끔 (기록의 표시를 지우면 원래대로)
 */
export const ERROR_MAX_SEC = 30 * 60;
export const MAIN_MIN_SEC = 60 * 60;
/** 짧은 방송이 끝나고 다시 켤 때까지 이 안이면 같은 방송으로 봄 */
export const RESTART_GAP_MS = 2 * 3600 * 1000;

export type StreamVod = { id: string; logId: string; start: number; durationSec: number };
export type ErrorCandidate = { short: StreamVod; main: StreamVod; sameLog: boolean };

/** 최근부터 과거로 보면서: 30분 이하 생방 다음에(2시간 안) 1시간 넘는 생방이 있으면 앞의 것은 방송 오류 */
export function findErrorStops(vods: StreamVod[]): ErrorCandidate[] {
  const v = [...vods].filter((x) => Number.isFinite(x.start)).sort((a, b) => b.start - a.start);
  const out: ErrorCandidate[] = [];
  for (let i = 1; i < v.length; i++) {
    const a = v[i];
    const b = v[i - 1];
    if (a.durationSec > 0 && a.durationSec <= ERROR_MAX_SEC && b.durationSec >= MAIN_MIN_SEC && b.start - (a.start + a.durationSec * 1000) < RESTART_GAP_MS && b.start >= a.start) {
      out.push({ short: a, main: b, sameLog: a.logId === b.logId });
    }
  }
  return out;
}

/** 사이트에 보여 줄 때: errorStopOf 가 있는 기록은 이어서 켠 방송에 합침 (관리자 화면은 원본 그대로) */
export function mergeErrorStops<T extends { logs: Record<string, any> }>(data: T): T {
  if (!data?.logs) return data;
  const shorts = Object.values(data.logs).filter((l: any) => l?.errorStopOf && data.logs[l.errorStopOf]);
  if (!shorts.length) return data;
  const logs: Record<string, any> = { ...data.logs };
  for (const s of shorts as any[]) {
    const main = logs[s.errorStopOf];
    if (!main) continue;
    const earlier = String(s.date || '') + String(s.time || '') < String(main.date || '') + String(main.time || '');
    logs[main.id] = {
      ...main,
      ...(earlier && s.time ? { time: s.time } : {}),
      vods: [...(s.vods || []).map((x: any) => ({ ...x, errorStop: true })), ...(main.vods || [])],
      edited: [...(main.edited || []), ...(s.edited || []).filter((e: any) => !(main.edited || []).some((m: any) => m?.url && m.url === e?.url))],
      shorts: [...(main.shorts || []), ...(s.shorts || []).filter((e: any) => !(main.shorts || []).some((m: any) => m?.url && m.url === e?.url))],
    };
    delete logs[s.id];
  }
  return { ...data, logs };
}
