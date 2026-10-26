/* ZengNumbers functions: Financial (time value of money, depreciation, cash-flow IRR/NPV, securities & bond basics). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E } = ZN; const F = ZN.F; const { isErr, toNum } = F; const DT = ZN.date;
  const CAT = 'Financial';
  const R = (n, s, f, p, d, x) => ZN.reg(n, s, f, p, d, CAT, x);
  const D = (names, min, max, impl, params, desc, extra) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: CAT, hint: [].concat(names)[0] + '(' + params + ')', desc }, extra));
  const ty = (t) => (t ? 1 : 0);

  // ---------- time value of money ----------
  const pw = (r, n) => Math.pow(1 + r, n);
  const pmtF = (r, n, pv, fv, t) => (r === 0 ? -(pv + fv) / n : -(pv * pw(r, n) + fv) * r / ((1 + r * t) * (pw(r, n) - 1)));
  const fvF = (r, n, pmt, pv, t) => (r === 0 ? -(pv + pmt * n) : -(pv * pw(r, n) + pmt * (1 + r * t) * (pw(r, n) - 1) / r));
  const pvF = (r, n, pmt, fv, t) => (r === 0 ? -(fv + pmt * n) : -(fv + pmt * (1 + r * t) * (pw(r, n) - 1) / r) / pw(r, n));
  const ipmtF = (r, per, n, pv, fv, t) => {
    const pmt = pmtF(r, n, pv, fv, t); let i;
    if (per === 1) i = t ? 0 : -pv; else i = t ? fvF(r, per - 2, pmt, pv, 1) - pmt : fvF(r, per - 1, pmt, pv, 0);
    return i * r;
  };
  R('PMT', 'nnnNN', (r, n, pv, fv, t) => (n === 0 ? E.NUM : pmtF(r, n, pv, fv || 0, ty(t))), 'rate, nper, pv, [fv], [type]', 'Returns the periodic payment for an annuity');
  R('FV', 'nnnNN', (r, n, pmt, pv, t) => fvF(r, n, pmt, pv || 0, ty(t)), 'rate, nper, pmt, [pv], [type]', 'Returns the future value of an investment');
  R('PV', 'nnnNN', (r, n, pmt, fv, t) => pvF(r, n, pmt, fv || 0, ty(t)), 'rate, nper, pmt, [fv], [type]', 'Returns the present value of an investment');
  R('IPMT', 'nnnnNN', (r, per, n, pv, fv, t) => { per = Math.trunc(per); return per < 1 || per > n || n <= 0 ? E.NUM : ipmtF(r, per, n, pv, fv || 0, ty(t)); }, 'rate, per, nper, pv, [fv], [type]', 'Returns the interest payment for an investment for a given period');
  R('PPMT', 'nnnnNN', (r, per, n, pv, fv, t) => { per = Math.trunc(per); if (per < 1 || per > n || n <= 0) return E.NUM; fv = fv || 0; t = ty(t); return pmtF(r, n, pv, fv, t) - ipmtF(r, per, n, pv, fv, t); }, 'rate, per, nper, pv, [fv], [type]', 'Returns the payment on the principal for an investment for a given period');
  R('NPER', 'nnnNN', (r, pmt, pv, fv, t) => {
    fv = fv || 0; t = ty(t); if (r === 0) return pmt === 0 ? E.NUM : -(pv + fv) / pmt;
    const z = pmt * (1 + r * t) / r, a = z - fv, b = pv + z; if (b === 0 || a / b <= 0 || r <= -1) return E.NUM; return Math.log(a / b) / Math.log1p(r);
  }, 'rate, pmt, pv, [fv], [type]', 'Returns the number of periods for an investment');
  // generic root finder: Newton from guess, then bracket scan + bisection
  function solve(f, guess, grid) {
    let x = guess; for (let i = 0; i < 100; i++) { const y = f(x); if (!isFinite(y)) break; const h = Math.max(1e-7, Math.abs(x) * 1e-7), d = (f(x + h) - f(x - h)) / (2 * h); if (!isFinite(d) || d === 0) break; const nx = x - y / d; if (!isFinite(nx) || nx <= grid[0]) break; if (Math.abs(nx - x) < 1e-14 * Math.max(1, Math.abs(nx))) return nx; x = nx; }
    let best = null; let px = grid[0], py = f(px); if (py === 0) return px;
    for (let i = 1; i < grid.length; i++) { const cx = grid[i], cy = f(cx); if (cy === 0) return cx; if (isFinite(py) && isFinite(cy) && (py === 0 || py * cy < 0)) { const mid = (px + cx) / 2; if (best === null || Math.abs(mid - guess) < Math.abs(best[0] - guess)) best = [mid, px, cx, py]; } px = cx; py = cy; }
    if (!best) return null; let [, lo, hi, flo] = best; for (let i = 0; i < 300; i++) { const mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; const fm = f(mid); if (fm === 0) return mid; if (fm * flo < 0) hi = mid; else { lo = mid; flo = fm; } } return (lo + hi) / 2;
  }
  const GRID = [-0.999999, -0.99, -0.9, -0.75, -0.5, -0.3, -0.2, -0.1, -0.05, -0.01, 0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];
  R('RATE', 'nnnNNN', (n, pmt, pv, fv, t, g) => {
    fv = fv || 0; t = ty(t); g = g === undefined ? 0.1 : g; if (n <= 0) return E.NUM;
    const f = (r) => (Math.abs(r) < 1e-12 ? pv + pmt * n + fv : pv * pw(r, n) + pmt * (1 + r * t) * (pw(r, n) - 1) / r + fv);
    const r = solve(f, g, GRID); return r === null ? E.NUM : r;
  }, 'nper, pmt, pv, [fv], [type], [guess]', 'Returns the interest rate per period of an annuity');
  const cum = (isInt) => (r, n, pv, s, e, t) => {
    s = Math.trunc(s); e = Math.trunc(e); if (r <= 0 || n <= 0 || pv <= 0 || s < 1 || e < s || e > n || (t !== 0 && t !== 1)) return E.NUM;
    let tot = 0; for (let p = s; p <= e; p++) { const i = ipmtF(r, p, n, pv, 0, t); tot += isInt ? i : pmtF(r, n, pv, 0, t) - i; } return tot;
  };
  R('CUMIPMT', 'nnnnnn', cum(true), 'rate, nper, pv, start_period, end_period, type', 'Returns the cumulative interest paid between two periods');
  R('CUMPRINC', 'nnnnnn', cum(false), 'rate, nper, pv, start_period, end_period, type', 'Returns the cumulative principal paid on a loan between two periods');
  R('EFFECT', 'ni', (nom, n) => (nom <= 0 || n < 1 ? E.NUM : Math.pow(1 + nom / n, n) - 1), 'nominal_rate, npery', 'Returns the effective annual interest rate');
  R('NOMINAL', 'ni', (eff, n) => (eff <= 0 || n < 1 ? E.NUM : n * (Math.pow(1 + eff, 1 / n) - 1)), 'effect_rate, npery', 'Returns the annual nominal interest rate');
  R('ISPMT', 'nnnn', (r, per, n, pv) => (n === 0 ? E.DIV0 : pv * r * (per / n - 1)), 'rate, per, nper, pv', 'Returns the interest paid during a specific period of an investment');
  R('PDURATION', 'nnn', (r, pv, fv) => (r <= 0 || pv <= 0 || fv <= 0 ? E.NUM : (Math.log(fv) - Math.log(pv)) / Math.log1p(r)), 'rate, pv, fv', 'Returns the number of periods required by an investment to reach a specified value');
  R('RRI', 'nnn', (n, pv, fv) => (n <= 0 || pv === 0 || fv / pv < 0 ? E.NUM : Math.pow(fv / pv, 1 / n) - 1), 'nper, pv, fv', 'Returns an equivalent interest rate for the growth of an investment');
  D('FVSCHEDULE', 2, 2, (p, s) => { p = toNum(p); if (isErr(p)) return p; let r = p; for (const x of F.flat(s)) { if (isErr(x)) return x; if (typeof x !== 'number' && x != null) return E.VALUE; r *= 1 + (x || 0); } return r; }, 'principal, schedule', 'Returns the future value of an initial principal after applying a series of compound interest rates');
  R('DOLLARDE', 'ni', (d, f) => { if (f < 0) return E.NUM; if (f === 0) return E.DIV0; const neg = d < 0, a = Math.abs(d), ip = Math.floor(a); const digits = Math.ceil(Math.log10(f)); const fr = Math.round((a - ip) * Math.pow(10, digits + 9)) / Math.pow(10, 9); const v = ip + fr / f; return neg ? -v : v; }, 'fractional_dollar, fraction', 'Converts a dollar price, expressed as a fraction, into a dollar price, expressed as a decimal number');
  R('DOLLARFR', 'ni', (d, f) => { if (f < 0) return E.NUM; if (f === 0) return E.DIV0; const neg = d < 0, a = Math.abs(d), ip = Math.floor(a); const digits = Math.ceil(Math.log10(f)); const v = ip + (a - ip) * f / Math.pow(10, digits); return neg ? -v : v; }, 'decimal_dollar, fraction', 'Converts a dollar price, expressed as a decimal number, into a dollar price, expressed as a fraction');

  // ---------- cash flows ----------
  D('NPV', 2, 255, (rate, ...vals) => {
    rate = toNum(rate); if (isErr(rate)) return rate; if (rate === -1) return E.DIV0; const v = F.nums(vals); if (isErr(v)) return v;
    let s = 0; for (let i = 0; i < v.length; i++) s += v[i] / pw(rate, i + 1); return s;
  }, 'rate, value1, [value2], …', 'Returns the net present value of an investment based on a discount rate and a series of future payments');
  const flow = (vals) => { const v = F.nums([vals]); if (isErr(v)) return v; let p = false, n = false; for (const x of v) { if (x > 0) p = true; else if (x < 0) n = true; } return p && n ? v : E.NUM; };
  D('IRR', 1, 2, (vals, g) => { const v = flow(vals); if (isErr(v)) return v; g = g === undefined ? 0.1 : toNum(g); if (isErr(g)) return g; const f = (r) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] / pw(r, i); return s; }; const r = solve(f, g, GRID); return r === null ? E.NUM : r; }, 'values, [guess]', 'Returns the internal rate of return for a series of cash flows');
  D('MIRR', 3, 3, (vals, fr, rr) => {
    const v = F.nums([vals]); fr = toNum(fr); rr = toNum(rr); if (isErr(v)) return v; if (isErr(fr)) return fr; if (isErr(rr)) return rr; const n = v.length;
    let np = 0, nn = 0, hp = false, hn = false; for (let i = 0; i < n; i++) { if (v[i] > 0) { hp = true; np += v[i] / pw(rr, i + 1); } else if (v[i] < 0) { hn = true; nn += v[i] / pw(fr, i + 1); } }
    if (!hp || !hn || n < 2) return E.DIV0; return Math.pow(-np * pw(rr, n) / (nn * (1 + fr)), 1 / (n - 1)) - 1;
  }, 'values, finance_rate, reinvest_rate', 'Returns the internal rate of return where positive and negative cash flows are financed at different rates');
  function dated(vals, dates) {
    const v = F.flat(vals), d = F.flat(dates); if (v.length !== d.length) return E.NUM; const vv = [], dd = [];
    for (let i = 0; i < v.length; i++) { if (isErr(v[i])) return v[i]; if (isErr(d[i])) return d[i]; const a = toNum(v[i]), b = toNum(d[i]); if (isErr(a)) return a; if (isErr(b)) return b; if (b < 0) return E.NUM; vv.push(a); dd.push(Math.floor(b)); }
    for (const x of dd) if (x < dd[0]) return E.NUM; return { v: vv, d: dd };
  }
  D('XNPV', 3, 3, (rate, vals, dates) => { rate = toNum(rate); if (isErr(rate)) return rate; if (rate <= -1) return E.NUM; const x = dated(vals, dates); if (isErr(x)) return x; let s = 0; for (let i = 0; i < x.v.length; i++) s += x.v[i] / Math.pow(1 + rate, (x.d[i] - x.d[0]) / 365); return s; }, 'rate, values, dates', 'Returns the net present value for a schedule of cash flows that is not necessarily periodic');
  D('XIRR', 2, 3, (vals, dates, g) => {
    const x = dated(vals, dates); if (isErr(x)) return x; g = g === undefined ? 0.1 : toNum(g); if (isErr(g)) return g; let p = false, n = false; for (const a of x.v) { if (a > 0) p = true; else if (a < 0) n = true; } if (!p || !n) return E.NUM;
    const f = (r) => { let s = 0; for (let i = 0; i < x.v.length; i++) s += x.v[i] / Math.pow(1 + r, (x.d[i] - x.d[0]) / 365); return s; }; const r = solve(f, g, GRID); return r === null ? E.NUM : r;
  }, 'values, dates, [guess]', 'Returns the internal rate of return for a schedule of cash flows that is not necessarily periodic');

  // ---------- depreciation ----------
  R('SLN', 'nnn', (c, s, l) => (l === 0 ? E.DIV0 : (c - s) / l), 'cost, salvage, life', 'Returns the straight-line depreciation of an asset for one period');
  R('SYD', 'nnnn', (c, s, l, p) => (l <= 0 || p <= 0 || p > l ? E.NUM : (c - s) * (l - p + 1) * 2 / (l * (l + 1))), 'cost, salvage, life, per', 'Returns the sum-of-years\' digits depreciation of an asset for a specified period');
  R('DB', 'nnnnN', (cost, salv, life, per, month) => {
    month = month === undefined ? 12 : Math.trunc(month); per = Math.trunc(per);
    if (cost < 0 || salv < 0 || life <= 0 || per < 1 || month < 1 || month > 12 || per > life + (month < 12 ? 1 : 0)) return E.NUM; if (cost === 0) return 0;
    const rate = Math.round((1 - Math.pow(salv / cost, 1 / life)) * 1000) / 1000; let total = cost * rate * month / 12; if (per === 1) return total;
    for (let p = 2; p <= Math.min(per, life); p++) { const dep = (cost - total) * rate; if (p === per) return dep; total += dep; }
    return (cost - total) * rate * (12 - month) / 12;
  }, 'cost, salvage, life, period, [month]', 'Returns the depreciation of an asset for a specified period by using the fixed-declining balance method');
  R('DDB', 'nnnnN', (cost, salv, life, per, f) => {
    f = f === undefined ? 2 : f; if (cost < 0 || salv < 0 || life <= 0 || per <= 0 || per > life || f <= 0) return E.NUM;
    const rate = f / life; let total = 0, dep = 0; const n = Math.ceil(per);
    for (let p = 1; p <= n; p++) { dep = Math.min((cost - total) * rate, Math.max(0, cost - salv - total)); if (p < n) total += dep; }
    return per < n ? dep * (per - (n - 1)) : dep;
  }, 'cost, salvage, life, period, [factor]', 'Returns the depreciation of an asset for a specified period by using the double-declining balance method');
  R('VDB', 'nnnnnNB', (cost, salv, life, start, end, f, noSwitch) => {
    f = f === undefined ? 2 : f; if (cost < 0 || salv < 0 || life <= 0 || start < 0 || end < start || end > life || f <= 0) return E.NUM;
    let book = cost, total = 0; const rate = f / life;
    for (let i = 1; i <= Math.ceil(end); i++) {
      const ddb = Math.min(book * rate, Math.max(0, book - salv)); let dep = ddb;
      if (!noSwitch && life - (i - 1) > 0) { const sl = (book - salv) / (life - (i - 1)); if (sl > ddb) dep = sl; }
      const w = Math.max(0, Math.min(end, i) - Math.max(start, i - 1)); total += dep * w; book -= dep;
    }
    return total;
  }, 'cost, salvage, life, start_period, end_period, [factor], [no_switch]', 'Returns the depreciation of an asset for any period you specify, using the variable declining balance method');

  // ---------- day counts and coupons ----------
  const ymd = (n) => DT.toYMD(n);
  const lastDay = (p) => p.d === DT.daysInMonth(p.y, p.m);
  function d360(a, b, eu) {
    const p = ymd(a), q = ymd(b); let d1 = p.d, d2 = q.d;
    if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
    else {
      const f1 = p.m === 2 && lastDay(p), f2 = q.m === 2 && lastDay(q);
      if (f1 && f2) d2 = 30; if (f1) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; if (d1 === 31) d1 = 30;
    }
    return (q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1);
  }
  const dcount = (a, b, basis) => (basis === 0 ? d360(a, b, false) : basis === 4 ? d360(a, b, true) : b - a);
  function yearBasisDays(a, b) {
    const p = ymd(a), q = ymd(b);
    if (p.y === q.y) return DT.isLeap(p.y) ? 366 : 365;
    if (q.y === p.y + 1 && (q.m < p.m || (q.m === p.m && q.d <= p.d))) { if ((DT.isLeap(p.y) && a <= DT.fromYMD(p.y, 2, 29)) || (DT.isLeap(q.y) && b >= DT.fromYMD(q.y, 2, 29))) return 366; return 365; }
    let t = 0; for (let y = p.y; y <= q.y; y++) t += DT.isLeap(y) ? 366 : 365; return t / (q.y - p.y + 1);
  }
  const yf = (a, b, basis) => (basis === 0 || basis === 4 ? dcount(a, b, basis) / 360 : basis === 2 ? (b - a) / 360 : basis === 3 ? (b - a) / 365 : (b - a) / yearBasisDays(a, b));
  const addM = (n, months, eom) => { const p = ymd(n); const t = p.y * 12 + (p.m - 1) + months; const y = Math.floor(t / 12), m = t - y * 12 + 1; const dim = DT.daysInMonth(y, m); return DT.fromYMD(y, m, eom ? dim : Math.min(p.d, dim)); };
  function coup(s, mat, freq) {
    const m = 12 / freq, eom = lastDay(ymd(mat)); let k = 1; let pcd = addM(mat, -k * m, eom);
    while (pcd > s) { k++; pcd = addM(mat, -k * m, eom); }
    return { pcd, ncd: addM(mat, -(k - 1) * m, eom), n: k };
  }
  const cDays = (c, freq, basis) => (basis === 1 ? c.ncd - c.pcd : basis === 3 ? 365 / freq : 360 / freq);
  const cBS = (c, s, basis) => dcount(c.pcd, s, basis === 0 || basis === 4 ? basis : 2);
  const cNC = (c, s, freq, basis) => (basis !== 0 && basis !== 4 ? c.ncd - s : cDays(c, freq, basis) - cBS(c, s, basis));
  const okDates = (s, m, basis) => s >= 0 && m > s && Number.isInteger(basis) && basis >= 0 && basis <= 4;
  const okFreq = (f) => f === 1 || f === 2 || f === 4;
  const cp = (name, f, desc) => R(name, 'iiiI', (s, m, fr, b) => { b = b === undefined ? 0 : b; if (!okDates(s, m, b) || !okFreq(fr)) return E.NUM; return f(coup(s, m, fr), s, fr, b); }, 'settlement, maturity, frequency, [basis]', desc);
  cp('COUPDAYBS', (c, s, f, b) => cBS(c, s, b), 'Returns the number of days from the beginning of the coupon period to the settlement date');
  cp('COUPDAYS', (c, s, f, b) => cDays(c, f, b), 'Returns the number of days in the coupon period that contains the settlement date');
  cp('COUPDAYSNC', (c, s, f, b) => cNC(c, s, f, b), 'Returns the number of days from the settlement date to the next coupon date');
  cp('COUPNCD', (c) => c.ncd, 'Returns the next coupon date after the settlement date');
  cp('COUPPCD', (c) => c.pcd, 'Returns the previous coupon date before the settlement date');
  cp('COUPNUM', (c) => c.n, 'Returns the number of coupons payable between the settlement date and maturity date');

  // ---------- bonds ----------
  function bondPrice(s, mat, rate, y, red, fr, b) {
    const c = coup(s, mat, fr), N = c.n, A = cBS(c, s, b), Ed = cDays(c, fr, b), DSC = cNC(c, s, fr, b), cf = 100 * rate / fr;
    if (N === 1) return (cf + red) / (1 + y / fr * DSC / Ed) - cf * A / Ed;
    let p = red / Math.pow(1 + y / fr, N - 1 + DSC / Ed); for (let k = 1; k <= N; k++) p += cf / Math.pow(1 + y / fr, k - 1 + DSC / Ed); return p - cf * A / Ed;
  }
  R('PRICE', 'iinnniI', (s, m, rate, y, red, fr, b) => { b = b === undefined ? 0 : b; if (!okDates(s, m, b) || !okFreq(fr) || rate < 0 || y < 0 || red <= 0) return E.NUM; return bondPrice(s, m, rate, y, red, fr, b); }, 'settlement, maturity, rate, yld, redemption, frequency, [basis]', 'Returns the price per $100 face value of a security that pays periodic interest');
  R('YIELD', 'iinnniI', (s, m, rate, pr, red, fr, b) => {
    b = b === undefined ? 0 : b; if (!okDates(s, m, b) || !okFreq(fr) || rate < 0 || pr <= 0 || red <= 0) return E.NUM;
    let lo = -fr * 0.999999, hi = 10; while (bondPrice(s, m, rate, hi, red, fr, b) > pr && hi < 1e6) hi *= 2; if (bondPrice(s, m, rate, lo, red, fr, b) < pr) return E.NUM;
    for (let i = 0; i < 300; i++) { const mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; if (bondPrice(s, m, rate, mid, red, fr, b) > pr) lo = mid; else hi = mid; } return (lo + hi) / 2;
  }, 'settlement, maturity, rate, pr, redemption, frequency, [basis]', 'Returns the yield on a security that pays periodic interest');
  function duration(s, mat, rate, y, fr, b) {
    const c = coup(s, mat, fr), Ed = cDays(c, fr, b), DSC = cNC(c, s, fr, b), cf = 100 * rate / fr; let num = 0, den = 0;
    for (let k = 1; k <= c.n; k++) { const t = k - 1 + DSC / Ed, pv = (cf + (k === c.n ? 100 : 0)) / Math.pow(1 + y / fr, t); num += t * pv; den += pv; }
    return num / den / fr;
  }
  const dur = (name, mod, desc) => R(name, 'iinniI', (s, m, rate, y, fr, b) => { b = b === undefined ? 0 : b; if (!okDates(s, m, b) || !okFreq(fr) || rate < 0 || y < 0) return E.NUM; const d = duration(s, m, rate, y, fr, b); return mod ? d / (1 + y / fr) : d; }, 'settlement, maturity, coupon, yld, frequency, [basis]', desc);
  dur('DURATION', false, 'Returns the annual duration of a security with periodic interest payments');
  dur('MDURATION', true, 'Returns the Macauley modified duration for a security with an assumed par value of $100');
  const ds = (name, spec, f, params, desc) => R(name, spec, (s, m, a, b, c, d) => { const args = [s, m, a, b, c, d]; const bi = spec.length - 1; const basis = args[bi] === undefined ? 0 : args[bi]; if (!okDates(s, m, basis)) return E.NUM; return f(s, m, a, b, c, basis); }, params, desc);
  ds('DISC', 'iinnI', (s, m, pr, red, _, b) => (pr <= 0 || red <= 0 ? E.NUM : (red - pr) / red / yf(s, m, b)), 'settlement, maturity, pr, redemption, [basis]', 'Returns the discount rate for a security');
  ds('INTRATE', 'iinnI', (s, m, inv, red, _, b) => (inv <= 0 || red <= 0 ? E.NUM : (red - inv) / inv / yf(s, m, b)), 'settlement, maturity, investment, redemption, [basis]', 'Returns the interest rate for a fully invested security');
  ds('RECEIVED', 'iinnI', (s, m, inv, d, _, b) => (inv <= 0 || d <= 0 ? E.NUM : inv / (1 - d * yf(s, m, b))), 'settlement, maturity, investment, discount, [basis]', 'Returns the amount received at maturity for a fully invested security');
  ds('PRICEDISC', 'iinnI', (s, m, d, red, _, b) => (d <= 0 || red <= 0 ? E.NUM : red - d * red * yf(s, m, b)), 'settlement, maturity, discount, redemption, [basis]', 'Returns the price per $100 face value of a discounted security');
  ds('YIELDDISC', 'iinnI', (s, m, pr, red, _, b) => (pr <= 0 || red <= 0 ? E.NUM : (red - pr) / pr / yf(s, m, b)), 'settlement, maturity, pr, redemption, [basis]', 'Returns the annual yield for a discounted security');
  R('PRICEMAT', 'iiinnI', (s, m, iss, rate, y, b) => {
    b = b === undefined ? 0 : b; if (!okDates(s, m, b) || iss > s || rate < 0 || y < 0) return E.NUM;
    return (100 + yf(iss, m, b) * rate * 100) / (1 + yf(s, m, b) * y) - yf(iss, s, b) * rate * 100;
  }, 'settlement, maturity, issue, rate, yld, [basis]', 'Returns the price per $100 face value of a security that pays interest at maturity');
  R('YIELDMAT', 'iiinnI', (s, m, iss, rate, pr, b) => {
    b = b === undefined ? 0 : b; if (!okDates(s, m, b) || iss > s || rate < 0 || pr <= 0) return E.NUM;
    const im = yf(iss, m, b), is = yf(iss, s, b), sm = yf(s, m, b); return ((1 + im * rate) / (pr / 100 + is * rate) - 1) / sm;
  }, 'settlement, maturity, issue, rate, pr, [basis]', 'Returns the annual yield of a security that pays interest at maturity');
  R('ACCRINTM', 'iinNI', (iss, s, rate, par, b) => { b = b === undefined ? 0 : b; par = par === undefined ? 1000 : par; if (iss >= s || rate <= 0 || par <= 0 || !Number.isInteger(b) || b < 0 || b > 4) return E.NUM; return par * rate * yf(iss, s, b); }, 'issue, settlement, rate, [par], [basis]', 'Returns the accrued interest for a security that pays interest at maturity');
  R('ACCRINT', 'iiinniIx', (iss, first, s, rate, par, fr, b, cm) => {
    b = b === undefined ? 0 : b; if (iss >= s || rate <= 0 || par <= 0 || !okFreq(fr) || !Number.isInteger(b) || b < 0 || b > 4) return E.NUM;
    let method = true; if (cm !== undefined) { const t = F.toBool(cm); if (isErr(t)) return t; method = t; }
    const mth = 12 / fr, eom = lastDay(ymd(first)); let j = 0, d = first; while (d > iss) { j--; d = addM(first, j * mth, eom); }
    let tot = 0; for (let i = j; ; i++) {
      const a = addM(first, i * mth, eom), z = addM(first, (i + 1) * mth, eom); if (a >= s) break;
      let lo = Math.max(iss, a), hi = Math.min(s, z); if (!method && s > first) lo = Math.max(lo, first); if (hi <= lo) continue;
      const days = dcount(lo, hi, b === 0 || b === 4 ? b : 2); const nl = b === 1 ? z - a : b === 3 ? 365 / fr : 360 / fr; tot += days / nl;
    }
    return par * rate / fr * tot;
  }, 'issue, first_interest, settlement, rate, par, frequency, [basis], [calc_method]', 'Returns the accrued interest for a security that pays periodic interest');
  const tb = (name, f, params, desc) => R(name, 'iin', (s, m, v) => { const dsm = m - s; if (s < 0 || dsm <= 0 || dsm > 365) return E.NUM; return f(dsm, v); }, params, desc);
  tb('TBILLEQ', (d, disc) => { if (disc <= 0) return E.NUM; if (d <= 182) return 365 * disc / (360 - disc * d); const P = 1 - disc * d / 360, a = d / 730 - 0.25, b = d / 365, c = (P - 1) / P; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); }, 'settlement, maturity, discount', 'Returns the bond-equivalent yield for a Treasury bill');
  tb('TBILLPRICE', (d, disc) => (disc <= 0 ? E.NUM : 100 * (1 - disc * d / 360)), 'settlement, maturity, discount', 'Returns the price per $100 face value for a Treasury bill');
  tb('TBILLYIELD', (d, pr) => (pr <= 0 ? E.NUM : (100 - pr) / pr * 360 / d), 'settlement, maturity, pr', 'Returns the yield for a Treasury bill');
})(typeof globalThis !== 'undefined' ? globalThis : this);
