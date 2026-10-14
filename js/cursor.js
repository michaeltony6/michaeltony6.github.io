/* Gold cursor: a metallic arrow whose highlight shifts with its position on the
   screen (as if lit from the top left), trailed by a short gold "bond wire"
   routed like a PCB trace (45° first, then straight) that ends in a via.
   Mouse only; touch, pens and reduced motion keep the system cursor. */
(() => {
  const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine || MT.reduced) return;

  const cv = document.createElement('canvas');
  cv.className = 'probe';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  document.documentElement.classList.add('has-probe');

  const TTL = 380, STEP = 14, MAX_PTS = 9;
  const INTERACTIVE = 'a, button, input, label, select, summary, [role="button"], .tr-canvas';
  const ARROW = [[0, 0], [0, 16.6], [4.1, 12.9], [6.9, 19.3], [9.6, 18.1], [6.9, 11.8], [12.2, 11.8]];
  const pts = [];
  const m = { x: -99, y: -99, on: false, vx: 0 };
  let W = 0, H = 0, raf = 0, hover = 0, hoverT = 0, press = 0, pressT = 0, tilt = 0;

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
    m.vx = m.vx * 0.6 + (e.clientX - m.x) * 0.4;
    m.x = e.clientX; m.y = e.clientY;
    if (!m.on) { m.on = true; pts.length = 0; m.vx = 0; }
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) > STEP) pts.push({ x: m.x, y: m.y, t: performance.now() });
    hoverT = e.target.closest && e.target.closest(INTERACTIVE) ? 1 : 0;
    kick();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', hide);
  document.addEventListener('mouseover', (e) => { if (e.target.tagName === 'IFRAME') hide(); });   // embedded graphs draw their own cursor
  window.addEventListener('blur', hide);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { pressT = 1; kick(); } });
  window.addEventListener('pointerup', () => { pressT = 0; kick(); });
  window.addEventListener('resize', size);

  const knee = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.min(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
  };
  const wire = (a, k, b, w, alpha) => {           // dark edge, gold body, bright core
    const path = () => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(k.x, k.y); ctx.lineTo(b.x, b.y); };
    path(); ctx.strokeStyle = `rgba(58, 36, 6, ${alpha})`; ctx.lineWidth = w + 1.6; ctx.stroke();
    path(); ctx.strokeStyle = `rgba(214, 160, 58, ${alpha})`; ctx.lineWidth = w; ctx.stroke();
    ctx.save(); ctx.translate(-0.35, -0.45);
    path(); ctx.strokeStyle = `rgba(255, 241, 196, ${alpha * 0.9})`; ctx.lineWidth = Math.max(0.6, w * 0.34); ctx.stroke();
    ctx.restore();
  };

  function drawTrail(now) {
    const chain = m.on ? pts.concat([{ x: m.x, y: m.y, t: now }]) : pts;
    if (chain.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const segs = [];
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      const age = Math.min(1, (now - a.t) / TTL);
      if (age >= 1) continue;
      const k = knee(a, b);
      wire(a, k, b, 1 + 2.4 * (1 - age), 1 - age);
      segs.push({ a, k, b, age });
    }
    // via at the tail
    const t = chain[0], age = Math.min(1, (now - t.t) / TTL);
    if (age < 1) {
      ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(58, 36, 6, ${1 - age})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, 6.283); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(240, 202, 104, ${1 - age})`; ctx.stroke();
    }
    // a glint that runs down the wire, head to tail
    if (segs.length) {
      const s = segs[Math.floor(((now % 650) / 650) * segs.length)];
      const g = (1 - s.age) * 0.9;
      if (g > 0.05) {
        const x = (s.k.x + s.b.x) / 2, y = (s.k.y + s.b.y) / 2;
        ctx.fillStyle = `rgba(255, 252, 235, ${g})`;
        ctx.beginPath(); ctx.moveTo(x, y - 3.2); ctx.lineTo(x + 0.8, y - 0.8); ctx.lineTo(x + 3.2, y); ctx.lineTo(x + 0.8, y + 0.8);
        ctx.lineTo(x, y + 3.2); ctx.lineTo(x - 0.8, y + 0.8); ctx.lineTo(x - 3.2, y); ctx.lineTo(x - 0.8, y - 0.8); ctx.fill();
      }
    }
  }

  function drawArrow() {
    const s = (1 + hover * 0.12) * (1 - press * 0.12);
    ctx.save();
    ctx.translate(m.x, m.y);
    if (hover > 0.02) {                      // lit halo when over something clickable
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      g.addColorStop(0, `rgba(255, 226, 140, ${0.32 * hover})`); g.addColorStop(1, 'rgba(255, 226, 140, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.283); ctx.fill();
    }
    ctx.rotate(tilt);
    ctx.scale(s, s);
    ctx.beginPath();
    ARROW.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    // metal: fixed light at the top left of the screen, so the highlight slides as you move
    const lx = 1.5 + 7 * (m.x / W), ly = 2 + 10 * (m.y / H);
    const body = ctx.createLinearGradient(lx - 6, ly - 9, lx + 6, ly + 12);
    body.addColorStop(0, '#fff3c6'); body.addColorStop(0.28, '#f0c862'); body.addColorStop(0.44, '#fff0b2');
    body.addColorStop(0.58, '#a8731f'); body.addColorStop(0.7, '#5e3c0d'); body.addColorStop(0.86, '#c99231'); body.addColorStop(1, '#f2cf72');
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = body; ctx.fill();
    ctx.restore();
    const glint = ctx.createRadialGradient(lx, ly, 0, lx, ly, 6);
    glint.addColorStop(0, 'rgba(255, 253, 240, 0.85)'); glint.addColorStop(1, 'rgba(255, 253, 240, 0)');
    ctx.fillStyle = glint; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.3 / s; ctx.strokeStyle = '#1c1205'; ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    while (pts.length && (now - pts[0].t > TTL || pts.length > MAX_PTS)) pts.shift();
    if (MT.trailOff) pts.length = 0;        // the leg demo draws its own trail while it follows the pointer
    hover += (hoverT - hover) * 0.25;
    press += (pressT - press) * 0.35;
    m.vx *= 0.82;
    tilt += (Math.max(-0.22, Math.min(0.22, m.vx * 0.012)) - tilt) * 0.25;
    if (!m.on && !pts.length) return;
    drawTrail(now);
    if (m.on) drawArrow();
    if (pts.length || Math.abs(hoverT - hover) > 0.01 || Math.abs(pressT - press) > 0.01 || Math.abs(tilt) > 0.004) kick();
  }

  size();
})();
