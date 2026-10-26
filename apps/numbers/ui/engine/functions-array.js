/* ZengNumbers: dynamic-array functions (FILTER, SORT, SORTBY, UNIQUE, SEQUENCE, TAKE, VSTACK, ...) and SUMPRODUCT. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, Range } = ZN; const F = ZN.F;
  const { isErr, toInt, toNum, toBool, scalar } = F;
  const CAT = 'Lookup & Reference';
  const D = (names, min, max, hint, desc, impl, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: CAT, hint, desc }, opts));
  const nz = (v) => (v === undefined ? null : v);
  const grid = (v) => (v instanceof Range ? v.toArray() : Array.isArray(v) ? v : [[nz(v)]]);
  const transpose = (g) => Array.from({ length: g[0].length }, (_, j) => g.map((row) => row[j]));
  const one = (g) => (g.length === 1 && g[0].length === 1 ? g[0][0] : g);
  const fin = (g) => (g.length === 0 || g[0].length === 0 ? E.CALC : g);
  const flatList = (g) => [].concat(...g);
  ZN.arr = { grid, transpose };

  // ---------- sort ordering (numbers < text < logicals < errors; blanks always last) ----------
  const rank = (v) => (v == null ? 4 : isErr(v) ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  const cmpSort = (a, b, desc) => {
    const ra = rank(a), rb = rank(b);
    if (ra === 4 || rb === 4) return ra === rb ? 0 : ra === 4 ? 1 : -1;
    let c;
    if (ra !== rb) c = ra - rb;
    else if (ra === 0) c = a < b ? -1 : a > b ? 1 : 0;
    else if (ra === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); c = x < y ? -1 : x > y ? 1 : 0; }
    else if (ra === 2) c = a === b ? 0 : a ? 1 : -1; else c = 0;
    return desc ? -c : c;
  };
  const sortRows = (g, keys, orders) => { // keys: array of arrays (one value per row)
    const idx = g.map((_, i) => i);
    idx.sort((x, y) => { for (let k = 0; k < keys.length; k++) { const c = cmpSort(keys[k][x], keys[k][y], orders[k] < 0); if (c) return c; } return x - y; });
    return idx.map((i) => g[i]);
  };
  const ints = (v) => { const out = []; for (const x of F.flat(v)) { const n = toInt(x); if (isErr(n)) return n; out.push(n); } return out; };

  D('SORT', 1, 4, 'SORT(array, [sort_index], [sort_order], [by_col])', 'Sorts the contents of a range or array.', (arr, si, so, bc) => {
    let g = grid(arr); const byCol = bc === undefined ? false : toBool(scalar(bc)); if (isErr(byCol)) return byCol;
    const idx = si === undefined ? [1] : ints(si); if (isErr(idx)) return idx;
    const ord = so === undefined ? [1] : ints(so); if (isErr(ord)) return ord;
    if (byCol) g = transpose(g); const C = g[0].length;
    for (const i of idx) if (i < 1 || i > C) return E.VALUE; for (const o of ord) if (o !== 1 && o !== -1) return E.VALUE;
    const orders = idx.map((_, k) => (ord.length === 1 ? ord[0] : ord[k] === undefined ? 1 : ord[k]));
    let out = sortRows(g, idx.map((i) => g.map((row) => row[i - 1])), orders); if (byCol) out = transpose(out);
    return one(out);
  });
  D('SORTBY', 2, -1, 'SORTBY(array, by_array1, [sort_order1], [by_array2, sort_order2], …)', 'Sorts a range or array based on the values in a corresponding range or array.', (arr, ...rest) => {
    let g = grid(arr); const R = g.length, C = g[0].length; let byCol = null; const keys = [], orders = [];
    for (let i = 0; i < rest.length; i += 2) {
      const b = grid(rest[i]); const isCol = b[0].length === 1 && b.length === R, isRow = b.length === 1 && b[0].length === C;
      const col = byCol === null ? (isCol ? false : isRow ? true : null) : byCol;
      if (col === null || (col ? !isRow : !isCol)) return E.VALUE; byCol = col;
      let o = 1; if (rest[i + 1] !== undefined) { o = toInt(rest[i + 1]); if (isErr(o)) return o; if (o !== 1 && o !== -1) return E.VALUE; }
      keys.push(col ? b[0] : b.map((r) => r[0])); orders.push(o);
    }
    if (byCol) g = transpose(g);
    let out = sortRows(g, keys, orders); if (byCol) out = transpose(out); return one(out);
  });
  D('FILTER', 2, 3, 'FILTER(array, include, [if_empty])', 'Filters a range or array based on criteria you define.', (arr, inc, ifEmpty) => {
    const g = grid(arr), ig = grid(inc); const R = g.length, C = g[0].length; let byRow;
    if (ig[0].length === 1 && ig.length === R) byRow = true; else if (ig.length === 1 && ig[0].length === C) byRow = false; else return E.VALUE;
    const flags = flatList(ig); const keep = [];
    for (const x of flags) { if (isErr(x)) return x; const n = typeof x === 'string' ? E.VALUE : toNum(x); if (isErr(n)) return n; keep.push(n !== 0); }
    let out;
    if (byRow) out = g.filter((_, i) => keep[i]); else out = g.map((row) => row.filter((_, j) => keep[j]));
    if (!out.length || !out[0].length) return ifEmpty === undefined ? E.CALC : ifEmpty;
    return one(out.map((r) => r.map(nz)));
  }, { errs: true });
  const keyOf = (v) => (v == null ? 'b' : isErr(v) ? 'e' + v.code : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'number' ? 'n' + v : 'o' + v);
  D('UNIQUE', 1, 3, 'UNIQUE(array, [by_col], [exactly_once])', 'Returns the unique values from a range or array.', (arr, bc, eo) => {
    let g = grid(arr); const byCol = bc === undefined ? false : toBool(scalar(bc)), once = eo === undefined ? false : toBool(scalar(eo));
    if (isErr(byCol)) return byCol; if (isErr(once)) return once;
    if (byCol) g = transpose(g);
    const seen = new Map(); g.forEach((row, i) => { const k = row.map(keyOf).join('\u0001'); const e = seen.get(k); if (e) e.n++; else seen.set(k, { i, n: 1 }); });
    let out = [...seen.values()].filter((e) => !once || e.n === 1).map((e) => g[e.i].map(nz));
    if (!out.length) return E.CALC; if (byCol) out = transpose(out); return one(out);
  });
  D('SEQUENCE', 1, 4, 'SEQUENCE(rows, [columns], [start], [step])', 'Generates a list of sequential numbers in an array.', (r, c, s, st) => {
    const R = toInt(scalar(r)), C = c === undefined ? 1 : toInt(scalar(c)), S = s === undefined ? 1 : toNum(scalar(s)), T = st === undefined ? 1 : toNum(scalar(st));
    for (const x of [R, C, S, T]) if (isErr(x)) return x;
    if (R < 1 || C < 1) return E.CALC; if (R * C > 5e6) return E.NUM;
    const out = []; for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(S + (i * C + j) * T); out.push(row); } return one(out);
  });
  D('RANDARRAY', 0, 5, 'RANDARRAY([rows], [columns], [min], [max], [whole_number])', 'Returns an array of random numbers.', (r, c, mn, mx, wn) => {
    const R = r === undefined ? 1 : toInt(scalar(r)), C = c === undefined ? 1 : toInt(scalar(c)), lo = mn === undefined ? 0 : toNum(scalar(mn)), hi = mx === undefined ? 1 : toNum(scalar(mx)), w = wn === undefined ? false : toBool(scalar(wn));
    for (const x of [R, C, lo, hi, w]) if (isErr(x)) return x;
    if (R < 1 || C < 1 || lo > hi) return E.VALUE; if (R * C > 5e6) return E.NUM;
    if (w && (Math.ceil(lo) > Math.floor(hi))) return E.VALUE;
    const out = []; for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(w ? Math.ceil(lo) + Math.floor(ZN.rand() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + ZN.rand() * (hi - lo)); out.push(row); } return one(out);
  }, { volatile: true, cat: 'Math & Trig' });

  // ---------- reshape ----------
  const takeDrop = (isTake) => (arr, rows, cols) => {
    const g = grid(arr); const R = g.length, C = g[0].length;
    const rr = rows === undefined ? undefined : toInt(scalar(rows)), cc = cols === undefined ? undefined : toInt(scalar(cols)); if (isErr(rr)) return rr; if (isErr(cc)) return cc;
    const span = (n, k) => { // -> [start, end)
      if (k === undefined) return isTake ? [0, n] : [0, n];
      if (isTake) { if (k === 0) return null; return k > 0 ? [0, Math.min(k, n)] : [Math.max(n + k, 0), n]; }
      if (k >= 0) return [Math.min(k, n), n]; return [0, Math.max(n + k, 0)];
    };
    const a = span(R, rr), b = span(C, cc); if (!a || !b || a[1] <= a[0] || b[1] <= b[0]) return E.CALC;
    return one(g.slice(a[0], a[1]).map((row) => row.slice(b[0], b[1]).map(nz)));
  };
  D('TAKE', 2, 3, 'TAKE(array, rows, [columns])', 'Returns rows or columns from the start or end of an array.', takeDrop(true));
  D('DROP', 2, 3, 'DROP(array, rows, [columns])', 'Excludes a specified number of rows or columns from the start or end of an array.', takeDrop(false));
  D(['VSTACK'], 1, -1, 'VSTACK(array1, [array2], …)', 'Appends arrays vertically into one array.', (...as) => {
    const gs = as.map(grid); const w = Math.max(...gs.map((g) => g[0].length));
    return one([].concat(...gs.map((g) => g.map((row) => row.map(nz).concat(Array(w - row.length).fill(E.NA))))));
  });
  D(['HSTACK'], 1, -1, 'HSTACK(array1, [array2], …)', 'Appends arrays horizontally into one array.', (...as) => {
    const gs = as.map(grid); const h = Math.max(...gs.map((g) => g.length)); const out = [];
    for (let i = 0; i < h; i++) { let row = []; for (const g of gs) row = row.concat(i < g.length ? g[i].map(nz) : Array(g[0].length).fill(E.NA)); out.push(row); }
    return one(out);
  });
  const toVec = (byCol0) => (arr, ign, sbc) => {
    const g = grid(arr); const ig = ign === undefined ? 0 : toInt(scalar(ign)), bc = sbc === undefined ? false : toBool(scalar(sbc)); if (isErr(ig)) return ig; if (isErr(bc)) return bc;
    if (ig < 0 || ig > 3) return E.VALUE;
    let list = flatList(bc ? transpose(g) : g).map(nz);
    list = list.filter((v) => !(((ig & 1) && v == null) || ((ig & 2) && isErr(v))));
    if (!list.length) return E.CALC; return byCol0 ? list.map((v) => [v]) : [list];
  };
  D('TOCOL', 1, 3, 'TOCOL(array, [ignore], [scan_by_column])', 'Returns the array as a single column.', toVec(true));
  D('TOROW', 1, 3, 'TOROW(array, [ignore], [scan_by_column])', 'Returns the array as a single row.', toVec(false));
  const wrap = (byRow) => (vec, wc, pad) => {
    const g = grid(vec); if (g.length !== 1 && g[0].length !== 1) return E.VALUE;
    const n = toInt(scalar(wc)); if (isErr(n)) return n; if (n < 1) return E.VALUE;
    const list = flatList(g).map(nz); const p = pad === undefined ? E.NA : scalar(pad); const k = Math.ceil(list.length / n); const at = (i) => (i < list.length ? list[i] : p);
    const out = byRow ? Array.from({ length: k }, (_, i) => Array.from({ length: n }, (_, j) => at(i * n + j))) : Array.from({ length: n }, (_, i) => Array.from({ length: k }, (_, j) => at(j * n + i)));
    return one(out);
  };
  D('WRAPROWS', 2, 3, 'WRAPROWS(vector, wrap_count, [pad_with])', 'Wraps a row or column vector into rows after a specified number of values.', wrap(true), { errs: true });
  D('WRAPCOLS', 2, 3, 'WRAPCOLS(vector, wrap_count, [pad_with])', 'Wraps a row or column vector into columns after a specified number of values.', wrap(false), { errs: true });
  D('EXPAND', 2, 4, 'EXPAND(array, rows, [columns], [pad_with])', 'Expands an array to the specified dimensions.', (arr, rows, cols, pad) => {
    const g = grid(arr); const R = g.length, C = g[0].length;
    const r = rows === undefined ? R : toInt(scalar(rows)), c = cols === undefined ? C : toInt(scalar(cols)); if (isErr(r)) return r; if (isErr(c)) return c;
    if (r < R || c < C) return E.VALUE; const p = pad === undefined ? E.NA : scalar(pad);
    return one(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i < R && j < C ? nz(g[i][j]) : p))));
  }, { errs: true });

  // ---------- SUMPRODUCT / FREQUENCY / ARRAYTOTEXT ----------
  D('SUMPRODUCT', 1, 255, 'SUMPRODUCT(array1, [array2], …)', 'Returns the sum of the products of corresponding ranges or arrays.', (...as) => {
    const dim = (a) => (a instanceof Range ? [a.rows, a.cols] : Array.isArray(a) ? [a.length, a[0].length] : [1, 1]);
    const [R, C] = dim(as[0]); for (const a of as) { const [r, c] = dim(a); if (r !== R || c !== C) return E.VALUE; }
    let lim = R; if (as.every((a) => a instanceof Range) && R > 100000) lim = Math.max(...as.map((a) => a.clampedRows()));
    const rd = as.map((a) => (a instanceof Range ? (i, j) => a.get(i, j) : Array.isArray(a) ? (i, j) => a[i][j] : () => a));
    let sum = 0;
    for (let i = 0; i < lim; i++) for (let j = 0; j < C; j++) {
      let p = 1;
      for (const g of rd) { const v = g(i, j); if (isErr(v)) return v; p *= typeof v === 'number' ? v : 0; }
      sum += p;
    }
    return sum;
  }, { errs: true, cat: 'Math & Trig' });
  D('FREQUENCY', 2, 2, 'FREQUENCY(data_array, bins_array)', 'Calculates how often values occur within a range of values, returning a vertical array.', (data, bins) => {
    const d = F.flat(data).filter((x) => typeof x === 'number'), b = F.flat(bins).filter((x) => typeof x === 'number');
    const cnt = new Array(b.length + 1).fill(0);
    for (const x of d) { let best = -1; for (let i = 0; i < b.length; i++) if (x <= b[i] && (best < 0 || b[i] < b[best])) best = i; cnt[best < 0 ? b.length : best]++; }
    return cnt.map((n) => [n]);
  }, { cat: 'Statistical' });
  D('ARRAYTOTEXT', 1, 2, 'ARRAYTOTEXT(array, [format])', 'Returns an array of text values from any specified range.', (arr, fmt) => {
    const f = fmt === undefined ? 0 : toInt(scalar(fmt)); if (isErr(f)) return f; if (f !== 0 && f !== 1) return E.VALUE;
    const g = grid(arr); const s = (v) => { v = nz(v); if (isErr(v)) return v.code; if (v == null) return ''; if (typeof v === 'string') return f ? '"' + v.replace(/"/g, '""') + '"' : v; return F.toStr(v); };
    if (!f) return flatList(g).map(s).join(', ');
    return (g.length === 1 && g[0].length === 1 ? '' : '{') + g.map((r) => r.map(s).join(',')).join(';') + (g.length === 1 && g[0].length === 1 ? '' : '}');
  }, { cat: 'Text' });
})(typeof globalThis !== 'undefined' ? globalThis : this);
