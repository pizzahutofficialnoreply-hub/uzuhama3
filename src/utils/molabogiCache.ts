// 몰아보기 목록 쿠키 및 캐시 유틸리티
// "첫 데이터 불러오기 시 몰아보기 목록 때문에 시간이 느린거같은데 몰아보기는 몰아보기 펼칠 때만 불러와지도록 해줘. 그 뒤로는 쿠키에 저장."

const MOLABOGI_COOKIE_KEY = 'uzuhama_molabogi_cache_v1';
const MOLABOGI_STORAGE_KEY = 'uzuhama_molabogi_storage_v1';

export function getCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  } catch (e) {}
  return null;
}

export function setCookie(name: string, value: string, days = 30) {
  try {
    if (typeof document === 'undefined') return;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
  } catch (e) {}
}

export function getMolabogiCache<T = any>(): T[] | null {
  try {
    // 1. 쿠키 확인
    const cookieVal = getCookie(MOLABOGI_COOKIE_KEY);
    if (cookieVal) {
      const decoded = decodeURIComponent(cookieVal);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as T[];
      }
    }
  } catch (e) {}

  try {
    // 2. LocalStorage 백업 확인 (쿠키 크기 제한 대비)
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(MOLABOGI_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as T[];
        }
      }
    }
  } catch (e) {}

  return null;
}

export function setMolabogiCache<T = any>(data: T[]) {
  if (!Array.isArray(data) || data.length === 0) return;
  try {
    const jsonStr = JSON.stringify(data);
    // 쿠키 크기는 통상 4KB 권장이므로, 쿠키에는 요약 또는 데이터 저장
    // 4000바이트 이하인 경우 쿠키에 저장, 초과 시 안전하게 인덱스/간략본 쿠키 및 로컬스토리지 저장
    if (jsonStr.length < 3800) {
      setCookie(MOLABOGI_COOKIE_KEY, jsonStr);
    } else {
      // 간략화하여 쿠키에 저장
      const slim = data.map((d: any) => ({
        compilationId: d.compilationId,
        title: d.title || d.videoTitle,
        url: d.url || d.videoUrl,
        gamesCount: Array.isArray(d.games) ? d.games.length : (d.gamesCount || 0)
      }));
      setCookie(MOLABOGI_COOKIE_KEY, JSON.stringify(slim));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MOLABOGI_STORAGE_KEY, jsonStr);
    }
  } catch (e) {}
}
