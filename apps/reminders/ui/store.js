/* App state, undo/redo history and crash-safe persistence on top of zeng.store. */
(function () {
  const D = ZR.dates, R = ZR.recur;
  const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 9);
  const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#32ade6', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93', '#30b0c7'];
  const ICONS = ['list', 'house', 'briefcase', 'shopping-cart', 'shopping-bag', 'book', 'graduation-cap', 'heart', 'star', 'gift', 'plane', 'car', 'wallet', 'lightbulb', 'users', 'sun', 'moon', 'target', 'globe', 'camera', 'sparkles', 'flag', 'coffee', 'utensils', 'music', 'film', 'gamepad-2', 'dumbbell', 'leaf', 'paw-print'];
  const blankState = () => ({ v: 1, lists: [], groups: [], side: [], reminders: {}, templates: [], prefs: { views: {} }, fired: {} });
  const defaultState = () => { const s = blankState(); const id = uid(); s.lists.push({ id, name: 'Tasks', color: '#32ade6', icon: 'list' }); s.side.push('l:' + id); s.prefs.view = { k: 'list', id }; return s; };
  let S = defaultState();
  const subs = new Set(); const undoStack = []; const redoStack = []; const MAXH = 200;
  let loadNote = null;

  const emit = (why) => { subs.forEach((f) => { try { f(S, why); } catch (e) { console.error(e); } }); };
  const newReminder = (o = {}) => { const now = Date.now(); return { id: uid(), list: null, parent: null, title: '', notes: '', url: '', due: null, time: null, repeat: null, early: null, priority: 0, flag: false, tags: [], done: false, doneAt: null, created: now, modified: now, order: 0, collapsed: false, atts: [], ...o }; };

  // ---------- draft helpers: only valid inside commit() ----------
  const nextOrder = (list, parent) => { let m = 0; for (const id in S.reminders) { const r = S.reminders[id]; if (r.list === list && (r.parent || null) === (parent || null) && r.order > m) m = r.order; } return m + 1; };
  const draft = {
    get S() { return S; },
    add(o) { const r = newReminder(o); if (!r.list) r.list = S.lists[0].id; if (!o.order) r.order = nextOrder(r.list, r.parent); S.reminders[r.id] = r; return r.id; },
    set(id, patch) { const r = S.reminders[id]; if (!r) return; S.reminders[id] = { ...r, ...(typeof patch === 'function' ? patch(r) : patch), modified: Date.now() }; },
    del(id) { const dead = [id]; for (const k in S.reminders) if (S.reminders[k].parent === id) dead.push(k); dead.forEach((k) => delete S.reminders[k]); return dead; },
    complete(id, done) {
      const r = S.reminders[id]; if (!r) return null; const now = Date.now();
      if (done && r.repeat && r.due) {
        const cnt = r.repeat.count; const nx = cnt && cnt <= 1 ? null : R.next(r.repeat, r.due, D.today());
        if (nx) {
          const hid = uid(); S.reminders[hid] = { ...r, id: hid, repeat: null, early: null, done: true, doneAt: now, modified: now, collapsed: false, atts: r.atts || [] };
          S.reminders[id] = { ...r, due: nx, repeat: cnt ? { ...r.repeat, count: cnt - 1 } : r.repeat, modified: now };
          for (const k in S.reminders) if (S.reminders[k].parent === id && S.reminders[k].done) S.reminders[k] = { ...S.reminders[k], done: false, doneAt: null };
          return { advanced: true, next: nx };
        }
      }
      S.reminders[id] = { ...r, done, doneAt: done ? now : null, modified: now }; return { advanced: false };
    },
    addList(o) { const l = { id: uid(), name: 'New List', color: COLORS[4], icon: 'list', ...o }; S.lists = [...S.lists, l]; if (o && o.group && S.groups.some((g) => g.id === o.group)) { S.groups = S.groups.map((g) => (g.id === o.group ? { ...g, lists: [...g.lists, l.id] } : g)); delete l.group; } else { delete l.group; S.side = [...S.side, 'l:' + l.id]; } return l.id; },
    setList(id, patch) { S.lists = S.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)); },
    delList(id) {
      for (const k in S.reminders) if (S.reminders[k].list === id) delete S.reminders[k];
      S.lists = S.lists.filter((l) => l.id !== id); S.side = S.side.filter((k) => k !== 'l:' + id); S.groups = S.groups.map((g) => ({ ...g, lists: g.lists.filter((x) => x !== id) }));
      if (!S.lists.length) { const nid = draft.addList({ name: 'Tasks' }); void nid; }
    },
    addGroup(name) { const g = { id: uid(), name: name || 'New Group', collapsed: false, lists: [] }; S.groups = [...S.groups, g]; S.side = [...S.side, 'g:' + g.id]; return g.id; },
    setGroup(id, patch) { S.groups = S.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)); },
    delGroup(id) { const g = S.groups.find((x) => x.id === id); if (!g) return; const i = S.side.indexOf('g:' + id); S.side = [...S.side.slice(0, i), ...g.lists.map((x) => 'l:' + x), ...S.side.slice(i + 1)]; S.groups = S.groups.filter((x) => x.id !== id); },
    // Move a sidebar entry: kind 'l'|'g', id; to = {group:gid|null, index}
    moveSide(kind, id, to) {
      const key = kind + ':' + id; S.side = S.side.filter((k) => k !== key); S.groups = S.groups.map((g) => ({ ...g, lists: g.lists.filter((x) => x !== id) }));
      if (to.group) S.groups = S.groups.map((g) => { if (g.id !== to.group) return g; const a = g.lists.slice(); a.splice(Math.min(to.index, a.length), 0, id); return { ...g, lists: a }; });
      else { const a = S.side.slice(); a.splice(Math.min(to.index, a.length), 0, key); S.side = a; }
    },
    replaceAll(ns) { S = { ...ns, prefs: S.prefs, fired: S.fired, reminders: { ...ns.reminders } }; },
  };
  // ---------- history ----------
  const commit = (label, fn, opts = {}) => {
    const prev = S; S = { ...S, reminders: { ...S.reminders } };
    try { fn(draft); } catch (e) { S = prev; throw e; }
    if (S === prev) return;
    const last = undoStack[undoStack.length - 1]; const now = Date.now();
    if (opts.key && last && last.key === opts.key && now - last.t < 1500) { last.t = now; last.label = label; }
    else { undoStack.push({ label, prev, key: opts.key || null, t: now }); if (undoStack.length > MAXH) undoStack.shift(); }
    redoStack.length = 0; changed(); emit('commit');
  };
  const undo = () => { const e = undoStack.pop(); if (!e) return null; redoStack.push({ label: e.label, prev: S }); S = keepMeta(e.prev); changed(); emit('undo'); return e.label; };
  const redo = () => { const e = redoStack.pop(); if (!e) return null; undoStack.push({ label: e.label, prev: S, key: null, t: 0 }); S = keepMeta(e.prev); changed(); emit('redo'); return e.label; };
  const keepMeta = (s) => ({ ...s, prefs: S.prefs, fired: S.fired });
  const meta = (fn) => { S = { ...S, prefs: { ...S.prefs }, fired: { ...S.fired } }; fn(S); changed(); emit('meta'); };

  // ---------- persistence: two rotating slots + daily backup, checksum-verified ----------
  const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  let seq = 0, timer = 0, writing = null, pending = false, lastDaily = '', dirty = false;
  const serialize = (s) => JSON.stringify({ v: 1, lists: s.lists, groups: s.groups, side: s.side, reminders: Object.values(s.reminders), templates: s.templates, prefs: s.prefs, fired: s.fired });
  const changed = () => { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 300); setStatus('saving'); };
  let statusCb = null; const setStatus = (s) => statusCb && statusCb(s);
  async function writeOnce() {
    const json = serialize(S); const rec = { seq: ++seq, ts: Date.now(), sum: fnv(json), json };
    await zeng.store.set(rec.seq % 2 ? 'db-a' : 'db-b', rec);
    const day = D.today(); if (lastDaily !== day) { lastDaily = day; await zeng.store.set('db-daily', rec); }
  }
  async function flush() {
    clearTimeout(timer); if (!dirty && !pending) return; if (writing) { pending = true; return writing; }
    dirty = false; pending = false;
    writing = (async () => { try { await writeOnce(); setStatus('saved'); } catch (e) { console.error('save failed', e); setStatus('error'); dirty = true; } })();
    await writing; writing = null; if (pending || dirty) return flush();
  }
  function parseState(json) {
    const o = JSON.parse(json); if (!o || typeof o !== 'object') throw new Error('bad'); const s = blankState();
    s.lists = (Array.isArray(o.lists) ? o.lists : []).filter((l) => l && l.id && typeof l.name === 'string').map((l) => ({ id: String(l.id), name: l.name, color: l.color || COLORS[4], icon: l.icon || 'list' }));
    s.groups = (Array.isArray(o.groups) ? o.groups : []).filter((g) => g && g.id).map((g) => ({ id: String(g.id), name: String(g.name || 'Group'), collapsed: !!g.collapsed, lists: (Array.isArray(g.lists) ? g.lists : []).map(String) }));
    s.side = (Array.isArray(o.side) ? o.side : []).filter((k) => typeof k === 'string');
    (Array.isArray(o.reminders) ? o.reminders : Object.values(o.reminders || {})).forEach((r) => { if (r && r.id && typeof r.title === 'string') s.reminders[r.id] = newReminder({ ...r }); });
    s.templates = Array.isArray(o.templates) ? o.templates : []; s.prefs = { views: {}, ...(o.prefs || {}) }; s.prefs.views = s.prefs.views || {}; s.fired = o.fired && typeof o.fired === 'object' ? o.fired : {};
    return normalize(s);
  }
  function normalize(s) {
    if (!s.lists.length) { const id = uid(); s.lists.push({ id, name: 'Tasks', color: '#32ade6', icon: 'list' }); }
    const ids = new Set(s.lists.map((l) => l.id)); const seen = new Set();
    s.groups = s.groups.map((g) => ({ ...g, lists: g.lists.filter((x) => ids.has(x) && !seen.has(x) && seen.add(x)) }));
    s.side = s.side.filter((k) => { const [t, id] = [k[0], k.slice(2)]; if (t === 'l') return ids.has(id) && !seen.has(id) && seen.add(id); return t === 'g' && s.groups.some((g) => g.id === id); });
    s.lists.forEach((l) => { if (!seen.has(l.id)) s.side.push('l:' + l.id); });
    s.groups.forEach((g) => { if (!s.side.includes('g:' + g.id)) s.side.push('g:' + g.id); });
    const first = s.lists[0].id;
    for (const id in s.reminders) { let r = s.reminders[id]; const fix = {}; if (!ids.has(r.list)) fix.list = first; if (r.parent && (!s.reminders[r.parent] || r.parent === id || s.reminders[r.parent].parent)) fix.parent = null; if (!Array.isArray(r.tags)) fix.tags = []; if (r.due && !D.parse(r.due)) fix.due = null; if (r.time && D.minutes(r.time) == null) fix.time = null; if (![0, 1, 2, 3].includes(r.priority)) fix.priority = 0; if (Object.keys(fix).length) s.reminders[id] = { ...r, ...fix }; }
    if (!s.prefs.view || (s.prefs.view.k === 'list' && !ids.has(s.prefs.view.id))) s.prefs.view = { k: 'list', id: first };
    return s;
  }
  async function load() {
    const slots = await Promise.all(['db-a', 'db-b', 'db-daily'].map((k) => zeng.store.get(k, null)));
    const cands = slots.map((rec, i) => ({ rec, i })).filter((c) => c.rec != null);
    const valid = []; let bad = 0;
    for (const { rec, i } of cands) { try { if (!rec || typeof rec.json !== 'string' || fnv(rec.json) !== rec.sum) throw new Error('checksum'); valid.push({ seq: rec.seq || 0, i, s: parseState(rec.json), rec }); } catch (e) { bad++; console.warn('slot', i, 'unusable', e.message); } }
    valid.sort((a, b) => (a.i === 2) - (b.i === 2) || b.seq - a.seq); // daily backup only if both rotating slots are bad
    seq = Math.max(0, ...cands.map((c) => (c.rec && c.rec.seq) || 0));
    if (valid.length) { S = valid[0].s; if (bad) loadNote = valid[0].i === 2 ? 'Your reminders were recovered from yesterday’s automatic backup because the newest data could not be read.' : 'Some saved data could not be read. Your reminders were recovered from the previous save.'; if (bad && valid[0].i === 2) loadNote = loadNote; }
    else if (cands.length) { try { await zeng.store.set('db-corrupt', { ts: Date.now(), slots }); } catch {} S = defaultState(); loadNote = 'Your saved reminders could not be read, so Todo started with an empty list. The damaged data was kept in the app’s data folder (db-corrupt.json).'; }
    else S = defaultState();
    undoStack.length = 0; redoStack.length = 0; if (bad) { dirty = true; await flush(); }
    return loadNote;
  }
  // ---------- attachments (stored as separate store keys; images downscaled) ----------
  const attCache = new Map();
  const att = {
    async put(rec) { const id = uid(); attCache.set(id, rec); await zeng.store.set('att-' + id, rec); return id; },
    async putAs(id, rec) { attCache.set(id, rec); await zeng.store.set('att-' + id, rec); },
    async get(id) { if (attCache.has(id)) return attCache.get(id); const r = await zeng.store.get('att-' + id, null); if (r) attCache.set(id, r); return r; },
    async gc() { const used = new Set(); Object.values(S.reminders).forEach((r) => (r.atts || []).forEach((a) => used.add(a.id))); (S.templates || []).forEach(() => {}); /* native store has no key listing; orphans are tiny and bounded by user action */ return used; },
  };
  // ---------- backup (JSON) ----------
  async function backupObject() {
    const attachments = {}; for (const r of Object.values(S.reminders)) for (const a of r.atts || []) { const rec = await att.get(a.id); if (rec) attachments[a.id] = rec; }
    return { app: 'zengreminders', version: 1, exported: new Date().toISOString(), state: JSON.parse(serialize(S)), attachments };
  }
  const sanitizeIncoming = (o) => { if (!o || o.app !== 'zengreminders' || !o.state) throw new Error('This is not a Todo backup file.'); return parseState(JSON.stringify(o.state)); };
  // Merge parsed state into the app with fresh ids (never collides)
  function mergeState(d, inc) {
    const lmap = {}, rmap = {};
    inc.lists.forEach((l) => { const id = d.addList({ name: l.name, color: l.color, icon: l.icon }); lmap[l.id] = id; });
    // replicate groups
    inc.groups.forEach((g) => { const gid = d.addGroup(g.name); d.setGroup(gid, { collapsed: g.collapsed }); g.lists.forEach((lid) => { if (lmap[lid]) d.moveSide('l', lmap[lid], { group: gid, index: 9999 }); }); });
    const arr = Object.values(inc.reminders).sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
    arr.forEach((r) => { rmap[r.id] = d.add({ ...r, id: undefined, list: lmap[r.list], parent: r.parent ? rmap[r.parent] || null : null, order: r.order || 0.0001 }); });
    // preserve order values
    arr.forEach((r) => { d.set(rmap[r.id], { order: r.order }); });
    inc.templates.forEach((t) => { S.templates = [...S.templates, { ...t, id: uid() }]; });
    return { lists: inc.lists.length, reminders: arr.length };
  }
  // items from ICS/CSV/Markdown parsers -> reminders. Skips exact duplicates in the same list.
  function importItems(d, parsed, { intoList = null, colors = {}, ensureTags = true } = {}) {
    const byName = new Map(S.lists.map((l) => [l.name.toLowerCase(), l.id])); const uidMap = new Map(); let added = 0, skipped = 0, newLists = 0;
    const palette = COLORS.filter((c) => c !== '#32ade6'); const listFor = (name) => {
      if (intoList) return intoList; const key = (name || 'Tasks').toLowerCase(); if (byName.has(key)) return byName.get(key);
      const c = colors[name]; const id = d.addList({ name: name || 'Tasks', color: /^#[0-9a-f]{6}$/i.test(c || '') ? c : palette[(S.lists.length) % palette.length] }); byName.set(key, id); newLists++; return id;
    };
    const existing = new Set(Object.values(S.reminders).map((r) => [r.list, r.title, r.due, r.time].join('|')));
    const items = parsed.items; const order = {};
    for (const it of items.filter((i) => !i.parentUid || !items.some((p) => p.uid === i.parentUid))) place(it, null);
    for (const it of items.filter((i) => i.parentUid && items.some((p) => p.uid === i.parentUid))) { const par = uidMap.get(it.parentUid); if (par) place(it, par); else if (!uidMap.has(it.uid)) place(it, null); }
    function place(it, parent) {
      const list = parent ? S.reminders[parent].list : listFor(it.listName); const sig = [list, it.title, it.due, it.time].join('|');
      if (existing.has(sig)) { skipped++; return; } existing.add(sig);
      const id = d.add({ list, parent, title: it.title, notes: it.notes || '', url: it.url || '', due: it.due, time: it.time, repeat: it.repeat, early: it.early, priority: it.priority || 0, flag: !!it.flag, tags: it.tags || [], done: !!it.done, doneAt: it.doneAt || (it.done ? Date.now() : null), created: it.created || Date.now() });
      uidMap.set(it.uid, id); added++;
    }
    return { added, skipped, newLists };
  }
  const attachCb = (f) => (statusCb = f);
  window.ZR.store = {
    uid, COLORS, ICONS, newReminder, get state() { return S; }, subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    commit, undo, redo, meta, flush, load, att, backupObject, sanitizeIncoming, mergeState, importItems, normalize, parseState, blankState, defaultState, onStatus: attachCb,
    canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0, undoLabel: () => (undoStack.length ? undoStack[undoStack.length - 1].label : ''), redoLabel: () => (redoStack.length ? redoStack[redoStack.length - 1].label : ''),
    get loadNote() { return loadNote; }, replaceState: (ns, label) => commit(label, (d) => { d.replaceAll(ns); }), clearHistory: () => { undoStack.length = 0; redoStack.length = 0; },
    resetForTest: (s) => { S = s || defaultState(); undoStack.length = 0; redoStack.length = 0; emit('reset'); },
  };
})();
