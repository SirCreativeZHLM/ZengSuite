/* ZengNotes import / export / backup / print. */
(() => {
  const U = N.u, CV = N.cv, Db = N.db, A = N.app, S = A.S; const io = (N.io = {});
  const M = () => Db.idx.notes;
  const IMPORT_EXT = new Set(['md', 'markdown', 'mdown', 'txt', 'text', 'html', 'htm', 'enex', 'json', 'docx', 'zip', 'znotes']);
  const IMG_EXT = /^(png|jpe?g|gif|webp|svg|bmp)$/;

  function progress(text) {
    const t = zk.el('.zk-toast', { role: 'status', style: { bottom: '40px' } }, text); document.body.append(t);
    return { set: (x) => { t.textContent = x; }, done: (msg, ms = 2200) => { t.textContent = msg || ''; if (!msg) return t.remove(); setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = 0; setTimeout(() => t.remove(), 260); }, ms); } };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ------------------------------------------------------------ saving drafts as notes
  const folderChain = (names, parent) => { // ensure nested folders exist, returns id
    let p = parent || null;
    for (const nm of names) { let f = Db.idx.folders.find((x) => (x.p || null) === p && x.name === nm); if (!f) { f = { id: 'f' + U.uid(), name: nm, p }; Db.idx.folders.push(f); } p = f.id; }
    return p;
  };
  io.ensureFolder = folderChain;
  async function thumbFor(id, files) {
    const f = (files || []).find((x) => U.isImage(x.type) && x.type !== 'image/svg+xml' && x.type !== 'image/heic'); if (!f) return false;
    try { const url = URL.createObjectURL(new Blob([f.bytes], { type: f.type })); const im = await U.loadImage(url); const th = U.thumbFrom(im); URL.revokeObjectURL(url); if (th) { await Db.setThumb(id, th); A.thumbCache.set(id, th); return true; } } catch {} return false;
  }
  io.saveDraft = async (d, folderId, opts = {}) => {
    const now = Date.now(); let html = d.html || '<p><br></p>';
    if (d.tags && d.tags.length) { const text = CV.textOfHtml(html).toLowerCase(); const miss = d.tags.filter((t) => !text.includes('#' + t.toLowerCase())); if (miss.length) html += `<p>${miss.map((t) => '#' + U.esc(t.replace(/\s+/g, '-'))).join(' ')}</p>`; }
    const rec = A.blankRec({ title: d.title || '', html, c: d.created || d.modified || now, m: d.modified || d.created || now });
    for (const f of d.files || []) { await Db.putAtt(f.id, f.bytes, { name: f.name, type: f.type }); rec.atts.push(f.id); }
    const dv = A.deriveFromHtml(html, rec.title); const meta = A.newMeta(rec, { f: folderId || null, p: d.pinned ? 1 : 0, d: d.trashed ? now : 0 });
    Object.assign(meta, { t: dv.t, s: dv.s, tg: dv.tags, ck: dv.ck, na: rec.atts.length, ln: dv.ln, th: 0 });
    if (await thumbFor(rec.id, d.files)) { meta.th = 1; rec.tid = (d.files.find((x) => U.isImage(x.type)) || {}).id; }
    const ft = (rec.title + '\n' + dv.text + '\n' + dv.tags.map((t) => '#' + t).join(' ')).slice(0, 40000); Db.put(rec, meta, ft); A.setLow(rec.id, ft); return rec.id;
  };

  // ------------------------------------------------------------ sources (handles, folders, zip entries)
  const isDir = async (h) => { if (!h.path || !zeng.isNative) return false; try { await zeng.files.listDir(h.path); return true; } catch { return false; } };
  async function walkDir(path, rel = '', out = []) { const ents = await zeng.files.listDir(path); for (const e of ents) { if (e.name.startsWith('.')) continue; const r = rel ? rel + '/' + e.name : e.name; if (e.dir) await walkDir(e.path, r, out); else out.push({ rel: r, name: e.name, size: e.size, read: async () => U.readHandle({ path: e.path, name: e.name }) }); } return out; }
  const fromHandle = (h) => ({ rel: h.name, name: h.name, size: h.size || 0, read: () => U.readHandle(h) });
  const fromZip = (bytes) => { const z = fflate.unzipSync(bytes); return Object.keys(z).filter((k) => !k.endsWith('/') && !/(^|\/)(\.|__MACOSX)/.test(k)).map((k) => ({ rel: k, name: k.split('/').pop(), size: z[k].length, read: async () => z[k] })); };
  async function expand(handles) {
    const out = []; for (const h of handles) { if (await isDir(h)) { const base = h.name; const files = await walkDir(h.path); files.forEach((f) => (f.rel = base + '/' + f.rel)); out.push(...files); } else out.push(fromHandle(h)); } return out;
  }

  // ------------------------------------------------------------ the importer
  io.importSources = async (srcs, { destFolder = null, label } = {}) => {
    srcs = srcs.filter((s) => !/(^|\/)(\.|__MACOSX|Thumbs\.db)/.test(s.rel)); const prog = progress('Reading files…'); let n = 0, failed = [], firstId = null, lastFolder = destFolder;
    try {
      // zip files expand in place
      const expanded = [];
      for (const s of srcs) { if (U.ext(s.name) === 'zip') { try { const bytes = await s.read(); const inner = fromZip(bytes); if (inner.some((x) => x.name === 'library.json')) { prog.done(); return io.restoreBytes(bytes, s.name); } const base = U.base(s.name); inner.forEach((x) => (x.rel = base + '/' + x.rel)); expanded.push(...inner); } catch (e) { failed.push(s.name + ': ' + e.message); } } else expanded.push(s); }
      srcs = expanded; const index = new Map(); srcs.forEach((s) => { index.set(s.rel.toLowerCase(), s); if (!index.has(s.name.toLowerCase())) index.set(s.name.toLowerCase(), s); });
      const texts = srcs.filter((s) => IMPORT_EXT.has(U.ext(s.name)) && U.ext(s.name) !== 'zip' && U.ext(s.name) !== 'znotes');
      const hasDirs = texts.some((s) => s.rel.includes('/')); let total = texts.length, done = 0;
      const resolverFor = async (src, refs) => {
        const dir = src.rel.includes('/') ? src.rel.slice(0, src.rel.lastIndexOf('/') + 1) : ''; const cache = new Map();
        for (const r0 of refs) { if (/^(https?:|data:|mailto:|#)/i.test(r0)) continue; let r = r0; try { r = decodeURIComponent(r0.split(/[?#]/)[0]); } catch {} r = r.replace(/^\.\//, '').replace(/^\//, ''); const parts = (dir + r).split('/'); const norm = []; for (const p of parts) { if (p === '..') norm.pop(); else if (p && p !== '.') norm.push(p); } const key = norm.join('/').toLowerCase(); const hit = index.get(key) || index.get(r.split('/').pop().toLowerCase()); if (hit) { try { const bytes = await hit.read(); cache.set(r0, { name: hit.name, type: U.mimeOf(hit.name), bytes, key: key }); } catch {} } }
        return (src2) => cache.get(src2) || null;
      };
      for (const s of texts) {
        const ext = U.ext(s.name); const relDirs = s.rel.includes('/') ? s.rel.split('/').slice(0, -1) : []; let fid = destFolder;
        prog.set(`Importing ${++done} of ${total}… ${s.name}`); await tick();
        try {
          let drafts = []; const bytes = await s.read(); const dec = () => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
          if (ext === 'md' || ext === 'markdown' || ext === 'mdown') { const t = dec(); const refs = [...t.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].map((m) => m[1]).concat([...t.matchAll(/<img[^>]+src=["']([^"']+)/gi)].map((m) => m[1])); const res = await resolverFor(s, refs); drafts = [CV.importMarkdown(t, s.name, res)]; }
          else if (ext === 'txt' || ext === 'text') drafts = [CV.importText(dec(), s.name)];
          else if (ext === 'html' || ext === 'htm') { const t = dec(); const refs = [...t.matchAll(/<img[^>]+src=["']([^"']+)/gi)].map((m) => m[1]); const res = await resolverFor(s, refs); drafts = [CV.importHtml(t, s.name, res)]; }
          else if (ext === 'docx') drafts = [CV.importDocx(bytes, s.name)];
          else if (ext === 'enex') { drafts = CV.importEnex(dec()); fid = folderChain([U.base(s.name)], destFolder); }
          else if (ext === 'json') { let j; try { j = JSON.parse(dec()); } catch { throw new Error('not valid JSON'); } const dirOf = s.rel.includes('/') ? s.rel.slice(0, s.rel.lastIndexOf('/') + 1) : ''; const lookup = (p) => { const hit = index.get((dirOf + p).toLowerCase()) || index.get(p.toLowerCase()); return hit && hit._bytes ? { name: hit.name, type: U.mimeOf(hit.name), bytes: hit._bytes, key: hit.rel } : null; };
            // preload attachments referenced by this note
            for (const a of j.attachments || []) { const hit = index.get((dirOf + (a.filePath || '')).toLowerCase()) || index.get((a.filePath || '').toLowerCase()); if (hit && !hit._bytes) hit._bytes = await hit.read(); }
            drafts = [CV.importKeep(j, lookup)]; fid = folderChain(['Imported Takeout'], destFolder); }
          if (relDirs.length && hasDirs) fid = folderChain(relDirs, destFolder);
          for (const d of drafts) { if (d.archived) d.pinned = false; const id = await io.saveDraft(d, fid); firstId = firstId || id; n++; lastFolder = fid; if (n % 20 === 0) { await Db.flush(); A.refresh(); } }
        } catch (e) { console.error(e); failed.push(s.name + ': ' + (e.message || e)); }
      }
      await Db.flush(); A.refresh(); if (firstId) { const m = M()[firstId]; if (m && (m.d || S.view.kind === 'tag')) await A.setView({ kind: 'smart', id: 'all' }); await A.selectIds([firstId]); A.scrollToId(firstId); }
      prog.done(n ? `Imported ${n} note${n === 1 ? '' : 's'}` : 'Nothing to import');
      if (failed.length) zk.alert(`${failed.length} file${failed.length === 1 ? '' : 's'} couldn’t be imported`, failed.slice(0, 8).join('\n') + (failed.length > 8 ? '\n…' : ''));
      if (!n && !failed.length) zk.alert('Nothing to import', 'No Markdown, text, HTML, Word, ENEX or Takeout JSON files were found.');
    } catch (e) { prog.done(); console.error(e); zk.alert('Import failed', e.message || String(e)); }
    return n;
  };
  const currentFolder = () => (S.view.kind === 'folder' && S.view.id !== '__notes' ? S.view.id : null);
  io.importFiles = async (exts) => {
    const list = exts || ['md', 'markdown', 'txt', 'html', 'htm'];
    const filters = [{ name: 'Notes', exts: exts ? list : [...list, 'enex', 'docx', 'json', 'zip'] }]; const hs = await zeng.files.open({ filters, multiple: true }); if (!hs.length) return;
    let srcs = []; for (const h of hs) srcs.push(...(await expand([h]))); // images beside markdown files can't be picked implicitly; users can import the folder instead
    // include sibling images the user also selected
    await io.importSources(srcs, { destFolder: currentFolder() });
  };
  io.importFolder = async () => {
    if (zeng.isNative) { const hs = await zeng.files.open({ folder: true }); if (!hs.length) return; const srcs = await expand(hs); const base = hs[0].name; srcs.forEach((s) => (s.rel = s.rel)); await io.importSources(srcs, { destFolder: currentFolder() }); return; }
    const inp = zk.el('input', { type: 'file', multiple: true, webkitdirectory: true }); inp.onchange = async () => { const files = [...inp.files]; if (!files.length) return; const srcs = files.map((f) => ({ rel: f.webkitRelativePath || f.name, name: f.name, size: f.size, read: async () => new Uint8Array(await f.arrayBuffer()) })); await io.importSources(srcs, { destFolder: currentFolder() }); }; inp.click();
  };
  io.handleDrop = async (hs) => {
    if (!hs || !hs.length) return; const srcs = []; let attachOnly = true;
    for (const h of hs) { if (await isDir(h)) { attachOnly = false; } else if (IMPORT_EXT.has(U.ext(h.name))) attachOnly = false; }
    if (attachOnly) { if (S.editing && !(M()[S.cur] || {}).d) { N.ed.attachFiles(await Promise.all(hs.map(async (h) => ({ name: h.name, type: U.mimeOf(h.name), bytes: await U.readHandle(h) })))); } else zk.toast('Open a note to attach files', 1800); return; }
    const srcs2 = await expand(hs); if (srcs2.length === 1 && U.ext(srcs2[0].name) === 'znotes') return io.restoreBytes(await srcs2[0].read(), srcs2[0].name);
    await io.importSources(srcs2, { destFolder: currentFolder() });
  };

  // ------------------------------------------------------------ exporting
  async function fullNote(id) {
    const meta = M()[id]; if (!meta) return null; if (S.editing && id === S.cur) await A.saveNow(); const rec = await Db.loadNote(id); if (!rec) return null; let html = rec.html, key = null;
    if (rec.lock) { key = S.keys.get(id); if (!key) { const pw = await A.askPassword({ title: 'Enter Password', message: '“' + (meta.t || 'Locked note') + '” is locked. Unlock it to export.', ok: 'Unlock', verify: async (p) => { const r = await N.crypto.open(rec.lock, p).catch(() => null); if (!r) throw new Error('That password is incorrect.'); key = r.key; S.keys.set(id, r.key); } }); if (pw == null) return null; } html = (await N.crypto.openWithKey(rec.lock, key)).html; }
    return { id, meta, rec, html, key, title: rec.title || meta.t || 'Untitled' };
  }
  const uniq = (set, name) => { let n = name, i = 2; const ext = U.ext(name) ? '.' + U.ext(name) : '', base = ext ? name.slice(0, -ext.length) : name; while (set.has(n.toLowerCase())) n = `${base} ${i++}${ext}`; set.add(n.toLowerCase()); return n; };
  // returns {doc, files:[{path,bytes}], map: Map(el->path)}
  async function gather(note, dirPrefix, used) {
    const doc = new DOMParser().parseFromString(note.html, 'text/html'); const files = [], map = new Map(); let k = 0;
    for (const el of doc.body.querySelectorAll('.att[data-att], .sketch')) {
      try {
        if (el.classList.contains('sketch')) { const strokes = N.sketch.strokesOf(el); if (!strokes.length) { map.set(el, null); continue; } const bytes = await N.sketch.renderPNG(strokes, +el.dataset.h || 320); const nm = uniq(used, `Sketch ${++k}.png`); files.push({ path: dirPrefix + nm, bytes, type: 'image/png' }); map.set(el, dirPrefix + nm); continue; }
        const r = await Db.getAtt(el.dataset.att, note.key); if (!r || !r.bytes) { map.set(el, null); continue; } const nm = uniq(used, U.safeName(el.dataset.name || r.meta.name || 'attachment')); files.push({ path: dirPrefix + nm, bytes: r.bytes, type: r.meta.type }); map.set(el, dirPrefix + nm);
      } catch { map.set(el, null); }
    }
    return { doc, files, map };
  }
  const toDataUrl = (bytes, type) => `data:${type || 'application/octet-stream'};base64,${U.b64(bytes)}`;
  async function render(note, fmt, used, attDir) {
    const g = await gather(note, attDir, used); const body = g.doc.body;
    if (fmt === 'md') { const md = CV.toMd(body, { att: (el) => { const p = g.map.get(el); return p ? p : null; } }); return { text: `# ${note.title}\n\n` + md, files: g.files }; }
    if (fmt === 'txt') return { text: note.title + '\n' + '='.repeat(Math.min(60, note.title.length)) + '\n\n' + CV.toText(body), files: [] };
    const byPath = new Map(g.files.map((f) => [f.path, f])); return { text: CV.toHtmlDoc(note.title, body.innerHTML.replace(/​/g, ''), { dataUrl: (el) => { const p = g.map.get(el); const f = p && byPath.get(p); return f ? toDataUrl(f.bytes, f.type) : ''; }, linkFiles: true }), files: [] };
  }
  const EXT = { md: 'md', html: 'html', txt: 'txt' };
  async function saveBlobOrZip(name, data, filterName, exts) { const h = await zeng.files.saveAs(data, { name, filters: [{ name: filterName, exts }] }); if (h) zk.toast('Exported ' + h.name); return h; }
  io.exportNotes = async (ids, fmt) => {
    ids = ids && ids.length ? ids : S.cur ? [S.cur] : []; ids = ids.filter((i) => M()[i]); if (!ids.length) return; const prog = progress('Exporting…');
    try {
      const used = new Set(); const zip = {}; const names = new Set(); let skipped = 0; const rendered = [];
      for (const id of ids) { const note = await fullNote(id); if (!note) { skipped++; continue; } const r = await render(note, fmt, used, ids.length > 1 ? 'attachments/' : 'attachments/'); rendered.push({ note, r }); }
      if (!rendered.length) { prog.done(); return; }
      const needZip = rendered.length > 1 || rendered.some((x) => x.r.files.length);
      if (!needZip) { const { note, r } = rendered[0]; prog.done(); await saveBlobOrZip(U.safeName(note.title) + '.' + EXT[fmt], r.text, fmt.toUpperCase(), [EXT[fmt]]); return; }
      for (const { note, r } of rendered) { zip[uniq(names, U.safeName(note.title) + '.' + EXT[fmt])] = fflate.strToU8(r.text); for (const f of r.files) zip[f.path] = f.bytes; }
      const keys = Object.keys(zip); const single = rendered.length === 1; const root = single ? U.safeName(rendered[0].note.title) : 'ZengNotes Export'; const out = {}; for (const k of keys) out[root + '/' + k] = zip[k];
      const data = fflate.zipSync(out, { level: 1 }); prog.done(); await saveBlobOrZip(root + '.zip', data, 'Zip archive', ['zip']);
      if (skipped) zk.toast(skipped + ' locked note(s) skipped', 2500);
    } catch (e) { prog.done(); console.error(e); zk.alert('Export failed', e.message || String(e)); }
  };
  async function exportMany(list, zipName, rootName) {
    const prog = progress('Exporting…'); try {
      const out = {}; const dirNames = new Map(); let n = 0, skipped = 0; const used = new Set();
      for (const m of list) {
        if (m.l && !S.keys.has(m.id)) { skipped++; continue; } const note = await fullNote(m.id); if (!note) { skipped++; continue; } prog.set(`Exporting ${++n} of ${list.length}…`); await tick();
        const dir = (m.f && A.folderById(m.f) ? A.folderPath(m.f).split(' / ').map(U.safeName).join('/') + '/' : '') ; const key = dir; const names = dirNames.get(key) || new Set(); dirNames.set(key, names);
        const r = await render(note, 'md', used, 'attachments/'); const base = rootName + '/' + dir; out[base + uniq(names, U.safeName(note.title) + '.md')] = fflate.strToU8(r.text); for (const f of r.files) out[rootName + '/' + f.path] = f.bytes;
      }
      if (!n) { prog.done(); return zk.alert('Nothing to export', skipped ? 'The only notes here are locked.' : 'There are no notes to export.'); }
      const data = fflate.zipSync(out, { level: 1 }); prog.done(); await saveBlobOrZip(zipName, data, 'Zip archive', ['zip']); if (skipped) zk.toast(skipped + ' locked note(s) skipped', 2500);
    } catch (e) { prog.done(); console.error(e); zk.alert('Export failed', e.message || String(e)); }
  }
  io.exportAll = () => exportMany(A.metas().filter((m) => !m.d), 'ZengNotes Markdown.zip', 'ZengNotes');
  io.exportFolder = (fid) => { const ds = A.descendants(fid); const f = A.folderById(fid); return exportMany(A.metas().filter((m) => !m.d && ds.has(m.f)), U.safeName(f.name) + '.zip', U.safeName(f.name)); };

  // ------------------------------------------------------------ print / PDF
  io.printNote = async () => {
    const id = S.cur || [...S.sel][0]; if (!id) return; const note = await fullNote(id); if (!note) return; const used = new Set(); const g = await gather(note, 'a/', used); const byPath = new Map(g.files.map((f) => [f.path, f]));
    const html = CV.toHtmlDoc(note.title, g.doc.body.innerHTML, { dataUrl: (el) => { const p = g.map.get(el); const f = p && byPath.get(p); return f ? toDataUrl(f.bytes, f.type) : ''; } });
    const d = new DOMParser().parseFromString(html, 'text/html'); const css = CV.CSS.replace(/body\{[^}]*\}/, '').replace(/(^|\})([^{}]+)\{/g, (m, a, sel) => a + sel.split(',').map((x) => '#printRoot ' + x.trim()).join(',') + '{');
    const root = document.getElementById('printRoot'); root.innerHTML = `<style>${css}#printRoot{font:14px/1.5 -apple-system,Segoe UI,Inter,sans-serif;color:#111;background:#fff}</style>` + d.body.innerHTML;
    await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => {}))); zeng.print();
    setTimeout(() => { if (!document.hasFocus || true) { /* keep until next print */ } }, 0);
  };

  // ------------------------------------------------------------ backup & restore
  io.backup = async () => {
    const prog = progress('Backing up…'); try {
      if (S.editing) await A.saveNow(); await Db.flush(); const out = {}; const notes = [], atts = {}; const ms = A.metas(); let i = 0;
      for (const m of ms) {
        prog.set(`Backing up ${++i} of ${ms.length}…`); if (i % 25 === 0) await tick(); const rec = await Db.loadNote(m.id); if (!rec) continue;
        notes.push({ ...rec, tid: undefined, _h: undefined, f: m.f, p: m.p, d: m.d, c: m.c, m: m.m, l: m.l ? 1 : 0, title: rec.title });
        for (const a of rec.atts || []) { if (atts[a]) continue; const r = await Db.getAttRaw(a); if (!r) continue; atts[a] = { name: r.meta.name, type: r.meta.type, size: r.meta.size, iv: r.meta.iv || null }; out['attachments/' + a] = r.bytes; }
      }
      const lib = { format: 'znotes', version: 1, app: 'ZengNotes', created: Date.now(), folders: Db.idx.folders, notes, atts };
      out['library.json'] = fflate.strToU8(JSON.stringify(lib)); out['README.txt'] = fflate.strToU8('ZengNotes library backup.\nlibrary.json holds all notes (HTML bodies); attachments/ holds binary attachments. Locked notes stay encrypted (AES-256-GCM).');
      const data = fflate.zipSync(out, { level: 1 }); prog.done(); const d = new Date(); const nm = `ZengNotes Backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.znotes`;
      await saveBlobOrZip(nm, data, 'ZengNotes backup', ['znotes']);
    } catch (e) { prog.done(); console.error(e); zk.alert('Backup failed', e.message || String(e)); }
  };
  io.restore = async () => { const hs = await zeng.files.open({ filters: [{ name: 'ZengNotes backup', exts: ['znotes', 'zip'] }] }); if (!hs.length) return; try { await io.restoreBytes(await U.readHandle(hs[0]), hs[0].name); } catch (e) { zk.alert('Can’t restore', e.message || String(e)); } };
  io.restoreBytes = async (bytes, name) => {
    let z; try { z = fflate.unzipSync(bytes); } catch { return zk.alert('Can’t restore', 'This file isn’t a valid .znotes archive.'); }
    if (!z['library.json']) return zk.alert('Can’t restore', 'library.json is missing from this archive.'); let lib; try { lib = JSON.parse(fflate.strFromU8(z['library.json'])); } catch { return zk.alert('Can’t restore', 'The library file in this archive is damaged.'); }
    if (lib.format !== 'znotes' || !Array.isArray(lib.notes)) return zk.alert('Can’t restore', 'This archive isn’t a ZengNotes backup.');
    const mode = await zk.sheet({ title: 'Restore Library Backup', message: `“${name}” contains ${lib.notes.length} note${lib.notes.length === 1 ? '' : 's'}. Merge adds them to your library and keeps the newer copy of any note that exists in both. Replace removes everything currently in the library first.`, buttons: [{ label: 'Cancel', value: null }, { label: 'Replace Library', value: 'replace', danger: true }, { label: 'Merge', primary: true, value: 'merge' }] });
    if (!mode) return; const prog = progress('Restoring…'); let n = 0;
    try {
      await A.leaveNote(); S.sel = new Set();
      if (mode === 'replace') { for (const id of Object.keys(M())) { await Db.removeNote(id); A.S.low.delete(id); } Db.idx.folders = []; }
      for (const f of lib.folders || []) if (!Db.idx.folders.some((x) => x.id === f.id)) Db.idx.folders.push({ id: f.id, name: f.name, p: f.p || null, x: !!f.x });
      for (const r of lib.notes) {
        if (!r || !r.id) continue; const ex = M()[r.id]; if (ex && ex.m >= (r.m || 0)) continue; prog.set(`Restoring ${++n} of ${lib.notes.length}…`); if (n % 20 === 0) await tick();
        for (const a of r.atts || []) { const f = z['attachments/' + a]; const am = lib.atts && lib.atts[a]; if (f && am) await Db.putAttRaw(a, f, am); }
        const rec = { v: 1, id: r.id, title: r.title || '', c: r.c, m: r.m, atts: r.atts || [], f: r.f || null, p: r.p || 0, d: r.d || 0 }; const meta = A.newMeta(rec, { f: r.f || null, p: r.p || 0 }); meta.d = r.d || 0; meta.c = r.c || Date.now(); meta.m = r.m || meta.c;
        if (r.lock) { rec.lock = r.lock; meta.l = 1; meta.t = rec.title || 'Locked Note'; meta.na = rec.atts.length; Db.put(rec, meta, meta.t); A.setLow(rec.id, meta.t); continue; }
        rec.html = CV.clean(r.html || '<p><br></p>', { raw: true }); const dv = A.deriveFromHtml(rec.html, rec.title); Object.assign(meta, { t: dv.t, s: dv.s, tg: dv.tags, ck: dv.ck, na: dv.na, ln: dv.ln });
        const ft = (rec.title + '\n' + dv.text + '\n' + dv.tags.map((t) => '#' + t).join(' ')).slice(0, 40000); Db.put(rec, meta, ft); A.setLow(rec.id, ft);
        const imgId = (rec.html.match(/class="att img"[^>]*data-att="([a-z0-9]+)"/i) || rec.html.match(/data-att="([a-z0-9]+)"[^>]*class="att img"/i) || [])[1];
        if (imgId) { const f = z['attachments/' + imgId]; const am = lib.atts && lib.atts[imgId]; if (f && am && !am.iv && U.isImage(am.type)) { if (await thumbFor(rec.id, [{ id: imgId, type: am.type, bytes: f }])) { meta.th = 1; rec.tid = imgId; } } }
      }
      await Db.flush(); A.refresh(false); prog.done(`Restored ${n} note${n === 1 ? '' : 's'}`); const first = A.S.filtered[0]; if (first) A.selectIds([first.id]); else A.showPlaceholder('none');
    } catch (e) { prog.done(); console.error(e); zk.alert('Restore failed', e.message || String(e)); }
  };
  io.corruptionNotice = async () => {
    const r = await zk.sheet({ title: 'The note library couldn’t be read', message: 'The library index on this computer is damaged and no backup copy of it could be loaded. Your notes’ files may still exist, but there is no list of them. If you have a .znotes backup you can restore it now. Otherwise you can start with an empty library.', buttons: [{ label: 'Start Empty', value: 'new' }, { label: 'Restore Backup…', primary: true, value: 'restore' }], dismissable: false });
    if (r === 'restore') io.restore(); else if (!Object.keys(M()).length) A.newNote({ focus: 'title' });
  };

  // ------------------------------------------------------------ sample library
  io.importSample = async () => {
    if (!N.sample) return; const ok = await zk.confirm('Import the sample library?', 'Adds about a dozen example notes in a “Sample Library” folder — a checklist, a table, code, a sketch, a linked note and more. Delete the folder whenever you like.', 'Import'); if (!ok) return;
    const prog = progress('Importing samples…'); try {
      const defs = await N.sample(); const root = io.ensureFolder(['Sample Library'], null); let first = null, n = 0;
      for (const d of defs) { const fid = io.ensureFolder(d.folder || [], root); const id = await io.saveDraft(d, fid); if (d.pinned && M()[id]) M()[id].p = 1; first = first || id; n++; }
      await Db.flush(); await A.setView({ kind: 'folder', id: root }); prog.done(`Imported ${n} sample notes`);
    } catch (e) { prog.done(); console.error(e); zk.alert('Couldn’t import the samples', e.message || String(e)); }
  };
})();
