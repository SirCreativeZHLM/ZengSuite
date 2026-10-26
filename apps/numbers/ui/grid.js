/* ZengNumbers grid: canvas-rendered, natively scrolled, virtualised sheet view with selection, resize, fill-drag and move-drag. */
(function () {
  'use strict';
  const ZN = window.ZN; const MAXR = ZN.MAXR, MAXC = ZN.MAXC;
  const HDR_H = 24;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif';
  const DASH = { dashed: [4, 3], mediumDashed: [5, 3], dotted: [1.5, 2], dashDot: [4, 2, 1.5, 2], mediumDashDot: [4, 2, 1.5, 2], dashDotDot: [4, 2, 1.5, 2, 1.5, 2], mediumDashDotDot: [4, 2, 1.5, 2, 1.5, 2], slantDashDot: [4, 2, 1.5, 2] };
  const BW = { thin: 1, hair: 0.5, medium: 2, thick: 3, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, double: 3 };

  // ---------- table styles (id -> palette) ----------
  const TABLE_HUES = { blue: '#0a84ff', green: '#30d158', orange: '#ff9f0a', red: '#ff453a', purple: '#bf5af2', teal: '#40c8e0', gray: '#8e8e93' };
  const hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return '#' + [0, 1, 2].map((i) => Math.round(x[i] * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join(''); };
  const lum = (h) => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const tableStyleDef = (id, dark) => { // id: 'blue-medium' | 'gray-light' | 'green-dark' | 'none'
    const [hue, kind] = String(id || 'blue-medium').split('-'); const base = TABLE_HUES[hue] || TABLE_HUES.blue; if (id === 'none') return null;
    if (kind === 'light') return { hbg: null, hfc: base, hline: base, band: mix(dark ? '#1e1e20' : '#ffffff', base, dark ? 0.16 : 0.12), line: null };
    if (kind === 'dark') return { hbg: mix(base, '#000000', 0.25), hfc: '#ffffff', band: mix(dark ? '#1e1e20' : '#ffffff', base, dark ? 0.26 : 0.22), line: null, tbg: mix(base, '#000000', 0.25), tfc: '#fff' };
    return { hbg: base, hfc: '#ffffff', band: mix(dark ? '#1e1e20' : '#ffffff', base, dark ? 0.2 : 0.14), line: null, tline: base };
  };
  ZN.tableStyleDef = tableStyleDef; ZN.TABLE_HUES = TABLE_HUES;

  class GridView {
    constructor(app) {
      this.app = app; this.sc = document.getElementById('scroller'); this.cv = document.getElementById('cv'); this.ctx = this.cv.getContext('2d');
      this.spacer = document.getElementById('spacer'); this.overlay = document.getElementById('overlay'); this.chartclip = document.getElementById('chartclip'); this.chartlayer = document.getElementById('chartlayer');
      this.sheet = null; this.vw = 0; this.vh = 0; this.dpr = window.devicePixelRatio || 1; this.extRows = 1000; this.theme = {}; this.pending = 0; this.measureCache = new Map(); this.imgCache = new Map();
      this.drag = null; this.marching = null; this.guides = null; this.refHighlights = []; this.fillPreview = null; this.movePreview = null; this.hoverCursor = '';
      this.geoKey = null; this.rowCustom = null; this.showHeaders = true; this.dispCache = new Map(); this.dispVer = -1;
      this.readTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.readTheme(); this.invalidate(); });
      new ResizeObserver(() => this.resize()).observe(this.sc);
      this.sc.addEventListener('scroll', () => { this.syncScroll(); this.invalidate(); this.extendIfNeeded(); }, { passive: true });
      this.sc.addEventListener('pointerdown', (e) => this.onDown(e));
      this.sc.addEventListener('pointermove', (e) => this.onMove(e));
      this.sc.addEventListener('pointerup', (e) => this.onUp(e)); this.sc.addEventListener('pointercancel', (e) => this.onUp(e));
      this.sc.addEventListener('dblclick', (e) => this.onDbl(e));
      this.sc.addEventListener('contextmenu', (e) => this.onCtx(e));
      this.sc.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.app.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08); } }, { passive: false });
    }
    readTheme() {
      const cs = getComputedStyle(document.documentElement); const g = (n, d) => cs.getPropertyValue(n).trim() || d;
      this.theme = { bg: g('--bg', '#fff'), fg: g('--fg', '#111'), fg2: g('--fg-2', '#666'), fg3: g('--fg-3', '#999'), line: g('--line', 'rgba(0,0,0,.1)'), hdr: g('--bg-2', '#f5f5f7'), hdrLine: g('--line-strong', 'rgba(0,0,0,.18)'), accent: g('--accent', '#30d158'), accentRgb: g('--accent-rgb', '48,209,88'), dark: matchMedia('(prefers-color-scheme: dark)').matches };
      this.theme.grid = this.theme.dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.09)';
    }
    // ---------- geometry ----------
    get z() { return this.sheet ? this.sheet.zoom || 1 : 1; }
    get hw() { if (!this.showHeaders) return 0; const d = String(Math.max(100, this.sheet ? this.sheet.maxRow() + 1 : 100)).length; return Math.round(Math.max(40, d * 8 + 18) * this.z); }
    get hh() { return this.showHeaders ? Math.round(HDR_H * this.z) : 0; }
    setSheet(sh) { this.sheet = sh; this.geoKey = null; this.dispCache.clear(); this.extRows = Math.max(1000, sh.maxRow() + 200); this.ensureGeo(); this.updateSpacer(); this.applyScroll(); this.invalidate(); }
    ensureGeo() {
      const sh = this.sheet; if (!sh) return; const key = sh.colW + '|' + sh.hiddenCols + '|' + sh.rowH + '|' + sh.hiddenRows + '|' + sh.defColW + '|' + sh.defRowH;
      const sig = [sh.colW, sh.hiddenCols, sh.rowH, sh.hiddenRows, sh.defColW, sh.defRowH];
      if (this.geoKey && this.geoKey.every((x, i) => x === sig[i]) && this.geoSheet === sh) return; this.geoKey = sig; this.geoSheet = sh;
      const X = new Float64Array(MAXC + 1); let x = 0; for (let c = 0; c < MAXC; c++) { X[c] = x; x += sh.hiddenCols[c] ? 0 : (sh.colW[c] !== undefined ? sh.colW[c] : sh.defColW); } X[MAXC] = x; this.colXs = X;
      const idx = new Set(); for (const k in sh.rowH) idx.add(+k); for (const k in sh.hiddenRows) idx.add(+k); const list = [...idx].sort((a, b) => a - b); const dh = sh.defRowH; let cum = 0; const cumd = new Float64Array(list.length); const hs = new Float64Array(list.length);
      list.forEach((r, i) => { const h = sh.hiddenRows[r] ? 0 : (sh.rowH[r] !== undefined ? sh.rowH[r] : dh); hs[i] = h; cum += h - dh; cumd[i] = cum; });
      this.rowList = list; this.rowCum = cumd; this.rowHs = hs;
    }
    colX(c) { return this.colXs[c]; } // unzoomed absolute
    colW(c) { return this.colXs[c + 1] - this.colXs[c]; }
    _cntBefore(r) { const l = this.rowList; let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (l[m] < r) lo = m + 1; else hi = m; } return lo; }
    rowY(r) { const k = this._cntBefore(r); return r * this.sheet.defRowH + (k ? this.rowCum[k - 1] : 0); }
    rowH(r) { const l = this.rowList; let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (l[m] < r) lo = m + 1; else hi = m; } return lo < l.length && l[lo] === r ? this.rowHs[lo] : this.sheet.defRowH; }
    rowAt(y) { let lo = 0, hi = MAXR - 1; if (y <= 0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.rowY(m) <= y) lo = m; else hi = m - 1; } return lo; }
    colAt(x) { const X = this.colXs; let lo = 0, hi = MAXC - 1; if (x <= 0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (X[m] <= x) lo = m; else hi = m - 1; } return lo; }
    get frozen() { const f = this.sheet.freeze || { r: 0, c: 0 }; return f; }
    frozenW() { return this.colX(this.frozen.c) * this.z; } frozenH() { return this.rowY(this.frozen.r) * this.z; }
    totalW() { return this.colX(MAXC) * this.z; }
    updateSpacer() {
      if (!this.sheet) return; this.ensureGeo(); const z = this.z; const f = this.frozen; const rows = this.extRows;
      const w = this.hw + this.frozenW() + Math.max(0, (this.colX(Math.min(MAXC, Math.max(60, this.sheet.maxCol() + 30))) - this.colX(f.c))) * z; const h = this.hh + this.frozenH() + (this.rowY(rows) - this.rowY(f.r)) * z;
      this.spacer.style.width = w + 'px'; this.spacer.style.height = h + 'px';
    }
    extendIfNeeded() { const sc = this.sc; if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 300 && this.extRows < MAXR) { this.extRows = Math.min(MAXR, this.extRows + 500); this.updateSpacer(); } if (sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 300 && this.sheet.maxCol() + 30 < MAXC) { this.extCols = (this.extCols || 0) + 20; } }
    ensureRow(r) { if (r + 50 > this.extRows) { this.extRows = Math.min(MAXR, r + 200); this.updateSpacer(); } }
    resize() { const r = this.sc.getBoundingClientRect(); this.vw = this.sc.clientWidth; this.vh = this.sc.clientHeight; this.dpr = window.devicePixelRatio || 1; const cv = this.cv; cv.width = Math.round(this.vw * this.dpr); cv.height = Math.round(this.vh * this.dpr); cv.style.width = this.vw + 'px'; cv.style.height = this.vh + 'px'; this.invalidate(); this.layoutOverlays(); }
    syncScroll() { const t = this.chartlayer; if (t) t.style.transform = `translate(${-this.sc.scrollLeft}px,${-this.sc.scrollTop}px)`; this.layoutOverlays(); }
    applyScroll() { const s = this.sheet.scroll; if (s) { this.sc.scrollLeft = s.l; this.sc.scrollTop = s.t; } else { this.sc.scrollLeft = 0; this.sc.scrollTop = 0; } this.syncScroll(); }
    // screen position of cell rect (null if scrolled out when not frozen) in stage coordinates
    colScreenX(c) { const f = this.frozen, z = this.z; if (c < f.c) return this.hw + this.colX(c) * z; return this.hw + this.frozenW() + (this.colX(c) - this.colX(f.c)) * z - this.sc.scrollLeft; }
    rowScreenY(r) { const f = this.frozen, z = this.z; if (r < f.r) return this.hh + this.rowY(r) * z; return this.hh + this.frozenH() + (this.rowY(r) - this.rowY(f.r)) * z - this.sc.scrollTop; }
    cellRect(r, c) { const m = this.sheet.mergeAt(r, c); let r1 = r, c1 = c, r2 = r, c2 = c; if (m) { r1 = m[0]; c1 = m[1]; r2 = m[2]; c2 = m[3]; } const z = this.z; const x = this.colScreenX(c1), y = this.rowScreenY(r1); return { x, y, w: (this.colX(c2 + 1) - this.colX(c1)) * z, h: (this.rowY(r2 + 1) - this.rowY(r1)) * z }; }
    rangeRect(r1, c1, r2, c2) { const z = this.z; const x = this.colScreenX(c1), y = this.rowScreenY(r1); return { x, y, w: (this.colX(c2 + 1) - this.colX(c1)) * z, h: (this.rowY(r2 + 1) - this.rowY(r1)) * z }; }
    // find column/row index under a screen coordinate
    colAtScreen(x) { const f = this.frozen, z = this.z, fw = this.frozenW(); if (x < this.hw + fw && f.c > 0) return this.colAt((x - this.hw) / z); return this.colAt(this.colX(f.c) + (x - this.hw - fw + this.sc.scrollLeft) / z); }
    rowAtScreen(y) { const f = this.frozen, z = this.z, fh = this.frozenH(); if (y < this.hh + fh && f.r > 0) return this.rowAt((y - this.hh) / z); return this.rowAt(this.rowY(f.r) + (y - this.hh - fh + this.sc.scrollTop) / z); }
    scrollTo(r, c) { // minimal scroll to make cell visible
      const sc = this.sc, z = this.z, f = this.frozen; const rc = this.cellRect(r, c); const fw = this.frozenW(), fh = this.frozenH();
      const left = this.hw + fw, top = this.hh + fh;
      if (c >= f.c) { if (rc.x < left) sc.scrollLeft += rc.x - left; else if (rc.x + rc.w > this.vw) sc.scrollLeft += rc.x + rc.w - this.vw + 2; }
      if (r >= f.r) { if (rc.y < top) sc.scrollTop += rc.y - top; else if (rc.y + rc.h > this.vh) sc.scrollTop += rc.y + rc.h - this.vh + 2; }
    }
    // ---------- invalidation ----------
    invalidate() { if (this.pending) return; this.pending = requestAnimationFrame(() => { this.pending = 0; try { this.draw(); } catch (e) { console.error(e); } }); }
    layoutOverlays() { const cc = this.chartclip; if (!cc || !this.sheet) return; cc.style.left = this.hw + this.frozenW() + 'px'; cc.style.top = this.hh + this.frozenH() + 'px'; cc.style.width = Math.max(0, this.vw - this.hw - this.frozenW()) + 'px'; cc.style.height = Math.max(0, this.vh - this.hh - this.frozenH()) + 'px'; this.app.layoutCharts && this.app.layoutCharts(); }
    // ---------- text measuring ----------
    fontOf(st, z) { const px = (st.fs ? st.fs * 4 / 3 : 13) * z; return (st.i ? 'italic ' : '') + (st.b ? '600 ' : '') + px.toFixed(2) + 'px ' + (st.fn ? '"' + st.fn + '", ' : '') + FONT; }
    measure(text, font) { const k = font + '|' + text; let w = this.measureCache.get(k); if (w === undefined) { if (this.measureCache.size > 20000) this.measureCache.clear(); this.ctx.font = font; w = this.ctx.measureText(text).width; this.measureCache.set(k, w); } return w; }
    // ---------- display ----------
    display(r, c, cell, st, w, fx) {
      const v = cell ? cell.v : undefined; if (v === undefined || v === null) return null;
      const wbv = this.app.wb.version; if (this.dispVer !== wbv) { this.dispCache.clear(); this.dispVer = wbv; }
      const key = r * 16384 + c; let d = this.dispCache.get(key);
      if (d && d.w === Math.round(w)) return d;
      let out; const nf = st.nf || 'General';
      try { out = ZN.fmt ? ZN.fmt.format(v, nf, nf === 'General' ? { maxChars: Math.max(3, Math.floor(w / (7 * this.z))) } : undefined) : { text: String(v) }; } catch (e) { out = { text: String(v) }; }
      d = { text: out.text, color: out.color, align: out.align, fits: out.fits, w: Math.round(w), numeric: typeof v === 'number', err: v instanceof ZN.ZErr, bool: typeof v === 'boolean', fill: out.fill }; this.dispCache.set(key, d); return d;
    }
    // ---------- drawing ----------
    draw() {
      const sh = this.sheet; if (!sh) return; this.ensureGeo(); const ctx = this.ctx, dpr = this.dpr, T = this.theme, z = this.z; const W = this.vw, H = this.vh;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
      const f = this.frozen, hw = this.hw, hh = this.hh, fw = this.frozenW(), fh = this.frozenH(), sl = this.sc.scrollLeft, st_ = this.sc.scrollTop;
      this.visible = { fw, fh };
      const wb = this.app.wb; this.cfMap = null;
      // visible index ranges
      const cMain0 = this.colAt(this.colX(f.c) + sl / z), cMain1 = Math.min(MAXC - 1, this.colAt(this.colX(f.c) + (W - hw - fw + sl) / z));
      const rMain0 = this.rowAt(this.rowY(f.r) + st_ / z), rMain1 = Math.min(MAXR - 1, this.rowAt(this.rowY(f.r) + (H - hh - fh + st_) / z));
      this.vis = { c0: cMain0, c1: cMain1, r0: rMain0, r1: rMain1 };
      if (sh.cf.length && ZN.cf) { try { this.cfMap = ZN.cf.evaluate(wb, sh, 0, 0, Math.max(rMain1, f.r), Math.max(cMain1, f.c)); } catch (e) { console.warn('cf', e); } }
      const regions = [];
      regions.push({ x0: hw + fw, y0: hh + fh, x1: W, y1: H, c0: cMain0, c1: cMain1, r0: rMain0, r1: rMain1 });
      if (f.c > 0) regions.push({ x0: hw, y0: hh + fh, x1: hw + fw, y1: H, c0: 0, c1: f.c - 1, r0: rMain0, r1: rMain1 });
      if (f.r > 0) regions.push({ x0: hw + fw, y0: hh, x1: W, y1: hh + fh, c0: cMain0, c1: cMain1, r0: 0, r1: f.r - 1 });
      if (f.r > 0 && f.c > 0) regions.push({ x0: hw, y0: hh, x1: hw + fw, y1: hh + fh, c0: 0, c1: f.c - 1, r0: 0, r1: f.r - 1 });
      for (const rg of regions) this.drawRegion(rg);
      // freeze lines
      if (f.c > 0 || f.r > 0) { ctx.strokeStyle = T.hdrLine; ctx.lineWidth = 1; ctx.beginPath(); if (f.c > 0) { ctx.moveTo(hw + fw + .5, hh); ctx.lineTo(hw + fw + .5, H); } if (f.r > 0) { ctx.moveTo(hw, hh + fh + .5); ctx.lineTo(W, hh + fh + .5); } ctx.stroke(); }
      this.drawSelection(); if (this.showHeaders) this.drawHeaders(cMain0, cMain1, rMain0, rMain1);
      this.drawGuides();
    }
    cellStyle(r, c, cell) { const sid = cell && cell.s !== undefined ? cell.s : this.sheet.styleId(r, c); return this.app.wb.style(sid); }
    tableFx(r, c) { // table-style effect for a cell
      const tbs = this.sheet.tables; if (!tbs.length) return null;
      for (const t of tbs) { if (r < t.r1 || r > t.r2 || c < t.c1 || c > t.c2) continue; const d = tableStyleDef(t.style, this.theme.dark); if (!d) return null; const hdr = t.header !== false; const tot = t.total; const isH = hdr && r === t.r1, isT = tot && r === t.r2; const fx = {};
        if (isH) { if (d.hbg) fx.bg = d.hbg; fx.fc = d.hfc; fx.b = 1; if (d.hline) fx.bb = 'medium ' + d.hline; } else if (isT) { fx.b = 1; if (d.tbg) { fx.bg = d.tbg; fx.fc = d.tfc; } else fx.bt = 'thin ' + (d.hline || d.tline || this.theme.fg2); } else if (t.banded !== false) { const i = r - t.r1 - (hdr ? 1 : 0); if (i % 2 === 0) fx.bg = d.band; }
        if (t.firstCol && c === t.c1 && !isH) fx.b = 1; if (t.lastCol && c === t.c2 && !isH) fx.b = 1; if (t.bandedCols && (c - t.c1) % 2 === 0 && !isH && !isT) fx.bg = d.band; return fx; }
      return null;
    }
    drawRegion(rg) {
      const ctx = this.ctx, sh = this.sheet, T = this.theme, z = this.z, wb = this.app.wb;
      const { x0, y0, x1, y1, c0, c1, r0, r1 } = rg; if (x1 <= x0 || y1 <= y0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      // gather cells
      const xs = [], ys = []; for (let c = c0; c <= c1; c++) xs[c - c0] = this.colScreenX(c); xs[c1 - c0 + 1] = this.colScreenX(c1 + 1); for (let r = r0; r <= r1; r++) ys[r - r0] = this.rowScreenY(r); ys[r1 - r0 + 1] = this.rowScreenY(r1 + 1);
      // pass 1: fills + grid
      const cells = []; const mergeSkip = new Set(); const merges = sh.merges.filter((m) => m[0] <= r1 && m[2] >= r0 && m[1] <= c1 && m[3] >= c0);
      for (const m of merges) for (let r = Math.max(m[0], r0); r <= Math.min(m[2], r1); r++) for (let c = Math.max(m[1], c0); c <= Math.min(m[3], c1); c++) if (r !== m[0] || c !== m[1]) mergeSkip.add(r * 16384 + c);
      const showGrid = sh.grid !== false;
      for (let r = r0; r <= r1; r++) {
        const y = ys[r - r0], h = ys[r - r0 + 1] - y; if (h <= 0) continue;
        for (let c = c0; c <= c1; c++) {
          const x = xs[c - c0], w = xs[c - c0 + 1] - x; if (w <= 0) continue; const key = r * 16384 + c; const cell = sh.getCell(r, c);
          if (mergeSkip.has(key)) continue; const st = this.cellStyle(r, c, cell); const tfx = this.tableFx(r, c); const fx = this.cfMap ? this.cfMap.get(key) : null;
          let bg = (fx && fx.bg) || st.bg || (tfx && tfx.bg); if (fx && fx.bg === undefined) bg = st.bg || (tfx && tfx.bg);
          cells.push({ r, c, x, y, w, h, cell, st, fx, tfx, bg, key });
        }
      }
      for (const m of merges) { const r = m[0], c = m[1]; if (r < r0 || c < c0) { /* anchor outside region: draw using its clipped geometry */ } }
      // merged cells whose anchor is outside the region but body inside
      for (const m of merges) { if ((m[0] >= r0 && m[0] <= r1 && m[1] >= c0 && m[1] <= c1)) continue; const cell = sh.getCell(m[0], m[1]); const st = this.cellStyle(m[0], m[1], cell); const rc = this.cellRect(m[0], m[1]); cells.push({ r: m[0], c: m[1], x: rc.x, y: rc.y, w: rc.w, h: rc.h, cell, st, fx: this.cfMap ? this.cfMap.get(m[0] * 16384 + m[1]) : null, tfx: this.tableFx(m[0], m[1]), bg: st.bg, key: m[0] * 16384 + m[1], merged: true }); }
      for (const q of cells) { const m = !q.merged && sh.merges.length ? sh.mergeAt(q.r, q.c) : null; if (m && m[0] === q.r && m[1] === q.c) { const rc = this.cellRect(q.r, q.c); q.x = rc.x; q.y = rc.y; q.w = rc.w; q.h = rc.h; q.merged = true; } }
      for (const q of cells) { if (q.bg) { ctx.fillStyle = q.bg; ctx.fillRect(q.x, q.y, q.w, q.h); } }
      if (showGrid) { ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.beginPath(); for (let r = r0; r <= r1 + 1; r++) { const y = Math.round(ys[r - r0]) - 0.5 + 1; ctx.moveTo(x0, y); ctx.lineTo(x1, y); } for (let c = c0; c <= c1 + 1; c++) { const x = Math.round(xs[c - c0]) - 0.5 + 1; ctx.moveTo(x, y0); ctx.lineTo(x, y1); } ctx.stroke();
        // erase gridlines inside merged cells and under filled cells
        for (const q of cells) { if (q.merged) { ctx.fillStyle = q.bg || T.bg; ctx.fillRect(q.x + 0.5, q.y + 0.5, q.w - 0.5, q.h - 0.5); } else if (q.bg) { ctx.fillStyle = q.bg; ctx.fillRect(q.x, q.y, q.w, q.h); ctx.strokeStyle = this.fillGrid(q.bg); ctx.lineWidth = 1; ctx.strokeRect(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5, q.w, q.h); } } }
      else for (const q of cells) if (q.merged && q.bg) { ctx.fillStyle = q.bg; ctx.fillRect(q.x, q.y, q.w, q.h); }
      // pass 2: data bars
      for (const q of cells) { const b = q.fx && q.fx.bar; if (b) this.drawBar(q, b); }
      // pass 3: text, icons
      for (const q of cells) this.drawCellContent(q, merges);
      // pass 4: borders
      this.drawBorders(cells);
      // sparklines
      this.drawSparklines(r0, r1, c0, c1);
      ctx.restore();
    }
    fillGrid(bg) { return lum(bg.startsWith('#') ? bg : '#ffffff') > 0.6 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)'; }
    drawBar(q, b) {
      const ctx = this.ctx; const pad = 2, x = q.x + pad, w = q.w - pad * 2, h = q.h - 6, y = q.y + 3; if (w <= 0) return;
      const zero = b.zeroAt != null ? b.zeroAt : 0; const color = b.neg ? (b.negColor || '#ff453a') : b.color; ctx.save();
      let bx, bw; if (b.neg) { bw = w * b.pct; bx = x + w * zero - bw; } else { bx = x + w * zero; bw = w * b.pct; }
      if (b.gradient !== false) { const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, color + 'cc'); g.addColorStop(1, color + '55'); ctx.fillStyle = g; } else ctx.fillStyle = color;
      ctx.beginPath(); ctx.rect(bx, y, Math.max(1, bw), h); ctx.fill(); ctx.restore();
    }
    drawIcon(set, idx, n, x, y, size) { const key = set + idx + n + size; let im = this.imgCache.get(key); if (!im) { im = new Image(); im.onload = () => this.invalidate(); try { im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ZN.cf.iconSVG(set, idx, n, size * 2)); } catch (e) { return; } this.imgCache.set(key, im); } if (im.complete && im.naturalWidth) this.ctx.drawImage(im, x, y, size, size); }
    drawSparklines(r0, r1, c0, c1) {
      const sh = this.sheet; if (!sh.sparklines.length || !ZN.charts || !ZN.charts.sparkline) return;
      for (const sp of sh.sparklines) { const [r, c] = sp.loc; if (r < r0 || r > r1 || c < c0 || c > c1) continue; const rc = this.cellRect(r, c); const w = Math.max(4, rc.w - 8), h = Math.max(4, rc.h - 8); const svg = (() => { try { return ZN.charts.sparkline(sp, this.app.wb, Math.round(w), Math.round(h)); } catch (e) { return ''; } })(); if (!svg) continue;
        const key = this.app.wb.version + '|' + svg; let im = this.imgCache.get(key); if (!im) { im = new Image(); im.onload = () => this.invalidate(); const col = this.theme.fg; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/currentColor/g, this.theme.accent).replace(/var\(--[\w-]+,?\s*([^)]*)\)/g, (m, d) => d || '#888')); if (this.imgCache.size > 400) this.imgCache.clear(); this.imgCache.set(key, im); }
        if (im.complete && im.naturalWidth) this.ctx.drawImage(im, rc.x + 4, rc.y + 4, w, h); }
    }
    drawCellContent(q, merges) {
      const { r, c, x, y, w, h, cell, st, fx, tfx } = q; const ctx = this.ctx, z = this.z, T = this.theme, sh = this.sheet; if (!cell || cell.v === undefined || cell.v === null) { if (fx && fx.icon && !(cell && cell.v != null)) { /* no icon for blanks */ } return; }
      const d = this.display(r, c, cell, st, w - 4 * z, fx); if (!d) return; let text = d.text; if (fx && fx.showValue === false) text = '';
      const eff = Object.assign({}, st); if (tfx) { if (tfx.b && !st.b) eff.b = 1; } if (fx) { if (fx.b) eff.b = 1; if (fx.i) eff.i = 1; if (fx.u) eff.u = fx.u; if (fx.k) eff.k = 1; }
      const font = this.fontOf(eff, z); const fpx = (st.fs ? st.fs * 4 / 3 : 13) * z;
      let color = (fx && fx.fc) || d.color || st.fc || (tfx && tfx.fc); const bgc = (fx && fx.bg) || st.bg || (tfx && tfx.bg);
      if (!color) color = bgc && bgc[0] === '#' && lum(bgc) > 0.55 && T.dark ? '#111' : bgc && bgc[0] === '#' && lum(bgc) < 0.4 && !T.dark ? '#fff' : (d.err ? T.fg : T.fg);
      const pad = 4 * z; let ha = st.ha; if (!ha || ha === 'general') ha = d.numeric ? 'right' : d.err || d.bool ? 'center' : (d.align || 'left'); if (d.numeric && d.align) ha = d.align;
      if (ha === 'centerAcross') ha = 'center'; const ind = (st.ind || 0) * 9 * z;
      let iconW = 0; if (fx && fx.icon) { iconW = Math.min(h - 4, 16 * z); this.drawIcon(fx.icon.set, fx.icon.idx, fx.icon.n, x + 3, y + (h - iconW) / 2, iconW); iconW += 5; }
      if (!text) return;
      if (d.numeric && d.fits === false && (st.nf || 'General') !== 'General' || (d.numeric && this.measure(text, font) > w - pad * 2 && (st.nf || 'General') !== 'General' && !st.wr)) text = '#'.repeat(Math.max(1, Math.floor((w - pad) / this.measure('#', font))));
      ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
      const va = st.va || 'bottom';
      if (st.rot && st.rot !== 255) { const ang = -st.rot * Math.PI / 180; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(ang); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); ctx.restore(); return; }
      if (st.rot === 255) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const chars = [...text]; const lh = fpx * 1.05; let yy = y + (h - chars.length * lh) / 2 + lh / 2; for (const ch of chars) { ctx.fillText(ch, x + w / 2, yy); yy += lh; } ctx.restore(); return; }
      if (st.wr && typeof cell.v === 'string' || (st.wr && !d.numeric)) {
        const maxW = w - pad * 2 - iconW - ind; const lines = this.wrapLines(text, font, maxW); const lh = fpx * 1.22; const total = lines.length * lh; let ty = va === 'top' ? y + 3 : va === 'middle' ? y + (h - total) / 2 : y + h - total - 3; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        for (const ln of lines) { const tw = this.measure(ln, font); let tx = ha === 'right' ? x + w - pad - tw : ha === 'center' ? x + (w - tw) / 2 : x + pad + ind + iconW; ctx.fillText(ln, tx, ty + fpx * 0.92); this.deco(eff, tx, ty + fpx * 0.92, tw, fpx, color); ty += lh; } ctx.restore(); return;
      }
      let tw = this.measure(text, font);
      if (st.shr && tw > w - pad * 2) { const s = (w - pad * 2) / tw; ctx.font = this.fontOf(Object.assign({}, eff, { fs: (st.fs || 9.75) * s }), z); tw = w - pad * 2; }
      const avail = w - pad * 2 - iconW - ind; let tx, clipL = x, clipR = x + w;
      if (ha === 'fill') { const unit = Math.max(1, this.measure(text, font)); text = text.repeat(Math.max(1, Math.floor(avail / unit))); tw = this.measure(text, font); }
      if (ha === 'right') tx = x + w - pad - tw; else if (ha === 'center') tx = x + (w - tw) / 2 + iconW / 2; else tx = x + pad + ind + iconW;
      // overflow into empty neighbours (text only)
      if (tw > avail && !d.numeric && !q.merged) { let extra = tw - avail; if (ha === 'left' || ha === 'general') { let cc = c + 1, ext = 0; while (ext < extra && cc < c + 60) { const nc = sh.getCell(r, cc); if (nc && nc.v !== undefined && nc.v !== null && nc.v !== '') break; ext += this.colW(cc) * z; cc++; } clipR = x + w + ext; } else if (ha === 'right') { let cc = c - 1, ext = 0; while (ext < extra && cc >= 0) { const nc = sh.getCell(r, cc); if (nc && nc.v !== undefined && nc.v !== null && nc.v !== '') break; ext += this.colW(cc) * z; cc--; } clipL = x - ext; } else { let cl = c - 1, cr = c + 1, el = 0, er = 0; const half = extra / 2; while (el < half && cl >= 0) { const nc = sh.getCell(r, cl); if (nc && nc.v != null && nc.v !== '') break; el += this.colW(cl) * z; cl--; } while (er < half && cr < c + 60) { const nc = sh.getCell(r, cr); if (nc && nc.v != null && nc.v !== '') break; er += this.colW(cr) * z; cr++; } clipL = x - el; clipR = x + w + er; } }
      ctx.beginPath(); ctx.rect(clipL, y, clipR - clipL, h); ctx.clip();
      const ty = va === 'top' ? y + 3 + fpx * 0.92 : va === 'middle' ? y + h / 2 + fpx * 0.36 : y + h - Math.max(3, (h - fpx) / 2) - fpx * 0.08; ctx.fillText(text, tx, ty); this.deco(eff, tx, ty, tw, fpx, color);
      ctx.restore();
    }
    deco(st, x, y, w, fpx, color) { const ctx = this.ctx; if (!st.u && !st.k) return; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, fpx / 14); ctx.beginPath(); if (st.u) { ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); if (st.u === 2) { ctx.moveTo(x, y + 4); ctx.lineTo(x + w, y + 4); } } if (st.k) { ctx.moveTo(x, y - fpx * 0.3); ctx.lineTo(x + w, y - fpx * 0.3); } ctx.stroke(); }
    wrapLines(text, font, maxW) { const out = []; for (const para of String(text).split('\n')) { const words = para.split(/(\s+)/); let cur = ''; for (const wd of words) { const t = cur + wd; if (cur && this.measure(t, font) > maxW) { out.push(cur.trimEnd()); cur = wd.trimStart(); if (this.measure(cur, font) > maxW) { let acc = ''; for (const ch of cur) { if (this.measure(acc + ch, font) > maxW && acc) { out.push(acc); acc = ch; } else acc += ch; } cur = acc; } } else cur = t; } out.push(cur); } return out; }
    drawBorders(cells) {
      const ctx = this.ctx, z = this.z; const draw = (spec, x1, y1, x2, y2) => { if (!spec) return; const [style, col] = spec.split(' '); const lw = (BW[style] || 1) * Math.max(1, z); ctx.strokeStyle = col || this.theme.fg; ctx.lineWidth = style === 'double' ? 1 : lw; ctx.setLineDash(DASH[style] || []);
        const o = (Math.round(lw) % 2) ? 0.5 : 0; ctx.beginPath(); const hor = y1 === y2; if (style === 'double') { const off = 1.2; if (hor) { ctx.moveTo(x1, y1 - off); ctx.lineTo(x2, y2 - off); ctx.moveTo(x1, y1 + off); ctx.lineTo(x2, y2 + off); } else { ctx.moveTo(x1 - off, y1); ctx.lineTo(x2 - off, y2); ctx.moveTo(x1 + off, y1); ctx.lineTo(x2 + off, y2); } } else if (hor) { ctx.moveTo(x1, Math.round(y1) + o); ctx.lineTo(x2, Math.round(y2) + o); } else { ctx.moveTo(Math.round(x1) + o, y1); ctx.lineTo(Math.round(x2) + o, y2); } ctx.stroke(); ctx.setLineDash([]); };
      for (const q of cells) { const st = q.st, t = q.tfx; const bl = st.bl, br = st.br, bt = st.bt || (t && t.bt), bb = st.bb || (t && t.bb); if (!bl && !br && !bt && !bb) continue; const { x, y, w, h } = q; draw(bt, x, y, x + w, y); draw(bb, x, y + h, x + w, y + h); draw(bl, x, y, x, y + h); draw(br, x + w, y, x + w, y + h); }
    }
    // ---------- selection ----------
    drawSelection() {
      const app = this.app, ctx = this.ctx, T = this.theme, sel = app.sel; if (!sel) return; const rgb = T.accentRgb;
      ctx.save(); const hw = this.hw, hh = this.hh; ctx.beginPath(); ctx.rect(hw, hh, this.vw - hw, this.vh - hh); ctx.clip();
      // reference highlights while editing
      for (const h of this.refHighlights) { const rc = this.rangeRectClamped(h.r1, h.c1, h.r2, h.c2); if (!rc) continue; ctx.strokeStyle = h.color; ctx.lineWidth = 2; ctx.strokeRect(rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2); ctx.fillStyle = h.color + '18'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
      const ranges = app.selRanges(); const act = this.activeRect();
      for (let i = 0; i < ranges.length; i++) { const q = ranges[i]; const rc = this.rangeRectClamped(q.r1, q.c1, q.r2, q.c2); if (!rc) continue; const single = q.r1 === q.r2 && q.c1 === q.c2 || (act && Math.abs(rc.w - act.w) < 1 && Math.abs(rc.h - act.h) < 1);
        if (!single) { ctx.fillStyle = `rgba(${rgb},.13)`; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); if (act && this.rectOverlap(rc, act)) { /* active cell stays clear */ ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.restore(); } }
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.strokeRect(Math.round(rc.x) + 0.5 + 0.5, Math.round(rc.y) + 0.5 + 0.5, rc.w - 1, rc.h - 1); }
      if (act) { ctx.fillStyle = 'rgba(0,0,0,0)'; if (!app.editing) { ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.strokeRect(act.x + 1.5, act.y + 1.5, act.w - 2, act.h - 2); } }
      // fill handle
      const last = ranges[ranges.length - 1]; if (last && !app.editing && !app.selChart) { const rc = this.rangeRectClamped(last.r1, last.c1, last.r2, last.c2); if (rc && this.handleVisible(last)) { const hx = rc.x + rc.w, hy = rc.y + rc.h; ctx.fillStyle = T.accent; ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(hx - 4, hy - 4, 8, 8); ctx.fill(); ctx.stroke(); } }
      // marching ants for copy
      if (app.clipRanges && app.clipRanges.sheet === this.sheet) { ctx.setLineDash([5, 4]); ctx.lineDashOffset = -(performance.now() / 60) % 9; ctx.strokeStyle = T.accent; ctx.lineWidth = 1.5; for (const q of app.clipRanges.ranges) { const rc = this.rangeRectClamped(q.r1, q.c1, q.r2, q.c2); if (rc) ctx.strokeRect(rc.x + .5, rc.y + .5, rc.w - 1, rc.h - 1); } ctx.setLineDash([]); if (!this._ants) this._ants = setInterval(() => { if (app.clipRanges) this.invalidate(); else { clearInterval(this._ants); this._ants = 0; } }, 120); }
      if (this.fillPreview) { const q = this.fillPreview; const rc = this.rangeRectClamped(q.r1, q.c1, q.r2, q.c2); if (rc) { ctx.setLineDash([4, 3]); ctx.strokeStyle = T.fg; ctx.lineWidth = 1.5; ctx.strokeRect(rc.x + .5, rc.y + .5, rc.w - 1, rc.h - 1); ctx.setLineDash([]); } }
      if (this.movePreview) { const q = this.movePreview; const rc = this.rangeRectClamped(q.r1, q.c1, q.r2, q.c2); if (rc) { ctx.strokeStyle = T.accent; ctx.lineWidth = 3; ctx.globalAlpha = .7; ctx.strokeRect(rc.x + 1.5, rc.y + 1.5, rc.w - 3, rc.h - 3); ctx.globalAlpha = 1; } }
      ctx.restore();
      // dropdown buttons (filters, validation)
      this.drawButtons();
    }
    rectOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
    handleVisible(q) { const rc = this.rangeRect(q.r2, q.c2, q.r2, q.c2); return rc.x + rc.w > this.hw && rc.y + rc.h > this.hh && rc.x < this.vw && rc.y < this.vh; }
    activeRect() { const a = this.app.sel; if (!a) return null; return this.rangeRectClamped(a.r, a.c, a.r, a.c, true); }
    rangeRectClamped(r1, c1, r2, c2, merged) { // screen rect, merge-aware for the active cell
      if (merged) { const m = this.sheet.mergeAt(r1, c1); if (m) { r1 = m[0]; c1 = m[1]; r2 = m[2]; c2 = m[3]; } }
      const rc = this.rangeRect(r1, c1, r2, c2); if (rc.x + rc.w < this.hw || rc.y + rc.h < this.hh || rc.x > this.vw || rc.y > this.vh) return null; return rc;
    }
    buttons() { // dropdown buttons to draw/hit: filters, validation list
      const out = []; const sh = this.sheet, app = this.app;
      const f = sh.filters && sh.filters.range; const ranges = []; if (f) ranges.push({ kind: 'filter', r1: f.r1, c1: f.c1, c2: f.c2, r: f.r1 }); for (const t of sh.tables) if (t.filter !== false && t.header !== false) ranges.push({ kind: 'table', r1: t.r1, c1: t.c1, c2: t.c2, r: t.r1, t });
      for (const g of ranges) for (let c = g.c1; c <= g.c2; c++) { if (sh.hiddenCols[c]) continue; const rc = this.cellRect(g.r, c); if (rc.x + rc.w < this.hw || rc.x > this.vw || rc.y + rc.h < this.hh || rc.y > this.vh) continue; out.push({ kind: g.kind, r: g.r, c, x: rc.x + rc.w - 18 * this.z, y: rc.y + (rc.h - 16 * this.z) / 2, w: 16 * this.z, h: 16 * this.z, active: !!(sh.filters && sh.filters.criteria && sh.filters.criteria[c]) }); }
      const s = app.sel; if (s && !app.editing && ZN.tools && ZN.tools.dropdownItems) { try { if (sh.dv.length && this._dvCacheKey !== app.wb.version + ':' + s.r + ':' + s.c + ':' + sh.id) { this._dvCacheKey = app.wb.version + ':' + s.r + ':' + s.c + ':' + sh.id; this._dvItems = ZN.tools.dropdownItems(app.wb, sh, s.r, s.c); } if (sh.dv.length && this._dvItems) { const rc = this.cellRect(s.r, s.c); out.push({ kind: 'dv', r: s.r, c: s.c, x: rc.x + rc.w - 17 * this.z, y: rc.y + 1, w: 16 * this.z, h: Math.max(14, rc.h - 2) }); } } catch (e) { /* ignore */ } }
      return out;
    }
    drawButtons() {
      const ctx = this.ctx, T = this.theme; ctx.save(); ctx.beginPath(); ctx.rect(this.hw, this.hh, this.vw - this.hw, this.vh - this.hh); ctx.clip(); this.btns = this.buttons();
      for (const b of this.btns) { ctx.fillStyle = b.kind === 'dv' ? T.bg : T.dark ? 'rgba(60,60,64,.95)' : 'rgba(255,255,255,.96)'; ctx.strokeStyle = b.active ? T.accent : T.hdrLine; ctx.lineWidth = 1; const r = 3; ctx.beginPath(); ctx.roundRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1, r); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = b.active ? T.accent : T.fg2; ctx.lineWidth = 1.4; ctx.beginPath(); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; if (b.kind === 'dv') { ctx.moveTo(cx - 3.5, cy - 1.5); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 3.5, cy - 1.5); } else if (b.active) { ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx + 4, cy - 3); ctx.lineTo(cx + 1, cy + 0.5); ctx.lineTo(cx + 1, cy + 4); ctx.lineTo(cx - 1, cy + 3); ctx.lineTo(cx - 1, cy + 0.5); ctx.closePath(); } else { ctx.moveTo(cx - 3.5, cy - 1.5); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 3.5, cy - 1.5); } ctx.stroke(); }
      ctx.restore();
    }
    drawHeaders(c0, c1, r0, r1) {
      const ctx = this.ctx, T = this.theme, z = this.z, hw = this.hw, hh = this.hh, W = this.vw, H = this.vh, f = this.frozen, sel = this.app.selRanges(); const fs = Math.round(11 * z);
      const selCols = new Set(), selRows = new Set(); let allCols = new Set(), allRows = new Set(); for (const q of sel) { if (q.c2 - q.c1 < 2000) for (let c = q.c1; c <= q.c2; c++) selCols.add(c); if (q.r2 - q.r1 < 200000) for (let r = q.r1; r <= q.r2; r++) selRows.add(r); if (q.r1 === 0 && q.r2 >= MAXR - 1) allCols.add(q); if (q.c1 === 0 && q.c2 >= MAXC - 1) allRows.add(q); }
      ctx.font = `500 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const drawCol = (c) => { const x = this.colScreenX(c), w = this.colW(c) * z; if (w <= 0) return; const sel_ = selCols.has(c); ctx.fillStyle = sel_ ? `rgba(${T.accentRgb},.22)` : T.hdr; ctx.fillRect(x, 0, w, hh); ctx.strokeStyle = T.hdrLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x + w) - .5, 0); ctx.lineTo(Math.round(x + w) - .5, hh); ctx.stroke(); ctx.fillStyle = sel_ ? T.accent : T.fg2; ctx.fillText(ZN.colName(c), x + w / 2, hh / 2 + 0.5); };
      const drawRow = (r) => { const y = this.rowScreenY(r), h = this.rowH(r) * z; if (h <= 0) return; const sel_ = selRows.has(r); ctx.fillStyle = sel_ ? `rgba(${T.accentRgb},.22)` : T.hdr; ctx.fillRect(0, y, hw, h); ctx.strokeStyle = T.hdrLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Math.round(y + h) - .5); ctx.lineTo(hw, Math.round(y + h) - .5); ctx.stroke(); ctx.fillStyle = sel_ ? T.accent : T.fg2; ctx.fillText(String(r + 1), hw / 2, y + h / 2 + 0.5); };
      ctx.save(); ctx.beginPath(); ctx.rect(hw, 0, W - hw, hh); ctx.clip(); ctx.fillStyle = T.hdr; ctx.fillRect(hw, 0, W, hh); for (let c = c0; c <= c1; c++) drawCol(c); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(hw, 0, this.frozenW(), hh); ctx.clip(); for (let c = 0; c < f.c; c++) drawCol(c); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, hh, hw, H - hh); ctx.clip(); ctx.fillStyle = T.hdr; ctx.fillRect(0, hh, hw, H); for (let r = r0; r <= r1; r++) drawRow(r); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, hh, hw, this.frozenH()); ctx.clip(); for (let r = 0; r < f.r; r++) drawRow(r); ctx.restore();
      ctx.fillStyle = T.hdr; ctx.fillRect(0, 0, hw, hh); ctx.strokeStyle = T.hdrLine; ctx.beginPath(); ctx.moveTo(0, hh - .5); ctx.lineTo(W, hh - .5); ctx.moveTo(hw - .5, 0); ctx.lineTo(hw - .5, H); ctx.stroke();
      // corner triangle
      ctx.fillStyle = T.fg3; ctx.beginPath(); ctx.moveTo(hw - 4, hh - 4); ctx.lineTo(hw - 4, hh - 14 * Math.min(1, z)); ctx.lineTo(hw - 14 * Math.min(1, z), hh - 4); ctx.fill();
    }
    drawGuides() { const g = this.guides; if (!g) return; const ctx = this.ctx; ctx.save(); ctx.strokeStyle = this.theme.accent; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x + .5, 0); ctx.lineTo(g.x + .5, this.vh); } if (g.y != null) { ctx.moveTo(0, g.y + .5); ctx.lineTo(this.vw, g.y + .5); } ctx.stroke(); if (g.label) { ctx.setLineDash([]); ctx.font = `600 11px ${FONT}`; const tw = ctx.measureText(g.label).width + 12; const lx = Math.min(this.vw - tw - 4, (g.x != null ? g.x : 40) + 8), ly = (g.y != null ? g.y : 40) + 8; ctx.fillStyle = 'rgba(30,30,32,.9)'; ctx.beginPath(); ctx.roundRect(lx, ly, tw, 20, 5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(g.label, lx + 6, ly + 10.5); } ctx.restore(); }
    // ---------- hit testing & pointer interactions ----------
    local(e) { const r = this.sc.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    inScrollbar(e) { const r = this.sc.getBoundingClientRect(); return e.clientX - r.left > this.sc.clientWidth || e.clientY - r.top > this.sc.clientHeight; }
    hit(x, y) {
      const hw = this.hw, hh = this.hh, z = this.z; const sh = this.sheet; if (x < hw && y < hh) return { t: 'corner' };
      if (y < hh) { const c = this.colAtScreen(x); const sx = this.colScreenX(c), w = this.colW(c) * z; if (x >= hw) { if (Math.abs(x - (sx + w)) <= 4) return { t: 'colEdge', c }; if (c > 0 && Math.abs(x - sx) <= 4 && sh.hiddenCols[c - 1]) return { t: 'colUnhide', c: c - 1 }; if (c > 0 && Math.abs(x - sx) <= 4) { let p = c - 1; return { t: 'colEdge', c: p }; } } return { t: 'col', c }; }
      if (x < hw) { const r = this.rowAtScreen(y); const sy = this.rowScreenY(r), h = this.rowH(r) * z; if (Math.abs(y - (sy + h)) <= 3) return { t: 'rowEdge', r }; if (r > 0 && Math.abs(y - sy) <= 3) return { t: 'rowEdge', r: r - 1 }; return { t: 'row', r }; }
      for (const b of this.btns || []) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { t: 'btn', b };
      const ranges = this.app.selRanges(); const last = ranges[ranges.length - 1];
      if (last && !this.app.editing && !this.app.selChart) { const rc = this.rangeRect(last.r1, last.c1, last.r2, last.c2); const hx = rc.x + rc.w, hy = rc.y + rc.h; if (Math.abs(x - hx) <= 6 && Math.abs(y - hy) <= 6) return { t: 'handle' };
        // border grab for move
        const inX = x >= rc.x - 3 && x <= rc.x + rc.w + 3, inY = y >= rc.y - 3 && y <= rc.y + rc.h + 3; if (inX && inY && !(x > rc.x + 3 && x < rc.x + rc.w - 3 && y > rc.y + 3 && y < rc.y + rc.h - 3)) return { t: 'border', r: this.rowAtScreen(y), c: this.colAtScreen(x) }; }
      const r = this.rowAtScreen(y), c = this.colAtScreen(x); return { t: 'cell', r: clamp(r, 0, MAXR - 1), c: clamp(c, 0, MAXC - 1) };
    }
    setCursor(cur) { if (this.hoverCursor !== cur) { this.hoverCursor = cur; this.sc.style.cursor = cur; } }
    onDown(e) {
      if (e.button === 2 && !this.app.editing) { /* context menu handled separately, but select cell under pointer if outside selection */ }
      if (e.button !== 0 && e.button !== 2) return; if (this.inScrollbar(e)) return; const p = this.local(e); if (e.target.closest && e.target.closest('.chart-box,.zn-editor,.zn-popup')) return;
      const app = this.app; const h = this.hit(p.x, p.y);
      if (app.editing && !(h.t === 'cell' && app.canPointRef())) { if (!app.commitEdit(0)) { e.preventDefault(); return; } }
      if (app.selChart) app.selectChart(null);
      this.sc.setPointerCapture(e.pointerId); this.pdown = { x: p.x, y: p.y, h, e };
      if (e.button === 2) { if (h.t === 'cell' && !app.inSelection(h.r, h.c)) app.selectCell(h.r, h.c); else if (h.t === 'col' && !app.colSelected(h.c)) app.selectCols(h.c, h.c); else if (h.t === 'row' && !app.rowSelected(h.r)) app.selectRows(h.r, h.r); this.drag = null; return; }
      e.preventDefault(); app.focusKb();
      switch (h.t) {
        case 'corner': app.selectAll(); this.drag = null; break;
        case 'col': this.drag = { m: 'cols', a: h.c }; app.selectCols(h.c, h.c, e.shiftKey, e.metaKey || e.ctrlKey); break;
        case 'row': this.drag = { m: 'rows', a: h.r }; app.selectRows(h.r, h.r, e.shiftKey, e.metaKey || e.ctrlKey); break;
        case 'colEdge': { const sel = app.colSelected(h.c) ? app.selColsRange() : [h.c, h.c]; this.drag = { m: 'colResize', c: h.c, cols: sel, x0: p.x, w0: this.colW(h.c), moved: false }; break; }
        case 'colUnhide': app.unhideCols(h.c, h.c + 1); this.drag = null; break;
        case 'rowEdge': { const sel = app.rowSelected(h.r) ? app.selRowsRange() : [h.r, h.r]; this.drag = { m: 'rowResize', r: h.r, rows: sel, y0: p.y, h0: this.rowH(h.r), moved: false }; break; }
        case 'btn': this.drag = null; app.onGridButton(h.b); break;
        case 'handle': { const q = app.selRanges().slice(-1)[0]; this.drag = { m: 'fill', src: q, dst: q }; break; }
        case 'border': { const q = app.selRanges().slice(-1)[0]; this.drag = { m: 'move', src: q, grab: { r: h.r, c: h.c }, dst: q, started: false }; break; }
        case 'cell': {
          if (app.editing && app.canPointRef()) { app.pointStart(h.r, h.c, e.shiftKey); this.drag = { m: 'point' }; break; }
          const mod = e.metaKey || e.ctrlKey; if (e.shiftKey) app.extendTo(h.r, h.c); else app.selectCell(h.r, h.c, mod);
          this.drag = { m: 'select', add: mod }; break; }
      }
    }
    onMove(e) {
      const p = this.local(e); const d = this.drag; const app = this.app;
      if (!d) { if (e.buttons) return; const h = this.hit(p.x, p.y); const cur = { col: 'default', row: 'default', corner: 'default', colEdge: 'col-resize', rowEdge: 'row-resize', colUnhide: 'col-resize', handle: 'crosshair', border: 'move', btn: 'default', cell: app.editing && app.canPointRef() ? 'cell' : 'cell' }[h.t] || 'default'; this.setCursor(cur === 'cell' ? '' : cur); this.app.hoverCell && this.app.hoverCell(h, p, e); return; }
      this.lastPtr = p; if (d.auto) return; this.autoscroll(p);
      switch (d.m) {
        case 'select': case 'point': { const c = clamp(this.colAtScreen(clamp(p.x, this.hw + 1, this.vw - 1)), 0, MAXC - 1), r = clamp(this.rowAtScreen(clamp(p.y, this.hh + 1, this.vh - 1)), 0, MAXR - 1); if (d.m === 'point') app.pointExtend(r, c); else app.extendTo(r, c, d.add); break; }
        case 'cols': { const c = this.colAtScreen(clamp(p.x, this.hw + 1, this.vw - 1)); app.selectCols(d.a, c, false, false, true); break; }
        case 'rows': { const r = this.rowAtScreen(clamp(p.y, this.hh + 1, this.vh - 1)); app.selectRows(d.a, r, false, false, true); break; }
        case 'colResize': { const nw = Math.max(0, Math.round(d.w0 + (p.x - d.x0) / this.z)); d.moved = true; d.nw = nw; this.guides = { x: this.colScreenX(d.c) + nw * this.z, label: nw + ' px' }; this.invalidate(); break; }
        case 'rowResize': { const nh = Math.max(0, Math.round(d.h0 + (p.y - d.y0) / this.z)); d.moved = true; d.nh = nh; this.guides = { y: this.rowScreenY(d.r) + nh * this.z, label: nh + ' px' }; this.invalidate(); break; }
        case 'fill': { const c = clamp(this.colAtScreen(clamp(p.x, this.hw + 1, this.vw - 1)), 0, MAXC - 1), r = clamp(this.rowAtScreen(clamp(p.y, this.hh + 1, this.vh - 1)), 0, MAXR - 1); const s = d.src; const dst = { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 }; const dr = r > s.r2 ? r - s.r2 : r < s.r1 ? r - s.r1 : 0, dc = c > s.c2 ? c - s.c2 : c < s.c1 ? c - s.c1 : 0; if (dr !== 0 && Math.abs(dr) >= Math.abs(dc)) { if (dr > 0) dst.r2 = r; else dst.r1 = r; } else if (dc !== 0) { if (dc > 0) dst.c2 = c; else dst.c1 = c; } d.dst = dst; this.fillPreview = dst; this.invalidate(); break; }
        case 'move': { if (!d.started && Math.hypot(p.x - this.pdown.x, p.y - this.pdown.y) < 4) break; d.started = true; this.setCursor('grabbing'); const c = clamp(this.colAtScreen(clamp(p.x, this.hw + 1, this.vw - 1)), 0, MAXC - 1), r = clamp(this.rowAtScreen(clamp(p.y, this.hh + 1, this.vh - 1)), 0, MAXR - 1); const dr = r - d.grab.r, dc = c - d.grab.c; const s = d.src; const nr1 = Math.max(0, s.r1 + dr), nc1 = Math.max(0, s.c1 + dc); d.dst = { r1: nr1, c1: nc1, r2: nr1 + (s.r2 - s.r1), c2: nc1 + (s.c2 - s.c1) }; this.movePreview = d.dst; this.invalidate(); break; }
      }
    }
    autoscroll(p) {
      const d = this.drag; if (!d || !['select', 'point', 'cols', 'rows', 'fill', 'move'].includes(d.m)) return; const sc = this.sc; let vx = 0, vy = 0; const m = 28;
      if (d.m !== 'rows' && p.x > this.vw - m) vx = (p.x - (this.vw - m)) * 0.8; else if (d.m !== 'rows' && p.x < this.hw + this.frozenW() + m && sc.scrollLeft > 0) vx = -(this.hw + this.frozenW() + m - p.x) * 0.8;
      if (d.m !== 'cols' && p.y > this.vh - m) vy = (p.y - (this.vh - m)) * 0.8; else if (d.m !== 'cols' && p.y < this.hh + this.frozenH() + m && sc.scrollTop > 0) vy = -(this.hh + this.frozenH() + m - p.y) * 0.8;
      if (!vx && !vy) { d.auto = false; return; } if (this._asRaf) return; const step = () => { this._asRaf = 0; if (!this.drag || !this.lastPtr) return; const q = this.lastPtr; this.ensureRow(this.rowAtScreen(Math.min(q.y, this.vh - 1)) + 5); sc.scrollLeft += vx; sc.scrollTop += vy; this.onMove({ clientX: q.x + sc.getBoundingClientRect().left, clientY: q.y + sc.getBoundingClientRect().top, buttons: 1 }); if (vx || vy) this._asRaf = requestAnimationFrame(step); }; this._asRaf = requestAnimationFrame(step);
    }
    onUp(e) {
      const d = this.drag; const app = this.app; this.drag = null; this.guides = null; this.fillPreview = null; this.movePreview = null; this._asRaf = 0; this.setCursor('');
      try { this.sc.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (!d) { this.invalidate(); return; }
      switch (d.m) {
        case 'colResize': if (d.moved) app.setColWidth(d.cols[0], d.cols[1], d.nw); break;
        case 'rowResize': if (d.moved) app.setRowHeight(d.rows[0], d.rows[1], d.nh); break;
        case 'fill': if (d.dst && (d.dst.r1 !== d.src.r1 || d.dst.r2 !== d.src.r2 || d.dst.c1 !== d.src.c1 || d.dst.c2 !== d.src.c2)) app.doFill(d.src, d.dst, e.altKey || false); break;
        case 'move': if (d.started && d.dst && (d.dst.r1 !== d.src.r1 || d.dst.c1 !== d.src.c1)) app.moveRange(d.src, d.dst, e.altKey); break;
        case 'point': app.pointEnd(); break;
      }
      this.invalidate(); app.afterSelectionChange && app.afterSelectionChange();
    }
    onDbl(e) {
      if (this.inScrollbar(e)) return; const p = this.local(e); const h = this.hit(p.x, p.y);
      if (h.t === 'colEdge') this.app.autoFitCols(this.app.colSelected(h.c) ? this.app.selColsRange() : [h.c, h.c]);
      else if (h.t === 'rowEdge') this.app.autoFitRows(this.app.rowSelected(h.r) ? this.app.selRowsRange() : [h.r, h.r]);
      else if (h.t === 'cell' || h.t === 'border') { const sel = this.app.sel; if (h.t === 'border') this.app.jumpEdge && this.app.jumpEdge(e); else this.app.beginEdit(sel.r, sel.c, null); }
    }
    onCtx(e) { e.preventDefault(); if (this.inScrollbar(e)) return; const p = this.local(e); const h = this.hit(p.x, p.y); this.app.contextMenu(e, h); }
  }
  window.GridView = GridView;
  window.ZNGrid = { lum, mix, hex2rgb, tableStyleDef };
})();
