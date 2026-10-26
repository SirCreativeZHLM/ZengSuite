/* ZengFreeform UI: toolbar, tools palette, inspector, menus, boards, minimap, rulers, palette, present, autosave. */
(async () => {
  'use strict';
  await zeng.ready;
  const S = FF.S, R = FF.R, E = zk.el, $ = (s) => document.querySelector(s);
  const mac = zeng.platform === 'mac';
  const stage = FF.stage;
  // ---------- icons on static buttons ----------
  const ic = (id, name) => $(id).append(zk.icon(name));
  ic('#b-undo', 'undo-2'); ic('#b-redo', 'redo-2'); ic('#b-present', 'presentation'); ic('#b-export', 'download'); ic('#b-insp', 'panel-right'); ic('#b-cmd', 'command');
  ic('#z-out', 'minus'); ic('#z-fit', 'maximize'); ic('#z-in', 'plus'); ic('#z-map', 'layout-grid'); ic('#p-prev', 'arrow-left'); ic('#p-next', 'arrow-right'); ic('#p-laser', 'crosshair'); ic('#p-exit', 'x');

  // ---------- document ----------
  const centerView = (b, z = 1) => { const r = FF.getRect(); b.view = { x: -r.width / z / 2, y: -r.height / z / 2, z }; };
  const exportDefs = [['PNG Image…', 'png'], ['JPEG Image…', 'jpeg'], ['SVG Vector…', 'svg'], ['PDF…', 'pdf'], ['JSON…', 'json']];
  const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'];
  const doc = zeng.doc({
    name: 'Freeform', ext: 'zfree', filters: [{ name: 'Freeform Board', exts: ['zfree'] }],
    openExts: ['zfree', 'json', 'svg', ...imgExts],
    blank: () => { FF.newDoc(); centerView(FF.B); },
    load: async (buf, ext, h) => {
      if (ext === 'zfree' || ext === 'json') { FF.openBytes(buf, h.name); return; }
      FF.newDoc(); centerView(FF.B);
      if (ext === 'svg') FF.importSVGText(new TextDecoder().decode(buf), [0, 0]); else await FF.insertFiles([{ name: h.name, file: new File([buf], h.name, { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }) }], [0, 0]);
      FF.zoomFit(null, false);
    },
    save: async (ext) => (ext === 'json' ? JSON.stringify(FF.docJSON(true)) : await FF.saveZip()),
    export: exportDefs.map(([label, ext]) => ({ label, ext, run: () => exportDialog(ext) })),
    print: () => exportDialog('pdf'),
    onOtherFiles: (hs) => { FF.insertFiles(hs); return false; },
  });
  let loading = false;
  FF.on('change', (why) => { if (why === 'load') return; doc.markDirty(); scheduleDraft(); refreshUI(); });
  FF.on('history', () => syncUndo());

  // ---------- view hooks ----------
  const zoomLbl = $('#zoomlbl');
  let hudRaf = 0;
  FF.on('view', () => { zoomLbl.textContent = Math.round(R.view.z * 100) + '%'; if (!hudRaf) hudRaf = requestAnimationFrame(() => { hudRaf = 0; drawMini(); drawRulers(); }); });
  FF.on('board', () => { R.view = { ...FF.B.view }; R.cache = null; R.frozen = null; FF.S.sel.clear(); if (S.editing) FF.endEdit(); R.invalidate(); FF.emit('view'); FF.emit('sel'); renderTabs(); syncUndo(); buildMenus(); drawMini(); });
  FF.on('theme', () => { drawMini(); drawRulers(); });

  // ---------- tools palette ----------
  const DRAW = ['pen', 'marker', 'hl', 'pencil']; let lastDraw = 'pen';
  const TOOLS = [
    { id: 'select', icon: 'mouse-pointer-2', title: 'Select (V)' }, { id: 'hand', icon: 'hand', title: 'Hand (G, or hold Space)' }, { sep: 1 },
    { id: 'draw', icon: 'pen', title: 'Pen, Marker, Highlighter, Pencil (P)', group: DRAW }, { id: 'eraser', icon: 'eraser', title: 'Eraser (E)' }, { id: 'lasso', icon: 'lasso-select', title: 'Lasso (L)' }, { sep: 1 },
    { id: 'shape', icon: 'shapes', title: 'Shapes (S)' }, { id: 'text', icon: 'type', title: 'Text (T)' }, { id: 'sticky', icon: 'sticky-note', title: 'Sticky Note (N)' }, { id: 'conn', icon: 'spline', title: 'Connector (C)' }, { id: 'frame', icon: 'square-dashed', title: 'Frame (F)' }, { id: 'table', icon: 'table', title: 'Table (⇧T)' }, { id: 'image', icon: 'image', title: 'Image (I)', action: true }, { id: 'stamp', icon: 'smile', title: 'Stamp (⇧E)' }, { sep: 1 },
    { id: 'laser', icon: 'crosshair', title: 'Laser Pointer (W)' }, { id: 'eyedrop', icon: 'pipette', title: 'Eyedropper (D)' },
  ];
  const tools = $('#tools'); const toolBtns = {};
  for (const t of TOOLS) {
    if (t.sep) { tools.append(E('.sepl')); continue; }
    const b = zk.btn({ icon: t.icon, title: t.title, onClick: () => pickTool(t.id) }); b.dataset.tool = t.id; tools.append(b); toolBtns[t.id] = b;
  }
  const SHAPE_ICON_CACHE = {};
  const shapeSVG = (k) => { const w = 24, h = k === 'arrow' || k === 'leftarrow' || k === 'data' || k === 'terminator' ? 16 : 20; const s = FF.shapeD(k, w, h); const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '-1 -3 26 26'); sv.innerHTML = `<path d="${s.d}" transform="translate(0 ${(20 - h) / 2})"/>${s.d2 ? `<path d="${s.d2}" transform="translate(0 ${(20 - h) / 2})"/>` : ''}`; return sv; };
  function shapePicker(anchor) {
    const g = E('.shape-grid'); for (const [k, name] of FF.SHAPES) { const b = E('button' + (S.shape === k ? '.on' : ''), { title: name, 'aria-label': name, onclick: () => { S.shape = k; zk.closePop(); FF.setTool('shape'); } }); b.append(shapeSVG(k)); g.append(b); }
    zk.popover(anchor, g, { side: 'bottom', x: undefined });
    const r = anchor.getBoundingClientRect(); const p = document.querySelector('.zk-pop'); if (p) { p.style.left = r.right + 8 + 'px'; p.style.top = Math.max(8, Math.min(innerHeight - p.offsetHeight - 8, r.top - 20)) + 'px'; }
  }
  const EMOJI = '⭐ ❤️ 👍 👎 ✅ ❌ ❓ ❗ 💡 🔥 🎉 🚀 👀 💬 📌 📎 🎯 🏆 ⚡ ✨ 😀 😂 😍 🤔 😎 😭 😡 🙏 👏 💪 🌈 ☀️ 🌙 🍎 ☕ 🎵 📅 📷 🔒 🔑 🔔 💰 📈 📉 🧠 🛠️ ⚙️ 🧩 🗂️ 📝 📣 🚩 🔗 ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟠 🟡 🟢 🔵 🟣'.split(' ');
  function emojiPicker(anchor) {
    const g = E('.emoji-grid'); for (const ch of EMOJI) g.append(E('button', { title: ch, onclick: () => { S.stamp = ch; zk.closePop(); FF.setTool('stamp'); } }, ch));
    zk.popover(anchor, g); const r = anchor.getBoundingClientRect(); const p = document.querySelector('.zk-pop'); if (p) { p.style.left = r.right + 8 + 'px'; p.style.top = Math.max(8, Math.min(innerHeight - p.offsetHeight - 8, r.top - 60)) + 'px'; }
  }
  function pickTool(id) {
    zk.closePop();
    if (id === 'image') return FF.pickImages();
    if (id === 'draw') return FF.setTool(S.tool === lastDraw || DRAW.includes(S.tool) ? S.tool : lastDraw);
    if (id === 'shape') { if (S.tool === 'shape') return shapePicker(toolBtns.shape); FF.setTool('shape'); return shapePicker(toolBtns.shape); }
    if (id === 'stamp') { if (S.tool === 'stamp') return emojiPicker(toolBtns.stamp); FF.setTool('stamp'); return emojiPicker(toolBtns.stamp); }
    if (id === 'eyedrop') S.prevTool = S.tool === 'eyedrop' ? 'select' : S.tool;
    FF.setTool(id);
  }
  FF.on('tool', () => {
    if (DRAW.includes(S.tool)) lastDraw = S.tool;
    for (const [id, b] of Object.entries(toolBtns)) { const on = id === 'draw' ? DRAW.includes(S.tool) : id === S.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    const ico = { pen: 'pen', marker: 'brush', hl: 'highlighter', pencil: 'pencil' }[lastDraw]; const db = toolBtns.draw; db.replaceChildren(zk.icon(ico));
    buildCtx(); buildMenus();
  });

  // ---------- context bar (tool options) ----------
  const ctx = $('#ctxbar');
  const swatch = (c, cur, fn) => E('button.zk-swatch' + (c === 'ink' ? '.ink' : '') + (c === cur ? '.sel' : ''), { title: c, 'aria-label': c, style: c === 'ink' ? {} : { background: c }, onclick: fn });
  const seg = (opts, cur, fn) => { const s = E('.zk-seg'); for (const o of opts) { const b = E('button', { type: 'button', title: o.title || o.label || '', 'aria-pressed': String(o.v === cur), onclick: () => fn(o.v) }, o.icon ? zk.icon(o.icon) : null, o.label); s.append(b); } return s; };
  function buildCtx() {
    ctx.replaceChildren(); let show = true; const t = S.tool;
    if (DRAW.includes(t)) {
      const st = S.pen[t];
      ctx.append(seg([{ v: 'pen', icon: 'pen', title: 'Pen (P)' }, { v: 'marker', icon: 'brush', title: 'Marker (M)' }, { v: 'hl', icon: 'highlighter', title: 'Highlighter (H)' }, { v: 'pencil', icon: 'pencil', title: 'Pencil (B)' }], t, (v) => FF.setTool(v)), E('.zk-sep'));
      for (const c of FF.PALETTE.slice(0, 11)) ctx.append(swatch(c, st.color, () => { st.color = c; buildCtx(); }));
      const col = E('input.zk-color', { type: 'color', value: /^#/.test(st.color) ? st.color : '#000000', title: 'Custom colour', oninput: (e) => { st.color = e.target.value; } , onchange: buildCtx }); ctx.append(col, E('.zk-sep'));
      const sl = E('input.zk-range', { type: 'range', min: 1, max: t === 'hl' ? 50 : 30, step: 1, value: st.size, style: { width: '90px' }, title: 'Size', oninput: (e) => { st.size = +e.target.value; } }); ctx.append(sl);
      ctx.append(E('span.zk-label', 'Hold still to snap shapes'));
    } else if (t === 'eraser') {
      ctx.append(seg([{ v: 'area', label: 'Area' }, { v: 'stroke', label: 'Stroke' }], S.eraser.mode, (v) => { S.eraser.mode = v; buildCtx(); }), E('input.zk-range', { type: 'range', min: 4, max: 60, value: S.eraser.size, style: { width: '110px' }, title: 'Size', oninput: (e) => { S.eraser.size = +e.target.value; } }));
    } else if (t === 'shape') {
      const b = E('button.zk-btn.bordered', { onclick: () => shapePicker(b) }, shapeSVG(S.shape), FF.SHAPES.find((x) => x[0] === S.shape)[1]); b.firstChild.style.cssText = 'width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6'; ctx.append(b, E('span.zk-label', 'Click or drag on the canvas'));
    } else if (t === 'sticky') {
      for (const c of FF.STICKY) ctx.append(swatch(c, S.sticky, () => { S.sticky = c; buildCtx(); }));
    } else if (t === 'conn') {
      ctx.append(seg([{ v: 'straight', label: 'Straight' }, { v: 'elbow', label: 'Elbow' }, { v: 'curve', label: 'Curved' }], S.conn.kind, (v) => { S.conn.kind = v; buildCtx(); }), headSel('Start', 'ha'), headSel('End', 'hb'));
    } else if (t === 'eyedrop') ctx.append(E('span.zk-label', 'Click anywhere to pick a colour'));
    else if (t === 'laser') ctx.append(E('span.zk-label', 'Move to point; the trail fades'));
    else show = false;
    ctx.classList.toggle('zk-hidden', !show);
  }
  const HEADS = [['none', 'None'], ['arrow', 'Arrow'], ['tri', 'Triangle'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['bar', 'Bar']];
  const headSel = (label, key, objs) => { const s = E('select.zk-select', { 'aria-label': label + ' arrowhead', onchange: (e) => { if (objs) FF.setProps({ [key]: e.target.value }, 'Arrowhead'); else S.conn[key] = e.target.value; } }, ...HEADS.map(([v, n]) => E('option', { value: v, selected: v === (objs ? objs[0][key] || 'none' : S.conn[key]) }, label + ': ' + n))); return s; };
  FF.on('picked', (hex) => { const sel = FF.selObjs(); if (sel.length) FF.setStyle(FF.hasFill(sel[0]) && sel[0].type !== 'stroke' ? { fill: hex } : { stroke: hex }); else { S.pen[lastDraw].color = hex; } buildCtx(); });

  // ---------- inspector ----------
  const insp = $('#insp'); let inspOn = false; let inspUser = null;
  const setInsp = (on) => { inspOn = on; insp.classList.toggle('zk-hidden', !on); $('#b-insp').setAttribute('aria-pressed', on); $('#b-insp').classList.toggle('on', on); setTimeout(() => FF.refreshRect(), 0); buildMenus(); if (on) buildInsp(); };
  $('#b-insp').onclick = () => { inspUser = !inspOn; setInsp(!inspOn); };
  let live = null;
  const liveApply = (patch, props) => { const sel = FF.selObjs(); if (!sel.length) return; if (!live) { live = FF.tx('Change Style'); live.touchAll(sel); } for (const o of sel) { if (patch) Object.assign(o.s, patch); if (props) Object.assign(o, props); if (patch && ('font' in patch || 'fs' in patch)) FF.fitText(o); if (patch && 'sw' in patch && o.type === 'stroke' && !o.rot) FF.refitStroke(o); FF.touch(o); } FF.reflow(); R.invalidate(); R.invalidateOverlay(); };
  const liveEnd = () => { if (live) { live.end(); live = null; FF.reflow(); R.invalidate(); } };
  const row = (label, ...k) => E('.row', label && E('span.zk-label', label), ...k);
  const sect = (title, ...k) => E('.zk-section', title && E('.zk-section-title', title), ...k);
  const colorRow = (label, key, cur, { none = true, extra = [] } = {}) => {
    const sw = E('.swatches'); if (none) sw.append(E('button.zk-swatch.none' + (cur === 'none' ? '.sel' : ''), { title: 'None', 'aria-label': 'No ' + label, onclick: () => { FF.setStyle({ [key]: 'none' }); } }));
    for (const c of [...extra, ...FF.PALETTE]) { const b = swatch(c === 'ink' ? 'ink' : c, cur, () => FF.setStyle({ [key]: c })); if (c === 'paper') b.style.background = '#fff'; sw.append(b); }
    const ci = E('input.zk-color', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888', title: 'Custom', oninput: (e) => liveApply({ [key]: e.target.value }), onchange: liveEnd });
    sw.append(ci); if (window.EyeDropper) sw.append(E('button.zk-btn.icon', { title: 'Eyedropper', onclick: async () => { try { const r = await new EyeDropper().open(); FF.setStyle({ [key]: r.sRGBHex }); } catch {} } }, zk.icon('pipette'))); else sw.append(E('button.zk-btn.icon', { title: 'Eyedropper', onclick: () => { S.prevTool = 'select'; FF.setTool('eyedrop'); } }, zk.icon('pipette')));
    return E('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, E('span.zk-label', label), sw);
  };
  const numField = (label, val, fn, step = 1) => { const i = E('input.zk-input.selectable', { type: 'number', step, value: Math.round(val * 10) / 10, 'aria-label': label, onchange: (e) => { if (e.target.value !== '') fn(+e.target.value); } }); return E('label', E('span', label), i); };
  const iconBtn = (icon, title, fn, on) => E('button.zk-btn.icon' + (on ? '.on' : ''), { title, 'aria-label': title, onclick: fn }, zk.icon(icon));
  function buildInsp() {
    if (!inspOn) return; const sel = FF.selObjs(); insp.replaceChildren();
    if (!sel.length) {
      const B = FF.B; insp.append(sect('Board',
        row('Name', E('input.zk-input.selectable', { value: B.name, style: { width: '150px' }, onchange: (e) => { B.name = e.target.value || B.name; renderTabs(); doc.markDirty(); } })),
        row('Background', seg([{ v: 'dot', label: 'Dots' }, { v: 'grid', label: 'Grid' }, { v: 'none', label: 'None' }], B.bg, (v) => { B.bg = v; R.invalidate(); doc.markDirty(); buildInsp(); })),
        E('span.zk-label', 'Canvas colour'), (() => { const sw = E('.swatches'); sw.append(E('button.zk-swatch' + (!B.color ? '.sel' : ''), { title: 'Automatic', style: { background: 'linear-gradient(135deg,#fff 50%,#1b1b1d 50%)' }, onclick: () => { B.color = null; R.cache = null; R.invalidate(); doc.markDirty(); buildInsp(); } })); for (const c of ['#ffffff', '#fff7e6', '#eaf4ff', '#eafaf0', '#fdeef3', '#f2f2f7', '#2c2c2e', '#000000']) sw.append(swatch(c, B.color, () => { B.color = c; R.cache = null; R.invalidate(); doc.markDirty(); buildInsp(); })); return sw; })()),
        sect(null, row('Snap to objects', E('input.zk-switch', { type: 'checkbox', checked: S.snap, onchange: (e) => { S.snap = e.target.checked; buildMenus(); } })), row('Rulers', E('input.zk-switch', { type: 'checkbox', checked: S.rulers, onchange: (e) => setRulers(e.target.checked) })), row('Minimap', E('input.zk-switch', { type: 'checkbox', checked: S.minimap, onchange: (e) => setMini(e.target.checked) }))));
      insp.firstChild.style.borderBottom = '0'; return;
    }
    const types = new Set(sel.map((o) => o.type)), o0 = sel[0], s0 = o0.s; const F = FF.selFrame();
    const only = (...t) => sel.every((o) => t.includes(o.type)), any = (...t) => sel.some((o) => t.includes(o.type));
    if (!only('conn')) insp.append(sect('Arrange', E('.nums', numField('X', F.x, (v) => FF.setGeom({ x: v })), numField('Y', F.y, (v) => FF.setGeom({ y: v })), numField('W', F.w, (v) => FF.setGeom({ w: v })), numField('H', F.h, (v) => FF.setGeom({ h: v })), ...(sel.length === 1 ? [numField('°', ((o0.rot || 0) * 180) / Math.PI, (v) => FF.setGeom({ rot: v }))] : []))));
    // fill & stroke
    const fillable = any('shape', 'sticky', 'frame', 'card', 'table', 'path'), strokable = !only('text', 'stamp', 'sticky', 'image') || any('image');
    const st = [];
    if (fillable) st.push(only('sticky') ? E('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, E('span.zk-label', 'Colour'), (() => { const sw = E('.swatches'); for (const c of FF.STICKY) sw.append(swatch(c, s0.fill, () => FF.setStyle({ fill: c }))); return sw; })()) : colorRow('Fill', 'fill', s0.fill || 'none'));
    if (strokable) st.push(colorRow(only('stroke') ? 'Colour' : only('conn') ? 'Line' : 'Stroke', 'stroke', s0.stroke || 'none', { none: !only('stroke', 'conn') }));
    if (strokable) { st.push(row('Width', E('input.zk-range', { type: 'range', min: only('stroke') ? 1 : 0, max: only('stroke') ? 60 : 24, step: 1, value: s0.sw || 0, style: { width: '130px' }, oninput: (e) => liveApply({ sw: +e.target.value }), onchange: liveEnd }))); if (!only('stroke', 'image')) st.push(row('Style', seg([{ v: '', label: 'Solid' }, { v: 'dash', label: 'Dashed' }, { v: 'dot', label: 'Dotted' }], s0.dash || '', (v) => { FF.setStyle({ dash: v }); buildInsp(); }))); }
    st.push(row('Opacity', E('input.zk-range', { type: 'range', min: 5, max: 100, step: 1, value: Math.round((s0.op == null ? 1 : s0.op) * 100), style: { width: '130px' }, oninput: (e) => liveApply({ op: +e.target.value / 100 }), onchange: liveEnd })));
    if (!only('stroke', 'conn', 'frame')) st.push(row('Shadow', E('input.zk-switch', { type: 'checkbox', checked: !!s0.shadow, onchange: (e) => FF.setStyle({ shadow: e.target.checked }) })));
    insp.append(sect('Style', ...st));
    if (only('conn')) insp.append(sect('Connector', row(null, seg([{ v: 'straight', label: 'Straight' }, { v: 'elbow', label: 'Elbow' }, { v: 'curve', label: 'Curved' }], o0.kind, (v) => { FF.setProps({ kind: v }, 'Connector Style'); buildInsp(); })), headSel('Start', 'ha', sel), headSel('End', 'hb', sel), row(null, E('button.zk-btn.bordered', { onclick: () => FF.setProps({ ha: o0.hb, hb: o0.ha, a: o0.b, b: o0.a }, 'Reverse') }, 'Reverse Direction'), E('button.zk-btn.bordered', { onclick: () => FF.beginEdit(o0) }, 'Edit Label'))));
    if (any('shape', 'sticky', 'text', 'conn', 'table', 'card')) {
      const tl = [];
      tl.push(row(null, E('select.zk-select', { 'aria-label': 'Font', style: { width: '110px' }, onchange: (e) => FF.setStyle({ font: e.target.value }) }, ...[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['hand', 'Handwritten']].map(([v, n]) => E('option', { value: v, selected: s0.font === v }, n))),
        E('input.zk-input.selectable.num', { type: 'number', min: 6, max: 400, value: Math.round(s0.fs || 20), title: 'Size', 'aria-label': 'Font size', style: { width: '56px' }, onchange: (e) => { if (FF.isEditing()) FF.fmt('size', +e.target.value); else FF.setStyle({ fs: +e.target.value }); } })));
      tl.push(row(null, E('.zk-group', iconBtn('bold', 'Bold (⌘B)', () => FF.fmt('bold'), s0.b), iconBtn('italic', 'Italic (⌘I)', () => FF.fmt('italic'), s0.i), iconBtn('underline', 'Underline (⌘U)', () => FF.fmt('underline'), s0.u), iconBtn('strikethrough', 'Strikethrough', () => FF.fmt('strikeThrough'), s0.st)),
        seg([{ v: 'left', icon: 'align-left', title: 'Align left' }, { v: 'center', icon: 'align-center', title: 'Center' }, { v: 'right', icon: 'align-right', title: 'Align right' }], s0.ta || 'left', (v) => { FF.setStyle({ ta: v }); buildInsp(); })));
      if (!only('conn', 'text')) tl.push(row('Vertical', seg([{ v: 'top', icon: 'align-start-horizontal', title: 'Top' }, { v: 'middle', icon: 'align-center-horizontal', title: 'Middle' }, { v: 'bottom', icon: 'align-end-horizontal', title: 'Bottom' }], s0.va || 'top', (v) => { FF.setStyle({ va: v }); buildInsp(); })));
      const tc = E('.swatches'); tc.append(swatch('ink', s0.tc || 'ink', () => FF.fmt('color', 'ink'))); for (const c of FF.PALETTE.slice(1, 11)) tc.append(swatch(c, s0.tc, () => FF.fmt('color', c))); tl.push(E('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, E('span.zk-label', 'Text colour'), tc));
      insp.append(sect('Text', ...tl));
    }
    if (only('table')) insp.append(sect('Table', row(null, E('button.zk-btn.bordered', { onclick: () => FF.tableOp('addRow') }, 'Add Row'), E('button.zk-btn.bordered', { onclick: () => FF.tableOp('addCol') }, 'Add Column')), row(null, E('button.zk-btn.bordered', { onclick: () => FF.tableOp('delRow') }, 'Delete Row'), E('button.zk-btn.bordered', { onclick: () => FF.tableOp('delCol') }, 'Delete Column')), row('Header row', E('input.zk-switch', { type: 'checkbox', checked: !!o0.hdr, onchange: () => FF.tableOp('hdr') }))));
    if (only('frame')) insp.append(sect('Frame', row('Title', E('input.zk-input.selectable', { value: o0.title || '', style: { width: '150px' }, onchange: (e) => FF.setProps({ title: e.target.value }, 'Rename Frame') })), row(null, E('button.zk-btn.bordered', { onclick: () => exportDialog('png', { frame: o0.id }) }, 'Export Frame…'))));
    if (only('card')) insp.append(sect('Link', row(null, E('button.zk-btn.bordered', { onclick: () => FF.editCard(o0) }, 'Edit Title & URL…'))));
    // arrange
    const al = [];
    if (sel.length > 1) al.push(row(null, E('.zk-group', ...[['align-start-vertical', 'left', 'Align left'], ['align-center-vertical', 'hcenter', 'Align centres horizontally'], ['align-end-vertical', 'right', 'Align right'], ['align-start-horizontal', 'top', 'Align top'], ['align-center-horizontal', 'vmiddle', 'Align middles'], ['align-end-horizontal', 'bottom', 'Align bottom']].map(([i, k, t]) => iconBtn(i, t, () => FF.align(k))))), row(null, E('button.zk-btn.bordered', { onclick: () => FF.distribute('h') }, 'Distribute H'), E('button.zk-btn.bordered', { onclick: () => FF.distribute('v') }, 'Distribute V')));
    al.push(row(null, E('.zk-group', iconBtn('bring-to-front', 'Bring to front', () => FF.order('front')), iconBtn('arrow-up', 'Bring forward', () => FF.order('forward')), iconBtn('arrow-down', 'Send backward', () => FF.order('backward')), iconBtn('send-to-back', 'Send to back', () => FF.order('back'))), E('.zk-group', iconBtn('group', 'Group (⌘G)', FF.group), iconBtn('ungroup', 'Ungroup (⇧⌘G)', FF.ungroup), iconBtn(sel.every((o) => o.lock) ? 'lock' : 'unlock', 'Lock / Unlock', FF.toggleLock, sel.every((o) => o.lock)))));
    insp.append(sect(null, ...al));
  }
  const syncGeom = () => { if (!inspOn || !FF.selObjs().length || document.activeElement?.closest?.('#insp')) return; buildInsp(); };
  let inspT = 0;
  FF.on('sel', () => { clearTimeout(inspT); inspT = setTimeout(() => { if (inspUser === null) { /* auto: leave */ } buildInsp(); syncUndo(); }, 0); });
  FF.on('xform', () => { if (!inspT) inspT = setTimeout(() => { inspT = 0; syncGeom(); }, 120); });
  FF.on('history', () => buildInsp());
  const refreshUI = () => { };

  // ---------- boards (tabs) ----------
  const tabsEl = $('#boards');
  function renderTabs() {
    tabsEl.replaceChildren(...FF.boards.map((b) => { const t = E('button.tab' + (b === FF.B ? '.on' : ''), { type: 'button', title: 'Double-click to rename', onclick: () => switchBoard(b), ondblclick: () => renameBoard(b), oncontextmenu: (e) => zk.contextMenu(e, [{ label: 'Rename…', run: () => renameBoard(b) }, { label: 'Duplicate Board', run: () => dupBoard(b) }, { separator: true }, { label: 'Delete Board', enabled: FF.boards.length > 1, run: () => delBoard(b) }]) }, b.name); return t; }), zk.btn({ icon: 'plus', title: 'New Board', onClick: addBoard }));
    tabsEl.firstChild && (tabsEl.style.display = FF.boards.length > 1 || true ? 'flex' : 'none');
  }
  function switchBoard(b) { if (b === FF.B) return; if (S.editing) FF.endEdit(); FF.B.view = { ...R.view }; FF.setBoard(b); }
  function addBoard() { const b = FF.newBoard('Board ' + (FF.boards.length + 1)); centerView(b); FF.boards.push(b); doc.markDirty(); switchBoard(b); }
  async function renameBoard(b) { const n = await zk.prompt('Rename Board', b.name); if (n) { b.name = n; renderTabs(); doc.markDirty(); } }
  function dupBoard(b) { const nb = FF.boardFromJSON(FF.serializeBoard(b)); nb.id = FF.id(); nb.name = b.name + ' Copy'; FF.boards.splice(FF.boards.indexOf(b) + 1, 0, nb); doc.markDirty(); switchBoard(nb); }
  async function delBoard(b) { if (FF.boards.length < 2) return; if (!(await zk.confirm('Delete “' + b.name + '”?', 'This board and its contents will be removed.', 'Delete', { danger: true }))) return; const i = FF.boards.indexOf(b); FF.boards.splice(i, 1); doc.markDirty(); if (FF.B === b) { FF.setBoard(FF.boards[Math.max(0, i - 1)]); } else renderTabs(); }
  const nextBoard = (d) => { const i = FF.boards.indexOf(FF.B); switchBoard(FF.boards[(i + d + FF.boards.length) % FF.boards.length]); };

  // ---------- minimap & rulers ----------
  const mini = $('#minimap'), mg = mini.getContext('2d'); mini.width = 360; mini.height = 240; let miniMap = null;
  function drawMini() {
    if (!S.minimap) return; const W = 360, H = 240, dpr = 2; const v = R.view, r = FF.getRect(); const vb = [v.x, v.y, v.x + r.width / v.z, v.y + r.height / v.z];
    let b = FF.B.objs.length ? FF.unionBB(FF.B.objs) : vb.slice(); b = [Math.min(b[0], vb[0]), Math.min(b[1], vb[1]), Math.max(b[2], vb[2]), Math.max(b[3], vb[3])];
    const pw = (b[2] - b[0]) * 0.06 + 10, ph = (b[3] - b[1]) * 0.06 + 10; b = [b[0] - pw, b[1] - ph, b[2] + pw, b[3] + ph]; const sc = Math.min(W / (b[2] - b[0]), H / (b[3] - b[1])); const ox = (W - (b[2] - b[0]) * sc) / 2, oy = (H - (b[3] - b[1]) * sc) / 2;
    miniMap = { b, sc, ox, oy };
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, W, H); mg.fillStyle = FF.boardColor(FF.B, FF.dark); mg.globalAlpha = 0.5; mg.fillRect(0, 0, W, H); mg.globalAlpha = 1;
    const dark = FF.dark; let n = 0;
    for (const o of FF.B.objs) { const q = FF.bb(o); const x = (q[0] - b[0]) * sc + ox, y = (q[1] - b[1]) * sc + oy, w = Math.max(1.5, (q[2] - q[0]) * sc), h = Math.max(1.5, (q[3] - q[1]) * sc); mg.fillStyle = FF.col(o.s.fill && o.s.fill !== 'none' && o.type !== 'frame' ? o.s.fill : o.s.stroke === 'none' ? 'ink' : o.s.stroke || 'ink', dark); mg.globalAlpha = o.type === 'frame' ? 0.15 : o.type === 'stroke' ? 0.8 : 0.6; mg.fillRect(x, y, w, h); if (++n > 6000) break; }
    mg.globalAlpha = 1; const x = (vb[0] - b[0]) * sc + ox, y = (vb[1] - b[1]) * sc + oy, w = (vb[2] - vb[0]) * sc, h = (vb[3] - vb[1]) * sc; mg.fillStyle = 'rgba(255,55,95,.12)'; mg.fillRect(x, y, w, h); mg.strokeStyle = '#ff375f'; mg.lineWidth = 2; mg.strokeRect(x, y, w, h);
  }
  FF.on('change', () => { if (!hudRaf) hudRaf = requestAnimationFrame(() => { hudRaf = 0; drawMini(); }); });
  mini.addEventListener('pointerdown', (e) => { mini.setPointerCapture(e.pointerId); const go = (ev) => { if (!miniMap) return; const rc = mini.getBoundingClientRect(); const mx = ((ev.clientX - rc.left) / rc.width) * 360, my = ((ev.clientY - rc.top) / rc.height) * 240; const wx = (mx - miniMap.ox) / miniMap.sc + miniMap.b[0], wy = (my - miniMap.oy) / miniMap.sc + miniMap.b[1]; const r = FF.getRect(); FF.setView(wx - r.width / R.view.z / 2, wy - r.height / R.view.z / 2, R.view.z); }; go(e); const mv = (ev) => go(ev), up = () => { mini.removeEventListener('pointermove', mv); mini.removeEventListener('pointerup', up); }; mini.addEventListener('pointermove', mv); mini.addEventListener('pointerup', up); });
  const setMini = (on) => { S.minimap = on; mini.classList.toggle('zk-hidden', !on); $('#z-map').setAttribute('aria-pressed', on); $('#z-map').classList.toggle('on', on); if (on) drawMini(); buildMenus(); };
  $('#z-map').onclick = () => setMini(!S.minimap);
  const rt = $('#rul-top'), rl = $('#rul-left');
  function setRulers(on) { S.rulers = on; rt.classList.toggle('zk-hidden', !on); rl.classList.toggle('zk-hidden', !on); if (on) drawRulers(); buildMenus(); }
  const niceStep = (min) => { for (const m of [1, 2, 5]) for (let p = -1; p < 8; p++) { const s = m * 10 ** p; if (s >= min) return s; } return 1e8; };
  function drawRulers() {
    if (!S.rulers) return; const r = FF.getRect(), v = R.view, dpr = window.devicePixelRatio || 1, dark = FF.dark; const fg = dark ? '235,235,245' : '60,60,67';
    const step = niceStep(60 / v.z), sub = step / 5;
    for (const [cv, horiz] of [[rt, true], [rl, false]]) {
      const L = horiz ? r.width : r.height; cv.width = (horiz ? L : 22) * dpr; cv.height = (horiz ? 22 : L) * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
      g.fillStyle = dark ? 'rgba(40,40,44,.9)' : 'rgba(246,246,248,.9)'; g.fillRect(0, 0, horiz ? L : 22, horiz ? 22 : L); g.fillStyle = `rgba(${fg},.6)`; g.strokeStyle = `rgba(${fg},.35)`; g.font = '9px system-ui'; g.lineWidth = 1;
      const w0 = horiz ? v.x : v.y; const start = Math.floor(w0 / sub) * sub; g.beginPath();
      for (let w = start; (w - w0) * v.z < L; w += sub) { const p = Math.round((w - w0) * v.z) + 0.5; const major = Math.abs(w / step - Math.round(w / step)) < 1e-6; const len = major ? 14 : 5; if (horiz) { g.moveTo(p, 22); g.lineTo(p, 22 - len); } else { g.moveTo(22, p); g.lineTo(22 - len, p); } if (major) { const lab = String(Math.round(w * 100) / 100); if (horiz) g.fillText(lab, p + 3, 10); else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.fillText(lab, 0, 0); g.restore(); } } }
      g.stroke();
    }
  }

  // ---------- zoom controls ----------
  const zin = () => FF.animateTo(null, null, Math.min(32, R.view.z * 1.4), FF.getRect().width / 2, FF.getRect().height / 2), zout = () => FF.animateTo(null, null, Math.max(0.02, R.view.z / 1.4), FF.getRect().width / 2, FF.getRect().height / 2);
  $('#z-in').onclick = zin; $('#z-out').onclick = zout; $('#z-fit').onclick = () => FF.zoomFit();
  const zoomTo = (z) => FF.animateTo(null, null, z, FF.getRect().width / 2, FF.getRect().height / 2);
  const zoomSel = () => { const o = FF.selObjs(); if (o.length) FF.zoomFit(o); else FF.zoomFit(); };
  $('#b-zoom').onclick = (e) => zk.menu([{ label: 'Zoom In', accel: 'CmdOrCtrl+Plus', run: zin }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: zout }, { label: 'Actual Size (100%)', accel: 'CmdOrCtrl+0', run: () => zoomTo(1) }, { separator: true }, { label: 'Zoom to Fit', accel: 'Shift+1', run: () => FF.zoomFit() }, { label: 'Zoom to Selection', accel: 'Shift+2', run: zoomSel }, { separator: true }, ...[0.25, 0.5, 1, 2, 4].map((z) => ({ label: z * 100 + '%', run: () => zoomTo(z) }))], { anchor: e.currentTarget });
  $('#b-undo').onclick = () => doUndo(); $('#b-redo').onclick = () => doRedo();
  const syncUndo = () => { const B = FF.B; $('#b-undo').disabled = !B.undo.length; $('#b-redo').disabled = !B.redo.length; };
  const inField = () => { const a = document.activeElement; return a && a.closest && a.closest('input,textarea,[contenteditable="true"]'); };
  const doUndo = () => { if (S.editing || (inField() && !document.activeElement.closest('#insp'))) return document.execCommand('undo'); if (FF.undo()) { FF.pruneSel(); R.invalidate(); } };
  const doRedo = () => { if (S.editing || (inField() && !document.activeElement.closest('#insp'))) return document.execCommand('redo'); if (FF.redo()) { FF.pruneSel(); R.invalidate(); } };

  // ---------- export dialog ----------
  async function exportDialog(fmt = 'png', scope0) {
    if (S.editing) FF.endEdit();
    const frames = FF.B.objs.filter((o) => o.type === 'frame').sort((a, b) => (a.seq || 0) - (b.seq || 0)); const hasSel = FF.selObjs().length > 0;
    let f = fmt, scale = 2, transparent = false, dark = false, area = scope0 ? 'f:' + scope0.frame : hasSel ? 'selection' : 'board';
    const body = E('.exp-grid'); const redraw = () => {
      body.replaceChildren(E('span.zk-label', 'Format'), seg([{ v: 'png', label: 'PNG' }, { v: 'jpeg', label: 'JPEG' }, { v: 'svg', label: 'SVG' }, { v: 'pdf', label: 'PDF' }, { v: 'json', label: 'JSON' }], f, (v) => { f = v; if (v === 'jpeg') transparent = false; redraw(); }));
      if (f !== 'json') body.append(E('span.zk-label', 'Area'), E('select.zk-select', { onchange: (e) => (area = e.target.value) }, E('option', { value: 'board', selected: area === 'board' }, 'Whole board'), hasSel ? E('option', { value: 'selection', selected: area === 'selection' }, 'Selection') : null, f === 'pdf' && frames.length ? E('option', { value: 'frames', selected: area === 'frames' }, 'All frames (one per page)') : null, ...frames.map((fr) => E('option', { value: 'f:' + fr.id, selected: area === 'f:' + fr.id }, 'Frame: ' + (fr.title || 'Frame')))));
      if (f === 'png' || f === 'jpeg') body.append(E('span.zk-label', 'Scale'), seg([1, 2, 3, 4].map((n) => ({ v: n, label: n + '×' })), scale, (v) => { scale = v; redraw(); }));
      if (f === 'png' || f === 'svg') body.append(E('span.zk-label', 'Background'), E('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, E('input.zk-check', { type: 'checkbox', checked: transparent, onchange: (e) => (transparent = e.target.checked) }), 'Transparent'));
      if (f !== 'json') body.append(E('span.zk-label', 'Appearance'), seg([{ v: false, label: 'Light' }, { v: true, label: 'Dark' }], dark, (v) => { dark = v; redraw(); }));
    }; redraw();
    const r = await zk.sheet({ title: 'Export', body, width: 440, buttons: [{ label: 'Cancel', value: null }, { label: f === 'pdf' ? 'Print to PDF…' : 'Export…', primary: true, value: 'ok' }] });
    if (r !== 'ok') return; const sc = area.startsWith('f:') ? { frame: area.slice(2) } : area;
    const base = (doc.file ? doc.file.name : doc.untitled).replace(/\.[^.]+$/, '') + (area.startsWith('f:') ? '-' + (FF.B.map.get(area.slice(2)).title || 'frame') : '');
    try {
      if (f === 'pdf') { const scopes = area === 'frames' ? frames.map((fr) => ({ frame: fr.id })) : [sc]; FF.printPDF(scopes, { dark }); return; }
      if (f === 'json') return await save(JSON.stringify(FF.docJSON(true), null, 1), base + '.json', 'JSON', ['json']);
      if (f === 'svg') { const s = FF.toSVG(sc, { dark, transparent }); if (!s) return zk.alert('Nothing to export', 'The selected area is empty.'); return await save(s, base + '.svg', 'SVG', ['svg']); }
      const blob = await FF.exportRaster(sc, { scale, transparent: f === 'png' && transparent, dark, jpeg: f === 'jpeg' }); await save(new Uint8Array(await blob.arrayBuffer()), base + (f === 'jpeg' ? '.jpg' : '.png'), f === 'jpeg' ? 'JPEG' : 'PNG', f === 'jpeg' ? ['jpg', 'jpeg'] : ['png']);
    } catch (e) { zk.alert('Couldn’t export', e.message || String(e)); }
  }
  async function save(data, name, label, exts) { const h = await zeng.files.saveAs(data, { name, filters: [{ name: label, exts }] }); if (h) zk.toast('Exported ' + h.name); }
  $('#b-export').onclick = (e) => zk.menu([...exportDefs.map(([l, x]) => ({ label: l, run: () => exportDialog(x) })), { separator: true }, { label: 'Copy as PNG', accel: 'CmdOrCtrl+Shift+C', run: () => FF.copyPNG(FF.selObjs().length ? 'selection' : 'board') }], { anchor: e.currentTarget, align: 'end' });

  // ---------- present ----------
  let pres = null;
  const frameList = () => FF.B.objs.filter((o) => o.type === 'frame').sort((a, b) => (a.seq || 0) - (b.seq || 0));
  function startPresent(i = 0) {
    const fr = frameList(); if (!fr.length) return zk.alert('No frames to present', 'Add frames (F) around the parts of the board you want to show, then present.');
    if (S.editing) FF.endEdit(); FF.clearSel(); pres = { i, saved: { ...R.view }, tool: S.tool }; FF.setTool('select'); $('#app').classList.add('presenting'); $('#presentbar').classList.remove('zk-hidden'); zeng.fullscreen(true); setTimeout(() => { FF.refreshRect(); goPresent(0); }, 350);
  }
  function goPresent(d) { const fr = frameList(); if (!pres || !fr.length) return; pres.i = zk.clamp(pres.i + d, 0, fr.length - 1); const f = fr[pres.i], b = FF.bb(f); const [x, y, z] = FF.fitRect(b, 40, 8); FF.animateTo(x, y, z); $('#p-count').textContent = `${pres.i + 1} / ${fr.length}`; }
  function endPresent() { if (!pres) return; const s = pres.saved; pres = null; $('#app').classList.remove('presenting'); $('#presentbar').classList.add('zk-hidden'); zeng.fullscreen(false); setTimeout(() => { FF.refreshRect(); FF.animateTo(s.x + FF.getRect().width / s.z / 2, s.y + FF.getRect().height / s.z / 2, s.z); }, 300); FF.setTool('select'); }
  $('#presentbar').classList.add('zk-hidden');
  $('#p-next').onclick = () => goPresent(1); $('#p-prev').onclick = () => goPresent(-1); $('#p-exit').onclick = endPresent; $('#p-laser').onclick = () => FF.setTool(S.tool === 'laser' ? 'select' : 'laser');
  $('#b-present').onclick = () => startPresent();

  // ---------- command palette ----------
  let menuModel = [];
  function openPalette() {
    zk.closePop(); const cmds = []; const walk = (items, pre) => items.forEach((it) => { if (it.separator) return; if (it.submenu) return walk(it.submenu, (pre ? pre + ' › ' : '') + it.label); if (it.run && it.enabled !== false) cmds.push({ label: (pre ? pre + ' › ' : '') + it.label, accel: it.accel, run: it.run }); }); menuModel.forEach((m) => walk(m.items, m.label));
    for (const [k, n] of FF.SHAPES) cmds.push({ label: 'Insert Shape › ' + n, run: () => FF.insertShape(k) });
    for (const t of TOOLS) if (t.id && !t.action && t.id !== 'draw') cmds.push({ label: 'Tool › ' + t.title.replace(/ \(.*/, ''), run: () => pickTool(t.id) });
    for (const [k, l] of [['pen', 'Pen'], ['marker', 'Marker'], ['hl', 'Highlighter'], ['pencil', 'Pencil']]) cmds.push({ label: 'Tool › ' + l, run: () => FF.setTool(k) });
    frameList().forEach((f) => cmds.push({ label: 'Go to Frame › ' + (f.title || 'Frame'), run: () => { const [x, y, z] = FF.fitRect(FF.bb(f), 60); FF.animateTo(x, y, z); } }));
    FF.boards.forEach((b) => cmds.push({ label: 'Go to Board › ' + b.name, run: () => switchBoard(b) }));
    const scrim = E('.zk-scrim'), sheet = E('.zk-sheet.palette.pal', { role: 'dialog', 'aria-label': 'Command palette' }); const inp = E('input.selectable', { placeholder: 'Type a command…', spellcheck: false, 'aria-label': 'Command' }), list = E('.list'); sheet.append(inp, list); scrim.append(sheet); document.body.append(scrim);
    let items = cmds, hl = 0; const close = () => { scrim.remove(); document.removeEventListener('keydown', key, true); stage.focus({ preventScroll: true }); };
    const draw = () => { const q = inp.value.toLowerCase().split(/\s+/).filter(Boolean); items = cmds.filter((c) => q.every((t) => c.label.toLowerCase().includes(t))).slice(0, 80); hl = Math.min(hl, Math.max(0, items.length - 1)); list.replaceChildren(...items.map((c, i) => E('.it' + (i === hl ? '.hl' : ''), { onclick: () => { close(); c.run(); }, onpointerenter: () => { hl = i; [...list.children].forEach((x, j) => x.classList.toggle('hl', j === i)); } }, E('span', c.label), c.accel ? E('span.accel', zk.accelLabel(c.accel)) : null))); const h = list.children[hl]; h && h.scrollIntoView({ block: 'nearest' }); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(items.length - 1, hl + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(0, hl - 1); draw(); } else if (e.key === 'Enter') { e.preventDefault(); const c = items[hl]; close(); c && c.run(); } };
    document.addEventListener('keydown', key, true); inp.addEventListener('input', () => { hl = 0; draw(); }); scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); }); draw(); inp.focus();
  }
  $('#b-cmd').onclick = openPalette;

  // ---------- menus ----------
  const canvasOnly = (fn, cmd) => () => { if (S.editing || (inField() && cmd)) { if (cmd) document.execCommand(cmd); return; } fn(); };
  const sel1 = () => FF.selObjs().length;
  const orderMenu = () => [{ label: 'Bring to Front', accel: 'CmdOrCtrl+Shift+]', run: () => FF.order('front') }, { label: 'Bring Forward', accel: 'CmdOrCtrl+]', run: () => FF.order('forward') }, { label: 'Send Backward', accel: 'CmdOrCtrl+[', run: () => FF.order('backward') }, { label: 'Send to Back', accel: 'CmdOrCtrl+Shift+[', run: () => FF.order('back') }];
  function fileItems() { const fm = doc.fileMenu(); const i = fm.findIndex((x) => x.label === 'Export To'); fm.splice(i + 1, 0, { label: 'Export…', accel: 'CmdOrCtrl+Shift+E', run: () => exportDialog('png') }); return fm; }
  function buildMenus() {
    const shapesMenu = FF.SHAPES.map(([k, n]) => ({ label: n, run: () => FF.insertShape(k) }));
    menuModel = [
      { label: 'File', items: fileItems() },
      { label: 'Edit', items: [
        { label: 'Undo', accel: 'CmdOrCtrl+Z', run: doUndo, enabled: () => FF.B.undo.length > 0 || !!S.editing }, { label: 'Redo', accel: zeng.platform === 'win' ? 'Ctrl+Y' : 'CmdOrCtrl+Shift+Z', run: doRedo, enabled: () => FF.B.redo.length > 0 || !!S.editing }, { separator: true },
        { label: 'Cut', accel: 'CmdOrCtrl+X', run: () => document.execCommand('cut') }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => document.execCommand('copy') }, { label: 'Paste', accel: 'CmdOrCtrl+V', run: () => (inField() ? document.execCommand('paste') : FF.paste()) },
        { label: 'Duplicate', accel: 'CmdOrCtrl+D', run: canvasOnly(FF.duplicate), enabled: () => sel1() > 0 }, { label: 'Delete', run: canvasOnly(FF.deleteSel), enabled: () => sel1() > 0 }, { separator: true },
        { label: 'Select All', accel: 'CmdOrCtrl+A', run: canvasOnly(FF.selectAll, 'selectAll') }, { label: 'Deselect', run: () => FF.clearSel() }, { separator: true },
        { label: 'Copy as PNG', accel: 'CmdOrCtrl+Shift+C', run: () => FF.copyPNG(sel1() ? 'selection' : 'board') }, { label: 'Command Palette…', accel: 'CmdOrCtrl+K', run: openPalette },
      ] },
      { label: 'Insert', items: [
        { label: 'Shape', submenu: shapesMenu }, { label: 'Text', run: FF.insertText }, { label: 'Sticky Note', run: () => FF.insertSticky() }, { label: 'Connector', run: () => FF.setTool('conn') },
        { label: 'Image…', run: FF.pickImages }, { label: 'Link Card…', run: FF.insertCard }, { label: 'Table', run: FF.insertTable }, { label: 'Frame', run: FF.insertFrame }, { label: 'Stamp', run: () => emojiPicker(toolBtns.stamp) },
      ] },
      { label: 'Tools', items: [['Select', 'select', 'V'], ['Hand', 'hand', 'G'], ['Pen', 'pen', 'P'], ['Marker', 'marker', 'M'], ['Highlighter', 'hl', 'H'], ['Pencil', 'pencil', 'B'], ['Eraser', 'eraser', 'E'], ['Lasso', 'lasso', 'L'], ['Shape', 'shape', 'S'], ['Text', 'text', 'T'], ['Sticky Note', 'sticky', 'N'], ['Connector', 'conn', 'C'], ['Frame', 'frame', 'F'], ['Table', 'table', 'Shift+T'], ['Stamp', 'stamp', 'Shift+E'], ['Laser Pointer', 'laser', 'W'], ['Eyedropper', 'eyedrop', 'D']].map(([l, id, k]) => ({ label: l, checked: S.tool === id, run: () => (id === 'eyedrop' ? (S.prevTool = 'select', FF.setTool(id)) : FF.setTool(id)), _k: k })) },
      { label: 'Arrange', items: [
        { label: 'Group', accel: 'CmdOrCtrl+G', run: FF.group, enabled: () => sel1() > 1 }, { label: 'Ungroup', accel: 'CmdOrCtrl+Shift+G', run: FF.ungroup }, { label: 'Lock / Unlock', accel: 'CmdOrCtrl+L', run: FF.toggleLock, enabled: () => sel1() > 0 }, { separator: true },
        ...orderMenu(), { separator: true },
        { label: 'Align', submenu: [['Left', 'left'], ['Centre Horizontally', 'hcenter'], ['Right', 'right'], ['Top', 'top'], ['Centre Vertically', 'vmiddle'], ['Bottom', 'bottom']].map(([l, k]) => ({ label: l, run: () => FF.align(k) })) },
        { label: 'Distribute', submenu: [{ label: 'Horizontally', run: () => FF.distribute('h') }, { label: 'Vertically', run: () => FF.distribute('v') }] },
        { label: 'Flip Drawing', submenu: [{ label: 'Horizontal', run: () => FF.flip('h') }, { label: 'Vertical', run: () => FF.flip('v') }] },
      ] },
      { label: 'Text', items: [{ label: 'Bold', accel: 'CmdOrCtrl+B', run: () => FF.fmt('bold') }, { label: 'Italic', accel: 'CmdOrCtrl+I', run: () => FF.fmt('italic') }, { label: 'Underline', accel: 'CmdOrCtrl+U', run: () => FF.fmt('underline') }, { label: 'Strikethrough', accel: 'CmdOrCtrl+Shift+X', run: () => FF.fmt('strikeThrough') }, { separator: true }, { label: 'Bigger', run: () => bumpSize(2) }, { label: 'Smaller', run: () => bumpSize(-2) }] },
      { label: 'View', items: [
        { label: 'Zoom In', accel: 'CmdOrCtrl+Plus', run: zin }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: zout }, { label: 'Actual Size', accel: 'CmdOrCtrl+0', run: () => zoomTo(1) }, { label: 'Zoom to Fit', accel: 'Shift+1', run: () => FF.zoomFit() }, { label: 'Zoom to Selection', accel: 'Shift+2', run: zoomSel }, { separator: true },
        { label: 'Dot Grid', checked: FF.B.bg === 'dot', run: () => setBg('dot') }, { label: 'Square Grid', checked: FF.B.bg === 'grid', run: () => setBg('grid') }, { label: 'No Grid', checked: FF.B.bg === 'none', run: () => setBg('none') }, { separator: true },
        { label: 'Snap to Objects', checked: S.snap, run: () => { S.snap = !S.snap; buildMenus(); if (inspOn) buildInsp(); } }, { label: 'Rulers', checked: S.rulers, run: () => setRulers(!S.rulers) }, { label: 'Minimap', checked: S.minimap, run: () => setMini(!S.minimap) }, { label: 'Inspector', accel: 'CmdOrCtrl+Alt+I', checked: inspOn, run: () => setInsp(!inspOn) }, { separator: true },
        { label: 'Present Frames', accel: 'CmdOrCtrl+Alt+P', run: () => startPresent() },
      ] },
      { label: 'Board', items: [{ label: 'New Board', accel: 'CmdOrCtrl+Alt+N', run: addBoard }, { label: 'Rename Board…', run: () => renameBoard(FF.B) }, { label: 'Duplicate Board', run: () => dupBoard(FF.B) }, { label: 'Delete Board', run: () => delBoard(FF.B), enabled: FF.boards.length > 1 }, { separator: true }, { label: 'Next Board', accel: 'CmdOrCtrl+Alt+Right', run: () => nextBoard(1) }, { label: 'Previous Board', accel: 'CmdOrCtrl+Alt+Left', run: () => nextBoard(-1) }, { separator: true }, { label: 'Go to Frame', submenu: frameList().length ? frameList().map((f) => ({ label: f.title || 'Frame', run: () => { const [x, y, z] = FF.fitRect(FF.bb(f), 60); FF.animateTo(x, y, z); } })) : [{ label: 'No frames', enabled: false }] }] },
    ];
    menuModel[3].items.forEach((it) => { if (it._k) it.accel = it._k.length === 1 ? undefined : it._k; });
    zeng.setMenus(menuModel);
  }
  const setBg = (v) => { FF.B.bg = v; R.invalidate(); doc.markDirty(); buildMenus(); if (inspOn) buildInsp(); };
  const bumpSize = (d) => { const o = FF.selObjs()[0]; if (o && o.s.fs) FF.fmt('size', Math.max(6, (o.s.fs || 20) + d)); };

  // context menu
  FF.on('ctx', ({ e, o }) => {
    const has = sel1() > 0;
    zk.menu(has ? [
      { label: 'Cut', run: () => document.execCommand('cut') }, { label: 'Copy', run: () => document.execCommand('copy') }, { label: 'Paste', run: FF.paste }, { label: 'Duplicate', run: FF.duplicate }, { label: 'Delete', run: FF.deleteSel }, { separator: true },
      ...(o && (o.type === 'shape' || o.type === 'sticky' || o.type === 'text' || o.type === 'conn') ? [{ label: 'Edit Text', run: () => FF.beginEdit(o) }] : []),
      { label: 'Group', run: FF.group, enabled: sel1() > 1 }, { label: 'Ungroup', run: FF.ungroup }, { label: FF.selObjs().every((x) => x.lock) ? 'Unlock' : 'Lock', run: FF.toggleLock }, { label: 'Arrange', submenu: orderMenu() }, { separator: true },
      { label: 'Copy as PNG', run: () => FF.copyPNG('selection') }, { label: 'Export Selection…', run: () => exportDialog('png') },
    ] : [{ label: 'Paste', run: FF.paste }, { label: 'Select All', run: FF.selectAll }, { separator: true }, { label: 'New Sticky Note', run: () => FF.insertSticky() }, { label: 'New Text', run: FF.insertText }, { label: 'New Frame', run: FF.insertFrame }, { separator: true }, { label: 'Zoom to Fit', run: () => FF.zoomFit() }], { x: e.clientX, y: e.clientY });
  });

  // ---------- keyboard ----------
  const KEYS = { v: 'select', g: 'hand', p: 'pen', m: 'marker', h: 'hl', b: 'pencil', e: 'eraser', l: 'lasso', s: 'shape', t: 'text', n: 'sticky', c: 'conn', f: 'frame', w: 'laser', d: 'eyedrop' };
  addEventListener('keydown', (e) => {
    const tgt = e.target; if (tgt.closest && tgt.closest('input,textarea,select,[contenteditable="true"],.zk-scrim')) return; if (S.editing) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    if (pres) { if (k === 'Escape') { e.preventDefault(); endPresent(); } else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(k)) { e.preventDefault(); goPresent(1); } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); goPresent(-1); } return; }
    if (k === ' ' && !mod) { e.preventDefault(); if (!S.space) { S.space = true; FF.updCursor(); } return; }
    if (mod) { if (k === '=' && !e.altKey) { e.preventDefault(); zin(); } return; }
    if (e.altKey) return;
    if (k === 'Escape') { if (S.tool !== 'select') FF.setTool('select'); else FF.clearSel(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); FF.deleteSel(); return; }
    if (k.startsWith('Arrow')) { if (!sel1()) return; e.preventDefault(); const d = e.shiftKey ? 10 : 1; FF.nudge(k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0); return; }
    if (k === 'Enter') { const o = FF.selObjs(); if (o.length === 1 && ['shape', 'sticky', 'text', 'conn', 'frame'].includes(o[0].type)) { e.preventDefault(); FF.beginEdit(o[0]); } else if (o.length === 1 && o[0].type === 'table') { e.preventDefault(); FF.beginEdit(o[0], { cell: [0, 0] }); } return; }
    const lk = k.toLowerCase();
    if (e.shiftKey) { if (lk === 't') return FF.setTool('table'), e.preventDefault(); if (lk === 'e') return pickTool('stamp'), e.preventDefault(); if (k === '!' || k === '1') { e.preventDefault(); return FF.zoomFit(); } if (k === '@' || k === '2') { e.preventDefault(); return zoomSel(); } return; }
    if (lk === 'i') return FF.pickImages();
    if (lk === 'r') { S.shape = 'rect'; return FF.setTool('shape'); } if (lk === 'o') { S.shape = 'ellipse'; return FF.setTool('shape'); }
    if (KEYS[lk]) { e.preventDefault(); if (lk === 'd') S.prevTool = 'select'; FF.setTool(KEYS[lk]); }
  });
  addEventListener('keyup', (e) => { if (e.key === ' ' && S.space) { S.space = false; FF.updCursor(); } });
  addEventListener('blur', () => { S.space = false; });
  zeng.shortcut('CmdOrCtrl+K', openPalette);
  zeng.shortcut('CmdOrCtrl+=', zin);

  // ---------- drafts (autosave) ----------
  let draftT = 0, hasDraft = false;
  const draftKey = 'draft';
  function scheduleDraft() { clearTimeout(draftT); draftT = setTimeout(saveDraft, 2500); }
  async function saveDraft() {
    if (!doc.dirty) return; try { const j = FF.docJSON(true); const s = JSON.stringify(j); if (s.length > 60e6) return; await zeng.store.set(draftKey, { t: Date.now(), name: doc.file ? doc.file.name : doc.untitled + '.zfree', json: j }); hasDraft = true; } catch (e) { console.warn('draft', e); }
  }
  const clearDraft = async () => { if (hasDraft) { hasDraft = false; await zeng.store.set(draftKey, null); } };
  setInterval(() => { if (!doc.dirty && hasDraft) clearDraft(); }, 3000);
  const q0 = zeng.quit; zeng.quit = () => { clearDraft().finally(() => q0()); setTimeout(q0, 200); };
  FF.saveDraftNow = saveDraft;

  // ---------- OS file drops handled by the kit (zeng.doc): images fall through to onOtherFiles ----------
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); const fs = [...(e.dataTransfer.files || [])]; if (!fs.length) { const t = e.dataTransfer.getData('text/plain'); if (t) FF.pasteText(t.trim(), FF.s2w(e.clientX - FF.getRect().left, e.clientY - FF.getRect().top)); return; } const at = FF.s2w(e.clientX - FF.getRect().left, e.clientY - FF.getRect().top); const zf = fs.filter((f) => /\.zfree$/i.test(f.name)); if (zf.length) return doc.openHandle({ name: zf[0].name, file: zf[0] }); FF.insertFiles(fs.map((f) => ({ name: f.name, file: f })), at); }, true);

  // ---------- performance fixture ----------
  window.__ff = {
    FF,
    gen(n = 3000) {
      const B = FF.newBoard('Perf'); const cols = Math.ceil(Math.sqrt(n)); const rnd = (() => { let s = 42; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
      const objs = []; let pts = 0;
      for (let i = 0; i < n; i++) {
        const cx = (i % cols) * 260, cy = Math.floor(i / cols) * 200, k = i % 20;
        if (k < 9) objs.push(FF.make('shape', { kind: ['rect', 'round', 'ellipse', 'diamond', 'hexagon', 'cloud', 'star', 'bubble', 'decision'][k], x: cx, y: cy, w: 180, h: 110, t: FF.plainToRuns('Node ' + i + '\nsome label text'), s: { fill: ['paper', '#aed6ff', '#b7ecb0', '#ffc58a'][i % 4], fit: true } }));
        else if (k < 12) objs.push(FF.make('sticky', { x: cx, y: cy, w: 170, h: 170, t: FF.plainToRuns('Idea ' + i + ' — remember to follow up on this item'), s: { fill: FF.STICKY[i % 6] } }));
        else if (k < 18) { const m = 20 + Math.floor(rnd() * 12), w = []; let x = cx, y = cy + 50; for (let j = 0; j < m; j++) { x += 8 + rnd() * 4; y += (rnd() - 0.5) * 14; w.push(x, y, 0.6 + rnd() * 0.6); } pts += m; objs.push(FF.makeStroke(w, { stroke: ['ink', '#ff375f', '#007aff'][i % 3], sw: 4, op: 1, tool: 'pen' })); }
        else objs.push(FF.make('text', { x: cx, y: cy, w: 160, h: 34, autoW: true, t: FF.plainToRuns('Label ' + i), s: { fs: 22 } }));
      }
      objs.forEach((o) => { if (o.type === 'text') FF.fitText(o); B.add(o); });
      for (let i = 0; i + 1 < n; i += 5) { const a = objs[i], b = objs[i + 1]; if (FF.connectable(a) && FF.connectable(b)) B.add(FF.make('conn', { a: { id: a.id, port: 'auto' }, b: { id: b.id, port: 'auto' }, kind: 'elbow', hb: 'arrow' })); }
      FF.boards = [B]; FF.setBoard(B); FF.zoomFit(null, false); return { objects: B.objs.length, strokePoints: pts };
    },
    doc,
  };

  // ---------- boot ----------
  renderTabs(); buildMenus(); FF.emit('tool'); setMini(true); syncUndo(); setInsp(false);
  FF.refreshRect(); centerView(FF.B); R.view = { ...FF.B.view }; FF.emit('view'); R.invalidate();
  await doc.ready; buildMenus();
  stage.focus();
  const draft = await zeng.store.get(draftKey, null);
  if (draft && draft.json) {
    hasDraft = true; const when = new Date(draft.t).toLocaleString();
    const r = await zk.sheet({ title: 'Recover unsaved board?', message: `Freeform found an autosaved draft of “${draft.name}” from ${when}.`, buttons: [{ label: 'Discard', value: 'no' }, { label: 'Recover', primary: true, value: 'yes' }], dismissable: false });
    if (r === 'yes') { try { FF.loadDoc(draft.json, null); doc.untitled = draft.name.replace(/\.[^.]+$/, ''); doc.markDirty(); doc.refreshTitle(); } catch (e) { zk.alert('Couldn’t recover the draft', e.message); await clearDraft(); } } else await clearDraft();
  }
})();
