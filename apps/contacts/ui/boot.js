/* Menus, shortcuts, file drops, lifecycle. */
(async () => {
  'use strict';
  await zeng.ready;
  const ZC = window.ZC, S = ZC.S, M = ZC.M, $ = (s) => document.querySelector(s);
  const modal = () => !!document.querySelector('.zk-scrim');
  const inText = () => { const a = document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable) && a.type !== 'checkbox' && a.type !== 'radio' && a.type !== 'range'; };
  const guard = (fn) => () => { if (modal()) return; fn(); };
  const oneSel = () => S.sel.size === 1 && !S.editing;
  const mac = () => zeng.platform === 'mac' && zeng.isNative;

  ZC.buildMenus = () => {
    const has = S.contacts.length > 0; const sel = S.sel.size;
    const groups = S.groups.filter((g) => !g.smart);
    zeng.setMenus([
      { label: 'File', items: [
        { label: 'New Contact', accel: 'CmdOrCtrl+N', run: guard(() => ZC.newContact()) },
        { label: 'New Group…', accel: 'CmdOrCtrl+Shift+N', run: guard(() => ZC.newGroup(false)) },
        { label: 'New Group from Selection…', enabled: sel > 0 && !S.editing, run: guard(() => ZC.newGroup(true)) },
        { label: 'New Smart Group…', run: guard(() => ZC.smartDialog()) },
        { separator: true },
        { label: 'Import…', accel: 'CmdOrCtrl+O', run: guard(() => ZC.importDialog()) },
        { label: 'Import Sample Contacts', run: guard(() => ZC.importSample()) },
        { separator: true },
        { label: 'Export…', accel: 'CmdOrCtrl+Shift+E', enabled: has, run: guard(() => ZC.exportDialog(sel ? 'selected' : 'all')) },
        { label: 'Share Contact as vCard…', enabled: sel > 0, run: guard(() => ZC.shareVcf(ZC.selected())) },
        { separator: true },
        { label: 'Back Up Address Book…', enabled: has, run: guard(() => ZC.backup()) },
        { label: 'Restore from Backup…', run: guard(() => ZC.restoreDialog()) },
        { separator: true },
        { label: 'Print…', accel: 'CmdOrCtrl+P', enabled: has, run: guard(() => ZC.printDialog()) },
        ...(mac() ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => closeApp() }]),
      ] },
      { label: 'Edit', items: zeng.stdEdit({ undo: () => { if (inText() && S.editing) document.execCommand('undo'); else if (!ZC.undoOne()) zk.toast('Nothing to undo'); }, redo: () => { if (inText() && S.editing) document.execCommand('redo'); else if (!ZC.redoOne()) zk.toast('Nothing to redo'); }, extra: [
        { label: 'Change History…', run: guard(() => ZC.historyDialog()) },
        { label: S.editing ? 'Done Editing' : 'Edit Contact', accel: 'CmdOrCtrl+E', enabled: S.editing || oneSel(), run: guard(() => (S.editing ? ZC.finishEdit(true) : ZC.beginEdit())) },
        { label: sel > 1 ? `Delete ${sel} Contacts` : 'Delete Contact', accel: 'CmdOrCtrl+Backspace', enabled: sel > 0 && !S.editing, run: guard(() => { if (!inText()) ZC.deleteSelected(); }) },
        { separator: true },
        { label: 'Select All Contacts', accel: 'CmdOrCtrl+Shift+A', enabled: has, run: guard(() => ZC.select(ZC.order(), ZC.order()[0], { noScroll: true })) },
        { label: 'Find', accel: 'CmdOrCtrl+F', run: () => { const q = $('#q'); q.focus(); q.select(); } },
      ] }) },
      { label: 'Contact', items: [
        { label: 'Favourite', enabled: sel > 0 && !S.editing, checked: sel > 0 && ZC.selected().every((c) => c.fav), run: guard(() => ZC.toggleFav([...S.sel])) },
        { label: 'Add to Group', enabled: sel > 0 && groups.length > 0 && !S.editing, submenu: groups.length ? groups.map((g) => ({ label: g.name, run: () => ZC.addToGroup([...S.sel], g.id) })) : [{ label: 'No Groups', enabled: false }] },
        { label: 'Remove from This Group', enabled: sel > 0 && !!ZC.group(S.view) && !ZC.group(S.view).smart, run: guard(() => ZC.removeFromGroup([...S.sel], S.view)) },
        { separator: true },
        { label: 'Log Catch-up…', accel: 'CmdOrCtrl+L', enabled: oneSel(), run: guard(() => ZC.catchupDialog(ZC.selected()[0], 'catchup')) },
        { label: 'Add Note…', enabled: oneSel(), run: guard(() => ZC.catchupDialog(ZC.selected()[0], 'note')) },
        { label: 'Set Rhythm…', enabled: oneSel(), run: guard(() => ZC.rhythmDialog(ZC.selected()[0])) },
        { separator: true },
        { label: 'Merge Selected Contacts…', enabled: sel > 1, run: guard(() => ZC.mergeSelected()) },
        { label: 'Find Duplicates…', enabled: S.contacts.length > 1, run: guard(() => ZC.dupesDialog()) },
        { label: 'Clean Up Missing or Invalid Data…', enabled: has, run: guard(() => ZC.cleanupDialog()) },
        { separator: true },
        { label: 'Copy as vCard', enabled: sel > 0, run: guard(() => ZC.copyVcf(ZC.selected())) },
      ] },
      { label: 'View', items: [
        { label: 'Show Groups', accel: 'CmdOrCtrl+Alt+S', checked: innerWidth < 760 ? $('#side').classList.contains('force') : S.prefs.side, run: () => ZC.toggleSide() },
        { separator: true },
        { label: 'All Contacts', accel: 'CmdOrCtrl+1', checked: S.view === 'all', run: guard(() => ZC.setView('all')) },
        { label: 'Favourites', accel: 'CmdOrCtrl+2', checked: S.view === 'fav', run: guard(() => ZC.setView('fav')) },
        { label: 'Birthdays', accel: 'CmdOrCtrl+3', checked: S.view === 'bday', run: guard(() => ZC.setView('bday')) },
        { label: 'Catch up', accel: 'CmdOrCtrl+4', checked: S.view === 'catchup', run: guard(() => ZC.setView('catchup')) },
        { label: 'People Map', accel: 'CmdOrCtrl+5', checked: S.view === 'map', run: guard(() => ZC.setView('map')) },
        { separator: true },
        { label: 'Sort By', submenu: [{ label: 'First Name', checked: S.prefs.sortBy === 'first', run: () => setPref('sortBy', 'first') }, { label: 'Last Name', checked: S.prefs.sortBy === 'last', run: () => setPref('sortBy', 'last') }] },
        { label: 'Show Names As', submenu: [{ label: 'First Last', checked: S.prefs.order === 'first', run: () => setPref('order', 'first') }, { label: 'Last, First', checked: S.prefs.order === 'last', run: () => setPref('order', 'last') }] },
      ] },
      { label: 'Go', items: [
        { label: 'Previous Contact', accel: 'CmdOrCtrl+Alt+Up', run: guard(() => ZC.moveSel(-1)) },
        { label: 'Next Contact', accel: 'CmdOrCtrl+Alt+Down', run: guard(() => ZC.moveSel(1)) },
      ] },
    ]);
  };
  const setPref = (k, v) => { S.prefs[k] = v; S._rows = null; ZC.prefsSave(); ZC.renderAll(); };

  // ---------- keys ----------
  document.addEventListener('keydown', (e) => {
    if (modal()) return;
    const t = e.target;
    if (S.editing && t.closest && t.closest('.card.edit')) {
      if (e.key === 'Enter' && !e.shiftKey && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'range') { e.preventDefault(); ZC.finishEdit(true); return; }
      if (e.key === 'Escape') { e.preventDefault(); ZC.cancelEdit(); return; }
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a' && !inText() && !S.editing) { e.preventDefault(); ZC.select(ZC.order(), ZC.order()[0], { noScroll: true }); return; }
    if (inText() || e.metaKey || e.ctrlKey || e.altKey || S.editing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ZC.moveSel(1, e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ZC.moveSel(-1, e.shiftKey); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const o = ZC.order(); if (o.length) { const id = e.key === 'Home' ? o[0] : o[o.length - 1]; ZC.select([id], id); } }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); ZC.moveSel((e.key === 'PageDown' ? 1 : -1) * Math.max(1, Math.floor($('#list').clientHeight / 46) - 1), e.shiftKey); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === $('#list') && S.sel.size) { e.preventDefault(); ZC.deleteSelected(); }
    else if (e.key === 'Enter' && document.activeElement === $('#list') && S.sel.size === 1) { e.preventDefault(); ZC.beginEdit(); }
    else if (e.key.length === 1 && /\S/.test(e.key) && document.activeElement === $('#list')) { const q = $('#q'); q.focus(); }
  });

  // ---------- files ----------
  const supported = (h) => ['vcf', 'vcard', 'csv', 'zcontacts'].includes(zeng.files.ext(h.name));
  zeng.onFiles((hs) => { if (!hs.some(supported)) return true; ZC.importFiles(hs); return false; });
  let dragN = 0; const veil = $('#drop');
  addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; veil.classList.remove('zk-hidden'); } });
  addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; veil.classList.add('zk-hidden'); } });
  addEventListener('drop', () => { dragN = 0; veil.classList.add('zk-hidden'); });

  // ---------- lifecycle ----------
  const closeApp = async () => { try { if (S.editing) ZC.finishEdit(true); await ZC.flush(); } finally { zeng.quit(); } };
  zeng.on('close', closeApp);
  addEventListener('pagehide', () => ZC.flush()); document.addEventListener('visibilitychange', () => { if (document.hidden) ZC.flush(); });
  addEventListener('beforeunload', () => { if (S.editing) ZC.finishEdit(true); ZC.flush(); });
  addEventListener('resize', () => { ZC.menusSoon(); });

  ZC.initUI();
  await ZC.load();
  const ord = ZC.order(); if (ord.length) { S.sel = new Set([ord[0]]); S.cur = S.anchor = ord[0]; }
  $('#b-side').title = 'Show or Hide Groups'; ZC.renderAll(); ZC.buildMenus();
  // gentle once-a-day nudge for birthdays and anniversaries that fall today
  try { const today = M.dateStr(Date.now()); if (S.prefs.nudged !== today) { const t = M.nudges(S.contacts, 0); if (t.length) { S.prefs.nudged = today; ZC.prefsSave(); setTimeout(() => zk.toast('Today: ' + t.slice(0, 3).map((x) => `${ZC.name(x.c)}’s ${x.kind}`).join(', ') + (t.length > 3 ? ` and ${t.length - 3} more` : ''), 4200), 700); } } } catch {}
  window.__ready = true;
})();
