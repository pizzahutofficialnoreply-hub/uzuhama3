import { useEffect, useState } from 'react';
import type { StepResult } from './runner';
import { SELFTEST_FLAG } from './flag';

/**
 * 내 앱 점검을 화면 뒤에서: 창을 닫아도 계속 돌고, 헤더 아래 선으로 진행률을 보여 줌
 * - 점검용 안쪽 창(iframe)을 화면 뒤(맨 아래 층, 투명)에 붙여 두고 돌림 → 끝나면 지움
 */
export type BgState = { running: boolean; deep: boolean; results: StepResult[]; stage: string; done: boolean; startedAt: number; endedAt: number; estimate: number };
const EST_KEY = (deep: boolean) => `uzuhama_selftest_steps_${deep ? 'deep' : 'quick'}`;
let state: BgState = { running: false, deep: false, results: [], stage: '', done: false, startedAt: 0, endedAt: 0, estimate: 31 };
const subs = new Set<(s: BgState) => void>();
const emit = (patch: Partial<BgState>) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

export function useSelfTestBg() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  return s;
}
export const selfTestProgress = (s: BgState) => (s.done ? 1 : s.running ? Math.min(0.97, s.results.length / Math.max(1, s.estimate)) : 0);

export async function startSelfTestBg(deep: boolean) {
  if (state.running) return;
  let est = deep ? 39 : 31;
  try { est = Number(localStorage.getItem(EST_KEY(deep))) || est; } catch { /* */ }
  emit({ running: true, deep, results: [], stage: '점검할 화면을 불러오는 중…', done: false, startedAt: Date.now(), endedAt: 0, estimate: est });
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = '앱 점검 (화면 뒤)';
  // 화면 밖으로 보내면 브라우저가 멈춰 버릴 수 있어서, 화면 안 맨 아래 층에 투명하게
  Object.assign(frame.style, { position: 'fixed', left: '0', top: '0', width: '390px', height: '760px', opacity: '0', pointerEvents: 'none', zIndex: '-1', border: '0' });
  document.body.appendChild(frame);
  try { localStorage.setItem(SELFTEST_FLAG, String(Date.now() + 30 * 60 * 1000)); } catch { /* */ }
  try {
    const { runSelfTests } = await import('./runner');
    const out = await runSelfTests(frame, (r) => emit({ results: [...state.results, r], stage: `${r.group} · ${r.name}` }), {
      ...(deep ? {} : { skip: ['전부 눌러 보기'] }),
      onProgress: (t) => emit({ stage: t }),
    });
    try { localStorage.setItem(EST_KEY(deep), String(out.results.length)); } catch { /* */ }
    emit({ results: out.results });
  } catch (e: any) {
    emit({ stage: `점검이 멈췄어요: ${String(e?.message || e).slice(0, 80)}` });
  } finally {
    try { localStorage.removeItem(SELFTEST_FLAG); } catch { /* */ }
    frame.remove();
    emit({ running: false, done: true, endedAt: Date.now() });
  }
}
