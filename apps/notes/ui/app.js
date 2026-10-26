/* ZengNotes application: state, sidebar, note list, note lifecycle, toolbar, menus. */
(() => {
  const U = N.u, CV = N.cv, Db = N.db, Ed = N.ed, C = N.crypto; const A = (N.app = {});
  const $ = (s, r = document) => r.querySelector(s); const esc = U.esc;
  const DEFAULTS = { font: 15, width: 'medium', compact: false, snippets: true, thumbs: true, group: true, sort: 'm', asc: false, autoSort: false, spell: true, lockMin: 10, sidebarW: 210, listW: 290, sidebar: true, last: null };
  const S = (A.S = { view: { kind: 'smart', id: 'all' }, q: '', sel: new Set(), anchor: null, cur: null, rec: null, keys: new Map(), settings: { ...DEFAULTS }, rows: [], filtered: [], low: new Map(), fresh: new Set(), sessionAtts: new Set(), dirty: false, editing: false, tok: 0, lastSaved: null, mode: '' });
  const M = () => Db.idx.notes; const F = () => Db.idx.folders;
  const el = {}; const SMART = [['all', 'All Notes', 'notebook'], ['pinned', 'Pinned', 'pin'], ['check', 'Checklists', 'list-checks'], ['att', 'With Attachments', 'paperclip'], ['locked', 'Locked', 'lock'], ['trash', 'Recently Deleted', 'trash-2']];
  const isMac = () => zeng.platform === 'mac';

  // ------------------------------------------------------------ settings
  A.saveSettings = U_debounce(() => zeng.store.set('settings', S.settings), 300);
  function U_debounce(f, ms) { return zk.debounce(f, ms); }
  A.applySettings = () => {
    const s = S.settings; const r = document.documentElement.style;
    r.setProperty('--ed-size', s.font + 'px'); r.setProperty('--ed-width', { narrow: '560px', medium: '720px', wide: '900px', full: '1600px' }[s.width] + '');
    r.setProperty('--sbw', s.sidebarW + 'px'); r.setProperty('--lw', s.listW + 'px');
    el.listpane.classList.toggle('compact', !!s.compact); document.body.classList.toggle('hide-sidebar', !s.sidebar);
    el.ed.spellcheck = !!s.spell; el.title.spellcheck = !!s.spell;
  };
  const setSetting = (k, v, relist = false) => { S.settings[k] = v; A.saveSettings(); A.applySettings(); if (relist) A.refresh(); zeng.refreshMenus(); };
  A.setSetting = setSetting;

  // ------------------------------------------------------------ folders
  const folderById = (id) => F().find((f) => f.id === id);
  const kidsOf = (pid) => F().filter((f) => (f.p || null) === (pid || null)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const descendants = (id) => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const f of F()) if (f.p && out.has(f.p) && !out.has(f.id)) { out.add(f.id); grew = true; } } return out; };
  const folderPath = (id) => { const n = []; let f = folderById(id); let g = 0; while (f && g++ < 20) { n.unshift(f.name); f = f.p ? folderById(f.p) : null; } return n.join(' / '); };
  A.folderById = folderById; A.folderPath = folderPath; A.kidsOf = kidsOf; A.descendants = descendants;
  const flatFolders = (pid = null, depth = 0, out = []) => { for (const f of kidsOf(pid)) { out.push({ f, depth }); flatFolders(f.id, depth + 1, out); } return out; };
  A.flatFolders = flatFolders;

  // ------------------------------------------------------------ querying
  const metas = () => Object.values(M());
  const tokens = () => S.q.toLowerCase().split(/\s+/).filter(Boolean);
  const viewFilter = () => {
    const v = S.view;
    if (v.kind === 'smart') { switch (v.id) { case 'all': return (m) => !m.d; case 'pinned': return (m) => !m.d && m.p; case 'check': return (m) => !m.d && m.ck; case 'att': return (m) => !m.d && m.na > 0; case 'locked': return (m) => !m.d && m.l; case 'trash': return (m) => !!m.d; } }
    if (v.kind === 'folder') { if (v.id === '__notes') return (m) => !m.d && !m.f; const ds = descendants(v.id); return (m) => !m.d && ds.has(m.f); }
    if (v.kind === 'tag') return (m) => !m.d && m.tg && m.tg.includes(v.id);
    return () => true;
  };
  const viewName = () => { const v = S.view; if (v.kind === 'smart') return SMART.find((s) => s[0] === v.id)[1]; if (v.kind === 'tag') return '#' + v.id; if (v.id === '__notes') return 'Notes'; const f = folderById(v.id); return f ? f.name : 'Notes'; };
  A.viewName = viewName;
  const sortFn = () => { const k = S.settings.sort, asc = S.settings.asc; if (k === 't') return (a, b) => (asc ? -1 : 1) * (a.t || '\uffff').localeCompare(b.t || '\uffff', undefined, { numeric: true, sensitivity: 'base' }) || b.m - a.m; const dir = asc ? 1 : -1; return (a, b) => dir * ((a[k] || 0) - (b[k] || 0)); };

  A.refresh = (keepScroll = true) => {
    const toks = tokens(); const searching = toks.length > 0; const inTrash = S.view.kind === 'smart' && S.view.id === 'trash';
    let list;
    if (searching) {
      list = metas().filter((m) => (inTrash ? !!m.d : !m.d) && toks.every((t) => (S.low.get(m.id) || '').includes(t)));
      list.sort((a, b) => { const ta = toks.every((t) => (a.t || '').toLowerCase().includes(t)), tb = toks.every((t) => (b.t || '').toLowerCase().includes(t)); return ta !== tb ? (ta ? -1 : 1) : b.m - a.m; });
    } else { const f = viewFilter(); list = metas().filter(f); list.sort(sortFn()); }
    S.filtered = list; buildRows(list, searching, inTrash); renderSidebar(); renderList(keepScroll); updateEmpty(); renderStatus();
    document.title = viewName() + ' — Notes'; const t = $('[data-doc-title]'); if (t) t.firstChild.textContent = searching ? 'Search' : viewName();
    if (t && t.lastChild && t.lastChild.tagName === 'SMALL') t.lastChild.textContent = list.length + (list.length === 1 ? ' note' : ' notes');
  };

  // ------------------------------------------------------------ list rows (virtualised)
  const H_HDR = 30; const rowH = () => (S.settings.compact ? 46 : 66) + (showFolder() && !S.settings.compact ? 14 : 0);
  const showFolder = () => tokens().length > 0 || (S.view.kind === 'smart' && S.view.id !== 'pinned') || S.view.kind === 'tag' || (S.view.kind === 'folder' && kidsOf(S.view.id).length > 0);
  function buildRows(list, searching, inTrash) {
    const rows = []; let y = 0; const rh = rowH(); const s = S.settings; const now = Date.now();
    const pushHdr = (label, icon) => { rows.push({ t: 'h', label, icon, top: y, h: H_HDR }); y += H_HDR; };
    const pushNote = (m) => { rows.push({ t: 'n', id: m.id, top: y, h: rh }); y += rh; };
    if (searching) { if (list.length) pushHdr(list.length + (list.length === 1 ? ' Result' : ' Results'), 'search'); list.forEach(pushNote); }
    else if (inTrash) { if (list.length) pushHdr('Notes are deleted after 30 days', 'trash-2'); list.forEach(pushNote); }
    else {
      const pinned = list.filter((m) => m.p), rest = list.filter((m) => !m.p || (S.view.kind === 'smart' && S.view.id === 'pinned'));
      const only = S.view.kind === 'smart' && S.view.id === 'pinned';
      if (!only && pinned.length) { pushHdr('Pinned', 'pin'); pinned.forEach(pushNote); }
      const body = only ? list : rest; let lastKey = null;
      for (const m of body) {
        if (s.group && s.sort !== 't') { const [k, label] = U.dayGroup(s.sort === 'c' ? m.c : m.m, now); if (k !== lastKey) { pushHdr(label); lastKey = k; } }
        else if (rows.length === (pinned.length && !only ? pinned.length + 1 : 0) && (pinned.length && !only)) pushHdr('Notes');
        pushNote(m);
      }
    }
    S.rows = rows; S.totalH = y + 8;
  }
  const thumbCache = new Map(); const thumbPending = new Set();
  function wantThumb(id) {
    if (thumbCache.has(id)) return thumbCache.get(id); if (thumbPending.has(id)) return null; thumbPending.add(id);
    Db.getThumb(id).then((u) => { thumbCache.set(id, u || null); thumbPending.delete(id); const row = el.listIn.querySelector(`.nr[data-id="${id}"] .th`); if (row && u) row.src = u; }).catch(() => thumbPending.delete(id)); return null;
  }
  const hl = (text, toks) => { let h = esc(text); if (!toks.length) return h; const re = new RegExp('(' + toks.map(U.reEsc).map(esc).join('|') + ')', 'gi'); return h.replace(re, '<mark>$1</mark>'); };
  function snippetOf(m, toks) {
    if (!toks.length) return esc(m.s || '');
    const full = Db.text(m.id); const low = full.toLowerCase(); let at = -1; const bodyStart = (m.t || '').length;
    for (const t of toks) { const i = low.indexOf(t, bodyStart); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return esc(m.s || '');
    const start = Math.max(bodyStart, at - 28); const seg = full.slice(start, at + 90).replace(/\s+/g, ' ');
    return (start > bodyStart ? '…' : '') + hl(seg, toks);
  }
  const dateLabel = (m) => U.shortDate(S.settings.sort === 'c' ? m.c : m.m);
  function buildRow(r) {
    const m = M()[r.id]; if (!m) return null; const toks = tokens(); const compact = S.settings.compact; const sel = S.sel.has(m.id);
    const row = zk.el('.nr' + (sel ? '.sel' : ''), { 'data-id': m.id, role: 'option', 'aria-selected': String(sel), style: { top: r.top + 'px', height: r.h - 2 + 'px' } });
    const nt = zk.el('.nt'); if (m.p && !(S.view.kind === 'smart' && S.view.id === 'pinned')) { /* in pinned section */ } if (m.l) nt.append(zk.icon('lock')); nt.append(zk.el('span', { html: hl(m.t || 'New Note', toks), style: { overflow: 'hidden', textOverflow: 'ellipsis', flex: '1', minWidth: '0' } })); if (!m.t) nt.lastChild.style.opacity = '.5';
    nt.append(zk.el('span.nd', dateLabel(m)));
    const sn = zk.el('.ns'); if (S.settings.snippets && !compact) sn.append(zk.el('span', { html: m.l ? '<i>Locked</i>' : snippetOf(m, toks) || '<span style="opacity:.55">No additional text</span>' }));
    const nb = zk.el('.nb', nt, compact || !S.settings.snippets ? null : sn);
    if (showFolder() && !compact) { const fn = m.f && folderById(m.f) ? folderPath(m.f) : 'Notes'; nb.append(zk.el('.nf', zk.icon('folder'), fn)); }
    row.append(nb);
    if (S.settings.thumbs && m.th && !m.l) { const u = wantThumb(m.id); const im = zk.el('img.th', { alt: '', draggable: false }); if (u) im.src = u; row.append(im); }
    return row;
  }
  function renderList(keepScroll = true) {
    const sc = el.list.scrollTop; el.listIn.style.height = S.totalH + 'px'; const vh = el.list.clientHeight || 600; const rows = S.rows;
    const from = sc - 120, to = sc + vh + 120; let lo = 0, hi = rows.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].top + rows[mid].h < from) lo = mid + 1; else hi = mid; }
    const els = []; for (let i = lo; i < rows.length && rows[i].top < to; i++) { const r = rows[i]; if (r.t === 'h') { const h = zk.el('.lh', { style: { top: r.top + 'px' } }, r.icon ? zk.icon(r.icon) : null, r.label); els.push(h); } else { const e = buildRow(r); e && els.push(e); } }
    el.listIn.replaceChildren(...els); if (!keepScroll) el.list.scrollTop = 0;
  }
  A.renderList = renderList;
  function scrollToId(id) { const r = S.rows.find((x) => x.id === id); if (!r) return; const sc = el.list.scrollTop, vh = el.list.clientHeight; if (r.top < sc + H_HDR) el.list.scrollTop = Math.max(0, r.top - H_HDR - 4); else if (r.top + r.h > sc + vh) el.list.scrollTop = r.top + r.h - vh + 6; renderList(); }
  function updateEmpty() {
    const e = el.listEmpty; const none = S.filtered.length === 0; e.classList.toggle('zk-hidden', !none); if (!none) return; e.textContent = '';
    const searching = tokens().length; e.append(zk.icon(searching ? 'search' : S.view.id === 'trash' ? 'trash-2' : 'notebook', 34), zk.el('strong', searching ? 'No Results' : S.view.kind === 'smart' && S.view.id === 'trash' ? 'No Deleted Notes' : 'No Notes'), zk.el('span', searching ? 'Try a different search.' : S.view.id === 'trash' ? 'Deleted notes stay here for 30 days.' : 'Press ⌘N to write one.'));
    e.firstChild.style.cssText = 'width:34px;height:34px;margin:0 auto;stroke-width:1.3';
  }
  function renderStatus() { const n = S.filtered.length; el.stCount.textContent = n + (n === 1 ? ' note' : ' notes'); }

  // selection
  A.selectIds = async (ids, { open = true, anchor } = {}) => {
    S.sel = new Set(ids); S.anchor = anchor || ids[0] || null; renderList(); zeng.refreshMenus();
    if (!open) return; if (ids.length === 1) await openNote(ids[0]); else if (ids.length === 0) await closeNote(); else { await leaveNote(); showPlaceholder('multi'); }
  };
  function rowClick(e, id) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && S.anchor) { const ids = S.rows.filter((r) => r.t === 'n').map((r) => r.id); const a = ids.indexOf(S.anchor), b = ids.indexOf(id); if (a >= 0 && b >= 0) { const [x, y] = a < b ? [a, b] : [b, a]; A.selectIds(ids.slice(x, y + 1), { anchor: S.anchor }); return; } }
    if (mod) { const s = new Set(S.sel); if (s.has(id)) s.delete(id); else s.add(id); A.selectIds([...s], { anchor: id }); return; }
    A.selectIds([id]);
  }
  function listKey(e) {
    const ids = S.rows.filter((r) => r.t === 'n').map((r) => r.id); if (!ids.length) return; const k = e.key; const cur = [...S.sel].pop() || S.cur; let i = ids.indexOf(S.anchor && S.sel.size > 1 ? S.focusId || cur : cur);
    const go = (ni) => { ni = zk.clamp(ni, 0, ids.length - 1); e.preventDefault(); S.focusId = ids[ni]; if (e.shiftKey && S.anchor) { const a = ids.indexOf(S.anchor); const [x, y] = a < ni ? [a, ni] : [ni, a]; A.selectIds(ids.slice(x, y + 1), { anchor: S.anchor }); } else A.selectIds([ids[ni]]); scrollToId(ids[ni]); };
    if (k === 'ArrowDown') go(i < 0 ? 0 : i + 1); else if (k === 'ArrowUp') go(i < 0 ? 0 : i - 1); else if (k === 'Home') go(0); else if (k === 'End') go(ids.length - 1);
    else if (k === 'PageDown') go(i + 8); else if (k === 'PageUp') go(i - 8);
    else if (k === 'Enter' || k === 'ArrowRight' && !e.shiftKey) { if (S.editing) { e.preventDefault(); Ed.focus(); } else if (S.cur && S.rec && S.rec.lock) { e.preventDefault(); A.unlockView(); } }
    else if ((k === 'Delete' || k === 'Backspace') && !e.metaKey) { e.preventDefault(); A.deleteSelected(); }
    else if (k === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); A.selectIds(ids); }
  }

  // ------------------------------------------------------------ drag & drop (pointer based)
  function beginDrag(e, id) {
    const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null; const ids = S.sel.has(id) ? [...S.sel] : [id];
    const mv = (ev) => {
      if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; ghost = zk.el('.ghost', ids.length > 1 ? ids.length + ' Notes' : (M()[id].t || 'New Note')); document.body.append(ghost); document.body.style.cursor = 'grabbing'; el.listIn.querySelectorAll('.nr').forEach((r) => ids.includes(r.dataset.id) && r.classList.add('dragging')); }
      ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 8 + 'px';
      const t = document.elementFromPoint(ev.clientX, ev.clientY); const tgt = t && t.closest && t.closest('.sb-item[data-drop]');
      if (over !== tgt) { over && over.classList.remove('drop'); over = tgt; over && over.classList.add('drop'); }
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); document.body.style.cursor = ''; if (ghost) { ghost.remove(); over && over.classList.remove('drop'); el.listIn.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging')); S.justDragged = true; setTimeout(() => (S.justDragged = false), 50); if (over) dropNotes(ids, over.dataset.drop); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function dropNotes(ids, target) {
    if (target === 'trash') return A.deleteNotes(ids);
    if (target === 'pinned') { ids.forEach((id) => { M()[id].p = 1; }); Db.touchIndex(); A.refresh(); return A.kick(); }
    if (target.startsWith('f:')) A.moveNotes(ids, target.slice(2) === '__notes' ? null : target.slice(2));
  }
  function beginFolderDrag(e, fid) {
    const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null;
    const mv = (ev) => { if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; ghost = zk.el('.ghost', folderById(fid).name); document.body.append(ghost); document.body.style.cursor = 'grabbing'; } ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 8 + 'px'; const t = document.elementFromPoint(ev.clientX, ev.clientY); const tgt = t && t.closest && t.closest('.sb-item[data-drop^="f:"]'); if (over !== tgt) { over && over.classList.remove('drop'); over = tgt; over && over.classList.add('drop'); } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); document.body.style.cursor = ''; if (ghost) { ghost.remove(); over && over.classList.remove('drop'); S.justDragged = true; setTimeout(() => (S.justDragged = false), 50); if (over) { const t = over.dataset.drop.slice(2); A.moveFolder(fid, t === '__notes' ? null : t); } } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  // ------------------------------------------------------------ sidebar
  function renderSidebar() {
    const ms = metas(); const cnt = { all: 0, pinned: 0, check: 0, att: 0, locked: 0, trash: 0, notes: 0 }; const byF = {}; const tags = {};
    for (const m of ms) { if (m.d) { cnt.trash++; continue; } cnt.all++; if (m.p) cnt.pinned++; if (m.ck) cnt.check++; if (m.na > 0) cnt.att++; if (m.l) cnt.locked++; if (!m.f) cnt.notes++; byF[m.f || ''] = (byF[m.f || ''] || 0) + 1; for (const t of m.tg || []) tags[t] = (tags[t] || 0) + 1; }
    const total = (id) => { let n = 0; for (const d of descendants(id)) n += byF[d] || 0; return n; };
    const sb = zk.el('div'); const curV = S.view;
    const item = ({ icon, label, count, sel, onClick, drop, cls = '', depth = 0, twisty, onCtx, fid, tag }) => {
      const it = zk.el('.sb-item' + (sel ? '.sel' : '') + (cls ? '.' + cls : ''), { role: 'button', tabindex: -1, 'aria-current': sel ? 'true' : null, 'data-drop': drop || null, onclick: (ev) => { if (S.justDragged) return; onClick(ev); }, oncontextmenu: onCtx ? (ev) => { ev.preventDefault(); onCtx(ev); } : null });
      it.style.paddingLeft = 6 + depth * 14 + 'px';
      if (twisty !== undefined) { const tw = zk.el('span.tw' + (twisty ? (twisty === 'open' ? '.open' : '') : ''), { onclick: (ev) => { ev.stopPropagation(); if (twisty) { const f = folderById(fid); f.x = !f.x; Db.touchIndex(); A.kick(); renderSidebar(); } } }); if (twisty) tw.append(zk.icon('chevron-right')); it.append(tw); }
      it.append(zk.icon(icon), zk.el('span.nm', label), count != null ? zk.el('span.ct', String(count)) : null);
      if (fid) it.addEventListener('pointerdown', (ev) => { if (ev.button === 0) beginFolderDrag(ev, fid); });
      return it;
    };
    for (const [id, label, icon] of SMART) sb.append(item({ icon, label, count: cnt[id] || (id === 'all' ? cnt.all : 0), cls: 'smart', sel: curV.kind === 'smart' && curV.id === id, drop: id === 'trash' ? 'trash' : id === 'pinned' ? 'pinned' : null, onClick: () => A.setView({ kind: 'smart', id }) }));
    sb.append(zk.el('.zk-heading', 'Folders'));
    sb.append(item({ icon: 'notebook-pen', label: 'Notes', count: cnt.notes, sel: curV.kind === 'folder' && curV.id === '__notes', drop: 'f:__notes', onClick: () => A.setView({ kind: 'folder', id: '__notes' }), onCtx: (ev) => zk.menu([{ label: 'New Folder…', run: () => A.newFolder(null) }], { x: ev.clientX, y: ev.clientY }) }));
    const walk = (pid, depth) => { for (const f of kidsOf(pid)) { const has = kidsOf(f.id).length > 0; sb.append(item({ icon: f.x || !has ? 'folder' : 'folder-open', label: f.name, count: total(f.id), depth: depth + 1, twisty: has ? (f.x ? 'closed' : 'open') : '', fid: f.id, sel: curV.kind === 'folder' && curV.id === f.id, drop: 'f:' + f.id, onClick: () => A.setView({ kind: 'folder', id: f.id }), onCtx: (ev) => folderMenu(ev, f) })); if (has && !f.x) walk(f.id, depth + 1); } };
    walk(null, 0);
    const tl = Object.keys(tags).sort((a, b) => a.localeCompare(b)); if (tl.length) { sb.append(zk.el('.zk-heading', 'Tags')); for (const t of tl) sb.append(item({ icon: 'hash', cls: 'tag', label: t, count: tags[t], sel: curV.kind === 'tag' && curV.id === t, onClick: () => A.setView({ kind: 'tag', id: t }) })); }
    const keepTop = el.sbScroll.scrollTop; el.sbScroll.replaceChildren(...sb.children); el.sbScroll.scrollTop = keepTop;
  }
  function folderMenu(ev, f) {
    zk.menu([{ label: 'New Subfolder…', run: () => A.newFolder(f.id) }, { label: 'Rename…', run: () => A.renameFolder(f.id) }, { label: 'Move To', submenu: moveTargets(f.id, (t) => A.moveFolder(f.id, t)) }, { separator: true }, { label: 'Export Folder as Markdown…', run: () => N.io.exportFolder(f.id) }, { separator: true }, { label: 'Delete Folder…', run: () => A.deleteFolder(f.id) }], { x: ev.clientX, y: ev.clientY });
  }
  function moveTargets(forFolder, fn) {
    const ban = forFolder ? descendants(forFolder) : new Set(); const items = [{ label: 'Notes (top level)', run: () => fn(null) }];
    for (const { f, depth } of flatFolders()) if (!ban.has(f.id)) items.push({ label: ' '.repeat(depth) + f.name, run: () => fn(f.id) }); return items;
  }
  A.moveTargets = moveTargets;
  A.setView = async (v) => {
    if (S.q) { S.q = ''; el.q.value = ''; el.search.classList.remove('has'); Ed.setTerms([]); }
    S.view = v; el.app.classList.remove('sb-open'); A.refresh(false); zeng.refreshMenus();
    const first = S.filtered[0]; if (S.cur && S.filtered.some((m) => m.id === S.cur)) { A.selectIds([S.cur], { open: false }); scrollToId(S.cur); } else if (first) A.selectIds([first.id]); else { await closeNote(); showPlaceholder('none'); }
  };

  // ------------------------------------------------------------ editor pane helpers
  function showPlaceholder(kind) {
    S.editing = false; el.doc.classList.add('zk-hidden'); el.ph.classList.remove('zk-hidden'); el.ph.textContent = ''; S.cur = kind === 'multi' ? null : S.cur;
    if (kind === 'multi') { const n = S.sel.size; el.ph.append(zk.icon('layers'), zk.el('strong', n + ' Notes Selected'), zk.el('.zk-row.zk-gap-8', { style: { justifyContent: 'center', marginTop: '8px' } }, zk.btn({ label: 'Move…', cls: 'bordered', onClick: (ev) => zk.menu(moveTargets(null, (t) => A.moveNotes([...S.sel], t)), { anchor: ev.currentTarget }) }), zk.btn({ label: 'Pin', cls: 'bordered', onClick: () => A.togglePin([...S.sel]) }), zk.btn({ label: S.view.id === 'trash' ? 'Restore' : 'Delete', cls: 'bordered', onClick: () => (S.view.id === 'trash' ? A.restoreNotes([...S.sel]) : A.deleteSelected()) }))); }
    else { el.ph.append(zk.icon('notebook'), zk.el('strong', 'No Note Selected'), zk.el('span', 'Select a note, or press ⌘N to start a new one.')); }
    el.ph.firstChild.style.cssText = 'width:44px;height:44px;margin:0 auto 6px;stroke-width:1.3'; syncToolbar();
  }
  function showEditor() { el.ph.classList.add('zk-hidden'); el.doc.classList.remove('zk-hidden'); }
  function showLocked(meta) {
    S.editing = false; el.doc.classList.add('zk-hidden'); el.ph.classList.remove('zk-hidden'); el.ph.textContent = '';
    const box = zk.el('.lockbox', zk.icon('lock'), zk.el('strong', meta.t ? '“' + meta.t + '” is locked' : 'This note is locked'), zk.el('span', 'Enter the password to view or edit it.'), zk.btn({ label: 'View Note…', cls: 'bordered', onClick: () => A.unlockView() }));
    box.firstChild.style.cssText = 'width:44px;height:44px;stroke-width:1.3;color:var(--fg-3)'; el.ph.append(box); syncToolbar();
  }
  const urlCache = new Map();
  const revokeUrls = () => { document.querySelectorAll('#ed img[src^="blob:"]').forEach((i) => i.removeAttribute('src')); for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); };

  // ------------------------------------------------------------ note lifecycle
  async function openNote(id, { force = false } = {}) {
    if (S.cur === id && S.editing && !force) { return; }
    const tok = ++S.tok; await leaveNote(); if (tok !== S.tok) return;
    const meta = M()[id]; if (!meta) return; S.cur = id; S.sel = new Set([id]);
    const rec = await Db.loadNote(id); if (tok !== S.tok) return;
    if (!rec) { S.rec = null; S.editing = false; el.doc.classList.add('zk-hidden'); el.ph.classList.remove('zk-hidden'); el.ph.textContent = ''; el.ph.append(zk.icon('triangle-alert'), zk.el('strong', 'This note couldn’t be read'), zk.el('span', 'Its data file is damaged and no backup copy was found. You can delete it or restore a library backup (File ▸ Import ▸ Restore Library Backup).')); syncToolbar(); return; }
    let html = rec.html; S.rec = rec; S.sessionAtts = new Set(rec.atts || []);
    if (rec.lock) { const key = S.keys.get(id); if (!key) { showLocked(meta); renderList(); return; } try { html = (await C.openWithKey(rec.lock, key)).html; } catch { S.keys.delete(id); showLocked(meta); return; } }
    if (tok !== S.tok) return;
    showEditor(); S.editing = true; el.title.value = rec.title || ''; el.title.readOnly = !!meta.d; Ed.load(CV.clean(html || '<p><br></p>', { raw: true }), { ro: !!meta.d });
    S.lastSaved = { html: Ed.canon(), title: el.title.value.trim() }; S.dirty = false; setSaved('ok'); updateHeader(); updateBacklinks(); updateTags(); updateWords(); A.updateRelated(); el.scroll.scrollTop = 0; Ed.setTerms(tokens());
    S.settings.last = id; A.saveSettings(); syncToolbar(); zeng.refreshMenus(); renderList();
    if (!meta.d && !rec.html && !rec.lock) { /* empty */ }
  }
  A.openNote = openNote;
  A.unlockView = async () => {
    const id = S.cur; const meta = M()[id]; if (!meta) return; const rec = S.rec || (await Db.loadNote(id)); if (!rec || !rec.lock) return;
    const pw = await askPassword({ title: 'Enter Password', message: meta.t ? '“' + meta.t + '”' : 'Locked note', ok: 'Unlock', verify: async (p) => { const r = await C.open(rec.lock, p).catch(() => null); if (!r) throw new Error('That password is incorrect.'); S.keys.set(id, r.key); } });
    if (pw == null) return; touchIdle(); await openNote(id, { force: true });
  };
  async function leaveNote() {
    if (!S.cur) return; const id = S.cur;
    if (S.editing) {
      if (S.dirty || Db.pendingCount()) await A.saveNow();
      // delete notes that were created and never used
      const meta = M()[id]; if (meta && S.fresh.has(id) && !meta.t && Ed.isEmpty() && !Ed.attIds().length && !meta.l) { S.fresh.delete(id); await purgeNote(id, true); S.cur = null; S.rec = null; S.editing = false; return; }
      const used = new Set(Ed.attIds()); for (const a of S.sessionAtts) if (!used.has(a) && !(S.rec && S.rec.lock && false)) Db.delAtt(a);
    }
    revokeUrls(); S.cur = null; S.rec = null; S.editing = false;
  }
  async function closeNote() { await leaveNote(); S.sel = new Set(); }
  A.closeNote = closeNote;

  // ---- derive metadata
  function deriveFromDom(root, title) {
    const text = CV.textOf(root); const tags = CV.tagsOf(title + '\n' + text); const lines = text.split('\n').filter((l) => l.trim());
    const dt = title || CV.deriveTitle(text); const body = (title ? lines : lines.slice(1)).join(' ').replace(/\s+/g, ' ').slice(0, 160);
    const ln = [...CV.linksOf(root)]; root.querySelectorAll('a[data-note]').forEach((a) => ln.push(a.dataset.note));
    return { text, tags, ck: root.querySelector('ul.check') ? 1 : 0, na: root.querySelectorAll('.att[data-att]').length, ln, t: dt, s: body };
  }
  A.deriveFromHtml = (html, title) => deriveFromDom(new DOMParser().parseFromString(html, 'text/html').body, title || '');
  const setLow = (id, s) => S.low.set(id, s.toLowerCase());

  // ---- save current note
  A.saveNow = async () => {
    if (!S.editing || !S.rec) { return Db.flush(); }
    const id = S.cur, meta = M()[id]; if (!meta || meta.d) { S.dirty = false; return Db.flush(); }
    const rec = S.rec; const html = Ed.canon(); const title = el.title.value.trim(); const root = Ed.root(); const d = deriveFromDom(root, title);
    const contentChanged = !S.lastSaved || S.lastSaved.html !== html || S.lastSaved.title !== title; const now = Date.now();
    S.dirty = false; setSaved('busy');
    if (contentChanged) { meta.m = now; rec.m = now; }
    rec.title = title; rec.atts = [...new Set(Ed.attIds())]; rec.f = meta.f; rec.p = meta.p; rec.d = meta.d; rec.c = meta.c;
    const locked = !!meta.l; let ftsText;
    if (locked) { const key = S.keys.get(id); if (!key) { setSaved('err'); return; } rec.lock = await C.reseal({ html }, key, rec.lock); delete rec.html; meta.t = title || 'Locked Note'; meta.s = ''; meta.tg = []; meta.ck = 0; meta.ln = []; ftsText = meta.t; }
    else { rec.html = html; meta.t = d.t; meta.s = d.s; meta.tg = d.tags; meta.ck = d.ck; meta.ln = d.ln; ftsText = (title + '\n' + d.text + '\n' + d.tags.map((t) => '#' + t).join(' ')).slice(0, 40000); }
    meta.na = rec.atts.length;
    // thumbnail
    const tid = Ed.firstThumbId();
    if (!locked && tid !== (rec.tid || null)) { if (tid) { const u = Ed.firstThumb(); if (u) { await Db.setThumb(id, u); thumbCache.set(id, u); meta.th = 1; rec.tid = tid; } } else { await Db.setThumb(id, null); thumbCache.delete(id); meta.th = 0; rec.tid = null; } }
    if (locked && meta.th) { await Db.setThumb(id, null); thumbCache.delete(id); meta.th = 0; }
    S.lastSaved = { html, title }; rec.v = 1; setLow(id, ftsText);
    Db.put({ ...rec, _h: undefined }, meta, ftsText);
    const ok = await Db.flush(); setSaved(ok && !S.dirty ? 'ok' : ok ? 'busy' : 'err');
    N.rel.update(id, ftsText); A.refresh(); updateBacklinks(); updateTags(); updateHeader(); A.scheduleRelated(); S.words = d.text.split(/\s+/).filter(Boolean).length; updateWords(); zeng.call('dirty', { dirty: false }).catch(() => {});
  };
  A.kick = () => { Db.flush().then((ok) => { if (!ok) setSaved('err'); }); };
  function markDirty() { if (!S.editing) return; if (!S.dirty) { S.dirty = true; zeng.call('dirty', { dirty: true }).catch(() => {}); } setSaved('busy'); }
  function setSaved(state) {
    const s = el.stSaved; s.className = 'saved ' + state; s.textContent = '';
    if (state === 'ok') s.append(zk.icon('check'), 'Saved'); else if (state === 'busy') s.append('Saving…'); else if (state === 'err') s.append(zk.icon('triangle-alert'), 'Not saved — ' + (Db.status.error || 'retrying'));
  }
  function updateWords() { if (S.editing) { const w = (S.words ?? CV.textOf(Ed.root()).split(/\s+/).filter(Boolean).length); el.stWords.textContent = w + (w === 1 ? ' word' : ' words'); } else el.stWords.textContent = ''; }
  function updateHeader() {
    const meta = M()[S.cur]; if (!meta) return; el.dateline.textContent = '';
    if (meta.l) el.dateline.append(zk.icon('lock')); if (meta.d) el.dateline.append(zk.el('span', 'Deleted — '));
    el.dateline.append(U.longDate(meta.m)); if (meta.f && folderById(meta.f)) el.dateline.append(zk.el('span', { style: { opacity: '.7' } }, '· ' + folderPath(meta.f)));
  }
  function updateTags() { const m = M()[S.cur]; el.tagrow.textContent = ''; if (!m || !m.tg) return; for (const t of m.tg) el.tagrow.append(zk.el('button.tagchip', { type: 'button', onclick: () => A.setView({ kind: 'tag', id: t }) }, '#' + t)); }
  function updateBacklinks() {
    const m = M()[S.cur]; el.backlinks.textContent = ''; if (!m || m.d) return; const tl = (m.t || '').toLowerCase(); const from = metas().filter((x) => x.id !== m.id && !x.d && x.ln && x.ln.length && (x.ln.includes(m.id) || (tl && x.ln.includes(tl))));
    if (!from.length) return; el.backlinks.append(zk.el('h4', 'Linked from'));
    for (const x of from.slice(0, 30)) el.backlinks.append(zk.el('button', { type: 'button', onclick: () => A.goToNote(x.id) }, zk.icon('file-text'), zk.el('span', x.t || 'New Note')));
  }
  A.goToNote = async (id) => { if (!M()[id]) return; const m = M()[id]; if (m.d) await A.setView({ kind: 'smart', id: 'trash' }); else if (!viewFilter()(m) || S.q) await A.setView({ kind: 'smart', id: 'all' }); await A.selectIds([id]); scrollToId(id); };

  // ---- related notes strip
  const relTimer = { t: 0 };
  A.updateRelated = () => {
    const box = el.related; box.textContent = ''; const m = M()[S.cur]; if (!m || m.d || m.l || !S.editing) return; const rs = N.rel.related(S.cur); if (!rs.length) return;
    box.append(zk.el('h4', 'Related notes'), zk.el('.strip', ...rs.map((r) => { const x = M()[r.id]; return zk.el('button.rc', { type: 'button', title: x.t, onclick: () => A.goToNote(r.id) }, zk.el('b', x.t || 'New Note'), zk.el('span', x.s || 'No additional text'), zk.el('i', r.why.join(' · '))); })));
  };
  A.scheduleRelated = () => { clearTimeout(relTimer.t); relTimer.t = setTimeout(A.updateRelated, 600); };

  // ---- daily note
  A.dailyNote = async () => {
    const d = new Date(); const p2 = (n) => String(n).padStart(2, '0'); const key = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    let m = metas().find((x) => x.dn === key && !x.d);
    if (!m) {
      if (S.editing) await A.saveNow(); const prev = metas().filter((x) => x.dn && x.dn < key && !x.d).sort((a, b) => (a.dn < b.dn ? 1 : -1))[0];
      const title = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); const fid = N.io.ensureFolder(['Daily'], null);
      const html = '<h2>Today</h2><ul class="check"><li><br></li></ul><h2>Notes</h2><p><br></p>' + (prev ? `<p>Yesterday: <a href="#" data-nt="${esc(prev.t)}" data-note="${prev.id}">${esc(prev.t)}</a></p>` : '') + '<p>#daily</p>';
      const id = await N.io.saveDraft({ title, html, dn: key }, fid); await Db.flush(); m = M()[id];
    }
    await A.goToNote(m.id); A.refresh(); const li = el.ed.querySelector('ul.check li'); if (li && !M()[m.id].d) { Ed.focus(); const r = document.createRange(); r.selectNodeContents(li); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); } else el.title.focus();
  };

  // ------------------------------------------------------------ note operations
  const blankRec = (o = {}) => { const now = Date.now(); return { v: 1, id: U.uid(), title: '', html: '<p><br></p>', c: now, m: now, atts: [], ...o }; };
  const newMeta = (rec, o = {}) => ({ id: rec.id, t: rec.title || '', s: '', c: rec.c, m: rec.m, f: o.f || null, p: o.p ? 1 : 0, d: 0, l: 0, tg: [], ck: 0, na: 0, th: 0, ln: [], ...o });
  A.blankRec = blankRec; A.newMeta = newMeta;
  A.newNote = async ({ folder, title = '', html, focus = 'title' } = {}) => {
    await leaveNote();
    let f = folder; if (f === undefined) f = S.view.kind === 'folder' && S.view.id !== '__notes' ? S.view.id : null;
    if (S.q) { S.q = ''; el.q.value = ''; el.search.classList.remove('has'); Ed.setTerms([]); }
    if ((S.view.kind === 'smart' && (S.view.id === 'trash' || S.view.id === 'locked')) || S.view.kind === 'tag') S.view = { kind: 'smart', id: 'all' };
    const rec = blankRec({ title, html: html || '<p><br></p>' }); const meta = newMeta(rec, { f }); Db.put(rec, meta, ''); setLow(rec.id, ''); S.fresh.add(rec.id);
    A.refresh(false); await openNote(rec.id); A.kick(); scrollToId(rec.id); if (focus === 'title') el.title.focus(); else if (focus === 'body') Ed.focus(); return rec.id;
  };
  A.deleteSelected = () => { const ids = [...S.sel]; if (!ids.length && S.cur) ids.push(S.cur); if (!ids.length) return; if (ids.every((i) => M()[i] && M()[i].d)) return A.deleteForever(ids); return A.deleteNotes(ids); };
  A.deleteNotes = async (ids) => {
    ids = ids.filter((i) => M()[i] && !M()[i].d); if (!ids.length) return; const now = Date.now();
    if (S.editing && ids.includes(S.cur)) await A.saveNow();
    const order = S.filtered.map((m) => m.id); const idx = Math.min(...ids.map((i) => order.indexOf(i)).filter((i) => i >= 0));
    ids.forEach((i) => { M()[i].d = now; S.fresh.delete(i); }); Db.touchIndex();
    const wasCur = ids.includes(S.cur); if (wasCur) { await leaveNote(); }
    A.refresh(); const next = S.filtered[Math.min(isFinite(idx) ? idx : 0, S.filtered.length - 1)];
    if (wasCur || ids.some((i) => S.sel.has(i))) { if (next) await A.selectIds([next.id]); else { S.sel = new Set(); showPlaceholder('none'); } }
    A.kick(); undoToast(ids.length === 1 ? 'Note deleted' : ids.length + ' notes deleted', () => A.restoreNotes(ids));
  };
  A.restoreNotes = async (ids) => {
    for (const i of ids) { const m = M()[i]; if (!m) continue; m.d = 0; if (m.f && !folderById(m.f)) m.f = null; } Db.touchIndex(); if (S.cur && ids.includes(S.cur)) { await leaveNote(); } A.refresh(); A.kick();
    if (S.view.kind === 'smart' && S.view.id === 'trash') { const n = S.filtered[0]; if (n) A.selectIds([n.id]); else { S.sel = new Set(); showPlaceholder('none'); } } else A.selectIds([ids[0]]); zk.toast(ids.length === 1 ? 'Note restored' : ids.length + ' notes restored');
  };
  A.deleteForever = async (ids) => {
    const n = ids.length; if (!(await zk.confirm(n === 1 ? 'Delete this note permanently?' : `Delete ${n} notes permanently?`, 'This can’t be undone.', 'Delete', { danger: true }))) return;
    await leaveNote(); for (const i of ids) await purgeNote(i); S.sel = new Set(); A.refresh(); const nx = S.filtered[0]; if (nx) A.selectIds([nx.id]); else showPlaceholder('none'); A.kick();
  };
  async function purgeNote(id, quiet) { await Db.removeNote(id); S.low.delete(id); thumbCache.delete(id); S.keys.delete(id); if (!quiet) { /* noop */ } if (quiet) A.refresh(); }
  A.emptyTrash = async () => { const ids = metas().filter((m) => m.d).map((m) => m.id); if (!ids.length) return; if (!(await zk.confirm('Delete all notes in Recently Deleted?', 'This can’t be undone.', 'Delete All', { danger: true }))) return; await leaveNote(); for (const i of ids) await purgeNote(i); S.sel = new Set(); A.refresh(); showPlaceholder('none'); A.kick(); };
  A.purgeOld = async () => { const cutoff = Date.now() - 30 * 864e5; const old = metas().filter((m) => m.d && m.d < cutoff).map((m) => m.id); if (!old.length) return; for (const i of old) await purgeNote(i); A.refresh(); A.kick(); };
  A.togglePin = (ids) => { ids = ids && ids.length ? ids : S.cur ? [S.cur] : []; const ms = ids.map((i) => M()[i]).filter((m) => m && !m.d); if (!ms.length) return; const to = ms.some((m) => !m.p) ? 1 : 0; ms.forEach((m) => { m.p = to; }); Db.touchIndex(); A.refresh(); A.kick(); zk.toast(to ? 'Pinned' : 'Unpinned', 1000); zeng.refreshMenus(); };
  A.moveNotes = (ids, fid) => { ids.forEach((i) => { const m = M()[i]; if (m) m.f = fid; }); Db.touchIndex(); A.refresh(); updateHeader(); A.kick(); zk.toast('Moved to ' + (fid ? folderById(fid).name : 'Notes'), 1400); };
  A.duplicate = async (id) => {
    id = id || S.cur; const meta = M()[id]; if (!meta) return; if (S.editing && id === S.cur) await A.saveNow(); const rec = await Db.loadNote(id); if (!rec) return;
    if (rec.lock) { zk.alert('Locked note', 'Remove the lock before duplicating this note.'); return; }
    const nid = U.uid(); let html = rec.html; const atts = [];
    for (const a of rec.atts || []) { const r = await Db.getAtt(a); if (!r || !r.bytes) continue; const na = U.uid() + atts.length; await Db.putAtt(na, r.bytes, r.meta); atts.push(na); html = html.split(`data-att="${a}"`).join(`data-att="${na}"`); }
    const now = Date.now(); const nr = { ...rec, id: nid, title: (rec.title || meta.t || 'New Note') + ' copy', html, atts, c: now, m: now, tid: null }; const nm = { ...meta, id: nid, t: nr.title, c: now, m: now, p: 0, th: 0, sl: undefined };
    Db.put(nr, nm, (Db.text(id) || '') ); setLow(nid, Db.text(id)); A.refresh(); await A.selectIds([nid]); A.kick();
  };
  function undoToast(text, undo) {
    const t = zk.el('.zk-toast', { role: 'status', style: { display: 'flex', gap: '12px', alignItems: 'center', paddingRight: '8px' } }, text, zk.el('button.zk-btn', { type: 'button', style: { height: '22px', color: 'var(--ink)', fontWeight: 600 }, onclick: () => { t.remove(); undo(); } }, 'Undo'));
    document.body.append(t); setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = 0; setTimeout(() => t.remove(), 260); }, 6000);
  }

  // folders
  A.newFolder = async (parent) => {
    const name = await zk.prompt('New Folder', '', { message: parent ? 'Name for the new subfolder inside “' + folderById(parent).name + '”.' : 'Enter a name for this folder.', placeholder: 'Folder name', ok: 'Create' }); if (!name || !name.trim()) return;
    const f = { id: 'f' + U.uid(), name: name.trim(), p: parent || null }; F().push(f); if (parent) { const p = folderById(parent); if (p) p.x = false; } Db.touchIndex(); A.kick(); S.settings.sidebar = true; A.applySettings(); await A.setView({ kind: 'folder', id: f.id }); return f.id;
  };
  A.renameFolder = async (id) => { const f = folderById(id); const n = await zk.prompt('Rename Folder', f.name, { ok: 'Rename' }); if (n && n.trim()) { f.name = n.trim(); Db.touchIndex(); A.kick(); A.refresh(); } };
  A.moveFolder = (id, to) => { if (to && descendants(id).has(to)) return zk.alert('Can’t move folder', 'A folder can’t be moved into itself.'); const f = folderById(id); f.p = to; Db.touchIndex(); A.kick(); A.refresh(); };
  A.deleteFolder = async (id) => {
    const ds = descendants(id); const notes = metas().filter((m) => !m.d && ds.has(m.f)); const f = folderById(id);
    if (!(await zk.confirm(`Delete “${f.name}”?`, notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'} in this folder ${ds.size > 1 ? '(and its subfolders) ' : ''}will move to Recently Deleted.` : 'This folder is empty.', 'Delete', { danger: true }))) return;
    await A.deleteNotes(notes.map((m) => m.id)); Db.idx.folders = F().filter((x) => !ds.has(x.id)); for (const m of metas()) if (ds.has(m.f)) m.f = null; Db.touchIndex();
    if (S.view.kind === 'folder' && ds.has(S.view.id)) await A.setView({ kind: 'smart', id: 'all' }); else A.refresh(); A.kick();
  };

  // ------------------------------------------------------------ lock
  function askPassword({ title, message, confirm = false, verify, ok = 'OK', warn }) {
    const pw = zk.el('input.zk-input.selectable', { type: 'password', placeholder: confirm ? 'Password' : 'Password', autocomplete: 'off', 'aria-label': 'Password' }); const pw2 = confirm ? zk.el('input.zk-input.selectable', { type: 'password', placeholder: 'Verify', autocomplete: 'off', 'aria-label': 'Verify password' }) : null; const err = zk.el('.err');
    const body = zk.el('.pw', warn ? zk.el('.warn', warn) : null, pw, pw2, err); let out = null;
    return zk.sheet({ title, message, body, width: 400, buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: 'ok', onClick: async () => {
      err.textContent = ''; if (!pw.value) { err.textContent = 'Enter a password.'; return false; }
      if (confirm) { if (pw.value.length < 4) { err.textContent = 'Use at least 4 characters.'; return false; } if (pw.value !== pw2.value) { err.textContent = 'The passwords don’t match.'; return false; } }
      if (verify) { try { await verify(pw.value); } catch (e) { err.textContent = e.message; return false; } } out = pw.value; } }] }).then((r) => (r === 'ok' ? out : null));
  }
  A.askPassword = askPassword;
  A.lockNote = async (id) => {
    id = id || S.cur; const meta = M()[id]; if (!meta || meta.d) return; if (meta.l) return A.removeLock(id);
    const pw = await askPassword({ title: 'Lock This Note', message: 'Choose a password for this note. It is used to encrypt the note’s text and attachments on this computer.', confirm: true, ok: 'Lock Note', warn: 'If you forget this password, the note is gone for good. It can’t be reset or recovered — not by ZengNotes and not by anyone else. The note’s title stays visible in the list.' });
    if (pw == null) return; zk.toast('Encrypting…', 1500);
    try {
      if (S.editing && id === S.cur) await A.saveNow(); const rec = await Db.loadNote(id); const { lock, key } = await C.seal({ html: rec.html }, pw);
      for (const a of rec.atts || []) { const r = await Db.getAtt(a); if (r && r.bytes && !r.meta.iv) await Db.putAtt(a, r.bytes, r.meta, key); }
      delete rec.html; rec.lock = lock; meta.l = 1; meta.s = ''; meta.tg = []; meta.ck = 0; meta.ln = []; meta.th = 0; rec.tid = null; await Db.setThumb(id, null); thumbCache.delete(id); S.keys.set(id, key); setLow(id, meta.t);
      Db.put(rec, meta, meta.t); await Db.flush(); await Db.scrubNote(rec); if (id === S.cur) { S.rec = rec; } A.refresh(); updateHeader(); syncToolbar(); zeng.refreshMenus(); touchIdle(); zk.toast('Note locked');
    } catch (e) { zk.alert('Couldn’t lock the note', e.message || String(e)); }
  };
  A.removeLock = async (id) => {
    id = id || S.cur; const meta = M()[id]; if (!meta || !meta.l) return; const rec = await Db.loadNote(id); if (!rec || !rec.lock) return; let key = S.keys.get(id);
    if (!key) { const pw = await askPassword({ title: 'Remove Lock', message: 'Enter the password to remove the lock from this note.', ok: 'Remove Lock', verify: async (p) => { const r = await C.open(rec.lock, p).catch(() => null); if (!r) throw new Error('That password is incorrect.'); key = r.key; } }); if (pw == null) return; }
    else if (!(await zk.confirm('Remove the lock from this note?', 'The note will be stored without encryption.', 'Remove Lock'))) return;
    try {
      const payload = await C.openWithKey(rec.lock, key); if (S.editing && id === S.cur) await A.saveNow(); const rec2 = await Db.loadNote(id); const pl = await C.openWithKey(rec2.lock, key);
      for (const a of rec2.atts || []) { const r = await Db.getAtt(a, key); if (r && r.bytes) await Db.putAtt(a, r.bytes, r.meta); }
      rec2.html = pl.html; delete rec2.lock; meta.l = 0; const d = A.deriveFromHtml(pl.html, rec2.title); meta.t = d.t; meta.s = d.s; meta.tg = d.tags; meta.ck = d.ck; meta.ln = d.ln; meta.na = d.na; S.keys.delete(id);
      const ft = (rec2.title + '\n' + d.text).slice(0, 40000); setLow(id, ft); Db.put(rec2, meta, ft); await Db.flush(); if (id === S.cur) { S.rec = rec2; } A.refresh(); updateHeader(); updateTags(); syncToolbar(); zeng.refreshMenus(); zk.toast('Lock removed');
    } catch (e) { zk.alert('Couldn’t remove the lock', e.message || String(e)); }
  };
  A.lockNow = async () => { const had = S.keys.size > 0; if (S.editing && S.rec && S.rec.lock) await A.saveNow(); S.keys.clear(); if (S.cur && M()[S.cur] && M()[S.cur].l) { revokeUrls(); const id = S.cur; S.cur = null; S.editing = false; await openNote(id, { force: true }); } if (had) zk.toast('Locked notes are locked'); };
  let idleTimer = 0; const touchIdle = () => { clearTimeout(idleTimer); const m = S.settings.lockMin; if (m > 0 && S.keys.size) idleTimer = setTimeout(() => A.lockNow(), m * 60000); };
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, touchIdle, true));

  // ------------------------------------------------------------ editor hooks
  const hooks = {
    onChange: () => markDirty(),
    onSelection: () => syncToolbar(),
    attUrl: async (id) => { if (urlCache.has(id)) return urlCache.get(id); const key = S.rec && S.rec.lock ? S.keys.get(S.cur) : null; const r = await Db.getAtt(id, key); if (!r || !r.bytes) return null; const u = URL.createObjectURL(new Blob([r.bytes], { type: r.meta.type || 'application/octet-stream' })); urlCache.set(id, u); return u; },
    putFile: async (f) => { const id = f.id || U.uid(); const key = S.rec && S.rec.lock ? S.keys.get(S.cur) : null; await Db.putAtt(id, f.bytes, { name: f.name, type: f.type }, key); S.sessionAtts.add(id); urlCache.set(id, URL.createObjectURL(new Blob([f.bytes], { type: f.type }))); return { id, name: f.name, type: f.type, size: f.bytes.length }; },
    hasAtt: (id) => S.sessionAtts.has(id) || Ed.attIds().includes(id),
    cloneAtt: async (id) => { try { const r = await Db.getAtt(id); if (!r || !r.bytes) return null; const nid = U.uid(); await hooks.putFile({ id: nid, name: r.meta.name, type: r.meta.type, bytes: r.bytes }); return nid; } catch { return null; } },
    pickFiles: async () => { const hs = await zeng.files.open({ multiple: true }); if (hs.length) Ed.attachFiles(await Promise.all(hs.map(async (h) => ({ name: h.name, type: U.mimeOf(h.name), bytes: await U.readHandle(h) })))); },
    searchTitles: (q) => { const l = q.trim().toLowerCase(); return metas().filter((m) => !m.d && m.id !== S.cur && !m.l && (!l || (m.t || '').toLowerCase().includes(l))).sort((a, b) => b.m - a.m).slice(0, 8).map((m) => ({ id: m.id, title: m.t })); },
    findTitle: (t) => { const l = t.toLowerCase(); return metas().find((m) => !m.d && (m.t || '').toLowerCase() === l) || null; },
    linkNote: async (title, id) => { let m = id && M()[id] && !M()[id].d ? M()[id] : hooks.findTitle(title); if (m) return A.goToNote(m.id); const f = S.rec && M()[S.cur] ? M()[S.cur].f : null; await A.newNote({ title, folder: f, focus: 'body' }); },
    openUrl: (u) => { if (!u) return; if (zeng.isNative) zeng.call('open_url', { url: u }).catch(() => {}); else window.open(u, '_blank', 'noopener'); },
    openAtt: async (a) => { if (a.classList.contains('img')) { const u = await hooks.attUrl(a.dataset.att); if (!u) return; const lb = zk.el('.lightbox', { onclick: () => lb.remove() }, zk.el('img', { src: u, alt: a.dataset.name || '' }), zk.el('.cap', (a.dataset.name || '') + '  ·  click or press Esc to close')); const k = (e) => { if (e.key === 'Escape') { lb.remove(); removeEventListener('keydown', k, true); } }; addEventListener('keydown', k, true); document.body.append(lb); } else hooks.saveAtt(a); },
    saveAtt: async (a) => { const key = S.rec && S.rec.lock ? S.keys.get(S.cur) : null; const r = await Db.getAtt(a.dataset.att, key); if (!r || !r.bytes) return zk.alert('Attachment unavailable', 'The data for this attachment could not be read.'); const h = await zeng.files.saveAs(r.bytes, { name: r.meta.name || 'attachment', filters: [] }); if (h) zk.toast('Saved ' + h.name); },
    editLink: () => A.editLink(), autoSort: () => !!S.settings.autoSort,
    onFind: (n, i) => { el.fcount.textContent = n ? i + 1 + ' of ' + n : el.fq.value ? 'No matches' : ''; },
  };
  A.editLink = async () => { const saved = Ed.saveSel(); const a = Ed.linkAtCaret(); const cur = a && !a.dataset.nt ? a.getAttribute('href') : ''; const sel = Ed.selectionText(); const v = await zk.prompt(cur ? 'Edit Link' : 'Add Link', cur, { message: sel ? 'Link for “' + sel.slice(0, 40) + '”' : 'Enter a web address.', placeholder: 'https://', ok: 'Done' }); Ed.focus(); Ed.restoreSel(saved); if (v == null) return; let u = v.trim(); if (u && !/^[a-z][\w+.-]*:/i.test(u)) u = 'https://' + u; Ed.setLink(u); };

  // ------------------------------------------------------------ toolbar / popovers
  let tbBtns = {};
  function fmtPopover(anchor) {
    const st = Ed.state() || {}; const pop = zk.el('.fmt');
    const styles = zk.el('.styles'); const sb = (id, label, css) => { const b = zk.el('button', { type: 'button', class: st.block === id ? 'on' : '', onclick: () => { zk.closePop(); Ed.cmd(id); } }, zk.icon('check'), zk.el('span', { style: css }, label)); return b; };
    styles.append(sb('h1', 'Heading', 'font-size:20px;font-weight:700'), sb('h2', 'Subheading', 'font-size:17px;font-weight:650'), sb('h3', 'Small Heading', 'font-size:15px;font-weight:650'), sb('p', 'Body', ''), sb('codeblock', 'Monostyled', 'font-family:var(--font-mono);font-size:12.5px'), sb('quote', 'Quote', 'color:var(--fg-2)'));
    const row = (items) => zk.el('.row', ...items.map(([ic, label, cmd, on]) => zk.el('button', { type: 'button', title: label, 'aria-label': label, class: on ? 'on' : '', onclick: () => { zk.closePop(); Ed.cmd(cmd); } }, zk.icon(ic))));
    pop.append(styles, row([['bold', 'Bold', 'bold', st.bold], ['italic', 'Italic', 'italic', st.italic], ['underline', 'Underline', 'underline', st.underline], ['strikethrough', 'Strikethrough', 'strike', st.strike], ['code', 'Inline code', 'mono', st.mono]]), row([['list', 'Bulleted list', 'ul', st.list === 'ul'], ['minus', 'Dashed list', 'dash', st.list === 'dash'], ['list-ordered', 'Numbered list', 'ol', st.list === 'ol'], ['list-checks', 'Checklist', 'check', st.list === 'check'], ['indent-increase', 'Indent', 'indent'], ['indent-decrease', 'Outdent', 'outdent']]));
    pop.addEventListener('mousedown', (e) => e.preventDefault()); zk.popover(anchor, pop, { align: 'center' });
  }
  const pd = (b) => { b.addEventListener('pointerdown', (e) => e.preventDefault()); b.addEventListener('mousedown', (e) => e.preventDefault()); return b; };
  function buildToolbar() {
    const tb = el.tb; const B = (id, o) => (tbBtns[id] = pd(zk.btn({ ...o }))); tb.textContent = '';
    const g = (...k) => zk.el('.zk-group', ...k);
    const sbBtn = B('sidebar', { icon: 'panel-left', title: 'Show or hide folders (⌘⌥S)', onClick: () => A.toggleSidebar() });
    tb.append(sbBtn, zk.el('.zk-title.skeep', { 'data-doc-title': '' }, 'All Notes', zk.el('small', '')), zk.el('.zk-spacer', { style: { flex: '0 0 4px' } }),
      g(B('new', { icon: 'square-pen', title: 'New Note (⌘N)', onClick: () => A.newNote() }), B('del', { icon: 'trash-2', title: 'Delete Note (⌘⌫)', onClick: () => A.deleteSelected() })),
      B('daily', { icon: 'calendar-days', title: 'Today’s Daily Note (⌘D)', onClick: () => A.dailyNote() }), B('graph', { icon: 'graph', title: 'Link Graph (⌘⌥G)', onClick: () => N.graph.toggle() }), B('sort', { icon: 'arrow-up-down', title: 'Sort and view options', onClick: (e) => zk.menu(viewSortMenu(), { anchor: e.currentTarget }) }),
      zk.el('.zk-sep'), g(B('aa', { icon: 'type', label: '', title: 'Format', onClick: (e) => fmtPopover(e.currentTarget) }), B('check', { icon: 'list-checks', title: 'Checklist (⌘⇧L)', onClick: () => Ed.cmd('check') }), B('table', { icon: 'table', title: 'Table (⌘⌥T)', onClick: () => Ed.cmd('table') }), B('attach', { icon: 'paperclip', title: 'Attach image or file (⌘⇧A)', onClick: () => hooks.pickFiles() }), B('sketch', { icon: 'pen-line', title: 'Sketch (⌘⇧D)', onClick: () => Ed.cmd('sketch') })),
      zk.el('.zk-spacer'), g(B('lock', { icon: 'lock', title: 'Lock note (⌘L)', onClick: () => A.lockNote() }), B('share', { icon: 'share', title: 'Share and export', onClick: (e) => zk.menu(shareMenu(), { anchor: e.currentTarget, align: 'end' }) })),
      B('exit', { icon: 'minimize-2', title: 'Leave focus mode (Esc)', onClick: () => A.setMode('') }));
    tbBtns.exit.classList.add('keep', 'zk-hidden'); const exit = tbBtns.exit; exit.style.marginLeft = 'auto';
    const search = zk.el('.search.skeep', zk.icon('search'), el.q = zk.el('input.zk-input.selectable', { id: 'q', type: 'search', placeholder: 'Search', 'aria-label': 'Search notes', spellcheck: 'false', autocomplete: 'off' }), zk.el('button.zk-btn.icon', { type: 'button', 'aria-label': 'Clear search', onclick: () => A.clearSearch() }, zk.icon('x', 12)));
    el.search = search; tb.insertBefore(search, tbBtns.exit);
    el.q.addEventListener('input', () => { S.q = el.q.value; search.classList.toggle('has', !!S.q); Ed.setTerms(tokens()); A.refresh(false); const first = S.filtered[0]; if (first) { if (!S.sel.has(first.id) || S.sel.size !== 1) A.selectIds([first.id], { open: !!S.q || true }); } else if (S.q) { showPlaceholder('none'); } });
    el.q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); A.clearSearch(); el.list.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const ids = S.filtered.map((m) => m.id); let i = ids.indexOf(S.cur); i = zk.clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1); if (ids[i]) { A.selectIds([ids[i]]); scrollToId(ids[i]); } } else if (e.key === 'Enter') { e.preventDefault(); if (S.editing) Ed.focus(); } });
  }
  A.clearSearch = () => { S.q = ''; el.q.value = ''; el.search.classList.remove('has'); Ed.setTerms([]); A.refresh(false); if (S.cur) scrollToId(S.cur); };
  function syncToolbar() {
    const st = S.editing ? Ed.state() : null; const ed = S.editing && !(M()[S.cur] || {}).d; const m = M()[S.cur]; const b = tbBtns; if (!b.aa) return;
    ['aa', 'check', 'table', 'attach', 'sketch'].forEach((k) => (b[k].disabled = !ed)); b.check.setAttribute('aria-pressed', !!(st && st.list === 'check')); b.table.setAttribute('aria-pressed', !!(st && st.table));
    b.lock.disabled = !S.cur || !m || !!m.d; b.lock.setAttribute('aria-pressed', !!(m && m.l)); b.lock.title = m && m.l ? 'Remove lock (⌘L)' : 'Lock note (⌘L)'; b.share.disabled = !S.cur; b.del.disabled = !S.sel.size && !S.cur;
    b.sidebar.setAttribute('aria-pressed', document.body.classList.contains('hide-sidebar') ? 'false' : 'true');
  }
  function shareMenu() {
    const io = N.io; return [{ label: 'Export Note as Markdown…', run: () => io.exportNotes([...S.sel], 'md') }, { label: 'Export Note as HTML…', run: () => io.exportNotes([...S.sel], 'html') }, { label: 'Export Note as Plain Text…', run: () => io.exportNotes([...S.sel], 'txt') }, { label: 'Export as PDF (Print)…', run: () => io.printNote() }, { separator: true }, { label: 'Copy Note Link', run: () => A.copyLink() }, { separator: true }, { label: 'Back Up Library…', run: () => io.backup() }];
  }
  A.copyLink = () => { const m = M()[S.cur]; if (m) navigator.clipboard && navigator.clipboard.writeText('[[' + (m.t || 'New Note') + ']]').then(() => zk.toast('Link copied — paste it into another note')); };
  function viewSortMenu() {
    const s = S.settings; const sortItem = (k, l) => ({ label: l, checked: s.sort === k, run: () => setSetting('sort', k, true) });
    return [sortItem('m', 'Date Modified'), sortItem('c', 'Date Created'), sortItem('t', 'Title'), { separator: true }, { label: 'Newest / A–Z First', checked: !s.asc, run: () => setSetting('asc', false, true) }, { label: 'Oldest / Z–A First', checked: s.asc, run: () => setSetting('asc', true, true) }, { separator: true }, { label: 'Group by Date', checked: s.group, run: () => setSetting('group', !s.group, true) }, { label: 'Show Snippets', checked: s.snippets, run: () => setSetting('snippets', !s.snippets, true) }, { label: 'Show Thumbnails', checked: s.thumbs, run: () => setSetting('thumbs', !s.thumbs, true) }, { label: 'Compact List', checked: s.compact, run: () => setSetting('compact', !s.compact, true) }];
  }
  A.toggleSidebar = () => { if (innerWidth <= 880) el.app.classList.toggle('sb-open'); else setSetting('sidebar', !S.settings.sidebar); syncToolbar(); };

  // modes
  A.setMode = (mode) => {
    S.mode = S.mode === mode ? '' : mode; document.documentElement.classList.toggle('x', false); el.app.classList.toggle('focus-mode', S.mode === 'focus'); el.app.classList.toggle('sticky-mode', S.mode === 'sticky');
    tbBtns.exit.classList.toggle('zk-hidden', !S.mode); if (S.mode) { if (!S.cur && S.filtered[0]) A.selectIds([S.filtered[0].id]); Ed.focus(); } zeng.refreshMenus();
  };

  // find in note
  A.openFind = () => { if (!S.editing) return; el.findbar.classList.remove('zk-hidden'); const t = Ed.selectionText(); if (t && !t.includes('\n') && t.length < 80) el.fq.value = t; el.fq.focus(); el.fq.select(); Ed.find(el.fq.value, 0); };
  A.closeFind = () => { el.findbar.classList.add('zk-hidden'); Ed.find('', 0); el.fcount.textContent = ''; Ed.focus(); };

  // settings sheet
  A.openSettings = () => {
    const s = S.settings; const row = (label, ctl) => zk.el('.zk-field', zk.el('span', label), ctl); const seg = (opts, cur, fn) => { const d = zk.el('.zk-seg'); opts.forEach(([v, l]) => d.append(zk.el('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: (e) => { fn(v); [...d.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget)); } }, l))); return d; };
    const sw = (k, relist) => zk.el('input.zk-switch', { type: 'checkbox', checked: !!s[k], onchange: (e) => setSetting(k, e.target.checked, relist) });
    const fs = zk.el('input.zk-range', { type: 'range', min: 12, max: 24, step: 1, value: s.font, 'aria-label': 'Font size', style: { width: '140px' }, oninput: (e) => { setSetting('font', +e.target.value); fv.textContent = e.target.value + ' pt'; } }); const fv = zk.el('span.zk-label', { style: { width: '38px', textAlign: 'right' } }, s.font + ' pt');
    const body = zk.el('.set',
      zk.el('h3', 'Editor'), row('Font size', zk.el('.zk-row.zk-gap-8', { style: { alignItems: 'center' } }, fs, fv)), row('Text width', seg([['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide'], ['full', 'Full']], s.width, (v) => setSetting('width', v))), row('Spell checking', sw('spell')), row('Move checked items to the bottom', sw('autoSort')),
      zk.el('h3', 'Note list'), row('Density', seg([[false, 'Comfortable'], [true, 'Compact']], !!s.compact, (v) => setSetting('compact', v, true))), row('Show snippets', sw('snippets', true)), row('Show thumbnails', sw('thumbs', true)), row('Group by date', sw('group', true)),
      zk.el('h3', 'Locked notes'), row('Lock again after inactivity', seg([[0, 'Never'], [5, '5 min'], [10, '10 min'], [60, '1 hr']], s.lockMin, (v) => { setSetting('lockMin', v); touchIdle(); })),
      zk.el('h3', 'Storage'), zk.el('p.zk-label', { style: { lineHeight: 1.5 } }, 'Notes save automatically on this computer. Recently Deleted keeps notes for 30 days. Use File ▸ Back Up Library to make a .znotes copy.'));
    zk.sheet({ title: 'Settings', body, width: 420, buttons: [{ label: 'Done', primary: true }] });
  };

  // ------------------------------------------------------------ menus
  A.menus = () => {
    const io = N.io; const s = S.settings; const ed = () => S.editing && !(M()[S.cur] || {}).d; const has = () => !!S.cur || S.sel.size > 0; const cm = 'CmdOrCtrl+'; const inEd = () => document.activeElement === el.ed;
    const fmt = (label, cmd, accel) => ({ label, accel, enabled: ed, run: () => Ed.cmd(cmd) });
    const m = () => M()[S.cur] || null;
    const undo = () => (document.activeElement === el.ed ? Ed.undo() : document.execCommand('undo')); const redo = () => (document.activeElement === el.ed ? Ed.redo() : document.execCommand('redo'));
    const importMenu = [{ label: 'Markdown, Text and HTML Files…', run: () => io.importFiles() }, { label: 'Folder of Files…', run: () => io.importFolder() }, { separator: true }, { label: 'ENEX Archive (.enex)…', run: () => io.importFiles(['enex']) }, { label: 'Takeout Notes (.zip or .json)…', run: () => io.importFiles(['zip', 'json']) }, { label: 'Word Document or HTML (.docx, .html)…', run: () => io.importFiles(['docx', 'html', 'htm']) }, { separator: true }, { label: 'Restore Library Backup (.znotes)…', run: () => io.restore() }];
    return [
      { label: 'File', items: [{ label: 'New Note', accel: cm + 'N', run: () => A.newNote() }, { label: 'Today’s Daily Note', accel: cm + 'D', run: () => A.dailyNote() }, { label: 'New Folder…', accel: cm + 'Shift+N', run: () => A.newFolder(S.view.kind === 'folder' && S.view.id !== '__notes' ? null : null) }, { label: 'New Subfolder…', enabled: () => S.view.kind === 'folder' && S.view.id !== '__notes', run: () => A.newFolder(S.view.id) }, { separator: true }, { label: 'Import', submenu: importMenu }, { label: 'Import Sample Library', run: () => io.importSample() }, { separator: true },
        { label: 'Export Note as', enabled: has, submenu: [{ label: 'Markdown (with attachments)…', run: () => io.exportNotes([...S.sel], 'md') }, { label: 'HTML…', run: () => io.exportNotes([...S.sel], 'html') }, { label: 'Plain Text…', run: () => io.exportNotes([...S.sel], 'txt') }, { label: 'PDF (Print)…', run: () => io.printNote() }] },
        { label: 'Export All Notes as Markdown…', run: () => io.exportAll() }, { label: 'Back Up Library…', run: () => io.backup() }, { separator: true }, { label: 'Print…', accel: cm + 'Alt+P', enabled: has, run: () => io.printNote() },
        ...(isMac() && zeng.isNative ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => zeng.quit() }])] },
      { label: 'Edit', items: zeng.stdEdit({ undo, redo, extra: [{ label: 'Find…', accel: cm + 'F', run: () => el.q.focus() || el.q.select() }, { label: 'Find in Note…', accel: cm + 'Alt+F', enabled: ed, run: () => A.openFind() }, { label: 'Find Next', accel: cm + 'G', enabled: ed, run: () => { if (el.findbar.classList.contains('zk-hidden')) A.openFind(); else Ed.find(el.fq.value, 1); } }, { label: 'Find Previous', accel: cm + 'Shift+G', enabled: ed, run: () => Ed.find(el.fq.value, -1) }, { separator: true }, { label: 'Insert Link…', accel: cm + 'K', enabled: ed, run: () => A.editLink() }] }) },
      { label: 'Format', items: [fmt('Heading', 'h1', cm + 'Shift+H'), fmt('Subheading', 'h2', cm + 'Shift+J'), fmt('Small Heading', 'h3', cm + 'Shift+K'), fmt('Body', 'p', cm + 'Shift+B'), fmt('Monostyled / Code Block', 'codeblock', cm + 'Shift+M'), fmt('Quote', 'quote', cm + 'Alt+Q'), { separator: true },
        fmt('Bold', 'bold', cm + 'B'), fmt('Italic', 'italic', cm + 'I'), fmt('Underline', 'underline', cm + 'U'), fmt('Strikethrough', 'strike', cm + 'Shift+X'), fmt('Inline Code', 'mono', cm + 'Alt+M'), { separator: true },
        fmt('Checklist', 'check', cm + 'Shift+L'), fmt('Bulleted List', 'ul', cm + 'Shift+8'), fmt('Dashed List', 'dash', cm + 'Shift+9'), fmt('Numbered List', 'ol', cm + 'Shift+7'), { label: 'Check / Uncheck Item', accel: cm + 'Shift+U', enabled: ed, run: () => Ed.cmd('tick') }, { label: 'Move Checked Items to Bottom', checked: !!s.autoSort, run: () => setSetting('autoSort', !s.autoSort) }, { separator: true }, fmt('Indent', 'indent', cm + ']'), fmt('Outdent', 'outdent', cm + '['), fmt('Clear Formatting', 'clear', cm + '\\')] },
      { label: 'Insert', items: [fmt('Table', 'table', cm + 'Alt+T'), { label: 'Table', enabled: () => ed() && Ed.inTable(), submenu: [['Insert Row Above', 'rowAbove'], ['Insert Row Below', 'rowBelow'], ['Insert Column Left', 'colLeft'], ['Insert Column Right', 'colRight'], ['Toggle Header Row', 'header'], ['Delete Row', 'delRow'], ['Delete Column', 'delCol'], ['Delete Table', 'delTable']].map(([l, op]) => ({ label: l, run: () => Ed.tableOp(op) })) }, { label: 'Attachment…', accel: cm + 'Shift+A', enabled: ed, run: () => hooks.pickFiles() }, fmt('Sketch', 'sketch', cm + 'Shift+D'), fmt('Divider', 'hr', null), { label: 'Link to Note…', enabled: ed, run: () => { Ed.focus(); Ed.insertText('[['); } }] },
      { label: 'Note', items: [{ label: 'Pin Note', accel: cm + 'P', enabled: has, checked: !!(m() && m().p), run: () => A.togglePin([...S.sel]) }, { label: m() && m().l ? 'Remove Lock…' : 'Lock Note…', accel: cm + 'L', enabled: () => !!m() && !m().d, run: () => A.lockNote() }, { label: 'Lock All Notes Now', accel: cm + 'Alt+L', run: () => A.lockNow() }, { separator: true }, { label: 'Move To', enabled: has, submenu: moveTargets(null, (t) => A.moveNotes([...S.sel].length ? [...S.sel] : [S.cur], t)) }, { label: 'Duplicate Note', enabled: () => !!m(), run: () => A.duplicate() }, { label: 'Copy Note Link', enabled: () => !!m(), run: () => A.copyLink() }, { separator: true }, { label: 'Delete Note', accel: cm + 'Backspace', enabled: has, run: () => A.deleteSelected() }, { label: 'Restore Note', enabled: () => !!m() && !!m().d, run: () => A.restoreNotes([...S.sel]) }, { label: 'Empty Recently Deleted…', run: () => A.emptyTrash() }] },
      { label: 'View', items: [{ label: 'Sort By', submenu: viewSortMenu().slice(0, 5) }, { label: 'Group by Date', checked: s.group, run: () => setSetting('group', !s.group, true) }, { label: 'Show Snippets', checked: s.snippets, run: () => setSetting('snippets', !s.snippets, true) }, { label: 'Show Thumbnails', checked: s.thumbs, run: () => setSetting('thumbs', !s.thumbs, true) }, { label: 'Compact List', checked: s.compact, run: () => setSetting('compact', !s.compact, true) }, { separator: true },
        { label: 'Bigger Text', accel: cm + '+', run: () => setSetting('font', Math.min(24, s.font + 1)) }, { label: 'Smaller Text', accel: cm + '-', run: () => setSetting('font', Math.max(12, s.font - 1)) }, { label: 'Default Text Size', accel: cm + '0', run: () => setSetting('font', 15) }, { separator: true },
        { label: 'Link Graph', accel: cm + 'Alt+G', checked: !!(N.graph && N.graph.isOpen()), run: () => N.graph.toggle() }, { separator: true }, { label: 'Show Folders', accel: cm + 'Alt+S', checked: s.sidebar, run: () => A.toggleSidebar() }, { label: 'Distraction-Free Mode', accel: cm + 'Shift+Enter', checked: S.mode === 'focus', run: () => A.setMode('focus') }, { label: 'Sticky Style', accel: cm + 'Alt+Y', checked: S.mode === 'sticky', run: () => A.setMode('sticky') }, { separator: true }, { label: 'Focus Folders', accel: cm + '1', run: () => { A.toggleSidebar(); } }, { label: 'Focus Note List', accel: cm + '2', run: () => el.list.focus() }, { label: 'Focus Editor', accel: cm + '3', enabled: ed, run: () => Ed.focus() }, { separator: true }, { label: 'Settings…', accel: cm + ',', run: () => A.openSettings() }] },
    ];
  };

  // ------------------------------------------------------------ init
  A.init = async () => {
    for (const id of ['tb', 'sidebar', 'list', 'list-in', 'list-empty', 'listpane', 'pane', 'scroll', 'doc', 'dateline', 'title', 'tagrow', 'ed', 'backlinks', 'related', 'ph', 'findbar', 'fq', 'fcount', 'app', 'main']) el[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
    el.stCount = $('#st-count'); el.stWords = $('#st-words'); el.stSaved = $('#st-saved');
    el.sbScroll = zk.el('div', { id: 'sb-scroll' }); const foot = zk.el('div', { id: 'sb-foot' }, pd(zk.btn({ icon: 'folder-plus', label: 'New Folder', onClick: () => A.newFolder(S.view.kind === 'folder' && S.view.id !== '__notes' ? null : null) }))); el.sidebar.append(el.sbScroll, foot);
    await zeng.ready; const saved = await zeng.store.get('settings', null); if (saved) Object.assign(S.settings, saved);
    await Db.init(); for (const id in M()) setLow(id, Db.text(id));
    buildToolbar(); $('#fprev').append(zk.icon('chevron-up')); $('#fnext').append(zk.icon('chevron-down')); $('#fclose').append(zk.icon('x'));
    $('#fprev').onclick = () => Ed.find(el.fq.value, -1); $('#fnext').onclick = () => Ed.find(el.fq.value, 1); $('#fclose').onclick = () => A.closeFind();
    el.fq.addEventListener('input', () => Ed.find(el.fq.value, 0)); el.fq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); Ed.find(el.fq.value, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); A.closeFind(); } });
    Ed.init(el.ed, hooks); A.applySettings();
    el.title.addEventListener('input', () => { markDirty(); const m = M()[S.cur]; if (m && !m.d) { m.t = el.title.value.trim() || m.t; } });
    el.title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); Ed.focusStart(); } });
    el.title.addEventListener('focus', () => syncToolbar());
    el.list.addEventListener('scroll', () => requestAnimationFrame(() => renderList()), { passive: true }); new ResizeObserver(() => renderList()).observe(el.list);
    el.list.addEventListener('keydown', listKey);
    el.list.addEventListener('pointerdown', (e) => { const row = e.target.closest('.nr'); if (!row) return; el.list.focus(); if (e.button !== 0) return; const id = row.dataset.id; if (!(isMac() ? e.metaKey : e.ctrlKey) && !e.shiftKey) { if (!S.sel.has(id) || S.sel.size > 1 && false) { rowClick(e, id); } } else rowClick(e, id); beginDrag(e, id); });
    el.list.addEventListener('click', (e) => { const row = e.target.closest('.nr'); if (row && !S.justDragged && S.sel.size > 1 && !e.metaKey && !e.ctrlKey && !e.shiftKey) A.selectIds([row.dataset.id]); });
    el.list.addEventListener('dblclick', (e) => { const row = e.target.closest('.nr'); if (row) { if (S.editing) Ed.focus(); else if (S.rec && S.rec.lock) A.unlockView(); } });
    el.list.addEventListener('contextmenu', (e) => { const row = e.target.closest('.nr'); if (!row) return; e.preventDefault(); const id = row.dataset.id; if (!S.sel.has(id)) A.selectIds([id]); const ids = [...S.sel]; const m = M()[id]; const trash = ids.every((i) => M()[i] && M()[i].d);
      zk.menu(trash ? [{ label: 'Restore', run: () => A.restoreNotes(ids) }, { label: 'Delete Permanently…', run: () => A.deleteForever(ids) }] : [{ label: m.p ? 'Unpin' : 'Pin', run: () => A.togglePin(ids) }, { label: 'Move To', submenu: moveTargets(null, (t) => A.moveNotes(ids, t)) }, { label: 'Duplicate', enabled: ids.length === 1, run: () => A.duplicate(id) }, { label: m.l ? 'Remove Lock…' : 'Lock…', enabled: ids.length === 1, run: () => A.lockNote(id) }, { separator: true }, { label: 'Export as Markdown…', run: () => N.io.exportNotes(ids, 'md') }, { label: 'Copy Note Link', enabled: ids.length === 1, run: () => { S.cur === id ? A.copyLink() : navigator.clipboard && navigator.clipboard.writeText('[[' + (m.t || 'New Note') + ']]'); } }, { separator: true }, { label: 'Delete', run: () => A.deleteSelected() }], { x: e.clientX, y: e.clientY }); });
    // resizers
    const resizer = (rs, key, min, max, dir) => rs.addEventListener('pointerdown', (e) => { e.preventDefault(); rs.setPointerCapture(e.pointerId); rs.classList.add('active'); const x0 = e.clientX, w0 = S.settings[key]; const mv = (ev) => { S.settings[key] = zk.clamp(w0 + (ev.clientX - x0) * dir, min, max); A.applySettings(); }; const up = () => { rs.classList.remove('active'); rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); A.saveSettings(); }; rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up); });
    resizer($('#rs1'), 'sidebarW', 150, 340, 1); resizer($('#rs2'), 'listW', 220, 520, 1);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.mode && !document.querySelector('.zk-scrim,.zk-pop')) { e.preventDefault(); A.setMode(''); } }, true);
    el.pane.addEventListener('pointerdown', (e) => { if (el.app.classList.contains('sb-open')) el.app.classList.remove('sb-open'); });
    el.scroll.addEventListener('pointerdown', (e) => { if (e.target === el.scroll || e.target === el.doc) { if (S.editing && !(M()[S.cur] || {}).d) { e.preventDefault(); Ed.focus(); const r = document.createRange(); r.selectNodeContents(el.ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); } } });
    zeng.setMenus(A.menus()); const orig = zeng.refreshMenus; zeng.refreshMenus = () => zeng.setMenus(A.menus());
    // initial view & first note
    A.refresh(false); N.rel.rebuild(() => A.updateRelated()); await A.purgeOld(); setInterval(() => A.purgeOld(), 3600e3);
    let first = null; if (S.settings.last && M()[S.settings.last] && !M()[S.settings.last].d && !M()[S.settings.last].l) first = S.settings.last; else first = (S.filtered[0] || {}).id;
    if (!metas().length) { await A.newNote({ focus: 'title' }); } else if (first) { await A.selectIds([first]); scrollToId(first); } else showPlaceholder('none');
    // autosave
    setInterval(() => { if ((S.dirty || Db.pendingCount()) && S.editing) A.saveNow(); else if (Db.pendingCount()) Db.flush(); }, 800);
    const flushAll = () => { if (S.dirty || Db.pendingCount()) return A.saveNow(); };
    addEventListener('blur', flushAll); document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); }); addEventListener('pagehide', flushAll); addEventListener('beforeunload', () => { flushAll(); });
    zeng.on('close', async () => { try { await flushAll(); await Db.flush(); } finally { zeng.quit(); } });
    zeng.onFiles((hs) => { N.io.handleDrop(hs); return false; });
    if (Db.status.corrupted) N.io.corruptionNotice(); else if (Db.status.recovered) zk.toast('Recovered notes from a backup copy', 3000);
    if (zeng.isNative) zeng.call('dirty', { dirty: false }).catch(() => {});
    syncToolbar(); A.ready = true;
  };
  A.hooks = hooks; A.el = el; A.metas = metas; A.scrollToId = scrollToId; A.setLow = setLow; A.thumbCache = thumbCache; A.showPlaceholder = showPlaceholder; A.leaveNote = leaveNote;
})();
