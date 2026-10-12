/* Five-stage pipeline (IF ID EX MEM WB) running a program in the custom ISA.
   Branches resolve in EX (predict not-taken, flush 2). With forwarding: only
   load-use stalls. Without: RAW hazards stall in ID until the producer reaches WB. */
(() => {
  const root = document.getElementById('cpu-demo');
  if (!root) return;
  const { C, rgba, fit, loop, onResize, ease, roundRect, reduced } = MT;

  const canvas = document.getElementById('cpu-canvas');
  const progEl = document.getElementById('cpu-prog');
  const regEls = [...document.querySelectorAll('#cpu-regs .reg')];
  const el = (id) => document.getElementById(id);
  const out = { cycle: el('cpu-cycle'), retired: el('cpu-retired'), cpi: el('cpu-cpi'), stalls: el('cpu-stalls'), flushes: el('cpu-flushes'), out: el('cpu-out') };
  const led = el('cpu-led'), playBtn = el('cpu-play'), stepBtn = el('cpu-step'), resetBtn = el('cpu-reset'), fwdBox = el('cpu-fwd'), speed = el('cpu-speed');
  const progItems = [...progEl.querySelectorAll('li')];

  const PROG = [
    { op: 'MOVI', rd: 1, imm: 0, text: 'MOVI R1, 0' },
    { op: 'MOVI', rd: 2, imm: 1, text: 'MOVI R2, 1' },
    { op: 'MOVI', rd: 3, imm: 5, text: 'MOVI R3, 5' },
    { op: 'ADD', rd: 1, rs1: 1, rs2: 2, text: 'ADD R1, R1, R2' },
    { op: 'ADDI', rd: 2, rs1: 2, imm: 1, text: 'ADDI R2, R2, 1' },
    { op: 'BNE', rs1: 2, rs2: 3, target: 3, text: 'BNE R2, R3, loop' },
    { op: 'STORE', rs1: 1, addr: 255, text: 'STORE R1, 255' },
    { op: 'LOAD', rd: 4, addr: 255, text: 'LOAD R4, 255' },
    { op: 'ADD', rd: 5, rs1: 4, rs2: 4, text: 'ADD R5, R4, R4' },
    { op: 'HALT', text: 'HALT' },
  ];
  const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
  const SUB = ['fetch', 'decode', 'execute', 'memory', 'write back'];
  const reads = (i) => (i.op === 'ADD' || i.op === 'BNE' ? [i.rs1, i.rs2] : i.op === 'ADDI' || i.op === 'STORE' ? [i.rs1] : []);
  const writes = (i) => (i.op === 'MOVI' || i.op === 'ADD' || i.op === 'ADDI' || i.op === 'LOAD' ? i.rd : -1);
  const isI = (x) => x && x.kind === 'i';
  const groupColor = (idx) => (idx <= 2 ? C.fg3 : idx <= 5 ? C.accent : C.signal);

  let S, fwdOn = true, playing = !reduced, lastStep = 0, doneAt = 0;
  let anim = { t0: -1e9, dur: 360 };

  function reset() {
    S = {
      cycle: 0, pc: 0, pipe: [null, null, null, null, null],
      regs: [0, 0, 0, 0, 0, 0, 0, 256], vregs: [0, 0, 0, 0, 0, 0, 0, 256], mem: {},
      out: null, retired: 0, stalls: 0, flushes: 0, seq: 0, rows: [],
      fwd: [], tokens: [], done: false, fetchStopped: false, event: '', hit: -1,
    };
    doneAt = 0;
  }

  function fetchNext() {
    if (S.fetchStopped || S.pc >= PROG.length) return null;
    const ins = Object.assign({}, PROG[S.pc], { kind: 'i', idx: S.pc, seq: S.seq++, cells: [] });
    S.rows.push(ins);
    if (ins.op === 'HALT') S.fetchStopped = true;
    S.pc++;
    return ins;
  }

  function execute(e) {
    const R = S.regs;
    switch (e.op) {
      case 'MOVI': e.result = e.imm; break;
      case 'ADD': e.result = R[e.rs1] + R[e.rs2]; break;
      case 'ADDI': e.result = R[e.rs1] + e.imm; break;
      case 'BNE': e.taken = R[e.rs1] !== R[e.rs2]; break;
      case 'STORE': e.value = R[e.rs1]; S.mem[e.addr] = e.value; break;
      case 'LOAD': e.result = S.mem[e.addr] || 0; break;
    }
    if (writes(e) >= 0) R[writes(e)] = e.result;
  }

  function step() {
    if (S.done) return;
    const old = S.pipe.slice();
    const prev = new Map();
    old.forEach((x, si) => { if (isI(x)) prev.set(x.seq, si); });
    const nw = [null, null, null, null, null];
    S.cycle++;
    S.event = '';
    S.hit = -1;

    const ex = old[2];
    const taken = isI(ex) && ex.op === 'BNE' && ex.taken;
    let stall = false;
    if (!taken && isI(old[1])) {
      const r = reads(old[1]);
      const exW = isI(old[2]) ? writes(old[2]) : -1;
      const memW = isI(old[3]) ? writes(old[3]) : -1;
      if (fwdOn) stall = isI(old[2]) && old[2].op === 'LOAD' && r.includes(exW);
      else stall = (exW >= 0 && r.includes(exW)) || (memW >= 0 && r.includes(memW));
    }

    nw[4] = old[3];
    nw[3] = old[2];
    if (taken) {
      [old[0], old[1]].forEach((x) => { if (isI(x)) { x.flushed = S.cycle; S.flushes++; } });
      nw[2] = { kind: 'b', why: 'flush' };
      nw[1] = { kind: 'b', why: 'flush' };
      S.pc = ex.target;
      S.fetchStopped = false;
      nw[0] = fetchNext();
      S.event = 'flush';
    } else if (stall) {
      nw[2] = { kind: 'b', why: 'stall' };
      nw[1] = old[1];
      nw[0] = old[0];
      S.stalls++;
      S.event = 'stall';
    } else {
      nw[2] = old[1];
      nw[1] = old[0];
      nw[0] = fetchNext();
    }
    S.pipe = nw;

    S.fwd = [];
    const e = nw[2];
    if (isI(e) && !e.executed) {
      execute(e);
      e.executed = true;
      if (fwdOn) {
        new Set(reads(e)).forEach((r) => {
          if (isI(nw[3]) && writes(nw[3]) === r) S.fwd.push({ from: 3, reg: r });
          else if (isI(nw[4]) && writes(nw[4]) === r) S.fwd.push({ from: 4, reg: r });
        });
      }
    }
    const m = nw[3];
    if (isI(m) && m.op === 'STORE' && m.addr === 255) S.out = m.value;
    const w = nw[4];
    if (isI(w)) {
      S.retired++;
      if (writes(w) >= 0) { S.vregs[writes(w)] = w.result; S.hit = writes(w); }
      if (w.op === 'HALT') S.done = true;
    }
    nw.forEach((x, si) => { if (isI(x)) x.cells.push({ c: S.cycle, s: si, stall: x.cells.length > 0 && x.cells[x.cells.length - 1].s === si }); });

    S.tokens = [];
    nw.forEach((x, si) => { if (isI(x)) S.tokens.push({ ins: x, from: prev.has(x.seq) ? prev.get(x.seq) : -1, to: si }); });
    old.forEach((x, si) => { if (isI(x) && !nw.includes(x)) S.tokens.push({ ins: x, from: si, to: x.flushed ? si : 5, gone: true, flushed: !!x.flushed }); });
    S.bubbles = nw.map((x) => (x && x.kind === 'b' ? x.why : null));
    anim.t0 = performance.now();
    anim.dur = Math.min(360, interval() * 0.85);
    syncDom();
  }

  /* ───────────── DOM side panel ───────────── */
  function syncDom() {
    out.cycle.textContent = S.cycle;
    out.retired.textContent = S.retired;
    out.cpi.textContent = S.retired ? (S.cycle / S.retired).toFixed(2) : '–';
    out.stalls.textContent = S.stalls;
    out.flushes.textContent = S.flushes;
    out.out.textContent = S.out == null ? '–' : S.out;
    regEls.forEach((r, i) => {
      r.querySelector('b').textContent = S.vregs[i];
      r.classList.toggle('hit', i === S.hit);
    });
    const at = new Map();
    S.pipe.forEach((x, si) => { if (isI(x)) at.set(x.idx, Math.max(at.get(x.idx) ?? -1, si)); });
    progItems.forEach((li) => {
      const idx = +li.dataset.idx;
      if (at.has(idx)) { li.dataset.stage = STAGES[at.get(idx)]; li.querySelector('.stg').textContent = STAGES[at.get(idx)]; }
      else { delete li.dataset.stage; li.querySelector('.stg').textContent = ''; }
    });
    led.textContent = S.done ? 'Halted' : playing ? (S.event === 'stall' ? 'Stall' : S.event === 'flush' ? 'Flush' : 'Running') : 'Paused';
    led.className = 'led ' + (S.done ? '' : S.event ? 'warn' : playing ? 'on' : '');
  }

  /* ───────────── canvas ───────────── */
  let G = null;
  function layout() {
    G = fit(canvas);
    const { w } = G;
    const narrow = w < 560;
    const pad = 16, gap = narrow ? 8 : 14;
    const bw = (w - pad * 2 - gap * 4) / 5;
    G.narrow = narrow; G.pad = pad; G.gap = gap; G.bw = bw;
    G.boxY = 44; G.boxH = 52;
    G.lw = narrow ? 70 : 150;
    G.cw = narrow ? 24 : 27;
    G.rh = 19;
    G.gridTop = 150;
  }
  const boxX = (i) => G.pad + i * (G.bw + G.gap);
  const label = (ins) => (G.narrow ? ins.op : ins.text);

  function draw() {
    if (!G) layout();
    const { ctx, w, h, narrow } = G;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    const p = ease(Math.min(1, (now - anim.t0) / anim.dur));

    // stage headers + boxes + pipeline registers
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const x = boxX(i);
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = i === 2 ? C.accent : C.fg2;
      ctx.textAlign = 'left';
      ctx.fillText(STAGES[i], x, 20);
      if (!narrow) { ctx.fillStyle = C.fg3; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillText(SUB[i], x + 34, 20); }
      ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, G.boxY + 0.5, G.bw - 1, G.boxH - 1, 4); ctx.stroke();
      if (i < 4) {
        ctx.fillStyle = C.line2;
        ctx.fillRect(x + G.bw + G.gap / 2 - 1.5, G.boxY - 6, 3, G.boxH + 12);
      }
      const b = S.bubbles && S.bubbles[i];
      if (b) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = b === 'flush' ? rgba(C.alert, 0.7) : rgba(C.accent, 0.7);
        roundRect(ctx, x + 6.5, G.boxY + 8.5, G.bw - 13, G.boxH - 17, 3); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = b === 'flush' ? C.alert : C.accent;
        ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(narrow ? 'nop' : b === 'flush' ? 'bubble · flushed' : 'bubble · stall', x + G.bw / 2, G.boxY + G.boxH / 2);
      }
    }

    // tokens
    const posX = (si) => (si < 0 ? boxX(0) - G.bw * 0.7 : si > 4 ? boxX(4) + G.bw + G.gap : boxX(si));
    ctx.textAlign = 'left';
    for (const t of S.tokens) {
      let x = posX(t.from) + (posX(t.to) - posX(t.from)) * p;
      let y = G.boxY + 7, a = 1;
      if (t.from < 0) a = p;
      if (t.gone && !t.flushed) a = 1 - p;
      if (t.flushed) { y += 18 * p; a = 1 - p; }
      if (a <= 0.01) continue;
      const tw = G.bw - 12, th = G.boxH - 14;
      ctx.globalAlpha = a;
      ctx.fillStyle = C.bg3;
      roundRect(ctx, x + 6, y, tw, th, 3); ctx.fill();
      ctx.strokeStyle = t.flushed ? C.alert : t.to === 2 && !t.gone ? C.accent : C.line2;
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = groupColor(t.ins.idx);
      ctx.fillRect(x + 6, y + 6, 2, th - 12);
      ctx.fillStyle = t.flushed ? C.alert : C.fg;
      ctx.font = (narrow ? '10.5px' : '11.5px') + ' "IBM Plex Mono", monospace';
      let txt = label(t.ins);
      const maxW = tw - 18;
      while (ctx.measureText(txt).width > maxW && txt.length > 3) txt = txt.slice(0, -2) + '…';
      ctx.fillText(txt, x + 14, y + th / 2 - (narrow ? 0 : 5));
      if (!narrow) {
        ctx.fillStyle = C.fg3; ctx.font = '9.5px "IBM Plex Mono", monospace';
        let sub = '#' + t.ins.seq;
        if (t.ins.executed && writes(t.ins) >= 0 && t.to >= 2) sub += '  R' + writes(t.ins) + '=' + t.ins.result;
        if (t.ins.op === 'BNE' && t.ins.executed) sub += t.ins.taken ? '  taken' : '  not taken';
        if (t.ins.op === 'STORE' && t.ins.executed) sub += '  M[255]=' + t.ins.value;
        ctx.fillText(sub, x + 14, y + th / 2 + 8);
      }
      ctx.globalAlpha = 1;
    }

    // forwarding arcs under the boxes
    if (S.fwd.length && p > 0.5) {
      const a = Math.min(1, (p - 0.5) * 2.5);
      S.fwd.forEach((f, k) => {
        const x0 = boxX(f.from) + G.bw / 2, x1 = boxX(2) + G.bw / 2 + (k ? 8 : -2);
        const y0 = G.boxY + G.boxH + 2, dip = 26 + k * 10;
        ctx.strokeStyle = rgba(C.signal, a); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0, y0 + dip, x1, y0 + dip, x1, y0 + 3); ctx.stroke();
        ctx.fillStyle = rgba(C.signal, a);
        ctx.beginPath(); ctx.moveTo(x1, y0 + 1); ctx.lineTo(x1 - 4, y0 + 8); ctx.lineTo(x1 + 4, y0 + 8); ctx.fill();
        ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText((narrow ? '' : (f.from === 3 ? 'EX/MEM → EX  ' : 'MEM/WB → EX  ')) + 'R' + f.reg, (x0 + x1) / 2, y0 + dip * 0.78 + 4);
      });
    }

    // space-time diagram
    const top = G.gridTop, lw = G.lw, cw = G.cw, rh = G.rh;
    const visCols = Math.max(4, Math.floor((w - G.pad * 2 - lw) / cw));
    const visRows = Math.max(3, Math.floor((h - top - 22) / rh));
    const c0 = Math.max(1, S.cycle - visCols + 2);
    const rows = S.rows.slice(-visRows);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(G.pad, top - 14); ctx.lineTo(w - G.pad, top - 14); ctx.stroke();
    ctx.font = '9.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    for (let k = 0; k < visCols; k++) {
      const cyc = c0 + k, x = G.pad + lw + k * cw;
      if (cyc === S.cycle) {
        ctx.fillStyle = rgba(C.accent, 0.08);
        ctx.fillRect(x, top - 2, cw, rows.length * rh + 4);
      }
      ctx.fillStyle = cyc === S.cycle ? C.accent : C.fg3;
      if (cyc === S.cycle || cyc % (narrow ? 4 : 2) === 0) ctx.fillText(cyc, x + cw / 2, top + 1 - 8);
    }
    rows.forEach((ins, r) => {
      const y = top + 8 + r * rh;
      ctx.textAlign = 'left';
      ctx.fillStyle = ins.flushed ? rgba(C.alert, 0.75) : C.fg2;
      ctx.font = '10.5px "IBM Plex Mono", monospace';
      let txt = narrow ? ins.op : ins.text;
      ctx.fillText(txt, G.pad, y + rh / 2 - 1);
      if (ins.flushed) {
        const tw = ctx.measureText(txt).width;
        ctx.fillRect(G.pad, y + rh / 2 - 1, tw, 1);
      }
      for (const cell of ins.cells) {
        const k = cell.c - c0;
        if (k < 0 || k >= visCols) continue;
        const x = G.pad + lw + k * cw;
        const isEx = cell.s === 2 && !cell.stall;
        ctx.fillStyle = isEx ? rgba(C.accent, 0.22) : cell.stall ? rgba(C.accent, 0.07) : C.bg3;
        ctx.fillRect(x + 1, y + 1, cw - 2, rh - 4);
        if (cell.stall) {
          ctx.strokeStyle = rgba(C.accent, 0.35); ctx.lineWidth = 1;
          ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 1, cw - 2, rh - 4); ctx.clip();
          for (let d = -rh; d < cw; d += 5) { ctx.beginPath(); ctx.moveTo(x + d, y + rh); ctx.lineTo(x + d + rh, y); ctx.stroke(); }
          ctx.restore();
        }
        ctx.fillStyle = isEx ? C.accent : cell.stall ? rgba(C.accent, 0.8) : C.fg2;
        ctx.textAlign = 'center';
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillText(STAGES[cell.s], x + cw / 2, y + rh / 2 - 1);
      }
      if (ins.flushed) {
        const k = ins.flushed - c0;
        if (k >= 0 && k < visCols) {
          ctx.fillStyle = C.alert; ctx.textAlign = 'center'; ctx.font = '11px "IBM Plex Mono", monospace';
          ctx.fillText('×', G.pad + lw + k * cw + cw / 2, y + rh / 2 - 1);
        }
      }
    });
    if (S.done) {
      ctx.textAlign = 'right'; ctx.fillStyle = C.signal; ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillText(`HALT retired · ${S.cycle} cycles · CPI ${(S.cycle / S.retired).toFixed(2)}`, w - G.pad, h - 10);
    }
  }

  /* ───────────── controls ───────────── */
  const interval = () => [1100, 820, 600, 430, 300, 210, 140, 90][+speed.value - 1];
  function setPlaying(v) {
    playing = v;
    playBtn.textContent = v ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(v));
    syncDom();
  }
  playBtn.addEventListener('click', () => { if (S.done) { reset(); syncDom(); } setPlaying(!playing); lastStep = 0; });
  stepBtn.addEventListener('click', () => { setPlaying(false); if (S.done) reset(); step(); draw(); });
  resetBtn.addEventListener('click', () => { reset(); syncDom(); draw(); lastStep = performance.now(); });
  fwdBox.addEventListener('change', () => { fwdOn = fwdBox.checked; reset(); syncDom(); lastStep = performance.now(); draw(); });

  reset();
  for (let i = 0; i < 9; i++) step();
  anim.t0 = -1e9;
  syncDom();
  layout(); draw();
  onResize(canvas, () => { layout(); draw(); });

  loop(root, (dt) => {
    const now = performance.now();
    if (playing) {
      if (S.done) {
        if (!doneAt) doneAt = now;
        else if (now - doneAt > 3200) { reset(); syncDom(); lastStep = now; }
      } else if (now - lastStep > interval()) { step(); lastStep = now; }
    }
    draw();
  });
})();
