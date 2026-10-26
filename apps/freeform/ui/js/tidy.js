/* Canvas "Tidy": arrange any pile of objects (grid, row, column, radial, tree, mind map, colour clusters, rhythm)
   with spring-animated live preview on hover, fully undoable. Plus "Rough to neat" for hand-drawn selections. */
(() => {
  'use strict';
  const S = FF.S, R = FF.R, E = zk.el;
  const GAP = 28;
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

  // ---------- units (a group moves as one) ----------
  const colorKey = (u) => { const o = u.members[0]; const c = o.type === 'stroke' ? o.s.stroke : o.s.fill && o.s.fill !== 'none' ? o.s.fill : o.s.stroke || 'none'; return String(FF.col(c, false)).toLowerCase(); };
  const unitsOf = (objs) => {
    const by = new Map(), out = [];
    for (const o of objs) { if (o.g) { let u = by.get(o.g); if (!u) { u = { members: [] }; by.set(o.g, u); out.push(u); } u.members.push(o); } else out.push({ members: [o] }); }
    for (const u of out) { const b = FF.unionBB(u.members); u.bb = b; u.w = b[2] - b[0]; u.h = b[3] - b[1]; u.cx = (b[0] + b[2]) / 2; u.cy = (b[1] + b[3]) / 2; u.single = u.members.length === 1 ? u.members[0] : null; u.key = colorKey(u); u.id = u.members[0].id; }
    return out;
  };
  const reading = (us) => { // row-bands then left to right
    const tol = Math.max(10, median(us.map((u) => u.h)) * 0.6); const a = us.slice().sort((p, q) => p.cy - q.cy); const bands = []; for (const u of a) { const b = bands[bands.length - 1]; if (b && Math.abs(u.cy - b.cy) <= tol) { b.items.push(u); b.cy = (b.cy * (b.items.length - 1) + u.cy) / b.items.length; } else bands.push({ cy: u.cy, items: [u] }); }
    return bands.flatMap((b) => b.items.sort((p, q) => p.cx - q.cx));
  };

  // ---------- layouts: each returns Map unit -> {cx, cy} (centre), then re-centred on the selection centre ----------
  const L = {};
  L.grid = (us, ctx) => {
    const n = us.length, o = reading(us); const cols = zk.clamp(Math.round(Math.sqrt(n * (ctx.w / Math.max(1, ctx.h)))), 1, n), rows = Math.ceil(n / cols);
    const cw = Array(cols).fill(0), rh = Array(rows).fill(0); o.forEach((u, i) => { cw[i % cols] = Math.max(cw[i % cols], u.w); rh[Math.floor(i / cols)] = Math.max(rh[Math.floor(i / cols)], u.h); });
    const m = new Map(); let y = 0; for (let r = 0; r < rows; r++) { let x = 0; for (let c = 0; c < cols; c++) { const u = o[r * cols + c]; if (u) m.set(u, { cx: x + cw[c] / 2, cy: y + rh[r] / 2 }); x += cw[c] + GAP; } y += rh[r] + GAP; } return { pos: m };
  };
  L.row = (us) => { const m = new Map(); let x = 0; for (const u of reading(us).sort((p, q) => p.cx - q.cx)) { m.set(u, { cx: x + u.w / 2, cy: 0 }); x += u.w + GAP; } return { pos: m }; };
  L.column = (us) => { const m = new Map(); let y = 0; for (const u of us.slice().sort((p, q) => p.cy - q.cy)) { m.set(u, { cx: 0, cy: y + u.h / 2 }); y += u.h + GAP; } return { pos: m }; };
  L.radial = (us, ctx) => {
    const m = new Map(); const hub = us.slice().sort((p, q) => Math.hypot(p.cx - ctx.cx, p.cy - ctx.cy) - Math.hypot(q.cx - ctx.cx, q.cy - ctx.cy))[0];
    m.set(hub, { cx: 0, cy: 0 }); const rest = us.filter((u) => u !== hub).sort((p, q) => Math.atan2(p.cy - hub.cy, p.cx - hub.cx) - Math.atan2(q.cy - hub.cy, q.cx - hub.cx));
    const diag = (u) => Math.hypot(u.w, u.h); const avg = rest.reduce((s, u) => s + diag(u), 0) / Math.max(1, rest.length); let ring = 0, i = 0, r = diag(hub) / 2 + avg / 2 + GAP;
    while (i < rest.length) { const cap = Math.max(3, Math.floor((2 * Math.PI * r) / (avg + GAP))); const take = rest.slice(i, i + cap); const off = -Math.PI / 2 + (ring % 2) * (Math.PI / cap); take.forEach((u, k) => { const a = off + (k / take.length) * Math.PI * 2; m.set(u, { cx: Math.cos(a) * r, cy: Math.sin(a) * r }); }); i += cap; ring++; r += avg + GAP * 1.2; }
    return { pos: m };
  };
  L.cluster = (us) => {
    const groups = new Map(); for (const u of us) { if (!groups.has(u.key)) groups.set(u.key, []); groups.get(u.key).push(u); }
    const cl = [...groups.values()].sort((a, b) => b.length - a.length).map((items) => { const o = reading(items); const cols = Math.ceil(Math.sqrt(o.length)); const rows = Math.ceil(o.length / cols); const cw = Array(cols).fill(0), rh = Array(rows).fill(0); o.forEach((u, i) => { cw[i % cols] = Math.max(cw[i % cols], u.w); rh[Math.floor(i / cols)] = Math.max(rh[Math.floor(i / cols)], u.h); }); const loc = new Map(); let y = 0; for (let r = 0; r < rows; r++) { let x = 0; for (let c = 0; c < cols; c++) { const u = o[r * cols + c]; if (u) loc.set(u, { cx: x + cw[c] / 2, cy: y + rh[r] / 2 }); x += cw[c] + GAP * 0.6; } y += rh[r] + GAP * 0.6; } return { loc, w: cw.reduce((a, b) => a + b, 0) + (cols - 1) * GAP * 0.6, h: rh.reduce((a, b) => a + b, 0) + (rows - 1) * GAP * 0.6 }; });
    const area = cl.reduce((s, c) => s + (c.w + 70) * (c.h + 70), 0), maxW = Math.max(Math.sqrt(area) * 1.35, ...cl.map((c) => c.w));
    const m = new Map(); let x = 0, y = 0, rowH = 0; for (const c of cl) { if (x > 0 && x + c.w > maxW) { x = 0; y += rowH + 70; rowH = 0; } for (const [u, p] of c.loc) m.set(u, { cx: x + p.cx, cy: y + p.cy }); x += c.w + 70; rowH = Math.max(rowH, c.h); }
    return { pos: m };
  };
  L.rhythm = (us) => {
    const m = new Map(), size = new Map(); const rs = us.filter((u) => u.single && !u.single.rot && ['shape', 'sticky', 'image', 'card', 'table', 'stamp'].includes(u.single.type));
    const mw = median(rs.map((u) => u.w)), mh = median(rs.map((u) => u.h)); const keepAspect = (u) => u.single.type === 'image' || u.single.type === 'stamp';
    for (const u of rs) { if (Math.abs(u.w - mw) / mw < 0.5 && Math.abs(u.h - mh) / mh < 0.5) { let w = mw, h = mh; if (keepAspect(u)) { const k = Math.min(mw / u.w, mh / u.h); w = u.w * k; h = u.h * k; } size.set(u, { w, h }); } }
    const sz = (u) => size.get(u) || { w: u.w, h: u.h }; const rowsA = []; const tol = Math.max(10, mh * 0.6 || 20); for (const u of us.slice().sort((p, q) => p.cy - q.cy)) { const r = rowsA[rowsA.length - 1]; if (r && Math.abs(u.cy - r.cy) <= tol) { r.items.push(u); r.cy = (r.cy * (r.items.length - 1) + u.cy) / r.items.length; } else rowsA.push({ cy: u.cy, items: [u] }); }
    const gx = [], gy = []; rowsA.forEach((r, i) => { r.items.sort((p, q) => p.cx - q.cx); for (let k = 1; k < r.items.length; k++) { const g = r.items[k].bb[0] - r.items[k - 1].bb[2]; if (g > 0) gx.push(g); } if (i) { const pr = rowsA[i - 1]; const g = Math.min(...r.items.map((u) => u.bb[1])) - Math.max(...pr.items.map((u) => u.bb[3])); if (g > 0) gy.push(g); } });
    const dx = zk.clamp(median(gx) || GAP, 12, 90), dy = zk.clamp(median(gy) || GAP, 12, 90); let y = 0;
    for (const r of rowsA) { const hh = Math.max(...r.items.map((u) => sz(u).h)); let x = 0; for (const u of r.items) { const s = sz(u); m.set(u, { cx: x + s.w / 2, cy: y + hh / 2, w: size.has(u) ? s.w : undefined, h: size.has(u) ? s.h : undefined }); x += s.w + dx; } y += hh + dy; }
    return { pos: m, anchorTL: true };
  };

  // hierarchy for tree / mind map
  function hierarchy(us, mode, ctx) {
    for (const c of FF.B.objs) if (c.type === 'conn') c._tid = false;
    const ids = new Map(); us.forEach((u) => u.members.forEach((o) => ids.set(o.id, u)));
    const kids = new Map(us.map((u) => [u, []])), hasParent = new Set(); let used = false;
    for (const c of FF.B.objs) if (c.type === 'conn' && !c.ghost && c.a.id && c.b.id) { const pa = ids.get(c.a.id), ch = ids.get(c.b.id); if (pa && ch && pa !== ch && !hasParent.has(ch) && !kids.get(ch).includes(pa)) { kids.get(pa).push(ch); hasParent.add(ch); used = true; (c._tid = true); } }
    let roots = us.filter((u) => !hasParent.has(u)); const edges = [];
    if (!used) {
      if (mode === 'mind') { const hub = us.slice().sort((p, q) => Math.hypot(p.cx - ctx.cx, p.cy - ctx.cy) - Math.hypot(q.cx - ctx.cx, q.cy - ctx.cy))[0]; for (const u of us) if (u !== hub) { kids.get(hub).push(u); edges.push([hub, u]); } roots = [hub]; }
      else { const o = reading(us); o.forEach((u, i) => { if (i) { const p = o[Math.floor((i - 1) / 3)]; kids.get(p).push(u); edges.push([p, u]); } }); roots = [o[0]]; }
    }
    for (const [p, ks] of kids) ks.sort((a, b) => (mode === 'mind' ? a.cy - b.cy : a.cx - b.cx));
    if (mode === 'mind' && roots.length > 1) { const [main, ...others] = roots; for (const r of others) kids.get(main).push(r); roots = [main]; }
    // cycle safety: ensure every unit reachable
    const seen = new Set(); const mark = (u) => { if (seen.has(u)) return; seen.add(u); kids.get(u).forEach(mark); }; roots.forEach(mark); for (const u of us) if (!seen.has(u)) { roots.push(u); mark(u); }
    return { kids, roots, edges, existing: used };
  }
  L.tree = (us, ctx) => {
    const H = hierarchy(us, 'tree', ctx); const w = new Map(); const sw = (u) => { if (w.has(u)) return w.get(u); const ks = H.kids.get(u); const cw = ks.length ? ks.reduce((s, k) => s + sw(k), 0) + (ks.length - 1) * GAP : 0; const v = Math.max(u.w, cw); w.set(u, v); return v; };
    const depth = new Map(); const walk = (u, d) => { depth.set(u, d); H.kids.get(u).forEach((k) => walk(k, d + 1)); }; H.roots.forEach((r) => walk(r, 0));
    const lh = []; for (const [u, d] of depth) lh[d] = Math.max(lh[d] || 0, u.h); const ly = []; let y = 0; lh.forEach((h, d) => { ly[d] = y; y += h + 64; });
    const m = new Map(); const place = (u, x0) => { const span = sw(u); m.set(u, { cx: x0 + span / 2, cy: ly[depth.get(u)] + lh[depth.get(u)] / 2 }); let x = x0 + (span - (H.kids.get(u).length ? H.kids.get(u).reduce((s, k) => s + sw(k), 0) + (H.kids.get(u).length - 1) * GAP : 0)) / 2; for (const k of H.kids.get(u)) { place(k, x); x += sw(k) + GAP; } };
    let x = 0; for (const r of H.roots) { place(r, x); x += sw(r) + GAP * 2; }
    return { pos: m, edges: H.edges, ports: (p, c) => ['s', 'n'], kind: 'elbow', head: 'arrow', hier: H };
  };
  L.mind = (us, ctx) => {
    const H = hierarchy(us, 'mind', ctx); const root = H.roots[0]; const hh = new Map(); const sh = (u) => { if (hh.has(u)) return hh.get(u); const ks = H.kids.get(u); const v = Math.max(u.h, ks.length ? ks.reduce((s, k) => s + sh(k), 0) + (ks.length - 1) * (GAP * 0.7) : 0); hh.set(u, v); return v; };
    const m = new Map(), side = new Map(); m.set(root, { cx: 0, cy: 0 });
    const lay = (u, dir, edge, cy) => { const cx = dir > 0 ? edge + u.w / 2 : edge - u.w / 2; m.set(u, { cx, cy }); side.set(u, dir); const ks = H.kids.get(u); const tot = ks.reduce((s, k) => s + sh(k), 0) + Math.max(0, ks.length - 1) * (GAP * 0.7); let y = cy - tot / 2; for (const k of ks) { lay(k, dir, dir > 0 ? cx + u.w / 2 + 84 : cx - u.w / 2 - 84, y + sh(k) / 2); y += sh(k) + GAP * 0.7; } };
    const rk = H.kids.get(root); const right = rk.filter((_, i) => i % 2 === 0), left = rk.filter((_, i) => i % 2 === 1);
    for (const [grp, dir] of [[right, 1], [left, -1]]) { const tot = grp.reduce((s, k) => s + sh(k), 0) + Math.max(0, grp.length - 1) * (GAP * 0.7); let y = -tot / 2; for (const k of grp) { lay(k, dir, dir > 0 ? root.w / 2 + 96 : -root.w / 2 - 96, y + sh(k) / 2); y += sh(k) + GAP * 0.7; } }
    return { pos: m, edges: H.edges, ports: (p, c) => (side.get(c) > 0 ? ['e', 'w'] : ['w', 'e']), kind: 'curve', head: 'none', hier: H };
  };
  FF.TIDY_MODES = [
    { id: 'grid', label: 'Grid', icon: 'layout-grid', tip: 'Neat rows and columns' }, { id: 'row', label: 'Row', icon: 'columns-2', tip: 'One line, left to right' }, { id: 'column', label: 'Column', icon: 'rows-2', tip: 'One stack, top to bottom' },
    { id: 'radial', label: 'Radial', icon: 'target', tip: 'Rings around a hub' }, { id: 'tree', label: 'Tree', icon: 'list-tree', tip: 'Top-down tree, with connectors' }, { id: 'mind', label: 'Mind map', icon: 'share-2', tip: 'Branches left and right, with connectors' },
    { id: 'cluster', label: 'Colours', icon: 'droplets', tip: 'Cluster by colour' }, { id: 'rhythm', label: 'Rhythm', icon: 'equal', tip: 'Equalise gaps and sizes' },
  ];

  // ---------- planning ----------
  FF.tidyTargets = () => FF.selObjs().filter((o) => o.type !== 'conn' && o.type !== 'frame' && !o.lock);
  function plan(mode, objs) {
    const us = unitsOf(objs); const b = FF.unionBB(objs); const ctx = { w: b[2] - b[0], h: b[3] - b[1], cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 };
    const res = L[mode](us, ctx); // centres in layout space
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const [u, p] of res.pos) { const w = p.w || u.w, h = p.h || u.h; x0 = Math.min(x0, p.cx - w / 2); y0 = Math.min(y0, p.cy - h / 2); x1 = Math.max(x1, p.cx + w / 2); y1 = Math.max(y1, p.cy + h / 2); }
    const ox = ctx.cx - (x0 + x1) / 2, oy = ctx.cy - (y0 + y1) / 2; const targets = new Map(); // id -> {x,y,w,h}
    for (const [u, p] of res.pos) {
      const nw = p.w || u.w, nh = p.h || u.h, tl = [p.cx + ox - nw / 2, p.cy + oy - nh / 2];
      if (p.w && u.single && (Math.abs(p.w - u.w) > 0.5 || Math.abs(p.h - u.h) > 0.5)) { const o = u.single; targets.set(o.id, { x: tl[0], y: tl[1], w: p.w, h: p.h }); continue; }
      const dx = tl[0] - u.bb[0], dy = tl[1] - u.bb[1]; for (const o of u.members) targets.set(o.id, { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
    }
    return { targets, edges: (res.edges || []).map(([p, c]) => [p.members[0], c.members[0], res.ports(p, c)]), kind: res.kind, head: res.head, hier: res.hier, mode };
  }
  FF.tidyPlan = plan;

  // ---------- preview / commit engine ----------
  let P = null; // {objs, ids, base, anim, ghosts, leaveT, t}
  const snap = (objs) => new Map(objs.map((o) => [o.id, { x: o.x, y: o.y, w: o.w, h: o.h }]));
  const apply = (map) => { for (const [id, v] of map) { const o = FF.B.map.get(id); if (!o) continue; const resized = o.w !== v.w || o.h !== v.h; o.x = v.x; o.y = v.y; if (resized) { o.w = v.w; o.h = v.h; FF.touch(o); } else FF.moved(o); } FF.reflow(P ? P.ids : null); R.invalidate(); FF.emit('xform'); };
  const lerpMap = (a, b, p) => { const m = new Map(); for (const [id, v] of a) { const t = b.get(id) || v; m.set(id, { x: v.x + (t.x - v.x) * p, y: v.y + (t.y - v.y) * p, w: v.w + (t.w - v.w) * p, h: v.h + (t.h - v.h) * p }); } return m; };
  function animate(to, done) {
    if (P.anim) P.anim.stop(); const from = snap(P.objs); P.to = to;
    P.anim = zk.spring({ from: 0, to: 1, response: 0.46, damping: 0.86, eps: 0.0006, onUpdate: (p) => apply(lerpMap(from, to, p)), onDone: () => { P.anim = null; apply(to); done && done(); } });
  }
  const clearGhosts = () => { if (!P) return; for (const g of P.ghosts) FF.B.remove(g); P.ghosts = []; };
  const setGhosts = (pl) => {
    clearGhosts(); if (!pl.edges.length) return;
    for (const [p, c, [pp, cp]] of pl.edges) { const g = FF.make('conn', { a: { id: p.id, port: pp }, b: { id: c.id, port: cp }, kind: pl.kind, hb: pl.head, ha: 'none', ghost: 1 }); g.s.op = 0.55; FF.B.add(g); P.ghosts.push(g); }
    const ids = new Set(P.ids); R.freeze(ids);
  };
  const setRaw = (map) => { for (const [id, v] of map) { const o = FF.B.map.get(id); if (!o) continue; o.x = v.x; o.y = v.y; o.w = v.w; o.h = v.h; FF.touch(o); } };
  const planBase = (mode) => { const cur = snap(P.objs); setRaw(P.base); try { return plan(mode, P.objs); } finally { setRaw(cur); } };
  function begin() { const objs = FF.tidyTargets(); if (objs.length < 2) return false; if (S.editing) FF.endEdit(); P = { objs, ids: new Set(objs.map((o) => o.id)), base: snap(objs), anim: null, ghosts: [], mode: null }; R.freeze(P.ids); return true; }
  function finish() { if (!P) return; if (P.anim) P.anim.stop(); clearGhosts(); R.unfreeze(); P = null; FF.reflow(); R.invalidate(); FF.emit('xform'); hint(null); }
  FF.tidyPreview = (mode) => {
    if (P && P.committing) return; clearTimeout(P && P.leaveT);
    if (!P && !begin()) return; if (P.mode === mode) return; P.mode = mode; const pl = planBase(mode); P.plan = pl; setGhosts(pl); animate(pl.targets); hint(mode);
  };
  FF.tidyUnpreview = () => { if (!P || P.committing) return; clearTimeout(P.leaveT); P.leaveT = setTimeout(() => { if (!P || P.committing) return; P.mode = null; animate(P.base, () => finish()); }, 140); };
  FF.tidyCancel = () => { if (!P) return; if (P.anim) P.anim.stop(); apply(P.base); finish(); };
  FF.tidyCommit = (mode) => {
    if (!P && !begin()) return; clearTimeout(P.leaveT); const objs = P.objs, base = P.base, disp = snap(objs); const pl = planBase(mode); P.committing = true; if (P.anim) P.anim.stop();
    apply(base); // record the true "before" state
    const t = FF.tx('Tidy: ' + (FF.TIDY_MODES.find((m) => m.id === mode) || {}).label); t.touchAll(objs);
    const connsTouched = []; if (pl.hier && pl.hier.existing) for (const c of FF.B.objs) if (c.type === 'conn' && c.a.id && c.b.id && c._tid) { t.touch(c); connsTouched.push(c); }
    clearGhosts(); const ids = P.ids; apply(disp); R.freeze(ids);
    const mk = []; for (const [p, c, [pp, cp]] of pl.edges) { const g = FF.make('conn', { a: { id: p.id, port: pp }, b: { id: c.id, port: cp }, kind: pl.kind, hb: pl.head, ha: 'none' }); t.add(g); mk.push(g); }
    if (mk.length) { const all = new Set(ids); R.freeze(all); }
    P.anim = zk.spring({ from: 0, to: 1, response: 0.4, damping: 0.88, eps: 0.0006, onUpdate: (p) => apply(lerpMap(disp, pl.targets, p)), onDone: () => { apply(pl.targets);
      for (const c of connsTouched) { const q = pl.hier; } // keep existing connector kinds, refresh ports for neat routes
      if (pl.hier && pl.hier.existing) { const idToUnit = new Map(); for (const c of connsTouched) { const A = FF.B.map.get(c.a.id), B = FF.B.map.get(c.b.id); if (!A || !B) continue; const ac = FF.center(A), bc = FF.center(B); if (mode === 'tree') { c.a.port = 's'; c.b.port = 'n'; } else if (mode === 'mind') { const right = bc[0] >= ac[0]; c.a.port = right ? 'e' : 'w'; c.b.port = right ? 'w' : 'e'; } FF.touch(c); } }
      t.end(); P.anim = null; finish(); FF.select(objs); const bb = FF.unionBB(objs), v = R.view, rr = FF.getRect(); if (bb[0] < v.x || bb[1] < v.y || bb[2] > v.x + rr.width / v.z || bb[3] > v.y + rr.height / v.z) FF.zoomFit(objs); R.invalidate(); } });
    armed = false; say(`Tidied ${objs.length} objects as ${(FF.TIDY_MODES.find((m) => m.id === mode) || {}).label.toLowerCase()}`);
  };

  // ---------- rough to neat ----------
  const polyLen = (P) => { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return l; };
  FF.roughToNeat = (opts = {}) => {
    const strokes = FF.selObjs().filter((o) => o.type === 'stroke' && !o.lock); if (!strokes.length) { FF.tidySay('Select some hand-drawn strokes first'); return 0; }
    const info = strokes.map((o) => { const P = FF.strokeWorld(o).map((q) => [q[0], q[1]]); return { o, P, len: polyLen(P), rec: FF.recognize(P, 1) }; });
    const lines = info.filter((i) => i.rec && i.rec.type === 'line'); const used = new Set(); const heads = new Map(); // line -> {a?:true,b?:true}
    for (const L0 of lines.sort((p, q) => q.len - p.len)) {
      const { a, b } = L0.rec, ll = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const s of info) { if (s === L0 || used.has(s) || s.len > Math.min(110, ll * 0.45) || (s.rec && s.rec.type === 'shape')) continue; if (lines.includes(s) && s.len > ll * 0.45) continue; const r = Math.max(24, ll * 0.12);
        const near = (pt) => s.P.some((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < r); const ea = near(a), eb = near(b); if (ea === eb) continue; used.add(s); const h = heads.get(L0) || {}; if (ea) h.a = true; else h.b = true; heads.set(L0, h); }
    }
    const made = [], removed = []; const created = new Map(); const out = [];
    for (const i of info) { if (used.has(i)) { removed.push(i.o); continue; } const sty = { stroke: i.o.s.stroke, sw: zk.clamp(Math.round(i.o.s.sw), 2, 8), op: i.o.s.op == null ? 1 : i.o.s.op };
      if (!i.rec) continue;
      if (i.rec.type === 'shape') { let [x0, y0, x1, y1] = i.rec.box; let w = x1 - x0, h = y1 - y0; if (Math.abs(w - h) / Math.max(w, h) < 0.12) { const m = (w + h) / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; w = h = m; x0 = cx - m / 2; y0 = cy - m / 2; }
        const g = Math.max(1, Math.round(1)); const o = FF.make('shape', { kind: i.rec.kind, x: x0, y: y0, w, h, s: { fill: 'none', stroke: sty.stroke, sw: sty.sw, op: 1, fit: true } }); o.s.fill = 'none'; made.push(o); created.set(i, o); removed.push(i.o); }
    }
    const shapesNew = made.slice(); const shapeTargets = () => [...shapesNew, ...FF.B.objs.filter((o) => FF.connectable(o) && o.type !== 'frame' && !strokes.includes(o))];
    const attach = (pt) => { let best = null, bd = 26; for (const o of shapeTargets()) { const b = FF.bb(o); const dx = Math.max(b[0] - pt[0], 0, pt[0] - b[2]), dy = Math.max(b[1] - pt[1], 0, pt[1] - b[3]); let d = Math.hypot(dx, dy); if (d === 0) { d = Math.min(pt[0] - b[0], b[2] - pt[0], pt[1] - b[1], b[3] - pt[1]); if (d > 14) continue; } if (d < bd) { bd = d; best = o; } } return best; };
    for (const i of lines) { if (used.has(i)) continue; let [a, b] = [i.rec.a.slice(), i.rec.b.slice()]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), deg = (ang * 180) / Math.PI; const sn = Math.round(deg / 45) * 45; if (Math.abs(deg - sn) < 5) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, r = (sn * Math.PI) / 180; a = [mx - (Math.cos(r) * l) / 2, my - (Math.sin(r) * l) / 2]; b = [mx + (Math.cos(r) * l) / 2, my + (Math.sin(r) * l) / 2]; }
      const h = heads.get(i) || {}; const A = attach(a), B = attach(b); const c = FF.make('conn', { a: A ? { id: A.id, port: 'auto' } : { x: a[0], y: a[1] }, b: B ? { id: B.id, port: 'auto' } : { x: b[0], y: b[1] }, kind: 'straight', ha: h.a ? 'arrow' : 'none', hb: h.b ? 'arrow' : 'none', s: { stroke: i.o.s.stroke, sw: zk.clamp(Math.round(i.o.s.sw), 2, 8), op: 1 } }); made.push(c); removed.push(i.o); }
    if (!made.length) { FF.tidySay('Nothing to neaten: draw closed shapes or straight lines'); return 0; }
    const t = FF.tx('Rough to Neat'); const origOp = new Map(); for (const o of removed) { t.touch(o); origOp.set(o.id, o.s.op == null ? 1 : o.s.op); } for (const o of made) { o._op = o.s.op == null ? 1 : o.s.op; o.s.op = 0; t.add(o); }
    FF.reflow(); const frozen = new Set(removed.map((o) => o.id).concat(made.map((o) => o.id))); R.freeze(frozen);
    FF.select(made); R.invalidate();
    zk.spring({ from: 0, to: 1, response: 0.42, damping: 1, eps: 0.002, onUpdate: (p) => { for (const o of made) { o.s.op = o._op * p; FF.touch(o); } for (const o of removed) { o.s.op = origOp.get(o.id) * (1 - p); } FF.rev++; R.invalidate(); }, onDone: () => { for (const o of made) { o.s.op = o._op; delete o._op; FF.touch(o); } for (const o of removed) FF.B.remove(o); t.b.forEach((v, id) => { }); for (const o of removed) { /* removal recorded: before state captured at touch */ } t.order && t.order(); R.unfreeze(); t.end(); FF.select(made); R.invalidate(); } });
    const skipped = strokes.length - removed.length + (removed.length - made.length >= 0 ? 0 : 0);
    FF.tidySay(`Neatened ${made.length} ${made.length === 1 ? 'object' : 'objects'}`); return made.length;
  };

  // ---------- floating bar UI ----------
  const wrap = document.getElementById('wrap');
  const bar = E('div.fl.zk-hidden', { id: 'tidybar', role: 'toolbar', 'aria-label': 'Tidy' });
  const tipEl = E('span.tidy-tip'); const chips = {};
  bar.append(E('span.tidy-name', zk.icon('sparkles'), 'Tidy'));
  const grp = E('.tidy-modes'); for (const m of FF.TIDY_MODES) { const b = E('button.tidy-chip', { type: 'button', 'data-mode': m.id, 'aria-label': 'Tidy as ' + m.label + '. ' + m.tip }, zk.icon(m.icon), E('span', m.label)); b.addEventListener('pointerenter', () => { if (armed && matchMedia('(hover: hover)').matches) FF.tidyPreview(m.id); }); b.addEventListener('pointerleave', () => { armed = true; FF.tidyUnpreview(); }); b.addEventListener('focus', () => { if (b.matches(':focus-visible')) FF.tidyPreview(m.id); }); b.addEventListener('blur', () => FF.tidyUnpreview()); b.addEventListener('click', () => FF.tidyCommit(m.id)); chips[m.id] = b; grp.append(b); }
  const rough = E('button.tidy-chip.rough', { type: 'button', 'aria-label': 'Rough to neat: turn wobbly hand-drawn boxes, lines and arrows into crisp shapes', onclick: () => FF.roughToNeat() }, zk.icon('wand-2'), E('span', 'Rough to neat'));
  bar.append(grp, E('.tidy-sep'), rough, tipEl); wrap.append(bar);
  let armed = true, sayT = 0; const say = (t) => { tipEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { tipEl.textContent = ''; }, 1800); };
  const hint = (mode) => { tipEl.textContent = mode ? FF.TIDY_MODES.find((m) => m.id === mode).tip : ''; };
  const refresh = () => { const n = FF.tidyTargets().length, hasStroke = FF.selObjs().some((o) => o.type === 'stroke'); if (P && !P.committing) FF.tidyCancel(); grp.classList.toggle('zk-hidden', n < 2); bar.querySelector('.tidy-name').classList.toggle('zk-hidden', n < 2); bar.querySelector('.tidy-sep').classList.toggle('zk-hidden', n < 2 || !hasStroke); rough.classList.toggle('zk-hidden', !hasStroke); bar.classList.toggle('zk-hidden', !(n >= 2 || hasStroke) || !!S.presenting); };
  FF.on('sel', refresh); FF.on('board', refresh); FF.on('tool', () => bar.classList.toggle('zk-hidden', S.tool !== 'select' || (FF.tidyTargets().length < 2 && !FF.selObjs().some((o) => o.type === 'stroke'))));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P && !P.committing) { FF.tidyCancel(); e.stopPropagation(); } }, true);
  FF.tidyBusy = () => !!P; FF.tidySay = (t) => { if (typeof say === 'function') say(t); };
  for (const n of ['undo', 'redo']) { const f = FF[n]; FF[n] = (...a) => { if (P && !P.committing) FF.tidyCancel(); return f(...a); }; }
})();
