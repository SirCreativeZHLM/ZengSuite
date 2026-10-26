/* Contact card: read mode, edit mode. */
(() => {
  'use strict';
  const ZC = window.ZC, S = ZC.S, M = ZC.M, el = zk.el, $ = (s) => document.querySelector(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LABELS = {
    phones: ['mobile', 'home', 'work', 'main', 'home fax', 'work fax', 'pager', 'other'], emails: ['home', 'work', 'other'], urls: ['homepage', 'home', 'work', 'other'], addrs: ['home', 'work', 'other'],
    dates: ['anniversary', 'other'], related: ['mother', 'father', 'parent', 'brother', 'sister', 'child', 'friend', 'spouse', 'partner', 'assistant', 'manager', 'other'],
    social: ['twitter', 'facebook', 'instagram', 'linkedin', 'github', 'youtube', 'mastodon', 'other'], ims: ['skype', 'signal', 'telegram', 'matrix', 'jabber', 'aim', 'other'],
  };
  const KINDS = { phones: 'Phone', emails: 'Email', urls: 'Website', addrs: 'Address', dates: 'Date', related: 'Related Name', social: 'Social Profile', ims: 'Instant Message' };
  const PLACE = { phones: 'Phone', emails: 'Email', urls: 'Website', dates: '', related: 'Name', social: 'Username or URL', ims: 'Handle' };
  const lbl = M.labelText;
  const webUrl = (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v);
  const mapUrl = (a) => { const q = encodeURIComponent(M.addrText(a).replace(/\s+/g, ' ')); return 'https://www.openstreetmap.org/search?query=' + q; };
  const SOC = { twitter: 'https://twitter.com/', facebook: 'https://facebook.com/', instagram: 'https://instagram.com/', linkedin: 'https://linkedin.com/in/', github: 'https://github.com/', youtube: 'https://youtube.com/@' };
  const socialUrl = (s) => (/^https?:\/\//i.test(s.v) ? s.v : SOC[s.l] ? SOC[s.l] + s.v.replace(/^@/, '') : '');
  ZC.mapUrl = mapUrl;

  // ---------- read mode ----------
  const pick = (items, anchor, empty) => {
    if (!items.length) return zk.toast(empty);
    if (items.length === 1) return items[0].run();
    zk.menu(items.map((i) => ({ label: i.label, run: i.run })), { anchor });
  };
  function readCard(c) {
    const frag = el('.card');
    const txt = el('.txt', el('h1', ZC.name(c) || 'No Name')); const head = el('.head', ZC.avatar(c, 88), txt);
    if (c.isOrg ? (c.title || c.dept) : (c.title || c.org || c.dept)) txt.append(el('.sub', c.isOrg ? [c.title, c.dept].filter(Boolean).join(' · ') : [c.title, c.dept, c.org].filter(Boolean).join(' · ')));
    if (c.nick || c.pFirst || c.pLast) txt.append(el('.ph', [c.nick && `“${c.nick}”`, [c.pFirst, c.pLast].filter(Boolean).join(' ')].filter(Boolean).join('  ')));
    const pills = el('.pills'); const bn = c.bday ? M.daysUntil(c.bday) : null; if (bn !== null && bn <= 14) pills.append(el('.pill', zk.icon('calendar-days', 12), bn === 0 ? 'Birthday today' : bn === 1 ? 'Birthday tomorrow' : `Birthday in ${bn} days`));
    for (const n of M.nudges([c], 14).filter((x) => x.kind === 'anniversary')) pills.append(el('.pill', zk.icon('heart', 12), n.in === 0 ? 'Anniversary today' : `Anniversary in ${n.in} days`));
    const di = M.dueInfo(c); if (di && di.over >= -3) pills.append(el('.pill.warn', zk.icon('bell', 12), M.dueText(di)));
    if (pills.children.length) txt.append(pills);
    frag.append(head);
    // action buttons
    const act = (icon, label, fn, disabled, cls = '') => { const b = el('button.act' + cls, { type: 'button', disabled, title: label, 'aria-label': label }, zk.icon(icon), label); b.onclick = () => fn(b); return b; };
    frag.append(el('.actions',
      act('mail', 'Email', (b) => pick(c.emails.map((e) => ({ label: `${lbl(e.l)}  ${e.v}`, run: () => ZC.openUrl('mailto:' + e.v) })), b), !c.emails.length),
      act('phone', 'Call', (b) => pick(c.phones.map((e) => ({ label: `${lbl(e.l)}  ${e.v}`, run: () => ZC.openUrl('tel:' + e.v.replace(/[^\d+#*,;]/g, '')) })), b), !c.phones.length),
      act('map-pin', 'Map', (b) => pick(c.addrs.map((a) => ({ label: `${lbl(a.l)}  ${M.addrText(a)}`, run: () => ZC.openUrl(mapUrl(a)) })), b), !c.addrs.length),
      act('globe', 'Website', (b) => pick(c.urls.map((u) => ({ label: u.v, run: () => ZC.openUrl(webUrl(u.v)) })), b), !c.urls.length),
      act('star', c.fav ? 'Favourite' : 'Favourite', () => ZC.toggleFav([c.id]), false, c.fav ? '.on' : ''),
      act('share', 'Share', () => ZC.shareVcf([c]), false)));
    // fields
    const fields = [];
    const row = (label, value, o = {}) => {
      const r = el('.field', { tabindex: 0, role: 'group', title: 'Click to copy' }, el('.lbl', label), el('.val' + (o.link ? '.link' : ''), value));
      const tools = el('.tools'); if (o.open) { const b = zk.btn({ icon: o.icon || 'external-link', title: o.openTitle || 'Open', onClick: (e) => { e.stopPropagation(); o.open(); } }); tools.append(b); }
      tools.append(zk.btn({ icon: 'copy', title: 'Copy', onClick: (e) => { e.stopPropagation(); ZC.copy(o.copy ?? String(value)); } })); r.append(tools);
      r.onclick = (e) => { if (window.getSelection().toString()) return; ZC.copy(o.copy ?? String(value)); const f = el('.flash', 'Copied'); r.append(f); setTimeout(() => f.remove(), 900); };
      r.onkeydown = (e) => { if (e.key === 'Enter') r.onclick(e); };
      return r;
    };
    let cur = null; const block = (title, rows) => { if (!rows.length) return; if (title) { cur = null; fields.push(el('.sectitle', title)); } if (!cur) { cur = el('.fields'); fields.push(cur); } rows.forEach((r) => cur.append(r)); };
    block('', c.phones.map((p) => row(lbl(p.l), p.v, { link: true, open: () => ZC.openUrl('tel:' + p.v.replace(/[^\d+#*,;]/g, '')), icon: 'phone', openTitle: 'Call' })));
    block('', c.emails.map((p) => row(lbl(p.l), p.v, { link: true, open: () => ZC.openUrl('mailto:' + p.v), icon: 'mail', openTitle: 'Send email' })));
    block('', c.urls.map((p) => row(lbl(p.l), p.v, { link: true, open: () => ZC.openUrl(webUrl(p.v)), icon: 'globe', openTitle: 'Open in browser' })));
    block('', c.addrs.map((a) => row(lbl(a.l), M.addrLines(a), { open: () => ZC.openUrl(mapUrl(a)), icon: 'map-pin', openTitle: 'Show on map', copy: M.addrLines(a) })));
    block('', [c.bday && row('Birthday', el('span', M.fmtDate(c.bday), (() => { const age = M.turningAge(c.bday); const d = M.daysUntil(c.bday); return age != null ? el('span', { style: { color: 'var(--fg-2)' } }, `  ·  turns ${age}${d === 0 ? ' today' : d <= 60 ? ' in ' + d + ' days' : ''}`) : null; })()), { copy: M.fmtDate(c.bday) })].filter(Boolean).concat(c.dates.map((d) => row(lbl(d.l), M.fmtDate(d.v)))));
    block('', c.related.map((r) => row(lbl(r.l), r.v)));
    block('', c.social.map((s) => row(lbl(s.l), s.v, socialUrl(s) ? { link: true, open: () => ZC.openUrl(socialUrl(s)), icon: 'external-link' } : {})));
    block('', c.ims.map((s) => row(lbl(s.l), s.v)));
    if (c.notes) block('', [row('Notes', c.notes)]);
    fields.push(rhythmBlock(c));
    const gs = c.groups.map(ZC.group).filter(Boolean); if (gs.length) fields.push(el('.sectitle', 'Groups'), el('.chips', gs.map((g) => el('span.chip', g.name))));
    frag.append(...fields.filter(Boolean));
    frag.append(el('.botbar', el('button.zk-btn.bordered', { type: 'button', onclick: () => ZC.beginEdit() }, zk.icon('pencil'), 'Edit'), el('button.zk-btn.bordered', { type: 'button', onclick: () => ZC.copyVcf([c]) }, zk.icon('copy'), 'Copy vCard')));
    frag.append(el('.meta-foot', 'Added ' + new Date(c.created).toLocaleDateString(undefined, { dateStyle: 'medium' }) + (c.modified - c.created > 60000 ? ' · Edited ' + new Date(c.modified).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '')));
    return frag;
  }

  // ---------- relationship rhythm ----------
  function rhythmBlock(c) {
    const di = M.dueInfo(c); const ds = M.daysSince(c); const box = el('.rhythm');
    const status = di ? el('span.rstat.' + di.state, M.dueText(di)) : null;
    box.append(el('.rh', el('span.sectitle', { style: { margin: 0 } }, 'Rhythm'), status, el('span', { style: { flex: 1 } }), el('button.zk-btn.bordered', { type: 'button', onclick: () => ZC.rhythmDialog(c) }, zk.icon('repeat'), c.cad ? 'Change' : 'Set rhythm')));
    box.append(el('.rgrid', el('div', el('.lbl', 'Cadence'), el('.val', M.cadenceLabel(c.cad))), el('div', el('.lbl', 'Last caught up'), el('.val', c.lc ? `${M.fmtDate(c.lc)} · ${M.agoText(ds)}` : 'Not yet'))));
    box.append(el('.rbtns', el('button.zk-btn.primary', { type: 'button', onclick: () => ZC.catchupDialog(c, 'catchup') }, zk.icon('check'), 'Log catch-up…'), el('button.zk-btn.bordered', { type: 'button', onclick: () => ZC.catchupDialog(c, 'note') }, zk.icon('pencil'), 'Add note…')));
    if (c.log.length) box.append(el('.tl', c.log.slice().reverse().map((g) => {
      const d = new Date(g.t); const row = el('.tle' + (g.k === 'note' ? '.note' : ''), el('.tld'), el('.tlb', el('.tlh', el('b', g.k === 'note' ? 'Note' : 'Caught up'), el('span', d.toLocaleDateString(undefined, { dateStyle: 'medium' }))), g.note ? el('.tln', g.note) : null),
        el('button.zk-btn.icon.tlx', { type: 'button', title: 'Remove entry', 'aria-label': 'Remove entry', onclick: () => ZC.update([c.id], 'Remove Timeline Entry', (x) => ({ ...x, log: x.log.filter((y) => y.id !== g.id) })) }, zk.icon('x', 12)));
      return row; })));
    return box;
  }

  function emptyCard() {
    if (!S.contacts.length) return el('.empty', el('.big', zk.icon('contact')), el('h2', 'No Contacts'), el('p', 'Add your first contact, or bring in an existing address book from a vCard (.vcf) or CSV file.'),
      el('.btns', el('button.zk-btn.primary.lg', { type: 'button', onclick: () => ZC.newContact() }, zk.icon('plus'), 'New Contact'), el('button.zk-btn.bordered.lg', { type: 'button', onclick: () => ZC.importDialog() }, zk.icon('upload'), 'Import…')),
      el('p', { style: { fontSize: '12px', marginTop: '8px' } }, 'Everything stays on this computer.'));
    return el('.empty', el('.big', zk.icon('user')), el('h2', S.query || ZC.order().length === 0 ? (ZC.order().length === 0 ? 'No Results' : 'No Selection') : 'No Selection'), el('p', ZC.order().length ? 'Select a contact to see its card.' : S.query ? 'Nothing matches your search.' : 'This list is empty.'));
  }
  function multiCard(cs) {
    const wrap = el('.card.multi', el('.stack', cs.slice(0, 5).map((c) => ZC.avatar(c, 56))), el('.head', el('h1', `${cs.length} Contacts Selected`)));
    const b = (icon, label, fn, cls = '') => el('button.zk-btn.bordered' + cls, { type: 'button', onclick: (e) => fn(e.currentTarget) }, zk.icon(icon), label);
    wrap.append(el('.botbar', b('merge', 'Merge…', () => ZC.mergeSelected()), b('users', 'Add to Group', (a) => { const gs = S.groups.filter((g) => !g.smart); zk.menu([...gs.map((g) => ({ label: g.name, run: () => ZC.addToGroup([...S.sel], g.id) })), ...(gs.length ? [{ separator: true }] : []), { label: 'New Group…', run: () => ZC.newGroup(true) }], { anchor: a }); }), b('star', 'Favourite', () => ZC.toggleFav([...S.sel]))),
      el('.botbar', b('download', 'Export…', () => ZC.exportDialog('selected')), b('printer', 'Print…', () => ZC.printDialog()), b('trash-2', 'Delete', () => ZC.deleteSelected(), '.btn-del')));
    return wrap;
  }

  ZC.renderCard = () => {
    const host = $('#card'); const top = host.scrollTop; let node;
    if (S.view === 'map' && !S.editing) { host._editing = false; ZC.renderMap(host); $('#title').textContent = 'People'; return; }
    if (S.editing && S.draft) { host._editing = true; node = editCard(); }
    else {
      host._editing = false; const cs = ZC.selected();
      node = cs.length === 1 ? readCard(cs[0]) : cs.length > 1 ? multiCard(cs) : emptyCard();
    }
    host.replaceChildren(node); host.scrollTop = host._keepKey === (S.cur || 'new') ? top : 0; host._keepKey = S.cur || 'new';
    if (S.editing && S._focusNew) { S._focusNew = false; const f = host.querySelector('[data-focus]') || host.querySelector('input'); f && f.focus(); }
    const t = $('#title'); t.textContent = 'People';
  };

  // ---------- edit mode ----------
  ZC.newContact = () => {
    if (S.editing) ZC.finishEdit(true); if (S.editing) return;
    const c = M.blank(); const g = ZC.group(S.view); if (g && !g.smart) c.groups = [g.id];
    S.draft = c; S.isNew = true; S.orig = null; S.editing = true; S.show = new Set(); S._focusNew = true;
    S.sel = new Set(); S.cur = null; ZC.renderList(); ZC.renderCard(); ZC.syncToolbar(); ZC.renderStatus(); ZC.menusSoon();
  };
  ZC.beginEdit = () => {
    if (S.editing) return; const c = ZC.selected(); if (c.length !== 1) return;
    S.draft = clone(c[0]); S.orig = c[0]; S.isNew = false; S.editing = true; S.show = new Set(); S._focusNew = true;
    ZC.renderCard(); ZC.syncToolbar(); ZC.menusSoon();
  };
  const cleanDraft = (d) => {
    const t = (s) => String(s || '').trim(); ['prefix', 'first', 'middle', 'last', 'suffix', 'nick', 'pFirst', 'pLast', 'org', 'dept', 'title'].forEach((k) => (d[k] = t(d[k]))); d.notes = String(d.notes || '').replace(/\s+$/, '');
    for (const k of ['phones', 'emails', 'urls', 'related', 'social', 'ims']) d[k] = d[k].map((e) => ({ ...e, v: t(e.v), l: t(e.l) || 'other' })).filter((e) => e.v);
    d.dates = d.dates.filter((e) => e.v).map((e) => ({ ...e, l: t(e.l) || 'other' }));
    d.addrs = d.addrs.map((a) => ({ ...a, street: t(a.street), city: t(a.city), state: t(a.state), zip: t(a.zip), country: t(a.country), l: t(a.l) || 'other' })).filter((a) => a.street || a.city || a.state || a.zip || a.country || a.pobox || a.ext);
    return d;
  };
  const isEmpty = (d) => !M.hasName(d) && !d.emails.length && !d.phones.length && !d.addrs.length && !d.urls.length && !d.notes && !d.bday && !d.dates.length && !d.related.length && !d.social.length && !d.ims.length && !d.photo && !d.title && !d.dept && !d.prefix && !d.suffix;
  ZC.finishEdit = (save) => {
    if (!S.editing) return; const d = cleanDraft(S.draft); const isNew = S.isNew;
    const done = () => { S.editing = false; S.draft = null; S.isNew = false; S.orig = null; };
    if (!save || (isNew && isEmpty(d))) { done(); ZC.renderAll(); return; }
    if (isNew) {
      done(); d.created = d.modified = Date.now(); ZC.addContacts([d], 'New Contact'); S._rows = null;
      if (!ZC.order().includes(d.id)) { if (S.query) { S.query = ''; $('#q').value = ''; } if (!ZC.order().includes(d.id)) S.view = 'all'; S._rows = null; }
      S.sel = new Set([d.id]); S.cur = S.anchor = d.id; ZC.renderAll(); ZC.ensureVisible(d.id);
    } else {
      const same = JSON.stringify({ ...d, modified: 0 }) === JSON.stringify({ ...S.orig, modified: 0 }); done();
      if (!same) { ZC.mutate('Edit Contact', () => { S.contacts = S.contacts.map((c) => (c.id === d.id ? { ...d, modified: Date.now() } : c)); }); S._rows = null; }
      ZC.renderAll(); ZC.ensureVisible(d.id);
    }
  };
  ZC.cancelEdit = async () => {
    if (!S.editing) return; const d = cleanDraft(clone(S.draft)); const changed = S.isNew ? !isEmpty(d) : JSON.stringify({ ...d, modified: 0 }) !== JSON.stringify({ ...S.orig, modified: 0 });
    if (changed && !(await zk.confirm('Discard changes?', 'Your edits to this contact have not been saved.', 'Discard', { danger: true }))) return;
    ZC.finishEdit(false);
  };

  const inp = (d, key, ph, o = {}) => { const i = el('input.inp.selectable' + (o.big ? '.big' : ''), { value: d[key] || '', placeholder: ph, spellcheck: false, autocomplete: 'off', 'aria-label': ph, ...(o.focus ? { 'data-focus': '1' } : {}) }); i.addEventListener('input', () => { d[key] = i.value; if (o.live) o.live(); }); return i; };
  function labelBtn(kind, e, onChange) {
    const sp = el('span', lbl(e.l)); const b = el('button.lab', { type: 'button', title: 'Change label' }, sp, zk.icon('chevrons-up-down'));
    b.onclick = () => {
      const opts = LABELS[kind]; zk.menu([...opts.map((o) => ({ label: lbl(o), checked: e.l.toLowerCase() === o, run: () => { e.l = o; sp.textContent = lbl(o); onChange && onChange(); } })), { separator: true }, { label: 'Custom…', run: async () => { const v = await zk.prompt('Custom Label', opts.includes(e.l) ? '' : e.l, { ok: 'Set' }); if (v && v.trim()) { e.l = v.trim(); sp.textContent = e.l; onChange && onChange(); } } }], { anchor: b });
    };
    return b;
  }
  const rmBtn = (fn) => el('button.rm', { type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: fn }, zk.icon('minus-circle'));
  const rerender = (focus) => { const host = $('#card'); const top = host.scrollTop; S._focusNew = false; ZC.renderCard(); host.scrollTop = top; if (focus === true) { const t = host.querySelector('[data-newrow] input, [data-newrow] textarea'); t && t.focus(); } else if (focus) { const t = host.querySelector(focus); t && t.focus(); } };
  function dateWidget(e) {
    const m = M.mdOf(e.v) || [0, 0]; const y = M.yearOf(e.v) || '';
    const mo = el('select.zk-select', { 'aria-label': 'Month' }, el('option', { value: 0 }, 'Month'), M.MONTHS.map((n, i) => el('option', { value: i + 1, selected: m[0] === i + 1 }, n)));
    const dd = el('input.zk-input.dd.selectable', { type: 'number', min: 1, max: 31, placeholder: 'Day', value: m[1] || '', 'aria-label': 'Day' }); const yy = el('input.zk-input.yr.selectable', { type: 'number', min: 1000, max: 9999, placeholder: 'Year', value: y && y !== 1604 ? y : '', 'aria-label': 'Year (optional)' });
    const upd = () => { const mm = +mo.value, d = +dd.value, y = +yy.value; const P = (n) => String(n).padStart(2, '0'); e.v = mm && d >= 1 && d <= 31 ? (y >= 1000 ? `${y}-${P(mm)}-${P(d)}` : `--${P(mm)}-${P(d)}`) : ''; };
    [mo, dd, yy].forEach((x) => x.addEventListener('input', upd)); return el('.dt', mo, dd, yy);
  }
  function multiBlock(d, kind, newIdx) {
    const list = d[kind]; if (!list.length) return null;
    return el('.grp', list.map((e, i) => {
      const r = el('.erow', newIdx === i ? { 'data-newrow': '1' } : null, rmBtn(() => { list.splice(i, 1); rerender(); }), labelBtn(kind, e));
      if (kind === 'dates') r.append(dateWidget(e));
      else { const i2 = el('input.inp.selectable', { value: e.v, placeholder: PLACE[kind], spellcheck: false, autocomplete: 'off', 'aria-label': PLACE[kind] }); i2.addEventListener('input', () => (e.v = i2.value)); r.append(i2); }
      return r;
    }));
  }
  function addrBlock(d, newIdx) {
    if (!d.addrs.length) return null;
    return el('.grp', d.addrs.map((a, i) => {
      const f = (k, ph, cls = '') => { const x = el('input.inp.selectable' + cls, { value: a[k] || '', placeholder: ph, 'aria-label': ph, spellcheck: false }); x.addEventListener('input', () => (a[k] = x.value)); return x; };
      return el('.erow.addr', newIdx === i ? { 'data-newrow': '1' } : null, rmBtn(() => { d.addrs.splice(i, 1); rerender(); }), labelBtn('addrs', a), el('.stack', f('street', 'Street'), el('.two', f('city', 'City'), f('state', 'State')), el('.two', f('zip', 'ZIP / Postal code'), f('country', 'Country'))));
    }));
  }
  function addFieldMenu(d, anchor) {
    const sh = S.show; const has = (k) => d[k] || sh.has(k);
    const add = (kind) => () => { const lab = LABELS[kind][0]; if (kind === 'addrs') d.addrs.push({ l: 'home', street: '', city: '', state: '', zip: '', country: '', pobox: '', ext: '' }); else d[kind].push({ l: kind === 'emails' || kind === 'urls' ? LABELS[kind][0] : lab, v: '' }); S._newIdx = [kind, d[kind].length - 1]; rerender(true); };
    const items = [{ label: 'Phone', run: add('phones') }, { label: 'Email', run: add('emails') }, { label: 'Website', run: add('urls') }, { label: 'Address', run: add('addrs') },
      ...(!d.bday ? [{ label: 'Birthday', run: () => { sh.add('bday'); rerender(); } }] : []), { label: 'Date', run: add('dates') }, { label: 'Related Name', run: add('related') }, { label: 'Social Profile', run: add('social') }, { label: 'Instant Message', run: add('ims') },
      ...(!has('notes') ? [{ label: 'Notes', run: () => { sh.add('notes'); rerender('textarea.inp'); } }] : []), { separator: true }];
    const names = [['prefix', 'Prefix'], ['middle', 'Middle Name'], ['suffix', 'Suffix'], ['nick', 'Nickname'], ['phon', 'Phonetic Name'], ['dept', 'Department'], ['title', 'Job Title']];
    names.forEach(([k, n]) => { const shown = k === 'phon' ? d.pFirst || d.pLast || sh.has('phon') : has(k); if (!shown) items.push({ label: n, run: () => { sh.add(k); rerender('[data-k="' + k + '"]'); } }); });
    zk.menu(items, { anchor });
  }
  function editCard() {
    const d = S.draft; const sh = S.show || (S.show = new Set()); const has = (k) => d[k] || sh.has(k);
    const nIdx = S._newIdx; S._newIdx = null; const ni = (k) => (nIdx && nIdx[0] === k ? nIdx[1] : -1);
    const wrap = el('.card.edit');
    const av = ZC.avatar(d, 88); av.append(el('.edit-tag', d.photo ? 'edit' : 'add photo')); av.tabIndex = 0; av.setAttribute('role', 'button'); av.setAttribute('aria-label', 'Change photo');
    av.onclick = () => ZC.photoMenu(d, av, () => rerender()); av.onkeydown = (e) => { if (e.key === ' ') { e.preventDefault(); av.onclick(); } };
    wrap.append(el('.head', av));
    const tag = (i, k) => { i.dataset.k = k; return i; };
    const names = el('.names');
    if (has('prefix')) names.append(tag(inp(d, 'prefix', 'Prefix'), 'prefix')); names.append(inp(d, 'first', 'First name', { big: true, focus: true })); if (has('middle')) names.append(tag(inp(d, 'middle', 'Middle name'), 'middle')); names.append(inp(d, 'last', 'Last name', { big: true })); if (has('suffix')) names.append(tag(inp(d, 'suffix', 'Suffix'), 'suffix'));
    if (has('nick')) names.append(tag(inp(d, 'nick', 'Nickname'), 'nick')); if (d.pFirst || d.pLast || sh.has('phon')) names.append(tag(inp(d, 'pFirst', 'Phonetic first name'), 'phon'), inp(d, 'pLast', 'Phonetic last name'));
    names.append(inp(d, 'org', 'Company')); if (has('dept')) names.append(tag(inp(d, 'dept', 'Department'), 'dept')); if (has('title')) names.append(tag(inp(d, 'title', 'Job title'), 'title'));
    const compChk = el('input.zk-switch', { type: 'checkbox', checked: d.isOrg, 'aria-label': 'Show as company' }); compChk.onchange = () => (d.isOrg = compChk.checked);
    names.append(el('label.tgl', el('span', { style: { flex: 1 } }, 'Show as company'), compChk));
    wrap.append(names);
    for (const k of ['phones', 'emails', 'urls']) { const b = multiBlock(d, k, ni(k)); b && wrap.append(b); }
    const a = addrBlock(d, ni('addrs')); a && wrap.append(a);
    if (d.bday || sh.has('bday')) { const e = { l: 'birthday', v: d.bday }; const proxy = { get v() { return e.v; }, set v(x) { e.v = x; d.bday = x; } }; wrap.append(el('.grp', el('.erow', rmBtn(() => { d.bday = ''; sh.delete('bday'); rerender(); }), el('span.lab', { style: { color: 'var(--fg)', display: 'flex', alignItems: 'center', width: '104px', fontSize: '12.5px' } }, 'Birthday'), dateWidget(proxy)))); }
    for (const k of ['dates', 'related', 'social', 'ims']) { const b = multiBlock(d, k, ni(k)); b && wrap.append(b); }
    if (has('notes')) { const t = el('textarea.inp.selectable', { value: d.notes, placeholder: 'Notes', 'aria-label': 'Notes' }); t.addEventListener('input', () => (d.notes = t.value)); wrap.append(el('.grp', t)); }
    const man = S.groups.filter((g) => !g.smart);
    if (man.length) wrap.append(el('.sectitle', 'Groups'), el('.grp', man.map((g) => { const cb = el('input.zk-check', { type: 'checkbox', checked: d.groups.includes(g.id) }); cb.onchange = () => { d.groups = cb.checked ? [...d.groups, g.id] : d.groups.filter((x) => x !== g.id); }; return el('label.tgl', cb, g.name); })));
    const fav = el('input.zk-switch', { type: 'checkbox', checked: d.fav, 'aria-label': 'Favourite' }); fav.onchange = () => (d.fav = fav.checked);
    wrap.append(el('.grp', el('label.tgl', { style: { borderTop: 0 } }, el('span', { style: { flex: 1 } }, 'Favourite'), fav)));
    const addb = el('button.zk-btn.bordered.addbtn', { type: 'button' }, zk.icon('plus-circle'), 'add field'); addb.onclick = () => addFieldMenu(d, addb);
    wrap.append(addb);
    wrap.append(el('.bar', el('button.zk-btn.bordered.lg', { type: 'button', onclick: () => ZC.cancelEdit() }, 'Cancel'), !S.isNew ? el('button.zk-btn.bordered.lg.btn-del', { type: 'button', onclick: async () => { const id = d.id; if (await zk.confirm('Delete this contact?', 'You can undo this right after.', 'Delete', { danger: true })) { ZC.finishEdit(false); ZC.select([id], id); ZC.deleteSelected(); } } }, 'Delete') : null, el('button.zk-btn.primary.lg', { type: 'button', onclick: () => ZC.finishEdit(true) }, 'Done')));
    return wrap;
  }
})();
