/**
 * 주간 점검: 결과 모아서
 *  1) 사이트에 보고 (관리자 › 시스템 › 자동화 › 주간 점검 보고서) — 서버가 피드백·오류·DB·AI 분석을 더해 저장
 *  2) GitHub 실행 화면에 요약표
 *  3) 문제가 있으면 GitHub 이슈 '주간 점검' 에 남김 (정기 버그 수정 때 이걸 보고 고침, 개인 정보 없음)
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const OUT = 'weekly-out';
const read = (f) => { try { return JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8')); } catch { return null; } };
const env = process.env;

const vitest = read('vitest.json');
const results = {
  static: {
    tsc: env.TSC_OK === 'success',
    build: env.BUILD_OK === 'success',
    vitest: vitest ? { total: vitest.numTotalTests, failed: vitest.numFailedTests, failedNames: (vitest.testResults || []).flatMap((f) => (f.assertionResults || []).filter((a) => a.status === 'failed').map((a) => a.fullName)).slice(0, 20) } : { total: 0, failed: env.VITEST_OK === 'success' ? 0 : 1 },
    bundleKB: Number(env.BUNDLE_KB || 0),
    audit: read('audit.json')?.metadata?.vulnerabilities || null,
  },
  e2e: read('e2e.json'),
  live: read('live-ui.json'),
  api: read('api-db.json'),
  selftest: read('selftest.json'),
};

let server = null;
try {
  const r = await fetch('https://uzuhama.vercel.app/api/health?weekly=report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: env.GITHUB_RUN_ID, results }),
    signal: AbortSignal.timeout(90000),
  });
  server = await r.json().catch(() => null);
  console.log('사이트 보고:', r.status, JSON.stringify(server));
} catch (e) { console.log('사이트 보고 실패:', e?.message || e); }

const fails = server?.fails || [];
const lu = results.live?.summary || {};
const ad = results.api?.summary || {};
const line = (ok, name, detail = '') => `| ${ok ? '✅' : '❌'} | ${name} | ${detail} |`;
const md = [
  `## 주간 점검 ${new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} (한국 시간)`,
  '',
  '| | 항목 | 결과 |',
  '|---|---|---|',
  line(results.static.tsc, '타입 검사'),
  line(!results.static.vitest.failed, '로직 테스트 (vitest)', `${results.static.vitest.total - results.static.vitest.failed}/${results.static.vitest.total}`),
  line(results.static.build, '빌드', results.static.bundleKB ? `${results.static.bundleKB}KB` : ''),
  line(!results.e2e?.failed, 'e2e (화면 눌러 보기)', results.e2e ? `${results.e2e.total - results.e2e.failed}/${results.e2e.total}` : '결과 없음'),
  line(!lu.pageErrors && !lu.loadFail, '실제 사이트 화면', `${lu.pages || 0}화면 · 안 열림 ${lu.loadFail || 0} · 페이지 오류 ${lu.pageErrors || 0}`),
  line(!lu.consoleErrors, '개발자 콘솔', `오류 ${lu.consoleErrors || 0} · 실패한 요청 ${lu.failedRequests || 0}`),
  line(!lu.overflowPages && !lu.brokenImages, 'UI/UX', `가로 넘침 ${lu.overflowPages || 0} · 깨진 이미지 ${lu.brokenImages || 0} · 작은 버튼 최대 ${lu.smallTargetsMax || 0} · 이름 없는 버튼 최대 ${lu.unlabeledButtonsMax || 0} · 가장 느린 첫 화면 ${lu.slowestMs || 0}ms`),
  line(!ad.failed, 'API·Vercel·DB·보안', `${(ad.total || 0) - (ad.failed || 0)}/${ad.total || 0}`),
  line(results.selftest && !results.selftest.summary?.failed && !results.selftest.error, '화면·기능 전체 점검 (연결 동작)', results.selftest ? `${(results.selftest.summary?.total || 0) - (results.selftest.summary?.failed || 0)}/${results.selftest.summary?.total || 0}${results.selftest.error ? ` · ${results.selftest.error}` : ''}` : '결과 없음'),
  line(server?.ok !== undefined, '피드백 총정리·방문자 오류 (사이트에 저장)', server ? `피드백 ${server.feedback?.total ?? 0}건 (처리 안 됨 ${server.feedback?.pending ?? 0}) · 화면 오류 ${server.clientErrors ?? 0}건` : '보고 실패'),
  '',
  fails.length ? `### 고칠 것\n${fails.map((f) => `- ${f}`).join('\n')}` : '### 문제 없음 🎉',
  '',
  ...(results.api?.checks || []).filter((c) => !c.ok).map((c) => `- ❌ [${c.group}] ${c.name}: ${c.detail}`),
  ...(results.api?.checks || []).filter((c) => c.warn).map((c) => `- ⚠️ [${c.group}] ${c.name}: ${c.detail}`),
  ...(results.e2e?.results || []).filter((r) => !r.ok).map((r) => `- ❌ [e2e] ${r.name}: ${r.err}`),
  ...(results.selftest?.results || []).filter((r) => !r.ok).map((r) => `- ❌ [전체 점검·${r.group}] ${r.name}: ${r.err}`),
  ...(results.selftest?.results || []).filter((r) => r.warn).map((r) => `- ⚠️ [전체 점검·${r.group}] ${r.name}: ${r.err}`),
  ...(results.static.vitest.failedNames || []).map((n) => `- ❌ [테스트] ${n}`),
  ...(results.live?.runs || []).filter((r) => !r.ok || r.pageerror?.length || r.console?.length || r.overflow > 2 || r.broken?.length).slice(0, 15)
    .map((r) => `- ❌ [화면] ${r.host.replace('https://', '')} ${r.view}/${r.scheme} ${r.page}: ${[r.err, ...(r.pageerror || []), ...(r.console || []).slice(0, 2), r.overflow > 2 ? `가로 넘침 ${r.overflow}px (${(r.wide || []).join(', ')})` : '', ...(r.broken || []).slice(0, 2)].filter(Boolean).join(' / ').slice(0, 300)}`),
  '',
  `화면 사진·전체 결과: 이 실행의 Artifacts › weekly-out`,
].join('\n');
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md);
console.log(md);

// 문제 있으면 이슈
const problems = md.split('\n').filter((l) => l.startsWith('- ❌'));
if ((fails.length || problems.length) && env.GITHUB_TOKEN && env.GITHUB_REPOSITORY) {
  const api = (p, o = {}) => fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}${p}`, { ...o, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  const body = `${md}\n\n실행: ${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const open = await (await api('/issues?state=open&labels=weekly-check&per_page=1')).json().catch(() => []);
  if (Array.isArray(open) && open[0]) await api(`/issues/${open[0].number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  else await api('/issues', { method: 'POST', body: JSON.stringify({ title: `주간 점검: 고칠 것 ${fails.length || problems.length}개`, body, labels: ['weekly-check'] }) });
}
if (existsSync(`${OUT}/e2e.json`) === false) console.log('(e2e 결과 파일 없음)');
