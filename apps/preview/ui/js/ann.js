/* Annotation model, rendering (SVG/HTML overlay + canvas), hit testing and pointer tools.
   Geometry lives in "document space": PDF user space (points, y up) for PDFs, image pixels (y down) for images.
   A page view `pv` = { el, vp:{toV,toD,rot,scale,w,h}, desc:{anns:[]}, kind } supplies the transform. */
'use strict';
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); kids.forEach((c) => c && e.append(c)); return e; };
const TEXT_MARKUP = new Set(['highlight', 'underline', 'strike']);
const RECT_LIKE = new Set(['rect', 'ellipse', 'redact', 'erase', 'loupe']);
const ORIENTED = new Set(['text', 'sig']);
const FONTS = { sans: { css: '-apple-system, "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif', canvas: 'Helvetica, Arial, sans-serif' }, serif: { css: 'Georgia, "Times New Roman", Times, serif', canvas: 'Times New Roman, Times, serif' }, mono: { css: 'ui-monospace, Menlo, Consolas, "Courier New", monospace', canvas: 'Courier New, Courier, monospace' } };
const NOTE_PX = 22;

const Ann = (P.Ann = {});

// ---------- geometry ----------
const rot2 = (x, y, a) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; };
Ann.norm = (a) => { // axis-aligned bbox of two corner points in doc space
  const [p, q] = a.pts; return { x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) };
};
Ann.mapPoints = (a, f) => { // apply f([x,y])->[x,y] to all geometry in place
  if (a.pts) a.pts = a.pts.map(f); if (a.quads) a.quads = a.quads.map((q) => q.map(f)); if (a.strokes) a.strokes = a.strokes.map((s) => s.map(f)); return a;
};
Ann.translate = (a, dx, dy) => Ann.mapPoints(a, (p) => [p[0] + dx, p[1] + dy]);
Ann.geomOf = (a) => clone({ pts: a.pts, quads: a.quads, strokes: a.strokes, w: a.w, h: a.h });
Ann.setGeom = (a, g) => { for (const k of ['pts', 'quads', 'strokes', 'w', 'h']) { if (g[k] === undefined) delete a[k]; else a[k] = clone(g[k]); } };
// bbox of annotation in doc space
Ann.bbox = (a) => {
  const P_ = [];
  if (a.type === 'text' || a.type === 'sig') { const c = a.pts[0], r = (a.ang || 0) * Math.PI / 180, ca = Math.abs(Math.cos(r)), sa = Math.abs(Math.sin(r)); const hw = (a.w * ca + a.h * sa) / 2, hh = (a.w * sa + a.h * ca) / 2; return { x0: c[0] - hw, y0: c[1] - hh, x1: c[0] + hw, y1: c[1] + hh }; }
  if (a.quads) a.quads.forEach((q) => P_.push(...q)); if (a.strokes) a.strokes.forEach((s) => P_.push(...s));
  if (a.pts) P_.push(...a.pts);
  const xs = P_.map((p) => p[0]), ys = P_.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
Ann.make = (type, extra = {}) => ({ id: uid(), type, color: P.style.color, width: P.style.width, opacity: 1, date: new Date().toISOString(), author: P.author, ...extra });
// oriented box on screen: centre (view px), size (view px), screen angle (deg CW)
const boxView = (pv, a) => { const [cx, cy] = pv.vp.toV(...a.pts[0]); const s = pv.vp.scale; const q = (((a.ang || 0) + pv.vp.rot) % 360 + 360) % 360; return { cx, cy, w: a.w * s, h: a.h * s, ang: q }; };
const toLocal = (b, x, y) => { const [lx, ly] = rot2(x - b.cx, y - b.cy, -b.ang); return [lx, ly]; };
const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; const l2 = dx * dx + dy * dy; let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = clamp(t, 0, 1); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
const inPoly = (px, py, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };

// view-space rect of two corner points
const vrect = (pv, a) => { const [p, q] = a.pts.map((pt) => pv.vp.toV(...pt)); return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) }; };

Ann.hit = (pv, a, x, y, tol = 6) => {
  const T = pv.vp.toV;
  switch (a.type) {
    case 'highlight': case 'underline': case 'strike':
      return a.quads.some((q) => { const p = q.map((pt) => T(...pt)); return inPoly(x, y, [p[0], p[1], p[3], p[2]]) || (a.type !== 'highlight' && segDist(x, y, ...(a.type === 'underline' ? [...p[2], ...p[3]] : [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[1][0] + p[3][0]) / 2, (p[1][1] + p[3][1]) / 2])) < tol); });
    case 'rect': case 'redact': case 'erase': case 'loupe': { const r = vrect(pv, a); if (a.type === 'loupe') { const R = Math.min(r.w, r.h) / 2; return Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2)) <= R + tol; } const inside = x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol; if (!inside) return false; if (a.fill || a.type !== 'rect') return true; return !(x > r.x + tol && x < r.x + r.w - tol && y > r.y + tol && y < r.y + r.h - tol); }
    case 'ellipse': { const r = vrect(pv, a); const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + 1, ry = r.h / 2 + 1; const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (a.fill) return d <= 1 + tol / Math.min(rx, ry); return Math.abs(d - 1) <= tol / Math.min(rx, ry); }
    case 'line': case 'arrow': { const [p, q] = a.pts.map((pt) => T(...pt)); return segDist(x, y, p[0], p[1], q[0], q[1]) < tol + (a.width * pv.vp.scale) / 2; }
    case 'ink': { for (const s of a.strokes) { const v = s.map((pt) => T(...pt)); for (let i = 1; i < v.length; i++) if (segDist(x, y, v[i - 1][0], v[i - 1][1], v[i][0], v[i][1]) < tol + (a.width * pv.vp.scale) / 2) return true; if (v.length === 1 && Math.hypot(x - v[0][0], y - v[0][1]) < tol) return true; } return false; }
    case 'text': case 'sig': { const b = boxView(pv, a); const [lx, ly] = toLocal(b, x, y); return Math.abs(lx) <= b.w / 2 + tol && Math.abs(ly) <= b.h / 2 + tol; }
    case 'note': { const [nx, ny] = T(...a.pts[0]); return x >= nx - 2 && x <= nx + NOTE_PX + 2 && y >= ny - 2 && y <= ny + NOTE_PX + 2; }
  }
  return false;
};

// ---------- smoothing ----------
Ann.smoothPath = (pts) => { // quadratic through midpoints; returns SVG path d from [x,y] list
  if (!pts.length) return ''; if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}h.01`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += `Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`; }
  const l = pts[pts.length - 1]; return d + `L${l[0]} ${l[1]}`;
};
Ann.simplify = (pts, minD) => { const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= minD) out.push(pts[i]); } if (pts.length > 1) out.push(pts[pts.length - 1]); return out; };

// ---------- text layout (shared by canvas + PDF writers) ----------
Ann.wrap = (text, maxW, measure) => {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const tokens = para.match(/[⺀-鿿豈-￯]|\S+\s*|\s+/g) || [''];
    for (const tk of tokens) {
      const tryLine = line + tk;
      if (line && measure(tryLine.replace(/\s+$/, '')) > maxW) { lines.push(line.replace(/\s+$/, '')); line = tk.replace(/^\s+/, ''); } else line = tryLine;
      while (measure(line) > maxW && line.length > 1) { let k = line.length - 1; while (k > 1 && measure(line.slice(0, k)) > maxW) k--; lines.push(line.slice(0, k)); line = line.slice(k); }
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
};
Ann.LH = 1.2;

// ---------- DOM layers ----------
Ann.attach = (pv) => {
  pv.mk = sv('svg', { class: 'mk' }); pv.layer = el('.annlayer'); pv.gl = el('.gl');
  pv.layer.append(sv('svg', { class: 'av' }), el('.at'), el('.ah'));
  pv.el.append(pv.mk, pv.layer, pv.gl);
  pv.gl.addEventListener('pointerdown', (e) => Ann.glDown(pv, e));
  pv.el.addEventListener('pointerdown', (e) => Ann.pageDown(pv, e));
  pv.el.addEventListener('dblclick', (e) => { const a = Ann.topHit(pv, e); if (a && (a.type === 'text')) { Ann.select(a.id, pv); Ann.startEdit(pv, a); } else if (a && a.type === 'note') Ann.noteEditor(pv, a); });
};
Ann.size = (pv) => { const { w, h } = pv.vp; for (const s of [pv.mk, pv.layer.firstChild]) { s.setAttribute('width', w); s.setAttribute('height', h); s.setAttribute('viewBox', `0 0 ${w} ${h}`); } };
const localPt = (pv, e) => { const r = pv.el.getBoundingClientRect(); const k = r.width / pv.vp.w || 1; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
Ann.topHit = (pv, e) => { const [x, y] = localPt(pv, e); const as = pv.desc.anns; for (let i = as.length - 1; i >= 0; i--) if (Ann.hit(pv, as[i], x, y)) return as[i]; return null; };

const arrowHead = (p, q, w) => { const a = Math.atan2(q[1] - p[1], q[0] - p[0]); const L = Math.max(9, w * 4.2), sp = 0.46; return [[q[0], q[1]], [q[0] - L * Math.cos(a - sp), q[1] - L * Math.sin(a - sp)], [q[0] - L * Math.cos(a + sp), q[1] - L * Math.sin(a + sp)]]; };
Ann.arrowHeadDoc = (p, q, w) => { const a = Math.atan2(q[1] - p[1], q[0] - p[0]); const L = Math.max(9, w * 4.2), sp = 0.46; return [[q[0], q[1]], [q[0] - L * Math.cos(a - sp), q[1] - L * Math.sin(a - sp)], [q[0] - L * Math.cos(a + sp), q[1] - L * Math.sin(a + sp)]]; };

Ann.redraw = (pv) => {
  if (!pv.layer || !pv.vp) return;
  Ann.size(pv);
  const T = pv.vp.toV, s = pv.vp.scale, svg = pv.layer.firstChild, at = pv.layer.children[1], ah = pv.layer.children[2];
  svg.replaceChildren(); at.replaceChildren(); ah.replaceChildren(); pv.mk.replaceChildren();
  for (const a of pv.desc.anns) {
    const op = a.opacity ?? 1; const sel = a.id === P.selId;
    let node = null;
    switch (a.type) {
      case 'highlight': a.quads.forEach((q) => { const p = q.map((pt) => T(...pt)); pv.mk.append(sv('polygon', { points: [p[0], p[1], p[3], p[2]].map((v) => v.join(',')).join(' '), fill: a.color, 'fill-opacity': op * 0.55, 'data-id': a.id })); }); break;
      case 'underline': case 'strike': a.quads.forEach((q) => { const p = q.map((pt) => T(...pt)); const h = Math.hypot(p[0][0] - p[2][0], p[0][1] - p[2][1]); const w = Math.max(1, h * 0.07); let l; if (a.type === 'underline') l = [p[2][0], p[2][1] - w, p[3][0], p[3][1] - w]; else l = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[1][0] + p[3][0]) / 2, (p[1][1] + p[3][1]) / 2]; pv.mk.append(sv('line', { x1: l[0], y1: l[1], x2: l[2], y2: l[3], stroke: a.color, 'stroke-width': w * 1.3, 'stroke-opacity': op })); }); break;
      case 'rect': case 'redact': case 'erase': { const r = vrect(pv, a); const fill = a.type === 'redact' ? 'rgba(0,0,0,.62)' : a.type === 'erase' ? '#fff' : a.fill || 'none'; node = sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill, 'fill-opacity': a.type === 'rect' && a.fill ? (a.fillOpacity ?? 0.35) : 1, stroke: a.type === 'redact' ? '#ff3b30' : a.type === 'erase' ? 'none' : a.color, 'stroke-width': a.type === 'rect' ? a.width * s : a.type === 'redact' ? 1.5 : 0, 'stroke-dasharray': a.type === 'redact' ? '5 3' : a.dash ? `${a.width * s * 3} ${a.width * s * 2}` : null, opacity: a.type === 'rect' ? op : 1, 'stroke-linejoin': 'round' }); break; }
      case 'ellipse': { const r = vrect(pv, a); node = sv('ellipse', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2, fill: a.fill || 'none', 'fill-opacity': a.fill ? (a.fillOpacity ?? 0.35) : 1, stroke: a.color, 'stroke-width': a.width * s, opacity: op, 'stroke-dasharray': a.dash ? `${a.width * s * 3} ${a.width * s * 2}` : null }); break; }
      case 'line': case 'arrow': { const [p, q] = a.pts.map((pt) => T(...pt)); const g = sv('g', { opacity: op }); const w = a.width * s; let q2 = q; if (a.type === 'arrow') { const hd = arrowHead(p, q, w); q2 = [(hd[1][0] + hd[2][0]) / 2, (hd[1][1] + hd[2][1]) / 2]; g.append(sv('polygon', { points: hd.map((v) => v.join(',')).join(' '), fill: a.color, stroke: a.color, 'stroke-width': w * 0.6, 'stroke-linejoin': 'round' })); } g.append(sv('line', { x1: p[0], y1: p[1], x2: q2[0], y2: q2[1], stroke: a.color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': a.dash ? `${w * 3} ${w * 2}` : null })); node = g; break; }
      case 'ink': node = sv('path', { d: a.strokes.map((st) => Ann.smoothPath(st.map((pt) => T(...pt)))).join(''), fill: 'none', stroke: a.color, 'stroke-width': a.width * s, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op }); break;
      case 'note': { const [nx, ny] = T(...a.pts[0]); const d = el('.note' + (a.id === P.selId ? '.sel' : ''), { style: { left: nx + 'px', top: ny + 'px', background: a.color }, title: a.text || '' }, zk.icon('message-square', 13)); d.dataset.id = a.id; at.append(d); break; }
      case 'text': case 'sig': case 'loupe': { const d = Ann.htmlFor(pv, a); d && at.append(d); break; }
    }
    if (node) { node.dataset.id = a.id; svg.append(node); }
  }
  if (pv.draft) { const d = pv.draft; svg.append(d); }
  const sa = pv.desc.anns.find((a) => a.id === P.selId); if (sa) Ann.handles(pv, sa, ah);
};
Ann.htmlFor = (pv, a) => {
  const s = pv.vp.scale;
  if (a.type === 'loupe') { const r = vrect(pv, a); const D = Math.min(r.w, r.h); const c = el('canvas.loupe', { width: Math.max(2, Math.round(D)), height: Math.max(2, Math.round(D)), style: { left: r.x + (r.w - D) / 2 + 'px', top: r.y + (r.h - D) / 2 + 'px', width: D + 'px', height: D + 'px', borderColor: a.color } }); c.dataset.id = a.id; c._loupe = { a, pv, D }; requestAnimationFrame(() => Ann.paintLoupe(c)); return c; }
  const b = boxView(pv, a);
  const d = el('.tb' + (a.type === 'sig' ? '.sig' : ''), { style: { left: b.cx - b.w / 2 + 'px', top: b.cy - b.h / 2 + 'px', width: b.w + 'px', height: b.h + 'px', transform: `rotate(${b.ang}deg)` } });
  d.dataset.id = a.id;
  if (a.type === 'sig') { d.append(el('img', { src: a.img, draggable: false })); return d; }
  const inner = el('.tbi', { style: { fontSize: a.size * s + 'px', color: a.textColor || '#1d1d1f', fontFamily: FONTS[a.font || 'sans'].css, textAlign: a.align || 'left', lineHeight: Ann.LH, background: a.fill || 'transparent', outline: a.width ? `${Math.max(1, a.width * s)}px solid ${a.color}` : 'none', outlineOffset: '-' + (a.width ? Math.max(1, a.width * s) : 0) + 'px', padding: Math.max(2, 3 * s) + 'px' } });
  inner.textContent = a.text || ''; d.append(inner); return d;
};
Ann.paintLoupe = (c) => { const { a, pv, D } = c._loupe; const src = pv.srcCanvas && pv.srcCanvas(); if (!src) return; const ctx = c.getContext('2d'); const z = a.zoom || 2; const [cx, cy] = [(a.pts[0][0] + a.pts[1][0]) / 2, (a.pts[0][1] + a.pts[1][1]) / 2]; const rd = (Math.min(Math.abs(a.pts[0][0] - a.pts[1][0]), Math.abs(a.pts[0][1] - a.pts[1][1]))); const sw = rd / z; ctx.save(); ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, c.width / 2, 0, 7); ctx.clip(); ctx.drawImage(src.canvas, cx - sw / 2 + src.dx, cy - sw / 2 + src.dy, sw, sw, 0, 0, c.width, c.height); ctx.restore(); };

// ---------- selection handles ----------
Ann.handles = (pv, a, root) => {
  const mk = (x, y, cls, onDown, cur) => { const h = el('.hd' + (cls ? '.' + cls : ''), { style: { left: x + 'px', top: y + 'px', cursor: cur || 'pointer' } }); h.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); onDown(e); }); root.append(h); return h; };
  const T = pv.vp.toV;
  if (RECT_LIKE.has(a.type)) {
    const r = vrect(pv, a); root.append(el('.selbox', { style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } }));
    const pos = [[0, 0, 'nwse-resize'], [0.5, 0, 'ns-resize'], [1, 0, 'nesw-resize'], [1, 0.5, 'ew-resize'], [1, 1, 'nwse-resize'], [0.5, 1, 'ns-resize'], [0, 1, 'nesw-resize'], [0, 0.5, 'ew-resize']];
    pos.forEach(([fx, fy, cur]) => mk(r.x + r.w * fx, r.y + r.h * fy, '', (e) => Ann.dragResizeRect(pv, a, fx, fy, e), cur));
  } else if (ORIENTED.has(a.type)) {
    const b = boxView(pv, a); root.append(el('.selbox', { style: { left: b.cx - b.w / 2 + 'px', top: b.cy - b.h / 2 + 'px', width: b.w + 'px', height: b.h + 'px', transform: `rotate(${b.ang}deg)` } }));
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [rx, ry] = rot2(sx * b.w / 2, sy * b.h / 2, b.ang); mk(b.cx + rx, b.cy + ry, '', (e) => Ann.dragResizeBox(pv, a, sx, sy, e), 'nwse-resize'); }
    if (a.type === 'text') { const [rx, ry] = rot2(b.w / 2, 0, b.ang); mk(b.cx + rx, b.cy + ry, 'sq', (e) => Ann.dragResizeBox(pv, a, 1, 0, e), 'ew-resize'); }
  } else if (a.type === 'line' || a.type === 'arrow') {
    a.pts.forEach((pt, i) => { const [x, y] = T(...pt); mk(x, y, '', (e) => Ann.dragPoint(pv, a, i, e), 'crosshair'); });
  } else {
    const bb = Ann.bbox(a); const c = [T(bb.x0, bb.y0), T(bb.x1, bb.y1)]; const x = Math.min(c[0][0], c[1][0]) - 3, y = Math.min(c[0][1], c[1][1]) - 3;
    root.append(el('.selbox.soft', { style: { left: x + 'px', top: y + 'px', width: Math.abs(c[0][0] - c[1][0]) + 6 + 'px', height: Math.abs(c[0][1] - c[1][1]) + 6 + 'px' } }));
  }
};
const dragLoop = (pv, e, move, done) => { // generic captured drag on window
  const id = e.pointerId; const mv = (ev) => { if (ev.pointerId === id) move(ev); }; const up = (ev) => { if (ev.pointerId !== id) return; removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); done && done(ev); };
  addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
};
Ann.changed = (pv, push = true) => { Ann.redraw(pv); if (push) { P.pushHistory(); } P.onAnnChange && P.onAnnChange(pv); };
Ann.dragResizeRect = (pv, a, fx, fy, e) => {
  const r0 = vrect(pv, a); const g0 = Ann.geomOf(a); let moved = false;
  dragLoop(pv, e, (ev) => {
    const [x, y] = localPt(pv, ev); let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
    if (fx === 0) x0 = x; if (fx === 1) x1 = x; if (fy === 0) y0 = y; if (fy === 1) y1 = y;
    if (a.type === 'loupe' || (ev.shiftKey && fx !== 0.5 && fy !== 0.5)) { const sz = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); if (fx === 0) x0 = x1 - Math.sign(x1 - x0 || 1) * sz; else if (fx === 1) x1 = x0 + Math.sign(x1 - x0 || 1) * sz; if (fy === 0) y0 = y1 - Math.sign(y1 - y0 || 1) * sz; else if (fy === 1) y1 = y0 + Math.sign(y1 - y0 || 1) * sz; }
    a.pts = [pv.vp.toD(x0, y0), pv.vp.toD(x1, y1)]; moved = true; Ann.redraw(pv);
  }, () => { if (moved) Ann.changed(pv); });
};
Ann.dragResizeBox = (pv, a, sx, sy, e) => {
  const b0 = boxView(pv, a); const s = pv.vp.scale; const aspect = a.w / a.h; const g0 = Ann.geomOf(a); let moved = false;
  // fixed (opposite) corner in view space
  const [fxr, fyr] = rot2(-sx * b0.w / 2 * (sx ? 1 : 1), -sy * b0.h / 2, b0.ang); const fixed = [b0.cx + fxr, b0.cy + (sy ? fyr : 0)];
  const fixedLocalX = -sx * b0.w / 2;
  dragLoop(pv, e, (ev) => {
    const [x, y] = localPt(pv, ev); const [lx, ly] = rot2(x - b0.cx, y - b0.cy, -b0.ang);
    let nw = sx ? Math.max(14, sx * (lx - fixedLocalX)) : b0.w, nh = sy ? Math.max(10, sy * (ly + sy * b0.h / 2)) : b0.h;
    if (a.type === 'sig') { nh = nw / aspect; }
    // new centre: fixed corner + half extents in local frame
    const lcx = fixedLocalX + (sx ? sx * nw / 2 : b0.w / 2 * 0), lcy = sy ? -sy * b0.h / 2 + sy * nh / 2 : 0;
    const [cx, cy] = rot2(lcx, lcy, b0.ang); a.pts = [pv.vp.toD(b0.cx + cx, b0.cy + cy)]; a.w = nw / s; a.h = nh / s; moved = true; Ann.redraw(pv);
  }, () => { if (moved) { if (a.type === 'text') Ann.fitText(pv, a); Ann.changed(pv); } });
};
Ann.dragPoint = (pv, a, i, e) => { let moved = false; dragLoop(pv, e, (ev) => { let [x, y] = localPt(pv, ev); if (ev.shiftKey) { const o = pv.vp.toV(...a.pts[1 - i]); const dx = x - o[0], dy = y - o[1]; const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy); x = o[0] + d * Math.cos(ang); y = o[1] + d * Math.sin(ang); } a.pts[i] = pv.vp.toD(x, y); moved = true; Ann.redraw(pv); }, () => moved && Ann.changed(pv)); };

// ---------- selection ----------
Ann.select = (id, pv) => {
  const prev = P.selPage; P.selId = id; P.selPage = id ? pv : null;
  if (prev && prev !== pv) Ann.redraw(prev); if (pv) Ann.redraw(pv); else if (prev) Ann.redraw(prev);
  P.onSelect && P.onSelect(id ? pv.desc.anns.find((a) => a.id === id) : null, pv);
};
Ann.selected = () => (P.selPage && P.selId ? P.selPage.desc.anns.find((a) => a.id === P.selId) : null);
Ann.remove = (pv, id) => { const i = pv.desc.anns.findIndex((a) => a.id === id); if (i < 0) return; pv.desc.anns.splice(i, 1); if (P.selId === id) { P.selId = null; P.selPage = null; P.onSelect && P.onSelect(null); } Ann.changed(pv); };
Ann.deleteSelected = () => { if (P.selPage && P.selId) Ann.remove(P.selPage, P.selId); };
Ann.pageDown = (pv, e) => {
  if (e.button !== 0 || P.tool !== 'select' && !TEXT_MARKUP.has(P.tool)) return;
  if (e.target.closest && e.target.closest('.hd,.annotationLayer section,.noteedit,input,textarea,[contenteditable]')) return;
  const [x, y] = localPt(pv, e); const as = pv.desc.anns; let hit = null;
  for (let i = as.length - 1; i >= 0; i--) if (Ann.hit(pv, as[i], x, y)) { hit = as[i]; break; }
  if (P.tool !== 'select') return; // text-markup tools leave the text layer alone
  if (!hit) { if (P.selId) Ann.select(null); return; }
  if (P.selId !== hit.id) Ann.select(hit.id, pv); else if (P.selPage !== pv) Ann.select(hit.id, pv);
  if (TEXT_MARKUP.has(hit.type)) return;
  e.preventDefault(); getSelection().removeAllRanges();
  const start = [x, y], d0 = pv.vp.toD(x, y), g0 = Ann.geomOf(hit); let moved = false;
  if (hit.type === 'note') Ann.noteEditor(pv, hit);
  dragLoop(pv, e, (ev) => { const [cx, cy] = localPt(pv, ev); if (!moved && Math.hypot(cx - start[0], cy - start[1]) < 3) return; moved = true; const d1 = pv.vp.toD(cx, cy); Ann.setGeom(hit, g0); Ann.translate(hit, d1[0] - d0[0], d1[1] - d0[1]); Ann.redraw(pv); }, () => { if (moved) Ann.changed(pv); });
};

// ---------- creation tools (gesture layer) ----------
Ann.setTool = (t) => {
  if (P.tool === t && t !== 'select') t = 'select';
  P.tool = t; document.body.dataset.tool = t;
  const capture = !(t === 'select' || TEXT_MARKUP.has(t));
  document.querySelectorAll('.gl').forEach((g) => g.classList.toggle('on', capture));
  if (t !== 'select' && P.selId && !['select'].includes(t)) Ann.select(null);
  P.onTool && P.onTool(t);
};
const defaultSizes = { text: [180, 48], sig: [150, 60], note: [0, 0] };
Ann.glDown = (pv, e) => {
  if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); const t = P.tool; const st = P.style;
  const [x, y] = localPt(pv, e); const D = (px, py) => pv.vp.toD(px, py); const vr = pv.vp.rot;
  document.querySelectorAll('.noteedit').forEach((n) => n.remove());
  if (t === 'note') { const a = Ann.make('note', { color: '#ffd23f', pts: [D(x, y)], text: '' }); pv.desc.anns.push(a); Ann.select(a.id, pv); Ann.changed(pv); Ann.setTool('select'); Ann.noteEditor(pv, a); return; }
  if (t === 'ink') {
    const raw = [[x, y]]; let sm = [x, y]; const a = Ann.make('ink', { color: st.stroke, width: st.width, strokes: [[D(x, y)]], opacity: st.opacity }); pv.desc.anns.push(a);
    dragLoop(pv, e, (ev) => { const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; for (const ce of (evs.length ? evs : [ev])) { const [px, py] = localPt(pv, ce); sm = [sm[0] + (px - sm[0]) * 0.55, sm[1] + (py - sm[1]) * 0.55]; const l = raw[raw.length - 1]; if (Math.hypot(sm[0] - l[0], sm[1] - l[1]) >= 1.2) raw.push([sm[0], sm[1]]); } a.strokes = [raw.map((p) => D(...p))]; Ann.redraw(pv); },
      () => { raw.push([sm[0], sm[1]]); const s = Ann.simplify(raw, 1.5); a.strokes = [s.map((p) => D(...p))]; Ann.select(a.id, pv); Ann.changed(pv); });
    return;
  }
  // drag-to-define tools
  const shift = (ev) => ev.shiftKey; const start = [x, y]; let cur = [x, y]; let a = null;
  const build = (ev) => {
    const [px, py] = localPt(pv, ev); cur = [px, py]; let [qx, qy] = cur;
    if ((t === 'line' || t === 'arrow') && shift(ev)) { const dx = qx - start[0], dy = qy - start[1]; const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy); qx = start[0] + d * Math.cos(ang); qy = start[1] + d * Math.sin(ang); }
    else if (['rect', 'ellipse', 'loupe'].includes(t) && (shift(ev) || t === 'loupe')) { const sz = Math.max(Math.abs(qx - start[0]), Math.abs(qy - start[1])); qx = start[0] + Math.sign(qx - start[0] || 1) * sz; qy = start[1] + Math.sign(qy - start[1] || 1) * sz; }
    const p0 = D(...start), p1 = D(qx, qy);
    if (!a) { const props = { rect: { color: st.stroke, width: st.width, fill: st.fill, opacity: st.opacity, dash: st.dash }, ellipse: { color: st.stroke, width: st.width, fill: st.fill, opacity: st.opacity, dash: st.dash }, line: { color: st.stroke, width: st.width, opacity: st.opacity, dash: st.dash }, arrow: { color: st.stroke, width: st.width, opacity: st.opacity, dash: st.dash }, redact: { color: '#000000' }, erase: { color: '#ffffff' }, loupe: { color: '#ffffff', zoom: 2.2, width: 3 }, text: {}, sig: {} }[t] || {}; a = Ann.make(t, props); pv.desc.anns.push(a); }
    if (t === 'text' || t === 'sig') return; // sized on release
    a.pts = [p0, p1];
  };
  let dragged = false;
  dragLoop(pv, e, (ev) => { if (!dragged && Math.hypot(...[localPt(pv, ev)[0] - start[0], localPt(pv, ev)[1] - start[1]]) < 4) return; dragged = true; if (t === 'text' || t === 'sig') { pv.draft = sv('rect', { x: Math.min(start[0], localPt(pv, ev)[0]), y: Math.min(start[1], localPt(pv, ev)[1]), width: Math.abs(localPt(pv, ev)[0] - start[0]), height: Math.abs(localPt(pv, ev)[1] - start[1]), fill: 'rgba(var(--accent-rgb),.12)', stroke: 'var(--accent)', 'stroke-dasharray': '4 3' }); Ann.redraw(pv); cur = localPt(pv, ev); return; } build(ev); Ann.redraw(pv); },
    async (ev) => {
      pv.draft = null;
      if (t === 'text' || t === 'sig') {
        const sc = pv.vp.scale; let w, h, cx, cy;
        if (dragged && Math.abs(cur[0] - start[0]) > 12 && Math.abs(cur[1] - start[1]) > 8) { w = Math.abs(cur[0] - start[0]) / sc; h = Math.abs(cur[1] - start[1]) / sc; cx = (cur[0] + start[0]) / 2; cy = (cur[1] + start[1]) / 2; }
        else { [w, h] = defaultSizes[t]; w = w; cx = start[0] + (w * sc) / 2; cy = start[1] + (h * sc) / 2; if (t === 'text') h = st.size * 2.2; }
        const ang = ((-vr % 360) + 360) % 360;
        if (t === 'text') { const a2 = Ann.make('text', { color: st.stroke, pts: [D(cx, cy)], w, h, ang, text: '', size: st.size, font: st.font, textColor: st.textColor, width: 0, fill: null, align: 'left' }); pv.desc.anns.push(a2); Ann.select(a2.id, pv); Ann.redraw(pv); Ann.setTool('select'); Ann.startEdit(pv, a2, true); return; }
        const sg = await Ann.pickSignature(); if (!sg) { Ann.redraw(pv); return; }
        const asp = sg.w / sg.h; if (!dragged) { w = 150; h = w / asp; cx = start[0] + (w * sc) / 2; cy = start[1] + (h * sc) / 2; } else { if (w / h > asp) w = h * asp; else h = w / asp; }
        const a2 = Ann.make('sig', { pts: [D(cx, cy)], w, h, ang, img: sg.data, color: '#000000' }); pv.desc.anns.push(a2); Ann.select(a2.id, pv); Ann.changed(pv); Ann.setTool('select'); return;
      }
      if (!a) { Ann.redraw(pv); return; }
      const bb = Ann.bbox(a); const small = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) * pv.vp.scale < 5;
      if (small) { pv.desc.anns.splice(pv.desc.anns.indexOf(a), 1); Ann.redraw(pv); return; }
      Ann.select(a.id, pv); Ann.changed(pv); if (t === 'redact' || t === 'erase') {} 
    });
};

// ---------- text editing ----------
Ann.fitText = (pv, a) => {
  const probe = el('div', { style: { position: 'absolute', visibility: 'hidden', left: '-9999px', width: a.w * 4 + 'px', fontSize: a.size * 4 + 'px', fontFamily: FONTS[a.font || 'sans'].css, lineHeight: Ann.LH, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 3 * 4 + 'px', boxSizing: 'border-box' } }); probe.textContent = a.text || ' '; document.body.append(probe); const h = probe.scrollHeight / 4; probe.remove();
  if (h > a.h) { const dh = h - a.h; a.h = h; /* grow downward in box frame */ const [rx, ry] = rot2(0, dh / 2, a.ang || 0); a.pts[0] = [a.pts[0][0] + rx, a.pts[0][1] + ry]; }
};
Ann.startEdit = (pv, a, isNew) => {
  const node = pv.layer.querySelector(`.tb[data-id="${a.id}"] .tbi`); if (!node) return; node.contentEditable = 'plaintext-only'; node.classList.add('editing'); node.style.userSelect = 'text'; node.style.webkitUserSelect = 'text'; node.focus();
  const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  const finish = (cancel) => { node.removeEventListener('blur', onBlur); const t = node.innerText.replace(/\n$/, ''); node.contentEditable = 'false'; node.classList.remove('editing'); getSelection().removeAllRanges();
    if (!t.trim() || (cancel && isNew)) { pv.desc.anns.splice(pv.desc.anns.indexOf(a), 1); if (P.selId === a.id) { P.selId = null; P.selPage = null; P.onSelect && P.onSelect(null); } Ann.redraw(pv); return; }
    if (t !== a.text) { a.text = t; Ann.fitText(pv, a); Ann.changed(pv); } else Ann.redraw(pv); };
  const onBlur = () => finish(false);
  node.addEventListener('blur', onBlur); node.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); node.removeEventListener('blur', onBlur); finish(true); } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { node.blur(); } });
};
Ann.noteEditor = (pv, a) => {
  document.querySelectorAll('.noteedit').forEach((n) => n.remove());
  const [nx, ny] = pv.vp.toV(...a.pts[0]); const ta = el('textarea.zk-textarea.selectable', { rows: 4, placeholder: 'Comment', value: a.text || '', style: { width: '200px' } });
  const box = el('.noteedit', { style: { left: nx + NOTE_PX + 6 + 'px', top: ny + 'px' } }, el('.zk-row', { style: { gap: '4px', marginBottom: '6px' } }, ...['#ffd23f', '#ff8a3d', '#7bd88f', '#4d8dff', '#f15bb5'].map((c) => el('button.zk-swatch' + (a.color === c ? '.sel' : ''), { style: { background: c, width: '16px', height: '16px' }, onclick: () => { a.color = c; Ann.redraw(pv); Ann.noteEditor(pv, a); P.pushHistory(); } })), el('.zk-spacer'), zk.btn({ icon: 'trash-2', title: 'Delete note', onClick: () => { box.remove(); Ann.remove(pv, a.id); } })), ta);
  pv.el.append(box); ta.focus();
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  const commit = () => { if (ta.value !== (a.text || '')) { a.text = ta.value; Ann.redraw(pv); P.pushHistory(); P.onAnnChange && P.onAnnChange(pv); } };
  ta.addEventListener('input', () => { a.text = ta.value; }); ta.addEventListener('blur', () => { setTimeout(() => { if (!box.contains(document.activeElement)) { commit(); box.remove(); } }, 0); });
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { ta.blur(); } });
};

// ---------- text markup from selection ----------
Ann.markupSelection = (type, pvs) => {
  const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0); const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 2); if (!rects.length) return false;
  const text = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 300); let made = 0;
  for (const pv of pvs) {
    const pr = pv.el.getBoundingClientRect(); const k = pr.width / pv.vp.w || 1;
    let mine = rects.filter((r) => { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom; });
    if (!mine.length) continue;
    // merge rects on the same line
    mine.sort((a, b) => a.top - b.top || a.left - b.left); const lines = [];
    for (const r of mine) { const L = lines.find((l) => Math.abs((l.t + l.b) / 2 - (r.top + r.bottom) / 2) < Math.min(l.b - l.t, r.height) * 0.6 && r.left <= l.r + 4 && r.right >= l.l - 4); if (L) { L.l = Math.min(L.l, r.left); L.r = Math.max(L.r, r.right); L.t = Math.min(L.t, r.top); L.b = Math.max(L.b, r.bottom); } else lines.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); }
    const quads = lines.map((l) => { const x0 = (l.l - pr.left) / k, x1 = (l.r - pr.left) / k, y0 = (l.t - pr.top) / k, y1 = (l.b - pr.top) / k; return [pv.vp.toD(x0, y0), pv.vp.toD(x1, y0), pv.vp.toD(x0, y1), pv.vp.toD(x1, y1)]; });
    const a = Ann.make(type, { quads, text, color: type === 'highlight' ? P.style.color : P.style.stroke === '#ff6b6b' && type !== 'highlight' ? '#ff6b6b' : P.style.stroke });
    if (type !== 'highlight') a.color = P.style.markColor || '#ff6b6b';
    pv.desc.anns.push(a); Ann.redraw(pv); made++;
  }
  if (made) { sel.removeAllRanges(); P.pushHistory(); P.onAnnChange && P.onAnnChange(); }
  return made > 0;
};

// ---------- canvas painter (image export, page raster, print) ----------
const imgCache = new Map();
P.loadImg = (src) => { if (imgCache.has(src)) return imgCache.get(src); const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); imgCache.set(src, p); if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value); return p; };
Ann.preload = async (anns) => { for (const a of anns) if (a.type === 'sig') await P.loadImg(a.img); };
// f: doc->canvas point; s: doc->canvas scale; rot: viewport rotation (deg) added to text angle
Ann.paint = (ctx, a, f, s, rot = 0, srcCanvas) => {
  ctx.save(); ctx.globalAlpha = a.opacity ?? 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const poly = (p, close) => { ctx.beginPath(); p.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); close && ctx.closePath(); };
  switch (a.type) {
    case 'highlight': ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = a.color; ctx.globalAlpha = (a.opacity ?? 1) * 0.55; a.quads.forEach((q) => { const p = q.map((pt) => f(...pt)); poly([p[0], p[1], p[3], p[2]], true); ctx.fill(); }); break;
    case 'underline': case 'strike': ctx.strokeStyle = a.color; a.quads.forEach((q) => { const p = q.map((pt) => f(...pt)); const h = Math.hypot(p[0][0] - p[2][0], p[0][1] - p[2][1]); ctx.lineWidth = Math.max(1, h * 0.09); if (a.type === 'underline') poly([[p[2][0], p[2][1] - h * 0.07], [p[3][0], p[3][1] - h * 0.07]]); else poly([[(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2], [(p[1][0] + p[3][0]) / 2, (p[1][1] + p[3][1]) / 2]]); ctx.stroke(); }); break;
    case 'rect': case 'redact': case 'erase': case 'ellipse': {
      const [p, q] = a.pts.map((pt) => f(...pt)); const x = Math.min(p[0], q[0]), y = Math.min(p[1], q[1]), w = Math.abs(p[0] - q[0]), h = Math.abs(p[1] - q[1]);
      ctx.beginPath(); if (a.type === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); else ctx.rect(x, y, w, h);
      if (a.type === 'redact') { ctx.fillStyle = '#000'; ctx.fill(); } else if (a.type === 'erase') { ctx.fillStyle = '#fff'; ctx.fill(); }
      else { if (a.fill) { ctx.globalAlpha = (a.opacity ?? 1) * (a.fillOpacity ?? 0.35); ctx.fillStyle = a.fill; ctx.fill(); ctx.globalAlpha = a.opacity ?? 1; } ctx.strokeStyle = a.color; ctx.lineWidth = a.width * s; if (a.dash) ctx.setLineDash([a.width * s * 3, a.width * s * 2]); ctx.stroke(); }
      break; }
    case 'line': case 'arrow': { const [p, q] = a.pts.map((pt) => f(...pt)); const w = a.width * s; ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = w; let e = q; if (a.type === 'arrow') { const hd = arrowHead(p, q, w); e = [(hd[1][0] + hd[2][0]) / 2, (hd[1][1] + hd[2][1]) / 2]; poly(hd, true); ctx.fill(); } if (a.dash) ctx.setLineDash([w * 3, w * 2]); poly([p, e]); ctx.stroke(); break; }
    case 'ink': ctx.strokeStyle = a.color; ctx.lineWidth = a.width * s; a.strokes.forEach((st) => { const v = st.map((pt) => f(...pt)); const d = new Path2D(Ann.smoothPath(v)); ctx.stroke(d); }); break;
    case 'note': { const [x, y] = f(...a.pts[0]); const n = NOTE_PX * Math.max(1, s * 0.75); ctx.fillStyle = a.color; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, n, n, n * 0.18); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = Math.max(1, n * 0.07); for (const k of [0.3, 0.5, 0.7]) poly([[x + n * 0.22, y + n * k], [x + n * 0.78, y + n * k]]), ctx.stroke(); break; }
    case 'text': case 'sig': {
      const [cx, cy] = f(...a.pts[0]); const ang = (((a.ang || 0) + rot) % 360) * Math.PI / 180; ctx.translate(cx, cy); ctx.rotate(ang); const w = a.w * s, h = a.h * s;
      if (a.type === 'sig') { const im = imgCache.get(a.img); im && im.then; if (a._el) ctx.drawImage(a._el, -w / 2, -h / 2, w, h); break; }
      if (a.fill) { ctx.fillStyle = a.fill; ctx.fillRect(-w / 2, -h / 2, w, h); } if (a.width) { ctx.strokeStyle = a.color; ctx.lineWidth = a.width * s; ctx.strokeRect(-w / 2, -h / 2, w, h); }
      const fs = a.size * s, pad = Math.max(2, 3 * s); ctx.font = `${fs}px ${FONTS[a.font || 'sans'].canvas}`; ctx.fillStyle = a.textColor || '#1d1d1f'; ctx.textBaseline = 'top';
      const lines = Ann.wrap(a.text || '', w - pad * 2, (t) => ctx.measureText(t).width); lines.forEach((ln, i) => { let x = -w / 2 + pad; const lw = ctx.measureText(ln).width; if (a.align === 'center') x = -lw / 2; else if (a.align === 'right') x = w / 2 - pad - lw; ctx.fillText(ln, x, -h / 2 + pad + i * fs * Ann.LH + (fs * Ann.LH - fs) / 2); }); break; }
    case 'loupe': { const [p, q] = a.pts.map((pt) => f(...pt)); const D = Math.min(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])); const cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2; const z = a.zoom || 2; if (srcCanvas) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, 7); ctx.clip(); const sw = D / z; ctx.drawImage(srcCanvas, cx - sw / 2, cy - sw / 2, sw, sw, cx - D / 2, cy - D / 2, D, D); ctx.restore(); } ctx.strokeStyle = a.color; ctx.lineWidth = (a.width || 3) * s; ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 6 * s; ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, 7); ctx.stroke(); break; }
  }
  ctx.restore();
};
Ann.paintAll = async (ctx, anns, f, s, rot = 0, srcCanvas) => { for (const a of anns) if (a.type === 'sig') a._el = await P.loadImg(a.img); for (const a of anns) Ann.paint(ctx, a, f, s, rot, srcCanvas); };

// ---------- signatures ----------
P.sigs = [];
Ann.loadSigs = async () => { P.sigs = (await zeng.store.get('signatures', [])) || []; };
Ann.pickSignature = async () => {
  await Ann.loadSigs(); if (!P.sigs.length) return await Ann.createSignature();
  const list = el('.sigs'); let chosen = P.sigs[0];
  const draw = () => { list.replaceChildren(...P.sigs.map((s) => el('.sigitem' + (s === chosen ? '.sel' : ''), { onclick: () => { chosen = s; draw(); }, ondblclick: () => list.closest('.zk-sheet').querySelector('.primary').click() }, el('img', { src: s.data }), zk.btn({ icon: 'x', title: 'Remove signature', onClick: async (e) => { e.stopPropagation(); P.sigs = P.sigs.filter((x) => x.id !== s.id); if (chosen === s) chosen = P.sigs[0]; await zeng.store.set('signatures', P.sigs); draw(); } })))); };
  draw();
  const r = await zk.sheet({ title: 'Place Signature', body: list, width: 460, buttons: [{ label: 'Cancel', value: 'x' }, { label: 'Create New…', value: 'new' }, { label: 'Place', primary: true, value: 'use' }] });
  if (r === 'use' && chosen) return chosen; if (r === 'new') return await Ann.createSignature(); return null;
};
Ann.createSignature = async () => {
  const W = 520, H = 190, cv = el('canvas.sigpad', { width: W * 2, height: H * 2, style: { width: W + 'px', height: H + 'px' } }); const ctx = cv.getContext('2d'); ctx.scale(2, 2);
  let color = '#111111', strokes = [], mode = 'draw', typed = null; const typedIn = el('input.zk-input.selectable', { placeholder: 'Type your name', style: { width: '100%', height: '32px', fontSize: '15px' } });
  const FONTS_SIG = ['"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive', '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive', '"Lucida Handwriting", "URW Chancery L", cursive', 'Georgia, "Times New Roman", serif'];
  let fontIdx = 0;
  const redraw = () => { ctx.clearRect(0, 0, W, H); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = ctx.lineJoin = 'round';
    if (mode === 'draw') { for (const s of strokes) { ctx.lineWidth = 2.6; ctx.stroke(new Path2D(Ann.smoothPath(s))); } }
    else if (typedIn.value) { ctx.font = `64px ${FONTS_SIG[fontIdx]}`; ctx.textBaseline = 'middle'; const w = ctx.measureText(typedIn.value).width; const sc = Math.min(1, (W - 40) / w); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.textAlign = 'center'; ctx.fillText(typedIn.value, 0, 0); ctx.restore(); } };
  cv.addEventListener('pointerdown', (e) => { if (mode !== 'draw') return; cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); const s = [[e.clientX - r.left, e.clientY - r.top]]; strokes.push(s); let sm = s[0].slice();
    const mv = (ev) => { for (const ce of (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev])) { sm = [sm[0] + (ce.clientX - r.left - sm[0]) * 0.6, sm[1] + (ce.clientY - r.top - sm[1]) * 0.6]; s.push(sm.slice()); } redraw(); }; const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); });
  const seg = el('.zk-seg', el('button.on', { onclick: (e) => setMode('draw', e.currentTarget) }, 'Draw'), el('button', { onclick: (e) => setMode('type', e.currentTarget) }, 'Type'));
  const typeRow = el('.zk-hidden', typedIn, el('.zk-row', { style: { gap: '6px', marginTop: '6px' } }, ...FONTS_SIG.map((f, i) => el('button.zk-btn.bordered', { style: { fontFamily: f, fontSize: '17px' }, onclick: () => { fontIdx = i; redraw(); } }, 'Signature'))));
  const setMode = (m, b) => { mode = m; $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); typeRow.classList.toggle('zk-hidden', m !== 'type'); cv.style.cursor = m === 'draw' ? 'crosshair' : 'default'; redraw(); m === 'type' && typedIn.focus(); };
  typedIn.addEventListener('input', redraw);
  const colors = el('.zk-row', { style: { gap: '6px' } }, ...['#111111', '#1c3d99', '#b3261e'].map((c, i) => el('button.zk-swatch' + (i ? '' : '.sel'), { style: { background: c }, onclick: (e) => { color = c; $$('.zk-swatch', colors).forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); redraw(); } })), el('.zk-spacer'), zk.btn({ label: 'Clear', onClick: () => { strokes = []; typedIn.value = ''; redraw(); } }));
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, seg, el('.sigwrap', cv, el('.sigline')), typeRow, colors);
  const r = await zk.sheet({ title: 'Create Signature', body, width: 580, buttons: [{ label: 'Cancel', value: false }, { label: 'Use Signature', primary: true, value: true }] });
  if (!r) return null; redraw();
  // tight crop
  const id = ctx.canvas.getContext('2d').getImageData(0, 0, cv.width, cv.height); let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (id.data[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null; const pad = 6, out = mkCanvas(x1 - x0 + pad * 2, y1 - y0 + pad * 2); out.getContext('2d').drawImage(cv, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
  const sig = { id: uid(), data: out.toDataURL('image/png'), w: out.width, h: out.height }; P.sigs.push(sig); await zeng.store.set('signatures', P.sigs); return sig;
};
