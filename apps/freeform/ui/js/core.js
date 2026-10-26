/* Freeform core: object model, boards, undo history, geometry, shape paths. Global namespace FF. */
(() => {
  'use strict';
  const FF = (window.FF = { rev: 0, dark: matchMedia('(prefers-color-scheme: dark)').matches, media: new Map(), listeners: {} });
  const f2 = (n) => Math.round(n * 100) / 100;
  FF.r2 = f2;
  FF.id = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  FF.on = (n, fn) => { (FF.listeners[n] ||= []).push(fn); };
  FF.emit = (n, a) => (FF.listeners[n] || []).forEach((f) => f(a));

  // ---------- colours ----------
  FF.col = (c, dark) => (c === 'ink' ? (dark ? '#f5f5f7' : '#1d1d1f') : c === 'paper' ? (dark ? '#2c2c2e' : '#ffffff') : c || 'none');
  FF.lum = (c) => {
    if (!c || c === 'none' || c === 'ink' || c === 'paper') return 1;
    let m = /^#([0-9a-f]{3,8})$/i.exec(c);
    if (m) { let h = m[1]; if (h.length < 6) h = [...h].map((x) => x + x).join(''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1; if (a < 0.5) return 1; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
    m = /^rgba?\(([^)]+)\)/.exec(c); if (m) { const p = m[1].split(',').map(parseFloat); if (p.length > 3 && p[3] < 0.5) return 1; return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255; }
    return 0.6;
  };
  FF.PALETTE = ['ink', '#8e8e93', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff375f', '#a2845e', '#ffffff'];
  FF.STICKY = ['#ffe27a', '#ffb3c7', '#ffc58a', '#b7ecb0', '#aed6ff', '#d9c2ff', '#e5e5ea', '#ffffff'];
  FF.FAMS = {
    sans: "ui-sans-serif,-apple-system,'SF Pro Text',Inter,'Segoe UI',system-ui,sans-serif",
    serif: "'New York','Iowan Old Style',Georgia,'Times New Roman',serif",
    mono: "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
    hand: "'Bradley Hand','Segoe Print','Marker Felt','Comic Sans MS',cursive",
  };

  // ---------- objects ----------
  const DEF = {
    shape: { fill: 'paper', stroke: 'ink', sw: 2, dash: '', op: 1, fs: 20, tc: 'ink', ta: 'center', va: 'middle', font: 'sans' },
    sticky: { fill: '#ffe27a', stroke: 'none', sw: 0, op: 1, shadow: true, fs: 24, tc: 'ink', ta: 'left', va: 'top', font: 'hand' },
    text: { fill: 'none', stroke: 'none', sw: 0, op: 1, fs: 28, tc: 'ink', ta: 'left', va: 'top', font: 'sans' },
    stroke: { stroke: 'ink', sw: 4, op: 1, tool: 'pen' },
    conn: { stroke: 'ink', sw: 2, dash: '', op: 1, fs: 16, tc: 'ink', font: 'sans' },
    frame: { fill: 'none', stroke: 'ink', sw: 1, op: 1, fs: 16, tc: 'ink', font: 'sans' },
    card: { fill: 'paper', stroke: 'ink', sw: 1, op: 1, fs: 15, tc: 'ink', font: 'sans', shadow: true },
    table: { fill: 'paper', stroke: 'ink', sw: 1, op: 1, fs: 16, tc: 'ink', font: 'sans', ta: 'left' },
    image: { op: 1, stroke: 'none', sw: 0 },
    stamp: { op: 1 },
    path: { fill: 'ink', stroke: 'none', sw: 0, op: 1 },
  };
  FF.defStyle = (t) => ({ ...(DEF[t] || {}) });
  FF.make = (type, p = {}) => {
    const o = { id: FF.id(), type, x: 0, y: 0, w: 100, h: 100, rot: 0, ...p };
    o.s = { ...FF.defStyle(type), ...(p.s || {}) };
    return o;
  };
  FF.isText = (o) => o.type === 'shape' || o.type === 'sticky' || o.type === 'text' || o.type === 'conn';
  FF.hasFill = (o) => o.type === 'shape' || o.type === 'sticky' || o.type === 'frame' || o.type === 'card' || o.type === 'table' || o.type === 'path';

  // deep clone except big flat arrays (pts) which are treated as immutable
  const clone = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    const r = {}; for (const k in v) r[k] = clone(v[k]); return r;
  };
  FF.clone = clone;
  FF.cloneObj = (o) => { const r = {}; for (const k in o) { if (k[0] === '_') continue; const v = o[k]; r[k] = k === 'pts' ? v : clone(v); } return r; };
  FF.touch = (o) => { o._bb = o._pth = o._lay = o._geo = o._sp = o._hp = null; FF.rev++; };
  FF.moved = (o) => { o._bb = null; o._geo = null; FF.rev++; };
  const same = (a, b) => {
    const ka = Object.keys(a).filter((k) => k[0] !== '_'), kb = Object.keys(b).filter((k) => k[0] !== '_');
    if (ka.length !== kb.length) return false;
    for (const k of ka) { if (k === 'pts') { if (a[k] !== b[k]) return false; } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false; }
    return true;
  };

  // ---------- geometry ----------
  const hyp = Math.hypot;
  FF.center = (o) => [o.x + o.w / 2, o.y + o.h / 2];
  FF.toWorld = (o, lx, ly) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), dx = lx - o.w / 2, dy = ly - o.h / 2; return [o.x + o.w / 2 + dx * c - dy * s, o.y + o.h / 2 + dx * s + dy * c]; };
  FF.toLocal = (o, x, y) => { const c = Math.cos(-(o.rot || 0)), s = Math.sin(-(o.rot || 0)), dx = x - o.x - o.w / 2, dy = y - o.y - o.h / 2; return [o.w / 2 + dx * c - dy * s, o.h / 2 + dx * s + dy * c]; };
  FF.bb = (o) => {
    if (o._bb) return o._bb;
    let b;
    if (!o.rot) b = [o.x, o.y, o.x + o.w, o.y + o.h];
    else { const p = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(([a, c]) => FF.toWorld(o, a, c)); b = [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]; }
    return (o._bb = b);
  };
  FF.unionBB = (objs) => { let b = null; for (const o of objs) { const q = FF.bb(o); b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q.slice(); } return b; };
  FF.segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return hyp(px - ax - t * dx, py - ay - t * dy); };

  // ---------- shape paths ----------
  const poly = (pts) => 'M' + pts.map((p) => f2(p[0]) + ' ' + f2(p[1])).join('L') + 'Z';
  const ngon = (n, w, h, rot = -Math.PI / 2) => poly(Array.from({ length: n }, (_, i) => [w / 2 + (w / 2) * Math.cos(rot + (i * 2 * Math.PI) / n), h / 2 + (h / 2) * Math.sin(rot + (i * 2 * Math.PI) / n)]));
  const rr = (x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); return `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`; };
  FF.rrPath = rr;
  const U = (s, w, h) => s.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => f2(a * w) + ' ' + f2(b * h)); // scale unit pairs
  const SH = {
    rect: (w, h) => ({ d: `M0 0H${w}V${h}H0Z` }),
    round: (w, h) => ({ d: rr(0, 0, w, h, Math.min(w, h) * 0.2) }),
    ellipse: (w, h) => ({ d: `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z` }),
    triangle: (w, h) => ({ d: poly([[w / 2, 0], [w, h], [0, h]]) }),
    rtriangle: (w, h) => ({ d: poly([[0, 0], [w, h], [0, h]]) }),
    diamond: (w, h) => ({ d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }),
    star: (w, h) => { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.382 : 1, a = -Math.PI / 2 + (i * Math.PI) / 5; p.push([w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)]); } return { d: poly(p) }; },
    pentagon: (w, h) => ({ d: ngon(5, w, h) }),
    hexagon: (w, h) => ({ d: poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]) }),
    octagon: (w, h) => ({ d: ngon(8, w, h, -Math.PI / 8) }),
    cross: (w, h) => ({ d: poly([[w * 0.35, 0], [w * 0.65, 0], [w * 0.65, h * 0.35], [w, h * 0.35], [w, h * 0.65], [w * 0.65, h * 0.65], [w * 0.65, h], [w * 0.35, h], [w * 0.35, h * 0.65], [0, h * 0.65], [0, h * 0.35], [w * 0.35, h * 0.35]]) }),
    arrow: (w, h) => ({ d: poly([[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]]) }),
    leftarrow: (w, h) => ({ d: poly([[w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.7], [w, h * 0.7]]) }),
    heart: (w, h) => ({ d: U('M.5 1C.1 .72 0 .5 0 .3C0 .12 .13 0 .28 0C.4 0 .47 .07 .5 .16C.53 .07 .6 0 .72 0C.87 0 1 .12 1 .3C1 .5 .9 .72 .5 1Z', w, h) }),
    bubble: (w, h) => { const b = h * 0.78, r = Math.min(w, b) * 0.2; return { d: `M${f2(r)} 0H${f2(w - r)}Q${w} 0 ${w} ${f2(r)}V${f2(b - r)}Q${w} ${f2(b)} ${f2(w - r)} ${f2(b)}H${f2(w * 0.4)}L${f2(w * 0.2)} ${h}L${f2(w * 0.25)} ${f2(b)}H${f2(r)}Q0 ${f2(b)} 0 ${f2(b - r)}V${f2(r)}Q0 0 ${f2(r)} 0Z` }; },
    cloud: (w, h) => {
      const P = [[0.2, 0.9], [0.03, 0.66], [0.14, 0.36], [0.38, 0.14], [0.66, 0.12], [0.86, 0.34], [0.97, 0.62], [0.8, 0.9]];
      let d = `M${f2(P[0][0] * w)} ${f2(P[0][1] * h)}`;
      for (let i = 1; i < P.length; i++) { const dx = (P[i][0] - P[i - 1][0]) * w, dy = (P[i][1] - P[i - 1][1]) * h, r = hyp(dx, dy) * 0.62; d += `A${f2(r)} ${f2(r)} 0 0 1 ${f2(P[i][0] * w)} ${f2(P[i][1] * h)}`; }
      return { d: d + 'Z' };
    },
    // flowchart
    process: (w, h) => SH.rect(w, h),
    decision: (w, h) => SH.diamond(w, h),
    terminator: (w, h) => ({ d: rr(0, 0, w, h, h / 2) }),
    data: (w, h) => ({ d: poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]) }),
    document: (w, h) => ({ d: `M0 0H${w}V${f2(h * 0.86)}C${f2(w * 0.8)} ${f2(h * 0.72)} ${f2(w * 0.7)} ${h} ${f2(w * 0.5)} ${f2(h * 0.9)}C${f2(w * 0.3)} ${f2(h * 0.8)} ${f2(w * 0.2)} ${f2(h * 0.98)} 0 ${f2(h * 0.88)}Z` }),
    database: (w, h) => { const ry = Math.min(h * 0.14, 30); return { d: `M0 ${f2(ry)}A${w / 2} ${f2(ry)} 0 0 1 ${w} ${f2(ry)}V${f2(h - ry)}A${w / 2} ${f2(ry)} 0 0 1 0 ${f2(h - ry)}Z`, d2: `M0 ${f2(ry)}A${w / 2} ${f2(ry)} 0 0 0 ${w} ${f2(ry)}` }; },
    predefined: (w, h) => ({ d: `M0 0H${w}V${h}H0Z`, d2: `M${f2(w * 0.1)} 0V${h}M${f2(w * 0.9)} 0V${h}` }),
    delay: (w, h) => ({ d: `M0 0H${f2(w * 0.6)}A${f2(w * 0.4)} ${f2(h / 2)} 0 0 1 ${f2(w * 0.6)} ${h}H0Z` }),
    merge: (w, h) => ({ d: poly([[0, 0], [w, 0], [w / 2, h]]) }),
    or: (w, h) => ({ ...SH.ellipse(w, h), d2: `M${f2(w / 2)} 0V${h}M0 ${f2(h / 2)}H${w}` }),
    prep: (w, h) => SH.hexagon(w, h),
  };
  FF.SHAPES = [
    ['rect', 'Rectangle'], ['round', 'Rounded Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['rtriangle', 'Right Triangle'], ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['star', 'Star'], ['cross', 'Cross'], ['heart', 'Heart'],
    ['arrow', 'Arrow'], ['leftarrow', 'Arrow Left'], ['bubble', 'Speech Bubble'], ['cloud', 'Cloud'],
    ['process', 'Process'], ['decision', 'Decision'], ['terminator', 'Terminator'], ['data', 'Data'], ['document', 'Document'], ['database', 'Database'], ['predefined', 'Predefined Process'], ['delay', 'Delay'], ['merge', 'Merge'], ['or', 'Or'],
  ];
  FF.shapeD = (k, w, h) => (SH[k] || SH.rect)(Math.max(1, w), Math.max(1, h));
  FF.shapePath = (o) => {
    const key = o.kind + '|' + o.w + '|' + o.h; if (o._pth && o._pth.key === key) return o._pth;
    const r = FF.shapeD(o.kind, o.w, o.h); return (o._pth = { key, d: r.d, d2: r.d2, p: new Path2D(r.d), p2: r.d2 ? new Path2D(r.d2) : null });
  };
  // text inset rectangle (local coords)
  FF.textBox = (o) => {
    const w = o.w, h = o.h, k = o.kind; let ix = 0.06, iy = 0.06;
    if (o.type === 'sticky') return { x: 14, y: 14, w: w - 28, h: h - 28 };
    if (o.type === 'shape') {
      if (k === 'ellipse' || k === 'or') { ix = 0.15; iy = 0.15; } else if (k === 'diamond' || k === 'decision') { ix = 0.25; iy = 0.25; } else if (k === 'triangle') { return { x: w * 0.25, y: h * 0.4, w: w * 0.5, h: h * 0.55 }; } else if (k === 'star') { ix = 0.28; iy = 0.3; } else if (k === 'bubble') { return { x: 8, y: 6, w: w - 16, h: h * 0.78 - 12 }; } else if (k === 'cloud') { ix = 0.14; iy = 0.2; } else if (k === 'heart') { ix = 0.2; iy = 0.2; } else if (k === 'hexagon' || k === 'prep') { ix = 0.15; } else if (k === 'data') { ix = 0.18; } else if (k === 'database') { return { x: 6, y: h * 0.2, w: w - 12, h: h * 0.7 }; } else if (k === 'arrow' || k === 'leftarrow') { return { x: w * 0.08, y: h * 0.3, w: w * 0.5, h: h * 0.4 }; } else if (k === 'merge') { return { x: w * 0.25, y: 4, w: w * 0.5, h: h * 0.4 }; }
    }
    return { x: Math.max(6, w * ix), y: Math.max(4, h * iy), w: Math.max(4, w * (1 - 2 * ix) - 4), h: Math.max(4, h * (1 - 2 * iy) - 4) };
  };

  // ---------- ports & connectors ----------
  const PORTS = { n: [0.5, 0, 0, -1], e: [1, 0.5, 1, 0], s: [0.5, 1, 0, 1], w: [0, 0.5, -1, 0] };
  FF.portPos = (o, port) => {
    const p = PORTS[port] || PORTS.e; let fx = p[0], fy = p[1];
    if (o.type === 'shape' && o.kind === 'triangle' && (port === 'e' || port === 'w')) fx = port === 'e' ? 0.75 : 0.25;
    const [x, y] = FF.toWorld(o, fx * o.w, fy * o.h); const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    return { x, y, dx: p[2] * c - p[3] * s, dy: p[2] * s + p[3] * c };
  };
  FF.ports = ['n', 'e', 's', 'w'];
  FF.connectable = (o) => o && (o.type === 'shape' || o.type === 'sticky' || o.type === 'text' || o.type === 'image' || o.type === 'frame' || o.type === 'card' || o.type === 'table' || o.type === 'stamp');
  FF.nearestPort = (o, x, y) => { let best = 'e', bd = 1e18; for (const p of FF.ports) { const q = FF.portPos(o, p); const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  const endInfo = (c, end, other) => {
    const a = c[end];
    if (a && a.id && FF.B.map.get(a.id)) {
      const o = FF.B.map.get(a.id); let port = a.port;
      if (!port || port === 'auto') { const ref = other && other.id && FF.B.map.get(other.id) ? FF.center(FF.B.map.get(other.id)) : [other.x, other.y]; port = FF.nearestPort(o, ref[0], ref[1]); }
      const q = FF.portPos(o, port); return { x: q.x, y: q.y, dx: q.dx, dy: q.dy, att: true };
    }
    return { x: a ? a.x : 0, y: a ? a.y : 0, dx: 0, dy: 0, att: false };
  };
  FF.connGeo = (c) => {
    if (c._geo) return c._geo;
    const A = endInfo(c, 'a', c.b), B = endInfo(c, 'b', c.a);
    const dirTo = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y; return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]; };
    if (!A.att) [A.dx, A.dy] = dirTo(A, B); if (!B.att) [B.dx, B.dy] = dirTo(B, A);
    let pts, d, angA, angB, bez = null;
    if (c.kind === 'elbow') {
      const sa = A.att ? 22 : 0, sb = B.att ? 22 : 0; const a1 = [A.x + A.dx * sa, A.y + A.dy * sa], b1 = [B.x + B.dx * sb, B.y + B.dy * sb];
      const ah = A.dx !== 0, bh = B.dx !== 0; let mid;
      if (ah && bh) { const mx = (a1[0] + b1[0]) / 2; mid = [[mx, a1[1]], [mx, b1[1]]]; }
      else if (!ah && !bh) { const my = (a1[1] + b1[1]) / 2; mid = [[a1[0], my], [b1[0], my]]; }
      else if (ah) mid = [[b1[0], a1[1]]]; else mid = [[a1[0], b1[1]]];
      pts = [[A.x, A.y], a1, ...mid, b1, [B.x, B.y]];
      const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const p = pts[i], q = out[out.length - 1]; if (Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01) continue; out.push(p); }
      for (let i = out.length - 2; i > 0; i--) { const p = out[i - 1], q = out[i], r = out[i + 1]; if ((Math.abs(p[0] - q[0]) < 0.01 && Math.abs(q[0] - r[0]) < 0.01) || (Math.abs(p[1] - q[1]) < 0.01 && Math.abs(q[1] - r[1]) < 0.01)) out.splice(i, 1); }
      pts = out; if (pts.length < 2) pts = [[A.x, A.y], [B.x, B.y]];
      d = 'M' + pts.map((p) => f2(p[0]) + ' ' + f2(p[1])).join('L');
      const n = pts.length; angA = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]); angB = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]);
    } else if (c.kind === 'curve') {
      const k = Math.max(40, hyp(B.x - A.x, B.y - A.y) * 0.4);
      const c1 = [A.x + A.dx * k, A.y + A.dy * k], c2 = [B.x + B.dx * k, B.y + B.dy * k]; bez = [[A.x, A.y], c1, c2, [B.x, B.y]];
      pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * u * A.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * B.x, u * u * u * A.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * B.y]); }
      d = `M${f2(A.x)} ${f2(A.y)}C${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(B.x)} ${f2(B.y)}`;
      angA = Math.atan2(A.y - c1[1], A.x - c1[0]); angB = Math.atan2(B.y - c2[1], B.x - c2[0]);
      if (hyp(A.x - c1[0], A.y - c1[1]) < 1e-6) angA = Math.atan2(A.y - B.y, A.x - B.x);
    } else {
      pts = [[A.x, A.y], [B.x, B.y]]; d = `M${f2(A.x)} ${f2(A.y)}L${f2(B.x)} ${f2(B.y)}`; angA = Math.atan2(A.y - B.y, A.x - B.x); angB = Math.atan2(B.y - A.y, B.x - A.x);
    }
    // midpoint by length
    let tot = 0; const L = [0]; for (let i = 1; i < pts.length; i++) { tot += hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
    let mid = pts[0]; for (let i = 1; i < pts.length; i++) if (L[i] >= tot / 2) { const t = (tot / 2 - L[i - 1]) / ((L[i] - L[i - 1]) || 1); mid = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; break; }
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0; c._bb = null;
    return (c._geo = { A, B, pts, d, p: new Path2D(d), angA, angB, mid, bez });
  };
  // after anything moved, refresh connectors attached to ids (or all)
  FF.reflow = (ids) => { for (const o of FF.B.objs) if (o.type === 'conn' && (!ids || (o.a.id && ids.has(o.a.id)) || (o.b.id && ids.has(o.b.id)))) { o._geo = null; o._bb = null; } };
  FF.connsOf = (ids) => FF.B.objs.filter((o) => o.type === 'conn' && ((o.a.id && ids.has(o.a.id)) || (o.b.id && ids.has(o.b.id))));

  // ---------- boards ----------
  class Board {
    constructor(name = 'Board 1') { this.id = FF.id(); this.name = name; this.objs = []; this.map = new Map(); this.bg = 'dot'; this.color = null; this.view = { x: -600, y: -380, z: 1 }; this.undo = []; this.redo = []; this.cost = 0; this.seq = 0; }
    add(o, idx) { if (this.map.has(o.id)) return; this.map.set(o.id, o); if (idx == null || idx >= this.objs.length) this.objs.push(o); else this.objs.splice(idx, 0, o); FF.rev++; }
    remove(o) { if (!this.map.delete(o.id)) return; const i = this.objs.indexOf(o); if (i >= 0) this.objs.splice(i, 1); FF.rev++; }
    get(id) { return this.map.get(id); }
  }
  FF.Board = Board;
  FF.newBoard = (name) => { const b = new Board(name); return b; };
  FF.boards = [new Board()];
  FF.B = FF.boards[0];
  FF.setBoard = (b) => { FF.B = b; FF.rev++; FF.emit('board'); };

  // ---------- history ----------
  // tx: record before-state of touched objects, diff at end. Objects are cloned (pts shared by ref).
  FF.tx = (label) => {
    const B = FF.B, t = {
      label, B, b: new Map(), ord0: null,
      touch(o) { if (!o) return o; if (!t.b.has(o.id)) t.b.set(o.id, FF.cloneObj(o)); return o; },
      touchAll(os) { os.forEach(t.touch); },
      order() { if (!t.ord0) t.ord0 = B.objs.map((o) => o.id); },
      add(o, idx) { t.order(); t.b.set(o.id, null); B.add(o, idx); return o; },
      del(o) { t.order(); t.touch(o); B.remove(o); },
      end() {
        const items = []; let cost = 0;
        for (const [id, before] of t.b) {
          const cur = B.map.get(id); const after = cur ? FF.cloneObj(cur) : null;
          if (!before && !after) continue; if (before && after && same(before, after)) continue;
          items.push({ id, before, after }); const c = (x) => (x ? 10 + (x.pts ? x.pts.length : 0) + (x.t ? 20 : 0) : 1); cost += c(before) + c(after);
        }
        let ord = null; if (t.ord0) { const n = B.objs.map((o) => o.id); if (n.length !== t.ord0.length || n.some((x, i) => x !== t.ord0[i])) { ord = { before: t.ord0, after: n }; cost += n.length * 2; } }
        if (!items.length && !ord) return false;
        B.undo.push({ label, items, ord, cost }); B.redo.length = 0; B.cost += cost;
        while (B.cost > 30e6 && B.undo.length > 20) B.cost -= B.undo.shift().cost; // memory guard: ~30M number-slots
        FF.emit('history'); FF.emit('change'); return true;
      },
    };
    return t;
  };
  FF.hist = (fn) => (label) => { const t = FF.tx(label); fn(t); return t.end(); };
  const applyState = (B, e, dir) => {
    for (const it of dir ? e.items : e.items.slice().reverse()) {
      const st = dir ? it.after : it.before; const cur = B.map.get(it.id);
      if (!st) { if (cur) { B.map.delete(it.id); const i = B.objs.indexOf(cur); if (i >= 0) B.objs.splice(i, 1); } continue; }
      if (cur) { for (const k of Object.keys(cur)) if (k[0] !== '_') delete cur[k]; Object.assign(cur, FF.cloneObj(st)); FF.touch(cur); }
      else { const o = FF.cloneObj(st); B.map.set(o.id, o); B.objs.push(o); }
    }
    if (e.ord) { const ids = dir ? e.ord.after : e.ord.before; B.objs = ids.map((id) => B.map.get(id)).filter(Boolean); }
    FF.reflow(); FF.rev++;
  };
  FF.undo = () => { const B = FF.B, e = B.undo.pop(); if (!e) return false; applyState(B, e, false); B.redo.push(e); FF.emit('history'); FF.emit('change', 'undo'); return e.label; };
  FF.redo = () => { const B = FF.B, e = B.redo.pop(); if (!e) return false; applyState(B, e, true); B.undo.push(e); FF.emit('history'); FF.emit('change', 'undo'); return e.label; };

  // ---------- serialisation ----------
  const rep = (k, v) => (k[0] === '_' ? undefined : v);
  FF.serializeBoard = (b) => ({ id: b.id, name: b.name, bg: b.bg, color: b.color, view: b.view, seq: b.seq, objects: JSON.parse(JSON.stringify(b.objs, rep)) });
  FF.boardFromJSON = (j) => {
    const b = new Board(j.name || 'Board'); b.id = j.id || b.id; b.bg = j.bg || 'dot'; b.color = j.color || null; b.view = j.view || b.view; b.seq = j.seq || 0;
    for (const raw of j.objects || []) { const o = FF.normalize(raw); if (o) b.add(o); }
    return b;
  };
  FF.normalize = (r) => {
    if (!r || typeof r !== 'object' || !r.type) return null;
    const o = { id: r.id || FF.id(), x: 0, y: 0, w: 100, h: 100, rot: 0, ...r }; o.s = { ...FF.defStyle(o.type), ...(r.s || {}) };
    for (const k of ['x', 'y', 'w', 'h', 'rot']) if (!isFinite(o[k])) o[k] = k === 'w' || k === 'h' ? 100 : 0;
    if (FF.isText(o) && typeof o.t === 'string') o.t = FF.plainToRuns(o.t);
    if (o.type === 'conn') { o.a ||= { x: 0, y: 0 }; o.b ||= { x: 100, y: 0 }; o.kind ||= 'straight'; }
    if (o.type === 'shape') o.kind ||= 'rect';
    return o;
  };
  FF.plainToRuns = (s) => String(s).split('\n').map((l) => [{ t: l }]);
  FF.runsToPlain = (t) => (t || []).map((p) => p.map((r) => r.t).join('')).join('\n');
  FF.objText = (o) => (o.t ? FF.runsToPlain(o.t) : o.title || o.ch || '');
})();
