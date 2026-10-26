/* PDF writing with pdf-lib: real annotations (with appearance streams) or flattened content, structure edits,
   forms, own-annotation restore, page rasterising. */
'use strict';
const PL = () => window.PDFLib;
const nf = (x) => +(+x).toFixed(3);
const bboxOfPts = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const inflate = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const refsIn = (ctx, obj, seen, skip) => { // collect indirect refs reachable from obj
  const L = PL(); if (obj instanceof L.PDFRef) { if (seen.has(obj)) return; seen.add(obj); refsIn(ctx, ctx.lookup(obj), seen, skip); return; }
  if (obj instanceof L.PDFDict) { for (const [k, v] of obj.entries()) if (!skip.has(k.asString())) refsIn(ctx, v, seen, skip); } else if (obj instanceof L.PDFArray) { for (let i = 0; i < obj.size(); i++) refsIn(ctx, obj.get(i), seen, skip); } else if (obj && obj.dict instanceof L.PDFDict) refsIn(ctx, obj.dict, seen, skip);
};

// ---------- reading our own annotations back ----------
Pdf.pullOwnAnnotations = async (bytes) => {
  const L = PL(); const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: false });
  const ctx = doc.context; const byPage = []; let any = false; const ZD = L.PDFName.of('ZengData');
  doc.getPages().forEach((page, pi) => {
    const arr = page.node.Annots(); const mine = []; if (!arr) { byPage[pi] = []; return; }
    const keep = [];
    for (let i = 0; i < arr.size(); i++) { const ref = arr.get(i); const d = ctx.lookupMaybe(ref, L.PDFDict); const z = d && d.get(ZD); if (z && z.decodeText) { try { const a = JSON.parse(z.decodeText()); mine.push(a); const seen = new Set(); refsIn(ctx, d, seen, new Set(['P', 'Popup', 'Parent'])); seen.forEach((r) => ctx.delete(r)); ctx.delete(ref); continue; } catch (e) { console.warn('bad ZengData', e); } } keep.push(ref); }
    if (mine.length) { any = true; page.node.set(L.PDFName.of('Annots'), ctx.obj(keep)); }
    byPage[pi] = mine;
  });
  if (!any) return null;
  return { byPage, clean: await doc.save({ useObjectStreams: false }) };
};

// ---------- forms ----------
const applyForms = async (base) => {
  const src = Pdf.sources[0]; const st = src.doc.annotationStorage; const ser = st.serializable; const map = ser && (ser.map || ser); if (!map || !map.size) return;
  const L = PL(); let form; try { form = base.getForm(); } catch { return; } const byId = new Map();
  for (let i = 0; i < src.doc.numPages; i++) { const pg = await src.doc.getPage(i + 1); (await pg.getAnnotations({ intent: 'display' })).forEach((a) => a.fieldType && byId.set(a.id, a)); }
  for (const [id, v] of map) {
    const a = byId.get(id); if (!a || !a.fieldName) continue; const val = v.value;
    try {
      if (a.fieldType === 'Tx') form.getTextField(a.fieldName).setText(val == null ? '' : String(val));
      else if (a.fieldType === 'Btn' && a.checkBox) { const c = form.getCheckBox(a.fieldName); val ? c.check() : c.uncheck(); }
      else if (a.fieldType === 'Btn' && a.radioButton) { if (val) form.getRadioGroup(a.fieldName).select(a.buttonValue || a.exportValue); }
      else if (a.fieldType === 'Ch') { const f = form.getField(a.fieldName); const sel = Array.isArray(val) ? val : [val]; if (f.select) f.select(sel.filter((x) => x != null && x !== '')); }
    } catch (e) { console.warn('form field', a.fieldName, e.message); }
  }
  try { form.updateFieldAppearances(await base.embedFont(L.StandardFonts.Helvetica)); } catch (e) { try { base.catalog.lookup(L.PDFName.of('AcroForm'), L.PDFDict).set(L.PDFName.of('NeedAppearances'), L.PDFBool.True); } catch {} }
};

// ---------- appearance streams ----------
const bez = (pts) => { // smooth path (matches Ann.smoothPath) as PDF path operators
  if (pts.length === 1) return `${nf(pts[0][0])} ${nf(pts[0][1])} m ${nf(pts[0][0] + 0.01)} ${nf(pts[0][1])} l\n`;
  let s = `${nf(pts[0][0])} ${nf(pts[0][1])} m\n`; let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) { const c = pts[i], m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; s += `${nf(cur[0] + (2 / 3) * (c[0] - cur[0]))} ${nf(cur[1] + (2 / 3) * (c[1] - cur[1]))} ${nf(m[0] + (2 / 3) * (c[0] - m[0]))} ${nf(m[1] + (2 / 3) * (c[1] - m[1]))} ${nf(m[0])} ${nf(m[1])} c\n`; cur = m; }
  const l = pts[pts.length - 1]; return s + `${nf(l[0])} ${nf(l[1])} l\n`;
};
const ellipsePath = (x0, y0, x1, y1) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, k = 0.5523; return `${nf(cx + rx)} ${nf(cy)} m ${nf(cx + rx)} ${nf(cy + k * ry)} ${nf(cx + k * rx)} ${nf(cy + ry)} ${nf(cx)} ${nf(cy + ry)} c ${nf(cx - k * rx)} ${nf(cy + ry)} ${nf(cx - rx)} ${nf(cy + k * ry)} ${nf(cx - rx)} ${nf(cy)} c ${nf(cx - rx)} ${nf(cy - k * ry)} ${nf(cx - k * rx)} ${nf(cy - ry)} ${nf(cx)} ${nf(cy - ry)} c ${nf(cx + k * rx)} ${nf(cy - ry)} ${nf(cx + rx)} ${nf(cy - k * ry)} ${nf(cx + rx)} ${nf(cy)} c h\n`; };
const rgbOps = (hex, stroke) => rgb01(hex).join(' ') + (stroke ? ' RG\n' : ' rg\n');
const orientedMatrix = (a) => { const th = (-(a.ang || 0) * Math.PI) / 180; const c = Math.cos(th), s = Math.sin(th); const cx = a.pts[0][0], cy = a.pts[0][1]; return [nf(c), nf(s), nf(-s), nf(c), nf(cx - (c * a.w / 2 - s * a.h / 2)), nf(cy - (s * a.w / 2 + c * a.h / 2))]; };
const orientedRect = (a) => { const bb = Ann.bbox(a); return [bb.x0, bb.y0, bb.x1, bb.y1]; };
const WINANSI_FONT = { sans: 'Helvetica', serif: 'TimesRoman', mono: 'Courier' };

// returns {subtype, rect, ap:formRef, extra:{...}} for annotation a; doc = pdf-lib doc
const buildAP = async (doc, a, cache) => {
  const L = PL(), ctx = doc.context; const form = (bbox, content, res = {}, matrix) => { const d = { Type: 'XObject', Subtype: 'Form', BBox: bbox.map(nf), Resources: res }; if (matrix) d.Matrix = matrix; return ctx.register(ctx.flateStream(content, d)); };
  const op = a.opacity ?? 1; const gs = (extra = {}) => ({ ExtGState: { GS: { Type: 'ExtGState', CA: op, ca: op, ...extra } } });
  switch (a.type) {
    case 'highlight': { const all = a.quads.flat(); const bb = bboxOfPts(all); let c = '/GS gs\n' + rgbOps(a.color); a.quads.forEach((q) => { c += `${nf(q[0][0])} ${nf(q[0][1])} m ${nf(q[1][0])} ${nf(q[1][1])} l ${nf(q[3][0])} ${nf(q[3][1])} l ${nf(q[2][0])} ${nf(q[2][1])} l h f\n`; });
      return { subtype: 'Highlight', rect: bb, ap: form(bb, c, gs({ BM: 'Multiply', ca: op * 0.55, CA: op * 0.55 })), extra: { QuadPoints: a.quads.flat().flat().map(nf) } }; }
    case 'underline': case 'strike': { const bb = bboxOfPts(a.quads.flat()); let c = '/GS gs\n' + rgbOps(a.color, true) + '1 J\n';
      a.quads.forEach((q) => { const h = Math.hypot(q[0][0] - q[2][0], q[0][1] - q[2][1]); const up = [(q[0][0] - q[2][0]) / (h || 1), (q[0][1] - q[2][1]) / (h || 1)]; c += `${nf(Math.max(0.6, h * 0.09))} w\n`; let p1, p2; if (a.type === 'underline') { p1 = [q[2][0] + up[0] * h * 0.07, q[2][1] + up[1] * h * 0.07]; p2 = [q[3][0] + up[0] * h * 0.07, q[3][1] + up[1] * h * 0.07]; } else { p1 = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]; p2 = [(q[1][0] + q[3][0]) / 2, (q[1][1] + q[3][1]) / 2]; } c += `${nf(p1[0])} ${nf(p1[1])} m ${nf(p2[0])} ${nf(p2[1])} l S\n`; });
      const r = inflate(bb, 2); return { subtype: a.type === 'underline' ? 'Underline' : 'StrikeOut', rect: r, ap: form(r, c, gs()), extra: { QuadPoints: a.quads.flat().flat().map(nf) } }; }
    case 'rect': case 'ellipse': case 'redact': case 'erase': { const n = Ann.norm(a); const w = a.type === 'rect' || a.type === 'ellipse' ? a.width : 0; const r = inflate([n.x0, n.y0, n.x1, n.y1], w / 2); let c = '/GS gs\n';
      const fill = a.type === 'redact' ? '#000000' : a.type === 'erase' ? '#ffffff' : a.fill; if (fill) c += rgbOps(fill); if (w) c += rgbOps(a.color, true) + `${nf(w)} w\n` + (a.dash ? `[${nf(w * 3)} ${nf(w * 2)}] 0 d\n` : '');
      c += a.type === 'ellipse' ? ellipsePath(n.x0, n.y0, n.x1, n.y1) : `${nf(n.x0)} ${nf(n.y0)} ${nf(n.x1 - n.x0)} ${nf(n.y1 - n.y0)} re\n`; c += fill && w ? 'B\n' : fill ? 'f\n' : w ? 'S\n' : 'n\n';
      const g = gs(fill && a.type !== 'redact' && a.type !== 'erase' ? { ca: op * (a.fillOpacity ?? 0.35) } : {}); const x = { BS: { W: w } }; if (fill) x.IC = rgb01(fill);
      return { subtype: a.type === 'ellipse' ? 'Circle' : 'Square', rect: r, ap: form(r, c, g), extra: x }; }
    case 'line': case 'arrow': { const [p, q] = a.pts; const w = a.width; let c = '/GS gs\n' + rgbOps(a.color, true) + rgbOps(a.color) + `${nf(w)} w 1 J 1 j\n` + (a.dash ? `[${nf(w * 3)} ${nf(w * 2)}] 0 d\n` : ''); let e = q; const pts = [p, q];
      if (a.type === 'arrow') { const hd = Ann.arrowHeadDoc(p, q, w); e = [(hd[1][0] + hd[2][0]) / 2, (hd[1][1] + hd[2][1]) / 2]; pts.push(...hd); }
      c += `${nf(p[0])} ${nf(p[1])} m ${nf(e[0])} ${nf(e[1])} l S\n`; if (a.type === 'arrow') { const hd = Ann.arrowHeadDoc(p, q, w); c += `[] 0 d ${nf(hd[0][0])} ${nf(hd[0][1])} m ${nf(hd[1][0])} ${nf(hd[1][1])} l ${nf(hd[2][0])} ${nf(hd[2][1])} l h B\n`; }
      const r = inflate(bboxOfPts(pts), w + 1); return { subtype: 'Line', rect: r, ap: form(r, c, gs()), extra: { L: [p[0], p[1], q[0], q[1]].map(nf), LE: ['None', a.type === 'arrow' ? 'ClosedArrow' : 'None'], BS: { W: w } } }; }
    case 'ink': { const st = a.strokes[0]; const r = inflate(bboxOfPts(st), a.width + 1); let c = '/GS gs\n' + rgbOps(a.color, true) + `${nf(a.width)} w 1 J 1 j\n` + bez(st) + 'S\n'; return { subtype: 'Ink', rect: r, ap: form(r, c, gs()), extra: { InkList: [st.flat().map(nf)], BS: { W: a.width } } }; }
    case 'note': { const [x, y] = a.pts[0]; const r = [x, y - 20, x + 20, y]; const c = rgbOps(a.color) + '0 0 20 20 re f\n0.25 0.25 0.25 RG 0.8 w 0.4 0.4 19.2 19.2 re S\n0.25 0.25 0.25 RG 1.2 w 4 14 m 16 14 l S 4 10 m 16 10 l S 4 6 m 12 6 l S\n'; return { subtype: 'Text', rect: r, ap: form([0, 0, 20, 20], c, {}, [1, 0, 0, 1, nf(r[0]), nf(r[1])]), extra: { Name: 'Comment', Open: false, F: 28 } }; }
    case 'text': {
      const w = a.w, h = a.h; const mat = orientedMatrix(a); const rect = orientedRect(a); const pad = Math.max(2, 3); let res = {}; let c = '';
      if (a.fill) c += rgbOps(a.fill) + `0 0 ${nf(w)} ${nf(h)} re f\n`; if (a.width) c += rgbOps(a.color, true) + `${nf(a.width)} w ${nf(a.width / 2)} ${nf(a.width / 2)} ${nf(w - a.width)} ${nf(h - a.width)} re S\n`;
      const fname = WINANSI_FONT[a.font || 'sans']; const font = await doc.embedFont(L.StandardFonts[fname]); let ok = true; try { font.encodeText(a.text || ''); } catch { ok = false; }
      if (ok) { const lines = Ann.wrap(a.text || '', w - pad * 2, (t) => font.widthOfTextAtSize(t, a.size)); res = { Font: { F1: font.ref } }; c += 'BT\n/F1 ' + nf(a.size) + ' Tf\n' + rgbOps(a.textColor || '#1d1d1f');
        lines.forEach((ln, i) => { const tw = ln ? font.widthOfTextAtSize(ln, a.size) : 0; let x = pad; if (a.align === 'center') x = (w - tw) / 2; else if (a.align === 'right') x = w - pad - tw; const y = h - pad - i * a.size * Ann.LH - a.size * 0.9465; c += `1 0 0 1 ${nf(x)} ${nf(y)} Tm ${ln ? font.encodeText(ln).toString() : '()'} Tj\n`; }); c += 'ET\n'; }
      else { const S = 3; const cv = mkCanvas(w * S, h * S); const cx = cv.getContext('2d'); Ann.paint(cx, { ...a, pts: [[w * S / 2, h * S / 2]], ang: 0, fill: null, width: 0, opacity: 1 }, (x, y) => [x, y], S, 0); const png = await doc.embedPng(dataUrlToBytes(cv.toDataURL('image/png'))); res = { XObject: { Im0: png.ref } }; c += `q ${nf(w)} 0 0 ${nf(h)} 0 0 cm /Im0 Do Q\n`; }
      const da = `/Helv ${nf(a.size)} Tf ${rgb01(a.textColor || '#1d1d1f').join(' ')} rg`;
      return { subtype: 'FreeText', rect, ap: form([0, 0, w, h], c, res, mat), extra: { DA: L.PDFString.of(da), Q: { left: 0, center: 1, right: 2 }[a.align || 'left'] || 0, Contents: L.PDFHexString.fromText(a.text || '') } }; }
    case 'sig': { const w = a.w, h = a.h; let img = cache.get(a.img); if (!img) { img = await doc.embedPng(dataUrlToBytes(a.img)); cache.set(a.img, img); } const c = `q ${nf(w)} 0 0 ${nf(h)} 0 0 cm /Im0 Do Q\n`; return { subtype: 'Stamp', rect: orientedRect(a), ap: form([0, 0, w, h], c, { XObject: { Im0: img.ref } }, orientedMatrix(a)), extra: { Name: 'ZengSignature', Contents: L.PDFHexString.fromText('Signature') } }; }
  }
  return null;
};
const addAnnotation = async (doc, page, a, flatten, cache, k) => {
  const L = PL(), ctx = doc.context; const r = await buildAP(doc, a, cache); if (!r) return;
  if (flatten) { const name = page.node.newXObject('ZnAp' + k, r.ap); page.pushOperators(L.pushGraphicsState(), L.drawObject(name), L.popGraphicsState()); return; }
  const slim = { ...a }; const dict = { Type: 'Annot', Subtype: r.subtype, Rect: r.rect.map(nf), F: 4, NM: L.PDFString.of('zeng-' + a.id), M: L.PDFString.of(pdfDate(new Date(a.date || Date.now()))), T: L.PDFHexString.fromText(a.author || 'ZengLook'), AP: { N: r.ap }, ZengData: L.PDFHexString.fromText(JSON.stringify(slim)), ...r.extra };
  if (!['FreeText', 'Stamp'].includes(r.subtype) || a.color) dict.C = rgb01(a.type === 'text' ? '#ffffff' : a.color || '#000000');
  if (a.type === 'text') delete dict.C; if (!dict.Contents) dict.Contents = L.PDFHexString.fromText(a.text || ''); if (a.opacity != null && a.opacity < 1) dict.CA = a.opacity;
  page.node.addAnnot(ctx.register(ctx.obj(dict)));
};

// ---------- build ----------
Pdf.build = async ({ flatten = false, pagesIdx = null, objectStreams = false, progress, noAnnots = false } = {}) => {
  const L = PL(); const src0 = Pdf.sources[0];
  if (src0.encrypted) { const e = new Error('encrypted'); e.code = 'ENCRYPTED'; throw e; }
  const base = await L.PDFDocument.load(src0.bytes, { updateMetadata: false, throwOnInvalidObject: false });
  await applyForms(base); if (flatten) { try { const f = base.getForm(); if (f.getFields().length) f.flatten(); } catch {} }
  const idxs = pagesIdx || Pdf.pages.map((_, i) => i); const descs = idxs.map((i) => Pdf.pages[i]);
  const identity = !pagesIdx && descs.length === base.getPageCount() && descs.every((d, i) => d.src === 0 && d.idx === i);
  let out, pages;
  if (identity) { out = base; pages = base.getPages(); }
  else {
    out = await L.PDFDocument.create(); try { const t = base.getTitle(), au = base.getAuthor(), su = base.getSubject(), kw = base.getKeywords(); t && out.setTitle(t); au && out.setAuthor(au); su && out.setSubject(su); kw && out.setKeywords(kw.split(/[,;]\s*/)); } catch {}
    const docs = new Map([[0, base]]); const want = new Map(); descs.forEach((d) => { if (!d.blank) { if (!want.has(d.src)) want.set(d.src, new Set()); want.get(d.src).add(d.idx); } });
    const copied = new Map();
    for (const [s, set] of want) { let sd = docs.get(s); if (!sd) { sd = await L.PDFDocument.load(Pdf.sources[s].bytes, { updateMetadata: false, throwOnInvalidObject: false }); docs.set(s, sd); } const list = [...set].sort((a, b) => a - b); const cp = await out.copyPages(sd, list); list.forEach((ix, k) => copied.set(s + ':' + ix, cp[k])); }
    pages = descs.map((d) => { if (d.blank) { const v = d.vb; return out.addPage([v[2] - v[0], v[3] - v[1]]); } return out.addPage(copied.get(d.src + ':' + d.idx)); });
  }
  const cache = new Map(); let k = 0;
  for (let i = 0; i < descs.length; i++) {
    const d = descs[i], page = pages[i]; progress && progress(i / descs.length);
    if (d.rot) page.setRotation(L.degrees((((page.getRotation().angle + d.rot) % 360) + 360) % 360));
    if (d.crop) { const c = d.crop; page.setCropBox(nf(c[0]), nf(c[1]), nf(c[2] - c[0]), nf(c[3] - c[1])); }
    if (!noAnnots) for (const a of d.anns) await addAnnotation(out, page, a, flatten, cache, k++);
    if (i % 25 === 24) await sleep(0);
  }
  const edit = Pdf.infoEdit; if (edit) { try { if ('title' in edit) out.setTitle(edit.title || ''); if ('author' in edit) out.setAuthor(edit.author || ''); if ('subject' in edit) out.setSubject(edit.subject || ''); if ('keywords' in edit) out.setKeywords((edit.keywords || '').split(/[,;]\s*/).filter(Boolean)); } catch {} }
  out.setProducer('ZengLook'); out.setModificationDate(new Date());
  return await out.save({ useObjectStreams: objectStreams });
};

// ---------- rasterising (print, export, compress, redaction, encrypted fallback) ----------
Pdf.renderToCanvas = async (di, scale, { annots = true, storage = true } = {}) => {
  const d = Pdf.pages[di]; const v = Pdf.vpFor(d, scale); const c = mkCanvas(Math.ceil(v.width), Math.ceil(v.height)); const ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (!d.blank) { const page = await Pdf.getPage(d); await page.render({ canvas: c, canvasContext: ctx, viewport: v, annotationMode: storage ? Pdf.lib.AnnotationMode.ENABLE_STORAGE : Pdf.lib.AnnotationMode.ENABLE }).promise; }
  if (annots && d.anns.length) { await Ann.preload(d.anns); for (const a of d.anns) Ann.paint(ctx, a, (x, y) => v.convertToViewportPoint(x, y), v.scale, v.rotation); }
  return c;
};
Pdf.rasterBuild = async ({ dpi = 150, quality = 0.88, progress, pagesIdx = null, annots = true } = {}) => {
  const L = PL(); const out = await L.PDFDocument.create(); const idxs = pagesIdx || Pdf.pages.map((_, i) => i); const scale = dpi / 72;
  for (let k = 0; k < idxs.length; k++) {
    const di = idxs[k]; progress && progress(k / idxs.length, `Page ${k + 1} of ${idxs.length}`); const c = await Pdf.renderToCanvas(di, scale, { annots }); const blob = await canvasBlob(c, 'image/jpeg', quality); const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const pv = Pdf.vpFor(Pdf.pages[di], 1); const pg = out.addPage([pv.width, pv.height]); pg.drawImage(img, { x: 0, y: 0, width: pv.width, height: pv.height }); freeCanvas(c); await sleep(0);
  }
  out.setProducer('ZengLook'); return await out.save();
};
