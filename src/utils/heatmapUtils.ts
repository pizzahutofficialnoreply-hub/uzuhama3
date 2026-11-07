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
    lightBg: '#f3f6fb',
    lightBorder: '#e6ecf6',
    darkBg: '#1b2232',
    darkBorder: '#212a3f'
  },
  2: {
    level: 2,
    label: '~40분',
    lightBg: '#e7edf6',
    lightBorder: '#dae3f1',
    darkBg: '#212a3e',
    darkBorder: '#27324b'
  },
  3: {
    level: 3,
    label: '~1시간',
    lightBg: '#dbe3f1',
    lightBorder: '#ced9ec',
    darkBg: '#26324b',
    darkBorder: '#2c3b58'
  },
  4: {
    level: 4,
    label: '~1시간 20분',
    lightBg: '#cfdaec',
    lightBorder: '#b8c8e2',
    darkBg: '#2c3a57',
    darkBorder: '#36476a'
  },
  5: {
    level: 5,
    label: '~1시간 40분',
    lightBg: '#b9c9e2',
    lightBorder: '#a3b6d8',
    darkBg: '#354669',
    darkBorder: '#3f537d'
  },
  6: {
    level: 6,
    label: '~2시간',
    lightBg: '#a4b7d9',
    lightBorder: '#8da5ce',
    darkBg: '#3f537c',
    darkBorder: '#49608f'
  },
  7: {
    level: 7,
    label: '~2시간 20분',
    lightBg: '#8ea6cf',
    lightBorder: '#7b94c1',
    darkBg: '#485f8e',
    darkBorder: '#5972a0'
  },
  8: {
    level: 8,
    label: '~2시간 40분',
    lightBg: '#7c95c2',
    lightBorder: '#6983b4',
    darkBg: '#58719f',
    darkBorder: '#6983b2'
  },
  9: {
    level: 9,
    label: '~3시간',
    lightBg: '#6a84b5',
    lightBorder: '#5772a7',
    darkBg: '#6982b1',
    darkBorder: '#7a95c3'
  },
  10: {
    level: 10,
    label: '~3시간 20분',
    lightBg: '#5873a8',
    lightBorder: '#4b628e',
    darkBg: '#7994c2',
    darkBorder: '#8ea5cd'
  },
  11: {
    level: 11,
    label: '~3시간 40분',
    lightBg: '#4b628f',
    lightBorder: '#3e5175',
    darkBg: '#8da4cd',
    darkBorder: '#a1b5d8'
  },
  12: {
    level: 12,
    label: '~4시간',
    lightBg: '#3f5277',
    lightBorder: '#32405d',
    darkBg: '#a0b5d7',
    darkBorder: '#b5c6e2'
  },
  13: {
    level: 13,
    label: '~4시간 20분',
    lightBg: '#32415e',
    lightBorder: '#2a364f',
    darkBg: '#b4c5e2',
    darkBorder: '#c8d5ea'
  },
  14: {
    level: 14,
    label: '~4시간 40분',
    lightBg: '#2a3750',
    lightBorder: '#222c41',
    darkBg: '#c7d4ea',
    darkBorder: '#dce4f2'
  },
  15: {
    level: 15,
    label: '~5시간',
    lightBg: '#222c41',
    lightBorder: '#1a2233',
    darkBg: '#dbe3f1',
    darkBorder: '#eef2f9'
  },
  16: {
    level: 16,
    label: '5시간 이상',
    lightBg: '#1a2233',
    lightBorder: '#1a2233',
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
