/* Show Work: step-by-step evaluation trees, precedence order, "what changed" diffs, shareable text. UI-free. */
(function (g) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const C = isNode ? require('./calc.js') : g.ZC;
  const U = isNode ? require('./units.js') : g.ZC;
  const P = isNode ? require('./prog.js') : g.ZC;
  const { Dec, CalcError, Q } = C;
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', mod: 'mod' };
  const FN_LABEL = { sqrt: '√', cbrt: '∛', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', ncr: 'nCr', npr: 'nPr', fact: 'x!' };
  const TRIG = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sec', 'csc', 'cot']);
  const rank = (n) => (n.t === 'bin' ? (n.op === '+' || n.op === '-' ? 1 : 2) : n.t === 'neg' ? 3 : n.t === 'pow' ? 4 : n.t === 'pct' || n.t === 'fact' || n.t === 'degs' ? 5 : 6);
  const opText = (n) => (n.t === 'bin' ? SYM[n.op] : n.t === 'neg' ? '−' : n.t === 'pow' ? '^' : n.t === 'pct' ? '%' : n.t === 'fact' ? '!' : n.t === 'degs' ? '°' : n.t === 'call' ? (FN_LABEL[n.name] || n.name) : n.t === 'conv' ? 'in' : n.t);
  const kids = (n) => (n.t === 'bin' || n.t === 'pow' ? [n.l, n.r] : n.t === 'call' ? n.args : n.x ? [n.x] : []);
  const STEP_T = new Set(['bin', 'neg', 'pct', 'fact', 'degs', 'pow', 'call', 'conv']);
  const segsText = (segs) => segs.map((s) => s.s).join('').replace(/\s+/g, ' ').trim();

  function explain(src, o = {}) {
    const fmt = o.fmt || {}; const fv = (v) => C.formatQ(v, fmt);
    const ast = C.parse(src, { vars: o.vars, varNames: o.varNames, units: o.units, autoClose: true });
    let nid = 0; const parent = new Map(); const leaves = [];
    (function walk(n, p) { n.id = nid++; if (p) parent.set(n, p); if (n.t === 'num') leaves.push({ id: n.id, text: n.v }); kids(n).forEach((k) => walk(k, n)); })(ast, null);
    const ov = o.overrides || {};
    (function apply(n) { if (n.t === 'num' && ov[n.id] !== undefined && ov[n.id] !== '') n.v = String(ov[n.id]); kids(n).forEach(apply); })(ast);
    const vals = new Map();
    const ctx = { vars: o.vars, units: o.units, angle: o.angle || 'deg', onNode: (n, v) => vals.set(n, v) };
    const result = C.evalNode(ast, ctx);
    // mark percent operands absorbed by + or -
    const absorbed = new Set();
    (function mark(n) { if (n.t === 'bin' && (n.op === '+' || n.op === '-') && n.r.t === 'pct') absorbed.add(n.r); kids(n).forEach(mark); })(ast);
    const order = [];
    (function post(n) { kids(n).forEach(post); if (STEP_T.has(n.t) && !absorbed.has(n)) { order.push(n); n.order = order.length; } })(ast);
    const numTxt = (n) => { try { return C.format(Dec.parse(n.v), fmt); } catch (e) { return n.v; } };
    function rend(n, st, hl, header) {
      const h = hl || n === st.cur; const S = (k, s, x) => Object.assign({ k, s, hl: h }, x);
      if (st.reduced.has(n)) return [S('val', fv(vals.get(n)))];
      const meta = () => ({ rank: rank(n), order: n.order });
      switch (n.t) {
        case 'num': return [S('num', numTxt(n), { id: n.id })];
        case 'const': return [S('const', { pi: 'π', e: 'e', tau: 'τ', phi: 'φ' }[n.name] || n.name)];
        case 'var': { const nm = n.name.replace(/_/g, ' '); return header ? [S('var', nm)] : [S('var', fv(vals.get(n)), { hint: nm })]; }
        case 'paren': return [S('par', '('), ...rend(n.x, st, h, header), S('par', ')')];
        case 'neg': return [S('op', '−', meta()), ...rend(n.x, st, h, header)];
        case 'bin': return [...rend(n.l, st, h, header), S('txt', ' '), S('op', SYM[n.op], meta()), S('txt', ' '), ...rend(n.r, st, h, header)];
        case 'pow': return [...rend(n.l, st, h, header), S('op', '^', meta()), ...rend(n.r, st, h, header)];
        case 'pct': return [...rend(n.x, st, h, header), S('op', '%', absorbed.has(n) ? { rank: 6 } : meta())];
        case 'fact': return [...rend(n.x, st, h, header), S('op', '!', meta())];
        case 'degs': return [...rend(n.x, st, h, header), S('op', '°', meta())];
        case 'unit': return [...rend(n.x, st, h, header), S('txt', ' ' + n.u)];
        case 'conv': return [...rend(n.x, st, h, header), S('txt', ' '), S('op', 'in', meta()), S('txt', ' ' + n.u)];
        case 'call': { const out = [S('op', opText(n), meta()), S('par', '(')]; n.args.forEach((a, i) => { if (i) out.push(S('txt', ', ')); out.push(...rend(a, st, h, header)); }); out.push(S('par', ')')); return out; }
      }
      return [S('txt', '?')];
    }
    function note(n) {
      const p0 = parent.get(n); let p = p0; let inParen = false; while (p && p.t === 'paren') { inParen = true; p = parent.get(p); }
      const lead = (() => {
        if (n.t === 'bin' && (n.op === '+' || n.op === '-') && n.r.t === 'pct') { const lv = vals.get(n.l), pv = vals.get(n.r.x), d = vals.get(n.r); return `${fv(pv)}% of ${fv(lv)} is ${fv(d)}, so ${fv(lv)} ${SYM[n.op]} ${fv(d)}.`; }
        if (n.t === 'pct') return 'Percent means divide by 100.';
        if (n.t === 'fact') return 'Factorial multiplies every whole number from 1 up to n.';
        if (n.t === 'neg') return 'Flip the sign.';
        if (n.t === 'degs') return 'The degree sign converts to the current angle unit.';
        if (n.t === 'conv') return 'Unit conversion.';
        if (n.t === 'call') { const a = o.angle || 'deg'; if (TRIG.has(n.name)) return `${opText(n)} with angles in ${{ deg: 'degrees', rad: 'radians', grad: 'gradians' }[a]}.`; return `Apply ${opText(n)}.`; }
        return '';
      })();
      let why = '';
      if (inParen) why = 'Inside parentheses, so it runs first.';
      else if (p && (p.t === 'bin' || p.t === 'pow' || p.t === 'neg' || p.t === 'pct' || p.t === 'fact')) {
        const rp = rank(p), rn = rank(n);
        if (rp < rn && !(n.t === 'pow' && p.t === 'neg' && false)) why = `${opText(n)} binds tighter than ${opText(p)}, so it runs first.`;
        else if (rp === rn) why = (p.t === 'pow') ? 'Powers group from the right.' : (p.l === n ? 'Same level: left to right.' : '');
      }
      return [lead, why].filter(Boolean).join(' ');
    }
    const reduced = new Set(); const steps = [];
    order.forEach((n, i) => {
      const segs = rend(ast, { reduced, cur: n }, false, false);
      const v = vals.get(n); const txt = fv(v);
      steps.push({ i: i + 1, segs, value: v, valueText: txt, note: note(n), plain: segsText(segs.filter((x) => x.hl)) + ' = ' + txt, rank: rank(n), op: opText(n) });
      reduced.add(n); let q = parent.get(n); while (q && q.t === 'paren') { reduced.add(q); q = parent.get(q); }
    });
    const header = rend(ast, { reduced: new Set(), cur: null }, false, true);
    function tree(n) {
      if (n.t === 'paren') return tree(n.x);
      const t = { label: '', value: fv(vals.get(n)), kids: [], order: n.order, rank: rank(n), id: n.id };
      switch (n.t) {
        case 'num': t.label = numTxt(n); t.leaf = true; break;
        case 'const': t.label = { pi: 'π', e: 'e', tau: 'τ', phi: 'φ' }[n.name] || n.name; t.leaf = true; break;
        case 'var': t.label = n.name.replace(/_/g, ' '); t.leaf = true; break;
        case 'unit': t.label = numTxt(n.x) + ' ' + n.u; t.leaf = true; break;
        default: t.label = opText(n) + (n.t === 'call' ? '( )' : ''); t.kids = (n.t === 'conv' ? [n.x] : kids(n)).map(tree);
      }
      return t;
    }
    return { kind: 'expr', src, header, headerText: segsText(header), steps, tree: tree(ast), leaves, result, resultText: fv(result), overrides: ov };
  }
  // compare two explanations of the same expression (only numbers differ)
  function diffWork(a, b) {
    const rows = []; const n = Math.min(a.steps.length, b.steps.length);
    for (let i = 0; i < n; i++) if (a.steps[i].valueText !== b.steps[i].valueText) rows.push({ i: i + 1, from: a.steps[i].valueText, to: b.steps[i].valueText, plain: b.steps[i].plain });
    const out = { resultFrom: a.resultText, resultTo: b.resultText, steps: rows, changed: a.resultText !== b.resultText };
    const x = a.result instanceof Q ? a.result.v : a.result, y = b.result instanceof Q ? b.result.v : b.result;
    if (x instanceof Dec && y instanceof Dec) { const d = y.sub(x); out.delta = d; out.deltaText = (d.sign() > 0 ? '+' : d.sign() < 0 ? '−' : '') + C.format(d.abs(), {}); if (!x.isZero()) { const pc = d.div(x.abs(), 12).mul(100).roundSig(4); out.pctText = (pc.sign() > 0 ? '+' : pc.sign() < 0 ? '−' : '') + C.format(pc.abs(), {}) + '%'; } }
    return out;
  }
  function workText(m, o = {}) {
    const L = [];
    const head = m.kind === 'expr' ? m.headerText : m.expr;
    L.push(`${head} = ${m.resultText}`);
    if (m.steps.length) { L.push(''); m.steps.forEach((s, i) => L.push(`${i + 1}. ${s.plain}${s.note ? '   (' + s.note + ')' : ''}`)); }
    if (o.diff && o.diff.changed) { L.push(''); L.push(`What if: ${o.what || 'a number changes'}`); L.push(`${o.diff.resultFrom} → ${o.diff.resultTo}${o.diff.deltaText ? ' (' + o.diff.deltaText + (o.diff.pctText ? ', ' + o.diff.pctText : '') + ')' : ''}`); }
    L.push(''); L.push('Shown with Calc');
    return L.join('\n');
  }

  // ---------------- generic step models ----------------
  const sym = (u) => C.unitSym(u);
  function convWork(value, a, b, fmt = {}) {
    const fv = (d) => C.format(d, fmt); const v = Dec.of(value); const res = U.convert(v, a, b); const steps = [];
    const push = (plain, note) => steps.push({ plain, note: note || '' });
    if (a !== b) {
      if (a.cat === 'temperature') {
        const K = { C: (d) => [`${fv(d)} + 273.15`, d.add('273.15')], F: (d) => [`(${fv(d)} + 459.67) × 5 ÷ 9`, d.add('459.67').mul(5).div(9)], R: (d) => [`${fv(d)} × 5 ÷ 9`, d.mul(5).div(9)], K: (d) => [`${fv(d)}`, d] };
        const [t1, k] = K[a.id](v); if (a.id !== 'K') push(`${t1} = ${fv(k)} K`, 'Temperatures pass through kelvin.');
        const back = { C: [`${fv(k)} − 273.15`], F: [`${fv(k)} × 9 ÷ 5 − 459.67`], R: [`${fv(k)} × 9 ÷ 5`], K: [`${fv(k)}`] }[b.id]; if (b.id !== 'K') push(`${back[0]} = ${fv(res)} ${sym(b)}`);
      } else if (a.cat === 'fuel') {
        push(`${fv(v)} ${sym(a)} → L/100km`, 'Fuel economy is inverted (more distance per fuel = lower L/100km).'); push(`→ ${sym(b)} = ${fv(res)}`);
      } else if (a.cat === 'currency') {
        const ref = v.div(a.rate); push(`${fv(v)} ${a.id} ÷ ${fv(a.rate)} = ${fv(ref)} (reference units)`, 'Rates are the ones you entered.'); push(`${fv(ref)} × ${fv(b.rate)} = ${fv(res)} ${b.id}`);
      } else {
        const bu = U.CATS[a.cat].units.find((u) => u.f && u.f.eq(1)); const base = v.mul(a.f);
        if (a !== bu) push(`${fv(v)} ${sym(a)} × ${fv(a.f)} = ${fv(base)} ${bu ? sym(bu) : 'base'}`, `1 ${sym(a)} = ${fv(a.f)} ${bu ? sym(bu) : 'base units'}.`);
        if (b !== bu) push(`${fv(base)} ÷ ${fv(b.f)} = ${fv(res)} ${sym(b)}`, `1 ${sym(b)} = ${fv(b.f)} ${bu ? sym(bu) : 'base units'}.`);
      }
    } else push(`Same unit, nothing to convert.`);
    return { kind: 'steps', expr: `${fv(v)} ${sym(a)} → ${sym(b)}`, resultText: `${fv(res)} ${sym(b)}`, steps, result: res };
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function dateDiffWork(a, b) {
    const r = U.diffDates(a, b); const A = U.toISO(a), B = U.toISO(b); const steps = [];
    const first = r.negative ? B : A, last = r.negative ? A : B;
    steps.push({ plain: `From ${first} to ${last}`, note: r.negative ? 'The end date is earlier, so the dates are swapped.' : '' });
    const months = r.years * 12 + r.months;
    steps.push({ plain: `Whole months: ${months} = ${plural(r.years, 'year')} + ${plural(r.months, 'month')}`, note: 'Count month by month from the start date (short months clamp to their last day).' });
    steps.push({ plain: `Days left after those months: ${r.days}`, note: '' });
    steps.push({ plain: `Total days: ${r.totalDays} = ${plural(r.weeks, 'week')} + ${plural(r.remDays, 'day')}`, note: '' });
    steps.push({ plain: `Weekdays (Mon to Fri): ${r.weekdays}`, note: 'Every full week has 5; the leftover days are checked one by one.' });
    const parts = []; if (r.years) parts.push(plural(r.years, 'year')); if (r.months) parts.push(plural(r.months, 'month')); if (r.days || !parts.length) parts.push(plural(r.days, 'day'));
    return { kind: 'steps', expr: `${A} → ${B}`, resultText: `${parts.join(', ')} (${r.totalDays} days)`, steps };
  }
  function dateAddWork(a, delta, sign, weekdays) {
    const steps = []; const A = U.toISO(a); const word = sign > 0 ? 'Add' : 'Subtract';
    steps.push({ plain: `Start: ${A}`, note: '' });
    const ym = delta.years * 12 + delta.months; let cur = a;
    if (ym) { const m = U.addMonths(a, sign * ym); const raw = a.d; const clamped = m.d !== raw; steps.push({ plain: `${word} ${plural(delta.years, 'year')} ${plural(delta.months, 'month')} → ${U.toISO(m)}`, note: clamped ? `${MONTHS[m.m - 1]} has no day ${raw}, so it clamps to ${m.d}.` : '' }); cur = m; }
    let res;
    if (weekdays) { const n = sign * (delta.weeks * 5 + delta.days); res = U.addWeekdays(cur, n); steps.push({ plain: `${word} ${plural(Math.abs(n), 'weekday')} → ${U.toISO(res)}`, note: 'Saturdays and Sundays are skipped.' }); }
    else { const d = delta.weeks * 7 + delta.days; res = U.civilFromDays(U.dayNum(cur) + sign * d); if (d) steps.push({ plain: `${word} ${plural(d, 'day')} (${plural(delta.weeks, 'week')} + ${plural(delta.days, 'day')}) → ${U.toISO(res)}`, note: '' }); }
    return { kind: 'steps', expr: `${A} ${sign > 0 ? '+' : '−'} ${[delta.years && plural(delta.years, 'year'), delta.months && plural(delta.months, 'month'), delta.weeks && plural(delta.weeks, 'week'), delta.days && plural(delta.days, 'day')].filter(Boolean).join(' ') || '0 days'}`, resultText: U.toISO(res), steps };
  }
  function progWork(src, o) {
    const trace = []; const r = P.evalProg(src, Object.assign({}, o, { trace }));
    const f = (v, b) => P.formatBase(P.toPattern(v, o.bits), b, { bits: o.bits, signed: o.signed, group: false });
    const dec = (v) => P.formatBase(P.toPattern(v, o.bits), 10, { bits: o.bits, signed: o.signed, group: false });
    const NAME = { and: 'AND', or: 'OR', xor: 'XOR', nand: 'NAND', nor: 'NOR', not: 'NOT', lsh: '<<', rsh: '>>', rol: 'RoL', ror: 'RoR', add: '+', sub: '−', mul: '×', div: '÷', mod: 'Mod', neg: '−' };
    const bitwise = new Set(['and', 'or', 'xor', 'nand', 'nor', 'not', 'lsh', 'rsh', 'rol', 'ror']);
    const steps = trace.map((t) => {
      const bin = (v) => f(v, 2).padStart(o.bits, '0').replace(/(.{4})(?=.)/g, '$1 ');
      const plain = t.b === undefined ? `${NAME[t.op]} ${dec(t.a)} = ${dec(t.r)}` : `${dec(t.a)} ${NAME[t.op]} ${dec(t.b)} = ${dec(t.r)}`;
      let note = '';
      if (bitwise.has(t.op)) note = t.b === undefined ? `${bin(t.a)} → ${bin(t.r)}` : `${bin(t.a)} ${NAME[t.op]} ${bin(t.b)} → ${bin(t.r)}`;
      if (t.ov) note = (note ? note + '. ' : '') + `Result does not fit in ${o.bits} bits ${o.signed ? '(signed)' : '(unsigned)'}, so it wraps around.`;
      return { plain, note };
    });
    return { kind: 'steps', expr: src.replace(/#(\d+)/g, (m, d) => dec(BigInt(d))), resultText: dec(r.value), steps, overflow: r.overflow };
  }
  const api = { explain, diffWork, workText, convWork, dateDiffWork, dateAddWork, progWork, segsText };
  if (isNode) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
