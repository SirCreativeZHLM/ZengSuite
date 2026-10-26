/* Spring engine + pointer-driven reorder drag (no HTML5 drag and drop). */
(function () {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = new Set(); let raf = 0, last = 0;
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.032); last = now;
    for (const s of [...live]) {
      const w = (2 * Math.PI) / s.resp, k = w * w, c = 2 * s.zeta * w; const h = dt / 4;
      for (let i = 0; i < 4; i++) { const a = -k * (s.x - s.to) - c * s.v; s.v += a * h; s.x += s.v * h; }
      if (Math.abs(s.x - s.to) < s.eps && Math.abs(s.v) < s.eps * 8) { s.x = s.to; s.v = 0; live.delete(s); s.fn && s.fn(s.x); const d = s.done; s.done = null; d && d(); }
      else s.fn && s.fn(s.x);
    }
    raf = live.size ? requestAnimationFrame(tick) : 0;
  }
  class Spring {
    constructor(v, o = {}) { this.x = v; this.to = v; this.v = 0; this.resp = o.response ?? 0.32; this.zeta = o.damping ?? 1; this.eps = o.eps ?? 0.05; this.fn = o.onUpdate; this.done = null; }
    target(t, done) { this.to = t; this.done = done || null; if (reduced()) { this.x = t; this.v = 0; live.delete(this); this.fn && this.fn(t); const d = this.done; this.done = null; d && d(); return this; } live.add(this); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } return this; }
    set(v) { this.x = this.to = v; this.v = 0; live.delete(this); this.fn && this.fn(v); return this; }
    stop() { live.delete(this); }
  }
  const spring = (v, o) => new Spring(v, o);
  // Collapse an element's height to 0 (rows leaving a list).
  function collapse(el, done) {
    const h = el.offsetHeight; el.style.height = h + 'px'; el.style.overflow = 'hidden'; el.style.pointerEvents = 'none';
    const s = spring(h, { response: 0.34, damping: 1, eps: 0.3, onUpdate: (v) => { el.style.height = Math.max(0, v) + 'px'; el.style.opacity = Math.min(1, v / h * 1.6); } });
    s.target(0, done);
  }

  /* dragReorder(e, {el, siblings:[el...], scroller, onMove({idx,x,y}), onDrop({idx,x,y,moved}), onCancel(), hit(x,y)->target|null, onTarget(target|null), onDropTarget(target), threshold})
     el must be in siblings. Items keep their DOM position; transforms show the live order. */
  function dragReorder(e, o) {
    if (e.button !== 0 || !e.isPrimary) return; const x0 = e.clientX, y0 = e.clientY, thr = o.threshold ?? 5; let started = false, ended = false;
    const els = o.siblings; const i0 = els.indexOf(o.el); const sc = o.scroller; let sc0 = 0; let rects, tops, hs, sp, idx = i0, target = null, raf2 = 0, lastEv = e, dragSpr;
    const start = () => {
      started = true; window.ZR.anim.busy = true; o.prepare && o.prepare(); sc0 = sc ? sc.scrollTop : 0; rects = els.map((x) => x.getBoundingClientRect()); hs = rects.map((r) => r.height); tops = rects.map((r) => r.top + sc0);
      sp = els.map((x, i) => (i === i0 ? null : spring(0, { response: 0.28, damping: 0.9, onUpdate: (v) => { x.style.transform = `translate3d(0,${v}px,0)`; } })));
      o.el.classList.add('dragging'); o.el.style.willChange = 'transform'; o.el.style.zIndex = 50; document.body.style.cursor = 'grabbing'; o.onStart && o.onStart();
      loop();
    };
    const dyNow = () => lastEv.clientY - y0 + ((sc ? sc.scrollTop : 0) - sc0);
    const layout = () => {
      const dy = dyNow(); const cy = tops[i0] + hs[i0] / 2 + dy; let n = 0;
      if (target) n = i0; else els.forEach((_, j) => { if (j !== i0 && tops[j] + hs[j] / 2 < cy) n++; });
      idx = n; const sh = hs[i0];
      els.forEach((_, j) => { if (j === i0) return; let t = 0; if (j > i0 && j <= idx) t = -sh; else if (j < i0 && j >= idx) t = sh; sp[j].target(t); });
      o.el.style.transform = `translate3d(${target ? (lastEv.clientX - x0) : 0}px,${dy}px,0)${target ? ' scale(.96)' : ''}`;
      o.onMove && o.onMove({ idx, x: lastEv.clientX, y: lastEv.clientY, dy });
    };
    const loop = () => {
      if (ended) return; if (sc) { const r = sc.getBoundingClientRect(); const y = lastEv.clientY; const edge = 46; if (!target) { if (y < r.top + edge) sc.scrollTop -= (r.top + edge - y) * 0.35; else if (y > r.bottom - edge) sc.scrollTop += (y - (r.bottom - edge)) * 0.35; } }
      layout(); raf2 = requestAnimationFrame(loop);
    };
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return; lastEv = ev;
      if (!started) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < thr) return; start(); }
      if (o.hit) { const t = o.hit(ev.clientX, ev.clientY); if (t !== target) { target = t; o.onTarget && o.onTarget(t); } }
    };
    const cleanup = () => { ended = true; cancelAnimationFrame(raf2); removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', cancel, true); removeEventListener('keydown', key, true); document.body.style.cursor = ''; };
    const reset = () => { window.ZR.anim.busy = false; els.forEach((x) => { x.style.transform = ''; x.style.willChange = ''; x.style.zIndex = ''; x.classList.remove('dragging'); }); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return; lastEv = ev; cleanup(); if (!started) return;
      if (target) { // dropped on an outside target
        dragSpr = spring(1, { response: 0.22, onUpdate: (v) => { o.el.style.opacity = v; } }); sp.forEach((s) => s && s.target(0));
        const t = target; o.onTarget && o.onTarget(null); dragSpr.target(0, () => { reset(); o.onDropTarget && o.onDropTarget(t); }); return;
      }
      layout(); let fin = 0; if (idx > i0) for (let j = i0 + 1; j <= idx; j++) fin += hs[j]; else for (let j = idx; j < i0; j++) fin -= hs[j];
      const dy = dyNow(); const moved = idx !== i0;
      spring(dy, { response: 0.3, damping: 0.85, eps: 0.2, onUpdate: (v) => { o.el.style.transform = `translate3d(0,${v}px,0)`; } }).target(fin, () => { reset(); o.onDrop && o.onDrop({ idx, moved, x: ev.clientX, y: ev.clientY }); });
    };
    const cancel = (ev) => { if (ev && ev.pointerId !== e.pointerId) return; cleanup(); if (started) { sp.forEach((s) => s && s.target(0)); o.onTarget && o.onTarget(null); spring(dyNow(), { response: 0.3, onUpdate: (v) => { o.el.style.transform = `translate3d(0,${v}px,0)`; } }).target(0, () => { reset(); o.onCancel && o.onCancel(); }); } };
    const key = (ev) => { if (ev.key === 'Escape' && started) { ev.preventDefault(); ev.stopPropagation(); cancel(); } };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', cancel, true); addEventListener('keydown', key, true);
    return { cancel };
  }
  window.ZR.anim = { busy: false, spring, Spring, collapse, dragReorder, reduced };
})();
