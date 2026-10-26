/* Today's Three: daily planning strip + planner sheet (spring-animated drag cards), shipped tally / streak,
   postpone-with-reason and the "stuck" detector. */
(function () {
  const A = ZR.A, T = ZR.three, D = ZR.dates, h = zk.el, ST = ZR.store, V = ZR.views; const icon = zk.icon;
  const inner = A.$('#inner'); const strip = h('section.zt', { 'aria-label': 'Today’s Three' }); inner.insertBefore(strip, A.$('#rows'));
  A.threeOn = () => A.setting('threeOn', true);
  const today = () => D.today(new Date());
  A.plan = () => { const p = A.S().prefs.three; return p && p.date === today() ? p : null; };
  const open = () => Object.values(A.S().reminders);
  const stats = () => T.streak(open(), new Date());
  const tallyText = (s) => `${s.shippedToday} shipped today${s.current ? ` · ${s.current}-day streak` : ''}`;
  A.tallyText = () => tallyText(stats());

  // ---------- strip ----------
  function cardEl(r, rank, why) {
    const done = r.done || (A.lingering.get(r.id) || {}).visual === 'done'; const lc = A.listColor(r);
    return h('.zt-card' + (done ? '.done' : '') + (A.sel.has(r.id) ? '.sel' : ''), { 'data-id': r.id, style: { '--lc': lc, '--i': rank - 1 } },
      h('button.chk' + (done ? '.on' : ''), { type: 'button', role: 'checkbox', 'aria-checked': done, 'aria-label': 'Complete ' + r.title, onclick: (e) => { e.stopPropagation(); A.sounds && A.sounds.unlock(); A.toggleDone([r.id]); } }, h('span.ring'), h('span.fill', icon('check'))),
      h('.tx', h('.t', r.title), h('.s', r.due ? A.dueText(r) : (why && why[0]) || 'No date'), T.isStuck(r) ? h('.stk', icon('triangle-alert', 11), 'Stuck') : null), h('.rk', String(rank)));
  }
  function renderStrip() {
    const show = A.threeOn() && A.view.k === 'smart' && A.view.id === 'today'; strip.style.display = show ? '' : 'none'; if (!show) return; const S = A.S(); const st = stats(); const plan = A.plan();
    const stuck = open().filter(T.isStuck);
    const head = h('.zh', h('.ti', icon('sparkles', 15), h('span', 'Today’s Three')), h('.tl', { title: 'Counted on this device only' }, tallyText(st)), h('.sp'), stuck.length ? h('button.zk-btn.warn', { type: 'button', onclick: () => A.splitSheet(stuck[0].id) }, icon('triangle-alert', 13), `${stuck.length} stuck`) : null, h('button.zk-btn.bordered', { type: 'button', onclick: () => A.planSheet() }, plan ? 'Replan…' : 'Plan my day…'));
    const body = h('.zc');
    if (plan) { const rs = plan.ids.map((id) => S.reminders[id]).filter(Boolean); rs.forEach((r, i) => body.append(cardEl(r, i + 1))); for (let i = rs.length; i < 3; i++) body.append(h('button.zt-card.empty', { type: 'button', onclick: () => A.planSheet() }, icon('plus'), h('span', 'Pick a task'))); }
    else body.append(h('.zt-cta', h('span', 'Choose up to three things that matter most today. Everything else can wait.'), h('button.zk-btn.primary', { type: 'button', style: { height: '28px', padding: '0 14px' }, onclick: () => A.planSheet() }, 'Choose my three')));
    const was = strip.dataset.plan; strip.replaceChildren(head, body); strip.dataset.plan = plan ? plan.ids.join() : '';
    if (plan && was !== strip.dataset.plan) body.classList.add('enter');
    if (plan && plan.ids.length && plan.ids.every((id) => !S.reminders[id] || S.reminders[id].done) && !plan.celebrated) { ST.meta((s) => { s.prefs.three = { ...s.prefs.three, celebrated: true }; }); A.toast('That’s your three. Nicely done.', { ms: 3500 }); }
  }
  strip.addEventListener('click', (e) => { const c = e.target.closest('.zt-card[data-id]'); if (c && !e.target.closest('.chk')) { A.select(c.dataset.id); const el = A.$(`.rw[data-id="${c.dataset.id}"]`); el && el.scrollIntoView({ block: 'nearest' }); } });
  A.renderers.three = renderStrip;
  const origMain = A.renderers.main; A.renderers.main = (f) => { origMain(f); renderStrip(); };
  const origSel = A.refreshSel; A.refreshSel = () => { origSel(); strip.querySelectorAll('.zt-card[data-id]').forEach((c) => c.classList.toggle('sel', A.sel.has(c.dataset.id))); };

  // ---------- planner sheet ----------
  A.planSheet = () => {
    const S = A.S(); const all = open(); const ranked = T.suggest(all, new Date(), 14); const info = new Map(ranked.map((x) => [x.r.id, x])); const cur = A.plan();
    let slots = [null, null, null]; const seed = cur ? cur.ids.filter((id) => S.reminders[id] && !S.reminders[id].done) : ranked.slice(0, 3).map((x) => x.r.id); seed.slice(0, 3).forEach((id, i) => (slots[i] = id));
    let pool = ranked.map((x) => x.r.id); let query = ''; const root = h('.zp'); const slotEls = []; let dragging = false;
    const rOf = (id) => S.reminders[id]; const reasons = (id) => (info.get(id) || T.score(rOf(id), new Date())).why;
    const card = (id, kind, slot) => {
      const r = rOf(id); const x = info.get(id) || T.score(r, new Date()); const lc = A.listColor(r);
      const el = h('.pc' + (kind === 'slot' ? '.in' : ''), { 'data-id': id, 'data-kind': kind, 'data-slot': slot ?? '', tabindex: 0, style: { '--lc': lc }, role: 'button', 'aria-label': r.title + (kind === 'slot' ? ', in slot ' + (slot + 1) : ', suggestion') }, h('.hd', h('span.t', r.title), kind === 'slot' ? h('button.x', { type: 'button', 'aria-label': 'Remove', onclick: (e) => { e.stopPropagation(); slots[slot] = null; draw(); } }, icon('x', 12)) : null), h('.rs', reasons(id).slice(0, 3).map((w) => h('span.zr-chip' + (/Overdue|Stuck/.test(w) ? '.red' : /priority|Flagged/.test(w) ? '.pri' : ''), w))), T.isStuck(r) ? h('.stk', icon('triangle-alert', 11), 'Stuck — consider splitting it') : null);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (kind === 'pool') addFirst(id); } });
      el.addEventListener('pointerdown', (e) => startDrag(e, el, id, kind, slot)); return el;
    };
    const addFirst = (id) => { const i = slots.indexOf(null); if (i < 0) return A.toast('Your three are full — remove one first.', { ms: 1800 }); slots[i] = id; draw(); };
    function visiblePool() { const used = new Set(slots); if (query.trim()) { const q = query.toLowerCase(); return all.filter((r) => !r.done && !used.has(r.id) && r.title.toLowerCase().includes(q)).slice(0, 12).map((r) => r.id); } return pool.filter((id) => !used.has(id)); }
    function draw() {
      const sl = h('.zs'); slotEls.length = 0;
      slots.forEach((id, i) => { const s = h('.slot' + (id ? '.full' : ''), { 'data-slot': i, 'aria-label': 'Slot ' + (i + 1) }, h('.n', String(i + 1)), id ? card(id, 'slot', i) : h('.ph', 'Drop a task here')); slotEls.push(s); sl.append(s); });
      const search = h('input.zk-input.selectable', { placeholder: 'Find any open task…', value: query, 'aria-label': 'Find a task', style: { width: '100%' }, oninput: (e) => { query = e.target.value; const pos = e.target.selectionStart; drawPool(); } });
      const p = h('.zl'); const vp = visiblePool(); vp.forEach((id) => p.append(card(id, 'pool')));
      if (!vp.length) p.append(h('.ph2', query ? 'No matching tasks.' : ranked.length ? 'Every suggestion is in your three.' : 'Nothing needs attention right now. Add a task or search above.'));
      root.replaceChildren(h('p.hint', 'Drag tasks into your three, or press Return on a suggestion. Suggestions are ranked by due date, priority, age and how often a task has been postponed.'), sl, h('.zk-label', { style: { margin: '10px 0 4px' } }, query ? 'Search results' : 'Suggested'), search, h('.zlw', p)); poolEl = p;
      if (query) { const i = root.querySelector('input'); i.focus(); i.setSelectionRange(query.length, query.length); }
    }
    let poolEl = null; function drawPool() { const p = h('.zl'); visiblePool().forEach((id) => p.append(card(id, 'pool'))); if (!p.children.length) p.append(h('.ph2', 'No matching tasks.')); poolEl.replaceWith(p); poolEl = p; }
    // pointer drag with springs
    function startDrag(e, el, id, kind, from) {
      if (e.button !== 0 || e.target.closest('.x')) return; const x0 = e.clientX, y0 = e.clientY; let on = false, sx, sy; let hot = null; const r0 = el.getBoundingClientRect();
      const move = (ev) => {
        if (!on) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; on = true; dragging = true; el.classList.add('lift'); el.style.zIndex = 5; el.style.pointerEvents = 'none'; el.style.position = 'relative'; document.body.style.cursor = 'grabbing'; }
        sx = ev.clientX - x0; sy = ev.clientY - y0; el.style.transform = `translate3d(${sx}px,${sy}px,0) scale(1.03) rotate(${zk.clamp(sx / 60, -3, 3)}deg)`;
        const t = document.elementFromPoint(ev.clientX, ev.clientY); const s = t && t.closest('.slot'); const pool = t && t.closest('.zlw'); const target = s || (kind === 'slot' && pool ? pool : null);
        if (target !== hot) { hot && hot.classList.remove('hot'); hot = target; hot && hot.classList.add('hot'); }
      };
      const up = () => {
        removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); document.body.style.cursor = ''; if (!on) { return; } hot && hot.classList.remove('hot'); const target = hot;
        const finish = () => { dragging = false; if (target && target.classList.contains('slot')) { const to = +target.dataset.slot; const occupant = slots[to]; if (kind === 'slot') { slots[from] = occupant; slots[to] = id; } else { slots[to] = occupant ? id : id; } if (kind === 'pool' && occupant) { /* occupant returns to pool automatically */ } } else if (target && kind === 'slot') slots[from] = null; draw(); };
        let tx = 0, ty = 0; if (target && target.classList.contains('slot')) { const rr = target.getBoundingClientRect(); tx = rr.left + rr.width / 2 - (r0.left + r0.width / 2); ty = rr.top + rr.height / 2 - (r0.top + r0.height / 2); }
        const spx = ZR.anim.spring(sx, { response: 0.3, damping: 0.8, eps: 0.3 }), spy = ZR.anim.spring(sy, { response: 0.3, damping: 0.8, eps: 0.3 }); const apply = () => { el.style.transform = `translate3d(${spx.x}px,${spy.x}px,0) scale(${target ? 0.98 : 1})`; }; spx.fn = apply; spy.fn = apply;
        spy.target(ty); spx.target(tx, target ? finish : () => { dragging = false; el.style.transform = ''; el.style.zIndex = ''; el.style.pointerEvents = ''; el.classList.remove('lift'); });
      };
      addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    }
    root.addEventListener('click', (e) => { const c = e.target.closest('.pc[data-kind="pool"]'); if (c && !dragging) addFirst(c.dataset.id); });
    draw();
    zk.sheet({ title: 'Today’s Three', body: root, width: 680, buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Start my day', primary: true, value: 'ok', onClick: () => { const ids = slots.filter(Boolean); ST.meta((s) => { s.prefs.three = { date: today(), ids }; }); A.setView({ k: 'smart', id: 'today' }); A.render(true); A.toast(ids.length ? 'Your three are set.' : 'Plan cleared.', { ms: 1800 }); } }] });
  };

  // ---------- postpone with reason ----------
  A.postpone = (ids, reason) => {
    const S = A.S(); const rs = ids.map((i) => S.reminders[i]).filter((r) => r && !r.done); if (!rs.length) return; const tg = T.postponeTarget(reason, new Date(), A.ws()); let newlyStuck = null;
    ST.commit('Postpone', (d) => rs.forEach((r) => { const n = (r.postponed || 0) + 1; const o = { due: tg.due, time: tg.due ? r.time : null, postponed: n, ppLast: reason }; if (!tg.due) { o.repeat = null; o.early = null; } if (tg.tag) o.tags = [...new Set([...(r.tags || []), tg.tag])]; d.set(r.id, o); if (n === 3 && !newlyStuck && !r.parent) newlyStuck = r.id; }));
    const p = A.S().prefs.three; if (p && p.ids.some((i) => ids.includes(i))) ST.meta((s) => { s.prefs.three = { ...s.prefs.three, ids: s.prefs.three.ids.filter((i) => !ids.includes(i)) }; });
    const label = { tomorrow: 'tomorrow', weekend: 'the weekend', nextweek: 'next week', someday: 'someday' }[reason];
    A.toast(`Postponed to ${label}`, { label: 'Undo', run: () => ST.undo(), kind: 'postpone' }); if (newlyStuck) setTimeout(() => A.splitSheet(newlyStuck), 450);
  };
  A.postponePop = (anchor, ids) => {
    ids = ids || A.selIds(); if (!ids.length) return; const root = h('.zq', h('.zk-label', { style: { padding: '2px 8px 6px' } }, ids.length > 1 ? `Postpone ${ids.length} tasks until…` : 'Postpone until…'), T.REASONS.map(([k, l], i) => h('button.zq-b', { type: 'button', onclick: () => { zk.closePop(); A.postpone(ids, k); } }, h('span', l), h('kbd.zk-kbd', String(i + 1)))));
    const el = A.$(`.rw[data-id="${ids[0]}"]`) || A.$('#scroll'); zk.popover(anchor || el, root, { onClose: () => removeEventListener('keydown', key, true) });
    const key = (e) => { const i = '1234'.indexOf(e.key); if (i >= 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); zk.closePop(); A.postpone(ids, T.REASONS[i][0]); } }; addEventListener('keydown', key, true);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'p' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.zk-scrim,.zk-pop:not(.out)')) return; const t = e.target; if (t.closest && t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return; if (!A.sel.size) return; e.preventDefault(); A.postponePop(null, [...A.sel]);
  });

  // ---------- stuck: split into subtasks ----------
  A.splitSheet = async (id) => {
    const r = A.S().reminders[id]; if (!r) return; const n = r.postponed || 0;
    if (r.parent) return zk.alert('Already a subtask', 'Subtasks can’t be split further. Try making it a top-level task first.');
    const ta = h('textarea.zk-textarea.selectable', { rows: 5, placeholder: 'One small step per line\nOpen the document\nDraft the first paragraph\nSend it for review', 'aria-label': 'Subtasks', style: { width: '100%' } });
    const r2 = await zk.sheet({ title: n >= 3 ? `“${r.title}” looks stuck` : `Split “${r.title}”`, message: n >= 3 ? `You’ve postponed this ${n} times. Breaking it into small steps often makes it easier to start.` : 'Break this task into smaller steps.', body: ta, width: 440, buttons: [{ label: 'Not Now', value: 'no' }, { label: 'Split into Subtasks', primary: true, value: 'ok' }] });
    if (r2 !== 'ok') return; const lines = ta.value.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()).filter(Boolean); if (!lines.length) return;
    ST.commit('Split into Subtasks', (d) => { lines.forEach((t, i) => d.add({ list: r.list, parent: id, title: t, order: i + 1 })); d.set(id, { postponed: 0, collapsed: false }); }); A.toast(`Added ${lines.length} subtask${lines.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => ST.undo() });
  };
})();
