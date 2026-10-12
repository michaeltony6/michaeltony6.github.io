/* 3-DOF leg: hip roll + hip pitch + knee. Analytic IK gives desired joint angles;
   joint-space PD (plus J^T F feedforward during stance) drives the actual joints,
   with torque saturation. Units: meters, radians, N·m. Angles from the downward vertical. */
(() => {
  const root = document.getElementById('leg-demo');
  if (!root) return;
  const { C, rgba, fit, loop, onResize, clamp, reduced } = MT;
  const canvas = document.getElementById('leg-canvas');
  const $ = (id) => document.getElementById(id);
  const kpIn = $('leg-kp'), kdIn = $('leg-kd'), kpOut = $('leg-kp-v'), kdOut = $('leg-kd-v');
  const walkBtn = $('leg-walk'), followBtn = $('leg-follow'), led = $('leg-led');
  const ro = { hip: $('leg-hip'), knee: $('leg-knee'), roll: $('leg-roll'), err: $('leg-err') };
  const tauEls = [$('tau-hip'), $('tau-knee')];

  const L1 = 0.25, L2 = 0.25, TMAX = 30, LOAD = 120, INERTIA = [0.08, 0.05];
  const REACH = (L1 + L2) * 0.985, MINR = 0.07;
  let Kp = +kpIn.value, Kd = +kdIn.value / 10;

  const th = [0.35, -0.7], om = [0, 0];
  let roll = 0, rollV = 0;
  let mode = 'walk', manual = false, phase = 0, leaveTimer = 0;
  const tgt = { x: 0.1, z: 0.42, y: 0 };
  const ptr = { x: 0.1, z: 0.4 };
  let tau = [0, 0], sat = [false, false], stance = false;
  const trail = [];
  let G = null;

  function layout() {
    G = fit(canvas);
    const { w, h } = G;
    G.s = Math.min(h * 1.48, w * 1.6);               // px per meter
    G.hx = w * (w < 520 ? 0.5 : 0.44);
    G.hy = Math.max(58, h * 0.16);
    G.ground = 0.43;
  }
  const P = (x, z) => [G.hx + x * G.s, G.hy + z * G.s];

  function ik(x, z) {
    let r = Math.hypot(x, z);
    if (r > REACH) { x *= REACH / r; z *= REACH / r; r = REACH; }
    if (r < MINR) { const k = MINR / (r || 1e-6); x *= k; z *= k; r = MINR; }
    const c2 = clamp((r * r - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
    const q2 = -Math.acos(c2);                       // knee bends forward
    const q1 = Math.atan2(x, z) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [q1, q2];
  }
  function fk(q1, q2) {
    const kx = L1 * Math.sin(q1), kz = L1 * Math.cos(q1);
    return { kx, kz, fx: kx + L2 * Math.sin(q1 + q2), fz: kz + L2 * Math.cos(q1 + q2) };
  }
  function jacT(q1, q2, Fx, Fz) {
    const c1 = Math.cos(q1), s1 = Math.sin(q1), c12 = Math.cos(q1 + q2), s12 = Math.sin(q1 + q2);
    const J = [[L1 * c1 + L2 * c12, L2 * c12], [-L1 * s1 - L2 * s12, -L2 * s12]];
    return [J[0][0] * Fx + J[1][0] * Fz, J[0][1] * Fx + J[1][1] * Fz];
  }

  function setMode(m, isManual) {
    mode = m; manual = !!isManual;
    walkBtn.setAttribute('aria-pressed', String(m === 'walk'));
    followBtn.setAttribute('aria-pressed', String(m === 'follow'));
    led.textContent = m === 'walk' ? 'Walking' : 'Following';
    canvas.style.touchAction = m === 'follow' && manual ? 'none' : 'pan-y';
  }
  walkBtn.addEventListener('click', () => setMode('walk', true));
  followBtn.addEventListener('click', () => setMode('follow', true));
  kpIn.addEventListener('input', () => { Kp = +kpIn.value; kpOut.textContent = Kp; });
  kdIn.addEventListener('input', () => { Kd = +kdIn.value / 10; kdOut.textContent = Kd.toFixed(1); });

  function toMeters(e) {
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX - r.left - G.hx) / G.s;
    ptr.z = (e.clientY - r.top - G.hy) / G.s;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && !(mode === 'follow' && manual)) return;
    toMeters(e);
    clearTimeout(leaveTimer);
    if (mode === 'walk' && !manual) setMode('follow', false);
    if (mode === 'walk' && manual && e.pointerType !== 'touch') setMode('follow', false);
  });
  canvas.addEventListener('pointerdown', (e) => { if (mode === 'follow') toMeters(e); });
  canvas.addEventListener('pointerleave', () => {
    if (!manual) leaveTimer = setTimeout(() => setMode('walk', false), 900);
  });

  function physics(dt) {
    if (mode === 'walk') {
      phase += dt * 2 * Math.PI * 1.15;
      const s = Math.sin(phase);
      tgt.x = 0.15 * Math.cos(phase) + 0.02;
      tgt.z = G.ground - (s < 0 ? 0.085 * -s : 0);
      tgt.y = 0.03 * Math.sin(phase * 0.5);
      stance = s >= 0;
    } else {
      tgt.x = ptr.x; tgt.z = Math.min(ptr.z, G.ground + 0.02); tgt.y = 0;
      const f = fk(th[0], th[1]);
      stance = f.fz > G.ground - 0.01;
    }
    const qd = ik(tgt.x, tgt.z);
    const n = 6, h = dt / n;
    for (let k = 0; k < n; k++) {
      const ff = stance ? jacT(th[0], th[1], 0, LOAD) : [0, 0];
      for (let j = 0; j < 2; j++) {
        const pd = Kp * (qd[j] - th[j]) - Kd * om[j];
        const cmd = pd + ff[j];
        const out = clamp(cmd, -TMAX, TMAX);
        sat[j] = Math.abs(cmd) >= TMAX;
        tau[j] = out;
        const acc = (out - ff[j]) / INERTIA[j];
        om[j] += acc * h;
        th[j] += om[j] * h;
      }
      const rd = Math.atan2(tgt.y, tgt.z);
      const ra = (Kp * 0.6 * (rd - roll) - Kd * 0.6 * rollV) / 0.06;
      rollV += ra * h; roll += rollV * h;
    }
    const f = fk(th[0], th[1]);
    trail.push([f.fx, f.fz]);
    if (trail.length > 80) trail.shift();
    return qd;
  }

  let uiTick = 0;
  function draw(qd) {
    const { ctx, w, h } = G;
    ctx.clearRect(0, 0, w, h);

    // graph paper
    ctx.lineWidth = 1;
    for (let x = (G.hx % 20) - 20; x < w; x += 20) { ctx.strokeStyle = Math.abs(x - G.hx) % 100 < 1 ? rgba(C.fg3, 0.13) : rgba(C.fg3, 0.06); ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = (G.hy % 20) - 20; y < h; y += 20) { ctx.strokeStyle = Math.abs(y - G.hy) % 100 < 1 ? rgba(C.fg3, 0.13) : rgba(C.fg3, 0.06); ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }

    // workspace
    ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(C.fg3, 0.45);
    ctx.beginPath(); ctx.arc(G.hx, G.hy, REACH * G.s, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.fg3; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const wp = P(Math.cos(0.5) * REACH, Math.sin(0.5) * REACH);
    if (w > 480) ctx.fillText('reach 0.49 m', wp[0] + 8, wp[1]);

    // ground
    const gy = G.hy + G.ground * G.s;
    ctx.strokeStyle = C.fg3; ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(w, gy + 0.5); ctx.stroke();
    ctx.strokeStyle = rgba(C.fg3, 0.25);
    const off = mode === 'walk' ? ((-phase / (2 * Math.PI)) * 0.3 * G.s) % 12 : 0;
    for (let x = off - 12; x < w + 12; x += 12) { ctx.beginPath(); ctx.moveTo(x, gy + 2); ctx.lineTo(x - 8, gy + 10); ctx.stroke(); }

    // body
    ctx.fillStyle = C.bg3; ctx.strokeStyle = C.line2;
    MT.roundRect(ctx, G.hx - 64, G.hy - 44, 128, 30, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.fg3; ctx.textAlign = 'center'; ctx.fillText('hip mount', G.hx, G.hy - 29);
    ctx.fillStyle = C.line2; ctx.fillRect(G.hx - 3, G.hy - 14, 6, 10);

    // trail
    for (let i = 1; i < trail.length; i++) {
      const a = P(trail[i - 1][0], trail[i - 1][1]), b = P(trail[i][0], trail[i][1]);
      ctx.strokeStyle = rgba(C.copper, (i / trail.length) * 0.55); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // desired (ghost) leg
    const gd = fk(qd[0], qd[1]);
    const gk = P(gd.kx, gd.kz), gf = P(gd.fx, gd.fz);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(C.fg2, 0.45); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(G.hx, G.hy); ctx.lineTo(gk[0], gk[1]); ctx.lineTo(gf[0], gf[1]); ctx.stroke();
    ctx.setLineDash([]);

    // target
    const tp = P(tgt.x, tgt.z);
    ctx.strokeStyle = C.copper; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(tp[0], tp[1], 7, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tp[0] - 12, tp[1]); ctx.lineTo(tp[0] - 4, tp[1]); ctx.moveTo(tp[0] + 4, tp[1]); ctx.lineTo(tp[0] + 12, tp[1]);
    ctx.moveTo(tp[0], tp[1] - 12); ctx.lineTo(tp[0], tp[1] - 4); ctx.moveTo(tp[0], tp[1] + 4); ctx.lineTo(tp[0], tp[1] + 12); ctx.stroke();

    // actual leg
    const f = fk(th[0], th[1]);
    const kp = P(f.kx, f.kz), fp = P(f.fx, f.fz);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b3245'; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(G.hx, G.hy); ctx.lineTo(kp[0], kp[1]); ctx.stroke();
    ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(kp[0], kp[1]); ctx.lineTo(fp[0], fp[1]); ctx.stroke();
    ctx.strokeStyle = '#cfd4de'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(G.hx, G.hy); ctx.lineTo(kp[0], kp[1]); ctx.lineTo(fp[0], fp[1]); ctx.stroke();
    const joint = (p, r, ang, s) => {
      ctx.fillStyle = C.bg2; ctx.strokeStyle = s ? C.alert : C.copper; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.sin(ang) * r, p[1] + Math.cos(ang) * r); ctx.stroke();
    };
    joint([G.hx, G.hy], 12, th[0], sat[0]);
    joint(kp, 10, th[0] + th[1], sat[1]);
    ctx.fillStyle = C.copper; ctx.beginPath(); ctx.arc(fp[0], fp[1], 5, 0, 6.283); ctx.fill();

    // ground reaction force in stance
    if (stance) {
      ctx.strokeStyle = C.signal; ctx.fillStyle = C.signal; ctx.lineWidth = 2;
      const len = 46;
      ctx.beginPath(); ctx.moveTo(fp[0], fp[1] + 2); ctx.lineTo(fp[0], fp[1] + 2 - len); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fp[0], fp[1] - len - 4); ctx.lineTo(fp[0] - 5, fp[1] - len + 5); ctx.lineTo(fp[0] + 5, fp[1] - len + 5); ctx.fill();
      ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('F = 120 N', fp[0] + 9, fp[1] - len + 4);
    }

    // front view inset (hip roll)
    const iw = 92, ih = 96, ix = w - iw - 12, iy = 12;
    ctx.fillStyle = rgba(C.bg, 0.7); ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
    ctx.fillRect(ix, iy, iw, ih); ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    ctx.fillStyle = C.fg3; ctx.font = '9.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('FRONT · roll', ix + 7, iy + 11);
    const hx2 = ix + iw / 2, hy2 = iy + 24, ll = 56;
    ctx.strokeStyle = C.fg3; ctx.beginPath(); ctx.moveTo(ix + 6, hy2 + ll + 4.5); ctx.lineTo(ix + iw - 6, hy2 + ll + 4.5); ctx.stroke();
    ctx.strokeStyle = '#cfd4de'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx2, hy2); ctx.lineTo(hx2 + Math.sin(roll) * ll * 3, hy2 + Math.cos(roll) * ll); ctx.stroke();
    ctx.fillStyle = C.bg2; ctx.strokeStyle = C.copper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx2, hy2, 6, 0, 6.283); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.fg3; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText(mode === 'walk' ? 'gait · 1.15 Hz · stride 0.30 m' : 'target = pointer', 14, h - 14);

    // readouts
    if ((uiTick++ & 3) === 0) {
      const deg = (r) => (r * 180 / Math.PI).toFixed(1) + '°';
      ro.hip.textContent = deg(th[0]);
      ro.knee.textContent = deg(th[1]);
      ro.roll.textContent = deg(roll);
      const qf = fk(qd[0], qd[1]);
      ro.err.textContent = Math.round(Math.hypot(qf.fx - f.fx, qf.fz - f.fz) * 1000) + ' mm';
      tauEls.forEach((t, j) => {
        const v = tau[j], pct = Math.min(50, (Math.abs(v) / TMAX) * 50);
        const bar = t.querySelector('i');
        bar.style.width = pct + '%';
        bar.style.left = v >= 0 ? '50%' : 50 - pct + '%';
        t.classList.toggle('sat', sat[j]);
        t.querySelector('.val').textContent = (sat[j] ? 'SAT ' : '') + v.toFixed(1) + ' N·m';
      });
    }
  }

  layout();
  canvas.style.touchAction = 'pan-y';
  for (let i = 0; i < 40; i++) physics(1 / 60);
  draw(ik(tgt.x, tgt.z));
  onResize(canvas, () => { layout(); draw(ik(tgt.x, tgt.z)); });

  if (!reduced) loop(root, (dt) => { const qd = physics(dt); draw(qd); });
  else loop(root, (dt) => { if (mode === 'follow') { const qd = physics(dt); draw(qd); } });
})();
