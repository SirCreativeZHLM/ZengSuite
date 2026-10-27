/* Themes, slide layouts and the deck model basics. */
(() => {
  const K = (window.K = window.K || {});
  const uid = () => Math.random().toString(36).slice(2, 10);
  K.uid = uid;

  const pal = (bg, fg, mut, a) => ({ bg, fg, mut, a1: a[0], a2: a[1], a3: a[2], a4: a[3], a5: a[4], a6: a[5] });
  const sans = '"Geist", sans-serif';
  const T = [
    { id: 'clean', name: 'Clean', dark: false, pal: pal('#ffffff', '#1d1d1f', '#6e6e73', ['#0a84ff', '#30b25a', '#ff9f0a', '#ff453a', '#bf5af2', '#40b8e8']), head: sans, body: sans, hw: 700, motif: 'clean', al: 'l' },
    { id: 'midnight', name: 'Midnight', dark: true, pal: pal('#0a0f1f', '#f2f5ff', '#8c97b8', ['#5ac8fa', '#7d7aff', '#ff6bd5', '#ffd166', '#4ade80', '#fb7185']), head: sans, body: sans, hw: 700, motif: 'glow', al: 'l' },
    { id: 'sunset', name: 'Sunset', dark: true, pal: pal('#8a2be2', '#ffffff', 'rgba(255,255,255,.72)', ['#ffd166', '#ffffff', '#ff9f80', '#7cf5d4', '#ffe29a', '#c7b8ff']), bgFill: { t: 'grad', kind: 'linear', ang: 135, stops: [[0, '#ff7a59'], [0.5, '#c13584'], [1, '#4a1f8c']] }, head: sans, body: sans, hw: 800, motif: 'circles', al: 'l' },
    { id: 'editorial', name: 'Editorial', dark: false, pal: pal('#f6f1e7', '#1a1a1a', '#6b655b', ['#b3261e', '#1f4e79', '#c58b2a', '#3a6b4f', '#7a4a8b', '#555555']), head: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', body: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', hw: 700, motif: 'rules', al: 'l' },
    { id: 'mono', name: 'Mono', dark: false, pal: pal('#ffffff', '#000000', '#707070', ['#000000', '#e5322d', '#2f6bff', '#00a86b', '#f5a300', '#8e44ad']), head: '"Helvetica Neue", Helvetica, "Inter", Arial, sans-serif', body: '"Helvetica Neue", Helvetica, "Inter", Arial, sans-serif', hw: 300, motif: 'frame', al: 'l' },
    { id: 'bold', name: 'Bold', dark: false, pal: pal('#ffd60a', '#111111', '#4a4300', ['#111111', '#ff3b30', '#0a84ff', '#ffffff', '#34c759', '#af52de']), head: '"Arial Black", "Helvetica Neue", "Inter", Impact, sans-serif', body: '"Helvetica Neue", "Inter", Arial, sans-serif', hw: 900, motif: 'block', al: 'l', up: true },
    { id: 'ocean', name: 'Ocean', dark: true, pal: pal('#0f2a3a', '#f0fbff', '#9cc4d4', ['#4de3d0', '#5aa9ff', '#ffd166', '#ff8a7a', '#b6a6ff', '#7ee08a']), bgFill: { t: 'grad', kind: 'linear', ang: 160, stops: [[0, '#0b1f2e'], [1, '#1f5c73']] }, head: sans, body: sans, hw: 700, motif: 'waves', al: 'l' },
    { id: 'forest', name: 'Forest', dark: false, pal: pal('#f1efe4', '#1f3a2b', '#5c7466', ['#2f7d4f', '#c8643c', '#d9a441', '#3d6f8e', '#8a5a7a', '#6b8f3a']), head: 'Georgia, "Times New Roman", serif', body: '"Avenir Next", "Inter", sans-serif', hw: 700, motif: 'leaves', al: 'l' },
    { id: 'graphite', name: 'Graphite', dark: true, pal: pal('#222426', '#f4f4f2', '#9a9c9e', ['#ff8a1f', '#35c6b5', '#ffd23f', '#ef476f', '#8d99ae', '#6ab0ff']), head: sans, body: sans, hw: 700, motif: 'bar', al: 'l' },
    { id: 'paper', name: 'Paper', dark: false, pal: pal('#fbf8f1', '#33281d', '#8a7a68', ['#8a5a2b', '#3f6c5a', '#c2542d', '#4a6fa5', '#a67c00', '#6e4b6b']), head: 'Rockwell, "Roboto Slab", "Courier New", Georgia, serif', body: 'Georgia, "Times New Roman", serif', hw: 700, motif: 'paper', al: 'c' },
    { id: 'neon', name: 'Neon', dark: true, pal: pal('#08080f', '#f6f4ff', '#8f8aa8', ['#ff2bd6', '#00e5ff', '#b6ff3b', '#ffb02b', '#7c5cff', '#ff5470']), head: sans, body: sans, hw: 800, motif: 'neon', al: 'l' },
    { id: 'swiss', name: 'Swiss', dark: false, pal: pal('#ffffff', '#111111', '#666666', ['#e30613', '#111111', '#0057b8', '#ffc800', '#00875a', '#888888']), head: '"Helvetica Neue", Helvetica, "Inter", Arial, sans-serif', body: '"Helvetica Neue", Helvetica, "Inter", Arial, sans-serif', hw: 700, motif: 'swiss', al: 'l' },
    { id: 'blush', name: 'Blush', dark: false, pal: pal('#fdeff4', '#3b2340', '#8c6a8f', ['#d6336c', '#7c5cff', '#f4a261', '#2ec4b6', '#e76f9a', '#5aa9e6']), bgFill: { t: 'grad', kind: 'linear', ang: 135, stops: [[0, '#fff1f5'], [1, '#e9e0ff']] }, head: '"Avenir Next", "Inter", sans-serif', body: '"Avenir Next", "Inter", sans-serif', hw: 700, motif: 'blobs', al: 'c' },
    { id: 'slate', name: 'Slate', dark: false, pal: pal('#eef1f5', '#1f2d3d', '#64748b', ['#0f9d8a', '#2f6fed', '#f59e0b', '#e11d48', '#7c3aed', '#475569']), head: sans, body: sans, hw: 700, motif: 'band', al: 'l' },
  ];
  K.themes = T;
  K.themeData = (id) => { const t = T.find((x) => x.id === id) || T[0]; return { id: t.id, name: t.name, dark: t.dark, pal: { ...t.pal }, head: t.head, body: t.body, hw: t.hw, bgFill: t.bgFill ? JSON.parse(JSON.stringify(t.bgFill)) : null, up: !!t.up, al: t.al }; };

  // ---------- object factories ----------
  const base = (o) => ({ id: uid(), name: '', x: 0, y: 0, w: 100, h: 100, rot: 0, ...o });
  const shp = (shape, x, y, w, h, fill, o = {}) => base({ type: 'shape', shape, x, y, w, h, fill: typeof fill === 'string' ? { t: 'solid', c: fill } : fill, line: null, lock: true, ...o });
  K.mk = { base, shp };
  const solid = (c, a = 1) => ({ t: 'solid', c, a });
  const glow = (c, a = 0.35) => ({ t: 'grad', kind: 'radial', ang: 0, stops: [[0, c, a], [1, c, 0]] });

  // motif decorations per category: 'title' | 'content' | 'section'
  const motifs = {
    clean: (t, W, H, k, cat) => cat === 'content' ? [shp('roundRect', W * 0.075, H * 0.075, 44 * k, 6 * k, 'a1', { adj: [0.5] })] : cat === 'title' ? [shp('ellipse', W * 0.62, -H * 0.25, H * 1.1, H * 1.1, { t: 'solid', c: 'a1', a: 0.1 }), shp('ellipse', W * 0.78, H * 0.5, H * 0.7, H * 0.7, { t: 'solid', c: 'a1', a: 0.07 })] : [],
    glow: (t, W, H, k, cat) => [shp('ellipse', W * 0.55, -H * 0.4, H * 1.4, H * 1.4, glow('a1', cat === 'content' ? 0.18 : 0.4)), shp('ellipse', -H * 0.4, H * 0.5, H * 1.2, H * 1.2, glow('a2', cat === 'content' ? 0.1 : 0.25))],
    circles: (t, W, H, k, cat) => [shp('ellipse', W * 0.62, H * (cat === 'content' ? 0.55 : 0.15), H * 1.0, H * 1.0, { t: 'solid', c: '#ffffff', a: 0.08 }), shp('ellipse', W * 0.78, H * (cat === 'content' ? 0.75 : 0.5), H * 0.5, H * 0.5, { t: 'solid', c: '#ffffff', a: 0.1 })],
    rules: (t, W, H, k, cat) => [shp('rect', W * 0.075, H * 0.065, W * 0.85, 2 * k, 'fg'), shp('rect', W * 0.075, H * 0.065 + 5 * k, W * 0.85, 0.75 * k, 'fg'), ...(cat === 'content' ? [shp('rect', W * 0.075, H * 0.94, W * 0.85, 0.75 * k, 'mut')] : cat === 'title' ? [shp('rect', W * 0.075, H * 0.9, 56 * k, 5 * k, 'a1')] : [])],
    frame: (t, W, H, k, cat) => [shp('rect', 22 * k, 22 * k, W - 44 * k, H - 44 * k, null, { line: { c: 'fg', w: 0.75 * k } })],
    block: (t, W, H, k, cat) => cat === 'title' ? [shp('rect', 0, H * 0.78, W, H * 0.22, 'a1')] : cat === 'section' ? [shp('rect', W * 0.6, 0, W * 0.4, H, 'a1')] : [shp('rect', 0, 0, W * 0.025, H, 'a1')],
    waves: (t, W, H, k, cat) => [shp('wave', -W * 0.05, H * (cat === 'content' ? 0.86 : 0.7), W * 1.1, H * 0.35, { t: 'solid', c: 'a1', a: 0.16 }), shp('wave', -W * 0.1, H * (cat === 'content' ? 0.92 : 0.8), W * 1.2, H * 0.3, { t: 'solid', c: 'a2', a: 0.14 })],
    leaves: (t, W, H, k, cat) => [shp('ellipse', -H * 0.2, -H * 0.25, H * 0.6, H * 0.6, { t: 'solid', c: 'a1', a: 0.14 }), shp('ellipse', W - H * 0.35, H * 0.7, H * 0.7, H * 0.7, { t: 'solid', c: 'a2', a: 0.14 }), shp('ellipse', W - H * 0.2, H * 0.55, H * 0.25, H * 0.25, { t: 'solid', c: 'a3', a: 0.25 })],
    bar: (t, W, H, k, cat) => [shp('rect', W * 0.075 - 22 * k, cat === 'title' ? H * 0.2 : H * 0.12, 6 * k, cat === 'title' ? H * 0.34 : H * 0.12, 'a1')],
    paper: (t, W, H, k, cat) => [shp('rect', 26 * k, 26 * k, W - 52 * k, H - 52 * k, null, { line: { c: 'a1', w: 1.5 * k } }), shp('rect', 32 * k, 32 * k, W - 64 * k, H - 64 * k, null, { line: { c: 'a1', w: 0.5 * k } })],
    neon: (t, W, H, k, cat) => [shp('rect', 20 * k, 20 * k, W - 40 * k, H - 40 * k, null, { line: { c: 'a1', w: 1.5 * k }, sh: { x: 0, y: 0, b: 14 * k, c: 'a1', a: 0.9 } }), shp('rect', W * 0.075, H * (cat === 'content' ? 0.9 : 0.8), W * 0.85, 2 * k, 'a2', { sh: { x: 0, y: 0, b: 10 * k, c: 'a2', a: 0.9 } })],
    swiss: (t, W, H, k, cat) => cat === 'title' ? [shp('rect', 0, 0, W * 0.2, H, 'a1')] : cat === 'section' ? [shp('rect', 0, 0, W, H, 'a1')] : [shp('rect', W * 0.075, H * 0.07, 22 * k, 22 * k, 'a1'), shp('rect', W * 0.075, H * 0.93, W * 0.85, 1 * k, 'fg')],
    blobs: (t, W, H, k, cat) => [shp('ellipse', -H * 0.25, -H * 0.3, H * 0.8, H * 0.8, { t: 'solid', c: 'a1', a: 0.16 }), shp('ellipse', W - H * 0.45, H * 0.55, H * 0.9, H * 0.9, { t: 'solid', c: 'a2', a: 0.14 }), shp('ellipse', W * 0.82, H * 0.08, H * 0.22, H * 0.22, { t: 'solid', c: 'a3', a: 0.35 })],
    band: (t, W, H, k, cat) => cat === 'title' ? [shp('rect', 0, 0, W * 0.34, H, '#1f2d3d'), shp('rect', W * 0.34, 0, 6 * k, H, 'a1')] : [shp('rect', 0, 0, W, 10 * k, '#1f2d3d'), shp('rect', 0, 10 * k, W * 0.12, 4 * k, 'a1')],
  };

  const KINDS = [['title', 'Title'], ['titleContent', 'Title & Content'], ['twoContent', 'Two Content'], ['section', 'Section'], ['photo', 'Photo'], ['photoLeft', 'Photo & Text'], ['quote', 'Quote'], ['bigFact', 'Big Fact'], ['titleOnly', 'Title Only'], ['blank', 'Blank']];
  K.layoutKinds = KINDS;

  K.makeLayouts = (theme, W, H) => {
    const k = H / 540, mx = W * 0.075, cw = W - mx * 2, tc = theme.al === 'c';
    const t0 = T.find((x) => x.id === theme.id) || T[0];
    const up = !!theme.up, hw = theme.hw || 700, al = theme.al || 'l';
    const ph = (name, x, y, w, h, ts, o = {}) => base({ type: o.type || 'text', ph: name, name: o.label || name, x, y, w, h, ts: { f: 'body', c: 'fg', sz: 28, ...ts }, prompt: o.prompt || name, ...o });
    const title = (x, y, w, h, sz, extra = {}) => ph('title', x, y, w, h, { f: 'head', sz: sz * k, b: hw >= 600, w: hw, al, va: 'b', ls: 1.05, up, tr: up ? 1 : -0.5, ...extra }, { prompt: 'Title', label: 'Title' });
    const mut = (c) => c;
    const decoFor = (cat) => (motifs[t0.motif] || motifs.clean)(theme, W, H, k, cat).map((o) => ({ ...o, id: uid() }));
    const std = [
      base({ type: 'text', ph: 'slideno', name: 'Slide Number', x: W - mx - 60 * k, y: H - 40 * k, w: 60 * k, h: 24 * k, ts: { f: 'body', sz: 12 * k, c: 'mut', al: 'r', va: 'm' }, paras: [{ runs: [{ t: '', field: 'slideno' }] }] }),
      base({ type: 'text', ph: 'date', name: 'Date', x: mx, y: H - 40 * k, w: 160 * k, h: 24 * k, ts: { f: 'body', sz: 12 * k, c: 'mut', al: 'l', va: 'm' }, paras: [{ runs: [{ t: '', field: 'date' }] }] }),
      base({ type: 'text', ph: 'footer', name: 'Footer', x: W * 0.3, y: H - 40 * k, w: W * 0.4, h: 24 * k, ts: { f: 'body', sz: 12 * k, c: 'mut', al: 'c', va: 'm' }, paras: [{ runs: [{ t: '', field: 'footer' }] }] }),
    ];
    const L = (kind, name, bg, deco, phs) => ({ id: kind, kind, name, bg, objs: [...deco, ...phs, ...std.map((o) => ({ ...o, id: uid() }))] });
    const secBg = ['swiss'].includes(theme.id) ? null : null;
    const secText = theme.id === 'swiss' ? '#ffffff' : null;
    const body = (x, y, w, h, extra = {}) => ph('body', x, y, w, h, { sz: 28 * k, ls: 1.2, sa: 10 * k, list: 'b', ...extra }, { prompt: 'Body', label: 'Body' });
    const tx = theme.id === 'swiss' || theme.id === 'band' ? W * 0.25 : mx;
    const L1 = [];
    L1.push(L('title', 'Title', null, decoFor('title'), [
      title(theme.id === 'swiss' ? W * 0.25 : t0.motif === 'band' ? W * 0.4 : mx, H * 0.2, theme.id === 'swiss' ? W * 0.7 : t0.motif === 'band' ? W * 0.55 : cw, H * 0.34, 58),
      ph('subtitle', theme.id === 'swiss' ? W * 0.25 : t0.motif === 'band' ? W * 0.4 : mx, H * 0.57, theme.id === 'swiss' ? W * 0.7 : t0.motif === 'band' ? W * 0.55 : cw, H * 0.16, { sz: 26 * k, c: 'mut', al, va: 't' }, { prompt: 'Subtitle', label: 'Subtitle' }),
    ]));
    L1.push(L('titleContent', 'Title & Content', null, decoFor('content'), [title(mx, H * 0.1, cw, H * 0.17, 40, { va: 'm' }), body(mx, H * 0.3, cw, H * 0.58)]));
    L1.push(L('twoContent', 'Two Content', null, decoFor('content'), [title(mx, H * 0.1, cw, H * 0.17, 40, { va: 'm' }), body(mx, H * 0.3, cw / 2 - 16 * k, H * 0.58, { sz: 24 * k }), Object.assign(body(mx + cw / 2 + 16 * k, H * 0.3, cw / 2 - 16 * k, H * 0.58, { sz: 24 * k }), { ph: 'body2', name: 'Body 2' })]));
    const secBgFill = theme.id === 'swiss' ? solid('a1') : null;
    L1.push(L('section', 'Section', secBgFill, decoFor('section'), [title(mx, H * 0.3, cw * 0.8, H * 0.25, 54, { va: 'b', ...(secText ? { c: secText } : {}), al: al }), ph('subtitle', mx, H * 0.58, cw * 0.7, H * 0.14, { sz: 24 * k, c: secText || 'mut', al, va: 't' }, { prompt: 'Section description', label: 'Subtitle' })]));
    L1.push(L('photo', 'Photo', null, [], [
      ph('image', 0, 0, W, H, {}, { type: 'image', label: 'Photo', prompt: 'Photo' }),
      shp('rect', 0, H * 0.55, W, H * 0.45, { t: 'grad', kind: 'linear', ang: 180, stops: [[0, '#000000', 0], [1, '#000000', 0.72]] }),
      title(mx, H * 0.7, cw, H * 0.2, 44, { c: '#ffffff', va: 'b' }),
    ]));
    L1.push(L('photoLeft', 'Photo & Text', null, decoFor('content'), [
      ph('image', 0, 0, W * 0.46, H, {}, { type: 'image', label: 'Photo', prompt: 'Photo' }),
      title(W * 0.5, H * 0.12, W * 0.42, H * 0.25, 38, { va: 'b' }),
      body(W * 0.5, H * 0.42, W * 0.42, H * 0.46, { sz: 22 * k, list: 'none' }),
    ].filter(Boolean)));
    L1.push(L('quote', 'Quote', null, decoFor('title'), [
      shp('roundRect', mx, H * 0.17, 8 * k, H * 0.4, 'a1', { adj: [0.5] }),
      ph('quote', mx + 36 * k, H * 0.14, cw - 36 * k, H * 0.46, { f: 'head', sz: 40 * k, w: Math.min(hw, 600), i: theme.id === 'editorial' || theme.id === 'paper', al, va: 'm', ls: 1.2 }, { prompt: '“Quote”', label: 'Quote' }),
      ph('attribution', mx + 36 * k, H * 0.66, cw - 36 * k, H * 0.1, { sz: 20 * k, c: 'mut', al, va: 't' }, { prompt: 'Attribution', label: 'Attribution' }),
    ]));
    L1.push(L('bigFact', 'Big Fact', null, decoFor('content'), [
      ph('fact', mx, H * 0.14, cw, H * 0.44, { f: 'head', sz: 150 * k, w: 800, b: true, c: 'a1', al: tc ? 'c' : 'l', va: 'b', ls: 1, tr: -3 }, { prompt: '100%', label: 'Fact' }),
      ph('caption', mx, H * 0.6, cw, H * 0.18, { sz: 28 * k, al: tc ? 'c' : 'l', va: 't' }, { prompt: 'Fact description', label: 'Description' }),
    ]));
    L1.push(L('titleOnly', 'Title Only', null, decoFor('content'), [title(mx, H * 0.1, cw, H * 0.17, 40, { va: 'm' })]));
    L1.push(L('blank', 'Blank', null, decoFor('content').slice(0, theme.id === 'mono' || theme.id === 'neon' || theme.id === 'paper' ? 99 : 0), []));
    return L1.map((l) => ({ ...l, objs: l.objs.filter(Boolean) }));
  };
})();
