/**
 * 주간 점검: 지금 돌릴 차례인지
 * - 관리자 › 시스템 › 점검 의 정기 점검 요일·시간(또는 직접 넣은 점검 일정) 안이면 돌림
 * - 같은 곳의 '점검 시간에 자동 점검·테스트 돌리기' 를 끄면 안 돌림
 * - 이번 점검 회차에 이미 보고서가 있으면 건너뜀
 * - 수동 실행(FORCE=1)은 항상
 * 결과: GITHUB_OUTPUT 에 run=true|false, window=시작~끝
 */
import { appendFileSync } from 'node:fs';
import { effectiveMaintenanceSystem, checkMaintenanceStatus, parseDateSafe } from '../../src/utils/maintenanceUtils';

const KEY = 'AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM';
const fromFs = (v: any): any => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  return v;
};

const out = (k: string, v: string) => { console.log(`${k}=${v}`); if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function main() {
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true';
  const fields = ['recurringMaintenance', 'maintenance', 'maintenanceStart', 'maintenanceEnd'].map((f) => `mask.fieldPaths=${f}`).join('&');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents/config/system?key=${KEY}&${fields}`);
  const doc: any = await r.json();
  const system = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFs(v)])) as any;
  const now = Date.now();
  const eff = effectiveMaintenanceSystem(system, now) as any;
  const st = checkMaintenanceStatus(eff, now);
  const start = parseDateSafe(eff?.maintenanceStart) || 0;
  const end = parseDateSafe(eff?.maintenanceEnd) || 0;
  out('window', `${eff?.maintenanceStart || ''}~${eff?.maintenanceEnd || ''}`);

  let last = 0;
  try { last = Date.parse((await (await fetch('https://uzuhama.vercel.app/api/health?weekly=last')).json())?.lastAt || '') || 0; } catch { /* 처음 */ }
  const already = start > 0 && last >= start;
  // 점검 시간 안 (또는 GitHub 예약이 늦게 와서 끝난 뒤 3시간 안)
  const inWindow = st.isInProgress || (start > 0 && now >= start && now < end + 3 * 3600000);
  // 관리자 › 시스템 › 점검 › '점검 시간에 자동 점검·테스트 돌리기' 를 끄면 안 돌림
  const enabled = system?.recurringMaintenance?.autoTests !== false;
  const run = force || (enabled && inWindow && !already);
  console.log(JSON.stringify({ force, enabled, inWindow, already, isInProgress: st.isInProgress, lastReport: last ? new Date(last).toISOString() : null }));
  out('run', run ? 'true' : 'false');
}
main().catch((e) => { console.error(e); out('run', process.env.FORCE === '1' ? 'true' : 'false'); });
