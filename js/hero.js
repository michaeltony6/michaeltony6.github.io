/* Hero: a procedurally generated chip die, rendered with a thin-film
   iridescence shader and lit by the pointer like a microscope ring light.
   Texture channels: R = structure brightness, G = film thickness, B = boot delay. */
(() => {
  const hero = document.getElementById('fetch');
  const canvas = document.getElementById('die');
  const pcv = document.getElementById('die-pulses');
  if (!hero || !canvas || !pcv) return;

  const { rng, clamp, C, rgba, reduced } = MT;
  const hudX = document.getElementById('hud-x');
  const hudY = document.getElementById('hud-y');
  const hudSeed = document.getElementById('hud-seed');

  const seed = (Math.random() * 0xffff) | 0;
  if (hudSeed) hudSeed.textContent = 'Seed 0x' + seed.toString(16).toUpperCase().padStart(4, '0');

  let W = 0, H = 0;
  let tex = null;
  let traces = [];
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const glScale = Math.min(isCoarse ? 1 : 1.5, window.devicePixelRatio || 1);

  /* ───────────── floorplan ───────────── */
  function generate() {
    const r = rng(seed);
    const S = Math.min(1.5, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(W * S));
    c.height = Math.max(2, Math.round(H * S));
    const g = c.getContext('2d');
    g.scale(S, S);
    const col = (R, G, B) => `rgb(${R | 0},${G | 0},${B | 0})`;

    g.fillStyle = col(10, 40, 0);
    g.fillRect(0, 0, W, H);

    const m = clamp(Math.min(W, H) * 0.03, 14, 30);

    // seal ring
    g.strokeStyle = col(150, 70, 245); g.lineWidth = 2;
    g.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    g.strokeStyle = col(95, 70, 245); g.lineWidth = 1;
    g.strokeRect(m * 0.35 + 4, m * 0.35 + 4, W - m * 0.7 - 8, H - m * 0.7 - 8);

    // pad ring
    const ps = clamp(m * 0.62, 9, 16), pitch = ps * 1.9, inset = m * 0.85;
    const pad = (x, y, vertical) => {
      g.fillStyle = col(205, 120, 250); g.fillRect(x, y, ps, ps);
      g.fillStyle = col(120, 120, 250); g.fillRect(x + ps * 0.25, y + ps * 0.25, ps * 0.5, ps * 0.5);
      g.fillStyle = col(105, 60, 250);
      if (vertical) g.fillRect(x + ps * 0.4, y + ps, ps * 0.2, m * 0.7); else g.fillRect(x + ps, y + ps * 0.4, m * 0.7, ps * 0.2);
    };
    for (let x = inset + pitch; x < W - inset - pitch; x += pitch) { pad(x, inset, true); pad(x, H - inset - ps, false); }
    for (let y = inset + pitch; y < H - inset - pitch; y += pitch) { pad(inset, y, false); pad(W - inset - ps, y, false); }

    const core = { x: m * 2.4, y: m * 2.4, w: W - m * 4.8, h: H - m * 4.8 };
    const blocks = [];
    const minS = Math.max(64, Math.min(W, H) * 0.1);
    (function split(b, depth) {
      const canV = b.w > minS * 2, canH = b.h > minS * 2;
      if ((!canV && !canH) || (depth > 2 && r() < 0.16)) { blocks.push(b); return; }
      const vertical = canV && (!canH || (b.w / b.h > 1 ? r() < 0.78 : r() < 0.22));
      const gap = 6 + r() * 7, t = 0.3 + r() * 0.4;
      if (vertical) {
        const a = b.w * t;
        split({ x: b.x, y: b.y, w: a - gap / 2, h: b.h }, depth + 1);
        split({ x: b.x + a + gap / 2, y: b.y, w: b.w - a - gap / 2, h: b.h }, depth + 1);
      } else {
        const a = b.h * t;
        split({ x: b.x, y: b.y, w: b.w, h: a - gap / 2 }, depth + 1);
        split({ x: b.x, y: b.y + a + gap / 2, w: b.w, h: b.h - a - gap / 2 }, depth + 1);
      }
    })(core, 0);

    const ox = core.x + core.w * (0.2 + r() * 0.6), oy = core.y + core.h * (0.2 + r() * 0.6);
    const maxD = Math.hypot(W, H) * 0.75;
    const coreArea = core.w * core.h;

    const types = [['sram', 26], ['logic', 32], ['datapath', 15], ['cache', 9], ['analog', 8], ['fill', 10]];
    const pickType = (b) => {
      const big = (b.w * b.h) / coreArea > 0.07;
      const pool = big ? types.filter(([t]) => t !== 'analog' && t !== 'fill') : types;
      let total = pool.reduce((s, [, w]) => s + w, 0), x = r() * total;
      for (const [t, w] of pool) { x -= w; if (x <= 0) return t; }
      return 'logic';
    };

    blocks.forEach((b) => {
      b.G = 40 + Math.floor(r() * 215);
      const d = Math.hypot(b.x + b.w / 2 - ox, b.y + b.h / 2 - oy) / maxD;
      b.B = Math.floor(clamp(d * 0.85 + r() * 0.1, 0, 0.92) * 255);
      const type = pickType(b);
      g.fillStyle = col(26, b.G, b.B); g.fillRect(b.x, b.y, b.w, b.h);
      draw[type](g, b, r, col);
      g.strokeStyle = col(80, b.G, b.B); g.lineWidth = 1;
      g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    });

    // power straps
    g.fillStyle = col(62, 30, 248);
    const straps = Math.max(3, Math.round(core.w / 220));
    for (let i = 1; i < straps; i++) g.fillRect(core.x + (core.w * i) / straps, core.y, 2.5, core.h);

    // global routing on top metal (also the paths the pulses travel)
    traces = [];
    const snap = (v) => Math.round(v / 4) * 4;
    const nTr = Math.round(14 + (W * H) / 60000);
    g.strokeStyle = col(118, 25, 250); g.lineWidth = 1.3; g.lineJoin = 'miter';
    for (let i = 0; i < nTr && blocks.length > 1; i++) {
      const a = blocks[Math.floor(r() * blocks.length)], b = blocks[Math.floor(r() * blocks.length)];
      if (a === b) continue;
      const x0 = snap(a.x + a.w * (0.2 + r() * 0.6)), y0 = snap(a.y + a.h * (0.2 + r() * 0.6));
      const x1 = snap(b.x + b.w * (0.2 + r() * 0.6)), y1 = snap(b.y + b.h * (0.2 + r() * 0.6));
      const mx = snap(x0 + (x1 - x0) * (0.3 + r() * 0.4));
      const pts = r() < 0.5 ? [[x0, y0], [mx, y0], [mx, y1], [x1, y1]] : [[x0, y0], [x0, snap((y0 + y1) / 2)], [x1, snap((y0 + y1) / 2)], [x1, y1]];
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
      g.fillStyle = col(170, 25, 250);
      g.fillRect(x0 - 2, y0 - 2, 4, 4); g.fillRect(x1 - 2, y1 - 2, 4, 4);   // vias
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      if (cum[cum.length - 1] > 60) traces.push({ pts, cum, len: cum[cum.length - 1] });
    }
    tex = c;
  }

  const draw = {
    sram(g, b, r, col) {
      const cols = Math.max(1, Math.round(b.w / 110)), rows = Math.max(1, Math.round(b.h / 80)), dec = 5;
      g.fillStyle = col(92, b.G, b.B); g.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      const sw = (b.w - dec * (cols + 1)) / cols, sh = (b.h - dec * (rows + 1)) / rows;
      const p = 2.6 + Math.floor(r() * 2) * 0.6;
      const pa = new Path2D(), pb = new Path2D();
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x0 = b.x + dec + i * (sw + dec), y0 = b.y + dec + j * (sh + dec);
        g.fillStyle = col(36, b.G, b.B); g.fillRect(x0, y0, sw, sh);
        let row = 0;
        for (let y = y0 + 0.8; y < y0 + sh - p * 0.6; y += p, row++) {
          const path = row % 2 ? pa : pb;
          for (let x = x0 + 0.8; x < x0 + sw - p * 0.6; x += p) path.rect(x, y, p * 0.62, p * 0.55);
        }
      }
      g.fillStyle = col(158, b.G, b.B); g.fill(pa);
      g.fillStyle = col(120, b.G, b.B); g.fill(pb);
    },
    cache(g, b, r, col) {
      draw.sram(g, b, r, col);
      g.fillStyle = col(200, b.G, b.B);
      g.fillRect(b.x + b.w / 2 - 2, b.y + 4, 4, b.h - 8);
      g.fillRect(b.x + 4, b.y + b.h / 2 - 2, b.w - 8, 4);
      g.fillRect(b.x + b.w / 4 - 1, b.y + b.h / 4, 2, b.h / 2);
      g.fillRect(b.x + (3 * b.w) / 4 - 1, b.y + b.h / 4, 2, b.h / 2);
    },
    logic(g, b, r, col) {
      const levels = [58, 92, 128, 165, 205].map(() => new Path2D());
      const vals = [58, 92, 128, 165, 205];
      const rh = 4 + Math.floor(r() * 3);
      const rails = new Path2D();
      for (let y = b.y + 3; y + rh <= b.y + b.h - 3; y += rh) {
        let x = b.x + 3;
        rails.rect(b.x + 3, y, b.w - 6, 0.5);
        while (x < b.x + b.w - 3) {
          const cw = Math.min(b.x + b.w - 3 - x, 1 + Math.floor(r() * 7));
          const L = Math.floor(r() * r() * 5);
          levels[L].rect(x, y + 0.7, Math.max(0.6, cw - 0.7), rh - 1.4);
          x += cw;
        }
      }
      levels.forEach((p, i) => { g.fillStyle = col(vals[i], b.G, b.B); g.fill(p); });
      g.fillStyle = col(150, b.G, b.B); g.fill(rails);
    },
    datapath(g, b, r, col) {
      const horiz = b.w >= b.h ? r() < 0.75 : r() < 0.25;
      const len = horiz ? b.w : b.h, span = horiz ? b.h : b.w;
      const cuts = [0];
      let s = 0; while ((s += 16 + r() * 60) < len - 10) cuts.push(s);
      cuts.push(len);
      const paths = [new Path2D(), new Path2D(), new Path2D()], vals = [80, 125, 175];
      const pitch = 2.4;
      for (let k = 0; k < cuts.length - 1; k++) {
        const a = cuts[k] + 2, e = cuts[k + 1] - 2, lvl = Math.floor(r() * 3);
        for (let q = 3; q < span - 3; q += pitch) {
          if (horiz) paths[lvl].rect(b.x + a, b.y + q, e - a, 1.1); else paths[lvl].rect(b.x + q, b.y + a, 1.1, e - a);
        }
      }
      paths.forEach((p, i) => { g.fillStyle = col(vals[i], b.G, b.B); g.fill(p); });
    },
    analog(g, b, r, col) {
      g.strokeStyle = col(120, b.G, b.B); g.lineWidth = 2;
      g.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      const n = b.w > b.h * 1.6 ? 2 : 1;
      const size = Math.min(b.w / n, b.h) * 0.62;
      g.strokeStyle = col(190, b.G, b.B); g.lineWidth = 2.2;
      for (let i = 0; i < n; i++) {
        const cx = b.x + (b.w / n) * (i + 0.5), cy = b.y + b.h / 2;
        let half = size / 2, x = cx - half, y = cy - half;
        g.beginPath(); g.moveTo(x, y);
        const step = 4.2;
        for (let t = 0; t < 22 && half > 6; t++) {
          const side = t % 4;
          if (side === 0) { x = cx + half; } else if (side === 1) { y = cy + half; } else if (side === 2) { x = cx - half + step; } else { y = cy - half + step; half -= step; }
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = col(140, b.G, b.B);
      for (let x = b.x + 10; x < b.x + b.w - 10; x += 7) g.fillRect(x, b.y + b.h - 12, 4, 4);
    },
    fill(g, b, r, col) {
      const p = new Path2D();
      for (let y = b.y + 4; y < b.y + b.h - 4; y += 6) for (let x = b.x + 4 + ((y / 6) % 2) * 3; x < b.x + b.w - 4; x += 6) p.rect(x, y, 2.4, 2.4);
      g.fillStyle = col(72, b.G, b.B); g.fill(p);
    },
  };

  /* ───────────── WebGL renderer ───────────── */
  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uMouse; uniform float uTime; uniform float uBoot;
varying vec2 v;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
void main(){
  vec4 t=texture2D(uTex,v);
  float s=t.r, th=t.g, bd=t.b;
  vec2 k=uRes/min(uRes.x,uRes.y);
  vec2 p=v*k, m=uMouse*k;
  float d=length(p-m);
  float light=exp(-d*d*7.5);
  float rim=exp(-pow((d-.25)*9.,2.))*.2;
  float n=noise(p*3.+vec2(uTime*.02,-uTime*.015));
  float phase=th*1.7+n*.9+d*1.25-uTime*.035;
  vec3 film=.55+.45*cos(6.28318*(phase+vec3(0.,.33,.67)));
  vec3 base=vec3(.08,.095,.13);
  vec3 col=base*s*1.9+film*s*(light*1.4+rim+.03);
  col+=vec3(.894,.612,.361)*s*light*.12;
  float on=smoothstep(bd-.02,bd+.05,uBoot);
  float flash=exp(-pow((uBoot-bd)*16.,2.));
  col=col*on+vec3(.894,.612,.361)*s*flash*.9;
  vec2 q=v-.5; col*=1.-dot(q,q)*.9;
  gl_FragColor=vec4(col,1.);
}`;

  let gl = null, uni = {}, glTex = null, ctx2d = null, flat = null;

  function initGL() {
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    } catch (e) { gl = null; }
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { gl = null; return false; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uTex', 'uRes', 'uMouse', 'uTime', 'uBoot'].forEach((k) => (uni[k] = gl.getUniformLocation(prog, k)));
    glTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uni.uTex, 0);
    return true;
  }

  function upload() {
    if (gl) {
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    } else {
      // 2D fallback: bake a static colorized die once
      flat = document.createElement('canvas');
      flat.width = tex.width; flat.height = tex.height;
      const f = flat.getContext('2d');
      const src = tex.getContext('2d').getImageData(0, 0, tex.width, tex.height);
      const d = src.data;
      for (let i = 0; i < d.length; i += 4) {
        const s = d[i] / 255, th = d[i + 1] / 255;
        const ph = th * 1.7;
        d[i] = (0.08 * 1.7 + 0.25 * (0.55 + 0.45 * Math.cos(6.283 * ph))) * s * 255;
        d[i + 1] = (0.095 * 1.7 + 0.25 * (0.55 + 0.45 * Math.cos(6.283 * (ph + 0.33)))) * s * 255;
        d[i + 2] = (0.13 * 1.7 + 0.25 * (0.55 + 0.45 * Math.cos(6.283 * (ph + 0.67)))) * s * 255;
      }
      f.putImageData(src, 0, 0);
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    if (gl) {
      canvas.width = Math.round(W * glScale);
      canvas.height = Math.round(H * glScale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    generate();
    upload();
    MT.fit(pcv);
    if (!running) render(performance.now() / 1000);
  }

  /* ───────────── light + pulses ───────────── */
  const mouse = { x: 0.68, y: 0.38 }, target = { x: 0.68, y: 0.38 };
  let lastMove = -10, t0 = performance.now() / 1000;
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = hero.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width;
    target.y = (e.clientY - r.top) / r.height;
    lastMove = performance.now() / 1000;
    if (reduced) { mouse.x = target.x; mouse.y = target.y; render(lastMove); }
  });

  const pulses = [];
  function spawn(p) {
    p.tr = traces[Math.floor(Math.random() * traces.length)];
    p.s = 0;
    p.v = 70 + Math.random() * 110;
    p.c = Math.random() < 0.25 ? C.signal : C.copper;
    p.wait = Math.random() * 1.5;
    return p;
  }
  function at(tr, s) {
    s = clamp(s, 0, tr.len);
    let k = 1;
    while (k < tr.cum.length - 1 && tr.cum[k] < s) k++;
    const a = tr.pts[k - 1], b = tr.pts[k];
    const seg = tr.cum[k] - tr.cum[k - 1] || 1;
    const u = (s - tr.cum[k - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  function drawPulses(dt, boot) {
    const { ctx, w, h } = MT.fit(pcv);
    ctx.clearRect(0, 0, w, h);
    if (!traces.length || boot < 1.05) return;
    if (!pulses.length) for (let i = 0; i < Math.min(18, traces.length + 6); i++) pulses.push(spawn({}));
    ctx.lineCap = 'round';
    for (const p of pulses) {
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.s += p.v * dt;
      if (p.s - 46 > p.tr.len) { spawn(p); continue; }
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const s0 = p.s - 46 * (1 - i / segs), s1 = p.s - 46 * (1 - (i + 1) / segs);
        if (s1 < 0 || s0 > p.tr.len) continue;
        const a = at(p.tr, s0), b = at(p.tr, s1);
        ctx.strokeStyle = rgba(p.c, ((i + 1) / segs) * 0.55);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      if (p.s <= p.tr.len) {
        const hpt = at(p.tr, p.s);
        ctx.fillStyle = rgba(p.c, 0.18); ctx.beginPath(); ctx.arc(hpt[0], hpt[1], 6, 0, 6.283); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(hpt[0], hpt[1], 1.8, 0, 6.283); ctx.fill();
      }
    }
  }

  let running = false, hudTick = 0;
  function render(t) {
    const boot = reduced ? 2 : Math.min(2, (t - t0) / 1.7);
    if (gl) {
      gl.uniform2f(uni.uRes, canvas.width, canvas.height);
      gl.uniform2f(uni.uMouse, mouse.x, mouse.y);
      gl.uniform1f(uni.uTime, reduced ? 12 : t - t0);
      gl.uniform1f(uni.uBoot, boot);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (flat) {
      const fit = MT.fit(canvas, 1.5);
      ctx2d = fit.ctx;
      ctx2d.globalAlpha = Math.min(1, boot);
      ctx2d.drawImage(flat, 0, 0, fit.w, fit.h);
      ctx2d.globalAlpha = 1;
      const gx = mouse.x * fit.w, gy = mouse.y * fit.h, rad = Math.max(fit.w, fit.h) * 0.45;
      const grd = ctx2d.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grd.addColorStop(0, 'rgba(228,156,92,0.28)'); grd.addColorStop(1, 'rgba(228,156,92,0)');
      ctx2d.globalCompositeOperation = 'lighter';
      ctx2d.fillStyle = grd; ctx2d.fillRect(0, 0, fit.w, fit.h);
      ctx2d.globalCompositeOperation = 'source-over';
    }
    return boot;
  }

  function frame(dt, t) {
    running = true;
    const idle = t - lastMove > 3.5;
    if (idle || isCoarse) {
      const k = t - t0;
      target.x = 0.66 + 0.24 * Math.sin(k * 0.23);
      target.y = 0.42 + 0.2 * Math.sin(k * 0.31 + 1.3);
    }
    const ease = 1 - Math.exp(-dt * (idle ? 1.5 : 5));
    mouse.x += (target.x - mouse.x) * ease;
    mouse.y += (target.y - mouse.y) * ease;
    const boot = render(t);
    drawPulses(dt, boot);
    if ((hudTick++ & 3) === 0 && hudX) { hudX.textContent = mouse.x.toFixed(3); hudY.textContent = mouse.y.toFixed(3); }
  }

  if (!initGL()) gl = null;
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { initGL(); upload(); });

  resize();
  let rt = 0;
  MT.onResize(hero, () => { clearTimeout(rt); rt = setTimeout(resize, 140); });

  if (reduced) {
    render(performance.now() / 1000);
  } else {
    MT.loop(hero, frame);
  }
})();
