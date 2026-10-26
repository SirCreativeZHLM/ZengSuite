/* ZengCalendar boot: menus, keyboard, timers, alert engine, files. */
(async () => {
  'use strict';
  await zeng.ready; const { time: T, ical: I } = ZC; const { S } = CAL; const MIN = 60000, DAY = T.DAY; const $ = (s) => document.querySelector(s);
  await CAL.load(); S.date = CAL.day0(new Date()); S.miniDate = new Date(S.date.getFullYear(), S.date.getMonth(), 1);
  if (!['day', 'workweek', 'week', 'days', 'month', 'year', 'agenda'].includes(S.set.view)) S.set.view = 'week';

  // ---------------------------------------------------------------- actions
  const inText = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  const sheetOpen = () => !!document.querySelector('.zk-scrim');
  const nextSlot = () => { const now = new Date(); const d = new Date(S.date); const s = T.sameDay(d, now) ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.min(23, now.getHours() + 1)) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.max(8, Math.floor(S.set.workStart / 60))); return [s, new Date(s.getTime() + (S.set.defaultDur || 60) * MIN)]; };
  const newEvent = (allDay) => { const [s, e] = nextSlot(); const day = CAL.day0(s); const ev = allDay ? CAL.draftFor(day, CAL.addDays(day, 1), true) : CAL.draftFor(s, e, false); if (ev) CAL.openEditor(null, ev); };
  const doUndo = () => { if (inText()) return document.execCommand('undo'); const l = CAL.undo(); if (l) { CAL.render({ anim: null }); zk.toast('Undid ' + l); } else zk.toast('Nothing to undo'); };
  const doRedo = () => { if (inText()) return document.execCommand('redo'); const l = CAL.redo(); if (l) { CAL.render({ anim: null }); zk.toast('Redid ' + l); } else zk.toast('Nothing to redo'); };
  const sel = () => CAL.selected();
  const zoom = (d) => { S.set.hourH = zk.clamp(S.set.hourH + d, 28, 120); CAL.touchMeta(); CAL.render({ anim: null }); };
  const exportSel = () => { const o = sel(); if (o && !o.ro) CAL.exportOccurrence(o); else zk.toast('Select an event first'); };

  // ---------------------------------------------------------------- menus
  const buildMenus = () => {
    const v = S.set.view; const vi = (id, label, n) => ({ label, accel: 'CmdOrCtrl+' + n, checked: v === id, run: () => CAL.setView(id) });
    return [
      { label: 'File', items: [{ label: 'New Event…', accel: 'CmdOrCtrl+N', run: () => newEvent(false) }, { label: 'New All-Day Event…', accel: 'CmdOrCtrl+Shift+N', run: () => newEvent(true) }, { label: 'Quick Add…', accel: 'CmdOrCtrl+Alt+N', run: () => CAL.quickAdd() }, { label: 'New Calendar…', run: () => CAL.editCalendar(null) }, { separator: true },
        { label: 'Import…', accel: 'CmdOrCtrl+O', run: () => CAL.importDialog() }, { label: 'Subscribe from File…', run: () => CAL.subscribeFromFile() }, { label: 'Refresh Subscriptions', accel: 'CmdOrCtrl+R', run: () => CAL.refreshAll() },
        { label: 'Export', submenu: [{ label: 'All Calendars as .ics…', run: () => CAL.exportAll() }, { label: 'Selected Event as .ics…', run: exportSel }, { label: 'Outlook CSV…', run: () => CAL.exportCSVDialog(null) }, { separator: true }, ...S.cals.filter((c) => c.kind === 'local').map((c) => ({ label: c.name + ' as .ics…', run: () => CAL.exportCalendar(c) }))] },
        { separator: true }, { label: 'Print…', accel: 'CmdOrCtrl+P', run: () => CAL.print() }, ...(zeng.platform === 'mac' && zeng.isNative ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => zeng.quit() }])] },
      { label: 'Edit', items: zeng.stdEdit({ undo: doUndo, redo: doRedo, extra: [{ label: 'Edit Event…', accel: 'CmdOrCtrl+E', run: () => { const o = sel(); if (o) o.ro ? CAL.showInfo(o) : CAL.openEditor(o); } }, { label: 'Duplicate Event', accel: 'CmdOrCtrl+D', run: () => { const o = sel(); if (o && !o.ro) CAL.duplicateOcc(o); } }, { label: 'Delete Event', run: () => { const o = sel(); if (o) CAL.deleteOcc(o); } }, { separator: true }, { label: 'Find…', accel: 'CmdOrCtrl+F', run: () => { $('#q').focus(); $('#q').select(); } }, { label: 'Find Free Time…', accel: 'CmdOrCtrl+Shift+F', run: () => CAL.suggestTime() }] }) },
      { label: 'View', items: [vi('day', 'Day', 1), vi('workweek', 'Work Week', 2), vi('week', 'Week', 3), vi('days', 'Multi-Day (' + S.set.nDays + ')', 4), vi('month', 'Month', 5), vi('year', 'Year', 6), vi('agenda', 'List', 7), { separator: true },
        { label: 'Go to Today', accel: 'CmdOrCtrl+T', run: () => CAL.today() }, { label: 'Go to Date…', accel: 'CmdOrCtrl+Shift+T', run: () => CAL.goToDate() }, { label: 'Previous', accel: 'CmdOrCtrl+Left', run: () => CAL.nav(-1) }, { label: 'Next', accel: 'CmdOrCtrl+Right', run: () => CAL.nav(1) }, { separator: true },
        { label: 'Show Sidebar', accel: 'CmdOrCtrl+Alt+S', checked: S.set.sidebar, run: () => CAL.toggleSidebar() }, { label: 'Time Balance', accel: 'CmdOrCtrl+B', checked: S.set.sidebar && S.railTab === 'bal', run: () => { S.railTab = S.railTab === 'bal' && S.set.sidebar ? 'cals' : 'bal'; S.set.sidebar = true; CAL.applyLayout(); CAL.renderSide(); CAL.updateToolbar(); } }, { label: 'Free-Time Ribbon', checked: S.set.ribbon !== false, run: () => { S.set.ribbon = !(S.set.ribbon !== false); CAL.touchMeta(); CAL.render({ anim: null }); } }, { label: 'Week Numbers', checked: S.set.weekNumbers, run: () => { S.set.weekNumbers = !S.set.weekNumbers; CAL.touchMeta(); CAL.render({ anim: null }); } }, { separator: true },
        { label: 'Zoom In', accel: 'CmdOrCtrl+Plus', run: () => zoom(8) }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: () => zoom(-8) }] },
      { label: 'Calendar', items: [{ label: 'New Calendar…', run: () => CAL.editCalendar(null) }, { label: 'Holiday Calendars…', run: () => CAL.holidayDialog() }, { separator: true }, { label: 'Protect Selected as Focus Block', run: () => { const o = sel(); if (o) CAL.toggleFocus(o); } }, { label: 'Find Free Time…', run: () => CAL.suggestTime() },
        { label: 'Missed Alerts…' + ((S.alerts.missed || []).length ? ' (' + S.alerts.missed.length + ')' : ''), run: () => CAL.showMissed() }, { separator: true }, { label: 'Show All Calendars', run: () => { S.cals.forEach((c) => { c.visible = true; }); CAL.touchMeta(); CAL.render({ anim: null }); } }, { label: 'Preferences…', accel: 'CmdOrCtrl+,', run: () => CAL.preferences() }] },
    ];
  };
  let menuSig = '';
  CAL.updateMenus = () => { const sig = [S.set.view, S.set.sidebar, S.railTab, S.set.ribbon, S.set.weekNumbers, S.set.nDays, S.cals.map((c) => c.name).join(), (S.alerts.missed || []).length, zeng.platform].join('|'); if (sig === menuSig) return; menuSig = sig; zeng.setMenus(buildMenus()); };

  // ---------------------------------------------------------------- build UI
  CAL.buildToolbar(); CAL.initInteract(); CAL.applyLayout(); CAL.render({ anim: null }); CAL.updateMenus(); document.addEventListener('cal-render', CAL.updateMenus);
  zeng.shortcut('CmdOrCtrl+F', () => { $('#q').focus(); $('#q').select(); });

  // ---------------------------------------------------------------- keyboard (plain keys, ignored while typing or in a sheet)
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || inText() || sheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return; const k = e.key;
    const views = { 1: 'day', 2: 'workweek', 3: 'week', 4: 'days', 5: 'month', 6: 'year', 7: 'agenda' };
    if (k === 'ArrowLeft') { e.preventDefault(); CAL.nav(-1); } else if (k === 'ArrowRight') { e.preventDefault(); CAL.nav(1); }
    else if (k === 't' || k === 'T') { CAL.today(); } else if (views[k]) { CAL.setView(views[k]); }
    else if (k === 'n' || k === 'N') { e.preventDefault(); CAL.quickAdd(); } else if (k === '/') { e.preventDefault(); $('#q').focus(); }
    else if (k === 'Delete' || k === 'Backspace') { const o = sel(); if (o && !o.ro) { e.preventDefault(); CAL.deleteOcc(o); } }
    else if (k === 'Enter') { const o = sel(); if (o) { e.preventDefault(); o.ro ? CAL.showInfo(o) : CAL.openEditor(o); } }
    else if (k === 'Escape') { if (S.sel) CAL.select(null); }
  });
  addEventListener('copy', (e) => { if (inText()) return; const o = sel(); if (o) { e.preventDefault(); CAL.copyOcc(o); } });
  addEventListener('cut', (e) => { if (inText()) return; const o = sel(); if (o && !o.ro) { e.preventDefault(); CAL.copyOcc(o); CAL.deleteOcc(o); } });
  addEventListener('paste', (e) => { if (inText()) return; if (S.clip) { e.preventDefault(); const o = sel(); CAL.pasteAt(o && !o.allDay ? new Date(o.s) : null); } });

  // ---------------------------------------------------------------- layout
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { CAL.applyLayout(); if (CAL.cur.view === 'month' && CAL.cur.fillMonth) CAL.cur.fillMonth(); }, 80); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) CAL.flush(); else { CAL.tickNow(); alertTick(); } }); addEventListener('pagehide', () => CAL.flush());
  setInterval(CAL.tickNow, 30000);

  // ---------------------------------------------------------------- alert engine
  const alertTick = (startup) => {
    const now = Date.now(); const from = S.alerts.lastCheck || now; S.alerts.lastCheck = now;
    for (const a of CAL.alertsBetween(from, now)) { if (S.alerts.dismissed[a.key] || S.alerts.snoozed[a.key]) continue; if (startup) continue; CAL.showBanner(a); }
    for (const [key, until] of Object.entries(S.alerts.snoozed)) if (until <= now) { delete S.alerts.snoozed[key]; const [occ, idx] = [key.slice(0, key.lastIndexOf('#')), +key.slice(key.lastIndexOf('#') + 1)]; const o = CAL.occById(occ); if (o) CAL.showBanner({ key, o, at: now, m: ((I.F(o, 'alarms') || [])[idx] || {}).m || 0 }); }
    if (!startup) CAL.persistAlerts();
  };
  const startupMissed = () => { // alerts that fired while the app was not running
    const now = Date.now(); const last = S.alerts.lastCheck; S.alerts.lastCheck = now; CAL.pruneAlertState(); if (!last) { CAL.persistAlerts(); return; }
    const found = CAL.alertsBetween(Math.max(last, now - 7 * DAY), now).filter((a) => !S.alerts.dismissed[a.key] && !S.alerts.snoozed[a.key] && a.o.e > now - DAY);
    S.alerts.missed = found.map((a) => ({ key: a.key, occ: a.o.id, at: a.at })); CAL.persistAlerts(); CAL.updateMenus(); if (found.length) setTimeout(() => CAL.showMissed(), 400);
  };
  startupMissed(); setInterval(() => alertTick(false), 15000); CAL.onHistory = () => {};

  // ---------------------------------------------------------------- files from the OS (double-click .ics, drop on window/dock)
  zeng.onFiles((hs) => CAL.handleFiles(hs));
  zeng.on('close', async () => { await CAL.flush(); zeng.quit(); });
  CAL.alertTick = alertTick; window.__cal = CAL; // for tests
})();
