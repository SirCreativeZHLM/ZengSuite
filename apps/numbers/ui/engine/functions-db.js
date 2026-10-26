/* ZengGrid: conditional aggregation (SUMIF family), SUBTOTAL, AGGREGATE and database (D*) functions. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, Range } = ZN; const F = ZN.F;
  const { isErr, toInt, toNum, toStr, scalar } = F;
  const D = (names, min, max, cat, hint, desc, impl, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat, hint, desc }, opts));
  const isMulti = (v) => (v instanceof Range ? !v.isSingle() : Array.isArray(v) && !(v.length === 1 && v[0].length === 1));
  const rangeLike = (v) => v instanceof Range || Array.isArray(v);

  // reader source over a Range / array: col(j) -> (i) => value
  const src = (v) => {
    if (v instanceof Range) {
      const sh = v.sheet, off = v.r1;
      return { R: v.clampedRows(), RR: v.rows, C: v.cols, col(j) { const a = sh && sh.cols[v.c1 + j]; return a ? (i) => { const x = a[off + i]; return x === undefined || x.v === undefined ? null : x.v; } : () => null; } };
    }
    return { R: v.length, RR: v.length, C: v[0].length, col(j) { return (i) => { const x = v[i][j]; return x === undefined ? null : x; }; } };
  };

  // ---------- SUMIF family ----------
  function scan(ranges, preds, val, onMatch) {
    const r0 = ranges[0]; let L = r0.R; for (const r of ranges) L = Math.max(L, r.R); if (val) L = Math.max(L, val.R); L = Math.min(L, r0.RR);
    let count = 0; const C = r0.C;
    for (let j = 0; j < C; j++) {
      const rd = ranges.map((r) => r.col(j)); const vr = val && j < val.C ? val.col(j) : null; const n = ranges.length;
      for (let i = 0; i < L; i++) {
        let ok = true; for (let k = 0; k < n; k++) if (!preds[k](rd[k](i))) { ok = false; break; }
        if (ok) { count++; if (onMatch) { const e = onMatch(vr ? vr(i) : null); if (e) return e; } }
      }
    }
    const tail = r0.RR - L; if (tail > 0 && preds.every((p) => p(null))) count += tail * C;
    return count;
  }
  function evalOnce(kind, ranges, preds, val) {
    let sum = 0, n = 0, best;
    const onMatch = kind === 'count' ? null : (v) => {
      if (isErr(v)) return v; if (typeof v !== 'number') return null;
      n++; sum += v; if (best === undefined) best = v; else if (kind === 'max' ? v > best : v < best) best = v; return null;
    };
    const c = scan(ranges, preds, kind === 'count' ? null : val, onMatch); if (isErr(c)) return c;
    switch (kind) { case 'count': return c; case 'sum': return sum; case 'avg': return n ? sum / n : E.DIV0; default: return best === undefined ? 0 : best; }
  }
  function ifs(kind, valArg, pairs) {
    for (const p of pairs) { if (isErr(p[0])) return p[0]; if (!rangeLike(p[0])) return E.VALUE; }
    if (valArg !== undefined) { if (isErr(valArg)) return valArg; if (!rangeLike(valArg)) return E.VALUE; }
    const ranges = pairs.map((p) => src(p[0])); const val = valArg === undefined ? (kind === 'count' ? null : ranges[0]) : src(valArg);
    if (pairs.length > 1 || (valArg !== undefined && kind !== 'sum' && kind !== 'avg')) for (const r of ranges) if (r.RR !== ranges[0].RR || r.C !== ranges[0].C) return E.VALUE;
    if (val && valArg !== undefined && (kind === 'max' || kind === 'min' || pairs.length > 1) && (val.RR !== ranges[0].RR || val.C !== ranges[0].C)) return E.VALUE;
    let R = 1, C = 1, multi = false;
    for (const p of pairs) if (isMulti(p[1])) { const g = p[1] instanceof Range ? [p[1].rows, p[1].cols] : [p[1].length, p[1][0].length]; R = Math.max(R, g[0]); C = Math.max(C, g[1]); multi = true; }
    const pick = (c, i, j) => { if (!isMulti(c)) return scalar(c); const g = c instanceof Range ? c.toArray() : c; return g[g.length === 1 ? 0 : i][g[0].length === 1 ? 0 : j]; };
    const cache = pairs.map((p) => (isMulti(p[1]) && p[1] instanceof Range ? p[1].toArray() : p[1]));
    if (!multi) return evalOnce(kind, ranges, pairs.map((p) => F.criteria(scalar(p[1]))), val);
    const out = [];
    for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(evalOnce(kind, ranges, cache.map((c) => F.criteria(pick(c, i, j))), val)); out.push(row); }
    return out;
  }
  const O = { errs: true };
  const MT = 'Math & Trig', ST = 'Statistical';
  D('COUNTIF', 2, 2, ST, 'COUNTIF(range, criteria)', 'Counts the number of cells within a range that meet the given condition.', (r, c) => ifs('count', undefined, [[r, c]]), O);
  D('SUMIF', 2, 3, MT, 'SUMIF(range, criteria, [sum_range])', 'Adds the cells specified by a given criteria.', (r, c, s) => ifs('sum', s, [[r, c]]), O);
  D('AVERAGEIF', 2, 3, ST, 'AVERAGEIF(range, criteria, [average_range])', 'Returns the average of the cells that meet a given criteria.', (r, c, s) => ifs('avg', s, [[r, c]]), O);
  const multi = (kind, hasVal) => (...a) => {
    const v = hasVal ? a.shift() : undefined; if (a.length % 2) return E.VALUE; const pairs = []; for (let i = 0; i < a.length; i += 2) pairs.push([a[i], a[i + 1]]);
    if (hasVal && v === undefined) return E.VALUE; return ifs(kind, v, pairs);
  };
  D('COUNTIFS', 2, 254, ST, 'COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], …)', 'Counts the number of cells that meet all of the given conditions.', multi('count', false), O);
  D('SUMIFS', 3, 255, MT, 'SUMIFS(sum_range, criteria_range1, criteria1, …)', 'Adds the cells that meet multiple criteria.', multi('sum', true), O);
  D('AVERAGEIFS', 3, 255, ST, 'AVERAGEIFS(average_range, criteria_range1, criteria1, …)', 'Returns the average of the cells that meet multiple criteria.', multi('avg', true), O);
  D('MAXIFS', 3, 255, ST, 'MAXIFS(max_range, criteria_range1, criteria1, …)', 'Returns the maximum value among cells specified by a given set of conditions.', multi('max', true), O);
  D('MINIFS', 3, 255, ST, 'MINIFS(min_range, criteria_range1, criteria1, …)', 'Returns the minimum value among cells specified by a given set of conditions.', multi('min', true), O);
  D('COUNTBLANK', 1, 1, ST, 'COUNTBLANK(range)', 'Counts the number of empty cells in a range.', (r) => {
    if (!rangeLike(r)) return r == null || r === '' ? 1 : 0;
    const g = src(r); let non = 0; for (let j = 0; j < g.C; j++) { const rd = g.col(j); for (let i = 0; i < g.R; i++) { const v = rd(i); if (v != null && v !== '') non++; } }
    return g.RR * g.C - non;
  });

  // ---------- statistics helpers ----------
  const variance = (a, sample) => { const n = a.length; if (sample ? n < 2 : n < 1) return E.DIV0; const m = a.reduce((x, y) => x + y, 0) / n; return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (sample ? n - 1 : n); };
  const sorted = (a) => a.slice().sort((x, y) => x - y);
  const interp = (s, pos) => { const lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
  // vals: all non-empty values (numbers/strings/bools/errors), already filtered for errors where needed
  function apply(code, vals) {
    const nums = vals.filter((v) => typeof v === 'number');
    if (code !== 'count' && code !== 'counta') { const e = vals.find(isErr); if (e) return e; }
    switch (code) {
      case 'count': return nums.length;
      case 'counta': return vals.length;
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0;
      case 'max': return nums.length ? nums.reduce((a, b) => (b > a ? b : a)) : 0;
      case 'min': return nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : 0;
      case 'prod': return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
      case 'stdev': { const v = variance(nums, true); return isErr(v) ? v : Math.sqrt(v); }
      case 'stdevp': { const v = variance(nums, false); return isErr(v) ? v : Math.sqrt(v); }
      case 'var': return variance(nums, true);
      case 'varp': return variance(nums, false);
      case 'median': { if (!nums.length) return E.NUM; const s = sorted(nums), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
      case 'mode': { const cnt = new Map(); let best, bc = 1; for (const x of nums) { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); } for (const x of nums) if (cnt.get(x) > bc) { bc = cnt.get(x); best = x; } return best === undefined ? E.NA : best; }
    }
    return E.VALUE;
  }
  const NESTED = /^\s*(SUBTOTAL|AGGREGATE)\s*\(/i;
  // gather values from args. o: {nested, hidden, errors}
  function gather(args, o) {
    const out = [];
    for (const a of args) {
      if (a instanceof Range) {
        const sh = a.sheet; const ce = Math.min(a.c2, sh.cols.length - 1);
        for (let c = a.c1; c <= ce; c++) { const col = sh.cols[c]; if (!col) continue; const re = Math.min(a.r2, col.length - 1);
          for (let r = a.r1; r <= re; r++) { const x = col[r]; if (x === undefined || x.v === undefined || x.v === null) continue;
            if (o.nested && x.f !== undefined && NESTED.test(x.f)) continue; if (o.hidden && sh.hiddenRows[r]) continue; if (o.errors && isErr(x.v)) continue; out.push(x.v); } }
      } else if (Array.isArray(a)) { for (const row of a) for (const v of row) if (v != null && !(o.errors && isErr(v))) out.push(v); }
      else if (a != null && !(o.errors && isErr(a))) out.push(a);
    }
    return out;
  }
  const SUBT = ['avg', 'count', 'counta', 'max', 'min', 'prod', 'stdev', 'stdevp', 'sum', 'var', 'varp'];
  D('SUBTOTAL', 2, 255, MT, 'SUBTOTAL(function_num, ref1, [ref2], …)', 'Returns a subtotal in a list or database (1-11 include, 101-111 ignore hidden rows).', (fn, ...refs) => {
    const n = toInt(scalar(fn)); if (isErr(n)) return n;
    const hid = n >= 101 && n <= 111, k = hid ? n - 101 : n - 1; if (k < 0 || k > 10) return E.VALUE;
    return apply(SUBT[k], gather(refs, { nested: true, hidden: hid, errors: false }));
  }, { errs: true });
  const AGG = ['avg', 'count', 'counta', 'max', 'min', 'prod', 'stdev', 'stdevp', 'sum', 'var', 'varp', 'median', 'mode'];
  D('AGGREGATE', 3, 255, MT, 'AGGREGATE(function_num, options, ref1, [ref2], …)', 'Returns an aggregate in a list or database, optionally ignoring hidden rows and errors.', (fn, opt, ...refs) => {
    const f = toInt(scalar(fn)), op = toInt(scalar(opt)); if (isErr(f)) return f; if (isErr(op)) return op;
    if (f < 1 || f > 19 || op < 0 || op > 7) return E.VALUE;
    const o = { nested: op <= 3, hidden: [1, 3, 5, 7].includes(op), errors: [2, 3, 6, 7].includes(op) };
    if (f <= 13) return apply(AGG[f - 1], gather(refs, o));
    if (refs.length < 2) return E.VALUE;
    const kk = scalar(refs[1]); if (isErr(kk)) return kk; const k = toNum(kk); if (isErr(k)) return k;
    const vals = gather([refs[0]], o); const e = vals.find(isErr); if (e) return e;
    const s = sorted(vals.filter((v) => typeof v === 'number')), n = s.length;
    if (f === 14 || f === 15) { const q = Math.ceil(k); if (q < 1 || q > n) return E.NUM; return f === 14 ? s[n - q] : s[q - 1]; }
    if (!n) return E.NUM;
    let p = k;
    if (f === 17 || f === 19) { p = Math.trunc(k); if (p < (f === 17 ? 0 : 1) || p > (f === 17 ? 4 : 3)) return E.NUM; p /= 4; }
    if (f === 16 || f === 17) { if (p < 0 || p > 1) return E.NUM; return interp(s, p * (n - 1)); }
    if (p < 1 / (n + 1) || p > n / (n + 1)) return E.NUM; return interp(s, p * (n + 1) - 1);
  }, { errs: true });

  // ---------- database functions ----------
  function dbSelect(db, field, crit, needField) {
    if (isErr(db)) return db; if (isErr(crit)) return crit; if (!rangeLike(db) || !rangeLike(crit)) return E.VALUE;
    const Dg = db instanceof Range ? db.toArray() : db, Cg = crit instanceof Range ? crit.toArray() : crit;
    if (Dg.length < 1 || Cg.length < 1) return E.VALUE;
    const heads = Dg[0].map((h) => toStr(h == null ? '' : h)).map((h) => (typeof h === 'string' ? h.toLowerCase() : ''));
    let fi = -1;
    field = scalar(field);
    if (field === undefined) { if (needField) return E.VALUE; }
    else if (isErr(field)) return field;
    else if (typeof field === 'number') { fi = Math.trunc(field) - 1; if (fi < 0 || fi >= heads.length) return E.VALUE; }
    else if (typeof field === 'string') { fi = heads.indexOf(field.toLowerCase()); if (fi < 0) return E.VALUE; }
    else return E.VALUE;
    const dbPred = (cell) => {
      if (typeof cell === 'string' && !/^(<=|>=|<>|<|>|=)/.test(cell) && !F.NUMRE.test(cell.trim())) { const re = F.wildRe(cell + '*'); return (v) => typeof v === 'string' && re.test(v); }
      return F.criteria(cell);
    };
    const rows = Cg.slice(1).map((row) => {
      const conds = [];
      row.forEach((cell, j) => {
        if (cell == null || cell === '') return; const h = Cg[0][j] == null ? '' : toStr(Cg[0][j]); const ci = typeof h === 'string' ? heads.indexOf(h.toLowerCase()) : -1;
        if (ci >= 0) conds.push([ci, dbPred(cell)]); else if (typeof cell === 'boolean') conds.push([-1, () => cell]); else conds.push([-1, () => false]);
      });
      return conds;
    });
    const recs = [];
    for (let i = 1; i < Dg.length; i++) { const rec = Dg[i]; if (!rows.length || rows.some((cs) => cs.every(([ci, p]) => (ci < 0 ? p() : p(rec[ci] === undefined ? null : rec[ci]))))) recs.push(rec); }
    return { recs, fi };
  }
  const dbfn = (code, needField) => (db, field, crit) => {
    const s = dbSelect(db, field, crit, needField); if (isErr(s)) return s;
    if (code === 'get') { if (!s.recs.length) return E.VALUE; if (s.recs.length > 1) return E.NUM; const v = s.recs[0][s.fi]; return v == null ? 0 : v; }
    if (s.fi < 0) return s.recs.length; // DCOUNT / DCOUNTA without field
    const vals = s.recs.map((r) => r[s.fi]).filter((v) => v != null && (code === 'counta' || code === 'count' || true));
    if (code === 'counta') return vals.length; if (code === 'count') return vals.filter((v) => typeof v === 'number').length;
    return apply(code, vals.filter((v) => typeof v === 'number'));
  };
  const DBS = [['DSUM', 'sum', 'Adds the numbers in the field column of records that match the criteria.'], ['DCOUNT', 'count', 'Counts the cells containing numbers in matching records.'], ['DCOUNTA', 'counta', 'Counts nonblank cells in matching records.'], ['DAVERAGE', 'avg', 'Averages the values in matching records.'], ['DMAX', 'max', 'Returns the maximum value from matching records.'], ['DMIN', 'min', 'Returns the minimum value from matching records.'], ['DPRODUCT', 'prod', 'Multiplies the values in matching records.'], ['DSTDEV', 'stdev', 'Estimates the standard deviation based on a sample of matching records.'], ['DSTDEVP', 'stdevp', 'Calculates the standard deviation based on the entire population of matching records.'], ['DVAR', 'var', 'Estimates variance based on a sample of matching records.'], ['DVARP', 'varp', 'Calculates variance based on the entire population of matching records.'], ['DGET', 'get', 'Extracts a single value from the database that matches the criteria.']];
  for (const [name, code, desc] of DBS) D(name, 3, 3, 'Database', name + '(database, field, criteria)', desc, dbfn(code, code !== 'count' && code !== 'counta'), { errs: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
