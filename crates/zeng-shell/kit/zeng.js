/* ZengSuite kit runtime. Loaded by every app as <script src="/kit/zeng.js">.
   Works natively (inside zeng-shell) and in a plain browser (dev/testing), where files use <input>/download. */
(() => {
  'use strict';
  const native = !!(window.ipc && window.ipc.postMessage);
  const ua = navigator.userAgent;
  const guess = /Mac/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : 'linux';
  const zeng = (window.zeng = { isNative: native, platform: guess, info: { name: document.title, id: 'web', version: '0' } });
  const zk = (window.zk = {});

  // ---------- IPC ----------
  let seq = 1; const pending = new Map(); const listeners = {};
  zeng._reply = (r) => { const p = pending.get(r.id); if (!p) return; pending.delete(r.id); r.ok ? p.res(r.data) : p.rej(new Error(r.error)); };
  zeng._emit = (name, data) => { (listeners[name] || []).slice().forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); };
  zeng.on = (name, fn) => { (listeners[name] ||= []).push(fn); return () => { listeners[name] = listeners[name].filter((f) => f !== fn); }; };
  zeng.call = (cmd, args = {}) => {
    if (!native) return Promise.reject(new Error('not native: ' + cmd));
    return new Promise((res, rej) => { const id = seq++; pending.set(id, { res, rej }); window.ipc.postMessage(JSON.stringify({ id, cmd, ...args })); });
  };
  const fire = (cmd, args = {}) => { if (native) window.ipc.postMessage(JSON.stringify({ cmd, ...args })); };

  // ---------- tiny DOM helpers ----------
  zk.el = (tag, attrs, ...kids) => {
    const [t, ...cls] = tag.split('.'); const e = document.createElement(t || 'div'); if (cls.length) e.className = cls.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v; else if (k === 'class') e.className += ' ' + v;
      else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  zk.icon = (name, size) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'zi'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = (window.ZI && window.ZI[name]) || ''; if (size) { s.style.width = s.style.height = size + 'px'; } return s;
  };
  zk.btn = (o) => {
    const b = zk.el('button.zk-btn' + (o.icon && !o.label ? '.icon' : '') + (o.cls ? '.' + o.cls.split(' ').join('.') : ''), { type: 'button', title: o.title || o.label || '', 'aria-label': o.title || o.label || o.icon, onclick: o.onClick });
    if (o.icon) b.append(zk.icon(o.icon)); if (o.label) b.append(o.label); if (o.id) b.id = o.id; return b;
  };
  zk.$ = (s, r = document) => r.querySelector(s); zk.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  zk.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  zk.debounce = (f, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  zk.uid = () => Math.random().toString(36).slice(2, 10);
  zk.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  zk.reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- spring (critically damped by default, velocity-aware, interruptible) ----------
  // zk.spring({from,to,velocity,response=.35,damping=1,onUpdate,onDone}) -> {stop(), retarget(to)}
  zk.spring = (o) => {
    let x = o.from, v = o.velocity || 0, to = o.to, raf = 0, last = performance.now(), alive = true;
    const resp = o.response ?? 0.35, zeta = o.damping ?? 1, w = (2 * Math.PI) / resp, k = w * w, c = 2 * zeta * w;
    if (zk.reducedMotion()) { o.onUpdate(to); o.onDone && o.onDone(); return { stop() {}, retarget() {} }; }
    const step = (now) => {
      if (!alive) return; let dt = Math.min((now - last) / 1000, 0.032); last = now;
      const sub = 4; for (let i = 0; i < sub; i++) { const h = dt / sub; const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      if (Math.abs(x - to) < (o.eps ?? 0.01) && Math.abs(v) < (o.eps ?? 0.01) * 10) { o.onUpdate(to); alive = false; o.onDone && o.onDone(); return; }
      o.onUpdate(x); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return { stop() { alive = false; cancelAnimationFrame(raf); }, retarget(t) { to = t; }, get value() { return x; } };
  };
  zk.project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);
  zk.rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  // ---------- dialogs: sheets, popovers, menus, toasts ----------
  let sheetN = 0;
  zk.sheet = ({ title, message, body, buttons = [{ label: 'OK', primary: true }], width, dismissable = true }) =>
    new Promise((resolve) => {
      const scrim = zk.el('.zk-scrim'); const bodyEl = zk.el('.body', title && zk.el('h2', title), message && zk.el('p', message), body);
      const sheet = zk.el('.zk-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' }, bodyEl);
      if (width) sheet.style.width = width + 'px';
      let closed = false;
      const close = (val) => { if (closed) return; closed = true; document.removeEventListener('keydown', key, true); scrim.classList.add('out'); setTimeout(() => scrim.remove(), 150); sheetN--; resolve(val); };
      const act = zk.el('.actions');
      buttons.forEach((b, i) => { const be = zk.el('button.zk-btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { type: 'button', onclick: async () => { if (b.onClick && (await b.onClick(sheet)) === false) return; close(b.value ?? i); } }, b.label); act.append(be); });
      sheet.append(act); scrim.append(sheet); document.body.append(scrim); sheetN++;
      const key = (e) => {
        if (e.key === 'Escape' && dismissable) { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { const p = buttons.findIndex((b) => b.primary); if (p >= 0) { e.preventDefault(); act.children[p].click(); } }
      };
      document.addEventListener('keydown', key, true);
      scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && dismissable) close(null); });
      const first = sheet.querySelector('input,textarea,select') || act.querySelector('.primary') || act.lastChild; first && first.focus();
      sheet.close = close;
    });
  zk.alert = (title, message) => zk.sheet({ title, message });
  zk.confirm = async (title, message, ok = 'OK', { danger = false } = {}) => (await zk.sheet({ title, message, buttons: [{ label: 'Cancel', value: false }, { label: ok, primary: true, danger, value: true }] })) === true;
  zk.prompt = async (title, value = '', { message, placeholder, ok = 'OK' } = {}) => {
    const input = zk.el('input.zk-input.selectable', { value, placeholder: placeholder || '', style: { width: '100%', height: '30px' } });
    const r = await zk.sheet({ title, message, body: input, buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: 'ok' }] });
    return r === 'ok' ? input.value : null;
  };
  zk.toast = (text, ms = 1800) => { const t = zk.el('.zk-toast', { role: 'status' }, text); document.body.append(t); setTimeout(() => { t.style.transition = 'opacity .2s'; t.style.opacity = 0; setTimeout(() => t.remove(), 220); }, ms); };

  let openPop = null;
  zk.closePop = () => { if (!openPop) return; const p = openPop; openPop = null; p.el.classList.add('out'); setTimeout(() => p.el.remove(), 110); p.anchor && p.anchor.removeAttribute('aria-expanded'); document.removeEventListener('pointerdown', p.away, true); document.removeEventListener('keydown', p.key, true); window.removeEventListener('blur', p.blur); p.onClose && p.onClose(); };
  zk.popover = (anchor, content, { align = 'start', side = 'bottom', x, y, cls = '', onClose, keepOpen } = {}) => {
    zk.closePop(); const pop = zk.el('.zk-pop' + (cls ? '.' + cls.split(' ').join('.') : ''), content); document.body.append(pop);
    const r = anchor ? anchor.getBoundingClientRect() : { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
    const w = pop.offsetWidth, h = pop.offsetHeight; let left = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left; let top = side === 'top' ? r.top - h - 4 : r.bottom + 4;
    if (!anchor) { top = y; left = x; }
    left = zk.clamp(left, 8, innerWidth - w - 8); if (top + h > innerHeight - 8) top = anchor ? Math.max(8, r.top - h - 4) : Math.max(8, innerHeight - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.setProperty('--ox', (r.left + r.width / 2 - left) + 'px'); pop.style.setProperty('--oy', top > r.top ? '0' : '100%');
    anchor && anchor.setAttribute('aria-expanded', 'true');
    const away = (e) => { if (!pop.contains(e.target) && !(keepOpen && keepOpen(e.target))) zk.closePop(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); zk.closePop(); } };
    const blur = () => zk.closePop();
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); window.addEventListener('blur', blur); }, 0);
    openPop = { el: pop, anchor, away, key, blur, onClose }; return pop;
  };
  const accelLabel = (a) => {
    if (!a) return ''; const mac = zeng.platform === 'mac';
    return a.split('+').map((p) => ({ cmdorctrl: mac ? '⌘' : 'Ctrl', cmd: '⌘', ctrl: mac ? '⌃' : 'Ctrl', shift: mac ? '⇧' : 'Shift', alt: mac ? '⌥' : 'Alt', option: mac ? '⌥' : 'Alt' }[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p))).join(mac ? '' : '+');
  };
  zk.accelLabel = accelLabel;
  // zk.menu(items, {anchor|x,y}) — items: {label,run,accel,checked,enabled,separator,submenu,icon}
  zk.menu = (items, opts = {}) => {
    const build = (list, depth = 0) => {
      const box = zk.el('div', { role: 'menu' });
      list.forEach((it) => {
        if (it.separator) return box.append(zk.el('.zk-msep'));
        const dis = it.enabled === false || (typeof it.enabled === 'function' && !it.enabled());
        const row = zk.el('.zk-mi' + (dis ? '.disabled' : ''), { role: 'menuitem' });
        if (it.checked) row.append(Object.assign(zk.icon('check'), { className: 'zi chk' }));
        row.append(zk.el('span', it.label)); if (it.accel) row.append(zk.el('span.accel', accelLabel(it.accel)));
        if (it.submenu) { row.append(Object.assign(zk.icon('chevron-right'), { className: 'zi sub' })); }
        row.addEventListener('pointerenter', () => { [...box.children].forEach((c) => c.classList.remove('hl')); row.classList.add('hl'); box.querySelectorAll(':scope > .zk-submenu').forEach((s) => s.remove());
          if (it.submenu && !dis) { const sm = zk.el('.zk-pop.zk-submenu', { style: { animation: 'none' } }, build(it.submenu, depth + 1)); document.body.append(sm); const rr = row.getBoundingClientRect(); sm.style.top = Math.min(rr.top - 5, innerHeight - sm.offsetHeight - 8) + 'px'; sm.style.left = (rr.right + sm.offsetWidth + 4 < innerWidth ? rr.right - 2 : rr.left - sm.offsetWidth + 2) + 'px'; row._sm = sm; box.dataset.sm = '1'; (box._subs ||= []).push(sm); } });
        row.addEventListener('pointerleave', (e) => { if (!it.submenu) row.classList.remove('hl'); });
        row.addEventListener('click', () => { if (dis || it.submenu) return; zk.closePop(); document.querySelectorAll('.zk-submenu').forEach((s) => s.remove()); it.run && it.run(); });
        box.append(row);
      });
      return box;
    };
    const pop = zk.popover(opts.anchor, build(items), { ...opts, onClose: () => { document.querySelectorAll('.zk-submenu').forEach((s) => s.remove()); opts.onClose && opts.onClose(); }, keepOpen: (t) => t.closest && t.closest('.zk-submenu') });
    return pop;
  };
  zk.contextMenu = (e, items) => { e.preventDefault(); zk.menu(items, { x: e.clientX, y: e.clientY }); };

  // ---------- storage ----------
  zeng.store = {
    async get(key, def = null) {
      try { if (native) { const v = await zeng.call('store_get', { key }); return v == null ? def : v; } const t = localStorage.getItem('zeng:' + key); return t == null ? def : JSON.parse(t); } catch { return def; }
    },
    async set(key, value) { try { if (native) await zeng.call('store_set', { key, value }); else localStorage.setItem('zeng:' + key, JSON.stringify(value)); } catch (e) { console.warn('store.set', e); } },
  };

  // ---------- files ----------
  // A "handle" is {name, path?, file?}. Native handles carry a path; web handles carry a File.
  const b64 = async (data) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  };
  const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
  zeng.files = {
    ext: extOf,
    async open({ filters = [], multiple = false, folder = false } = {}) {
      if (native) return await zeng.call('open_dialog', { filters, multiple, folder });
      return await new Promise((res) => {
        const i = zk.el('input', { type: 'file', multiple, accept: filters.flatMap((f) => f.exts.map((e) => '.' + e)).join(',') });
        i.onchange = () => res([...i.files].map((f) => ({ name: f.name, file: f, size: f.size }))); i.oncancel = () => res([]); i.click();
      });
    },
    async read(h) { if (h.file) return await h.file.arrayBuffer(); const r = await fetch('/__file?p=' + encodeURIComponent(h.path)); if (!r.ok) throw new Error('Could not read ' + h.name); return await r.arrayBuffer(); },
    async readText(h) { return new TextDecoder().decode(await zeng.files.read(h)); },
    url(h) { return h.file ? URL.createObjectURL(h.file) : '/__file?p=' + encodeURIComponent(h.path); },
    async saveDialog({ name = 'Untitled', filters = [] } = {}) {
      if (native) return await zeng.call('save_dialog', { name, filters });
      return { name, web: true };
    },
    // data: string | Uint8Array | ArrayBuffer | Blob
    async write(h, data) {
      if (native && h.path) { const arg = typeof data === 'string' ? { text: data } : { b64: await b64(data) }; return await zeng.call('write_file', { path: h.path, ...arg }); }
      const blob = data instanceof Blob ? data : new Blob([data]); const a = zk.el('a', { href: URL.createObjectURL(blob), download: h.name }); document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1000); return h;
    },
    // Ask for a path and write in one go. Returns the handle or null if cancelled.
    async saveAs(data, opts) { const h = await zeng.files.saveDialog(opts); if (!h) return null; await zeng.files.write(h, data); return h; },
    fromPath(path) { return { path, name: path.split(/[\\/]/).pop() }; },
    reveal(h) { h.path && fire('reveal', { path: h.path }); },
    async listDir(path) { return await zeng.call('list_dir', { path }); },
  };
  // Files arriving from the OS (double-click, drag onto window/dock icon, command line) or from a web drop.
  const fileCbs = [];
  zeng.onFiles = (fn) => { fileCbs.push(fn); };
  const deliver = (hs) => { for (let i = fileCbs.length - 1; i >= 0; i--) { if (fileCbs[i](hs) !== false) return; } };
  zeng.on('opened', (paths) => deliver(paths.map(zeng.files.fromPath)));
  zeng.on('drop', (paths) => deliver(paths.map(zeng.files.fromPath)));
  addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); deliver([...e.dataTransfer.files].map((f) => ({ name: f.name, file: f, size: f.size }))); } });

  // ---------- menus & shortcuts ----------
  let menuDef = [], menuItems = new Map(), shortcutList = [];
  const parseAccel = (a) => { const p = a.split('+'); const key = p.pop().toLowerCase(); const m = p.map((s) => s.toLowerCase()); return { key, meta: m.includes('cmd') || (m.includes('cmdorctrl') && zeng.platform === 'mac'), ctrl: m.includes('ctrl') || (m.includes('cmdorctrl') && zeng.platform !== 'mac'), shift: m.includes('shift'), alt: m.includes('alt') || m.includes('option') }; };
  const matches = (e, a) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); const code = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : k; const kk = a.key === 'plus' ? '+' : a.key; return (k === kk || code === kk || (kk === 'delete' && (k === 'delete' || k === 'backspace' && a.metaOnlyDelete)) ) && e.metaKey === a.meta && e.ctrlKey === a.ctrl && e.shiftKey === a.shift && e.altKey === a.alt; };
  zeng.shortcut = (accel, fn) => { shortcutList.push({ a: parseAccel(accel), fn }); };
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || openPop && e.key === 'Escape') return;
    // On macOS the native menu already handles menu accelerators; page-level shortcuts still run here.
    for (const s of shortcutList) if (matches(e, s.a)) { e.preventDefault(); s.fn(e); return; }
    if (zeng.platform !== 'mac' || !native) for (const [, it] of menuItems) if (it.accel && !it._a) it._a = parseAccel(it.accel); else if (it._a && matches(e, it._a) && it.enabled !== false && it.run) { if (sheetN) return; e.preventDefault(); it.run(); return; }
  }, true);
  const strip = (items) => items.map((it) => (it.separator ? { separator: true } : { id: it.id, label: it.label, accel: it.accel, checked: it.checked, enabled: typeof it.enabled === 'function' ? it.enabled() : it.enabled, submenu: it.submenu && strip(it.submenu) }));
  const index = (items) => items.forEach((it) => { if (it.separator) return; if (!it.id) it.id = 'm' + zk.uid(); menuItems.set(it.id, it); it.submenu && index(it.submenu); });
  let menubarEl = null;
  zeng.setMenus = (menus) => {
    menuDef = menus; menuItems = new Map(); menus.forEach((m) => index(m.items));
    if (native && zeng.platform === 'mac') { fire('menu', { menus: menus.map((m) => ({ label: m.label, items: strip(m.items) })) }); return; }
    if (!menubarEl) { menubarEl = zk.el('.zk-menubar', { role: 'menubar' }); document.body.prepend(menubarEl); }
    menubarEl.replaceChildren(...menus.map((m) => { const b = zk.el('button', { type: 'button', role: 'menuitem', 'aria-haspopup': 'menu' }, m.label); const openIt = () => zk.menu(m.items, { anchor: b, keepOpen: (t) => b.contains(t) }); b.onclick = () => (b.getAttribute('aria-expanded') ? zk.closePop() : openIt()); b.onpointerenter = () => { if (openPop && openPop.anchor && openPop.anchor.parentNode === menubarEl && openPop.anchor !== b) openIt(); }; return b; }));
  };
  zeng.refreshMenus = () => zeng.setMenus(menuDef);
  zeng.on('menu', (id) => { const it = menuItems.get(id); it && it.run && it.run(); });
  const exec = (c) => document.execCommand(c);
  zeng.stdEdit = ({ undo, redo, extra = [] } = {}) => [
    { label: 'Undo', id: 'edit.undo', accel: 'CmdOrCtrl+Z', run: undo || (() => exec('undo')) },
    { label: 'Redo', id: 'edit.redo', accel: zeng.platform === 'win' ? 'Ctrl+Y' : 'CmdOrCtrl+Shift+Z', run: redo || (() => exec('redo')) },
    ...(zeng.platform === 'mac' && native ? [] : [{ separator: true }, { label: 'Cut', accel: 'CmdOrCtrl+X', run: () => exec('cut') }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => exec('copy') }, { label: 'Paste', accel: 'CmdOrCtrl+V', run: () => navigator.clipboard?.readText ? navigator.clipboard.readText().then((t) => exec('insertText') || document.execCommand('insertText', false, t)).catch(() => exec('paste')) : exec('paste') }, { label: 'Select All', accel: 'CmdOrCtrl+A', run: () => exec('selectAll') }]),
    ...(extra.length ? [{ separator: true }, ...extra] : []),
  ];

  // ---------- documents: New / Open / Save / Save As / Recents / dirty guard ----------
  // zeng.doc({name, ext, filters, blank(), load(buf, ext, handle), save(ext) -> data, import:[ext], export:[{label, ext, run?, data?}]})
  zeng.doc = (cfg) => {
    const d = { file: null, dirty: false, cfg, recents: [], untitled: 'Untitled' };
    const nativeExt = cfg.ext;
    const filters = cfg.filters || [{ name: cfg.name + ' Document', exts: [nativeExt] }];
    const openExts = cfg.openExts || filters.flatMap((f) => f.exts);
    const title = () => { const n = d.file ? d.file.name : d.untitled + '.' + nativeExt; const t = (d.dirty ? '• ' : '') + n; document.title = t + ' — ' + zeng.info.name; zeng.call && native && fire('title', { title: t }); const el = zk.$('[data-doc-title]'); if (el) el.textContent = n.replace(/\.[^.]+$/, '') + (d.dirty ? ' — Edited' : ''); };
    d.refreshTitle = title;
    d.setDirty = (v = true) => { if (d.dirty === v) return; d.dirty = v; fire('dirty', { dirty: v }); title(); };
    d.markDirty = () => d.setDirty(true);
    d.setClean = () => d.setDirty(false);
    const guard = async () => {
      if (!d.dirty) return true;
      const r = await zk.sheet({ title: `Do you want to save the changes to “${d.file ? d.file.name : d.untitled}”?`, message: 'Your changes will be lost if you don’t save them.', buttons: [{ label: 'Don’t Save', value: 'no' }, { label: 'Cancel', value: null }, { label: 'Save', primary: true, value: 'yes' }], dismissable: true });
      if (r === 'yes') return await d.save(); return r === 'no';
    };
    d.guard = guard;
    d.new = async () => { if (!(await guard())) return; d.file = null; await cfg.blank(); d.dirty = false; fire('dirty', { dirty: false }); title(); };
    d.openHandle = async (h) => {
      const ext = extOf(h.name);
      try { if (!(await guard())) return; const buf = await zeng.files.read(h); await cfg.load(buf, ext, h); } catch (e) { zk.alert('Can’t open “' + h.name + '”', e.message || String(e)); return; }
      const native_ = ext === nativeExt; d.file = native_ ? h : null; if (!native_) d.untitled = h.name.replace(/\.[^.]+$/, ''); d.dirty = !native_ && false; fire('dirty', { dirty: false }); d.setDirty(false); title(); if (h.path) addRecent(h);
    };
    d.open = async () => { const hs = await zeng.files.open({ filters: [{ name: 'All supported', exts: openExts }, ...filters] }); if (hs[0]) await d.openHandle(hs[0]); };
    d.save = async () => { if (!d.file || !d.file.path) return await d.saveAs(); try { await zeng.files.write(d.file, await cfg.save(nativeExt)); d.setClean(); return true; } catch (e) { zk.alert('Couldn’t save', e.message); return false; } };
    d.saveAs = async () => {
      const h = await zeng.files.saveDialog({ name: (d.file ? d.file.name : d.untitled + '.' + nativeExt).replace(/\.[^.]+$/, '') + '.' + nativeExt, filters });
      if (!h) return false; try { await zeng.files.write(h, await cfg.save(nativeExt)); } catch (e) { zk.alert('Couldn’t save', e.message); return false; }
      d.file = h.web ? { name: h.name } : h; d.setClean(); title(); h.path && addRecent(h); return true;
    };
    d.exportAs = async (ex) => {
      const base = (d.file ? d.file.name : d.untitled).replace(/\.[^.]+$/, '');
      if (ex.run) return await ex.run(base);
      const data = await cfg.save(ex.ext); const h = await zeng.files.saveDialog({ name: base + '.' + ex.ext, filters: [{ name: ex.label.replace(/…$/, ''), exts: [ex.ext] }] }); if (!h) return; await zeng.files.write(h, data); zk.toast('Exported ' + h.name);
    };
    const addRecent = async (h) => { d.recents = [{ path: h.path, name: h.name }, ...d.recents.filter((r) => r.path !== h.path)].slice(0, 10); await zeng.store.set('recents', d.recents); zeng.refreshMenus(); };
    d.fileMenu = () => [
      { label: 'New', accel: 'CmdOrCtrl+N', run: d.new },
      { label: 'Open…', accel: 'CmdOrCtrl+O', run: d.open },
      { label: 'Open Recent', submenu: d.recents.length ? [...d.recents.map((r) => ({ label: r.name, run: () => d.openHandle(r) })), { separator: true }, { label: 'Clear Menu', run: async () => { d.recents = []; await zeng.store.set('recents', []); zeng.refreshMenus(); } }] : [{ label: 'No Recent Documents', enabled: false }] },
      { separator: true },
      { label: 'Save', accel: 'CmdOrCtrl+S', run: d.save },
      { label: 'Save As…', accel: 'CmdOrCtrl+Shift+S', run: d.saveAs },
      ...(cfg.export && cfg.export.length ? [{ label: 'Export To', submenu: cfg.export.map((ex) => ({ label: ex.label, run: () => d.exportAs(ex) })) }] : []),
      { separator: true },
      { label: 'Print…', accel: 'CmdOrCtrl+P', run: () => (cfg.print ? cfg.print() : native ? fire('print') : window.print()) },
      ...(zeng.platform === 'mac' && native ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => zeng.quit() }]),
    ];
    zeng.onFiles((hs) => { const ok = hs.filter((h) => openExts.includes(extOf(h.name))); if (!ok.length) return cfg.onOtherFiles ? cfg.onOtherFiles(hs) : true; d.openHandle(ok[0]); return false; });
    zeng.on('close', async () => { if (await guard()) zeng.quit(); });
    d.ready = (async () => { d.recents = (await zeng.store.get('recents', [])) || []; title(); })();
    zeng.currentDoc = d; return d;
  };
  zeng.quit = () => (native ? fire('quit') : window.close());
  zeng.print = () => (native ? fire('print') : window.print());
  zeng.fullscreen = (on) => (native ? zeng.call('fullscreen', { on }) : on === false ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.());

  // ---------- window chrome ----------
  // Double-clicking a titlebar toolbar maximizes the window; dragging it moves the window.
  document.addEventListener('pointerdown', (e) => {
    if (!native || e.button !== 0) return; const t = e.target;
    if (t.closest && t.closest('.zk-toolbar.zk-titlebar') && !t.closest('button,input,select,textarea,a,[contenteditable],.zk-seg,[data-nodrag]')) { if (e.detail === 2) fire('maximize'); else fire('drag'); }
  });
  addEventListener('contextmenu', (e) => { if (!e.target.closest('input,textarea,[contenteditable]') && !e.defaultPrevented) e.preventDefault(); });

  // ---------- boot ----------
  document.documentElement.classList.add('platform-' + guess);
  zeng.ready = (async () => {
    if (native) { try { Object.assign(zeng.info, await zeng.call('ready')); zeng.platform = zeng.info.platform; document.documentElement.className = document.documentElement.className.replace(/platform-\w+/, 'platform-' + zeng.platform); } catch (e) { console.error(e); } }
    else { zeng.info.name = document.title.replace(/ .*/, ''); }
    return zeng.info;
  })();
})();
