export const DEFAULT_TAB_GLASS_VALUE = 30;
export const TAB_GLASS_STORAGE_KEY = 'uzuhama_tab_glass_slider';

export interface TabGlassConfig {
  value: number; // 0 ~ 100
  blurPx: number;
  lightBg: string; // rgba(255, 255, 255, x)
  darkBg: string;  // rgba(0, 0, 0, x)
  lightBorder: string;
  darkBorder: string;
  bottomFadeLight: string;
  bottomFadeDark: string;
}

export function computeTabGlassConfig(sliderVal: number): TabGlassConfig {
  const val = Math.max(0, Math.min(100, Math.round(sliderVal)));
  const t = val / 100;
  
  let blurPx: number;
  let lightOp: number;
  let darkOp: number;

  // 왼쪽(0)으로 갈수록: 블러 많고(36px) 더 투명함(0.16)
  // 기본값(30): 블러도 유지(24px) + 반투명 느낌에서 투명도 약간 증가(0.35 / 0.38)
  // 오른쪽(100)으로 갈수록: 블러 적고(4px) 더 불투명함(0.88)
  if (t <= 0.3) {
    const ratio = t / 0.3;
    blurPx = Math.round(36 - ratio * 12); // 36px -> 24px
    lightOp = 0.16 + ratio * (0.35 - 0.16); // 0.16 -> 0.35
    darkOp = 0.20 + ratio * (0.38 - 0.20);  // 0.20 -> 0.38
  } else {
    const ratio = (t - 0.3) / 0.7;
    blurPx = Math.round(24 - ratio * 20); // 24px -> 4px
    lightOp = 0.35 + ratio * (0.88 - 0.35); // 0.35 -> 0.88
    darkOp = 0.38 + ratio * (0.88 - 0.38);  // 0.38 -> 0.88
  }

  const borderLightOp = 0.35 + t * 0.35;
  const borderDarkOp = 0.08 + t * 0.18;

  return {
    value: val,
    blurPx,
    lightBg: `rgba(255, 255, 255, ${lightOp.toFixed(3)})`,
    darkBg: `rgba(0, 0, 0, ${darkOp.toFixed(3)})`,
    lightBorder: `rgba(255, 255, 255, ${borderLightOp.toFixed(3)})`,
    darkBorder: `rgba(255, 255, 255, ${borderDarkOp.toFixed(3)})`,
    bottomFadeLight: `rgba(255, 255, 255, ${(0.08 + t * 0.22).toFixed(3)})`,
    bottomFadeDark: `rgba(0, 0, 0, ${(0.10 + t * 0.22).toFixed(3)})`,
  };
}

export function getSavedTabGlassValue(): number {
  if (typeof window === 'undefined') return DEFAULT_TAB_GLASS_VALUE;
  const saved = localStorage.getItem(TAB_GLASS_STORAGE_KEY);
  if (saved !== null) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed;
    }
  }
  return DEFAULT_TAB_GLASS_VALUE;
}

export function saveTabGlassValue(value: number): void {
  if (typeof window === 'undefined') return;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  localStorage.setItem(TAB_GLASS_STORAGE_KEY, String(clamped));
  applyTabGlassCssVars(clamped);
  window.dispatchEvent(new CustomEvent('uzuhama_tab_glass_changed', { detail: clamped }));
}

export function applyTabGlassCssVars(value: number): void {
  if (typeof document === 'undefined') return;
  const config = computeTabGlassConfig(value);
  const root = document.documentElement;
  root.style.setProperty('--tab-glass-blur', `${config.blurPx}px`);
  root.style.setProperty('--tab-glass-bg-light', config.lightBg);
  root.style.setProperty('--tab-glass-bg-dark', config.darkBg);
  root.style.setProperty('--tab-glass-border-light', config.lightBorder);
  root.style.setProperty('--tab-glass-border-dark', config.darkBorder);
  root.style.setProperty('--tab-glass-fade-light', config.bottomFadeLight);
  root.style.setProperty('--tab-glass-fade-dark', config.bottomFadeDark);
}
