/* Inline sketch blocks: pen / marker / highlighter / eraser / lasso on a canvas, pointer-event smoothing.
   Strokes live in the block's data-strokes attribute (JSON) in logical units (block width = 1000). */
(() => {
  const U = N.u; const SK = (N.sketch = {});
  const LW = 1000;
  const PALETTE = ['auto', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de'];
  const TOOLS = [['pen', 'pen-line', 'Pen'], ['marker', 'paintbrush', 'Marker'], ['hl', 'highlighter', 'Highlighter'], ['eraser', 'eraser', 'Eraser'], ['lasso', 'lasso-select', 'Lasso']];
  const BASE_W = { pen: 2.4, marker: 6, hl: 20 }; const SIZES = [0.6, 1, 1.9];
  SK.state = { tool: 'pen', color: 'auto', size: 1 };
  SK.newHtml = () => '<div class="sketch" data-h="320" data-strokes="[]"></div>';

  const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.filter((k) => k && Array.isArray(k.p)) : []; } catch { return []; } };
  const round = (v) => Math.round(v * 10) / 10;

  // Draw a stroke path with quadratic smoothing through midpoints.
  function path(ctx, p, s) {
    const n = p.length / 2; if (!n) return;
    ctx.beginPath(); ctx.moveTo(p[0] * s, p[1] * s);
    if (n === 1) { ctx.lineTo(p[0] * s + 0.01, p[1] * s); return; }
    for (let i = 1; i < n - 1; i++) { const mx = (p[i * 2] + p[i * 2 + 2]) / 2 * s, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2 * s; ctx.quadraticCurveTo(p[i * 2] * s, p[i * 2 + 1] * s, mx, my); }
    ctx.lineTo(p[(n - 1) * 2] * s, p[(n - 1) * 2 + 1] * s);
  }
  function drawStroke(ctx, k, s, autoColor, dx = 0, dy = 0) {
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    const col = k.c === 'auto' || !k.c ? autoColor : k.c;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, k.w * s);
    if (k.k === 'hl') { ctx.globalAlpha = 0.38; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; }
    if (dx || dy) ctx.translate(dx * s, dy * s);
    path(ctx, k.p, s); ctx.stroke(); ctx.restore();
  }
  SK.renderPNG = async (strokes, h, { width = 1600, bg = '#ffffff', ink = '#1d1d1f' } = {}) => {
    const s = width / LW; const cv = document.createElement('canvas'); cv.width = width; cv.height = Math.round(h * s); const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); for (const k of strokes) drawStroke(c, k, s, ink);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer());
  };
  SK.strokesOf = (el) => parse(el.dataset.strokes);
  SK.thumb = (el) => { try { const cv = el.querySelector('canvas'); if (!cv || !cv.width) return null; const t = document.createElement('canvas'); t.width = t.height = 112; const c = t.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 112, 112); const s = Math.min(112 / cv.width, 112 / cv.height); const strokes = parse(el.dataset.strokes); const ink = '#1d1d1f'; const k = 112 / LW; for (const st of strokes) drawStroke(c, st, k, ink); return strokes.length ? t.toDataURL('image/jpeg', 0.7) : null; } catch { return null; } };

  function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length / 2 - 1; i < poly.length / 2; j = i++) { const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  function bbox(k) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < k.p.length; i += 2) { a = Math.min(a, k.p[i]); c = Math.max(c, k.p[i]); b = Math.min(b, k.p[i + 1]); d = Math.max(d, k.p[i + 1]); } const m = k.w / 2; return [a - m, b - m, c + m, d + m]; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const x = ax + t * dx, y = ay + t * dy; return Math.hypot(px - x, py - y); }
  function hits(k, x, y, r) {
    const b = bbox(k); if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
    const p = k.p; if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= r + k.w / 2;
    for (let i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r + k.w / 2) return true; return false;
  }

  // mount(el, {commit()}) – builds UI inside a .sketch element. Safe to call again after re-hydration.
  SK.mount = (el, api) => {
    el.setAttribute('contenteditable', 'false'); const wasActive = el.classList.contains('active'); el.textContent = '';
    let strokes = parse(el.dataset.strokes); let H = Math.max(120, Math.min(2400, +el.dataset.h || 320));
    const ui = U && document.createElement('div'); ui.className = 'sk-ui'; ui.setAttribute('contenteditable', 'false');
    const cv = document.createElement('canvas'); cv.tabIndex = 0; cv.setAttribute('aria-label', 'Sketch'); cv.className = 'sk-cv';
    const grip = document.createElement('div'); grip.className = 'sk-grip'; grip.title = 'Drag to resize';
    el.append(ui, cv, grip);
    const base = document.createElement('canvas'); let scale = 1, dpr = 1, ink = '#1d1d1f';
    let sel = new Set(), selBox = null, cur = null, lasso = null, moving = null, erasing = null;

    const mk = (tag, cls, attrs, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k in attrs || {}) e.setAttribute(k, attrs[k]); e.append(...kids); return e; };
    const buildUI = () => {
      ui.textContent = '';
      const g1 = mk('div', 'sk-g'); TOOLS.forEach(([id, ic, label]) => { const b = mk('button', 'sk-b' + (SK.state.tool === id ? ' on' : ''), { type: 'button', title: label, 'aria-label': label, 'aria-pressed': SK.state.tool === id }); b.append(zk.icon(ic)); b.onpointerdown = (e) => e.preventDefault(); b.onclick = () => { SK.state.tool = id; if (id !== 'lasso') clearSel(); buildUI(); cv.style.cursor = id === 'eraser' ? 'cell' : 'crosshair'; }; g1.append(b); });
      const g2 = mk('div', 'sk-g'); PALETTE.forEach((c) => { const b = mk('button', 'sk-sw' + (SK.state.color === c ? ' on' : ''), { type: 'button', title: c === 'auto' ? 'Black / White' : c, 'aria-label': 'Ink ' + c }); b.style.setProperty('--c', c === 'auto' ? 'var(--fg)' : c); b.onpointerdown = (e) => e.preventDefault(); b.onclick = () => { SK.state.color = c; if (sel.size) { sel.forEach((k) => { k.c = c; }); rebuild(); save(); } buildUI(); }; g2.append(b); });
      const g3 = mk('div', 'sk-g'); SIZES.forEach((z, i) => { const b = mk('button', 'sk-sz' + (SK.state.size === z ? ' on' : ''), { type: 'button', title: ['Thin', 'Medium', 'Thick'][i], 'aria-label': ['Thin', 'Medium', 'Thick'][i] }); b.append(mk('i', '', { style: `width:${4 + i * 3}px;height:${4 + i * 3}px` })); b.onpointerdown = (e) => e.preventDefault(); b.onclick = () => { SK.state.size = z; buildUI(); }; g3.append(b); });
      const g4 = mk('div', 'sk-g'); const del = mk('button', 'sk-b', { type: 'button', title: sel.size ? 'Delete selection' : 'Clear sketch', 'aria-label': sel.size ? 'Delete selection' : 'Clear sketch' }); del.append(zk.icon('trash-2')); del.onpointerdown = (e) => e.preventDefault();
      del.onclick = () => { if (sel.size) { strokes = strokes.filter((k) => !sel.has(k)); clearSel(); } else { if (!strokes.length) { el.remove(); api.commit(); return; } strokes = []; } rebuild(); save(); buildUI(); };
      g4.append(del); ui.append(g1, g2, g3, g4);
    };
    function clearSel() { sel = new Set(); selBox = null; draw(); }
    function save() { el.dataset.strokes = JSON.stringify(strokes.map((k) => ({ k: k.k, c: k.c, w: k.w, p: k.p.map(round) }))); el.dataset.h = String(Math.round(H)); api.commit(); }

    function resize() {
      const w = Math.max(80, el.clientWidth); dpr = Math.min(2, window.devicePixelRatio || 1); scale = w / LW;
      cv.style.height = Math.round(H * scale) + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(H * scale * dpr);
      base.width = cv.width; base.height = cv.height; ink = getComputedStyle(el).color || '#000'; rebuild();
    }
    function rebuild() { const c = base.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, base.width, base.height); const s = scale * dpr; for (const k of strokes) if (!(moving && sel.has(k))) drawStroke(c, k, s, ink); draw(); }
    function draw() {
      const c = cv.getContext('2d'); const s = scale * dpr; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(base, 0, 0);
      if (moving) for (const k of sel) drawStroke(c, k, s, ink, moving.dx, moving.dy);
      if (cur) drawStroke(c, cur, s, ink);
      if (lasso && lasso.length > 3) { c.save(); c.setLineDash([6, 5]); c.lineWidth = 1.5; c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#0a84ff'; c.beginPath(); for (let i = 0; i < lasso.length; i += 2) c[i ? 'lineTo' : 'moveTo'](lasso[i] * s, lasso[i + 1] * s); c.closePath(); c.stroke(); c.restore(); }
      if (sel.size && selBox) { const [a, b, d, e] = selBox; const ox = moving ? moving.dx : 0, oy = moving ? moving.dy : 0; c.save(); c.setLineDash([5, 4]); c.lineWidth = 1.2; c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#0a84ff'; c.strokeRect((a + ox) * s, (b + oy) * s, (d - a) * s, (e - b) * s); c.restore(); }
    }
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };

    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); cv.focus({ preventScroll: true }); document.querySelectorAll('.sketch.active').forEach((x) => x !== el && x.classList.remove('active')); el.classList.add('active');
      cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); const t = SK.state.tool;
      if (t === 'lasso') {
        if (sel.size && selBox && x >= selBox[0] && x <= selBox[2] && y >= selBox[1] && y <= selBox[3]) { moving = { x0: x, y0: y, dx: 0, dy: 0 }; rebuild(); return; }
        sel = new Set(); selBox = null; lasso = [x, y]; buildUI(); return;
      }
      if (t === 'eraser') { erasing = { gone: [] }; eraseAt(x, y); return; }
      const w = BASE_W[t] * SK.state.size; cur = { k: t, c: SK.state.color, w, p: [x, y] }; draw();
    });
    function eraseAt(x, y) { const r = 6 + 4 * SK.state.size; const keep = []; let ch = false; for (const k of strokes) { if (hits(k, x, y, r)) { erasing.gone.push(k); ch = true; } else keep.push(k); } if (ch) { strokes = keep; rebuild(); } }
    cv.addEventListener('pointermove', (e) => {
      if (!cv.hasPointerCapture(e.pointerId)) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs.push(e);
      for (const ev of evs) {
        const [x, y] = pt(ev);
        if (cur) { const p = cur.p; const lx = p[p.length - 2], ly = p[p.length - 1]; if (Math.hypot(x - lx, y - ly) < 0.9) continue; const a = 0.6; p.push(lx + (x - lx) * a + 0, ly + (y - ly) * a + 0); }
        else if (lasso) lasso.push(x, y);
        else if (moving) { moving.dx = x - moving.x0; moving.dy = y - moving.y0; }
        else if (erasing) eraseAt(x, y);
      }
      draw();
    });
    const finish = (e) => {
      if (cur) { // keep final raw point for crisp end
        const [x, y] = e && e.clientX != null ? pt(e) : [0, 0]; if (e && cur.p.length > 2) { cur.p.push(x, y); } strokes.push(cur); const c = base.getContext('2d'); drawStroke(c, cur, scale * dpr, ink); cur = null; draw(); save();
      } else if (lasso) {
        const poly = lasso; lasso = null; sel = new Set();
        if (poly.length > 6) for (const k of strokes) { let inside = 0; const n = k.p.length / 2; for (let i = 0; i < n; i++) if (inPoly(k.p[i * 2], k.p[i * 2 + 1], poly)) inside++; if (inside >= n * 0.5) sel.add(k); }
        selBox = null; if (sel.size) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; sel.forEach((k) => { const bb = bbox(k); a = Math.min(a, bb[0]); b = Math.min(b, bb[1]); c = Math.max(c, bb[2]); d = Math.max(d, bb[3]); }); selBox = [a - 4, b - 4, c + 4, d + 4]; } buildUI(); draw();
      } else if (moving) {
        const { dx, dy } = moving; moving = null; if (Math.abs(dx) + Math.abs(dy) > 0.5) { sel.forEach((k) => { for (let i = 0; i < k.p.length; i += 2) { k.p[i] += dx; k.p[i + 1] += dy; } }); selBox = [selBox[0] + dx, selBox[1] + dy, selBox[2] + dx, selBox[3] + dy]; save(); } rebuild();
      } else if (erasing) { const g = erasing.gone.length; erasing = null; if (g) save(); }
    };
    cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', () => finish(null));
    cv.addEventListener('keydown', (e) => { if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) { e.preventDefault(); e.stopPropagation(); strokes = strokes.filter((k) => !sel.has(k)); clearSel(); rebuild(); save(); buildUI(); } else if (e.key === 'Escape') { clearSel(); } });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = H;
      const mv = (ev) => { H = Math.max(120, Math.min(2400, h0 + (ev.clientY - y0) / scale)); cv.style.height = Math.round(H * scale) + 'px'; const nh = Math.round(H * scale * dpr); if (cv.height !== nh) { cv.height = nh; base.height = nh; rebuild(); } };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); save(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    el.addEventListener('pointerdown', () => { document.querySelectorAll('.sketch.active').forEach((x) => x !== el && x.classList.remove('active')); el.classList.add('active'); });
    buildUI(); cv.style.cursor = SK.state.tool === 'eraser' ? 'cell' : 'crosshair';
    const ro = new ResizeObserver(() => { if (el.clientWidth) resize(); }); ro.observe(el); el._sk = { ro, refresh: () => { ink = getComputedStyle(el).color; rebuild(); } };
    resize();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => document.querySelectorAll('.sketch').forEach((s) => s._sk && s._sk.refresh()));
})();
