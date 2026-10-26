/* Remix: rule-based re-layout of a slide into six designed variants (hero, split, big number, grid, quote, timeline).
   Content is analysed (title, bullets, images, numbers, quote) and re-arranged using the theme's fonts and colours. */
(() => {
  const K = window.K;
  const NUM = /^\s*([$€£]?\d[\d,.]*\s?(?:%|[kKmMbB]\b|x\b|×)?)\s*(.*)$/;
  const txt = (paras) => K.plain(paras).trim();
  const cleanParas = (paras, list, keepColor) => (paras || []).filter((p) => p.runs.some((r) => r.t || r.field)).map((p) => ({ list, runs: p.runs.map((r) => { const c = { ...r }; delete c.sz; if (!keepColor) delete c.c; return c; }) }));
  const one = (text) => [{ runs: [{ t: text }] }];

  // ---------- analysis ----------
  K.remixAnalyze = (deck, slide) => {
    const objs = slide.objs; const used = new Set(); const C = { title: null, subtitle: null, caption: null, fact: null, quoteText: null, attribution: null, bullets: [], images: [], visuals: [], extras: [], numbers: [], layout: slide.layout };
    const byPh = (n) => objs.find((o) => o.ph === n && o.type !== 'image');
    const T = byPh('title'); if (T && txt(T.paras)) { C.title = T.paras; used.add(T); }
    const grab = (n, key) => { const o = byPh(n); if (o && txt(o.paras)) { C[key] = o.paras; used.add(o); } else if (o) used.add(o); };
    grab('subtitle', 'subtitle'); grab('caption', 'caption'); grab('fact', 'fact'); grab('quote', 'quoteText'); grab('attribution', 'attribution');
    for (const o of objs) if (o.type === 'image' && o.m) { C.images.push(o); used.add(o); } else if (o.type === 'image') used.add(o);
    for (const o of objs) if (['chart', 'table', 'media'].includes(o.type)) { C.visuals.push(o); used.add(o); }
    const texts = objs.filter((o) => !used.has(o) && o.type === 'text' && txt(o.paras));
    if (!C.title && texts.length) { const t = [...texts].sort((a, b) => (b.ts?.sz || 0) - (a.ts?.sz || 0) || a.y - b.y)[0]; if ((t.ts?.sz || 24) >= 28 || !objs.some((o) => o.ph === 'body')) { C.title = [t.paras.find((p) => txt([p])) || t.paras[0]]; used.add(t); if (t.paras.length > 1) { /* rest become bullets below */ const rest = t.paras.slice(1); texts.push({ paras: rest, x: t.x, y: t.y + 1, _virt: true }); } } }
    const bodyObjs = objs.filter((o) => (o.ph === 'body' || o.ph === 'body2') && txt(o.paras)); bodyObjs.forEach((o) => used.add(o));
    const free = texts.filter((o) => !used.has(o) || o._virt);
    const ordered = [...bodyObjs.sort((a, b) => a.x - b.x || a.y - b.y), ...free.sort((a, b) => a.y - b.y || a.x - b.x)];
    for (const o of ordered) { C.bullets.push(...(o.paras || []).filter((p) => txt([p]))); if (!o._virt) used.add(o); }
    C.extras = objs.filter((o) => !used.has(o));
    // numbers
    if (C.fact) C.numbers.push({ value: txt(C.fact), label: C.caption ? txt(C.caption) : '' });
    C.bullets.forEach((p, i) => { const t = txt([p]); const m = t.match(NUM); if (m && t.length < 90 && /\d/.test(m[1]) && (m[2] || m[1].length > 2)) C.numbers.push({ value: m[1].trim(), label: m[2].trim(), idx: i }); });
    // quote
    if (C.quoteText) C.quote = { text: txt(C.quoteText), attr: C.attribution ? txt(C.attribution) : '' };
    else { const qi = C.bullets.findIndex((p) => /^[“"‘'«]/.test(txt([p]))); if (qi >= 0) C.quote = { text: txt([C.bullets[qi]]), attr: C.title ? txt(C.title) : '', idx: qi }; }
    return C;
  };

  // ---------- variants ----------
  K.remixVariants = [
    { id: 'hero', name: 'Hero', blurb: 'Big picture, big title' },
    { id: 'split', name: 'Split', blurb: 'Half and half' },
    { id: 'big', name: 'Big Number', blurb: 'One figure to remember' },
    { id: 'grid', name: 'Grid', blurb: 'Points as cards' },
    { id: 'quote', name: 'Quote', blurb: 'A line to linger on' },
    { id: 'timeline', name: 'Timeline', blurb: 'Steps along a line' },
  ];
  K.remixBuild = (deck, slide, vid) => {
    const C = K.remixAnalyze(deck, slide); const W = deck.size.w, H = deck.size.h, k = H / 540, mx = W * 0.075; const out = []; const N = K.newObj;
    const text = (name, paras, x, y, w, h, ts = {}, o = {}) => out.push(N('text', { name, x, y, w, h, paras: paras && paras.length ? paras : one(''), ts: { f: 'body', c: 'fg', sz: 24 * k, va: 't', al: 'l', fit: 'shrink', ls: 1.15, sa: 8 * k, pad: 4, ...ts }, ...o }));
    const shape = (name, shp, x, y, w, h, fill, o = {}) => out.push(N('shape', { name, shape: shp, x, y, w, h, fill, line: null, paras: undefined, lock: true, ...o }));
    const imgObj = (o, name, x, y, w, h, mask) => { const c = K.clone(o); c.id = K.uid(); c.name = name; c.x = x; c.y = y; c.w = w; c.h = h; c.rot = 0; c.ph = null; c.inh = false; c.mask = mask || c.mask || 'rect'; if (deck.media[c.m]) K.coverCrop(c, deck.media[c.m]); return c; };
    const visObj = (o, name, x, y, w, h) => { const c = K.clone(o); c.id = K.uid(); c.name = name; c.rot = 0; c.ph = null; const fit = (bw, bh) => { if (o.type === 'media' && o.kind === 'video') { const s = Math.min(w / o.w, h / o.h); return [o.w * s, o.h * s]; } return [bw, bh]; }; const [fw, fh] = fit(w, h); c.x = x + (w - fw) / 2; c.y = y + (h - fh) / 2; if (c.type === 'table') { const sx = fw / o.w, sy = fh / o.h; c.cw = o.cw.map((v) => v * sx); c.rh = o.rh.map((v) => v * sy); } c.w = fw; c.h = fh; return c; };
    const titleP = C.title || (C.quote && C.quote.attr ? one(C.quote.attr) : one(''));
    const sub = C.subtitle || C.caption; const bullets = vid === 'quote' ? C.bullets.filter((p, i) => !(C.quote && C.quote.idx === i)) : C.bullets;
    const media = [...C.images, ...C.visuals]; const accent = 'a1';
    const contrast = (c) => (K.lum(deck, c) > 0.62 ? '#111111' : '#ffffff');
    const titleObj = (x, y, w, h, ts) => text('Title', cleanParas(titleP, undefined), x, y, w, h, { f: 'head', b: true, w: deck.theme.hw || 700, ls: 1.05, tr: deck.theme.up ? 1 : -0.4, up: !!deck.theme.up, ...ts }, C.title ? { ph: 'title', inh: false } : {});
    const bulletList = (ps) => cleanParas(ps, 'b');
    const bodyObj = (x, y, w, h, ps, ts, list = 'b') => text('Body', cleanParas(ps, list), x, y, w, h, { sz: 22 * k, ...ts }, bodyOk() ? { ph: 'body', inh: false } : {});
    const bodyOk = () => deck.layouts.some((l) => l.id === slide.layout && l.objs.some((o) => o.ph === 'body')) && !out.some((o) => o.ph === 'body');
    const caption = [...(sub ? cleanParas(sub) : []), ...cleanParas(bullets)];

    if (vid === 'hero') {
      const m0 = C.images[0];
      if (m0) {
        out.push(imgObj(m0, 'Image 1', 0, 0, W, H)); out[0].lock = true;
        shape('Scrim', 'rect', 0, H * 0.34, W, H * 0.66, { t: 'grad', kind: 'linear', ang: 180, stops: [[0, '#000000', 0], [1, '#000000', 0.8]] });
        titleObj(mx, H * 0.56, W - mx * 2, H * 0.22, { sz: 50 * k, c: '#ffffff', va: 'b' });
        text('Body', caption.slice(0, 5).map((p) => ({ ...p, list: undefined })), mx, H * 0.79, W - mx * 2, H * 0.15, { sz: 20 * k, c: '#ffffff', va: 't', sa: 4 * k }, bodyOk() ? { ph: 'body', inh: false } : {});
        C.images.slice(1).forEach((o, i) => out.push(imgObj(o, 'Image ' + (i + 2), W - mx - (i + 1) * 120 * k, mx / 2, 108 * k, 72 * k, 'roundRect')));
        C.visuals.forEach((o, i) => out.push(visObj(o, 'Visual ' + (i + 1), W * 0.55, H * 0.1, W * 0.38, H * 0.4)));
      } else if (C.visuals[0]) {
        titleObj(mx, H * 0.06, W - mx * 2, H * 0.16, { sz: 40 * k, va: 'm' });
        out.push(visObj(C.visuals[0], 'Visual 1', mx, H * 0.25, W - mx * 2, H * 0.58)); C.visuals.slice(1).forEach((o, i) => out.push(visObj(o, 'Visual ' + (i + 2), W * 0.6, H * 0.1, W * 0.3, H * 0.14)));
        text('Body', caption.map((p) => ({ ...p, list: undefined })).slice(0, 3), mx, H * 0.85, W - mx * 2, H * 0.1, { sz: 17 * k, c: 'mut', va: 'm', al: 'c' }, bodyOk() ? { ph: 'body', inh: false } : {});
      } else {
        shape('Backdrop', 'rect', 0, 0, W, H, { t: 'grad', kind: 'linear', ang: 135, stops: [[0, accent], [1, 'a5']] }); const fgc = contrast(accent);
        shape('Orb', 'ellipse', W * 0.62, -H * 0.2, H * 1.1, H * 1.1, { t: 'solid', c: '#ffffff', a: 0.12 });
        titleObj(mx, H * 0.16, W * 0.82, H * 0.44, { sz: 68 * k, c: fgc, va: 'b', ls: 1 });
        text('Body', caption.map((p) => ({ ...p, list: undefined })).slice(0, 4), mx, H * 0.64, W * 0.7, H * 0.26, { sz: 24 * k, c: fgc, va: 't' }, bodyOk() ? { ph: 'body', inh: false } : {});
      }
    } else if (vid === 'split') {
      const m = media[0]; const pw = W * 0.46;
      if (m) out.push(m.type === 'image' ? imgObj(m, 'Image 1', 0, 0, pw, H) : visObj(m, 'Visual 1', mx / 2, H * 0.18, pw - mx / 2, H * 0.64));
      else { shape('Panel', 'rect', 0, 0, pw, H, { t: 'grad', kind: 'linear', ang: 150, stops: [[0, accent], [1, 'a5']] }); shape('Orb', 'ellipse', -pw * 0.2, H * 0.55, pw * 0.9, pw * 0.9, { t: 'solid', c: '#ffffff', a: 0.14 }); shape('Orb 2', 'ellipse', pw * 0.45, H * 0.1, pw * 0.45, pw * 0.45, { t: 'solid', c: '#ffffff', a: 0.1 }); }
      media.slice(1).forEach((o, i) => out.push(o.type === 'image' ? imgObj(o, 'Image ' + (i + 2), pw + mx * 0.6 + i * 110 * k, H * 0.8, 96 * k, 64 * k, 'roundRect') : visObj(o, 'Visual ' + (i + 2), pw + mx, H * 0.55, W - pw - mx * 2, H * 0.3)));
      const rx = pw + mx * 0.8, rw = W - rx - mx;
      titleObj(rx, H * 0.1, rw, H * 0.28, { sz: 36 * k, va: 'b' }); if (sub) text('Subtitle', cleanParas(sub), rx, H * 0.39, rw, H * 0.08, { sz: 18 * k, c: 'mut', fit: 'shrink' }, {});
      bodyObj(rx, sub ? H * 0.48 : H * 0.42, rw, H * (m && media.length > 1 ? 0.3 : 0.44), bullets, { sz: 21 * k, c: 'fg' });
    } else if (vid === 'big') {
      const nb = C.numbers[0]; const value = nb ? nb.value : String(Math.max(bullets.length, 1)).padStart(2, '0'); const label = nb ? nb.label : bullets.length ? (bullets.length === 1 ? 'key point' : 'key points') : ''; const rest = bullets.filter((p, i) => !(nb && nb.idx === i));
      text('Number', one(value), mx, H * 0.12, W * 0.52, H * 0.46, { f: 'head', sz: 150 * k, b: true, w: 800, c: accent, va: 'b', tr: -3, ls: 1, sa: 0 }, {});
      text('Label', one(label || (C.title ? txt(C.title) : '')), mx, H * 0.6, W * 0.5, H * 0.16, { sz: 26 * k, va: 't', c: 'fg' }, {});
      const rx = W * 0.6, rw = W - rx - mx; titleObj(rx, H * 0.1, rw, H * 0.22, { sz: 30 * k, va: 'b' });
      const m = media[0]; if (m) out.push(m.type === 'image' ? imgObj(m, 'Image 1', rx, H * 0.36, rw, H * 0.34, 'roundRect') : visObj(m, 'Visual 1', rx, H * 0.36, rw, H * 0.4));
      bodyObj(rx, m ? H * 0.74 : H * 0.36, rw, m ? H * 0.2 : H * 0.54, rest, { sz: 18 * k });
      shape('Rule', 'rect', rx - 24 * k, H * 0.12, 2 * k, H * 0.76, { t: 'solid', c: 'mut', a: 0.5 });
    } else if (vid === 'grid') {
      const items = [...C.images.map((o) => ({ o })), ...C.visuals.map((o) => ({ o })), ...bullets.map((p) => ({ p }))]; if (!items.length) items.push({ p: sub ? cleanParas(sub)[0] : { runs: [{ t: '' }] } });
      let list = items.slice(0, 9); if (items.length > 9) list[8] = { p: { runs: [{ t: items.slice(8).map((x) => (x.p ? txt([x.p]) : '')).filter(Boolean).join(' · ') }] } };
      const n = list.length; const cols = n === 1 ? 1 : n <= 4 ? 2 : 3; const rows = Math.ceil(n / cols); const gx = 16 * k, top = H * 0.25, bot = H * 0.93, gw = W - mx * 2;
      titleObj(mx, H * 0.06, gw, H * 0.15, { sz: 36 * k, va: 'm' }); const cw = (gw - gx * (cols - 1)) / cols, ch = (bot - top - gx * (rows - 1)) / rows;
      list.forEach((it, i) => { const c = i % cols, r = Math.floor(i / cols); const x = mx + c * (cw + gx), y = top + r * (ch + gx);
        if (it.o && it.o.type === 'image') { out.push(imgObj(it.o, 'Card ' + (i + 1), x, y, cw, ch, 'roundRect')); out[out.length - 1].adj = [0.06]; return; }
        if (it.o) { shape('Card ' + (i + 1), 'roundRect', x, y, cw, ch, { t: 'solid', c: 'fg', a: 0.05 }, { adj: [0.06] }); out.push(visObj(it.o, 'Visual ' + (i + 1), x + 8, y + 8, cw - 16, ch - 16)); return; }
        shape('Card ' + (i + 1), 'roundRect', x, y, cw, ch, { t: 'solid', c: 'fg', a: 0.06 }, { adj: [0.06] }); const bs = Math.min(30 * k, ch * 0.3);
        shape('Badge ' + (i + 1), 'ellipse', x + 14 * k, y + 14 * k, bs, bs, { t: 'solid', c: accent }); text('Badge Text ' + (i + 1), one(String(i + 1)), x + 14 * k, y + 14 * k, bs, bs, { sz: bs * 0.5, b: true, c: contrast(accent), al: 'c', va: 'm', pad: 0, fit: 'none' }, { lock: true });
        text('Item ' + (i + 1), cleanParas([it.p]).map((p) => ({ ...p, list: undefined })), x + 10 * k, y + bs + 18 * k, cw - 20 * k, ch - bs - 28 * k, { sz: (cols === 3 ? 19 : 22) * k, va: 't' }, {}); });
    } else if (vid === 'quote') {
      const q = C.quote ? C.quote.text : bullets.length ? txt([bullets[0]]) : C.title ? txt(C.title) : ''; const attr = C.quote ? C.quote.attr : C.title && bullets.length ? txt(C.title) : ''; const rest = C.quote ? bullets : bullets.slice(1);
      shape('Bar', 'roundRect', mx, H * 0.2, 8 * k, H * 0.38, { t: 'solid', c: accent }, { adj: [0.5] });
      text('Mark', one('“'), mx + 22 * k, H * 0.02, 220 * k, H * 0.3, { f: 'head', sz: 190 * k, c: accent, va: 'm', fit: 'none', pad: 0, ls: 1 }, { lock: true });
      text('Quote', one(q.replace(/^[“"‘'«]\s*|\s*[”"’'»]$/g, '')), mx + 36 * k, H * 0.18, W - mx * 2 - 36 * k, H * 0.42, { f: 'head', sz: 38 * k, i: true, w: 500, va: 'm', ls: 1.2 }, C.quote && C.quoteText ? { ph: 'quote', inh: false } : {});
      if (attr) text('Attribution', one('— ' + attr.replace(/^[—–-]\s*/, '')), mx + 36 * k, H * 0.63, W - mx * 2 - 36 * k, H * 0.09, { sz: 20 * k, c: 'mut', va: 't' }, {});
      if (rest.length) text('Body', cleanParas(rest).map((p) => ({ ...p, list: undefined })), mx + 36 * k, H * 0.76, W - mx * 2 - 36 * k, H * 0.17, { sz: 16 * k, c: 'mut', va: 't' }, {});
      const m = media[0]; if (m) out.push(m.type === 'image' ? imgObj(m, 'Image 1', W - mx - 150 * k, mx / 2, 150 * k, 100 * k, 'roundRect') : visObj(m, 'Visual 1', W - mx - 200 * k, mx / 2, 200 * k, 120 * k));
    } else if (vid === 'timeline') {
      let items = bullets.length ? bullets : sub ? cleanParas(sub) : C.title ? cleanParas(C.title) : [{ runs: [{ t: '' }] }]; if (items.length > 7) items = [...items.slice(0, 6), { runs: [{ t: items.slice(6).map((p) => txt([p])).join(' · ') }] }]; const n = items.length;
      titleObj(mx, H * 0.06, W - mx * 2, H * 0.15, { sz: 34 * k, va: 'm' }); const y = H * (media.length ? 0.64 : 0.58); const gw = W - mx * 2, step = gw / n;
      const line = N('conn', { name: 'Line', a: { x: mx, y }, b: { x: W - mx, y }, route: 'straight', line: { c: 'mut', w: 3 * k, a: 0.6 }, lock: true }); out.push(line);
      const cw = Math.min(230 * k, step * 1.7), hb = H * 0.2;
      items.forEach((p, i) => { const x = mx + step * (i + 0.5); const up = i % 2 === 0; const d = 22 * k;
        out.push(N('conn', { name: 'Tick ' + (i + 1), a: { x, y: up ? y - hb * 0.12 : y }, b: { x, y: up ? y : y + hb * 0.12 }, route: 'straight', line: { c: 'mut', w: 2 * k, a: 0.6 }, lock: true }));
        shape('Dot ' + (i + 1), 'ellipse', x - d / 2, y - d / 2, d, d, { t: 'solid', c: accent }, { line: { c: 'bg', w: 4 * k } });
        const ps = [{ list: undefined, runs: [{ t: String(i + 1).padStart(2, '0'), c: accent, b: true, sz: 15 * k }] }, ...cleanParas([p]).map((q) => ({ ...q, list: undefined }))];
        text('Step ' + (i + 1), ps, x - cw / 2, up ? y - d / 2 - hb - 4 * k : y + d / 2 + 4 * k, cw, hb, { sz: 17 * k, va: up ? 'b' : 't', al: 'c', sa: 2 * k }, {}); });
      media.slice(0, 1).forEach((m) => out.push(m.type === 'image' ? imgObj(m, 'Image 1', W - mx - 130 * k, H * 0.07, 130 * k, 86 * k, 'roundRect') : visObj(m, 'Visual 1', W - mx - 200 * k, H * 0.07, 200 * k, 100 * k)));
    }
    // keep untouched extras (shapes, lines, groups) underneath new content
    const extras = C.extras.map((o) => o);
    return [...extras, ...out];
  };

  // ---------- applying with a morph ----------
  const geo = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, op: o.op ?? 1 });
  K.remixMorph = (A, oldObjs, ms = 420) => {
    if (zk.reducedMotion()) return; const olds = new Map(); oldObjs.forEach((o) => { if (o.name) olds.set(o.name, geo(o)); });
    const s = A.curSlide(); s.objs.forEach((o) => { const el = A.els.get(o.id); if (!el || o.type === 'conn' || o.type === 'group') return; const g = olds.get(o.name);
      if (g && o.name) { const ease = 'cubic-bezier(.2,.9,.25,1.05)'; el.animate([{ left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px', transform: `rotate(${g.rot}deg)`, opacity: g.op }, { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px', transform: `rotate(${o.rot || 0}deg)`, opacity: o.op ?? 1 }], { duration: ms, easing: ease }); }
      else el.animate([{ opacity: 0, transform: `${el.style.transform} scale(.96)` }, { opacity: o.op ?? 1, transform: el.style.transform || 'none' }], { duration: ms * 0.8, delay: 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); });
  };

  // ---------- UI: carousel ----------
  let open = null;
  K.openRemix = (A, { whole = false } = {}) => {
    if (open) { open.close(false); return; } if (A.editing) A.endEdit(true); if (A.mode !== 'slides') return;
    const deck = A.deck, slide = deck.slides[A.cur]; const orig = slide.objs; const origSel = A.sel.slice(); A.select([]);
    const variants = K.remixVariants.map((v) => ({ ...v, objs: K.remixBuild(deck, slide, v.id) }));
    const root = document.createElement('div'); root.id = 'remix'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Remix'); document.getElementById('center').insertBefore(root, document.getElementById('notes-wrap'));
    const head = document.createElement('div'); head.className = 'rx-head';
    const title = document.createElement('div'); title.className = 'rx-title'; title.innerHTML = '<b>Remix</b><span class="rx-name"></span>';
    const scope = document.createElement('div'); scope.className = 'zk-seg'; const bS = document.createElement('button'), bD = document.createElement('button'); bS.textContent = 'This slide'; bD.textContent = 'Whole deck'; scope.append(bS, bD); const setScope = (w) => { whole = w; bS.setAttribute('aria-pressed', String(!w)); bD.setAttribute('aria-pressed', String(w)); apply.textContent = w ? 'Apply to Deck' : 'Apply'; }; bS.onclick = () => setScope(false); bD.onclick = () => setScope(true);
    const cancel = zk.btn({ label: 'Cancel', onClick: () => close(false) }); cancel.classList.add('bordered'); const apply = zk.btn({ label: 'Apply', onClick: () => close(true) }); apply.classList.add('primary');
    const hint = document.createElement('span'); hint.className = 'rx-hint'; hint.textContent = '← → to browse · Enter to apply';
    head.append(title, scope, hint, cancel, apply); const view = document.createElement('div'); view.className = 'rx-view'; const track = document.createElement('div'); track.className = 'rx-track'; view.append(track); root.append(head, view); setScope(whole);
    const CW = 232, GAP = 22, STEP = CW + GAP; const sc = CW / deck.size.w; const cards = variants.map((v, i) => { const c = document.createElement('button'); c.type = 'button'; c.className = 'rx-card'; c.style.width = CW + 'px'; const th = document.createElement('div'); th.className = 'rx-th'; th.style.height = deck.size.h * sc + 'px'; const ps = { ...slide, objs: v.objs }; const ks = K.renderSlide(deck, ps, { index: A.cur }); ks.style.transform = `scale(${sc})`; th.append(ks); const lb = document.createElement('div'); lb.className = 'rx-lbl'; lb.innerHTML = `<b>${v.name}</b><span>${v.blurb}</span>`; c.append(th, lb); c.setAttribute('aria-label', v.name); c.onclick = () => { if (!moved) go(i); }; track.append(c); setTimeout(() => K.fit(ks), 0); return c; });
    let pos = 0, idx = -1, sp = null, moved = false; const nameEl = title.querySelector('.rx-name');
    const layout = () => { const w = view.clientWidth; cards.forEach((c, i) => { const d = i - pos, ad = Math.min(Math.abs(d), 2); const s = 1 - 0.14 * Math.min(ad, 1.3); c.style.transform = `translateX(${w / 2 - CW / 2 + d * STEP}px) scale(${s})`; c.style.opacity = String(1 - 0.35 * Math.min(ad, 1.6)); c.style.zIndex = String(10 - Math.round(ad * 3)); c.classList.toggle('on', Math.abs(d) < 0.5); }); };
    const preview = (i, animate) => { if (i === idx) return; idx = i; const old = slide.objs; slide.objs = variants[i].objs.map((o) => o); A.render(); if (animate) K.remixMorph(A, old); nameEl.textContent = '  ' + variants[i].name; };
    const go = (i, velocity = 0) => { i = Math.max(0, Math.min(variants.length - 1, i)); if (sp) sp.stop(); sp = zk.spring({ from: pos, to: i, velocity, response: 0.42, damping: 0.82, eps: 0.002, onUpdate: (v) => { pos = v; layout(); const n = Math.round(v); if (n !== idx && Math.abs(v - n) < 0.35) preview(n, true); }, onDone: () => { pos = i; layout(); preview(i, true); } }); if (zk.reducedMotion()) { pos = i; layout(); preview(i, false); } };
    // drag
    let drag = null; view.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; view.setPointerCapture(e.pointerId); drag = { x: e.clientX, p0: pos, t: performance.now(), lx: e.clientX, lt: performance.now(), v: 0 }; moved = false; if (sp) sp.stop(); });
    view.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) moved = true; if (!moved) return; const now = performance.now(); const raw = drag.p0 - dx / STEP; const over = raw < 0 ? raw : raw > variants.length - 1 ? raw - (variants.length - 1) : 0; pos = over ? (raw < 0 ? -zk.rubberband(-raw, 3) : variants.length - 1 + zk.rubberband(over, 3)) : raw; drag.v = (-(e.clientX - drag.lx) / STEP) / Math.max(1, now - drag.lt) * 1000; drag.lx = e.clientX; drag.lt = now; layout(); const n = Math.round(Math.max(0, Math.min(variants.length - 1, pos))); if (n !== idx) preview(n, true); });
    const endDrag = () => { if (!drag) return; const d = drag; drag = null; if (moved) { const target = Math.round(Math.max(0, Math.min(variants.length - 1, pos + zk.project(d.v * 1000, 0.9) / 1000 * 0.2))); go(target, d.v); setTimeout(() => (moved = false), 30); } }; view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
    view.addEventListener('wheel', (e) => { e.preventDefault(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) > 8 && !(go._t && performance.now() - go._t < 250)) { go._t = performance.now(); go(idx + (d > 0 ? 1 : -1)); } }, { passive: false });
    const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(idx + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(idx - 1); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } else if (/^[1-6]$/.test(e.key)) { go(+e.key - 1); e.stopPropagation(); } };
    document.addEventListener('keydown', key, true);
    const close = (doApply) => {
      if (!open) return; open = null; document.removeEventListener('keydown', key, true); if (sp) sp.stop(); const chosen = variants[Math.max(0, idx)];
      if (!doApply) { slide.objs = orig; A.sel = origSel; A.render(); A.overlay(); }
      else if (whole) { slide.objs = chosen.objs; deck.slides.forEach((s) => { if (s === slide) return; if (['title', 'section'].includes(s.layout)) return; s.objs = K.remixBuild(deck, s, chosen.id); }); K.sync(deck); A.render(); A.commit('Remix Deck'); A.emit('edited'); A.slides.render(true); zk.toast('Remixed deck — ' + chosen.name + '. Undo with ' + (zeng.platform === 'mac' ? '⌘Z' : 'Ctrl+Z')); }
      else { slide.objs = chosen.objs; K.sync(deck); A.render(); A.commit('Remix Slide'); A.emit('edited'); A.emit('live'); }
      root.classList.add('out'); setTimeout(() => root.remove(), 200); A.emit('remixclose');
    };
    open = { close }; requestAnimationFrame(() => { root.classList.add('in'); }); layout(); go(0); preview(0, false); A.computeZoom && setTimeout(() => A.computeZoom(), 0);
    return open;
  };
})();
