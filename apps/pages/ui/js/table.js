/* ZengWrite tables: insert, grid-aware row/column ops, merge/split, shading/borders, column resize by pointer. */
(() => {
  'use strict';
  const P = window.P, flow = P.flow;
  const mk = (t, attrs) => Object.assign(document.createElement(t), attrs || {});
  P.TABLE_STYLES = { grid: 'Grid', clean: 'Horizontal lines', banded: 'Banded', accent: 'Accent header', plain: 'Plain' };

  P.makeTable = (rows, cols, { header = true, style = 'grid', width } = {}) => {
    const cw = width || P.geom().cw; const t = mk('table'); t.dataset.ts = style; const cg = mk('colgroup'); const w = Math.floor(cw / cols);
    for (let c = 0; c < cols; c++) { const col = mk('col'); col.style.width = w + 'px'; cg.append(col); }
    const tb = mk('tbody');
    for (let r = 0; r < rows; r++) { const tr = mk('tr'); for (let c = 0; c < cols; c++) { const td = mk(r === 0 && header ? 'th' : 'td'); td.append(P.emptyP()); tr.append(td); } tb.append(tr); }
    t.append(cg, tb); t.style.width = w * cols + 'px'; return t;
  };
  P.insertTable = (rows, cols, opts) => { const t = P.makeTable(rows, cols, opts); P.insertNodeAtCaret(t, { block: true }); const c = t.querySelector('th,td'); c && P.placeCaretIn(c.firstChild || c); P.refreshSoon(); };

  /* ----- grid model ----- */
  P.tgrid = (table) => {
    const rows = [...table.rows].filter((r) => !r.classList.contains('pgsp')); const grid = []; let ncols = 0;
    rows.forEach((tr, ri) => {
      grid[ri] ||= []; let c = 0;
      for (const cell of tr.cells) {
        while (grid[ri][c]) c++;
        cell._r = ri; cell._c = c;
        for (let dr = 0; dr < (cell.rowSpan || 1); dr++) for (let dc = 0; dc < (cell.colSpan || 1); dc++) { (grid[ri + dr] ||= [])[c + dc] = cell; }
        c += cell.colSpan || 1;
      }
      ncols = Math.max(ncols, grid[ri].length);
    });
    return { rows, grid, ncols, nrows: rows.length };
  };
  const syncCols = (table, G) => {
    G ||= P.tgrid(table); let cg = table.querySelector(':scope > colgroup'); if (!cg) { cg = mk('colgroup'); table.prepend(cg); }
    while (cg.children.length < G.ncols) { const c = mk('col'); const prev = cg.lastElementChild; c.style.width = (prev ? prev.style.width : '80px'); cg.append(c); }
    while (cg.children.length > G.ncols) cg.lastElementChild.remove();
    let tot = 0; for (const c of cg.children) { if (!parseFloat(c.style.width)) c.style.width = Math.floor(P.geom().cw / G.ncols) + 'px'; tot += parseFloat(c.style.width); }
    const cw = P.geom().cw; if (tot > cw + 1) { for (const c of cg.children) c.style.width = Math.floor((parseFloat(c.style.width) * cw) / tot) + 'px'; tot = [...cg.children].reduce((a, c) => a + parseFloat(c.style.width), 0); }
    table.style.width = tot + 'px';
  };
  P.syncCols = syncCols;
  P.tableOf = () => { const s = getSelection(); if (!s.rangeCount) return null; const c = P.cellOf(s.anchorNode); if (c) return c.closest('table'); const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode); return n && n.closest ? n.closest('table') : null; };
  P.selCells = () => {
    const s = getSelection(); if (!s.rangeCount) return []; const A = P.cellOf(s.anchorNode), F = P.cellOf(s.focusNode); if (!A) return [];
    if (!F || A === F || A.closest('table') !== F.closest('table')) return [A];
    const t = A.closest('table'); const G = P.tgrid(t); const r0 = Math.min(A._r, F._r), r1 = Math.max(A._r + A.rowSpan - 1, F._r + F.rowSpan - 1), c0 = Math.min(A._c, F._c), c1 = Math.max(A._c + A.colSpan - 1, F._c + F.colSpan - 1);
    const out = new Set(); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (G.grid[r] && G.grid[r][c]) out.add(G.grid[r][c]); return [...out];
  };
  P.markCells = () => {
    for (const c of flow.querySelectorAll('[data-sel]')) c.removeAttribute('data-sel');
    const cs = P.selCells(); if (cs.length > 1) cs.forEach((c) => c.setAttribute('data-sel', '1'));
  };

  const tableOp = (fn) => { const t = P.tableOf(); if (!t) { zk.toast('Click inside a table first'); return; } P.checkpoint(false); const sv = P.saveSel(); const r = fn(t, P.cellOf(getSelection().anchorNode)); P.normTable(t); P.changed(); P.markDirty(); void sv; return r; };
  const newCell = (like, hdr) => { const td = mk(hdr ? 'th' : 'td'); td.append(P.emptyP()); if (like) { if (like.style.verticalAlign) td.style.verticalAlign = like.style.verticalAlign; const lp = like.querySelector('p'); if (lp && lp.style.textAlign) td.firstChild.style.textAlign = lp.style.textAlign; } return td; };

  P.insertRow = (after = true) => tableOp((t, cell) => {
    const G = P.tgrid(t); const r = cell ? cell._r + (after ? cell.rowSpan : 0) : G.nrows; const tr = mk('tr'); const handled = new Set();
    for (let c = 0; c < G.ncols; c++) {
      const above = r > 0 ? G.grid[r - 1][c] : null, below = r < G.nrows ? G.grid[r][c] : null;
      if (above && above === below) { if (!handled.has(above)) { above.rowSpan++; handled.add(above); } continue; }
      tr.append(newCell(below || above, false));
    }
    const ref = G.rows[r]; if (ref) ref.before(tr); else G.rows[G.nrows - 1].after(tr);
    P.placeCaretIn(tr.firstChild.firstChild || tr.firstChild);
  });
  P.deleteRow = () => tableOp((t, cell) => {
    if (!cell) return; const G = P.tgrid(t); if (G.nrows <= 1) { t.remove(); return; }
    const r = cell._r; const rowsToDel = [...new Set(P.selCells().map((c) => c._r))].sort((a, b) => b - a); void r;
    for (const rr of rowsToDel) {
      const G2 = P.tgrid(t); if (G2.nrows <= 1) { t.remove(); return; }
      const seen = new Set();
      for (let c = 0; c < G2.ncols; c++) {
        const cl = G2.grid[rr][c]; if (!cl || seen.has(cl)) continue; seen.add(cl);
        if (cl._r === rr) { if (cl.rowSpan > 1) { const nextRow = G2.rows[rr + 1]; cl.rowSpan--; let ref = null; for (const x of nextRow.cells) if (x._c > cl._c) { ref = x; break; } nextRow.insertBefore(cl, ref); } }
        else cl.rowSpan--;
      }
      G2.rows[rr].remove();
    }
    const G3 = P.tgrid(t); const c = G3.grid[Math.min(cell._r, G3.nrows - 1)]?.[0]; c && P.placeCaretIn(c.firstChild || c);
  });
  const insertColAt = (t, at, { except = null, span = false } = {}) => {
    const G = P.tgrid(t); const done = new Set();
    for (let r = 0; r < G.nrows; r++) {
      const left = at > 0 ? G.grid[r][at - 1] : null, right = at < G.ncols ? G.grid[r][at] : null;
      if (left && left === right) { if (!done.has(left)) { left.colSpan++; done.add(left); } continue; }
      if (span && G.rows[r] !== except && left) { if (!done.has(left)) { left.colSpan++; done.add(left); } continue; }
      const own = [...G.rows[r].cells]; let ref = null; for (const x of own) if (x._c >= at) { ref = x; break; }
      const hdr = (ref || own[own.length - 1] || {}).tagName === 'TH';
      const td = newCell(right || left, hdr); G.rows[r].insertBefore(td, ref);
    }
    const cg = t.querySelector(':scope > colgroup'); if (cg) { const w = parseFloat((cg.children[Math.max(0, at - 1)] || cg.children[0] || { style: {} }).style.width) || 80; const col = mk('col'); col.style.width = Math.max(40, Math.round(w / 1)) + 'px'; cg.insertBefore(col, cg.children[at] || null); }
    syncCols(t);
  };
  P.insertCol = (after = true) => tableOp((t, cell) => { const at = cell ? cell._c + (after ? cell.colSpan : 0) : P.tgrid(t).ncols; insertColAt(t, at); const G = P.tgrid(t); const r = cell ? cell._r : 0; const c = G.grid[r][at]; c && P.placeCaretIn(c.firstChild || c); });
  P.deleteCol = () => tableOp((t, cell) => {
    if (!cell) return; const cs = P.selCells(); const cols = [...new Set(cs.flatMap((c) => Array.from({ length: c.colSpan }, (_, i) => c._c + i)))].sort((a, b) => b - a);
    for (const col of cols) {
      const G = P.tgrid(t); if (G.ncols <= 1) { t.remove(); return; } const seen = new Set();
      for (let r = 0; r < G.nrows; r++) { const cl = G.grid[r][col]; if (!cl || seen.has(cl)) continue; seen.add(cl); if (cl.colSpan > 1) cl.colSpan--; else cl.remove(); }
      const cg = t.querySelector(':scope > colgroup'); if (cg && cg.children[col]) cg.children[col].remove();
      for (const tr of [...G.rows]) if (!tr.cells.length) { const gg = tr; void gg; }
    }
    // drop emptied rows
    for (const tr of [...t.rows]) if (!tr.cells.length && !tr.classList.contains('pgsp')) tr.remove();
    syncCols(t); const G2 = P.tgrid(t); const c = G2.grid[0]?.[Math.min(cell._c, G2.ncols - 1)]; c && P.placeCaretIn(c.firstChild || c);
  });
  P.deleteTable = () => tableOp((t) => { const nx = t.nextElementSibling || t.previousElementSibling; t.remove(); if (nx) P.placeCaretIn(nx); });
  P.mergeCells = () => tableOp((t) => {
    const cs = P.selCells(); if (cs.length < 2) return; const G = P.tgrid(t);
    let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
    const grow = () => { for (const c of cs) { r0 = Math.min(r0, c._r); c0 = Math.min(c0, c._c); r1 = Math.max(r1, c._r + c.rowSpan - 1); c1 = Math.max(c1, c._c + c.colSpan - 1); } };
    grow(); let ch = true; while (ch) { ch = false; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const cl = G.grid[r][c]; if (cl && !cs.includes(cl)) { cs.push(cl); ch = true; } } if (ch) grow(); }
    const first = G.grid[r0][c0]; const frag = [];
    for (const c of cs) { if (c === first) continue; for (const p of [...c.children]) if (p.textContent.trim() || p.querySelector('img')) frag.push(p); c.remove(); }
    if (frag.length) { const lastP = first.lastElementChild; if (lastP && !lastP.textContent.trim() && !lastP.querySelector('img')) lastP.remove(); frag.forEach((p) => first.append(p)); }
    first.colSpan = c1 - c0 + 1; first.rowSpan = r1 - r0 + 1; if (first.colSpan === 1) first.removeAttribute('colspan'); if (first.rowSpan === 1) first.removeAttribute('rowspan'); P.placeCaretIn(first.firstChild || first);
  });
  P.splitCell = () => tableOp((t, cell) => {
    if (!cell) return; const G = P.tgrid(t);
    if (cell.colSpan > 1 || cell.rowSpan > 1) {
      const { _r: r, _c: c, colSpan: cs, rowSpan: rs } = cell; cell.colSpan = 1; cell.rowSpan = 1; cell.removeAttribute('colspan'); cell.removeAttribute('rowspan');
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) { if (!dr && !dc) continue; const tr = G.rows[r + dr]; let ref = null; for (const x of tr.cells) if (x !== cell && x._c > c + dc && !(x._r < r + dr)) { ref = x; break; } tr.insertBefore(newCell(cell, false), ref); }
    } else { insertColAt(t, cell._c + 1, { except: G.rows[cell._r], span: true }); }
  });
  P.toggleHeaderRow = () => tableOp((t) => {
    const G = P.tgrid(t); const row = G.rows[0]; const isH = [...row.cells].every((c) => c.tagName === 'TH');
    P.withSel(() => { for (const c of [...row.cells]) { const n = mk(isH ? 'td' : 'th'); for (const a of c.attributes) n.setAttribute(a.name, a.value); while (c.firstChild) n.append(c.firstChild); c.replaceWith(n); } });
  });
  P.tableStyle = (name) => tableOp((t) => { t.dataset.ts = name; for (const c of t.querySelectorAll('td,th')) { c.style.removeProperty('background-color'); } });
  P.cellShade = (color) => tableOp(() => { for (const c of P.selCells()) { color ? (c.style.backgroundColor = color) : c.style.removeProperty('background-color'); if (!c.getAttribute('style')) c.removeAttribute('style'); } });
  P.cellAlign = (h, v) => tableOp(() => { for (const c of P.selCells()) { if (h) for (const p of c.querySelectorAll('p,h1,h2,h3,h4')) p.style.textAlign = h; if (v) c.style.verticalAlign = v; } });
  P.cellBorders = (mode, color = '#6e6e73', w = 1) => tableOp((t) => {
    const cs = P.selCells(); const G = P.tgrid(t); const line = `${w}px solid ${color}`; const hid = 'hidden';
    const rect = { r0: Math.min(...cs.map((c) => c._r)), r1: Math.max(...cs.map((c) => c._r + c.rowSpan - 1)), c0: Math.min(...cs.map((c) => c._c)), c1: Math.max(...cs.map((c) => c._c + c.colSpan - 1)) }; void G;
    for (const c of cs) {
      const sides = { Top: 0, Right: 0, Bottom: 0, Left: 0 };
      if (mode === 'all' || mode === 'none') for (const k in sides) sides[k] = 1;
      if (mode === 'outer') { if (c._r === rect.r0) sides.Top = 1; if (c._r + c.rowSpan - 1 === rect.r1) sides.Bottom = 1; if (c._c === rect.c0) sides.Left = 1; if (c._c + c.colSpan - 1 === rect.c1) sides.Right = 1; }
      if (mode === 'top' && c._r === rect.r0) sides.Top = 1; if (mode === 'bottom' && c._r + c.rowSpan - 1 === rect.r1) sides.Bottom = 1; if (mode === 'left' && c._c === rect.c0) sides.Left = 1; if (mode === 'right' && c._c + c.colSpan - 1 === rect.c1) sides.Right = 1;
      for (const k in sides) if (sides[k]) c.style['border' + k] = mode === 'none' ? `1px ${hid} transparent` : line;
    }
  });
  P.tableAlign = (a) => tableOp((t) => { t.setAttribute('data-ta', a); });
  P.tableTab = (cell, back) => {
    const t = cell.closest('table'); const cells = [...t.querySelectorAll('td,th')].filter((c) => c.closest('table') === t); const i = cells.indexOf(cell);
    if (!back && i === cells.length - 1) { P.insertRow(true); return; }
    const n = cells[back ? Math.max(0, i - 1) : i + 1]; if (n) { const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  };
  P.tableInfo = () => { const t = P.tableOf(); if (!t) return null; const cs = P.selCells(); const G = P.tgrid(t); return { t, cells: cs, style: t.dataset.ts || 'grid', header: [...(G.rows[0]?.cells || [])].every((c) => c.tagName === 'TH'), rows: G.nrows, cols: G.ncols }; };

  /* ----- column resize by pointer ----- */
  let rz = null, drag = null;
  flow.addEventListener('pointermove', (e) => {
    if (drag) return;
    const c = e.target.closest && e.target.closest('td,th'); if (!c) { if (rz) { rz = null; flow.style.cursor = ''; } return; }
    const r = c.getBoundingClientRect(); const z = P.zoom || 1; const near = r.right - e.clientX < 5 * z && r.right - e.clientX > -3 * z;
    if (near) { flow.style.cursor = 'col-resize'; rz = { cell: c }; } else if (rz) { rz = null; flow.style.cursor = ''; }
  });
  flow.addEventListener('pointerdown', (e) => {
    if (!rz || e.button !== 0) return; const c = rz.cell; const t = c.closest('table'); const G = P.tgrid(t); syncCols(t, G); const cg = t.querySelector(':scope > colgroup');
    const ci = c._c + c.colSpan - 1; const cols = [...cg.children]; if (!cols[ci]) return; e.preventDefault(); e.stopPropagation(); P.checkpoint(false);
    drag = { t, ci, cols, x0: e.clientX, w0: cols.map((x) => parseFloat(x.style.width)), tw0: parseFloat(t.style.width) || cols.reduce((a, x) => a + parseFloat(x.style.width), 0), id: e.pointerId };
    flow.setPointerCapture(e.pointerId);
  }, true);
  flow.addEventListener('pointermove', (e) => {
    if (!drag) return; const z = P.zoom || 1; const dx = (e.clientX - drag.x0) / z; const { cols, ci, w0 } = drag; const cw = P.geom().cw;
    let a = Math.max(24, w0[ci] + dx); let d = a - w0[ci];
    if (ci + 1 < cols.length) { const b = Math.max(24, w0[ci + 1] - d); d = w0[ci + 1] - b; a = w0[ci] + d; cols[ci + 1].style.width = b + 'px'; }
    else { const tot = w0.reduce((s, x) => s + x, 0) - w0[ci] + a; if (tot > cw) a = a - (tot - cw); }
    cols[ci].style.width = a + 'px'; drag.t.style.width = cols.reduce((s, x) => s + parseFloat(x.style.width), 0) + 'px'; P.updateObjSel && P.updateObjSel();
  });
  const endDrag = (e) => { if (!drag) return; try { flow.releasePointerCapture(drag.id); } catch { /* ignore */ } drag = null; flow.style.cursor = ''; P._forceFull = true; P.changed(); P.markDirty(); };
  flow.addEventListener('pointerup', endDrag); flow.addEventListener('pointercancel', endDrag);
})();
