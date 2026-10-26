/* ZengNumbers logical functions + LAMBDA helpers (MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY). LET / LAMBDA live in formula.js. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, Range } = ZN; const F = ZN.F; const { isErr, toNum, toBool, scalar } = F; const FM = ZN.formula;
  const reg = (names, min, max, impl, hint, desc, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: 'Logical', hint, desc }, opts));
  const isMulti = (v) => (v instanceof Range ? !v.isSingle() : Array.isArray(v) && !(v.length === 1 && v[0].length === 1));
  const atB = (a, i, j) => { const [r, c] = F.dims(a); return F.at(a, r === 1 ? 0 : i, c === 1 ? 0 : j); };
  const branch = (nodes, i, ev, dflt) => { const n = nodes[i]; if (!n) return dflt; if (n.t === 'missing') return 0; return ev(n); };

  reg('IF', 2, 3, (nodes, ev) => {
    const t = ev(nodes[0]); if (isErr(t)) return t;
    if (!isMulti(t)) { const b = toBool(scalar(t)); if (isErr(b)) return b; return b ? branch(nodes, 1, ev, true) : branch(nodes, 2, ev, false); }
    const arr = F.toArr2(t); const v1 = branch(nodes, 1, ev, true), v2 = branch(nodes, 2, ev, false); if (isErr(v1) && !isMulti(v1) && false) return v1;
    return arr.map((row, i) => row.map((c, j) => { if (isErr(c)) return c; const b = toBool(c); if (isErr(b)) return b; const s = b ? v1 : v2; return isMulti(s) ? atB(s, i, j) : scalar(s); }));
  }, 'IF(logical_test, [value_if_true], [value_if_false])', 'Returns one value if a condition is TRUE and another if it is FALSE.', { lazy: true });
  reg('IFS', 2, 254, (nodes, ev) => {
    if (nodes.length % 2) return E.VALUE;
    for (let i = 0; i < nodes.length; i += 2) { const c = ev(nodes[i]); if (isErr(c)) return c; const b = toBool(scalar(c)); if (isErr(b)) return b; if (b) return ev(nodes[i + 1]); }
    return E.NA;
  }, 'IFS(logical_test1, value_if_true1, [logical_test2, value_if_true2], …)', 'Checks several conditions and returns the value of the first TRUE one.', { lazy: true });
  reg('SWITCH', 3, 254, (nodes, ev) => {
    const x = scalar(ev(nodes[0])); if (isErr(x)) return x; const n = nodes.length;
    for (let i = 1; i + 1 < n; i += 2) { const v = scalar(ev(nodes[i])); if (isErr(v)) return v; if (F.eq(x, v)) return ev(nodes[i + 1]); }
    return (n - 1) % 2 === 1 ? ev(nodes[n - 1]) : E.NA;
  }, 'SWITCH(expression, value1, result1, [default_or_value2, result2], …)', 'Compares an expression to a list of values and returns the matching result.', { lazy: true });

  const bools = (args) => {
    const out = [];
    for (const a of args) {
      if (a instanceof Range || Array.isArray(a)) { for (const v of F.flat(a)) { if (isErr(v)) return v; if (typeof v === 'boolean') out.push(v); else if (typeof v === 'number') out.push(v !== 0); } }
      else if (isErr(a)) return a; else if (typeof a === 'boolean') out.push(a); else if (typeof a === 'number') out.push(a !== 0); else if (a == null) out.push(false);
      else if (typeof a === 'string') { const u = a.toUpperCase(); if (u === 'TRUE') out.push(true); else if (u === 'FALSE') out.push(false); else return E.VALUE; }
    }
    return out.length ? out : E.VALUE;
  };
  reg('AND', 1, 255, (...a) => { const b = bools(a); return isErr(b) ? b : b.every(Boolean); }, 'AND(logical1, [logical2], …)', 'TRUE if all arguments are TRUE.', { errs: true });
  reg('OR', 1, 255, (...a) => { const b = bools(a); return isErr(b) ? b : b.some(Boolean); }, 'OR(logical1, [logical2], …)', 'TRUE if any argument is TRUE.', { errs: true });
  reg('XOR', 1, 255, (...a) => { const b = bools(a); return isErr(b) ? b : b.filter(Boolean).length % 2 === 1; }, 'XOR(logical1, [logical2], …)', 'TRUE if an odd number of arguments are TRUE.', { errs: true });
  reg('NOT', 1, 1, (v) => { const b = toBool(v); return isErr(b) ? b : !b; }, 'NOT(logical)', 'Reverses TRUE and FALSE.', { lift: true });
  reg('TRUE', 0, 0, () => true, 'TRUE()', 'Returns the logical value TRUE.');
  reg('FALSE', 0, 0, () => false, 'FALSE()', 'Returns the logical value FALSE.');

  const errFn = (pred) => (nodes, ev) => {
    const v = ev(nodes[0]); const alt = () => branch(nodes, 1, ev, 0);
    if (v instanceof Range && v.isSingle()) { return pred(v.get(0, 0)) ? alt() : v; }
    if (isMulti(v)) { const arr = F.toArr2(v); let a; return arr.map((row, i) => row.map((x, j) => { if (!pred(x)) return x; if (a === undefined) a = alt(); return isMulti(a) ? atB(a, i, j) : scalar(a); })); }
    return pred(scalar(v)) ? alt() : v;
  };
  reg('IFERROR', 2, 2, errFn(isErr), 'IFERROR(value, value_if_error)', 'Returns a fallback value if the first value is an error.', { lazy: true });
  reg('IFNA', 2, 2, errFn((x) => isErr(x) && x.code === '#N/A'), 'IFNA(value, value_if_na)', 'Returns a fallback value if the first value is #N/A.', { lazy: true });
  reg('CHOOSE', 2, 255, (nodes, ev) => {
    const idx = ev(nodes[0]); if (isErr(idx)) return idx; const n = nodes.length - 1;
    if (!isMulti(idx)) { const k = toNum(scalar(idx)); if (isErr(k)) return k; const i = Math.trunc(k); if (i < 1 || i > n) return E.VALUE; return branch(nodes, i, ev, 0); }
    const vals = nodes.slice(1).map((x, i) => branch(nodes, i + 1, ev, 0));
    return F.toArr2(idx).map((row, i) => row.map((c, j) => { const k = toNum(c); if (isErr(k)) return k; const m = Math.trunc(k); if (m < 1 || m > n) return E.VALUE; const s = vals[m - 1]; return isMulti(s) ? atB(s, i, j) : scalar(s); }));
  }, 'CHOOSE(index_num, value1, [value2], …)', 'Returns the value at a given position in a list.', { lazy: true });
  reg('ISOMITTED', 1, 1, (nodes, ev, ctx) => {
    const n = nodes[0]; if (!n || n.t !== 'name') return false; const key = n.name.toUpperCase();
    for (let s = ctx.vars; s; s = s.parent) if (s.map.has(key)) return s.map.get(key) === undefined; return false;
  }, 'ISOMITTED(argument)', 'TRUE if a LAMBDA argument was omitted.', { lazy: true });

  // ---- LAMBDA helpers
  function lambdaOf(node, ev) {
    const f = ev(node); if (f && f.lambda) return f;
    if (node.t === 'name' && ZN.fn.has(node.name)) return { lambda: true, native: node.name.toUpperCase() };
    return null;
  }
  function callF(f, args, ctx) {
    if (f.native) { const params = args.map((_, i) => 'P' + i); return FM.callLambda({ lambda: true, params, body: { t: 'call', name: f.native, args: params.map((p) => ({ t: 'name', name: p })) }, scope: null }, args, ctx); }
    return FM.callLambda(f, args, ctx);
  }
  const cellVal = (v) => (v instanceof Range ? (v.isSingle() ? v.get(0, 0) : E.CALC) : Array.isArray(v) ? (v.length === 1 && v[0].length === 1 ? v[0][0] : E.CALC) : v && v.lambda ? E.CALC : v === undefined ? null : v);
  const plain = (v) => (v instanceof Range ? (v.isSingle() ? v.get(0, 0) : v.toArray()) : v);
  const arrOf = (node, ev) => { const v = ev(node); if (isErr(v)) return v; return F.toArr2(v); };
  const first = (arr) => arr.find((x) => isErr(x));

  reg('MAP', 2, 254, (nodes, ev, ctx) => {
    const f = lambdaOf(nodes[nodes.length - 1], ev); if (!f) return E.VALUE; const arrs = [];
    for (const n of nodes.slice(0, -1)) { const a = arrOf(n, ev); if (isErr(a)) return a; arrs.push(a); }
    const R = arrs[0].length, C = arrs[0][0].length; if (arrs.some((a) => a.length !== R || a[0].length !== C)) return E.VALUE;
    const out = []; for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(cellVal(callF(f, arrs.map((a) => a[i][j]), ctx))); out.push(row); } return out;
  }, 'MAP(array1, [array2, …], lambda)', 'Applies a LAMBDA to each element and returns an array of results.', { lazy: true });
  const reduceImpl = (scan) => (nodes, ev, ctx) => {
    const f = lambdaOf(nodes[nodes.length - 1], ev); if (!f) return E.VALUE; const hasInit = nodes.length === 3;
    let acc; if (hasInit) { acc = plain(ev(nodes[0])); if (isErr(acc)) return acc; }
    const arr = arrOf(nodes[hasInit ? 1 : 0], ev); if (isErr(arr)) return arr; const flat = []; for (const row of arr) for (const x of row) flat.push(x);
    let start = 0; if (!hasInit) { if (!flat.length) return E.CALC; acc = flat[0]; start = 1; }
    const trail = scan ? [] : null; if (scan && !hasInit) trail.push(acc);
    for (let k = start; k < flat.length; k++) { acc = plain(callF(f, [acc, flat[k]], ctx)); if (scan) trail.push(cellVal(acc)); }
    if (!scan) return acc;
    const C = arr[0].length; const out = []; for (let i = 0; i < arr.length; i++) out.push(trail.slice(i * C, (i + 1) * C)); return out;
  };
  reg('REDUCE', 2, 3, reduceImpl(false), 'REDUCE([initial_value], array, lambda)', 'Reduces an array to a single value by applying a LAMBDA accumulator.', { lazy: true });
  reg('SCAN', 2, 3, reduceImpl(true), 'SCAN([initial_value], array, lambda)', 'Scans an array applying a LAMBDA accumulator and returns every step.', { lazy: true });
  reg('BYROW', 2, 2, (nodes, ev, ctx) => {
    const arr = arrOf(nodes[0], ev); if (isErr(arr)) return arr; const f = lambdaOf(nodes[1], ev); if (!f) return E.VALUE;
    return arr.map((row) => [cellVal(callF(f, [[row.slice()]], ctx))]);
  }, 'BYROW(array, lambda)', 'Applies a LAMBDA to each row and returns a column of results.', { lazy: true });
  reg('BYCOL', 2, 2, (nodes, ev, ctx) => {
    const arr = arrOf(nodes[0], ev); if (isErr(arr)) return arr; const f = lambdaOf(nodes[1], ev); if (!f) return E.VALUE; const out = [];
    for (let j = 0; j < arr[0].length; j++) out.push(cellVal(callF(f, [arr.map((r) => [r[j]])], ctx))); return [out];
  }, 'BYCOL(array, lambda)', 'Applies a LAMBDA to each column and returns a row of results.', { lazy: true });
  reg('MAKEARRAY', 3, 3, (nodes, ev, ctx) => {
    const r = toNum(scalar(ev(nodes[0]))), c = toNum(scalar(ev(nodes[1]))); if (isErr(r)) return r; if (isErr(c)) return c; const R = Math.trunc(r), C = Math.trunc(c);
    if (R < 1 || C < 1) return E.VALUE; if (R * C > 1000000) return E.NUM; const f = lambdaOf(nodes[2], ev); if (!f) return E.VALUE;
    const out = []; for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(cellVal(callF(f, [i + 1, j + 1], ctx))); out.push(row); } return out;
  }, 'MAKEARRAY(rows, columns, lambda)', 'Builds an array by applying a LAMBDA to each row and column index.', { lazy: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
