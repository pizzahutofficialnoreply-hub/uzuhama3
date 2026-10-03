import { useEffect, useState } from 'react';

/**
 * Creates analytical convex lens displacement filters for Apple Liquid Glass.
 * Includes both procedural normal-map refraction and pure SVG turbulence displacement.
 */
function createConvexLensNormalMapDataUri(): string {
  if (typeof document === 'undefined') return '';
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const half = size / 2;
  const radius = half;
  const bevelStart = radius * 0.72; // Inner 72% flat & completely clear

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - half;
      const dy = y - half;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= radius) {
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 255;
        data[idx + 3] = 0;
      } else if (dist <= bevelStart) {
        // Flat center: Zero displacement, completely clear
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      } else {
        // Convex meniscus curve: Sinusoidal refraction
        const t = (dist - bevelStart) / (radius - bevelStart);
        const angle = t * 1.5707963;
        const nx = (dx / dist) * Math.sin(angle);
        const ny = (dy / dist) * Math.sin(angle);

        data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round(Math.cos(angle) * 255);
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

export function LiquidGlassFilterDefs() {
  const [normalMapUrl, setNormalMapUrl] = useState<string>('');

  useEffect(() => {
    try {
      const url = createConvexLensNormalMapDataUri();
      setNormalMapUrl(url);
    } catch {}
  }, []);

  return (
    <svg className="fixed w-0 h-0 pointer-events-none opacity-0 -z-50" aria-hidden="true">
      <defs>
        {/* 1. Analytical Convex Lens Displacement Filter */}
        <filter
          id="liquid-glass-refraction-filter"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          {normalMapUrl && (
            <feImage
              href={normalMapUrl}
              result="lensNormalMap"
              preserveAspectRatio="none"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
            />
          )}
          {normalMapUrl && (
            <feDisplacementMap
              in="SourceGraphic"
              in2="lensNormalMap"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warpedBackdrop"
            />
          )}
          <feGaussianBlur
            in={normalMapUrl ? "warpedBackdrop" : "SourceGraphic"}
            stdDeviation="0.4"
            result="softened"
          />
        </filter>

        {/* 2. Pure SVG Fluid Turbulence Lens (High-reliability fallback) */}
        <filter
          id="liquid-glass-fluid-lens"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.02"
            numOctaves="2"
            result="fluidNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="fluidNoise"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
        </filter>
      </defs>
    </svg>
  );
}
