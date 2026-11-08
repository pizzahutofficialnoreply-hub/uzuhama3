import React from 'react';

interface SmartTrendLabelProps {
  x?: number;
  y?: number;
  value?: number | string;
  index?: number;
  totalPoints?: number;
  points?: Array<{ x?: number; y?: number; value?: number }>;
  strokeColor?: string;
  textColor?: string;
  className?: string;
  unit?: string;
}

/**
 * SmartTrendLabel
 * 
 * Recharts LineChart <LabelList content={<SmartTrendLabel ... />} />
 * - 데이터가 많거나 인접 포인트와 Y축/X축 거리가 가까워 겹치는 경우
 *   위/아래 번갈아 표시(화살표 지시선 포함)하거나 띄엄띄엄(간격 조절) 표시하여
 *   텍스트가 절대 서로 겹치지 않도록 깔끔하게 렌더링합니다.
 * - 웹 화면(캡처 전용 숨김 모드 지원) 및 PDF/공유 이미지 캡처 모두 완벽 대응.
 */
/**
 * 이름표를 달 점 고르기 (공유 이미지용)
 * - 꺾이는 점은 전부: 오르다 내리는 봉우리(위), 내리다 오르는 골짜기(아래)
 * - 같은 값이 이어지면 그 첫 점만 (평평한 봉우리·골짜기도 첫 점에)
 * - 처음·끝 점
 * - 같은 쪽 이름표가 가까우면 높이를 번갈아(level 0/1) 겹치지 않게
 */
export type TrendPick = { dir: 'up' | 'down'; level: number };
export function pickTrendLabels(values: number[], nearGap = 2): Map<number, TrendPick> {
  const out = new Map<number, TrendPick>();
  const n = values.length;
  if (!n) return out;
  const runs: { start: number; v: number }[] = [];
  values.forEach((v, i) => { if (!runs.length || runs[runs.length - 1].v !== v) runs.push({ start: i, v }); });
  const picks: { i: number; dir: 'up' | 'down' }[] = [];
  runs.forEach((r, k) => {
    const prev = runs[k - 1]?.v;
    const next = runs[k + 1]?.v;
    const peak = (prev === undefined || r.v > prev) && (next === undefined || r.v > next);
    const valley = (prev === undefined || r.v < prev) && (next === undefined || r.v < next);
    if (k === 0) picks.push({ i: r.start, dir: valley && !peak ? 'down' : 'up' });
    else if (peak) picks.push({ i: r.start, dir: 'up' });
    else if (valley) picks.push({ i: r.start, dir: 'down' });
  });
  if (!picks.some((p) => p.i === n - 1) && runs[runs.length - 1].start !== n - 1) picks.push({ i: n - 1, dir: 'up' });
  const lastAt: Record<string, { i: number; level: number }> = {};
  picks.forEach((p) => {
    const prev = lastAt[p.dir];
    const level = prev && p.i - prev.i <= nearGap ? (prev.level + 1) % 2 : 0;
    lastAt[p.dir] = { i: p.i, level };
    out.set(p.i, { dir: p.dir, level });
  });
  return out;
}

const pickCache = new Map<string, Map<number, TrendPick>>();
// 이번 그래프에서 이미 놓은 이름표 자리 (왼쪽부터 차례로 그려짐 → 겹치면 높이·방향을 바꾸고, 끝내 자리가 없으면 그 이름표만 생략)
type Box = { x1: number; x2: number; y1: number; y2: number };
const placedBoxes = new Map<string, Box[]>();
const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

export const SmartTrendLabel: React.FC<SmartTrendLabelProps & { values?: number[] }> = (props) => {
  const {
    x,
    y,
    value,
    index = 0,
    strokeColor = '#7791c1',
    textColor = '#5d76a6',
    className = 'chart-capture-only-label',
    unit = '회',
    values,
  } = props;

  if (x === undefined || y === undefined || value === undefined || value === null) {
    return null;
  }

  // 값 목록이 있으면: 첫 점·꺾이는 점·끝 점에만, 아래(골짜기)·위(봉우리)로
  if (values && values.length) {
    // 같은 쪽 이름표가 이 칸 수 안에 붙으면 높이를 번갈아
    const nearGap = Math.max(2, Math.ceil(values.length / 16));
    const key = `${nearGap}|${values.join(',')}`;
    let picks = pickCache.get(key);
    if (!picks) {
      picks = pickTrendLabels(values, nearGap);
      if (pickCache.size > 30) pickCache.clear();
      pickCache.set(key, picks);
    }
    const pick = picks.get(index);
    if (!pick) return null;
    const first = Math.min(...picks.keys());
    if (index === first) placedBoxes.set(key, []);
    const boxes = placedBoxes.get(key) || [];
    const txt = typeof value === 'number' ? `${value}${unit}` : `${value}`;
    const w = txt.length * 7 + 6;
    // 골짜기는 아래, 봉우리는 위가 먼저. 맨 아래 값은 축 글씨와 겹치니 위로
    const prefDown = pick.dir === 'down' && Number(value) > Math.min(...values);
    const tries: { down: boolean; lead: number }[] = [
      { down: prefDown, lead: 11 }, { down: prefDown, lead: 25 }, { down: prefDown, lead: 39 },
      { down: !prefDown, lead: 11 }, { down: !prefDown, lead: 25 },
    ].filter((t) => !(t.down && Number(value) <= Math.min(...values)));
    let spot: { down: boolean; lead: number; box: Box } | null = null;
    for (const t of tries) {
      const ty = t.down ? y + t.lead + 12 : y - t.lead - 4;
      const box = { x1: x - w / 2, x2: x + w / 2, y1: ty - 11, y2: ty + 2 };
      if (box.y1 < 4) continue;
      if (boxes.some((b) => hit(b, box))) continue;
      spot = { ...t, box };
      break;
    }
    if (!spot) return null;
    boxes.push(spot.box);
    placedBoxes.set(key, boxes);
    const down = spot.down;
    const lead = spot.lead;
    const ty = down ? y + lead + 12 : y - lead - 4;
    return (
      <g className={className}>
        <line x1={x} y1={down ? y + 3 : y - 3} x2={x} y2={down ? y + lead : y - lead} stroke={strokeColor} strokeWidth={1.4} strokeDasharray="2 2" opacity={0.9} />
        <circle cx={x} cy={y} r={2.6} fill="#ffffff" stroke={strokeColor} strokeWidth={1.6} />
        <text x={x} y={ty} textAnchor="middle" fontSize={11} fontWeight="800" fill="#ffffff" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke fill">{txt}</text>
        <text x={x} y={ty} textAnchor="middle" fontSize={11} fontWeight="800" fill={textColor}>{txt}</text>
      </g>
    );
  }

  // (예전 방식) 값 목록이 없을 때
  const total = props.totalPoints || (props.points ? props.points.length : 1);
  // 1. 포인트가 매우 많을 경우 (예: 25개 초과) 가독성을 위해 띄엄띄엄 스킵
  // 첫 포인트, 마지막 포인트, 그리고 일정 주기마다 노출
  if (total > 35) {
    const step = total > 50 ? 4 : 2;
    if (index !== 0 && index !== total - 1 && index % step !== 0) {
      return null;
    }
  } else if (total > 18) {
    const step = 2;
    if (index !== 0 && index !== total - 1 && index % step !== 0) {
      return null;
    }
  }

  // 2. 인접 포인트와의 충돌 감지 (Y축 높이가 비슷하거나 X축 거리가 좁은 경우)
  // 짝수/홀수 인덱스에 따라 화살표 callout 높이를 지그재그(stagger) 배치하여 절대 겹치지 않게 함
  const isStagger = total > 8;
  const isUp = isStagger ? (index % 2 === 0) : true;
  
  // y 위치에 따라 위 공간이 부족할 경우 아래로 뒤집기
  const flipToBottom = y < 35;
  const placeAbove = flipToBottom ? false : isUp;

  // 화살표 지시선 길이 및 텍스트 위치 계산
  const offsetDistance = isStagger 
    ? (index % 4 === 0 ? 24 : index % 4 === 2 ? 34 : 20)
    : 14;

  const targetY = placeAbove ? y - offsetDistance : y + offsetDistance;
  const textY = placeAbove ? targetY - 4 : targetY + 12;

  // 짧은 화살표 지시선: 시작점 (x, y +- 4) -> 끝점 (x, targetY)
  const lineStartY = placeAbove ? y - 4 : y + 4;
  const showArrow = offsetDistance > 18;

  const displayVal = typeof value === 'number' ? `${value}${unit}` : `${value}`;

  return (
    <g className={className}>
      {/* 겹침 방지 화살표 지시선 (Callout pointer) */}
      {showArrow && (
        <g opacity={0.85}>
          {/* 유도선 */}
          <line
            x1={x}
            y1={lineStartY}
            x2={x}
            y2={targetY}
            stroke={strokeColor}
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
          {/* 점 끝 앵커 포인트 */}
          <circle
            cx={x}
            cy={targetY}
            r={1.5}
            fill={strokeColor}
          />
        </g>
      )}

      {/* 텍스트 배경 그림자 및 하이라이트 (선명한 가독성) */}
      <text
        x={x}
        y={textY}
        textAnchor="middle"
        fontSize={11}
        fontWeight="800"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke fill"
      >
        {displayVal}
      </text>

      {/* 실제 라벨 텍스트 */}
      <text
        x={x}
        y={textY}
        textAnchor="middle"
        fontSize={11}
        fontWeight="800"
        fill={textColor}
      >
        {displayVal}
      </text>
    </g>
  );
};
