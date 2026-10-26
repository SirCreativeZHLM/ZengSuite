/* ZengGrid workbook model: sparse sheets, styles, dependency graph, incremental recalc, undo journal, structural edits. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, ZErr, Range, MAXR, MAXC } = ZN; const FM = ZN.formula; const F = ZN.F;
  const K34 = 17179869184; // 2^34
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o, (k, v) => (v instanceof ZErr ? { $e: v.code } : v))));
  ZN.clone = clone;
  const keyOf = (sid, r, c) => sid * K34 + r * MAXC + c;
  const unkey = (k) => { const sid = Math.floor(k / K34); const rem = k - sid * K34; const r = Math.floor(rem / MAXC); return [sid, r, rem - r * MAXC]; };
  ZN.keyOf = keyOf; ZN.unkey = unkey;

  class Sheet {
    constructor(wb, name, id) {
      this.wb = wb; this.id = id; this.name = name; this.cols = []; this._maxRow = -1; this._maxCol = -1; this._mrDirty = false;
      this.color = null; this.hidden = false;
      // JSON-able view/meta state (edited via wb.mod / wb.setProp so it is undoable)
      this.colW = {}; this.rowH = {}; this.hiddenCols = {}; this.hiddenRows = {}; this.colS = {}; this.rowS = {};
      this.merges = []; this.freeze = { r: 0, c: 0 }; this.cf = []; this.dv = []; this.tables = []; this.charts = []; this.sparklines = [];
      this.zoom = 1; this.grid = true; this.defColW = 100; this.defRowH = 24; this.protect = false; this.filters = {}; this.images = [];
      this.sel = null; this.scroll = null;
    }
    getCell(r, c) { const col = this.cols[c]; return col ? col[r] : undefined; }
    getValue(r, c) { const col = this.cols[c]; if (!col) return null; const x = col[r]; return x === undefined || x.v === undefined ? null : x.v; }
    maxRow() { if (this._mrDirty) { let m = -1; for (const col of this.cols) if (col && col.length - 1 > m) { for (let r = col.length - 1; r > m; r--) if (col[r] !== undefined) { m = r; break; } } this._maxRow = m; this._mrDirty = false; } return this._maxRow; }
    maxCol() { let m = -1; for (let c = this.cols.length - 1; c >= 0; c--) { const col = this.cols[c]; if (col && col.some((x) => x !== undefined)) { m = c; break; } } return m; }
    eachCell(r1, c1, r2, c2, cb) {
      const ce = Math.min(c2, this.cols.length - 1);
      for (let c = c1; c <= ce; c++) { const col = this.cols[c]; if (!col) continue; const re = Math.min(r2, col.length - 1); for (let r = r1; r <= re; r++) { const x = col[r]; if (x !== undefined && x.v !== undefined && x.v !== null) cb(x.v, r, c); } }
    }
    eachCellObj(cb) { for (let c = 0; c < this.cols.length; c++) { const col = this.cols[c]; if (!col) continue; for (let r = 0; r < col.length; r++) { const x = col[r]; if (x !== undefined) cb(x, r, c); } } }
    setRaw(r, c, cell) { // unjournaled, no graph (used by loaders & internals)
      let col = this.cols[c]; if (cell === undefined) { if (col && r < col.length) { col[r] = undefined; if (r === col.length - 1) { let n = col.length; while (n > 0 && col[n - 1] === undefined) n--; col.length = n; this._mrDirty = true; } } return; }
      if (!col) { col = this.cols[c] = []; for (let i = this.cols.length - 2; i >= 0 && this.cols[i] === undefined && false; i--); }
      col[r] = cell; if (r > this._maxRow) this._maxRow = r;
    }
    colWidth(c) { if (this.hiddenCols[c]) return 0; const w = this.colW[c]; return w === undefined ? this.defColW : w; }
    rowHeight(r) { if (this.hiddenRows[r]) return 0; const h = this.rowH[r]; return h === undefined ? this.defRowH : h; }
    styleId(r, c) { const x = this.getCell(r, c); if (x && x.s !== undefined) return x.s; const a = this.rowS[r]; if (a !== undefined) return a; const b = this.colS[c]; return b === undefined ? 0 : b; }
    mergeAt(r, c) { for (const m of this.merges) if (r >= m[0] && r <= m[2] && c >= m[1] && c <= m[3]) return m; return null; }
    used() { return { rows: this.maxRow() + 1, cols: this.maxCol() + 1 }; }
  }
  ZN.Sheet = Sheet;

  const META_KEYS = ['name', 'color', 'hidden', 'colW', 'rowH', 'hiddenCols', 'hiddenRows', 'colS', 'rowS', 'merges', 'freeze', 'cf', 'dv', 'tables', 'charts', 'sparklines', 'zoom', 'grid', 'defColW', 'defRowH', 'protect', 'filters', 'images'];
  ZN.SHEET_META = META_KEYS;

  class Workbook {
    constructor() {
      this.sheets = []; this.byId = new Map(); this.nextId = 1; this.styles = [{}]; this.styleIdx = new Map([['{}', 0]]);
      this.names = new Map(); this.props = { title: '', author: '' };
      this.dependents = new Map(); this.rdIndex = new Map(); this.bigRd = new Map(); this.volatile = new Set(); this.spillErr = new Set();
      this.depth = 0; this.tx_ = null; this.undoStack = []; this.redoStack = []; this.listeners = []; this.suspend = 0; this.lastCalc = { n: 0, ms: 0 };
      this.active = 0; this.version = 0;
    }
    // ----- sheets -----
    sheetByName(n) { if (n == null) return null; const l = n.toLowerCase(); for (const s of this.sheets) if (s.name.toLowerCase() === l) return s; return null; }
    sheetIndex(s) { return this.sheets.indexOf(s); }
    uniqueName(base) { let n = base, i = 2; while (this.sheetByName(n)) n = base + ' ' + i++; return n; }
    _newSheet(name) { const s = new Sheet(this, name, this.nextId++); this.byId.set(s.id, s); return s; }
    addSheetRaw(name) { const s = this._newSheet(name || this.uniqueName('Sheet' + (this.sheets.length + 1))); this.sheets.push(s); return s; }
    // ----- styles -----
    style(id) { return this.styles[id] || this.styles[0]; }
    internStyle(o) { const keys = Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '').sort(); const n = {}; for (const k of keys) n[k] = o[k]; const j = JSON.stringify(n); let id = this.styleIdx.get(j); if (id === undefined) { id = this.styles.length; this.styles.push(n); this.styleIdx.set(j, id); } return id; }
    mergeStyle(id, patch) { const o = Object.assign({}, this.style(id)); for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete o[k]; else o[k] = patch[k]; } return this.internStyle(o); }
    // ----- names -----
    nameKey(name, sheet) { return (sheet ? sheet.id + ':' : '') + name.toUpperCase(); }
    lookupName(name, sheet) { const u = name.toUpperCase(); return (sheet && this.names.get(sheet.id + ':' + u)) || this.names.get(u) || null; }
    // ----- journal -----
    on(fn) { this.listeners.push(fn); }
    _emit(kind) { this.version++; for (const f of this.listeners) { try { f(kind); } catch (e) { console.error(e); } } }
    begin(label) { if (this.depth++ === 0) this.tx_ = { label, entries: [], seeds: new Set(), rebuild: false, all: false }; }
    commit() {
      if (--this.depth > 0) return; const tx = this.tx_; this.tx_ = null;
      if (tx.rebuild) this.rebuildGraph();
      if (tx.rebuild || tx.all) this.recalc(null); else if (tx.seeds.size) this.recalc(tx.seeds);
      if (tx.entries.length) { this.undoStack.push(tx); if (this.undoStack.length > 500) this.undoStack.shift(); this.redoStack.length = 0; }
      this._emit('commit');
    }
    tx(label, fn) { this.begin(label); try { return fn(); } finally { this.commit(); } }
    _log(e) { if (this.tx_) this.tx_.entries.push(e); }
    canUndo() { return this.undoStack.length > 0; } canRedo() { return this.redoStack.length > 0; }
    undo() { const t = this.undoStack.pop(); if (!t) return false; this._apply(t, true); this.redoStack.push(t); return true; }
    redo() { const t = this.redoStack.pop(); if (!t) return false; this._apply(t, false); this.undoStack.push(t); return true; }
    _apply(tx, undo) {
      const seeds = new Set(); let rebuild = false; const es = undo ? tx.entries.slice().reverse() : tx.entries;
      for (const e of es) {
        if (e.t === 'cell') { this._putRaw(e.sheet, e.r, e.c, undo ? e.prev : e.next, seeds); }
        else if (e.t === 'prop') { e.obj[e.key] = undo ? e.prev : e.next; if (e.graph) rebuild = true; }
        else if (e.t === 'fn') { (undo ? e.undo : e.redo)(); rebuild = true; }
      }
      if (rebuild) { this.rebuildGraph(); this.recalc(null); } else this.recalc(seeds);
      this._emit('undo');
    }
    // generic journaled property set
    setProp(obj, key, val, graph) { const prev = obj[key]; obj[key] = val; this._log({ t: 'prop', obj, key, prev, next: val, graph }); if (graph && this.tx_) this.tx_.rebuild = true; if (!this.tx_) this._emit('prop'); }
    mod(obj, key, mutator, graph) { const next = clone(obj[key]) ; const r = mutator(next); this.setProp(obj, key, r === undefined ? next : r, graph); }

    // ----- cells -----
    cellByKey(k) { const [sid, r, c] = unkey(k); const s = this.byId.get(sid); return s ? s.getCell(r, c) : undefined; }
    // journaled put. cell: object | undefined. Handles graph registration; recalc happens at commit.
    put(sheet, r, c, cell, nocalc) { // nocalc: pure formatting change, skip recalculation of dependents
      const prev = sheet.getCell(r, c); if (prev === cell) return;
      this.begin('put'); this._log({ t: 'cell', sheet, r, c, prev, next: cell }); this._putRaw(sheet, r, c, cell, nocalc ? null : this.tx_.seeds); this.commit();
    }
    _putRaw(sheet, r, c, cell, seeds) {
      const prev = sheet.getCell(r, c); const key = keyOf(sheet.id, r, c);
      if (prev && prev.f !== undefined) { this._unregister(key, prev); this.volatile.delete(key); this.spillErr.delete(key); if (prev.spill) this._clearSpill(sheet, r, c, prev, seeds); }
      if (!seeds && cell && prev && cell.f !== undefined && cell.f === prev.f && prev.ast) { cell.ast = prev.ast; cell.v = prev.v; cell.spill = prev.spill; cell.bad = prev.bad; }
      if (cell && cell.f !== undefined) { if (!cell.ast && !cell.bad) this.compile(cell); this._register(key, sheet, r, c, cell); cell.spill = undefined; }
      sheet.setRaw(r, c, cell);
      if (cell !== undefined && cell.sp === undefined && prev && prev.sp !== undefined) { /* user overwrote a spill cell */ }
      seeds && seeds.add(key); if (seeds && this.spillErr.size) for (const k of this.spillErr) seeds.add(k);
      if (prev && prev.sp !== undefined && seeds) seeds.add(prev.sp);
    }
    compile(cell) { try { cell.ast = FM.parse(cell.f); cell.bad = false; } catch (e) { cell.ast = null; cell.bad = true; } }
    // user-level input: text as typed. Returns {ok, error}
    setInput(sheet, r, c, text, opts = {}) {
      const prev = sheet.getCell(r, c); let s = prev ? prev.s : undefined; if (s === undefined) { const d = sheet.styleId(r, c); if (d) s = d; }
      let cell;
      const nf = s !== undefined ? this.style(s).nf : undefined;
      if (text === '' || text == null) { cell = s !== undefined ? { v: undefined, s } : undefined; if (cell && prev && prev.s === undefined && sheet.styleId(r, c) === 0) cell = undefined; }
      else if (text[0] === '=' && text.length > 1 && nf !== '@') {
        const f = text.slice(1); try { FM.parse(f); } catch (e) { if (!opts.force) return { ok: false, error: e.message, pos: e.pos }; }
        cell = { v: undefined, f }; if (s !== undefined) cell.s = s;
      } else {
        let v = text, auto = null;
        if (text[0] === "'") v = text.slice(1);
        else if (nf !== '@') { const p = ZN.parseValue ? ZN.parseValue(text) : null; if (p) { v = p.v; auto = p.nf; } }
        cell = { v }; if (auto && (!nf || nf === 'General')) s = this.mergeStyle(s || 0, { nf: auto }); if (s !== undefined) cell.s = s;
      }
      this.put(sheet, r, c, cell); return { ok: true };
    }
    setValue(sheet, r, c, v) { const prev = sheet.getCell(r, c); const cell = { v }; if (prev && prev.s !== undefined) cell.s = prev.s; this.put(sheet, r, c, cell); }
    patchStyle(sheet, r, c, patch) {
      const prev = sheet.getCell(r, c); const sid = sheet.styleId(r, c); const ns = this.mergeStyle(sid, patch);
      if (prev) { if (prev.s === ns && prev.s !== undefined) return; if (prev.s === undefined && ns === sid) return; const cell = Object.assign({}, prev); cell.s = ns; cell.deps = undefined; if (prev.sp !== undefined) { sheet.setRaw(r, c, cell); return; } this.put(sheet, r, c, cell, true); }
      else { if (ns === sid) return; this.put(sheet, r, c, { v: undefined, s: ns }, true); }
    }
    // ----- dependency graph -----
    _unregister(key, cell) {
      const d = cell.deps; if (!d) return; for (const k of d.cells) { const s = this.dependents.get(k); if (s) { s.delete(key); if (!s.size) this.dependents.delete(k); } }
      for (const rd of d.ranges) this._unindexRd(rd); if (d.dyn) for (const rd of d.dyn) this._unindexRd(rd); cell.deps = null;
    }
    _indexRd(rd) {
      const nb = (rd.r2 >> 5) - (rd.r1 >> 5) + 1, nc = rd.c2 - rd.c1 + 1; rd.keys = null;
      if (nb * nc > 96) { let b = this.bigRd.get(rd.sid); if (!b) this.bigRd.set(rd.sid, (b = new Set())); b.add(rd); rd.big = true; return; }
      rd.keys = []; for (let c = rd.c1; c <= rd.c2; c++) for (let b = rd.r1 >> 5; b <= rd.r2 >> 5; b++) { const k = (rd.sid * 16384 + c) * 65536 + b; let s = this.rdIndex.get(k); if (!s) this.rdIndex.set(k, (s = new Set())); s.add(rd); rd.keys.push(k); }
    }
    _unindexRd(rd) { if (rd.big) { const b = this.bigRd.get(rd.sid); b && b.delete(rd); return; } if (rd.keys) for (const k of rd.keys) { const s = this.rdIndex.get(k); if (s) { s.delete(rd); if (!s.size) this.rdIndex.delete(k); } } }
    _refsOf(ast, sheet, out, depth) {
      const col = FM.collect(ast);
      for (const x of col.refs) { const sh = x.sheet == null ? sheet : this.sheetByName(x.sheet); if (sh) out.push({ sid: sh.id, r1: x.r1, c1: x.c1, r2: x.r2, c2: x.c2 }); }
      if (depth < 4) {
        for (const n of col.names) { const nm = this.lookupName(n, sheet); if (nm) { if (!nm.ast) { try { nm.ast = FM.parse(nm.ref); } catch (e) { nm.ast = { t: 'err', v: E.NAME }; } } this._refsOf(nm.ast, sheet, out, depth + 1); } }
        for (const t of col.trefs) { try { const rg = this.resolveTref(t, { sheet, r: 0, c: 0, wb: this }, true); if (rg instanceof Range) out.push({ sid: rg.sheet.id, r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 }); } catch (e) { /* ignore */ } }
      }
      return col.volatile;
    }
    _register(key, sheet, r, c, cell) {
      const deps = { cells: [], ranges: [], dyn: null }; cell.deps = deps; if (!cell.ast) return; const refs = []; const vol = this._refsOf(cell.ast, sheet, refs, 0);
      if (vol) this.volatile.add(key);
      for (const x of refs) {
        if (x.r1 === x.r2 && x.c1 === x.c2) { const k = keyOf(x.sid, x.r1, x.c1); let s = this.dependents.get(k); if (!s) this.dependents.set(k, (s = new Set())); s.add(key); deps.cells.push(k); }
        else { const rd = { sid: x.sid, r1: x.r1, c1: x.c1, r2: x.r2, c2: x.c2, owner: key }; this._indexRd(rd); deps.ranges.push(rd); }
      }
    }
    _registerDyn(key, cell, dyn) {
      const d = cell.deps; if (!d) return; if (d.dyn) for (const rd of d.dyn) this._unindexRd(rd); d.dyn = [];
      for (const x of dyn) { const rd = { sid: x.sheet.id, r1: x.r1, c1: x.c1, r2: x.r2, c2: x.c2, owner: key }; this._indexRd(rd); d.dyn.push(rd); }
    }
    rebuildGraph() {
      this.dependents = new Map(); this.rdIndex = new Map(); this.bigRd = new Map(); this.volatile = new Set();
      for (const sh of this.sheets) sh.eachCellObj((cell, r, c) => { if (cell.f !== undefined) { if (!cell.ast && !cell.bad) this.compile(cell); cell.deps = null; this._register(keyOf(sh.id, r, c), sh, r, c, cell); } });
    }
    _dependentsOf(sid, r, c, out) {
      const k = keyOf(sid, r, c); const s = this.dependents.get(k); if (s) for (const o of s) out.add(o);
      const rs = this.rdIndex.get((sid * 16384 + c) * 65536 + (r >> 5)); if (rs) for (const rd of rs) if (r >= rd.r1 && r <= rd.r2 && c >= rd.c1 && c <= rd.c2) out.add(rd.owner);
      const b = this.bigRd.get(sid); if (b) for (const rd of b) if (r >= rd.r1 && r <= rd.r2 && c >= rd.c1 && c <= rd.c2) out.add(rd.owner);
    }
    // ----- recalculation -----
    // seeds: iterable of changed cell keys, or null => everything
    recalc(seeds, depth = 0) {
      const t0 = performance.now(); const nodes = new Map(); const queue = []; const all = seeds === null;
      const mk = (key) => { let n = nodes.get(key); if (n) return n; const [sid, r, c] = unkey(key); const sh = this.byId.get(sid); const cell = sh && sh.getCell(r, c); if (!cell || cell.f === undefined) return null; n = { key, sh, r, c, cell, out: [], indeg: 0 }; nodes.set(key, n); queue.push(n); return n; };
      if (all) { for (const sh of this.sheets) sh.eachCellObj((cell, r, c) => { if (cell.f !== undefined) mk(keyOf(sh.id, r, c)); }); }
      else { for (const k of seeds) { const [sid, r, c] = unkey(k); const sh = this.byId.get(sid); if (!sh) continue; const cell = sh.getCell(r, c); if (cell && cell.f !== undefined) mk(k); else if (!cell || cell.sp !== undefined || true) { const ds = new Set(); this._dependentsOf(sid, r, c, ds); for (const o of ds) mk(o); } } for (const k of this.volatile) mk(k); }
      const tmp = new Set();
      for (let qi = 0; qi < queue.length; qi++) {
        const n = queue[qi]; tmp.clear(); this._dependentsOf(n.sh.id, n.r, n.c, tmp);
        if (n.cell.spill) { const sp = n.cell.spill; for (let rr = n.r; rr <= sp.r2; rr++) for (let cc = n.c; cc <= sp.c2; cc++) if (rr !== n.r || cc !== n.c) this._dependentsOf(n.sh.id, rr, cc, tmp); }
        for (const o of tmp) { const m = mk(o); if (m) { n.out.push(m); m.indeg++; } }
      }
      // Kahn
      const ready = []; for (const n of queue) if (n.indeg === 0) ready.push(n); let done = 0; const late = new Set();
      for (let i = 0; i < ready.length; i++) { const n = ready[i]; this._evalCell(n, late); done++; for (const m of n.out) if (--m.indeg === 0) ready.push(m); }
      if (done < queue.length) for (const n of queue) if (n.indeg > 0) { n.cell.v = E.CIRC; n.cell.spill = undefined; }
      this.lastCalc = { n: queue.length, ms: performance.now() - t0 };
      if (late.size && depth < 3) this.recalc(late, depth + 1);
    }
    _evalCell(n, late) {
      const { cell, sh, r, c } = n; const ctx = { wb: this, sheet: sh, r, c, vars: null, dyn: [] };
      let v;
      if (cell.bad || !cell.ast) v = E.NAME;
      else { try { v = FM.finalize(FM.ev(cell.ast, ctx)); } catch (e) { v = e instanceof RangeError ? E.CALC : E.VALUE; if (!(e instanceof RangeError)) console.warn('eval', cell.f, e); } }
      if (ctx.dyn.length) this._registerDyn(n.key, cell, ctx.dyn); else if (cell.deps && cell.deps.dyn) this._registerDyn(n.key, cell, []);
      if (Array.isArray(v)) this._spill(n, v, late); else { if (cell.spill) this._clearSpill(sh, r, c, cell, late); cell.v = v; this.spillErr.delete(n.key); }
    }
    _clearSpill(sh, r, c, cell, seeds) {
      const sp = cell.spill; if (!sp) return; const key = keyOf(sh.id, r, c);
      for (let cc = c; cc <= sp.c2; cc++) for (let rr = r; rr <= sp.r2; rr++) { if (rr === r && cc === c) continue; const x = sh.getCell(rr, cc); if (x && x.sp === key) { sh.setRaw(rr, cc, x.s !== undefined ? { v: undefined, s: x.s } : undefined); seeds && seeds.add(keyOf(sh.id, rr, cc)); } }
      cell.spill = undefined;
    }
    _spill(n, arr, late) {
      const { cell, sh, r, c, key } = n; const R = arr.length, C = arr[0].length; const old = cell.spill;
      let blocked = r + R > MAXR || c + C > MAXC;
      if (!blocked) for (let i = 0; i < R && !blocked; i++) for (let j = 0; j < C; j++) { if (!i && !j) continue; const x = sh.getCell(r + i, c + j); if (x && (x.f !== undefined || (x.v !== undefined && x.sp !== key))) { blocked = true; break; } }
      if (blocked) { if (old) this._clearSpill(sh, r, c, cell, late); cell.v = E.SPILL; this.spillErr.add(key); return; }
      this.spillErr.delete(key); const oldR2 = old ? old.r2 : r, oldC2 = old ? old.c2 : c;
      if (old) this._clearSpill(sh, r, c, cell, late);
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
        if (!i && !j) { cell.v = arr[0][0]; continue; }
        const x = sh.getCell(r + i, c + j); const nc = { v: arr[i][j], sp: key }; if (x && x.s !== undefined) nc.s = x.s; sh.setRaw(r + i, c + j, nc);
        if (r + i > oldR2 || c + j > oldC2 || !old) late.add(keyOf(sh.id, r + i, c + j));
      }
      cell.spill = R * C > 1 ? { r2: r + R - 1, c2: c + C - 1 } : undefined;
    }

    // ----- structure -----
    // axis 'r' | 'c'. insert n at index `at`, or delete when n<0 (|n| items from at).
    structure(sheet, axis, at, n) {
      this.begin(n > 0 ? 'Insert' : 'Delete'); const wb = this;
      const entry = { t: 'fn' }; const saved = { cells: [], removed: [], meta: [] };
      const doIt = () => {
        saved.cells = []; saved.removed = []; saved.meta = [];
        // 1. rewrite formulas everywhere (remember originals)
        for (const sh of wb.sheets) sh.eachCellObj((cell, r, c) => {
          if (cell.f === undefined) return; const nf = FM.adjust(cell.f, sh.name, sheet.name, axis, at, n);
          if (nf !== cell.f) { saved.cells.push([sh, r, c, cell]); const nc = Object.assign({}, cell, { f: nf, ast: null, deps: null, bad: false }); delete nc.v; nc.v = cell.v; sh.setRaw(r, c, nc); }
        });
        // names
        for (const nm of wb.names.values()) { const nr = FM.adjust(nm.ref, nm.scope ? (wb.byId.get(nm.scope) || sheet).name : sheet.name, sheet.name, axis, at, n); if (nr !== nm.ref) { saved.meta.push([nm, 'ref', nm.ref]); nm.ref = nr; nm.ast = null; } }
        // other sheets' chart/cf/dv string refs
        for (const sh of wb.sheets) for (const key of ['charts', 'cf', 'dv', 'sparklines']) { const arr = sh[key]; if (!arr || !arr.length) continue; saved.meta.push([sh, key, arr]); sh[key] = FM.adjustMeta ? FM.adjustMeta(arr, sh, sheet, axis, at, n) : arr; }
        // 2. move cells
        if (axis === 'r') { for (let c = 0; c < sheet.cols.length; c++) { const col = sheet.cols[c]; if (!col) continue; if (n > 0) { if (at < col.length) col.splice(at, 0, ...new Array(n).fill(undefined)); } else { const m = -n; if (at < col.length) saved.removed.push([c, at, col.splice(at, m)]); } } sheet._mrDirty = true; sheet._maxRow = Math.max(sheet._maxRow, sheet.maxRow()) + (n > 0 ? n : 0); }
        else { if (n > 0) sheet.cols.splice(at, 0, ...new Array(n).fill(undefined)); else { saved.removed.push([at, 0, sheet.cols.splice(at, -n)]); } sheet._mrDirty = true; }
        // 3. sheet meta (dims, merges, tables, freeze, filters, hidden)
        saved.meta.push(...wb._shiftMeta(sheet, axis, at, n));
      };
      const undoIt = () => {
        for (const [o, k, v] of saved.meta.slice().reverse()) o[k] = v;
        if (axis === 'r') { if (n > 0) { for (let c = 0; c < sheet.cols.length; c++) { const col = sheet.cols[c]; if (col && at < col.length) col.splice(at, n); } } else { for (const [c, a, items] of saved.removed) { const col = sheet.cols[c]; while (col.length < a) col.push(undefined); col.splice(a, 0, ...items); } } }
        else { if (n > 0) sheet.cols.splice(at, n); else sheet.cols.splice(at, 0, ...saved.removed[0][2]); }
        for (const [sh, r, c, cell] of saved.cells) sh.setRaw(r, c, cell);
        sheet._mrDirty = true;
      };
      doIt(); entry.undo = undoIt; entry.redo = doIt; this._log(entry); this.tx_.rebuild = true; this.commit();
    }
    _shiftMeta(sheet, axis, at, n) {
      const saved = []; const set = (o, k, v) => { saved.push([o, k, o[k]]); o[k] = v; };
      const shiftIdx = (i) => { if (n > 0) return i >= at ? i + n : i; const m = -n; if (i >= at + m) return i - m; if (i >= at) return -1; return i; };
      const mapObj = (obj) => { const o = {}; for (const k in obj) { const j = shiftIdx(+k); if (j >= 0) o[j] = obj[k]; } return o; };
      if (axis === 'r') { set(sheet, 'rowH', mapObj(sheet.rowH)); set(sheet, 'hiddenRows', mapObj(sheet.hiddenRows)); set(sheet, 'rowS', mapObj(sheet.rowS)); }
      else { set(sheet, 'colW', mapObj(sheet.colW)); set(sheet, 'hiddenCols', mapObj(sheet.hiddenCols)); set(sheet, 'colS', mapObj(sheet.colS)); }
      const k1 = axis === 'r' ? 0 : 1, k2 = axis === 'r' ? 2 : 3; const rng = (a) => { let lo = a[k1], hi = a[k2]; if (n > 0) { if (lo >= at) lo += n; if (hi >= at) hi += n; } else { const m = -n; if (lo >= at && hi < at + m) return null; if (lo >= at + m) lo -= m; else if (lo >= at) lo = at; if (hi >= at + m) hi -= m; else if (hi >= at) hi = at - 1; if (hi < lo) return null; } const b = a.slice(); b[k1] = lo; b[k2] = hi; return b; };
      set(sheet, 'merges', sheet.merges.map(rng).filter(Boolean));
      const objRange = (o) => { const a = rng([o.r1, o.c1, o.r2, o.c2]); return a ? Object.assign({}, o, { r1: a[0], c1: a[1], r2: a[2], c2: a[3] }) : null; };
      set(sheet, 'tables', sheet.tables.map(objRange).filter(Boolean));
      const fz = Object.assign({}, sheet.freeze); if (axis === 'r' && n > 0 && at < fz.r) fz.r += n; set(sheet, 'freeze', fz);
      for (const key of ['cf', 'dv']) { const mapped = sheet[key].map((x) => { const rs = (x.ranges || []).map((q) => { const a = rng([q[0], q[1], q[2], q[3]]); return a; }).filter(Boolean); return rs.length ? Object.assign({}, x, { ranges: rs }) : null; }).filter(Boolean); set(sheet, key, mapped); }
      return saved;
    }
    // ----- sheet-level operations (journaled) -----
    addSheet(name, index) {
      const s = this._newSheet(name || this.uniqueName('Sheet' + (this.sheets.length + 1))); const i = index == null ? this.sheets.length : index; this.begin('Add Sheet');
      this._log({ t: 'fn', undo: () => { this.sheets.splice(this.sheets.indexOf(s), 1); }, redo: () => { this.sheets.splice(i, 0, s); } }); this.sheets.splice(i, 0, s); this.tx_.rebuild = true; this.commit(); return s;
    }
    deleteSheet(sheet) {
      if (this.sheets.length < 2) return false; const i = this.sheets.indexOf(sheet); this.begin('Delete Sheet'); const saved = [];
      const doIt = () => { saved.length = 0; this.sheets.splice(this.sheets.indexOf(sheet), 1); for (const sh of this.sheets) sh.eachCellObj((cell, r, c) => { if (cell.f !== undefined && cell.f.toLowerCase().includes(sheet.name.toLowerCase())) { const nf = FM.deleteSheetRefs(cell.f, sheet.name); if (nf !== cell.f) { saved.push([sh, r, c, cell]); sh.setRaw(r, c, Object.assign({}, cell, { f: nf, ast: null, deps: null, bad: false })); } } }); };
      doIt(); this._log({ t: 'fn', undo: () => { for (const [sh, r, c, cell] of saved) sh.setRaw(r, c, cell); this.sheets.splice(i, 0, sheet); }, redo: doIt }); this.tx_.rebuild = true; this.commit(); return true;
    }
    renameSheet(sheet, name) {
      const old = sheet.name; if (old === name) return; this.begin('Rename Sheet'); const saved = [];
      const doIt = () => { saved.length = 0; sheet.name = name; for (const sh of this.sheets) sh.eachCellObj((cell, r, c) => { if (cell.f !== undefined && cell.f.indexOf('!') >= 0) { const nf = FM.renameSheet(cell.f, old, name); if (nf !== cell.f) { saved.push([sh, r, c, cell]); sh.setRaw(r, c, Object.assign({}, cell, { f: nf, ast: null, deps: null, bad: false })); } } }); for (const nm of this.names.values()) { const nr = FM.renameSheet(nm.ref, old, name); if (nr !== nm.ref) { saved.push([nm, 'ref', nm.ref]); nm.ref = nr; nm.ast = null; } } };
      doIt(); this._log({ t: 'fn', undo: () => { sheet.name = old; for (const [a, b, c, d] of saved) { if (a instanceof Sheet) a.setRaw(b, c, d); else a[b] = c; } }, redo: doIt }); this.tx_.rebuild = true; this.commit();
    }
    moveSheet(sheet, to) { const from = this.sheets.indexOf(sheet); if (from === to) return; this.begin('Move Sheet'); const mv = (a, b) => { const [s] = this.sheets.splice(a, 1); this.sheets.splice(b, 0, s); }; mv(from, to); this._log({ t: 'fn', undo: () => mv(to, from), redo: () => mv(from, to) }); this.commit(); }
    duplicateSheet(sheet) {
      const s = this._newSheet(this.uniqueName(sheet.name + ' copy')); this.begin('Duplicate Sheet');
      for (const k of META_KEYS) if (k !== 'name') s[k] = clone(sheet[k]);
      const refName = (t) => FM.rewrite(t, (x) => { if (x.sheet == null) x.sheet = sheet.name; return x; });
      sheet.eachCellObj((cell, r, c) => { if (cell.sp !== undefined) return; const nc = Object.assign({}, cell); delete nc.deps; delete nc.spill; delete nc.ast; if (nc.f !== undefined) { nc.ast = null; } s.setRaw(r, c, nc); });
      const i = this.sheets.indexOf(sheet) + 1; this.sheets.splice(i, 0, s); this._log({ t: 'fn', undo: () => this.sheets.splice(this.sheets.indexOf(s), 1), redo: () => this.sheets.splice(i, 0, s) }); this.tx_.rebuild = true; this.commit(); return s;
    }

    // ----- structured (table) references -----
    tableByName(n) { const l = n.toLowerCase(); for (const sh of this.sheets) for (const t of sh.tables) if (t.name.toLowerCase() === l) return { t, sh }; return null; }
    resolveTref(node, ctx, quiet) {
      let found; if (node.table) found = this.tableByName(node.table); else { for (const sh of this.sheets) for (const t of sh.tables) if (sh === ctx.sheet && ctx.r >= t.r1 && ctx.r <= t.r2 && ctx.c >= t.c1 && ctx.c <= t.c2) found = { t, sh }; }
      if (!found) return E.REF; const { t, sh } = found; const hdr = t.header !== false ? 1 : 0, tot = t.total ? 1 : 0;
      let spec = node.spec.trim(); if (spec[0] === '[' && spec[spec.length - 1] === ']') spec = spec.slice(1, -1);
      const items = []; { let d = 0, cur = ''; for (const ch of spec) { if (ch === '[') d++; else if (ch === ']') d--; if (ch === ',' && d === 0) { items.push(cur.trim()); cur = ''; } else cur += ch; } items.push(cur.trim()); }
      let rowPart = 'data', colA = null, colB = null, thisRow = false;
      const colIdx = (nm) => { nm = nm.replace(/^\[|\]$/g, '').replace(/'(.)/g, '$1'); const i = (t.cols || []).findIndex((x) => String(x).toLowerCase() === nm.toLowerCase()); return i; };
      for (let it of items) {
        if (!it) continue; const u = it.replace(/^\[|\]$/g, '').toLowerCase();
        if (u === '#all') rowPart = 'all'; else if (u === '#data') rowPart = 'data'; else if (u === '#headers') rowPart = 'headers'; else if (u === '#totals') rowPart = 'totals'; else if (u === '#this row') thisRow = true;
        else if (it[0] === '@') { thisRow = true; const nm = it.slice(1); if (nm) { colA = colB = colIdx(nm); } }
        else if (it.includes(']:[') || /^\[.*\]:\[.*\]$/.test(it)) { const [a, b] = it.split(/\]\s*:\s*\[/); colA = colIdx(a); colB = colIdx(b); }
        else { colA = colB = colIdx(it); }
        if (colA === -1) return E.REF;
      }
      const c1 = colA == null ? t.c1 : t.c1 + Math.min(colA, colB), c2 = colA == null ? t.c2 : t.c1 + Math.max(colA, colB);
      let r1 = t.r1 + hdr, r2 = t.r2 - tot;
      if (thisRow) { r1 = r2 = ctx.r; } else if (rowPart === 'all') { r1 = t.r1; r2 = t.r2; } else if (rowPart === 'headers') { r1 = r2 = t.r1; } else if (rowPart === 'totals') { r1 = r2 = t.r2; }
      return new Range(sh, r1, c1, r2, c2);
    }

    // ----- (de)serialisation -----
    encV(v) { return v instanceof ZErr ? { e: v.code } : v; }
    decV(v) { return v && typeof v === 'object' && v.e ? ZN.errFromCode(v.e) || E.VALUE : v; }
    toJSON() {
      const sheets = this.sheets.map((sh) => {
        const rows = {}; sh.eachCellObj((cell, r, c) => { if (cell.sp !== undefined) return; if (cell.v === undefined && cell.f === undefined && cell.s === undefined) return; (rows[r] || (rows[r] = [])).push([c, cell.f !== undefined ? null : this.encV(cell.v), cell.f === undefined ? null : cell.f, cell.s === undefined ? null : cell.s]); });
        const o = { id: sh.id, rows }; for (const k of META_KEYS) o[k] = sh[k]; return o;
      });
      return { format: 'znumbers', version: 1, props: this.props, active: this.active, styles: this.styles, names: [...this.names.values()].map((n) => ({ name: n.name, ref: n.ref, scope: n.scope || null, comment: n.comment })), sheets };
    }
    static fromJSON(j) {
      const wb = new Workbook(); wb.styles = j.styles && j.styles.length ? j.styles : [{}]; wb.styles[0] = {}; wb.styleIdx = new Map(wb.styles.map((s, i) => [JSON.stringify(s), i])); wb.props = j.props || wb.props; wb.active = j.active || 0;
      for (const sj of j.sheets) {
        const sh = wb._newSheet(sj.name); wb.sheets.push(sh); if (sj.id) { wb.byId.delete(sh.id); sh.id = sj.id; wb.byId.set(sh.id, sh); wb.nextId = Math.max(wb.nextId, sj.id + 1); }
        for (const k of META_KEYS) if (sj[k] !== undefined && k !== 'name') sh[k] = sj[k];
        for (const r in sj.rows) for (const [c, v, f, s] of sj.rows[r]) { const cell = {}; if (f != null) cell.f = f; cell.v = f != null ? undefined : wb.decV(v); if (s != null) cell.s = s; sh.setRaw(+r, c, cell); }
      }
      for (const n of j.names || []) wb.names.set(wb.nameKey(n.name, n.scope ? { id: n.scope } : null), { name: n.name, ref: n.ref, scope: n.scope || null, comment: n.comment });
      wb.rebuildGraph(); wb.recalc(null); return wb;
    }
    // bulk finalize after loaders called sheet.setRaw
    finish() { this.rebuildGraph(); this.recalc(null); }
  }
  ZN.Workbook = Workbook;
  ZN.newWorkbook = () => { const wb = new Workbook(); wb.addSheetRaw('Sheet1'); return wb; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
