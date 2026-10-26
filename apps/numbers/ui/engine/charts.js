/* ZengGrid charts: data resolution + SVG renderer (column/bar/line/area/pie/donut/scatter/combo), sparklines, hit-testing, export helpers. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const FM = ZN.formula; const CH = ZN.charts = {};
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f2 = (n) => (Math.round(n * 100) / 100).toString();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let uidN = 0;

  // ---------- palettes ----------
  const PALETTES = {
    default: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff6482'],
    pastel: ['#8ec5ff', '#9be3b0', '#ffd08a', '#d9b3f5', '#ffa6a0', '#a8e4f5', '#ffe98a', '#ffb3c1'],
    warm: ['#ff453a', '#ff9f0a', '#ffd60a', '#ff6482', '#ff7a45', '#d9534f', '#e8a33d', '#c2410c'],
    cool: ['#0a84ff', '#64d2ff', '#5e5ce6', '#30b0c7', '#bf5af2', '#40c8e0', '#3a6ea5', '#7d7aff'],
  };
  const hex2rgb = (h) => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (a) => '#' + a.map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  const mixc = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  CH.palette = function (name, n) {
    n = Math.max(0, n | 0); const out = [];
    if (name === 'mono') { for (let i = 0; i < n; i++) out.push(mixc('#0a60c8', '#bcd9f7', n > 1 ? i / (n - 1) * 0.85 : 0)); return out; }
    const base = PALETTES[name] || PALETTES.default;
    for (let i = 0; i < n; i++) { const lap = Math.floor(i / base.length); out.push(lap ? mixc(base[i % base.length], '#ffffff', Math.min(0.6, 0.28 * lap)) : base[i]); }
    return out;
  };
  CH.palettes = Object.keys(PALETTES).concat(['mono']);

  // ---------- number formatting ----------
  function fmtVal(v, nf) {
    if (nf && nf !== 'General' && ZN.fmt && typeof ZN.fmt.format === 'function') { try { const r = ZN.fmt.format(v, nf); const t = r && typeof r === 'object' ? r.text : r; if (typeof t === 'string') return t; } catch (e) { /* fall back */ } }
    return null;
  }
  function compact(v, dec) {
    const a = Math.abs(v); const tr = (x) => { let s = x.toFixed(dec == null ? 1 : dec); if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, ''); return s; };
    if (a >= 1e12) return tr(v / 1e12) + 'T'; if (a >= 1e9) return tr(v / 1e9) + 'B'; if (a >= 1e6) return tr(v / 1e6) + 'M'; if (a >= 1e3) return tr(v / 1e3) + 'k';
    if (a === 0) return '0'; if (a < 1e-6) return v.toExponential(1);
    const d = dec != null ? dec : (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3); return String(parseFloat(v.toFixed(Math.min(8, d))));
  }
  CH.compact = compact;
  function fmtAxis(v, nf, step) {
    const f = fmtVal(v, nf); if (f != null) return f;
    if (Math.abs(v) >= 1e3) return compact(v, Math.abs(v) >= 1e6 ? 2 : 1);
    const dec = step && step > 0 ? Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9))) : null; return dec != null ? String(parseFloat(v.toFixed(dec))) : compact(v);
  }
  const fmtFull = (v, nf) => { if (!isNum(v)) return ''; const f = fmtVal(v, nf); if (f != null) return f; return v.toLocaleString('en-US', { maximumFractionDigits: 4 }); };

  // ---------- nice ticks (1-2-5) ----------
  function niceStep(raw) { if (!(raw > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { if (min === 0) max = 1; else { const d = Math.abs(min) * 0.1; min -= d; max += d; } }
    count = Math.max(2, count || 5); const step = niceStep((max - min) / count);
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step; const ticks = [];
    for (let v = lo, i = 0; v <= hi + step * 1e-6 && i < 200; v += step, i++) ticks.push(parseFloat(v.toPrecision(12)));
    return { ticks, min: ticks[0], max: ticks[ticks.length - 1], step };
  }
  CH.niceTicks = niceTicks;

  // ---------- defaults ----------
  CH.defaults = function (type) {
    type = type || 'column';
    const s = { type, grouping: 'clustered', title: '', subtitle: '', legend: type === 'pie' || type === 'donut' ? 'right' : 'bottom', xTitle: '', yTitle: '', y2Title: '', cats: '', series: [], palette: 'default', gridlines: true, labels: false, seriesInRows: false };
    if (type === 'donut') s.donutHole = 0.6;
    if (type === 'line' || type === 'area') s.smooth = false;
    return s;
  };

  // ---------- data resolution ----------
  function sheetOf(spec, wb, ref) { return (ref && ref.sheet != null ? wb.sheetByName(ref.sheet) : null) || (spec.sheet && wb.sheetByName(spec.sheet)) || wb.sheets[wb.active || 0] || wb.sheets[0]; }
  function readRef(spec, wb, text) {
    const t = String(text || '').trim().replace(/^=/, ''); if (!t) return null; const ref = FM.parseRef(t); if (!ref) return null; const sh = sheetOf(spec, wb, ref); if (!sh) return null;
    const r2 = Math.min(ref.r2, Math.max(ref.r1, sh.maxRow())), out = []; let nf;
    for (let r = ref.r1; r <= r2; r++) for (let c = ref.c1; c <= ref.c2; c++) { const cell = sh.getCell(r, c); out.push(cell && cell.v !== undefined ? cell.v : null); if (nf === undefined && cell && cell.s) nf = (wb.style(cell.s) || {}).nf || null; }
    return { values: out, nf: nf || null, ref, sheet: sh };
  }
  const toNumber = (v) => (isNum(v) ? v : typeof v === 'string' && v.trim() !== '' && F_NUM.test(v.trim()) ? parseFloat(v) : null);
  const F_NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function catLabel(v, nf) { if (v == null) return ''; if (v instanceof ZN.ZErr) return v.code; if (typeof v === 'number') return fmtVal(v, nf) || ZN.numToStr(v); if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; return String(v); }

  CH.resolve = function (spec, wb) {
    const out = { cats: [], series: [], nf: null, n: 0 }; if (!spec) return out;
    const ser = spec.series || []; const cr = spec.cats ? readRef(spec, wb, spec.cats) : null;
    const pal = CH.palette(spec.palette, ser.length);
    ser.forEach((s, i) => {
      let name = s.name; if (typeof name === 'string' && /^=?.+!.+/.test(name)) { const r = readRef(spec, wb, name); if (r) name = r.values.find((x) => x != null); }
      if (name == null || name === '') name = 'Series ' + (i + 1);
      const rr = s.ref ? readRef(spec, wb, s.ref) : null; const vals = rr ? rr.values.map(toNumber) : (Array.isArray(s.values) ? s.values.map(toNumber) : []);
      const xr = s.xref ? readRef(spec, wb, s.xref) : null;
      if (i === 0 && rr) out.nf = rr.nf;
      out.series.push({ name: String(name instanceof ZN.ZErr ? name.code : name), values: vals, xs: xr ? xr.values.map(toNumber) : undefined, color: s.color || pal[i], type: s.type, axis: s.axis === 'secondary' ? 'secondary' : 'primary', labels: s.labels, trend: !!s.trend, marker: s.marker, smooth: s.smooth, nf: rr ? rr.nf : null });
    });
    let n = 0; for (const s of out.series) n = Math.max(n, s.values.length, s.xs ? s.xs.length : 0); if (cr) n = Math.max(n, cr.values.length);
    out.n = n; out.cats = []; for (let i = 0; i < n; i++) out.cats.push(cr ? catLabel(cr.values[i], cr.nf) : String(i + 1));
    out.catRaw = cr ? cr.values : null;
    for (const s of out.series) { while (s.values.length < n) s.values.push(null); if (s.xs) while (s.xs.length < n) s.xs.push(null); }
    return out;
  };

  // ---------- fromRange ----------
  CH.fromRange = function (wb, sheet, r1, c1, r2, c2, opts) {
    opts = opts || {}; const type = opts.type || 'column'; const spec = CH.defaults(type); spec.sheet = sheet.name;
    r2 = Math.min(r2, Math.max(r1, sheet.maxRow())); const rows = r2 - r1 + 1, cols = c2 - c1 + 1;
    const val = (r, c) => sheet.getValue(r, c); const isTxt = (v) => typeof v === 'string' && v.trim() !== '' && !F_NUM.test(v.trim()); const isN = (v) => isNum(v);
    const tr = cols > rows && type !== 'scatter' && rows >= 1 && !(rows === 1 && cols === 1); spec.seriesInRows = tr;
    // logical accessor: L rows (categories axis), M columns (series axis)
    const L = tr ? cols : rows, M = tr ? rows : cols; const A = (i, j) => (tr ? val(r1 + j, c1 + i) : val(r1 + i, c1 + j));
    const line = (j, i1, i2) => { const q = FM.quoteSheet(sheet.name) + '!'; if (!tr) return q + ZN.addr(r1 + i1, c1 + j, true, true) + (i1 === i2 ? '' : ':' + ZN.addr(r1 + i2, c1 + j, true, true)); return q + ZN.addr(r1 + j, c1 + i1, true, true) + (i1 === i2 ? '' : ':' + ZN.addr(r1 + j, c1 + i2, true, true)); };
    // category column: first logical column with text in body rows
    let j0 = 0, catCol = false;
    if (type !== 'scatter' && M > 1) { let t = 0, tot = 0; for (let i = 1; i < L; i++) { const v = A(i, 0); if (v != null) { tot++; if (isTxt(v)) t++; } } if (tot && t * 2 >= tot) catCol = true; if (!catCol && L > 1) { /* date-like numeric categories are left as series */ } }
    if (catCol) j0 = 1;
    let hasHeader = false;
    if (L > 1) { let strs = 0, cells = 0; for (let j = j0; j < M; j++) { const v = A(0, j); if (v != null) { cells++; if (isTxt(v)) strs++; } } let nextNum = false; for (let j = j0; j < M && !nextNum; j++) if (isN(A(1, j))) nextNum = true; hasHeader = cells > 0 && strs === cells && nextNum; if (!hasHeader && cells > 0 && strs === cells && catCol) hasHeader = true; }
    const i0 = hasHeader ? 1 : 0; const dataCols = [];
    for (let j = j0; j < M; j++) { let any = false; for (let i = i0; i < L; i++) if (isN(A(i, j))) { any = true; break; } if (any) dataCols.push(j); }
    if (i0 >= L) return spec;
    if (catCol) spec.cats = line(0, i0, L - 1);
    const nameOf = (j) => (hasHeader ? line(j, 0, 0) : 'Series ' + (dataCols.indexOf(j) + 1));
    if (type === 'scatter') {
      const xc = dataCols[0]; const ys = dataCols.slice(1);
      if (xc === undefined) return spec;
      if (!ys.length) spec.series.push({ name: nameOf(xc), ref: line(xc, i0, L - 1) }); else for (const j of ys) spec.series.push({ name: nameOf(j), ref: line(j, i0, L - 1), xref: line(xc, i0, L - 1) });
    } else for (const j of (type === 'pie' || type === 'donut' ? dataCols.slice(0, 1) : dataCols)) spec.series.push({ name: nameOf(j), ref: line(j, i0, L - 1) });
    if (type === 'combo') spec.series.forEach((s, i) => { s.type = i === 0 ? 'column' : 'line'; });
    if (spec.series.length <= 1 && type !== 'pie' && type !== 'donut') spec.legend = 'none';
    return spec;
  };

  // ---------- themes ----------
  const FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",system-ui,sans-serif';
  function themeColors(theme) {
    if (theme === 'light') return { fg: '#1d1d1f', fg2: '#6e6e73', fg3: '#aeaeb2', line: '#e8e8ed', strong: '#c7c7cc', bg: '#ffffff', fixed: true };
    if (theme === 'dark') return { fg: '#f5f5f7', fg2: '#a1a1a6', fg3: '#636366', line: '#38383a', strong: '#545458', bg: '#1e1e20', fixed: true };
    return { fg: 'var(--fg,#1d1d1f)', fg2: 'var(--fg-2,#6e6e73)', fg3: 'var(--fg-3,#aeaeb2)', line: 'var(--line,rgba(0,0,0,.1))', strong: 'var(--line-strong,rgba(0,0,0,.18))', bg: 'var(--bg,#fff)', fixed: false };
  }
  const tw = (s, px) => String(s).length * (px || 11) * 0.56;
  const trunc = (s, n) => { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };

  // ---------- paths ----------
  function linePath(pts, smooth) {
    if (!pts.length) return ''; if (pts.length === 1) return 'M' + f2(pts[0].x) + ' ' + f2(pts[0].y);
    if (!smooth || pts.length < 3) return 'M' + pts.map((p) => f2(p.x) + ' ' + f2(p.y)).join('L');
    const n = pts.length, dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; } else { const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } } }
    let d = 'M' + f2(pts[0].x) + ' ' + f2(pts[0].y);
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += 'C' + f2(pts[i].x + h) + ' ' + f2(pts[i].y + t[i] * h) + ' ' + f2(pts[i + 1].x - h) + ' ' + f2(pts[i + 1].y - t[i + 1] * h) + ' ' + f2(pts[i + 1].x) + ' ' + f2(pts[i + 1].y); }
    return d;
  }
  function roundedRect(x, y, w, h, r, end) { // rounds only the 'end' side: t b l r (n = none)
    r = Math.max(0, Math.min(r, w / 2, h / 2)); x = +x.toFixed(2); y = +y.toFixed(2); w = +w.toFixed(2); h = +h.toFixed(2); const x1 = +(x + w).toFixed(2), y1 = +(y + h).toFixed(2);
    if (!r || end === 'n') return `M${x} ${y}H${x1}V${y1}H${x}Z`;
    switch (end) {
      case 't': return `M${x} ${y1}V${y + r}Q${x} ${y} ${x + r} ${y}H${x1 - r}Q${x1} ${y} ${x1} ${y + r}V${y1}Z`;
      case 'b': return `M${x} ${y}H${x1}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x + r}Q${x} ${y1} ${x} ${y1 - r}Z`;
      case 'r': return `M${x} ${y}H${x1 - r}Q${x1} ${y} ${x1} ${y + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x}Z`;
      default: return `M${x1} ${y}H${x + r}Q${x} ${y} ${x} ${y + r}V${y1 - r}Q${x} ${y1} ${x + r} ${y1}H${x1}Z`;
    }
  }
  function decimate(pts, max) {
    if (pts.length <= max) return pts; const B = Math.floor(max / 2), size = pts.length / B, out = [];
    for (let b = 0; b < B; b++) { const a = Math.floor(b * size), e = Math.min(pts.length, Math.floor((b + 1) * size)); if (a >= e) continue; let lo = pts[a], hi = pts[a]; for (let i = a; i < e; i++) { if (pts[i].y < lo.y) lo = pts[i]; if (pts[i].y > hi.y) hi = pts[i]; } if (b === 0 && pts[0] !== lo && pts[0] !== hi) out.push(pts[0]); const two = lo.i < hi.i ? [lo, hi] : [hi, lo]; out.push(two[0]); if (two[1] !== two[0]) out.push(two[1]); }
    const last = pts[pts.length - 1]; if (out[out.length - 1] !== last) out.push(last); return out;
  }
  const arcPt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  function slicePath(cx, cy, r0, r1, a0, a1) {
    const full = a1 - a0 >= Math.PI * 2 - 1e-6; if (full) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0; const p0 = arcPt(cx, cy, r1, a0), p1 = arcPt(cx, cy, r1, a1);
    if (r0 <= 0.5) return `M${f2(cx)} ${f2(cy)}L${f2(p0[0])} ${f2(p0[1])}A${f2(r1)} ${f2(r1)} 0 ${large} 1 ${f2(p1[0])} ${f2(p1[1])}Z`;
    const q1 = arcPt(cx, cy, r0, a1), q0 = arcPt(cx, cy, r0, a0);
    return `M${f2(p0[0])} ${f2(p0[1])}A${f2(r1)} ${f2(r1)} 0 ${large} 1 ${f2(p1[0])} ${f2(p1[1])}L${f2(q1[0])} ${f2(q1[1])}A${f2(r0)} ${f2(r0)} 0 ${large} 0 ${f2(q0[0])} ${f2(q0[1])}Z`;
  }

  // ---------- main builder ----------
  function build(spec, wb, o) {
    spec = spec || { type: "column", series: [] };
    o = Object.assign({ w: 480, h: 300, theme: 'auto', interactive: true, animate: true }, o || {}); const W = Math.max(40, o.w | 0 || 480), H = Math.max(40, o.h | 0 || 300);
    const U = 'zc' + (++uidN); const th = themeColors(o.theme); const data = CH.resolve(spec, wb); const marks = []; const type = spec.type || 'column';
    const small = W < 120 || H < 90; const pad = small ? 6 : 16;
    const nf = spec.nf || data.nf || null; const dataAttr = (s, i, tip, k) => `data-k="${k}" data-s="${s}" data-i="${i}" data-tip="${esc(tip)}"`;
    let defs = '', body = '';
    const box = { l: pad, t: pad, r: W - pad, b: H - pad };
    // title / subtitle
    if (!small && spec.title) { body += `<text class="zc-title" x="${pad}" y="${pad + 14}">${esc(trunc(spec.title, Math.floor((W - 2 * pad) / 8.4)))}</text>`; box.t = pad + 24; if (spec.subtitle) { body += `<text class="zc-sub" x="${pad}" y="${pad + 32}">${esc(trunc(spec.subtitle, Math.floor((W - 2 * pad) / 6.6)))}</text>`; box.t = pad + 40; } box.t += 6; }
    // data checks
    const isPie = type === 'pie' || type === 'donut';
    let hasData = false;
    if (isPie) { const s0 = data.series[0]; hasData = !!s0 && s0.values.some((v) => isNum(v) && v > 0); } else hasData = data.series.some((s) => s.values.some(isNum));
    const aria = CH.describe(spec, wb);
    const open = (extra) => `<svg xmlns="http://www.w3.org/2000/svg" class="zc ${U}" viewBox="0 0 ${W} ${H}" font-family='${FONT}' role="img" aria-label="${esc(aria)}"${extra || ''}>`;
    const styleBlock = () => {
      const c = th; let s = `.${U} .zc-title{font-size:15px;font-weight:600;fill:${c.fg}}.${U} .zc-sub{font-size:12px;fill:${c.fg2}}.${U} .zc-ax{font-size:11px;fill:${c.fg2}}.${U} .zc-axt{font-size:11px;font-weight:500;fill:${c.fg2}}.${U} .zc-dl{font-size:10px;font-weight:500;fill:${c.fg}}.${U} .zc-dli{font-size:10px;font-weight:600;fill:#fff}.${U} .zc-leg{font-size:11px;fill:${c.fg2}}.${U} .zc-grid{stroke:${c.line};stroke-width:1;fill:none}.${U} .zc-axis{stroke:${c.strong};stroke-width:1;fill:none}.${U} .zc-sep{stroke:${c.bg};stroke-width:1.5}.${U} .zc-ctr{font-size:22px;font-weight:600;fill:${c.fg}}.${U} .zc-ctr2{font-size:11px;fill:${c.fg2}}.${U} .zc-empty{font-size:13px;fill:${c.fg2}}.${U} .zc-mk{stroke:${c.bg};stroke-width:1.5}`;
      if (o.interactive) s += `.${U} .zc-m{transition:opacity .15s}.${U}:has(.zc-m:hover) .zc-m:not(:hover){opacity:.5}.${U} .zc-pt{opacity:0;transition:opacity .12s}.${U} .zc-pt.on,.${U} .zc-pt:hover{opacity:1}.${U} .zc-bar:hover,.${U} .zc-slice:hover{filter:brightness(1.08)}`;
      else s += `.${U} .zc-pt{opacity:0}.${U} .zc-pt.on{opacity:1}`;
      if (o.animate) s += `@media (prefers-reduced-motion:no-preference){.${U} .zc-bar{transform-box:fill-box;transform-origin:50% 100%;animation:${U}g .6s cubic-bezier(.2,.8,.2,1) both}.${U} .zc-bar.n{transform-origin:50% 0}.${U} .zc-bar.h{transform-origin:0 50%;animation-name:${U}gh}.${U} .zc-bar.h.n{transform-origin:100% 50%}.${U} .zc-line{stroke-dasharray:1;animation:${U}d .9s ease-out both}.${U} .zc-area,.${U} .zc-slice,.${U} .zc-trend{animation:${U}f .7s ease-out both}@keyframes ${U}g{from{transform:scaleY(0)}}@keyframes ${U}gh{from{transform:scaleX(0)}}@keyframes ${U}d{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes ${U}f{from{opacity:0}}}`;
      return `<style>${s}</style>`;
    };
    if (!hasData) {
      const cx = W / 2, cy = (box.t + box.b) / 2;
      body += `<g data-empty="1"><rect x="${f2(cx - 14)}" y="${f2(cy - 30)}" width="6" height="16" rx="1.5" fill="${th.fg3}" opacity=".5"/><rect x="${f2(cx - 4)}" y="${f2(cy - 38)}" width="6" height="24" rx="1.5" fill="${th.fg3}" opacity=".5"/><rect x="${f2(cx + 6)}" y="${f2(cy - 24)}" width="6" height="10" rx="1.5" fill="${th.fg3}" opacity=".5"/><text class="zc-empty" x="${f2(cx)}" y="${f2(cy + 6)}" text-anchor="middle">No data</text></g>`;
      return { svg: open() + styleBlock() + body + '</svg>', marks, data };
    }
    // legend
    const legendPos = spec.legend === undefined ? (data.series.length > 1 || isPie ? 'bottom' : 'none') : spec.legend;
    let legItems = isPie ? data.cats.map((c, i) => ({ name: c, color: CH.palette(spec.palette, data.cats.length)[i], s: 0, i })) : data.series.map((s, i) => ({ name: s.name, color: s.color, s: i, i }));
    if (isPie) legItems = legItems.filter((_, i) => isNum(data.series[0].values[i]) && data.series[0].values[i] > 0);
    if (!small && legendPos !== 'none' && legItems.length && (legItems.length > 1 || isPie)) {
      const dot = (it, x, y) => `<g class="zc-m" data-k="legend" data-s="${it.s}" data-i="${it.i}"><rect x="${f2(x)}" y="${f2(y - 4)}" width="9" height="9" rx="2.5" fill="${it.color}"/><text class="zc-leg" x="${f2(x + 14)}" y="${f2(y + 4.5)}">${esc(it.name)}</text></g>`;
      if (legendPos === 'top' || legendPos === 'bottom') {
        const maxW = W - 2 * pad; const rows = [[]]; let cur = 0; const items = legItems.map((it) => ({ it: Object.assign({}, it, { name: trunc(it.name, 24) }), w: 14 + tw(trunc(it.name, 24), 11) + 18 }));
        for (const x of items) { if (cur + x.w > maxW && rows[rows.length - 1].length) { rows.push([]); cur = 0; } rows[rows.length - 1].push(x); cur += x.w; }
        const rh = 18, tot = Math.min(rows.length, 3) * rh; const y0 = legendPos === 'top' ? box.t + 6 : box.b - tot + 8;
        rows.slice(0, 3).forEach((row, ri) => { const rw = row.reduce((a, x) => a + x.w, 0) - 18; let x = (W - rw) / 2; for (const m of row) { body += dot(m.it, x, y0 + ri * rh + 5); x += m.w; } });
        if (legendPos === 'top') box.t += tot + 6; else box.b -= tot + 4;
      } else {
        const items = legItems.slice(0, Math.max(1, Math.floor((box.b - box.t) / 20))).map((it) => Object.assign({}, it, { name: trunc(it.name, 18) })); const cw = Math.min(160, Math.max(...items.map((it) => 14 + tw(it.name, 11))) + 4);
        const h = items.length * 20; const y0 = (box.t + box.b) / 2 - h / 2 + 8; const x0 = legendPos === 'left' ? box.l : box.r - cw;
        items.forEach((it, k) => { body += dot(it, x0, y0 + k * 20); });
        if (legendPos === 'left') box.l += cw + 14; else box.r -= cw + 14;
      }
    }

    // ---- pie / donut ----
    if (isPie) {
      const s0 = data.series[0]; const pal = CH.palette(spec.palette, data.cats.length); const vals = s0.values.map((v) => (isNum(v) && v > 0 ? v : 0)); const total = vals.reduce((a, b) => a + b, 0);
      const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2; const R = Math.max(10, Math.min(box.r - box.l, box.b - box.t) / 2 - 4); const hole = type === 'donut' ? clamp(spec.donutHole == null ? 0.6 : spec.donutHole, 0.2, 0.9) : 0; const r0 = R * hole;
      let a = -Math.PI / 2; const nz = vals.filter((v) => v > 0).length;
      vals.forEach((v, i) => {
        if (v <= 0) return; const ang = v / total * Math.PI * 2, a1 = a + ang; const pct = v / total * 100; const tip = `${data.cats[i]}: ${fmtFull(v, nf)} (${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%)`;
        body += `<path class="zc-slice zc-m${nz > 1 ? ' zc-sep' : ''}" ${dataAttr(0, i, tip, 'slice')} d="${slicePath(cx, cy, r0, R, a, a1)}" fill="${pal[i]}"/>`;
        marks.push({ k: 'arc', s: 0, i, cx, cy, r0, r1: R, a0: a, a1 });
        if ((spec.labels || s0.labels) && pct >= 5) { const mr = r0 > 0 ? (r0 + R) / 2 : R * 0.64, p = arcPt(cx, cy, mr, (a + a1) / 2); body += `<text class="zc-dli" x="${f2(p[0])}" y="${f2(p[1] + 3.5)}" text-anchor="middle" pointer-events="none">${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</text>`; }
        a = a1;
      });
      if (type === 'donut' && R > 50) { const lab = spec.centerLabel != null ? String(spec.centerLabel) : fmtFull(total, nf); body += `<text class="zc-ctr" x="${f2(cx)}" y="${f2(cy + 2)}" text-anchor="middle">${esc(trunc(spec.centerLabel != null ? lab : compact(total, 1), 10))}</text><text class="zc-ctr2" x="${f2(cx)}" y="${f2(cy + 18)}" text-anchor="middle">${esc(spec.centerSub != null ? spec.centerSub : 'Total')}</text>`; }
      return { svg: open() + styleBlock() + body + '</svg>', marks, data };
    }

    // ---- cartesian ----
    const hz = type === 'bar'; const isScatter = type === 'scatter'; const n = data.n; const fixedPal = data.series;
    const kinds = data.series.map((s, i) => (type === 'combo' ? (s.type === 'line' ? 'line' : s.type === 'area' ? 'area' : s.type === 'scatter' ? 'line' : s.type ? 'col' : i === 0 ? 'col' : 'line') : type === 'column' || type === 'bar' ? 'col' : type === 'line' ? 'line' : type === 'area' ? 'area' : 'sc'));
    const grouping = spec.grouping || 'clustered'; const stackedMode = grouping === 'stacked' || grouping === 'percent';
    const usesSecondary = type === 'combo' && data.series.some((s) => s.axis === 'secondary');
    const axisOf = (i) => (usesSecondary && data.series[i].axis === 'secondary' ? 1 : 0);
    // stacking
    const seg = data.series.map((s) => s.values.map((v) => (isNum(v) ? { lo: 0, hi: v, v } : null)));
    if (!isScatter) for (const kind of ['col', 'area']) { if (!stackedMode) break; for (const ax of [0, 1]) {
      const idx = data.series.map((_, i) => i).filter((i) => kinds[i] === kind && axisOf(i) === ax); if (idx.length < 1) continue;
      for (let i = 0; i < n; i++) {
        let tot = 0; if (grouping === 'percent') for (const si of idx) { const v = data.series[si].values[i]; if (isNum(v)) tot += Math.abs(v); }
        let pos = 0, neg = 0; for (const si of idx) { const v = data.series[si].values[i]; if (!isNum(v)) continue; const vv = grouping === 'percent' ? (tot ? v / tot * 100 : 0) : v; if (vv >= 0) { seg[si][i] = { lo: pos, hi: pos + vv, v }; pos += vv; } else { seg[si][i] = { lo: neg + vv, hi: neg, v }; neg += vv; } }
      }
    } }
    // value domains
    const dom = [null, null];
    for (let ax = 0; ax < (usesSecondary ? 2 : 1); ax++) {
      let mn = Infinity, mx = -Infinity, zero = false;
      data.series.forEach((s, si) => { if (axisOf(si) !== ax) return; const k = kinds[si]; if (k === 'col' || k === 'area') zero = true; for (const g of seg[si]) { if (!g) continue; mn = Math.min(mn, g.lo, g.hi); mx = Math.max(mx, g.lo, g.hi); } });
      if (!isFinite(mn)) { mn = 0; mx = 1; }
      if (grouping === 'percent' && !isScatter) { mn = Math.min(mn, 0); mx = Math.max(mx, 100); }
      if (zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); } else if (!isScatter || true) { if (mn >= 0 && mx > 0 && mn <= mx * 0.5) mn = 0; else if (mx <= 0 && mn < 0 && mx >= mn * 0.5) mx = 0; }
      const lo = ax === 0 ? spec.ymin : spec.y2min, hi = ax === 0 ? spec.ymax : spec.y2max; if (isNum(lo)) mn = lo; if (isNum(hi)) mx = hi; if (mn >= mx) mx = mn + 1;
      dom[ax] = { mn, mx };
    }
    // scatter x domain
    let xs = null;
    if (isScatter) {
      let mn = Infinity, mx = -Infinity; data.series.forEach((s) => { for (let i = 0; i < n; i++) { const x = s.xs ? s.xs[i] : i + 1; if (isNum(x) && isNum(s.values[i])) { mn = Math.min(mn, x); mx = Math.max(mx, x); } } }); if (!isFinite(mn)) { mn = 0; mx = 1; }
      xs = { mn, mx }; if (isNum(spec.xmin)) xs.mn = spec.xmin; if (isNum(spec.xmax)) xs.mx = spec.xmax;
      // scatter y shouldn't force zero
      let ymn = Infinity, ymx = -Infinity; data.series.forEach((s) => s.values.forEach((v) => { if (isNum(v)) { ymn = Math.min(ymn, v); ymx = Math.max(ymx, v); } }));
      if (isFinite(ymn)) { dom[0] = { mn: ymn >= 0 && ymn <= ymx * 0.5 ? 0 : ymn, mx: ymx <= 0 && ymx >= ymn * 0.5 ? 0 : ymx }; if (isNum(spec.ymin)) dom[0].mn = spec.ymin; if (isNum(spec.ymax)) dom[0].mx = spec.ymax; if (dom[0].mn >= dom[0].mx) dom[0].mx = dom[0].mn + 1; }
    }
    // axis titles
    const xTitle = !small && spec.xTitle, yTitle = !small && spec.yTitle, y2Title = !small && usesSecondary && spec.y2Title;
    if (xTitle) { body += `<text class="zc-axt" x="${f2((box.l + box.r) / 2)}" y="${f2(box.b - 2)}" text-anchor="middle">${esc(spec.xTitle)}</text>`; box.b -= 20; }
    const axisTitleDraw = [];
    if (yTitle) { axisTitleDraw.push(['l', spec.yTitle]); box.l += 18; } if (y2Title) { axisTitleDraw.push(['r', spec.y2Title]); box.r -= 18; }
    const vAxisLen0 = hz ? box.r - box.l - 40 : box.b - box.t - 26;
    const tickCount = clamp(Math.round(vAxisLen0 / (hz ? 70 : 40)), 2, 8);
    const ticks = dom.map((d, ax) => (d ? niceTicks(d.mn, d.mx, tickCount) : null));
    if (isNum(spec.ymin) && ticks[0]) { ticks[0].ticks = ticks[0].ticks.filter((t) => t >= spec.ymin - 1e-9); }
    const vmin = ticks.map((t) => (t ? (ax0(t) ) : 0));
    function ax0(t) { return t.min; }
    const tickLabel = (t, ax) => (grouping === 'percent' && !isScatter && ax === 0 ? t + '%' : fmtAxis(t, ax === 0 ? nf : (data.series.find((_, i) => axisOf(i) === 1) || {}).nf, ticks[ax].step));
    const dmin = [ticks[0] ? (isNum(spec.ymin) ? Math.min(ticks[0].min, spec.ymin) : ticks[0].min) : 0, ticks[1] ? ticks[1].min : 0];
    const dmax = [ticks[0] ? (isNum(spec.ymax) ? Math.max(spec.ymax, ticks[0].min) : ticks[0].max) : 1, ticks[1] ? ticks[1].max : 1];
    if (isNum(spec.ymax) && ticks[0]) ticks[0].ticks = ticks[0].ticks.filter((t) => t <= spec.ymax + 1e-9);
    void vmin;
    let xt = null; if (isScatter) { xt = niceTicks(xs.mn, xs.mx, clamp(Math.round((box.r - box.l - 40) / 80), 2, 8)); }
    // label gutters
    const catLabelsAll = data.cats.map((c) => trunc(c, 20));
    let gL = 0, gR = 0, gB = 0, gT = 0;
    if (hz) { gL = Math.min(110, Math.max(...catLabelsAll.map((c) => tw(c, 11)), 0)) + 10; gB = 20; if (usesSecondary) gT = 0; }
    else { gL = Math.max(...ticks[0].ticks.map((t) => tw(tickLabel(t, 0), 11)), 0) + 10; if (ticks[1]) gR = Math.max(...ticks[1].ticks.map((t) => tw(tickLabel(t, 1), 11)), 0) + 10; gB = 20; }
    if (isScatter) { gB = 20; }
    const plotL0 = box.l + gL, plotR0 = box.r - gR - (hz ? 14 : 4);
    const plotW0 = Math.max(10, plotR0 - plotL0);
    // category axis label strategy (vertical charts)
    let rot = false, step = 1;
    if (!hz && !isScatter) {
      const bandW = plotW0 / Math.max(1, n); const lw = Math.max(...catLabelsAll.map((c) => tw(c, 11)), 0);
      if (lw + 6 > bandW) { rot = true; step = Math.max(1, Math.ceil(14 / bandW)); gB = Math.min(70, lw * 0.72 + 16); if (bandW >= 14 && lw * 0.72 > 60) { /* long labels get truncated by the cap */ } }
    }
    const plotT = box.t + (hz ? 2 : 6), plotB = box.b - gB - (hz ? 0 : 2);
    const plotL = plotL0, plotR = Math.max(plotL + 10, plotR0), plotW = plotR - plotL, plotH = Math.max(10, plotB - plotT);
    if (hz) { /* values along x, categories along y */ }
    const vPos = (ax, v) => { const a = dmin[ax], b = dmax[ax]; const t = (v - a) / (b - a || 1); return hz ? plotL + t * plotW : plotB - t * plotH; };
    const catLen = hz ? plotH : plotW; const bandW = catLen / Math.max(1, n);
    const hasCol = kinds.includes('col'); const edge = !isScatter && !hasCol && n > 1 && kinds.every((k) => k === 'area');
    const cPos = (i) => (edge ? (hz ? plotT : plotL) + i / (n - 1) * catLen : (hz ? plotT : plotL) + (i + 0.5) * bandW);
    const xPosS = (x) => plotL + (x - xt.min) / (xt.max - xt.min || 1) * plotW;
    if (isScatter) { dmin[0] = ticks[0].min; dmax[0] = ticks[0].max; }
    // axis titles drawn now
    for (const [side, txt] of axisTitleDraw) { const x = side === 'l' ? plotL - gL - 8 : plotR + gR + 12; const y = (plotT + plotB) / 2; body += `<text class="zc-axt" transform="translate(${f2(x)} ${f2(y)}) rotate(${side === 'l' ? -90 : 90})" text-anchor="middle">${esc(txt)}</text>`; }
    const crisp = (v) => Math.round(v) + 0.5;
    // gridlines + value ticks
    const showGrid = spec.gridlines !== false;
    for (const t of ticks[0].ticks) {
      const p = vPos(0, t); if (p < (hz ? plotL : plotT) - 0.5 || p > (hz ? plotR : plotB) + 0.5) continue; const isZero = t === 0 && dmin[0] < 0;
      if (showGrid || isZero) body += hz ? `<path class="${isZero ? 'zc-axis' : 'zc-grid'}" d="M${f2(crisp(p))} ${f2(plotT)}V${f2(plotB)}"/>` : `<path class="${isZero ? 'zc-axis' : 'zc-grid'}" d="M${f2(plotL)} ${f2(crisp(p))}H${f2(plotR)}"/>`;
      body += hz ? `<text class="zc-ax zc-tick" data-v="${t}" x="${f2(p)}" y="${f2(plotB + 15)}" text-anchor="middle">${esc(tickLabel(t, 0))}</text>` : `<text class="zc-ax zc-tick" data-v="${t}" x="${f2(plotL - 8)}" y="${f2(p + 3.7)}" text-anchor="end">${esc(tickLabel(t, 0))}</text>`;
    }
    if (ticks[1]) for (const t of ticks[1].ticks) { const p = vPos(1, t); body += `<text class="zc-ax zc-tick2" data-v="${t}" x="${f2(plotR + 8)}" y="${f2(p + 3.7)}" text-anchor="start">${esc(tickLabel(t, 1))}</text>`; }
    // baseline axis
    const zeroPx = vPos(0, clamp(0, dmin[0], dmax[0]));
    if (!(dmin[0] < 0 && dmax[0] > 0)) body += hz ? `<path class="zc-axis" d="M${f2(crisp(plotL))} ${f2(plotT)}V${f2(plotB)}"/>` : `<path class="zc-axis" d="M${f2(plotL)} ${f2(crisp(plotB))}H${f2(plotR)}"/>`;
    else body += hz ? `<path class="zc-axis" d="M${f2(crisp(zeroPx))} ${f2(plotT)}V${f2(plotB)}"/>` : `<path class="zc-axis" d="M${f2(plotL)} ${f2(crisp(zeroPx))}H${f2(plotR)}"/>`;
    // category axis labels
    if (isScatter) {
      for (const t of xt.ticks) { const x = xPosS(t); if (showGrid) body += `<path class="zc-grid" d="M${f2(crisp(x))} ${f2(plotT)}V${f2(plotB)}"/>`; body += `<text class="zc-ax zc-xtick" data-v="${t}" x="${f2(x)}" y="${f2(plotB + 15)}" text-anchor="middle">${esc(fmtAxis(t, null, xt.step))}</text>`; }
    } else {
      const hStep = hz ? Math.max(1, Math.ceil(14 / bandW)) : step;
      for (let i = 0; i < n; i += hStep) {
        const lab = catLabelsAll[i]; if (lab === '' || lab == null) continue; const p = cPos(i);
        if (hz) body += `<text class="zc-ax zc-cat" data-i="${i}" x="${f2(plotL - 8)}" y="${f2(p + 3.7)}" text-anchor="end">${esc(lab)}</text>`;
        else if (rot) body += `<text class="zc-ax zc-cat" data-i="${i}" transform="translate(${f2(p + 3)} ${f2(plotB + 12)}) rotate(-40)" text-anchor="end">${esc(trunc(lab, 14))}</text>`;
        else body += `<text class="zc-ax zc-cat" data-i="${i}" x="${f2(p)}" y="${f2(plotB + 15)}" text-anchor="middle">${esc(lab)}</text>`;
      }
    }
    // ---- marks ----
    const colIdx = data.series.map((_, i) => i).filter((i) => kinds[i] === 'col');
    const slots = stackedMode ? 1 : Math.max(1, colIdx.length);
    const groupW = Math.min(bandW * 0.7, slots * 64), gap = slots > 1 ? Math.min(3, groupW * 0.04) : 0, barW = Math.max(1, groupW / slots - gap);
    const dl = (s, o2) => spec.labels || s.labels || o2;
    const lab = (x, y, txt, cls, anchor) => `<text class="${cls || 'zc-dl'}" x="${f2(x)}" y="${f2(y)}" text-anchor="${anchor || 'middle'}" pointer-events="none">${esc(txt)}</text>`;
    const tipOf = (s, i, v) => `${s.name} — ${data.cats[i]}: ${grouping === 'percent' && !isScatter ? fmtFull(v, nf) : fmtFull(v, s.nf || nf)}`;
    // areas first, then bars, then lines, then points
    let areaSvg = '', barSvg = '', lineSvg = '', ptSvg = '', lblSvg = '';
    data.series.forEach((s, si) => {
      const k = kinds[si], ax = axisOf(si), color = s.color;
      if (k === 'col') {
        const slot = stackedMode ? 0 : colIdx.indexOf(si); const lastPos = {};
        for (let i = 0; i < n; i++) {
          const g = seg[si][i]; if (!g) continue; const c0 = cPos(i) - groupW / 2 + slot * (groupW / slots) + gap / 2; const a = vPos(ax, g.lo), b = vPos(ax, g.hi); const v0 = Math.min(a, b), len = Math.max(Math.abs(a - b), g.hi === g.lo ? 0 : 1);
          let topmost = true; if (stackedMode) { for (let sj = si + 1; sj < data.series.length; sj++) { if (kinds[sj] === 'col' && axisOf(sj) === ax && seg[sj][i] && seg[sj][i].hi !== seg[sj][i].lo && ((seg[sj][i].v >= 0) === (g.v >= 0))) { topmost = false; break; } } }
          const neg = g.v < 0; const end = !topmost ? 'n' : hz ? (neg ? 'l' : 'r') : (neg ? 'b' : 't'); const rx = Math.min(4, barW / 2.2);
          let x, y, w, h; if (hz) { x = v0; y = c0; w = len; h = barW; } else { x = c0; y = v0; w = barW; h = len; }
          const tip = tipOf(s, i, g.v);
          barSvg += `<path class="zc-bar zc-m${hz ? ' h' : ''}${neg ? ' n' : ''}" ${dataAttr(si, i, tip, 'bar')} d="${roundedRect(x, y, w, h, rx, end)}" fill="${color}"/>`;
          marks.push({ k: 'rect', s: si, i, x, y, w, h });
          if (dl(s, false) && len > 0) { if (stackedMode) { if (len > 16 && barW > 18) lblSvg += lab(x + w / 2, y + h / 2 + 3.5, grouping === 'percent' ? Math.round(g.hi - g.lo) + '%' : fmtAxis(g.v, nf), 'zc-dli'); } else lblSvg += hz ? lab(neg ? x - 5 : x + w + 5, y + h / 2 + 3.5, fmtAxis(g.v, s.nf || nf), 'zc-dl', neg ? 'end' : 'start') : lab(x + w / 2, neg ? y + h + 12 : y - 5, fmtAxis(g.v, s.nf || nf)); }
        }
        void lastPos;
      } else if (k === 'line' || k === 'area') {
        const all = []; for (let i = 0; i < n; i++) { const g = seg[si][i]; if (!g) continue; all.push({ x: hz ? vPos(ax, g.hi) : cPos(i), y: hz ? cPos(i) : vPos(ax, g.hi), i, v: g.v, y0: vPos(ax, g.lo) }); }
        const smooth = s.smooth != null ? !!s.smooth : !!spec.smooth;
        const segs = []; let curS = []; let prev = -2; for (const p of all) { if (p.i !== prev + 1 && curS.length) { segs.push(curS); curS = []; } curS.push(p); prev = p.i; } if (curS.length) segs.push(curS);
        const big = all.length > 2000;
        if (k === 'area') {
          const gid = `${U}a${si}`; defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color}" stop-opacity=".03"/></linearGradient>`;
          for (const sg of segs) { const pts = big ? decimate(sg, 2000) : sg; if (pts.length < 2) continue; const top = linePath(pts, smooth); const bot = pts.slice().reverse().map((p) => 'L' + f2(p.x) + ' ' + f2(p.y0)).join(''); areaSvg += `<path class="zc-area" d="${top}${bot}Z" fill="url(#${gid})" stroke="none"/>`; }
        }
        for (const sg of segs) { const pts = big ? decimate(sg, 2000) : sg; if (pts.length >= 2) lineSvg += `<path class="zc-line" pathLength="1" d="${linePath(pts, smooth)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`; }
        const showMk = s.marker !== false && (s.marker === true || (k === 'line' && all.length <= 60) || (k === 'area' && all.length <= 24 && false)); const pts2 = big ? decimate(all, 2000) : all;
        for (const p of pts2) { marks.push({ k: 'pt', s: si, i: p.i, x: p.x, y: p.y, r: 8 }); }
        if (!big) for (const p of all) { const tip = tipOf(s, p.i, p.v); ptSvg += `<circle class="zc-pt zc-m zc-mk${showMk ? ' on' : ''}" ${dataAttr(si, p.i, tip, 'pt')} cx="${f2(p.x)}" cy="${f2(p.y)}" r="${showMk ? 3.5 : 4}" fill="${color}"/>`; if (dl(s, false)) lblSvg += hz ? lab(p.x + 8, p.y + 3.5, fmtAxis(p.v, s.nf || nf), 'zc-dl', 'start') : lab(p.x, p.y - 9, fmtAxis(p.v, s.nf || nf)); }
        if (s.trend && all.length >= 2) { const t = regress(all.map((p) => [p.i, p.v])); if (t) { const i0 = all[0].i, i1 = all[all.length - 1].i; const pa = trendPt(t, i0), pb = trendPt(t, i1); const ptf = (i, v) => (hz ? [vPos(ax, v), cPos(i)] : [cPos(i), vPos(ax, v)]); const A = ptf(i0, pa), B = ptf(i1, pb); lineSvg += `<path class="zc-trend" data-k="trend" data-s="${si}" d="M${f2(A[0])} ${f2(A[1])}L${f2(B[0])} ${f2(B[1])}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4" fill="none" opacity=".8"/>`; } }
      } else if (k === 'sc') {
        const all = []; for (let i = 0; i < n; i++) { const x = s.xs ? s.xs[i] : i + 1, y = s.values[i]; if (isNum(x) && isNum(y)) all.push({ x: xPosS(x), y: vPos(0, y), i, xv: x, v: y }); }
        for (const p of all) { const tip = `${s.name}: (${fmtFull(p.xv)}, ${fmtFull(p.v, s.nf || nf)})`; ptSvg += `<circle class="zc-pt on zc-m" ${dataAttr(si, p.i, tip, 'pt')} cx="${f2(p.x)}" cy="${f2(p.y)}" r="4.5" fill="${color}" fill-opacity=".85" stroke="${th.bg}" stroke-width="1"/>`; marks.push({ k: 'pt', s: si, i: p.i, x: p.x, y: p.y, r: 9 }); if (dl(s, false)) lblSvg += lab(p.x, p.y - 9, fmtAxis(p.v, s.nf || nf)); }
        if (s.trend && all.length >= 2) { const t = regress(all.map((p) => [p.xv, p.v])); if (t) { const xa = Math.min(...all.map((p) => p.xv)), xb = Math.max(...all.map((p) => p.xv)); lineSvg += `<path class="zc-trend" data-k="trend" data-s="${si}" d="M${f2(xPosS(xa))} ${f2(vPos(0, trendPt(t, xa)))}L${f2(xPosS(xb))} ${f2(vPos(0, trendPt(t, xb)))}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4" fill="none" opacity=".8"/>`; } }
      }
    });
    body += areaSvg + barSvg + lineSvg + ptSvg + lblSvg;
    void fixedPal;
    return { svg: open() + styleBlock() + (defs ? `<defs>${defs}</defs>` : '') + body + '</svg>', marks, data };
  }
  function regress(pts) { const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; } const d = n * sxx - sx * sx; if (!d) return null; const m = (n * sxy - sx * sy) / d; return { m, b: (sy - m * sx) / n }; }
  const trendPt = (t, x) => t.m * x + t.b;

  CH.render = function (spec, wb, o) { return build(spec, wb, o).svg; };

  // ---------- hit testing ----------
  CH.hit = function (spec, wb, w, h, x, y) {
    const g = build(spec, wb, { w, h, animate: false }); let best = null, bd = Infinity;
    for (const m of g.marks) {
      if (m.k === 'rect') { if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return { s: m.s, i: m.i }; }
      else if (m.k === 'pt') { const d = Math.hypot(m.x - x, m.y - y); if (d <= m.r && d < bd) { bd = d; best = { s: m.s, i: m.i }; } }
      else if (m.k === 'arc') { const dx = x - m.cx, dy = y - m.cy, r = Math.hypot(dx, dy); if (r < m.r0 || r > m.r1) continue; let a = Math.atan2(dy, dx); while (a < m.a0) a += Math.PI * 2; while (a >= m.a0 + Math.PI * 2) a -= Math.PI * 2; if (a >= m.a0 && a <= m.a1) return { s: m.s, i: m.i }; }
    }
    return best;
  };

  // ---------- describe ----------
  const TYPE_NAME = { column: 'Column chart', bar: 'Bar chart', line: 'Line chart', area: 'Area chart', pie: 'Pie chart', donut: 'Donut chart', scatter: 'Scatter chart', combo: 'Combo chart' };
  CH.describe = function (spec, wb) {
    if (!spec) return 'Chart'; let t = ((spec.grouping === 'stacked' ? 'Stacked ' : spec.grouping === 'percent' ? '100% stacked ' : '') + (TYPE_NAME[spec.type] || 'Chart')); t = t.charAt(0).toUpperCase() + t.slice(1);
    const ns = (spec.series || []).length; t += spec.title ? ' “' + spec.title + '”' : ''; t += ' with ' + ns + (ns === 1 ? ' series' : ' series');
    if (wb) { try { const d = CH.resolve(spec, wb); t += ', ' + d.n + ' points' + (d.series.length ? ': ' + d.series.map((s) => s.name).join(', ') : ''); } catch (e) { /* ignore */ } }
    return t;
  };

  // ---------- sparklines ----------
  CH.sparkline = function (spec, wb, w, h) {
    w = w || 100; h = h || 24; const r = readRef(spec, wb, spec.ref); const vals = r ? r.values.map(toNumber) : []; const id = 'zs' + (++uidN);
    const color = spec.color || 'var(--accent,#0a84ff)', negColor = spec.negColor || '#ff453a'; const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" class="zspark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Sparkline">`;
    const nums = vals.filter(isNum); if (!nums.length) return svgOpen + '</svg>';
    const mn = Math.min(...nums), mx = Math.max(...nums); const p = 2; const n = vals.length; const type = spec.type || 'line'; let s = svgOpen;
    const iHi = vals.indexOf(mx), iLo = vals.indexOf(mn); const xAt = (i) => (type === 'line' ? (n > 1 ? p + i / (n - 1) * (w - 2 * p) : w / 2) : p + (i + 0.5) * (w - 2 * p) / n);
    const lo = type === 'column' ? Math.min(mn, 0) : mn, hi = type === 'column' ? Math.max(mx, 0) : mx; const yAt = (v) => (hi === lo ? h / 2 : h - p - (v - lo) / (hi - lo) * (h - 2 * p));
    const mk = (i, col) => (isNum(vals[i]) ? `<circle cx="${f2(xAt(i))}" cy="${f2(yAt(vals[i]))}" r="2.2" fill="${col}"/>` : '');
    let marker = '';
    if (type === 'line') {
      if (spec.axis && mn < 0 && mx > 0) s += `<path d="M${p} ${f2(yAt(0))}H${w - p}" stroke="currentColor" stroke-opacity=".3" stroke-width="1" fill="none"/>`;
      const pts = []; vals.forEach((v, i) => { if (isNum(v)) pts.push({ x: xAt(i), y: yAt(v), i }); }); const segs = []; let cur = [], prev = -2; for (const q of pts) { if (q.i !== prev + 1 && cur.length) { segs.push(cur); cur = []; } cur.push(q); prev = q.i; } if (cur.length) segs.push(cur);
      for (const sg of segs) s += `<path d="${linePath(decimate(sg, 400), false)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (spec.markers) vals.forEach((v, i) => { marker += mk(i, color); });
      if (spec.neg) vals.forEach((v, i) => { if (isNum(v) && v < 0) marker += mk(i, negColor); });
    } else {
      const bw = Math.max(1, (w - 2 * p) / n - 1.2); const zero = type === 'column' ? yAt(0) : h / 2;
      vals.forEach((v, i) => {
        if (!isNum(v)) return; const x = xAt(i) - bw / 2; let y, hh, col = v < 0 ? negColor : color;
        if (type === 'column') { y = Math.min(yAt(v), zero); hh = Math.max(1, Math.abs(yAt(v) - zero)); } else { if (v === 0) { y = h / 2 - 0.5; hh = 1; col = 'currentColor'; } else { hh = h / 2 - p - 1; y = v > 0 ? h / 2 - 0.5 - hh : h / 2 + 0.5; } }
        let fill = col; if (spec.neg && v < 0) fill = negColor; if (spec.high && i === iHi) fill = 'var(--green,#34c759)'; if (spec.low && i === iLo) fill = 'var(--red,#ff3b30)'; if (spec.first && i === vals.findIndex(isNum)) fill = '#ff9500'; if (spec.last && i === n - 1 - [...vals].reverse().findIndex(isNum)) fill = '#ff9500';
        s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(bw)}" height="${f2(hh)}" rx="${bw > 4 ? 1 : 0.5}" fill="${fill}"/>`;
      });
      if (spec.axis && type === 'column' && mn < 0) s += `<path d="M${p} ${f2(zero)}H${w - p}" stroke="currentColor" stroke-opacity=".3" stroke-width="1" fill="none"/>`;
    }
    if (type === 'line') { if (spec.high) marker += mk(iHi, 'var(--green,#34c759)'); if (spec.low) marker += mk(iLo, 'var(--red,#ff3b30)'); if (spec.first) marker += mk(vals.findIndex(isNum), '#ff9500'); if (spec.last) { const li = n - 1 - [...vals].reverse().findIndex(isNum); marker += mk(li, '#ff9500'); } }
    void id; return s + marker + '</svg>';
  };

  // ---------- export ----------
  const VAR_RE = /var\(--[\w-]+\s*,\s*((?:[^()]|\([^()]*\))*)\)/g;
  CH.resolveVars = (svg) => String(svg).replace(VAR_RE, (_, fb) => fb.trim());
  CH.toSVGFile = function (svg) {
    let s = CH.resolveVars(svg); if (!/xmlns=/.test(s.slice(0, 300))) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
  };
  CH.toPNG = function (svgString, w, h, scale) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined' || typeof Image === 'undefined') { reject(new Error('toPNG requires a browser')); return; }
      scale = scale || 2; const img = new Image(); const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CH.toSVGFile(svgString).replace(/^<\?xml[^>]*>\s*/, ''));
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale); const cx = cv.getContext('2d'); cx.scale(scale, scale); cx.drawImage(img, 0, 0, w, h); cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'); };
      img.onerror = () => reject(new Error('SVG render failed')); img.src = url;
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
