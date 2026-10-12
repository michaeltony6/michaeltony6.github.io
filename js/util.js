/* Shared helpers for the canvas demos. */
window.MT = (() => {
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const reduced = !!mq.matches;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const C = {};
  ['bg', 'bg-2', 'bg-3', 'line', 'line-2', 'fg', 'fg-2', 'fg-3', 'copper', 'signal', 'alert'].forEach((k) => {
    C[k.replace('-', '')] = css('--' + k);
  });

  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* Size a canvas to its CSS box at device resolution. Returns the 2D context in CSS pixels. */
  function fit(canvas, maxDpr = 2) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  /* Run frame(dt, t) on rAF only while el is on screen and the tab is visible. */
  function loop(el, frame) {
    let raf = 0, last = 0, onScreen = false;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      frame(dt, now / 1000);
    };
    const start = () => { if (!raf && onScreen && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? start() : stop(); }, { rootMargin: '120px 0px' });
    io.observe(el);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    return { get running() { return !!raf; } };
  }

  /* Call fn when el's size changes (debounced to one frame). */
  function onResize(el, fn) {
    let pending = false, lastW = 0, lastH = 0;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (Math.abs(width - lastW) < 1 && Math.abs(height - lastH) < 1) return;
      lastW = width; lastH = height;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; fn(); });
    });
    ro.observe(el);
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { reduced, C, rgba, fit, loop, onResize, rng, clamp, lerp, ease, roundRect };
})();
