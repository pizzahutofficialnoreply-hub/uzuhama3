/**
 * 요약 탭 위쪽: 토스 홈처럼 '큰 제목 + ›' 카드에 '동그란 아이콘 · 작은 설명 · 큰 값' 줄을 쌓음
 *  - 최근 방송 (누르면 그날 기록으로)
 *  - 최근 30일 (방송한 날·시간 → 분석 탭 추이, 게임 → 분석 탭 카테고리)
 *  - 새 영상 (누르면 검색 탭에서 그 영상)
 * 누르면 토스처럼 줄·카드 면이 살짝 밝아짐 (.press-row / .press-card)
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Gamepad2, CalendarDays, Clock, Film } from 'lucide-react';
import { openAiCard } from '../common/AiCardExpand';
import type { AppData, BroadcastLog } from '../../types';
import { extractYoutubeId } from '../../utils/urlUtils';
import { cn } from '../../utils';

/** 동그란 썸네일: 못 불러오면 아이콘 */
function Thumb({ src, fallback }: { src: string | null; fallback: ReactNode }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <>{fallback}</>;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="w-full h-full object-cover scale-[1.35] bg-zinc-100 dark:bg-zinc-800" />;
}
const thumbOf = (url?: string) => { const id = extractYoutubeId(url || ''); return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null; };
const gamesOf = (l: BroadcastLog) => (l.games?.length ? l.games.map((g) => g.name) : [l.game]).filter(Boolean).join(' · ');
export const hoursText = (h: number) => { if (!h) return ''; const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };

export function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-[26px] px-3 pt-3 pb-2.5">
      <button type="button" onClick={onMore} disabled={!onMore} className="press-row w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-left disabled:cursor-default">
        <h3 className="text-[length:calc(20px*var(--fs,1))] sm:text-[length:calc(22px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em]">{title}</h3>
        {onMore && <ChevronRight className="w-5 h-5 text-zinc-400" />}
      </button>
      <div className="mt-0.5">{children}</div>
    </section>
  );
}

export function Row({ icon, caption, value, onClick, right }: { icon: ReactNode; caption: string; value: string; onClick?: (el: HTMLElement) => void; right?: ReactNode }) {
  return (
    <button type="button" onClick={(e) => onClick?.(e.currentTarget)} className="press-row w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-left">
      <span className="w-11 h-11 rounded-full shrink-0 overflow-hidden flex items-center justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[length:calc(13px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 truncate">{caption}</span>
        <span className="block text-[length:calc(17px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white truncate leading-snug">{value}</span>
      </span>
      {right}
    </button>
  );
}

export const Tint = ({ children, tone }: { children: ReactNode; tone: 'purple' | 'amber' | 'emerald' | 'rose' | 'zinc' }) => (
  <span className={cn('w-full h-full flex items-center justify-center [&>svg]:w-[22px] [&>svg]:h-[22px]', {
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300',
    zinc: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300',
  }[tone])}>{children}</span>
);

export function TossHome({ data, onOpenDate, onOpenStats, onOpenVideo }: {
  data: AppData;
  onOpenDate: (date: string) => void;
  /** 분석 탭: 하위 탭 + 기간 */
  onOpenStats: (sub: 'trend' | 'day' | 'category', start: string, end: string) => void;
  /** 검색 탭으로 */
  onOpenVideo: (videoId: string | null) => void;
}) {
  const logs = useMemo(() => Object.values(data.logs || {}).filter((l) => l?.date && !l.isAbsence).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))), [data.logs]);

  const recent = logs.slice(0, 3);

  // 최근 30일에 방송이 있으면 그 기간, 없으면(긴 휴방) 마지막으로 방송한 해
  const month = useMemo(() => {
    const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    let inRange = logs.filter((l) => l.date >= from);
    let label = '최근 30일';
    let start = from; let end = format(new Date(), 'yyyy-MM-dd');
    if (!inRange.length && logs.length) { const y = logs[0].date.slice(0, 4); inRange = logs.filter((l) => l.date.startsWith(y)); label = `${y}년`; start = `${y}-01-01`; end = `${y}-12-31`; }
    const hours = inRange.reduce((s, l) => s + (l.durationHours || 0), 0);
    const cnt: Record<string, number> = {};
    inRange.forEach((l) => (l.games?.length ? l.games.map((g) => g.name) : [l.game]).forEach((g) => { if (g) cnt[g] = (cnt[g] || 0) + 1; }));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { n: inRange.length, hours, top, label, start, end };
  }, [logs]);

  const newVideos = useMemo(() => {
    const out: { url: string; title: string; date: string }[] = [];
    for (const l of logs) { for (const v of l.edited || []) { if (v?.url && v.title) out.push({ url: v.url, title: v.title, date: l.date }); } if (out.length >= 8) break; }
    return out.slice(0, 8);
  }, [logs]);
  // 새 영상: 처음 3개 → '더보기'(흐린 끝 + 글자)를 누르면 카드가 늘어나며 8개까지 → 그다음은 '자세히 보기'(검색 탭)
  const [moreVideos, setMoreVideos] = useState(false);
  // 높이는 실제 줄 높이로: 접힘 = 3번째 줄 절반까지, 펼침 = 전체 (글자 크기를 바꿔도 맞게)
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    const rows = el.children as HTMLCollectionOf<HTMLElement>;
    const measure = () => {
      if (rows.length <= 3) { setBoxH(null); return; }
      setBoxH(moreVideos ? el.scrollHeight : rows[2].offsetTop + rows[2].offsetHeight * 0.55);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [moreVideos, newVideos.length]);

  if (!logs.length) return null;
  const dayText = (d: string) => format(parseISO(d), 'M월 d일 (E)', { locale: ko });

  return (
    <div id="summary-home" className="space-y-3 stagger scroll-mt-24">
      <Section title="최근 방송" onMore={() => onOpenDate(recent[0].date)}>
        {recent.map((l) => {
          const t = thumbOf(l.vods?.[0]?.url) || thumbOf(l.edited?.[0]?.url);
          return (
            <Row key={l.id || l.date} onClick={() => onOpenDate(l.date)}
              icon={<Thumb src={t} fallback={<Tint tone="purple"><Gamepad2 /></Tint>} />}
              caption={[dayText(l.date), hoursText(l.durationHours)].filter(Boolean).join(' · ')}
              value={gamesOf(l) || '방송'} />
          );
        })}
      </Section>

      <Section title={month.label} onMore={() => onOpenStats('trend', month.start, month.end)}>
        <Row onClick={() => onOpenStats('trend', month.start, month.end)} icon={<Tint tone="emerald"><CalendarDays /></Tint>} caption="방송한 날" value={month.n ? `${month.n}번` : '아직 없어요'} />
        {month.hours > 0 && <Row onClick={() => onOpenStats('day', month.start, month.end)} icon={<Tint tone="amber"><Clock /></Tint>} caption="방송한 시간" value={hoursText(month.hours)} />}
        {month.top && <Row onClick={() => onOpenStats('category', month.start, month.end)} icon={<Tint tone="rose"><Gamepad2 /></Tint>} caption="제일 많이 한 게임" value={month.top} />}
      </Section>

      {newVideos.length > 0 && (
        <Section title="새 영상" onMore={() => onOpenVideo(null)}>
          <div className="relative">
            <div ref={boxRef} className="overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ height: boxH ?? undefined }}>
              {newVideos.map((v) => {
                const id = extractYoutubeId(v.url);
                return (
                  <Row key={v.url}
                    onClick={(el) => (id ? openAiCard(id, v.title, el, `${dayText(v.date)} 영상`) : onOpenVideo(null))}
                    icon={<Thumb src={thumbOf(v.url)} fallback={<Tint tone="zinc"><Film /></Tint>} />}
                    caption={dayText(v.date)} value={v.title} />
                );
              })}
            </div>
            {/* 접혀 있을 때: 마지막 줄 위로 흐린 덮개 (누를 수 없음 — 누르는 건 아래 버튼) */}
            {!moreVideos && newVideos.length > 3 && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-white/0 to-white dark:from-zinc-900/0 dark:to-zinc-900" />
            )}
          </div>
          {newVideos.length > 3 && (
            <button type="button" onClick={() => (moreVideos ? onOpenVideo(null) : setMoreVideos(true))}
              className="press-row w-full py-3 rounded-2xl text-[length:calc(14px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-1">
              {moreVideos ? <>자세히 보기<ChevronRight className="w-4 h-4" /></> : <>더보기<ChevronDown className="w-4 h-4" /></>}
            </button>
          )}
        </Section>
      )}

    </div>
  );
}
