/* Shared UI context: selection, view state, actions on reminders, toasts. */
(function () {
  const D = ZR.dates, V = ZR.views, ST = ZR.store, h = zk.el;
  const A = (ZR.A = {
    view: { k: 'list', id: null }, sel: new Set(), anchor: null, order: [], editingEl: null, draft: null, pendingFocus: null,
    lingering: new Map(), inspOpen: false, collapsed: new Set(), renderers: {}, now: new Date(), prevView: null, quickText: '',
    h, D, V, ST, ICON: (n, s) => zk.icon(n, s),
    S: () => ST.state, $: (s, r = document) => r.querySelector(s), $$: (s, r = document) => [...r.querySelectorAll(s)],
  });
  const $ = A.$;
  const prefs = () => A.S().prefs;
  A.cls = (e, c) => { e.setAttribute('class', c); return e; };
  A.setting = (k, d) => (prefs()[k] === undefined ? d : prefs()[k]);
  A.setPref = (patch) => ST.meta((s) => { Object.assign(s.prefs, patch); });
  A.ws = () => A.setting('weekStart', 1);
  A.h12 = () => A.setting('h12', undefined);
  A.listById = (id) => A.S().lists.find((l) => l.id === id);
  A.defaultList = () => A.listById(A.setting('defaultList')) || A.listById(A.view.k === 'list' ? A.view.id : null) || V.flatLists(A.S())[0];
  A.listColor = (r) => (A.listById(r.list) || {}).color || '#32ade6';
  const hexRgb = (c) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c || ''); return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '50,173,230'; };
  A.hexRgb = hexRgb;
  A.viewValid = () => { const v = A.view; return v.k === 'smart' ? !!V.SMART_BY[v.id] : v.k === 'list' ? !!A.listById(v.id) : true; };
  A.viewInfo = () => {
    const v = A.view;
    if (v.k === 'smart') { const s = V.SMART_BY[v.id]; return { title: s.name, color: s.color }; }
    if (v.k === 'list') { const l = A.listById(v.id); return { title: l ? l.name : '', color: l ? l.color : '#32ade6' }; }
    if (v.k === 'tag') return { title: v.tags.map((t) => '#' + t).join(' '), color: '#32ade6' };
    return { title: 'Search', color: '#32ade6' };
  };
  A.setView = (v, { keepSel = false } = {}) => {
    if (v.k !== 'search') { A.prevView = null; const si = A.$('#q'); if (si && si.value) { si.value = ''; si.parentElement.classList.remove('has'); } }
    A.view = v; if (v.k !== 'search') A.setPref({ view: v }); if (!keepSel) { A.sel.clear(); A.anchor = null; } A.draft = null; A.collapsedSecs = new Set();
    if (A.compact) A.showSide(false); A.render(true); const sc = A.$('#scroll'); if (sc) sc.scrollTop = 0;
  };
  A.viewPrefs = () => V.getPrefs(A.S(), A.view);
  A.setViewPrefs = (patch) => { const key = V.viewKey(A.view); ST.meta((s) => { s.prefs.views = { ...s.prefs.views, [key]: { ...(s.prefs.views[key] || {}), ...patch } }; }); };

  // ---------- render scheduling ----------
  let rq = 0, force = false;
  A.render = (f) => { force = force || !!f; if (rq) return; rq = requestAnimationFrame(() => { rq = 0; if (ZR.anim.busy) { setTimeout(() => A.render(), 120); return; } const fo = force; force = false; A.now = new Date(); for (const k of ['sidebar', 'main', 'insp', 'chrome']) A.renderers[k] && A.renderers[k](fo); }); };
  ST.subscribe((s, why) => { if (why === 'undo' || why === 'redo' || why === 'commit') { prune(); } A.render(why === 'undo' || why === 'redo'); A.menusDirty && A.menusDirty(); });
  const prune = () => { const S = A.S(); for (const id of [...A.sel]) if (!S.reminders[id]) A.sel.delete(id); };

  // ---------- selection ----------
  A.select = (ids, { anchor, add } = {}) => {
    ids = [].concat(ids).filter(Boolean); if (!add) A.sel.clear(); ids.forEach((i) => A.sel.add(i)); if (anchor !== undefined) A.anchor = anchor; else if (ids.length) A.anchor = ids[ids.length - 1];
    A.refreshSel();
  };
  A.refreshSel = () => { A.$$('.rw.sel').forEach((e) => !A.sel.has(e.dataset.id) && e.classList.remove('sel')); A.sel.forEach((id) => { const e = A.$(`.rw[data-id="${id}"]`); e && e.classList.add('sel'); }); A.renderers.insp && A.renderers.insp(); A.renderers.bulk && A.renderers.bulk(); A.renderers.chrome && A.renderers.chrome(); A.menusDirty && A.menusDirty(); };
  A.selected = () => [...A.sel].map((id) => A.S().reminders[id]).filter(Boolean);
  A.primary = () => { const a = A.selected(); return a.length === 1 ? a[0] : null; };
  A.selIds = () => { // selection incl. nothing else; subtasks follow parents implicitly
    return [...A.sel].filter((id) => A.S().reminders[id]); };

  // ---------- toasts ----------
  A.toast = (text, { label, run, ms = 5000, kind } = {}) => {
    const box = $('#toasts'); if (kind) A.$$(`.zr-toast[data-kind="${kind}"]`, box).forEach((t) => t.remove());
    const t = h('.zr-toast', { role: 'status', 'data-kind': kind || '' }, h('span.tx', text)); let gone = false;
    const close = () => { if (gone) return; gone = true; t.classList.add('out'); setTimeout(() => t.remove(), 220); };
    if (label) t.append(h('button.zk-btn', { type: 'button', onclick: () => { close(); run && run(); } }, label));
    box.append(t); setTimeout(close, ms); return close;
  };

  // ---------- formatting ----------
  A.timeText = (t) => D.fmtTime(t, A.h12());
  A.dueText = (r) => { if (!r.due) return ''; return D.rel(r.due, A.now) + (r.time ? ', ' + A.timeText(r.time) : ''); };
  A.dueClass = (r) => (V.isOverdue(r, A.now) ? 'over' : r.due === D.today(A.now) && !r.done ? 'today' : '');
  A.repeatText = (rule) => ZR.recur.label(rule);
  A.earlyText = (m) => (m == null ? 'None' : m === 0 ? 'At time of event' : m < 60 ? `${m} minutes before` : m < 1440 ? `${m / 60} hour${m === 60 ? '' : 's'} before` : `${m / 1440} day${m === 1440 ? '' : 's'} before`);

  // ---------- actions ----------
  const titleOf = (ids) => (ids.length === 1 ? `“${(A.S().reminders[ids[0]] || {}).title || ''}”` : ids.length + ' reminders');
  const lingerTimer = (id) => setTimeout(() => A.finishLinger(id), 1000);
  A.finishLinger = (id) => {
    const l = A.lingering.get(id); if (!l) return; A.lingering.delete(id);
    const keep = new Set(A.lingering.keys()); const built = V.build(A.S(), A.view, new Date(), { lingering: keep, ws: A.ws() });
    const still = new Set(); built.sections.forEach((s) => s.nodes.forEach((n) => { still.add(n.r.id); n.kids.forEach((k) => still.add(k.r.id)); }));
    const blk = A.$(`.blk[data-id="${id}"]`);
    if (blk && !still.has(id)) ZR.anim.collapse(blk, () => A.render(true)); else A.render(true);
  };
  A.toggleDone = (ids, forceVal) => {
    ids = ids || A.selIds(); const S = A.S(); const rs = ids.map((i) => S.reminders[i]).filter(Boolean); if (!rs.length) return;
    const val = forceVal != null ? forceVal : rs.some((r) => !r.done); let info = null;
    ST.commit(val ? (rs.length > 1 ? 'Complete Reminders' : 'Complete Reminder') : (rs.length > 1 ? 'Mark Incomplete' : 'Mark Incomplete'), (d) => { rs.forEach((r) => { if (r.done !== val || (val && r.repeat)) { const res = d.complete(r.id, val); if (res && res.advanced) info = res; } }); });
    rs.forEach((r) => { const old = A.lingering.get(r.id); if (old) clearTimeout(old.timer); A.lingering.set(r.id, { visual: val ? 'done' : 'open', timer: lingerTimer(r.id) }); });
    const names = titleOf(ids);
    A.toast(info ? `Completed ${names} — next on ${D.rel(info.next, A.now)}` : val ? `Completed ${names}` : `Marked ${names} incomplete`, { label: 'Undo', run: () => { ST.undo(); }, kind: 'complete' });
    A.sounds && val && A.sounds.tick();
  };
  A.delete = (ids) => {
    ids = (ids || A.selIds()); if (!ids.length) return; const S = A.S(); const names = titleOf(ids);
    const i = A.order.indexOf(ids[0]); ST.commit(ids.length > 1 ? 'Delete Reminders' : 'Delete Reminder', (d) => ids.forEach((id) => d.del(id)));
    A.sel.clear(); const rest = A.order.filter((x) => !ids.includes(x) && S.reminders[x] && !ids.includes(S.reminders[x].parent)); const nx = rest[Math.min(i, rest.length - 1)]; if (nx) { A.sel.add(nx); A.anchor = nx; }
    A.toast(`Deleted ${names}`, { label: 'Undo', run: () => ST.undo(), kind: 'delete' }); A.refreshSel();
  };
  A.setProp = (ids, patch, label) => { ids = ids || A.selIds(); if (!ids.length) return; ST.commit(label || 'Edit Reminder', (d) => ids.forEach((id) => { const p = typeof patch === 'function' ? patch(A.S().reminders[id]) : patch; d.set(id, p); })); };
  A.toggleFlag = (ids) => { ids = ids || A.selIds(); const rs = ids.map((i) => A.S().reminders[i]).filter(Boolean); const v = rs.some((r) => !r.flag); A.setProp(ids, { flag: v }, v ? 'Flag' : 'Unflag'); };
  A.setPriority = (ids, p) => A.setProp(ids, { priority: p }, 'Set Priority');
  A.setDue = (ids, date, time) => A.setProp(ids, (r) => { const o = { due: date, time: date ? (time === undefined ? r.time : time) : null }; if (!date) { o.repeat = null; o.early = null; } return o; }, date ? 'Set Date' : 'Clear Date');
  A.moveToList = (ids, listId) => {
    ids = ids || A.selIds(); const S = A.S(); const set = new Set(ids);
    ST.commit('Move to List', (d) => { let off = 0; ids.forEach((id) => { const r = S.reminders[id]; if (!r || r.list === listId) return; const isKid = r.parent && !set.has(r.parent); const o = { list: listId }; if (isKid) o.parent = null; if (!r.parent || isKid) o.order = Date.now() / 1000 + off++; d.set(id, o); for (const k in S.reminders) if (S.reminders[k].parent === id) d.set(k, { list: listId }); }); });
    const l = A.listById(listId); A.toast(`Moved to ${l ? l.name : 'list'}`, { label: 'Undo', run: () => ST.undo() });
  };
  A.duplicate = (ids) => {
    ids = ids || A.selIds(); const S = A.S(); const created = [];
    ST.commit('Duplicate', (d) => ids.forEach((id) => { const r = S.reminders[id]; if (!r) return; const nid = d.add({ ...r, id: undefined, title: r.title, done: false, doneAt: null, created: Date.now(), order: r.order + 0.0001 }); created.push(nid); for (const k in S.reminders) if (S.reminders[k].parent === id) d.add({ ...S.reminders[k], id: undefined, parent: nid, done: false, doneAt: null }); }));
    A.select(created);
  };
  A.indent = (id) => {
    const r = A.S().reminders[id]; if (!r || r.parent) return false; const S = A.S();
    if (Object.values(S.reminders).some((x) => x.parent === id)) { A.toast('Reminders with subtasks can’t become subtasks.', { ms: 2500 }); return false; }
    const blk = A.$(`.blk[data-id="${id}"]`); let pid = blk && blk.previousElementSibling && blk.previousElementSibling.classList.contains('blk') && blk.previousElementSibling.dataset.id !== '__draft' ? blk.previousElementSibling.dataset.id : null;
    if (!pid) { const c2 = Object.values(S.reminders).filter((x) => x.list === r.list && !x.parent && x.id !== id && x.order < r.order).sort((a, b) => b.order - a.order)[0]; pid = c2 && c2.id; }
    const p = pid && S.reminders[pid]; if (!p || p.list !== r.list || p.parent) return false;
    ST.commit('Make Subtask', (d) => { let m = 0; for (const k in d.S.reminders) if (d.S.reminders[k].parent === pid && d.S.reminders[k].order > m) m = d.S.reminders[k].order; d.set(id, { parent: pid, order: m + 1 }); if (p.collapsed) d.set(pid, { collapsed: false }); }); return true;
  };
  A.outdent = (id) => {
    const S = A.S(); const r = S.reminders[id]; if (!r || !r.parent) return false; const p = S.reminders[r.parent]; if (!p) return false;
    const sibs = Object.values(S.reminders).filter((x) => x.list === p.list && !x.parent && x.id !== id && x.order > p.order).sort((a, b) => a.order - b.order); const nx = sibs[0];
    ST.commit('Make Top-Level', (d) => d.set(id, { parent: null, list: p.list, order: nx ? (p.order + nx.order) / 2 : p.order + 1 })); return true;
  };
  A.addTagTo = (ids, tag) => { tag = tag.toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'); if (!tag) return; A.setProp(ids, (r) => ({ tags: [...new Set([...(r.tags || []), tag])] }), 'Add Tag'); };
  A.openLink = (url) => { if (!/^(https?:|mailto:)/i.test(url)) url = /^[\w.-]+\.[a-z]{2,}/i.test(url) ? 'https://' + url : url; if (!/^(https?:|mailto:)/i.test(url)) return; if (zeng.isNative) zeng.call('open_url', { url }).catch(() => {}); else window.open(url, '_blank', 'noopener'); };
  A.showSide = (on) => { const s = $('#side'); s.classList.toggle('hidden', !on); $('#side-scrim').classList.toggle('on', on && A.compact); A.sideOn = on; };
  A.setInsp = (on) => { A.inspOpen = on; A.setPref({ insp: on }); A.renderers.insp && A.renderers.insp(true); $('#b-insp').setAttribute('aria-pressed', on); };
})();
