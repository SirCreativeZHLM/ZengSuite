/* Formula X-ray: animated precedent/dependent arrows over the grid plus an explainer card. */
(function () {
  'use strict';
  const ZN = window.ZN, X = ZN.xray, FM = ZN.formula, app = window.app; const el = zk.el; const $ = (s, r = document) => r.querySelector(s);
  const BLUE = '#0a84ff', GREEN = '#30d158', AMBER = '#ff9f0a';
  const st = app.xray = { on: false, trace: false, t0: 0, data: null, raf: 0, key: '' };
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const reduced = () => zk.reducedMotion();
  let cv, ctx, card;

  function ensureCanvas() { if (cv) return; cv = el('canvas', { id: 'xcv', style: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 5 } }); $('#stage').append(cv); ctx = cv.getContext('2d'); size(); }
  function size() { if (!cv) return; const g = app.grid, d = g.dpr; cv.width = Math.round(g.vw * d); cv.height = Math.round(g.vh * d); cv.style.width = g.vw + 'px'; cv.style.height = g.vh + 'px'; }
  const rectOf = (sh, p) => { const g = app.grid; if (sh !== app.sheet) return null; const rc = g.rangeRect(p.r1, p.c1, p.r2, p.c2); return rc; };
  const clampRect = (rc) => { const g = app.grid; const x1 = Math.max(rc.x, g.hw), y1 = Math.max(rc.y, g.hh), x2 = Math.min(rc.x + rc.w, g.vw), y2 = Math.min(rc.y + rc.h, g.vh); if (x2 <= x1 || y2 <= y1) return null; return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const edgePt = (rc, tx, ty) => { const cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2; const dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy]; const sx = dx ? (rc.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (rc.h / 2) / Math.abs(dy) : Infinity; const s = Math.min(sx, sy, 1); return [cx + dx * s, cy + dy * s]; };

  function compute() {
    const sel = app.sel; if (!sel) return null; const { r, c } = sel; const sh = app.sheet; const cell = sh.getCell(r, c);
    const d = { r, c, sh, cell, formula: cell && cell.f !== undefined ? cell.f : null, prec: [], deps: [], trace: null, hard: [], explain: null };
    if (d.formula !== null) { d.prec = X.precedents(app.wb, sh, r, c); d.explain = X.explain(app.wb, sh, r, c); if (cell.ast) d.hard = X.hardcodes(cell.ast); }
    d.deps = X.dependents(app.wb, sh, r, c, 150);
    if (st.trace) d.trace = X.trace(app.wb, sh, r, c, { maxNodes: 300 });
    return d;
  }
  app.toggleXray = function (on) { st.on = on == null ? !st.on : on; $('#tb-xray') && $('#tb-xray').setAttribute('aria-pressed', st.on ? 'true' : 'false'); if (st.on) { ensureCanvas(); size(); st.key = ''; app.xrayRefresh(true); } else { cancelAnimationFrame(st.raf); st.raf = 0; if (card) { card.remove(); card = null; } if (cv) ctx.clearRect(0, 0, cv.width, cv.height); } app.renderMenus(); };
  app.xrayRefresh = function (force) {
    if (!st.on) return; const s = app.sel; const key = s.r + ',' + s.c + ',' + app.sheet.id + ',' + app.wb.version + ',' + st.trace; if (!force && key === st.key) return; const same = st.key.split(',').slice(0, 3).join() === key.split(',').slice(0, 3).join(); st.key = key; st.data = compute(); if (!same || force) st.t0 = performance.now(); renderCard(); loop();
  };
  function loop() { if (st.raf || !st.on) return; const step = () => { st.raf = 0; if (!st.on) return; draw(); const animating = !reduced(); if (animating) st.raf = requestAnimationFrame(step); }; st.raf = requestAnimationFrame(step); }
  window.addEventListener('resize', () => { size(); loop(); }); document.getElementById('scroller').addEventListener('scroll', () => { if (st.on) { if (reduced()) draw(); } });

  // ---------- drawing ----------
  function arrow(a, b, color, t, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy); if (len < 6) return; const bend = Math.min(60, len * 0.25) * (o.dir || 1); const nx = -dy / len, ny = dx / len; const cxp = (a[0] + b[0]) / 2 + nx * bend, cyp = (a[1] + b[1]) / 2 + ny * bend;
    const P = (u) => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * cxp + u * u * b[0], v * v * a[1] + 2 * v * u * cyp + u * u * b[1]]; };
    const p = ease(t); if (p <= 0) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); const N = 28; for (let i = 0; i <= N * p; i++) { const q = P(Math.min(p, i / N)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } if (p < 1) { const q = P(p); ctx.lineTo(q[0], q[1]); }
    ctx.strokeStyle = color + '33'; ctx.lineWidth = (o.w || 2) + 4; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = o.w || 2; ctx.setLineDash([7, 6]); ctx.lineDashOffset = reduced() ? 0 : -((performance.now() - st.t0) / 28) % 13; ctx.stroke(); ctx.setLineDash([]);
    if (p > 0.98 && !o.noHead) { const e = P(1), e0 = P(0.94); const ang = Math.atan2(e[1] - e0[1], e[0] - e0[0]); ctx.translate(e[0], e[1]); ctx.rotate(ang); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -5); ctx.lineTo(-9, 5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function chip(text, x, y, color) { ctx.save(); ctx.font = '600 10.5px sans-serif'; const w = ctx.measureText(text).width + 12; const X0 = Math.min(app.grid.vw - w - 4, Math.max(app.grid.hw + 4, x - w / 2)), Y0 = Math.min(app.grid.vh - 22, Math.max(app.grid.hh + 4, y - 9)); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(X0, Y0, w, 18, 9); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, X0 + 6, Y0 + 9.5); ctx.restore(); }
  function draw() {
    const d = st.data; const g = app.grid; if (!cv || !d) return; ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); ctx.clearRect(0, 0, g.vw, g.vh); if (d.sh !== app.sheet) return;
    ctx.save(); ctx.beginPath(); ctx.rect(g.hw, g.hh, g.vw - g.hw, g.vh - g.hh); ctx.clip();
    const me = g.rangeRect(d.r, d.c, d.r, d.c); const mc = [me.x + me.w / 2, me.y + me.h / 2]; const now = performance.now() - st.t0;
    const target = (rc, label, color, inbound, i) => { const vis = clampRect(rc); if (vis) { ctx.fillStyle = color + '1c'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.strokeRect(rc.x + .5, rc.y + .5, rc.w - 1, rc.h - 1); ctx.setLineDash([]); const c2 = [vis.x + vis.w / 2, vis.y + vis.h / 2]; const a = inbound ? edgePt(vis, mc[0], mc[1]) : edgePt(me, c2[0], c2[1]); const b = inbound ? edgePt(me, c2[0], c2[1]) : edgePt(vis, mc[0], mc[1]); arrow(inbound ? a : a, b, color, (now - i * 60) / 420, { dir: i % 2 ? -1 : 1 }); } else { const ex = Math.min(g.vw - 16, Math.max(g.hw + 16, rc.x + rc.w / 2)), ey = Math.min(g.vh - 16, Math.max(g.hh + 16, rc.y + rc.h / 2)); chip((rc.y + rc.h < g.hh ? '↑ ' : rc.y > g.vh ? '↓ ' : rc.x + rc.w < g.hw ? '← ' : '→ ') + label, ex, ey, color); arrow(inbound ? [ex, ey] : mc, inbound ? mc : [ex, ey], color, (now - i * 60) / 420, { noHead: !inbound }); } };
    if (st.trace && d.trace) { // upstream cloud: tint every contributing cell by depth, draw edges
      const maxD = Math.max(1, ...d.trace.nodes.map((n) => n.depth)); const pos = d.trace.nodes.map((n) => (n.sheet === app.sheet ? g.rangeRect(n.r, n.c, n.r, n.c) : null));
      d.trace.nodes.forEach((n, i) => { const rc = pos[i]; if (!rc || i === 0) return; const a = 0.1 + 0.22 * (1 - n.depth / (maxD + 1)); ctx.fillStyle = `rgba(10,132,255,${a})`; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); });
      let k = 0; for (const [a, b] of d.trace.edges.slice(0, 160)) { const ra = pos[a], rb = pos[b]; if (!ra || !rb) continue; const A = edgePt(rb, ra.x + ra.w / 2, ra.y + ra.h / 2), B = edgePt(ra, rb.x + rb.w / 2, rb.y + rb.h / 2); arrow(A, B, BLUE, (now - d.trace.nodes[b].depth * 120 - (k++ % 5) * 15) / 380, { w: 1.4 }); }
      for (const s of d.trace.sources) { if (s.range || s.sheet !== app.sheet) continue; const rc = g.rangeRect(s.r, s.c, s.r, s.c); ctx.strokeStyle = AMBER; ctx.lineWidth = 2; ctx.strokeRect(rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2); ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(rc.x + rc.w - 5, rc.y + 5, 3.4, 0, 7); ctx.fill(); }
    } else {
      d.prec.forEach((p, i) => { const rc = rectOf(p.sheet, p); if (rc) target(rc, ZN.rangeAddr(p.r1, p.c1, p.r2, p.c2), BLUE, true, i); });
    }
    d.deps.slice(0, 40).forEach((p, i) => { if (p.sheet !== app.sheet) return; const rc = g.rangeRect(p.r, p.c, p.r, p.c); target(rc, ZN.addr(p.r, p.c), GREEN, false, i); });
    // the selected cell halo + hard-code marker
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1; ctx.strokeRect(me.x + 2.5, me.y + 2.5, me.w - 5, me.h - 5);
    if (d.hard.length) { const pulse = reduced() ? 1 : 0.75 + 0.25 * Math.sin(now / 260); const bx = me.x + me.w - 2, by = me.y + 2; ctx.fillStyle = AMBER; ctx.globalAlpha = pulse; ctx.beginPath(); ctx.moveTo(bx - 14, by + 13); ctx.lineTo(bx - 7, by - 1); ctx.lineTo(bx, by + 13); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#1d1d1f'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', bx - 7, by + 11); }
    ctx.restore();
  }

  // ---------- card ----------
  const jump = (sh, r, c) => { if (sh !== app.sheet) app.switchSheet(app.wb.sheets.indexOf(sh)); app.goTo(r, c); };
  const dot = (c) => el('i', { style: { width: '8px', height: '8px', borderRadius: '50%', background: c, display: 'inline-block', flex: 'none' } });
  function renderCard() {
    const d = st.data; if (!d) return; if (!card) { card = el('.xray-card', { role: 'complementary', 'aria-label': 'Formula X-ray' }); $('#gridcol').append(card); } const fmtV = (v) => { try { return ZN.fmt.format(v, 'General').text; } catch (e) { return String(v); } };
    const head = el('.xr-head', el('span.xr-ttl', zk.icon('scan-search'), 'Formula X-ray'), el('button.zk-btn.icon', { 'aria-label': 'Close X-ray', onclick: () => app.toggleXray(false) }, zk.icon('x')));
    const val = d.cell && d.cell.v != null ? fmtV(d.cell.v) : '—';
    const top = el('.xr-top', el('b', ZN.addr(d.r, d.c)), el('span.xr-val', d.cell && d.cell.v instanceof ZN.ZErr ? d.cell.v.code : val));
    const kids = [head, top];
    if (d.formula === null) { kids.push(el('.xr-sec', el('p.xr-plain', d.cell && d.cell.v != null ? 'This cell holds a typed-in value.' : 'This cell is empty.'), d.deps.length ? el('p.xr-note', d.deps.length + (d.deps.length >= 150 ? '+' : '') + ' formula' + (d.deps.length === 1 ? '' : 's') + ' depend' + (d.deps.length === 1 ? 's' : '') + ' on it. Change it and the green arrows recalculate.') : el('p.xr-note', 'Nothing depends on this cell yet.'))); }
    else {
      kids.push(el('.xr-sec', el('.xr-lbl', 'In plain English'), el('p.xr-plain', d.explain ? d.explain.text : ''), el('code.xr-code.selectable', '=' + d.formula)));
      if (d.hard.length) kids.push(el('.xr-sec.warn', el('.xr-lbl', '⚠ Hard-coded numbers'), ...d.hard.map((h) => el('.xr-row', el('span', el('b', String(h.value)), ' is typed into this formula'), el('button.zk-btn.bordered', { onclick: () => nameNumber(d, h.value) }, 'Name it')))));
      if (d.prec.length) kids.push(el('.xr-sec', el('.xr-lbl', dot(BLUE), 'Uses'), ...d.prec.map((p) => { const a = (p.sheet !== d.sh ? p.sheet.name + '!' : '') + ZN.rangeAddr(p.r1, p.c1, p.r2, p.c2); const nm = X.nameFor(app.wb, p.sheet, p); const lb = X.labelOf(app.wb, p.sheet, p); const many = p.r2 > p.r1 || p.c2 > p.c1; const v = !many ? p.sheet.getValue(p.r1, p.c1) : null; return el('.xr-row', el('a.xr-link', { onclick: () => { if (p.sheet !== d.sh) app.switchSheet(app.wb.sheets.indexOf(p.sheet)); app.selectRange({ r1: p.r1, c1: p.c1, r2: Math.min(p.r2, p.r1 + 5000), c2: p.c2 }); app.grid.scrollTo(p.r1, p.c1); } }, nm || lb || a, el('small', nm || lb ? '  ' + a : ''), !many && v != null ? el('small.xr-v', '  = ' + fmtV(v)) : null), !nm && p.sheet === d.sh && !p.whole ? el('button.zk-btn.bordered', { title: 'Create a named range for this reference', onclick: () => nameRange(d, p) }, 'Name') : nm ? el('span.pill', 'named') : null); })));
      kids.push(el('.xr-sec', el('.row', el('button.zk-btn.bordered' + (st.trace ? '.on' : ''), { 'aria-pressed': st.trace ? 'true' : 'false', onclick: () => { st.trace = !st.trace; st.t0 = performance.now(); app.xrayRefresh(true); } }, zk.icon('route'), st.trace ? 'Hide trace' : 'Trace to source'), d.trace ? el('span.xr-note', d.trace.nodes.length - 1 + ' cells upstream' + (d.trace.truncated ? '+' : '') + ' · depth ' + Math.max(0, ...d.trace.nodes.map((n) => n.depth))) : null), d.trace ? el('div', el('.xr-lbl', { style: { marginTop: '8px' } }, dot(AMBER), 'Source inputs'), ...(d.trace.sources.length ? d.trace.sources.slice(0, 12).map((s) => el('.xr-row', el('a.xr-link', { onclick: () => (s.range ? app.selectRange({ r1: s.r, c1: s.c, r2: s.r2, c2: s.c2 }) : jump(s.sheet, s.r, s.c)) }, (s.sheet !== d.sh ? s.sheet.name + '!' : '') + (s.range ? ZN.rangeAddr(s.r, s.c, s.r2, s.c2) : ZN.addr(s.r, s.c))), s.range ? el('small', 'large range') : el('small.xr-v', s.v == null ? 'empty' : fmtV(s.v)))) : [el('.xr-note', 'This formula uses no cell inputs.')])) : null));
    }
    if (d.formula !== null || d.deps.length) kids.push(el('.xr-sec', el('.xr-lbl', dot(GREEN), 'Used by'), d.deps.length ? el('.xr-chips', ...d.deps.slice(0, 30).map((p) => el('button.zk-btn.bordered.chipb', { onclick: () => jump(p.sheet, p.r, p.c) }, (p.sheet !== d.sh ? p.sheet.name + '!' : '') + ZN.addr(p.r, p.c))), d.deps.length > 30 ? el('span.xr-note', '+' + (d.deps.length - 30) + ' more') : null) : el('.xr-note', 'No other formula uses this cell.')));
    card.replaceChildren(...kids);
  }
  async function nameRange(d, p) {
    const name = await zk.prompt('Name this range', X.suggestName(app.wb, d.sh, p), { message: 'Use a name like “' + X.suggestName(app.wb, d.sh, p) + '” instead of ' + ZN.rangeAddr(p.r1, p.c1, p.r2, p.c2) + ' in this formula.', ok: 'Name It' }); if (!name) return;
    if (!/^[A-Za-z_][\w.]*$/.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name)) { zk.alert('Invalid name', 'Names start with a letter or underscore, contain no spaces, and can’t look like a cell address.'); return; }
    if (app.wb.lookupName(name, d.sh)) { zk.alert('Name in use', '“' + name + '” already exists.'); return; }
    const ref = FM.printRef({ sheet: d.sh.name, r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2, ar1: true, ac1: true, ar2: true, ac2: true, kind: p.r1 === p.r2 && p.c1 === p.c2 ? 'cell' : 'range' });
    app.wb.tx('Name Range', () => { app.defineName(name, ref); const nf = X.replaceRefWithName(d.formula, { r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2, sheetName: d.sh.name }, name); if (nf !== d.formula) app.wb.setInput(d.sh, d.r, d.c, '=' + nf, { force: true }); }); zk.toast('Named “' + name + '”'); app.xrayRefresh(true);
  }
  async function nameNumber(d, value) {
    const name = await zk.prompt('Name this number', 'Rate', { message: value + ' is typed directly into the formula. Give it a name so it is documented and easy to change.', ok: 'Name It' }); if (!name) return;
    if (!/^[A-Za-z_][\w.]*$/.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name) || app.wb.lookupName(name, d.sh)) { zk.alert('Can’t use that name', 'Pick a unique name that starts with a letter and has no spaces.'); return; }
    app.wb.tx('Name Number', () => { app.defineName(name, String(value)); const nf = X.replaceNumberWithName(d.formula, value, name); app.wb.setInput(d.sh, d.r, d.c, '=' + nf, { force: true }); }); zk.toast('Named “' + name + '” = ' + value); app.xrayRefresh(true);
  }
  // hooks into selection / change events
  const origAfterSel = app.afterSel; app.afterSel = function () { origAfterSel.call(this); if (st.on) this.xrayRefresh(); };
  const origOnChange = app.onChange; app.onChange = function (k) { origOnChange.call(this, k); if (st.on) requestAnimationFrame(() => this.xrayRefresh()); };
  const origSwitch = app.switchSheet; app.switchSheet = function (i, s) { origSwitch.call(this, i, s); if (st.on) this.xrayRefresh(true); };
})();
