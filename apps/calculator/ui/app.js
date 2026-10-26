/* ZengCalc shell: mode switching, window sizing, history drawer, settings, menus, clipboard, sound. */
(async () => {
  'use strict';
  await zeng.ready;
  const C = window.ZC, $ = (s, r = document) => r.querySelector(s);
  const MODES = [
    { id: 'basic', name: 'Basic', w: 300, h: 480, fixed: true, key: '1' },
    { id: 'scientific', name: 'Scientific', w: 560, h: 480, fixed: true, key: '2' },
    { id: 'programmer', name: 'Programmer', w: 640, h: 640, minW: 600, minH: 590, key: '3' },
    { id: 'converter', name: 'Converter', w: 480, h: 600, minW: 400, minH: 520, key: '4' },
    { id: 'date', name: 'Date Calculation', w: 460, h: 580, minW: 380, minH: 500, key: '5' },
    { id: 'graphing', name: 'Graphing', w: 940, h: 660, minW: 640, minH: 480, key: '6' },
    { id: 'notes', name: 'Scratch', w: 580, h: 620, minW: 380, minH: 340, key: '7' },
  ];
  const DEFAULTS = { mode: 'basic', group: true, sound: false, textScale: 1, angle: 'deg', rates: Object.fromEntries(C.CODES.map((c) => [c, c === 'USD' ? '1' : ''])) };
  const settings = Object.assign({}, DEFAULTS, (await zeng.store.get('settings', {})) || {});
  const locale = navigator.language || 'en-US';
  const H = (window.ZH = {
    settings, sep: C.localeSeps(locale), modes: {}, active: null, history: ((await zeng.store.get('history', [])) || []).slice(0, 200),
    fmtOpts() { return { group: settings.group, sep: this.sep }; },
    fmt(dec) { return C.format(dec, this.fmtOpts()); },
    saveSettings: zk.debounce(() => zeng.store.set('settings', settings), 300),
    async load(name, def) { const v = await zeng.store.get('m:' + name, null); return v == null ? def : v; },
    save: (() => { const t = {}; return (name, val) => { clearTimeout(t[name]); t[name] = setTimeout(() => zeng.store.set('m:' + name, val), 300); }; })(),
    toast: (m) => zk.toast(m, 1400),
    async copy(text) {
      try { await navigator.clipboard.writeText(text); } catch (e) { const t = zk.el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
      zk.toast('Copied', 1000);
    },
    // ---- sound (off by default)
    _ac: null,
    click() {
      if (!settings.sound) return;
      try {
        const ac = (this._ac ||= new (window.AudioContext || window.webkitAudioContext)()); if (ac.state === 'suspended') ac.resume();
        const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(650, t + 0.035);
        g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.06);
      } catch (e) { /* audio unavailable */ }
    },
    // spring-pressed key: visual state on pointer-down, action on click
    bindKey(btn, fn) {
      const up = () => btn.classList.remove('down');
      btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; btn.classList.add('down'); H.click(); });
      ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach((ev) => btn.addEventListener(ev, up));
      btn.addEventListener('click', (e) => { e.preventDefault(); fn(e); btn.blur(); });
    },
    flash(btn) { if (!btn) return; btn.classList.add('down'); H.click(); setTimeout(() => btn.classList.remove('down'), 110); },
    addHistory(e) { this.history.unshift({ ...e, t: Date.now() }); if (this.history.length > 200) this.history.pop(); renderHistory(); saveHistory(); },
    notify() { buildMenus(); },
  });
  const saveHistory = zk.debounce(() => zeng.store.set('history', H.history), 400);
  C.setRates(settings.rates); H.work = window.ZM.work(H);

  // ---------------------------------------------------------------- text size
  const applyScale = () => document.documentElement.style.setProperty('--ts', settings.textScale);
  applyScale();
  const setScale = (s) => { settings.textScale = zk.clamp(s, 0.8, 2); applyScale(); H.saveSettings(); H.active && H.active.resize && H.active.resize(); buildMenus(); };

  // ---------------------------------------------------------------- modes
  const mount = {};
  let current = null;
  const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];
  const sizeWindow = (m) => { if (zeng.isNative) zeng.call('window_size', { w: m.w, h: m.h, min_w: m.fixed ? m.w : m.minW, min_h: m.fixed ? m.h : m.minH, resizable: !m.fixed }).catch(() => {}); };
  async function setMode(id, { silent } = {}) {
    const m = modeById(id); if (current === m.id && !silent) return;
    const factoryName = { basic: 'calc', scientific: 'calc', programmer: 'prog', converter: 'conv', date: 'date', graphing: 'graph', notes: 'notes' }[m.id];
    document.querySelectorAll('.zc-mode').forEach((s) => { s.hidden = s.id !== 'm-' + m.id; });
    if (H.active && H.active.hide) H.active.hide();
    const section = $('#m-' + m.id);
    if (!mount[m.id]) { mount[m.id] = window.ZM[factoryName](H, section, m.id); if (mount[m.id].ready) await mount[m.id].ready; }
    H.active = mount[m.id]; current = m.id; settings.mode = m.id; H.saveSettings();
    $('#mode-name').textContent = m.name; document.title = m.name;
    sizeWindow(m);
    const ab = $('#angle-btn'); ab.hidden = !H.active.angle; if (H.active.angle) updateAngleBtn();
    H.active.show && H.active.show();
    closeHistoryIf(); buildMenus();
  }
  const angleLabel = { deg: 'Deg', rad: 'Rad', grad: 'Grad' };
  function updateAngleBtn() { const b = $('#angle-btn'); const a = H.active.angle.get(); b.textContent = angleLabel[a]; b.className = 'zk-btn angle'; b.setAttribute('aria-label', 'Angle unit: ' + angleLabel[a] + '. Press to change.'); }
  $('#angle-btn').onclick = () => { const o = ['deg', 'rad', 'grad']; const a = H.active.angle.get(); H.active.angle.set(o[(o.indexOf(a) + 1) % 3]); updateAngleBtn(); };
  H.updateAngle = () => H.active && H.active.angle && updateAngleBtn();

  // ---------------------------------------------------------------- history drawer
  const drawer = $('#history'); let histOpen = false, hspring = null;
  const histBtn = $('#hist-btn'); histBtn.append(zk.icon('history')); $('#more-btn').append(zk.icon('settings'));
  function toggleHistory(on = !histOpen) {
    if (on === histOpen) return; histOpen = on; histBtn.setAttribute('aria-pressed', on); histBtn.classList.toggle('on', on); histBtn.setAttribute('aria-label', on ? 'Hide history' : 'Show history');
    if (hspring) hspring.stop(); drawer.hidden = false; const W = drawer.offsetWidth || 320; const from = on ? W : parseFloat(drawer.dataset.x || 0);
    hspring = zk.spring({ from, to: on ? 0 : W, response: 0.38, onUpdate: (x) => { drawer.dataset.x = x; drawer.style.transform = `translateX(${x}px)`; }, onDone: () => { if (!on) drawer.hidden = true; } });
    if (on) renderHistory(); buildMenus();
  }
  const closeHistoryIf = () => {};
  histBtn.onclick = () => toggleHistory();
  const histText = (e) => (e.kind === 'prog' ? e.result : H.fmt(C.Dec.parse(e.result)));
  function renderHistory() {
    const list = $('#hist-list'); list.replaceChildren();
    if (!H.history.length) { list.append(zk.el('.zc-empty', 'There is no history yet.')); return; }
    H.history.forEach((e, i) => {
      const row = zk.el('.zc-hist-item', { role: 'listitem', tabindex: 0, title: 'Click to use this result. Right-click for more.' },
        zk.el('button.zk-btn.icon.cp', { 'aria-label': 'Copy result', title: 'Copy result', onclick: (ev) => { ev.stopPropagation(); H.copy(histText(e)); } }, zk.icon('copy')),
        zk.el('button.zk-btn.icon.sw', { 'aria-label': 'Show work', title: 'Show work', onclick: (ev) => { ev.stopPropagation(); H.work.openEntry(e); } }, zk.icon('list-tree')), zk.el('.e', e.expr), zk.el('.r', histText(e)));
      const use = () => useResult(e); row.onclick = use; row.onkeydown = (ev) => { if (ev.key === 'Enter') use(); };
      row.oncontextmenu = (ev) => zk.contextMenu(ev, [{ label: 'Show Work', run: () => H.work.openEntry(e) }, { label: 'Use Result', run: use }, { label: 'Use Expression', run: () => useExpr(e) }, { separator: true }, { label: 'Copy Result', run: () => H.copy(histText(e)) }, { label: 'Copy Expression', run: () => H.copy(e.expr) },
        { separator: true }, { label: 'Delete', run: () => { H.history.splice(i, 1); renderHistory(); saveHistory(); } }]);
      list.append(row);
    });
  }
  async function useResult(e) { if (!H.active || !H.active.useResult) await setMode(e.kind === 'prog' ? 'programmer' : 'basic'); H.active.useResult && H.active.useResult(e); }
  async function useExpr(e) { if (!H.active || !H.active.useExpr) await setMode('basic'); H.active.useExpr && H.active.useExpr(e); }
  $('#hist-clear').onclick = () => { H.history.length = 0; renderHistory(); saveHistory(); };

  // ---------------------------------------------------------------- menus
  const modeItems = () => MODES.map((m) => ({ label: m.name, checked: current === m.id, accel: 'CmdOrCtrl+' + m.key, run: () => setMode(m.id) }));
  const settingItems = () => [
    { label: 'Digit Grouping', checked: settings.group, run: () => { settings.group = !settings.group; H.saveSettings(); H.active && H.active.refresh && H.active.refresh(); renderHistory(); buildMenus(); } },
    { label: 'Click Sound', checked: settings.sound, run: () => { settings.sound = !settings.sound; H.saveSettings(); buildMenus(); if (settings.sound) H.click(); } },
  ];
  function buildMenus() {
    const extra = (H.active && H.active.menuItems && H.active.menuItems()) || [];
    zeng.setMenus([
      { label: 'File', items: [...extra, ...(extra.length ? [{ separator: true }] : []), { label: 'Show Work', accel: 'CmdOrCtrl+Shift+K', run: () => showWorkNow() }, { label: 'Copy Result', accel: 'CmdOrCtrl+Shift+C', run: () => H.active && H.active.copyText && H.copy(H.active.copyText()) }, ...(zeng.platform === 'mac' && zeng.isNative ? [] : [{ separator: true }, { label: 'Exit', accel: zeng.platform === 'win' ? 'Alt+F4' : 'Ctrl+Q', run: () => zeng.quit() }])] },
      { label: 'Edit', items: zeng.stdEdit({ undo: () => H.active && H.active.undo && H.active.undo(), redo: () => {}, extra: [{ label: 'Clear History', run: () => $('#hist-clear').click() }] }) },
      { label: 'View', items: [...modeItems(), { separator: true }, { label: 'Show History', checked: histOpen, accel: 'CmdOrCtrl+Shift+H', run: () => toggleHistory() }, ...settingItems(), { separator: true },
        { label: 'Bigger Text', accel: 'CmdOrCtrl+Plus', run: () => setScale(settings.textScale + 0.25) }, { label: 'Smaller Text', accel: 'CmdOrCtrl+-', run: () => setScale(settings.textScale - 0.25) }, { label: 'Actual Size', accel: 'CmdOrCtrl+0', run: () => setScale(1) }] },
    ]);
  }
  $('#mode-btn').onclick = (e) => zk.menu(modeItems(), { anchor: e.currentTarget });
  $('#more-btn').onclick = (e) => zk.menu([...settingItems(), { separator: true }, { label: 'Copy Result', run: () => H.active && H.active.copyText && H.copy(H.active.copyText()) }, { label: 'Clear History', run: () => $('#hist-clear').click() }, { separator: true },
    { label: 'Text Size: 100%', checked: settings.textScale === 1, run: () => setScale(1) }, { label: 'Text Size: 150%', checked: settings.textScale === 1.5, run: () => setScale(1.5) }, { label: 'Text Size: 200%', checked: settings.textScale === 2, run: () => setScale(2) }], { anchor: e.currentTarget, align: 'end' });
  MODES.forEach((m) => zeng.shortcut('CmdOrCtrl+' + m.key, () => setMode(m.id)));
  zeng.shortcut('CmdOrCtrl+Shift+H', () => toggleHistory());
  const showWorkNow = () => { if (H.work.isOpen()) return H.work.close(); if (H.active && H.active.showWork) H.active.showWork(); else H.toast('Nothing to show yet'); };
  zeng.shortcut('CmdOrCtrl+Shift+K', showWorkNow);
  zeng.shortcut('CmdOrCtrl+Plus', () => setScale(settings.textScale + 0.25)); zeng.shortcut('CmdOrCtrl+=', () => setScale(settings.textScale + 0.25));
  zeng.shortcut('CmdOrCtrl+-', () => setScale(settings.textScale - 0.25)); zeng.shortcut('CmdOrCtrl+0', () => setScale(1));

  // ---------------------------------------------------------------- keyboard / clipboard
  const typing = (t) => t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && H.work.isOpen() && !(e.target.classList && e.target.classList.contains('zw-edit')) && !document.querySelector('.zk-pop,.zk-scrim')) { H.work.close(); e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.zk-scrim')) return;
    if (e.key === 'Escape' && H.work.isOpen()) { H.work.close(); e.preventDefault(); return; }
    if (e.key === 'Escape' && histOpen) { toggleHistory(false); e.preventDefault(); return; }
    if (H.active && H.active.onKey && H.active.onKey(e)) e.preventDefault();
  });
  document.addEventListener('copy', (e) => {
    if (typing(e.target)) return; const sel = String(getSelection());
    if (sel.trim()) return; const t = H.active && H.active.copyText && H.active.copyText(); if (t != null) { e.clipboardData.setData('text/plain', t); e.preventDefault(); zk.toast('Copied', 1000); }
  });
  document.addEventListener('paste', (e) => {
    if (typing(e.target)) return; const t = e.clipboardData.getData('text/plain'); if (t && H.active && H.active.paste) { e.preventDefault(); H.active.paste(t); }
  });

  window.ZApp = { setMode, toggleHistory, renderHistory, H };
  await setMode(modeById(settings.mode).id, { silent: true });
  renderHistory();
})().catch((e) => { console.error(e); });
