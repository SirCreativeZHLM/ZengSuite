/* Details panel for the selected reminder (or bulk edit for several). */
(function () {
  const A = ZR.A, V = ZR.views, D = ZR.dates, h = zk.el, ST = ZR.store, R = ZR.recur; const el = A.$('#insp'); let shownId = null;
  const icon = zk.icon;
  const upd = (id, patch, label, key) => ST.commit(label || 'Edit Reminder', (d) => d.set(id, patch), key ? { key: key + id } : {});
  const ib = (name, color) => h('span.ib', { style: { background: color } }, icon(name));
  const fr = (label, ic, color, ...ctl) => h('.fr', h('.lb', ic ? ib(ic, color) : null, h('span', label)), h('.val', ...ctl));
  const sw = (on, fn, label, disabled) => h('input.zk-switch', { type: 'checkbox', checked: on, disabled, 'aria-label': label, onchange: (e) => fn(e.target.checked) });
  const sel = (opts, cur, fn, label, disabled) => h('select.zk-select', { disabled, 'aria-label': label, onchange: (e) => fn(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(cur) }, l)));
  const EARLY = [[-1, 'None'], [0, 'At time'], [5, '5 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [2880, '2 days before']];
  const REP = [['none', 'Never'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 Weeks'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom…']];
  async function addImage(id, file) {
    try {
      if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(file.name)) throw new Error('Only images can be attached.');
      const bmp = await createImageBitmap(file); const max = 1600; const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, c.width, c.height);
      let data = /png|gif|webp/i.test(file.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86); if (data.length > 1.4e6) data = c.toDataURL('image/jpeg', 0.8);
      const aid = await ST.att.put({ name: file.name, type: 'image', data }); const r = A.S().reminders[id]; ST.commit('Add Attachment', (d) => d.set(id, { atts: [...(r.atts || []), { id: aid, name: file.name }] }));
    } catch (e) { zk.alert('Can’t attach this file', e.message || String(e)); }
  }
  A.attachFiles = async (id, hs) => { for (const hd of hs) { const f = hd.file || new File([await zeng.files.read(hd)], hd.name, { type: /\.png$/i.test(hd.name) ? 'image/png' : /\.gif$/i.test(hd.name) ? 'image/gif' : /\.webp$/i.test(hd.name) ? 'image/webp' : 'image/jpeg' }); await addImage(id, f); } };

  function single(r) {
    const S = A.S(); const root = h('div'); const id = r.id; const lc = A.listColor(r); const hasDue = !!r.due;
    root.append(h('.hd', h('span', 'Details'), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Close details', onclick: () => A.setInsp(false) }, icon('x'))));
    const title = h('input.t.title.selectable', { value: r.title, 'data-f': 'title', 'aria-label': 'Title', placeholder: 'Title', onchange: (e) => { const v = e.target.value.replace(/\s+/g, ' ').trim(); if (v) upd(id, { title: v }, 'Edit Title', 'title:'); else e.target.value = r.title; } });
    const notes = h('textarea.t.selectable', { 'data-f': 'notes', 'aria-label': 'Notes', placeholder: 'Notes', spellcheck: true, onchange: (e) => upd(id, { notes: e.target.value }, 'Edit Notes', 'notes:') }); notes.value = r.notes || '';
    const url = h('input.t.selectable', { value: r.url || '', 'data-f': 'url', 'aria-label': 'URL', placeholder: 'URL', autocapitalize: 'off', spellcheck: false, onchange: (e) => upd(id, { url: e.target.value.trim() }, 'Edit URL', 'url:') });
    root.append(h('.grp', h('.fr', title), h('.fr', notes), h('.fr', url, r.url ? h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Open link', onclick: () => A.openLink(r.url) }, icon('external-link')) : null)));
    // date & time
    const dateBtn = h('button.zk-btn.bordered', { type: 'button', 'data-f': 'date', onclick: (e) => A.pickDate(e.currentTarget, { date: r.due, time: r.time, onChange: (d, t) => A.setDue([id], d, t) }) }, hasDue ? D.rel(r.due, A.now) + (r.due.slice(0, 4) !== String(A.now.getFullYear()) ? '' : '') : 'Set date');
    const timeIn = h('input.zk-input.selectable', { placeholder: 'Add time', value: r.time ? A.timeText(r.time) : '', disabled: !hasDue, style: { width: '96px', textAlign: 'right' }, 'aria-label': 'Time', 'data-f': 'time', onchange: (e) => { const v = e.target.value.trim(); if (!v) return A.setDue([id], r.due, null); const p = ZR.parser.parse('at ' + v.replace(/^at\s+/i, ''), { now: A.now }); if (p.time) A.setDue([id], r.due, p.time); else { e.target.value = r.time ? A.timeText(r.time) : ''; A.toast('Couldn’t read that time.', { ms: 2000 }); } } });
    const g2 = h('.grp', fr('Date', 'calendar', '#ff3b30', hasDue ? dateBtn : null, sw(hasDue, (on) => A.setDue([id], on ? (r.due || D.today(A.now)) : null), 'Date')), fr('Time', 'clock', '#007aff', timeIn, sw(!!r.time, (on) => A.setDue([id], r.due, on ? (r.time || '09:00') : null), 'Time', !hasDue)));
    const pre = R.presetOf(r.repeat); const repOpts = pre === 'custom' ? REP.map(([v, l]) => (v === 'custom' ? ['custom', R.label(r.repeat)] : [v, l])) : REP;
    g2.append(fr('Repeat', 'repeat', '#5856d6', sel(repOpts, pre, async (v) => { if (v === 'custom') { const rr = await A.repeatSheet(r.repeat, r.due); if (rr) upd(id, { repeat: rr }, 'Set Repeat'); else render(true); } else upd(id, { repeat: v === 'none' ? null : A.repeatFor(v, r.due) }, 'Set Repeat'); }, 'Repeat', !hasDue)));
    if (r.repeat) g2.append(fr('Ends', null, null, h('button.zk-btn', { type: 'button', onclick: async () => { const rr = await A.repeatSheet(r.repeat, r.due); if (rr) upd(id, { repeat: rr }, 'Set Repeat'); } }, r.repeat.until ? 'On ' + D.rel(r.repeat.until, A.now) : r.repeat.count ? `After ${r.repeat.count} times` : 'Never', icon('chevron-right'))));
    g2.append(fr('Early Reminder', 'bell', '#ff9500', sel(EARLY, r.early == null ? -1 : r.early, (v) => upd(id, { early: +v < 0 ? null : +v }, 'Set Early Reminder'), 'Early reminder', !hasDue)));
    root.append(g2);
    // priority / flag
    const seg = h('.zk-seg.seg-wide', { role: 'radiogroup', 'aria-label': 'Priority' }, [[0, 'None'], [1, '!'], [2, '!!'], [3, '!!!']].map(([p, l]) => h('button' + (r.priority === p ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': r.priority === p, title: p ? V.PRI_NAME[p] : 'No priority', onclick: () => A.setPriority([id], p) }, l)));
    root.append(h('.grp', h('.fr.col', h('.lb', ib('sliders-horizontal', '#ff9500'), h('span', 'Priority')), seg), fr('Flag', 'flag', '#ff9500', sw(r.flag, (on) => A.setProp([id], { flag: on }, on ? 'Flag' : 'Unflag'), 'Flag'))));
    // tags
    const tb = h('.tagbox'); const dl = h('datalist', { id: 'taglist' }, Object.keys(V.counts(S, A.now).tags).map((t) => h('option', { value: t }))); (r.tags || []).forEach((t) => tb.append(h('span.zr-chip', '#' + t, h('button', { type: 'button', 'aria-label': 'Remove tag ' + t, onclick: () => upd(id, { tags: r.tags.filter((x) => x !== t) }, 'Remove Tag') }, icon('x', 10)))));
    const ti = h('input.selectable', { placeholder: r.tags && r.tags.length ? '' : 'Add tag', list: 'taglist', 'data-f': 'tag', 'aria-label': 'Add tag', onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ',') && ti.value.trim()) { e.preventDefault(); A.addTagTo([id], ti.value); } else if (e.key === 'Backspace' && !ti.value && r.tags && r.tags.length) upd(id, { tags: r.tags.slice(0, -1) }, 'Remove Tag'); }, onchange: () => { if (ti.value.trim()) A.addTagTo([id], ti.value); } }); tb.append(ti, dl);
    root.append(h('.grp', h('.fr.col', h('.lb', ib('tag', '#34c759'), h('span', 'Tags')), tb), fr('List', 'list', lc, sel(V.flatLists(S).map((l) => [l.id, l.name]), r.list, (v) => A.moveToList([id], v), 'List'))));
    // subtasks
    const kids = Object.values(S.reminders).filter((k) => k.parent === id).sort((a, b) => a.order - b.order); const sl = h('.sub-list');
    kids.forEach((k) => sl.append(h('.sub-r' + (k.done ? '.done' : ''), { style: { '--lc': lc } }, h('button.chk' + (k.done ? '.on' : ''), { type: 'button', role: 'checkbox', 'aria-checked': k.done, 'aria-label': 'Complete subtask', onclick: () => A.toggleDone([k.id]) }, h('span.ring'), h('span.fill', icon('check'))), h('span', { onclick: () => A.select(k.id) }, k.title), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Delete subtask', onclick: () => A.delete([k.id]) }, icon('x', 12)))));
    const ni = h('input.t.selectable', { placeholder: 'Add subtask', 'data-f': 'sub', 'aria-label': 'Add subtask', style: { padding: '4px 4px' }, onkeydown: (e) => { if (e.key === 'Enter' && ni.value.trim()) { const t = ni.value.trim(); ST.commit('New Subtask', (d) => d.add({ list: r.list, parent: id, title: t })); A.pendingInsp = 'sub'; } } });
    if (!r.parent) root.append(h('.grp', h('.fr.col', h('.lb', ib('list-tree', '#5856d6'), h('span', 'Subtasks' + (kids.length ? ` (${kids.filter((k) => k.done).length}/${kids.length})` : ''))), sl, ni)));
    // attachments
    const ath = h('.ath'); (r.atts || []).forEach((a) => { const im = h('img', { alt: a.name || 'Attachment', onclick: () => ST.att.get(a.id).then((rec) => rec && A.lightbox(rec.data)) }); ST.att.get(a.id).then((rec) => rec && (im.src = rec.data)); ath.append(h('.a', im, h('button', { type: 'button', 'aria-label': 'Remove attachment', onclick: () => upd(id, { atts: r.atts.filter((x) => x.id !== a.id) }, 'Remove Attachment') }, icon('x')))); });
    root.append(h('.grp', h('.fr.col', h('.lb', ib('image', '#007aff'), h('span', 'Images')), ath, h('div', h('button.zk-btn.bordered', { type: 'button', onclick: async () => { const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }], multiple: true }); if (hs.length) A.attachFiles(id, hs); } }, icon('image-plus'), 'Add Image…')))));
    root.append(h('div', { style: { padding: '0 16px', color: 'var(--fg-3)', fontSize: '11px' } }, `Created ${new Date(r.created).toLocaleString()}${r.modified ? ' · Edited ' + new Date(r.modified).toLocaleString() : ''}`), h('div', { style: { padding: '10px 12px' } }, h('button.zk-btn.bordered.danger', { type: 'button', style: { width: '100%' }, onclick: () => A.delete([id]) }, icon('trash-2'), 'Delete Reminder')));
    return root;
  }
  function multi(ids) {
    const S = A.S(); const rs = ids.map((i) => S.reminders[i]).filter(Boolean); const root = h('div');
    root.append(h('.hd', h('span', `${rs.length} Reminders`), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Close details', onclick: () => A.setInsp(false) }, icon('x'))));
    const same = (f) => rs.every((r) => r[f] === rs[0][f]); const seg = h('.zk-seg.seg-wide', [[0, 'None'], [1, '!'], [2, '!!'], [3, '!!!']].map(([p, l]) => h('button' + (same('priority') && rs[0].priority === p ? '.on' : ''), { type: 'button', onclick: () => A.setPriority(ids, p) }, l)));
    root.append(h('.grp', fr('Date', 'calendar', '#ff3b30', h('button.zk-btn.bordered', { type: 'button', onclick: (e) => zk.menu(A.dueMenu(ids), { anchor: e.currentTarget }) }, same('due') && rs[0].due ? D.rel(rs[0].due, A.now) : 'Set…')), h('.fr.col', h('.lb', ib('sliders-horizontal', '#ff9500'), h('span', 'Priority')), seg), fr('Flag', 'flag', '#ff9500', sw(rs.every((r) => r.flag), (on) => A.setProp(ids, { flag: on }, on ? 'Flag' : 'Unflag'), 'Flag')), fr('List', 'list', '#32ade6', sel([['', 'Mixed'].filter(() => !same('list')), ...V.flatLists(S).map((l) => [l.id, l.name])].filter(Boolean), same('list') ? rs[0].list : '', (v) => v && A.moveToList(ids, v), 'List')), fr('Add Tag', 'tag', '#34c759', h('button.zk-btn.bordered', { type: 'button', onclick: () => A.addTag(ids) }, 'Add…'))));
    root.append(h('div', { style: { padding: '4px 12px', display: 'flex', gap: '8px' } }, h('button.zk-btn.bordered', { type: 'button', style: { flex: 1 }, onclick: () => A.toggleDone(ids, true) }, icon('check-circle'), 'Complete'), h('button.zk-btn.bordered.danger', { type: 'button', style: { flex: 1 }, onclick: () => A.delete(ids) }, icon('trash-2'), 'Delete')));
    return root;
  }
  function render(force) {
    const open = A.inspOpen; const was = !el.classList.contains('zk-hidden'); el.classList.toggle('zk-hidden', !open); A.$('#b-insp').setAttribute('aria-pressed', open); A.$('#b-insp').classList.toggle('on', open); if (!open) { shownId = null; return; }
    if (!was) { const sp = ZR.anim.spring(320, { response: 0.4, damping: 1, eps: 0.2, onUpdate: (v) => { el.style.transform = v > 0.5 ? `translateX(${v}px)` : ''; } }); sp.target(0, () => (el.style.transform = '')); }
    const ids = [...A.sel].filter((i) => A.S().reminders[i]); const ae = document.activeElement; const inside = el.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
    const key = ids.length === 1 ? ids[0] : ids.length > 1 ? 'multi' + ids.length : 'none';
    if (inside && !force && key === shownId && !A.pendingInsp) return; const fieldName = ae && el.contains(ae) ? ae.dataset.f : null; const st = el.scrollTop;
    let body; if (ids.length === 1) body = single(A.S().reminders[ids[0]]); else if (ids.length > 1) body = multi(ids); else body = h('div', h('.hd', h('span', 'Details'), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Close details', onclick: () => A.setInsp(false) }, icon('x'))), h('.zr-empty', { style: { padding: '40px 20px' } }, icon('info'), h('span', 'Select a reminder to see its details.')));
    el.replaceChildren(body); el.scrollTop = st; shownId = key; const want = A.pendingInsp || fieldName; A.pendingInsp = null;
    if (want) { const f = el.querySelector(`[data-f="${want}"]`); f && f.focus(); }
  }
  A.renderers.insp = render;
  document.addEventListener('paste', (e) => { const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type)); const p = A.primary(); if (f && p) { e.preventDefault(); addImage(p.id, f); } });
})();
