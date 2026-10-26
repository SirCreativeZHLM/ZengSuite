/* Editor core: state, history, canvas view, rulers/guides, selection overlay and pointer interactions. */
(() => {
  const K = window.K;
  const $ = (s) => document.querySelector(s);
  const A = (window.A = {
    deck: null, cur: 0, sel: [], mode: 'slides', layIdx: 0, tool: null, cell: null, editing: null, els: new Map(),
    view: { zoom: 'fit', z: 1, grid: false, gridSize: 20, snapGrid: false, rulers: true, smart: true, notes: true, nav: true, insp: true },
    clip: null, listeners: {},
  });
  A.on = (n, f) => ((A.listeners[n] ||= []).push(f), f);
  A.emit = (n, ...a) => (A.listeners[n] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });

  const stage = $('#stage'), slWrap = $('#slidewrap'), sl = $('#sl'), ov = $('#ov');
  A.stage = stage;
  const pseudo = new WeakMap();
  A.curSlide = () => { const d = A.deck; if (A.mode === 'layouts') { const lay = d.layouts[A.layIdx] || d.layouts[0]; let p = pseudo.get(lay); if (!p) { p = K.layoutAsSlide(d, lay); pseudo.set(lay, p); } p.objs = lay.objs; p.bg = lay.bg; return p; } return d.slides[A.cur]; };
  A.objs = () => A.curSlide().objs;
  A.selObjs = () => { const os = A.objs(); return A.sel.map((id) => os.find((o) => o.id === id)).filter(Boolean); };
  A.byId = (id) => K.findObj(A.objs(), id);
  A.elOf = (id) => A.els.get(id);
  const z = () => A.view.z;

  // ---------- history ----------
  const H = { stack: [], idx: -1 };
  const metaOf = () => JSON.stringify({ size: A.deck.size, theme: A.deck.theme, layouts: A.deck.layouts, opts: A.deck.opts, cur: A.cur });
  const snap = () => { const prev = H.stack[H.idx]; const slides = A.deck.slides.map((s, i) => { const j = JSON.stringify(s); const p = prev && prev.slides.find((x) => x === j); return p || j; }); return { meta: metaOf(), slides }; };
  A.resetHistory = () => { H.stack = [snap()]; H.idx = 0; A.emit('history'); };
  A.commit = (label) => {
    const s = snap(), p = H.stack[H.idx];
    if (p && p.meta === s.meta && p.slides.length === s.slides.length && p.slides.every((x, i) => x === s.slides[i])) return false;
    H.stack.length = H.idx + 1; H.stack.push(s); H.idx++; if (H.stack.length > 120) { H.stack.shift(); H.idx--; }
    A.emit('commit', label); return true;
  };
  const restore = (s) => {
    const m = JSON.parse(s.meta); const d = A.deck; d.size = m.size; d.theme = m.theme; d.layouts = m.layouts; d.opts = m.opts; d.slides = s.slides.map((j) => JSON.parse(j));
    A.cur = Math.min(Math.max(0, A.cur), d.slides.length - 1); A.endEdit(false); pseudoReset();
    const ids = new Set(); K.walk(A.objs(), (o) => ids.add(o.id)); A.sel = A.sel.filter((i) => ids.has(i)); A.cell = null;
    A.render(); A.emit('restore'); A.emit('commit', 'undo');
  };
  const pseudoReset = () => { };
  A.undo = () => { if (A.editing && document.activeElement && document.activeElement.isContentEditable) { document.execCommand('undo'); return; } if (H.idx > 0) { H.idx--; restore(H.stack[H.idx]); } };
  A.redo = () => { if (A.editing && document.activeElement && document.activeElement.isContentEditable) { document.execCommand('redo'); return; } if (H.idx < H.stack.length - 1) { H.idx++; restore(H.stack[H.idx]); } };
  A.canUndo = () => H.idx > 0; A.canRedo = () => H.idx < H.stack.length - 1;

  // ---------- selection ----------
  A.select = (ids, add) => { ids = [].concat(ids || []); A.sel = add ? [...new Set([...A.sel, ...ids])] : ids; A.cell = null; A.overlay(); A.emit('select'); };
  A.toggleSel = (id) => { A.sel = A.sel.includes(id) ? A.sel.filter((x) => x !== id) : [...A.sel, id]; A.cell = null; A.overlay(); A.emit('select'); };

  // ---------- view ----------
  A.computeZoom = () => {
    const d = A.deck; if (!d) return; const pad = 56; const aw = Math.max(100, stage.clientWidth - pad), ah = Math.max(100, stage.clientHeight - pad);
    A.view.z = A.view.zoom === 'fit' ? Math.max(0.1, Math.min(aw / d.size.w, ah / d.size.h)) : A.view.zoom;
    slWrap.style.width = d.size.w * A.view.z + 'px'; slWrap.style.height = d.size.h * A.view.z + 'px';
    const ks = sl.firstChild; if (ks) ks.style.transform = `scale(${A.view.z})`;
    $('#st-zoom').textContent = Math.round(A.view.z * 100) + '%';
  };
  A.setZoom = (zoom) => { A.view.zoom = zoom === 'fit' ? 'fit' : Math.max(0.1, Math.min(4, zoom)); A.computeZoom(); A.overlay(); A.drawRulers(); };
  A.zoomBy = (f) => A.setZoom(A.view.z * f);

  A.render = () => {
    const d = A.deck; if (!d) return; const s = A.curSlide();
    const lm = A.mode === 'layouts'; document.body.classList.toggle('layout-mode', lm);
    const ks = K.renderSlide(d, s, { index: A.cur, edit: true, layoutMode: lm }); sl.replaceChildren(ks);
    A.els = new Map(); ks.querySelectorAll('.ko[data-id]').forEach((e) => A.els.set(e.dataset.id, e));
    A.computeZoom(); K.fit(ks); if (A.editing) A.editing = null;
    A.overlay(); A.drawRulers(); A.emit('render');
  };
  A.renderObj = (id) => {
    const o = A.byId(id); const old = A.els.get(id); if (!o || !old) return; const s = A.curSlide();
    const e = K.renderObject(A.deck, o, { index: A.cur, edit: true, objs: s.objs, slide: s }); if (!e) { old.remove(); A.els.delete(id); return; }
    old.replaceWith(e); A.els.set(id, e); if (o.type === 'group') K.walk(o.kids, (k) => { const ke = e.querySelector(`[data-id="${k.id}"]`); ke && A.els.set(k.id, ke); });
    if (o.type === 'text' || o.type === 'shape') K.fit(e);
  };
  A.renderConns = (ids) => { const os = A.objs(); K.walk(os, (o) => { if (o.type === 'conn' && (!ids || ids.has(o.a.id) || ids.has(o.b.id) || ids.has(o.id))) A.renderObj(o.id); }); };
  A.changed = (label, ids) => { ids ? ids.forEach((i) => A.renderObj(i)) : A.render(); A.overlay(); A.commit(label); A.emit('edited'); };

  // ---------- coordinates ----------
  let wrapRect = null; const upd = () => (wrapRect = slWrap.getBoundingClientRect());
  const P = (e) => { if (!wrapRect) upd(); return { x: (e.clientX - wrapRect.left) / z(), y: (e.clientY - wrapRect.top) / z() }; };
  A.pt = P;
  stage.addEventListener('scroll', () => { wrapRect = null; A.drawRulers(); });
  new ResizeObserver(() => { wrapRect = null; if (A.view.zoom === 'fit') A.computeZoom(); A.overlay(); A.drawRulers(); }).observe(stage);

  // ---------- rulers & guides ----------
  const rh = $('#ruler-h'), rv = $('#ruler-v');
  const rc = (host) => { let c = host.firstChild; if (!c) { c = document.createElement('canvas'); host.append(c); } return c; };
  A.drawRulers = () => {
    if (!A.deck || !A.view.rulers) return; const sr = stage.getBoundingClientRect(); upd(); const dpr = window.devicePixelRatio || 1;
    const cs = getComputedStyle(document.documentElement); const fg = cs.getPropertyValue('--fg-2').trim() || '#888';
    const draw = (host, horiz) => {
      const c = rc(host), len = horiz ? host.clientWidth : host.clientHeight, th = 22; c.width = (horiz ? len : th) * dpr; c.height = (horiz ? th : len) * dpr; c.style.width = (horiz ? len : th) + 'px'; c.style.height = (horiz ? th : len) + 'px';
      const g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = fg; g.strokeStyle = fg; g.font = '9px -apple-system, Inter, sans-serif'; g.lineWidth = 1;
      const off = horiz ? wrapRect.left - sr.left : wrapRect.top - sr.top;
      const zz = z(); const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; const step = steps.find((s) => s * zz >= 52) || 1000; const minor = step / 5 >= 1 && step * zz / 5 >= 7 ? step / 5 : 0;
      const total = (horiz ? A.deck.size.w : A.deck.size.h);
      const start0 = -off / zz, end0 = (len - off) / zz;
      for (let v = Math.floor(Math.min(0, start0) / step) * step; v <= Math.max(total, end0); v += (minor || step)) {
        const p = off + v * zz; if (p < -20 || p > len + 20) continue; const major = Math.abs(v % step) < 1e-6;
        g.globalAlpha = major ? 0.7 : 0.35; g.beginPath(); if (horiz) { g.moveTo(p + 0.5, major ? 12 : 17); g.lineTo(p + 0.5, th); } else { g.moveTo(major ? 12 : 17, p + 0.5); g.lineTo(th, p + 0.5); } g.stroke();
        if (major && v >= 0 && v <= total) { g.globalAlpha = 0.85; if (horiz) g.fillText(String(Math.round(v)), p + 3, 10); else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.fillText(String(Math.round(v)), -(String(Math.round(v)).length * 5), 0); g.restore(); } }
      }
      g.globalAlpha = 0.5; g.fillStyle = 'rgba(10,132,255,1)'; const sel = A.selObjs(); if (sel.length) { const b = K.bbox(sel); const a = off + (horiz ? b.x : b.y) * zz, w2 = (horiz ? b.w : b.h) * zz; g.fillRect(horiz ? a : 16, horiz ? 16 : a, horiz ? w2 : 6, horiz ? 6 : w2); }
    };
    draw(rh, true); draw(rv, false);
  };
  const guides = () => (A.curSlide().guides ||= []);
  const rulerDrag = (host, horiz) => host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; host.setPointerCapture(e.pointerId); upd(); const s = A.curSlide(); const g = { o: horiz ? 'h' : 'v', p: 0 }; (s.guides ||= []).push(g);
    const mv = (ev) => { g.p = Math.round(horiz ? P(ev).y : P(ev).x); A.overlay(); tip(ev, Math.round(g.p) + ' pt'); }; mv(e);
    const up = () => { host.removeEventListener('pointermove', mv); host.removeEventListener('pointerup', up); clearTip(); const max = horiz ? A.deck.size.h : A.deck.size.w; if (g.p < 0 || g.p > max) s.guides = s.guides.filter((x) => x !== g); A.overlay(); A.commit('Guide'); };
    host.addEventListener('pointermove', mv); host.addEventListener('pointerup', up);
  });
  rulerDrag(rh, true); rulerDrag(rv, false);

  // ---------- tooltips ----------
  let tipEl = null;
  const tip = (e, text) => { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; ov.append(tipEl); } tipEl.textContent = text; upd(); tipEl.style.left = e.clientX - wrapRect.left + 14 + 'px'; tipEl.style.top = e.clientY - wrapRect.top + 16 + 'px'; };
  const clearTip = () => { tipEl && tipEl.remove(); tipEl = null; };

  // ---------- overlay ----------
  const div = (cls, css) => { const d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; return d; };
  let live = { guides: [], marquee: null, sites: null, crop: null };
  A.live = live;
  const CUR = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
  const hcur = (hx, hy, rot) => { let a = Math.atan2(hy, hx) * 180 / Math.PI + rot; a = ((a % 180) + 180) % 180; return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(a / 45) % 4]; };
  const HD = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
  const ADJ = {
    roundRect: { get: (w, h, a) => [Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(0.5, x / Math.min(w, h)))] },
    snip1Rect: { get: (w, h, a) => [w - Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(0.5, (w - x) / Math.min(w, h)))] },
    snip2SameRect: { get: (w, h, a) => [Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(0.5, x / Math.min(w, h)))] },
    round1Rect: { get: (w, h, a) => [w - Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(0.5, (w - x) / Math.min(w, h)))] },
    round2SameRect: { get: (w, h, a) => [Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(0.5, x / Math.min(w, h)))] },
    parallelogram: { get: (w, h, a) => [Math.min(w, h) * a[0] * 1.4, 0], set: (w, h, x) => [Math.max(0, Math.min(0.6, x / Math.min(w, h) / 1.4))] },
    trapezoid: { get: (w, h, a) => [Math.min(w, h) * a[0] * 1.4, 0], set: (w, h, x) => [Math.max(0, Math.min(0.6, x / Math.min(w, h) / 1.4))] },
    hexagon: { get: (w, h, a) => [w * a[0], 0], set: (w, h, x) => [Math.max(0.02, Math.min(0.5, x / w))] },
    octagon: { get: (w, h, a) => [Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0.02, Math.min(0.5, x / Math.min(w, h)))] },
    plus: { get: (w, h, a) => [w * a[0], 0], set: (w, h, x) => [Math.max(0.05, Math.min(0.5, x / w))] },
    triangle: { get: (w, h, a) => [w * a[0], 0], set: (w, h, x) => [Math.max(0, Math.min(1, x / w))] },
    frame: { get: (w, h, a) => [Math.min(w, h) * a[0], 0], set: (w, h, x) => [Math.max(0.02, Math.min(0.45, x / Math.min(w, h)))] },
    donut: { get: (w, h, a) => [Math.min(w, h) * a[0], h / 2], set: (w, h, x) => [Math.max(0.02, Math.min(0.48, x / Math.min(w, h)))] },
    chevron: { get: (w, h, a) => [w - Math.min(w, h * a[0] * 2), 0], set: (w, h, x) => [Math.max(0.05, Math.min(1, (w - x) / (h * 2)))] },
    homePlate: { get: (w, h, a) => [w - Math.min(w, h * a[0] * 2), 0], set: (w, h, x) => [Math.max(0.05, Math.min(1, (w - x) / (h * 2)))] },
  };
  ['wedgeRectCallout', 'wedgeRoundRectCallout', 'wedgeEllipseCallout', 'cloudCallout', 'borderCallout1'].forEach((id) => (ADJ[id] = { get: (w, h, a) => [w * (0.5 + a[0]), h * (0.5 + a[1])], set: (w, h, x, y) => [x / w - 0.5, y / h - 0.5] }));
  [4, 5, 6, 7, 8, 10, 12, 16, 24, 32].forEach((n) => (ADJ['star' + n] = { get: (w, h, a) => [w / 2, h / 2 - (h / 2) * a[0]], set: (w, h, x, y) => [Math.max(0.05, Math.min(1, (h / 2 - y) / (h / 2)))] }));
  ['rightArrow', 'leftArrow', 'upArrow', 'downArrow'].forEach((id) => (ADJ[id] = { get: (w, h, a) => { const t = (id === 'upArrow' || id === 'downArrow' ? w : h) * a[0]; return id === 'rightArrow' ? [w - Math.min(w, h * a[1] * 2), (h - t) / 2] : id === 'leftArrow' ? [Math.min(w, h * a[1] * 2), (h - t) / 2] : id === 'upArrow' ? [(w - t) / 2, Math.min(h, w * a[1] * 2)] : [(w - t) / 2, h - Math.min(h, w * a[1] * 2)]; }, set: (w, h, x, y, a) => (id === 'rightArrow' ? [a[0], Math.max(0.05, Math.min(1, (w - x) / (h * 2)))] : id === 'leftArrow' ? [a[0], Math.max(0.05, Math.min(1, x / (h * 2)))] : id === 'upArrow' ? [a[0], Math.max(0.05, Math.min(1, y / (w * 2)))] : [a[0], Math.max(0.05, Math.min(1, (h - y) / (w * 2)))]) }));
  A.ADJ = ADJ;
  const curAdj = (o) => { const s = K.shapes[o.shape]; return (o.adj && o.adj.length ? o.adj : s.a).map((v, i) => (v == null ? s.a[i] : v)); };

  A.overlay = () => {
    if (!A.deck) return; ov.replaceChildren(); const Z = z(); tipEl = null;
    if (A.view.grid) { const g = div('gridov'); const gs = A.view.gridSize * Z; g.style.backgroundSize = `${gs}px ${gs}px`; ov.append(g); }
    for (const gd of A.curSlide().guides || []) { const g = div('gline ' + gd.o); g.style.cssText = gd.o === 'v' ? `left:${gd.p * Z - 4}px;width:9px;top:-4000px;bottom:-4000px;background:linear-gradient(90deg,transparent 4px,#00c2ff 4px,#00c2ff 5px,transparent 5px);pointer-events:auto;cursor:col-resize` : `top:${gd.p * Z - 4}px;height:9px;left:-4000px;right:-4000px;background:linear-gradient(180deg,transparent 4px,#00c2ff 4px,#00c2ff 5px,transparent 5px);pointer-events:auto;cursor:row-resize`; g.dataset.gd = '1'; g._g = gd; ov.append(g); }
    const sel = A.selObjs();
    if (A.editing) { drawLive(); return; }
    if (sel.length === 1 && sel[0].type === 'conn') drawConnSel(sel[0]);
    else if (sel.length === 1) drawBox(sel[0], true);
    else if (sel.length > 1) { sel.forEach((o) => drawBox(o, false)); drawMulti(sel); }
    if (A.cell && sel.length === 1 && sel[0].type === 'table') drawCell(sel[0]);
    drawLive();
  };
  function drawBox(o, handles) {
    const Z = z(); const b = div('sel-box' + (o.lock ? ' locked' : '') + (o.type === 'group' ? ' multi' : ''));
    if (o.type === 'group') { const bb = K.bbox(o.kids); b.style.cssText = `left:${bb.x * Z}px;top:${bb.y * Z}px;width:${bb.w * Z}px;height:${bb.h * Z}px;`; for (const k of o.kids) { const kb = div('sel-box group-kid'); kb.style.cssText = `left:${k.x * Z}px;top:${k.y * Z}px;width:${k.w * Z}px;height:${k.h * Z}px;transform:rotate(${k.rot || 0}deg)`; ov.append(kb); } }
    else b.style.cssText = `left:${o.x * Z}px;top:${o.y * Z}px;width:${o.w * Z}px;height:${o.h * Z}px;transform:rotate(${o.rot || 0}deg)`;
    ov.append(b); if (!handles || o.lock) return;
    if (A.live.crop === o.id) { addHandles(b, o, true); return; }
    addHandles(b, o);
    if (o.type === 'shape' && ADJ[o.shape]) { const [x, y] = ADJ[o.shape].get(o.w, o.h, curAdj(o)); const h = div('hdl adj'); h.style.left = x * Z + 'px'; h.style.top = y * Z + 'px'; h.dataset.h = 'adj'; h.style.cursor = 'pointer'; b.append(h); }
  }
  function addHandles(b, o, crop) {
    const Z = z(), w = o.w * Z, h = o.h * Z, rot = o.rot || 0; const small = w < 26 || h < 26;
    for (const [id, hx, hy] of HD) { if (small && (hx === 0 || hy === 0)) continue; const e = div('hdl' + (crop ? ' crop' : '')); e.style.left = (hx + 1) * 50 + '%'; e.style.top = (hy + 1) * 50 + '%'; e.dataset.h = id; e.style.cursor = hcur(hx, hy, rot); b.append(e); }
    if (!crop && o.type !== 'table' && o.type !== 'chart') { const r = div('hdl rot'); r.style.left = '50%'; r.style.top = '-24px'; r.dataset.h = 'rot'; b.append(r); const l = div('rot-line'); l.style.cssText = 'left:50%;top:-24px;height:24px'; b.append(l); }
  }
  function drawMulti(sel) {
    const Z = z(); const bb = K.bbox(sel); const b = div('sel-box multi'); b.style.cssText = `left:${bb.x * Z}px;top:${bb.y * Z}px;width:${bb.w * Z}px;height:${bb.h * Z}px`; ov.append(b);
    if (sel.some((o) => o.lock)) return; addHandles(b, { w: bb.w, h: bb.h, rot: 0 });
  }
  function drawConnSel(o) {
    const Z = z(); for (const [k, p] of [['a', o.a], ['b', o.b]]) { const h = div('hdl end'); h.style.left = p.x * Z + 'px'; h.style.top = p.y * Z + 'px'; h.dataset.h = 'c' + k; h.style.cursor = 'crosshair'; ov.append(h); }
    const bb = div('sel-box group-kid'); bb.style.cssText = `left:${o.x * Z}px;top:${o.y * Z}px;width:${o.w * Z}px;height:${o.h * Z}px`; ov.append(bb);
  }
  function drawCell(t) {
    const Z = z(), c = A.cell; let x = 0, y = 0; for (let i = 0; i < c.c1; i++) x += t.cw[i]; for (let i = 0; i < c.r1; i++) y += t.rh[i]; let w = 0, h = 0; for (let i = c.c1; i <= c.c2; i++) w += t.cw[i]; for (let i = c.r1; i <= c.r2; i++) h += t.rh[i];
    const b = div('sel-box'); b.style.cssText = `left:${(t.x + x) * Z}px;top:${(t.y + y) * Z}px;width:${w * Z}px;height:${h * Z}px;border-color:var(--accent);background:rgba(var(--accent-rgb),.12)`; ov.append(b);
  }
  function drawLive() {
    const Z = z(); const L = A.live;
    for (const g of L.guides) { const d = div('sguide ' + g.o); if (g.o === 'v') d.style.cssText = `left:${g.p * Z}px;top:${g.a * Z}px;height:${(g.b - g.a) * Z}px`; else d.style.cssText = `top:${g.p * Z}px;left:${g.a * Z}px;width:${(g.b - g.a) * Z}px`; ov.append(d); }
    if (L.marquee) { const m = L.marquee; const d = div('marquee'); d.style.cssText = `left:${m.x * Z}px;top:${m.y * Z}px;width:${m.w * Z}px;height:${m.h * Z}px`; ov.append(d); }
    if (L.sites) { const o = L.sites.obj; K.sites(o.w, o.h).forEach((s, i) => { const p = K.siteXY(o, i); const d = div('conn-site' + (L.sites.site === i ? ' on' : '')); d.style.left = p[0] * Z + 'px'; d.style.top = p[1] * Z + 'px'; ov.append(d); }); }
  }
  A.liveOverlay = () => A.overlay();

  // ---------- geometry snapshots ----------
  const geomOf = (o) => { const g = { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot }; if (o.a) { g.a = { ...o.a }; g.b = { ...o.b }; } if (o.kids) g.kids = o.kids.map(geomOf); if (o.cw) { g.cw = o.cw.slice(); g.rh = o.rh.slice(); } if (o.ts && o.ts.sz) g.sz = o.ts.sz; return g; };
  const setGeom = (o, g) => { o.x = g.x; o.y = g.y; o.w = g.w; o.h = g.h; o.rot = g.rot; if (g.a) { o.a = { ...g.a }; o.b = { ...g.b }; } if (g.kids) o.kids.forEach((k, i) => setGeom(k, g.kids[i])); if (g.cw) { o.cw = g.cw.slice(); o.rh = g.rh.slice(); } };
  A.geomOf = geomOf; A.setGeom = setGeom;

  // ---------- snapping ----------
  const snapTargets = (excl) => {
    const d = A.deck, W = d.size.w, H = d.size.h; const xs = [{ p: 0 }, { p: W / 2 }, { p: W }], ys = [{ p: 0 }, { p: H / 2 }, { p: H }];
    for (const g of A.curSlide().guides || []) (g.o === 'v' ? xs : ys).push({ p: g.p });
    if (A.view.smart) for (const o of A.objs()) { if (excl.has(o.id) || o.hid) continue; const b = K.bbox([o]); [b.x, b.x + b.w / 2, b.x + b.w].forEach((p) => xs.push({ p, a: b.y, b: b.y + b.h })); [b.y, b.y + b.h / 2, b.y + b.h].forEach((p) => ys.push({ p, a: b.x, b: b.x + b.w })); }
    return { xs, ys };
  };
  const snapAxis = (vals, list, thr, grid) => {
    let best = null;
    for (const v of vals) for (const t of list) { const dd = t.p - v; if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, t, v }; }
    if (!best && grid) { const gs = A.view.gridSize; let bd = null; for (const v of vals) { const dd = Math.round(v / gs) * gs - v; if (Math.abs(dd) <= thr && (bd === null || Math.abs(dd) < Math.abs(bd))) bd = dd; } if (bd !== null) return { d: bd, t: null }; }
    return best;
  };
  const snapBox = (bb, tg, thr, noSnap) => {
    const L = []; let dx = 0, dy = 0; if (noSnap) return { dx, dy, L };
    const gridOn = A.view.snapGrid;
    const sx = snapAxis([bb.x, bb.x + bb.w / 2, bb.x + bb.w], tg.xs, thr, gridOn), sy = snapAxis([bb.y, bb.y + bb.h / 2, bb.y + bb.h], tg.ys, thr, gridOn);
    if (sx) { dx = sx.d; } if (sy) { dy = sy.d; }
    const fb = { x: bb.x + dx, y: bb.y + dy, w: bb.w, h: bb.h };
    for (const [axis, s] of [['v', sx], ['h', sy]]) { if (!s || !s.t) continue; const p = s.t.p; const a = s.t.a ?? 0, b = s.t.b ?? (axis === 'v' ? A.deck.size.h : A.deck.size.w); const m0 = axis === 'v' ? fb.y : fb.x, m1 = axis === 'v' ? fb.y + fb.h : fb.x + fb.w; L.push({ o: axis, p, a: s.t.a == null ? 0 : Math.min(a, m0), b: s.t.a == null ? (axis === 'v' ? A.deck.size.h : A.deck.size.w) : Math.max(b, m1) }); }
    return { dx, dy, L };
  };

  // ---------- hit testing ----------
  const topId = (t) => { let e = t.closest && t.closest('.ko'); if (!e) return null; while (e.parentElement && e.parentElement.closest('.ko.grp')) e = e.parentElement.closest('.ko.grp'); return e.dataset.id; };
  const objsIn = (r) => A.objs().filter((o) => { if (o.hid) return false; const b = K.bbox([o]); return b.x + b.w >= r.x && b.x <= r.x + r.w && b.y + b.h >= r.y && b.y <= r.y + r.h; });

  // ---------- gestures ----------
  let G = null;
  const raf = (fn) => { let q = false, last; return (...a) => { last = a; if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...last); }); }; };
  const begin = (e, g) => { G = g; g.id = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch { } upd(); };

  stage.addEventListener('pointerdown', (e) => {
    if (!A.deck || G) return; if (e.target.closest('#notes-wrap')) return;
    if (A.editing) { const inside = A.editing.el.contains(e.target) || (e.target.closest && e.target.closest('.editing-box')); if (inside) return; A.endEdit(true); }
    upd(); const hd = e.target.closest && e.target.closest('.hdl'); if (hd && e.button === 0) return startHandle(e, hd.dataset.h);
    const gl = e.target.closest && e.target.closest('[data-gd]'); if (gl && e.button === 0) return startGuide(e, gl._g);
    if (e.button === 2) { const id = topId(e.target); if (id && !A.sel.includes(id)) A.select([id]); return; }
    if (e.button !== 0) return;
    if (A.tool) return startCreate(e);
    const id = topId(e.target); const p = P(e);
    if (id) {
      const mod = e.shiftKey || e.metaKey || e.ctrlKey; const o = A.byId(id);
      if (mod) { A.toggleSel(id); return; }
      if (o.type === 'table' && A.sel.length === 1 && A.sel[0] === id) { const td = e.target.closest('td'); if (td) { const r = +td.dataset.r, c = +td.dataset.c; A.cell = { r1: r, c1: c, r2: r, c2: c, anchor: [r, c] }; A.overlay(); A.emit('select'); } }
      if (!A.sel.includes(id)) A.select([id]);
      if (o.type === 'media' && !e.detail) { /* click selects only */ }
      startMove(e, p); return;
    }
    // empty space: marquee
    if (!(e.shiftKey)) A.select([]);
    begin(e, { type: 'marquee', p0: p, base: e.shiftKey ? A.sel.slice() : [] });
  });
  stage.addEventListener('pointermove', (e) => { if (!G || G.id !== e.pointerId) return; G.move && G.move(e); });
  const endG = (e) => { if (!G || G.id !== e.pointerId) return; const g = G; G = null; try { stage.releasePointerCapture(e.pointerId); } catch { } g.up && g.up(e); A.live.guides = []; A.live.sites = null; A.live.marquee = null; clearTip(); A.overlay(); };
  stage.addEventListener('pointerup', endG); stage.addEventListener('pointercancel', endG);

  function startGuide(e, gd) {
    const s = A.curSlide();
    begin(e, { type: 'guide', move: (ev) => { const p = P(ev); gd.p = Math.round(gd.o === 'v' ? p.x : p.y); A.overlay(); tip(ev, gd.p + ' pt'); }, up: () => { const max = gd.o === 'v' ? A.deck.size.w : A.deck.size.h; if (gd.p < -2 || gd.p > max + 2) s.guides = s.guides.filter((g) => g !== gd); A.commit('Guide'); } });
  }

  function startMove(e, p0) {
    let objs = A.selObjs().filter((o) => !o.lock); if (!objs.length) return;
    const g = { type: 'move', moved: false, down: { x: e.clientX, y: e.clientY }, objs, orig: null, dup: false };
    const prep = () => {
      if (e.altKey && !g.dup) { g.dup = true; const copies = objs.map((o) => K.dupObj(o)); const os = A.objs(); copies.forEach((c) => os.push(c)); objs = copies; A.sel = copies.map((c) => c.id); A.render(); }
      g.objs = objs; g.orig = new Map(objs.map((o) => [o, geomOf(o)])); g.bb = K.bbox(objs); g.tg = snapTargets(new Set(objs.map((o) => o.id)));
      // detach moved connectors
      const ids = new Set(); K.walk(objs, (o) => ids.add(o.id)); objs.forEach((o) => { if (o.type === 'conn') { if (!(o.a.id && ids.has(o.a.id))) o.a.id = null; if (!(o.b.id && ids.has(o.b.id))) o.b.id = null; } });
    };
    const draw = raf(() => {
      if (!g.dx && !g.dy && !g.moved) return;
      for (const o of g.objs) { setGeom(o, g.orig.get(o)); K.moveObj(o, g.dx, g.dy); }
      const moveEl = (o) => { const el = A.els.get(o.id); if (!el) return; if (o.type === 'group') { o.kids.forEach(moveEl); } else if (o.type === 'conn') { } else { el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; } };
      g.objs.forEach(moveEl); const ids = new Set(); K.walk(g.objs, (o) => ids.add(o.id)); A.renderConns(ids); A.overlay(); upThumb();
    });
    g.move = (ev) => {
      if (!g.moved) { if (Math.hypot(ev.clientX - g.down.x, ev.clientY - g.down.y) < 3) return; g.moved = true; prep(); }
      let dx = (ev.clientX - g.down.x) / z(), dy = (ev.clientY - g.down.y) / z();
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const bb = { x: g.bb.x + dx, y: g.bb.y + dy, w: g.bb.w, h: g.bb.h };
      const sn = snapBox(bb, g.tg, 6 / z(), ev.metaKey || ev.ctrlKey);
      g.dx = dx + (ev.shiftKey && dx === 0 ? 0 : sn.dx); g.dy = dy + (ev.shiftKey && dy === 0 ? 0 : sn.dy); A.live.guides = sn.L; draw();
    };
    g.up = () => { if (g.moved) { g.objs.forEach((o) => o.type === 'group' && K.regroup(o)); A.changed('Move'); A.emit('edited'); } else A.emit('select'); };
    begin(e, g);
  }
  const upThumb = (() => { let t = 0; return () => { const n = performance.now(); if (n - t > 150) { t = n; A.emit('live'); } }; })();

  function startMarquee() { }
  const marqueeMove = (ev) => { const g = G; const p = P(ev); const r = { x: Math.min(g.p0.x, p.x), y: Math.min(g.p0.y, p.y), w: Math.abs(p.x - g.p0.x), h: Math.abs(p.y - g.p0.y) }; A.live.marquee = r; A.sel = [...new Set([...g.base, ...objsIn(r).map((o) => o.id)])]; A.overlay(); A.emit('select'); };
  const _begin = begin; // marquee handler injected via type
  stage.addEventListener('pointermove', (e) => { if (G && G.type === 'marquee' && G.id === e.pointerId) marqueeMove(e); });

  // handles
  function startHandle(e, h) {
    const objs = A.selObjs(); if (!objs.length) return; const single = objs.length === 1 ? objs[0] : null;
    if (h === 'adj' && single) return startAdj(e, single);
    if ((h === 'ca' || h === 'cb') && single) return startConnEnd(e, single, h === 'ca' ? 'a' : 'b');
    if (A.live.crop && single && h !== 'rot') return startCropResize(e, single, h);
    if (h === 'rot') return startRotate(e, objs);
    return startResize(e, objs, h);
  }
  function startAdj(e, o) {
    const orig = curAdj(o).slice(); const def = ADJ[o.shape]; const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    begin(e, { type: 'adj', move: raf((ev) => { const p = P(ev); const [lx, ly] = K.rotPt(p.x, p.y, c.x, c.y, -(o.rot || 0)); const x = lx - o.x, y = ly - o.y; o.adj = def.set(o.w, o.h, x, y, orig); A.renderObj(o.id); A.overlay(); }), up: () => A.changed('Adjust Shape', [o.id]) });
  }
  function startRotate(e, objs) {
    const bb = K.bbox(objs); const c = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }; const single = objs.length === 1; const p0 = P(e); const a0 = Math.atan2(p0.y - c.y, p0.x - c.x) * 180 / Math.PI;
    const orig = new Map(objs.map((o) => [o, geomOf(o)]));
    begin(e, { type: 'rotate', move: raf((ev) => {
      const p = P(ev); let da = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI - a0;
      if (single) { let r = (orig.get(objs[0]).rot || 0) + da; if (ev.shiftKey) r = Math.round(r / 15) * 15; r = ((r % 360) + 360) % 360; da = r - (orig.get(objs[0]).rot || 0); }
      else if (ev.shiftKey) da = Math.round(da / 15) * 15;
      for (const o of objs) { setGeom(o, orig.get(o)); if (single) o.rot = (((orig.get(o).rot || 0) + da) % 360 + 360) % 360; else K.rotateAbout(o, c.x, c.y, da); A.renderObj(o.id); }
      A.renderConns(new Set(objs.map((o) => o.id))); A.overlay(); tip(ev, Math.round(single ? objs[0].rot : da) + '°'); upThumb();
    }), up: () => A.changed('Rotate') });
  }
  function startResize(e, objs, h) {
    const hd = HD.find((x) => x[0] === h); const hx = hd[1], hy = hd[2]; const single = objs.length === 1 ? objs[0] : null;
    const box = single ? { x: single.x, y: single.y, w: single.w, h: single.h, rot: single.rot || 0 } : { ...K.bbox(objs), rot: 0 };
    const orig = new Map(objs.map((o) => [o, geomOf(o)])); const p0 = P(e); const cx0 = box.x + box.w / 2, cy0 = box.y + box.h / 2; const r = (box.rot * Math.PI) / 180, ux = Math.cos(r), uy = Math.sin(r);
    const keepAspectDefault = single && (single.type === 'image' || single.type === 'media') && hx !== 0 && hy !== 0;
    begin(e, { type: 'resize', move: raf((ev) => {
      const p = P(ev); const dx = p.x - p0.x, dy = p.y - p0.y; const lx = dx * ux + dy * uy, ly = -dx * uy + dy * ux;
      let nw = box.w + hx * lx * (ev.altKey ? 2 : 1), nh = box.h + hy * ly * (ev.altKey ? 2 : 1); nw = Math.max(8, hx ? nw : box.w); nh = Math.max(8, hy ? nh : box.h);
      const aspect = ev.shiftKey !== keepAspectDefault; if (aspect && hx && hy) { const s = Math.max(nw / box.w, nh / box.h); nw = box.w * s; nh = box.h * s; } else if (aspect && (hx || hy) && single) { if (hx) nh = box.h * (nw / box.w); else nw = box.w * (nh / box.h); }
      // snapping for unrotated single/multi
      if (!box.rot && !ev.metaKey) {
        const tg = A.__rt || (A.__rt = snapTargets(new Set(objs.map((o) => o.id)))); const thr = 6 / z(); const L = [];
        let ex = hx > 0 ? box.x + nw : hx < 0 ? box.x + box.w - nw : null, ey = hy > 0 ? box.y + nh : hy < 0 ? box.y + box.h - nh : null;
        if (!ev.altKey) { if (ex !== null) { const s = snapAxis([ex], tg.xs, thr, A.view.snapGrid); if (s) { ex += s.d; nw = hx > 0 ? ex - box.x : box.x + box.w - ex; if (s.t) L.push({ o: 'v', p: s.t.p, a: 0, b: A.deck.size.h }); } } if (ey !== null) { const s = snapAxis([ey], tg.ys, thr, A.view.snapGrid); if (s) { ey += s.d; nh = hy > 0 ? ey - box.y : box.y + box.h - ey; if (s.t) L.push({ o: 'h', p: s.t.p, a: 0, b: A.deck.size.w }); } } }
        A.live.guides = L;
      }
      nw = Math.max(8, nw); nh = Math.max(8, nh);
      // anchor: opposite side (or centre with alt)
      const ax = ev.altKey ? 0 : -hx * box.w / 2, ay = ev.altKey ? 0 : -hy * box.h / 2; const awx = cx0 + ax * ux - ay * uy, awy = cy0 + ax * uy + ay * ux;
      const bx = ev.altKey ? 0 : hx * nw / 2, by = ev.altKey ? 0 : hy * nh / 2; const ncx = (ev.altKey ? cx0 : awx) + bx * ux - by * uy, ncy = (ev.altKey ? cy0 : awy) + bx * uy + by * ux;
      const nx = ncx - nw / 2, ny = ncy - nh / 2;
      if (single) {
        const o = single; const g0 = orig.get(o); setGeom(o, g0);
        if (o.type === 'group' || o.type === 'conn' || o.type === 'table') { const sx = nw / box.w, sy = nh / box.h; const anchorX = nx + (hx > 0 ? 0 : hx < 0 ? nw : 0), anchorY = ny + (hy > 0 ? 0 : hy < 0 ? nh : 0); const ox = hx > 0 ? box.x : box.x + box.w, oy = hy > 0 ? box.y : box.y + box.h; K.scaleObj(o, hx ? ox : box.x, hy ? oy : box.y, hx ? sx : 1, hy ? sy : 1); if (hx < 0) { const dxx = nx + nw - (o.x + o.w); } if (o.type === 'group') K.regroup(o); }
        else { o.x = nx; o.y = ny; o.w = nw; o.h = nh; if (o.type === 'text' && o.ah && !hy) o.h = nh; }
        if (o.type === 'image' && !A.live.crop) { /* keep crop fractions */ }
        A.renderObj(o.id); if (o.type === 'table') tableFit(o);
      } else {
        const sx = nw / box.w, sy = nh / box.h; const ox = hx > 0 ? box.x : hx < 0 ? box.x + box.w : box.x, oy = hy > 0 ? box.y : hy < 0 ? box.y + box.h : box.y;
        for (const o of objs) { setGeom(o, orig.get(o)); K.scaleObj(o, hx ? ox : box.x, hy ? oy : box.y, hx ? sx : 1, hy ? sy : 1); if (o.type === 'group') K.regroup(o); if (hx < 0 || hy < 0) { } A.renderObj(o.id); }
      }
      A.renderConns(new Set(objs.map((o) => o.id))); A.overlay(); tip(ev, `${Math.round(single ? single.w : nw)} × ${Math.round(single ? single.h : nh)}`); upThumb();
    }), up: () => { A.__rt = null; A.changed('Resize'); } });
  }
  const tableFit = (t) => { t.h = t.rh.reduce((a, b) => a + b, 0); t.w = t.cw.reduce((a, b) => a + b, 0); };

  function startConnEnd(e, o, which) {
    const e0 = { ...o[which] };
    begin(e, { type: 'conn', move: raf((ev) => {
      let p = P(ev); const os = A.objs().filter((t) => t !== o && t.type !== 'conn' && t.type !== 'group' && !t.hid); let hit = null, best = 1e9;
      for (const t of os) { const inside = p.x >= t.x - 8 && p.x <= t.x + t.w + 8 && p.y >= t.y - 8 && p.y <= t.y + t.h + 8; if (!inside) continue; K.sites(t.w, t.h).forEach((_, i) => { const s = K.siteXY(t, i); const dd = Math.hypot(s[0] - p.x, s[1] - p.y); if (dd < best) { best = dd; hit = { obj: t, site: i, xy: s }; } }); }
      if (hit && best < 40 / z() + 30) { o[which] = { x: hit.xy[0], y: hit.xy[1], id: hit.obj.id, site: hit.site }; A.live.sites = { obj: hit.obj, site: hit.site }; }
      else { if (ev.shiftKey) { const other = which === 'a' ? o.b : o.a; const ang = Math.atan2(p.y - other.y, p.x - other.x), d = Math.hypot(p.x - other.x, p.y - other.y), sn = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); p = { x: other.x + d * Math.cos(sn), y: other.y + d * Math.sin(sn) }; } o[which] = { x: p.x, y: p.y }; A.live.sites = os.length ? { obj: os.find((t) => p.x >= t.x - 8 && p.x <= t.x + t.w + 8 && p.y >= t.y - 8 && p.y <= t.y + t.h + 8) || os[0], site: -1 } : null; if (!A.live.sites.obj || A.live.sites.site === -1 && !os.some((t) => p.x >= t.x - 8 && p.x <= t.x + t.w + 8 && p.y >= t.y - 8 && p.y <= t.y + t.h + 8)) A.live.sites = null; }
      A.renderObj(o.id); A.overlay();
    }), up: () => A.changed('Move Line End', [o.id]) });
  }

  // ---------- creation ----------
  A.setTool = (t) => { A.tool = t; document.body.classList.toggle('tool-draw', !!t); A.emit('tool'); };
  function startCreate(e) {
    const t = A.tool; const p0 = P(e); const d = A.deck; let o = null;
    const snapP = (p) => A.view.snapGrid ? { x: Math.round(p.x / A.view.gridSize) * A.view.gridSize, y: Math.round(p.y / A.view.gridSize) * A.view.gridSize } : p;
    const s0 = snapP(p0);
    const mkObj = () => {
      if (t.t === 'text') o = K.newObj('text', { x: s0.x, y: s0.y, w: 10, h: 10, ah: true });
      else if (t.t === 'shape') o = K.newObj('shape', { shape: t.shape, x: s0.x, y: s0.y, w: 1, h: 1, fill: (K.shapes[t.shape] || {}).open ? null : { t: 'solid', c: 'a1' }, line: (K.shapes[t.shape] || {}).open ? { c: 'fg', w: 3 } : null, adj: undefined, paras: [{ runs: [{ t: '' }] }] });
      else if (t.t === 'conn') o = K.newObj('conn', { a: { x: s0.x, y: s0.y }, b: { x: s0.x, y: s0.y }, route: t.route || 'straight', line: { c: 'fg', w: 3, head: t.head || 'none', tail: 'none' } });
      o.name = K.defaultName(o) + ' ' + (A.objs().filter((x) => x.type === o.type).length + 1);
      A.objs().push(o); A.sel = [o.id]; A.renderObj; const el = K.renderObject(d, o, { index: A.cur, edit: true, objs: A.objs() }); A.render(); A.sel = [o.id]; A.overlay();
    };
    let moved = false;
    begin(e, { type: 'create', move: raf((ev) => {
      const p = snapP(P(ev)); if (!o) { if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return; mkObj(); }
      moved = true;
      if (t.t === 'conn') {
        let q = p; if (ev.shiftKey) { const ang = Math.atan2(q.y - s0.y, q.x - s0.x), dd = Math.hypot(q.x - s0.x, q.y - s0.y), sn = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); q = { x: s0.x + dd * Math.cos(sn), y: s0.y + dd * Math.sin(sn) }; }
        const os = A.objs().filter((x) => x !== o && x.type !== 'conn' && !x.hid); let hit = null, best = 1e9;
        const attach = (pt) => { let h2 = null, b2 = 1e9; for (const x of os) { if (!(pt.x >= x.x - 8 && pt.x <= x.x + x.w + 8 && pt.y >= x.y - 8 && pt.y <= x.y + x.h + 8)) continue; K.sites(x.w, x.h).forEach((_, i) => { const s = K.siteXY(x, i); const dd = Math.hypot(s[0] - pt.x, s[1] - pt.y); if (dd < b2) { b2 = dd; h2 = { obj: x, site: i, xy: s }; } }); } return h2; };
        const ha = attach(s0); if (ha) o.a = { x: ha.xy[0], y: ha.xy[1], id: ha.obj.id, site: ha.site };
        const hb = attach(q); if (hb) { o.b = { x: hb.xy[0], y: hb.xy[1], id: hb.obj.id, site: hb.site }; A.live.sites = { obj: hb.obj, site: hb.site }; } else { o.b = { x: q.x, y: q.y }; A.live.sites = null; }
        A.renderObj(o.id); A.overlay(); return;
      }
      let x0 = Math.min(s0.x, p.x), y0 = Math.min(s0.y, p.y), w = Math.abs(p.x - s0.x), h = Math.abs(p.y - s0.y); if (ev.shiftKey && t.t === 'shape') { const m = Math.max(w, h); w = h = m; x0 = p.x < s0.x ? s0.x - m : s0.x; y0 = p.y < s0.y ? s0.y - m : s0.y; }
      Object.assign(o, { x: x0, y: y0, w: Math.max(w, 4), h: Math.max(h, t.t === 'text' ? 10 : 4) }); A.renderObj(o.id); A.overlay(); tip(ev, `${Math.round(o.w)} × ${Math.round(o.h)}`);
    }), up: () => {
      A.setTool(null);
      if (!o) { // click: default size
        if (t.t === 'text') o = K.newObj('text', { x: s0.x, y: s0.y, w: 320, h: 60, ah: true });
        else if (t.t === 'shape') { const big = (K.shapes[t.shape] || {}).g === 'Callouts' ? [220, 140] : [160, 120]; o = K.newObj('shape', { shape: t.shape, x: s0.x - big[0] / 2, y: s0.y - big[1] / 2, w: big[0], h: big[1], fill: (K.shapes[t.shape] || {}).open ? null : { t: 'solid', c: 'a1' }, line: (K.shapes[t.shape] || {}).open ? { c: 'fg', w: 3 } : null, paras: [{ runs: [{ t: '' }] }] }); }
        else { o = K.newObj('conn', { a: { x: s0.x - 100, y: s0.y }, b: { x: s0.x + 100, y: s0.y }, route: t.route || 'straight', line: { c: 'fg', w: 3, head: t.head || 'none', tail: 'none' } }); }
        o.name = K.defaultName(o) + ' ' + (A.objs().filter((x) => x.type === o.type).length + 1); A.objs().push(o);
      } else if (t.t === 'text' && o.w < 40) { o.w = 320; }
      A.sel = [o.id]; A.changed('Add ' + K.defaultName(o)); A.render(); A.select([o.id]);
      if (o.type === 'text') setTimeout(() => A.startEdit(o, null, true), 20);
    } });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && A.tool) { A.setTool(null); } if (e.key === 'Escape' && A.live.crop) { A.live.crop = null; A.overlay(); A.emit('select'); } }, true);

  // ---------- crop ----------
  A.cropMode = (on) => { const o = A.selObjs()[0]; A.live.crop = on && o && o.type === 'image' ? o.id : null; A.overlay(); A.emit('select'); };
  function startCropResize(e, o, h) {
    const hd = HD.find((x) => x[0] === h); const hx = hd[1], hy = hd[2]; const g0 = geomOf(o), c0 = { ...o.crop }; const p0 = P(e); const r = ((o.rot || 0) * Math.PI) / 180, ux = Math.cos(r), uy = Math.sin(r);
    begin(e, { type: 'crop', move: raf((ev) => {
      const p = P(ev); const dx = p.x - p0.x, dy = p.y - p0.y; const lx = dx * ux + dy * uy, ly = -dx * uy + dy * ux;
      // image stays put in slide space; frame edges move
      const pw = g0.w / c0.w, ph = g0.h / c0.h; // full image size in slide units
      let l = 0, t = 0, rr = 0, b = 0; if (hx < 0) l = lx; if (hx > 0) rr = lx; if (hy < 0) t = ly; if (hy > 0) b = ly;
      let nw = g0.w - l + rr, nh = g0.h - t + b; if (nw < 12 || nh < 12) return;
      const fx = (c0.x * pw + l) / pw, fy = (c0.y * ph + t) / ph; o.crop = { x: Math.max(0, fx), y: Math.max(0, fy), w: Math.min(1, nw / pw), h: Math.min(1, nh / ph) };
      if (o.crop.x + o.crop.w > 1) o.crop.w = 1 - o.crop.x; if (o.crop.y + o.crop.h > 1) o.crop.h = 1 - o.crop.y;
      nw = o.crop.w * pw; nh = o.crop.h * ph; const dl = (o.crop.x - c0.x) * pw, dt = (o.crop.y - c0.y) * ph;
      const cx0 = g0.x + g0.w / 2, cy0 = g0.y + g0.h / 2; const ox = -g0.w / 2 + dl + nw / 2, oy = -g0.h / 2 + dt + nh / 2; // new centre offset in local coords
      const ncx = cx0 + ox * ux - oy * uy, ncy = cy0 + ox * uy + oy * ux; o.w = nw; o.h = nh; o.x = ncx - nw / 2; o.y = ncy - nh / 2; A.renderObj(o.id); A.overlay();
    }), up: () => A.changed('Crop', [o.id]) });
  }

  // ---------- context menu & dbl click ----------
  stage.addEventListener('dblclick', (e) => {
    if (!A.deck || A.tool) return; const id = topId(e.target); if (!id) return; const o = A.byId(id); if (!o) return;
    if (o.type === 'text' || o.type === 'shape') { A.startEdit(o, e); }
    else if (o.type === 'table') { const td = e.target.closest('td'); if (td) A.startEdit(o, e, false, { r: +td.dataset.r, c: +td.dataset.c }); }
    else if (o.type === 'image') { if (!o.m) A.emit('pickImage', o); else A.cropMode(true); }
    else if (o.type === 'chart') A.emit('editChart', o);
    else if (o.type === 'media') A.emit('toggleMedia', o);
  });
  stage.addEventListener('contextmenu', (e) => { if (!A.deck || A.editing) return; const id = topId(e.target); e.preventDefault(); A.emit('context', e, id ? A.byId(id) : null); });

  // ---------- keyboard on canvas ----------
  A.canvasFocus = () => A.focus === 'canvas';
  stage.addEventListener('pointerdown', () => { A.focus = 'canvas'; }, true);
  A.nudge = (dx, dy) => { const os = A.selObjs().filter((o) => !o.lock); if (!os.length) return; os.forEach((o) => K.moveObj(o, dx, dy)); K.updateConns(A.objs()); A.changed('Nudge'); };
  document.addEventListener('keydown', (e) => {
    if (!A.deck || G) return; const t = e.target; if (t.matches && t.matches('input,textarea,select,[contenteditable="true"]')) return; if (A.editing) return; if (document.querySelector('.zk-scrim')) return;
    if (A.focus === 'nav') return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key.startsWith('Arrow')) { if (!A.sel.length) return; e.preventDefault(); const gs = A.view.snapGrid && !e.shiftKey ? A.view.gridSize : step; A.nudge(e.key === 'ArrowLeft' ? -gs : e.key === 'ArrowRight' ? gs : 0, e.key === 'ArrowUp' ? -gs : e.key === 'ArrowDown' ? gs : 0); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && A.sel.length && !e.metaKey) { e.preventDefault(); A.cmd.del(); }
    else if (e.key === 'Enter' && A.sel.length === 1 && !e.metaKey) { const o = A.selObjs()[0]; if (o && (o.type === 'text' || o.type === 'shape')) { e.preventDefault(); A.startEdit(o, null, true); } }
    else if (e.key === 'Escape' && A.sel.length) { A.select([]); }
    else if (e.key === 'Tab' && A.objs().length) { e.preventDefault(); const os = A.objs().filter((o) => !o.hid); const i = os.findIndex((o) => o.id === A.sel[0]); const n = os[(i + (e.shiftKey ? -1 : 1) + os.length) % os.length]; A.select([n.id]); }
  });
})();
