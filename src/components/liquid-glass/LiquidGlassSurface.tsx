import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '../../utils';

export interface LiquidGlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  cornerRadius?: number; // Border radius in pixels (e.g. 32 for a 64px capsule)
  bevelWidth?: number; // Visual bevel width
  refractionStrength?: number; // Optical refraction intensity (default: 1.0)
  specularIntensity?: number; // Specular rim reflection intensity (default: 1.0)
  blurAmount?: number; // Backdrop blur in pixels (default: 22px)
  chromaticAberration?: boolean; // Enable chromatic prism rim fringe (default: true)
  interactiveLight?: boolean; // Dynamic light glint responding to touch/cursor (default: true)
  children?: React.ReactNode;
}

export function LiquidGlassSurface({
  cornerRadius = 32,
  bevelWidth = 13,
  refractionStrength = 1.0,
  specularIntensity = 1.0,
  blurAmount = 22,
  chromaticAberration = true,
  interactiveLight = true,
  children,
  className,
  style,
  ...rest
}: LiquidGlassSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lightPos, setLightPos] = useState({ x: 35, y: 10 });
  const rafRef = useRef<number | null>(null);

  // Sync Dark/Light theme mode
  useEffect(() => {
    const checkDark = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(isDark);
    };
    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const handleThemeEvent = () => checkDark();
    window.addEventListener('uzuhama-theme-changed', handleThemeEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener('uzuhama-theme-changed', handleThemeEvent);
    };
  }, []);

  // Smooth pointer/touch tracking for dynamic specular glint
  const handlePointerMovement = useCallback((clientX: number, clientY: number) => {
    if (!interactiveLight || !containerRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
      const relY = ((clientY - rect.top) / Math.max(rect.height, 1)) * 100;

      // Clamp smooth light coordinates across top-left bevel
      const clampedX = Math.max(10, Math.min(90, Math.round(relX)));
      const clampedY = Math.max(-20, Math.min(60, Math.round(relY * 0.5)));
      setLightPos({ x: clampedX, y: clampedY });
    });
  }, [interactiveLight]);

  useEffect(() => {
    if (!interactiveLight || typeof window === 'undefined') return;

    const onPointerMove = (e: PointerEvent) => {
      handlePointerMovement(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        handlePointerMovement(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [interactiveLight, handlePointerMovement]);

  return (
    <div
      ref={containerRef}
      style={{
        borderRadius: `${cornerRadius}px`,
        ...style,
      }}
      className={cn(
        "relative isolation-auto select-none touch-manipulation overflow-hidden",
        className
      )}
      {...rest}
    >
      {/* ========================================================
          LAYER 1: Real-time Backdrop Blur & Optical Refraction
          Applies CSS backdrop-filter with chroma boost & SVG displacement
          ======================================================== */}
      <div
        aria-hidden="true"
        style={{
          borderRadius: `${cornerRadius}px`,
          WebkitBackdropFilter: `url(#liquid-glass-refraction-filter) blur(${blurAmount}px) saturate(190%) contrast(106%) brightness(104%)`,
          backdropFilter: `url(#liquid-glass-refraction-filter) blur(${blurAmount}px) saturate(190%) contrast(106%) brightness(104%)`,
        }}
        className={cn(
          "absolute inset-0 pointer-events-none transition-colors duration-200",
          isDarkMode
            ? "bg-zinc-950/40"
            : "bg-white/40"
        )}
      />

      {/* ========================================================
          LAYER 2: Interactive Dynamic Specular Glint (Touch/Mouse)
          Apple Liquid Glass specular highlight reacting to light angle
          ======================================================== */}
      <div
        aria-hidden="true"
        style={{
          borderRadius: `${cornerRadius}px`,
          background: `radial-gradient(280px circle at ${lightPos.x}% ${lightPos.y}%, ${
            isDarkMode 
              ? 'rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 35%, transparent 70%' 
              : 'rgba(255, 255, 255, 0.40) 0%, rgba(255, 255, 255, 0.12) 35%, transparent 70%'
          })`,
          opacity: specularIntensity,
        }}
        className="absolute inset-0 pointer-events-none transition-opacity duration-150 z-1"
      />

      {/* ========================================================
          LAYER 3: Physical Convex Lens Bevel & Internal Caustics
          Multi-stop physical inset shadows creating convex rim glint
          and bottom ambient bounce reflection
          ======================================================== */}
      <div
        aria-hidden="true"
        style={{
          borderRadius: `${cornerRadius}px`,
          boxShadow: isDarkMode
            ? [
                // Deep floating ambient drop shadow
                '0 16px 40px -6px rgba(0, 0, 0, 0.70)',
                // Outer subtle glass border
                '0 0 0 1px rgba(255, 255, 255, 0.12)',
                // Convex lens top specular rim glint
                'inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.55)',
                // Top inner caustic gradient
                'inset 0 8px 16px -4px rgba(255, 255, 255, 0.14)',
                // Bottom ambient ground bounce reflection
                'inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.12)',
                // Inner bevel thickness
                'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
              ].join(', ')
            : [
                // Soft floating ambient drop shadow
                '0 14px 38px -6px rgba(0, 0, 0, 0.10)',
                // Outer crystal border outline
                '0 0 0 1px rgba(255, 255, 255, 0.50)',
                // Convex lens top specular rim glint
                'inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.90)',
                // Top inner caustic gradient
                'inset 0 8px 16px -4px rgba(255, 255, 255, 0.36)',
                // Bottom ambient ground bounce reflection
                'inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.32)',
                // Inner bevel thickness
                'inset 0 0 0 1px rgba(255, 255, 255, 0.18)',
              ].join(', '),
        }}
        className="absolute inset-0 pointer-events-none z-2"
      />

      {/* ========================================================
          LAYER 4: Chromatic Aberration Prism Fringe (Edge Dispersion)
          Prismatic color splitting along the outer perimeter bevel
          ======================================================== */}
      {chromaticAberration && (
        <div
          aria-hidden="true"
          style={{
            borderRadius: `${cornerRadius}px`,
            padding: '1px',
            background: isDarkMode
              ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.30) 0%, rgba(180, 210, 255, 0.18) 30%, rgba(230, 190, 255, 0.14) 70%, rgba(255, 255, 255, 0.22) 100%)'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(195, 230, 255, 0.40) 30%, rgba(255, 215, 240, 0.30) 70%, rgba(255, 255, 255, 0.60) 100%)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
          className="absolute inset-0 pointer-events-none z-3 opacity-90"
        />
      )}

      {/* ========================================================
          LAYER 5: Interactive Foreground Content
          Icons, text, and inputs remain 100% crisp & responsive
          ======================================================== */}
      <div className="relative z-10 w-full h-full pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
