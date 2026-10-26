/* Freeform canvas controller: view (pan/zoom/momentum), selection, hit-testing, tools and drag operations. */
(() => {
  'use strict';
  const S = (FF.S = {
    tool: 'select', shape: 'rect', sel: new Set(), hover: null, space: false, snap: true, rulers: false, minimap: true, editing: null,
    pen: { pen: { color: 'ink', size: 4 }, marker: { color: '#007aff', size: 10 }, hl: { color: '#ffcc00', size: 22 }, pencil: { color: 'ink', size: 3 } },
    eraser: { mode: 'area', size: 14 }, conn: { kind: 'elbow', ha: 'none', hb: 'arrow' }, stamp: '⭐', sticky: '#ffe27a', guides: [], laser: [], op: null, pointer: { x: 0, y: 0, w: [0, 0] },
  });
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), over = $('#over'), mainC = $('#main');
  const R = (FF.R = new FF.Renderer(mainC, over));
  R.dark = FF.dark;
  let rect = stage.getBoundingClientRect();
  const hctx = document.createElement('canvas').getContext('2d');
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff375f';
  const ZMIN = 0.02, ZMAX = 32;

  // ---------- view ----------
  const V = () => R.view;
  FF.s2w = (sx, sy) => [V().x + sx / V().z, V().y + sy / V().z];
  FF.w2s = (wx, wy) => [(wx - V().x) * V().z, (wy - V().y) * V().z];
  let viewAnim = null, momentum = [];
  const stopAnim = () => { if (viewAnim) { viewAnim.stop(); viewAnim = null; } momentum.forEach((m) => m.stop()); momentum = []; };
  FF.setView = (x, y, z) => { const v = V(); v.x = x; v.y = y; v.z = z; FF.B.view = { x, y, z }; R.invalidate(); FF.emit('view'); };
  FF.panBy = (dx, dy) => FF.setView(V().x - dx / V().z, V().y - dy / V().z, V().z);
  FF.zoomAt = (sx, sy, nz) => { const v = V(); nz = zk.clamp(nz, ZMIN, ZMAX); const wx = v.x + sx / v.z, wy = v.y + sy / v.z; FF.setView(wx - sx / nz, wy - sy / nz, nz); };
  const rubZ = { raw: 0, t: 0 };
  FF.pinchZoom = (sx, sy, factor) => { // rubber-banded beyond limits
    const v = V(); let nz = (rubZ.raw || v.z) * factor; rubZ.raw = nz; const lim = zk.clamp(nz, ZMIN, ZMAX);
    let show = lim; if (nz !== lim) { const over = Math.log(nz / lim); show = lim * Math.exp(zk.rubberband(over, 1.2, 0.5)); }
    const wx = v.x + sx / v.z, wy = v.y + sy / v.z; v.z = show; FF.setView(wx - sx / show, wy - sy / show, show); R.zoomActive = 1;
    clearTimeout(rubZ.t); rubZ.t = setTimeout(() => { const z0 = V().z, tz = zk.clamp(z0, ZMIN, ZMAX); rubZ.raw = 0; R.zoomActive = 0; if (tz !== z0) FF.animateTo(null, null, tz, sx, sy); else R.invalidate(); }, 130);
  };
  // animate view to center (wx,wy) at zoom z; or anchored zoom when wx null
  FF.animateTo = (wx, wy, z, ax, ay) => {
    stopAnim(); const v0 = { ...V() }; const W = rect.width, H = rect.height; let tx, ty;
    if (wx == null) { const awx = v0.x + ax / v0.z, awy = v0.y + ay / v0.z; tx = awx - ax / z + W / z / 2; ty = awy - ay / z + H / z / 2; } else { tx = wx; ty = wy; }
    const c0x = v0.x + W / v0.z / 2, c0y = v0.y + H / v0.z / 2;
    viewAnim = zk.spring({ from: 0, to: 1, response: 0.5, damping: 1, eps: 0.001, onUpdate: (p) => { const zz = Math.exp(Math.log(v0.z) + (Math.log(z) - Math.log(v0.z)) * p); const cx = c0x + (tx - c0x) * p, cy = c0y + (ty - c0y) * p; FF.setView(cx - W / zz / 2, cy - H / zz / 2, zz); R.zoomActive = 1; }, onDone: () => { R.zoomActive = 0; viewAnim = null; R.cache = null; R.invalidate(); } });
  };
  FF.fitRect = (b, pad = 80, maxZ = 4) => { const w = Math.max(1, b[2] - b[0]), h = Math.max(1, b[3] - b[1]); const z = zk.clamp(Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h), ZMIN, maxZ); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, z]; };
  FF.zoomFit = (objs, anim = true) => { objs = objs || FF.B.objs; if (!objs.length) return FF.animateTo(0, 0, 1); const [x, y, z] = FF.fitRect(FF.unionBB(objs)); anim ? FF.animateTo(x, y, z) : FF.setView(x - rect.width / z / 2, y - rect.height / z / 2, z); };
  FF.viewCenter = () => FF.s2w(rect.width / 2, rect.height / 2);

  function onWheel(e) {
    e.preventDefault(); if (S.op && S.op.noWheel) return; stopAnim(); const r = rect;
    if (e.ctrlKey || e.metaKey) { const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : e.ctrlKey ? 0.012 : 0.004)); FF.pinchZoom(e.clientX - r.left, e.clientY - r.top, f); }
    else { let dx = e.deltaX, dy = e.deltaY; if (e.deltaMode === 1) { dx *= 16; dy *= 16; } if (e.shiftKey && !dx) { dx = dy; dy = 0; } FF.panBy(-dx, -dy); }
    updHover();
  }
  stage.addEventListener('wheel', onWheel, { passive: false });
  let gz0 = 1; // WebKit pinch
  stage.addEventListener('gesturestart', (e) => { e.preventDefault(); gz0 = 1; stopAnim(); });
  stage.addEventListener('gesturechange', (e) => { e.preventDefault(); const f = e.scale / gz0; gz0 = e.scale; FF.pinchZoom(e.clientX - rect.left, e.clientY - rect.top, f); });
  stage.addEventListener('gestureend', (e) => e.preventDefault());

  // ---------- selection ----------
  const members = (o) => (o.g ? FF.B.objs.filter((q) => q.g === o.g) : [o]);
  FF.selObjs = () => { const r = []; for (const id of S.sel) { const o = FF.B.map.get(id); if (o) r.push(o); } return r; };
  FF.select = (objs, add = false) => {
    if (!add) S.sel.clear(); for (const o of objs) for (const m of members(o)) S.sel.add(m.id); selChanged();
  };
  FF.toggleSel = (o) => { const on = S.sel.has(o.id); for (const m of members(o)) on ? S.sel.delete(m.id) : S.sel.add(m.id); selChanged(); };
  FF.clearSel = () => { if (S.sel.size) { S.sel.clear(); selChanged(); } };
  const selChanged = () => { R.invalidateOverlay(); FF.emit('sel'); };
  FF.selChanged = selChanged;
  FF.pruneSel = () => { for (const id of [...S.sel]) if (!FF.B.map.has(id)) S.sel.delete(id); selChanged(); };

  // ---------- hit testing ----------
  const hitObj = (o, x, y, tol) => {
    const b = FF.bb(o), m = tol + (o.s.sw || 0) / 2 + (o.type === 'stroke' ? (o.s.sw || 4) : 0);
    if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) return false;
    switch (o.type) {
      case 'conn': { const g = FF.connGeo(o), r = (o.s.sw || 2) / 2 + tol; const P = g.pts; for (let i = 1; i < P.length; i++) if (FF.segDist(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]) <= r) return true; if (FF.hasText(o)) { const L = FF.layout(o, 220, 1); if (Math.abs(x - g.mid[0]) < L.w / 2 + 7 && Math.abs(y - g.mid[1]) < L.h / 2 + 3) return true; } return false; }
      case 'stroke': { const [lx, ly] = FF.toLocal(o, x, y), P = o.pts, n = P.length / 3; const r = (o.s.sw * 1.0) / 2 + tol; if (n === 1) return Math.hypot(lx - P[0], ly - P[1]) <= r; for (let i = 1; i < n; i++) if (FF.segDist(lx, ly, P[i * 3 - 3], P[i * 3 - 2], P[i * 3], P[i * 3 + 1]) <= r * Math.max(0.5, P[i * 3 + 2]) + 0.5) return true; return false; }
      case 'frame': { const [lx, ly] = FF.toLocal(o, x, y); const fs = FF.titleSize(o, V().z); if (ly < 0 && ly > -fs * 1.6 && lx > -4 && lx < Math.min(o.w, fs * (o.title || 'Frame').length * 0.7 + 20)) return true; const e = tol + 3; const inside = lx >= 0 && ly >= 0 && lx <= o.w && ly <= o.h; return inside && (lx < e || ly < e || lx > o.w - e || ly > o.h - e); }
      case 'shape': {
        const [lx, ly] = FF.toLocal(o, x, y); const sp = FF.shapePath(o); const filled = o.s.fill && o.s.fill !== 'none'; hctx.lineWidth = (o.s.sw || 1) + tol * 2;
        if (filled) return hctx.isPointInPath(sp.p, lx, ly) || hctx.isPointInStroke(sp.p, lx, ly);
        if (hctx.isPointInStroke(sp.p, lx, ly)) return true; if (sp.p2 && hctx.isPointInStroke(sp.p2, lx, ly)) return true;
        if (FF.hasText(o)) { const tb = FF.textBox(o); return lx >= tb.x && lx <= tb.x + tb.w && ly >= tb.y && ly <= tb.y + tb.h; } return false;
      }
      default: { const [lx, ly] = FF.toLocal(o, x, y); return lx >= -tol && ly >= -tol && lx <= o.w + tol && ly <= o.h + tol; }
    }
  };
  FF.hitAt = (x, y, tol = 4 / V().z, filter) => { const L = FF.B.objs; for (let i = L.length - 1; i >= 0; i--) { const o = L[i]; if (o.hidden) continue; if (filter && !filter(o)) continue; if (hitObj(o, x, y, tol)) return o; } return null; };
  FF.hitShape = (x, y, ex) => FF.hitAt(x, y, 2, (o) => FF.connectable(o) && o !== ex && o.type !== 'frame' && o.type !== 'image' ? true : o.type === 'image' || o.type === 'frame' ? false : false);
  // shape under pointer for connector attachment (inside bbox counts)
  const connTarget = (x, y, ex) => { const L = FF.B.objs; for (let i = L.length - 1; i >= 0; i--) { const o = L[i]; if (o === ex || !FF.connectable(o) || o.type === 'frame' && false) continue; const [lx, ly] = FF.toLocal(o, x, y), m = 10 / V().z; if (lx >= -m && ly >= -m && lx <= o.w + m && ly <= o.h + m) { if (o.type === 'frame') { if (!(lx < m || ly < m || lx > o.w - m || ly > o.h - m)) continue; } return o; } } return null; };

  // ---------- selection frame & handles ----------
  FF.selFrame = () => {
    const objs = FF.selObjs().filter((o) => o.type !== 'conn' || true); if (!objs.length) return null;
    if (objs.length === 1 && objs[0].type !== 'conn') { const o = objs[0]; return { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, single: o }; }
    const b = FF.unionBB(objs); return { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1], rot: 0, single: null, objs };
  };
  const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
  const fpt = (F, fx, fy) => { const c = Math.cos(F.rot), s = Math.sin(F.rot), dx = (fx - 0.5) * F.w, dy = (fy - 0.5) * F.h; return [F.x + F.w / 2 + dx * c - dy * s, F.y + F.h / 2 + dx * s + dy * c]; };
  const rotHandle = (F) => { const c = Math.cos(F.rot), s = Math.sin(F.rot), off = F.h / 2 + 30 / V().z; return [F.x + F.w / 2 + 0 * c - -off * s, F.y + F.h / 2 + 0 * s + -off * c]; };
  const hitHandle = (wx, wy) => {
    const F = FF.selFrame(); if (!F) return null; const sel = FF.selObjs(); if (sel.every((o) => o.lock)) return null; const r = 9 / V().z;
    if (sel.length === 1 && sel[0].type === 'conn') { const g = FF.connGeo(sel[0]); if (Math.hypot(wx - g.A.x, wy - g.A.y) < r) return { k: 'ca' }; if (Math.hypot(wx - g.B.x, wy - g.B.y) < r) return { k: 'cb' }; return null; }
    const rh = rotHandle(F); if (Math.hypot(wx - rh[0], wy - rh[1]) < r) return { k: 'rot', F };
    if (F.single && F.single.type === 'text' && false) return null;
    for (const [k, fx, fy] of HANDLES) { const p = fpt(F, fx, fy); if (Math.hypot(wx - p[0], wy - p[1]) < r) return { k, F, fx, fy }; }
    return null;
  };
  const CURS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab', ca: 'crosshair', cb: 'crosshair' };

  // ---------- helpers ----------
  const canvasXY = (e) => [e.clientX - rect.left, e.clientY - rect.top];
  const worldOf = (e) => { const [sx, sy] = canvasXY(e); return FF.s2w(sx, sy); };
  const modKey = (e) => (zeng.platform === 'mac' ? e.metaKey : e.ctrlKey);
  FF.setTool = (t, opt) => { if (S.editing) FF.endEdit(); if (opt) Object.assign(S, opt); S.tool = t; S.hover = null; updCursor(); FF.emit('tool'); R.invalidateOverlay(); };
  const DRAW = ['pen', 'marker', 'hl', 'pencil'];
  const updCursor = () => {
    let c = 'default'; if (S.space || S.tool === 'hand') c = S.op && S.op.pan ? 'grabbing' : 'grab'; else if (DRAW.includes(S.tool) || ['shape', 'text', 'sticky', 'conn', 'frame', 'table', 'stamp', 'lasso', 'eraser', 'eyedrop', 'laser'].includes(S.tool)) c = 'crosshair';
    stage.style.cursor = c;
  };
  FF.updCursor = updCursor;

  // ---------- pointer routing ----------
  let hoverRaf = 0;
  const updHover = () => { if (hoverRaf) return; hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (S.op) return; const [x, y] = S.pointer.w; const old = S.hover; S.hover = S.tool === 'select' || S.tool === 'conn' ? FF.hitAt(x, y, 3 / V().z) : null; if (old !== S.hover) R.invalidateOverlay(); }); };
  stage.addEventListener('pointerdown', (e) => {
    if (S.editing) { if (e.target === stage || e.target === over) FF.endEdit(); else return; }
    if (e.button === 2) return; stage.focus({ preventScroll: true }); stopAnim(); zk.closePop();
    const w = worldOf(e); S.pointer.w = w;
    stage.setPointerCapture(e.pointerId);
    if (e.button === 1 || S.space || S.tool === 'hand') return startPan(e);
    if (S.tool === 'select') return downSelect(e, w);
    if (DRAW.includes(S.tool)) return startDraw(e, w);
    switch (S.tool) {
      case 'eraser': return startErase(e, w);
      case 'lasso': return startLasso(e, w);
      case 'conn': return startConn(e, w);
      case 'laser': S.op = { laser: true }; return laserPt(w);
      case 'eyedrop': return eyedrop(e);
      default: return startCreate(e, w);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const w = worldOf(e); S.pointer.w = w; S.pointer.x = e.clientX; S.pointer.y = e.clientY;
    if (S.op && S.op.move) { S.op.move(e, w); return; }
    if (S.tool === 'laser') laserPt(w, true);
    if (S.tool === 'select') { const h = hitHandle(w[0], w[1]); stage.style.cursor = h ? CURS[h.k] : S.space ? 'grab' : 'default'; }
    updHover(); if (S.tool === 'eraser' || S.tool === 'conn') R.invalidateOverlay();
  });
  const end = (e, cancel) => { const op = S.op; if (!op) return; S.op = null; try { stage.releasePointerCapture(e.pointerId); } catch {} op.up && op.up(e, cancel); R.invalidateOverlay(); updCursor(); };
  stage.addEventListener('pointerup', (e) => end(e));
  stage.addEventListener('pointercancel', (e) => end(e, true));
  stage.addEventListener('dblclick', (e) => {
    if (S.tool !== 'select') return; const [x, y] = worldOf(e); const o = FF.hitAt(x, y);
    if (o) { if (o.type === 'table') return FF.editTableCell(o, x, y); if (o.type === 'card') return FF.editCard(o); if (o.type === 'image') return; if (o.type === 'stroke') return; if (o.lock) return; return FF.beginEdit(o); }
    FF.createText(x, y);
  });
  stage.addEventListener('contextmenu', (e) => { e.preventDefault(); const [x, y] = worldOf(e); const o = FF.hitAt(x, y); if (o && !S.sel.has(o.id)) FF.select([o]); FF.emit('ctx', { e, o }); });

  // ---------- pan with momentum ----------
  function startPan(e) {
    const hist = [[performance.now(), e.clientX, e.clientY]]; let lx = e.clientX, ly = e.clientY;
    S.op = { pan: true, move(e2) { FF.panBy(e2.clientX - lx, e2.clientY - ly); lx = e2.clientX; ly = e2.clientY; const t = performance.now(); hist.push([t, lx, ly]); while (hist.length > 2 && t - hist[0][0] > 90) hist.shift(); },
      up() { const a = hist[0], b = hist[hist.length - 1], dt = b[0] - a[0]; if (dt < 8 || performance.now() - b[0] > 70) return; const vx = ((b[1] - a[1]) / dt) * 1000, vy = ((b[2] - a[2]) / dt) * 1000; const px = zk.project(vx) * 1000 / 1000, py = zk.project(vy); if (Math.hypot(px, py) < 12) return;
        let cx = 0, cy = 0; const mk = (axis, v, p) => zk.spring({ from: 0, to: p, velocity: v, response: 0.6, damping: 1, eps: 0.3, onUpdate: (val) => { const d = val - (axis ? cy : cx); if (axis) cy = val; else cx = val; FF.panBy(axis ? 0 : d, axis ? d : 0); } });
        momentum = [mk(0, vx, px), mk(1, vy, py)]; } };
    stage.style.cursor = 'grabbing';
  }

  // ---------- select tool ----------
  function downSelect(e, w) {
    const hh = hitHandle(w[0], w[1]);
    if (hh) { if (hh.k === 'rot') return startRotate(e, w); if (hh.k === 'ca' || hh.k === 'cb') return startEndpoint(e, FF.selObjs()[0], hh.k === 'ca' ? 'a' : 'b'); return startResize(e, w, hh); }
    // port dot of hovered shape
    const port = portAt(w);
    if (port) return startConn(e, w, port);
    const o = FF.hitAt(w[0], w[1]);
    if (o) {
      if (e.shiftKey) { FF.toggleSel(o); if (!S.sel.has(o.id)) return; } else if (!S.sel.has(o.id)) FF.select([o]);
      if (FF.selObjs().some((x) => x.lock) && FF.selObjs().every((x) => x.lock)) return;
      return startMove(e, w);
    }
    if (!e.shiftKey) FF.clearSel();
    startMarquee(e, w);
  }
  function portAt(w) {
    const o = S.hover && FF.connectable(S.hover) ? S.hover : null; const sels = FF.selObjs(); const cand = o ? [o] : []; if (sels.length === 1 && FF.connectable(sels[0]) && !cand.includes(sels[0])) cand.push(sels[0]);
    for (const c of cand) { if (c.lock) continue; for (const p of FF.ports) { const q = portDot(c, p); if (Math.hypot(w[0] - q[0], w[1] - q[1]) < 9 / V().z) return { o: c, p }; } } return null;
  }
  const portDot = (o, p) => { const q = FF.portPos(o, p); const off = S.sel.has(o.id) ? 16 / V().z : 0; return [q.x + q.dx * off, q.y + q.dy * off]; };

  function startMarquee(e, w) {
    const base = new Set(e.shiftKey ? S.sel : []); const sx = w[0], sy = w[1]; const M = { x0: sx, y0: sy, x1: sx, y1: sy }; S.marquee = M;
    S.op = { move(e2, w2) { M.x0 = Math.min(sx, w2[0]); M.x1 = Math.max(sx, w2[0]); M.y0 = Math.min(sy, w2[1]); M.y1 = Math.max(sy, w2[1]); const nsel = new Set(base);
      for (const o of FF.B.objs) { if (o.lock || o.hidden) continue; const b = FF.bb(o); if (b[0] < M.x1 && b[2] > M.x0 && b[1] < M.y1 && b[3] > M.y0) { if (o.type === 'frame' && !(b[0] >= M.x0 && b[2] <= M.x1 && b[1] >= M.y0 && b[3] <= M.y1)) continue; for (const m of members(o)) nsel.add(m.id); } }
      S.sel = nsel; selChanged(); R.invalidateOverlay(); }, up() { S.marquee = null; selChanged(); } };
  }

  // moving
  function startMove(e, w) {
    let objs = FF.selObjs(); const dup = e.altKey; let moved = false; let t = null; let ids, startPos, extra = [];
    const setup = () => {
      const sel = new Set(S.sel); // frames carry children
      for (const o of objs) if (o.type === 'frame') for (const c of FF.B.objs) if (!sel.has(c.id) && c.type !== 'frame' && !c.lock) { const [cx, cy] = FF.center(c); if (cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h) { sel.add(c.id); } }
      objs = [...sel].map((id) => FF.B.map.get(id)).filter((o) => o && !o.lock); ids = new Set(objs.map((o) => o.id));
      t.touchAll(objs); startPos = objs.map((o) => (o.type === 'conn' ? { a: { ...o.a }, b: { ...o.b } } : [o.x, o.y]));
      // connectors attached to moved things must be re-touched for undo of nothing; they only reflow
      R.freeze(ids);
    };
    S.op = { move(e2, w2) {
      let dx = w2[0] - w[0], dy = w2[1] - w[1];
      if (!moved) { if (Math.hypot(dx, dy) * V().z < 3) return; moved = true; t = FF.tx(dup ? 'Duplicate' : 'Move');
        if (dup) { const copies = FF.cloneObjs(objs); copies.forEach((c) => t.add(c)); objs = copies; FF.select(copies); }
        setup(); }
      if (e2.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      S.guides = [];
      if (S.snap && !modKey(e2)) { const sn = snapMove(objs, ids, dx, dy); dx = sn.dx; dy = sn.dy; S.guides = sn.guides; }
      objs.forEach((o, i) => { if (o.type === 'conn') { const p = startPos[i]; if (!o.a.id) o.a = { x: p.a.x + dx, y: p.a.y + dy }; if (!o.b.id) o.b = { x: p.b.x + dx, y: p.b.y + dy }; FF.touch(o); } else { o.x = startPos[i][0] + dx; o.y = startPos[i][1] + dy; FF.moved(o); } });
      FF.reflow(ids); R.invalidate(); FF.emit('xform');
    }, up(e2, cancel) { S.guides = []; if (!moved) { if (!e.shiftKey && FF.selObjs().length > 1 && false) {} return; } R.unfreeze(); if (cancel) { t.end(); FF.undo(); } else { t.end(); } FF.reflow(); FF.emit('xform'); } };
  }
  FF.cloneObjs = (objs, offset = 0) => {
    const idmap = new Map(), gmap = new Map(); const out = objs.map((o) => { const c = FF.cloneObj(o); c.id = FF.id(); idmap.set(o.id, c.id); if (c.g) { if (!gmap.has(c.g)) gmap.set(c.g, FF.id()); c.g = gmap.get(c.g); } c.x += offset; c.y += offset; if (c.type === 'conn') { for (const k of ['a', 'b']) { if (c[k].id) { if (idmap.has(c[k].id)) {} } else { c[k].x += offset; c[k].y += offset; } } } return c; });
    for (const c of out) if (c.type === 'conn') for (const k of ['a', 'b']) if (c[k].id) { if (idmap.has(c[k].id)) c[k].id = idmap.get(c[k].id); else { const q = FF.B.map.get(c[k].id); if (q) { const p = FF.portPos(q, c[k].port && c[k].port !== 'auto' ? c[k].port : 'e'); c[k] = { x: p.x + offset, y: p.y + offset }; } else c[k] = { x: 0, y: 0 }; } }
    return out;
  };
  function snapMove(objs, ids, dx, dy) {
    const b = FF.unionBB(objs.filter((o) => o.type !== 'conn')); if (!b) return { dx, dy, guides: [] };
    const th = 6 / V().z; const bx = [b[0] + dx, (b[0] + b[2]) / 2 + dx, b[2] + dx], by = [b[1] + dy, (b[1] + b[3]) / 2 + dy, b[3] + dy];
    let bestX = null, bestY = null; const vb = [V().x, V().y, V().x + rect.width / V().z, V().y + rect.height / V().z];
    for (const o of FF.B.objs) { if (ids.has(o.id) || o.type === 'conn' || o.hidden) continue; const q = FF.bb(o); if (q[2] < vb[0] || q[0] > vb[2] || q[3] < vb[1] || q[1] > vb[3]) continue;
      const qx = [q[0], (q[0] + q[2]) / 2, q[2]], qy = [q[1], (q[1] + q[3]) / 2, q[3]];
      for (const a of bx) for (const c of qx) { const d = c - a; if (Math.abs(d) < th && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: c, q }; }
      for (const a of by) for (const c of qy) { const d = c - a; if (Math.abs(d) < th && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: c, q }; } }
    const guides = []; if (bestX) { dx += bestX.d; const y0 = Math.min(b[1] + dy, bestX.q[1]), y1 = Math.max(b[3] + dy, bestX.q[3]); guides.push({ v: true, at: bestX.at, a: y0, b: y1 }); }
    if (bestY) { dy += bestY.d; const x0 = Math.min(b[0] + dx, bestY.q[0]), x1 = Math.max(b[2] + dx, bestY.q[2]); guides.push({ v: false, at: bestY.at, a: x0, b: x1 }); }
    return { dx, dy, guides };
  }

  // resizing
  function startResize(e, w, hh) {
    const F = hh.F, objs = FF.selObjs().filter((o) => !o.lock && o.type !== 'conn'); const t = FF.tx('Resize'); t.touchAll(objs); const ids = new Set(objs.map((o) => o.id)); R.freeze(ids);
    const single = F.single, k = hh.k, fx = k.includes('w') ? 1 : k.includes('e') ? 0 : 0.5, fy = k.includes('n') ? 1 : k.includes('s') ? 0 : 0.5; // anchor = opposite
    const anchor = fpt(F, fx, fy); const hx = k.includes('e') ? 1 : k.includes('w') ? -1 : 0, hy = k.includes('s') ? 1 : k.includes('n') ? -1 : 0;
    const orig = objs.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, pts: o.pts, fs: o.s.fs, cw: o.cw && o.cw.slice(), rh: o.rh && o.rh.slice(), sw: o.s.sw }));
    const keepAspect = single && (single.type === 'image' || single.type === 'stamp' || single.type === 'path' && false);
    S.op = { move(e2, w2) {
      if (single) {
        const c = Math.cos(-F.rot), s = Math.sin(-F.rot); const qx = (w2[0] - anchor[0]) * c - (w2[1] - anchor[1]) * s, qy = (w2[0] - anchor[0]) * s + (w2[1] - anchor[1]) * c;
        let nw = hx ? Math.max(4, qx * hx) : F.w, nh = hy ? Math.max(4, qy * hy) : F.h;
        if (e2.altKey) { nw = hx ? Math.max(4, Math.abs(qx) * 2) : F.w; nh = hy ? Math.max(4, Math.abs(qy) * 2) : F.h; }
        if ((keepAspect || e2.shiftKey || (single.type === 'text' && hx && hy)) && hx && hy) { const r = F.w / F.h; if (nw / nh > r) nh = nw / r; else nw = nh * r; }
        else if (keepAspect && (hx || hy)) { const r = F.w / F.h; if (hx) nh = nw / r; else nw = nh * r; }
        // snap size to guides? (none) ; new centre so anchor stays fixed
        const lc = [hx ? (hx * nw) / 2 * (e2.altKey ? 0 : 1) : 0, hy ? (hy * nh) / 2 * (e2.altKey ? 0 : 1) : 0]; const cs = Math.cos(F.rot), sn = Math.sin(F.rot);
        const cx = (e2.altKey ? F.x + F.w / 2 : anchor[0] + lc[0] * cs - lc[1] * sn), cy = e2.altKey ? F.y + F.h / 2 : anchor[1] + lc[0] * sn + lc[1] * cs;
        const o = single, og = orig[0];
        if (o.type === 'text') { if (hx && hy) { const f = nw / og.w; o.s.fs = Math.max(6, +(og.fs * f).toFixed(1)); o.w = nw; o.autoW = false; FF.touch(o); FF.fitText(o); const dw = o.w, dh = o.h; o.x = cx - dw / 2; o.y = cy - dh / 2; } else if (hx) { o.w = nw; o.autoW = false; FF.touch(o); FF.fitText(o); o.x = cx - o.w / 2; o.y = cy - o.h / 2; } else { /* vertical handles: no-op for auto-height text */ } }
        else { o.w = nw; o.h = nh; o.x = cx - nw / 2; o.y = cy - nh / 2; if (o.type === 'stroke') { const sx = nw / og.w, sy = nh / og.h; const P = new Array(og.pts.length); for (let i = 0; i < P.length; i += 3) { P[i] = og.pts[i] * sx; P[i + 1] = og.pts[i + 1] * sy; P[i + 2] = og.pts[i + 2]; } o.pts = P; } else if (o.type === 'table') { o.cw = og.cw.map((v) => (v * nw) / og.w); o.rh = og.rh.map((v) => (v * nh) / og.h); } FF.touch(o); }
        FF.moved(o);
      } else {
        const ob = F; let nw = hx ? Math.max(8, (w2[0] - anchor[0]) * hx) : F.w, nh = hy ? Math.max(8, (w2[1] - anchor[1]) * hy) : F.h; if (e2.shiftKey && hx && hy) { const r = F.w / F.h; if (nw / nh > r) nh = nw / r; else nw = nh * r; }
        const sx = nw / F.w, sy = nh / F.h; const ax = anchor[0], ay = anchor[1];
        objs.forEach((o, i) => { const og = orig[i]; const cx = og.x + og.w / 2, cy = og.y + og.h / 2; const ncx = ax + (cx - ax) * sx, ncy = ay + (cy - ay) * sy;
          if (o.type === 'text') { o.s.fs = Math.max(6, +(og.fs * Math.min(sx, sy)).toFixed(1)); o.w = og.w * sx; o.autoW = false; FF.touch(o); FF.fitText(o); }
          else { o.w = og.w * sx; o.h = og.h * sy; if (o.type === 'stroke') { const P = new Array(og.pts.length); for (let j = 0; j < P.length; j += 3) { P[j] = og.pts[j] * sx; P[j + 1] = og.pts[j + 1] * sy; P[j + 2] = og.pts[j + 2]; } o.pts = P; } else if (o.type === 'table') { o.cw = og.cw.map((v) => v * sx); o.rh = og.rh.map((v) => v * sy); } FF.touch(o); }
          o.x = ncx - o.w / 2; o.y = ncy - o.h / 2; FF.moved(o); });
      }
      FF.reflow(ids); R.invalidate(); FF.emit('xform');
    }, up() { R.unfreeze(); t.end(); FF.reflow(); FF.emit('xform'); } };
  }
  function startRotate(e, w) {
    const objs = FF.selObjs().filter((o) => !o.lock && o.type !== 'conn'); const F = FF.selFrame(); const cx = F.x + F.w / 2, cy = F.y + F.h / 2; const t = FF.tx('Rotate'); t.touchAll(objs); const ids = new Set(objs.map((o) => o.id)); R.freeze(ids);
    const a0 = Math.atan2(w[1] - cy, w[0] - cx); const orig = objs.map((o) => ({ cx: o.x + o.w / 2, cy: o.y + o.h / 2, rot: o.rot || 0 })); S.rotInfo = 0;
    S.op = { move(e2, w2) { let d = Math.atan2(w2[1] - cy, w2[0] - cx) - a0;
      if (e2.shiftKey) d = Math.round(d / (Math.PI / 12)) * (Math.PI / 12); else if (objs.length === 1) { const r = ((orig[0].rot + d) * 180) / Math.PI; const snapped = Math.round(r / 45) * 45; if (Math.abs(r - snapped) < 3) d = (snapped * Math.PI) / 180 - orig[0].rot; }
      S.rotInfo = d; const c = Math.cos(d), s = Math.sin(d);
      objs.forEach((o, i) => { const og = orig[i]; const dx = og.cx - cx, dy = og.cy - cy; const ncx = cx + dx * c - dy * s, ncy = cy + dx * s + dy * c; o.rot = og.rot + d; o.x = ncx - o.w / 2; o.y = ncy - o.h / 2; FF.moved(o); });
      FF.reflow(ids); R.invalidate(); FF.emit('xform'); }, up() { S.rotInfo = null; R.unfreeze(); t.end(); FF.reflow(); FF.emit('xform'); } };
  }

  // ---------- connectors ----------
  function startConn(e, w, port) {
    const src = port ? port.o : FF.hitAt(w[0], w[1], 2, (o) => FF.connectable(o) && o.type !== 'frame') || null;
    const a = src ? { id: src.id, port: port ? port.p : 'auto' } : { x: w[0], y: w[1] };
    const c = FF.make('conn', { a, b: { x: w[0], y: w[1] }, kind: S.conn.kind, ha: S.conn.ha, hb: S.conn.hb, t: null });
    const t = FF.tx('Connector'); t.add(c); R.freeze([c.id]); R.cache = null; let moved = false;
    S.op = { move(e2, w2) { moved = true; const tg = connTarget(w2[0], w2[1], src && src === connTarget(w2[0], w2[1]) ? null : null);
      let tgt = tg && (tg !== src || false) ? tg : null; if (tgt) { let pp = null; for (const p of FF.ports) { const q = FF.portPos(tgt, p); if (Math.hypot(q.x - w2[0], q.y - w2[1]) < 16 / V().z) pp = p; } c.b = { id: tgt.id, port: pp || 'auto' }; S.connHot = { o: tgt, p: pp }; } else { c.b = { x: w2[0], y: w2[1] }; S.connHot = null; }
      FF.touch(c); R.invalidate(); R.invalidateOverlay(); },
      up(e2, cancel) { S.connHot = null; R.unfreeze(); const g = FF.connGeo(c); const len = g.A && Math.hypot(g.A.x - g.B.x, g.A.y - g.B.y);
        if (cancel || (!moved) || (!c.b.id && !c.a.id && len < 8) || len < 6) { FF.B.remove(c); t.b.delete(c.id); FF.rev++; R.invalidate(); return; }
        t.end(); FF.select([c]); if (S.tool === 'conn') FF.setTool('select'); FF.emit('xform'); } };
  }
  function startEndpoint(e, c, end) {
    const t = FF.tx('Move Connector End'); t.touch(c); R.freeze([c.id]);
    S.op = { move(e2, w2) { const tg = connTarget(w2[0], w2[1]); const other = c[end === 'a' ? 'b' : 'a']; const src = other.id ? other.id : null;
      if (tg && tg.id !== undefined) { let pp = null; for (const p of FF.ports) { const q = FF.portPos(tg, p); if (Math.hypot(q.x - w2[0], q.y - w2[1]) < 16 / V().z) pp = p; } c[end] = { id: tg.id, port: pp || 'auto' }; S.connHot = { o: tg, p: pp }; } else { c[end] = { x: w2[0], y: w2[1] }; S.connHot = null; }
      FF.touch(c); R.invalidate(); R.invalidateOverlay(); FF.emit('xform'); }, up() { S.connHot = null; R.unfreeze(); t.end(); } };
  }

  // ---------- drawing ----------
  function startDraw(e, w) {
    const tool = S.tool, st = S.pen[tool]; const pts = []; let last = null, wm = tool === 'pen' || tool === 'pencil' ? 0.7 : 1; const startT = performance.now();
    const pressure = (ev) => (ev.pointerType === 'pen' || (ev.pointerType === 'touch' && ev.pressure > 0 && ev.pressure !== 0.5)) && ev.pressure > 0 ? ev.pressure : null;
    let sm = null, count = 0, holdT = 0, holdPos = [e.clientX, e.clientY], snap = null;
    const add = (ev) => {
      const [x, y] = worldOf(ev), now = performance.now(), p = pressure(ev);
      if (!sm) sm = [x, y]; else { sm[0] += (x - sm[0]) * 0.55; sm[1] += (y - sm[1]) * 0.55; }
      if (last) { const dd = Math.hypot(sm[0] - last.x, sm[1] - last.y) * V().z; if (dd < 1.2) return; const dt = Math.max(1, now - last.t), v = dd / dt; if (tool === 'pen' || tool === 'pencil') { const target = p != null ? 0.3 + p * 1.1 : zk.clamp(1.35 - v * 0.5, 0.5, 1.3); wm += (target - wm) * (p != null ? 0.4 : 0.18); } else if (p != null && tool === 'marker') wm = 0.7 + p * 0.6; }
      else if (p != null) wm = 0.3 + p * 1.1;
      const ramp = tool === 'pen' ? Math.min(1, 0.55 + count * 0.15) : 1; count++;
      last = { x: sm[0], y: sm[1], t: now }; pts.push(sm[0], sm[1], +(wm * ramp).toFixed(2));
    };
    add(e); S.draw = { pts, tool, st, preview: null };
    const resetHold = (ev) => { clearTimeout(holdT); if (tool === 'hl' && false) return; holdT = setTimeout(() => { if (pts.length < 24) return; const P = []; for (let i = 0; i < pts.length; i += 3) P.push([pts[i], pts[i + 1]]); const r = FF.recognize(P, V().z); if (r) { snap = r; S.draw.preview = r; R.invalidateOverlay(); } }, 520); };
    resetHold();
    S.op = { move(e2, w2) { if (snap) { if (snap.type === 'line') { let [x, y] = w2; if (e2.shiftKey) { const dx = x - snap.a[0], dy = y - snap.a[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), l = Math.hypot(dx, dy); x = snap.a[0] + Math.cos(a) * l; y = snap.a[1] + Math.sin(a) * l; } snap.b = [x, y]; R.invalidateOverlay(); } return; }
      const evs = e2.getCoalescedEvents ? e2.getCoalescedEvents() : [e2]; for (const ev of evs.length ? evs : [e2]) add(ev); R.invalidateOverlay();
      if (Math.hypot(e2.clientX - holdPos[0], e2.clientY - holdPos[1]) > 4) { holdPos = [e2.clientX, e2.clientY]; resetHold(); } },
      up(e2, cancel) { clearTimeout(holdT); S.draw = null; if (cancel) return; const t = FF.tx(snap ? 'Draw Shape' : 'Draw'); let o;
        if (snap) o = FF.snapToObject(snap, st, tool);
        else { if (pts.length >= 9 && tool === 'pen') { const n = pts.length; pts[n - 1] *= 0.55; pts[n - 4] *= 0.75; } const simp = FF.simplify(pts, 0.35 / V().z); o = FF.makeStroke(simp, { stroke: st.color, sw: st.size, op: 1, tool: tool === 'marker' ? 'marker' : tool }); }
        t.add(o); t.end(); if (snap) FF.select([o]); R.invalidate(); } };
  }
  // Douglas-Peucker on [x,y,w] triplets
  FF.simplify = (P, eps) => {
    const n = P.length / 3; if (n < 4) return P.slice(); const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; for (let i = a + 1; i < b; i++) { const d = FF.segDist(P[i * 3], P[i * 3 + 1], P[a * 3], P[a * 3 + 1], P[b * 3], P[b * 3 + 1]); if (d > md) { md = d; mi = i; } } if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); return out;
  };

  // ---------- eraser ----------
  function startErase(e, w) {
    const t = FF.tx('Erase'); const r0 = () => S.eraser.size / V().z; let hits = 0;
    const doAt = (x, y) => { const r = r0(); const vb = [x - r - 40, y - r - 40, x + r + 40, y + r + 40];
      for (const o of FF.B.objs.slice()) { if (o.lock || (o.type !== 'stroke' && !(o.type === 'conn' && !o.a.id && !o.b.id))) continue; const b = FF.bb(o); if (b[2] < vb[0] || b[0] > vb[2] || b[3] < vb[1] || b[1] > vb[3]) continue;
        if (o.type === 'conn') { const g = FF.connGeo(o); if (FF.segDist(x, y, g.A.x, g.A.y, g.B.x, g.B.y) < r + 2) { t.del(o); hits++; } continue; }
        const W = FF.strokeWorld(o); const hw = (o.s.sw / 2) * 1; let touched = false; for (let i = 0; i < W.length; i++) { const q = W[i]; if (Math.hypot(q[0] - x, q[1] - y) < r + hw * 0.6) { touched = true; break; } if (i && FF.segDist(x, y, W[i - 1][0], W[i - 1][1], q[0], q[1]) < r + hw * 0.6) { touched = true; break; } }
        if (!touched) continue;
        if (S.eraser.mode === 'stroke') { t.del(o); hits++; continue; }
        // area: densify + cut
        const D = []; for (let i = 0; i < W.length; i++) { if (i) { const p = W[i - 1], q = W[i], d = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.ceil(d / (r * 0.5)); for (let j = 1; j < k; j++) D.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k, p[2] + ((q[2] - p[2]) * j) / k]); } D.push(W[i]); }
        const pieces = []; let cur = []; for (const q of D) { if (Math.hypot(q[0] - x, q[1] - y) < r + hw * 0.3) { if (cur.length) pieces.push(cur); cur = []; } else cur.push(q); } if (cur.length) pieces.push(cur);
        t.del(o); hits++; for (const pc of pieces) { if (pc.length < 2) continue; const flat = pc.flatMap((q) => q); const ns = FF.makeStroke(flat, { ...o.s }); ns.g = o.g; t.add(ns); }
      } R.invalidate(); };
    let lx = w[0], ly = w[1]; doAt(lx, ly);
    S.op = { move(e2, w2) { const d = Math.hypot(w2[0] - lx, w2[1] - ly), k = Math.max(1, Math.ceil(d / (r0() * 0.4))); for (let i = 1; i <= k; i++) doAt(lx + ((w2[0] - lx) * i) / k, ly + ((w2[1] - ly) * i) / k); lx = w2[0]; ly = w2[1]; FF.pruneSel(); }, up() { t.end(); FF.pruneSel(); } };
  }

  // ---------- lasso ----------
  function startLasso(e, w) {
    const P = [w]; S.lasso = P;
    S.op = { move(e2, w2) { P.push(w2); R.invalidateOverlay(); }, up() { S.lasso = null; if (P.length < 3) return; const inside = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
      const hit = FF.B.objs.filter((o) => { if (o.lock || o.hidden) return false; if (o.type === 'stroke') { const W = FF.strokeWorld(o); let n = 0; for (const q of W) if (inside(q[0], q[1])) n++; return n > W.length * 0.5; } const [cx, cy] = FF.center(o); return inside(cx, cy); });
      FF.select(hit); if (hit.length) FF.setTool('select'); } };
  }

  // ---------- create ----------
  const nextName = (type) => { let n = 1; for (const o of FF.B.objs) if (o.type === type) n++; return n; };
  function startCreate(e, w) {
    const tool = S.tool; let o; const t = FF.tx('Add'); const [x0, y0] = w;
    if (tool === 'shape') o = FF.make('shape', { kind: S.shape, x: x0, y: y0, w: 1, h: 1, s: { fit: true } });
    else if (tool === 'sticky') o = FF.make('sticky', { x: x0, y: y0, w: 1, h: 1, s: { fill: S.sticky } });
    else if (tool === 'text') o = FF.make('text', { x: x0, y: y0, w: 20, h: 34, autoW: true, t: [[{ t: '' }]] });
    else if (tool === 'frame') o = FF.make('frame', { x: x0, y: y0, w: 1, h: 1, title: 'Frame ' + nextName('frame'), seq: ++FF.B.seq });
    else if (tool === 'table') o = FF.tableObj(x0, y0, 3, 3, 1, 1);
    else if (tool === 'stamp') o = FF.make('stamp', { x: x0, y: y0, w: 1, h: 1, ch: S.stamp });
    else return;
    const dflt = { shape: [160, 110], sticky: [190, 190], frame: [520, 340], table: [360, 120], stamp: [72, 72], text: [0, 0] }[tool];
    t.add(o, tool === 'frame' ? 0 : undefined); R.freeze([o.id]); let dragged = false;
    S.op = { move(e2, w2) { if (Math.hypot(w2[0] - x0, w2[1] - y0) * V().z < 4 && !dragged) return; dragged = true; if (tool === 'text') { o.autoW = false; }
      let x1 = w2[0], y1 = w2[1], bx = Math.min(x0, x1), by = Math.min(y0, y1), bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
      if (e2.shiftKey || tool === 'sticky' || tool === 'stamp') { const m = Math.max(bw, bh); bw = bh = m; bx = x1 < x0 ? x0 - m : x0; by = y1 < y0 ? y0 - m : y0; }
      if (e2.altKey) { bx = x0 - bw; by = y0 - bh; bw *= 2; bh *= 2; }
      if (tool === 'text') { o.x = bx; o.w = Math.max(30, bw); FF.touch(o); FF.fitText(o); } else { o.x = bx; o.y = by; o.w = Math.max(2, bw); o.h = Math.max(2, bh); if (tool === 'table') FF.tableRescale(o); FF.touch(o); }
      R.invalidate(); FF.emit('xform'); },
      up(e2, cancel) { R.unfreeze(); if (cancel) { FF.B.remove(o); t.b.delete(o.id); FF.rev++; R.invalidate(); return; }
        if (!dragged && dflt) { if (tool !== 'text') { o.w = dflt[0]; o.h = dflt[1]; o.x = x0 - o.w / 2; o.y = y0 - o.h / 2; if (tool === 'table') FF.tableRescale(o); FF.touch(o); } }
        t.end(); FF.select([o]); FF.setTool('select'); if (tool === 'text' || tool === 'sticky') FF.beginEdit(o); else if (tool === 'frame') FF.emit('frames'); } };
  }
  FF.tableObj = (x, y, rows, cols, w, h) => { const o = FF.make('table', { x, y, w, h, rows, cols, hdr: true, cells: Array.from({ length: rows }, () => Array(cols).fill('')), cw: Array(cols).fill(w / cols), rh: Array(rows).fill(h / rows) }); return o; };
  FF.tableRescale = (o) => { o.cw = Array(o.cols).fill(o.w / o.cols); o.rh = Array(o.rows).fill(Math.max(30, o.h / o.rows)); o.h = o.rh.reduce((a, b) => a + b, 0); };
  FF.createText = (x, y) => { const t = FF.tx('Add Text'); const o = FF.make('text', { x, y: y - 17, w: 20, h: 34, autoW: true, t: [[{ t: '' }]] }); t.add(o); t.end(); FF.select([o]); FF.beginEdit(o); return o; };

  // ---------- laser / eyedropper ----------
  const laserPt = (w, hover) => { S.laser.push({ x: w[0], y: w[1], t: performance.now() }); S.laserOn = true; R.invalidateOverlay(); if (!laserRaf) laserRaf = requestAnimationFrame(laserTick); };
  let laserRaf = 0; const laserTick = () => { laserRaf = 0; const now = performance.now(); S.laser = S.laser.filter((p) => now - p.t < 900); R.invalidateOverlay(); if (S.laser.length) laserRaf = requestAnimationFrame(laserTick); };
  function eyedrop(e) {
    const [sx, sy] = canvasXY(e); const d = R.mc.getImageData(Math.round(sx * R.dpr), Math.round(sy * R.dpr), 1, 1).data; const hex = '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('');
    FF.emit('picked', hex); S.op = null; FF.setTool(S.prevTool || 'select');
  }

  // ---------- overlay painting ----------
  R.onOverlay = (g, v, dpr) => {
    const z = v.z, px = 1 / z, ac = accent(); g.lineJoin = 'round';
    const sel = FF.selObjs();
    // hover
    if (S.hover && !S.sel.has(S.hover.id) && !S.op) { g.strokeStyle = ac; g.globalAlpha = 0.55; g.lineWidth = 1.5 * px; outlineObj(g, S.hover); g.globalAlpha = 1; }
    if (S.tool === 'select' && !S.op) { const h = S.hover && FF.connectable(S.hover) ? S.hover : null; const ss = sel.length === 1 && FF.connectable(sel[0]) ? sel[0] : null; for (const c of [h, ss]) if (c && !c.lock) for (const p of FF.ports) dot(g, portDot(c, p), 5 * px, ac, true); }
    if (S.tool === 'conn' && S.hover && !S.op) for (const p of FF.ports) dot(g, portDot(S.hover, p), 5 * px, ac, true);
    if (S.connHot) { g.strokeStyle = ac; g.lineWidth = 2.5 * px; outlineObj(g, S.connHot.o); for (const p of FF.ports) dot(g, portDot(S.connHot.o, p), p === S.connHot.p ? 6 * px : 4 * px, ac, p === S.connHot.p); }
    // selection
    if (sel.length) {
      g.strokeStyle = ac; g.lineWidth = 1.25 * px; for (const o of sel) { if (sel.length > 1 || o.type === 'conn') { g.globalAlpha = 0.7; outlineObj(g, o, 2 * px); g.globalAlpha = 1; } }
      const F = FF.selFrame();
      if (F && !S.op?.pan) {
        const locked = sel.every((o) => o.lock);
        if (sel.length === 1 && sel[0].type === 'conn') { const gg = FF.connGeo(sel[0]); if (!locked) { dot(g, [gg.A.x, gg.A.y], 6 * px, ac, false); dot(g, [gg.B.x, gg.B.y], 6 * px, ac, false); } }
        else { g.save(); g.translate(F.x + F.w / 2, F.y + F.h / 2); g.rotate(F.rot); g.strokeStyle = ac; g.lineWidth = 1.5 * px; g.strokeRect(-F.w / 2, -F.h / 2, F.w, F.h); g.restore();
          if (locked) { /* lock badge */ g.fillStyle = ac; const p = fpt(F, 1, 0); g.beginPath(); g.arc(p[0], p[1] - 14 * px, 9 * px, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.fillRect(p[0] - 3.5 * px, p[1] - 15.5 * px, 7 * px, 5 * px); g.strokeStyle = '#fff'; g.lineWidth = 1.4 * px; g.beginPath(); g.arc(p[0], p[1] - 16 * px, 2.6 * px, Math.PI, 0); g.stroke(); }
          else { const rh = rotHandle(F); const top = fpt(F, 0.5, 0); g.strokeStyle = ac; g.lineWidth = 1 * px; g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(rh[0], rh[1]); g.stroke(); dot(g, rh, 6 * px, ac, false);
            for (const [k, fx, fy] of HANDLES) { const p = fpt(F, fx, fy); const big = k.length === 2; g.save(); g.translate(p[0], p[1]); g.rotate(F.rot); g.fillStyle = '#fff'; g.strokeStyle = ac; g.lineWidth = 1.5 * px; const sz = (big ? 8 : 7) * px; if (big) { g.beginPath(); g.rect(-sz / 2, -sz / 2, sz, sz); } else { g.beginPath(); if (k === 'n' || k === 's') g.roundRect(-6 * px, -2.5 * px, 12 * px, 5 * px, 2.5 * px); else g.roundRect(-2.5 * px, -6 * px, 5 * px, 12 * px, 2.5 * px); } g.fill(); g.stroke(); g.restore(); }
            if (S.rotInfo != null && S.op) { g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); const [sx, sy] = FF.w2s(rh[0], rh[1]); label(g, Math.round((((F.rot + S.rotInfo * (F.single ? 0 : 0)) * 180) / Math.PI + (F.single ? 0 : (S.rotInfo * 180) / Math.PI)) % 360) + '°', sx + 14, sy); g.restore(); } } }
      }
    }
    // guides
    g.strokeStyle = '#ff3b30'; g.lineWidth = 1 * px; for (const gd of S.guides) { g.beginPath(); if (gd.v) { g.moveTo(gd.at, gd.a); g.lineTo(gd.at, gd.b); } else { g.moveTo(gd.a, gd.at); g.lineTo(gd.b, gd.at); } g.stroke(); }
    if (S.marquee) { const M = S.marquee; g.fillStyle = ac + '22'; g.strokeStyle = ac; g.lineWidth = 1 * px; g.fillRect(M.x0, M.y0, M.x1 - M.x0, M.y1 - M.y0); g.strokeRect(M.x0, M.y0, M.x1 - M.x0, M.y1 - M.y0); }
    if (S.lasso) { g.beginPath(); S.lasso.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = ac + '22'; g.fill(); g.strokeStyle = ac; g.lineWidth = 1.5 * px; g.setLineDash([5 * px, 4 * px]); g.stroke(); g.setLineDash([]); }
    // in-progress stroke
    if (S.draw) { const d = S.draw;
      if (d.preview) { const r = d.preview; g.strokeStyle = FF.col(d.st.color, FF.dark); g.lineWidth = d.st.size; g.lineCap = 'round'; g.globalAlpha = d.tool === 'hl' ? 0.4 : 1; g.beginPath(); FF.previewShapePath(g, r); g.stroke(); g.globalAlpha = 1; }
      else if (d.pts.length >= 3) { const o = { type: 'stroke', pts: d.pts, x: 0, y: 0, w: 1, h: 1, rot: 0, s: { stroke: d.st.color, sw: d.st.size, op: 1, tool: d.tool === 'marker' ? 'marker' : d.tool } }; FF.drawObj(g, o, { z, dark: FF.dark, sc: z * dpr }); } }
    if (S.tool === 'eraser' && !S.op?.pan && S.pointer.x) { const [x, y] = S.pointer.w; g.beginPath(); g.arc(x, y, S.eraser.size / z, 0, 6.3); g.strokeStyle = FF.dark ? '#fff' : '#000'; g.globalAlpha = 0.6; g.lineWidth = 1.2 * px; g.stroke(); g.globalAlpha = 1; }
    if (S.laser.length) { const now = performance.now(); g.lineCap = 'round'; for (let i = 1; i < S.laser.length; i++) { const a = S.laser[i - 1], b = S.laser[i], age = (now - b.t) / 900, al = Math.max(0, 1 - age); g.strokeStyle = `rgba(255,40,70,${al})`; g.lineWidth = (3 + 5 * al) * px; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } const l = S.laser[S.laser.length - 1]; if (now - l.t < 500) { const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, 16 * px); gr.addColorStop(0, 'rgba(255,60,80,.95)'); gr.addColorStop(0.35, 'rgba(255,40,70,.5)'); gr.addColorStop(1, 'rgba(255,40,70,0)'); g.fillStyle = gr; g.beginPath(); g.arc(l.x, l.y, 16 * px, 0, 6.3); g.fill(); } }
    FF.positionEditor && FF.positionEditor();
  };
  const dot = (g, p, r, ac, plus) => { g.beginPath(); g.arc(p[0], p[1], r, 0, 6.3); g.fillStyle = plus ? ac : '#fff'; g.fill(); g.strokeStyle = plus ? '#fff' : ac; g.lineWidth = r * 0.3; g.stroke(); };
  const label = (g, text, x, y) => { g.font = '600 11px system-ui'; const w = g.measureText(text).width + 12; g.fillStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.roundRect(x, y - 10, w, 20, 6); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, x + 6, y); };
  const outlineObj = (g, o, grow = 0) => {
    if (o.type === 'conn') { const gg = FF.connGeo(o); g.lineWidth = (o.s.sw || 2) + 6 / V().z; g.lineCap = 'round'; g.globalAlpha *= 0.4; g.stroke(gg.p); g.globalAlpha /= 0.4 || 1; return; }
    g.save(); g.translate(o.x + o.w / 2, o.y + o.h / 2); g.rotate(o.rot || 0); if (o.type === 'shape' && !grow) { g.translate(-o.w / 2, -o.h / 2); g.stroke(FF.shapePath(o).p); } else g.strokeRect(-o.w / 2 - grow, -o.h / 2 - grow, o.w + 2 * grow, o.h + 2 * grow); g.restore();
  };

  // ---------- resize / lifecycle ----------
  const ro = new ResizeObserver(() => { rect = stage.getBoundingClientRect(); const d = window.devicePixelRatio || 1; R.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), d); FF.emit('view'); });
  ro.observe(stage);
  FF.refreshRect = () => { rect = stage.getBoundingClientRect(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (m) => { FF.dark = R.dark = m.matches; R.cache = null; R.invalidate(); FF.emit('theme'); });
  FF.stage = stage;
  FF.getRect = () => rect;
})();
