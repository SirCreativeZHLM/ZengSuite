/* Main pane: quick add, sections and rows, title editing, selection, drag, context menus, bulk bar. */
(function () {
  const A = ZR.A, V = ZR.views, D = ZR.dates, h = zk.el, ST = ZR.store, P = ZR.parser;
  const inner = A.$('#inner'), scroll = A.$('#scroll'); A.collapsedSecs = new Set(); A.popIds = new Set();
  const icon = (n, s) => zk.icon(n, s);

  // ---------- header + quick add (persistent elements) ----------
  const hTitle = h('h1'), hCount = h('.count'); const head = h('.zr-head', hTitle, hCount);
  const qhl = h('.zr-qhl', { 'aria-hidden': 'true' });
  const qin = h('input.zr-qin.selectable', { id: 'quick', type: 'text', placeholder: 'New task — try “Pay rent every 1st at 9am !!! #home”', 'aria-label': 'Quick add task', autocomplete: 'off', autocorrect: 'off', spellcheck: false });
  const qprev = h('.zr-qprev'); const addBtn = h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Add task', title: 'Add (Return)', onclick: () => submitQuick(false) }, icon('arrow-up'));
  const quick = h('.zr-quick', h('.zr-qa', icon('plus-circle'), h('.zr-qwrap', qhl, qin), addBtn), qprev);
  const rowsEl = h('div', { id: 'rows' }); const emptyEl = h('.zr-empty');
  inner.append(head, quick, rowsEl, emptyEl);

  const parseNow = (txt) => P.parse(txt, { now: new Date(), lists: A.S().lists.map((l) => l.name), weekStart: A.ws() });
  function updateQuick() {
    const t = qin.value; qin.classList.toggle('empty', !t); qhl.replaceChildren(); addBtn.style.opacity = t.trim() ? 1 : .35;
    if (!t) { qprev.replaceChildren(); return; }
    const p = parseNow(t); let pos = 0;
    p.tokens.forEach((k) => { if (k.start > pos) qhl.append(t.slice(pos, k.start)); qhl.append(h('span.tk.' + k.type, t.slice(k.start, k.end))); pos = k.end; }); qhl.append(t.slice(pos)); qhl.scrollLeft = qin.scrollLeft;
    const chips = []; const dueTxt = p.due ? A.dueText({ due: p.due, time: p.time }) : ''; const overdue = p.due && p.due < D.today();
    if (p.title && (p.tokens.length)) chips.push(h('span.zr-chip', { style: { fontWeight: 600, color: 'var(--fg)' } }, '“' + p.title + '”'));
    if (p.due) chips.push(h('span.zr-chip.date' + (overdue ? '.red' : ''), icon('calendar'), dueTxt));
    if (p.repeat) chips.push(h('span.zr-chip.repeat', icon('repeat'), ZR.recur.label(p.repeat)));
    if (p.early) chips.push(h('span.zr-chip.date', icon('bell'), A.earlyText(p.early)));
    if (p.priority) chips.push(h('span.zr-chip.pri', '!'.repeat(p.priority) + ' ' + V.PRI_NAME[p.priority]));
    if (p.flag) chips.push(h('span.zr-chip.flag', icon('flag'), 'Flagged'));
    p.tags.forEach((g) => chips.push(h('span.zr-chip.tag', '#' + g)));
    if (p.list) chips.push(h('span.zr-chip.list', icon('list'), p.list));
    qprev.replaceChildren(...chips);
  }
  A.addDefaults = () => { const v = A.view, o = {}; if (v.k === 'smart' && v.id === 'today') o.due = D.today(); if (v.k === 'smart' && v.id === 'flagged') o.flag = true; if (v.k === 'tag') o.tags = v.tags; return o; };
  A.listForAdd = () => (A.view.k === 'list' ? A.listById(A.view.id) : null) || A.listById(A.setting('defaultList')) || V.flatLists(A.S())[0];
  function submitQuick(literal) {
    const text = qin.value.trim(); if (!text) return;
    const p = literal ? { title: text, due: null, time: null, repeat: null, priority: 0, tags: [], list: null, flag: false, early: null } : parseNow(text);
    const title = p.title || text.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim() || text; const S = A.S();
    const pl = p.list ? S.lists.find((l) => l.name.toLowerCase() === p.list.toLowerCase()) : null; const list = pl || A.listForAdd(); const df = A.addDefaults();
    const due = p.due || df.due || null; const tags = [...new Set([...(p.tags || []), ...(df.tags || [])])]; let id;
    ST.commit('New Task', (d) => { id = d.add({ list: list.id, title, due, time: due ? p.time : null, repeat: due ? p.repeat : null, early: due ? p.early : null, priority: p.priority, flag: p.flag || !!df.flag, tags }); });
    qin.value = ''; updateQuick(); A.select(id); A.revealId = id; A.sounds && A.sounds.unlock();
    if (A.view.k === 'list' && A.view.id !== list.id) A.toast(`Added to ${list.name}`, { label: 'Show', run: () => A.setView({ k: 'list', id: list.id }) });
  }
  qin.addEventListener('input', updateQuick); qin.addEventListener('keyup', () => (qhl.scrollLeft = qin.scrollLeft)); qin.addEventListener('scroll', () => (qhl.scrollLeft = qin.scrollLeft));
  qin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitQuick(e.altKey); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (qin.value) { qin.value = ''; updateQuick(); } else qin.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); qin.blur(); if (A.order[0]) A.select(A.order[0]); }
  });
  A.focusQuick = () => { qin.focus(); };

  // ---------- rendering ----------
  const hostOf = (u) => { try { return new URL(/^[a-z]+:/i.test(u) ? u : 'https://' + u).host.replace(/^www\./, '') || u; } catch { return u; } };
  function metaEls(r, ctx) {
    const S = A.S(); const m = []; const mk = (cls, ...k) => h('span.m' + (cls ? '.' + cls : ''), ...k);
    if (ZR.three.isStuck(r)) m.push(h('span.m.stuck', { 'data-stuck': r.id, role: 'button', title: `Postponed ${r.postponed} times — click to split into subtasks` }, icon('triangle-alert'), 'Stuck'));
    if (r.due) m.push(mk('due ' + A.dueClass(r), icon('calendar'), A.dueText(r), r.repeat ? icon('repeat') : null));
    if (r.due && r.early != null && r.early > 0) m.push(mk('', icon('bell')));
    if (r.url) m.push(h('a.m.url', { href: r.url, title: r.url, 'data-url': r.url }, icon('link'), hostOf(r.url)));
    (r.tags || []).forEach((t) => m.push(h('span.m.tg', { 'data-tag': t, role: 'button' }, '#' + t)));
    if (ctx.showList) { const l = A.listById(r.list); l && m.push(mk('lst', l.name)); }
    const kids = Object.values(S.reminders).filter((k) => k.parent === r.id);
    if (kids.length) { const dn = kids.filter((k) => k.done).length; m.push(mk('prog', h('span.bar', h('i', { style: { width: (dn / kids.length) * 100 + '%' } })), `${dn}/${kids.length}`)); }
    const nAtt = (r.atts || []).length; if (nAtt) m.push(mk('', icon('paperclip'), String(nAtt)));
    return m;
  }
  function rowEl(node, ctx) {
    const r = node.r, S = A.S(); const lg = A.lingering.get(r.id); const isDone = lg ? lg.visual === 'done' : r.done; const draft = !!node.draft; const kids = Object.values(S.reminders).filter((k) => k.parent === r.id);
    const lc = A.listColor(r); const hasKids = !draft && kids.length > 0;
    const rw = h('.rw' + (isDone ? '.done' : '') + (draft ? '.draft' : '') + (A.sel.has(r.id) ? '.sel' : ''), { 'data-id': r.id, role: 'treeitem', 'aria-selected': A.sel.has(r.id), style: { '--lc': lc, '--lc-rgb': A.hexRgb(lc) } });
    rw.append(h('button.chv' + (hasKids ? (r.collapsed ? '' : '.open') : '.none'), { type: 'button', tabindex: -1, 'aria-label': r.collapsed ? 'Expand subtasks' : 'Collapse subtasks' }, icon('chevron-right')));
    rw.append(h('button.chk' + (isDone ? '.on' : ''), { type: 'button', role: 'checkbox', 'aria-checked': isDone, 'aria-label': 'Complete', tabindex: -1 }, h('span.ring'), h('span.fill', icon('check'))));
    const l1 = h('.l1'); if (r.priority) l1.append(h('span.pri', { title: V.PRI_NAME[r.priority] + ' priority' }, '!'.repeat(r.priority)));
    const ttl = h('div.ttl', { 'data-ph': r.parent || node.parentDraft ? 'New Subtask' : 'New Task', role: 'textbox', 'aria-label': 'Title', 'data-draft': draft ? '1' : '' }); ttl.textContent = r.title; l1.append(ttl);
    const body = h('.body', l1);
    if (node.parentTitle) body.append(h('.ctx', '↳ ' + node.parentTitle));
    if (r.notes) body.append(h('.nt', r.notes.split('\n')[0]));
    const meta = draft ? null : h('.meta', metaEls(r, ctx)); meta && body.append(meta);
    if ((r.atts || []).length) { const th = h('.thumbs'); r.atts.slice(0, 6).forEach((a) => { const im = h('img', { alt: a.name || 'Attachment', 'data-att': a.id }); th.append(im); ST.att.get(a.id).then((rec) => { if (rec) im.src = rec.data; }); }); body.append(th); }
    rw.append(body);
    if (!draft) {
      if (r.flag) rw.append(A.cls(icon('flag'), 'zi flagged solo'));
      rw.append(h('.acts', h('button.zk-btn.icon' + (r.flag ? '.on' : ''), { type: 'button', 'data-act': 'flag', 'aria-label': r.flag ? 'Unflag' : 'Flag', title: r.flag ? 'Unflag' : 'Flag' }, icon('flag')), h('button.zk-btn.icon', { type: 'button', 'data-act': 'info', 'aria-label': 'Details', title: 'Details' }, icon('info')), h('button.zk-btn.icon', { type: 'button', 'data-act': 'more', 'aria-label': 'More', title: 'More' }, icon('ellipsis'))));
    }
    return rw;
  }
  function blockEl(node, ctx) {
    const r = node.r; const blk = h('.blk', { 'data-id': r.id, 'data-list': r.list || '', 'data-parent': r.parent || '' }); blk.append(rowEl(node, ctx));
    if (node.kids.length && !r.collapsed) { const subs = h('.subs'); node.kids.forEach((k) => subs.append(blockEl(k, ctx))); blk.append(subs); }
    return blk;
  }
  function insertDraft(built) {
    const dr = A.draft; if (!dr) return; const S = A.S(); const l = A.listById(dr.list) || A.listForAdd(); const r = ST.newReminder({ id: '__draft', list: l.id, parent: dr.parent || null, ...(dr.fields || {}) });
    const node = { r, kids: [], draft: true, parentDraft: !!dr.parent };
    if (dr.parent) { for (const s of built.sections) for (const n of s.nodes) if (n.r.id === dr.parent) { const i = dr.afterId ? n.kids.findIndex((k) => k.r.id === dr.afterId) : -1; n.kids.splice(i < 0 ? n.kids.length : i + 1, 0, node); return; } }
    for (const s of built.sections) { const i = s.nodes.findIndex((n) => n.r.id === dr.afterId); if (i >= 0) { s.nodes.splice(i + 1, 0, node); return; } }
    let s = built.sections.find((x) => x.listId === l.id) || built.sections.filter((x) => !x.muted).pop(); if (!s) { s = { key: 'all', title: null, nodes: [] }; built.sections.push(s); } s.nodes.push(node);
  }
  function renderMain(force) {
    if (!A.viewValid()) { A.view = { k: 'list', id: V.flatLists(A.S())[0].id }; A.sel.clear(); }
    if (A.editingEl && document.contains(A.editingEl)) { if (!force) { A.dirtyWhileEditing = true; renderLight(); return; } commitTitle(A.editingEl); A.editingEl = null; }
    A.dirtyWhileEditing = false; const S = A.S(); const info = A.viewInfo(); const st = scroll.scrollTop;
    const built = V.build(S, A.view, A.now, { lingering: new Set(A.lingering.keys()), ws: A.ws() }); insertDraft(built); A.built = built;
    const prefs = built.prefs; const single = A.view.k === 'list'; const ctx = { showList: !single && prefs.group !== 'list' };
    hTitle.textContent = info.title; hTitle.style.setProperty('--lc', info.color); head.style.setProperty('--lc', info.color); hCount.textContent = A.view.k === 'smart' ? String(V.counts(S, A.now).smart[A.view.id]) : built.topCount ? String(countOpen(built)) : '0';
    quick.style.display = A.view.k === 'search' || (A.view.k === 'smart' && A.view.id === 'completed') ? 'none' : '';
    const frag = document.createDocumentFragment();
    built.sections.forEach((sec) => {
      const col = A.collapsedSecs.has(sec.key); const wrap = h('section.sec', { 'data-key': sec.key, style: sec.color ? { '--lc': sec.color } : null });
      if (sec.title != null) wrap.append(h('.zr-sec-h' + (sec.red ? '.red' : '') + (sec.muted ? '.muted' : '') + (col ? '.collapsed' : ''), { 'data-sec': sec.key, role: 'button', 'aria-expanded': !col, tabindex: 0 }, sec.color ? h('span.dot') : null, sec.title, h('span.n', String(sec.nodes.reduce((n, x) => n + 1 + x.kids.length, 0))), A.cls(icon('chevron-down', 13), 'zi chev')));
      const rows = h('.rows'); if (!col) sec.nodes.forEach((n) => rows.append(blockEl(n, ctx))); wrap.append(rows); frag.append(wrap);
    });
    rowsEl.replaceChildren(frag); scroll.scrollTop = st;
    const total = built.sections.reduce((n, s) => n + s.nodes.length, 0);
    emptyEl.replaceChildren(); if (!total && !A.draft) { const msg = emptyMsg(); emptyEl.append(icon(msg.icon), h('strong', msg.t), h('span', msg.s)); } emptyEl.style.display = total || A.draft ? 'none' : '';
    A.order = A.$$('.rw[data-id]', rowsEl).map((e) => e.dataset.id).filter((i) => i !== '__draft');
    for (const id of [...A.sel]) if (!S.reminders[id]) A.sel.delete(id);
    const pf = A.pendingFocus; A.pendingFocus = null;
    if (A.draft && A.draft.focus !== false) { const e = A.$('.rw.draft .ttl', rowsEl); if (e) { A.draft.focus = false; startEdit(e); e.scrollIntoView({ block: 'nearest' }); } }
    else if (pf) { const e = A.$(`.rw[data-id="${pf.id}"] .ttl`, rowsEl); if (e) startEdit(e, null, pf.pos); }
    if (A.revealId) { const e = A.$(`.rw[data-id="${A.revealId}"]`, rowsEl); if (e) e.scrollIntoView({ block: 'nearest' }); A.revealId = null; }
    A.popIds.forEach((id) => popCheck(id)); A.popIds.clear();
    renderBulk(); renderStatus(); $btns(); A.keepDraft = false;
  }
  const countOpen = (b) => b.sections.filter((s) => !s.muted).reduce((n, s) => n + s.nodes.reduce((m, x) => m + (x.r.done ? 0 : 1) + x.kids.filter((k) => !k.r.done).length, 0), 0);
  function renderLight() { hTitle.textContent = A.viewInfo().title; renderStatus(); }
  A.renderers.main = renderMain;
  function emptyMsg() {
    const v = A.view; if (v.k === 'search') return { icon: 'search', t: 'No Results', s: 'Try different words, or use #tag to search tags.' };
    if (v.k === 'smart') return { today: { icon: 'sun', t: 'Nothing due today', s: 'Enjoy the quiet, or add a task above.' }, scheduled: { icon: 'calendar-days', t: 'Nothing scheduled', s: 'Tasks with a due date appear here.' }, all: { icon: 'inbox', t: 'All clear', s: 'No open tasks.' }, flagged: { icon: 'flag', t: 'Nothing flagged', s: 'Flag important tasks to find them here.' }, completed: { icon: 'check-circle', t: 'Nothing completed yet', s: 'Completed tasks show up here.' }, unscheduled: { icon: 'calendar-plus', t: 'Everything has a date', s: 'Tasks without a due date appear here.' } }[v.id];
    return { icon: 'list-checks', t: 'No Tasks', s: 'Type above and press Return — or press ⌘N.' };
  }
  function renderStatus() {
    const b = A.built; if (!b) return; const S = A.S(); const all = Object.values(S.reminders); const open = all.filter((r) => !r.done).length; const over = all.filter((r) => V.isOverdue(r, A.now)).length;
    const shown = A.order.length; A.$('#stat').textContent = `${shown} shown · ${open} open${over ? ' · ' + over + ' overdue' : ''}${A.sel.size > 1 ? ' · ' + A.sel.size + ' selected' : ''} · ${A.tallyText ? A.tallyText() : ''}`;
  }
  function $btns() {
    const p = A.viewPrefs(); const done = A.$('#b-done'); done.setAttribute('aria-pressed', p.showDone); done.classList.toggle('on', p.showDone); done.disabled = A.view.k === 'smart' && A.view.id === 'completed';
    const dp = V.DEFAULT_PREFS[A.view.k === 'smart' ? A.view.id : A.view.k]; A.$('#b-sort').classList.toggle('on', p.sort !== dp.sort || p.dir !== dp.dir); A.$('#b-group').classList.toggle('on', p.group !== dp.group);
  }

  function popCheck(id) { const f = A.$(`.rw[data-id="${id}"] .chk .fill`, rowsEl); if (!f || !A.$(`.rw[data-id="${id}"] .chk.on`, rowsEl)) return; const sp = ZR.anim.spring(0.35, { response: 0.32, damping: 0.42, eps: 0.002, onUpdate: (v) => { f.style.transform = `scale(${v})`; } }); sp.target(1, () => { f.style.transform = ''; }); }
  const origToggle = A.toggleDone; A.toggleDone = (ids, v) => { const arr = ids || A.selIds(); const S = A.S(); const will = v != null ? v : arr.some((i) => S.reminders[i] && !S.reminders[i].done); if (will) arr.forEach((i) => A.popIds.add(i)); return origToggle(ids, v); };

  // ---------- title editing ----------
  function startEdit(el, pt, pos) {
    el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.focus(); const sel = getSelection(); let range;
    if (pt && document.caretRangeFromPoint) range = document.caretRangeFromPoint(pt.x, pt.y);
    if (!range || !el.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(el); range.collapse(pos === 'start'); }
    sel.removeAllRanges(); sel.addRange(range);
  }
  const cleanTitle = (t) => t.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  function extractTags(title) { const tags = []; const t = title.replace(/(^|\s)#([\p{L}\p{N}_-]*\p{L}[\p{L}\p{N}_-]*)/gu, (m, sp, g) => { tags.push(g.toLowerCase()); return sp; }).replace(/\s+/g, ' ').trim(); return { title: t, tags }; }
  function commitTitle(el) {
    const rw = el.closest('.rw'); if (!rw) return; const id = rw.dataset.id; const raw = cleanTitle(el.textContent);
    if (id === '__draft') {
      const dr = A.draft; if (!dr || !raw) return; const { title, tags } = extractTags(raw); if (!title) return; const df = A.addDefaults(); let nid; const S = A.S();
      const sibs = Object.values(S.reminders).filter((r) => r.list === dr.list && (r.parent || null) === (dr.parent || null)).sort((a, b) => a.order - b.order); const after = dr.afterId && S.reminders[dr.afterId]; let order;
      if (after && after.list === dr.list && (after.parent || null) === (dr.parent || null)) { const nx = sibs.find((x) => x.order > after.order); order = nx ? (after.order + nx.order) / 2 : after.order + 1; } else order = (sibs.length ? sibs[sibs.length - 1].order : 0) + 1;
      A.draft = null; ST.commit('New Task', (d) => { nid = d.add({ list: dr.list, parent: dr.parent || null, title, tags: [...new Set([...tags, ...(df.tags || [])])], due: dr.parent ? null : df.due || null, flag: !!df.flag, order, ...(dr.fields || {}) }); });
      A.lastCreated = nid; A.select(nid); return nid;
    }
    const r = A.S().reminders[id]; if (!r) return; const { title, tags } = extractTags(raw);
    if (!title) { el.textContent = r.title; return; }
    if (title !== r.title || tags.some((t) => !(r.tags || []).includes(t))) ST.commit('Edit Title', (d) => d.set(id, { title, tags: [...new Set([...(r.tags || []), ...tags])] }), { key: 'title:' + id });
  }
  function endEdit(el) { el.removeAttribute('contenteditable'); }
  rowsEl.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('.ttl'); if (t) A.editingEl = t; });
  rowsEl.addEventListener('focusout', (e) => {
    const t = e.target.closest && e.target.closest('.ttl'); if (!t) return; if (A.editingEl === t) A.editingEl = null;
    if (t.closest('.rw').dataset.id === '__draft') { const had = cleanTitle(t.textContent); if (had) commitTitle(t); else if (A.draft && !A.keepDraft) { A.draft = null; } }
    else commitTitle(t); endEdit(t); if (A.dirtyWhileEditing || (A.draft === null)) setTimeout(() => !A.editingEl && A.render(true), 0);
  });
  function neighbor(id, dir) { const i = A.order.indexOf(id); return A.order[i + dir]; }
  rowsEl.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('.ttl'); if (!t || e.isComposing) return; const rw = t.closest('.rw'); const id = rw.dataset.id; const isDraft = id === '__draft'; const text = cleanTitle(t.textContent);
    const sel = getSelection(); const atStart = sel.isCollapsed && sel.anchorOffset === 0; const atEnd = sel.isCollapsed && sel.anchorOffset >= (t.textContent || '').length;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isDraft) { if (!text) { A.draft = null; t.blur(); A.render(true); return; } const nid = commitTitle(t); A.draft = null; A.editingEl = null; t.blur(); A.draft = { list: (A.S().reminders[nid] || {}).list, parent: (A.S().reminders[nid] || {}).parent || null, afterId: nid }; A.render(true); return; }
      commitTitle(t); const cur = A.S().reminders[id]; t.blur(); A.draft = { list: cur.list, parent: cur.parent || null, afterId: id }; A.render(true);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); if (isDraft) { A.draft = null; } else t.textContent = A.S().reminders[id].title; t.blur(); A.render(true); if (!isDraft) A.select(id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (isDraft) {
        const dr = A.draft; const S = A.S();
        if (text) { const nid = commitTitle(t); A.draft = null; A.editingEl = null; t.blur(); if (nid) { e.shiftKey ? A.outdent(nid) : A.indent(nid); A.pendingFocus = { id: nid, pos: 'end' }; } A.render(true); return; }
        if (!e.shiftKey && !dr.parent) { const prev = (dr.afterId && S.reminders[dr.afterId]) || null; const pp = prev && (prev.parent ? S.reminders[prev.parent] : prev); if (pp) { dr.parent = pp.id; dr.afterId = prev.parent ? prev.id : null; dr.focus = true; A.keepDraft = true; A.render(true); } }
        else if (e.shiftKey && dr.parent) { dr.afterId = dr.parent; dr.parent = null; dr.focus = true; A.keepDraft = true; A.render(true); }
        return;
      }
      commitTitle(t); const ok = e.shiftKey ? A.outdent(id) : A.indent(id); if (ok) { A.pendingFocus = { id, pos: 'end' }; A.editingEl = null; t.blur(); A.render(true); }
    } else if (e.key === 'ArrowUp' && atStart && !isDraft) { const n = neighbor(id, -1); if (n) { e.preventDefault(); commitTitle(t); t.blur(); A.pendingFocus = { id: n, pos: 'end' }; A.render(true); } }
    else if (e.key === 'ArrowDown' && atEnd && !isDraft) { const n = neighbor(id, 1); if (n) { e.preventDefault(); commitTitle(t); t.blur(); A.pendingFocus = { id: n, pos: 'end' }; A.render(true); } }
    else if (e.key === 'Backspace' && isDraft && !t.textContent) { e.preventDefault(); const dr = A.draft; if (dr.parent) { dr.afterId = dr.parent; dr.parent = null; A.render(true); } else { A.draft = null; t.blur(); A.render(true); } }
  });
  rowsEl.addEventListener('paste', (e) => {
    const t = e.target.closest && e.target.closest('.ttl'); if (!t) return; const txt = (e.clipboardData || window.clipboardData).getData('text/plain'); if (!txt) return; e.preventDefault();
    const lines = txt.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, '').trim()).filter(Boolean);
    if (lines.length <= 1) { document.execCommand('insertText', false, cleanTitle(txt)); return; }
    const rw = t.closest('.rw'); const id = rw.dataset.id; const base = id === '__draft' ? A.draft : A.S().reminders[id]; const list = base.list; const parent = base.parent || null; const prev = id === '__draft' ? A.draft.afterId : id; const S = A.S(); const ids = [];
    A.draft = null; t.blur(); ST.commit('Paste Tasks', (d) => { const ord = (prev && S.reminders[prev] ? S.reminders[prev].order : 0); lines.forEach((l, i) => { const { title, tags } = extractTags(l); ids.push(d.add({ list, parent, title, tags, order: ord + (i + 1) * 0.0001, due: A.addDefaults().due || null, flag: !!A.addDefaults().flag })); }); }); A.select(ids);
  });

  // ---------- clicks ----------
  rowsEl.addEventListener('click', (e) => {
    if (A.justDragged && Date.now() - A.justDragged < 300) return;
    const sh = e.target.closest('.zr-sec-h'); if (sh) { const k = sh.dataset.sec; A.collapsedSecs.has(k) ? A.collapsedSecs.delete(k) : A.collapsedSecs.add(k); return A.render(true); }
    const rw = e.target.closest('.rw'); if (!rw) return; const id = rw.dataset.id; if (id === '__draft') return; const t = e.target;
    if (t.closest('.chk')) { A.sounds && A.sounds.unlock(); return A.toggleDone(A.sel.has(id) && A.sel.size > 1 ? [...A.sel] : [id]); }
    if (t.closest('.chv')) { const r = A.S().reminders[id]; if (r) ST.commit('Toggle Subtasks', (d) => d.set(id, { collapsed: !r.collapsed }), { key: 'col:' + id }); return; }
    const act = t.closest('[data-act]'); if (act) { const a = act.dataset.act; if (a === 'flag') return A.toggleFlag([id]); if (a === 'info') { A.select(id); return A.setInsp(true); } if (a === 'more') { if (!A.sel.has(id)) A.select(id); const r = act.getBoundingClientRect(); return rowMenu({ clientX: r.left, clientY: r.bottom + 2, preventDefault() {} }, id); } }
    const url = t.closest('a.url'); if (url) { e.preventDefault(); return A.openLink(url.dataset.url); }
    const sk = t.closest('.stuck'); if (sk) return A.splitSheet(sk.dataset.stuck);
    const tg = t.closest('.tg'); if (tg) return A.setView({ k: 'tag', tags: [tg.dataset.tag] });
    const im = t.closest('.thumbs img'); if (im) { ST.att.get(im.dataset.att).then((rec) => rec && A.lightbox(rec.data)); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (A.sel.size > 1 && A.sel.has(id)) A.select(id);
    const ttl = t.closest('.ttl'); if (ttl && !ttl.isContentEditable) startEdit(ttl, { x: e.clientX, y: e.clientY });
  });
  rowsEl.addEventListener('dblclick', (e) => { const rw = e.target.closest('.rw'); if (!rw || e.target.closest('.ttl,.chk,.acts,a')) return; if (rw.dataset.id !== '__draft') { A.select(rw.dataset.id); A.setInsp(true); } });
  rowsEl.addEventListener('contextmenu', (e) => { const rw = e.target.closest('.rw'); if (!rw || rw.dataset.id === '__draft') return; const id = rw.dataset.id; if (!A.sel.has(id)) A.select(id); rowMenu(e, id); });
  rowsEl.addEventListener('keydown', (e) => { const sh = e.target.closest && e.target.closest('.zr-sec-h'); if (sh && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sh.click(); } });

  // ---------- pointer: selection + drag ----------
  rowsEl.addEventListener('pointerdown', (e) => {
    const rw = e.target.closest('.rw'); if (!rw || e.button !== 0 && e.button !== 2) return; const id = rw.dataset.id; if (id === '__draft') return;
    const skip = e.target.closest('.chk,.chv,.acts,a,.thumbs'); const editing = e.target.closest('.ttl') && e.target.closest('.ttl').isContentEditable;
    if (!skip && !editing) {
      if (e.metaKey || e.ctrlKey) { A.sel.has(id) ? A.sel.delete(id) : A.sel.add(id); A.anchor = id; A.refreshSel(); }
      else if (e.shiftKey && A.anchor) { const a = A.order.indexOf(A.anchor), b = A.order.indexOf(id); const [lo, hi] = a < b ? [a, b] : [b, a]; A.sel = new Set(A.order.slice(lo, hi + 1)); A.refreshSel(); }
      else if (!A.sel.has(id)) A.select(id);
      if (document.activeElement && document.activeElement !== document.body && !(document.activeElement.isContentEditable && e.target.closest('.ttl'))) { if (!e.target.closest('.ttl')) document.activeElement.blur(); }
    }
    if (skip || editing || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; startRowDrag(e, rw);
  });
  function startRowDrag(e, rw) {
    const blk = rw.closest('.blk'); const id = blk.dataset.id; const S = A.S(); const r = S.reminders[id]; if (!r) return; const prefs = A.viewPrefs();
    const reorder = A.view.k === 'list' && prefs.sort === 'manual' && prefs.group === 'none' && !r.done && !blk.closest('.sec[data-key="done"]');
    const container = blk.parentElement; const sibs = reorder ? [...container.children].filter((c) => c.classList.contains('blk') && !(S.reminders[c.dataset.id] || {}).done && c.dataset.id !== '__draft') : [blk];
    const ids = A.sel.has(id) && A.sel.size > 1 ? [...A.sel] : [id]; let hi = null;
    const hit = (x, y) => {
      const el = document.elementFromPoint(x, y); if (!el) return null; const li = el.closest && el.closest('.zr-li[data-kind="l"]'); if (li) return { type: 'list', id: li.dataset.id, el: li };
      const tile = el.closest && el.closest('.zr-tile'); if (tile && ['today', 'flagged'].includes(tile.dataset.smart)) return { type: 'smart', id: tile.dataset.smart, el: tile }; return null;
    };
    ZR.anim.dragReorder(e, { el: blk, siblings: sibs, scroller: scroll, threshold: 5,
      onStart: () => { rw.style.pointerEvents = 'none'; blk.style.pointerEvents = 'none'; }, hit, onTarget: (t) => { hi && hi.el.classList.remove('drop'); hi = t; t && t.el.classList.add('drop'); },
      onDrop: ({ idx, moved }) => { A.justDragged = Date.now(); blk.style.pointerEvents = ''; if (!moved) return A.render(true); const order = sibs.map((b) => b.dataset.id).filter((x) => x !== id); order.splice(idx, 0, id); const prev = S.reminders[order[idx - 1]], next = S.reminders[order[idx + 1]]; const no = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : 1; ST.commit('Reorder', (d) => d.set(id, { order: no })); },
      onCancel: () => { A.justDragged = Date.now(); blk.style.pointerEvents = ''; A.render(true); },
      onDropTarget: (t) => { A.justDragged = Date.now(); blk.style.pointerEvents = ''; if (t.type === 'list') A.moveToList(ids, t.id); else if (t.id === 'today') A.setDue(ids, D.today()); else A.toggleFlag(ids); A.render(true); } });
  }

  // ---------- context menu ----------
  function priMenu(ids) { return [0, 3, 2, 1].map((p) => ({ label: p ? `${'!'.repeat(p)}  ${V.PRI_NAME[p]}` : 'None', accel: 'CmdOrCtrl+Alt+' + p, run: () => A.setPriority(ids, p) })); }
  function dueMenu(ids) { const t = D.today(A.now); const ws = A.ws(); return [{ label: 'Today', run: () => A.setDue(ids, t) }, { label: 'Tomorrow', run: () => A.setDue(ids, D.addDays(t, 1)) }, { label: 'This Weekend', run: () => A.setDue(ids, D.addDays(t, (6 - D.dow(t) + 7) % 7 || 7)) }, { label: 'Next Week', run: () => A.setDue(ids, D.addDays(D.startOfWeek(t, ws), 7)) }, { label: 'Choose Date…', run: () => dateFor(ids) }, { separator: true }, { label: 'No Date', run: () => A.setDue(ids, null) }]; }
  function dateFor(ids) { const r = A.S().reminders[ids[0]]; const first = r && ids.length === 1 ? r : null; const anchor = A.$(`.rw[data-id="${ids[0]}"]`) || scroll; A.pickDate(anchor, { date: first && first.due, time: first && first.time, onChange: (d, tm) => A.setDue(ids, d, tm) }); }
  A.dueMenu = dueMenu; A.priMenu = priMenu; A.dateFor = dateFor;
  function moveMenu(ids) { return V.flatLists(A.S()).map((l) => ({ label: l.name, checked: ids.length === 1 && A.S().reminders[ids[0]] && A.S().reminders[ids[0]].list === l.id, run: () => A.moveToList(ids, l.id) })); }
  A.moveMenu = moveMenu;
  async function addTag(ids) { const t = await zk.prompt('Add Tag', '', { placeholder: 'tag name', ok: 'Add' }); if (t) A.addTagTo(ids, t.trim()); }
  A.addTag = addTag;
  function addSubtask(id) { const r = A.S().reminders[id]; if (!r) return; const pid = r.parent || id; const p = A.S().reminders[pid]; if (p.collapsed) ST.commit('Expand', (d) => d.set(pid, { collapsed: false })); A.draft = { list: p.list, parent: pid, afterId: null }; A.render(true); }
  A.addSubtask = addSubtask;
  function rowMenu(e, id) {
    const ids = A.sel.has(id) ? [...A.sel] : [id]; const S = A.S(); const rs = ids.map((i) => S.reminders[i]).filter(Boolean); if (!rs.length) return; const one = rs.length === 1 ? rs[0] : null; const allDone = rs.every((r) => r.done);
    zk.contextMenu(e, [
      { label: allDone ? 'Mark as Incomplete' : 'Mark as Completed', run: () => A.toggleDone(ids) },
      { label: rs.every((r) => r.flag) ? 'Unflag' : 'Flag', accel: 'CmdOrCtrl+Shift+F', run: () => A.toggleFlag(ids) },
      { label: 'Priority', submenu: priMenu(ids) }, { label: 'Due Date', submenu: dueMenu(ids) }, { label: 'Postpone…', accel: 'P', run: () => A.postponePop(null, ids) }, { label: 'Move to List', submenu: moveMenu(ids) }, { label: 'Add Tag…', run: () => addTag(ids) }, { separator: true },
      ...(one ? [{ label: 'Add Subtask', run: () => addSubtask(id) }, ...(!one.parent ? [{ label: 'Split into Subtasks…', run: () => A.splitSheet(id) }] : []), ...(one.parent ? [{ label: 'Make Top-Level', accel: 'Shift+Tab', run: () => A.outdent(id) }] : [{ label: 'Make Subtask of Previous', accel: 'Tab', run: () => A.indent(id) }])] : []),
      { label: 'Duplicate', run: () => A.duplicate(ids) }, { label: 'Get Info', accel: 'CmdOrCtrl+I', run: () => { A.setInsp(true); } }, { separator: true },
      { label: 'Copy as Markdown', run: () => copyMd(ids) }, { label: ids.length > 1 ? `Delete ${ids.length} Tasks` : 'Delete', accel: 'CmdOrCtrl+Backspace', run: () => A.delete(ids) },
    ]);
  }
  function mdOf(ids) { const S = A.S(); const rs = ids.map((i) => S.reminders[i]).filter(Boolean); return ZR.io.toMarkdown({ lists: [{ id: 'x', name: 'Tasks' }], reminders: rs.map((r) => ({ ...r, list: 'x', parent: ids.includes(r.parent) ? r.parent : null })) }).replace(/^# Tasks\n\n/, ''); }
  async function copyMd(ids) { try { await navigator.clipboard.writeText(mdOf(ids)); A.toast('Copied'); } catch { zk.alert('Couldn’t copy', 'The clipboard is not available.'); } }
  document.addEventListener('copy', (e) => { if (A.editingEl || !A.sel.size || (e.target.closest && e.target.closest('input,textarea,[contenteditable]')) || getSelection().toString()) return; e.preventDefault(); e.clipboardData.setData('text/plain', mdOf([...A.sel])); });
  document.addEventListener('paste', (e) => {
    const t = e.target; if (t.closest && t.closest('input,textarea,[contenteditable]')) return; const txt = e.clipboardData.getData('text/plain'); if (!txt.trim()) return; e.preventDefault();
    const p = ZR.io.fromMarkdown(txt, { now: new Date(), defaultList: '' }); if (!p.items.length) return; const list = A.listForAdd(); const df = A.addDefaults();
    ST.commit('Paste Tasks', (d) => ST.importItems(d, { items: p.items.map((i) => ({ ...i, due: i.due || df.due || null })) }, { intoList: list.id })); A.toast('Pasted tasks');
  });

  // ---------- toolbar menus ----------
  A.sortMenu = (anchor) => { const p = A.viewPrefs(); const set = (sort) => A.setViewPrefs({ sort }); const it = (l, s) => ({ label: l, checked: p.sort === s, run: () => set(s) }); const items = [it('Manual', 'manual'), it('Due Date', 'due'), it('Priority', 'priority'), it('Title', 'title'), it('Creation Date', 'created'), ...(A.view.k === 'smart' && A.view.id === 'completed' ? [it('Completion Date', 'done')] : []), { separator: true }, { label: 'Ascending', checked: p.dir === 'asc', run: () => A.setViewPrefs({ dir: 'asc' }) }, { label: 'Descending', checked: p.dir === 'desc', run: () => A.setViewPrefs({ dir: 'desc' }) }]; anchor ? zk.menu(items, { anchor }) : zk.menu(items, { x: 300, y: 80 }); };
  A.groupMenu = (anchor) => { const p = A.viewPrefs(); const it = (l, g) => ({ label: l, checked: p.group === g, run: () => A.setViewPrefs({ group: g }) }); const items = [it('None', 'none'), it('List', 'list'), it('Due Date', 'due'), it('Priority', 'priority'), it('Tag', 'tag'), ...(A.view.k === 'smart' && A.view.id === 'today' ? [it('Time of Day', 'time')] : [])]; anchor ? zk.menu(items, { anchor }) : zk.menu(items, { x: 300, y: 80 }); };
  A.toggleShowDone = () => { const p = A.viewPrefs(); A.setViewPrefs({ showDone: !p.showDone }); };

  // ---------- bulk bar ----------
  const bulk = A.$('#bulk');
  function renderBulk() {
    const n = A.sel.size; bulk.classList.toggle('zk-hidden', n < 2); if (n < 2) return; const ids = [...A.sel]; const mkb = (label, ic, fn) => h('button.zk-btn', { type: 'button', onclick: (e) => fn(e.currentTarget) }, ic ? icon(ic) : null, label);
    bulk.replaceChildren(h('span.cnt', `${n} selected`), mkb('Complete', 'check-circle', () => A.toggleDone(ids, true)), mkb('Date', 'calendar', (a) => zk.menu(dueMenu(ids), { anchor: a, side: 'top' })), mkb('Postpone', 'clock', (a) => A.postponePop(a, ids)), mkb('Priority', 'sliders-horizontal', (a) => zk.menu(priMenu(ids), { anchor: a, side: 'top' })), mkb('Flag', 'flag', () => A.toggleFlag(ids)), mkb('Move', 'folder', (a) => zk.menu(moveMenu(ids), { anchor: a, side: 'top' })), mkb('Tag', 'tag', () => addTag(ids)), mkb('Delete', 'trash-2', () => A.delete(ids)), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Clear selection', onclick: () => A.select([]) }, icon('x')));
  }
  A.renderers.bulk = renderBulk;
  qin.addEventListener('focus', () => { A.sounds && A.sounds.unlock(); });
  window.addEventListener('pointerdown', (e) => { if (e.target.closest('#scroll') && !e.target.closest('.rw,.zr-quick,.zr-sec-h,.zt,a,button') && A.sel.size && !e.shiftKey && !e.metaKey) { A.select([]); } }, true);

  // ---------- global keyboard (not typing) ----------
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.zk-scrim,.zk-pop:not(.out)')) return; const t = e.target; if (t.closest && t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; const ids = [...A.sel];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const dir = e.key === 'ArrowDown' ? 1 : -1; const cur = ids.length ? A.order.indexOf(e.shiftKey ? A.lastMoved || ids[ids.length - 1] : ids[ids.length - 1]) : -1; const ni = zk.clamp(cur + dir, 0, A.order.length - 1); const nid = A.order[ni]; if (!nid) return; if (e.shiftKey && A.anchor) { const a = A.order.indexOf(A.anchor); const [lo, hi] = a < ni ? [a, ni] : [ni, a]; A.sel = new Set(A.order.slice(lo, hi + 1)); A.lastMoved = nid; A.refreshSel(); } else { A.lastMoved = null; A.select(nid); } const el = A.$(`.rw[data-id="${nid}"]`); el && el.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === ' ' && ids.length) { e.preventDefault(); A.toggleDone(ids); }
    else if (e.key === 'Enter' && ids.length) { e.preventDefault(); const el = A.$(`.rw[data-id="${ids[0]}"] .ttl`); el && startEdit(el, null, 'end'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) { e.preventDefault(); A.delete(ids); }
    else if (e.key === 'Escape') { if (A.sel.size) A.select([]); else if (A.inspOpen) A.setInsp(false); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && ids.length === 1) { const r = A.S().reminders[ids[0]]; const has = r && Object.values(A.S().reminders).some((k) => k.parent === r.id); if (has && r.collapsed === (e.key === 'ArrowLeft')) { e.preventDefault(); ST.commit('Toggle Subtasks', (d) => d.set(r.id, { collapsed: e.key === 'ArrowLeft' }), { key: 'col:' + r.id }); } }
    else if (e.key === 'Tab' && ids.length === 1 && t === document.body) { e.preventDefault(); e.shiftKey ? A.outdent(ids[0]) : A.indent(ids[0]); }
  });
  A.newReminder = () => { A.sounds && A.sounds.unlock(); const l = A.listForAdd(); const sel = A.primary(); A.draft = { list: sel && A.view.k === 'list' ? sel.list : l.id, parent: null, afterId: null }; if (A.view.k === 'search') A.setView({ k: 'list', id: l.id }); else A.render(true); };
  A.selectAll = () => A.select(A.order, { anchor: A.order[0] });
})();
