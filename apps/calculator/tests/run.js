// Node harness for the ZengCalc engines. Run: node apps/calculator/tests/run.js
'use strict';
const path = require('path');
const E = path.join(__dirname, '..', 'ui', 'engine');
const C = require(path.join(E, 'calc.js'));
const U = require(path.join(E, 'units.js'));
const P = require(path.join(E, 'prog.js'));
const N = require(path.join(E, 'notes.js'));
const W = require(path.join(E, 'work.js'));
const { CalcState } = require(path.join(E, 'state.js'));
const { Dec } = C;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) pass++; else { fail++; console.log('FAIL', label, '\n   expected:', expected, '\n   actual:  ', actual); }
}
const show = (v, o) => C.formatQ(v, o);
function ev(s, ctx = {}) { try { return show(C.evaluate(s, ctx)); } catch (e) { return 'ERR:' + e.message; } }
function table(title, rows, ctx) { for (const [expr, exp] of rows) eq(ev(expr, ctx), exp, title + ': ' + expr); }
const keys = (s, o) => { const st = new CalcState(o); s.split(' ').forEach((k) => st.press(k)); return st; };

// ---------------------------------------------------------------- decimal precision
table('precision', [
  ['0.1+0.2', '0.3'], ['0.1+0.7', '0.8'], ['0.3-0.1', '0.2'], ['1.1*1.1', '1.21'], ['0.1*3', '0.3'], ['4.35*100', '435'], ['1.005*1000', '1,005'],
  ['0.07*100', '7'], ['19.99*3', '59.97'], ['0.3/0.1', '3'], ['1/3', '0.3333333333333333'], ['2/3', '0.6666666666666667'], ['1/3*3', '1'], ['10/4', '2.5'],
  ['1/8', '0.125'], ['123456789*987654321', '121,932,631,112,635,269'], ['999999999999*999999999999', '999,999,999,998,000,000,000,001'], ['0.000001*0.000001', '1e-12'],
  ['1e3+1', '1,001'], ['2^64', '18,446,744,073,709,551,616'], ['2^100', '1.267650600228229e+30'], ['100-99.99', '0.01'], ['5-4.9', '0.1'], ['0.1+0.2-0.3', '0'],
  ['9007199254740993+1', '9,007,199,254,740,994'], ['12345.6789*10000', '123,456,789'], ['0.5+0.25+0.125', '0.875'], ['3*0.1-0.3', '0'], ['(0.1+0.2)*10', '3'], ['7/2', '3.5'], ['-7/2', '-3.5'],
  ['1000000*1000000', '1,000,000,000,000'], ['0.1^2', '0.01'], ['2^-3', '0.125'], ['(-2)^3', '-8'], ['(-2)^2', '4'], ['10^15', '1,000,000,000,000,000'], ['10^16', '10,000,000,000,000,000'], ['10^24', '1e+24'], ['10^23', '100,000,000,000,000,000,000,000'], ['1/7', '0.1428571428571429'],
]);
// ---------------------------------------------------------------- precedence & syntax
table('precedence', [
  ['2+3*4', '14'], ['(2+3)*4', '20'], ['2*3+4', '10'], ['10-2-3', '5'], ['2^3^2', '512'], ['-2^2', '-4'], ['(-2)^2', '4'], ['2^-1', '0.5'], ['100/10/5', '2'], ['100/(10/5)', '50'],
  ['2*-3', '-6'], ['--3', '3'], ['+5', '5'], ['3!+1', '7'], ['2*3!', '12'], ['(2+3)!', '120'], ['2(3+4)', '14'], ['(1+2)(3+4)', '21'], ['2pi', '6.283185307179586'], ['3(4)(5)', '60'],
  ['10 mod 3', '1'], ['-10 mod 3', '-1'], ['10 mod 3 * 2', '2'], ['7 mod 7', '0'], ['5.5 mod 2', '1.5'], ['2^3*2', '16'], ['1+2*3^2', '19'], ['8/2(2+2)', '16'], ['√9', '3'], ['√(16)+1', '5'], ['∛27', '3'],
  ['2×3', '6'], ['8÷2', '4'], ['5−3', '2'], ['2**3', '8'], ['3²', '9'], ['2³', '8'], ['(1+2)²', '9'], ['1e2', '100'], ['1.5e-2', '0.015'], ['.5+.5', '1'], ['5.', '5'],
  ['sqrt(2)^3', '2.82842712474619'], ['sqrt 16', '4'], ['sin 30', '0.5'], ['abs(-4)', '4'], ['|−4|', '4'], ['max(1,5,3)', '5'], ['min(4,2,8)', '2'], ['gcd(12,18)', '6'], ['lcm(4,6)', '12'],
]);
table('errors', [
  ['1/0', 'ERR:Cannot divide by zero'], ['0/0', 'ERR:Cannot divide by zero'], ['(1+2', 'ERR:Missing )'], ['1+', 'ERR:Incomplete expression'], ['', 'ERR:Empty'], ['sqrt(-1)', 'ERR:Invalid input'],
  ['ln(0)', 'ERR:Invalid input'], ['ln(-1)', 'ERR:Invalid input'], ['foo+1', 'ERR:Unknown name "foo"'], ['2)', 'ERR:Unexpected )'], ['(-8)^0.5', 'ERR:Invalid input'], ['asin(2)', 'ERR:Invalid input'],
  ['tan(90)', 'ERR:Not defined'], ['(-1)!', 'ERR:Invalid input'], ['0^-1', 'ERR:Cannot divide by zero'], ['5 mod 0', 'ERR:Cannot divide by zero'], ['3 ncr 5', 'ERR:Invalid input'], ['2 $ 3', 'ERR:Unexpected "$"'],
]);
// ---------------------------------------------------------------- percent semantics
table('percent', [
  ['100+10%', '110'], ['100-10%', '90'], ['100*10%', '10'], ['100/10%', '1,000'], ['50%', '0.5'], ['200+50%', '300'], ['80-25%', '60'], ['100+10%+10%', '121'], ['1000+5%', '1,050'],
  ['20% of 85', '17'], ['15% of 200', '30'], ['50% of 50% of 100', '25'], ['85*20%', '17'], ['100+0%', '100'], ['0+10%', '0'], ['7.5% of 40', '3'], ['100-100%', '0'], ['100+200%', '300'], ['(50+50)+10%', '110'],
  ['250*8%', '20'], ['1200 + 15%', '1,380'], ['59.99-20%', '47.992'], ['10%+10%', '0.11'], ['5% * 5%', '0.0025'],
]);
// ---------------------------------------------------------------- trig & angle modes
const deg = { angle: 'deg' }, rad = { angle: 'rad' }, grad = { angle: 'grad' };
table('trig deg', [
  ['sin(0)', '0'], ['sin(30)', '0.5'], ['sin(90)', '1'], ['sin(180)', '0'], ['sin(270)', '-1'], ['sin(360)', '0'], ['cos(0)', '1'], ['cos(60)', '0.5'], ['cos(90)', '0'], ['cos(180)', '-1'], ['cos(270)', '0'],
  ['tan(45)', '1'], ['tan(0)', '0'], ['tan(180)', '0'], ['sin(-30)', '-0.5'], ['cos(-60)', '0.5'], ['sin(450)', '1'], ['sin(1)', '0.0174524064372835'], ['asin(1)', '90'], ['asin(0.5)', '30'], ['acos(0.5)', '60'], ['acos(-1)', '180'],
  ['atan(1)', '45'], ['atan(-1)', '-45'], ['sinh(0)', '0'], ['cosh(0)', '1'], ['tanh(0)', '0'], ['sin(30°)', '0.5'], ['sec(60)', '2'], ['csc(30)', '2'], ['cot(45)', '1'],
], deg);
table('trig rad', [
  ['sin(0)', '0'], ['sin(pi/6)', '0.5'], ['sin(pi/2)', '1'], ['sin(pi)', '0'], ['cos(pi)', '-1'], ['cos(pi/2)', '0'], ['cos(0)', '1'], ['cos(pi/3)', '0.5'], ['tan(pi/4)', '1'], ['sin(1)', '0.841470984807897'], ['cos(1)', '0.54030230586814'],
  ['asin(1)', '1.5707963267949'], ['acos(0)', '1.5707963267949'], ['atan(1)', '0.785398163397448'], ['sin(30°)', '0.5'], ['sin(2pi)', '0'], ['atan(0)', '0'],
], rad);
table('trig grad', [['sin(100)', '1'], ['cos(100)', '0'], ['sin(50)', '0.707106781186547'], ['tan(50)', '1'], ['asin(1)', '100'], ['atan(1)', '50'], ['cos(200)', '-1']], grad);
table('log/exp', [
  ['ln(1)', '0'], ['ln(e)', '1'], ['log(1000)', '3'], ['log(0.01)', '-2'], ['log(1)', '0'], ['log2(8)', '3'], ['log2(1024)', '10'], ['exp(0)', '1'], ['exp(1)', '2.71828182845905'], ['10^3', '1,000'], ['e^2', '7.38905609893065'],
  ['ln(10)', '2.30258509299405'], ['8 logy 2', '3'], ['27 logy 3', '3'], ['3 yroot 27', '3'], ['4 yroot 16', '2'], ['5 yroot 32', '2'], ['cbrt(-8)', '-2'], ['sqrt(144)', '12'], ['sqrt(2)', '1.414213562373095'],
  ['2^0.5', '1.414213562373095'], ['8^(1/3)', '2'], ['(-8)^(1/3)', '-2'], ['0.25^0.5', '0.5'], ['4^1.5', '8'], ['sinh(1)', '1.1752011936438'], ['cosh(1)', '1.54308063481524'], ['tanh(1)', '0.761594155955765'],
  ['asinh(1)', '0.881373587019543'], ['acosh(1)', '0'], ['atanh(0)', '0'],
]);
table('factorial/comb', [
  ['0!', '1'], ['1!', '1'], ['5!', '120'], ['10!', '3,628,800'], ['20!', '2,432,902,008,176,640,000'], ['25!', '1.551121004333099e+25'], ['170!', '7.257415615307999e+306'], ['5 ncr 2', '10'], ['10 ncr 3', '120'], ['52 ncr 5', '2,598,960'],
  ['5 npr 2', '20'], ['10 npr 3', '720'], ['6 ncr 0', '1'], ['6 ncr 6', '1'], ['fib(10)', '55'], ['fib(50)', '12,586,269,025'],
]);
table('rounding/misc', [['floor(2.7)', '2'], ['floor(-2.1)', '-3'], ['ceil(2.1)', '3'], ['ceil(-2.7)', '-2'], ['round(2.5)', '3'], ['round(-2.5)', '-3'], ['round(3.14159,2)', '3.14'], ['trunc(-2.9)', '-2'], ['sign(-9)', '-1'], ['frac(2.75)', '0.75'],
  ['avg(1,2,3,4)', '2.5'], ['sum(1,2,3)', '6'], ['pi', '3.141592653589793'], ['π', '3.141592653589793'], ['tau', '6.283185307179586'], ['phi', '1.618033988749895']]);
// ---------------------------------------------------------------- formatting
{
  const f = (s, o) => C.format(Dec.parse(s), o);
  eq(f('1234567.891'), '1,234,567.891', 'fmt group'); eq(f('1234567.891', { group: false }), '1234567.891', 'fmt nogroup'); eq(f('-1234'), '-1,234', 'fmt neg');
  eq(f('1234567.891', { sep: { decimal: ',', group: '.' } }), '1.234.567,891', 'fmt de'); eq(f('0.5', { sep: { decimal: ',', group: '.' } }), '0,5', 'fmt de small');
  eq(f('0.0000001'), '1e-7', 'fmt tiny'); eq(ev('0.5!').slice(0, 12), '0.8862269254', 'gamma half'); eq(f('0.000001'), '0.000001', 'fmt 1e-6'); eq(f('123456789012345678'), '123,456,789,012,345,678', 'fmt big int exact'); eq(f('1234567890123456789012345'), '1.234567890123457e+24', 'fmt huge'); eq(f('0'), '0', 'fmt zero');
  eq(f('1000'), '1,000', 'fmt 1000'); eq(f('999'), '999', 'fmt 999'); eq(f('100000'), '100,000', 'fmt 1e5'); eq(f('0.1234567890123456789'), '0.1234567890123457', 'fmt 16 digits'); eq(f('12345', { digits: 3 }), '1.23e+4', 'fmt digits 3');
  eq(C.localeSeps('en-US').decimal, '.', 'locale en dec'); eq(C.localeSeps('de-DE').decimal, ',', 'locale de dec'); eq(C.localeSeps('de-DE').group, '.', 'locale de group');
  const pn = (s, sep) => { const r = C.parseNumberText(s, sep); return r ? r.toPlain() : null; };
  const en = C.localeSeps('en-US'), de = C.localeSeps('de-DE');
  eq(pn('1,234,567.89', en), '1234567.89', 'paste en'); eq(pn('1.234.567,89', de), '1234567.89', 'paste de'); eq(pn('1 234 567', en), '1234567', 'paste spaces'); eq(pn('1,234', en), '1234', 'paste 1,234 en');
  eq(pn('1,5', de), '1.5', 'paste 1,5 de'); eq(pn('1.234', de), '1234', 'paste 1.234 de'); eq(pn('1.234,5', en), '1234.5', 'paste mixed'); eq(pn('$1,299.99', en), '1299.99', 'paste currency'); eq(pn('(42)', en), '-42', 'paste parens neg');
  eq(pn('-0.5', en), '-0.5', 'paste neg'); eq(pn('abc', en), null, 'paste junk'); eq(pn('1e3', en), '1000', 'paste exp'); eq(pn('', en), null, 'paste empty'); eq(pn('12,34,56', en), null, 'paste bad group'); eq(pn('−3', en), '-3', 'paste unicode minus'); eq(pn('50%', en), '50', 'paste pct'); eq(pn('.5', en), '0.5', 'paste .5');
  eq(C.groupDigits('1234567', ' '), '1 234 567', 'groupDigits');
}
// ---------------------------------------------------------------- key-driven state machine
{
  const d = (s, o) => keys(s, o).displayText();
  eq(d('1 0 0 add 1 0 pct eq'), '110', 'key 100+10%='); eq(d('2 add 3 mul 4 eq'), '14', 'key precedence'); eq(d('5 add 3 eq eq eq'), '14', 'key repeat equals'); eq(d('2 mul 3 eq eq'), '18', 'key repeat mul');
  eq(d('0 . 1 add 0 . 2 eq'), '0.3', 'key .1+.2'); eq(d('1 div 0 eq'), 'Cannot divide by zero', 'key div0'); eq(d('lp 1 add 2 rp mul 3 eq'), '9', 'key parens'); eq(d('lp 1 add 2 mul 3 eq'), '7', 'key auto-close');
  eq(d('9 sqrt'), '3', 'key sqrt'); eq(d('3 0 sin'), '0.5', 'key sin'); eq(d('3 0 sin', { angle: 'rad' }), '-0.988031624092862', 'key sin rad'); eq(d('2 pow 1 0 eq'), '1,024', 'key pow'); eq(d('5 fact'), '120', 'key fact');
  eq(d('1 2 3 4 neg'), '-1,234', 'key neg'); eq(d('1 2 3 back'), '12', 'key back'); eq(d('1 back'), '0', 'key back to 0'); eq(d('0 0 0 7'), '7', 'key leading zeros'); eq(d('. 5'), '0.5', 'key .5'); eq(d('1 . 2 . 3'), '1.23', 'key double dot');
  eq(d('1 ee 5 eq'), '100,000', 'key EE'); eq(d('1 ee 3 neg eq'), '0.001', 'key EE neg exp'); eq(d('2 0 0 sub 1 0 pct eq'), '180', 'key 200-10%'); eq(d('5 mplus 3 mplus mr'), '8', 'key memory'); eq(d('5 ms 9 mc mr'), '0', 'key mc');
  eq(d('5 mplus 2 mminus mr'), '3', 'key m-'); eq(d('4 add 5 mul 2 sub 3 eq'), '11', 'key chain'); eq(d('7 add sub 2 eq'), '5', 'key operator replace'); eq(d('1 0 0 add 5 0 pct'), '50', 'key pct shows value'); eq(d('5 0 pct'), '0.5', 'key bare pct');
  eq(d('2 sq'), '4', 'key square'); eq(d('3 cube'), '27', 'key cube'); eq(d('4 inv'), '0.25', 'key inverse'); eq(d('1 0 log'), '1', 'key log'); eq(d('pi'), '3.141592653589793', 'key pi'); eq(d('2 sq sq'), '16', 'key chain unary');
  eq(d('1 div 3 mul 3 eq'), '1', 'key 1/3*3'); eq(d('1 0 0 0 0 0 0 mul 1 0 0 0 0 0 0 eq'), '1,000,000,000,000', 'key large'); eq(d('1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8'), '1,234,567,890,123,456', 'key 16-digit limit');
  eq(d('2 sub 5 eq'), '-3', 'key negative result'); eq(d('3 add 4 eq 2 mul 5 eq'), '10', 'key continue from result'); eq(d('3 add 4 eq 9'), '9', 'key new entry after eq'); eq(d('1 clear'), '0', 'key C'); eq(d('1 add 2 ac'), '0', 'key AC');
  eq(d('8 yroot 2 7 eq'), '1.5098036484771', 'key yroot'); eq(d('5 ncr 2 eq'), '10', 'key ncr'); eq(d('4 npr 2 eq'), '12', 'key npr'); eq(d('1 0 mod 3 eq'), '1', 'key mod'); eq(d('8 logy 2 eq'), '3', 'key logy');
  const s = keys('1 2 add 3 eq'); eq(s.history.length, 1, 'history len'); eq(s.history[0].expr, '12 + 3', 'history expr'); eq(s.history[0].result, '15', 'history result');
  const s2 = keys('1 add 2 eq 4 mul 2 eq'); eq(s2.history[0].result, '8', 'history newest first'); eq(s2.history.length, 2, 'history len 2');
  eq(keys('7 add 3').exprText(), '7 +', 'exprText'); eq(keys('7 add 3 add').displayText(), '10', 'running total'); eq(keys('lp 4').exprText(), '(', 'paren open expr');
}
// ---------------------------------------------------------------- programmer
{
  const r = (s, o) => { try { const x = P.evalProg(s, o); return x.value.toString() + (x.overflow ? '!' : ''); } catch (e) { return 'ERR:' + e.message; } };
  const o8 = { bits: 8, signed: true }, u8 = { bits: 8, signed: false }, o16 = { bits: 16, signed: true }, u16 = { bits: 16, signed: false }, o32 = { bits: 32, signed: true }, u32 = { bits: 32, signed: false }, o64 = { bits: 64, signed: true }, u64 = { bits: 64, signed: false };
  eq(r('127+1', o8), '-128!', 'i8 overflow +'); eq(r('255+1', u8), '0!', 'u8 wrap'); eq(r('0-1', u8), '255!', 'u8 underflow'); eq(r('-128-1', o8), '127!', 'i8 underflow'); eq(r('100+27', o8), '127', 'i8 max'); eq(r('-128', o8), '-128', 'i8 min');
  eq(r('200', o8), '-56!', 'i8 literal overflow'); eq(r('256', u8), '0!', 'u8 literal overflow'); eq(r('255', u8), '255', 'u8 literal max'); eq(r('0xFF', o8), '-1', 'hex literal signed view'); eq(r('0xFF & 0x0F', o8), '15', 'AND');
  eq(r('0xF0 | 0x0F', u8), '255', 'OR'); eq(r('0xFF ^ 0x0F', u8), '240', 'XOR'); eq(r('~0', u8), '255', 'NOT u8'); eq(r('~0', o8), '-1', 'NOT i8'); eq(r('~0', u16), '65535', 'NOT u16'); eq(r('~0', u32), '4294967295', 'NOT u32'); eq(r('~0', u64), '18446744073709551615', 'NOT u64');
  eq(r('~0', o64), '-1', 'NOT i64'); eq(r('5 nand 3', u8), '254', 'NAND'); eq(r('5 nor 3', u8), '248', 'NOR'); eq(r('5 and 3', u8), '1', 'and word'); eq(r('5 or 3', u8), '7', 'or word'); eq(r('5 xor 3', u8), '6', 'xor word'); eq(r('not 5', u8), '250', 'not word');
  eq(r('1 << 7', o8), '-128', 'shl into sign'); eq(r('1 << 7', u8), '128', 'shl u8'); eq(r('1 << 8', u8), '0!', 'shl out'); eq(r('3 << 7', u8), '128!', 'shl bits lost'); eq(r('1 << 31', u32), '2147483648', 'shl 31'); eq(r('1 << 63', u64), '9223372036854775808', 'shl 63');
  eq(r('1 << 63', o64), '-9223372036854775808', 'shl 63 signed'); eq(r('-1 >> 1', o8), '-1', 'arith shr'); eq(r('0xFF >> 1', u8), '127', 'logical shr'); eq(r('-8 >> 2', o8), '-2', 'arith shr -8'); eq(r('16 >> 4', u8), '1', 'shr'); eq(r('1 >> 9', u8), '0', 'shr big');
  eq(r('0x81 rol 1', u8), '3', 'rol'); eq(r('0x81 ror 1', u8), '192', 'ror'); eq(r('1 ror 1', u8), '128', 'ror wrap'); eq(r('0x8000 rol 1', u16), '1', 'rol16'); eq(r('0x12345678 rol 8', u32), '878082066', 'rol32'); eq(r('1 rol 0', u8), '1', 'rol 0'); eq(r('1 rol 8', u8), '1', 'rol full');
  eq(r('7/2', o8), '3', 'int div'); eq(r('-7/2', o8), '-3', 'int div trunc'); eq(r('7 mod 3', o8), '1', 'mod'); eq(r('-7 mod 3', o8), '-1', 'mod neg'); eq(r('1/0', o8), 'ERR:Cannot divide by zero', 'div0'); eq(r('-128/-1', o8), '-128!', 'min/-1');
  eq(r('10*20', o8), '-56!', 'mul overflow'); eq(r('10*12', o8), '120', 'mul ok'); eq(r('2+3*4', o8), '14', 'prog precedence'); eq(r('(2+3)*4', o8), '20', 'prog parens'); eq(r('1|2^3&4', o8), '3', 'prog bit precedence'); eq(r('1+2<<3', o16), '24', 'shift vs add');
  eq(r('FF', { bits: 16, signed: false, base: 16 }), '255', 'hex base input'); eq(r('ff + 1', { bits: 16, signed: false, base: 16 }), '256', 'hex add'); eq(r('101', { bits: 8, signed: false, base: 2 }), '5', 'bin input'); eq(r('777', { bits: 16, signed: false, base: 8 }), '511', 'oct input');
  eq(r('12', { bits: 8, signed: false, base: 2 }), 'ERR:Invalid digit "2" for base 2', 'bad digit'); eq(r('0b101', u8), '5', 'bin prefix'); eq(r('0o17', u8), '15', 'oct prefix'); eq(r('FF xor 0F', { bits: 8, signed: false, base: 16 }), '240', 'hex xor words');
  eq(r('#255', o8), '-1', 'raw pattern'); eq(r('-5', o8), '-5', 'neg literal'); eq(r('-(-128)', o8), '-128!', 'neg min'); eq(r('2147483647+1', o32), '-2147483648!', 'i32 overflow'); eq(r('4294967295+1', u32), '0!', 'u32 wrap'); eq(r('9223372036854775807+1', o64), '-9223372036854775808!', 'i64 overflow');
  eq(r('18446744073709551615+1', u64), '0!', 'u64 wrap'); eq(r('32767+1', o16), '-32768!', 'i16 overflow'); eq(r('65535', u16), '65535', 'u16 max'); eq(r('', o8), 'ERR:Incomplete expression', 'empty'); eq(r('(1', o8), 'ERR:Missing )', 'missing paren'); eq(r('1 +', o8), 'ERR:Incomplete expression', 'trailing op');
  const fb = (p, b, o) => P.formatBase(BigInt(p), b, o);
  eq(fb(255, 16, { bits: 8 }), 'FF', 'fmt hex'); eq(fb(255, 10, { bits: 8, signed: true, group: false }), '-1', 'fmt dec signed'); eq(fb(255, 10, { bits: 8, signed: false }), '255', 'fmt dec unsigned'); eq(fb(255, 2, { bits: 8 }), '1111 1111', 'fmt bin grouped');
  eq(fb(255, 8, { bits: 8 }), '377', 'fmt oct'); eq(fb(5, 2, { bits: 8, pad: true, group: false }), '00000101', 'fmt bin pad'); eq(fb(0xDEADBEEF, 16, { bits: 32 }), 'DEAD BEEF', 'fmt hex group'); eq(fb(1234567, 10, { bits: 32, signed: true }), '1,234,567', 'fmt dec group'); eq(fb(1234567, 10, { bits: 32, sep: '.' }), '1.234.567', 'fmt sep');
  eq(fb(2n ** 64n - 1n, 10, { bits: 64, signed: false, group: false }), '18446744073709551615', 'fmt u64'); eq(fb(2n ** 63n, 10, { bits: 64, signed: true, group: false }), '-9223372036854775808', 'fmt i64 min'); eq(P.bitAt(5n, 0), true, 'bitAt0'); eq(P.bitAt(5n, 1), false, 'bitAt1'); eq(P.bitAt(5n, 2), true, 'bitAt2');
  eq(P.toggleBit(0n, 7, 8).toString(), '128', 'toggle bit'); eq(P.toggleBit(255n, 0, 8).toString(), '254', 'toggle clear'); eq(P.toggleBit(0n, 63, 64).toString(), '9223372036854775808', 'toggle 63');
  const ps = (k, o) => { const s = new P.ProgState(o); k.split(' ').forEach((x) => s.press(x)); return s; };
  eq(ps('1 2 7 add 1 eq', { bits: 8 }).display(), '-128', 'state overflow'); eq(ps('1 2 7 add 1 eq', { bits: 8 }).overflow, true, 'state overflow flag'); eq(ps('f f add 1 eq', { base: 16, bits: 16 }).display(), '100', 'state hex'); eq(ps('2 5 5', { bits: 8, signed: false }).display(), '255', 'state u8 max entry');
  eq(ps('2 5 6', { bits: 8, signed: false }).display(), '25', 'state rejects overflow digit'); eq(ps('1 2 8', { bits: 8, signed: true }).display(), '12', 'state i8 rejects 128'); eq(ps('5 not', { bits: 8, signed: false }).display(), '250', 'state not'); eq(ps('5 neg', { bits: 8, signed: true }).display(), '-5', 'state neg');
  eq(ps('5 and 3 eq', { bits: 8 }).display(), '1', 'state and'); eq(ps('1 lsh 4 eq', { bits: 8 }).display(), '16', 'state lsh'); eq(ps('1 0 sub 2 0 eq', { bits: 8 }).display(), '-10', 'state sub'); eq(ps('9 div 0 eq').display(), 'Cannot divide by zero', 'state div0');
  { const s = ps('2 5 5', { bits: 8, signed: false }); eq(s.fmt(s.value(), 16), 'FF', 'sync hex'); eq(s.fmt(s.value(), 2), '1111 1111', 'sync bin'); eq(s.fmt(s.value(), 8), '377', 'sync oct'); s.setBits(16); eq(s.fmt(s.value(), 16), 'FF', 'widen keeps value'); s.setBits(8); eq(s.fmt(s.value(), 10), '255', 'narrow'); s.setSigned(true); eq(s.fmt(s.value(), 10), '-1', 'signed view'); s.setBits(64); eq(s.fmt(s.value(), 16), 'FF', 'u8 FF to 64'); }
  { const s = ps('3 0 0', { bits: 16, signed: true }); s.setBits(8); eq(s.fmt(s.value(), 10), '44', 'truncate 300 to 8 bit'); }
}
// ---------------------------------------------------------------- unit conversions
{
  const cv = (v, a, b) => { try { return C.format(U.convert(v, a, b)); } catch (e) { return 'ERR:' + e.message; } };
  eq(cv(1, 'km', 'm'), '1,000', 'km->m'); eq(cv(1, 'mi', 'km'), '1.609344', 'mi->km'); eq(cv(1, 'ft', 'in'), '12', 'ft->in'); eq(cv(1, 'yd', 'ft'), '3', 'yd->ft'); eq(cv(100, 'cm', 'm'), '1', 'cm->m'); eq(cv(1, 'in', 'cm'), '2.54', 'in->cm'); eq(cv(1, 'nmi', 'km'), '1.852', 'nmi->km');
  eq(cv(1, 'ha', 'm2'), '10,000', 'ha->m2'); eq(cv(1, 'acre', 'm2'), '4,046.8564224', 'acre'); eq(cv(1, 'km2', 'm2'), '1,000,000', 'km2'); eq(cv(1, 'm3', 'L'), '1,000', 'm3->L'); eq(cv(1, 'gal', 'L'), '3.785411784', 'gal'); eq(cv(1, 'gal', 'qt'), '4', 'gal->qt'); eq(cv(1, 'cup', 'floz'), '8', 'cup->floz');
  eq(cv(1, 'tbsp', 'tsp'), '3', 'tbsp->tsp'); eq(cv(1, 'L', 'mL'), '1,000', 'L->mL'); eq(cv(1, 'kg', 'g'), '1,000', 'kg->g'); eq(cv(1, 'lb', 'oz'), '16', 'lb->oz'); eq(cv(1, 'lb', 'kg'), '0.45359237', 'lb->kg'); eq(cv(1, 'st', 'lb'), '14', 'st->lb'); eq(cv(1, 't', 'kg'), '1,000', 't->kg');
  eq(cv(0, 'C', 'F'), '32', '0C'); eq(cv(100, 'C', 'F'), '212', '100C'); eq(cv(-40, 'C', 'F'), '-40', '-40'); eq(cv(32, 'F', 'C'), '0', '32F'); eq(cv(212, 'F', 'C'), '100', '212F'); eq(cv(0, 'C', 'K'), '273.15', '0C->K'); eq(cv(0, 'K', 'C'), '-273.15', '0K'); eq(cv(37, 'C', 'F'), '98.6', '37C'); eq(cv(98.6, 'F', 'C'), '37', '98.6F'); eq(cv(0, 'K', 'F'), '-459.67', '0K->F');
  eq(cv(36, 'kmh', 'mps'), '10', '36kmh'); eq(cv(1, 'mph', 'kmh'), '1.609344', 'mph'); eq(cv(1, 'kn', 'kmh'), '1.852', 'knot'); eq(cv(1, 'mps', 'kmh'), '3.6', 'm/s->km/h'); eq(cv(60, 'mph', 'mps'), '26.8224', '60mph');
  eq(cv(1, 'h', 'min'), '60', 'h->min'); eq(cv(1, 'd', 'h'), '24', 'd->h'); eq(cv(1, 'wk', 'd'), '7', 'wk->d'); eq(cv(1, 'min', 's'), '60', 'min->s'); eq(cv(1, 's', 'ms'), '1,000', 's->ms'); eq(cv(1, 'yr', 'd'), '365.2425', 'yr->d');
  eq(cv(1, 'B', 'bit'), '8', 'B->bit'); eq(cv(1, 'KB', 'B'), '1,000', 'KB'); eq(cv(1, 'KiB', 'B'), '1,024', 'KiB'); eq(cv(1, 'GiB', 'MiB'), '1,024', 'GiB->MiB'); eq(cv(1, 'GB', 'MB'), '1,000', 'GB->MB'); eq(cv(1, 'TB', 'GB'), '1,000', 'TB'); eq(cv(1, 'MiB', 'KiB'), '1,024', 'MiB->KiB');
  eq(cv(1, 'kJ', 'J'), '1,000', 'kJ'); eq(cv(1, 'kcal', 'cal'), '1,000', 'kcal'); eq(cv(1, 'kWh', 'J'), '3,600,000', 'kWh'); eq(cv(1, 'cal', 'J'), '4.184', 'cal'); eq(cv(1, 'Wh', 'J'), '3,600', 'Wh');
  eq(cv(1, 'atm', 'Pa'), '101,325', 'atm'); eq(cv(1, 'bar', 'kPa'), '100', 'bar'); eq(cv(1, 'kPa', 'Pa'), '1,000', 'kPa'); eq(cv(1, 'atm', 'psi'), '14.69594877551422', 'atm->psi'); 
  eq(cv(180, 'deg', 'rad'), '3.141592653589793', 'deg->rad'); eq(cv(1, 'turn', 'deg'), '360', 'turn'); eq(cv(90, 'deg', 'grad'), '100', 'deg->grad'); eq(cv(1, 'deg', 'arcmin'), '60', 'deg->arcmin'); eq(cv(1, 'arcmin', 'arcsec'), '60', 'arcmin->arcsec');
  eq(cv(8, 'l100', 'kml'), '12.5', 'L/100km->km/L'); eq(cv(10, 'kml', 'l100'), '10', 'km/L->L/100km'); eq(cv(30, 'mpg', 'l100'), '7.840486111111111', 'mpg->L/100'); eq(cv(0, 'mpg', 'l100'), 'ERR:Cannot divide by zero', 'mpg 0'); eq(cv(1, 'm', 'kg'), 'ERR:Cannot convert length to mass', 'mismatch');
  eq(cv(1, 'furlong', 'm'), 'ERR:Unknown unit furlong', 'unknown unit'); eq(cv(5, 'mi', 'mi'), '5', 'identity'); eq(cv(0.1, 'm', 'cm'), '10', 'exact 0.1m');
  // currency: user entered
  eq(cv(10, 'USD', 'EUR'), 'ERR:Enter a rate for EUR', 'currency no rate'); U.setRates({ USD: '1', EUR: '0.9', GBP: '0.8', JPY: '' });
  eq(cv(100, 'USD', 'EUR'), '90', 'USD->EUR'); eq(cv(90, 'EUR', 'USD'), '100', 'EUR->USD'); eq(cv(90, 'EUR', 'GBP'), '80', 'EUR->GBP'); eq(cv(1, 'USD', 'JPY'), 'ERR:Enter a rate for JPY', 'empty rate'); eq(cv(1, 'USD', 'USD'), '1', 'same currency');
  eq(U.CATS.currency.units.length, 4, 'currency units from rates'); U.setRates({ USD: '1', EUR: '-3' }); eq(cv(1, 'USD', 'EUR'), 'ERR:Enter a rate for EUR', 'negative rate rejected'); U.setRates({ USD: '1', EUR: '' });
  eq(Object.keys(U.CATS).length, 13, 'category count'); for (const c of ['length', 'area', 'volume', 'mass', 'temperature', 'speed', 'time', 'data', 'energy', 'pressure', 'angle', 'fuel', 'currency']) eq(!!U.CATS[c], true, 'category ' + c);
}
// ---------------------------------------------------------------- dates
{
  const D = (s) => U.parseISO(s); const iso = U.toISO;
  eq(U.weekday(D('2026-10-26')), 1, 'weekday monday'); eq(U.weekday(D('1970-01-01')), 4, 'weekday epoch thu'); eq(U.weekday(D('2000-02-29')), 2, 'weekday leap day'); eq(U.isLeap(2000), true, 'leap 2000'); eq(U.isLeap(1900), false, 'leap 1900'); eq(U.isLeap(2024), true, 'leap 2024'); eq(U.isLeap(2023), false, 'leap 2023');
  eq(U.daysInMonth(2024, 2), 29, 'feb 2024'); eq(U.daysInMonth(2023, 2), 28, 'feb 2023'); eq(U.daysInMonth(2023, 4), 30, 'apr'); eq(U.dayNum(D('1970-01-01')), 0, 'epoch day'); eq(U.dayNum(D('2000-01-01')), 10957, 'y2k day');
  eq(iso(U.addToDate(D('2024-01-31'), { months: 1 })), '2024-02-29', 'add month clamp leap'); eq(iso(U.addToDate(D('2023-01-31'), { months: 1 })), '2023-02-28', 'add month clamp'); eq(iso(U.addToDate(D('2024-02-29'), { years: 1 })), '2025-02-28', 'add year from leap day');
  eq(iso(U.addToDate(D('2026-10-26'), { days: 100 })), '2027-02-03', 'add 100 days'); eq(iso(U.addToDate(D('2026-10-26'), { days: 100 }, -1)), '2026-07-18', 'subtract 100 days'); eq(iso(U.addToDate(D('2026-12-31'), { days: 1 })), '2027-01-01', 'year rollover'); eq(iso(U.addToDate(D('2026-10-26'), { weeks: 2 })), '2026-11-09', 'add weeks');
  eq(iso(U.addToDate(D('2026-10-26'), { years: 1, months: 2, days: 3 })), '2027-12-29', 'add y m d'); eq(iso(U.addToDate(D('2026-03-31'), { months: 1 }, -1)), '2026-02-28', 'subtract month clamp');
  let d = U.diffDates(D('2026-01-01'), D('2026-12-31')); eq(d.totalDays, 364, 'diff total'); eq(d.months, 11, 'diff months'); eq(d.days, 30, 'diff days');
  d = U.diffDates(D('2000-01-01'), D('2026-10-26')); eq(d.years, 26, 'diff years'); eq(d.months, 9, 'diff months2'); eq(d.days, 25, 'diff days2'); eq(d.totalDays, 9795, 'diff total2'); eq(d.weeks, 1399, 'diff weeks'); eq(d.remDays, 2, 'diff rem');
  d = U.diffDates(D('2026-10-26'), D('2026-10-26')); eq(d.totalDays, 0, 'diff same'); d = U.diffDates(D('2026-10-26'), D('2026-01-01')); eq(d.negative, true, 'diff negative'); eq(d.totalDays, 298, 'diff neg total');
  d = U.diffDates(D('2024-02-29'), D('2025-02-28')); eq(d.years, 1, 'leap diff years'); eq(d.months, 0, 'leap diff months'); eq(d.totalDays, 365, 'leap diff total');
  d = U.diffDates(D('2026-10-26'), D('2026-11-02')); eq(d.weekdays, 5, 'weekdays one week'); d = U.diffDates(D('2026-10-24'), D('2026-10-26')); eq(d.weekdays, 0, 'weekend only');
  eq(iso(U.addWeekdays(D('2026-10-26'), 5)), '2026-11-02', 'add 5 weekdays'); eq(iso(U.addWeekdays(D('2026-10-30'), 1)), '2026-11-02', 'weekday skips weekend'); eq(iso(U.addWeekdays(D('2026-11-02'), -1)), '2026-10-30', 'subtract weekday');
  eq((() => { try { U.parseISO('2026-02-30'); return 'ok'; } catch (e) { return e.message; } })(), 'Invalid date', 'invalid feb 30'); eq((() => { try { U.parseISO('hello'); return 'ok'; } catch (e) { return e.message; } })(), 'Invalid date', 'invalid text');
  eq(iso(U.civilFromDays(U.dayNum(D('1999-12-31')))), '1999-12-31', 'civil roundtrip'); eq(iso(U.civilFromDays(-1)), '1969-12-31', 'civil -1');
}
// ---------------------------------------------------------------- notes
{
  const run = (t) => N.evaluateNotes(t);
  const r = run('rent = 1200\nrent * 12 + 300\n\n20% of 85\nsqrt(2)^3\n5 km in miles\nmonthly rent = 1500\nmonthly rent * 2\nlunch 12\n1/0\n\n10\n20 kg\nsum\n20% off 85\n100 + 10%\nRENT + 1\n# heading\nprice = 19.99\nprice * 3\n2 + 2\nans * 5');
  const t = (i) => (r.lines[i].text !== undefined ? r.lines[i].text : r.lines[i].kind);
  eq(t(0), '1,200', 'notes assign'); eq(r.lines[0].kind, 'assign', 'notes assign kind'); eq(t(1), '14,700', 'notes var use'); eq(t(2), 'blank', 'notes blank'); eq(t(3), '17', 'notes % of'); eq(t(4), '2.82842712474619', 'notes sqrt'); eq(t(5), '3.106855961 mi', 'notes unit conv');
  eq(t(7), '3,000', 'notes multiword var'); eq(r.lines[8].kind, 'text', 'notes text line'); eq(r.lines[9].kind, 'error', 'notes error line'); eq(r.lines[9].error, 'Cannot divide by zero', 'notes error msg'); eq(t(13), '30', 'notes sum mixes unit and plain without a unit'); eq(t(14), '68', 'notes % off'); eq(t(15), '110', 'notes 100+10%');
  eq(t(16), '1,201', 'notes case-insens var'); eq(t(17), 'comment', 'notes heading'); eq(t(19), '59.97', 'notes decimal exact'); eq(t(20), '4', 'notes simple'); eq(t(21), '20', 'notes ans');
  eq(String(r.vars.rent), '1200', 'notes vars exported');
  const q = (s) => run(s).lines[0].text;
  eq(q('5 km + 300 m'), '5.3 km', 'unit add'); eq(q('2 h in min'), '120 min', 'h->min'); eq(q('100 C in F'), '212 °F', 'temp'); eq(q('10 kg to lb'), '22.04622622 lb', 'kg->lb'); eq(q('1 GB in MB'), '1,000 MB', 'data'); eq(q('60 mph in km/h'), '96.56064 km/h', 'speed alias'); eq(q('3 ft in cm'), '91.44 cm', 'ft->cm');
  eq(q('2 * 5 km'), '10 km', 'scalar*unit'); eq(q('10 km / 2'), '5 km', 'unit/scalar'); eq(q('10 km / 5 km'), '2', 'unit ratio'); eq(q('20% of 5 km'), '1 km', 'pct of unit'); eq(q('(2+3) kg'), '5 kg', 'paren unit'); eq(q('1 + 1'), '2', 'plain');
  eq(q('10 USD in EUR'), undefined, 'currency unset gives no result'); eq(run('x = 5\nx^2').lines[1].text, '25', 'var power'); eq(run('a = 1\nb = a + 1\nb * 10').lines[2].text, '20', 'chained vars'); eq(run('sin = 5').lines[0].kind, 'error', 'reserved name');
  eq(N.exportText('a = 2\na * 3\ntext', run('a = 2\na * 3\ntext')), 'a = 2\t=> 2\na * 3\t=> 6\ntext\n', 'export text');
}
// ---------------------------------------------------------------- graph compiler
{
  const g = (s, env, ctx) => { const ast = C.parse(s, { freeVars: ['x', 'a', 'b', 'c'] }); return C.compileNum(ast, ctx)(env); };
  eq(g('x^2', { x: 3 }), 9, 'graph x^2'); eq(g('2x+1', { x: 4 }), 9, 'graph implicit mult'); eq(g('sin(x)', { x: 0 }), 0, 'graph sin'); eq(g('a*x+b', { x: 2, a: 3, b: 1 }), 7, 'graph params'); eq(g('abs(x)', { x: -3 }), 3, 'graph abs'); eq(g('sqrt(x)', { x: 16 }), 4, 'graph sqrt');
  eq(Number.isNaN(g('sqrt(x)', { x: -1 })), true, 'graph nan'); eq(g('x^3', { x: -2 }), -8, 'graph neg cube'); eq(g('x^(1/3)', { x: -8 }), -2, 'graph odd root'); eq(g('1/x', { x: 4 }), 0.25, 'graph recip'); eq(g('100+10%', {}), 110, 'graph pct');
  eq(g('sin(x)', { x: 90 }, { angle: 'deg' }), 1, 'graph deg'); eq(g('e^x', { x: 0 }), 1, 'graph exp'); eq(g('ln(x)', { x: Math.E }), 1, 'graph ln'); eq(g('floor(x)', { x: 2.7 }), 2, 'graph floor'); eq(g('x mod 3', { x: 10 }), 1, 'graph mod'); eq(g('max(x,2)', { x: 5 }), 5, 'graph max');
}

// ---------------------------------------------------------------- Show Work
{
  const ex = (s, o) => W.explain(s, o);
  const plains = (s, o) => ex(s, o).steps.map((x) => x.plain);
  const j = (a) => a.join(' | ');
  eq(j(plains('2+3*4')), '3 × 4 = 12 | 2 + 12 = 14', 'work precedence mul first');
  eq(ex('2+3*4').resultText, '14', 'work result'); eq(ex('2+3*4').steps[0].note, '× binds tighter than +, so it runs first.', 'work precedence note');
  eq(j(plains('(2+3)*4')), '2 + 3 = 5 | 5 × 4 = 20', 'work parens first'); eq(ex('(2+3)*4').steps[0].note, 'Inside parentheses, so it runs first.', 'work paren note');
  eq(j(plains('10-2-3')), '10 − 2 = 8 | 8 − 3 = 5', 'work left to right'); eq(ex('10-2-3').steps[0].note, 'Same level: left to right.', 'work assoc note');
  eq(j(plains('2^3^2')), '3^2 = 9 | 2^9 = 512', 'work power right assoc'); eq(ex('2^3^2').steps[0].note, 'Powers group from the right.', 'work power note');
  eq(j(plains('2*3+4*5')), '2 × 3 = 6 | 4 × 5 = 20 | 6 + 20 = 26', 'work two products');
  eq(j(plains('100+10%')), '100 + 10% = 110', 'work percent step'); eq(ex('100+10%').steps[0].note, '10% of 100 is 10, so 100 + 10.', 'work percent note');
  eq(j(plains('200-10%')), '200 − 10% = 180', 'work percent minus'); eq(ex('20% of 85').resultText, '17', 'work percent of');
  eq(j(plains('sqrt(16)+1')), '√(16) = 4 | 4 + 1 = 5', 'work function step'); eq(ex('sin(30)').steps[0].note, 'sin with angles in degrees.', 'work trig note'); eq(ex('sin(pi/6)', { angle: 'rad' }).steps[1].note, 'sin with angles in radians.', 'work trig rad note');
  eq(j(plains('5!+1')), '5! = 120 | 120 + 1 = 121', 'work factorial'); eq(j(plains('-2^2')), '2^2 = 4 | −4 = -4', 'work unary minus after power');
  eq(j(plains('0.1+0.2')), '0.1 + 0.2 = 0.3', 'work exact decimal'); eq(plains('7').length, 0, 'work single number has no steps'); eq(ex('7').resultText, '7', 'work single result');
  eq(j(plains('1+2+3+4')), '1 + 2 = 3 | 3 + 3 = 6 | 6 + 4 = 10', 'work chain');
  eq(ex('12 + 3 × (4 − 1)').headerText, '12 + 3 × (4 − 1)', 'work header text'); eq(ex('2+3*4').header.filter((x) => x.k === 'op').map((x) => x.order).join(','), '2,1', 'work operator order badges'); eq(ex('2+3*4').header.filter((x) => x.k === 'op').map((x) => x.rank).join(','), '1,2', 'work operator ranks');
  eq(ex('2+3*4').steps[0].segs.filter((x) => x.hl).map((x) => x.s).join(''), '3 × 4', 'work highlight current node'); eq(ex('2+3*4').steps[1].segs.map((x) => x.s).join(''), '2 + 12', 'work reduced value substituted');
  eq(ex('2+3*4').leaves.map((l) => l.text).join(','), '2,3,4', 'work editable leaves');
  // tree
  const t = ex('2+3*4').tree; eq(t.label, '+', 'tree root'); eq(t.value, '14', 'tree root value'); eq(t.kids.length, 2, 'tree kids'); eq(t.kids[1].label, '×', 'tree child op'); eq(t.kids[1].value, '12', 'tree child value'); eq(t.kids[1].order, 1, 'tree order mul first'); eq(t.order, 2, 'tree order root last'); eq(t.kids[0].leaf, true, 'tree leaf');
  eq(ex('(1+2)*3').tree.label, '×', 'tree skips parens'); eq(ex('sqrt(9)').tree.kids[0].label, '9', 'tree call arg');
  // what changed
  const base = ex('2+3*4'); const alt = ex('2+3*4', { overrides: { 3: '5' } }); const d = W.diffWork(base, alt);
  eq(alt.resultText, '22', 'work override result'); eq(d.resultFrom, '14', 'diff from'); eq(d.resultTo, '22', 'diff to'); eq(d.changed, true, 'diff changed'); eq(d.deltaText, '+8', 'diff delta'); eq(d.pctText, '+57.14%', 'diff percent');
  eq(d.steps.map((x) => x.i + ':' + x.from + '>' + x.to).join(' '), '1:12>20 2:14>22', 'diff per-step changes');
  const same = W.diffWork(base, ex('2+3*4', { overrides: { 1: '2' } })); eq(same.changed, false, 'diff unchanged'); eq(same.steps.length, 0, 'diff no steps');
  const neg = W.diffWork(base, ex('2+3*4', { overrides: { 1: '0' } })); eq(neg.deltaText, '−2', 'diff negative delta'); eq(neg.pctText, '−14.29%', 'diff negative percent');
  eq(W.diffWork(ex('1/3'), ex('1/3', { overrides: { 1: '2' } })).resultTo, '0.6666666666666667', 'diff decimals');
  eq(ex('2+3*4', { overrides: { 99: '7' } }).resultText, '14', 'override unknown id ignored');
  // variables and units
  const vs = ex('rent*12+300', { vars: { rent: Dec.of(1200) }, fmt: {} }); eq(vs.resultText, '14,700', 'work vars result'); eq(vs.steps[0].plain, '1,200 × 12 = 14,400', 'work var substituted'); eq(vs.headerText, 'rent × 12 + 300', 'work var header keeps name');
  eq(ex('5 km in miles', { units: true }).resultText, '3.10685596118667 mi', 'work unit conversion'); eq(ex('10 km / 2', { units: true }).resultText, '5 km', 'work quantity division');
  eq(ex('2(3+4)').resultText, '14', 'work implicit multiplication'); eq(ex('2(3+4)').steps[1].plain, '2 × 7 = 14', 'work implicit as times');
  eq(ex('8 logy 2').resultText, '3', 'work logy'); eq(ex('3 yroot 27').steps.length, 1, 'work yroot step');
  // text export
  const tx = W.workText(ex('2+3*4')); eq(tx.split('\n')[0], '2 + 3 × 4 = 14', 'text header'); eq(tx.includes('1. 3 × 4 = 12   (× binds tighter than +, so it runs first.)'), true, 'text step 1'); eq(tx.includes('2. 2 + 12 = 14'), true, 'text step 2'); eq(tx.endsWith('Shown with Calc'), true, 'text footer');
  const tw = W.workText(alt, { diff: d, what: '3 → 5' }); eq(tw.includes('What if: 3 → 5'), true, 'text what-if'); eq(tw.includes('14 → 22 (+8, +57.14%)'), true, 'text what-if delta');
  // history keeps evaluable source
  { const st = keys('2 add 3 mul 4 eq'); eq(st.history[0].ev, '2+3*4', 'state history ev'); eq(W.explain(st.history[0].ev).resultText, '14', 'history entry replays'); eq(st.history[0].angle, 'deg', 'state history angle');
    const s2 = keys('1 0 0 add 1 0 pct eq'); eq(W.explain(s2.history[0].ev).steps[0].plain, '100 + 10 = 110', 'history percent replay'); const s3 = keys('lp 1 add 2 rp mul 3 eq'); eq(W.explain(s3.history[0].ev).resultText, '9', 'history parens replay'); eq(W.explain(s3.history[0].ev).steps.length, 2, 'history parens steps'); }
  // converter / date / programmer models
  const cw = (v, a, b) => W.convWork(v, U.unit(a), U.unit(b), {});
  eq(cw(5, 'km', 'mi').steps.map((x) => x.plain).join(' | '), '5 km × 1,000 = 5,000 m | 5,000 ÷ 1,609.344 = 3.10685596118667 mi', 'conv work length'); eq(cw(5, 'km', 'mi').resultText, '3.10685596118667 mi', 'conv work result');
  eq(cw(100, 'C', 'F').steps.map((x) => x.plain).join(' | '), '100 + 273.15 = 373.15 K | 373.15 × 9 ÷ 5 − 459.67 = 212 °F', 'conv work temperature'); eq(cw(1, 'm', 'm').steps.length, 1, 'conv work same unit'); eq(cw(1, 'km', 'm').steps.length, 1, 'conv work base target');
  eq(cw(8, 'l100', 'kml').resultText, '12.5 km/L', 'conv work fuel');
  U.setRates({ USD: '1', EUR: '0.9' }); eq(cw(100, 'USD', 'EUR').steps.length, 2, 'conv work currency steps'); eq(cw(100, 'USD', 'EUR').steps[1].plain, '100 × 0.9 = 90 EUR', 'conv work currency'); eq(cw(100, 'USD', 'EUR').steps[0].note, 'Rates are the ones you entered.', 'conv work currency note'); U.setRates({ USD: '1', EUR: '' });
  const dd = W.dateDiffWork(U.parseISO('2020-01-31'), U.parseISO('2026-10-26')); eq(dd.resultText, '6 years, 8 months, 26 days (2460 days)', 'date work result'); eq(dd.steps[1].plain, 'Whole months: 80 = 6 years + 8 months', 'date work months'); eq(dd.steps[3].plain, 'Total days: 2460 = 351 weeks + 3 days', 'date work total');
  const da = W.dateAddWork(U.parseISO('2024-01-31'), { years: 0, months: 1, weeks: 0, days: 0 }, 1, false); eq(da.resultText, '2024-02-29', 'date add work result'); eq(da.steps[1].note, 'February has no day 31, so it clamps to 29.', 'date add clamp note');
  eq(W.dateAddWork(U.parseISO('2026-10-30'), { years: 0, months: 0, weeks: 0, days: 1 }, 1, true).resultText, '2026-11-02', 'date weekdays work');
  const pw = W.progWork('127+1', { bits: 8, signed: true, base: 10 }); eq(pw.resultText, '-128', 'prog work result'); eq(pw.steps[0].plain, '127 + 1 = -128', 'prog work step'); eq(pw.steps[0].note, 'Result does not fit in 8 bits (signed), so it wraps around.', 'prog work overflow note'); eq(pw.overflow, true, 'prog work overflow flag');
  const pb = W.progWork('0xF0 & 0x3C', { bits: 8, signed: false, base: 10 }); eq(pb.steps[0].plain, '240 AND 60 = 48', 'prog work and'); eq(pb.steps[0].note, '1111 0000 AND 0011 1100 → 0011 0000', 'prog work bit note');
  eq(W.progWork('~0', { bits: 8, signed: false, base: 10 }).steps[0].plain, 'NOT 0 = 255', 'prog work not'); eq(W.progWork('1+2*3', { bits: 16, signed: true, base: 10 }).steps.map((x) => x.plain).join(' | '), '2 × 3 = 6 | 1 + 6 = 7', 'prog work precedence');
  { const st = new P.ProgState({ bits: 8 }); '1 2 7 add 1 eq'.split(' ').forEach((k) => st.press(k)); eq(typeof st.history[0].src, 'string', 'prog history keeps src'); eq(W.progWork(st.history[0].src, { bits: 8, signed: true, base: 10 }).resultText, '-128', 'prog history replays'); }
  // Scratch what-if + sum + line sources
  const sc = 'price = 20\nqty = 3\nsubtotal = price * qty\nsubtotal * 2\n\n10\n5\nsum';
  const b0 = N.evaluateNotes(sc); const t0 = b0.lines.map((l) => l.text);
  eq(t0.join('|'), '20|3|60|120||10|5|15', 'scratch baseline');
  const w1 = N.evaluateNotes(sc, { override: { line: 0, value: Dec.of(25) } }); eq(w1.lines.map((l) => l.text).join('|'), '25|3|75|150||10|5|15', 'what-if updates dependents live');
  eq(w1.lines.filter((l, i) => l.text !== t0[i]).length, 3, 'what-if changes exactly the dependent lines'); eq(String(w1.vars.price), '25', 'what-if vars updated');
  const w2 = N.evaluateNotes(sc, { override: { line: 1, value: Dec.of(0) } }); eq(w2.lines[2].text, '0', 'what-if zero'); eq(w2.lines[3].text, '0', 'what-if zero propagates');
  const w3 = N.evaluateNotes(sc, { override: { line: 0, value: Dec.parse('19.99') } }); eq(w3.lines[2].text, '59.97', 'what-if exact decimals');
  eq(b0.lines[2].src, 'price * qty', 'scratch line keeps source'); eq(Object.keys(b0.lines[2].vars).join(','), 'price,qty,ans,prev', 'scratch line keeps variable snapshot');
  eq(b0.lines[7].parts.join('+'), '10+5', 'scratch sum parts');
  { const t = (x) => N.evaluateNotes(x).lines.map((l) => l.text).join('|');
    eq(t('rent = 1200\n50\n25\nsum'), '1,200|50|25|75', 'sum skips earlier definitions');
    eq(t('10\nrent = 5\n20\n30\nsum'), '10|5|20|30|50', 'sum stops at an assignment');
    eq(t('1\n2\n\n3\n4\nsum'), '1|2||3|4|7', 'sum stops at a blank line');
    eq(t('d = 1000 mi\n5 mi\n3 mi\nsum'), '1,000 mi|5 mi|3 mi|8 mi', 'sum of same units keeps unit');
    eq(t('1 km\n500 m\nsum'), '1 km|500 m|1.5 km', 'sum converts to the first unit');
    eq(t('5 km\n3\nsum'), '5 km|3|8', 'sum of mixed unit and plain drops the unit');
    eq(t('5 km\n3 kg\nsum'), '5 km|3 kg|8', 'sum of incompatible units drops the unit');
    eq(t('x = 5\nsum'), '5|', 'sum after only a definition has nothing to add');
    eq(t('4\n6\navg'), '4|6|5', 'avg uses the same block');
    eq(t('5 km in miles'), '3.106855961 mi', 'scratch conversion shows 10 significant digits');
    eq(t('1 mi in km'), '1.609344 km', 'scratch conversion strips trailing zeros');
    eq(t('d = 5 km in miles\nd in km'), '3.106855961 mi|5 km', 'rounded display keeps exact internal value');
    eq(t('1/3'), '0.3333333333333333', 'plain results keep full precision');
  }
  const sw = W.explain(b0.lines[2].src, { vars: b0.lines[2].vars, varNames: new Set(Object.keys(b0.lines[2].vars)), units: true }); eq(sw.steps[0].plain, '20 × 3 = 60', 'scratch show work'); eq(sw.headerText, 'price × qty', 'scratch header names');
  const mw = N.evaluateNotes('monthly rent = 1500\nmonthly rent * 2', { override: { line: 0, value: Dec.of(1000) } }); eq(mw.lines[1].text, '2,000', 'what-if multi-word variable');
  const uw = N.evaluateNotes('d = 5 km\nd * 2', { override: { line: 0, value: new C.Q(Dec.of(8), U.unit('km')) } }); eq(uw.lines[1].text, '16 km', 'what-if keeps units');
  eq(W.explain('d * 2 + 1 km', { vars: { d: new C.Q(Dec.of(5), U.unit('km')) }, units: true }).resultText, '11 km', 'work with quantities');
}

console.log(`${pass} passed, ${fail} failed (${pass + fail} assertions)`);
process.exit(fail ? 1 : 0);
