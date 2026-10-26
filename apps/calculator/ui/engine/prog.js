/* Programmer-mode engine: BigInt-backed, fixed word sizes, two's complement signed/unsigned (UI-free). */
(function (g) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  class ProgError extends Error { constructor(m) { super(m); this.name = 'ProgError'; } }

  const maskOf = (bits) => (1n << BigInt(bits)) - 1n;
  const toPattern = (v, bits) => BigInt.asUintN(bits, v);
  const toSignedV = (p, bits) => BigInt.asIntN(bits, p);
  const range = (bits, signed) => (signed ? { min: -(1n << BigInt(bits - 1)), max: (1n << BigInt(bits - 1)) - 1n } : { min: 0n, max: maskOf(bits) });
  const interp = (p, bits, signed) => (signed ? toSignedV(p, bits) : p);

  const WORDS = { and: 'and', or: 'or', xor: 'xor', nand: 'nand', nor: 'nor', not: 'not', lsh: 'lsh', shl: 'lsh', rsh: 'rsh', shr: 'rsh', rol: 'rol', ror: 'ror', mod: 'mod' };
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

  function parseLiteral(text, base) {
    let t = text.toLowerCase().replace(/_/g, ''); let b = base;
    if (t.startsWith('0x')) { b = 16; t = t.slice(2); } else if (t.startsWith('0b') && base !== 16) { b = 2; t = t.slice(2); } else if (t.startsWith('0o')) { b = 8; t = t.slice(2); }
    if (!t) throw new ProgError('Invalid number');
    let v = 0n; const B = BigInt(b);
    for (const ch of t) { const d = DIGITS.indexOf(ch); if (d < 0 || d >= b) throw new ProgError('Invalid digit "' + ch + '" for base ' + b); v = v * B + BigInt(d); }
    parseLiteral.lastBase = b; return v;
  }
  function tokenize(src, base) {
    const out = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '#') { let j = i + 1; while (/[0-9]/.test(src[j] || '')) j++; out.push({ t: 'raw', v: BigInt(src.slice(i + 1, j)) }); i = j; continue; }
      if (/[0-9a-zA-Z_]/.test(c)) {
        let j = i; while (j < src.length && /[0-9a-zA-Z_]/.test(src[j])) j++;
        const w = src.slice(i, j).toLowerCase();
        if (WORDS[w]) out.push({ t: 'op', v: WORDS[w] }); else { const v = parseLiteral(src.slice(i, j), base); out.push({ t: 'num', v, dec: parseLiteral.lastBase === 10 }); }
        i = j; continue;
      }
      if (src.startsWith('<<', i)) { out.push({ t: 'op', v: 'lsh' }); i += 2; continue; }
      if (src.startsWith('>>', i)) { out.push({ t: 'op', v: 'rsh' }); i += 2; continue; }
      const m = { '+': 'add', '-': 'sub', '−': 'sub', '*': 'mul', '×': 'mul', '/': 'div', '÷': 'div', '%': 'mod', '&': 'and', '|': 'or', '^': 'xor', '~': 'not', '(': '(', ')': ')' }[c];
      if (!m) throw new ProgError('Unexpected "' + c + '"');
      out.push({ t: 'op', v: m }); i++;
    }
    out.push({ t: 'end' }); return out;
  }
  // returns {pattern, value, overflow}
  function evalProg(src, o = {}) {
    const bits = o.bits || 64, signed = o.signed !== false, base = o.base || 10; const toks = tokenize(src, base); let p = 0; let overflow = false;
    const mask = maskOf(bits), rg = range(bits, signed);
    const wrapV = (v) => { if (v < rg.min || v > rg.max) overflow = true; return interp(toPattern(v, bits), bits, signed); };
    const pat = (v) => toPattern(v, bits);
    const peekOp = () => (toks[p].t === 'op' ? toks[p].v : null);
    function lvl(names, sub, apply) { let l = sub(); for (;;) { const op = peekOp(); if (op && names.includes(op)) { p++; const r = sub(); l = apply(op, l, r); } else return l; } }
    const expr = () => lvl(['or', 'nor'], xorE, (op, a, b) => { const r = pat(a) | pat(b); return interp(op === 'nor' ? ~r & mask : r, bits, signed); });
    const xorE = () => lvl(['xor'], andE, (op, a, b) => interp(pat(a) ^ pat(b), bits, signed));
    const andE = () => lvl(['and', 'nand'], shiftE, (op, a, b) => { const r = pat(a) & pat(b); return interp(op === 'nand' ? ~r & mask : r, bits, signed); });
    const shiftE = () => lvl(['lsh', 'rsh', 'rol', 'ror'], addE, (op, a, b) => {
      const n = b < 0n ? (overflow = true, 0n) : b; const nb = BigInt(bits);
      if (op === 'lsh') { if (n >= nb) { overflow = overflow || a !== 0n; return 0n; } const r = a << n; if ((pat(a) << n) > mask) overflow = true; return interp(pat(r), bits, signed); }
      if (op === 'rsh') { if (n >= nb) return signed && a < 0n ? -1n : 0n; return a >> n; }
      const k = n % nb; const u = pat(a); const r = op === 'rol' ? ((u << k) | (u >> (nb - k))) & mask : ((u >> k) | (u << (nb - k))) & mask; return interp(r, bits, signed);
    });
    const addE = () => lvl(['add', 'sub'], mulE, (op, a, b) => wrapV(op === 'add' ? a + b : a - b));
    const mulE = () => lvl(['mul', 'div', 'mod'], unaryE, (op, a, b) => {
      if (op === 'mul') return wrapV(a * b);
      if (b === 0n) throw new ProgError('Cannot divide by zero');
      return wrapV(op === 'div' ? a / b : a % b);
    });
    function unaryE() {
      const op = peekOp();
      if (op === 'sub') { p++; if (toks[p].t === 'num' && toks[p].dec && signed && toks[p].v === rg.max + 1n && (toks[p + 1].t === 'end' || toks[p + 1].t === 'op')) { const nt = toks[p++]; return rg.min; } const v = unaryE(); return wrapV(-v); }
      if (op === 'add') { p++; return unaryE(); }
      if (op === 'not') { p++; const v = unaryE(); return interp(~pat(v) & mask, bits, signed); }
      return prim();
    }
    function prim() {
      const t = toks[p++];
      if (t.t === 'raw') return interp(pat(t.v), bits, signed);
      if (t.t === 'num') { let v = t.v; if (v > mask || (signed && t.dec && v > rg.max)) overflow = true; return interp(pat(v), bits, signed); }
      if (t.t === 'op' && t.v === '(') { const v = expr(); if (toks[p].t === 'op' && toks[p].v === ')') p++; else throw new ProgError('Missing )'); return v; }
      throw new ProgError(t.t === 'end' ? 'Incomplete expression' : 'Unexpected input');
    }
    const v = expr(); if (toks[p].t !== 'end') throw new ProgError('Unexpected input');
    return { value: v, pattern: pat(v), overflow };
  }

  const GROUP = { 16: 4, 2: 4, 8: 3, 10: 3 };
  function formatBase(pattern, base, o = {}) {
    const bits = o.bits || 64, signed = o.signed !== false; let s; let neg = false;
    if (base === 10) { const v = interp(toPattern(pattern, bits), bits, signed); neg = v < 0n; s = (neg ? -v : v).toString(); }
    else { s = toPattern(pattern, bits).toString(base).toUpperCase(); if (base === 2 && o.pad) s = s.padStart(bits, '0'); }
    if (o.group !== false) {
      const k = GROUP[base], sep = base === 10 ? (o.sep || ',') : ' '; let out = '';
      for (let i = 0; i < s.length; i++) { if (i && (s.length - i) % k === 0) out += sep; out += s[i]; } s = out;
    }
    return (neg ? '-' : '') + s;
  }
  const bitAt = (pattern, i) => ((pattern >> BigInt(i)) & 1n) === 1n;
  const toggleBit = (pattern, i, bits) => toPattern(pattern ^ (1n << BigInt(i)), bits);
  const OPSYM = { add: '+', sub: '−', mul: '×', div: '÷', mod: 'Mod', and: 'AND', or: 'OR', xor: 'XOR', nand: 'NAND', nor: 'NOR', lsh: '<<', rsh: '>>', rol: 'RoL', ror: 'RoR' };

  class ProgState {
    constructor(o = {}) { this.base = o.base || 10; this.bits = o.bits || 64; this.signed = o.signed !== false; this.group = o.group !== false; this.sepChar = o.sepChar || ','; this.history = []; this.allClear(); }
    allClear() { this.pieces = []; this.open = 0; this.entry = null; this.error = null; this.cur = 0n; this.fresh = false; this.overflow = false; }
    opts() { return { bits: this.bits, signed: this.signed, group: this.group, sep: this.sepChar }; }
    fmt(p, base = this.base) { return formatBase(p, base, this.opts()); }
    maxPos() { return this.base === 10 && this.signed ? maskOf(this.bits - 1) : maskOf(this.bits); }
    entryPattern() { return this.entry != null ? (this.entry.neg ? toPattern(-this.entry.v, this.bits) : this.entry.v) : null; }
    value() { const e = this.entryPattern(); return e != null ? e : this.cur; } // current pattern
    typedText() { const e = this.entry; if (!e) return ''; const t = e.v.toString(this.base).toUpperCase(); return (e.neg ? '-' : '') + t; }
    display() { if (this.error) return this.error; return this.fmt(this.value()); }
    exprText() { return this.pieces.map((p) => (p.k === 'n' ? this.fmt(p.val) : p.k === 'o' ? ' ' + OPSYM[p.op] + ' ' : p.s)).join('').replace(/\s+/g, ' ').trim(); }
    setBase(b) { this.commitEntryToCur(); this.base = b; }
    commitEntryToCur() { if (this.entry) { this.cur = this.entryPattern(); this.entry = null; this.fresh = true; } }
    setBits(b) { const cur = this.value(); this.entry = null; this.bits = b; this.cur = toPattern(interp(cur, 64, false), b); this.pieces = []; this.open = 0; this.overflow = false; }
    setSigned(s) { const cur = this.value(); this.entry = null; this.signed = s; this.cur = cur; }
    setValue(p) { this.entry = null; this.cur = toPattern(BigInt(p), this.bits); this.fresh = true; }
    press(k) {
      if (this.error && k !== 'ac' && k !== 'clear') this.allClear();
      try { this._press(k); } catch (e) { if (e instanceof ProgError) { this.error = e.message; this.pieces = []; this.open = 0; this.entry = null; } else throw e; }
    }
    _press(k) {
      if (/^[0-9a-f]$/i.test(k)) return this.digit(k.toLowerCase());
      if (k in OPSYM && k !== 'sub' || k === 'sub') return this.binary(k);
      switch (k) {
        case 'not': { const v = this.value(); this.cur = toPattern(~v, this.bits); this.entry = null; this.fresh = true; return; }
        case 'neg': { const v = interp(this.value(), this.bits, true); this.cur = toPattern(-v, this.bits); this.entry = null; this.fresh = true; return; }
        case 'eq': return this.equals();
        case 'lp': if (this.entry || this.fresh && false) { this.commit(); } this.pieces.push({ k: '(', s: '(', v: '(' }); this.open++; return;
        case 'rp': if (this.open > 0) { if (this.entry || !this.pieces.length || this.pieces[this.pieces.length - 1].k !== 'o') this.commit(); this.pieces.push({ k: ')', s: ')', v: ')' }); this.open--; } return;
        case 'clear': if (this.entry) { this.entry = null; return; } return this.allClear();
        case 'ac': return this.allClear();
        case 'back': { const e = this.entry; if (e) { const t = e.v.toString(this.base).slice(0, -1); e.v = t ? BigInt(this.parse(t)) : 0n; if (e.v === 0n) e.neg = false; } return; }
      }
      throw new Error('unknown key ' + k);
    }
    parse(t) { return parseLiteral(t, this.base); }
    digit(ch) {
      const d = DIGITS.indexOf(ch); if (d >= this.base) return;
      if (this.fresh && !this.entry) { this.fresh = false; if (!this.pieces.length) this.cur = 0n; }
      const e = this.entry || (this.entry = { v: 0n, neg: false });
      const nv = e.v * BigInt(this.base) + BigInt(d);
      const lim = e.neg ? this.maxPos() + 1n : this.maxPos(); if (nv > lim) return; e.v = nv;
    }
    commit() {
      let pat; if (this.entry) { pat = this.entryPattern(); this.entry = null; } else { pat = this.cur; }
      this.pieces.push({ k: 'n', val: pat, v: '#' + pat.toString() });
    }
    binary(k) {
      if (this.entry) this.commit();
      else { const lp = this.pieces[this.pieces.length - 1]; if (!lp || lp.k === 'o') { if (lp) this.pieces.pop(); this.pieces.push({ k: 'n', val: this.cur, v: '#' + this.cur.toString() }); } else if (lp.k === '(') { this.pieces.push({ k: 'n', val: this.cur, v: '#' + this.cur.toString() }); } }
      if (this.fresh) this.fresh = false;
      this.pieces.push({ k: 'o', op: k, v: ' ' + k + ' ' });
    }
    equals() {
      if (this.entry) this.commit();
      else if (!this.pieces.length) return;
      const lp = this.pieces[this.pieces.length - 1]; if (lp.k === 'o') this.pieces.push({ k: 'n', val: this.cur, v: '#' + this.cur.toString() });
      const text = this.exprText() + ')'.repeat(this.open); const s = this.pieces.map((p) => p.v).join('') + ')'.repeat(this.open);
      const r = evalProg(s.replace(/ (add|sub|mul|div) /g, (m, o) => ({ add: '+', sub: '-', mul: '*', div: '/' }[o])), { bits: this.bits, signed: this.signed, base: 10 });
      this.overflow = r.overflow; this.cur = r.pattern; this.pieces = []; this.open = 0; this.fresh = true;
      this.history.unshift({ expr: text, result: this.fmt(r.pattern) });
    }
  }
  const api = { ProgError, evalProg, formatBase, bitAt, toggleBit, maskOf, range, toPattern, toSignedV, interp, parseLiteral, ProgState, OPSYM };
  if (isNode) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
