/* Dialogs and flows: photo, import/export, backup, duplicates/merge, cleanup, smart groups, history. */
(() => {
  'use strict';
  const ZC = window.ZC, S = ZC.S, M = ZC.M, el = zk.el, V = ZVCard, CSV = ZCSV;
  const $ = (s) => document.querySelector(s);
  const sheetOf = (e) => (e.target || e).closest('.zk-sheet');
  const rel = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; };
  const sigOf = (c) => M.fold([c.first, c.last, c.org].join(' ')).replace(/\s+/g, ' ').trim() + '|' + c.phones.map((p) => M.phoneKey(p.v)).sort().join(',') + '|' + c.emails.map((e) => e.v.toLowerCase()).sort().join(',');
  const dl = (cls, ...k) => el('.dlg' + (cls ? '.' + cls : ''), ...k);

  // ---------- images ----------
  const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image can’t be read.')); i.src = url; });
  ZC.shrink = async (dataUrl, max = 320) => {
    try { const img = await loadImg(dataUrl); const w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, max / Math.min(w, h)); if (k === 1 && dataUrl.length < 120000) return dataUrl; const cw = Math.round(w * k), ch = Math.round(h * k); const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(img, 0, 0, cw, ch); return cv.toDataURL('image/jpeg', 0.86); } catch { return dataUrl; }
  };
  const blobUrl = async (h) => { const buf = await zeng.files.read(h); return URL.createObjectURL(new Blob([buf])); };
  ZC.photoMenu = (d, anchor, onChange) => {
    const choose = async () => { const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }] }); if (!hs[0]) return; let url; try { url = await blobUrl(hs[0]); const r = await ZC.cropDialog(url); if (r) { d.photo = r; onChange(); } } catch (e) { zk.alert('Can’t use this photo', e.message); } finally { url && URL.revokeObjectURL(url); } };
    zk.menu([{ label: 'Choose Photo…', run: choose }, ...(d.photo ? [{ label: 'Adjust Photo…', run: async () => { const r = await ZC.cropDialog(d.photo); if (r) { d.photo = r; onChange(); } } }, { label: 'Remove Photo', run: () => { d.photo = ''; onChange(); } }] : [])], { anchor });
  };
  ZC.cropDialog = async (url) => {
    const img = await loadImg(url); const SZ = 300, R = 139; const cv = el('canvas', { width: SZ * 2, height: SZ * 2 });
    const base = Math.max((R * 2) / img.naturalWidth, (R * 2) / img.naturalHeight); let zoom = 1, ox = 0, oy = 0;
    const clampPan = () => { const w = img.naturalWidth * base * zoom, h = img.naturalHeight * base * zoom; ox = zk.clamp(ox, -(w / 2 - R), w / 2 - R); oy = zk.clamp(oy, -(h / 2 - R), h / 2 - R); };
    const draw = () => { clampPan(); const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.fillStyle = '#111'; g.fillRect(0, 0, SZ, SZ); const w = img.naturalWidth * base * zoom, h = img.naturalHeight * base * zoom; g.drawImage(img, SZ / 2 + ox - w / 2, SZ / 2 + oy - h / 2, w, h); };
    const box = el('.cropper', cv, el('.mask'), el('.ring')); draw();
    box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); let x = e.clientX, y = e.clientY; const mv = (ev) => { ox += ev.clientX - x; oy += ev.clientY - y; x = ev.clientX; y = ev.clientY; draw(); }; const up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); }; box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); });
    box.addEventListener('wheel', (e) => { e.preventDefault(); zoom = zk.clamp(zoom * Math.exp(-e.deltaY * 0.002), 1, 6); slider.value = zoom; draw(); }, { passive: false });
    const slider = el('input.zk-range', { type: 'range', min: 1, max: 6, step: 0.01, value: 1, 'aria-label': 'Zoom' }); slider.oninput = () => { zoom = +slider.value; draw(); };
    const r = await zk.sheet({ title: 'Choose Photo', body: dl('', box, el('.opt', zk.icon('zoom-out'), slider, zk.icon('zoom-in')), el('.lead', { style: { textAlign: 'center' } }, 'Drag to reposition. Scroll or use the slider to zoom.')), buttons: [{ label: 'Cancel', value: null }, { label: 'Choose', primary: true, value: 'ok' }], width: 380 });
    if (r !== 'ok') return null;
    const out = document.createElement('canvas'); out.width = out.height = 320; const g = out.getContext('2d'); const k = 320 / (R * 2); const w = img.naturalWidth * base * zoom * k, h = img.naturalHeight * base * zoom * k; g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 320); g.drawImage(img, 160 + ox * k - w / 2, 160 + oy * k - h / 2, w, h);
    return out.toDataURL('image/jpeg', 0.88);
  };

  // ---------- vCard share / export ----------
  const forExport = (list) => list.map((c) => ({ ...c, cats: c.groups.map((g) => (ZC.group(g) || {}).name).filter(Boolean), uid: c.uid || c.id, rev: c.modified }));
  ZC.toVcf = (list, ver) => V.write(forExport(list), { version: ver || S.prefs.exportVer || '3.0' });
  ZC.copyVcf = (list) => ZC.copy(ZC.toVcf(list), 'vCard copied');
  const safeName = (s) => String(s || 'People').replace(/[\\/:*?"<>|]+/g, '').trim() || 'People';
  ZC.shareVcf = async (list) => { if (!list.length) return; const nm = list.length === 1 ? ZC.name(list[0]) : 'People'; const h = await zeng.files.saveAs(ZC.toVcf(list), { name: safeName(nm) + '.vcf', filters: [{ name: 'vCard', exts: ['vcf'] }] }); if (h) zk.toast('Saved ' + h.name); };
  ZC.exportDialog = async (scope = 'all', gid) => {
    const sel = ZC.selected(); const shown = ZC.order().map(ZC.get);
    const scopes = [['selected', `Selected contacts (${sel.length})`, sel.length > 0], ['list', `Current list: ${ZC.viewName()} (${shown.length})`, shown.length > 0], ['group', 'Group…', S.groups.some((g) => !g.smart)], ['all', `All contacts (${S.contacts.length})`, S.contacts.length > 0]];
    if (scope === 'selected' && !sel.length) scope = 'list'; if (scope === 'group' && !gid) scope = 'list'; if (scope === 'all' && !S.contacts.length) { zk.alert('Nothing to export', 'Your address book is empty.'); return; }
    const sc = el('select.zk-select', scopes.filter((s) => s[2]).map((s) => el('option', { value: s[0], selected: s[0] === scope }, s[1])));
    const gs = el('select.zk-select', S.groups.map((g) => el('option', { value: g.id, selected: g.id === gid }, g.name))); gs.style.display = scope === 'group' ? '' : 'none'; sc.onchange = () => (gs.style.display = sc.value === 'group' ? '' : 'none');
    const fm = el('select.zk-select', [['vcf3', 'vCard 3.0 (.vcf)'], ['vcf4', 'vCard 4.0 (.vcf)'], ['vcf2', 'vCard 2.1 (.vcf)'], ['csv-google', 'CSV — Google Contacts'], ['csv-outlook', 'CSV — Outlook'], ['csv-generic', 'CSV — simple']].map(([v, n]) => el('option', { value: v, selected: v === ({ '2.1': 'vcf2', '3.0': 'vcf3', '4.0': 'vcf4' })[S.prefs.exportVer]}, n)));
    const r = await zk.sheet({ title: 'Export Contacts', body: dl('', el('.opt', el('span', 'Contacts'), sc), el('.opt', el('span', 'Group'), gs), el('.opt', el('span', 'Format'), fm)), buttons: [{ label: 'Cancel', value: null }, { label: 'Export…', primary: true, value: 'ok' }], width: 460 });
    if (r !== 'ok') return;
    const list = sc.value === 'selected' ? sel : sc.value === 'list' ? shown : sc.value === 'group' ? S.contacts.filter((c) => c.groups.includes(gs.value)) : S.contacts;
    if (!list.length) return zk.alert('Nothing to export', 'No contacts match that choice.');
    const f = fm.value; const base = sc.value === 'group' ? (ZC.group(gs.value) || {}).name : sc.value === 'list' ? ZC.viewName() : list.length === 1 ? ZC.name(list[0]) : 'People';
    let data, ext, filt;
    if (f.startsWith('vcf')) { const ver = { vcf2: '2.1', vcf3: '3.0', vcf4: '4.0' }[f]; S.prefs.exportVer = ver; ZC.prefsSave(); data = ZC.toVcf(list, ver); ext = 'vcf'; filt = 'vCard'; }
    else { data = CSV.write(CSV.fromContacts(forExport(list), f.slice(4))); ext = 'csv'; filt = 'CSV'; }
    const h = await zeng.files.saveAs(data, { name: safeName(base) + '.' + ext, filters: [{ name: filt, exts: [ext] }] }); if (h) zk.toast(`Exported ${list.length} contact${list.length > 1 ? 's' : ''}`);
  };

  // ---------- import ----------
  ZC.importDialog = async () => {
    const hs = await zeng.files.open({ multiple: true, filters: [{ name: 'Contacts', exts: ['vcf', 'vcard', 'csv', 'zcontacts'] }] }); if (hs && hs.length) ZC.importFiles(hs);
  };
  ZC.importFiles = async (hs) => {
    const ok = hs.filter((h) => ['vcf', 'vcard', 'csv', 'zcontacts'].includes(zeng.files.ext(h.name))); if (!ok.length) return false;
    for (const h of ok) {
      try {
        const ext = zeng.files.ext(h.name); const buf = await zeng.files.read(h);
        if (ext === 'zcontacts') await ZC.restoreBackup(buf, h.name);
        else if (ext === 'csv') await ZC.csvImport(V.decodeBuffer(new Uint8Array(buf)), h.name);
        else { const r = V.parse(new Uint8Array(buf)); if (!r.contacts.length) throw new Error('No contacts were found in this file.'); await ZC.importParsed(r.contacts, h.name, r.warnings); }
      } catch (e) { zk.alert(`Can’t import “${h.name}”`, e.message || String(e)); }
    }
    return true;
  };
  // list: parsed contacts (with .cats); adds groups from categories; skips ones already present
  ZC.importParsed = async (list, name, warnings = [], opts = {}) => {
    const existing = new Set(S.contacts.map(sigOf)); const newGroups = []; const gid = (nm) => { let g = [...S.groups, ...newGroups].find((x) => !x.smart && x.name.toLowerCase() === nm.toLowerCase()); if (!g) { g = { id: zk.uid(), name: nm }; newGroups.push(g); } return g.id; };
    const out = []; let skipped = 0; const seen = new Set();
    for (const raw of list) {
      const c = M.sanitize({ ...raw, id: undefined, groups: [] }); c.id = M.uid(); c.created = Date.now(); c.modified = raw.rev || Date.now(); c.uid = raw.uid || '';
      if (raw.rev) c.rev = raw.rev; c.cats = []; if (c.photo && c.photo.length > 90000) c.photo = await ZC.shrink(c.photo);
      const sg = sigOf(c); if (sg === '||' && !c.notes && !c.addrs.length) { skipped++; continue; } if (existing.has(sg) || seen.has(sg)) { skipped++; continue; } seen.add(sg);
      c.groups = (raw.cats || []).filter((n) => n && !/^(myContacts|starred in android)$/i.test(n)).map(gid); if ((raw.cats || []).some((n) => /^starred in android$/i.test(n))) c.fav = true; if (opts.extraGroup) c.groups.push(opts.extraGroup);
      out.push(c);
    }
    if (!out.length) { await zk.alert('Nothing new to import', skipped ? `All ${skipped} contact${skipped > 1 ? 's' : ''} in “${name}” are already in your address book.` : 'No usable contacts were found.'); return 0; }
    ZC.mutate('Import ' + (name || 'Contacts'), () => { S.groups = S.groups.concat(newGroups); S.contacts = S.contacts.concat(out); });
    S._rows = null; ZC.setView('all'); ZC.select(out.slice(0, 1).map((c) => c.id), out[0].id);
    const dupes = M.findDuplicates(S.contacts).length;
    const r = await zk.sheet({ title: `Imported ${out.length} Contact${out.length > 1 ? 's' : ''}`, message: [skipped ? `${skipped} already in your address book were skipped.` : '', newGroups.length ? `${newGroups.length} group${newGroups.length > 1 ? 's were' : ' was'} created from categories.` : '', warnings.length ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''} while reading the file.` : '', dupes ? `${dupes} possible duplicate set${dupes > 1 ? 's' : ''} found.` : ''].filter(Boolean).join(' ') || 'Your address book has been updated. You can undo this from Edit > Undo.', buttons: [...(dupes ? [{ label: 'Find Duplicates…', value: 'dupes' }] : []), { label: 'Done', primary: true, value: 'ok' }] });
    if (r === 'dupes') ZC.dupesDialog(); return out.length;
  };
  ZC.importSample = async () => {
    const list = M.sampleContacts(); const g = { id: zk.uid(), name: 'Sample Contacts' };
    ZC.mutate('Import Sample Contacts', () => { S.groups = [...S.groups, g]; S.contacts = S.contacts.concat(list.map((c) => ({ ...c, groups: [g.id] }))); });
    ZC.setView('all'); ZC.select([list[0].id], list[0].id); zk.toast('Added 12 sample contacts in the “Sample Contacts” group');
  };

  // ---------- CSV import with mapping UI ----------
  ZC.csvImport = async (text, name) => {
    const rows = CSV.parse(text); if (rows.length < 1 || rows[0].length < 1) throw new Error('This CSV file is empty.');
    const hdrGuess = !rows[0].some((c) => /@|^\d[\d\s()+.-]{5,}$/.test(c)) && rows[0].every((c) => c.trim() !== '' || true);
    let preset = CSV.detectPreset(rows[0]); let mapping = CSV.autoMap(rows[0], preset); let header = hdrGuess;
    const T = CSV.TARGETS; const groupsDef = [['', ['']], ['Name', ['name', 'first', 'middle', 'last', 'prefix', 'suffix', 'nick', 'pFirst', 'pLast']], ['Work', ['org', 'dept', 'title']], ['Phone', ['phone', 'phone:mobile', 'phone:home', 'phone:work', 'phone:main', 'phone:fax', 'phone:pager', 'phone:other']], ['Email & Web', ['email', 'email:home', 'email:work', 'email:other', 'url', 'url:home', 'url:work', 'url:other']], ['Address', Object.keys(T).filter((k) => k.startsWith('adr:'))], ['Other', ['bday', 'date', 'date:anniversary', 'related', 'social', 'im', 'notes', 'groups', 'fav', 'label']]];
    const sels = []; const colsBox = el('table'); const count = el('.lead'); const presetSel = el('select.zk-select', [['', 'Auto-detect'], ['google', 'Google Contacts'], ['outlook', 'Outlook'], ['generic', 'Generic']].map(([v, n]) => el('option', { value: v, selected: v === '' }, n)));
    const hdrChk = el('input.zk-check', { type: 'checkbox', checked: header }); const mk = (i) => { const s = el('select.zk-select', { 'aria-label': 'Field for column ' + (i + 1) }); groupsDef.forEach(([g, ks]) => { const o = ks.map((k) => el('option', { value: k, selected: mapping[i] === k }, T[k] || k)); if (g) s.append(el('optgroup', { label: g }, o)); else s.append(...o); }); s.onchange = () => { mapping[i] = s.value; upd(); }; return s; };
    const head = (i) => (header ? rows[0][i] || `Column ${i + 1}` : `Column ${i + 1}`); const sample = (i) => { for (let r = header ? 1 : 0; r < Math.min(rows.length, 6); r++) if ((rows[r][i] || '').trim()) return rows[r][i].replace(/\s+/g, ' '); return ''; };
    const build = () => { sels.length = 0; colsBox.replaceChildren(el('thead', el('tr', el('th', 'Column in file'), el('th', 'Example'), el('th', 'Import as'))), el('tbody', rows[0].map((_, i) => { const s = mk(i); sels.push(s); return el('tr', el('td', { title: head(i) }, head(i)), el('td', { title: sample(i), style: { color: 'var(--fg-2)' } }, sample(i)), el('td', s)); }))); upd(); };
    const upd = () => { const n = CSV.toContacts(rows, mapping, { header }).length; count.textContent = `${n.toLocaleString()} contact${n === 1 ? '' : 's'} will be imported from ${(rows.length - (header ? 1 : 0)).toLocaleString()} rows.`; };
    presetSel.onchange = () => { preset = presetSel.value || CSV.detectPreset(rows[0]); mapping = CSV.autoMap(rows[0], preset); build(); };
    hdrChk.onchange = () => { header = hdrChk.checked; build(); };
    const body = dl('', el('.opt', el('span', 'Preset'), presetSel), el('label.opt', el('span', 'First row contains column titles'), hdrChk), el('.rows', { style: { maxHeight: '38vh' } }, colsBox), count); build();
    const r = await zk.sheet({ title: 'Import CSV: ' + name, message: `Detected format: ${{ google: 'Google Contacts', outlook: 'Outlook', generic: 'generic' }[preset]}. Check how each column should be imported.`, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Import', primary: true, value: 'ok' }], width: 640 });
    if (r !== 'ok') return; const list = CSV.toContacts(rows, mapping, { header }); if (!list.length) return zk.alert('Nothing to import', 'No rows produced a contact. Check the column choices.');
    await ZC.importParsed(list, name);
  };

  // ---------- backup / restore ----------
  ZC.backup = async () => {
    if (!S.contacts.length && !S.groups.length) return zk.alert('Nothing to back up', 'Your address book is empty.');
    const enc = (s) => fflate.strToU8(s); const book = { format: 'zcontacts', version: 1, created: new Date().toISOString(), contacts: S.contacts, groups: S.groups };
    const zip = fflate.zipSync({ 'manifest.json': enc(JSON.stringify({ format: 'zcontacts', version: 1, app: 'ZengPeople', created: book.created, contacts: S.contacts.length, groups: S.groups.length })), 'contacts.json': enc(JSON.stringify(book)), 'contacts.vcf': enc(ZC.toVcf(S.contacts, '3.0')) });
    const h = await zeng.files.saveAs(zip, { name: 'People ' + new Date().toISOString().slice(0, 10) + '.zcontacts', filters: [{ name: 'People Backup', exts: ['zcontacts'] }] }); if (h) zk.toast('Backup saved');
  };
  ZC.restoreDialog = async () => { const hs = await zeng.files.open({ filters: [{ name: 'People Backup', exts: ['zcontacts'] }] }); if (hs[0]) { try { await ZC.restoreBackup(await zeng.files.read(hs[0]), hs[0].name); } catch (e) { zk.alert('Can’t restore', e.message); } } };
  ZC.restoreBackup = async (buf, name) => {
    let files; try { files = fflate.unzipSync(new Uint8Array(buf)); } catch { throw new Error('This is not a valid .zcontacts backup.'); }
    let contacts, groups = [];
    if (files['contacts.json']) { const j = JSON.parse(fflate.strFromU8(files['contacts.json'])); if (!Array.isArray(j.contacts)) throw new Error('The backup is missing its contact list.'); contacts = j.contacts.map((o) => M.sanitize(o)); groups = (j.groups || []).filter((g) => g && g.name).map((g) => ({ id: String(g.id), name: g.name, ...(g.smart ? { smart: true, match: g.match, rules: g.rules || [] } : {}) })); }
    else if (files['contacts.vcf']) { contacts = V.parse(files['contacts.vcf']).contacts.map((o) => M.sanitize({ ...o, id: undefined })); } else throw new Error('The backup has no contacts in it.');
    const r = await zk.sheet({ title: `Restore “${name}”?`, message: `${contacts.length} contact${contacts.length === 1 ? '' : 's'} and ${groups.length} group${groups.length === 1 ? '' : 's'} in this backup. You can undo this.`, buttons: [{ label: 'Cancel', value: null }, { label: 'Add to Existing', value: 'add' }, { label: 'Replace Everything', primary: true, danger: true, value: 'replace' }] });
    if (!r) return;
    if (r === 'replace') ZC.mutate('Restore Backup', () => { S.contacts = contacts; S.groups = groups; });
    else { const have = new Set(S.contacts.map(sigOf)); const gmap = {}; const add = []; for (const g of groups) { const ex = S.groups.find((x) => x.name === g.name && !!x.smart === !!g.smart); gmap[g.id] = ex ? ex.id : g.id; if (!ex) add.push(g); } const ids = new Set(S.contacts.map((c) => c.id)); const nc = contacts.filter((c) => !have.has(sigOf(c))).map((c) => ({ ...c, id: ids.has(c.id) ? M.uid() : c.id, groups: c.groups.map((x) => gmap[x] || x) })); ZC.mutate('Restore Backup', () => { S.groups = S.groups.concat(add); S.contacts = S.contacts.concat(nc); }); }
    ZC.setView('all'); zk.toast('Restored from backup');
  };

  // ---------- duplicates & merge ----------
  ZC.mergeSelected = () => { const l = ZC.selected(); if (l.length > 1) return ZC.mergeDialog(l); zk.toast('Select two or more contacts to merge'); };
  const labelOfField = { prefix: 'Prefix', first: 'First name', middle: 'Middle name', last: 'Last name', suffix: 'Suffix', nick: 'Nickname', pFirst: 'Phonetic first', pLast: 'Phonetic last', org: 'Company', dept: 'Department', title: 'Job title', bday: 'Birthday', photo: 'Photo' };
  ZC.mergeDialog = async (list) => {
    const conf = M.mergeConflicts(list); const choice = {}; const body = dl('');
    const merged0 = M.mergeContacts(list);
    body.append(el('.lead', `Merging ${list.length} contacts. Phone numbers, emails, addresses and other fields are combined; duplicates are removed.`));
    body.append(el('.cluster', el('.people', list.map((c) => el('.person', ZC.avatar(c, 24), ZC.name(c))))));
    if (conf.length) body.append(el('.lead', { style: { fontWeight: 600, color: 'var(--fg)' } }, 'These fields differ. Choose which to keep:'));
    for (const cf of conf) {
      const name = 'c-' + cf.field; choice[cf.field] = cf.values[0]; const g = el('.conf', el('.name', labelOfField[cf.field] || cf.field));
      cf.values.forEach((v, i) => { const r = el('input.zk-radio', { type: 'radio', name, checked: i === 0 }); r.onchange = () => (choice[cf.field] = v); g.append(el('label', r, cf.field === 'photo' ? ZC.avatar({ photo: v, id: 'x' }, 40) : cf.field === 'bday' ? M.fmtDate(v) : v)); });
      body.append(g);
    }
    const sum = [['phones', 'phone'], ['emails', 'email'], ['addrs', 'address'], ['urls', 'website']].map(([k, n]) => merged0[k].length && `${merged0[k].length} ${n}${merged0[k].length > 1 ? (n === 'address' ? 'es' : 's') : ''}`).filter(Boolean).join(', ');
    body.append(el('.lead', 'Result will have: ' + (sum || 'no contact details') + (list.some((c) => c.notes) ? ', combined notes.' : '.')));
    const r = await zk.sheet({ title: 'Merge Contacts', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Merge', primary: true, value: 'ok' }], width: 480 });
    if (r !== 'ok') return false; return ZC.doMerge(list, choice);
  };
  ZC.doMerge = (list, choice) => {
    const m = M.mergeContacts(list, choice); const gone = new Set(list.map((c) => c.id)); gone.delete(m.id);
    ZC.mutate('Merge Contacts', () => { S.contacts = S.contacts.filter((c) => !gone.has(c.id)).map((c) => (c.id === m.id ? m : c)); S.sel = new Set([m.id]); S.cur = S.anchor = m.id; });
    S._rows = null; ZC.renderAll(); ZC.ensureVisible(m.id); return true;
  };
  ZC.dupesDialog = async () => {
    for (;;) {
      const clusters = M.findDuplicates(S.contacts);
      if (!clusters.length) return zk.sheet({ title: 'No Duplicates Found', message: 'No contacts share a name, email address or phone number.' });
      const rows = el('.rows', clusters.map((cl, i) => el('.cluster', el('.people', cl.contacts.map((c) => el('.person', ZC.avatar(c, 24), el('span', ZC.name(c), c.org && !c.isOrg ? ' · ' + c.org : '')))), el('.why', cl.reasons.join(', ')), el('div', el('button.zk-btn.bordered', { type: 'button', onclick: (e) => sheetOf(e).close({ merge: i }) }, 'Review & Merge…')))));
      const auto = clusters.filter((cl) => !M.mergeConflicts(cl.contacts).length);
      const r = await zk.sheet({ title: `${clusters.length} Possible Duplicate Set${clusters.length > 1 ? 's' : ''}`, body: dl('', el('.lead', 'Contacts that share a name, email address or phone number.'), rows), buttons: [{ label: 'Close', value: null }, ...(auto.length ? [{ label: `Merge ${auto.length} Without Conflicts`, primary: true, value: 'auto' }] : [])], width: 520 });
      if (r === 'auto') { ZC.mutate('Merge Duplicates', () => { const gone = new Set(), rep = new Map(); for (const cl of auto) { const m = M.mergeContacts(cl.contacts); rep.set(m.id, m); cl.contacts.forEach((c) => c.id !== m.id && gone.add(c.id)); } S.contacts = S.contacts.filter((c) => !gone.has(c.id)).map((c) => rep.get(c.id) || c); S.sel = new Set(); S.cur = null; }); S._rows = null; ZC.renderAll(); ZC.undoToast(`Merged ${auto.length} duplicate set${auto.length > 1 ? 's' : ''}`); continue; }
      if (r && typeof r.merge === 'number') { await ZC.mergeDialog(clusters[r.merge].contacts); continue; }
      return;
    }
  };

  // ---------- cleanup suggestions ----------
  ZC.cleanupDialog = async () => {
    const found = S.contacts.map((c) => [c, M.findIssues(c)]).filter(([, i]) => i.length); const empties = found.filter(([, i]) => i.some((x) => x.k === 'empty'));
    if (!found.length) return zk.sheet({ title: 'Everything Looks Good', message: 'No missing or invalid data was found.' });
    const rows = el('.rows', found.slice(0, 300).map(([c, iss]) => { const r = el('.issue', { role: 'button', tabindex: 0 }, ZC.avatar(c, 24), el('.t', el('b', ZC.name(c)), ' — ', iss.map((i) => i.t).join('; '))); r.onclick = (e) => sheetOf(e).close({ go: c.id }); return r; }));
    const r = await zk.sheet({ title: 'Clean Up', body: dl('', el('.lead', `${found.length} contact${found.length > 1 ? 's have' : ' has'} missing or suspicious data. Click one to open it.`), rows), buttons: [{ label: 'Close', value: null }, ...(empties.length ? [{ label: `Delete ${empties.length} Empty Card${empties.length > 1 ? 's' : ''}`, danger: true, value: 'del' }] : [])], width: 520 });
    if (r === 'del') { ZC.remove(empties.map(([c]) => c.id), 'Delete Empty Cards'); ZC.undoToast(`Deleted ${empties.length} empty card${empties.length > 1 ? 's' : ''}`); }
    else if (r && r.go) { ZC.setView('all'); ZC.select([r.go], r.go); }
  };

  // ---------- smart groups ----------
  ZC.smartDialog = async (g) => {
    const def = g ? JSON.parse(JSON.stringify(g)) : { name: '', match: 'all', rules: [{ f: 'org', op: 'contains', v: '' }] }; const box = el('.rows', { style: { gap: '6px' } }); const count = el('.lead');
    const nameIn = el('input.zk-input.selectable', { value: def.name, placeholder: 'Smart group name', style: { width: '100%', height: '30px' } });
    const matchSel = el('select.zk-select', [['all', 'all'], ['any', 'any']].map(([v, n]) => el('option', { value: v, selected: def.match === v }, n))); matchSel.onchange = () => { def.match = matchSel.value; upd(); };
    const upd = () => { const t = { ...def, smart: true }; count.textContent = `${S.contacts.filter((c) => M.smartMatch(c, t)).length} matching contact(s) right now`; };
    const draw = () => {
      box.replaceChildren(...def.rules.map((r, i) => {
        const f = el('select.zk-select', Object.entries(M.FIELDS).map(([k, v]) => el('option', { value: k, selected: r.f === k }, v.label))); const ops = M.opsFor(r.f);
        const o = el('select.zk-select', ops.map((x) => el('option', { value: x, selected: r.op === x }, x))); let v = null;
        const needsVal = !['is set', 'is not set', 'this month', 'next month', 'is today', 'is favourite', 'is not favourite', 'has photo', 'has no photo'].includes(r.op);
        if (r.f === 'group') { v = el('select.zk-select', S.groups.filter((x) => !x.smart).map((x) => el('option', { value: x.id, selected: r.v === x.id }, x.name))); if (!r.v && v.value) r.v = v.value; } else if (needsVal) v = el('input.zk-input.selectable', { value: r.v || '', placeholder: ['in next days', 'in last days', 'before days ago'].includes(r.op) ? 'days' : 'value', type: ['in next days', 'in last days', 'before days ago'].includes(r.op) ? 'number' : 'text' });
        f.onchange = () => { r.f = f.value; r.op = M.opsFor(r.f)[0]; r.v = ''; draw(); }; o.onchange = () => { r.op = o.value; draw(); }; if (v) { v.oninput = () => { r.v = v.value; upd(); }; v.onchange = v.oninput; }
        const rm = zk.btn({ icon: 'minus-circle', title: 'Remove rule', onClick: () => { def.rules.splice(i, 1); if (!def.rules.length) def.rules.push({ f: 'org', op: 'contains', v: '' }); draw(); } });
        return el('.rule', f, o, v, rm);
      }), el('div', zk.btn({ icon: 'plus', label: 'Add Rule', cls: 'bordered', onClick: () => { def.rules.push({ f: 'name', op: 'contains', v: '' }); draw(); } }))); upd();
    };
    draw();
    const r = await zk.sheet({ title: g ? 'Edit Smart Group' : 'New Smart Group', body: dl('', el('.lead', 'Contacts that match these rules appear in this group automatically. Example: Company contains Acme, or Birthday is this month.'), nameIn, el('.opt', { style: { justifyContent: 'flex-start' } }, el('span', 'Contacts match'), matchSel, el('span', 'of the following rules')), box, count), buttons: [{ label: 'Cancel', value: null }, { label: g ? 'Save' : 'Create', primary: true, value: 'ok', onClick: () => { if (!nameIn.value.trim()) { nameIn.focus(); return false; } } }], width: 560 });
    if (r !== 'ok') return; const rules = def.rules.filter((x) => x.f); const ng = { id: g ? g.id : zk.uid(), name: nameIn.value.trim(), smart: true, match: def.match, rules };
    ZC.mutate(g ? 'Edit Smart Group' : 'New Smart Group', () => { S.groups = g ? S.groups.map((x) => (x.id === g.id ? ng : x)) : [...S.groups, ng]; }); ZC.setView(ng.id);
  };

  // ---------- history ----------
  ZC.historyDialog = async () => {
    const list = S.undo.slice().reverse(); const rows = el('.rows', list.length ? list.map((s, i) => { const r = el('.issue', { role: 'button', tabindex: 0 }, el('.t', el('b', s.label), ' · ', rel(s.t)), el('span.lead', i === 0 ? 'latest' : 'Undo to here')); r.onclick = (e) => sheetOf(e).close({ n: i + 1 }); return r; }) : [el('.lead', 'No changes yet this session.')]);
    const r = await zk.sheet({ title: 'Change History', body: dl('', el('.lead', 'Every change this session can be undone. Click an entry to undo back to before it.'), rows), buttons: [{ label: 'Close', primary: true, value: null }], width: 460 });
    if (r && r.n) ZC.undoTo(r.n);
  };

  // ---------- relationship rhythm ----------
  ZC.actionToast = (text, label, fn) => {
    document.querySelectorAll('.undo-toast').forEach((t) => t.remove());
    const b = el('button', { type: 'button', onclick: () => { fn(); t.remove(); } }, label); const t = el('.undo-toast', { role: 'status' }, text, b); document.body.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 7000);
  };
  ZC.quickLog = (c, note) => { ZC.update([c.id], 'Log Catch-up', (x) => M.logCatchup(x, note || '', '')); };
  ZC.quickAction = (c, act) => {
    if (!c) return;
    if (act === 'mail' && c.emails[0]) { ZC.openUrl('mailto:' + c.emails[0].v); ZC.actionToast('Opened email to ' + ZC.name(c), 'Log catch-up', () => ZC.quickLog(c)); }
    else if (act === 'phone' && c.phones[0]) { ZC.openUrl('tel:' + c.phones[0].v.replace(/[^\d+#*,;]/g, '')); ZC.actionToast('Calling ' + ZC.name(c), 'Log catch-up', () => ZC.quickLog(c)); }
    else if (act === 'check') { ZC.quickLog(c); ZC.undoToast('Caught up with ' + ZC.name(c)); }
  };
  ZC.catchupDialog = async (c, kind) => {
    const isNote = kind === 'note'; const date = el('input.zk-input.selectable', { type: 'date', value: M.dateStr(Date.now()), max: M.dateStr(Date.now()), 'aria-label': 'Date' }); const note = el('textarea.zk-textarea.selectable', { rows: 4, placeholder: isNote ? 'What do you want to remember?' : 'What did you talk about? (optional)', style: { width: '100%' }, 'aria-label': 'Note' });
    const r = await zk.sheet({ title: (isNote ? 'Add Note for ' : 'Catch Up with ') + ZC.name(c), body: dl('', ...(isNote ? [] : [el('.opt', el('span', 'Date'), date)]), note), buttons: [{ label: 'Cancel', value: null }, { label: isNote ? 'Add Note' : 'Log Catch-up', primary: true, value: 'ok', onClick: () => { if (isNote && !note.value.trim()) { note.focus(); return false; } } }], width: 440 });
    if (r !== 'ok') return; ZC.update([c.id], isNote ? 'Add Note' : 'Log Catch-up', (x) => M.logCatchup(x, note.value, isNote ? '' : date.value || '', isNote ? 'note' : 'catchup'));
  };
  ZC.rhythmDialog = async (c) => {
    const on = el('input.zk-switch', { type: 'checkbox', checked: !!c.cad, 'aria-label': 'Remind me' }); const n = el('input.zk-input.num.selectable', { type: 'number', min: 1, max: 999, value: c.cad ? c.cad.n : 2, 'aria-label': 'Every' });
    const u = el('select.zk-select', ['day', 'week', 'month', 'year'].map((x) => el('option', { value: x, selected: (c.cad ? c.cad.u : 'month') === x }, x + 's'))); const last = el('input.zk-input.selectable', { type: 'date', value: c.lc || '', max: M.dateStr(Date.now()), 'aria-label': 'Last caught up' });
    const presets = el('.seg2', [['Weekly', 1, 'week'], ['Monthly', 1, 'month'], ['Every 2 months', 2, 'month'], ['Quarterly', 3, 'month'], ['Yearly', 1, 'year']].map(([l, a, b]) => el('button.zk-btn.bordered', { type: 'button', onclick: () => { on.checked = true; n.value = a; u.value = b; } }, l)));
    const r = await zk.sheet({ title: 'Rhythm for ' + ZC.name(c), body: dl('', el('.lead', 'How often do you want to be in touch? People who are due appear in Catch up.'), el('label.opt', el('span', 'Remind me to catch up'), on), el('.opt', el('span', 'Every'), el('span', { style: { display: 'flex', gap: '6px' } }, n, u)), presets, el('.opt', el('span', 'Last caught up'), last)), buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: 'ok' }], width: 460 });
    if (r !== 'ok') return; const cad = on.checked && +n.value >= 1 ? { n: Math.min(999, Math.round(+n.value)), u: u.value } : null;
    ZC.update([c.id], 'Change Rhythm', (x) => ({ ...x, cad, lc: /^\d{4}-\d\d-\d\d$/.test(last.value) ? last.value : '' }));
  };
})();
