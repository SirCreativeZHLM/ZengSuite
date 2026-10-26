// Tiny assertion harness. Usage:
//   const T = require('./_h'); T.set('A1', 5); T.f('=SUM(A1:A3)', 8); T.f('=1/0', '#DIV/0!'); T.eq(a, b, 'label'); T.done('name');
// T.f(formula, expected[, label]) evaluates the formula in a scratch cell and compares: numbers with 1e-9 relative tolerance
// (or T.f(formula, expected, label, tolerance)); '#...' strings compare to error codes; arrays compare as 2D arrays; expected can be a function(actual)->bool.
const ZN = require('./_boot'); const { ZErr } = ZN;
const wb = ZN.newWorkbook(); const sh = wb.sheets[0]; const sh2 = wb.addSheet('Data');
let pass = 0, fail = 0; const fails = [];
const norm = (v) => (v instanceof ZErr ? v.code : v == null ? '' : v);
function same(a, b, tol) {
  a = norm(a);
  if (typeof b === 'number' && typeof a === 'number') return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((row, i) => row.length === a[i].length && row.every((x, j) => same(a[i][j], x, tol)));
  return a === b;
}
function rec(ok, label, got, want) { if (ok) pass++; else { fail++; fails.push(`FAIL ${label}: got ${JSON.stringify(got instanceof ZErr ? got.code : got)} want ${JSON.stringify(want instanceof ZErr ? want.code : want)}`); } }
const T = {
  ZN, wb, sheet: sh, data: sh2,
  set(a, v, s = sh) { const p = ZN.parseA1(a); wb.setInput(s, p.r, p.c, typeof v === 'string' ? v : String(v)); },
  setRaw(a, v, s = sh) { const p = ZN.parseA1(a); wb.setValue(s, p.r, p.c, v); },
  fill(a, rows, s = sh) { const p = ZN.parseA1(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v !== null && v !== undefined) wb.setInput(s, p.r + i, p.c + j, typeof v === 'string' ? v : String(v)); })); },
  clear() { wb.tx('clear', () => { for (const s of wb.sheets) s.eachCellObj((c, r, cc) => wb.put(s, r, cc, undefined)); }); },
  val(a, s = sh) { const p = ZN.parseA1(a); return s.getValue(p.r, p.c); },
  // evaluate a formula (leading '=') in Z100 and return the raw result (may be an array if it spills: top-left only; use T.arr)
  run(formula) { const r = 99, c = 25; for (let i = 0; i < 40; i++) for (let j = 0; j < 12; j++) { const x = sh.getCell(r + i, c + j); if (x) wb.put(sh, r + i, c + j, undefined); } const res = wb.setInput(sh, r, c, formula, { force: true }); const cell = sh.getCell(r, c); if (cell && cell.spill) { const out = []; for (let i = 0; i <= cell.spill.r2 - r; i++) { const row = []; for (let j = 0; j <= cell.spill.c2 - c; j++) row.push(sh.getValue(r + i, c + j)); out.push(row); } return out; } return sh.getValue(r, c); },
  f(formula, want, label, tol = 1e-9) { const got = T.run(formula); rec(typeof want === 'function' ? want(got) : same(got, want, tol), label || formula, got, want); },
  eq(got, want, label, tol = 1e-9) { rec(typeof want === 'function' ? want(got) : same(got, want, tol), label, got, want); },
  ok(cond, label) { rec(!!cond, label, cond, true); },
  done(name) { for (const f of fails) console.log(f); console.log(`${name}: ${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1; return { pass, fail }; },
  counts() { return { pass, fail }; },
};
module.exports = T;
