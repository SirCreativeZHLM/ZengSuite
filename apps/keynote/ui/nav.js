/* Slide navigator: live thumbnails, selection, sections/groups, spring drag-to-reorder. */
(() => {
  const K = window.K, A = window.A;
  const nav = document.getElementById('nav');
  A.navSel = new Set(); // slide ids
  const cache = new Map(); // slide id -> {key, ks}
  let lastAnchor = 0;

  // ---------- slide operations ----------
  const S = (A.slides = {});
  const deck = () => A.deck;
  S.go = (i, keepSel) => {
    const d = deck(); i = Math.max(0, Math.min(d.slides.length - 1, i)); if (A.editing) A.endEdit(true);
    const changed = A.cur !== i || A.mode !== 'slides'; A.mode = 'slides'; A.cur = i; if (!keepSel) { A.navSel = new Set([d.slides[i].id]); }
    if (changed) { A.sel = []; A.cell = null; A.live.crop = null; A.render(); } else A.overlay();
    A.emit('slide'); S.render(true);
  };
  S.add = (layoutId, at, opts = {}) => {
    const d = deck(); const cur = d.slides[A.cur]; const lay = layoutId || (cur && cur.layout === 'title' ? 'titleContent' : cur ? cur.layout : 'title');
    const s = K.newSlide(d, d.layouts.some((l) => l.id === lay) ? lay : 'titleContent'); const idx = at ?? A.cur + 1; if (cur && cur.indent && at == null) s.indent = cur.indent;
    if (cur && d.slides[A.cur] && at == null && cur.tr && cur.tr.type !== 'none') s.tr = K.clone(cur.tr); d.slides.splice(idx, 0, s); A.cur = idx; A.mode = 'slides'; A.navSel = new Set([s.id]); A.sel = []; A.render(); A.commit('New Slide'); A.emit('slide'); A.emit('edited'); S.render(true); return s;
  };
  S.dupSlide = (s) => { const c = K.clone(s); const idMap = new Map(); c.id = K.uid(); K.walk(c.objs, (o) => { const n = K.uid(); idMap.set(o.id, n); o.id = n; }); K.walk(c.objs, (o) => { if (o.type === 'conn') { if (o.a.id) o.a.id = idMap.get(o.a.id) || null; if (o.b.id) o.b.id = idMap.get(o.b.id) || null; } }); (c.builds || []).forEach((b) => { b.id = K.uid(); b.obj = idMap.get(b.obj) || b.obj; }); delete c.section; return c; };
  S.selectedIdx = () => deck().slides.map((s, i) => (A.navSel.has(s.id) ? i : -1)).filter((i) => i >= 0);
  S.duplicate = () => { const d = deck(); const idx = S.selectedIdx(); if (!idx.length) return; const copies = idx.map((i) => S.dupSlide(d.slides[i])); const at = Math.max(...idx) + 1; d.slides.splice(at, 0, ...copies); A.navSel = new Set(copies.map((c) => c.id)); A.cur = at; A.sel = []; A.render(); A.commit('Duplicate Slide'); A.emit('slide'); A.emit('edited'); S.render(true); };
  S.remove = () => {
    const d = deck(); const idx = S.selectedIdx(); if (!idx.length) return; const keep = d.slides.filter((_, i) => !idx.includes(i));
    const target = Math.min(Math.min(...idx), keep.length - 1); // section titles move with next slide
    idx.forEach((i) => { const s = d.slides[i]; if (s.section) { const nxt = d.slides.slice(i + 1).find((x) => !idx.includes(d.slides.indexOf(x))); if (nxt && !nxt.section) nxt.section = s.section; } });
    d.slides = keep; if (!d.slides.length) d.slides.push(K.newSlide(d, 'title')); A.cur = Math.max(0, target); A.navSel = new Set([d.slides[A.cur].id]); A.sel = []; A.render(); A.commit('Delete Slide'); A.emit('slide'); A.emit('edited'); S.render(true);
  };
  S.skip = () => { const d = deck(); const idx = S.selectedIdx(); const on = !idx.every((i) => d.slides[i].skip); idx.forEach((i) => (d.slides[i].skip = on || undefined)); A.commit(on ? 'Skip Slide' : 'Unskip Slide'); A.emit('edited'); S.render(); };
  S.indent = (dir) => { const d = deck(); S.selectedIdx().forEach((i) => { if (i === 0) return; const s = d.slides[i]; s.indent = dir > 0 ? 1 : 0; if (!s.indent) delete s.indent; }); A.commit('Group'); A.emit('edited'); S.render(); };
  S.section = async (i) => { const d = deck(); const s = d.slides[i ?? A.cur]; const n = await zk.prompt(s.section ? 'Rename Section' : 'New Section', s.section || 'Section', { ok: 'OK' }); if (n === null) return; if (n.trim()) s.section = n.trim(); else delete s.section; A.commit('Section'); A.emit('edited'); S.render(); };
  S.setLayout = (layoutId) => { const d = deck(); S.selectedIdx().forEach((i) => K.applyLayout(d, d.slides[i], layoutId)); A.render(); A.commit('Change Layout'); A.emit('edited'); A.emit('select'); S.render(); };
  S.toggleCollapse = (i) => { const s = deck().slides[i]; s.collapsed = !s.collapsed || undefined; S.render(); };
  S.children = (i) => { const d = deck(); const out = []; if (d.slides[i].indent) return out; for (let j = i + 1; j < d.slides.length && d.slides[j].indent; j++) out.push(j); return out; };

  // ---------- rendering ----------
  const metaKey = () => { const d = deck(); return JSON.stringify([d.size, d.theme, d.opts, d.layouts.length]) + (d._lk || ''); };
  const thumbW = () => Math.max(80, nav.clientWidth - 46);
  let rows = [];
  S.render = (scrollTo) => {
    const d = deck(); if (!d) return; const w = thumbW(), sc = w / d.size.w, h = d.size.h * sc; const mk = metaKey() + '|' + w; nav.replaceChildren(); rows = []; const ids = new Set();
    const layoutKey = {}; d.layouts.forEach((l) => (layoutKey[l.id] = JSON.stringify(l)));
    let hiddenUntil = -1, nextNum = 0;
    d.slides.forEach((s, i) => {
      ids.add(s.id);
      if (s.section) { const sec = document.createElement('div'); sec.className = 'nv-sec'; sec.textContent = s.section; sec.addEventListener('dblclick', () => S.section(i)); sec.addEventListener('contextmenu', (e) => ctx(e, i)); nav.append(sec); }
      if (!s.indent) hiddenUntil = s.collapsed ? i + S.children(i).length : -1; else if (i <= hiddenUntil) return;
      const row = document.createElement('div'); row.className = 'nv-row' + (A.navSel.has(s.id) ? ' sel' : '') + (s.skip ? ' skip' : '') + (s.indent ? ' sub' : '') + (document.activeElement === nav || A.focus === 'nav' ? '' : ' blur'); row.dataset.i = i; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', A.navSel.has(s.id));
      const tri = S.children(i).length ? (() => { const t = document.createElement('div'); t.className = 'nv-tri' + (s.collapsed ? ' c' : ''); t.append(zk.icon('chevron-down')); t.addEventListener('pointerdown', (e) => { e.stopPropagation(); S.toggleCollapse(i); }); return t; })() : null;
      const num = document.createElement('div'); num.className = 'nv-num'; num.textContent = i + 1; row.append(num);
      const th = document.createElement('div'); th.className = 'nv-thumb'; th.style.width = w + 'px'; th.style.height = h + 'px';
      const key = JSON.stringify(s) + (layoutKey[s.layout] || '') + mk; let c = cache.get(s.id);
      if (!c || c.key !== key) { const ks = K.renderSlide(d, s, { index: i }); ks.style.transform = `scale(${sc})`; c = { key, ks }; cache.set(s.id, c); th.append(ks); K.fit(ks); } else th.append(c.ks);
      row.append(th); if (tri) { tri.style.cssText = 'position:absolute;left:4px;top:6px'; row.append(tri); const n = S.children(i).length; if (s.collapsed) { const b = document.createElement('div'); b.className = 'nv-badge'; b.textContent = '+' + n; row.append(b); } }
      row.addEventListener('pointerdown', (e) => rowDown(e, i)); row.addEventListener('contextmenu', (e) => ctx(e, i)); nav.append(row); rows.push({ el: row, i });
    });
    for (const k of cache.keys()) if (!ids.has(k)) cache.delete(k);
    if (scrollTo) { const r = rows.find((x) => x.i === A.cur); if (r) { const top = r.el.offsetTop, bot = top + r.el.offsetHeight; if (top < nav.scrollTop) nav.scrollTop = top - 8; else if (bot > nav.scrollTop + nav.clientHeight) nav.scrollTop = bot - nav.clientHeight + 8; } }
  };
  // update only the current slide's thumbnail (live while editing)
  S.refreshCurrent = () => { const d = deck(); const s = d.slides[A.cur]; if (!s || A.mode !== 'slides') return; const r = rows.find((x) => x.i === A.cur); if (!r) return; const w = thumbW(), sc = w / d.size.w; const ks = K.renderSlide(d, s, { index: A.cur }); ks.style.transform = `scale(${sc})`; const th = r.el.querySelector('.nv-thumb'); th.replaceChildren(ks); K.fit(ks); cache.set(s.id, { key: '', ks }); };
  A.on('live', () => requestAnimationFrame(S.refreshCurrent));
  A.on('commit', () => { if (A.mode === 'layouts') { S.renderLayouts(); } else S.render(); });
  new ResizeObserver(() => { if (A.deck && A.mode === 'slides') { clearTimeout(S._rt); S._rt = setTimeout(() => S.render(), 60); } }).observe(nav);

  // ---------- layout list (master editor) ----------
  S.renderLayouts = () => {
    const d = deck(); const w = thumbW(), sc = w / d.size.w, h = d.size.h * sc; nav.replaceChildren();
    d.layouts.forEach((l, i) => {
      const row = document.createElement('div'); row.className = 'nv-row' + (i === A.layIdx ? ' sel' : ''); const num = document.createElement('div'); num.className = 'nv-num'; num.textContent = ''; row.append(num);
      const th = document.createElement('div'); th.className = 'nv-thumb'; th.style.width = w + 'px'; th.style.height = h + 'px'; const ps = K.layoutAsSlide(d, l); const ks = K.renderSlide(d, ps, { layoutMode: true, edit: true }); ks.style.transform = `scale(${sc})`; th.append(ks); K.fit(ks); row.append(th);
      const nm = document.createElement('div'); nm.style.cssText = 'position:absolute;left:36px;bottom:5px;font-size:10px;background:rgba(0,0,0,.55);color:#fff;padding:0 5px;border-radius:4px'; nm.textContent = l.name; row.append(nm);
      row.addEventListener('pointerdown', () => { A.layIdx = i; A.sel = []; A.render(); A.emit('slide'); S.renderLayouts(); }); row.addEventListener('contextmenu', (e) => layCtx(e, i)); nav.append(row);
    });
  };
  const layCtx = (e, i) => { e.preventDefault(); const d = deck(); zk.menu([
    { label: 'Duplicate Layout', run: () => { const l = K.clone(d.layouts[i]); l.id = K.uid(); l.kind = d.layouts[i].kind; l.name += ' Copy'; l.objs.forEach((o) => (o.id = K.uid())); d.layouts.splice(i + 1, 0, l); A.layIdx = i + 1; A.render(); A.commit('Duplicate Layout'); S.renderLayouts(); } },
    { label: 'Rename Layout…', run: async () => { const n = await zk.prompt('Rename Layout', d.layouts[i].name); if (n) { d.layouts[i].name = n; A.commit('Rename Layout'); S.renderLayouts(); } } },
    { label: 'Delete Layout', enabled: d.layouts.length > 1 && !d.slides.some((s) => s.layout === d.layouts[i].id), run: () => { d.layouts.splice(i, 1); A.layIdx = Math.max(0, i - 1); A.render(); A.commit('Delete Layout'); S.renderLayouts(); } },
  ], { x: e.clientX, y: e.clientY }); };

  // ---------- selection ----------
  const rowDown = (e, i) => {
    if (e.button === 2) { const s = deck().slides[i]; if (!A.navSel.has(s.id)) { A.navSel = new Set([s.id]); S.go(i, true); } return; }
    if (e.button !== 0) return; A.focus = 'nav'; nav.focus({ preventScroll: true }); const d = deck(); const s = d.slides[i];
    if (e.shiftKey) { const a = lastAnchor, [lo, hi] = [Math.min(a, i), Math.max(a, i)]; A.navSel = new Set(d.slides.slice(lo, hi + 1).map((x) => x.id)); S.go(i, true); return; }
    if (e.metaKey || e.ctrlKey) { if (A.navSel.has(s.id) && A.navSel.size > 1) A.navSel.delete(s.id); else A.navSel.add(s.id); lastAnchor = i; S.go(i, true); return; }
    lastAnchor = i; const wasSel = A.navSel.has(s.id); if (!wasSel) { A.navSel = new Set([s.id]); }
    const g = { x: e.clientX, y: e.clientY, i, started: false, pid: e.pointerId, wasSel };
    const mv = (ev) => { if (!g.started) { if (Math.abs(ev.clientY - g.y) < 5 && Math.abs(ev.clientX - g.x) < 5) return; g.started = true; startDrag(g, e); } g.move && g.move(ev); };
    const up = (ev) => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (!g.started) { if (g.wasSel && A.navSel.size > 1) A.navSel = new Set([s.id]); S.go(i, true); } else g.drop && g.drop(ev); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    if (!wasSel) S.go(i, true);
  };

  // ---------- drag reorder with springs ----------
  function startDrag(g, e0) {
    const d = deck(); const idx = S.selectedIdx(); const dragIdx = new Set(idx); idx.forEach((i) => S.children(i).forEach((c) => dragIdx.add(c)));
    const dragged = rows.filter((r) => dragIdx.has(r.i)); const others = rows.filter((r) => !dragIdx.has(r.i)); if (!dragged.length) return;
    const geo = (r) => ({ top: r.el.offsetTop, h: r.el.offsetHeight }); const og = new Map(rows.map((r) => [r, geo(r)]));
    const dragH = dragged.reduce((s, r) => s + og.get(r).h, 0); const firstTop = Math.min(...dragged.map((r) => og.get(r).top));
    const startScroll = nav.scrollTop; dragged.forEach((r) => { r.el.classList.add('dragging'); r.el.style.zIndex = 10; r.el.style.pointerEvents = 'none'; });
    const sp = new Map(); const set = (r, y) => { r.el.style.transform = `translateY(${y}px)`; r.y = y; };
    const shiftTo = (r, y) => { if (r.target === y) return; r.target = y; if (r.sp) { r.sp.retarget(y); return; } r.sp = zk.spring({ from: r.y || 0, to: y, response: 0.28, onUpdate: (v) => set(r, v), onDone: () => (r.sp = null) }); };
    let slot = 0; const drop = document.createElement('div'); drop.className = 'nv-drop'; nav.append(drop);
    const compute = (clientY) => {
      const nr = nav.getBoundingClientRect(); const y = clientY - nr.top + nav.scrollTop; const mid = (r) => og.get(r).top + og.get(r).h / 2;
      // slot = number of other rows whose mid is above the dragged group's centre
      const c = y - (e0.clientY - nr.top + startScroll) + firstTop + dragH / 2; slot = others.filter((r) => mid(r) < c).length;
      others.forEach((r, k) => { const orig = og.get(r).top; const before = orig < firstTop; shiftTo(r, before ? (k >= slot ? dragH : 0) : (k < slot ? -dragH : 0)); });
      const anchor = slot < others.length ? og.get(others[slot]).top + (others[slot].i > Math.max(...dragIdx) || others[slot].y ? 0 : 0) : (others.length ? og.get(others[others.length - 1]).top + og.get(others[others.length - 1]).h : 0);
      drop.style.top = Math.max(0, (slot < others.length ? og.get(others[slot]).top : anchor) + (others[slot] && og.get(others[slot]).top < firstTop ? 0 : (others[slot] ? -dragH : 0)) - 1) + 'px';
      drop.style.display = 'none';
    };
    g.move = (ev) => {
      const dy = ev.clientY - e0.clientY + (nav.scrollTop - startScroll); dragged.forEach((r) => { if (r.sp) { r.sp.stop(); r.sp = null; } set(r, dy); });
      const nr = nav.getBoundingClientRect(); if (ev.clientY < nr.top + 30) nav.scrollTop -= 8; else if (ev.clientY > nr.bottom - 30) nav.scrollTop += 8; compute(ev.clientY);
    };
    g.drop = () => {
      // final y offset for dragged rows: place at slot
      const target = slot < others.length ? og.get(others[slot]).top - (og.get(others[slot]).top < firstTop ? 0 : dragH) + (og.get(others[slot]).top < firstTop ? 0 : dragH) : 0;
      const finalTop = slot === 0 ? Math.min(...others.map((r) => og.get(r).top).concat([1e9])) : null;
      let destTop; if (slot < others.length) { const o = others[slot]; destTop = og.get(o).top < firstTop ? og.get(o).top : og.get(o).top - dragH; } else { const o = others[others.length - 1]; destTop = o ? (og.get(o).top < firstTop ? og.get(o).top + og.get(o).h : og.get(o).top + og.get(o).h - dragH) : firstTop; }
      let done = 0; const fin = () => { if (++done < dragged.length) return; commit(); };
      dragged.forEach((r, k) => { const cur = r.y || 0; const to = destTop - firstTop + dragged.slice(0, k).reduce((s, q) => s + og.get(q).h, 0) - (og.get(r).top - firstTop); r.sp = zk.spring({ from: cur, to, response: 0.22, onUpdate: (v) => set(r, v), onDone: fin }); });
      const commit = () => {
        const order = d.slides.map((s, i) => i); const movedIdx = [...dragIdx].sort((a, b) => a - b); const rest = order.filter((i) => !dragIdx.has(i));
        const insertAt = slot < others.length ? rest.indexOf(others[slot].i) : rest.length; const nw = [...rest.slice(0, insertAt), ...movedIdx, ...rest.slice(insertAt)];
        const moved = d.slides[A.cur]; const changedOrder = nw.some((v, k) => v !== k);
        if (changedOrder) { const old = d.slides; d.slides = nw.map((i) => old[i]); // first slide can't be indented
          if (d.slides[0].indent) delete d.slides[0].indent; A.cur = d.slides.indexOf(moved); A.commit('Move Slides'); A.emit('edited'); }
        S.render(); if (changedOrder) { A.emit('slide'); }
      };
    };
  }

  // ---------- context menu / keyboard ----------
  const ctx = (e, i) => {
    e.preventDefault(); const d = deck(); const s = d.slides[i]; if (!A.navSel.has(s.id)) { A.navSel = new Set([s.id]); S.go(i, true); }
    const multi = A.navSel.size > 1; zk.menu([
      { label: 'New Slide', run: () => S.add(null, i + 1) },
      { label: 'New Slide With Layout', submenu: d.layouts.map((l) => ({ label: l.name, run: () => S.add(l.id, i + 1) })) },
      { separator: true },
      { label: multi ? 'Duplicate Slides' : 'Duplicate Slide', run: S.duplicate }, { label: multi ? 'Delete Slides' : 'Delete Slide', run: S.remove },
      { separator: true },
      { label: s.skip ? 'Unskip Slide' : 'Skip Slide', run: S.skip },
      { label: 'Change Layout', submenu: d.layouts.map((l) => ({ label: l.name, checked: l.id === s.layout, run: () => S.setLayout(l.id) })) },
      { separator: true },
      { label: 'Indent Slide', enabled: i > 0 && !s.indent, run: () => S.indent(1) }, { label: 'Outdent Slide', enabled: !!s.indent, run: () => S.indent(-1) },
      { label: s.section ? 'Rename Section…' : 'Add Section…', run: () => S.section(i) }, ...(s.section ? [{ label: 'Remove Section', run: () => { delete s.section; A.commit('Section'); S.render(); } }] : []),
      { separator: true },
      { label: 'Copy', run: () => S.copy(false) }, { label: 'Cut', run: () => S.copy(true) }, { label: 'Paste', enabled: !!A.clipSlides, run: S.paste },
    ], { x: e.clientX, y: e.clientY });
  };
  S.copy = (cut) => { const d = deck(); A.clipSlides = S.selectedIdx().map((i) => K.clone(d.slides[i])); if (cut) S.remove(); };
  S.paste = () => { if (!A.clipSlides) return; const d = deck(); const copies = A.clipSlides.map((s) => S.dupSlide(s)); const at = Math.max(...S.selectedIdx(), A.cur) + 1; d.slides.splice(at, 0, ...copies); // media assumed present
    A.navSel = new Set(copies.map((c) => c.id)); A.cur = at; A.render(); A.commit('Paste Slides'); A.emit('slide'); A.emit('edited'); S.render(true); };
  A.on('navCopy', (e, cut) => { S.copy(cut); e.preventDefault(); e.clipboardData.setData('text/plain', 'slides'); });
  A.on('navPaste', () => S.paste());
  nav.addEventListener('focus', () => { A.focus = 'nav'; }); nav.addEventListener('pointerdown', () => { A.focus = 'nav'; });
  nav.addEventListener('keydown', (e) => {
    const d = deck(); const idx = S.selectedIdx(); const vis = rows.map((r) => r.i);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const pos = vis.indexOf(A.cur); const np = vis[Math.max(0, Math.min(vis.length - 1, pos + (e.key === 'ArrowUp' ? -1 : 1)))]; if (e.shiftKey) { const a = lastAnchor; A.navSel = new Set(d.slides.slice(Math.min(a, np), Math.max(a, np) + 1).map((x) => x.id)); S.go(np, true); } else { lastAnchor = np; S.go(np); } }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); S.remove(); }
    else if (e.key === 'Enter') { e.preventDefault(); S.add(null, Math.max(...idx) + 1); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); S.duplicate(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); A.navSel = new Set(d.slides.map((s) => s.id)); S.render(); }
    else if (e.key === 'Tab') { e.preventDefault(); S.indent(e.shiftKey ? -1 : 1); }
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#nav') && e.target.closest('#stage, #toolbar')) { A.focus = 'canvas'; } }, true);
})();
