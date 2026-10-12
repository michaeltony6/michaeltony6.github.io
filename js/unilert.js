/* Unilert, illustrated: a deterministic plan appears instantly, four agents
   enrich it in parallel, the risk agent adds a flood zone that reroutes
   transport, and a capacity bottleneck diverts patients. Example data only. */
(() => {
  const root = document.getElementById('un-demo');
  if (!root) return;
  const { C, rgba, fit, loop, onResize, clamp, ease, reduced } = MT;
  const canvas = document.getElementById('un-canvas');
  const agentEls = [...document.querySelectorAll('#un-agents .agent')];
  const planEl = document.getElementById('un-plan');
  const planV = document.getElementById('un-plan-v');

  const INC = [0.3, 0.62];
  const HOSP = [
    { name: 'Trauma center', short: 'Trauma', p: [0.8, 0.2], total: 8, start: 3 },
    { name: 'Regional', short: 'Regional', p: [0.86, 0.8], total: 12, start: 5 },
    { name: 'Community', short: 'Community', p: [0.12, 0.16], total: 6, start: 2 },
  ];
  const HAZ = { c: [0.56, 0.36], rx: 0.13, ry: 0.17 };
  const ROUTES = {
    naive: [INC, [0.56, 0.62], [0.56, 0.2], HOSP[0].p],
    safe: [INC, [0.74, 0.62], [0.74, 0.2], HOSP[0].p],
    h2: [INC, [0.3, 0.8], HOSP[1].p],
    h3: [INC, [0.12, 0.62], HOSP[2].p],
  };
  const TAGS = 'RRYRGRYRRGYRYG'.split('');
  const AGENTS = [{ end: 1.6 }, { end: 3.1 }, { end: 3.9 }, { end: 4.6 }];
  const V1 = [['EMS', 'Stage 4 ALS units at the north lot'], ['Triage', 'Open START triage at the main entrance'], ['Transport', 'Send red-tag patients to the trauma center']];
  const ADD = [
    { at: 3.1, item: ['Route', 'Flood warning on the river road: route east'] },
    { at: 3.9, item: ['Alert', 'Trauma center near capacity: divert to Regional'] },
    { at: 4.6, item: ['Comms', 'Notify receiving hospitals with ETAs'] },
  ];
  const CYCLE = 15;
  const TRIAGE_GREEN = '#7fcf8e';   // START triage color, separate from the site palette

  let G = null, t = 0, units = [], sent = 0, used = [], bottleneck = false, planShown = 0, agentState = [];

  function layout() { G = fit(canvas); }
  const P = (q) => [q[0] * G.w, q[1] * G.h];

  function resetCycle() {
    t = 0; units = []; sent = 0; bottleneck = false; planShown = 0;
    used = HOSP.map((h) => h.start);
    agentState = AGENTS.map(() => '');
    planEl.innerHTML = V1.map(([k, v]) => `<li><span>${k}</span>${v}</li>`).join('');
    planV.innerHTML = 'Plan <b>v1</b> · deterministic, 0.2 s';
  }

  function polyLen(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function along(pts, cum, s) {
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const u = clamp((s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1), 0, 1);
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u];
  }

  function dispatch() {
    const tag = TAGS[sent % TAGS.length];
    const hazardKnown = t > AGENTS[1].end;
    let h = tag === 'R' ? 0 : tag === 'Y' ? 1 : 2;
    if (h === 0 && bottleneck) h = 1;
    const route = h === 0 ? (hazardKnown ? ROUTES.safe : ROUTES.naive) : h === 1 ? ROUTES.h2 : ROUTES.h3;
    units.push({ route, h, s: 0, tag, done: false });
    sent++;
  }

  function update(dt) {
    t += dt;
    if (t > CYCLE) resetCycle();
    // agents
    AGENTS.forEach((a, i) => {
      const startAt = 0.35;
      const pr = clamp((t - startAt) / (a.end - startAt), 0, 1);
      const st = t < startAt ? 'queued' : pr < 1 ? 'running' : 'done';
      const el = agentEls[i];
      el.querySelector('.prog i').style.width = pr * 100 + '%';
      el.querySelector('.prog i').classList.toggle('done', st === 'done');
      if (agentState[i] !== st) {
        agentState[i] = st;
        const pill = el.querySelector('.pill');
        pill.textContent = st;
        pill.className = 'pill' + (st === 'running' ? ' run' : st === 'done' ? ' done' : '');
      }
    });
    while (planShown < ADD.length && t >= ADD[planShown].at) {
      const [k, v] = ADD[planShown].item;
      planEl.insertAdjacentHTML('beforeend', `<li class="new"><span>${k}</span>${v}</li>`);
      planShown++;
      planV.innerHTML = `Plan <b>v${planShown + 1}</b> · enriched by agents · +${planShown} action${planShown > 1 ? 's' : ''}`;
    }
    // dispatch
    const due = t > 1 && t < CYCLE - 2.5 ? Math.floor((t - 1) / 0.75) + 1 : sent;
    while (sent < Math.min(due, TAGS.length)) dispatch();
    for (const u of units) {
      if (u.done) continue;
      const pts = u.route.map(P);
      u.cum = polyLen(pts);
      u.s += dt * Math.max(70, G.w * 0.2);
      if (u.s >= u.cum[u.cum.length - 1]) {
        u.done = true;
        used[u.h] = Math.min(HOSP[u.h].total, used[u.h] + 1);
        if (used[0] / HOSP[0].total >= 0.85) bottleneck = true;
      }
    }
  }

  function draw() {
    const { ctx, w, h } = G;
    ctx.clearRect(0, 0, w, h);
    const fadeIn = clamp(t / 0.4, 0, 1), fadeOut = clamp((CYCLE - t) / 0.6, 0, 1);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);

    // street grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.fg3, 0.12);
    const gs = 34;
    for (let x = 10; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = 8; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    // arterials
    ctx.strokeStyle = rgba(C.fg3, 0.32); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    Object.values(ROUTES).forEach((r) => { const pts = r.map(P); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => ctx.lineTo(p[0], p[1])); ctx.stroke(); });

    // hazard zone
    const hazA = clamp((t - AGENTS[1].end) / 0.6, 0, 1);
    if (hazA > 0) {
      const [cx, cy] = P(HAZ.c), rx = HAZ.rx * w, ry = HAZ.ry * h;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283);
      ctx.fillStyle = rgba(C.signal, 0.07 * hazA); ctx.fill();
      ctx.strokeStyle = rgba(C.signal, 0.6 * hazA); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      ctx.clip();
      ctx.strokeStyle = rgba(C.signal, 0.16 * hazA); ctx.lineWidth = 1;
      for (let d = -ry * 2; d < rx * 2 + ry * 2; d += 7) { ctx.beginPath(); ctx.moveTo(cx - rx + d, cy - ry); ctx.lineTo(cx - rx + d - ry * 2, cy + ry); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = rgba(C.signal, hazA); ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('NWS flood warning', cx, cy + 3);
    }

    // active routes
    const known = t > AGENTS[1].end;
    const drawRoute = (r, color, dash, width) => {
      const pts = r.map(P);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => ctx.lineTo(p[0], p[1])); ctx.stroke();
      ctx.setLineDash([]);
    };
    if (!known) drawRoute(ROUTES.naive, rgba(C.accent, 0.75), [], 2);
    else {
      const k = clamp((t - AGENTS[1].end) / 1.2, 0, 1);
      if (k < 1) drawRoute(ROUTES.naive, rgba(C.alert, 0.6 * (1 - k)), [3, 4], 2);
      drawRoute(ROUTES.safe, rgba(C.accent, 0.85 * ease(k)), [], 2);
    }
    drawRoute(ROUTES.h2, rgba(C.fg2, 0.45), [], 1.5);
    drawRoute(ROUTES.h3, rgba(C.fg2, 0.3), [], 1.5);

    // hospitals
    HOSP.forEach((hp, i) => {
      const [x, y] = P(hp.p);
      const full = i === 0 && bottleneck;
      ctx.fillStyle = C.bg2; ctx.strokeStyle = full ? C.alert : C.fg2; ctx.lineWidth = 1.5;
      ctx.fillRect(x - 11, y - 11, 22, 22); ctx.strokeRect(x - 10.5, y - 10.5, 21, 21);
      ctx.fillStyle = full ? C.alert : C.fg; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', x, y + 1);
      if (full) {
        const pr = (t * 1.4) % 1;
        ctx.strokeStyle = rgba(C.alert, 1 - pr); ctx.beginPath(); ctx.arc(x, y, 14 + pr * 18, 0, 6.283); ctx.stroke();
      }
      const bw = 72;
      let bx = x + 18;
      if (bx + bw > w - 6) bx = x - 18 - bw;
      const by = bx < x ? y - 22 : y - 6;
      ctx.fillStyle = C.fg3; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${hp.short} ${used[i]}/${hp.total}`, bx, by);
      ctx.fillStyle = C.bg3; ctx.fillRect(bx, by + 7, bw, 3);
      ctx.fillStyle = full ? C.alert : used[i] / hp.total > 0.7 ? C.accent : C.fg2;
      ctx.fillRect(bx, by + 7, (bw * used[i]) / hp.total, 3);
    });

    // incident
    const [ix, iy] = P(INC);
    for (let k = 0; k < 2; k++) {
      const pr = ((t * 0.8) + k * 0.5) % 1;
      ctx.strokeStyle = rgba(C.accent, (1 - pr) * 0.8); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ix, iy, 6 + pr * 26, 0, 6.283); ctx.stroke();
    }
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(ix, iy, 5, 0, 6.283); ctx.fill();
    ctx.fillStyle = C.fg; ctx.font = '500 10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('MCI · 14 patients', ix + 12, iy + 22);

    // units
    for (const u of units) {
      if (u.done || !u.cum) continue;
      const pts = u.route.map(P);
      const p = along(pts, u.cum, u.s);
      const col = u.tag === 'R' ? C.alert : u.tag === 'Y' ? C.accent : TRIAGE_GREEN;
      ctx.fillStyle = rgba(col, 0.2); ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 6.283); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 6.283); ctx.fill();
    }

    // legend
    ctx.textAlign = 'left'; ctx.font = '10px "IBM Plex Mono", monospace';
    [['red tag', C.alert], ['yellow', C.accent], ['green', TRIAGE_GREEN]].forEach(([k, c], i) => {
      const x = 12 + i * 74, y = h - 14;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 3, y, 3, 0, 6.283); ctx.fill();
      ctx.fillStyle = C.fg3; ctx.fillText(k, x + 11, y + 1);
    });
    ctx.globalAlpha = 1;
  }

  layout();
  resetCycle();
  if (reduced) { for (let i = 0; i < 60 * 7; i++) update(1 / 60); }
  else { for (let i = 0; i < 60 * 1.2; i++) update(1 / 60); }
  draw();
  onResize(canvas, () => { layout(); draw(); });
  if (!reduced) loop(root, (dt) => { update(dt); draw(); });
})();
