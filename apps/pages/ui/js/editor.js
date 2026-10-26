/* ZengWrite editor: sanitising, normalising, numbering, formatting commands, keyboard, paste. */
(() => {
  'use strict';
  const P = window.P, flow = P.flow;
  const BLOCK_TAGS = /^(P|H[1-4]|TABLE|DIV|HR|UL|OL)$/;

  /* ---------------- sanitisers ---------------- */
  const OWN_TAGS = new Set('p h1 h2 h3 h4 table colgroup col tbody thead tr td th span b i u s strike sub sup a br img div hr ins del svg g rect ellipse line path polygon polyline circle defs marker'.split(' '));
  const OWN_CLASSES = new Set(['pgbreak', 'shp', 'eq', 'fnr', 'cmt', 'resolved', 'fld', 'bm', 'fnsep', 'tab', 'tocl', 'tocpn']);
  const okHref = (h) => /^(https?:|mailto:|tel:|#)/i.test(h || '');
  const okSrc = (s) => /^(data:image\/|blob:|media\/|https?:)/i.test(s || '');
  /** filter our own saved markup (zpages, undo, templates): in-place allow-list */
  P.sanitizeOwn = (html) => {
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const walk = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 8) { c.remove(); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.tagName.toLowerCase();
        if (!OWN_TAGS.has(t)) { c.remove(); continue; }
        for (const a of [...c.attributes]) {
          const k = a.name;
          if (k.startsWith('on')) c.removeAttribute(k);
          else if (k === 'href' && !okHref(a.value)) c.removeAttribute(k);
          else if (k === 'src' && !okSrc(a.value)) c.removeAttribute(k);
          else if (k === 'class') { const keep = a.value.split(/\s+/).filter((x) => OWN_CLASSES.has(x)); keep.length ? c.setAttribute('class', keep.join(' ')) : c.removeAttribute('class'); }
          else if (k === 'style' && /url\s*\(|expression|javascript:/i.test(a.value)) c.removeAttribute(k);
        }
        walk(c);
      }
    };
    walk(doc.body); return doc.body.innerHTML;
  };

  const toPt = (v) => { const m = /^(-?[\d.]+)(px|pt|em|rem|%|in|cm|mm)?$/.exec((v || '').trim()); if (!m) return null; const n = +m[1]; const u = m[2] || 'px'; return { px: n * 0.75, pt: n, in: n * 72, cm: (n * 72) / 2.54, mm: (n * 72) / 25.4 }[u] ?? null; };
  const toPxLen = (v) => { const m = /^(-?[\d.]+)(px|pt|in|cm|mm)?$/.exec((v || '').trim()); if (!m) return null; const n = +m[1]; return { px: n, pt: (n * 4) / 3, in: n * 96, cm: (n * 96) / 2.54, mm: (n * 96) / 25.4 }[m[2] || 'px']; };
  const cssDecls = (s) => { const o = {}; (s || '').split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); }); return o; };
  const inlineStyle = (st, blockOnly = false) => {
    const d = cssDecls(st); const out = [];
    if (!blockOnly) {
      if (d.color && !/^(inherit|windowtext|initial)$/i.test(d.color)) out.push('color:' + d.color);
      const bg = d['background-color'] || (d.background && /#|rgb/.test(d.background) ? d.background.match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i)?.[0] : '');
      if (bg && !/^(transparent|white|#fff(fff)?|rgb\(255,\s*255,\s*255\))$/i.test(bg)) out.push('background-color:' + bg);
      if (d['font-family']) { const f = d['font-family'].split(',')[0].replace(/["']/g, '').trim(); if (f && !/^(inherit|initial|serif|sans-serif|monospace|system-ui|-apple-system)$/i.test(f)) out.push(`font-family:"${f}"`); }
      if (d['font-size']) { const pt = toPt(d['font-size']); if (pt && pt >= 4 && pt <= 200 && !/em|%/.test(d['font-size'])) out.push(`font-size:${Math.round(pt * 2) / 2}pt`); }
      if (d['font-weight'] && (/bold/.test(d['font-weight']) || +d['font-weight'] >= 600)) out.push('font-weight:700');
      if (d['font-style'] === 'italic') out.push('font-style:italic');
      const td = d['text-decoration-line'] || d['text-decoration'] || ''; if (/underline/.test(td)) out.push('text-decoration:underline'); if (/line-through/.test(td)) out.push('text-decoration:line-through');
      if (d['letter-spacing'] && /pt|px/.test(d['letter-spacing'])) out.push('letter-spacing:' + d['letter-spacing']);
      if (/small-caps/.test(d['font-variant'] || d['font-variant-caps'] || '')) out.push('font-variant:small-caps');
      if (/uppercase|lowercase|capitalize/.test(d['text-transform'] || '')) out.push('text-transform:' + d['text-transform']);
      if (/^(super|sub)$/.test(d['vertical-align'] || '')) out.push('vertical-align:' + d['vertical-align']);
    }
    return out.join(';');
  };
  const blockStyle = (st) => {
    const d = cssDecls(st); const out = [];
    if (/^(center|right|justify)$/.test(d['text-align'] || '')) out.push('text-align:' + d['text-align']);
    const ml = toPxLen(d['margin-left']); if (ml > 0 && ml < 600) out.push(`--il:${Math.round(ml)}px`);
    const ti = toPxLen(d['text-indent']); if (ti) out.push(`--fi:${Math.round(ti)}px`);
    return out.join(';');
  };
  /** import foreign html (clipboard, .html files): restructure into our block model. Returns an array of nodes. */
  P.sanitizeExternal = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html'); const SKIP = /^(SCRIPT|STYLE|META|LINK|HEAD|TITLE|NOSCRIPT|OBJECT|IFRAME|EMBED|SVG|CANVAS|VIDEO|AUDIO|FORM|INPUT|BUTTON|SELECT|TEXTAREA|TEMPLATE)$/;
    const out = []; let cur = null;
    const newP = (el) => { const p = document.createElement('p'); if (el) { const bs = blockStyle(el.getAttribute('style')); if (bs) p.setAttribute('style', bs); const al = el.getAttribute('align'); if (/^(center|right|justify)$/.test(al || '')) p.style.textAlign = al; } return p; };
    const flush = () => { if (cur && (cur.textContent.trim() || cur.querySelector('img'))) out.push(cur); cur = null; };
    const hasBlock = (el) => !!el.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,li');
    const inlineOf = (n, into) => {
      if (n.nodeType === 3) { const v = n.nodeValue.replace(/[\r\n\t ]+/g, ' '); if (v) into.append(v); return; }
      if (n.nodeType !== 1 || SKIP.test(n.tagName)) return;
      const t = n.tagName.toLowerCase();
      if (t === 'br') { into.append(document.createElement('br')); return; }
      if (t === 'img') { const s = n.getAttribute('src'); if (!okSrc(s)) return; const im = document.createElement('img'); im.setAttribute('src', s); if (n.alt) im.alt = n.alt; const w = +n.getAttribute('width') || n.naturalWidth, h = +n.getAttribute('height'); if (w) im.style.width = w + 'px'; if (w && h) im.style.height = h + 'px'; im.dataset.wrap = 'inline'; into.append(im); return; }
      if (t === 'span' && n.classList.contains('eq')) { const q = document.createElement('span'); q.className = 'eq'; q.setAttribute('contenteditable', 'false'); q.setAttribute('data-tex', n.getAttribute('data-tex') || ''); into.append(q); return; }
      if (t === 'sup' && n.classList.contains('fnr')) { const q = document.createElement('sup'); q.className = 'fnr'; q.setAttribute('contenteditable', 'false'); q.setAttribute('data-fn', n.getAttribute('data-fn') || ''); into.append(q); return; }
      let el;
      if (t === 'a') { el = document.createElement('a'); const h = n.getAttribute('href'); if (okHref(h)) el.setAttribute('href', h); else { for (const c of n.childNodes) inlineOf(c, into); return; } }
      else if (t === 'b' || t === 'strong') el = document.createElement('b');
      else if (t === 'i' || t === 'em' || t === 'cite' || t === 'dfn') el = document.createElement('i');
      else if (t === 'u' || t === 'ins') el = document.createElement('u');
      else if (t === 's' || t === 'strike' || t === 'del') el = document.createElement('s');
      else if (t === 'sub' || t === 'sup') el = document.createElement(t);
      else if (t === 'code' || t === 'kbd' || t === 'tt' || t === 'samp') { el = document.createElement('span'); el.style.fontFamily = '"Menlo"'; }
      else if (t === 'mark') { el = document.createElement('span'); el.style.backgroundColor = '#ffe96b'; }
      else {
        const st = inlineStyle(n.getAttribute('style') || '') + (t === 'font' ? (n.getAttribute('color') ? ';color:' + n.getAttribute('color') : '') + (n.getAttribute('face') ? `;font-family:"${n.getAttribute('face').split(',')[0]}"` : '') : '');
        if (!st.replace(/;/g, '')) { for (const c of n.childNodes) inlineOf(c, into); return; }
        el = document.createElement('span'); el.setAttribute('style', st.replace(/^;/, ''));
      }
      const extra = (t === 'a' || /^(b|i|u|s|sub|sup)$/.test(el.tagName.toLowerCase())) ? inlineStyle(n.getAttribute('style') || '') : '';
      if (extra) el.setAttribute('style', extra);
      for (const c of n.childNodes) inlineOf(c, el);
      into.append(el);
    };
    const tableOf = (tb) => {
      const rows = [...tb.querySelectorAll('tr')].filter((r) => r.closest('table') === tb); if (!rows.length) return null;
      const t = document.createElement('table'); t.dataset.ts = 'grid'; const body = document.createElement('tbody'); let ncols = 0; const widths = [];
      rows.forEach((r, ri) => {
        const tr = document.createElement('tr'); let ci = 0;
        [...r.children].filter((c) => /^(TD|TH)$/.test(c.tagName)).forEach((c) => {
          const cell = document.createElement(ri === 0 && c.tagName === 'TH' ? 'th' : 'td'); if (c.colSpan > 1) cell.colSpan = c.colSpan; if (c.rowSpan > 1) cell.rowSpan = c.rowSpan;
          const d = cssDecls(c.getAttribute('style')); const st = []; const bg = d['background-color'] || d.background; if (bg && /#|rgb/.test(bg) && !/fff(fff)?$|255,\s*255,\s*255/.test(bg)) st.push('background-color:' + bg.match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i)[0]);
          if (/^(center|right)$/.test(d['text-align'] || c.getAttribute('align') || '')) st.push('text-align:' + (d['text-align'] || c.getAttribute('align'))); if (/^(middle|bottom)$/.test(d['vertical-align'] || '')) st.push('vertical-align:' + d['vertical-align']);
          if (st.length) cell.setAttribute('style', st.join(';'));
          const w = toPxLen(d.width || (c.getAttribute('width') ? c.getAttribute('width') + 'px' : '')); if (w && c.colSpan <= 1 && ri === 0) widths[ci] = w;
          const saved = [out.length, cur]; const innerOut = []; const so = out.splice(0, out.length); cur = null;
          walk(c, true); flush(); const blocks = out.splice(0, out.length); out.push(...so); cur = saved[1];
          if (!blocks.length) { const p = document.createElement('p'); p.append(document.createElement('br')); blocks.push(p); }
          blocks.forEach((b) => { if (b.tagName === 'TABLE') { const p = document.createElement('p'); p.textContent = b.textContent; cell.append(p); } else cell.append(b); });
          void innerOut; tr.append(cell); ci += c.colSpan || 1;
        });
        ncols = Math.max(ncols, ci); body.append(tr);
      });
      const cw = P.geom().cw; const cg = document.createElement('colgroup'); let tot = 0; const ws = [];
      for (let i = 0; i < ncols; i++) { ws[i] = widths[i] || 0; tot += ws[i]; }
      const known = ws.filter((x) => x).length; const rest = Math.max(40, (cw - ws.reduce((a, b) => a + b, 0)) / Math.max(1, ncols - known));
      for (let i = 0; i < ncols; i++) { const c = document.createElement('col'); c.style.width = Math.round(ws[i] || (known === ncols ? ws[i] : rest)) + 'px'; cg.append(c); }
      let sum = [...cg.children].reduce((a, c) => a + parseFloat(c.style.width), 0); if (sum > cw) [...cg.children].forEach((c) => (c.style.width = Math.floor((parseFloat(c.style.width) * cw) / sum) + 'px'));
      t.append(cg, body); return t;
    };
    const listOf = (l, lv, ordered) => {
      for (const li of l.children) {
        if (li.tagName !== 'LI') continue; const p = newP(li); p.dataset.list = ordered ? 'n' : 'b'; if (lv) p.dataset.lv = lv;
        const chk = li.querySelector(':scope > input[type=checkbox]'); if (chk) { p.dataset.list = 'c'; if (chk.checked) p.dataset.checked = '1'; }
        const subs = [];
        for (const c of li.childNodes) { if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) subs.push(c); else if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) { if (p.childNodes.length) p.append(document.createElement('br')); for (const cc of c.childNodes) inlineOf(cc, p); } else inlineOf(c, p); }
        if (!p.textContent.trim() && !p.querySelector('img')) p.append(document.createElement('br'));
        out.push(p); subs.forEach((s) => listOf(s, Math.min(8, lv + 1), s.tagName === 'OL'));
      }
    };
    const walk = (parent, inCell) => {
      for (const n of parent.childNodes) {
        if (n.nodeType === 3) { if (!cur && !n.nodeValue.trim()) continue; cur ||= newP(); inlineOf(n, cur); continue; }
        if (n.nodeType !== 1 || SKIP.test(n.tagName)) continue;
        const t = n.tagName;
        if (/^(P|H[1-6]|BLOCKQUOTE|PRE|FIGCAPTION|LI|DT|DD|ADDRESS)$/.test(t) && !(t === 'BLOCKQUOTE' && hasBlock(n))) {
          flush(); let p; const hm = /^H([1-6])$/.exec(t);
          if (hm) { p = document.createElement('h' + Math.min(4, +hm[1])); const bs = blockStyle(n.getAttribute('style')); if (bs) p.setAttribute('style', bs); }
          else { p = newP(n); if (t === 'BLOCKQUOTE') p.dataset.st = 'Quote'; else if (t === 'PRE') p.dataset.st = 'Code'; else if (t === 'FIGCAPTION') p.dataset.st = 'Caption'; }
          if (t === 'PRE') p.append(n.textContent.replace(/\n$/, '')); else for (const c of n.childNodes) inlineOf(c, p);
          if (!p.textContent.trim() && !p.querySelector('img')) p.append(document.createElement('br')); out.push(p); continue;
        }
        if (t === 'UL' || t === 'OL') { flush(); listOf(n, 0, t === 'OL'); continue; }
        if (t === 'TABLE') { flush(); const tb = tableOf(n); if (tb) out.push(tb); continue; }
        if (t === 'HR') { flush(); continue; }
        if (t === 'DIV' && /page-break-(after|before)\s*:\s*always|break-(after|before)\s*:\s*page/.test(n.getAttribute('style') || '') && !n.textContent.trim()) { flush(); const pb = document.createElement('div'); pb.className = 'pgbreak'; pb.setAttribute('contenteditable', 'false'); pb.setAttribute('data-label', 'Page Break'); out.push(pb); continue; }
        if (t === 'DIV' || t === 'SECTION' || t === 'ARTICLE' || t === 'MAIN' || t === 'BODY' || t === 'HEADER' || t === 'FOOTER' || t === 'FIGURE' || t === 'BLOCKQUOTE' || t === 'ASIDE' || t === 'NAV' || t === 'DETAILS' || t === 'CENTER') {
          if (hasBlock(n) || t === 'BLOCKQUOTE') { flush(); const st = out.length; walk(n, inCell); flush(); if (t === 'BLOCKQUOTE') out.slice(st).forEach((b) => b.tagName === 'P' && !b.dataset.st && (b.dataset.st = 'Quote')); if (t === 'CENTER') out.slice(st).forEach((b) => (b.style.textAlign = 'center')); continue; }
          flush(); cur = newP(n); if (t === 'CENTER') cur.style.textAlign = 'center'; for (const c of n.childNodes) inlineOf(c, cur); flush(); continue;
        }
        cur ||= newP(); inlineOf(n, cur);
      }
    };
    walk(doc.body, false); flush(); return out;
  };

  /* ---------------- normalisation ---------------- */
  const emptyP = () => { const p = document.createElement('p'); p.append(document.createElement('br')); return p; };
  P.emptyP = emptyP;
  P.normalize = (full = false) => {
    let n = flow.firstChild, run = null;
    while (n) {
      const next = n.nextSibling;
      if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK_TAGS.test(n.tagName) && !n.classList.contains('pgsp'))) {
        if (n.nodeType === 3 && !n.nodeValue.trim() && !run) { n.remove(); n = next; continue; }
        if (!run) { run = document.createElement('p'); flow.insertBefore(run, n); }
        run.append(n);
      } else {
        run = null;
        if (n.tagName === 'DIV' && !n.classList.contains('pgbreak')) { const p = document.createElement('p'); while (n.firstChild) p.append(n.firstChild); if (!p.firstChild) p.append(document.createElement('br')); n.replaceWith(p); run = null; }
        else if (n.tagName === 'UL' || n.tagName === 'OL') { n.remove(); }
        else if (n.tagName === 'TABLE' && full) P.normTable(n);
      }
      n = next;
    }
    if (!flow.firstChild) flow.append(emptyP());
    const last = flow.lastElementChild; if (last && (last.tagName === 'TABLE' || last.classList.contains('pgbreak'))) flow.append(emptyP());
    const s = getSelection(); if (s.rangeCount) { const c = P.cellOf(s.anchorNode); if (c) P.normTable(c.closest('table')); }
  };
  P.normTable = (t) => {
    for (const c of t.querySelectorAll('td,th')) {
      if (c.closest('table') !== t) continue;
      let hasBlock = false, inline = false;
      for (const k of c.childNodes) { if (k.nodeType === 1 && /^(P|H[1-4])$/.test(k.tagName)) hasBlock = true; else if (k.nodeType === 1 && k.classList.contains('pgsp')) continue; else if (k.nodeType === 3 ? k.nodeValue.trim() || hasBlock : true) inline = true; }
      if (!c.firstChild) c.append(emptyP());
      else if (inline || !hasBlock) {
        const keep = []; let run = null;
        for (const k of [...c.childNodes]) { if (k.nodeType === 1 && /^(P|H[1-4])$/.test(k.tagName)) { run = null; continue; } if (k.nodeType === 1 && k.tagName === 'DIV') { const p = document.createElement('p'); while (k.firstChild) p.append(k.firstChild); if (!p.firstChild) p.append(document.createElement('br')); k.replaceWith(p); run = null; continue; } if (!run) { run = document.createElement('p'); c.insertBefore(run, k); } run.append(k); }
        void keep;
      }
    }
  };

  /* ---------------- list numbering ---------------- */
  const alpha = (n) => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
  const roman = (n) => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
  P.listLabel = (kind, lv, cnt, checked) => {
    if (kind === 'b') return ['•', '◦', '▪'][lv % 3];
    if (kind === 'c') return checked ? '☑' : '☐';
    if (kind === 'm') return cnt.slice(0, lv + 1).map((x) => Math.max(1, x)).join('.') + '.';
    const n = cnt[lv]; const f = lv % 3; return (f === 0 ? n : f === 1 ? alpha(n) : roman(n)) + '.';
  };
  P.renumber = () => {
    let cnt = [], kinds = [], inRun = false, saved = null, any = false;
    for (const el of flow.children) {
      const kind = el.getAttribute('data-list');
      if (!kind) { if (inRun) { saved = cnt.slice(); inRun = false; } if (el.hasAttribute('data-mark')) el.removeAttribute('data-mark'); continue; }
      any = true; const lv = Math.min(8, +el.getAttribute('data-lv') || 0);
      if (!inRun) { cnt = el.hasAttribute('data-cont') && saved ? saved.slice() : []; kinds = []; inRun = true; }
      if (cnt.length > lv + 1) { cnt.length = lv + 1; kinds.length = lv + 1; }
      while (cnt.length <= lv) cnt.push(0);
      if (kinds[lv] !== kind) { cnt[lv] = 0; kinds[lv] = kind; }
      if (el.hasAttribute('data-restart')) cnt[lv] = Math.max(0, +el.getAttribute('data-restart') - 1);
      cnt[lv]++;
      const mark = P.listLabel(kind, lv, cnt, el.hasAttribute('data-checked'));
      if (el.getAttribute('data-mark') !== mark) el.setAttribute('data-mark', mark);
    }
    P.hasLists = any;
  };

  /* ---------------- change pipeline ---------------- */
  let slowT = 0;
  P.slow = () => { clearTimeout(slowT); slowT = setTimeout(() => P.runSlow && P.runSlow(), 350); };
  P.changed = (o = {}) => {
    P.normalize(!o.typing); P.renumber();
    P.schedulePaginate(o); P.slow(); P.refreshSoon && P.refreshSoon();
  };
  P.afterLoad = () => {
    P.normalize(true); P.absorbDataImages && P.absorbDataImages(); P.renderEquations && P.renderEquations(); P.renumber();
    P.reapplyComments && P.reapplyComments(); P.paginate({ full: true }); P.runSlow && P.runSlow(); P.refreshSoon && P.refreshSoon();
  };
  P.setContent = (html, own = true) => {
    flow.innerHTML = own ? P.sanitizeOwn(html) : html; P.afterLoad();
  };

  /* ---------------- selection helpers ---------------- */
  P.selBlocks = () => {
    const r = P.range(); if (!r) return [];
    if (P.hfEl && P.hfEl.contains(r.startContainer)) return [...P.hfEl.querySelectorAll(P.BLOCK_SEL)].filter((b) => r.intersectsNode(b));
    const a = P.paraOf(r.startContainer) || (r.startContainer === flow ? flow.children[r.startOffset] : null);
    const b = P.paraOf(r.endContainer) || (r.endContainer === flow ? flow.children[Math.max(0, r.endOffset - 1)] : null);
    const all = [...flow.querySelectorAll(P.BLOCK_SEL)].filter((x) => !x.closest('[contenteditable=false]'));
    if (!a) return b ? [b] : []; if (!b || a === b) return [a];
    const i = all.indexOf(a), j = all.indexOf(b); if (i < 0 || j < 0) return [a];
    let out = all.slice(Math.min(i, j), Math.max(i, j) + 1);
    // collapse-edge: if range ends at offset 0 of the last block (triple click) don't include it
    if (!r.collapsed && out.length > 1 && r.endOffset === 0 && r.endContainer === out[out.length - 1]) out = out.slice(0, -1);
    return out;
  };
  const withSel = (fn) => { const sv = P.saveSel(); const r = fn(); P.restoreSel(sv); return r; };
  P.withSel = withSel;
  P.retag = (el, tag) => {
    if (el.tagName === tag) return el; const n = document.createElement(tag);
    for (const a of [...el.attributes]) n.setAttribute(a.name, a.value);
    while (el.firstChild) n.append(el.firstChild); el.replaceWith(n); return n;
  };
  P._last = null;
  document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && flow.contains(s.anchorNode)) P._last = s.getRangeAt(0).cloneRange(); });
  P.focus = () => {
    if (P.hfActive && P.hfActive.el.contains(document.activeElement)) return;
    if (document.activeElement !== flow && !flow.contains(document.activeElement)) { flow.focus({ preventScroll: true }); const s = getSelection(); if (P._last && (!s.rangeCount || !flow.contains(s.anchorNode))) { s.removeAllRanges(); s.addRange(P._last); } }
  };

  /* ---------------- formatting commands ---------------- */
  const exec = (c, v) => document.execCommand(c, false, v);
  P.cmd = (c, v, css = false) => { P.focus(); P.checkpoint(false); exec('styleWithCSS', css); exec(c, v); exec('styleWithCSS', false); P.changed(); P.markDirty(); P.refreshSoon(); };
  P.toggleInline = (c) => P.cmd(c);
  P.sup = () => { if (document.queryCommandState('subscript')) exec('subscript'); P.cmd('superscript'); };
  P.sub = () => { if (document.queryCommandState('superscript')) exec('superscript'); P.cmd('subscript'); };
  const textNodesIn = (r) => {
    const out = []; const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (r.intersectsNode(n) && n.nodeValue.length && !n.parentElement.closest('.pgsp,[contenteditable=false]') ? 1 : 2) });
    while (w.nextNode()) out.push(w.currentNode); return out;
  };
  /** split the range's boundary text nodes so that every text node is fully inside; returns them */
  const isolate = (r) => {
    let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = r;
    if (ec.nodeType === 3 && eo < ec.nodeValue.length && eo > 0) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.nodeValue.length) { const t = sc.splitText(so); if (sc === ec) { ec = t; eo -= so; } sc = t; so = 0; }
    const nr = document.createRange(); nr.setStart(sc, so); nr.setEnd(ec, ec === sc && sc.nodeType === 3 ? Math.min(eo, ec.nodeValue.length) : eo);
    return textNodesIn(nr).filter((n) => { const a = n === sc ? so : 0; const b = n === ec ? eo : n.nodeValue.length; return b > a; });
  };
  /** apply inline CSS props to the selection (or, if collapsed, to the typing position) */
  P.applyInline = (props) => {
    P.focus(); const r = P.range(); if (!r) return;
    if (r.collapsed) {
      P.checkpoint(false); const sp = document.createElement('span'); Object.assign(sp.style, props); sp.textContent = '​';
      r.insertNode(sp); const nr = document.createRange(); nr.setStart(sp.firstChild, 1); nr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); P.markDirty(); return;
    }
    P.checkpoint(false); const nodes = isolate(r); if (!nodes.length) return;
    for (const t of nodes) {
      const par = t.parentNode;
      if (par.tagName === 'SPAN' && !par.className && par.childNodes.length === 1 && !par.hasAttribute('data-cid')) Object.assign(par.style, props);
      else { const sp = document.createElement('span'); Object.assign(sp.style, props); par.insertBefore(sp, t); sp.append(t); }
    }
    const nr = document.createRange(); nr.setStartBefore(nodes[0]); nr.setEndAfter(nodes[nodes.length - 1]); const s = getSelection(); s.removeAllRanges(); s.addRange(nr);
    P.changed(); P.markDirty();
  };
  P.setFontSize = (pt) => P.applyInline({ fontSize: pt + 'pt' });
  P.setFont = (name) => P.applyInline({ fontFamily: name === 'System UI' ? 'system-ui' : P.fontCss(name) });
  P.setColor = (c) => P.cmd('foreColor', c, true);
  P.setHighlight = (c) => P.cmd('hiliteColor', c || 'transparent', true);
  P.setSpacing = (pt) => P.applyInline({ letterSpacing: pt + 'pt' });
  P.toggleSmallCaps = () => { const f = P.fmtState(); P.applyInline({ fontVariant: f.smallcaps ? 'normal' : 'small-caps' }); };
  P.changeCase = (mode) => {
    const r = P.range(); if (!r || r.collapsed) return; P.checkpoint(false);
    const nodes = isolate(r); const conv = (s, first) => ({ upper: s.toUpperCase(), lower: s.toLowerCase(), title: s.toLowerCase().replace(/(^|[\s(\["'—-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), sentence: s.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), toggle: [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('') }[mode]);
    nodes.forEach((n, i) => { n.nodeValue = conv(n.nodeValue, i === 0); });
    if (mode === 'sentence' && nodes[0]) nodes[0].nodeValue = nodes[0].nodeValue.replace(/^(\s*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    const nr = document.createRange(); nr.setStartBefore(nodes[0]); nr.setEndAfter(nodes[nodes.length - 1]); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); P.changed(); P.markDirty();
  };
  P.clearFormatting = () => {
    P.focus(); P.checkpoint(false); exec('removeFormat');
    const r = P.range();
    if (r && !r.collapsed) for (const sp of flow.querySelectorAll('span:not([class]),font,mark')) if (r.intersectsNode(sp) && !sp.closest('[contenteditable=false]')) { while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp); sp.remove(); }
    withSel(() => { for (let b of P.selBlocks()) { b.removeAttribute('style'); b.removeAttribute('data-bd'); if (b.tagName !== 'P') b = P.retag(b, 'P'); b.removeAttribute('data-st'); } });
    P.changed(); P.markDirty();
  };
  /** current inline/paragraph state for UI */
  P.fmtState = () => {
    const s = getSelection(); const out = { ok: false };
    if (!s.rangeCount || !flow.contains(s.anchorNode)) return out;
    let el = s.focusNode.nodeType === 3 ? s.focusNode.parentElement : s.focusNode; if (!el || !flow.contains(el)) return out; if (el === flow) el = flow.children[0] || el;
    const cs = getComputedStyle(el); const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    out.ok = true; out.bold = q('bold'); out.italic = q('italic'); out.underline = q('underline'); out.strike = q('strikeThrough'); out.sup = q('superscript'); out.sub = q('subscript');
    out.font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); out.size = Math.round(P.px2pt(parseFloat(cs.fontSize)) * 2) / 2;
    out.color = cs.color; out.smallcaps = /small-caps/.test(cs.fontVariantCaps + cs.fontVariant); out.ls = parseFloat(cs.letterSpacing) || 0;
    const hl = el.closest('[style*="background"]'); out.highlight = hl && flow.contains(hl) ? getComputedStyle(hl).backgroundColor : '';
    const p = P.paraOf(s.focusNode.nodeType === 3 ? s.focusNode.parentNode : s.focusNode) || P.blockOf(el);
    out.para = p; if (p) { const pc = getComputedStyle(p); out.align = pc.textAlign === 'start' ? 'left' : pc.textAlign; out.style = P.styleOfBlock(p); out.list = p.getAttribute('data-list') || ''; out.lv = +p.getAttribute('data-lv') || 0; out.lh = pc.getPropertyValue('--lh').trim(); out.sb = parseFloat(pc.getPropertyValue('--sb')) || 0; out.sa = parseFloat(pc.getPropertyValue('--sa')) || 0; out.il = parseFloat(pc.getPropertyValue('--il')) || 0; out.ir = parseFloat(pc.getPropertyValue('--ir')) || 0; out.fi = parseFloat(pc.getPropertyValue('--fi')) || 0; out.lhNum = parseFloat(pc.lineHeight) / parseFloat(pc.fontSize); }
    out.link = el.closest('a'); out.cell = P.cellOf(s.focusNode);
    return out;
  };

  /* ---------------- paragraph commands ---------------- */
  P.forBlocks = (fn) => { P.focus(); P.checkpoint(false); withSel(() => { for (const b of P.selBlocks()) fn(b); }); P.changed(); P.markDirty(); };
  P.setAlign = (a) => P.forBlocks((b) => (b.style.textAlign = a));
  P.setBlockVar = (name, px) => P.forBlocks((b) => { if (px === null || px === '') b.style.removeProperty(name); else b.style.setProperty(name, typeof px === 'number' ? Math.round(px * 100) / 100 + (name === '--lh' ? '' : 'px') : px); P.gapVer++; });
  P.setLineHeight = (v) => P.setBlockVar('--lh', v === null ? null : String(v));
  P.setStyle = (name) => {
    P.focus(); P.checkpoint(false);
    withSel(() => {
      for (let b of P.selBlocks()) {
        if (b.closest('[data-toc]')) continue;
        const tag = P.tagOfStyle(name); b = P.retag(b, tag);
        if (name === 'Body' || tag !== 'P') b.removeAttribute('data-st'); else b.setAttribute('data-st', name);
        b.removeAttribute('style'); if (P.S.styles[name] && P.S.styles[name].keep) b.setAttribute('data-kwn', '1'); else b.removeAttribute('data-kwn');
      }
    });
    P.changed(); P.markDirty();
  };
  P.setList = (kind) => {
    P.forBlocks((b) => {
      if (b.closest('td,th')) { /* lists in cells are shown but numbering is table-local */ }
      if (b.getAttribute('data-list') === kind) { b.removeAttribute('data-list'); b.removeAttribute('data-lv'); b.removeAttribute('data-checked'); }
      else { b.setAttribute('data-list', kind); if (!b.hasAttribute('data-lv')) b.setAttribute('data-lv', '0'); }
    });
  };
  P.indent = (d) => P.forBlocks((b) => {
    if (b.hasAttribute('data-list')) { const lv = Math.max(0, Math.min(8, (+b.getAttribute('data-lv') || 0) + d)); lv ? b.setAttribute('data-lv', lv) : b.setAttribute('data-lv', '0'); }
    else { const cur = parseFloat(getComputedStyle(b).getPropertyValue('--il')) || 0; b.style.setProperty('--il', Math.max(0, cur + d * 36) + 'px'); }
  });
  P.setBorder = (mode, color = '#8e8e93', w = 1) => P.forBlocks((b) => {
    for (const s of ['border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight']) b.style[s] = '';
    b.style.padding = ''; if (mode === 'none') { b.removeAttribute('data-bd'); return; }
    const line = `${w}px solid ${color}`; b.setAttribute('data-bd', mode);
    if (mode === 'box') b.style.border = line; else b.style[{ top: 'borderTop', bottom: 'borderBottom', left: 'borderLeft', right: 'borderRight' }[mode]] = line;
    b.style.padding = '4px 8px';
  });
  P.setShading = (color) => P.forBlocks((b) => { b.style.backgroundColor = color || ''; if (color && !b.style.padding) b.style.padding = '2px 8px'; });
  P.pageBreakBefore = () => P.forBlocks((b) => { b.hasAttribute('data-pbb') ? b.removeAttribute('data-pbb') : b.setAttribute('data-pbb', '1'); });
  P.keepWithNext = () => P.forBlocks((b) => { b.hasAttribute('data-kwn') ? b.removeAttribute('data-kwn') : b.setAttribute('data-kwn', '1'); });
  P.continueList = () => P.forBlocks((b) => b.hasAttribute('data-list') && (b.hasAttribute('data-cont') ? b.removeAttribute('data-cont') : b.setAttribute('data-cont', '1')));
  P.restartList = () => P.forBlocks((b) => b.hasAttribute('data-list') && b.setAttribute('data-restart', '1'));

  /* ---------------- styles gallery ops ---------------- */
  P.updateStyleFromSelection = (name) => {
    const f = P.fmtState(); if (!f.ok || !f.para) return; P.checkpoint(false);
    const d = P.S.styles[name] || (P.S.styles[name] = {});
    Object.assign(d, { font: f.font, size: f.size, bold: f.bold ? 1 : 0, italic: f.italic ? 1 : 0, color: rgb2hex(f.color), align: f.align, sb: P.px2pt(f.sb), sa: P.px2pt(f.sa), lh: Math.round((f.lhNum || 1.2) * 100) / 100, il: f.il, ir: f.ir, fi: f.fi, underline: f.underline ? 1 : 0 });
    P.applyStyleCss(); P.changed(); P.markDirty(); zk.toast('Updated “' + name + '” to match selection');
  };
  const rgb2hex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : c; };
  P.rgb2hex = rgb2hex;

  /* ---------------- links, breaks, misc inserts ---------------- */
  P.insertHTML = (html) => { P.focus(); P.checkpoint(false); exec('insertHTML', html); P.changed(); P.markDirty(); };
  P.insertNodeAtCaret = (node, { block = false } = {}) => {
    P.focus(); P.checkpoint(false); let r = P.range();
    if (!r) { const last = flow.lastElementChild; P.placeCaretIn(last, true); r = P.range(); }
    r.deleteContents();
    if (block) {
      const p = P.paraOf(r.startContainer); const top = P.blockOf(r.startContainer);
      if (p && p.parentNode === flow) {
        if (!p.textContent.trim() && !p.querySelector('img,.shp,.eq')) { p.replaceWith(node); node.after(emptyP()); }
        else { const rr = document.createRange(); rr.setStart(r.startContainer, r.startOffset); rr.setEndAfter(p.lastChild || p); const tail = rr.extractContents(); const np = p.cloneNode(false); np.append(tail); if (!np.textContent.trim() && !np.querySelector('img')) { np.innerHTML = ''; np.append(document.createElement('br')); } p.after(node, np); if (!p.firstChild) p.append(document.createElement('br')); }
      } else (top || flow.lastElementChild).after(node);
      const t = node.nextElementSibling; if (t) P.placeCaretIn(t);
    } else { r.insertNode(node); const nr = document.createRange(); nr.setStartAfter(node); nr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); }
    P.changed(); P.markDirty();
  };
  P.insertPageBreak = () => { const d = document.createElement('div'); d.className = 'pgbreak'; d.setAttribute('contenteditable', 'false'); d.setAttribute('data-label', 'Page Break'); P.insertNodeAtCaret(d, { block: true }); };
  P.insertColumnBreak = () => { const d = document.createElement('div'); d.className = 'pgbreak'; d.setAttribute('contenteditable', 'false'); d.setAttribute('data-cb', '1'); d.setAttribute('data-label', 'Column Break'); P.insertNodeAtCaret(d, { block: true }); };
  P.linkAt = () => { const s = getSelection(); return s.rangeCount && flow.contains(s.anchorNode) ? (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode).closest?.('a') : null; };
  P.setLink = (url) => {
    P.focus(); P.checkpoint(false); const a = P.linkAt();
    if (a) { if (!url) { const p = a.parentNode; while (a.firstChild) p.insertBefore(a.firstChild, a); a.remove(); } else a.setAttribute('href', url); }
    else if (url) { const r = P.range(); if (r && r.collapsed) { const l = document.createElement('a'); l.setAttribute('href', url); l.textContent = url; r.insertNode(l); P.placeCaretIn(l, true); } else { exec('createLink', url); } }
    for (const l of flow.querySelectorAll('a[href]')) if (!okHref(l.getAttribute('href'))) l.removeAttribute('href');
    P.changed(); P.markDirty();
  };
  P.openLink = (a) => { const h = a.getAttribute('href') || ''; if (h.startsWith('#')) { const t = flow.querySelector('[id="' + CSS.escape(h.slice(1)) + '"]') || flow.querySelector(`[data-bm="${CSS.escape(h.slice(1))}"]`); t && P.scrollToEl(t); } else if (zeng.isNative) zeng.call('open_url', { url: h }).catch(() => {}); else window.open(h, '_blank', 'noopener'); };
  P.insertSymbol = (ch) => { P.focus(); exec('insertText', ch); };
  P.insertTab = () => { P.focus(); exec('insertText', '\t'); };

  /* ---------------- events ---------------- */
  exec('defaultParagraphSeparator', 'p');
  let composing = false;
  flow.addEventListener('compositionstart', () => { composing = true; P.checkpoint(false); });
  flow.addEventListener('compositionend', () => { composing = false; P.changed({ typing: true }); });
  P.isComposing = () => composing;
  flow.addEventListener('beforeinput', (e) => {
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); P.undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); P.redo(); return; }
    if (P.review && P.review.beforeInput(e)) return;
    if (composing) return;
    const kind = t === 'insertText' ? 'ins' : /^delete(Content|Word|Soft|Hard)(Backward|Forward)$/.test(t) ? 'del' : null;
    if (kind) { if (!(P.hist.open && P.hist.kind === kind)) { P.closeGroup(); P.hist.kind = kind; } P.checkpoint(true); }
    else P.checkpoint(false);
  });
  flow.addEventListener('input', (e) => {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') afterEnter();
    if (e.inputType === 'insertText' || e.inputType === 'insertCompositionText') stripZw();
    if (!composing) P.changed({ typing: e.inputType === 'insertText' || e.inputType === 'deleteContentBackward' });
    P.markDirty();
  });
  const stripZw = () => { const s = getSelection(); const n = s.anchorNode; if (n && n.nodeType === 3 && n.nodeValue.length > 1 && n.nodeValue.includes('​')) { const o = s.anchorOffset; const before = n.nodeValue.slice(0, o).replace(/​/g, '').length; n.nodeValue = n.nodeValue.replace(/​/g, ''); s.collapse(n, before); } };
  const afterEnter = () => {
    const s = getSelection(); if (!s.rangeCount) return; const np = P.paraOf(s.anchorNode); if (!np) return;
    for (const a of ['data-pbb', 'data-restart', 'data-cont', 'data-checked', 'id', 'data-fnid', 'data-toc']) np.removeAttribute(a);
    const prev = np.previousElementSibling;
    if (prev && /^(P|H[1-4])$/.test(prev.tagName) && !np.textContent.replace(/​/g, '').trim() && !np.querySelector('img,.shp')) {
      const nm = P.styleOfBlock(prev); const def = P.S.styles[nm]; const next = def && def.next;
      if (next && next !== nm && !prev.hasAttribute('data-list')) { const sv = P.saveSel(); const b = P.retag(np, P.tagOfStyle(next)); b.removeAttribute('style'); next === 'Body' || P.tagOfStyle(next) !== 'P' ? b.removeAttribute('data-st') : b.setAttribute('data-st', next); b.removeAttribute('data-kwn'); P.restoreSel(sv); }
    }
  };
  flow.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Enter' && !mod && !e.altKey) {
      const p = P.paraOf(getSelection().anchorNode);
      if (p && p.hasAttribute('data-list') && !e.shiftKey && !p.textContent.trim() && !p.querySelector('img,.shp,.eq')) {
        e.preventDefault(); P.checkpoint(false); const lv = +p.getAttribute('data-lv') || 0;
        if (lv > 0) p.setAttribute('data-lv', lv - 1); else { p.removeAttribute('data-list'); p.removeAttribute('data-lv'); p.removeAttribute('data-checked'); }
        P.changed(); P.markDirty(); return;
      }
    }
    if (e.key === 'Backspace' && !mod && !e.shiftKey) {
      const s = getSelection(); const p = P.paraOf(s.anchorNode);
      if (p && s.isCollapsed && p.hasAttribute('data-list') && P.lo(p, s.anchorNode, s.anchorOffset) === 0) { e.preventDefault(); P.checkpoint(false); const lv = +p.getAttribute('data-lv') || 0; if (lv > 0) p.setAttribute('data-lv', lv - 1); else { p.removeAttribute('data-list'); p.removeAttribute('data-lv'); p.removeAttribute('data-checked'); } P.changed(); P.markDirty(); return; }
      // don't merge into a non-editable block: delete it instead
      if (p && s.isCollapsed && P.lo(p, s.anchorNode, s.anchorOffset) === 0) { const pv = p.previousElementSibling; if (pv && (pv.classList.contains('pgbreak'))) { e.preventDefault(); P.checkpoint(false); pv.remove(); P.changed(); P.markDirty(); } }
    }
    if (e.key === 'Delete' && !mod) {
      const s = getSelection(); const p = P.paraOf(s.anchorNode);
      if (p && s.isCollapsed) { const nx = p.nextElementSibling; const atEnd = P.lo(p, s.anchorNode, s.anchorOffset) >= P.lo(p, p, p.childNodes.length); if (atEnd && nx && nx.classList.contains('pgbreak')) { e.preventDefault(); P.checkpoint(false); nx.remove(); P.changed(); P.markDirty(); } }
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      const s = getSelection(); const c = P.cellOf(s.anchorNode); const p = P.paraOf(s.anchorNode);
      if (c) { e.preventDefault(); P.tableTab(c, e.shiftKey); return; }
      if (p && p.hasAttribute('data-list') && (s.isCollapsed ? P.lo(p, s.anchorNode, s.anchorOffset) === 0 : true)) { e.preventDefault(); P.indent(e.shiftKey ? -1 : 1); return; }
      e.preventDefault(); if (e.shiftKey) { P.indent(-1); return; } P.checkpoint(true); exec('insertText', '\t'); return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) P.closeGroup();
  });
  flow.addEventListener('pointerdown', (e) => {
    P.closeGroup();
    if (e.button !== 0) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && (e.metaKey || e.ctrlKey)) { e.preventDefault(); P.openLink(a); return; }
    // checklist box: click in the hanging marker zone
    const z = P.zoom || 1; let p = e.target.closest && e.target.closest('p[data-list="c"],h1[data-list="c"],h2[data-list="c"],h3[data-list="c"],h4[data-list="c"]');
    if (!p) { const hit = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null; const q = hit && P.paraOf(hit.startContainer); if (q && q.getAttribute('data-list') === 'c') p = q; }
    if (p) { const r = p.getBoundingClientRect(); if (e.clientX < r.left && e.clientX > r.left - 30 * z) { e.preventDefault(); P.checkpoint(false); p.hasAttribute('data-checked') ? p.removeAttribute('data-checked') : p.setAttribute('data-checked', '1'); P.renumber(); P.markDirty(); } }
  });
  flow.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a && !(e.metaKey || e.ctrlKey)) { /* editing a link: show popover */ P.ui && P.ui.linkPop && P.ui.linkPop(a); } });
  flow.addEventListener('paste', async (e) => {
    const cd = e.clipboardData; if (!cd) return; e.preventDefault();
    const files = [...cd.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) { for (const f of files) await P.insertImageFile(f); return; }
    const html = cd.getData('text/html'); const text = cd.getData('text/plain');
    if (P.pasteMode === 'plain' || !html) { P.pastePlain(text); return; }
    // our own copy: keep as is
    if (/data-zp="1"/.test(html)) { P.insertHTML(P.sanitizeOwn(html.replace(/<\/?(html|body|meta)[^>]*>|<!--[\s\S]*?-->/g, '')) ); P.absorbDataImages(); return; }
    const nodes = P.sanitizeExternal(html); if (!nodes.length) { P.pastePlain(text); return; }
    const wrap = document.createElement('div'); nodes.forEach((n) => wrap.append(n));
    if (nodes.length === 1 && nodes[0].tagName === 'P' && !nodes[0].dataset.list) P.insertHTML(nodes[0].innerHTML); else P.insertHTML(wrap.innerHTML);
    P.absorbDataImages();
  });
  P.pastePlain = (text) => { if (!text) return; P.focus(); P.checkpoint(false); const lines = text.replace(/\r\n?/g, '\n').split('\n'); lines.forEach((l, i) => { if (i) exec('insertParagraph'); if (l) exec('insertText', l); }); P.changed(); P.markDirty(); };
  flow.addEventListener('copy', (e) => { const r = P.range(); if (!r || r.collapsed) return; const div = document.createElement('div'); div.append(r.cloneContents()); const h = P.cleanString(div.innerHTML).replace(/​/g, ''); e.clipboardData.setData('text/html', `<div data-zp="1">${h}</div>`); e.clipboardData.setData('text/plain', div.textContent); e.preventDefault(); });
  flow.addEventListener('cut', (e) => { const r = P.range(); if (!r || r.collapsed) return; const div = document.createElement('div'); div.append(r.cloneContents()); const h = P.cleanString(div.innerHTML).replace(/​/g, ''); e.clipboardData.setData('text/html', `<div data-zp="1">${h}</div>`); e.clipboardData.setData('text/plain', div.textContent); e.preventDefault(); P.checkpoint(false); exec('delete'); P.changed(); P.markDirty(); });
  flow.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('img')) e.preventDefault(); });
  flow.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/')); if (fs.length) { e.preventDefault(); e.stopPropagation(); const c = document.caretRangeFromPoint?.(e.clientX, e.clientY); if (c) { const s = getSelection(); s.removeAllRanges(); s.addRange(c); } fs.forEach((f) => P.insertImageFile(f)); } });
  document.addEventListener('selectionchange', () => { P.refreshSoon && P.refreshSoon(); });
})();
