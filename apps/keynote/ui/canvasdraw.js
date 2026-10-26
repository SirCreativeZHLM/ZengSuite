/* Canvas renderer: slides -> PNG/JPEG (and chart rasterising for pptx export). Mirrors render.js. */
(() => {
  const K = (window.K = window.K || {});
  const imgCache = new WeakMap();
  const loadImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  const mediaImg = async (deck, id) => { const m = deck.media[id]; if (!m) return null; let c = imgCache.get(m); if (!c) { c = loadImg(K.mediaURL(deck, id)); imgCache.set(m, c); } return c; };
  K.svgToImage = (svg) => loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  K.chartCanvas = async (deck, o, scale = 2) => { const im = await K.svgToImage(K.chartSVG(deck, o, o.w, o.h)); const c = document.createElement('canvas'); c.width = Math.round(o.w * scale); c.height = Math.round(o.h * scale); const g = c.getContext('2d'); if (im) g.drawImage(im, 0, 0, c.width, c.height); return c; };
  const canvasBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
  K.canvasPNG = async (c) => new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer());

  // ----- fills -----
  const fillStyle = async (g, deck, f, x, y, w, h) => {
    if (!f) return null; if (typeof f === 'string') f = { t: 'solid', c: f };
    if (f.t === 'solid') return K.rgba(deck, f.c, f.a ?? 1);
    if (f.t === 'grad') {
      let gr; const stops = f.stops || [];
      if (f.kind === 'radial') { gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(1, Math.min(w, h) / 2)); }
      else { const a = (((f.ang ?? 180) - 90) * Math.PI) / 180; const cx = x + w / 2, cy = y + h / 2; const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)); gr = g.createLinearGradient(cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2, cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2); }
      stops.forEach((s) => gr.addColorStop(Math.max(0, Math.min(1, s[0])), K.rgba(deck, s[1], s[2] ?? 1))); return gr;
    }
    if (f.t === 'img') { const im = await mediaImg(deck, f.m); if (!im) return null; const mode = f.mode || 'fill'; if (mode === 'tile') return g.createPattern(im, 'repeat'); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const cg = c.getContext('2d'); if (mode === 'stretch') cg.drawImage(im, 0, 0, c.width, c.height); else { const s = mode === 'fit' ? Math.min(c.width / im.width, c.height / im.height) : Math.max(c.width / im.width, c.height / im.height); cg.drawImage(im, (c.width - im.width * s) / 2, (c.height - im.height * s) / 2, im.width * s, im.height * s); } const pat = g.createPattern(c, 'no-repeat'); pat.setTransform && pat.setTransform(new DOMMatrix().translate(x, y)); return pat; }
    return null;
  };

  // ----- text layout -----
  const fontStr = (deck, ts, r, size) => `${(r.i ?? ts.i) ? 'italic ' : ''}${(r.b ?? ts.b) ? 700 : (r.w || ts.w || 400)} ${size}px ${K.fontCSS(deck, r.f || ts.f)}`;
  const layoutText = (g, deck, paras, ts, W, ctx, fit = 1) => {
    const lines = []; const counters = new Array(9).fill(0); const ind0 = Math.max(16, ts.sz * 0.85) * fit; let y = 0;
    for (const p of paras) {
      const list = p.list ?? ts.list; const lv = p.lv || 0; const al = p.al || ts.al; const lsp = p.ls || ts.ls || 1.15; const sa = (p.sa ?? ts.sa ?? 0) * fit, sb = (p.sb ?? ts.sb ?? 0) * fit;
      let ind = lv * ind0, mk = null; if (list && list !== 'none') { counters[lv] = (counters[lv] || 0) + 1; for (let i = lv + 1; i < 9; i++) counters[i] = 0; ind = ind0 * (lv + 1); mk = K.marker(list, lv, counters[lv]); } else counters.fill(0);
      // tokens
      const toks = []; for (const r of p.runs) { const size = (r.sz || ts.sz) * (r.sup || r.sub ? 0.65 : 1) * fit; const text = r.field ? K.fieldText(deck, r.field, ctx) : r.t; const parts = text.split(/(\s+)/).filter((s) => s !== ''); parts.forEach((t) => toks.push({ t, r, size, font: fontStr(deck, ts, r, size) })); if (!parts.length) toks.push({ t: '', r, size, font: fontStr(deck, ts, r, size) }); }
      let line = { toks: [], w: 0, size: ts.sz * fit, ind, al, mk, first: true, lsp }; const avail = W - ind; const lineList = [];
      const push = () => { lineList.push(line); line = { toks: [], w: 0, size: ts.sz * fit, ind, al, mk: null, first: false, lsp }; };
      for (const tk of toks) {
        if (tk.t.includes('\n')) { tk.t.split('\n').forEach((seg, i, a) => { if (seg) { g.font = tk.font; const w = g.measureText(seg).width; line.toks.push({ ...tk, t: seg, w }); line.w += w; line.size = Math.max(line.size, tk.size); } if (i < a.length - 1) push(); }); continue; }
        g.font = tk.font; const w = g.measureText(tk.t).width + (ts.tr ? ts.tr * tk.t.length : 0); const isSp = /^\s+$/.test(tk.t);
        if (!isSp && line.w + w > avail && line.toks.some((q) => !/^\s+$/.test(q.t))) { while (line.toks.length && /^\s+$/.test(line.toks[line.toks.length - 1].t)) { line.w -= line.toks.pop().w; } push(); }
        if (isSp && !line.toks.length) continue; line.toks.push({ ...tk, w }); line.w += w; line.size = Math.max(line.size, tk.size);
      }
      lineList.push(line);
      lineList.forEach((ln, i) => { ln.h = ln.size * lsp; ln.y = y + (i === 0 ? sb : 0); y = ln.y + ln.h; lines.push(ln); }); y += sa;
    }
    return { lines, h: y };
  };
  const drawText = (g, deck, o, paras, ts, w, h, ctx, pad) => {
    const innerW = w - pad * 2, innerH = h - pad * 2; const cols = ts.cols > 1 ? ts.cols : 1; const gap = (ts.gap ?? 24); const cw = (innerW - gap * (cols - 1)) / cols;
    let fit = 1; let L = layoutText(g, deck, paras, ts, cw, ctx, 1);
    if (ts.fit === 'shrink' && L.h > innerH * cols) { let lo = 0.25, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; const t = layoutText(g, deck, paras, ts, cw, ctx, m); if (t.h <= innerH * cols) lo = m; else hi = m; } fit = lo; L = layoutText(g, deck, paras, ts, cw, ctx, fit); }
    const startY = cols > 1 ? 0 : ts.va === 'm' ? (innerH - L.h) / 2 : ts.va === 'b' ? innerH - L.h : 0;
    g.save(); g.textBaseline = 'alphabetic';
    let col = 0, yoff = 0;
    for (const ln of L.lines) {
      if (cols > 1 && ln.y - yoff + ln.h > innerH && col < cols - 1) { col++; yoff = ln.y; }
      const x0 = pad + col * (cw + gap), y0 = pad + (cols > 1 ? ln.y - yoff : startY + ln.y); const avail = cw - ln.ind; let x = x0 + ln.ind; if (ln.al === 'c') x += (avail - ln.w) / 2; else if (ln.al === 'r') x += avail - ln.w;
      const base = y0 + ln.h / 2 + ln.size * 0.35; // approximate baseline
      if (ln.mk) { g.font = fontStr(deck, ts, {}, ln.size); g.fillStyle = ['b', 'd', 'c'].includes(ts.list || '') || true ? K.col(deck, 'a1') : K.col(deck, ts.c); g.fillText(ln.mk, x0 + ln.ind - Math.max(16, ts.sz * 0.85) * fit, base); }
      let extra = 0; if (ln.al === 'j' && !ln.last && ln.toks.length > 1) { const sp = ln.toks.filter((t) => /^\s+$/.test(t.t)).length; if (sp) extra = (avail - ln.w) / sp; }
      for (const tk of ln.toks) {
        g.font = tk.font; const color = tk.r.c ? K.col(deck, tk.r.c) : tk.r.l ? K.col(deck, 'a1') : K.col(deck, ts.c); if (tk.r.hl) { g.fillStyle = K.col(deck, tk.r.hl); g.fillRect(x, y0, tk.w, ln.h); } g.fillStyle = color;
        const yy = tk.r.sup ? base - tk.size * 0.5 : tk.r.sub ? base + tk.size * 0.2 : base; let txt = tk.t; if (ts.up) txt = txt.toUpperCase();
        if (ts.tr && 'letterSpacing' in g) g.letterSpacing = ts.tr + 'px'; g.fillText(txt, x, yy); if ('letterSpacing' in g) g.letterSpacing = '0px';
        const u = tk.r.u ?? ts.u, s = tk.r.s ?? ts.s; if (tk.r.l || u) { g.fillRect(x, yy + tk.size * 0.1, tk.w, Math.max(1, tk.size / 18)); } if (s) g.fillRect(x, yy - tk.size * 0.3, tk.w, Math.max(1, tk.size / 18));
        x += tk.w + (/^\s+$/.test(tk.t) ? extra : 0);
      }
    }
    g.restore();
  };

  // ----- objects -----
  const dashArr = (l) => { const w = l.w || 1; return l.dash === 'dash' ? [w * 4, w * 2.5] : l.dash === 'dot' ? [0.1, w * 2.2] : l.dash === 'dashdot' ? [w * 4, w * 2, 0.1, w * 2] : []; };
  const drawObj = async (g, deck, o, ctx) => {
    if (o.hid) return; g.save();
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.op != null) g.globalAlpha = o.op; if (o.bl && 'filter' in g) g.filter = `blur(${o.bl}px)`;
    if (o.type === 'group') { for (const k of o.kids) await drawObj(g, deck, k, ctx); g.restore(); return; }
    if (o.type === 'conn') {
      const r = K.connPath(o, ctx.objs); const l = o.line || { c: 'fg', w: 3 }; const col = K.rgba(deck, l.c, l.a ?? 1); g.strokeStyle = col; g.lineWidth = l.w || 1; g.setLineDash(dashArr(l)); g.lineJoin = 'round'; g.lineCap = 'butt'; if (o.sh) { g.shadowColor = K.rgba(deck, o.sh.c, o.sh.a ?? 0.4); g.shadowBlur = o.sh.b; g.shadowOffsetX = o.sh.x; g.shadowOffsetY = o.sh.y; } g.stroke(new Path2D(r.d)); g.setLineDash([]);
      for (const [type, pt, ang] of [[l.tail, r.A, r.ha], [l.head, r.B, r.hb]]) { const hp = type && type !== 'none' ? K.headPath(type, pt.x, pt.y, ang, l.w || 1) : null; if (hp) { const p = new Path2D(hp.d); if (hp.fill) { g.fillStyle = col; g.fill(p); } g.lineCap = 'round'; g.stroke(p); } } g.restore(); return;
    }
    g.translate(cx, cy); if (o.rot) g.rotate((o.rot * Math.PI) / 180); g.translate(-o.w / 2, -o.h / 2);
    const setShadow = () => { if (o.sh) { g.shadowColor = K.rgba(deck, o.sh.c, o.sh.a ?? 0.4); g.shadowBlur = o.sh.b * 1; g.shadowOffsetX = o.sh.x; g.shadowOffsetY = o.sh.y; } };
    const flip = () => { if (o.fh || o.fv) { g.translate(o.fh ? o.w : 0, o.fv ? o.h : 0); g.scale(o.fh ? -1 : 1, o.fv ? -1 : 1); } };
    if (o.type === 'text' || o.type === 'shape') {
      const sh = K.shapes[o.type === 'text' ? 'rect' : o.shape] || K.shapes.rect; const d = o.path || K.shapePath(o.type === 'text' ? 'rect' : o.shape, o.w, o.h, o.adj); const p = new Path2D(d);
      const fill = o.fill === undefined && sh.open ? null : o.fill; g.save(); flip(); setShadow(); if (fill) { const fs = await fillStyle(g, deck, fill, 0, 0, o.w, o.h); if (fs) { g.fillStyle = fs; g.fill(p, sh.evenodd || o.eo ? 'evenodd' : 'nonzero'); } }
      if (o.line && o.line.c && o.line.w !== 0) { g.shadowColor = 'transparent'; if (!fill) setShadow(); g.strokeStyle = K.rgba(deck, o.line.c, o.line.a ?? 1); g.lineWidth = o.line.w || 1; g.setLineDash(dashArr(o.line)); g.lineJoin = 'round'; g.stroke(p); g.setLineDash([]); } g.restore();
      if (!K.isEmptyText(o)) { const ts = K.tstyle(o); g.save(); if (!fill && !o.line) setShadow(); drawText(g, deck, o.paras, ts, o.w, o.h, ctx, ts.pad ?? 6); g.restore(); }
    } else if (o.type === 'image') {
      const im = await mediaImg(deck, o.m); if (im) { const c = o.crop || { x: 0, y: 0, w: 1, h: 1 }; g.save(); flip(); setShadow(); const mask = o.mask && o.mask !== 'rect' ? new Path2D(K.shapePath(o.mask, o.w, o.h, o.adj)) : null;
        if (o.sh) { g.fillStyle = '#000'; g.fill(mask || new Path2D(`M0 0H${o.w}V${o.h}H0Z`)); } g.shadowColor = 'transparent'; g.beginPath(); if (mask) g.clip(mask); else g.rect(0, 0, o.w, o.h); const a = o.adj || {}; const f = []; if (a.br) f.push(`brightness(${1 + a.br})`); if (a.co) f.push(`contrast(${1 + a.co})`); if (a.sa) f.push(`saturate(${1 + a.sa})`); if (a.hu) f.push(`hue-rotate(${a.hu}deg)`); if (a.gr) f.push(`grayscale(${a.gr})`); if (a.se) f.push(`sepia(${a.se})`); if (a.ib) f.push(`blur(${a.ib}px)`); if (f.length && 'filter' in g) g.filter = f.join(' ');
        g.drawImage(im, c.x * im.width, c.y * im.height, c.w * im.width, c.h * im.height, 0, 0, o.w, o.h); g.restore();
        if (o.line && o.line.c && o.line.w) { g.strokeStyle = K.rgba(deck, o.line.c); g.lineWidth = o.line.w; g.stroke(mask || new Path2D(`M0 0H${o.w}V${o.h}H0Z`)); } }
    } else if (o.type === 'chart') { setShadow(); const im = await K.svgToImage(K.chartSVG(deck, o, o.w, o.h)); if (im) g.drawImage(im, 0, 0, o.w, o.h); }
    else if (o.type === 'table') {
      const st = o.st || {}; const ts = K.tstyle(o); const hdrC = K.col(deck, st.c || 'a1'); const hdrFg = K.lum(deck, st.c || 'a1') > 0.62 ? '#111' : '#fff'; const line = K.rgba(deck, 'fg', 0.18); let y = 0; setShadow();
      for (let r = 0; r < o.cells.length; r++) { let x = 0; for (let c = 0; c < o.cells[r].length; c++) { const cell = o.cells[r][c]; const cw = o.cw[c], rh = o.rh[r]; const hdr = st.hdr && r === 0, band = st.band && !hdr && (r - (st.hdr ? 1 : 0)) % 2 === 1;
          const fs = cell.fill ? await fillStyle(g, deck, cell.fill, x, y, cw, rh) : hdr ? hdrC : band ? K.rgba(deck, st.c || 'a1', 0.1) : null; if (fs) { g.fillStyle = fs; g.fillRect(x, y, cw, rh); }
          g.shadowColor = 'transparent'; g.strokeStyle = line; g.lineWidth = 1; const gr = st.grid || 'h'; if (gr === 'all') g.strokeRect(x + 0.5, y + 0.5, cw, rh); else if (gr === 'h') { g.beginPath(); g.moveTo(x, y + rh); g.lineTo(x + cw, y + rh); g.stroke(); }
          const cts = Object.assign({}, ts, cell.ts || {}); if (hdr) { cts.b = true; if (!cell.ts || !cell.ts.c) cts.c = hdrFg; } if (cell.al) cts.al = cell.al; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, cw, rh); g.clip(); drawText(g, deck, cell.paras, cts, cw, rh, ctx, 8); g.restore(); x += cw; } y += o.rh[r]; }
    } else if (o.type === 'media') { g.fillStyle = o.kind === 'video' ? '#111' : 'rgba(128,128,128,.25)'; g.fillRect(0, 0, o.w, o.h); g.fillStyle = o.kind === 'video' ? '#fff' : '#888'; g.beginPath(); g.moveTo(o.w / 2 - 10, o.h / 2 - 14); g.lineTo(o.w / 2 + 14, o.h / 2); g.lineTo(o.w / 2 - 10, o.h / 2 + 14); g.closePath(); g.fill(); }
    g.restore();
  };

  K.drawSlide = async (deck, slide, index, scale = 1, bgOverride) => {
    try { await document.fonts.load('16px Inter'); } catch { }
    const W = deck.size.w, H = deck.size.h; const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale); const g = c.getContext('2d'); g.scale(scale, scale);
    const lay = K.layoutOf(deck, slide); const bg = await fillStyle(g, deck, slide.bg || (lay && lay.bg) || deck.theme.bgFill || { t: 'solid', c: 'bg' }, 0, 0, W, H); g.fillStyle = bgOverride || bg || '#fff'; g.fillRect(0, 0, W, H);
    const ctx = { index, objs: lay ? lay.objs : [] };
    if (lay) for (const o of lay.objs) { if (o.ph) { if (o.ph === 'slideno' && !(deck.opts.showNumbers && !slide.noNum)) continue; if (o.ph === 'date' && !deck.opts.showDate) continue; if (o.ph === 'footer' && !deck.opts.footer) continue; if (!['slideno', 'date', 'footer'].includes(o.ph)) continue; } await drawObj(g, deck, o, ctx); }
    const sctx = { index, objs: slide.objs };
    for (const o of slide.objs) { if (o.ph && K.isEmptyText(o) && o.type !== 'image') continue; await drawObj(g, deck, o, sctx); }
    return c;
  };

  // ----- exports -----
  const pad = (n, t) => String(n + 1).padStart(String(t).length, '0');
  K.exportImages = async (deck, fmt, base, only) => {
    const type = fmt === 'jpeg' ? 'image/jpeg' : 'image/png'; const ext = fmt === 'jpeg' ? 'jpg' : 'png'; const scale = Math.min(3, Math.max(1, 1920 / deck.size.w));
    const make = async (i) => { const c = await K.drawSlide(deck, deck.slides[i], i, scale, fmt === 'jpeg' ? '#ffffff' : undefined); return new Uint8Array(await (await new Promise((r) => c.toBlob(r, type, 0.92))).arrayBuffer()); };
    if (only != null) { const h = await zeng.files.saveAs(new Blob([await make(only)], { type }), { name: `${base}-${only + 1}.${ext}`, filters: [{ name: ext.toUpperCase(), exts: [ext] }] }); if (h) zk.toast('Exported ' + h.name); return; }
    const files = {}; for (let i = 0; i < deck.slides.length; i++) files[`${base}-${pad(i, deck.slides.length)}.${ext}`] = [await make(i), { level: 0 }];
    const zip = fflate.zipSync(files); const h = await zeng.files.saveAs(new Blob([zip], { type: 'application/zip' }), { name: `${base}-slides.zip`, filters: [{ name: 'Zip archive', exts: ['zip'] }] }); if (h) zk.toast('Exported ' + h.name);
  };
})();
