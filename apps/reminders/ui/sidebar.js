/* Sidebar: smart-list tiles, user lists with groups (drag to reorder), tags, search. */
(function () {
  const A = ZR.A, V = ZR.views, h = zk.el, ST = ZR.store, D = ZR.dates; const side = A.$('#side');
  const search = h('.zr-search', zk.icon('search'), h('input.selectable', { id: 'q', type: 'search', placeholder: 'Search', 'aria-label': 'Search reminders', autocomplete: 'off', spellcheck: false }), h('button.zk-btn.icon.clr', { type: 'button', 'aria-label': 'Clear search', onclick: () => clearSearch() }, zk.icon('x')));
  const dyn = h('div', { id: 'side-dyn', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }); side.append(search, dyn);
  const qi = search.querySelector('input');
  const clearSearch = () => { qi.value = ''; search.classList.remove('has'); if (A.view.k === 'search') { A.view = A.prevView || { k: 'smart', id: 'today' }; A.prevView = null; A.sel.clear(); A.render(true); } };
  qi.addEventListener('input', () => { const v = qi.value; search.classList.toggle('has', !!v); if (!v) return clearSearch(); if (A.view.k !== 'search') { A.prevView = A.view; A.sel.clear(); } A.view = { k: 'search', q: v }; A.render(true); });
  qi.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); clearSearch(); qi.blur(); } else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); qi.blur(); const f = A.order[0]; if (f) A.select(f); } });
  A.focusSearch = () => { A.showSide(true); qi.focus(); qi.select(); };
  let renaming = null;

  function render() {
    if (renaming || A.sideDragging) return; const S = A.S(); const c = V.counts(S, A.now); const frag = document.createDocumentFragment();
    const tiles = h('.zr-tiles'); V.SMART.forEach((s) => tiles.append(h('button.zr-tile' + (A.view.k === 'smart' && A.view.id === s.id ? '.sel' : ''), { type: 'button', 'data-smart': s.id, style: { '--tc': s.color }, 'aria-label': `${s.name}, ${c.smart[s.id]}` }, h('.gl', zk.icon(s.icon)), h('.top', h('.n', String(c.smart[s.id]))), h('.nm', s.name))));
    frag.append(tiles);
    frag.append(h('.zr-sec', 'My Lists', h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Add list or group', onclick: (e) => addMenu(e.currentTarget) }, zk.icon('plus'))));
    const lists = h('.zr-lists', { id: 'lists', role: 'list' }); const byId = Object.fromEntries(S.lists.map((l) => [l.id, l]));
    const li = (l, g) => h('.zr-li' + (g ? '.in-group' : '') + (A.view.k === 'list' && A.view.id === l.id ? '.sel' : ''), { 'data-kind': 'l', 'data-id': l.id, 'data-group': g || '', role: 'listitem', tabindex: 0, style: { '--lc': l.color } }, h('.ic', zk.icon(l.icon || 'list')), h('span.nm', l.name), h('span.ct', c.lists[l.id] ? String(c.lists[l.id]) : ''));
    S.side.forEach((k) => {
      if (k[0] === 'l') { const l = byId[k.slice(2)]; l && lists.append(li(l)); return; }
      const g = S.groups.find((x) => x.id === k.slice(2)); if (!g) return;
      lists.append(h('.zr-li.group' + (g.collapsed ? '.collapsed' : ''), { 'data-kind': 'g', 'data-id': g.id, role: 'listitem', tabindex: 0 }, h('.gic', A.cls(zk.icon('chevron-down', 13), 'zi chev')), h('.gic', zk.icon('folder', 17)), h('span.nm', g.name), h('span.ct', String(g.lists.reduce((n, id) => n + (c.lists[id] || 0), 0) || ''))));
      if (!g.collapsed) g.lists.forEach((id) => { const l = byId[id]; if (l) { const e = li(l, g.id); e.dataset.parent = g.id; lists.append(e); } });
    });
    frag.append(lists);
    const tags = Object.keys(c.tags).sort((a, b) => a.localeCompare(b));
    if (tags.length) { frag.append(h('.zr-sec', 'Tags')); const box = h('.zr-tags'); const act = A.view.k === 'tag' ? A.view.tags : []; tags.forEach((t) => box.append(h('button.zr-tagchip' + (act.includes(t) ? '.on' : ''), { type: 'button', 'data-tag': t, title: `${c.tags[t]} open` }, '#' + t))); frag.append(box); }
    frag.append(h('.zr-sidefoot', h('button.zk-btn', { type: 'button', onclick: () => A.newList() }, zk.icon('plus-circle'), 'New List'), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'New group', title: 'New Group', onclick: () => A.newGroup() }, zk.icon('folder-plus'))));
    const st = dyn.scrollTop; dyn.replaceChildren(frag); side.scrollTop = st;
  }
  A.renderers.sidebar = render;

  function addMenu(anchor) { const T = A.S().templates; zk.menu([{ label: 'New List…', accel: 'CmdOrCtrl+Shift+N', run: () => A.newList() }, { label: 'New Group…', run: () => A.newGroup() }, { separator: true }, { label: 'New List from Template', submenu: T.length ? T.map((t) => ({ label: t.name, run: () => A.newFromTemplate(t.id) })) : [{ label: 'No Templates', enabled: false }] }], { anchor, align: 'end' }); }
  function listMenu(e, id) {
    const S = A.S(); const l = A.listById(id); const grp = S.groups.find((g) => g.lists.includes(id));
    zk.contextMenu(e, [
      { label: 'Get Info…', run: () => A.editList(id) }, { label: 'Rename', run: () => rename(id, 'l') }, { separator: true },
      { label: 'Move to Group', submenu: [{ label: 'None', checked: !grp, run: () => ST.commit('Move List', (d) => d.moveSide('l', id, { group: null, index: 9999 })) }, ...S.groups.map((g) => ({ label: g.name, checked: grp && grp.id === g.id, run: () => ST.commit('Move List', (d) => d.moveSide('l', id, { group: g.id, index: 9999 })) })), { separator: true }, { label: 'New Group…', run: async () => { const n = await zk.prompt('New Group', 'New Group', { ok: 'Create' }); if (n == null) return; ST.commit('New Group', (d) => { const gid = d.addGroup(n.trim() || 'New Group'); d.moveSide('l', id, { group: gid, index: 0 }); }); } }] },
      { label: 'Save as Template…', run: () => A.saveTemplate(id) }, { separator: true },
      { label: 'Export as iCalendar…', run: () => A.exportList && A.exportList('ics', id) }, { label: 'Export as Markdown…', run: () => A.exportList && A.exportList('md', id) }, { label: 'Export as CSV…', run: () => A.exportList && A.exportList('csv', id) }, { label: 'Print…', run: () => A.printList && A.printList(id) }, { separator: true },
      { label: 'Delete List…', run: () => A.deleteList(id) }]);
  }
  function groupMenu(e, id) {
    zk.contextMenu(e, [{ label: 'Rename', run: () => rename(id, 'g') }, { label: 'New List in Group…', run: () => A.newList(id) }, { separator: true }, { label: 'Ungroup', run: () => ST.commit('Ungroup', (d) => d.delGroup(id)) }]);
  }
  function rename(id, kind) {
    const el = A.$(`.zr-li[data-kind="${kind}"][data-id="${id}"] .nm`); if (!el) return; const cur = kind === 'l' ? A.listById(id).name : A.S().groups.find((g) => g.id === id).name;
    const inp = h('input.ren.selectable', { value: cur, 'aria-label': 'Name' }); el.replaceWith(inp); renaming = id; inp.focus(); inp.select(); let done = false;
    const fin = (ok) => { if (done) return; done = true; renaming = null; const v = inp.value.trim(); if (ok && v && v !== cur) ST.commit('Rename', (d) => (kind === 'l' ? d.setList(id, { name: v }) : d.setGroup(id, { name: v }))); else A.render(true); A.renderers.sidebar(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); }); inp.addEventListener('blur', () => fin(true)); inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  A.renameList = (id) => rename(id, 'l');

  // ---------- events ----------
  side.addEventListener('click', (e) => {
    if (A.justDragged && Date.now() - A.justDragged < 300) return;
    const t = e.target.closest('.zr-tile'); if (t) return A.setView({ k: 'smart', id: t.dataset.smart });
    const tg = e.target.closest('.zr-tagchip'); if (tg) { const tag = tg.dataset.tag; const cur = A.view.k === 'tag' ? A.view.tags : []; const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]; return next.length ? A.setView({ k: 'tag', tags: next }) : A.setView({ k: 'smart', id: 'all' }); }
    const li = e.target.closest('.zr-li'); if (!li || e.target.closest('input')) return;
    if (li.dataset.kind === 'l') A.setView({ k: 'list', id: li.dataset.id });
    else ST.commit(li.classList.contains('collapsed') ? 'Expand Group' : 'Collapse Group', (d) => d.setGroup(li.dataset.id, { collapsed: !li.classList.contains('collapsed') }));
  });
  side.addEventListener('dblclick', (e) => { const li = e.target.closest('.zr-li'); if (li && e.target.closest('.nm')) rename(li.dataset.id, li.dataset.kind); });
  side.addEventListener('contextmenu', (e) => { const li = e.target.closest('.zr-li'); if (!li) return; if (li.dataset.kind === 'l') listMenu(e, li.dataset.id); else groupMenu(e, li.dataset.id); });
  side.addEventListener('keydown', (e) => { const li = e.target.closest && e.target.closest('.zr-li'); if (!li || e.target.tagName === 'INPUT') return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } else if (e.key === 'F2') rename(li.dataset.id, li.dataset.kind); });

  // ---------- drag reorder ----------
  side.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.zr-li'); if (!li || e.target.closest('input') || e.button !== 0) return;
    const kind = li.dataset.kind, id = li.dataset.id; const all = [...A.$('#lists').children].filter((c) => c.classList.contains('zr-li'));
    const hidden = kind === 'g' ? all.filter((x) => x.dataset.parent === id) : []; const sib = all.filter((x) => !hidden.includes(x));
    const S = A.S(); const ent = sib.map((x) => ({ k: x.dataset.kind, id: x.dataset.id, group: x.dataset.parent || null, el: x }));
    const me = ent.find((x) => x.el === li); const Ep = ent.filter((x) => x !== me); const left = side.getBoundingClientRect().left;
    const resolve = (idx, x) => {
      const below = Ep[idx], above = Ep[idx - 1];
      const keyOf = (en) => (en.k === 'g' ? 'g:' : 'l:') + en.id;
      if (kind === 'g') { let b = below; if (b && b.group) b = Ep.find((q) => q.k === 'g' && q.id === b.group); const rest = S.side.filter((k) => k !== 'g:' + id); return { group: null, index: b ? rest.indexOf(keyOf(b)) : rest.length }; }
      const rest = S.side.filter((k) => k !== 'l:' + id);
      const inGroupEnd = (gid) => ({ group: gid, index: 9999 });
      if (below && below.k === 'l' && below.group) { const g = S.groups.find((q) => q.id === below.group); return { group: g.id, index: g.lists.filter((q) => q !== id).indexOf(below.id) }; }
      if (above && above.k === 'g' && x > left + 56) return inGroupEnd(above.id);
      if (above && above.k === 'l' && above.group && x > left + 56) return inGroupEnd(above.group);
      let b = below; if (b && b.k === 'l' && b.group) b = null;
      return { group: null, index: b ? rest.indexOf(keyOf(b)) : rest.length };
    };
    let lastHi = null;
    ZR.anim.dragReorder(e, {
      el: li, siblings: sib, scroller: side, threshold: 6,
      prepare: () => { hidden.forEach((x) => (x.style.display = 'none')); A.sideDragging = true; },
      onMove: ({ idx, x }) => { const r = resolve(idx, x); const gh = r.group ? A.$(`.zr-li[data-kind="g"][data-id="${r.group}"]`) : null; if (gh !== lastHi) { lastHi && lastHi.classList.remove('drop'); gh && gh.classList.add('drop'); lastHi = gh; } li.classList.toggle('in-group', !!r.group && kind === 'l'); },
      onDrop: ({ idx, moved, x }) => {
        A.sideDragging = false; A.justDragged = Date.now(); lastHi && lastHi.classList.remove('drop'); const r = resolve(idx, x);
        const curGroup = li.dataset.parent || null; if (!moved && r.group === curGroup) { hidden.forEach((q) => (q.style.display = '')); return render(); }
        ST.commit('Move List', (d) => { d.moveSide(kind, id, r); if (r.group) d.setGroup(r.group, { collapsed: false }); }); hidden.forEach((q) => (q.style.display = '')); render();
      },
      onCancel: () => { A.sideDragging = false; A.justDragged = Date.now(); hidden.forEach((q) => (q.style.display = '')); lastHi && lastHi.classList.remove('drop'); render(); },
    });
  });
})();
