export interface HeatmapColorStyle {
  level: number;
  label: string;
  lightBg: string;
  lightBorder: string;
  darkBg: string;
  darkBorder: string;
}

export const HEATMAP_LEVEL_COLORS: Record<number, HeatmapColorStyle> = {
  0: {
    level: 0,
    label: '휴방',
    lightBg: '#f4f4f5',
    lightBorder: '#e4e4e7',
    darkBg: '#1f1f23',
    darkBorder: '#2e2e33'
  },
  1: {
    level: 1,
    label: '~20분',
    lightBg: '#f5f3ff',
    lightBorder: '#ede9fe',
    darkBg: '#1e1635',
    darkBorder: '#2d1f4d'
  },
  2: {
    level: 2,
    label: '~40분',
    lightBg: '#ede9fe',
    lightBorder: '#ddd6fe',
    darkBg: '#2a1a4a',
    darkBorder: '#3b2566'
  },
  3: {
    level: 3,
    label: '~1시간',
    lightBg: '#e0e7ff',
    lightBorder: '#c7d2fe',
    darkBg: '#281c5a',
    darkBorder: '#39287a'
  },
  4: {
    level: 4,
    label: '~1시간 20분',
    lightBg: '#ddd6fe',
    lightBorder: '#c4b5fd',
    darkBg: '#341f6e',
    darkBorder: '#482a94'
  },
  5: {
    level: 5,
    label: '~1시간 40분',
    lightBg: '#c7d2fe',
    lightBorder: '#a5b4fc',
    darkBg: '#3f2284',
    darkBorder: '#562fb0'
  },
  6: {
    level: 6,
    label: '~2시간',
    lightBg: '#c4b5fd',
    lightBorder: '#a78bfa',
    darkBg: '#4c269c',
    darkBorder: '#6533cd'
  },
  7: {
    level: 7,
    label: '~2시간 20분',
    lightBg: '#a78bfa',
    lightBorder: '#8b5cf6',
    darkBg: '#592cb8',
    darkBorder: '#7339eb'
  },
  8: {
    level: 8,
    label: '~2시간 40분',
    lightBg: '#93c5fd',
    lightBorder: '#60a5fa',
    darkBg: '#6432cd',
    darkBorder: '#8045fb'
  },
  9: {
    level: 9,
    label: '~3시간',
    lightBg: '#8b5cf6',
    lightBorder: '#7c3aed',
    darkBg: '#7038e2',
    darkBorder: '#8c4ffb'
  },
  10: {
    level: 10,
    label: '~3시간 20분',
    lightBg: '#a855f7',
    lightBorder: '#9333ea',
    darkBg: '#7e40f0',
    darkBorder: '#995dfd'
  },
  11: {
    level: 11,
    label: '~3시간 40분',
    lightBg: '#c084fc',
    lightBorder: '#a855f7',
    darkBg: '#8d4bf8',
    darkBorder: '#aa73fe'
  },
  12: {
    level: 12,
    label: '~4시간',
    lightBg: '#7c3aed',
    lightBorder: '#6d28d9',
    darkBg: '#9b5bfb',
    darkBorder: '#b988fe'
  },
  13: {
    level: 13,
    label: '~4시간 20분',
    lightBg: '#9333ea',
    lightBorder: '#7e22ce',
    darkBg: '#a96bfd',
    darkBorder: '#c79efe'
  },
  14: {
    level: 14,
    label: '~4시간 40분',
    lightBg: '#6d28d9',
    lightBorder: '#5b21b6',
    darkBg: '#b982fe',
    darkBorder: '#d6b3fe'
  },
  15: {
    level: 15,
    label: '~5시간',
    lightBg: '#581c87',
    lightBorder: '#3b0764',
    darkBg: '#ca9dfd',
    darkBorder: '#e5cffe'
  },
  16: {
    level: 16,
    label: '5시간 이상',
    lightBg: '#3b0764',
    lightBorder: '#2e1065',
    darkBg: '#e0c0fe',
    darkBorder: '#ffffff'
  }
};

/**
 * 방송 시간(시간 단위) 및 방송 유무에 따라 20분 단위 레벨(0~16)을 계산합니다.
 * - 0: 방송 없음 (휴방)
 * - 1~15: 20분 단위 구간 (1~20분, 21~40분, ... , 4시간 40분~5시간)
 * - 16: 5시간 이상
 */
export function getBroadcastHeatmapLevel(durationHours: number, hasBroadcast: boolean): number {
  if (!hasBroadcast) return 0;
  if (durationHours <= 0) return 1;
  const minutes = Math.round(durationHours * 60);
  const lvl = Math.ceil(minutes / 20);
  return Math.min(16, Math.max(1, lvl));
}
