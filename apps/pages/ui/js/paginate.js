/* ZengPages pagination: flows one contenteditable across separate sheets.
   Blocks that would cross a page boundary get a margin push; paragraphs / table rows that straddle a boundary get a transient
   spacer (float / spacer row) at the line / row where the page ends. All transient markup is stripped by P.cleanString. */
(() => {
  'use strict';
  const P = window.P, flow = P.flow, $ = P.$;
  const scroll = $('#scroll'), zoomer = $('#zoomer'), stack = $('#stack'), sheets = $('#sheets');
  P.zoom = 1; P.gapVer = P.gapVer || 0; P.layout = { pages: 1, recs: [], n: 1 };

  const numVar = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;
  const gapNat = (prev, el) => {
    if (el._gv === P.gapVer && el._gp === prev) return el._g;
    const g = Math.max(prev ? numVar(prev, '--sa') : 0, numVar(el, '--sb')); el._gv = P.gapVer; el._gp = prev; el._g = g; return g;
  };
  const isPara = (el) => /^(P|H[1-4])$/.test(el.tagName);

  /* ---------- units (lines of a paragraph / rows of a table), natural coordinates relative to the block top ---------- */
  const lineUnits = (el, sps) => {
    const z = P.zoom, er = el.getBoundingClientRect(); const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize); let lh = parseFloat(cs.lineHeight); if (isNaN(lh)) lh = fs * 1.2;
    const spi = (sps || []).filter((s) => s.tagName !== 'TR').map((s) => ({ y: (s.getBoundingClientRect().top - er.top) / z, h: s.offsetHeight }));
    const shiftAt = (t) => spi.reduce((a, s) => a + (t >= s.y + s.h - 2 ? s.h : 0), 0);
    const rects = []; const rg = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (n.classList.contains('pgsp') ? 2 : (n.tagName === 'IMG' || n.classList.contains('shp') || n.classList.contains('eq') ? 1 : 3)) : 1) });
    while (w.nextNode()) { const n = w.currentNode; if (n.nodeType === 3) { if (!n.nodeValue) continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.height > 0 && r.width >= 0) rects.push(r); } else { const r = n.getBoundingClientRect(); if (r.height > 0) rects.push(r); } }
    rects.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const r of rects) {
      const t0 = (r.top - er.top) / z, b0 = (r.bottom - er.top) / z, sh = shiftAt(t0), t = t0 - sh, b = b0 - sh; const L = lines[lines.length - 1];
      if (L && (t + b) / 2 < L.b - 1) { L.t = Math.min(L.t, t); L.b = Math.max(L.b, b); L.ct = Math.min(L.ct, r.top); } else lines.push({ t, b, ct: r.top });
    }
    if (!lines.length) return { units: [{ top: 0, bottom: er.height / z }], lines: [], lh };
    let prevB = 0; const units = lines.map((L) => { const hl = Math.max(0, (lh - (L.b - L.t)) / 2); const top = Math.max(prevB, L.t - hl), bottom = Math.max(top + 1, L.b + hl); prevB = bottom; return { top, bottom, ct: L.ct }; });
    return { units, lines: units, lh };
  };
  const rowUnits = (tb) => {
    const z = P.zoom, tr0 = tb.getBoundingClientRect(); let shift = 0; const units = [];
    for (const r of tb.rows) { const rr = r.getBoundingClientRect(); if (r.classList.contains('pgsp')) { shift += r.offsetHeight; continue; } units.push({ top: (rr.top - tr0.top) / z - shift, bottom: (rr.bottom - tr0.top) / z - shift }); }
    return { units };
  };
  /** DOM position (node, offset) of the first character of the line whose client-top is ct */
  const lineStart = (el, ct) => {
    const rg = document.createRange(); const eps = 1;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (n.classList.contains('pgsp') ? 2 : (n.tagName === 'IMG' || n.classList.contains('shp') || n.classList.contains('eq') ? 1 : 3)) : 1) });
    const topOf = (t, o) => { for (let k = 0; k < 6 && o + k < t.nodeValue.length; k++) { rg.setStart(t, o + k); rg.setEnd(t, o + k + 1); for (const r of rg.getClientRects()) if (r.height > 0) return r.top; } return Infinity; };
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 1) { if (n.getBoundingClientRect().top >= ct - eps) return [n.parentNode, [...n.parentNode.childNodes].indexOf(n)]; continue; }
      if (!n.nodeValue) continue; rg.selectNodeContents(n); const rs = [...rg.getClientRects()].filter((r) => r.height > 0); if (!rs.length) continue;
      const last = rs[rs.length - 1]; if (last.top < ct - eps) continue;
      if (rs[0].top >= ct - eps) return [n, 0];
      let lo = 1, hi = n.nodeValue.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (topOf(n, m) >= ct - eps) hi = m; else lo = m + 1; }
      return [n, lo];
    }
    return null;
  };

  /** plan splits for a block that crosses a page limit. returns {push:true} or {splits:[{k,h,at}]} */
  const planSplit = (el, kind, units, top, hn, g, atPageTop, sps) => {
    const stride = g.stride, Hb = g.hb; let pg = Math.floor((top + 0.01) / stride); let limit = pg * stride + Hb;
    const splits = []; let shift = 0, j = 0; const n = units.length;
    for (let guard = 0; guard < 400; guard++) {
      let k = -1; for (let q = j; q < n; q++) if (top + units[q].bottom + shift > limit + 0.5) { k = q; break; }
      if (k < 0) break;
      if (k === j) { if (splits.length === 0 && !atPageTop && j === 0) return { push: true }; break; }
      if (kind === 'p' && splits.length === 0 && k < 2 && n >= 2 && !atPageTop) return { push: true }; // orphan control
      splits.push({ k, y: units[k].top, ct: units[k].ct, pg }); const h = (pg + 1) * stride - (top + units[k].top + shift); splits[splits.length - 1].h = h; shift += h; pg++; limit = pg * stride + Hb; j = k;
    }
    if (kind === 'p' && splits.length && n >= 4) { // widow control
      const L = splits[splits.length - 1]; const prevK = splits.length > 1 ? splits[splits.length - 2].k : 0;
      if (n - L.k === 1 && L.k - prevK >= 3) { const k = L.k - 1; const sh = splits.slice(0, -1).reduce((a, s) => a + s.h, 0); L.k = k; L.y = units[k].top; L.ct = units[k].ct; L.h = (L.pg + 1) * stride - (top + units[k].top + sh); }
    }
    if (!splits.length) return { splits: [] };
    return { splits };
  };

  /* ---------- apply plan to DOM ---------- */
  const mkSpacer = (el, h) => {
    if (el.tagName === 'TABLE') { const tr = document.createElement('tr'); tr.className = 'pgsp'; tr.setAttribute('contenteditable', 'false'); const td = document.createElement('td'); td.colSpan = 99; td.style.height = h + 'px'; tr.append(td); return tr; }
    const s = document.createElement('span'); s.className = 'pgsp'; s.setAttribute('contenteditable', 'false'); s.style.height = h + 'px'; return s;
  };
  const rowIndexOf = (tb, sp) => { let i = 0; for (const r of tb.rows) { if (r === sp) return i; if (!r.classList.contains('pgsp')) i++; } return i; };
  const applySplits = (el, splits, old, units) => {
    const isT = el.tagName === 'TABLE';
    const oldKeys = old.map((s) => (isT ? rowIndexOf(el, s) : P.lo(el, s.parentNode, [...s.parentNode.childNodes].indexOf(s))));
    if (splits.length === old.length && splits.every((s, i) => s.key === oldKeys[i])) { splits.forEach((s, i) => { if (Math.abs(old[i].offsetHeight - s.h) > 0.4) (isT ? old[i].firstChild : old[i]).style.height = s.h + 'px'; }); return; }
    const par = new Set(old.map((s) => s.parentNode)); old.forEach((s) => s.remove()); par.forEach((p) => p.normalize && p.normalize());
    for (const s of splits) {
      const sp = mkSpacer(el, s.h);
      if (isT) { const rows = [...el.rows].filter((r) => !r.classList.contains('pgsp')); const r = rows[s.key]; if (r) r.parentNode.insertBefore(sp, r); }
      else { const [node, off] = P.resolve(el, s.key); if (node.nodeType === 3) { if (off === 0) node.parentNode.insertBefore(sp, node); else if (off >= node.nodeValue.length) node.parentNode.insertBefore(sp, node.nextSibling); else { const t = node.splitText(off); t.parentNode.insertBefore(sp, t); } } else node.insertBefore(sp, node.childNodes[off] || null); }
    }
  };

  /* ---------- main pass ---------- */
  const resetAll = (kids) => {
    for (const k of kids) { if (k.hasAttribute('data-pg')) { k.removeAttribute('data-pg'); k.style.removeProperty('--pg'); } k.style.removeProperty('--colx'); k.style.removeProperty('--colw'); if (!k.getAttribute('style')) k.removeAttribute('style'); }
    for (const s of [...flow.querySelectorAll('.pgsp')]) { const p = s.parentNode; s.remove(); p.normalize && p.normalize(); }
  };
  const setFlowGeom = (g, N) => {
    flow.classList.toggle('cols', N > 1);
    const cw = N > 1 ? (g.cw - P.S.colGap * (N - 1)) / N : g.cw; flow.style.setProperty('--colwidth', cw + 'px');
  };

  P.paginate = (o = {}) => {
    if (P.isComposing && P.isComposing()) return;
    const g = P.geom(), N = Math.max(1, Math.min(3, P.S.cols || 1)); setFlowGeom(g, N);
    const kids = [...flow.children]; const n = kids.length;
    if (N !== P._mode || o.reset) { resetAll(kids); P._mode = N; P.gapVer++; }
    const recs = N > 1 ? layoutCols(kids, g, N) : layoutSingle(kids, g);
    const last = recs[recs.length - 1]; let pages = 1;
    if (last) pages = Math.max(1, Math.floor((last.top + 0.01) / g.stride) + 1, Math.floor((last.top + last.h - 1) / g.stride) + 1);
    if (N > 1) pages = Math.max(1, ...recs.map((r) => r.page + 1));
    const prevPages = P.layout.pages; P.layout = { pages, recs, n, N, g };
    P._n = n; for (const k of kids) k._h = k.offsetHeight;
    flow.style.minHeight = pages * g.stride - P.GAP - g.mt + 'px';
    P.renderSheets(prevPages !== pages || o.sheets); P.sizeStack();
    P.onPaginated && P.onPaginated(pages);
  };

  function layoutSingle(kids, g) {
    const n = kids.length, stride = g.stride, Hb = g.hb; const sps = new Map();
    for (const s of flow.querySelectorAll('.pgsp')) { const b = P.blockOf(s); if (b) (sps.get(b) || sps.set(b, []).get(b)).push(s); }
    const tops = new Array(n), hs = new Array(n), spH = new Array(n), oldPush = new Array(n);
    for (let i = 0; i < n; i++) {
      const el = kids[i]; tops[i] = el.offsetTop; hs[i] = el.offsetHeight; const sl = sps.get(el); spH[i] = sl ? sl.reduce((a, s) => a + s.offsetHeight, 0) : 0;
      oldPush[i] = el.hasAttribute('data-pg') ? parseFloat(el.style.getPropertyValue('--pg')) || 0 : 0;
    }
    let prevBottomNew = 0, prevOld = 0, forceNext = false; const recs = new Array(n); const plans = new Array(n);
    for (let i = 0; i < n; i++) {
      const el = kids[i]; const hn = hs[i] - spH[i];
      const nat = oldPush[i] > 0 ? prevBottomNew + (i ? gapNat(kids[i - 1], el) : numVar(el, '--sb')) : tops[i] + (prevBottomNew - prevOld);
      let top = nat, push = 0, splitPlan = null; const pg = Math.floor((top + 0.01) / stride); const atPageTop = top - pg * stride < 1; let limit = pg * stride + Hb;
      const forced = forceNext || el.hasAttribute('data-pbb');
      let must = false;
      if (forced) must = !atPageTop;
      else if (top >= limit - 0.5 && hn > 0) must = !atPageTop;
      else if (top + hn > limit + 0.5) {
        const kind = isPara(el) ? 'p' : el.tagName === 'TABLE' ? 't' : null;
        if (kind) { const U = kind === 'p' ? lineUnits(el, sps.get(el)) : rowUnits(el); const plan = planSplit(el, kind, U.units, top, hn, g, atPageTop, sps.get(el)); if (plan.push) must = true; else if (plan.splits.length) { splitPlan = plan.splits; splitPlan.forEach((s) => { s.key = null; s.U = U; }); } }
        else must = !atPageTop;
      } else if (el.hasAttribute('data-kwn') && i + 1 < n) {
        const nx = kids[i + 1]; const nh = Math.min(hs[i + 1] - (sps.get(nx) ? sps.get(nx).reduce((a, s) => a + s.offsetHeight, 0) : 0), 44);
        if (top + hn + gapNat(el, nx) + nh > limit + 0.5 && !atPageTop && !(nx.classList.contains('pgbreak'))) must = true;
      }
      if (must) { const nt = (pg + 1) * stride; push = nt - prevBottomNew; top = nt; if (hn > 0 && top + hn > nt + Hb + 0.5 && isPara(el) || el.tagName === 'TABLE' && top + hn > nt + Hb + 0.5) { const U = isPara(el) ? lineUnits(el, sps.get(el)) : rowUnits(el); const plan = planSplit(el, isPara(el) ? 'p' : 't', U.units, top, hn, g, true, sps.get(el)); if (plan.splits && plan.splits.length) { splitPlan = plan.splits; splitPlan.forEach((s) => { s.U = U; }); } } }
      let extra = 0; if (splitPlan) { extra = splitPlan.reduce((a, s) => a + s.h, 0); }
      plans[i] = { push, splits: splitPlan, el }; recs[i] = { el, top, h: hn + extra, page: Math.floor((top + 0.01) / stride) };
      if (!el._g0) el._g0 = 0;
      prevBottomNew = top + hn + extra; prevOld = tops[i] + hs[i]; forceNext = el.classList.contains('pgbreak');
    }
    // resolve split positions (needs layout still in the old state: do this before any write)
    for (let i = 0; i < n; i++) {
      const pl = plans[i]; if (!pl.splits) continue; const el = pl.el;
      if (el.tagName === 'TABLE') pl.splits.forEach((s) => (s.key = s.k));
      else { const ok = []; for (const s of pl.splits) { const pos = lineStart(el, s.ct); if (!pos) continue; s.key = P.lo(el, pos[0], pos[1]); ok.push(s); } pl.splits = ok; }
    }
    // writes
    for (let i = 0; i < n; i++) {
      const pl = plans[i], el = pl.el;
      if (pl.push > 0) { const v = Math.round(pl.push * 100) / 100; if (oldPush[i] !== v) { el.setAttribute('data-pg', '1'); el.style.setProperty('--pg', v + 'px'); } }
      else if (el.hasAttribute('data-pg')) { el.removeAttribute('data-pg'); el.style.removeProperty('--pg'); if (!el.getAttribute('style')) el.removeAttribute('style'); }
      const old = sps.get(el) || [];
      if (pl.splits && pl.splits.length) applySplits(el, pl.splits, old);
      else if (old.length) { const par = new Set(old.map((s) => s.parentNode)); old.forEach((s) => s.remove()); par.forEach((p) => p.normalize && p.normalize()); }
    }
    return recs;
  }

  function layoutCols(kids, g, N) {
    const n = kids.length, stride = g.stride, Hb = g.hb, gap = P.S.colGap; const colW = (g.cw - gap * (N - 1)) / N;
    const hs = kids.map((k) => k.offsetHeight); const recs = []; let slot = 0, y = 0, first = true, prevTop = 0, prevH = 0, prev = null, forceNext = null;
    for (let i = 0; i < n; i++) {
      const el = kids[i], h = hs[i]; let gp = first ? 0 : gapNat(prev, el);
      if (forceNext === 'page') { slot = (Math.floor(slot / N) + 1) * N; y = 0; gp = 0; } else if (forceNext === 'col') { slot++; y = 0; gp = 0; } else if (el.hasAttribute('data-pbb') && y > 0) { slot = (Math.floor(slot / N) + 1) * N; y = 0; gp = 0; }
      else if (y > 0 && y + gp + h > Hb + 0.5) { slot++; y = 0; gp = 0; }
      const page = Math.floor(slot / N), col = slot % N; const top = page * stride + y + gp; const x = col * (colW + gap);
      const P_ = Math.round((top - (prevTop + prevH)) * 100) / 100; el.setAttribute('data-pg', '1'); el.style.setProperty('--pg', P_ + 'px'); el.style.setProperty('--colx', x + 'px'); el.style.setProperty('--colw', colW + 'px');
      recs.push({ el, top, h, page, x, w: colW }); y += gp + h; first = false; prev = el; prevTop = top; prevH = h;
      forceNext = el.classList.contains('pgbreak') ? (el.hasAttribute('data-cb') ? 'col' : 'page') : null;
    }
    return recs;
  }

  let rafId = 0, pending = null;
  P.schedulePaginate = (o = {}) => {
    if (o.typing && !P._forceFull) { // fast path: typing that didn't change any block height
      const s = getSelection(); const b = s.rangeCount ? P.blockOf(s.anchorNode) : null;
      if (b && b._h === b.offsetHeight && flow.children.length === P._n && !b.querySelector('.pgsp')) { P.refreshSoon && P.refreshSoon(); return; }
    }
    pending = Object.assign(pending || {}, o); P._forceFull = false;
    if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; const p = pending; pending = null; P.paginate(p); if (p && p.typing) P.ensureCaretVisible(); });
  };
  P.ensureCaretVisible = () => {
    const s = getSelection(); if (!s.rangeCount || !flow.contains(s.anchorNode)) return; const r = s.getRangeAt(0).cloneRange(); r.collapse(false);
    let rect = r.getClientRects()[0]; if (!rect) { const e = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode; rect = e.getBoundingClientRect(); }
    const sr = scroll.getBoundingClientRect(); if (rect.bottom > sr.bottom - 24) scroll.scrollTop += rect.bottom - sr.bottom + 60; else if (rect.top < sr.top + 8) scroll.scrollTop -= sr.top - rect.top + 60;
  };

  /* ---------- sheets, headers & footers ---------- */
  const fieldVal = (f, pg, total) => ({ page: String(pg), pages: String(total), date: new Date().toLocaleDateString(), title: (P.docTitle && P.docTitle()) || '' }[f] ?? '');
  const fillHF = (el, tpl, pg, total) => { el.innerHTML = tpl || ''; for (const f of el.querySelectorAll('.fld')) f.setAttribute('data-v', fieldVal(f.getAttribute('data-f'), pg, total)); };
  P.renderSheets = (rebuild) => {
    const g = P.geom(), total = P.layout.pages, S = P.S;
    if (rebuild || sheets.children.length !== total) {
      while (sheets.children.length > total) sheets.lastChild.remove();
      while (sheets.children.length < total) { const sh = document.createElement('div'); sh.className = 'sheet'; sh.innerHTML = '<div class="hf hdr" data-hf="hdr"></div><div class="hf ftr" data-hf="ftr"></div>'; sheets.append(sh); }
    }
    [...sheets.children].forEach((sh, i) => {
      sh.style.top = i * g.stride + 'px'; sh.style.width = g.w + 'px'; sh.style.height = g.h + 'px'; sh.dataset.n = i;
      const first = S.diffFirst && i === 0; const hd = sh.firstChild, ft = sh.lastChild;
      const num = S.pageStart + i; const totalN = S.pageStart + total - 1;
      if (P.hfActive && P.hfActive.sheet === i) return;
      const ht = first ? S.hdr.first : S.hdr.def, ftt = first ? S.ftr.first : S.ftr.def;
      if (hd._t !== ht + '|' + num + '|' + totalN) { fillHF(hd, ht, num, totalN); hd._t = ht + '|' + num + '|' + totalN; }
      if (ft._t !== ftt + '|' + num + '|' + totalN) { fillHF(ft, ftt, num, totalN); ft._t = ftt + '|' + num + '|' + totalN; }
      hd.dataset.empty = !hd.textContent.trim() && !hd.querySelector('.fld,img') ? '1' : ''; ft.dataset.empty = !ft.textContent.trim() && !ft.querySelector('.fld,img') ? '1' : '';
    });
  };
  P.sizeStack = () => {
    const g = P.geom(), total = P.layout.pages, z = P.zoom; const H = total * g.stride - P.GAP;
    stack.style.width = g.w + 'px'; stack.style.height = H + 'px'; stack.style.transform = `scale(${z})`;
    zoomer.style.width = g.w * z + 'px'; zoomer.style.height = H * z + 'px';
  };
  P.hfActive = null;
  P.editHF = (which, sheetIdx) => {
    P.endHF(); const sh = sheets.children[sheetIdx]; if (!sh) return; const S = P.S; const first = S.diffFirst && sheetIdx === 0; const key = first ? 'first' : 'def';
    const el = which === 'hdr' ? sh.firstChild : sh.lastChild; P.hfActive = { which, sheet: sheetIdx, key, el };
    el.innerHTML = S[which][key] || '<p><br></p>'; el.classList.add('editing'); el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true');
    for (const f of el.querySelectorAll('.fld')) { f.setAttribute('contenteditable', 'false'); f.setAttribute('data-v', '‹' + f.dataset.f + '›'); }
    P.hfEl = el; if (!el.firstChild) el.append(P.emptyP()); P.placeCaretIn(el.firstChild, true); el.focus();
    el.oninput = () => { const c = el.cloneNode(true); for (const f of c.querySelectorAll('.fld')) { f.removeAttribute('data-v'); f.setAttribute('contenteditable', 'false'); } const h = c.innerHTML.replace(/ data-v="[^"]*"/g, ''); S[which][key] = /^(<p>(<br>)?<\/p>)?$/.test(h) ? '' : h; P.markDirty(); P.hfDeb && P.hfDeb(); };
    el.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); P.endHF(); P.focus(); } };
    el.onblur = () => setTimeout(() => { if (P.hfActive && P.hfActive.el === el && !el.contains(document.activeElement) && !document.activeElement.closest?.('.zk-pop,.zk-scrim,#fmtbar,#right,#tb')) P.endHF(); }, 120);
    const hide = P.$('#hfhint'); void hide; P.refreshSoon && P.refreshSoon();
  };
  P.hfDeb = zk.debounce(() => { const a = P.hfActive; P.S.hdr._v = (P.S.hdr._v || 0); P.renderSheets(false); void a; }, 150);
  P.endHF = () => {
    const a = P.hfActive; if (!a) return; P.hfActive = null; P.hfEl = null; a.el.removeAttribute('contenteditable'); a.el.classList.remove('editing'); a.el.oninput = a.el.onkeydown = a.el.onblur = null;
    a.el._t = null; P.renderSheets(false); P.refreshSoon && P.refreshSoon();
  };
  sheets.addEventListener('dblclick', (e) => { const hf = e.target.closest('.hf'); if (!hf || hf.classList.contains('editing')) return; const sh = hf.parentNode; P.editHF(hf.dataset.hf, +sh.dataset.n); });
  document.addEventListener('pointerdown', (e) => { if (P.hfActive && !P.hfActive.el.contains(e.target) && !e.target.closest('.zk-pop,.zk-scrim,#fmtbar,#right,#tb,.zk-menubar')) P.endHF(); }, true);
  P.insertField = (f) => {
    const a = P.hfActive; if (!a) { zk.toast('Double-click a header or footer to edit it first'); return; }
    a.el.focus(); document.execCommand('insertHTML', false, `<span class="fld" data-f="${f}" data-v="‹${f}›" contenteditable="false"></span>&#8203;`); a.el.oninput();
  };

  /* ---------- zoom ---------- */
  P.setZoom = (z, anchor) => {
    z = Math.max(0.25, Math.min(4, z)); if (Math.abs(z - P.zoom) < 0.0005) return;
    const sr = scroll.getBoundingClientRect(); const ax = anchor ? anchor.x : sr.left + sr.width / 2, ay = anchor ? anchor.y : sr.top + sr.height / 2;
    const ox = (scroll.scrollLeft + ax - sr.left) / P.zoom, oy = (scroll.scrollTop + ay - sr.top) / P.zoom;
    P.zoom = z; P.zoomMode = null; P.sizeStack(); scroll.scrollLeft = ox * z - (ax - sr.left); scroll.scrollTop = oy * z - (ay - sr.top); P.onZoom && P.onZoom(z);
  };
  P.fitWidth = () => { const g = P.geom(); P.zoomMode = 'width'; const z = Math.max(0.25, Math.min(4, (scroll.clientWidth - 48) / g.w)); P.zoom = z; P.sizeStack(); P.onZoom && P.onZoom(z); };
  P.fitPage = () => { const g = P.geom(); P.zoomMode = 'page'; const z = Math.max(0.25, Math.min(4, Math.min((scroll.clientWidth - 48) / g.w, (scroll.clientHeight - 40) / g.h))); P.zoom = z; P.sizeStack(); scroll.scrollTop = P.currentPage() * g.stride * z; P.onZoom && P.onZoom(z); };
  new ResizeObserver(() => { if (P.zoomMode === 'width') P.fitWidth(); else if (P.zoomMode === 'page') P.fitPage(); }).observe(scroll);
  scroll.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); P.setZoom(P.zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY }); } }, { passive: false });
  let gz = 1; addEventListener('gesturestart', (e) => { e.preventDefault(); gz = P.zoom; }); addEventListener('gesturechange', (e) => { e.preventDefault(); P.setZoom(gz * e.scale, { x: e.clientX || scroll.getBoundingClientRect().left + scroll.clientWidth / 2, y: e.clientY || scroll.getBoundingClientRect().top + scroll.clientHeight / 2 }); });
  addEventListener('gestureend', (e) => e.preventDefault());

  P.currentPage = () => { const g = P.geom(); const sr = scroll.getBoundingClientRect(); const mid = (scroll.scrollTop + sr.height * 0.4) / P.zoom - 28; return Math.max(0, Math.min(P.layout.pages - 1, Math.floor(mid / g.stride))); };
  P.pageOfEl = (el) => { const b = P.blockOf(el); if (!b) return 0; return Math.max(0, Math.floor((b.offsetTop + 1) / P.geom().stride)); };
  P.scrollToPage = (i) => { const g = P.geom(); scroll.scrollTo({ top: i * g.stride * P.zoom, behavior: zk.reducedMotion() ? 'auto' : 'smooth' }); };
  P.scrollToEl = (el) => { const r = el.getBoundingClientRect(), sr = scroll.getBoundingClientRect(); scroll.scrollTo({ top: scroll.scrollTop + r.top - sr.top - sr.height * 0.25, behavior: zk.reducedMotion() ? 'auto' : 'smooth' }); };

  /* ---------- page clones: print + thumbnails ---------- */
  P.renderPage = (pi, { forPrint = false } = {}) => {
    const g = P.layout.g || P.geom(), S = P.S, total = P.layout.pages; const pp = document.createElement('div'); pp.className = 'pp'; pp.style.width = g.w + 'px'; pp.style.height = g.h + 'px';
    const first = S.diffFirst && pi === 0; const num = S.pageStart + pi, totalN = S.pageStart + total - 1;
    const hd = document.createElement('div'); hd.className = 'hf hdr'; const ft = document.createElement('div'); ft.className = 'hf ftr'; fillHF(hd, first ? S.hdr.first : S.hdr.def, num, totalN); fillHF(ft, first ? S.ftr.first : S.ftr.def, num, totalN);
    const body = document.createElement('div'); body.className = 'pbody pgdoc'; const top0 = pi * g.stride, bot0 = top0 + g.hb;
    const N = P.layout.N || 1;
    for (const r of P.layout.recs) {
      if (!(r.top < bot0 + 0.5 && r.top + r.h > top0 + 0.5)) continue; if (r.el.classList.contains('pgbreak')) continue;
      if (N === 1 ? (r.page > pi && r.top >= bot0) : r.page !== pi) continue;
      const c = r.el.cloneNode(true); c.removeAttribute('data-pg'); c.removeAttribute('contenteditable'); c.style.removeProperty('--pg'); c.style.removeProperty('--colx'); c.style.removeProperty('--colw');
      c.classList.add('pclone'); c.style.top = r.top - top0 + 'px';
      if (N > 1) { c.style.left = r.x + 'px'; c.style.width = r.w + 'px'; c.style.setProperty('--colx', '0px'); c.style.setProperty('--colwidth', r.w + 'px'); } else { c.style.left = '0'; c.style.right = '0'; }
      body.append(c);
    }
    pp.append(hd, body, ft); void forPrint; return pp;
  };
  P.buildPrint = () => {
    const root = $('#printroot'); root.replaceChildren(); const frag = document.createDocumentFragment();
    for (let i = 0; i < P.layout.pages; i++) frag.append(P.renderPage(i, { forPrint: true })); root.append(frag);
  };
  P.print = () => { P.endHF(); P.paginate({}); P.buildPrint(); setTimeout(() => zeng.print(), 30); };
  addEventListener('afterprint', () => { $('#printroot').replaceChildren(); });
  addEventListener('beforeprint', () => { if (!$('#printroot').firstChild) { P.paginate({}); P.buildPrint(); } });

  // images/fonts loading late change heights
  flow.addEventListener('load', () => P.schedulePaginate({}), true);
  addEventListener('resize', () => { P.refreshSoon && P.refreshSoon(); });
})();
