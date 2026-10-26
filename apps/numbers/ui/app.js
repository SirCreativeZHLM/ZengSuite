/* ZengNumbers application: document, selection, editing, keyboard, clipboard, formatting, menus. */
(function () {
  'use strict';
  const ZN = window.ZN, FM = ZN.formula, { MAXR, MAXC } = ZN; const $ = (s, r = document) => r.querySelector(s); const el = zk.el;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REFCOLORS = ['#0a84ff', '#ff453a', '#30d158', '#bf5af2', '#ff9f0a', '#40c8e0', '#ff6482', '#a2845e'];
  const FONTS = ['System', 'Helvetica Neue', 'Arial', 'Avenir Next', 'Calibri', 'Cambria', 'Courier New', 'Georgia', 'Menlo', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Inter'];
  const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48, 72];

  const app = window.app = {
    wb: null, sheet: null, grid: null, doc: null, sel: null, editing: null, clipRanges: null, clipInternal: null, selChart: null, inspectorOpen: false, showFormulas: false, calcMode: 'auto',
    // ================= workbook / sheets =================
    setWorkbook(wb, opts = {}) {
      this.wb = wb; wb.on((kind) => this.onChange(kind)); this.editing = null; this.clipRanges = null; this.selChart = null;
      this.switchSheet(clamp(wb.active || 0, 0, wb.sheets.length - 1), true); this.renderTabs(); this.refreshAll();
    },
    switchSheet(i, silent) {
      if (this.editing) this.commitEdit(0); if (this.sheet) { this.sheet.sel = this.sel; this.sheet.scroll = { l: this.grid.sc.scrollLeft, t: this.grid.sc.scrollTop }; }
      const sh = this.wb.sheets[i]; if (!sh) return; this.wb.active = i; this.sheet = sh; this.sel = sh.sel || this.mkSel(0, 0); this.selChart = null;
      this.grid.setSheet(sh); this.renderCharts(); this.updateZoomUI(); if (!silent) { this.renderTabs(); this.refreshAll(); } this.grid.scrollTo(this.sel.r, this.sel.c); this.focusKb();
    },
    onChange(kind) {
      this.doc && kind !== 'prop' && this.doc.markDirty(); this.grid.dispCache.clear(); this.grid.ensureGeo(); this.grid.updateSpacer(); this.grid.invalidate();
      if (this.sheet && !this.wb.sheets.includes(this.sheet)) { this.switchSheet(clamp(this.wb.active, 0, this.wb.sheets.length - 1)); return; }
      if (kind === 'undo' || kind === 'commit') { this.sanitizeSel(); }
      cancelAnimationFrame(this._chg); this._chg = requestAnimationFrame(() => { this.renderTabs(true); this.refreshBars(); this.updateCharts(); this.renderInspector && this.renderInspector(); });
    },
    refreshAll() { this.refreshBars(); this.renderInspector && this.renderInspector(); this.renderMenus(); this.updateCharts(); this.grid.invalidate(); },
    sanitizeSel() { const s = this.sel; if (!s) return; s.r = clamp(s.r, 0, MAXR - 1); s.c = clamp(s.c, 0, MAXC - 1); },
    // ================= selection =================
    mkSel(r, c) { return { r, c, ar: r, ac: c, ranges: [this.expandMerge({ r1: r, c1: c, r2: r, c2: c })] }; },
    selRanges() { return this.sel ? this.sel.ranges : []; },
    expandMerge(q) { const m = this.sheet.merges; if (!m.length) return q; let ch = true; q = { ...q }; while (ch) { ch = false; for (const x of m) if (x[0] <= q.r2 && x[2] >= q.r1 && x[1] <= q.c2 && x[3] >= q.c1) { if (x[0] < q.r1) { q.r1 = x[0]; ch = true; } if (x[2] > q.r2) { q.r2 = x[2]; ch = true; } if (x[1] < q.c1) { q.c1 = x[1]; ch = true; } if (x[3] > q.c2) { q.c2 = x[3]; ch = true; } } } return q; },
    norm(r1, c1, r2, c2) { return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) }; },
    selectCell(r, c, add) { r = clamp(r, 0, MAXR - 1); c = clamp(c, 0, MAXC - 1); const m = this.sheet.mergeAt(r, c); const q = this.expandMerge({ r1: r, c1: c, r2: r, c2: c }); const prev = add && this.sel ? this.sel.ranges : []; this.sel = { r: m ? m[0] : r, c: m ? m[1] : c, ar: r, ac: c, ranges: [...prev, q] }; this.afterSel(); },
    extendTo(r, c, add) { const s = this.sel; r = clamp(r, 0, MAXR - 1); c = clamp(c, 0, MAXC - 1); const q = this.expandMerge(this.norm(s.ar, s.ac, r, c)); s.ranges[s.ranges.length - 1] = q; s.er = r; s.ec = c; this.afterSel(); },
    selectCols(a, b, shift, add, drag) { const lo = Math.min(a, b), hi = Math.max(a, b); if (shift && this.sel && !drag) { lo2: { const q = this.sel.ranges[this.sel.ranges.length - 1]; const l = Math.min(this.sel.ac, a, b), h = Math.max(this.sel.ac, a, b); this.sel.ranges[this.sel.ranges.length - 1] = { r1: 0, r2: MAXR - 1, c1: l, c2: h }; this.afterSel(); return; } } const q = { r1: 0, r2: MAXR - 1, c1: lo, c2: hi }; const prev = add && this.sel ? this.sel.ranges : []; if (drag && this.sel) { this.sel.ranges[this.sel.ranges.length - 1] = q; this.afterSel(); return; } const r0 = this.sel && add ? this.sel.r : this.firstVisibleRow(); this.sel = { r: r0, c: a, ar: r0, ac: a, ranges: [...prev, q] }; this.afterSel(); },
    selectRows(a, b, shift, add, drag) { const lo = Math.min(a, b), hi = Math.max(a, b); const q = { r1: lo, r2: hi, c1: 0, c2: MAXC - 1 }; if (shift && this.sel && !drag) { const l = Math.min(this.sel.ar, a, b), h = Math.max(this.sel.ar, a, b); this.sel.ranges[this.sel.ranges.length - 1] = { r1: l, r2: h, c1: 0, c2: MAXC - 1 }; this.afterSel(); return; } const prev = add && this.sel ? this.sel.ranges : []; if (drag && this.sel) { this.sel.ranges[this.sel.ranges.length - 1] = q; this.afterSel(); return; } this.sel = { r: a, c: 0, ar: a, ac: 0, ranges: [...prev, q] }; this.afterSel(); },
    firstVisibleRow() { return this.grid.vis ? this.grid.vis.r0 : 0; },
    selectAll() { this.sel = { r: this.sel.r, c: this.sel.c, ar: this.sel.r, ac: this.sel.c, ranges: [{ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }] }; this.afterSel(); },
    selectRange(q, active) { q = this.norm(q.r1, q.c1, q.r2, q.c2); const a = active || { r: q.r1, c: q.c1 }; this.sel = { r: a.r, c: a.c, ar: a.r, ac: a.c, ranges: [this.expandMerge(q)] }; this.afterSel(); },
    inSelection(r, c) { return this.sel.ranges.some((q) => r >= q.r1 && r <= q.r2 && c >= q.c1 && c <= q.c2); },
    colSelected(c) { return this.sel.ranges.some((q) => q.r1 === 0 && q.r2 >= MAXR - 1 && c >= q.c1 && c <= q.c2); },
    rowSelected(r) { return this.sel.ranges.some((q) => q.c1 === 0 && q.c2 >= MAXC - 1 && r >= q.r1 && r <= q.r2); },
    selColsRange() { const q = this.sel.ranges.filter((q) => q.r1 === 0 && q.r2 >= MAXR - 1).slice(-1)[0]; return [q.c1, q.c2]; },
    selRowsRange() { const q = this.sel.ranges.filter((q) => q.c1 === 0 && q.c2 >= MAXC - 1).slice(-1)[0]; return [q.r1, q.r2]; },
    afterSel() { this.sheet.sel = this.sel; this.grid.invalidate(); cancelAnimationFrame(this._sel); this._sel = requestAnimationFrame(() => { this.refreshBars(); this.updateStats(); this.renderInspector && this.renderInspector(true); this.updateEditingFromSel && 0; }); },
    afterSelectionChange() { this.refreshBars(); },
    moveActive(dr, dc, extend, jump) {
      const s = this.sel, sh = this.sheet; let r = extend ? (s.er != null ? s.er : s.r) : s.r, c = extend ? (s.ec != null ? s.ec : s.c) : s.c;
      if (extend && s.er == null) { r = s.r; c = s.c; }
      const m = !extend ? sh.mergeAt(s.r, s.c) : null; if (m) { if (dr > 0) r = m[2]; if (dc > 0) c = m[3]; if (dr < 0) r = m[0]; if (dc < 0) c = m[1]; }
      if (jump) { [r, c] = this.jumpEdge(r, c, dr, dc); } else { r += dr; c += dc; while (r >= 0 && r < MAXR && sh.hiddenRows[r] && dr) r += dr; while (c >= 0 && c < MAXC && sh.hiddenCols[c] && dc) c += dc; }
      r = clamp(r, 0, MAXR - 1); c = clamp(c, 0, MAXC - 1); this.grid.ensureRow(r);
      if (extend) { const q = this.expandMerge(this.norm(s.ar, s.ac, r, c)); s.ranges[s.ranges.length - 1] = q; s.er = r; s.ec = c; this.afterSel(); this.grid.scrollTo(r, c); }
      else { this.selectCell(r, c); this.grid.scrollTo(this.sel.r, this.sel.c); }
    },
    jumpEdge(r, c, dr, dc) {
      const sh = this.sheet; const has = (rr, cc) => { const v = sh.getValue(rr, cc); return v !== null && v !== ''; }; const mr = sh.maxRow(), mc = sh.maxCol();
      const inb = (rr, cc) => rr >= 0 && rr < MAXR && cc >= 0 && cc < MAXC; let rr = r + dr, cc = c + dc; if (!inb(rr, cc)) return [r, c];
      const limR = dr > 0 ? Math.max(mr, r) : 0, limC = dc > 0 ? Math.max(mc, c) : 0;
      if (has(r, c) && has(rr, cc)) { while (inb(rr + dr, cc + dc) && has(rr + dr, cc + dc)) { rr += dr; cc += dc; } return [rr, cc]; }
      rr = r + dr; cc = c + dc; while (inb(rr, cc) && !has(rr, cc)) { if ((dr > 0 && rr > limR) || (dc > 0 && cc > limC)) { return dr > 0 ? [MAXR - 1, c] : [r, MAXC - 1]; } rr += dr; cc += dc; if (dr < 0 && rr < 0 || dc < 0 && cc < 0) return dr < 0 ? [0, c] : [r, 0]; }
      return inb(rr, cc) ? [rr, cc] : [clamp(rr, 0, MAXR - 1), clamp(cc, 0, MAXC - 1)];
    },
    goTo(r, c) { this.selectCell(r, c); this.grid.ensureRow(r); this.grid.scrollTo(r, c); },
    focusKb() { const k = $('#kb'); if (document.activeElement !== k && !this.editing) k.focus({ preventScroll: true }); },
    // ================= bars (name box, formula bar, status) =================
    cellAddr() { const s = this.sel; return ZN.addr(s.r, s.c); },
    refreshBars() {
      const nb = $('#namebox'), fi = $('#finput'); if (!this.sel) return; const q = this.sel.ranges[this.sel.ranges.length - 1];
      if (document.activeElement !== nb) { const single = q.r1 === q.r2 && q.c1 === q.c2; const nm = single ? this.nameFor(q) : null; nb.value = nm || (single || (this.sheet.mergeAt(q.r1, q.c1) && this.sheet.mergeAt(q.r1, q.c1)[2] === q.r2 && this.sheet.mergeAt(q.r1, q.c1)[3] === q.c2) ? ZN.addr(this.sel.r, this.sel.c) : this.rangeLabel(q)); }
      if (!this.editing && document.activeElement !== fi) { fi.value = this.rawText(this.sheet.getCell(this.sel.r, this.sel.c)); fi.disabled = false; }
      this.updateFmtBar(); this.updateStatusMsg();
      const ub = $('#tb-undo'); if (ub) { ub.disabled = !this.wb.canUndo(); $('#tb-redo').disabled = !this.wb.canRedo(); }
    },
    nameFor(q) { for (const nm of this.wb.names.values()) { const r = FM.parseRef(nm.ref); if (r && r.kind === 'cell' && r.r1 === q.r1 && r.c1 === q.c1 && (r.sheet == null || r.sheet.toLowerCase() === this.sheet.name.toLowerCase())) return nm.name; } return null; },
    rangeLabel(q) { if (q.r1 === 0 && q.r2 >= MAXR - 1) return ZN.colName(q.c1) + ':' + ZN.colName(q.c2); if (q.c1 === 0 && q.c2 >= MAXC - 1) return (q.r1 + 1) + ':' + (q.r2 + 1); const rows = q.r2 - q.r1 + 1, cols = q.c2 - q.c1 + 1; return this.grid.drag && this.grid.drag.m === 'select' ? rows + 'R × ' + cols + 'C' : ZN.rangeAddr(q.r1, q.c1, q.r2, q.c2); },
    rawText(cell) {
      if (!cell) return ''; if (cell.f !== undefined) return '=' + cell.f; if (cell.sp !== undefined && cell.v !== undefined) return ZN.numToStr ? this.valText(cell.v, cell) : ''; return this.valText(cell.v, cell);
    },
    valText(v, cell) {
      if (v === undefined || v === null) return ''; if (v instanceof ZN.ZErr) return v.code; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (typeof v === 'number') { const nf = (this.wb.style(cell && cell.s !== undefined ? cell.s : 0).nf) || 'General'; if (ZN.fmt && nf !== 'General') { if (ZN.fmt.isDate && ZN.fmt.isDate(nf)) { try { const hasT = v !== Math.floor(v); const code = /[hs]/i.test(nf.replace(/\[[^\]]*\]|"[^"]*"/g, '')) ? (/[ymd]/i.test(nf.replace(/\[[^\]]*\]|"[^"]*"/g, '')) ? 'm/d/yyyy h:mm:ss' : 'h:mm:ss') : 'm/d/yyyy'; return ZN.fmt.format(v, hasT && code === 'm/d/yyyy' ? 'm/d/yyyy h:mm:ss' : code).text; } catch (e) { /* fall */ } } if (/%/.test(nf) && !/[#0?]\s*"?%/.test('') ) { const p = parseFloat((v * 100).toPrecision(15)); return String(p) + '%'; } } return ZN.numToStr(v); }
      const t = String(v); if (typeof v === 'string' && (t[0] === '=' || (t && ZN.parseValue && ZN.parseValue(t) && (this.wb.style(cell && cell.s !== undefined ? cell.s : 0).nf !== '@')))) return "'" + t; return t;
    },
    updateStatusMsg() { const m = $('#st-msg'); if (!m) return; const f = this.sheet.filters; let msg = this.editing ? (this.editing.mode === 'enter' ? 'Enter' : 'Edit') : 'Ready'; if (f && f.range && f.criteria && Object.keys(f.criteria).length) { const hidden = Object.keys(this.sheet.hiddenRows).length; msg += ' · Filtered: ' + hidden + ' rows hidden'; } if (this.wb.lastCalc.ms > 200) msg += ' · Calc ' + Math.round(this.wb.lastCalc.ms) + ' ms'; m.textContent = msg; },
    updateStats() {
      const box = $('#st-stats'); if (!box || !ZN.tools || !ZN.tools.stats) return; const q = this.sel.ranges; if (q.length === 1 && q[0].r1 === q[0].r2 && q[0].c1 === q[0].c2) { box.textContent = ''; return; }
      clearTimeout(this._stT); this._stT = setTimeout(() => { try { const s = ZN.tools.stats(this.wb, this.sheet, this.sel.ranges); const f = (n) => ZN.fmt ? ZN.fmt.format(n, Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4 && n !== 0 ? '0.####E+00' : '#,##0.####').text : String(n); box.innerHTML = ''; const add = (k, v) => box.append(el('span', el('b', k), v)); if (s.countNums) { add('Average', f(s.avg)); add('Count', String(s.count)); add('Min', f(s.min)); add('Max', f(s.max)); add('Sum', f(s.sum)); } else if (s.count) add('Count', String(s.count)); } catch (e) { box.textContent = ''; } }, 30);
    },
    // ================= formatting state helpers =================
    activeStyle() { return this.wb.style(this.sheet.styleId(this.sel.r, this.sel.c)); },
    updateFmtBar() {
      const st = this.activeStyle(), bar = $('#fmtbar'); if (!bar || !bar._ready) return; const set = (id, v) => { const x = $('#' + id); if (x && document.activeElement !== x) x.value = v; };
      set('fb-font', st.fn || 'System'); set('fb-size', String(st.fs ? Math.round(st.fs * 10) / 10 : 10)); const nf = st.nf || 'General'; const cat = ZN.fmt && ZN.fmt.categoryOf ? ZN.fmt.categoryOf(nf) : 'General'; const sel = $('#fb-nf'); if (sel) sel.value = ['General', 'Number', 'Currency', 'Accounting', 'Date', 'Time', 'Percentage', 'Fraction', 'Scientific', 'Text'].includes(cat) ? cat : 'Custom';
      const pr = (id, on) => { const b = $('#' + id); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); } }; pr('fb-b', st.b); pr('fb-i', st.i); pr('fb-u', st.u); pr('fb-k', st.k); pr('fb-wrap', st.wr); pr('fb-l', st.ha === 'left'); pr('fb-c', st.ha === 'center'); pr('fb-r', st.ha === 'right'); pr('fb-merge', !!this.sheet.mergeAt(this.sel.r, this.sel.c));
      const tc = $('#fb-fc .bar'); if (tc) tc.style.setProperty('--c', st.fc || 'var(--fg)'); const fb = $('#fb-bg .bar'); if (fb) fb.style.setProperty('--c', st.bg || 'transparent');
    },
    // ================= editing =================
    beginEdit(r, c, initial, from) {
      if (this.editing) return; const sh = this.sheet; const m = sh.mergeAt(r, c); if (m) { r = m[0]; c = m[1]; } this.grid.scrollTo(r, c); const cell = sh.getCell(r, c);
      if (cell && cell.sp !== undefined && initial == null) { /* editing a spilled value: show value but it will override */ }
      const text = initial != null ? initial : this.rawText(cell); const mode = initial != null ? 'enter' : 'edit';
      this.editing = { r, c, mode, from: from || 'cell', text, orig: text, sheet: sh, pointing: null }; this.buildEditor(); this.updateStatusMsg();
    },
    buildEditor() {
      const e = this.editing, g = this.grid, sh = this.sheet; const st = this.wb.style(sh.styleId(e.r, e.c)); const rc = g.cellRect(e.r, e.c); const z = g.z;
      const fpx = (st.fs ? st.fs * 4 / 3 : 13) * z; const box = el('.zn-editor'); const hl = el('div.hl'); const ta = el('textarea', { spellcheck: false, autocomplete: 'off', value: e.text, 'aria-label': 'Cell editor' });
      Object.assign(ta.style, { font: g.fontOf(st, z), color: 'transparent', caretColor: 'var(--fg)', width: '100%', height: '100%', position: 'relative', zIndex: 1, textAlign: st.ha === 'right' ? 'right' : st.ha === 'center' ? 'center' : 'left' });
      Object.assign(hl.style, { position: 'absolute', inset: '0', padding: '0 4px', font: g.fontOf(st, z), whiteSpace: 'pre', pointerEvents: 'none', color: st.fc || 'var(--fg)', textAlign: ta.style.textAlign, lineHeight: '1.25', overflow: 'hidden' });
      box.append(hl, ta); Object.assign(box.style, { left: rc.x + 'px', top: rc.y + 'px', minWidth: rc.w + 'px', height: rc.h + 'px', fontSize: fpx + 'px' }); box.style.position = 'absolute'; $('#overlay').append(box);
      ta.style.paddingTop = Math.max(0, (rc.h - fpx * 1.25) / (st.va === 'top' ? 4 : st.va === 'middle' ? 2 : 1.15)) + 'px'; hl.style.paddingTop = ta.style.paddingTop;
      e.box = box; e.ta = ta; e.hl = hl; const fi = $('#finput');
      ta.addEventListener('input', () => { e.text = ta.value; fi.value = ta.value; this.onEditInput('cell'); }); ta.addEventListener('keydown', (ev) => this.editKey(ev)); ta.addEventListener('keyup', () => this.onEditCaret()); ta.addEventListener('pointerup', () => this.onEditCaret()); ta.addEventListener('blur', () => { /* keep editing; commit on click elsewhere */ });
      ta.addEventListener('scroll', () => { hl.scrollLeft = ta.scrollLeft; });
      fi.value = e.text; this.sizeEditor(); this.onEditInput('cell', true); ta.focus(); if (e.from === 'cell') { const n = e.text.length; ta.setSelectionRange(n, n); }
    },
    sizeEditor() {
      const e = this.editing; if (!e) return; const g = this.grid, st = this.wb.style(this.sheet.styleId(e.r, e.c)), z = g.z; const rc = g.cellRect(e.r, e.c); const font = g.fontOf(st, z); const lines = e.ta.value.split('\n'); let w = 0; for (const l of lines) w = Math.max(w, g.measure(l || ' ', font)); w += 20; const fpx = (st.fs ? st.fs * 4 / 3 : 13) * z;
      const maxW = Math.max(rc.w, g.vw - rc.x - 10); const nw = clamp(Math.max(rc.w, w), rc.w, maxW); const h = Math.max(rc.h, lines.length * fpx * 1.25 + 6); e.box.style.minWidth = rc.w + 'px'; e.box.style.width = nw + 'px'; e.box.style.height = h + 'px'; e.box.style.left = rc.x + 'px'; e.box.style.top = rc.y + 'px';
      if (st.ha === 'right') { e.box.style.left = Math.max(0, rc.x + rc.w - nw) + 'px'; }
    },
    setEditText(t, caret) { const e = this.editing; e.text = t; e.ta.value = t; $('#finput').value = t; if (caret != null) e.ta.setSelectionRange(caret, caret); this.onEditInput('cell'); },
    onEditInput(src, init) {
      const e = this.editing; if (!e) return; if (src === 'bar') { e.ta.value = e.text; }
      this.sizeEditor(); this.paintEditHl(); this.updateRefHighlights(); this.updateAutocomplete(init); if (!init) { e.pointing = e.pointing && e.pointing.stillValid ? e.pointing : null; }
    },
    onEditCaret() { const e = this.editing; if (!e) return; this.updateAutocomplete(); this.updateRefHighlights(); },
    caret() { const e = this.editing; const t = e.from === 'bar' ? $('#finput') : e.ta; return t.selectionStart; },
    paintEditHl() {
      const e = this.editing; if (!e) return; const t = e.text; e.hl.textContent = ''; if (t[0] !== '=') { e.hl.textContent = t; e.ta.style.color = ''; e.hl.style.display = 'none'; return; } e.hl.style.display = ''; e.ta.style.color = 'transparent';
      let toks; try { toks = FM.tokenize(t.slice(1)); } catch (x) { e.hl.textContent = t; return; } let pos = 0; e.hl.append('='); const seen = new Map(); let n = 0;
      for (const k of toks) { if (k.start > pos) e.hl.append(t.slice(1 + pos, 1 + k.start)); const txt = t.slice(1 + k.start, 1 + k.end); if (k.type === 'ref') { const key = ZN.formula.printRef(Object.assign({}, k.ref, { sheet: null })).replace(/\$/g, ''); if (!seen.has(key)) seen.set(key, REFCOLORS[n++ % REFCOLORS.length]); e.hl.append(el('span', { style: { color: seen.get(key) } }, txt)); } else if (k.type === 'func') e.hl.append(el('span', { style: { color: 'var(--accent-ink)', fontWeight: '500' } }, txt)); else if (k.type === 'str') e.hl.append(el('span', { style: { color: '#c7513c' } }, txt)); else if (k.type === 'num' || k.type === 'bool') e.hl.append(el('span', { style: { color: '#2f7fe0' } }, txt)); else e.hl.append(txt); pos = k.end; }
      if (pos < t.length - 1) e.hl.append(t.slice(1 + pos));
    },
    updateRefHighlights() {
      const e = this.editing; const g = this.grid; if (!e || e.text[0] !== '=') { g.refHighlights = []; g.invalidate(); return; }
      let toks; try { toks = FM.tokenize(e.text.slice(1)); } catch (x) { g.refHighlights = []; g.invalidate(); return; } const out = []; const seen = new Map(); let n = 0;
      for (const k of toks) if (k.type === 'ref') { if (k.ref.sheet && k.ref.sheet.toLowerCase() !== this.sheet.name.toLowerCase()) continue; const key = ZN.formula.printRef(Object.assign({}, k.ref, { sheet: null })).replace(/\$/g, ''); if (!seen.has(key)) seen.set(key, REFCOLORS[n++ % REFCOLORS.length]); out.push({ r1: k.ref.r1, c1: k.ref.c1, r2: k.ref.r2, c2: k.ref.c2, color: seen.get(key) }); }
      g.refHighlights = out; g.invalidate();
    },
    // ----- point mode (clicking cells while typing a formula) -----
    canPointRef() {
      const e = this.editing; if (!e) return false; if (e.text[0] !== '=') return false; if (e.pointing) return true; const pos = e.from === 'bar' ? $('#finput').selectionStart : e.ta.selectionStart; const before = e.text.slice(0, pos).replace(/\s+$/, ''); if (!before) return false; return /[=+\-*\/^&<>(,;:{|@%]$/.test(before) && !/^[^=]*$/.test(before);
    },
    pointStart(r, c, shift) {
      const e = this.editing; const ctl = e.from === 'bar' ? $('#finput') : e.ta; const pos = ctl.selectionStart; let s = pos, en = ctl.selectionEnd;
      if (e.pointing) { s = e.pointing.s; en = e.pointing.e; } const ref = this.refText(r, c, r, c); const t = e.text.slice(0, s) + ref + e.text.slice(en); e.pointing = { s, e: s + ref.length, r1: r, c1: c, stillValid: true }; e.text = t; ctl.value = t; if (ctl !== e.ta) e.ta.value = t; else $('#finput').value = t; ctl.setSelectionRange(s + ref.length, s + ref.length); this.onEditInput('x'); e.pointing.stillValid = true;
    },
    refText(r1, c1, r2, c2) { const q = this.norm(r1, c1, r2, c2); const same = this.editing && this.editing.sheet !== this.sheet; const pre = same ? FM.quoteSheet(this.sheet.name) + '!' : ''; return pre + (q.r1 === q.r2 && q.c1 === q.c2 ? ZN.addr(q.r1, q.c1) : ZN.addr(q.r1, q.c1) + ':' + ZN.addr(q.r2, q.c2)); },
    pointExtend(r, c) { const e = this.editing; if (!e.pointing) return; const p = e.pointing; const ref = this.refText(p.r1, p.c1, r, c); const t = e.text.slice(0, p.s) + ref + e.text.slice(p.e); p.e = p.s + ref.length; e.text = t; e.ta.value = t; $('#finput').value = t; (e.from === 'bar' ? $('#finput') : e.ta).setSelectionRange(p.e, p.e); this.onEditInput('x'); p.stillValid = true; },
    pointEnd() { const e = this.editing; if (e && e.pointing) e.pointing.stillValid = true; (e.from === 'bar' ? $('#finput') : e.ta).focus(); },
    pointMove(dr, dc, shift) { const e = this.editing; const p = e.pointing; let r, c; if (p) { r = (p.cr != null ? p.cr : p.r1) + dr; c = (p.cc != null ? p.cc : p.c1) + dc; } else { r = this.editing.r + dr; c = this.editing.c + dc; } r = clamp(r, 0, MAXR - 1); c = clamp(c, 0, MAXC - 1); if (!p || !shift) { this.pointStart(r, c); e.pointing.cr = r; e.pointing.cc = c; } else { this.pointExtend(r, c); } if (!shift) { e.pointing.cr = r; e.pointing.cc = c; } this.grid.scrollTo(r, c); },
    // ----- autocomplete & hints -----
    updateAutocomplete(init) {
      const e = this.editing; this.closeAC(); if (!e || e.text[0] !== '=' || !ZN.fn) return; const ctl = e.from === 'bar' ? $('#finput') : e.ta; const pos = ctl.selectionStart; const before = e.text.slice(0, pos);
      const m = /([A-Za-z_][\w.]*)$/.exec(before); const prevCh = m ? before[before.length - m[1].length - 1] : null;
      if (m && (prevCh === undefined || /[=+\-*\/^&<>(,;:{|@%\s!]/.test(prevCh || '='))) { const w = m[1].toUpperCase(); const list = []; for (const d of ZN.fn.registry.values()) if (d.name.startsWith(w) && d.name !== w || (d.name === w && false)) list.push({ n: d.name, d: d.desc || d.cat || '', fn: true }); for (const nm of this.wb.names.values()) if (nm.name.toUpperCase().startsWith(w)) list.push({ n: nm.name, d: 'Named range', fn: false });
        list.sort((a, b) => a.n.length - b.n.length || (a.n < b.n ? -1 : 1)); if (list.length && !(list.length === 1 && list[0].n === w)) { this.showAC(list.slice(0, 40), m[1].length, pos); } }
      this.updateHint(before);
    },
    showAC(list, wlen, pos) {
      const e = this.editing; const pop = el('.zn-popup'); let hl = 0; const draw = () => { pop.replaceChildren(...list.map((x, i) => { const it = el('.it' + (i === hl ? '.hl' : ''), { onpointerdown: (ev) => { ev.preventDefault(); hl = i; this.acceptAC(); } }, el('span.nm', x.n), el('span.ds', x.d)); return it; })); const h = pop.querySelector('.hl'); h && h.scrollIntoView({ block: 'nearest' }); };
      draw(); const box = e.from === 'bar' ? $('#finput').getBoundingClientRect() : e.box.getBoundingClientRect(); const host = $('#gridcol').getBoundingClientRect(); document.body.append(pop); pop.style.position = 'fixed'; pop.style.left = box.left + 'px'; pop.style.top = box.bottom + 4 + 'px'; pop.style.zIndex = 400;
      e.ac = { pop, list, get hl() { return hl; }, set hl(v) { hl = v; draw(); }, wlen, pos };
    },
    closeAC() { const e = this.editing; if (e && e.ac) { e.ac.pop.remove(); e.ac = null; } if (this._hint) { this._hint.remove(); this._hint = null; } },
    acceptAC() { const e = this.editing; if (!e || !e.ac) return false; const it = e.ac.list[e.ac.hl]; const ctl = e.from === 'bar' ? $('#finput') : e.ta; const pos = e.ac.pos; const start = pos - e.ac.wlen; const ins = it.n + (it.fn ? '(' : ''); const t = e.text.slice(0, start) + ins + e.text.slice(pos); this.closeAC(); e.text = t; ctl.value = t; if (ctl !== e.ta) e.ta.value = t; else $('#finput').value = t; ctl.setSelectionRange(start + ins.length, start + ins.length); this.onEditInput('x'); return true; },
    updateHint(before) {
      const e = this.editing; if (!e || e.ac) return; let toks; try { toks = FM.tokenize(before.slice(1)); } catch (x) { return; } const stack = []; for (const k of toks) { if (k.type === 'func') stack.push({ name: k.name, arg: 0 }); else if (k.type === 'paren' && k.text === '(') { if (!(stack.length && stack[stack.length - 1].open === undefined && toks[toks.indexOf(k) - 1] && toks[toks.indexOf(k) - 1].type === 'func')) stack.push({ name: null, arg: 0 }); else stack[stack.length - 1].open = true; } else if (k.type === 'paren' && k.text === ')') stack.pop(); else if (k.type === 'sep' && stack.length) stack[stack.length - 1].arg++; }
      let f = null; for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) { f = stack[i]; break; } if (!f) return; const d = ZN.fn.get(f.name); if (!d || !d.hint) return;
      const inner = d.hint.slice(d.hint.indexOf('(') + 1, d.hint.lastIndexOf(')')); const parts = []; let depth = 0, cur = ''; for (const ch of inner) { if (ch === '[') depth++; if (ch === ']') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) parts.push(cur.trim());
      let ai = Math.min(f.arg, Math.max(0, parts.length - 1)); if (parts.length && /…|\.\.\./.test(parts[parts.length - 1]) && f.arg >= parts.length) ai = parts.length - 1;
      const tip = el('.zn-hint', d.name + '(', ...parts.flatMap((p, i) => [i ? ', ' : '', i === ai ? el('b', p) : p]), ')', d.desc ? el('span.d', d.desc) : null);
      const box = e.from === 'bar' ? $('#finput').getBoundingClientRect() : e.box.getBoundingClientRect(); document.body.append(tip); tip.style.position = 'fixed'; tip.style.left = box.left + 'px'; tip.style.top = box.bottom + 6 + 'px'; tip.style.zIndex = 399; this._hint = tip;
    },
    editKey(ev) {
      const e = this.editing; if (!e) return; const k = ev.key; const mod = ev.metaKey || ev.ctrlKey; if (ev.isComposing) return;
      if (e.ac) { if (k === 'ArrowDown') { ev.preventDefault(); e.ac.hl = (e.ac.hl + 1) % e.ac.list.length; return; } if (k === 'ArrowUp') { ev.preventDefault(); e.ac.hl = (e.ac.hl - 1 + e.ac.list.length) % e.ac.list.length; return; } if (k === 'Tab' || (k === 'Enter' && !mod && !ev.altKey)) { ev.preventDefault(); this.acceptAC(); return; } if (k === 'Escape') { ev.preventDefault(); this.closeAC(); return; } }
      const dirOf = () => (ev.shiftKey ? -1 : 1);
      if (k === 'Enter' && ev.altKey) { ev.preventDefault(); const ctl = e.from === 'bar' ? $('#finput') : e.ta; if (e.from === 'bar') return; const s = ctl.selectionStart, en = ctl.selectionEnd; this.setEditText(e.text.slice(0, s) + '\n' + e.text.slice(en), s + 1); return; }
      if (k === 'Enter') { ev.preventDefault(); if (mod) { this.commitEdit(0, true); return; } this.commitEdit(ev.shiftKey ? 'up' : 'down'); return; }
      if (k === 'Tab') { ev.preventDefault(); this.commitEdit(ev.shiftKey ? 'left' : 'right'); return; }
      if (k === 'Escape') { ev.preventDefault(); this.cancelEdit(); return; }
      if (k === 'F2') { ev.preventDefault(); e.mode = e.mode === 'enter' ? 'edit' : 'enter'; this.updateStatusMsg(); return; }
      if (k === 'F4' && e.text[0] === '=') { ev.preventDefault(); this.cycleAbs(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !mod && !ev.altKey) {
        const dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0, dc = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
        if (e.text[0] === '=' && (e.mode === 'enter' || e.pointing) && this.canPointRef() && !(ev.target && ev.target.selectionStart !== ev.target.selectionEnd)) { ev.preventDefault(); this.pointMove(dr, dc, ev.shiftKey); return; }
        if (e.mode === 'enter' && e.text[0] !== '=' && e.from === 'cell') { ev.preventDefault(); this.commitEdit(k === 'ArrowUp' ? 'up' : k === 'ArrowDown' ? 'down' : k === 'ArrowLeft' ? 'left' : 'right'); return; }
      }
      if (mod && k.toLowerCase() === 'z') { return; }
      if (e.pointing && k.length === 1 && !mod) e.pointing = null;
    },
    cycleAbs() {
      const e = this.editing; const ctl = e.from === 'bar' ? $('#finput') : e.ta; const pos = ctl.selectionStart; let toks; try { toks = FM.tokenize(e.text.slice(1)); } catch (x) { return; } const k = toks.find((t) => t.type === 'ref' && t.start + 1 <= pos && t.end + 1 >= pos); if (!k) return; const r = Object.assign({}, k.ref); const st = (r.ar1 ? 2 : 0) + (r.ac1 ? 1 : 0); const nxt = { 0: [true, true], 3: [true, false], 2: [false, true], 1: [false, false] }[st]; const [ar, ac] = nxt; r.ar1 = r.ar2 = ar; r.ac1 = r.ac2 = ac; const txt = FM.printRef(r); const t = e.text.slice(0, k.start + 1) + txt + e.text.slice(k.end + 1); this.setEditText(t, k.start + 1 + txt.length);
    },
    cancelEdit() { const e = this.editing; if (!e) return; this.closeAC(); e.box && e.box.remove(); this.editing = null; this.grid.refHighlights = []; this.grid.invalidate(); this.refreshBars(); this.focusKb(); },
    // dir: 0 stay | 'down'|'up'|'left'|'right'; fillSel = Ctrl+Enter
    commitEdit(dir, fillSel) {
      const e = this.editing; if (!e) return true; const text = e.text; const sh = e.sheet; const { r, c } = e;
      const cell = sh.getCell(r, c); const orig = this.rawText(cell);
      if (text !== e.orig || text !== orig || fillSel) {
        if (text !== '' && text[0] !== '=' && ZN.tools && ZN.tools.validate) { const res = ZN.tools.validate(this.wb, sh, r, c, text); if (res && !res.ok) { if (res.style === 'stop' || !res.style) { zk.alert(res.title || 'Invalid value', res.message || 'This value doesn’t match the data validation restrictions for this cell.'); return false; } } }
        const targets = fillSel ? this.selCells() : [[r, c]]; let err = null;
        this.wb.tx('Edit Cell', () => { for (const [rr, cc] of targets) { const t = fillSel && text[0] === '=' ? '=' + FM.translate(text.slice(1), rr - r, cc - c) : text; const res = this.wb.setInput(sh, rr, cc, t); if (!res.ok) { err = res; break; } } if (err) return; });
        if (err) { zk.alert('There’s a problem with this formula', err.error + (err.pos != null ? ' (at character ' + (err.pos + 2) + ')' : '')); return false; }
        const nc = sh.getCell(r, c); if (nc && this.wb.style(nc.s || 0).wr) this.autoFitRows([r, r], true);
      }
      this.closeAC(); e.box.remove(); this.editing = null; this.grid.refHighlights = []; this.focusKb();
      if (dir) this.afterCommitMove(dir); this.refreshBars(); this.grid.invalidate(); return true;
    },
    selCells() { const out = []; for (const q of this.sel.ranges) { if ((q.r2 - q.r1 + 1) * (q.c2 - q.c1 + 1) > 100000) continue; for (let r = q.r1; r <= q.r2; r++) for (let c = q.c1; c <= q.c2; c++) out.push([r, c]); } return out; },
    afterCommitMove(dir) {
      const s = this.sel; const q = s.ranges[s.ranges.length - 1]; const multi = (q.r1 !== q.r2 || q.c1 !== q.c2) && s.ranges.length === 1; const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
      if (multi && !this.sheet.mergeAt(s.r, s.c)) { let r = s.r + dr, c = s.c + dc; if (dc) { if (c > q.c2) { c = q.c1; r++; } if (c < q.c1) { c = q.c2; r--; } if (r > q.r2) r = q.r1; if (r < q.r1) r = q.r2; } else { if (r > q.r2) { r = q.r1; c++; } if (r < q.r1) { r = q.r2; c--; } if (c > q.c2) c = q.c1; if (c < q.c1) c = q.c2; } s.r = r; s.c = c; s.ar = r; s.ac = c; this.afterSel(); this.grid.scrollTo(r, c); return; }
      if (dir === 'right' || dir === 'left') { const st = this.tabStart; if (dir === 'right' && st == null) this.tabStart = s.c; } else if (this.tabStart != null && dir === 'down') { this.moveActive(1, 0); this.selectCell(this.sel.r, this.tabStart); this.grid.scrollTo(this.sel.r, this.sel.c); this.tabStart = null; return; }
      this.moveActive(dr, dc); if (dir !== 'right') this.tabStart = null;
    },
    // ================= keyboard (grid) =================
    onKey(ev) {
      if (ev.defaultPrevented || this.editing) return; if (document.activeElement && document.activeElement !== $('#kb') && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      const k = ev.key, mod = ev.metaKey || ev.ctrlKey, sh = ev.shiftKey, alt = ev.altKey; const mac = zeng.platform === 'mac'; const s = this.sel;
      const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (this.selChart) { if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); this.deleteChart(this.selChart); return; } if (k === 'Escape') { this.selectChart(null); return; } const d = nav[k]; if (d) { ev.preventDefault(); this.nudgeChart(this.selChart, d[1] * (sh ? 10 : 1), d[0] * (sh ? 10 : 1)); return; } }
      if (nav[k] && !alt) { ev.preventDefault(); const [dr, dc] = nav[k]; if (mac && mod && false) return; this.moveActive(dr, dc, sh, mod); return; }
      switch (k) {
        case 'Tab': ev.preventDefault(); if (this.tabStart == null) this.tabStart = s.c; this.afterCommitMove(sh ? 'left' : 'right'); this.refreshBars(); return;
        case 'Enter': ev.preventDefault(); if (alt) { this.beginEdit(s.r, s.c, null); return; } if (this.selRanges().length === 1 && !(this.sel.ranges[0].r1 === this.sel.ranges[0].r2 && this.sel.ranges[0].c1 === this.sel.ranges[0].c2)) this.afterCommitMove(sh ? 'up' : 'down'); else { this.moveActive(sh ? -1 : 1, 0); if (this.tabStart != null && !sh) { this.selectCell(this.sel.r, this.tabStart); } } this.tabStart = null; return;
        case 'F2': ev.preventDefault(); this.beginEdit(s.r, s.c, null); return;
        case 'F9': ev.preventDefault(); this.recalcAll(); return;
        case 'Escape': if (this.clipRanges) { this.clipRanges = null; this.grid.invalidate(); } return;
        case 'Delete': case 'Backspace': ev.preventDefault(); this.clearContents(); return;
        case 'Home': ev.preventDefault(); if (mod) this.goTo(0, 0); else this.moveTo(s.r, 0, sh); return;
        case 'End': ev.preventDefault(); if (mod) this.goTo(Math.max(0, this.sheet.maxRow()), Math.max(0, this.sheet.maxCol())); else this.moveActive(0, 1, sh, true); return;
        case 'PageDown': case 'PageUp': { ev.preventDefault(); const rows = Math.max(1, Math.floor((this.grid.vh - this.grid.hh) / (this.sheet.defRowH * this.grid.z)) - 1) * (k === 'PageDown' ? 1 : -1); const g = this.grid; if (alt) this.moveActive(0, rows > 0 ? 8 : -8, sh); else { g.sc.scrollTop += rows * this.sheet.defRowH * g.z; this.moveActive(rows, 0, sh); } return; }
        case ' ': if (mod) { ev.preventDefault(); this.selectCols(s.c, s.c); return; } if (sh) { ev.preventDefault(); this.selectRows(s.r, s.r); return; } break;
      }
      if (mod && !alt) {
        const key = k.toLowerCase();
        if (key === 'b') { ev.preventDefault(); this.toggleStyle('b'); return; } if (key === 'i') { ev.preventDefault(); this.toggleStyle('i'); return; } if (key === 'u') { ev.preventDefault(); this.toggleStyle('u'); return; }
        if (key === 'd') { ev.preventDefault(); this.fillDirection('down'); return; } if (key === 'r') { ev.preventDefault(); this.fillDirection('right'); return; }
        if (key === '1') { ev.preventDefault(); this.openInspector('cell'); return; } if (key === 'g') { ev.preventDefault(); this.dlgGoTo(); return; }
        if (key === ';') { ev.preventDefault(); this.insertNow(false); return; } if (key === ':') { ev.preventDefault(); this.insertNow(true); return; } if (key === '`') { ev.preventDefault(); this.toggleFormulas(); return; }
        if (key === '9') { ev.preventDefault(); this.hideRowsSel(); return; } if (key === '0') { ev.preventDefault(); this.hideColsSel(); return; }
        if (key === '-') { ev.preventDefault(); this.deleteCells(); return; } if (key === '=' || key === '+') { ev.preventDefault(); this.insertCells(); return; }
        if (key === 'z' || key === 'y' || key === 'c' || key === 'x' || key === 'v' || key === 'a' || key === 's' || key === 'f' || key === 'h' || key === 'p' || key === 'n' || key === 'o') return;
      }
      if (alt && (k === '=' || k === '≠')) { ev.preventDefault(); this.autoSum('SUM'); return; }
      if (alt && k === 'ArrowDown') { const b = this.grid.btns && this.grid.btns.find((b) => b.kind === 'dv' && b.r === s.r && b.c === s.c); if (b) { ev.preventDefault(); this.onGridButton(b); return; } }
      if (k.length === 1 && !mod && !alt) { ev.preventDefault(); this.beginEdit(s.r, s.c, k); return; }
      if (k === 'Process' || k === 'Unidentified') { this.beginEdit(s.r, s.c, ''); }
    },
    moveTo(r, c, extend) { const s = this.sel; if (extend) { const q = this.norm(s.ar, s.ac, r, c); s.ranges[s.ranges.length - 1] = this.expandMerge(q); s.er = r; s.ec = c; this.afterSel(); this.grid.scrollTo(r, c); } else this.goTo(r, c); },
    // ================= clipboard =================
    clipPayload() { const q = this.sel.ranges[this.sel.ranges.length - 1]; const r2 = Math.min(q.r2, Math.max(q.r1, this.sheet.maxRow())), c2 = Math.min(q.c2, Math.max(q.c1, this.sheet.maxCol())); return { q, r2, c2 }; },
    doCopy(e, cut) {
      if (this.editing || this.selChart && false) return false; const { q, r2, c2 } = this.clipPayload(); const multi = this.sel.ranges.length > 1; if (multi) zk.toast('Only the last selected range was copied');
      if (!ZN.io || !ZN.io.clip) return false; let tsv, html; try { tsv = ZN.io.clip.toTSV(this.sheet, q.r1, q.c1, r2, c2); html = ZN.io.clip.toHTML(this.sheet, q.r1, q.c1, r2, c2); } catch (x) { console.error(x); return false; }
      this.clipInternal = { payload: ZN.io.clip.internal(this.sheet, q.r1, q.c1, r2, c2), tsv: tsv.replace(/\r?\n$/, ''), cut, src: { sheet: this.sheet, r1: q.r1, c1: q.c1, r2, c2 } };
      if (e && e.clipboardData) { e.clipboardData.setData('text/plain', tsv); e.clipboardData.setData('text/html', html); e.preventDefault(); } else if (navigator.clipboard) { try { navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]).catch(() => navigator.clipboard.writeText(tsv)); } catch (x) { navigator.clipboard.writeText(tsv); } }
      this.clipRanges = { sheet: this.sheet, ranges: [{ r1: q.r1, c1: q.c1, r2, c2 }] }; this.grid.invalidate(); return true;
    },
    doCut(e) { if (this.editing) return; if (this.doCopy(e, true)) { /* cut completes on paste (move) */ } },
    async doPaste(e) {
      if (this.editing) return; let text = '', html = ''; if (e && e.clipboardData) { text = e.clipboardData.getData('text/plain'); html = e.clipboardData.getData('text/html'); e.preventDefault(); } else if (navigator.clipboard && navigator.clipboard.read) { try { for (const it of await navigator.clipboard.read()) { if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text(); if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text(); } } catch (x) { try { text = await navigator.clipboard.readText(); } catch (y) { return; } } }
      this.pasteData(text, html, 'all');
    },
    pasteData(text, html, mode, opts = {}) {
      const s = this.sel; const q = s.ranges[s.ranges.length - 1]; const r0 = Math.min(q.r1, q.r2), c0 = Math.min(q.c1, q.c2); const ci = this.clipInternal; const norm = (t) => (t || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
      const internal = ci && norm(text) === norm(ci.tsv);
      try {
        this.wb.tx('Paste', () => {
          if (internal) {
            const p = ci.payload; let tr = r0, tc = c0; const h = opts.transpose ? p.w : p.h, w = opts.transpose ? p.h : p.w; // tiling
            const qh = q.r2 - q.r1 + 1, qw = q.c2 - q.c1 + 1; const ny = qh > h && qh % h === 0 && q.r2 < MAXR - 1 ? qh / h : 1, nx = qw > w && qw % w === 0 && q.c2 < MAXC - 1 ? qw / w : 1;
            if (ci.cut && mode === 'all' && !opts.transpose) { this.moveRange({ r1: ci.src.r1, c1: ci.src.c1, r2: ci.src.r2, c2: ci.src.c2 }, { r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + w - 1 }, false, ci.src.sheet); this.clipInternal = null; this.clipRanges = null; this.selectRange({ r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + w - 1 }, { r: r0, c: c0 }); return; }
            for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) ZN.io.clip.pasteInternal(this.wb, this.sheet, tr + iy * h, tc + ix * w, p, { mode: opts.transpose ? 'transpose' : mode, relative: true, skipBlanks: opts.skipBlanks, op: opts.op });
            this.selectRange({ r1: r0, c1: c0, r2: r0 + h * ny - 1, c2: c0 + w * nx - 1 }, { r: r0, c: c0 }); if (ci.cut) { this.clipInternal = null; this.clipRanges = null; }
          } else {
            let rows = null; if (html && /<table/i.test(html) && mode !== 'values') { const t = ZN.io.clip.fromHTML(html); if (t.rows.length) rows = t.rows; }
            if (rows) { let h = rows.length, w = 0; rows.forEach((row, i) => { let c = 0; row.forEach((cl) => { if (!cl) return; const wcol = cl.colspan || 1; const hr = cl.rowspan || 1; if (mode === 'all' || mode === 'formats') { /* style */ } const rr = r0 + i, cc = c0 + c; if (mode !== 'formats') { const val = cl.f ? '=' + cl.f : cl.v == null ? '' : typeof cl.v === 'string' ? cl.v : String(cl.v); if (cl.v !== undefined || cl.f) this.wb.setInput(this.sheet, rr, cc, cl.f ? val : (typeof cl.v === 'string' ? cl.v : ZN.numToStr(cl.v))); } if (cl.style && mode !== 'values') { const patch = {}; for (const k in cl.style) patch[k] = cl.style[k]; if (cl.nf) patch.nf = cl.nf; this.wb.patchStyle(this.sheet, rr, cc, patch); } else if (cl.nf && mode !== 'values') this.wb.patchStyle(this.sheet, rr, cc, { nf: cl.nf }); c += wcol; }); w = Math.max(w, c); });
              this.selectRange({ r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + Math.max(0, w - 1) }, { r: r0, c: c0 }); }
            else { const grid = ZN.io.clip.fromTSV(text); const h = grid.length, w = Math.max(1, ...grid.map((r) => r.length)); const big = h * w > 20000; for (let i = 0; i < h; i++) for (let j = 0; j < grid[i].length; j++) { const t = grid[i][j]; this.wb.setInput(this.sheet, r0 + i, c0 + j, t, { force: true }); } this.selectRange({ r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + w - 1 }, { r: r0, c: c0 }); }
          }
        });
      } catch (x) { console.error(x); zk.alert('Couldn’t paste', x.message || String(x)); }
      this.refreshBars(); this.grid.scrollTo(r0, c0);
    },
    // ================= edit operations =================
    clearContents() { const cells = this.rangesCells(); if (!cells) return; this.wb.tx('Clear', () => { for (const q of this.sel.ranges) this.eachExisting(q, (r, c, cell) => { if (cell.sp !== undefined) return; const nc = cell.s !== undefined ? { v: undefined, s: cell.s } : undefined; this.wb.put(this.sheet, r, c, nc); }); }); this.refreshBars(); },
    clearFormats() { this.wb.tx('Clear Formats', () => { for (const q of this.sel.ranges) { this.eachExisting(q, (r, c, cell) => { if (cell.s === undefined) return; const nc = Object.assign({}, cell); delete nc.s; nc.deps = undefined; if (nc.v === undefined && nc.f === undefined) this.wb.put(this.sheet, r, c, undefined, true); else this.wb.put(this.sheet, r, c, nc, true); }); if (q.r1 === 0 && q.r2 >= MAXR - 1) this.wb.mod(this.sheet, 'colS', (o) => { for (let c = q.c1; c <= q.c2; c++) delete o[c]; }); if (q.c1 === 0 && q.c2 >= MAXC - 1) this.wb.mod(this.sheet, 'rowS', (o) => { for (let r = q.r1; r <= q.r2; r++) delete o[r]; }); } }); },
    clearAll() { this.wb.tx('Clear All', () => { for (const q of this.sel.ranges) this.eachExisting(q, (r, c) => this.wb.put(this.sheet, r, c, undefined)); }); },
    rangesCells() { return this.sel && this.sel.ranges.length; },
    eachExisting(q, fn) { const sh = this.sheet; const items = []; const c2 = Math.min(q.c2, sh.cols.length - 1); for (let c = q.c1; c <= c2; c++) { const col = sh.cols[c]; if (!col) continue; const r2 = Math.min(q.r2, col.length - 1); for (let r = q.r1; r <= r2; r++) { const cell = col[r]; if (cell !== undefined) items.push([r, c, cell]); } } for (const [r, c, cell] of items) fn(r, c, cell); },
    fillDirection(dir) {
      const q = this.sel.ranges[this.sel.ranges.length - 1]; if (!ZN.tools || !ZN.tools.autofill) return; let src, dst; if (dir === 'down') { if (q.r1 === q.r2) return; src = { r1: q.r1, c1: q.c1, r2: q.r1, c2: q.c2 }; dst = q; } else { if (q.c1 === q.c2) return; src = { r1: q.r1, c1: q.c1, r2: q.r2, c2: q.c1 }; dst = q; }
      this.wb.tx('Fill', () => ZN.tools.autofill(this.wb, this.sheet, src, dst, { mode: 'copy' })); this.refreshBars();
    },
    doFill(src, dst, alt) { if (!ZN.tools || !ZN.tools.autofill) return; this.wb.tx('Fill', () => ZN.tools.autofill(this.wb, this.sheet, src, dst, { mode: alt ? 'copy' : 'series' })); const r = this.norm(dst.r1, dst.c1, dst.r2, dst.c2); this.selectRange(r, { r: src.r1 < dst.r1 ? src.r1 : dst.r1 === src.r1 ? src.r1 : dst.r1, c: dst.c1 }); this.refreshBars(); },
    moveRange(src, dst, copy, srcSheet) {
      const wb = this.wb, sh = srcSheet || this.sheet, tsh = this.sheet; const dr = dst.r1 - src.r1, dc = dst.c1 - src.c1; if (!dr && !dc && sh === tsh) return;
      wb.tx(copy ? 'Copy Cells' : 'Move Cells', () => {
        const cells = []; for (let c = src.c1; c <= src.c2; c++) for (let r = src.r1; r <= Math.min(src.r2, sh.maxRow()); r++) { const x = sh.getCell(r, c); if (x && x.sp === undefined) cells.push([r, c, x]); }
        if (!copy) { // retarget references to moved cells everywhere
          const inside = (x, hostSheet) => { const target = x.sheet == null ? hostSheet : wb.sheetByName(x.sheet); return target === sh && x.r1 >= src.r1 && x.r2 <= src.r2 && x.c1 >= src.c1 && x.c2 <= src.c2; };
          for (const hs of wb.sheets) { const edits = []; hs.eachCellObj((cell, r, c) => { if (cell.f === undefined || cell.f.length < 2) return; const nf = FM.rewrite(cell.f, (x) => { if (!inside(x, hs)) return x; x.r1 += dr; x.r2 += dr; x.c1 += dc; x.c2 += dc; if (tsh !== sh) x.sheet = tsh.name; return x; }); if (nf !== cell.f) edits.push([r, c, Object.assign({}, cell, { f: nf, ast: null, deps: null, bad: false })]); }); for (const [r, c, nc] of edits) wb.put(hs, r, c, nc); }
          // the cells to move may have been rewritten above; re-read them
          for (let i = 0; i < cells.length; i++) { const [r, c] = cells[i]; cells[i][2] = sh.getCell(r, c); }
          for (const [r, c] of cells) wb.put(sh, r, c, undefined);
        } else for (const q of cells) q[2] = Object.assign({}, q[2]);
        // clear destination
        for (let c = dst.c1; c <= dst.c2; c++) for (let r = dst.r1; r <= Math.min(dst.r2, tsh.maxRow()); r++) { const x = tsh.getCell(r, c); if (x && x.sp === undefined) wb.put(tsh, r, c, undefined); }
        for (const [r, c, x] of cells) { const nc = Object.assign({}, x); nc.deps = undefined; nc.ast = null; nc.spill = undefined; if (copy && nc.f !== undefined) nc.f = FM.translate(nc.f, dr, dc); nc.bad = false; wb.put(tsh, r + dr, c + dc, nc); }
      });
      this.selectRange({ r1: dst.r1, c1: dst.c1, r2: dst.r2, c2: dst.c2 }, { r: dst.r1, c: dst.c1 }); this.clipRanges = null;
    },
    undo() { if (this.editing) { document.execCommand('undo'); return; } if (this.wb.undo()) this.afterUndo(); },
    redo() { if (this.editing) { document.execCommand('redo'); return; } if (this.wb.redo()) this.afterUndo(); },
    afterUndo() { this.sanitizeSel(); this.renderCharts(); this.refreshBars(); this.grid.invalidate(); },
    recalcAll() { this.wb.recalc(null); this.wb._emit('commit'); },
    insertNow(time) { const d = ZN.date.now(); const v = time ? d : Math.floor(d); this.wb.tx('Insert Date', () => { this.wb.setValue(this.sheet, this.sel.r, this.sel.c, v); this.wb.patchStyle(this.sheet, this.sel.r, this.sel.c, { nf: time ? 'h:mm AM/PM' : 'm/d/yyyy' }); }); this.refreshBars(); },
    toggleFormulas() { this.showFormulas = !this.showFormulas; this.grid.dispCache.clear(); this.grid.showFormulas = this.showFormulas; this.grid.invalidate(); this.renderMenus(); },
    autoSum(fn) {
      const s = this.sel, sh = this.sheet; const q = s.ranges[s.ranges.length - 1]; const multi = q.r1 !== q.r2 || q.c1 !== q.c2;
      this.wb.tx('AutoSum', () => {
        if (multi) { // sum each column below the selection
          for (let c = q.c1; c <= q.c2; c++) this.wb.setInput(sh, q.r2 + 1, c, `=${fn}(${ZN.rangeAddr(q.r1, c, q.r2, c)})`); this.selectCell(q.r2 + 1, q.c1); return; }
        let r = s.r - 1; const isNum = (rr, cc) => typeof sh.getValue(rr, cc) === 'number'; let found = false; if (r >= 0 && isNum(r, s.c)) { let r1 = r; while (r1 - 1 >= 0 && isNum(r1 - 1, s.c)) r1--; this.wb.setInput(sh, s.r, s.c, `=${fn}(${ZN.rangeAddr(r1, s.c, r, s.c)})`); found = true; }
        else if (s.c > 0 && isNum(s.r, s.c - 1)) { let c1 = s.c - 1; while (c1 - 1 >= 0 && isNum(s.r, c1 - 1)) c1--; this.wb.setInput(sh, s.r, s.c, `=${fn}(${ZN.rangeAddr(s.r, c1, s.r, s.c - 1)})`); found = true; }
        if (!found) { this.wb.setInput(sh, s.r, s.c, `=${fn}()`, { force: true }); }
      }); this.refreshBars(); if (!multi) { const c = this.sheet.getCell(this.sel.r, this.sel.c); if (c && c.f === `${fn}()`) { this.beginEdit(this.sel.r, this.sel.c, null); const ta = this.editing.ta; ta.setSelectionRange(fn.length + 1, fn.length + 1); } }
    },
    // ================= structure =================
    insertRows(above) { const q = this.sel.ranges[this.sel.ranges.length - 1]; const rows = q.r1 === 0 && q.r2 >= MAXR - 1 ? 1 : q.r2 - q.r1 + 1; const at = above ? q.r1 : q.r2 + 1; this.wb.structure(this.sheet, 'r', at, rows); this.selectRows(at, at + rows - 1); this.afterStructure(); },
    insertCols(left) { const q = this.sel.ranges[this.sel.ranges.length - 1]; const n = q.c1 === 0 && q.c2 >= MAXC - 1 ? 1 : q.c2 - q.c1 + 1; const at = left ? q.c1 : q.c2 + 1; this.wb.structure(this.sheet, 'c', at, n); this.selectCols(at, at + n - 1); this.afterStructure(); },
    deleteRowsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (q.r1 === 0 && q.r2 >= MAXR - 1) return; this.wb.structure(this.sheet, 'r', q.r1, -(q.r2 - q.r1 + 1)); this.selectCell(q.r1, this.sel.c); this.afterStructure(); },
    deleteColsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (q.c1 === 0 && q.c2 >= MAXC - 1) return; this.wb.structure(this.sheet, 'c', q.c1, -(q.c2 - q.c1 + 1)); this.selectCell(this.sel.r, q.c1); this.afterStructure(); },
    afterStructure() { this.grid.dispCache.clear(); this.renderCharts(); this.refreshAll(); },
    async insertCells() { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (q.c1 === 0 && q.c2 >= MAXC - 1) return this.insertRows(true); if (q.r1 === 0 && q.r2 >= MAXR - 1) return this.insertCols(true); const r = await this.pick('Insert', [['down', 'Shift cells down'], ['right', 'Shift cells right'], ['row', 'Entire row'], ['col', 'Entire column']]); if (!r) return; if (r === 'row') return this.insertRows(true); if (r === 'col') return this.insertCols(true);
      const h = q.r2 - q.r1 + 1, w = q.c2 - q.c1 + 1; const mr = this.sheet.maxRow(), mc = this.sheet.maxCol(); if (r === 'down') { if (mr < q.r1) return; this.moveRange({ r1: q.r1, c1: q.c1, r2: mr, c2: q.c2 }, { r1: q.r1 + h, c1: q.c1, r2: mr + h, c2: q.c2 }, false); } else { if (mc < q.c1) return; this.moveRange({ r1: q.r1, c1: q.c1, r2: q.r2, c2: mc }, { r1: q.r1, c1: q.c1 + w, r2: q.r2, c2: mc + w }, false); } this.selectRange(q); },
    async deleteCells() { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (q.c1 === 0 && q.c2 >= MAXC - 1) return this.deleteRowsSel(); if (q.r1 === 0 && q.r2 >= MAXR - 1) return this.deleteColsSel(); const r = await this.pick('Delete', [['up', 'Shift cells up'], ['left', 'Shift cells left'], ['row', 'Entire row'], ['col', 'Entire column']]); if (!r) return; if (r === 'row') return this.deleteRowsSel(); if (r === 'col') return this.deleteColsSel();
      const h = q.r2 - q.r1 + 1, w = q.c2 - q.c1 + 1; const mr = this.sheet.maxRow(), mc = this.sheet.maxCol(); this.wb.tx('Delete Cells', () => { for (let c = q.c1; c <= q.c2; c++) for (let rr = q.r1; rr <= Math.min(q.r2, mr); rr++) { const x = this.sheet.getCell(rr, c); if (x && x.sp === undefined) this.wb.put(this.sheet, rr, c, undefined); } if (r === 'up' && mr > q.r2) this.moveRange({ r1: q.r2 + 1, c1: q.c1, r2: mr, c2: q.c2 }, { r1: q.r1, c1: q.c1, r2: mr - h, c2: q.c2 }, false); else if (r === 'left' && mc > q.c2) this.moveRange({ r1: q.r1, c1: q.c2 + 1, r2: q.r2, c2: mc }, { r1: q.r1, c1: q.c1, r2: q.r2, c2: mc - w }, false); }); this.selectRange(q); },
    pick(title, opts) { let val = opts[0][0]; const body = el('.dlg-col', ...opts.map(([v, l], i) => el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, el('input.zk-radio', { type: 'radio', name: 'pick', checked: i === 0, onchange: () => { val = v; } }), l))); return zk.sheet({ title, body, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] }).then((r) => (r === 'ok' ? val : null)); },
    hideRowsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; this.wb.mod(this.sheet, 'hiddenRows', (o) => { for (let r = q.r1; r <= Math.min(q.r2, q.r1 + 200000); r++) o[r] = 1; }); this.selectCell(Math.min(q.r2 + 1, MAXR - 1), this.sel.c); this.grid.updateSpacer(); },
    hideColsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; this.wb.mod(this.sheet, 'hiddenCols', (o) => { for (let c = q.c1; c <= q.c2; c++) o[c] = 1; }); this.selectCell(this.sel.r, Math.min(q.c2 + 1, MAXC - 1)); this.grid.updateSpacer(); },
    unhideRowsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; this.wb.mod(this.sheet, 'hiddenRows', (o) => { for (let r = Math.max(0, q.r1 - 1); r <= q.r2 + 1; r++) delete o[r]; }); },
    unhideColsSel() { const q = this.sel.ranges[this.sel.ranges.length - 1]; this.unhideCols(Math.max(0, q.c1 - 1), q.c2 + 1); },
    unhideCols(a, b) { this.wb.mod(this.sheet, 'hiddenCols', (o) => { for (let c = a; c <= b; c++) delete o[c]; }); },
    setColWidth(a, b, w) { this.wb.mod(this.sheet, 'colW', (o) => { for (let c = a; c <= b; c++) { if (w === 0) delete o[c]; o[c] = w; } }); if (w === 0) this.wb.mod(this.sheet, 'hiddenCols', (o) => { for (let c = a; c <= b; c++) o[c] = 1; }); this.grid.updateSpacer(); this.layoutCharts(); },
    setRowHeight(a, b, h) { this.wb.mod(this.sheet, 'rowH', (o) => { for (let r = a; r <= Math.min(b, a + 100000); r++) o[r] = h; }); if (h === 0) this.wb.mod(this.sheet, 'hiddenRows', (o) => { for (let r = a; r <= b; r++) o[r] = 1; }); this.grid.updateSpacer(); this.layoutCharts(); },
    measureFn() { const g = this.grid; return (text, st) => g.measure(text, g.fontOf(st || {}, 1)); },
    autoFitCols(range) { const [a, b] = range; const sh = this.sheet, g = this.grid; const widths = {}; this.wb.tx('Autofit', () => { for (let c = a; c <= Math.min(b, a + 500); c++) { let w = 0; const col = sh.cols[c]; if (col) for (let r = 0; r < Math.min(col.length, 5000); r++) { const cell = col[r]; if (!cell || cell.v == null) continue; const st = this.wb.style(cell.s || 0); const d = ZN.fmt ? ZN.fmt.format(cell.v, st.nf || 'General') : { text: String(cell.v) }; let tw = g.measure(st.wr ? (d.text.split('\n').sort((x, y) => y.length - x.length)[0] || '') : d.text, g.fontOf(st, 1)) + 12 + (st.ind || 0) * 9; if (sh.filters && sh.filters.range && r === sh.filters.range.r1 && c >= sh.filters.range.c1 && c <= sh.filters.range.c2) tw += 18; w = Math.max(w, tw); } widths[c] = Math.round(Math.max(24, w || sh.defColW)); } this.wb.mod(sh, 'colW', (o) => { for (const c in widths) o[c] = widths[c]; }); }); this.grid.updateSpacer(); },
    autoFitRows(range, auto) { const [a, b] = range; const sh = this.sheet, g = this.grid; const hs = {}; for (let r = a; r <= Math.min(b, a + 5000); r++) { let h = sh.defRowH; for (let c = 0; c <= Math.min(sh.maxCol(), 200); c++) { const cell = sh.getCell(r, c); if (!cell || cell.v == null) continue; const st = this.wb.style(cell.s || 0); const fpx = st.fs ? st.fs * 4 / 3 : 13; if (st.wr || String(cell.v).includes('\n')) { const w = sh.colWidth(c) - 8; const text = ZN.fmt ? ZN.fmt.format(cell.v, st.nf || 'General').text : String(cell.v); const lines = st.wr ? g.wrapLines(text, g.fontOf(st, 1), w).length : text.split('\n').length; h = Math.max(h, Math.ceil(lines * fpx * 1.22 + 8)); } else h = Math.max(h, Math.ceil(fpx * 1.6 + 6)); } hs[r] = h; }
      const apply = () => this.wb.mod(sh, 'rowH', (o) => { for (const r in hs) { if (hs[r] === sh.defRowH) delete o[r]; else o[r] = hs[r]; } }); if (auto) apply(); else this.wb.tx('Autofit', apply); this.grid.updateSpacer(); },
    // ================= styles =================
    applyStyle(patch, label) {
      const sh = this.sheet; this.wb.tx(label || 'Format', () => { for (const q of this.sel.ranges) this.applyStyleRange(q, patch); }); if (patch.wr !== undefined || patch.fs !== undefined) { const q = this.sel.ranges[0]; if (q.r2 - q.r1 < 2000) this.autoFitRows([q.r1, q.r2], false); } this.grid.invalidate(); this.updateFmtBar(); this.renderInspector && this.renderInspector(true);
    },
    applyStyleRange(q, patch) {
      const sh = this.sheet, wb = this.wb; const allRows = q.r1 === 0 && q.r2 >= MAXR - 1, allCols = q.c1 === 0 && q.c2 >= MAXC - 1;
      if (allRows) { wb.mod(sh, 'colS', (o) => { for (let c = q.c1; c <= Math.min(q.c2, 2000); c++) o[c] = wb.mergeStyle(o[c] || 0, patch); for (const c in o) if (o[c] === 0) delete o[c]; }); this.eachExisting(q, (r, c, cell) => { if (cell.sp !== undefined && 0) return; wb.patchStyle(sh, r, c, patch); }); return; }
      if (allCols) { wb.mod(sh, 'rowS', (o) => { for (let r = q.r1; r <= Math.min(q.r2, q.r1 + 20000); r++) o[r] = wb.mergeStyle(o[r] || 0, patch); }); this.eachExisting(q, (r, c, cell) => wb.patchStyle(sh, r, c, patch)); return; }
      const n = (q.r2 - q.r1 + 1) * (q.c2 - q.c1 + 1); if (n > 400000) { zk.toast('Formatting existing cells only (range is very large)'); this.eachExisting(q, (r, c) => wb.patchStyle(sh, r, c, patch)); return; }
      for (let c = q.c1; c <= q.c2; c++) for (let r = q.r1; r <= q.r2; r++) wb.patchStyle(sh, r, c, patch);
    },
    toggleStyle(key) { const st = this.activeStyle(); const on = !!st[key]; this.applyStyle({ [key]: on ? null : 1 }, key === 'b' ? 'Bold' : key === 'i' ? 'Italic' : 'Format'); },
    setBorders(kind, style, color) {
      const spec = style ? style + ' ' + color : null; const q = this.sel.ranges[this.sel.ranges.length - 1]; const sh = this.sheet;
      const apply = (r, c, patch) => this.wb.patchStyle(sh, r, c, patch);
      this.wb.tx('Borders', () => { if (kind === 'none') { for (const qq of this.sel.ranges) { for (let r = qq.r1; r <= qq.r2; r++) for (let c = qq.c1; c <= qq.c2; c++) apply(r, c, { bl: null, br: null, bt: null, bb: null }); } return; }
        for (let r = q.r1; r <= q.r2; r++) for (let c = q.c1; c <= q.c2; c++) { const p = {}; const top = r === q.r1, bot = r === q.r2, lef = c === q.c1, rig = c === q.c2;
          if (kind === 'all') { p.bl = p.br = p.bt = p.bb = spec; } else if (kind === 'outer') { if (top) p.bt = spec; if (bot) p.bb = spec; if (lef) p.bl = spec; if (rig) p.br = spec; } else if (kind === 'inner') { if (!top) p.bt = spec; if (!bot) p.bb = spec; if (!lef) p.bl = spec; if (!rig) p.br = spec; } else if (kind === 'top' && top) p.bt = spec; else if (kind === 'bottom' && bot) p.bb = spec; else if (kind === 'left' && lef) p.bl = spec; else if (kind === 'right' && rig) p.br = spec; else if (kind === 'hinner' && !top) p.bt = spec; else if (kind === 'vinner' && !lef) p.bl = spec; else if (kind === 'topbottom') { if (top) p.bt = spec; if (bot) p.bb = spec; } else if (kind === 'bottomthick' && bot) p.bb = 'medium ' + color;
          if (Object.keys(p).length) apply(r, c, p); } });
      this.grid.invalidate();
    },
    mergeSel(mode) { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (!ZN.tools || !ZN.tools.mergeRanges) return; this.wb.tx('Merge', () => { if (mode === 'unmerge') ZN.tools.unmerge(this.sheet, q); else { if (mode === 'across') for (let r = q.r1; r <= q.r2; r++) ZN.tools.mergeRanges(this.wb, this.sheet, { r1: r, r2: r, c1: q.c1, c2: q.c2 }); else ZN.tools.mergeRanges(this.wb, this.sheet, q); if (mode === 'center') this.wb.patchStyle(this.sheet, q.r1, q.c1, { ha: 'center', va: 'middle' }); } }); this.selectCell(q.r1, q.c1); this.grid.invalidate(); },
    toggleMerge() { const q = this.sel.ranges[this.sel.ranges.length - 1]; if (this.sheet.mergeAt(q.r1, q.c1)) this.mergeSel('unmerge'); else if (q.r1 !== q.r2 || q.c1 !== q.c2) this.mergeSel('center'); },
    freeze(mode) { const s = this.sel; let f; if (mode === 'none') f = { r: 0, c: 0 }; else if (mode === 'row') f = { r: 1, c: this.sheet.freeze.c }; else if (mode === 'col') f = { r: this.sheet.freeze.r, c: 1 }; else if (mode === 'rowcol') f = { r: 1, c: 1 }; else f = { r: s.r, c: s.c }; this.wb.tx('Freeze', () => this.wb.setProp(this.sheet, 'freeze', f)); this.grid.updateSpacer(); this.grid.layoutOverlays(); this.grid.invalidate(); this.renderMenus(); },
    // ================= zoom =================
    zoomBy(f) { this.setZoom((this.sheet.zoom || 1) * f); }, setZoom(z) { z = clamp(Math.round(z * 100) / 100, 0.25, 3); this.sheet.zoom = z; this.grid.updateSpacer(); this.grid.invalidate(); this.grid.layoutOverlays(); this.updateZoomUI(); this.doc && this.doc.markDirty(); },
    updateZoomUI() { const z = Math.round((this.sheet.zoom || 1) * 100); $('#z-range').value = z; $('#z-val').textContent = z + '%'; },
    // ================= document =================
    blankWorkbook() { const wb = ZN.newWorkbook(); return wb; },
    exportFile(ext) {
      const wb = this.wb; if (this.editing) this.commitEdit(0);
      switch (ext) {
        case 'znumbers': { wb.active = wb.sheets.indexOf(this.sheet); return ZN.io.znumbers.write(wb); }
        case 'xlsx': return ZN.io.xlsx.write(wb);
        case 'csv': return ZN.io.csv.stringify(this.sheet, { delimiter: ',', bom: true });
        case 'tsv': return ZN.io.csv.stringify(this.sheet, { delimiter: '\t' });
        case 'html': return ZN.io.html.write(wb);
        case 'json': return ZN.io.json.write(wb, { mode: 'records', sheet: this.sheet });
      }
      throw new Error('Unknown format ' + ext);
    },
    loadFile(buf, ext, handle) {
      let wb; const name = handle && handle.name ? handle.name.replace(/\.[^.]+$/, '') : 'Sheet1';
      if (ext === 'znumbers') wb = ZN.io.znumbers.read(buf); else if (ext === 'xlsx' || ext === 'xlsm') wb = ZN.io.xlsx.read(buf); else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') wb = ZN.io.csv.toWorkbook(buf, { name: name.slice(0, 31), delimiter: ext === 'tsv' ? '\t' : undefined }); else throw new Error('Unsupported file type .' + ext);
      this.setWorkbook(wb);
    },
    async openCsvDialog() { /* placeholder for import options */ },
    printSheet() { const root = $('#printroot') || el('div#printroot'); if (!root.parentNode) document.body.append(root); try { const html = ZN.io.html.write(this.wb, { sheetIndex: this.wb.sheets.indexOf(this.sheet), fragment: true }); const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html); root.innerHTML = (/<style[\s\S]*?<\/style>/i.exec(html) || [''])[0] + (m ? m[1] : html); } catch (e) { root.textContent = e.message; } zeng.print(); },
    // ================= menus =================
    renderMenus() { zeng.setMenus(this.buildMenus()); },
    buildMenus() {
      const A = this, g = (f) => () => f.call(A); const st = this.sel ? this.activeStyle() : {}; const q = this.sel ? this.sel.ranges[this.sel.ranges.length - 1] : { r1: 0, c1: 0, r2: 0, c2: 0 };
      const fmt = (label, patch, accel) => ({ label, accel, run: () => this.applyStyle(patch) });
      const nfm = (label, code) => ({ label, run: () => this.applyStyle({ nf: code }) });
      const charts = [['Column', 'column'], ['Bar', 'bar'], ['Line', 'line'], ['Area', 'area'], ['Pie', 'pie'], ['Donut', 'donut'], ['Scatter', 'scatter'], ['Combo', 'combo']].map(([l, t]) => ({ label: l, run: () => this.insertChart(t) }));
      const chartsStacked = [['Stacked Column', 'column', 'stacked'], ['100% Stacked Column', 'column', 'percent'], ['Stacked Bar', 'bar', 'stacked'], ['Stacked Area', 'area', 'stacked']].map(([l, t, gr]) => ({ label: l, run: () => this.insertChart(t, gr) }));
      return [
        { label: 'File', items: this.doc.fileMenu().flatMap((it) => (it.label === 'New' ? [it, { label: 'New from Template…', run: () => this.dlgTemplates() }] : it.label === 'Print…' ? [{ label: 'Print…', accel: 'CmdOrCtrl+P', run: () => this.printSheet() }] : [it])) },
        { label: 'Edit', items: [{ label: 'Undo', id: 'edit.undo', accel: 'CmdOrCtrl+Z', run: () => this.undo(), enabled: this.wb.canUndo() || !!this.editing }, { label: 'Redo', id: 'edit.redo', accel: zeng.platform === 'win' ? 'Ctrl+Y' : 'CmdOrCtrl+Shift+Z', run: () => this.redo(), enabled: this.wb.canRedo() || !!this.editing },
          ...(zeng.platform === 'mac' && zeng.isNative ? [] : [{ separator: true }, { label: 'Cut', accel: 'CmdOrCtrl+X', run: () => document.execCommand('cut') }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => document.execCommand('copy') }, { label: 'Paste', accel: 'CmdOrCtrl+V', run: () => this.doPaste() }]),
          { label: 'Paste Special…', accel: 'CmdOrCtrl+Alt+V', run: () => this.dlgPasteSpecial() }, { label: 'Select All Cells', id: 'edit.sel', accel: 'CmdOrCtrl+A', run: () => (this.editing ? document.execCommand('selectAll') : this.selectAll()) }, { separator: true },
          { label: 'Clear Contents', run: g(this.clearContents) }, { label: 'Clear Formats', run: g(this.clearFormats) }, { label: 'Clear All', run: g(this.clearAll) }, { separator: true }, { label: 'Fill Down', accel: 'CmdOrCtrl+D', run: () => this.fillDirection('down') }, { label: 'Fill Right', accel: 'CmdOrCtrl+R', run: () => this.fillDirection('right') }, { label: 'Fill Series…', run: () => this.dlgFillSeries() }, { separator: true },
          { label: 'Delete Cells…', run: g(this.deleteCells) }, { label: 'Insert Cells…', run: g(this.insertCells) }, { separator: true }, { label: 'Find…', accel: 'CmdOrCtrl+F', run: () => this.dlgFind(false) }, { label: 'Find and Replace…', accel: 'CmdOrCtrl+Shift+H', run: () => this.dlgFind(true) }, { label: 'Go To…', accel: 'CmdOrCtrl+G', run: () => this.dlgGoTo() }] },
        { label: 'View', items: [{ label: 'Zoom In', accel: 'CmdOrCtrl+Plus', run: () => this.zoomBy(1.1) }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: () => this.zoomBy(1 / 1.1) }, { label: 'Actual Size', accel: 'CmdOrCtrl+0', run: () => this.setZoom(1) }, { separator: true },
          { label: 'Freeze Panes at Selection', run: () => this.freeze('sel') }, { label: 'Freeze Top Row', run: () => this.freeze('row') }, { label: 'Freeze First Column', run: () => this.freeze('col') }, { label: 'Unfreeze Panes', run: () => this.freeze('none'), enabled: this.sheet.freeze.r > 0 || this.sheet.freeze.c > 0 }, { separator: true },
          { label: 'Show Gridlines', checked: this.sheet.grid !== false, run: () => { this.wb.setProp(this.sheet, 'grid', this.sheet.grid === false); this.grid.invalidate(); this.renderMenus(); } }, { label: 'Show Headers', checked: this.grid.showHeaders, run: () => { this.grid.showHeaders = !this.grid.showHeaders; this.grid.updateSpacer(); this.grid.layoutOverlays(); this.grid.invalidate(); this.renderMenus(); } }, { label: 'Show Formulas', accel: 'Ctrl+`', checked: this.showFormulas, run: g(this.toggleFormulas) }, { label: 'Show Formula Bar', checked: !$('#fbar').classList.contains('zk-hidden'), run: () => { $('#fbar').classList.toggle('zk-hidden'); this.grid.resize(); this.renderMenus(); } }, { label: 'Show Inspector', accel: 'CmdOrCtrl+Alt+I', checked: this.inspectorOpen, run: () => this.toggleInspector() }, { separator: true }, { label: 'Enter Full Screen', accel: zeng.platform === 'mac' ? 'Ctrl+Cmd+F' : 'F11', run: () => zeng.fullscreen(!document.fullscreenElement) }] },
        { label: 'Insert', items: [{ label: 'Row Above', run: () => this.insertRows(true) }, { label: 'Row Below', run: () => this.insertRows(false) }, { label: 'Column Left', run: () => this.insertCols(true) }, { label: 'Column Right', run: () => this.insertCols(false) }, { separator: true }, { label: 'Sheet', accel: 'Shift+F11', run: () => this.addSheet() }, { separator: true }, { label: 'Chart', submenu: [...charts, { separator: true }, ...chartsStacked] }, { label: 'Sparkline', submenu: [['Line', 'line'], ['Column', 'column'], ['Win/Loss', 'winloss']].map(([l, t]) => ({ label: l, run: () => this.insertSparkline(t) })) }, { label: 'Table', accel: 'CmdOrCtrl+T', run: () => this.createTable() }, { separator: true }, { label: 'Function…', accel: 'Shift+F3', run: () => this.dlgFunctions() }, { label: 'AutoSum', accel: 'Alt+=', run: () => this.autoSum('SUM') }, { label: 'Date', accel: 'CmdOrCtrl+;', run: () => this.insertNow(false) }, { label: 'Time', accel: 'CmdOrCtrl+Shift+;', run: () => this.insertNow(true) }, { separator: true }, { label: 'Name Selection…', run: () => this.dlgNames(true) }] },
        { label: 'Format', items: [{ label: 'Bold', accel: 'CmdOrCtrl+B', checked: !!st.b, run: () => this.toggleStyle('b') }, { label: 'Italic', accel: 'CmdOrCtrl+I', checked: !!st.i, run: () => this.toggleStyle('i') }, { label: 'Underline', accel: 'CmdOrCtrl+U', checked: !!st.u, run: () => this.toggleStyle('u') }, { label: 'Strikethrough', checked: !!st.k, run: () => this.toggleStyle('k') }, { separator: true },
          { label: 'Number Format', submenu: [nfm('General', 'General'), nfm('Number', '#,##0.00'), nfm('Currency', '$#,##0.00'), nfm('Accounting', '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'), nfm('Percentage', '0.00%'), nfm('Date', 'm/d/yyyy'), nfm('Time', 'h:mm AM/PM'), nfm('Fraction', '# ?/?'), nfm('Scientific', '0.00E+00'), nfm('Text', '@'), { separator: true }, { label: 'Custom…', run: () => this.dlgCustomFormat() }] },
          { label: 'Increase Decimals', run: () => this.changeDecimals(1) }, { label: 'Decrease Decimals', run: () => this.changeDecimals(-1) }, { separator: true },
          { label: 'Align', submenu: [fmt('Left', { ha: 'left' }), fmt('Center', { ha: 'center' }), fmt('Right', { ha: 'right' }), fmt('Justify', { ha: 'justify' }), { separator: true }, fmt('Top', { va: 'top' }), fmt('Middle', { va: 'middle' }), fmt('Bottom', { va: 'bottom' })] }, { label: 'Wrap Text', checked: !!st.wr, run: () => this.applyStyle({ wr: st.wr ? null : 1 }) },
          { label: 'Merge Cells', submenu: [{ label: 'Merge & Center', run: () => this.mergeSel('center') }, { label: 'Merge Across', run: () => this.mergeSel('across') }, { label: 'Merge Cells', run: () => this.mergeSel('merge') }, { label: 'Unmerge Cells', run: () => this.mergeSel('unmerge') }] }, { separator: true },
          { label: 'Conditional Formatting…', run: () => this.dlgCF() }, { label: 'Data Validation…', run: () => this.dlgValidation() }, { label: 'Cell Styles', submenu: this.cellStyleItems() }, { label: 'Clear Formats', run: g(this.clearFormats) }, { separator: true },
          { label: 'Row Height…', run: () => this.dlgRowHeight() }, { label: 'Column Width…', run: () => this.dlgColWidth() }, { label: 'AutoFit Column Width', run: () => this.autoFitCols(this.selColsOrCols()) }, { label: 'AutoFit Row Height', run: () => this.autoFitRows([q.r1, q.r2]) }, { label: 'Hide Rows', accel: 'CmdOrCtrl+9', run: g(this.hideRowsSel) }, { label: 'Unhide Rows', run: g(this.unhideRowsSel) }, { label: 'Hide Columns', accel: 'CmdOrCtrl+0', run: g(this.hideColsSel) }, { label: 'Unhide Columns', run: g(this.unhideColsSel) }, { separator: true }, { label: 'Delete Rows', run: g(this.deleteRowsSel) }, { label: 'Delete Columns', run: g(this.deleteColsSel) }] },
        { label: 'Data', items: [{ label: 'Sort A to Z', run: () => this.sortSel('asc') }, { label: 'Sort Z to A', run: () => this.sortSel('desc') }, { label: 'Custom Sort…', run: () => this.dlgSort() }, { separator: true }, { label: 'Filter', accel: 'CmdOrCtrl+Shift+L', checked: !!(this.sheet.filters && this.sheet.filters.range), run: () => this.toggleFilter() }, { label: 'Clear Filters', run: () => this.clearFilters() }, { separator: true }, { label: 'Pivot Summary…', run: () => this.dlgPivot() }, { label: 'Remove Duplicates…', run: () => this.dlgRemoveDuplicates() }, { label: 'Highlight Duplicates', run: () => this.highlightDuplicates() }, { label: 'Text to Columns…', run: () => this.dlgTextToColumns() }, { label: 'Data Validation…', run: () => this.dlgValidation() }, { separator: true }, { label: 'Goal Seek…', run: () => this.dlgGoalSeek() }, { label: 'Named Ranges…', accel: 'CmdOrCtrl+F3', run: () => this.dlgNames(false) }, { separator: true }, { label: 'Calculate Now', accel: 'F9', run: g(this.recalcAll) }] },
        { label: 'Sheet', items: [{ label: 'New Sheet', run: () => this.addSheet() }, { label: 'Duplicate Sheet', run: () => this.duplicateSheet(this.wb.sheets.indexOf(this.sheet)) }, { label: 'Rename Sheet', run: () => this.renameSheetUI(this.wb.sheets.indexOf(this.sheet)) }, { label: 'Delete Sheet', run: () => this.deleteSheetUI(this.wb.sheets.indexOf(this.sheet)) }, { separator: true }, { label: 'Move Left', run: () => this.moveSheetBy(-1) }, { label: 'Move Right', run: () => this.moveSheetBy(1) }, { label: 'Next Sheet', accel: 'CmdOrCtrl+Alt+Right', run: () => this.switchSheet(Math.min(this.wb.sheets.length - 1, this.wb.sheets.indexOf(this.sheet) + 1)) }, { label: 'Previous Sheet', accel: 'CmdOrCtrl+Alt+Left', run: () => this.switchSheet(Math.max(0, this.wb.sheets.indexOf(this.sheet) - 1)) }] },
      ];
    },
    selColsOrCols() { const q = this.sel.ranges[this.sel.ranges.length - 1]; return [q.c1, Math.min(q.c2, q.c1 + 500)]; },
    cellStyleItems() { const A = this; return (ZN.cellStyles || []).map((s) => ({ label: s.name, run: () => A.applyStyle(s.patch, s.name) })); },
    changeDecimals(d) { const nf = this.activeStyle().nf || 'General'; const nn = ZN.fmt && ZN.fmt.adjustDecimals ? ZN.fmt.adjustDecimals(nf, d) : nf; this.applyStyle({ nf: nn }); },
  };
  window.app = app;

  // ---------- cell styles (named) ----------
  ZN.cellStyles = [
    { name: 'Normal', patch: { b: null, i: null, u: null, k: null, fc: null, bg: null, nf: null, fs: null, fn: null, ha: null } },
    { name: 'Title', patch: { b: 1, fs: 20, fc: null } }, { name: 'Heading 1', patch: { b: 1, fs: 15, bb: 'medium #0a84ff' } }, { name: 'Heading 2', patch: { b: 1, fs: 13, bb: 'thin #8e8e93' } }, { name: 'Heading 3', patch: { b: 1, fs: 11 } },
    { name: 'Good', patch: { bg: '#c6efce', fc: '#006100' } }, { name: 'Bad', patch: { bg: '#ffc7ce', fc: '#9c0006' } }, { name: 'Neutral', patch: { bg: '#ffeb9c', fc: '#9c5700' } },
    { name: 'Input', patch: { bg: '#ffcc99', fc: '#3f3f76' } }, { name: 'Output', patch: { bg: '#f2f2f2', fc: '#3f3f3f', b: 1 } }, { name: 'Calculation', patch: { bg: '#f2f2f2', fc: '#fa7d00', b: 1 } }, { name: 'Check Cell', patch: { bg: '#a5a5a5', fc: '#ffffff', b: 1 } }, { name: 'Note', patch: { bg: '#ffffcc', fc: '#000000' } }, { name: 'Total', patch: { b: 1, bt: 'thin #1d1d1f', bb: 'double #1d1d1f' } },
    { name: 'Currency', patch: { nf: '$#,##0.00' } }, { name: 'Comma', patch: { nf: '#,##0.00' } }, { name: 'Percent', patch: { nf: '0.00%' } }, { name: 'Accent Blue', patch: { bg: '#0a84ff', fc: '#ffffff', b: 1 } }, { name: 'Accent Green', patch: { bg: '#30d158', fc: '#ffffff', b: 1 } }, { name: 'Accent Orange', patch: { bg: '#ff9f0a', fc: '#ffffff', b: 1 } },
  ];

  // ================= boot =================
  async function boot() {
    await zeng.ready; document.documentElement.style.setProperty('--accent', '#30d158'); document.documentElement.style.setProperty('--accent-rgb', '48,209,88');
    const grid = new GridView(app); app.grid = grid;
    const doc = app.doc = zeng.doc({
      name: 'Numbers', ext: 'znumbers', filters: [{ name: 'Numbers Workbook', exts: ['znumbers'] }, { name: 'Excel Workbook', exts: ['xlsx'] }, { name: 'CSV', exts: ['csv'] }, { name: 'TSV', exts: ['tsv'] }], openExts: ['znumbers', 'xlsx', 'xlsm', 'csv', 'tsv', 'txt'],
      blank: async () => { app.setWorkbook(app.blankWorkbook()); },
      load: async (buf, ext, handle) => { app.loadFile(buf, ext, handle); },
      save: async (ext) => app.exportFile(ext),
      export: [{ label: 'Excel Workbook (.xlsx)…', ext: 'xlsx' }, { label: 'CSV (.csv)…', ext: 'csv' }, { label: 'TSV (.tsv)…', ext: 'tsv' }, { label: 'HTML (.html)…', ext: 'html' }, { label: 'JSON (.json)…', ext: 'json' }, { label: 'PDF…', ext: 'pdf', run: () => app.printSheet() }],
      print: () => app.printSheet(),
    });
    // saving: choose the format from the file name
    const extOf = (n) => (n.split('.').pop() || '').toLowerCase(); const origSave = doc.save, origSaveAs = doc.saveAs;
    doc.save = async () => { if (!doc.file || !doc.file.path) return await doc.saveAs(); const ext = extOf(doc.file.name); try { await zeng.files.write(doc.file, await app.exportFile(['xlsx', 'csv', 'tsv', 'znumbers'].includes(ext) ? ext : 'znumbers')); doc.setClean(); return true; } catch (e) { zk.alert('Couldn’t save', e.message); return false; } };
    doc.saveAs = async () => { const base = (doc.file ? doc.file.name : doc.untitled).replace(/\.[^.]+$/, ''); const h = await zeng.files.saveDialog({ name: base + '.znumbers', filters: [{ name: 'Numbers Workbook', exts: ['znumbers'] }, { name: 'Excel Workbook', exts: ['xlsx'] }, { name: 'CSV', exts: ['csv'] }] }); if (!h) return false; let ext = extOf(h.name); if (!['xlsx', 'csv', 'tsv', 'znumbers'].includes(ext)) { ext = 'znumbers'; if (!h.web) h.name += '.znumbers'; } try { await zeng.files.write(h, await app.exportFile(ext)); } catch (e) { zk.alert('Couldn’t save', e.message); return false; } doc.file = h.web ? { name: h.name } : h; doc.setClean(); doc.refreshTitle(); return true; };
    await doc.ready; app.setWorkbook(app.blankWorkbook()); doc.setClean();
    buildChrome(); grid.resize(); app.renderMenus(); app.focusKb();
    // keyboard + clipboard
    const kb = $('#kb'); kb.value = ' '; kb.select();
    document.addEventListener('keydown', (e) => app.onKey(e), false);
    document.addEventListener('copy', (e) => { if (app.editing || (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName) && document.activeElement.id !== 'kb')) return; app.doCopy(e, false); });
    document.addEventListener('cut', (e) => { if (app.editing || (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName) && document.activeElement.id !== 'kb')) return; app.doCut(e); });
    document.addEventListener('paste', (e) => { if (app.editing || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.id !== 'kb')) return; app.doPaste(e); });
    kb.addEventListener('compositionstart', () => { if (!app.editing) { app.beginEdit(app.sel.r, app.sel.c, ''); } });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('input,textarea,select,.zk-sheet,.zk-pop,.zn-popup,.findpanel,[contenteditable]')) setTimeout(() => app.focusKb(), 0); }, true);
    window.addEventListener('focus', () => app.focusKb());
    zeng.onFiles((hs) => { const csv = hs.filter((h) => /\.(csv|tsv|txt|xlsx|znumbers)$/i.test(h.name)); if (csv.length) { doc.openHandle(csv[0]); return false; } });
    window.addEventListener('resize', () => grid.resize());
    // fonts for canvas
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => grid.invalidate());
    // sample for debugging
    window.zn_ready = true;
  }
  function buildChrome() { window.buildToolbar && window.buildToolbar(app); }
  window.appBoot = boot;
  window.REFCOLORS = REFCOLORS; window.FONTS = FONTS; window.SIZES = SIZES;
})();
