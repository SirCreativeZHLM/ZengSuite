/* PDF actions: insert/merge/extract/split/compress/export/redact/crop/info/attachments/print/presentation. */
'use strict';
const frow = (label, ctl) => el('.zk-field', el('label.zk-label', { style: { fontSize: '12px' } }, label), ctl);
const sep = zeng.platform === 'win' ? '\\' : '/';
const joinPath = (d, n) => d.replace(/[\\/]$/, '') + (zeng.platform === 'win' ? '\\' : '/') + n;
// pick an output folder; in the browser resolves to a pseudo-folder that downloads files
P.pickFolder = async () => { if (!zeng.isNative) return { web: true, name: '', path: null }; const r = await zeng.files.open({ folder: true }); return r[0] || null; };
P.writeInto = async (dir, name, data) => { if (dir.web) return zeng.files.write({ name }, data); return zeng.files.write({ path: joinPath(dir.path, name), name }, data); };
P.parseRanges = (text, n) => { // "1-3, 5, 8-" -> [[0,1,2],[4],[7..n-1]]
  const out = []; for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) { const m = part.match(/^(\d*)\s*-\s*(\d*)$/); let a, b; if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(part)) a = b = +part; else throw new Error(`“${part}” is not a page range.`); if (a < 1 || b > n || a > b) throw new Error(`Range “${part}” is outside 1–${n}.`); out.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i)); }
  if (!out.length) throw new Error('Enter at least one page or range, like 1-3, 5.'); return out;
};
const docBase = () => baseName(P.doc.file ? P.doc.file.name : P.doc.untitled || 'Document');

// ---------- images as PDF pages ----------
P.imageToPdfBytes = async (buf, name) => {
  const L = PDFLib; const ext = extOf(name); const out = await L.PDFDocument.create(); let img, w, h;
  const bytes = new Uint8Array(buf);
  if ((ext === 'jpg' || ext === 'jpeg') && (!P.exif || (P.exif.orientation(bytes) || 1) === 1)) { img = await out.embedJpg(bytes); w = img.width; h = img.height; }
  else if (ext === 'png' && !P.isApng) { try { img = await out.embedPng(bytes); w = img.width; h = img.height; } catch {} }
  if (!img) { const bmp = await createImageBitmap(new Blob([bytes], { type: P.mimeFor ? P.mimeFor(ext) : '' })); const c = mkCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); w = bmp.width; h = bmp.height; bmp.close && bmp.close(); const png = await canvasBlob(c, 'image/png'); img = await out.embedPng(new Uint8Array(await png.arrayBuffer())); freeCanvas(c); }
  let pw = w * 0.75, ph = h * 0.75; const k = Math.min(1, 1000 / Math.max(pw, ph)); pw *= k; ph *= k; const pg = out.addPage([pw, ph]); pg.drawImage(img, { x: 0, y: 0, width: pw, height: ph }); return await out.save();
};
const handleToPdfBytes = async (h) => { const buf = await zeng.files.read(h); return extOf(h.name) === 'pdf' ? new Uint8Array(buf) : await P.imageToPdfBytes(buf, h.name); };
Pdf.insertFiles = async (handles, at) => {
  let added = 0; const pg = P.progress('Inserting pages');
  try { for (const h of handles) { pg.set(h.name); const bytes = await handleToPdfBytes(h); const n = await Pdf.addSourcePages(bytes, h.name, at + added); added += n; } } catch (e) { if (!e.cancelled) zk.alert('Can’t insert “' + (handles[0] || {}).name + '”', e.message); } finally { pg.close(); }
  if (added) zk.toast(`Inserted ${added} page${added > 1 ? 's' : ''}`); return added;
};
Pdf.insertFromDialog = async (at) => { const hs = await zeng.files.open({ multiple: true, filters: [{ name: 'PDFs and images', exts: ALL_EXTS }] }); if (hs.length) await Pdf.insertFiles(hs, at ?? (Math.max(...Pdf.selected) + 1)); };
Pdf.mergeOfferFor = async (hs) => { // files dropped on an open PDF
  const r = await zk.sheet({ title: hs.length > 1 ? `Add ${hs.length} files?` : `Add “${hs[0].name}”?`, message: 'Insert the pages after the current page, or open the file instead of the current document.', buttons: [{ label: 'Cancel', value: null }, { label: 'Open Instead', value: 'open' }, { label: 'Insert Pages', primary: true, value: 'insert' }] });
  if (r === 'insert') await Pdf.insertFiles(hs, Pdf.cur + 1); else if (r === 'open') P.doc.openHandle(hs[0]);
};

// ---------- extract / split ----------
Pdf.extract = async (idxs) => {
  idxs = [...idxs].sort((a, b) => a - b); const pg = P.progress('Extracting pages');
  try { const bytes = await Pdf.build({ pagesIdx: idxs, objectStreams: true }); pg.close(); const h = await zeng.files.saveAs(bytes, { name: docBase() + ` – pages ${idxs[0] + 1}${idxs.length > 1 ? '-' + (idxs[idxs.length - 1] + 1) : ''}.pdf`, filters: [{ name: 'PDF', exts: ['pdf'] }] }); h && zk.toast('Saved ' + h.name); } catch (e) { pg.close(); zk.alert('Couldn’t extract pages', e.code === 'ENCRYPTED' ? 'This PDF is password protected and can’t be rewritten.' : e.message); }
};
Pdf.splitSheet = async () => {
  const n = Pdf.pages.length; const input = el('input.zk-input.selectable', { value: `1-${Math.ceil(n / 2)}, ${Math.ceil(n / 2) + 1}-${n}`, style: { width: '100%', height: '30px' }, placeholder: 'e.g. 1-3, 5, 8-' });
  const one = el('input.zk-radio', { type: 'radio', name: 'sp', checked: true }), all = el('input.zk-radio', { type: 'radio', name: 'sp' });
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, input, el('label.zk-row', { style: { gap: '8px', alignItems: 'center' } }, one, 'One file for each range'), el('label.zk-row', { style: { gap: '8px', alignItems: 'center' } }, all, 'One file with all listed pages'), el('p.zk-label', `The document has ${n} pages. Files are written to a folder you choose.`));
  const r = await zk.sheet({ title: 'Split PDF by Range', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Split…', primary: true, value: true, onClick: () => { try { P.parseRanges(input.value, n); } catch (e) { zk.toast(e.message, 2600); return false; } } }] });
  if (!r) return; const ranges = P.parseRanges(input.value, n); const dir = await P.pickFolder(); if (!dir) return;
  const pg = P.progress('Splitting'); try {
    const groups = one.checked ? ranges : [ranges.flat()]; let k = 0;
    for (const g of groups) { pg.set(`File ${k + 1} of ${groups.length}`, k / groups.length); const bytes = await Pdf.build({ pagesIdx: g, objectStreams: true }); const label = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`; await P.writeInto(dir, `${docBase()} – ${one.checked ? label : 'selection'}.pdf`, bytes); k++; }
    pg.close(); zk.toast(`Wrote ${groups.length} file${groups.length > 1 ? 's' : ''}`);
  } catch (e) { pg.close(); zk.alert('Couldn’t split', e.code === 'ENCRYPTED' ? 'This PDF is password protected and can’t be rewritten.' : e.message); }
};

// ---------- compress ----------
Pdf.recompressImages = async (bytes, { quality = 0.6, maxDim = 1800, onProgress } = {}) => {
  const L = PDFLib; const doc = await L.PDFDocument.load(bytes, { updateMetadata: false }); const objs = doc.context.enumerateIndirectObjects(); let n = 0, changed = 0, i = 0;
  const N = (s) => L.PDFName.of(s);
  for (const [ref, obj] of objs) {
    if (!(obj instanceof L.PDFRawStream)) continue; const d = obj.dict; if (d.get(N('Subtype')) !== N('Image')) continue; const filter = d.get(N('Filter')); if (filter !== N('DCTDecode')) continue; if (d.get(N('ImageMask')) || d.get(N('Decode'))) continue;
    const cs = d.get(N('ColorSpace')); if (cs !== N('DeviceRGB') && cs !== N('DeviceGray')) continue; n++;
    try { const old = obj.contents; const bmp = await createImageBitmap(new Blob([old], { type: 'image/jpeg' }), { imageOrientation: 'none' }); const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height)); const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k)); const c = mkCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close(); const blob = await canvasBlob(c, 'image/jpeg', quality); freeCanvas(c);
      if (blob.size < old.length * 0.92) { obj.contents = new Uint8Array(await blob.arrayBuffer()); d.set(N('Width'), L.PDFNumber.of(w)); d.set(N('Height'), L.PDFNumber.of(h)); d.set(N('ColorSpace'), N('DeviceRGB')); d.set(N('BitsPerComponent'), L.PDFNumber.of(8)); d.set(N('Length'), L.PDFNumber.of(obj.contents.length)); d.delete(N('DecodeParms')); changed++; } } catch (e) { console.warn('recompress skip', e.message); }
    if (++i % 4 === 0) { onProgress && onProgress(n, changed); await sleep(0); }
  }
  return { bytes: await doc.save({ useObjectStreams: true }), found: n, changed };
};
Pdf.compressSheet = async () => {
  const q = el('input.zk-range', { type: 'range', min: 30, max: 90, value: 60 }), qv = el('span.zk-label', '60%'); q.oninput = () => (qv.textContent = q.value + '%');
  const m1 = el('input.zk-radio', { type: 'radio', name: 'cm', checked: true }), m2 = el('input.zk-radio', { type: 'radio', name: 'cm' });
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    el('label.zk-row', { style: { gap: '8px' } }, m1, el('div', el('div', 'Reduce image quality'), el('div.zk-label', 'Recompresses embedded JPEG images and downsizes very large ones. Text stays selectable.'))),
    el('label.zk-row', { style: { gap: '8px' } }, m2, el('div', el('div', 'Flatten pages to pictures'), el('div.zk-label', 'Re-renders every page as an image. Smallest for scans, but text is no longer selectable.'))),
    frow('JPEG quality', el('div.zk-row', { style: { gap: '8px', alignItems: 'center', width: '200px' } }, q, qv)));
  if (!(await zk.sheet({ title: 'Compress PDF', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Compress…', primary: true, value: true }] }))) return;
  const pg = P.progress('Compressing'); try {
    const base = await Pdf.build({ objectStreams: true }); let out, msg;
    if (m1.checked) { const r = await Pdf.recompressImages(base, { quality: q.value / 100, maxDim: 1800, onProgress: (n, c) => pg.set(`Recompressed ${c} of ${n} images`) }); out = r.bytes; msg = `${r.changed} of ${r.found} images recompressed`; }
    else { out = await Pdf.rasterBuild({ dpi: 110, quality: q.value / 100, progress: (f, t) => pg.set(t, f) }); msg = 'Pages flattened'; }
    pg.close(); const before = base.length; const keep = out.length < before ? out : base;
    const h = await zeng.files.saveAs(keep, { name: docBase() + ' – compressed.pdf', filters: [{ name: 'PDF', exts: ['pdf'] }] }); if (h) zk.alert('Compressed', `${msg}. ${fmtBytes(before)} → ${fmtBytes(keep.length)}${out.length >= before ? ' (no smaller than the original, so the original content was kept)' : ''}.`);
  } catch (e) { pg.close(); zk.alert('Couldn’t compress', e.code === 'ENCRYPTED' ? 'This PDF is password protected and can’t be rewritten.' : e.message); }
};

// ---------- export pages as images ----------
Pdf.exportImagesSheet = async () => {
  const n = Pdf.pages.length; const fmt = el('select.zk-select', el('option', { value: 'png' }, 'PNG'), el('option', { value: 'jpeg' }, 'JPEG')); const dpi = el('select.zk-select', ...[72, 110, 150, 200, 300].map((d) => el('option', { value: d, selected: d === 150 }, d + ' dpi')));
  const rng = el('input.zk-input.selectable', { value: `1-${n}`, style: { width: '140px' } }); const ann = el('input.zk-check', { type: 'checkbox', checked: true });
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, frow('Format', fmt), frow('Resolution', dpi), frow('Pages', rng), frow('Include markup', ann));
  const r = await zk.sheet({ title: 'Export Pages as Images', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Export…', primary: true, value: true, onClick: () => { try { P.parseRanges(rng.value, n); } catch (e) { zk.toast(e.message, 2600); return false; } } }] }); if (!r) return;
  const pages = P.parseRanges(rng.value, n).flat(); const dir = await P.pickFolder(); if (!dir) return; const pg = P.progress('Exporting'); const ext = fmt.value === 'png' ? 'png' : 'jpg';
  try { for (let k = 0; k < pages.length; k++) { pg.set(`Page ${pages[k] + 1} (${k + 1} of ${pages.length})`, k / pages.length); const c = await Pdf.renderToCanvas(pages[k], +dpi.value / 72, { annots: ann.checked }); const b = await canvasBlob(c, fmt.value === 'png' ? 'image/png' : 'image/jpeg', 0.92); freeCanvas(c); await P.writeInto(dir, `${docBase()}-p${String(pages[k] + 1).padStart(String(n).length, '0')}.${ext}`, b); } pg.close(); zk.toast(`Exported ${pages.length} image${pages.length > 1 ? 's' : ''}`); } catch (e) { pg.close(); zk.alert('Couldn’t export', e.message); }
};

// ---------- redaction ----------
Pdf.applyRedactions = async (confirm = true) => {
  const pend = Pdf.pendingRedactions(); if (!pend.length) { zk.toast('No redactions to apply'); return true; }
  const pagesWith = [...new Set(pend.map((x) => x.i))];
  if (confirm && !(await zk.confirm(`Permanently redact ${pend.length} area${pend.length > 1 ? 's' : ''} on ${pagesWith.length} page${pagesWith.length > 1 ? 's' : ''}?`, 'Each affected page is re-rendered as a flat picture with the marked areas painted solid black. Everything on those pages becomes image-only: all text, search, links and form fields on them are gone for good, not just the covered text. You can undo until you save.', 'Redact Permanently', { danger: true }))) return false;
  const pg = P.progress('Redacting'); const L = PDFLib;
  try {
    for (let k = 0; k < pagesWith.length; k++) {
      const di = pagesWith[k]; pg.set(`Page ${di + 1}`, k / pagesWith.length); const d = Pdf.pages[di]; const v1 = Pdf.vpFor(d, 1); const W = v1.width, Hh = v1.height; const scale = Math.min(200 / 72, Math.sqrt(40e6 / (W * Hh)));
      const c = await Pdf.renderToCanvas(di, scale, { annots: false }); const ctx = c.getContext('2d'); ctx.fillStyle = '#000';
      for (const a of d.anns.filter((x) => x.type === 'redact')) { const [p, q] = a.pts.map((pt) => v1.convertToViewportPoint(...pt)); ctx.fillRect(Math.min(p[0], q[0]) * scale, Math.min(p[1], q[1]) * scale, Math.abs(p[0] - q[0]) * scale, Math.abs(p[1] - q[1]) * scale); }
      const blob = await canvasBlob(c, 'image/jpeg', 0.9); freeCanvas(c); const out = await L.PDFDocument.create(); const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer())); out.addPage([W, Hh]).drawImage(img, { x: 0, y: 0, width: W, height: Hh });
      const bytes = await out.save(); const { doc } = await Pdf.openSource(bytes); const sid = Pdf.sources.length; Pdf.sources.push({ id: sid, bytes, doc, name: 'redacted' });
      const map = (pt) => { const [vx, vy] = v1.convertToViewportPoint(pt[0], pt[1]); return [vx, Hh - vy]; };
      const keep = d.anns.filter((x) => x.type !== 'redact').map((a) => { const b = clone(a); Ann.mapPoints(b, map); if (b.ang !== undefined) b.ang = (((b.ang + v1.rotation) % 360) + 360) % 360; return b; });
      Pdf.pages[di] = { id: d.id, src: sid, idx: 0, rot: 0, crop: null, anns: keep, vb: [0, 0, W, Hh], pr: 0, uu: 1 };
    }
    pg.close(); Pdf.structure(); zk.toast('Redactions applied'); return true;
  } catch (e) { pg.close(); console.error(e); zk.alert('Couldn’t apply redactions', e.message); return false; }
};

// ---------- crop ----------
P.Cropper = class {
  constructor(host, { rect, ratio = null, onChange, scale = null }) {
    this.scale = scale; this.host = host; this.ratio = ratio; this.onChange = onChange; this.r = { ...rect };
    this.box = el('.cropbox'); this.root = el('.cropper', this.box); ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((h) => { const e = el('.ch.' + h, { 'data-h': h }); this.box.append(e); });
    this.box.append(el('.grid')); host.append(this.root); this.root.addEventListener('pointerdown', (e) => this.down(e)); this.paint();
  }
  bounds() { return { w: this.host.clientWidth, h: this.host.clientHeight }; }
  paint() { const r = this.r; Object.assign(this.box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); this.onChange && this.onChange(r); }
  setRatio(ratio) { this.ratio = ratio; if (ratio) { const r = this.r; const cx = r.x + r.w / 2, cy = r.y + r.h / 2; let w = r.w, h = w / ratio; const B = this.bounds(); if (h > B.h) { h = B.h; w = h * ratio; } if (w > B.w) { w = B.w; h = w / ratio; } this.r = { x: clamp(cx - w / 2, 0, B.w - w), y: clamp(cy - h / 2, 0, B.h - h), w, h }; this.paint(); } }
  down(e) {
    const hnd = e.target.dataset.h; const B = this.bounds(); const start = { x: e.clientX, y: e.clientY }; const r0 = { ...this.r }; const move = !hnd && e.target.closest('.cropbox'); if (!hnd && !move) return; e.preventDefault();
    const k = this.scale ? this.scale() : 1; const mv = (ev) => { const dx = (ev.clientX - start.x) / k, dy = (ev.clientY - start.y) / k; let { x, y, w, h } = r0;
      if (move) { x = clamp(x + dx, 0, B.w - w); y = clamp(y + dy, 0, B.h - h); }
      else { let x0 = x, y0 = y, x1 = x + w, y1 = y + h; if (hnd.includes('w')) x0 = clamp(x + dx, 0, x1 - 20); if (hnd.includes('e')) x1 = clamp(x + w + dx, x0 + 20, B.w); if (hnd.includes('n')) y0 = clamp(y + dy, 0, y1 - 20); if (hnd.includes('s')) y1 = clamp(y + h + dy, y0 + 20, B.h);
        if (this.ratio) { let nw = x1 - x0, nh = y1 - y0; if (hnd === 'n' || hnd === 's') nw = nh * this.ratio; else nh = nw / this.ratio; if (hnd.includes('w')) x0 = x1 - nw; else x1 = x0 + nw; if (hnd.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; if (hnd === 'n' || hnd === 's') { x0 = r0.x + (r0.w - nw) / 2; x1 = x0 + nw; } if (hnd === 'e' || hnd === 'w') { y0 = r0.y + (r0.h - nh) / 2; y1 = y0 + nh; } if (x0 < 0 || y0 < 0 || x1 > B.w || y1 > B.h) return; }
        x = x0; y = y0; w = x1 - x0; h = y1 - y0; }
      this.r = { x, y, w, h }; this.paint(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  destroy() { this.root.remove(); }
};
Pdf.cropState = null;
Pdf.startCrop = () => {
  if (Pdf.cropState) return Pdf.endCrop(); const pv = Pdf.pvs[Pdf.cur]; if (!pv || !pv.vp) return; Ann.setTool('select');
  pv.el.scrollIntoView({ block: 'nearest' }); const W = pv.vp.w, Hh = pv.vp.h; const cr = new P.Cropper(pv.el, { rect: { x: W * 0.08, y: Hh * 0.08, w: W * 0.84, h: Hh * 0.84 } });
  const bar = el('.zk-toolbar.cropbar', { style: { position: 'absolute', zIndex: 30, bottom: '16px', left: '50%', transform: 'translateX(-50%)', borderRadius: '12px', boxShadow: 'var(--shadow-2)', border: 'none', minHeight: '44px', width: 'max-content', maxWidth: '96%', flexWrap: 'wrap' } },
    el('span.zk-label', 'Drag to choose the visible area'), zk.btn({ label: 'This Page', cls: 'bordered', onClick: () => Pdf.applyCrop(cr, pv, false) }), zk.btn({ label: 'All Pages', cls: 'bordered', onClick: () => Pdf.applyCrop(cr, pv, true) }), zk.btn({ label: 'Reset Crop', cls: 'bordered', onClick: () => Pdf.resetCrop(pv) }), zk.btn({ label: 'Done', cls: 'primary', onClick: () => Pdf.endCrop() }));
  $('#stage').append(bar); Pdf.cropState = { cr, bar, pv };
};
Pdf.endCrop = () => { if (!Pdf.cropState) return; Pdf.cropState.cr.destroy(); Pdf.cropState.bar.remove(); Pdf.cropState = null; };
Pdf.applyCrop = (cr, pv, all) => {
  const W = pv.vp.w, Hh = pv.vp.h, r = cr.r; const f = { x0: r.x / W, y0: r.y / Hh, x1: (r.x + r.w) / W, y1: (r.y + r.h) / Hh };
  const targets = all ? Pdf.pages.map((_, i) => i) : [pv.i];
  for (const i of targets) { const d = Pdf.pages[i]; const v = Pdf.vpFor(d, 1); const a = v.convertToPdfPoint(f.x0 * v.width, f.y0 * v.height), b = v.convertToPdfPoint(f.x1 * v.width, f.y1 * v.height); d.crop = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map((x) => +x.toFixed(2)); }
  Pdf.endCrop(); Pdf.relayout(); Pdf.rerenderAll(); P.pushHistory(); P.onStructure && P.onStructure(); zk.toast(all ? 'Cropped all pages' : 'Page cropped');
};
Pdf.resetCrop = (pv) => { const idxs = pv ? [pv.i] : Pdf.pages.map((_, i) => i); idxs.forEach((i) => (Pdf.pages[i].crop = null)); Pdf.endCrop(); Pdf.relayout(); Pdf.rerenderAll(); P.pushHistory(); P.onStructure && P.onStructure(); };

// ---------- info / attachments ----------
Pdf.infoSheet = async () => {
  const src = Pdf.sources[0]; const m = await src.doc.getMetadata().catch(() => ({ info: {} })); const info = m.info || {}; const edit = Pdf.infoEdit || {};
  const f = (k, label) => el('input.zk-input.selectable', { value: k in edit ? edit[k] : info[{ title: 'Title', author: 'Author', subject: 'Subject', keywords: 'Keywords' }[k]] || '', style: { width: '260px' }, 'data-k': k });
  const ro = (a, b) => el('.zk-field', el('span.zk-label', a), el('span.selectable', { style: { fontSize: '12px', textAlign: 'right', maxWidth: '260px', overflowWrap: 'anywhere' } }, b || '—'));
  const d0 = Pdf.pages[Pdf.cur]; const v = Pdf.vpFor(d0, 1); const mm = (p) => Math.round((p / 72) * 25.4);
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, frow('Title', f('title')), frow('Author', f('author')), frow('Subject', f('subject')), frow('Keywords', f('keywords')), el('.zk-msep'),
    ro('Pages', String(Pdf.pages.length)), ro('Page size', `${Math.round(v.width)} × ${Math.round(v.height)} pt (${mm(v.width)} × ${mm(v.height)} mm)`), ro('PDF version', info.PDFFormatVersion), ro('Created by', info.Creator), ro('Producer', info.Producer), ro('Encrypted', src.encrypted ? 'Yes' : 'No'), ro('File size', fmtBytes(src.bytes.length)));
  const r = await zk.sheet({ title: 'Document Info', body, width: 460, buttons: [{ label: 'Cancel', value: false }, { label: 'Done', primary: true, value: true }] }); if (!r) return;
  const ne = { ...edit }; let ch = false; $$('input[data-k]', body).forEach((i) => { const k = i.dataset.k; const old = k in edit ? edit[k] : info[{ title: 'Title', author: 'Author', subject: 'Subject', keywords: 'Keywords' }[k]] || ''; if (i.value !== old) { ne[k] = i.value; ch = true; } }); if (ch) { Pdf.infoEdit = ne; P.doc.markDirty(); }
};
Pdf.attachments = async () => { try { return Object.values((await Pdf.sources[0].doc.getAttachments()) || {}); } catch { return []; } };
Pdf.saveAttachment = async (a) => { const h = await zeng.files.saveAs(a.content, { name: a.filename }); h && zk.toast('Saved ' + h.name); };

// ---------- print ----------
Pdf.print = async () => {
  const root = $('#printroot'); root.replaceChildren(); const n = Pdf.pages.length; const pg = P.progress('Preparing to print'); const urls = [];
  try { for (let i = 0; i < n; i++) { pg.set(`Page ${i + 1} of ${n}`, i / n); const v1 = Pdf.vpFor(Pdf.pages[i], 1); const c = await Pdf.renderToCanvas(i, Math.min(150 / 72, Math.sqrt(24e6 / (v1.width * v1.height)))); const b = await canvasBlob(c, 'image/jpeg', 0.9); freeCanvas(c); const u = URL.createObjectURL(b); urls.push(u); root.append(el('img.pp', { src: u, style: { aspectRatio: `${v1.width} / ${v1.height}` } })); } } finally { pg.close(); }
  await sleep(150); zeng.print(); const clean = () => { root.replaceChildren(); urls.forEach((u) => URL.revokeObjectURL(u)); removeEventListener('afterprint', clean); }; addEventListener('afterprint', clean); setTimeout(clean, 10 * 60 * 1000);
};

// ---------- presentation ----------
Pdf.present = async (start = Pdf.cur) => {
  let i = start; const wrap = el('.present', el('canvas'), el('.pcount')); document.body.append(wrap); await zeng.fullscreen(true); const cv = wrap.firstChild; let tok = 0;
  const show = async () => { const t = ++tok; i = clamp(i, 0, Pdf.pages.length - 1); const W = innerWidth, H = innerHeight; const v1 = Pdf.vpFor(Pdf.pages[i], 1); const s = Math.min(W / v1.width, H / v1.height); const dpr = devicePixelRatio || 1; const c = await Pdf.renderToCanvas(i, s * dpr, { annots: true }); if (t !== tok) return freeCanvas(c); cv.width = c.width; cv.height = c.height; cv.style.width = c.width / dpr + 'px'; cv.style.height = c.height / dpr + 'px'; cv.getContext('2d').drawImage(c, 0, 0); freeCanvas(c); wrap.lastChild.textContent = `${i + 1} / ${Pdf.pages.length}`; wrap.lastChild.classList.add('show'); clearTimeout(show.t); show.t = setTimeout(() => wrap.lastChild.classList.remove('show'), 1200); };
  const key = (e) => { const k = e.key; if (k === 'Escape') { e.preventDefault(); end(); } else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); i++; show(); } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); i--; show(); } else if (k === 'Home') { i = 0; show(); } else if (k === 'End') { i = 1e9; show(); } e.stopPropagation(); };
  const end = async () => { removeEventListener('keydown', key, true); removeEventListener('resize', show); wrap.remove(); await zeng.fullscreen(false); Pdf.goto(i); };
  addEventListener('keydown', key, true); addEventListener('resize', show); wrap.addEventListener('click', (e) => { i += e.clientX < innerWidth / 3 ? -1 : 1; show(); }); wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); end(); }); show();
};
