import { useState, useEffect, useCallback } from 'react';
import { 
  getSavedTabGlassValue, 
  saveTabGlassValue, 
  computeTabGlassConfig, 
  DEFAULT_TAB_GLASS_VALUE,
  TabGlassConfig 
} from '../utils/tabGlass';

export function useTabGlass() {
  const [sliderValue, setSliderValue] = useState<number>(() => getSavedTabGlassValue());
  const [config, setConfig] = useState<TabGlassConfig>(() => computeTabGlassConfig(sliderValue));

  useEffect(() => {
    const handleGlassChange = (e: any) => {
      const val = typeof e.detail === 'number' ? e.detail : getSavedTabGlassValue();
      setSliderValue(val);
      setConfig(computeTabGlassConfig(val));
    };

    window.addEventListener('uzuhama_tab_glass_changed', handleGlassChange);
    window.addEventListener('storage', handleGlassChange);
    return () => {
      window.removeEventListener('uzuhama_tab_glass_changed', handleGlassChange);
      window.removeEventListener('storage', handleGlassChange);
    };
  }, []);

  const updateGlassValue = useCallback((nextVal: number) => {
    setSliderValue(nextVal);
    setConfig(computeTabGlassConfig(nextVal));
    saveTabGlassValue(nextVal);
  }, []);

  const resetToDefault = useCallback(() => {
    updateGlassValue(DEFAULT_TAB_GLASS_VALUE);
  }, [updateGlassValue]);

  return {
    sliderValue,
    config,
    updateGlassValue,
    resetToDefault,
  };
}
