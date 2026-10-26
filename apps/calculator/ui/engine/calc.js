/* Expression engine: tokenizer, parser (no eval), exact-decimal evaluator, number formatting/parsing, numeric compiler for graphs. */
(function (g) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const { Dec, CalcError } = isNode ? require('./dec.js') : g.ZC;
  const U = isNode ? require('./units.js') : g.ZC;
  const ZERO = Dec.ZERO, ONE = Dec.ONE;

  // ---------------------------------------------------------------- tokenizer
  const OPCH = { '−': '-', '–': '-', '×': '*', '·': '*', '∙': '*', '÷': '/', '⁄': '/', '＊': '*' };
  const KEYWORDS = new Set(['mod', 'of', 'in', 'to', 'as', 'into', 'ncr', 'npr', 'yroot', 'logy']);
  function tokenize(src) {
    const out = []; let i = 0; const n = src.length; let sp = false;
    while (i < n) {
      let c = src[i];
      if (/\s/.test(c)) { i++; sp = true; continue; }
      const start = i;
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i; while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === '.') { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        if ((src[j] === 'e' || src[j] === 'E') && /^[+-]?[0-9]/.test(src.slice(j + 1, j + 3))) { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        out.push({ t: 'num', v: src.slice(i, j), pos: start, sp }); i = j; sp = false; continue;
      }
      if (/[\p{L}_]/u.test(c)) {
        let j = i + 1; if (c !== 'π') while (j < n && /[\p{L}\p{N}_]/u.test(src[j]) && src[j] !== 'π') j++;
        out.push({ t: 'id', v: src.slice(i, j), pos: start, sp }); i = j; sp = false; continue;
      }
      if (c === '*' && src[i + 1] === '*') { out.push({ t: 'op', v: '^', pos: start, sp }); i += 2; sp = false; continue; }
      c = OPCH[c] || c;
      if ('+-*/^!%()=,°²³√∛|"'.includes(c)) { out.push({ t: 'op', v: c, pos: start, sp }); i++; sp = false; continue; }
      throw new CalcError('Unexpected "' + src[i] + '"');
    }
    // merge unit pairs like km/h, m/s, ft/s written without spaces
    for (let k = 0; k + 2 < out.length; k++) {
      const a = out[k], b = out[k + 1], d = out[k + 2];
      if (a.t === 'id' && b.t === 'op' && b.v === '/' && d.t === 'id' && !b.sp && !d.sp && U.ALIAS[(a.v + '/' + d.v)]) { a.v = a.v + '/' + d.v; out.splice(k + 1, 2); }
    }
    out.push({ t: 'end', v: '', pos: n, sp }); return out;
  }

  // ---------------------------------------------------------------- parser
  const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'sec', 'csc', 'cot',
    'ln', 'log', 'log2', 'log10', 'exp', 'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'fact', 'factorial', 'min', 'max', 'gcd', 'lcm',
    'ncr', 'npr', 'root', 'pow', 'mod', 'rand', 'random', 'rad', 'deg', 'inv', 'sq', 'cube', 'frac', 'fix', 'sum', 'avg', 'mean', 'logb', 'sinc',
    'arcsin', 'arccos', 'arctan', 'fib']);
  const FUNC_ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', factorial: 'fact', random: 'rand', mean: 'avg' };
  const CONSTS = { pi: 'pi', π: 'pi', e: 'e', tau: 'tau', phi: 'phi' };

  function parse(src, opts = {}) {
    const toks = tokenize(src); let p = 0;
    const next = () => toks[p++];
    const isOp = (v) => toks[p].t === 'op' && toks[p].v === v;
    const kw = () => (toks[p].t === 'id' ? toks[p].v.toLowerCase() : null);
    const vars = opts.vars || {};
    const isVarName = (name) => name in vars || (opts.varNames && opts.varNames.has(name)) || (opts.freeVars && opts.freeVars.includes(name));
    const isUnit = (name) => opts.units && U.ALIAS[name] && !isVarName(name) && !FUNCS.has(name.toLowerCase()) && !(name.toLowerCase() in CONSTS) && !KEYWORDS.has(name.toLowerCase());

    function parseConv() {
      let left = additive();
      while (opts.units && toks[p].t === 'id' && ['in', 'to', 'as', 'into'].includes(kw())) {
        const save = p; next(); const name = toks[p].t === 'id' ? toks[p].v : (toks[p].t === 'op' && toks[p].v === '"' ? '"' : null);
        if (name && U.ALIAS[name]) { next(); left = { t: 'conv', x: left, u: name }; } else { p = save; break; }
      }
      return left;
    }
    function additive() {
      let l = term();
      while (toks[p].t === 'op' && (toks[p].v === '+' || toks[p].v === '-')) { const op = next().v; const r = term(); l = { t: 'bin', op, l, r }; }
      return l;
    }
    function startsOperand() {
      const t = toks[p];
      if (t.t === 'num') return true;
      if (t.t === 'id') { const k = t.v.toLowerCase(); return !KEYWORDS.has(k); }
      return t.t === 'op' && (t.v === '(' || t.v === '√' || t.v === '∛');
    }
    function term() {
      let l = unary();
      for (;;) {
        const t = toks[p];
        if (t.t === 'op' && (t.v === '*' || t.v === '/')) { next(); l = { t: 'bin', op: t.v, l, r: unary() }; continue; }
        if (t.t === 'id') {
          const k = t.v.toLowerCase();
          if (k === 'mod') { next(); l = { t: 'bin', op: 'mod', l, r: unary() }; continue; }
          if (k === 'of') { next(); l = { t: 'bin', op: '*', l, r: unary() }; continue; }
          if (k === 'ncr' || k === 'npr' || k === 'yroot' || k === 'logy') { next(); l = { t: 'call', name: k, args: [l, unary()] }; continue; }
        }
        if (startsOperand()) { l = { t: 'bin', op: '*', l, r: unary(), implicit: true }; continue; }
        break;
      }
      return l;
    }
    function unary() {
      if (isOp('-')) { next(); return { t: 'neg', x: unary() }; }
      if (isOp('+')) { next(); return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (isOp('^')) { next(); return { t: 'pow', l: b, r: unary() }; }
      return b;
    }
    function postfix() {
      let x = primary();
      for (;;) {
        const t = toks[p];
        if (t.t === 'op' && t.v === '!') { next(); x = { t: 'fact', x }; continue; }
        if (t.t === 'op' && t.v === '%') { next(); x = { t: 'pct', x }; continue; }
        if (t.t === 'op' && t.v === '²') { next(); x = { t: 'pow', l: x, r: { t: 'num', v: '2' } }; continue; }
        if (t.t === 'op' && t.v === '³') { next(); x = { t: 'pow', l: x, r: { t: 'num', v: '3' } }; continue; }
        if (t.t === 'op' && t.v === '°') { next(); x = { t: 'degs', x }; continue; }
        if (opts.units && (x.t === 'num' || x.t === 'pct' || x.t === 'paren') && ((t.t === 'id' && isUnit(t.v)) || (t.t === 'op' && t.v === '"'))) { next(); x = { t: 'unit', x, u: t.v }; continue; }
        break;
      }
      return x;
    }
    function primary() {
      const t = next();
      if (t.t === 'num') return { t: 'num', v: t.v };
      if (t.t === 'op') {
        if (t.v === '(') { const e = parseConv(); if (isOp(')')) next(); else if (!opts.autoClose) throw new CalcError('Missing )'); return { t: 'paren', x: e }; }
        if (t.v === '√') return { t: 'call', name: 'sqrt', args: [postfix()] };
        if (t.v === '∛') return { t: 'call', name: 'cbrt', args: [postfix()] };
        if (t.v === '|') { const e = additive(); if (isOp('|')) next(); return { t: 'call', name: 'abs', args: [e] }; }
        throw new CalcError(t.v === ')' ? 'Unexpected )' : 'Unexpected "' + t.v + '"');
      }
      if (t.t === 'id') {
        const name = t.v; const lower = name.toLowerCase();
        if (isVarName(name)) return { t: 'var', name };
        if (lower in CONSTS) return { t: 'const', name: CONSTS[lower] };
        if (FUNCS.has(lower)) {
          const fname = FUNC_ALIAS[lower] || lower;
          if (isOp('(')) {
            next(); const args = [];
            if (!isOp(')')) { args.push(parseConv()); while (isOp(',')) { next(); args.push(parseConv()); } }
            if (isOp(')')) next(); else if (!opts.autoClose) throw new CalcError('Missing )');
            return { t: 'call', name: fname, args };
          }
          if (fname === 'rand') return { t: 'call', name: 'rand', args: [] };
          const nt = toks[p]; if (nt.t === 'end' || (nt.t === 'op' && !['√', '∛', '-', '+', '|'].includes(nt.v))) throw new CalcError('Missing argument');
          return { t: 'call', name: fname, args: [unary()] };
        }
        if (lower === 'ans' || lower === 'answer') return { t: 'var', name: 'ans' };
        throw new CalcError('Unknown name "' + name + '"');
      }
      throw new CalcError(t.t === 'end' ? 'Incomplete expression' : 'Unexpected input');
    }
    if (toks[0].t === 'end') throw new CalcError('Empty');
    const ast = parseConv();
    if (toks[p].t !== 'end') {
      if (isOp(')')) throw new CalcError('Unexpected )');
      throw new CalcError('Unexpected "' + toks[p].v + '"');
    }
    return ast;
  }

  // ---------------------------------------------------------------- evaluator (Dec / Quantity)
  class Q { constructor(v, u) { this.v = v; this.u = u; } }
  const isQ = (x) => x instanceof Q;
  const bad = () => new CalcError('Invalid input');
  const toNum = (d) => d.toNumber();
  const snap = (x) => (Math.abs(x) < 1e-15 ? 0 : x);
  const fromN = (x) => { if (Number.isNaN(x)) throw bad(); if (!isFinite(x)) throw new CalcError('Overflow'); return Dec.fromNumber(x); };
  function trig(fn, x, angle) {
    if (angle === 'rad') {
      const v = toNum(x);
      if (fn === 'tan') { const c = Math.cos(v); if (Math.abs(c) < 1e-15) throw new CalcError('Not defined'); return fromN(Math.tan(v)); }
      return fromN(snap(Math[fn](v)));
    }
    const d = angle === 'grad' ? x.mul('0.9') : x; const m = d.mod(360); const a = m.sign() < 0 ? m.add(360) : m;
    const q = a.div(90, 40);
    if (q.isInt()) {
      const k = Number(q.toBigInt() % 4n);
      if (fn === 'sin') return Dec.of([0, 1, 0, -1][k]);
      if (fn === 'cos') return Dec.of([1, 0, -1, 0][k]);
      if (k % 2 === 1) throw new CalcError('Not defined'); return ZERO;
    }
    return fromN(snap(Math[fn](toNum(d) * Math.PI / 180)));
  }
  function inv(fn, x, angle) {
    const v = toNum(x);
    if ((fn === 'asin' || fn === 'acos') && Math.abs(v) > 1) throw bad();
    const r = Math[fn](v);
    if (angle === 'deg') {
      const exact = { asin: { 1: 90, '-1': -90, 0: 0 }, acos: { '-1': 180, 1: 0, 0: 90 }, atan: { 1: 45, '-1': -45, 0: 0 } }[fn][String(v)];
      return exact !== undefined ? Dec.of(exact) : fromN(r * 180 / Math.PI);
    }
    if (angle === 'grad') return fromN(r * 200 / Math.PI);
    return fromN(r);
  }
  function lnDec(x) {
    if (x.sign() <= 0) throw bad(); if (x.eq(1)) return ZERO;
    const nv = toNum(x); if (isFinite(nv) && nv > 0) return fromN(Math.log(nv));
    const mant = new Dec(x.n, -(x.len - 1)); return fromN(Math.log(toNum(mant)) + x.exp10 * Math.LN10);
  }
  function log10Dec(x) {
    if (x.sign() <= 0) throw bad(); if (x.n === 1n) return Dec.of(x.e);
    const nv = toNum(x); if (isFinite(nv) && nv > 0) return fromN(Math.log10(nv));
    const mant = new Dec(x.n, -(x.len - 1)); return fromN(Math.log10(toNum(mant)) + x.exp10);
  }
  function snapInt(r) { const rr = r.roundSig(14); const n = toNum(rr); return Math.abs(n - Math.round(n)) < 1e-12 ? Dec.of(Math.round(n)) : rr; }
  function factorial(x) {
    if (x.isInt()) {
      if (x.sign() < 0) throw bad(); const n = Number(x.toBigInt()); if (n > 10000) throw new CalcError('Overflow');
      let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return new Dec(r, 0);
    }
    const z = toNum(x); if (z < 0) throw bad(); return fromN(gamma(z + 1));
  }
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let a = c[0]; const t = z + 7.5; for (let i = 1; i < 9; i++) a += c[i] / (z + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
  }
  function cbrtDec(a) {
    if (a.isZero()) return ZERO; const neg = a.sign() < 0; const x0 = a.abs();
    let x = fromN(Math.cbrt(toNum(x0)));
    for (let i = 0; i < 6; i++) x = x.mul(2).add(x0.div(x.mul(x))).div(3);
    x = x.roundSig(30); return neg ? x.neg() : x;
  }
  function powDec(a, b) {
    if (b.isInt()) return a.pow(b);
    if (b.eq('0.5')) return a.sqrt();
    if (a.sign() < 0) return a.pow(b);
    if (a.isZero()) { if (b.sign() < 0) throw new CalcError('Cannot divide by zero'); return ZERO; }
    return fromN(Math.pow(toNum(a), toNum(b)));
  }
  function yroot(n, x) {
    if (n.isZero()) throw bad(); if (n.eq(2)) return x.sqrt(); if (n.eq(3)) return cbrtDec(x);
    if (x.sign() < 0) { if (n.isInt() && n.toBigInt() % 2n !== 0n) return powDec(x.neg(), ONE.div(n)).neg(); throw bad(); }
    return powDec(x, ONE.div(n));
  }
  function bigGcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
  function needInt(x) { if (!x.isInt()) throw bad(); return x.toBigInt(); }
  function comb(n, r, perm) {
    const N = needInt(n), R = needInt(r); if (N < 0n || R < 0n || R > N) throw bad();
    let res = 1n; const k = perm ? R : (R > N - R ? N - R : R);
    for (let i = 0n; i < k; i++) res = perm ? res * (N - i) : (res * (N - i)) / (i + 1n);
    return new Dec(res, 0);
  }

  function callFn(name, a, ctx) {
    const angle = ctx.angle || 'deg';
    const need = (k) => { if (a.length < k) throw new CalcError('Missing argument'); };
    const x = a[0];
    switch (name) {
      case 'sin': case 'cos': case 'tan': need(1); return trig(name, x, angle);
      case 'sec': case 'csc': case 'cot': { need(1); const r = trig(name === 'sec' ? 'cos' : name === 'csc' ? 'sin' : 'tan', x, angle); if (r.isZero()) throw new CalcError('Not defined'); return ONE.div(r); }
      case 'asin': case 'acos': case 'atan': need(1); return inv(name, x, angle);
      case 'sinh': case 'cosh': case 'tanh': need(1); return fromN(Math[name](toNum(x)));
      case 'asinh': need(1); return fromN(Math.asinh(toNum(x)));
      case 'acosh': need(1); if (x.cmp(1) < 0) throw bad(); return fromN(Math.acosh(toNum(x)));
      case 'atanh': need(1); if (x.abs().cmp(1) >= 0) throw bad(); return fromN(Math.atanh(toNum(x)));
      case 'ln': need(1); return lnDec(x);
      case 'log': case 'log10': need(1); return log10Dec(x);
      case 'log2': { need(1); if (x.sign() <= 0) throw bad(); return snapInt(lnDec(x).div(lnDec(Dec.of(2)))); }
      case 'logb': case 'logy': { need(2); const v = a[0], b = a[1]; if (b.eq(1) || b.sign() <= 0 || v.sign() <= 0) throw bad(); return snapInt(lnDec(v).div(lnDec(b))); }
      case 'exp': need(1); if (x.isZero()) return ONE; return fromN(Math.exp(toNum(x)));
      case 'sqrt': need(1); return x.sqrt();
      case 'cbrt': need(1); return cbrtDec(x);
      case 'abs': need(1); return x.abs();
      case 'floor': need(1); return x.floor(); case 'ceil': need(1); return x.ceil();
      case 'round': need(1); return a.length > 1 ? x.roundDp(Number(a[1].toBigInt())) : x.round();
      case 'trunc': case 'fix': need(1); return x.trunc();
      case 'frac': need(1); return x.sub(x.trunc());
      case 'sign': need(1); return Dec.of(x.sign());
      case 'fact': need(1); return factorial(x);
      case 'inv': need(1); return ONE.div(x);
      case 'sq': need(1); return x.mul(x); case 'cube': need(1); return x.mul(x).mul(x);
      case 'min': need(1); return a.reduce((m, v) => (v.cmp(m) < 0 ? v : m));
      case 'max': need(1); return a.reduce((m, v) => (v.cmp(m) > 0 ? v : m));
      case 'sum': need(1); return a.reduce((s, v) => s.add(v), ZERO);
      case 'avg': need(1); return a.reduce((s, v) => s.add(v), ZERO).div(a.length);
      case 'gcd': need(2); return new Dec(a.map(needInt).reduce(bigGcd), 0);
      case 'lcm': need(2); return new Dec(a.map(needInt).reduce((l, v) => { const gg = bigGcd(l, v); return gg === 0n ? 0n : (l / gg) * (v < 0n ? -v : v); }), 0);
      case 'ncr': need(2); return comb(a[0], a[1], false);
      case 'npr': need(2); return comb(a[0], a[1], true);
      case 'root': case 'yroot': need(2); return yroot(a[0], a[1]);
      case 'pow': need(2); return powDec(a[0], a[1]);
      case 'mod': need(2); return a[0].mod(a[1]);
      case 'rand': return Dec.parse(Math.random().toFixed(10));
      case 'rad': need(1); return x.mul(Dec.PI).div(180);
      case 'deg': need(1); return x.mul(180).div(Dec.PI);
      case 'fib': { need(1); const n = Number(needInt(x)); if (n < 0 || n > 20000) throw bad(); let p0 = 0n, p1 = 1n; for (let i = 0; i < n; i++) [p0, p1] = [p1, p0 + p1]; return new Dec(p0, 0); }
      case 'sinc': need(1); return x.isZero() ? ONE : trig('sin', x, angle).div(x);
    }
    throw new CalcError('Unknown function ' + name);
  }
  const CONST_VAL = { pi: Dec.PI, e: Dec.E, tau: Dec.PI.mul(2), phi: ONE.add(Dec.of(5).sqrt()).div(2) };

  const unitSym = (u) => { const m = /\(([^)]+)\)/.exec(u.label); return m ? m[1] : u.label; };
  function valueOf(x) { return isQ(x) ? x.v : x; }
  function arith(op, a, b) {
    const qa = isQ(a), qb = isQ(b);
    if (!qa && !qb) {
      switch (op) { case '+': return a.add(b); case '-': return a.sub(b); case '*': return a.mul(b); case '/': return a.div(b); case 'mod': return a.mod(b); }
    }
    switch (op) {
      case '+': case '-': {
        if (qa && qb) { const bv = U.convert(b.v, b.u, a.u); return new Q(op === '+' ? a.v.add(bv) : a.v.sub(bv), a.u); }
        if (qa) return new Q(op === '+' ? a.v.add(b) : a.v.sub(b), a.u);
        return new Q(op === '+' ? a.add(b.v) : a.sub(b.v), b.u);
      }
      case '*': if (qa && qb) throw new CalcError('Cannot multiply two quantities'); return qa ? new Q(a.v.mul(b), a.u) : new Q(a.mul(b.v), b.u);
      case '/': if (qa && qb) return a.v.div(U.convert(b.v, b.u, a.u)); if (qa) return new Q(a.v.div(b), a.u); throw new CalcError('Cannot divide by a quantity');
      case 'mod': return new Q(valueOf(a).mod(valueOf(b)), qa ? a.u : b.u);
    }
    throw bad();
  }
  function evalNode(n, ctx) { const v = evalInner(n, ctx); if (ctx.onNode) ctx.onNode(n, v); return v; }
  function evalInner(n, ctx) {
    switch (n.t) {
      case 'num': return Dec.parse(n.v);
      case 'paren': return evalNode(n.x, ctx);
      case 'const': return CONST_VAL[n.name];
      case 'var': { const v = ctx.vars && ctx.vars[n.name]; if (v === undefined) throw new CalcError(n.name === 'ans' ? 'No previous answer' : 'Unknown name "' + n.name + '"'); return v; }
      case 'neg': { const v = evalNode(n.x, ctx); return isQ(v) ? new Q(v.v.neg(), v.u) : v.neg(); }
      case 'pct': { const v = evalNode(n.x, ctx); return isQ(v) ? new Q(v.v.div(100), v.u) : v.div(100); }
      case 'degs': { const v = valueOf(evalNode(n.x, ctx)); const a = ctx.angle || 'deg'; return a === 'deg' ? v : a === 'rad' ? v.mul(Dec.PI).div(180) : v.div('0.9'); }
      case 'fact': return factorial(valueOf(evalNode(n.x, ctx)));
      case 'unit': return new Q(valueOf(evalNode(n.x, ctx)), U.unit(n.u));
      case 'conv': { const v = evalNode(n.x, ctx); if (!isQ(v)) throw new CalcError('Nothing to convert'); const to = U.unit(n.u); return new Q(U.convert(v.v, v.u, to), to); }
      case 'pow': return powDec(valueOf(evalNode(n.l, ctx)), valueOf(evalNode(n.r, ctx)));
      case 'call': return callFn(n.name, n.args.map((x) => valueOf(evalNode(x, ctx))), ctx);
      case 'bin': {
        const l = evalNode(n.l, ctx);
        if ((n.op === '+' || n.op === '-') && n.r.t === 'pct') { // common calculator rule: a + b% = a + a*b/100
          const p = valueOf(evalNode(n.r.x, ctx)); const lv = valueOf(l); const delta = lv.mul(p).div(100); const res = n.op === '+' ? lv.add(delta) : lv.sub(delta);
          if (ctx.onNode) ctx.onNode(n.r, isQ(l) ? new Q(delta, l.u) : delta, { percentOf: l });
          return isQ(l) ? new Q(res, l.u) : res;
        }
        return arith(n.op, l, evalNode(n.r, ctx));
      }
    }
    throw bad();
  }
  function evaluate(src, ctx = {}) {
    const ast = parse(src, { vars: ctx.vars, varNames: ctx.varNames, units: ctx.units, autoClose: ctx.autoClose });
    const v = evalNode(ast, ctx);
    return ctx.units ? v : valueOf(v);
  }

  // ---------------------------------------------------------------- number formatting & parsing
  function localeSeps(locale) {
    try {
      const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567.5);
      return { decimal: (parts.find((p) => p.type === 'decimal') || { value: '.' }).value, group: (parts.find((p) => p.type === 'group') || { value: ',' }).value };
    } catch (e) { return { decimal: '.', group: ',' }; }
  }
  const EN = { decimal: '.', group: ',' };
  function groupDigits(int, sep) { let out = ''; for (let i = 0; i < int.length; i++) { if (i && (int.length - i) % 3 === 0) out += sep; out += int[i]; } return out; }
  // opts: {digits:16, group:true, sep:{decimal,group}}
  function format(d, opts = {}) {
    const digits = opts.digits || 16; const sep = opts.sep || EN; const grp = opts.group !== false;
    if (d.isZero()) return '0';
    const r = digits >= 16 && d.isInt() && d.len + d.e <= 24 ? d : d.roundSig(digits); const x = r.exp10; const neg = r.n < 0n;
    if ((x >= digits && !(r === d && x < 24)) || x < -(opts.minExp || 6)) { const [m, ex] = r.toSci(digits).split('e'); return m.replace('.', sep.decimal) + 'e' + ex; }
    const [i, f] = r.abs().toPlain().split('.');
    return (neg ? '-' : '') + (grp ? groupDigits(i, sep.group) : i) + (f ? sep.decimal + f : '');
  }
  function formatQ(v, opts) { return isQ(v) ? format(v.v, opts) + ' ' + unitSym(v.u) : format(v, opts); }
  // parse user/clipboard text to Dec honouring locale separators; null if not a number
  function parseNumberText(text, sep = EN) {
    let s = String(text).trim().replace(/[    ]/g, '').replace(/[−–]/g, '-');
    if (!s) return null; let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/^[$€£¥]/, '').replace(/[$€£¥%]$/, '');
    if (s[0] === '+') s = s.slice(1);
    if (s[0] === '-') { neg = !neg; s = s.slice(1); }
    if (!/^[0-9.,'_]+(?:[eE][+-]?\d+)?$/.test(s)) return null;
    let exp = ''; const em = /[eE][+-]?\d+$/.exec(s); if (em) { exp = em[0]; s = s.slice(0, em.index); }
    s = s.replace(/['_]/g, '');
    const nd = (s.match(/\./g) || []).length, nc = (s.match(/,/g) || []).length; let t;
    if (nd && nc) {
      const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(',')); const dec = s[last]; const gr = dec === '.' ? ',' : '.';
      if (s.split(dec).length > 2) return null; t = s.split(gr).join('').replace(dec, '.');
    } else if (nd || nc) {
      const ch = nd ? '.' : ','; const cnt = nd || nc; const parts = s.split(ch);
      if (cnt > 1) { if (!parts.slice(1).every((q) => q.length === 3) || parts[0].length === 0) return null; t = parts.join(''); }
      else { const three = parts[1].length === 3 && parts[0].length >= 1 && parts[0] !== '0'; t = ch === sep.decimal ? parts[0] + '.' + parts[1] : ch === sep.group ? (three ? parts.join('') : parts[0] + '.' + parts[1]) : (three && ch === ',' ? parts.join('') : parts[0] + '.' + parts[1]); }
    } else t = s;
    try { return Dec.parse((neg ? '-' : '') + (t.startsWith('.') ? '0' + t : t) + exp); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- numeric (double) compiler for graphing
  function compileNum(ast, ctx = {}) {
    const angle = ctx.angle || 'rad';
    const k = angle === 'deg' ? Math.PI / 180 : angle === 'grad' ? Math.PI / 200 : 1;
    const fact = (x) => (Number.isInteger(x) && x >= 0 && x < 171 ? (() => { let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; })() : x >= 0 ? gamma(x + 1) : NaN);
    const f1 = {
      sin: (x) => Math.sin(x * k), cos: (x) => Math.cos(x * k), tan: (x) => Math.tan(x * k), asin: (x) => Math.asin(x) / k, acos: (x) => Math.acos(x) / k, atan: (x) => Math.atan(x) / k,
      sec: (x) => 1 / Math.cos(x * k), csc: (x) => 1 / Math.sin(x * k), cot: (x) => 1 / Math.tan(x * k),
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
      sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, fix: Math.trunc, sign: Math.sign, inv: (x) => 1 / x, sq: (x) => x * x, cube: (x) => x * x * x,
      fact, frac: (x) => x - Math.trunc(x), rad: (x) => x * Math.PI / 180, deg: (x) => x * 180 / Math.PI, sinc: (x) => (x === 0 ? 1 : Math.sin(x * k) / x),
    };
    const rt = (n, x) => (x < 0 && Math.abs(n) % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n));
    const fN = { min: Math.min, max: Math.max, pow: Math.pow, root: rt, yroot: rt, mod: (a, b) => a % b, logb: (x, b) => Math.log(x) / Math.log(b), logy: (x, b) => Math.log(x) / Math.log(b), rand: Math.random,
      gcd: (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }, sum: (...a) => a.reduce((s, v) => s + v, 0), avg: (...a) => a.reduce((s, v) => s + v, 0) / a.length,
      ncr: (n, r) => { let x = 1; for (let i = 0; i < r; i++) x = (x * (n - i)) / (i + 1); return Math.round(x); }, npr: (n, r) => { let x = 1; for (let i = 0; i < r; i++) x *= n - i; return x; } };
    const C = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
    const build = (n) => {
      switch (n.t) {
        case 'num': { const v = parseFloat(n.v); return () => v; }
        case 'paren': return build(n.x);
        case 'const': { const v = C[n.name]; return () => v; }
        case 'var': { const nm = n.name; return (env) => { const v = env[nm]; return v === undefined ? NaN : v; }; }
        case 'neg': { const a = build(n.x); return (e) => -a(e); }
        case 'pct': { const a = build(n.x); return (e) => a(e) / 100; }
        case 'degs': { const a = build(n.x); return (e) => a(e) * Math.PI / 180 / k; }
        case 'fact': { const a = build(n.x); return (e) => fact(a(e)); }
        case 'pow': { const a = build(n.l), b = build(n.r); return (e) => { const x = a(e), y = b(e); if (x < 0 && !Number.isInteger(y)) { const iv = 1 / y; if (Number.isInteger(iv) && Math.abs(iv) % 2 === 1) return -Math.pow(-x, y); } return Math.pow(x, y); }; }
        case 'call': { const args = n.args.map(build); const f = f1[n.name]; if (f && args.length) { const a = args[0]; return (e) => f(a(e)); } const g2 = fN[n.name]; if (g2) return (e) => g2(...args.map((a) => a(e))); throw new CalcError('Unknown function ' + n.name); }
        case 'bin': {
          const a = build(n.l);
          if ((n.op === '+' || n.op === '-') && n.r.t === 'pct') { const p = build(n.r.x); return n.op === '+' ? (e) => { const x = a(e); return x + x * p(e) / 100; } : (e) => { const x = a(e); return x - x * p(e) / 100; }; }
          const b = build(n.r);
          switch (n.op) { case '+': return (e) => a(e) + b(e); case '-': return (e) => a(e) - b(e); case '*': return (e) => a(e) * b(e); case '/': return (e) => a(e) / b(e); case 'mod': return (e) => a(e) % b(e); }
        }
      }
      throw new CalcError('Unsupported');
    };
    return build(ast);
  }

  const api = { evalInner, Dec, CalcError, Q, tokenize, parse, evaluate, evalNode, callFn, format, formatQ, unitSym, localeSeps, parseNumberText, groupDigits, compileNum, FUNCS, KEYWORDS };
  if (isNode) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
