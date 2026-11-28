export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'uzuhama_theme_mode';

// 메모리 및 쿠키 백업 헬퍼
function getCookie(name: string): string | null {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  } catch (e) {}
  return null;
}

function setCookie(name: string, value: string, days = 365) {
  try {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
  } catch (e) {}
}

export function getThemeMode(): ThemeMode {
  try {
    // 1. LocalStorage 확인
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {}

  try {
    // 2. Cookie 백업 확인
    const cookieVal = getCookie(THEME_STORAGE_KEY);
    if (cookieVal === 'light' || cookieVal === 'dark' || cookieVal === 'system') {
      return cookieVal;
    }
  } catch (e) {}

  // 3. Window 인메모리 백업 확인
  if (typeof window !== 'undefined' && (window as any).__uzuhama_theme_mode) {
    const memVal = (window as any).__uzuhama_theme_mode;
    if (memVal === 'light' || memVal === 'dark' || memVal === 'system') {
      return memVal;
    }
  }

  return 'system';
}

export function applyTheme(mode: ThemeMode): void {
  // 메모리/로컬스토리지/쿠키 3중 동기화
  if (typeof window !== 'undefined') {
    (window as any).__uzuhama_theme_mode = mode;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (e) {}
  setCookie(THEME_STORAGE_KEY, mode);

  const root = document.documentElement;
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.setAttribute('data-theme', mode);

  // Update theme-color meta tags
  const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#09090b' : '#fafafa');
  }

  // Dispatch custom event for reactive UI updates
  window.dispatchEvent(new CustomEvent('uzuhama-theme-changed', { detail: mode }));
}

/**
 * 앱 시작 시 1회 호출하여 시스템 설정 변경 감지 및 테마 초기화
 */
export function initThemeListener(): () => void {
  // 1. 현재 설정된 테마 즉시 적용
  const currentMode = getThemeMode();
  applyTheme(currentMode);

  // 2. 시스템 OS 다크모드 변경 시 실시간 대응 (mode가 'system'일 때만)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  // 아이폰은 앱을 벗어날 때 앱 전환 화면용 사진을 밝은·어두운 모양으로 둘 다 찍으려고 '시스템 모양'을 잠깐 바꿈
  //  → 그때 테마를 따라 바꾸면 반쯤 밝은 화면이 찍혀, 돌아올 때 하얀 칸이 비치거나 사진을 못 써서 검은 화면이 오래 보였음
  //  그래서 화면이 안 보이는 동안의 바뀜은 무시하고, 다시 보일 때 한 번만 맞춤
  const syncSystem = () => {
    if (getThemeMode() !== 'system') return;
    document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const handleMediaChange = () => {
    if (document.visibilityState === 'hidden') return;
    syncSystem();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestAnimationFrame(syncSystem);
  });

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleMediaChange);
  } else {
    mediaQuery.addListener(handleMediaChange);
  }

  // 3. 다른 탭이나 창에서 테마가 변경되었을 때 동기화
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && e.newValue) {
      applyTheme(e.newValue as ThemeMode);
    }
  };
  window.addEventListener('storage', handleStorageChange);

  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleMediaChange);
    } else {
      mediaQuery.removeListener(handleMediaChange);
    }
    window.removeEventListener('storage', handleStorageChange);
  };
}
