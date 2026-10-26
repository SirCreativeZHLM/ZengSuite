const T = require('./_h'); const { ZN } = T; const IO = ZN.io; const E = ZN.E;
const canon = (v) => (v instanceof ZN.ZErr ? v.code : Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (g, w, l) => { if (w == null) return T.ok(g == null, l + ' got ' + g); if (w instanceof ZN.ZErr) return T.ok(g instanceof ZN.ZErr && g.code === w.code, l); if (w !== null && typeof w === 'object' && !(w instanceof ZN.ZErr)) { const a = JSON.stringify(canon(g)), b = JSON.stringify(canon(w)); T.ok(a === b, l + ' got ' + a + ' want ' + b); } else T.eq(g, w, l); };
const enc = (s) => new TextEncoder().encode(s);

// ---------- CSV parse ----------
{
  let r = IO.csv.parse('a,b,c\n1,2,3\n');
  eq(r.rows, [['a', 'b', 'c'], ['1', '2', '3']], 'csv basic'); eq(r.delimiter, ',', 'csv comma detected'); eq(r.encoding, 'utf-8', 'csv enc utf8 for string');
  r = IO.csv.parse('a;b;c\r\n1,5;2;3\r\n'); eq(r.delimiter, ';', 'semicolon detected'); eq(r.rows[1], ['1,5', '2', '3'], 'semicolon decimal comma kept');
  r = IO.csv.parse('a\tb\n1\t2\n'); eq(r.delimiter, '\t', 'tab detected');
  r = IO.csv.parse('a|b|c\n1|2|3\n4|5|6'); eq(r.delimiter, '|', 'pipe detected'); eq(r.rows.length, 3, 'no trailing newline');
  r = IO.csv.parse('a,b\n"x,1","he said ""hi"""\n"multi\nline",z\n'); eq(r.rows[1], ['x,1', 'he said "hi"'], 'quotes + escapes'); eq(r.rows[2], ['multi\nline', 'z'], 'multiline field');
  r = IO.csv.parse('a,b\r1,2\r3,4'); eq(r.rows, [['a', 'b'], ['1', '2'], ['3', '4']], 'CR line endings');
  r = IO.csv.parse('a,b,\n,,\n'); eq(r.rows, [['a', 'b', ''], ['', '', '']], 'empty fields and trailing delimiter');
  r = IO.csv.parse('"a;b",c;d,e\n1,2,3\n'); eq(r.delimiter, ',', 'quoted delimiters ignored when sniffing');
  r = IO.csv.parse(enc('﻿name,v\nété,1\n')); eq(r.rows[1][0], 'été', 'utf-8 with BOM'); eq(r.rows[0][0], 'name', 'BOM stripped'); eq(r.encoding, 'utf-8', 'enc utf-8');
  r = IO.csv.parse(new Uint8Array([0x6e, 0x0a, 0xe9, 0x80, 0x0a])); eq(r.encoding, 'windows-1252', 'fallback windows-1252'); eq(r.rows[1][0], 'é€', 'cp1252 decoding incl 0x80 euro');
  const u16 = (s, be) => { const b = new Uint8Array(2 + s.length * 2); b[0] = be ? 0xFE : 0xFF; b[1] = be ? 0xFF : 0xFE; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 + i * 2 + (be ? 1 : 0)] = c & 255; b[3 + i * 2 - (be ? 1 : 0)] = c >> 8; } return b; };
  r = IO.csv.parse(u16('a,b\nü,2\n', false)); eq(r.encoding, 'utf-16le', 'utf-16le BOM'); eq(r.rows[1], ['ü', '2'], 'utf-16le content');
  r = IO.csv.parse(u16('a,b\nü,2\n', true)); eq(r.encoding, 'utf-16be', 'utf-16be BOM'); eq(r.rows[1], ['ü', '2'], 'utf-16be content');
  r = IO.csv.parse('a,b\n1,2', { delimiter: ';' }); eq(r.rows[0], ['a,b'], 'forced delimiter');
}
// perf: 50k x 10
{
  const lines = []; for (let i = 0; i < 50000; i++) { const row = []; for (let j = 0; j < 10; j++) row.push(j % 3 === 0 ? String(i * 7 + j) : j % 3 === 1 ? 'text' + i : (i / 8 + j).toFixed(3)); lines.push(row.join(',')); }
  const big = lines.join('\n'); const buf = enc(big);
  const t = performance.now(); const r = IO.csv.parse(buf); const ms = performance.now() - t;
  eq(r.rows.length, 50000, 'big csv rows'); console.log('csv ms', ms.toFixed(0)); T.ok(ms < 400, 'csv parse 50k x 10 under 400ms: ' + ms.toFixed(0) + 'ms (' + (buf.length / 1e6).toFixed(1) + 'MB)');
}
// ---------- CSV -> workbook / stringify ----------
{
  const wb = IO.csv.toWorkbook('id,amount,flag,note\n007,12.5,TRUE,hello\n12345678901234567890,-3,false,"a,b"\n', { name: 'Imp' });
  const sh = wb.sheets[0]; eq(sh.name, 'Imp', 'sheet name from opts'); eq(sh.getValue(1, 0), '007', 'leading zeros kept as text'); eq(sh.getValue(2, 0), '12345678901234567890', 'long digit string kept as text');
  eq(sh.getValue(1, 1), 12.5, 'number typed'); eq(sh.getValue(1, 2), true, 'boolean typed'); eq(sh.getValue(2, 2), false, 'false typed'); eq(sh.getValue(2, 3), 'a,b', 'quoted text');
  const wb2 = IO.csv.toWorkbook('p,d\n50%,2024-01-02\n'); const s2 = wb2.sheets[0]; eq(s2.getValue(1, 0), 0.5, 'percent typed'); eq(wb2.style(s2.getCell(1, 0).s).nf, '0%', 'percent nf style'); eq(s2.getValue(1, 1), 45293, 'iso date serial');
  const w3 = ZN.newWorkbook(); const s3 = w3.sheets[0]; w3.tx('x', () => { w3.setValue(s3, 0, 0, 'a,b'); w3.setValue(s3, 0, 1, 'q"t'); w3.setValue(s3, 1, 0, 1.5); w3.setValue(s3, 1, 1, true); w3.setValue(s3, 2, 0, E.DIV0); w3.setValue(s3, 2, 1, 'l1\nl2'); });
  eq(IO.csv.stringify(s3), '"a,b","q""t"\r\n1.5,TRUE\r\n#DIV/0!,"l1\nl2"\r\n', 'stringify quoting + errors');
  eq(IO.csv.stringify(s3, { delimiter: ';', range: [1, 0, 1, 1], bom: true }), '﻿1.5;TRUE\r\n', 'stringify range/delimiter/bom');
  w3.tx('f', () => { w3.patchStyle(s3, 1, 0, { nf: '0.00' }); });
  eq(IO.csv.stringify(s3, { range: [1, 0, 1, 0] }), '1.50\r\n', 'stringify formatted'); eq(IO.csv.stringify(s3, { range: [1, 0, 1, 0], formatted: false }), '1.5\r\n', 'stringify raw');
  const rt = IO.csv.parse(IO.csv.stringify(s3)); eq(rt.rows[2][1], 'l1\nl2', 'csv round trip multiline');
}

// ---------- XLSX: rich workbook round trip ----------
function rich() {
  const wb = ZN.newWorkbook(); const s = wb.sheets[0]; s.name = 'Data'; const s2 = wb.addSheetRaw('Hidden & <More>'); s2.hidden = true;
  const bold = wb.internStyle({ b: 1, fc: '#ff0000', bg: '#ffff00', bl: 'thin #000000', br: 'medium #00ff00', bt: 'double #0000ff', bb: 'dashed #111111', ha: 'center', va: 'middle', wr: 1, ind: 2, rot: 45, nf: '#,##0.00', fn: 'Arial', fs: 14, u: 2, k: 1 });
  const dateS = wb.internStyle({ nf: 'yyyy-mm-dd' }); const pct = wb.internStyle({ nf: '0.0%' }); const lock = wb.internStyle({ lock: 0, hid: 1, shr: 1, ha: 'left' });
  s.setRaw(0, 0, { v: 'Name', s: bold }); s.setRaw(0, 1, { v: 'Qty', s: bold }); s.setRaw(0, 2, { v: 'Date', s: bold }); s.setRaw(0, 3, { v: 'Pct' });
  for (let i = 1; i <= 5; i++) { s.setRaw(i, 0, { v: 'Item ' + i }); s.setRaw(i, 1, { v: i * 10 }); s.setRaw(i, 2, { v: 45292 + i, s: dateS }); s.setRaw(i, 3, { v: i / 10, s: pct }); }
  s.setRaw(10, 0, { v: 'merged' }); s.setRaw(6, 0, { v: 'Total' }); s.setRaw(6, 1, { v: undefined, f: 'SUM(B2:B6)' }); s.setRaw(6, 2, { v: undefined, f: 'IFS(B2>10,"hi",TRUE,"lo")&"é"' }); s.setRaw(6, 3, { v: undefined, f: 'B7>100' });
  s.setRaw(7, 0, { v: '  padded & <esc> "q"\nnl' }); s.setRaw(7, 1, { v: true }); s.setRaw(7, 2, { v: E.NA }); s.setRaw(7, 3, { v: 'x', s: lock });
  s.setRaw(8, 0, { v: undefined, f: 'SEQUENCE(2,2)' });
  s2.setRaw(0, 0, { v: undefined, f: 'Data!B7*2' }); s2.setRaw(1, 0, { v: undefined, f: "'Hidden & <More>'!A1+1" });
  s.merges.push([10, 0, 11, 2]); s.freeze = { r: 1, c: 1 }; s.grid = false; s.zoom = 1.25; s.color = '#336699'; s.colW[0] = 140; s.colW[1] = 70; s.colW[2] = 70; s.rowH[1] = 40; s.hiddenCols[5] = 1; s.hiddenRows[3] = 1; s.colS[6] = pct; s.rowS[15] = dateS; s.defColW = 80;
  s.cf = [
    { id: 'a', ranges: [[1, 1, 5, 1]], type: 'cell', op: 'between', v1: 20, v2: 40, priority: 1, style: { bg: '#ffc7ce', fc: '#9c0006', b: 1 } },
    { id: 'b', ranges: [[1, 0, 5, 0]], type: 'text', textOp: 'begins', text: 'It', priority: 2, style: { i: 1 } },
    { id: 'c', ranges: [[1, 1, 5, 1]], type: 'colorScale', priority: 3, stops: [{ type: 'min', color: '#ff0000' }, { type: 'percentile', v: 50, color: '#ffff00' }, { type: 'max', color: '#00ff00' }] },
    { id: 'd', ranges: [[1, 3, 5, 3]], type: 'dataBar', priority: 4, color: '#638ec6', min: { type: 'min' }, max: { type: 'max' }, gradient: true, showValue: false },
    { id: 'e', ranges: [[1, 1, 5, 1]], type: 'iconSet', priority: 5, name: '3Arrows', thresholds: [{ type: 'percent', v: 33, gte: true }, { type: 'percent', v: 67, gte: true }], reverse: true, showValue: true },
    { id: 'f', ranges: [[1, 1, 5, 1]], type: 'top', n: 2, bottom: true, priority: 6, style: { bg: '#cccccc' } },
    { id: 'g', ranges: [[1, 1, 5, 1]], type: 'formula', formula: 'MOD(B2,20)=0', priority: 7, style: { k: 1 }, stop: true },
    { id: 'h', ranges: [[1, 0, 5, 0]], type: 'dupes', unique: true, priority: 8, style: { u: 1 } },
    { id: 'i', ranges: [[1, 1, 5, 1]], type: 'avg', above: false, equal: true, priority: 9, style: { fc: '#0000ff' } },
    { id: 'j', ranges: [[1, 2, 5, 2]], type: 'date', when: 'last7', priority: 10, style: { bg: '#eeeeee' } },
    { id: 'k', ranges: [[1, 1, 5, 1]], type: 'blanks', priority: 11, style: { bg: '#123456' } },
    { id: 'l', ranges: [[1, 1, 5, 1], [8, 8, 9, 9]], type: 'cell', op: 'eq', v1: 'abc', priority: 12, style: { b: 1 } },
  ];
  s.dv = [
    { id: 'v1', ranges: [[1, 1, 5, 1]], type: 'whole', op: 'between', v1: 0, v2: 100, allowBlank: true, errStyle: 'warning', errTitle: 'Oops', errMsg: 'Between 0-100', promptTitle: 'Qty', prompt: 'Enter qty', showPrompt: true, showError: true, dropdown: true },
    { id: 'v2', ranges: [[1, 4, 5, 4]], type: 'list', list: ['a', 'b', 'c d'], allowBlank: false, dropdown: true, errStyle: 'stop', showPrompt: false, showError: true },
    { id: 'v3', ranges: [[1, 5, 5, 5]], type: 'list', source: '=$A$2:$A$6', allowBlank: true, dropdown: false, errStyle: 'stop', showPrompt: false, showError: true },
    { id: 'v4', ranges: [[1, 6, 5, 6]], type: 'custom', formula: 'ISNUMBER(G2)', allowBlank: true, dropdown: true, errStyle: 'information', showPrompt: false, showError: true },
    { id: 'v5', ranges: [[1, 7, 5, 7]], type: 'decimal', op: 'gt', v1: 1.5, allowBlank: true, dropdown: true, errStyle: 'stop', showPrompt: false, showError: true },
  ];
  s.tables = [{ name: 'Sales', r1: 0, c1: 0, r2: 6, c2: 3, header: true, total: true, cols: ['Name', 'Qty', 'Date', 'Pct'], style: 'medium9', banded: true, bandedCols: false, firstCol: true, lastCol: false, filter: true, totals: { Qty: 'sum' } }];
  s.charts = [{ id: 'c1', type: 'combo', grouping: 'clustered', x: 300, y: 60, w: 400, h: 250, title: 'Qty <&> trend', legend: 'bottom', xTitle: 'Items', yTitle: 'Units', y2Title: 'Pct', cats: 'Data!$A$2:$A$6', series: [{ name: 'Data!$B$1', ref: 'Data!$B$2:$B$6', color: '#4472c4' }, { name: 'Percent', ref: 'Data!$D$2:$D$6', type: 'line', axis: 'secondary', marker: true }], gridlines: true }];
  wb.names.set(wb.nameKey('Rate', null), { name: 'Rate', ref: 'Data!$B$2', scope: null }); wb.names.set(wb.nameKey('Local', s2), { name: 'Local', ref: "'Hidden & <More>'!$A$1:$A$2", scope: s2.id });
  wb.active = 0; wb.finish(); return wb;
}
const wbR = rich(); const x1 = IO.xlsx.write(wbR); T.ok(x1 instanceof Uint8Array && x1[0] === 0x50 && x1[1] === 0x4B, 'xlsx output is a zip');
const parts = fflate.unzipSync(x1); const pn = Object.keys(parts);
T.ok(pn[0] === '[Content_Types].xml', '[Content_Types].xml first'); for (const f of ['_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/tables/table1.xml', 'xl/charts/chart1.xml', 'xl/drawings/drawing1.xml']) T.ok(!!parts[f], 'part ' + f);
{
  // well-formed XML through our own strict tree parser
  let bad = null; for (const n of pn) if (/\.(xml|rels)$/.test(n)) { try { IO.xlsx._x.parseXml(new TextDecoder().decode(parts[n])); } catch (e) { bad = n + ': ' + e.message; } } eq(bad, null, 'all parts well-formed');
  const sx = new TextDecoder().decode(parts['xl/worksheets/sheet1.xml']); const order = ['<sheetPr', '<dimension', '<sheetViews', '<sheetFormatPr', '<cols', '<sheetData', '<mergeCells', '<conditionalFormatting', '<dataValidations', '<pageMargins', '<drawing', '<tableParts'];
  const idx = order.map((t) => sx.indexOf(t)); T.ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), 'worksheet element order ' + idx.join(','));
  T.ok(/fullCalcOnLoad="1"/.test(new TextDecoder().decode(parts['xl/workbook.xml'])), 'fullCalcOnLoad'); T.ok(/<f t="array" ref="A9:B10">_xlfn\.SEQUENCE\(2,2\)<\/f>/.test(sx), 'dynamic array anchor written as t=array with _xlfn prefix'); T.ok(/_xlfn\.IFS\(/.test(sx), 'IFS prefixed');
  T.ok(/t="e"><v>#N\/A<\/v>/.test(sx), 'error cell type'); T.ok(/xml:space="preserve"/.test(new TextDecoder().decode(parts['xl/sharedStrings.xml'])), 'preserve whitespace in sst');
}
const rt = IO.xlsx.read(x1); const a = wbR.sheets[0], b = rt.sheets[0];
eq(rt.sheets.map((x) => x.name), ['Data', 'Hidden & <More>'], 'sheet names'); eq(rt.sheets[1].hidden, true, 'hidden sheet state'); eq(rt.active, 0, 'active sheet');
{
  let diffs = []; let n = 0;
  a.eachCellObj((c, r, cc) => { if (c.sp !== undefined) { /* spilled */ } n++; const d = b.getCell(r, cc); const dv = d ? d.v : undefined; const same = (x, y) => (x instanceof ZN.ZErr ? y instanceof ZN.ZErr && x.code === y.code : x === y);
    if (c.v !== undefined && !same(c.v, dv)) diffs.push('v@' + ZN.addr(r, cc) + ' ' + String(c.v) + ' vs ' + String(dv)); if ((c.f || undefined) !== (d && d.f || undefined)) diffs.push('f@' + ZN.addr(r, cc) + ' ' + c.f + ' vs ' + (d && d.f));
    const sa = JSON.stringify(a.wb.style(c.s || 0)), sb = JSON.stringify(rt.style(d && d.s || 0)); if (sa !== sb) diffs.push('s@' + ZN.addr(r, cc) + ' ' + sa + ' vs ' + sb); });
  eq(diffs, [], 'cell-by-cell values, formulas and styles preserved (' + n + ' cells)');
}
eq(b.getValue(6, 1), 150, 'formula recalculated after read'); eq(b.getValue(8, 1), 2, 'dynamic array re-spilled'); eq(rt.sheets[1].getValue(0, 0), 300, 'cross-sheet formula'); eq(rt.sheets[1].getValue(1, 0), 301, 'quoted sheet name formula');
eq(b.merges, [[10, 0, 11, 2]], 'merges'); eq(b.freeze, { r: 1, c: 1 }, 'freeze'); eq(b.grid, false, 'gridlines off'); eq(b.zoom, 1.25, 'zoom'); eq(b.color, '#336699', 'tab color');
eq([b.colW[0], b.colW[1], b.colW[2]], [140, 70, 70], 'column widths'); eq(b.rowH[1], 40, 'row height'); eq(b.hiddenCols[5], 1, 'hidden col'); eq(b.hiddenRows[3], 1, 'hidden row'); eq(b.defColW, 80, 'default col width');
eq(rt.style(b.colS[6]).nf, '0.0%', 'column style'); eq(rt.style(b.rowS[15]).nf, 'yyyy-mm-dd', 'row style');
eq(b.cf.length, a.cf.length, 'cf count'); {
  const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.id; return o; }; const A = a.cf.map(strip), B = b.cf.map(strip);
  for (let i = 0; i < A.length; i++) eq(B[i], A[i], 'cf rule ' + a.cf[i].id + ' (' + a.cf[i].type + ')');
}
eq(b.dv.length, 5, 'dv count'); { const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.id; return o; }; a.dv.forEach((d, i) => eq(strip(b.dv[i]), strip(d), 'dv ' + d.type + ' #' + i)); }
eq(JSON.stringify(b.tables), JSON.stringify(a.tables), 'tables round trip');
eq([...rt.names.values()].map((n) => n.name).sort(), ['Local', 'Rate'], 'defined names'); eq(rt.names.get(rt.nameKey('Local', rt.sheets[1])).ref, "'Hidden & <More>'!$A$1:$A$2", 'sheet-scoped name'); eq(rt.names.get(rt.nameKey('Rate', null)).scope, null, 'global name scope');
// re-write of re-read file is stable
{ const x2 = IO.xlsx.write(rt); const w3 = IO.xlsx.read(x2); eq(JSON.stringify(w3.sheets[0].cf.map((r) => r.type)), JSON.stringify(a.cf.map((r) => r.type)), 'second generation cf stable'); eq(w3.sheets[0].getValue(6, 1), 150, 'second generation values'); }

// ---------- XLSX: hand-written third-party style fixture ----------
{
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'; const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const files = {
    '[Content_Types].xml': X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels': X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': X + '<workbook ' + NS + '><workbookPr date1904="1"/><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="Calc" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="5" state="veryHidden" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Calc!$A$1:$C$3</definedName><definedName name="Tax">Calc!$A$3</definedName><definedName name="Loc" localSheetId="1">Second!$A$1</definedName></definedNames></workbook>',
    'xl/_rels/workbook.xml.rels': X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
    'xl/theme/theme1.xml': X + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="t"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>',
    'xl/styles.xml': X + '<styleSheet ' + NS + '><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000&quot; kg&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><i/><u/><sz val="12"/><color theme="4"/><name val="Arial"/></font><font><sz val="11"/><color indexed="10"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.7999816888943144"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="13"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF00FF00"/></left><right/><top style="thick"><color auto="1"/></top><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" indent="1" textRotation="135" shrinkToFit="1"/><protection locked="0"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/><xf numFmtId="9" fontId="2" fillId="3" borderId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="37" fontId="0" fillId="0" borderId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0"/></cellXfs><dxfs count="2"><dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf><dxf><font><i/></font></dxf></dxfs></styleSheet>',
    'xl/sharedStrings.xml': X + '<sst ' + NS + ' count="4" uniqueCount="4"><si><t>Plain</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">Rich </t></r><r><t>text &amp; more</t></r></si><si><t>Tomé</t><rPh sb="0" eb="1"><t>PHONETIC</t></rPh></si><si><t>_x000D_line</t></si></sst>',
    'xl/worksheets/sheet1.xml': X + '<worksheet ' + NS + '><sheetPr><tabColor theme="5"/></sheetPr><dimension ref="A1:D6"/><sheetViews><sheetView showGridLines="0" zoomScale="150" workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="10.5" defaultRowHeight="18"/><cols><col min="1" max="2" width="9.140625" customWidth="1" style="2"/><col min="4" max="4" width="20" hidden="1" customWidth="1"/></cols><sheetData>' +
      '<row r="1" ht="30" customHeight="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s" s="1"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
      '<row r="2" hidden="1" s="3" customFormat="1"><c r="A2"><v>10</v></c><c r="B2" s="2"><v>100</v></c><c r="C2"><f t="shared" ref="C2:C4" si="0">A2*2+$D$4</f><v>20</v></c><c r="D2"><f>_xlfn.CONCAT("a","b")</f><v>ab</v></c></row>' +
      '<row r="3"><c r="A3"><v>20</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><f t="shared" si="0"/><v>40</v></c><c r="D3" t="e"><v>#DIV/0!</v></c></row>' +
      '<row r="4"><c r="A4"><v>30</v></c><c r="B4" t="inlineStr"><is><t>inline</t></is></c><c r="C4"><f t="shared" si="0"/><v>60</v></c><c r="D4" s="5"><v>1234</v></c></row>' +
      '<row r="5"><c r="A5" t="str"><f>"x"&amp;"y"</f><v>xy</v></c><c r="B5"><f t="array" ref="B5:C6">{1,2;3,4}*2</f><v>2</v></c><c r="C5"><v>4</v></c></row>' +
      '<row r="6"><c r="B6"><v>6</v></c><c r="C6"><v>8</v></c><c r="D6" t="d"><v>2024-01-02</v></c></row></sheetData>' +
      '<mergeCells count="1"><mergeCell ref="A6:A7"/></mergeCells>' +
      '<conditionalFormatting sqref="A2:A4 C2:C4"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>15</formula></cfRule><cfRule type="expression" dxfId="1" priority="2" stopIfTrue="1"><formula>_xlfn.ISFORMULA(A2)</formula></cfRule><cfRule type="containsText" dxfId="1" priority="3" operator="containsText" text="a"><formula>NOT(ISERROR(SEARCH("a",A2)))</formula></cfRule></conditionalFormatting>' +
      '<conditionalFormatting sqref="A2:A4"><cfRule type="colorScale" priority="4"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFF8696B"/><color theme="4"/></colorScale></cfRule><cfRule type="iconSet" priority="5"><iconSet iconSet="3TrafficLights2"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule><cfRule type="unknownFuture" priority="6"/></conditionalFormatting>' +
      '<dataValidations count="2"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="A2"><formula1>"yes,no,maybe"</formula1></dataValidation><dataValidation type="date" operator="greaterThan" showErrorMessage="1" sqref="D2"><formula1>45000</formula1></dataValidation></dataValidations>' +
      '<hyperlinks><hyperlink ref="A1" r:id="rId9"/></hyperlinks><drawing r:id="rId8"/><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>',
    'xl/worksheets/_rels/sheet1.xml.rels': X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>',
    'xl/tables/table1.xml': X + '<table ' + NS + ' id="1" name="T1" displayName="T1" ref="A1:C4" totalsRowShown="0"><autoFilter ref="A1:C4"/><tableColumns count="3"><tableColumn id="1" name="Plain"/><tableColumn id="2" name="Rich &amp; x"/><tableColumn id="3" name="Tomé"/></tableColumns><tableStyleInfo name="TableStyleLight9" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>',
    'xl/worksheets/sheet2.xml': X + '<worksheet ' + NS + '><sheetData><row r="1"><c r="A1"><f>Calc!C3+Tax</f><v>0</v></c></row></sheetData></worksheet>',
    'xl/drawings/drawing1.xml': X + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>',
  };
  const buf = fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc(v)])));
  const wb = IO.xlsx.read(buf); const s = wb.sheets[0];
  eq(wb.sheets.map((x) => x.name), ['Calc', 'Second'], 'fixture sheet names'); eq(wb.sheets[1].hidden, 'very', 'veryHidden'); eq(wb.active, 1, 'activeTab');
  eq(s.getValue(0, 1), 'Rich text & more', 'rich text flattened'); eq(s.getValue(0, 2), 'Tomé', 'phonetic runs dropped'); eq(s.getValue(0, 3), '\rline', '_x000D_ escape decoded');
  eq(s.getCell(2, 2).f, 'A3*2+$D$4', 'shared formula translated (row 3)'); eq(s.getCell(3, 2).f, 'A4*2+$D$4', 'shared formula translated (row 4)'); eq(s.getCell(1, 2).f, 'A2*2+$D$4', 'shared master');
  eq(s.getValue(3, 2), 1294, 'shared formula value recalculated'); eq(s.getCell(1, 3).f, 'CONCAT("a","b")', '_xlfn prefix stripped'); eq(s.getValue(1, 3), 'ab', 'CONCAT works');
  eq(s.getValue(2, 3), E.DIV0, 'error cell'); eq(s.getValue(2, 1), true, 'boolean cell'); eq(s.getValue(3, 1), 'inline', 'inlineStr'); eq(s.getValue(4, 0), 'xy', 'str formula'); eq(s.getValue(5, 3), 45293, 't=d ISO date');
  eq(s.getCell(4, 1).f, '{1,2;3,4}*2', 'array formula kept'); eq(s.getValue(5, 2), 8, 'array formula spilled on recalc (interior)');
  eq(wb.style(s.getCell(0, 1).s), { nf: '0.000" kg"', fn: 'Arial', fs: 12, b: 1, i: 1, u: 1, fc: '#4f81bd', bg: '#dce6f2', bl: 'thin #00ff00', bt: 'thick #000000', ha: 'center', va: 'middle', wr: 1, ind: 1, rot: -45, shr: 1, lock: 0 }, 'xf resolved: font/theme/tint/border/alignment/protection');
  eq(wb.style(s.getCell(1, 1).s).nf, 'm/d/yyyy', 'builtin id 14'); eq(s.getValue(1, 1), 100 + 1462, 'date1904 conversion for date-formatted cells'); eq(s.getValue(1, 0), 10, 'non-date numbers not shifted');
  eq(wb.style(s.rowS[1]).bg, '#ffff00', 'row style with indexed colour'); eq(wb.style(s.rowS[1]).fc, '#ff0000', 'indexed font colour');
  eq(wb.style(s.getCell(3, 3).s).nf, '#,##0 ;(#,##0)', 'builtin id 37 nf'); eq(s.color, '#c0504d', 'tab colour from theme');
  eq(s.freeze, { r: 1, c: 2 }, 'fixture freeze'); eq(s.grid, false, 'fixture grid'); eq(s.zoom, 1.5, 'fixture zoom'); eq(s.defColW, 73, 'defaultColWidth px'); eq(s.defRowH, 24, 'defaultRowHeight px');
  eq(s.rowH[0], 40, 'row ht px'); eq(s.hiddenRows[1], 1, 'hidden row'); eq(s.hiddenCols[3], 1, 'hidden col'); eq(s.colW[3], 140, 'col width 20 -> px'); eq(s.colW[0], 64, 'col width 9.14 -> 64px'); eq(wb.style(s.colS[0]).nf, 'm/d/yyyy', 'col style');
  eq(s.merges, [[5, 0, 6, 0]], 'fixture merge');
  eq(s.cf.length, 5, 'fixture cf rules (unknown skipped)'); eq(s.cf[0].ranges, [[1, 0, 3, 0], [1, 2, 3, 2]], 'cf multi-range'); eq(s.cf[0].style, { fc: '#9c0006', b: 1, bg: '#ffc7ce' }, 'dxf style'); eq([s.cf[0].op, s.cf[0].v1], ['gt', 15], 'cellIs');
  eq(s.cf[1].formula, 'ISFORMULA(A2)', 'expression formula'); eq(s.cf[1].stop, true, 'stopIfTrue'); eq(s.cf[2].textOp, 'contains', 'containsText'); eq(s.cf[3].stops.map((x) => x.type + x.color), ['min#f8696b', 'max#4f81bd'], 'colorScale'); eq(s.cf[4].name, '3TrafficLights', 'iconSet name mapped'); eq(s.cf[4].thresholds.length, 2, 'iconSet thresholds');
  eq(s.dv[0].list, ['yes', 'no', 'maybe'], 'dv inline list'); eq(s.dv[1].type, 'date', 'dv date'); eq([s.dv[1].op, s.dv[1].v1], ['gt', 45000], 'dv date op');
  eq(s.tables.length, 1, 'fixture table'); eq([s.tables[0].name, s.tables[0].r1, s.tables[0].c2, s.tables[0].style, s.tables[0].banded], ['T1', 0, 2, 'light9', true], 'table props'); eq(s.tables[0].cols, ['Plain', 'Rich & x', 'Tomé'], 'table cols');
  eq(wb.names.size, 2, 'names: Print_Area ignored'); eq(wb.names.get(wb.nameKey('Loc', wb.sheets[1])).scope, wb.sheets[1].id, 'localSheetId scope'); eq(wb.sheets[1].getValue(0, 0), 1294, 'cross-sheet fixture formula using defined name resolved');
}
// corrupt input
{
  let m1 = ''; try { IO.xlsx.read(enc('this is not a zip')); } catch (e) { m1 = e.message; } T.ok(/not a valid \.xlsx/.test(m1), 'corrupt zip -> readable error: ' + m1);
  let m2 = ''; try { IO.xlsx.read(fflate.zipSync({ 'x.txt': enc('hi') })); } catch (e) { m2 = e.message; } T.ok(/workbook\.xml is missing/.test(m2), 'zip without workbook -> error');
  let m3 = ''; try { IO.xlsx.read(fflate.zipSync({ 'xl/workbook.xml': enc('<workbook><sheets><sheet name="A" r:id="rId1"') })); } catch (e) { m3 = e.message; } T.ok(/Corrupt workbook\.xml/.test(m3), 'bad xml -> error: ' + m3);
}
// ---------- XLSX perf ----------
{
  const X = '<?xml version="1.0"?>\n'; const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'; const N = 50000; const rows = [];
  for (let i = 1; i <= N; i++) { let c = ''; for (let j = 0; j < 10; j++) { const ref = 'ABCDEFGHIJ'[j] + i; if (j % 3 === 0) c += '<c r="' + ref + '" s="1"><v>' + (i * 3 + j) + '.5</v></c>'; else if (j % 3 === 1) c += '<c r="' + ref + '" t="s"><v>' + (i % 500) + '</v></c>'; else if (j === 8 && i % 10000 === 0) c += '<c r="' + ref + '"><f>SUM(A' + i + ':A' + i + ')</f><v>1</v></c>'; else c += '<c r="' + ref + '"><v>' + (i + j) + '</v></c>'; } rows.push('<row r="' + i + '">' + c + '</row>'); }
  const sst = []; for (let i = 0; i < 500; i++) sst.push('<si><t>string ' + i + '</t></si>');
  const buf = fflate.zipSync({ 'xl/workbook.xml': enc(X + '<workbook ' + NS + '><sheets><sheet name="Big" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': enc(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/sharedStrings.xml': enc(X + '<sst ' + NS + '>' + sst.join('') + '</sst>'), 'xl/styles.xml': enc(X + '<styleSheet ' + NS + '><fonts count="1"><font><sz val="11"/></font></fonts><fills count="2"><fill/><fill/></fills><borders count="1"><border/></borders><cellXfs count="2"><xf/><xf numFmtId="2"/></cellXfs></styleSheet>'), 'xl/worksheets/sheet1.xml': enc(X + '<worksheet ' + NS + '><sheetData>' + rows.join('') + '</sheetData></worksheet>') });
  const t = performance.now(); const wb = IO.xlsx.read(buf); const ms = performance.now() - t;
  eq(wb.sheets[0].maxRow(), N - 1, 'perf: rows imported'); eq(wb.sheets[0].getValue(N - 1, 0), N * 3 + 0.5, 'perf: last cell'); eq(wb.sheets[0].getValue(9999, 8), 3 * 10000 + 8 + 0.5 - 8 + 0, 'perf: formula value'); console.log('xlsx import ms', ms.toFixed(0)); T.ok(ms < 2000, 'xlsx import 50k x 10 under 2000ms: ' + ms.toFixed(0) + 'ms');
  const t2 = performance.now(); const out = IO.xlsx.write(wb); const ms2 = performance.now() - t2; T.ok(out.length > 1000, 'perf: write works'); T.ok(ms2 < 4000, 'xlsx write 50k x 10 under 4000ms: ' + ms2.toFixed(0) + 'ms');
}

// ---------- .znumbers ----------
{
  const z = IO.znumbers.write(wbR, { thumbnail: new Uint8Array([137, 80, 78, 71]) }); const f = fflate.unzipSync(z); const names = Object.keys(f);
  eq(names[0], 'mimetype', 'mimetype first'); eq(new TextDecoder().decode(f.mimetype), 'application/vnd.zengbot.numbers+zip', 'mimetype content'); T.ok(!!f['README.txt'] && !!f['workbook.json'] && !!f['thumbnail.png'], 'znumbers parts');
  eq(JSON.parse(new TextDecoder().decode(f['meta.json'])).format, 'znumbers', 'meta format');
  const w = IO.znumbers.read(z); const s = w.sheets[0]; const o = wbR.sheets[0];
  eq(JSON.stringify(s.cf), JSON.stringify(o.cf), 'znumbers cf'); eq(JSON.stringify(s.dv), JSON.stringify(o.dv), 'znumbers dv'); eq(JSON.stringify(s.charts), JSON.stringify(o.charts), 'znumbers charts'); eq(JSON.stringify(s.tables), JSON.stringify(o.tables), 'znumbers tables');
  eq([s.merges, s.freeze, s.colW, s.rowH, s.defColW], [o.merges, o.freeze, o.colW, o.rowH, o.defColW], 'znumbers dims/merges/freeze'); eq(JSON.stringify(w.styles), JSON.stringify(wbR.styles), 'znumbers styles'); eq(w.names.size, 2, 'znumbers names'); eq(s.getValue(6, 1), 150, 'znumbers formulas recalculated');
  let m = ''; try { IO.znumbers.read(fflate.zipSync({ mimetype: enc('x/y'), 'workbook.json': enc('{}') })); } catch (e) { m = e.message; } T.ok(/Unexpected file type/.test(m), 'znumbers wrong mimetype error');
  m = ''; try { IO.znumbers.read(fflate.zipSync({ 'meta.json': enc('{"format":"znumbers","version":9}'), 'workbook.json': enc('{}') })); } catch (e) { m = e.message; } T.ok(/newer version/.test(m), 'znumbers future version error');
  m = ''; try { IO.znumbers.read(enc('garbage')); } catch (e) { m = e.message; } T.ok(/not a valid \.znumbers/.test(m), 'znumbers non-zip error');
  eq(IO.open(z, 'a.znumbers').sheets.length, 2, 'open() dispatches znumbers'); eq(IO.open(x1, 'a.xlsx').sheets.length, 2, 'open() dispatches xlsx'); eq(IO.open(enc('a,b\n1,2'), 'data.csv').sheets[0].name, 'data', 'open() csv named from file');
}
// ---------- HTML / JSON export ----------
{
  const h = IO.html.write(wbR); T.ok(/<table/.test(h) && /colspan="3"/.test(h) && /rowspan="2"/.test(h), 'html merges as colspan/rowspan'); T.ok(/&lt;esc&gt;/.test(h) && /Hidden &amp; &lt;More&gt;/.test(h), 'html escaping'); T.ok(/font-weight:700/.test(h) && /background:#ffff00/.test(h) && /border-left:1px solid #000000/.test(h), 'html inline styles');
  const w = ZN.newWorkbook(); const s = w.sheets[0]; w.tx('x', () => { w.setValue(s, 0, 0, 'name'); w.setValue(s, 0, 1, 'age'); w.setValue(s, 0, 2, 'name'); w.setValue(s, 1, 0, 'Ann'); w.setValue(s, 1, 1, 30); w.setValue(s, 2, 0, 'Bo'); w.setValue(s, 2, 1, E.NA); });
  eq(JSON.parse(IO.json.write(w, { mode: 'records' })), [{ name: 'Ann', age: 30, name_2: null }, { name: 'Bo', age: '#N/A', name_2: null }], 'json records'); eq(JSON.parse(IO.json.write(w, { mode: 'matrix' }))[1], ['Ann', 30, null], 'json matrix'); eq(JSON.parse(IO.json.write(w, { mode: 'workbook' })).sheets.Sheet1[0], ['name', 'age', 'name'], 'json workbook');
}
// ---------- clipboard ----------
{
  const w = ZN.newWorkbook(); const s = w.sheets[0]; const sb = w.internStyle({ b: 1, fc: '#ff0000', bg: '#00ff00', ha: 'right', nf: '0.00', bl: 'thin #000000' });
  w.tx('x', () => { w.put(s, 0, 0, { v: 'a\tb' }); w.put(s, 0, 1, { v: 'say "hi"' }); w.put(s, 0, 2, { v: 'l1\nl2' }); w.put(s, 1, 0, { v: 1.5, s: sb }); w.put(s, 1, 1, { v: undefined, f: 'A2*2', s: sb }); w.put(s, 1, 2, { v: 'plain & <x>' }); w.put(s, 2, 0, { v: true }); w.put(s, 2, 2, { v: 7 }); });
  const tsv = IO.clip.toTSV(s, 0, 0, 2, 2); eq(tsv, '"a\tb"\t"say ""hi"""\t"l1\nl2"\n1.50\t3.00\tplain & <x>\nTRUE\t\t7', 'toTSV Excel-style quoting & formatted');
  eq(IO.clip.fromTSV(tsv + '\n'), [['a\tb', 'say "hi"', 'l1\nl2'], ['1.50', '3.00', 'plain & <x>'], ['TRUE', '', '7']], 'fromTSV round trip'); eq(IO.clip.fromTSV('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']], 'fromTSV CRLF');
  const html = IO.clip.toHTML(s, 0, 0, 2, 2); T.ok(/<!--StartFragment--><table/.test(html) && /<\/table><!--EndFragment-->/.test(html), 'toHTML fragment markers'); T.ok(/x:num="1.5"/.test(html) && /x:fmla="=A2\*2"/.test(html), 'toHTML excel attrs');
  const p = IO.clip.fromHTML(html); eq(p.rows.length, 3, 'fromHTML rows'); eq(p.rows[0].map((c) => c.v), ['a b', 'say "hi"', 'l1\nl2'], 'fromHTML text (whitespace collapsed like HTML)'); eq(p.rows[1][0].v, 1.5, 'fromHTML x:num'); eq(p.rows[1][0].style, { b: 1, fc: '#ff0000', bg: '#00ff00', ha: 'right', bl: 'thin #000000' }, 'fromHTML style round trip'); eq(p.rows[1][0].nf, '0.00', 'fromHTML mso-number-format'); eq(p.rows[1][1].f, 'A2*2', 'fromHTML formula'); eq(p.rows[1][2].v, 'plain & <x>', 'fromHTML entities'); eq(p.rows[2][0].v, true, 'fromHTML bool');
  const g = IO.clip.fromHTML('<style>.xl65{mso-number-format:"0\\.0%";color:#00f;font-weight:700}</style><table><tr><td class=xl65 x:num="0.256">25.6%</td><td colspan=2 rowspan="3" style="background:rgb(255,0,0);text-align:center;border:.5pt solid windowtext">M&nbsp;&amp;<br>N</td></tr><tr><th>12</th><td>007</td></tr></table>');
  eq(g.rows[0][0].v, 0.256, 'fromHTML class style + x:num'); eq(g.rows[0][0].nf, '0.0%', 'fromHTML class mso-number-format'); eq(g.rows[0][0].style, { b: 1, fc: '#0000ff' }, 'fromHTML class style'); eq([g.rows[0][1].colspan, g.rows[0][1].rowspan, g.rows[0][1].v], [2, 3, 'M &\nN'], 'fromHTML span + br'); eq(g.rows[0][1].style, { bg: '#ff0000', ha: 'center', bl: 'thin #000000', br: 'thin #000000', bt: 'thin #000000', bb: 'thin #000000' }, 'fromHTML border shorthand');
  eq([g.rows[1][0].v, g.rows[1][1].v], [12, '007'], 'fromHTML typed text, leading zero kept'); eq(IO.clip.fromHTML('<p>no table</p>').rows, [], 'fromHTML without table');
  // internal copy/paste
  const pl = IO.clip.internal(s, 0, 0, 1, 2); eq([pl.w, pl.h], [3, 2], 'internal dims'); eq(pl.cells[1][1].f, 'A2*2', 'internal keeps formula'); eq(pl.styles.length, 1, 'internal local styles');
  w.tx('paste', () => IO.clip.pasteInternal(w, s, 5, 3, pl)); eq(s.getCell(6, 4).f, 'D7*2', 'paste translates relative refs'); eq(s.getValue(6, 4), 3, 'pasted formula computes'); eq(w.style(s.getCell(6, 3).s).bg, '#00ff00', 'paste keeps style'); eq(s.getValue(5, 3), 'a\tb', 'pasted value');
  w.tx('pv', () => IO.clip.pasteInternal(w, s, 10, 0, pl, { mode: 'values' })); eq(s.getCell(11, 1).f, undefined, 'values mode drops formula'); eq(s.getValue(11, 1), 3, 'values mode keeps computed value'); eq(s.getCell(11, 1).s, undefined, 'values mode no style');
  w.tx('pf', () => IO.clip.pasteInternal(w, s, 12, 0, pl, { mode: 'formats' })); eq(w.style(s.getCell(13, 0).s).fc, '#ff0000', 'formats mode'); eq(s.getValue(13, 0), null, 'formats mode keeps destination content');
  w.tx('pt', () => IO.clip.pasteInternal(w, s, 20, 0, pl, { mode: 'transpose' })); eq([s.getValue(20, 0), s.getValue(20, 1), s.getValue(22, 0), s.getValue(21, 0)], ['a\tb', 1.5, 'l1\nl2', 'say "hi"'], 'transpose paste');
  w.tx('pa', () => IO.clip.pasteInternal(w, s, 1, 0, IO.clip.internal(s, 2, 2, 2, 2), { mode: 'values', op: 'add' })); eq(s.getValue(1, 0), 8.5, 'paste special add operation (1.5 + 7)');
  w.undo(); w.undo(); w.undo(); w.undo(); w.undo(); eq(s.getCell(6, 4), undefined, 'paste is undoable as one tx');
  const w2 = ZN.newWorkbook(); w2.sheets[0].merges.push([0, 0, 0, 1]); w2.tx('m', () => w2.put(w2.sheets[0], 0, 0, { v: 'M' })); const mp = IO.clip.internal(w2.sheets[0], 0, 0, 0, 1); eq(mp.merges, [[0, 0, 0, 1]], 'internal merges'); w2.tx('p', () => IO.clip.pasteInternal(w2, w2.sheets[0], 3, 3, mp)); eq(w2.sheets[0].merges.length, 2, 'paste adds merge');
}
T.done('io');
