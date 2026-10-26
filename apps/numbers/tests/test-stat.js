const T = require('./_h'); const { ZN } = T;
const f = (fm, w, tol) => T.f(fm, w, undefined, tol);
const S = '{1345,1301,1368,1322,1310,1370,1318,1350,1303,1299}';
// basic aggregates & range semantics
T.set('A1', 10); T.setRaw('A2', 'x'); T.setRaw('A3', true); T.set('A4', 20); T.setRaw('B1', ZN.E.NA);
f('=AVERAGE(A1:A4)', 15); f('=AVERAGE(1,2,3,4)', 2.5); f('=AVERAGE("a")', '#VALUE!'); f('=AVERAGE(B1:B1)', '#N/A'); f('=AVERAGE(C1:C2)', '#DIV/0!');
f('=AVERAGEA(A1:A4)', 31 / 4); f('=MAX(A1:A4)', 20); f('=MIN(A1:A4)', 10); f('=MAX(C1:C2)', 0); f('=MAXA(A1:A4)', 20); f('=MINA(A1:A4)', 0); f('=MIN(3,"2")', 2);
f('=COUNT(A1:A4)', 2); f('=COUNT(1,"3","x",TRUE)', 3); f('=COUNT(B1)', 0); f('=COUNTA(A1:A4,B1)', 5); f('=COUNTBLANK(A1:C4)', 12 - 5); f('=COUNTBLANK(A1:A4)', 0);
f('=MEDIAN(1,2,3,4,5)', 3); f('=MEDIAN(1,2,3,4,5,6)', 3.5); f('=MEDIAN(C1:C2)', '#NUM!'); f('=MODE.SNGL({5.6,4,4,3,2,4})', 4); f('=MODE({1,2,3})', '#N/A'); f('=MODE.MULT({1,2,2,3,3,4})', [[2], [3]]);
f('=LARGE({3,4,5,2,3,4,5,6,4,7},3)', 5); f('=SMALL({3,4,5,2,3,4,5,6,4,7},4)', 4); f('=LARGE({1,2},3)', '#NUM!'); f('=LARGE({1,2,3},{1,2})', [[3, 2]]);
f('=RANK(3.5,{7,3.5,3.5,1,2})', 2); f('=RANK.EQ(7,{7,3.5,3.5,1,2})', 1); f('=RANK(1,{7,3.5,3.5,1,2},1)', 1); f('=RANK.AVG(3.5,{7,3.5,3.5,1,2})', 2.5); f('=RANK(99,{1,2})', '#N/A');
// percentiles
f('=PERCENTILE({1,2,3,4},0.3)', 1.9); f('=PERCENTILE.INC({1,2,3,4},1)', 4); f('=PERCENTILE.INC({1,2,3,4},1.5)', '#NUM!'); f('=PERCENTILE.EXC({1,2,3,4},0.25)', 1.25);
f('=QUARTILE({1,2,4,7,8,9,10,12},1)', 3.5); f('=QUARTILE.INC({1,2,4,7,8,9,10,12},3)', 9.25); f('=QUARTILE({1,2,4,7,8,9,10,12},5)', '#NUM!');
f('=QUARTILE.EXC({6,7,15,36,39,40,41,42,43,47,49},1)', 15); f('=QUARTILE.EXC({6,7,15,36,39,40,41,42,43,47,49},3)', 43);
const P = '{13,12,11,8,4,3,2,1,1,1}'; f('=PERCENTRANK(' + P + ',2)', 0.333); f('=PERCENTRANK.INC(' + P + ',4)', 0.555); f('=PERCENTRANK(' + P + ',8)', 0.666); f('=PERCENTRANK(' + P + ',5)', 0.583); f('=PERCENTRANK(' + P + ',5,6)', 0.583333); f('=PERCENTRANK(' + P + ',99)', '#N/A');
f('=PERCENTRANK.EXC({1,2,3,6,6,6,7,8,9},7)', 0.7); f('=TRIMMEAN({4,5,6,7,2,3,4,5,1,2,3},0.2)', 34 / 9);
// dispersion
f('=STDEV(' + S + ')', 27.46391572, 1e-8); f('=STDEV.S(' + S + ')', 27.46391572, 1e-8); f('=STDEV.P(' + S + ')', 26.05455814, 1e-8); f('=STDEVP(' + S + ')', 26.05455814, 1e-8);
f('=VAR.S({1,2,3,4})', 5 / 3); f('=VAR.P({1,2,3,4})', 1.25); f('=VAR(5)', '#DIV/0!'); f('=VARP(5)', 0); f('=VARA(A1:A4)', 100 / 3 * 0 + (() => { const v = [10, 0, 1, 20]; const m = 31 / 4; return v.reduce((s, x) => s + (x - m) ** 2, 0) / 3; })());
f('=STDEVA(1,2,3)', 1); f('=STDEVPA(1,3)', 1); f('=VARPA(1,3)', 1);
f('=DEVSQ({4,5,8,7,11,4,3})', 48); f('=AVEDEV({4,5,6,7,5,4,3})', 1.020408163, 1e-8); f('=GEOMEAN({4,5,8,7,11,4,3})', 5.476987, 1e-6); f('=HARMEAN({4,5,8,7,11,4,3})', 5.028376, 1e-6); f('=GEOMEAN({1,-1})', '#NUM!');
const K = '{3,4,5,2,3,4,5,6,4,7}'; f('=KURT(' + K + ')', -0.151799637, 1e-8); f('=SKEW(' + K + ')', 0.359543, 1e-6); f('=SKEW.P(' + K + ')', 0.303193, 1e-6); f('=KURT({1,2,3})', '#DIV/0!');
// paired
const A = '{3,2,4,5,6}', B = '{9,7,12,15,17}'; f('=COVAR(' + A + ',' + B + ')', 5.2); f('=COVARIANCE.P(' + A + ',' + B + ')', 5.2); f('=COVARIANCE.S(' + A + ',' + B + ')', 6.5); f('=CORREL(' + A + ',' + B + ')', 0.997054486, 1e-8); f('=PEARSON({9,7,5,3,1},{10,6,1,5,3})', 0.699379, 1e-6); f('=CORREL({1,2},{1,2,3})', '#N/A');
const Y = '{2,3,9,1,8,7,5}', X = '{6,5,11,7,5,4,4}'; f('=RSQ(' + Y + ',' + X + ')', 0.05795, 1e-5); f('=SLOPE(' + Y + ',' + X + ')', 0.305556, 1e-6); f('=INTERCEPT({2,3,9,1,8},{6,5,11,7,5})', 0.0483871, 1e-6); f('=STEYX(' + Y + ',' + X + ')', 3.305719, 1e-6);
f('=FORECAST(30,{6,7,9,15,21},{20,28,31,38,40})', 10.60725, 1e-5); f('=FORECAST.LINEAR(2,{2,4,6},{1,2,3})', 4); f('=FORECAST(1,{1,1},{2,2})', '#DIV/0!');
// regression
f('=LINEST({1,9,5,7},{0,4,2,3})', [[2, 1]]); f('=LINEST({2;4;5;4;5},{1;2;3;4;5},TRUE,TRUE)', [[0.6, 2.2], [Math.sqrt(0.08), Math.sqrt(0.88)], [0.6, Math.sqrt(0.8)], [4.5, 3], [3.6, 2.4]]);
f('=LINEST({6;5;10;9},{1,1;2,0;3,1;4,0})', [[3, 2, 1]]); f('=LINEST({2,4,6},{1,2,3},FALSE)', [[2, 0]]); f('=LINEST({2;4;5;4;5})', [[0.6, 2.2]]);
f('=LOGEST({2,6,18,54},{0,1,2,3})', [[3, 2]]); f('=TREND({1,9,5,7},{0,4,2,3},5)', 11); f('=TREND({2,4,6},{1,2,3},{4,5})', [[8, 10]]); f('=GROWTH({2,6,18,54},{0,1,2,3},4)', 162); f('=GROWTH({2,6,18,54},{0,1,2,3})', [[2, 6, 18, 54]]);
f('=FREQUENCY({79,85,78,85,50,81,95,88,97},{70,79,89})', [[1], [2], [4], [2]]);
f('=PROB({0,1,2,3},{0.2,0.3,0.1,0.4},2)', 0.1); f('=PROB({0,1,2,3},{0.2,0.3,0.1,0.4},1,3)', 0.8); f('=PROB({0,1},{0.5,0.6},1)', '#NUM!');
f('=STANDARDIZE(42,40,1.5)', 1.333333333); f('=FISHER(0.75)', 0.972955, 1e-6); f('=FISHERINV(0.972955)', 0.75, 1e-6); f('=FISHER(1)', '#NUM!');
// normal family
f('=NORM.S.DIST(0,TRUE)', 0.5); f('=NORM.S.DIST(0,FALSE)', 0.3989422804014327); f('=NORM.S.DIST(1.96,TRUE)', 0.9750021048517795); f('=NORMSDIST(1)', 0.8413447460685429);
f('=NORM.DIST(42,40,1.5,TRUE)', 0.90878878, 1e-8); f('=NORM.DIST(42,40,1.5,FALSE)', 0.10934005, 1e-7); f('=NORMDIST(40,40,2,TRUE)', 0.5); f('=NORM.DIST(1,0,0,TRUE)', '#NUM!');
f('=NORM.S.INV(0.975)', 1.959963984540054); f('=NORMSINV(0.5)', 0); f('=NORM.INV(0.975,10,2)', 10 + 2 * 1.959963984540054); f('=NORM.S.INV(1)', '#NUM!'); f('=NORM.S.INV(1E-10)', -6.361340902404056, 1e-9);
f('=GAUSS(2)', 0.4772498681, 1e-9); f('=PHI(0.75)', 0.301137432, 1e-8); f('=CONFIDENCE.NORM(0.05,2.5,50)', 0.692952, 1e-6); f('=CONFIDENCE(0.05,2.5,50)', 0.692952, 1e-6); f('=CONFIDENCE.T(0.05,1,50)', 0.284196855, 1e-8);
f('=LOGNORM.DIST(4,3.5,1.2,TRUE)', 0.039083556, 1e-8); f('=LOGNORM.INV(LOGNORM.DIST(4,3.5,1.2,TRUE),3.5,1.2)', 4, 1e-9); f('=LOGNORMDIST(1,0,1)', 0.5); f('=LOGNORM.DIST(0,0,1,TRUE)', '#NUM!');
// discrete
f('=BINOM.DIST(6,10,0.5,FALSE)', 0.205078125); f('=BINOM.DIST(3,10,0.5,TRUE)', 0.171875); f('=BINOM.DIST(11,10,0.5,TRUE)', '#NUM!'); f('=BINOMDIST(0,5,0.5,FALSE)', 1 / 32); f('=BINOM.INV(6,0.5,0.75)', 4); f('=CRITBINOM(6,0.5,0.75)', 4);
f('=BINOM.DIST.RANGE(10,0.5,3,5)', 582 / 1024); f('=BINOM.DIST.RANGE(10,0.5,3)', 120 / 1024); f('=BINOM.DIST.RANGE(60,0.75,48)', 0.083974, 1e-5);
f('=NEGBINOM.DIST(10,5,0.25,FALSE)', 0.0550487, 1e-6); f('=NEGBINOM.DIST(2,1,0.5,FALSE)', 0.125); f('=NEGBINOM.DIST(2,1,0.5,TRUE)', 0.875); f('=NEGBINOMDIST(2,1,0.5)', 0.125);
f('=HYPGEOM.DIST(1,4,8,20,FALSE)', 0.3632610939, 1e-9); f('=HYPGEOM.DIST(1,4,8,20,TRUE)', 0.465428, 1e-6); f('=HYPGEOMDIST(1,4,8,20)', 0.3632610939, 1e-9);
f('=POISSON.DIST(2,5,FALSE)', 0.084224337, 1e-8); f('=POISSON.DIST(2,5,TRUE)', 0.124652019, 1e-8); f('=POISSON(0,3,FALSE)', Math.exp(-3));
// continuous
f('=EXPON.DIST(0.2,10,TRUE)', 1 - Math.exp(-2)); f('=EXPON.DIST(0.2,10,FALSE)', 10 * Math.exp(-2)); f('=EXPONDIST(1,1,TRUE)', 1 - Math.exp(-1));
f('=WEIBULL.DIST(105,20,100,TRUE)', 0.929581, 1e-6); f('=WEIBULL.DIST(105,20,100,FALSE)', 0.035589, 1e-6); f('=WEIBULL(1,1,1,TRUE)', 1 - Math.exp(-1));
f('=GAMMA.DIST(5,1,2,TRUE)', 1 - Math.exp(-2.5)); f('=GAMMA.DIST(10.00001131,9,2,FALSE)', 0.032639, 1e-5); f('=GAMMA.DIST(10.00001131,9,2,TRUE)', 0.068094, 1e-5); f('=GAMMA.INV(1-EXP(-2.5),1,2)', 5, 1e-9); f('=GAMMAINV(0.5,1,1)', Math.LN2);
f('=BETA.DIST(2,8,10,TRUE,1,3)', 0.6854706, 1e-7); f('=BETA.DIST(2,8,10,FALSE,1,3)', 1.4837646, 1e-6); f('=BETA.INV(0.685470581,8,10,1,3)', 2, 1e-7); f('=BETA.DIST(0.5,2,2,TRUE)', 0.5); f('=BETA.DIST(0.5,2,2,FALSE)', 1.5); f('=BETADIST(0.25,1,1)', 0.25);
f('=CHISQ.DIST(0.5,1,TRUE)', 0.520499878, 1e-8); f('=CHISQ.DIST(0.5,1,FALSE)', 0.439391289, 1e-8); f('=CHISQ.DIST.RT(0.5,1)', 0.479500122, 1e-8); f('=CHIDIST(0.5,1)', 0.479500122, 1e-8); f('=CHISQ.DIST(2,2,TRUE)', 1 - Math.exp(-1));
f('=CHISQ.INV(0.93,1)', 3.283020287, 1e-8); f('=CHISQ.INV.RT(0.05,1)', 3.841458821, 1e-8); f('=CHIINV(0.05,10)', 18.30703805, 1e-7); f('=CHISQ.INV(CHISQ.DIST(7,4,TRUE),4)', 7, 1e-9);
f('=CHISQ.TEST({58,35;11,25;10,23},{45.35,47.65;17.56,18.44;16.09,16.91})', 0.000308192, 1e-7); f('=CHITEST({1,2},{1,2,3})', '#N/A');
f('=T.DIST(60,1,TRUE)', 0.99469533, 1e-8); f('=T.DIST(1,1,TRUE)', 0.75); f('=T.DIST(0,5,TRUE)', 0.5); f('=T.DIST(0,1,FALSE)', 1 / Math.PI); f('=T.DIST.2T(1,1)', 0.5); f('=T.DIST.RT(1,1)', 0.25); f('=TDIST(1,1,2)', 0.5); f('=T.DIST.2T(1.959999998,60)', 0.054645, 1e-6);
f('=T.INV(0.75,2)', 0.816496581, 1e-8); f('=T.INV(0.75,1)', 1); f('=T.INV(0.25,1)', -1); f('=T.INV.2T(0.05,10)', 2.228138852, 1e-8); f('=TINV(0.05,10)', 2.228138852, 1e-8); f('=T.INV.2T(0.546449,60)', 0.606533, 1e-5);
f('=F.DIST(2,2,2,TRUE)', 2 / 3); f('=F.DIST.RT(2,2,2)', 1 / 3); f('=FDIST(2,2,2)', 1 / 3); f('=F.INV.RT(0.01,6,4)', 15.20686486, 1e-8); f('=F.INV(0.01,6,4)', 0.10930991, 1e-7); f('=FINV(0.01,6,4)', 15.20686486, 1e-8); f('=F.INV(F.DIST(3,5,7,TRUE),5,7)', 3, 1e-9);
f('=F.TEST({6,7,9,15,21},{20,28,31,38,40})', 0.648318, 1e-6); f('=Z.TEST({3,6,7,8,6,5,4,2,1,9},4)', 0.090574, 1e-6); f('=ZTEST({3,6,7,8,6,5,4,2,1,9},6)', 0.863043, 1e-6);
f('=T.TEST({3,4,5,8,9,1,2,4,5},{6,19,3,2,14,4,5,17,1},2,1)', 0.196016, 1e-6); f('=TTEST({3,4,5,8,9,1,2,4,5},{6,19,3,2,14,4,5,17,1},1,1)', 0.098008, 1e-6);
f('=T.TEST({1,2,3,4},{2,3,4,9},2,2)', (x) => x > 0 && x < 1); f('=T.TEST({1,2,3,4},{1,2,3,4.5},2,3)', (x) => x > 0.5 && x < 1);
f('=T.TEST({1,2},{1,2},3,1)', '#NUM!');
{ let bad = []; for (const [k, d] of ZN.fn.registry) if (d.cat === 'Statistical' && (!d.hint || !d.desc)) bad.push(k); T.ok(!bad.length, 'hint/desc ' + bad); let n = 0; for (const d of ZN.fn.registry.values()) if (d.cat === 'Statistical') n++; T.ok(n >= 100, 'stat count ' + n); }
T.done('stat');
