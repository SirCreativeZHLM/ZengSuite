/* ZengCalendar import / export / subscribe-from-file / print. */
(function () {
  'use strict';
  const { time: T, ical: I, csv: CSV } = ZC; const { S } = CAL; const el = zk.el; const DAY = T.DAY;
  const ICS_FILTER = [{ name: 'iCalendar', exts: ['ics', 'ical', 'ifb', 'icalendar'] }]; const CSV_FILTER = [{ name: 'Outlook CSV', exts: ['csv'] }];
  const safeName = (s) => String(s || 'Calendar').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  // ------------------------------------------------------------------ apply parsed events to a calendar
  /** Insert or update (match by UID inside the target calendar). Returns {added, updated, removed, changes}. */
  CAL.applyImport = (events, calId, { mirror = false } = {}) => {
    const changes = []; let added = 0, updated = 0, removed = 0; const mine = new Map(); for (const e of S.ev.values()) if (e.cal === calId) mine.set(e.uid, e); const seen = new Set();
    for (const src of events) {
      const e = CAL.clone(src); e.cal = calId; if (!e.overrides) e.overrides = {}; seen.add(e.uid); const old = mine.get(e.uid);
      if (old) { e.id = old.id; e.created = old.created || e.created; changes.push(CAL.put(e)); updated++; }
      else { if (S.ev.has(e.id)) e.id = e.uid + '~' + zk.uid(); const ch = CAL.put(e); changes.push(ch); added++; }
    }
    if (mirror) for (const [uid, old] of mine) if (!seen.has(uid)) { changes.push(CAL.remove(old)); removed++; }
    return { added, updated, removed, changes };
  };

  // ------------------------------------------------------------------ read + parse a file handle
  const readEvents = async (h) => {
    const ext = zeng.files.ext(h.name); const text = await zeng.files.readText(h);
    if (ext === 'csv') { const r = CSV.toEvents(text); return { events: r.events, name: h.name.replace(/\.[^.]+$/, ''), color: '', warnings: r.warnings, csv: true }; }
    const r = I.parse(text); return { events: r.events, name: r.name || h.name.replace(/\.[^.]+$/, ''), color: r.color, warnings: r.warnings };
  };
  const summary = (events) => { let rec = 0, lo = Infinity, hi = -Infinity; for (const e of events) { if (I.isRecurring(e)) rec++; const b = I.base(e); if (b.s < lo) lo = b.s; if (b.s > hi) hi = b.s; } const f = (t) => CAL.fmt('dsh', { month: 'short', year: 'numeric' }, new Date(t)); return plural(events.length, 'event') + (rec ? ` (${rec} repeating)` : '') + (events.length ? ` from ${f(lo)}${f(lo) === f(hi) ? '' : ' to ' + f(hi)}` : ''); };

  /** Ask where to import; returns {mode:'existing'|'new', calId, name} or null */
  CAL.importPrompt = async (file, info, preselect) => {
    const wc = CAL.writableCals(); const sel = el('select.zk-select', { 'aria-label': 'Calendar' }, wc.map((c) => el('option', { value: c.id, selected: c.id === (preselect || S.set.defaultCal) }, c.name)));
    const nameIn = el('input.zk-input.selectable', { value: info.name, 'aria-label': 'New calendar name', style: { flex: 1 } }); const r1 = el('input.zk-radio', { type: 'radio', name: 'imp', checked: !!wc.length, 'aria-label': 'Add to existing calendar' }), r2 = el('input.zk-radio', { type: 'radio', name: 'imp', checked: !wc.length, 'aria-label': 'Create new calendar' });
    nameIn.addEventListener('focus', () => { r2.checked = true; }); sel.addEventListener('focus', () => { r1.checked = true; });
    const body = el('.imp', el('div', summary(info.events)), info.warnings.length ? el('.hint', plural(info.warnings.length, 'item') + ' skipped: ' + info.warnings.slice(0, 2).join('; ')) : null, wc.length ? el('label.er', r1, el('span', 'Import into'), sel) : null, el('label.er', r2, el('span', 'New calendar'), nameIn), el('.hint', 'Events already in the calendar with the same UID are updated, not duplicated.'));
    const r = await zk.sheet({ title: `Import “${file}”`, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Import', primary: true, value: 'ok' }], width: 440 }); if (r !== 'ok') return null;
    return r2.checked ? { mode: 'new', name: nameIn.value.trim() || info.name || 'Imported' } : { mode: 'existing', calId: sel.value };
  };
  CAL.importHandles = async (hs, preselect) => {
    for (const h of hs) {
      try {
        const info = await readEvents(h); if (!info.events.length) { await zk.alert('Nothing to import', `“${h.name}” does not contain any events.`); continue; }
        const dest = await CAL.importPrompt(h.name, info, preselect); if (!dest) continue; let cal;
        if (dest.mode === 'new') cal = CAL.addCalendar({ name: dest.name, color: info.color || undefined }); else cal = CAL.calById(dest.calId);
        const r = CAL.applyImport(info.events, cal.id); CAL.commit('Import Events', r.changes); cal.visible = true; CAL.touchMeta(); CAL.render({ anim: null });
        const first = info.events.map((e) => I.base(e).s).sort((a, b) => a - b)[0]; if (first && (first < CAL.cur.from || first >= CAL.cur.to) && !I.isRecurring(info.events[0])) CAL.goto(new Date(first), 'zoom');
        zk.toast(`Imported ${plural(r.added, 'event')}${r.updated ? `, updated ${r.updated}` : ''} into ${cal.name}`, 2600);
      } catch (e) { await zk.alert(`Can’t import “${h.name}”`, e.message || String(e)); }
    }
  };
  CAL.importDialog = async (calId) => { const hs = await zeng.files.open({ filters: [{ name: 'Calendar files', exts: ['ics', 'ical', 'icalendar', 'csv'] }, ...ICS_FILTER, ...CSV_FILTER], multiple: true }); if (hs && hs.length) await CAL.importHandles(hs, calId); };
  CAL.handleFiles = (hs) => { const ok = hs.filter((h) => ['ics', 'ical', 'icalendar', 'ifb', 'csv', 'vcs'].includes(zeng.files.ext(h.name))); if (!ok.length) return true; CAL.importHandles(ok); return false; };

  // ------------------------------------------------------------------ subscribe from file (re-import updates by UID)
  CAL.subscribeFromFile = async () => {
    const hs = await zeng.files.open({ filters: ICS_FILTER }); if (!hs || !hs[0]) return; const h = hs[0];
    try {
      const info = await readEvents(h); const nameIn = el('input.zk-input.selectable', { value: info.name, 'aria-label': 'Calendar name', style: { width: '100%' } });
      const r = await zk.sheet({ title: 'Subscribe from File', body: el('.imp', el('div', summary(info.events)), el('label.er', el('span', 'Name'), nameIn), el('.hint', 'Subscribing by URL needs a network, which this app never uses. Instead, this calendar mirrors the file: use Calendar › Refresh Subscriptions after the file changes, and events are matched by UID (added, updated, and removed if gone from the file). The calendar is read-only.')), buttons: [{ label: 'Cancel', value: null }, { label: 'Subscribe', primary: true, value: 'ok' }], width: 460 }); if (r !== 'ok') return;
      const cal = CAL.addCalendar({ name: nameIn.value.trim() || info.name, color: info.color || undefined, group: 'Subscribed', readOnly: true, sub: { name: h.name, path: h.path || null, at: Date.now() } });
      const res = CAL.applyImport(info.events, cal.id, { mirror: true }); CAL.commit('Subscribe', res.changes); CAL.touchMeta(); CAL.render({ anim: null }); zk.toast(`Subscribed: ${plural(res.added, 'event')}`);
    } catch (e) { zk.alert('Can’t subscribe', e.message || String(e)); }
  };
  CAL.refreshSubscription = async (c, quiet) => {
    let h = c.sub.path ? { name: c.sub.name, path: c.sub.path } : null;
    try {
      if (h) { try { await zeng.files.read(h); } catch { h = null; } }
      if (!h) { const hs = await zeng.files.open({ filters: ICS_FILTER }); if (!hs || !hs[0]) return false; h = hs[0]; }
      const info = await readEvents(h); const r = CAL.applyImport(info.events, c.id, { mirror: true }); CAL.commit('Refresh Subscription', r.changes); c.sub = { name: h.name, path: h.path || c.sub.path || null, at: Date.now() }; CAL.touchMeta(); CAL.render({ anim: null });
      if (!quiet) zk.toast(`${c.name}: ${r.added} added, ${r.updated} updated, ${r.removed} removed`, 2800); return true;
    } catch (e) { if (!quiet) zk.alert(`Can’t refresh “${c.name}”`, e.message || String(e)); return false; }
  };
  CAL.refreshAll = async () => { const subs = S.cals.filter((c) => c.sub); if (!subs.length) { zk.toast('No subscribed calendars. Use Calendar › Subscribe from File.'); return; } for (const c of subs) await CAL.refreshSubscription(c); };

  // ------------------------------------------------------------------ export
  const writeFile = async (data, name, filters) => { const h = await zeng.files.saveAs(data, { name, filters }); if (h) zk.toast('Exported ' + h.name); return h; };
  CAL.exportCalendar = (c) => { if (c.kind !== 'local') return zk.alert('Can’t export', 'Only calendars with your own events can be exported.'); const events = CAL.eventsOf(c.id); return writeFile(I.serialize(events, { name: c.name, color: c.color }), safeName(c.name) + '.ics', ICS_FILTER); };
  CAL.exportAll = () => { const events = [...S.ev.values()].filter((e) => (CAL.calById(e.cal) || {}).kind === 'local'); if (!events.length) return zk.alert('Nothing to export', 'There are no events yet.'); return writeFile(I.serialize(events, { name: 'ZengCalendar' }), 'ZengCalendar.ics', ICS_FILTER); };
  CAL.exportCSVDialog = async (c) => {
    const y = new Date(); const f = (d) => d.getFullYear() + '-' + T.pad(d.getMonth() + 1) + '-' + T.pad(d.getDate());
    const calS = el('select.zk-select', { 'aria-label': 'Calendar' }, [el('option', { value: '' }, 'All calendars'), ...S.cals.filter((x) => x.kind === 'local').map((x) => el('option', { value: x.id, selected: c && x.id === c.id }, x.name))]);
    const a = el('input.zk-input.d', { type: 'date', value: f(new Date(y.getFullYear() - 1, y.getMonth(), y.getDate())), 'aria-label': 'From' }), b = el('input.zk-input.d', { type: 'date', value: f(new Date(y.getFullYear() + 2, y.getMonth(), y.getDate())), 'aria-label': 'To' });
    const body = el('.ed.narrow', el('.er', el('label', 'Calendar'), el('.ctl', calS)), el('.er', el('label', 'From'), el('.ctl', a)), el('.er', el('label', 'To'), el('.ctl', b)), el('.hint', 'Outlook CSV has no repeat rules, so each occurrence in the range becomes its own row. Times are exported in this computer’s time zone.'));
    const r = await zk.sheet({ title: 'Export Outlook CSV', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Export', primary: true, value: 'ok' }], width: 440 }); if (r !== 'ok') return;
    const from = new Date(a.value + 'T00:00:00').getTime(), to = new Date(b.value + 'T00:00:00').getTime() + DAY; const occs = CAL.occurrences(from, to, { all: true }).filter((o) => o.cal.kind === 'local' && (!calS.value || o.cal.id === calS.value));
    if (!occs.length) return zk.alert('Nothing to export', 'No events in that range.'); await writeFile(CSV.fromOccurrences(occs), safeName(calS.value ? CAL.calById(calS.value).name : 'ZengCalendar') + '.csv', CSV_FILTER);
  };
  CAL.exportOccurrence = (o) => writeFile(I.serialize([o.ev], { name: I.F(o, 'title') }), safeName(I.F(o, 'title')) + '.ics', ICS_FILTER);

  // ------------------------------------------------------------------ print
  CAL.print = () => {
    const t = CAL.viewTitle(); let head = document.querySelector('#printhead'); if (!head) { head = el('#printhead'); document.querySelector('.cal-main').prepend(head); }
    head.replaceChildren(el('b', t.main), el('span', ' ' + t.sub), el('em', S.cals.filter((c) => c.visible && c.kind === 'local').map((c) => c.name).join(' · '))); zeng.print();
  };
})();
