/* ZengPeople core: state, persistence, history, list, sidebar. Other files extend window.ZC. */
(() => {
  'use strict';
  const M = ZModel, $ = (s) => document.querySelector(s), el = zk.el;
  const ZC = (window.ZC = {});
  const S = (ZC.S = {
    contacts: [], groups: [], prefs: { sortBy: 'first', order: 'first', listW: 260, side: true, ret: '', exportVer: '3.0', csvPreset: 'google' },
    sel: new Set(), cur: null, anchor: null, view: 'all', query: '', editing: false, draft: null, isNew: false, orig: null,
    undo: [], redo: [], loaded: false,
  });
  ZC.M = M;
  const ROW_H = 46, HDR_H = 24;

  // ---------- helpers ----------
  ZC.openUrl = (url) => { if (zeng.isNative) zeng.call('open_url', { url }).catch((e) => zk.alert('Can’t open link', e.message)); else window.open(url, '_blank', 'noopener'); };
  ZC.copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); } catch { const t = el('textarea', { value: text, style: { position: 'fixed', opacity: 0 } }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    zk.toast(msg || 'Copied');
  };
  ZC.byId = () => { if (S._idxFor !== S.contacts) { S._idx = new Map(S.contacts.map((c) => [c.id, c])); S._idxFor = S.contacts; } return S._idx; };
  ZC.get = (id) => ZC.byId().get(id);
  ZC.name = (c) => M.displayName(c, S.prefs.order);
  ZC.group = (id) => S.groups.find((g) => g.id === id);
  const photoBg = (c) => (c.photo ? `url("${c.photo}")` : '');
  ZC.avatar = (c, size) => {
    const a = el('.avatar' + (c.isOrg && !c.photo ? '.org' : ''), { 'aria-hidden': 'true' });
    if (size) { a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * 0.36) + 'px'; }
    if (c.photo) a.style.backgroundImage = photoBg(c); else { const [x, y] = M.gradientFor(c); a.style.backgroundImage = `linear-gradient(145deg, ${x}, ${y})`; a.textContent = M.initials(c); }
    return a;
  };

  // ---------- persistence ----------
  let saveTimer = 0, pending = false, saving = null, lastPhotoSig = '', saveFailed = false, lastBakAt = 0; ZC.bakEvery = 5 * 60 * 1000;
  const dirtyFlag = (v) => { if (zeng.isNative) zeng.call('dirty', { dirty: v }).catch(() => {}); };
  ZC.scheduleSave = () => { if (!S.loaded) return; if (!pending) { pending = true; dirtyFlag(true); } clearTimeout(saveTimer); saveTimer = setTimeout(ZC.flush, 450); };
  ZC.flush = async () => {
    clearTimeout(saveTimer); if (saving) await saving; if (!pending) return;
    pending = false;
    saving = (async () => {
      try {
        const photos = {}; const slim = S.contacts.map((c) => { if (c.photo) { photos[c.id] = c.photo; const { photo, ...r } = c; return r; } return c; });
        const sig = Object.entries(photos).map(([k, v]) => k + v.length + v.slice(-12)).join('|');
        const payload = { v: 1, saved: Date.now(), contacts: slim, groups: S.groups, prefs: S.prefs };
        await zeng.store.set('book', payload);
        if (sig !== lastPhotoSig) { await zeng.store.set('photos', photos); lastPhotoSig = sig; }
        if (S.contacts.length && Date.now() - lastBakAt > ZC.bakEvery) { lastBakAt = Date.now(); await zeng.store.set('book-bak', payload); await zeng.store.set('photos-bak', photos); }
        saveFailed = false;
      } catch (e) { saveFailed = true; console.error(e); }
    })();
    await saving; saving = null; if (!pending) dirtyFlag(false);
  };
  ZC.load = async () => {
    let book = await zeng.store.get('book', null); const bak = await zeng.store.get('book-bak', null);
    const valid = (b) => b && typeof b === 'object' && Array.isArray(b.contacts);
    let photos = (await zeng.store.get('photos', null)) || {}; let recovered = false;
    if (!valid(book)) {
      if (valid(bak) && bak.contacts.length) {
        const ok = await zk.confirm('Your address book couldn’t be read', `A backup from ${new Date(bak.saved || Date.now()).toLocaleString()} with ${bak.contacts.length} contacts is available. Restore it?`, 'Restore Backup');
        if (ok) { book = bak; photos = (await zeng.store.get('photos-bak', null)) || photos; recovered = true; }
      }
      if (!valid(book)) book = { contacts: [], groups: [] };
    }
    let dropped = 0;
    S.contacts = book.contacts.map((o) => { try { const c = M.sanitize(o); if (!c.photo && photos && typeof photos[c.id] === 'string' && photos[c.id].startsWith('data:image/')) c.photo = photos[c.id]; return c; } catch { dropped++; return null; } }).filter(Boolean);
    const seen = new Set(); S.contacts = S.contacts.filter((c) => (seen.has(c.id) ? (dropped++, false) : seen.add(c.id)));
    S.groups = (Array.isArray(book.groups) ? book.groups : []).filter((g) => g && typeof g.name === 'string').map((g) => ({ id: String(g.id || zk.uid()), name: g.name, ...(g.smart ? { smart: true, match: g.match === 'any' ? 'any' : 'all', rules: (Array.isArray(g.rules) ? g.rules : []).filter((r) => r && r.f && M.FIELDS[r.f]) } : {}) }));
    const gids = new Set(S.groups.map((g) => g.id)); S.contacts.forEach((c) => { c.groups = c.groups.filter((g) => gids.has(g)); });
    Object.assign(S.prefs, book.prefs && typeof book.prefs === 'object' ? book.prefs : {});
    if (!['first', 'last'].includes(S.prefs.sortBy)) S.prefs.sortBy = 'first'; if (!['first', 'last'].includes(S.prefs.order)) S.prefs.order = 'first';
    S.prefs.listW = zk.clamp(+S.prefs.listW || 260, 200, 420);
    if (S.contacts.length || !bak) { // keep a rolling backup of the last known good, non-empty state
      try { if (S.contacts.length) { lastBakAt = Date.now(); await zeng.store.set('book-bak', { v: 1, saved: Date.now(), contacts: S.contacts.map(({ photo, ...r }) => r), groups: S.groups }); await zeng.store.set('photos-bak', Object.fromEntries(S.contacts.filter((c) => c.photo).map((c) => [c.id, c.photo]))); } } catch {}
    }
    lastPhotoSig = Object.entries(photos || {}).map(([k, v]) => k + v.length + v.slice(-12)).join('|');
    S.loaded = true; if (recovered || dropped) { pending = true; ZC.scheduleSave(); }
    if (dropped) setTimeout(() => zk.toast(`${dropped} unreadable entr${dropped > 1 ? 'ies were' : 'y was'} skipped`), 600);
  };

  // ---------- history (snapshots share immutable contact objects) ----------
  ZC.mutate = (label, fn) => {
    S.undo.push({ label, contacts: S.contacts, groups: S.groups, t: Date.now() }); if (S.undo.length > 200) S.undo.shift(); S.redo = [];
    fn(); ZC.changed();
  };
  ZC.changed = () => { S._rows = null; ZC.scheduleSave(); ZC.renderAll(); };
  const restore = (snap) => { S.contacts = snap.contacts; S.groups = snap.groups; const ids = new Set(S.contacts.map((c) => c.id)); S.sel = new Set([...S.sel].filter((i) => ids.has(i))); if (!ids.has(S.view) && !['all', 'fav', 'bday'].includes(S.view) && !S.groups.some((g) => g.id === S.view)) S.view = 'all'; if (S.cur && !ids.has(S.cur)) S.cur = null; };
  ZC.undoOne = () => { const s = S.undo.pop(); if (!s) return false; S.redo.push({ label: s.label, contacts: S.contacts, groups: S.groups, t: Date.now() }); restore(s); ZC.changed(); zk.toast('Undid ' + s.label); return true; };
  ZC.redoOne = () => { const s = S.redo.pop(); if (!s) return false; S.undo.push({ label: s.label, contacts: S.contacts, groups: S.groups, t: Date.now() }); restore(s); ZC.changed(); zk.toast('Redid ' + s.label); return true; };
  ZC.undoTo = (n) => { while (n-- > 0 && ZC.undoOne()); };
  ZC.undoToast = (text) => {
    document.querySelectorAll('.undo-toast').forEach((t) => t.remove());
    const b = el('button', { type: 'button', onclick: () => { ZC.undoOne(); t.remove(); } }, 'Undo'); const t = el('.undo-toast', { role: 'status' }, text, b); document.body.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 6500);
  };

  // ---------- contact edits ----------
  ZC.update = (ids, label, fn) => { const set = new Set(ids); ZC.mutate(label, () => { S.contacts = S.contacts.map((c) => (set.has(c.id) ? { ...fn(c), modified: Date.now() } : c)); }); };
  ZC.addContacts = (list, label) => ZC.mutate(label, () => { S.contacts = S.contacts.concat(list); });
  ZC.remove = (ids, label) => { const set = new Set(ids); ZC.mutate(label || 'Delete', () => { S.contacts = S.contacts.filter((c) => !set.has(c.id)); S.sel = new Set([...S.sel].filter((i) => !set.has(i))); if (set.has(S.cur)) S.cur = null; }); };
  ZC.toggleFav = (ids) => { const cs = ids.map(ZC.get).filter(Boolean); const on = !cs.every((c) => c.fav); ZC.update(ids, on ? 'Add to Favourites' : 'Remove from Favourites', (c) => ({ ...c, fav: on })); };
  ZC.addToGroup = (ids, gid) => { const g = ZC.group(gid); if (!g || g.smart) return; ZC.update(ids, 'Add to ' + g.name, (c) => (c.groups.includes(gid) ? c : { ...c, groups: [...c.groups, gid] })); zk.toast(`Added ${ids.length} to “${g.name}”`); };
  ZC.removeFromGroup = (ids, gid) => { const g = ZC.group(gid); ZC.update(ids, 'Remove from ' + (g ? g.name : 'Group'), (c) => ({ ...c, groups: c.groups.filter((x) => x !== gid) })); };
  ZC.newGroup = async (withSel) => {
    const name = await zk.prompt('New Group', '', { placeholder: 'Group name', ok: 'Create' }); if (!name || !name.trim()) return;
    const g = { id: zk.uid(), name: name.trim() }; const ids = withSel ? [...S.sel] : [];
    ZC.mutate('New Group', () => { S.groups = [...S.groups, g]; if (ids.length) { const set = new Set(ids); S.contacts = S.contacts.map((c) => (set.has(c.id) ? { ...c, groups: [...c.groups, g.id] } : c)); } });
    ZC.setView(g.id);
  };
  ZC.renameGroup = async (g) => { const n = await zk.prompt('Rename Group', g.name, { ok: 'Rename' }); if (n && n.trim()) ZC.mutate('Rename Group', () => { S.groups = S.groups.map((x) => (x.id === g.id ? { ...x, name: n.trim() } : x)); }); };
  ZC.deleteGroup = async (g) => {
    if (!(await zk.confirm(`Delete “${g.name}”?`, g.smart ? 'Contacts in this smart group are not affected.' : 'The contacts in this group will not be deleted.', 'Delete', { danger: true }))) return;
    ZC.mutate('Delete Group', () => { S.groups = S.groups.filter((x) => x.id !== g.id); if (!g.smart) S.contacts = S.contacts.map((c) => (c.groups.includes(g.id) ? { ...c, groups: c.groups.filter((i) => i !== g.id) } : c)); if (S.view === g.id) S.view = 'all'; });
  };

  // ---------- derived list ----------
  const dayKey = () => new Date().toDateString();
  ZC.viewName = () => ({ all: 'All Contacts', fav: 'Favourites', bday: 'Birthdays' }[S.view] || (ZC.group(S.view) || {}).name || 'Contacts');
  ZC.baseList = (view = S.view) => {
    const now = Date.now();
    if (view === 'all') return S.contacts; if (view === 'fav') return S.contacts.filter((c) => c.fav); if (view === 'bday') return S.contacts.filter((c) => c.bday);
    const g = ZC.group(view); if (!g) return S.contacts; return g.smart ? S.contacts.filter((c) => M.smartMatch(c, g, now)) : S.contacts.filter((c) => c.groups.includes(view));
  };
  ZC.rows = () => {
    const key = [S.view, S.query, S.prefs.sortBy, S.prefs.order, dayKey()].join('|');
    if (S._rows && S._rowsKey === key && S._rowsC === S.contacts && S._rowsG === S.groups) return S._rows;
    let list = ZC.baseList(); if (S.query.trim()) list = list.filter((c) => M.matchQuery(c, S.query));
    const rows = []; let y = 0; const order = [];
    const push = (r, h) => { r.y = y; r.h = h; y += h; rows.push(r); };
    if (S.view === 'bday') {
      const now = Date.now(); const tagged = list.map((c) => [c, M.daysUntil(c.bday, now)]).sort((a, b) => a[1] - b[1]);
      let last = ''; for (const [c, d] of tagged) { const h = d === 0 ? 'Today' : d <= 7 ? 'Next 7 Days' : d <= 30 ? 'Next 30 Days' : 'Later'; if (h !== last) { push({ t: 'h', k: h }, HDR_H); last = h; } push({ t: 'c', c, d }, ROW_H); order.push(c.id); }
      S._letters = [];
    } else {
      const sorted = M.sortContacts(list, S.prefs.sortBy); let last = ''; const letters = [];
      for (const c of sorted) { const l = M.sectionOf(c, S.prefs.sortBy); if (l !== last) { push({ t: 'h', k: l }, HDR_H); letters.push({ l, y: y - HDR_H }); last = l; } push({ t: 'c', c }, ROW_H); order.push(c.id); }
      S._letters = letters;
    }
    S._rows = rows; S._rowsKey = key; S._rowsC = S.contacts; S._rowsG = S.groups; S._order = order; S._total = y; S._count = order.length; return rows;
  };
  ZC.order = () => { ZC.rows(); return S._order; };

  // ---------- selection ----------
  const finishEditIfAny = () => { if (S.editing && ZC.finishEdit) ZC.finishEdit(true); };
  ZC.select = (ids, cur, opts = {}) => {
    finishEditIfAny(); S.sel = new Set(ids); S.cur = cur ?? (ids.length ? ids[ids.length - 1] : null); if (!opts.keepAnchor) S.anchor = S.cur;
    ZC.renderList(); ZC.renderCard(); ZC.renderStatus(); ZC.syncToolbar(); ZC.menusSoon();
    if (S.cur && !opts.noScroll) ZC.ensureVisible(S.cur);
  };
  ZC.moveSel = (delta, extend) => {
    const ord = ZC.order(); if (!ord.length) return; let i = ord.indexOf(S.cur); const wasNone = i < 0;
    i = wasNone ? (delta > 0 ? 0 : ord.length - 1) : zk.clamp(i + delta, 0, ord.length - 1);
    const id = ord[i];
    if (extend && S.anchor) { const a = ord.indexOf(S.anchor); const [lo, hi] = a < i ? [a, i] : [i, a]; ZC.select(ord.slice(lo, hi + 1), id, { keepAnchor: true }); } else ZC.select([id], id);
  };
  ZC.selected = () => [...S.sel].map(ZC.get).filter(Boolean);
  ZC.setView = (v) => { finishEditIfAny(); if (innerWidth < 760) $('#side').classList.remove('force'); S.view = v; S.query = ''; $('#q').value = ''; $('#qclear').hidden = true; S._rows = null; const ord = ZC.order(); S.sel = new Set(); S.cur = null; if (ord.length) { S.sel = new Set([ord[0]]); S.cur = S.anchor = ord[0]; } $('#list').scrollTop = 0; ZC.renderAll(); ZC.prefsSave(); };
  ZC.prefsSave = () => ZC.scheduleSave();

  // ---------- list rendering (virtualised) ----------
  const listEl = () => $('#list');
  ZC.renderList = () => {
    const list = listEl(); const rows = ZC.rows(); const st = list.scrollTop, vh = list.clientHeight;
    let sp = list.firstChild; if (!sp || !sp.classList || !sp.classList.contains('spacer')) { sp = el('.spacer'); list.replaceChildren(sp); }
    sp.style.height = S._total + 'px';
    let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].y + rows[m].h < st - 200) lo = m + 1; else hi = m; }
    const frag = document.createDocumentFragment();
    for (let i = lo; i < rows.length && rows[i].y < st + vh + 200; i++) frag.append(rowEl(rows[i]));
    sp.replaceChildren(frag);
    updateSticky(); renderIndex();
  };
  const favIcon = () => { const i = zk.icon('star'); i.setAttribute('class', 'zi fav'); return i; };
  const rowEl = (r) => {
    if (r.t === 'h') return el('.row.hdr', { style: { top: r.y + 'px' }, 'aria-hidden': 'true' }, r.k);
    const c = r.c; const sel = S.sel.has(c.id);
    const nm = el('.n'); if (S.prefs.order === 'last' || c.isOrg || !c.last) nm.textContent = ZC.name(c); else { nm.append([c.prefix, c.first, c.middle].filter(Boolean).join(' ') + ' ', el('b', c.last), c.suffix ? ' ' + c.suffix : ''); }
    let sub = c.isOrg ? '' : c.org || c.title || ''; if (r.d != null) sub = `${M.fmtDate(c.bday, true)} · ${r.d === 0 ? 'today' : r.d === 1 ? 'tomorrow' : 'in ' + r.d + ' days'}`; else if (!sub && !c.isOrg) sub = (c.phones[0] && c.phones[0].v) || (c.emails[0] && c.emails[0].v) || '';
    const row = el('.row' + (sel ? '.sel' : ''), { role: 'option', 'aria-selected': String(sel), 'data-id': c.id, style: { top: r.y + 'px' } }, ZC.avatar(c), el('.meta', nm, sub ? el('.s', sub) : null), c.fav ? favIcon() : null);
    return row;
  };
  const updateSticky = () => {
    const st = $('#sticky'), list = listEl(), rows = S._rows || []; if (!S._letters || !S._letters.length && S.view !== 'bday' || !rows.length) { st.hidden = true; return; }
    const top = list.scrollTop; let cur = null, next = null;
    for (const r of rows) { if (r.t !== 'h') continue; if (r.y <= top) cur = r; else { next = r; break; } }
    if (!cur) { st.hidden = true; return; } st.hidden = false; st.textContent = cur.k; const push = next ? Math.min(0, next.y - top - HDR_H) : 0; st.style.transform = `translateY(${push}px)`;
  };
  const renderIndex = () => {
    const ix = $('#index'); const letters = S._letters || []; if (S.view === 'bday' || letters.length < 2 && !S.query) { ix.replaceChildren(); ix.hidden = true; return; } ix.hidden = false;
    const have = new Set(letters.map((x) => x.l)); const all = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']; const h = ix.clientHeight || 400; const step = h < 340 ? 2 : 1;
    const shown = all.filter((l, i) => step === 1 || i % 2 === 0 || have.has(l) && h > 250 && false || l === '#');
    ix.replaceChildren(...shown.map((l) => el('span' + (have.has(l) ? '' : '.off'), { 'data-l': l }, l)));
  };
  ZC.jumpLetter = (l) => { const letters = S._letters || []; if (!letters.length) return; const all = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']; let i = all.indexOf(l); let t = letters.find((x) => x.l === l); while (!t && i < all.length) t = letters.find((x) => x.l === all[++i]); if (!t) t = letters[letters.length - 1]; listEl().scrollTop = t.y; };
  ZC.ensureVisible = (id) => {
    const r = (S._rows || []).find((x) => x.t === 'c' && x.c.id === id); if (!r) return; const list = listEl(); const top = list.scrollTop, vh = list.clientHeight;
    if (r.y - HDR_H < top) list.scrollTop = Math.max(0, r.y - HDR_H); else if (r.y + r.h > top + vh) list.scrollTop = r.y + r.h - vh;
    ZC.renderList();
  };

  // list pointer interaction: select, multi-select, drag to groups
  const setupListInput = () => {
    const list = listEl(); let drag = null;
    list.addEventListener('scroll', () => { if (S._raf) return; S._raf = requestAnimationFrame(() => { S._raf = 0; ZC.renderList(); }); }, { passive: true });
    $('#index').addEventListener('pointerdown', (e) => {
      const ix = e.currentTarget; ix.setPointerCapture(e.pointerId);
      const go = (ev) => { const r = ix.getBoundingClientRect(); const spans = [...ix.children]; if (!spans.length) return; const i = zk.clamp(Math.floor(((ev.clientY - r.top) / r.height) * spans.length), 0, spans.length - 1); ZC.jumpLetter(spans[i].dataset.l); };
      go(e); const mv = (ev) => go(ev); const up = () => { ix.removeEventListener('pointermove', mv); ix.removeEventListener('pointerup', up); ix.removeEventListener('pointercancel', up); }; ix.addEventListener('pointermove', mv); ix.addEventListener('pointerup', up); ix.addEventListener('pointercancel', up);
    });
    list.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || (e.button === 0 && e.ctrlKey && zeng.platform === 'mac')) { const row = e.target.closest('.row[data-id]'); if (row && !S.sel.has(row.dataset.id)) ZC.select([row.dataset.id], row.dataset.id); return; }
      if (e.button !== 0) return; const row = e.target.closest('.row[data-id]'); list.focus({ preventScroll: true }); if (!row) return;
      const id = row.dataset.id, ord = ZC.order(); let collapse = null;
      if (e.metaKey || e.ctrlKey) { const s = new Set(S.sel); s.has(id) ? s.delete(id) : s.add(id); ZC.select([...s], s.has(id) ? id : [...s].pop() || null, { noScroll: true }); }
      else if (e.shiftKey && S.anchor) { const a = ord.indexOf(S.anchor), b = ord.indexOf(id); const [lo, hi] = a < b ? [a, b] : [b, a]; ZC.select(ord.slice(lo, hi + 1), id, { keepAnchor: true, noScroll: true }); }
      else if (S.sel.has(id) && S.sel.size > 1) collapse = id; else ZC.select([id], id, { noScroll: true });
      drag = { x: e.clientX, y: e.clientY, id, collapse, active: false, pid: e.pointerId, ghost: null, target: null };
      list.setPointerCapture(e.pointerId);
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.active) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return; if (!S.sel.has(drag.id)) return; drag.active = true; const n = S.sel.size; const c = ZC.get(drag.id); drag.ghost = el('.drag-ghost', ZC.avatar(c, 22), el('span', n > 1 ? `${n} contacts` : ZC.name(c)), n > 1 ? el('span.badge', n) : null); document.body.append(drag.ghost); document.body.classList.add('dragging'); }
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      const t = document.elementFromPoint(e.clientX, e.clientY); const item = t && t.closest && t.closest('#side [data-gid]'); const ok = item && ZC.group(item.dataset.gid) && !ZC.group(item.dataset.gid).smart ? item : null;
      if (drag.target !== ok) { drag.target && drag.target.classList.remove('drop'); drag.target = ok; ok && ok.classList.add('drop'); }
      if (S.sideHidden && e.clientX < 12) ZC.toggleSide(true);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.pid) return; const d = drag; drag = null; list.releasePointerCapture(e.pointerId);
      if (d.ghost) { d.ghost.remove(); document.body.classList.remove('dragging'); }
      if (d.target) { d.target.classList.remove('drop'); if (d.active && e.type === 'pointerup') ZC.addToGroup([...S.sel], d.target.dataset.gid); }
      else if (!d.active && d.collapse) ZC.select([d.collapse], d.collapse, { noScroll: true });
    };
    list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
    list.addEventListener('dblclick', (e) => { if (e.target.closest('.row[data-id]') && S.sel.size === 1) ZC.beginEdit(); });
    list.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const row = e.target.closest('.row[data-id]'); if (!row) return; const ids = [...S.sel]; const cs = ZC.selected();
      const groups = S.groups.filter((g) => !g.smart);
      zk.menu([
        ...(ids.length === 1 ? [{ label: 'Edit Contact', run: () => ZC.beginEdit() }, { label: 'Share Contact…', run: () => ZC.shareVcf(cs) }, { label: 'Copy as vCard', run: () => ZC.copyVcf(cs) }] : [{ label: `Merge ${ids.length} Contacts…`, run: () => ZC.mergeSelected() }, { label: 'Export Selected…', run: () => ZC.exportDialog('selected') }]),
        { separator: true }, { label: cs.every((c) => c.fav) ? 'Remove from Favourites' : 'Add to Favourites', run: () => ZC.toggleFav(ids) },
        { label: 'Add to Group', enabled: groups.length > 0, submenu: groups.length ? groups.map((g) => ({ label: g.name, run: () => ZC.addToGroup(ids, g.id) })) : [{ label: 'No Groups', enabled: false }] },
        ...(ZC.group(S.view) && !ZC.group(S.view).smart ? [{ label: 'Remove from “' + ZC.group(S.view).name + '”', run: () => ZC.removeFromGroup(ids, S.view) }] : []),
        { separator: true }, { label: 'Delete ' + (ids.length > 1 ? ids.length + ' Contacts' : 'Contact'), run: () => ZC.deleteSelected() },
      ], { x: e.clientX, y: e.clientY });
    });
  };

  ZC.deleteSelected = () => {
    const ids = [...S.sel]; if (!ids.length) return; finishEditIfAny(); const ord = ZC.order(); const first = ord.indexOf(ids[0]); const n = ids.length; const nm = n === 1 ? ZC.name(ZC.get(ids[0])) : n + ' contacts';
    ZC.remove(ids, n === 1 ? 'Delete Contact' : `Delete ${n} Contacts`);
    const after = ZC.order(); if (after.length) { const id = after[Math.min(first, after.length - 1)]; S.sel = new Set([id]); S.cur = S.anchor = id; }
    ZC.renderAll(); ZC.undoToast(`Deleted ${nm}`);
  };

  // ---------- sidebar ----------
  ZC.renderSidebar = () => {
    const side = $('#side'); const now = Date.now(); const cnt = {};
    const item = (id, icon, name, count, extra = {}) => {
      const it = el('.zk-list-item' + (S.view === id ? '.sel' : ''), { 'data-gid': id, role: 'button', tabindex: 0, 'aria-current': S.view === id ? 'true' : null }, zk.icon(icon), el('span.nm', name), el('span.zk-meta', String(count)));
      it.addEventListener('click', () => ZC.setView(id)); it.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ZC.setView(id); } });
      if (extra.menu) it.addEventListener('contextmenu', (e) => { e.preventDefault(); zk.menu(extra.menu(), { x: e.clientX, y: e.clientY }); });
      return it;
    };
    const man = S.groups.filter((g) => !g.smart), smart = S.groups.filter((g) => g.smart);
    man.forEach((g) => { cnt[g.id] = 0; }); S.contacts.forEach((c) => c.groups.forEach((id) => { if (id in cnt) cnt[id]++; }));
    const gm = (g) => () => [{ label: 'Rename…', enabled: !g.smart, run: () => ZC.renameGroup(g) }, ...(g.smart ? [{ label: 'Edit Smart Group…', run: () => ZC.smartDialog(g) }] : []), { label: 'Export Group…', run: () => ZC.exportDialog('group', g.id) }, { label: 'Print…', run: () => { ZC.setView(g.id); ZC.printDialog(); } }, { separator: true }, { label: 'Delete Group', run: () => ZC.deleteGroup(g) }];
    const hd = (t, act) => el('.zk-heading', el('span', t), act);
    const addG = zk.btn({ icon: 'plus', title: 'New Group', onClick: () => ZC.newGroup(S.sel.size > 0 && false) }); const addS = zk.btn({ icon: 'plus', title: 'New Smart Group', onClick: () => ZC.smartDialog() });
    const bd = M.upcomingBirthdays(S.contacts, 30, now).slice(0, 5);
    const scroll = el('.scroll', el('.grp', item('all', 'contact', 'All Contacts', S.contacts.length), item('fav', 'star', 'Favourites', S.contacts.filter((c) => c.fav).length), item('bday', 'calendar-days', 'Birthdays', S.contacts.filter((c) => c.bday).length)),
      hd('Groups', addG), el('.grp', man.map((g) => item(g.id, 'users', g.name, cnt[g.id] || 0, { menu: gm(g) })), man.length ? null : el('.zk-list-item', { style: { color: 'var(--fg-3)', fontSize: '12px', height: 'auto', padding: '4px 8px', whiteSpace: 'normal' } }, 'Drag contacts here, or add a group with +')),
      hd('Smart Groups', addS), el('.grp', smart.map((g) => item(g.id, 'sparkles', g.name, S.contacts.filter((c) => M.smartMatch(c, g, now)).length, { menu: gm(g) }))));
    side.replaceChildren(...[scroll, bd.length ? el('.bdays', el('.zk-heading', el('span', 'Upcoming Birthdays')), bd.map((b) => { const r = el('.bd' + (b.in === 0 ? '.today' : ''), { role: 'button', tabindex: 0 }, el('span.nm', ZC.name(b.c)), el('span.when', b.in === 0 ? 'Today' : b.in === 1 ? 'Tomorrow' : M.fmtDate(b.c.bday, true))); r.onclick = () => { ZC.setView('all'); ZC.select([b.c.id], b.c.id); }; return r; })) : null].filter(Boolean));
  };
  ZC.toggleSide = (on) => {
    const side = $('#side');
    if (innerWidth < 760) { side.classList.toggle('force', on === undefined ? !side.classList.contains('force') : on); S.sideHidden = !side.classList.contains('force'); }
    else { S.prefs.side = on === undefined ? !S.prefs.side : on; S.sideHidden = !S.prefs.side; side.classList.toggle('hidden', !S.prefs.side); ZC.prefsSave(); }
    ZC.menusSoon();
  };

  // ---------- chrome ----------
  ZC.renderStatus = () => {
    const n = S._count || 0, total = S.contacts.length; const sel = S.sel.size;
    $('#status').textContent = sel > 1 ? `${sel} of ${n.toLocaleString()} selected` : S.query ? `${n.toLocaleString()} of ${total.toLocaleString()} match “${S.query}”` : `${n.toLocaleString()} contact${n === 1 ? '' : 's'}`;
  };
  ZC.renderHead = () => {
    const h = $('#listhead'); const sort = S.prefs.sortBy === 'first' ? 'First name' : 'Last name'; h.classList.add('on');
    h.replaceChildren(el('span.grow', { style: { fontWeight: 600, color: 'var(--fg)' } }, ZC.viewName()), el('span', S.view === 'bday' ? 'Upcoming' : sort));
  };
  ZC.syncToolbar = () => {
    const b = $('#b-edit'); const one = S.sel.size === 1 || S.editing; b.textContent = S.editing ? 'Done' : 'Edit'; b.disabled = !one; b.classList.toggle('primary', S.editing);
    $('#qclear').hidden = !S.query; $('#b-new').disabled = false;
  };
  ZC.renderAll = () => { ZC.rows(); ZC.renderSidebar(); ZC.renderHead(); ZC.renderList(); ZC.renderCard(); ZC.renderStatus(); ZC.syncToolbar(); ZC.menusSoon(); };
  ZC.menusSoon = () => { clearTimeout(ZC._mt); ZC._mt = setTimeout(() => ZC.buildMenus && ZC.buildMenus(), 60); };

  ZC.initUI = () => {
    $('#b-side').append(zk.icon('panel-left')); $('#b-new').append(zk.icon('plus')); $('#qclear').append(zk.icon('x', 10)); $('#searchbox .si').append(zk.icon('search', 14));
    $('#b-side').onclick = () => ZC.toggleSide();
    $('#b-new').onclick = () => ZC.newContact(); $('#b-edit').onclick = () => (S.editing ? ZC.finishEdit(true) : ZC.beginEdit());
    const q = $('#q'); q.addEventListener('input', () => { S.query = q.value; S._rows = null; const ord = ZC.order(); if (!S.sel.size || !ord.includes(S.cur)) { S.sel = new Set(ord.length ? [ord[0]] : []); S.cur = S.anchor = ord[0] || null; } $('#list').scrollTop = 0; ZC.renderList(); ZC.renderCard(); ZC.renderStatus(); ZC.syncToolbar(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; S.query = ''; q.dispatchEvent(new Event('input')); q.blur(); $('#list').focus(); } else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); $('#list').focus(); if (e.key === 'ArrowDown' && ZC.order().length && !S.sel.size) ZC.moveSel(1); } });
    $('#qclear').onclick = () => { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); };
    // list column resize
    const rz = $('#resizer'), lc = $('#listcol'); lc.style.width = S.prefs.listW + 'px';
    rz.addEventListener('pointerdown', (e) => { rz.setPointerCapture(e.pointerId); rz.classList.add('active'); const x0 = e.clientX, w0 = lc.offsetWidth; const mv = (ev) => { const w = zk.clamp(w0 + ev.clientX - x0, 200, Math.min(420, innerWidth - 400)); lc.style.width = w + 'px'; S.prefs.listW = w; }; const up = () => { rz.classList.remove('active'); rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); ZC.prefsSave(); ZC.renderList(); }; rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); });
    setupListInput(); new ResizeObserver(() => ZC.renderList()).observe($('#list'));
    S.sideHidden = !S.prefs.side; $('#side').classList.toggle('hidden', !S.prefs.side);
  };
})();
