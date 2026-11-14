import { useEffect, useMemo, useRef, useState } from 'react';
import { cafeCollectorBookmarklet } from '../../../utils/cafeCollector';
import { CheckSquare, ClipboardPaste, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog, LinkItem } from '../../../types';
import { cn } from '../../../utils';
import { blocksToPlanInput, isEmptyLog, parseCafeBlocks, parseCafePost, planCafeImport, youtubeIdOf, type CafeDay, type CafeLink, type CafeMulti, type CafePlan, type CafeUnsure } from '../../../utils/cafeImport';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useChannelVideos } from '../../../hooks/useChannelVideos';
import { confirmSheet } from '../../../utils/ui';

/**
 * 관리자 > 기록 추가 > 카페 정리 글 가져오기
 * 팬카페의 '영상 생방링크 정리' 글을 통째로 붙여 넣으면 날짜별로 나눠서,
 * 기록에 없는 생방·영상·쇼츠 링크만 골라 미리 보여 주고, 확인한 것만 반영
 * - 이미 있는 링크는 건너뜀 (영상 ID 로 비교, 다른 날 기록에 있는 영상도 건너뛰고 알려 줌)
 * - 그날 기록이 없으면 새 기록으로 (시작 시각 등은 비워 둠)
 */
type Plan = CafePlan;

export function AdminCafeImport({ data, onAddLog, onUpdateLog, onDeleteLog }: {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog?: (log: BroadcastLog) => Promise<void>;
  onDeleteLog?: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [days, setDays] = useState<CafeDay[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const channelVideos = useChannelVideos();
  const titleOf = useMemo(() => new Map(channelVideos.map((v) => [v.videoId, v.title] as const)), [channelVideos]);
  // 유튜브가 알려 준 날짜 (한국 시간): 생방 날짜는 카페 글보다 이게 정확
  const dateOf = useMemo(() => new Map(channelVideos.filter((v) => v.publishedAt).map((v) => [v.videoId, new Date(Date.parse(v.publishedAt) + 9 * 3600000).toISOString().slice(0, 10)] as const)), [channelVideos]);

  /**
   * 영상 링크 기준으로 맞춤:
   * 1) 사이트에 이미 있는 영상이면 → 그 영상이 들어 있는 방송 기록에, 없는 생방 링크만 추가
   * 2) 사이트에 없는 영상이면 → 글의 날짜 기록에 영상·생방 추가 (그날 기록이 없으면 새 기록)
   */
  const { plans, skipped, already } = useMemo(() => planCafeImport(days || [], Object.values(data.logs || {}) as BroadcastLog[], titleOf, dateOf), [days, data.logs, titleOf, dateOf]);

  const [multis, setMultis] = useState<CafeMulti[]>([]);
  const [unsure, setUnsure] = useState<CafeUnsure[]>([]);
  const analyze = () => {
    // 2026년 이후는 사이트가 자동으로 기록해서 카페 글에서는 빼고 가져옴
    // '[생방날짜: …]' 묶음 글(카페 모으기로 가져온 월별·웃음참기 정리)은 묶음 단위로 읽음
    if (/\[\s*생방\s*날짜/.test(text)) {
      const r = blocksToPlanInput(parseCafeBlocks(text), dateOf);
      setDays(r.days); setMultis(r.multis); setUnsure(r.unsure);
      setMessage(r.days.length || r.multis.length ? '' : '[생방날짜: …] 묶음에서 유튜브 링크를 찾지 못했어요.');
    } else {
      const parsed = parseCafePost(text).filter((d) => d.date < '2026-01-01');
      setDays(parsed); setMultis([]); setUnsure([]);
      setMessage(parsed.length ? '' : '날짜(예: [생방날짜: 2017. 3. 31])와 유튜브 링크를 찾지 못했어요.');
    }
    setPicked(new Set());
  };
  // 여러 날 생방 영상(웃음참기처럼): 이미 그렇게 연결돼 있으면 빼고
  const multiPlans = useMemo(() => {
    const logs = Object.values(data.logs || {}) as any[];
    return multis.filter((m) => {
      const linked = logs.filter((l) => (l.edited || []).some((e: any) => youtubeIdOf(e?.url || '') === m.video.id && (e.multiId || e.compilationId)));
      return linked.length < m.lives.length;
    }).map((m) => ({ ...m, key: `multi:${m.video.id}` }));
  }, [multis, data.logs]);
  // 분석이 끝나면 모두 선택해 둠
  const actionable = [...plans, ...multiPlans];
  if (days && picked.size === 0 && actionable.length && !busy && !message.startsWith('반영')) {
    setPicked(new Set(actionable.map((p) => p.key)));
  }

  const toItem = (l: CafeLink, fallback: string): LinkItem => ({ title: l.title || fallback, url: l.url, ...(source.trim() ? { source: source.trim() } : {}) } as any);

  const apply = async () => {
    const todo = plans.filter((p) => picked.has(p.key));
    const todoMulti = multiPlans.filter((m) => picked.has(m.key));
    if (!todo.length && !todoMulti.length) return;
    if (!await confirmSheet(`${todo.length}일치 기록에 반영할까요?\n(새 기록 ${todo.filter((p) => p.status === 'new-log').length}개 포함${todoMulti.length ? `, 여러 생방 영상 ${todoMulti.length}개 연결` : ''})`)) return;
    setBusy({ done: 0, total: todo.length + todoMulti.length });
    let ok = 0;
    const fails: string[] = [];
    // 반영하는 동안 바뀐 기록을 따라가며 씀 (같은 기록을 두 번 고쳐도 앞의 것이 지워지지 않게)
    const work: Record<string, any> = { ...(data.logs as any) };
    const save = async (l: any) => { await onUpdateLog!(l); work[l.id] = l; };
    for (const p of todo) {
      try {
        if (p.log) {
          if (!onUpdateLog) throw new Error('기록 수정 기능을 못 찾았어요');
          const cur: any = work[p.log.id] || p.log;
          // 다른 기록에서 옮겨 오는 영상은 원래 항목(제목·출처) 그대로
          const moved = p.moves.map((m) => (m.from.edited || []).find((e: any) => youtubeIdOf(e?.url || '') === m.video.id) || toItem(m.video, '편집본'));
          await save({
            ...cur,
            vods: [...(cur.vods || []), ...p.lives.map((l) => toItem(l, '생방송'))],
            edited: [...(cur.edited || []), ...p.videos.map((l) => toItem(l, '편집본')), ...moved],
            shorts: [...(cur.shorts || []), ...p.shorts.map((l) => toItem(l, '쇼츠'))],
          });
          // 옮긴 영상은 원래 기록에서 빼고, 빈 기록이 되면 지움
          const bySrc = new Map<string, string[]>();
          p.moves.forEach((m) => bySrc.set(m.from.id, [...(bySrc.get(m.from.id) || []), m.video.id]));
          for (const [srcId, ids] of bySrc) {
            const src: any = work[srcId];
            if (!src) continue;
            const next = { ...src, edited: (src.edited || []).filter((e: any) => !ids.includes(youtubeIdOf(e?.url || '') || '')) };
            if (isEmptyLog(next) && onDeleteLog) { await onDeleteLog(srcId); delete work[srcId]; }
            else await save(next);
          }
        } else {
          const nl: any = {
            id: `cafe_${p.date.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`,
            date: p.date, time: '', game: '', games: [], category: '', durationHours: 0,
            vods: p.lives.map((l) => toItem(l, '생방송')),
            edited: p.videos.map((l) => toItem(l, '편집본')),
            shorts: p.shorts.map((l) => toItem(l, '쇼츠')),
            ...(source.trim() ? { source: source.trim() } : {}),
          };
          await onAddLog(nl);
          work[nl.id] = nl;
        }
        ok++;
      } catch (e: any) { console.error('cafe import', p.date, e); fails.push(`${p.date}: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total: todo.length + todoMulti.length });
    }
    // 여러 날 생방 영상: 몰아보기 › 웃음참기 등록과 같은 모양 (compilations 의 kind 'multi' + 각 생방 기록에 multiId 영상)
    for (const m of todoMulti) {
      try {
        if (!onUpdateLog) throw new Error('기록 수정 기능을 못 찾았어요');
        const all = Object.values(work) as any[];
        const hits = m.lives
          .map((lv) => ({ lv, log: all.find((l) => (l.vods || []).some((v: any) => youtubeIdOf(typeof v === 'string' ? v : v?.url || '') === lv.id)) }))
          .filter((x) => x.log);
        if (hits.length < 2) throw new Error(`생방이 들어 있는 기록을 ${hits.length}개만 찾았어요 (그날 기록부터 반영해 주세요)`);
        const compId = `multi_${m.video.id}`;
        const url = `https://youtu.be/${m.video.id}`;
        const title = m.video.title || titleOf.get(m.video.id) || '영상';
        const dates = hits.map((h) => h.log.date).sort();
        const createdAt = new Date().toISOString();
        await setDoc(doc(db, 'compilations', compId), {
          id: compId, kind: 'multi', title, url, createdAt, gameSortOrder: 'custom',
          broadcasts: hits.map((h) => ({ logId: h.log.id, date: h.log.date, games: [] })),
          ...(source.trim() ? { source: source.trim() } : {}),
        }, { merge: true });
        const seenLog = new Set<string>();
        for (const h of hits) {
          if (seenLog.has(h.log.id)) continue;
          seenLog.add(h.log.id);
          const cur: any = work[h.log.id] || h.log;
          const prev: any = (cur.edited || []).find((e: any) => youtubeIdOf(e?.url || '') === m.video.id && !e.isCompilation);
          const link: any = { ...(prev || {}), title: prev?.title || title, url: prev?.url || url, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt: prev?.createdAt || createdAt };
          const rest = (cur.edited || []).filter((e: any) => youtubeIdOf(e?.url || '') !== m.video.id && e.multiId !== compId);
          await save({ ...cur, edited: [link, ...rest] });
        }
        ok++;
      } catch (e: any) { console.error('cafe multi', m.video.id, e); fails.push(`「${m.video.title || m.video.id}」: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total: todo.length + todoMulti.length });
    }
    setBusy(null);
    setMessage(`반영했어요: ${ok}/${todo.length + todoMulti.length}개.${fails.length ? ` 실패 ${fails.length}개 — ${fails.slice(0, 3).join(' / ')}` : ' 아래 목록은 반영된 상태로 다시 계산돼요.'}`);
    setPicked(new Set());
  };

  const count = (k: Plan['status']) => plans.filter((p) => p.status === k).length;
  const liveCount = plans.reduce((a, p) => a + p.lives.length, 0);
  const toggle = (d: string) => setPicked((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 text-xs sm:text-sm text-purple-900 dark:text-purple-200 leading-relaxed">
        팬카페의 '영상 생방링크 정리' 글을 통째로 복사해서 붙여 넣으세요. 날짜별로 나눠서 <b>기록에 아직 없는 링크만</b> 보여 줘요.
        영상은 <b>생방이 들어 있는 방송 기록</b>에 같이 넣어요. 예전에 생방 없이 따로 만들어진 기록의 영상은 생방 기록으로 옮기고, 빈 기록은 지워요. 확인하고 고른 것만 반영돼요. 정리해 준 팬의 글 링크를 출처로 남겨 두면 좋아요.
      </div>

      <CafeCollectorHelp />

      <div className="space-y-3">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="출처 (선택): 카페 글 링크나 정리해 준 분 닉네임"
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'• 2022.05.06\n• 영상: 영상 제목, https://youtu.be/...\n• 게임: 게임 이름, https://store.steampowered.com/...\n• 생방: https://youtu.be/...'}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { /* 권한 없음 */ } }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">
            <ClipboardPaste className="w-4 h-4" /> 붙여넣기
          </button>
          <button type="button" onClick={analyze} disabled={!text.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
            <Wand2 className="w-4 h-4" /> 분석하기
          </button>
        </div>
        {message && <p className="text-xs font-bold text-purple-700 dark:text-purple-300">{message}</p>}
      </div>

      {days && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {plans.some((p) => p.moves.length) && <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 font-bold">옮길 영상 {plans.reduce((a, p) => a + p.moves.length, 0)}</span>}
          <span className="font-bold">글에서 {days.length}일 · 영상 {days.reduce((a, d) => a + d.pairs.length, 0) + multis.length}개 · 생방 {days.reduce((a, d) => a + d.lives.length, 0)}개 찾음</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold">넣을 생방 링크 {liveCount}</span>
            {count('new-log') > 0 && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-bold">새 기록 {count('new-log')}</span>}
            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 font-bold">이미 있음 {already}</span>
            {actionable.length > 0 && (
              <button type="button" onClick={() => setPicked(picked.size === actionable.length ? new Set() : new Set(actionable.map((p) => p.key)))} className="ml-auto text-purple-600 font-bold cursor-pointer">
                {picked.size === actionable.length ? '모두 해제' : '모두 선택'}
              </button>
            )}
          </div>

          {plans.length === 0 ? (multiPlans.length ? null :
            <p className="text-xs text-zinc-500 py-4 text-center">{skipped.length ? `넣을 게 없어요. 건너뛴 링크 ${skipped.length}개는 아래에서 이유를 볼 수 있어요.` : '넣을 게 없어요. 글의 영상·생방이 이미 같은 기록에 함께 들어 있어요.'}</p>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              {plans.map((p) => (
                <div key={p.key} className="p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggle(p.key)} className="cursor-pointer" aria-label={`${p.date} 선택`}>
                      {picked.has(p.key) ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </button>
                    <span className="font-bold tabular-nums">{p.date}</span>
                    <span className={cn('px-1.5 py-0.5 rounded font-bold', p.status === 'add' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
                      {p.status === 'add' ? '기록에 추가' : '새 기록'}
                    </span>
                    {p.log && <span className="text-zinc-500 truncate">{p.log.game || (p.log.games || []).map((g) => g.name).join(', ')}</span>}
                  </div>
                  <ul className="mt-1.5 ml-6 space-y-0.5">
                    {p.via.map((v) => <li key={v.title} className="text-zinc-500">영상 「{v.title}」 기준</li>)}
                    {p.lives.map((l) => <li key={l.id}><b className="text-purple-600">+ 생방</b> <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-600 dark:text-zinc-300">{l.url}</a></li>)}
                    {p.videos.map((l) => <li key={l.id}><b className="text-red-600">+ 영상</b> {l.title || <i className="text-zinc-400">제목 없음</i>} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                    {p.moves.map((m) => <li key={`mv-${m.video.id}`}><b className="text-sky-600">↪ 영상 옮김</b> {m.video.title || m.video.id} <span className="text-zinc-400">(생방 없는 {m.from.date} 기록에서)</span></li>)}
                    {p.shorts.map((l) => <li key={l.id}><b className="text-pink-600">+ 쇼츠</b> {l.title || ''} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                    {p.notes.map((n) => <li key={n} className="text-amber-600">{n}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {multiPlans.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              <p className="p-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/30 break-keep">여러 날 생방이 들어간 영상 {multiPlans.length}개 — 웃음참기 등록과 같은 방식으로, 생방은 각 날짜 기록에 넣고 영상은 '생방 여러 개'로 연결해요</p>
              {multiPlans.map((m) => (
                <div key={m.key} className="p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggle(m.key)} className="cursor-pointer" aria-label={`${m.video.title} 선택`}>
                      {picked.has(m.key) ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </button>
                    <b className="text-indigo-600">영상</b>
                    <span className="truncate">{m.video.title || titleOf.get(m.video.id) || m.video.id}</span>
                  </div>
                  <p className="mt-1 ml-6 text-zinc-500 tabular-nums">생방 {m.lives.length}개: {m.lives.map((l) => l.date).join(', ')}</p>
                </div>
              ))}
            </div>
          )}

          {unsure.length > 0 && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer font-bold">날짜를 몰라서 넣지 않은 것 {unsure.length}개 (직접 확인)</summary>
              <ul className="mt-1.5 ml-4 list-disc space-y-0.5">{unsure.map((u, i) => (
                <li key={i} className="break-all">{u.why} · [생방날짜: {u.header}] · {u.video ? <a href={u.video.url} target="_blank" rel="noreferrer" className="underline">{u.video.title || u.video.id}</a> : u.lives.map((l) => l.id).concat(u.shorts.map((x) => x.id)).join(', ')} <span className="text-zinc-400">({u.post})</span></li>
              ))}</ul>
            </details>
          )}

          {skipped.length > 0 && (
            <details open={plans.length === 0} className="text-xs text-zinc-500">
              <summary className="cursor-pointer font-bold">건너뛴 링크 {skipped.length}개 (이유 보기)</summary>
              <ul className="mt-1.5 ml-4 list-disc space-y-0.5">{skipped.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
          )}

          {actionable.length > 0 && (
            <button type="button" onClick={apply} disabled={!picked.size || !!busy} className="w-full h-12 rounded-2xl bg-purple-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 반영 중 {busy.done}/{busy.total}</> : `선택한 ${picked.size}개 기록 반영하기`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 카페 정리 글 한 번에 모으기 (북마클릿) 안내 */
function CafeCollectorHelp() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => cafeCollectorBookmarklet(), []);
  // React 는 javascript: 주소를 막아서 직접 넣음
  useEffect(() => { ref.current?.setAttribute('href', code); }, [code]);
  return (
    <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-xs sm:text-sm" data-testid="cafe-collector">
      <summary className="font-bold cursor-pointer text-zinc-900 dark:text-white">카페 정리 글 한 번에 모으기 (PC · 북마크 버튼)</summary>
      <ol className="mt-3 space-y-1.5 list-decimal pl-5 text-zinc-600 dark:text-zinc-300 leading-relaxed break-keep">
        <li>아래 보라색 버튼을 브라우저 <b>북마크바로 끌어다 놓으세요</b>. (끌기가 안 되면 '코드 복사' → 북마크 추가 → 주소 칸에 붙여 넣기)</li>
        <li>네이버에 로그인한 상태로 카페의 <b>전체 목차 글</b>(예: cafe.naver.com/uzuhama/88678)을 열고 그 북마크를 누르세요.</li>
        <li>목차 글 → 연·월별 정리 글 → 그 안의 글까지 차례로 읽어요. 다 되면 카페 화면 오른쪽 위 창에서 <b>전부 복사</b>.</li>
        <li>여기 아래 칸에 붙여 넣고 <b>분석하기</b>. 생방 날짜는 유튜브 날짜를 기준으로 맞추고, 카페 글 날짜와 다르면 따로 알려 줘요.</li>
      </ol>
      <p className="mt-2 text-[11px] text-zinc-500 break-keep">로그인한 그 브라우저가 직접 읽어서 아이디·비밀번호는 어디에도 저장되지 않아요. 글 사이마다 잠깐씩 쉬면서 읽어요(한 번에 최대 400개).</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a ref={ref} onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-grab" title="북마크바로 끌어다 놓으세요">우주하마 카페 모으기</a>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* */ } }} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">{copied ? '복사했어요 ✓' : '코드 복사'}</button>
      </div>
    </details>
  );
}
