/* Write UI: title bar, format strip, sidebars, inspector, find bar, status bar, popovers. */
(() => {
  'use strict';
  const P = window.P, $ = P.$, el = zk.el, S = P.S, flow = P.flow;
  const U = (P.ui = {}); const ctl = []; U.F = {};
  const ACC = (a) => (a ? ' (' + zk.accelLabel(a) + ')' : '');
  const nofocus = (b) => { b.addEventListener('pointerdown', (e) => { if (!e.target.closest('input,select,textarea')) e.preventDefault(); }); return b; };
  const btn = (ic, title, onClick, { accel, label, get, cls } = {}) => {
    const b = nofocus(el('button.zk-btn' + (label ? '' : '.icon') + (cls ? '.' + cls : ''), { type: 'button', title: title + ACC(accel), 'aria-label': title, onclick: (e) => onClick(e, b) }));
    if (ic) b.append(zk.icon(ic)); if (label) b.append(label); if (get) ctl.push((F) => { const v = !!get(F); b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); }); return b;
  };
  const group = (...k) => el('.pill', ...k);
  const sep = () => el('.zk-sep');
  const pt1 = (v) => Math.round(v * 10) / 10;

  /* ---------- palettes ---------- */
  const mix = (hex, t) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const HUES = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#30b0c7', '#0a84ff', '#5856d6', '#af52de', '#ff2d55', '#a2845e'];
  const GRAYS = ['#000000', '#2c2c2e', '#48484a', '#636366', '#8e8e93', '#aeaeb2', '#c7c7cc', '#e5e5ea', '#f2f2f7', '#ffffff'];
  U.palette = (anchor, { onPick, none = 'None', current }) => {
    const grid = el('.pal'); const mkSw = (c) => nofocus(el('button.zk-swatch' + (current && current.toLowerCase() === c ? '.sel' : ''), { type: 'button', style: { background: c }, title: c, 'aria-label': c, onclick: () => { zk.closePop(); onPick(c); } }));
    GRAYS.forEach((c) => grid.append(mkSw(c))); [0.55, 0.3, 0, -0.3, -0.55].forEach((t) => HUES.forEach((h) => grid.append(mkSw(mix(h, t)))));
    const custom = el('input.zk-color', { type: 'color', value: '#ff9f0a', title: 'Custom colour', 'aria-label': 'Custom colour' }); custom.onchange = () => { zk.closePop(); onPick(custom.value); };
    const foot = el('.palfoot', nofocus(el('button.zk-btn.bordered', { type: 'button', onclick: () => { zk.closePop(); onPick(null); } }, none)), el('span.zk-label', 'Custom'), custom);
    zk.popover(anchor, el('div', grid, foot), { cls: 'palpop' });
  };
  const colorBtn = (ic, title, get, onPick, none) => { const b = btn(ic, title, () => U.palette(b, { onPick, none, current: P.rgb2hex(get(U.F) || '') }), {}); const bar = el('i.cbar'); b.append(bar); ctl.push((F) => { const c = get(F); bar.style.background = c && c !== 'rgba(0, 0, 0, 0)' ? c : 'transparent'; }); return b; };

  /* ---------- font + style pickers ---------- */
  U.fontPop = (anchor) => {
    const input = el('input.zk-input.selectable', { placeholder: 'Search fonts', style: { width: '100%', marginBottom: '4px' } }); const list = el('.flist');
    const draw = () => { const q = input.value.toLowerCase(); list.replaceChildren(...P.availableFonts().filter((f) => f.toLowerCase().includes(q)).map((f) => nofocus(el('button.fitem' + (f === U.F.font ? '.sel' : ''), { type: 'button', style: { fontFamily: f === 'System UI' ? 'system-ui' : P.fontCss(f) }, onclick: () => { zk.closePop(); P.setFont(f); } }, f)))); };
    input.oninput = draw; draw(); const pop = zk.popover(anchor, el('div', input, list), { cls: 'fontpop' }); setTimeout(() => input.focus(), 30); return pop;
  };
  U.stylePop = (anchor) => {
    const cur = U.F.style || 'Body'; const list = el('.sgal');
    for (const name of Object.keys(S.styles)) {
      const d = P.styleFull(name); if (S.styles[name].hidden) continue;
      list.append(nofocus(el('button.sitem' + (name === cur ? '.sel' : ''), { type: 'button', onclick: () => { zk.closePop(); P.setStyle(name); } },
        el('span.sprev', { style: { fontFamily: P.fontCss(d.font || S.styles.Body.font), fontSize: Math.min(20, Math.max(11, d.size * 1.15)) + 'px', fontWeight: d.bold ? 700 : 400, fontStyle: d.italic ? 'italic' : 'normal', color: d.color === '#ffffff' ? 'inherit' : d.color }, }, name), name === cur ? zk.icon('check') : null)));
    }
    const foot = el('.sfoot', nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); P.updateStyleFromSelection(cur); } }, `Update “${cur}” to match`)), nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); U.modifyStyle(cur); } }, 'Modify…')), nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); U.newStyle(); } }, 'New style…')));
    zk.popover(anchor, el('div', list, foot), { cls: 'stylepop' });
  };
  U.newStyle = async () => { const n = await zk.prompt('New Style', '', { message: 'Name a paragraph style based on the current formatting.', placeholder: 'e.g. Callout', ok: 'Create' }); if (!n || !n.trim() || S.styles[n.trim()]) { if (n && S.styles[n.trim()]) zk.alert('That style already exists', 'Choose another name.'); return; } const name = n.trim(); P.checkpoint(false); S.styles[name] = { next: 'Body' }; P.updateStyleFromSelection(name); P.applyStyleCss(); P.forBlocks((b) => { b.setAttribute('data-st', name); b.removeAttribute('style'); }); };
  U.modifyStyle = async (name) => {
    const d = { ...P.styleFull(name) }; const fonts = P.availableFonts(); const row = (l, c) => el('.zk-field', el('span.zk-label', l), c);
    const font = el('select.zk-select', ...fonts.map((f) => el('option', { value: f, selected: f === d.font }, f))); if (!fonts.includes(d.font)) font.prepend(el('option', { value: d.font, selected: true }, d.font));
    const inp = (k, step = 0.5, w = 64) => { const i = el('input.zk-input.num.selectable', { type: 'number', step, value: d[k] ?? 0, style: { width: w + 'px' } }); i.oninput = () => (d[k] = parseFloat(i.value) || 0); return i; };
    const chk = (k) => { const i = el('input.zk-check', { type: 'checkbox', checked: !!d[k] }); i.onchange = () => (d[k] = i.checked ? 1 : 0); return i; };
    const col = el('input.zk-color', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#1d1d1f' }); col.oninput = () => (d.color = col.value);
    const al = el('select.zk-select', ...['left', 'center', 'right', 'justify'].map((a) => el('option', { value: a, selected: d.align === a }, a)));
    const next = el('select.zk-select', ...Object.keys(S.styles).filter((n) => !S.styles[n].hidden).map((n) => el('option', { value: n, selected: (d.next || name) === n }, n)));
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, row('Font', font), row('Size (pt)', inp('size')), row('Bold', chk('bold')), row('Italic', chk('italic')), row('Underline', chk('underline')), row('Colour', col), row('Alignment', al), row('Line spacing', inp('lh', 0.05)), row('Space before (pt)', inp('sb', 1)), row('Space after (pt)', inp('sa', 1)), row('Indent (px)', inp('il', 6)), row('Next style', next));
    const r = await zk.sheet({ title: 'Modify Style: ' + name, body, width: 360, buttons: [{ label: 'Cancel', value: null }, { label: 'Reset', value: 'reset' }, { label: 'OK', primary: true, value: 'ok' }] });
    if (r === 'ok') { P.checkpoint(false); d.font = font.value; d.align = al.value; d.next = next.value; S.styles[name] = { ...S.styles[name], ...d }; P.applyStyleCss(); P.changed(); P.markDirty(); }
    else if (r === 'reset') { P.checkpoint(false); const def = P.DEFAULT_STYLES()[name]; def ? (S.styles[name] = def) : 0; P.applyStyleCss(); P.changed(); P.markDirty(); }
  };

  /* ---------- insert tiles / table picker / shapes ---------- */
  U.tablePop = (anchor) => {
    const N = 8; const label = el('.tlabel', 'Table'); const grid = el('.tgridp'); const cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const d = el('i', { 'data-r': r, 'data-c': c }); cells.push(d); grid.append(d); }
    const hl = (r, c) => { cells.forEach((d) => d.classList.toggle('on', +d.dataset.r <= r && +d.dataset.c <= c)); label.textContent = r < 0 ? 'Table' : `${r + 1} × ${c + 1} table`; };
    grid.onpointermove = (e) => { const d = e.target.closest('i'); if (d) hl(+d.dataset.r, +d.dataset.c); }; grid.onpointerleave = () => hl(-1, -1);
    grid.onclick = (e) => { const d = e.target.closest('i'); if (d) { zk.closePop(); P.focus(); P.insertTable(+d.dataset.r + 1, +d.dataset.c + 1); } };
    zk.popover(anchor, el('div', label, grid), { cls: 'tablepop' });
  };
  const SHAPES = [['rect', 'Rectangle', 'square'], ['ellipse', 'Ellipse', 'circle'], ['tri', 'Triangle', 'triangle'], ['line', 'Line', 'minus'], ['arrow', 'Arrow', 'arrow-right']];
  U.shapeItems = () => SHAPES.map(([k, l]) => ({ label: l, run: () => { P.focus(); P.insertShape(k); } }));
  U.insertPop = (anchor) => {
    const tiles = [['table', 'Table', (e, b) => { zk.closePop(); setTimeout(() => U.tablePop(anchor), 20); }], ['image', 'Image', () => { zk.closePop(); P.insertImageDialog(); }], ['shapes', 'Shape', () => { zk.closePop(); setTimeout(() => zk.menu(U.shapeItems(), { anchor }), 20); }], ['link', 'Link', () => { zk.closePop(); U.link(); }],
      ['message-square', 'Comment', () => { zk.closePop(); U.addComment(); }], ['superscript', 'Footnote', () => { zk.closePop(); P.insertFootnote(); }], ['list-tree', 'Contents', () => { zk.closePop(); P.insertTOC(); }], ['sigma', 'Equation', () => { zk.closePop(); P.editEquation(); }],
      ['scissors', 'Page break', () => { zk.closePop(); P.insertPageBreak(); }], ['bookmark', 'Bookmark', () => { zk.closePop(); P.insertBookmark(); }], ['external-link', 'Cross-ref', () => { zk.closePop(); P.insertCrossRef(); }], ['calendar', 'Date', () => { zk.closePop(); P.insertSymbol(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })); }]];
    const g = el('.tiles', ...tiles.map(([ic, l, f]) => nofocus(el('button.tile', { type: 'button', onclick: f }, zk.icon(ic, 20), el('span', l)))));
    zk.popover(anchor, g, { cls: 'tilepop', align: 'end' });
  };
  U.link = async () => {
    const a = P.linkAt(); P.focus(); const r = P.range(); const url = await zk.prompt(a ? 'Edit Link' : 'Add Link', a ? a.getAttribute('href') : 'https://', { message: r && !r.collapsed ? 'Link the selected text to this address.' : 'The address will be inserted as the link text.', ok: 'Apply' });
    if (url === null) return; let u = url.trim(); if (u && !/^(https?:|mailto:|tel:|#)/i.test(u)) u = /@/.test(u) && !/\s/.test(u) ? 'mailto:' + u : 'https://' + u; P.setLink(u);
  };
  U.linkPop = (a) => {
    const href = a.getAttribute('href') || ''; const row = el('.linkpop', el('span.lhref', href.length > 38 ? href.slice(0, 38) + '…' : href), nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); P.openLink(a); } }, 'Open')), nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); U.link(); } }, 'Edit')), nofocus(el('button.zk-btn', { type: 'button', onclick: () => { zk.closePop(); P.setLink(''); } }, 'Remove')));
    if (a.closest('[data-toc]')) return; const r = a.getBoundingClientRect(); zk.popover(null, row, { x: r.left, y: r.bottom + 4, cls: 'linkpoppop' });
  };
  U.addComment = () => { const id = P.review.add(''); if (id) { U.showReview(); P.review.setActive(id); U.composeFor = id; U.renderReview(); setTimeout(() => { const t = $('#right textarea.cnew'); t && t.focus(); }, 50); } };

  /* ---------- build: title bar ---------- */
  const tb = $('#tb');
  U.toggleLeft = (v) => { U.left = v === undefined ? !U.left : v; $('#left').classList.toggle('zk-hidden', !U.left); U.refreshAll(); if (U.left) U.drawLeft(); };
  U.toggleRight = (v) => { U.right = v === undefined ? !U.right : v; $('#right').classList.toggle('zk-hidden', !U.right); U.refreshAll(); };
  U.buildTitle = () => {
    tb.replaceChildren(btn('panel-left', 'Sidebar', () => U.toggleLeft(), { accel: 'CmdOrCtrl+Alt+S', get: () => U.left }), group(btn('undo-2', 'Undo', () => P.undo(), { accel: 'CmdOrCtrl+Z', get: null }), btn('redo-2', 'Redo', () => P.redo(), { accel: 'CmdOrCtrl+Shift+Z' })),
      el('.zk-title', { 'data-doc-title': '' }, 'Untitled'), el('.zk-spacer'),
      group(btn('plus', 'Insert', (e, b) => U.insertPop(b), { label: 'Insert' }), btn('table', 'Table', (e, b) => U.tablePop(b)), btn('image', 'Image', () => P.insertImageDialog()), btn('message-square', 'Comment', () => U.addComment(), { accel: 'CmdOrCtrl+Alt+M' })),
      group(btn('crosshair', 'Focus mode', () => P.lens.setFocus(), { accel: 'CmdOrCtrl+Shift+F', get: () => P.lens.focus }), btn('scan-search', 'Readability lens', () => U.showPanel('lens'), { accel: 'CmdOrCtrl+Alt+L', get: () => U.right && U.mode === 'lens' }), btn('search', 'Find and replace', () => U.toggleFind(true), { accel: 'CmdOrCtrl+F', get: () => U.findOpen })),
      btn('panel-right', 'Inspector', () => U.toggleRight(), { accel: 'CmdOrCtrl+Alt+I', get: () => U.right }));
  };

  /* ---------- build: format strip ---------- */
  U.buildStrip = () => {
    const bar = $('#fmtbar'); const styleBtn = nofocus(el('button.zk-btn.bordered.wide', { type: 'button', title: 'Paragraph style', onclick: (e) => U.stylePop(e.currentTarget) })); const sl = el('span.lbl'); styleBtn.append(sl, zk.icon('chevron-down'));
    ctl.push((F) => (sl.textContent = F.ok ? F.style : 'Style'));
    const fontBtn = nofocus(el('button.zk-btn.bordered.fontbtn', { type: 'button', title: 'Font', onclick: (e) => U.fontPop(e.currentTarget) })); const fl = el('span.lbl'); fontBtn.append(fl, zk.icon('chevron-down')); ctl.push((F) => (fl.textContent = F.ok ? F.font : 'Font'));
    const size = el('input.zk-input.num.selectable', { type: 'text', inputmode: 'decimal', 'aria-label': 'Font size', title: 'Font size (pt)', style: { width: '44px', textAlign: 'center' } });
    const setSize = (v) => { v = Math.max(4, Math.min(300, v)); P.setFontSize(Math.round(v * 2) / 2); }; size.onchange = () => { const v = parseFloat(size.value); if (v) setSize(v); P.focus(); };
    size.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setSize((parseFloat(size.value) || 11) + (e.key === 'ArrowUp' ? 1 : -1)); } if (e.key === 'Enter') { size.onchange(); } };
    ctl.push((F) => { if (document.activeElement !== size) size.value = F.ok ? pt1(F.size) : ''; });
    const step = (d) => btn(d > 0 ? 'plus' : 'minus', d > 0 ? 'Larger' : 'Smaller', () => setSize((U.F.size || 11) + d), { cls: 'sm' });
    bar.replaceChildren(styleBtn, fontBtn, group(step(-1), size, step(1)), sep(),
      group(btn('bold', 'Bold', () => P.toggleInline('bold'), { accel: 'CmdOrCtrl+B', get: (F) => F.bold }), btn('italic', 'Italic', () => P.toggleInline('italic'), { accel: 'CmdOrCtrl+I', get: (F) => F.italic }), btn('underline', 'Underline', () => P.toggleInline('underline'), { accel: 'CmdOrCtrl+U', get: (F) => F.underline }), btn('strikethrough', 'Strikethrough', () => P.toggleInline('strikeThrough'), { get: (F) => F.strike })),
      group(colorBtn('baseline', 'Text colour', (F) => F.color, (c) => (c ? P.setColor(c) : P.setColor('#1d1d1f')), 'Automatic'), colorBtn('highlighter', 'Highlight', (F) => F.highlight, (c) => P.setHighlight(c), 'No highlight')), sep(),
      group(btn('align-left', 'Align left', () => P.setAlign('left'), { get: (F) => F.align === 'left' }), btn('align-center', 'Centre', () => P.setAlign('center'), { get: (F) => F.align === 'center' }), btn('align-right', 'Align right', () => P.setAlign('right'), { get: (F) => F.align === 'right' }), btn('align-justify', 'Justify', () => P.setAlign('justify'), { get: (F) => F.align === 'justify' })),
      group(btn('list', 'Bulleted list', () => P.setList('b'), { accel: 'CmdOrCtrl+Shift+8', get: (F) => F.list === 'b' }), btn('list-ordered', 'Numbered list', () => P.setList('n'), { accel: 'CmdOrCtrl+Shift+7', get: (F) => F.list === 'n' || F.list === 'm' }), btn('list-checks', 'Checklist', () => P.setList('c'), { accel: 'CmdOrCtrl+Shift+9', get: (F) => F.list === 'c' }), btn('indent-decrease', 'Decrease indent', () => P.indent(-1), { accel: 'CmdOrCtrl+[' }), btn('indent-increase', 'Increase indent', () => P.indent(1), { accel: 'CmdOrCtrl+]' })),
      btn('wrap-text', 'Line spacing', (e, b) => zk.menu([1, 1.15, 1.35, 1.5, 2].map((v) => ({ label: String(v), checked: Math.abs((U.F.lhNum || 0) - v) < 0.03, run: () => P.setLineHeight(v) })).concat([{ separator: true }, { label: 'Default', run: () => P.setLineHeight(null) }]), { anchor: b }), {}),
      btn('link', 'Link', () => U.link(), { accel: 'CmdOrCtrl+K', get: (F) => !!F.link }), btn('remove-formatting', 'Clear formatting', () => P.clearFormatting(), { accel: 'CmdOrCtrl+\\' }));
  };

  /* ---------- inspector helpers ---------- */
  const section = (title, ...rows) => el('.zk-section', title ? el('.zk-section-title', title) : null, ...rows);
  const field = (label, ...c) => el('.zk-field', el('span.zk-label', label), el('.fctl', ...c));
  const numIn = (get, set, { step = 1, min, max, w = 60, unit } = {}) => { const i = el('input.zk-input.num.selectable', { type: 'number', step, min, max, style: { width: w + 'px' }, 'aria-label': unit || '' }); i.onchange = () => { const v = parseFloat(i.value); if (!isNaN(v)) set(v); }; ctl.push((F) => { if (document.activeElement !== i) { const v = get(F); i.value = v === undefined || v === null || isNaN(v) ? '' : v; } }); return i; };
  const lenIn = (get, set, o = {}) => numIn((F) => { const v = get(F); return v === undefined ? undefined : Math.round(P.fromPx(v) * 100) / 100; }, (v) => set(P.toPx(v, S.units)), { step: S.units === 'cm' ? 0.1 : 0.05, w: 62, ...o });
  const segc = (items, get, set) => { const s = el('.zk-seg'); items.forEach(([v, label, ic]) => { const b = nofocus(el('button', { type: 'button', title: label, 'aria-label': label, onclick: () => set(v) })); ic ? b.append(zk.icon(ic)) : (b.textContent = label); s.append(b); b._v = v; }); ctl.push((F) => { for (const b of s.children) { const on = String(get(F)) === String(b._v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); } }); return s; };
  const switchc = (get, set) => { const i = el('input.zk-switch', { type: 'checkbox' }); i.onchange = () => set(i.checked); ctl.push((F) => (i.checked = !!get(F))); return i; };
  const selectc = (opts, get, set, w) => { const s = el('select.zk-select', { style: w ? { width: w + 'px' } : null }, ...opts.map(([v, l]) => el('option', { value: v }, l))); s.onchange = () => set(s.value); ctl.push((F) => { const v = String(get(F)); if (document.activeElement !== s) { if (![...s.options].some((o) => o.value === v)) s.append(el('option', { value: v }, v)); s.value = v; } }); return s; };
  const btnb = (label, f, ic) => nofocus(el('button.zk-btn.bordered', { type: 'button', onclick: f }, ic ? zk.icon(ic) : null, label));
  const colorField = (label, get, set, none) => { const b = nofocus(el('button.zk-swatch.sq', { type: 'button', 'aria-label': label, onclick: () => U.palette(b, { onPick: set, none, current: P.rgb2hex(get(U.F) || '') }) })); ctl.push((F) => { const c = get(F); b.style.background = c && c !== 'rgba(0, 0, 0, 0)' ? c : 'transparent'; b.classList.toggle('none', !c || c === 'rgba(0, 0, 0, 0)'); }); return field(label, b); };

  /* ---------- inspector tabs ---------- */
  U.tabs = {}; U.tab = 'text'; U.mode = 'format'; U.right = true; U.left = false;
  const textTab = () => el('div',
    section('Style', field('Paragraph', (() => { const b = nofocus(el('button.zk-btn.bordered.wide', { type: 'button', onclick: (e) => U.stylePop(e.currentTarget) })); const l = el('span.lbl'); b.append(l, zk.icon('chevron-down')); ctl.push((F) => (l.textContent = F.ok ? F.style : '–')); return b; })()), el('.zk-field', btnb('Update to match', () => P.updateStyleFromSelection(U.F.style || 'Body')), btnb('Modify…', () => U.modifyStyle(U.F.style || 'Body')))),
    section('Font', field('Family', (() => { const b = nofocus(el('button.zk-btn.bordered.wide', { type: 'button', onclick: (e) => U.fontPop(e.currentTarget) })); const l = el('span.lbl'); b.append(l, zk.icon('chevron-down')); ctl.push((F) => (l.textContent = F.ok ? F.font : '–')); return b; })()), field('Size', numIn((F) => (F.ok ? pt1(F.size) : ''), (v) => P.setFontSize(v), { step: 0.5, min: 4, max: 300, unit: 'pt' }), el('span.zk-label', 'pt')),
      el('.zk-field', segc([['b', 'Bold', 'bold'], ['i', 'Italic', 'italic'], ['u', 'Underline', 'underline'], ['s', 'Strikethrough', 'strikethrough']], (F) => '', (v) => P.toggleInline({ b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough' }[v])), segc([['sup', 'Superscript', 'superscript'], ['sub', 'Subscript', 'subscript']], (F) => (F.sup ? 'sup' : F.sub ? 'sub' : ''), (v) => (v === 'sup' ? P.sup() : P.sub()))),
      colorField('Text colour', (F) => F.color, (c) => P.setColor(c || '#1d1d1f'), 'Automatic'), colorField('Highlight', (F) => F.highlight, (c) => P.setHighlight(c), 'None')),
    section('Effects', field('Small caps', switchc((F) => F.smallcaps, () => P.toggleSmallCaps())), field('Letter spacing', numIn((F) => (F.ok ? pt1(F.ls * 0.75) : ''), (v) => P.setSpacing(v), { step: 0.1, w: 56 }), el('span.zk-label', 'pt')),
      field('Change case', selectc([['', 'Choose…'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case'], ['toggle', 'tOGGLE cASE']], () => '', (v) => { if (v) P.changeCase(v); }, 130))),
    section('', btnb('Clear formatting', () => P.clearFormatting(), 'remove-formatting')));
  const paraTab = () => el('div',
    section('Alignment', segc([['left', 'Left', 'align-left'], ['center', 'Centre', 'align-center'], ['right', 'Right', 'align-right'], ['justify', 'Justify', 'align-justify']], (F) => F.align, (v) => P.setAlign(v))),
    section('Spacing', field('Line', selectc([['1', 'Single'], ['1.15', '1.15'], ['1.35', '1.35'], ['1.5', '1.5'], ['2', 'Double']], (F) => (F.lhNum ? String(Math.round(F.lhNum * 100) / 100) : '1.35'), (v) => P.setLineHeight(+v), 110)), field('Before', numIn((F) => (F.ok ? pt1(P.px2pt(F.sb)) : ''), (v) => P.setBlockVar('--sb', P.pt2px(v)), { step: 1, min: 0, w: 56 }), el('span.zk-label', 'pt')), field('After', numIn((F) => (F.ok ? pt1(P.px2pt(F.sa)) : ''), (v) => P.setBlockVar('--sa', P.pt2px(v)), { step: 1, min: 0, w: 56 }), el('span.zk-label', 'pt'))),
    section('Indents', field('Left', lenIn((F) => (F.ok ? F.il : undefined), (v) => P.setBlockVar('--il', v), { min: 0 })), field('Right', lenIn((F) => (F.ok ? F.ir : undefined), (v) => P.setBlockVar('--ir', v), { min: 0 })), field('First line', lenIn((F) => (F.ok ? F.fi : undefined), (v) => P.setBlockVar('--fi', v)))),
    section('Lists', segc([['', 'None', null], ['b', 'Bullet', 'list'], ['n', 'Number', 'list-ordered'], ['m', 'Outline', 'list-tree'], ['c', 'Check', 'list-checks']], (F) => F.list || '', (v) => { if (!v) P.forBlocks((b) => { b.removeAttribute('data-list'); b.removeAttribute('data-lv'); b.removeAttribute('data-checked'); }); else P.forBlocks((b) => { b.setAttribute('data-list', v); if (!b.hasAttribute('data-lv')) b.setAttribute('data-lv', '0'); }); }),
      el('.zk-field', btnb('Demote', () => P.indent(1), 'indent-increase'), btnb('Promote', () => P.indent(-1), 'indent-decrease')), el('.zk-field', btnb('Restart at 1', () => P.restartList()), btnb('Continue', () => P.continueList()))),
    section('Border & shading', field('Border', selectc([['none', 'None'], ['box', 'Box'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], (F) => (F.para ? F.para.getAttribute('data-bd') || 'none' : 'none'), (v) => P.setBorder(v), 110)), colorField('Shading', (F) => (F.para && F.para.style.backgroundColor) || '', (c) => P.setShading(c), 'None')),
    section('Pagination', field('Keep with next', switchc((F) => F.para && F.para.hasAttribute('data-kwn'), () => P.keepWithNext())), field('Page break before', switchc((F) => F.para && F.para.hasAttribute('data-pbb'), () => P.pageBreakBefore()))));
  const layoutTab = () => el('div',
    section('Columns', field('Count', segc([[1, '1'], [2, '2'], [3, '3']], () => S.cols, (v) => U.setDoc(() => (S.cols = v), true))), field('Gap', lenIn(() => S.colGap, (v) => U.setDoc(() => (S.colGap = Math.max(12, v)), true), { min: 0.1 })), el('.lnote', 'Paragraphs and tables move to the next column as whole blocks.')),
    section('Header & footer', field('Different first page', switchc(() => S.diffFirst, (v) => U.setDoc(() => (S.diffFirst = v), true))), el('.zk-field', btnb('Edit header', () => { P.scrollToPage(P.currentPage()); setTimeout(() => P.editHF('hdr', P.currentPage()), 80); }), btnb('Edit footer', () => { P.scrollToPage(P.currentPage()); setTimeout(() => P.editHF('ftr', P.currentPage()), 80); })),
      el('.zk-field', btnb('Page number', () => P.insertField('page'), 'hash'), btnb('Page count', () => P.insertField('pages'), 'copy')), el('.lnote', 'Or double-click the top or bottom margin of any page.'), field('Number first page', numIn(() => S.pageStart, (v) => U.setDoc(() => (S.pageStart = Math.max(1, Math.round(v))), true), { min: 1, w: 56 }))),
    section('Breaks', el('.zk-field', btnb('Page break', () => P.insertPageBreak(), 'scissors'), btnb('Column break', () => P.insertColumnBreak())), el('.zk-field', btnb('Contents', () => P.insertTOC(), 'list-tree'), btnb('Update contents', () => { P.checkpoint(false); P.refreshTOC(true); P.markDirty(); })), el('.zk-field', btnb('Footnote', () => P.insertFootnote(), 'superscript'), btnb('Equation…', () => P.editEquation(), 'sigma'))));
  const docTab = () => {
    const sizeSel = selectc(Object.entries(P.SIZES).map(([k, v]) => [k, v.label]), () => S.page.size, (v) => U.setDoc(() => { S.page.size = v; if (v !== 'custom') { S.page.pw = P.SIZES[v].w; S.page.ph = P.SIZES[v].h; } }, true), 130);
    const stats = el('.dstats'); U.statsEl = stats;
    return el('div',
      section('Page', field('Size', sizeSel), field('Orientation', segc([[false, 'Portrait', 'rectangle-vertical'], [true, 'Landscape', 'rectangle-horizontal']], () => S.page.land, (v) => U.setDoc(() => (S.page.land = v), true))),
        el('.zk-field.cust', field('Width', lenIn(() => S.page.pw, (v) => U.setDoc(() => { S.page.pw = Math.max(192, v); S.page.size = 'custom'; }, true))), field('Height', lenIn(() => S.page.ph, (v) => U.setDoc(() => { S.page.ph = Math.max(192, v); S.page.size = 'custom'; }, true))))),
      section('Margins', field('Preset', selectc([['', 'Custom'], ['normal', 'Normal'], ['narrow', 'Narrow'], ['wide', 'Wide']], () => { const p = S.page; const m = [p.mt, p.mb, p.ml, p.mr].join(); return m === '96,96,96,96' ? 'normal' : m === '48,48,48,48' ? 'narrow' : m === '96,96,144,144' ? 'wide' : ''; }, (v) => { const m = { normal: [96, 96, 96, 96], narrow: [48, 48, 48, 48], wide: [96, 96, 144, 144] }[v]; if (m) U.setDoc(() => Object.assign(S.page, { mt: m[0], mb: m[1], ml: m[2], mr: m[3] }), true); }, 110)),
        el('.mgrid', field('Top', lenIn(() => S.page.mt, (v) => U.setDoc(() => (S.page.mt = v), true), { min: 0 })), field('Bottom', lenIn(() => S.page.mb, (v) => U.setDoc(() => (S.page.mb = v), true), { min: 0 })), field('Left', lenIn(() => S.page.ml, (v) => U.setDoc(() => (S.page.ml = v), true), { min: 0 })), field('Right', lenIn(() => S.page.mr, (v) => U.setDoc(() => (S.page.mr = v), true), { min: 0 })))),
      section('Document', field('Units', selectc([['in', 'Inches'], ['cm', 'Centimetres']], () => S.units, (v) => { S.units = v; zeng.store.set('units', v); U.refreshAll(); }, 120)), field('Tab stops', lenIn(() => S.tab, (v) => U.setDoc(() => (S.tab = Math.max(12, v)), false), { min: 0.1 })), field('Author', (() => { const i = el('input.zk-input.selectable', { value: S.author, style: { width: '120px' }, 'aria-label': 'Author name' }); i.onchange = () => { S.author = i.value.trim() || 'Author'; zeng.store.set('author', S.author); }; return i; })()), field('Check spelling', switchc(() => flow.spellcheck, (v) => { flow.spellcheck = v; zeng.store.set('spell', v); })), field('Track changes', switchc(() => S.track, (v) => P.review.toggle(v)))),
      section('Statistics', stats));
  };
  const tableTab = () => el('div',
    section('Table', field('Style', selectc(Object.entries(P.TABLE_STYLES), () => (P.tableInfo() || {}).style || 'grid', (v) => P.tableStyle(v), 140)), field('Header row', switchc(() => (P.tableInfo() || {}).header, () => P.toggleHeaderRow())), field('Align', segc([['left', 'Left', 'align-left'], ['center', 'Centre', 'align-center'], ['right', 'Right', 'align-right']], () => (P.tableOf() && P.tableOf().getAttribute('data-ta')) || 'left', (v) => P.tableAlign(v)))),
    section('Rows & columns', el('.zk-field', btnb('Row above', () => P.insertRow(false), 'plus'), btnb('Row below', () => P.insertRow(true), 'plus')), el('.zk-field', btnb('Column left', () => P.insertCol(false), 'plus'), btnb('Column right', () => P.insertCol(true), 'plus')), el('.zk-field', btnb('Delete row', () => P.deleteRow(), 'trash-2'), btnb('Delete column', () => P.deleteCol(), 'trash-2')), btnb('Delete table', () => P.deleteTable(), 'trash-2')),
    section('Cells', el('.zk-field', btnb('Merge', () => P.mergeCells(), 'merge'), btnb('Split', () => P.splitCell(), 'split')), colorField('Shading', () => { const c = (P.selCells()[0] || {}).style; return c ? c.backgroundColor : ''; }, (c) => P.cellShade(c), 'None'),
      field('Borders', selectc([['', 'Choose…'], ['all', 'All'], ['outer', 'Outside'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right'], ['none', 'None']], () => '', (v) => v && P.cellBorders(v), 120)),
      field('Horizontal', segc([['left', 'Left', 'align-left'], ['center', 'Centre', 'align-center'], ['right', 'Right', 'align-right']], () => '', (v) => P.cellAlign(v, null))), field('Vertical', segc([['top', 'Top', 'align-start-horizontal'], ['middle', 'Middle', 'align-center-horizontal'], ['bottom', 'Bottom', 'align-end-horizontal']], () => ((P.selCells()[0] || {}).style || {}).verticalAlign || 'top', (v) => P.cellAlign(null, v))), el('.lnote', 'Drag a column border to resize. Select cells by dragging across them.')));
  const objTab = () => {
    const isShape = () => P.selObj && P.selObj.classList.contains('shp');
    const w = numIn(() => (P.selObj ? Math.round(P.selObj.getBoundingClientRect().width / P.zoom) : ''), (v) => P.setObjSize(v, 0, lockC.checked), { min: 4, w: 64 }), h = numIn(() => (P.selObj ? Math.round(P.selObj.getBoundingClientRect().height / P.zoom) : ''), (v) => P.setObjSize(0, v, lockC.checked), { min: 2, w: 64 }); const lockC = el('input.zk-check', { type: 'checkbox', checked: true, 'aria-label': 'Lock aspect ratio' });
    const alt = el('input.zk-input.selectable', { placeholder: 'Describe for screen readers', style: { width: '100%' }, 'aria-label': 'Alternative text' }); alt.onchange = () => P.setAlt(alt.value); ctl.push(() => { if (document.activeElement !== alt) alt.value = P.selObj ? P.selObj.getAttribute('alt') || P.selObj.getAttribute('data-alt') || '' : ''; });
    return el('div', section('Size', field('Width', w, el('span.zk-label', 'px')), field('Height', h, el('span.zk-label', 'px')), field('Lock ratio', lockC), el('.zk-field', btnb('Original size', () => P.resetObjSize()))),
      section('Text wrapping', segc([['inline', 'In line'], ['left', 'Left'], ['right', 'Right'], ['break', 'Break']], () => (P.selObj && P.selObj.dataset.wrap) || 'inline', (v) => P.setWrap(v))),
      section('Shape', colorField('Fill', () => (P.selObj ? P.selObj.dataset.fill || '' : ''), (c) => P.setShapeProp('fill', c || ''), 'None'), colorField('Stroke', () => (P.selObj ? P.selObj.dataset.stroke || '' : ''), (c) => P.setShapeProp('stroke', c || ''), 'None'), field('Line width', numIn(() => (P.selObj ? P.selObj.dataset.sw || 0 : ''), (v) => P.setShapeProp('sw', String(v)), { min: 0, max: 20, w: 56 })), field('Corners', numIn(() => (P.selObj ? P.selObj.dataset.r || 0 : ''), (v) => P.setShapeProp('r', String(v)), { min: 0, max: 80, w: 56 }))),
      section('Description', alt, el('.zk-field', btnb('Add caption', () => P.addCaption(), 'text-quote'))));
    void isShape;
  };
  U.buildInspector = () => {
    const r = $('#right'); r.replaceChildren();
    const modes = el('.zk-seg.modes', ...[['format', 'Format'], ['review', 'Review'], ['lens', 'Lens']].map(([k, l]) => { const b = nofocus(el('button', { type: 'button', onclick: () => U.showPanel(k) }, l)); b.dataset.m = k; return b; }));
    const tabbar = el('.tabbar'); const holder = el('.tabbody'); const review = el('.reviewp.zk-hidden'); const lens = el('.lensp.zk-hidden'); U.tabbar = tabbar; U.holder = holder; U.reviewEl = review; U.lensEl = lens; U.modesEl = modes;
    U.tabs = { object: ['Object', objTab()], table: ['Table', tableTab()], text: ['Text', textTab()], paragraph: ['Paragraph', paraTab()], layout: ['Layout', layoutTab()], document: ['Document', docTab()] };
    for (const [k, [label, node]] of Object.entries(U.tabs)) { const b = nofocus(el('button.tabbtn', { type: 'button', onclick: () => U.showTab(k) }, label)); b.dataset.t = k; tabbar.append(b); node.classList.add('zk-hidden'); node.dataset.t = k; holder.append(node); }
    r.append(modes, tabbar, holder, review, lens); U.showTab('text'); U.showPanel('format');
  };
  U.showTab = (k) => { U.tab = k; U.showPanel('format', true); for (const b of U.tabbar.children) b.classList.toggle('on', b.dataset.t === k); for (const n of U.holder.children) n.classList.toggle('zk-hidden', n.dataset.t !== k); if (k === 'document') U.drawStats(); if (!U.right) U.toggleRight(true); P.refreshSoon(); };
  U.showPanel = (m, keep) => {
    U.mode = m; if (!U.right) U.toggleRight(true); for (const b of U.modesEl.children) { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-pressed', b.dataset.m === m); }
    U.tabbar.classList.toggle('zk-hidden', m !== 'format'); U.holder.classList.toggle('zk-hidden', m !== 'format'); U.reviewEl.classList.toggle('zk-hidden', m !== 'review'); U.lensEl.classList.toggle('zk-hidden', m !== 'lens');
    P.lens.setOpen(m === 'lens'); if (m === 'review') U.renderReview(); if (m === 'lens') U.renderLens(); if (!keep) U.refreshAll();
  };
  U.showReview = () => U.showPanel('review');
  U.setDoc = (fn, relayout) => { P.checkpoint(false); fn(); P.applyPageCss(); if (relayout) { P._forceFull = true; P.gapVer++; P.paginate({ sheets: true, reset: true }); if (P.zoomMode === 'auto') P.autoZoom(); else if (P.zoomMode === 'width') P.fitWidth(); else if (P.zoomMode === 'page') P.fitPage(); P.sizeStack(); } P.markDirty(); U.refreshAll(); };
  U.drawStats = () => { if (!U.statsEl) return; const s = P.stats(); const rows = [['Words', s.words], ['Characters', s.chars], ['Without spaces', s.nospace], ['Paragraphs', s.paras], ['Pages', s.pages], ['Reading time', P.lens.fmtTime(s.words / 238)]]; U.statsEl.replaceChildren(...rows.map(([k, v]) => el('.srow', el('span', k), el('b', typeof v === 'number' ? v.toLocaleString() : v)))); };
  U.updateContextTabs = () => {
    const f = U.F; const inTable = !!(f.ok && f.cell) || !!P.tableOf(); const obj = !!P.selObj; const objChanged = U.lastObj !== P.selObj; U.lastObj = P.selObj;
    for (const b of U.tabbar.children) { if (b.dataset.t === 'table') b.classList.toggle('zk-hidden', !inTable); if (b.dataset.t === 'object') b.classList.toggle('zk-hidden', !obj); }
    if (obj && objChanged && U.mode === 'format') { U.showTab('object'); } if (!obj && U.tab === 'object') U.showTab(inTable ? 'table' : 'text'); if (!inTable && U.tab === 'table') U.showTab('text');
  };

  /* ---------- review panel ---------- */
  const rel = (iso) => { const d = new Date(iso); const m = (Date.now() - d) / 60000; return m < 1 ? 'now' : m < 60 ? Math.round(m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : d.toLocaleDateString(); };
  U.renderReview = () => {
    const root = U.reviewEl; if (!root || U.mode !== 'review') return; const R = P.review; const keep = root.scrollTop; R.prune();
    const tc = el('.rvhead', el('.zk-field', el('span', 'Track changes'), switchc(() => S.track, (v) => R.toggle(v))), el('.zk-field', btnb('Accept all', () => R.acceptAll(), 'check'), btnb('Reject all', () => R.rejectAll(), 'x')));
    const changes = R.changes(); const clist = el('.clist', ...changes.slice(0, 40).map((c) => el('button.chg', { type: 'button', onclick: () => { P.scrollToEl(c); }, }, el('span.ctag.' + c.tagName.toLowerCase(), c.tagName === 'INS' ? 'Added' : 'Deleted'), el('span.ctext', c.textContent.slice(0, 48)), el('span.cact', btn('check', 'Accept', (e) => { e.stopPropagation(); R.accept(c); U.renderReview(); }, { cls: 'sm' }), btn('x', 'Reject', (e) => { e.stopPropagation(); R.reject(c); U.renderReview(); }, { cls: 'sm' })))), changes.length > 40 ? el('.lmore', `+ ${changes.length - 40} more`) : null);
    const comments = R.order(); const cards = comments.map((c) => {
      const active = P.activeComment === c.id; const card = el('.ccard' + (active ? '.active' : '') + (c.resolved ? '.resolved' : ''), { onclick: () => R.goto(c.id) });
      card.append(el('.chead', el('b', c.author), el('span.cdate', rel(c.date))), c.quote ? el('.cquote', '“' + c.quote.slice(0, 80) + (c.quote.length > 80 ? '…' : '') + '”') : null);
      const body = (txt, onSave) => { const t = el('.ctext2.selectable', { contentEditable: true, spellcheck: true }, txt || ''); t.onclick = (e) => e.stopPropagation(); t.onblur = () => onSave(t.textContent); t.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); t.blur(); } }; return t; };
      card.append(body(c.text, (v) => { if (v !== c.text) R.edit(c.id, v); }));
      c.replies.forEach((r, i) => card.append(el('.creply', el('.chead', el('b', r.author), el('span.cdate', rel(r.date))), body(r.text, (v) => { if (v !== r.text) R.edit(c.id, v, i); }))));
      if (U.composeFor === c.id) { const ta = el('textarea.zk-textarea.cnew.selectable', { rows: 2, placeholder: c.text ? 'Reply…' : 'Add a comment…', onclick: (e) => e.stopPropagation() }); const done = () => { const v = ta.value.trim(); U.composeFor = null; if (v) { c.text ? R.reply(c.id, v) : R.edit(c.id, v); } else if (!c.text) R.remove(c.id); U.renderReview(); }; ta.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); done(); } if (e.key === 'Escape') { U.composeFor = null; if (!c.text) R.remove(c.id); U.renderReview(); } }; card.append(ta, el('.cbtns', btnb('Cancel', (e) => { e.stopPropagation(); U.composeFor = null; if (!c.text) R.remove(c.id); U.renderReview(); }), (() => { const b = btnb(c.text ? 'Reply' : 'Comment', (e) => { e.stopPropagation(); done(); }); b.classList.add('primary'); return b; })())); }
      else card.append(el('.cbtns', btnb('Reply', (e) => { e.stopPropagation(); U.composeFor = c.id; U.renderReview(); setTimeout(() => $('#right textarea.cnew').focus(), 30); }), btnb(c.resolved ? 'Reopen' : 'Resolve', (e) => { e.stopPropagation(); R.resolve(c.id, !c.resolved); U.renderReview(); }), btnb('Delete', (e) => { e.stopPropagation(); R.remove(c.id); U.renderReview(); })));
      return card;
    });
    root.replaceChildren(section('Changes', tc, changes.length ? clist : el('.lnote', 'No tracked changes.')), section('Comments', btnb('Add comment', () => U.addComment(), 'message-square'), comments.length ? el('.cards', ...cards) : el('.lnote', 'Select text and choose Add comment.')));
    root.scrollTop = keep;
  };
  U.renderLens = (soft) => { if (U.mode !== 'lens') return; const root = U.lensEl; const k = root.scrollTop; root.replaceChildren(P.lens.panel()); root.scrollTop = k; void soft; };

  /* ---------- left sidebar ---------- */
  U.leftTab = 'outline';
  U.buildLeft = () => {
    const L = $('#left'); L.replaceChildren(); L.classList.add('zk-hidden');
    const seg = el('.zk-seg.modes', ...[['outline', 'Outline'], ['pages', 'Thumbnails']].map(([k, l]) => { const b = nofocus(el('button', { type: 'button', onclick: () => { U.leftTab = k; U.drawLeft(); } }, l)); b.dataset.m = k; return b; })); U.leftSeg = seg;
    U.leftBody = el('.lbody'); L.append(seg, U.leftBody);
  };
  U.drawLeft = () => {
    if (!U.left) return; for (const b of U.leftSeg.children) { b.classList.toggle('on', b.dataset.m === U.leftTab); }
    if (U.leftTab === 'outline') {
      const hs = P.headings(); U.leftBody.replaceChildren(...(hs.length ? hs.map((h) => nofocus(el('button.oitem.l' + h.level, { type: 'button', onclick: () => { P.scrollToEl(h.el); const r = document.createRange(); r.selectNodeContents(h.el); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }, h.text))) : [el('.zk-empty', el('strong', 'No headings'), el('span', 'Headings you add appear here.'))]));
      return;
    }
    const g = P.geom(); const k = 150 / g.w; const io = U._io || (U._io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && !e.target._done) { e.target._done = true; const i = +e.target.dataset.i; const pp = P.renderPage(i); pp.style.transform = `scale(${k})`; pp.style.transformOrigin = '0 0'; e.target.firstChild && e.target.firstChild.remove(); e.target.append(pp); } }, { root: U.leftBody, rootMargin: '300px' }));
    io.disconnect(); const items = []; for (let i = 0; i < P.layout.pages; i++) { const th = el('button.thumb' + (i === P.currentPage() ? '.cur' : ''), { type: 'button', 'data-i': i, onclick: () => P.scrollToPage(i), 'aria-label': 'Page ' + (i + 1), style: { height: g.h * k + 'px', width: g.w * k + 'px' } }, el('span.tnum', String(S.pageStart + i))); const wrapper = el('.thwrap', th, el('.tcap', String(S.pageStart + i))); items.push(wrapper); io.observe(th); } U.leftBody.replaceChildren(...items);
  };
  U.redrawThumbs = zk.debounce(() => { if (U.left && U.leftTab === 'pages') U.drawLeft(); }, 900);

  /* ---------- find bar ---------- */
  U.buildFind = () => {
    const F = P.find; const bar = $('#findbar'); const q = el('input.zk-input.selectable', { placeholder: 'Find', style: { width: '190px' }, 'aria-label': 'Find' }), r = el('input.zk-input.selectable', { placeholder: 'Replace', style: { width: '160px' }, 'aria-label': 'Replace with' });
    const tog = (ic, title, key) => { const b = nofocus(el('button.zk-btn.icon', { type: 'button', title, 'aria-label': title, 'aria-pressed': false, onclick: () => { F[key] = !F[key]; b.classList.toggle('on', F[key]); b.setAttribute('aria-pressed', F[key]); run(); } })); b.append(zk.icon(ic)); return b; };
    const cnt = el('span.zk-label.fcount'); U.findStatus = () => { cnt.textContent = F.err ? 'Invalid pattern' : F.q ? (F.matches.length ? `${F.cur >= 0 ? F.cur + 1 : '–'} of ${F.matches.length}` : 'No matches') : ''; };
    const run = zk.debounce(() => { F.q = q.value; F.cur = -1; F.scan(); U.findStatus(); }, 100); q.oninput = run; r.oninput = () => (F.r = r.value);
    q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); F.q = q.value; e.shiftKey ? F.prev() : F.next(); } if (e.key === 'Escape') U.toggleFind(false); }; r.onkeydown = (e) => { if (e.key === 'Enter') { F.r = r.value; F.replace(); U.findStatus(); } if (e.key === 'Escape') U.toggleFind(false); };
    bar.replaceChildren(q, tog('case-sensitive', 'Match case', 'cs'), tog('whole-word', 'Whole word', 'word'), tog('search-code', 'Regular expression', 'regex'), tog('highlighter', 'Highlight all', 'hl'), btn('chevron-up', 'Previous match', () => { F.q = q.value; F.prev(); }, { accel: 'CmdOrCtrl+Shift+G' }), btn('chevron-down', 'Next match', () => { F.q = q.value; F.next(); }, { accel: 'CmdOrCtrl+G' }), cnt, sep(), r, btnb('Replace', () => { F.r = r.value; F.replace(); U.findStatus(); }), btnb('All', () => { F.r = r.value; F.q = q.value; F.replaceAll(); U.findStatus(); }), el('.zk-spacer'), btn('x', 'Close find', () => U.toggleFind(false)));
    bar.querySelector('button[title^="Highlight all"]').classList.add('on'); U.findQ = q;
  };
  U.toggleFind = (on) => { U.findOpen = on === undefined ? !U.findOpen : on; $('#findbar').classList.toggle('zk-hidden', !U.findOpen); if (U.findOpen) { const s = getSelection(); const t = s.rangeCount && flow.contains(s.anchorNode) && !s.isCollapsed ? s.toString() : ''; if (t && t.length < 80 && !t.includes('\n')) { U.findQ.value = t; P.find.q = t; } U.findQ.focus(); U.findQ.select(); P.find.scan(); U.findStatus(); } else { P.find.clear(); P.focus(); } U.refreshAll(); };

  /* ---------- status bar ---------- */
  U.buildStatus = () => {
    const st = $('#status'); const pageL = nofocus(el('button.zk-btn.sbtn', { type: 'button', title: 'Go to page', onclick: async () => { const v = await zk.prompt('Go to Page', String(P.currentPage() + S.pageStart), { ok: 'Go' }); const n = parseInt(v, 10); if (n) P.scrollToPage(Math.max(0, Math.min(P.layout.pages - 1, n - S.pageStart))); } }));
    const words = el('span'); const sel = el('span.dim'); U.sb = { pageL, words, sel };
    const slider = el('input.zk-range.zslider', { type: 'range', min: 25, max: 300, step: 5, 'aria-label': 'Zoom' }); slider.oninput = () => { P.zoomMode = null; P.setZoom(slider.value / 100); };
    const pct = nofocus(el('button.zk-btn.sbtn', { type: 'button', title: 'Zoom options', onclick: (e) => zk.menu([{ label: 'Fit width', run: () => P.fitWidth() }, { label: 'Fit page', run: () => P.fitPage() }, { separator: true }, ...[50, 75, 100, 125, 150, 200, 300, 400].map((z) => ({ label: z + '%', run: () => { P.zoomMode = null; P.setZoom(z / 100); } }))], { anchor: e.currentTarget }) }));
    U.sb.slider = slider; U.sb.pct = pct;
    st.replaceChildren(pageL, words, sel, el('.zk-spacer'), btn('minus', 'Zoom out', () => { P.zoomMode = null; P.setZoom(P.zoom / 1.1); }, { cls: 'sm' }), slider, btn('plus', 'Zoom in', () => { P.zoomMode = null; P.setZoom(P.zoom * 1.1); }, { cls: 'sm' }), pct);
    P.onZoom = (z) => { slider.value = Math.round(z * 100); pct.textContent = Math.round(z * 100) + '%'; P.updateObjSel(); };
  };
  U.status = () => { const sb = U.sb; if (!sb) return; sb.pageL.textContent = `Page ${S.pageStart + P.currentPage()} of ${S.pageStart + P.layout.pages - 1}`; sb.words.textContent = (U.wc !== undefined ? U.wc.toLocaleString() : '0') + ' words'; const s = getSelection(); const t = s.rangeCount && !s.isCollapsed && flow.contains(s.anchorNode) ? s.toString() : ''; sb.sel.textContent = t ? `· ${P.words(t).toLocaleString()} selected` : ''; };

  /* ---------- refresh ---------- */
  let raf = 0;
  P.refreshSoon = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; U.refresh(); }); };
  U.refresh = () => {
    U.status(); const a = document.activeElement; if (a && a.matches && a.matches('input,select,textarea') && a.closest('#right,#fmtbar,#findbar')) return;
    const F = P.fmtState(); U.F = F; if (!F.ok && !P.selObj && U.F0) { /* keep the last known state while focus is elsewhere */ } U.F0 = F; for (const f of ctl) { try { f(F); } catch { /* ignore */ } } if (U.tabbar) U.updateContextTabs();
    P.markCells && P.markCells(); P.lens.setOpen && 0;
  };
  U.refreshAll = () => { for (const f of ctl) { try { f(U.F); } catch { /* ignore */ } } U.refresh(); if (zeng.refreshMenus) zeng.refreshMenus(); };
  P.onHistory = () => {};
  P.runSlow = () => {
    if (P.renumberFootnotes()) P.schedulePaginate({}); P.refreshTOC(); P.review.prune() && U.renderReview();
    let w = 0; for (const el_ of flow.children) { if (el_.tagName === 'HR' || el_.classList.contains('pgbreak')) continue; w += P.words(el_.textContent.replace(/​/g, ' ')); } U.wc = w; U.status(); if (U.tab === 'document' && U.mode === 'format') U.drawStats();
    U.redrawThumbs(); if (U.left && U.leftTab === 'outline') U.drawLeft(); if (U.mode === 'review') U.renderReview(); P.lens.schedule(); P.review.styleAll();
  };
  P.onPaginated = () => { U.status(); P.updateObjSel(); if (U.left && U.leftTab === 'pages') U.redrawThumbs(); };
  P.$('#scroll').addEventListener('scroll', zk.debounce(() => U.status(), 60), { passive: true });

  U.build = () => { U.buildTitle(); U.buildStrip(); U.buildInspector(); U.buildLeft(); U.buildFind(); U.buildStatus(); P.onZoom(P.zoom); };
})();
