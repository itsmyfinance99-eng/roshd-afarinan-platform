/**
 * Roshd Afarinan v2 — motion layer (zero deps).
 * Declarative: elements opt in with data-* attributes; a MutationObserver
 * picks up anything DCs render later. Every effect has a static end state
 * under prefers-reduced-motion. Animates transform / opacity / clip-path / filter only.
 *
 *  data-reveal            Blur Fade (opacity, translateY 20px, blur 6px), once at ~20% in view
 *  data-reveal="words"    same, per WORD (never per character — Persian joining)
 *  data-reveal="pop"      scale-in for small nodes
 *  data-reveal="wipe"     clip-path wipe from inline-start (right)
 *  data-reveal="grow-y"   scaleY 0→1 from top (drawn vertical lines)
 *  data-stagger="70"      on a parent: children with data-reveal get index × n ms delay
 *  data-delay / data-dur  ms overrides
 *  data-draw              SVG stroke draw (element needs pathLength="1")
 *  data-ticker="50"       Number Ticker with Persian digits (data-prefix)
 *  data-loop="a|b|c"      Text Loop, word-level
 *  data-anim="pulse|ping|breathe|drift|shimmer|shine|dash"
 *  data-spotlight         cursor-following spotlight; child [data-spot] overlay, [data-zoom] image
 *  data-marquee           RTL marquee; child [data-track] holds two copies, 2nd has data-dup
 *  data-sonar             canvas Sonar Grid (data-dot, data-ring, data-alpha, data-gap)
 *  data-paths             svg Floating Paths (filled by JS)
 *  data-rail              scroll-linked process: [data-rail-fill] + [data-step] (with [data-dot])
 *  data-progress          reading progress bar (scaleX from the right)
 */
(function () {
  if (window.RoshdFX) return;
  const EASE_IN = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const EASE_STATE = 'cubic-bezier(0.65, 0, 0.35, 1)';
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
  const lowPower = () =>
    window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches ||
    (navigator.connection && navigator.connection.saveData) || (navigator.hardwareConcurrency || 8) <= 2;
  const forced = () => !!window.RoshdForceMotion;
  const reduced = () => !forced() && (mq.matches || document.documentElement.hasAttribute('data-reduce-motion'));

  const css = `
@keyframes ra-pulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.55}50%{transform:translate(-50%,-50%) scale(1.9);opacity:0}}
@keyframes ra-ping{0%{transform:scale(.4);opacity:.6}80%,100%{transform:scale(2.4);opacity:0}}
@keyframes ra-breathe{0%,100%{opacity:.75;transform:scaleX(1)}50%{opacity:1;transform:scaleX(1.06)}}
@keyframes ra-drift{0%{transform:translate3d(0,0,0) scale(1)}33%{transform:translate3d(-10%,6%,0) scale(1.08)}66%{transform:translate3d(6%,-4%,0) scale(.96)}100%{transform:translate3d(0,0,0) scale(1)}}
@keyframes ra-shimmer{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}
@keyframes ra-shine{0%{transform:translateX(140%)}16%,100%{transform:translateX(-240%)}}
@keyframes ra-marquee{from{transform:translateX(0)}to{transform:translateX(50%)}}
@keyframes ra-wave{from{transform:translateX(0)}to{transform:translateX(-25px)}}
@keyframes ra-trace{0%{stroke-dasharray:1;stroke-dashoffset:1}40%,75%{stroke-dasharray:1;stroke-dashoffset:0}100%{stroke-dasharray:1;stroke-dashoffset:-1}}
@keyframes ra-bar{0%,100%{transform:scaleY(.6)}50%{transform:scaleY(1)}}
@keyframes ra-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes ra-flow{from{stroke-dasharray:.06 .94;stroke-dashoffset:0}to{stroke-dasharray:.06 .94;stroke-dashoffset:-1}}
@keyframes ra-node{0%{transform:scale(1);opacity:.8}80%,100%{transform:scale(2.6);opacity:0}}
@keyframes ra-dash{from{stroke-dashoffset:0}to{stroke-dashoffset:-1}}
@media (prefers-reduced-motion: reduce){:root:not([data-force-motion]) *,:root:not([data-force-motion]) *::before,:root:not([data-force-motion]) *::after{animation:none!important;transition-duration:0s!important;scroll-behavior:auto!important}}
[data-reduce-motion] *{animation:none!important;transition-duration:0s!important}`;
  const st = document.createElement('style');
  st.id = 'ra-fx';
  st.textContent = css;
  if (window.RoshdForceMotion) document.documentElement.setAttribute('data-force-motion', '');
  document.head.appendChild(st);

  const ANIMS = {
    pulse: 'ra-pulse 2.8s cubic-bezier(0.65,0,0.35,1) infinite',
    ping: 'ra-ping 3.2s cubic-bezier(0.22,1,0.36,1) infinite',
    breathe: 'ra-breathe 7s ease-in-out infinite',
    drift: 'ra-drift 14s ease-in-out infinite',
    shimmer: 'ra-shimmer 1.6s linear infinite',
    shimmerSlow: 'ra-shimmer 4.2s cubic-bezier(0.65,0,0.35,1) infinite',
    shine: 'ra-shine 6s ' + EASE_STATE + ' infinite 1.2s',
    dash: 'ra-dash 24s linear infinite',
    wave: 'ra-wave 1.4s linear infinite',
    trace: 'ra-trace 3.6s cubic-bezier(0.65,0,0.35,1) infinite',
    bar: 'ra-bar 2.8s cubic-bezier(0.65,0,0.35,1) infinite',
    float: 'ra-float 3s ease-in-out infinite',
    flow: 'ra-flow 3.2s linear infinite',
    node: 'ra-node 2.4s cubic-bezier(0.22,1,0.36,1) infinite',
  };

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      show(e.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -5% 0px' });

  function delayOf(el) {
    let d = +el.dataset.delay || 0;
    const p = el.parentElement && el.parentElement.closest('[data-stagger]');
    if (p && !el.dataset.delay) {
      const kids = Array.from(p.querySelectorAll(':scope > [data-reveal], :scope > * > [data-reveal]'));
      const i = kids.indexOf(el);
      if (i > 0) d += i * (+p.dataset.stagger || 70);
    }
    return d;
  }

  function prep(el) {
    const mode = el.dataset.reveal || 'fade';
    const dur = +el.dataset.dur || (mode === 'wipe' ? 1200 : mode === 'pop' ? 420 : 600);
    const delay = delayOf(el);
    if (mode === 'words') {
      const words = [];
      const walk = (node) => {
        Array.from(node.childNodes).forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach((w) => {
              if (!w) return;
              if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
              const s = document.createElement('span');
              s.textContent = w;
              s.style.display = 'inline-block';
              frag.appendChild(s);
              words.push(s);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1) walk(n);
        });
      };
      walk(el);
      el._words = words;
      words.forEach((w, i) => {
        w.style.opacity = '0';
        w.style.transform = 'translateY(12px)';
        w.style.filter = 'blur(6px)';
        w.style.transition = `opacity ${dur}ms ${EASE_IN} ${delay + i * 45}ms, transform ${dur}ms ${EASE_IN} ${delay + i * 45}ms, filter ${dur}ms ${EASE_IN} ${delay + i * 45}ms`;
      });
      return;
    }
    const t = `${dur}ms ${EASE_IN} ${delay}ms`;
    if (mode === 'wipe') {
      el.style.clipPath = 'inset(0 0 0 100%)';
      el.style.transition = `clip-path ${t}`;
    } else if (mode === 'grow-y') {
      el.style.transformOrigin = 'top';
      el.style.transform = 'scaleY(0)';
      el.style.transition = `transform ${t}`;
    } else if (mode === 'pop') {
      el.style.opacity = '0';
      el.style.transform = (el.dataset.base || '') + ' scale(.6)';
      el.style.transition = `opacity ${t}, transform ${t}`;
    } else {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.filter = 'blur(6px)';
      el.style.transition = `opacity ${t}, transform ${t}, filter ${t}`;
    }
  }

  function show(el) {
    if (el.hasAttribute('data-draw')) { el.style.strokeDashoffset = '0'; return; }
    if (el.hasAttribute('data-ticker')) { tick(el); return; }
    const mode = el.dataset.reveal || 'fade';
    if (mode === 'words') {
      (el._words || []).forEach((w) => { w.style.opacity = '1'; w.style.transform = 'none'; w.style.filter = 'none'; });
      return;
    }
    if (mode === 'wipe') el.style.clipPath = 'inset(0 0 0 0)';
    else if (mode === 'grow-y') el.style.transform = 'scaleY(1)';
    else if (mode === 'pop') { el.style.opacity = '1'; el.style.transform = (el.dataset.base || '') + ' scale(1)'; }
    else { el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none'; }
    // release filter so text renders crisp after the fade
    setTimeout(() => { if (mode === 'fade') el.style.filter = ''; }, (+el.dataset.dur || 600) + delayOf(el) + 50);
  }

  function draw(el) {
    el.style.strokeDasharray = '1';
    el.style.strokeDashoffset = '1';
    el.style.transition = `stroke-dashoffset ${+el.dataset.dur || 900}ms ${EASE_IN} ${+el.dataset.delay || 0}ms`;
  }

  /* ---------- ticker ---------- */
  function tick(el) {
    const to = +el.dataset.ticker, pre = el.dataset.prefix || '', dur = +el.dataset.dur || 1200;
    const t0 = performance.now() + (+el.dataset.delay || 0);
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const v = Math.round(to * (1 - Math.pow(1 - p, 3)));
      el.textContent = pre + fa(v);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = pre + fa(0);
    requestAnimationFrame(step);
  }

  /* ---------- text loop (word level) ---------- */
  function loop(el) {
    const words = el.dataset.loop.split('|');
    let i = 0;
    // animate the element itself (not a child) so background-clip:text gradients stay intact
    const inner = el;
    inner.style.display = 'inline-block';
    inner.style.transition = `opacity 320ms ${EASE_STATE}, transform 320ms ${EASE_STATE}, filter 320ms ${EASE_STATE}`;
    inner.textContent = words[0];
    setInterval(() => {
      if (document.hidden || reduced()) return;
      inner.style.opacity = '0'; inner.style.transform = 'translateY(-35%)'; inner.style.filter = 'blur(6px)';
      setTimeout(() => {
        i = (i + 1) % words.length;
        inner.textContent = words[i];
        inner.style.transition = 'none';
        inner.style.transform = 'translateY(35%)';
        void inner.offsetWidth;
        inner.style.transition = `opacity 420ms ${EASE_IN}, transform 420ms ${EASE_IN}, filter 420ms ${EASE_IN}`;
        inner.style.opacity = '1'; inner.style.transform = 'none'; inner.style.filter = 'none';
      }, 330);
    }, 2800);
  }

  /* ---------- spotlight + zoom ---------- */
  function spotlight(el) {
    const spot = el.querySelector('[data-spot]');
    const zoom = el.querySelector('[data-zoom]');
    if (zoom) zoom.style.transition = `transform 500ms ${EASE_IN}`;
    if (spot) spot.style.transition = 'opacity 200ms ease';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
    });
    el.addEventListener('pointerenter', () => { if (spot) spot.style.opacity = '1'; if (zoom && !reduced()) zoom.style.transform = 'scale(1.04)'; });
    el.addEventListener('pointerleave', () => { if (spot) spot.style.opacity = '0'; if (zoom) zoom.style.transform = 'scale(1)'; });
  }

  /* ---------- marquee (RTL: enters at left edge, travels right) ---------- */
  function marquee(el) {
    const track = el.querySelector('[data-track]');
    if (!track) return;
    if (reduced()) {
      track.style.flexWrap = 'wrap';
      track.style.width = 'auto';
      Array.from(track.children).forEach((c) => (c.style.flexWrap = 'wrap'));
      el.querySelectorAll('[data-dup]').forEach((d) => (d.style.display = 'none'));
      el.style.maskImage = el.style.webkitMaskImage = 'none';
      return;
    }
    track.style.animation = `ra-marquee ${+el.dataset.speed || 48}s linear infinite`;
    const pause = (p) => () => (track.style.animationPlayState = p ? 'paused' : 'running');
    el.addEventListener('pointerenter', pause(true));
    el.addEventListener('pointerleave', pause(false));
    el.addEventListener('focusin', pause(true));
    el.addEventListener('focusout', pause(false));
  }

  /* ---------- sonar grid ---------- */
  const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
  function sonar(cv) {
    const host = cv.parentElement;
    const dot = hex(cv.dataset.dot || '#D08A4E'), ring = hex(cv.dataset.ring || '#D08A4E');
    const base = +cv.dataset.alpha || 0.2, gap = +cv.dataset.gap || 26;
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, last = 0;
    const rings = [];
    const still = reduced() || lowPower();
    function size() {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame(now) {
      ctx.clearRect(0, 0, w, h);
      for (let i = rings.length - 1; i >= 0; i--) if (now - rings[i].t > 4200) rings.splice(i, 1);
      const cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * gap + (w % gap) / 2, py = y * gap + gap / 2;
          let boost = 0;
          for (const r of rings) {
            const age = (now - r.t) / 4200, rad = age * r.max;
            const d = Math.abs(Math.hypot(px - r.x, py - r.y) - rad);
            if (d < 34) boost = Math.max(boost, (1 - d / 34) * (1 - age));
          }
          const wave = still ? 0 : 0.07 * Math.sin(px * 0.018 + py * 0.012 - now * 0.0016);
          const a = Math.max(0, base + wave + boost * 0.75);
          ctx.fillStyle = boost > 0.05 ? `rgba(${ring[0]},${ring[1]},${ring[2]},${a})` : `rgba(${dot[0]},${dot[1]},${dot[2]},${a})`;
          ctx.beginPath(); ctx.arc(px, py, 1.1 + boost * 1.6, 0, 6.283); ctx.fill();
        }
      }
      for (const r of rings) {
        const age = (now - r.t) / 4200;
        ctx.strokeStyle = `rgba(${ring[0]},${ring[1]},${ring[2]},${0.28 * (1 - age)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, age * r.max, 0, 6.283); ctx.stroke();
      }
    }
    function loopFn(now) {
      raf = 0;
      if (!cv.isConnected) return;
      if (!visible || document.hidden) return;
      if (now - last > 1500) {
        last = now;
        // ambient pings biased toward the inline-end (left) half where the visual sits
        rings.push({ x: w * (0.08 + Math.random() * 0.5), y: h * (0.2 + Math.random() * 0.65), t: now, max: Math.max(w, h) * 0.55 });
      }
      frame(now);
      raf = requestAnimationFrame(loopFn);
    }
    const start = () => { if (!raf && !still) raf = requestAnimationFrame(loopFn); };
    size();
    if (still) {
      // designed static frame: two frozen rings
      const n = performance.now();
      rings.push({ x: w * 0.3, y: h * 0.55, t: n - 1500, max: Math.max(w, h) * 0.55 });
      rings.push({ x: w * 0.18, y: h * 0.3, t: n - 2600, max: Math.max(w, h) * 0.55 });
      frame(n);
    } else {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }).observe(host);
      document.addEventListener('visibilitychange', start);
      host.addEventListener('pointerdown', (e) => {
        const r = cv.getBoundingClientRect();
        rings.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), max: Math.max(w, h) * 0.45 });
        start();
      });
      start();
    }
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); if (still) frame(performance.now()); }, 150); });
  }

  /* ---------- floating paths ---------- */
  function paths(svg) {
    const ns = 'http://www.w3.org/2000/svg';
    const col = svg.dataset.paths || '#D08A4E';
    svg.setAttribute('viewBox', '0 0 696 316');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    [1, -1].forEach((pos) => {
      for (let i = 0; i < 30; i++) {
        const p = document.createElementNS(ns, 'path');
        const a = i * 5 * pos, b = i * 6;
        p.setAttribute('d', `M-${380 - a} -${189 + b}C-${380 - a} -${189 + b} -${312 - a} ${216 - b} ${152 - a} ${343 - b}C${616 - a} ${470 - b} ${684 - a} ${875 - b} ${684 - a} ${875 - b}`);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', i % 3 === 0 ? '#D08A4E' : col);
        p.setAttribute('stroke-width', String(0.5 + i * 0.03));
        p.setAttribute('stroke-opacity', String(0.06 + i * 0.012));
        p.setAttribute('pathLength', '1');
        if (!reduced()) {
          p.style.strokeDasharray = '0.6 0.4';
          p.style.animation = `ra-dash ${20 + (i % 7) * 2.5}s linear infinite`;
        }
        svg.appendChild(p);
      }
    });
  }

  /* ---------- scroll-linked rail ---------- */
  const rails = [];
  function rail(el) {
    if (el.dataset.rail !== 'auto' || reduced()) { rails.push(el); onScroll(); return; }
    const STEP = 950, HOLD = 2200;
    let t0 = 0, raf = 0, visible = false;
    const run = (now) => {
      raf = 0;
      if (!el.isConnected || !visible || document.hidden) return;
      const steps = el.querySelectorAll('[data-step]'), n = Math.max(1, steps.length - 1);
      if (!t0) t0 = now;
      const cyc = n * STEP + HOLD, t = (now - t0) % cyc;
      const raw = Math.min(1, t / (n * STEP));
      // ease within each segment so the fill "arrives" at each dot
      const seg = Math.min(n - 1, Math.floor(raw * n)), f = raw * n - seg;
      const e = raw >= 1 ? 1 : (seg + (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2)) / n;
      setRail(el, e, t < 120 && now - t0 > cyc);
      raf = requestAnimationFrame(run);
    };
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) { t0 = 0; raf = requestAnimationFrame(run); } }, { threshold: 0.3 }).observe(el);
    document.addEventListener('visibilitychange', () => { if (visible && !raf) raf = requestAnimationFrame(run); });
  }
  function setRail(el, p, resetting) {
    const fill = el.querySelector('[data-rail-fill]');
    if (fill) {
      const vertical = fill.offsetHeight > fill.offsetWidth;
      fill.style.transformOrigin = vertical ? 'top' : 'right';
      fill.style.transform = vertical ? `scaleY(${p})` : `scaleX(${p})`;
    }
    const steps = el.querySelectorAll('[data-step]'), n = Math.max(1, steps.length - 1);
    const cur = Math.round(p * n - 0.49);
    steps.forEach((s, i) => {
      const on = p >= i / n - 0.02, now = on && i === Math.min(steps.length - 1, Math.max(0, Math.floor(p * n + 0.02)));
      s.style.transition = 'opacity 350ms ' + EASE_STATE + ', transform 350ms ' + EASE_STATE;
      s.style.opacity = on ? '1' : '0.45';
      s.style.transform = now ? 'translateY(-4px)' : 'none';
      const d = s.querySelector('[data-dot]');
      if (d) {
        d.style.transition = 'transform 350ms ' + EASE_STATE + ', box-shadow 350ms ' + EASE_STATE + ', background 350ms, color 350ms';
        d.style.transform = now ? 'scale(1.12)' : on ? 'scale(1)' : 'scale(.86)';
        d.style.boxShadow = now ? '0 0 0 8px rgba(208,138,78,.22), 0 0 32px rgba(208,138,78,.8)' : on ? '0 0 0 4px rgba(208,138,78,.14)' : 'none';
        d.style.background = on ? '#D08A4E' : '#0B0E12';
        d.style.color = on ? '#111418' : '#EDEFF2';
      }
    });
  }
  function progressBar(el) { el.style.transformOrigin = 'right'; rails.push(el); onScroll(); }
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = window.innerHeight;
      rails.forEach((el) => {
        if (!el.isConnected) return;
        if (el.hasAttribute('data-progress')) {
          const doc = document.documentElement;
          const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, doc.scrollHeight - vh)));
          el.style.transform = `scaleX(${p})`;
          return;
        }
        const r = el.getBoundingClientRect();
        let p = reduced() ? 1 : Math.min(1, Math.max(0, (vh * 0.8 - r.top) / (r.height * 0.9)));
        const fill = el.querySelector('[data-rail-fill]');
        if (fill) {
          const vertical = fill.offsetHeight > fill.offsetWidth;
          fill.style.transformOrigin = vertical ? 'top' : 'right';
          fill.style.transform = vertical ? `scaleY(${p})` : `scaleX(${p})`;
        }
        const steps = el.querySelectorAll('[data-step]');
        steps.forEach((s, i) => {
          const on = p >= (steps.length === 1 ? 0 : i / (steps.length - 1)) - 0.02;
          s.style.opacity = on ? '1' : '0.5';
          s.style.transition = `opacity 350ms ${EASE_STATE}`;
          const d = s.querySelector('[data-dot]');
          if (d) {
            d.style.transition = `transform 350ms ${EASE_STATE}, box-shadow 350ms ${EASE_STATE}`;
            d.style.transform = on ? 'scale(1)' : 'scale(.86)';
            d.style.boxShadow = on ? '0 0 0 6px rgba(208,138,78,.18), 0 0 24px rgba(208,138,78,.55)' : 'none';
            d.style.background = on ? '#D08A4E' : '#0B0E12';
            d.style.color = on ? '#111418' : '#EDEFF2';
          }
        });
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ---------- init ---------- */
  function init(root) {
    const R = reduced();
    if (document.querySelector('[data-auto-reveal]')) {
      document.querySelectorAll('main > section').forEach((sec) => {
        const pick = (el, depth) => {
          Array.from(el.children).forEach((c, i) => {
            if (c.hasAttribute('data-reveal') || c.hasAttribute('data-fx') || c.tagName === 'SCRIPT') return;
            const cs = getComputedStyle(c);
            const isGroup = (cs.display === 'grid' || (cs.display === 'flex' && cs.flexDirection !== 'row')) && c.children.length > 1 && depth < 2;
            if (isGroup && !/^(H\d|P|A|BUTTON|FORM|DL|UL|OL)$/.test(c.tagName)) { pick(c, depth + 1); return; }
            if (cs.position === 'absolute') return;
            c.setAttribute('data-reveal', '');
            if (!c.dataset.delay) c.dataset.delay = String(Math.min(i, 6) * 70);
          });
        };
        pick(sec, 0);
      });
    }
    root.querySelectorAll('[data-reveal]:not([data-fx])').forEach((el) => {
      el.setAttribute('data-fx', '');
      if (R) return;
      prep(el);
      if ((el.dataset.reveal || '') === 'wipe' && el.parentElement) {
        // fully clipped targets never report intersection — watch the parent instead
        const o = new IntersectionObserver((es) => { if (es[0].isIntersecting) { o.disconnect(); show(el); } }, { threshold: 0.2 });
        o.observe(el.parentElement);
      } else io.observe(el);
    });
    root.querySelectorAll('[data-draw]:not([data-fx])').forEach((el) => {
      el.setAttribute('data-fx', '');
      if (R) return;
      draw(el); io.observe(el);
    });
    root.querySelectorAll('[data-ticker]:not([data-fx])').forEach((el) => {
      el.setAttribute('data-fx', '');
      if (R) return;
      io.observe(el);
    });
    root.querySelectorAll('[data-loop]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); if (!R) loop(el); });
    root.querySelectorAll('[data-anim]:not([data-fx])').forEach((el) => {
      el.setAttribute('data-fx', '');
      if (R) return;
      const a = el.dataset.anim;
      if (a === 'drift' && lowPower()) return;
      el.style.animation = ANIMS[a] || '';
      if (el.dataset.animDelay) el.style.animationDelay = el.dataset.animDelay;
    });
    root.querySelectorAll('[data-spotlight]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); spotlight(el); });
    root.querySelectorAll('[data-marquee]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); marquee(el); });
    root.querySelectorAll('canvas[data-sonar]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); sonar(el); });
    root.querySelectorAll('svg[data-paths]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); paths(el); });
    root.querySelectorAll('[data-rail]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); rail(el); });
    root.querySelectorAll('[data-progress]:not([data-fx])').forEach((el) => { el.setAttribute('data-fx', ''); progressBar(el); });
  }

  let t;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => init(document), 30); };
  const boot = () => {
    init(document);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);

  /* ---------- intro: logo → growing network → matrix reveal ---------- */
  function intro(opts) {
    opts = opts || {};
    if (window.__raIntro) return;
    window.__raIntro = true;
    let force = false;
    try { force = new URLSearchParams(location.search).get('intro') === '1'; } catch (e) {}
    if (reduced()) return;
    // shown on every load (review build). To limit to once per session, restore the sessionStorage check.
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;cursor:pointer';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const logoBox = document.createElement('div');
    logoBox.style.cssText = 'position:absolute;left:50%;top:50%;width:200px;height:212px;margin:-106px 0 0 -100px;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.7);transition:opacity 600ms ' + EASE_IN + ',transform 700ms ' + EASE_IN + ',filter 500ms';
    const img = document.createElement('img');
    img.src = opts.logo || 'assets/logo.png';
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1) drop-shadow(0 0 18px rgba(231,179,134,.55)) drop-shadow(0 0 42px rgba(231,179,134,.55))';
    logoBox.appendChild(img);
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'رد شدن';
    skip.style.cssText = 'position:absolute;left:20px;bottom:20px;height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(231,179,134,.35);background:rgba(0,0,0,.6);color:#C3C9D2;font:600 13px Vazirmatn,Tahoma,sans-serif;cursor:pointer';
    wrap.append(cv, logoBox, skip);
    document.documentElement.appendChild(wrap);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H / 2;
    const small = W < 768;

    // network: grows from just above the logo, space-filling via min-distance rejection
    const T0 = 750, SPEED = small ? 0.5 : 0.62, MIN = small ? 34 : 40;
    const nodes = [{ x: cx, y: cy - 112, t: T0, a: -Math.PI / 2, d: 0 }];
    const edges = [];
    const cell = MIN, grid = new Map();
    const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    const near = (x, y) => {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const b = grid.get((gx + i) + ',' + (gy + j));
        if (b) for (const n of b) if (Math.hypot(n.x - x, n.y - y) < MIN) return true;
      }
      // keep the logo tile clear
      return Math.abs(x - cx) < 116 && Math.abs(y - cy) < 118;
    };
    const put = (n) => { const k = key(n.x, n.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); };
    put(nodes[0]);
    let q = [nodes[0]], maxT = T0;
    const LIMIT = small ? 260 : 520;
    while (q.length && nodes.length < LIMIT) {
      const next = [];
      for (const p of q) {
        const kids = p.d < 2 ? 3 : 2;
        for (let k = 0; k < kids; k++) {
          const spread = p.d === 0 ? 2.4 : 1.5;
          const a = p.a + (Math.random() - 0.5) * spread + (k - (kids - 1) / 2) * 0.7;
          const len = MIN * (1.15 + Math.random() * 0.9);
          const x = p.x + Math.cos(a) * len, y = p.y + Math.sin(a) * len;
          if (x < -40 || x > W + 40 || y < -40 || y > H + 40 || near(x, y)) continue;
          const n = { x, y, t: p.t + len / SPEED, a, d: p.d + 1 };
          nodes.push(n); put(n); edges.push([p, n]); next.push(n);
          maxT = Math.max(maxT, n.t);
        }
      }
      q = next.sort(() => Math.random() - 0.5);
    }
    // a few cross-links for a mesh feel
    for (let i = 0; i < nodes.length; i += 3) {
      const n = nodes[i];
      const gx = Math.floor(n.x / cell), gy = Math.floor(n.y / cell);
      const b = grid.get((gx + 1) + ',' + gy) || grid.get(gx + ',' + (gy + 1));
      if (b && b[0] !== n) edges.push([n, b[0], true]);
    }

    const growEnd = Math.min(maxT, T0 + (small ? 1500 : 1900));
    const REVEAL = growEnd + 250;
    const CS = small ? 36 : 46;
    const cols = Math.ceil(W / CS), rows = Math.ceil(H / CS);
    const maxD = Math.hypot(cx, cy);
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * CS, y = r * CS;
      const d = Math.hypot(x + CS / 2 - cx, y + CS / 2 - cy) / maxD;
      cells.push({ x, y, t: REVEAL + d * 850 + Math.random() * 260 });
    }
    const END = REVEAL + 850 + 260 + 220;

    let raf, t0 = performance.now(), done = false;
    requestAnimationFrame(() => { logoBox.style.opacity = '1'; logoBox.style.transform = 'scale(1)'; });

    function finish() {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      wrap.style.transition = 'opacity 300ms ' + EASE_STATE;
      wrap.style.opacity = '0';
      document.documentElement.style.overflow = prevOverflow;
      setTimeout(() => wrap.remove(), 320);
    }
    wrap.addEventListener('click', finish);
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { finish(); document.removeEventListener('keydown', k); } });

    let logoOut = false;
    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      // background
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxD);
      g.addColorStop(0, '#15191F'); g.addColorStop(1, '#0B0E12');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // edges
      ctx.lineCap = 'round';
      for (const [a, b, cross] of edges) {
        const st = cross ? Math.max(a.t, b.t) : a.t, en = cross ? st + 260 : b.t;
        if (t < st) continue;
        const p = Math.min(1, (t - st) / (en - st));
        ctx.strokeStyle = cross ? 'rgba(231,179,134,0.16)' : 'rgba(231,179,134,' + (0.5 - Math.min(0.3, b.d * 0.025)) + ')';
        ctx.lineWidth = cross ? 0.8 : 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p); ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        if (t < n.t) continue;
        const age = t - n.t;
        const pop = Math.min(1, age / 220);
        const r = (n.d % 5 === 0 ? 3.2 : 2) * (0.6 + 0.4 * pop);
        if (age < 400) { ctx.fillStyle = 'rgba(208,138,78,' + (0.35 * (1 - age / 400)) + ')'; ctx.beginPath(); ctx.arc(n.x, n.y, r + 10 * (age / 400), 0, 6.283); ctx.fill(); }
        ctx.fillStyle = n.d % 5 === 0 ? '#D08A4E' : '#F0CBA6';
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.283); ctx.fill();
      }
      // matrix reveal: tiles open from the logo outward
      if (t >= REVEAL) {
        if (!logoOut) { logoOut = true; logoBox.style.transition = 'opacity 450ms ' + EASE_STATE + ',transform 600ms ' + EASE_IN + ',filter 450ms'; logoBox.style.opacity = '0'; logoBox.style.transform = 'scale(1.25)'; logoBox.style.filter = 'blur(6px)'; skip.style.opacity = '0'; }
        for (const c of cells) {
          if (t < c.t - 140) continue;
          if (t < c.t) { ctx.fillStyle = 'rgba(208,138,78,' + (0.45 * (1 - (c.t - t) / 140)) + ')'; ctx.fillRect(c.x + 1, c.y + 1, CS - 2, CS - 2); continue; }
          ctx.clearRect(c.x, c.y, CS, CS);
          const age = t - c.t;
          if (age < 260) { ctx.strokeStyle = 'rgba(231,179,134,' + (0.7 * (1 - age / 260)) + ')'; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, CS - 1, CS - 1); }
        }
      }
      if (t >= END) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  window.RoshdFX = { init, reduced, lowPower, fa, intro };
  if (window.RoshdIntro) intro(typeof window.RoshdIntro === 'object' ? window.RoshdIntro : {});
})();
