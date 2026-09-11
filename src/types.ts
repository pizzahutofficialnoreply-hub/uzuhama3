export interface DailyStat {
  day: string;
  count: number;
  probability: number; // overall percentage (0-100)
  firstChoiceTime: string;
  firstChoiceShare: number;
  secondChoiceTime: string;
  finalProbability: number;
}

export interface TimeStat {
  time: string;
  label: string;
  count: number;
  probability: number;
  description: string;
}

export interface DurationStat {
  label: string;
  count: number;
  probability: number;
  description: string;
}

export interface MonthlyStat {
  month: string;
  days: number;
  totalDays: number;
  attendanceRate: number;
}

export interface LinkItem {
  title: string;
  url: string;
  category?: string;
  categories?: string[];
}

export interface GameItem {
  name: string;
  link: string;
  category?: string;
}

export interface BroadcastLog {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime?: string;
  game: string; // Legacy fallback
  games?: GameItem[];
  category: string;
  vods: LinkItem[];
  edited: LinkItem[];
  shorts: LinkItem[];
  durationHours: number;
  isAbsence?: boolean;
  absenceReasons?: string[];
}

export interface PatternGuide {
  id: string;
  title: string;
  content: string;
}

export interface NoticeLink {
  title?: string;
  url: string;
}

export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: 'big' | 'small' | 'none';
  date: string;
  active: boolean;
  linkUrl?: string;
  linkText?: string;
  links?: NoticeLink[];
}

export interface TermsRevision {
  version: number;
  type: 'normal' | 'important'; // 'normal': 7일 후 적용(단순 팝업/거부권 안내), 'important': 최소 30일 후 적용(체크박스 동의 필수)
  noticeDate: string; // 공지 등록일 (YYYY-MM-DD)
  effectiveDate: string; // 시행일자 (YYYY-MM-DD)
  title: string;
  target?: 'all' | 'terms' | 'privacy';
  changesSummary: string; // 무엇이 어떻게 바뀌었는지 (직전 버전 대비 변경 사항 요약)
  objectionGuide?: string; // 이의 제기 방법 및 거부권 안내
  previousTerms?: string;
  newTerms?: string;
  previousPrivacy?: string;
  newPrivacy?: string;
}

export interface SystemConfig {
  maintenance: boolean;
  noticeType: 'none' | 'big' | 'small';
  noticeContent: string;
  absenceReason?: string;
  customAbsenceReason?: string;
  absenceDuration?: string;
  adminEmail?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  noticeList?: NoticeItem[];
  termsOfService?: string;
  privacyPolicy?: string;
  travelStart?: string;
  travelEnd?: string;
  recentVideoUploadDate?: string; // 장기 휴방 중 영상 업로드일 (확률 가산점 반영)
  appVersion?: string;
  termsVersion?: number;
  termsRevision?: TermsRevision;
  termsHistory?: TermsRevision[];
  showLegacyCategoryAnalysis?: boolean; // ~2025 과거 데이터 카테고리 분석 표시 여부 (기본 true/토글 가능)
  absenceReasonOptions?: string[];
  archiveSourceUrl?: string;
}

export interface AppData {
  logs: Record<string, BroadcastLog>;
  dailyStats: Record<string, DailyStat>;
  timeStats: Record<string, TimeStat>;
  durationStats: Record<string, DurationStat>;
  monthlyStats: Record<string, MonthlyStat>;
  patternGuides: Record<string, PatternGuide>;
  videoStats?: Record<string, { score: number, count: number }>;
  system?: SystemConfig;
}

export interface SuggestionItem {
  id: string;
  content: string;
  createdAt?: any;
  sessionId?: string;
}

export interface ContributionItem {
  id: string;
  type: 'live' | 'video' | 'shorts';
  uid?: string;
  email?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  liveDate?: string;
  startTime?: string;
  endTime?: string;
  gameName?: string;
  gameLink?: string;
  gameCategory?: string;
  videoTitle?: string;
  videoLink?: string;
  linkedLogIds?: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  agreedTermsVersion: number;
  createdAt: any;
}

export interface PushSubscriptionItem {
  id?: string;
  uid?: string | null;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  notifyLive: boolean;     // 뱅온 알림 수신 여부
  notifyAbsence: boolean;  // 휴방 알림 수신 여부
  notifyFeedback?: boolean; // 내 제보 결과 알림 수신 여부 (레거시)
  updatedAt: any;
}

