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
  const handleMediaChange = (e: MediaQueryListEvent) => {
    if (getThemeMode() === 'system') {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

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
