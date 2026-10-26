/* ZengPages core: state, geometry, styles, selection helpers, history, media. */
(() => {
  'use strict';
  const P = (window.P = {});
  const $ = (s, r = document) => r.querySelector(s);
  P.$ = $; P.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  const flow = (P.flow = $('#flow'));
  P.pt2px = (v) => (v * 4) / 3; P.px2pt = (v) => (v * 3) / 4;
  const r2 = (v) => Math.round(v * 100) / 100;
  P.r2 = r2;
  P.GAP = 24; // screen gap between sheets (px)

  /* ---------------- page geometry ---------------- */
  P.SIZES = {
    letter: { label: 'US Letter', w: 816, h: 1056 }, a4: { label: 'A4', w: 794, h: 1123 },
    legal: { label: 'US Legal', w: 816, h: 1344 }, a5: { label: 'A5', w: 559, h: 794 }, custom: { label: 'Custom', w: 816, h: 1056 },
  };
  const defaultPage = () => ({ size: 'letter', land: false, pw: 816, ph: 1056, mt: 96, mb: 96, ml: 96, mr: 96, hd: 48, fd: 48 });
  P.S = {
    page: defaultPage(), cols: 1, colGap: 36, diffFirst: false, pageStart: 1, tab: 48, units: 'in',
    hdr: { def: '', first: '' }, ftr: { def: '', first: '' }, styles: null, comments: [], track: false, author: 'Author',
  };
  P.geom = () => {
    const p = P.S.page; const w = p.land ? p.ph : p.pw, h = p.land ? p.pw : p.ph;
    return { w, h, mt: p.mt, mb: p.mb, ml: p.ml, mr: p.mr, cw: w - p.ml - p.mr, hb: h - p.mt - p.mb, stride: h + P.GAP, hd: p.hd, fd: p.fd };
  };
  P.applyPageCss = () => {
    const g = P.geom(); const root = document.documentElement.style;
    root.setProperty('--pw', g.w + 'px'); root.setProperty('--ph', g.h + 'px');
    root.setProperty('--mt', g.mt + 'px'); root.setProperty('--mb', g.mb + 'px'); root.setProperty('--ml', g.ml + 'px'); root.setProperty('--mr', g.mr + 'px');
    root.setProperty('--cw', g.cw + 'px'); root.setProperty('--hb', g.hb + 'px');
    root.setProperty('--tab', P.S.tab + 'px'); root.setProperty('--hd', g.hd + 'px'); root.setProperty('--fd', g.fd + 'px');
    $('#pagecss').textContent = `@page{size:${g.w}px ${g.h}px;margin:0}`;
  };

  /* ---------------- fonts ---------------- */
  const SERIF = /^(Times|Georgia|Palatino|Garamond|Baskerville|Cambria|Didot|Bodoni|Hoefler|Book Antiqua|Constantia|Cochin|Big Caslon|Charter|Iowan|Rockwell|Century|Bookman|Playfair)/i;
  const MONO = /^(Courier|Menlo|Monaco|Consolas|SF Mono|Andale|Lucida Console|Source Code|Fira Code|JetBrains)/i;
  P.fontCss = (name) => {
    if (!name) return 'inherit';
    const n = String(name).replace(/["']/g, '');
    const gen = MONO.test(n) ? 'monospace' : SERIF.test(n) ? 'serif' : 'sans-serif';
    const alias = { 'Helvetica Neue': ', Helvetica, Arial', Calibri: ', Carlito, "Helvetica Neue"', Cambria: ', Caladea, Georgia', Arial: ', Helvetica, "Liberation Sans"', 'Times New Roman': ', Times, "Liberation Serif"', 'Courier New': ', Courier, "Liberation Mono"', Aptos: ', "Helvetica Neue", Arial' }[n] || '';
    return `"${n}"${alias}, ${gen}`;
  };
  P.FONTS = ['Helvetica Neue', 'Helvetica', 'Arial', 'Arial Narrow', 'Avenir', 'Avenir Next', 'Calibri', 'Candara', 'Segoe UI', 'Tahoma', 'Trebuchet MS', 'Verdana', 'Gill Sans', 'Futura', 'Optima', 'Geneva', 'Lucida Grande', 'Impact',
    'Times New Roman', 'Times', 'Georgia', 'Palatino', 'Garamond', 'Baskerville', 'Book Antiqua', 'Cambria', 'Constantia', 'Didot', 'Hoefler Text', 'Big Caslon', 'Cochin', 'Rockwell',
    'Courier New', 'Courier', 'Menlo', 'Monaco', 'Consolas', 'American Typewriter', 'Comic Sans MS', 'Papyrus', 'Copperplate', 'Inter'];
  P.availableFonts = () => {
    if (P._fonts) return P._fonts;
    const c = document.createElement('canvas').getContext('2d'); const test = 'mmmmmmmmmmlliWwQ@#éßÅ 0123';
    const w = (f) => { c.font = `72px ${f}`; return c.measureText(test).width; };
    const base = { m: w('monospace'), s: w('sans-serif'), r: w('serif') };
    const has = (n) => ['monospace', 'sans-serif', 'serif'].some((g) => w(`"${n}",${g}`) !== base[{ monospace: 'm', 'sans-serif': 's', serif: 'r' }[g]]);
    return (P._fonts = ['System UI', ...P.FONTS.filter(has)]);
  };

  /* ---------------- paragraph styles ---------------- */
  const SANS = 'Helvetica Neue';
  P.DEFAULT_STYLES = () => ({
    'Body': { font: SANS, size: 11, color: '#1d1d1f', lh: 1.35, sb: 0, sa: 8, align: 'left', il: 0, ir: 0, fi: 0 },
    'Title': { size: 30, bold: 1, lh: 1.1, sb: 0, sa: 6, next: 'Subtitle' },
    'Subtitle': { size: 15, color: '#6e6e73', lh: 1.25, sa: 14, next: 'Body' },
    'Heading 1': { size: 20, bold: 1, sb: 20, sa: 6, lh: 1.2, tag: 'h1', next: 'Body', keep: 1 },
    'Heading 2': { size: 16, bold: 1, sb: 16, sa: 4, lh: 1.2, tag: 'h2', next: 'Body', keep: 1 },
    'Heading 3': { size: 13, bold: 1, sb: 12, sa: 4, lh: 1.25, tag: 'h3', next: 'Body', keep: 1 },
    'Heading 4': { size: 11, bold: 1, italic: 1, sb: 10, sa: 3, lh: 1.3, tag: 'h4', next: 'Body', keep: 1 },
    'Quote': { italic: 1, il: 36, ir: 36, color: '#515154', bl: '#ff9f0a', sb: 6, sa: 10 },
    'Code': { font: 'Menlo', size: 9.5, bg: '#f2f2f4', sb: 4, sa: 8, lh: 1.4 },
    'Caption': { size: 9, italic: 1, color: '#6e6e73', align: 'center', sa: 10 },
    'TOC 1': { sa: 4, sb: 6, bold: 1, hidden: 1 }, 'TOC 2': { sa: 2, il: 18, hidden: 1 }, 'TOC 3': { sa: 2, il: 36, hidden: 1, size: 10 },
    'TOC Heading': { size: 16, bold: 1, sb: 0, sa: 10, hidden: 1 },
    'Footnote': { size: 9, sa: 2, lh: 1.25, hidden: 1 },
  });
  P.S.styles = P.DEFAULT_STYLES();
  P.styleFull = (name) => { const st = P.S.styles; return { ...st.Body, bold: 0, italic: 0, bg: '', bl: '', ...(st[name] || {}) }; };
  P.styleSel = (name) => (name === 'Body' ? '.pgdoc p:not([data-st])' : (P.S.styles[name] || {}).tag ? `.pgdoc ${P.S.styles[name].tag}` : `.pgdoc p[data-st="${name}"]`);
  P.genStyleCss = () => {
    let css = '';
    for (const name of Object.keys(P.S.styles)) {
      const d = P.styleFull(name);
      const body = P.S.styles.Body;
      const props = [`font-family:${P.fontCss(d.font || body.font)}`, `font-size:${d.size}pt`, `font-weight:${d.bold ? 700 : 400}`, `font-style:${d.italic ? 'italic' : 'normal'}`,
        `color:${d.color}`, `line-height:var(--lh,${d.lh})`, `--sb:${r2(P.pt2px(d.sb || 0))}px`, `--sa:${r2(P.pt2px(d.sa || 0))}px`, `--il:${r2(d.il || 0)}px`, `--ir:${r2(d.ir || 0)}px`, `--fi:${r2(d.fi || 0)}px`,
        `text-align:${d.align || 'left'}`, `text-decoration:${d.underline ? 'underline' : 'none'}`, `text-transform:${d.caps ? 'uppercase' : 'none'}`, `letter-spacing:${d.ls ? d.ls + 'pt' : 'normal'}`];
      if (d.bg) props.push(`background:${d.bg}`, 'padding:2px 8px');
      if (d.bl) props.push(`border-left:3px solid ${d.bl}`, 'padding-left:12px');
      css += `${P.styleSel(name)}{${props.join(';')}}\n`;
    }
    return css;
  };
  P.applyStyleCss = () => { $('#docstyles').textContent = P.genStyleCss(); P.gapVer = (P.gapVer || 0) + 1; };
  P.styleOfBlock = (el) => { const t = el.tagName; if (/^H[1-4]$/.test(t)) return 'Heading ' + t[1]; return el.getAttribute('data-st') || 'Body'; };
  P.tagOfStyle = (name) => (P.S.styles[name] && P.S.styles[name].tag ? P.S.styles[name].tag.toUpperCase() : 'P');

  /* ---------------- node classification ---------------- */
  const isSpacer = (n) => n.nodeType === 1 && (n.classList.contains('pgsp'));
  const isAtom = (n) => n.nodeType === 1 && (n.tagName === 'IMG' || (n.tagName === 'BR' && n.nextSibling) || n.getAttribute('contenteditable') === 'false' && n.tagName !== 'TR' && n.tagName !== 'DIV');
  P.isSpacer = isSpacer; P.isAtom = isAtom;
  P.BLOCK_SEL = 'p,h1,h2,h3,h4';
  P.blockOf = (node) => { // top-level child of flow containing node
    let n = node; if (!n) return null;
    while (n && n.parentNode !== flow) { n = n.parentNode; if (!n || n === document) return null; }
    return n;
  };
  P.paraOf = (node) => { let n = node; while (n && n !== flow) { if (n.nodeType === 1 && /^(P|H[1-4])$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
  P.cellOf = (node) => { let n = node; while (n && n !== flow) { if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n; n = n.parentNode; } return null; };
  P.inFlow = (node) => !!node && flow.contains(node);
  P.sel = () => getSelection();
  P.range = () => { const s = getSelection(); return s.rangeCount && flow.contains(s.anchorNode) ? s.getRangeAt(0) : null; };

  // logical offsets: number of text chars + atoms before a point inside a block, ignoring page-break spacers
  P.lo = (block, node, off) => {
    let count = 0, res = -1;
    const rec = (n) => {
      if (res >= 0) return;
      if (n.nodeType === 3) { if (n === node) { res = count + off; return; } count += n.nodeValue.length; return; }
      if (n.nodeType !== 1 || isSpacer(n)) return;
      if (isAtom(n)) { if (n === node) { res = count + (off ? 1 : 0); return; } count += 1; return; }
      const kids = n.childNodes;
      for (let i = 0; i < kids.length; i++) { if (n === node && i === off) { res = count; return; } rec(kids[i]); if (res >= 0) return; }
      if (n === node) res = count;
    };
    rec(block); return res < 0 ? 0 : res;
  };
  P.resolve = (block, target) => {
    let count = 0, out = null;
    const rec = (n) => {
      if (out) return;
      if (n.nodeType === 3) { const L = n.nodeValue.length; if (target <= count + L) { out = [n, target - count]; return; } count += L; return; }
      if (n.nodeType !== 1 || isSpacer(n)) return;
      if (isAtom(n)) { if (target === count) { out = [n.parentNode, [...n.parentNode.childNodes].indexOf(n)]; return; } count += 1; return; }
      for (const k of n.childNodes) { rec(k); if (out) return; }
    };
    rec(block); return out || [block, block.childNodes.length];
  };
  P.saveSel = () => {
    const s = getSelection(); if (!s.rangeCount || !flow.contains(s.anchorNode) || !flow.contains(s.focusNode)) return null;
    const ba = P.blockOf(s.anchorNode), bf = P.blockOf(s.focusNode); if (!ba || !bf) return null;
    const idx = (b) => Array.prototype.indexOf.call(flow.children, b);
    return { a: [idx(ba), P.lo(ba, s.anchorNode, s.anchorOffset)], f: [idx(bf), P.lo(bf, s.focusNode, s.focusOffset)] };
  };
  P.restoreSel = (sv) => {
    if (!sv) return; const k = flow.children; const ba = k[Math.min(sv.a[0], k.length - 1)], bf = k[Math.min(sv.f[0], k.length - 1)]; if (!ba || !bf) return;
    const a = P.resolve(ba, sv.a[1]), f = P.resolve(bf, sv.f[1]);
    try { getSelection().setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch { /* ignore */ }
  };
  P.placeCaretIn = (el, atEnd = false) => {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };

  /* ---------------- clean HTML / doc JSON ---------------- */
  const reClean = [
    [/<span class="pgsp"[^>]*><\/span>/g, ''], [/<tr class="pgsp"[\s\S]*?<\/tr>/g, ''],
    [/ data-pg="[^"]*"/g, ''], [/ data-mark="[^"]*"/g, ''], [/ data-sel="[^"]*"/g, ''],
    [/--(?:pg|colx|colw):[^;"]*;?/g, ''], [/ style=" *"/g, ''], [/ class=" *"/g, ''],
  ];
  P.cleanString = (h) => { for (const [re, to] of reClean) h = h.replace(re, to); return h; };
  P.cleanHTML = (el = flow) => P.cleanString(el.innerHTML);
  P.docJSON = () => { const S = P.S; return JSON.stringify({ page: S.page, cols: S.cols, colGap: S.colGap, diffFirst: S.diffFirst, pageStart: S.pageStart, tab: S.tab, hdr: S.hdr, ftr: S.ftr, styles: S.styles, comments: S.comments }); };
  P.applyDocJSON = (j) => {
    const d = typeof j === 'string' ? JSON.parse(j) : j; const S = P.S;
    if (d.page) S.page = { ...defaultPage(), ...d.page }; S.cols = d.cols || 1; S.colGap = d.colGap ?? 36; S.diffFirst = !!d.diffFirst; S.pageStart = d.pageStart || 1; S.tab = d.tab || 48;
    S.hdr = { def: '', first: '', ...(d.hdr || {}) }; S.ftr = { def: '', first: '', ...(d.ftr || {}) };
    S.styles = { ...P.DEFAULT_STYLES(), ...(d.styles || {}) }; S.comments = d.comments || [];
    P.applyPageCss(); P.applyStyleCss();
  };

  /* ---------------- history (snapshot based; cheap enough for 50 pages) ---------------- */
  const H = (P.hist = { u: [], r: [], open: false, t: 0 });
  const state = () => ({ html: P.cleanHTML(), sel: P.saveSel(), st: P.docJSON() });
  P.checkpoint = (merge = false) => {
    if (merge && H.open) { clearTimeout(H.t); H.t = setTimeout(() => (H.open = false), 900); return; }
    clearTimeout(H.t); H.u.push(state()); if (H.u.length > 120) H.u.shift(); H.r.length = 0;
    H.open = merge; if (merge) H.t = setTimeout(() => (H.open = false), 900);
    P.onHistory && P.onHistory();
  };
  P.closeGroup = () => { H.open = false; clearTimeout(H.t); };
  const applyState = (s) => {
    const cur = P.docJSON(); if (s.st !== cur) P.applyDocJSON(s.st);
    flow.innerHTML = s.html; P.afterLoad(); P.restoreSel(s.sel); flow.focus({ preventScroll: true }); P.onHistory && P.onHistory();
  };
  P.undo = () => { if (!H.u.length) return; H.r.push(state()); const s = H.u.pop(); H.open = false; applyState(s); P.markDirty(); };
  P.redo = () => { if (!H.r.length) return; H.u.push(state()); const s = H.r.pop(); H.open = false; applyState(s); P.markDirty(); };
  P.clearHistory = () => { H.u.length = 0; H.r.length = 0; H.open = false; };
  P.markDirty = () => { P.doc && P.doc.markDirty(); P.draftSoon && P.draftSoon(); };
  /** wrap a mutation so it's undoable and marks dirty */
  P.edit = (fn, opts = {}) => {
    if (!opts.noCheckpoint) P.checkpoint(false);
    const r = fn(); P.changed(opts); P.markDirty(); return r;
  };

  /* ---------------- media ---------------- */
  P.media = new Map(); let mseq = 1;
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
  P.mediaExt = (mime) => EXT[mime] || 'bin';
  P.mimeOfExt = (e) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[String(e).toLowerCase()] || 'application/octet-stream');
  P.addMedia = (bytes, mime, forceId) => {
    const id = forceId || 'm' + mseq++; if (forceId) { const n = +String(forceId).replace(/\D/g, ''); if (n >= mseq) mseq = n + 1; }
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const url = URL.createObjectURL(new Blob([u8], { type: mime }));
    P.media.set(id, { id, mime, bytes: u8, url }); return P.media.get(id);
  };
  P.resetMedia = () => { for (const m of P.media.values()) URL.revokeObjectURL(m.url); P.media.clear(); mseq = 1; };
  P.imgSize = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth || 200, h: i.naturalHeight || 150 }); i.onerror = () => res({ w: 200, h: 150 }); i.src = url; });
  P.u8ToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  P.b64ToU8 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

  /* ---------------- misc ---------------- */
  P.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  P.toPx = (v, unit) => (unit === 'cm' ? (v * 96) / 2.54 : unit === 'pt' ? (v * 4) / 3 : v * 96);
  P.fromPx = (px, unit = P.S.units) => (unit === 'cm' ? (px * 2.54) / 96 : unit === 'pt' ? (px * 3) / 4 : px / 96);
  P.fmtLen = (px) => r2(P.fromPx(px)) + (P.S.units === 'cm' ? ' cm' : ' in');
  P.blockText = (el) => el.textContent;
  P.words = (t) => (t.match(/[^\s]+/g) || []).length;
  P.uid = () => Math.random().toString(36).slice(2, 8);
  P.slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
})();
