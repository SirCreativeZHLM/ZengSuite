/* Rich text layout (runs -> wrapped lines), DOM <-> runs conversion. */
(() => {
  'use strict';
  const mc = document.createElement('canvas').getContext('2d');
  const cache = new Map();
  FF.fontStr = (fam, size, b, i) => `${i ? 'italic ' : ''}${b ? '600 ' : '400 '}${f(size)}px ${FF.FAMS[fam] || FF.FAMS.sans}`;
  const f = (n) => Math.round(n * 100) / 100;
  const measure = (font, s) => { const k = font + '|' + s; let w = cache.get(k); if (w == null) { if (cache.size > 60000) cache.clear(); mc.font = font; w = mc.measureText(s).width; cache.set(k, w); } return w; };
  FF.measure = measure;
  const CJK = /[⺀-鿿豈-﫿＀-￯]/;
  const tokenize = (t) => { const out = []; const re = /(\s+|[^\s⺀-鿿豈-﫿＀-￯]+|[⺀-鿿豈-﫿＀-￯])/g; let m; while ((m = re.exec(t))) out.push(m[0]); return out; };

  // layout paragraphs -> {lines, w, h}. W = wrap width (Infinity for none). mul scales every font size.
  FF.layout = (o, W, mul = 1) => {
    const s = o.s, paras = o.t && o.t.length ? o.t : [[{ t: '' }]];
    const lines = []; let y = 0, maxw = 0;
    for (const para of paras) {
      let items = [], x = 0, lh = 0, asc = 0;
      const flush = (last) => {
        while (items.length && /^\s+$/.test(items[items.length - 1].t) && items.length > 0) { const it = items.pop(); x -= it.w; }
        const h = lh || (s.fs || 20) * mul * 1.28; lines.push({ y, h, w: x, items, asc: asc || h * 0.8 }); y += h; maxw = Math.max(maxw, x); items = []; x = 0; lh = 0; asc = 0;
      };
      const base = (r) => { const sz = (r.sz || s.fs || 20) * mul; return { sz, font: FF.fontStr(s.font, sz, r.b != null ? r.b : s.b, r.i != null ? r.i : s.i), c: r.c || s.tc || 'ink', u: r.u != null ? r.u : s.u, st: r.st != null ? r.st : s.st }; };
      for (const r of para) {
        const bs = base(r);
        for (const tok of tokenize(r.t || '')) {
          const w = measure(bs.font, tok), isSp = /^\s+$/.test(tok);
          if (x + w > W && !isSp && items.length) flush();
          if (w > W && !isSp) { // hard-break long word
            let buf = ''; for (const ch of tok) { const cw = measure(bs.font, buf + ch); if (cw > W && buf) { items.push({ t: buf, x, w: measure(bs.font, buf), ...bs }); x += measure(bs.font, buf); lh = Math.max(lh, bs.sz * 1.28); asc = Math.max(asc, bs.sz); flush(); buf = ch; } else buf += ch; }
            if (buf) { const bw = measure(bs.font, buf); items.push({ t: buf, x, w: bw, ...bs }); x += bw; lh = Math.max(lh, bs.sz * 1.28); asc = Math.max(asc, bs.sz); }
            continue;
          }
          if (isSp && !items.length && x === 0 && lines.length && false) continue;
          items.push({ t: tok, x, w, ...bs }); x += w; lh = Math.max(lh, bs.sz * 1.28); asc = Math.max(asc, bs.sz * 1.02);
        }
        if (!r.t) { lh = Math.max(lh, bs.sz * 1.28); asc = Math.max(asc, bs.sz); }
      }
      flush(true);
    }
    return { lines, w: maxw, h: y };
  };
  // cached layout for an object's text in a box of width W. Sticky notes shrink text to fit.
  FF.objLayout = (o, W, H) => {
    const key = W + '|' + H + '|' + (o.s.fs) + '|' + o.s.font + '|' + (o.s.b ? 1 : 0) + (o.s.i ? 1 : 0);
    if (o._lay && o._lay.key === key) return o._lay;
    let mul = 1, L = FF.layout(o, W, 1);
    if (o.type === 'sticky' || (o.type === 'shape' && o.s.fit)) { while (L.h > H && mul > 0.4) { mul *= 0.92; L = FF.layout(o, W, mul); } }
    L.key = key; L.mul = mul; return (o._lay = L);
  };
  FF.hasText = (o) => o.t && o.t.some((p) => p.some((r) => r.t));

  // ---- contenteditable <-> runs ----
  FF.runsToHTML = (t) => (t && t.length ? t : [[{ t: '' }]]).map((p) => '<div>' + (p.map((r) => {
    let st = ''; if (r.b) st += 'font-weight:600;'; if (r.i) st += 'font-style:italic;'; const td = [r.u && 'underline', r.st && 'line-through'].filter(Boolean).join(' '); if (td) st += 'text-decoration:' + td + ';'; if (r.c) st += 'color:' + FF.col(r.c, FF.dark) + ';'; if (r.sz) st += 'font-size:' + r.sz + 'px;';
    const txt = zk.esc(r.t || '');
    return st ? `<span style="${st}">${txt}</span>` : txt;
  }).join('') || '<br>') + '</div>').join('');
  const SIZES = [0, 10, 13, 16, 18, 24, 32, 48];
  FF.htmlToRuns = (root, baseFS) => {
    const paras = []; let cur = [];
    const newPara = () => { paras.push(cur); cur = []; };
    const walk = (n, st) => {
      if (n.nodeType === 3) { if (n.nodeValue) cur.push({ ...st, t: n.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ') }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { newPara(); return; }
      const ns = { ...st }; const cs = n.style || {};
      if (tag === 'b' || tag === 'strong') ns.b = 1; if (tag === 'i' || tag === 'em') ns.i = 1; if (tag === 'u') ns.u = 1; if (tag === 's' || tag === 'strike' || tag === 'del') ns.st = 1;
      if (cs.fontWeight && (cs.fontWeight === 'bold' || +cs.fontWeight >= 600)) ns.b = 1; if (cs.fontStyle === 'italic') ns.i = 1;
      const td = (cs.textDecorationLine || cs.textDecoration || ''); if (td.includes('underline')) ns.u = 1; if (td.includes('line-through')) ns.st = 1;
      if (cs.color) ns.c = rgbHex(cs.color); if (tag === 'font') { if (n.getAttribute('color')) ns.c = rgbHex(n.getAttribute('color')); if (n.getAttribute('size')) ns.sz = SIZES[+n.getAttribute('size')] || undefined; }
      if (cs.fontSize && /px$/.test(cs.fontSize)) ns.sz = parseFloat(cs.fontSize);
      const block = tag === 'div' || tag === 'p' || tag === 'li';
      if (block && cur.length) newPara();
      for (const c of n.childNodes) walk(c, ns);
      if (block) { if (!cur.length && !n.childNodes.length) {} newPara(); }
    };
    const kids = [...root.childNodes];
    for (const c of kids) walk(c, {});
    if (cur.length) newPara();
    // drop single trailing empty paragraph created by block ends
    const out = paras.map((p) => { const m = []; for (const r of p) { const l = m[m.length - 1]; if (l && ['b', 'i', 'u', 'st', 'c', 'sz'].every((k) => l[k] === r[k])) l.t += r.t; else m.push({ ...r }); } return m.length ? m : [{ t: '' }]; });
    for (const p of out) for (const r of p) { if (!r.b) delete r.b; if (!r.i) delete r.i; if (!r.u) delete r.u; if (!r.st) delete r.st; if (!r.c) delete r.c; if (!r.sz) delete r.sz; else if (baseFS && Math.abs(r.sz - baseFS) < 0.5) delete r.sz; if (r.c) { const normal = r.c.toLowerCase(); if (normal === '#1d1d1f' || normal === '#f5f5f7') delete r.c; } }
    return out.length ? out : [[{ t: '' }]];
  };
  function rgbHex(c) { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (!m) return c; return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join(''); }
})();
