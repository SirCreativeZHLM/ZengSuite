const T = require('./_h'); const { ZN, wb, sheet } = T; const CF = ZN.cf;
const eq = (g, w, l) => (Array.isArray(w) ? T.ok(JSON.stringify(g) === JSON.stringify(w), l + ' ' + JSON.stringify(g)) : T.eq(g, w, l));
const fill = (a, rows) => { const p = ZN.parseA1(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v !== null) T.setRaw(ZN.addr(p.r + i, p.c + j), v); })); };
const rule = (o) => Object.assign({ id: 'r' + Math.random(), ranges: [[0, 0, 9, 0]], priority: 1 }, o);
const ev = (r1 = 0, c1 = 0, r2 = 99, c2 = 9) => CF.evaluate(wb, sheet, r1, c1, r2, c2);
const K = (r, c) => r * 16384 + c;
fill('A1', [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]]);
// cell rules
sheet.cf = [rule({ type: 'cell', op: 'gt', v1: 8, style: { bg: '#ff0000', b: 1 } })];
let m = ev(); eq(m.size, 2, 'gt 8 hits 9,10'); eq(m.get(K(8, 0)).bg, '#ff0000', 'bg'); eq(m.get(K(9, 0)).b, 1, 'bold'); T.ok(!m.has(K(7, 0)), '8 not >8');
sheet.cf = [rule({ type: 'cell', op: 'between', v1: 3, v2: 5, style: { fc: '#00f' } })]; eq(ev().size, 3, 'between 3..5');
sheet.cf = [rule({ type: 'cell', op: 'notBetween', v1: 3, v2: 5, style: { fc: '#00f' } })]; eq(ev().size, 7, 'notBetween');
sheet.cf = [rule({ type: 'cell', op: 'eq', v1: '=A1+1', style: { bg: '#0f0' } })]; m = ev(); eq(m.size, 0, 'relative formula operand never equal'); 
sheet.cf = [rule({ type: 'cell', op: 'eq', v1: 5, style: { bg: '#0f0' } })]; eq([...ev().keys()], [K(4, 0)], 'eq 5');
sheet.cf = [rule({ type: 'cell', op: 'le', v1: '2', style: { bg: '#0f0' } })]; eq(ev().size, 2, 'string numeric operand');
// window clipping
sheet.cf = [rule({ type: 'cell', op: 'gt', v1: 0, style: { bg: '#0f0' } })]; eq(ev(2, 0, 4, 0).size, 3, 'window clip');
// top / bottom / pct
sheet.cf = [rule({ type: 'top', n: 3, style: { bg: '#0f0' } })]; m = ev(); eq([...m.keys()].sort((a, b) => a - b), [K(7, 0), K(8, 0), K(9, 0)], 'top 3');
sheet.cf = [rule({ type: 'top', n: 2, bottom: true, style: { bg: '#0f0' } })]; eq(ev().size, 2, 'bottom 2'); T.ok(ev().has(K(0, 0)), 'bottom includes 1');
sheet.cf = [rule({ type: 'top', n: 30, pct: true, style: { bg: '#0f0' } })]; eq(ev().size, 3, 'top 30% of 10 = 3');
// avg
sheet.cf = [rule({ type: 'avg', above: true, style: { bg: '#0f0' } })]; eq(ev().size, 5, 'above avg 5.5'); sheet.cf = [rule({ type: 'avg', above: false, style: { bg: '#0f0' } })]; eq(ev().size, 5, 'below avg');
// dupes
fill('B1', [['a'], ['b'], ['A'], ['c'], [1], [1], [null], [null]]);
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'dupes', style: { bg: '#f00' } })]; m = ev(); eq([...m.keys()].sort((a, b) => a - b), [K(0, 1), K(2, 1), K(4, 1), K(5, 1)], 'duplicates case-insens, blanks ignored');
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'dupes', unique: true, style: { bg: '#f00' } })]; eq(ev().size, 2, 'unique b,c');
// text
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'text', textOp: 'begins', text: 'A', style: { bg: '#f00' } })]; eq(ev().size, 2, 'begins A (a, A)');
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'text', textOp: 'notContains', text: 'a', style: { bg: '#f00' } })]; eq(ev().size, 8, 'notContains a');
// blanks / errors
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'blanks', style: { bg: '#f00' } })]; eq(ev().size, 4, 'blanks');
sheet.cf = [rule({ ranges: [[0, 1, 9, 1]], type: 'noblanks', style: { bg: '#f00' } })]; eq(ev().size, 6, 'noblanks');
T.set('C1', '=1/0'); T.set('C2', '5');
sheet.cf = [rule({ ranges: [[0, 2, 4, 2]], type: 'errors', style: { bg: '#f00' } })]; eq([...ev().keys()], [K(0, 2)], 'errors'); sheet.cf = [rule({ ranges: [[0, 2, 1, 2]], type: 'noerrors', style: { bg: '#f00' } })]; eq([...ev().keys()], [K(1, 2)], 'noerrors');
// formula
sheet.cf = [rule({ ranges: [[0, 0, 9, 1]], type: 'formula', formula: 'MOD($A1,2)=0', style: { bg: '#f00' } })]; m = ev(0, 0, 9, 1); eq(m.size, 10, 'formula rows even, cols A+B'); T.ok(m.has(K(1, 1)) && !m.has(K(0, 1)), 'formula relative row translate');
// date
CF.setToday(45000);
T.setRaw('D1', 45000); T.setRaw('D2', 44999); T.setRaw('D3', 45001); T.setRaw('D4', 44990); T.setRaw('D5', 40000);
const dr = (when) => { sheet.cf = [rule({ ranges: [[0, 3, 5, 3]], type: 'date', when, style: { bg: '#f00' } })]; return [...ev(0, 3, 5, 3).keys()].map((k) => (k - 3) / 16384).sort(); };
eq(dr('today'), [0], 'today'); eq(dr('yesterday'), [1], 'yesterday'); eq(dr('tomorrow'), [2], 'tomorrow'); eq(dr('last7'), [0, 1], 'last7');
eq(dr('thisyear').length, 4, 'thisyear'); CF.setToday(null);
// priority + stop + merging
sheet.cf = [rule({ type: 'cell', op: 'gt', v1: 0, priority: 2, style: { bg: '#0000ff', fc: '#ffffff' } }), rule({ type: 'cell', op: 'gt', v1: 5, priority: 1, style: { bg: '#ff0000' } })];
m = ev(); eq(m.get(K(9, 0)).bg, '#ff0000', 'priority 1 wins bg'); eq(m.get(K(9, 0)).fc, '#ffffff', 'lower priority fills remaining props'); eq(m.get(K(0, 0)).bg, '#0000ff', 'low rule alone');
sheet.cf[1].stop = true; m = ev(); T.ok(m.get(K(9, 0)).fc === undefined, 'stop blocks later rules');
// colour scale
sheet.cf = [rule({ type: 'colorScale', stops: [{ type: 'min', color: '#000000' }, { type: 'max', color: '#ffffff' }] })]; fill('E1', [[0], [50], [100]]);
sheet.cf[0].ranges = [[0, 4, 2, 4]]; m = ev(); eq(m.get(K(0, 4)).bg, '#000000', 'scale min'); eq(m.get(K(1, 4)).bg, '#808080', 'scale midpoint'); eq(m.get(K(2, 4)).bg, '#ffffff', 'scale max');
sheet.cf = [rule({ ranges: [[0, 4, 2, 4]], type: 'colorScale', stops: [{ type: 'min', color: '#ff0000' }, { type: 'percentile', v: 50, color: '#ffff00' }, { type: 'max', color: '#00ff00' }] })]; m = ev();
eq(m.get(K(1, 4)).bg, '#ffff00', '3-stop mid'); eq(CF.mix('#ff0000', '#00ff00', 0.5), '#808000', 'mix');
sheet.cf = [rule({ ranges: [[0, 4, 2, 4]], type: 'colorScale', stops: [{ type: 'num', v: 0, color: '#000000' }, { type: 'num', v: 200, color: '#ffffff' }] })]; eq(ev().get(K(2, 4)).bg, '#808080', 'num stops');
// data bar
sheet.cf = [rule({ ranges: [[0, 4, 2, 4]], type: 'dataBar', color: '#638ec6', min: { type: 'min' }, max: { type: 'max' }, showValue: false })]; m = ev();
eq(m.get(K(1, 4)).bar.pct, 0.5, 'bar pct'); eq(m.get(K(2, 4)).bar.pct, 1, 'bar full'); eq(m.get(K(1, 4)).showValue, false, 'hide value');
fill('F1', [[-50], [0], [100]]); sheet.cf = [rule({ ranges: [[0, 5, 2, 5]], type: 'dataBar', color: '#00f', min: { type: 'min' }, max: { type: 'max' } })]; m = ev();
eq(m.get(K(0, 5)).bar.neg, true, 'neg bar'); eq(m.get(K(0, 5)).bar.zeroAt, 1 / 3, 'axis position'); eq(m.get(K(0, 5)).bar.pct, 1 / 3, 'neg width'); eq(m.get(K(2, 5)).bar.pct, 2 / 3, 'pos width');
// icon sets
fill('G1', [[1], [34], [67], [100]]);
sheet.cf = [rule({ ranges: [[0, 6, 3, 6]], type: 'iconSet', name: '3Arrows', thresholds: [{ type: 'percent', v: 33, gte: true }, { type: 'percent', v: 67, gte: true }] })]; m = ev();
eq([0, 1, 2, 3].map((r) => m.get(K(r, 6)).icon.idx), [0, 1, 1, 2], 'icon idx 3 arrows (percent of min..max)');
sheet.cf[0].reverse = true; m = ev(); eq([0, 1, 2, 3].map((r) => m.get(K(r, 6)).icon.idx), [2, 1, 1, 0], 'reverse');
sheet.cf = [rule({ ranges: [[0, 6, 3, 6]], type: 'iconSet', name: '4Rating', thresholds: [{ type: 'num', v: 10 }, { type: 'num', v: 50 }, { type: 'num', v: 90 }], showValue: false })]; m = ev();
eq([0, 1, 2, 3].map((r) => m.get(K(r, 6)).icon.idx), [0, 1, 2, 3], 'num thresholds 4 icons'); eq(m.get(K(0, 6)).icon.n, 4, 'n=4');
sheet.cf = [rule({ ranges: [[0, 6, 3, 6]], type: 'iconSet', name: '3Flags', thresholds: [{ type: 'percentile', v: 50 }, { type: 'percentile', v: 90 }] })]; m = ev(); eq(m.get(K(3, 6)).icon.idx, 2, 'percentile top');
// cache invalidation after edit
sheet.cf = [rule({ ranges: [[0, 0, 9, 0]], type: 'top', n: 1, style: { bg: '#0f0' } })]; eq([...ev().keys()], [K(9, 0)], 'top1 before'); T.setRaw('A1', 99); eq([...ev().keys()], [K(0, 0)], 'cache invalidated by edit');
// whole column range
sheet.cf = [rule({ ranges: [[0, 0, 1048575, 0]], type: 'top', n: 1, style: { bg: '#0f0' } })]; eq(ev().size, 1, 'whole column range');
// icon svg
for (const set of CF.iconSets) { const n = parseInt(set[0], 10); for (let i = 0; i < n; i++) { const s = CF.iconSVG(set, i, n, 16); if (!(s.startsWith('<svg') && s.endsWith('</svg>') && s.includes('viewBox="0 0 16 16"'))) T.ok(false, 'icon ' + set + i); } }
T.ok(true, 'all icon svgs'); T.ok(CF.iconSVG('3Arrows', 2, 3, 20).includes('width="20"'), 'size'); T.ok(CF.iconSVG('3Arrows', 0, 3).includes('#ff453a') && CF.iconSVG('3Arrows', 2, 3).includes('#30c452'), 'red/green');
T.ok(CF.iconSVG('3TrafficLights', 0, 3) !== CF.iconSVG('3TrafficLights', 1, 3), 'icons differ');
// validate / describe / default
T.ok(CF.validateRule(rule({ type: 'cell', op: 'gt', v1: 1 })) === null, 'valid'); T.ok(CF.validateRule(rule({ type: 'cell', op: 'gt' })), 'missing value'); T.ok(CF.validateRule(rule({ type: 'nope' })), 'bad type'); T.ok(CF.validateRule(rule({ type: 'blanks', ranges: [] })), 'no ranges');
T.ok(CF.validateRule(rule({ type: 'formula', formula: '1+' })), 'bad formula'); T.ok(CF.validateRule(Object.assign(CF.defaultRule('colorScale'), { ranges: [[0, 0, 1, 1]] })) === null, 'default scale valid');
T.ok(/greater than 5/.test(CF.describe(rule({ type: 'cell', op: 'gt', v1: 5 }))), 'describe cell'); T.ok(/Top 3/.test(CF.describe(rule({ type: 'top', n: 3 }))), 'describe top');
eq(CF.defaultRule('dataBar').type, 'dataBar', 'defaultRule');
// perf: 100k rows
const big = ZN.newWorkbook(); const bs = big.sheets[0]; big.tx('fill', () => { for (let i = 0; i < 100000; i++) big.setValue(bs, i, 0, i % 1000); }); bs.cf = [rule({ ranges: [[0, 0, 1048575, 0]], type: 'colorScale', stops: [{ type: 'min', color: '#fff' }, { type: 'max', color: '#f00' }] })];
let t0 = Date.now(); CF.evaluate(big, bs, 0, 0, 40, 0); const first = Date.now() - t0; t0 = Date.now(); for (let i = 0; i < 20; i++) CF.evaluate(big, bs, i, 0, i + 40, 0); const rest = Date.now() - t0; T.ok(rest < 300 && first < 3000, 'perf cached scroll (' + first + 'ms/' + rest + 'ms)');
T.done('cf');
