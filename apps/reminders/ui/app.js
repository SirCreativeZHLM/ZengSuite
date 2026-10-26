/* Boot, menus, import/export, printing, window lifecycle. */
(async function () {
  const A = ZR.A, V = ZR.views, D = ZR.dates, IO = ZR.io, ST = ZR.store, h = zk.el; await zeng.ready;
  // ---------- load ----------
  const note = await ST.load(); const S0 = ST.state; A.view = S0.prefs.view || { k: 'smart', id: 'today' }; if (A.view.k === 'search') A.view = { k: 'smart', id: 'today' }; A.inspOpen = !!S0.prefs.insp;
  for (const [id, ic] of [['b-side', 'panel-left'], ['b-sort', 'arrow-up-down'], ['b-group', 'layout-list'], ['b-done', 'eye'], ['b-insp', 'info'], ['b-new', 'plus']]) A.$('#' + id).append(zk.icon(ic));
  A.$('#b-side').onclick = () => A.showSide(A.$('#side').classList.contains('hidden')); A.$('#side-scrim').onclick = () => A.showSide(false);
  A.$('#b-sort').onclick = (e) => A.sortMenu(e.currentTarget); A.$('#b-group').onclick = (e) => A.groupMenu(e.currentTarget); A.$('#b-done').onclick = () => A.toggleShowDone(); A.$('#b-insp').onclick = () => A.setInsp(!A.inspOpen); A.$('#b-new').onclick = () => A.newReminder();
  const body = A.$('#body'); const ro = new ResizeObserver(() => { body.classList.toggle('wide', body.clientWidth >= 1040); const c = body.clientWidth < 780; if (c !== A.compact) { A.compact = c; body.classList.toggle('compact', c); A.showSide(!c && A.setting('sideOn', true)); } }); ro.observe(body); A.compact = body.clientWidth < 780; body.classList.toggle('compact', A.compact); A.showSide(!A.compact && A.setting('sideOn', true));
  A.$('#b-side').addEventListener('click', () => { if (!A.compact) A.setPref({ sideOn: !A.$('#side').classList.contains('hidden') }); });
  let sav; ST.onStatus((s) => { const e = A.$('#saved'); e.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? 'Couldn’t save' : 'Saved'; e.style.color = s === 'error' ? 'var(--danger)' : ''; if (zeng.isNative) window.ipc.postMessage(JSON.stringify({ cmd: 'dirty', dirty: s !== 'saved' })); });

  // ---------- import / export ----------
  const baseName = (n) => n.replace(/\.[^.]+$/, '');
  const exportScope = (scope) => { const S = A.S(); const lists = scope === 'all' ? V.flatLists(S) : [A.listById(scope)].filter(Boolean); const ids = new Set(lists.map((l) => l.id)); const lo = Object.fromEntries(lists.map((l, i) => [l.id, i])); const rs = Object.values(S.reminders).filter((r) => ids.has(r.list)).sort((a, b) => lo[a.list] - lo[b.list] || a.order - b.order); return { lists, reminders: rs }; };
  A.exportList = async (kind, scope) => {
    try {
      scope = scope || (A.view.k === 'list' ? A.view.id : 'all'); const data = exportScope(scope); const one = scope !== 'all' ? data.lists[0] : null; const name = one ? one.name.replace(/[\\/:*?"<>|]/g, '_') : 'Reminders'; let out, ext, label;
      if (kind === 'ics') { out = IO.toICS(data, { calName: one ? one.name : undefined }); ext = 'ics'; label = 'iCalendar'; } else if (kind === 'csv') { out = IO.toCSV(data); ext = 'csv'; label = 'CSV'; } else if (kind === 'md') { out = IO.toMarkdown(data); ext = 'md'; label = 'Markdown'; }
      else { const b = await ST.backupObject(); out = JSON.stringify(b, null, 1); ext = 'json'; label = 'Todo Backup'; }
      const hd = await zeng.files.saveAs(out, { name: (kind === 'json' ? 'Todo Backup ' + D.today() : name) + '.' + ext, filters: [{ name: label, exts: [ext] }] }); if (hd) A.toast(`Exported ${hd.name}`);
    } catch (e) { zk.alert('Couldn’t export', e.message || String(e)); }
  };
  async function importParsed(parsed, fname, colors) {
    const names = [...new Set(parsed.items.map((i) => i.listName).filter(Boolean))]; if (!parsed.items.length) return zk.alert('Nothing to import', 'No reminders were found in “' + fname + '”.');
    const cur = A.view.k === 'list' ? A.listById(A.view.id) : null; let mode = names.length > 1 || !cur ? 'lists' : 'current';
    const mk = (v, label) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('input.zk-radio', { type: 'radio', name: 'im', checked: mode === v, onchange: () => { mode = v; } }), label);
    const body = h('.zr-form', mk('lists', names.length ? `Create or merge lists from the file (${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''})` : 'Add to my default list'), cur ? mk('current', `Add everything to “${cur.name}”`) : null, h('p', { style: { color: 'var(--fg-3)', fontSize: '12px' } }, 'Reminders that already exist with the same title and date in a list are skipped.'));
    const r = await zk.sheet({ title: `Import ${parsed.items.length} reminder${parsed.items.length === 1 ? '' : 's'}`, message: fname, body, width: 440, buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Import', primary: true, value: 'ok' }] }); if (r !== 'ok') return;
    let res; ST.commit('Import', (d) => { res = ST.importItems(d, parsed, { intoList: mode === 'current' && cur ? cur.id : null, colors: colors || parsed.colors || {} }); });
    A.toast(`Imported ${res.added} reminder${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}` : ''}`, { label: 'Undo', run: () => ST.undo() });
  }
  async function importBackup(obj, fname) {
    let st; try { st = ST.sanitizeIncoming(obj); } catch (e) { return zk.alert('Can’t restore backup', e.message); }
    const n = Object.keys(st.reminders).length; const r = await zk.sheet({ title: 'Restore Backup', message: `“${fname}” has ${st.lists.length} list${st.lists.length === 1 ? '' : 's'} and ${n} reminder${n === 1 ? '' : 's'}.`, buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Replace Everything', danger: true, value: 'replace' }, { label: 'Merge', primary: true, value: 'merge' }] }); if (r !== 'merge' && r !== 'replace') return;
    for (const id in obj.attachments || {}) await ST.att.putAs(id, obj.attachments[id]);
    if (r === 'replace') { ST.commit('Restore Backup', (d) => d.replaceAll(st)); A.sel.clear(); A.setView({ k: 'list', id: ST.state.lists[0].id }); } else { let res; ST.commit('Merge Backup', (d) => { res = ST.mergeState(d, st); }); }
    A.toast('Backup restored', { label: 'Undo', run: () => ST.undo() });
  }
  A.importHandles = async (hs) => {
    for (const hd of hs) {
      const ext = zeng.files.ext(hd.name); try {
        const text = await zeng.files.readText(hd); const base = baseName(hd.name);
        if (ext === 'json') { let o; try { o = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); } await importBackup(o, hd.name); }
        else if (ext === 'ics' || ext === 'ical' || ext === 'ifb') await importParsed(IO.fromICS(text, { defaultList: base }), hd.name);
        else if (ext === 'csv' || ext === 'tsv') await importParsed(IO.fromCSV(text, { now: new Date() }), hd.name);
        else if (ext === 'md' || ext === 'markdown' || ext === 'txt') await importParsed(IO.fromMarkdown(text, { now: new Date(), defaultList: base }), hd.name);
        else throw new Error('Unsupported file type “.' + ext + '”. Use .ics, .csv, .json or .md.');
      } catch (e) { zk.alert('Can’t import “' + hd.name + '”', e.message || String(e)); }
    }
  };
  A.importFlow = async () => { const hs = await zeng.files.open({ filters: [{ name: 'Tasks', exts: ['ics', 'csv', 'json', 'md', 'markdown', 'txt'] }], multiple: true }); if (hs.length) A.importHandles(hs); };
  zeng.onFiles((hs) => { const imgs = hs.filter((x) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(x.name)); const p = A.primary(); if (imgs.length && p) { A.attachFiles(p.id, imgs); return false; } const rest = hs.filter((x) => /\.(ics|csv|tsv|json|md|markdown|txt)$/i.test(x.name)); if (rest.length) { A.importHandles(rest); return false; } return true; });

  // ---------- print ----------
  A.printList = (id) => {
    const S = A.S(); const view = id ? { k: 'list', id } : A.view; const b = V.build(S, view, new Date(), { ws: A.ws() }); const info = id ? { title: A.listById(id).name } : A.viewInfo(); const pr = A.$('#print'); pr.replaceChildren(h('h1', info.title), h('.sub', new Date().toLocaleDateString(undefined, { dateStyle: 'full' })));
    const item = (n, sub) => { const r = n.r; const m = [r.due ? A.dueText(r) : '', r.repeat ? ZR.recur.label(r.repeat) : '', r.priority ? '!'.repeat(r.priority) : '', (r.tags || []).map((t) => '#' + t).join(' '), r.flag ? 'Flagged' : ''].filter(Boolean).join('  ·  '); return [h('.it' + (sub ? '.sub-it' : ''), h('.bx' + (r.done ? '.on' : '')), h('div', h('.tt' + (r.done ? '.done' : ''), r.title), m ? h('.mt', m) : null, r.notes ? h('.nt', r.notes) : null)), ...n.kids.flatMap((k) => item(k, true))]; };
    b.sections.forEach((s) => { if (s.title) pr.append(h('h2', s.title)); s.nodes.forEach((n) => item(n, false).forEach((e) => pr.append(e))); }); if (!b.sections.some((s) => s.nodes.length)) pr.append(h('p', 'No reminders.'));
    setTimeout(() => zeng.print(), 50);
  };

  // ---------- undo / redo ----------
  const editable = () => { const a = document.activeElement; return a && a.matches && a.matches('input,textarea,[contenteditable]:not([contenteditable="false"])') && !(a.id === 'q' && false); };
  const doUndo = () => { if (editable()) return document.execCommand('undo'); const l = ST.undo(); if (l) A.toast(`Undid ${l}`, { ms: 1800 }); };
  const doRedo = () => { if (editable()) return document.execCommand('redo'); const l = ST.redo(); if (l) A.toast(`Redid ${l}`, { ms: 1800 }); };
  const needSel = () => A.sel.size > 0;
  const withSel = (fn) => () => { if (editable() && A.editingEl) { const a = document.activeElement; a.blur(); } if (A.sel.size) fn([...A.sel]); };

  // ---------- menus ----------
  function buildMenus() {
    const S = A.S(); const T = S.templates; const p = A.viewPrefs(); const ids = [...A.sel]; const has = ids.length > 0; const one = ids.length === 1;
    const exp = (k, label) => ({ label, submenu: [{ label: 'Current List…', enabled: A.view.k === 'list', run: () => A.exportList(k, A.view.id) }, { label: 'All Lists…', run: () => A.exportList(k, 'all') }] });
    const file = [
      { label: 'New Reminder', accel: 'CmdOrCtrl+N', run: () => A.newReminder() }, { label: 'New List…', accel: 'CmdOrCtrl+Shift+N', run: () => A.newList() }, { label: 'New Group…', run: () => A.newGroup() },
      { label: 'New List from Template', submenu: T.length ? T.map((t) => ({ label: t.name, run: () => A.newFromTemplate(t.id) })) : [{ label: 'No Templates', enabled: false }] },
      { label: 'Save List as Template…', enabled: A.view.k === 'list', run: () => A.saveTemplate(A.view.id) }, { label: 'Manage Templates…', run: () => A.manageTemplates() }, { separator: true },
      { label: 'Import…', accel: 'CmdOrCtrl+Shift+I', run: () => A.importFlow() },
      { label: 'Export', submenu: [exp('ics', 'iCalendar (.ics)'), exp('csv', 'CSV (.csv)'), exp('md', 'Markdown Checklist (.md)'), { label: 'Complete Backup (.json)…', run: () => A.exportList('json') }] }, { separator: true },
      { label: 'Print…', accel: 'CmdOrCtrl+P', run: () => A.printList() }, { label: 'Settings…', accel: 'CmdOrCtrl+,', run: () => A.settingsSheet() },
      ...(zeng.platform === 'mac' && zeng.isNative ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => closeApp() }]),
    ];
    const edit = zeng.stdEdit({ undo: doUndo, redo: doRedo, extra: [
      { label: 'Select All Reminders', accel: 'CmdOrCtrl+Shift+A', run: () => { if (!editable()) A.selectAll(); } }, { separator: true },
      { label: 'Find…', accel: 'CmdOrCtrl+F', run: () => A.focusSearch() }, { separator: true },
      { label: 'Mark Completed', enabled: has, run: withSel((i) => A.toggleDone(i)) },
      { label: 'Flag', accel: 'CmdOrCtrl+Shift+F', enabled: has, run: withSel((i) => A.toggleFlag(i)) },
      { label: 'Priority', enabled: has, submenu: [0, 1, 2, 3].map((q) => ({ label: q ? '!'.repeat(q) + '  ' + V.PRI_NAME[q] : 'None', accel: 'CmdOrCtrl+Alt+' + q, run: withSel((i) => A.setPriority(i, q)) })) },
      { label: 'Due Date', enabled: has, submenu: A.dueMenu([...A.sel]).map((m) => (m.run ? { ...m, run: () => { const cur = [...A.sel]; const mm = A.dueMenu(cur).find((x) => x.label === m.label); mm && mm.run(); } } : m)) },
      { label: 'Add Link…', accel: 'CmdOrCtrl+K', enabled: one, run: async () => { const r = A.primary(); if (!r) return; const u = await zk.prompt('Add Link', r.url || '', { placeholder: 'https://example.com', ok: 'Set Link' }); if (u != null) A.setProp([r.id], { url: u.trim() }, 'Edit URL'); } },
      { label: 'Add Subtask', enabled: one, accel: 'CmdOrCtrl+Shift+T', run: () => one && A.addSubtask(ids[0]) },
      { label: 'Make Subtask of Previous', enabled: one, run: () => one && A.indent(ids[0]) }, { label: 'Make Top-Level', enabled: one, run: () => one && A.outdent(ids[0]) },
      { label: 'Duplicate', accel: 'CmdOrCtrl+D', enabled: has, run: withSel((i) => A.duplicate(i)) },
      { label: 'Move to List', enabled: has, submenu: A.moveMenu([...A.sel]).map((m) => ({ ...m, run: () => A.moveToList([...A.sel], m.label && S.lists.find((l) => l.name === m.label).id) })) },
      { separator: true }, { label: 'Delete', accel: 'CmdOrCtrl+Backspace', enabled: has, run: () => { if (editable()) { document.execCommand('deleteSoftLineBackward'); return; } if (A.sel.size) A.delete(); } },
    ] });
    edit[0].label = ST.canUndo() ? 'Undo ' + ST.undoLabel() : 'Undo'; edit[0].enabled = true; edit[1].label = ST.canRedo() ? 'Redo ' + ST.redoLabel() : 'Redo';
    const sortItem = (l, s) => ({ label: l, checked: p.sort === s, run: () => A.setViewPrefs({ sort: s }) }); const grpItem = (l, g) => ({ label: l, checked: p.group === g, run: () => A.setViewPrefs({ group: g }) });
    const view = [
      { label: 'Show Sidebar', accel: 'CmdOrCtrl+Alt+S', checked: !A.$('#side').classList.contains('hidden'), run: () => A.$('#b-side').click() }, { label: 'Show Details', accel: 'CmdOrCtrl+I', checked: A.inspOpen, run: () => A.setInsp(!A.inspOpen) },
      { label: 'Show Completed', accel: 'CmdOrCtrl+Shift+H', checked: p.showDone, run: () => A.toggleShowDone() }, { separator: true },
      { label: 'Sort By', submenu: [sortItem('Manual', 'manual'), sortItem('Due Date', 'due'), sortItem('Priority', 'priority'), sortItem('Title', 'title'), sortItem('Creation Date', 'created'), { separator: true }, { label: 'Ascending', checked: p.dir === 'asc', run: () => A.setViewPrefs({ dir: 'asc' }) }, { label: 'Descending', checked: p.dir === 'desc', run: () => A.setViewPrefs({ dir: 'desc' }) }] },
      { label: 'Group By', submenu: [grpItem('None', 'none'), grpItem('List', 'list'), grpItem('Due Date', 'due'), grpItem('Priority', 'priority'), grpItem('Tag', 'tag'), grpItem('Time of Day', 'time')] }, { separator: true },
      ...V.SMART.map((s, i) => ({ label: s.name, accel: 'CmdOrCtrl+' + (i + 1), checked: A.view.k === 'smart' && A.view.id === s.id, run: () => A.setView({ k: 'smart', id: s.id }) })),
      { separator: true }, { label: 'Quick Add', accel: 'CmdOrCtrl+L', run: () => A.focusQuick() },
    ];
    zeng.setMenus([{ label: 'File', items: file }, { label: 'Edit', items: edit }, { label: 'View', items: view }]);
  }
  let mt = 0; A.menusDirty = () => { clearTimeout(mt); mt = setTimeout(buildMenus, 160); };
  const closeApp = async () => { await ST.flush(); if (zeng.isNative) window.ipc.postMessage(JSON.stringify({ cmd: 'dirty', dirty: false })); zeng.quit(); };
  zeng.on('close', closeApp);
  for (const ev of ['pagehide', 'beforeunload']) addEventListener(ev, () => { ST.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) ST.flush(); }); addEventListener('blur', () => ST.flush());
  addEventListener('error', (e) => console.error('Uncaught', e.message)); addEventListener('unhandledrejection', (e) => console.error('Unhandled', e.reason));
  zeng.shortcut('CmdOrCtrl+A', (e) => { if (editable() || document.querySelector('.zk-scrim')) return; A.selectAll(); });

  // ---------- go ----------
  buildMenus(); A.$('#b-insp').setAttribute('aria-pressed', A.inspOpen);
  A.render(true); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); A.A_tick(); A.badge();
  window.__zr = { A, ST, IO, V, D, P: ZR.parser, R: ZR.recur };
  if (note) zk.alert('Data recovered', note);
})();
