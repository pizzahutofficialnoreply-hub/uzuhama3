import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
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
  const chip = 'shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50';

  // 방송 기록 한 줄
  const LogLine = ({ log, slot, right }: { log: BroadcastLog; slot?: Slot; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
      <div className="min-w-0 text-xs flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span className="font-bold text-zinc-800 dark:text-zinc-100 shrink-0">{log.date} {log.time ? formatTo12Hour(log.time) || log.time : ''}</span>
        <span className="text-zinc-500 truncate">{gamesOf(log)}</span>
        {slot && <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold">{SLOT_LABEL[slot]}</span>}
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
      <ReportedIssues onFind={(id, k) => { setKind(k === 'short' ? 'short' : 'video'); setStatus('linked'); setQ(id); setPage(1); }} />
      <DeadVideos logs={logs} onUpdateLog={onUpdateLog} />
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 영상·쇼츠 연동
        </h3>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
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
                  <p className="text-[11px] text-zinc-500">{kstDate(v.publishedAt)} 업로드 · {id}</p>
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
                  <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">지금 연결된 곳</p>
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
                          <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1"><Film className="w-3 h-3" /> 본영상 {ov ? '(직접 지정)' : '(자동)'}</p>
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-2">{videoTitle.get(relVid) || relVid}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button type="button" disabled={busy === id} onClick={async () => await confirmSheet('이 쇼츠와 본영상의 연결을 끊을까요?') && run(id, () => setShortsLink(id, ''), '본영상 연결을 끊었어요.')} className={cn(chip, 'text-red-600 bg-red-50 dark:bg-red-950/30')}><Unlink className="w-3.5 h-3.5" /> 끊기</button>
                          {ov && <button type="button" disabled={busy === id} onClick={() => run(id, () => setShortsLink(id, null), '자동 연결로 되돌렸어요.')} className={cn(chip, 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600')}><Undo2 className="w-3.5 h-3.5" /> 자동</button>}
                        </div>
                      </div>
                      {(refs.get(relVid) || []).map((r) => <LogLine key={r.log.id + r.slot} log={r.log} slot={r.slot} />)}
                      {!(refs.get(relVid) || []).length && <p className="text-[11px] text-amber-600">이 본영상은 아직 방송 기록에 없어요.</p>}
                    </div>
                  )}
                  {kind === 'short' && ov === '' && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                      <span>자동 연결을 끊어 둔 쇼츠예요{autoVid ? ` (자동: 「${videoTitle.get(autoVid) || autoVid}」)` : ''}.</span>
                      <button type="button" disabled={busy === id} onClick={() => run(id, () => setShortsLink(id, null), '자동 연결로 되돌렸어요.')} className={cn(chip, 'bg-white dark:bg-zinc-800 text-zinc-600')}><Undo2 className="w-3.5 h-3.5" /> 되돌리기</button>
                    </div>
                  )}

                  {kind === 'video' && linkedShorts.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-500 flex items-center gap-1"><Clapperboard className="w-3 h-3" /> 이 영상에 이어진 쇼츠 {linkedShorts.length}개</p>
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
                  <summary className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">{status === 'unlinked' ? '방송 기록에 넣기' : '다른 방송 기록에도 넣기'}</summary>
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-zinc-500">방송일</label>
                      <input type="date" value={date} onChange={(e) => setDates((d) => ({ ...d, [id]: e.target.value }))} className="px-2 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                      {g.why ? <span className="text-[10.5px] text-emerald-600 truncate">추천: {g.why}</span> : dates[id] === undefined && <span className="text-[10.5px] text-zinc-400">게임 이름으로 못 찾았어요 · 날짜를 골라 주세요</span>}
                    </div>
                    {date && (dayLogs.length ? dayLogs.map((l) => (
                      <LogLine key={l.id} log={l} right={
                        myRefs.some((r) => r.log.id === l.id)
                          ? <span className="text-[11px] font-bold text-emerald-600 shrink-0">연결됨</span>
                          : <button type="button" disabled={busy === id} onClick={() => link(v, l)} className={cn(chip, 'bg-purple-600 hover:bg-purple-700 text-white')}>{busy === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 연결</button>
                      } />
                    )) : <p className="text-[11px] text-amber-600">이 날짜에는 방송 기록이 없어요.</p>)}
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
    .then((s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x: any) => !x.resolved)
      .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))))
    .catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items?.length) return null;
  const resolve = async (id: string) => { await setDoc(doc(db, 'feedbacks', id), { resolved: true, resolvedAt: new Date().toISOString() }, { merge: true }); setItems((x) => (x || []).filter((i) => i.id !== id)); };
  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><Flag className="w-4 h-4" /> 고쳐 달라는 제보 {items.length}건</p>
      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">카드의 ⋮ › 신고, 그리고 피드백 탭 제보 중 연결·게임 문제로 분류된 것이에요 (하루 한 번 분류).</p>
      <ul className="space-y-1.5 max-h-80 overflow-y-auto">
        {items.map((x) => (
          <li key={x.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-amber-100 dark:border-zinc-800 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-zinc-800 dark:text-zinc-100">
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[10px]">{x.type === 'search_report' ? REASON_LABEL[x.reason] || x.reason : x.route === 'game' ? '게임 (피드백)' : '연결 (피드백)'}</span>
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
        <p className="text-sm font-bold text-zinc-900 dark:text-white">사라진 영상 {items.length}개 <span className="text-[11px] font-normal text-zinc-500">{d?.checkedAt ? `· ${new Date(d.checkedAt).toLocaleString('ko-KR')} 확인 (링크 ${d.total}개 중)` : '· 아직 확인 전'}</span></p>
        <button type="button" disabled={!!busy} onClick={async () => { setBusy('check'); try { const { mutate } = await import('./system/SearchTuningCard'); await mutate('checkDeadVideos'); await load(); } catch (e: any) { alert('오류: ' + (e?.message || e)); } finally { setBusy(''); } }} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer disabled:opacity-50">{busy === 'check' ? '확인 중…' : '지금 확인'}</button>
      </div>
      <p className="text-[11px] text-zinc-500">방송 기록에 들어 있는 유튜브 링크 중 삭제됐거나 비공개로 바뀐 것이에요. 매일 한 번 자동으로 확인해요.</p>
      {items.length > 0 && (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {items.map(([id, info]) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="mr-1.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[10px] font-bold">{info.reason}</span>
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
