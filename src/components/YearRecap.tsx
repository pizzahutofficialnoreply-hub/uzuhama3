import { ShareBoxArrowIcon } from './common/ShareIcon';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Flag, MoreHorizontal, Play, X } from 'lucide-react';
import { openAiCard, AI_CARD_CLOSED } from './common/AiCardExpand';
import { requestReport } from './common/ItemMenu';
import { shareNodeAsImage } from '../utils/shareUtils';
import type { BroadcastLog } from '../types';
import { buildRecap, liveIdsOf, recapYearNow, yearsWithData, type YearRecap } from '../utils/yearRecap';
import { useVideoMetaMany } from '../hooks/useVideoDuration';
import { EventArt } from './common/EventArt';
import { fmtHM } from '../utils/fmtHM';

/**
 * 연말 결산 (12/15 ~ 1/15 요약 탭 맨 위에 카드, 누르면 이야기처럼 한 장씩)
 * - ?recap=2025 로 아무 때나 미리 보기
 * - 화면 오른쪽을 누르면 다음, 왼쪽은 이전 · 위 막대가 장 수
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : '');
const BG = ['#7791c1', '#f2546b', '#f59e0b', '#22a06b', '#8b6fd6', '#3fb6ff', '#ff5c93', '#7791c1'];

function previewYear(): number | null {
  try { const q = new URLSearchParams(window.location.search).get('recap'); return q && /^\d{4}$/.test(q) ? Number(q) : null; } catch { return null; }
}

/** 요약 탭 맨 위 카드 */
export function YearRecapBanner({ logs, fetchLogs }: { logs?: Record<string, BroadcastLog>; fetchLogs?: (s: string, e: string) => Promise<void> }) {
  const year = previewYear() ?? recapYearNow();
  const [open, setOpen] = useState(() => previewYear() != null);
  if (year == null) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="recap-banner"
        className="w-full text-left rounded-[26px] p-5 bg-zinc-900 dark:bg-zinc-900 flex items-center gap-4 cursor-pointer active:scale-[0.99] transition-transform">
        <span className="text-[length:calc(44px*var(--fs,1))] shrink-0"><EventArt kind="popper" label={`${year} 결산`} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[length:calc(12px*var(--fs,1))] font-bold text-zinc-400">올해도 수고했어요</span>
          <span className="block text-[length:calc(20px*var(--fs,1))] font-hanna font-pro text-white leading-tight">{year} 우주하마 결산</span>
          <span className="block mt-0.5 text-[length:calc(12.5px*var(--fs,1))] text-zinc-400 break-keep">한 해 방송을 한 장씩 돌아봐요</span>
        </span>
        <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" />
      </button>
      {open && <YearRecapModal initialYear={year} logs={logs} fetchLogs={fetchLogs} onClose={() => setOpen(false)} />}
    </>
  );
}

function Count({ to, dec = 0 }: { to: number; dec?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString('ko-KR', { maximumFractionDigits: dec, minimumFractionDigits: 0 })}</>;
}

const Big = ({ children }: { children: React.ReactNode }) => <div className="font-hanna font-pro text-[length:calc(52px*var(--fs,1))] leading-none text-white tabular-nums">{children}</div>;
const Head = ({ children }: { children: React.ReactNode }) => <h2 className="font-hanna font-pro text-[length:calc(26px*var(--fs,1))] leading-tight text-white break-keep">{children}</h2>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="text-[length:calc(14px*var(--fs,1))] text-white/75 leading-relaxed break-keep">{children}</p>;
const Bars = ({ values, labels, hi }: { values: number[]; labels: string[]; hi: number | null }) => {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {values.map((v, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
          <motion.div initial={{ height: 0 }} animate={{ height: `${(v / max) * 82}%` }} transition={{ duration: 0.6, delay: i * 0.03 }}
            className={`w-full rounded-md ${i === hi ? 'bg-white' : 'bg-white/30'}`} style={{ minHeight: v ? 4 : 0 }} />
          <span className={`text-[length:calc(10px*var(--fs,1))] font-bold ${i === hi ? 'text-white' : 'text-white/50'}`}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

type Play = (id: string, title: string, el: HTMLElement, sub?: string) => void;
const SLIDE_NAME: Record<string, string> = { cover: '표지', none: '기록 없음', count: '방송 횟수', games: '가장 많이 한 게임', new: '처음 한 게임·장르', when: '요일·달', records: '기록', videos: '영상·쇼츠', end: '마무리' };

function slides(r: YearRecap, play: Play): { key: string; body: React.ReactNode }[] {
  const out: { key: string; body: React.ReactNode }[] = [];
  out.push({ key: 'cover', body: (
    <div className="space-y-5 text-center">
      <div className="mx-auto text-[length:calc(96px*var(--fs,1))] w-fit"><EventArt kind="popper" label="결산" /></div>
      <div className="font-hanna font-pro text-[length:calc(44px*var(--fs,1))] leading-none text-white">{r.year}</div>
      <Head>우주하마 결산</Head>
      <Sub>올해 방송을 한 장씩 돌아봐요. 오른쪽을 누르면 다음으로 가요.</Sub>
    </div>
  ) });
  if (!r.count) {
    out.push({ key: 'none', body: (<div className="space-y-4"><Head>{r.year}년엔 방송 기록이 없어요</Head><Sub>쉬어 가는 해였어요. 다음 해에 다시 만나요.</Sub></div>) });
    return out;
  }
  const diff = r.prev ? r.count - r.prev.count : null;
  out.push({ key: 'count', body: (
    <div className="space-y-6">
      <Sub>올해 우주하마는</Sub>
      <div className="space-y-1"><Big><Count to={r.count} />번</Big><Head>방송했어요</Head></div>
      {r.hours > 0 && <div className="space-y-1"><Big><Count to={r.hours} dec={1} />시간</Big><Sub>모두 합친 방송 시간 · 한 번에 평균 {r.avgHours}시간</Sub></div>}
      {r.prev && <Sub>{r.year - 1}년({r.prev.count}번)보다 {diff === 0 ? '같은 만큼' : `${Math.abs(diff!)}번 ${diff! > 0 ? '더' : '덜'}`} 켰어요.</Sub>}
      {r.first && <Sub>첫 방송 {md(r.first)} · 마지막 방송 {md(r.last)}</Sub>}
    </div>
  ) });
  if (r.topGames.length) out.push({ key: 'games', body: (
    <div className="space-y-5">
      <Head>올해 가장 많이 한 게임</Head>
      <ol className="space-y-3">
        {r.topGames.map((g, i) => (
          <motion.li key={g.name} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="flex items-center gap-3">
            <span className="w-7 font-hanna font-pro text-[length:calc(24px*var(--fs,1))] text-white/60 tabular-nums">{i + 1}</span>
            {g.video ? (
              <button type="button" data-thumb onClick={(e) => { e.stopPropagation(); play(g.video!, g.name, e.currentTarget, `${r.year} 결산`); }} aria-label={`${g.name} 영상 보기`}
                className="relative w-20 aspect-video rounded-lg overflow-hidden bg-white/10 shrink-0 pointer-events-auto cursor-pointer z-[6]">
                <img src={`https://i.ytimg.com/vi/${g.video}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20" data-no-share="true"><Play className="w-4 h-4 text-white fill-white" /></span>
              </button>
            ) : <span className="w-20 aspect-video rounded-lg bg-white/10 shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-[length:calc(15px*var(--fs,1))] font-bold text-white truncate">{g.name}</span>
              <span className="block text-[length:calc(12px*var(--fs,1))] text-white/70">{g.count}번{g.hours > 0 ? ` · 약 ${fmtHM(g.hours)}` : ''}</span>
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  ) });
  if (r.gameCount) out.push({ key: 'new', body: (
    <div className="space-y-5">
      <div className="space-y-1"><Sub>올해 한 게임</Sub><Big><Count to={r.gameCount} />개</Big></div>
      {r.newGames.length > 0 && <div className="space-y-2"><Head>그중 {r.newGames.length}개는 처음 한 게임이에요</Head><Sub>{r.newGames.slice(0, 8).join(' · ')}{r.newGames.length > 8 ? ` 외 ${r.newGames.length - 8}개` : ''}</Sub></div>}
      {r.categories.length > 0 && (
        <div className="space-y-2">
          <Sub>많이 한 장르</Sub>
          {r.categories.map((c, i) => (
            <div key={c.name} className="space-y-1">
              <div className="flex justify-between text-[length:calc(13px*var(--fs,1))] font-bold text-white"><span>{c.name}</span><span className="tabular-nums">{c.share}%</span></div>
              <div className="h-2 rounded-full bg-white/20 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${c.share}%` }} transition={{ duration: 0.7, delay: i * 0.08 }} className="h-full rounded-full bg-white" /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) });
  out.push({ key: 'when', body: (
    <div className="space-y-6">
      <Head>{r.bestWeekday != null ? `${WEEK[r.bestWeekday]}요일` : ''}{r.hourBand ? ` ${r.hourBand.label}` : ''}에 가장 많이 켰어요</Head>
      <Bars values={r.weekdays} labels={WEEK} hi={r.bestWeekday} />
      {r.bestMonth && (
        <div className="space-y-3">
          <Sub>{r.bestMonth}월에 가장 많이 켰어요 ({r.months[r.bestMonth - 1]}번)</Sub>
          <Bars values={r.months} labels={r.months.map((_, i) => String(i + 1))} hi={r.bestMonth - 1} />
        </div>
      )}
    </div>
  ) });
  out.push({ key: 'records', body: (
    <div className="space-y-7">
      {r.longest && <div className="space-y-1"><Sub>가장 긴 방송 · {md(r.longest.date)}</Sub><Big><Count to={r.longest.hours} dec={1} />시간</Big>{r.longest.games.length > 0 && <Sub>{r.longest.games.slice(0, 3).join(', ')}</Sub>}
        {r.longest.video && <button type="button" data-thumb data-no-share="true" onClick={(e) => { e.stopPropagation(); play(r.longest!.video!, `${md(r.longest!.date)} 생방송`, e.currentTarget, '가장 긴 방송'); }} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/25 text-white text-[length:calc(12.5px*var(--fs,1))] font-bold pointer-events-auto cursor-pointer relative z-[6]"><Play className="w-3.5 h-3.5 fill-white" />이 방송 보기</button>}</div>}
      {r.streak && <div className="space-y-1"><Sub>가장 오래 이어서 켠 기간</Sub><Big><Count to={r.streak.days} />일 연속</Big><Sub>{md(r.streak.from)} ~ {md(r.streak.to)}</Sub></div>}
      {r.rest && r.rest.days >= 7 && <div className="space-y-1"><Sub>가장 오래 쉰 기간</Sub><Big><Count to={r.rest.days} />일</Big><Sub>{md(r.rest.from)} ~ {md(r.rest.to)}</Sub></div>}
    </div>
  ) });
  if (r.videos || r.shorts) out.push({ key: 'videos', body: (
    <div className="space-y-6">
      <Head>방송 말고도 이만큼 올라왔어요</Head>
      {r.videos > 0 && <div className="space-y-1"><Big><Count to={r.videos} />개</Big><Sub>편집 영상</Sub></div>}
      {r.shorts > 0 && <div className="space-y-1"><Big><Count to={r.shorts} />개</Big><Sub>쇼츠</Sub></div>}
    </div>
  ) });
  out.push({ key: 'end', body: (
    <div className="space-y-5 text-center">
      <div className="mx-auto text-[length:calc(96px*var(--fs,1))] w-fit"><EventArt kind="balloon" label="내년에도" /></div>
      <Head>{r.year + 1}년에도 같이 봐요</Head>
      <Sub>{r.year}년 우주하마 방송을 함께해 줘서 고마워요.</Sub>
    </div>
  ) });
  return out;
}

export function YearRecapModal({ initialYear, logs, fetchLogs, onClose }: { initialYear: number; logs?: Record<string, BroadcastLog>; fetchLogs?: (s: string, e: string) => Promise<void>; onClose: () => void }) {
  const [year, setYear] = useState(initialYear);
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(new Set<number>());
  useEffect(() => {
    if (!fetchLogs || loaded.current.has(year)) return;
    loaded.current.add(year);
    setLoading(true);
    // 그해와 그 전해 (지난해와 비교) 기록을 다 불러옴
    fetchLogs(`${year - 1}-01-01`, `${year}-12-31`).catch(() => {}).finally(() => setLoading(false));
  }, [year, fetchLogs]);
  // 기록에 방송 시간이 없는 날은 생방송 다시보기 길이로 (영상 정보는 서버·브라우저에 저장돼 있어 가벼움)
  const ids = useMemo(() => liveIdsOf(logs, year), [logs, year]);
  const meta = useVideoMetaMany(ids);
  const metaKey = ids.filter((id) => meta.has(id)).length;
  const recap = useMemo(() => buildRecap(logs, year, meta), [logs, year, metaKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 영상 보기: 결산은 그대로 두고 위에 영상 화면 → 닫으면 보던 장 그대로
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    const on = () => setWatching(false);
    window.addEventListener(AI_CARD_CLOSED, on);
    return () => window.removeEventListener(AI_CARD_CLOSED, on);
  }, []);
  const play: Play = (id, title, el, sub) => { setWatching(true); openAiCard(id, title, el, sub); };
  const list = useMemo(() => slides(recap, play), [recap]); // eslint-disable-line react-hooks/exhaustive-deps
  const [menu, setMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const saveImage = async () => {
    setMenu(false);
    const el = cardRef.current;
    if (!el) return;
    el.setAttribute('data-capturing', 'true');
    try { await shareNodeAsImage(el, `${year} 우주하마 결산 - ${SLIDE_NAME[cur?.key || ''] || ''}`, bg); } finally { el.removeAttribute('data-capturing'); }
  };
  const report = () => {
    setMenu(false);
    requestReport({ id: `recap-${year}`, kind: 'video', title: `${year} 결산`, recap: `${year}년 결산 · ${SLIDE_NAME[cur?.key || ''] || cur?.key}`, search: { query: '', concepts: [], understood: '' } });
  };
  const years = useMemo(() => yearsWithData(logs), [logs]);
  const cur = list[Math.min(i, list.length - 1)];
  const go = (d: number) => setI((x) => Math.max(0, Math.min(list.length - 1, x + d)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (watching) return; if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [list.length, watching]);
  const bg = BG[Math.min(i, list.length - 1) % BG.length];

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`fixed inset-0 ${watching ? 'z-[300]' : 'z-[395]'} flex items-center justify-center bg-black/80`} data-no-dock="true" role="dialog" aria-modal="true" aria-label={`${year} 우주하마 결산`} data-testid="recap">
      <motion.div ref={cardRef} animate={{ backgroundColor: bg }} transition={{ duration: 0.4 }} className="relative w-full h-full sm:h-[min(92vh,760px)] sm:max-w-[420px] sm:rounded-[28px] overflow-hidden select-none"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* 위: 장 수 · 해 · 닫기 */}
        <div className="relative z-10 px-4 pt-3 space-y-3" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <div className="flex gap-1">
            {list.map((s, k) => <span key={s.key} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden"><span className={`block h-full bg-white transition-all duration-300 ${k <= i ? 'w-full' : 'w-0'}`} /></span>)}
          </div>
          <div className="flex items-center justify-between">
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setI(0); }} aria-label="결산할 해"
              className="h-8 px-2.5 rounded-full bg-black/25 text-white text-[length:calc(12.5px*var(--fs,1))] font-bold border-0 focus:outline-none">
              {[...new Set([initialYear, ...years])].sort((a, b) => b - a).map((y) => <option key={y} value={y} className="text-black">{y}년 결산</option>)}
            </select>
            <span className="flex items-center gap-2 relative" data-no-share="true">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} className="w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center cursor-pointer" aria-label="더 보기"><MoreHorizontal className="w-5 h-5" /></button>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center cursor-pointer" aria-label="닫기"><X className="w-4.5 h-4.5" /></button>
              <AnimatePresence>
                {menu && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-11 z-20 w-56 rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 shadow-xl ring-1 ring-black/10" role="menu">
                    <button type="button" role="menuitem" onClick={() => void saveImage()} className="w-full px-4 py-3 flex items-center gap-2.5 text-left text-[length:calc(13.5px*var(--fs,1))] font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"><ShareBoxArrowIcon className="w-4 h-4" />이 장 사진으로 공유·저장</button>
                    <button type="button" role="menuitem" onClick={report} className="w-full px-4 py-3 flex items-center gap-2.5 text-left text-[length:calc(13.5px*var(--fs,1))] font-semibold text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-t border-zinc-100 dark:border-zinc-700 cursor-pointer"><Flag className="w-4 h-4" />잘못된 정보 신고</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
          </div>
        </div>
        {/* 누르는 곳: 왼쪽 1/3 이전, 나머지 다음 */}
        <button type="button" className="absolute left-0 top-24 bottom-0 w-1/3 z-[5] cursor-pointer" onClick={() => go(-1)} aria-label="이전" />
        <button type="button" className="absolute right-0 top-24 bottom-0 w-2/3 z-[5] cursor-pointer" onClick={() => (i >= list.length - 1 ? onClose() : go(1))} aria-label={i >= list.length - 1 ? '닫기' : '다음'} />
        <div className="relative h-[calc(100%-96px)] flex items-center px-7 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div key={`${year}-${cur?.key}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.28 }} className="w-full">
              {loading && i === 0 ? <div className="text-center"><Sub>기록을 불러오는 중…</Sub></div> : cur?.body}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="absolute bottom-5 left-6 text-[length:calc(11px*var(--fs,1))] font-bold text-white/60 pointer-events-none">uzuhama.vercel.app · {year} 결산</div>
        <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center gap-2 pointer-events-none" style={{ marginBottom: 'env(safe-area-inset-bottom)' }} data-no-share="true">
          <span className="pointer-events-auto flex gap-2">
            <button type="button" onClick={() => go(-1)} disabled={i === 0} className="w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer" aria-label="이전 장"><ChevronLeft className="w-5 h-5" /></button>
            <button type="button" onClick={() => go(1)} disabled={i >= list.length - 1} className="w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer" aria-label="다음 장"><ChevronRight className="w-5 h-5" /></button>
          </span>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
