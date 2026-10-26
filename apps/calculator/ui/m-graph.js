/* Graphing mode: up to 6 functions of x with sliders a, b, c; pan/zoom with momentum, trace, roots/extrema/intersections, table. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const COLORS = ['#0a84ff', '#ff453a', '#30d158', '#bf5af2', '#ff9f0a', '#40c8e0'];
  const MAX_FN = 6;
  const nice = (x) => { if (!isFinite(x)) return '—'; if (Math.abs(x) < 1e-12) return '0'; let s = Number(x.toPrecision(7)); const a = Math.abs(s); return (a >= 1e9 || a < 1e-5 ? s.toExponential().replace('e+', 'e') : s.toLocaleString(undefined, { maximumFractionDigits: 10, useGrouping: false })); };

  window.ZM.graph = function (H, root) {
    root.classList.add('zc-graph'); root.replaceChildren();
    const st = { fns: [{ expr: 'x^2', on: true }, { expr: 'sin(x)', on: true }], params: { a: 1, b: 1, c: 1 }, cx: 0, cy: 0, scale: 40, angle: 'rad', tx: 0, tstep: 1, trace: null };
    let compiled = [], pois = [], poiTimer = 0, raf = 0, active = 0, tableOpen = false;

    // ---------------- DOM
    const fnBox = zk.el('.zc-g-fns', { role: 'list', 'aria-label': 'Functions' });
    const addBtn = zk.el('button.zc-btn', { type: 'button', onclick: () => { if (st.fns.length < MAX_FN) { st.fns.push({ expr: '', on: true }); buildFns(); const ins = fnBox.querySelectorAll('input'); ins[ins.length - 1].focus(); } } }, 'Add function');
    const params = zk.el('.zc-params'); const side = zk.el('.zc-g-side', fnBox, zk.el('div', { style: 'padding:.4rem .5rem' }, addBtn), params);
    const canvas = zk.el('canvas', { 'aria-label': 'Graph. Drag to pan, scroll to zoom, click to trace. Arrow keys pan.', role: 'img' });
    const wrap = zk.el('.zc-canvas-wrap', { tabindex: 0 }, canvas);
    const tools = zk.el('.zc-g-tools', zk.el('button.zk-btn.icon', { 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => zoomBy(1.6) }, zk.icon('plus')), zk.el('button.zk-btn.icon', { 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => zoomBy(1 / 1.6) }, zk.icon('minus')),
      zk.el('button.zk-btn.icon', { 'aria-label': 'Reset view', title: 'Reset view', onclick: () => resetView() }, zk.icon('locate')), zk.el('button.zk-btn.icon', { 'aria-label': 'Table of values', title: 'Table of values', onclick: () => toggleTable() }, zk.icon('table')));
    wrap.append(tools);
    const info = zk.el('.zc-g-info', { role: 'status', 'aria-live': 'polite' });
    const tableEl = zk.el('.zc-g-table', { hidden: true });
    const main = zk.el('.zc-g-main', wrap, info, tableEl);
    root.append(side, main);
    const ctx = canvas.getContext('2d'); let W = 0, Hh = 0, dpr = 1;

    // ---------------- functions
    function compileAll() {
      compiled = st.fns.map((f) => {
        let src = f.expr.trim(); if (!src) return { ok: false, empty: true };
        src = src.replace(/^\s*(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)|h\s*\(\s*x\s*\))\s*=\s*/i, '');
        if (/=/.test(src)) return { ok: false, err: 'Write the function as y = f(x)' };
        try { const ast = C.parse(src, { freeVars: ['x', 'a', 'b', 'c'] }); const fn = C.compileNum(ast, { angle: st.angle }); fn({ x: 1, a: 1, b: 1, c: 1 }); return { ok: true, fn, uses: new Set((src.match(/\b[abc]\b/g) || [])) }; }
        catch (e) { return { ok: false, err: e.message }; }
      });
    }
    const env = (x) => ({ x, a: st.params.a, b: st.params.b, c: st.params.c });
    const val = (i, x) => { const c = compiled[i]; if (!c || !c.ok) return NaN; try { const y = c.fn(env(x)); return typeof y === 'number' ? y : NaN; } catch (e) { return NaN; } };
    function buildFns() {
      fnBox.replaceChildren();
      st.fns.forEach((f, i) => {
        const dot = zk.el('button.dot' + (f.on ? '' : '.off'), { type: 'button', style: 'background:' + COLORS[i], 'aria-label': (f.on ? 'Hide' : 'Show') + ' function ' + (i + 1), 'aria-pressed': f.on, onclick: () => { f.on = !f.on; dot.classList.toggle('off', !f.on); changed(); } });
        const inp = zk.el('input.zc-input.selectable', { value: f.expr, placeholder: i ? 'y = …' : 'y = f(x)', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Function ' + (i + 1) });
        inp.addEventListener('input', () => { f.expr = inp.value; active = i; changed(true); markBad(); });
        inp.addEventListener('focus', () => { active = i; });
        const rm = zk.el('button.zk-btn.icon', { type: 'button', 'aria-label': 'Remove function ' + (i + 1), title: 'Remove', onclick: () => { if (st.fns.length > 1) st.fns.splice(i, 1); else f.expr = ''; buildFns(); changed(); } }, zk.icon('x'));
        fnBox.append(zk.el('.zc-fn-row', { role: 'listitem' }, dot, inp, rm));
      });
      addBtn.disabled = st.fns.length >= MAX_FN; markBad();
    }
    function markBad() { compileAll(); fnBox.querySelectorAll('.zc-fn-row').forEach((row, i) => { const c = compiled[i]; const inp = row.querySelector('input'); const bad = c && !c.ok && !c.empty; inp.classList.toggle('bad', !!bad); inp.title = bad ? c.err : ''; }); }
    function buildParams() {
      params.replaceChildren(zk.el('.zc-label', 'Sliders'));
      for (const p of ['a', 'b', 'c']) {
        const r = zk.el('input.zk-range', { type: 'range', min: -10, max: 10, step: 0.1, value: st.params[p], 'aria-label': 'Parameter ' + p }); const n = zk.el('input.zc-input', { type: 'number', step: 0.1, value: st.params[p], 'aria-label': 'Value of ' + p });
        r.style.setProperty('width', '100%'); const set = (v) => { if (!isFinite(v)) return; st.params[p] = v; changed(); };
        r.addEventListener('input', () => { n.value = r.value; set(+r.value); }); n.addEventListener('input', () => { r.value = n.value; set(+n.value); });
        params.append(zk.el('.zc-param', zk.el('span', { style: 'font-style:italic;font-family:serif' }, p), r, n));
      }
    }
    // ---------------- view math
    const toX = (px) => st.cx + (px - W / 2) / st.scale, toY = (py) => st.cy - (py - Hh / 2) / st.scale;
    const sx = (x) => (x - st.cx) * st.scale + W / 2, sy = (y) => Hh / 2 - (y - st.cy) * st.scale;
    const clampScale = (s) => Math.min(1e7, Math.max(1e-4, s));
    function zoomAt(f, px, py) { const wx = toX(px), wy = toY(py); st.scale = clampScale(st.scale * f); st.cx = wx - (px - W / 2) / st.scale; st.cy = wy + (py - Hh / 2) / st.scale; changed(false, true); }
    let zs = null;
    function zoomBy(f) {
      const target = clampScale((zs ? zs.target : st.scale) * f); if (zs) { zs.target = target; zs.sp.retarget(Math.log(target)); return; }
      zs = { target, sp: zk.spring({ from: Math.log(st.scale), to: Math.log(target), response: 0.32, eps: 0.0005, onUpdate: (l) => { const s = Math.exp(l); const wx = st.cx, wy = st.cy; st.scale = clampScale(s); st.cx = wx; st.cy = wy; changed(false, true); }, onDone: () => { zs = null; } }) };
    }
    function resetView() { stopInertia(); const t = { cx: 0, cy: 0, scale: 40 }; const f = { cx: st.cx, cy: st.cy, l: Math.log(st.scale) }; if (zk.reducedMotion()) { Object.assign(st, t); changed(false, true); return; }
      let p = 0; zk.spring({ from: 0, to: 1, response: 0.4, onUpdate: (u) => { p = u; st.cx = f.cx + (t.cx - f.cx) * u; st.cy = f.cy + (t.cy - f.cy) * u; st.scale = Math.exp(f.l + (Math.log(t.scale) - f.l) * u); changed(false, true); } }); }
    // ---------------- drawing
    function gridStep() { const target = 70 / st.scale; const p = Math.pow(10, Math.floor(Math.log10(target))); const m = target / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
    const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    function draw() {
      raf = 0; if (!W || !Hh) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#fff'; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);
      const grid = cssv('--zc-grid'), axis = cssv('--zc-axis'), txt = cssv('--zc-sub') || '#888';
      const step = gridStep(), minor = step / 5; const x0 = toX(0), x1 = toX(W), yTop = toY(0), yBot = toY(Hh);
      const lines = (st2, a, b, vertical, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); for (let v = Math.ceil(a / st2) * st2, n = 0; v <= b && n < 400; v += st2, n++) { const p = vertical ? Math.round(sx(v)) + 0.5 : Math.round(sy(v)) + 0.5; if (vertical) { ctx.moveTo(p, 0); ctx.lineTo(p, Hh); } else { ctx.moveTo(0, p); ctx.lineTo(W, p); } } ctx.stroke(); };
      if (minor * st.scale >= 11) { lines(minor, x0, x1, true, grid, 0.5); lines(minor, yBot, yTop, false, grid, 0.5); }
      ctx.globalAlpha = 1; lines(step, x0, x1, true, axis.replace(/[\d.]+\)$/, '0.22)'), 1); lines(step, yBot, yTop, false, axis.replace(/[\d.]+\)$/, '0.22)'), 1);
      // axes
      const ax = Math.min(Math.max(sx(0), 0), W), ay = Math.min(Math.max(sy(0), 0), Hh); ctx.strokeStyle = axis; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, Math.round(ay) + 0.5); ctx.lineTo(W, Math.round(ay) + 0.5); ctx.moveTo(Math.round(ax) + 0.5, 0); ctx.lineTo(Math.round(ax) + 0.5, Hh); ctx.stroke();
      ctx.fillStyle = txt; ctx.font = '11px ' + getComputedStyle(document.body).fontFamily; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      const lblY = Math.min(Math.max(ay + 4, 2), Hh - 14), lblX = Math.min(Math.max(ax - 5, 30), W - 2);
      for (let v = Math.ceil(x0 / step) * step, n = 0; v <= x1 && n < 200; v += step, n++) { if (Math.abs(v) < step / 2) continue; const t = nice(Math.round(v / step) * step); ctx.fillText(t, Math.min(Math.max(sx(v), 14), W - 14), lblY); }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = Math.ceil(yBot / step) * step, n = 0; v <= yTop && n < 200; v += step, n++) { if (Math.abs(v) < step / 2) continue; ctx.fillText(nice(Math.round(v / step) * step), lblX - 2 > 30 ? lblX - 2 : 34, Math.min(Math.max(sy(v), 8), Hh - 8)); }
      if (x0 <= 0 && x1 >= 0 && yBot <= 0 && yTop >= 0) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', ax - 4, ay + 4); }
      // curves
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      st.fns.forEach((f, i) => {
        if (!f.on || !compiled[i] || !compiled[i].ok) return; ctx.strokeStyle = COLORS[i]; ctx.lineWidth = 2.2; ctx.beginPath(); let pen = false, py = 0;
        const N = Math.ceil(W); for (let k = 0; k <= N; k++) {
          const x = toX(k); const y = val(i, x); const Y = sy(y);
          if (!isFinite(y) || Math.abs(Y) > 1e5) { pen = false; continue; }
          if (pen && Math.abs(Y - py) > Hh * 1.5 && (Y - sy(0)) * (py - sy(0)) < 0 && Math.abs(Y - py) > Hh) { pen = false; }
          if (pen) ctx.lineTo(k, Y); else { ctx.moveTo(k, Y); pen = true; } py = Y;
        } ctx.stroke();
      });
      // points of interest
      for (const p of pois) { const X = sx(p.x), Y = sy(p.y); if (X < -5 || X > W + 5 || Y < -5 || Y > Hh + 5) continue; ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = p.color; ctx.stroke(); }
      // trace
      if (st.trace) { const x = st.trace.x; const X = sx(x); ctx.strokeStyle = axis.replace(/[\d.]+\)$/, '0.35)'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(Math.round(X) + 0.5, 0); ctx.lineTo(Math.round(X) + 0.5, Hh); ctx.stroke(); ctx.setLineDash([]);
        st.fns.forEach((f, i) => { if (!f.on || !compiled[i] || !compiled[i].ok) return; const y = val(i, x); if (!isFinite(y)) return; const Y = sy(y); ctx.beginPath(); ctx.arc(X, Y, i === st.trace.fi ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = COLORS[i]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = bg; ctx.stroke(); }); }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    function changed(refit, viewOnly) {
      if (!viewOnly) { if (!refit) compileAll(); else compileAll(); } schedule(); clearTimeout(poiTimer); poiTimer = setTimeout(computePois, viewOnly ? 160 : 60); updateInfo(); persist();
    }
    // ---------------- points of interest
    function bisect(f, a, b, n = 50) { let fa = f(a); for (let i = 0; i < n; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } } return (a + b) / 2; }
    function golden(f, a, b, sign) { const g = 0.6180339887; let c = b - g * (b - a), d = a + g * (b - a); for (let i = 0; i < 60; i++) { if (sign * f(c) > sign * f(d)) b = d; else a = c; c = b - g * (b - a); d = a + g * (b - a); } return (a + b) / 2; }
    function computePois() {
      const out = []; if (!W) return; const xa = toX(0), xb = toX(W), N = Math.min(2400, Math.ceil(W * 2)); const dx = (xb - xa) / N; const yr = Hh / st.scale; const tol = yr * 2e-3;
      const idx = st.fns.map((f, i) => (f.on && compiled[i] && compiled[i].ok ? i : -1)).filter((i) => i >= 0);
      const ys = idx.map((i) => { const a = new Float64Array(N + 1); for (let k = 0; k <= N; k++) a[k] = val(i, xa + k * dx); return a; });
      idx.forEach((fi, q) => {
        const y = ys[q], f = (x) => val(fi, x), color = COLORS[fi]; let roots = 0, ext = 0;
        for (let k = 0; k < N && roots < 24; k++) { const a = y[k], b = y[k + 1]; if (!isFinite(a) || !isFinite(b)) continue;
          if (a === 0) { out.push({ kind: 'Zero', x: xa + k * dx, y: 0, fi, color }); roots++; } else if (a * b < 0) { const x = bisect(f, xa + k * dx, xa + (k + 1) * dx); if (Math.abs(f(x)) < tol) { out.push({ kind: 'Zero', x, y: 0, fi, color }); roots++; } } }
        for (let k = 1; k < N && ext < 24; k++) { const a = y[k - 1], b = y[k], c = y[k + 1]; if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue; const d1 = b - a, d2 = c - b;
          if ((d1 < 0 && d2 > 0) || (d1 > 0 && d2 < 0)) { const min = d1 < 0; const x = golden(f, xa + (k - 1) * dx, xa + (k + 1) * dx, min ? -1 : 1); const v = f(x); if (isFinite(v) && Math.abs(v - b) < yr * 0.2 && Math.abs(d1) + Math.abs(d2) < yr) { out.push({ kind: min ? 'Minimum' : 'Maximum', x, y: v, fi, color }); ext++; } } }
        if (xa <= 0 && xb >= 0) { const v = f(0); if (isFinite(v)) out.push({ kind: 'Y-intercept', x: 0, y: v, fi, color }); }
      });
      for (let p = 0; p < idx.length; p++) for (let q = p + 1; q < idx.length; q++) { let n = 0; const fp = (x) => val(idx[p], x), fq = (x) => val(idx[q], x);
        for (let k = 0; k < N && n < 16; k++) { const a = ys[p][k] - ys[q][k], b = ys[p][k + 1] - ys[q][k + 1]; if (!isFinite(a) || !isFinite(b) || !(a * b < 0)) continue; const x = bisect((t) => fp(t) - fq(t), xa + k * dx, xa + (k + 1) * dx); const y = fp(x); if (isFinite(y) && Math.abs(fp(x) - fq(x)) < tol) { out.push({ kind: 'Intersection', x, y, fi: idx[p], fj: idx[q], color: '#8e8e93' }); n++; } } }
      // de-duplicate near points
      pois = out.filter((a, i) => !out.slice(0, i).some((b) => b.kind === a.kind && b.fi === a.fi && Math.abs(b.x - a.x) < dx * 2));
      schedule(); updateInfo();
    }
    // ---------------- info bar
    function updateInfo() {
      info.replaceChildren(); const t = st.trace;
      if (t) { st.fns.forEach((f, i) => { if (!f.on || !compiled[i] || !compiled[i].ok) return; const y = val(i, t.x); info.append(zk.el('span.zc-chip', { style: `background:${COLORS[i]}22;color:inherit;box-shadow:inset 0 0 0 1.5px ${COLORS[i]}` }, `x=${nice(t.x)}  y${st.fns.length > 1 ? i + 1 : ''}=${isFinite(y) ? nice(y) : 'undefined'}`)); }); }
      const seen = new Set(); const near = pois.filter((p) => { const key = p.kind + nice(p.x) + nice(p.y); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => Math.abs(a.x - st.cx) - Math.abs(b.x - st.cx)).slice(0, 7);
      for (const p of near) info.append(zk.el('button.zc-chip', { type: 'button', title: 'Go to ' + p.kind.toLowerCase(), onclick: () => { st.trace = { x: p.x, fi: p.fi }; updateInfo(); schedule(); } }, `${p.kind} (${nice(p.x)}, ${nice(p.y)})`));
      if (!info.children.length) info.append(zk.el('span.zc-note', 'Drag to pan, scroll to zoom, click the graph to trace a function.'));
    }
    // ---------------- pointer interaction (1:1 pan, pinch, momentum)
    const ptrs = new Map(); let inertia = 0, samples = [], moved = 0, pinch = null;
    const stopInertia = () => { if (inertia) { cancelAnimationFrame(inertia); inertia = 0; } };
    const rect = () => canvas.getBoundingClientRect();
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.zc-g-tools')) return; stopInertia(); wrap.focus({ preventScroll: true }); wrap.setPointerCapture(e.pointerId); const r = rect(); ptrs.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top }); moved = 0; samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }]; wrap.classList.add('drag');
      if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) { return; } const r = rect(); const p = ptrs.get(e.pointerId); const nx = e.clientX - r.left, ny = e.clientY - r.top; const dx = nx - p.x, dy = ny - p.y; p.x = nx; p.y = ny;
      if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; st.cx -= (mx - pinch.mx) / st.scale; st.cy += (my - pinch.my) / st.scale; if (pinch.d > 0 && d > 0) zoomAt(d / pinch.d, mx, my); pinch = { d, mx, my }; moved += 99; changed(false, true); return; }
      moved += Math.abs(dx) + Math.abs(dy); if (moved < 3) return; st.cx -= dx / st.scale; st.cy += dy / st.scale; samples.push({ t: performance.now(), x: e.clientX, y: e.clientY }); if (samples.length > 6) samples.shift(); changed(false, true);
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return; const wasPinch = ptrs.size >= 2; ptrs.delete(e.pointerId); wrap.classList.toggle('drag', ptrs.size > 0); if (ptrs.size < 2) pinch = null;
      if (wasPinch || e.type === 'pointercancel') return;
      if (moved < 4) { const r = rect(); traceAt(e.clientX - r.left, e.clientY - r.top); return; }
      const now = performance.now(); const s = samples.filter((q) => now - q.t < 90); if (s.length >= 2 && !zk.reducedMotion()) { const f = s[0], l = s[s.length - 1]; const dt = (l.t - f.t) / 1000; if (dt > 0) startInertia((l.x - f.x) / dt, (l.y - f.y) / dt); }
    };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    function startInertia(vx, vy) {
      if (Math.hypot(vx, vy) < 60) return; let last = performance.now();
      const step = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; st.cx -= vx * dt / st.scale; st.cy += vy * dt / st.scale; const f = Math.exp(-dt * 4.2); vx *= f; vy *= f; changed(false, true); if (Math.hypot(vx, vy) > 12) inertia = requestAnimationFrame(step); else inertia = 0; };
      inertia = requestAnimationFrame(step);
    }
    wrap.addEventListener('wheel', (e) => { e.preventDefault(); stopInertia(); const r = rect();
      if (e.shiftKey && !e.ctrlKey) { st.cx += (e.deltaY || e.deltaX) / st.scale; changed(false, true); return; }
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016) * (e.deltaMode === 1 ? 16 : 1)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    wrap.addEventListener('dblclick', (e) => { if (e.target.closest('.zc-g-tools')) return; const r = rect(); zoomAt(e.shiftKey ? 0.5 : 2, e.clientX - r.left, e.clientY - r.top); });
    function traceAt(px, py) {
      const x = toX(px); let best = -1, bd = 1e9; st.fns.forEach((f, i) => { if (!f.on || !compiled[i] || !compiled[i].ok) return; const y = val(i, x); if (!isFinite(y)) return; const d = Math.abs(sy(y) - py); if (d < bd) { bd = d; best = i; } });
      st.trace = best >= 0 ? { x, fi: best } : null; if (best >= 0) active = best; updateInfo(); schedule();
    }
    wrap.addEventListener('keydown', (e) => {
      const pan = 60 / st.scale; let used = true;
      if (e.key === 'Escape' && st.trace) { st.trace = null; updateInfo(); schedule(); }
      else if (e.key === 'ArrowLeft') { if (st.trace) { st.trace.x -= (e.shiftKey ? 10 : 1) / st.scale * 2; updateInfo(); schedule(); } else { st.cx -= pan; changed(false, true); } }
      else if (e.key === 'ArrowRight') { if (st.trace) { st.trace.x += (e.shiftKey ? 10 : 1) / st.scale * 2; updateInfo(); schedule(); } else { st.cx += pan; changed(false, true); } }
      else if (e.key === 'ArrowUp') { st.cy += pan; changed(false, true); } else if (e.key === 'ArrowDown') { st.cy -= pan; changed(false, true); }
      else if (e.key === '+' || e.key === '=') zoomBy(1.6); else if (e.key === '-') zoomBy(1 / 1.6); else if (e.key === '0') resetView(); else used = false;
      if (used) e.preventDefault();
    });
    // ---------------- table
    function toggleTable(on = !tableOpen) { tableOpen = on; tableEl.hidden = !on; if (on) buildTable(); }
    function buildTable() {
      tableEl.replaceChildren(); const act = st.fns.map((f, i) => i).filter((i) => st.fns[i].on && compiled[i] && compiled[i].ok);
      const x0 = zk.el('input.zc-input', { type: 'number', value: st.tx, step: 'any', 'aria-label': 'Start x', style: 'width:6rem' }), sp = zk.el('input.zc-input', { type: 'number', value: st.tstep, step: 'any', 'aria-label': 'Step', style: 'width:6rem' });
      const close = zk.el('button.zc-btn', { type: 'button', onclick: () => toggleTable(false) }, 'Done');
      const table = zk.el('table.zc-table'); let rows = 0;
      const more = (n) => { const s = +sp.value || 1, a = +x0.value || 0; const tb = table.tBodies[0] || table.createTBody(); for (let k = 0; k < n; k++, rows++) { const x = a + rows * s; tb.append(zk.el('tr', zk.el('td', nice(x)), ...act.map((i) => { const y = val(i, x); return zk.el('td.selectable', isFinite(y) ? nice(y) : '—'); }))); } };
      const rebuild = () => { st.tx = +x0.value || 0; st.tstep = +sp.value || 1; table.replaceChildren(zk.el('thead', zk.el('tr', zk.el('th', 'x'), ...act.map((i) => zk.el('th', { style: `color:${COLORS[i]}` }, 'y' + (st.fns.length > 1 ? i + 1 : '')))))); rows = 0; more(60); persist(); };
      x0.addEventListener('input', rebuild); sp.addEventListener('input', rebuild); tableEl.addEventListener('scroll', () => { if (tableEl.scrollTop + tableEl.clientHeight > tableEl.scrollHeight - 80 && rows < 2000) more(40); });
      tableEl.append(zk.el('.zc-row', { style: 'padding:.3rem 0 .6rem' }, zk.el('span.zc-label', 'Start'), x0, zk.el('span.zc-label', 'Step'), sp, zk.el('span.zk-spacer'), close), table); rebuild();
    }
    // ---------------- sizing / lifecycle
    function size() { const r = wrap.getBoundingClientRect(); W = Math.floor(r.width); Hh = Math.floor(r.height); dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(Hh * dpr); schedule(); }
    new ResizeObserver(() => { size(); computePoisSoon(); }).observe(wrap); const computePoisSoon = () => { clearTimeout(poiTimer); poiTimer = setTimeout(computePois, 120); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
    const persist = zk.debounce(() => H.save('graph', { fns: st.fns, params: st.params, cx: st.cx, cy: st.cy, scale: st.scale, angle: st.angle, tx: st.tx, tstep: st.tstep }), 500);
    const ready = (async () => { const s = await H.load('graph', null); if (s && Array.isArray(s.fns) && s.fns.length) { st.fns = s.fns.slice(0, MAX_FN).map((f) => ({ expr: String(f.expr || ''), on: f.on !== false })); Object.assign(st.params, s.params || {}); ['cx', 'cy', 'scale', 'tx', 'tstep'].forEach((k) => { if (isFinite(s[k])) st[k] = s[k]; }); st.angle = s.angle || 'rad'; }
      buildFns(); buildParams(); compileAll(); size(); computePois(); updateInfo(); })();
    return {
      el: root, ready, show() { size(); computePois(); }, refresh: schedule, resize: size, undo() {},
      angle: { get: () => st.angle, set(a) { st.angle = a; changed(); H.updateAngle(); } },
      copyText: () => (st.trace ? nice(val(st.trace.fi, st.trace.x)) : st.fns[active] ? st.fns[active].expr : ''),
      paste(t) { const f = st.fns[active] || st.fns[0]; f.expr = t.trim().replace(/\n.*/s, ''); buildFns(); changed(); },
      onKey() { return false; },
    };
  };
})();
