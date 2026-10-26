/* Time Balance: where the visible week/month goes (by calendar and category), meeting load, free-time ribbons,
   focus blocks and a weekly focus goal. Pure maths lives in lib/zc-balance.js (tested in test/run.mjs). */
(function () {
  'use strict';
  const { time: T, ical: I, balance: B } = ZC; const { S } = CAL; const el = zk.el; const H = 3600000, MIN = 60000;
  const FOCUS_COLOR = '#6e56cf'; CAL.FOCUS_COLOR = FOCUS_COLOR;
  S.set.focusGoal = S.set.focusGoal ?? 10; S.set.ribbon = S.set.ribbon ?? true; S.railTab = S.railTab || 'cals';
  const svg = (tag, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const dur = (ms) => { const m = Math.round(ms / MIN); if (m < 60) return m + 'm'; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h ${r}m` : h + 'h'; };
  CAL.fmtShort = dur;
  const opts = () => ({ workStart: S.set.workStart, workEnd: S.set.workEnd, workDays: S.set.workDays.length ? S.set.workDays : [1, 2, 3, 4, 5], minFree: Math.max(15, S.set.snap) * MIN });

  CAL.isFocusOcc = (o) => B.isFocus(o.ev);
  CAL.createFocus = (s, e, { quiet = false } = {}) => {
    const cal = CAL.defaultCal(); if (!cal) return null; const w = (t) => T.epochToWall(t, 'floating');
    const ev = CAL.blank({ cal: cal.id, title: 'Focus', start: w(s), end: w(e), tz: 'floating', color: FOCUS_COLOR, categories: ['Focus'], avail: 'busy', alarms: [], x: [{ n: B.FOCUS_KEY, p: [], v: '1' }] });
    CAL.commit('Add Focus Block', [CAL.put(ev)]); CAL.render({ anim: null }); if (!quiet) zk.toast(`Focus block protected: ${CAL.fmtTime(new Date(s))} – ${CAL.fmtTime(new Date(e))}`); return ev;
  };
  CAL.toggleFocus = (o) => { // turn an ordinary event into a focus block (or back)
    if (o.ro || I.isRecurring(o.ev)) { zk.toast(o.ro ? 'Read-only event' : 'Repeating events cannot be converted'); return; } const ev = o.ev; const b = CAL.clone(ev);
    if (B.isFocus(ev)) { ev.x = ev.x.filter((x) => x.n !== B.FOCUS_KEY); ev.categories = ev.categories.filter((c) => c !== 'Focus'); if (ev.color === FOCUS_COLOR) ev.color = ''; } else { ev.x.push({ n: B.FOCUS_KEY, p: [], v: '1' }); if (!ev.categories.includes('Focus')) ev.categories.push('Focus'); if (!ev.color) ev.color = FOCUS_COLOR; ev.avail = 'busy'; }
    const ch = CAL.put(ev); ch.before = b; CAL.commit('Toggle Focus Block', [ch]); CAL.render({ anim: null });
  };
  /** focus blocks overlapping [s,e) (ms) */
  CAL.focusConflicts = (s, e, ignoreId) => CAL.occurrences(s - 86400000, e + 86400000, { all: true }).filter((o) => B.isFocus(o.ev) && o.ev.id !== ignoreId && o.s < e && o.e > s);
  /** returns true when it is fine to go on (no clash, or the user chose to add anyway) */
  CAL.checkFocus = async (s, e, ignoreId) => { const c = CAL.focusConflicts(s, e, ignoreId); if (!c.length) return true; const when = CAL.fmtTime(new Date(c[0].s)) + ' – ' + CAL.fmtTime(new Date(c[0].e)); return await zk.confirm('This overlaps a focus block', `“${I.F(c[0], 'title')}” (${when}) is protected time. Schedule it anyway?`, 'Add Anyway'); };

  // ------------------------------------------------------------------ period + data
  CAL.balancePeriod = () => {
    const v = S.set.view, d = S.date; if (['day', 'week', 'workweek', 'days'].includes(v)) { const [f, t] = CAL.periodRange('week', d); return { from: f, to: t, kind: 'week' }; }
    return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 1), kind: 'month' };
  };
  let memo = { k: '', r: null };
  CAL.balance = () => { const p = CAL.balancePeriod(); const k = [S.rev, p.from.getTime(), p.to.getTime(), S.set.workStart, S.set.workEnd, S.set.workDays.join(), S.set.snap, S.cals.map((c) => +c.visible).join('')].join('|'); if (memo.k === k) return memo.r; const r = B.compute(CAL.occurrences(p.from.getTime(), p.to.getTime()), p.from.getTime(), p.to.getTime(), opts()); r.kind = p.kind; r.from = p.from; r.to = p.to; r.dayCount = Math.round((p.to - p.from) / 86400000); memo = { k, r }; return r; };
  /** free-window rows for the days currently on the grid */
  CAL.freeRows = (days) => { const r = B.compute(CAL.occurrences(days[0].getTime(), CAL.addDays(days[days.length - 1], 1).getTime()), days[0].getTime(), CAL.addDays(days[days.length - 1], 1).getTime(), opts()); return new Map(r.days.map((d) => [T.dayKey(new Date(d.start)), d])); };

  // ------------------------------------------------------------------ rail panel
  const donut = (items, total, label) => {
    const R = 38, C = 2 * Math.PI * R; const s = svg('svg', { viewBox: '0 0 100 100', class: 'donut', role: 'img', 'aria-label': 'Time by calendar' }); s.append(svg('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: 'var(--fill)', 'stroke-width': 12 })); let acc = 0;
    for (const it of items) { const len = total ? (it.ms / total) * C : 0; if (len < 0.4) continue; const c = svg('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: it.color, 'stroke-width': 12, 'stroke-dasharray': `${Math.max(0, len - 1.2)} ${C - Math.max(0, len - 1.2)}`, 'stroke-dashoffset': -acc, transform: 'rotate(-90 50 50)' }); const t = svg('title', {}); t.textContent = `${it.name}: ${dur(it.ms)} (${Math.round((it.ms / total) * 100)}%)`; c.append(t); s.append(c); acc += len; }
    const t1 = svg('text', { x: 50, y: 49, 'text-anchor': 'middle', class: 'dn' }); t1.textContent = dur(total) || '0m'; const t2 = svg('text', { x: 50, y: 62, 'text-anchor': 'middle', class: 'dl' }); t2.textContent = label; s.append(t1, t2); return s;
  };
  const CATPAL = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#40c8e0', '#ff375f', '#ac8e68', '#ffd60a', '#8e8e93'];
  CAL.renderBalance = (host) => {
    const r = CAL.balance(); const wrap = el('.bal'); host.append(wrap); const label = r.kind === 'week' ? 'this week' : CAL.monthName(r.from.getMonth()).toLowerCase();
    wrap.append(el('.bal-h', el('b', r.kind === 'week' ? 'Week of ' + CAL.fmt('dsh2', { month: 'short', day: 'numeric' }, r.from) : CAL.fmt('my', { month: 'long', year: 'numeric' }, r.from)), el('span.hint', dur(r.totalMs) + ' scheduled')));
    // meeting load
    const lvl = B.meterLevel(r.load); const pct = Math.min(1, r.load);
    wrap.append(el('.card', el('.card-t', 'Meeting load', el('span.pill.' + lvl, lvl)), el('.meter', { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(r.load * 100), 'aria-label': 'Meeting load' }, el('i.z.z1'), el('i.z.z2'), el('i.z.z3'), el('i.z.z4'), el('i.needle', { style: { left: pct * 100 + '%' } })), el('.hint', `${dur(r.meetingMs)} in meetings · ${Math.round(r.load * 100)}% of ${dur(r.workMs)} working time`)));
    // focus goal
    const g = B.goal(r.focusMs, S.set.focusGoal, r.dayCount);
    const step = (d) => { S.set.focusGoal = zk.clamp((S.set.focusGoal || 0) + d, 0, 40); CAL.touchMeta(); CAL.renderSide(); };
    wrap.append(el('.card', el('.card-t', zk.icon('shield'), 'Focus', g.met ? el('span.pill.light', 'goal met') : null), el('.goal', el('.goalbar', el('i', { style: { width: g.pct * 100 + '%' } })), el('.goal-r', el('span', el('b', dur(r.focusMs)), ' of ' + (g.target / H).toFixed(g.target % H ? 1 : 0) + 'h focus'), el('span.stepper', zk.btn({ icon: 'minus', title: 'Lower weekly focus goal', onClick: () => step(-1) }), el('span.gv', S.set.focusGoal + 'h/wk'), zk.btn({ icon: 'plus', title: 'Raise weekly focus goal', onClick: () => step(1) })))), el('button.zk-btn.bordered.wide', { type: 'button', onclick: (e) => suggestBlocks(e.currentTarget, r, g) }, zk.icon('shield'), 'Protect time…'), el('.hint', 'Drag along the green edge of a day in Day/Week view to protect a free window as a focus block.')));
    // by calendar
    wrap.append(el('.card', el('.card-t', 'By calendar'), el('.donut-row', donut(r.byCal, r.totalMs, label), el('.legend', r.byCal.slice(0, 6).map((c) => el('.lg', el('i', { style: { background: c.color } }), el('span.n', c.name), el('span.v', dur(c.ms))))))));
    // by category
    const cats = r.byCat.slice(0, 8); const ctot = cats.reduce((t, c) => t + c.ms, 0);
    wrap.append(el('.card', el('.card-t', 'By category'), cats.length ? el('.stack', { role: 'img', 'aria-label': 'Time by category' }, cats.map((c, i) => el('i', { style: { width: (c.ms / ctot) * 100 + '%', background: c.name === 'Focus' ? FOCUS_COLOR : c.name === 'Uncategorized' ? 'var(--fill-3)' : CATPAL[i % CATPAL.length] }, title: `${c.name}: ${dur(c.ms)}` }))) : el('.hint', 'No timed events.'), el('.legend.cols', cats.map((c, i) => el('.lg', el('i', { style: { background: c.name === 'Focus' ? FOCUS_COLOR : c.name === 'Uncategorized' ? 'var(--fill-3)' : CATPAL[i % CATPAL.length] } }), el('span.n', c.name), el('span.v', dur(c.ms)))))));
    // day by day ribbons
    const days = r.days.filter((d) => d.work || d.busy.length); const rib = el('.card', el('.card-t', 'Free time, day by day', el('span.hint', dur(r.freeMs) + ' free')));
    for (const d of r.days.slice(0, 31)) {
      const dt = new Date(d.start); if (!d.work) continue; const span = d.we - d.ws; const row = el('.rib-row' + (T.sameDay(dt, new Date()) ? '.today' : ''));
      const bar = el('.rib', { role: 'img', 'aria-label': `${CAL.fmt('dwd3', { weekday: 'long', day: 'numeric' }, dt)}: ${dur(d.freeMs)} free` });
      for (const b of B.intersect(d.busy, [[d.ws, d.we]])) bar.append(el('i.rb', { style: { left: ((b[0] - d.ws) / span) * 100 + '%', width: ((b[1] - b[0]) / span) * 100 + '%' } }));
      for (const f of d.free) { const isL = d.longest === f; bar.append(el('button.rf' + (isL ? '.long' : ''), { type: 'button', title: `${CAL.fmtTime(new Date(f[0]))} – ${CAL.fmtTime(new Date(f[1]))} free${isL ? ' (longest)' : ''} — click to protect`, style: { left: ((f[0] - d.ws) / span) * 100 + '%', width: ((f[1] - f[0]) / span) * 100 + '%' }, onclick: (e) => protectMenu(e.currentTarget, f) })); }
      row.append(el('button.rl', { type: 'button', onclick: () => { S.date = CAL.day0(dt); CAL.setView('day'); } }, CAL.weekdayName(dt.getDay(), 'short') + ' ' + dt.getDate()), bar, el('span.rv', d.longest ? dur(d.longest[1] - d.longest[0]) : '—')); rib.append(row);
      if (rib.children.length > 32) break;
    }
    if (!days.length) rib.append(el('.hint', 'No working days in this period.')); else rib.append(el('.hint', 'Bright bar marks the longest free window. Right column shows it.'));
    wrap.append(rib);
    const tg = el('label.card.row', el('input.zk-switch', { type: 'checkbox', checked: S.set.ribbon, 'aria-label': 'Show free-time ribbon on the grid', onchange: (e) => { S.set.ribbon = e.target.checked; CAL.touchMeta(); CAL.render({ anim: null }); } }), el('span', 'Show free-time ribbon on the grid')); wrap.append(tg);
  };
  const protectMenu = (anchor, f) => {
    const len = f[1] - f[0]; const items = []; for (const h of [1, 2, 3, 4]) if (len > h * H - 1) items.push({ label: `Protect ${CAL.fmtTime(new Date(f[0]))} – ${CAL.fmtTime(new Date(f[0] + h * H))} (${h}h)`, run: () => CAL.createFocus(f[0], f[0] + h * H) });
    items.push({ label: `Protect whole window (${dur(len)})`, run: () => CAL.createFocus(f[0], f[1]) }); zk.menu(items, { anchor });
  };
  const suggestBlocks = (anchor, r, g) => {
    const rest = Math.max(0, g.target - g.done); const wins = []; for (const d of r.days) for (const f of d.free) if (f[1] > Date.now() && f[1] - f[0] >= H) wins.push([Math.max(f[0], Math.ceil(Date.now() / (S.set.snap * MIN)) * S.set.snap * MIN), f[1]]);
    wins.sort((a, b) => b[1] - b[0] - (a[1] - a[0])); const items = wins.slice(0, 6).map((f) => { const use = Math.min(f[1] - f[0], rest > 0 ? Math.max(rest, H) : 2 * H, 4 * H); return { label: `${CAL.fmt('dwd4', { weekday: 'short', month: 'short', day: 'numeric' }, new Date(f[0]))}  ${CAL.fmtTime(new Date(f[0]))} – ${CAL.fmtTime(new Date(f[0] + use))}  (${dur(use)})`, run: () => CAL.createFocus(f[0], f[0] + use) }; });
    if (!items.length) { zk.toast('No free windows of an hour or more left in this period'); return; } zk.menu(items, { anchor });
  };

  // ------------------------------------------------------------------ grid ribbon: drag along a free window to protect it
  CAL.focusDrag = (e) => {
    const win = e.target.closest('.fr-w'); const col = win.closest('.tg-col'); const a = +win.dataset.a, b = +win.dataset.b; const day = CAL.cur.days[+col.dataset.i]; const hh = S.set.hourH; const v = document.querySelector('#view'); const colRect = () => col.getBoundingClientRect();
    const atY = (y) => { const m = zk.clamp(((y - colRect().top) / hh) * 60, 0, 1440); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, Math.round(m / S.set.snap) * S.set.snap).getTime(); };
    const y0 = e.clientY; let moved = false, ghost = null, s0 = zk.clamp(atY(y0), a, b), s = s0, t = s0; try { v.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const mv = (ev) => { if (!moved && Math.abs(ev.clientY - y0) < 4) return; moved = true; document.body.classList.add('dragging'); const c = zk.clamp(atY(ev.clientY), a, b); s = Math.min(s0, c); t = Math.max(s0, c); if (t - s < S.set.snap * MIN) t = Math.min(b, s + S.set.snap * MIN); if (!ghost) { ghost = el('.ev.ghost.focusg', { style: { '--c': FOCUS_COLOR, left: '2px', width: 'calc(100% - 4px)' } }, el('.ev-t', 'Focus'), el('.ev-s')); col.append(ghost); } const top = (new Date(s).getHours() * 60 + new Date(s).getMinutes()) / 60 * hh; const bot = (new Date(t).getHours() * 60 + new Date(t).getMinutes() || 1440) / 60 * hh; ghost.style.top = top + 'px'; ghost.style.height = Math.max(bot - top - 1, 10) + 'px'; ghost.lastChild.textContent = CAL.fmtTime(new Date(s)) + ' – ' + CAL.fmtTime(new Date(t)) + ' · ' + dur(t - s); };
    const up = (ev) => { v.removeEventListener('pointermove', mv); v.removeEventListener('pointerup', up); v.removeEventListener('pointercancel', cn); document.body.classList.remove('dragging'); try { v.releasePointerCapture(e.pointerId); } catch { /* ignore */ } ghost && ghost.remove(); if (ev.type === 'pointercancel') return; if (!moved) { s = a; t = Math.min(b, a + 4 * H); } CAL.createFocus(s, t); }; const cn = up;
    v.addEventListener('pointermove', mv); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', cn);
  };
})();
