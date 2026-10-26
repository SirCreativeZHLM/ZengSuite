/* Image viewer/editor: zoom + momentum pan, folder browsing, rotate/flip/crop/adjust, markup, export, EXIF. */
'use strict';
const Img = (P.Img = { open: false, folder: [], idx: -1, view: { x: 0, y: 0, z: 1 }, fit: true, adj: null, anns: [] });
const ADJ0 = () => ({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, sharpen: 0 });
P.mimeFor = (ext) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', ico: 'image/x-icon' }[ext] || 'application/octet-stream');

// ---------- EXIF (JPEG APP1, PNG eXIf, WebP EXIF); no dependencies ----------
P.exif = (() => {
  const TAGS = { 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright', 0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9204: 'ExposureBias', 0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920a: 'FocalLength', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa405: 'FocalLengthIn35mm', 0xa433: 'LensMake', 0xa434: 'LensModel', 0x0100: 'ImageWidth', 0x0101: 'ImageLength' };
  const GPS = { 1: 'LatRef', 2: 'Lat', 3: 'LonRef', 4: 'Lon', 5: 'AltRef', 6: 'Alt' };
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  const findTiff = (b) => {
    if (b[0] === 0xff && b[1] === 0xd8) { let p = 2; while (p + 4 < b.length) { if (b[p] !== 0xff) break; const m = b[p + 1]; if (m === 0xda || m === 0xd9) break; const len = (b[p + 2] << 8) | b[p + 3]; if (m === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) return p + 10; p += 2 + len; } return -1; }
    if (b[0] === 0x89 && b[1] === 0x50) { let p = 8; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); while (p + 12 < b.length) { const len = dv.getUint32(p); const t = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]); if (t === 'eXIf') return p + 8; if (t === 'IDAT') break; p += 12 + len; } return -1; }
    if (b[0] === 0x52 && b[8] === 0x57) { let p = 12; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); while (p + 8 < b.length) { const t = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]); const len = dv.getUint32(p + 4, true); if (t === 'EXIF') { let q = p + 8; if (b[q] === 0x45) q += 6; return q; } p += 8 + len + (len & 1); } return -1; }
    return -1;
  };
  const parse = (b) => {
    const t0 = findTiff(b); if (t0 < 0) return null; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const le = b[t0] === 0x49; if (!(b[t0] === 0x49 || b[t0] === 0x4d)) return null;
    const u16 = (o) => dv.getUint16(t0 + o, le), u32 = (o) => dv.getUint32(t0 + o, le);
    const readVal = (type, count, off) => { const sz = SZ[type] * count; const o = sz > 4 ? u32(off + 8) : off + 8; const vals = []; for (let i = 0; i < Math.min(count, 64); i++) { const q = o + i * SZ[type]; if (t0 + q + SZ[type] > b.length) break; switch (type) { case 1: case 7: vals.push(b[t0 + q]); break; case 2: break; case 3: vals.push(u16(q)); break; case 4: vals.push(u32(q)); break; case 5: { const d = u32(q + 4); vals.push(d ? u32(q) / d : 0); break; } case 6: vals.push(dv.getInt8(t0 + q)); break; case 8: vals.push(dv.getInt16(t0 + q, le)); break; case 9: vals.push(dv.getInt32(t0 + q, le)); break; case 10: { const d = dv.getInt32(t0 + q + 4, le); vals.push(d ? dv.getInt32(t0 + q, le) / d : 0); break; } case 11: vals.push(dv.getFloat32(t0 + q, le)); break; case 12: vals.push(dv.getFloat64(t0 + q, le)); break; } } if (type === 2) { let s = ''; for (let i = 0; i < count; i++) { const ch = b[t0 + o + i]; if (!ch) break; s += String.fromCharCode(ch); } return s.trim(); } return vals.length === 1 ? vals[0] : vals; };
    const ifd = (off, names, out) => { if (!off || t0 + off + 2 > b.length) return; const n = u16(off); for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; if (t0 + e + 12 > b.length) break; const tag = u16(e), type = u16(e + 2), count = u32(e + 4); if (!SZ[type]) continue; if (tag === 0x8769 && names === TAGS) { ifd(u32(e + 8), TAGS, out); continue; } if (tag === 0x8825 && names === TAGS) { const g = {}; ifd(u32(e + 8), GPS, g); out.GPS = g; continue; } const nm = names[tag]; if (!nm) continue; try { out[nm] = readVal(type, count, e); } catch {} } };
    const out = {}; ifd(u32(4), TAGS, out); return out;
  };
  const dms = (v, ref) => { if (!Array.isArray(v) || v.length < 3) return null; const d = v[0] + v[1] / 60 + v[2] / 3600; return (ref === 'S' || ref === 'W' ? -1 : 1) * d; };
  const ORI = { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Flipped vertically', 5: 'Mirrored, rotated 90° CCW', 6: 'Rotated 90° CW', 7: 'Mirrored, rotated 90° CW', 8: 'Rotated 90° CCW' };
  const PROG = ['Not defined', 'Manual', 'Normal program', 'Aperture priority', 'Shutter priority', 'Creative', 'Action', 'Portrait', 'Landscape'];
  const frac = (v) => (v >= 1 ? v.toFixed(v < 10 ? 1 : 0) + ' s' : '1/' + Math.round(1 / v) + ' s');
  const sections = (x) => {
    if (!x) return []; const S = []; const add = (title, rows) => { rows = rows.filter((r) => r[1] !== undefined && r[1] !== '' && r[1] !== null); if (rows.length) S.push({ title, rows }); };
    add('Camera', [['Make', x.Make], ['Model', x.Model], ['Lens', x.LensModel || x.LensMake], ['Software', x.Software], ['Artist', x.Artist], ['Copyright', x.Copyright]]);
    add('Exposure', [['Taken', x.DateTimeOriginal || x.DateTime], ['Exposure', x.ExposureTime ? frac(x.ExposureTime) : undefined], ['Aperture', x.FNumber ? 'ƒ/' + (+x.FNumber).toFixed(1) : undefined], ['ISO', x.ISO], ['Focal length', x.FocalLength ? Math.round(x.FocalLength) + ' mm' + (x.FocalLengthIn35mm ? ` (${x.FocalLengthIn35mm} mm equiv.)` : '') : undefined], ['Exposure bias', x.ExposureBias != null && x.ExposureBias !== '' ? (x.ExposureBias > 0 ? '+' : '') + (+x.ExposureBias).toFixed(1) + ' EV' : undefined], ['Program', PROG[x.ExposureProgram]], ['Flash', x.Flash != null ? (x.Flash & 1 ? 'Fired' : 'Did not fire') : undefined]]);
    add('Image', [['Orientation', ORI[x.Orientation]], ['Pixel size', x.PixelXDimension ? `${x.PixelXDimension} × ${x.PixelYDimension}` : undefined], ['Resolution', x.XResolution ? `${Math.round(x.XResolution)} dpi` : undefined], ['Colour space', x.ColorSpace === 1 ? 'sRGB' : x.ColorSpace ? 'Uncalibrated' : undefined], ['White balance', x.WhiteBalance === 0 ? 'Auto' : x.WhiteBalance === 1 ? 'Manual' : undefined]]);
    if (x.GPS) { const la = dms(x.GPS.Lat, x.GPS.LatRef), lo = dms(x.GPS.Lon, x.GPS.LonRef); add('Location', [['Latitude', la != null ? la.toFixed(5) + '°' : undefined], ['Longitude', lo != null ? lo.toFixed(5) + '°' : undefined], ['Altitude', x.GPS.Alt != null ? Math.round(x.GPS.Alt) + ' m' : undefined]]); }
    return S;
  };
  return { parse, sections, orientation: (b) => { try { const x = parse(b); return x && x.Orientation; } catch { return 1; } } };
})();

// ---------- decoding ----------
const svgToUrl = async (text) => {
  const m = text.match(/<svg[^>]*>/i); let tag = m ? m[0] : ''; const vb = tag.match(/viewBox\s*=\s*["']\s*([\d.\-e]+)[ ,]+([\d.\-e]+)[ ,]+([\d.\-e]+)[ ,]+([\d.\-e]+)/i); const wA = tag.match(/\swidth\s*=\s*["']([\d.]+)(px)?["']/i), hA = tag.match(/\sheight\s*=\s*["']([\d.]+)(px)?["']/i);
  let w = wA ? +wA[1] : vb ? +vb[3] : 512, h = hA ? +hA[1] : vb ? +vb[4] : 512; const k = Math.max(1, Math.min(4096 / Math.max(w, h), 2048 / Math.max(w, h) * 1.5)); const W = Math.round(w * k), Hh = Math.round(h * k);
  let t2 = text; if (m) { let nt = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, ''); nt = nt.replace(/<svg/i, `<svg width="${W}" height="${Hh}"` + (!vb ? ` viewBox="0 0 ${w} ${h}"` : '')); t2 = text.replace(tag, nt); }
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t2), W, H: Hh };
};
const decodeToCanvas = async (buf, ext) => {
  let source, w, h; const type = P.mimeFor(ext);
  if (ext === 'svg') { const { url, W, H } = await svgToUrl(new TextDecoder().decode(buf)); const im = await P.loadImg(url); const c = mkCanvas(W, H); c.getContext('2d').drawImage(im, 0, 0, W, H); return c; }
  try { source = await createImageBitmap(new Blob([buf], { type })); } catch (e) {
    try { const url = URL.createObjectURL(new Blob([buf], { type })); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image format can’t be decoded by the system web view.')); i.src = url; }); source = im; w = im.naturalWidth; h = im.naturalHeight; setTimeout(() => URL.revokeObjectURL(url), 5000); } catch (e2) { throw new Error(ext === 'tif' || ext === 'tiff' ? 'This system can’t display TIFF images.' : e2.message); }
  }
  w = source.width || w; h = source.height || h; const c = mkCanvas(w, h); c.getContext('2d').drawImage(source, 0, 0); source.close && source.close(); return c;
};
const isAnimatedGif = (b) => { let n = 0; const u = new Uint8Array(b); for (let i = 0; i < u.length - 3 && n < 2; i++) if (u[i] === 0x21 && u[i + 1] === 0xf9 && u[i + 2] === 4) n++; return n > 1; };

// ---------- open / state ----------
Img.stage = () => $('#imgstage');
Img.openBuffer = async (buf, handle) => {
  const name = handle.name; const ext = extOf(name); const bytes = new Uint8Array(buf); const base = await decodeToCanvas(buf, ext);
  Pdf.open && Pdf.closeAll(); P.hideSheet && P.hideSheet();
  Img.name = name; Img.ext = ext; Img.handle = handle; Img.orig = buf; Img.base = base; Img.adj = ADJ0(); Img.anns = []; Img.exif = null; Img.animated = ext === 'gif' && isAnimatedGif(buf); Img.dirtyEdits = false;
  try { Img.exif = P.exif.parse(bytes); } catch {} Img.open = true; Img.adjusted = null;
  Img.buildStage(); Img.fitView(); P.maxHist = 14; P.resetHistory();
  Img.scanFolder(handle);
};
Img.snap = () => ({ base: Img.base, adj: { ...Img.adj }, anns: JSON.stringify(Img.anns), animated: Img.animated });
Img.restore = async (s) => { Img.base = s.base; Img.adj = { ...s.adj }; Img.anns = JSON.parse(s.anns); Img.animated = s.animated; Img.adjusted = null; P.selId = null; P.selPage = null; Img.refresh(); P.onSelect && P.onSelect(null); P.onImgState && P.onImgState(); };
Img.buildStage = () => {
  const st = Img.stage(); st.replaceChildren(); const wrap = el('.imgwrap'); const ov = el('.page.imgov'); Img.wrap = wrap; Img.ov = ov;
  Img.pv = { el: ov, kind: 'img', desc: { get anns() { return Img.anns; }, set anns(v) { Img.anns = v; } }, vp: null, srcCanvas: () => ({ canvas: Img.full(), dx: 0, dy: 0 }) };
  wrap.append(ov); st.append(wrap, el('.zoomhud')); Ann.attach(Img.pv); Img.setVp(); Img.refresh();
  bindStage(st); Ann.setTool(P.tool === 'select' ? 'select' : P.tool); document.querySelectorAll('.gl').forEach((g) => g.classList.toggle('on', !(P.tool === 'select')));
};
Img.setVp = () => { const w = Img.base.width, h = Img.base.height; Img.pv.vp = { w, h, scale: 1, rot: 0, toV: (x, y) => [x, y], toD: (x, y) => [x, y] }; Img.ov.style.width = w + 'px'; Img.ov.style.height = h + 'px'; Img.wrap.style.width = w + 'px'; Img.wrap.style.height = h + 'px'; Ann.size(Img.pv); };
const neutral = (a) => !a.exposure && !a.contrast && !a.saturation && !a.temperature && !a.sharpen;
Img.refresh = () => { // put the right element in the wrapper
  if (!Img.wrap) return; Img.setVp(); const b = Img.base;
  if (Img.animated && neutral(Img.adj) && !Img.anns.length) { if (!Img.imgEl) { Img.imgEl = el('img.dispimg', { src: URL.createObjectURL(new Blob([Img.orig], { type: 'image/gif' })), draggable: false }); } Img.setDisp(Img.imgEl); }
  else { Img.imgEl && (URL.revokeObjectURL(Img.imgEl.src), (Img.imgEl = null)); const c = neutral(Img.adj) ? b : (Img.adjusted && Img.adjusted.key === JSON.stringify(Img.adj) + b.width ? Img.adjusted.c : Img.renderAdjusted(b, Img.adj, 1600)); Img.setDisp(c); if (c !== b && !(Img.adjusted && Img.adjusted.key === JSON.stringify(Img.adj) + b.width)) Img.scheduleFull(); }
  Ann.redraw(Img.pv); Img.hud();
};
Img.setDisp = (c) => { if (Img.disp === c && c.parentNode === Img.wrap) { c.style.width = Img.base.width + 'px'; c.style.height = Img.base.height + 'px'; return; } Img.disp && Img.disp.parentNode === Img.wrap && Img.disp.remove(); Img.disp = c; c.classList.add('disp'); c.style.width = Img.base.width + 'px'; c.style.height = Img.base.height + 'px'; Img.wrap.prepend(c); };
Img.full = () => (neutral(Img.adj) ? Img.base : Img.fullAdjusted());
Img.fullAdjusted = () => { const key = JSON.stringify(Img.adj) + Img.base.width; if (Img.adjusted && Img.adjusted.key === key) return Img.adjusted.c; const c = Img.renderAdjusted(Img.base, Img.adj, 0); Img.adjusted = { key, c }; return c; };
let fullTimer = 0; Img.scheduleFull = () => { clearTimeout(fullTimer); fullTimer = setTimeout(() => { if (!Img.open) return; const c = Img.fullAdjusted(); Img.setDisp(c); }, 220); };

// ---------- adjustments ----------
Img.renderAdjusted = (src, a, maxSide) => {
  let w = src.width, h = src.height; const k = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1; w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  const c = mkCanvas(w, h); const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); const id = x.getImageData(0, 0, w, h); Img.adjustPixels(id, a); x.putImageData(id, 0, 0); return c;
};
Img.adjustPixels = (id, a) => {
  const d = id.data, n = d.length; const ex = Math.pow(2, a.exposure), cf = (259 * (a.contrast * 2.55 + 255)) / (255 * (259 - a.contrast * 2.55)); const t = a.temperature / 100;
  const gain = [1 + t * 0.18, 1 + t * 0.02, 1 - t * 0.18]; const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) { let l = Math.pow(v / 255, 2.2) * ex; let s = Math.pow(Math.min(l, 4), 1 / 2.2) * 255; s = cf * (s - 128) + 128; lut[c][v] = s * gain[c]; }
  const sat = 1 + a.saturation / 100; const doSat = a.saturation !== 0; const [lr, lg, lb] = lut;
  for (let i = 0; i < n; i += 4) { let r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]]; if (doSat) { const gr = 0.299 * r + 0.587 * g + 0.114 * b; r = gr + (r - gr) * sat; g = gr + (g - gr) * sat; b = gr + (b - gr) * sat; } d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  if (a.sharpen > 0) { const w = id.width, h = id.height; const src = new Uint8ClampedArray(d); const amt = a.sharpen / 100 * 1.6; for (let y = 1; y < h - 1; y++) { let o = (y * w + 1) * 4; for (let x = 1; x < w - 1; x++, o += 4) for (let c = 0; c < 3; c++) { const p = o + c; const blur = (src[p - 4] + src[p + 4] + src[p - w * 4] + src[p + w * 4] + 4 * src[p]) / 8; d[p] = src[p] + (src[p] - blur) * amt; } } }
};

// ---------- view (zoom/pan) ----------
Img.vsize = () => { const st = Img.stage(); return [st.clientWidth, st.clientHeight]; };
Img.applyView = () => { const { x, y, z } = Img.view; Img.wrap.style.transform = `translate(${x}px,${y}px) scale(${z})`; Img.stage().style.setProperty('--inv', 1 / z); Img.wrap.classList.toggle('pix', z >= 2.5); Img.hud(); };
Img.fitZ = () => { const [vw, vh] = Img.vsize(); return Math.min((vw - 40) / Img.base.width, (vh - 40) / Img.base.height, 1); };
Img.fitView = () => { const [vw, vh] = Img.vsize(); const z = Math.max(0.01, Img.fitZ()); Img.fit = true; Img.view = { z, x: (vw - Img.base.width * z) / 2, y: (vh - Img.base.height * z) / 2 }; Img.applyView(); };
Img.bounds = (z = Img.view.z) => { const [vw, vh] = Img.vsize(); const w = Img.base.width * z, h = Img.base.height * z; return { x: w <= vw ? [(vw - w) / 2, (vw - w) / 2] : [vw - w, 0], y: h <= vh ? [(vh - h) / 2, (vh - h) / 2] : [vh - h, 0] }; };
Img.clampView = () => { const b = Img.bounds(); Img.view.x = clamp(Img.view.x, b.x[0], b.x[1]); Img.view.y = clamp(Img.view.y, b.y[0], b.y[1]); };
Img.zoomAt = (f, cx, cy, abs) => { const r = Img.stage().getBoundingClientRect(); const px = cx - r.left, py = cy - r.top; const v = Img.view; const z = clamp(abs ? f : v.z * f, 0.02, 32); const k = z / v.z; v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k; v.z = z; Img.fit = false; Img.clampView(); Img.applyView(); };
Img.zoomCenter = (f, abs) => { const r = Img.stage().getBoundingClientRect(); Img.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2, abs); };
Img.hud = () => { const h = $('.zoomhud', Img.stage()); if (h) { h.textContent = Math.round(Img.view.z * 100) + '%'; h.classList.add('show'); clearTimeout(Img.hudT); Img.hudT = setTimeout(() => h.classList.remove('show'), 900); } P.onZoom && P.onZoom(); };
let panAnim = [null, null];
const stopPan = () => panAnim.forEach((a) => a && a.stop());
const bindStage = (st) => {
  if (st._bound) return; st._bound = true;
  st.addEventListener('wheel', (e) => { if (!Img.open || st.classList.contains('zk-hidden')) return; e.preventDefault(); stopPan(); if (e.ctrlKey || e.metaKey) Img.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.004)), e.clientX, e.clientY); else { const v = Img.view; v.x -= e.deltaX; v.y -= e.deltaY; Img.fit = false; Img.clampView(); Img.applyView(); } }, { passive: false });
  let gs = 1; st.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; stopPan(); }); st.addEventListener('gesturechange', (e) => { e.preventDefault(); Img.zoomAt(e.scale / gs, e.clientX, e.clientY); gs = e.scale; }); st.addEventListener('gestureend', (e) => e.preventDefault());
  st.addEventListener('dblclick', (e) => { if (e.target.closest('.tb,.note,.hd,.cropper')) return; if (Img.fit || Img.view.z < 0.99) Img.zoomAt(1, e.clientX, e.clientY, true); else { Img.fitView(); } });
  st.addEventListener('pointerdown', (e) => { // pan with drag on background (select tool) with momentum
    if (e.button !== 0 || P.tool !== 'select' || e.target.closest('.hd,.tb,.note,.noteedit,.cropper,.loupe')) return; if (Img.pv && Ann.topHit && Img.open) { const hit = Ann.topHit(Img.pv, e); if (hit) return; } if (Img.cropState) return;
    stopPan(); const v = Img.view; const start = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }; const samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }]; let moved = false; st.setPointerCapture(e.pointerId); st.classList.add('grabbing');
    const rb = (val, [lo, hi], dim) => (val > hi ? hi + zk.rubberband(val - hi, dim) : val < lo ? lo - zk.rubberband(lo - val, dim) : val);
    const mv = (ev) => { const dx = ev.clientX - start.x, dy = ev.clientY - start.y; if (!moved && Math.hypot(dx, dy) < 3) return; moved = true; const b = Img.bounds(); const [vw, vh] = Img.vsize(); v.x = rb(start.vx + dx, b.x, vw); v.y = rb(start.vy + dy, b.y, vh); Img.fit = false; Img.applyView(); samples.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); if (samples.length > 8) samples.shift(); };
    const up = () => { st.removeEventListener('pointermove', mv); st.removeEventListener('pointerup', up); st.removeEventListener('pointercancel', up); st.classList.remove('grabbing'); if (!moved) return; const now = performance.now(); const old = samples.find((s) => now - s.t < 90) || samples[samples.length - 1]; const dt = Math.max(16, now - old.t); const vx = ((samples[samples.length - 1].x - old.x) / dt) * 1000, vy = ((samples[samples.length - 1].y - old.y) / dt) * 1000; const b = Img.bounds();
      const tx = clamp(v.x + zk.project(vx), b.x[0], b.x[1]), ty = clamp(v.y + zk.project(vy), b.y[0], b.y[1]);
      panAnim[0] = zk.spring({ from: v.x, to: tx, velocity: vx, response: 0.55, onUpdate: (x) => { v.x = x; Img.applyView(); } }); panAnim[1] = zk.spring({ from: v.y, to: ty, velocity: vy, response: 0.55, onUpdate: (y) => { v.y = y; Img.applyView(); } }); };
    st.addEventListener('pointermove', mv); st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  });
  new ResizeObserver(() => { if (Img.open && Img.fit && !st.classList.contains('zk-hidden')) Img.fitView(); else if (Img.open && !st.classList.contains('zk-hidden')) { Img.clampView(); Img.applyView(); } }).observe(st);
};

// ---------- edit operations ----------
const commitEdit = () => { Img.adjusted = null; Img.refresh(); Img.fitIfNeeded(); P.pushHistory(); P.onImgState && P.onImgState(); P.onAnnChange && P.onAnnChange(); };
Img.fitIfNeeded = () => { if (Img.fit) Img.fitView(); else { Img.clampView(); Img.applyView(); } };
Img.ensureEditable = () => { if (Img.animated) { Img.animated = false; } };
Img.mapAll = (f, dAng) => { Img.anns.forEach((a) => { Ann.mapPoints(a, f); if (a.ang !== undefined && dAng) a.ang = dAng(a.ang); }); };
Img.rotate = (dir) => { // dir +1 CW, -1 CCW
  Img.ensureEditable(); const b = Img.base, W = b.width, H = b.height; const c = mkCanvas(H, W); const x = c.getContext('2d'); x.translate(dir > 0 ? H : 0, dir > 0 ? 0 : W); x.rotate((dir * Math.PI) / 2); x.drawImage(b, 0, 0);
  Img.mapAll(dir > 0 ? (p) => [H - p[1], p[0]] : (p) => [p[1], W - p[0]], (a) => (((a + dir * 90) % 360) + 360) % 360); Img.base = c; commitEdit();
};
Img.flip = (horizontal) => { Img.ensureEditable(); const b = Img.base, W = b.width, H = b.height; const c = mkCanvas(W, H); const x = c.getContext('2d'); if (horizontal) { x.translate(W, 0); x.scale(-1, 1); } else { x.translate(0, H); x.scale(1, -1); } x.drawImage(b, 0, 0); Img.mapAll(horizontal ? (p) => [W - p[0], p[1]] : (p) => [p[0], H - p[1]], (a) => (360 - a) % 360); Img.base = c; commitEdit(); };
Img.applyAdjustment = () => { /* bake adjustment into base (used by crop/resize); keeps markup intact */ if (neutral(Img.adj)) return; Img.base = Img.fullAdjusted(); Img.adj = ADJ0(); Img.adjusted = null; };
Img.resizeTo = (w, h) => { Img.ensureEditable(); Img.applyAdjustment(); const b = Img.base; const c = mkCanvas(w, h); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, w, h); const kx = w / b.width, ky = h / b.height; Img.mapAll((p) => [p[0] * kx, p[1] * ky]); Img.anns.forEach((a) => { if (a.w) { a.w *= kx; a.h *= kx; } if (a.size) a.size *= kx; if (a.width) a.width *= kx; }); Img.base = c; commitEdit(); };
const RATIOS = [['Free', null], ['Original', 'orig'], ['Square', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['5:4', 5 / 4], ['7:5', 7 / 5], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];
Img.cropState = null;
Img.startCrop = () => {
  if (Img.cropState) return Img.endCrop(); if (!Img.open) return; Ann.setTool('select'); Ann.select(null); const W = Img.base.width, H = Img.base.height;
  const dim = el('span.zk-label', { style: { minWidth: '80px', textAlign: 'center' } });
  const cr = new P.Cropper(Img.wrap, { rect: { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 }, scale: () => Img.view.z, onChange: (r) => { dim.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`; } });
  let swap = false;
  const sel = el('select.zk-select', { 'aria-label': 'Aspect ratio', onchange: () => { const v = RATIOS[sel.selectedIndex][1]; cr.setRatio(v === null ? null : v === 'orig' ? W / H : swap && typeof v === 'number' ? 1 / v : v); } }, ...RATIOS.map(([n]) => el('option', n)));
  const bar = el('.zk-toolbar.cropbar', { style: { position: 'absolute', zIndex: 30, bottom: '16px', left: '50%', transform: 'translateX(-50%)', borderRadius: '12px', boxShadow: 'var(--shadow-2)', border: 'none', minHeight: '44px', width: 'max-content', maxWidth: '96%', flexWrap: 'wrap' } }, sel, zk.btn({ icon: 'rotate-cw', title: 'Swap orientation', onClick: () => { swap = !swap; if (cr.ratio) cr.setRatio(1 / cr.ratio); } }), dim, zk.btn({ label: 'Cancel', cls: 'bordered', onClick: () => Img.endCrop() }), zk.btn({ label: 'Crop', cls: 'primary', onClick: () => Img.applyCrop() }));
  Img.stage().append(bar); Img.cropState = { cr, bar }; cr.paint(); P.onTool && P.onTool(P.tool);
};
Img.endCrop = () => { if (!Img.cropState) return; Img.cropState.cr.destroy(); Img.cropState.bar.remove(); Img.cropState = null; P.onTool && P.onTool(P.tool); };
Img.applyCrop = () => { const r = Img.cropState.cr.r; const x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h)); Img.endCrop(); Img.ensureEditable(); Img.applyAdjustment(); const c = mkCanvas(w, h); c.getContext('2d').drawImage(Img.base, x, y, w, h, 0, 0, w, h); Img.mapAll((p) => [p[0] - x, p[1] - y]); Img.base = c; commitEdit(); Img.fitView(); };

// ---------- compose / export ----------
Img.compose = async (W, H) => {
  const full = Img.full(); const bw = Img.base.width, bh = Img.base.height; W = W || bw; H = H || bh; const c = mkCanvas(W, H); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, W, H);
  const kx = W / bw; if (Img.anns.length) { await Ann.paintAll(x, Img.anns, (px, py) => [px * kx, py * (H / bh)], kx, 0, c); } return c;
};
const FMT = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'] };
Img.encode = async (canvas, fmt, q) => { let c = canvas; if (fmt === 'jpeg') { c = mkCanvas(canvas.width, canvas.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0); } const b = await canvasBlob(c, FMT[fmt][0], q); if (c !== canvas) freeCanvas(c); return b; };
Img.exportSheet = async ({ title = 'Export Image', fmt0 } = {}) => {
  const W0 = Img.base.width, H0 = Img.base.height; const fmtSel = el('select.zk-select', ...Object.entries({ png: 'PNG', jpeg: 'JPEG', webp: 'WebP' }).map(([k, v]) => el('option', { value: k }, v))); fmtSel.value = fmt0 || (Img.ext === 'jpg' || Img.ext === 'jpeg' ? 'jpeg' : Img.ext === 'webp' ? 'webp' : 'png');
  const wI = el('input.zk-input.num.selectable', { type: 'number', value: W0, min: 1, max: 20000 }), hI = el('input.zk-input.num.selectable', { type: 'number', value: H0, min: 1, max: 20000 }); const lock = el('input.zk-check', { type: 'checkbox', checked: true });
  const q = el('input.zk-range', { type: 'range', min: 10, max: 100, value: 90 }), qv = el('span.zk-label', { style: { width: '34px' } }, '90%'); const est = el('span.zk-label', { style: { opacity: 0.8 } }, ''); const qRow = frow('Quality', el('.zk-row', { style: { gap: '8px', alignItems: 'center', width: '190px' } }, q, qv));
  let t = 0; const upd = () => { qRow.style.display = fmtSel.value === 'png' ? 'none' : ''; qv.textContent = q.value + '%'; clearTimeout(t); est.textContent = 'Estimating size…'; t = setTimeout(async () => { try { const w = +wI.value, h = +hI.value; if (!w || !h) return; const k = Math.min(1, 1200 / Math.max(w, h)); const c = await Img.compose(Math.round(w * k), Math.round(h * k)); const b = await Img.encode(c, fmtSel.value, q.value / 100); freeCanvas(c); est.textContent = `≈ ${fmtBytes(Math.round(b.size / (k * k)))}`; } catch { est.textContent = ''; } }, 250); };
  wI.oninput = () => { if (lock.checked) hI.value = Math.max(1, Math.round((wI.value * H0) / W0)); upd(); }; hI.oninput = () => { if (lock.checked) wI.value = Math.max(1, Math.round((hI.value * W0) / H0)); upd(); }; fmtSel.onchange = upd; q.oninput = upd;
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, frow('Format', fmtSel), frow('Width (px)', wI), frow('Height (px)', hI), frow('Keep proportions', lock), qRow, el('.zk-row', { style: { justifyContent: 'flex-end' } }, est)); upd();
  const r = await zk.sheet({ title, body, buttons: [{ label: 'Cancel', value: false }, { label: 'Save…', primary: true, value: true }] }); if (!r) return null; return { fmt: fmtSel.value, w: +wI.value || W0, h: +hI.value || H0, q: q.value / 100 };
};
Img.saveAsDialog = async (opts) => {
  const o = await Img.exportSheet(opts); if (!o) return false; const pg = P.progress('Saving'); try { const c = await Img.compose(o.w, o.h); const b = await Img.encode(c, o.fmt, o.q); freeCanvas(c); pg.close(); const h = await zeng.files.saveAs(b, { name: baseName(Img.name) + '.' + FMT[o.fmt][1], filters: [{ name: o.fmt.toUpperCase(), exts: [FMT[o.fmt][1]] }] }); if (!h) return false; Img.name = h.name; Img.ext = FMT[o.fmt][1]; Img.handle = h.path ? h : Img.handle; P.doc.file = h.web ? { name: h.name } : h; P.doc.setClean(); P.doc.refreshTitle(); zk.toast('Saved ' + h.name); return true; } catch (e) { pg.close(); zk.alert('Couldn’t save', e.message); return false; }
};
Img.save = async () => {
  const ext = Img.ext; const inPlace = Img.handle && Img.handle.path && ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
  if (!inPlace) return Img.saveAsDialog();
  try { const fmt = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpeg'; const c = await Img.compose(); const b = await Img.encode(c, fmt, 0.92); freeCanvas(c); await zeng.files.write(Img.handle, b); P.doc.setClean(); Img.orig = await b.arrayBuffer(); zk.toast('Saved ' + Img.name); return true; } catch (e) { zk.alert('Couldn’t save', e.message); return false; }
};
Img.copy = async () => { try { const c = await Img.compose(); const b = await Img.encode(c, 'png'); freeCanvas(c); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); zk.toast('Copied image'); } catch (e) { zk.alert('Couldn’t copy', 'The clipboard did not accept the image. ' + (e.message || '')); } };

// ---------- folder / contact sheet / slideshow ----------
const dirOf = (p) => p.replace(/[\\/][^\\/]*$/, '');
Img.custom = null;
Img.scanFolder = async (h) => {
  const same = (f) => (h.path ? f.path === h.path : f.name === h.name);
  if (Img.custom && Img.custom.some(same)) Img.folder = Img.custom;
  else { Img.custom = null; if (h.path) { try { const dir = dirOf(h.path); const list = await zeng.files.listDir(dir); Img.folder = list.filter((f) => !f.dir && IMG_EXTS.includes(extOf(f.name)) && !f.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); } catch { Img.folder = [h]; } } else Img.folder = [h]; }
  Img.idx = Img.folder.findIndex(same); if (Img.idx < 0) { Img.folder = [h]; Img.idx = 0; } P.onFolder && P.onFolder();
};
Img.step = async (d) => { if (Img.folder.length < 2) return; const i = (Img.idx + d + Img.folder.length) % Img.folder.length; Img.hideSheetView(); await P.doc.openHandle(Img.folder[i]); P.afterOpen && P.afterOpen(); const n = Img.folder[(Img.idx + d + Img.folder.length) % Img.folder.length]; if (n && n.path) { const pre = new Image(); pre.src = zeng.files.url(n); } };
Img.sheetOn = false;
Img.showSheetView = () => {
  if (!Img.folder.length) return; Img.sheetOn = true; const host = $('#sheetview'); host.classList.remove('zk-hidden'); Img.stage().classList.add('zk-hidden'); host.replaceChildren(); const selected = new Set(); Img.sheetSel = selected;
  const grid = el('.contact'); const io = new IntersectionObserver((es) => es.forEach((e) => { const im = e.target.firstChild; if (e.isIntersecting) { if (!im.src) im.src = im._u || (im._u = zeng.files.url(im._h)); } else if (im.src && !e.target._keep) { im.removeAttribute('src'); } }), { root: host, rootMargin: '400px' });
  Img.folder.forEach((f, i) => { const im = el('img', { loading: 'lazy', decoding: 'async', draggable: false, alt: f.name }); im._h = f; const cell = el('.cell' + (i === Img.idx ? '.cur' : ''), { title: f.name, onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) { selected.has(i) ? selected.delete(i) : selected.add(i); cell.classList.toggle('sel', selected.has(i)); P.onSheetSel && P.onSheetSel(selected.size); return; } Img.idx = i; Img.hideSheetView(); P.doc.openHandle(f).then(() => P.afterOpen && P.afterOpen()); } }, im, el('.nm', f.name)); grid.append(cell); io.observe(cell); });
  host.append(grid); P.onSheet && P.onSheet(true); const cur = grid.children[Img.idx]; cur && cur.scrollIntoView({ block: 'center' });
};
Img.hideSheetView = () => { Img.sheetOn = false; const host = $('#sheetview'); host.classList.add('zk-hidden'); host.replaceChildren(); if (Img.open) Img.stage().classList.remove('zk-hidden'); P.onSheet && P.onSheet(false); };
Img.slideshow = async () => {
  if (!Img.folder.length) return; let i = Math.max(0, Img.idx); let paused = false; const wrap = el('.present.slides', el('img.a'), el('img.b'), el('.pcount')); document.body.append(wrap); await zeng.fullscreen(true); let front = wrap.children[0], back = wrap.children[1]; let timer = 0;
  const load = async (n) => { const f = Img.folder[((n % Img.folder.length) + Img.folder.length) % Img.folder.length]; const u = zeng.files.url(f); back.src = u; try { await back.decode(); } catch {} back.classList.add('on'); front.classList.remove('on'); [front, back] = [back, front]; wrap.lastChild.textContent = `${((n % Img.folder.length) + Img.folder.length) % Img.folder.length + 1} / ${Img.folder.length}  ${paused ? '(paused)' : ''}`; wrap.lastChild.classList.add('show'); setTimeout(() => wrap.lastChild.classList.remove('show'), 1200); };
  const go = (d) => { i += d; load(i); sched(); }; const sched = () => { clearTimeout(timer); if (!paused) timer = setTimeout(() => go(1), 3500); };
  const key = (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); end(); } else if (e.key === ' ') { e.preventDefault(); paused = !paused; wrap.lastChild.textContent = paused ? 'Paused' : 'Playing'; wrap.lastChild.classList.add('show'); sched(); } else if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(1); } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); go(-1); } };
  const end = async () => { clearTimeout(timer); removeEventListener('keydown', key, true); wrap.remove(); await zeng.fullscreen(false); }; addEventListener('keydown', key, true); wrap.addEventListener('click', () => go(1)); wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); end(); }); await load(i); sched();
};

// ---------- combine images into a PDF ----------
Img.combineToPdf = async (handles) => {
  if (!handles || !handles.length) handles = await zeng.files.open({ multiple: true, filters: [{ name: 'Images', exts: IMG_EXTS }] }); if (!handles.length) return;
  const pg = P.progress('Combining to PDF'); const L = PDFLib;
  try { const out = await L.PDFDocument.create(); for (let i = 0; i < handles.length; i++) { pg.set(handles[i].name, i / handles.length); const b = await P.imageToPdfBytes(await zeng.files.read(handles[i]), handles[i].name); const src = await L.PDFDocument.load(b); const [pgx] = await out.copyPages(src, [0]); out.addPage(pgx); } out.setProducer('ZengLook'); const bytes = await out.save(); pg.close(); await P.openUnsavedPdf(bytes, 'Combined'); } catch (e) { pg.close(); zk.alert('Couldn’t combine images', e.message); }
};
