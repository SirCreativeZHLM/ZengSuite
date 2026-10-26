const T = require('./_h'); const { ZN } = T;
for (const t of ZN.templates.list) {
  const wb = ZN.templates.build(t.id); let errs = 0, cells = 0; wb.sheets.forEach((sh) => sh.eachCellObj((c) => { cells++; if (c.v instanceof ZN.ZErr) errs++; }));
  T.eq(errs, 0, t.id + ' has no error cells'); T.ok(wb.sheets.length >= 1, t.id + ' sheet');
  const buf = ZN.io.xlsx.write(wb); const w2 = ZN.io.xlsx.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); T.eq(w2.sheets[0].maxRow(), wb.sheets[0].maxRow(), t.id + ' xlsx roundtrip rows');
  const z = ZN.io.znumbers.read(ZN.io.znumbers.write(wb)); T.eq(z.sheets[0].charts.length, wb.sheets[0].charts.length, t.id + ' znumbers roundtrip charts');
}
const loan = ZN.templates.build('loan'); T.eq(Math.round(loan.sheets[0].getValue(7, 1) * 100) / 100, 1580.17, 'loan payment 250k @6.5% 30y');
const bud = ZN.templates.build('budget'); T.eq(bud.sheets[0].getValue(13, 1), 3180, 'budget planned total');
T.done('templates');
