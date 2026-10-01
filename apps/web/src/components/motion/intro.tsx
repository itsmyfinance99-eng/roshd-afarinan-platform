'use client';

import { useEffect } from 'react';
import { motionEnabled } from './motion-env';

const ENTER = 'cubic-bezier(0.22, 1, 0.36, 1)';
const STATE = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const INTRO_SEEN_KEY = 'ra-intro-seen';

interface Node {
  x: number;
  y: number;
  t: number;
  a: number;
  d: number;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Home entrance (prototype motion.js `intro`): logo → a node network growing from above the
 * logo → the screen opens tile by tile from the centre. Once per session, never under reduced
 * motion; click, Esc or «رد شدن» skips. The page is server-rendered underneath the whole time.
 * The <head> boot script shows a plain graphite cover (html.ra-intro) until this takes over,
 * so the page does not flash first.
 */
export function Intro({ logoSrc }: { logoSrc: string }) {
  useEffect(() => {
    const html = document.documentElement;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch {
      seen = true;
    }
    if (seen || !motionEnabled()) {
      html.classList.remove('ra-intro');
      return;
    }

    const colors = {
      bgInner: token('--color-brand-800'),
      bgOuter: token('--color-brand-950'),
      line: token('--color-accent'),
      node: token('--color-primary'),
      nodeSoft: token('--color-accent-soft'),
    };

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;cursor:pointer';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const logoBox = document.createElement('div');
    logoBox.setAttribute('aria-hidden', 'true');
    logoBox.style.cssText = `position:absolute;left:50%;top:50%;width:200px;height:212px;margin:-106px 0 0 -100px;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.7);transition:opacity 600ms ${ENTER},transform 700ms ${ENTER},filter 500ms`;
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = '';
    img.style.cssText = `width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1) drop-shadow(0 0 18px ${rgba(colors.line, 0.55)}) drop-shadow(0 0 42px ${rgba(colors.line, 0.55)})`;
    logoBox.appendChild(img);
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'رد شدن';
    skip.style.cssText = `position:absolute;left:20px;bottom:20px;height:36px;padding:0 14px;border-radius:999px;border:1px solid ${rgba(colors.line, 0.35)};background:rgba(0,0,0,.6);color:${token('--color-ink-3')};font:600 13px var(--font-sans);cursor:pointer;transition:opacity 300ms`;
    wrap.append(canvas, logoBox, skip);
    document.body.appendChild(wrap);
    html.classList.remove('ra-intro');
    const previousOverflow = html.style.overflow;
    html.style.overflow = 'hidden';

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2;
    const cy = H / 2;
    const small = W < 768;

    // Network: grows from just above the logo, space-filling via min-distance rejection.
    const T0 = 750;
    const SPEED = small ? 0.5 : 0.62;
    const MIN = small ? 34 : 40;
    const LIMIT = small ? 260 : 520;
    const root: Node = { x: cx, y: cy - 112, t: T0, a: -Math.PI / 2, d: 0 };
    const nodes: Node[] = [root];
    const edges: Array<[Node, Node, boolean]> = [];
    const grid = new Map<string, Node[]>();
    const key = (x: number, y: number) => `${Math.floor(x / MIN)},${Math.floor(y / MIN)}`;
    const near = (x: number, y: number) => {
      const gx = Math.floor(x / MIN);
      const gy = Math.floor(y / MIN);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const n of grid.get(`${gx + i},${gy + j}`) ?? []) {
            if (Math.hypot(n.x - x, n.y - y) < MIN) return true;
          }
        }
      }
      return Math.abs(x - cx) < 116 && Math.abs(y - cy) < 118; // keep the logo clear
    };
    const put = (n: Node) => {
      const k = key(n.x, n.y);
      grid.set(k, [...(grid.get(k) ?? []), n]);
    };
    put(root);
    let queue = [root];
    let maxT = T0;
    while (queue.length && nodes.length < LIMIT) {
      const next: Node[] = [];
      for (const p of queue) {
        const kids = p.d < 2 ? 3 : 2;
        for (let k = 0; k < kids; k++) {
          const spread = p.d === 0 ? 2.4 : 1.5;
          const a = p.a + (Math.random() - 0.5) * spread + (k - (kids - 1) / 2) * 0.7;
          const len = MIN * (1.15 + Math.random() * 0.9);
          const x = p.x + Math.cos(a) * len;
          const y = p.y + Math.sin(a) * len;
          if (x < -40 || x > W + 40 || y < -40 || y > H + 40 || near(x, y)) continue;
          const n: Node = { x, y, t: p.t + len / SPEED, a, d: p.d + 1 };
          nodes.push(n);
          put(n);
          edges.push([p, n, false]);
          next.push(n);
          maxT = Math.max(maxT, n.t);
        }
      }
      queue = next.sort(() => Math.random() - 0.5);
    }
    // A few cross-links for a mesh feel.
    for (let i = 0; i < nodes.length; i += 3) {
      const n = nodes[i]!;
      const gx = Math.floor(n.x / MIN);
      const gy = Math.floor(n.y / MIN);
      const b = grid.get(`${gx + 1},${gy}`) ?? grid.get(`${gx},${gy + 1}`);
      if (b && b[0] !== n) edges.push([n, b[0]!, true]);
    }

    const growEnd = Math.min(maxT, T0 + (small ? 1500 : 1900));
    const REVEAL = growEnd + 250;
    const CS = small ? 36 : 46;
    const maxD = Math.hypot(cx, cy);
    const cells: Array<{ x: number; y: number; t: number }> = [];
    for (let r = 0; r < Math.ceil(H / CS); r++) {
      for (let c = 0; c < Math.ceil(W / CS); c++) {
        const x = c * CS;
        const y = r * CS;
        const d = Math.hypot(x + CS / 2 - cx, y + CS / 2 - cy) / maxD;
        cells.push({ x, y, t: REVEAL + d * 850 + Math.random() * 260 });
      }
    }
    const END = REVEAL + 850 + 260 + 220;

    let raf = 0;
    let done = false;
    let logoOut = false;
    const t0 = performance.now();
    requestAnimationFrame(() => {
      logoBox.style.opacity = '1';
      logoBox.style.transform = 'scale(1)';
    });

    const finish = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem(INTRO_SEEN_KEY, '1');
      } catch {
        // Storage blocked: the intro may show again next time, which is harmless.
      }
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      wrap.style.transition = `opacity 300ms ${STATE}`;
      wrap.style.opacity = '0';
      html.style.overflow = previousOverflow;
      window.setTimeout(() => wrap.remove(), 320);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    wrap.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);

    const frame = (now: number) => {
      if (!ctx) return finish();
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxD);
      g.addColorStop(0, colors.bgInner);
      g.addColorStop(1, colors.bgOuter);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (const [a, b, cross] of edges) {
        const start = cross ? Math.max(a.t, b.t) : a.t;
        const end = cross ? start + 260 : b.t;
        if (t < start) continue;
        const p = Math.min(1, (t - start) / (end - start));
        ctx.strokeStyle = cross
          ? rgba(colors.line, 0.16)
          : rgba(colors.line, 0.5 - Math.min(0.3, b.d * 0.025));
        ctx.lineWidth = cross ? 0.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
        ctx.stroke();
      }
      for (const n of nodes) {
        if (t < n.t) continue;
        const age = t - n.t;
        const pop = Math.min(1, age / 220);
        const r = (n.d % 5 === 0 ? 3.2 : 2) * (0.6 + 0.4 * pop);
        if (age < 400) {
          ctx.fillStyle = rgba(colors.node, 0.35 * (1 - age / 400));
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 10 * (age / 400), 0, 6.283);
          ctx.fill();
        }
        ctx.fillStyle = n.d % 5 === 0 ? colors.node : colors.nodeSoft;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 6.283);
        ctx.fill();
      }
      if (t >= REVEAL) {
        if (!logoOut) {
          logoOut = true;
          logoBox.style.transition = `opacity 450ms ${STATE},transform 600ms ${ENTER},filter 450ms`;
          logoBox.style.opacity = '0';
          logoBox.style.transform = 'scale(1.25)';
          logoBox.style.filter = 'blur(6px)';
          skip.style.opacity = '0';
        }
        for (const c of cells) {
          if (t < c.t - 140) continue;
          if (t < c.t) {
            ctx.fillStyle = rgba(colors.node, 0.45 * (1 - (c.t - t) / 140));
            ctx.fillRect(c.x + 1, c.y + 1, CS - 2, CS - 2);
            continue;
          }
          ctx.clearRect(c.x, c.y, CS, CS);
          const age = t - c.t;
          if (age < 260) {
            ctx.strokeStyle = rgba(colors.line, 0.7 * (1 - age / 260));
            ctx.lineWidth = 1;
            ctx.strokeRect(c.x + 0.5, c.y + 0.5, CS - 1, CS - 1);
          }
        }
      }
      if (t >= END) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      finish();
      wrap.remove();
    };
  }, [logoSrc]);

  return null;
}
