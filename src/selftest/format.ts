import type { StepResult } from './runner';

/** 점검 결과를 글로 (의견 첨부·복사용) */
export const resultText = (results: StepResult[]) => {
  const fail = results.filter((r) => !r.ok).length;
  const warn = results.filter((r) => r.warn).length;
  return [`앱 점검 ${results.length}개 · 문제 ${fail}개 · 주의 ${warn}개`, ...results.map((r) => `${r.ok ? (r.warn ? '⚠️' : '✅') : '❌'} [${r.group}] ${r.name}${r.err ? ` — ${r.err}` : ''} (${r.ms}ms)${(r.details || []).slice(0, 12).map((d) => `\n    · ${d}`).join('')}`)].join('\n');
};

