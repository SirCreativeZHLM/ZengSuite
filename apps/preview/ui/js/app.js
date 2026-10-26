/* ZengLook shell: document glue, toolbar, markup bar, sidebar, inspector, menus, keyboard. */
'use strict';
(async () => {
  await zeng.ready;
  const body = document.body;
  // Drops: the shell emits 'drop' (OS) separately from 'opened' (Finder/open-with). Mark drop deliveries.
  const emit0 = zeng._emit; zeng._emit = (n, d) => { if (n === 'drop') { P.fromDrop = true; try { emit0(n, d); } finally { P.fromDrop = false; } } else emit0(n, d); };
  addEventListener('drop', (e) => { P.fromDrop = true; P.dropTarget = e.target; P.dropY = e.clientY; setTimeout(() => { P.fromDrop = false; P.dropTarget = null; }, 0); }, true);
  addEventListener('dragover', (e) => { body.classList.add('dragging'); }, true); addEventListener('dragleave', (e) => { if (!e.relatedTarget) body.classList.remove('dragging'); }, true); addEventListener('drop', () => body.classList.remove('dragging'), true);

  // ---------- document ----------
  const openExts = ALL_EXTS;
  const doc = (P.doc = zeng.doc({
    name: 'Look', ext: 'pdf', filters: [{ name: 'PDF', exts: ['pdf'] }], openExts,
    blank: async () => { closeEverything(); },
    load: async (buf, ext, h) => {
      if (ext === 'pdf') { await Pdf.openBytes(new Uint8Array(buf), h.name, h); P.maxHist = 80; Img.open = false; P.mode = 'pdf'; P.resetHistory(); }
      else if (IMG_EXTS.includes(ext)) { await Img.openBuffer(buf, h); P.mode = 'image'; }
      else throw new Error('Look can’t open “.' + ext + '” files.');
      showMode();
    },
    save: async () => await P.saveBytes(),
    export: [],
    print: () => (P.mode === 'pdf' ? Pdf.print() : P.mode === 'image' ? printImage() : null),
    onOtherFiles: (hs) => { zk.alert('Can’t open this file', 'Look opens PDFs and images (' + ALL_EXTS.join(', ') + ').'); return true; },
  }));
  const kOpenHandle = doc.openHandle, kSave = doc.save, kSaveAs = doc.saveAs;
  doc.openHandle = async (h) => { const was = P.mode; await kOpenHandle(h); if (P.mode === 'image' && Img.handle === h) { doc.file = h; doc.refreshTitle(); } P.afterOpen && P.afterOpen(); };
  doc.save = async () => (P.mode === 'image' ? Img.save() : P.mode === 'pdf' ? kSave() : false);
  doc.saveAs = async () => (P.mode === 'image' ? Img.saveAsDialog() : P.mode === 'pdf' ? kSaveAs() : false);
  doc.open = async () => { const hs = await zeng.files.open({ multiple: true, filters: [{ name: 'PDFs and images', exts: ALL_EXTS }, { name: 'PDF', exts: ['pdf'] }, { name: 'Images', exts: IMG_EXTS }] }); if (!hs.length) return; const imgs = hs.filter((h) => IMG_EXTS.includes(extOf(h.name))); Img.custom = hs.length > 1 && imgs.length === hs.length ? imgs : null; await doc.openHandle(hs[0]); };
  const closeEverything = () => { Pdf.closeAll(); Img.open = false; Img.disp = null; Img.stage().replaceChildren(); Img.hideSheetView(); P.mode = null; P.selId = null; P.selPage = null; Pdf.cropState && Pdf.endCrop(); showMode(); };
  P.openUnsavedPdf = async (bytes, name) => { if (!(await doc.guard())) return; await Pdf.openBytes(bytes, name + '.pdf', null); Img.open = false; P.mode = 'pdf'; P.maxHist = 80; P.resetHistory(); doc.file = null; doc.untitled = name; showMode(); doc.setDirty(true); doc.refreshTitle(); };
  P.saveBytes = async () => {
    if (Pdf.pendingRedactions().length) { const r = await zk.sheet({ title: 'Redactions are not applied yet', message: 'Marked areas only cover the content. Apply them to remove it permanently, or save as plain black boxes that others can delete.', buttons: [{ label: 'Cancel', value: null }, { label: 'Save As Boxes', value: 'box' }, { label: 'Apply & Save', primary: true, value: 'apply' }] }); if (r === 'apply') { if (!(await Pdf.applyRedactions(false))) throw new Error('Saving cancelled'); } else if (r !== 'box') throw new Error('Saving cancelled'); }
    const pg = P.progress('Saving'); try { try { return await Pdf.build({ progress: (f) => pg.set(null, f) }); } catch (e) {
      if (e.code === 'ENCRYPTED') { pg.close(); const ok = await zk.confirm('This PDF is password protected', 'Look can’t rewrite encrypted PDFs. It can save a flattened copy instead, with every page as a picture (text is no longer selectable, markup is included).', 'Save Flattened Copy'); if (!ok) throw new Error('Saving cancelled'); const p2 = P.progress('Flattening'); try { return await Pdf.rasterBuild({ progress: (f, t) => p2.set(t, f) }); } finally { p2.close(); } }
      throw e; } } finally { pg.close(); }
  };
  const origSaveCfg = doc.cfg.save; doc.cfg.save = async (ext) => { try { return await origSaveCfg(ext); } catch (e) { if (e.message === 'Saving cancelled') { throw new Error('Saving was cancelled.'); } throw e; } };
  const printImage = async () => { const c = await Img.compose(); const b = await canvasBlob(c, 'image/png'); freeCanvas(c); const u = URL.createObjectURL(b); const r = $('#printroot'); r.replaceChildren(el('img.pp', { src: u })); await sleep(200); zeng.print(); setTimeout(() => { r.replaceChildren(); URL.revokeObjectURL(u); }, 60000); };

  // incoming files
  zeng.onFiles((hs) => {
    const ok = hs.filter((h) => openExts.includes(extOf(h.name))); if (!ok.length) return false;
    if (P.mode === 'pdf' && P.fromDrop) {
      const t = P.dropTarget; if (t && t.closest && t.closest('#sidebar')) { const at = Pdf.stripIndexAt ? Pdf.stripIndexAt(P.dropY) : Pdf.pages.length; Pdf.insertFiles(ok, at); return true; }
      Pdf.mergeOfferFor(ok); return true;
    }
    if (ok.length > 1 && ok.every((h) => IMG_EXTS.includes(extOf(h.name)))) Img.custom = ok; else Img.custom = null;
    return false;
  });

  // ---------- chrome ----------
  const tb = $('#tb'), tools = $('#tools'), findbar = $('#findbar'), sidebar = $('#sidebar'), inspector = $('#inspector'), status = $('#status');
  const ibtn = (icon, title, fn, extra = {}) => { const b = zk.btn({ icon, title, onClick: fn }); Object.assign(b, extra); return b; };
  const mkb = (icon, title, fn, only) => { const b = zk.btn({ icon, title, onClick: fn }); if (only) b.dataset.only = only; return b; };
  $('#stage').append(tools); tools.classList.remove('zk-secondary'); tools.classList.add('toolpill');
  const sbToggle = mkb('panel-left', 'Show or hide sidebar', () => toggleSidebar());
  const titleEl = el('.zk-title', { 'data-doc-title': '' }, 'Look');
  const pageIn = el('input.zk-input.num.selectable', { value: '1', 'aria-label': 'Page number', style: { width: '40px', textAlign: 'center' }, onkeydown: (e) => { if (e.key === 'Enter') { const n = parseInt(pageIn.value, 10); if (n) Pdf.goto(n - 1); pageIn.blur(); } else if (e.key === 'Escape') pageIn.blur(); e.stopPropagation(); }, onfocus: () => pageIn.select() });
  const pageOf = el('span.zk-label', { style: { whiteSpace: 'nowrap' } }, '/ 1');
  const pdfNav = el('.zk-group.navg', { 'data-only': 'pdf' }, mkb('chevron-up', 'Previous page', () => Pdf.goto(Pdf.cur - (Pdf.mode === 'two' ? 2 : 1))), pageIn, pageOf, mkb('chevron-down', 'Next page', () => Pdf.goto(Pdf.cur + (Pdf.mode === 'two' ? 2 : 1))));
  const imgNav = el('.zk-group', { 'data-only': 'image' }, mkb('chevron-left', 'Previous image', () => Img.step(-1)), mkb('chevron-right', 'Next image', () => Img.step(1)));
  const zoomBtn = el('button.zk-btn.bordered', { type: 'button', title: 'Zoom', 'aria-label': 'Zoom', style: { minWidth: '72px' }, onclick: () => zoomMenu(zoomBtn) }, '100%');
  const zoomG = el('.zk-group.zoomg', mkb('zoom-out', 'Zoom out', () => zoomStep(1 / 1.25)), zoomBtn, mkb('zoom-in', 'Zoom in', () => zoomStep(1.25)));
  const viewBtn = mkb('layout-list', 'Page layout', () => viewMenu(viewBtn), 'pdf');
  const findBtn = mkb('search', 'Find', () => toggleFind(true), 'pdf');
  const markBtn = mkb('pen-tool', 'Show or hide markup toolbar', () => toggleTools());
  const inspBtn = mkb('sliders-horizontal', 'Adjust and info', () => toggleInspector(), 'image');
  const moreBtn = mkb('ellipsis', 'More actions', () => moreMenu(moreBtn));
  const rotL = mkb('rotate-ccw', 'Rotate left', () => Img.rotate(-1), 'image'), rotR = mkb('rotate-cw', 'Rotate right', () => Img.rotate(1), 'image'), cropBtn = mkb('crop', 'Crop', () => Img.startCrop(), 'image');
  const sheetBtn = mkb('layout-grid', 'Contact sheet', () => (Img.sheetOn ? Img.hideSheetView() : Img.showSheetView()), 'image');
  tb.append(sbToggle, titleEl, el('.zk-spacer'), pdfNav, imgNav, zoomG, rotL, rotR, cropBtn, viewBtn, findBtn, sheetBtn, markBtn, inspBtn, moreBtn);

  const cleanTitleHook = () => { /* title element updated by kit */ };
  const zoomMenu = (anchor) => {
    const set = (z) => (P.mode === 'pdf' ? Pdf.setZoom(z) : Img.zoomCenter(z, true));
    const items = P.mode === 'pdf' ? [{ label: 'Fit Width', checked: Pdf.zoomMode === 'width', run: () => Pdf.setZoom(1, 'width') }, { label: 'Fit Page', checked: Pdf.zoomMode === 'page', run: () => Pdf.setZoom(1, 'page') }, { separator: true }, ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((z) => ({ label: z * 100 + '%', run: () => set(z) }))] : [{ label: 'Fit to Window', run: () => Img.fitView() }, { label: 'Actual Size', accel: 'CmdOrCtrl+0', run: () => set(1) }, { separator: true }, ...[0.25, 0.5, 2, 4, 8].map((z) => ({ label: z * 100 + '%', run: () => set(z) }))];
    zk.menu(items, { anchor });
  };
  const zoomStep = (f) => (P.mode === 'pdf' ? Pdf.zoomBy(f) : P.mode === 'image' ? Img.zoomCenter(f) : 0);
  const viewMenu = (anchor) => zk.menu([{ label: 'Continuous Scroll', checked: Pdf.mode === 'continuous', run: () => Pdf.setMode('continuous') }, { label: 'Single Page', checked: Pdf.mode === 'single', run: () => Pdf.setMode('single') }, { label: 'Two Pages', checked: Pdf.mode === 'two', run: () => Pdf.setMode('two') }, { separator: true }, { label: 'Reading Mode (Invert)', checked: Pdf.invert, run: toggleInvert }, { label: 'Presentation', accel: 'CmdOrCtrl+Alt+P', run: () => Pdf.present() }], { anchor, align: 'end' });
  const toggleInvert = () => { Pdf.invert = !Pdf.invert; $('#pdfscroll').classList.toggle('invert', Pdf.invert); Pdf.rerenderAll(); buildMenus(); };
  const moreMenu = (anchor) => zk.menu(P.mode === 'pdf' ? [
    { label: 'Rotate Left', run: () => Pdf.rotate([...Pdf.selected], -90) }, { label: 'Rotate Right', run: () => Pdf.rotate([...Pdf.selected], 90) }, { label: 'Crop Page…', run: () => Pdf.startCrop() }, { separator: true },
    { label: 'Insert Blank Page', run: () => Pdf.addBlank(Math.max(...Pdf.selected) + 1) }, { label: 'Insert Pages from File…', run: () => Pdf.insertFromDialog() }, { label: 'Extract Pages…', run: () => Pdf.extract([...Pdf.selected]) }, { label: 'Split by Range…', run: () => Pdf.splitSheet() }, { separator: true },
    { label: 'Compress…', run: () => Pdf.compressSheet() }, { label: 'Export Pages as Images…', run: () => Pdf.exportImagesSheet() }, { label: 'Document Info…', run: () => Pdf.infoSheet() }] : P.mode === 'image' ? [
    { label: 'Copy Image', run: () => Img.copy() }, { label: 'Resize & Export…', run: () => Img.saveAsDialog({ title: 'Resize & Export' }) }, { label: 'Slideshow', run: () => Img.slideshow() }, { label: 'Combine to PDF…', run: () => Img.combineToPdf() }] : [], { anchor, align: 'end' });

  // ---------- markup bar ----------
  const TOOLS = [
    { id: 'select', icon: 'mouse-pointer-2', label: 'Select', key: 'v' },
    { id: 'highlight', icon: 'highlighter', label: 'Highlight', key: 'h', only: 'pdf' }, { id: 'underline', icon: 'underline', label: 'Underline', key: 'u', only: 'pdf' }, { id: 'strike', icon: 'strikethrough', label: 'Strikethrough', key: 's', only: 'pdf' }, { sep: 1 },
    { id: 'note', icon: 'note', label: 'Note', key: 'n' }, { id: 'text', icon: 'text-box', label: 'Text Box', key: 't' }, { id: 'rect', icon: 'square', label: 'Rectangle', key: 'r' }, { id: 'ellipse', icon: 'circle', label: 'Ellipse', key: 'o' }, { id: 'line', icon: 'line-diag', label: 'Line', key: 'l' }, { id: 'arrow', icon: 'arrow-up-right', label: 'Arrow', key: 'a' }, { id: 'ink', icon: 'pen', label: 'Draw', key: 'd' }, { id: 'loupe', icon: 'loupe', label: 'Loupe', key: 'm', only: 'image' }, { sep: 1 },
    { id: 'sig', icon: 'sign', label: 'Sign', key: 'g' }, { id: 'redact', icon: 'redact', label: 'Redact', key: 'x' }, { id: 'erase', icon: 'eraser', label: 'Eraser (cover with white)', key: 'e', only: 'pdf' },
  ];
  const toolBtns = new Map();
  TOOLS.forEach((t) => { if (t.sep) { const s = el('.zk-sep', { 'data-only': t.only }); tools.append(s); return; } const b = zk.btn({ icon: t.icon, title: `${t.label} (${t.key.toUpperCase()})`, onClick: () => toolClick(t.id) }); b.addEventListener('pointerdown', (e) => e.preventDefault()); b.setAttribute('aria-pressed', 'false'); if (t.only) b.dataset.only = t.only; toolBtns.set(t.id, b); tools.append(b); });
  const styleBar = el('.zk-group.stylebar'); const undoB = ibtn('undo-2', 'Undo', () => P.undo()), redoB = ibtn('redo-2', 'Redo', () => P.redo());
  const applyRedBtn = zk.btn({ label: 'Apply Redactions', cls: 'bordered danger', onClick: () => Pdf.applyRedactions() }); applyRedBtn.dataset.only = 'pdf'; applyRedBtn.classList.add('zk-hidden');
  tools.append(el('.zk-sep'), styleBar, el('.zk-spacer'), applyRedBtn, undoB, redoB);
  const toolClick = (id) => {
    if (TEXT_MARKUP.has(id) && P.mode === 'pdf') { const sel = getSelection(); if (sel && !sel.isCollapsed && Ann.markupSelection(id, Pdf.pvs.filter((p) => p.canvas))) return; }
    if (Img.cropState) Img.endCrop(); if (Pdf.cropState) Pdf.endCrop(); if (id === 'sig' && P.mode) { Ann.setTool(id); return; } Ann.setTool(id);
  };
  P.onTool = (t) => { toolBtns.forEach((b, id) => b.setAttribute('aria-pressed', String(id === t))); renderStyle(); buildMenus(); };
  // markup from selection when a text-markup tool is armed
  $('#pdfscroll').addEventListener('pointerup', () => { if (TEXT_MARKUP.has(P.tool)) setTimeout(() => { const sel = getSelection(); if (sel && !sel.isCollapsed) Ann.markupSelection(P.tool, Pdf.pvs.filter((p) => p.canvas)); }, 0); });

  // contextual style controls
  const swatchBtn = (color, onPick) => { const b = el('button.zk-swatch', { type: 'button', style: { background: color || 'transparent', width: '20px', height: '20px', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }, title: 'Colour', onclick: () => colorPop(b, color, onPick) }); return b; };
  const colorPop = (anchor, cur, onPick, { none = false } = {}) => {
    const box = el('.colorpop', ...P.PAL.map((c) => el('button.zk-swatch' + (c === cur ? '.sel' : ''), { type: 'button', style: { background: c }, onclick: () => { onPick(c); zk.closePop(); } })), none ? el('button.zk-swatch', { type: 'button', title: 'None', style: { background: 'linear-gradient(135deg,transparent 45%,#ff3b30 45%,#ff3b30 55%,transparent 55%),var(--bg)' }, onclick: () => { onPick(null); zk.closePop(); } }) : null, el('input.zk-color', { type: 'color', value: cur || '#000000', title: 'Custom colour', oninput: (e) => onPick(e.target.value) }));
    zk.popover(anchor, box, { cls: 'colorpopwrap' });
  };
  const ctx = () => { const a = Ann.selected(); if (a) return { type: a.type, a }; return { type: P.tool, a: null }; };
  let styleTimer = 0;
  const upd = (patchSel, patchDef) => { const { a } = ctx(); Object.assign(P.style, patchDef || {}); if (a) { Object.assign(a, patchSel); Ann.redraw(P.selPage); clearTimeout(styleTimer); styleTimer = setTimeout(() => { P.pushHistory(); P.onAnnChange && P.onAnnChange(); }, 350); } renderStyle(); };
  const renderStyle = () => {
    const { type, a } = ctx(); const kids = []; const st = P.style;
    const colorFor = { highlight: [a ? a.color : st.color, (c) => upd({ color: c }, { color: c })], underline: [a ? a.color : st.markColor || '#ff6b6b', (c) => upd({ color: c }, { markColor: c })], strike: [a ? a.color : st.markColor || '#ff6b6b', (c) => upd({ color: c }, { markColor: c })], text: [a ? a.textColor : st.textColor, (c) => upd({ textColor: c }, { textColor: c })] };
    for (const k of ['rect', 'ellipse', 'line', 'arrow', 'ink']) colorFor[k] = [a ? a.color : st.stroke, (c) => upd({ color: c }, { stroke: c })]; colorFor.note = [a ? a.color : '#ffd23f', (c) => upd({ color: c }, {})];
    if (colorFor[type]) { const [c, fn] = colorFor[type]; kids.push(el('span.zk-label', 'Colour'), swatchBtn(c, fn)); }
    if (['rect', 'ellipse'].includes(type)) { const f = a ? a.fill : st.fill; kids.push(el('span.zk-label', 'Fill'), (() => { const b = el('button.zk-swatch', { type: 'button', title: 'Fill', style: { width: '20px', height: '20px', background: f || 'linear-gradient(135deg,transparent 45%,#ff3b30 45%,#ff3b30 55%,transparent 55%),var(--bg)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }, onclick: () => colorPop(b, f, (c) => upd({ fill: c }, { fill: c }), { none: true }) }); return b; })()); }
    if (['rect', 'ellipse', 'line', 'arrow', 'ink'].includes(type)) { const w = a ? a.width : st.width; const s = el('input.zk-range', { type: 'range', min: 1, max: 16, step: 0.5, value: w, style: { width: '80px' }, 'aria-label': 'Line width', oninput: () => upd({ width: +s.value }, { width: +s.value }) }); kids.push(el('span.zk-label', 'Width'), s); }
    if (['rect', 'ellipse', 'line', 'arrow'].includes(type)) { const d = a ? a.dash : st.dash; kids.push(el('.zk-seg', el('button', { 'aria-pressed': String(!d), title: 'Solid', onclick: () => upd({ dash: 0 }, { dash: 0 }) }, '—'), el('button', { 'aria-pressed': String(!!d), title: 'Dashed', onclick: () => upd({ dash: 1 }, { dash: 1 }) }, '- -'))); }
    if (type === 'text') { const sz = a ? a.size : st.size; const inp = el('input.zk-input.num.selectable', { type: 'number', min: 6, max: 144, value: Math.round(sz), style: { width: '52px' }, 'aria-label': 'Font size', oninput: () => { const v = clamp(+inp.value || 12, 6, 200); upd({ size: v }, { size: v }); if (a && P.selPage) { Ann.fitText(P.selPage, a); Ann.redraw(P.selPage); } } }); const fs = el('select.zk-select', { 'aria-label': 'Font', onchange: () => upd({ font: fs.value }, { font: fs.value }) }, ...[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([v, n]) => el('option', { value: v }, n))); fs.value = a ? a.font : st.font; const al = el('.zk-seg', ...['left', 'center', 'right'].map((v) => el('button', { 'aria-pressed': String((a ? a.align : 'left') === v), title: 'Align ' + v, onclick: () => upd({ align: v }, {}) }, zk.icon('align-' + v)))); const f = a ? a.fill : null; kids.push(inp, fs, al, el('span.zk-label', 'Fill'), (() => { const b = el('button.zk-swatch', { type: 'button', style: { width: '20px', height: '20px', background: f || 'linear-gradient(135deg,transparent 45%,#ff3b30 45%,#ff3b30 55%,transparent 55%),var(--bg)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }, onclick: () => colorPop(b, f, (c) => upd({ fill: c }, {}), { none: true }) }); return b; })()); }
    if (a && ['highlight', 'rect', 'ellipse', 'ink'].includes(type)) { const o = el('input.zk-range', { type: 'range', min: 0.15, max: 1, step: 0.05, value: a.opacity ?? 1, style: { width: '60px' }, 'aria-label': 'Opacity', oninput: () => upd({ opacity: +o.value }, {}) }); kids.push(el('span.zk-label', 'Opacity'), o); }
    if (a) kids.push(zk.btn({ icon: 'trash-2', title: 'Delete (⌫)', onClick: () => Ann.deleteSelected() }));
    if (a && a.type === 'sig' || (type === 'sig' && !a)) kids.push(zk.btn({ label: 'New Signature…', cls: 'bordered', onClick: async () => { await Ann.createSignature(); } }));
    styleBar.replaceChildren(...kids);
  };
  P.onSelect = (a) => { renderStyle(); buildMenus(); };
  P.onAnnChange = () => { updateStatus(); clearTimeout(P._al); P._al = setTimeout(() => { refreshMarkups(); applyRedBtn.classList.toggle('zk-hidden', !(P.mode === 'pdf' && Pdf.pendingRedactions().length)); }, 100); buildMenus(); };
  P.onHistory = () => { undoB.disabled = !P.canUndo(); redoB.disabled = !P.canRedo(); buildMenus(); };
  P.hooks.snap = () => (P.mode === 'pdf' ? Pdf.snap() : Img.snap()); P.hooks.restore = (s) => (P.mode === 'pdf' ? Pdf.restore(s) : Img.restore(s));
  const toggleTools = (on) => { const show = on ?? !P.toolsOn; P.toolsOn = show; tools.classList.toggle('zk-hidden', !show || !P.mode); markBtn.classList.toggle('on', show); zeng.store.set('toolsOn', show); };

  // ---------- sidebar ----------
  const TABS = { pdf: [['thumbs', 'layout-grid', 'Pages'], ['outline', 'list-tree', 'Outline'], ['marks', 'message-square', 'Markups'], ['search', 'search', 'Search results'], ['attach', 'paperclip', 'Attachments']], image: [['folder', 'images', 'Folder']] };
  let sbTab = 'thumbs'; let sbOn = true; const sbHead = el('.sbhead'), sbBody = el('.sbbody');
  sidebar.append(sbHead, sbBody);
  const toggleSidebar = (on) => { sbOn = on ?? !sbOn; applyLayout(); zeng.store.set('sbOn', sbOn); setTimeout(() => (P.mode === 'pdf' ? Pdf.relayout() : P.mode === 'image' && Img.fit && Img.fitView()), 30); };
  const applyLayout = () => { const showSb = sbOn && !!P.mode; sidebar.classList.toggle('zk-hidden', !showSb); $('#sb-resizer').classList.toggle('zk-hidden', !showSb); sbToggle.classList.toggle('on', showSb); };
  const setTab = (t) => { sbTab = t; renderSidebar(); };
  P.setTab = (t) => { sbOn = true; sbTab = t; applyLayout(); renderSidebar(); };
  const renderSidebar = () => {
    if (!P.mode) return; const tabs = TABS[P.mode].filter(([id]) => id !== 'attach' || P.hasAttach); if (!tabs.some(([id]) => id === sbTab)) sbTab = tabs[0][0];
    sbHead.classList.toggle('zk-hidden', tabs.length < 2); sbHead.replaceChildren(el('.zk-seg', ...tabs.map(([id, icon, label]) => el('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(id === sbTab), onclick: () => setTab(id) }, zk.icon(icon)))));
    sbBody.dataset.tab = sbTab; ({ thumbs: buildThumbs, outline: buildOutline, marks: refreshMarkups, search: buildSearchList, attach: buildAttach, folder: buildFolder })[sbTab]();
  };
  // resizer
  (() => { const r = $('#sb-resizer'); r.addEventListener('pointerdown', (e) => { r.setPointerCapture(e.pointerId); r.classList.add('active'); const w0 = sidebar.offsetWidth, x0 = e.clientX; const mv = (ev) => { sidebar.style.width = clamp(w0 + ev.clientX - x0, 150, 420) + 'px'; }; const up = () => { r.classList.remove('active'); r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up); zeng.store.set('sbW', sidebar.offsetWidth); P.mode === 'pdf' && Pdf.relayout(); }; r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up); }); })();

  // --- thumbnails ---
  const thumbCache = new Map(); let thumbIO = null; const THW = 120;
  const buildThumbs = () => {
    sbBody.replaceChildren(); const list = el('.thumbs', { tabindex: 0, role: 'listbox', 'aria-label': 'Pages' }); sbBody.append(list); thumbIO && thumbIO.disconnect();
    thumbIO = new IntersectionObserver((es) => es.forEach((e) => { const th = e.target; if (e.isIntersecting) drawThumb(th); else { const c = th.querySelector('canvas'); if (c) { thumbCache.delete(th.dataset.key); freeCanvas(c); c.remove(); } } }), { root: sbBody, rootMargin: '500px 0px' });
    Pdf.pages.forEach((d, i) => { const v = Pdf.vpFor(d, 1); const h = Math.round((THW * v.height) / v.width); const th = el('.th' + (Pdf.selected.has(i) ? '.sel' : '') + (i === Pdf.cur ? '.cur' : ''), { 'data-i': i, role: 'option', 'aria-selected': String(Pdf.selected.has(i)) }, el('.thp', { style: { width: THW + 'px', height: h + 'px' } }), el('.thn', String(i + 1))); th.dataset.key = d.id + ':' + d.rot + ':' + (d.crop || '') + ':' + d.src + ':' + d.idx; th.dataset.h = h; list.append(th); thumbIO.observe(th); });
    list.addEventListener('pointerdown', thumbDown); list.addEventListener('contextmenu', (e) => { const th = e.target.closest('.th'); if (!th) return; const i = +th.dataset.i; if (!Pdf.selected.has(i)) { Pdf.selected = new Set([i]); markThumbs(); } thumbMenu(e); });
    list.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delPages(); } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); Pdf.selected = new Set(Pdf.pages.map((_, i) => i)); markThumbs(); } });
  };
  const drawThumb = async (th) => {
    const i = +th.dataset.i; const d = Pdf.pages[i]; if (!d || th.querySelector('canvas')) return; const key = th.dataset.key; const box = th.firstChild;
    if (thumbCache.has(key)) { box.append(thumbCache.get(key)); return; }
    try { const dpr = devicePixelRatio || 1; const v1 = Pdf.vpFor(d, 1); const s = (THW * dpr) / v1.width; const c = document.createElement('canvas'); const v = Pdf.vpFor(d, s); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height); box.append(c); thumbCache.set(key, c);
      if (!d.blank) { const page = await Pdf.getPage(d); if (!th.isConnected) return; const ctx2 = c.getContext('2d', { alpha: false }); await Pdf.enqueue(() => page.render({ canvas: c, canvasContext: ctx2, viewport: v }).promise, -1); } else { const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } } catch (e) { if (!(e && e.name === 'RenderingCancelledException')) console.warn('thumb', e); }
  };
  const markThumbs = () => { $$('.th', sbBody).forEach((th) => { const i = +th.dataset.i; th.classList.toggle('sel', Pdf.selected.has(i)); th.classList.toggle('cur', i === Pdf.cur); th.setAttribute('aria-selected', String(Pdf.selected.has(i))); }); };
  let thumbAnchor = 0;
  const thumbDown = (e) => {
    const th = e.target.closest('.th'); if (!th || e.button !== 0) return; const i = +th.dataset.i; const list = th.parentElement; list.focus({ preventScroll: true });
    if (e.shiftKey) { const a = thumbAnchor, b = i; Pdf.selected = new Set(Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => Math.min(a, b) + k)); } else if (e.metaKey || e.ctrlKey) { Pdf.selected.has(i) ? Pdf.selected.delete(i) : Pdf.selected.add(i); thumbAnchor = i; } else if (!Pdf.selected.has(i)) { Pdf.selected = new Set([i]); thumbAnchor = i; }
    markThumbs(); const moved = { v: false }; const x0 = e.clientX, y0 = e.clientY; let ghost = null, line = null, to = i; const ths = () => $$('.th', list);
    const dropIndex = (y) => { const all = ths(); for (let k = 0; k < all.length; k++) { const r = all[k].getBoundingClientRect(); if (y < r.top + r.height / 2) return k; } return all.length; };
    Pdf.stripIndexAt = (y) => dropIndex(y);
    const mv = (ev) => { if (!moved.v && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; if (!moved.v) { moved.v = true; if (!Pdf.selected.has(i)) { Pdf.selected = new Set([i]); markThumbs(); } ghost = th.cloneNode(true); ghost.classList.add('ghost'); if (Pdf.selected.size > 1) ghost.append(el('.badge', String(Pdf.selected.size))); document.body.append(ghost); line = el('.dropline'); list.append(line); body.classList.add('reordering'); }
      ghost.style.left = ev.clientX - 40 + 'px'; ghost.style.top = ev.clientY - 40 + 'px'; to = dropIndex(ev.clientY); const all = ths(); const ref = all[to]; const ly = ref ? ref.offsetTop - 4 : all[all.length - 1].offsetTop + all[all.length - 1].offsetHeight + 2; line.style.top = ly + 'px';
      const sr = sbBody.getBoundingClientRect(); if (ev.clientY < sr.top + 40) sbBody.scrollTop -= 14; else if (ev.clientY > sr.bottom - 40) sbBody.scrollTop += 14; };
    const up = (ev) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); body.classList.remove('reordering'); ghost && ghost.remove(); line && line.remove(); if (moved.v) { const sr = sidebar.getBoundingClientRect(); if (ev.clientX >= sr.left - 20 && ev.clientX <= sr.right + 20) Pdf.movePages([...Pdf.selected], to); } else { if (!e.shiftKey && !e.metaKey && !e.ctrlKey) { Pdf.selected = new Set([i]); markThumbs(); } Pdf.goto(i); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  const delPages = () => { const sel = [...Pdf.selected]; if (!sel.length) return; if (sel.length >= Pdf.pages.length) { zk.toast('A PDF needs at least one page'); return; } Pdf.deletePages(sel); };
  const thumbMenu = (e) => zk.contextMenu(e, [{ label: 'Rotate Left', run: () => Pdf.rotate([...Pdf.selected], -90) }, { label: 'Rotate Right', run: () => Pdf.rotate([...Pdf.selected], 90) }, { separator: true }, { label: 'Insert Blank Page After', run: () => Pdf.addBlank(Math.max(...Pdf.selected) + 1) }, { label: 'Insert Pages from File…', run: () => Pdf.insertFromDialog(Math.max(...Pdf.selected) + 1) }, { label: 'Extract Pages…', run: () => Pdf.extract([...Pdf.selected]) }, { separator: true }, { label: 'Delete Pages', run: delPages }]);
  P.onStructure = () => { if (P.mode === 'pdf') { updateStatus(); if (sbTab === 'thumbs') buildThumbs(); pageOf.textContent = '/ ' + Pdf.pages.length; } };
  P.onPage = () => { pageIn.value = String(Pdf.cur + 1); if (document.activeElement !== pageIn) pageIn.value = String(Pdf.cur + 1); if (sbTab === 'thumbs') { const sel = Pdf.selected; if (sel.size <= 1) Pdf.selected = new Set([Pdf.cur]); markThumbs(); const th = $(`.th[data-i="${Pdf.cur}"]`, sbBody); if (th) { const r = th.getBoundingClientRect(), s = sbBody.getBoundingClientRect(); if (r.top < s.top || r.bottom > s.bottom) sbBody.scrollTop += r.top - s.top - s.height / 3; } } updateStatus(); };

  // --- outline ---
  const buildOutline = () => {
    sbBody.replaceChildren(); const items = Pdf.outline; if (!items) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, 'Loading…')); return; } if (!items.length) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, el('strong', 'No Outline'), 'This PDF has no bookmarks.')); return; }
    const mk = (list, depth) => list.map((it) => { const row = el('.ol', { style: { paddingLeft: 6 + depth * 14 + 'px' }, tabindex: 0, role: 'treeitem' }); const kids = it.items && it.items.length ? el('div') : null; const tw = el('span.tw' + (kids ? '' : '.leaf'), { onclick: (e) => { e.stopPropagation(); const open = kids.classList.toggle('zk-hidden'); tw.classList.toggle('open', !open); } }, zk.icon('chevron-right', 11)); if (kids) { kids.append(...mk(it.items, depth + 1)); if (depth > 0) { kids.classList.add('zk-hidden'); } else tw.classList.add('open'); } row.append(tw, el('span.ot', { style: { fontWeight: it.bold ? 600 : 400, fontStyle: it.italic ? 'italic' : 'normal' } }, it.title || '(untitled)')); row.onclick = () => { if (it.dest) Pdf.goDest(it.dest); else if (it.url) zeng.isNative ? zeng.call('open_url', { url: it.url }) : window.open(it.url, '_blank', 'noopener'); }; return kids ? [row, kids] : [row]; }).flat();
    sbBody.append(el('.outline', mk(items, 0)));
  };
  P.onOutline = () => { if (sbTab === 'outline') buildOutline(); };

  // --- markups list ---
  const ANN_ICON = { highlight: 'highlighter', underline: 'underline', strike: 'strikethrough', note: 'note', text: 'text-box', rect: 'square', ellipse: 'circle', line: 'line-diag', arrow: 'arrow-up-right', ink: 'pen', sig: 'sign', redact: 'redact', erase: 'eraser', loupe: 'loupe' };
  const ANN_NAME = { highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', note: 'Note', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', ink: 'Drawing', sig: 'Signature', redact: 'Redaction', erase: 'Eraser', loupe: 'Loupe' };
  const allAnns = () => (P.mode === 'pdf' ? Pdf.allAnns() : Img.anns.map((a) => ({ i: 0, a })));
  function refreshMarkups() {
    if (sbTab !== 'marks' || !P.mode) return; const list = allAnns(); sbBody.replaceChildren(); if (!list.length) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, el('strong', 'No Markups'), 'Highlights, notes and shapes you add appear here.')); return; }
    sbBody.append(el('.marks', ...list.map(({ i, a }) => { const row = el('.mk' + (a.id === P.selId ? '.sel' : ''), { tabindex: 0, onclick: () => jumpTo(i, a) }, el('span.mi', { style: { color: ['highlight', 'note'].includes(a.type) || a.type === 'underline' ? a.color : 'var(--fg-2)' } }, zk.icon(ANN_ICON[a.type] || 'pen', 15)), el('.mt', el('.mn', ANN_NAME[a.type] + (a.text && !['text'].includes(a.type) ? ' · ' : ''), el('span.zk-label', (a.text || '').slice(0, 80))), a.type === 'text' ? el('.zk-label', { style: { whiteSpace: 'normal' } }, (a.text || '').slice(0, 90)) : null), P.mode === 'pdf' ? el('.zk-meta', 'p. ' + (i + 1)) : null, zk.btn({ icon: 'x', title: 'Delete', onClick: (e) => { e.stopPropagation(); const pv = P.mode === 'pdf' ? Pdf.pvs[i] : Img.pv; Ann.remove(pv, a.id); } })); return row; })));
  }
  const jumpTo = (i, a) => { if (P.mode === 'pdf') { Pdf.goto(i); const pv = Pdf.pvs[i]; setTimeout(() => { Ann.select(a.id, pv); const bb = Ann.bbox(a); if (pv.vp) { const [, y] = pv.vp.toV(bb.x0, bb.y1 > bb.y0 ? bb.y1 : bb.y0); const [, y2] = pv.vp.toV(bb.x0, bb.y0); const top = Math.min(y, y2); const sc = $('#pdfscroll'); const r = pv.el.getBoundingClientRect(), s = sc.getBoundingClientRect(); sc.scrollTop += r.top + top - s.top - s.height / 3; } }, 60); } else { Ann.select(a.id, Img.pv); } };

  // --- search ---
  const buildSearchList = () => {
    sbBody.replaceChildren(); if (!Pdf.query) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, el('strong', 'Search'), 'Press ⌘F to find text in this PDF.')); return; } if (!Pdf.hits.length) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, el('strong', 'No Results'), `Nothing matches “${Pdf.query}”.`)); return; }
    const q = Pdf.query.toLowerCase(); let lastPage = -1; const rows = []; Pdf.hits.slice(0, 1500).forEach((h, k) => { if (h.di !== lastPage) { rows.push(el('.zk-heading', 'Page ' + (h.di + 1))); lastPage = h.di; } const s = h.snip; const at = s.toLowerCase().indexOf(q); const row = el('.hit-row' + (k === Pdf.hitIdx ? '.sel' : ''), { onclick: () => Pdf.gotoHit(k) }, at >= 0 ? [s.slice(0, at), el('b', s.slice(at, at + q.length)), s.slice(at + q.length)] : s); rows.push(row); });
    sbBody.append(el('.hits-list', rows)); const cur = $('.hit-row.sel', sbBody); cur && cur.scrollIntoView({ block: 'nearest' });
  };
  const countEl = el('span.zk-label', { style: { minWidth: '70px' } }); const qIn = el('input.zk-input.selectable', { placeholder: 'Find in document', style: { width: '240px' }, 'aria-label': 'Find' }); let csOn = false;
  const csBtn = zk.btn({ icon: 'case-sensitive', title: 'Match case', onClick: () => { csOn = !csOn; csBtn.classList.toggle('on', csOn); runSearch(); } });
  const runSearch = () => Pdf.search(qIn.value, { cs: csOn, onProgress: (f, n) => { countEl.textContent = f < 1 ? `Searching… ${n}` : n ? `${Pdf.hitIdx + 1} of ${n}${n >= 5000 ? '+' : ''}` : 'No results'; } }).then(() => { countEl.textContent = Pdf.hits.length ? `${Pdf.hitIdx + 1} of ${Pdf.hits.length}${Pdf.hits.length >= 5000 ? '+' : ''}` : qIn.value ? 'No results' : ''; });
  qIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (qIn._last !== qIn.value + csOn) { qIn._last = qIn.value + csOn; runSearch(); } else Pdf.gotoHit(Pdf.hitIdx + (e.shiftKey ? -1 : 1)); } else if (e.key === 'Escape') toggleFind(false); });
  qIn.addEventListener('input', zk.debounce(() => { qIn._last = qIn.value + csOn; runSearch(); }, 350));
  findbar.append(qIn, csBtn, zk.btn({ icon: 'chevron-up', title: 'Previous match', onClick: () => Pdf.gotoHit(Pdf.hitIdx - 1) }), zk.btn({ icon: 'chevron-down', title: 'Next match', onClick: () => Pdf.gotoHit(Pdf.hitIdx + 1) }), countEl, el('.zk-spacer'), zk.btn({ icon: 'x', title: 'Close find', onClick: () => toggleFind(false) }));
  const toggleFind = (on) => { if (P.mode !== 'pdf') return; findbar.classList.toggle('zk-hidden', !on); if (on) { qIn.focus(); qIn.select(); } else { Pdf.search(''); qIn.value = ''; countEl.textContent = ''; } };
  P.onHits = () => { if (sbTab === 'search') buildSearchList(); if (Pdf.hits.length) countEl.textContent = `${Pdf.hitIdx + 1} of ${Pdf.hits.length}${Pdf.hits.length >= 5000 ? '+' : ''}`; if (Pdf.hits.length && sbTab !== 'search' && Pdf.hitIdx === 0 && !P._hitTab) { P._hitTab = true; } };

  // --- attachments ---
  const buildAttach = async () => { sbBody.replaceChildren(); const at = await Pdf.attachments(); if (!at.length) { sbBody.append(el('.zk-empty', { style: { height: 'auto', padding: '30px 10px' } }, el('strong', 'No Attachments'))); return; } sbBody.append(el('.marks', ...at.map((a) => el('.mk', el('span.mi', zk.icon('paperclip', 15)), el('.mt', el('.mn', a.filename), el('.zk-label', fmtBytes(a.content.length))), zk.btn({ icon: 'download', title: 'Save…', onClick: () => Pdf.saveAttachment(a) }))))); };

  // --- image folder list ---
  const buildFolder = () => {
    sbBody.replaceChildren(); const list = el('.folder'); sbBody.append(list); const io = new IntersectionObserver((es) => es.forEach((e) => { const im = e.target.querySelector('img'); if (e.isIntersecting) { if (!im.src) im.src = zeng.files.url(im._h); } else if (im.src) im.removeAttribute('src'); }), { root: sbBody, rootMargin: '300px' });
    Img.folder.forEach((f, i) => { const im = el('img', { decoding: 'async', draggable: false, alt: '' }); im._h = f; const row = el('.fi' + (i === Img.idx ? '.cur' : ''), { title: f.name, onclick: () => { if (i !== Img.idx) { Img.idx = i; doc.openHandle(f); } } }, el('.fth', im), el('.fn', f.name)); list.append(row); io.observe(row); }); const cur = list.children[Img.idx]; cur && cur.scrollIntoView({ block: 'center' });
  };
  P.onFolder = () => { if (P.mode === 'image' && sbTab === 'folder') buildFolder(); imgNav.style.display = Img.folder.length > 1 ? '' : 'none'; sheetBtn.style.display = Img.folder.length > 1 ? '' : 'none'; };
  P.onSheet = () => buildMenus();

  // ---------- image inspector ----------
  let inspTab = 'adjust'; let inspOn = false;
  const toggleInspector = (on) => { inspOn = on ?? !inspOn; inspector.classList.toggle('zk-hidden', !(inspOn && P.mode === 'image')); inspBtn.classList.toggle('on', inspOn); if (inspOn) renderInspector(); zeng.store.set('inspOn', inspOn); setTimeout(() => Img.open && Img.fit && Img.fitView(), 30); };
  const SL = [['exposure', 'Exposure', -2, 2, 0.05], ['contrast', 'Contrast', -100, 100, 1], ['saturation', 'Saturation', -100, 100, 1], ['temperature', 'Temperature', -100, 100, 1], ['sharpen', 'Sharpen', 0, 100, 1]];
  const renderInspector = () => {
    if (!inspOn || P.mode !== 'image') return; inspector.replaceChildren(el('.sbhead', el('.zk-seg', ...[['adjust', 'Adjust'], ['info', 'Info']].map(([k, n]) => el('button', { 'aria-pressed': String(k === inspTab), onclick: () => { inspTab = k; renderInspector(); } }, n)))));
    if (inspTab === 'adjust') {
      const sec = el('.zk-section'); let raf1 = 0;
      SL.forEach(([k, label, min, max, step]) => { const val = el('span.zk-label', { style: { width: '38px', textAlign: 'right' } }, String(Img.adj[k])); const s = el('input.zk-range', { type: 'range', min, max, step, value: Img.adj[k], 'aria-label': label, 'data-k': k, ondblclick: () => { s.value = 0; s.oninput(); s.onchange(); } });
        s.oninput = () => { Img.adj[k] = +s.value; val.textContent = String(+s.value); Img.ensureEditable(); cancelAnimationFrame(raf1); raf1 = requestAnimationFrame(() => { Img.adjusted = null; Img.refresh(); }); P.onImgState && P.onImgState(); }; s.onchange = () => { P.pushHistory(); Img.refresh(); };
        sec.append(el('.zk-col', { style: { gap: '4px' } }, el('.zk-field', { style: { minHeight: '18px' } }, el('span.zk-label', label), val), s)); });
      sec.append(el('.zk-row', { style: { gap: '8px', marginTop: '6px' } }, zk.btn({ label: 'Reset', cls: 'bordered', onClick: () => { Img.adj = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, sharpen: 0 }; Img.adjusted = null; Img.refresh(); P.pushHistory(); renderInspector(); } }), zk.btn({ label: 'Auto', cls: 'bordered', onClick: autoAdjust })));
      inspector.append(sec);
    } else {
      const sec = (title, rows) => el('.zk-section', el('.zk-section-title', title), ...rows.map(([a, b]) => el('.zk-field', { style: { alignItems: 'flex-start' } }, el('span.zk-label', a), el('span.selectable', { style: { fontSize: '12px', textAlign: 'right', overflowWrap: 'anywhere', maxWidth: '150px' } }, String(b)))));
      const f = Img.handle || {}; inspector.append(sec('File', [['Name', Img.name], ['Size', Img.orig ? fmtBytes(Img.orig.byteLength) : ''], ['Type', (Img.ext || '').toUpperCase()], ['Pixels', `${Img.base.width} × ${Img.base.height}`], ['Megapixels', ((Img.base.width * Img.base.height) / 1e6).toFixed(1)], ...(f.modified ? [['Modified', new Date(f.modified).toLocaleString()]] : [])]));
      const secs = P.exif.sections(Img.exif); if (!secs.length) inspector.append(el('.zk-section', el('span.zk-label', 'No EXIF metadata in this image.'))); secs.forEach((s) => inspector.append(sec(s.title, s.rows)));
    }
  };
  const autoAdjust = () => { const c = mkCanvas(200, Math.max(1, Math.round((200 * Img.base.height) / Img.base.width))); const x = c.getContext('2d'); x.drawImage(Img.base, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data; const hist = new Uint32Array(256); for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; const total = d.length / 4; let lo = 0, hi = 255, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.01) { lo = v; break; } } acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.01) { hi = v; break; } } let mean = 0; for (let v = 0; v < 256; v++) mean += v * hist[v]; mean /= total; Img.adj.contrast = clamp(Math.round((255 / Math.max(40, hi - lo) - 1) * 60), 0, 60); Img.adj.exposure = clamp(+(Math.log2(118 / Math.max(30, mean))).toFixed(2), -1.2, 1.2); Img.adj.saturation = 8; Img.adjusted = null; Img.refresh(); P.pushHistory(); renderInspector(); };
  P.onImgState = () => { updateStatus(); };

  // ---------- empty state / mode ----------
  const empty = $('#empty'); empty.append(el('.dropzone', zk.icon('file-up', 34), el('div.dz-title', 'Open a PDF or image'), el('div.zk-label', 'Drop a file here, or choose one'), zk.btn({ label: 'Open…', cls: 'primary lg', onClick: () => doc.open() })));
  function showMode() {
    const m = P.mode; body.dataset.mode = m || 'none'; $('#empty').classList.toggle('zk-hidden', !!m); $('#pdfscroll').classList.toggle('zk-hidden', m !== 'pdf'); $('#imgstage').classList.toggle('zk-hidden', m !== 'image' || Img.sheetOn); if (m !== 'image') $('#sheetview').classList.add('zk-hidden');
    tools.classList.toggle('zk-hidden', !(m && P.toolsOn)); markBtn.classList.toggle('on', !!P.toolsOn); findbar.classList.add('zk-hidden'); inspector.classList.toggle('zk-hidden', !(inspOn && m === 'image'));
    $$('[data-only]').forEach((n) => { const o = n.dataset.only; n.style.display = !m ? 'none' : o && o !== m ? 'none' : ''; }); zoomG.style.display = m ? '' : 'none'; markBtn.style.display = m ? '' : 'none'; moreBtn.style.display = m ? '' : 'none';
    if (m === 'image') { P.onFolder(); } if (m === 'pdf') { pageOf.textContent = '/ ' + Pdf.pages.length; pageIn.value = String(Pdf.cur + 1); P.hasAttach = false; Pdf.attachments().then((a) => { P.hasAttach = a.length > 0; renderSidebar(); }); }
    Ann.setTool('select'); applyLayout(); renderSidebar(); renderStyle(); updateStatus(); buildMenus(); P.onHistory(); if (m === 'image' && inspOn) renderInspector(); P.onAnnChange(); zk.closePop();
    if (m === 'pdf') { requestAnimationFrame(() => { Pdf.relayout(true); }); $('#pdfscroll').focus({ preventScroll: true }); }
  }
  P.afterOpen = () => { if (P.mode === 'image') { if (sbTab === 'folder') buildFolder(); renderInspector(); } };
  P.hideSheet = () => {}; P.refreshChrome = () => { buildMenus(); };
  P.onZoom = () => { if (P.mode === 'pdf') zoomBtn.textContent = Pdf.zoomMode === 'width' ? 'Fit Width · ' + Math.round(Pdf.zoom * 100) + '%' : Pdf.zoomMode === 'page' ? 'Fit Page · ' + Math.round(Pdf.zoom * 100) + '%' : Math.round(Pdf.zoom * 100) + '%'; else if (P.mode === 'image') zoomBtn.textContent = Math.round(Img.view.z * 100) + '%'; updateStatus(); };
  const updateStatus = () => {
    if (P.mode === 'pdf') status.replaceChildren(el('span', `Page ${Pdf.cur + 1} of ${Pdf.pages.length}`), el('span', Pdf.sources[0] ? fmtBytes(Pdf.sources[0].bytes.length) : ''), el('.zk-spacer'), el('span', `${Pdf.allAnns().length} markup${Pdf.allAnns().length === 1 ? '' : 's'}`), el('span', Math.round(Pdf.zoom * 100) + '%'));
    else if (P.mode === 'image') status.replaceChildren(...[el('span', `${Img.base.width} × ${Img.base.height} px`), el('span', Img.orig ? fmtBytes(Img.orig.byteLength) : ''), el('.zk-spacer'), Img.folder.length > 1 ? el('span', `${Img.idx + 1} of ${Img.folder.length}`) : null, el('span', Math.round(Img.view.z * 100) + '%')].filter(Boolean)); else status.replaceChildren(el('span', 'Ready'));
  };

  // ---------- menus ----------
  const M = (label, run, o = {}) => ({ label, run, ...o });
  function buildMenus() {
    clearTimeout(buildMenus.t); buildMenus.t = setTimeout(() => {
      const pdf = P.mode === 'pdf', img = P.mode === 'image', any = !!P.mode; const a = Ann.selected(); const mac = zeng.platform === 'mac';
      const toolItems = TOOLS.filter((t) => !t.sep && (!t.only || (t.only === P.mode))).map((t) => M(t.label, () => toolClick(t.id), { checked: P.tool === t.id, enabled: any }));
      const file = [M('Open…', doc.open, { accel: 'CmdOrCtrl+O' }), { label: 'Open Recent', submenu: doc.recents.length ? [...doc.recents.map((r) => M(r.name, () => doc.openHandle(r))), { separator: true }, M('Clear Menu', async () => { doc.recents = []; await zeng.store.set('recents', []); buildMenus(); })] : [{ label: 'No Recent Documents', enabled: false }] }, M('Close', () => doc.new(), { accel: 'CmdOrCtrl+W', enabled: any }), { separator: true },
        M('Save', doc.save, { accel: 'CmdOrCtrl+S', enabled: any }), M('Save As…', doc.saveAs, { accel: 'CmdOrCtrl+Shift+S', enabled: any }),
        { label: 'Export', enabled: any, submenu: pdf ? [M('Flattened PDF…', exportFlat), M('Pages as Images…', () => Pdf.exportImagesSheet()), M('Extract Selected Pages…', () => Pdf.extract([...Pdf.selected])), M('Split by Range…', () => Pdf.splitSheet()), M('Compressed Copy…', () => Pdf.compressSheet())] : [M('Resize & Export…', () => Img.saveAsDialog({ title: 'Resize & Export' }))] },
        M('Combine Images to PDF…', () => Img.combineToPdf()), { separator: true }, M('Document Info…', () => Pdf.infoSheet(), { enabled: pdf }), M('Print…', () => doc.cfg.print(), { accel: 'CmdOrCtrl+P', enabled: any }),
        ...(mac && zeng.isNative ? [] : [{ separator: true }, M('Exit', () => zeng.quit(), { accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q' })])];
      const edit = zeng.stdEdit({ undo: () => P.undo(), redo: () => P.redo(), extra: [M('Delete', () => (a ? Ann.deleteSelected() : pdf && delPages()), { accel: 'Delete', enabled: !!a || pdf }), M('Select All Pages', () => { Pdf.selected = new Set(Pdf.pages.map((_, i) => i)); markThumbs(); }, { enabled: pdf }), { separator: true }, M('Find…', () => toggleFind(true), { accel: 'CmdOrCtrl+F', enabled: pdf }), M('Find Next', () => Pdf.gotoHit(Pdf.hitIdx + 1), { accel: 'CmdOrCtrl+G', enabled: pdf }), M('Find Previous', () => Pdf.gotoHit(Pdf.hitIdx - 1), { accel: 'CmdOrCtrl+Shift+G', enabled: pdf }), { separator: true }, M('Copy Image', () => Img.copy(), { enabled: img })] });
      const view = [M('Sidebar', () => toggleSidebar(), { checked: sbOn && any, accel: 'CmdOrCtrl+Alt+S', enabled: any }), M('Markup Toolbar', () => toggleTools(), { checked: !!P.toolsOn, enabled: any }), M('Adjust & Info', () => toggleInspector(), { checked: inspOn, enabled: img }), { separator: true },
        M('Continuous Scroll', () => Pdf.setMode('continuous'), { checked: pdf && Pdf.mode === 'continuous', enabled: pdf }), M('Single Page', () => Pdf.setMode('single'), { checked: pdf && Pdf.mode === 'single', enabled: pdf }), M('Two Pages', () => Pdf.setMode('two'), { checked: pdf && Pdf.mode === 'two', enabled: pdf }), { separator: true },
        M('Zoom In', () => zoomStep(1.25), { accel: 'CmdOrCtrl+Plus', enabled: any }), M('Zoom Out', () => zoomStep(1 / 1.25), { accel: 'CmdOrCtrl+-', enabled: any }), M(pdf ? 'Actual Size' : 'Actual Size', () => (pdf ? Pdf.setZoom(1) : Img.zoomCenter(1, true)), { accel: 'CmdOrCtrl+0', enabled: any }), M('Fit Width', () => Pdf.setZoom(1, 'width'), { accel: 'CmdOrCtrl+1', enabled: pdf }), M('Fit Page', () => (pdf ? Pdf.setZoom(1, 'page') : Img.fitView()), { accel: 'CmdOrCtrl+2', enabled: any }), { separator: true },
        M('Reading Mode (Invert)', toggleInvert, { checked: Pdf.invert, accel: 'CmdOrCtrl+Shift+I', enabled: pdf }), M('Presentation', () => Pdf.present(), { accel: 'CmdOrCtrl+Alt+P', enabled: pdf }), M('Slideshow', () => Img.slideshow(), { accel: 'CmdOrCtrl+Alt+P', enabled: img && Img.folder.length > 0 }), M('Contact Sheet', () => (Img.sheetOn ? Img.hideSheetView() : Img.showSheetView()), { checked: Img.sheetOn, accel: 'CmdOrCtrl+Shift+G', enabled: img && Img.folder.length > 1 })];
      const go = [M('Next Page', () => Pdf.goto(Pdf.cur + 1), { accel: 'Right', enabled: pdf }), M('Previous Page', () => Pdf.goto(Pdf.cur - 1), { accel: 'Left', enabled: pdf }), M('First Page', () => Pdf.goto(0), { accel: 'Home', enabled: pdf }), M('Last Page', () => Pdf.goto(1e9), { accel: 'End', enabled: pdf }), M('Go to Page…', goToPage, { accel: 'CmdOrCtrl+Alt+G', enabled: pdf }), { separator: true }, M('Next Image', () => Img.step(1), { accel: 'Right', enabled: img && Img.folder.length > 1 }), M('Previous Image', () => Img.step(-1), { accel: 'Left', enabled: img && Img.folder.length > 1 })];
      const toolsM = [...toolItems, { separator: true }, M('Apply Redactions…', () => Pdf.applyRedactions(), { enabled: pdf && Pdf.pendingRedactions().length > 0 }), M('Delete Markup', () => Ann.deleteSelected(), { enabled: !!a })];
      const page = [M('Rotate Left', () => Pdf.rotate([...Pdf.selected], -90), { accel: 'CmdOrCtrl+Shift+L', enabled: pdf }), M('Rotate Right', () => Pdf.rotate([...Pdf.selected], 90), { accel: 'CmdOrCtrl+L', enabled: pdf }), M('Crop Page…', () => Pdf.startCrop(), { enabled: pdf }), M('Remove Crop', () => Pdf.resetCrop(), { enabled: pdf }), { separator: true }, M('Insert Blank Page', () => Pdf.addBlank(Math.max(...Pdf.selected) + 1), { enabled: pdf }), M('Insert Pages from File…', () => Pdf.insertFromDialog(), { enabled: pdf }), M('Delete Pages', delPages, { enabled: pdf }), M('Extract Pages…', () => Pdf.extract([...Pdf.selected]), { enabled: pdf })];
      const imgM = [M('Rotate Left', () => Img.rotate(-1), { accel: 'CmdOrCtrl+L', enabled: img }), M('Rotate Right', () => Img.rotate(1), { accel: 'CmdOrCtrl+R', enabled: img }), M('Flip Horizontal', () => Img.flip(true), { enabled: img }), M('Flip Vertical', () => Img.flip(false), { enabled: img }), { separator: true }, M('Crop…', () => Img.startCrop(), { accel: 'CmdOrCtrl+K', enabled: img }), M('Adjust…', () => { toggleInspector(true); inspTab = 'adjust'; renderInspector(); }, { enabled: img }), M('Resize & Export…', () => Img.saveAsDialog({ title: 'Resize & Export' }), { enabled: img })];
      zeng.setMenus([{ label: 'File', items: file }, { label: 'Edit', items: edit }, { label: 'View', items: view }, { label: 'Go', items: go }, { label: 'Tools', items: toolsM }, { label: pdf || !img ? 'Pages' : 'Image', items: img ? imgM : page }]);
    }, 40);
  }
  const goToPage = async () => { const v = await zk.prompt('Go to Page', String(Pdf.cur + 1), { message: `Enter a page number from 1 to ${Pdf.pages.length}.`, ok: 'Go' }); const n = parseInt(v, 10); if (n) Pdf.goto(n - 1); };
  const exportFlat = async () => { const pg = P.progress('Flattening'); try { const bytes = await Pdf.build({ flatten: true, objectStreams: true, progress: (f) => pg.set(null, f) }); pg.close(); const h = await zeng.files.saveAs(bytes, { name: docBase() + ' – flattened.pdf', filters: [{ name: 'PDF', exts: ['pdf'] }] }); h && zk.toast('Saved ' + h.name); } catch (e) { pg.close(); if (e.code === 'ENCRYPTED') zk.alert('Can’t flatten', 'This PDF is password protected and can’t be rewritten. Use Save to write a picture-only copy.'); else zk.alert('Couldn’t export', e.message); } };

  // ---------- keyboard & gestures ----------
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return; const t = e.target; const typing = t.closest && t.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]'); if (typing) return; if (document.querySelector('.zk-scrim') || document.querySelector('.present')) return;
    const mod = e.metaKey || e.ctrlKey; const k = e.key;
    if (k === 'Escape') { if (Pdf.cropState) return Pdf.endCrop(); if (Img.cropState) return Img.endCrop(); if (P.selId) return Ann.select(null); if (P.tool !== 'select') return Ann.setTool('select'); if (!findbar.classList.contains('zk-hidden')) return toggleFind(false); return; }
    if (!P.mode) return;
    if ((k === 'Delete' || k === 'Backspace') && !mod) { if (P.selId) { e.preventDefault(); Ann.deleteSelected(); } else if (P.mode === 'pdf' && document.activeElement && document.activeElement.closest('.thumbs')) { e.preventDefault(); delPages(); } return; }
    if (!mod && !e.altKey && k.startsWith('Arrow') && P.selId) { e.preventDefault(); const a = Ann.selected(), pv = P.selPage; const st = (e.shiftKey ? 10 : 1) / (pv.vp.scale || 1); const dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0; const [x0, y0] = pv.vp.toD(0, 0), [x1, y1] = pv.vp.toD(dx * pv.vp.scale, dy * pv.vp.scale); Ann.translate(a, x1 - x0, y1 - y0); Ann.changed(pv); return; }
    if (!mod && !e.altKey && P.mode === 'image' && (k === 'ArrowRight' || k === 'ArrowLeft')) { e.preventDefault(); Img.step(k === 'ArrowRight' ? 1 : -1); return; }
    if (!mod && !e.altKey && P.mode === 'pdf' && (k === 'ArrowRight' || k === 'ArrowLeft') && !(Pdf.mode === 'continuous' && $('#pdfscroll').scrollWidth > $('#pdfscroll').clientWidth + 4)) { e.preventDefault(); Pdf.goto(Pdf.cur + (k === 'ArrowRight' ? 1 : -1) * (Pdf.mode === 'two' ? 2 : 1)); return; }
    if (!mod && !e.altKey && !e.shiftKey && k.length === 1) { const t2 = TOOLS.find((x) => x.key === k.toLowerCase() && (!x.only || x.only === P.mode)); if (t2) { e.preventDefault(); toolClick(t2.id); } }
  });
  // stage gestures for PDF zoom
  const sc = $('#pdfscroll');
  sc.addEventListener('wheel', (e) => { if (!Pdf.open) return; if (e.ctrlKey || e.metaKey) { e.preventDefault(); Pdf.pinch(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.004)), e.clientX, e.clientY); } }, { passive: false });
  let gl0 = 1; sc.addEventListener('gesturestart', (e) => { e.preventDefault(); gl0 = 1; }); sc.addEventListener('gesturechange', (e) => { e.preventDefault(); Pdf.pinch(e.scale / gl0, e.clientX, e.clientY); gl0 = e.scale; }); sc.addEventListener('gestureend', (e) => { e.preventDefault(); Pdf.pinch(1, e.clientX, e.clientY, true); });
  sc.addEventListener('scroll', () => Pdf.onScroll(), { passive: true });
  new ResizeObserver(() => { if (P.mode === 'pdf') { clearTimeout(P._rs); P._rs = setTimeout(() => { Pdf.relayout(); Pdf.rerenderAll(); }, 60); } }).observe(sc);
  // single-page mode: flip at the edges with wheel
  let wheelLock = 0; sc.addEventListener('wheel', (e) => { if (Pdf.mode !== 'single' || e.ctrlKey || e.metaKey || Math.abs(e.deltaY) < 8 || Date.now() < wheelLock) return; const atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, atTop = sc.scrollTop <= 0; if (e.deltaY > 0 && atEnd && Pdf.cur < Pdf.pages.length - 1) { wheelLock = Date.now() + 350; Pdf.goto(Pdf.cur + 1); } else if (e.deltaY < 0 && atTop && Pdf.cur > 0) { wheelLock = Date.now() + 350; Pdf.goto(Pdf.cur - 1); sc.scrollTop = sc.scrollHeight; } }, { passive: true });
  // keep text selection when using toolbar
  tb.addEventListener('pointerdown', (e) => { if (e.target.closest('button') && !e.target.closest('input')) e.preventDefault(); });

  // ---------- startup ----------
  P.toolsOn = await zeng.store.get('toolsOn', true); sbOn = await zeng.store.get('sbOn', true); inspOn = await zeng.store.get('inspOn', false); const w = await zeng.store.get('sbW', 0); if (w) sidebar.style.width = w + 'px';
  await doc.ready; showMode(); buildMenus();
  window.__zp = { P, Pdf, Img, Ann, doc };
})();
