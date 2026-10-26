/* CalcState: the key-driven calculator model used by Basic and Scientific modes (UI-free, testable). */
(function (g) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const C = isNode ? require('./calc.js') : g.ZC;
  const { Dec, CalcError } = C;

  const BIN = { add: { s: '+', v: '+' }, sub: { s: '−', v: '-' }, mul: { s: '×', v: '*' }, div: { s: '÷', v: '/' }, pow: { s: '^', v: '^' },
    yroot: { s: 'ʸ√', v: ' yroot ' }, logy: { s: 'logᵧ', v: ' logy ' }, mod: { s: 'mod', v: ' mod ' }, ncr: { s: 'nCr', v: ' ncr ' }, npr: { s: 'nPr', v: ' npr ' } };
  const UN = { // key -> [label fn, compute]
    sq: ['sq', (x) => x.mul(x), (s) => '(' + s + ')²'], cube: ['cube', (x) => x.mul(x).mul(x), (s) => '(' + s + ')³'],
    sqrt: ['sqrt', null, (s) => '√(' + s + ')'], cbrt: ['cbrt', null, (s) => '∛(' + s + ')'], inv: ['inv', null, (s) => '1/(' + s + ')'], fact: ['fact', null, (s) => '(' + s + ')!'],
    abs: ['abs', null, (s) => '|' + s + '|'], exp: ['exp', null, (s) => 'e^(' + s + ')'], tenx: [null, (x) => Dec.of(10).pow(x), (s) => '10^(' + s + ')'], twox: [null, (x) => Dec.of(2).pow(x), (s) => '2^(' + s + ')'],
    ln: ['ln', null, (s) => 'ln(' + s + ')'], log: ['log', null, (s) => 'log(' + s + ')'], log2: ['log2', null, (s) => 'log₂(' + s + ')'],
    sin: ['sin'], cos: ['cos'], tan: ['tan'], asin: ['asin'], acos: ['acos'], atan: ['atan'], sinh: ['sinh'], cosh: ['cosh'], tanh: ['tanh'], asinh: ['asinh'], acosh: ['acosh'], atanh: ['atanh'],
  };
  const PLAIN_LABEL = { sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹' };

  class CalcState {
    constructor(o = {}) {
      this.angle = o.angle || 'deg'; this.sep = o.sep || { decimal: '.', group: ',' }; this.group = o.group !== false; this.digits = o.digits || 16;
      this.memory = Dec.ZERO; this.hasMemory = false; this.history = []; this.maxHistory = 200;
      this.allClear();
    }
    allClear() { this.pieces = []; this.open = 0; this.entry = null; this.error = null; this.last = Dec.ZERO; this.rep = null; this.fresh = false; }
    fmt(d) { return C.format(d, { digits: this.digits, group: this.group, sep: this.sep }); }
    // ---- entry helpers
    entryValue() {
      const e = this.entry; if (!e) return null;
      if (!e.typed) return e.val;
      let t = e.text.replace(/e[+-]?$/, ''); if (t === '-' || t === '' || t === '-0.' && false) t = '0';
      try { return Dec.parse(t); } catch (x) { return Dec.ZERO; }
    }
    current() { const v = this.entryValue(); if (v) return v; const p = this.previewValue(); return p || this.last; }
    entryLabel() { const e = this.entry; return e && !e.typed && e.label ? e.label : null; }
    setComputed(val, label) { this.entry = { typed: false, val, label }; this.fresh = false; }
    startEntry(t) { this.entry = { typed: true, text: t }; }
    commit() { // entry -> expression piece
      const e = this.entry; if (!e) return; const v = this.entryValue();
      const s = e.typed ? this.displayEntryText() : (e.label || this.fmt(v));
      this.pieces.push({ k: 'n', s, v: v.sign() < 0 ? '(' + v.toPlain() + ')' : v.toPlain(), val: v }); this.entry = null;
    }
    lastPiece() { return this.pieces[this.pieces.length - 1]; }
    // ---- expression building / evaluation
    exprString(extraClose = true, dropTrailingOp = true) {
      const ps = this.pieces.slice(); let open = this.open;
      if (dropTrailingOp) while (ps.length && ps[ps.length - 1].k === 'o') ps.pop();
      if (dropTrailingOp) { while (ps.length && ps[ps.length - 1].k === '(') { ps.pop(); open--; } }
      let s = ps.map((p) => p.v).join(''); if (extraClose) s += ')'.repeat(Math.max(0, open)); return s;
    }
    previewValue() {
      if (!this.pieces.length) return null;
      const s = this.exprString(); if (!s) return null;
      try { return C.evaluate(s, { angle: this.angle, autoClose: true }); } catch (e) { return null; }
    }
    exprText() { return this.pieces.map((p) => (p.k === 'o' ? ' ' + p.s + ' ' : p.s)).join('').replace(/\s+/g, ' ').trim(); }
    displayEntryText() {
      const e = this.entry; if (!e) return '';
      if (!e.typed) return this.fmt(e.val);
      let t = e.text; let exp = ''; const i = t.indexOf('e'); if (i >= 0) { exp = t.slice(i); t = t.slice(0, i); }
      const neg = t[0] === '-'; if (neg) t = t.slice(1); const [ip, fp] = t.split('.');
      return (neg ? '-' : '') + (this.group ? C.groupDigits(ip, this.sep.group) : ip) + (fp !== undefined ? this.sep.decimal + fp : '') + exp;
    }
    displayText() {
      if (this.error) return this.error;
      if (this.entry) return this.displayEntryText();
      const p = this.previewValue(); return this.fmt(p || this.last);
    }
    displayValue() { return this.error ? null : this.current(); }
    // ---- key dispatch
    press(k) {
      if (this.error && k !== 'ac' && k !== 'clear') { this.allClear(); }
      try { this._press(k); } catch (e) {
        if (e instanceof CalcError) { this.error = e.message; this.pieces = []; this.open = 0; this.entry = null; this.rep = null; } else throw e;
      }
    }
    _press(k) {
      if (/^[0-9]$/.test(k)) return this.digit(k);
      if (k === '.') return this.dot();
      if (k in BIN) return this.binary(k);
      if (k in UN) return this.unary(k);
      switch (k) {
        case 'eq': return this.equals();
        case 'clear': return this.entry && !this.fresh ? (this.entry = null) : this.allClear();
        case 'ac': return this.allClear();
        case 'back': return this.back();
        case 'neg': return this.negate();
        case 'pct': return this.percent();
        case 'lp': return this.lparen();
        case 'rp': return this.rparen();
        case 'ee': return this.ee();
        case 'pi': return this.setComputed(Dec.PI, 'π');
        case 'e': return this.setComputed(Dec.E, 'e');
        case 'rand': return this.setComputed(C.callFn('rand', [], this), 'rand');
        case 'ans': return this.setComputed(this.last, 'ans');
        case 'mc': this.memory = Dec.ZERO; this.hasMemory = false; return;
        case 'mplus': this.memory = this.memory.add(this.current()); this.hasMemory = true; this.fresh = true; return this.markUsed();
        case 'mminus': this.memory = this.memory.sub(this.current()); this.hasMemory = true; this.fresh = true; return this.markUsed();
        case 'ms': this.memory = this.current(); this.hasMemory = true; return this.markUsed();
        case 'mr': return this.setComputed(this.memory, null);
      }
      throw new Error('unknown key ' + k);
    }
    markUsed() { const v = this.entryValue(); if (v && this.entry && this.entry.typed) this.entry = { typed: false, val: v, label: null }; }
    digit(d) {
      if (this.fresh) { this.pieces = []; this.open = 0; this.fresh = false; this.entry = null; }
      const e = this.entry;
      if (!e || !e.typed) { this.startEntry(d); return; }
      const digits = e.text.replace(/[^0-9]/g, '').length; if (digits >= 16 + (e.text.includes('e') ? 3 : 0)) return;
      if (e.text === '0') e.text = d; else if (e.text === '-0') e.text = '-' + d; else e.text += d;
    }
    dot() {
      if (this.fresh) { this.pieces = []; this.open = 0; this.fresh = false; this.entry = null; }
      const e = this.entry; if (!e || !e.typed) { this.startEntry('0.'); return; }
      if (e.text.includes('.') || e.text.includes('e')) return; e.text += '.';
    }
    ee() {
      if (this.fresh) { this.pieces = []; this.open = 0; this.fresh = false; this.entry = null; }
      let e = this.entry; if (!e) { this.startEntry('1e'); return; }
      if (!e.typed) { this.startEntry(this.entryValue().toPlain() + 'e'); return; }
      if (!e.text.includes('e')) e.text += 'e';
    }
    negate() {
      const e = this.entry;
      if (!e) { this.startEntry('-0'); return; }
      if (e.typed) {
        const i = e.text.indexOf('e');
        if (i >= 0) { const m = e.text.slice(0, i), x = e.text.slice(i + 1); e.text = m + 'e' + (x[0] === '-' ? x.slice(1) : '-' + x); }
        else e.text = e.text[0] === '-' ? e.text.slice(1) : '-' + e.text;
      } else { e.val = e.val.neg(); e.label = e.label ? '-(' + e.label + ')' : null; }
    }
    back() {
      const e = this.entry;
      if (e && e.typed) { e.text = e.text.slice(0, -1); if (e.text === '' || e.text === '-') e.text = '0'; if (/e[-]?$/.test(e.text) && false) e.text = e.text; return; }
      if (e) { this.entry = null; return; }
      const lp = this.lastPiece(); if (!lp) return; this.pieces.pop(); if (lp.k === '(') this.open--; if (lp.k === ')') this.open++;
      if (lp.k === 'n') { this.startEntry(lp.val.toPlain()); }
    }
    binary(k) {
      if (this.fresh) { // continue from result
        this.pieces = []; this.open = 0; this.fresh = false;
      }
      if (this.entry) this.commit();
      else if (!this.pieces.length) { this.pieces.push({ k: 'n', s: this.fmt(this.last), v: this.last.sign() < 0 ? '(' + this.last.toPlain() + ')' : this.last.toPlain(), val: this.last }); }
      const lp = this.lastPiece();
      if (lp.k === '(') { if (k === 'sub') { this.startEntry('-0'); } return; }
      if (lp.k === 'o') this.pieces.pop();
      this.pieces.push({ k: 'o', s: BIN[k].s, v: BIN[k].v, op: k });
    }
    unary(k) {
      let v = this.current(); const lbl = this.entryLabel() || (this.entry && this.entry.typed ? this.displayEntryText() : this.fmt(v));
      const def = UN[k]; let r; let label;
      if (def[0] && def[0] !== null && def.length >= 1 && !def[1]) r = C.callFn(def[0], [v], this);
      else if (def[1]) r = def[1](v); else r = C.callFn(def[0], [v], this);
      label = def[2] ? def[2](lbl) : PLAIN_LABEL[k] + '(' + lbl + ')';
      this.setComputed(r, label);
    }
    lparen() {
      if (this.fresh) { this.pieces = []; this.open = 0; this.fresh = false; }
      if (this.entry) { this.commit(); this.pieces.push({ k: 'o', s: '×', v: '*', op: 'mul' }); }
      else { const lp = this.lastPiece(); if (lp && (lp.k === 'n' || lp.k === ')')) this.pieces.push({ k: 'o', s: '×', v: '*', op: 'mul' }); }
      this.pieces.push({ k: '(', s: '(', v: '(' }); this.open++;
    }
    rparen() {
      if (this.open <= 0) return;
      if (this.entry) this.commit(); else { const lp = this.lastPiece(); if (lp && (lp.k === 'o' || lp.k === '(')) { const v = this.last; this.pieces.push({ k: 'n', s: this.fmt(v), v: v.toPlain(), val: v }); } }
      this.pieces.push({ k: ')', s: ')', v: ')' }); this.open--;
    }
    percent() {
      const b = this.current(); const lp = this.lastPiece(); let r;
      if (!this.entry && lp && lp.k === 'n') { /* nothing typed after a number */ }
      if (lp && lp.k === 'o' && (lp.op === 'add' || lp.op === 'sub') && !this.fresh) {
        const lhsStr = this.exprString(true, true); const lhs = C.evaluate(lhsStr, { angle: this.angle, autoClose: true });
        r = lhs.mul(b).div(100);
      } else r = b.div(100);
      this.setComputed(r, this.fmt(b) + '%');
    }
    equals() {
      const wasFresh = this.fresh; this.fresh = false;
      if (wasFresh && this.rep) this.entry = null;
      if (this.entry) this.commit();
      else if (!this.pieces.length) {
        if (this.rep) { // repeat last operation
          const { op, operand } = this.rep; const expr = '(' + this.last.toPlain() + ')' + BIN[op].v + '(' + operand.toPlain() + ')';
          const r = C.evaluate(expr, { angle: this.angle }); this.addHistory(this.fmt(this.last) + ' ' + BIN[op].s + ' ' + this.fmt(operand), r, expr);
          this.last = r; this.setComputed(r, null); this.fresh = true; return;
        }
        return;
      }
      let lp = this.lastPiece();
      if (lp && lp.k === 'o') { const v = this.current(); this.pieces.push({ k: 'n', s: this.fmt(v), v: v.sign() < 0 ? '(' + v.toPlain() + ')' : v.toPlain(), val: v }); }
      while (this.lastPiece() && this.lastPiece().k === '(') { this.pieces.pop(); this.open--; }
      const text = this.exprText() + ')'.repeat(this.open); const s = this.exprString(true, true);
      const r = C.evaluate(s, { angle: this.angle, autoClose: true });
      // remember trailing "op number" for repeated equals
      const n = this.pieces.length; this.rep = null;
      if (n >= 3 && this.pieces[n - 1].k === 'n' && this.pieces[n - 2].k === 'o') this.rep = { op: this.pieces[n - 2].op, operand: this.pieces[n - 1].val };
      this.addHistory(text, r, s); this.pieces = []; this.open = 0; this.last = r; this.setComputed(r, null); this.fresh = true;
    }
    pasteValue(d) { if (this.error) this.allClear(); if (this.fresh) { this.pieces = []; this.open = 0; this.fresh = false; } this.entry = { typed: true, text: d.toPlain() }; }
    // rebuild the expression line from text such as "12 + 3 × (4 - 1)"; falls back to one compound piece
    loadExpr(text, result) {
      this.allClear();
      try {
        const toks = C.tokenize(text); const ops = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '^': 'pow' }; const ps = []; let open = 0;
        for (const t of toks) {
          if (t.t === 'end') break;
          if (t.t === 'num') { const v = Dec.parse(t.v); ps.push({ k: 'n', s: this.fmt(v), v: v.toPlain(), val: v }); }
          else if (t.t === 'op' && ops[t.v]) ps.push({ k: 'o', s: BIN[ops[t.v]].s, v: BIN[ops[t.v]].v, op: ops[t.v] });
          else if (t.t === 'op' && t.v === '(') { ps.push({ k: '(', s: '(', v: '(' }); open++; } else if (t.t === 'op' && t.v === ')') { ps.push({ k: ')', s: ')', v: ')' }); open--; }
          else throw new Error('complex');
        }
        if (open !== 0) throw new Error('unbalanced'); this.pieces = ps; this.open = 0; C.evaluate(this.exprString(), { angle: this.angle, autoClose: true });
      } catch (e) { this.pieces = [{ k: 'n', s: text, v: result.sign() < 0 ? '(' + result.toPlain() + ')' : result.toPlain(), val: result }]; this.open = 0; }
    }
    addHistory(expr, r, ev) { this.history.unshift({ expr, result: r.toPlain(), ev: ev || null, angle: this.angle }); if (this.history.length > this.maxHistory) this.history.pop(); }
  }
  const api = { CalcState };
  if (isNode) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
