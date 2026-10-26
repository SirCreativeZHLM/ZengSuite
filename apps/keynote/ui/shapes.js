/* Shape library. Every shape is a function (w,h,adj[]) -> SVG path string using only M L C Q Z (absolute),
   so the same string drives DOM rendering, Path2D (canvas export) and OOXML custGeom (pptx export).
   Ids follow OOXML preset names where one exists. */
(() => {
  const K = (window.K = window.K || {});
  const f = (n) => +n.toFixed(2);
  const D2R = Math.PI / 180;
  class P {
    constructor() { this.s = ''; }
    m(x, y) { this.s += `M${f(x)} ${f(y)}`; return this; }
    l(x, y) { this.s += `L${f(x)} ${f(y)}`; return this; }
    c(a, b, c, d, e, g) { this.s += `C${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(e)} ${f(g)}`; return this; }
    q(a, b, c, d) { this.s += `Q${f(a)} ${f(b)} ${f(c)} ${f(d)}`; return this; }
    z() { this.s += 'Z'; return this; }
    poly(pts) { pts.forEach((p, i) => (i ? this.l(p[0], p[1]) : this.m(p[0], p[1]))); return this.z(); }
    // elliptical arc from angle a0 to a1 (degrees, clockwise on screen). If move, starts with M.
    arc(cx, cy, rx, ry, a0, a1, move) {
      const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), d = ((a1 - a0) / n) * D2R, t = (4 / 3) * Math.tan(d / 4);
      let a = a0 * D2R; const pt = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
      let p = pt(a); if (move) this.m(p[0], p[1]);
      for (let i = 0; i < n; i++) {
        const b = a + d, p2 = pt(b);
        this.c(p[0] - t * rx * Math.sin(a), p[1] + t * ry * Math.cos(a), p2[0] + t * rx * Math.sin(b), p2[1] - t * ry * Math.cos(b), p2[0], p2[1]);
        a = b; p = p2;
      }
      return this;
    }
    ellipse(cx, cy, rx, ry) { return this.arc(cx, cy, rx, ry, 0, 360, true).z(); }
  }
  const poly = (pts) => new P().poly(pts).s;
  const reg = (n, w, h, rot = -90) => Array.from({ length: n }, (_, i) => { const a = (rot + (360 / n) * i) * D2R; return [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]; });
  const star = (n, w, h, inner) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = (-90 + (180 / n) * i) * D2R, r = i % 2 ? inner : 1; pts.push([w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)]); } return poly(pts); };
  const rrect = (p, x, y, w, h, r, m = true) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); p.m(x + r, y).l(x + w - r, y).arc(x + w - r, y + r, r, r, -90, 0).l(x + w, y + h - r).arc(x + w - r, y + h - r, r, r, 0, 90).l(x + r, y + h).arc(x + r, y + h - r, r, r, 90, 180).l(x, y + r).arc(x + r, y + r, r, r, 180, 270).z(); return p; };
  const rArrow = (L, H, a, b) => { // right arrow in an L x H frame, a: shaft fraction, b: head length as fraction of H
    const t = H * a, hl = Math.min(L, H * b * 2), y0 = (H - t) / 2, y1 = y0 + t;
    return [[0, y0], [L - hl, y0], [L - hl, 0], [L, H / 2], [L - hl, H], [L - hl, y1], [0, y1]];
  };
  const arrowDir = (w, h, a, b, dir) => {
    if (dir === 'r') return poly(rArrow(w, h, a, b));
    if (dir === 'l') return poly(rArrow(w, h, a, b).map(([x, y]) => [w - x, y]));
    const pts = rArrow(h, w, a, b);
    return poly(dir === 'u' ? pts.map(([x, y]) => [y, h - x]) : pts.map(([x, y]) => [y, x]));
  };
  // wedge tail geometry: returns tip + which side
  const tail = (w, h, a) => { const tx = w * (0.5 + (a[0] ?? -0.2)), ty = h * (0.5 + (a[1] ?? 0.7)); const dx = (tx - w / 2) / w, dy = (ty - h / 2) / h; const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'b' : 't'; return { tx, ty, side }; };
  const wedgeRect = (w, h, a, r) => {
    const { tx, ty, side } = tail(w, h, a); const p = new P(); r = Math.min(r, w / 2, h / 2);
    const fx = tx < w / 2 ? 0.2 : 0.6, fy = ty < h / 2 ? 0.2 : 0.6;
    p.m(r, 0); if (side === 't') p.l(w * fx, 0).l(tx, ty).l(w * (fx + 0.2), 0);
    p.l(w - r, 0); if (r) p.arc(w - r, r, r, r, -90, 0); p.l(w, r);
    if (side === 'r') p.l(w, h * fy).l(tx, ty).l(w, h * (fy + 0.2));
    p.l(w, h - r); if (r) p.arc(w - r, h - r, r, r, 0, 90); p.l(w - r, h);
    if (side === 'b') p.l(w * (fx + 0.2), h).l(tx, ty).l(w * fx, h);
    p.l(r, h); if (r) p.arc(r, h - r, r, r, 90, 180); p.l(0, h - r);
    if (side === 'l') p.l(0, h * (fy + 0.2)).l(tx, ty).l(0, h * fy);
    p.l(0, r); if (r) p.arc(r, r, r, r, 180, 270); return p.z().s;
  };
  const wedgeEll = (w, h, a) => {
    const { tx, ty } = tail(w, h, a); const th = Math.atan2((ty - h / 2) / h, (tx - w / 2) / w) / D2R; const p = new P();
    const pt = (d) => [w / 2 + (w / 2) * Math.cos(d * D2R), h / 2 + (h / 2) * Math.sin(d * D2R)];
    const a1 = pt(th - 14), a2 = pt(th + 14); p.m(a1[0], a1[1]).l(tx, ty).l(a2[0], a2[1]).arc(w / 2, h / 2, w / 2, h / 2, th + 14, th - 14 + 360); return p.z().s;
  };
  const cloud = (w, h) => {
    const n = 8, pts = Array.from({ length: n }, (_, i) => { const a = (-90 + (360 / n) * i) * D2R; return [w / 2 + w * 0.4 * Math.cos(a), h / 2 + h * 0.4 * Math.sin(a)]; });
    const p = new P().m(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) { const A = pts[i], B = pts[(i + 1) % n]; const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2; const cx = w / 2 + (mx - w / 2) * 1.75, cy = h / 2 + (my - h / 2) * 1.75; p.q(cx, cy, B[0], B[1]); }
    return p.z().s;
  };
  const brace = (w, h, left) => { const p = new P(), x0 = left ? w : 0, x1 = left ? 0 : w, mid = left ? w / 2 : w / 2, q = Math.min(w / 2, h / 4); const s = left ? -1 : 1;
    p.m(x0, 0).q(w / 2, 0, w / 2, q).l(w / 2, h / 2 - q).q(w / 2, h / 2, x1, h / 2).q(w / 2, h / 2, w / 2, h / 2 + q).l(w / 2, h - q).q(w / 2, h, x0, h); return p.s; };
  const flow = {
    flowChartProcess: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]),
    flowChartDecision: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
    flowChartTerminator: (w, h) => rrect(new P(), 0, 0, w, h, h / 2).s,
    flowChartInputOutput: (w, h) => poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]),
    flowChartDocument: (w, h) => new P().m(0, 0).l(w, 0).l(w, h * 0.85).c(w * 0.75, h * 0.7, w * 0.6, h * 0.7, w * 0.5, h * 0.85).c(w * 0.35, h, w * 0.2, h, 0, h * 0.85).z().s,
    flowChartPredefinedProcess: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]) + `M${f(w * 0.12)} 0L${f(w * 0.12)} ${f(h)}L${f(w * 0.12 + 0.01)} ${f(h)}L${f(w * 0.12 + 0.01)} 0ZM${f(w * 0.88)} 0L${f(w * 0.88)} ${f(h)}L${f(w * 0.88 + 0.01)} ${f(h)}L${f(w * 0.88 + 0.01)} 0Z`,
    flowChartDelay: (w, h) => new P().m(0, 0).l(w / 2, 0).arc(w / 2, h / 2, w / 2, h / 2, -90, 90).l(0, h).z().s,
    flowChartPreparation: (w, h) => poly([[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]]),
    flowChartDisplay: (w, h) => new P().m(0, h / 2).l(w * 0.15, 0).l(w * 0.75, 0).arc(w * 0.75, h / 2, w * 0.25, h / 2, -90, 90).l(w * 0.15, h).z().s,
    flowChartManualInput: (w, h) => poly([[0, h * 0.2], [w, 0], [w, h], [0, h]]),
  };
  const can = (w, h, a) => { const e = Math.min(h / 2, h * (a ?? 0.2) * 0.5 + 0.0001), p = new P();
    p.m(0, e).arc(w / 2, e, w / 2, e, 180, 360).l(w, h - e).arc(w / 2, h - e, w / 2, e, 0, 180).z();
    p.m(w, e).arc(w / 2, e, w / 2, e, 0, 180).z(); return p.s; };

  // id -> {n: name, g: category, a: default adj array, d(w,h,a), open?, evenodd?, tb: text rect fn}
  const S = {};
  const def = (id, n, g, d, o = {}) => (S[id] = Object.assign({ id, n, g, d, a: [] }, o));
  const B = 'Basic', A = 'Arrows', ST = 'Stars', C = 'Callouts', BR = 'Brackets', F = 'Flowchart', M = 'Math', X = 'Symbols';
  def('rect', 'Rectangle', B, (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]));
  def('roundRect', 'Rounded Rectangle', B, (w, h, a) => rrect(new P(), 0, 0, w, h, Math.min(w, h) * a[0]).s, { a: [0.16] });
  def('snip1Rect', 'Snipped Corner', B, (w, h, a) => { const s = Math.min(w, h) * a[0]; return poly([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]); }, { a: [0.2] });
  def('snip2SameRect', 'Snipped Top Corners', B, (w, h, a) => { const s = Math.min(w, h) * a[0]; return poly([[s, 0], [w - s, 0], [w, s], [w, h], [0, h], [0, s]]); }, { a: [0.2] });
  def('round1Rect', 'Round One Corner', B, (w, h, a) => { const r = Math.min(w, h) * a[0]; return new P().m(0, 0).l(w - r, 0).arc(w - r, r, r, r, -90, 0).l(w, h).l(0, h).z().s; }, { a: [0.25] });
  def('round2SameRect', 'Round Top Corners', B, (w, h, a) => { const r = Math.min(w, h) * a[0]; return new P().m(r, 0).l(w - r, 0).arc(w - r, r, r, r, -90, 0).l(w, h).l(0, h).l(0, r).arc(r, r, r, r, 180, 270).z().s; }, { a: [0.25] });
  def('ellipse', 'Ellipse', B, (w, h) => new P().ellipse(w / 2, h / 2, w / 2, h / 2).s);
  def('triangle', 'Triangle', B, (w, h, a) => poly([[w * a[0], 0], [w, h], [0, h]]), { a: [0.5] });
  def('rtTriangle', 'Right Triangle', B, (w, h) => poly([[0, 0], [w, h], [0, h]]));
  def('parallelogram', 'Parallelogram', B, (w, h, a) => { const o = Math.min(w, h) * a[0] * 1.4; return poly([[o, 0], [w, 0], [w - o, h], [0, h]]); }, { a: [0.25] });
  def('trapezoid', 'Trapezoid', B, (w, h, a) => { const o = Math.min(w, h) * a[0] * 1.4; return poly([[o, 0], [w - o, 0], [w, h], [0, h]]); }, { a: [0.25] });
  def('diamond', 'Diamond', B, (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]));
  def('pentagon', 'Pentagon', B, (w, h) => poly(reg(5, w, h)));
  def('hexagon', 'Hexagon', B, (w, h, a) => { const o = w * a[0]; return poly([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]); }, { a: [0.25] });
  def('heptagon', 'Heptagon', B, (w, h) => poly(reg(7, w, h)));
  def('octagon', 'Octagon', B, (w, h, a) => { const o = Math.min(w, h) * a[0]; return poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]); }, { a: [0.29] });
  def('decagon', 'Decagon', B, (w, h) => poly(reg(10, w, h)));
  def('dodecagon', 'Dodecagon', B, (w, h) => poly(reg(12, w, h, -75)));
  def('plus', 'Cross', B, (w, h, a) => { const x = w * a[0], y = h * a[0]; return poly([[x, 0], [w - x, 0], [w - x, y], [w, y], [w, h - y], [w - x, h - y], [w - x, h], [x, h], [x, h - y], [0, h - y], [0, y], [x, y]]); }, { a: [0.3] });
  def('frame', 'Frame', B, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[0, 0], [w, 0], [w, h], [0, h]]) + poly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]]); }, { a: [0.12], evenodd: true });
  def('donut', 'Donut', B, (w, h, a) => { const t = Math.min(w, h) * a[0]; return new P().ellipse(w / 2, h / 2, w / 2, h / 2).s + new P().arc(w / 2, h / 2, w / 2 - t, h / 2 - t, 0, -360, true).z().s; }, { a: [0.25], evenodd: true });
  def('blockArc', 'Block Arc', B, (w, h, a) => { const t = Math.min(w, h) * a[0]; return new P().arc(w / 2, h / 2, w / 2, h / 2, 180, 360, true).l(w - t, h / 2).arc(w / 2, h / 2, w / 2 - t, h / 2 - t, 360, 180).z().s; }, { a: [0.25] });
  def('pie', 'Pie', B, (w, h) => new P().m(w / 2, h / 2).l(w, h / 2).arc(w / 2, h / 2, w / 2, h / 2, 0, 270).z().s);
  def('chord', 'Chord', B, (w, h) => new P().arc(w / 2, h / 2, w / 2, h / 2, 45, 315, true).z().s);
  def('teardrop', 'Teardrop', B, (w, h) => new P().m(w, 0).l(w, h / 2).arc(w / 2, h / 2, w / 2, h / 2, 0, 270 + 0).l(w, 0).z().s.replace(/^/, '') );
  def('heart', 'Heart', X, (w, h) => new P().m(w * 0.5, h * 0.95).c(w * 0.1, h * 0.65, 0, h * 0.45, 0, h * 0.28).c(0, h * 0.1, w * 0.15, 0, w * 0.28, 0).c(w * 0.4, 0, w * 0.47, h * 0.07, w * 0.5, h * 0.15).c(w * 0.53, h * 0.07, w * 0.6, 0, w * 0.72, 0).c(w * 0.85, 0, w, h * 0.1, w, h * 0.28).c(w, h * 0.45, w * 0.9, h * 0.65, w * 0.5, h * 0.95).z().s);
  def('moon', 'Moon', X, (w, h, a) => new P().m(w, 0).c(w * 0.45, 0, 0, h * 0.2, 0, h / 2).c(0, h * 0.8, w * 0.45, h, w, h).c(w * (1 - a[0] * 1.2), h * 0.8, w * (1 - a[0] * 1.2), h * 0.2, w, 0).z().s, { a: [0.5] });
  def('sun', 'Sun', X, (w, h) => { let s = new P().ellipse(w / 2, h / 2, w * 0.22, h * 0.22).s; for (let i = 0; i < 8; i++) { const a = i * 45 * D2R; const pt = (r, d) => [w / 2 + (w / 2) * r * Math.cos(a + d), h / 2 + (h / 2) * r * Math.sin(a + d)]; s += poly([pt(0.58, -0.17), pt(0.98, 0), pt(0.58, 0.17)]); } return s; });
  def('cloud', 'Cloud', X, cloud);
  def('lightningBolt', 'Lightning Bolt', X, (w, h) => poly([[0.39, 0], [0.12, 0.52], [0.4, 0.52], [0.28, 1], [0.88, 0.38], [0.55, 0.38], [0.72, 0]].map(([x, y]) => [x * w, y * h])));
  def('smileyFace', 'Smiley Face', X, (w, h) => new P().ellipse(w / 2, h / 2, w / 2, h / 2).s + new P().ellipse(w * 0.35, h * 0.38, w * 0.06, h * 0.08).s + new P().ellipse(w * 0.65, h * 0.38, w * 0.06, h * 0.08).s + new P().arc(w / 2, h * 0.52, w * 0.28, h * 0.24, 20, 160, true).arc(w / 2, h * 0.52, w * 0.28, h * 0.17, 160, 20).z().s, { evenodd: true });
  def('cube', 'Cube', X, (w, h, a) => { const d = Math.min(w, h) * a[0]; return poly([[0, d], [w - d, d], [w - d, h], [0, h]]) + poly([[d, 0], [w, 0], [w - d, d], [0, d]]) + poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]); }, { a: [0.25] });
  def('can', 'Cylinder', X, can, { a: [0.25], evenodd: false });
  def('bevel', 'Bevel', X, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[0, 0], [w, 0], [w, h], [0, h]]) + poly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]]); }, { a: [0.12], evenodd: true });
  def('foldedCorner', 'Folded Corner', X, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[0, 0], [w, 0], [w, h - t], [w - t, h], [0, h]]) + poly([[w - t, h], [w - t, h - t], [w, h - t]]); }, { a: [0.2], evenodd: true });
  def('noSymbol', 'No Symbol', X, (w, h, a) => { const t = Math.min(w, h) * a[0], rx = w / 2 - t, ry = h / 2 - t; return new P().ellipse(w / 2, h / 2, w / 2, h / 2).s + new P().arc(w / 2, h / 2, rx, ry, 0, -360, true).z().s; }, { a: [0.12], evenodd: true });
  def('plaque', 'Plaque', X, (w, h, a) => { const r = Math.min(w, h) * a[0]; return new P().m(r, 0).l(w - r, 0).arc(w, 0, r, r, 180, 90).l(w, h - r).arc(w, h, r, r, 270, 180).l(r, h).arc(0, h, r, r, 0, -90).l(0, r).arc(0, 0, r, r, 90, 0).z().s; }, { a: [0.16] });
  def('halfFrame', 'Half Frame', B, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[0, 0], [w, 0], [w * 0.6, t], [t, t], [t, h * 0.6], [0, h]]); }, { a: [0.3] });
  def('corner', 'L-Shape', B, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]); }, { a: [0.3] });
  def('diagStripe', 'Diagonal Stripe', B, (w, h, a) => poly([[w * a[0], 0], [w, 0], [0, h], [0, h * a[0]]]), { a: [0.5] });
  def('ribbon2', 'Ribbon', X, (w, h) => poly([[0, h * 0.2], [w * 0.2, h * 0.2], [w * 0.2, 0], [w * 0.8, 0], [w * 0.8, h * 0.2], [w, h * 0.2], [w * 0.9, h * 0.5], [w, h * 0.8], [w * 0.8, h * 0.8], [w * 0.8, h], [w * 0.2, h], [w * 0.2, h * 0.8], [0, h * 0.8], [w * 0.1, h * 0.5]]));
  def('wave', 'Wave', X, (w, h) => new P().m(0, h * 0.15).c(w * 0.25, -h * 0.1, w * 0.25, -h * 0.1, w * 0.5, h * 0.15).c(w * 0.75, h * 0.4, w * 0.75, h * 0.4, w, h * 0.15).l(w, h * 0.85).c(w * 0.75, h * 1.1, w * 0.75, h * 1.1, w * 0.5, h * 0.85).c(w * 0.25, h * 0.6, w * 0.25, h * 0.6, 0, h * 0.85).z().s);
  def('doubleWave', 'Double Wave', X, (w, h) => new P().m(0, h * 0.15).c(w * 0.17, -h * 0.05, w * 0.33, -h * 0.05, w * 0.5, h * 0.15).c(w * 0.67, h * 0.35, w * 0.83, h * 0.35, w, h * 0.15).l(w, h * 0.85).c(w * 0.83, h * 1.05, w * 0.67, h * 1.05, w * 0.5, h * 0.85).c(w * 0.33, h * 0.65, w * 0.17, h * 0.65, 0, h * 0.85).z().s);
  def('gear6', 'Gear', X, (w, h) => { const pts = []; for (let i = 0; i < 12; i++) { const a0 = (i * 30 - 90) * D2R, r = i % 2 ? 0.7 : 1; pts.push([w / 2 + (w / 2) * r * Math.cos(a0 - 0.12), h / 2 + (h / 2) * r * Math.sin(a0 - 0.12)], [w / 2 + (w / 2) * r * Math.cos(a0 + 0.12), h / 2 + (h / 2) * r * Math.sin(a0 + 0.12)]); } return poly(pts) + new P().arc(w / 2, h / 2, w * 0.2, h * 0.2, 0, -360, true).z().s; }, { evenodd: true });
  [4, 5, 6, 7, 8, 10, 12, 16, 24, 32].forEach((n) => def('star' + n, n + '-Point Star', ST, (w, h, a) => star(n, w, h, a[0]), { a: [n === 4 ? 0.38 : n === 5 ? 0.4 : n <= 8 ? 0.5 : 0.8] }));
  def('rightArrow', 'Right Arrow', A, (w, h, a) => arrowDir(w, h, a[0], a[1], 'r'), { a: [0.5, 0.5] });
  def('leftArrow', 'Left Arrow', A, (w, h, a) => arrowDir(w, h, a[0], a[1], 'l'), { a: [0.5, 0.5] });
  def('upArrow', 'Up Arrow', A, (w, h, a) => arrowDir(w, h, a[0], a[1], 'u'), { a: [0.5, 0.5] });
  def('downArrow', 'Down Arrow', A, (w, h, a) => arrowDir(w, h, a[0], a[1], 'd'), { a: [0.5, 0.5] });
  def('leftRightArrow', 'Double Arrow', A, (w, h, a) => { const t = h * a[0], hl = Math.min(w / 2, h * a[1] * 2), y0 = (h - t) / 2, y1 = y0 + t; return poly([[0, h / 2], [hl, 0], [hl, y0], [w - hl, y0], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, y1], [hl, y1], [hl, h]]); }, { a: [0.5, 0.5] });
  def('upDownArrow', 'Up-Down Arrow', A, (w, h, a) => { const t = w * a[0], hl = Math.min(h / 2, w * a[1] * 2), x0 = (w - t) / 2, x1 = x0 + t; return poly([[w / 2, 0], [w, hl], [x1, hl], [x1, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [x0, h - hl], [x0, hl], [0, hl]]); }, { a: [0.5, 0.5] });
  def('quadArrow', 'Four-Way Arrow', A, (w, h, a) => { const t = Math.min(w, h) * a[0] * 0.5, hl = Math.min(w, h) * 0.22, cx = w / 2, cy = h / 2; return poly([[cx, 0], [cx + hl, hl], [cx + t / 2, hl], [cx + t / 2, cy - t / 2], [w - hl, cy - t / 2], [w - hl, cy - hl], [w, cy], [w - hl, cy + hl], [w - hl, cy + t / 2], [cx + t / 2, cy + t / 2], [cx + t / 2, h - hl], [cx + hl, h - hl], [cx, h], [cx - hl, h - hl], [cx - t / 2, h - hl], [cx - t / 2, cy + t / 2], [hl, cy + t / 2], [hl, cy + hl], [0, cy], [hl, cy - hl], [hl, cy - t / 2], [cx - t / 2, cy - t / 2], [cx - t / 2, hl], [cx - hl, hl]]); }, { a: [0.4] });
  def('bentArrow', 'Bent Arrow', A, (w, h, a) => { const t = Math.min(w, h) * a[0], hl = Math.min(w, h) * 0.35, hh = t * 1.1; return poly([[0, h], [0, hh - t / 2], [w - hl, hh - t / 2], [w - hl, 0], [w, hh], [w - hl, 2 * hh], [w - hl, hh + t / 2], [t, hh + t / 2], [t, h]]); }, { a: [0.25] });
  def('uturnArrow', 'U-Turn Arrow', A, (w, h, a) => { const t = Math.min(w, h) * a[0], xc = w - t, Ro = (xc + t / 2) / 2, Ri = Math.max(0.1, Ro - t), hb = h - t * 1.5; return new P().m(0, h).l(0, Ro).arc(Ro, Ro, Ro, Ro, 180, 360).l(2 * Ro, hb).l(w, hb).l(xc, h).l(w - 2 * t, hb).l(xc - t / 2, hb).l(xc - t / 2, Ro).arc(Ro, Ro, Ri, Ri, 360, 180).l(t, h).z().s; }, { a: [0.2] });
  def('curvedRightArrow', 'Curved Arrow', A, (w, h) => new P().m(0, h).c(0, h * 0.4, w * 0.3, h * 0.12, w * 0.7, h * 0.12).l(w * 0.7, 0).l(w, h * 0.22).l(w * 0.7, h * 0.44).l(w * 0.7, h * 0.32).c(w * 0.4, h * 0.32, w * 0.2, h * 0.55, w * 0.2, h).z().s);
  def('notchedRightArrow', 'Notched Arrow', A, (w, h, a) => { const t = h * a[0], hl = Math.min(w, h * a[1] * 2), y0 = (h - t) / 2; return poly([[0, y0], [w - hl, y0], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, y0 + t], [0, y0 + t], [h * 0.25, h / 2]]); }, { a: [0.5, 0.5] });
  def('homePlate', 'Pentagon Arrow', A, (w, h, a) => { const o = Math.min(w, h * a[0] * 2); return poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]); }, { a: [0.5] });
  def('chevron', 'Chevron', A, (w, h, a) => { const o = Math.min(w, h * a[0] * 2); return poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]); }, { a: [0.5] });
  def('rightArrowCallout', 'Arrow Callout', A, (w, h, a) => poly([[0, 0], [w * 0.6, 0], [w * 0.6, h * 0.3], [w * 0.8, h * 0.3], [w * 0.8, h * 0.1], [w, h / 2], [w * 0.8, h * 0.9], [w * 0.8, h * 0.7], [w * 0.6, h * 0.7], [w * 0.6, h], [0, h]]));
  def('wedgeRectCallout', 'Speech Bubble', C, (w, h, a) => wedgeRect(w, h, a, 0), { a: [-0.2, 0.7] });
  def('wedgeRoundRectCallout', 'Rounded Speech Bubble', C, (w, h, a) => wedgeRect(w, h, a, Math.min(w, h) * 0.16), { a: [-0.2, 0.7] });
  def('wedgeEllipseCallout', 'Oval Speech Bubble', C, (w, h, a) => wedgeEll(w, h, a), { a: [-0.2, 0.7] });
  def('cloudCallout', 'Thought Bubble', C, (w, h, a) => { const { tx, ty } = tail(w, h, a); const s = cloud(w, h * 0.8); return s + new P().ellipse(w * 0.2 + (tx - w * 0.2) * 0.2, h * 0.8 + (ty - h * 0.8) * 0.25 - 0, w * 0.05, h * 0.05).s + new P().ellipse(tx, ty, w * 0.025, h * 0.025).s; }, { a: [-0.3, 0.7] });
  def('borderCallout1', 'Line Callout', C, (w, h, a) => { const { tx, ty } = tail(w, h, a); return poly([[0, 0], [w, 0], [w, h], [0, h]]) + `M${f(w * 0.5)} ${f(h)}L${f(tx)} ${f(ty)}L${f(tx + 0.01)} ${f(ty + 0.01)}L${f(w * 0.5 + 0.01)} ${f(h)}Z`; }, { a: [-0.2, 0.8] });
  def('leftBracket', 'Left Bracket', BR, (w, h, a) => new P().m(w, 0).q(0, 0, 0, Math.min(h / 4, w * 1.5)).l(0, h - Math.min(h / 4, w * 1.5)).q(0, h, w, h).s, { open: true });
  def('rightBracket', 'Right Bracket', BR, (w, h, a) => new P().m(0, 0).q(w, 0, w, Math.min(h / 4, w * 1.5)).l(w, h - Math.min(h / 4, w * 1.5)).q(w, h, 0, h).s, { open: true });
  def('leftBrace', 'Left Brace', BR, (w, h) => brace(w, h, true), { open: true });
  def('rightBrace', 'Right Brace', BR, (w, h) => brace(w, h, false), { open: true });
  def('bracketPair', 'Bracket Pair', BR, (w, h) => new P().m(w * 0.12, 0).q(0, 0, 0, h * 0.12).l(0, h * 0.88).q(0, h, w * 0.12, h).s + new P().m(w * 0.88, 0).q(w, 0, w, h * 0.12).l(w, h * 0.88).q(w, h, w * 0.88, h).s, { open: true });
  def('bracePair', 'Brace Pair', BR, (w, h) => new P().m(w * 0.15, 0).q(w * 0.05, 0, w * 0.05, h * 0.1).l(w * 0.05, h * 0.4).q(w * 0.05, h / 2, 0, h / 2).q(w * 0.05, h / 2, w * 0.05, h * 0.6).l(w * 0.05, h * 0.9).q(w * 0.05, h, w * 0.15, h).s + new P().m(w * 0.85, 0).q(w * 0.95, 0, w * 0.95, h * 0.1).l(w * 0.95, h * 0.4).q(w * 0.95, h / 2, w, h / 2).q(w * 0.95, h / 2, w * 0.95, h * 0.6).l(w * 0.95, h * 0.9).q(w * 0.95, h, w * 0.85, h).s, { open: true });
  Object.entries(flow).forEach(([id, d]) => def(id, id.replace('flowChart', 'Flow: ').replace(/([a-z])([A-Z])/g, '$1 $2'), F, d, { evenodd: id === 'flowChartPredefinedProcess' }));
  def('mathPlus', 'Plus', M, (w, h, a) => { const t = Math.min(w, h) * a[0]; return poly([[(w - t) / 2, 0], [(w + t) / 2, 0], [(w + t) / 2, (h - t) / 2], [w, (h - t) / 2], [w, (h + t) / 2], [(w + t) / 2, (h + t) / 2], [(w + t) / 2, h], [(w - t) / 2, h], [(w - t) / 2, (h + t) / 2], [0, (h + t) / 2], [0, (h - t) / 2], [(w - t) / 2, (h - t) / 2]]); }, { a: [0.24] });
  def('mathMinus', 'Minus', M, (w, h, a) => { const t = h * a[0]; return poly([[0, (h - t) / 2], [w, (h - t) / 2], [w, (h + t) / 2], [0, (h + t) / 2]]); }, { a: [0.24] });
  def('mathMultiply', 'Multiply', M, (w, h, a) => { const t = Math.min(w, h) * a[0] * 0.7, cx = w / 2, cy = h / 2; return poly([[t, 0], [cx, cy - t], [w - t, 0], [w, t], [cx + t, cy], [w, h - t], [w - t, h], [cx, cy + t], [t, h], [0, h - t], [cx - t, cy], [0, t]]); }, { a: [0.24] });
  def('mathDivide', 'Divide', M, (w, h, a) => { const t = h * a[0]; return poly([[0, (h - t) / 2], [w, (h - t) / 2], [w, (h + t) / 2], [0, (h + t) / 2]]) + new P().ellipse(w / 2, h * 0.17, t * 0.6, t * 0.6).s + new P().ellipse(w / 2, h * 0.83, t * 0.6, t * 0.6).s; }, { a: [0.2] });
  def('mathEqual', 'Equal', M, (w, h, a) => { const t = h * a[0]; return poly([[0, h * 0.2], [w, h * 0.2], [w, h * 0.2 + t], [0, h * 0.2 + t]]) + poly([[0, h * 0.8 - t], [w, h * 0.8 - t], [w, h * 0.8], [0, h * 0.8]]); }, { a: [0.2] });
  S.teardrop.d = (w, h) => new P().m(w, h / 2).arc(w / 2, h / 2, w / 2, h / 2, 0, 270).l(w, 0).z().s;
  // lines/connectors are separate object types ('conn'); this table lists the default look for each tool
  K.shapes = S;
  K.shapeList = Object.values(S);
  K.shapeCats = [...new Set(K.shapeList.map((s) => s.g))];
  K.shapePath = (id, w, h, adj) => { const s = S[id]; if (!s) return S.rect.d(w, h); const a = (adj && adj.length ? adj : s.a).map((v, i) => (v == null ? s.a[i] : v)); try { return s.d(Math.max(w, 0.01), Math.max(h, 0.01), a); } catch { return S.rect.d(w, h); } };
  K.P = P;
  // parse a path (absolute M L C Q Z only) into commands [[cmd, ...nums]]
  K.parsePath = (d) => { const out = []; const re = /([MLCQZ])([^MLCQZ]*)/g; let m; while ((m = re.exec(d))) out.push([m[1], ...(m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [])]); return out; };
  // connection sites (mid-edges) in object-local coords
  K.sites = (w, h) => [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
})();
