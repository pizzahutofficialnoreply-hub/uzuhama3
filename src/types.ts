export type Tab = 'summary' | 'calendar' | 'detailed' | 'recommend';

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

export interface GameGroup {
  groupName: string;
  gameNames: string[];
}

export interface LinkItem {
  title: string;
  url: string;
  category?: string;
  categories?: string[];
  isCompilation?: boolean;
  compilationId?: string;
  allBroadcastDates?: string[];
  games?: GameItem[];
  gameSortOrder?: 'latest' | 'oldest' | 'custom';
  gameGroups?: GameGroup[];
  createdAt?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  options: PollOption[];
  isActive: boolean;
  allowMultiple?: boolean;
  hideResultsBeforeVote?: boolean;
  createdAt?: string;
  updatedAt?: string;
  startDate?: string;
  endDate?: string;
  totalVotes?: number;
  voterCount?: number;
}

export interface CompilationSelectedLog {
  logId: string;
  date: string;
  games: string[];
}

export interface CompilationVideo {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  broadcasts: CompilationSelectedLog[];
  gameSortOrder?: 'latest' | 'oldest' | 'custom';
  gameGroups?: GameGroup[];
}

export interface GameItem {
  name: string;
  link: string;
  category?: string;
  vodUrl?: string;
  date?: string;
}

export interface DateOverride {
  date: string; // YYYY-MM-DD (방송일 기준, 오전 6시 전은 전날)
  type: 'on' | 'off'; // on: 방송 예정일, off: 휴방일
  time?: string; // HH:MM (예정 시각, 선택)
  note?: string; // 공지 문구 (선택)
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
  illnessName?: string;
  illnessInfo?: {
    name: string;
    summary: string;
    source?: string;
    sourceUrl?: string;
  };
  youtubeUrl?: string;
  chzzkUrl?: string;
}

export interface PatternGuide {
  id: string;
  title: string;
  content: string;
  illnessName?: string;
  illnessSummary?: string;
  illnessSource?: string;
  illnessSourceUrl?: string;
}

export interface NoticeLink {
  title?: string;
  url: string;
}

export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: 'big' | 'small' | 'both' | 'none';
  prefix?: string; // 띠 공지 앞머리 태그 커스텀 (예: [공지], [안내], [업데이트], [이벤트])
  date: string;
  active: boolean;
  linkUrl?: string;
  linkText?: string;
  links?: NoticeLink[];
  dismissMode?: 'session' | 'permanent'; // 'session': 영구 표시 (X눌러 닫아도 새로고침/PWA 재진입 시 다시 표시), 'permanent': 일회성 표시 (한번 X누르면 계속 숨김)
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
  maintenanceTitle?: string;
  maintenanceContent?: string;
  noticeType: 'none' | 'big' | 'small' | 'both';
  noticeTitle?: string;
  noticeContent: string;
  defaultNoticePrefix?: string; // 띠 공지 기본 앞머리 태그 (기본값: [공지])
  absenceReason?: string;
  customAbsenceReason?: string;
  isLongAbsence?: boolean; // 장기 휴방 모드 활성화 여부
  illnessName?: string;
  illnessSummary?: string;
  illnessSource?: string;
  illnessSourceUrl?: string;
  diseaseName?: string;
  diseaseSummary?: string;
  diseaseSource?: string;
  diseaseSourceUrl?: string;
  absenceDuration?: string;
  adminEmail?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  maintenanceLinkUrl?: string;
  maintenanceLinkText?: string;
  maintenanceLinks?: NoticeLink[];
  maintenanceHistory?: Array<{ time: string; event: string }>;
  maintenanceStatusText?: string;
  maintenanceNote?: string;
  maintenanceScope?: string; // 영향 범위 (기본값: 사이트 전체)
  maintenanceImpact?: string; // 서비스 영향도 설명 (기본값: 점검 시간 동안 서비스에 접속 불가합니다.)
  maintenanceNoticeGuide?: string; // 점검 안내 상세 (기본값: 점검 완료 및 변경사항 발생 시 본 공지에 업데이트하겠습니다.)
  maintenanceDurationNote?: string; // 소요 시간 보충 설명 (기본값: (상황에 따라 변동/연장될 수 있습니다))
  maintenanceChanges?: string[];
  recurringMaintenance?: {
    enabled: boolean;
    intervalWeeks: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    autoApply: boolean;
    /** 격주 등 반복 기준이 되는 날짜 (이 날짜가 속한 주부터 셈) */
    anchorDate?: string;
  };
  lastCompletedNoticeDismissAt?: string;
  noticeDismissMode?: 'session' | 'permanent';
  noticeList?: NoticeItem[];
  termsOfService?: string;
  privacyPolicy?: string;
  preface?: string; // 일러두기 (설정의 정보 탭 및 사용자 가이드)
  prefaceTitle?: string;
  travelStart?: string;
  travelEnd?: string;
  /** 관리자가 지정한 날짜별 예외 (공지로 '0월 0일 방송/휴방' 을 알렸을 때). 그날 확률만 바뀜 */
  dateOverrides?: DateOverride[];
  recentVideoUploadDate?: string; // 장기 휴방 중 영상 업로드일 (확률 가산점 반영)
  videoUploadSourceDesc?: string; // 업로드된 영상 설명
  appVersion?: string;
  termsVersion?: number;
  termsRevision?: TermsRevision;
  termsHistory?: TermsRevision[];
  onboardingEnabled?: boolean; // 처음 시작 화면(환영·약관·안내) 표시 여부 (기본 true)
  onboardingVersion?: number; // 올리면 모든 사람에게 처음 시작 화면이 다시 보임
  /** 약관 변경 안내: 이 버전으로 올렸을 때 이미 본 사람에게는 처음 화면 전체 대신 '약관이 바뀌었어요' 한 장만 보여 줌 */
  termsUpdate?: { version: number; summary: string; noticeDate: string; effectiveDate: string };
  tutorialEnabled?: boolean; // 처음 방문자 사이트 둘러보기 표시 여부 (기본 true, 관리자가 전체 차단 가능)
  showLegacyCategoryAnalysis?: boolean; // ~2025 과거 데이터 카테고리 분석 표시 여부 (기본 true/토글 가능)
  absenceReasonOptions?: string[];
  archiveSourceUrl?: string;
  activePoll?: Poll | null;
  compilations?: CompilationVideo[];
  feedbackTabs?: string[];
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
  polls?: Poll[];
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

export interface SavedDraft {
  id: string;
  savedAt: number;
  savedAtFormatted: string;
  summary: string;
  type: 'live' | 'video' | 'shorts';
  data: any;
}

export type PatchCategory = 'patch' | 'hotfix' | 'update' | 'dev';

export interface PatchNote {
  id: string;
  version: string; // e.g., '0.0.1', '1.0.0'
  title: string;
  category: PatchCategory; // 'patch' (패치노트), 'hotfix' (핫픽스 노트), 'update' (업데이트 공지), 'dev' (개발자 노트)
  date: string; // YYYY-MM-DD
  content: string; // Markdown or formatted text
  highlights?: string[];
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}

