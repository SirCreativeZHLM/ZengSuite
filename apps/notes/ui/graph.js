/* Link Graph: an interactive force-directed map of notes, [[links]] and #tags.
   Hand-written physics (Barnes-Hut repulsion + springs + gravity), canvas rendering, momentum pan, eased zoom. */
(() => {
  const U = N.u, A = N.app, S = A.S, Db = N.db; const G = (N.graph = {});
  window.ZI = window.ZI || {}; ZI.graph = '<circle cx="5.5" cy="6.5" r="2.4"/><circle cx="18.5" cy="8" r="2.4"/><circle cx="9.5" cy="18" r="2.4"/><circle cx="17.5" cy="17" r="1.6"/><path d="M7.7 7l8.4.7M6.6 8.7l2.1 6.9M17.2 10.3l-6.4 6M11.7 17.7l4.4-.5"/>';
  const M = () => Db.idx.notes;
  const HUES = [38, 200, 150, 280, 12, 175, 330, 95];
  let root, bar, cv, ctx, card, W = 0, H = 0, dpr = 1, raf = 0, open = false, ro;
  let nodes = [], edges = [], byId = new Map(), adj = new Map(); const pos = new Map();
  let view = { x: 0, y: 0, s: 1 }, tv = { x: 0, y: 0, s: 1 }, alpha = 1, userMoved = false, ticks = 0;
  const opts = { tags: true, orphans: true, local: false, depth: 1, folder: '', tag: '', q: '' };
  let hover = null, drag = null, pan = null, vel = { x: 0, y: 0 }, col = {}, ui = {};
  const reduced = () => zk.reducedMotion();

  // ------------------------------------------------------------ data
  function folderHue(m) { const k = m.f || ''; let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return k ? HUES[h % HUES.length] : -1; }
  function build() {
    const all = Object.values(M()).filter((m) => !m.d); const ds = opts.folder ? A.descendants(opts.folder) : null; const q = opts.q.trim().toLowerCase();
    const titleMap = new Map(); for (const m of all.sort((a, b) => a.m - b.m)) if (m.t) titleMap.set(m.t.toLowerCase(), m.id);
    let ms = all.filter((m) => (!ds || ds.has(m.f)) && (!opts.tag || (m.tg || []).includes(opts.tag)));
    const inSet = new Map(); const ns = []; for (const m of ms) { const n = { id: m.id, m, t: m.t || 'New Note', x: 0, y: 0, vx: 0, vy: 0, deg: 0, r: 5, hue: folderHue(m), tag: false }; ns.push(n); inSet.set(m.id, n); }
    const es = []; const seen = new Set();
    const link = (a, b, k) => { if (!a || !b || a === b) return; const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id; if (seen.has(key)) return; seen.add(key); es.push({ a, b, k }); a.deg++; b.deg++; };
    for (const n of ns) for (const l of n.m.ln || []) { const tid = M()[l] ? l : titleMap.get(l); const tn = tid && inSet.get(tid); if (tn) link(n, tn, 0); }
    if (opts.tags) { const tn = new Map(); for (const n of ns) for (const t of n.m.tg || []) { let x = tn.get(t); if (!x) { x = { id: '#' + t, t: '#' + t, x: 0, y: 0, vx: 0, vy: 0, deg: 0, r: 6, tag: true, hue: -2 }; tn.set(t, x); } link(n, x, 1); } ns.push(...tn.values()); }
    let keep = ns; if (!opts.orphans) keep = keep.filter((n) => n.deg > 0 || n.tag && false);
    if (opts.local && S.cur) { const start = ns.find((n) => n.id === S.cur); if (start) { const nb = new Map(); for (const e of es) { (nb.get(e.a) || nb.set(e.a, []).get(e.a)).push(e.b); (nb.get(e.b) || nb.set(e.b, []).get(e.b)).push(e.a); } const vis = new Set([start]); let fr = [start]; for (let d = 0; d < opts.depth; d++) { const nx = []; for (const n of fr) for (const o of nb.get(n) || []) if (!vis.has(o)) { vis.add(o); nx.push(o); } fr = nx; } keep = keep.filter((n) => vis.has(n)); } }
    const ks = new Set(keep); edges = es.filter((e) => ks.has(e.a) && ks.has(e.b)); nodes = keep; byId = new Map(nodes.map((n) => [n.id, n])); adj = new Map(nodes.map((n) => [n, []]));
    for (const e of edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
    for (const n of nodes) { n.deg = adj.get(n).length; n.r = n.tag ? 5 + Math.min(10, Math.sqrt(n.deg) * 1.6) : 4 + Math.min(10, Math.sqrt(n.deg) * 2); n.match = !q || n.t.toLowerCase().includes(q); }
    // positions: reuse, else place near a neighbour or on a ring
    const R = 60 + Math.sqrt(nodes.length) * 14; let i = 0;
    for (const n of nodes) { const p = pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } else { const nb = (adj.get(n) || []).find((o) => pos.has(o.id)); if (nb) { const q2 = pos.get(nb.id); n.x = q2.x + (Math.random() - 0.5) * 40; n.y = q2.y + (Math.random() - 0.5) * 40; } else { const a = i++ * 2.399963; const r = Math.sqrt(i / nodes.length) * R; n.x = Math.cos(a) * r + (Math.random() - 0.5) * 6; n.y = Math.sin(a) * r + (Math.random() - 0.5) * 6; } } }
    const note = nodes.filter((n) => !n.tag).length, tg = nodes.length - note; ui.stats && (ui.stats.textContent = `${note} note${note === 1 ? '' : 's'} · ${edges.filter((e) => !e.k).length} links · ${tg} tag${tg === 1 ? '' : 's'}`);
    ui.empty && ui.empty.classList.toggle('zk-hidden', nodes.length > 0);
  }

  // ------------------------------------------------------------ physics (Barnes-Hut)
  let qx, qy, qm, qc, qn, qx0, qy0, qs, qcount;
  function ensureTree(n) { const cap = n * 4 + 16; if (!qx || qx.length < cap) { qx = new Float32Array(cap); qy = new Float32Array(cap); qm = new Float32Array(cap); qc = new Int32Array(cap * 4); qn = new Int32Array(cap); qx0 = new Float32Array(cap); qy0 = new Float32Array(cap); qs = new Float32Array(cap); } }
  function newCell(x0, y0, s) { const i = qcount++; qx[i] = 0; qy[i] = 0; qm[i] = 0; qn[i] = -1; qx0[i] = x0; qy0[i] = y0; qs[i] = s; qc[i * 4] = qc[i * 4 + 1] = qc[i * 4 + 2] = qc[i * 4 + 3] = -1; return i; }
  function insert(ci, ni, depth) {
    const n = nodes[ni];
    for (;;) {
      const m = qm[ci]; qx[ci] = (qx[ci] * m + n.x) / (m + 1); qy[ci] = (qy[ci] * m + n.y) / (m + 1); qm[ci] = m + 1;
      if (m === 0) { qn[ci] = ni; return; }
      if (qn[ci] >= 0) { // split leaf
        if (depth > 28) return; const oi = qn[ci]; qn[ci] = -1; const o = nodes[oi]; const s2 = qs[ci] / 2; const q = (o.x >= qx0[ci] + s2 ? 1 : 0) + (o.y >= qy0[ci] + s2 ? 2 : 0);
        const c = newCell(qx0[ci] + (q & 1) * s2, qy0[ci] + (q >> 1) * s2, s2); qc[ci * 4 + q] = c; qx[c] = o.x; qy[c] = o.y; qm[c] = 1; qn[c] = oi;
      }
      const s2 = qs[ci] / 2; const q = (n.x >= qx0[ci] + s2 ? 1 : 0) + (n.y >= qy0[ci] + s2 ? 2 : 0); let c = qc[ci * 4 + q];
      if (c < 0) { c = newCell(qx0[ci] + (q & 1) * s2, qy0[ci] + (q >> 1) * s2, s2); qc[ci * 4 + q] = c; }
      ci = c; depth++;
    }
  }
  function repel(ni, k) {
    const n = nodes[ni]; let fx = 0, fy = 0; const stack = [0]; const th2 = 0.81;
    while (stack.length) {
      const ci = stack.pop(); const m = qm[ci]; if (!m) continue; const dx = qx[ci] - n.x, dy = qy[ci] - n.y; const d2 = dx * dx + dy * dy + 30;
      if (qn[ci] >= 0) { if (qn[ci] === ni) continue; const f = (k * m) / d2; const inv = 1 / Math.sqrt(d2); fx -= dx * inv * f; fy -= dy * inv * f; continue; }
      const s = qs[ci]; if ((s * s) / d2 < th2) { const f = (k * m) / d2; const inv = 1 / Math.sqrt(d2); fx -= dx * inv * f; fy -= dy * inv * f; }
      else { const b = ci * 4; for (let j = 0; j < 4; j++) if (qc[b + j] >= 0) stack.push(qc[b + j]); }
    }
    n.vx += fx; n.vy += fy;
  }
  function tick() {
    const n = nodes.length; if (!n) return; ensureTree(n);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9; for (const o of nodes) { if (o.x < minX) minX = o.x; if (o.x > maxX) maxX = o.x; if (o.y < minY) minY = o.y; if (o.y > maxY) maxY = o.y; }
    const size = Math.max(maxX - minX, maxY - minY, 1) + 2; qcount = 0; const root0 = newCell(minX - 1, minY - 1, size); for (let i = 0; i < n; i++) insert(root0, i, 0);
    const a = alpha; const kRep = 520 * a;
    for (let i = 0; i < n; i++) repel(i, kRep);
    for (const e of edges) { const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.01; const rest = e.k ? 70 : 54; const f = (d - rest) * 0.07 * a / d; const fx = dx * f, fy = dy * f; const wa = 1 / (1 + e.a.deg * 0.08), wb = 1 / (1 + e.b.deg * 0.08); e.a.vx += fx * (e.b.deg > e.a.deg ? 1.2 : 0.9) * (0.5 + wa); e.a.vy += fy * (e.b.deg > e.a.deg ? 1.2 : 0.9) * (0.5 + wa); e.b.vx -= fx * (0.5 + wb); e.b.vy -= fy * (0.5 + wb); }
    const gk = 0.012 * a; for (const o of nodes) { const g = o.deg ? gk : gk * 3.5; o.vx -= o.x * g; o.vy -= o.y * g; }
    for (const o of nodes) { if (o === drag?.node) { o.vx = o.vy = 0; continue; } o.vx *= 0.8; o.vy *= 0.8; const sp = Math.hypot(o.vx, o.vy); if (sp > 40) { o.vx *= 40 / sp; o.vy *= 40 / sp; } o.x += o.vx; o.y += o.vy; pos.set(o.id, o); }
    alpha = Math.max(0, alpha * 0.982); ticks++;
  }
  const wake = (a = 0.5) => { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(frame); };

  // ------------------------------------------------------------ view math
  const toWorld = (px, py) => [(px - view.x) / view.s, (py - view.y) / view.s];
  function fit(animate = true) {
    if (!nodes.length) return; let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const n of nodes) { a = Math.min(a, n.x - n.r); c = Math.max(c, n.x + n.r); b = Math.min(b, n.y - n.r); d = Math.max(d, n.y + n.r); }
    const pad = 70; const s = zk.clamp(Math.min((W - pad * 2) / Math.max(c - a, 60), (H - pad * 2) / Math.max(d - b, 60)), 0.05, 2.2);
    tv = { s, x: W / 2 - ((a + c) / 2) * s, y: H / 2 - ((b + d) / 2) * s }; if (!animate || reduced()) view = { ...tv }; wake(0);
  }
  function zoomAt(px, py, f) { const ns = zk.clamp(tv.s * f, 0.04, 6); const k = ns / tv.s; tv = { s: ns, x: px - (px - tv.x) * k, y: py - (py - tv.y) * k }; userMoved = true; wake(0); }
  function centerOn(id) { const n = byId.get(id); if (!n) return; const s = Math.max(tv.s, 1); tv = { s, x: W / 2 - n.x * s, y: H / 2 - n.y * s }; userMoved = true; if (reduced()) view = { ...tv }; wake(0); }

  // ------------------------------------------------------------ drawing
  function readColors() { const cs = getComputedStyle(document.documentElement); const g = (n) => cs.getPropertyValue(n).trim(); col = { fg: g('--fg') || '#111', fg2: g('--fg-2') || '#555', fg3: g('--fg-3') || '#999', line: g('--line-strong') || '#ccc', bg: g('--bg') || '#fff', accent: g('--accent') || '#ffd60a', ink: g('--ink') || '#8a6500', dark: matchMedia('(prefers-color-scheme: dark)').matches }; }
  const nodeColor = (n) => (n.tag ? col.accent : n.hue < 0 ? col.fg3 : `hsl(${n.hue} ${col.dark ? 55 : 50}% ${col.dark ? 62 : 50}%)`);
  function draw() {
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); const { x, y, s } = view; c.save(); c.translate(x, y); c.scale(s, s);
    const hl = hover || (drag && drag.node); const nbs = hl ? new Set([hl, ...(adj.get(hl) || [])]) : null; const q = opts.q.trim(); const x0 = -x / s - 40, y0 = -y / s - 40, x1 = (W - x) / s + 40, y1 = (H - y) / s + 40;
    // edges
    c.lineWidth = 1 / Math.max(s, 0.5); c.strokeStyle = col.line; c.globalAlpha = hl ? 0.18 : Math.min(0.8, 0.35 + s * 0.2); c.beginPath();
    for (const e of edges) { if (hl && (e.a === hl || e.b === hl)) continue; if ((e.a.x < x0 && e.b.x < x0) || (e.a.x > x1 && e.b.x > x1) || (e.a.y < y0 && e.b.y < y0) || (e.a.y > y1 && e.b.y > y1)) continue; c.moveTo(e.a.x, e.a.y); c.lineTo(e.b.x, e.b.y); } c.stroke();
    if (hl) { c.globalAlpha = 0.95; c.lineWidth = 1.6 / Math.max(s, 0.6); c.strokeStyle = col.ink; c.beginPath(); for (const e of edges) if (e.a === hl || e.b === hl) { c.moveTo(e.a.x, e.a.y); c.lineTo(e.b.x, e.b.y); } c.stroke(); }
    // nodes
    for (const n of nodes) {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue; const dim = (hl && !nbs.has(n)) || (q && !n.match); c.globalAlpha = dim ? 0.16 : 1; c.fillStyle = nodeColor(n);
      c.beginPath(); if (n.tag) { const r = n.r; c.moveTo(n.x, n.y - r * 1.2); c.lineTo(n.x + r * 1.1, n.y); c.lineTo(n.x, n.y + r * 1.2); c.lineTo(n.x - r * 1.1, n.y); c.closePath(); } else c.arc(n.x, n.y, n.r, 0, 6.2832); c.fill();
      if (n.m && n.m.p) { c.lineWidth = 1.5 / s; c.strokeStyle = col.ink; c.globalAlpha = dim ? 0.2 : 0.9; c.beginPath(); c.arc(n.x, n.y, n.r + 2.5 / s, 0, 6.2832); c.stroke(); }
      if (n.id === S.cur) { c.globalAlpha = 1; c.lineWidth = 2.2 / s; c.strokeStyle = col.fg; c.beginPath(); c.arc(n.x, n.y, n.r + 4 / s, 0, 6.2832); c.stroke(); }
    }
    // labels with simple collision culling
    c.globalAlpha = 1; const fs = 11.5 / Math.max(s, 0.55); c.font = `${n_(fs)}px ${getComputedStyle(document.body).fontFamily}`; c.textBaseline = 'middle'; const taken = []; const cand = nodes.filter((n) => n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1 && (s > 0.75 || n.r > 7 || (hl && nbs.has(n)) || (q && n.match))).sort((a, b) => (b === hl) - (a === hl) || b.deg - a.deg);
    let drawn = 0; for (const n of cand) {
      if (drawn > 260) break; const isNb = hl && nbs.has(n); if (hl && !isNb) continue; const w = c.measureText(n.t).width, h = fs * 1.2; const lx = n.x + n.r + 4 / s, ly = n.y; let hit = false;
      if (n !== hl) for (const t of taken) if (lx < t[2] && lx + w > t[0] && ly - h / 2 < t[3] && ly + h / 2 > t[1]) { hit = true; break; } if (hit) continue;
      taken.push([lx, ly - h / 2, lx + w, ly + h / 2]); drawn++; c.fillStyle = n === hl || n.id === S.cur ? col.fg : col.fg2; c.fillText(n.t, lx, ly);
    }
    c.restore();
  }
  const n_ = (v) => Math.round(v * 10) / 10;
  function frame() {
    raf = 0; if (!open) return;
    if (alpha > 0.012) { const per = nodes.length > 1200 ? 2 : 3; for (let i = 0; i < per; i++) tick(); if (!userMoved && ticks % 6 === 0) fit(true); }
    // eased view + momentum
    if (pan && pan.moved === false) { /* idle */ }
    if (!pan && (Math.abs(vel.x) > 0.05 || Math.abs(vel.y) > 0.05)) { tv.x += vel.x; tv.y += vel.y; view.x += vel.x; view.y += vel.y; vel.x *= 0.93; vel.y *= 0.93; }
    const k = reduced() ? 1 : 0.22; view.s += (tv.s - view.s) * k; view.x += (tv.x - view.x) * k; view.y += (tv.y - view.y) * k;
    const settling = Math.abs(tv.s - view.s) > 0.0005 || Math.abs(tv.x - view.x) > 0.05 || Math.abs(tv.y - view.y) > 0.05 || Math.abs(vel.x) > 0.05 || Math.abs(vel.y) > 0.05;
    draw(); if (alpha > 0.012 || settling || drag || pan) raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ interaction
  function pick(px, py) { const [wx, wy] = toWorld(px, py); let best = null, bd = 1e9; const slack = 3 / view.s; for (const n of nodes) { const dx = n.x - wx, dy = n.y - wy; const d = Math.sqrt(dx * dx + dy * dy) - n.r; if (d < slack && d < bd) { bd = d; best = n; } } return best; }
  const rect = () => cv.getBoundingClientRect();
  function setHover(n, px, py) {
    if (hover !== n) { hover = n; cv.style.cursor = n ? 'pointer' : drag || pan ? 'grabbing' : 'grab'; wake(0); }
    if (!n) { card.classList.add('zk-hidden'); return; }
    const m = n.m; card.textContent = ''; card.classList.remove('zk-hidden');
    if (n.tag) card.append(zk.el('.gt', '#' + n.t.slice(1)), zk.el('.gs', `${n.deg} note${n.deg === 1 ? '' : 's'} · click to filter the list`));
    else card.append(zk.el('.gt', n.t), zk.el('.gs', m.l ? 'Locked note' : m.s || 'No additional text'), zk.el('.gm', (m.f && A.folderById(m.f) ? A.folderPath(m.f) + ' · ' : '') + U.shortDate(m.m) + ' · ' + n.deg + (n.deg === 1 ? ' connection' : ' connections')), (m.tg || []).length ? zk.el('.gtags', ...(m.tg || []).slice(0, 5).map((t) => '#' + t + '  ')) : null);
    const w = card.offsetWidth, h = card.offsetHeight; const sx = n.x * view.s + view.x, sy = n.y * view.s + view.y; let left = sx + n.r * view.s + 12, top = sy - h / 2; if (left + w > W - 8) left = sx - n.r * view.s - 12 - w; top = zk.clamp(top, 8, H - h - 8); card.style.left = Math.max(8, left) + 'px'; card.style.top = top + 'px';
  }
  function bind() {
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; cv.setPointerCapture(e.pointerId); const r = rect(), px = e.clientX - r.left, py = e.clientY - r.top; const n = pick(px, py); vel = { x: 0, y: 0 };
      if (n) { drag = { node: n, x0: px, y0: py, moved: false }; const [wx, wy] = toWorld(px, py); drag.ox = n.x - wx; drag.oy = n.y - wy; wake(0.35); }
      else { pan = { x: px, y: py, moved: false, hist: [[performance.now(), px, py]] }; cv.style.cursor = 'grabbing'; wake(0); }
      card.classList.add('zk-hidden');
    });
    cv.addEventListener('pointermove', (e) => {
      const r = rect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag) { if (Math.hypot(px - drag.x0, py - drag.y0) > 3) drag.moved = true; const [wx, wy] = toWorld(px, py); drag.node.x = wx + drag.ox; drag.node.y = wy + drag.oy; drag.node.vx = drag.node.vy = 0; alpha = Math.max(alpha, 0.25); wake(0.25); return; }
      if (pan) { const dx = px - pan.x, dy = py - pan.y; if (Math.hypot(dx, dy) > 2) pan.moved = true; tv.x += dx; tv.y += dy; view.x += dx; view.y += dy; pan.x = px; pan.y = py; userMoved = true; pan.hist.push([performance.now(), px, py]); if (pan.hist.length > 5) pan.hist.shift(); wake(0); return; }
      setHover(pick(px, py), px, py);
    });
    const up = (e) => {
      if (drag) { const d = drag; drag = null; if (!d.moved) openNode(d.node, e); else { cv.style.cursor = 'grab'; } wake(0.2); }
      if (pan) { const h = pan.hist; if (pan.moved && h.length > 1 && !reduced()) { const a = h[0], b = h[h.length - 1]; const dt = Math.max(1, b[0] - a[0]); if (performance.now() - b[0] < 80) { vel = { x: ((b[1] - a[1]) / dt) * 16, y: ((b[2] - a[2]) / dt) * 16 }; } } pan = null; cv.style.cursor = 'grab'; wake(0); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { drag = null; pan = null; });
    cv.addEventListener('pointerleave', () => { if (!drag && !pan) setHover(null); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const r = rect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
      if (e.ctrlKey || e.metaKey || mouse) zoomAt(px, py, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : mouse ? 0.0016 : 0.004)));
      else { tv.x -= e.deltaX; tv.y -= e.deltaY; view.x -= e.deltaX; view.y -= e.deltaY; userMoved = true; wake(0); }
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { if (!pick(e.clientX - rect().left, e.clientY - rect().top)) { const r = rect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); } });
    cv.addEventListener('keydown', (e) => { if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.3); else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.3); else if (e.key === '0') { userMoved = false; fit(true); } else if (e.key.startsWith('Arrow')) { const d = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; tv.x += d[0]; tv.y += d[1]; userMoved = true; wake(0); e.preventDefault(); } });
  }
  async function openNode(n, e) {
    if (n.tag) { close(); await A.setView({ kind: 'tag', id: n.t.slice(1) }); return; }
    close(); await A.goToNote(n.id);
  }

  // ------------------------------------------------------------ UI shell
  function resize() { const r = cv.parentElement.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(160, r.height - bar.offsetHeight); dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; if (!userMoved) { fit(false); } draw(); }
  function make() {
    root = zk.el('div.zk-hidden', { id: 'graph', role: 'region', 'aria-label': 'Link graph' }); bar = zk.el('.gbar');
    const sel = (cls, label) => zk.el('select.zk-select.' + cls, { 'aria-label': label });
    ui.folder = sel('gsel', 'Filter by folder'); ui.tag = sel('gsel', 'Filter by tag');
    const tog = (key, label, icon) => { const b = zk.el('button.zk-btn.gtog', { type: 'button', 'aria-pressed': String(!!opts[key]), title: label, onclick: () => { opts[key] = !opts[key]; b.setAttribute('aria-pressed', opts[key]); if (key === 'local') ui.depth.classList.toggle('zk-hidden', !opts.local); rebuild(); } }, icon ? zk.icon(icon) : null, label); return b; };
    ui.depth = zk.el('.zk-seg.zk-hidden', ...[1, 2, 3].map((d) => zk.el('button', { type: 'button', 'aria-pressed': String(d === opts.depth), 'aria-label': d + ' hop' + (d > 1 ? 's' : ''), onclick: (e) => { opts.depth = d; [...ui.depth.children].forEach((c, i) => c.setAttribute('aria-pressed', i === d - 1)); rebuild(); } }, String(d))));
    ui.q = zk.el('input.zk-input.selectable', { type: 'search', placeholder: 'Find in graph', 'aria-label': 'Find in graph', style: { width: '150px' } }); ui.q.addEventListener('input', () => { opts.q = ui.q.value; build(); wake(0.0); draw(); }); ui.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const m = nodes.find((n) => n.match && !n.tag); if (m && opts.q) { centerOn(m.id); } } else if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    ui.folder.addEventListener('change', () => { opts.folder = ui.folder.value; rebuild(); }); ui.tag.addEventListener('change', () => { opts.tag = ui.tag.value; rebuild(); });
    ui.stats = zk.el('span.zk-label.gstats');
    const iconBtn = (icon, title, fn) => zk.btn({ icon, title, onClick: fn });
    bar.append(zk.el('.gtitle', zk.icon('graph'), 'Link Graph'), ui.folder, ui.tag, tog('tags', 'Tags', 'hash'), tog('orphans', 'Unlinked'), tog('local', 'Around this note', 'locate'), ui.depth, zk.el('.zk-spacer'), ui.q, zk.el('.zk-group', iconBtn('zoom-out', 'Zoom out', () => zoomAt(W / 2, H / 2, 1 / 1.3)), iconBtn('zoom-in', 'Zoom in', () => zoomAt(W / 2, H / 2, 1.3)), iconBtn('maximize', 'Fit to window', () => { userMoved = false; fit(true); }), iconBtn('crosshair', 'Center on current note', () => centerOn(S.cur))), iconBtn('x', 'Close (Esc)', close));
    cv = zk.el('canvas.gcv', { tabindex: 0, 'aria-label': 'Interactive map of linked notes. Drag to pan, scroll or pinch to zoom, click a note to open it.' }); ctx = cv.getContext('2d'); card = zk.el('.gcard.zk-hidden');
    ui.empty = zk.el('.zk-empty.zk-hidden', { style: { position: 'absolute', inset: '48px 0 0 0', pointerEvents: 'none' } }, zk.el('strong', 'Nothing to show'), zk.el('span', 'Link notes with [[double brackets]] or add #tags and they appear here.'));
    root.append(bar, cv, card, ui.empty, zk.el('.glegend', ui.stats, zk.el('span.zk-label', '◆ tag  ·  ring = pinned  ·  colour = folder'))); document.getElementById('main').append(root); bind();
    ro = new ResizeObserver(() => open && resize()); ro.observe(root);
    addEventListener('keydown', (e) => { if (open && e.key === 'Escape' && !document.querySelector('.zk-scrim,.zk-pop')) { e.preventDefault(); close(); } }, true);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); open && draw(); });
  }
  function fillSelects() {
    ui.folder.textContent = ''; ui.folder.append(zk.el('option', { value: '' }, 'All folders')); for (const { f, depth } of A.flatFolders()) ui.folder.append(zk.el('option', { value: f.id }, ' '.repeat(depth) + f.name)); ui.folder.value = opts.folder;
    const tags = new Set(); for (const m of Object.values(M())) if (!m.d) for (const t of m.tg || []) tags.add(t); ui.tag.textContent = ''; ui.tag.append(zk.el('option', { value: '' }, 'All tags')); [...tags].sort().forEach((t) => ui.tag.append(zk.el('option', { value: t }, '#' + t))); ui.tag.value = tags.has(opts.tag) ? opts.tag : (opts.tag = '');
  }
  function rebuild() { build(); alpha = Math.max(alpha, 0.7); ticks = 0; if (!userMoved) fit(false); wake(0.7); }
  function openG() {
    if (!root) make(); if (open) return; open = true; readColors(); root.classList.remove('zk-hidden'); fillSelects(); ui.q.value = opts.q = ''; userMoved = false; alpha = 1; ticks = 0; view = { x: W / 2 || 400, y: H / 2 || 300, s: 0.6 }; tv = { ...view };
    build(); resize(); if (reduced()) { const n = Math.min(260, 60 + nodes.length / 4); for (let i = 0; i < n; i++) { alpha = Math.max(0.02, alpha); tick(); } alpha = 0; fit(false); } else { for (let i = 0; i < 40; i++) tick(); fit(false); }
    wake(1); cv.focus(); zeng.refreshMenus && zeng.refreshMenus(); document.getElementById('app').classList.add('graph-open');
  }
  function close() { if (!open) return; open = false; root.classList.add('zk-hidden'); cancelAnimationFrame(raf); raf = 0; card.classList.add('zk-hidden'); document.getElementById('app').classList.remove('graph-open'); zeng.refreshMenus && zeng.refreshMenus(); }
  G.open = openG; G.close = close; G.toggle = () => (open ? close() : openG()); G.isOpen = () => open;
  // test hooks
  G._stats = () => ({ nodes: nodes.length, edges: edges.length, alpha, ticks, scale: view.s });
  G._bench = (n = 60) => { const t = performance.now(); for (let i = 0; i < n; i++) tick(); const t1 = performance.now(); for (let i = 0; i < n; i++) draw(); return { tick: (t1 - t) / n, draw: (performance.now() - t1) / n }; };
})();
