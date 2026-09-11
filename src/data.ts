import { DailyStat, BroadcastLog, TimeStat, DurationStat, MonthlyStat } from './types';

// Total 116 broadcasts analysis
export const dailyStats: DailyStat[] = [
  { day: '월', count: 18, probability: 15.5, firstChoiceTime: '20:00', firstChoiceShare: 27.8, secondChoiceTime: '17:00', finalProbability: 15.2 },
  { day: '화', count: 19, probability: 16.4, firstChoiceTime: '20:00', firstChoiceShare: 36.8, secondChoiceTime: '22:00', finalProbability: 21.2 },
  { day: '수', count: 20, probability: 17.2, firstChoiceTime: '19:00', firstChoiceShare: 25.0, secondChoiceTime: '20:00', finalProbability: 15.2 },
  { day: '목', count: 22, probability: 19.0, firstChoiceTime: '22:00', firstChoiceShare: 27.3, secondChoiceTime: '20:00', finalProbability: 18.2 },
  { day: '금', count: 6, probability: 5.2, firstChoiceTime: '16:00', firstChoiceShare: 33.3, secondChoiceTime: '없음', finalProbability: 6.1 },
  { day: '토', count: 14, probability: 12.1, firstChoiceTime: '18:00', firstChoiceShare: 28.6, secondChoiceTime: '16:00', finalProbability: 12.1 },
  { day: '일', count: 17, probability: 14.7, firstChoiceTime: '20:00', firstChoiceShare: 23.5, secondChoiceTime: '21:00', finalProbability: 12.1 },
];

export const timeStats: TimeStat[] = [
  { time: '20:00', label: '저녁 8시대', count: 26, probability: 22.4, description: '가장 선호하는 정규 시작 시간대' },
  { time: '22:00', label: '밤 10시대', count: 19, probability: 16.4, description: '늦은 밤 방송 시작' },
  { time: '21:00', label: '밤 9시대', count: 17, probability: 14.7, description: '메인 프라임타임' },
  { time: '19:00', label: '저녁 7시대', count: 16, probability: 13.8, description: '이른 저녁 시작' },
  { time: '16:00', label: '오후 4~5시대', count: 16, probability: 13.8, description: '주말 및 간헐적 낮 방송' },
  { time: '18:00', label: '저녁 6시대', count: 12, probability: 10.3, description: '초저녁 시작' },
  { time: '13:00', label: '오후 1~3시대', count: 6, probability: 5.2, description: '게릴라 낮 방송' },
  { time: '23:00', label: '밤 11시대', count: 4, probability: 3.4, description: '심야 방송' },
];

export const durationStats: DurationStat[] = [
  { label: '2시간 대 (2h~2h 59m)', count: 68, probability: 58.6, description: '기본 정규 방송 패턴' },
  { label: '1시간 대 (1h~1h 59m)', count: 38, probability: 32.8, description: '짧고 굵게 진행한 방송' },
  { label: '3시간 대 (3h~3h 59m)', count: 7, probability: 6.0, description: '몰입도 높은 대작/합방' },
  { label: '4시간 이상', count: 3, probability: 2.6, description: '최장: 2/19 (6시간 19분)' },
];

export const monthlyStats: MonthlyStat[] = [
  { month: '1월', days: 18, totalDays: 31, attendanceRate: 58.1 },
  { month: '2월', days: 15, totalDays: 28, attendanceRate: 53.6 },
  { month: '3월', days: 16, totalDays: 31, attendanceRate: 51.6 },
  { month: '4월', days: 12, totalDays: 30, attendanceRate: 40.0 },
  { month: '5월', days: 15, totalDays: 31, attendanceRate: 48.4 },
  { month: '6월', days: 14, totalDays: 30, attendanceRate: 46.7 },
  { month: '7월', days: 18, totalDays: 31, attendanceRate: 58.1 },
  { month: '8월', days: 8, totalDays: 18, attendanceRate: 44.4 },
];

export const patternGuides = [
  {
    id: 'guide-1',
    title: '가장 확실한 방송 요일과 시간',
    content: '시청자 입장에서 가장 방송을 기다려볼 만한 확실한 타이밍은 **화요일 오후 8시**와 **목요일 오후 10시**입니다. 주중(화, 수, 목)에 방송 빈도가 압도적으로 높으며, 목요일은 3주 중 2주는 무조건 방송을 켜는 **최고 유력 요일**입니다. 반대로 **금요일은 80% 이상의 확률로 쉬는 날**이므로, 목요일 방송 종료 후 금요일은 마음 편히 쉬셔도 좋습니다.\n\n(참고: 모든 시간은 기본적으로 **오후(PM)**를 기준으로 합니다. 8시는 오후 8시, 10시는 오후 10시를 의미합니다.)',
  },
  {
    id: 'guide-2',
    title: '주말은 평소보다 일찍 켠다',
    content: '평일 방송은 주로 오후 8시~오후 10시 사이에 집중되지만, **토요일과 일요일은 오후 4시~오후 6시** 사이로 시작 시간이 앞당겨지는 경향이 매우 강합니다. 주말에 알림이 울린다면 초저녁일 확률이 높습니다.',
  },
  {
    id: 'guide-3',
    title: '연속 방송과 휴방 예측 공식',
    content: '가장 지배적인 방송 패턴은 **하루 방송 후 하루 휴방(퐁당퐁당)**이거나 **이틀 연속 방송 후 하루 휴방**입니다.\n\n- **오늘 방송을 봤다면:** 내일은 쉴 확률이 절반 이상입니다.\n- **어제와 오늘 이틀 연속 방송을 봤다면:** 내일은 무조건 쉰다고 예측하는 것이 맞습니다. (3일 이상 연속 방송은 특정 게임에 꽂힌 시즌이 아니면 거의 나오지 않습니다.)\n- **오늘 방송이 3시간을 넘겼다면:** 체력 소모로 인해 다음 날은 80% 확률로 휴방입니다. 방송을 길게 한 다음 날은 기다리지 않으셔도 좋습니다.',
  }
];

export const mockLogs: BroadcastLog[] = [];
