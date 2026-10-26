const T = require('./_h'); const { ZN } = T;
T.fill = (a, rows) => { const p = ZN.parseA1(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v !== null && v !== undefined) T.wb.setValue(T.sheet, p.r + i, p.c + j, v); })); };
T.fill('A1', [['Region', 'Sales'], ['East', 100], ['West', 200], ['east', 50], ['North', 25], ['West', 75], ['', 10]]);
T.f('=COUNTIF(A2:A7,"East")', 2); T.f('=COUNTIF(A2:A7,"e*")', 2); T.f('=COUNTIF(A2:A7,"?est")', 2); T.f('=COUNTIF(B2:B7,">50")', 3); T.f('=COUNTIF(B2:B7,"<=50")', 3); T.f('=COUNTIF(B2:B7,"<>100")', 5); T.f('=COUNTIF(B2:B7,100)', 1);
T.f('=COUNTIF(A2:A7,"")', 1); T.f('=COUNTIF(A:A,"West")', 2); T.f('=COUNTIF(A2:A7,"<>East")', 4); T.f('=COUNTIF(B2:B7,">=25")', 5);
T.f('=SUMIF(A2:A7,"West",B2:B7)', 275); T.f('=SUMIF(A2:A7,"east",B2:B7)', 150); T.f('=SUMIF(B2:B7,">60")', 375); T.f('=SUMIF(A2:A7,"West",B3:B8)', 60); T.f('=SUMIF(A:A,"West",B:B)', 275); T.f('=SUMIF(A2:A7,"x",B2:B7)', 0);
T.f('=AVERAGEIF(A2:A7,"West",B2:B7)', 137.5); T.f('=AVERAGEIF(B2:B7,">50")', 125); T.f('=AVERAGEIF(A2:A7,"zzz",B2:B7)', '#DIV/0!');
T.fill('D1', [['East', 'x'], ['West', 'y'], ['North', 'x']]);
T.f('=COUNTIFS(A2:A7,"West",B2:B7,">100")', 1); T.f('=COUNTIFS(A2:A7,"West",B2:B7,">1")', 2); T.f('=COUNTIFS(A2:A7,"West",B2:B6,">1")', '#VALUE!'); T.f('=COUNTIFS(A2:A7,"West",B2:B7)', '#VALUE!');
T.f('=SUMIFS(B2:B7,A2:A7,"West",B2:B7,"<100")', 75); T.f('=SUMIFS(B2:B7,A2:A7,"east")', 150); T.f('=SUMIFS(B2:B7,A2:A7,"east",B2:B7,">60")', 100);
T.f('=AVERAGEIFS(B2:B7,A2:A7,"west")', 137.5); T.f('=MAXIFS(B2:B7,A2:A7,"west")', 200); T.f('=MINIFS(B2:B7,A2:A7,"west")', 75); T.f('=MAXIFS(B2:B7,A2:A7,"none")', 0); T.f('=MINIFS(B2:B7,A2:A7,"east",B2:B7,">60")', 100);
T.f('=COUNTIF(A2:A7,D1:D3)', [[2], [2], [1]]); T.f('=SUMIF(A2:A7,D1:D3,B2:B7)', [[150], [275], [25]]); T.f('=COUNTIFS(A2:A7,D1:D3,B2:B7,">60")', [[1], [2], [0]]);
T.f('=COUNTIF(A2:A7,"~*")', 0); T.fill('F1', [['a*b'], ['axb']]); T.f('=COUNTIF(F1:F2,"a~*b")', 1); T.f('=COUNTIF(F1:F2,"a*b")', 2);
T.f('=COUNTBLANK(A2:B7)', 1); T.f('=COUNTBLANK(A1:B8)', 3);
T.setRaw('H1', '#N/A'); T.wb.setValue(T.sheet, 0, 7, ZN.E.NA); T.f('=COUNTIF(H1,#N/A)', 1); T.f('=SUMIF(A2:A7,"East",H1:H6)', '#N/A');
// 100k performance
{ const s = T.sheet; T.wb.tx && 0; for (let i = 0; i < 100000; i++) { T.wb.setValue(s, i, 10, i % 2 ? 'odd' : 'even'); T.wb.setValue(s, i, 11, i); } const t = performance.now();
  T.f('=COUNTIFS(K:K,"odd",L:L,">=50000")', 25000); T.f('=SUMIFS(L:L,K:K,"even")', 2499950000); T.ok(performance.now() - t < 1500, 'countifs 100k fast ' + (performance.now() - t)); }
// SUBTOTAL / AGGREGATE
T.fill('N1', [[1], [2], [3], [4], [5]]); T.set('N6', '=SUBTOTAL(9,N1:N5)'); T.setRaw('N7', 10);
T.f('=SUBTOTAL(9,N1:N7)', 25); T.f('=SUBTOTAL(1,N1:N7)', 25 / 6); T.f('=SUBTOTAL(2,N1:N7)', 6); T.f('=SUBTOTAL(3,N1:N7)', 6); T.f('=SUBTOTAL(4,N1:N7)', 10); T.f('=SUBTOTAL(5,N1:N7)', 1); T.f('=SUBTOTAL(6,N1:N5)', 120);
T.f('=SUBTOTAL(7,N1:N5)', Math.sqrt(2.5)); T.f('=SUBTOTAL(8,N1:N5)', Math.sqrt(2)); T.f('=SUBTOTAL(10,N1:N5)', 2.5); T.f('=SUBTOTAL(11,N1:N5)', 2); T.f('=SUBTOTAL(12,N1:N5)', '#VALUE!'); T.f('=SUBTOTAL(9,N1:N5,N7)', 25);
T.sheet.hiddenRows[1] = 1; T.sheet.hiddenRows[4] = 1;
T.f('=SUBTOTAL(9,N1:N5)', 15); T.f('=SUBTOTAL(109,N1:N5)', 8); T.f('=SUBTOTAL(102,N1:N5)', 3); T.f('=SUBTOTAL(104,N1:N5)', 4); T.f('=SUBTOTAL(101,N1:N5)', 8 / 3);
delete T.sheet.hiddenRows[1]; delete T.sheet.hiddenRows[4];
T.f('=AGGREGATE(9,6,{1,2,3})', 6); T.f('=AGGREGATE(14,6,{5,1,#N/A,9,3},2)', 5); T.f('=AGGREGATE(15,6,{5,1,#N/A,9,3},1)', 1); T.f('=AGGREGATE(14,0,{5,1,9},4)', '#NUM!'); T.f('=AGGREGATE(9,4,{1,#N/A})', '#N/A'); T.f('=AGGREGATE(4,6,{1,#N/A,7})', 7);
T.f('=AGGREGATE(12,6,{1,2,10})', 2); T.f('=AGGREGATE(1,6,{1,2,#N/A,3})', 2); T.f('=AGGREGATE(2,6,{1,2,#N/A,3})', 3); T.f('=AGGREGATE(16,6,{1,2,3,4,5},0.5)', 3); T.f('=AGGREGATE(17,6,{1,2,3,4,5},1)', 2); T.f('=AGGREGATE(18,6,{1,2,3,4,5},0.5)', 3); T.f('=AGGREGATE(19,6,{1,2,3,4,5},1)', 1.5); T.f('=AGGREGATE(20,6,{1})', '#VALUE!');
T.f('=AGGREGATE(9,0,N1:N7)', 25); T.sheet.hiddenRows[0] = 1; T.f('=AGGREGATE(9,5,N1:N5)', 14); T.f('=AGGREGATE(9,4,N1:N5)', 15); delete T.sheet.hiddenRows[0];
T.f('=AGGREGATE(14,6,N1:N5/(N1:N5>1),1)', 5); T.f('=AGGREGATE(13,6,{1,2,2,3})', 2);
// database functions (Microsoft sample orchard)
T.fill('P1', [['Tree', 'Height', 'Age', 'Yield', 'Profit'], ['Apple', 18, 20, 14, 105], ['Pear', 12, 12, 10, 96], ['Cherry', 13, 14, 9, 105], ['Apple', 14, 15, 10, 75], ['Pear', 9, 8, 8, 76.8], ['Apple', 8, 9, 6, 45]]);
T.fill('W1', [['Tree'], ['Apple']]); T.fill('Y1', [['Tree', 'Height'], ['Apple', '>10']]); T.fill('AB1', [['Tree'], ['Apple'], ['Pear']]); T.fill('AE1', [['Height', 'Height'], ['>9', '<15']]);
const DB = 'P1:T7';
T.f(`=DSUM(${DB},"Profit",W1:W2)`, 225); T.f(`=DSUM(${DB},5,W1:W2)`, 225); T.f(`=DSUM(${DB},"profit",AB1:AB3)`, 397.8); T.f(`=DCOUNT(${DB},"Age",W1:W2)`, 3); T.f(`=DCOUNT(${DB},,W1:W2)`, 3); T.f(`=DCOUNTA(${DB},"Tree",AB1:AB3)`, 5);
T.f(`=DAVERAGE(${DB},"Yield",W1:W2)`, 10); T.f(`=DMAX(${DB},"Profit",Y1:Z2)`, 105); T.f(`=DMIN(${DB},"Profit",W1:W2)`, 45); T.f(`=DPRODUCT(${DB},"Yield",W1:W2)`, 840);
T.f(`=DSTDEV(${DB},"Yield",W1:W2)`, 4); T.f(`=DSTDEVP(${DB},"Yield",W1:W2)`, Math.sqrt(32 / 3)); T.f(`=DVAR(${DB},"Yield",W1:W2)`, 16); T.f(`=DVARP(${DB},"Yield",W1:W2)`, 32 / 3);
T.f(`=DGET(${DB},"Profit",AB1:AB3)`, '#NUM!'); T.fill('AH1', [['Tree', 'Height'], ['Pear', '<10']]); T.f(`=DGET(${DB},"Profit",AH1:AI2)`, 76.8); T.fill('AK1', [['Tree', 'Height'], ['Cherry', '>100']]); T.f(`=DGET(${DB},"Profit",AK1:AL2)`, '#VALUE!');
T.f(`=DSUM(${DB},"Nope",W1:W2)`, '#VALUE!'); T.f(`=DSUM(${DB},9,W1:W2)`, '#VALUE!'); T.f(`=DCOUNT(${DB},"Height",AE1:AF2)`, 3); T.f(`=DSUM(${DB},"Profit",AH1:AI2)`, 76.8);
T.fill('AN1', [['Tree'], ['=Apple']]); T.f(`=DSUM(${DB},"Profit",AN1:AN2)`, 225); T.fill('AP1', [['Tree'], ['App']]); T.f(`=DSUM(${DB},"Profit",AP1:AP2)`, 225); T.fill('AR1', [['Tree'], ['*e*']]); T.f(`=DCOUNTA(${DB},"Tree",AR1:AR2)`, 6);
T.fill('AT1', [['Tree', 'Height'], ['Apple', 18], ['Pear', 9]]); T.f(`=DSUM(${DB},"Profit",AT1:AU3)`, 181.8); T.f(`=DAVERAGE(${DB},"Profit",AT1:AU3)`, 90.9);
T.done('db');
