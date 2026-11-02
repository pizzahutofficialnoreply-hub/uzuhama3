/**
 * 앱 설치·알림·캘린더 안내에서 쓰는 기기 판별과 현재 상태 (가벼운 함수만, 화면 코드는 SetupGuides.tsx)
 */
export type DeviceKey =
  | 'ios-safari' | 'ios-safari-18' | 'ios-chrome' | 'ios-inapp'
  | 'android-chrome' | 'android-samsung' | 'android-inapp'
  | 'desktop-chrome' | 'desktop-safari' | 'desktop-other';

export type GuideKind = 'install' | 'notify' | 'calendar';

export const OPEN_SETUP_EVENT = 'uzuhama-open-setup';
export const CALENDAR_SUBSCRIBED_KEY = 'uzuhama_calendar_subscribed';
/** 안드로이드처럼 브라우저와 앱이 저장 공간을 같이 쓰는 기기에서, 설치 안내를 끝내고 앱으로 처음 열었을 때 알림 켜기를 이어서 보여 주기 위한 표시 */
export const AFTER_INSTALL_KEY = 'uzuhama_after_install_notify';

/** mode 'after-tour': 둘러보기가 끝난 뒤 '더 알아볼까요?' (아이폰은 앱 설치 안내부터) */
export type SetupMode = 'after-tour';
export const INSTALL_SEEN_KEY = 'uzuhama_install_guide_seen';
export function openSetupGuide(kind?: GuideKind, mode?: SetupMode) {
  window.dispatchEvent(new CustomEvent(OPEN_SETUP_EVENT, { detail: { kind, mode } }));
}
/** 아이폰을 사파리·크롬 탭으로 보고 있는지 (설치해야 알림을 받을 수 있는 상태) */
export function needsIOSInstall(): boolean {
  return isIOSDevice() && !isStandaloneMode();
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true || document.referrer.includes('android-app://');
}

/**
 * iOS 버전 (사파리는 iOS 26부터 주소창 글자의 OS 버전을 18로 고정해서, 사파리 버전 'Version/26' 을 우선 봄)
 */
export function iosVersion(): number | null {
  if (typeof navigator === 'undefined' || !isIOSDevice()) return null;
  const ua = navigator.userAgent;
  const safari = /Version\/(\d+)/.exec(ua);
  if (safari) return Number(safari[1]);
  const os = /OS (\d+)_/.exec(ua);
  return os ? Number(os[1]) : null;
}

/** 지금 기기를 사람이 읽기 좋게 (예: "아이폰 · 사파리 · iOS 26") */
export function detectedSummary(): string {
  const d = detectDevice();
  const v = iosVersion();
  const base = DEVICE_LABEL[d].replace(/ \(iOS.*\)$/, '');
  if (isStandaloneMode()) return `${base.split(' · ')[0]} · 홈 화면 앱`;
  return v ? `${base} · iOS ${v}` : base;
}

const INAPP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|everytimeApp|DaumApps|wv\)|; wv/i;

export function detectDevice(): DeviceKey {
  if (typeof navigator === 'undefined') return 'desktop-chrome';
  const ua = navigator.userAgent;
  if (isIOSDevice()) {
    if (INAPP.test(ua)) return 'ios-inapp';
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|Whale/.test(ua)) return 'ios-chrome'; // 같은 방식(공유 → 홈 화면에 추가)
    const v = iosVersion();
    return v !== null && v < 26 ? 'ios-safari-18' : 'ios-safari';
  }
  if (/Android/i.test(ua)) {
    if (INAPP.test(ua)) return 'android-inapp';
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung';
    return 'android-chrome';
  }
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'desktop-safari';
  if (/Chrome|Edg\//.test(ua)) return 'desktop-chrome';
  return 'desktop-other';
}

export const DEVICE_LABEL: Record<DeviceKey, string> = {
  'ios-safari': '아이폰 · 사파리 (iOS 26 이상)',
  'ios-safari-18': '아이폰 · 사파리 (iOS 18 이하)',
  'ios-chrome': '아이폰 · 크롬',
  'ios-inapp': '아이폰 · 카톡/네이버 앱 안',
  'android-chrome': '안드로이드 · 크롬',
  'android-samsung': '갤럭시 · 삼성 인터넷',
  'android-inapp': '안드로이드 · 카톡/네이버 앱 안',
  'desktop-chrome': 'PC · 크롬/엣지',
  'desktop-safari': '맥 · 사파리',
  'desktop-other': 'PC · 기타 브라우저',
};

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

export function calendarSubscribed(): boolean {
  try { return localStorage.getItem(CALENDAR_SUBSCRIBED_KEY) === 'true'; } catch { return false; }
}

/** 브라우저가 준 '설치' 이벤트 (크롬·엣지·삼성 인터넷). useInstallPrompt 가 받아 여기 보관 */
export function deferredInstallPrompt(): any {
  return (window as any).__uzuDeferredInstall || null;
}
