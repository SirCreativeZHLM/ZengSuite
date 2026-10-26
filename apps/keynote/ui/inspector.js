/* Inspector: Format / Animate / Document tabs. */
(() => {
  const K = window.K, A = window.A;
  const insp = document.getElementById('insp');
  const h = zk.el;
  const I = (A.insp = { tab: 'format', sub: 'style', closed: new Set() });
  const FONTS = ['Inter', 'Helvetica Neue', 'Arial', 'Avenir Next', 'Futura', 'Gill Sans', 'Optima', 'Verdana', 'Trebuchet MS', 'Georgia', 'Iowan Old Style', 'Palatino', 'Baskerville', 'Didot', 'Times New Roman', 'Rockwell', 'American Typewriter', 'Courier New', 'Menlo', 'Impact', 'Arial Black', 'Comic Sans MS'];

  // ---------- control helpers ----------
  const row = (label, ...c) => h('.irow', label ? h('label', label) : null, ...c);
  const num = (value, onChange, { min = -9999, max = 99999, step = 1, w = 58, dec = 0, live } = {}) => {
    const i = h('input.zk-input.num.selectable', { type: 'text', value: value == null ? '' : (+(+value).toFixed(dec)).toString(), inputMode: 'decimal', style: { width: w + 'px' } });
    const set = (v, commit) => { v = Math.max(min, Math.min(max, v)); i.value = +v.toFixed(dec); onChange(v, commit); };
    i.addEventListener('change', () => { const v = parseFloat(i.value); if (!isNaN(v)) set(v, true); else i.value = value ?? ''; });
    i.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = (parseFloat(i.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1); set(v, true); } else if (e.key === 'Enter') i.blur(); });
    return i;
  };
  const stepper = (value, onChange, o = {}) => { const n = num(value, onChange, o); const mk = (ic, d) => { const b = zk.btn({ icon: ic, title: d > 0 ? 'Increase' : 'Decrease', onClick: () => onChange(Math.max(o.min ?? -9999, Math.min(o.max ?? 99999, (parseFloat(n.value) || 0) + d * (o.step || 1))), true) }); b.classList.add('bordered'); b.style.width = '24px'; b.style.height = '24px'; b.style.minWidth = '24px'; b.onmousedown = (e) => e.preventDefault(); return b; }; return h('.zk-group', mk('minus', -1), n, mk('plus', 1)); };
  const seg = (opts, value, onChange, cls) => { const s = h('.zk-seg' + (cls ? '.' + cls : '')); opts.forEach((o) => { const b = h('button', { type: 'button', title: o.title || o.label || '', 'aria-label': o.title || o.label, 'aria-pressed': String(o.v === value), onmousedown: (e) => e.preventDefault(), onclick: () => onChange(o.v) }, o.icon ? zk.icon(o.icon) : null, o.label || null); s.append(b); }); return s; };
  const toggleBtn = (icon, title, on, fn) => { const b = h('button.zk-btn.icon' + (on ? '.on' : ''), { type: 'button', title, 'aria-label': title, 'aria-pressed': String(!!on), onmousedown: (e) => e.preventDefault(), onclick: fn }, zk.icon(icon)); b.style.border = '0'; return b; };
  const select = (opts, value, onChange, cls = '') => { const s = h('select.zk-select' + cls); opts.forEach((o) => { const op = h('option', { value: o.v ?? o, selected: (o.v ?? o) === value }, o.label ?? o); s.append(op); }); s.addEventListener('change', () => onChange(s.value)); return s; };
  const slider = (min, max, step, value, onLive, onCommit) => { const r = h('input.zk-range', { type: 'range', min, max, step, value }); r.addEventListener('input', () => onLive(+r.value)); r.addEventListener('change', () => onCommit(+r.value)); r.style.flex = '1'; return r; };
  const check = (value, onChange) => h('input.zk-check', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) });
  const sw = (value, onPick, o = {}) => {
    const b = h('button.sw', { type: 'button', title: o.title || 'Color', 'aria-label': o.title || 'Color', onmousedown: (e) => e.preventDefault() }); const i = h('i'); i.style.background = value ? K.col(A.deck, value) : 'transparent'; if (!value) i.style.background = 'linear-gradient(135deg,transparent 46%,#f33 46%,#f33 54%,transparent 54%)'; b.append(i);
    b.onclick = () => zk.popover(b, palette(value, (c) => { onPick(c); zk.closePop(); }, o), { align: 'end' }); return b;
  };
  const mix = (hex, to, t) => { const a = K.hexToRgb(hex), b = K.hexToRgb(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const SYS = ['#000000', '#3a3a3c', '#8e8e93', '#c7c7cc', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#af52de', '#ff2d55'];
  const palette = (value, pick, o = {}) => {
    const d = A.deck, p = d.theme.pal; const box = h('.palpop'); const mk = (c, title) => { const b = h('button', { type: 'button', title: title || c, onmousedown: (e) => e.preventDefault(), onclick: () => pick(c) }); b.style.background = K.col(d, c); return b; };
    const toks = ['bg', 'fg', 'mut', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']; toks.forEach((t) => box.append(mk(t, { bg: 'Background', fg: 'Text', mut: 'Muted' }[t] || 'Accent ' + t[1])));
    [0.55, 0.3].forEach((t) => toks.forEach((tk) => box.append(mk(mix(K.hex(d, tk), '#ffffff', t)))));
    [0.25].forEach((t) => toks.forEach((tk) => box.append(mk(mix(K.hex(d, tk), '#000000', t)))));
    SYS.forEach((c) => box.append(mk(c)));
    const full = h('.full'); if (o.allowNone) full.append(h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => pick(null) }, 'No Color'));
    const ci = h('input.zk-color', { type: 'color', value: value && K.hex(d, value).length === 7 ? K.hex(d, value) : '#0a84ff', title: 'Custom color' }); ci.addEventListener('input', () => pick(ci.value)); full.append(h('span', 'Custom'), ci); box.append(full); return box;
  };

  // ---------- section scaffolding ----------
  const section = (id, title, body, open = true) => {
    const closed = I.closed.has(id); const s = h('.isec' + (closed ? '.closed' : ''), { 'data-sec': id }); const head = h('.ish', { onclick: () => { s.classList.toggle('closed'); s.classList.contains('closed') ? I.closed.add(id) : I.closed.delete(id); } }, zk.icon('chevron-down'), title);
    s.append(head, h('.isb', ...[].concat(body).filter(Boolean))); return s;
  };
  const objs = () => A.selObjs();
  const apply = (fn, label, { live, ids } = {}) => { const os = objs(); os.forEach(fn); os.forEach((o) => { if (o.type === 'conn') { /* re-render all */ } A.renderObj(o.id); }); K.updateConns(A.objs()); A.renderConns(new Set(os.map((o) => o.id))); A.overlay(); if (live) { A.emit('live'); return; } A.commit(label); A.emit('edited'); };
  const applyFull = (fn, label) => { objs().forEach(fn); A.render(); A.overlay(); A.commit(label); A.emit('edited'); };

  // ---------- fill editor ----------
  const fillKind = (f) => (!f || f.t === 'none' ? 'none' : f.t);
  const fillEditor = (get, set, { allowNone = true, title = 'Fill' } = {}) => {
    const f = get(); const kind = fillKind(f); const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    const rebuild = () => { const nb = fillEditor(get, set, { allowNone, title }); box.replaceWith(nb); };
    const commit = (nf, label = title) => { set(nf, label, false); I.refresh(); };
    const sel = select([{ v: 'none', label: 'None' }, { v: 'solid', label: 'Color' }, { v: 'grad', label: 'Gradient' }, { v: 'img', label: 'Image' }], kind, async (v) => {
      if (v === 'none') commit(null); else if (v === 'solid') commit({ t: 'solid', c: f && f.t === 'solid' ? f.c : f && f.t === 'grad' ? f.stops[0][1] : 'a1', a: 1 });
      else if (v === 'grad') commit({ t: 'grad', kind: 'linear', ang: 180, stops: [[0, f && f.t === 'solid' ? f.c : 'a1'], [1, f && f.t === 'solid' ? mix(K.hex(A.deck, f.c), '#000000', 0.35) : 'a2']] });
      else if (v === 'img') { const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }] }); if (!hs[0]) { I.refresh(); return; } const id = await K.addMedia(A.deck, new Uint8Array(await zeng.files.read(hs[0])), hs[0].name, K.mimeOf(hs[0].name)); commit({ t: 'img', m: id, mode: 'fill' }); }
    }); box.append(row(null, sel));
    if (f && f.t === 'solid') box.append(row('Color', sw(f.c, (c) => commit({ ...f, c: c || 'a1' }), { title: 'Fill color' }), h('.grow', slider(0, 100, 1, Math.round((f.a ?? 1) * 100), (v) => { f.a = v / 100; set(f, title, true); }, (v) => { f.a = v / 100; set(f, title, false); })), h('span.small', Math.round((f.a ?? 1) * 100) + '%')));
    if (f && f.t === 'grad') {
      box.append(row('Colors', sw(f.stops[0][1], (c) => { f.stops[0][1] = c || 'a1'; commit(f); }), sw(f.stops[f.stops.length - 1][1], (c) => { f.stops[f.stops.length - 1][1] = c || 'a2'; commit(f); }), seg([{ v: 'linear', label: 'Linear' }, { v: 'radial', label: 'Radial' }], f.kind, (v) => { f.kind = v; commit(f); })));
      if (f.kind === 'linear') box.append(row('Angle', slider(0, 360, 1, f.ang ?? 180, (v) => { f.ang = v; set(f, title, true); }, (v) => { f.ang = v; set(f, title, false); }), h('span.small', Math.round(f.ang ?? 180) + '°')));
    }
    if (f && f.t === 'img') box.append(row('Mode', select([{ v: 'fill', label: 'Fill' }, { v: 'fit', label: 'Fit' }, { v: 'stretch', label: 'Stretch' }, { v: 'tile', label: 'Tile' }], f.mode || 'fill', (v) => { f.mode = v; commit(f); })));
    return box;
  };
  const lineEditor = (o) => {
    const l = o.line; const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    box.append(row(null, select([{ v: 'none', label: 'None' }, { v: 'solid', label: 'Line' }, { v: 'dash', label: 'Dashed' }, { v: 'dot', label: 'Dotted' }], !l || !l.c ? 'none' : l.dash || 'solid', (v) => { apply((x) => { if (v === 'none') x.line = null; else x.line = { ...(x.line || { c: 'fg', w: 2 }), c: (x.line && x.line.c) || 'fg', w: (x.line && x.line.w) || 2, dash: v === 'solid' ? undefined : v }; }, 'Border'); I.refresh(); })));
    if (l && l.c) box.append(row('Color', sw(l.c, (c) => { apply((x) => x.line && (x.line.c = c || 'fg'), 'Border Color'); I.refresh(); }), h('label', { style: { minWidth: '0', marginLeft: '8px' } }, 'Width'), stepper(l.w, (v, c) => apply((x) => x.line && (x.line.w = v), 'Border Width', { live: !c }), { min: 0, max: 60, step: 0.5, dec: 1, w: 44 })));
    return box;
  };
  const shadowEditor = () => {
    const o = objs()[0]; const s = o.sh; const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    box.append(row('Shadow', check(!!s, (on) => { apply((x) => (x.sh = on ? { x: 0, y: 6, b: 14, c: '#000000', a: 0.35 } : undefined), 'Shadow'); I.refresh(); })));
    if (s) { box.append(row('Color', sw(s.c, (c) => { apply((x) => x.sh && (x.sh.c = c || '#000000'), 'Shadow'); I.refresh(); }), h('label', { style: { minWidth: 0 } }, 'Opacity'), slider(0, 100, 1, Math.round((s.a ?? 0.4) * 100), (v) => apply((x) => x.sh && (x.sh.a = v / 100), '', { live: true }), (v) => apply((x) => x.sh && (x.sh.a = v / 100), 'Shadow'))));
      box.append(h('.igrid', row('Blur', num(s.b, (v, c) => apply((x) => x.sh && (x.sh.b = v), 'Shadow', { live: !c }), { min: 0, max: 100, w: 48 })), row('Offset', num(s.y, (v, c) => apply((x) => x.sh && (x.sh.y = v), 'Shadow', { live: !c }), { min: -100, max: 100, w: 48 }))));
      box.append(row('Angle X', num(s.x, (v, c) => apply((x) => x.sh && (x.sh.x = v), 'Shadow', { live: !c }), { min: -100, max: 100, w: 48 }))); }
    return box;
  };
  const fxSliders = (o) => [
    row('Opacity', slider(0, 100, 1, Math.round((o.op ?? 1) * 100), (v) => apply((x) => (x.op = v / 100), '', { live: true }), (v) => apply((x) => (x.op = v / 100), 'Opacity')), h('span.small', Math.round((o.op ?? 1) * 100) + '%')),
    row('Reflection', slider(0, 100, 1, Math.round((o.rf || 0) * 100), (v) => apply((x) => (x.rf = v / 100 || undefined), '', { live: true }), (v) => apply((x) => (x.rf = v / 100 || undefined), 'Reflection'))),
    row('Blur', slider(0, 30, 0.5, o.bl || 0, (v) => apply((x) => (x.bl = v || undefined), '', { live: true }), (v) => apply((x) => (x.bl = v || undefined), 'Blur'))),
  ];

  // ---------- Format: style ----------
  const styleSections = (os) => {
    const o = os[0]; const out = []; const same = os.every((x) => x.type === o.type); if (!same) { out.push(section('fx', 'Effects', [shadowEditor(), ...fxSliders(o)])); return out; }
    const hasFill = ['text', 'shape'].includes(o.type);
    if (o.type === 'conn') {
      const l = o.line;
      out.push(section('line', 'Line', [
        row('Style', seg([{ v: 'straight', icon: 'minus', title: 'Straight' }, { v: 'elbow', icon: 'corner-down-left', title: 'Elbow' }, { v: 'curve', icon: 'spline', title: 'Curved' }], o.route, (v) => apply((x) => (x.route = v), 'Line Style'))),
        row('Color', sw(l.c, (c) => { apply((x) => (x.line.c = c || 'fg'), 'Line Color'); I.refresh(); }), h('label', { style: { minWidth: 0, marginLeft: '8px' } }, 'Width'), stepper(l.w, (v, c) => apply((x) => (x.line.w = v), 'Line Width', { live: !c }), { min: 0.5, max: 40, step: 0.5, dec: 1, w: 44 })),
        row('Dash', select([{ v: 'solid', label: 'Solid' }, { v: 'dash', label: 'Dashed' }, { v: 'dot', label: 'Dotted' }, { v: 'dashdot', label: 'Dash Dot' }], l.dash || 'solid', (v) => apply((x) => (x.line.dash = v === 'solid' ? undefined : v), 'Dash'))),
        row('Start', select(K.HEADS.map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1) })), l.tail || 'none', (v) => apply((x) => (x.line.tail = v), 'Arrowhead'))),
        row('End', select(K.HEADS.map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1) })), l.head || 'none', (v) => apply((x) => (x.line.head = v), 'Arrowhead'))),
        o.a.id || o.b.id ? h('.small', 'Connected to ' + [o.a.id, o.b.id].filter(Boolean).length + ' object(s); it follows them when they move.') : h('.small', 'Drag an end handle onto a shape to attach it.'),
      ]));
      out.push(section('fx', 'Shadow & Opacity', [shadowEditor(), row('Opacity', slider(0, 100, 1, Math.round((o.op ?? 1) * 100), (v) => apply((x) => (x.op = v / 100), '', { live: true }), (v) => apply((x) => (x.op = v / 100), 'Opacity')))]));
      return out;
    }
    if (hasFill) {
      out.push(section('fill', 'Fill', fillEditor(() => o.fill, (nf, label, live) => apply((x) => (x.fill = nf ? K.clone(nf) : null), label, { live }))));
      out.push(section('border', 'Border', lineEditor(o)));
      if (o.type === 'shape') { const s = K.shapes[o.shape]; if (s && s.a.length) out.push(section('adj', 'Shape', [row('Shape', h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: (e) => shapePicker(e.currentTarget, (id) => { apply((x) => { x.shape = id; x.adj = undefined; }, 'Change Shape'); I.refresh(); }) }, s.n)), ...s.a.map((v, i) => row(s.a.length > 1 ? 'Adjust ' + (i + 1) : 'Adjust', slider(-1, 1.5, 0.01, (o.adj && o.adj[i]) ?? v, (nv) => apply((x) => { x.adj = (x.adj && x.adj.slice()) || s.a.slice(); x.adj[i] = nv; }, '', { live: true }), (nv) => apply((x) => { x.adj = (x.adj && x.adj.slice()) || s.a.slice(); x.adj[i] = nv; }, 'Adjust Shape'))))])); else out.push(section('adj', 'Shape', [row('Shape', h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: (e) => shapePicker(e.currentTarget, (id) => { apply((x) => { x.shape = id; x.adj = undefined; }, 'Change Shape'); I.refresh(); }) }, s ? s.n : 'Custom'))])); }
      out.push(section('fx', 'Shadow & Effects', [shadowEditor(), ...fxSliders(o)]));
    } else if (o.type === 'image') {
      const a = o.adj || {}; const setA = (k) => (v, live) => apply((x) => { x.adj = { ...(x.adj || {}) }; if (v) x.adj[k] = v; else delete x.adj[k]; }, live ? '' : 'Adjust Image', { live });
      const adjRow = (label, k, min, max, step) => row(label, slider(min, max, step, a[k] || 0, (v) => setA(k)(v, true), (v) => setA(k)(v, false)));
      out.push(section('image', 'Image', [
        row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.replaceImage(o) }, 'Replace…'), h('button.zk-btn.bordered.kbtn.grow' + (A.live.crop === o.id ? '.on' : ''), { type: 'button', onclick: () => { A.cropMode(A.live.crop !== o.id); I.refresh(); } }, A.live.crop === o.id ? 'Done Cropping' : 'Crop')),
        row('Mask', h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: (e) => shapePicker(e.currentTarget, (id) => { apply((x) => (x.mask = id), 'Mask'); I.refresh(); }, true) }, o.mask && o.mask !== 'rect' ? (K.shapes[o.mask] || {}).n : 'None (Rectangle)')),
        row('Alt text', h('input.zk-input.selectable.grow', { value: o.alt || '', onchange: (e) => apply((x) => (x.alt = e.target.value), 'Alt Text') })),
      ]));
      out.push(section('imgadj', 'Adjust Image', [adjRow('Brightness', 'br', -0.8, 0.8, 0.02), adjRow('Contrast', 'co', -0.8, 1, 0.02), adjRow('Saturation', 'sa', -1, 2, 0.02), adjRow('Hue', 'hu', -180, 180, 1), adjRow('Gray', 'gr', 0, 1, 0.02), adjRow('Sepia', 'se', 0, 1, 0.02), adjRow('Blur', 'ib', 0, 20, 0.5), row(null, h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => { apply((x) => (x.adj = undefined), 'Reset Adjustments'); I.refresh(); } }, 'Reset'))]));
      out.push(section('border', 'Border', lineEditor(o))); out.push(section('fx', 'Shadow & Effects', [shadowEditor(), ...fxSliders(o)]));
    } else if (o.type === 'chart') {
      out.push(section('chart', 'Chart', [
        row('Type', select(K.CHART_KINDS.map(([v, label]) => ({ v, label })), o.kind, (v) => { apply((x) => (x.kind = v), 'Chart Type'); I.refresh(); })),
        row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => chartData(o) }, 'Edit Chart Data…')),
        row('Title', h('input.zk-input.selectable.grow', { value: (o.opt || {}).title || '', onchange: (e) => apply((x) => ((x.opt ||= {}).title = e.target.value), 'Chart Title') })),
        row('Legend', check((o.opt || {}).legend !== false, (v) => apply((x) => ((x.opt ||= {}).legend = v), 'Legend'))), row('Gridlines', check((o.opt || {}).grid !== false, (v) => apply((x) => ((x.opt ||= {}).grid = v), 'Gridlines'))),
        row('Value labels', check((o.opt || {}).labels, (v) => apply((x) => ((x.opt ||= {}).labels = v), 'Labels'))), ['column', 'bar', 'area'].includes(o.kind) ? row('Stacked', check((o.opt || {}).stacked, (v) => apply((x) => ((x.opt ||= {}).stacked = v), 'Stacked'))) : null,
      ]));
      out.push(section('series', 'Series Colors', o.data.series.map((s, i) => row(s.name || 'Series ' + (i + 1), sw(s.c || 'a' + ((i % 6) + 1), (c) => { apply((x) => (x.data.series[i].c = c || undefined), 'Series Color'); I.refresh(); })))));
      out.push(section('fx', 'Shadow & Opacity', [shadowEditor(), ...fxSliders(o)]));
    } else if (o.type === 'table') {
      const st = o.st || {}; const cell = A.cell;
      out.push(section('table', 'Table', [
        row('Rows', h('span.small', o.rh.length + ''), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => A.cmd.tableAddRow(true) }, '+ Row'), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => A.cmd.tableDelRow() }, '− Row')),
        row('Columns', h('span.small', o.cw.length + ''), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => A.cmd.tableAddCol(true) }, '+ Col'), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => A.cmd.tableDelCol() }, '− Col')),
        row('Header row', check(st.hdr, (v) => applyFull((x) => ((x.st ||= {}).hdr = v), 'Header Row'))), row('Banded rows', check(st.band, (v) => applyFull((x) => ((x.st ||= {}).band = v), 'Banding'))),
        row('Gridlines', select([{ v: 'none', label: 'None' }, { v: 'h', label: 'Horizontal' }, { v: 'all', label: 'All' }], st.grid || 'h', (v) => applyFull((x) => ((x.st ||= {}).grid = v), 'Gridlines'))),
        row('Style color', sw(st.c || 'a1', (c) => { applyFull((x) => ((x.st ||= {}).c = c || 'a1'), 'Table Color'); I.refresh(); })),
        row(cell ? 'Cell fill' : 'Cell fill', sw(cell ? (o.cells[cell.r1][cell.c1].fill || {}).c : null, (c) => { A.cmd.cellFill(c ? { t: 'solid', c } : undefined); I.refresh(); }, { allowNone: true })),
        h('.small', cell ? 'Cell selection active. Double-click a cell to edit; Tab moves between cells.' : 'Click a cell to select it. Double-click to edit.'),
      ]));
      out.push(section('border', 'Border', lineEditor(o))); out.push(section('fx', 'Shadow & Opacity', [shadowEditor(), row('Opacity', slider(0, 100, 1, Math.round((o.op ?? 1) * 100), (v) => apply((x) => (x.op = v / 100), '', { live: true }), (v) => apply((x) => (x.op = v / 100), 'Opacity')))]));
    } else if (o.type === 'media') {
      out.push(section('media', o.kind === 'audio' ? 'Audio' : 'Movie', [
        row('Play on slide', check(o.auto, (v) => apply((x) => (x.auto = v || undefined), 'Autoplay'))), row('Loop', check(o.loop, (v) => apply((x) => (x.loop = v || undefined), 'Loop'))), o.kind === 'video' ? row('Muted', check(o.mute, (v) => apply((x) => (x.mute = v || undefined), 'Mute'))) : null,
        row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.emit('toggleMedia', o) }, 'Play / Pause preview')),
      ]));
      out.push(section('fx', 'Shadow & Opacity', [shadowEditor(), ...fxSliders(o)]));
    } else if (o.type === 'group') out.push(section('fx', 'Shadow & Effects', [shadowEditor(), ...fxSliders(o)]));
    return out;
  };

  // ---------- shape picker ----------
  const shapeIcon = (id) => { const d = K.shapePath(id, 60, 60); const s = (K.shapes[id] || {}); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '-4 -4 68 68'); svg.innerHTML = `<path d="${d}" fill-rule="${s.evenodd ? 'evenodd' : 'nonzero'}" ${s.open ? 'fill="none"' : ''}/>`; return svg; };
  const shapePicker = (anchor, pick, withNone) => {
    const g = h('.shgrid'); if (withNone) { const b = h('button', { type: 'button', title: 'Rectangle (none)', onclick: () => { pick('rect'); zk.closePop(); } }, shapeIcon('rect')); g.append(h('.shcat', 'Mask'), b); }
    K.shapeCats.forEach((c) => { g.append(h('.shcat', c)); K.shapeList.filter((s) => s.g === c).forEach((s) => g.append(h('button', { type: 'button', title: s.n, 'aria-label': s.n, onclick: () => { pick(s.id); zk.closePop(); } }, shapeIcon(s.id)))); });
    zk.popover(anchor, g, { align: 'start' });
  };
  A.shapePicker = shapePicker; A.shapeIcon = shapeIcon;

  // ---------- Format: text ----------
  const textSection = (os) => {
    const st = A.fmt.state(); if (!st) return [];
    const fontName = (f) => (f === 'head' ? A.deck.theme.head : f === 'body' ? A.deck.theme.body : f);
    const fl = [{ v: 'body', label: 'Theme Body' }, { v: 'head', label: 'Theme Heading' }, ...FONTS.map((f) => ({ v: f, label: f }))]; if (st.f && !fl.some((x) => x.v === st.f)) fl.push({ v: st.f, label: (st.f + '').replace(/["']/g, '').split(',')[0] });
    const fsel = select(fl, st.f, (v) => A.fmt.run('f', v)); fsel.addEventListener('mousedown', () => A.savedRange && 0);
    const el = [
      row('Font', fsel),
      row('Size', stepper(st.sz, (v) => A.fmt.run('sz', v), { min: 4, max: 400, w: 46 }), sw(st.c, (c) => A.fmt.run('c', c || 'fg', c || 'fg'), { title: 'Text color' }), sw(null, (c) => A.fmt.run('hl', c, c), { title: 'Highlight', allowNone: true })),
      row(null, seg([{ v: 'b', icon: 'bold', title: 'Bold' }, { v: 'i', icon: 'italic', title: 'Italic' }, { v: 'u', icon: 'underline', title: 'Underline' }, { v: 's', icon: 'strikethrough', title: 'Strikethrough' }].map((x) => ({ ...x })), null, (v) => A.fmt.run(v)), null),
    ];
    // make bold/italic/etc pressed state visible
    el[2].querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(!![st.b, st.i, st.u, st.s][i])));
    el.push(row(null, seg([{ v: 'l', icon: 'align-left', title: 'Align Left' }, { v: 'c', icon: 'align-center', title: 'Center' }, { v: 'r', icon: 'align-right', title: 'Align Right' }, { v: 'j', icon: 'align-justify', title: 'Justify' }], st.al, (v) => A.fmt.para('al', v)), seg([{ v: 't', icon: 'align-start-horizontal', title: 'Top' }, { v: 'm', icon: 'align-center-horizontal', title: 'Middle' }, { v: 'b', icon: 'align-end-horizontal', title: 'Bottom' }], st.va, (v) => A.fmt.para('va', v))));
    el.push(h('.igrid', row('Line', num(st.ls, (v) => A.fmt.para('ls', v), { min: 0.6, max: 4, step: 0.05, dec: 2, w: 48 })), row('After', num(st.sa || 0, (v) => A.fmt.para('sa', v), { min: 0, max: 200, w: 48 }))));
    el.push(row('Bullets', select([{ v: 'none', label: 'None' }, { v: 'b', label: '• Bullet' }, { v: 'd', label: '– Dash' }, { v: 'n', label: '1. Number' }, { v: 'a', label: 'a. Letter' }, { v: 'r', label: 'i. Roman' }, { v: 'c', label: '✓ Check' }], st.list || 'none', (v) => A.fmt.para('list', v)), toggleBtn('indent-decrease', 'Outdent', false, () => A.fmt.para('lv', -1)), toggleBtn('indent-increase', 'Indent', false, () => A.fmt.para('lv', 1))));
    el.push(row(null, toggleBtn('superscript', 'Superscript', false, () => A.fmt.run('sup')), toggleBtn('subscript', 'Subscript', false, () => A.fmt.run('sub')), toggleBtn('link', 'Hyperlink', false, () => A.insertLink())));
    el.push(h('.igrid', row('Columns', num(st.cols || 1, (v) => apply((x) => ((x.ts ||= {}).cols = Math.round(v)), 'Columns'), { min: 1, max: 6, w: 44 })), row('Inset', num(st.pad ?? 6, (v) => apply((x) => ((x.ts ||= {}).pad = v), 'Inset'), { min: 0, max: 80, w: 44 }))));
    el.push(row('Shrink to fit', check(st.fit === 'shrink', (v) => apply((x) => ((x.ts ||= {}).fit = v ? 'shrink' : 'none'), 'Autofit'))));
    if (os[0].type === 'text') el.push(row('Auto height', check(os[0].ah, (v) => { apply((x) => (x.ah = v || undefined), 'Auto Height'); os.forEach((x) => A.fixAH(x)); A.overlay(); })));
    el.push(h('.small', 'Tab / Shift-Tab indents list items while typing.'));
    return [section('text', 'Text', el)];
  };

  // ---------- Format: arrange ----------
  const arrange = (os) => {
    const o = os[0]; const bb = os.length > 1 ? K.bbox(os) : o; const out = [];
    const setBox = (k, v, commit) => { const d = v - (k === 'x' ? bb.x : k === 'y' ? bb.y : k === 'w' ? bb.w : bb.h); if (os.length === 1 && o.type !== 'group' && o.type !== 'conn') { o[k] = v; if (o.type === 'table') { if (k === 'w') o.cw = o.cw.map((c) => c * v / (o.cw.reduce((a, b) => a + b, 0) || 1)); if (k === 'h') o.rh = o.rh.map((c) => c * v / (o.rh.reduce((a, b) => a + b, 0) || 1)); } } else if (k === 'x') os.forEach((q) => K.moveObj(q, d, 0)); else if (k === 'y') os.forEach((q) => K.moveObj(q, 0, d)); else { const sx = k === 'w' ? v / bb.w : 1, sy = k === 'h' ? v / bb.h : 1; os.forEach((q) => { K.scaleObj(q, bb.x, bb.y, sx, sy); if (q.type === 'group') K.regroup(q); }); }
      os.forEach((q) => A.renderObj(q.id)); K.updateConns(A.objs()); A.renderConns(new Set(os.map((q) => q.id))); A.overlay(); if (commit) { A.commit('Arrange'); A.emit('edited'); } else A.emit('live'); };
    const geo = [h('.igrid', row('X', num(bb.x, (v, c) => setBox('x', v, c), { dec: 1, w: 56 })), row('Y', num(bb.y, (v, c) => setBox('y', v, c), { dec: 1, w: 56 })), row('W', num(bb.w, (v, c) => setBox('w', v, c), { dec: 1, min: 4, w: 56 })), row('H', num(bb.h, (v, c) => setBox('h', v, c), { dec: 1, min: 4, w: 56 })))];
    if (os.length === 1 && o.type !== 'conn' && o.type !== 'group') geo.push(row('Rotate', num(o.rot || 0, (v, c) => { o.rot = ((v % 360) + 360) % 360; A.renderObj(o.id); A.overlay(); if (c) { A.commit('Rotate'); A.emit('edited'); } }, { dec: 0, w: 50 }), h('span.small', '°'), toggleBtn('flip-horizontal', 'Flip Horizontal', !!o.fh, () => { A.cmd.flip('h'); }), toggleBtn('flip-vertical', 'Flip Vertical', !!o.fv, () => { A.cmd.flip('v'); })));
    else geo.push(row(null, toggleBtn('flip-horizontal', 'Flip Horizontal', false, () => A.cmd.flip('h')), toggleBtn('flip-vertical', 'Flip Vertical', false, () => A.cmd.flip('v')), toggleBtn('rotate-ccw', 'Rotate Left 90°', false, () => A.cmd.rot90(-1)), toggleBtn('rotate-cw', 'Rotate Right 90°', false, () => A.cmd.rot90(1))));
    out.push(section('geo', 'Size & Position', geo));
    out.push(section('order', 'Arrange', [
      row(null, h('.zk-group', toggleBtn('bring-to-front', 'Bring to Front', false, () => A.cmd.order('front')), toggleBtn('arrow-up', 'Bring Forward', false, () => A.cmd.order('forward')), toggleBtn('arrow-down', 'Send Backward', false, () => A.cmd.order('backward')), toggleBtn('send-to-back', 'Send to Back', false, () => A.cmd.order('back'))), h('.zk-spacer'), toggleBtn(o.lock ? 'lock' : 'unlock', o.lock ? 'Unlock' : 'Lock', !!o.lock, () => A.cmd.lock())),
      row(null, h('.zk-group', ...[['align-start-vertical', 'Align Left', 'left'], ['align-center-vertical', 'Align Center', 'center'], ['align-end-vertical', 'Align Right', 'right'], ['align-start-horizontal', 'Align Top', 'top'], ['align-center-horizontal', 'Align Middle', 'middle'], ['align-end-horizontal', 'Align Bottom', 'bottom']].map(([ic, t, k]) => toggleBtn(ic, t + (os.length > 1 ? '' : ' to Slide'), false, () => A.cmd.align(k))))),
      os.length > 2 ? row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.cmd.distribute('h') }, 'Distribute H'), h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.cmd.distribute('v') }, 'Distribute V')) : null,
      row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', disabled: os.length < 2, onclick: () => A.cmd.group() }, 'Group'), h('button.zk-btn.bordered.kbtn.grow', { type: 'button', disabled: !os.some((q) => q.type === 'group'), onclick: () => A.cmd.ungroup() }, 'Ungroup')),
    ]));
    out.push(section('meta', 'Object', [
      row('Name', h('input.zk-input.selectable.grow', { value: os.length === 1 ? o.name || '' : '', placeholder: os.length === 1 ? K.defaultName(o) : 'Multiple', disabled: os.length > 1, onchange: (e) => { o.name = e.target.value; A.commit('Rename'); A.emit('edited'); } })),
      h('.small', 'Objects with the same name on consecutive slides morph during a Magic Move transition.'),
      row('Hyperlink', h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.insertLink() }, o.link ? (typeof o.link === 'string' ? o.link : o.link.url) : 'Add Link…')),
      row('Hidden', check(o.hid, () => A.cmd.hide())),
    ]));
    return out;
  };

  // ---------- Format: slide ----------
  const layoutGallery = (anchor, pick) => {
    const d = A.deck, W = d.size.w, sc = 84 / W; const g = h('.layp');
    d.layouts.forEach((l) => { const c = h('.thc'); const th = h('.th'); th.style.cssText = `width:84px;height:${d.size.h * sc}px`; const ks = K.renderSlide(d, K.layoutAsSlide(d, l), { layoutMode: true, edit: true }); ks.style.transform = `scale(${sc})`; th.append(ks); c.append(th, h('span', l.name)); c.onclick = () => { pick(l.id); zk.closePop(); }; g.append(c); setTimeout(() => K.fit(ks), 0); });
    zk.popover(anchor, g, { align: 'start' });
  };
  const slideFormat = () => {
    const d = A.deck, s = A.curSlide(); const lm = A.mode === 'layouts'; const out = [];
    if (!lm) out.push(section('layout', 'Slide Layout', [row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: (e) => layoutGallery(e.currentTarget, (id) => A.slides.setLayout(id)) }, (d.layouts.find((l) => l.id === s.layout) || {}).name || 'Layout')), row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.layoutMode(true) }, 'Edit Slide Layouts…'))]));
    const bgTarget = lm ? d.layouts[A.layIdx] : s;
    out.push(section('bg', 'Background', fillEditor(() => bgTarget.bg || null, (nf, label, live) => { bgTarget.bg = nf ? K.clone(nf) : undefined; A.render(); A.overlay(); if (live) A.emit('live'); else { A.commit('Background'); A.emit('edited'); } }, { title: 'Background' })));
    if (!lm) { out.push(section('sopts', 'Slide Options', [row('Skip slide', check(s.skip, () => A.slides.skip())), row('Slide number', check(!s.noNum, (v) => { s.noNum = v ? undefined : true; A.render(); A.commit('Slide Number'); A.emit('edited'); })), row('Notes', h('span.small', K.plain([{ runs: [{ t: (s.notes || '').slice(0, 40) }] }]) || 'None')) ])); }
    out.push(h('.iempty', 'Select an object to format it.'));
    return out;
  };

  // ---------- Animate ----------
  const TRANS = [['none', 'None'], ['dissolve', 'Dissolve'], ['fadeColor', 'Fade Through Color'], ['push', 'Push'], ['moveIn', 'Move In'], ['reveal', 'Reveal'], ['wipe', 'Wipe'], ['cube', 'Cube'], ['flip', 'Flip'], ['zoom', 'Zoom'], ['magic', 'Magic Move']];
  const FX_IN = [['appear', 'Appear'], ['fade', 'Fade'], ['fly', 'Fly'], ['scale', 'Scale'], ['spin', 'Spin'], ['wipe', 'Wipe'], ['blur', 'Blur'], ['bounce', 'Bounce'], ['drop', 'Drop']];
  const FX_ACT = [['pulse', 'Pulse'], ['grow', 'Grow'], ['shrink', 'Shrink'], ['spin360', 'Spin 360°'], ['wiggle', 'Wiggle'], ['flash', 'Flash'], ['path', 'Motion Path']];
  K.FX = { FX_IN, FX_ACT, TRANS };
  const buildLabel = (b) => ({ in: 'In', out: 'Out', action: 'Action' }[b.kind] + ': ' + ([...FX_IN, ...FX_ACT].find((x) => x[0] === b.fx) || [0, b.fx])[1]);
  const animateTab = () => {
    const s = A.curSlide(); const d = A.deck; const out = []; const tr = (s.tr ||= { type: 'none' }); if (A.mode === 'layouts') return [h('.iempty', 'Animations apply to slides, not layouts.')];
    const prev = () => A.emit('previewTransition');
    out.push(section('trans', 'Slide Transition', [
      row('Effect', select(TRANS.map(([v, label]) => ({ v, label })), tr.type, (v) => { tr.type = v; if (v !== 'none') { tr.dur = tr.dur || 0.8; } A.commit('Transition'); A.emit('edited'); I.refresh(); prev(); })),
      tr.type !== 'none' ? row('Duration', slider(0.2, 3, 0.1, tr.dur || 0.8, (v) => (tr.dur = v), (v) => { tr.dur = v; A.commit('Transition'); A.emit('edited'); I.refresh(); }), h('span.small', (tr.dur || 0.8).toFixed(1) + 's')) : null,
      ['push', 'moveIn', 'reveal', 'wipe', 'cube', 'flip'].includes(tr.type) ? row('Direction', seg([{ v: 'l', icon: 'arrow-left', title: 'From Right' }, { v: 'r', icon: 'arrow-right', title: 'From Left' }, { v: 'u', icon: 'arrow-up', title: 'From Bottom' }, { v: 'd', icon: 'arrow-down', title: 'From Top' }], tr.dir || 'l', (v) => { tr.dir = v; A.commit('Transition'); A.emit('edited'); I.refresh(); prev(); })) : null,
      tr.type === 'fadeColor' ? row('Color', sw(tr.color || '#000000', (c) => { tr.color = c || '#000000'; A.commit('Transition'); I.refresh(); })) : null,
      tr.type === 'magic' ? h('.small', 'Objects with the same name on both slides morph in position, size and rotation.') : null,
      tr.type !== 'none' ? row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: prev }, 'Preview Transition')) : null,
    ]));
    out.push(section('adv', 'Slide Advance', [row('On click', check(!s.adv, (v) => { s.adv = v ? 0 : 5; A.commit('Advance'); I.refresh(); })), s.adv ? row('After', num(s.adv, (v) => { s.adv = Math.max(0.5, v); A.commit('Advance'); }, { dec: 1, w: 56 }), h('span.small', 'seconds')) : null]));
    // builds
    const builds = (s.builds ||= []); const os = objs(); const o = os[0];
    const add = (kind) => { if (!o) return; const fx = kind === 'action' ? 'pulse' : 'fade'; const b = { id: K.uid(), obj: o.id, kind, fx, dur: 0.6, delay: 0, trig: 'click', dir: 'l', ease: 'ease', para: false }; builds.push(b); I.selBuild = b.id; A.commit('Add Build'); A.emit('edited'); I.refresh(); };
    out.push(section('builds', 'Object Builds', [
      o && os.length === 1 ? row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => add('in') }, 'Build In'), h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => add('action') }, 'Action'), h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => add('out') }, 'Build Out')) : h('.small', 'Select an object to add Build In, Action or Build Out effects.'),
    ]));
    const sb = builds.find((b) => b.id === I.selBuild);
    if (sb) out.push(section('buildopts', 'Build Options', buildOptions(sb, s)));
    // order list with mini timeline
    let t = 0; const tl = builds.map((b, i) => { if (b.trig === 'click' || i === 0) t = Math.max(t, 0); return b; });
    const sched = schedule(builds); const total = Math.max(0.1, ...sched.map((x) => x.end));
    out.push(section('order', 'Build Order (' + builds.length + ')', builds.length ? [...builds.map((b, i) => { const ob = K.findObj(s.objs, b.obj); const sc = sched[i]; const r = h('.build-row' + (b.id === I.selBuild ? '.sel' : ''), { onclick: () => { I.selBuild = b.id; if (ob) A.select([ob.id]); I.refresh(); } }, h('.bn', i + 1), h('.bt', (ob ? ob.name || K.defaultName(ob) : '(deleted)') + ' — ' + buildLabel(b)), h('.tl', h('i', { style: { left: (sc.start / total) * 100 + '%', width: Math.max(4, ((sc.end - sc.start) / total) * 100) + '%' } }))); return r; }), row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', disabled: !sb, onclick: () => moveBuild(s, -1) }, 'Move Up'), h('button.zk-btn.bordered.kbtn.grow', { type: 'button', disabled: !sb, onclick: () => moveBuild(s, 1) }, 'Move Down')), row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.emit('previewBuilds') }, 'Preview Builds'))] : h('.small', 'No builds on this slide.')));
    return out;
  };
  const moveBuild = (s, d) => { const i = s.builds.findIndex((b) => b.id === I.selBuild); const j = i + d; if (i < 0 || j < 0 || j >= s.builds.length) return; const [b] = s.builds.splice(i, 1); s.builds.splice(j, 0, b); A.commit('Reorder Builds'); I.refresh(); };
  const schedule = (builds) => { let clickT = 0, last = 0, prevEnd = 0; return builds.map((b, i) => { let start; if (b.trig === 'click' || i === 0) { start = prevEnd; clickT = start; } else if (b.trig === 'with') start = clickT; else start = prevEnd; const end = start + (b.delay || 0) + (b.dur || 0.6); if (b.trig === 'click' || i === 0) prevEnd = end; else prevEnd = Math.max(prevEnd, end); if (b.trig === 'with') { prevEnd = Math.max(prevEnd, end); } return { start: start + (b.delay || 0), end }; }); };
  const buildOptions = (b, s) => {
    const o = K.findObj(s.objs, b.obj); const list = b.kind === 'action' ? FX_ACT : FX_IN; const set = (k, v, re) => { b[k] = v; A.commit('Build'); A.emit('edited'); if (re) I.refresh(); };
    return [
      row('Effect', select(list.map(([v, label]) => ({ v, label })), b.fx, (v) => set('fx', v, true))),
      ['fly', 'wipe', 'drop', 'push'].includes(b.fx) ? row('Direction', seg([{ v: 'l', icon: 'arrow-left', title: 'From Left' }, { v: 'r', icon: 'arrow-right', title: 'From Right' }, { v: 'u', icon: 'arrow-up', title: 'From Top' }, { v: 'd', icon: 'arrow-down', title: 'From Bottom' }], b.dir || 'l', (v) => set('dir', v, true))) : null,
      b.fx === 'path' ? h('.igrid', row('ΔX', num(b.dx || 200, (v) => set('dx', v), { w: 48 })), row('ΔY', num(b.dy || 0, (v) => set('dy', v), { w: 48 }))) : null,
      row('Start', select([{ v: 'click', label: 'On Click' }, { v: 'with', label: 'With Previous' }, { v: 'after', label: 'After Previous' }], b.trig, (v) => set('trig', v, true))),
      row('Duration', slider(0.1, 4, 0.1, b.dur || 0.6, (v) => (b.dur = v), (v) => set('dur', v, true)), h('span.small', (b.dur || 0.6).toFixed(1) + 's')),
      row('Delay', slider(0, 4, 0.1, b.delay || 0, (v) => (b.delay = v), (v) => set('delay', v, true)), h('span.small', (b.delay || 0).toFixed(1) + 's')),
      row('Easing', select([{ v: 'ease', label: 'Ease In & Out' }, { v: 'out', label: 'Ease Out' }, { v: 'in', label: 'Ease In' }, { v: 'linear', label: 'Linear' }, { v: 'spring', label: 'Spring' }], b.ease || 'ease', (v) => set('ease', v))),
      o && (o.type === 'text' || o.type === 'shape') && b.kind !== 'action' ? row('By paragraph', check(b.para, (v) => set('para', v))) : null,
      row(null, h('button.zk-btn.bordered.kbtn.grow.danger', { type: 'button', onclick: () => { s.builds = s.builds.filter((x) => x !== b); I.selBuild = null; A.commit('Delete Build'); A.emit('edited'); I.refresh(); } }, 'Delete Build')),
    ];
  };

  // ---------- Document ----------
  const themeGallery = () => {
    const d = A.deck; const g = h('.thgrid'); const W = 126; const sc = W / d.size.w;
    K.themes.forEach((t) => {
      const td = K.newDeck(t.id, d.size); td.opts.showNumbers = false; const s = K.newSlide(td, 'title'); s.objs[0].paras = K.paras('Aa Title'); s.objs[1].paras = K.paras('Subtitle'); const c = h('.thc' + (d.theme.id === t.id ? '.sel' : ''), { role: 'button', tabindex: 0, 'aria-label': t.name + ' theme' }); const th = h('.th'); th.style.cssText = `width:${W}px;height:${d.size.h * sc}px`;
      const ks = K.renderSlide(td, s, { index: 0 }); ks.style.transform = `scale(${sc})`; th.append(ks); c.append(th, h('span', t.name)); setTimeout(() => K.fit(ks), 0);
      const go = async () => { if (d.theme.id === t.id) return; if (d._layoutsEdited && !(await zk.confirm('Change theme?', 'Your customised slide layouts will be reset to the new theme’s layouts.', 'Change Theme'))) return; if (A.editing) A.endEdit(true); K.applyTheme(d, t.id); d._lk = K.uid(); A.render(); A.commit('Change Theme'); A.emit('edited'); A.emit('theme'); I.refresh(); };
      c.onclick = go; c.onkeydown = (e) => { if (e.key === 'Enter') go(); }; g.append(c);
    }); return g;
  };
  const docTab = () => {
    const d = A.deck; const out = [];
    out.push(section('themes', 'Theme', [themeGallery(), h('.small', 'Switching theme re-skins every slide: fonts, colours, backgrounds and layouts.')]));
    const sizeKey = Object.entries(K.SIZES).find(([, v]) => v.w === d.size.w && v.h === d.size.h);
    out.push(section('size', 'Slide Size', [
      row(null, select([...Object.keys(K.SIZES).map((k) => ({ v: k, label: k + ' (' + K.SIZES[k].w + ' × ' + K.SIZES[k].h + ')' })), { v: 'custom', label: 'Custom' }], sizeKey ? sizeKey[0] : 'custom', (v) => { if (v !== 'custom') setSize(K.SIZES[v].w, K.SIZES[v].h); else I.refresh(); })),
      h('.igrid', row('W', num(d.size.w, (v) => setSize(Math.round(v), d.size.h), { min: 200, max: 4000, w: 56 })), row('H', num(d.size.h, (v) => setSize(d.size.w, Math.round(v)), { min: 200, max: 4000, w: 56 }))),
    ]));
    out.push(section('layouts', 'Slide Layouts', [row(null, h('button.zk-btn.bordered.kbtn.grow', { type: 'button', onclick: () => A.layoutMode(true) }, 'Edit Slide Layouts…')), h('.small', d.layouts.length + ' layouts. Edit placeholders, backgrounds and decorations once; every slide that uses a layout follows.')]));
    const pal = d.theme.pal; const names = [['bg', 'Background'], ['fg', 'Text'], ['mut', 'Muted'], ['a1', 'Accent 1'], ['a2', 'Accent 2'], ['a3', 'Accent 3'], ['a4', 'Accent 4'], ['a5', 'Accent 5'], ['a6', 'Accent 6']];
    out.push(section('palette', 'Colors', [h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 4px' } }, ...names.map(([k, n]) => h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' } }, sw(pal[k], (c) => { if (!c) return; d.theme.pal[k] = K.hex(d, c); A.render(); A.commit('Palette'); A.emit('edited'); I.refresh(); }, { title: n }), h('span.small', n)))), h('.small', 'Objects that use theme colors update with the palette.')]));
    out.push(section('numbers', 'Slide Numbers & Footer', [
      row('Slide numbers', check(d.opts.showNumbers, (v) => { d.opts.showNumbers = v; A.render(); A.commit('Slide Numbers'); A.emit('edited'); })), row('Date', check(d.opts.showDate, (v) => { d.opts.showDate = v; A.render(); A.commit('Date'); A.emit('edited'); })),
      row('Footer', h('input.zk-input.selectable.grow', { value: d.opts.footer || '', placeholder: 'Footer text', onchange: (e) => { d.opts.footer = e.target.value; A.render(); A.commit('Footer'); A.emit('edited'); } })),
    ]));
    out.push(section('play', 'Presentation', [
      row('Loop', check(d.opts.loop, (v) => { d.opts.loop = v; A.commit('Loop'); A.emit('edited'); })),
      row('Auto-advance', check(d.opts.advance > 0, (v) => { d.opts.advance = v ? 5 : 0; A.commit('Auto-advance'); A.emit('edited'); I.refresh(); }), d.opts.advance > 0 ? h('span', num(d.opts.advance, (v) => { d.opts.advance = Math.max(1, v); A.commit('Auto-advance'); }, { w: 48 })) : null, d.opts.advance > 0 ? h('span.small', 's / slide') : null),
      row('Laser color', sw(d.opts.laser || '#ff3b30', (c) => { d.opts.laser = K.hex(d, c || '#ff3b30'); A.commit('Laser'); I.refresh(); })),
      row('Timer (min)', num(d.opts.timer || 0, (v) => { d.opts.timer = Math.max(0, v); A.commit('Timer'); }, { w: 48 })),
    ]));
    const words = d.slides.reduce((n, s) => n + s.objs.reduce((m, o) => m + (o.paras ? (K.plain(o.paras).match(/\S+/g) || []).length : 0), 0), 0);
    out.push(section('info', 'Document', [h('.small', `${d.slides.length} slides · ${words} words · ${Object.keys(d.media).length} media files`)]));
    return out;
  };
  const setSize = (w, hgt) => { const d = A.deck; if (w === d.size.w && hgt === d.size.h) return; K.resize(d, w, hgt); d._lk = K.uid(); A.render(); A.commit('Slide Size'); A.emit('edited'); I.refresh(); };

  // ---------- chart data editor ----------
  const chartData = async (o) => {
    const d = o.data; const work = K.clone(d); const grid = h('.dgrid'); const draw = () => { grid.replaceChildren(); grid.style.gridTemplateColumns = `repeat(${work.series.length + 1}, minmax(70px, 1fr))`; const hd = (v, fn, bold) => h('input' + (bold ? '.h' : ''), { value: v, onchange: (e) => fn(e.target.value) }); grid.append(h('input.h', { value: '', disabled: true, placeholder: o.kind === 'scatter' ? 'X' : 'Category' })); work.series.forEach((s, i) => grid.append(hd(s.name, (v) => (s.name = v), true))); work.cats.forEach((c, r) => { grid.append(hd(c, (v) => (work.cats[r] = v))); work.series.forEach((s) => grid.append(h('input', { value: s.vals[r] ?? 0, inputMode: 'decimal', onchange: (e) => (s.vals[r] = parseFloat(e.target.value) || 0) }))); }); };
    draw(); const bar = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => { work.cats.push('Item ' + (work.cats.length + 1)); work.series.forEach((s) => s.vals.push(0)); draw(); } }, '+ Row'), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => { if (work.cats.length > 1) { work.cats.pop(); work.series.forEach((s) => s.vals.pop()); draw(); } } }, '− Row'),
      h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => { work.series.push({ name: 'Series ' + (work.series.length + 1), vals: work.cats.map(() => 0) }); draw(); } }, '+ Series'), h('button.zk-btn.bordered.kbtn', { type: 'button', onclick: () => { if (work.series.length > 1) { work.series.pop(); draw(); } } }, '− Series'));
    const r = await zk.sheet({ title: 'Chart Data', message: 'Edit values directly. Pie and donut charts use the first series.', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, bar, grid), width: 560, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
    if (r === 'ok') { o.data = work; A.renderObj(o.id); A.overlay(); A.commit('Chart Data'); A.emit('edited'); I.refresh(); }
  };
  A.on('editChart', chartData);

  // ---------- main render ----------
  I.refresh = () => { if (I._raf) return; I._raf = requestAnimationFrame(() => { I._raf = 0; I.render(); }); };
  I.render = () => {
    if (!A.deck) return; const top = (insp.querySelector('.ibody') || {}).scrollTop || 0;
    const tabs = h('.itabs', seg([{ v: 'format', label: 'Format' }, { v: 'animate', label: 'Animate' }, { v: 'doc', label: 'Document' }], I.tab, (v) => { I.tab = v; I.render(); }));
    const body = h('.ibody'); const os = objs(); let secs = [];
    if (I.tab === 'format') {
      if (!os.length) secs = slideFormat();
      else {
        const hasText = os.every((o) => ['text', 'shape', 'table'].includes(o.type)); const subs = [{ v: 'style', label: 'Style' }, ...(hasText ? [{ v: 'text', label: 'Text' }] : []), { v: 'arrange', label: 'Arrange' }]; if (!subs.some((x) => x.v === I.sub)) I.sub = 'style';
        const sub = h('div', { style: { padding: '8px 14px 0' } }, seg(subs, I.sub, (v) => { I.sub = v; I.render(); }, 'full')); sub.firstChild.style.display = 'flex'; sub.firstChild.querySelectorAll('button').forEach((b) => (b.style.flex = '1'));
        body.append(sub); secs = I.sub === 'style' ? styleSections(os) : I.sub === 'text' ? textSection(os) : arrange(os);
        if (os.length > 1) body.prepend(h('.small', { style: { padding: '8px 14px 0' } }, os.length + ' objects selected'));
      }
    } else if (I.tab === 'animate') secs = animateTab(); else secs = docTab();
    secs.forEach((s) => body.append(s)); insp.replaceChildren(tabs, body); body.scrollTop = top;
  };
  A.on('select', I.refresh); A.on('slide', I.refresh); A.on('restore', I.refresh); A.on('edited', () => { if (I.tab !== 'format' || !A.sel.length) I.refresh(); else I.refreshSoft(); }); A.on('theme', I.refresh);
  I.refreshSoft = zk.debounce(() => { const a = document.activeElement; if (a && insp.contains(a) && a.matches('input[type=text],input.num')) return; I.refresh(); }, 80);
  A.on('fmtstate', zk.debounce(() => { if (I.tab === 'format' && I.sub === 'text') I.render(); }, 120));
  A.on('editstart', () => { if (I.tab === 'format') { const os = objs(); if (os.length && os.every((o) => ['text', 'shape', 'table'].includes(o.type))) I.sub = 'text'; } I.refresh(); });
  A.on('editend', I.refresh);
  A.layoutMode = (on) => { A.endEdit(true); A.mode = on ? 'layouts' : 'slides'; A.sel = []; A.live.crop = null; if (on) { const l = A.deck.layouts.findIndex((x) => x.id === A.deck.slides[A.cur].layout); A.layIdx = Math.max(0, l); } A.render(); A.emit('layoutmode', on); A.emit('slide'); on ? A.slides.renderLayouts() : (A.deck._layoutsEdited = true, K.sync(A.deck), A.render(), A.slides.render(true)); };
})();
