/* Slide renderer: deck model -> DOM. Shared by the editor, thumbnails, presenter, print and HTML export. */
(() => {
  const K = (window.K = window.K || {});
  const el = (cls, css, tag = 'div') => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  const px = (n) => (+n).toFixed(2).replace(/\.00$/, '') + 'px';
  K.el = el;

  K.slideBgCSS = (deck, slide, lay) => {
    const f = slide.bg || (lay && lay.bg) || deck.theme.bgFill || { t: 'solid', c: 'bg' };
    return K.fillCSS(deck, f);
  };

  const roman = (n) => { const r = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, c] of r) while (n >= v) { s += c; n -= v; } return s; };
  const marker = (type, lv, n) => {
    switch (type) {
      case 'b': return ['•', '◦', '▪'][lv % 3];
      case 'd': return '–';
      case 'n': return (lv % 2 ? String.fromCharCode(96 + n) : n) + '.';
      case 'a': return String.fromCharCode(96 + (((n - 1) % 26) + 1)) + '.';
      case 'r': return roman(n) + '.';
      case 'c': return '✓';
      default: return '';
    }
  };

  K.marker = marker;
  // run -> span
  function runEl(deck, o, ts, r, ctx, fit) {
    const text = r.field ? fieldText(deck, r.field, ctx) : r.t;
    const sp = document.createElement(r.l ? 'a' : 'span'); sp.textContent = text; const st = sp.style;
    if (r.b != null) st.fontWeight = r.b ? '700' : '400'; if (r.i != null) st.fontStyle = r.i ? 'italic' : 'normal';
    const dec = []; if (r.u) dec.push('underline'); if (r.s) dec.push('line-through'); if (r.u === false || r.s === false) { if (!dec.length) st.textDecoration = 'none'; }
    if (dec.length) st.textDecoration = dec.join(' ');
    if (r.c) st.color = K.col(deck, r.c); if (r.hl) st.background = K.col(deck, r.hl);
    if (r.f) st.fontFamily = K.fontCSS(deck, r.f);
    let sz = r.sz; if (r.sup || r.sub) { sz = (sz || ts.sz) * 0.65; st.verticalAlign = r.sup ? 'super' : 'sub'; st.lineHeight = '0'; }
    if (sz) st.fontSize = fit ? `calc(${sz}px * var(--fit,1))` : sz + 'px';
    if (r.l) { sp.dataset.link = r.l; if (!r.c) st.color = K.col(deck, 'a1'); st.textDecoration = 'underline'; }
    if (r.w) st.fontWeight = r.w;
    return sp;
  }
  function fieldText(deck, f, ctx) {
    if (f === 'slideno') return String((ctx.index ?? 0) + 1);
    if (f === 'count') return String(deck.slides.length);
    if (f === 'date') return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (f === 'footer') return deck.opts.footer || '';
    return '';
  }
  K.fieldText = fieldText;

  // paragraphs -> array of elements
  K.paraEls = (deck, o, ts, paras, ctx) => {
    const fit = ts.fit === 'shrink'; const out = []; const counters = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const sz = ts.sz, ind = Math.max(16, sz * 0.85);
    paras.forEach((p) => {
      const d = el('', '', 'p'); const st = d.style; const list = p.list ?? ts.list; const lv = p.lv || 0;
      if (p.list !== undefined) d.dataset.plist = p.list; if (p.al) d.dataset.pal = p.al; if (p.ls) d.dataset.pls = p.ls; if (p.sa != null) d.dataset.psa = p.sa; if (p.sb != null) d.dataset.psb = p.sb; if (p.lv) d.dataset.lv = p.lv;
      const al = p.al || ts.al; st.textAlign = al === 'j' ? 'justify' : al === 'c' ? 'center' : al === 'r' ? 'right' : 'left';
      if (p.ls || ts.ls) st.lineHeight = p.ls || ts.ls; const sa = p.sa ?? ts.sa, sb = p.sb ?? ts.sb; if (sa) st.marginBottom = sa + 'px'; if (sb) st.marginTop = sb + 'px';
      if (list && list !== 'none') {
        counters[lv] = (counters[lv] || 0) + 1; for (let i = lv + 1; i < counters.length; i++) counters[i] = 0;
        d.dataset.mk = marker(list, lv, counters[lv]); d.dataset.list = list; st.paddingLeft = ind * (lv + 1) + 'px'; st.setProperty('--ind', ind * lv + 'px'); st.setProperty('--mkw', ind + 'px');
        if (list === 'b' || list === 'd' || list === 'c') st.setProperty('--mkc', K.col(deck, 'a1'));
      } else { counters.fill(0); if (lv) st.paddingLeft = ind * lv + 'px'; }
      p.runs.forEach((r) => { if (r.t === '' && !r.field) return; d.append(runEl(deck, o, ts, r, ctx, fit)); });
      if (!d.firstChild) d.append(el('', '', 'br'));
      out.push(d);
    });
    return out;
  };

  K.textBox = (deck, o, ctx, ts) => {
    ts = ts || K.tstyle(o);
    const tx = el('tx'); const st = tx.style;
    st.padding = (ts.pad ?? 6) + 'px'; st.justifyContent = ts.va === 'm' ? 'center' : ts.va === 'b' ? 'flex-end' : 'flex-start';
    st.fontFamily = K.fontCSS(deck, ts.f); st.color = K.col(deck, ts.c); st.fontSize = ts.fit === 'shrink' ? `calc(${ts.sz}px * var(--fit,1))` : ts.sz + 'px';
    st.fontWeight = ts.w || (ts.b ? 700 : 400); if (ts.i) st.fontStyle = 'italic'; const dec = []; if (ts.u) dec.push('underline'); if (ts.s) dec.push('line-through'); if (dec.length) st.textDecoration = dec.join(' ');
    if (ts.up) st.textTransform = 'uppercase'; if (ts.tr) st.letterSpacing = ts.tr + 'px';
    if (ts.fit === 'shrink') tx.dataset.fit = '1';
    const tb = el('tb'); if (ts.cols > 1) { tb.style.columnCount = ts.cols; tb.style.columnGap = (ts.gap ?? 24) + 'px'; }
    tb.append(...K.paraEls(deck, o, ts, o.paras && o.paras.length ? o.paras : [{ runs: [{ t: '' }] }], ctx)); tx.append(tb); return tx;
  };

  K.fit = (root) => {
    root.querySelectorAll('.tx[data-fit]').forEach((tx) => {
      tx.style.setProperty('--fit', 1); const lim = tx.clientHeight; const sh = () => tx.firstChild.scrollHeight + 2 * (parseFloat(tx.style.padding) || 0);
      if (!lim || sh() <= lim) return; let lo = 0.25, hi = 1;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; tx.style.setProperty('--fit', m); if (sh() <= lim) lo = m; else hi = m; }
      tx.style.setProperty('--fit', lo.toFixed(3));
    });
  };

  K.applyGeom = (e, o) => { const s = e.style; s.left = px(o.x); s.top = px(o.y); s.width = px(o.w); s.height = px(o.h); s.transform = o.rot ? `rotate(${o.rot}deg)` : ''; };
  const applyFx = (deck, e, o) => {
    const f = []; if (o.bl) f.push(`blur(${o.bl}px)`); if (o.sh) f.push(`drop-shadow(${o.sh.x}px ${o.sh.y}px ${o.sh.b}px ${K.rgba(deck, o.sh.c, o.sh.a ?? 0.4)})`);
    if (f.length) e.style.filter = f.join(' '); if (o.op != null && o.op < 1) e.style.opacity = o.op;
    if (o.rf) e.style.webkitBoxReflect = `below ${o.rfg ?? 2}px linear-gradient(to bottom, transparent 62%, rgba(255,255,255,${0.45 * o.rf}))`;
  };
  const dashArr = (l) => { const w = l.w || 1; return l.dash === 'dash' ? `${w * 4} ${w * 2.5}` : l.dash === 'dot' ? `${w * 0.1} ${w * 2.2}` : l.dash === 'dashdot' ? `${w * 4} ${w * 2} ${w * 0.1} ${w * 2}` : ''; };
  K.strokeSVG = (deck, d, w, h, line, evenodd) => {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'st'); s.setAttribute('width', w); s.setAttribute('height', h); s.style.overflow = 'visible';
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', K.rgba(deck, line.c, line.a ?? 1)); p.setAttribute('stroke-width', line.w || 1);
    p.setAttribute('stroke-linejoin', line.join || 'round'); p.setAttribute('stroke-linecap', line.dash === 'dot' ? 'round' : line.cap || 'butt'); const da = dashArr(line); if (da) p.setAttribute('stroke-dasharray', da); s.append(p); return s;
  };
  const flipT = (o) => (o.fh || o.fv ? `scale(${o.fh ? -1 : 1},${o.fv ? -1 : 1})` : '');

  function renderShape(deck, o, ctx, e) {
    const def = K.shapes[o.type === 'text' ? 'rect' : o.shape] || K.shapes.rect;
    const w = Math.max(o.w, 0.5), h = Math.max(o.h, 0.5); const d = o.path ? o.path : K.shapePath(o.type === 'text' ? 'rect' : o.shape, w, h, o.adj);
    const fill = o.fill === undefined && def.open ? null : o.fill; const css = K.fillCSS(deck, fill);
    if (css !== 'none') {
      const g = el('gfx'); g.style.background = css; if (o.type !== 'text' && !(o.shape === 'rect' && !o.path)) g.style.clipPath = `path(${(def.evenodd || o.eo) ? 'evenodd,' : ''}'${d}')`; g.style.transform = flipT(o); e.append(g);
    }
    if (o.line && o.line.c && o.line.w !== 0) { const sv = K.strokeSVG(deck, d, w, h, o.line); if (o.fh || o.fv) sv.style.transform = flipT(o); e.append(sv); }
    const empty = K.isEmptyText(o);
    if (!empty || (ctx.edit && o.ph)) {
      const ts = K.tstyle(o);
      const tx = K.textBox(deck, o, ctx, ts); if (empty && ctx.edit) { tx.classList.add('prompt'); const p0 = tx.firstChild.firstChild; p0.textContent = o.prompt || ''; p0.style.opacity = 0.35; }
      if (o.type === 'shape' && ctx.edit === false) { /* nothing */ }
      e.append(tx);
    } else if (o.type === 'text' || o.type === 'shape') { if (ctx.edit) e.append(K.textBox(deck, o, ctx)); }
  }

  function renderImage(deck, o, ctx, e) {
    if (!o.m || !deck.media[o.m]) {
      if (ctx.edit) { e.classList.add('imgph'); const t = el('imgph-in'); t.textContent = o.ph ? 'Click to add image' : 'Missing image'; e.append(t); } else return false; return true;
    }
    const c = o.crop || { x: 0, y: 0, w: 1, h: 1 }; const mask = o.mask && o.mask !== 'rect' ? K.shapePath(o.mask, o.w, o.h, o.adj) : null;
    const g = el('gfx img'); if (mask) g.style.clipPath = `path('${mask}')`; g.style.transform = flipT(o);
    const im = new Image(); im.draggable = false; im.src = K.mediaURL(deck, o.m); im.alt = o.alt || '';
    const W = o.w / c.w, H = o.h / c.h; Object.assign(im.style, { width: px(W), height: px(H), left: px(-c.x * W), top: px(-c.y * H) });
    const a = o.adj || {}; const f = []; if (a.br) f.push(`brightness(${1 + a.br})`); if (a.co) f.push(`contrast(${1 + a.co})`); if (a.sa) f.push(`saturate(${1 + a.sa})`); if (a.hu) f.push(`hue-rotate(${a.hu}deg)`); if (a.gr) f.push(`grayscale(${a.gr})`); if (a.se) f.push(`sepia(${a.se})`); if (a.ib) f.push(`blur(${a.ib}px)`); if (a.inv) f.push('invert(1)');
    if (f.length) im.style.filter = f.join(' '); g.append(im); e.append(g);
    if (o.line && o.line.c && o.line.w) e.append(K.strokeSVG(deck, mask || K.shapePath('rect', o.w, o.h), o.w, o.h, o.line));
    return true;
  }

  function renderTable(deck, o, ctx, e) {
    const t = el('', '', 'table'); t.className = 'tbl'; const st = o.st || {}; const ts = K.tstyle(o);
    const total = o.cw.reduce((a, b) => a + b, 0); t.style.width = px(total);
    const hdrC = K.col(deck, st.c || 'a1'); const hdrFg = K.lum(deck, st.c || 'a1') > 0.62 ? '#111' : '#fff'; const line = K.rgba(deck, 'fg', 0.18);
    o.cells.forEach((row, r) => {
      const tr = el('', '', 'tr'); tr.style.height = px(o.rh[r] || 40);
      row.forEach((cell, c) => {
        if (cell.merged) return; const td = el('', '', 'td'); td.style.width = px(o.cw[c]); td.dataset.r = r; td.dataset.c = c; if (cell.cs > 1) { td.colSpan = cell.cs; } if (cell.rs > 1) td.rowSpan = cell.rs;
        const hdr = st.hdr && r === 0, band = st.band && !hdr && (r - (st.hdr ? 1 : 0)) % 2 === 1;
        let bg = cell.fill ? K.fillCSS(deck, cell.fill) : hdr ? hdrC : band ? K.rgba(deck, st.c || 'a1', 0.1) : 'transparent'; td.style.background = bg;
        const g = st.grid || 'h'; const b = `1px solid ${line}`; if (g === 'all') td.style.border = b; else if (g === 'h') td.style.borderBottom = b;
        const cts = Object.assign({}, ts, cell.ts || {}); if (hdr) { cts.b = true; if (!cell.ts || !cell.ts.c) cts.c = hdrFg; } if (cell.al) cts.al = cell.al;
        const inner = K.textBox(deck, { paras: cell.paras }, ctx, Object.assign({ pad: 8 }, cts)); inner.className = 'tx cell'; inner.style.position = 'static'; td.append(inner); td.style.verticalAlign = cts.va === 'b' ? 'bottom' : cts.va === 't' ? 'top' : 'middle'; tr.append(td);
      }); t.append(tr);
    }); e.append(t);
  }

  function renderMedia(deck, o, ctx, e) {
    const url = o.m ? K.mediaURL(deck, o.m) : ''; e.classList.add('media', o.kind);
    if (o.kind === 'video') { const v = document.createElement('video'); v.src = url; v.preload = 'metadata'; v.muted = !!o.mute; v.loop = !!o.loop; v.playsInline = true; v.dataset.auto = o.auto ? '1' : ''; v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;border-radius:inherit;'; if (ctx.edit) v.controls = false; e.append(v); }
    else { const a = document.createElement('audio'); a.src = url; a.preload = 'metadata'; a.loop = !!o.loop; a.dataset.auto = o.auto ? '1' : ''; e.append(a); if (ctx.edit || ctx.showAudio) { const b = el('audio-badge'); b.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>'; e.append(b); } }
  }

  function renderConn(deck, o, ctx, e) {
    const objs = ctx.objs || []; const r = K.connPath(o, objs); const l = o.line || { c: 'fg', w: 3 };
    e.style.cssText = 'left:0;top:0;width:0;height:0;'; e.classList.add('conn');
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', 1); s.setAttribute('height', 1); s.style.overflow = 'visible'; s.style.position = 'absolute'; s.style.pointerEvents = 'none';
    const col = K.rgba(deck, l.c, l.a ?? 1); const mk = (d, a) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); for (const k in a) p.setAttribute(k, a[k]); s.append(p); return p; };
    mk(r.d, { fill: 'none', stroke: col, 'stroke-width': l.w || 1, 'stroke-linecap': l.dash === 'dot' ? 'round' : 'butt', 'stroke-linejoin': 'round', ...(dashArr(l) ? { 'stroke-dasharray': dashArr(l) } : {}) });
    const hit = mk(r.d, { fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(12, l.w || 1) }); hit.style.pointerEvents = 'stroke';
    for (const [type, pt, ang] of [[l.tail, r.A, r.ha], [l.head, r.B, r.hb]]) { const hp = type && type !== 'none' ? K.headPath(type, pt.x, pt.y, ang, l.w || 1) : null; if (hp) mk(hp.d, { fill: hp.fill ? col : 'none', stroke: col, 'stroke-width': l.w || 1, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }); }
    e.append(s);
  }

  K.renderObject = (deck, o, ctx) => {
    if (o.hid && !ctx.edit) return null;
    const e = el('ko'); e.dataset.id = o.id; e.dataset.t = o.type; if (o.hid) e.style.opacity = 0.25;
    if (o.type !== 'conn') K.applyGeom(e, o);
    switch (o.type) {
      case 'text': case 'shape': {
        if (o.ph && K.isEmptyText(o) && !ctx.edit) return null; renderShape(deck, o, ctx, e); break; }
      case 'image': if (renderImage(deck, o, ctx, e) === false) return null; break;
      case 'table': renderTable(deck, o, ctx, e); break;
      case 'chart': { const c = el('chart'); c.innerHTML = K.chartSVG(deck, o); e.append(c); break; }
      case 'media': renderMedia(deck, o, ctx, e); break;
      case 'conn': renderConn(deck, o, ctx, e); break;
      case 'group': { e.style.cssText = 'left:0;top:0;width:100%;height:100%;pointer-events:none;'; e.classList.add('grp'); for (const k of o.kids) { const ke = K.renderObject(deck, k, { ...ctx, objs: ctx.objs }); if (ke) { ke.style.pointerEvents = 'auto'; e.append(ke); } } break; }
    }
    if (o.link && !ctx.edit) { e.dataset.link = typeof o.link === 'string' ? o.link : o.link.url || ''; }
    if (o.type !== 'conn') applyFx(deck, e, o); else if (o.sh) applyFx(deck, e, o);
    if (o.lock) e.dataset.lock = '1';
    return e;
  };

  // opts: {index, edit, layoutMode, hideLayout}
  K.renderSlide = (deck, slide, opts = {}) => {
    const W = deck.size.w, H = deck.size.h; const ks = el('ks'); ks.style.width = W + 'px'; ks.style.height = H + 'px';
    const lay = opts.layoutMode ? slide.layoutRef : K.layoutOf(deck, slide); ks.style.background = K.slideBgCSS(deck, slide, lay);
    ks.style.fontFamily = K.fontCSS(deck, 'body'); ks.style.color = K.col(deck, 'fg');
    const ctx = { index: opts.index ?? 0, edit: !!opts.edit, objs: slide.objs, slide };
    const map = new Map(); ks._map = map;
    if (!opts.layoutMode && lay && !opts.hideLayout) {
      const L = el('lay');
      for (const o of lay.objs) {
        if (o.ph) { if (o.ph === 'slideno' && !(deck.opts.showNumbers && !slide.noNum)) continue; if (o.ph === 'date' && !deck.opts.showDate) continue; if (o.ph === 'footer' && !deck.opts.footer) continue; if (!['slideno', 'date', 'footer'].includes(o.ph)) continue; }
        const e = K.renderObject(deck, o, { ...ctx, edit: false, objs: lay.objs }); if (e) L.append(e);
      }
      ks.append(L);
    }
    const O = el('objs'); ks._objs = O;
    for (const o of slide.objs) { const e = K.renderObject(deck, o, ctx); if (e) { O.append(e); map.set(o.id, e); } }
    ks.append(O);
    return ks;
  };
  // render a layout as an editable pseudo-slide
  K.layoutAsSlide = (deck, lay) => ({ id: lay.id, objs: lay.objs, bg: lay.bg, layoutRef: lay, layout: lay.id });
})();
