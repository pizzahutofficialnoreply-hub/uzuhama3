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
export const SmartTrendLabel: React.FC<SmartTrendLabelProps> = (props) => {
  const {
    x,
    y,
    value,
    index = 0,
    strokeColor = '#a855f7',
    textColor = '#7e22ce',
    className = 'chart-capture-only-label',
    unit = '회'
  } = props;

  if (x === undefined || y === undefined || value === undefined || value === null) {
    return null;
  }

  // 전체 포인트 수 판별 (points prop 또는 부모 컨텍스트)
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
