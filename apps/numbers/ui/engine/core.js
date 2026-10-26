/* ZengNumbers engine core: value types, errors, coercion, ranges, function registry.
   Loaded in the browser (global ZN) and in node tests (require -> globalThis.ZN). No eval. */
(function (G) {
  'use strict';
  const ZN = G.ZN || (G.ZN = {});
  const MAXR = 1048576, MAXC = 16384;
  ZN.MAXR = MAXR; ZN.MAXC = MAXC;

  // ---------- errors ----------
  class ZErr { constructor(code, msg) { this.code = code; this.msg = msg; } toString() { return this.code; } }
  const E = {};
  for (const [k, c] of [['NULL', '#NULL!'], ['DIV0', '#DIV/0!'], ['VALUE', '#VALUE!'], ['REF', '#REF!'], ['NAME', '#NAME?'], ['NUM', '#NUM!'], ['NA', '#N/A'], ['SPILL', '#SPILL!'], ['CALC', '#CALC!'], ['CIRC', '#CIRC!'], ['GETTING', '#GETTING_DATA']]) E[k] = new ZErr(c);
  ZN.ZErr = ZErr; ZN.E = E;
  const ERR_BY_CODE = {}; Object.values(E).forEach((e) => (ERR_BY_CODE[e.code] = e)); ERR_BY_CODE['#GETTING_DATA'] = E.GETTING;
  ZN.errFromCode = (s) => ERR_BY_CODE[String(s).toUpperCase()] || null;
  const isErr = (v) => v instanceof ZErr;

  // ---------- A1 helpers ----------
  const colName = (c) => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = ((c - 1 - m) / 26) | 0; } return s; };
  const colIndex = (s) => { let n = 0; for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) & 31); return n - 1; };
  const addr = (r, c, absR, absC) => (absC ? '$' : '') + colName(c) + (absR ? '$' : '') + (r + 1);
  const parseA1 = (s) => { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s); if (!m) return null; const c = colIndex(m[1].toUpperCase()), r = +m[2] - 1; if (c >= MAXC || r < 0 || r >= MAXR) return null; return { r, c }; };
  ZN.colName = colName; ZN.colIndex = colIndex; ZN.addr = addr; ZN.parseA1 = parseA1;
  ZN.rangeAddr = (r1, c1, r2, c2) => (r1 === r2 && c1 === c2 ? addr(r1, c1) : addr(r1, c1) + ':' + addr(r2, c2));

  // ---------- dates (Excel 1900 system incl. the leap-year bug) ----------
  const D = ZN.date = {};
  const MS = 86400000, EPOCH = Date.UTC(1899, 11, 30);
  D.fromYMD = (y, m, d) => { // y, m (1-based), d: normalise like Excel DATE
    if (y >= 0 && y < 1900) y += 1900;
    const dt = new Date(Date.UTC(2000, 0, 1)); dt.setUTCFullYear(y, m - 1, d);
    let n = Math.round((dt.getTime() - EPOCH) / MS);
    if (n < 61) n = n - 1; // Excel counts the fictitious 1900-02-29, so earlier dates are shifted
    return n;
  };
  D.toYMD = (n) => { // serial -> {y,m,d,wd}
    n = Math.floor(n);
    if (n < 0) return null;
    if (n === 60) return { y: 1900, m: 2, d: 29, wd: 3 };
    if (n === 0) return { y: 1900, m: 1, d: 0, wd: 6 };
    let t;
    if (n < 60) t = Date.UTC(1900, 0, 1) + (n - 1) * MS; else t = EPOCH + n * MS;
    const dt = new Date(t);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: D.weekday(n) };
  };
  D.weekday = (n) => { n = Math.floor(n); if (n === 0) return 6; return (n + 6) % 7; }; // 0=Sunday .. 6=Saturday  (serial 1 = Sunday)
  D.fromDate = (dt) => D.fromYMD(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()) + (dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1000) / 86400;
  D.now = () => D.fromDate(new Date());
  D.toDate = (n) => { const p = D.toYMD(n); const f = n - Math.floor(n); const s = Math.round(f * 86400); return new Date(p.y, p.m - 1, p.d, 0, 0, s); };
  D.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  D.isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  D.hms = (frac) => { let s = Math.round((frac - Math.floor(frac)) * 86400); if (s >= 86400) s = 0; return { h: (s / 3600) | 0, m: ((s % 3600) / 60) | 0, s: s % 60 }; };

  // ---------- value -> string / number ----------
  const numToStr = (n) => {
    if (n === 0) return '0'; if (!isFinite(n)) return isNaN(n) ? '#NUM!' : '#NUM!';
    let s = String(parseFloat(n.toPrecision(15)));
    if (/e/.test(s)) { const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s); if (m) s = m[1] + 'E' + m[2] + (m[3].length < 2 ? '0' + m[3] : m[3]); }
    return s;
  };
  ZN.numToStr = numToStr;
  const toStr = (v) => { // scalar -> string (errors pass through as ZErr)
    if (v == null) return ''; if (typeof v === 'string') return v; if (typeof v === 'number') return numToStr(v); if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (isErr(v)) return v; return String(v);
  };
  const NUMRE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const toNum = (v) => { // returns number or ZErr (Excel semantics for direct args)
    if (typeof v === 'number') return v; if (v == null) return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (isErr(v)) return v;
    if (typeof v === 'string') {
      const t = v.trim(); if (t === '') return E.VALUE; if (NUMRE.test(t)) return parseFloat(t);
      const p = ZN.parseValue ? ZN.parseValue(t) : null; if (p && typeof p.v === 'number') return p.v; return E.VALUE;
    }
    if (v instanceof Range || Array.isArray(v)) return toNum(scalar(v));
    return E.VALUE;
  };
  const toBool = (v) => {
    if (typeof v === 'boolean') return v; if (v == null) return false; if (typeof v === 'number') return v !== 0; if (isErr(v)) return v;
    if (typeof v === 'string') { const u = v.trim().toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return E.VALUE; }
    return E.VALUE;
  };
  const toInt = (v) => { const n = toNum(v); return isErr(n) ? n : Math.trunc(n); };

  // ---------- ranges ----------
  class Range {
    constructor(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2); this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2); }
    get rows() { return this.r2 - this.r1 + 1; } get cols() { return this.c2 - this.c1 + 1; }
    get(i, j) { return this.sheet ? this.sheet.getValue(this.r1 + i, this.c1 + j) : null; } // relative, 0-based
    // iterate non-empty cells only (fast for sparse / whole-column); cb(value, absRow, absCol)
    each(cb) { if (this.sheet) this.sheet.eachCell(this.r1, this.c1, this.r2, this.c2, cb); }
    toArray() { // 2D array of values (empty -> null). Whole-column refs are clamped to the used area.
      const rr = this.clampedRows(); const out = new Array(rr); for (let i = 0; i < rr; i++) { const row = new Array(this.cols); for (let j = 0; j < this.cols; j++) row[j] = this.get(i, j); out[i] = row; } return out;
    }
    clampedRows() { if (!this.sheet) return this.rows; if (this.r2 >= this.sheet.maxRow() && this.rows > 100000) return Math.max(1, Math.min(this.rows, this.sheet.maxRow() + 1 - this.r1)); return this.rows; }
    isSingle() { return this.r1 === this.r2 && this.c1 === this.c2; }
  }
  ZN.Range = Range;
  const isArr = (v) => Array.isArray(v);
  // collapse to a scalar: single cell range / 1x1 array / first element (implicit)
  const scalar = (v) => { if (v instanceof Range) return v.get(0, 0); if (isArr(v)) return v.length ? (isArr(v[0]) ? v[0][0] : v[0]) : null; return v; };
  const dims = (v) => (v instanceof Range ? [v.clampedRows(), v.cols] : isArr(v) ? [v.length, v[0] ? v[0].length : 0] : [1, 1]);
  const at = (v, i, j) => (v instanceof Range ? v.get(i, j) : isArr(v) ? (v[i] ? v[i][j] : undefined) : v);
  const toArr2 = (v) => { if (v instanceof Range) return v.toArray(); if (isArr(v)) return v; return [[v]]; };
  // flatten any mix of scalars/ranges/arrays into a list of values (row-major), skipping nothing
  const flat = (v, out = []) => { if (v instanceof Range) { const rr = v.clampedRows(); for (let i = 0; i < rr; i++) for (let j = 0; j < v.cols; j++) out.push(v.get(i, j)); } else if (isArr(v)) { for (const row of v) { if (isArr(row)) for (const x of row) out.push(x); else out.push(row); } } else out.push(v); return out; };
  // Iterate numeric values the way SUM/AVERAGE/etc. do: numbers in ranges/arrays only; direct args coerced.
  // cb(number) -> returns false to stop. Returns ZErr if an error is encountered, else undefined.
  const eachNum = (args, cb, o = {}) => {
    for (const a of args) {
      if (a instanceof Range) {
        let err; a.each((v) => { if (err) return; if (isErr(v)) err = v; else if (typeof v === 'number') cb(v); else if (o.text && typeof v === 'boolean') cb(v ? 1 : 0); });
        if (err) return err;
      } else if (isArr(a)) { for (const row of a) for (const v of (isArr(row) ? row : [row])) { if (isErr(v)) return v; if (typeof v === 'number') cb(v); else if (o.text && typeof v === 'boolean') cb(v ? 1 : 0); } }
      else { if (isErr(a)) return a; if (a == null) { if (o.blankAsZero) cb(0); continue; } const n = (typeof a === 'string' && !o.strictDirect) ? toNum(a) : typeof a === 'boolean' ? (a ? 1 : 0) : a; if (typeof n === 'string') continue; if (isErr(n)) return n; cb(n); }
    }
  };
  const nums = (args, o) => { const out = []; const e = eachNum(args, (n) => out.push(n), o); return e || out; };

  // ---------- comparison (Excel ordering: number < text < boolean; blanks coerce) ----------
  const typeRank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  const cmp = (a, b) => {
    if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ra = typeRank(a), rb = typeRank(b); if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const eq = (a, b) => { if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase(); return cmp(a, b) === 0; };

  // ---------- wildcards & criteria (SUMIF/COUNTIF/MATCH/…) ----------
  const wildRe = (pat, flags = 'i') => { let s = ''; for (let i = 0; i < pat.length; i++) { const ch = pat[i]; if (ch === '~' && i + 1 < pat.length) { s += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } else if (ch === '*') s += '[\\s\\S]*'; else if (ch === '?') s += '[\\s\\S]'; else s += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } return new RegExp('^' + s + '$', flags); };
  const hasWild = (s) => /[*?]/.test(s);
  // criteria -> predicate(value)->bool
  const criteria = (crit) => {
    if (crit instanceof Range || isArr(crit)) crit = scalar(crit);
    if (isErr(crit)) return (v) => isErr(v) && v.code === crit.code;
    if (typeof crit === 'number') return (v) => (typeof v === 'number' && v === crit) || (typeof v === 'string' && NUMRE.test(v.trim()) && parseFloat(v) === crit);
    if (typeof crit === 'boolean') return (v) => typeof v === 'boolean' && v === crit;
    if (crit == null) return (v) => v == null || v === '' ? false : v === 0 ? true : false;
    let s = String(crit), op = '=';
    const m = /^(<=|>=|<>|<|>|=)/.exec(s); if (m) { op = m[1]; s = s.slice(op.length); }
    let n = NUMRE.test(s.trim()) ? parseFloat(s) : (ZN.parseValue && s.trim() !== '' ? (() => { const p = ZN.parseValue(s.trim()); return p && typeof p.v === 'number' ? p.v : NaN; })() : NaN);
    const num = !isNaN(n);
    if (op === '=' || op === '<>') {
      let test;
      if (s === '' ) test = (v) => v == null || v === '';
      else if (num) test = (v) => (typeof v === 'number' && v === n) || (typeof v === 'string' && NUMRE.test(v.trim()) && parseFloat(v) === n);
      else if (/^(TRUE|FALSE)$/i.test(s)) { const b = s.toUpperCase() === 'TRUE'; test = (v) => typeof v === 'boolean' && v === b; }
      else if (hasWild(s)) { const re = wildRe(s); test = (v) => typeof v === 'string' && re.test(v); }
      else { const l = s.toLowerCase(); test = (v) => typeof v === 'string' && v.toLowerCase() === l; }
      if (op === '<>') return (v) => !test(v); return test;
    }
    const sat = (c) => (op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0);
    if (num) return (v) => typeof v === 'number' && sat(v < n ? -1 : v > n ? 1 : 0);
    const l = s.toLowerCase(); return (v) => typeof v === 'string' && sat(v.toLowerCase() < l ? -1 : v.toLowerCase() > l ? 1 : 0);
  };

  // ---------- registry ----------
  // ZN.fn.def('NAME'|['A','B'], min, max, impl, opts)
  //   impl(...args, ctx)   (eager)  args are scalars | Range | 2D arrays (already evaluated, NOT dereferenced)
  //   opts.lift:true  -> every arg except opts.raw indices (and >= opts.rawFrom) is lifted to scalar; arrays/ranges broadcast and
  //                      the result becomes a 2D array. Errors in lifted args short-circuit unless opts.errs.
  //   opts.lazy:true  -> impl(nodes, ev, ctx): receives AST nodes and ev(node) -> value (for IF, IFS, IFERROR, CHOOSE, LET, ...)
  //   opts.ref:true   -> reference args are passed as Range objects with .sheet (ROW, COLUMN, OFFSET, ISREF…) — default anyway; plus ctx.argNodes
  //   opts.volatile:true -> recalculated on every recalculation (NOW, TODAY, RAND, OFFSET, INDIRECT…)
  //   opts.hint: 'SUM(number1, [number2], …)' for autocomplete; opts.cat: category
  const registry = new Map();
  const def = (names, min, max, impl, opts = {}) => { for (const n of [].concat(names)) registry.set(n.toUpperCase(), Object.assign({ name: n.toUpperCase(), min, max, impl }, opts)); };
  ZN.fn = { def, registry, get: (n) => registry.get(n.toUpperCase()), has: (n) => registry.has(n.toUpperCase()) };

  // random: seedable for tests
  ZN.rand = Math.random;

  ZN.F = { isErr, toStr, toNum, toBool, toInt, scalar, dims, at, toArr2, flat, eachNum, nums, cmp, eq, wildRe, hasWild, criteria, isArr, typeRank, NUMRE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
