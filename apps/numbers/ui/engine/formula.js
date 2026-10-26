/* ZengGrid formula language: tokenizer, parser, printer, reference rewriting, evaluator. No eval/new Function. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { ZErr, E, Range, MAXR, MAXC } = ZN; const F = ZN.F; const { isErr, toNum, toStr, scalar, cmp } = F;
  const FM = ZN.formula = {};

  // ---------- references ----------
  const CELL = '\\$?[A-Za-z]{1,3}\\$?\\d+';
  const SHEET = "(?:'(?:[^']|'')+'|[A-Za-z_\\u00a1-\\uffff][\\w.\\u00a1-\\uffff]*)!";
  const REF_RE = new RegExp('(' + SHEET + ')?(?:(' + CELL + ')(?::(' + CELL + '))?|(\\$?[A-Za-z]{1,3}):(\\$?[A-Za-z]{1,3})(?![\\w(.])|(\\$?\\d+):(\\$?\\d+)(?![\\w(.]))', 'y');
  const unq = (s) => (s[0] === "'" ? s.slice(1, -1).replace(/''/g, "'") : s);
  const parseCell = (s) => { const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(s); const c = ZN.colIndex(m[2].toUpperCase()), r = +m[4] - 1; return { r, c, ar: !!m[3], ac: !!m[1], bad: c >= MAXC || r >= MAXR || r < 0 }; };
  function refFromMatch(m) {
    const sheet = m[1] ? unq(m[1].slice(0, -1)) : null;
    if (m[2]) {
      const a = parseCell(m[2]), b = m[3] ? parseCell(m[3]) : a; if (a.bad || b.bad) return null;
      return { sheet, r1: a.r, c1: a.c, r2: b.r, c2: b.c, ar1: a.ar, ac1: a.ac, ar2: b.ar, ac2: b.ac, kind: m[3] ? 'range' : 'cell' };
    }
    if (m[4]) { const a = m[4], b = m[5]; const c1 = ZN.colIndex(a.replace('$', '').toUpperCase()), c2 = ZN.colIndex(b.replace('$', '').toUpperCase()); if (c1 >= MAXC || c2 >= MAXC) return null; return { sheet, r1: 0, r2: MAXR - 1, c1, c2, ar1: true, ar2: true, ac1: a[0] === '$', ac2: b[0] === '$', kind: 'cols' }; }
    const a = m[6], b = m[7]; const r1 = +a.replace('$', '') - 1, r2 = +b.replace('$', '') - 1; if (r1 < 0 || r2 < 0 || r1 >= MAXR || r2 >= MAXR) return null;
    return { sheet, r1, r2, c1: 0, c2: MAXC - 1, ac1: true, ac2: true, ar1: a[0] === '$', ar2: b[0] === '$', kind: 'rows' };
  }
  const sheetNeedsQuote = (n) => !/^[A-Za-z_][\w.]*$/.test(n) || /^[A-Za-z]{1,3}\d+$/.test(n) || /^(TRUE|FALSE)$/i.test(n);
  const quoteSheet = (n) => (sheetNeedsQuote(n) ? "'" + n.replace(/'/g, "''") + "'" : n);
  FM.quoteSheet = quoteSheet;
  const printRef = (x) => {
    const sh = x.sheet != null ? quoteSheet(x.sheet) + '!' : ''; const cn = ZN.colName;
    if (x.kind === 'cols') return sh + (x.ac1 ? '$' : '') + cn(x.c1) + ':' + (x.ac2 ? '$' : '') + cn(x.c2);
    if (x.kind === 'rows') return sh + (x.ar1 ? '$' : '') + (x.r1 + 1) + ':' + (x.ar2 ? '$' : '') + (x.r2 + 1);
    const a = (x.ac1 ? '$' : '') + cn(x.c1) + (x.ar1 ? '$' : '') + (x.r1 + 1);
    if (x.kind === 'cell') return sh + a; return sh + a + ':' + (x.ac2 ? '$' : '') + cn(x.c2) + (x.ar2 ? '$' : '') + (x.r2 + 1);
  };
  FM.printRef = printRef;
  FM.parseRef = (s) => { REF_RE.lastIndex = 0; const m = REF_RE.exec(s); if (!m || m[0].length !== s.length) return null; return refFromMatch(m); };

  // ---------- tokenizer ----------
  const isIdStart = (ch) => /[A-Za-z_\\¡-￿]/.test(ch);
  const isIdChar = (ch) => /[\w.¡-￿?]/.test(ch);
  FM.tokenize = (src) => {
    const toks = []; let i = 0; const n = src.length;
    const push = (type, start, end, extra) => toks.push(Object.assign({ type, text: src.slice(start, end), start, end }, extra));
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { let j = i; while (j < n && /\s/.test(src[j])) j++; push('ws', i, j); i = j; continue; }
      if (ch === '"') { let j = i + 1, s = ''; for (;;) { if (j >= n) throw new FM.ParseError('Unterminated string', i); if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } push('str', i, j + 1, { value: s }); i = j + 1; continue; }
      if (ch === '#') { const m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|CIRC!|GETTING_DATA)/i.exec(src.slice(i)); if (m) { push('err', i, i + m[0].length, { value: ZN.errFromCode(m[0]) }); i += m[0].length; continue; } throw new FM.ParseError('Unexpected #', i); }
      if (/[0-9.]/.test(ch)) {
        // row range like 1:3 or sheet-less numbers
        REF_RE.lastIndex = i; const rm = /^\$?\d+:\$?\d+(?![\w(.])/.exec(src.slice(i, i + 24));
        if (rm && toks.length && !(toks[toks.length - 1].type === 'ref') ) { const mm = new RegExp(REF_RE.source, 'y'); mm.lastIndex = i; const m = mm.exec(src); if (m && m[6]) { const r = refFromMatch(m); if (r) { push('ref', i, i + m[0].length, { ref: r }); i += m[0].length; continue; } } }
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i)); if (!m) { throw new FM.ParseError('Bad number', i); }
        push('num', i, i + m[0].length, { value: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (ch === "'" || isIdStart(ch) || ch === '$') {
        REF_RE.lastIndex = i; const m = REF_RE.exec(src);
        if (m) { const end = i + m[0].length; const nx = src[end]; if (!(nx && (/[\w.]/.test(nx) || nx === '(' )) || (m[1] && nx !== '(' && !/[\w.]/.test(nx))) { const r = refFromMatch(m); if (r) { push('ref', i, end, { ref: r }); i = end; continue; } } }
        if (ch === "'") throw new FM.ParseError('Bad sheet name', i);
        if (ch === '$') throw new FM.ParseError('Unexpected $', i);
        let j = i + 1; while (j < n && isIdChar(src[j])) j++;
        // trailing ? is only valid for identifiers like ISxxx? no: strip a trailing '?' (not part of names)
        while (src[j - 1] === '?') j--;
        // table reference: Name[...]
        if (src[j] === '[') { let d = 0, k = j; for (; k < n; k++) { if (src[k] === '[') d++; else if (src[k] === ']') { d--; if (d === 0) { k++; break; } } } if (d === 0) { push('tref', i, k, { table: src.slice(i, j), spec: src.slice(j, k) }); i = k; continue; } }
        const word = src.slice(i, j); let k = j; while (k < n && src[k] === ' ') k++;
        if (src[j] === '(') push('func', i, j, { name: word }); else if (/^(TRUE|FALSE)$/i.test(word)) push('bool', i, j, { value: word.toUpperCase() === 'TRUE' }); else push('name', i, j, { name: word });
        i = j; continue;
      }
      if (ch === '[') { let d = 0, k = i; for (; k < n; k++) { if (src[k] === '[') d++; else if (src[k] === ']') { d--; if (d === 0) { k++; break; } } } push('tref', i, k, { table: '', spec: src.slice(i, k) }); i = k; continue; }
      const two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') { push('op', i, i + 2); i += 2; continue; }
      if ('+-*/^&=<>%:@#'.includes(ch)) { push('op', i, i + 1); i++; continue; }
      if (ch === '(' || ch === ')') { push('paren', i, i + 1); i++; continue; }
      if (ch === ',' || ch === ';') { push('sep', i, i + 1); i++; continue; }
      if (ch === '{' || ch === '}') { push('brace', i, i + 1); i++; continue; }
      throw new FM.ParseError("Unexpected '" + ch + "'", i);
    }
    return toks;
  };
  class ParseError extends Error { constructor(m, pos) { super(m); this.pos = pos; } }
  FM.ParseError = ParseError;

  // ---------- parser ----------
  const BIN = { '=': [1, 'L'], '<>': [1, 'L'], '<': [1, 'L'], '>': [1, 'L'], '<=': [1, 'L'], '>=': [1, 'L'], '&': [2, 'L'], '+': [3, 'L'], '-': [3, 'L'], '*': [4, 'L'], '/': [4, 'L'], '^': [5, 'L'] };
  FM.parse = (src) => {
    if (src[0] === '=') src = src.slice(1);
    const toks = FM.tokenize(src).filter((t) => t.type !== 'ws'); let p = 0;
    const peek = () => toks[p]; const next = () => toks[p++];
    const isOp = (t, s) => t && t.type === 'op' && t.text === s; const isT = (t, ty, s) => t && t.type === ty && (s === undefined || t.text === s);
    function expect(ty, s) { const t = next(); if (!t || t.type !== ty || (s && t.text !== s)) throw new ParseError('Expected ' + (s || ty), t ? t.start : src.length); return t; }
    function parseExpr(min) {
      let left = parseUnary();
      for (;;) {
        const t = peek(); if (!t || t.type !== 'op' || !BIN[t.text]) break; const [prec] = BIN[t.text]; if (prec < min) break; next();
        const right = parseExpr(prec + 1); left = { t: 'bin', op: t.text, l: left, r: right };
      }
      return left;
    }
    function parseUnary() { const t = peek(); if (t && t.type === 'op' && (t.text === '-' || t.text === '+')) { next(); const e = parseUnary(); return t.text === '-' ? { t: 'un', op: '-', e } : e; } if (t && t.type === 'op' && t.text === '@') { next(); return parseUnary(); } return parsePostfix(); }
    function parsePostfix() {
      let e = parsePrimary();
      for (;;) {
        const t = peek();
        if (isOp(t, '%')) { next(); e = { t: 'pct', e }; }
        else if (isOp(t, '#')) { next(); e = { t: 'spill', e }; }
        else if (isOp(t, ':')) { next(); const r = parsePrimary(); e = { t: 'rng', l: e, r }; }
        else if (t && t.type === 'paren' && t.text === '(' && (e.t === 'call' || e.t === 'callx' || e.t === 'name' && false)) { next(); e = { t: 'callx', fn: e, args: parseArgs() }; }
        else break;
      }
      return e;
    }
    function parseArgs() {
      const args = []; if (isT(peek(), 'paren', ')')) { next(); return args; }
      for (;;) {
        const t = peek(); if (!t) throw new ParseError('Missing )', src.length);
        if (t.type === 'sep' || isT(t, 'paren', ')')) args.push({ t: 'missing' }); else args.push(parseExpr(1));
        const s = next(); if (!s) throw new ParseError('Missing )', src.length);
        if (s.type === 'paren' && s.text === ')') break; if (s.type !== 'sep') throw new ParseError('Unexpected ' + s.text, s.start);
        if (isT(peek(), 'paren', ')')) { args.push({ t: 'missing' }); next(); break; }
      }
      return args;
    }
    function parsePrimary() {
      const t = next(); if (!t) throw new ParseError('Unexpected end', src.length);
      switch (t.type) {
        case 'num': return { t: 'num', v: t.value };
        case 'str': return { t: 'str', v: t.value };
        case 'bool': return { t: 'bool', v: t.value };
        case 'err': return { t: 'err', v: t.value };
        case 'ref': return Object.assign({ t: 'ref' }, t.ref);
        case 'tref': return { t: 'tref', table: t.table, spec: t.spec };
        case 'name': return { t: 'name', name: t.name };
        case 'func': { expect('paren', '('); return { t: 'call', name: t.name.toUpperCase(), args: parseArgs() }; }
        case 'paren': if (t.text === '(') { const e = parseExpr(1); expect('paren', ')'); return { t: 'par', e }; } break;
        case 'brace': if (t.text === '{') {
          const rows = [[]]; for (;;) { const v = parseExpr(1); rows[rows.length - 1].push(v); const s = next(); if (!s) throw new ParseError('Missing }', src.length); if (s.type === 'brace' && s.text === '}') break; if (s.type === 'sep') { if (s.text === ';') rows.push([]); continue; } throw new ParseError('Bad array constant', s.start); }
          return { t: 'arr', rows };
        } break;
      }
      throw new ParseError("Unexpected '" + t.text + "'", t.start);
    }
    if (!toks.length) throw new ParseError('Empty formula', 0);
    const ast = parseExpr(1); if (p < toks.length) throw new ParseError("Unexpected '" + toks[p].text + "'", toks[p].start);
    return ast;
  };

  // ---------- rewriting references inside formula text ----------
  // fn(refObj, token) -> refObj | null (=> #REF!). Returns new text (without leading '=').
  FM.rewrite = (text, fn) => {
    let toks; try { toks = FM.tokenize(text); } catch (e) { return text; }
    let out = '', last = 0;
    for (const t of toks) { if (t.type !== 'ref') continue; const r = fn(Object.assign({}, t.ref), t); out += text.slice(last, t.start) + (r ? printRef(r) : '#REF!'); last = t.end; }
    return out + text.slice(last);
  };
  FM.translate = (text, dr, dc) => FM.rewrite(text, (x) => {
    const mv = (v, abs, d, max) => (abs ? v : v + d);
    if (x.kind !== 'cols') { x.r1 = mv(x.r1, x.ar1, dr); x.r2 = mv(x.r2, x.ar2, dr); }
    if (x.kind !== 'rows') { x.c1 = mv(x.c1, x.ac1, dc); x.c2 = mv(x.c2, x.ac2, dc); }
    if (x.r1 < 0 || x.c1 < 0 || x.r2 >= MAXR || x.c2 >= MAXC || x.r2 < 0 || x.c2 < 0 || x.r1 >= MAXR || x.c1 >= MAXC) return null; return x;
  });
  // structural edit adjust. host = sheet name that owns the formula; target = sheet name edited; axis 'r'|'c'; at index; n>0 insert / n<0 delete
  FM.adjust = (text, host, target, axis, at, n) => FM.rewrite(text, (x) => {
    const sh = x.sheet != null ? x.sheet : host; if (sh.toLowerCase() !== target.toLowerCase()) return x;
    const k1 = axis === 'r' ? 'r1' : 'c1', k2 = axis === 'r' ? 'r2' : 'c2';
    if ((axis === 'r' && x.kind === 'cols') || (axis === 'c' && x.kind === 'rows')) return x;
    let a = x[k1], b = x[k2];
    if (n > 0) { if (a >= at) a += n; if (b >= at) b += n; }
    else { const m = -n, end = at + m; // deleted [at,end)
      if (a >= at && b < end) return null;
      if (a >= end) a -= m; else if (a >= at) a = at; if (b >= end) b -= m; else if (b >= at) b = at - 1;
      if (b < a) return null; }
    x[k1] = a; x[k2] = b; return x;
  });
  FM.renameSheet = (text, from, to) => FM.rewrite(text, (x) => { if (x.sheet != null && x.sheet.toLowerCase() === from.toLowerCase()) x.sheet = to; return x; });
  FM.deleteSheetRefs = (text, name) => FM.rewrite(text, (x) => (x.sheet != null && x.sheet.toLowerCase() === name.toLowerCase() ? null : x));
  // collect static references: [{sheet|null, r1,c1,r2,c2}] and defined-name / table usages
  FM.collect = (ast, out = { refs: [], names: [], trefs: [], volatile: false }) => {
    const w = (n) => {
      if (!n) return; switch (n.t) {
        case 'ref': out.refs.push(n); break; case 'name': out.names.push(n.name); break; case 'tref': out.trefs.push(n); break;
        case 'bin': case 'rng': w(n.l); w(n.r); break; case 'un': case 'pct': case 'par': case 'spill': w(n.e); break;
        case 'call': { const d = ZN.fn.get(n.name); if (d && d.volatile) out.volatile = true; n.args.forEach(w); break; }
        case 'callx': w(n.fn); n.args.forEach(w); break; case 'arr': n.rows.forEach((r) => r.forEach(w)); break;
      }
    }; w(ast); return out;
  };

  // ---------- evaluator ----------
  const ARITH = {
    '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
    '/': (a, b) => (b === 0 ? E.DIV0 : a / b),
    '^': (a, b) => { if (a === 0 && b === 0) return E.NUM; const r = Math.pow(a, b); return isNaN(r) || !isFinite(r) ? E.NUM : r; },
  };
  const scalarOp = (op, a, b) => {
    if (isErr(a)) return a; if (isErr(b)) return b;
    if (op === '&') { return toStr(a) + toStr(b); }
    if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
      const c = cmp(a, b); return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    }
    const x = toNum(a); if (isErr(x)) return x; const y = toNum(b); if (isErr(y)) return y;
    const r = ARITH[op](x, y); return typeof r === 'number' && !isFinite(r) ? E.NUM : r;
  };
  const isMulti = (v) => (v instanceof Range ? !(v.r1 === v.r2 && v.c1 === v.c2) : Array.isArray(v) && !(v.length === 1 && v[0].length === 1));
  const broadcast = (a, b, f) => {
    if (!isMulti(a) && !isMulti(b)) return f(scalar(a), scalar(b));
    const [ra, ca] = F.dims(a), [rb, cb] = F.dims(b); const R = Math.max(ra, rb), C = Math.max(ca, cb); const out = new Array(R);
    const aS = !isMulti(a) ? scalar(a) : undefined, bS = !isMulti(b) ? scalar(b) : undefined, aM = isMulti(a), bM = isMulti(b);
    for (let i = 0; i < R; i++) { const row = new Array(C); for (let j = 0; j < C; j++) {
      const x = aM ? (ra === 1 ? F.at(a, 0, cb > 1 && ca === 1 ? 0 : j) : i < ra && (j < ca || ca === 1) ? F.at(a, i, ca === 1 ? 0 : j) : E.NA) : aS;
      const y = bM ? (rb === 1 ? F.at(b, 0, cb > 1 && cb === 1 ? 0 : j) : i < rb && (j < cb || cb === 1) ? F.at(b, i, cb === 1 ? 0 : j) : E.NA) : bS;
      row[j] = (aM && ra === 1 ? (j < ca || ca === 1) : true) && (bM && rb === 1 ? (j < cb || cb === 1) : true) ? f(x, y) : E.NA; }
      out[i] = row; }
    return out;
  };
  FM.broadcast = broadcast;

  const getSheet = (ctx, name) => (name == null ? ctx.sheet : ctx.wb.sheetByName(name));
  function refToRange(n, ctx) {
    const sh = getSheet(ctx, n.sheet); if (!sh) return E.REF;
    let r2 = n.r2; if (n.kind === 'cols') r2 = MAXR - 1;
    return new Range(sh, n.r1, n.c1, r2, n.c2);
  }
  FM.ev = ev;
  function ev(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v; case 'err': return n.v;
      case 'par': return ev(n.e, ctx);
      case 'missing': return undefined;
      case 'ref': return refToRange(n, ctx);
      case 'tref': return ctx.wb.resolveTref(n, ctx);
      case 'name': return evName(n, ctx);
      case 'un': { const v = ev(n.e, ctx); if (isMulti(v)) return broadcast(v, 0, (a) => { const x = toNum(a); return isErr(x) ? x : -x; }); const x = toNum(scalar(v)); return isErr(x) ? x : -x; }
      case 'pct': { const v = ev(n.e, ctx); const f = (a) => { const x = toNum(a); return isErr(x) ? x : x / 100; }; return isMulti(v) ? broadcast(v, 0, f) : f(scalar(v)); }
      case 'bin': { const a = ev(n.l, ctx), b = ev(n.r, ctx); if (isErr(a)) return a; if (isErr(b)) return b; const op = n.op; return broadcast(a, b, (x, y) => scalarOp(op, x, y)); }
      case 'rng': { const a = ev(n.l, ctx), b = ev(n.r, ctx); if (isErr(a)) return a; if (isErr(b)) return b; if (!(a instanceof Range) || !(b instanceof Range)) return E.VALUE; if (a.sheet !== b.sheet) return E.VALUE; return new Range(a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2)); }
      case 'spill': { const a = ev(n.e, ctx); if (!(a instanceof Range)) return E.REF; const cell = a.sheet.getCell(a.r1, a.c1); if (cell && cell.spill) return new Range(a.sheet, a.r1, a.c1, cell.spill.r2, cell.spill.c2); return a; }
      case 'arr': return n.rows.map((r) => r.map((x) => scalar(ev(x, ctx))));
      case 'call': return evCall(n, ctx);
      case 'callx': { const f = ev(n.fn, ctx); if (isErr(f)) return f; if (!f || !f.lambda) return E.VALUE; return FM.callLambda(f, n.args.map((a) => ev(a, ctx)), ctx); }
    }
    return E.VALUE;
  }
  function evName(n, ctx) {
    for (let s = ctx.vars; s; s = s.parent) if (s.map.has(n.name.toUpperCase())) return s.map.get(n.name.toUpperCase());
    const nm = ctx.wb.lookupName(n.name, ctx.sheet); if (!nm) return E.NAME;
    if (!nm.ast) { try { nm.ast = FM.parse(nm.ref); } catch (e) { nm.ast = { t: 'err', v: E.NAME }; } }
    return ev(nm.ast, Object.assign({}, ctx, { vars: null }));
  }
  function evCall(n, ctx) {
    let def = ZN.fn.get(n.name);
    // lambda bound in scope (LET(f, LAMBDA(..), f(2)))
    for (let s = ctx.vars; s; s = s.parent) if (s.map.has(n.name)) { const f = s.map.get(n.name); if (f && f.lambda) return FM.callLambda(f, n.args.map((a) => ev(a, ctx)), ctx); }
    if (!def) { const nm = ctx.wb.lookupName(n.name, ctx.sheet); if (nm) { const f = evName({ name: n.name }, ctx); if (f && f.lambda) return FM.callLambda(f, n.args.map((a) => ev(a, ctx)), ctx); } return E.NAME; }
    const na = n.args.length; if (na < def.min || (def.max >= 0 && na > def.max)) return E.VALUE;
    const prev = ZN.ctx; ZN.ctx = ctx;
    try {
      if (def.lazy) return def.impl(n.args, (x) => ev(x, ctx), ctx);
      const args = new Array(na); for (let i = 0; i < na; i++) { const a = n.args[i]; args[i] = a.t === 'missing' ? undefined : ev(a, ctx); }
      if (!def.errs) for (let i = 0; i < na; i++) if (args[i] instanceof ZErr) return args[i];
      if (!def.lift) return def.impl(...args);
      const raw = def.raw || []; let multi = false; const liftIdx = [];
      for (let i = 0; i < na; i++) { if (raw.includes(i) || (def.rawFrom != null && i >= def.rawFrom)) continue; liftIdx.push(i); if (isMulti(args[i])) multi = true; }
      if (!multi) { for (const i of liftIdx) { const s = scalar(args[i]); args[i] = s; if (!def.errs && s instanceof ZErr) return s; } return def.impl(...args); }
      let R = 1, C = 1; for (const i of liftIdx) { if (isMulti(args[i])) { const [r, c] = F.dims(args[i]); R = Math.max(R, r); C = Math.max(C, c); } }
      const out = new Array(R); const call = new Array(na);
      for (let i = 0; i < R; i++) { const row = new Array(C); for (let j = 0; j < C; j++) {
        let bad = null;
        for (let k = 0; k < na; k++) { if (!liftIdx.includes(k)) { call[k] = args[k]; continue; } const a = args[k]; if (isMulti(a)) { const [r, c] = F.dims(a); const ii = r === 1 ? 0 : i, jj = c === 1 ? 0 : j; call[k] = ii < r && jj < c ? F.at(a, ii, jj) : (bad = E.NA); } else call[k] = scalar(a); if (!def.errs && call[k] instanceof ZErr) bad = bad || call[k]; }
        row[j] = bad || def.impl(...call); } out[i] = row; }
      return out;
    } finally { ZN.ctx = prev; }
  }
  FM.callLambda = (f, args, ctx) => {
    const map = new Map(); f.params.forEach((p, i) => map.set(p, i < args.length ? args[i] : undefined));
    return ev(f.body, Object.assign({}, ctx, { vars: { map, parent: f.scope } }));
  };
  FM.bindVar = (ctx, name, val) => { const map = new Map([[name.toUpperCase(), val]]); return Object.assign({}, ctx, { vars: { map, parent: ctx.vars } }); };

  // final value for storage in a cell: Range -> scalar / array; null -> 0
  FM.finalize = (v) => {
    if (v instanceof Range) { if (v.isSingle()) { const x = v.get(0, 0); return x == null ? 0 : x; } v = v.toArray(); }
    if (Array.isArray(v)) { if (v.length === 1 && v[0].length === 1) { const x = v[0][0]; return x == null ? 0 : x; } return v.map((r) => r.map((x) => (x == null ? 0 : x))); }
    if (v && v.lambda) return E.CALC; if (v === undefined) return 0; return v;
  };

  // LET / LAMBDA need evaluator internals
  ZN.fn.def('LET', 3, 253, (nodes, evn, ctx) => {
    if (nodes.length % 2 === 0) return E.VALUE; let c = ctx;
    for (let i = 0; i < nodes.length - 1; i += 2) { const nm = nodes[i]; if (nm.t !== 'name') return E.VALUE; const v = FM.ev(nodes[i + 1], c); c = FM.bindVar(c, nm.name, v); }
    return FM.ev(nodes[nodes.length - 1], c);
  }, { lazy: true, cat: 'Logical', hint: 'LET(name1, value1, [name2, value2…], calculation)' });
  ZN.fn.def('LAMBDA', 1, 254, (nodes, evn, ctx) => {
    const params = nodes.slice(0, -1).map((x) => (x.t === 'name' ? x.name.toUpperCase() : null)); if (params.includes(null)) return E.VALUE;
    return { lambda: true, params, body: nodes[nodes.length - 1], scope: ctx.vars };
  }, { lazy: true, cat: 'Logical', hint: 'LAMBDA([parameter1, …], calculation)' });
})(typeof globalThis !== 'undefined' ? globalThis : this);
