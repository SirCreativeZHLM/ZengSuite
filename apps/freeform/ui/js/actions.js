/* Freeform actions: text editing, clipboard, arrange, styles, insertion, shape recognition. */
(() => {
  'use strict';
  const S = FF.S, R = FF.R, $ = (s) => document.querySelector(s);
  const sel = () => FF.selObjs();
  const done = (t) => { const ok = t.end(); FF.reflow(); R.invalidate(); FF.emit('xform'); return ok; };

  // ---------- text fit ----------
  FF.fitText = (o) => {
    if (o.type !== 'text') return; o._lay = null;
    const W = o.autoW ? 1e9 : o.w; const L = FF.layout(o, W, 1);
    if (o.autoW) o.w = Math.max(20, Math.ceil(L.w) + 6); o.h = Math.max(L.h, (o.s.fs || 24) * 1.28); o._bb = null; o._lay = null;
  };

  // ---------- inline editor ----------
  let ed = null;
  const layer = $('#editlayer');
  FF.isEditing = () => !!ed;
  FF.beginEdit = (o, opt = {}) => {
    if (ed) FF.endEdit(); if (o.lock) return;
    let box, html, cell = opt.cell, plain = false;
    if (o.type === 'frame') { zk.prompt('Frame Title', o.title || '').then((v) => { if (v == null) return; const t = FF.tx('Rename Frame'); t.touch(o); o.title = v; FF.touch(o); t.end(); FF.emit('frames'); R.invalidate(); }); return; }
    if (o.type === 'table') { let x = 0, y = 0; for (let i = 0; i < cell[1]; i++) x += o.cw[i]; for (let i = 0; i < cell[0]; i++) y += o.rh[i]; box = { x: x + 6, y: y + 5, w: o.cw[cell[1]] - 12, h: o.rh[cell[0]] - 8 }; html = FF.runsToHTML(FF.plainToRuns((o.cells[cell[0]] || [])[cell[1]] || '')); plain = true; }
    else if (o.type === 'conn') { const g = FF.connGeo(o); box = { x: 0, y: 0, w: 200, h: 28, cx: g.mid[0], cy: g.mid[1] }; html = FF.runsToHTML(o.t); }
    else if (o.type === 'text') { box = { x: 0, y: 0, w: o.autoW ? 0 : o.w, h: o.h }; html = FF.runsToHTML(o.t); }
    else if (o.type === 'sticky' || o.type === 'shape') { box = FF.textBox(o); html = FF.runsToHTML(o.t); }
    else return;
    const wrap = zk.el('.ed-wrap'), inner = zk.el('.ed-in', { contentEditable: 'true', spellcheck: 'true', html }); wrap.append(inner); layer.append(wrap);
    const t = FF.tx('Edit Text'); t.touch(o);
    ed = { o, wrap, inner, box, t, cell, plain, fresh: !!opt.fresh }; S.editing = o; R.rcExtra.skipText = o.id; R.rcExtra.cell = cell || null; R.invalidate();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    inner.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); FF.endEdit(); stageFocus(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); FF.endEdit(); stageFocus(); return; }
      if (ed.cell && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); const tb = ed.o, [r, c] = ed.cell; FF.endEdit(); let nr = r, nc = c + (e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0); if (e.key === 'Enter') nr = r + 1; if (nc >= tb.cols) { nc = 0; nr++; } if (nc < 0) { nc = tb.cols - 1; nr--; } if (nr >= 0 && nr < tb.rows) FF.beginEdit(tb, { cell: [nr, nc] }); return; }
    });
    inner.addEventListener('keyup', () => FF.emit('editsel')); inner.addEventListener('mouseup', () => FF.emit('editsel'));
    inner.addEventListener('input', () => { if (ed && ed.o.type === 'text') { /* live size */ } });
    inner.addEventListener('blur', () => setTimeout(() => { if (ed && ed.inner === inner && !document.querySelector('.zk-pop,.zk-scrim') && document.activeElement !== inner) FF.endEdit(); }, 60));
    inner.addEventListener('pointerdown', (e) => e.stopPropagation());
    inner.addEventListener('paste', (e) => { e.stopPropagation(); e.preventDefault(); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); });
    inner.addEventListener('copy', (e) => e.stopPropagation()); inner.addEventListener('cut', (e) => e.stopPropagation());
    FF.positionEditor(); inner.focus();
    const rng = document.createRange(); rng.selectNodeContents(inner); if (!opt.collapse) { const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rng); }
    FF.emit('edit', true);
  };
  const stageFocus = () => FF.stage.focus({ preventScroll: true });
  FF.positionEditor = () => {
    if (!ed) return; const { o, wrap, inner, box } = ed, z = R.view.z; const s = o.s;
    let lx = box.x, ly = box.y; let p;
    if (o.type === 'conn') { p = [box.cx - 100, box.cy - 14]; } else p = FF.toWorld(o, lx, ly);
    const [sx, sy] = FF.w2s(p[0], p[1]); const rot = o.type === 'conn' ? 0 : o.rot || 0;
    const auto = FF.autoCol(o, FF.dark);
    wrap.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${sx}px,${sy}px) rotate(${rot}rad) scale(${z});width:${box.w ? box.w + 'px' : 'max-content'};min-width:${box.w ? 0 : 24}px;min-height:${box.h}px;display:flex;flex-direction:column;justify-content:${s.va === 'middle' ? 'center' : s.va === 'bottom' ? 'flex-end' : 'flex-start'};font:${s.i ? 'italic ' : ''}${s.b ? 600 : 400} ${s.fs || 20}px/1.28 ${FF.FAMS[s.font] || FF.FAMS.sans};color:${FF.col(s.tc === 'ink' ? 'ink' : s.tc, FF.dark) === 'ink' ? auto : (s.tc === 'ink' ? auto : FF.col(s.tc, FF.dark))};text-align:${o.type === 'conn' ? 'center' : s.ta || 'left'};`;
    inner.style.cssText = 'outline:none;white-space:pre-wrap;word-break:break-word;min-width:2px;caret-color:var(--accent);';
  };
  FF.endEdit = () => {
    if (!ed) return; const E = ed; ed = null; S.editing = null; R.rcExtra.skipText = null; R.rcExtra.cell = null; const { o, inner, wrap, t } = E;
    if (E.plain) { const txt = inner.innerText.replace(/\n+$/, ''); const [r, c] = E.cell; if (((o.cells[r] || [])[c] || '') !== txt) { (o.cells[r] ||= [])[c] = txt; FF.touch(o); } }
    else { const runs = FF.htmlToRuns(inner, o.s.fs); const old = JSON.stringify(o.t); if (JSON.stringify(runs) !== old) { o.t = FF.hasText({ t: runs }) ? runs : null; if (o.type === 'text' && !o.t) o.t = [[{ t: '' }]]; FF.touch(o); } if (o.type === 'text') { FF.fitText(o); } }
    wrap.remove();
    if (o.type === 'text' && !FF.hasText(o)) { t.del(o); t.end(); const B = FF.B; const last = B.undo[B.undo.length - 1]; if (last && last.label === 'Add Text') { B.undo.pop(); } FF.pruneSel(); } else t.end();
    FF.reflow(); R.invalidate(); FF.emit('edit', false); FF.emit('xform');
  };
  FF.editTableCell = (o, x, y) => { const [lx, ly] = FF.toLocal(o, x, y); let c = 0, ax = 0; while (c < o.cols - 1 && lx > ax + o.cw[c]) ax += o.cw[c++]; let r = 0, ay = 0; while (r < o.rows - 1 && ly > ay + o.rh[r]) ay += o.rh[r++]; FF.beginEdit(o, { cell: [r, c] }); };
  FF.editCard = async (o) => {
    const a = zk.el('input.zk-input.selectable', { value: o.title || '', placeholder: 'Title', style: { width: '100%', height: '30px' } }), b = zk.el('input.zk-input.selectable', { value: o.url || '', placeholder: 'https://… or file path', style: { width: '100%', height: '30px' } });
    const r = await zk.sheet({ title: 'Link Card', body: zk.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, a, b), buttons: [{ label: 'Cancel', value: null }, { label: 'Done', primary: true, value: 'ok' }] });
    if (r !== 'ok') return; const t = FF.tx('Edit Card'); t.touch(o); o.title = a.value; o.url = b.value; FF.touch(o); done(t);
  };
  // formatting applied to current editor selection (or whole selected objects)
  FF.fmt = (cmd, val) => {
    if (ed && !ed.plain) {
      ed.inner.focus();
      if (cmd === 'size') { document.execCommand('fontSize', false, '7'); ed.inner.querySelectorAll('font[size="7"]').forEach((f) => { f.removeAttribute('size'); f.style.fontSize = val + 'px'; }); ed.inner.querySelectorAll('span').forEach((s2) => { if (s2.style.fontSize === 'xxx-large' || s2.style.fontSize === '-webkit-xxx-large') s2.style.fontSize = val + 'px'; }); }
      else if (cmd === 'color') document.execCommand('foreColor', false, val); else document.execCommand(cmd);
      FF.emit('editsel'); return;
    }
    const map = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 'st' }; const objs = sel().filter((o) => FF.isText(o) || o.type === 'table' || o.type === 'card'); if (!objs.length) return;
    const t = FF.tx('Format Text'); for (const o of objs) { t.touch(o); if (cmd === 'size') { o.s.fs = val; o.t && o.t.forEach((p) => p.forEach((r) => delete r.sz)); } else if (cmd === 'color') { o.s.tc = val; o.t && o.t.forEach((p) => p.forEach((r) => delete r.c)); } else { const k = map[cmd]; const on = !o.s[k]; o.s[k] = on ? 1 : 0; o.t && o.t.forEach((p) => p.forEach((r) => delete r[k])); } FF.touch(o); FF.fitText(o); }
    done(t);
  };
  FF.fmtState = () => { if (!ed || ed.plain) return null; const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } }; return { bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough') }; };

  // ---------- style application ----------
  FF.setStyle = (patch, label = 'Change Style', objs) => {
    objs = objs || sel(); if (!objs.length) return; const t = FF.tx(label);
    for (const o of objs) {
      t.touch(o);
      for (const k in patch) {
        if (k === 'sw' && o.type === 'conn' && patch[k] < 1) continue;
        if (o.type === 'sticky' && k === 'fill' && patch[k] === 'none') continue;
        o.s[k] = patch[k];
      }
      if ('font' in patch || 'fs' in patch || 'b' in patch || 'i' in patch) { FF.fitText(o); }
      if ('sw' in patch && o.type === 'stroke' && !o.rot) FF.refitStroke(o);
      FF.touch(o);
    }
    done(t);
  };
  FF.setProps = (patch, label = 'Change', objs) => { objs = objs || sel(); if (!objs.length) return; const t = FF.tx(label); for (const o of objs) { t.touch(o); Object.assign(o, patch); FF.touch(o); } done(t); };
  FF.setGeom = (patch) => { const objs = sel().filter((o) => !o.lock); if (!objs.length) return; const t = FF.tx('Resize'); const F = FF.selFrame();
    for (const o of objs) { t.touch(o); if (objs.length === 1) { if ('x' in patch) o.x = patch.x; if ('y' in patch) o.y = patch.y; if ('w' in patch && o.type !== 'conn') { o.w = Math.max(2, patch.w); if (o.type === 'text') o.autoW = false; } if ('h' in patch && o.type !== 'conn' && o.type !== 'text') o.h = Math.max(2, patch.h); if ('rot' in patch) o.rot = (patch.rot * Math.PI) / 180; if (o.type === 'text') { FF.touch(o); FF.fitText(o); } if (o.type === 'stroke' && ('w' in patch || 'h' in patch)) { const og = t.b.get(o.id); const P = new Array(og.pts.length); for (let i = 0; i < P.length; i += 3) { P[i] = (og.pts[i] * o.w) / og.w; P[i + 1] = (og.pts[i + 1] * o.h) / og.h; P[i + 2] = og.pts[i + 2]; } o.pts = P; } if (o.type === 'table' && ('w' in patch || 'h' in patch)) { const og = t.b.get(o.id); o.cw = og.cw.map((v) => (v * o.w) / og.w); o.rh = og.rh.map((v) => (v * o.h) / og.h); } }
      else { if ('x' in patch) o.x += patch.x - F.x; if ('y' in patch) o.y += patch.y - F.y; } FF.touch(o); }
    done(t); };

  // ---------- delete / duplicate / nudge ----------
  FF.deleteSel = () => { const objs = sel().filter((o) => !o.lock); if (!objs.length) return; const t = FF.tx('Delete'); objs.forEach((o) => t.del(o)); // detach connectors from deleted objects
    const ids = new Set(objs.map((o) => o.id)); for (const c of FF.B.objs) if (c.type === 'conn') for (const k of ['a', 'b']) if (c[k].id && ids.has(c[k].id)) { t.touch(c); const q = objs.find((x) => x.id === c[k].id); const p = FF.portPos(q, c[k].port && c[k].port !== 'auto' ? c[k].port : FF.nearestPort(q, ...FF.center(c[k === 'a' ? 'b' : 'a'].id ? FF.B.map.get(c[k === 'a' ? 'b' : 'a'].id) || q : { x: c[k === 'a' ? 'b' : 'a'].x, y: c[k === 'a' ? 'b' : 'a'].y, w: 0, h: 0, rot: 0 }))); c[k] = { x: p.x, y: p.y }; FF.touch(c); }
    S.sel.clear(); FF.selChanged(); done(t); };
  FF.nudge = (dx, dy) => { const objs = sel().filter((o) => !o.lock); if (!objs.length) return; const t = FF.tx('Nudge'); t.touchAll(objs); for (const o of objs) { if (o.type === 'conn') { for (const k of ['a', 'b']) if (!o[k].id) { o[k].x += dx; o[k].y += dy; } FF.touch(o); } else { o.x += dx; o.y += dy; FF.moved(o); } } done(t); };

  // ---------- clipboard ----------
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  FF.serializeSel = (objs = sel()) => {
    const ids = new Set(objs.map((o) => o.id)); const out = objs.map((o) => { const c = FF.cloneObj(o); if (c.type === 'conn') for (const k of ['a', 'b']) if (c[k].id && !ids.has(c[k].id)) { const q = FF.B.map.get(c[k].id); const g = FF.connGeo(o); c[k] = { x: g[k === 'a' ? 'A' : 'B'].x, y: g[k === 'a' ? 'A' : 'B'].y }; } return c; });
    const media = {}; for (const o of out) if (o.type === 'image' && FF.media.has(o.media) && !media[o.media]) { const m = FF.media.get(o.media); media[o.media] = { mime: m.mime, b64: toB64(m.bytes) }; }
    return { zff: 1, objs: out, media };
  };
  FF.insertPayload = (p, { at, offset = 0, label = 'Paste' } = {}) => {
    const idmap = new Map(), gmap = new Map(); const objs = p.objs.map((r) => FF.normalize(FF.clone(r))).filter(Boolean); if (!objs.length) return [];
    for (const o of objs) { const nid = FF.id(); idmap.set(o.id, nid); o.id = nid; if (o.g) { if (!gmap.has(o.g)) gmap.set(o.g, FF.id()); o.g = gmap.get(o.g); } }
    for (const [id, m] of Object.entries(p.media || {})) { if (!FF.media.has(id)) FF.media.set(id, { id, mime: m.mime, bytes: m.bytes || fromB64(m.b64) }); }
    for (const o of objs) if (o.type === 'conn') for (const k of ['a', 'b']) if (o[k].id) o[k].id = idmap.get(o[k].id) || null;
    for (const o of objs) if (o.type === 'conn') for (const k of ['a', 'b']) if (o[k].id === null) o[k] = { x: 0, y: 0 };
    let dx = offset, dy = offset;
    if (at) { const b = FF.unionBB(objs.filter((o) => o.type !== 'conn').length ? objs.filter((o) => o.type !== 'conn') : objs); dx = at[0] - (b[0] + b[2]) / 2; dy = at[1] - (b[1] + b[3]) / 2; }
    for (const o of objs) { if (o.type === 'conn') { for (const k of ['a', 'b']) if (!o[k].id) { o[k].x += dx; o[k].y += dy; } } else { o.x += dx; o.y += dy; } FF.touch(o); }
    const t = FF.tx(label); objs.forEach((o) => t.add(o)); t.end(); FF.reflow(); FF.select(objs); R.invalidate(); FF.emit('xform'); FF.emit('frames'); return objs;
  };
  let pasteN = 0, lastCopy = null;
  FF.copy = () => { document.execCommand('copy'); return true; };
  const inEditable = (e) => { const t = e.target; return t && t.closest && t.closest('input,textarea,[contenteditable="true"]'); };
  document.addEventListener('copy', (e) => { if (inEditable(e) || !sel().length) return; e.preventDefault(); const p = FF.serializeSel(); const text = sel().map(FF.objText).filter(Boolean).join('\n') || 'Freeform objects'; e.clipboardData.setData('text/plain', text); e.clipboardData.setData('application/x-zengfreeform', JSON.stringify(p)); lastCopy = { text, p }; pasteN = 0; });
  document.addEventListener('cut', (e) => { if (inEditable(e) || !sel().length) return; e.preventDefault(); const p = FF.serializeSel(); const text = sel().map(FF.objText).filter(Boolean).join('\n') || 'Freeform objects'; e.clipboardData.setData('text/plain', text); e.clipboardData.setData('application/x-zengfreeform', JSON.stringify(p)); lastCopy = { text, p }; pasteN = 0; FF.deleteSel(); });
  document.addEventListener('paste', async (e) => {
    if (inEditable(e)) return; e.preventDefault(); const cd = e.clipboardData; if (!cd) return;
    const files = [...(cd.files || [])].filter((f) => /^image\//.test(f.type)); if (files.length) return FF.insertFiles(files.map((f) => ({ name: f.name || 'image.png', file: f })));
    let raw = cd.getData('application/x-zengfreeform'); const text = cd.getData('text/plain');
    let p = null; if (raw) { try { p = JSON.parse(raw); } catch {} } else if (lastCopy && text === lastCopy.text) p = lastCopy.p;
    if (p && p.objs) { pasteN++; const vc = FF.viewCenter(); const b = FF.unionBB(p.objs.filter((o) => o.type !== 'conn').map((o) => ({ ...o, _bb: null }))) || [0, 0, 0, 0]; const v = R.view, W = FF.getRect(); const vis = b[2] > v.x && b[0] < v.x + W.width / v.z && b[3] > v.y && b[1] < v.y + W.height / v.z; return FF.insertPayload(p, vis ? { offset: 24 * pasteN } : { at: vc }); }
    if (/^\s*<svg[\s>]/i.test(text)) return FF.importSVGText(text, FF.viewCenter());
    if (text.trim()) return FF.pasteText(text.trim());
  });
  FF.pasteText = (text, at) => {
    const c = at || FF.viewCenter(); const t = FF.tx('Paste');
    if (/^(https?:\/\/|file:\/\/|mailto:)\S+$/i.test(text)) { const o = FF.make('card', { x: c[0] - 150, y: c[1] - 38, w: 300, h: 76, title: text.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0], url: text }); t.add(o); t.end(); FF.select([o]); R.invalidate(); return o; }
    const o = FF.make('text', { x: c[0], y: c[1], w: 20, h: 34, autoW: true, t: FF.plainToRuns(text) }); const lines = text.split('\n'); if (text.length > 80 || lines.length > 1) { o.autoW = false; o.w = 360; } FF.fitText(o); o.x -= o.w / 2; o.y -= o.h / 2; t.add(o); t.end(); FF.select([o]); R.invalidate(); return o;
  };
  FF.pasteFromAPI = async () => { try { const items = await navigator.clipboard.read(); for (const it of items) { const ty = it.types.find((x) => x.startsWith('image/')); if (ty) { const b = await it.getType(ty); return FF.insertFiles([{ name: 'image.png', file: new File([b], 'image.png', { type: ty }) }]); } } } catch {} try { const text = await navigator.clipboard.readText(); if (lastCopy && lastCopy.text === text) { pasteN++; return FF.insertPayload(lastCopy.p, { offset: 24 * pasteN }); } if (text) FF.pasteText(text); } catch { if (lastCopy) { pasteN++; FF.insertPayload(lastCopy.p, { offset: 24 * pasteN }); } } };
  FF.paste = () => { if (!document.execCommand('paste')) FF.pasteFromAPI(); else setTimeout(() => {}, 0); };
  FF.duplicate = () => { const o = sel(); if (!o.length) return; FF.insertPayload(FF.serializeSel(o), { offset: 24, label: 'Duplicate' }); };
  FF.selectAll = () => FF.select(FF.B.objs.filter((o) => !o.hidden));

  // ---------- arrange ----------
  FF.group = () => { const o = sel().filter((x) => !x.lock); if (o.length < 2) return; const t = FF.tx('Group'), g = FF.id(); o.forEach((x) => { t.touch(x); x.g = g; }); done(t); };
  FF.ungroup = () => { const o = sel().filter((x) => x.g); if (!o.length) return; const t = FF.tx('Ungroup'); o.forEach((x) => { t.touch(x); delete x.g; }); done(t); };
  FF.toggleLock = () => { const o = sel(); if (!o.length) return; const on = !o.every((x) => x.lock); const t = FF.tx(on ? 'Lock' : 'Unlock'); o.forEach((x) => { t.touch(x); x.lock = on ? 1 : 0; }); done(t); FF.selChanged(); };
  FF.order = (how) => {
    const o = sel(); if (!o.length) return; const t = FF.tx('Arrange'); t.order(); const B = FF.B, ids = new Set(o.map((x) => x.id)); const L = B.objs;
    if (how === 'front') { B.objs = [...L.filter((x) => !ids.has(x.id)), ...L.filter((x) => ids.has(x.id))]; }
    else if (how === 'back') { B.objs = [...L.filter((x) => ids.has(x.id)), ...L.filter((x) => !ids.has(x.id))]; }
    else if (how === 'forward') { const a = L.slice(); for (let i = a.length - 2; i >= 0; i--) if (ids.has(a[i].id) && !ids.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]]; B.objs = a; }
    else { const a = L.slice(); for (let i = 1; i < a.length; i++) if (ids.has(a[i].id) && !ids.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]]; B.objs = a; }
    FF.rev++; done(t);
  };
  FF.align = (how) => {
    const o = sel().filter((x) => !x.lock && x.type !== 'conn'); if (o.length < 2) return; const b = FF.unionBB(o); const t = FF.tx('Align'); t.touchAll(o);
    for (const x of o) { const q = FF.bb(x), cx = (q[0] + q[2]) / 2, cy = (q[1] + q[3]) / 2; if (how === 'left') x.x += b[0] - q[0]; else if (how === 'right') x.x += b[2] - q[2]; else if (how === 'hcenter') x.x += (b[0] + b[2]) / 2 - cx; else if (how === 'top') x.y += b[1] - q[1]; else if (how === 'bottom') x.y += b[3] - q[3]; else if (how === 'vmiddle') x.y += (b[1] + b[3]) / 2 - cy; FF.moved(x); }
    done(t);
  };
  FF.distribute = (axis) => {
    const o = sel().filter((x) => !x.lock && x.type !== 'conn'); if (o.length < 3) return; const h = axis === 'h'; const a = o.map((x) => ({ x, q: FF.bb(x) })).sort((p, q) => (h ? p.q[0] - q.q[0] : p.q[1] - q.q[1]));
    const first = a[0].q, last = a[a.length - 1].q; const total = h ? last[2] - first[0] : last[3] - first[1]; const sum = a.reduce((s, e) => s + (h ? e.q[2] - e.q[0] : e.q[3] - e.q[1]), 0); const gap = (total - sum) / (a.length - 1); const t = FF.tx('Distribute'); t.touchAll(o); let pos = h ? first[0] : first[1];
    for (const e of a) { const d = h ? pos - e.q[0] : pos - e.q[1]; if (h) e.x.x += d; else e.x.y += d; FF.moved(e.x); pos += (h ? e.q[2] - e.q[0] : e.q[3] - e.q[1]) + gap; }
    done(t);
  };
  FF.flip = (axis) => { const o = sel().filter((x) => !x.lock && x.type === 'stroke'); if (!o.length) return; const t = FF.tx('Flip'); for (const x of o) { t.touch(x); const P = x.pts.slice(); for (let i = 0; i < P.length; i += 3) { if (axis === 'h') P[i] = x.w - P[i]; else P[i + 1] = x.h - P[i + 1]; } x.pts = P; FF.touch(x); } done(t); };
  FF.tableOp = (op) => {
    const o = sel().find((x) => x.type === 'table'); if (!o) return; const t = FF.tx('Table'); t.touch(o);
    if (op === 'addRow') { o.rows++; o.cells.push(Array(o.cols).fill('')); o.rh.push(o.rh[o.rh.length - 1]); o.h += o.rh[o.rh.length - 1]; }
    else if (op === 'addCol') { o.cols++; o.cells.forEach((r) => r.push('')); const w = o.cw[o.cw.length - 1]; o.cw.push(w); o.w += w; }
    else if (op === 'delRow' && o.rows > 1) { o.rows--; o.cells.pop(); o.h -= o.rh.pop(); }
    else if (op === 'delCol' && o.cols > 1) { o.cols--; o.cells.forEach((r) => r.pop()); o.w -= o.cw.pop(); }
    else if (op === 'hdr') o.hdr = !o.hdr; FF.touch(o); done(t);
  };

  // ---------- insertion ----------
  FF.insertAt = (o, label = 'Insert') => { const t = FF.tx(label); t.add(o, o.type === 'frame' ? 0 : undefined); t.end(); FF.select([o]); R.invalidate(); FF.emit('frames'); return o; };
  FF.insertShape = (kind) => { const c = FF.viewCenter(); FF.insertAt(FF.make('shape', { kind, x: c[0] - 80, y: c[1] - 55, w: 160, h: 110, s: { fit: true } })); FF.setTool('select'); };
  FF.insertSticky = (color) => { const c = FF.viewCenter(); const o = FF.make('sticky', { x: c[0] - 95, y: c[1] - 95, w: 190, h: 190, s: { fill: color || S.sticky } }); FF.insertAt(o); FF.beginEdit(o); };
  FF.insertTable = () => { const c = FF.viewCenter(); FF.insertAt(FF.tableObj(c[0] - 180, c[1] - 60, 3, 3, 360, 120)); };
  FF.insertFrame = () => { const c = FF.viewCenter(); FF.insertAt(FF.make('frame', { x: c[0] - 260, y: c[1] - 170, w: 520, h: 340, title: 'Frame ' + (FF.B.objs.filter((o) => o.type === 'frame').length + 1), seq: ++FF.B.seq })); };
  FF.insertStamp = (ch) => { const c = S.pointer && FF.viewCenter(); FF.insertAt(FF.make('stamp', { x: c[0] - 40, y: c[1] - 40, w: 80, h: 80, ch })); };
  FF.insertCard = () => { const c = FF.viewCenter(); const o = FF.make('card', { x: c[0] - 150, y: c[1] - 38, w: 300, h: 76, title: 'Link', url: 'https://' }); FF.insertAt(o); FF.editCard(o); };
  FF.insertText = () => { const c = FF.viewCenter(); FF.createText(c[0] - 40, c[1]); };
  const mimeOf = (n, t) => t || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' }[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream');
  FF.addMedia = async (bytes, mime) => { const id = FF.id(); const m = { id, mime, bytes }; FF.media.set(id, m); const im = new Image(); m.url = URL.createObjectURL(new Blob([bytes], { type: mime })); im.src = m.url; await im.decode().catch(() => { throw new Error('Not a supported image'); }); m.img = im; m.nw = im.naturalWidth || 400; m.nh = im.naturalHeight || 300; return m; };
  FF.insertFiles = async (handles, at) => {
    const c = at || FF.viewCenter(); let n = 0; const objs = [];
    for (const h of handles) {
      try {
        const buf = new Uint8Array(await zeng.files.read(h)); const mime = mimeOf(h.name, h.file && h.file.type);
        if (mime === 'image/svg+xml') { const r = FF.importSVGText(new TextDecoder().decode(buf), [c[0] + n * 30, c[1] + n * 30]); n++; continue; }
        if (!mime.startsWith('image/')) { zk.toast('Skipped ' + h.name); continue; }
        const m = await FF.addMedia(buf, mime); let w = m.nw, hh = m.nh; const k = Math.min(1, 520 / w, 520 / hh); w *= k; hh *= k;
        objs.push(FF.make('image', { x: c[0] - w / 2 + n * 30, y: c[1] - hh / 2 + n * 30, w, h: hh, media: m.id, name: h.name })); n++;
      } catch (e) { zk.alert('Can’t add “' + h.name + '”', e.message || String(e)); }
    }
    if (objs.length) { const t = FF.tx('Add Image'); objs.forEach((o) => t.add(o)); t.end(); FF.select(objs); R.invalidate(); FF.emit('media'); }
  };
  FF.pickImages = async () => { const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'] }], multiple: true }); if (hs && hs.length) FF.insertFiles(hs); };

  // ---------- shape recognition ----------
  const polyDist = (x, y, poly) => { let d = 1e18; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; d = Math.min(d, FF.segDist(x, y, a[0], a[1], b[0], b[1])); } return d; };
  FF.recognize = (P0, z) => {
    let P = P0; if (P.length > 140) { const k = Math.ceil(P.length / 140); P = P.filter((_, i) => i % k === 0 || i === P.length - 1); }
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; let len = 0; for (let i = 0; i < P.length; i++) { const p = P[i]; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); if (i) len += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); }
    const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h); if (len < 50 / z) return null;
    const a = P[0], b = P[P.length - 1], gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (gap > 0.14 * len || gap > 0.4 * diag) { // open: straight line?
      let md = 0; for (const p of P) md = Math.max(md, FF.segDist(p[0], p[1], a[0], a[1], b[0], b[1])); if (gap > 30 / z && md < 0.06 * gap && gap > 0.85 * len) return { type: 'line', a: [a[0], a[1]], b: [b[0], b[1]] }; return null;
    }
    if (Math.min(w, h) < 24 / z) return null;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2, norm = (w + h) / 2;
    const err = { ellipse: P.reduce((s, p) => s + Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1) * ((rx + ry) / 2), 0) / P.length / norm };
    const polys = { rect: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], diamond: [[cx, y0], [x1, cy], [cx, y1], [x0, cy]], triangle: [[cx, y0], [x1, y1], [x0, y1]] };
    for (const k in polys) err[k] = P.reduce((s, p) => s + polyDist(p[0], p[1], polys[k]), 0) / P.length / norm;
    let best = null, be = 0.085; for (const k in err) if (err[k] < be) { be = err[k]; best = k; }
    return best ? { type: 'shape', kind: best, box: [x0, y0, x1, y1] } : null;
  };
  FF.snapToObject = (r, st, tool) => {
    const sw = Math.max(2, Math.min(st.size, 8)); const stroke = st.color;
    if (r.type === 'line') return FF.make('conn', { a: { x: r.a[0], y: r.a[1] }, b: { x: r.b[0], y: r.b[1] }, kind: 'straight', ha: 'none', hb: 'none', s: { stroke, sw: tool === 'hl' ? st.size : sw } });
    const [x0, y0, x1, y1] = r.box; return FF.make('shape', { kind: r.kind, x: x0, y: y0, w: x1 - x0, h: y1 - y0, s: { fill: 'none', stroke, sw: tool === 'hl' ? st.size : sw, fit: true } });
  };
  FF.previewShapePath = (g, r) => {
    if (r.type === 'line') { g.beginPath(); g.moveTo(r.a[0], r.a[1]); g.lineTo(r.b[0], r.b[1]); g.stroke(); return; }
    const [x0, y0, x1, y1] = r.box; g.save(); g.translate(x0, y0); g.stroke(new Path2D(FF.shapeD(r.kind, x1 - x0, y1 - y0).d)); g.restore();
  };
})();
