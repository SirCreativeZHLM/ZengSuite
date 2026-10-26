const T = require('./_h'); const { ZN } = T;
// operators & parsing (no function library needed)
T.f('=1+2*3', 7); T.f('=(1+2)*3', 9); T.f('=2^3^2', 64); T.f('=-2^2', 4); T.f('=10/4', 2.5); T.f('=1/0', '#DIV/0!'); T.f('=50%', 0.5); T.f('=2*50%', 1);
T.f('="a"&"b"', 'ab'); T.f('=1&2', '12'); T.f('=1=1', true); T.f('="a"="A"', true); T.f('=1<2', true); T.f('="a"<"b"', true); T.f('=1<>2', true); T.f('=TRUE+1', 2);
T.f('="3"+4', 7); T.f('="x"+1', '#VALUE!'); T.f('=#N/A', '#N/A'); T.f('={1,2,3}', [[1, 2, 3]]); T.f('={1;2}', [[1], [2]]); T.f('={1,2;3,4}', [[1, 2], [3, 4]]);
T.f('={1,2,3}*2', [[2, 4, 6]]); T.f('={1,2}+{10;20}', [[11, 12], [21, 22]]);
T.set('A1', 5); T.set('A2', 7); T.set('B1', '=A1*2'); T.set('B2', '=B1+A2');
T.eq(T.val('B1'), 10, 'B1'); T.eq(T.val('B2'), 17, 'B2'); T.set('A1', 6); T.eq(T.val('B2'), 19, 'incremental');
T.f('=A1+A2', 13); T.f('=Data!A1', 0); T.setRaw('A1', 42, T.data); T.f('=Data!A1+1', 43); T.f("='Data'!A1", 42);
T.set('C1', '=C1'); T.eq(T.val('C1'), '#CIRC!', 'circular'); T.set('C1', '=C2+1'); T.set('C2', '=C1+1'); T.eq(T.val('C1'), '#CIRC!', 'circ2');
T.set('C1', '=1'); T.set('C2', '=C1+1'); T.eq(T.val('C2'), 2, 'circ resolved');
T.f('=NOSUCHFN(1)', '#NAME?'); T.f('=Nope!A1', '#REF!');
T.f('=LET(x,2,y,3,x*y)', 6); T.f('=LET(f,LAMBDA(a,a*2),f(4))', 8); T.f('=LAMBDA(a,b,a+b)(1,2)', 3);
// reference rewriting
const FM = ZN.formula;
T.eq(FM.translate('A1+$B$2+C$3+$D4', 1, 1), 'B2+$B$2+D$3+$D5', 'translate'); T.eq(FM.translate('A1', -1, 0), '#REF!', 'translate off-sheet');
T.eq(FM.adjust('A5', 'S', 'S', 'r', 2, 1), 'A6', 'adj ins'); T.eq(FM.adjust('SUM(A1:A5)', 'S', 'S', 'r', 2, -1), 'SUM(A1:A4)', 'adj del'); T.eq(FM.adjust('Other!A5', 'S', 'S', 'r', 2, 1), 'Other!A5', 'adj other sheet');
T.eq(FM.renameSheet("'My Sheet'!A1+X!B2", 'My Sheet', 'Z'), 'Z!A1+X!B2', 'rename');
T.eq(ZN.colName(0) + ZN.colName(25) + ZN.colName(26) + ZN.colName(16383), 'AZAAXFD', 'colName');
// dates (Excel 1900 system)
T.eq(ZN.date.fromYMD(2024, 1, 1), 45292, 'date serial'); T.eq(ZN.date.fromYMD(1900, 3, 1), 61, '1900-03-01'); T.eq(ZN.date.fromYMD(1900, 1, 1), 1, '1900-01-01'); T.eq(ZN.date.toYMD(60).d, 29, 'feb 29 1900');
// undo / structure
T.clear(); T.set('A1', 1); T.set('A2', '=A1+1'); T.set('A3', '=SUM(A1:A2)');
T.wb.structure(T.sheet, 'r', 1, 1); T.eq(T.sheet.getCell(2, 0).f, 'A1+1', 'insert row shifts formula'); T.eq(T.sheet.getCell(3, 0).f, 'SUM(A1:A3)', 'range expands'); T.eq(T.val('A3'), 2, 'value after insert');
T.wb.undo(); T.eq(T.sheet.getCell(1, 0).f, 'A1+1', 'undo insert'); T.eq(T.sheet.getCell(2, 0).f, 'SUM(A1:A2)', 'undo insert 2');
T.wb.structure(T.sheet, 'r', 0, -1); T.eq(T.val('A1'), '#REF!', 'delete referenced row -> #REF!'); T.wb.undo(); T.eq(T.val('A2'), 2, 'undo delete');
T.wb.undo(); T.eq(T.val('A3'), '', 'undo formula set');
// JSON round trip
T.set('A1', 'hello'); T.set('B1', '=A1&"!"'); const j = JSON.parse(JSON.stringify(T.wb.toJSON())); const w2 = ZN.Workbook.fromJSON(j); T.eq(w2.sheets[0].getValue(0, 1), 'hello!', 'json roundtrip');
// incremental recalculation performance (10k chain)
{ const w = ZN.newWorkbook(), s = w.sheets[0]; w.tx('b', () => { for (let i = 0; i < 10000; i++) w.setInput(s, i, 0, i ? '=A' + i + '+1' : '1'); }); T.eq(s.getValue(9999, 0), 10000, 'chain'); const t = performance.now(); w.setInput(s, 5000, 0, '=1'); const ms = performance.now() - t; T.ok(w.lastCalc.n < 5100, 'incremental touches only the dependent half ' + w.lastCalc.n); T.ok(ms < 200, 'chain edit fast ' + ms); T.eq(s.getValue(9999, 0), 5000, 'chain value'); }
T.done('core');
