/* Glare on the metallic gold: a specular highlight sits under the pointer and
   brightens as the pointer gets close (CSS reads --gx/--gy/--ga, see site.css). */
(() => {
  const SEL = '.gold-text, .btn-primary, .stages a, .nav-cta, .ctl';
  const RANGE = 220;                      // px from the element's edge where the glare starts
  const visible = new Set();
  const lit = new WeakMap();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) visible.add(e.target);
      else { visible.delete(e.target); e.target.style.setProperty('--ga', '0'); lit.set(e.target, false); }
    });
  }, { rootMargin: '80px' });
  document.querySelectorAll(SEL).forEach((el) => io.observe(el));

  let px = -1e5, py = -1e5, raf = 0;
  function update() {
    raf = 0;
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - px, 0, px - r.right);
      const dy = Math.max(r.top - py, 0, py - r.bottom);
      const ga = Math.max(0, 1 - Math.hypot(dx, dy) / RANGE);
      if (ga === 0 && !lit.get(el)) continue;
      el.style.setProperty('--gx', (px - r.left).toFixed(1) + 'px');
      el.style.setProperty('--gy', (py - r.top).toFixed(1) + 'px');
      el.style.setProperty('--ga', ga.toFixed(3));
      lit.set(el, ga > 0);
    }
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  const move = (e) => { px = e.clientX; py = e.clientY; queue(); };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', move, { passive: true });
  window.addEventListener('scroll', queue, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { px = py = -1e5; queue(); });
})();
