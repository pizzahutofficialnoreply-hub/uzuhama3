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
    lightBg: '#f2f5fa',
    lightBorder: '#e5eaf5',
    darkBg: '#1c2333',
    darkBorder: '#222b3f'
  },
  2: {
    level: 2,
    label: '~40분',
    lightBg: '#e5ebf5',
    lightBorder: '#d8e0f0',
    darkBg: '#222b3f',
    darkBorder: '#28334b'
  },
  3: {
    level: 3,
    label: '~1시간',
    lightBg: '#d9e1f0',
    lightBorder: '#cbd6eb',
    darkBg: '#27324a',
    darkBorder: '#2d3b57'
  },
  4: {
    level: 4,
    label: '~1시간 20분',
    lightBg: '#ccd7eb',
    lightBorder: '#b8c7e2',
    darkBg: '#2d3a56',
    darkBorder: '#374768'
  },
  5: {
    level: 5,
    label: '~1시간 40분',
    lightBg: '#b9c8e3',
    lightBorder: '#a5b8da',
    darkBg: '#374667',
    darkBorder: '#415378'
  },
  6: {
    level: 6,
    label: '~2시간',
    lightBg: '#a6b8da',
    lightBorder: '#93a9d2',
    darkBg: '#405377',
    darkBorder: '#4b6089'
  },
  7: {
    level: 7,
    label: '~2시간 20분',
    lightBg: '#93a9d2',
    lightBorder: '#89a1cc',
    darkBg: '#4a5f88',
    darkBorder: '#5a709c'
  },
  8: {
    level: 8,
    label: '~2시간 40분',
    lightBg: '#8aa1cc',
    lightBorder: '#8099c6',
    darkBg: '#59709b',
    darkBorder: '#6981af'
  },
  9: {
    level: 9,
    label: '~3시간',
    lightBg: '#8099c7',
    lightBorder: '#7690c0',
    darkBg: '#6880ae',
    darkBorder: '#7892c2'
  },
  10: {
    level: 10,
    label: '~3시간 20분',
    lightBg: '#7791c1',
    lightBorder: '#6780ad',
    darkBg: '#7791c1',
    darkBorder: '#8ca2cc'
  },
  11: {
    level: 11,
    label: '~3시간 40분',
    lightBg: '#6880ae',
    lightBorder: '#586f9a',
    darkBg: '#8ba2cb',
    darkBorder: '#a0b3d6'
  },
  12: {
    level: 12,
    label: '~4시간',
    lightBg: '#59709b',
    lightBorder: '#495e87',
    darkBg: '#9fb2d6',
    darkBorder: '#b4c4e0'
  },
  13: {
    level: 13,
    label: '~4시간 20분',
    lightBg: '#4a5f88',
    lightBorder: '#3c4d6f',
    darkBg: '#b3c3e0',
    darkBorder: '#c8d3e9'
  },
  14: {
    level: 14,
    label: '~4시간 40분',
    lightBg: '#3d4e70',
    lightBorder: '#2f3c57',
    darkBg: '#c7d3e8',
    darkBorder: '#dbe3f1'
  },
  15: {
    level: 15,
    label: '~5시간',
    lightBg: '#2f3d58',
    lightBorder: '#222c40',
    darkBg: '#dae2f1',
    darkBorder: '#eef2f9'
  },
  16: {
    level: 16,
    label: '5시간 이상',
    lightBg: '#222c40',
    lightBorder: '#222c40',
    darkBg: '#eef2f9',
    darkBorder: '#eef2f9'
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
