/**
 * 사이트가 보여 주는 것과 같은 방송 기록: 과거 아카이브 JSON(정적 파일, DB 읽기 0) + logs_by_month 수정분(달마다 문서 1개)
 * logs 컬렉션 전체(기록 수만큼 읽기)를 읽는 대신 이걸 씀 → 읽기가 기록 수(약 2천) → 달 수(약 1백)로 줄어듦
 * 같은 함수 인스턴스 안에서는 잠깐(기본 10분) 재사용하고, 동시에 여러 번 불려도 한 번만 읽음
 */
import { normalizeHistorical, overlayMonthDocs } from '../src/utils/archiveOverlay.js';

type SiteLogs = { logs: any[]; historical: Record<string, any> };
let memo: { at: number; v: SiteLogs } | null = null;
let inflight: Promise<SiteLogs> | null = null;

async function readSiteLogs(db: any): Promise<SiteLogs> {
  let historical: Record<string, any> = {};
  try {
    const r = await fetch('https://uzuhama.vercel.app/data/historical_logs.json', { signal: AbortSignal.timeout(15000) });
    if (r.ok) historical = normalizeHistorical(await r.json());
  } catch { /* */ }
  const monthDocs: any[] = [];
  (await db.collection('logs_by_month').get()).forEach((d: any) => monthDocs.push(d.data()));
  const map = overlayMonthDocs(historical, monthDocs);
  return { logs: Object.values(map).filter((l: any) => l?.date), historical };
}

/** maxAgeMs: 0 이면 항상 새로 (고칠 때) */
export async function loadSiteLogs(db: any, opts: { maxAgeMs?: number } = {}): Promise<SiteLogs> {
  const maxAge = opts.maxAgeMs ?? 10 * 60000;
  if (maxAge > 0 && memo && Date.now() - memo.at < maxAge) return memo.v;
  if (inflight) return inflight;
  inflight = readSiteLogs(db)
    .then((v) => { memo = { at: Date.now(), v }; return v; })
    .finally(() => { inflight = null; });
  return inflight;
}
