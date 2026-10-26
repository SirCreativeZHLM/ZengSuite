/* Clean Scan workspace UI. */
'use strict';
(() => {
  let root, main, strip, side, stage, view = 'frame', prevT = 0, busy = 0;
  const MODES = [['color', 'Colour'], ['paper', 'Paper white'], ['gray', 'Grey'], ['ink', 'Ink black']];
  const snapPaper = (w, h) => { const a = Math.max(w, h) / Math.min(w, h); const port = h >= w; const A4 = 842 / 595, LT = 792 / 612; if (Math.abs(a - A4) / A4 < 0.04) return port ? [595, 842] : [842, 595]; if (Math.abs(a - LT) / LT < 0.04) return port ? [612, 792] : [792, 612]; const k = 72 / 150; return [w * k, h * k]; };
  Scan.snapPaper = snapPaper;
  const cur = () => Scan.pages[Scan.cur];
  Scan.addCanvases = (list) => { for (const { name, canvas } of list) { const det = Scan.detect(canvas); Scan.pages.push({ id: uid(), name, src: canvas, corners: det.corners, found: det.found, thumb: null }); } Scan.cur = Math.max(0, Scan.pages.length - list.length); };
  Scan.addHandles = async (hs) => {
    const pg = P.progress('Reading images'); const list = [];
    try { for (let i = 0; i < hs.length; i++) { pg.set(hs[i].name, i / hs.length); const ext = extOf(hs[i].name); if (!IMG_EXTS.includes(ext)) continue; const buf = await zeng.files.read(hs[i]); const full = await decodeToCanvas(buf, ext); const k = Math.min(1, MAXW / Math.max(full.width, full.height)); let c = full; if (k < 1) { c = mkCanvas(full.width * k, full.height * k); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, c.width, c.height); freeCanvas(full); } list.push({ name: hs[i].name, canvas: c }); await sleep(0); } } catch (e) { pg.close(); zk.alert('Couldn’t read image', e.message); return; } pg.close();
    if (!list.length) { zk.toast('Choose one or more images'); return; } Scan.addCanvases(list);
  };
  Scan.start = async (handles) => {
    if (!handles) handles = await zeng.files.open({ multiple: true, filters: [{ name: 'Photos and images', exts: IMG_EXTS }] }); if (!handles || !handles.length) return;
    await Scan.addHandles(handles); if (Scan.pages.length) Scan.show();
  };
  Scan.startFromCurrent = () => { if (P.mode !== 'image') return; const c = mkCanvas(Img.base.width, Img.base.height); c.getContext('2d').drawImage(Img.base, 0, 0); Scan.addCanvases([{ name: Img.name, canvas: c }]); Scan.show(); };
  const build = () => {
    root = el('.scan', { role: 'dialog', 'aria-label': 'Clean Scan' });
    const head = el('.sc-head', zk.btn({ label: 'Cancel', cls: 'bordered', onClick: () => Scan.close(true) }), el('.zk-title', { style: { maxWidth: 'none' } }, 'Clean Scan'), el('.zk-spacer'), zk.btn({ icon: 'plus', label: 'Add Pages…', cls: 'bordered', onClick: async () => { const hs = await zeng.files.open({ multiple: true, filters: [{ name: 'Photos and images', exts: IMG_EXTS }] }); if (hs.length) { await Scan.addHandles(hs); render(); } } }), createBtn = zk.btn({ label: 'Create PDF', cls: 'primary', onClick: () => Scan.create() }));
    strip = el('.sc-strip'); main = el('.sc-main'); side = el('.sc-side'); root.append(head, el('.sc-body', strip, main, side));
  };
  let createBtn;
  Scan.show = () => { if (!root) build(); $('#stage').append(root); Scan.on = true; root.classList.remove('zk-hidden'); view = 'frame'; render(); addEventListener('keydown', onKey, true); };
  Scan.close = async (ask) => { if (ask && Scan.pages.length > 1 && !(await zk.confirm('Discard this scan?', `The ${Scan.pages.length} pages you set up will be lost.`, 'Discard', { danger: true }))) return; removeEventListener('keydown', onKey, true); Scan.on = false; clearTimeout(prevT); busy++; root && root.remove(); Scan.pages.forEach((p) => freeCanvas(p.src)); Scan.pages = []; Scan.cur = 0; };
  const onKey = (e) => { if (document.querySelector('.zk-scrim')) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); Scan.close(true); } else if (e.key === 'Enter' && !e.target.closest('input,select,textarea,button')) { e.preventDefault(); Scan.create(); } };
  const render = () => { renderStrip(); renderSide(); renderMain(); };
  const renderStrip = () => {
    strip.replaceChildren(...Scan.pages.map((p, i) => { const t = el('.sc-th' + (i === Scan.cur ? '.cur' : ''), { tabindex: 0, onclick: () => { Scan.cur = i; render(); } }, p.thumb ? el('img', { src: p.thumb }) : el('canvas', { width: 1, height: 1 }), el('.sc-n', String(i + 1)), el('.sc-act', zk.btn({ icon: 'chevron-up', title: 'Move up', onClick: (e) => { e.stopPropagation(); mv(i, -1); } }), zk.btn({ icon: 'chevron-down', title: 'Move down', onClick: (e) => { e.stopPropagation(); mv(i, 1); } }), zk.btn({ icon: 'x', title: 'Remove page', onClick: (e) => { e.stopPropagation(); rm(i); } }))); if (!p.thumb) t.firstChild.replaceWith(srcThumb(p)); return t; }));
    createBtn.textContent = `Create PDF (${Scan.pages.length})`;
  };
  const srcThumb = (p) => { const k = 120 / Math.max(p.src.width, p.src.height); const c = mkCanvas(p.src.width * k, p.src.height * k); c.getContext('2d').drawImage(p.src, 0, 0, c.width, c.height); c.style.width = c.width + 'px'; return el('img', { src: c.toDataURL('image/jpeg', 0.6) }); };
  const mv = (i, d) => { const j = i + d; if (j < 0 || j >= Scan.pages.length) return; [Scan.pages[i], Scan.pages[j]] = [Scan.pages[j], Scan.pages[i]]; if (Scan.cur === i) Scan.cur = j; else if (Scan.cur === j) Scan.cur = i; render(); };
  const rm = (i) => { const [p] = Scan.pages.splice(i, 1); freeCanvas(p.src); if (!Scan.pages.length) { Scan.close(false); return; } Scan.cur = clamp(Scan.cur, 0, Scan.pages.length - 1); render(); };
  const renderSide = () => {
    const o = Scan.opts; const set = (k, v) => { o[k] = v; renderSide(); schedulePreview(); };
    const modeSeg = el('.zk-seg.vert', ...MODES.map(([k, n]) => el('button', { 'aria-pressed': String(o.mode === k), onclick: () => set('mode', k) }, n)));
    const sw = (k, label) => el('label.zk-field', el('span', label), el('input.zk-switch', { type: 'checkbox', checked: o[k], onchange: (e) => set(k, e.target.checked) }));
    const sl = el('input.zk-range', { type: 'range', min: 0, max: 100, value: o.strength, 'aria-label': 'Strength', oninput: (e) => { o.strength = +e.target.value; schedulePreview(); } });
    side.replaceChildren(el('.zk-section-title', 'Look'), modeSeg, el('.zk-section-title', 'Clean-up'), sw('shadow', 'Remove shadows'), sw('deskew', 'Straighten text'), sw('ocr', 'Recognise text (OCR)'), el('.zk-col', { style: { gap: '4px' } }, el('span.zk-label', o.mode === 'ink' ? 'Ink threshold' : 'Contrast'), sl), el('.zk-section-title', 'Page'),
      el('.zk-row', { style: { gap: '6px', flexWrap: 'wrap' } }, zk.btn({ icon: 'scan', label: 'Detect Edges', cls: 'bordered', onClick: () => { const p = cur(); const d = Scan.detect(p.src); p.corners = d.corners; p.found = d.found; renderMain(); if (!d.found) zk.toast('No clear page edge found. Drag the corners.'); } }), zk.btn({ icon: 'maximize', label: 'Whole Image', cls: 'bordered', onClick: () => { const p = cur(); p.corners = Scan.defaultCorners(p.src.width, p.src.height, 0); renderMain(); } }), zk.btn({ icon: 'rotate-cw', label: 'Rotate', cls: 'bordered', onClick: () => rotateSrc() })),
      el('p.zk-label', { style: { marginTop: 'auto', lineHeight: 1.4 } }, 'Everything happens on this computer. Drag the four corners onto the page edges, pick a look, then create the PDF.'));
  };
  const rotateSrc = () => { const p = cur(); const s = p.src; const c = mkCanvas(s.height, s.width); const x = c.getContext('2d'); x.translate(s.height, 0); x.rotate(Math.PI / 2); x.drawImage(s, 0, 0); p.corners = p.corners.map(([px, py]) => [s.height - py, px]); // keep TL,TR,BR,BL order
    p.corners = [p.corners[3], p.corners[0], p.corners[1], p.corners[2]]; freeCanvas(s); p.src = c; p.thumb = null; renderMain(); renderStrip(); };
  const renderMain = () => {
    const p = cur(); if (!p) return; main.replaceChildren(); const seg = el('.zk-seg.sc-view', ...[['frame', 'Frame'], ['result', 'Result']].map(([k, n]) => el('button', { 'aria-pressed': String(view === k), onclick: () => { view = k; renderMain(); } }, n)));
    stage = el('.sc-stage'); main.append(seg, stage); if (view === 'frame') frameView(p); else resultView(p);
  };
  const fitBox = (w, h) => { const r = stage.getBoundingClientRect(); const k = Math.min((r.width - 32) / w, (r.height - 32) / h, 1.5); return { k, w: w * k, h: h * k }; };
  const frameView = (p) => {
    const { k, w, h } = fitBox(p.src.width, p.src.height); const cv = mkCanvas(w * 2, h * 2); cv.getContext('2d').drawImage(p.src, 0, 0, cv.width, cv.height); cv.style.cssText = `width:${w}px;height:${h}px`;
    const poly = sv('polygon', { class: 'sc-poly' }); const svg = sv('svg', { width: w, height: h, class: 'sc-svg' }, poly); const box = el('.sc-box', { style: { width: w + 'px', height: h + 'px' } }, cv, svg);
    const hds = p.corners.map((c, i) => { const hd = el('.sc-h', { tabindex: 0, 'aria-label': ['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner' }); hd.addEventListener('pointerdown', (e) => { e.preventDefault(); hd.setPointerCapture(e.pointerId); box.classList.add('drag'); const lp = el('canvas.sc-loupe', { width: 220, height: 220 }); box.append(lp); const mv = (ev) => { const r = box.getBoundingClientRect(); const x = clamp((ev.clientX - r.left) / k, 0, p.src.width - 1), y = clamp((ev.clientY - r.top) / k, 0, p.src.height - 1); p.corners[i] = [x, y]; paint(); const lx = x * k, ly = y * k; lp.style.left = clamp(lx + (lx > w / 2 ? -250 : 30), 0, w - 220) + 'px'; lp.style.top = clamp(ly - 110, 0, h - 220) + 'px'; const lc = lp.getContext('2d'); lc.clearRect(0, 0, 220, 220); lc.save(); lc.beginPath(); lc.arc(110, 110, 108, 0, 7); lc.clip(); const sz = 74 / 1; lc.drawImage(p.src, x - sz / 2, y - sz / 2, sz, sz, 0, 0, 220, 220); lc.restore(); lc.strokeStyle = '#fff'; lc.lineWidth = 3; lc.beginPath(); lc.arc(110, 110, 108, 0, 7); lc.stroke(); lc.strokeStyle = 'rgba(255,107,107,.9)'; lc.lineWidth = 1.5; lc.beginPath(); lc.moveTo(98, 110); lc.lineTo(122, 110); lc.moveTo(110, 98); lc.lineTo(110, 122); lc.stroke(); }; const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); box.classList.remove('drag'); lp.remove(); p.thumb = null; schedulePreview(); }; hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); mv(e); });
      hd.addEventListener('keydown', (e) => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault(); const st = e.shiftKey ? 10 : 2; p.corners[i] = [clamp(p.corners[i][0] + d[0] * st / k, 0, p.src.width - 1), clamp(p.corners[i][1] + d[1] * st / k, 0, p.src.height - 1)]; paint(); schedulePreview(); }); return hd; });
    const paint = () => { poly.setAttribute('points', p.corners.map(([x, y]) => `${x * k},${y * k}`).join(' ')); hds.forEach((hd, i) => { hd.style.left = p.corners[i][0] * k + 'px'; hd.style.top = p.corners[i][1] * k + 'px'; }); };
    box.append(...hds); paint(); stage.append(box);
    if (!p.found && !p.shown) { p.shown = true; stage.append(el('.sc-hint', 'Couldn’t find the page edge automatically. Drag the corners onto the page.')); }
  };
  const resultView = async (p) => { stage.append(el('.zk-empty', { style: { height: '100%' } }, 'Processing…')); const t = ++busy; await sleep(20); if (t !== busy || !Scan.on || !p.src.width) return; const c = Scan.process(p, 1100); if (t !== busy || !stage.isConnected) return freeCanvas(c); const { w, h } = fitBox(c.width, c.height); c.style.cssText = `width:${w}px;height:${h}px;box-shadow:var(--shadow-2);background:#fff`; stage.replaceChildren(el('.sc-box', c)); const tk = 120 / Math.max(c.width, c.height); const th = mkCanvas(c.width * tk, c.height * tk); th.getContext('2d').drawImage(c, 0, 0, th.width, th.height); p.thumb = th.toDataURL('image/jpeg', 0.6); const img = strip.children[Scan.cur] && strip.children[Scan.cur].querySelector('img'); if (img) img.src = p.thumb; };
  const schedulePreview = () => { clearTimeout(prevT); prevT = setTimeout(() => { if (view === 'result') renderMain(); }, 140); };
  Scan.create = async () => {
    if (!Scan.pages.length) return; const pg = P.progress('Creating PDF'); Scan.ocrProgress = (m) => { if (m && m.status) pg.set(m.status.charAt(0).toUpperCase() + m.status.slice(1) + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '')); }; const L = PDFLib;
    try { const out = await L.PDFDocument.create(); for (let i = 0; i < Scan.pages.length; i++) { pg.set(`Page ${i + 1} of ${Scan.pages.length}`, i / Scan.pages.length); await sleep(10); const c = Scan.process(Scan.pages[i], 2400); const ink = Scan.opts.mode === 'ink'; const blob = await canvasBlob(c, ink ? 'image/png' : 'image/jpeg', 0.85); const bytes = new Uint8Array(await blob.arrayBuffer()); const img = ink ? await out.embedPng(bytes) : await out.embedJpg(bytes); const [pw, ph] = snapPaper(c.width, c.height); const page = out.addPage([pw, ph]); page.drawImage(img, { x: 0, y: 0, width: pw, height: ph }); if (Scan.ocrPage) { try { await Scan.ocrPage(out, page, c, pw, ph); } catch (e) { console.warn('ocr', e); Scan.ocrFailed = e.message; } } freeCanvas(c); }
      out.setProducer('ZengLook'); out.setTitle('Scan'); const bytes = await out.save(); pg.close(); Scan.close(false); await P.openUnsavedPdf(bytes, 'Scan'); if (Scan.ocrFailed) { zk.alert('Text recognition didn’t run', 'The pages were created without a text layer (' + Scan.ocrFailed + ').'); Scan.ocrFailed = null; } } catch (e) { pg.close(); console.error(e); zk.alert('Couldn’t create the PDF', e.message); }
  };
})();
