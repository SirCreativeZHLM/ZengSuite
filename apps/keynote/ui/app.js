/* ZengKeynote: boot, document, menus, toolbar. */
(async () => {
  await zeng.ready;
  const K = window.K, A = window.A, $ = (s) => document.querySelector(s), h = zk.el;
  document.documentElement.style.setProperty('--accent', '#0a84ff'); document.documentElement.style.setProperty('--accent-rgb', '10,132,255');

  // ---------- deck lifecycle ----------
  A.setDeck = (deck) => {
    if (A.editing) A.endEdit(false); K.sync(deck); A.deck = deck; A.cur = 0; A.sel = []; A.mode = 'slides'; A.cell = null; A.live.crop = null; A.navSel = new Set([deck.slides[0].id]); A.view.zoom = 'fit';
    A.resetHistory(); A.render(); A.slides.render(true); A.emit('slide'); loadNotes(); buildMenus(); modebar();
  };
  const blankDeck = () => { const d = K.newDeck('clean'); const s = K.newSlide(d, 'title'); d.slides.push(s); return d; };
  const sanitize = (d) => {
    if (!d || !d.slides || !d.size) throw new Error('This file is not a ZengKeynote presentation.');
    d.media ||= {}; d.opts = Object.assign({ showNumbers: false, showDate: false, footer: '', loop: false, advance: 0, laser: '#ff3b30', timer: 0 }, d.opts || {});
    d.theme ||= K.themeData('clean'); d.theme.pal ||= K.themeData('clean').pal; d.layouts = d.layouts && d.layouts.length ? d.layouts : K.makeLayouts(d.theme, d.size.w, d.size.h);
    if (!d.slides.length) d.slides.push(K.newSlide(d, 'title'));
    d.slides.forEach((s) => { s.id ||= K.uid(); s.objs ||= []; s.builds ||= []; s.tr ||= { type: 'none' }; K.walk(s.objs, (o) => { o.id ||= K.uid(); if (!(o.w >= 0)) o.w = 100; if (!(o.h >= 0)) o.h = 100; }); }); return d;
  };
  const doc = zeng.doc({
    name: 'Keynote', ext: 'zkey', filters: [{ name: 'ZengKeynote Presentation', exts: ['zkey'] }, { name: 'PowerPoint Presentation', exts: ['pptx'] }], openExts: ['zkey', 'pptx'],
    blank: async () => A.setDeck(blankDeck()),
    load: async (buf, ext) => { const d = ext === 'pptx' ? await K.pptxImport(new Uint8Array(buf)) : K.zkeyLoad(new Uint8Array(buf)); A.setDeck(sanitize(d)); },
    save: async (ext) => (ext === 'pptx' ? await K.pptxExport(A.deck) : ext === 'html' ? await K.htmlExport(A.deck) : K.zkeySave(A.deck)),
    export: [
      { label: 'PowerPoint (.pptx)…', ext: 'pptx' },
      { label: 'PDF…', ext: 'pdf', run: () => K.exportPDF(A.deck) },
      { label: 'Current Slide as PNG…', ext: 'png', run: (base) => K.exportImages(A.deck, 'png', base, A.cur) },
      { label: 'All Slides as PNG (zip)…', ext: 'zip', run: (base) => K.exportImages(A.deck, 'png', base) },
      { label: 'All Slides as JPEG (zip)…', ext: 'zip', run: (base) => K.exportImages(A.deck, 'jpeg', base) },
      { label: 'HTML Presentation…', ext: 'html' },
    ],
    print: () => K.exportPDF(A.deck),
  });
  A.doc = doc;
  A.on('commit', () => doc.markDirty());

  // ---------- notes ----------
  const notes = $('#notes'); const loadNotes = () => { const s = A.deck.slides[A.cur]; notes.value = A.mode === 'slides' && s ? s.notes || '' : ''; notes.disabled = A.mode !== 'slides'; };
  notes.addEventListener('input', () => { const s = A.deck.slides[A.cur]; s.notes = notes.value; commitNotes(); });
  const commitNotes = zk.debounce(() => { A.commit('Notes'); }, 500); notes.addEventListener('focus', () => (A.focus = 'notes'));
  A.on('slide', loadNotes);
  const showNotes = (on) => { A.view.notes = on; $('#notes-wrap').classList.toggle('hidden', !on); A.computeZoom(); A.overlay(); buildMenus(); };

  // ---------- toolbar ----------
  const tb = (icon, label, fn, o = {}) => { const b = h('button.tb-btn' + (o.cls ? '.' + o.cls : ''), { type: 'button', title: o.title || label, 'aria-label': o.title || label, onclick: fn }, zk.icon(icon), h('span', label)); if (o.id) b.id = o.id; return b; };
  $('#b-nav').append(zk.icon('panel-left')); $('#b-nav').onclick = () => toggleNav();
  $('#tb-left').append(
    tb('plus', 'Slide', (e) => zk.menu([{ label: 'New Slide', accel: 'CmdOrCtrl+Shift+N', run: () => A.slides.add() }, { separator: true }, ...A.deck.layouts.map((l) => ({ label: l.name, run: () => A.slides.add(l.id) }))], { anchor: e.currentTarget }), { title: 'Add Slide' }),
    tb('play', 'Play', () => play(0), { cls: 'play', title: 'Play Slideshow' }),
  );
  $('#tb-mid').append(
    tb('table', 'Table', (e) => tablePicker(e.currentTarget)), tb('chart-column', 'Chart', (e) => zk.menu(K.CHART_KINDS.map(([v, label]) => ({ label, run: () => A.insertChart(v) })), { anchor: e.currentTarget })),
    tb('type', 'Text', () => A.insertText(), { id: 'tb-text' }), tb('shapes', 'Shape', (e) => A.shapePicker(e.currentTarget, (id) => A.insertShape(id))),
    tb('route', 'Line', (e) => lineMenu(e.currentTarget)), tb('image', 'Media', (e) => zk.menu([{ label: 'Image…', run: () => A.pickMedia('image') }, { label: 'Audio…', run: () => A.pickMedia('audio') }, { label: 'Movie…', run: () => A.pickMedia('video') }], { anchor: e.currentTarget })),
  );
  $('#tb-right').append(tb('zoom-in', 'View', (e) => viewMenu(e.currentTarget), { title: 'Zoom & View' }), tb('panel-right', 'Inspector', () => toggleInsp(), { title: 'Toggle Inspector' }));
  $('#st-zoom').onclick = (e) => viewMenu(e.currentTarget);
  const tablePicker = (anchor) => {
    const g = h('.tbl-pop'); const info = h('div.small', { style: { gridColumn: '1/-1', textAlign: 'center' } }, 'Rows × Columns'); const cells = [];
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const i = h('i', { onpointerenter: () => { cells.forEach((x) => x.el.classList.toggle('on', x.r <= r && x.c <= c)); info.textContent = `${r} × ${c}`; }, onclick: () => { zk.closePop(); A.insertTable(r, c); } }); cells.push({ el: i, r, c }); g.append(i); }
    g.append(info); zk.popover(anchor, g, { align: 'center' });
  };
  const lineMenu = (anchor) => zk.menu([{ label: 'Line', run: () => A.insertLine('straight', 'none') }, { label: 'Arrow', run: () => A.insertLine('straight', 'arrow') }, { label: 'Elbow Connector', run: () => A.insertLine('elbow', 'arrow') }, { label: 'Curved Connector', run: () => A.insertLine('curve', 'arrow') }], { anchor });
  const viewMenu = (anchor) => zk.menu(viewItems(), { anchor, align: 'end' });
  const viewItems = () => [{ label: 'Fit in Window', accel: 'CmdOrCtrl+0', checked: A.view.zoom === 'fit', run: () => A.setZoom('fit') }, ...[0.25, 0.5, 0.75, 1, 1.5, 2].map((z) => ({ label: z * 100 + '%', run: () => A.setZoom(z) })), { separator: true }, { label: 'Zoom In', accel: 'CmdOrCtrl+=', run: () => A.zoomBy(1.2) }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: () => A.zoomBy(1 / 1.2) }, { separator: true },
    { label: 'Show Rulers', checked: A.view.rulers, run: () => toggleRulers() }, { label: 'Show Grid', checked: A.view.grid, run: () => { A.view.grid = !A.view.grid; A.overlay(); buildMenus(); } }, { label: 'Snap to Grid', checked: A.view.snapGrid, run: () => { A.view.snapGrid = !A.view.snapGrid; buildMenus(); } }, { label: 'Smart Guides', checked: A.view.smart, run: () => { A.view.smart = !A.view.smart; buildMenus(); } }];
  const toggleRulers = () => { A.view.rulers = !A.view.rulers; document.body.classList.toggle('no-rulers', !A.view.rulers); A.computeZoom(); A.overlay(); A.drawRulers(); buildMenus(); };
  const toggleNav = () => { A.view.nav = !A.view.nav; $('#nav').classList.toggle('hidden', !A.view.nav); $('#rz-nav').classList.toggle('hidden', !A.view.nav); A.computeZoom(); A.overlay(); buildMenus(); };
  const toggleInsp = () => { A.view.insp = !A.view.insp; $('#insp').classList.toggle('hidden', !A.view.insp); $('#rz-insp').classList.toggle('hidden', !A.view.insp); A.computeZoom(); A.overlay(); buildMenus(); };

  // resizers
  const resizer = (el, prop, min, max, dir) => el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('active'); const x0 = e.clientX, v0 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(prop)) || 200; const mv = (ev) => { document.documentElement.style.setProperty(prop, zk.clamp(v0 + (ev.clientX - x0) * dir, min, max) + 'px'); }; const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.classList.remove('active'); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
  resizer($('#rz-nav'), '--nav-w', 140, 340, 1); resizer($('#rz-insp'), '--insp-w', 250, 440, -1);
  $('#rz-notes').addEventListener('pointerdown', (e) => { const el = $('#rz-notes'); el.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = $('#notes-wrap').offsetHeight; const mv = (ev) => { $('#notes-wrap').style.height = zk.clamp(h0 - (ev.clientY - y0), 40, 360) + 'px'; A.computeZoom(); }; const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });

  // ---------- master (layout) editor bar ----------
  const modebar = () => {
    const mb = $('#modebar'); const on = A.mode === 'layouts'; mb.classList.toggle('zk-hidden', !on); mb.replaceChildren(); if (!on) return;
    const addPh = (name, label, type) => { const L = A.deck.layouts[A.layIdx]; if (L.objs.some((o) => o.ph === name)) { zk.toast(label + ' already exists'); return; } const W = A.deck.size.w, H = A.deck.size.h; const o = K.newObj(type === 'image' ? 'image' : 'text', { ph: name, name: label, prompt: label, x: W * 0.1, y: H * 0.25, w: W * 0.8, h: H * 0.5, ts: { f: name === 'title' ? 'head' : 'body', sz: name === 'title' ? 44 : 28, c: 'fg', va: 't' }, paras: undefined }); if (type !== 'image') delete o.paras; L.objs.push(o); A.sel = [o.id]; A.render(); A.commit('Add Placeholder'); A.emit('select'); A.slides.renderLayouts(); };
    mb.append(h('span', 'Editing Slide Layouts'), h('.zk-spacer'), h('button.zk-btn.bordered', { type: 'button', onclick: (e) => zk.menu([{ label: 'Title', run: () => addPh('title', 'Title') }, { label: 'Subtitle', run: () => addPh('subtitle', 'Subtitle') }, { label: 'Body', run: () => addPh('body', 'Body') }, { label: 'Second Body', run: () => addPh('body2', 'Body 2') }, { label: 'Image', run: () => addPh('image', 'Photo', 'image') }, { label: 'Quote', run: () => addPh('quote', 'Quote') }], { anchor: e.currentTarget }) }, 'Add Placeholder'),
      h('button.zk-btn.bordered', { type: 'button', onclick: () => { const d = A.deck; const l = { id: K.uid(), kind: 'custom', name: 'Layout ' + (d.layouts.length + 1), bg: null, objs: [] }; d.layouts.push(l); A.layIdx = d.layouts.length - 1; A.render(); A.commit('New Layout'); A.slides.renderLayouts(); } }, 'New Layout'),
      h('button.zk-btn.primary', { type: 'button', onclick: () => A.layoutMode(false) }, 'Done'));
  };
  A.on('layoutmode', modebar); A.on('slide', modebar);

  // ---------- present ----------
  const play = (from, mode) => { if (A.editing) A.endEdit(true); K.present(A.deck, { start: from == null ? A.cur : from, mode: mode || 'normal', onExit: (i) => { if (i != null) A.slides.go(i); } }); };
  A.play = play;
  A.on('previewTransition', () => { const i = A.cur; if (i > 0) K.present(A.deck, { start: i - 1, mode: 'normal', preview: i, onExit: () => { } }); else zk.toast('The first slide has nothing to transition from'); });
  A.on('previewBuilds', () => K.present(A.deck, { start: A.cur, mode: 'normal', onExit: () => { }, single: true }));
  A.on('toggleMedia', (o) => { const e = A.elOf(o.id); const m = e && e.querySelector('video,audio'); if (m) m.paused ? m.play() : m.pause(); });
  A.on('pickImage', (o) => { A.select([o.id]); A.pickMedia('image'); });

  // ---------- context menu ----------
  A.on('context', (e, o) => {
    const has = A.sel.length > 0; const t = A.selObjs()[0];
    const items = [];
    if (has) items.push({ label: 'Cut', accel: 'CmdOrCtrl+X', run: () => { A.cmd.copy(true); } }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => A.cmd.copy(false) });
    items.push({ label: 'Paste', accel: 'CmdOrCtrl+V', enabled: !!A.clip, run: () => A.cmd.paste() });
    if (has) items.push({ label: 'Duplicate', accel: 'CmdOrCtrl+D', run: A.cmd.dup }, { label: 'Delete', run: A.cmd.del }, { separator: true },
      { label: 'Arrange', submenu: [{ label: 'Bring to Front', run: () => A.cmd.order('front') }, { label: 'Bring Forward', run: () => A.cmd.order('forward') }, { label: 'Send Backward', run: () => A.cmd.order('backward') }, { label: 'Send to Back', run: () => A.cmd.order('back') }] },
      { label: 'Group', enabled: A.sel.length > 1, run: A.cmd.group }, { label: 'Ungroup', enabled: A.selObjs().some((x) => x.type === 'group'), run: A.cmd.ungroup }, { label: t && t.lock ? 'Unlock' : 'Lock', run: () => A.cmd.lock() },
      { label: 'Flip', submenu: [{ label: 'Horizontal', run: () => A.cmd.flip('h') }, { label: 'Vertical', run: () => A.cmd.flip('v') }] }, { separator: true }, { label: 'Add Hyperlink…', run: A.insertLink });
    if (t && t.type === 'image') items.push({ label: 'Crop', run: () => A.cropMode(true) }, { label: 'Replace Image…', run: () => A.replaceImage(t) });
    if (t && t.type === 'chart') items.push({ label: 'Edit Chart Data…', run: () => A.emit('editChart', t) });
    if (t && t.type === 'table') items.push({ separator: true }, { label: 'Add Row Below', run: () => A.cmd.tableAddRow(true) }, { label: 'Add Column After', run: () => A.cmd.tableAddCol(true) }, { label: 'Delete Row', run: A.cmd.tableDelRow }, { label: 'Delete Column', run: A.cmd.tableDelCol });
    zk.menu(items, { x: e.clientX, y: e.clientY });
  });

  // ---------- menus ----------
  const layoutItems = (fn) => A.deck.layouts.map((l) => ({ label: l.name, run: () => fn(l.id) }));
  function buildMenus() {
    if (!A.deck) return; const d = A.deck; const sel = A.selObjs().length > 0; const ed = !!A.editing;
    const fm = (label, accel, fn, extra = {}) => ({ label, accel, run: fn, ...extra });
    zeng.setMenus([
      { label: 'File', items: doc.fileMenu() },
      { label: 'Edit', items: zeng.stdEdit({ undo: A.undo, redo: A.redo, extra: [fm('Duplicate', 'CmdOrCtrl+D', () => (A.focus === 'nav' ? A.slides.duplicate() : A.cmd.dup())), fm('Delete', null, () => (A.focus === 'nav' ? A.slides.remove() : A.cmd.del())), fm('Select All Objects', 'CmdOrCtrl+Alt+A', A.cmd.selectAll), fm('Select None', 'CmdOrCtrl+Shift+A', () => A.select([]))] }) },
      { label: 'Insert', items: [fm('New Slide', 'CmdOrCtrl+Shift+N', () => A.slides.add()), { label: 'New Slide With Layout', submenu: layoutItems((id) => A.slides.add(id)) }, { separator: true }, fm('Text Box', 'CmdOrCtrl+Alt+T', A.insertText), { label: 'Shape', submenu: K.shapeCats.map((c) => ({ label: c, submenu: K.shapeList.filter((s) => s.g === c).map((s) => ({ label: s.n, run: () => A.insertShape(s.id) })) })) },
        { label: 'Line', submenu: [{ label: 'Line', run: () => A.insertLine('straight', 'none') }, { label: 'Arrow', run: () => A.insertLine('straight', 'arrow') }, { label: 'Elbow Connector', run: () => A.insertLine('elbow', 'arrow') }, { label: 'Curved Connector', run: () => A.insertLine('curve', 'arrow') }] }, { separator: true },
        fm('Image…', 'CmdOrCtrl+Alt+I', () => A.pickMedia('image')), fm('Audio…', null, () => A.pickMedia('audio')), fm('Movie…', null, () => A.pickMedia('video')), { label: 'Table', submenu: [[2, 2], [3, 3], [4, 4], [5, 4], [6, 5], [8, 6]].map(([r, c]) => ({ label: `${r} × ${c}`, run: () => A.insertTable(r, c) })) }, { label: 'Chart', submenu: K.CHART_KINDS.map(([v, label]) => ({ label, run: () => A.insertChart(v) })) }, { separator: true },
        { label: 'Field', submenu: [{ label: 'Slide Number', run: () => A.insertField('slideno') }, { label: 'Slide Count', run: () => A.insertField('count') }, { label: 'Date', run: () => A.insertField('date') }] }, fm('Hyperlink…', 'CmdOrCtrl+K', A.insertLink)] },
      { label: 'Slide', items: [fm('New Slide', null, () => A.slides.add()), fm('Duplicate Slide', null, () => A.slides.duplicate()), fm('Delete Slide', null, () => A.slides.remove()), { separator: true }, fm('Skip Slide', null, () => A.slides.skip(), { checked: !!(d.slides[A.cur] && d.slides[A.cur].skip) }), fm('Indent Slide', null, () => A.slides.indent(1)), fm('Outdent Slide', null, () => A.slides.indent(-1)), fm('Add Section…', null, () => A.slides.section()), { separator: true }, { label: 'Change Layout', submenu: layoutItems((id) => A.slides.setLayout(id)) }, fm('Edit Slide Layouts', null, () => A.layoutMode(A.mode !== 'layouts'), { checked: A.mode === 'layouts' }), { separator: true }, fm('Previous Slide', 'PageUp', () => A.slides.go(A.cur - 1)), fm('Next Slide', 'PageDown', () => A.slides.go(A.cur + 1)), fm('First Slide', 'Home', () => A.slides.go(0)), fm('Last Slide', 'End', () => A.slides.go(d.slides.length - 1))] },
      { label: 'Format', items: [
        { label: 'Font', submenu: [fm('Bold', 'CmdOrCtrl+B', () => A.fmt.run('b')), fm('Italic', 'CmdOrCtrl+I', () => A.fmt.run('i')), fm('Underline', 'CmdOrCtrl+U', () => A.fmt.run('u')), fm('Strikethrough', null, () => A.fmt.run('s')), { separator: true }, fm('Bigger', 'CmdOrCtrl+Shift+=', () => bump(2)), fm('Smaller', 'CmdOrCtrl+Shift+-', () => bump(-2)), { separator: true }, fm('Superscript', null, () => A.fmt.run('sup')), fm('Subscript', null, () => A.fmt.run('sub'))] },
        { label: 'Text Alignment', submenu: [...[['Left', 'l', 'CmdOrCtrl+Shift+L'], ['Center', 'c', 'CmdOrCtrl+Shift+E'], ['Right', 'r', 'CmdOrCtrl+Shift+R'], ['Justify', 'j', 'CmdOrCtrl+Shift+J']].map(([n, v, a]) => fm(n, a, () => A.fmt.para('al', v))), { separator: true }, ...[['Top', 't'], ['Middle', 'm'], ['Bottom', 'b']].map(([n, v]) => fm(n, null, () => A.fmt.para('va', v)))] },
        { label: 'Lists', submenu: [['None', 'none'], ['Bullet', 'b'], ['Dash', 'd'], ['Numbered', 'n'], ['Lettered', 'a'], ['Roman', 'r'], ['Checkmark', 'c']].map(([n, v]) => fm(n, null, () => A.fmt.para('list', v))).concat([{ separator: true }, fm('Increase List Level', null, () => A.fmt.para('lv', 1)), fm('Decrease List Level', null, () => A.fmt.para('lv', -1))]) },
        { separator: true }, fm('Shrink Text to Fit', null, () => A.selObjs().forEach((o) => { (o.ts ||= {}).fit = o.ts.fit === 'shrink' ? 'none' : 'shrink'; A.renderObj(o.id); A.commit('Autofit'); })), { separator: true }, fm('Show Inspector', 'CmdOrCtrl+Alt+I', toggleInsp, { checked: A.view.insp }) ] },
      { label: 'Arrange', items: [fm('Bring to Front', 'CmdOrCtrl+Shift+]', () => A.cmd.order('front')), fm('Bring Forward', 'CmdOrCtrl+]', () => A.cmd.order('forward')), fm('Send Backward', 'CmdOrCtrl+[', () => A.cmd.order('backward')), fm('Send to Back', 'CmdOrCtrl+Shift+[', () => A.cmd.order('back')), { separator: true }, fm('Group', 'CmdOrCtrl+Alt+G', A.cmd.group), fm('Ungroup', 'CmdOrCtrl+Alt+Shift+G', A.cmd.ungroup), fm('Lock', 'CmdOrCtrl+L', () => A.cmd.lock()), { separator: true },
        { label: 'Align Objects', submenu: [['Left', 'left'], ['Center', 'center'], ['Right', 'right'], ['Top', 'top'], ['Middle', 'middle'], ['Bottom', 'bottom']].map(([n, k]) => fm(n, null, () => A.cmd.align(k))) }, { label: 'Distribute Objects', submenu: [fm('Horizontally', null, () => A.cmd.distribute('h')), fm('Vertically', null, () => A.cmd.distribute('v'))] }, { label: 'Flip', submenu: [fm('Horizontally', null, () => A.cmd.flip('h')), fm('Vertically', null, () => A.cmd.flip('v'))] }, fm('Rotate Left', null, () => A.cmd.rot90(-1)), fm('Rotate Right', null, () => A.cmd.rot90(1)), fm('Match Size', null, () => A.cmd.matchSize())] },
      { label: 'View', items: [...viewItems(), { separator: true }, fm('Show Slide Navigator', 'CmdOrCtrl+Alt+N', toggleNav, { checked: A.view.nav }), fm('Show Presenter Notes', null, () => showNotes(!A.view.notes), { checked: A.view.notes })] },
      { label: 'Play', items: [fm('Play Slideshow', 'CmdOrCtrl+Alt+P', () => play(0)), fm('Play From Current Slide', 'CmdOrCtrl+Alt+Shift+P', () => play(A.cur)), { separator: true }, fm('Presenter Display', null, () => play(A.cur, 'presenter')), fm('Rehearse Slideshow', null, () => play(0, 'rehearse')), { separator: true }, fm('Loop Slideshow', null, () => { d.opts.loop = !d.opts.loop; A.commit('Loop'); buildMenus(); }, { checked: d.opts.loop })] },
    ]);
  }
  const bump = (d) => { const st = A.fmt.state(); if (st) A.fmt.run('sz', Math.max(4, Math.round((st.sz || 24) + d))); };
  A.buildMenus = buildMenus; A.on('select', () => zeng.refreshMenus()); A.on('slide', () => zeng.refreshMenus());
  A.on('commit', () => { clearTimeout(A._mt); A._mt = setTimeout(buildMenus, 300); });
  zeng.shortcut('CmdOrCtrl+Alt+A', () => A.cmd.selectAll());

  // ---------- keyboard odds and ends ----------
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.zk-scrim')) return; const t = e.target; const typing = t.matches && t.matches('input,textarea,select,[contenteditable="true"]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && !typing && !A.editing) {
      if (e.key === 'c') { if (A.focus === 'nav') return; const c = A.cmd.copy(false); if (c) { e.preventDefault(); try { navigator.clipboard.writeText(c.objs.map((o) => K.plain(o.paras)).filter(Boolean).join('\n')); } catch { } } }
      else if (e.key === 'x') { if (A.focus === 'nav') return; if (A.sel.length) { e.preventDefault(); A.cmd.copy(true); } }
      else if (e.key === 'v') { if (A.focus === 'nav') return; if (A.clip && !A._pasting) { /* real paste event handles it; fall back below */ A._pasting = true; setTimeout(() => { A._pasting = false; }, 120); setTimeout(() => { if (A._pasteHandled) { A._pasteHandled = false; return; } A.cmd.paste(); }, 60); } }
      else if (e.key === 'a' && A.focus !== 'nav') { e.preventDefault(); A.cmd.selectAll(); }
    }
  });
  document.addEventListener('paste', () => { A._pasteHandled = true; setTimeout(() => (A._pasteHandled = false), 200); }, true);
  addEventListener('resize', () => { A.computeZoom(); A.overlay(); A.drawRulers(); });
  zeng.onFiles(async (hs) => { const media = hs.filter((x) => /\.(png|jpe?g|gif|webp|svg|bmp|mp3|wav|m4a|aac|mp4|m4v|mov|webm)$/i.test(x.name)); if (!media.length) return true; for (const f of media) { try { await A.insertFile({ name: f.name, data: new Uint8Array(await zeng.files.read(f)) }); } catch (e) { zk.alert('Can’t insert “' + f.name + '”', e.message); } } return false; });
  A.on('layoutmode', buildMenus);
  await doc.ready; A.setDeck(blankDeck()); doc.setClean();
  window.__setDeckForTest = A.setDeck; window.__ready = true;
})();
