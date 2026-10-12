/* RowHammer, simplified. Each row activation disturbs its two neighbors; a row
   that collects enough disturbance before the periodic refresh flips bits.
   The detector is a small tagged table of saturating counters (in the spirit
   of a branch predictor): hits count up, a miss with no free entry ages every
   counter, all counters halve periodically, and crossing the threshold
   refreshes the aggressor's neighbors. */
(() => {
  const root = document.getElementById('rh-demo');
  if (!root) return;
  const { C, rgba, fit, loop, onResize, clamp, reduced } = MT;
  const canvas = document.getElementById('rh-canvas');
  const tableEl = document.getElementById('rh-table');
  const logEl = document.getElementById('rh-log');
  const led = document.getElementById('rh-led');
  const $ = (id) => document.getElementById(id);
  const st = { acts: $('rh-acts'), det: $('rh-det'), fp: $('rh-fp'), flips: $('rh-flips') };
  const attackBtn = $('rh-attack'), onBox = $('rh-on'), rate = $('rh-speed');

  const ROWS = 24, COLS = 40, ENTRIES = 8;
  const FLIP_T = 220, REFRESH_EVERY = 1200, THRESH = 20, CTR_MAX = 31, DECAY_EVERY = 120;

  const perm = (() => { const r = MT.rng(42); const a = [...Array(ROWS).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  let heat, dist, refFx, flips, table, stats, attack, log, actCount, detectorOn = true, cycleT = 0, autoAttack = true;
  const bits = [...Array(ROWS)].map((_, r) => [...Array(COLS)].map((_, c) => ((r * 7 + c * 13) % 5) < 2));

  function reset() {
    heat = new Float32Array(ROWS); dist = new Float32Array(ROWS); refFx = new Float32Array(ROWS);
    flips = new Set(); table = [...Array(ENTRIES)].map(() => ({ tag: -1, ctr: 0, flash: 0 }));
    stats = { acts: 0, det: 0, fp: 0, flips: 0 };
    attack = { on: false, v: -1, until: 0, toggle: 0 };
    log = []; actCount = 0;
  }

  // table rows in the DOM
  tableEl.insertAdjacentHTML('beforeend', [...Array(ENTRIES)].map((_, i) =>
    `<div class="rh-entry" style="--th:${(THRESH / CTR_MAX) * 100}%"><span class="idx">${i}</span><span class="tag">—</span><span class="ctr"><i></i></span><span class="n">0</span></div>`).join(''));
  const entryEls = [...tableEl.querySelectorAll('.rh-entry')];

  function pushLog(html, cls) {
    log.unshift({ html, cls });
    if (log.length > 4) log.pop();
    logEl.innerHTML = log.map((l) => `<li class="${l.cls || ''}">${l.html}</li>`).join('');
  }

  function startAttack() {
    const v = 2 + Math.floor(Math.random() * (ROWS - 4));
    attack = { on: true, v, until: cycleT + 6.5, toggle: 0 };
    pushLog(`attacker hammering rows <b>${v - 1}</b> and <b>${v + 1}</b>`, 'flip');
  }

  function detector(r) {
    let e = table.find((x) => x.tag === r && x.ctr > 0);
    if (e) e.ctr = Math.min(CTR_MAX, e.ctr + 1);
    else {
      const free = table.find((x) => x.ctr === 0);
      if (free) { free.tag = r; free.ctr = 1; e = free; }
      else table.forEach((x) => { x.ctr--; });       // no free entry: age every counter
    }
    if (e && e.ctr >= THRESH) {
      stats.det++;
      const isAgg = attack.on && (r === attack.v - 1 || r === attack.v + 1);
      if (!isAgg) stats.fp++;
      [r - 1, r + 1].forEach((n) => { if (n >= 0 && n < ROWS) { dist[n] = 0; refFx[n] = 1; } });
      e.ctr = 0; e.flash = 1;
      pushLog(`row ${String(r).padStart(2, '0')} hit ${THRESH} → <b>refresh ${r - 1}, ${r + 1}</b>${isAgg ? '' : ' (benign)'}`, isAgg ? '' : 'fp');
    }
  }

  function activate(r) {
    stats.acts++; actCount++;
    heat[r] = 1;
    [r - 1, r + 1].forEach((n) => {
      if (n < 0 || n >= ROWS) return;
      dist[n] += 1;
      if (dist[n] > FLIP_T) {
        const c = Math.floor(Math.random() * COLS);
        if (!flips.has(n * COLS + c)) { flips.add(n * COLS + c); stats.flips++; }
        dist[n] = FLIP_T * 0.62;
        if (stats.flips % 3 === 1) pushLog(`bit flip in row <b>${n}</b>`, 'flip');
      }
    });
    if (detectorOn) detector(r);
    if (actCount % DECAY_EVERY === 0) table.forEach((x) => { x.ctr >>= 1; if (!x.ctr) x.tag = -1; });
    if (actCount % REFRESH_EVERY === 0) { dist.fill(0); for (let i = 0; i < ROWS; i++) refFx[i] = Math.max(refFx[i], 0.35); }
  }

  function benign() { return perm[Math.min(ROWS - 1, Math.floor(ROWS * Math.pow(Math.random(), 1.25)))]; }

  function update(dt) {
    cycleT += dt;
    if (autoAttack && !attack.on && cycleT % 11 > 3.2 && cycleT % 11 < 3.4) startAttack();
    if (attack.on && cycleT > attack.until) { attack.on = false; pushLog('attack ended, benign traffic'); }
    const n = Math.round(+rate.value * 1.6 * dt * 60);
    for (let i = 0; i < n; i++) {
      if (attack.on && Math.random() < 0.7) { attack.toggle ^= 1; activate(attack.toggle ? attack.v - 1 : attack.v + 1); }
      else activate(benign());
    }
    for (let i = 0; i < ROWS; i++) { heat[i] = Math.max(0, heat[i] - dt * 7); refFx[i] = Math.max(0, refFx[i] - dt * 1.8); }
    table.forEach((x) => (x.flash = Math.max(0, x.flash - dt * 3)));
  }

  let G = null;
  function draw() {
    if (!G) G = fit(canvas);
    const { ctx, w, h } = G;
    ctx.clearRect(0, 0, w, h);
    const top = 30, bottom = 14, left = 46, meterW = 54, right = 12;
    const rh = (h - top - bottom) / ROWS;
    const gw = w - left - meterW - right;
    const cw = gw / COLS;
    ctx.font = '9.5px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.fg3; ctx.textAlign = 'left';
    ctx.fillText('ROW', 12, 14);
    ctx.fillText('CELLS', left, 14);
    ctx.textAlign = 'right'; ctx.fillText('DISTURB', w - right, 14);

    for (let r = 0; r < ROWS; r++) {
      const y = top + r * rh;
      const isAgg = attack.on && (r === attack.v - 1 || r === attack.v + 1);
      const isVic = attack.on && r === attack.v;
      if (heat[r] > 0) { ctx.fillStyle = rgba(C.accent, heat[r] * (isAgg ? 0.34 : 0.07)); ctx.fillRect(left - 4, y, gw + 8, rh - 1); }
      if (refFx[r] > 0) {
        const sweep = left + gw * (1 - refFx[r]);
        const g = ctx.createLinearGradient(sweep - 60, 0, sweep + 4, 0);
        g.addColorStop(0, rgba(C.signal, 0)); g.addColorStop(1, rgba(C.signal, 0.35 * Math.min(1, refFx[r] * 2)));
        ctx.fillStyle = g; ctx.fillRect(Math.max(left - 4, sweep - 60), y, Math.min(64, sweep - left + 8), rh - 1);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = isAgg ? C.accent : isVic ? C.alert : C.fg3;
      ctx.fillText(String(r).padStart(2, '0') + (isAgg ? ' A' : isVic ? ' V' : ''), 12, y + rh / 2);
      const s = Math.max(1.5, Math.min(cw, rh) - 3);
      for (let c = 0; c < COLS; c++) {
        const flipped = flips.has(r * COLS + c);
        ctx.fillStyle = flipped ? C.alert : bits[r][c] ? rgba(C.fg2, 0.55) : rgba(C.fg3, 0.28);
        ctx.fillRect(left + c * cw + (cw - s) / 2, y + (rh - s) / 2, s, s);
      }
      const d = clamp(dist[r] / FLIP_T, 0, 1);
      const mx = w - right - meterW + 8, mw = meterW - 8;
      ctx.fillStyle = C.bg3; ctx.fillRect(mx, y + rh / 2 - 2, mw, 4);
      ctx.fillStyle = d > 0.8 ? C.alert : d > 0.5 ? C.accent : C.fg3;
      ctx.fillRect(mx, y + rh / 2 - 2, mw * d, 4);
    }
    if (!detectorOn) {
      ctx.textAlign = 'center'; ctx.fillStyle = C.alert; ctx.font = '500 10.5px "IBM Plex Mono", monospace';
      ctx.fillText('DETECTOR OFF', left + gw / 2, 14);
    }
  }

  let ui = 0;
  function syncDom() {
    st.acts.textContent = stats.acts.toLocaleString();
    st.det.textContent = stats.det;
    st.fp.textContent = stats.fp;
    st.flips.textContent = stats.flips;
    st.flips.className = stats.flips ? 'bad' : '';
    table.forEach((x, i) => {
      const el = entryEls[i];
      el.querySelector('.tag').textContent = x.tag < 0 || !x.ctr ? '—' : 'row ' + String(x.tag).padStart(2, '0');
      el.querySelector('.ctr i').style.width = (x.ctr / CTR_MAX) * 100 + '%';
      el.querySelector('.n').textContent = x.ctr;
      el.classList.toggle('hot', x.ctr >= THRESH * 0.6 || x.flash > 0);
    });
    led.textContent = attack.on ? 'Under attack' : 'Benign traffic';
    led.className = 'led ' + (attack.on ? 'warn' : 'on');
  }

  attackBtn.addEventListener('click', () => { if (attack.on) attack.until = cycleT + 6.5; else startAttack(); });
  onBox.addEventListener('change', () => {
    detectorOn = onBox.checked;
    if (!detectorOn) table.forEach((x) => { x.tag = -1; x.ctr = 0; });
    pushLog(detectorOn ? 'detector <b>enabled</b>' : 'detector disabled', detectorOn ? '' : 'flip');
    syncDom();
  });

  reset();
  for (let i = 0; i < 90; i++) update(1 / 60);
  draw(); syncDom();
  onResize(canvas, () => { G = fit(canvas); draw(); });
  if (!reduced) {
    loop(root, (dt) => { update(dt); draw(); if ((ui++ & 3) === 0) syncDom(); });
  } else {
    autoAttack = false;
    loop(root, (dt) => { if (attack.on) { update(dt); draw(); if ((ui++ & 3) === 0) syncDom(); } });
  }
})();
