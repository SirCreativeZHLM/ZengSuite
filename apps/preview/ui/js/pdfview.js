/* PDF viewing: pdf.js loading, page model, continuous/single/two-up layout, lazy canvas + text + form layers,
   thumbnails, outline, search. Pages are described by descriptors { src, idx, rot, crop, anns, ... } so that
   reorder/delete/insert/rotate/crop are cheap model edits that pdfsave.js writes out with pdf-lib. */
'use strict';
const Pdf = (P.Pdf = {
  lib: null, sources: [], pages: [], pvs: [], mode: 'continuous', zoom: 1, zoomMode: 'width', cur: 0, invert: false,
  text: new Map(), hits: [], hitIdx: -1, query: '', rendered: new Set(), selected: new Set(), pad: 18, gap: 12, filePassword: null, info: null, open: false,
});
const CSSPT = 96 / 72;
const SCROLL = () => $('#pdfscroll');

// ---------- pdf.js bootstrap ----------
Pdf.load = async () => {
  if (Pdf.lib) return Pdf.lib;
  const lib = await import('/vendor/pdfjs/pdf.min.mjs');
  const base = new URL('/vendor/pdfjs/', location.href).href;
  let worker = base + 'pdf.worker.min.mjs';
  // A blob worker is the most portable under the custom scheme + CSP (worker-src 'self' blob:).
  try { const r = await fetch(worker); const t = await r.text(); worker = URL.createObjectURL(new Blob([t], { type: 'text/javascript' })); } catch (e) { console.warn('worker blob fallback failed', e); }
  lib.GlobalWorkerOptions.workerSrc = worker;
  Pdf.base = base; Pdf.lib = lib; return lib;
};
Pdf.docOptions = (data) => ({ data, cMapUrl: Pdf.base + 'cmaps/', cMapPacked: true, standardFontDataUrl: Pdf.base + 'standard_fonts/', wasmUrl: Pdf.base + 'wasm/', isEvalSupported: false, useSystemFonts: true, enableXfa: false, verbosity: 0 });
const askPassword = async (retry) => {
  const input = el('input.zk-input.selectable', { type: 'password', placeholder: 'Password', style: { width: '100%', height: '30px' } });
  const r = await zk.sheet({ title: 'This document is password protected', message: retry ? 'The password was incorrect. Try again.' : 'Enter the password to open it.', body: input, buttons: [{ label: 'Cancel', value: null }, { label: 'Open', primary: true, value: 'ok' }] });
  return r === 'ok' ? input.value : null;
};
// open one PDF into a pdf.js proxy; resolves {doc, password}
Pdf.openSource = async (bytes) => {
  const lib = await Pdf.load(); const task = lib.getDocument(Pdf.docOptions(bytes.slice())); let password = null; let cancelled = false;
  task.onPassword = async (update, reason) => { const pw = await askPassword(reason === lib.PasswordResponses.INCORRECT_PASSWORD); if (pw == null) { cancelled = true; task.destroy(); return; } password = pw; update(pw); };
  try { const doc = await task.promise; if (!Pdf.VP) Pdf.VP = (await doc.getPage(1)).getViewport({ scale: 1 }).constructor; return { doc, password }; } catch (e) { if (cancelled) { const x = new Error('cancelled'); x.cancelled = true; throw x; } throw e; }
};

// ---------- opening a document ----------
const findZeng = (b) => { const k = [90, 101, 110, 103, 68, 97, 116, 97]; outer: for (let i = 0, n = b.length - 8; i < n; i++) { if (b[i] !== 90) continue; for (let j = 1; j < 8; j++) if (b[i + j] !== k[j]) continue outer; return true; } return false; };
Pdf.openBytes = async (bytes, name, handle) => {
  const lib = await Pdf.load();
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50)) { const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024)); if (!head.includes('%PDF-')) throw new Error('This file is not a valid PDF.'); }
  let restored = null; let base = bytes;
  if (findZeng(bytes)) { try { const r = await Pdf.pullOwnAnnotations(bytes); if (r) { restored = r.byPage; base = r.clean; } } catch (e) { console.warn('annotation restore failed', e); } }
  const { doc, password } = await Pdf.openSource(base);
  Pdf.closeAll();
  Pdf.sources = [{ id: 0, bytes: base, doc, name, encrypted: !!password || doc.isEncrypted === true, password }];
  const n = doc.numPages; Pdf.pages = Array.from({ length: n }, (_, i) => ({ id: uid(), src: 0, idx: i, rot: 0, crop: null, anns: (restored && restored[i]) || [] }));
  Pdf.zoomMode = 'width'; Pdf.cur = 0; Pdf.text = new Map(); Pdf.hits = []; Pdf.selected = new Set([0]); Pdf.open = true; Pdf.query = '';
  Pdf.info = null; Pdf.formIds = null;
  doc.annotationStorage.onSetModified = () => { P.doc && P.doc.markDirty(); };
  await Pdf.measure(0, Math.min(n, 12));
  Pdf.rebuild(); Pdf.measure(0, n).then(() => { Pdf.relayout(); });
  Pdf.outline = null; Pdf.loadOutline();
  return n;
};
Pdf.closeAll = () => {
  for (const s of Pdf.sources) { try { s.doc.destroy(); } catch {} }
  Pdf.sources = []; Pdf.pages = []; Pdf.pvs.forEach((pv) => Pdf.unrender(pv)); Pdf.pvs = []; Pdf.rendered.clear(); $('#pages').replaceChildren(); Pdf.open = false; Pdf.hits = []; Pdf.text = new Map();
};
Pdf.getPage = async (desc) => { if (desc.blank) return null; const s = Pdf.sources[desc.src]; return await s.doc.getPage(desc.idx + 1); };
// fill desc.vb / pr (view box and intrinsic rotation) for a range of pages
let measuring = null;
Pdf.measure = async (a, b) => {
  const work = async () => { for (let i = a; i < b; i++) { const d = Pdf.pages[i]; if (!d || d.vb || d.blank) continue; const p = await Pdf.getPage(d); d.vb = p.view.slice(); d.pr = p.rotate || 0; d.uu = p.userUnit || 1; if (i % 40 === 39) await sleep(0); } };
  measuring = (measuring || Promise.resolve()).then(work); return measuring;
};
Pdf.vpFor = (d, scale) => new Pdf.VP({ viewBox: d.crop || d.vb || [0, 0, 612, 792], userUnit: d.uu || 1, scale, rotation: (((d.pr || 0) + d.rot) % 360 + 360) % 360, offsetX: 0, offsetY: 0, dontFlip: false });
const wrapVp = (v) => ({ w: v.width, h: v.height, scale: v.scale, rot: v.rotation, v, toV: (x, y) => v.convertToViewportPoint(x, y), toD: (x, y) => v.convertToPdfPoint(x, y) });
Pdf.scale = () => Pdf.zoom * CSSPT;
Pdf.defaultVb = () => (Pdf.pages.find((p) => p.vb) || { vb: [0, 0, 612, 792] }).vb;

// ---------- layout ----------
Pdf.rows = () => {
  const n = Pdf.pages.length; const rows = [];
  if (Pdf.mode === 'two') { for (let i = 0; i < n; i += 2) rows.push(i + 1 < n ? [i, i + 1] : [i]); } else for (let i = 0; i < n; i++) rows.push([i]);
  return rows;
};
Pdf.rebuild = () => { // recreate all page elements (after structure change)
  Pdf.pvs.forEach((pv) => Pdf.unrender(pv)); Pdf.rendered.clear();
  const host = $('#pages'); host.replaceChildren(); Pdf.pvs = [];
  Pdf.pages.forEach((d, i) => { const pvEl = el('.page', { 'data-i': i }); const pv = { i, desc: d, el: pvEl, kind: 'pdf', scaleKey: null }; pvEl.append(el('.pgnum', String(i + 1))); Ann.attach(pv); Pdf.pvs.push(pv); });
  Pdf.relayout(true);
};
Pdf.fitZoom = () => {
  const sc = SCROLL(); const W = sc.clientWidth - Pdf.pad * 2, H = sc.clientHeight - Pdf.pad * 2; const rows = Pdf.rows();
  const sample = Pdf.mode === 'single' ? [Pdf.cur] : (rows.find((r) => r.includes(Pdf.cur)) || [0]);
  let bw = 0, bh = 0; sample.forEach((i) => { const v = Pdf.vpFor(Pdf.pages[i], 1); bw += v.width; bh = Math.max(bh, v.height); }); bw += (sample.length - 1) * Pdf.gap;
  if (Pdf.mode !== 'two') { bw = 0; Pdf.pages.forEach((d, i) => { if (d.vb || i < 1) bw = Math.max(bw, Pdf.vpFor(d, 1).width); }); }
  const zw = W / bw / CSSPT, zh = H / bh / CSSPT;
  return Pdf.zoomMode === 'page' ? Math.min(zw, zh) : zw;
};
Pdf.relayout = (full) => {
  if (!Pdf.open) return; const sc = SCROLL(); if (!sc.clientWidth) return;
  const anchor = full ? null : Pdf.anchor();
  if (Pdf.zoomMode !== 'custom') Pdf.zoom = clamp(Pdf.fitZoom(), 0.1, 8);
  const scale = Pdf.scale(); const host = $('#pages'); const rows = Pdf.rows();
  host.className = Pdf.mode; host.style.setProperty('--pad', Pdf.pad + 'px'); host.style.setProperty('--gap', Pdf.gap + 'px');
  host.replaceChildren(...rows.map((r, ri) => {
    const rowEl = el('.row', { 'data-r': ri }, r.map((i) => Pdf.pvs[i].el)); r.forEach((i) => { const pv = Pdf.pvs[i]; const v = Pdf.vpFor(pv.desc, scale); pv.vp = wrapVp(v); pv.el.style.width = v.width + 'px'; pv.el.style.height = v.height + 'px'; pv.el.style.setProperty('--scale-factor', scale); pv.el.style.setProperty('--user-unit', pv.desc.uu || 1); pv.el.style.setProperty('--total-scale-factor', scale * (pv.desc.uu || 1)); Ann.size(pv); });
    rowEl.style.height = Math.max(...r.map((i) => Pdf.pvs[i].vp.h)) + 'px'; if (Pdf.mode === 'single') rowEl.style.display = r.includes(Pdf.cur) ? '' : 'none'; return rowEl;
  }));
  Pdf.pvs.forEach((pv) => { if (pv.rendered && pv.scaleKey !== scale + ':' + pv.desc.rot + ':' + (pv.desc.crop || '')) { /* re-render lazily */ } Ann.redraw(pv); });
  Pdf.rowTops = null; if (anchor) Pdf.restoreAnchor(anchor);
  Pdf.onScroll(true); P.onZoom && P.onZoom();
};
Pdf.computeTops = () => { const rs = $$('#pages > .row'); Pdf.rowTops = rs.map((r) => [r.offsetTop, r.offsetHeight, r]); };
Pdf.pvRow = (i) => $(`#pages > .row:nth-child(${Pdf.mode === 'two' ? Math.floor(i / 2) + 1 : i + 1})`);
// anchor: keep a document point stable across relayout
Pdf.anchor = (cx, cy) => {
  const sc = SCROLL(); const r = sc.getBoundingClientRect(); const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 3;
  for (const pv of Pdf.pvs) { if (!pv.el.offsetParent) continue; const b = pv.el.getBoundingClientRect(); if (py >= b.top - Pdf.gap && py <= b.bottom + Pdf.gap / 2 || b.top > py) { return { i: pv.i, fy: (py - b.top) / b.height, fx: (px - b.left) / b.width, px: px - r.left, py: py - r.top }; } }
  return null;
};
Pdf.restoreAnchor = (a) => { const pv = Pdf.pvs[a.i]; if (!pv) return; const sc = SCROLL(); const r = sc.getBoundingClientRect(); const b = pv.el.getBoundingClientRect(); sc.scrollTop += b.top + a.fy * b.height - (r.top + a.py); sc.scrollLeft += b.left + a.fx * b.width - (r.left + a.px); };

// ---------- scrolling / lazy rendering ----------
let scrollRaf = 0;
Pdf.onScroll = (now) => { if (now) return Pdf.updateVisible(); if (scrollRaf) return; scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; Pdf.updateVisible(); }); };
Pdf.updateVisible = () => {
  if (!Pdf.open || !Pdf.pvs.length) return; const sc = SCROLL(); const r = sc.getBoundingClientRect(); if (!r.height) return;
  const vis = [], want = []; const margin = r.height * 0.9;
  // binary-ish: scan rows near the scroll position using cached tops
  if (!Pdf.rowTops) Pdf.computeTops(); const T = Pdf.rowTops; const top = sc.scrollTop, bot = top + r.height;
  let lo = 0, hi = T.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m][0] + T[m][1] < top - margin) lo = m + 1; else hi = m; }
  let cur = -1, bestOv = -1; const mid = top + r.height * 0.4;
  for (let k = lo; k < T.length; k++) { const [t, h, rowEl] = T[k]; if (rowEl.style.display === 'none') continue; if (t > bot + margin) break; const ri = +rowEl.dataset.r; const idxs = Pdf.mode === 'two' ? [ri * 2, ri * 2 + 1] : [ri]; const ov = Math.min(bot, t + h) - Math.max(top, t); idxs.forEach((i) => Pdf.pvs[i] && want.push(i)); if (ov > 0) { idxs.forEach((i) => Pdf.pvs[i] && vis.push(i)); } if (mid >= t && mid <= t + h + Pdf.gap) cur = idxs[0]; else if (cur < 0 && ov > bestOv) { bestOv = ov; cur = idxs[0]; } }
  if (Pdf.mode === 'single') { want.length = 0; want.push(Pdf.cur); vis.length = 0; vis.push(Pdf.cur); cur = Pdf.cur; }
  if (cur >= 0 && cur !== Pdf.cur) { Pdf.cur = cur; P.onPage && P.onPage(); }
  // render wanted, free those far away
  const keep = new Set(want); want.forEach((i) => Pdf.render(Pdf.pvs[i]));
  for (const i of [...Pdf.rendered]) if (!keep.has(i)) { const dist = Math.min(...[...keep].map((k) => Math.abs(k - i)), 99); if (dist > 2 || Pdf.rendered.size > 10) Pdf.unrender(Pdf.pvs[i]); }
};
const queue = { run: 0, items: [] };
Pdf.enqueue = (fn, prio = 0) => new Promise((res, rej) => { queue.items.push({ fn, prio, res, rej }); queue.items.sort((a, b) => b.prio - a.prio); pump(); });
const pump = () => { while (queue.run < 2 && queue.items.length) { const it = queue.items.shift(); queue.run++; Promise.resolve().then(it.fn).then(it.res, it.rej).finally(() => { queue.run--; pump(); }); } };
const keyFor = (pv) => Pdf.scale().toFixed(4) + ':' + pv.desc.rot + ':' + (pv.desc.crop || '') + ':' + Pdf.invert;
Pdf.render = async (pv) => {
  if (!pv || !pv.vp) return; const key = keyFor(pv); if (pv.scaleKey === key || pv.pending === key) return; pv.pending = key; Pdf.rendered.add(pv.i);
  if (pv.task) { try { pv.task.cancel(); } catch {} }
  const desc = pv.desc; const scale = Pdf.scale();
  try {
    if (desc.blank) { pv.scaleKey = key; pv.pending = null; pv.el.classList.add('blank'); return; }
    const page = await Pdf.getPage(desc); if (pv.pending !== key || !Pdf.pvs.includes(pv)) return;
    await Pdf.enqueue(async () => {
      if (pv.pending !== key) return;
      const dpr = window.devicePixelRatio || 1; let out = scale * dpr; const cssV = Pdf.vpFor(desc, scale); const maxPx = 26e6; const px = cssV.width * cssV.height * dpr * dpr; if (px > maxPx) out = scale * dpr * Math.sqrt(maxPx / px);
      const v = Pdf.vpFor(desc, out); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height); canvas.className = 'pdfc';
      const task = page.render({ canvas, canvasContext: canvas.getContext('2d', { alpha: false }), viewport: v, annotationMode: Pdf.lib.AnnotationMode.ENABLE_FORMS }); pv.task = task;
      try { await task.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') { return; } throw e; } finally { if (pv.task === task) pv.task = null; }
      if (pv.pending !== key) { freeCanvas(canvas); return; }
      if (pv.canvas) { freeCanvas(pv.canvas); pv.canvas.remove(); } pv.canvas = canvas; pv.el.prepend(canvas); pv.el.classList.add('ready');
      pv.scaleKey = key; pv.pending = null;
    }, 5 - Math.min(4, Math.abs(pv.i - Pdf.cur)));
    if (pv.scaleKey !== key) return;
    // text + forms layers (cheap, CSS-pixel viewport)
    pv.vp = wrapVp(cssV0(desc, scale)); Ann.size(pv);
    await Pdf.buildTextLayer(pv, page, scale); await Pdf.buildFormLayer(pv, page, scale);
    Ann.redraw(pv); Pdf.paintHits(pv);
  } catch (e) { console.error('render page', pv.i, e); pv.pending = null; }
};
const cssV0 = (d, s) => Pdf.vpFor(d, s);
Pdf.buildTextLayer = async (pv, page, scale) => {
  pv.textEl && pv.textEl.remove(); const div = el('.textLayer'); pv.el.insertBefore(div, pv.layer); pv.textEl = div;
  try { const tl = new Pdf.lib.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: div, viewport: Pdf.vpFor(pv.desc, scale) }); await tl.render(); pv.tl = tl; } catch (e) { console.warn('text layer', e); }
};
const linkService = {
  externalLinkEnabled: true, isInPresentationMode: false, pagesCount: 0, page: 1, rotation: 0,
  getDestinationHash: () => '#', getAnchorUrl: (h) => h, setHash() {}, executeNamedAction(a) { if (a === 'NextPage') Pdf.goto(Pdf.cur + 1); else if (a === 'PrevPage') Pdf.goto(Pdf.cur - 1); else if (a === 'FirstPage') Pdf.goto(0); else if (a === 'LastPage') Pdf.goto(Pdf.pages.length - 1); },
  executeSetOCGState() {}, goToDestination: (d) => Pdf.goDest(d), goToPage: (n) => Pdf.goto(n - 1),
  addLinkAttributes(link, url, newWindow) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer nofollow'; link.addEventListener('click', (e) => { e.preventDefault(); zeng.isNative ? zeng.call('open_url', { url }).catch(() => {}) : window.open(url, '_blank', 'noopener'); }); },
  eventBus: { dispatch() {}, on() {}, off() {} }, getPageIndex: () => 0, getPageNumberFromDest: () => 0,
};
Pdf.buildFormLayer = async (pv, page, scale) => {
  pv.formEl && pv.formEl.remove(); pv.formEl = null; if (pv.desc.blank) return;
  const src = Pdf.sources[pv.desc.src]; const annotations = await page.getAnnotations({ intent: 'display' }); if (!annotations.length) return;
  const div = el('.annotationLayer'); pv.el.insertBefore(div, pv.layer); pv.formEl = div;
  const vp = Pdf.vpFor(pv.desc, scale).clone({ dontFlip: true });
  try { const al = new Pdf.lib.AnnotationLayer({ div, accessibilityManager: null, annotationCanvasMap: null, annotationEditorUIManager: null, page, viewport: vp, structTreeLayer: null, linkService, annotationStorage: src.doc.annotationStorage }); await al.render({ annotations, imageResourcesPath: '', renderForms: true, linkService, downloadManager: null, annotationStorage: src.doc.annotationStorage, enableScripting: false, hasJSActions: false, fieldObjects: null }); } catch (e) { console.warn('annotation layer', e); }
};
Pdf.unrender = (pv) => {
  if (!pv) return; if (pv.task) { try { pv.task.cancel(); } catch {} pv.task = null; } pv.pending = null;
  if (pv.canvas) { freeCanvas(pv.canvas); pv.canvas.remove(); pv.canvas = null; } pv.textEl && pv.textEl.remove(); pv.formEl && pv.formEl.remove(); pv.hlEl && pv.hlEl.remove(); pv.textEl = pv.formEl = pv.hlEl = pv.tl = null; pv.scaleKey = null; pv.el.classList.remove('ready'); Pdf.rendered.delete(pv.i);
};
Pdf.rerenderAll = () => { Pdf.pvs.forEach((pv) => { if (pv.canvas) { pv.scaleKey = null; } }); Pdf.updateVisible(); [...Pdf.rendered].forEach((i) => Pdf.render(Pdf.pvs[i])); };

// ---------- navigation ----------
Pdf.goto = (i, { top = null } = {}) => {
  i = clamp(i, 0, Pdf.pages.length - 1); const pv = Pdf.pvs[i]; if (!pv) return; Pdf.cur = i; const sc = SCROLL();
  if (Pdf.mode === 'single') { Pdf.relayout(); sc.scrollTop = 0; } else { const row = pv.el.parentElement; const y = row.offsetTop - Pdf.pad + (top != null ? top - 40 : 0); sc.scrollTop = Math.max(0, y); }
  Pdf.onScroll(true); P.onPage && P.onPage();
};
Pdf.goDest = async (dest) => {
  try { const src = Pdf.sources[0]; if (typeof dest === 'string') dest = await src.doc.getDestination(dest); if (!Array.isArray(dest)) return; let idx = typeof dest[0] === 'object' && dest[0] !== null ? await src.doc.getPageIndex(dest[0]) : dest[0];
    const di = Pdf.pages.findIndex((d) => d.src === 0 && d.idx === idx); if (di < 0) return; const pv = Pdf.pvs[di]; let top = null; if (dest[1] && dest[1].name === 'XYZ' && dest[3] != null && pv.vp) top = pv.vp.toV(dest[2] || 0, dest[3])[1]; Pdf.goto(di, { top }); } catch (e) { console.warn(e); }
};
Pdf.setMode = (m) => { Pdf.mode = m; const cur = Pdf.cur; Pdf.rebuild(); Pdf.goto(cur); P.refreshChrome && P.refreshChrome(); };
Pdf.setZoom = (z, mode = 'custom', anchor) => { Pdf.zoomMode = mode; if (mode === 'custom') Pdf.zoom = clamp(z, 0.1, 8); const a = anchor || Pdf.anchor(); Pdf.relayoutKeep(a); Pdf.rerenderAll(); };
Pdf.relayoutKeep = (a) => { Pdf.relayout(true); if (a) { Pdf.rowTops = null; Pdf.restoreAnchor(a); } Pdf.onScroll(true); };
Pdf.zoomBy = (f, anchor) => { const z = clamp((Pdf.zoom || 1) * f, 0.1, 8); Pdf.setZoom(z, 'custom', anchor); };
// pinch / ctrl+wheel: live CSS transform then commit
const pz = { k: 1, cx: 0, cy: 0, timer: 0, anchor: null };
Pdf.pinch = (factor, cx, cy, commitNow) => {
  const sc = SCROLL(), host = $('#pages'); if (!pz.anchor) { pz.anchor = Pdf.anchor(cx, cy); const r = host.getBoundingClientRect(); pz.cx = cx - r.left; pz.cy = cy - r.top; pz.k = 1; }
  pz.k = clamp(pz.k * factor, 0.1 / Pdf.zoom, 8 / Pdf.zoom); host.style.transformOrigin = `${pz.cx}px ${pz.cy}px`; host.style.transform = `scale(${pz.k})`;
  clearTimeout(pz.timer); const commit = () => { host.style.transform = ''; const z = clamp(Pdf.zoom * pz.k, 0.1, 8); const a = pz.anchor; pz.anchor = null; pz.k = 1; Pdf.setZoom(z, 'custom', a); }; if (commitNow) commit(); else pz.timer = setTimeout(commit, 140);
};
Pdf.pageLabel = (i) => String(i + 1);

// ---------- outline ----------
Pdf.loadOutline = async () => { try { Pdf.outline = (await Pdf.sources[0].doc.getOutline()) || []; } catch { Pdf.outline = []; } P.onOutline && P.onOutline(); };

// ---------- search ----------
Pdf.pageText = async (di) => {
  const d = Pdf.pages[di]; if (d.blank) return { items: [], full: '', offs: [] }; const key = d.src + ':' + d.idx; let t = Pdf.text.get(key); if (t) return t;
  const page = await Pdf.getPage(d); const tc = await page.getTextContent({ disableNormalization: true }); const items = [], offs = []; let full = '';
  for (const it of tc.items) { if (it.str === undefined) continue; items.push(it.str); offs.push(full.length); full += it.str; if (it.hasEOL) full += '\n'; else if (it.str && !/\s$/.test(it.str)) { /* items usually carry their own spacing */ } }
  t = { items, full, offs, lower: full.toLowerCase() }; Pdf.text.set(key, t); return t;
};
let searchTok = 0;
Pdf.search = async (q, { cs = false, onProgress } = {}) => {
  const tok = ++searchTok; Pdf.query = q; Pdf.hits = []; Pdf.hitIdx = -1; Pdf.pvs.forEach((pv) => Pdf.paintHits(pv)); if (!q) { P.onHits && P.onHits(); return; }
  const needle = cs ? q : q.toLowerCase(); const n = Pdf.pages.length;
  for (let i = 0; i < n; i++) {
    if (tok !== searchTok) return; const t = await Pdf.pageText(i); const hay = cs ? t.full : t.lower; let from = 0, k;
    while ((k = hay.indexOf(needle, from)) >= 0) { Pdf.hits.push({ di: i, s: k, e: k + needle.length, snip: t.full.slice(Math.max(0, k - 28), k + needle.length + 40).replace(/\s+/g, ' ') }); from = k + Math.max(1, needle.length); if (Pdf.hits.length > 5000) break; }
    if (i % 6 === 5) { onProgress && onProgress(i / n, Pdf.hits.length); P.onHits && P.onHits(); await sleep(0); } if (Pdf.hits.length > 5000) break;
  }
  if (tok !== searchTok) return; onProgress && onProgress(1, Pdf.hits.length); P.onHits && P.onHits();
  if (Pdf.hits.length) { const from = Pdf.cur; let k = Pdf.hits.findIndex((h) => h.di >= from); if (k < 0) k = 0; Pdf.gotoHit(k); } else { Pdf.pvs.forEach((pv) => Pdf.paintHits(pv)); }
};
Pdf.gotoHit = async (k) => {
  if (!Pdf.hits.length) return; k = ((k % Pdf.hits.length) + Pdf.hits.length) % Pdf.hits.length; Pdf.hitIdx = k; const h = Pdf.hits[k]; P.onHits && P.onHits();
  const pv = Pdf.pvs[h.di]; const visible = pv && pv.el.offsetParent && (() => { const r = pv.el.getBoundingClientRect(), s = SCROLL().getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom; })();
  if (!visible) Pdf.goto(h.di); Pdf.pvs.forEach((p) => Pdf.paintHits(p));
  // wait for text layer then scroll the hit into view
  for (let t = 0; t < 40 && !(pv.tl && pv.hlEl); t++) await sleep(50);
  const cur = pv.hlEl && pv.hlEl.querySelector('.cur'); if (cur) { const sc = SCROLL(), r = cur.getBoundingClientRect(), s = sc.getBoundingClientRect(); if (r.top < s.top + 60 || r.bottom > s.bottom - 60) sc.scrollTop += r.top - s.top - s.height / 3; if (r.left < s.left || r.right > s.right) sc.scrollLeft += r.left - s.left - 80; }
};
Pdf.paintHits = (pv) => {
  if (!pv) return; pv.hlEl && pv.hlEl.remove(); pv.hlEl = null; if (!Pdf.query || !pv.tl || !pv.textEl) return;
  const mine = Pdf.hits.map((h, k) => [h, k]).filter(([h]) => h.di === pv.i); if (!mine.length) return;
  const t = Pdf.text.get(pv.desc.src + ':' + pv.desc.idx); if (!t) return; const divs = pv.tl.textDivs, strs = pv.tl.textContentItemsStr; if (!divs || divs.length !== strs.length || strs.length !== t.items.length) return;
  const box = el('.hits'); const pr = pv.el.getBoundingClientRect(); const kx = pr.width / pv.vp.w || 1;
  for (const [h, k] of mine) {
    // find items overlapping [s,e)
    let lo = 0, hi = t.offs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t.offs[m] <= h.s) lo = m; else hi = m - 1; }
    for (let i = lo; i < t.offs.length && t.offs[i] < h.e; i++) { const a = Math.max(h.s, t.offs[i]) - t.offs[i], b = Math.min(h.e, t.offs[i] + t.items[i].length) - t.offs[i]; if (b <= a) continue; const node = divs[i].firstChild; if (!node) continue; const rg = document.createRange(); try { rg.setStart(node, Math.min(a, node.length)); rg.setEnd(node, Math.min(b, node.length)); } catch { continue; }
      for (const r of rg.getClientRects()) box.append(el('.hit' + (k === Pdf.hitIdx ? '.cur' : ''), { style: { left: (r.left - pr.left) / kx + 'px', top: (r.top - pr.top) / kx + 'px', width: r.width / kx + 'px', height: r.height / kx + 'px' } })); }
  }
  pv.hlEl = box; pv.el.insertBefore(box, pv.textEl);
};

// ---------- model ops ----------
Pdf.snap = () => JSON.stringify({ pages: Pdf.pages, cur: Pdf.cur, formsDirty: 0 });
Pdf.restore = async (s) => { const o = JSON.parse(s); Pdf.pages = o.pages; Pdf.selected = new Set([clamp(o.cur, 0, Pdf.pages.length - 1)]); P.selId = null; P.selPage = null; Pdf.rebuild(); Pdf.goto(clamp(o.cur, 0, Pdf.pages.length - 1)); await Pdf.measure(0, Pdf.pages.length); P.onStructure && P.onStructure(); P.onAnnChange && P.onAnnChange(); };
Pdf.structure = () => { Pdf.rebuild(); P.pushHistory(); P.onStructure && P.onStructure(); P.onAnnChange && P.onAnnChange(); };
Pdf.rotate = (idxs, delta) => { idxs.forEach((i) => { const d = Pdf.pages[i]; d.rot = (((d.rot + delta) % 360) + 360) % 360; }); Pdf.relayout(); Pdf.rerenderAll(); P.pushHistory(); P.onStructure && P.onStructure(); };
Pdf.deletePages = (idxs) => { const set = new Set(idxs); if (set.size >= Pdf.pages.length) return false; Pdf.pages = Pdf.pages.filter((_, i) => !set.has(i)); Pdf.selected = new Set([Math.min(Pdf.pages.length - 1, Math.min(...idxs))]); Pdf.cur = clamp(Pdf.cur, 0, Pdf.pages.length - 1); P.selId = null; P.selPage = null; Pdf.structure(); return true; };
Pdf.movePages = (idxs, to) => { // `to` is an insertion index in the current list
  idxs = [...idxs].sort((a, b) => a - b); const moving = idxs.map((i) => Pdf.pages[i]); const before = idxs.filter((i) => i < to).length; const rest = Pdf.pages.filter((_, i) => !idxs.includes(i)); rest.splice(to - before, 0, ...moving); const same = rest.every((d, i) => d === Pdf.pages[i]); if (same) return; Pdf.pages = rest; const first = to - before; Pdf.selected = new Set(moving.map((_, k) => first + k)); Pdf.structure(); Pdf.goto(first);
};
Pdf.insertDescs = (at, descs) => { Pdf.pages.splice(at, 0, ...descs); Pdf.selected = new Set(descs.map((_, k) => at + k)); Pdf.structure(); Pdf.measure(0, Pdf.pages.length).then(() => Pdf.relayout()); Pdf.goto(at); };
Pdf.addBlank = (at) => { const ref = Pdf.pages[Math.max(0, Math.min(Pdf.pages.length - 1, at - 1))] || Pdf.pages[0]; const v = Pdf.vpFor(ref, 1); const vb = ref.crop || ref.vb || [0, 0, 612, 792]; const w = (((ref.pr + ref.rot) % 180) === 90) ? v.height : v.width, h = (((ref.pr + ref.rot) % 180) === 90) ? v.width : v.height; Pdf.insertDescs(at, [{ id: uid(), src: -1, idx: 0, blank: true, rot: 0, crop: null, anns: [], vb: [0, 0, w, h], pr: 0, uu: 1 }]); };
Pdf.addSourcePages = async (bytes, name, at) => {
  const { doc } = await Pdf.openSource(bytes); const id = Pdf.sources.length; Pdf.sources.push({ id, bytes, doc, name, encrypted: false });
  const descs = Array.from({ length: doc.numPages }, (_, i) => ({ id: uid(), src: id, idx: i, rot: 0, crop: null, anns: [] })); Pdf.insertDescs(at, descs); return descs.length;
};
Pdf.allAnns = () => { const out = []; Pdf.pages.forEach((d, i) => d.anns.forEach((a) => out.push({ i, a }))); return out; };
Pdf.pendingRedactions = () => Pdf.allAnns().filter((x) => x.a.type === 'redact');
Pdf.visibleRendered = () => Pdf.pvs.filter((pv) => pv.canvas && pv.el.offsetParent);
