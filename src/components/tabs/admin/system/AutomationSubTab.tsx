import { BackupCard } from './BackupCard';
import { ReadStatsCard } from './ReadStatsCard';
import { DataCheckCard } from './DataCheckCard';
import React, { useCallback, useEffect, useState } from 'react';
import { WeeklyReportCard } from './WeeklyReportCard';
import { AdminSecurityCard } from './AdminSecurityCard';
import { SelfTestCard } from './SelfTestCard';
import { SearchTuningCard } from './SearchTuningCard';
import { ClientErrorsCard } from './ClientErrorsCard';
import { TestModeCard } from './TestModeCard';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw } from 'lucide-react';
import { auth, db } from '../../../../lib/firebase';

/**
 * 관리자 > 시스템 > 자동 시스템
 * 사이트가 혼자 돌리는 일들(알림 자동 확인, 검색 색인 채우기, 채널 영상·쇼츠·재생목록 받기)의 상태를 보고 바로 실행
 * - 이 화면을 열 때만 문서 몇 개를 읽음 (방문자 읽기와 무관)
 */
const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const ago = (ms?: number | string | null) => {
  const t = typeof ms === 'string' ? Date.parse(ms) : Number(ms || 0);
  if (!t) return '기록 없음';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 ${m % 60}분 전`;
  return `${Math.floor(m / 1440)}일 전`;
};

function Card({ title, ok, children }: { title: string; ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        {ok === null ? <Activity className="w-4 h-4 text-zinc-400" /> : ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60';

export function AutomationSubTab() {
  const [tick, setTick] = useState<any>(null);
  const [index, setIndex] = useState<any>(null);
  const [caches, setCaches] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Record<string, string>>({});
  const [autoLogOn, setAutoLogOn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [t, up, sh, pl] = await Promise.all([
      getDoc(doc(db, 'notification_state', 'main')).then((s) => s.data()).catch(() => null),
      getDoc(doc(db, 'youtube_cache', 'uploads')).then((s) => s.data()).catch(() => null),
      getDoc(doc(db, 'youtube_cache', 'shorts')).then((s) => s.data()).catch(() => null),
      getDoc(doc(db, 'youtube_cache', 'playlists')).then((s) => s.data()).catch(() => null),
    ]);
    setTick(t);
    getDoc(doc(db, 'config', 'system')).then((s) => { setAutoLogOn(s.data()?.autoLogEnabled !== false); setYtSyncOn(s.data()?.autoYtSyncEnabled !== false); setVoiceRef(String(s.data()?.voiceRef || '')); setHotfixOn(s.data()?.autoHotfixEnabled !== false); setHotfix(s.data()?.autoHotfix || null); }).catch(() => { setAutoLogOn(null); setYtSyncOn(null); });
    getDoc(doc(db, 'youtube_cache', 'yt_sync_state')).then((s) => setYtSync(s.data() || null)).catch(() => setYtSync(null));
    setCaches({ uploads: up, shorts: sh, playlists: pl });
    fetch(`${API_BASE}/api/videos/search-index?status=1`).then((r) => r.json()).then(setIndex).catch(() => setIndex(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [ytSyncOn, setYtSyncOn] = useState<boolean | null>(null);
  const [voiceRef, setVoiceRef] = useState('');
  const [hotfixOn, setHotfixOn] = useState<boolean | null>(null);
  const [hotfix, setHotfix] = useState<any>(null);
  const [ytSync, setYtSync] = useState<any>(null);
  const run = async (key: string, url: string, admin = false) => {
    setBusy(key);
    try {
      const headers: Record<string, string> = {};
      if (admin) headers.Authorization = `Bearer ${await auth.currentUser?.getIdToken()}`;
      const r = await fetch(`${API_BASE}${url}`, { headers });
      const text = await r.text();
      let summary = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(text);
        summary = j.error ? `오류: ${j.error}` : j.skipped ? '50초 안에 이미 실행돼서 건너뜀' : Array.isArray(j.videos) ? `영상 ${j.videos.length}개` : Array.isArray(j.shorts) ? `쇼츠 ${j.shorts.length}개` : Array.isArray(j.playlists) ? `재생목록 ${j.playlists.length}개` : JSON.stringify(j).slice(0, 160);
      } catch { /* 글자 그대로 */ }
      setOut((o) => ({ ...o, [key]: summary }));
      await load();
    } catch (e: any) {
      setOut((o) => ({ ...o, [key]: `실패: ${e?.message || e}` }));
    } finally {
      setBusy(null);
    }
  };

  const lastRun = Number(tick?.lastRunAt || 0);
  const tickOk = lastRun ? Date.now() - lastRun < 15 * 60000 : false;
  const sources = Object.entries((tick?.lastBySource || {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={load} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}><RefreshCw className="w-3.5 h-3.5" /> 새로 보기</button>
      </div>
      <ReadStatsCard />
      <BackupCard />
      <AdminSecurityCard />
      <SelfTestCard />
      <WeeklyReportCard />
      <DataCheckCard />
      <SearchTuningCard />
      <ClientErrorsCard />

      <Card title="알림 자동 확인 (방송 시작·유력 시간)" ok={tick ? tickOk : null}>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">마지막 실행: <b>{ago(lastRun)}</b>{tick?.lastResult?.live ? ` · 방송 ${tick.lastResult.live}` : ''}{tick?.lastResult?.prob?.final != null ? ` · 확률 ${Number(tick.lastResult.prob.final).toFixed(0)}%` : ''}</p>
        {sources.length > 0 && (
          <p className="text-[11px] text-zinc-500">최근 실행 출처: {sources.map(([k, v]) => `${({ app: '사이트 방문자', github: 'GitHub 예약', worker: 'Cloudflare', cronjob: 'cron-job.org', admin: '관리자' } as any)[k] || k} ${ago(v)}`).join(' · ')}</p>
        )}
        {!tickOk && (
          <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5">
            15분 넘게 실행이 없어요. 아무도 사이트를 안 보고 있고 GitHub 예약이 밀린 상태일 수 있어요. 저장소의 <code>ops/cron-worker/README.md</code> 대로 기존 Cloudflare 워커(chzzk-checker)를 새 코드로 한 번 다시 배포하면 1분마다 정확히 돌아요.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy === 'tick'} onClick={() => run('tick', '/api/notifications/tick?src=admin')} className={`${btn} bg-purple-600 text-white`}>
            {busy === 'tick' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} 지금 확인 실행
          </button>
          {out.tick && <span className="text-[11px] text-zinc-500 truncate">{out.tick}</span>}
        </div>
      </Card>

      <Card title="방송 기록 자동 만들기 (방송이 끝나면)" ok={autoLogOn === null ? null : autoLogOn}>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          방송이 끝나는 순간 시작·종료 시각, 방송 길이, 치지직 카테고리(게임), 유튜브 동시 송출 링크로 기록을 만들어요. 같은 날 비슷한 시각(±90분)에 관리자가 이미 기록했으면 만들지 않아요. 예전 Cloudflare 워커(chzzk-checker)가 하던 일이에요.
        </p>
        {tick?.lastAutoLog && (
          <p className="text-[11px] text-zinc-500">
            마지막: {ago(tick.lastAutoLog.at)} · {tick.lastAutoLog.ok ? `${tick.lastAutoLog.date} ${tick.lastAutoLog.time}~${tick.lastAutoLog.endTime} (${tick.lastAutoLog.game || '카테고리 없음'}) 만듦` : `안 만듦: ${tick.lastAutoLog.reason}`}
          </p>
        )}
        <button
          type="button"
          disabled={autoLogOn === null || busy === 'autolog'}
          onClick={async () => {
            setBusy('autolog');
            try { await setDoc(doc(db, 'config', 'system'), { autoLogEnabled: !autoLogOn }, { merge: true }); setAutoLogOn(!autoLogOn); } catch (e: any) { setOut((o) => ({ ...o, autolog: `실패: ${e?.message || e}` })); }
            setBusy(null);
          }}
          className={`${btn} ${autoLogOn ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-purple-600 text-white'}`}
        >
          {autoLogOn ? '끄기' : '켜기'}
        </button>
        {out.autolog && <p className="text-[11px] text-red-500">{out.autolog}</p>}
      </Card>

      <Card title="예약 실행 (Cloudflare 워커)" ok={tick?.lastBySource?.cf ? Date.now() - Number(tick.lastBySource.cf) < 5 * 60000 : null}>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          Cloudflare 워커(chzzk-checker)가 1분마다 깨어나서 알림 점검·AI 분석·편집본 자동 연결·방송 기록 검사·클라우드/주간 점검 깨우기를 제때 불러요. 워커가 살아 있으면 GitHub 예약 실행은 건너뛰고, 워커가 멈추면 GitHub 쪽이 대신 해요.
        </p>
        <p className="text-[11px] text-zinc-500">워커가 마지막으로 부른 때: {tick?.lastBySource?.cf ? ago(new Date(Number(tick.lastBySource.cf)).toISOString()) : '아직 없음'}</p>
      </Card>

      <Card title="새 편집 영상 → 방송 기록 편집본 자동 연결" ok={ytSyncOn === null ? null : ytSyncOn}>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          유튜브에 새 영상이 올라오면, 올린 날 전 14일 안의 방송 기록 중 영상 제목·설명에 그 방송 게임 이름이 들어 있는 가장 가까운 기록의 '편집본'에 넣어요. 게임 이름이 안 맞거나 같은 날 기록이 여러 개면 넣지 않아요 (확실할 때만). 넣은 것은 이력에서 되돌릴 수 있어요.
        </p>
        {ytSync?.last && <p className="text-[11px] text-zinc-500">마지막: {ago(ytSync.last.at)} · 연결 {ytSync.last.linked}개 · 건너뜀 {ytSync.last.skipped}개</p>}
        <button
          type="button"
          disabled={ytSyncOn === null || busy === 'ytsync'}
          onClick={async () => {
            setBusy('ytsync');
            try { await setDoc(doc(db, 'config', 'system'), { autoYtSyncEnabled: !ytSyncOn }, { merge: true }); setYtSyncOn(!ytSyncOn); } catch (e: any) { setOut((o) => ({ ...o, ytsync: `실패: ${e?.message || e}` })); }
            setBusy(null);
          }}
          className={`${btn} ${ytSyncOn ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-purple-600 text-white'}`}
        >
          {ytSyncOn ? '끄기' : '켜기'}
        </button>
        {out.ytsync && <p className="text-[11px] text-red-500">{out.ytsync}</p>}
      </Card>

      <TestModeCard />

      <Card title="사이트 수정 → 자동 버전·패치 진행 안내 공지" ok={hotfixOn === null ? null : hotfixOn}>
        <p className="text-[11px] text-zinc-500 break-keep">패치노트를 따로 쓰지 않고 올린 수정이 쌓이면, 마지막 수정 뒤 20분 동안 더 없을 때 버전을 올리고(새 기능 1.2.0→1.2.1, 고치기만 1.2.0→1.2.0.1) 패치노트 글과 '[안내] 11/20(금) 19:22 패치 진행 사항 안내' 띠 공지를 자동으로 올려요.</p>
        {hotfix?.version && <p className="text-[11px] text-zinc-500">마지막: v{hotfix.version} · {ago(hotfix.at)}{hotfix.ai === false ? ' · AI 없이 수정 메모로 씀' : ''}</p>}
        <button type="button" disabled={hotfixOn === null || busy === 'hotfix'} onClick={async () => {
          setBusy('hotfix');
          try { await setDoc(doc(db, 'config', 'system'), { autoHotfixEnabled: !hotfixOn }, { merge: true }); setHotfixOn(!hotfixOn); } catch (e: any) { setOut((o) => ({ ...o, hotfix: `실패: ${e?.message || e}` })); }
          setBusy(null);
        }} className={`${btn} ${hotfixOn ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-purple-600 text-white'}`}>{hotfixOn ? '끄기' : '켜기'}</button>
        {out.hotfix && <p className="text-[11px] text-red-500">{out.hotfix}</p>}
      </Card>

      <Card title="스크립트: 우주하마 목소리 예시" ok={voiceRef ? true : null}>
        <p className="text-[11px] text-zinc-500 break-keep">우주하마 혼자 또렷하게 말하는 10~40초 구간을 적어 두면, 스크립트를 받아 적을 때 이 목소리와 후원 TTS·다른 사람 목소리를 구분하는 데 써요. 형식: 유튜브 주소@시작초-끝초 (예: https://youtu.be/abcdEFGhijk@120-140)</p>
        <div className="flex gap-2">
          <input value={voiceRef} onChange={(e) => setVoiceRef(e.target.value)} placeholder="https://youtu.be/…@120-140" className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs" />
          <button type="button" disabled={busy === 'voice'} onClick={async () => {
            setBusy('voice');
            try { await setDoc(doc(db, 'config', 'system'), { voiceRef: voiceRef.trim() }, { merge: true }); setOut((o) => ({ ...o, voice: '저장했어요 (10분 안에 반영)' })); } catch (e: any) { setOut((o) => ({ ...o, voice: `실패: ${e?.message || e}` })); }
            setBusy(null);
          }} className={`${btn} bg-purple-600 text-white`}>저장</button>
        </div>
        {out.voice && <p className="text-[11px] text-zinc-500">{out.voice}</p>}
      </Card>

      <Card title="검색 색인 (태그·썸네일 글자·게임 키워드)" ok={index ? !index.lastError || Boolean(index.count) : null}>
        {index ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
            <p>영상 <b>{index.count}</b>개 · 썸네일 대기 <b>{index.waitingThumbnail ?? '-'}</b>개 · 게임 키워드 <b>{index.games}</b>개</p>
            <p className="text-[11px] text-zinc-500">오늘 새로 {index.newToday}개 · 썸네일 {index.thumbnailsToday}개 · 마지막 갱신 {ago(index.updatedAt)}{index.restingUntil ? ` · 한도 때문에 ${ago(index.restingUntil).replace(' 전', ' 후')}까지 쉬는 중` : ''}</p>
            {index.lastError && <p className="text-[11px] text-amber-600 break-all">마지막 오류({ago(index.lastErrorAt)}): {String(index.lastError).slice(0, 160)}</p>}
            <p className="text-[11px] text-zinc-500">방문자가 추천 영상 탭을 열어 두면 조금씩 채워져요. 하루 한도·잠금으로 비용이 제한돼요.</p>
          </div>
        ) : <p className="text-xs text-zinc-500">불러오는 중…</p>}
      </Card>

      <Card title="유튜브 채널 목록" ok={caches.uploads ? Boolean(caches.uploads?.fetchedAt) : null}>
        {([
          ['uploads', '일반 영상 전체', '/api/videos/shorts?kind=uploads&refresh=1', '12시간마다 자동'],
          ['shorts', '쇼츠 전체', '/api/videos/shorts?refresh=1', '12시간마다 자동'],
          ['playlists', '재생목록', '/api/videos/playlists?refresh=1', '관리자가 새로 받을 때만'],
        ] as const).map(([key, label, url, note]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-t border-zinc-100 dark:border-zinc-800 first:border-0">
            <div className="text-xs">
              <b className="text-zinc-800 dark:text-zinc-100">{label}</b>
              <span className="ml-1.5 text-zinc-500">{caches[key]?.count != null ? `${caches[key].count}개 · ` : ''}받은 때 {ago(caches[key]?.fetchedAt)} · {note}</span>
              {out[key] && <span className="block text-[11px] text-zinc-500">{out[key]}</span>}
            </div>
            <button type="button" disabled={busy === key} onClick={() => run(key, url, true)} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>
              {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 지금 새로 받기
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
