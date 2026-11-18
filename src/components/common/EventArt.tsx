import React, { useState } from 'react';

/**
 * 일정 당일 헤더 제목 앞 그림 (이모지 대신 직접 그린 그림 · 움직임)
 *  - 굵은 테두리 + 단색 면 (이모지 그림체와 비슷하게)
 *  - balloon: 풍선 (주년) / popper: 폭죽 (생일·축하·기념) / exam: 시험지 (수능·시험)
 *  - 누르면 색종이가 터짐 · 움직임 줄이기 설정이면 멈춤 (index.css)
 */
export type ArtKind = 'balloon' | 'popper' | 'exam' | 'banner' | 'birthday' | 'cheer' | 'party';
export const ART_KINDS: { value: ArtKind; label: string }[] = [
  { value: 'banner', label: '하마 + 플래카드 + 불꽃 (주년)' },
  { value: 'birthday', label: '하마 + 고깔모자 + 색종이 (생일)' },
  { value: 'cheer', label: '하마 + 필승 머리띠 (시험)' },
  { value: 'party', label: '제목 둘레 불꽃·색종이만' },
  { value: 'balloon', label: '풍선' },
  { value: 'popper', label: '폭죽' },
  { value: 'exam', label: '시험지' },
];
const LINE = '#1f1a24';

export function artFor(title: string, art?: string): ArtKind | null {
  if (art === 'none') return null;
  if (ART_KINDS.some((k) => k.value === art)) return art as ArtKind;
  const t = String(title || '');
  if (/수능|시험|모의고사|모의평가|기말|중간고사/.test(t)) return 'cheer';
  if (/주년|anniversary/i.test(t)) return 'banner';
  if (/생일|생신|birthday/i.test(t)) return 'birthday';
  if (/축하|기념|데뷔|파티|100일|1000일/.test(t)) return 'party';
  return null;
}
/** 제목 둘레에 불꽃·색종이가 흩날리는 꾸미기를 같이 할지 */
export const celebrates = (k: ArtKind) => k === 'banner' || k === 'birthday' || k === 'party';
/** 플래카드에 넣을 짧은 글 (일정 이름에서: '우주하마 10주년' → '10주년') */
export function bannerText(title: string, given?: string): string {
  if (given && given.trim()) return given.trim().slice(0, 6);
  const m = String(title || '').match(/\d+\s*주년/);
  if (m) return m[0].replace(/\s+/g, '');
  if (/생일|생신/.test(title)) return '생일 ㅊㅋ';
  return 'ㅊㅋ';
}

function Balloons() {
  const b = (cx: number, cy: number, fill: string, shine: string, cls: string) => (
    <g className={cls}>
      <path d={`M${cx} ${cy + 13} q -1.5 7 1.5 13 q 2 5 -1 9`} fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
      <path d={`M${cx - 2.6} ${cy + 15.5} L${cx} ${cy + 12} L${cx + 2.6} ${cy + 15.5} Z`} fill={fill} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx={cx} cy={cy} rx="10.5" ry="12.5" fill={fill} stroke={LINE} strokeWidth="2.6" />
      <ellipse cx={cx - 4} cy={cy - 5} rx="2.6" ry="4" fill={shine} transform={`rotate(25 ${cx - 4} ${cy - 5})`} />
    </g>
  );
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      {b(20, 22, '#4aa8ff', '#bfe0ff', 'ea-bob ea-d1')}
      {b(44, 20, '#ffcf3a', '#fff1b3', 'ea-bob ea-d2')}
      {b(32, 15, '#ff4f7b', '#ffc2d1', 'ea-bob ea-d0')}
    </svg>
  );
}

function Popper() {
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      {/* 리본 (뒤에 굵은 테두리 선 + 위에 색 선) */}
      <g className="ea-pop">
        {[
          { d: 'M24 28 C 16 22, 22 14, 16 8 C 12 4, 8 10, 12 13', c: '#ff5c93' },
          { d: 'M30 24 C 32 16, 40 18, 38 8', c: '#3fb6ff' },
          { d: 'M22 32 C 14 32, 12 40, 5 37', c: '#ffa53a' },
        ].map((r, i) => (
          <g key={i}>
            <path d={r.d} fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" />
            <path d={r.d} fill="none" stroke={r.c} strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
      </g>
      {/* 색종이 */}
      {[['#ff5c93', 10, 22], ['#3fb6ff', 40, 30], ['#ffcf3a', 46, 12], ['#7ed957', 28, 6]].map(([c, x, y], i) => (
        <rect key={i} x={Number(x)} y={Number(y)} width="4" height="4" rx="1" fill={String(c)} stroke={LINE} strokeWidth="1.2" className={`ea-confetti ea-c${i}`} />
      ))}
      {/* 고깔 */}
      <path d="M14 36 L34 16 L56 57 Z" fill="#f2546b" stroke={LINE} strokeWidth="2.8" strokeLinejoin="round" />
      <clipPath id="ea-cone"><path d="M14 36 L34 16 L56 57 Z" /></clipPath>
      <g clipPath="url(#ea-cone)">
        {[0, 1, 2].map((i) => <path key={i} d={`M${12 + i * 10} ${50 - i * 2} L${44 + i * 4} ${18 + i * 10}`} stroke="#ffb3c4" strokeWidth="5" />)}
      </g>
      <path d="M14 36 L34 16 L56 57 Z" fill="none" stroke={LINE} strokeWidth="2.8" strokeLinejoin="round" />
      <ellipse cx="24" cy="26" rx="14.1" ry="4.6" transform="rotate(-45 24 26)" fill="#b8243b" stroke={LINE} strokeWidth="2.6" />
    </svg>
  );
}

function Exam() {
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      <g transform="rotate(-6 30 32)">
        <rect x="10" y="7" width="38" height="50" rx="3.5" fill="#ffffff" stroke={LINE} strokeWidth="2.6" />
        <rect x="10" y="7" width="38" height="11" rx="3.5" fill="#cfe3ff" stroke={LINE} strokeWidth="2.6" />
        <text x="29" y="15.6" textAnchor="middle" fontSize="7" fontWeight="900" fill={LINE} fontFamily="'BMHANNAPro','Black Han Sans',sans-serif">수능</text>
        {[25, 33, 41, 49].map((y, i) => (
          <g key={y}>
            <circle cx="16" cy={y} r="2.2" fill="none" stroke="#9aa3b2" strokeWidth="1.4" />
            <line x1="21" y1={y} x2={i % 2 ? 36 : 42} y2={y} stroke="#9aa3b2" strokeWidth="2" strokeLinecap="round" />
            <path d={`M14.6 ${y} l1.4 1.5 l2.8 -3.2`} fill="none" stroke="#ff4f6a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`ea-check ea-k${i}`} />
          </g>
        ))}
      </g>
      {/* 연필 */}
      <g className="ea-pencil">
        <g transform="rotate(40 46 40)">
          <rect x="41" y="14" width="10" height="32" fill="#ffc83d" stroke={LINE} strokeWidth="2.4" strokeLinejoin="round" />
          <rect x="41" y="10" width="10" height="6" rx="2" fill="#ff8fab" stroke={LINE} strokeWidth="2.4" />
          <path d="M41 46 L46 56 L51 46 Z" fill="#f6d7ad" stroke={LINE} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M44.4 52.8 L46 56 L47.6 52.8 Z" fill={LINE} />
        </g>
      </g>
    </svg>
  );
}

/**
 * 하마: 사이트 아이콘의 하마 그림(/img/hippo.png)에 소품만 그려 얹음
 *  - 플래카드(주년) · 고깔모자(생일) · 필승 머리띠와 연필(시험)
 */
const HIPPO = '#7092bf';
const HIPPO_SRC = '/img/hippo.png';
/** 하마 얼굴 그림 (가로:세로 = 512:410) */
function HippoImg({ x = 9, y = 24, w = 46 }: { x?: number; y?: number; w?: number }) {
  return <image href={HIPPO_SRC} x={x} y={y} width={w} height={w * 410 / 512} className="ea-blink-img" />;
}
/** 하마가 플래카드를 번쩍 (주년) */
function HippoBanner({ text }: { text: string }) {
  const fs = text.length <= 3 ? 10 : text.length <= 4 ? 8.6 : 7.2;
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      <g className="ea-cheer">
        <path d="M13 31 L13.5 5 M51 31 L50.5 5" stroke="#f5d76e" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M13 31 L13.5 5 M51 31 L50.5 5" stroke={LINE} strokeWidth="0.9" strokeLinecap="round" opacity=".55" />
        <path d="M12.5 5 L51.5 5 L51 19 L13 19 Z" fill="#7cc8f8" stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" />
        <text x="32" y={13.9 + (10 - fs) * 0.25} textAnchor="middle" fontSize={fs} fontWeight="900" fill="#ffe24d" stroke={LINE} strokeWidth="1.5" paintOrder="stroke" fontFamily="'BMHANNAPro','Black Han Sans',sans-serif">{text}</text>
        <circle cx="13.5" cy="5" r="1.7" fill="#ffe24d" stroke={LINE} strokeWidth="1.2" />
        <circle cx="50.5" cy="5" r="1.7" fill="#ffe24d" stroke={LINE} strokeWidth="1.2" />
        {/* 번쩍 든 두 팔 */}
        <path d="M17 40 Q 11 34 12.5 26" fill="none" stroke={LINE} strokeWidth="7.6" strokeLinecap="round" />
        <path d="M17 40 Q 11 34 12.5 26" fill="none" stroke={HIPPO} strokeWidth="4.6" strokeLinecap="round" />
        <path d="M47 40 Q 53 34 51.5 26" fill="none" stroke={LINE} strokeWidth="7.6" strokeLinecap="round" />
        <path d="M47 40 Q 53 34 51.5 26" fill="none" stroke={HIPPO} strokeWidth="4.6" strokeLinecap="round" />
      </g>
      <HippoImg x={9} y={27} w={46} />
    </svg>
  );
}
/** 하마 + 고깔모자 (생일) */
function HippoBirthday() {
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      <g className="ea-bob" style={{ transformOrigin: '32px 62px' }}>
        <HippoImg x={8} y={26} w={48} />
        <g transform="rotate(-10 34 22)">
          <path d="M24 30 L34 5 L44 29 Z" fill="#ff7aa8" stroke={LINE} strokeWidth="2.3" strokeLinejoin="round" />
          <path d="M27.4 22 L40.8 21.5 M30.6 14.5 L37.6 14.2" stroke="#ffe24d" strokeWidth="2.6" />
          <path d="M24 30 L34 5 L44 29 Z" fill="none" stroke={LINE} strokeWidth="2.3" strokeLinejoin="round" />
          <circle cx="34" cy="5" r="3" fill="#ffe24d" stroke={LINE} strokeWidth="1.7" className="ea-twinkle" />
        </g>
      </g>
    </svg>
  );
}
/** 하마 + 필승 머리띠 + 연필 (시험) */
function HippoCheer() {
  return (
    <svg viewBox="0 0 64 64" className="event-art" aria-hidden="true">
      <HippoImg x={6} y={24} w={48} />
      <path d="M13.5 30.5 Q 30 27 47.5 29 L47.3 34.5 Q 30 32.5 13.8 36 Z" fill="#ffffff" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <text x="30.5" y="33.9" textAnchor="middle" fontSize="5.6" fontWeight="900" fill="#e8344f" fontFamily="'BMHANNAPro','Black Han Sans',sans-serif">필승</text>
      <path d="M47.4 30.5 l6 -3.4 M47.4 33.5 l6.6 0.8" stroke={LINE} strokeWidth="1.9" strokeLinecap="round" className="ea-flutter" />
      <g className="ea-pencil">
        <g transform="rotate(35 55 42)">
          <rect x="51.5" y="28" width="7" height="22" fill="#ffc83d" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
          <rect x="51.5" y="25" width="7" height="4.4" rx="1.5" fill="#ff8fab" stroke={LINE} strokeWidth="2" />
          <path d="M51.5 50 L55 57 L58.5 50 Z" fill="#f6d7ad" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

/**
 * 불꽃 하나 (자세히): 아래에서 올라오는 꼬리 → 펑 → 꽃잎 두 겹(가운데 하양 → 끝 색) · 끝에 반짝이 · 퍼지며 아래로 처짐
 */
let fwSeq = 0;
export function Firework({ color, light, size, delay = 0, style }: { color: string; light: string; size: number; delay?: number; style?: React.CSSProperties }) {
  const [gid] = useState(() => `fw${++fwSeq}`);
  const petal = (len: number, w: number) => `M0 ${-w * 0.25} Q ${len * 0.55} ${-w} ${len} 0 Q ${len * 0.55} ${w} 0 ${w * 0.25} Z`;
  return (
    <span className="ea-fw" style={{ width: size, height: size * 1.5, ...style, ['--d' as any]: `${delay}s` }} aria-hidden="true">
      <svg viewBox="-24 -24 48 72" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${gid}o`} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor={light} /><stop offset="1" stopColor={color} /></linearGradient>
          <linearGradient id={`${gid}i`} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor={light} /></linearGradient>
          <radialGradient id={`${gid}g`}><stop offset="0" stopColor={color} stopOpacity=".45" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
        </defs>
        <path d="M0 44 Q 1.5 24 0 4" className="ea-fw-trail" stroke={light} strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <g className="ea-fw-burst">
          <circle r="24" fill={`url(#${gid}g)`} />
          {Array.from({ length: 16 }, (_, i) => <path key={`o${i}`} d={petal(i % 2 ? 17 : 21, 2.4)} fill={`url(#${gid}o)`} transform={`rotate(${(i / 16) * 360 - 90}) translate(5 0)`} />)}
          {Array.from({ length: 10 }, (_, i) => <path key={`i${i}`} d={petal(9, 1.6)} fill={`url(#${gid}i)`} transform={`rotate(${(i / 10) * 360 + 18}) translate(2 0)`} />)}
          <circle r="2.6" fill="#fff" />
          {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 + 0.3; const r = i % 2 ? 22.5 : 25; return <circle key={`d${i}`} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={i % 3 ? 0.9 : 1.4} fill={i % 2 ? '#fff' : light} className="ea-fw-glit" style={{ animationDelay: `calc(var(--d) + ${0.9 + (i % 4) * 0.12}s)` }} />; })}
        </g>
      </svg>
    </span>
  );
}

/** 제목 둘레: 양쪽 불꽃이 펑펑 + 색종이 흩날림 + 반짝 (그림 1 처럼) */
export function TitleCelebrate() {
  const bits: [string, string, string, number, number][] = [
    ['1%', '70%', '#3fb6ff', 0, 1], ['12%', '-10%', '#ff5c93', 0.4, 0], ['27%', '98%', '#ffcf3a', 0.8, 1], ['41%', '-16%', '#a78bfa', 0.2, 0],
    ['55%', '96%', '#ff5c93', 0.6, 1], ['68%', '-12%', '#ffcf3a', 1, 0], ['86%', '90%', '#3fb6ff', 0.3, 1], ['98%', '8%', '#a78bfa', 0.7, 0],
    ['35%', '40%', '#7ed957', 1.4, 1], ['80%', '45%', '#ff5c93', 1.8, 0],
  ];
  return (
    <span className="ea-celebrate" aria-hidden="true">
      <Firework color="#ff3d7f" light="#ffb3cf" size={44} style={{ left: '-2%', top: '-58%' }} />
      <Firework color="#2f7dff" light="#b9dcff" size={44} delay={1.3} style={{ left: '74%', top: '-62%' }} />
      <Firework color="#a855f7" light="#e9d5ff" size={26} delay={2.1} style={{ left: '44%', top: '-70%' }} />
      {bits.map(([x, y, c, d, k], i) => <i key={i} className={k ? 'ea-bit ea-bit-r' : 'ea-bit'} style={{ left: x, top: y, background: c, animationDelay: `${d}s`, ['--r' as any]: `${i * 37}deg` }} />)}
      {[['22%', '-24%', 0.2, 10], ['63%', '104%', 1.1, 8], ['94%', '52%', 0.6, 9], ['6%', '108%', 1.6, 7]].map(([x, y, d, w], i) => (
        <svg key={i} viewBox="-6 -6 12 12" className="ea-spark" style={{ left: String(x), top: String(y), width: Number(w), height: Number(w), animationDelay: `${d}s` }}><path d="M0 -5.5 Q .9 -.9 5.5 0 Q .9 .9 0 5.5 Q -.9 .9 -5.5 0 Q -.9 -.9 0 -5.5Z" fill="#fff" /></svg>
      ))}
    </span>
  );
}

const ART: Record<Exclude<ArtKind, 'banner' | 'party'>, () => React.ReactElement> = { balloon: Balloons, popper: Popper, exam: Exam, birthday: HippoBirthday, cheer: HippoCheer };

/** 누르면 색종이 터짐 */
export function EventArt({ kind, label, text, image }: { kind: ArtKind; label?: string; text?: string; /** 관리자가 올린 그림 (있으면 그린 하마 대신) */ image?: string }) {
  const [burst, setBurst] = useState(0);
  if (kind === 'party' && !image) return null;
  const A = image ? () => <img src={image} alt="" className="w-full h-full object-contain" draggable={false} /> : kind === 'banner' ? () => <HippoBanner text={text || bannerText(label || '')} /> : ART[kind];
  return (
    <span role="img" aria-label={label || '오늘의 그림'} title={label} onClick={() => setBurst((n) => n + 1)}
      className={`relative inline-flex shrink-0 cursor-pointer select-none ${kind === 'banner' || kind === 'birthday' || kind === 'cheer' ? 'h-[1.9em] w-[1.9em] -my-[0.25em]' : 'h-[1.45em] w-[1.45em]'}`}>
      <A />
      {burst > 0 && (
        <span key={burst} className="ea-burst pointer-events-none" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ ['--a' as any]: `${(i / 14) * 360}deg`, ['--d' as any]: `${26 + (i % 3) * 10}px`, background: ['#ff5c93', '#3fb6ff', '#ffcf3a', '#7ed957', '#a78bfa'][i % 5] }} />
          ))}
        </span>
      )}
    </span>
  );
}
