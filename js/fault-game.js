/* Page Fault runner: the 404 page's offline mini game.
   A gold chip runs along a circuit-board trace. Jump the components; stay on the
   ground under high bit flips, jump the low ones (or duck with ↓). The score is the
   program counter, shown in hex. Reach 0x0404 to map the missing page. */
(() => {
  const canvas = document.getElementById('fault-game');
  if (!canvas) return;
  const { C, rgba, reduced } = MT;
  const log = document.getElementById('fault-log');
  const live = document.getElementById('fault-live');
  const led = document.getElementById('fault-led');
  const panel = document.getElementById('fault-panel');
  if (panel) panel.hidden = false;
  if (log) log.hidden = true;                       // the game's start screen shows the same lines

  const KEY = 'mt-fault-best';
  let best = 0;
  try { best = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { /* storage blocked */ }
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const hex = (n) => '0x' + Math.floor(n).toString(16).toUpperCase().padStart(4, '0');

  const G = 2600, JV = 760, CUT = JV * 0.42;
  const NAMES = {
    resistor: 'shorted out on a resistor', cap: 'hit an electrolytic capacitor', bank: 'hit a capacitor bank',
    ic: 'ran into an IC', flipHigh: 'corrupted by a bit flip', flipLow: 'corrupted by a bit flip',
  };

  let W = 0, H = 0, ground = 0, k = 1, dpr = 1, ctx = null;
  let state = 'idle', score = 0, speed = 0, bgX = 0, gX = 0, nextSpawn = 0, deadAt = 0, toast = null, shake = 0;
  let obstacles = [], particles = [], traces = [], tileW = 640, newBest = false, cause = '', mapped404 = false;
  const P = { x: 60, y: 0, vy: 0, ground: true, duck: false, down: false, held: false, t: 0 };

  /* ── sizing + background tile ── */
  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ground = H - 40;
    k = Math.max(0.62, Math.min(1, W / 900));
    P.x = Math.round(Math.max(36, Math.min(90, W * 0.09)));
    buildTraces();
    draw();
  }
  function buildTraces() {
    const r = MT.rng(404);
    traces = [];
    const top = 14, bottom = ground - 26;
    for (let i = 0; i < 12; i++) {
      const y = top + r() * (bottom - top), x0 = r() * tileW, len = 60 + r() * 220;
      const bend = r() < 0.6, dy = (r() < 0.5 ? -1 : 1) * (10 + r() * 22);
      const pts = bend ? [[x0, y], [x0 + len * 0.45, y], [x0 + len * 0.45 + Math.abs(dy), y + dy], [x0 + len, y + dy]] : [[x0, y], [x0 + len, y]];
      traces.push(pts);
    }
  }

  /* ── game control ── */
  function reset() {
    state = 'run'; score = 0; obstacles = []; particles = []; toast = null; newBest = false; mapped404 = false;
    P.y = 0; P.vy = 0; P.ground = true; P.duck = false;
    nextSpawn = W * 0.75;
    MT.trailOff = true;
    if (led) { led.textContent = 'Running'; led.className = 'led on'; }
  }
  function press() {
    if (state === 'idle' || state === 'paused') { if (state === 'idle') reset(); else { state = 'run'; MT.trailOff = true; } return; }
    if (state === 'dead') { if (performance.now() - deadAt > 450) reset(); return; }
    P.held = true;
    if (P.ground && !P.duck) { P.vy = JV; P.ground = false; }
  }
  function release() { P.held = false; if (!P.ground && P.vy > CUT) P.vy = CUT; }
  function die(o) {
    state = 'dead'; deadAt = performance.now(); cause = NAMES[o.type]; MT.trailOff = false;
    const s = Math.floor(score);
    if (s > best) { best = s; newBest = true; try { localStorage.setItem(KEY, String(best)); } catch (e) { /* ignore */ } }
    if (!reduced) shake = 1;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 260;
      particles.push({ x: P.x + 13, y: ground - P.y - 11, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.6 + Math.random() * 0.5, c: Math.random() < 0.5 ? C.accent : C.alert });
    }
    if (live) live.textContent = `Segmentation fault at ${hex(s)}: ${cause}. Best ${hex(best)}. Press Space or tap to try again.`;
    if (led) { led.textContent = 'SIGSEGV'; led.className = 'led warn'; }
  }
  function pause() { if (state === 'run') { state = 'paused'; MT.trailOff = false; draw(); } }

  /* ── spawning ── */
  function spawn() {
    const s = score, r = Math.random();
    let o;
    if (s > 0x80 && r < 0.24) {
      const low = s > 0x140 && Math.random() < 0.5;
      o = low ? { type: 'flipLow', w: 26, h: 18, y: 15 } : { type: 'flipHigh', w: 26, h: 18, y: 36 };
    } else {
      const g = Math.random();
      if (g < 0.3) o = { type: 'resistor', w: 32, h: 14, y: 0 };
      else if (g < 0.58) o = { type: 'cap', w: 18, h: 32, y: 0 };
      else if (g < 0.82 || s < 0x60) o = { type: 'ic', w: 46, h: 18, y: 0 };
      else o = { type: 'bank', w: 42, h: 32, y: 0 };
    }
    o.x = W + 12; o.t = Math.random() * 10;
    obstacles.push(o);
    nextSpawn = speed * (0.66 + Math.random() * 0.6) + 90 + o.w;
  }

  /* ── update ── */
  function update(dt) {
    P.t += dt;
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt * 3);
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
    if (state !== 'run') return;

    const base = Math.min(820, 340 + score * 0.32);
    speed = base * k;
    const before = Math.floor(score);
    score += (base / 38) * dt;
    const now = Math.floor(score);
    if (Math.floor(now / 256) > Math.floor(before / 256)) toast = { text: `PAGE 0x${(now >> 8).toString(16).toUpperCase().padStart(2, '0')} MAPPED`, t: 1.4 };
    if (!mapped404 && now >= 0x404) { mapped404 = true; toast = { text: '0x0404 MAPPED · PAGE FOUND', t: 2.6, gold: true }; burst(); }

    bgX = (bgX + speed * 0.25 * dt) % tileW;
    gX = (gX + speed * dt) % 48;

    P.duck = P.down && P.ground;
    if (!P.ground) {
      P.vy -= G * dt;
      if (P.down) P.vy = Math.min(P.vy, -900);
      P.y += P.vy * dt;
      if (P.y <= 0) { P.y = 0; P.vy = 0; P.ground = true; }
    }

    nextSpawn -= speed * dt;
    if (nextSpawn <= 0) spawn();
    for (const o of obstacles) { o.x -= speed * dt; o.t += dt; }
    obstacles = obstacles.filter((o) => o.x + o.w > -20);

    const pw = P.duck ? 32 : 26, ph = P.duck ? 13 : 22;
    const px0 = P.x + 3, px1 = P.x + pw - 3, py0 = P.y + 2, py1 = P.y + ph - 2;
    for (const o of obstacles) {
      const inset = o.type.startsWith('flip') ? 4 : 2;
      if (px1 > o.x + inset && px0 < o.x + o.w - inset && py1 > o.y + inset && py0 < o.y + o.h - inset) { die(o); break; }
    }
  }
  function burst() {
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI * Math.random(), v = 120 + Math.random() * 280;
      particles.push({ x: P.x + 13, y: ground - P.y - 11, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 0.6, c: Math.random() < 0.6 ? C.accent : C.signal });
    }
  }

  /* ── drawing ── */
  const mono = (px, weight = 400) => `${weight} ${px}px "IBM Plex Mono", ui-monospace, monospace`;
  function rr(x, y, w, h, r) { MT.roundRect(ctx, x, y, w, h, r); }

  function drawBackground() {
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.fg3, 0.16);
    ctx.fillStyle = rgba(C.fg3, 0.22);
    for (let rep = -1; rep <= Math.ceil(W / tileW); rep++) {
      const ox = rep * tileW - bgX;
      for (const pts of traces) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y) : ctx.moveTo(x + ox, y)));
        ctx.stroke();
        const [ex, ey] = pts[pts.length - 1];
        ctx.beginPath(); ctx.arc(ex + ox, ey, 2.2, 0, 6.283); ctx.fill();
      }
    }
    // board below the trace
    ctx.fillStyle = rgba(C.bg3, 0.9);
    ctx.fillRect(0, ground + 1, W, H - ground);
    ctx.fillStyle = rgba(C.accent, 0.22);
    for (let x = -gX; x < W; x += 48) ctx.fillRect(Math.round(x), ground + 9, 10, 4);
    ctx.fillStyle = rgba(C.fg3, 0.35);
    ctx.font = mono(9);
    ctx.textBaseline = 'alphabetic';
    // power rail
    ctx.strokeStyle = rgba(C.accent, 0.85); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, ground + 0.5); ctx.lineTo(W, ground + 0.5); ctx.stroke();
    // current flowing behind the chip
    if (state === 'run' && P.ground) {
      const g = ctx.createLinearGradient(P.x - 70, 0, P.x + 6, 0);
      g.addColorStop(0, rgba(C.accent, 0)); g.addColorStop(1, rgba(C.accent, 0.9));
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(P.x - 70, ground + 0.5); ctx.lineTo(P.x + 6, ground + 0.5); ctx.stroke();
    }
  }

  function drawPlayer() {
    const pw = P.duck ? 32 : 26, ph = P.duck ? 13 : 22;
    const x = P.x, yb = ground - P.y, y = yb - ph;
    const dead = state === 'dead';
    // legs
    const step = state === 'run' && P.ground ? Math.floor(P.t * 14) % 2 : 0;
    ctx.fillStyle = dead ? C.alert : '#b9bfcc';
    for (let i = 0; i < 3; i++) {
      const lx = x + 4 + i * ((pw - 10) / 2);
      const lift = P.ground ? ((i + step) % 2) * 2 : 0;
      ctx.fillRect(Math.round(lx), Math.round(yb - 3 - lift), 2, 3 + lift);
    }
    // body: metallic gold like the logo
    const g = ctx.createLinearGradient(0, y, 0, yb - 3);
    if (dead) { g.addColorStop(0, '#ff9a8a'); g.addColorStop(1, '#9e2b22'); }
    else { g.addColorStop(0, '#fff0bc'); g.addColorStop(0.3, '#e9bd57'); g.addColorStop(0.5, '#ffefb0'); g.addColorStop(0.62, '#9c6a1f'); g.addColorStop(1, '#d29c38'); }
    rr(x, y, pw, ph - 3, 3); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#3a2406'; ctx.stroke();
    // pin-1 dot + status LED
    ctx.fillStyle = '#3a2406'; ctx.beginPath(); ctx.arc(x + 5, y + 5, 1.6, 0, 6.283); ctx.fill();
    const blink = state === 'idle' ? (Math.floor(P.t * 2) % 2 === 0) : true;
    ctx.fillStyle = dead ? C.alert : blink ? C.signal : rgba(C.signal, 0.25);
    ctx.fillRect(x + pw - 8, y + 4, 4, 3);
  }

  function drawObstacle(o) {
    const x = Math.round(o.x), yb = ground - o.y, y = yb - o.h;
    if (o.type === 'resistor') {
      ctx.strokeStyle = '#b9bfcc'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 1, yb); ctx.lineTo(x + 1, y + 7); ctx.lineTo(x + o.w - 1, y + 7); ctx.lineTo(x + o.w - 1, yb); ctx.stroke();
      rr(x + 6, y + 1, o.w - 12, 12, 5); ctx.fillStyle = '#d9c39a'; ctx.fill();
      [['#7a4a1f', 10], ['#16181d', 14], ['#c0392b', 18], ['#d4a133', 23]].forEach(([c, dx]) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + 1, 2, 12); });
    } else if (o.type === 'cap' || o.type === 'bank') {
      const caps = o.type === 'cap' ? [[0, 32]] : [[0, 26], [24, 32]];
      for (const [dx, h] of caps) {
        const cx = x + dx, cy = yb - h;
        ctx.fillStyle = '#b9bfcc'; ctx.fillRect(cx + 4, yb - 3, 2, 3); ctx.fillRect(cx + 12, yb - 3, 2, 3);
        const g = ctx.createLinearGradient(cx, 0, cx + 18, 0);
        g.addColorStop(0, '#13284f'); g.addColorStop(0.45, '#2c5aa0'); g.addColorStop(1, '#0f1f3d');
        rr(cx, cy, 18, h - 3, 3); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = 'rgba(200, 215, 240, 0.75)'; ctx.fillRect(cx + 12, cy + 4, 3, h - 10);
        ctx.fillStyle = '#c9ced8'; ctx.fillRect(cx, cy, 18, 3);
      }
    } else if (o.type === 'ic') {
      ctx.fillStyle = '#b9bfcc';
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 5 + i * 9, yb - 4, 3, 4);
      rr(x, y, o.w, o.h - 4, 2); ctx.fillStyle = '#16181f'; ctx.fill();
      ctx.strokeStyle = rgba(C.fg3, 0.6); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = rgba(C.fg3, 0.9); ctx.beginPath(); ctx.arc(x, y + (o.h - 4) / 2, 3.5, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = rgba(C.fg2, 0.8); ctx.font = mono(7); ctx.textBaseline = 'middle'; ctx.fillText('74HC', x + 12, y + (o.h - 4) / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
    } else {
      const cx = x + o.w / 2, cy = y + o.h / 2, pulse = 0.5 + 0.5 * Math.sin(o.t * 10);
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
      halo.addColorStop(0, rgba(C.alert, 0.35 + 0.25 * pulse)); halo.addColorStop(1, rgba(C.alert, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, y - 2); ctx.lineTo(x + o.w + 2, cy); ctx.lineTo(cx, y + o.h + 2); ctx.lineTo(x - 2, cy); ctx.closePath();
      ctx.fillStyle = rgba(C.bg, 0.85); ctx.fill(); ctx.strokeStyle = C.alert; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.alert; ctx.font = mono(10, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.floor(o.t * 6) % 2 ? '1' : '0', cx, cy + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  function drawHud() {
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.font = mono(12, 500); ctx.fillStyle = C.accent;
    ctx.fillText('PC ' + hex(score), W - 14, 12);
    ctx.font = mono(10); ctx.fillStyle = C.fg3;
    ctx.fillText('MAX ' + hex(best), W - 14, 30);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (toast) {
      const a = Math.min(1, toast.t * 2.5);
      ctx.font = mono(11, 500); ctx.textAlign = 'center';
      ctx.fillStyle = rgba(toast.gold ? C.accent : C.signal, a);
      ctx.fillText(`[ ${toast.text} ]`, W / 2, 26);
      ctx.textAlign = 'left';
    }
  }

  function linesFit(lines, maxW, start) {
    let fs = start;
    ctx.font = mono(fs);
    const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
    while (fs > 9 && widest() > maxW) { fs -= 0.5; ctx.font = mono(fs); }
    return fs;
  }

  function drawIdle() {
    const lines = ['SIGSEGV  load from an unmapped page', 'pc    0x00000404   ; no page at this address', 'fix   flush pipeline, refetch from 0x0000'];
    const fs = linesFit(lines, W - 36, 12.5), lh = fs * 1.75;
    let y = 22 + fs;
    ctx.textBaseline = 'alphabetic';
    // line 1
    ctx.font = mono(fs, 500); ctx.fillStyle = C.alert; ctx.fillText('SIGSEGV', 18, y);
    const w1 = ctx.measureText('SIGSEGV  ').width;
    ctx.font = mono(fs); ctx.fillStyle = C.fg2; ctx.fillText('load from an unmapped page', 18 + w1, y);
    y += lh;
    ctx.fillStyle = C.fg2; ctx.fillText('  pc    0x00000404   ', 18, y);
    const w2 = ctx.measureText('  pc    0x00000404   ').width;
    ctx.fillStyle = C.signal; ctx.fillText('; no page at this address', 18 + w2, y);
    y += lh;
    ctx.fillStyle = C.fg2; ctx.fillText('  fix   flush pipeline, refetch from 0x0000', 18, y);
    y += lh * 1.35;
    const on = reduced || Math.floor(P.t * 1.6) % 2 === 0;
    ctx.font = mono(fs + 0.5, 500); ctx.fillStyle = on ? C.accent : rgba(C.accent, 0.45);
    const prompt = (coarse ? '▶ Tap to refetch' : '▶ Press Space or tap to refetch');
    ctx.fillText(prompt, 18, y);
    if (best > 0) {
      const pw = ctx.measureText(prompt + '   ').width;
      ctx.font = mono(fs - 1); ctx.fillStyle = C.fg3;
      if (18 + pw + 90 < W) ctx.fillText('max ' + hex(best), 18 + pw, y);
    }
  }

  function drawDead() {
    const s = Math.floor(score);
    const l1 = 'SIGSEGV @ ' + hex(s);
    const l2 = 'segmentation fault: ' + cause;
    const l3 = coarse ? 'Tap to refetch from 0x0000' : 'Space or tap to refetch from 0x0000';
    const big = W < 420 ? 17 : 21;
    ctx.font = mono(12);
    const small = linesFit([l2, l3], W - 60, 12);
    ctx.font = mono(big, 500);
    const bw = Math.min(W - 24, Math.max(ctx.measureText(l1).width, (() => { ctx.font = mono(small); return Math.max(ctx.measureText(l2).width, ctx.measureText(l3).width); })()) + 40);
    const bh = newBest ? 104 : 88, bx = (W - bw) / 2, by = Math.max(46, (ground - bh) / 2 - 6);
    rr(bx, by, bw, bh, 6); ctx.fillStyle = rgba(C.bg, 0.86); ctx.fill(); ctx.strokeStyle = rgba(C.alert, 0.55); ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let y = by + 30;
    ctx.font = mono(big, 500); ctx.fillStyle = C.alert; ctx.fillText(l1, W / 2, y);
    if (newBest) { y += 18; ctx.font = mono(small, 500); ctx.fillStyle = C.signal; ctx.fillText('new max address', W / 2, y); }
    y += 22; ctx.font = mono(small); ctx.fillStyle = C.fg2; ctx.fillText(l2, W / 2, y);
    y += 20;
    const ready = performance.now() - deadAt > 450;
    ctx.font = mono(small, 500); ctx.fillStyle = ready ? C.accent : rgba(C.accent, 0.35); ctx.fillText(l3, W / 2, y);
    ctx.textAlign = 'left';
  }

  function drawPaused() {
    ctx.fillStyle = rgba(C.bg, 0.6); ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.font = mono(14, 500); ctx.fillStyle = C.accent;
    ctx.fillText(coarse ? 'Paused · tap to resume' : 'Paused · press Space to resume', W / 2, ground / 2 + 6);
    ctx.textAlign = 'left';
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 4 * shake);
    drawBackground();
    for (const o of obstacles) drawObstacle(o);
    drawPlayer();
    for (const p of particles) { ctx.fillStyle = rgba(p.c, Math.max(0, Math.min(1, p.life * 1.6))); ctx.fillRect(p.x, p.y, 3, 3); }
    if (state === 'idle') drawIdle();
    else drawHud();
    if (state === 'dead') drawDead();
    if (state === 'paused') drawPaused();
  }

  /* ── loop: runs only while the game is on screen and the tab is visible ── */
  let raf = 0, last = 0, onScreen = false;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.033, (t - last) / 1000) : 1 / 60;
    last = t;
    update(dt);
    draw();
  };
  const start = () => { if (!raf && onScreen && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (!onScreen) pause(); onScreen ? start() : stop(); }, { threshold: 0.2 }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); stop(); } else start(); });

  /* ── input ── */
  const isControl = (el) => el && el.closest && el.closest('a, button, input, textarea, select, summary, [contenteditable]');
  window.addEventListener('keydown', (e) => {
    if (isControl(e.target) || !onScreen) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) press(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); P.down = true; }
    else if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'run') pause();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') release();
    if (e.code === 'ArrowDown' || e.code === 'KeyS') P.down = false;
  });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { P.down = false; release(); pause(); });

  canvas.faultState = () => ({ state, score, speed, P: { ...P }, obstacles: obstacles.map((o) => ({ ...o })) });   // read-only, for testing

  MT.onResize(canvas, size);
  window.addEventListener('themechange', draw);
  if (document.fonts) document.fonts.ready.then(draw);
  size();
})();
