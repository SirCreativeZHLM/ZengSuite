/* Dec: arbitrary-precision decimal (BigInt mantissa x 10^exponent). Exact + - x; division/sqrt to 34 significant digits. */
(function (g) {
  'use strict';
  const PREC = 34;
  const TEN = 10n;
  const p10 = (k) => TEN ** BigInt(k);
  class CalcError extends Error { constructor(m) { super(m); this.name = 'CalcError'; } }

  class Dec {
    constructor(n, e = 0) {
      if (n === 0n) { this.n = 0n; this.e = 0; return; }
      // strip trailing zeros
      if (n % TEN === 0n) {
        let s = n.toString(); let neg = false; if (s[0] === '-') { neg = true; s = s.slice(1); }
        let z = 0; while (s[s.length - 1 - z] === '0') z++;
        n = BigInt((neg ? '-' : '') + s.slice(0, s.length - z)); e += z;
      }
      this.n = n; this.e = e;
    }
    static of(x) {
      if (x instanceof Dec) return x;
      if (typeof x === 'bigint') return new Dec(x, 0);
      if (typeof x === 'number') return Dec.fromNumber(x);
      return Dec.parse(String(x));
    }
    static parse(str) {
      const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/.exec(str);
      if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new CalcError('Invalid number');
      const frac = m[3] || '';
      let n = BigInt((m[2] || '0') + frac); if (m[1] === '-') n = -n;
      return new Dec(n, (m[4] ? parseInt(m[4], 10) : 0) - frac.length);
    }
    static fromNumber(x, sig = 15) {
      if (!isFinite(x)) throw new CalcError(isNaN(x) ? 'Not a number' : 'Overflow');
      if (x === 0) return Dec.ZERO;
      return Dec.parse(x.toPrecision(sig));
    }
    get len() { return this.n < 0n ? this.n.toString().length - 1 : this.n.toString().length; }
    get exp10() { return this.len - 1 + this.e; } // exponent of leading digit
    isZero() { return this.n === 0n; }
    sign() { return this.n === 0n ? 0 : this.n < 0n ? -1 : 1; }
    isInt() { return this.e >= 0; }
    neg() { return new Dec(-this.n, this.e); }
    abs() { return this.n < 0n ? this.neg() : this; }
    add(o) { o = Dec.of(o); if (this.n === 0n) return o; if (o.n === 0n) return this; const e = Math.min(this.e, o.e);
      if (Math.abs(this.e - o.e) > 100000) throw new CalcError('Overflow');
      return new Dec(this.n * p10(this.e - e) + o.n * p10(o.e - e), e); }
    sub(o) { return this.add(Dec.of(o).neg()); }
    mul(o) { o = Dec.of(o); return new Dec(this.n * o.n, this.e + o.e); }
    cmp(o) { o = Dec.of(o); const d = this.sub(o); return d.sign(); }
    eq(o) { return this.cmp(o) === 0; }
    div(o, prec = PREC) {
      o = Dec.of(o); if (o.n === 0n) throw new CalcError('Cannot divide by zero');
      if (this.n === 0n) return Dec.ZERO;
      const s = Math.max(0, prec + 3 + o.len - this.len);
      const q = (this.n * p10(s)) / o.n;
      return new Dec(q, this.e - o.e - s).roundSig(prec);
    }
    // round half away from zero to `p` significant digits
    roundSig(p) {
      const l = this.len; if (l <= p) return this;
      const drop = l - p; const d = p10(drop); const neg = this.n < 0n; let a = neg ? -this.n : this.n;
      let q = a / d; const r = a % d; if (r * 2n >= d) q += 1n;
      return new Dec(neg ? -q : q, this.e + drop);
    }
    // round to `dp` decimal places (half away from zero)
    roundDp(dp) {
      if (-this.e <= dp) return this; const drop = -this.e - dp; const d = p10(drop); const neg = this.n < 0n; let a = neg ? -this.n : this.n;
      let q = a / d; if ((a % d) * 2n >= d) q += 1n; return new Dec(neg ? -q : q, -dp);
    }
    trunc() { if (this.e >= 0) return this; const q = this.n / p10(-this.e); return new Dec(q, 0); }
    floor() { const t = this.trunc(); return this.n < 0n && !t.eq(this) ? t.sub(1n) : t; }
    ceil() { const t = this.trunc(); return this.n > 0n && !t.eq(this) ? t.add(1n) : t; }
    round() { return this.roundDp(0); }
    toBigInt() { return this.e >= 0 ? this.n * p10(this.e) : this.n / p10(-this.e); }
    // truncated remainder-like modulo (sign follows dividend, as most calculators)
    mod(o) { o = Dec.of(o); if (o.n === 0n) throw new CalcError('Cannot divide by zero'); const q = this.div(o, 60).trunc(); return this.sub(q.mul(o)); }
    pow(x) {
      x = Dec.of(x);
      if (x.isInt()) {
        const k = x.toBigInt(); if (k === 0n) return Dec.ONE;
        const ak = k < 0n ? -k : k;
        if (this.n === 0n) { if (k < 0n) throw new CalcError('Cannot divide by zero'); return Dec.ZERO; }
        if (ak <= 100000n && BigInt(this.len) * ak <= 20000n) {
          const r = new Dec(this.n ** ak, this.e * Number(ak));
          return k < 0n ? Dec.ONE.div(r) : r;
        }
      }
      if (this.n < 0n) {
        // negative base with fractional exponent: allow odd roots 1/k
        const inv = Dec.ONE.div(x, 20);
        if (inv.isInt() && inv.toBigInt() % 2n !== 0n) return this.neg().pow(x).neg();
        throw new CalcError('Invalid input');
      }
      if (this.n === 0n) return Dec.ZERO;
      const r = Math.pow(this.toNumber(), x.toNumber());
      if (!isFinite(r)) throw new CalcError('Overflow');
      return Dec.fromNumber(r);
    }
    sqrt(prec = PREC) {
      if (this.n < 0n) throw new CalcError('Invalid input');
      if (this.n === 0n) return Dec.ZERO;
      let n = this.n, e = this.e; if (e % 2 !== 0) { n *= TEN; e -= 1; }
      const k = Math.max(0, prec + 2 - Math.floor(n.toString().length / 2));
      const big = n * p10(2 * k);
      // integer sqrt (Newton)
      let x = BigInt('1' + '0'.repeat(Math.ceil(big.toString().length / 2)));
      for (;;) { const y = (x + big / x) >> 1n; if (y >= x) break; x = y; }
      return new Dec(x, e / 2 - k).roundSig(prec);
    }
    toNumber() { return parseFloat(this.toSci(25)); }
    // plain decimal string, no exponent
    toPlain() {
      if (this.n === 0n) return '0';
      const neg = this.n < 0n; let s = (neg ? -this.n : this.n).toString();
      if (this.e >= 0) s += '0'.repeat(this.e);
      else { const k = -this.e; if (s.length <= k) s = '0.' + '0'.repeat(k - s.length) + s; else s = s.slice(0, s.length - k) + '.' + s.slice(s.length - k); }
      return (neg ? '-' : '') + s;
    }
    // scientific: d.ddde+N
    toSci(sig = 16) {
      if (this.n === 0n) return '0';
      const r = this.roundSig(sig); const neg = r.n < 0n; const s = (neg ? -r.n : r.n).toString(); const x = r.exp10;
      return (neg ? '-' : '') + s[0] + (s.length > 1 ? '.' + s.slice(1) : '') + 'e' + (x >= 0 ? '+' : '-') + Math.abs(x);
    }
    toString() { return this.toPlain(); }
  }
  Dec.ZERO = new Dec(0n); Dec.ONE = new Dec(1n);
  Dec.PI = Dec.parse('3.14159265358979323846264338327950288');
  Dec.E = Dec.parse('2.71828182845904523536028747135266250');
  Dec.PREC = PREC;

  const api = { Dec, CalcError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
