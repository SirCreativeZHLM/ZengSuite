/* ZengGrid functions: Statistical (descriptive, regression, probability distributions, hypothesis tests). Uses ZN.math from functions-math.js. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, Range } = ZN; const F = ZN.F; const { isErr, toNum } = F; const M = ZN.math;
  const CAT = 'Statistical';
  const R = (n, s, f, p, d, x) => ZN.reg(n, s, f, p, d, CAT, x);
  const D = (names, min, max, impl, params, desc, extra) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: CAT, hint: [].concat(names)[0] + '(' + params + ')', desc }, extra));
  const sortN = (a) => a.slice().sort((x, y) => x - y);
  const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const mean = (a) => sum(a) / a.length;
  const ss = (a, m) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s; };

  // numbers for the "A" functions: text in ranges = 0, TRUE = 1, FALSE = 0
  function numsA(args) {
    const out = [];
    const take = (v, direct) => {
      if (isErr(v)) return v; if (typeof v === 'number') out.push(v); else if (typeof v === 'boolean') out.push(v ? 1 : 0);
      else if (typeof v === 'string') { if (direct) { const n = toNum(v); if (isErr(n)) return n; out.push(n); } else out.push(0); }
    };
    for (const a of args) {
      if (a instanceof Range) { let err; a.each((v) => { if (!err) err = take(v, false); }); if (err) return err; }
      else if (Array.isArray(a)) { for (const row of a) for (const v of row) { const e = take(v, false); if (e) return e; } }
      else if (a !== undefined && a !== null) { const e = take(a, true); if (e) return e; }
    }
    return out;
  }
  const withNums = (A, f) => (...args) => { const v = A ? numsA(args) : F.nums(args); return isErr(v) ? v : f(v); };
  const family = (names, A, f, desc) => D(names, 1, 255, withNums(A, f), 'value1, [value2], …', desc);

  // ---------- descriptive ----------
  const avg = (v) => (v.length ? mean(v) : E.DIV0);
  family('AVERAGE', false, avg, 'Returns the average of its arguments');
  family('AVERAGEA', true, avg, 'Returns the average of its arguments, including numbers, text and logical values');
  const mx = (v) => { let m = -Infinity; for (let i = 0; i < v.length; i++) if (v[i] > m) m = v[i]; return v.length ? m : 0; };
  const mn = (v) => { let m = Infinity; for (let i = 0; i < v.length; i++) if (v[i] < m) m = v[i]; return v.length ? m : 0; };
  family('MAX', false, mx, 'Returns the maximum value in a list of arguments'); family('MAXA', true, mx, 'Returns the maximum value in a list of arguments, including numbers, text and logical values');
  family('MIN', false, mn, 'Returns the minimum value in a list of arguments'); family('MINA', true, mn, 'Returns the minimum value in a list of arguments, including numbers, text and logical values');
  family('MEDIAN', false, (v) => { if (!v.length) return E.NUM; const s = sortN(v), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }, 'Returns the median of the given numbers');
  const varS = (v) => (v.length < 2 ? E.DIV0 : ss(v, mean(v)) / (v.length - 1)), varP = (v) => (v.length < 1 ? E.DIV0 : ss(v, mean(v)) / v.length);
  const sq = (f) => (v) => { const r = f(v); return isErr(r) ? r : Math.sqrt(r); };
  family(['VAR.S', 'VAR'], false, varS, 'Estimates variance based on a sample'); family('VARA', true, varS, 'Estimates variance based on a sample, including numbers, text and logical values');
  family(['VAR.P', 'VARP'], false, varP, 'Calculates variance based on the entire population'); family('VARPA', true, varP, 'Calculates variance based on the entire population, including numbers, text and logical values');
  family(['STDEV.S', 'STDEV'], false, sq(varS), 'Estimates standard deviation based on a sample'); family('STDEVA', true, sq(varS), 'Estimates standard deviation based on a sample, including numbers, text and logical values');
  family(['STDEV.P', 'STDEVP'], false, sq(varP), 'Calculates standard deviation based on the entire population'); family('STDEVPA', true, sq(varP), 'Calculates standard deviation based on the entire population, including numbers, text and logical values');
  family('AVEDEV', false, (v) => { if (!v.length) return E.NUM; const m = mean(v); let s = 0; for (const x of v) s += Math.abs(x - m); return s / v.length; }, 'Returns the average of the absolute deviations of data points from their mean');
  family('DEVSQ', false, (v) => (v.length ? ss(v, mean(v)) : E.NUM), 'Returns the sum of squares of deviations');
  family('GEOMEAN', false, (v) => { if (!v.length) return E.NUM; let l = 0; for (const x of v) { if (x <= 0) return E.NUM; l += Math.log(x); } return Math.exp(l / v.length); }, 'Returns the geometric mean');
  family('HARMEAN', false, (v) => { if (!v.length) return E.NUM; let s = 0; for (const x of v) { if (x <= 0) return E.NUM; s += 1 / x; } return v.length / s; }, 'Returns the harmonic mean');
  family('KURT', false, (v) => { const n = v.length; if (n < 4) return E.DIV0; const m = mean(v), sd = Math.sqrt(ss(v, m) / (n - 1)); if (sd === 0) return E.DIV0; let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 4); return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * s - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3)); }, 'Returns the kurtosis of a data set');
  family('SKEW', false, (v) => { const n = v.length; if (n < 3) return E.DIV0; const m = mean(v), sd = Math.sqrt(ss(v, m) / (n - 1)); if (sd === 0) return E.DIV0; let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 3); return n / ((n - 1) * (n - 2)) * s; }, 'Returns the skewness of a distribution');
  family('SKEW.P', false, (v) => { const n = v.length; if (n < 1) return E.DIV0; const m = mean(v), sd = Math.sqrt(ss(v, m) / n); if (sd === 0) return E.DIV0; let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 3); return s / n; }, 'Returns the skewness of a distribution based on a population');
  family(['MODE.SNGL', 'MODE'], false, (v) => { const c = new Map(); let best = 1, bv; for (const x of v) { const k = (c.get(x) || 0) + 1; c.set(x, k); if (k > best) { best = k; bv = x; } } return best < 2 ? E.NA : bv; }, 'Returns the most common value in a data set');
  D('MODE.MULT', 1, 255, withNums(false, (v) => { const c = new Map(); let best = 1; for (const x of v) { const k = (c.get(x) || 0) + 1; c.set(x, k); if (k > best) best = k; } if (best < 2) return E.NA; const out = []; for (const [x, k] of c) if (k === best) out.push([x]); return out; }), 'number1, [number2], …', 'Returns a vertical array of the most frequently occurring values');

  D('COUNT', 1, 255, (...args) => {
    let c = 0;
    for (const a of args) {
      if (a instanceof Range) a.each((v) => { if (typeof v === 'number') c++; });
      else if (Array.isArray(a)) { for (const row of a) for (const v of row) if (typeof v === 'number') c++; }
      else if (typeof a === 'number' || typeof a === 'boolean') c++; else if (typeof a === 'string' && !isErr(toNum(a)) && a.trim() !== '') c++;
    }
    return c;
  }, 'value1, [value2], …', 'Counts how many numbers are in the list of arguments', { errs: true });
  D('COUNTA', 1, 255, (...args) => {
    let c = 0;
    for (const a of args) {
      if (a instanceof Range) a.each((v) => { if (v !== null && v !== undefined) c++; });
      else if (Array.isArray(a)) { for (const row of a) for (const v of row) if (v != null) c++; }
      else if (a !== undefined) c++;
    }
    return c;
  }, 'value1, [value2], …', 'Counts how many values are in the list of arguments', { errs: true });
  D('COUNTBLANK', 1, 1, (a) => {
    if (a instanceof Range) { let nb = 0; a.each((v) => { if (v !== null && v !== undefined && v !== '') nb++; }); return a.rows * a.cols - nb; }
    if (Array.isArray(a)) { let c = 0; for (const row of a) for (const v of row) if (v == null || v === '') c++; return c; }
    return a == null || a === '' ? 1 : 0;
  }, 'range', 'Counts the number of empty cells in a specified range of cells', { errs: true });

  // ---------- order statistics ----------
  const one = (a) => F.nums([a]);
  R('LARGE', 'xn', (a, k) => { const v = one(a); if (isErr(v)) return v; k = Math.ceil(k); if (k < 1 || k > v.length) return E.NUM; return sortN(v)[v.length - k]; }, 'array, k', 'Returns the k-th largest value in a data set');
  R('SMALL', 'xn', (a, k) => { const v = one(a); if (isErr(v)) return v; k = Math.ceil(k); if (k < 1 || k > v.length) return E.NUM; return sortN(v)[k - 1]; }, 'array, k', 'Returns the k-th smallest value in a data set');
  const rankFn = (avgMode) => (x, ref, order) => {
    const v = one(ref); if (isErr(v)) return v; const asc = order !== undefined && toNum(order) !== 0; let gt = 0, eq = 0;
    for (const y of v) { if (y === x) eq++; else if (asc ? y < x : y > x) gt++; }
    if (!eq) return E.NA; return avgMode ? gt + 1 + (eq - 1) / 2 : gt + 1;
  };
  R(['RANK', 'RANK.EQ'], 'nxX', rankFn(false), 'number, ref, [order]', 'Returns the rank of a number in a list of numbers');
  R('RANK.AVG', 'nxX', rankFn(true), 'number, ref, [order]', 'Returns the rank of a number in a list of numbers, averaging ties');
  function interp(s, pos) { const lo = Math.floor(pos), f = pos - lo; return f === 0 || lo + 1 >= s.length ? s[lo] : s[lo] + f * (s[lo + 1] - s[lo]); }
  const pInc = (a, k) => { const v = one(a); if (isErr(v)) return v; if (!v.length || k < 0 || k > 1) return E.NUM; return interp(sortN(v), (v.length - 1) * k); };
  const pExc = (a, k) => { const v = one(a); if (isErr(v)) return v; const n = v.length; const pos = k * (n + 1); if (!n || pos < 1 || pos > n) return E.NUM; return interp(sortN(v), pos - 1); };
  R(['PERCENTILE.INC', 'PERCENTILE'], 'xn', pInc, 'array, k', 'Returns the k-th percentile of values in a range, inclusive');
  R('PERCENTILE.EXC', 'xn', pExc, 'array, k', 'Returns the k-th percentile of values in a range, exclusive');
  R(['QUARTILE.INC', 'QUARTILE'], 'xi', (a, q) => (q < 0 || q > 4 ? E.NUM : pInc(a, q / 4)), 'array, quart', 'Returns the quartile of a data set, inclusive');
  R('QUARTILE.EXC', 'xi', (a, q) => (q < 1 || q > 3 ? E.NUM : pExc(a, q / 4)), 'array, quart', 'Returns the quartile of a data set, exclusive');
  const prank = (exc) => (a, x, sig) => {
    const v = one(a); if (isErr(v)) return v; const n = v.length; if (!n) return E.NUM; sig = sig === undefined ? 3 : Math.trunc(sig); if (sig < 1) return E.NUM;
    const s = sortN(v); if (x < s[0] || x > s[n - 1]) return E.NA; let lt = 0; while (lt < n && s[lt] < x) lt++;
    const den = exc ? n + 1 : n - 1, off = exc ? 1 : 0; let r;
    if (n === 1 && !exc) r = 1; else if (s[lt] === x) r = (lt + off) / den; else r = (lt - 1 + off) / den + (x - s[lt - 1]) / (s[lt] - s[lt - 1]) / den;
    const p = Math.pow(10, sig); return Math.floor(r * p + 1e-9) / p;
  };
  R(['PERCENTRANK.INC', 'PERCENTRANK'], 'xnI', prank(false), 'array, x, [significance]', 'Returns the percentage rank of a value in a data set, inclusive');
  R('PERCENTRANK.EXC', 'xnI', prank(true), 'array, x, [significance]', 'Returns the percentage rank of a value in a data set, exclusive');
  R('TRIMMEAN', 'xn', (a, p) => { const v = one(a); if (isErr(v)) return v; if (p < 0 || p >= 1 || !v.length) return E.NUM; const k = Math.floor(v.length * p / 2); const s = sortN(v).slice(k, v.length - k); return mean(s); }, 'array, percent', 'Returns the mean of the interior of a data set');
  R('FREQUENCY', 'xx', (d, b) => {
    const dv = one(d), bv = one(b); if (isErr(dv)) return dv; if (isErr(bv)) return bv; const cnt = new Array(bv.length + 1).fill(0); const sb = bv.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (const x of dv) { let lo = 0, hi = sb.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sb[mid][0] >= x) hi = mid; else lo = mid + 1; } if (lo === sb.length) cnt[bv.length]++; else { let j = lo; while (j > 0 && sb[j - 1][0] === sb[lo][0]) j--; cnt[sb[j][1]]++; } }
    return cnt.map((c) => [c]);
  }, 'data_array, bins_array', 'Calculates how often values occur within a range of values and returns a vertical array of numbers', { lift: false });
  R('PROB', 'xxnN', (x, p, lo, hi) => {
    const xs = F.flat(x), ps = F.flat(p); if (xs.length !== ps.length) return E.NA; let tot = 0, r = 0;
    for (let i = 0; i < ps.length; i++) { if (isErr(xs[i])) return xs[i]; if (isErr(ps[i])) return ps[i]; if (typeof ps[i] !== 'number' || typeof xs[i] !== 'number') return E.VALUE; if (ps[i] < 0 || ps[i] > 1) return E.NUM; tot += ps[i]; }
    if (Math.abs(tot - 1) > 1e-9) return E.NUM; const up = hi === undefined ? lo : hi; if (up < lo) return 0;
    for (let i = 0; i < ps.length; i++) if (xs[i] >= lo && xs[i] <= up) r += ps[i]; return r;
  }, 'x_range, prob_range, lower_limit, [upper_limit]', 'Returns the probability that values in a range are between two limits');

  // ---------- paired statistics / regression ----------
  const pr = (name, f, params, desc, minN) => D(name, 2, 2, (a, b) => { const p = M.pairs(a, b); if (isErr(p)) return p; if (p.length < (minN || 1)) return E.DIV0; return f(p.map((q) => q[0]), p.map((q) => q[1])); }, params, desc);
  const cov = (x, y, den) => { const mx_ = mean(x), my = mean(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx_) * (y[i] - my); return s / den(x.length); };
  pr(['COVARIANCE.P', 'COVAR'], (x, y) => cov(x, y, (n) => n), 'array1, array2', 'Returns population covariance');
  pr('COVARIANCE.S', (x, y) => cov(x, y, (n) => n - 1), 'array1, array2', 'Returns the sample covariance', 2);
  const corr = (x, y) => { const mx_ = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const a = x[i] - mx_, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; } return sxx === 0 || syy === 0 ? E.DIV0 : sxy / Math.sqrt(sxx * syy); };
  pr(['CORREL', 'PEARSON'], corr, 'array1, array2', 'Returns the correlation coefficient between two data sets', 2);
  pr('RSQ', (y, x) => { const r = corr(x, y); return isErr(r) ? r : r * r; }, 'known_y\'s, known_x\'s', 'Returns the square of the Pearson correlation coefficient', 2);
  const slope = (y, x) => { const mx_ = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx_) * (y[i] - my); sxx += (x[i] - mx_) * (x[i] - mx_); } return sxx === 0 ? E.DIV0 : sxy / sxx; };
  pr('SLOPE', slope, 'known_y\'s, known_x\'s', 'Returns the slope of the linear regression line', 2);
  pr('INTERCEPT', (y, x) => { const m = slope(y, x); return isErr(m) ? m : mean(y) - m * mean(x); }, 'known_y\'s, known_x\'s', 'Returns the intercept of the linear regression line', 2);
  pr('STEYX', (y, x) => { const m = slope(y, x); if (isErr(m)) return m; const mx_ = mean(x), my = mean(y); let s = 0; for (let i = 0; i < x.length; i++) { const e = (y[i] - my) - m * (x[i] - mx_); s += e * e; } return x.length < 3 ? E.DIV0 : Math.sqrt(s / (x.length - 2)); }, 'known_y\'s, known_x\'s', 'Returns the standard error of the predicted y-value for each x in the regression', 3);
  R(['FORECAST', 'FORECAST.LINEAR'], 'nxx', (x, ys, xs) => { const p = M.pairs(ys, xs); if (isErr(p)) return p; if (p.length < 2) return E.DIV0; const y = p.map((q) => q[0]), xx = p.map((q) => q[1]); const m = slope(y, xx); return isErr(m) ? m : mean(y) + m * (x - mean(xx)); }, 'x, known_y\'s, known_x\'s', 'Returns a value along a linear trend');

  // multiple linear regression via modified Gram-Schmidt
  function numMat(v) { const a = F.toArr2(v); const o = []; for (const row of a) { const r = []; for (const x of row) { if (isErr(x)) return x; if (typeof x !== 'number') return E.VALUE; r.push(x); } o.push(r); } return o.length && o[0].length ? o : E.VALUE; }
  function setup(ys, xs) {
    const Y = numMat(ys); if (isErr(Y)) return Y; const col = Y[0].length === 1, n = col ? Y.length : Y[0].length; if (!col && Y.length !== 1) return E.VALUE;
    const y = col ? Y.map((r) => r[0]) : Y[0].slice(); let X, k;
    if (xs === undefined) { X = y.map((_, i) => [i + 1]); k = 1; }
    else { const A = numMat(xs); if (isErr(A)) return A; if (col) { if (A.length !== n) return E.REF; k = A[0].length; X = A; } else { if (A[0].length !== n) return E.REF; k = A.length; X = y.map((_, i) => A.map((r) => r[i])); } }
    return { y, X, k, n, col };
  }
  function fit(y, X, k, cst) {
    const n = y.length, cols = []; if (cst) cols.push(new Array(n).fill(1)); for (let j = 0; j < k; j++) cols.push(X.map((r) => r[j]));
    const p = cols.length, Q = [], Rm = Array.from({ length: p }, () => new Array(p).fill(0)), keep = [];
    for (let j = 0; j < p; j++) {
      const v = cols[j].slice(); let on = 0; for (const x of v) on += x * x; on = Math.sqrt(on);
      for (let t = 0; t < 2; t++) for (let i = 0; i < Q.length; i++) { let d = 0; for (let r = 0; r < n; r++) d += Q[i].q[r] * v[r]; Rm[Q[i].j][j] += d; for (let r = 0; r < n; r++) v[r] -= d * Q[i].q[r]; }
      let nv = 0; for (const x of v) nv += x * x; nv = Math.sqrt(nv);
      if (nv <= 1e-10 * on || nv === 0) { keep.push(false); continue; }
      Rm[j][j] = nv; for (let r = 0; r < n; r++) v[r] /= nv; Q.push({ j, q: v }); keep.push(true);
    }
    const idx = Q.map((q) => q.j), m = idx.length; if (!m) return null;
    const qty = Q.map((q) => { let d = 0; for (let r = 0; r < n; r++) d += q.q[r] * y[r]; return d; });
    const beta = new Array(m).fill(0); for (let a = m - 1; a >= 0; a--) { let s = qty[a]; for (let b = a + 1; b < m; b++) s -= Rm[idx[a]][idx[b]] * beta[b]; beta[a] = s / Rm[idx[a]][idx[a]]; }
    const Ri = Array.from({ length: m }, () => new Array(m).fill(0)); // inverse of R (upper)
    for (let c = 0; c < m; c++) { Ri[c][c] = 1 / Rm[idx[c]][idx[c]]; for (let a = c - 1; a >= 0; a--) { let s = 0; for (let b = a + 1; b <= c; b++) s += Rm[idx[a]][idx[b]] * Ri[b][c]; Ri[a][c] = -s / Rm[idx[a]][idx[a]]; } }
    const diag = new Array(m).fill(0); for (let a = 0; a < m; a++) for (let b = a; b < m; b++) diag[a] += Ri[a][b] * Ri[a][b];
    const coef = new Array(p).fill(0), dg = new Array(p).fill(0); idx.forEach((j, a) => { coef[j] = beta[a]; dg[j] = diag[a]; });
    let ssres = 0; for (let i = 0; i < n; i++) { let f = 0; for (let j = 0; j < p; j++) f += coef[j] * cols[j][i]; ssres += (y[i] - f) * (y[i] - f); }
    const my = cst ? mean(y) : 0; let sst = 0; for (const v of y) sst += (v - my) * (v - my);
    return { coef, dg, ssres, sst, df: n - m, m, cst, p };
  }
  function linest(ys, xs, cst, stats, logMode) {
    const s = setup(ys, xs); if (isErr(s)) return s; cst = cst === undefined ? true : cst; let y = s.y;
    if (logMode) { y = y.map((v) => v); for (const v of y) if (v <= 0) return E.NUM; y = y.map(Math.log); }
    if (s.n < 1) return E.VALUE; const f = fit(y, s.X, s.k, cst); if (!f) return E.NUM;
    const off = cst ? 1 : 0, k = s.k; let row1 = [], row2 = [];
    const b = cst ? f.coef[0] : 0; const mse = f.df > 0 ? f.ssres / f.df : NaN;
    for (let j = k - 1; j >= 0; j--) { row1.push(f.coef[j + off]); row2.push(f.df > 0 ? Math.sqrt(mse * f.dg[j + off]) : E.NA); }
    row1.push(b); row2.push(cst ? (f.df > 0 ? Math.sqrt(mse * f.dg[0]) : E.NA) : E.NA);
    if (logMode) row1 = row1.map(Math.exp);
    if (!stats) return [row1];
    const ssreg = f.sst - f.ssres, na = new Array(k).fill(E.NA); const r2 = f.sst === 0 ? 1 : ssreg / f.sst;
    // fixed (df==0) cases yield #N/A in the F row
    return [row1, row2, [r2, f.df > 0 ? Math.sqrt(mse) : E.NA].concat(na), [f.df > 0 ? (ssreg / (f.m - off)) / mse : E.NA, f.df].concat(na), [ssreg, f.ssres].concat(na)];
  }
  const optB = (v, d) => (v === undefined || v === null ? d : toBool(v));
  const toBool = (v) => { const b = F.toBool(v); return b; };
  const lin = (log) => (ys, xs, c, st) => { const cc = optB(c, true), ss_ = optB(st, false); if (isErr(cc)) return cc; if (isErr(ss_)) return ss_; return linest(ys, xs, cc, ss_, log); };
  D('LINEST', 1, 4, lin(false), 'known_y\'s, [known_x\'s], [const], [stats]', 'Returns the parameters of a linear trend', { errs: false });
  D('LOGEST', 1, 4, lin(true), 'known_y\'s, [known_x\'s], [const], [stats]', 'Returns the parameters of an exponential trend', { errs: false });
  function trend(ys, xs, nx, c, log) {
    const cc = optB(c, true); if (isErr(cc)) return cc; const s = setup(ys, xs); if (isErr(s)) return s; let y = s.y;
    if (log) { for (const v of y) if (v <= 0) return E.NUM; y = y.map(Math.log); }
    const f = fit(y, s.X, s.k, cc); if (!f) return E.NUM; const off = cc ? 1 : 0;
    const pred = (row) => { let v = cc ? f.coef[0] : 0; for (let j = 0; j < s.k; j++) v += f.coef[j + off] * row[j]; return log ? Math.exp(v) : v; };
    if (nx === undefined) { const out = s.X.map((r) => pred(r)); return s.col ? out.map((v) => [v]) : [out]; }
    const A = numMat(nx); if (isErr(A)) return A;
    if (s.k === 1) return A.map((r) => r.map((v) => pred([v])));
    if (s.col) { if (A[0].length !== s.k) return E.REF; return A.map((r) => [pred(r)]); }
    if (A.length !== s.k) return E.REF; const out = []; for (let i = 0; i < A[0].length; i++) out.push(pred(A.map((r) => r[i]))); return [out];
  }
  D('TREND', 1, 4, (y, x, nx, c) => trend(y, x, nx, c, false), 'known_y\'s, [known_x\'s], [new_x\'s], [const]', 'Returns values along a linear trend');
  D('GROWTH', 1, 4, (y, x, nx, c) => trend(y, x, nx, c, true), 'known_y\'s, [known_x\'s], [new_x\'s], [const]', 'Returns values along an exponential trend');

  // ---------- normal family ----------
  R('STANDARDIZE', 'nnn', (x, m, s) => (s <= 0 ? E.NUM : (x - m) / s), 'x, mean, standard_dev', 'Returns a normalized value');
  R('FISHER', 'n', (x) => (Math.abs(x) >= 1 ? E.NUM : Math.atanh(x)), 'x', 'Returns the Fisher transformation');
  R('FISHERINV', 'n', Math.tanh, 'y', 'Returns the inverse of the Fisher transformation');
  R(['NORM.DIST', 'NORMDIST'], 'nnnb', (x, m, s, c) => { if (s <= 0) return E.NUM; const z = (x - m) / s; return c ? M.ncdf(z) : M.npdf(z) / s; }, 'x, mean, standard_dev, cumulative', 'Returns the normal distribution');
  R('NORM.S.DIST', 'nB', (z, c) => (c === undefined || c ? M.ncdf(z) : M.npdf(z)), 'z, cumulative', 'Returns the standard normal distribution');
  R('NORMSDIST', 'n', M.ncdf, 'z', 'Returns the standard normal cumulative distribution');
  R(['NORM.INV', 'NORMINV'], 'nnn', (p, m, s) => (p <= 0 || p >= 1 || s <= 0 ? E.NUM : m + s * M.ninv(p)), 'probability, mean, standard_dev', 'Returns the inverse of the normal cumulative distribution');
  R(['NORM.S.INV', 'NORMSINV'], 'n', (p) => (p <= 0 || p >= 1 ? E.NUM : M.ninv(p)), 'probability', 'Returns the inverse of the standard normal cumulative distribution');
  R('GAUSS', 'n', (z) => M.ncdf(z) - 0.5, 'z', 'Returns 0.5 less than the standard normal cumulative distribution');
  R('PHI', 'n', M.npdf, 'x', 'Returns the value of the density function for a standard normal distribution');
  R('LOGNORM.DIST', 'nnnb', (x, m, s, c) => { if (x <= 0 || s <= 0) return E.NUM; const z = (Math.log(x) - m) / s; return c ? M.ncdf(z) : M.npdf(z) / (x * s); }, 'x, mean, standard_dev, cumulative', 'Returns the lognormal distribution');
  R('LOGNORMDIST', 'nnn', (x, m, s) => (x <= 0 || s <= 0 ? E.NUM : M.ncdf((Math.log(x) - m) / s)), 'x, mean, standard_dev', 'Returns the cumulative lognormal distribution');
  R(['LOGNORM.INV', 'LOGINV'], 'nnn', (p, m, s) => (p <= 0 || p >= 1 || s <= 0 ? E.NUM : Math.exp(m + s * M.ninv(p))), 'probability, mean, standard_dev', 'Returns the inverse of the lognormal cumulative distribution');
  const zconf = (a, s, n) => (a <= 0 || a >= 1 || s <= 0 || n < 1 ? E.NUM : -M.ninv(a / 2) * s / Math.sqrt(n));
  R(['CONFIDENCE.NORM', 'CONFIDENCE'], 'nni', zconf, 'alpha, standard_dev, size', 'Returns the confidence interval for a population mean, using a normal distribution');

  // ---------- discrete ----------
  const binPmf = (k, n, p) => { if (p === 0) return k === 0 ? 1 : 0; if (p === 1) return k === n ? 1 : 0; if (n <= 170) return M.combin(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); return Math.exp(M.lcomb(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p)); };
  const binCdf = (k, n, p) => { if (k >= n) return 1; if (n <= 1000) { let s = 0; for (let i = 0; i <= k; i++) s += binPmf(i, n, p); return Math.min(1, s); } return M.ibeta(1 - p, n - k, k + 1); };
  R(['BINOM.DIST', 'BINOMDIST'], 'iinb', (k, n, p, c) => (n < 0 || k < 0 || k > n || p < 0 || p > 1 ? E.NUM : c ? binCdf(k, n, p) : binPmf(k, n, p)), 'number_s, trials, probability_s, cumulative', 'Returns the individual term binomial distribution probability');
  R('BINOM.DIST.RANGE', 'iniI', (n, p, s, s2) => { if (s2 === undefined) s2 = s; s2 = Math.trunc(s2); if (n < 0 || p < 0 || p > 1 || s < 0 || s > n || s2 < s || s2 > n) return E.NUM; let t = 0; for (let i = s; i <= s2; i++) t += binPmf(i, n, p); return Math.min(1, t); }, 'trials, probability_s, number_s, [number_s2]', 'Returns the probability of a trial result using a binomial distribution');
  R(['BINOM.INV', 'CRITBINOM'], 'inn', (n, p, a) => { if (n < 0 || p < 0 || p > 1 || a < 0 || a > 1) return E.NUM; let c = 0; for (let k = 0; k <= n; k++) { c += binPmf(k, n, p); if (c >= a - 1e-15) return k; } return n; }, 'trials, probability_s, alpha', 'Returns the smallest value for which the cumulative binomial distribution is at least a criterion value');
  const nbPmf = (f, s, p) => (p === 1 ? (f === 0 ? 1 : 0) : Math.exp(M.lcomb(f + s - 1, f) + s * Math.log(p) + f * Math.log1p(-p)));
  R('NEGBINOM.DIST', 'iinb', (f, s, p, c) => (f < 0 || s < 1 || p < 0 || p > 1 ? E.NUM : p === 0 ? E.NUM : c ? M.ibeta(p, s, f + 1) : nbPmf(f, s, p)), 'number_f, number_s, probability_s, cumulative', 'Returns the negative binomial distribution');
  R('NEGBINOMDIST', 'iin', (f, s, p) => (f < 0 || s < 1 || p <= 0 || p > 1 ? E.NUM : nbPmf(f, s, p)), 'number_f, number_s, probability_s', 'Returns the negative binomial distribution');
  const hyp = (k, n, K, N, c) => {
    if (n < 0 || K < 0 || N < 0 || n > N || K > N || k < 0 || k > Math.min(n, K) || k < Math.max(0, n - N + K)) return E.NUM;
    const pm = (i) => Math.exp(M.lcomb(K, i) + M.lcomb(N - K, n - i) - M.lcomb(N, n));
    if (!c) return pm(k); let s = 0; for (let i = Math.max(0, n - N + K); i <= k; i++) s += pm(i); return Math.min(1, s);
  };
  R('HYPGEOM.DIST', 'iiiib', hyp, 'sample_s, number_sample, population_s, number_pop, cumulative', 'Returns the hypergeometric distribution');
  R('HYPGEOMDIST', 'iiii', (k, n, K, N) => hyp(k, n, K, N, false), 'sample_s, number_sample, population_s, number_pop', 'Returns the hypergeometric distribution');
  R(['POISSON.DIST', 'POISSON'], 'nnb', (x, l, c) => { x = Math.trunc(x); if (x < 0 || l < 0) return E.NUM; if (l === 0) return c ? 1 : (x === 0 ? 1 : 0); return c ? M.igamQ(x + 1, l) : Math.exp(-l + x * Math.log(l) - M.lgamma(x + 1)); }, 'x, mean, cumulative', 'Returns the Poisson distribution');

  // ---------- continuous ----------
  R(['EXPON.DIST', 'EXPONDIST'], 'nnb', (x, l, c) => (x < 0 || l <= 0 ? E.NUM : c ? -Math.expm1(-l * x) : l * Math.exp(-l * x)), 'x, lambda, cumulative', 'Returns the exponential distribution');
  R(['WEIBULL.DIST', 'WEIBULL'], 'nnnb', (x, a, b, c) => { if (x < 0 || a <= 0 || b <= 0) return E.NUM; const t = Math.pow(x / b, a); return c ? -Math.expm1(-t) : (x === 0 ? (a === 1 ? 1 / b : a < 1 ? E.NUM : 0) : a / b * Math.pow(x / b, a - 1) * Math.exp(-t)); }, 'x, alpha, beta, cumulative', 'Returns the Weibull distribution');
  const gamPdf = (x, a, b) => (x === 0 ? (a === 1 ? 1 / b : a < 1 ? E.NUM : 0) : Math.exp((a - 1) * Math.log(x) - x / b - a * Math.log(b) - M.lgamma(a)));
  R(['GAMMA.DIST', 'GAMMADIST'], 'nnnb', (x, a, b, c) => (x < 0 || a <= 0 || b <= 0 ? E.NUM : c ? M.igamP(a, x / b) : gamPdf(x, a, b)), 'x, alpha, beta, cumulative', 'Returns the gamma distribution');
  const gamInv = (p, a, b) => (p < 0 || p >= 1 || a <= 0 || b <= 0 ? E.NUM : p === 0 ? 0 : b * M.invInc((x) => M.igamP(a, x), p, 0, a + 10, true));
  R(['GAMMA.INV', 'GAMMAINV'], 'nnn', gamInv, 'probability, alpha, beta', 'Returns the inverse of the gamma cumulative distribution');
  R('BETA.DIST', 'nnnbNN', (x, a, b, c, A, B) => { A = A === undefined ? 0 : A; B = B === undefined ? 1 : B; if (a <= 0 || b <= 0 || x < A || x > B || A === B) return E.NUM; const t = (x - A) / (B - A); if (c) return M.ibeta(t, a, b); return Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log1p(-t) - M.lbeta(a, b)) / (B - A); }, 'x, alpha, beta, cumulative, [A], [B]', 'Returns the beta cumulative distribution function');
  R('BETADIST', 'nnnNN', (x, a, b, A, B) => { A = A === undefined ? 0 : A; B = B === undefined ? 1 : B; if (a <= 0 || b <= 0 || x < A || x > B || A === B) return E.NUM; return M.ibeta((x - A) / (B - A), a, b); }, 'x, alpha, beta, [A], [B]', 'Returns the cumulative beta probability density function');
  R(['BETA.INV', 'BETAINV'], 'nnnNN', (p, a, b, A, B) => { A = A === undefined ? 0 : A; B = B === undefined ? 1 : B; if (a <= 0 || b <= 0 || p <= 0 || p > 1 || A >= B) return E.NUM; return A + (B - A) * M.invInc((t) => M.ibeta(t, a, b), p, 0, 1); }, 'probability, alpha, beta, [A], [B]', 'Returns the inverse of the cumulative beta distribution function');
  const dfOk = (v) => v >= 1 && v <= 1e10;
  R('CHISQ.DIST', 'nib', (x, v, c) => (x < 0 || !dfOk(v) ? E.NUM : c ? M.igamP(v / 2, x / 2) : gamPdf(x, v / 2, 2)), 'x, deg_freedom, cumulative', 'Returns the chi-squared distribution (left-tailed)');
  R(['CHISQ.DIST.RT', 'CHIDIST'], 'ni', (x, v) => (x < 0 || !dfOk(v) ? E.NUM : M.igamQ(v / 2, x / 2)), 'x, deg_freedom', 'Returns the right-tailed probability of the chi-squared distribution');
  R('CHISQ.INV', 'ni', (p, v) => (p < 0 || p >= 1 || !dfOk(v) ? E.NUM : gamInv(p, v / 2, 2)), 'probability, deg_freedom', 'Returns the inverse of the left-tailed probability of the chi-squared distribution');
  R(['CHISQ.INV.RT', 'CHIINV'], 'ni', (q, v) => { if (q <= 0 || q > 1 || !dfOk(v)) return E.NUM; if (q === 1) return 0; return 2 * M.invDec((x) => M.igamQ(v / 2, x), q, 0, v / 2 + 10, true); }, 'probability, deg_freedom', 'Returns the inverse of the right-tailed probability of the chi-squared distribution');
  R(['CHISQ.TEST', 'CHITEST'], 'xx', (a, e) => {
    const A = numMat(a), B = numMat(e); if (isErr(A)) return A; if (isErr(B)) return B; if (A.length !== B.length || A[0].length !== B[0].length) return E.NA;
    const r = A.length, c = A[0].length; let st = 0; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { if (B[i][j] === 0) return E.DIV0; st += (A[i][j] - B[i][j]) ** 2 / B[i][j]; }
    const df = r === 1 ? c - 1 : c === 1 ? r - 1 : (r - 1) * (c - 1); if (df < 1) return E.NA; return M.igamQ(df / 2, st / 2);
  }, 'actual_range, expected_range', 'Returns the test for independence', { lift: false });
  const tUpper = (t, v) => { const h = 0.5 * M.ibeta(v / (v + t * t), v / 2, 0.5); return t >= 0 ? h : 1 - h; };
  const tPdf = (t, v) => Math.exp(M.lgamma((v + 1) / 2) - M.lgamma(v / 2) - 0.5 * Math.log(v * Math.PI) - (v + 1) / 2 * Math.log1p(t * t / v));
  const tInvUp = (q, v) => M.invDec((t) => tUpper(t, v), q, 0, 1, true); // positive t with upper tail q (q<0.5)
  R('T.DIST', 'nib', (x, v, c) => (v < 1 ? E.NUM : c ? 1 - tUpper(x, v) : tPdf(x, v)), 'x, deg_freedom, cumulative', 'Returns the left-tailed Student\'s t-distribution');
  R('T.DIST.RT', 'ni', (x, v) => (v < 1 ? E.NUM : tUpper(x, v)), 'x, deg_freedom', 'Returns the right-tailed Student\'s t-distribution');
  R('T.DIST.2T', 'ni', (x, v) => (v < 1 || x < 0 ? E.NUM : 2 * tUpper(x, v)), 'x, deg_freedom', 'Returns the two-tailed Student\'s t-distribution');
  R('TDIST', 'nii', (x, v, t) => (v < 1 || x < 0 || (t !== 1 && t !== 2) ? E.NUM : t * tUpper(x, v)), 'x, deg_freedom, tails', 'Returns the Student\'s t-distribution');
  R('T.INV', 'ni', (p, v) => { if (p <= 0 || p >= 1 || v < 1) return E.NUM; if (p === 0.5) return 0; return p < 0.5 ? -tInvUp(p, v) : tInvUp(1 - p, v); }, 'probability, deg_freedom', 'Returns the left-tailed inverse of the Student\'s t-distribution');
  R(['T.INV.2T', 'TINV'], 'ni', (p, v) => (p <= 0 || p > 1 || v < 1 ? E.NUM : p === 1 ? 0 : tInvUp(p / 2, v)), 'probability, deg_freedom', 'Returns the two-tailed inverse of the Student\'s t-distribution');
  R('CONFIDENCE.T', 'nni', (a, s, n) => (a <= 0 || a >= 1 || s <= 0 || n < 1 ? E.NUM : n === 1 ? E.DIV0 : tInvUp(a / 2, n - 1) * s / Math.sqrt(n)), 'alpha, standard_dev, size', 'Returns the confidence interval for a population mean, using a Student\'s t distribution');
  const fCdf = (x, a, b) => M.ibeta(a * x / (a * x + b), a / 2, b / 2), fSf = (x, a, b) => M.ibeta(b / (a * x + b), b / 2, a / 2);
  const fOk = (x, a, b) => x >= 0 && a >= 1 && b >= 1 && a < 1e10 && b < 1e10;
  R('F.DIST', 'niib', (x, a, b, c) => { if (!fOk(x, a, b)) return E.NUM; if (c) return fCdf(x, a, b); if (x === 0) return a === 2 ? 1 : a < 2 ? E.NUM : 0; return Math.exp(0.5 * a * Math.log(a) + 0.5 * b * Math.log(b) + (a / 2 - 1) * Math.log(x) - (a + b) / 2 * Math.log(b + a * x) - M.lbeta(a / 2, b / 2)); }, 'x, deg_freedom1, deg_freedom2, cumulative', 'Returns the F probability distribution');
  R(['F.DIST.RT', 'FDIST'], 'nii', (x, a, b) => (fOk(x, a, b) ? fSf(x, a, b) : E.NUM), 'x, deg_freedom1, deg_freedom2', 'Returns the right-tailed F probability distribution');
  R('F.INV', 'nii', (p, a, b) => (p <= 0 || p >= 1 || !fOk(0, a, b) ? E.NUM : M.invInc((x) => fCdf(x, a, b), p, 0, 1, true)), 'probability, deg_freedom1, deg_freedom2', 'Returns the inverse of the F probability distribution');
  R(['F.INV.RT', 'FINV'], 'nii', (q, a, b) => (q <= 0 || q >= 1 || !fOk(0, a, b) ? E.NUM : M.invDec((x) => fSf(x, a, b), q, 0, 1, true)), 'probability, deg_freedom1, deg_freedom2', 'Returns the inverse of the right-tailed F probability distribution');
  R(['F.TEST', 'FTEST'], 'xx', (a, b) => { const x = one(a), y = one(b); if (isErr(x)) return x; if (isErr(y)) return y; if (x.length < 2 || y.length < 2) return E.DIV0; const v1 = varS(x), v2 = varS(y); if (v1 === 0 || v2 === 0) return E.DIV0; const p = fSf(v1 / v2, x.length - 1, y.length - 1); return 2 * Math.min(p, 1 - p); }, 'array1, array2', 'Returns the result of an F-test', { lift: false });
  R(['Z.TEST', 'ZTEST'], 'xnN', (a, x, s) => { const v = one(a); if (isErr(v)) return v; const n = v.length; if (!n) return E.NA; if (s === undefined) { if (n < 2) return E.DIV0; s = Math.sqrt(varS(v)); } if (s === 0) return E.DIV0; return 1 - M.ncdf((mean(v) - x) / (s / Math.sqrt(n))); }, 'array, x, [sigma]', 'Returns the one-tailed probability-value of a z-test');
  R(['T.TEST', 'TTEST'], 'xxii', (a, b, tails, type) => {
    const x = one(a), y = one(b); if (isErr(x)) return x; if (isErr(y)) return y; if ((tails !== 1 && tails !== 2) || type < 1 || type > 3) return E.NUM; let t, df;
    if (type === 1) { const p = M.pairs(a, b); if (isErr(p)) return p; const d = p.map((q) => q[0] - q[1]); if (d.length < 2) return E.DIV0; const sd = Math.sqrt(varS(d)); if (sd === 0) return E.DIV0; t = mean(d) / (sd / Math.sqrt(d.length)); df = d.length - 1; }
    else { if (x.length < 2 || y.length < 2) return E.DIV0; const v1 = varS(x), v2 = varS(y), n1 = x.length, n2 = y.length; if (type === 2) { const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); if (sp === 0) return E.DIV0; t = (mean(x) - mean(y)) / Math.sqrt(sp * (1 / n1 + 1 / n2)); df = n1 + n2 - 2; } else { const a1 = v1 / n1, a2 = v2 / n2; if (a1 + a2 === 0) return E.DIV0; t = (mean(x) - mean(y)) / Math.sqrt(a1 + a2); df = (a1 + a2) ** 2 / (a1 * a1 / (n1 - 1) + a2 * a2 / (n2 - 1)); } }
    return tails * tUpper(Math.abs(t), df);
  }, 'array1, array2, tails, type', 'Returns the probability associated with a Student\'s t-test', { lift: false });
})(typeof globalThis !== 'undefined' ? globalThis : this);
