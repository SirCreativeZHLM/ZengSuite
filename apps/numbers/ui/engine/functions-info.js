/* ZengNumbers information functions. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, ZErr, Range } = ZN; const F = ZN.F; const { isErr, toNum, scalar } = F;
  const reg = (names, min, max, impl, hint, desc, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: 'Information', hint, desc }, opts));
  const L = { lift: true, errs: true };

  reg('ISNUMBER', 1, 1, (v) => typeof v === 'number', 'ISNUMBER(value)', 'TRUE if the value is a number.', L);
  reg('ISTEXT', 1, 1, (v) => typeof v === 'string', 'ISTEXT(value)', 'TRUE if the value is text.', L);
  reg('ISNONTEXT', 1, 1, (v) => typeof v !== 'string', 'ISNONTEXT(value)', 'TRUE if the value is not text.', L);
  reg('ISBLANK', 1, 1, (v) => v == null, 'ISBLANK(value)', 'TRUE if the cell is empty.', L);
  reg('ISERROR', 1, 1, (v) => isErr(v), 'ISERROR(value)', 'TRUE if the value is any error.', L);
  reg('ISERR', 1, 1, (v) => isErr(v) && v.code !== '#N/A', 'ISERR(value)', 'TRUE if the value is an error other than #N/A.', L);
  reg('ISNA', 1, 1, (v) => isErr(v) && v.code === '#N/A', 'ISNA(value)', 'TRUE if the value is #N/A.', L);
  reg('ISLOGICAL', 1, 1, (v) => typeof v === 'boolean', 'ISLOGICAL(value)', 'TRUE if the value is TRUE or FALSE.', L);
  const parity = (want) => (v) => { if (typeof v === 'boolean') return E.VALUE; const n = toNum(v); if (isErr(n)) return n; return (Math.abs(Math.trunc(n)) % 2 === 0) === want; };
  reg('ISEVEN', 1, 1, parity(true), 'ISEVEN(number)', 'TRUE if the number is even.', { lift: true });
  reg('ISODD', 1, 1, parity(false), 'ISODD(number)', 'TRUE if the number is odd.', { lift: true });
  reg('ISREF', 1, 1, (v) => v instanceof Range, 'ISREF(value)', 'TRUE if the value is a reference.', { errs: true });
  const cellOf = (r) => (r instanceof Range ? r.sheet.getCell(r.r1, r.c1) : null);
  reg('ISFORMULA', 1, 1, (r) => {
    if (!(r instanceof Range)) return E.VALUE; const has = (i, j) => { const c = r.sheet.getCell(r.r1 + i, r.c1 + j); return !!c && c.f !== undefined; };
    if (r.isSingle()) return has(0, 0); const out = []; for (let i = 0; i < r.clampedRows(); i++) { const row = []; for (let j = 0; j < r.cols; j++) row.push(has(i, j)); out.push(row); } return out;
  }, 'ISFORMULA(reference)', 'TRUE if the reference holds a formula.');
  reg('FORMULATEXT', 1, 1, (r) => { if (!(r instanceof Range)) return E.NA; const c = cellOf(r); return c && c.f !== undefined ? '=' + c.f : E.NA; }, 'FORMULATEXT(reference)', 'Returns the formula in a cell as text.');
  reg('N', 1, 1, (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0), 'N(value)', 'Converts a value to a number.', { lift: true });
  reg('T', 1, 1, (v) => (typeof v === 'string' ? v : ''), 'T(value)', 'Returns the text if the value is text, otherwise empty text.', { lift: true });
  reg('NA', 0, 0, () => E.NA, 'NA()', 'Returns the #N/A error.');
  const ET = { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#GETTING_DATA': 8, '#SPILL!': 9, '#CALC!': 14 };
  reg('ERROR.TYPE', 1, 1, (v) => (isErr(v) && ET[v.code] ? ET[v.code] : E.NA), 'ERROR.TYPE(error_val)', 'Returns a number for the type of error.', L);
  const typeOf = (v) => (typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : isErr(v) ? 16 : v == null ? 1 : 1);
  reg('TYPE', 1, 1, (v) => {
    if (v instanceof Range) return v.isSingle() ? typeOf(v.get(0, 0)) : 64; if (Array.isArray(v)) return v.length === 1 && v[0].length === 1 ? typeOf(v[0][0]) : 64; return typeOf(v);
  }, 'TYPE(value)', 'Returns the type of a value (1 number, 2 text, 4 logical, 16 error, 64 array).', { errs: true });

  const here = () => { const c = ZN.ctx || {}; return { sheet: c.sheet, r: c.r || 0, c: c.c || 0, wb: c.wb }; };
  reg('ROW', 0, 1, (r) => {
    if (r === undefined) return here().r + 1; if (!(r instanceof Range)) return E.VALUE; if (r.isSingle()) return r.r1 + 1;
    const out = []; for (let i = 0; i < r.clampedRows(); i++) out.push(new Array(1).fill(r.r1 + i + 1)); return out;
  }, 'ROW([reference])', 'Returns the row number of a reference.');
  reg('COLUMN', 0, 1, (r) => {
    if (r === undefined) return here().c + 1; if (!(r instanceof Range)) return E.VALUE; if (r.isSingle()) return r.c1 + 1;
    const row = []; for (let j = 0; j < r.cols; j++) row.push(r.c1 + j + 1); return [row];
  }, 'COLUMN([reference])', 'Returns the column number of a reference.');
  reg('ROWS', 1, 1, (r) => (r instanceof Range ? r.rows : Array.isArray(r) ? r.length : 1), 'ROWS(array)', 'Returns the number of rows in a reference or array.');
  reg('COLUMNS', 1, 1, (r) => (r instanceof Range ? r.cols : Array.isArray(r) ? (r[0] ? r[0].length : 0) : 1), 'COLUMNS(array)', 'Returns the number of columns in a reference or array.');
  reg('AREAS', 1, 1, (r) => (r instanceof Range ? 1 : E.VALUE), 'AREAS(reference)', 'Returns the number of areas in a reference.');
  reg('SHEET', 0, 1, (v) => {
    const h = here(); const wb = h.wb; if (!wb) return E.NA;
    if (v === undefined) return wb.sheets.indexOf(h.sheet) + 1;
    if (v instanceof Range) return wb.sheets.indexOf(v.sheet) + 1;
    if (typeof v === 'string') { const s = wb.sheetByName(v); return s ? wb.sheets.indexOf(s) + 1 : E.NA; } return E.NA;
  }, 'SHEET([value])', 'Returns the sheet number of a reference or sheet name.');
  reg('SHEETS', 0, 1, (v) => { const h = here(); if (v === undefined) return h.wb ? h.wb.sheets.length : 1; return v instanceof Range ? 1 : E.VALUE; }, 'SHEETS([reference])', 'Returns the number of sheets in a reference or the workbook.');

  const cellFormat = (nf) => {
    if (!nf || nf.toLowerCase() === 'general') return 'G';
    const map = { '0': 'F0', '0.00': 'F2', '#,##0': ',0', '#,##0.00': ',2', '$#,##0': 'C0', '$#,##0.00': 'C2', '0%': 'P0', '0.00%': 'P2', '0.00E+00': 'S2', '0E+00': 'S0', 'm/d/yyyy': 'D4', 'd-mmm-yy': 'D1', 'd-mmm': 'D2', 'mmm-yy': 'D3', 'h:mm AM/PM': 'D7', 'h:mm:ss AM/PM': 'D6', 'h:mm': 'D9', 'h:mm:ss': 'D8', 'm/d/yyyy h:mm': 'D4' };
    if (map[nf]) return map[nf]; if (/^#,##0_\);\(#,##0\)$/.test(nf)) return ',0()'; return ZN.fmt.isDate(nf) ? 'D4' : 'G';
  };
  reg('CELL', 1, 2, (type, ref) => {
    const t = String(type).toLowerCase(); const h = here(); let sheet = h.sheet, r = h.r, c = h.c;
    if (ref instanceof Range) { sheet = ref.sheet; r = ref.r1; c = ref.c1; } else if (ref !== undefined) return E.VALUE;
    if (!sheet) return E.VALUE; const cell = sheet.getCell(r, c); const v = sheet.getValue(r, c); const st = sheet.wb.style(sheet.styleId(r, c));
    switch (t) {
      case 'address': return '$' + ZN.colName(c) + '$' + (r + 1) + (sheet !== h.sheet ? '' : '');
      case 'col': return c + 1; case 'row': return r + 1;
      case 'contents': return v == null ? 0 : v;
      case 'type': return v == null ? 'b' : typeof v === 'string' ? 'l' : 'v';
      case 'format': return cellFormat(st.nf);
      case 'width': return Math.max(0, Math.floor((sheet.colWidth(c) - 5) / 7));
      case 'protect': return st.lock === 0 ? 0 : 1;
      case 'prefix': return typeof v === 'string' ? (st.ha === 'right' ? '"' : st.ha === 'center' ? '^' : st.ha === 'fill' ? '\\' : "'") : '';
      case 'color': return st.nf && /\[Red\]/i.test(st.nf) ? 1 : 0;
      case 'parentheses': return st.nf && /^[^;]*;?\(/.test(st.nf.split(';')[0] || '') ? 1 : 0;
      case 'filename': return '[' + (sheet.wb.props.title || 'Book1') + ']' + sheet.name;
    }
    return E.VALUE;
  }, 'CELL(info_type, [reference])', 'Returns information about a cell (address, col, row, contents, type, format, width, …).');
  reg('INFO', 1, 1, (t) => {
    const h = here(); switch (String(t).toLowerCase()) {
      case 'osversion': return 'Windows (32-bit) NT 10.00'; case 'recalc': return 'Automatic'; case 'release': return '16.0'; case 'system': return 'pcdos';
      case 'numfile': return h.wb ? h.wb.sheets.length : 1; case 'origin': return '$A:$A$1'; case 'directory': return '/'; case 'memavail': return 1048576; case 'memused': return 262144; case 'totmem': return 1310720; case 'cpu': return 'x64';
    } return E.VALUE;
  }, 'INFO(type_text)', 'Returns information about the operating environment.', { lift: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
