/* Scratch engine: evaluates a free-form document line by line with persistent variables. */
(function (g) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const C = isNode ? require('./calc.js') : g.ZC;
  const { Dec, CalcError, Q } = C;
  const key = (name) => name.trim().replace(/\s+/g, '_').toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const RESERVED = (n) => C.FUNCS.has(n) || ['pi', 'e', 'tau', 'phi', 'ans', 'prev', 'sum', 'total', 'in', 'to', 'as', 'of', 'mod'].includes(n);

  function rewrite(line, vars) {
    let s = line;
    // phrase variables (longest first), case-insensitive
    const names = Object.keys(vars).filter((k) => vars[k].display).sort((a, b) => vars[b].display.length - vars[a].display.length);
    for (const k of names) { const d = vars[k].display; if (!/\s/.test(d) && d === k) continue; s = s.replace(new RegExp('(?<![\\p{L}\\p{N}_])' + esc(d).replace(/\s+/g, '\\s+') + '(?![\\p{L}\\p{N}_])', 'giu'), k); }
    // case-insensitive single-word variables
    s = s.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => { const k = w.toLowerCase(); return vars[k] && !(w in vars) ? k : w; });
    s = s.replace(/(\d+(?:\.\d+)?)\s*%\s+off\s+(.+)$/i, '($2)-$1%').replace(/(\d+(?:\.\d+)?)\s*%\s+on\s+(.+)$/i, '($2)+$1%');
    return s.replace(/(\d)\s*(?:per\s*cent|percent)\b/gi, '$1%');
  }
  function evaluateNotes(text, o = {}) {
    const lines = String(text).split('\n'); const fmtOpts = o.fmt || {}; const angle = o.angle || 'deg';
    const vars = {}; const out = []; let ans = null; let block = [];
    const ctxVars = () => { const v = {}; for (const k in vars) v[k] = vars[k].value; if (ans) { v.ans = ans; v.prev = ans; } return v; };
    // Quantities display at most 10 significant digits (the stored value stays exact); big values keep the default format.
    const result = (value) => ({ value, text: C.formatQ(value, value instanceof Q && !value.v.isZero() && value.v.abs().exp10 < 10 && value.v.exp10 > -6 ? { ...fmtOpts, digits: 10 } : fmtOpts) });
    const ov = o.override || null; // {line, value}: what-if value for the variable assigned on that line
    for (let idx = 0; idx < lines.length; idx++) {
      const raw = lines[idx]; const line = raw.trim();
      if (!line) { block = []; out.push({ kind: 'blank' }); continue; }
      if (line.startsWith('#') || line.startsWith('//')) { block = []; out.push({ kind: 'comment' }); continue; }
      try {
        let m = /^([\p{L}_][\p{L}\p{N}_ ]*?)\s*=\s*(.+)$/u.exec(line);
        if (!m) { const mc = /^([\p{L}_][\p{L}\p{N}_ ]*?)\s*:\s*(.+)$/u.exec(line); if (mc && /[\d(]/.test(mc[2]) && !/^\d/.test(mc[1])) m = mc; }
        let name = null, expr = line;
        if (m && !/[=<>]/.test(m[2])) { name = m[1]; expr = m[2]; if (RESERVED(key(name))) throw new CalcError('"' + name.trim() + '" is reserved'); }
        const lower = expr.trim().toLowerCase(); let value, src = null, snap = null, parts = null;
        if (lower === 'sum' || lower === 'total') {
          if (!block.length) throw new CalcError('Nothing to add'); parts = block.map((b) => C.formatQ(b, fmtOpts)); value = sumBlock(block);
        } else if (lower === 'avg' || lower === 'average') {
          if (!block.length) throw new CalcError('Nothing to average'); const t = block.reduce((a, b) => (a === null ? b : addAny(a, b)), null); value = t instanceof Q ? new Q(t.v.div(block.length), t.u) : t.div(block.length);
        } else {
          src = rewrite(expr, vars); snap = ctxVars();
          value = C.evaluate(src, { vars: snap, varNames: new Set(Object.keys(vars)), units: true, angle });
          if (ov && ov.line === idx) value = ov.value;
        }
        if (name) { vars[key(name)] = { value, display: name.trim().replace(/\s+/g, ' ') }; }
        ans = value; if (name) block = []; else block.push(value);
        out.push({ kind: name ? 'assign' : 'result', name: name && key(name), src, vars: snap, parts, ...result(value) });
      } catch (e) {
        if (!(e instanceof CalcError)) throw e; block = [];
        const mathy = /^[\d\s+\-*/^().,%=×÷]+$/.test(line) || /\d\s*[+\-*/^×÷]\s*$/.test(line) || /=\s*[\d(]/.test(line);
        out.push({ kind: mathy ? 'error' : 'text', error: e.message });
      }
    }
    return { lines: out, vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v.value])) };
  }
  // Adds the values; the total keeps a unit only when every value is a compatible quantity (converted to the first unit).
  function sumBlock(block) {
    const all = block.every((b) => b instanceof Q);
    if (all) { try { return block.reduce((a, b) => addAny(a, b)); } catch (e) { /* incompatible units: fall through to a bare number */ } }
    return block.reduce((a, b) => a.add(b instanceof Q ? b.v : b), Dec.of(0));
  }
  function addAny(a, b) { if (a instanceof Q) return new Q(a.v.add(b instanceof Q ? require_convert(b, a.u) : b), a.u); if (b instanceof Q) return new Q(a.add(b.v), b.u); return a.add(b); }
  function require_convert(q, u) { const U = isNode ? require('./units.js') : g.ZC; return U.convert(q.v, q.u, u); }
  function exportText(text, evald) {
    const src = String(text).split('\n');
    return src.map((l, i) => { const r = evald.lines[i]; return r && r.text && (r.kind === 'result' || r.kind === 'assign') ? l + '\t=> ' + r.text : l; }).join('\n') + '\n';
  }
  const api = { evaluateNotes, exportText };
  if (isNode) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
