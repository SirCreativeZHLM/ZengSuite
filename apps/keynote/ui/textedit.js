/* In-place rich text editing (contenteditable) + formatting commands. */
(() => {
  const K = window.K, A = window.A;
  document.execCommand('defaultParagraphSeparator', false, 'p');
  const rgb2hex = (c) => { if (!c) return null; if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c; const p = m[1].split(',').map((x) => parseFloat(x)); if (p.length > 3 && p[3] === 0) return null; return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); };
  const SENT_C = '#010203', SENT_H = '#010204';

  // ---------- DOM -> model ----------
  function styleOf(node, root) {
    const st = {}; const set = (k, v) => { if (st[k] === undefined && v !== undefined && v !== null) st[k] = v; };
    for (let e = node.parentElement; e && e !== root && e.tagName !== 'P'; e = e.parentElement) {
      const t = e.tagName;
      if (t === 'B' || t === 'STRONG') set('b', true); if (t === 'I' || t === 'EM') set('i', true); if (t === 'U') set('u', true); if (t === 'S' || t === 'STRIKE' || t === 'DEL') set('s', true);
      if (t === 'SUP') set('sup', true); if (t === 'SUB') set('sub', true); if (t === 'A') set('l', e.dataset.link || e.getAttribute('href') || '');
      if (t === 'FONT') { if (e.color) set('c', rgb2hex(e.color)); if (e.face) set('f', e.face); }
      const s = e.style; if (!s) continue;
      if (s.fontWeight) set('b', s.fontWeight === 'bold' || +s.fontWeight >= 600); if (s.fontStyle) set('i', s.fontStyle === 'italic');
      const td = s.textDecorationLine || s.textDecoration; if (td) { if (/underline/.test(td)) set('u', true); if (/line-through/.test(td)) set('s', true); if (td === 'none') { set('u', false); } }
      if (s.color) set('c', e.dataset.c || rgb2hex(s.color));
      if (s.backgroundColor) set('hl', e.dataset.hl || rgb2hex(s.backgroundColor));
      if (s.fontSize) { const m = s.fontSize.match(/calc\(([\d.]+)px/) || s.fontSize.match(/([\d.]+)px/); if (m) set('sz', +m[1]); }
      if (s.fontFamily) set('f', e.dataset.f || s.fontFamily);
      if (s.verticalAlign === 'super') set('sup', true); if (s.verticalAlign === 'sub') set('sub', true);
    }
    return st;
  }
  K.parseParas = (root, o) => {
    const paras = []; let cur = null; const deck = A.deck; const ts = o ? K.tstyle(o) : {};
    const fam = (f) => { if (!f) return f; const fl = f.replace(/["']/g, '').toLowerCase(); if (deck && fl === K.fontCSS(deck, 'head').replace(/["']/g, '').toLowerCase()) return 'head'; if (deck && fl === K.fontCSS(deck, 'body').replace(/["']/g, '').toLowerCase()) return 'body'; return f.replace(/["']/g, '').split(',')[0].trim(); };
    const newPara = (el) => {
      cur = { runs: [] }; paras.push(cur);
      if (el && el.dataset) { const d = el.dataset; if (d.plist !== undefined) cur.list = d.plist; if (d.lv && +d.lv) cur.lv = +d.lv; if (d.pal) cur.al = d.pal; if (d.pls) cur.ls = +d.pls; if (d.psa) cur.sa = +d.psa; if (d.psb) cur.sb = +d.psb; }
    };
    const add = (text, st) => {
      if (!text) return; const r = { t: text }; for (const k in st) { if (k === 'f') r.f = fam(st.f); else r[k] = st[k]; }
      const last = cur.runs[cur.runs.length - 1]; const { t: _t, ...rest } = r; if (last) { const { t: _l, ...lr } = last; if (JSON.stringify(lr) === JSON.stringify(rest)) { last.t += text; return; } } cur.runs.push(r);
    };
    const inline = (node, root2) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) add(n.nodeValue.replace(/[​ ]/g, (c) => (c === ' ' ? ' ' : '')), styleOf(n, root2));
        else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { const only = node.childNodes.length === 1; const trailing = !n.nextSibling && n.previousSibling && n.previousSibling.nodeName !== 'BR'; if (!only && !trailing) add('\n', {}); }
          else if (n.dataset && n.dataset.field) { const st = styleOf(n.firstChild || n, root2); cur.runs.push({ t: '', field: n.dataset.field, ...st }); }
          else inline(n, root2);
        }
      }
    };
    const kids = [...root.childNodes]; let loose = false;
    for (const n of kids) {
      if (n.nodeType === 1 && /^(P|DIV|LI|H[1-6])$/.test(n.tagName)) { loose = false; newPara(n); inline(n, root); }
      else { if (!loose) { newPara(null); loose = true; } if (n.nodeType === 3) add(n.nodeValue, styleOf(n, root)); else if (n.nodeType === 1) { if (n.tagName === 'BR') { if (cur.runs.length) loose = false; } else inline({ childNodes: [n] }, root); } }
    }
    if (!paras.length) paras.push({ runs: [{ t: '' }] });
    paras.forEach((p) => { if (!p.runs.length) p.runs.push({ t: '' }); });
    // trailing newline only paragraphs stay (blank lines are real)
    return paras;
  };

  // ---------- list markers while editing ----------
  const relist = (tb, o) => {
    const ts = K.tstyle(o); const counters = new Array(9).fill(0); const ind = Math.max(16, ts.sz * 0.85);
    for (const p of tb.children) {
      if (p.tagName !== 'P') continue; const list = p.dataset.plist ?? ts.list; const lv = +(p.dataset.lv || 0);
      if (list && list !== 'none') { counters[lv]++; for (let i = lv + 1; i < 9; i++) counters[i] = 0; p.dataset.mk = K.marker(list, lv, counters[lv]); p.style.paddingLeft = ind * (lv + 1) + 'px'; p.style.setProperty('--ind', ind * lv + 'px'); p.style.setProperty('--mkw', ind + 'px'); if (['b', 'd', 'c'].includes(list)) p.style.setProperty('--mkc', K.col(A.deck, 'a1')); }
      else { counters.fill(0); delete p.dataset.mk; p.style.paddingLeft = lv ? ind * lv + 'px' : ''; }
    }
  };

  // ---------- edit session ----------
  const fixAH = (o) => { if (o.type !== 'text' || !o.ah) return false; const el = A.elOf(o.id); const tb = el && el.querySelector(':scope > .tx > .tb'); if (!tb) return false; const ts = K.tstyle(o); const need = Math.max(tb.offsetHeight + 2 * (ts.pad ?? 6), ts.sz * 1.3 + 2 * (ts.pad ?? 6)); if (Math.abs(need - o.h) > 0.5) { o.h = need; el.style.height = need + 'px'; return true; } return false; };
  A.fixAH = fixAH;
  const cellOf = (o, c) => o.cells[c.r][c.c];
  A.startEdit = (o, ev, selectAll, cell) => {
    if (A.editing) A.endEdit(true); if (o.lock) return;
    A.sel = [o.id]; const box = A.elOf(o.id); if (!box) return; let tb;
    if (o.type === 'table') { cell = cell || { r: 0, c: 0 }; tb = box.querySelector(`td[data-r="${cell.r}"][data-c="${cell.c}"] .tb`); } else tb = box.querySelector(':scope > .tx > .tb');
    if (!tb) return; const tx = tb.parentElement;
    if (tx.classList.contains('prompt')) { tx.classList.remove('prompt'); tb.innerHTML = ''; const p = document.createElement('p'); p.append(document.createElement('br')); tb.append(p); }
    tx.style.setProperty('--fit', 1);
    tb.contentEditable = 'true'; tb.spellcheck = true; box.classList.add('editing-box'); A.editing = { id: o.id, el: tb, box, cell, o };
    A.overlay(); tb.focus();
    const sel = getSelection(); const r = document.createRange();
    if (selectAll) { r.selectNodeContents(tb); } else if (ev && ev.clientX != null && document.caretRangeFromPoint) { const cr = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (cr && tb.contains(cr.startContainer)) r.setStart(cr.startContainer, cr.startOffset); else { r.selectNodeContents(tb); r.collapse(false); } r.collapse(true); } else { r.selectNodeContents(tb); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r); A.emit('select'); A.emit('editstart');
    tb.addEventListener('input', onInput); tb.addEventListener('keydown', onKey); tb.addEventListener('paste', onPaste); tb.addEventListener('click', onClickLink);
  };
  const onClickLink = () => { };
  const onInput = () => { const ed = A.editing; if (!ed) return; relist(ed.el, ed.o); if (ed.o.type === 'text' && ed.o.ah) { const ts = K.tstyle(ed.o); const need = Math.max(ed.el.offsetHeight + 2 * (ts.pad ?? 6), 20); if (Math.abs(need - ed.o.h) > 0.5) { ed.o.h = need; ed.box.style.height = need + 'px'; A.overlay(); } } A.emit('live'); };
  const onKey = (e) => {
    const ed = A.editing; if (!ed) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); A.endEdit(true); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); A.endEdit(true); return; }
    const p = curPara(); 
    if (e.key === 'Tab') {
      e.preventDefault(); if (ed.cell) { moveCell(e.shiftKey ? -1 : 1); return; }
      const ps = parasInSel(); const ts = K.tstyle(ed.o);
      if (ps.some((x) => (x.dataset.plist ?? ts.list) && (x.dataset.plist ?? ts.list) !== 'none')) { ps.forEach((x) => { const lv = Math.max(0, Math.min(6, +(x.dataset.lv || 0) + (e.shiftKey ? -1 : 1))); if (lv) x.dataset.lv = lv; else delete x.dataset.lv; }); relist(ed.el, ed.o); } else if (!e.shiftKey) document.execCommand('insertText', false, '\t');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && p && !ed.cell) { const ts = K.tstyle(ed.o); const list = p.dataset.plist ?? ts.list; if (list && list !== 'none' && !p.textContent.replace(/​/g, '').length) { e.preventDefault(); p.dataset.plist = 'none'; delete p.dataset.lv; relist(ed.el, ed.o); } }
    if (e.key === 'Backspace' && p && getSelection().isCollapsed) { const ts = K.tstyle(ed.o); const list = p.dataset.plist ?? ts.list; const r = getSelection().getRangeAt(0); if (list && list !== 'none' && r.startOffset === 0 && isAtStart(p, r)) { e.preventDefault(); if (+(p.dataset.lv || 0) > 0) p.dataset.lv = +p.dataset.lv - 1; else p.dataset.plist = 'none'; relist(ed.el, ed.o); } }
  };
  const isAtStart = (p, r) => { const pre = document.createRange(); pre.selectNodeContents(p); pre.setEnd(r.startContainer, r.startOffset); return pre.toString().length === 0; };
  const onPaste = (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); if (t) document.execCommand('insertText', false, t); };
  const moveCell = (dir) => { const ed = A.editing; const o = ed.o, c = ed.cell; const R = o.cells.length, C = o.cells[0].length; let i = c.r * C + c.c + dir; if (i >= R * C) { A.cmd.tableAddRow(true); i = R * C; } if (i < 0) return; const o2 = ed.o, cell = { r: Math.floor(i / C), c: i % C }; A.endEdit(true); setTimeout(() => A.startEdit(o2, null, true, cell), 0); };
  const curPara = () => { const s = getSelection(); if (!s.rangeCount || !A.editing) return null; let n = s.anchorNode; while (n && n !== A.editing.el) { if (n.tagName === 'P' && n.parentNode === A.editing.el) return n; n = n.parentNode; } return null; };
  const parasInSel = () => { const ed = A.editing; if (!ed) return []; const s = getSelection(); if (!s.rangeCount) return []; const r = s.getRangeAt(0); return [...ed.el.children].filter((p) => p.tagName === 'P' && r.intersectsNode(p)); };

  A.endEdit = (commit = true) => {
    const ed = A.editing; if (!ed) return; A.editing = null; const { o, el, box, cell } = ed;
    el.removeEventListener('input', onInput); el.removeEventListener('keydown', onKey); el.removeEventListener('paste', onPaste);
    box.classList.remove('editing-box'); el.contentEditable = 'false'; getSelection().removeAllRanges();
    if (commit) {
      const paras = K.parseParas(el, o); if (cell) cellOf(o, cell).paras = paras; else { o.paras = paras; }
      A.renderObj(o.id);
      if (o.type === 'table') { const t = A.elOf(o.id).querySelector('table'); [...t.rows].forEach((r, i) => { o.rh[i] = Math.max(o.rh[i], r.offsetHeight); }); o.h = o.rh.reduce((a, b) => a + b, 0); A.renderObj(o.id); }
      else fixAH(o);
      A.commit('Edit Text'); A.emit('edited');
    } else A.renderObj(o.id);
    A.overlay(); A.emit('select'); A.emit('editend');
  };
  document.addEventListener('pointerdown', (e) => { if (!A.editing) return; if (e.target.closest && (e.target.closest('#insp, .zk-pop, .zk-sheet, .zk-scrim, .zk-menubar') || A.editing.box.contains(e.target))) return; A.endEdit(true); }, true);
  document.addEventListener('selectionchange', () => { if (!A.editing) return; const s = getSelection(); if (s.rangeCount && A.editing.el.contains(s.anchorNode)) { A.savedRange = s.getRangeAt(0).cloneRange(); A.emit('fmtstate'); } });
  const restoreSel = () => { const ed = A.editing; if (!ed) return false; const s = getSelection(); if (!(s.rangeCount && ed.el.contains(s.anchorNode))) { ed.el.focus(); if (A.savedRange) { s.removeAllRanges(); s.addRange(A.savedRange); } } else if (document.activeElement !== ed.el) ed.el.focus(); return true; };
  A.restoreSel = restoreSel;

  // ---------- formatting ----------
  const RUN_CMD = { b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough', sup: 'superscript', sub: 'subscript' };
  const forEachRun = (o, fn) => { const each = (paras) => paras && paras.forEach((p) => p.runs.forEach(fn)); if (o.type === 'table') o.cells.forEach((r) => r.forEach((c) => each(c.paras))); else each(o.paras); };
  const targetsFmt = () => { const sel = A.selObjs().filter((o) => ['text', 'shape', 'table'].includes(o.type)); return sel; };
  const tsHolders = (o) => { if (o.type !== 'table') return [o]; if (A.cell && A.sel[0] === o.id) { const out = []; for (let r = A.cell.r1; r <= A.cell.r2; r++) for (let c = A.cell.c1; c <= A.cell.c2; c++) out.push(o.cells[r][c]); return out; } return [o, ...o.cells.flat()]; };
  A.fmt = {
    run(prop, value, token) {
      if (A.editing) {
        restoreSel(); const ed = A.editing; document.execCommand('styleWithCSS', false, true);
        if (RUN_CMD[prop]) { const on = document.queryCommandState(RUN_CMD[prop]); if (value === undefined || value !== on) document.execCommand(RUN_CMD[prop]); }
        else if (prop === 'c') { document.execCommand('foreColor', false, SENT_C); fixSent(ed.el, SENT_C, (sp) => { sp.style.color = K.col(A.deck, value); sp.dataset.c = token || value; }); }
        else if (prop === 'hl') { if (value) { document.execCommand('hiliteColor', false, SENT_H); fixSent(ed.el, SENT_H, (sp) => { sp.style.backgroundColor = K.col(A.deck, value); sp.dataset.hl = token || value; }, true); } else document.execCommand('hiliteColor', false, 'transparent'); }
        else if (prop === 'sz') { document.execCommand('fontSize', false, '7'); ed.el.querySelectorAll('span[style*="xxx-large"], font[size="7"]').forEach((sp) => { if (sp.tagName === 'FONT') { const n = document.createElement('span'); n.innerHTML = sp.innerHTML; sp.replaceWith(n); sp = n; } sp.style.fontSize = value + 'px'; }); }
        else if (prop === 'f') { document.execCommand('fontName', false, '__f__'); ed.el.querySelectorAll('span[style*="__f__"], font[face="__f__"]').forEach((sp) => { if (sp.tagName === 'FONT') { const n = document.createElement('span'); n.innerHTML = sp.innerHTML; sp.replaceWith(n); sp = n; } sp.style.fontFamily = K.fontCSS(A.deck, value); sp.dataset.f = value; }); }
        document.execCommand('styleWithCSS', false, false); onInput(); A.emit('fmtstate'); return;
      }
      for (const o of targetsFmt()) {
        const hs = tsHolders(o); hs.forEach((h) => { h.ts = h.ts || {}; if (value === undefined) h.ts[prop] = !(h.ts[prop] ?? K.tstyle(o)[prop]); else h.ts[prop] = value; });
        const paras = o.type === 'table' ? hs.filter((h) => h.paras).map((h) => h.paras) : [o.paras]; paras.forEach((ps) => ps && ps.forEach((p) => p.runs.forEach((r) => { delete r[prop]; if (prop === 'c') delete r.c; })));
        if (o.type === 'table' && hs[0] === o) { o.cells.flat().forEach((c) => { if (c.ts) delete c.ts[prop]; }); }
        A.renderObj(o.id); if (prop === 'sz' || prop === 'f') fixAH(o);
      }
      A.overlay(); A.commit('Format'); A.emit('edited');
    },
    para(prop, value) {
      if (A.editing) {
        restoreSel(); const ed = A.editing; const ps = parasInSel(); if (!ps.length) return;
        for (const p of ps) {
          if (prop === 'al') { p.dataset.pal = value; p.style.textAlign = value === 'j' ? 'justify' : value === 'c' ? 'center' : value === 'r' ? 'right' : 'left'; }
          else if (prop === 'list') { p.dataset.plist = value; if (value === 'none') delete p.dataset.lv; }
          else if (prop === 'ls') { p.dataset.pls = value; p.style.lineHeight = value; }
          else if (prop === 'sa') { p.dataset.psa = value; p.style.marginBottom = value + 'px'; } else if (prop === 'sb') { p.dataset.psb = value; p.style.marginTop = value + 'px'; }
          else if (prop === 'lv') { const lv = Math.max(0, Math.min(6, +(p.dataset.lv || 0) + value)); if (lv) p.dataset.lv = lv; else delete p.dataset.lv; }
        }
        relist(ed.el, ed.o); onInput(); A.emit('fmtstate'); return;
      }
      for (const o of targetsFmt()) {
        const hs = tsHolders(o);
        if (prop === 'lv') { const ps = o.type === 'table' ? [] : o.paras; ps.forEach((p) => (p.lv = Math.max(0, Math.min(6, (p.lv || 0) + value)))); }
        else { hs.forEach((h) => { h.ts = h.ts || {}; if (prop === 'al' && h !== o) h.al = value; h.ts[prop] = value; }); (o.type === 'table' ? hs.filter((h) => h.paras).map((h) => h.paras) : [o.paras]).forEach((ps) => ps && ps.forEach((p) => { delete p[prop]; })); if (prop === 'al' && o.type === 'table') hs.forEach((h) => { if (h !== o) delete h.al; }); }
        A.renderObj(o.id); fixAH(o);
      }
      A.overlay(); A.commit('Format'); A.emit('edited');
    },
    // current formatting values for the inspector
    state() {
      const o = A.selObjs().find((x) => ['text', 'shape', 'table'].includes(x.type)); if (!o) return null;
      let ts = K.tstyle(o); if (o.type === 'table' && A.cell) ts = Object.assign({}, ts, o.cells[A.cell.r1][A.cell.c1].ts || {});
      const st = { f: ts.f, sz: ts.sz, c: ts.c, b: !!ts.b, i: !!ts.i, u: !!ts.u, s: !!ts.s, al: ts.al, va: ts.va, ls: ts.ls, sa: ts.sa, list: ts.list || 'none', fit: ts.fit, cols: ts.cols, pad: ts.pad };
      if (A.editing) {
        const s = getSelection(); const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode); if (n && A.editing.el.contains(n)) { const cs = getComputedStyle(n); const fs = parseFloat(cs.fontSize); const fit = parseFloat(A.editing.el.parentElement.style.getPropertyValue('--fit')) || 1; st.sz = Math.round(fs / (n.closest('.tx') ? 1 : fit) * 10) / 10; st.b = +cs.fontWeight >= 600; st.i = cs.fontStyle === 'italic'; const td = cs.textDecorationLine; st.u = /underline/.test(td); st.s = /line-through/.test(td); st.c = n.dataset && n.dataset.c || (n.closest('[data-c]') && n.closest('[data-c]').dataset.c) || rgb2hex(cs.color); const p = curPara(); if (p) { st.al = p.dataset.pal || ts.al; st.list = p.dataset.plist ?? ts.list ?? 'none'; } }
      }
      return st;
    },
  };
  const fixSent = (root, sent, fn, bg) => {
    const re = (v) => v && rgb2hex(v) === sent;
    root.querySelectorAll('span[style], font').forEach((sp) => { if (sp.tagName === 'FONT' && rgb2hex(sp.color || '') === sent) { const n = document.createElement('span'); n.innerHTML = sp.innerHTML; sp.replaceWith(n); sp = n; fn(sp); return; } if (!bg && re(sp.style.color)) fn(sp); else if (bg && re(sp.style.backgroundColor)) fn(sp); });
  };
})();
