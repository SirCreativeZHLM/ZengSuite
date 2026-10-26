const T = require('./_h'); const { ZN } = T; const TL = ZN.tools;
if (!ZN.parseValue) ZN.parseValue = (t) => (/^[+-]?\d+(\.\d+)?$/.test(t) ? { v: parseFloat(t) } : null);
const mk = () => { const wb = ZN.newWorkbook(); return { wb, sh: wb.sheets[0] }; };
const put = (wb, sh, a, v) => { const p = ZN.parseA1(a); wb.tx('t', () => { if (typeof v === 'string' && v[0] === '=') wb.setInput(sh, p.r, p.c, v); else wb.setValue(sh, p.r, p.c, v); }); };
const col = (sh, c, r1, r2) => { const o = []; for (let r = r1; r <= r2; r++) o.push(sh.getValue(r, c)); return o; };
const colA = (sh, r1, r2) => col(sh, 0, r1, r2);
const setCol = (wb, sh, c, arr, r0 = 0) => wb.tx('t', () => arr.forEach((v, i) => { if (v !== undefined) wb.setValue(sh, r0 + i, c, v); }));
const R = (r1, c1, r2, c2) => ({ r1, c1, r2, c2 });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const E = ZN.E;
const dq = (a, b) => { if (a instanceof ZN.ZErr) a = a.code; if (b instanceof ZN.ZErr) b = b.code; if (a === undefined) a = null; if (b === undefined) b = null; if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)); if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => dq(x, b[i])); if (a && b && typeof a === 'object' && typeof b === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => dq(a[k], b[k])); } return a === b; };
T.eq = (got, want, label) => T.ok(dq(got, want), label + ' -> ' + JSON.stringify(got instanceof ZN.ZErr ? got.code : got) + ' want ' + JSON.stringify(want));
const dateStyle = (wb) => wb.mergeStyle(0, { nf: 'yyyy-mm-dd' });

// ---------- autofill ----------
{ const { wb, sh } = mk();
  setCol(wb, sh, 0, [1, 2]); TL.autofill(wb, sh, R(0, 0, 1, 0), R(0, 0, 4, 0), {}); T.eq(colA(sh, 0, 4), [1, 2, 3, 4, 5], 'linear 1,2');
  setCol(wb, sh, 1, [10, 20, 30]); TL.autofill(wb, sh, R(0, 1, 2, 1), R(3, 1, 5, 1)); T.eq(col(sh, 1, 0, 5), [10, 20, 30, 40, 50, 60], 'linear 10,20,30 dst excludes src');
  setCol(wb, sh, 2, [5]); TL.autofill(wb, sh, R(0, 2, 0, 2), R(0, 2, 2, 2)); T.eq(col(sh, 2, 0, 2), [5, 5, 5], 'single number copies');
  setCol(wb, sh, 3, [5]); TL.autofill(wb, sh, R(0, 3, 0, 3), R(0, 3, 2, 3), { mode: 'series' }); T.eq(col(sh, 3, 0, 2), [5, 6, 7], 'single number series mode');
  setCol(wb, sh, 4, ['Item 1']); TL.autofill(wb, sh, R(0, 4, 0, 4), R(0, 4, 2, 4)); T.eq(col(sh, 4, 0, 2), ['Item 1', 'Item 2', 'Item 3'], 'text number');
  setCol(wb, sh, 5, ['Q1']); TL.autofill(wb, sh, R(0, 5, 0, 5), R(0, 5, 3, 5)); T.eq(col(sh, 5, 0, 3), ['Q1', 'Q2', 'Q3', 'Q4'], 'Q1..');
  setCol(wb, sh, 6, ['Jan']); TL.autofill(wb, sh, R(0, 6, 0, 6), R(0, 6, 2, 6)); T.eq(col(sh, 6, 0, 2), ['Jan', 'Feb', 'Mar'], 'short months');
  setCol(wb, sh, 7, ['Nov', 'Dec']); TL.autofill(wb, sh, R(0, 7, 1, 7), R(0, 7, 3, 7)); T.eq(col(sh, 7, 0, 3), ['Nov', 'Dec', 'Jan', 'Feb'], 'month wrap');
  setCol(wb, sh, 8, ['Monday']); TL.autofill(wb, sh, R(0, 8, 0, 8), R(0, 8, 7, 8)); T.eq(col(sh, 8, 6, 7), ['Sunday', 'Monday'], 'weekday cycle');
  setCol(wb, sh, 9, ['MON']); TL.autofill(wb, sh, R(0, 9, 0, 9), R(0, 9, 2, 9)); T.eq(col(sh, 9, 0, 2), ['MON', 'TUE', 'WED'], 'upper preserved');
  setCol(wb, sh, 10, ['january']); TL.autofill(wb, sh, R(0, 10, 0, 10), R(0, 10, 1, 10)); T.eq(col(sh, 10, 0, 1), ['january', 'february'], 'lower preserved');
  setCol(wb, sh, 11, ['a', 'b']); TL.autofill(wb, sh, R(0, 11, 1, 11), R(0, 11, 5, 11)); T.eq(col(sh, 11, 0, 5), ['a', 'b', 'a', 'b', 'a', 'b'], 'pattern repeat');
  setCol(wb, sh, 12, ['Item 001']); TL.autofill(wb, sh, R(0, 12, 0, 12), R(0, 12, 1, 12)); T.eq(sh.getValue(1, 12), 'Item 002', 'zero padding');
  setCol(wb, sh, 13, [2, 4]); TL.autofill(wb, sh, R(0, 13, 1, 13), R(0, 13, 3, 13), { type: 'growth' }); T.eq(col(sh, 13, 0, 3), [2, 4, 8, 16], 'growth');
  setCol(wb, sh, 14, [1, 2, 4]); TL.autofill(wb, sh, R(0, 14, 2, 14), R(0, 14, 4, 14)); T.ok(Math.abs(sh.getValue(3, 14) - 16 / 3) < 1e-9 && Math.abs(sh.getValue(4, 14) - 41 / 6) < 1e-9, 'regression trend');
  setCol(wb, sh, 15, [0.1, 0.2]); TL.autofill(wb, sh, R(0, 15, 1, 15), R(0, 15, 2, 15)); T.eq(sh.getValue(2, 15), 0.3, 'float rounding');
  // copy mode
  setCol(wb, sh, 16, [1, 2]); TL.autofill(wb, sh, R(0, 16, 1, 16), R(0, 16, 3, 16), { mode: 'copy' }); T.eq(col(sh, 16, 0, 3), [1, 2, 1, 2], 'copy mode');
}
{ const { wb, sh } = mk();
  // up / left
  setCol(wb, sh, 0, [1, 2], 3); TL.autofill(wb, sh, R(3, 0, 4, 0), R(0, 0, 4, 0)); T.eq(colA(sh, 0, 4), [-2, -1, 0, 1, 2], 'fill up reverses');
  put(wb, sh, 'C1', 1); put(wb, sh, 'D1', 2); TL.autofill(wb, sh, R(0, 2, 0, 3), R(0, 0, 0, 3)); T.eq([sh.getValue(0, 0), sh.getValue(0, 1)], [-1, 0], 'fill left');
  put(wb, sh, 'A8', 1); put(wb, sh, 'B8', 2); TL.autofill(wb, sh, R(7, 0, 7, 1), R(7, 0, 7, 4)); T.eq([2, 3, 4].map((c) => sh.getValue(7, c)), [3, 4, 5], 'fill right');
}
{ const { wb, sh } = mk(); const ds = dateStyle(wb);
  const dv = (r, v) => wb.tx('t', () => wb.put(sh, r, 0, { v, s: ds }));
  dv(0, 45292); TL.autofill(wb, sh, R(0, 0, 0, 0), R(0, 0, 2, 0)); T.eq(colA(sh, 0, 2), [45292, 45293, 45294], 'single date +1 day');
  T.eq(sh.getCell(2, 0).s, ds, 'date style copied');
  const { wb: w2, sh: s2 } = mk(); const d2 = dateStyle(w2); w2.tx('t', () => { w2.put(s2, 0, 0, { v: 45292, s: d2 }); w2.put(s2, 1, 0, { v: 45323, s: d2 }); });
  TL.autofill(w2, s2, R(0, 0, 1, 0), R(0, 0, 3, 0)); T.eq(colA(s2, 2, 3), [45352, ZN.date.fromYMD(2024, 4, 1)], 'monthly dates');
  const { wb: w3, sh: s3 } = mk(); const d3 = dateStyle(w3); w3.tx('t', () => { w3.put(s3, 0, 0, { v: ZN.date.fromYMD(2024, 1, 1), s: d3 }); w3.put(s3, 1, 0, { v: ZN.date.fromYMD(2025, 1, 1), s: d3 }); });
  TL.autofill(w3, s3, R(0, 0, 1, 0), R(0, 0, 2, 0)); T.eq(s3.getValue(2, 0), ZN.date.fromYMD(2026, 1, 1), 'yearly dates');
  const { wb: w4, sh: s4 } = mk(); const d4 = dateStyle(w4); w4.tx('t', () => { w4.put(s4, 0, 0, { v: 45292, s: d4 }); w4.put(s4, 1, 0, { v: 45299, s: d4 }); });
  TL.autofill(w4, s4, R(0, 0, 1, 0), R(0, 0, 2, 0)); T.eq(s4.getValue(2, 0), 45306, 'weekly dates');
  const { wb: w5, sh: s5 } = mk(); const d5 = dateStyle(w5); w5.tx('t', () => { w5.put(s5, 0, 0, { v: 45292, s: d5 }); });
  TL.autofill(w5, s5, R(0, 0, 0, 0), R(0, 0, 5, 0), { dateUnit: 'weekday', mode: 'series' }); T.eq(colA(s5, 0, 5).map((x) => ZN.date.weekday(x)), [1, 2, 3, 4, 5, 1], 'weekday unit skips weekends');
}
{ const { wb, sh } = mk();
  put(wb, sh, 'A1', 1); put(wb, sh, 'B1', '=A1*2'); TL.autofill(wb, sh, R(0, 1, 0, 1), R(0, 1, 2, 1));
  T.eq(sh.getCell(1, 1).f, 'A2*2', 'formula relative down'); T.eq(sh.getCell(2, 1).f, 'A3*2', 'formula relative down 2');
  put(wb, sh, 'A2', 5); T.eq(sh.getValue(1, 1), 10, 'filled formula computes');
  put(wb, sh, 'D1', '=$A$1+A1'); TL.autofill(wb, sh, R(0, 3, 0, 3), R(0, 3, 0, 5)); T.eq(sh.getCell(0, 5).f, '$A$1+C1', 'formula right + absolute');
  // styles
  const b = wb.mergeStyle(0, { b: 1 }); const it = wb.mergeStyle(0, { i: 1 });
  wb.tx('t', () => { wb.put(sh, 10, 0, { v: 1, s: b }); wb.put(sh, 11, 0, { v: 2, s: b }); wb.put(sh, 12, 0, { v: 'x', s: it }); });
  TL.autofill(wb, sh, R(10, 0, 11, 0), R(10, 0, 12, 0), { mode: 'noformats' }); T.eq([sh.getValue(12, 0), sh.getCell(12, 0).s], [3, it], 'noformats keeps target style');
  TL.autofill(wb, sh, R(10, 0, 11, 0), R(10, 0, 13, 0)); T.eq(sh.getCell(13, 0).s, b, 'styles copied');
  wb.tx('t', () => { wb.put(sh, 20, 0, { v: 1, s: b }); wb.setValue(sh, 21, 0, 'keep'); });
  TL.autofill(wb, sh, R(20, 0, 20, 0), R(20, 0, 21, 0), { mode: 'formats' }); T.eq([sh.getValue(21, 0), sh.getCell(21, 0).s], ['keep', b], 'formats only');
  T.eq(TL.insertSeriesPreview(wb, sh, R(10, 0, 11, 0), 3, {})[0], [3, 4, 5], 'preview');
  // fillSeries
  put(wb, sh, 'F1', 1); TL.fillSeries(wb, sh, R(0, 5, 4, 5), { type: 'linear', step: 2 }); T.eq(col(sh, 5, 0, 4), [1, 3, 5, 7, 9], 'fillSeries linear');
  put(wb, sh, 'G1', 1); TL.fillSeries(wb, sh, R(0, 6, 4, 6), { type: 'growth', step: 2 }); T.eq(col(sh, 6, 0, 4), [1, 2, 4, 8, 16], 'fillSeries growth');
  put(wb, sh, 'H1', 1); TL.fillSeries(wb, sh, R(0, 7, 9, 7), { step: 1, stop: 4 }); T.eq(col(sh, 7, 0, 5), [1, 2, 3, 4, null, null].slice(0, 6), 'fillSeries stop');
  put(wb, sh, 'A30', 10); TL.fillSeries(wb, sh, R(29, 0, 29, 3), { byRows: true, step: 5 }); T.eq([0, 1, 2, 3].map((c) => sh.getValue(29, c)), [10, 15, 20, 25], 'fillSeries byRows');
  const ds = dateStyle(wb); wb.tx('t', () => wb.put(sh, 40, 0, { v: ZN.date.fromYMD(2024, 1, 31), s: ds }));
  TL.fillSeries(wb, sh, R(40, 0, 42, 0), { type: 'date', dateUnit: 'month' }); T.eq(colA(sh, 41, 42), [ZN.date.fromYMD(2024, 2, 29), ZN.date.fromYMD(2024, 3, 31)], 'fillSeries month clamp');
}

// ---------- sort ----------
{ const { wb, sh } = mk();
  setCol(wb, sh, 0, [3, 'b', true, undefined, 1, 'a']); setCol(wb, sh, 1, [0, 1, 2, 3, 4, 5]);
  TL.sortRange(wb, sh, R(0, 0, 5, 1), [{ col: 0, dir: 'asc' }], {});
  T.eq(colA(sh, 0, 5), [1, 3, 'a', 'b', true, null], 'excel order asc'); T.eq(col(sh, 1, 0, 5), [4, 0, 5, 1, 2, 3], 'rows move together');
  TL.sortRange(wb, sh, R(0, 0, 5, 1), [{ col: 0, dir: 'desc' }], {}); T.eq(colA(sh, 0, 5), [true, 'b', 'a', 3, 1, null], 'desc, blanks last');
  const s = mk(); setCol(s.wb, s.sh, 0, ['H', 3, 1, 2]); TL.sortRange(s.wb, s.sh, R(0, 0, 3, 0), [{ col: 0 }], { header: true }); T.eq(colA(s.sh, 0, 3), ['H', 1, 2, 3], 'header kept');
}
{ const { wb, sh } = mk(); setCol(wb, sh, 0, ['b', 'a', 'b', 'a']); setCol(wb, sh, 1, [2, 9, 1, 3]); setCol(wb, sh, 2, ['p', 'q', 'r', 's']);
  TL.sortRange(wb, sh, R(0, 0, 3, 2), [{ col: 0 }, { col: 1, dir: 'desc' }], {}); T.eq(col(sh, 2, 0, 3), ['q', 's', 'p', 'r'], 'multi-key');
  const t = mk(); setCol(t.wb, t.sh, 0, ['x', 'x', 'x']); setCol(t.wb, t.sh, 1, [1, 2, 3]); TL.sortRange(t.wb, t.sh, R(0, 0, 2, 1), [{ col: 0 }], {}); T.eq(col(t.sh, 1, 0, 2), [1, 2, 3], 'stable');
  const c = mk(); setCol(c.wb, c.sh, 0, ['A', 'a', 'B', 'b']); TL.sortRange(c.wb, c.sh, R(0, 0, 3, 0), [{ col: 0, caseSensitive: true }], {}); T.eq(colA(c.sh, 0, 3), ['a', 'A', 'b', 'B'], 'case sensitive');
  const u = mk(); setCol(u.wb, u.sh, 0, ['Low', 'High', 'Mid', 'zzz']); TL.sortRange(u.wb, u.sh, R(0, 0, 3, 0), [{ col: 0, custom: ['High', 'Mid', 'Low'] }], {}); T.eq(colA(u.sh, 0, 3), ['High', 'Mid', 'Low', 'zzz'], 'custom list');
}
{ const { wb, sh } = mk(); setCol(wb, sh, 0, [3, 1, 2]); setCol(wb, sh, 1, [10, 20, 30]); put(wb, sh, 'C1', '=A1+B1'); put(wb, sh, 'C2', '=A2+B2'); put(wb, sh, 'C3', '=A3+B3+$B$1');
  const bold = wb.mergeStyle(0, { b: 1 }); wb.tx('t', () => wb.put(sh, 1, 0, { v: 1, s: bold }));
  TL.sortRange(wb, sh, R(0, 0, 2, 2), [{ col: 0 }], {});
  T.eq(col(sh, 2, 0, 2), [21, 52, 13], 'formulas follow rows'); T.eq(sh.getCell(0, 2).f, 'A1+B1', 'same-row refs retargeted'); T.eq(sh.getCell(1, 2).f, 'A2+B2+$B$1', 'absolute refs kept');
  T.eq(sh.getCell(0, 0).s, bold, 'style moves with cell');
  const u = mk(); u.wb.tx('t', () => u.wb.undo); setCol(u.wb, u.sh, 0, [2, 1]); u.wb.tx('sort', () => TL.sortRange(u.wb, u.sh, R(0, 0, 1, 0), [{ col: 0 }], {})); u.wb.undo(); T.eq(colA(u.sh, 0, 1), [2, 1], 'sort undo');
  const d = mk(); const red = d.wb.mergeStyle(0, { bg: '#ff0000' }); setCol(d.wb, d.sh, 0, [1, 2, 3]); d.wb.tx('t', () => d.wb.put(d.sh, 2, 0, { v: 3, s: red }));
  TL.sortRange(d.wb, d.sh, R(0, 0, 2, 0), [{ col: 0, by: 'color', color: '#FF0000' }], {}); T.eq(colA(d.sh, 0, 2), [3, 1, 2], 'sort by fill colour');
  const h = mk(); [3, 1, 2].forEach((v, c) => h.wb.tx('t', () => { h.wb.setValue(h.sh, 0, c, v); h.wb.setValue(h.sh, 1, c, v * 10); })); TL.sortRange(h.wb, h.sh, R(0, 0, 1, 2), [{ col: 0, row: 0 }], { byRows: true }); T.eq([0, 1, 2].map((c) => h.sh.getValue(0, c)), [1, 2, 3], 'byRows'); T.eq([0, 1, 2].map((c) => h.sh.getValue(1, c)), [10, 20, 30], 'byRows moves columns whole');
}
{ const { wb, sh } = mk(); const N = 100000; const vals = []; for (let i = 0; i < N; i++) vals.push((i * 7919) % 100003);
  wb.tx('fill', () => { for (let i = 0; i < N; i++) { wb.setValue(sh, i, 0, vals[i]); wb.setValue(sh, i, 1, i); } });
  const t0 = performance.now(); wb.tx('sort', () => TL.sortRange(wb, sh, R(0, 0, N - 1, 1), [{ col: 0 }], {})); const ms = performance.now() - t0;
  T.ok(ms < 1500, '100k sort ' + Math.round(ms) + 'ms'); T.ok(sh.getValue(0, 0) <= sh.getValue(1, 0) && sh.getValue(N - 2, 0) <= sh.getValue(N - 1, 0), '100k sorted');
}

// ---------- filter ----------
{ const { wb, sh } = mk(); setCol(wb, sh, 0, ['Name', 'Apple', 'Banana', 'apricot', 'Cherry', undefined]); setCol(wb, sh, 1, ['N', 10, 20, 30, 40, 50]);
  const f = (crit) => Array.from(TL.filterRows(wb, sh, R(0, 0, 5, 1), true, crit).hidden).sort((a, b) => a - b);
  T.eq(f({ 0: { values: ['Apple', 'Cherry'] } }), [2, 3, 5], 'values');
  T.eq(f({ 0: { values: ['Apple'], blanks: true } }), [2, 3, 4], 'values + blanks');
  T.eq(f({ 0: { text: { op: 'begins', v: 'ap' } } }), [2, 4, 5], 'begins case-insens');
  T.eq(f({ 0: { text: { op: 'contains', v: 'an' } } }), [1, 3, 4, 5], 'contains');
  T.eq(f({ 0: { text: { op: 'notContains', v: 'an' } } }), [2], 'notContains includes blanks');
  T.eq(f({ 0: { text: { op: 'ends', v: 'y' } } }), [1, 2, 3, 5], 'ends');
  T.eq(f({ 0: { text: { op: 'eq', v: 'a*' } } }), [2, 4, 5], 'wildcard eq');
  T.eq(f({ 1: { num: { op: 'gt', v: 20 } } }), [1, 2], 'gt'); T.eq(f({ 1: { num: { op: 'between', v: 20, v2: 40 } } }), [1, 5], 'between'); T.eq(f({ 1: { num: { op: 'ne', v: 20 } } }), [2], 'ne');
  T.eq(f({ 1: { top: { n: 2 } } }), [1, 2, 3], 'top 2'); T.eq(f({ 1: { top: { n: 1, bottom: true } } }), [2, 3, 4, 5], 'bottom 1'); T.eq(f({ 1: { top: { n: 40, pct: true } } }), [1, 2, 3, 4].filter((x) => x < 4 || false).concat([]).length ? [1, 2, 3] : [], 'top 40pct');
  T.eq(f({ 1: { aboveAvg: true } }), [1, 2, 3], 'above avg'); T.eq(f({ 1: { aboveAvg: false } }), [3, 4, 5], 'below avg');
  T.eq(f({ 1: { any: [{ num: { op: 'lt', v: 15 } }, { num: { op: 'gt', v: 45 } }] } }), [2, 3, 4], 'any (or)'); T.eq(f({ 1: { all: [{ num: { op: 'gt', v: 15 } }, { num: { op: 'lt', v: 45 } }] } }), [1, 5], 'all (and)');
  T.eq(f({ 0: { text: { op: 'contains', v: 'a' } }, 1: { num: { op: 'ge', v: 30 } } }), [1, 2, 4, 5].filter((x) => x !== 1 && x !== 2 || false).length >= 0 ? [1, 2, 4, 5] : [], 'two columns AND');
  const red = wb.mergeStyle(0, { bg: '#ff0000' }); wb.tx('t', () => wb.put(sh, 2, 1, { v: 20, s: red }));
  T.eq(f({ 1: { color: { bg: '#FF0000' } } }), [1, 3, 4, 5], 'color filter');
  const d = mk(); const base = ZN.date.fromYMD(2024, 5, 15); setCol(d.wb, d.sh, 0, ['D', base, base + 1, base - 40, ZN.date.fromYMD(2023, 5, 15)]);
  const g = (when) => Array.from(TL.filterRows(d.wb, d.sh, R(0, 0, 4, 0), true, { 0: { date: { when, today: base } } }).hidden).sort();
  T.eq(g('today'), [2, 3, 4], 'date today'); T.eq(g('tomorrow'), [1, 3, 4], 'date tomorrow'); T.eq(g('thisMonth'), [3, 4], 'date thisMonth'); T.eq(g('thisYear'), [4], 'date thisYear'); T.eq(g('Q2'), [], 'date Q2 keeps all'); T.eq(g('Q3'), [1, 2, 3, 4], 'date Q3 hides all'); T.eq(g('M5'), [3], 'date M5');
  const dv = TL.distinctValues(wb, sh, R(0, 0, 5, 1), true, 0); T.eq(dv.map((x) => x.text), ['Apple', 'apricot', 'Banana', 'Cherry', ''], 'distinct sorted + blank last'); T.eq(dv[4].blank, true, 'blank entry');
  const dd = mk(); setCol(dd.wb, dd.sh, 0, ['h', 'x', 'X', 'y', 'x']); const dd2 = TL.distinctValues(dd.wb, dd.sh, R(0, 0, 4, 0), true, 0); T.eq(dd2.map((x) => [x.text, x.count]), [['x', 3], ['y', 1]], 'distinct counts case-insens'); T.eq(TL.distinctValues(dd.wb, dd.sh, R(0, 0, 4, 0), true, 0, { limit: 1 }).length, 1, 'distinct limit');
}

// ---------- pivot ----------
{ const { wb, sh } = mk(); const rows = [['Region', 'Product', 'Sales'], ['East', 'Apple', 10], ['East', 'Pear', 20], ['West', 'Apple', 5], ['West', 'Pear', 15], ['East', 'Apple', 7]];
  rows.forEach((r, i) => r.forEach((v, j) => wb.tx('t', () => wb.setValue(sh, i, j, v))));
  T.eq(TL.columnTitles(wb, sh, R(0, 0, 5, 2), true), ['Region', 'Product', 'Sales'], 'columnTitles');
  const p = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], cols: [1], values: [{ col: 2, agg: 'sum' }], grandTotals: { rows: true, cols: true }, header: true });
  const vals = p.cells.map((r) => r.map((x) => x.v)); T.eq(vals, [['Region', 'Apple', 'Pear', 'Grand Total'], ['East', 17, 20, 37], ['West', 5, 15, 20], ['Grand Total', 22, 35, 57]], 'pivot sum grid'); T.eq([p.rows, p.cols], [4, 4], 'pivot dims');
  T.eq([p.cells[0][0].kind, p.cells[0][1].kind, p.cells[1][0].kind, p.cells[1][1].kind, p.cells[1][3].kind, p.cells[3][3].kind], ['corner', 'colHeader', 'rowHeader', 'value', 'total', 'grand'], 'pivot kinds');
  const p2 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], cols: [], values: [{ col: 2, agg: 'sum' }, { col: 2, agg: 'count' }], header: true });
  T.eq(p2.cells.map((r) => r.map((x) => x.v)), [['Region', 'Sum of Sales', 'Count of Sales'], ['East', 37, 3], ['West', 20, 2], ['Grand Total', 57, 5]], 'pivot two values');
  const p3 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], cols: [], values: [{ col: 2, agg: 'sum', show: 'pctOfTotal' }], header: true }); T.ok(Math.abs(p3.cells[1][1].v - 37 / 57) < 1e-12 && p3.cells[3][1].v === 1, 'pct of total');
  const p4 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], values: [{ col: 2, agg: 'average' }, { col: 2, agg: 'max' }, { col: 2, agg: 'min' }, { col: 2, agg: 'median' }], header: true }); T.eq(p4.cells[1].slice(1).map((x) => x.v), [37 / 3, 20, 7, 10], 'avg/max/min/median East');
  const p5 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], values: [{ col: 2, agg: 'sum' }], filters: { 1: ['Apple'] }, header: true }); T.eq(p5.cells.map((r) => r[1].v), ['Sum of Sales', 17, 5, 22], 'pivot filter');
  const p6 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0, 1], values: [{ col: 2, agg: 'sum' }], subtotals: true, header: true }); T.eq(p6.cells.map((r) => [r[0].v, r[1].v, r[2].v]), [['Region', 'Product', 'Sum of Sales'], ['East', 'Apple', 17], [null, 'Pear', 20], ['East Total', null, 37], ['West', 'Apple', 5], [null, 'Pear', 15], ['West Total', null, 20], ['Grand Total', null, 57]], 'pivot subtotals');
  const p7 = TL.pivot(wb, sh, R(0, 0, 5, 2), { rows: [0], values: [{ col: 2, agg: 'sum' }], grandTotals: { rows: false, cols: false }, header: true }); T.eq(p7.rows, 3, 'no grand totals');
  const t2 = mk(); [['k', 'v'], ['b', 1], [undefined, 2], ['a', 3], [10, 4], [9, 5]].forEach((r, i) => r.forEach((v, j) => v !== undefined && t2.wb.tx('t', () => t2.wb.setValue(t2.sh, i, j, v))));
  const q = TL.pivot(t2.wb, t2.sh, R(0, 0, 5, 1), { rows: [0], values: [{ col: 1, agg: 'sum' }], header: true }); T.eq(q.cells.map((r) => r[0].v).slice(1, 6), [9, 10, 'a', 'b', '(blank)'], 'natural label order + (blank)');
  const out = mk(); const rg = TL.writePivot(out.wb, out.sh, 10, 5, p); T.eq([out.sh.getValue(11, 6), out.sh.getValue(13, 8), rg.r2, rg.c2], [17, 57, 13, 8], 'writePivot values'); T.ok(out.wb.style(out.sh.getCell(10, 6).s).b === 1, 'writePivot bold header');
}

// ---------- goal seek ----------
{ const { wb, sh } = mk(); put(wb, sh, 'A1', 1); put(wb, sh, 'B1', '=A1^2-9');
  const r = TL.goalSeek(wb, sh, { r: 0, c: 1 }, 0, { r: 0, c: 0 }); T.ok(r.ok && r.reached, 'goalSeek reached'); T.ok(Math.abs(r.value - 3) < 1e-6, 'sqrt 9 = 3 (' + r.value + ')');
  T.eq(sh.getValue(0, 0), 1, 'changing cell restored'); T.eq(sh.getValue(0, 1), -8, 'target recalculated after restore'); T.ok(r.iterations > 0 && r.iterations < 100, 'iterations ' + r.iterations);
  put(wb, sh, 'C1', '=2*A1+1'); const r2 = TL.goalSeek(wb, sh, { r: 0, c: 2 }, 11, { r: 0, c: 0 }); T.ok(Math.abs(r2.value - 5) < 1e-6, 'linear goal'); 
  put(wb, sh, 'A1', -4); const r3 = TL.goalSeek(wb, sh, { r: 0, c: 1 }, 0, { r: 0, c: 0 }); T.ok(Math.abs(r3.value + 3) < 1e-6, 'negative root from negative start');
  put(wb, sh, 'D1', '=A1^2+1'); const r4 = TL.goalSeek(wb, sh, { r: 0, c: 3 }, 0, { r: 0, c: 0 }, { maxIter: 30 }); T.ok(!r4.ok && !r4.reached, 'unreachable fails');
  put(wb, sh, 'E1', '=A1'); const r5 = TL.goalSeek(wb, sh, { r: 0, c: 1 }, 0, { r: 0, c: 4 }); T.ok(!r5.ok, 'formula changing cell rejected');
  put(wb, sh, 'F1', 0); put(wb, sh, 'G1', '=F1^3'); const r6 = TL.goalSeek(wb, sh, { r: 0, c: 6 }, 27, { r: 0, c: 5 }); T.ok(Math.abs(r6.value - 3) < 1e-3, 'cubic');
}

// ---------- text to columns ----------
{ const t = TL.textToColumns;
  T.eq(t(['a,b,c'], { delimiters: { comma: true } }), [['a', 'b', 'c']], 'comma');
  T.eq(t(['a,"b,c",d'], { delimiters: { comma: true }, qualifier: '"' }), [['a', 'b,c', 'd']], 'qualifier');
  T.eq(t(['a,"b""c",d'], { delimiters: { comma: true } }), [['a', 'b"c', 'd']], 'escaped qualifier');
  T.eq(t(['a  b'], { delimiters: { space: true } }), [['a', '', 'b']], 'space not consecutive'); T.eq(t(['a  b'], { delimiters: { space: true }, consecutive: true }), [['a', 'b']], 'consecutive');
  T.eq(t(['a;b,c'], { delimiters: { semicolon: true, comma: true } }), [['a', 'b', 'c']], 'multiple delimiters'); T.eq(t(['a|b'], { delimiters: { other: '|' } }), [['a', 'b']], 'other'); T.eq(t(['a\tb'], { delimiters: { tab: true } }), [['a', 'b']], 'tab');
  T.eq(t(['abcdef'], { fixed: [2, 4] }), [['ab', 'cd', 'ef']], 'fixed width'); T.eq(t(['a,b,'], { delimiters: { comma: true } }), [['a', 'b', '']], 'trailing empty');
  const { wb, sh } = mk(); wb.tx('t', () => { wb.setValue(sh, 0, 0, 'x,1'); wb.setValue(sh, 1, 0, 'y,2,z'); });
  const res = wb.tx('t', () => TL.applyTextToColumns(wb, sh, R(0, 0, 1, 0), { delimiters: { comma: true } })); T.eq([sh.getValue(0, 0), sh.getValue(0, 1), sh.getValue(1, 2), res.cols], ['x', 1, 'z', 3], 'applyTextToColumns retypes numbers');
}

// ---------- duplicates ----------
{ const { wb, sh } = mk(); setCol(wb, sh, 0, ['a', 'A', 'b', 'c', 'b', undefined, undefined, 1, 1]);
  const d = TL.findDuplicates(wb, sh, R(0, 0, 8, 0)); T.eq(d.cells.map((x) => x.r), [0, 1, 2, 4, 7, 8], 'dups case-insens'); T.eq(d.groups.length, 3, 'dup groups');
  T.eq(TL.findDuplicates(wb, sh, R(0, 0, 8, 0), { caseSensitive: true }).cells.map((x) => x.r), [2, 4, 7, 8], 'dups case-sens');
  const t = mk(); setCol(t.wb, t.sh, 0, [1, 2, 1, 3]); setCol(t.wb, t.sh, 1, ['x', 'y', 'x', 'y']); T.eq(TL.findDuplicates(t.wb, t.sh, R(0, 0, 3, 1), { byRow: true }).cells.length, 4, 'dup rows cells'); T.eq(TL.findDuplicates(t.wb, t.sh, R(0, 0, 3, 1), { byRow: true }).groups[0].map((x) => x.r), [0, 2], 'dup row group');
  setCol(t.wb, t.sh, 2, [10, 20, 30, 40]); const rm = t.wb.tx('t', () => TL.removeDuplicates(t.wb, t.sh, R(0, 0, 3, 2), { cols: [0, 1] })); T.eq(rm, { removed: 1, remaining: 3 }, 'removeDuplicates result'); T.eq(col(t.sh, 2, 0, 3), [10, 20, 40, null], 'rows shifted, tail cleared');
  const h = mk(); setCol(h.wb, h.sh, 0, ['H', 'a', 'a', 'b']); T.eq(h.wb.tx('t', () => TL.removeDuplicates(h.wb, h.sh, R(0, 0, 3, 0), { header: true })), { removed: 1, remaining: 2 }, 'removeDuplicates header'); T.eq(colA(h.sh, 0, 3), ['H', 'a', 'b', null], 'header preserved');
}

// ---------- validation ----------
{ const { wb, sh } = mk(); const dv = (o) => { sh.dv = [Object.assign({ id: 1, ranges: [[0, 0, 4, 0]], allowBlank: true }, o)]; };
  dv({ type: 'whole', op: 'between', v1: 1, v2: 10, errTitle: 'Bad', errMsg: 'Nope' }); T.eq(TL.validate(wb, sh, 0, 0, 5).ok, true, 'whole ok'); T.eq(TL.validate(wb, sh, 0, 0, 11), { ok: false, style: 'stop', title: 'Bad', message: 'Nope' }, 'whole fail'); T.eq(TL.validate(wb, sh, 0, 0, '7').ok, true, 'typed text'); T.eq(TL.validate(wb, sh, 0, 0, 2.5).ok, false, 'whole rejects decimals'); T.eq(TL.validate(wb, sh, 0, 0, 'abc').ok, false, 'text rejected'); T.eq(TL.validate(wb, sh, 9, 0, 99).ok, true, 'outside range unrestricted');
  T.eq(TL.validate(wb, sh, 0, 0, '').ok, true, 'blank allowed'); dv({ type: 'whole', op: 'gt', v1: 0, allowBlank: false }); T.eq(TL.validate(wb, sh, 0, 0, '').ok, false, 'blank disallowed');
  dv({ type: 'decimal', op: 'ge', v1: 0.5, errStyle: 'warning' }); T.eq([TL.validate(wb, sh, 0, 0, 0.5).ok, TL.validate(wb, sh, 0, 0, 0.4).style], [true, 'warning'], 'decimal + warning style');
  dv({ type: 'decimal', op: 'ne', v1: 3, showError: false }); T.eq(TL.validate(wb, sh, 0, 0, 3).ok, true, 'showError false accepts');
  dv({ type: 'list', list: ['Red', 'Green'] }); T.eq([TL.validate(wb, sh, 0, 0, 'Red').ok, TL.validate(wb, sh, 0, 0, 'red').ok, TL.validate(wb, sh, 0, 0, 'Blue').ok], [true, false, false], 'inline list case-sensitive'); T.eq(TL.dropdownItems(wb, sh, 0, 0), ['Red', 'Green'], 'dropdown items'); T.eq(TL.dropdownItems(wb, sh, 9, 0), null, 'no dropdown outside');
  dv({ type: 'list', list: ['a'], dropdown: false }); T.eq(TL.dropdownItems(wb, sh, 0, 0), null, 'dropdown hidden');
  setCol(wb, sh, 3, ['Yes', 'No', 'Maybe']); dv({ type: 'list', source: '=$D$1:$D$3' }); T.eq([TL.validate(wb, sh, 0, 0, 'yes').ok, TL.validate(wb, sh, 0, 0, 'Perhaps').ok], [true, false], 'range list case-insens'); T.eq(TL.dropdownItems(wb, sh, 1, 0), ['Yes', 'No', 'Maybe'], 'range dropdown');
  dv({ type: 'list', source: 'x, y ,z' }); T.eq(TL.dropdownItems(wb, sh, 0, 0), ['x', 'y', 'z'], 'comma source');
  dv({ type: 'length', op: 'le', v1: 3 }); T.eq([TL.validate(wb, sh, 0, 0, 'abc').ok, TL.validate(wb, sh, 0, 0, 'abcd').ok], [true, false], 'length');
  dv({ type: 'date', op: 'between', v1: '2024-01-01', v2: '2024-12-31' }); T.eq([TL.validate(wb, sh, 0, 0, '2024-06-01').ok, TL.validate(wb, sh, 0, 0, '2023-12-31').ok, TL.validate(wb, sh, 0, 0, ZN.date.fromYMD(2024, 2, 2)).ok], [true, false, true], 'date between');
  dv({ type: 'time', op: 'gt', v1: 0.5 }); T.eq([TL.validate(wb, sh, 0, 0, 0.75).ok, TL.validate(wb, sh, 0, 0, 0.25).ok], [true, false], 'time');
  dv({ type: 'custom', formula: 'A1>5' }); T.eq([TL.validate(wb, sh, 2, 0, 7).ok, TL.validate(wb, sh, 2, 0, 3).ok], [true, false], 'custom relative formula'); T.eq(sh.getValue(2, 0), null, 'custom leaves cell untouched');
  dv({ type: 'custom', formula: '=COUNTIF($A$1:$A$5,A1)=0' }); 
  dv({ type: 'whole', op: 'eq', v1: '=B1+1' }); setCol(wb, sh, 1, [4, 9]); T.eq([TL.validate(wb, sh, 0, 0, 5).ok, TL.validate(wb, sh, 1, 0, 10).ok, TL.validate(wb, sh, 1, 0, 5).ok], [true, true, false], 'formula operand relative');
  dv({ type: 'whole', op: 'gt', v1: 0, promptTitle: 'Hint', prompt: 'Enter positive', showPrompt: true }); T.eq(TL.inputMessage(wb, sh, 0, 0), { title: 'Hint', message: 'Enter positive' }, 'input message'); T.eq(TL.inputMessage(wb, sh, 8, 0), null, 'no input message');
  sh.dv[0].ranges = [[0, 0, 3, 0]]; setCol(wb, sh, 0, [5, -1, 'x', undefined]); T.eq(TL.circleInvalid(wb, sh), [{ r: 1, c: 0 }, { r: 2, c: 0 }], 'circleInvalid');
  T.eq(TL.validate(wb, sh, 0, 0, -3).message, "This value doesn't match the data validation restrictions defined for this cell.", 'default message'); T.eq(TL.validate(wb, sh, 0, 0, -3).title, 'Microsoft Excel', 'default title');
}

// ---------- find / replace ----------
{ const { wb, sh } = mk(); const sh2 = wb.addSheet('Two'); const strs = ['Apple pie', 'apple', 'Pineapple', 'Banana', 'x1y22']; setCol(wb, sh, 0, strs); wb.tx('t', () => { wb.setValue(sh, 0, 1, 42); wb.setValue(sh2, 3, 3, 'apple tree'); });
  const f = (o) => TL.find(wb, Object.assign({ sheet: sh }, o)).map((m) => m.r + ',' + m.c);
  T.eq(f({ query: 'apple' }), ['0,0', '1,0', '2,0'], 'find case-insens'); T.eq(f({ query: 'apple', matchCase: true }), ['1,0', '2,0'], 'matchCase'); T.eq(f({ query: 'apple', wholeCell: true }), ['1,0'], 'wholeCell'); T.eq(f({ query: 'a*e', wholeCell: true }), ['0,0', '1,0'], 'wildcard whole'); T.eq(f({ query: '^\\w+le$', regex: true }), ['1,0', '2,0'], 'regex'); T.eq(f({ query: '42' }), ['0,1'], 'numbers by display text');
  T.eq(TL.find(wb, { query: 'apple', scope: 'workbook' }).map((m) => m.sheetId), [sh.id, sh.id, sh.id, sh2.id], 'workbook scope'); T.eq(f({ query: 'a', scope: 'selection', ranges: [R(3, 0, 4, 0)] }), ['3,0'], 'selection scope');
  { const o = mk(); o.wb.tx('t', () => { o.wb.setValue(o.sh, 1, 0, 'z'); o.wb.setValue(o.sh, 0, 1, 'z'); }); const g = (order) => TL.find(o.wb, { sheet: o.sh, query: 'z', order }).map((m) => m.r + ',' + m.c); T.eq(g('rows'), ['0,1', '1,0'], 'find order rows'); T.eq(g('cols'), ['1,0', '0,1'], 'find order cols'); } T.eq(f({ query: 'zzz' }), [], 'no matches'); let err = null; try { TL.find(wb, { query: '(', regex: true }); } catch (e) { err = e; } T.ok(err && /regular expression/i.test(err.message), 'invalid regex throws readable');
  put(wb, sh, 'C1', '=A1&"!"'); T.eq(f({ query: 'apple', lookIn: 'formulas' }).includes('0,2'), false, 'formula text not matching'); T.eq(f({ query: 'A1', lookIn: 'formulas' }), ['0,2'], 'find in formulas'); T.eq(f({ query: 'pie!' }), ['0,2'], 'values include formula results');
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: 'apple' }, 'pear', { all: false })), 1, 'replace one'); T.eq(sh.getValue(0, 0), 'pear pie', 'replace one value');
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: 'apple' }, 'X', { all: true })), 2, 'replace all count'); T.eq(colA(sh, 1, 2), ['X', 'PineX'.replace('X', 'X')], 'replace all values');
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: '(\\d)(\\d)', regex: true }, '$2$1', { all: true })), 1, 'regex replace'); T.eq(sh.getValue(4, 0), 'x1y22', 'swap identical digits unchanged'); 
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: 'x(\\d)y', regex: true }, '<$1>', { all: true })), 1, 'regex groups'); T.eq(sh.getValue(4, 0), '<1>22', 'regex $1');
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: 'A1', lookIn: 'formulas' }, 'A2', { all: true })), 1, 'replace in formula'); T.eq(sh.getCell(0, 2).f, 'A2&"!"', 'formula text replaced');
  const ms = TL.find(wb, { sheet: sh, query: 'Banana' }); T.eq(wb.tx('t', () => TL.replace(wb, ms, 'Cherry', { all: true })), 1, 'replace from match list'); T.eq(sh.getValue(3, 0), 'Cherry', 'match list value');
  T.eq(wb.tx('t', () => TL.replace(wb, { sheet: sh, query: '24', wholeCell: true }, '43', { all: true })), 1, 'numeric replace'); T.eq(sh.getValue(0, 1), 43, 'numeric re-parsed');
  const big = mk(); const N = 100000; big.wb.tx('f', () => { for (let i = 0; i < N; i++) big.wb.setValue(big.sh, i, 0, i % 1000 === 0 ? 'needle ' + i : 'hay ' + i); });
  const t0 = performance.now(); const hits = TL.find(big.wb, { sheet: big.sh, query: 'needle' }); const ms2 = performance.now() - t0; T.eq(hits.length, 100, '100k find hits'); T.ok(ms2 < 300, '100k find ' + Math.round(ms2) + 'ms');
}

// ---------- stats ----------
{ const { wb, sh } = mk(); setCol(wb, sh, 0, [1, 2, 3, 'x', true, undefined, 10]); setCol(wb, sh, 1, [4, 5]);
  T.eq(TL.stats(wb, sh, [R(0, 0, 6, 0)]), { count: 6, nums: 4, countNums: 4, sum: 16, avg: 4, min: 1, max: 10 }, 'stats column');
  T.eq(TL.stats(wb, sh, [R(0, 0, 2, 0), R(1, 0, 4, 1)]).count, 6, 'overlap deduped'); T.eq(TL.stats(wb, sh, [R(0, 0, 2, 0), R(0, 0, 2, 0)]).sum, 6, 'identical ranges counted once');
  T.eq(TL.stats(wb, sh, [R(0, 0, MAXR1(), 0)]).sum, 16, 'whole column'); T.eq(TL.stats(wb, sh, [R(20, 0, 25, 0)]), { count: 0, nums: 0, countNums: 0, sum: 0, avg: null, min: null, max: null }, 'empty stats');
  T.eq(TL.stats(wb, sh, [R(0, 0, 0, ZN.MAXC - 1)]).sum, 5, 'whole row');
}
function MAXR1() { return ZN.MAXR - 1; }

// ---------- autofit / merge / names / tables ----------
{ const { wb, sh } = mk(); setCol(wb, sh, 0, ['ab', 'abcdef', 'abc']); const meas = (t) => t.length * 10;
  T.eq(TL.autoFitWidth(wb, sh, 0, { measure: meas }), 68, 'autoFitWidth'); T.eq(TL.autoFitWidth(wb, sh, 5, { measure: meas }), sh.defColW, 'empty column');
  const wr = wb.mergeStyle(0, { wr: 1 }); wb.tx('t', () => wb.put(sh, 5, 0, { v: 'a very long wrapped text value', s: wr })); T.eq(TL.autoFitWidth(wb, sh, 0, { measure: meas }), 68, 'wrapped ignored');
  T.eq(TL.autoFitHeight(wb, sh, 0, { measure: meas }), 23, 'autoFitHeight single line'); wb.tx('t', () => wb.setValue(sh, 7, 0, 'l1\nl2')); T.eq(TL.autoFitHeight(wb, sh, 7, { measure: meas }), 42, 'autoFitHeight two lines');
  setCol(wb, sh, 1, [1, 2, 3, 4]); wb.tx('t', () => TL.mergeRanges(sh, R(0, 1, 1, 2))); T.eq(sh.merges, [[0, 1, 1, 2]], 'merge'); T.eq([sh.getValue(0, 1), sh.getValue(1, 1)], [1, null], 'top-left kept, others cleared');
  wb.undo(); T.eq([sh.merges.length, sh.getValue(1, 1)], [0, 2], 'merge undo');
  wb.tx('t', () => { TL.mergeRanges(sh, R(0, 1, 1, 2)); TL.mergeRanges(sh, R(1, 2, 2, 3)); }); T.eq(sh.merges, [[1, 2, 2, 3]], 'overlapping merge replaces'); wb.tx('t', () => TL.unmerge(sh, R(1, 2, 1, 2))); T.eq(sh.merges, [], 'unmerge');
  wb.tx('t', () => TL.mergeRanges(sh, R(10, 0, 11, 2), { across: true })); T.eq(sh.merges, [[10, 0, 10, 2], [11, 0, 11, 2]], 'merge across');
  sh.merges = [[0, 0, 0, 0], [1, 1, 2, 2], [2, 2, 3, 3], [5, 5, 4, 4]]; T.eq(TL.normalizeMerge(sh), 2, 'normalizeMerge count'); T.eq(sh.merges, [[1, 1, 2, 2], [4, 4, 5, 5]], 'normalizeMerge result');
}
{ const { wb, sh } = mk(); put(wb, sh, 'A1', 5); put(wb, sh, 'B1', '=Rate*2'); T.eq(sh.getValue(0, 1), ZN.E.NAME, 'unknown name');
  wb.tx('n', () => TL.defineName(wb, 'Rate', sh.name + '!$A$1')); T.eq(sh.getValue(0, 1), 10, 'defined name works'); T.eq(TL.listNames(wb).map((n) => n.name + ':' + n.ref + ':' + n.scopeName), ['Rate:' + sh.name + '!$A$1:Workbook'], 'listNames');
  wb.undo(); T.eq(sh.getValue(0, 1), ZN.E.NAME, 'name undo'); wb.redo(); T.eq(sh.getValue(0, 1), 10, 'name redo');
  wb.tx('n', () => TL.defineName(wb, 'Rate', '=' + sh.name + '!$A$2')); T.eq(sh.getValue(0, 1), 0, 'redefined name'); wb.undo(); T.eq(sh.getValue(0, 1), 10, 'redefine undo');
  wb.tx('n', () => TL.deleteName(wb, 'Rate')); T.eq(TL.listNames(wb).length, 0, 'deleteName'); wb.undo(); T.eq(TL.listNames(wb).length, 1, 'deleteName undo'); T.eq(TL.deleteName(wb, 'Nope'), false, 'delete missing');
  let e = 0; for (const bad of ['A1', '1abc', 'a b', 'TRUE', '']) { try { TL.defineName(wb, bad, 'A1'); } catch (x) { e++; } } T.eq(e, 5, 'invalid names rejected');
  wb.tx('n', () => TL.defineName(wb, 'Loc', sh.name + '!$A$1', sh)); T.eq(TL.listNames(wb).find((n) => n.name === 'Loc').scopeName, sh.name, 'sheet-scoped name');
}
{ const { wb, sh } = mk(); [['Name', 'Qty'], ['a', 1], ['b', 2]].forEach((r, i) => r.forEach((v, j) => wb.tx('t', () => wb.setValue(sh, i, j, v))));
  const t = wb.tx('t', () => TL.createTable(wb, sh, R(0, 0, 2, 1), { name: 'Sales' })); T.eq([t.name, t.cols, sh.tables.length], ['Sales', ['Name', 'Qty'], 1], 'createTable'); T.ok(wb.tableByName('sales'), 'tableByName');
  setCol(wb, sh, 5, [1]); wb.tx('t', () => wb.setInput(sh, 0, 6, '=SUM(Sales[Qty])')); T.ok(wb.tx('t', () => TL.removeTable(wb, sh, 'Sales')) && sh.tables.length === 0, 'removeTable'); wb.undo(); T.eq(sh.tables.length, 1, 'removeTable undo');
  let err = null; try { TL.createTable(wb, sh, R(1, 0, 2, 0)); } catch (x) { err = x; } T.ok(err, 'overlap rejected'); let e2 = null; try { TL.createTable(wb, sh, R(5, 8, 6, 9), { name: 'Sales' }); } catch (x) { e2 = x; } T.ok(e2, 'duplicate table name rejected');
  const h = mk(); [[1, 2], [3, 4]].forEach((r, i) => r.forEach((v, j) => h.wb.tx('t', () => h.wb.setValue(h.sh, i + 1, j, v)))); const t2 = h.wb.tx('t', () => TL.createTable(h.wb, h.sh, R(1, 0, 2, 1), { header: false })); T.eq([t2.r1, t2.cols, t2.name], [0, ['Column1', 'Column2'], 'Table1'], 'table without header gets header row'); T.eq(h.sh.getValue(0, 1), 'Column2', 'header written');
}
T.done('tools');
