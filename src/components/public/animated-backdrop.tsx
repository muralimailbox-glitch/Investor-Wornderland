'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient aurora backdrop — two softly-orbiting radial gradients on a
 * canvas. Keeps its contribution off the main DOM tree so the rest of the
 * page stays crisp. Pauses when `prefers-reduced-motion` is set.
 */
export function AnimatedBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let raf = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      // setTransform replaces the matrix; scale() multiplies it, which
      // would compound across every resize and eventually destroy perf.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    const blob = (
      x: number,
      y: number,
      r: number,
      color: string,
    ) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const render = (now: number) => {
      const t = prefersReduced ? 0 : (now - start) / 5000;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const r1 = Math.min(width, height) * 0.55;
      const r2 = Math.min(width, height) * 0.45;

      blob(
        cx + Math.cos(t) * width * 0.18,
        cy + Math.sin(t * 0.8) * height * 0.22,
        r1,
        'rgba(139, 92, 246, 0.35)',
      );
      blob(
        cx + Math.cos(t * 1.3 + 1.4) * width * 0.24,
        cy + Math.sin(t * 1.1 + 0.6) * height * 0.26,
        r2,
        'rgba(245, 158, 11, 0.20)',
      );
      blob(
        cx - Math.cos(t * 0.7) * width * 0.22,
        cy - Math.sin(t * 0.9) * height * 0.18,
        r2 * 0.9,
        'rgba(56, 189, 248, 0.18)',
      );

      if (!prefersReduced) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
    />
  );
}
