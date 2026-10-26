/* Popovers and sheets: date picker, custom repeat, list editor, settings, templates, lightbox. */
(function () {
  const A = ZR.A, D = ZR.dates, h = zk.el, ST = ZR.store, R = ZR.recur;
  // ---------- date picker ----------
  A.pickDate = (anchor, { date, time, onChange, allowTime = true, onClose }) => {
    const ws = A.ws(); let cur = date || D.today(A.now); let view = D.parse(cur); let selDate = date || null, selTime = time || null;
    const root = h('.zr-cal'); const todayS = D.today(A.now);
    const emit = (closeIt) => { onChange(selDate, selTime); if (closeIt) zk.closePop(); };
    const quick = [['Today', () => todayS], ['Tomorrow', () => D.addDays(todayS, 1)], ['Weekend', () => D.addDays(todayS, (6 - D.dow(todayS) + 7) % 7 || 7)], ['Next Week', () => D.addDays(D.startOfWeek(todayS, ws), 7)]];
    const draw = () => {
      root.replaceChildren();
      root.append(h('.qk', quick.map(([n, f]) => h('button.zk-btn', { type: 'button', onclick: () => { selDate = f(); emit(true); } }, n)), selDate ? h('button.zk-btn', { type: 'button', onclick: () => { selDate = null; selTime = null; emit(true); } }, 'Clear') : null));
      root.append(h('.mh', h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Previous month', onclick: () => { view = { ...view, m: view.m === 1 ? 12 : view.m - 1, y: view.m === 1 ? view.y - 1 : view.y }; draw(); } }, zk.icon('chevron-left')), h('span', `${D.MONL[view.m - 1]} ${view.y}`), h('button.zk-btn.icon', { type: 'button', 'aria-label': 'Next month', onclick: () => { view = { ...view, m: view.m === 12 ? 1 : view.m + 1, y: view.m === 12 ? view.y + 1 : view.y }; draw(); } }, zk.icon('chevron-right'))));
      const g = h('.g'); for (let i = 0; i < 7; i++) g.append(h('.wd', D.WD[(ws + i) % 7].slice(0, 2)));
      const first = D.fmt(view.y, view.m, 1); const start = D.addDays(first, -((D.dow(first) - ws + 7) % 7));
      for (let i = 0; i < 42; i++) { const d = D.addDays(start, i); const o = D.parse(d); g.append(h('button' + (o.m !== view.m ? '.o' : '') + (d === todayS ? '.t' : '') + (d === selDate ? '.s' : ''), { type: 'button', onclick: () => { selDate = d; emit(true); } }, String(o.d))); }
      root.append(g);
      if (allowTime) {
        const inp = h('input.zk-input.selectable', { placeholder: 'Add time (e.g. 5pm)', value: selTime ? A.timeText(selTime) : '', 'aria-label': 'Time' });
        const apply = () => { const v = inp.value.trim(); if (!v) { selTime = null; if (selDate) emit(false); return; } const p = ZR.parser.parse('at ' + v.replace(/^at\s+/i, ''), { now: A.now }); const t = p.time || (/^\d{1,2}:\d{2}$/.test(v) ? D.hhmm(D.minutes(v)) : null); if (t) { selTime = t; if (!selDate) selDate = todayS; inp.value = A.timeText(t); emit(false); } else inp.style.boxShadow = 'inset 0 0 0 1px var(--danger)'; };
        inp.addEventListener('change', apply); inp.addEventListener('input', () => (inp.style.boxShadow = '')); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); zk.closePop(); } });
        root.append(h('.tm', zk.icon('clock'), inp));
      }
    };
    draw(); return zk.popover(anchor, root, { onClose });
  };

  // ---------- custom repeat ----------
  A.repeatSheet = async (rule, due) => {
    const base = rule ? R.norm(rule) : { freq: 'weekly', interval: 1 }; const dd = D.parse(due || D.today(A.now));
    let freq = base.freq, interval = base.interval, byday = (base.byday || []).filter((x) => !/\d/.test(x)); if (!byday.length && freq === 'weekly') byday = [R.CODES[D.dow(due || D.today(A.now))]];
    let mode = base.byday && base.byday.some((x) => /\d/.test(x)) ? 'nth' : 'day'; let nthN = 1, nthWd = 'MO'; if (mode === 'nth') { const s = R.splitDay(base.byday.find((x) => /\d/.test(x))); nthN = s.n; nthWd = R.CODES[s.wd]; }
    let monthDay = base.bymonthday && base.bymonthday[0] ? base.bymonthday[0] : dd.d; let endMode = base.until ? 'date' : base.count ? 'count' : 'never'; let until = base.until || D.addDays(due || D.today(A.now), 90); let count = base.count || 10;
    const body = h('.zr-form'); const draw = () => {
      body.replaceChildren();
      const fsel = h('select.zk-select', { 'aria-label': 'Frequency', onchange: () => { freq = fsel.value; draw(); } }, [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([v, l]) => h('option', { value: v, selected: v === freq }, l)));
      const nin = h('input.zk-input.num.selectable', { type: 'number', min: 1, max: 99, value: interval, 'aria-label': 'Interval', onchange: () => { interval = Math.max(1, Math.min(99, +nin.value || 1)); nin.value = interval; } });
      body.append(h('.row', h('label', 'Frequency'), fsel), h('.row', h('label', 'Every'), nin, h('span', { style: { color: 'var(--fg-2)' } }, { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' }[freq])));
      if (freq === 'weekly') body.append(h('.row', h('label', 'On'), h('.zr-wd', [1, 2, 3, 4, 5, 6, 0].map((i) => { const c = R.CODES[i]; return h('button' + (byday.includes(c) ? '.on' : ''), { type: 'button', 'aria-pressed': byday.includes(c), onclick: () => { byday = byday.includes(c) ? byday.filter((x) => x !== c) : [...byday, c]; draw(); } }, D.WD[i].slice(0, 2)); }))));
      if (freq === 'monthly') {
        const md = h('input.zk-input.num.selectable', { type: 'number', min: 1, max: 31, value: monthDay, onchange: () => { monthDay = Math.max(1, Math.min(31, +md.value || 1)); }, onfocus: () => { mode = 'day'; } });
        const ns = h('select.zk-select', { onchange: () => { nthN = +ns.value; mode = 'nth'; } }, [[1, 'first'], [2, 'second'], [3, 'third'], [4, 'fourth'], [-1, 'last']].map(([v, l]) => h('option', { value: v, selected: v === nthN }, l)));
        const ws = h('select.zk-select', { onchange: () => { nthWd = ws.value; mode = 'nth'; } }, [1, 2, 3, 4, 5, 6, 0].map((i) => h('option', { value: R.CODES[i], selected: R.CODES[i] === nthWd }, D.WDL[i])));
        body.append(h('.row', h('label', h('input.zk-radio', { type: 'radio', name: 'mm', checked: mode === 'day', onchange: () => { mode = 'day'; } }), ' Day'), md), h('.row', h('label', h('input.zk-radio', { type: 'radio', name: 'mm', checked: mode === 'nth', onchange: () => { mode = 'nth'; } }), ' On the'), ns, ws));
      }
      const es = h('select.zk-select', { 'aria-label': 'End', onchange: () => { endMode = es.value; draw(); } }, [['never', 'Never'], ['date', 'On date'], ['count', 'After']].map(([v, l]) => h('option', { value: v, selected: v === endMode }, l)));
      const row = h('.row', h('label', 'End'), es);
      if (endMode === 'date') row.append(h('input.zk-input.selectable', { type: 'date', value: until, onchange: (e) => { until = e.target.value || until; } }));
      if (endMode === 'count') { const c = h('input.zk-input.num.selectable', { type: 'number', min: 1, value: count, onchange: () => { count = Math.max(1, +c.value || 1); } }); row.append(c, h('span', { style: { color: 'var(--fg-2)' } }, 'times')); }
      body.append(row);
    };
    draw();
    const r = await zk.sheet({ title: 'Custom Repeat', body, width: 400, buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Done', primary: true, value: 'ok' }] });
    if (r !== 'ok') return undefined;
    const out = { freq, interval };
    if (freq === 'weekly' && byday.length) out.byday = byday; if (freq === 'monthly') { if (mode === 'nth') out.byday = [nthN + nthWd]; else out.bymonthday = [monthDay]; }
    if (freq === 'yearly') { out.bymonth = dd.m; out.bymonthday = [dd.d]; }
    if (endMode === 'date') out.until = until; if (endMode === 'count') out.count = count; return R.norm(out);
  };
  // quick repeat choices -> rule (anchored on due date)
  A.repeatFor = (key, due) => { const o = D.parse(due || D.today(A.now)); const p = R.PRESETS[key]; if (!p) return null; const r = JSON.parse(JSON.stringify(p)); if (key === 'monthly') r.bymonthday = [o.d]; if (key === 'weekly' || key === 'biweekly') r.byday = [R.CODES[D.dow(due || D.today(A.now))]]; if (key === 'yearly') { r.bymonth = o.m; r.bymonthday = [o.d]; } return R.norm(r); };

  // ---------- list editor ----------
  A.listSheet = async ({ list, title }) => {
    let name = list ? list.name : 'New List', color = list ? list.color : ST.COLORS[4], icon = list ? list.icon : 'list';
    const inp = h('input.zk-input.selectable', { value: name, style: { width: '100%', height: '30px', fontSize: '15px' }, 'aria-label': 'List name', oninput: () => { name = inp.value; } });
    const prev = h('.ic', { style: { width: '54px', height: '54px', borderRadius: '16px', display: 'grid', placeContent: 'center', color: '#fff', margin: '0 auto 4px', background: color } });
    const sw = h('.zr-sw'); const ig = h('.zr-ig', { style: { '--lc': color } });
    const draw = () => {
      prev.style.background = color; prev.replaceChildren(zk.icon(icon, 26)); ig.style.setProperty('--lc', color);
      sw.replaceChildren(...ST.COLORS.map((c) => h('button.zk-swatch' + (c === color ? '.sel' : ''), { type: 'button', style: { '--c': c }, 'aria-label': c, onclick: () => { color = c; draw(); } })));
      ig.replaceChildren(...ST.ICONS.map((n) => h('button' + (n === icon ? '.sel' : ''), { type: 'button', 'aria-label': n, onclick: () => { icon = n; draw(); } }, zk.icon(n))));
    };
    draw(); setTimeout(() => inp.select(), 30);
    const r = await zk.sheet({ title: title || (list ? 'List Info' : 'New List'), body: h('.zr-form', prev, inp, sw, ig), width: 380, buttons: [{ label: 'Cancel', value: 'no' }, { label: list ? 'Done' : 'Add List', primary: true, value: 'ok' }] });
    if (r !== 'ok') return null; return { name: (name || '').trim() || 'Untitled', color, icon };
  };
  A.newList = async (groupId) => { const o = await A.listSheet({}); if (!o) return; let id; ST.commit('New List', (d) => { id = d.addList({ ...o, group: groupId }); }); A.setView({ k: 'list', id }); };
  A.editList = async (id) => { const l = A.listById(id); if (!l) return; const o = await A.listSheet({ list: l }); if (!o) return; ST.commit('Edit List', (d) => d.setList(id, o)); };
  A.deleteList = async (id) => {
    const l = A.listById(id); if (!l) return; const n = Object.values(A.S().reminders).filter((r) => r.list === id).length;
    if (n && !(await zk.confirm(`Delete “${l.name}”?`, `This list and its ${n} reminder${n === 1 ? '' : 's'} will be deleted. You can undo this.`, 'Delete', { danger: true }))) return;
    ST.commit('Delete List', (d) => d.delList(id)); if (A.view.k === 'list' && A.view.id === id) A.setView({ k: 'smart', id: 'today' }); A.toast(`Deleted list “${l.name}”`, { label: 'Undo', run: () => ST.undo() });
  };
  A.newGroup = async () => { const n = await zk.prompt('New Group', 'New Group', { message: 'Groups keep related lists together in the sidebar.', ok: 'Create' }); if (n == null) return; ST.commit('New Group', (d) => d.addGroup(n.trim() || 'New Group')); };

  // ---------- templates ----------
  A.saveTemplate = async (listId) => {
    const l = A.listById(listId); if (!l) return; const n = await zk.prompt('Save as Template', l.name + ' Template', { message: 'Reminders (without dates) and subtasks are saved so you can create new lists from them.', ok: 'Save' }); if (n == null) return;
    const S = A.S(); const rs = Object.values(S.reminders).filter((r) => r.list === listId).sort((a, b) => a.order - b.order); const pick = (r) => ({ title: r.title, notes: r.notes, url: r.url, priority: r.priority, flag: r.flag, tags: r.tags, repeat: null });
    const items = rs.filter((r) => !r.parent).map((r) => ({ ...pick(r), kids: rs.filter((k) => k.parent === r.id).map(pick) }));
    ST.meta((s) => { s.templates = [...s.templates, { id: ST.uid(), name: n.trim() || 'Template', color: l.color, icon: l.icon, items }]; }); A.toast(`Saved template “${n.trim()}”`); A.menusDirty && A.menusDirty();
  };
  A.newFromTemplate = async (tid) => {
    const t = A.S().templates.find((x) => x.id === tid); if (!t) return; let id;
    ST.commit('New List from Template', (d) => { id = d.addList({ name: t.name.replace(/ Template$/, ''), color: t.color, icon: t.icon }); (t.items || []).forEach((it, i) => { const pid = d.add({ ...ST.newReminder({ ...it, list: id }), order: i + 1 }); (it.kids || []).forEach((k, j) => d.add({ ...ST.newReminder({ ...k, list: id, parent: pid }), order: j + 1 })); }); });
    A.setView({ k: 'list', id });
  };
  A.manageTemplates = async () => {
    const T = A.S().templates; if (!T.length) return zk.alert('No Templates', 'Use “Save as Template…” in a list’s context menu to create one.');
    const body = h('.zr-form'); const draw = () => { body.replaceChildren(...A.S().templates.map((t) => h('.row', zk.icon(t.icon || 'list'), h('span', { style: { flex: 1 } }, t.name + ` — ${t.items.length} reminders`), h('button.zk-btn.danger', { type: 'button', onclick: () => { ST.meta((s) => { s.templates = s.templates.filter((x) => x.id !== t.id); }); draw(); A.menusDirty && A.menusDirty(); } }, 'Delete')))); if (!A.S().templates.length) body.append(h('p', 'No templates.')); };
    draw(); await zk.sheet({ title: 'Templates', body, buttons: [{ label: 'Done', primary: true }] });
  };

  // ---------- settings ----------
  A.settingsSheet = async () => {
    const S = A.S(); const sound = h('input.zk-switch', { type: 'checkbox', checked: A.setting('sound', true), 'aria-label': 'Play sound' }); const h24 = h('input.zk-switch', { type: 'checkbox', checked: A.h12() === false, 'aria-label': '24-hour clock' });
    const ws = h('select.zk-select', {}, [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']].map(([v, l]) => h('option', { value: v, selected: v === A.ws() }, l)));
    const three = h('input.zk-switch', { type: 'checkbox', checked: A.threeOn(), 'aria-label': 'Show Today’s Three' }); const ad = h('input.zk-input.selectable', { type: 'time', value: A.setting('allDayTime', '09:00') }); const dl = h('select.zk-select', {}, [h('option', { value: '' }, 'Current list'), ...V().map((l) => h('option', { value: l.id, selected: l.id === A.setting('defaultList') }, l.name))]);
    function V() { return ZR.views.flatLists(S); }
    const body = h('.zr-form', h('.row', h('label', { style: { width: '170px' } }, 'Alert sound'), sound, h('button.zk-btn.bordered', { type: 'button', onclick: () => A.sounds && A.sounds.chime() }, 'Test')), h('.row', h('label', { style: { width: '170px' } }, 'All-day reminders at'), ad), h('.row', h('label', { style: { width: '170px' } }, 'Week starts on'), ws), h('.row', h('label', { style: { width: '170px' } }, '24-hour clock'), h24), h('.row', h('label', { style: { width: '170px' } }, 'New tasks in'), dl), h('.row', h('label', { style: { width: '170px' } }, 'Show Today’s Three'), three));
    const r = await zk.sheet({ title: 'Settings', body, width: 420, buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Done', primary: true, value: 'ok' }] }); if (r !== 'ok') return;
    A.setPref({ sound: sound.checked, allDayTime: ad.value || '09:00', weekStart: +ws.value, h12: h24.checked ? false : undefined, defaultList: dl.value || null, threeOn: three.checked }); A.render(true);
  };
  A.lightbox = (src) => { const lb = h('.zr-lightbox', { onclick: () => lb.remove() }, h('img', { src, alt: 'Attachment' })); const key = (e) => { if (e.key === 'Escape') { lb.remove(); removeEventListener('keydown', key, true); } }; addEventListener('keydown', key, true); document.body.append(lb); };
})();
