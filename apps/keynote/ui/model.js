/* Deck model: creation, placeholders, colours, geometry, media. */
(() => {
  const K = (window.K = window.K || {});
  const clone = (o) => JSON.parse(JSON.stringify(o));
  K.clone = clone;

  // ---------- colours ----------
  const hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  K.hexToRgb = hexToRgb;
  K.col = (deck, c) => { if (!c) return 'transparent'; if (c[0] === '#' || c.startsWith('rgb') || c.startsWith('hsl') || c === 'transparent') return c; const p = deck.theme.pal; return p[c] || (c === 'white' ? '#fff' : c === 'black' ? '#000' : c); };
  K.rgba = (deck, c, a = 1) => { const v = K.col(deck, c); if (a >= 1) return v; if (v[0] === '#') { const [r, g, b] = hexToRgb(v); return `rgba(${r},${g},${b},${a})`; } const m = v.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map((x) => x.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${(p[3] != null ? +p[3] : 1) * a})`; } return v; };
  K.hex = (deck, c) => { const v = K.col(deck, c); if (v[0] === '#') return v.length === 4 ? '#' + v.slice(1).split('').map((x) => x + x).join('') : v.slice(0, 7); const m = v.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map((x) => Math.round(+x)); return '#' + p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); } return '#000000'; };
  K.lum = (deck, c) => { const [r, g, b] = hexToRgb(K.hex(deck, c)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  K.fontCSS = (deck, f) => { if (!f || f === 'body') return deck.theme.body; if (f === 'head') return deck.theme.head; if (f.includes(',') || f.includes('"')) return f; return `"${f}", "Inter", sans-serif`; };
  K.fontName = (deck, f) => { const s = K.fontCSS(deck, f); const m = s.match(/^\s*"?([^",]+)"?/); return m ? m[1] : 'Arial'; };
  K.mediaURL = (deck, id) => { const m = deck.media[id]; if (!m) return ''; if (!m.url) m.url = URL.createObjectURL(new Blob([m.data], { type: m.type })); return m.url; };
  K.fillCSS = (deck, f) => {
    if (!f) return 'none'; if (typeof f === 'string') f = { t: 'solid', c: f };
    if (f.t === 'none') return 'none';
    if (f.t === 'solid') return K.rgba(deck, f.c, f.a ?? 1);
    if (f.t === 'grad') { const st = (f.stops || []).map((s) => `${K.rgba(deck, s[1], s[2] ?? 1)} ${Math.round(s[0] * 100)}%`).join(','); return f.kind === 'radial' ? `radial-gradient(closest-side at 50% 50%,${st})` : `linear-gradient(${f.ang ?? 180}deg,${st})`; }
    if (f.t === 'img') { const u = K.mediaURL(deck, f.m); if (!u) return 'none'; const mode = f.mode || 'fill'; return `url("${u}") ${mode === 'tile' ? '0 0/auto repeat' : mode === 'fit' ? 'center/contain no-repeat' : mode === 'stretch' ? 'center/100% 100% no-repeat' : 'center/cover no-repeat'}`; }
    return 'none';
  };
  K.avgColor = (deck, f) => { if (!f) return null; if (typeof f === 'string') return f; if (f.t === 'solid') return f.c; if (f.t === 'grad') return f.stops[Math.floor(f.stops.length / 2)][1]; return null; };

  // ---------- text ----------
  K.TS = { f: 'body', sz: 24, c: 'fg', al: 'l', va: 't', ls: 1.15, sa: 0, sb: 0, pad: 6, fit: 'none', cols: 1, gap: 24 };
  K.tstyle = (o) => Object.assign({}, K.TS, o.bs || {}, o.ts || {});
  K.paras = (s) => String(s ?? '').split('\n').map((t) => ({ runs: [{ t }] }));
  K.plain = (paras) => (paras || []).map((p) => p.runs.map((r) => (r.field ? '' : r.t)).join('')).join('\n');
  K.isEmptyText = (o) => !o.paras || !o.paras.some((p) => p.runs.some((r) => r.t || r.field));

  // ---------- media ----------
  K.addMedia = async (deck, bytes, name, type) => {
    const id = K.uid(); const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const m = (deck.media[id] = { id, name, type: type || 'application/octet-stream', data, url: null });
    if (/^image\//.test(m.type)) {
      await new Promise((res) => { const im = new Image(); im.onload = () => { m.w = im.naturalWidth || 800; m.h = im.naturalHeight || 600; res(); }; im.onerror = () => { m.w = 800; m.h = 600; res(); }; im.src = K.mediaURL(deck, id); });
    }
    return id;
  };
  K.mimeOf = (name) => { const e = name.split('.').pop().toLowerCase(); return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }[e] || 'application/octet-stream'; };

  // ---------- deck ----------
  K.SIZES = { '16:9': { w: 960, h: 540 }, '4:3': { w: 720, h: 540 }, '16:10': { w: 864, h: 540 } };
  K.newDeck = (themeId = 'clean', size = { w: 960, h: 540 }) => {
    const deck = { v: 1, size: { ...size }, theme: K.themeData(themeId), layouts: [], slides: [], media: {}, opts: { showNumbers: false, showDate: false, footer: '', loop: false, advance: 0, laser: '#ff3b30', timer: 0 } };
    deck.layouts = K.makeLayouts(deck.theme, size.w, size.h);
    return deck;
  };
  K.layoutOf = (deck, slide) => deck.layouts.find((l) => l.id === slide.layout) || deck.layouts.find((l) => l.id === 'blank') || deck.layouts[0];
  K.newSlide = (deck, layoutId = 'titleContent', fill) => {
    const lay = deck.layouts.find((l) => l.id === layoutId) || deck.layouts[0];
    const s = { id: K.uid(), layout: lay.id, objs: [], notes: '', tr: { type: 'none' }, builds: [] };
    for (const p of lay.objs) {
      if (!p.ph || ['slideno', 'date', 'footer'].includes(p.ph)) continue;
      s.objs.push({ id: K.uid(), type: p.type === 'image' ? 'image' : 'text', name: p.name, ph: p.ph, inh: true, x: p.x, y: p.y, w: p.w, h: p.h, rot: 0, paras: p.type === 'image' ? undefined : [{ runs: [{ t: '' }] }] });
    }
    K.sync(deck, s);
    return s;
  };
  // copy geometry/style from layout placeholders onto inheriting slide objects
  K.sync = (deck, only) => {
    for (const s of only ? [only] : deck.slides) {
      const lay = K.layoutOf(deck, s);
      for (const o of s.objs) {
        if (!o.ph) continue; const p = lay.objs.find((q) => q.ph === o.ph);
        if (!p) { o.ph = null; o.inh = false; o.bs = undefined; continue; }
        o.bs = p.ts; o.prompt = p.prompt;
        if (o.inh !== false) { o.x = p.x; o.y = p.y; o.w = p.w; o.h = p.h; o.rot = p.rot || 0; }
      }
    }
  };
  K.applyLayout = (deck, s, layoutId) => {
    const lay = deck.layouts.find((l) => l.id === layoutId); if (!lay) return;
    s.layout = layoutId;
    const used = new Set();
    for (const o of s.objs) { if (!o.ph) continue; const p = lay.objs.find((q) => q.ph === o.ph && !used.has(q)); if (p) { used.add(p); o.inh = true; } }
    // placeholders that no longer exist become plain objects
    K.sync(deck, s);
    // add missing placeholders
    for (const p of lay.objs) {
      if (!p.ph || ['slideno', 'date', 'footer'].includes(p.ph) || s.objs.some((o) => o.ph === p.ph)) continue;
      // reuse an unattached text object with the same role? keep simple: add empty placeholder
      s.objs.push({ id: K.uid(), type: p.type === 'image' ? 'image' : 'text', name: p.name, ph: p.ph, inh: true, x: p.x, y: p.y, w: p.w, h: p.h, rot: 0, paras: p.type === 'image' ? undefined : [{ runs: [{ t: '' }] }] });
    }
    K.sync(deck, s);
  };
  K.applyTheme = (deck, themeId) => {
    const old = deck.theme; deck.theme = K.themeData(themeId);
    deck.layouts = K.makeLayouts(deck.theme, deck.size.w, deck.size.h);
    // keep custom (non-theme) palette tokens untouched: explicit hex colours stay as authored
    K.sync(deck);
  };
  K.resize = (deck, w, h) => {
    const sx = w / deck.size.w, sy = h / deck.size.h, sf = Math.min(sx, sy);
    const scale = (o) => {
      o.x *= sx; o.w *= sx; o.y *= sy; o.h *= sy; if (o.ts && o.ts.sz) o.ts.sz *= sf; if (o.paras) o.paras.forEach((p) => p.runs.forEach((r) => { if (r.sz) r.sz *= sf; }));
      if (o.a) { o.a.x *= sx; o.a.y *= sy; o.b.x *= sx; o.b.y *= sy; } if (o.kids) o.kids.forEach(scale); if (o.cw) { o.cw = o.cw.map((v) => v * sx); o.rh = o.rh.map((v) => v * sy); }
      if (o.line && o.line.w) o.line.w *= sf;
    };
    deck.slides.forEach((s) => s.objs.forEach(scale));
    deck.size = { w, h }; deck.layouts = K.makeLayouts(deck.theme, w, h); K.sync(deck);
  };

  // ---------- geometry ----------
  K.rotPt = (x, y, cx, cy, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); const dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  K.corners = (o) => { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(([x, y]) => (o.rot ? K.rotPt(x, y, cx, cy, o.rot) : [x, y])); };
  K.bbox = (objs) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const o of objs) for (const [x, y] of K.corners(o)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  K.siteXY = (o, site) => { const [lx, ly] = K.sites(o.w, o.h)[site] || K.sites(o.w, o.h)[0]; const cx = o.x + o.w / 2, cy = o.y + o.h / 2; return o.rot ? K.rotPt(o.x + lx, o.y + ly, cx, cy, o.rot) : [o.x + lx, o.y + ly]; };
  K.findObj = (objs, id) => { for (const o of objs) { if (o.id === id) return o; if (o.kids) { const r = K.findObj(o.kids, id); if (r) return r; } } return null; };
  K.walk = (objs, fn) => { for (const o of objs) { fn(o); if (o.kids) K.walk(o.kids, fn); } };
  K.regroup = (g) => { const b = K.bbox(g.kids); g.x = b.x; g.y = b.y; g.w = b.w; g.h = b.h; };
  K.moveObj = (o, dx, dy) => { o.x += dx; o.y += dy; if (o.type === 'group') o.kids.forEach((k) => K.moveObj(k, dx, dy)); if (o.type === 'conn') { o.a.x += dx; o.a.y += dy; o.b.x += dx; o.b.y += dy; } };
  // scale an object (and group children / connector ends) about an anchor
  K.scaleObj = (o, ax, ay, sx, sy) => {
    o.x = ax + (o.x - ax) * sx; o.y = ay + (o.y - ay) * sy; o.w *= Math.abs(sx); o.h *= Math.abs(sy);
    if (o.type === 'group') o.kids.forEach((k) => K.scaleObj(k, ax, ay, sx, sy));
    if (o.type === 'conn') { for (const e of [o.a, o.b]) { e.x = ax + (e.x - ax) * sx; e.y = ay + (e.y - ay) * sy; } }
    if (o.type === 'table') { o.cw = o.cw.map((v) => v * Math.abs(sx)); o.rh = o.rh.map((v) => v * Math.abs(sy)); }
  };
  K.rotateAbout = (o, cx, cy, deg) => {
    const c = K.rotPt(o.x + o.w / 2, o.y + o.h / 2, cx, cy, deg); o.x = c[0] - o.w / 2; o.y = c[1] - o.h / 2; o.rot = (((o.rot || 0) + deg) % 360 + 360) % 360;
    if (o.type === 'group') o.kids.forEach((k) => K.rotateAbout(k, cx, cy, deg));
  };
  // freshly cloned object with new ids (also for children)
  K.dupObj = (o) => { const c = clone(o); K.walk([c], (x) => { x.id = K.uid(); }); return c; };

  // connectors: resolve endpoints that are attached to objects, then compute route
  K.connEnds = (o, objs) => {
    const ends = [o.a, o.b].map((e) => { if (e.id) { const t = K.findObj(objs, e.id); if (t) { const [x, y] = K.siteXY(t, e.site || 0); e.x = x; e.y = y; return { x, y, dir: ((e.site || 0) + (t.rot ? Math.round(t.rot / 90) : 0)) % 4 }; } e.id = null; } return { x: e.x, y: e.y, dir: null }; });
    return ends;
  };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  K.connPath = (o, objs) => {
    const [A, B] = K.connEnds(o, objs); let pts, d;
    const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);
    if (o.route === 'elbow') {
      const stub = 18; const sa = A.dir != null ? [A.x + DIRS[A.dir][0] * stub, A.y + DIRS[A.dir][1] * stub] : [A.x, A.y], sb = B.dir != null ? [B.x + DIRS[B.dir][0] * stub, B.y + DIRS[B.dir][1] * stub] : [B.x, B.y];
      const hz = (dd, p, q) => (dd != null ? dd === 1 || dd === 3 : Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]));
      const h1 = hz(A.dir, sa, sb), h2 = hz(B.dir, sb, sa); const mid = [];
      if (h1 && h2) { const mx = (sa[0] + sb[0]) / 2; mid.push([mx, sa[1]], [mx, sb[1]]); }
      else if (!h1 && !h2) { const my = (sa[1] + sb[1]) / 2; mid.push([sa[0], my], [sb[0], my]); }
      else if (h1) mid.push([sb[0], sa[1]]); else mid.push([sa[0], sb[1]]);
      pts = [[A.x, A.y], ...(A.dir != null ? [sa] : []), ...mid, ...(B.dir != null ? [sb] : []), [B.x, B.y]];
      // drop duplicates
      pts = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
      d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('');
      var ha = ang(pts[pts.length > 1 ? 1 : 0], pts[0]), hb = ang(pts[Math.max(0, pts.length - 2)], pts[pts.length - 1]);
    } else if (o.route === 'curve') {
      const dist = Math.max(30, Math.hypot(B.x - A.x, B.y - A.y) / 2.5);
      const v = [B.x - A.x, B.y - A.y]; const n = Math.hypot(v[0], v[1]) || 1;
      const d1 = A.dir != null ? DIRS[A.dir] : [v[0] / n, v[1] / n], d2 = B.dir != null ? DIRS[B.dir] : [-v[0] / n, -v[1] / n];
      const c1 = [A.x + d1[0] * dist, A.y + d1[1] * dist], c2 = [B.x + d2[0] * dist, B.y + d2[1] * dist];
      d = `M${A.x.toFixed(2)} ${A.y.toFixed(2)}C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${B.x.toFixed(2)} ${B.y.toFixed(2)}`;
      pts = [[A.x, A.y], c1, c2, [B.x, B.y]]; var ha = ang(c1, [A.x, A.y]), hb = ang(c2, [B.x, B.y]);
    } else { pts = [[A.x, A.y], [B.x, B.y]]; d = `M${A.x.toFixed(2)} ${A.y.toFixed(2)}L${B.x.toFixed(2)} ${B.y.toFixed(2)}`; var ha = ang([B.x, B.y], [A.x, A.y]), hb = ang([A.x, A.y], [B.x, B.y]); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    o.x = Math.min(...xs); o.y = Math.min(...ys); o.w = Math.max(...xs) - o.x; o.h = Math.max(...ys) - o.y; o.rot = 0;
    return { d, A, B, ha, hb, pts };
  };
  K.updateConns = (objs) => { K.walk(objs, (o) => { if (o.type === 'conn') K.connPath(o, objs); }); };
  // arrowhead path at point (x,y) pointing along angle a
  K.headPath = (type, x, y, a, w) => {
    const s = Math.max(7, w * 3.2), c = Math.cos(a), si = Math.sin(a); const T = (u, v) => [x + u * c - v * si, y + u * si + v * c].map((n) => n.toFixed(2)).join(' ');
    switch (type) {
      case 'arrow': return { d: `M${T(-s, -s * 0.55)}L${T(0, 0)}L${T(-s, s * 0.55)}`, fill: false };
      case 'triangle': return { d: `M${T(0, 0)}L${T(-s, -s * 0.5)}L${T(-s, s * 0.5)}Z`, fill: true };
      case 'stealth': return { d: `M${T(0, 0)}L${T(-s, -s * 0.5)}L${T(-s * 0.7, 0)}L${T(-s, s * 0.5)}Z`, fill: true };
      case 'diamond': return { d: `M${T(0, 0)}L${T(-s / 2, -s / 2)}L${T(-s, 0)}L${T(-s / 2, s / 2)}Z`, fill: true };
      case 'oval': { const cx = x - (s / 2) * c, cy = y - (s / 2) * si, r = s / 2; return { d: `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`, fill: true }; }
      case 'bar': return { d: `M${T(0, -s * 0.6)}L${T(0, s * 0.6)}`, fill: false };
      default: return null;
    }
  };
  K.HEADS = ['none', 'arrow', 'triangle', 'stealth', 'diamond', 'oval', 'bar'];

  // ---------- object factories ----------
  K.newObj = (type, o = {}) => {
    const b = { id: K.uid(), name: '', x: 100, y: 100, w: 200, h: 120, rot: 0 };
    switch (type) {
      case 'text': return Object.assign(b, { type, w: 360, h: 60, paras: [{ runs: [{ t: '' }] }], ts: { f: 'body', sz: 32, c: 'fg', va: 't' } }, o);
      case 'shape': return Object.assign(b, { type, shape: 'rect', fill: { t: 'solid', c: 'a1' }, line: null, ts: { c: '#ffffff', al: 'c', va: 'm', sz: 28 }, paras: [{ runs: [{ t: '' }] }] }, o);
      case 'conn': return Object.assign(b, { type, a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, route: 'straight', line: { c: 'fg', w: 3, head: 'none', tail: 'none' } }, o);
      case 'image': return Object.assign(b, { type, m: null, crop: { x: 0, y: 0, w: 1, h: 1 }, mask: 'rect' }, o);
      case 'table': { const r = o.rows || 4, c = o.cols || 4, w = o.w || 600, h = o.h || r * 44; return Object.assign(b, { type, w, h, cw: Array(c).fill(w / c), rh: Array(r).fill(h / r), cells: Array.from({ length: r }, () => Array.from({ length: c }, () => ({ paras: [{ runs: [{ t: '' }] }] }))), st: { hdr: true, band: true, c: 'a1', grid: 'h' }, ts: { sz: 20, f: 'body', c: 'fg', va: 'm' } }, { ...o, rows: undefined, cols: undefined }); }
      case 'chart': return Object.assign(b, { type, w: 520, h: 330, kind: 'column', data: { cats: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Series 1', vals: [32, 45, 38, 61] }, { name: 'Series 2', vals: [21, 30, 44, 52] }] }, opt: { legend: true, grid: true, labels: false, stacked: false, title: '' } }, o);
      case 'media': return Object.assign(b, { type, w: 320, h: 180, kind: 'video', m: null, auto: false, loop: false }, o);
      case 'group': return Object.assign(b, { type, kids: [] }, o);
    }
    return b;
  };
  K.defaultName = (o) => ({ text: 'Text', shape: (K.shapes[o.shape] || {}).n || 'Shape', conn: 'Line', image: 'Image', table: 'Table', chart: 'Chart', media: o.kind === 'audio' ? 'Audio' : 'Movie', group: 'Group' }[o.type] || 'Object');
})();
