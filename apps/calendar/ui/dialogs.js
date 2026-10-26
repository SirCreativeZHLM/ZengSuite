/* ZengCalendar dialogs: calendar info, holiday calendars, preferences, go to date, missed alerts. */
(function () {
  'use strict';
  const { time: T, ical: I, holidays: H } = ZC; const { S } = CAL; const el = zk.el; const MIN = 60000;
  const cdot = (c) => el('i.cdot', { style: { background: c } });
  const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray'];
  const confirmRestart = () => { CAL.resetFormats(); CAL.touchMeta(); CAL.applyLayout(); CAL.render({ anim: null }); zeng.refreshMenus && zeng.refreshMenus(); };

  // ------------------------------------------------------------------ calendar info / create
  CAL.editCalendar = (c) => {
    const isNew = !c; const draft = c ? { name: c.name, color: c.color, group: c.group || 'On My Computer', alert: c.alert == null ? '' : String(c.alert) } : { name: 'New Calendar', color: CAL.PALETTE[S.cals.filter((x) => x.kind === 'local').length % CAL.PALETTE.length], group: 'On My Computer', alert: '' };
    const name = el('input.zk-input.selectable', { value: draft.name, 'aria-label': 'Calendar name', style: { width: '100%' } });
    const sw = el('.swatches'); const custom = el('input.zk-color', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#0a84ff', 'aria-label': 'Custom colour', onchange: () => { draft.color = custom.value; paint(); } });
    const paint = () => { sw.replaceChildren(...CAL.PALETTE.map((col, i) => el('button.zk-swatch' + (draft.color === col ? '.sel' : ''), { type: 'button', style: { background: col }, title: COLOR_NAMES[i], 'aria-label': COLOR_NAMES[i], onclick: () => { draft.color = col; paint(); } })), custom); };
    paint();
    const groups = CAL.groups(); if (!groups.includes('On My Computer')) groups.unshift('On My Computer'); const gs = el('select.zk-select', { 'aria-label': 'Group' }, [...groups.map((g) => el('option', { value: g, selected: g === draft.group }, g)), el('option', { value: '__new' }, 'New Group…')]); const gnew = el('input.zk-input.selectable.zk-hidden', { placeholder: 'Group name', 'aria-label': 'New group name' }); gs.addEventListener('change', () => { gnew.classList.toggle('zk-hidden', gs.value !== '__new'); if (gs.value === '__new') gnew.focus(); });
    const alertS = el('select.zk-select', { 'aria-label': 'Default alert' }, [['', 'App default'], ['none', 'None'], ['0', 'At time of event'], ['5', '5 minutes before'], ['10', '10 minutes before'], ['15', '15 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']].map(([v, l]) => el('option', { value: v, selected: v === (c && c.alert === null ? 'none' : draft.alert) }, l)));
    const row = (l, ...k) => el('.er', el('label', l), el('.ctl', ...k));
    const kids = [row('Name', name), el('.er', el('label', 'Colour'), sw), row('Group', gs, gnew)];
    if (!c || c.kind === 'local') kids.push(row('Default alert', alertS));
    if (c && c.sub) kids.push(el('.er', el('label', 'Source'), el('.ctl.col', el('span.selectable', c.sub.name || 'file'), el('.hint', 'Read-only. Choose Calendar › Refresh Subscriptions to re-import ' + (c.sub.at ? '(last: ' + CAL.fmt('dt', { dateStyle: 'medium', timeStyle: 'short' }, new Date(c.sub.at)) + ')' : '') + '. Events are matched by UID.'))));
    if (c && c.kind !== 'local') kids.push(el('.hint', c.kind === 'holiday' ? 'Holidays are computed from rules for any year. This calendar is read-only.' : 'Moon phases are computed astronomically and are approximate. This calendar is read-only.'));
    const buttons = [{ label: 'Cancel', value: null }]; if (c) buttons.push({ label: 'Delete', danger: true, value: 'del' }); buttons.push({ label: isNew ? 'Create' : 'Done', primary: true, value: 'ok' });
    return zk.sheet({ title: isNew ? 'New Calendar' : 'Calendar Info', body: el('.ed.narrow', kids), buttons, width: 440 }).then(async (r) => {
      if (r === 'del') return CAL.deleteCalendarUI(c); if (r !== 'ok') return null;
      const g = gs.value === '__new' ? gnew.value.trim() || 'Other' : gs.value; const alert = alertS.value === '' ? undefined : alertS.value === 'none' ? null : +alertS.value;
      const patch = { name: name.value.trim() || 'Untitled', color: draft.color, group: g }; if (c && c.kind !== 'local') delete patch.alert;
      if (isNew) { const nc = CAL.addCalendar(patch); if (alert !== undefined) nc.alert = alert; CAL.touchMeta(); CAL.renderSide(); return nc; }
      CAL.updateCalendar(c, patch); if (c.kind === 'local') { if (alert === undefined) delete c.alert; else c.alert = alert; } CAL.touchMeta(); CAL.render({ anim: null }); return c;
    });
  };
  CAL.deleteCalendarUI = async (c) => {
    const n = c.kind === 'local' ? CAL.eventsOf(c.id).length : 0;
    if (!(await zk.confirm(`Delete “${c.name}”?`, c.kind === 'local' ? `This removes the calendar and its ${n} event${n === 1 ? '' : 's'}. You can undo this with Edit › Undo.` : 'The calendar will be removed from the list.', 'Delete', { danger: true }))) return;
    CAL.deleteCalendar(c); CAL.render({ anim: null }); zk.toast('Calendar deleted');
  };
  CAL.calendarMenu = (e, c) => {
    const w = c.kind === 'local';
    zk.contextMenu(e, [{ label: 'Get Info…', run: () => CAL.editCalendar(c) }, { label: 'Rename…', run: async () => { const v = await zk.prompt('Rename Calendar', c.name, { ok: 'Rename' }); if (v && v.trim()) { CAL.updateCalendar(c, { name: v.trim() }); CAL.renderSide(); } } },
      { label: 'Colour', submenu: CAL.PALETTE.map((col, i) => ({ label: COLOR_NAMES[i], checked: c.color === col, run: () => { CAL.updateCalendar(c, { color: col }); CAL.render({ anim: null }); } })) }, { separator: true },
      { label: 'Show Only This Calendar', run: () => { S.cals.forEach((x) => { x.visible = x === c; }); CAL.touchMeta(); CAL.render({ anim: null }); } }, { label: 'Show All Calendars', run: () => { S.cals.forEach((x) => { x.visible = true; }); CAL.touchMeta(); CAL.render({ anim: null }); } }, { separator: true },
      ...(w ? [{ label: 'Export as .ics…', run: () => CAL.exportCalendar(c) }, { label: 'Export as Outlook CSV…', run: () => CAL.exportCSVDialog(c) }, { label: 'Import Events into This Calendar…', enabled: !c.readOnly, run: () => CAL.importDialog(c.id) }] : []),
      ...(c.sub ? [{ label: 'Refresh from File', run: () => CAL.refreshSubscription(c) }, { label: 'Stop Subscription (make editable)', run: () => { delete c.sub; c.readOnly = false; CAL.touchMeta(); CAL.render({ anim: null }); } }] : []), { separator: true }, { label: 'Delete Calendar…', run: () => CAL.deleteCalendarUI(c) }]);
  };

  // ------------------------------------------------------------------ holiday calendars
  CAL.holidayDialog = () => {
    const have = new Set(S.cals.filter((c) => c.kind === 'holiday').map((c) => c.country)); const moon = S.cals.some((c) => c.kind === 'moon'); const boxes = {};
    const rows = Object.entries(H.countries).map(([cc, n]) => { const b = el('input.zk-check', { type: 'checkbox', checked: have.has(cc), 'aria-label': n }); boxes[cc] = b; return el('label.hrow', b, el('span', n + ' Holidays')); });
    const mb = el('input.zk-check', { type: 'checkbox', checked: moon, 'aria-label': 'Moon phases' });
    const body = el('.hl', el('.hint', 'Computed offline from rules (Easter, nth weekday, lunisolar dates), so every year works. Regional and religious holidays are not included.'), rows, el('hr'), el('label.hrow', mb, el('span', 'Moon Phases (approximate)')));
    return zk.sheet({ title: 'Holiday Calendars', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Done', primary: true, value: 'ok' }], width: 400 }).then((r) => {
      if (r !== 'ok') return;
      for (const [cc, b] of Object.entries(boxes)) { const ex = S.cals.find((c) => c.kind === 'holiday' && c.country === cc); if (b.checked && !ex) S.cals.push(CAL.holidayCal(cc)); else if (!b.checked && ex) S.cals = S.cals.filter((c) => c !== ex); }
      const mc = S.cals.find((c) => c.kind === 'moon'); if (mb.checked && !mc) S.cals.push({ id: 'moon', name: 'Moon Phases', color: '#8e8e93', group: 'Holidays', visible: true, kind: 'moon', readOnly: true }); else if (!mb.checked && mc) S.cals = S.cals.filter((c) => c !== mc);
      CAL.touchMeta(); CAL.render({ anim: null });
    });
  };

  // ------------------------------------------------------------------ preferences
  CAL.preferences = () => {
    const s = S.set; const row = (l, ...k) => el('.er', el('label', l), el('.ctl', ...k)); const sel = (opts, val, on, label) => { const x = el('select.zk-select', { 'aria-label': label, onchange: () => on(x.value) }, opts.map(([v, l]) => el('option', { value: v, selected: String(v) === String(val) }, l))); return x; };
    const sw = (val, on, label) => { const x = el('input.zk-switch', { type: 'checkbox', checked: val, 'aria-label': label, onchange: () => on(x.checked) }); return x; };
    const hours = (min) => [...Array(25).keys()].map((h) => [h * 60, CAL.fmtHour(h % 24) + (h === 24 ? ' (end)' : '')]);
    const days = el('.ctl.wk', [1, 2, 3, 4, 5, 6, 0].map((d) => { const b = el('button.zk-btn.bordered.wd' + (s.workDays.includes(d) ? '.on' : ''), { type: 'button', 'aria-pressed': s.workDays.includes(d), onclick: () => { s.workDays = s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d]; b.classList.toggle('on'); b.setAttribute('aria-pressed', s.workDays.includes(d)); } }, CAL.weekdayName(d, 'short')); return b; }));
    const wc = CAL.writableCals();
    const body = el('.ed.narrow',
      row('Week starts on', sel([['', 'System'], [0, 'Sunday'], [1, 'Monday'], [6, 'Saturday']], s.firstDay == null ? '' : s.firstDay, (v) => { s.firstDay = v === '' ? null : +v; }, 'First day of week')),
      row('Time format', sel([['auto', 'System'], ['12', '12-hour'], ['24', '24-hour']], s.clock, (v) => { s.clock = v; }, 'Time format')),
      row('Week numbers', sw(s.weekNumbers, (v) => { s.weekNumbers = v; }, 'Show week numbers'), el('span.hint', s.firstDay === 1 || (s.firstDay == null && CAL.firstDay() === 1) ? 'ISO 8601' : 'Week 1 contains January 1')),
      row('Show travel time', sw(s.travelShow, (v) => { s.travelShow = v; }, 'Show travel time')), el('hr'),
      row('Working hours', sel(hours(), s.workStart, (v) => { s.workStart = +v; }, 'Day starts'), el('span', 'to'), sel(hours(), s.workEnd, (v) => { s.workEnd = +v; }, 'Day ends')), el('.er', el('label', 'Working days'), days), el('hr'),
      row('Snap to', sel([[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']], s.snap, (v) => { s.snap = +v; }, 'Snap')),
      row('New event length', sel([[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours']], s.defaultDur, (v) => { s.defaultDur = +v; }, 'Default length')),
      row('Default calendar', sel(wc.map((c) => [c.id, c.name]), s.defaultCal, (v) => { s.defaultCal = v; }, 'Default calendar')),
      row('Default alert', sel([['', 'None'], [0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before']], s.defaultAlert == null ? '' : s.defaultAlert, (v) => { s.defaultAlert = v === '' ? null : +v; }, 'Default alert')),
      row('Days in multi-day view', sel([2, 3, 4, 5, 6, 7, 10, 14].map((n) => [n, n + ' days']), s.nDays, (v) => { s.nDays = +v; }, 'Days')));
    return zk.sheet({ title: 'Preferences', body, buttons: [{ label: 'Done', primary: true }], width: 480 }).then(() => confirmRestart());
  };

  // ------------------------------------------------------------------ go to date
  CAL.goToDate = async () => {
    const inp = el('input.zk-input.d', { type: 'date', value: S.date.getFullYear() + '-' + T.pad(S.date.getMonth() + 1) + '-' + T.pad(S.date.getDate()), 'aria-label': 'Date', style: { height: '30px' } });
    const r = await zk.sheet({ title: 'Go to Date', body: inp, buttons: [{ label: 'Cancel', value: null }, { label: 'Go', primary: true, value: 'ok' }], width: 300 }); if (r !== 'ok' || !inp.value) return;
    const [y, m, d] = inp.value.split('-').map(Number); CAL.goto(new Date(y, m - 1, d), 'zoom');
  };

  // ------------------------------------------------------------------ missed alerts
  CAL.showMissed = async () => {
    const list = (S.alerts.missed || []).filter((m) => !S.alerts.dismissed[m.key]); const items = list.map((m) => ({ ...m, o: CAL.occById(m.occ) })).filter((m) => m.o);
    if (!items.length) { zk.toast('No missed alerts'); return; }
    const body = el('.ma', el('.hint', 'These alerts fired while ZengCalendar was not running.'), items.map((m) => el('.ma-row', { style: { '--c': m.o.color } }, el('i.bar'), el('.at', el('b', I.F(m.o, 'title')), el('span', 'Alert ' + CAL.fmt('dt', { dateStyle: 'medium', timeStyle: 'short' }, new Date(m.at)) + ' · event ' + CAL.fmtWhen(m.o))), el('button.zk-btn.bordered', { type: 'button', onclick: () => { CAL.dismissAlert(m.key); body.querySelector('.ma-row') && 0; zk.toast('Dismissed'); const sheet = document.querySelector('.zk-scrim .zk-sheet'); sheet && sheet.close && sheet.close('open:' + m.occ); } }, 'Show'))));
    const r = await zk.sheet({ title: 'Missed Alerts', body, buttons: [{ label: 'Close', value: null }, { label: 'Dismiss All', primary: true, value: 'all' }], width: 480 });
    if (r === 'all') { for (const m of items) CAL.dismissAlert(m.key); S.alerts.missed = []; CAL.persistAlerts(); CAL.updateMenus && CAL.updateMenus(); }
    else if (typeof r === 'string' && r.startsWith('open:')) { const o = CAL.occById(r.slice(5)); if (o) { S.sel = o.id; CAL.goto(new Date(o.s), 'zoom'); } }
  };
})();
