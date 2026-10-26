/* Formula X-ray engine: plain-English explanations, precedent/dependent tracing, hard-coded number detection. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const FM = ZN.formula; const X = ZN.xray = {};
  const A1 = (r1, c1, r2, c2) => ZN.rangeAddr(r1, c1, r2, c2);
  const q = (s) => '“' + s + '”';

  // label for a reference: header text above a column range, or table column name
  function labelOf(wb, sheet, x) {
    try {
      for (const t of sheet.tables) if (x.c1 === x.c2 && x.c1 >= t.c1 && x.c1 <= t.c2 && x.r1 > t.r1 && x.r2 <= t.r2 && t.header !== false) { const n = sheet.getValue(t.r1, x.c1); if (typeof n === 'string' && n) return n; }
      if (x.c1 === x.c2 || x.r1 === x.r2) { if (x.r1 > 0 && x.c1 === x.c2) { for (let r = x.r1 - 1; r >= Math.max(0, x.r1 - 40); r--) { const v = sheet.getValue(r, x.c1); if (typeof v === 'string' && v && r === x.r1 - 1 || (typeof v === 'string' && v && r < x.r1 - 1 && sheet.getValue(r + 1, x.c1) == null)) return v; if (v != null) break; } } if (x.c1 > 0 && x.r1 === x.r2) { const v = sheet.getValue(x.r1, x.c1 - 1); if (typeof v === 'string' && v) return v; } }
    } catch (e) { /* ignore */ }
    return null;
  }
  function nameFor(wb, sheet, x) { for (const nm of wb.names.values()) { const r = FM.parseRef(nm.ref); if (r && r.r1 === x.r1 && r.c1 === x.c1 && r.r2 === x.r2 && r.c2 === x.c2 && (!r.sheet || r.sheet.toLowerCase() === (x.sheet || sheet.name).toLowerCase())) return nm.name; } return null; }
  X.nameFor = nameFor; X.labelOf = labelOf;

  const CMP = { '=': 'equals', '<>': 'is not', '<': 'is less than', '>': 'is greater than', '<=': 'is at most', '>=': 'is at least' };
  const FN_WORDS = { SUM: 'adds up', AVERAGE: 'averages', COUNT: 'counts the numbers in', COUNTA: 'counts the non-empty cells in', MAX: 'finds the largest value in', MIN: 'finds the smallest value in', MEDIAN: 'finds the median of', PRODUCT: 'multiplies together', STDEV: 'measures the spread (std. deviation) of', 'STDEV.S': 'measures the spread (std. deviation) of', COUNTBLANK: 'counts the blank cells in', ROUND: 'rounds', ABS: 'takes the absolute value of', SQRT: 'takes the square root of', UNIQUE: 'lists the distinct values in', SORT: 'sorts', FILTER: 'filters', TRANSPOSE: 'flips rows and columns of', SUMPRODUCT: 'multiplies and adds up pairs from', LEN: 'counts the characters in', UPPER: 'upper-cases', LOWER: 'lower-cases', TRIM: 'trims spaces from', TODAY: "today's date", NOW: 'the current date and time', PMT: 'works out the periodic payment for', IFERROR: 'uses a fallback if there is an error in' };

  // describe an AST node as a short phrase
  X.explainAst = (wb, sheet, ast) => {
    const ref = (n, brief) => { const rr = { r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2, sheet: n.sheet }; const a = (n.sheet ? n.sheet + '!' : '') + (n.kind === 'cols' ? ZN.colName(n.c1) + ':' + ZN.colName(n.c2) : n.kind === 'rows' ? n.r1 + 1 + ':' + (n.r2 + 1) : A1(n.r1, n.c1, n.r2, n.c2)); const nm = nameFor(wb, sheet, rr); if (nm) return nm + ' (' + a + ')'; const sh = n.sheet ? wb.sheetByName(n.sheet) : sheet; const lb = sh && n.kind !== 'cols' && n.kind !== 'rows' ? labelOf(wb, sh, rr) : null; return lb && !brief ? lb + ' (' + a + ')' : a; };
    const crit = (n) => { if (n.t === 'str') { const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(n.v); const op = m[1] || '='; const val = m[2]; if (/[*?]/.test(val) && (op === '=' || op === '<>')) return (op === '<>' ? 'doesn’t match ' : 'matches ') + q(val); const isNum = val !== '' && !isNaN(+val); return CMP[op] + ' ' + (isNum ? val : q(val)); } if (n.t === 'num') return 'equals ' + n.v; return 'matches ' + ex(n); };
    function ex(n) {
      switch (n.t) {
        case 'num': return String(n.v); case 'str': return q(n.v); case 'bool': return n.v ? 'TRUE' : 'FALSE'; case 'err': return n.v.code; case 'missing': return 'nothing'; case 'par': return ex(n.e);
        case 'ref': return ref(n); case 'name': return n.name; case 'tref': return n.table + n.spec; case 'spill': return 'the spilled range from ' + ex(n.e);
        case 'un': return 'minus ' + ex(n.e); case 'pct': return ex(n.e) + ' percent';
        case 'rng': return ex(n.l) + ' to ' + ex(n.r);
        case 'arr': return 'a list of constants';
        case 'bin': { const L = ex(n.l), R = ex(n.r); switch (n.op) { case '+': return L + ' plus ' + R; case '-': return L + ' minus ' + R; case '*': return L + ' times ' + R; case '/': return L + ' divided by ' + R; case '^': return L + ' to the power of ' + R; case '&': return L + ' joined with ' + R; default: return L + ' ' + CMP[n.op] + ' ' + R; } }
        case 'callx': return 'a custom function';
        case 'call': return call(n);
      }
      return '?';
    }
    function call(n) {
      const a = n.args, N = n.name; const l = (xs) => xs.map(ex).join(', ').replace(/, ([^,]*)$/, ' and $1');
      switch (N) {
        case 'IF': return 'if ' + ex(a[0]) + ', then ' + (a[1] ? ex(a[1]) : 'TRUE') + (a[2] ? ', otherwise ' + ex(a[2]) : ', otherwise FALSE');
        case 'IFS': { const parts = []; for (let i = 0; i + 1 < a.length; i += 2) parts.push('if ' + ex(a[i]) + ' then ' + ex(a[i + 1])); return parts.join('; ') + ' (first match wins)'; }
        case 'IFERROR': return ex(a[0]) + ', or ' + ex(a[1]) + ' if that is an error';
        case 'AND': return 'all of: ' + l(a); case 'OR': return 'any of: ' + l(a); case 'NOT': return 'not (' + ex(a[0]) + ')';
        case 'SUMIF': return 'adds ' + ex(a[2] || a[0]) + ' where ' + ref0(a[0]) + ' ' + crit(a[1]);
        case 'COUNTIF': return 'counts cells in ' + ref0(a[0]) + ' that ' + (/^(equals|is|matches|doesn)/.test(crit(a[1])) ? crit(a[1]) : crit(a[1]));
        case 'AVERAGEIF': return 'averages ' + ex(a[2] || a[0]) + ' where ' + ref0(a[0]) + ' ' + crit(a[1]);
        case 'SUMIFS': case 'AVERAGEIFS': case 'COUNTIFS': case 'MAXIFS': case 'MINIFS': { const isC = N === 'COUNTIFS'; const start = isC ? 0 : 1; const conds = []; for (let i = start; i + 1 < a.length; i += 2) conds.push(ref0(a[i]) + ' ' + crit(a[i + 1])); const verb = { SUMIFS: 'adds', AVERAGEIFS: 'averages', COUNTIFS: 'counts rows', MAXIFS: 'finds the largest value in', MINIFS: 'finds the smallest value in' }[N]; return verb + (isC ? '' : ' ' + ex(a[0])) + ' where ' + conds.join(' and '); }
        case 'VLOOKUP': return 'looks up ' + ex(a[0]) + ' in the first column of ' + ex(a[1]) + ' and returns column ' + ex(a[2]) + (a[3] && a[3].t === 'bool' && !a[3].v || a[3] && a[3].t === 'num' && a[3].v === 0 ? ' (exact match)' : ' (nearest match)');
        case 'HLOOKUP': return 'looks up ' + ex(a[0]) + ' in the first row of ' + ex(a[1]) + ' and returns row ' + ex(a[2]);
        case 'XLOOKUP': return 'finds ' + ex(a[0]) + ' in ' + ex(a[1]) + ' and returns the matching item from ' + ex(a[2]) + (a[3] ? ', or ' + ex(a[3]) + ' if not found' : '');
        case 'MATCH': return 'finds the position of ' + ex(a[0]) + ' in ' + ex(a[1]); case 'XMATCH': return 'finds the position of ' + ex(a[0]) + ' in ' + ex(a[1]);
        case 'INDEX': return 'takes the item at ' + (a[2] ? 'row ' + ex(a[1]) + ', column ' + ex(a[2]) : 'position ' + ex(a[1])) + ' of ' + ex(a[0]);
        case 'CHOOSE': return 'picks option ' + ex(a[0]) + ' from ' + l(a.slice(1));
        case 'CONCAT': case 'CONCATENATE': case 'TEXTJOIN': return 'joins ' + l(N === 'TEXTJOIN' ? a.slice(2) : a) + ' into one text';
        case 'ROUND': return 'rounds ' + ex(a[0]) + ' to ' + (a[1] ? ex(a[1]) : '0') + ' decimal places'; case 'ROUNDUP': return 'rounds ' + ex(a[0]) + ' up to ' + (a[1] ? ex(a[1]) : '0') + ' decimal places'; case 'ROUNDDOWN': return 'rounds ' + ex(a[0]) + ' down to ' + (a[1] ? ex(a[1]) : '0') + ' decimal places';
        case 'LEFT': return 'the first ' + (a[1] ? ex(a[1]) : '1') + ' characters of ' + ex(a[0]); case 'RIGHT': return 'the last ' + (a[1] ? ex(a[1]) : '1') + ' characters of ' + ex(a[0]); case 'MID': return 'characters ' + ex(a[1]) + ' onward (' + ex(a[2]) + ' long) of ' + ex(a[0]);
        case 'TEXT': return ex(a[0]) + ' formatted as ' + ex(a[1]); case 'TODAY': case 'NOW': return FN_WORDS[N]; case 'LET': return 'names intermediate values, then calculates ' + ex(a[a.length - 1]); case 'SUBTOTAL': return 'a subtotal of ' + l(a.slice(1)) + ' that ignores other subtotals';
        case 'PMT': return 'the payment per period for a loan of ' + ex(a[2]) + ' at ' + ex(a[0]) + ' interest per period over ' + ex(a[1]) + ' periods';
      }
      const w = FN_WORDS[N]; if (w && a.length) return w + ' ' + l(a);
      return N.toLowerCase() + ' of ' + (a.length ? l(a) : 'nothing');
    }
    function ref0(n) { return n.t === 'ref' ? ref(n) : ex(n); }
    return ex(ast);
  };
  X.explain = (wb, sheet, r, c) => {
    const cell = sheet.getCell(r, c); if (!cell || cell.f === undefined) return null; if (!cell.ast) { try { cell.ast = FM.parse(cell.f); } catch (e) { return { text: 'This formula can’t be read: ' + e.message, bad: true }; } }
    let t = X.explainAst(wb, sheet, cell.ast); t = t.charAt(0).toUpperCase() + t.slice(1); const top = cell.ast.t === 'call' && /^(sum|average|count|max|min|median|product|stdev|round|lookup|index|match|text|concat|if|sumif|countif|avera|sumifs|countifs|let)/i.test(cell.ast.name) || cell.ast.t === 'call' && FN_WORDS[cell.ast.name];
    if (cell.ast.t === 'call' && !/^(IF|IFS|IFERROR|AND|OR|NOT|CHOOSE|LEFT|RIGHT|MID|TEXT|PMT|INDEX|MATCH|XMATCH|ROUND|ROUNDUP|ROUNDDOWN)$/.test(cell.ast.name) && !/^[a-z]+ of /i.test(t) && !/^(Adds|Counts|Averages|Finds|Looks|Joins|Multiplies|Lists|Sorts|Filters|Flips|Measures|Takes|Names|A subtotal)/.test(t)) { /* keep */ }
    return { text: t.endsWith('.') ? t : t + '.', ast: cell.ast };
  };

  // ---- graph walking ----
  const keyOf = (sh, r, c) => ZN.keyOf(sh.id, r, c);
  X.precedents = (wb, sheet, r, c) => {
    const cell = sheet.getCell(r, c); if (!cell || cell.f === undefined || !cell.ast) return []; const out = []; const seen = new Set();
    const add = (x, viaName) => { const sh = x.sheet == null ? sheet : wb.sheetByName(x.sheet); if (!sh) return; const kind = x.kind; const r2 = kind === 'cols' ? Math.max(sh.maxRow(), x.r1) : Math.min(x.r2, Math.max(sh.maxRow(), x.r1)); const o = { sheet: sh, r1: x.r1, c1: x.c1, r2, c2: Math.min(x.c2, Math.max(sh.maxCol(), x.c1)), viaName, whole: kind === 'cols' || kind === 'rows' }; const k = sh.id + ':' + o.r1 + ',' + o.c1 + ',' + o.r2 + ',' + o.c2; if (!seen.has(k)) { seen.add(k); out.push(o); } };
    const col = FM.collect(cell.ast); for (const x of col.refs) add(x);
    for (const n of col.names) { const nm = wb.lookupName(n, sheet); if (nm) { try { const ast = nm.ast || FM.parse(nm.ref); for (const x of FM.collect(ast).refs) add(x, nm.name); } catch (e) { /* ignore */ } } }
    for (const t of col.trefs) { try { const rg = wb.resolveTref(t, { sheet, r, c, wb }); if (rg && rg.sheet) add({ sheet: rg.sheet.name, r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2, kind: 'range' }, t.table); } catch (e) { /* ignore */ } }
    return out;
  };
  X.dependents = (wb, sheet, r, c, limit = 200) => {
    const set = new Set(); wb._dependentsOf(sheet.id, r, c, set); const cell = sheet.getCell(r, c); if (cell && cell.spill) for (let rr = r; rr <= cell.spill.r2; rr++) for (let cc = c; cc <= cell.spill.c2; cc++) wb._dependentsOf(sheet.id, rr, cc, set);
    const out = []; for (const k of set) { const [sid, rr, cc] = ZN.unkey(k); const sh = wb.byId.get(sid); if (!sh || (sh === sheet && rr === r && cc === c)) continue; out.push({ sheet: sh, r: rr, c: cc }); if (out.length >= limit) break; } return out;
  };
  // follow precedents transitively. Returns {nodes:[{sheet,r,c,depth,formula}], edges:[[fromIdx,toIdx]], sources:[{sheet,r,c,v}], truncated}
  X.trace = (wb, sheet, r, c, opts = {}) => {
    const maxNodes = opts.maxNodes || 400, maxDepth = opts.maxDepth || 60; const nodes = [{ sheet, r, c, depth: 0 }]; const idx = new Map([[keyOf(sheet, r, c), 0]]); const edges = []; const sources = []; let truncated = false;
    for (let qi = 0; qi < nodes.length; qi++) {
      const n = nodes[qi]; const cell = n.sheet.getCell(n.r, n.c); if (!cell || cell.f === undefined) { if (qi > 0) sources.push({ sheet: n.sheet, r: n.r, c: n.c, v: cell ? cell.v : null }); continue; } if (n.depth >= maxDepth) { truncated = true; continue; }
      for (const p of X.precedents(wb, n.sheet, n.r, n.c)) {
        const cells = (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1); if (cells > 2000) { truncated = true; sources.push({ sheet: p.sheet, r: p.r1, c: p.c1, r2: p.r2, c2: p.c2, range: true }); continue; }
        for (let rr = p.r1; rr <= p.r2; rr++) for (let cc = p.c1; cc <= p.c2; cc++) { const k = keyOf(p.sheet, rr, cc); let j = idx.get(k); if (j === undefined) { if (nodes.length >= maxNodes) { truncated = true; continue; } const pc = p.sheet.getCell(rr, cc); if (!pc && cells > 1) continue; j = nodes.length; idx.set(k, j); nodes.push({ sheet: p.sheet, r: rr, c: cc, depth: n.depth + 1 }); } edges.push([qi, j]); }
      }
    }
    return { nodes, edges, sources, truncated };
  };
  // numbers typed straight into a formula (a classic source of silent errors)
  const IGNORE = new Set([0, 1, -1, 100]);
  X.hardcodes = (ast) => {
    const out = []; const hasRef = (n) => { let f = false; (function w(x) { if (!x || f) return; if (x.t === 'ref' || x.t === 'name' || x.t === 'tref') f = true; else if (x.t === 'bin' || x.t === 'rng') { w(x.l); w(x.r); } else if (x.t === 'un' || x.t === 'pct' || x.t === 'par' || x.t === 'spill') w(x.e); else if (x.t === 'call') x.args.forEach(w); })(n); return f; };
    const NUMARGS = new Set(['ROUND', 'ROUNDUP', 'ROUNDDOWN', 'VLOOKUP', 'HLOOKUP', 'MATCH', 'XMATCH', 'INDEX', 'LEFT', 'RIGHT', 'MID', 'CHOOSE', 'OFFSET', 'SUBTOTAL', 'LARGE', 'SMALL', 'TEXT', 'IF', 'XLOOKUP', 'RANK', 'ROW', 'COLUMN', 'SEQUENCE', 'TAKE', 'DROP', 'TRUNC', 'FIXED', 'WEEKDAY', 'PERCENTILE', 'QUARTILE', 'AGGREGATE']);
    (function w(n, ctx) {
      if (!n) return; switch (n.t) {
        case 'bin': { const arith = '+-*/^'.includes(n.op) || ['<', '>', '<=', '>=', '=', '<>'].includes(n.op); for (const [s, o] of [[n.l, n.r], [n.r, n.l]]) { let lit = s; if (lit.t === 'par') lit = lit.e; if (lit.t === 'un' && lit.e.t === 'num') lit = { t: 'num', v: -lit.e.v }; if (arith && lit.t === 'num' && !IGNORE.has(lit.v) && hasRef(o) && !(n.op === '^' && lit === n.r && (lit.v === 2 || lit.v === 3 || lit.v === 0.5))) out.push({ value: lit.v, in: n.op }); else w(s); } break; }
        case 'call': n.args.forEach((a, i) => { if (a.t === 'num' && NUMARGS.has(n.name)) return; if (a.t === 'num' && !IGNORE.has(a.v) && /^(SUM|AVERAGE|MAX|MIN|PRODUCT|PMT|FV|PV|NPV)$/.test(n.name) && n.args.some((x) => hasRef(x)) && n.args.length > 1) out.push({ value: a.v, in: n.name }); else w(a); }); break;
        case 'un': case 'pct': case 'par': case 'spill': w(n.e); break; case 'rng': w(n.l); w(n.r); break;
      }
    })(ast); return out;
  };
  X.suggestName = (wb, sheet, x) => { const lb = labelOf(wb, sheet, x); let base = (lb || 'Range').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'Range'; if (/^\d/.test(base) || /^[A-Za-z]{1,3}\d+$/.test(base)) base = '_' + base; let n = base, i = 2; while (wb.lookupName(n, sheet)) n = base + '_' + i++; return n; };
  // replace occurrences of a reference (by value, ignoring $) in formula text with a name
  X.replaceRefWithName = (text, target, name) => { const same = (x) => x.r1 === target.r1 && x.c1 === target.c1 && x.r2 === target.r2 && x.c2 === target.c2; let toks; try { toks = FM.tokenize(text); } catch (e) { return text; } let out = '', last = 0; for (const t of toks) { if (t.type === 'ref' && same(t.ref) && (!t.ref.sheet || !target.sheetName || t.ref.sheet.toLowerCase() === target.sheetName.toLowerCase())) { out += text.slice(last, t.start) + name; last = t.end; } } return out + text.slice(last); };
  // replace the first literal number equal to value (outside strings) with a name
  X.replaceNumberWithName = (text, value, name) => { let toks; try { toks = FM.tokenize(text); } catch (e) { return text; } for (const t of toks) if (t.type === 'num' && t.value === value) return text.slice(0, t.start) + name + text.slice(t.end); return text; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
