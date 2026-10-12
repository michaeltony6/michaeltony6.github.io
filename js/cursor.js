/* Cursor trail: the normal pointer leaves a short PCB-style trace behind it.
   Each segment is routed like a board trace (45° first, then straight), fades
   from the accent color to teal, and ends in a via. Mouse only; nothing is drawn
   for touch, pens or reduced motion. */
(() => {
  const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine || MT.reduced) return;
  const { C } = MT;

  const cv = document.createElement('canvas');
  cv.className = 'probe';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const A = hex(C.accent), B = hex(C.signal);
  const mix = (t, a) => `rgba(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)},${a})`;

  const TTL = 380, STEP = 14, MAX_PTS = 9;
  const pts = [];
  const m = { x: 0, y: 0, on: false };
  let W = 0, H = 0, raf = 0;

  function size() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    kick();
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const hide = () => { m.on = false; pts.length = 0; kick(); };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { if (m.on) hide(); return; }
    m.x = e.clientX; m.y = e.clientY;
    if (!m.on) { m.on = true; pts.length = 0; }
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) > STEP) pts.push({ x: m.x, y: m.y, t: performance.now() });
    kick();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', hide);
  document.addEventListener('mouseover', (e) => { if (e.target.tagName === 'IFRAME') hide(); });   // events stop at embedded graphs
  window.addEventListener('blur', hide);
  window.addEventListener('resize', size);

  // board-style routing: diagonal for the shorter leg, then straight
  const knee = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.min(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
  };

  function frame(now) {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    while (pts.length && (now - pts[0].t > TTL || pts.length > MAX_PTS)) pts.shift();
    if (!pts.length) return;

    const chain = m.on ? pts.concat([{ x: m.x, y: m.y, t: now }]) : pts;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      const age = Math.min(1, (now - a.t) / TTL);
      if (age >= 1) continue;
      const k = knee(a, b);
      ctx.strokeStyle = mix(age, (1 - age) * 0.9);
      ctx.lineWidth = 0.8 + 1.6 * (1 - age);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(k.x, k.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (chain.length > 1) {            // via at the tail
      const t = chain[0], age = Math.min(1, (now - t.t) / TTL);
      ctx.strokeStyle = mix(1, (1 - age) * 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(t.x, t.y, 2.6, 0, 6.283); ctx.stroke();
    }
    kick();
  }

  size();
})();
