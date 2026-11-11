import { useEffect, useState } from 'react';
import type { StepResult } from './runner';
import { SELFTEST_FLAG } from './flag';
import { visitorId } from '../utils/submitGuard';

/**
 * 내 앱 점검을 화면 뒤에서: 창을 닫아도 계속 돌고, 헤더 아래 선으로 진행률을 보여 줌
 * - 점검용 안쪽 창(iframe)을 화면 뒤(맨 아래 층, 투명)에 붙여 두고 돌림 → 끝나면 지움
 * - 단계가 끝날 때마다 기기에 저장 → 앱을 완전히 닫았다 열어도 결과가 남고, 남은 단계부터 이어서 할 수 있음
 * - 지난 점검 기록(최근 10번)을 남김
 */
export type BgState = {
  running: boolean; deep: boolean; results: StepResult[]; stage: string; done: boolean;
  startedAt: number; endedAt: number; estimate: number; interrupted: boolean;
  /** 클라우드 점검(서버 쪽 아이폰 모양 브라우저)이면 그 실행 번호 */
  cloudId?: string; stopped?: boolean;
};
export type HistoryEntry = { id: string; deep: boolean; startedAt: number; endedAt: number; interrupted?: boolean; stopped?: boolean; cloud?: boolean; results: StepResult[] };

const EST_KEY = (deep: boolean) => `uzuhama_selftest_steps_${deep ? 'deep' : 'quick'}`;
const CUR_KEY = 'uzuhama_selftest_current_v1';
const HIST_KEY = 'uzuhama_selftest_history_v1';
const ALIVE_KEY = 'uzuhama_selftest_alive';
const BACKUP_KEY = 'uzuhama_selftest_backup_v1'; // runner.ts SELFTEST_BACKUP 과 같음

const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 가득 참: 자세한 내용 빼고 */ try { localStorage.setItem(k, JSON.stringify(slim(v))); } catch { /* */ } } };
const slim = (v: any) => (Array.isArray(v) ? v.map(slim) : v?.results ? { ...v, results: v.results.map((r: StepResult) => ({ ...r, details: undefined })) } : v);

let state: BgState = { running: false, deep: false, results: [], stage: '', done: false, startedAt: 0, endedAt: 0, estimate: 31, interrupted: false };

/** 앱을 열 때: 점검 중에 앱이 닫혔으면 바뀐 설정을 되돌리고, 멈춘 점검을 '이어서 하기'로 보여 줌 */
(function recover() {
  if (typeof window === 'undefined' || window.top !== window) return; // 점검 창 안에서는 안 함
  const alive = Number(localStorage.getItem(ALIVE_KEY) || 0);
  // 이 탭에서 돌리던 점검이면(새로 고침·앱 다시 열림) 바로 복구, 다른 탭이 지금 돌리는 중이면 건드리지 않음
  let mine = false;
  try { mine = sessionStorage.getItem('uzuhama_selftest_owner') === '1'; sessionStorage.removeItem('uzuhama_selftest_owner'); } catch { /* */ }
  if (!mine && Date.now() - alive < 20000) return;
  try {
    const bk = read<Record<string, string | null> | null>(BACKUP_KEY, null);
    if (bk) {
      Object.entries(bk).forEach(([k, v]) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); });
      localStorage.removeItem(BACKUP_KEY);
    }
    localStorage.removeItem(SELFTEST_FLAG);
  } catch { /* */ }
  const cur = read<any>(CUR_KEY, null);
  if (cur && !cur.done && cur.cloudId) { state = { ...state, running: true, deep: Boolean(cur.deep), results: cur.results || [], startedAt: cur.startedAt || Date.now(), estimate: cur.estimate || 31, cloudId: cur.cloudId, stage: '클라우드 점검 확인 중…' }; setTimeout(() => pollCloud(), 0); return; }
  if (cur && !cur.done && cur.results) state = { ...state, deep: Boolean(cur.deep), results: cur.results, startedAt: cur.startedAt || 0, estimate: cur.estimate || 31, interrupted: true, stage: '앱이 닫혀서 점검이 멈췄어요' };
  else if (cur?.done) state = { ...state, deep: Boolean(cur.deep), results: cur.results || [], startedAt: cur.startedAt, endedAt: cur.endedAt, done: true };
})();

const subs = new Set<(s: BgState) => void>();
const emit = (patch: Partial<BgState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f(state));
  write(CUR_KEY, { deep: state.deep, results: state.results, startedAt: state.startedAt, endedAt: state.endedAt, estimate: state.estimate, done: state.done || (!state.running && !state.interrupted), cloudId: state.running ? state.cloudId : undefined });
};

export function useSelfTestBg() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  return s;
}
export const selfTestProgress = (s: BgState) => (s.done ? 1 : s.running || s.interrupted ? Math.min(0.97, s.results.length / Math.max(1, s.estimate)) : 0);

export function selfTestHistory(): HistoryEntry[] { return read<HistoryEntry[]>(HIST_KEY, []); }
const pushHistory = (e: HistoryEntry) => write(HIST_KEY, [e, ...selfTestHistory().filter((x) => x.id !== e.id)].slice(0, 10));

/** resume: 멈춘 점검의 남은 단계만 */
export async function startSelfTestBg(deep: boolean, resume = false, cloud = false) {
  if (state.running) return;
  if (cloud && !resume) return startCloud(deep);
  let est = deep ? 39 : 31;
  try { est = Number(localStorage.getItem(EST_KEY(deep))) || est; } catch { /* */ }
  const prev = resume && state.interrupted ? state.results : [];
  const startedAt = resume && state.interrupted ? state.startedAt || Date.now() : Date.now();
  if (resume && state.interrupted) deep = state.deep;
  else if (state.interrupted && state.results.length) pushHistory({ id: String(state.startedAt), deep: state.deep, startedAt: state.startedAt, endedAt: Date.now(), interrupted: true, results: state.results });
  emit({ running: true, deep, results: prev, stage: resume ? '멈춘 곳부터 이어서…' : '점검할 화면을 불러오는 중…', done: false, startedAt, endedAt: 0, estimate: est, interrupted: false });
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = '앱 점검 (화면 뒤)';
  // 화면 밖으로 보내면 브라우저가 멈춰 버릴 수 있어서, 화면 안 맨 아래 층에 투명하게
  Object.assign(frame.style, { position: 'fixed', left: '0', top: '0', width: '390px', height: '760px', opacity: '0', pointerEvents: 'none', zIndex: '-1', border: '0' });
  document.body.appendChild(frame);
  try { localStorage.setItem(SELFTEST_FLAG, String(Date.now() + 30 * 60 * 1000)); sessionStorage.setItem('uzuhama_selftest_owner', '1'); } catch { /* */ }
  const beat = window.setInterval(() => { try { localStorage.setItem(ALIVE_KEY, String(Date.now())); } catch { /* */ } }, 5000);
  try { localStorage.setItem(ALIVE_KEY, String(Date.now())); } catch { /* */ }
  try {
    const { runSelfTests } = await import('./runner');
    localAbort = new AbortController();
    const out = await runSelfTests(frame, (r) => emit({ results: [...state.results, r], stage: `${r.group} · ${r.name}` }), {
      signal: localAbort.signal,
      ...(deep ? {} : { skip: ['전부 눌러 보기'] }),
      ...(prev.length ? { skipSteps: new Set(prev.map((r) => `${r.group}|${r.name}`)) } : {}),
      onProgress: (t) => emit({ stage: t }),
    });
    const all = [...prev, ...out.results.filter((r) => !prev.some((p) => p.group === r.group && p.name === r.name))];
    try { localStorage.setItem(EST_KEY(deep), String(all.length)); } catch { /* */ }
    emit({ results: all });
  } catch (e: any) {
    emit({ stage: `점검이 멈췄어요: ${String(e?.message || e).slice(0, 80)}` });
  } finally {
    window.clearInterval(beat);
    try { localStorage.removeItem(SELFTEST_FLAG); localStorage.removeItem(ALIVE_KEY); sessionStorage.removeItem('uzuhama_selftest_owner'); } catch { /* */ }
    frame.remove();
    const stopped = Boolean(localAbort?.signal.aborted);
    localAbort = null;
    emit({ running: false, done: true, endedAt: Date.now(), stopped, stage: stopped ? '중단했어요' : state.stage });
    pushHistory({ id: String(state.startedAt), deep: state.deep, startedAt: state.startedAt, endedAt: state.endedAt, results: state.results, ...(stopped ? { stopped: true } : {}) });
  }
}

let localAbort: AbortController | null = null;

/** 점검 중단 (이 기기 점검은 다음 단계에서 멈추고, 클라우드 점검은 서버에 중단을 알림) */
export async function stopSelfTest() {
  if (!state.running) return;
  if (state.cloudId) {
    emit({ stage: '중단하는 중…' });
    try { await fetch(`${apiBase()}/api/health?selftest=cancel&id=${state.cloudId}`, { method: 'POST' }); } catch { /* */ }
    finishCloud('cancel');
    return;
  }
  localAbort?.abort();
  emit({ stage: '중단하는 중… (지금 단계가 끝나면 멈춰요)' });
}

// ── 클라우드 점검 ──
const apiBase = () => (window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
const vidOf = () => { try { return visitorId(); } catch { return 'anon'; } };
let pollTimer = 0;

async function startCloud(deep: boolean) {
  if (state.interrupted && state.results.length) pushHistory({ id: String(state.startedAt), deep: state.deep, startedAt: state.startedAt, endedAt: Date.now(), interrupted: true, results: state.results });
  emit({ running: true, deep, results: [], stage: '클라우드에 점검을 맡기는 중…', done: false, startedAt: Date.now(), endedAt: 0, estimate: deep ? 39 : 31, interrupted: false, stopped: false, cloudId: undefined });
  try {
    const r = await fetch(`${apiBase()}/api/health?selftest=request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deep, vid: vidOf() }) });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(j.error || `서버 ${r.status}`);
    emit({ cloudId: j.id, stage: j.position ? `앞에 ${j.position}개가 기다리고 있어요` : '점검 서버가 받아 가기를 기다리는 중… (최대 2~3분)' });
    pollCloud();
  } catch (e: any) {
    emit({ running: false, done: false, stage: `클라우드 점검을 맡기지 못했어요: ${String(e?.message || e).slice(0, 80)}` });
  }
}

const STATUS_TEXT: Record<string, string> = { queued: '점검 서버가 받아 가기를 기다리는 중… (최대 2~3분)', running: '아이폰 모양 브라우저로 점검 중' };
async function pollCloud() {
  window.clearTimeout(pollTimer);
  if (!state.running || !state.cloudId) return;
  // 화면을 보고 있을 때만 자주 확인 (안 볼 땐 돌아왔을 때 확인)
  if (document.visibilityState === 'hidden') { document.addEventListener('visibilitychange', () => pollCloud(), { once: true }); return; }
  try {
    const r = await fetch(`${apiBase()}/api/health?selftest=status&id=${state.cloudId}`, { cache: 'no-store' });
    const j = await r.json();
    if (r.ok) {
      const results = Array.isArray(j.results) ? j.results : state.results;
      if (j.status === 'done' || j.status === 'cancel' || j.status === 'error') { emit({ results }); finishCloud(j.status, j.error); return; }
      emit({ results, stage: j.stage ? `${j.status === 'running' ? '☁︎ ' : ''}${j.stage}` : STATUS_TEXT[j.status] || j.status });
    } else if (r.status === 404) { finishCloud('error', '점검 기록을 찾지 못했어요'); return; }
  } catch { /* 다음에 */ }
  pollTimer = window.setTimeout(pollCloud, 8000);
}

function finishCloud(status: string, error?: string) {
  window.clearTimeout(pollTimer);
  const stopped = status === 'cancel';
  emit({ running: false, done: true, endedAt: Date.now(), stopped, stage: stopped ? '중단했어요' : status === 'error' ? `점검이 멈췄어요: ${error || ''}` : '끝났어요', cloudId: undefined });
  try { if (state.results.length) localStorage.setItem(EST_KEY(state.deep), String(state.results.length)); } catch { /* */ }
  pushHistory({ id: String(state.startedAt), deep: state.deep, startedAt: state.startedAt, endedAt: state.endedAt, results: state.results, cloud: true, ...(stopped ? { stopped: true } : {}), ...(status === 'error' ? { interrupted: true } : {}) });
}

/** 멈춘 점검을 기록으로만 남기고 지움 */
export function discardInterrupted() {
  if (!state.interrupted) return;
  if (state.results.length) pushHistory({ id: String(state.startedAt), deep: state.deep, startedAt: state.startedAt, endedAt: Date.now(), interrupted: true, results: state.results });
  emit({ interrupted: false, results: [], stage: '', done: false });
}
