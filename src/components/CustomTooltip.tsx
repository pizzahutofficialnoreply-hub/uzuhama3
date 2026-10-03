import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export function DottedBarCursor(props: any) {
  const gRef = useRef<SVGGElement>(null);
  const { x, y, width, height, payload, payloadIndex } = props || {};
  const [coords, setCoords] = useState<{ dotY: number } | null>(null);

  const topY = props.top !== undefined ? props.top : (y !== undefined ? y : 0);
  const bottomY = topY + (height || 0);
  const strokeColor = (props?.stroke && props.stroke !== 'none') ? props.stroke : '#a1a1aa';

  // 막대 색상에 맞춘 점 색상 추출 (SummaryTab은 #3b82f6, DetailedStatsTab은 막대 개별 색상)
  const dotColor = payload?.[0]?.color || payload?.[0]?.fill || payload?.[0]?.payload?.fill || '#3b82f6';

  // 막대그래프의 단일 막대는 항상 카테고리 슬롯(x ~ x+width)의 정중앙에 위치하므로
  // 가로 정렬(centerX)은 항상 슬롯의 정중앙으로 고정하여 흔들림이나 오차 없이 막대 가로 가운데에 일치시킵니다.
  const centerX = (x !== undefined && width !== undefined) ? (x + width / 2) : 0;

  useLayoutEffect(() => {
    if (!gRef.current || x === undefined || width === undefined) return;
    const svg = gRef.current.ownerSVGElement || gRef.current.closest('svg');
    if (!svg) return;

    let targetDotY: number | null = null;

    // 1. Recharts에서 렌더링된 막대 요소들 검색하여 상단 끝(apex, y좌표) 탐색
    const barElements = svg.querySelectorAll('.recharts-bar-rectangles path, .recharts-bar-rectangles rect, .recharts-bar-rectangle path, .recharts-bar-rectangle rect');
    
    if (payloadIndex !== undefined && payloadIndex >= 0 && barElements[payloadIndex]) {
      const el = barElements[payloadIndex] as SVGGraphicsElement;
      try {
        if (typeof el.getBBox === 'function') {
          const bbox = el.getBBox();
          if (bbox && !isNaN(bbox.y)) {
            targetDotY = bbox.y;
          }
        }
      } catch {}

      if (targetDotY === null) {
        const d = el.getAttribute('d');
        if (d) {
          const m = d.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/);
          if (m) {
            targetDotY = parseFloat(m[2]);
          }
        } else {
          const barY = parseFloat(el.getAttribute('y') || '0');
          if (barY) targetDotY = barY;
        }
      }
    }

    // 2. 만약 인덱스로 찾지 못했을 경우 x축 슬롯 중심과 가장 가까운 막대 검색
    if (targetDotY === null) {
      let minDiff = Infinity;
      barElements.forEach((b) => {
        const el = b as SVGGraphicsElement;
        try {
          if (typeof el.getBBox === 'function') {
            const bbox = el.getBBox();
            if (bbox && !isNaN(bbox.y)) {
              const bCenter = bbox.x + bbox.width / 2;
              const diff = Math.abs(bCenter - centerX);
              if (diff < minDiff && diff < (width || 0) / 2 + 14) {
                minDiff = diff;
                targetDotY = bbox.y;
              }
            }
          }
        } catch {}
      });
    }

    if (targetDotY !== null) {
      setCoords({ dotY: targetDotY });
    }
  }, [x, y, width, height, payloadIndex, payload, centerX]);

  if (x === undefined || width === undefined || height === undefined) return null;

  // 점의 Y 좌표 (상단 apex)
  const dotY = coords?.dotY ?? (topY + height * 0.4);

  const svg = gRef.current?.ownerSVGElement || gRef.current?.closest('svg');

  const cursorContent = (
    <g className="recharts-custom-bar-cursor pointer-events-none" style={{ pointerEvents: 'none' }}>
      {/* 꺾은선 그래프와 동일한 수직 점선 (막대 가로 정중앙) */}
      <line
        x1={centerX}
        y1={topY}
        x2={centerX}
        y2={bottomY}
        stroke={strokeColor}
        strokeWidth={1}
        strokeDasharray="3 3"
        strokeOpacity={0.85}
      />
      {/* 막대 상단 끝(apex)에 정확히 맞춘 점선 끝 점 (막대 가로 정중앙 centerX) */}
      <circle
        cx={centerX}
        cy={dotY}
        r={7}
        fill={dotColor}
        fillOpacity={0.25}
      />
      <circle
        cx={centerX}
        cy={dotY}
        r={4.5}
        fill={dotColor}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </g>
  );

  return (
    <g ref={gRef} className="recharts-custom-bar-anchor pointer-events-none">
      {svg ? createPortal(cursorContent, svg) : cursorContent}
    </g>
  );
}

export function CustomTooltip({ active, payload, label, formatter, coordinate }: any) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<any>(null);
  const currentKeyRef = useRef<string>('');

  const dataKey = (active && payload && payload.length)
    ? `${label || ''}_${payload.map((p: any) => `${p.dataKey || p.name}:${p.value}`).join('|')}`
    : '';

  useEffect(() => {
    if (active && payload && payload.length) {
      if (currentKeyRef.current !== dataKey) {
        currentKeyRef.current = dataKey;
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        // 모든 그래프 툴팁은 1.8초 후 자동으로 부드럽게 사라짐
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 1800);
      }
    } else {
      if (currentKeyRef.current !== '') {
        currentKeyRef.current = '';
        setVisible(false);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [active, dataKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (visible && active && payload && payload.length) {
    return (
      <div 
        style={{ zIndex: 30 }}
        className="relative -translate-y-8 -translate-x-1/2 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 rounded-xl p-2.5 sm:p-3 shadow-xl pointer-events-none transition-all duration-200"
      >
        <p className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 mb-0.5">{label}</p>
        {payload.map((p: any, i: number) => {
          const value = formatter ? formatter(p.value as number, p.name as string, p, i, payload) : p.value;
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }}></span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                {Array.isArray(value) ? value[0] : value}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}
