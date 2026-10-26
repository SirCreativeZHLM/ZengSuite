const T = require('./_h'); const { ZN } = T;
const f = (fm, w, tol) => T.f(fm, w, undefined, tol);
// SUM semantics
f('=SUM(1,2,3)', 6); f('=SUM("3",4)', 7); f('=SUM(TRUE,1)', 2); f('=SUM("a")', '#VALUE!'); f('=SUM(1,#N/A)', '#N/A');
T.set('A1', 1); T.setRaw('A2', 'x'); T.setRaw('A3', true); T.set('A4', 4); T.setRaw('B1', ZN.E.DIV0); T.set('B2', 5);
f('=SUM(A1:A4)', 5); f('=SUM(A1:A4,10)', 15); f('=SUM(B1:B2)', '#DIV/0!'); f('=SUM({1,2;3,4})', 10); f('=SUM()', '#VALUE!');
f('=PRODUCT(2,3,4)', 24); f('=PRODUCT(A1:A4)', 4); f('=SUMSQ(3,4)', 25);
{ const s = T.sheet; for (let i = 0; i < 20000; i++) T.setRaw('D' + (i + 1), 1); const t = Date.now(); f('=SUM(D:D)', 20000); T.ok(Date.now() - t < 500, 'SUM whole column fast'); }
const X = '{2,3,9,1,8,7,5}', Y = '{6,5,11,7,5,4,4}';
f('=SUMX2MY2(' + X + ',' + Y + ')', -55); f('=SUMX2PY2(' + X + ',' + Y + ')', 521); f('=SUMXMY2(' + X + ',' + Y + ')', 79); f('=SUMXMY2({1,2},{1,2,3})', '#N/A');
f('=SERIESSUM(2,0,1,{1,1,1})', 7); f('=SERIESSUM(2,1,2,{1,1})', 10);
// basic
f('=ABS(-5)', 5); f('=SIGN(-3)', -1); f('=SIGN(0)', 0); f('=SQRT(16)', 4); f('=SQRT(-1)', '#NUM!'); f('=SQRTPI(1)', 1.7724538509055159); f('=POWER(2,10)', 1024); f('=POWER(0,0)', '#NUM!'); f('=POWER(0,-1)', '#DIV/0!');
f('=EXP(1)', Math.E); f('=LN(EXP(2))', 2); f('=LN(0)', '#NUM!'); f('=LOG(8,2)', 3); f('=LOG(100)', 2); f('=LOG10(1000)', 3); f('=LOG(10,1)', '#DIV/0!');
f('=MOD(3,2)', 1); f('=MOD(-3,2)', 1); f('=MOD(3,-2)', -1); f('=MOD(-3,-2)', -1); f('=MOD(5,0)', '#DIV/0!'); f('=QUOTIENT(5,2)', 2); f('=QUOTIENT(-10,3)', -3);
f('=INT(8.9)', 8); f('=INT(-8.9)', -9); f('=TRUNC(8.9)', 8); f('=TRUNC(-8.9)', -8); f('=TRUNC(PI(),3)', 3.141);
// rounding
f('=ROUND(2.15,1)', 2.2); f('=ROUND(2.149,1)', 2.1); f('=ROUND(-1.475,2)', -1.48); f('=ROUND(21.5,-1)', 20); f('=ROUND(626.3,-3)', 1000); f('=ROUND(1.98,-1)', 0); f('=ROUND(-50.55,-2)', -100); f('=ROUND(2.675,2)', 2.68); f('=ROUND(1.005,2)', 1.01); f('=ROUND(0.5,0)', 1); f('=ROUND(-0.5,0)', -1);
f('=ROUNDUP(3.2,0)', 4); f('=ROUNDUP(76.9,0)', 77); f('=ROUNDUP(3.14159,3)', 3.142); f('=ROUNDUP(-3.14159,1)', -3.2); f('=ROUNDUP(31415.92654,-2)', 31500); f('=ROUNDUP(0.1+0.2,1)', 0.3);
f('=ROUNDDOWN(3.2,0)', 3); f('=ROUNDDOWN(76.9,0)', 76); f('=ROUNDDOWN(3.14159,3)', 3.141); f('=ROUNDDOWN(-3.14159,1)', -3.1); f('=ROUNDDOWN(31415.92654,-2)', 31400);
f('=MROUND(10,3)', 9); f('=MROUND(-10,-3)', -9); f('=MROUND(1.3,0.2)', 1.4); f('=MROUND(5,-2)', '#NUM!');
f('=CEILING(2.5,1)', 3); f('=CEILING(-2.5,-2)', -4); f('=CEILING(-2.5,2)', -2); f('=CEILING(0.234,0.01)', 0.24); f('=CEILING(2.5,-2)', '#NUM!');
f('=CEILING.MATH(24.3,5)', 25); f('=CEILING.MATH(6.7)', 7); f('=CEILING.MATH(-8.1,2)', -8); f('=CEILING.MATH(-5.5,2,-1)', -6);
f('=FLOOR(3.7,2)', 2); f('=FLOOR(-2.5,-2)', -2); f('=FLOOR(2.5,-2)', '#NUM!'); f('=FLOOR(1.58,0.1)', 1.5); f('=FLOOR(0.234,0.01)', 0.23); f('=FLOOR(3,0)', '#DIV/0!');
f('=FLOOR.MATH(24.3,5)', 20); f('=FLOOR.MATH(-8.1,2)', -10); f('=FLOOR.MATH(-5.5,2,-1)', -4);
f('=CEILING.PRECISE(4.3)', 5); f('=CEILING.PRECISE(-4.3)', -4); f('=ISO.CEILING(4.3)', 5); f('=FLOOR.PRECISE(-3.2,-1)', -4); f('=FLOOR.PRECISE(3.2)', 3);
f('=EVEN(1.5)', 2); f('=EVEN(3)', 4); f('=EVEN(2)', 2); f('=EVEN(-1)', -2); f('=ODD(1.5)', 3); f('=ODD(3)', 3); f('=ODD(2)', 3); f('=ODD(-1)', -1); f('=ODD(-2)', -3);
// combinatorics
f('=FACT(5)', 120); f('=FACT(1.9)', 1); f('=FACT(0)', 1); f('=FACT(-1)', '#NUM!'); f('=FACTDOUBLE(6)', 48); f('=FACTDOUBLE(7)', 105);
f('=GCD(5,2)', 1); f('=GCD(24,36)', 12); f('=GCD(5,0)', 5); f('=GCD(24,36,60)', 12); f('=LCM(5,2)', 10); f('=LCM(24,36)', 72); f('=LCM(A1:A4,3)', 12);
f('=COMBIN(8,2)', 28); f('=COMBIN(5,0)', 1); f('=COMBIN(2,5)', '#NUM!'); f('=COMBINA(4,3)', 20); f('=COMBINA(10,3)', 220); f('=PERMUT(100,3)', 970200); f('=PERMUT(3,2)', 6); f('=PERMUTATIONA(3,2)', 9); f('=MULTINOMIAL(2,3,4)', 1260);
// trig
f('=SIN(PI()/2)', 1); f('=COS(0)', 1); f('=TAN(PI()/4)', 1); f('=ASIN(1)', Math.PI / 2); f('=ACOS(-1)', Math.PI); f('=ASIN(2)', '#NUM!'); f('=ATAN(1)', Math.PI / 4); f('=ATAN2(1,1)', Math.PI / 4); f('=ATAN2(-1,-1)', -3 * Math.PI / 4); f('=ATAN2(0,0)', '#DIV/0!');
f('=SINH(0)', 0); f('=COSH(0)', 1); f('=TANH(0)', 0); f('=ASINH(0)', 0); f('=ACOSH(1)', 0); f('=ACOSH(0.5)', '#NUM!'); f('=ATANH(0)', 0); f('=SEC(0)', 1); f('=CSC(PI()/2)', 1); f('=COT(PI()/4)', 1); f('=COT(0)', '#DIV/0!');
f('=ASEC(2)', Math.PI / 3); f('=ACSC(2)', Math.PI / 6); f('=ACOT(1)', Math.PI / 4); f('=ACOTH(6)', 0.168236118, 1e-8); f('=SECH(0)', 1); f('=COTH(1)', 1.313035285, 1e-8); f('=CSCH(1)', 0.850918128, 1e-8);
f('=DEGREES(PI())', 180); f('=RADIANS(180)', Math.PI); f('=PI()', Math.PI);
// roman / base
f('=ROMAN(499,0)', 'CDXCIX'); f('=ROMAN(499,1)', 'LDVLIV'); f('=ROMAN(499,2)', 'XDIX'); f('=ROMAN(499,3)', 'VDIV'); f('=ROMAN(499,4)', 'ID'); f('=ROMAN(1999)', 'MCMXCIX'); f('=ROMAN(4000)', '#VALUE!');
f('=ARABIC("LVII")', 57); f('=ARABIC("MCMXII")', 1912); f('=ARABIC("-IV")', -4); f('=BASE(7,2)', '111'); f('=BASE(100,16)', '64'); f('=BASE(15,2,10)', '0000001111'); f('=DECIMAL("FF",16)', 255); f('=DECIMAL("111",2)', 7); f('=DECIMAL("Z",10)', '#NUM!');
f('=BIN2DEC(1100100)', 100); f('=BIN2DEC(1111111111)', -1); f('=BIN2DEC(2)', '#NUM!'); f('=BIN2HEX(11111011,4)', '00FB'); f('=BIN2HEX(1111111111)', 'FFFFFFFFFF'); f('=BIN2OCT(1001)', '11');
f('=DEC2BIN(9,6)', '001001'); f('=DEC2BIN(-100)', '1110011100'); f('=DEC2BIN(512)', '#NUM!'); f('=DEC2HEX(255)', 'FF'); f('=DEC2HEX(-54)', 'FFFFFFFFCA'); f('=DEC2OCT(58)', '72');
f('=HEX2BIN("F")', '1111'); f('=HEX2DEC("A5")', 165); f('=HEX2DEC("FFFFFFFF5B")', -165); f('=HEX2OCT("F")', '17'); f('=OCT2BIN(3)', '11'); f('=OCT2DEC(54)', 44); f('=OCT2HEX(100)', '40');
f('=BITAND(1,5)', 1); f('=BITOR(23,10)', 31); f('=BITXOR(5,3)', 6); f('=BITLSHIFT(4,2)', 16); f('=BITRSHIFT(13,2)', 3); f('=BITAND(-1,2)', '#NUM!');
f('=DELTA(5,4)', 0); f('=DELTA(5,5)', 1); f('=DELTA(0.5)', 0); f('=GESTEP(5,4)', 1); f('=GESTEP(-1)', 0);
// special functions
f('=ERF(1)', 0.8427007929497149); f('=ERF(0,1)', 0.8427007929497149); f('=ERF(0.745)', 0.707929, 1e-6); f('=ERFC(1)', 0.15729920705028513); f('=ERFC(0)', 1); f('=ERF.PRECISE(1)', 0.8427007929497149); f('=ERFC(3)', 2.209049699858544e-5, 1e-12);
f('=GAMMA(2.5)', 1.329340388179137); f('=GAMMA(5)', 24); f('=GAMMA(-3)', '#NUM!'); f('=GAMMALN(4)', Math.log(6), 1e-12); f('=GAMMALN(10)', Math.log(362880), 1e-12); f('=GAMMALN.PRECISE(0.5)', 0.5 * Math.log(Math.PI), 1e-12);
// matrices
f('=MMULT({1,2;3,4},{5,6;7,8})', [[19, 22], [43, 50]]); f('=MMULT({1,2},{1,2})', '#VALUE!'); f('=MDETERM({1,2;3,4})', -2); f('=MDETERM({3,6,1;1,1,0;3,10,2})', 1);
f('=MINVERSE({4,-1;2,0})', [[0, 0.5], [-1, 2]]); f('=MINVERSE({1,2;2,4})', '#NUM!'); f('=MUNIT(2)', [[1, 0], [0, 1]]);
// complex
f('=COMPLEX(3,4)', '3+4i'); f('=COMPLEX(3,4,"j")', '3+4j'); f('=COMPLEX(0,1)', 'i'); f('=COMPLEX(5,0)', '5'); f('=COMPLEX(0,-1)', '-i');
f('=IMSUM("3+4i","5-3i")', '8+i'); f('=IMSUB("13+4i","5+3i")', '8+i'); f('=IMPRODUCT("3+4i","5-3i")', '27+11i'); f('=IMDIV("-238+240i","10+24i")', '5+12i'); f('=IMABS("5+12i")', 13);
f('=IMREAL("6-9i")', 6); f('=IMAGINARY("3+4i")', 4); f('=IMAGINARY("4")', 0); f('=IMARGUMENT("3+4i")', 0.927295218, 1e-8); f('=IMCONJUGATE("3+4i")', '3-4i'); f('=IMSQRT("3+4i")', '2+i'); f('=IMPOWER("2+3i",3)', '-46+9i');
f('=IMREAL(IMEXP("1+i"))', 1.46869393991589, 1e-12); f('=IMAGINARY(IMEXP("1+i"))', 2.28735528717884, 1e-12); f('=IMREAL(IMLN("3+4i"))', Math.log(5), 1e-12); f('=IMABS("bad")', '#NUM!'); f('=IMDIV("1","0")', '#NUM!');
// CONVERT
f('=CONVERT(1,"lbm","kg")', 0.45359237); f('=CONVERT(68,"F","C")', 20); f('=CONVERT(2.5,"ft","sec")', '#N/A'); f('=CONVERT(1,"mi","km")', 1.609344); f('=CONVERT(1,"hr","mn")', 60); f('=CONVERT(100,"C","K")', 373.15); f('=CONVERT(1,"in","cm")', 2.54); f('=CONVERT(1,"gal","l")', 3.785411784); f('=CONVERT(1,"byte","bit")', 8); f('=CONVERT(1,"day","hr")', 24); f('=CONVERT(1,"kbyte","byte")', 1000);
// random (seedable) + array lifting
{ const old = ZN.rand; ZN.rand = () => 0.5; f('=RAND()', 0.5); f('=RANDBETWEEN(1,10)', 6); f('=RANDBETWEEN(5,1)', '#NUM!'); ZN.rand = old; }
T.ok(ZN.fn.get('RAND').volatile && ZN.fn.get('RANDBETWEEN').volatile, 'volatile flags');
f('=ABS({-1,2,-3})', [[1, 2, 3]]); f('=ROUND({1.26,2.34},1)', [[1.3, 2.3]]); f('=ROUND({1.26;2.34},{0;1})', [[1], [2.3]]);
{ let n = 0, bad = []; for (const [k, d] of ZN.fn.registry) if (['Math & Trig', 'Engineering'].includes(d.cat)) { n++; if (!d.hint || !d.desc) bad.push(k); } T.ok(bad.length === 0, 'hint/desc present ' + bad); T.ok(n >= 120, 'math function count ' + n); }
T.done('math');
