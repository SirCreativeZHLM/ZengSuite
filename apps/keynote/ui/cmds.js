/* Object commands: clipboard, arrange, align, group, tables, insertion. */
(() => {
  const K = window.K, A = window.A;
  const sel = () => A.selObjs();
  const ch = (label, ids) => { K.updateConns(A.objs()); A.render(); A.sel = A.sel.filter((id) => A.byId(id)); A.overlay(); A.commit(label); A.emit('edited'); A.emit('select'); };
  const stamp = (o) => { if (!o.name) o.name = K.defaultName(o) + ' ' + (A.objs().filter((x) => x.type === o.type).length + 1); };

  A.addObj = (o, label) => { stamp(o); A.objs().push(o); A.sel = [o.id]; A.render(); A.overlay(); A.commit(label || 'Add ' + K.defaultName(o)); A.emit('edited'); A.emit('select'); return o; };

  const cmd = (A.cmd = {});
  cmd.selectAll = () => { A.select(A.objs().filter((o) => !o.hid && !o.lock).map((o) => o.id)); };
  cmd.del = () => {
    if (A.cell && sel()[0] && sel()[0].type === 'table' && false) return; const ids = new Set(A.sel); if (!ids.size) return;
    const os = A.objs(); for (let i = os.length - 1; i >= 0; i--) if (ids.has(os[i].id) && !os[i].lock) { // detach connectors
      const id = os[i].id; os.splice(i, 1); K.walk(os, (c) => { if (c.type === 'conn') { if (c.a.id === id) c.a.id = null; if (c.b.id === id) c.b.id = null; } }); }
    const s = A.curSlide(); if (s.builds) s.builds = s.builds.filter((b) => !ids.has(b.obj)); A.sel = []; ch('Delete');
  };
  cmd.dup = () => { const ss = sel(); if (!ss.length) return; const os = A.objs(); const cs = ss.map((o) => { const c = K.dupObj(o); K.moveObj(c, 20, 20); return c; }); // remap connector links among duplicates
    const idMap = new Map(); ss.forEach((o, i) => idMap.set(o.id, cs[i].id)); cs.forEach((c) => { if (c.type === 'conn') { if (c.a.id) c.a.id = idMap.get(c.a.id) || c.a.id; if (c.b.id) c.b.id = idMap.get(c.b.id) || c.b.id; } });
    cs.forEach((c) => os.push(c)); A.sel = cs.map((c) => c.id); ch('Duplicate'); };
  cmd.copy = (cut) => { const ss = sel(); if (!ss.length) return null; A.clip = { objs: K.clone(ss), n: 0 }; if (cut) cmd.del(); return A.clip; };
  cmd.paste = (data) => {
    const clip = data || A.clip; if (!clip) return; const os = A.objs(); clip.n = (clip.n || 0) + 1; const same = A.objs().some((o) => clip.objs.some((c) => Math.abs(c.x - o.x) < 0.5 && Math.abs(c.y - o.y) < 0.5 && c.type === o.type));
    const cs = clip.objs.map((c) => { const d = K.dupObj(c); if (same) K.moveObj(d, 14 * clip.n, 14 * clip.n); return d; }); cs.forEach((c) => os.push(c)); A.sel = cs.map((c) => c.id); ch('Paste');
  };
  cmd.group = () => {
    const ss = sel(); if (ss.length < 2) return; const os = A.objs(); const idx = Math.max(...ss.map((o) => os.indexOf(o))); const kids = os.filter((o) => ss.includes(o)); const g = K.newObj('group', { kids }); K.regroup(g); stamp(g);
    for (const k of kids) os.splice(os.indexOf(k), 1); os.splice(Math.min(idx - kids.length + 1, os.length), 0, g); A.sel = [g.id]; ch('Group');
  };
  cmd.ungroup = () => { const os = A.objs(); const out = []; for (const g of sel().filter((o) => o.type === 'group')) { const i = os.indexOf(g); os.splice(i, 1, ...g.kids); out.push(...g.kids.map((k) => k.id)); } if (out.length) { A.sel = out; ch('Ungroup'); } };
  cmd.lock = (v) => { const ss = sel(); const on = v ?? !ss.every((o) => o.lock); ss.forEach((o) => (o.lock = on || undefined)); ch(on ? 'Lock' : 'Unlock'); };
  cmd.hide = (v) => { sel().forEach((o) => (o.hid = (v ?? !o.hid) || undefined)); ch('Hide'); };
  cmd.order = (kind) => {
    const os = A.objs(); const ss = sel().sort((a, b) => os.indexOf(a) - os.indexOf(b)); if (!ss.length) return;
    if (kind === 'front') { ss.forEach((o) => os.splice(os.indexOf(o), 1)); os.push(...ss); }
    else if (kind === 'back') { ss.forEach((o) => os.splice(os.indexOf(o), 1)); os.unshift(...ss); }
    else if (kind === 'forward') { for (const o of [...ss].reverse()) { const i = os.indexOf(o); if (i < os.length - 1 && !ss.includes(os[i + 1])) { os.splice(i, 1); os.splice(i + 1, 0, o); } } }
    else if (kind === 'backward') { for (const o of ss) { const i = os.indexOf(o); if (i > 0 && !ss.includes(os[i - 1])) { os.splice(i, 1); os.splice(i - 1, 0, o); } } }
    ch('Arrange');
  };
  cmd.align = (kind) => {
    const ss = sel().filter((o) => !o.lock); if (!ss.length) return; const W = A.deck.size.w, H = A.deck.size.h; const ref = ss.length > 1 ? K.bbox(ss) : { x: 0, y: 0, w: W, h: H };
    for (const o of ss) { const b = K.bbox([o]); let dx = 0, dy = 0;
      if (kind === 'left') dx = ref.x - b.x; else if (kind === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); else if (kind === 'right') dx = ref.x + ref.w - (b.x + b.w);
      else if (kind === 'top') dy = ref.y - b.y; else if (kind === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); else if (kind === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      K.moveObj(o, dx, dy); }
    ch('Align');
  };
  cmd.distribute = (axis) => {
    const ss = sel().filter((o) => !o.lock); if (ss.length < 3) return; const h = axis === 'h'; const items = ss.map((o) => ({ o, b: K.bbox([o]) })).sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b, last = items[items.length - 1].b; const total = items.reduce((s, i) => s + (h ? i.b.w : i.b.h), 0); const span = h ? last.x + last.w - first.x : last.y + last.h - first.y; const gap = (span - total) / (items.length - 1); let pos = h ? first.x : first.y;
    for (const it of items) { const d = pos - (h ? it.b.x : it.b.y); if (h) K.moveObj(it.o, d, 0); else K.moveObj(it.o, 0, d); pos += (h ? it.b.w : it.b.h) + gap; }
    ch('Distribute');
  };
  cmd.flip = (axis) => { for (const o of sel()) { if (o.type === 'group') { const b = K.bbox(o.kids); for (const k of o.kids) { if (axis === 'h') { k.x = b.x + b.w - (k.x - b.x) - k.w; k.fh = !k.fh || undefined; } else { k.y = b.y + b.h - (k.y - b.y) - k.h; k.fv = !k.fv || undefined; } } } else if (o.type === 'conn') { const t = o.a; o.a = o.b; o.b = t; } else if (axis === 'h') o.fh = !o.fh || undefined; else o.fv = !o.fv || undefined; } ch('Flip'); };
  cmd.rot90 = (dir) => { const ss = sel(); if (!ss.length) return; const b = K.bbox(ss); const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; ss.forEach((o) => K.rotateAbout(o, c.x, c.y, dir * 90)); ch('Rotate'); };
  cmd.matchSize = (which) => { const ss = sel(); if (ss.length < 2) return; const r = ss[0]; ss.slice(1).forEach((o) => { if (which !== 'h') o.w = r.w; if (which !== 'w') o.h = r.h; }); ch('Match Size'); };
  cmd.nameObj = (o, n) => { o.name = n; A.commit('Rename'); };

  // ---------- clipboard events ----------
  document.addEventListener('copy', (e) => { if (A.editing || e.target.closest('input,textarea,[contenteditable="true"]') || !A.deck) return; if (A.focus === 'nav') { A.emit('navCopy', e, false); return; } const c = cmd.copy(false); if (!c) return; e.preventDefault(); e.clipboardData.setData('application/x-zengstage', JSON.stringify(c.objs)); A.clipText = c.objs.map((o) => K.plain(o.paras)).filter(Boolean).join('\n') || '\u200b'; e.clipboardData.setData('text/plain', A.clipText); });
  document.addEventListener('cut', (e) => { if (A.editing || e.target.closest('input,textarea,[contenteditable="true"]') || !A.deck) return; if (A.focus === 'nav') { A.emit('navCopy', e, true); return; } const c = cmd.copy(true); if (!c) return; e.preventDefault(); e.clipboardData.setData('application/x-zengstage', JSON.stringify(c.objs)); });
  document.addEventListener('paste', async (e) => {
    if (A.editing || e.target.closest('input,textarea,[contenteditable="true"]') || !A.deck) return; e.preventDefault(); const cd = e.clipboardData; if (A.focus === 'nav' && A.clipSlides) { A.emit('navPaste'); return; }
    const files = [...cd.files]; if (files.length) { for (const f of files) await A.insertFile({ name: f.name || 'pasted.png', data: new Uint8Array(await f.arrayBuffer()), type: f.type }); return; }
    const j = cd.getData('application/x-zengstage'); if (j) { try { cmd.paste({ objs: JSON.parse(j), n: A.clip ? A.clip.n : 0 }); return; } catch { } }
    if (A.clip && (!cd.getData('text/plain') || cd.getData('text/plain') === A.clipText)) { cmd.paste(); return; }
    const t = cd.getData('text/plain'); if (t) { const o = K.newObj('text', { x: 120, y: 160, w: 560, h: 60, ah: true, paras: K.paras(t) }); A.addObj(o, 'Paste Text'); A.fixAH(o); A.renderObj(o.id); A.overlay(); } else if (A.clip) cmd.paste();
  });

  // ---------- table ops ----------
  const T = () => { const o = sel()[0]; return o && o.type === 'table' ? o : null; };
  const emptyCell = () => ({ paras: [{ runs: [{ t: '' }] }] });
  const tfit = (t) => { t.w = t.cw.reduce((a, b) => a + b, 0); t.h = t.rh.reduce((a, b) => a + b, 0); };
  cmd.tableAddRow = (after = true, keep) => { const t = T() || (A.editing && A.editing.o); if (!t) return; const r = A.cell ? (after ? A.cell.r2 + 1 : A.cell.r1) : t.rh.length; const C = t.cw.length; t.cells.splice(r, 0, Array.from({ length: C }, emptyCell)); t.rh.splice(r, 0, t.rh[Math.min(r, t.rh.length - 1)] || 40); tfit(t); if (!keep) ch('Add Row'); else A.renderObj(t.id); };
  cmd.tableAddCol = (after = true) => { const t = T(); if (!t) return; const c = A.cell ? (after ? A.cell.c2 + 1 : A.cell.c1) : t.cw.length; t.cells.forEach((r) => r.splice(c, 0, emptyCell())); t.cw.splice(c, 0, t.cw[Math.min(c, t.cw.length - 1)] || 100); tfit(t); ch('Add Column'); };
  cmd.tableDelRow = () => { const t = T(); if (!t || t.rh.length < 2) return; const r1 = A.cell ? A.cell.r1 : t.rh.length - 1, r2 = A.cell ? A.cell.r2 : r1; t.cells.splice(r1, r2 - r1 + 1); t.rh.splice(r1, r2 - r1 + 1); if (!t.rh.length) { cmd.del(); return; } A.cell = null; tfit(t); ch('Delete Row'); };
  cmd.tableDelCol = () => { const t = T(); if (!t || t.cw.length < 2) return; const c1 = A.cell ? A.cell.c1 : t.cw.length - 1, c2 = A.cell ? A.cell.c2 : c1; t.cells.forEach((r) => r.splice(c1, c2 - c1 + 1)); t.cw.splice(c1, c2 - c1 + 1); A.cell = null; tfit(t); ch('Delete Column'); };
  cmd.cellFill = (fill) => { const t = T(); if (!t) return; const c = A.cell || { r1: 0, c1: 0, r2: t.rh.length - 1, c2: t.cw.length - 1 }; for (let r = c.r1; r <= c.r2; r++) for (let k = c.c1; k <= c.c2; k++) t.cells[r][k].fill = fill; ch('Cell Fill'); };

  // ---------- insertion ----------
  K.coverCrop = (o, m) => { const ia = m.w / m.h, fa = o.w / o.h; if (ia > fa) { const w = fa / ia; o.crop = { x: (1 - w) / 2, y: 0, w, h: 1 }; } else { const h = ia / fa; o.crop = { x: 0, y: (1 - h) / 2, w: 1, h }; } };
  A.insertFile = async (f) => {
    const type = f.type || K.mimeOf(f.name); const d = A.deck; const kind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : null; if (!kind) return false;
    const id = await K.addMedia(d, f.data, f.name, type); const m = d.media[id]; const W = d.size.w, H = d.size.h;
    if (kind === 'image') {
      const ph = sel().find((o) => o.type === 'image' && !o.m);
      if (ph) { ph.m = id; K.coverCrop(ph, m); ph.alt = f.name; A.render(); A.overlay(); A.commit('Insert Image'); A.emit('edited'); return true; }
      const maxW = W * 0.7, maxH = H * 0.7; const s = Math.min(maxW / m.w, maxH / m.h, 1.5); const w = m.w * s, h = m.h * s;
      A.addObj(K.newObj('image', { m: id, x: (W - w) / 2, y: (H - h) / 2, w, h, alt: f.name, name: f.name.replace(/\.[^.]+$/, '') }), 'Insert Image');
    } else if (kind === 'video') A.addObj(K.newObj('media', { kind: 'video', m: id, w: W * 0.5, h: W * 0.5 * 9 / 16, x: W * 0.25, y: H * 0.25, name: f.name }), 'Insert Movie');
    else A.addObj(K.newObj('media', { kind: 'audio', m: id, w: 64, h: 64, x: W / 2 - 32, y: H / 2 - 32, name: f.name }), 'Insert Audio');
    return true;
  };
  A.pickMedia = async (kind) => {
    const filters = { image: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }], audio: [{ name: 'Audio', exts: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }], video: [{ name: 'Movies', exts: ['mp4', 'm4v', 'mov', 'webm'] }], any: [{ name: 'Images, Audio & Movies', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp3', 'wav', 'm4a', 'aac', 'mp4', 'm4v', 'mov', 'webm'] }] }[kind || 'any'];
    const hs = await zeng.files.open({ filters, multiple: true }); for (const h of hs) { try { const buf = new Uint8Array(await zeng.files.read(h)); await A.insertFile({ name: h.name, data: buf }); } catch (e) { zk.alert('Can’t insert “' + h.name + '”', e.message); } }
  };
  A.replaceImage = async (o) => {
    const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }] }); if (!hs[0]) return; const buf = new Uint8Array(await zeng.files.read(hs[0])); const id = await K.addMedia(A.deck, buf, hs[0].name, K.mimeOf(hs[0].name)); const m = A.deck.media[id];
    const old = o.m; o.m = id; if (!o.crop || (o.crop.w === 1 && o.crop.h === 1 && !old)) K.coverCrop(o, m); else { const ar = m.w / m.h; o.h = o.w / ar * (o.crop.w / o.crop.h) ; } A.render(); A.overlay(); A.commit('Replace Image'); A.emit('edited'); A.emit('select');
  };
  A.insertTable = (rows, cols) => { const W = A.deck.size.w, H = A.deck.size.h; const w = Math.min(W * 0.8, cols * 150), h = Math.min(H * 0.7, rows * 44); const o = K.newObj('table', { rows, cols, w, h, x: (W - w) / 2, y: (H - h) / 2 }); o.cells.forEach((r, ri) => r.forEach((c, ci) => { if (ri === 0) c.paras = K.paras('Header ' + (ci + 1)); })); A.addObj(o, 'Insert Table'); };
  A.insertChart = (kind) => { const W = A.deck.size.w, H = A.deck.size.h; const o = K.newObj('chart', { kind, x: (W - 560) / 2, y: (H - 340) / 2, w: 560, h: 340 }); if (kind === 'scatter') o.data = { cats: ['1', '2', '3', '4', '5'], series: [{ name: 'Series 1', vals: [3, 6, 4, 9, 7] }, { name: 'Series 2', vals: [2, 3, 6, 5, 8] }] }; if (kind === 'pie' || kind === 'donut') o.data = { cats: ['Alpha', 'Beta', 'Gamma', 'Delta'], series: [{ name: 'Share', vals: [38, 27, 22, 13] }] }; A.addObj(o, 'Insert Chart'); };
  A.insertText = () => A.setTool({ t: 'text' });
  A.insertShape = (shape) => A.setTool({ t: 'shape', shape });
  A.insertLine = (route, head) => A.setTool({ t: 'conn', route, head });
  A.insertField = (field) => { if (A.editing) { const sp = `<span data-field="${field}">${K.fieldText(A.deck, field, { index: A.cur })}</span>`; document.execCommand('insertHTML', false, sp); return; } const o = K.newObj('text', { x: 120, y: 240, w: 200, h: 40, ah: true, paras: [{ runs: [{ t: '', field }] }] }); A.addObj(o, 'Insert Field'); };
  A.insertLink = async () => {
    const cur = sel()[0]; const prev = A.editing ? '' : cur && cur.link ? (typeof cur.link === 'string' ? cur.link : cur.link.url) : '';
    const kind = A.deck.slides.map((s, i) => `Slide ${i + 1}`);
    const input = zk.el('input.zk-input.selectable', { value: prev, placeholder: 'https://example.com or #5 for slide 5', style: { width: '100%', height: '30px' } });
    const r = await zk.sheet({ title: 'Hyperlink', message: A.editing ? 'Link the selected text.' : 'Link the selected object. Use #N to jump to slide N.', body: input, buttons: [{ label: 'Remove Link', value: 'rm' }, { label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
    if (!r) return; const url = r === 'rm' ? '' : input.value.trim();
    if (A.editing) { A.restoreSel(); if (!url) document.execCommand('unlink'); else { document.execCommand('createLink', false, url); A.editing.el.querySelectorAll('a').forEach((a) => { a.dataset.link = a.getAttribute('href'); a.removeAttribute('href'); }); } return; }
    sel().forEach((o) => (o.link = url || undefined)); A.commit('Link'); A.emit('select');
  };
})();
