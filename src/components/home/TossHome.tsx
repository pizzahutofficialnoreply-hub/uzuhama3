/**
 * 요약 탭 위쪽: 토스 홈처럼 '큰 제목 + ›' 카드에 '동그란 아이콘 · 작은 설명 · 큰 값' 줄을 쌓음
 *  - 최근 방송 (누르면 그날 기록으로)
 *  - 최근 30일 (누르면 분석 탭)
 *  - 새 영상 (누르면 검색 탭)
 *  - 맨 아래 작은 버튼: 알림 설정 · 화면 설정
 * 누르면 토스처럼 줄·카드 면이 살짝 밝아짐 (.press-row / .press-card)
 */
import { useMemo, useState, type ReactNode } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronRight, Gamepad2, CalendarDays, Clock, Bell, Palette, Film } from 'lucide-react';
import type { AppData, BroadcastLog, Tab } from '../../types';
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
const hoursText = (h: number) => { if (!h) return ''; const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };

function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-[26px] px-3 pt-3 pb-2.5">
      <button type="button" onClick={onMore} disabled={!onMore} className="press-row w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-left disabled:cursor-default">
        <h3 className="text-[20px] sm:text-[22px] font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em]">{title}</h3>
        {onMore && <ChevronRight className="w-5 h-5 text-zinc-400" />}
      </button>
      <div className="mt-0.5">{children}</div>
    </section>
  );
}

function Row({ icon, caption, value, onClick, right }: { icon: ReactNode; caption: string; value: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="press-row w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-left">
      <span className="w-11 h-11 rounded-full shrink-0 overflow-hidden flex items-center justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-zinc-500 dark:text-zinc-400 truncate">{caption}</span>
        <span className="block text-[17px] font-bold font-hanna font-pro text-zinc-900 dark:text-white truncate leading-snug">{value}</span>
      </span>
      {right}
    </button>
  );
}

const Tint = ({ children, tone }: { children: ReactNode; tone: 'purple' | 'amber' | 'emerald' | 'rose' | 'zinc' }) => (
  <span className={cn('w-full h-full flex items-center justify-center [&>svg]:w-[22px] [&>svg]:h-[22px]', {
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300',
    zinc: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300',
  }[tone])}>{children}</span>
);

export function TossHome({ data, onOpenDate, onGoTab, onOpenSettings }: {
  data: AppData;
  onOpenDate: (date: string) => void;
  onGoTab: (tab: Tab) => void;
  onOpenSettings: (section: 'notification' | 'theme') => void;
}) {
  const logs = useMemo(() => Object.values(data.logs || {}).filter((l) => l?.date && !l.isAbsence).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))), [data.logs]);

  const recent = logs.slice(0, 3);

  // 최근 30일에 방송이 있으면 그 기간, 없으면(긴 휴방) 마지막으로 방송한 해
  const month = useMemo(() => {
    const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    let inRange = logs.filter((l) => l.date >= from);
    let label = '최근 30일';
    if (!inRange.length && logs.length) { const y = logs[0].date.slice(0, 4); inRange = logs.filter((l) => l.date.startsWith(y)); label = `${y}년`; }
    const hours = inRange.reduce((s, l) => s + (l.durationHours || 0), 0);
    const cnt: Record<string, number> = {};
    inRange.forEach((l) => (l.games?.length ? l.games.map((g) => g.name) : [l.game]).forEach((g) => { if (g) cnt[g] = (cnt[g] || 0) + 1; }));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { n: inRange.length, hours, top, label };
  }, [logs]);

  const newVideos = useMemo(() => {
    const out: { url: string; title: string; date: string }[] = [];
    for (const l of logs) { for (const v of l.edited || []) { if (v?.url && v.title) out.push({ url: v.url, title: v.title, date: l.date }); } if (out.length >= 6) break; }
    return out.slice(0, 2);
  }, [logs]);

  if (!logs.length) return null;
  const dayText = (d: string) => format(parseISO(d), 'M월 d일 (E)', { locale: ko });

  return (
    <div className="space-y-3 stagger">
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

      <Section title={month.label} onMore={() => onGoTab('detailed')}>
        <Row onClick={() => onGoTab('detailed')} icon={<Tint tone="emerald"><CalendarDays /></Tint>} caption="방송한 날" value={month.n ? `${month.n}번` : '아직 없어요'} />
        {month.hours > 0 && <Row onClick={() => onGoTab('detailed')} icon={<Tint tone="amber"><Clock /></Tint>} caption="방송한 시간" value={hoursText(month.hours)} />}
        {month.top && <Row onClick={() => onGoTab('detailed')} icon={<Tint tone="rose"><Gamepad2 /></Tint>} caption="제일 많이 한 게임" value={month.top} />}
      </Section>

      {newVideos.length > 0 && (
        <Section title="새 영상" onMore={() => onGoTab('recommend')}>
          {newVideos.map((v) => {
            const t = thumbOf(v.url);
            return (
              <Row key={v.url} onClick={() => onGoTab('recommend')}
                icon={<Thumb src={t} fallback={<Tint tone="zinc"><Film /></Tint>} />}
                caption={dayText(v.date)} value={v.title} />
            );
          })}
        </Section>
      )}

      {/* 토스 홈 맨 아래 '화면 설정 · 계좌 추가'처럼 작은 버튼 두 개 */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <button type="button" onClick={() => onOpenSettings('notification')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"><Bell className="w-4 h-4" />알림 설정</button>
        <button type="button" onClick={() => onOpenSettings('theme')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"><Palette className="w-4 h-4" />화면 설정</button>
      </div>
    </div>
  );
}
