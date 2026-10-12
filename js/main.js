/* Page chrome: nav state, pipeline-stage tracking, reveals, decoder, copy. */
(() => {
  const { reduced } = MT;
  const doc = document.documentElement;
  if (!reduced) doc.classList.add('js-motion');

  /* nav: glass after scrolling, stage = section in view, progress bar */
  const nav = document.getElementById('nav');
  const bar = document.getElementById('nav-progress');
  const links = [...document.querySelectorAll('.stages a')];
  const sections = [...document.querySelectorAll('main > section[data-stage]')];
  let active = -1;
  function onScroll() {
    const y = window.scrollY, vh = window.innerHeight;
    nav.classList.toggle('is-scrolled', y > 24);
    const max = doc.scrollHeight - vh;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    let idx = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.4) idx = i; });
    if (max - y < 4) idx = sections.length - 1;
    if (idx !== active) {
      active = idx;
      links.forEach((a, i) => {
        a.classList.toggle('is-active', i === idx);
        if (i === idx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
  }
  let ticking = false;
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* reveals: content is visible at rest; this only adds the motion */
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll('.reveal, .bars').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.reveal, .bars').forEach((el) => el.classList.add('is-in'));
  }

  /* hero name decodes from random glyphs on load */
  const name = document.getElementById('hero-name');
  if (name && !reduced) {
    const spans = [...name.querySelectorAll('span')];
    const finals = spans.map((s) => s.textContent);
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const t0 = performance.now(), dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      spans.forEach((s, k) => {
        const f = finals[k];
        const lead = Math.max(0, p * 1.25 - k * 0.18);
        let txt = '';
        for (let i = 0; i < f.length; i++) txt += i / f.length < lead ? f[i] : glyphs[(Math.random() * glyphs.length) | 0];
        s.textContent = txt;
      });
      if (p < 1) requestAnimationFrame(tick); else spans.forEach((s, k) => (s.textContent = finals[k]));
    };
    requestAnimationFrame(tick);
  }

  /* decoder: one field at a time */
  const fields = [...document.querySelectorAll('.dec-field')];
  fields.forEach((f) => f.addEventListener('click', () => {
    fields.forEach((g) => {
      const on = g === f;
      g.setAttribute('aria-pressed', String(on));
      document.getElementById(g.dataset.panel).hidden = !on;
    });
  }));

  /* copy email */
  const copy = document.getElementById('copy-email');
  if (copy) copy.addEventListener('click', () => {
    const text = copy.dataset.copy;
    const done = (msg) => { copy.textContent = msg; setTimeout(() => (copy.textContent = 'Copy'), 1800); };
    const fallback = () => {
      const el = document.getElementById('email-text');
      const range = document.createRange(); range.selectNodeContents(el);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      done('Selected');
    };
    try {
      navigator.clipboard.writeText(text).then(() => done('Copied'), fallback);
    } catch (e) { fallback(); }
  });
})();
