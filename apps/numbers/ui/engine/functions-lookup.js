/* ZengGrid: Lookup & Reference functions (VLOOKUP, XLOOKUP, MATCH, INDEX, OFFSET, INDIRECT, ADDRESS, ...). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, Range, ZErr, MAXR, MAXC } = ZN; const F = ZN.F; const FM = ZN.formula;
  const { isErr, toInt, toNum, toBool, toStr, scalar, cmp, typeRank, hasWild, wildRe } = F;
  const CAT = 'Lookup & Reference';
  const D = (names, min, max, hint, desc, impl, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: CAT, hint, desc }, opts));

  // ---------- helpers ----------
  const nz = (v) => (v === undefined ? null : v);
  // uniform 2D accessor over Range / array / scalar. R = rows to scan (clamped for whole columns), RR = declared rows
  const mk = (v) => {
    if (v instanceof Range) { const R = v.clampedRows(); return { R, RR: v.rows, C: v.cols, rng: v, g: (i, j) => v.get(i, j) }; }
    if (Array.isArray(v)) { const R = v.length, C = R ? v[0].length : 0; return { R, RR: R, C, g: (i, j) => nz(v[i] ? v[i][j] : null) }; }
    return { R: 1, RR: 1, C: 1, g: () => nz(v) };
  };
  const isMulti = (v) => (v instanceof Range ? !v.isSingle() : Array.isArray(v) && !(v.length === 1 && v[0].length === 1));
  const grid = (v) => (v instanceof Range ? v.toArray() : Array.isArray(v) ? v : [[nz(v)]]);
  const normKey = (k) => { k = scalar(k); return k == null ? 0 : k; };
  const sameType = (a, b) => typeRank(a) === typeRank(b);
  const blankish = (v) => v == null || isErr(v);

  function matcher(key, wild) {
    if (typeof key === 'string') {
      if (wild && hasWild(key)) { const re = wildRe(key); return (v) => typeof v === 'string' && re.test(v); }
      const l = key.toLowerCase(); return (v) => typeof v === 'string' && v.toLowerCase() === l;
    }
    if (isErr(key)) return (v) => isErr(v) && v.code === key.code;
    return (v) => v === key;
  }
  // binary search exactly like Excel: last index whose value is <= key (dir 1, ascending data) or >= key (dir -1, descending data)
  function bsearch(n, g, key, dir) {
    let lo = 0, hi = n - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; let p = mid, v;
      while (p <= hi) { v = g(p); if (!blankish(v)) break; p++; }
      if (p > hi) { hi = mid - 1; continue; }
      const c = cmp(v, key) * dir;
      if (c <= 0) { best = p; lo = p + 1; } else hi = mid - 1;
    }
    return best;
  }
  const approx = (n, g, key, dir) => { const b = bsearch(n, g, key, dir); return b >= 0 && sameType(g(b), key) ? b : -1; };
  const exact = (n, g, key, wild, rev) => {
    const m = matcher(key, wild);
    if (rev) { for (let i = n - 1; i >= 0; i--) if (m(g(i))) return i; } else for (let i = 0; i < n; i++) if (m(g(i))) return i;
    return -1;
  };
  // XLOOKUP/XMATCH core. returns index, -1, or ZErr
  function findIdx(key, n, g, mm, sm) {
    key = normKey(key);
    if (![0, -1, 1, 2].includes(mm) || ![1, -1, 2, -2].includes(sm)) return E.VALUE;
    if (sm === 2 || sm === -2) {
      if (mm === 2) return E.VALUE;
      const gg = sm === 2 ? g : (i) => g(n - 1 - i);
      const ub = bsearch(n, gg, key, 1); let idx = -1;
      if (ub >= 0 && sameType(gg(ub), key) && cmp(gg(ub), key) === 0) idx = ub;
      else if (mm === -1) idx = ub >= 0 && sameType(gg(ub), key) ? ub : -1;
      else if (mm === 1) { let p = ub + 1; while (p < n && blankish(gg(p))) p++; idx = p < n && sameType(gg(p), key) ? p : -1; }
      return idx < 0 ? -1 : sm === 2 ? idx : n - 1 - idx;
    }
    const rev = sm === -1;
    const ex = exact(n, g, key, mm === 2, rev); if (ex >= 0 || mm === 0 || mm === 2) return ex;
    let best = -1, bv;
    const scan = (i) => { const v = g(i); if (blankish(v) || !sameType(v, key)) return; const c = cmp(v, key); if (mm === -1 ? c < 0 : c > 0) { if (best < 0 || (mm === -1 ? cmp(v, bv) > 0 : cmp(v, bv) < 0)) { best = i; bv = v; } } };
    if (rev) for (let i = n - 1; i >= 0; i--) scan(i); else for (let i = 0; i < n; i++) scan(i);
    return best;
  }
  const vec = (a) => { // 1-D view of a range/array: {n, g, col}
    if (a.R === 1) return { n: a.C, g: (i) => a.g(0, i), col: false };
    if (a.C === 1) return { n: a.R, g: (i) => a.g(i, 0), col: true };
    return null;
  };
  const addDyn = (rg) => { const c = ZN.ctx; if (c && rg instanceof Range) (c.dyn || (c.dyn = [])).push({ sheet: rg.sheet, r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 }); };

  // ---------- VLOOKUP / HLOOKUP / LOOKUP ----------
  const tableLookup = (byRow) => (key, tbl, idx, rl) => {
    const t = mk(tbl); key = normKey(key); const ci = toInt(idx); if (isErr(ci)) return ci;
    if (ci < 1) return E.VALUE; if (ci > (byRow ? t.R : t.C)) return E.REF;
    const ap = rl === undefined ? true : toBool(rl); if (isErr(ap)) return ap;
    const n = byRow ? t.C : t.R, g = byRow ? (i) => t.g(0, i) : (i) => t.g(i, 0);
    const k = ap ? approx(n, g, key, 1) : exact(n, g, key, true);
    if (k < 0) return E.NA;
    return byRow ? t.g(ci - 1, k) : t.g(k, ci - 1);
  };
  D('VLOOKUP', 3, 4, 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])', 'Looks for a value in the first column of a table and returns a value in the same row from a column you specify.', tableLookup(false), { lift: true, raw: [1] });
  D('HLOOKUP', 3, 4, 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])', 'Looks for a value in the top row of a table and returns a value in the same column from a row you specify.', tableLookup(true), { lift: true, raw: [1] });
  D('LOOKUP', 2, 3, 'LOOKUP(lookup_value, lookup_vector, [result_vector])', 'Looks up a value in a vector or array (sorted ascending) and returns the corresponding value.', (key, lv, rv) => {
    key = normKey(key); const a = mk(lv);
    if (rv !== undefined) {
      const s = vec(a), r = vec(mk(rv)); if (!s || !r) return E.NA;
      const k = approx(s.n, s.g, key, 1); if (k < 0) return E.NA; return k < r.n ? nz(r.g(k)) : E.NA;
    }
    const wide = a.C > a.R; const n = wide ? a.C : a.R;
    const k = approx(n, wide ? (i) => a.g(0, i) : (i) => a.g(i, 0), key, 1); if (k < 0) return E.NA;
    return wide ? a.g(a.R - 1, k) : a.g(k, a.C - 1);
  }, { lift: true, raw: [1, 2] });

  // ---------- MATCH / XMATCH / XLOOKUP ----------
  D('MATCH', 2, 3, 'MATCH(lookup_value, lookup_array, [match_type])', 'Returns the relative position of an item in an array that matches a specified value.', (key, arr, mt) => {
    const v = vec(mk(arr)); if (!v) return E.NA; key = normKey(key);
    const t = mt === undefined ? 1 : toNum(mt); if (isErr(t)) return t;
    const k = t > 0 ? approx(v.n, v.g, key, 1) : t < 0 ? approx(v.n, v.g, key, -1) : exact(v.n, v.g, key, true);
    return k < 0 ? E.NA : k + 1;
  }, { lift: true, raw: [1] });
  D('XMATCH', 2, 4, 'XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])', 'Returns the relative position of an item in an array or range of cells.', (key, arr, mm, sm) => {
    const v = vec(mk(arr)); if (!v) return E.VALUE;
    const a = mm === undefined ? 0 : toInt(mm), b = sm === undefined ? 1 : toInt(sm); if (isErr(a)) return a; if (isErr(b)) return b;
    const k = findIdx(key, v.n, v.g, a, b); if (isErr(k)) return k; return k < 0 ? E.NA : k + 1;
  }, { lift: true, raw: [1] });
  D('XLOOKUP', 3, 6, 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])', 'Searches a range or array for a match and returns the corresponding item from a second range or array.', (key, la, ra, nf, mm, sm) => {
    const l = mk(la), r = mk(ra); const v = vec(l); if (!v) return E.VALUE;
    const a = mm === undefined ? 0 : toInt(mm), b = sm === undefined ? 1 : toInt(sm); if (isErr(a)) return a; if (isErr(b)) return b;
    const col = v.col || (l.R === 1 && l.C === 1);
    if (col ? r.RR !== l.RR : r.C !== l.C) return E.VALUE;
    const one = (k) => {
      const i = findIdx(k, v.n, v.g, a, b); if (isErr(i)) return i;
      if (i < 0) return nf === undefined ? E.NA : nf;
      if (r.rng) { const g = r.rng; return col ? new Range(g.sheet, g.r1 + i, g.c1, g.r1 + i, g.c2) : new Range(g.sheet, g.r1, g.c1 + i, g.r2, g.c1 + i); }
      if (col) return [Array.from({ length: r.C }, (_, j) => r.g(i, j))];
      return Array.from({ length: r.R }, (_, ii) => [r.g(ii, i)]);
    };
    if (!isMulti(key)) { const o = one(normKey(key)); return o instanceof Range && o.isSingle() ? o.get(0, 0) : o; }
    const kg = grid(key); if (kg.length > 1 && kg[0].length > 1) return E.VALUE;
    const parts = []; for (const row of kg) for (const k of row) { const o = one(k == null ? 0 : k); if (isErr(o) && !(nf !== undefined)) { parts.push([[o]]); } else parts.push(o instanceof Range ? o.toArray() : Array.isArray(o) ? o : [[o]]); }
    if (kg.length > 1) { const w = Math.max(...parts.map((p) => p[0].length)); return [].concat(...parts.map((p) => p.map((row) => row.concat(Array(w - row.length).fill(E.NA))))); }
    const h = Math.max(...parts.map((p) => p.length)); const out = Array.from({ length: h }, () => []);
    for (const p of parts) for (let i = 0; i < h; i++) out[i].push(...(p[i] || Array(p[0].length).fill(E.NA)));
    return out;
  }, { errs: true });

  // ---------- INDEX / OFFSET / INDIRECT / ADDRESS ----------
  function indexOne(arr, rn, cn) {
    const isR = arr instanceof Range; let R, C;
    if (isR) { R = arr.rows; C = arr.cols; } else if (Array.isArray(arr)) { R = arr.length; C = arr[0].length; } else { R = 1; C = 1; arr = [[arr]]; }
    if (rn != null) { rn = toInt(rn); if (isErr(rn)) return rn; }
    if (cn != null) { cn = toInt(cn); if (isErr(cn)) return cn; }
    if (R === 1 && cn === undefined && rn !== undefined) { cn = rn; rn = 1; }
    if (rn == null) rn = 0; if (cn == null) cn = 0;
    if (rn < 0 || cn < 0) return E.VALUE; if (rn > R || cn > C) return E.REF;
    const r1 = rn ? rn - 1 : 0, r2 = rn ? rn - 1 : R - 1, c1 = cn ? cn - 1 : 0, c2 = cn ? cn - 1 : C - 1;
    if (isR) return new Range(arr.sheet, arr.r1 + r1, arr.c1 + c1, arr.r1 + r2, arr.c1 + c2);
    if (r1 === r2 && c1 === c2) return nz(arr[r1][c1]);
    return arr.slice(r1, r2 + 1).map((row) => row.slice(c1, c2 + 1));
  }
  D('INDEX', 2, 4, 'INDEX(array, row_num, [column_num], [area_num])', 'Returns a value or reference from within a table or range at the given row and column.', (arr, rn, cn, area) => {
    if (area !== undefined) { const a = toInt(area); if (isErr(a)) return a; if (a !== 1) return E.REF; }
    if (rn instanceof Range && rn.isSingle()) rn = rn.get(0, 0); if (cn instanceof Range && cn.isSingle()) cn = cn.get(0, 0);
    if (isMulti(rn) || isMulti(cn)) return FM.broadcast(rn, cn, (r, c) => { const o = indexOne(arr, r, c); return o instanceof Range ? o.get(0, 0) : Array.isArray(o) ? o[0][0] : o; });
    return indexOne(arr, rn, cn);
  });
  D('OFFSET', 3, 5, 'OFFSET(reference, rows, cols, [height], [width])', 'Returns a reference offset from a given reference by a number of rows and columns.', (ref, rows, cols, h, w) => {
    if (!(ref instanceof Range)) return E.VALUE;
    const dr = toInt(rows), dc = toInt(cols); if (isErr(dr)) return dr; if (isErr(dc)) return dc;
    const hh = h == null ? ref.rows : toInt(h), ww = w == null ? ref.cols : toInt(w); if (isErr(hh)) return hh; if (isErr(ww)) return ww;
    if (hh <= 0 || ww <= 0) return E.REF;
    const r1 = ref.r1 + dr, c1 = ref.c1 + dc, r2 = r1 + hh - 1, c2 = c1 + ww - 1;
    if (r1 < 0 || c1 < 0 || r2 >= MAXR || c2 >= MAXC) return E.REF;
    const out = new Range(ref.sheet, r1, c1, r2, c2); addDyn(out); return out;
  }, { volatile: true });
  function parseR1C1(s, ctx) {
    const part = (x, base) => (x === undefined || x === '' ? base : x[0] === '[' ? base + parseInt(x.slice(1, -1), 10) : parseInt(x, 10) - 1);
    const m = /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?::R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?)?$/i.exec(s); if (!m) return null;
    const r1 = part(m[1], ctx.r), c1 = part(m[2], ctx.c);
    const hasB = m[0].indexOf(':') >= 0; const r2 = hasB ? part(m[3], ctx.r) : r1, c2 = hasB ? part(m[4], ctx.c) : c1;
    return { r1, c1, r2, c2, sheet: null };
  }
  D('INDIRECT', 1, 2, 'INDIRECT(ref_text, [a1])', 'Returns the reference specified by a text string.', (txt, a1) => {
    const ctx = ZN.ctx; txt = scalar(txt); if (typeof txt !== 'string') return txt == null || typeof txt === 'number' || typeof txt === 'boolean' ? E.REF : E.VALUE;
    const isA1 = a1 === undefined ? true : toBool(scalar(a1)); if (isErr(isA1)) return isA1;
    let s = txt.trim(); if (!s) return E.REF; let ref = null;
    if (isA1) ref = FM.parseRef(s);
    else { const bang = s.lastIndexOf('!'); const sh = bang > 0 ? s.slice(0, bang) : null; const x = parseR1C1(bang > 0 ? s.slice(bang + 1) : s, ctx); if (x) { x.sheet = sh ? (sh[0] === "'" ? sh.slice(1, -1).replace(/''/g, "'") : sh) : null; ref = x; } }
    let out;
    if (ref) {
      const sh = ref.sheet == null ? ctx.sheet : ctx.wb.sheetByName(ref.sheet); if (!sh) return E.REF;
      if (ref.r1 < 0 || ref.c1 < 0 || ref.r2 >= MAXR || ref.c2 >= MAXC || ref.r2 < 0 || ref.c2 < 0) return E.REF;
      out = new Range(sh, ref.r1, ref.c1, ref.kind === 'cols' ? MAXR - 1 : ref.r2, ref.c2);
    } else {
      const nm = ctx.wb.lookupName(s, ctx.sheet); if (!nm) return E.REF;
      if (!nm.ast) { try { nm.ast = FM.parse(nm.ref); } catch (e) { return E.REF; } }
      out = FM.ev(nm.ast, Object.assign({}, ctx, { vars: null })); if (!(out instanceof Range)) return isErr(out) ? out : E.REF;
    }
    addDyn(out); return out;
  }, { volatile: true });
  D('ADDRESS', 2, 5, 'ADDRESS(row_num, column_num, [abs_num], [a1], [sheet_text])', 'Creates a cell reference as text, given specified row and column numbers.', (row, col, abs, a1, sheet) => {
    const r = toInt(row), c = toInt(col); if (isErr(r)) return r; if (isErr(c)) return c;
    const ab = abs === undefined ? 1 : toInt(abs); if (isErr(ab)) return ab;
    const isA1 = a1 === undefined ? true : toBool(a1); if (isErr(isA1)) return isA1;
    if (r < 1 || c < 1 || r > MAXR || c > MAXC || ab < 1 || ab > 4) return E.VALUE;
    const ar = ab === 1 || ab === 2, ac = ab === 1 || ab === 3; let s;
    if (isA1) s = (ac ? '$' : '') + ZN.colName(c - 1) + (ar ? '$' : '') + r;
    else s = 'R' + (ar ? r : '[' + r + ']') + 'C' + (ac ? c : '[' + c + ']');
    if (sheet !== undefined && sheet !== null) { const n = toStr(sheet); if (isErr(n)) return n; if (n !== '') s = FM.quoteSheet(n) + '!' + s; }
    return s;
  }, { lift: true });

  // ---------- CHOOSECOLS / CHOOSEROWS / AREAS / HYPERLINK / TRANSPOSE / ROWS / COLUMNS / TRIMRANGE ----------
  const choose = (byCol) => (arr, ...idx) => {
    const g = grid(arr), R = g.length, C = g[0].length, n = byCol ? C : R; const pick = [];
    for (const x of F.flat(idx)) { const k = toInt(x); if (isErr(k)) return k; if (k === 0 || Math.abs(k) > n) return E.VALUE; pick.push(k > 0 ? k - 1 : n + k); }
    return byCol ? g.map((row) => pick.map((j) => nz(row[j]))) : pick.map((i) => g[i].map(nz));
  };
  D('CHOOSECOLS', 2, -1, 'CHOOSECOLS(array, col_num1, [col_num2], …)', 'Returns the specified columns from an array.', choose(true));
  D('CHOOSEROWS', 2, -1, 'CHOOSEROWS(array, row_num1, [row_num2], …)', 'Returns the specified rows from an array.', choose(false));
  D('AREAS', 1, 1, 'AREAS(reference)', 'Returns the number of areas in a reference.', (r) => (r instanceof Range ? 1 : E.VALUE));
  D('HYPERLINK', 1, 2, 'HYPERLINK(link_location, [friendly_name])', 'Creates a link; the cell shows the friendly name (or the link text).', (link, name) => {
    if (name !== undefined) { const v = scalar(name); return v == null ? 0 : v; } const l = scalar(link); return l == null ? 0 : l;
  }, { errs: true });
  D('TRANSPOSE', 1, 1, 'TRANSPOSE(array)', 'Returns the transpose of an array: rows become columns and vice versa.', (a) => {
    const g = grid(a); const R = g.length, C = g[0].length; if (R === 1 && C === 1) return nz(g[0][0]);
    return Array.from({ length: C }, (_, j) => Array.from({ length: R }, (_, i) => nz(g[i][j])));
  });
  D('ROWS', 1, 1, 'ROWS(array)', 'Returns the number of rows in a reference or array.', (a) => (a instanceof Range ? a.rows : Array.isArray(a) ? a.length : 1));
  D('COLUMNS', 1, 1, 'COLUMNS(array)', 'Returns the number of columns in a reference or array.', (a) => (a instanceof Range ? a.cols : Array.isArray(a) ? a[0].length : 1));
  D('TRIMRANGE', 1, 3, 'TRIMRANGE(range, [trim_rows], [trim_cols])', 'Removes blank rows and/or columns from the edges of a range.', (rg, tr, tc) => {
    if (!(rg instanceof Range)) return rg; const a = tr === undefined ? 3 : toInt(tr), b = tc === undefined ? 3 : toInt(tc); if (isErr(a)) return a; if (isErr(b)) return b;
    const rowBlank = (r) => { for (let c = rg.c1; c <= rg.c2; c++) if (rg.sheet.getValue(r, c) != null) return false; return true; };
    const colBlank = (c, r1, r2) => { for (let r = r1; r <= r2; r++) if (rg.sheet.getValue(r, c) != null) return false; return true; };
    let r1 = rg.r1, r2 = Math.min(rg.r2, Math.max(rg.sheet.maxRow(), rg.r1)), c1 = rg.c1, c2 = rg.c2;
    if (a & 1) while (r1 < r2 && rowBlank(r1)) r1++; if (a & 2) while (r2 > r1 && rowBlank(r2)) r2--;
    if (b & 1) while (c1 < c2 && colBlank(c1, r1, r2)) c1++; if (b & 2) while (c2 > c1 && colBlank(c2, r1, r2)) c2--;
    return new Range(rg.sheet, r1, c1, r2, c2);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
