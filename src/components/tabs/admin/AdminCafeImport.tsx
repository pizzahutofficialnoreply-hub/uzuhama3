import { useEffect, useMemo, useRef, useState } from 'react';
import { cafeCollectorBookmarklet } from '../../../utils/cafeCollector';
import { CheckSquare, ClipboardPaste, Loader2, ShieldCheck, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog, LinkItem } from '../../../types';
import { cn } from '../../../utils';
import { blocksToPlanInput, isEmptyLog, parseCafeBlocks, parseCafePost, planCafeImport, youtubeIdOf, type CafeBlock, type CafeDay, type CafeLink, type CafePlan, type CafeUnsure } from '../../../utils/cafeImport';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { AdminCafeUndo } from './AdminCafeUndo';
import { AdminCafeFix } from './AdminCafeFix';
import { AdminStreamErrors } from './AdminStreamErrors';
import { AdminSongImport } from './AdminSongImport';
import { AdminCategorySuggest } from './AdminCategorySuggest';
import { useChannelVideos } from '../../../hooks/useChannelVideos';
import { confirmSheet } from '../../../utils/ui';
import { loadFreshLogs } from '../../../hooks/useFirebaseData';
import { markChanged } from '../../../utils/changeLog';

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
  // 유튜브가 알려 준 실제 생방 시작 날짜 (한국 시간) — '유튜브로 날짜 확인'을 누르면 채움. 카페 글 날짜보다 우선
  const [apiLive, setApiLive] = useState<Map<string, string>>(new Map());
  // 영상 올린 날 (날짜 모르는 것 고를 때 참고)
  const [apiPub, setApiPub] = useState<Map<string, string>>(new Map());
  const [apiTitle, setApiTitle] = useState<Map<string, string>>(new Map());
  // 유튜브에서 찾을 수 없는 링크 (지워졌거나 비공개)
  const [apiGone, setApiGone] = useState<Set<string>>(new Set());
  const [verify, setVerify] = useState<{ done: number; total: number } | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [blocks, setBlocks] = useState<CafeBlock[] | null>(null);
  // 날짜 모르는 것: 직접 날짜를 골라 넣기
  const [unsurePick, setUnsurePick] = useState<Record<string, { on: boolean; dates: string[] }>>({});

  // 붙여 넣은 글에 나오는 유튜브 영상 id 전부 (가져온 것 관리에서 이 링크만 되돌리려고)
  const cafeIds = useMemo(() => new Set([...text.matchAll(/(?:youtu\.be\/|[?&]v=|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/g)].map((m) => m[1])), [text]);
  const blockRes = useMemo(() => (blocks ? blocksToPlanInput(blocks, apiLive) : null), [blocks, apiLive]);
  const unsure: (CafeUnsure & { key: string })[] = useMemo(() => (blockRes?.unsure || []).map((u, i) => ({ ...u, key: `u:${u.video?.id || u.lives[0]?.id || u.shorts[0]?.id || i}` })), [blockRes]);
  const unsureSuggest = (u: CafeUnsure) => u.lives.map((l) => apiLive.get(l.id)).find(Boolean) || (u.video ? apiPub.get(u.video.id) : '') || '';
  // 날짜를 골라 체크한 '날짜 모름' 것들을 날짜별 묶음에 더함
  const allDays: CafeDay[] | null = useMemo(() => {
    if (!blocks) return days;
    const out = new Map<string, CafeDay>((blockRes?.days || []).map((d) => [d.date, { ...d, lives: [...d.lives], videos: [...d.videos], shorts: [...d.shorts], pairs: [...d.pairs] }]));
    unsure.forEach((u) => {
      const pk = unsurePick[u.key];
      const ds = (pk?.dates || []).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x));
      // 날짜를 둘 이상 고른 영상은 아래 '여러 날 연결'로
      if (!pk?.on || !ds.length || (ds.length >= 2 && u.video)) return;
      const d = out.get(ds[0]) || { date: ds[0], lives: [], videos: [], shorts: [], pairs: [] };
      if (u.video) { d.pairs.push({ video: u.video, lives: u.lives }); d.videos.push(u.video); }
      u.lives.forEach((l) => d.lives.push(l));
      u.shorts.forEach((x) => d.shorts.push(x));
      out.set(ds[0], d);
    });
    return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [blocks, blockRes, days, unsure, unsurePick]);
  // 날짜를 여러 개 고른 '날짜 모름' 영상 → 그날들 방송 기록에 '생방 여러 개'로 연결
  const multis = useMemo(() => {
    const extra = unsure.flatMap((u) => {
      const ds = [...new Set((unsurePick[u.key]?.dates || []).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)))].sort();
      if (!unsurePick[u.key]?.on || ds.length < 2 || !u.video) return [];
      return [{ video: u.video, lives: ds.map((d) => ({ id: '', url: '', date: d })), post: u.post, byDate: true }];
    });
    return [...(blockRes?.multis || []), ...extra];
  }, [blockRes, unsure, unsurePick]);

  /**
   * 영상 링크 기준으로 맞춤:
   * 1) 사이트에 이미 있는 영상이면 → 그 영상이 들어 있는 방송 기록에, 없는 생방 링크만 추가
   * 2) 사이트에 없는 영상이면 → 글의 날짜 기록에 영상·생방 추가 (그날 기록이 없으면 새 기록)
   */
  const { plans, skipped, already } = useMemo(() => planCafeImport(allDays || [], Object.values(data.logs || {}) as BroadcastLog[], titleOf, apiLive), [allDays, data.logs, titleOf, apiLive]);

  const analyze = () => {
    // 2026년 이후는 사이트가 자동으로 기록해서 카페 글에서는 빼고 가져옴
    // '[생방날짜: …]' 묶음 글(카페 모으기로 가져온 월별·웃음참기 정리)은 묶음 단위로 읽음
    if (/\[\s*생방\s*날짜/.test(text)) {
      const b = parseCafeBlocks(text);
      const r = blocksToPlanInput(b, apiLive);
      setBlocks(b); setDays(r.days);
      setMessage(r.days.length || r.multis.length ? '' : '[생방날짜: …] 묶음에서 유튜브 링크를 찾지 못했어요.');
    } else {
      const parsed = parseCafePost(text).filter((d) => d.date < '2026-01-01');
      setBlocks(null); setDays(parsed);
      setMessage(parsed.length ? '' : '날짜(예: [생방날짜: 2017. 3. 31])와 유튜브 링크를 찾지 못했어요.');
    }
    setUnsurePick({});
    setPicked(new Set());
  };

  /** 유튜브 API 로 생방 실제 시작 날짜 확인 (영상 50개씩 · 한 번 확인한 건 사이트에 저장돼서 다음엔 빨라요) */
  const verifyWithApi = async () => {
    if (!blocks) return;
    const ids = new Set<string>();
    // 생방(시작 시각) + 영상·쇼츠(실제 제목: 카페에 적힌 제목과 맞는지)
    blocks.forEach((b) => { b.lives.forEach((l) => ids.add(l.id)); b.videos.forEach((v) => ids.add(v.id)); b.shorts.forEach((v) => ids.add(v.id)); });
    const list = [...ids];
    const base = (import.meta.env.VITE_VERCEL_API_URL || (window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')).replace(/\/+$/, '');
    const live = new Map(apiLive); const pub = new Map(apiPub); const liveHour = new Map<string, number>(); const ttl = new Map(apiTitle); const gone = new Set(apiGone);
    const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
    let err = '';
    setVerify({ done: 0, total: list.length }); setVerifyNote('');
    for (let i = 0; i < list.length; i += 50) {
      try {
        const r = await fetch(`${base}/api/videos/meta?live=1&ids=${list.slice(i, i + 50).join(',')}`);
        const j = await r.json();
        Object.entries(j.videos || {}).forEach(([id, v]: any) => {
          if (v === null) gone.add(id); else gone.delete(id);
          if (v?.liveAt) { live.set(id, kst(v.liveAt)); liveHour.set(id, new Date(Date.parse(v.liveAt) + 9 * 3600000).getUTCHours()); }
          if (v?.publishedAt) pub.set(id, kst(v.publishedAt));
          if (v?.title) ttl.set(id, v.title);
        });
        if (j.error) err = j.error;
      } catch (e: any) { err = String(e?.message || e); }
      setVerify({ done: Math.min(list.length, i + 50), total: list.length });
    }
    // 카페 날짜와 다른 생방 수 (새벽 0~6시에 켠 방송을 카페가 전날로 적은 건 같은 방송으로 봄)
    let diff = 0; let liveN = 0;
    const prevDay = (d: string) => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10);
    blocks.forEach((b) => b.lives.forEach((l, i) => {
      const a = live.get(l.id); if (!a) return; liveN++;
      const cafe = l.date || (b.headerDates.length === b.lives.length ? b.headerDates[i] : b.headerDates.length === 1 ? b.headerDates[0] : '');
      if (cafe && cafe !== a && (liveHour.get(l.id) ?? 12) < 6 && cafe === prevDay(a)) { live.set(l.id, cafe); return; }
      if (cafe && cafe !== a) diff++;
    }));
    setApiLive(live); setApiPub(pub); setApiTitle(ttl); setApiGone(gone); setVerify(null);
    setVerifyNote(`유튜브로 확인한 생방 ${liveN}개 · 카페 글 날짜와 다른 생방 ${diff}개 → 유튜브 날짜로 맞췄어요.${err ? ` (일부 못 확인: ${err})` : ''}`);
    setPicked(new Set());
  };
  // 영상 제목: 카페에 적힌 것 → 없으면 유튜브 실제 제목 → 채널 목록
  const titleFor = (l?: CafeLink) => (l ? l.title || apiTitle.get(l.id) || titleOf.get(l.id) || '' : '');
  // 카페에 적힌 제목과 유튜브 실제 제목이 많이 다른 링크 (링크를 잘못 붙였을 수 있음)
  const titleMismatch = useMemo(() => {
    if (!blocks || !apiTitle.size) return [] as { id: string; cafe: string; yt: string; post: string }[];
    const norm = (t: string) => t.toLowerCase().replace(/\|\s*우주하마.*$/, '').replace(/#\S+/g, '').replace(/[^0-9a-z가-힣]/g, '');
    const grams = (t: string) => { const g = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) g.set(t.slice(i, i + 2), (g.get(t.slice(i, i + 2)) || 0) + 1); return g; };
    const dice = (a: string, b: string) => { if (!a || !b) return 1; if (a.includes(b) || b.includes(a)) return 1; const A = grams(a); const B = grams(b); let hit = 0; A.forEach((n, k) => { hit += Math.min(n, B.get(k) || 0); }); return (2 * hit) / Math.max(1, a.length - 1 + b.length - 1); };
    const seen = new Set<string>(); const out: { id: string; cafe: string; yt: string; post: string }[] = [];
    blocks.forEach((b) => [...b.videos, ...b.shorts].forEach((v) => {
      const yt = apiTitle.get(v.id); if (!yt || !v.title || seen.has(v.id)) return; seen.add(v.id);
      if (dice(norm(v.title), norm(yt)) < 0.3) out.push({ id: v.id, cafe: v.title, yt, post: b.post });
    }));
    return out;
  }, [blocks, apiTitle]);
  // 여러 날 생방 영상(웃음참기처럼): 이미 그렇게 연결돼 있으면 빼고
  const multiPlansRef = useRef<{ key: string; byDate?: boolean; lives: { date: string }[] }[]>([]);
  const multiPlans = useMemo(() => {
    const logs = Object.values(data.logs || {}) as any[];
    return multis.filter((m) => {
      const linked = logs.filter((l) => (l.edited || []).some((e: any) => youtubeIdOf(e?.url || '') === m.video.id && (e.multiId || e.compilationId)));
      return linked.length < m.lives.length;
    }).map((m) => ({ ...m, key: `multi:${m.video.id}` }));
  }, [multis, data.logs]);
  multiPlansRef.current = multiPlans;

  /** 이미 카페에서 넣은 영상·쇼츠 중 지금 분석과 날짜가 다른 것 (예전 분석 실수·유튜브 날짜 확인 결과) → 맞는 날로 옮기기 */
  const fixes = useMemo(() => {
    if (!blockRes) return [] as { key: string; kind: 'edited' | 'shorts'; id: string; title: string; from: any; to: string | null; why: string }[];
    const want = new Map<string, Set<string>>();
    const add = (id: string, d: string) => (want.get(id) || want.set(id, new Set()).get(id)!).add(d);
    blockRes.days.forEach((d) => { d.pairs.forEach((p) => add(p.video.id, d.date)); d.shorts.forEach((x) => add(x.id, d.date)); });
    blockRes.multis.forEach((m) => m.lives.forEach((l) => add(m.video.id, l.date)));
    const unsureIds = new Set(blockRes.unsure.flatMap((u) => [u.video?.id, ...u.shorts.map((x) => x.id)]).filter(Boolean) as string[]);
    const out: any[] = [];
    (Object.values(data.logs || {}) as any[]).forEach((l) => (['edited', 'shorts'] as const).forEach((k) => (l[k] || []).forEach((x: any) => {
      if (!x || x.cafe !== 1 || x.multiId) return;
      const id = youtubeIdOf(x.url || ''); if (!id) return;
      const w = want.get(id);
      if (w && !w.has(l.date) && w.size === 1) out.push({ key: `fix:${l.id}:${id}`, kind: k, id, title: x.title || id, from: l, to: [...w][0], why: '날짜가 달라요' });
      else if (!w && unsureIds.has(id)) out.push({ key: `fix:${l.id}:${id}`, kind: k, id, title: x.title || id, from: l, to: null, why: '카페 글에 날짜가 없는데 들어가 있어요' });
    })));
    return out.sort((a, b) => String(a.from.date).localeCompare(String(b.from.date)));
  }, [blockRes, data.logs]);

  // 날짜를 골라 넣은 '날짜 모름' 것이 들어간 날은 바로 선택
  useEffect(() => {
    const ds = new Set(Object.values(unsurePick).filter((x) => x.on).flatMap((x) => x.dates).filter(Boolean));
    if (!ds.size) return;
    setPicked((prev) => { const n = new Set(prev); plans.forEach((p) => { if (ds.has(p.date)) n.add(p.key); }); multiPlansRef.current.forEach((m) => { if (m.byDate && m.lives.every((l) => ds.has(l.date))) n.add(m.key); }); return n.size === prev.size ? prev : n; });
  }, [unsurePick, plans]);
  // 분석이 끝나면 모두 선택해 둠 (날짜 없는데 들어간 것 빼기는 기본으로 안 고름)
  const actionable = [...plans, ...multiPlans, ...fixes.filter((f) => f.to)];
  if (allDays && picked.size === 0 && actionable.length && !busy && !message.startsWith('반영')) {
    setPicked(new Set(actionable.map((p) => p.key)));
  }

  // cafe: 1 = 카페 정리에서 가져옴 (설정 › 실험실 '과거 영상 생방 연동'으로 2020년 전 것을 끄고 켬)
  const toItem = (l: CafeLink, fallback: string): LinkItem => ({ title: l.title || fallback, url: l.url, cafe: 1, ...(source.trim() ? { source: source.trim() } : {}) } as any);

  const apply = async () => {
    const todo = plans.filter((p) => picked.has(p.key));
    const todoMulti = multiPlans.filter((m) => picked.has(m.key));
    const todoFix = fixes.filter((f) => picked.has(f.key));
    const total = todo.length + todoMulti.length + todoFix.length;
    if (!total) return;
    if (!await confirmSheet(`${todo.length}일치 기록에 반영할까요?\n(새 기록 ${todo.filter((p) => p.status === 'new-log').length}개 포함${todoFix.length ? `, 자리 고치기 ${todoFix.length}개` : ''}${todoMulti.length ? `, 여러 생방 영상 ${todoMulti.length}개 연결` : ''})\n끝날 때까지 이 화면을 닫지 마세요.`)) return;
    setBusy({ done: 0, total });
    let ok = 0;
    const fails: string[] = [];
    // 반영하는 동안 바뀐 기록을 따라가며 씀 (같은 기록을 두 번 고쳐도 앞의 것이 지워지지 않게)
    // 화면 기록이 오래됐을 수 있어서(다른 기기·창에서 고친 것) 서버에서 다시 읽은 최신 기록 위에 고침
    let work: Record<string, any>;
    try {
      work = { ...(data.logs as any), ...(await loadFreshLogs(Object.values(data.logs).map((l: any) => String(l?.date || '').slice(0, 7)))) };
    } catch (e: any) { setBusy(null); setMessage(`최신 기록을 못 읽어서 멈췄어요: ${String(e?.message || e).slice(0, 80)}`); return; }
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
            cafe: 1,
            ...(source.trim() ? { source: source.trim() } : {}),
          };
          await onAddLog(nl);
          work[nl.id] = nl;
        }
        ok++;
      } catch (e: any) { console.error('cafe import', p.date, e); fails.push(`${p.date}: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total });
    }
    // 날짜가 다르게 들어가 있던 카페 영상·쇼츠 → 맞는 날로 옮기기 (to 가 없으면 빼기만)
    for (const f of todoFix) {
      try {
        if (!onUpdateLog) throw new Error('기록 수정 기능을 못 찾았어요');
        const src: any = work[f.from.id];
        if (!src) throw new Error('원래 기록을 못 찾았어요');
        const item = (src[f.kind] || []).find((x: any) => youtubeIdOf(x?.url || '') === f.id);
        const nextSrc = { ...src, [f.kind]: (src[f.kind] || []).filter((x: any) => youtubeIdOf(x?.url || '') !== f.id) };
        if (isEmptyLog(nextSrc) && src.cafe && onDeleteLog) { await onDeleteLog(src.id); delete work[src.id]; } else await save(nextSrc);
        if (f.to && item) {
          const all = Object.values(work) as any[];
          const target: any = all.find((l) => l.date === f.to && !l.isAbsence && (l.vods || []).length) || all.find((l) => l.date === f.to && !l.isAbsence);
          if (target) {
            if (!(target[f.kind] || []).some((x: any) => youtubeIdOf(x?.url || '') === f.id)) await save({ ...target, [f.kind]: [...(target[f.kind] || []), item] });
          } else {
            const nl: any = { id: `cafe_${f.to.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`, date: f.to, time: '', game: '', games: [], category: '', durationHours: 0, vods: [], edited: [], shorts: [], [f.kind]: [item], cafe: 1 };
            await onAddLog(nl); work[nl.id] = nl;
          }
        }
        ok++;
      } catch (e: any) { fails.push(`「${f.title}」 옮기기: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total });
    }
    // 여러 날 생방 영상: 몰아보기 › 웃음참기 등록과 같은 모양 (compilations 의 kind 'multi' + 각 생방 기록에 multiId 영상)
    for (const m of todoMulti) {
      try {
        if (!onUpdateLog) throw new Error('기록 수정 기능을 못 찾았어요');
        const all = Object.values(work) as any[];
        const hits = m.lives
          .map((lv) => ({ lv, log: lv.id
            ? all.find((l) => (l.vods || []).some((v: any) => youtubeIdOf(typeof v === 'string' ? v : v?.url || '') === lv.id))
            // 생방 링크 없이 날짜만: 그날 방송 기록 (생방이 있는 기록 먼저)
            : all.find((l) => l.date === lv.date && !l.isAbsence && (l.vods || []).length) || all.find((l) => l.date === lv.date && !l.isAbsence) }))
          .filter((x) => x.log);
        if (hits.length < 2) throw new Error(`생방이 들어 있는 기록을 ${hits.length}개만 찾았어요 (그날 기록부터 반영해 주세요)`);
        const compId = `multi_${m.video.id}`;
        const url = `https://youtu.be/${m.video.id}`;
        const title = m.video.title || titleOf.get(m.video.id) || '영상';
        // 영상에 나오는 순서 그대로 (몰아보기 문서 순서와 같게)
        const dates = [...new Set(hits.map((h) => h.log.date))];
        const createdAt = new Date().toISOString();
        await setDoc(doc(db, 'compilations', compId), {
          id: compId, kind: 'multi', title, url, createdAt, gameSortOrder: 'custom',
          broadcasts: hits.map((h) => ({ logId: h.log.id, date: h.log.date, games: [] })),
          ...(source.trim() ? { source: source.trim() } : {}),
        }, { merge: true });
        void markChanged(`compilations/${compId}`);
        const seenLog = new Set<string>();
        for (const h of hits) {
          if (seenLog.has(h.log.id)) continue;
          seenLog.add(h.log.id);
          const cur: any = work[h.log.id] || h.log;
          const prev: any = (cur.edited || []).find((e: any) => youtubeIdOf(e?.url || '') === m.video.id && !e.isCompilation);
          const link: any = { ...(prev || {}), title: prev?.title || title, url: prev?.url || url, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt: prev?.createdAt || createdAt, cafe: prev && !prev.cafe ? 'multi' : 1 };
          const rest = (cur.edited || []).filter((e: any) => youtubeIdOf(e?.url || '') !== m.video.id && e.multiId !== compId);
          await save({ ...cur, edited: [link, ...rest] });
        }
        ok++;
      } catch (e: any) { console.error('cafe multi', m.video.id, e); fails.push(`「${m.video.title || m.video.id}」: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total });
    }
    setBusy(null);
    setMessage(`반영했어요: ${ok}/${total}개.${fails.length ? ` 실패 ${fails.length}개 — ${fails.slice(0, 3).join(' / ')}` : ' 아래 목록은 반영된 상태로 다시 계산돼요.'}`);
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

      {allDays && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {plans.some((p) => p.moves.length) && <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 font-bold">옮길 영상 {plans.reduce((a, p) => a + p.moves.length, 0)}</span>}
          <span className="font-bold">글에서 {allDays.length}일 · 영상 {allDays.reduce((a, d) => a + d.pairs.length, 0) + multis.length}개 · 생방 {allDays.reduce((a, d) => a + d.lives.length, 0)}개 찾음</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold">넣을 생방 링크 {liveCount}</span>
            {count('new-log') > 0 && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-bold">새 기록 {count('new-log')}</span>}
            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 font-bold">이미 있음 {already}</span>
            {actionable.length > 0 && (
              <button type="button" onClick={() => setPicked(picked.size === actionable.length ? new Set() : new Set(actionable.map((p) => p.key)))} className="ml-auto text-purple-600 font-bold cursor-pointer">
                {picked.size === actionable.length ? '모두 해제' : '모두 선택'}
              </button>
            )}
          </div>

          {blocks && (
            <div className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!!verify || !!busy} onClick={() => void verifyWithApi()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 text-white font-bold cursor-pointer disabled:opacity-50">
                  {verify ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} 유튜브로 생방 날짜 확인
                </button>
                {verify && <span className="tabular-nums">{verify.done}/{verify.total}개 확인 중…</span>}
              </div>
              <p className="text-sky-800 dark:text-sky-200 break-keep">{verifyNote || '생방 링크마다 유튜브에 남은 실제 시작 시각을 확인해서, 카페 글 날짜와 다르면 유튜브 날짜로 맞춰요. 반영하기 전에 한 번 눌러 주세요.'}</p>
            </div>
          )}

          {blocks && apiGone.size > 0 && (() => {
            const goneList: { id: string; kind: string; title: string; post: string }[] = [];
            const seen = new Set<string>();
            blocks.forEach((b) => ([['영상', b.videos], ['쇼츠', b.shorts], ['생방', b.lives]] as const).forEach(([kind, list]) => list.forEach((v) => { if (apiGone.has(v.id) && !seen.has(v.id)) { seen.add(v.id); goneList.push({ id: v.id, kind, title: v.title || '', post: b.post }); } })));
            const byKind = (k: string) => goneList.filter((g) => g.kind === k).length;
            return (
              <details className="rounded-2xl border border-zinc-300 dark:border-zinc-700 p-3 text-xs">
                <summary className="cursor-pointer font-bold">유튜브에 없는 링크 {goneList.length}개 (지워졌거나 비공개 · 쇼츠 {byKind('쇼츠')} · 영상 {byKind('영상')} · 생방 {byKind('생방')})</summary>
                <p className="mt-1 text-zinc-500">반영하면 그대로 들어가요(사이트에서 '사라진 영상'으로 표시돼요). 빼고 싶으면 그 날 기록의 체크를 풀어 주세요.</p>
                <ul className="mt-2 space-y-1">{goneList.map((g) => <li key={g.id} className="break-all"><b>{g.kind}</b> {g.title || g.id} <a href={`https://youtu.be/${g.id}`} target="_blank" rel="noreferrer" className="underline text-zinc-400">{g.id}</a> <span className="text-zinc-400">({g.post})</span></li>)}</ul>
              </details>
            );
          })()}

          {titleMismatch.length > 0 && (
            <details className="rounded-2xl border border-rose-200 dark:border-rose-900/60 p-3 text-xs">
              <summary className="cursor-pointer font-bold text-rose-700 dark:text-rose-300">카페 제목과 유튜브 제목이 많이 다른 링크 {titleMismatch.length}개 (링크를 잘못 붙였을 수 있어요)</summary>
              <ul className="mt-2 space-y-1.5">{titleMismatch.map((t) => (
                <li key={t.id} className="break-all"><a href={`https://youtu.be/${t.id}`} target="_blank" rel="noreferrer" className="underline text-zinc-500">{t.id}</a> · 카페 「{t.cafe}」 ↔ 유튜브 「{t.yt}」 <span className="text-zinc-400">({t.post})</span></li>
              ))}</ul>
            </details>
          )}

          {fixes.length > 0 && (
            <div className="rounded-2xl border border-orange-200 dark:border-orange-900/60 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              <p className="p-3 text-xs font-bold text-orange-700 dark:text-orange-300 bg-orange-50/60 dark:bg-orange-950/30 break-keep">이미 넣은 것 중 자리가 다른 것 {fixes.length}개 — 맞는 날로 옮겨요 (날짜가 없는 건 고르면 빼기만 해요)</p>
              {fixes.map((f) => (
                <div key={f.key} className="p-3 text-xs flex items-center gap-2">
                  <button type="button" onClick={() => toggle(f.key)} className="cursor-pointer shrink-0" aria-label={`${f.title} 선택`}>
                    {picked.has(f.key) ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                  </button>
                  <span className="truncate flex-1">{f.kind === 'shorts' ? '쇼츠' : '영상'} {f.title}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">{f.from.date} → {f.to ? <b className="text-orange-600">{f.to}</b> : <b className="text-red-600">빼기</b>}</span>
                </div>
              ))}
            </div>
          )}

          {plans.length === 0 ? (multiPlans.length || fixes.length ? null :
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
                    <span className="truncate">{titleFor(m.video) || m.video.id}</span>
                  </div>
                  <p className="mt-1 ml-6 text-zinc-500 tabular-nums">{m.byDate ? '날짜로 연결' : '생방'} {m.lives.length}개: {m.lives.map((l) => l.date).join(', ')}</p>
                </div>
              ))}
            </div>
          )}

          {unsure.length > 0 && (
            <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
              <summary className="cursor-pointer font-bold">날짜를 몰라서 넣지 않은 것 {unsure.length}개 — 날짜를 골라 넣을 수 있어요</summary>
              <p className="mt-2 text-zinc-500 break-keep">체크하고 날짜를 고르면 그날 기록에 넣어요. '+ 날짜'로 여러 날을 고르면 그날들 방송 기록에 '생방 여러 개'로 연결해요. 미리 들어간 날짜는 유튜브의 생방 시작일(없으면 영상 올린 날)이에요.</p>
              {Object.entries(unsure.reduce((g: Record<string, typeof unsure>, u) => { const k = u.why.replace(/\s*\(.*$/, ''); (g[k] ||= []).push(u); return g; }, {})).map(([why, list]) => (
                <div key={why} className="mt-3">
                  <p className="font-bold text-zinc-600 dark:text-zinc-300">{why} · {list.length}개</p>
                  <ul className="mt-1 space-y-1">{list.map((u) => {
                    const pk = unsurePick[u.key] || { on: false, dates: [unsureSuggest(u)] };
                    const setDates = (dates: string[]) => setUnsurePick((m) => ({ ...m, [u.key]: { on: true, dates } }));
                    return (
                      <li key={u.key} className="flex items-center gap-2">
                        <button type="button" onClick={() => setUnsurePick((m) => ({ ...m, [u.key]: { on: !pk.on, dates: pk.dates.length ? pk.dates : [unsureSuggest(u)] } }))} className="cursor-pointer shrink-0" aria-label="고르기">
                          {pk.on ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                        </button>
                        <span className="truncate flex-1">{u.video ? <a href={u.video.url} target="_blank" rel="noreferrer" className="underline">{titleFor(u.video) || u.video.id}</a> : [...u.lives, ...u.shorts].map((x) => x.id).join(', ')} <span className="text-zinc-400">[{u.header || '날짜 없음'}]</span></span>
                        <span className="shrink-0 flex flex-wrap items-center gap-1 justify-end">
                          {pk.dates.map((d, i) => (
                            <span key={i} className="inline-flex items-center">
                              <input type="date" value={d} onChange={(e) => setDates(pk.dates.map((x, j) => (j === i ? e.target.value : x)))} className="px-1.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                              {pk.dates.length > 1 && <button type="button" onClick={() => setDates(pk.dates.filter((_, j) => j !== i))} className="px-1 text-zinc-400 cursor-pointer" aria-label="이 날짜 빼기">×</button>}
                            </span>
                          ))}
                          {u.video && <button type="button" onClick={() => setDates([...pk.dates, ''])} className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer" title="날짜 더하기 (여러 날 생방이면 그날들 기록에 모두 연결)">+ 날짜</button>}
                        </span>
                      </li>
                    );
                  })}</ul>
                </div>
              ))}
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
      <AdminCafeFix data={data} onUpdateLog={onUpdateLog} />
      <AdminStreamErrors data={data} onUpdateLog={onUpdateLog} />
      <AdminSongImport data={data} onUpdateLog={onUpdateLog} />
      <AdminCategorySuggest data={data} onUpdateLog={onUpdateLog} />
      <AdminCafeUndo data={data} onAddLog={onAddLog} onUpdateLog={onUpdateLog} onDeleteLog={onDeleteLog} cafeIds={cafeIds} />
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
        <li>여기 아래 칸에 붙여 넣고 <b>분석하기</b> → <b>유튜브로 생방 날짜 확인</b>.</li>
        <li><b>글 목록·검색 결과 화면</b>에서 누르면(예: 카페 검색 <code>영상 생방링크</code>): 무엇을 모을지 골라요 — <b>1</b> 생방쏭 글만 · <b>2</b> 이츠하마타임 글만 · <b>3</b> 화면의 글 전부 · <b>4</b> 사이트에 있는 영상 제목으로 카페를 검색해서 이츠하마타임 글을 모으기 (생방 링크가 없거나 자동 연결된 것처럼 확인이 필요한 것부터) (다른 이름을 적으면 그 작성자 글만). 고른 글을 읽어 이 브라우저에 쌓아 둬요. 모으는 중에 새 글이 올라와도 같은 글은 한 번만 들어가요. '다음 페이지도 자동으로?'에 확인을 누르면 페이지를 알아서 넘겨요. 언제든 '전부 복사'로 꺼낼 수 있어요.</li>
      </ol>
      <p className="mt-2 text-[11px] text-zinc-500 break-keep">로그인한 그 브라우저가 직접 읽어서 아이디·비밀번호는 어디에도 저장되지 않아요. 글 사이마다 잠깐씩 쉬면서 읽어요(한 번에 최대 400개).</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a ref={ref} onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-grab" title="북마크바로 끌어다 놓으세요">우주하마 카페 모으기</a>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* */ } }} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">{copied ? '복사했어요 ✓' : '코드 복사'}</button>
      </div>
    </details>
  );
}
