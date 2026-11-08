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
 * - 같은 값이 이어지면 그 첫 점만
 * - 오르다 내리거나 내리다 오르는 꺾이는 점(봉우리·골짜기)
 * - 처음·끝 점
 * - 이름표끼리 너무 붙으면(minGap 칸 이내) 큰 변화 쪽만 남김
 */
export function pickTrendLabels(values: number[], minGap = 1): Map<number, 'up' | 'down'> {
  const out = new Map<number, 'up' | 'down'>();
  const n = values.length;
  if (!n) return out;
  // 같은 값 묶음(run)으로
  const runs: { start: number; v: number }[] = [];
  values.forEach((v, i) => { if (!runs.length || runs[runs.length - 1].v !== v) runs.push({ start: i, v }); });
  const cand: { i: number; dir: 'up' | 'down'; w: number }[] = [];
  const hi = Math.max(...values);
  runs.forEach((r, k) => {
    const prev = runs[k - 1]?.v;
    const next = runs[k + 1]?.v;
    const isPeak = (prev === undefined || r.v > prev) && (next === undefined || r.v > next);
    const isValley = (prev === undefined || r.v < prev) && (next === undefined || r.v < next);
    if (k === 0 || isPeak || isValley) {
      const w = Math.abs(r.v - (prev ?? r.v)) + Math.abs(r.v - (next ?? r.v)) + (k === 0 ? 0.5 : 0) + (r.v === hi ? 4 : 0);
      cand.push({ i: r.start, dir: isValley && !isPeak ? 'down' : 'up', w });
    }
  });
  // 마지막 점 (같은 값이 이어지는 중이어도 지금 값은 보여 줌)
  if (!cand.some((c) => c.i === n - 1) && runs[runs.length - 1].start !== n - 1) cand.push({ i: n - 1, dir: 'up', w: 0.4 });
  // 가까운 것끼리는 변화가 큰 쪽만
  const kept: typeof cand = [];
  [...cand].sort((a, b) => b.w - a.w).forEach((c) => { if (kept.every((k) => Math.abs(k.i - c.i) >= minGap)) kept.push(c); });
  kept.forEach((c) => out.set(c.i, c.dir));
  return out;
}

const pickCache = new Map<string, Map<number, 'up' | 'down'>>();

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
    // 이름표가 그래프 하나에 14개 안팎이 되게 (서로 안 겹치게)
    const minGap = Math.max(1, Math.ceil(values.length / 14));
    const key = `${minGap}|${values.join(',')}`;
    let picks = pickCache.get(key);
    if (!picks) {
      picks = pickTrendLabels(values, minGap);
      if (pickCache.size > 30) pickCache.clear();
      pickCache.set(key, picks);
    }
    const dir = picks.get(index);
    if (!dir) return null;
    // 골짜기는 아래에, 단 맨 아래 값이면 축 글씨와 겹치니 위로
    const down = dir === 'down' && Number(value) > Math.min(...values);
    const lead = 12;
    const ty = down ? y + lead + 12 : y - lead - 4;
    const txt = typeof value === 'number' ? `${value}${unit}` : `${value}`;
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
