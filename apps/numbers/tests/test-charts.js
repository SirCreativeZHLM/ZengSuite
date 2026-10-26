const T = require('./_h'); const { ZN, wb, sheet } = T; const CH = ZN.charts;
const fill = (a, rows) => { const p = ZN.parseA1(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v !== null) T.setRaw(ZN.addr(p.r + i, p.c + j), v); })); };
const cnt = (s, re) => (s.match(re) || []).length;
const balanced = (svg) => { const st = []; const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g; let m; while ((m = re.exec(svg))) { if (m[4] === '/') continue; if (m[1]) { if (st.pop() !== m[2]) return false; } else st.push(m[2]); } return st.length === 0 && svg.startsWith('<svg') && svg.endsWith('</svg>'); };
fill('A1', [['Month', 'Sales', 'Costs'], ['Jan', 10, 4], ['Feb', 20, 8], ['Mar', 30, -6], ['Apr', 40, 12], ['May', 100, 20]]);
const S = 'Sheet1';
const spec = (o) => Object.assign(CH.defaults('column'), { cats: `${S}!$A$2:$A$6`, series: [{ name: `${S}!$B$1`, ref: `${S}!$B$2:$B$6` }, { name: `${S}!$C$1`, ref: `${S}!$C$2:$C$6` }] }, o);
// niceTicks
T.eq(CH.niceTicks(0, 100, 5).step, 20, 'step 20'); T.ok(JSON.stringify(CH.niceTicks(0, 100, 5).ticks) === '[0,20,40,60,80,100]', '0..100 -> 20 steps');
T.ok(JSON.stringify(CH.niceTicks(0, 7, 5).ticks) === '[0,2,4,6,8]', '0..7'); T.ok(JSON.stringify(CH.niceTicks(-3, 12, 5).ticks) === '[-5,0,5,10,15]', 'negative range'); T.ok(JSON.stringify(CH.niceTicks(0, 1, 5).ticks) === '[0,0.2,0.4,0.6,0.8,1]', 'fractions');
T.ok(CH.niceTicks(5, 5, 4).ticks.length >= 2, 'degenerate range');
// resolve
const d = CH.resolve(spec(), wb); T.eq(d.n, 5, 'point count'); T.ok(JSON.stringify(d.cats) === '["Jan","Feb","Mar","Apr","May"]', 'cats'); T.eq(d.series[0].name, 'Sales', 'name from ref'); T.ok(JSON.stringify(d.series[1].values) === '[4,8,-6,12,20]', 'values'); T.ok(d.series[0].color === '#0a84ff' && d.series[1].color === '#30d158', 'palette colours');
const dl = CH.resolve(spec({ series: [{ name: 'Literal', ref: `${S}!B2:B4` }], cats: '' }), wb); T.eq(dl.series[0].name, 'Literal', 'literal name'); T.ok(JSON.stringify(dl.cats) === '["1","2","3"]', 'no cats -> indices');
T.ok(CH.resolve(spec({ series: [{ name: 'x', ref: 'Nope!A1:A3' }] }), wb).series[0].values.length >= 0, 'bad sheet ref safe');
// fromRange
const fr = CH.fromRange(wb, sheet, 0, 0, 5, 2, { type: 'column' }); T.eq(fr.series.length, 2, 'fromRange series'); T.eq(fr.cats, 'Sheet1!$A$2:$A$6', 'fromRange cats'); T.eq(fr.series[0].name, 'Sheet1!$B$1', 'fromRange header name'); T.eq(fr.series[1].ref, 'Sheet1!$C$2:$C$6', 'fromRange ref'); T.eq(CH.resolve(fr, wb).series[0].values[4], 100, 'fromRange resolves');
const fs = CH.fromRange(wb, sheet, 0, 1, 5, 2, { type: 'scatter' }); T.eq(fs.series.length, 1, 'scatter: first numeric col is X'); T.eq(fs.series[0].xref, 'Sheet1!$B$2:$B$6', 'scatter xref');
const fh = CH.fromRange(wb, sheet, 7, 0, 7, 3, { type: 'line' }); T.eq(fh.series.length >= 0, true, 'empty range safe');
fill('A9', [[1, 2, 3, 4]]); const fh2 = CH.fromRange(wb, sheet, 8, 0, 8, 3, { type: 'line' }); T.ok(fh2.series.length === 4 || fh2.series.length === 1, 'single row selection yields series'); 
fill('A11', [['', 'Q1', 'Q2', 'Q3'], ['North', 1, 2, 3], ['South', 4, 5, 6]]); const fw = CH.fromRange(wb, sheet, 10, 0, 12, 3, { type: 'column' }); T.eq(fw.series.length, 2, 'wide selection: series in rows'); T.eq(fw.seriesInRows, true, 'seriesInRows flag'); T.eq(CH.resolve(fw, wb).series[1].values.join(), '4,5,6', 'row series values'); T.eq(CH.resolve(fw, wb).cats.join(), 'Q1,Q2,Q3', 'row header cats'); 
// render: column
let svg = CH.render(spec({ title: 'Revenue', subtitle: 'FY24', yTitle: 'USD', xTitle: 'Month' }), wb, { w: 480, h: 360 }); T.ok(balanced(svg), 'column well-formed'); T.eq(cnt(svg, /data-k="bar"/g), 10, '10 bars'); T.ok(svg.includes('viewBox="0 0 480 360"') && !/ width="/.test(svg.split('>')[0]), 'viewBox without fixed size');
T.ok(svg.includes('>Revenue<') && svg.includes('>FY24<') && svg.includes('>USD<') && svg.includes('>Month<'), 'titles present'); T.ok(['Jan', 'Feb', 'Mar', 'Apr', 'May'].every((c) => svg.includes('>' + c + '<')), 'category labels');
const tv = [...svg.matchAll(/class="zc-ax zc-tick" data-v="([^"]+)"/g)].map((m) => +m[1]); T.ok(tv.includes(0) && tv.includes(100) && Math.min(...tv) <= -6, 'ticks cover -ve..100 (' + tv + ')'); T.ok(tv.every((t, i) => i === 0 || Math.abs((t - tv[i - 1]) - (tv[1] - tv[0])) < 1e-9), 'ticks evenly spaced');
T.ok(/data-tip="Sales — Jan: 10"/.test(svg), 'tooltip text'); T.ok(/data-s="1" data-i="2" data-tip="Costs — Mar: -6"/.test(svg), 'negative tooltip'); T.ok(svg.includes('var(--fg-2,#6e6e73)'), 'css vars with fallbacks'); T.ok(svg.includes('prefers-reduced-motion') && svg.includes('@keyframes'), 'animation css');
T.ok(!CH.render(spec(), wb, { animate: false }).includes('@keyframes'), 'animate:false removes keyframes'); T.ok(cnt(svg, /data-k="legend"/g) === 2, 'legend items');
const lt = CH.render(spec(), wb, { theme: 'light' }), dk = CH.render(spec(), wb, { theme: 'dark' }); T.ok(!lt.includes('var(--') && !dk.includes('var(--'), 'fixed theme has no CSS vars'); T.ok(dk.includes('#f5f5f7') && lt.includes('#1d1d1f'), 'theme colours');
// 0..100 axis exact
fill('F1', [[0], [100]]); const s100 = CH.render({ type: 'column', series: [{ name: 'v', ref: 'Sheet1!F1:F2' }], legend: 'none' }, wb, { w: 480, h: 300 }); T.ok(JSON.stringify([...s100.matchAll(/zc-tick" data-v="([^"]+)"/g)].map((m) => +m[1])) === '[0,20,40,60,80,100]', '0..100 -> 0,20..100 ticks in render');
// stacked / percent / bar
svg = CH.render(spec({ grouping: 'stacked', series: [spec().series[0], { name: 'B', ref: `${S}!$B$2:$B$6` }] }), wb); T.ok(balanced(svg) && cnt(svg, /data-k="bar"/g) === 10, 'stacked bars'); const tvs = [...svg.matchAll(/zc-tick" data-v="([^"]+)"/g)].map((m) => +m[1]); T.ok(Math.max(...tvs) >= 200, 'stacked axis covers sum');
svg = CH.render(spec({ grouping: 'percent', series: [spec().series[0], { name: 'B', ref: `${S}!$B$2:$B$6` }] }), wb); T.ok(Math.max(...[...svg.matchAll(/zc-tick" data-v="([^"]+)"/g)].map((m) => +m[1])) === 100 && svg.includes('>100%<'), '100% axis');
svg = CH.render(spec({ type: 'bar' }), wb); T.ok(balanced(svg) && cnt(svg, /class="zc-bar zc-m h/g) === 10, 'horizontal bars');
svg = CH.render(spec({ labels: true }), wb); T.ok(svg.includes('>100<') && cnt(svg, /class="zc-dl"/g) === 10, 'data labels');
// line / area
svg = CH.render(spec({ type: 'line', smooth: true }), wb); T.ok(balanced(svg) && cnt(svg, /class="zc-line"/g) === 2 && cnt(svg, /data-k="pt"/g) === 10 && svg.includes('C'), 'smooth line'); T.ok(!/NaN|undefined/.test(svg), 'no NaN');
svg = CH.render(spec({ type: 'area', grouping: 'stacked' }), wb); T.ok(balanced(svg) && cnt(svg, /class="zc-area"/g) === 2 && svg.includes('linearGradient'), 'stacked area gradients');
// pie / donut
svg = CH.render({ type: 'pie', cats: `${S}!$A$2:$A$6`, series: [{ ref: `${S}!$B$2:$B$6`, name: 'Sales' }], legend: 'right', labels: true }, wb); T.ok(balanced(svg) && cnt(svg, /data-k="slice"/g) === 5 && cnt(svg, /data-k="legend"/g) === 5, 'pie 5 slices'); T.ok(svg.includes('data-tip="May: 100 (50%)"'), 'pie tip %');
svg = CH.render({ type: 'donut', donutHole: 0.5, cats: `${S}!$A$2:$A$6`, series: [{ ref: `${S}!$B$2:$B$6`, name: 'Sales' }] }, wb, { w: 400, h: 300 }); T.ok(balanced(svg) && svg.includes('>Total<') && svg.includes('>200<'), 'donut centre');
svg = CH.render({ type: 'pie', series: [{ ref: `${S}!$B$2:$B$2`, name: 'one' }] }, wb); T.ok(balanced(svg) && cnt(svg, /data-k="slice"/g) === 1 && !/NaN/.test(svg), 'single-slice pie');
// scatter
fill('H1', [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2]]); svg = CH.render({ type: 'scatter', series: [{ name: 'xy', xref: `${S}!H1:H4`, ref: `${S}!I1:I4`, trend: true }] }, wb); T.ok(balanced(svg) && cnt(svg, /data-k="pt"/g) === 4 && cnt(svg, /data-k="trend"/g) === 1, 'scatter + trendline'); T.ok(cnt(svg, /class="zc-ax zc-xtick"/g) >= 3, 'scatter x ticks');
// combo
svg = CH.render(spec({ type: 'combo', series: [{ ref: `${S}!$B$2:$B$6`, name: 'Rev', type: 'column' }, { ref: `${S}!$C$2:$C$6`, name: 'Margin', type: 'line', axis: 'secondary' }], y2Title: '%' }), wb); T.ok(balanced(svg) && cnt(svg, /data-k="bar"/g) === 5 && cnt(svg, /class="zc-line"/g) === 1 && svg.includes('zc-tick2'), 'combo with secondary axis');
// empty / edge
svg = CH.render(spec({ series: [] }), wb); T.ok(balanced(svg) && svg.includes('No data') && svg.includes('data-empty'), 'empty state'); svg = CH.render({ type: 'line', series: [{ name: 'e', ref: 'Sheet1!Z1:Z5' }] }, wb); T.ok(svg.includes('No data'), 'all-empty series'); 
svg = CH.render({ type: 'line', series: [{ name: 'one', ref: 'Sheet1!B2:B2' }] }, wb); T.ok(balanced(svg) && !/NaN/.test(svg), 'one point line'); svg = CH.render(spec(), wb, { w: 30, h: 30 }); T.ok(balanced(svg) && !/NaN/.test(svg), 'tiny size safe'); T.ok(balanced(CH.render(null, wb)), 'null spec safe');
svg = CH.render(spec({ title: '<b>&"x"' }), wb); T.ok(svg.includes('&lt;b&gt;&amp;&quot;x&quot;') && balanced(svg), 'escaping');
// huge series decimation
const bw = ZN.newWorkbook(); const bsh = bw.sheets[0]; bw.tx('f', () => { for (let i = 0; i < 20000; i++) bw.setValue(bsh, i, 0, Math.sin(i / 50) * 100 + (i % 7)); });
svg = CH.render({ type: 'line', series: [{ name: 's', ref: 'Sheet1!A1:A20000' }], legend: 'none' }, bw); const pd = /class="zc-line"[^>]* d="([^"]+)"/.exec(svg); T.ok(pd && cnt(pd[1], /[ML]/g) <= 2100 && svg.length < 120000, 'decimated to <=2000 points (' + (pd ? cnt(pd[1], /[ML]/g) : 0) + ')');
// palettes
T.eq(CH.palette('default', 3)[2], '#ff9f0a', 'palette'); T.eq(CH.palette('default', 12).length, 12, 'palette cycles'); T.ok(CH.palette('pastel', 2)[0] !== CH.palette('default', 2)[0], 'alt palette'); T.eq(CH.palette('mono', 4).length, 4, 'mono'); T.ok(['default', 'pastel', 'mono', 'warm', 'cool'].every((p) => CH.palette(p, 1).length === 1), 'all palettes');
// misc API
T.eq(CH.defaults('donut').donutHole, 0.6, 'defaults'); T.ok(/Column chart/.test(CH.describe(spec())), 'describe'); 
const h = CH.hit(spec(), wb, 480, 360, 0, 0); T.ok(h === null, 'hit miss'); 
svg = CH.render(spec(), wb, { w: 480, h: 360, animate: false }); const gm = /data-k="bar" data-s="0" data-i="4"[^>]* d="M([\d.]+) ([\d.]+)/.exec(svg); T.ok(!!gm, 'bar path found'); 
const hh = CH.hit(spec(), wb, 480, 360, +gm[1] + 3, +gm[2] - 3); T.ok(hh && hh.s === 0 && hh.i === 4, 'hit test on tallest bar');
// sparkline
fill('K1', [[1, 3, -2, 5, 4]]); const sp = CH.sparkline({ ref: 'Sheet1!K1:O1', type: 'line', high: true, low: true, last: true, axis: true }, wb, 100, 24); T.ok(balanced(sp) && cnt(sp, /<circle/g) === 3 && sp.includes('viewBox="0 0 100 24"'), 'sparkline line markers');
const sc = CH.sparkline({ ref: 'Sheet1!K1:O1', type: 'column', neg: true }, wb, 100, 24); T.ok(balanced(sc) && cnt(sc, /<rect/g) === 5 && sc.includes('#ff453a'), 'sparkline column'); const sw = CH.sparkline({ ref: 'Sheet1!K1:O1', type: 'winloss' }, wb, 100, 24); T.ok(balanced(sw) && cnt(sw, /<rect/g) === 5, 'winloss'); T.ok(balanced(CH.sparkline({ ref: 'Sheet1!Z9:Z9' }, wb)), 'empty sparkline');
// export
const file = CH.toSVGFile(CH.render(spec(), wb)); T.ok(file.startsWith('<?xml') && !file.includes('var(--') && file.includes('xmlns='), 'toSVGFile resolves vars'); T.ok(CH.resolveVars('fill:var(--line,rgba(0,0,0,.1))') === 'fill:rgba(0,0,0,.1)', 'resolveVars nested paren');
CH.toPNG('<svg/>', 10, 10, 1).then(() => T.ok(false, 'png node'), () => { T.ok(true, 'toPNG rejects in node'); T.done('charts'); });
