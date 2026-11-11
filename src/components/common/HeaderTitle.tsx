import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../utils';

/**
 * 헤더 제목 '우주하마 방송 예측' 꾸미기
 *  - 누구나 아는 기념일·명절에 맞춰 글씨 모양·작은 장식이 바뀜 (그날만, 한국 시간)
 *  - 관리자가 넣은 그림·GIF(기간 지정)가 있으면 그게 먼저
 *  - 움직임 줄이기 설정을 켠 기기에서는 장식이 움직이지 않음
 */
export type TitleDecor = { id: string; from: string; to: string; image: string; label?: string; enabled?: boolean };

type Theme = {
  key: string;
  label: string;
  /** 글씨 채우기 (background-clip: text) */
  fill: string;
  /** 다크 모드에서 글씨 채우기 (없으면 fill) */
  fillDark?: string;
  /** 글씨 테두리·그림자 */
  shadow?: string;
  /** 작은 장식 (이모지) */
  deco: string[];
  /** 장식이 떨어지는(눈 등) 모양이면 */
  fall?: boolean;
};

const T = {
  pepero: { key: 'pepero', label: '빼빼로데이', fill: 'linear-gradient(to top, #d9a55b 0 42%, #4a2a17 42% 100%)', fillDark: 'linear-gradient(to top, #f0cd8c 0 42%, #a0643c 42% 100%)', deco: ['🍫'] },
  garaetteok: { key: 'garaetteok', label: '가래떡데이 · 농업인의 날', fill: 'linear-gradient(180deg, #b9ad97 0%, #8c7f68 100%)', fillDark: 'linear-gradient(180deg, #ffffff 0%, #e7e0d2 100%)', deco: ['🍡', '🌾'] },
  christmas: { key: 'christmas', label: '메리 크리스마스', fill: 'linear-gradient(90deg, #c1121f, #2d6a4f 50%, #c1121f)', fillDark: 'linear-gradient(90deg, #ff5d5d, #52b788 50%, #ff5d5d)', deco: ['🎄', '❄'] },
  newyear: { key: 'newyear', label: '새해 복 많이 받으세요', fill: 'linear-gradient(90deg, #b8860b, #ffd76a, #b8860b)', deco: ['🎉', '✨'] },
  seollal: { key: 'seollal', label: '설날', fill: 'linear-gradient(90deg, #c1121f, #e85d04, #ffba08, #2a9d8f, #3a86ff)', deco: ['🧧', '🎎'] },
  chuseok: { key: 'chuseok', label: '추석', fill: 'linear-gradient(180deg, #d98b1c, #b5541a)', fillDark: 'linear-gradient(180deg, #fff1b8, #ffc56b)', deco: ['🌕', '🍡'] },
  halloween: { key: 'halloween', label: '할로윈', fill: 'linear-gradient(90deg, #ff7a00, #7b2cbf)', deco: ['🎃', '👻', '🦇'] },
  valentine: { key: 'valentine', label: '밸런타인데이', fill: 'linear-gradient(90deg, #ff4d8d, #c9184a)', deco: ['💝', '🍫'] },
  whiteday: { key: 'whiteday', label: '화이트데이', fill: 'linear-gradient(90deg, #ffafcc, #a2d2ff)', deco: ['🍬', '🍭'] },
  children: { key: 'children', label: '어린이날', fill: 'linear-gradient(90deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93)', deco: ['🎈', '🧸'] },
  hangul: { key: 'hangul', label: '한글날', fill: 'linear-gradient(180deg, #1b1b1b, #444)', fillDark: 'linear-gradient(180deg, #ffffff, #cfcfcf)', deco: ['ㄱ', 'ㄴ', 'ㅎ'] },
  liberation: { key: 'liberation', label: '광복절', fill: 'linear-gradient(90deg, #cd2e3a 0 50%, #0047a0 50% 100%)', deco: ['🇰🇷'] },
  samil: { key: 'samil', label: '삼일절', fill: 'linear-gradient(90deg, #cd2e3a 0 50%, #0047a0 50% 100%)', deco: ['🇰🇷'] },
  buddha: { key: 'buddha', label: '부처님오신날', fill: 'linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcB77, #4d96ff)', deco: ['🏮'] },
} satisfies Record<string, Theme>;

/** 음력 명절 (양력 날짜, 앞뒤 하루 포함은 아래에서) */
const LUNAR: Record<string, { seollal: string; chuseok: string; buddha: string }> = {
  '2026': { seollal: '2026-02-17', chuseok: '2026-09-25', buddha: '2026-05-24' },
  '2027': { seollal: '2027-02-07', chuseok: '2027-09-15', buddha: '2027-05-13' },
  '2028': { seollal: '2028-01-26', chuseok: '2028-10-03', buddha: '2028-05-02' },
  '2029': { seollal: '2029-02-13', chuseok: '2029-09-22', buddha: '2029-05-20' },
  '2030': { seollal: '2030-02-03', chuseok: '2030-09-12', buddha: '2030-05-09' },
};

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** 오늘의 테마들 (11/11 처럼 두 개면 번갈아) */
export function themesFor(day: string): Theme[] {
  const md = day.slice(5);
  const y = day.slice(0, 4);
  const out: Theme[] = [];
  const l = LUNAR[y];
  if (l) {
    if ([-1, 0, 1].some((n) => addDays(l.seollal, n) === day)) out.push(T.seollal);
    if ([-1, 0, 1].some((n) => addDays(l.chuseok, n) === day)) out.push(T.chuseok);
    if (l.buddha === day) out.push(T.buddha);
  }
  if (md === '01-01') out.push(T.newyear);
  if (md === '02-14') out.push(T.valentine);
  if (md === '03-01') out.push(T.samil);
  if (md === '03-14') out.push(T.whiteday);
  if (md === '05-05') out.push(T.children);
  if (md === '08-15') out.push(T.liberation);
  if (md === '10-09') out.push(T.hangul);
  if (md === '10-31') out.push(T.halloween);
  if (md === '11-11') out.push(T.pepero, T.garaetteok);
  if (md === '12-24' || md === '12-25') out.push(T.christmas);
  if (md === '12-31') out.push(T.newyear);
  return out;
}

export function activeCustomDecor(list?: TitleDecor[], day = kstToday()) {
  return (list || []).find((d) => d.enabled !== false && d.image && d.from <= day && day <= (d.to || d.from)) || null;
}

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function HeaderTitle({ decor, className, previewDay }: { decor?: TitleDecor[]; className?: string; previewDay?: string }) {
  // ?titleday=2026-12-25 로 미리 보기 (관리자 확인용)
  const day = previewDay || (() => { try { const q = new URLSearchParams(window.location.search).get('titleday'); return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : kstToday(); } catch { return kstToday(); } })();
  const custom = activeCustomDecor(decor, day);
  const themes = useMemo(() => themesFor(day), [day]);
  const [i, setI] = useState(0);
  // 테마가 둘이면 6초마다 번갈아
  useEffect(() => {
    if (themes.length < 2 || reduceMotion()) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % themes.length), 6000);
    return () => window.clearInterval(t);
  }, [themes.length]);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const base = 'text-xl sm:text-[25px] font-extrabold tracking-tight truncate';

  if (custom) {
    return (
      <h1 className={cn(base, 'flex items-center gap-1.5', className)} title={custom.label || undefined}>
        <img src={custom.image} alt={custom.label || '오늘의 장식'} className="h-[1.35em] w-auto max-w-[3.5em] object-contain shrink-0 rounded" draggable={false} />
        <span className="text-zinc-900 dark:text-white truncate">우주하마 방송 예측</span>
      </h1>
    );
  }
  if (!themes.length) {
    return <h1 className={cn(base, 'text-zinc-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors', className)}>우주하마 방송 예측</h1>;
  }
  const th = themes[i % themes.length];
  return (
    <h1 className={cn(base, 'relative flex items-center gap-1 min-w-0', className)} title={th.label} aria-label={`우주하마 방송 예측 · ${th.label}`}>
      <span
        key={th.key}
        className="title-decor-text inline-block truncate"
        style={{ backgroundImage: dark && th.fillDark ? th.fillDark : th.fill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent', filter: th.shadow ? `drop-shadow(${th.shadow.split(',')[0]})` : undefined }}
      >
        우주하마 방송 예측
      </span>
      <span aria-hidden="true" className="title-decor">
        {th.deco.map((d, k) => (
          <span key={`${th.key}-${k}`} style={{ animationDelay: `${k * 0.5}s` }}>{d}</span>
        ))}
      </span>
    </h1>
  );
}
