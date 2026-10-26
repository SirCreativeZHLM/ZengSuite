/* ZengGrid functions: Math & Trig, engineering (base conversion, bit ops, complex, CONVERT), matrices, special functions.
   Also exports ZN.math (special functions shared with functions-stat / functions-fin) and ZN.reg (typed registration helper). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E } = ZN; const F = ZN.F; const { isErr, toNum, toStr, toBool } = F;
  const CAT = 'Math & Trig', CATE = 'Engineering';
  const M = ZN.math = ZN.math || {};

  // ---------- typed registration helper ----------
  // spec: one char per arg. n number, i integer (truncated), b boolean, s string, x raw (range/array/any). lowercase = required, UPPERCASE = optional.
  function reg(names, spec, f, params, desc, cat, extra) {
    names = [].concat(names); const min = spec.replace(/[A-Z]/g, '').length, max = spec.length; const raw = [];
    for (let i = 0; i < max; i++) if (spec[i].toLowerCase() === 'x') raw.push(i);
    ZN.fn.def(names, min, max, (...a) => {
      const v = new Array(max);
      for (let i = 0; i < max; i++) {
        let x = a[i]; const t = spec[i].toLowerCase();
        if (x === undefined) { v[i] = undefined; continue; }
        if (t === 'n' || t === 'i') { x = toNum(x); if (isErr(x)) return x; if (t === 'i') x = Math.trunc(x); }
        else if (t === 'b') { x = toBool(x); if (isErr(x)) return x; }
        else if (t === 's') { x = toStr(x); if (isErr(x)) return x; }
        v[i] = x;
      }
      const r = f(...v); return typeof r === 'number' && !isFinite(r) ? E.NUM : r;
    }, Object.assign({ lift: true, raw, cat, hint: names[0] + '(' + params + ')', desc }, extra));
  }
  ZN.reg = reg;
  const R = (n, s, f, p, d, x) => reg(n, s, f, p, d, CAT, x);
  const RE = (n, s, f, p, d, x) => reg(n, s, f, p, d, CATE, x);
  const D = (names, min, max, impl, params, desc, cat, extra) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: cat || CAT, hint: [].concat(names)[0] + '(' + params + ')', desc }, extra));

  // ---------- special functions ----------
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const HLN2PI = 0.5 * Math.log(2 * Math.PI);
  M.lgamma = function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = LG[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return HLN2PI + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  M.gamma = function gamma(x) {
    if (Number.isInteger(x) && x > 0 && x <= 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; }
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    if (x > 171.7) return Infinity;
    x -= 1; let a = LG[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    const p = Math.pow(t, (x + 0.5) / 2); return Math.sqrt(2 * Math.PI) * p * Math.exp(-t) * p * a;
  };
  const SQPI = Math.sqrt(Math.PI);
  function erfcCF(x) { let t = x; for (let k = 120; k >= 1; k--) t = x + (k / 2) / t; return Math.exp(-x * x) / SQPI / t; }
  M.erf = function (x) {
    const ax = Math.abs(x); if (ax >= 6) return x < 0 ? -1 : 1; let r;
    if (ax < 2) { let term = ax, sum = ax; const x2 = ax * ax; for (let n = 1; n < 300; n++) { term *= 2 * x2 / (2 * n + 1); sum += term; if (term < 1e-17 * sum) break; } r = 2 / SQPI * Math.exp(-x2) * sum; }
    else r = 1 - erfcCF(ax);
    return x < 0 ? -r : r;
  };
  M.erfc = function erfc(x) { if (x < 0) return 2 - erfc(-x); if (x < 2) return 1 - M.erf(x); return erfcCF(x); };
  M.ncdf = (x) => 0.5 * M.erfc(-x / Math.SQRT2);
  M.npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  M.ninv = function (p) { // p in (0,1)
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    let x, q;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { q = p - 0.5; const r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    for (let i = 0; i < 2; i++) { const e = (x < 0 ? 0.5 * M.erfc(-x / Math.SQRT2) - p : -(0.5 * M.erfc(x / Math.SQRT2) - (1 - p))); const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); }
    return x;
  };
  // regularised incomplete gamma P(a,x), Q(a,x)
  function gser(a, x) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 100000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; } return sum * Math.exp(-x + a * Math.log(x) - M.lgamma(a)); }
  function gcf(a, x) { const TINY = 1e-300; let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d; for (let i = 1; i < 100000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < TINY) d = TINY; c = b + an / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; } return Math.exp(-x + a * Math.log(x) - M.lgamma(a)) * h; }
  M.igamP = (a, x) => (x <= 0 ? 0 : x < a + 1 ? Math.min(1, gser(a, x)) : Math.max(0, 1 - gcf(a, x)));
  M.igamQ = (a, x) => (x <= 0 ? 1 : x < a + 1 ? Math.max(0, 1 - gser(a, x)) : Math.min(1, gcf(a, x)));
  // regularised incomplete beta; returns lower (I_x) or upper (1 - I_x) tail
  function betacf(x, a, b) {
    const TINY = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
    for (let m = 1; m <= 20000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  M.ibeta = function (x, a, b, upper) {
    if (x <= 0) return upper ? 1 : 0; if (x >= 1) return upper ? 0 : 1;
    const bt = Math.exp(M.lgamma(a + b) - M.lgamma(a) - M.lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    if (x < (a + 1) / (a + b + 2)) { const lo = Math.min(1, bt * betacf(x, a, b) / a); return upper ? 1 - lo : lo; }
    const up = Math.min(1, bt * betacf(1 - x, b, a) / b); return upper ? up : 1 - up;
  };
  // invert an increasing cdf / decreasing sf on [lo, hi] (hi expanded if expand)
  M.invInc = (cdf, p, lo, hi, expand) => { if (expand) { while (cdf(hi) < p && hi < 1e300) hi *= 2; } for (let i = 0; i < 400; i++) { const mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; if (cdf(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  M.invDec = (sf, q, lo, hi, expand) => { if (expand) { while (sf(hi) > q && hi < 1e300) hi *= 2; } for (let i = 0; i < 400; i++) { const mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; if (sf(mid) > q) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  M.lbeta = (a, b) => M.lgamma(a) + M.lgamma(b) - M.lgamma(a + b);
  M.lcomb = (n, k) => M.lgamma(n + 1) - M.lgamma(k + 1) - M.lgamma(n - k + 1);
  M.combin = (n, k) => { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r < 9e15 ? Math.round(r) : r; };

  // ---------- rounding ----------
  const shift = (x, d) => { const m = /^(-?[\d.]+)(?:e([+-]?\d+))?$/.exec(String(x)); return +(m[1] + 'e' + ((m[2] ? +m[2] : 0) + d)); };
  const n15 = (x) => +x.toPrecision(15);
  function round(x, d, mode) { // mode 0 half away from zero, 1 up (away from zero), 2 down (toward zero)
    d = Math.trunc(d); if (x === 0 || !isFinite(x)) return x; if (d > 300) return x; if (d < -300) return 0;
    const s = x < 0 ? -1 : 1, a = n15(Math.abs(x)); const t = shift(a, d);
    const r = mode === 0 ? Math.round(t) : mode === 1 ? Math.ceil(t) : Math.floor(t);
    const out = s * shift(r, -d); return out === 0 ? 0 : out;
  }
  M.round = round;
  const snap = (q) => { const r = Math.round(q); return Math.abs(q - r) < 1e-12 * Math.max(1, Math.abs(q)) ? r : q; };
  const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

  // ---------- SUM and friends (range-aware) ----------
  D('SUM', 1, 255, (...a) => { let s = 0; const e = F.eachNum(a, (n) => { s += n; }); return e || s; }, 'number1, [number2], …', 'Adds all the numbers in a range of cells', CAT, { errs: false });
  D('PRODUCT', 1, 255, (...a) => { let p = 1, any = false; const e = F.eachNum(a, (n) => { p *= n; any = true; }); return e || (any ? p : 0); }, 'number1, [number2], …', 'Multiplies all the numbers given as arguments');
  D('SUMSQ', 1, 255, (...a) => { let s = 0; const e = F.eachNum(a, (n) => { s += n * n; }); return e || s; }, 'number1, [number2], …', 'Returns the sum of the squares of the arguments');
  function pairs(x, y) {
    const a = F.flat(x), b = F.flat(y); if (a.length !== b.length) return E.NA; const out = [];
    for (let i = 0; i < a.length; i++) { if (isErr(a[i])) return a[i]; if (isErr(b[i])) return b[i]; if (typeof a[i] === 'number' && typeof b[i] === 'number') out.push([a[i], b[i]]); }
    return out;
  }
  M.pairs = pairs;
  const pairFn = (name, f, desc) => D(name, 2, 2, (x, y) => { const p = pairs(x, y); if (isErr(p)) return p; let s = 0; for (const [u, v] of p) s += f(u, v); return s; }, 'array_x, array_y', desc);
  pairFn('SUMX2MY2', (x, y) => x * x - y * y, 'Returns the sum of the difference of squares of corresponding values in two arrays');
  pairFn('SUMX2PY2', (x, y) => x * x + y * y, 'Returns the sum of the sum of squares of corresponding values in two arrays');
  pairFn('SUMXMY2', (x, y) => (x - y) * (x - y), 'Returns the sum of squares of differences of corresponding values in two arrays');
  D('SERIESSUM', 4, 4, (x, n, m, c) => { x = toNum(x); n = toNum(n); m = toNum(m); if (isErr(x)) return x; if (isErr(n)) return n; if (isErr(m)) return m; const co = F.flat(c); let s = 0; for (let i = 0; i < co.length; i++) { if (isErr(co[i])) return co[i]; if (typeof co[i] !== 'number') return E.VALUE; s += co[i] * Math.pow(x, n + i * m); } return s; }, 'x, n, m, coefficients', 'Returns the sum of a power series based on the formula');

  // ---------- basic math ----------
  R('ABS', 'n', Math.abs, 'number', 'Returns the absolute value of a number');
  R('SIGN', 'n', sgn, 'number', 'Returns the sign of a number');
  R('SQRT', 'n', (x) => (x < 0 ? E.NUM : Math.sqrt(x)), 'number', 'Returns a positive square root');
  R('SQRTPI', 'n', (x) => (x < 0 ? E.NUM : Math.sqrt(x * Math.PI)), 'number', 'Returns the square root of (number * pi)');
  R('POWER', 'nn', (a, b) => { if (a === 0 && b === 0) return E.NUM; if (a === 0 && b < 0) return E.DIV0; const r = Math.pow(a, b); return isNaN(r) ? E.NUM : r; }, 'number, power', 'Returns the result of a number raised to a power');
  R('EXP', 'n', Math.exp, 'number', 'Returns e raised to the power of a given number');
  R('LN', 'n', (x) => (x <= 0 ? E.NUM : Math.log(x)), 'number', 'Returns the natural logarithm of a number');
  R('LOG', 'nN', (x, b) => { if (b === undefined) b = 10; if (x <= 0 || b <= 0) return E.NUM; if (b === 1) return E.DIV0; return Math.log(x) / Math.log(b); }, 'number, [base]', 'Returns the logarithm of a number to a specified base');
  R('LOG10', 'n', (x) => (x <= 0 ? E.NUM : Math.log10(x)), 'number', 'Returns the base-10 logarithm of a number');
  R('MOD', 'nn', (n, d) => { if (d === 0) return E.DIV0; let r = n % d; if (r !== 0 && (r < 0) !== (d < 0)) r += d; return r; }, 'number, divisor', 'Returns the remainder after a number is divided by a divisor');
  R('QUOTIENT', 'nn', (n, d) => (d === 0 ? E.DIV0 : Math.trunc(n / d)), 'numerator, denominator', 'Returns the integer portion of a division');
  R('INT', 'n', Math.floor, 'number', 'Rounds a number down to the nearest integer');
  R('TRUNC', 'nI', (x, d) => round(x, d === undefined ? 0 : d, 2), 'number, [num_digits]', 'Truncates a number to an integer or given digits');
  R('ROUND', 'ni', (x, d) => round(x, d, 0), 'number, num_digits', 'Rounds a number to a specified number of digits');
  R('ROUNDUP', 'ni', (x, d) => round(x, d, 1), 'number, num_digits', 'Rounds a number up, away from zero');
  R('ROUNDDOWN', 'ni', (x, d) => round(x, d, 2), 'number, num_digits', 'Rounds a number down, toward zero');
  R('MROUND', 'nn', (n, m) => { if (m === 0) return 0; if (n * m < 0) return E.NUM; return round(n / m, 0, 0) * m; }, 'number, multiple', 'Returns a number rounded to the desired multiple');
  R('CEILING', 'nn', (n, s) => { if (s === 0) return 0; if (n > 0 && s < 0) return E.NUM; return Math.ceil(snap(n / s)) * s; }, 'number, significance', 'Rounds a number up to the nearest multiple of significance');
  R('FLOOR', 'nn', (n, s) => { if (s === 0) return E.DIV0; if (n > 0 && s < 0) return E.NUM; return Math.floor(snap(n / s)) * s; }, 'number, significance', 'Rounds a number down to the nearest multiple of significance');
  R('CEILING.MATH', 'nNN', (n, s, mode) => { s = s === undefined ? 1 : Math.abs(s); if (s === 0 || n === 0) return 0; if (n > 0 || !mode) return Math.ceil(snap(n / s)) * s; return -Math.ceil(snap(-n / s)) * s; }, 'number, [significance], [mode]', 'Rounds a number up, to the nearest integer or multiple of significance');
  R('FLOOR.MATH', 'nNN', (n, s, mode) => { s = s === undefined ? 1 : Math.abs(s); if (s === 0 || n === 0) return 0; if (n > 0 || !mode) return Math.floor(snap(n / s)) * s; return -Math.floor(snap(-n / s)) * s; }, 'number, [significance], [mode]', 'Rounds a number down, to the nearest integer or multiple of significance');
  R(['CEILING.PRECISE', 'ISO.CEILING'], 'nN', (n, s) => { s = s === undefined ? 1 : Math.abs(s); return s === 0 ? 0 : Math.ceil(snap(n / s)) * s; }, 'number, [significance]', 'Rounds a number up to the nearest integer or multiple of significance, regardless of sign');
  R('FLOOR.PRECISE', 'nN', (n, s) => { s = s === undefined ? 1 : Math.abs(s); return s === 0 ? 0 : Math.floor(snap(n / s)) * s; }, 'number, [significance]', 'Rounds a number down to the nearest integer or multiple of significance, regardless of sign');
  R('EVEN', 'n', (x) => { const r = Math.ceil(snap(Math.abs(x) / 2)) * 2; return x < 0 ? -r : r; }, 'number', 'Rounds a number up to the nearest even integer');
  R('ODD', 'n', (x) => { let c = Math.ceil(snap(Math.abs(x))); if (c % 2 === 0) c++; return x < 0 ? -c : c; }, 'number', 'Rounds a number up to the nearest odd integer');
  R('FACT', 'i', (n) => { if (n < 0 || n > 170) return E.NUM; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }, 'number', 'Returns the factorial of a number');
  R('FACTDOUBLE', 'i', (n) => { if (n < -1) return E.NUM; let r = 1; for (let i = n; i > 1; i -= 2) r *= i; return r; }, 'number', 'Returns the double factorial of a number');
  const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
  const intList = (a) => { const v = F.nums(a); if (isErr(v)) return v; for (let i = 0; i < v.length; i++) { v[i] = Math.trunc(v[i]); if (v[i] < 0 || v[i] > 9007199254740991) return E.NUM; } return v; };
  D('GCD', 1, 255, (...a) => { const v = intList(a); if (isErr(v)) return v; let g = 0; for (const x of v) g = gcd(g, x); return g; }, 'number1, [number2], …', 'Returns the greatest common divisor');
  D('LCM', 1, 255, (...a) => { const v = intList(a); if (isErr(v)) return v; let l = 1; for (const x of v) { if (x === 0) return 0; l = l / gcd(l, x) * x; } return l; }, 'number1, [number2], …', 'Returns the least common multiple');
  R('COMBIN', 'ii', (n, k) => (n < 0 || k < 0 || k > n ? E.NUM : M.combin(n, k)), 'number, number_chosen', 'Returns the number of combinations for a given number of items');
  R('COMBINA', 'ii', (n, k) => { if (n < 0 || k < 0) return E.NUM; if (n === 0) return k === 0 ? 1 : 0; return M.combin(n + k - 1, k); }, 'number, number_chosen', 'Returns the number of combinations with repetitions');
  R('PERMUT', 'ii', (n, k) => { if (n <= 0 || k < 0 || k > n) return E.NUM; let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; }, 'number, number_chosen', 'Returns the number of permutations for a given number of objects', { cat: 'Statistical' });
  R('PERMUTATIONA', 'ii', (n, k) => (n < 0 || k < 0 ? E.NUM : Math.pow(n, k)), 'number, number_chosen', 'Returns the number of permutations with repetitions', { cat: 'Statistical' });
  D('MULTINOMIAL', 1, 255, (...a) => { const v = intList(a); if (isErr(v)) return v; let s = 0, r = 1; for (const x of v) { s += x; r *= M.combin(s, x); } return r; }, 'number1, [number2], …', 'Returns the multinomial of a set of numbers');
  R('PI', '', () => Math.PI, '', 'Returns the value of pi');
  D('RAND', 0, 0, () => ZN.rand(), '', 'Returns a random number between 0 and 1', CAT, { volatile: true });
  D('RANDBETWEEN', 2, 2, (a, b) => { a = toNum(a); b = toNum(b); if (isErr(a)) return a; if (isErr(b)) return b; const lo = Math.ceil(a), hi = Math.floor(b); if (lo > hi) return E.NUM; return lo + Math.floor(ZN.rand() * (hi - lo + 1)); }, 'bottom, top', 'Returns a random integer between the numbers you specify', CAT, { volatile: true, lift: true });

  // ---------- trig ----------
  const BIGT = 134217728; const tr = (f, lim) => (x) => (lim && Math.abs(x) >= BIGT ? E.NUM : f(x));
  R('SIN', 'n', tr(Math.sin, 1), 'number', 'Returns the sine of the given angle');
  R('COS', 'n', tr(Math.cos, 1), 'number', 'Returns the cosine of the given angle');
  R('TAN', 'n', tr(Math.tan, 1), 'number', 'Returns the tangent of the given angle');
  R('ASIN', 'n', (x) => (Math.abs(x) > 1 ? E.NUM : Math.asin(x)), 'number', 'Returns the arcsine of a number');
  R('ACOS', 'n', (x) => (Math.abs(x) > 1 ? E.NUM : Math.acos(x)), 'number', 'Returns the arccosine of a number');
  R('ATAN', 'n', Math.atan, 'number', 'Returns the arctangent of a number');
  R('ATAN2', 'nn', (x, y) => (x === 0 && y === 0 ? E.DIV0 : Math.atan2(y, x)), 'x_num, y_num', 'Returns the arctangent from x- and y-coordinates');
  R('SINH', 'n', Math.sinh, 'number', 'Returns the hyperbolic sine of a number');
  R('COSH', 'n', Math.cosh, 'number', 'Returns the hyperbolic cosine of a number');
  R('TANH', 'n', Math.tanh, 'number', 'Returns the hyperbolic tangent of a number');
  R('ASINH', 'n', Math.asinh, 'number', 'Returns the inverse hyperbolic sine of a number');
  R('ACOSH', 'n', (x) => (x < 1 ? E.NUM : Math.acosh(x)), 'number', 'Returns the inverse hyperbolic cosine of a number');
  R('ATANH', 'n', (x) => (Math.abs(x) >= 1 ? E.NUM : Math.atanh(x)), 'number', 'Returns the inverse hyperbolic tangent of a number');
  R('SEC', 'n', tr((x) => 1 / Math.cos(x), 1), 'number', 'Returns the secant of an angle');
  R('CSC', 'n', (x) => (x === 0 || Math.abs(x) >= BIGT ? (x === 0 ? E.DIV0 : E.NUM) : 1 / Math.sin(x)), 'number', 'Returns the cosecant of an angle');
  R('COT', 'n', (x) => (x === 0 ? E.DIV0 : Math.abs(x) >= BIGT ? E.NUM : 1 / Math.tan(x)), 'number', 'Returns the cotangent of an angle');
  R('SECH', 'n', (x) => 1 / Math.cosh(x), 'number', 'Returns the hyperbolic secant of an angle');
  R('CSCH', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.sinh(x)), 'number', 'Returns the hyperbolic cosecant of an angle');
  R('COTH', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.tanh(x)), 'number', 'Returns the hyperbolic cotangent of a number');
  R('ASEC', 'n', (x) => (Math.abs(x) < 1 ? E.NUM : Math.acos(1 / x)), 'number', 'Returns the arcsecant of a number');
  R('ACSC', 'n', (x) => (Math.abs(x) < 1 ? E.NUM : Math.asin(1 / x)), 'number', 'Returns the arccosecant of a number');
  R('ACOT', 'n', (x) => Math.PI / 2 - Math.atan(x), 'number', 'Returns the arccotangent of a number');
  R('ACOTH', 'n', (x) => (Math.abs(x) <= 1 ? E.NUM : 0.5 * Math.log((x + 1) / (x - 1))), 'number', 'Returns the hyperbolic arccotangent of a number');
  R('DEGREES', 'n', (x) => x * 180 / Math.PI, 'angle', 'Converts radians to degrees');
  R('RADIANS', 'n', (x) => x * Math.PI / 180, 'angle', 'Converts degrees to radians');

  // ---------- ROMAN / ARABIC / BASE / DECIMAL ----------
  function roman(n, mode) {
    const ch = 'MDCLXVI', val = [1000, 500, 100, 50, 10, 5, 1]; let r = '', v = n;
    for (let i = 0; i <= 3; i++) {
      const idx = i * 2, dig = Math.floor(v / val[idx]);
      if (dig % 5 === 4) {
        const idx2 = dig === 4 ? idx - 1 : idx - 2; let steps = 0, ix = idx;
        while (steps < mode && ix < 6) { steps++; if (val[idx2] - val[ix + 1] <= v) ix++; else steps = mode; }
        r += ch[ix] + ch[idx2]; v = v + val[ix] - val[idx2];
      } else { let d = dig; if (d > 4) { r += ch[idx - 1]; d -= 5; } for (let j = 0; j < d; j++) r += ch[idx]; v %= val[idx]; }
    }
    return r;
  }
  R('ROMAN', 'nX', (n, form) => {
    let mode = 0; if (form !== undefined) { if (typeof form === 'boolean') mode = form ? 0 : 4; else { const f = toNum(form); if (isErr(f)) return f; if (f < 0 || f > 4) return E.VALUE; mode = Math.trunc(f); } }
    n = Math.trunc(n); if (n < 0 || n > 3999) return E.VALUE; return n === 0 ? '' : roman(n, mode);
  }, 'number, [form]', 'Converts an Arabic numeral to Roman, as text');
  R('ARABIC', 's', (s) => {
    s = s.trim().toUpperCase(); let neg = false; if (s[0] === '-') { neg = true; s = s.slice(1); } if (s === '') return 0;
    const m = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }; let t = 0;
    for (let i = 0; i < s.length; i++) { const a = m[s[i]]; if (!a) return E.VALUE; const b = m[s[i + 1]] || 0; t += a < b ? -a : a; }
    return neg ? -t : t;
  }, 'text', 'Converts a Roman numeral to Arabic, as a number');
  R('BASE', 'iiI', (n, radix, min) => { if (n < 0 || n >= 9007199254740992 || radix < 2 || radix > 36 || (min !== undefined && (min < 0 || min > 255))) return E.NUM; return n.toString(radix).toUpperCase().padStart(min || 0, '0'); }, 'number, radix, [min_length]', 'Converts a number into a text representation with the given radix (base)');
  R('DECIMAL', 'si', (s, radix) => {
    if (radix < 2 || radix > 36) return E.NUM; s = s.trim(); if (s === '') return 0; let v = 0;
    for (const c of s.toUpperCase()) { const d = parseInt(c, 36); if (isNaN(d) || d >= radix) return E.NUM; v = v * radix + d; } return v;
  }, 'text, radix', 'Converts a text representation of a number in a given base into a decimal number');

  // ---------- base conversions (two's complement on 10 digits) ----------
  const BITS = { 2: 10, 8: 30, 16: 40 }, RX = { 2: /^[01]+$/, 8: /^[0-7]+$/, 16: /^[0-9a-f]+$/i };
  function parseBase(v, radix) {
    if (typeof v === 'boolean') return E.VALUE; let s;
    if (typeof v === 'number') { if (v < 0 || !Number.isInteger(v)) return E.NUM; s = String(v); } else { s = toStr(v); if (isErr(s)) return s; }
    if (s === '') return 0; if (s.length > 10 || !RX[radix].test(s)) return E.NUM;
    let n = parseInt(s, radix); const bits = BITS[radix]; if (s.length === 10 && n >= Math.pow(2, bits - 1)) n -= Math.pow(2, bits); return n;
  }
  function fmtBase(n, radix, places) {
    const bits = BITS[radix], lim = Math.pow(2, bits - 1); if (n < -lim || n >= lim) return E.NUM;
    if (n < 0) return (n + Math.pow(2, bits)).toString(radix).toUpperCase();
    let s = n.toString(radix).toUpperCase();
    if (places !== undefined) { places = Math.trunc(places); if (places <= 0 || s.length > places) return E.NUM; s = s.padStart(places, '0'); } return s;
  }
  const BN = { BIN: 2, OCT: 8, HEX: 16 };
  for (const a in BN) {
    const nm = { BIN: 'binary', OCT: 'octal', HEX: 'hexadecimal' };
    RE(a + '2DEC', 'x', (v) => parseBase(v, BN[a]), 'number', 'Converts a ' + nm[a] + ' number to decimal');
    RE('DEC2' + a, 'xI', (v, p) => { const n = toNum(v); if (isErr(n)) return n; return fmtBase(Math.trunc(n), BN[a], p); }, 'number, [places]', 'Converts a decimal number to ' + nm[a]);
    for (const b in BN) if (a !== b) RE(a + '2' + b, 'xI', (v, p) => { const n = parseBase(v, BN[a]); if (isErr(n)) return n; return fmtBase(n, BN[b], p); }, 'number, [places]', 'Converts a ' + nm[a] + ' number to ' + nm[b]);
  }
  const big = (x) => BigInt(x), LIM48 = Math.pow(2, 48);
  const bitOp = (name, op, desc) => RE(name, 'nn', (a, b) => (a < 0 || b < 0 || a !== Math.floor(a) || b !== Math.floor(b) || a >= LIM48 || b >= LIM48 ? E.NUM : Number(op(big(a), big(b)))), 'number1, number2', desc);
  bitOp('BITAND', (a, b) => a & b, 'Returns a bitwise AND of two numbers');
  bitOp('BITOR', (a, b) => a | b, 'Returns a bitwise OR of two numbers');
  bitOp('BITXOR', (a, b) => a ^ b, 'Returns a bitwise XOR of two numbers');
  const shiftFn = (left) => (n, s) => { if (n < 0 || n !== Math.floor(n) || n >= LIM48 || Math.abs(s) > 53) return E.NUM; s = Math.trunc(s); const l = left ? s >= 0 : s < 0; const k = BigInt(Math.abs(s)); const r = l ? big(n) << k : big(n) >> k; return r >= BigInt(LIM48) ? E.NUM : Number(r); };
  RE('BITLSHIFT', 'nn', shiftFn(true), 'number, shift_amount', 'Returns a value number shifted left by shift_amount bits');
  RE('BITRSHIFT', 'nn', shiftFn(false), 'number, shift_amount', 'Returns a value number shifted right by shift_amount bits');
  RE('DELTA', 'nN', (a, b) => (a === (b === undefined ? 0 : b) ? 1 : 0), 'number1, [number2]', 'Tests whether two values are equal');
  RE('GESTEP', 'nN', (a, b) => (a >= (b === undefined ? 0 : b) ? 1 : 0), 'number, [step]', 'Tests whether a number is greater than a threshold value');
  RE(['ERF'], 'nN', (a, b) => (b === undefined ? M.erf(a) : M.erf(b) - M.erf(a)), 'lower_limit, [upper_limit]', 'Returns the error function');
  RE('ERF.PRECISE', 'n', M.erf, 'x', 'Returns the error function');
  RE(['ERFC', 'ERFC.PRECISE'], 'n', M.erfc, 'x', 'Returns the complementary error function');
  R('GAMMA', 'n', (x) => { if (x <= 0 && Number.isInteger(x)) return E.NUM; const r = M.gamma(x); return isFinite(r) ? r : E.NUM; }, 'number', 'Returns the gamma function value', { cat: 'Statistical' });
  R(['GAMMALN', 'GAMMALN.PRECISE'], 'n', (x) => (x <= 0 ? E.NUM : M.lgamma(x)), 'x', 'Returns the natural logarithm of the gamma function', { cat: 'Statistical' });

  // ---------- matrices ----------
  function mat(v) { const a = F.toArr2(v); const o = []; for (const row of a) { const r = []; for (const x of row) { if (isErr(x)) return x; if (typeof x !== 'number') return E.VALUE; r.push(x); } o.push(r); } return o.length && o[0].length ? o : E.VALUE; }
  D('MMULT', 2, 2, (a, b) => { a = mat(a); if (isErr(a)) return a; b = mat(b); if (isErr(b)) return b; if (a[0].length !== b.length) return E.VALUE; const n = a.length, m = b[0].length, k = b.length; const o = []; for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < m; j++) { let s = 0; for (let t = 0; t < k; t++) s += a[i][t] * b[t][j]; r.push(s); } o.push(r); } return o; }, 'array1, array2', 'Returns the matrix product of two arrays');
  D('MDETERM', 1, 1, (a) => {
    a = mat(a); if (isErr(a)) return a; const n = a.length; if (a[0].length !== n) return E.VALUE;
    const m = a.map((r) => r.slice()); let det = 1; const ints = a.every((r) => r.every(Number.isInteger));
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; if (m[p][c] === 0) return 0; if (p !== c) { [m[p], m[c]] = [m[c], m[p]]; det = -det; } det *= m[c][c]; for (let r = c + 1; r < n; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k < n; k++) m[r][k] -= f * m[c][k]; } }
    return ints && Math.abs(det - Math.round(det)) < 1e-9 * Math.max(1, Math.abs(det)) ? Math.round(det) : det;
  }, 'array', 'Returns the matrix determinant of an array');
  D('MINVERSE', 1, 1, (a) => {
    a = mat(a); if (isErr(a)) return a; const n = a.length; if (a[0].length !== n) return E.VALUE;
    const m = a.map((r, i) => r.concat(r.map((_, j) => (i === j ? 1 : 0)))); let scale = 0; for (const r of a) for (const x of r) scale = Math.max(scale, Math.abs(x));
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; if (Math.abs(m[p][c]) <= 1e-14 * scale) return E.NUM; [m[p], m[c]] = [m[c], m[p]]; const d = m[c][c]; for (let k = 0; k < 2 * n; k++) m[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = m[r][c]; if (f !== 0) for (let k = 0; k < 2 * n; k++) m[r][k] -= f * m[c][k]; } }
    return m.map((r) => r.slice(n));
  }, 'array', 'Returns the matrix inverse of an array');
  R('MUNIT', 'i', (n) => { if (n < 1 || n > 1000) return E.VALUE; const o = []; for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0); o.push(r); } return o; }, 'dimension', 'Returns the unit matrix for the specified dimension');

  // ---------- complex numbers ----------
  const NUMP = '(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const RE_RE = new RegExp('^([+-]?' + NUMP + ')$'), RE_IM = new RegExp('^([+-]?)(' + NUMP + ')?([ij])$'), RE_BOTH = new RegExp('^([+-]?' + NUMP + ')([+-])(' + NUMP + ')?([ij])$');
  function pc(v) {
    if (isErr(v)) return v; if (typeof v === 'number') return { re: v, im: 0, suf: 'i' }; if (typeof v === 'boolean') return E.VALUE;
    const s = toStr(v); let m;
    if ((m = RE_RE.exec(s))) return { re: parseFloat(m[1]), im: 0, suf: 'i' };
    if ((m = RE_IM.exec(s))) return { re: 0, im: (m[1] === '-' ? -1 : 1) * (m[2] === undefined ? 1 : parseFloat(m[2])), suf: m[3] };
    if ((m = RE_BOTH.exec(s))) return { re: parseFloat(m[1]), im: (m[2] === '-' ? -1 : 1) * (m[3] === undefined ? 1 : parseFloat(m[3])), suf: m[4] };
    return E.NUM;
  }
  function fc(re, im, suf) {
    suf = suf || 'i'; if (!isFinite(re) || !isFinite(im)) return E.NUM; const r = ZN.numToStr(re); if (im === 0) return r;
    const a = Math.abs(im); const m = a === 1 ? '' : ZN.numToStr(a);
    if (re === 0) return (im < 0 ? '-' : '') + m + suf; return r + (im < 0 ? '-' : '+') + m + suf;
  }
  const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
  const cabs = (a) => Math.hypot(a.re, a.im);
  const cexp = (a) => { const e = Math.exp(a.re); return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) }; };
  const cln = (a) => ({ re: Math.log(cabs(a)), im: Math.atan2(a.im, a.re) });
  const cpow = (z, n) => {
    if (z.re === 0 && z.im === 0) return n > 0 ? { re: 0, im: 0 } : null;
    if (Number.isInteger(n) && Math.abs(n) <= 1024) { let r = { re: 1, im: 0 }, b = z, k = Math.abs(n); while (k) { if (k & 1) r = cmul(r, b); b = cmul(b, b); k >>= 1; } return n < 0 ? cdiv({ re: 1, im: 0 }, r) : r; }
    const rho = Math.pow(cabs(z), n), th = Math.atan2(z.im, z.re) * n; return { re: rho * Math.cos(th), im: rho * Math.sin(th) };
  };
  const csqrt = (z) => { const r = cabs(z); const re = Math.sqrt((r + z.re) / 2); const im = Math.sqrt(Math.max(0, (r - z.re) / 2)); return { re, im: z.im < 0 ? -im : im }; };
  const im1 = (name, f, desc) => RE(name, 'x', (v) => { const z = pc(scalarOf(v)); if (isErr(z)) return z; const r = f(z); return isErr(r) ? r : fc(r.re, r.im, z.suf); }, 'inumber', desc);
  const scalarOf = (v) => F.scalar(v);
  RE('COMPLEX', 'nnX', (re, im, suf) => { if (suf === undefined || suf === '') suf = 'i'; if (suf !== 'i' && suf !== 'j') return E.VALUE; return fc(re, im, suf); }, 'real_num, i_num, [suffix]', 'Converts real and imaginary coefficients into a complex number');
  const imNum = (name, f, desc) => RE(name, 'x', (v) => { const z = pc(scalarOf(v)); if (isErr(z)) return z; return f(z); }, 'inumber', desc);
  imNum('IMABS', cabs, 'Returns the absolute value (modulus) of a complex number');
  imNum('IMREAL', (z) => z.re, 'Returns the real coefficient of a complex number');
  imNum('IMAGINARY', (z) => z.im, 'Returns the imaginary coefficient of a complex number');
  imNum('IMARGUMENT', (z) => (z.re === 0 && z.im === 0 ? E.DIV0 : Math.atan2(z.im, z.re)), 'Returns the argument theta, an angle expressed in radians');
  im1('IMCONJUGATE', (z) => ({ re: z.re, im: -z.im }), 'Returns the complex conjugate of a complex number');
  im1('IMEXP', cexp, 'Returns the exponential of a complex number');
  im1('IMLN', (z) => (z.re === 0 && z.im === 0 ? E.NUM : cln(z)), 'Returns the natural logarithm of a complex number');
  im1('IMLOG10', (z) => { if (z.re === 0 && z.im === 0) return E.NUM; const l = cln(z); return { re: l.re / Math.LN10, im: l.im / Math.LN10 }; }, 'Returns the base-10 logarithm of a complex number');
  im1('IMLOG2', (z) => { if (z.re === 0 && z.im === 0) return E.NUM; const l = cln(z); return { re: l.re / Math.LN2, im: l.im / Math.LN2 }; }, 'Returns the base-2 logarithm of a complex number');
  im1('IMSQRT', csqrt, 'Returns the square root of a complex number');
  im1('IMSIN', (z) => ({ re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) }), 'Returns the sine of a complex number');
  im1('IMCOS', (z) => ({ re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) }), 'Returns the cosine of a complex number');
  im1('IMSINH', (z) => ({ re: Math.sinh(z.re) * Math.cos(z.im), im: Math.cosh(z.re) * Math.sin(z.im) }), 'Returns the hyperbolic sine of a complex number');
  im1('IMCOSH', (z) => ({ re: Math.cosh(z.re) * Math.cos(z.im), im: Math.sinh(z.re) * Math.sin(z.im) }), 'Returns the hyperbolic cosine of a complex number');
  RE('IMPOWER', 'xn', (v, n) => { const z = pc(scalarOf(v)); if (isErr(z)) return z; const r = cpow(z, n); return r ? fc(r.re, r.im, z.suf) : E.NUM; }, 'inumber, number', 'Returns a complex number raised to an integer or fractional power');
  const imBin = (name, f, desc) => RE(name, 'xx', (a, b) => { const x = pc(scalarOf(a)), y = pc(scalarOf(b)); if (isErr(x)) return x; if (isErr(y)) return y; const r = f(x, y); return isErr(r) ? r : fc(r.re, r.im, x.suf); }, 'inumber1, inumber2', desc);
  imBin('IMSUB', (a, b) => ({ re: a.re - b.re, im: a.im - b.im }), 'Returns the difference of two complex numbers');
  imBin('IMDIV', (a, b) => (b.re === 0 && b.im === 0 ? E.NUM : cdiv(a, b)), 'Returns the quotient of two complex numbers');
  const imList = (name, f, id, desc) => D(name, 1, 255, (...a) => {
    let acc = id, suf = null;
    for (const x of F.flat(a)) { if (x == null) continue; const z = pc(x); if (isErr(z)) return z; if (!suf) suf = z.suf; acc = f(acc, z); }
    return fc(acc.re, acc.im, suf || 'i');
  }, 'inumber1, [inumber2], …', desc, CATE);
  imList('IMSUM', (a, b) => ({ re: a.re + b.re, im: a.im + b.im }), { re: 0, im: 0 }, 'Returns the sum of complex numbers');
  imList('IMPRODUCT', cmul, { re: 1, im: 0 }, 'Returns the product of complex numbers');

  // ---------- CONVERT ----------
  const PRE = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 10, e: 10, d: 0.1, c: 0.01, m: 0.001, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24 };
  const BPRE = { Yi: Math.pow(2, 80), Zi: Math.pow(2, 70), Ei: Math.pow(2, 60), Pi: Math.pow(2, 50), Ti: Math.pow(2, 40), Gi: Math.pow(2, 30), Mi: Math.pow(2, 20), ki: 1024 };
  const UNITS = {};
  const defU = (cat, map, metric, binary) => { for (const k in map) UNITS[k] = { c: cat, f: map[k], m: !!metric && metric.split(' ').includes(k), b: !!binary }; };
  defU('mass', { g: 1, sg: 14593.9029372064, lbm: 453.59237, u: 1.660538782e-24, ozm: 28.349523125, grain: 0.06479891, cwt: 45359.237, shweight: 45359.237, uk_cwt: 50802.34544, lcwt: 50802.34544, hweight: 50802.34544, stone: 6350.29318, ton: 907184.74, uk_ton: 1016046.9088, LTON: 1016046.9088, brton: 1016046.9088 }, 'g u');
  defU('time', { yr: 31557600, day: 86400, d: 86400, hr: 3600, mn: 60, min: 60, sec: 1, s: 1 }, 'sec s');
  defU('dist', { m: 1, mi: 1609.344, Nmi: 1852, in: 0.0254, ft: 0.3048, yd: 0.9144, ang: 1e-10, ell: 1.143, ly: 9.4607304725808e15, parsec: 3.08567758128155e16, pc: 3.08567758128155e16, Pica: 0.0254 / 72, pica: 0.0254 / 6 }, 'm ang ly parsec pc');
  defU('pressure', { Pa: 1, p: 1, atm: 101325, at: 101325, mmHg: 133.322368421053, psi: 6894.757293168, Torr: 133.322368421053 }, 'Pa p atm at mmHg Torr');
  defU('force', { N: 1, dyn: 1e-5, dy: 1e-5, lbf: 4.4482216152605, pond: 0.00980665 }, 'N dyn dy pond');
  defU('energy', { J: 1, e: 1e-7, c: 4.184, cal: 4.1868, eV: 1.602176487e-19, ev: 1.602176487e-19, HPh: 2684519.537696172792, hh: 2684519.537696172792, Wh: 3600, wh: 3600, flb: 1.3558179483314004, BTU: 1055.05585262, btu: 1055.05585262 }, 'J e c cal eV ev Wh wh');
  defU('power', { W: 1, w: 1, HP: 745.69987158227022, h: 745.69987158227022, PS: 735.49875 }, 'W w');
  defU('magnet', { T: 1, ga: 1e-4 }, 'T ga');
  defU('volume', { l: 1, L: 1, lt: 1, tsp: 0.00492892159375, tspm: 0.005, tbs: 0.01478676478125, oz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, us_pt: 0.473176473, uk_pt: 0.56826125, qt: 0.946352946, uk_qt: 1.1365225, gal: 3.785411784, uk_gal: 4.54609, 'ang3': 1e-27, 'ang^3': 1e-27, barrel: 158.987294928, bushel: 35.23907016688, in3: 0.016387064, 'in^3': 0.016387064, ft3: 28.316846592, 'ft^3': 28.316846592, yd3: 764.554857984, 'yd^3': 764.554857984, m3: 1000, 'm^3': 1000, mi3: 4168181825440.579584, 'mi^3': 4168181825440.579584, Nmi3: 6352182208000, 'Nmi^3': 6352182208000, ly3: 8.466786965780e50, 'ly^3': 8.466786965780e50, GRT: 2831.6846592, regton: 2831.6846592, MTON: 1132.6738637 }, 'l L lt ang3 ang^3 m3 m^3');
  defU('area', { m2: 1, 'm^2': 1, in2: 0.00064516, 'in^2': 0.00064516, ft2: 0.09290304, 'ft^2': 0.09290304, yd2: 0.83612736, 'yd^2': 0.83612736, mi2: 2589988.110336, 'mi^2': 2589988.110336, Nmi2: 3429904, 'Nmi^2': 3429904, ar: 100, ha: 10000, ang2: 1e-20, 'ang^2': 1e-20, uk_acre: 4046.8564224, us_acre: 4046.8726098742514, ly2: 8.95054210748189e31, 'ly^2': 8.95054210748189e31, Pica2: Math.pow(0.0254 / 72, 2), 'Pica^2': Math.pow(0.0254 / 72, 2), Morgen: 2500 }, 'm2 m^2 ar ha ang2 ang^2');
  defU('speed', { 'm/s': 1, 'm/sec': 1, 'm/h': 1 / 3600, 'm/hr': 1 / 3600, mph: 0.44704, kn: 1852 / 3600, admkn: 1852.184 / 3600 }, 'm/s m/sec m/h m/hr');
  defU('info', { bit: 1, byte: 8 }, 'bit byte', true);
  const TEMPS = { C: 'C', cel: 'C', F: 'F', fah: 'F', K: 'K', kel: 'K', Rank: 'R', Reau: 'Re' };
  const toK = { C: (v) => v + 273.15, F: (v) => (v - 32) * 5 / 9 + 273.15, K: (v) => v, R: (v) => v * 5 / 9, Re: (v) => v * 1.25 + 273.15 };
  const fromK = { C: (k) => k - 273.15, F: (k) => (k - 273.15) * 9 / 5 + 32, K: (k) => k, R: (k) => k * 9 / 5, Re: (k) => (k - 273.15) * 0.8 };
  function findUnit(s) {
    if (UNITS[s]) return { c: UNITS[s].c, f: UNITS[s].f };
    for (const k of [2, 1]) { const p = s.slice(0, k), r = s.slice(k); const u = UNITS[r]; if (!u || !r) continue; if (u.m && PRE[p] !== undefined) return { c: u.c, f: u.f * PRE[p] }; if (u.b && (BPRE[p] !== undefined || PRE[p] !== undefined)) return { c: u.c, f: u.f * (BPRE[p] !== undefined ? BPRE[p] : PRE[p]) }; }
    return null;
  }
  R('CONVERT', 'nss', (n, a, b) => {
    if (TEMPS[a] || TEMPS[b]) { if (!TEMPS[a] || !TEMPS[b]) return E.NA; return fromK[TEMPS[b]](toK[TEMPS[a]](n)); }
    const x = findUnit(a), y = findUnit(b); if (!x || !y || x.c !== y.c) return E.NA; return n * x.f / y.f;
  }, 'number, from_unit, to_unit', 'Converts a number from one measurement system to another', { cat: CATE });
})(typeof globalThis !== 'undefined' ? globalThis : this);
