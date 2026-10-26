/* Starter workbooks: Blank, Budget, Invoice, Loan calculator, Checklist. Pure engine code (also runs under node). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const T = ZN.templates = {};
  const ico = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  T.list = [
    { id: 'blank', name: 'Blank', desc: 'An empty workbook', icon: ico('<rect x="10" y="8" width="44" height="48" rx="6"/><path d="M10 22h44M26 8v48"/>') },
    { id: 'budget', name: 'Budget', desc: 'Monthly plan vs actual', icon: ico('<path d="M10 52V30M24 52V16M38 52V36M52 52V22"/><path d="M6 52h52"/>') },
    { id: 'invoice', name: 'Invoice', desc: 'Line items, tax, total', icon: ico('<path d="M16 8h32v48l-6-4-5 4-5-4-5 4-5-4-6 4z"/><path d="M24 22h16M24 32h16M24 42h8"/>') },
    { id: 'loan', name: 'Loan calculator', desc: 'Payment and schedule', icon: ico('<circle cx="32" cy="32" r="22"/><path d="M32 18v28M24 26c0-4 16-4 16 0s-16 6-16 10 16 4 16 0"/>') },
    { id: 'checklist', name: 'Checklist', desc: 'Tasks with progress', icon: ico('<rect x="12" y="10" width="40" height="44" rx="6"/><path d="M20 24l4 4 8-9M20 40l4 4 8-9M38 26h8M38 42h8"/>') },
  ];
  const HEAD = { b: 1, bg: '#1f2937', fc: '#ffffff' };
  function make(setup) {
    const wb = ZN.newWorkbook(); const sh = wb.sheets[0]; const A = (a) => ZN.parseA1(a);
    const api = {
      wb, sh,
      set(a, v) { const p = A(a); wb.setInput(sh, p.r, p.c, String(v)); },
      rows(a, rows) { const p = A(a); rows.forEach((r, i) => r.forEach((v, j) => { if (v !== null && v !== undefined && v !== '') wb.setInput(sh, p.r + i, p.c + j, String(v)); })); },
      style(range, patch) { const [a, b] = range.split(':'); const p = A(a), q = b ? A(b) : p; for (let r = p.r; r <= q.r; r++) for (let c = p.c; c <= q.c; c++) wb.patchStyle(sh, r, c, patch); },
      width(c, w) { sh.colW[c] = w; }, merge(range) { const [a, b] = range.split(':'); const p = A(a), q = b ? A(b) : p; sh.merges.push([p.r, p.c, q.r, q.c]); },
    };
    setup(api); wb.finish(); wb.undoStack.length = 0; wb.redoStack.length = 0; return wb;
  }
  const builders = {
    blank: () => ZN.newWorkbook(),
    budget: () => make((t) => {
      t.set('A1', 'Monthly Budget'); t.style('A1', { b: 1, fs: 20 }); t.set('A2', 'Planned vs actual spending'); t.style('A2', { fc: '#6b7280' });
      t.rows('A4', [['Category', 'Planned', 'Actual', 'Difference'], ['Rent', 1500, 1500], ['Groceries', 450, 512.4], ['Utilities', 220, 198.75], ['Transport', 180, 205], ['Dining out', 150, 241.3], ['Subscriptions', 60, 58.97], ['Health', 120, 95], ['Savings', 400, 400], ['Other', 100, 83.2]]);
      for (let r = 5; r <= 13; r++) t.set('D' + r, `=B${r}-C${r}`);
      t.rows('A14', [['Total', '=SUM(B5:B13)', '=SUM(C5:C13)', '=B14-C14']]); t.style('A4:D4', HEAD); t.style('B4:D4', { ha: 'right', b: 1, bg: '#1f2937', fc: '#ffffff' }); t.style('B5:D14', { nf: '$#,##0.00;[Red]-$#,##0.00' }); t.style('A14:D14', { b: 1, bt: 'thin #1f2937' });
      t.set('F4', 'Income'); t.set('G4', 4200); t.set('F5', 'Spent'); t.set('G5', '=C14'); t.set('F6', 'Left over'); t.set('G6', '=G4-G5'); t.set('F7', 'Savings rate'); t.set('G7', '=C12/G4'); t.style('F4:F7', { b: 1 }); t.style('G4:G6', { nf: '$#,##0.00' }); t.style('G7', { nf: '0.0%' });
      t.width(0, 150); for (const c of [1, 2, 3]) t.width(c, 100); t.width(5, 100); t.width(6, 110);
      t.sh.cf.push({ id: 'b1', type: 'cell', op: 'lt', v1: 0, ranges: [[4, 3, 12, 3]], style: { fc: '#c4271e', b: 1 }, priority: 1 }, { id: 'b2', type: 'dataBar', ranges: [[4, 2, 12, 2]], dataBar: { color: '#30d158', min: { type: 'min' }, max: { type: 'max' }, gradient: true, showValue: true }, priority: 2 });
      t.sh.charts.push({ id: 'c1', type: 'column', grouping: 'clustered', x: 20, y: 380, w: 520, h: 280, title: 'Planned vs actual', legend: 'bottom', cats: 'Sheet1!$A$5:$A$13', series: [{ name: 'Sheet1!$B$4', ref: 'Sheet1!$B$5:$B$13' }, { name: 'Sheet1!$C$4', ref: 'Sheet1!$C$5:$C$13' }], gridlines: true });
      t.sh.freeze = { r: 4, c: 0 };
    }),
    invoice: () => make((t) => {
      t.set('A1', 'INVOICE'); t.style('A1', { b: 1, fs: 24, fc: '#1f2937' }); t.rows('A3', [['From', 'Your Company'], ['', '123 Main Street'], ['', 'City, State 00000']]); t.rows('D3', [['Invoice #', '1001'], ['Date', '=TODAY()'], ['Due', '=E4+30']]); t.style('D3:D5', { b: 1, ha: 'right' }); t.style('E4:E5', { nf: 'mmm d, yyyy', ha: 'right' }); t.style('A3', { b: 1 });
      t.rows('A7', [['Bill to', 'Client name']]); t.style('A7', { b: 1 });
      t.rows('A9', [['Description', 'Qty', 'Unit price', 'Amount']]); t.style('A9:D9', HEAD); t.style('B9:D9', { ha: 'right', b: 1, bg: '#1f2937', fc: '#fff' });
      t.rows('A10', [['Design work', 12, 85], ['Development', 30, 95], ['Hosting (annual)', 1, 240], ['', '', ''], ['', '', '']]); for (let r = 10; r <= 14; r++) t.set('D' + r, `=IF(B${r}="","",B${r}*C${r})`);
      t.style('C10:D14', { nf: '$#,##0.00' }); t.rows('C16', [['Subtotal', '=SUM(D10:D14)'], ['Tax rate', 0.08], ['Tax', '=D16*D17'], ['Total', '=D16+D18']]); t.style('D17', { nf: '0.0%', bg: '#fff4b8' }); t.style('D16:D19', { nf: '$#,##0.00' }); t.style('D17', { nf: '0.0%' }); t.style('C19:D19', { b: 1, bt: 'thin #1f2937', fs: 13 }); t.style('C16:C19', { ha: 'right' });
      t.set('A21', 'Thank you for your business. Payment due within 30 days.'); t.style('A21', { fc: '#6b7280', i: 1 }); t.width(0, 240); t.width(1, 70); t.width(2, 110); t.width(3, 120); t.width(4, 110);
      t.sh.dv.push({ id: 'd1', ranges: [[16, 3, 16, 3]], type: 'decimal', op: 'between', v1: 0, v2: 1, allowBlank: true, errStyle: 'stop', errTitle: 'Tax rate', errMsg: 'Enter a rate between 0% and 100%.', showError: true });
      t.sh.grid = false;
    }),
    loan: () => make((t) => {
      t.set('A1', 'Loan Calculator'); t.style('A1', { b: 1, fs: 20 }); t.rows('A3', [['Loan amount', 250000], ['Annual rate', 0.065], ['Years', 30], ['Payments per year', 12]]); t.style('B3', { nf: '$#,##0' }); t.style('B4', { nf: '0.00%' }); t.style('B3:B6', { bg: '#fff4b8' }); t.style('A3:A6', { b: 1 });
      t.rows('A8', [['Payment', '=-PMT(B4/B6,B5*B6,B3)'], ['Total paid', '=B8*B5*B6'], ['Total interest', '=B9-B3']]); t.style('B8:B10', { nf: '$#,##0.00', b: 1 }); t.style('A8:A10', { b: 1 });
      t.rows('A12', [['Period', 'Payment', 'Interest', 'Principal', 'Balance']]); t.style('A12:E12', HEAD);
      t.set('E13', '=B3'); t.set('A13', 0); for (let i = 1; i <= 360; i++) { const r = 13 + i; t.set('A' + r, `=IF(A${r - 1}<$B$5*$B$6,A${r - 1}+1,"")`); t.set('B' + r, `=IF(A${r}="","",$B$8)`); t.set('C' + r, `=IF(A${r}="","",E${r - 1}*$B$4/$B$6)`); t.set('D' + r, `=IF(A${r}="","",B${r}-C${r})`); t.set('E' + r, `=IF(A${r}="","",MAX(0,E${r - 1}-D${r}))`); }
      t.style('B13:E374', { nf: '$#,##0.00' }); t.width(0, 130); for (let c = 1; c <= 4; c++) t.width(c, 110);
      t.sh.charts.push({ id: 'c1', type: 'area', grouping: 'clustered', x: 560, y: 70, w: 520, h: 300, title: 'Remaining balance', legend: 'none', cats: 'Sheet1!$A$14:$A$374', series: [{ name: 'Balance', ref: 'Sheet1!$E$14:$E$374', color: '#30d158' }], gridlines: true, xTitle: 'Payment' });
      t.sh.freeze = { r: 12, c: 0 };
    }),
    checklist: () => make((t) => {
      t.set('A1', 'Project Checklist'); t.style('A1', { b: 1, fs: 20 }); t.rows('A3', [['Done', 'Task', 'Owner', 'Due']]); t.style('A3:D3', HEAD);
      const tasks = [['Yes', 'Define scope', 'Sam', 1], ['Yes', 'Collect requirements', 'Ana', 3], ['No', 'Draft proposal', 'Sam', 7], ['No', 'Review with team', 'Lee', 10], ['No', 'Final sign-off', 'Ana', 14], ['No', 'Kick off', 'All', 18]];
      tasks.forEach((r, i) => { t.set('A' + (4 + i), r[0]); t.set('B' + (4 + i), r[1]); t.set('C' + (4 + i), r[2]); t.set('D' + (4 + i), `=TODAY()+${r[3]}`); }); t.style('D4:D20', { nf: 'mmm d' }); t.style('A4:A20', { ha: 'center' });
      t.rows('F3', [['Progress', '=COUNTIF(A4:A20,"Yes")/MAX(1,COUNTA(B4:B20))'], ['Open tasks', '=COUNTIF(A4:A20,"No")']]); t.style('F3:F4', { b: 1 }); t.style('G3', { nf: '0%', b: 1, fs: 16 });
      t.width(0, 70); t.width(1, 240); t.width(2, 90); t.width(3, 90); t.width(5, 100);
      t.sh.dv.push({ id: 'd1', ranges: [[3, 0, 19, 0]], type: 'list', list: ['Yes', 'No'], dropdown: true, allowBlank: true, errStyle: 'stop', showError: true });
      t.sh.cf.push({ id: 'k1', type: 'cell', op: 'eq', v1: 'Yes', ranges: [[3, 0, 19, 0]], style: { bg: '#c6efce', fc: '#006100' }, priority: 1 }, { id: 'k2', type: 'formula', formula: '$A4="Yes"', ranges: [[3, 1, 19, 3]], style: { fc: '#8e8e93', k: 1 }, priority: 2 }, { id: 'k3', type: 'dataBar', ranges: [[2, 6, 2, 6]], dataBar: { color: '#30d158', min: { type: 'num', v: 0 }, max: { type: 'num', v: 1 } }, priority: 3 });
    }),
  };
  T.build = (id) => (builders[id] || builders.blank)();
})(typeof globalThis !== 'undefined' ? globalThis : this);
