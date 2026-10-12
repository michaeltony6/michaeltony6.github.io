/* Desmos Trace, in miniature: split a picture into rectangles, merging a block
   only when every RGB channel of every pixel is within tolerance of the
   block's rounded mean (quadtree version of the app's adaptive mode). */
(() => {
  const root = document.getElementById('tr-demo');
  if (!root) return;
  const { C, rgba, fit, onResize, clamp } = MT;
  const canvas = document.getElementById('tr-canvas');
  const tolIn = document.getElementById('tr-tol'), tolOut = document.getElementById('tr-tol-v');
  const edgesIn = document.getElementById('tr-edges');
  const presets = [...root.querySelectorAll('[data-tol]')];
  const statR = document.getElementById('tr-rects'), statP = document.getElementById('tr-ratio'), statE = document.getElementById('tr-err');

  const SW = 128, SH = 80;
  const src = document.createElement('canvas'); src.width = SW; src.height = SH;
  const sg = src.getContext('2d');

  // a dusk landscape drawn in code: sky gradient, sun, ridgelines, lake with reflections
  (function paint() {
    const sky = sg.createLinearGradient(0, 0, 0, SH * 0.62);
    sky.addColorStop(0, '#0d1230'); sky.addColorStop(0.45, '#3b2a5a'); sky.addColorStop(0.8, '#c4643f'); sky.addColorStop(1, '#f1a35c');
    sg.fillStyle = sky; sg.fillRect(0, 0, SW, SH);
    const r = MT.rng(7);
    for (let i = 0; i < 26; i++) { sg.fillStyle = `rgba(255,240,220,${0.4 + r() * 0.5})`; sg.fillRect(Math.floor(r() * SW), Math.floor(r() * SH * 0.35), 1, 1); }
    sg.fillStyle = '#ffd79a'; sg.beginPath(); sg.arc(SW * 0.64, SH * 0.5, 9, 0, 6.283); sg.fill();
    sg.fillStyle = 'rgba(255,215,154,0.25)'; sg.beginPath(); sg.arc(SW * 0.64, SH * 0.5, 13, 0, 6.283); sg.fill();
    const ridge = (base, amp, freq, color, seed) => {
      const rr = MT.rng(seed);
      const ph = rr() * 10;
      sg.fillStyle = color; sg.beginPath(); sg.moveTo(0, SH);
      for (let x = 0; x <= SW; x += 2) sg.lineTo(x, base + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.7 + ph) * amp * 0.4 + (rr() - 0.5) * 1.2);
      sg.lineTo(SW, SH); sg.closePath(); sg.fill();
    };
    ridge(SH * 0.52, 5, 0.06, '#5a3550', 3);
    ridge(SH * 0.58, 6, 0.045, '#32213d', 11);
    ridge(SH * 0.64, 4, 0.08, '#1b1428', 19);
    const lake = sg.createLinearGradient(0, SH * 0.7, 0, SH);
    lake.addColorStop(0, '#6a3b4a'); lake.addColorStop(1, '#0b0f22');
    sg.fillStyle = lake; sg.fillRect(0, SH * 0.7, SW, SH * 0.3);
    for (let y = SH * 0.72; y < SH; y += 2) {
      sg.fillStyle = `rgba(255,200,140,${0.5 * (1 - (y - SH * 0.7) / (SH * 0.3))})`;
      const wd = 6 + (r() * 10);
      sg.fillRect(Math.round(SW * 0.64 - wd / 2 + (r() - 0.5) * 3), Math.round(y), Math.round(wd), 1);
    }
    sg.fillStyle = '#0a0d1a'; sg.fillRect(0, SH * 0.69, SW, 1);
  })();
  const px = sg.getImageData(0, 0, SW, SH).data;

  let rects = [], maxErr = 0;
  function build(tol) {
    rects = []; maxErr = 0;
    const leaf = (x, y, w, h) => {
      let r = 0, g = 0, b = 0;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * SW + i) * 4; r += px[k]; g += px[k + 1]; b += px[k + 2]; }
      const n = w * h;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    const fits = (x, y, w, h, m) => {
      let worst = 0;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
        const k = (j * SW + i) * 4;
        const e = Math.max(Math.abs(px[k] - m[0]), Math.abs(px[k + 1] - m[1]), Math.abs(px[k + 2] - m[2]));
        if (e > tol) return -1;
        if (e > worst) worst = e;
      }
      return worst;
    };
    const go = (x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      const m = leaf(x, y, w, h);
      const e = w * h === 1 ? 0 : fits(x, y, w, h, m);
      if (e >= 0) { rects.push([x, y, w, h, m]); if (e > maxErr) maxErr = e; return; }
      const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
      go(x, y, hw, hh); go(x + hw, y, w - hw, hh); go(x, y + hh, hw, h - hh); go(x + hw, y + hh, w - hw, h - hh);
    };
    go(0, 0, SW, SH);
  }

  let G = null, split = 0.5, tol = +tolIn.value, edges = edgesIn.checked;
  const rec = document.createElement('canvas'); rec.width = SW; rec.height = SH;
  const rg = rec.getContext('2d');

  function renderRec() {
    rg.clearRect(0, 0, SW, SH);
    for (const [x, y, w, h, m] of rects) { rg.fillStyle = `rgb(${m[0]},${m[1]},${m[2]})`; rg.fillRect(x, y, w, h); }
  }
  function stats() {
    statR.textContent = rects.length.toLocaleString();
    statP.textContent = Math.round((rects.length / (SW * SH)) * 100) + '%';
    statE.textContent = maxErr + ' / 255';
  }
  function draw() {
    if (!G) G = fit(canvas);
    const { ctx, w, h } = G;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const sx = Math.round(split * w);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, h); ctx.clip();
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, w - sx, h); ctx.clip();
    ctx.drawImage(rec, 0, 0, w, h);
    if (edges && rects.length < 7000) {
      const kx = w / SW, ky = h / SH;
      ctx.strokeStyle = 'rgba(7,9,13,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [x, y, rw, rh] of rects) {
        if (x * kx + rw * kx < sx) continue;
        ctx.rect(Math.round(x * kx) + 0.5, Math.round(y * ky) + 0.5, Math.round(rw * kx), Math.round(rh * ky));
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = C.copper; ctx.fillRect(sx - 1, 0, 2, h);
    ctx.fillStyle = C.bg2; ctx.strokeStyle = C.copper; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, h / 2, 13, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.copper; ctx.font = '12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('↔', sx, h / 2 + 1);
  }
  function rebuild() {
    build(tol); renderRec(); stats(); draw();
    tolOut.textContent = tol;
    presets.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.tol === tol)));
  }

  tolIn.addEventListener('input', () => { tol = +tolIn.value; rebuild(); });
  presets.forEach((b) => b.addEventListener('click', () => { tol = +b.dataset.tol; tolIn.value = tol; rebuild(); }));
  edgesIn.addEventListener('change', () => { edges = edgesIn.checked; draw(); });

  let dragging = false;
  const setSplit = (e) => { const r = canvas.getBoundingClientRect(); split = clamp((e.clientX - r.left) / r.width, 0.02, 0.98); draw(); };
  canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); setSplit(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging || e.pointerType === 'mouse') setSplit(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  // ease the split in once when it first scrolls into view
  let introduced = MT.reduced;
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting || introduced) return;
    introduced = true; io.disconnect();
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 1400);
      split = 0.18 + 0.32 * MT.ease(k) + Math.sin(k * Math.PI) * 0.22;
      draw();
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.5 }).observe(canvas);

  rebuild();
  onResize(canvas, () => { G = fit(canvas); draw(); });
})();
