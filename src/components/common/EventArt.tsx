import React, { useState } from 'react';

/**
 * 일정 당일 헤더 제목 앞 그림 (이모지 대신 직접 그린 그림 · 움직임)
 *  - 굵은 테두리 + 단색 면 (이모지 그림체와 비슷하게)
 *  - balloon: 풍선 (주년) / popper: 폭죽 (생일·축하·기념) / exam: 시험지 (수능·시험)
 *  - 누르면 색종이가 터짐 · 움직임 줄이기 설정이면 멈춤 (index.css)
 */
export type ArtKind = 'balloon' | 'popper' | 'exam';
const LINE = '#1f1a24';

export function artFor(title: string, art?: string): ArtKind | null {
  if (art === 'none') return null;
  if (art === 'balloon' || art === 'popper' || art === 'exam') return art;
  const t = String(title || '');
  if (/수능|시험|모의고사|모의평가|기말|중간고사/.test(t)) return 'exam';
  if (/주년|anniversary/i.test(t)) return 'balloon';
  if (/생일|축하|기념|데뷔|파티|100일|1000일/.test(t)) return 'popper';
  return null;
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

const ART: Record<ArtKind, () => React.ReactElement> = { balloon: Balloons, popper: Popper, exam: Exam };

/** 누르면 색종이 터짐 */
export function EventArt({ kind, label }: { kind: ArtKind; label?: string }) {
  const [burst, setBurst] = useState(0);
  const A = ART[kind];
  return (
    <span role="img" aria-label={label || '오늘의 그림'} title={label} onClick={(e) => { e.stopPropagation(); setBurst((n) => n + 1); }}
      className="relative inline-flex shrink-0 h-[1.45em] w-[1.45em] cursor-pointer select-none">
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
