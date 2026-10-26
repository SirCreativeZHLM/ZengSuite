/* Chart renderer: returns an SVG string. Used by the slide renderer, canvas/PNG export and pptx export. */
(() => {
  const K = (window.K = window.K || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = (max, min = 0) => { const span = max - min || 1; const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; return { step: st, lo: Math.floor(min / st) * st, hi: Math.ceil(max / st) * st }; };
  const fmt = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(0) + 'k' : +v.toFixed(2) + '');
  K.chartColors = (deck, o) => o.data.series.map((s, i) => K.col(deck, s.c || 'a' + ((i % 6) + 1)));
  K.chartSVG = (deck, o, w = o.w, h = o.h) => {
    const d = o.data, opt = o.opt || {}, kind = o.kind; const fg = K.col(deck, 'fg'), mut = K.col(deck, 'mut'); const font = K.fontCSS(deck, 'body').replace(/"/g, "'");
    const cols = K.chartColors(deck, o); const fs = Math.max(9, Math.min(14, Math.min(w, h) / 24));
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(font)}" font-size="${fs}">`;
    const T = (x, y, s, o2 = {}) => `<text x="${x}" y="${y}" fill="${o2.c || mut}" text-anchor="${o2.a || 'middle'}" ${o2.w ? `font-weight="${o2.w}"` : ''} ${o2.s ? `font-size="${o2.s}"` : ''} dominant-baseline="${o2.b || 'auto'}">${esc(s)}</text>`;
    let top = 6, bot = h - 6;
    if (opt.title) { out += T(w / 2, 6 + fs * 1.2, opt.title, { c: fg, w: 600, s: fs * 1.25 }); top += fs * 2.4; }
    if (opt.legend !== false && d.series.length > (kind === 'pie' || kind === 'donut' ? 0 : 0)) {
      const names = kind === 'pie' || kind === 'donut' ? d.cats : d.series.map((s) => s.name); const widths = names.map((n) => String(n).length * fs * 0.58 + fs * 2); const total = widths.reduce((a, b) => a + b, 0);
      let x = Math.max(8, (w - total) / 2); const y = h - 8 - fs * 0.4; bot -= fs * 2;
      names.forEach((n, i) => { const c = kind === 'pie' || kind === 'donut' ? K.col(deck, 'a' + ((i % 6) + 1)) : cols[i]; out += `<rect x="${x}" y="${y - fs * 0.7}" width="${fs * 0.8}" height="${fs * 0.8}" rx="2" fill="${c}"/>` + T(x + fs, y, n, { a: 'start' }); x += widths[i]; });
    }
    const vals = d.series.map((s) => s.vals.map((v) => +v || 0));
    if (kind === 'pie' || kind === 'donut') {
      const v = vals[0] || [], sum = v.reduce((a, b) => a + Math.abs(b), 0) || 1; const cx = w / 2, cy = (top + bot) / 2, R = Math.max(10, Math.min(w - 20, bot - top - 10) / 2), r0 = kind === 'donut' ? R * 0.58 : 0; let a = -Math.PI / 2;
      v.forEach((x, i) => {
        const da = (Math.abs(x) / sum) * Math.PI * 2, a1 = a + da, big = da > Math.PI ? 1 : 0; const c = K.col(deck, 'a' + ((i % 6) + 1));
        const P = (r, ang) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
        if (da >= Math.PI * 2 - 1e-6) out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c}"/>` + (r0 ? `<circle cx="${cx}" cy="${cy}" r="${r0}" fill="${K.col(deck, 'bg')}"/>` : '');
        else out += `<path d="M${P(r0 || 0, a)}${r0 ? `L${P(R, a)}` : `L${P(R, a)}`}A${R} ${R} 0 ${big} 1 ${P(R, a1)}${r0 ? `L${P(r0, a1)}A${r0} ${r0} 0 ${big} 0 ${P(r0, a)}` : `L${cx} ${cy}`}Z" fill="${c}" stroke="${K.col(deck, 'bg')}" stroke-width="1.5"/>`;
        if (opt.labels !== false && da > 0.2) { const m = a + da / 2, rr = r0 ? (R + r0) / 2 : R * 0.65; out += T(cx + rr * Math.cos(m), cy + rr * Math.sin(m), Math.round((Math.abs(x) / sum) * 100) + '%', { c: '#fff', w: 600, b: 'middle' }); }
        a = a1;
      });
      return out + '</svg>';
    }
    const horiz = kind === 'bar'; const all = vals.flat(); const stacked = opt.stacked && (kind === 'column' || kind === 'bar' || kind === 'area');
    let max = Math.max(0, ...(stacked ? d.cats.map((_, i) => vals.reduce((s, v) => s + Math.max(0, v[i] || 0), 0)) : all)), min = Math.min(0, ...all);
    if (kind === 'line' || kind === 'scatter') { if (min > 0) min = Math.min(...all) - (max - Math.min(...all)) * 0.1; }
    const sc = nice(max, min); const lblW = Math.max(...[sc.lo, sc.hi].map((v) => fmt(v).length)) * fs * 0.6 + 8;
    const catLblH = fs * 1.8; let x0 = lblW + 6, x1 = w - 14, y0 = top + 8, y1 = bot - catLblH;
    if (horiz) { const cl = Math.max(...d.cats.map((c) => String(c).length)) * fs * 0.58 + 10; x0 = cl + 6; y1 = bot - fs * 1.6; }
    const n = d.cats.length || 1;
    const vy = (v) => y1 - ((v - sc.lo) / (sc.hi - sc.lo)) * (y1 - y0), vx = (v) => x0 + ((v - sc.lo) / (sc.hi - sc.lo)) * (x1 - x0);
    for (let t = sc.lo; t <= sc.hi + sc.step / 2; t += sc.step) {
      if (horiz) { const x = vx(t); if (opt.grid !== false) out += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${mut}" stroke-opacity=".25"/>`; out += T(x, y1 + fs * 1.3, fmt(t)); }
      else { const y = vy(t); if (opt.grid !== false) out += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${mut}" stroke-opacity="${Math.abs(t) < 1e-9 ? 0.6 : 0.25}"/>`; out += T(x0 - 6, y, fmt(t), { a: 'end', b: 'middle' }); }
    }
    const S = d.series.length || 1;
    if (kind === 'column' || kind === 'bar') {
      const span = (horiz ? y1 - y0 : x1 - x0) / n, gw = span * 0.72, bw = stacked ? gw : gw / S;
      d.cats.forEach((c, i) => {
        const c0 = (horiz ? y0 : x0) + span * i + (span - gw) / 2; let acc = 0;
        if (horiz) out += T(x0 - 6, y0 + span * i + span / 2, c, { a: 'end', b: 'middle' }); else out += T(x0 + span * i + span / 2, y1 + fs * 1.4, c);
        vals.forEach((v, si) => { const val = v[i] || 0; const a0 = stacked ? acc : 0, a1 = stacked ? acc + val : val; acc = a1; const p0 = c0 + (stacked ? 0 : bw * si);
          if (horiz) { const xa = vx(Math.min(a0, a1)), xb = vx(Math.max(a0, a1)); out += `<rect x="${xa}" y="${p0}" width="${Math.max(0, xb - xa)}" height="${bw - (stacked ? 0 : 2)}" rx="2" fill="${cols[si]}"/>`; if (opt.labels) out += T(xb + 4, p0 + bw / 2, fmt(val), { a: 'start', b: 'middle' }); }
          else { const ya = vy(Math.max(a0, a1)), yb = vy(Math.min(a0, a1)); out += `<rect x="${p0}" y="${ya}" width="${bw - (stacked ? 0 : 2)}" height="${Math.max(0, yb - ya)}" rx="2" fill="${cols[si]}"/>`; if (opt.labels) out += T(p0 + bw / 2, ya - 4, fmt(val)); } });
      });
    } else if (kind === 'line' || kind === 'area') {
      const xs = (i) => x0 + (n === 1 ? (x1 - x0) / 2 : ((x1 - x0) * i) / (n - 1)) * 1; const pad = (x1 - x0) / n / 2; const X = (i) => x0 + pad + ((x1 - x0 - pad * 2) * (n === 1 ? 0.5 : i / (n - 1)));
      d.cats.forEach((c, i) => (out += T(X(i), y1 + fs * 1.4, c)));
      let acc = d.cats.map(() => 0);
      vals.forEach((v, si) => {
        const base = stacked ? acc.slice() : d.cats.map(() => 0); const top2 = v.map((x, i) => (stacked ? base[i] + x : x)); if (stacked) acc = top2;
        const pts = top2.map((y, i) => `${X(i).toFixed(2)} ${vy(y).toFixed(2)}`);
        if (kind === 'area') { const back = base.map((y, i) => `${X(i).toFixed(2)} ${vy(stacked ? y : Math.max(sc.lo, 0)).toFixed(2)}`).reverse(); out += `<path d="M${pts.join('L')}L${back.join('L')}Z" fill="${cols[si]}" fill-opacity="${stacked ? 0.85 : 0.35}"/>`; }
        out += `<path d="M${pts.join('L')}" fill="none" stroke="${cols[si]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        top2.forEach((y, i) => { out += `<circle cx="${X(i)}" cy="${vy(y)}" r="3.5" fill="${K.col(deck, 'bg')}" stroke="${cols[si]}" stroke-width="2"/>`; if (opt.labels) out += T(X(i), vy(y) - 8, fmt(v[i])); });
      });
    } else if (kind === 'scatter') {
      const xv = d.cats.map((c, i) => (isNaN(+c) ? i + 1 : +c)); const xn = nice(Math.max(...xv), Math.min(0, ...xv)); const X = (v) => x0 + ((v - xn.lo) / (xn.hi - xn.lo)) * (x1 - x0);
      for (let t = xn.lo; t <= xn.hi + xn.step / 2; t += xn.step) { out += T(X(t), y1 + fs * 1.4, fmt(t)); if (opt.grid !== false) out += `<line x1="${X(t)}" y1="${y0}" x2="${X(t)}" y2="${y1}" stroke="${mut}" stroke-opacity=".15"/>`; }
      vals.forEach((v, si) => v.forEach((y, i) => (out += `<circle cx="${X(xv[i])}" cy="${vy(y)}" r="5" fill="${cols[si]}" fill-opacity=".8"/>`)));
    }
    return out + '</svg>';
  };
  K.CHART_KINDS = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['donut', 'Donut'], ['scatter', 'Scatter']];
})();
