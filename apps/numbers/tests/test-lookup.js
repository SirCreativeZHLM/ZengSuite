const T = require('./_h'); const { ZN } = T;
T.fill = (a, rows) => { const p = ZN.parseA1(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v !== null && v !== undefined) T.wb.setValue(T.sheet, p.r + i, p.c + j, v); })); };
T.fill('A1', [['Apple', 10, 'x'], ['Banana', 20, 'y'], ['Cherry', 30, 'z'], ['Date', 40, 'w']]);
T.f('=VLOOKUP("Banana",A1:C4,2,FALSE)', 20); T.f('=VLOOKUP("banana",A1:C4,3,0)', 'y'); T.f('=VLOOKUP("Zed",A1:C4,2,FALSE)', '#N/A');
T.f('=VLOOKUP("Ch*",A1:C4,2,FALSE)', 30); T.f('=VLOOKUP("D?te",A1:C4,2,FALSE)', 40); T.f('=VLOOKUP("Banana",A1:C4,4,FALSE)', '#REF!'); T.f('=VLOOKUP("Banana",A1:C4,0,FALSE)', '#VALUE!');
T.f('=VLOOKUP("Blueberry",A1:C4,2)', 20); T.f('=VLOOKUP("Aardvark",A1:C4,2)', '#N/A'); T.f('=VLOOKUP("Zebra",A1:C4,2)', 40);
T.f('=VLOOKUP({"Apple";"Date"},A1:C4,2,FALSE)', [[10], [40]]);
T.fill('E1', [[1, 2, 3, 4], ['a', 'b', 'c', 'd']]);
T.f('=HLOOKUP(3,E1:H2,2,FALSE)', 'c'); T.f('=HLOOKUP(2.5,E1:H2,2)', 'b'); T.f('=HLOOKUP(0,E1:H2,2)', '#N/A'); T.f('=HLOOKUP(3,E1:H2,3,FALSE)', '#REF!');
T.f('=LOOKUP(3,E1:H1,E2:H2)', 'c'); T.f('=LOOKUP(3.9,E1:H1,E2:H2)', 'c'); T.f('=LOOKUP(0,E1:H1,E2:H2)', '#N/A'); T.f('=LOOKUP(100,E1:H1,E2:H2)', 'd');
T.f('=LOOKUP("Cherry",A1:C4)', 'z'); T.f('=LOOKUP(2,{1,2,3},{"a","b","c"})', 'b');
T.f('=MATCH("Cherry",A1:A4,0)', 3); T.f('=MATCH("cherry",A1:A4,0)', 3); T.f('=MATCH("C*",A1:A4,0)', 3); T.f('=MATCH("Nope",A1:A4,0)', '#N/A');
T.f('=MATCH(25,B1:B4,1)', 2); T.f('=MATCH(5,B1:B4,1)', '#N/A'); T.f('=MATCH(40,B1:B4,1)', 4); T.f('=MATCH(30,B1:B4)', 3);
T.f('=MATCH(25,{40,30,20,10},-1)', 2); T.f('=MATCH(30,{40,30,20,10},-1)', 2); T.f('=MATCH(2,{1,2,3},0)', 2); T.f('=MATCH(TRUE,{1,TRUE,3},0)', 2);
T.f('=MATCH("z",{1,2,3},1)', '#N/A'); T.f('=MATCH("c",{1,2,"a","b"},1)', 4); T.f('=MATCH(5,{1,2,"a","b"},1)', 2); T.f('=MATCH(2,{1,2;3,4},0)', '#N/A');
T.f('=INDEX(A1:C4,2,3)', 'y'); T.f('=INDEX(A1:C4,3,1)', 'Cherry'); T.f('=INDEX(B1:B4,4)', 40); T.f('=INDEX(E1:H1,3)', 3); T.f('=INDEX(A1:C4,5,1)', '#REF!'); T.f('=INDEX(A1:C4,-1,1)', '#VALUE!');
T.f('=INDEX(A1:C4,2,0)', [['Banana', 20, 'y']]); T.f('=INDEX(A1:C4,0,2)', [[10], [20], [30], [40]]); T.f('=INDEX({1,2;3,4},2,1)', 3); T.f('=INDEX({1,2;3,4},2,2,1)', 4); T.f('=INDEX(A1:C4,1,1,2)', '#REF!');
T.f('=INDEX(B1:B4,{1;3})', [[10], [30]]);
T.f('=ROWS(INDEX(A1:A100,5):INDEX(A1:A100,9))', 5); T.f('=INDEX(A:A,3)', 'Cherry');
T.f('=ROWS(A1:C4)', 4); T.f('=COLUMNS(A1:C4)', 3); T.f('=ROWS({1;2;3})', 3); T.f('=COLUMNS({1,2})', 2); T.f('=AREAS(A1:B2)', 1);
// XLOOKUP / XMATCH
T.f('=XLOOKUP("Cherry",A1:A4,B1:B4)', 30); T.f('=XLOOKUP("cherry",A1:A4,B1:B4)', 30); T.f('=XLOOKUP("Fig",A1:A4,B1:B4)', '#N/A'); T.f('=XLOOKUP("Fig",A1:A4,B1:B4,"none")', 'none');
T.f('=XLOOKUP("Banana",A1:A4,B1:C4)', [[20, 'y']]); T.f('=XLOOKUP(2,E1:H1,E2:H2)', 'b'); T.f('=XLOOKUP(2,{1,2,3},{10,20,30})', 20);
T.f('=XLOOKUP(25,B1:B4,A1:A4,"",-1)', 'Banana'); T.f('=XLOOKUP(25,B1:B4,A1:A4,"",1)', 'Cherry'); T.f('=XLOOKUP(5,B1:B4,A1:A4,"",-1)', ''); T.f('=XLOOKUP(20,B1:B4,A1:A4,"",-1)', 'Banana');
T.f('=XLOOKUP("Ch*",A1:A4,B1:B4,"",2)', 30); T.f('=XLOOKUP("Ch*",A1:A4,B1:B4)', '#N/A');
T.f('=XLOOKUP(1,{1,2,1},{"a","b","c"},,0,1)', 'a'); T.f('=XLOOKUP(1,{1,2,1},{"a","b","c"},,0,-1)', 'c');
T.f('=XLOOKUP(30,{10,20,30,40},{1,2,3,4},,0,2)', 3); T.f('=XLOOKUP(30,{40,30,20,10},{1,2,3,4},,0,-2)', 2); T.f('=XLOOKUP(25,{10,20,30,40},{1,2,3,4},0,1,2)', 3);
T.f('=XLOOKUP(2,{1,2,3},{1,2})', '#VALUE!'); T.f('=XLOOKUP({"Apple";"Date"},A1:A4,B1:B4)', [[10], [40]]);
T.f('=XMATCH("Cherry",A1:A4)', 3); T.f('=XMATCH(25,B1:B4,-1)', 2); T.f('=XMATCH(25,B1:B4,1)', 3); T.f('=XMATCH(1,{1,2,1},0,-1)', 3); T.f('=XMATCH("C*",A1:A4,2)', 3); T.f('=XMATCH(9,B1:B4)', '#N/A');
// choose / transpose / address / hyperlink
T.f('=CHOOSECOLS({1,2,3;4,5,6},3,1)', [[3, 1], [6, 4]]); T.f('=CHOOSECOLS({1,2,3;4,5,6},-1)', [[3], [6]]); T.f('=CHOOSECOLS({1,2,3},4)', '#VALUE!');
T.f('=CHOOSEROWS({1,2;3,4;5,6},3,1)', [[5, 6], [1, 2]]); T.f('=CHOOSEROWS({1,2;3,4;5,6},-1)', [[5, 6]]); T.f('=CHOOSEROWS({1,2;3,4},0)', '#VALUE!');
T.f('=TRANSPOSE({1,2,3})', [[1], [2], [3]]); T.f('=TRANSPOSE({1,2;3,4})', [[1, 3], [2, 4]]); T.f('=TRANSPOSE(A1:B2)', [['Apple', 'Banana'], [10, 20]]);
T.f('=ADDRESS(2,3)', '$C$2'); T.f('=ADDRESS(2,3,4)', 'C2'); T.f('=ADDRESS(2,3,2)', 'C$2'); T.f('=ADDRESS(2,3,3)', '$C2'); T.f('=ADDRESS(2,3,1,FALSE)', 'R2C3'); T.f('=ADDRESS(2,3,4,FALSE)', 'R[2]C[3]');
T.f('=ADDRESS(1,1,1,TRUE,"Sheet1")', 'Sheet1!$A$1'); T.f('=ADDRESS(1,1,1,TRUE,"My Sheet")', "'My Sheet'!$A$1"); T.f('=ADDRESS(0,1)', '#VALUE!'); T.f('=ADDRESS(1,27)', '$AA$1'); T.f('=ADDRESS(1,1,5)', '#VALUE!');
T.f('=HYPERLINK("http://x.com","Click")', 'Click'); T.f('=HYPERLINK("http://x.com")', 'http://x.com');
// OFFSET / INDIRECT
T.f('=OFFSET(A1,1,1)', 20); T.f('=OFFSET(A1,2,0,2,2)', [['Cherry', 30], ['Date', 40]]); T.f('=OFFSET(B2,-1,0)', 10); T.f('=OFFSET(A1,-1,0)', '#REF!'); T.f('=OFFSET(A1,0,0,0,1)', '#REF!'); T.f('=ROWS(OFFSET(A1,0,0,3,1))', 3);
T.f('=INDIRECT("B3")', 30); T.f('=INDIRECT("A1:B2")', [['Apple', 10], ['Banana', 20]]); T.setRaw('B2', 7, T.data); T.f('=INDIRECT("Data!B2")', 7); T.f("=INDIRECT(\"'Data'!B2\")", 7); T.f('=INDIRECT("Nosuch!A1")', '#REF!'); T.f('=INDIRECT("")', '#REF!'); T.f('=INDIRECT("R3C2",FALSE)', 30);
T.f('=INDIRECT("B"&2)', 20);
T.wb.names.set('MYVALS', { name: 'MyVals', ref: 'Sheet1!$B$1:$B$2', scope: null }); T.f('=INDIRECT("MyVals")', [[10], [20]]);
// dynamic dependency of OFFSET / INDIRECT
T.set('K1', '=OFFSET(A1,1,1)'); T.eq(T.val('K1'), 20, 'offset cell'); T.setRaw('B2', 99); T.eq(T.val('K1'), 99, 'offset recalcs');
T.set('K2', '=INDIRECT("B3")'); T.setRaw('B3', 77); T.eq(T.val('K2'), 77, 'indirect recalcs');
T.f('=ROWS(TRIMRANGE(A1:A10))', 4);
// performance: 20k VLOOKUPs would be slow; test one binary search on 100k rows
{ const s = T.sheet; for (let i = 0; i < 100000; i++) T.wb.setValue ? T.wb.setValue(s, i, 8, i + 1) : 0; const t = performance.now(); T.f('=MATCH(77777,I1:I100000,1)', 77777); T.ok(performance.now() - t < 500, 'binary match fast'); }
T.done('lookup');
