import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../utils';
import { EventArt, artFor, celebrates, TitleCelebrate, bannerText, type ArtKind } from './EventArt';
import { occursOn } from '../../utils/dday';
import { EggTrigger, Pumpkin, Moon, loadFont, type EggKind } from './TitleEggs';
import type { DdayEvent } from '../../types';

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
  /** 제목 글씨체 (구글 글꼴, 제목 글자만 받아 옴) */
  font?: string;
  /** 장식을 세 번 누르면 나오는 팝업 */
  egg?: { kind: EggKind; msg: string };
};
const TITLE = '우주하마 방송 예측';
const ART_FONT: Partial<Record<ArtKind, string>> = { banner: 'Jua', birthday: 'Gaegu', cheer: 'Do Hyeon', exam: 'Do Hyeon', party: 'Jua', balloon: 'Jua', popper: 'Jua' };
const FONT_WEIGHT: Record<string, number> = { Gaegu: 700, 'Nanum Myeongjo': 800, 'Gowun Batang': 700 }; // 나머지는 굵기가 하나(400)뿐 → 억지 굵게 안 되게 400

const T = {
  pepero: { key: 'pepero', label: '빼빼로데이', font: 'Do Hyeon', fill: 'linear-gradient(to top, #d9a55b 0 42%, #4a2a17 42% 100%)', fillDark: 'linear-gradient(to top, #f0cd8c 0 42%, #a0643c 42% 100%)', deco: ['🍫'] },
  garaetteok: { key: 'garaetteok', label: '가래떡데이 · 농업인의 날', font: 'Gowun Dodum', fill: 'linear-gradient(180deg, #b9ad97 0%, #8c7f68 100%)', fillDark: 'linear-gradient(180deg, #ffffff 0%, #e7e0d2 100%)', deco: ['🍡', '🌾'] },
  christmas: { key: 'christmas', label: '메리 크리스마스', font: 'Gaegu', fill: 'linear-gradient(90deg, #c1121f, #2d6a4f 50%, #c1121f)', fillDark: 'linear-gradient(90deg, #ff5d5d, #52b788 50%, #ff5d5d)', deco: ['🎄', '❄'] },
  newyear: { key: 'newyear', label: '새해 복 많이 받으세요', font: 'Black Han Sans', fill: 'linear-gradient(90deg, #b8860b, #ffd76a, #b8860b)', deco: ['🎉', '✨'] },
  seollal: { key: 'seollal', label: '설날', font: 'Song Myung', egg: { kind: 'moon', msg: '새해 복 많이 받으세요' }, fill: 'linear-gradient(90deg, #c1121f, #e85d04, #ffba08, #2a9d8f, #3a86ff)', deco: ['🧧', '🎎'] },
  chuseok: { key: 'chuseok', label: '추석', font: 'Gowun Batang', egg: { kind: 'moon', msg: '보름달처럼 꽉 찬 한가위 보내세요' }, fill: 'linear-gradient(180deg, #d98b1c, #b5541a)', fillDark: 'linear-gradient(180deg, #fff1b8, #ffc56b)', deco: ['svg:moon', '🍡'] },
  daeboreum: { key: 'daeboreum', label: '정월대보름', font: 'Song Myung', egg: { kind: 'moon', msg: '부럼 깨고 한 해 소원 빌어요' }, fill: 'linear-gradient(180deg, #b7791f, #7c4a12)', fillDark: 'linear-gradient(180deg, #fff6c9, #ffd27a)', deco: ['svg:moon', '🌰'] },
  halloween: { key: 'halloween', label: '할로윈', font: 'Dokdo', egg: { kind: 'pumpkin', msg: 'Trick or Treat!' }, fill: 'linear-gradient(90deg, #ff7a00, #7b2cbf)', deco: ['svg:pumpkin', '👻', '🦇'] },
  valentine: { key: 'valentine', label: '밸런타인데이', font: 'Hi Melody', fill: 'linear-gradient(90deg, #ff4d8d, #c9184a)', deco: ['💝', '🍫'] },
  whiteday: { key: 'whiteday', label: '화이트데이', font: 'Gamja Flower', fill: 'linear-gradient(90deg, #ffafcc, #a2d2ff)', deco: ['🍬', '🍭'] },
  children: { key: 'children', label: '어린이날', font: 'Jua', fill: 'linear-gradient(90deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93)', deco: ['🎈', '🧸'] },
  hangul: { key: 'hangul', label: '한글날', font: 'Nanum Myeongjo', fill: 'linear-gradient(180deg, #1b1b1b, #444)', fillDark: 'linear-gradient(180deg, #ffffff, #cfcfcf)', deco: ['ㄱ', 'ㄴ', 'ㅎ'] },
  liberation: { key: 'liberation', label: '광복절', font: 'Black Han Sans', fill: 'linear-gradient(90deg, #cd2e3a 0 50%, #0047a0 50% 100%)', deco: ['🇰🇷'] },
  samil: { key: 'samil', label: '삼일절', font: 'Black Han Sans', fill: 'linear-gradient(90deg, #cd2e3a 0 50%, #0047a0 50% 100%)', deco: ['🇰🇷'] },
  buddha: { key: 'buddha', label: '부처님오신날', font: 'Yeon Sung', fill: 'linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcB77, #4d96ff)', deco: ['🏮'] },
} satisfies Record<string, Theme>;

/** 음력 명절 (양력 날짜, 앞뒤 하루 포함은 아래에서) */
// 정월대보름 = 설날(음력 1월 1일) + 14일
const LUNAR: Record<string, { seollal: string; chuseok: string; buddha: string }> = {
  '2026': { seollal: '2026-02-17', chuseok: '2026-09-25', buddha: '2026-05-24' },
  '2027': { seollal: '2027-02-07', chuseok: '2027-09-15', buddha: '2027-05-13' },
  '2028': { seollal: '2028-01-26', chuseok: '2028-10-03', buddha: '2028-05-02' },
  '2029': { seollal: '2029-02-13', chuseok: '2029-09-22', buddha: '2029-05-20' },
  '2030': { seollal: '2030-02-03', chuseok: '2030-09-12', buddha: '2030-05-09' },
};

/** 수능 (교육부 발표) — 일정에 따로 안 넣어도 그날은 시험지 그림 */
const SUNEUNG: Record<string, string> = { '2026': '2026-11-19' };

/** 오늘 그림: 관리자 일정(당일) 먼저, 없으면 수능 — 시험(수능)은 전날(D-1)부터 */
export function eventArtFor(events: DdayEvent[] | undefined, day: string): { kind: ArtKind; label: string; text?: string; message?: string; image?: string } | null {
  const tomorrow = addDays(day, 1);
  for (const e of events || []) {
    if (!e || e.active === false) continue;
    const k = artFor(e.title, (e as any).art);
    if (!k) continue;
    if (occursOn(e, day)) return { kind: k, label: e.title, text: e.banner, message: e.message, image: e.image };
    if ((k === 'exam' || k === 'cheer') && occursOn(e, tomorrow)) return { kind: k, label: `내일 ${e.title}`, text: e.banner, message: e.message, image: e.image };
  }
  const sn = SUNEUNG[day.slice(0, 4)];
  if (sn === day) return { kind: 'cheer', label: '수능 날 · 수험생 여러분 응원해요' };
  if (sn === tomorrow) return { kind: 'cheer', label: '내일 수능 · 수험생 여러분 응원해요' };
  return null;
}

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
    if (addDays(l.seollal, 14) === day) out.push((T as any).daeboreum);
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

export function HeaderTitle({ decor, events, className, previewDay }: { decor?: TitleDecor[]; events?: DdayEvent[]; className?: string; previewDay?: string }) {
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
  const base = 'text-xl sm:text-[length:calc(25px*var(--fs,1))] font-extrabold tracking-tight truncate';

  // ?titleart=banner&titletext=10주년 으로 그림 미리 보기 (관리자 확인용)
  const pv = (() => { try { const q = new URLSearchParams(window.location.search); const k = q.get('titleart'); return k ? { kind: artFor('', k) as ArtKind, label: q.get('titletext') || '미리 보기', text: q.get('titletext') || undefined } : null; } catch { return null; } })();
  const art = pv?.kind ? pv : custom ? null : eventArtFor(events, day);
  const font = art ? ART_FONT[art.kind] : (!custom && themes.length ? themes[i % themes.length].font : undefined);
  useEffect(() => { if (font) loadFont(font, TITLE, FONT_WEIGHT[font]); }, [font]);
  const fontStyle = font ? { fontFamily: `'${font}', var(--font-sans, sans-serif)`, fontWeight: FONT_WEIGHT[font] || 400 } : undefined;
  if (art) {
    const exam = art.kind === 'cheer' || art.kind === 'exam';
    const eggKind: EggKind | null = exam ? 'exam' : celebrates(art.kind) ? 'party' : null;
    const eggMsg = (art as any).message || (exam ? (art.label.startsWith('내일') ? '내일 수능, 다들 화이팅!!' : '수능 화이팅!!') : `${art.text || bannerText(art.label)} 축하해요!`);
    const icon = <EventArt kind={art.kind} label={art.label} text={art.text} image={(art as any).image} />;
    const text = <span className="ea-title-text text-zinc-900 dark:text-white truncate" style={fontStyle}>{TITLE}</span>;
    return (
      <h1 className={cn(base, 'flex items-center gap-1.5 min-w-0 !overflow-visible', className)} title={art.label} aria-label={`우주하마 방송 예측 · ${art.label}`}>
        {eggKind && art.kind !== 'party' ? <EggTrigger kind={eggKind} message={eggMsg} sub={exam ? '찍은 것도 다 맞길!' : undefined} label={art.label} hero={exam ? undefined : <EventArt kind={art.kind} label={art.label} text={art.text} image={(art as any).image} />}>{icon}</EggTrigger> : icon}
        <span className="ea-title-wrap">
          {celebrates(art.kind) && <TitleCelebrate />}
          {art.kind === 'party' ? <EggTrigger kind="party" message={eggMsg} label={art.label}>{text}</EggTrigger> : text}
        </span>
      </h1>
    );
  }
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
        style={{ ...fontStyle, backgroundImage: dark && th.fillDark ? th.fillDark : th.fill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent', filter: th.shadow ? `drop-shadow(${th.shadow.split(',')[0]})` : undefined }}
      >
        우주하마 방송 예측
      </span>
      {(() => {
        const decos = (
          <span aria-hidden="true" className="title-decor">
            {th.deco.map((d, k) => (
              <span key={`${th.key}-${k}`} style={{ animationDelay: `${k * 0.5}s` }}>
                {d === 'svg:pumpkin' ? <Pumpkin lit className="w-[1.15em] h-[1.15em]" /> : d === 'svg:moon' ? <Moon className="w-[1.1em] h-[1.1em]" /> : d}
              </span>
            ))}
          </span>
        );
        return th.egg ? <EggTrigger kind={th.egg.kind} message={th.egg.msg} label={th.label}>{decos}</EggTrigger> : decos;
      })()}
    </h1>
  );
}
