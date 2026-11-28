import { noteReads } from '../../../utils/readStats';
import { CleanupReview } from './CleanupReview';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { Flag } from 'lucide-react';
import { Check, EyeOff, Eye, Link2, Loader2, Search, Unlink, Undo2, Film, Clapperboard, CalendarDays } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { useChannelVideos } from '../../../hooks/useChannelVideos';
import { useChannelShorts, useShortsRelatedAuto } from '../recommend/ShortsFeed';
import { Pagination } from '../../common/Pagination';
import { cn, formatTo12Hour } from '../../../utils';
import { applyShortsOverrides, setIgnored, setShortsLink, useLinkOverrides } from '../../../utils/linkOverrides';
import { cleanShortsTitle } from '../../../utils/videoSearch';
import { confirmSheet } from '../../../utils/ui';
import { readXlsx, compareSheet, SHEET_DIFF_LABEL, type SheetDiff } from '../../../utils/sheetCompare';

/**
 * 관리자 > 연동: 유튜브 채널 영상·쇼츠가 어느 방송 기록·어느 영상과 이어져 있는지 보고 고치기
 * - 연동 안 됨: 날짜를 고르면 그날 방송을 보여 주고 '연결' → 그 기록의 편집본/쇼츠에 추가. 방송과 관계없는 건 '숨기기'
 * - 연동됨: 들어 있는 방송 기록(날짜·게임·칸)과, 쇼츠라면 이어진 본영상을 보여 주고 각각 '해제'
 * - 숨김: 숨긴 것 다시 보이기
 * 쇼츠 ↔ 본영상 자동 연결(쇼츠 아래 관련 동영상)은 끊거나 직접 지정할 수 있음 (config/linkOverrides)
 */
const PER_PAGE = 20;
const kstDate = (iso: string) => (iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10) : '');
type Slot = 'edited' | 'shorts' | 'vods';
const SLOT_LABEL: Record<Slot, string> = { edited: '편집본', shorts: '쇼츠', vods: '다시보기' };
type Ref = { log: BroadcastLog; slot: Slot };
const urlOf = (kind: 'video' | 'short', id: string) => (kind === 'video' ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/shorts/${id}`);
const gamesOf = (l: BroadcastLog) => (l.games?.length ? l.games.map((g) => g.name).join(', ') : l.game) || '게임 정보 없음';

export function AdminUnlinkedTab({ data, onUpdateLog }: { data: AppData; onUpdateLog: (log: BroadcastLog) => Promise<void> }) {
  const videos = useChannelVideos();
  const shorts = useChannelShorts();
  const autoRelated = useShortsRelatedAuto();
  const overrides = useLinkOverrides();
  const related = useMemo(() => applyShortsOverrides(autoRelated, overrides), [autoRelated, overrides]);

  const [kind, setKind] = useState<'video' | 'short'>('video');
  const [autoKey, setAutoKey] = useState(0);
  const [status, setStatus] = useState<'unlinked' | 'linked' | 'hidden'>('unlinked');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const logs = useMemo(() => Object.values(data?.logs || {}).filter((l: any) => l?.date && !l.isAbsence) as BroadcastLog[], [data?.logs]);
  const videoTitle = useMemo(() => new Map(videos.map((v) => [v.videoId, v.title] as const)), [videos]);
  const shortTitle = useMemo(() => new Map(shorts.map((v) => [v.videoId, cleanShortsTitle(v.title)] as const)), [shorts]);

  // 유튜브 ID → 들어 있는 방송 기록·칸
  const refs = useMemo(() => {
    const m = new Map<string, Ref[]>();
    logs.forEach((l: any) => {
      (['edited', 'shorts', 'vods'] as Slot[]).forEach((slot) => (l[slot] || []).forEach((it: any) => {
        const id = extractYoutubeId(typeof it === 'string' ? it : it?.url || '');
        if (!id) return;
        const arr = m.get(id) || [];
        if (!arr.some((r) => r.log.id === l.id && r.slot === slot)) arr.push({ log: l, slot });
        m.set(id, arr);
      }));
    });
    return m;
  }, [logs]);
  // 본영상 → 이어진 쇼츠
  const shortsOfVideo = useMemo(() => {
    const m = new Map<string, string[]>();
    Object.entries(related).forEach(([sid, vid]) => { if (vid) m.set(vid, [...(m.get(vid) || []), sid]); });
    return m;
  }, [related]);

  // 쇼츠는 본영상과 이어져 있어도 연동된 것 (본영상이 들어 있는 방송에 같이 보임)
  const isLinked = (id: string) => (refs.get(id)?.length || 0) > 0 || (kind === 'short' && !!related[id]);
  const src = kind === 'video' ? videos : shorts;
  const count = (st: typeof status) => src.filter((v) => (st === 'hidden' ? overrides.ignored[v.videoId] : !overrides.ignored[v.videoId] && (st === 'linked') === isLinked(v.videoId))).length;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return src
      .filter((v) => (status === 'hidden' ? overrides.ignored[v.videoId] : !overrides.ignored[v.videoId] && (status === 'linked') === isLinked(v.videoId)))
      .filter((v) => !term || v.title.toLowerCase().includes(term) || v.videoId.toLowerCase() === term || extractYoutubeId(term) === v.videoId)
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  }, [src, status, q, overrides, refs, related, shortsOfVideo, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 방송일 추천: 올리기 전 21일 안의 방송 중 '영상 제목에 그 방송 게임 이름이 들어 있는' 가장 가까운 날
   * (예전에는 '올리기 직전 방송'으로 정해서 대부분 틀렸음). 못 찾으면 비워 두고 직접 고르게
   */
  const sq = (t: string) => String(t || '').toLowerCase().replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '');
  const guess = (title: string, publishedAt: string): { date: string; why: string } => {
    const up = kstDate(publishedAt);
    if (!up) return { date: '', why: '' };
    const t = sq(title);
    const lo = new Date(Date.parse(`${up}T00:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10);
    const cands = logs.filter((l) => l.date <= up && l.date >= lo).sort((x, y) => y.date.localeCompare(x.date));
    for (const l of cands) {
      const names = (l.games?.length ? l.games.map((g) => g.name) : [l.game]).filter(Boolean) as string[];
      const hit = names.find((n) => {
        const parts = [n, ...n.split(/[|:(（\[\]/·,]/)].map(sq).filter((x) => x.length >= 2);
        return parts.some((x) => t.includes(x));
      });
      if (hit) return { date: l.date, why: `제목에 「${hit}」` };
    }
    return { date: '', why: '' };
  };

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    try { await fn(); setMsg(done); window.setTimeout(() => setMsg(''), 2500); }
    catch (e: any) { alert('오류: ' + (e?.message || e)); }
    finally { setBusy(null); }
  };

  const link = (v: { videoId: string; title: string }, log: BroadcastLog) => run(v.videoId, async () => {
    const item = { title: kind === 'short' ? cleanShortsTitle(v.title) : v.title, url: urlOf(kind, v.videoId) };
    await onUpdateLog(kind === 'video' ? { ...log, edited: [...(log.edited || []), item] } : { ...log, shorts: [...(log.shorts || []), item] });
  }, `${log.date} 방송에 연결했어요.`);

  const unlinkFromLog = async (id: string, r: Ref) => {
    if (!await confirmSheet(`${r.log.date} 방송 기록의 ${SLOT_LABEL[r.slot]}에서 빼요. 계속할까요?`)) return;
    run(`${id}:${r.log.id}:${r.slot}`, async () => {
      const arr = ((r.log as any)[r.slot] || []).filter((it: any) => extractYoutubeId(typeof it === 'string' ? it : it?.url || '') !== id);
      await onUpdateLog({ ...r.log, [r.slot]: arr } as BroadcastLog);
    }, '연결을 해제했어요.');
  };

  const assignShort = (sid: string) => {
    const raw = (manual[sid] || '').trim();
    const vid = extractYoutubeId(raw) || (/^[\w-]{11}$/.test(raw) ? raw : '');
    if (!vid) { alert('본영상 링크나 영상 ID(11자리)를 넣어 주세요.'); return; }
    run(sid, () => setShortsLink(sid, vid), `본영상을 「${videoTitle.get(vid) || vid}」로 지정했어요.`);
  };

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const pageItems = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const chip = 'shrink-0 px-2.5 py-1 rounded-lg text-[length:calc(11px*var(--fs,1))] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50';

  // 방송 기록 한 줄
  const LogLine = ({ log, slot, right }: { log: BroadcastLog; slot?: Slot; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
      <div className="min-w-0 text-xs flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span className="font-bold text-zinc-800 dark:text-zinc-100 shrink-0">{log.date} {log.time ? formatTo12Hour(log.time) || log.time : ''}</span>
        <span className="text-zinc-500 truncate">{gamesOf(log)}</span>
        {slot && <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[length:calc(10px*var(--fs,1))] font-bold">{SLOT_LABEL[slot]}</span>}
      </div>
      {right}
    </div>
  );
  const Thumb = ({ id, k }: { id: string; k: 'video' | 'short' }) => (
    <a href={urlOf(k, id)} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className={cn('rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800', k === 'video' ? 'w-20 aspect-video' : 'w-10 aspect-[9/16]')} />
    </a>
  );

  return (
    <div className="space-y-4">
      <CleanupReview data={data} onUpdateLog={onUpdateLog} />
      <AutoLinkReview key={autoKey} data={data} onUpdateLog={onUpdateLog} />
      <GameCheckPanel data={data} onSent={() => setAutoKey((k) => k + 1)} />
      <SheetCheckPanel data={data} />
      <ReportedIssues onFind={(id, k) => { setKind(k === 'short' ? 'short' : 'video'); setStatus('linked'); setQ(id); setPage(1); }} />
      <DeadVideos logs={logs} onUpdateLog={onUpdateLog} />
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 영상·쇼츠 연동
        </h3>
        <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500 leading-relaxed">
          유튜브 채널의 영상·쇼츠가 어느 방송 기록에 들어 있는지 보고 고칠 수 있어요. 쇼츠는 아래 '관련 동영상'으로 본영상과 자동으로 이어지는데, 틀렸으면 끊거나 직접 지정하세요.
          방송과 관계없는 영상은 숨기면 '연동 안 됨'에 더 안 떠요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl">
            {([['video', '영상'], ['short', '쇼츠']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }} className={cn('px-3 py-1 text-xs font-bold rounded-lg cursor-pointer', kind === k ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs' : 'text-zinc-500')}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl">
            {([['unlinked', '연동 안 됨'], ['linked', '연동됨'], ['hidden', '숨김']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setStatus(k); setPage(1); }} className={cn('px-3 py-1 text-xs font-bold rounded-lg cursor-pointer', status === k ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs' : 'text-zinc-500')}>
                {label} {count(k)}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="제목·링크로 찾기" className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
          </div>
        </div>
        {msg && <p className="text-xs font-bold text-emerald-600">{msg}</p>}
        {!src.length && <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 채널 목록을 불러오는 중…</p>}
      </div>

      {pageItems.map((v) => {
        const id = v.videoId;
        const myRefs = refs.get(id) || [];
        const relVid = kind === 'short' ? related[id] : undefined;
        const ov = kind === 'short' ? overrides.shorts[id] : undefined; // undefined: 자동 / '': 끊음 / id: 직접 지정
        const autoVid = kind === 'short' ? autoRelated[id] : undefined;
        const linkedShorts = kind === 'video' ? shortsOfVideo.get(id) || [] : [];
        const g = dates[id] === undefined ? guess(v.title, v.publishedAt) : { date: dates[id], why: '' };
        const date = g.date;
        const dayLogs = logs.filter((l) => l.date === date);
        return (
          <div key={id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row gap-3">
            <a href={urlOf(kind, id)} target="_blank" rel="noreferrer" className="shrink-0 self-start">
              <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className={cn('rounded-xl object-cover bg-zinc-200', kind === 'video' ? 'w-full sm:w-44 aspect-video' : 'w-24 aspect-[9/16]')} loading="lazy" />
            </a>
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-2">{kind === 'short' ? cleanShortsTitle(v.title) : v.title}</p>
                  <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500">{kstDate(v.publishedAt)} 업로드 · {id}</p>
                </div>
                {status === 'hidden' ? (
                  <button type="button" disabled={busy === id} onClick={() => run(id, () => setIgnored(id, false), '다시 보이게 했어요.')} className={cn(chip, 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200')}><Eye className="w-3.5 h-3.5" /> 다시 보이기</button>
                ) : status === 'unlinked' ? (
                  <button type="button" disabled={busy === id} onClick={() => run(id, () => setIgnored(id, true), '숨겼어요. \'숨김\'에서 되돌릴 수 있어요.')} className={cn(chip, 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}><EyeOff className="w-3.5 h-3.5" /> 숨기기</button>
                ) : null}
              </div>

              {/* 지금 이어진 것 */}
              {(myRefs.length > 0 || relVid || ov === '' || linkedShorts.length > 0) && (
                <div className="space-y-1.5">
                  <p className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-600 dark:text-zinc-300">지금 연결된 곳</p>
                  {myRefs.map((r) => (
                    <LogLine key={r.log.id + r.slot} log={r.log} slot={r.slot} right={
                      <button type="button" disabled={busy === `${id}:${r.log.id}:${r.slot}`} onClick={() => unlinkFromLog(id, r)} className={cn(chip, 'text-red-600 bg-red-50 dark:bg-red-950/30')}><Unlink className="w-3.5 h-3.5" /> 해제</button>
                    } />
                  ))}

                  {kind === 'short' && relVid && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Thumb id={relVid} k="video" />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="text-[length:calc(10px*var(--fs,1))] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1"><Film className="w-3 h-3" /> 본영상 {ov ? '(직접 지정)' : '(자동)'}</p>
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-2">{videoTitle.get(relVid) || relVid}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button type="button" disabled={busy === id} onClick={async () => await confirmSheet('이 쇼츠와 본영상의 연결을 끊을까요?') && run(id, () => setShortsLink(id, ''), '본영상 연결을 끊었어요.')} className={cn(chip, 'text-red-600 bg-red-50 dark:bg-red-950/30')}><Unlink className="w-3.5 h-3.5" /> 끊기</button>
                          {ov && <button type="button" disabled={busy === id} onClick={() => run(id, () => setShortsLink(id, null), '자동 연결로 되돌렸어요.')} className={cn(chip, 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600')}><Undo2 className="w-3.5 h-3.5" /> 자동</button>}
                        </div>
                      </div>
                      {(refs.get(relVid) || []).map((r) => <LogLine key={r.log.id + r.slot} log={r.log} slot={r.slot} />)}
                      {!(refs.get(relVid) || []).length && <p className="text-[length:calc(11px*var(--fs,1))] text-amber-600">이 본영상은 아직 방송 기록에 없어요.</p>}
                    </div>
                  )}
                  {kind === 'short' && ov === '' && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[length:calc(11px*var(--fs,1))] text-amber-700 dark:text-amber-300">
                      <span>자동 연결을 끊어 둔 쇼츠예요{autoVid ? ` (자동: 「${videoTitle.get(autoVid) || autoVid}」)` : ''}.</span>
                      <button type="button" disabled={busy === id} onClick={() => run(id, () => setShortsLink(id, null), '자동 연결로 되돌렸어요.')} className={cn(chip, 'bg-white dark:bg-zinc-800 text-zinc-600')}><Undo2 className="w-3.5 h-3.5" /> 되돌리기</button>
                    </div>
                  )}

                  {kind === 'video' && linkedShorts.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[length:calc(10px*var(--fs,1))] font-bold text-zinc-500 flex items-center gap-1"><Clapperboard className="w-3 h-3" /> 이 영상에 이어진 쇼츠 {linkedShorts.length}개</p>
                      {linkedShorts.map((sid) => (
                        <div key={sid} className="flex items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-2 py-1.5">
                          <Thumb id={sid} k="short" />
                          <p className="min-w-0 flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 line-clamp-2">{shortTitle.get(sid) || sid}{overrides.shorts[sid] ? <span className="text-purple-500"> (직접)</span> : null}</p>
                          <button type="button" disabled={busy === sid} onClick={async () => await confirmSheet('이 쇼츠와의 연결을 끊을까요?') && run(sid, () => setShortsLink(sid, ''), '쇼츠 연결을 끊었어요.')} className={cn(chip, 'text-red-600 bg-red-50 dark:bg-red-950/30')}><Unlink className="w-3.5 h-3.5" /> 끊기</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 쇼츠: 본영상 직접 지정 */}
              {kind === 'short' && status !== 'hidden' && (
                <div className="flex items-center gap-1.5">
                  <input value={manual[id] || ''} onChange={(e) => setManual((m) => ({ ...m, [id]: e.target.value }))} placeholder={relVid ? '다른 본영상으로 바꾸기: 링크나 ID' : '본영상 지정: 링크나 ID'} className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                  <button type="button" disabled={busy === id || !(manual[id] || '').trim()} onClick={() => assignShort(id)} className={cn(chip, 'bg-purple-600 text-white')}><Check className="w-3.5 h-3.5" /> 지정</button>
                </div>
              )}

              {/* 방송 기록에 넣기 */}
              {status !== 'hidden' && (
                <details open={status === 'unlinked'} className="group">
                  <summary className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">{status === 'unlinked' ? '방송 기록에 넣기' : '다른 방송 기록에도 넣기'}</summary>
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500">방송일</label>
                      <input type="date" value={date} onChange={(e) => setDates((d) => ({ ...d, [id]: e.target.value }))} className="px-2 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                      {g.why ? <span className="text-[length:calc(10.5px*var(--fs,1))] text-emerald-600 truncate">추천: {g.why}</span> : dates[id] === undefined && <span className="text-[length:calc(10.5px*var(--fs,1))] text-zinc-400">게임 이름으로 못 찾았어요 · 날짜를 골라 주세요</span>}
                    </div>
                    {date && (dayLogs.length ? dayLogs.map((l) => (
                      <LogLine key={l.id} log={l} right={
                        myRefs.some((r) => r.log.id === l.id)
                          ? <span className="text-[length:calc(11px*var(--fs,1))] font-bold text-emerald-600 shrink-0">연결됨</span>
                          : <button type="button" disabled={busy === id} onClick={() => link(v, l)} className={cn(chip, 'bg-purple-600 hover:bg-purple-700 text-white')}>{busy === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 연결</button>
                      } />
                    )) : <p className="text-[length:calc(11px*var(--fs,1))] text-amber-600">이 날짜에는 방송 기록이 없어요.</p>)}
                  </div>
                </details>
              )}
            </div>
          </div>
        );
      })}
      {list.length === 0 && src.length > 0 && (
        <div className="py-10 text-center text-sm text-zinc-500">
          {status === 'unlinked' ? `연동 안 된 ${kind === 'video' ? '영상' : '쇼츠'}가 없어요.` : status === 'linked' ? '연동된 게 없어요.' : '숨긴 게 없어요.'}
        </div>
      )}
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

/**
 * 방문자 제보 중 '연결이 틀렸다'·'게임 이름/링크가 다르다' (⋮ › 신고, 피드백 탭 제보를 하루 한 번 분류한 것)
 * '이 영상 찾기'로 아래 목록에서 바로 고치고, 다 고치면 '처리 완료'
 */
const REASON_LABEL: Record<string, string> = {
  wrong_link: '연결이 틀림', wrong_game_name: '게임 이름', wrong_game_link: '게임 링크', wrong_date: '날짜', other: '기타',
};
function ReportedIssues({ onFind }: { onFind: (videoId: string, kind?: string) => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => getDocs(query(collection(db, 'feedbacks'), where('route', 'in', ['link', 'game']), limit(150)))
    .then((s) => (noteReads('feedbacks(관리자 연동 탭)', Math.max(1, s.size)), setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x: any) => !x.resolved)
      .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)))))
    .catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items?.length) return null;
  const resolve = async (id: string) => { await setDoc(doc(db, 'feedbacks', id), { resolved: true, resolvedAt: new Date().toISOString() }, { merge: true }); setItems((x) => (x || []).filter((i) => i.id !== id)); };
  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><Flag className="w-4 h-4" /> 고쳐 달라는 제보 {items.length}건</p>
      <p className="text-[length:calc(11px*var(--fs,1))] text-amber-800/80 dark:text-amber-300/80">카드의 ⋮ › 신고, 그리고 피드백 탭 제보 중 연결·게임 문제로 분류된 것이에요 (하루 한 번 분류).</p>
      <ul className="space-y-1.5 max-h-80 overflow-y-auto">
        {items.map((x) => (
          <li key={x.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-amber-100 dark:border-zinc-800 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-zinc-800 dark:text-zinc-100">
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[length:calc(10px*var(--fs,1))]">{x.type === 'search_report' ? REASON_LABEL[x.reason] || x.reason : x.route === 'game' ? '게임 (피드백)' : '연결 (피드백)'}</span>
                  {String(x.title || '').replace('[검색 신고] ', '')}
                </p>
                <p className="mt-0.5 text-zinc-500 whitespace-pre-line line-clamp-4">{x.content}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {x.videoId && <button type="button" onClick={() => onFind(x.videoId, x.kind)} className="px-2 py-1 rounded-lg bg-purple-600 text-white font-bold cursor-pointer">이 영상 찾기</button>}
                <button type="button" onClick={() => resolve(x.id)} className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer">처리 완료</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 사라진 영상: 방송 기록에 있는데 유튜브에서 삭제·비공개된 것 (하루 한 번 확인) */
function DeadVideos({ logs, onUpdateLog }: { logs: BroadcastLog[]; onUpdateLog: (log: BroadcastLog) => Promise<void> }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const load = () => getDoc(doc(db, 'config', 'deadVideos')).then((x) => setD(x.data() || null)).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  const items = Object.entries(d?.items || {}) as [string, any][];
  const removeFromLog = async (id: string, info: any) => {
    const log = logs.find((l) => l.id === info.logId);
    if (!log) { alert('그 방송 기록을 찾지 못했어요.'); return; }
    if (!await confirmSheet(`${log.date} 기록의 ${info.slot === 'edited' ? '편집본' : info.slot === 'shorts' ? '쇼츠' : '다시보기'}에서 이 링크를 뺄까요?`)) return;
    setBusy(id);
    try {
      const arr = ((log as any)[info.slot] || []).filter((it: any) => extractYoutubeId(typeof it === 'string' ? it : it?.url || '') !== id);
      await onUpdateLog({ ...log, [info.slot]: arr } as BroadcastLog);
      setD((x: any) => { const n = { ...(x || {}), items: { ...(x?.items || {}) } }; delete n.items[id]; return n; });
    } finally { setBusy(''); }
  };
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-zinc-900 dark:text-white">사라진 영상 {items.length}개 <span className="text-[length:calc(11px*var(--fs,1))] font-normal text-zinc-500">{d?.checkedAt ? `· ${new Date(d.checkedAt).toLocaleString('ko-KR')} 확인 (링크 ${d.total}개 중)` : '· 아직 확인 전'}</span></p>
        <button type="button" disabled={!!busy} onClick={async () => { setBusy('check'); try { const { mutate } = await import('./system/SearchTuningCard'); await mutate('checkDeadVideos'); await load(); } catch (e: any) { alert('오류: ' + (e?.message || e)); } finally { setBusy(''); } }} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer disabled:opacity-50">{busy === 'check' ? '확인 중…' : '지금 확인'}</button>
      </div>
      <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500">방송 기록에 들어 있는 유튜브 링크 중 삭제됐거나 비공개로 바뀐 것이에요. 매일 한 번 자동으로 확인해요.</p>
      {items.length > 0 && (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {items.map(([id, info]) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="mr-1.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[length:calc(10px*var(--fs,1))] font-bold">{info.reason}</span>
                <b>{info.date}</b> · {info.slot === 'edited' ? '편집본' : info.slot === 'shorts' ? '쇼츠' : '다시보기'} · <span className="text-zinc-500">{info.title || id}</span>
              </span>
              <button type="button" disabled={busy === id} onClick={() => removeFromLog(id, info)} className="shrink-0 px-2 py-1 rounded-lg text-red-600 bg-red-50 dark:bg-red-950/30 font-bold cursor-pointer">기록에서 빼기</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 자동 연결 확인: 서버가 새 편집 영상을 방송 기록에 자동으로 넣은 것 (넣은 즉시 사이트에 보임)
 * - 승인: 그대로 둠 · 바꾸기: 후보 방송을 골라 그 방송들로 옮김 · 빼기: 기록에서 뺌
 */
function AutoLinkReview({ data, onUpdateLog }: { data: AppData; onUpdateLog: (log: BroadcastLog) => Promise<void> }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState('');
  const load = () => getDocs(query(collection(db, 'yt_auto'), where('status', '==', 'pending'), limit(100)))
    .then((s) => { noteReads('yt_auto(관리자)', Math.max(1, s.size)); setItems(s.docs.map((d) => d.data()).sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)))); })
    .catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items || !items.length) return null;
  const vid = (u: string) => extractYoutubeId(u || '') || '';
  const strip = async (it: any, keep: string[] = []) => {
    for (const l of Object.values(data.logs)) {
      if (!l || keep.includes(l.id)) continue;
      const inE = (l.edited || []).some((e: any) => vid(e?.url) === it.id), inS = (l.shorts || []).some((e: any) => vid(e?.url) === it.id);
      if (inE || inS) await onUpdateLog({ ...l, edited: (l.edited || []).filter((e: any) => vid(e?.url) !== it.id), shorts: (l.shorts || []).filter((e: any) => vid(e?.url) !== it.id) });
    }
  };
  const act = async (it: any, what: 'ok' | 'move' | 'drop') => {
    setBusy(it.id);
    try {
      if (what === 'drop') {
        if (!await confirmSheet(`「${it.title}」을 방송 기록에서 뺄까요?`)) return;
        await strip(it);
      }
      if (what === 'move') {
        const ids = sel[it.id] || it._pick || [];
        if (!ids.length) return;
        const logs = ids.map((id) => data.logs[id]).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
        const dates = logs.map((l) => l.date);
        await strip(it, ids);
        // AI 추천 쇼츠는 쇼츠 칸에, 나머지는 편집 영상 칸에
        const key = it.kind === 'shorts' ? 'shorts' : 'edited';
        for (const l of logs) {
          const rest = ((l as any)[key] || []).filter((e: any) => vid(e?.url) !== it.id);
          const url = key === 'shorts' ? `https://www.youtube.com/shorts/${it.id}` : `https://www.youtube.com/watch?v=${it.id}`;
          await onUpdateLog({ ...l, [key]: [...rest, { title: it.title, url, ...(dates.length > 1 && key === 'edited' ? { allBroadcastDates: dates } : {}) } as any] });
        }
      }
      await setDoc(doc(db, 'yt_auto', it.id), { status: what === 'drop' ? 'dropped' : 'approved', doneAt: new Date().toISOString() }, { merge: true });
      setItems((x) => (x || []).filter((y) => y.id !== it.id));
    } catch (e: any) { alert('못 했어요: ' + (e?.message || e)); } finally { setBusy(''); }
  };
  return (
    <div className="bg-white dark:bg-zinc-900 border border-amber-300/60 dark:border-amber-700/50 rounded-2xl p-5 shadow-sm space-y-3">
      <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Link2 className="w-4 h-4 text-amber-500" /> 연결 확인 (자동 연결 · 대조에서 보낸 것) <span className="text-xs font-bold text-amber-600">{items.length}개</span></h3>
      <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500 break-keep">새 편집 영상을 설명창 게임 이름으로 방송 기록에 자동으로 넣은 것, 그리고 '게임 이름·링크 대조'에서 고르고 보낸 것이에요. 지금 연결은 이미 사이트에 보이고 있어요. 맞으면 승인, 다른 방송이면 아래 후보(설명창 게임을 한 방송, 가까운 날짜 순)를 골라 '바꾸기'. 영상 연결은 맞는데 기록의 게임 이름이 틀린 거면 등록 탭에서 그 기록을 고쳐 주세요.</p>
      <ul className="space-y-3">
        {items.map((it) => {
          const chosen = sel[it.id] ?? (it.source === 'ai' ? (it.candidates || []).slice(0, 1).map((c: any) => c.id) : (it.logs || []).map((l: any) => l.id));
          return (
            <li key={it.id} className={cn('rounded-xl border p-3 text-xs space-y-2', it.ambiguous ? 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-800')}>
              <div className="flex gap-3">
                <img src={`https://i.ytimg.com/vi/${it.id}/mqdefault.jpg`} alt="" className="w-28 aspect-video rounded-lg object-cover shrink-0 bg-zinc-200 dark:bg-zinc-800" />
                <div className="min-w-0">
                  <a href={`https://youtu.be/${it.id}`} target="_blank" rel="noreferrer" className="font-bold text-zinc-900 dark:text-white hover:underline line-clamp-2">{it.title}</a>
                  <p className="mt-0.5 text-zinc-500">{it.ambiguous && <b className="text-amber-600">확인 필요 · </b>}{it.reason}</p>
                  {it.names?.length > 0 && <p className="text-zinc-500">설명창 게임: {it.names.join(' · ')}</p>}
                  <p className="text-zinc-600 dark:text-zinc-300">{it.source === 'ai' ? <><b className="text-purple-600">AI 추천</b> · {it.kind === 'shorts' ? '쇼츠' : '편집 영상'} · 지금 연결: {(it.logs || []).map((l: any) => l.date).join(', ') || '없음'}</> : <>넣은 방송: {(it.logs || []).map((l: any) => l.date).join(', ')}</>}</p>
                </div>
              </div>
              {it.candidates?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {it.candidates.map((c: any) => {
                    const on = chosen.includes(c.id);
                    return <button key={c.id} type="button" onClick={() => setSel((s) => ({ ...s, [it.id]: on ? chosen.filter((x: string) => x !== c.id) : [...chosen, c.id] }))} className={cn('px-2 py-1 rounded-lg font-bold cursor-pointer', on ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300')}>{c.date}{c.game ? ` ${c.game.slice(0, 14)}` : ''}{c.score != null ? ` · ${c.score}%` : ''}</button>;
                  })}
                </div>
              )}
              <div className="flex gap-1.5">
                <button type="button" disabled={!!busy} onClick={() => act(it, 'ok')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1">{busy === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 승인</button>
                <button type="button" disabled={!!busy || !(sel[it.id] || (it.source === 'ai' && it.candidates?.length))} onClick={() => { if (!sel[it.id]) setSel((s) => ({ ...s, [it.id]: chosen })); act({ ...it, _pick: chosen }, 'move'); }} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold cursor-pointer disabled:opacity-40">고른 방송으로 바꾸기</button>
                <button type="button" disabled={!!busy} onClick={() => act(it, 'drop')} className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer inline-flex items-center gap-1"><Unlink className="w-3.5 h-3.5" /> 빼기</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 게임 이름·링크 대조: 편집 영상 설명창의 게임 이름 ↔ 기록의 게임 이름, 그리고 게임 링크 페이지 이름 ↔ 기록의 게임 이름
 * (서버가 영상 40개씩 대조해서 game_check 에 적어 둠 · 워커가 3분마다 이어서)
 */
function GameCheckPanel({ data, onSent }: { data: AppData; onSent: () => void }) {
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<any[] | null>(null);
  const [st, setSt] = useState<any>(null);
  const [f, setF] = useState<'mismatch' | 'link' | 'noinfo' | 'match'>('mismatch');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  // 목록은 지금 고른 칸만 300개까지 (예전: 전체 2천여 개를 열 때·새로고침·더 대조마다 다 읽어서 DB 읽기가 많이 나감)
  // 칸별 개수는 개수 세기(문서 1천 개당 읽기 1번)로만
  const [counts, setCounts] = useState<Record<string, number>>({});
  const qOf = (k: string) => {
    const c = collection(db, 'game_check');
    if (k === 'link') return query(c, where('status', '==', 'match'), where('linkIssue', '==', true));
    if (k === 'noinfo') return query(c, where('status', 'in', ['noinfo', 'gone']));
    return query(c, where('status', '==', k));
  };
  // 칸마다 한 번 읽은 건 기억 (칸을 왔다 갔다 해도 다시 안 읽음 · '목록 새로고침'만 다시 읽음)
  const seen = useRef<Record<string, any[]>>({});
  const countsAt = useRef(0);
  const load = (k: string = f, force = false) => {
    if (!force && seen.current[k]) { setRows(seen.current[k]); return; }
    setRows(null);
    getDocs(query(qOf(k), limit(300)))
      .then((s) => { noteReads('game_check(관리자)', Math.max(1, s.size)); const r = s.docs.map((d) => d.data()).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))); seen.current[k] = r; setRows(r); })
      .catch(() => setRows([]));
    if (!force && countsAt.current) return; // 개수는 처음·새로고침 때만
    countsAt.current = Date.now();
    Promise.all((['mismatch', 'link', 'noinfo', 'match'] as const).map((x) => getCountFromServer(qOf(x)).then((r) => [x, r.data().count] as const).catch(() => [x, -1] as const)))
      .then((a) => { noteReads('game_check 개수(관리자)', 4); setCounts(Object.fromEntries(a)); });
  };
  useEffect(() => { if (open) load(f); }, [open, f]); // eslint-disable-line react-hooks/exhaustive-deps
  // 열어 둔 동안 진행 숫자는 실시간 (문서 1개만 지켜봄) · 목록은 '새로고침'을 눌렀을 때만
  useEffect(() => {
    if (!open) return;
    return onSnapshot(doc(db, 'youtube_cache', 'game_check_state'), (d) => setSt(d.data() || null), () => {});
  }, [open]);
  const run = async (reset: boolean) => {
    setBusy(reset ? 'reset' : 'run');
    try {
      const token = await auth.currentUser?.getIdToken();
      const base = /vercel\.app$|localhost/.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app';
      await fetch(`${base}/api/health?gamecheck=1${reset ? '&reset=1' : ''}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      // 목록은 다시 안 읽음 (진행 숫자는 실시간으로 보임 · 결과는 '목록 새로고침'으로)
    } finally { setBusy(''); }
  };
  const list = (rows || []).filter((r) => !r.sent);
  const keyOf = (r: any) => `${r.logId}__${r.vid}`;
  const picked = list.filter((r) => pick[keyOf(r)]);
  // 고른 것 → 위 '자동 연결 확인'으로 (거기서 맞는 방송을 골라 바꾸기·빼기·그대로 두기)
  const nm = (x: string) => String(x || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  const sendToLink = async () => {
    if (!picked.length) return;
    setBusy('send');
    try {
      const all = Object.values(data.logs).filter((l) => l && !l.isAbsence);
      for (const r of picked) {
        const want = (r.names || []).map(nm).filter((x: string) => x.length >= 2);
        const cands = all.filter((l) => {
          const names = [...(l.games || []).map((g) => g.name), l.game].filter(Boolean).map((x) => nm(x as string));
          return names.some((n) => n && want.some((w: string) => n === w || (w.length >= 4 && n.includes(w)) || (n.length >= 4 && w.includes(n))));
        }).sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(r.date)) - Math.abs(Date.parse(b.date) - Date.parse(r.date))).slice(0, 12);
        const cur = data.logs[r.logId];
        const list2 = [...(cur ? [cur] : []), ...cands.filter((l) => l.id !== r.logId)];
        await setDoc(doc(db, 'yt_auto', r.vid), {
          id: r.vid, title: r.title, logs: cur ? [{ id: cur.id, date: cur.date }] : [], status: 'pending', from: 'gamecheck', at: new Date().toISOString(),
          reason: r.status === 'mismatch' ? `설명창 게임(${(r.names || []).join(', ')})과 기록 게임(${(r.games || []).map((g: any) => g.name).join(', ')})이 달라요` : r.status === 'match' ? '게임 링크 확인 필요' : '설명창에 게임 정보가 없어요',
          ambiguous: true, names: (r.names || []).slice(0, 6),
          candidates: list2.map((l) => ({ id: l.id, date: l.date, game: (l.games?.[0]?.name || l.game || '') })),
        });
        await setDoc(doc(db, 'game_check', keyOf(r)), { sent: true }, { merge: true });
      }
      setRows((x) => (x || []).map((r) => (pick[keyOf(r)] ? { ...r, sent: true } : r)));
      setPick({});
      onSent();
    } finally { setBusy(''); }
  };
  // 고른 것 → 글로 복사 (날짜 · 제목 · 링크 / 기록 게임 · 설명창 게임 / 게임 링크 상태)
  const [copied, setCopied] = useState(false);
  const copyPicked = async () => {
    const txt = picked.map((r) => [
      `${r.date} ${r.title} https://youtu.be/${r.vid}`,
      `  기록: ${(r.games || []).map((g: any) => g.name).join(', ') || '없음'}${r.names?.length ? ` / 설명창: ${r.names.join(', ')}` : ''}${r.status === 'gone' ? ' / 유튜브에 없음' : ''}`,
      ...(r.links || []).map((p: any) => `  링크 ${LS[p.link_status] || p.link_status}${p.link_title ? ` — 페이지 이름 「${p.link_title}」` : ''}${p.why ? ` (${p.why})` : ''}${p.link ? ` ${p.link}` : ''}`),
    ].join('\n')).join('\n\n');
    try { await navigator.clipboard.writeText(txt); } catch {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };
  const cnt = (k: string) => (counts[k] >= 0 ? counts[k] : '');
  const LS: Record<string, string> = { ok: '맞음', name_diff: '이름이 다름 (상점에서 이 이름으로 검색해도 안 나옴)', broken: '링크가 안 열림', nolink: '링크 없음', unknown: '확인 못 함 (사이트가 확인을 막음 · 다음에 다시)', web: '열림 (게임 상점이 아니라 이름은 안 봄)' };
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
      <summary className="text-base font-bold text-zinc-900 dark:text-white cursor-pointer">게임 이름·링크 대조</summary>
      <div className="mt-3 space-y-3 text-xs">
        <p className="text-zinc-500 break-keep">편집 영상 설명창(맨 위 게임 이름 줄·해시태그)의 게임 이름과 기록의 게임 이름을 비교하고, 일치한 게임은 스팀·앱스토어·구글 플레이·웹 링크를 열어 그 페이지 이름과 다시 맞춰 봐요. 예전 영상처럼 설명창에 '게임 이름 / 우주하마' 줄 없이 해시태그(#공포게임 등)만 있으면 '정보 없음'으로 보류돼요. 한글·영문·일본어 표기 차이나 글자 몇 개 차이는 일치로 보고, 이름이 아예 달라도 게임 링크 페이지 이름이 설명창과 같으면 일치로 봐요.</p>
        <div className="flex items-center gap-2">
          <p className="text-zinc-500">{st ? `${st.cursor || 0} / ${st.total || '?'}개 대조${st.done ? ' (다 함)' : ` · ${st.running ? '지금 대조 중… ' : ''}워커가 3분마다 이어서 해요 (마지막 ${st.at ? new Date(st.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'})`}${st.lastError ? ` · 오류: ${st.lastError}` : ''}` : '아직 시작 안 함'}</p>
          <button type="button" onClick={() => { seen.current = {}; load(f, true); }} className="ml-auto px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer">목록 새로고침</button>
        </div>
        {st && !st.done && st.total ? <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.min(100, ((st.cursor || 0) / st.total) * 100)}%` }} /></div> : null}
        <div className="flex flex-wrap gap-1.5">
          {([['mismatch', '불일치'], ['link', '링크 확인 필요'], ['noinfo', '설명창 정보 없음'], ['match', '일치']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF(k)} className={cn('px-2.5 py-1 rounded-full font-bold cursor-pointer', f === k ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300')}>{l} {cnt(k)}</button>
          ))}
          <button type="button" disabled={!!busy} onClick={() => run(false)} className="ml-auto px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer disabled:opacity-50">{busy === 'run' ? '대조 중…' : '지금 더 대조'}</button>
          <button type="button" disabled={!!busy} onClick={() => run(true)} className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer disabled:opacity-50">{busy === 'reset' ? '…' : '처음부터 다시'}</button>
        </div>
        {rows === null ? <p className="text-zinc-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…</p> : (
          <ul className="space-y-1.5 max-h-[60vh] overflow-auto">
            {list.length > 0 && (
              <li className="sticky top-0 z-10 flex items-center gap-2 py-1.5 bg-white dark:bg-zinc-900">
                <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer"><input type="checkbox" checked={list.slice(0, 300).every((r) => pick[keyOf(r)])} onChange={(e) => { const on = e.target.checked; setPick((p) => { const n = { ...p }; list.slice(0, 300).forEach((r) => { n[keyOf(r)] = on; }); return n; }); }} /> 모두 고르기</label>
                <button type="button" disabled={!picked.length} onClick={copyPicked} className="ml-auto px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-bold cursor-pointer disabled:opacity-40">{copied ? '복사했어요' : `고른 ${picked.length}개 복사`}</button>
                <button type="button" disabled={!picked.length || !!busy} onClick={sendToLink} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold cursor-pointer disabled:opacity-40">{busy === 'send' ? '보내는 중…' : `고른 ${picked.length}개 연동에서 고치기`}</button>
              </li>
            )}
            {list.slice(0, 300).map((r) => (
              <li key={`${r.logId}${r.vid}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2.5 flex gap-2">
                <input type="checkbox" className="mt-1 shrink-0" checked={!!pick[keyOf(r)]} onChange={(e) => setPick((p) => ({ ...p, [keyOf(r)]: e.target.checked }))} aria-label="고르기" />
                <div className="min-w-0 flex-1">
                <p className="font-bold text-zinc-900 dark:text-white"><span className="text-zinc-500 tabular-nums mr-1.5">{r.date}</span><a href={`https://youtu.be/${r.vid}`} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a></p>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">기록: {(r.games || []).map((g: any) => g.name).join(', ') || '없음'}{r.names?.length ? ` · 설명창: ${r.names.join(', ')}` : ''}{r.status === 'gone' ? ' · 유튜브에 없음(비공개·삭제)' : ''}{r.via === 'link' ? ' · 이름은 달라도 게임 링크 페이지 이름이 설명창과 같아서 일치' : ''}</p>
                {(r.links || []).map((p: any, i: number) => (
                  <p key={i} className={cn('mt-0.5', p.link_status === 'ok' || p.link_status === 'web' ? 'text-emerald-600' : p.link_status === 'unknown' ? 'text-zinc-500' : 'text-amber-600')}>
                    링크 {LS[p.link_status] || p.link_status}{p.link_title ? ` — 페이지 이름 「${p.link_title}」` : ''}{p.why ? ` (${p.why})` : ''}{p.link && <> · <a href={p.link} target="_blank" rel="noreferrer" className="underline">열기</a></>}
                  </p>
                ))}
                </div>
              </li>
            ))}
            {list.length > 300 && <li className="text-zinc-500">… {list.length - 300}개 더</li>}
          </ul>
        )}
      </div>
    </details>
  );
}

/**
 * 스프레드시트 대조: '우주하마 생방송 아카이브(V3)' 시트 ↔ 사이트 기록
 * - 구글 시트 주소를 저장해 두면 워커가 하루 한 번 받아서 (시트가 바뀌었을 때만) 비교 → 결과가 여기 쌓임
 * - 엑셀 파일을 직접 올려서 바로 비교할 수도 있음 (대조 결과는 저장 안 함 · 오팬무·오음무·오저무는 저장해서 AI 요약에 씀)
 */
function SheetCheckPanel({ data }: { data: AppData }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [res, setRes] = useState<any>(null);
  const [f, setF] = useState<SheetDiff['kind'] | 'all'>('all');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => {
    getDoc(doc(db, 'config', 'system')).then((d) => { const u = d.data()?.archiveSheetUrl || ''; setUrl(u); setSaved(u); }).catch(() => {});
    getDoc(doc(db, 'youtube_cache', 'sheet_check')).then((d) => { noteReads('sheet_check(관리자)', 1); if (d.exists()) setRes({ ...d.data(), from: 'auto' }); }).catch(() => {});
  };
  useEffect(() => { if (open && !res) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = /vercel\.app$|localhost/.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app';
  const saveUrl = async () => { setBusy('save'); try { await setDoc(doc(db, 'config', 'system'), { archiveSheetUrl: url.trim() }, { merge: true }); setSaved(url.trim()); setMsg('저장했어요. 워커가 하루 한 번 대조해요.'); } finally { setBusy(''); } };
  const runNow = async () => {
    setBusy('run'); setMsg('');
    try { const j = await (await fetch(`${base}/api/health?sheetcheck=1&force=1`)).json(); if (!j.ok) setMsg(j.reason || '못 했어요'); load(); } finally { setBusy(''); }
  };
  const onFile = async (file: File) => {
    setBusy('file'); setMsg('');
    try {
      const rows = readXlsx(new Uint8Array(await file.arrayBuffer()));
      const out = compareSheet(rows, Object.values(data.logs));
      setRes({ ...out, diffs: out.diffs.filter((d) => d.kind !== 'moved'), at: new Date().toISOString(), from: 'file' });
      // 그날 오팬무·오음무·오저무도 같이 저장 (AI 요약보다 먼저 보여 줌)
      const byDate: Record<string, any> = {};
      for (const x of rows) { const e: any = {}; if (x.pan) e.pan = x.pan; if (x.eum) e.eum = x.eum; if (x.jeo) e.jeo = x.jeo; if (Object.keys(e).length) byDate[x.date] = { ...(byDate[x.date] || {}), ...e }; }
      if (Object.keys(byDate).length) await setDoc(doc(db, 'config', 'sheetExtra'), { at: new Date().toISOString(), byDate }, { merge: true }); // 합쳐서 (카페 글에서 넣은 값 지키기)
    } catch (e: any) { setMsg('파일을 못 읽었어요: ' + (e?.message || e)); } finally { setBusy(''); }
  };
  const order: SheetDiff['kind'][] = ['live', 'video', 'game', 'nolog', 'siteOnly', 'gameLang', 'moved'];
  const list = (res?.diffs || []).filter((d: SheetDiff) => f === 'all' || d.kind === f);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
      <summary className="text-base font-bold text-zinc-900 dark:text-white cursor-pointer">스프레드시트 대조 (생방송 아카이브 V3)</summary>
      <div className="mt-3 space-y-3 text-xs">
        <p className="text-zinc-500 break-keep">시트의 방송일·생방 링크·유튜브 업로드 링크·게임 이름을 사이트 기록과 비교해요. 구글 시트 주소(공유: 링크가 있는 모든 사용자 보기)를 저장하면 워커가 하루 한 번, 시트가 바뀌었을 때만 다시 대조해요. 유튜브 시작 시각 기준으로 날짜를 옮긴 기록은 정상이라 따로 세기만 해요.</p>
        <div className="flex gap-1.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
          <button type="button" disabled={!!busy || url.trim() === saved} onClick={saveUrl} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer disabled:opacity-40">저장</button>
          <button type="button" disabled={!!busy || !saved} onClick={runNow} className="px-3 py-2 rounded-xl bg-purple-600 text-white font-bold cursor-pointer disabled:opacity-40">{busy === 'run' ? '대조 중…' : '지금 대조'}</button>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-600 dark:text-zinc-300"><input type="file" accept=".xlsx" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) void onFile(x); e.currentTarget.value = ''; }} /><span className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-bold">{busy === 'file' ? '읽는 중…' : '엑셀 파일로 바로 대조'}</span></label>
        {msg && <p className="text-amber-600">{msg}</p>}
        {res && (
          <>
            <p className="text-zinc-600 dark:text-zinc-300">{res.from === 'file' ? '올린 파일' : '자동 대조'} · {new Date(res.at).toLocaleString('ko-KR')} · 시트 {res.total}줄 ({res.range?.[0]} ~ {res.range?.[1]}) 중 <b>{res.same}줄 같음</b></p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setF('all')} className={cn('px-2.5 py-1 rounded-full font-bold cursor-pointer', f === 'all' ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800')}>전체 {(res.diffs || []).length}</button>
              {order.filter((k) => res.count?.[k]).map((k) => (
                <button key={k} type="button" onClick={() => setF(k)} className={cn('px-2.5 py-1 rounded-full font-bold cursor-pointer', f === k ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800')}>{SHEET_DIFF_LABEL[k]} {res.count[k]}</button>
              ))}
            </div>
            <ul className="space-y-1 max-h-[60vh] overflow-auto">
              {list.slice(0, 400).map((d: SheetDiff, i: number) => (
                <li key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5"><span className="font-bold tabular-nums mr-1.5">{d.date}</span><span className="text-zinc-500 mr-1.5">{SHEET_DIFF_LABEL[d.kind]}{d.row ? ` · 시트 ${d.row}행` : ''}</span>{d.text}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
