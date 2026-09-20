import { useState, useEffect, useRef, useLayoutEffect } from 'react';

export function DottedBarCursor(props: any) {
  const gRef = useRef<SVGGElement>(null);
  const { x, y, width, height, stroke = '#a1a1aa', payload, payloadIndex } = props || {};
  const [coords, setCoords] = useState<{ centerX: number; dotY: number } | null>(null);

  const topY = props.top !== undefined ? props.top : (y !== undefined ? y : 0);
  const bottomY = topY + (height || 0);

  useLayoutEffect(() => {
    if (!gRef.current || x === undefined || width === undefined) return;
    const svg = gRef.current.ownerSVGElement || gRef.current.closest('svg');
    if (!svg) return;

    let targetCenterX = x + width / 2;
    let targetDotY: number | null = null;

    // 1. Recharts가 활성화된 막대에 지정하는 클래스 (.recharts-active-bar)
    const activeBar = svg.querySelector('.recharts-active-bar') as SVGGraphicsElement | null;
    if (activeBar && typeof activeBar.getBBox === 'function') {
      try {
        const bbox = activeBar.getBBox();
        if (bbox && bbox.width > 0 && !isNaN(bbox.y)) {
          targetCenterX = bbox.x + bbox.width / 2;
          targetDotY = bbox.y;
        }
      } catch {}
    }

    // 2. 만약 activeBar를 찾지 못했거나 타이밍 차이일 경우, 현재 x 슬롯과 일치하는 막대 탐색
    if (targetDotY === null) {
      const bars = svg.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect, .recharts-rectangle');
      let minDiff = Infinity;
      let matchedBar: SVGGraphicsElement | null = null;

      bars.forEach((b) => {
        const el = b as SVGGraphicsElement;
        if (typeof el.getBBox === 'function') {
          try {
            const bbox = el.getBBox();
            const bCenter = bbox.x + bbox.width / 2;
            const diff = Math.abs(bCenter - (x + width / 2));
            if (diff < minDiff && diff < width / 2 + 8) {
              minDiff = diff;
              matchedBar = el;
            }
          } catch {}
        }
      });

      if (matchedBar) {
        try {
          const bbox = (matchedBar as SVGGraphicsElement).getBBox();
          if (bbox && !isNaN(bbox.y)) {
            targetCenterX = bbox.x + bbox.width / 2;
            targetDotY = bbox.y;
          }
        } catch {}
      }
    }

    if (targetDotY !== null) {
      setCoords({ centerX: targetCenterX, dotY: targetDotY });
    }
  }, [x, y, width, height, payloadIndex, payload]);

  if (x === undefined || width === undefined || height === undefined) return null;

  const isCoordValidForCurrentSlot = coords && Math.abs(coords.centerX - (x + width / 2)) <= (width / 2 + 8);
  const centerX = isCoordValidForCurrentSlot ? coords.centerX : (x + width / 2);
  const dotY = isCoordValidForCurrentSlot ? coords.dotY : (topY + height * 0.35);
  const dotColor = payload?.[0]?.color || payload?.[0]?.fill || '#a855f7';

  return (
    <g ref={gRef} className="recharts-custom-bar-cursor pointer-events-none">
      {/* 꺾은선 그래프와 동일한 수직 점선 (막대그래프 가운데 정렬) */}
      <line
        x1={centerX}
        y1={topY}
        x2={centerX}
        y2={bottomY}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="3 3"
        strokeOpacity={0.85}
      />
      {/* 막대그래프 상단 끝(apex)에 정확히 맞춘 점 */}
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
}

export function CustomTooltip({ active, payload, label, formatter }: any) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<any>(null);
  const currentKeyRef = useRef<string>('');

  const dataKey = (active && payload && payload.length)
    ? `${label || ''}_${payload.map((p: any) => `${p.dataKey || p.name}:${p.value}`).join('|')}`
    : '';

  useEffect(() => {
    if (active && payload && payload.length) {
      // 새로운 데이터 포인트에 도달했을 때만 새로 타이머 가동
      if (currentKeyRef.current !== dataKey) {
        currentKeyRef.current = dataKey;
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 2200);
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
      <div className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 shadow-xl pointer-events-none transition-opacity duration-300">
        <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">{label}</p>
        {payload.map((p: any, i: number) => {
          const value = formatter ? formatter(p.value as number, p.name as string, p, i, payload) : p.value;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
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
