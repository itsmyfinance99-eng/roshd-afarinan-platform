'use client';

import { useEffect } from 'react';
import { isLowPower, motionEnabled } from './motion-env';

/*
 * Declarative motion layer (reference: design/claude-design/prototype/motion.js).
 * Server components opt in with data attributes; this island watches the DOM and flips
 * `data-shown` when an element enters the viewport. The visual states live in globals.css,
 * scoped to html.ra-motion, so nothing here runs (and nothing is hidden) under reduced motion.
 *
 *  data-reveal[=fade|words|pop|wipe|grow-y]   data-delay / data-dur (ms)   data-stagger (on a parent)
 *  data-draw          SVG stroke draw (pathLength="1")
 *  data-spotlight     cursor spotlight: sets --mx / --my for the [data-spot] overlay
 *  data-rail="auto"   process rail groups ([data-rail-group] with [data-rail-fill] + [data-step] > [data-dot])
 */

const STEP_MS = 950;
const HOLD_MS = 2200;
const STATE_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

function defaultDuration(el: HTMLElement): number {
  const mode = el.dataset.reveal;
  if (el.dataset.dur) return Number(el.dataset.dur);
  if (el.hasAttribute('data-draw')) return 900;
  return mode === 'wipe' ? 1200 : mode === 'pop' ? 420 : 600;
}

function delayOf(el: HTMLElement): number {
  let delay = Number(el.dataset.delay) || 0;
  const parent = el.parentElement?.closest<HTMLElement>('[data-stagger]');
  if (parent && !el.dataset.delay) {
    const kids = Array.from(
      parent.querySelectorAll(':scope > [data-reveal], :scope > * > [data-reveal]'),
    );
    const index = kids.indexOf(el);
    if (index > 0) delay += index * (Number(parent.dataset.stagger) || 70);
  }
  return delay;
}

function show(el: HTMLElement) {
  if (el.hasAttribute('data-shown')) return;
  el.setAttribute('data-shown', '');
  const total = defaultDuration(el) + delayOf(el) + 60;
  const words = el.dataset.reveal === 'words' ? el.querySelectorAll('.ra-w').length * 45 : 0;
  window.setTimeout(() => el.setAttribute('data-shown', 'done'), total + words);
}

/* ---------- process rail (auto mode) ---------- */
function setRailGroup(group: HTMLElement, p: number) {
  const fill = group.querySelector<HTMLElement>('[data-rail-fill]');
  if (fill) {
    const vertical = fill.offsetHeight > fill.offsetWidth;
    fill.style.transformOrigin = vertical ? 'top' : 'right';
    fill.style.transform = vertical ? `scaleY(${p})` : `scaleX(${p})`;
  }
  const steps = group.querySelectorAll<HTMLElement>('[data-step]');
  const n = Math.max(1, steps.length - 1);
  const current = Math.min(steps.length - 1, Math.max(0, Math.floor(p * n + 0.02)));
  steps.forEach((step, i) => {
    const on = p >= i / n - 0.02;
    const now = on && i === current;
    step.style.transition = `opacity 350ms ${STATE_EASE}, transform 350ms ${STATE_EASE}`;
    step.style.opacity = on ? '1' : '0.45';
    step.style.transform = now ? 'translateY(-4px)' : 'none';
    step.toggleAttribute('data-current', now);
    const dot = step.querySelector<HTMLElement>('[data-dot]');
    if (dot) {
      dot.style.transition = `transform 350ms ${STATE_EASE}, box-shadow 350ms ${STATE_EASE}, background 350ms, color 350ms`;
      dot.style.transform = now ? 'scale(1.12)' : on ? 'scale(1)' : 'scale(.86)';
      dot.toggleAttribute('data-on', on);
      dot.toggleAttribute('data-now', now);
    }
  });
}

function startRail(rail: HTMLElement): () => void {
  let t0 = 0;
  let raf = 0;
  let visible = false;
  const run = (now: number) => {
    raf = 0;
    if (!rail.isConnected || !visible || document.hidden) return;
    const groups = Array.from(rail.querySelectorAll<HTMLElement>('[data-rail-group]')).filter(
      (g) => g.offsetParent !== null,
    );
    if (!t0) t0 = now;
    groups.forEach((group) => {
      const n = Math.max(1, group.querySelectorAll('[data-step]').length - 1);
      const cycle = n * STEP_MS + HOLD_MS;
      const t = (now - t0) % cycle;
      const raw = Math.min(1, t / (n * STEP_MS));
      const seg = Math.min(n - 1, Math.floor(raw * n));
      const f = raw * n - seg;
      const eased =
        raw >= 1 ? 1 : (seg + (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2)) / n;
      setRailGroup(group, eased);
    });
    raf = requestAnimationFrame(run);
  };
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible && !raf) {
        t0 = 0;
        raf = requestAnimationFrame(run);
      }
    },
    { threshold: 0.3 },
  );
  io.observe(rail);
  const onVisibility = () => {
    if (visible && !raf) raf = requestAnimationFrame(run);
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    cancelAnimationFrame(raf);
  };
}

export function MotionEngine() {
  useEffect(() => {
    const html = document.documentElement;
    (window as unknown as { __raFX?: boolean }).__raFX = true;
    // The intro island (home page) takes the cover over in its own effect, which has run by
    // now; anywhere else the cover must go immediately.
    const coverTimer = window.setTimeout(() => html.classList.remove('ra-intro'), 0);
    if (!motionEnabled()) {
      html.classList.remove('ra-motion', 'ra-intro');
      return () => window.clearTimeout(coverTimer);
    }
    html.toggleAttribute('data-low-power', isLowPower());

    const cleanups: Array<() => void> = [() => window.clearTimeout(coverTimer)];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          show(entry.target as HTMLElement);
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -5% 0px' },
    );
    cleanups.push(() => io.disconnect());

    // Per-run bookkeeping (not a DOM flag) so a remount — Strict Mode, HMR — observes again.
    const seen = new WeakSet<Element>();
    const init = () => {
      document
        .querySelectorAll<HTMLElement>(
          '[data-reveal]:not([data-shown]), [data-draw]:not([data-shown])',
        )
        .forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          el.style.setProperty('--ra-dur', `${defaultDuration(el)}ms`);
          el.style.setProperty('--ra-delay', `${delayOf(el)}ms`);
          if (el.dataset.reveal === 'wipe' && el.parentElement) {
            // A fully clipped target never reports an intersection: watch its parent.
            const parentIo = new IntersectionObserver(
              (entries) => {
                if (entries[0]?.isIntersecting) {
                  parentIo.disconnect();
                  show(el);
                }
              },
              { threshold: 0.2 },
            );
            parentIo.observe(el.parentElement);
            cleanups.push(() => parentIo.disconnect());
          } else {
            io.observe(el);
          }
        });
      document.querySelectorAll<HTMLElement>('[data-rail="auto"]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        cleanups.push(startRail(el));
      });
    };

    init();
    let timer = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(init, 30);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      mo.disconnect();
      window.clearTimeout(timer);
    });

    // Spotlight: one delegated listener instead of one per card.
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>('[data-spotlight]');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    cleanups.push(() => document.removeEventListener('pointermove', onPointerMove));

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
