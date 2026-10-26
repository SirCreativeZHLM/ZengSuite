const T = require('./_h'); const { ZN } = T; const fm = ZN.fmt;
const f = (v, c, o) => fm.format(v, c, o).text;
const t = (v, c, want, o) => T.eq(f(v, c, o), want, 'fmt ' + c + ' <- ' + v);
// numbers
t(1234.5, '#,##0.00', '1,234.50'); t(1234.567, '0.00', '1234.57'); t(1234567.5, '#,##0', '1,234,568'); t(5, '000', '005'); t(0.5, '0%', '50%'); t(0.256, '0.0%', '25.6%');
t(1.005, '0.00', '1.01'); t(-5, '0.00;(0.00)', '(5.00)'); t(5, '0.00;(0.00)', '5.00'); t(0, '0;-0;"zero"', 'zero'); t(-5, '0', '-5'); t(0.5, '#.00', '.50'); t(3, '0.0#', '3.0'); t(3.14159, '0.0#', '3.14');
t(1234567, '#,##0,"K"', '1,235K'); t(1500000, '0.0,,"M"', '1.5M'); t(1234.5, '$#,##0.00', '$1,234.50'); t(1234.5, '[$€-407] #,##0.00', '€ 1,234.50'); t(12, '0 "kg"', '12 kg'); t(12, '0\\x', '12x');
t(12345.678, '0.00E+00', '1.23E+04'); t(0.00012345, '0.00E+00', '1.23E-04'); t(12345678, '##0.0E+0', '12.3E+6'); t(150, '[>100]"big";"small"', 'big'); t(50, '[>100]"big";"small"', 'small');
t(3.5, '# ?/?', '3 1/2'); t(0.5, '?/?', '1/2'); t(2.25, '# ?/4', '2 1/4'); t(0.125, '?/8', '1/8');
t(12, '0;;;', '12'); t(-12, '0;;;', ''); t(0, '0;-0;;@', ''); t(1234, '0000-00', '12-34'.length ? '0012-34' : '');
// dates & times (45292 = 2024-01-01, a Monday)
t(45292, 'yyyy-mm-dd', '2024-01-01'); t(45292, 'dddd', 'Monday'); t(45292, 'ddd', 'Mon'); t(45292, 'mmm d, yyyy', 'Jan 1, 2024'); t(45292, 'mmmm', 'January'); t(45292, 'd-mmm-yy', '1-Jan-24'); t(45292, 'm/d/yyyy', '1/1/2024'); t(45292, 'dddd, mmmm d, yyyy', 'Monday, January 1, 2024');
t(45292.5, 'h:mm AM/PM', '12:00 PM'); t(45292.75, 'hh:mm', '18:00'); t(0.75, 'h:mm AM/PM', '6:00 PM'); t(0.25, 'h:mm a/p', '6:00 a'); t(1.5, '[h]:mm', '36:00'); t(1 / 1440, 'mm:ss', '01:00'); t(45292.75, 'yyyy-mm-dd hh:mm:ss', '2024-01-01 18:00:00'); t(60, 'm/d/yyyy', '2/29/1900'); t(61, 'm/d/yyyy', '3/1/1900'); t(1, 'mmm-yy', 'Jan-00');
t(45292 + 0.5 + 0.123 / 86400, 'ss.000', '00.123'); t(0.5, 'hh:mm:ss', '12:00:00');
T.eq(fm.format(-1, 'yyyy').fits, false, 'negative date does not fit');
// General
t(0.1 + 0.2, 'General', '0.3'); t(123456789012, 'General', '1.23457E+11'); t(1234567.891, 'General', '1234567.891'); t(12345678.9123, 'General', '12345678.91'); t(1e-10, 'General', '1E-10'); t(100, 'General', '100'); t(-1.5, 'General', '-1.5'); t(0, 'General', '0'); t(0.000123456789, 'General', '0.000123457');
t(123456.789, 'General', '123457', { maxChars: 7 }); t(0.123456789, 'General', '0.123', { maxChars: 5 }); t(1234567890, 'General', '1E+09', { maxChars: 6 });
T.eq(fm.format(12345, 'General', { maxChars: 3 }).fits, false, 'cannot fit'); T.eq(fm.format(12345, 'General', { maxChars: 8 }).fits, true, 'fits');
// text, color, align
t('abc', '@', 'abc'); t('abc', '"x"@', 'xabc'); t('abc', '0.00;;;@"!"', 'abc!'); t('abc', 'General', 'abc'); t(true, 'General', 'TRUE');
T.eq(fm.format(-5, '[Red]0;[Blue]-0').color, '#0000ff', 'blue negative'); T.eq(fm.format(5, '[Red]0;[Blue]-0').color, '#ff0000', 'red positive'); T.eq(fm.format(5, '[Color 3]0').color, '#ff0000', 'Color 3');
T.eq(fm.format(1, '0').align, 'right', 'num right'); T.eq(fm.format('a', 'General').align, 'left', 'text left'); T.eq(fm.format(ZN.E.NA, 'General').align, 'center', 'err center'); T.eq(fm.format(ZN.E.NA, 'General').text, '#N/A', 'err text'); T.eq(fm.format(1, '0').isNumeric, true, 'isNumeric');
const acc = fm.format(1234.5, fm.builtinById[44]); T.ok(acc.text.includes('1,234.50') && acc.fill && acc.fill.char === ' ', 'accounting fill'); T.eq(fm.format(0, fm.builtinById[44]).text.includes('-'), true, 'accounting zero dash');
// builtins & helpers
T.eq(fm.builtinById[14], 'm/d/yyyy', 'id14'); T.eq(fm.builtinById[9], '0%', 'id9'); T.eq(fm.idByBuiltin['0.00'], 2, 'idByBuiltin'); T.eq(fm.builtinById[49], '@', 'id49'); T.ok(fm.builtinList.length > 40 && fm.builtinList.every((b) => b.cat && b.code), 'builtinList');
T.eq(fm.isDate('yyyy'), true, 'isDate yyyy'); T.eq(fm.isDate('0.00'), false, 'isDate 0.00'); T.eq(fm.isDate('h:mm'), true, 'isDate time'); T.eq(fm.isText('@'), true, 'isText');
for (const [c, w] of [['General', 'General'], ['0.00%', 'Percentage'], ['m/d/yyyy', 'Date'], ['h:mm', 'Time'], ['0.00E+00', 'Scientific'], ['# ?/?', 'Fraction'], ['@', 'Text'], ['$#,##0.00', 'Currency'], [fm.builtinById[44], 'Accounting'], ['0.00', 'Number'], ['#,##0', 'Number'], ['0 "x"', 'Custom']]) T.eq(fm.categoryOf(c), w, 'category ' + c);
for (const [c, d, w] of [['0.00', 1, '0.000'], ['0.00', -1, '0.0'], ['0', 1, '0.0'], ['0.0', -1, '0'], ['General', 1, '0.0'], ['#,##0.00', -1, '#,##0.0'], ['0%', 1, '0.0%'], ['0.00%', -1, '0.0%']]) T.eq(fm.adjustDecimals(c, d), w, 'adjust ' + c + d);
T.eq(fm.currencyCode('$', 2), '$#,##0.00', 'currencyCode'); T.eq(fm.currencyCode('$', 0, 1), '$#,##0_);($#,##0)', 'currencyCode paren');
// parse
const p = (s) => ZN.parseValue(s); const pe = (s, v, nf) => { const r = p(s); T.ok(r && r.v === v && r.nf === nf, 'parse ' + s + ' -> ' + JSON.stringify(r)); };
pe('123', 123, null); pe('-5.5', -5.5, null); pe('+7', 7, null); pe('1e3', 1000, null); pe('1,234', 1234, '#,##0'); pe('1,234.50', 1234.5, '#,##0.00'); pe('(123)', -123, null); pe('12.5%', 0.125, '0.0%'); pe('50%', 0.5, '0%'); pe('$1,234.50', 1234.5, '$#,##0.00'); pe('-$5', -5, '$#,##0'); pe('($5.00)', -5, '$#,##0.00');
pe('1/5/2024', 45296, 'm/d/yyyy'); pe('2024-01-05', 45296, 'yyyy-mm-dd'); pe('5-Jan-2024', 45296, 'd-mmm-yy'); pe('Jan 5, 2024', 45296, 'd-mmm-yy'); pe('5 January 2024', 45296, 'd-mmm-yy'); pe('Jan-24', 45292, 'mmm-yy'); pe('1/5/24', 45296, 'm/d/yyyy'); pe('2/29/1900', 60, 'm/d/yyyy');
pe('13:45', (13 * 60 + 45) / 1440, 'h:mm'); pe('1:45 PM', (13 * 60 + 45) / 1440, 'h:mm AM/PM'); pe('1:45:30', (3600 + 45 * 60 + 30) / 86400, 'h:mm:ss'); pe('1/5/2024 13:45', 45296 + (13 * 60 + 45) / 1440, 'm/d/yyyy h:mm'); pe('1 1/2', 1.5, '# ?/?'); pe('-1 1/2', -1.5, '# ?/?');
pe('TRUE', true, null); pe('false', false, null);
T.ok(p('#N/A').v === ZN.E.NA, 'parse #N/A'); for (const s of ['abc', '', 'hello world', '1/0/2024', '13/45/2024', '12abc', '--5', '1.2.3', '2/30/2024']) T.ok(p(s) === null, 'parse null ' + s);
{ const t0 = performance.now(); for (let i = 0; i < 200000; i++) { p('hello'); p('12345.5'); p('some text value'); } T.ok(performance.now() - t0 < 1500, 'parse fast ' + (performance.now() - t0)); }
T.done('fmt');
