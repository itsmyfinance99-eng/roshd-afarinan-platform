'use client';

import { useEffect, useRef } from 'react';
import { isLowPower, motionEnabled } from './motion-env';

const RING_LIFE = 4200;

/** Reads a colour token (e.g. --color-primary, a #rrggbb value) as an RGB triple. */
function tokenRgb(token: string): [number, number, number] {
  const h = getComputedStyle(document.documentElement).getPropertyValue(token).trim().slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}

interface Ring {
  x: number;
  y: number;
  t: number;
  max: number;
}

/**
 * Sonar Grid hero background: a canvas dot grid with copper rings rippling out every 1.5s
 * (biased to the inline-end half) and a slow brightness wave. Pointer-down adds a ring.
 * Pauses off-screen and in hidden tabs; low-power devices and reduced motion get a designed
 * still frame with two frozen rings. Decorative only.
 */
export function SonarGrid({
  dot = '--color-primary',
  ring = '--color-primary',
  alpha = 0.2,
  gap = 26,
  className,
}: {
  /** Colour tokens, e.g. '--color-line-3'. */
  dot?: string;
  ring?: string;
  alpha?: number;
  gap?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;
    const dotRgb = tokenRgb(dot);
    const ringRgb = tokenRgb(ring);
    const still = !motionEnabled() || isLowPower();
    const rings: Ring[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let last = 0;

    const size = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = rings.length - 1; i >= 0; i--) {
        if (now - rings[i]!.t > RING_LIFE) rings.splice(i, 1);
      }
      const cols = Math.ceil(w / gap) + 1;
      const rows = Math.ceil(h / gap) + 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * gap + (w % gap) / 2;
          const py = y * gap + gap / 2;
          let boost = 0;
          for (const r of rings) {
            const age = (now - r.t) / RING_LIFE;
            const d = Math.abs(Math.hypot(px - r.x, py - r.y) - age * r.max);
            if (d < 34) boost = Math.max(boost, (1 - d / 34) * (1 - age));
          }
          const wave = still ? 0 : 0.07 * Math.sin(px * 0.018 + py * 0.012 - now * 0.0016);
          const a = Math.max(0, alpha + wave + boost * 0.75);
          const c = boost > 0.05 ? ringRgb : dotRgb;
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.1 + boost * 1.6, 0, 6.283);
          ctx.fill();
        }
      }
      for (const r of rings) {
        const age = (now - r.t) / RING_LIFE;
        ctx.strokeStyle = `rgba(${ringRgb[0]},${ringRgb[1]},${ringRgb[2]},${0.28 * (1 - age)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, age * r.max, 0, 6.283);
        ctx.stroke();
      }
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last > 1500) {
        last = now;
        rings.push({
          x: w * (0.08 + Math.random() * 0.5),
          y: h * (0.2 + Math.random() * 0.65),
          t: now,
          max: Math.max(w, h) * 0.55,
        });
      }
      frame(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && !still) raf = requestAnimationFrame(loop);
    };

    const drawStill = () => {
      const n = performance.now();
      rings.length = 0;
      rings.push({ x: w * 0.3, y: h * 0.55, t: n - 1500, max: Math.max(w, h) * 0.55 });
      rings.push({ x: w * 0.18, y: h * 0.3, t: n - 2600, max: Math.max(w, h) * 0.55 });
      frame(n);
    };

    size();
    const cleanups: Array<() => void> = [];
    if (still) {
      drawStill();
    } else {
      const io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        if (visible) start();
      });
      io.observe(host);
      const onPointerDown = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        rings.push({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          t: performance.now(),
          max: Math.max(w, h) * 0.45,
        });
        start();
      };
      document.addEventListener('visibilitychange', start);
      host.addEventListener('pointerdown', onPointerDown);
      start();
      cleanups.push(() => {
        io.disconnect();
        document.removeEventListener('visibilitychange', start);
        host.removeEventListener('pointerdown', onPointerDown);
        cancelAnimationFrame(raf);
      });
    }
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        size();
        if (still) drawStill();
      }, 150);
    };
    window.addEventListener('resize', onResize);
    cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(resizeTimer);
    });
    return () => cleanups.forEach((fn) => fn());
  }, [dot, ring, alpha, gap]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
