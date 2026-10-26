/* ZengCalendar interactions: pointer-event drag to create / move / resize / duplicate, selection, context menus. */
(function () {
  'use strict';
  const { time: T, ical: I } = ZC; const { S } = CAL; const el = zk.el; const MIN = 60000, DAY = T.DAY;
  const $ = (s, r = document) => r.querySelector(s);
  const view = () => $('#view');
  const ymd = (d) => d.getFullYear() + '-' + T.pad(d.getMonth() + 1) + '-' + T.pad(d.getDate());
  const dayFromKey = (k) => new Date(Math.floor(k / 10000), Math.floor((k % 10000) / 100) - 1, k % 100);
  const atMin = (day, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
  const snapStep = () => S.set.snap || 15;
  const snap = (m, mode = 'round') => { const s = snapStep(); return (mode === 'floor' ? Math.floor(m / s) : mode === 'ceil' ? Math.ceil(m / s) : Math.round(m / s)) * s; };
  const title = (o) => I.F(o, 'title') || 'New Event';
  const occOf = (elm) => { const e = elm && elm.closest && elm.closest('[data-id]'); return e ? CAL.cur.occMap.get(e.dataset.id) || CAL.occById(e.dataset.id) : null; };

  // ------------------------------------------------------------------ selection
  CAL.select = (id) => { S.sel = id; document.querySelectorAll('.ev.sel,.ag-row.sel').forEach((x) => x.classList.remove('sel')); if (id) document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((x) => x.classList.add('sel')); CAL.onSelect && CAL.onSelect(); };
  CAL.selected = () => (S.sel ? CAL.cur.occMap.get(S.sel) || CAL.occById(S.sel) : null);
  CAL.focusDay = (d) => { S.date = CAL.day0(d); S.miniDate = new Date(d.getFullYear(), d.getMonth(), 1); document.querySelectorAll('.mv-cell.focus,.tg-dh.focus').forEach((x) => x.classList.remove('focus')); const c = $(`.mv-cell[data-day="${T.dayKey(d)}"]`); if (c) c.classList.add('focus'); CAL.renderSide(); CAL.updateToolbar(); };

  // ------------------------------------------------------------------ scope question for repeating events
  CAL.askScope = async (o, verb = 'Save') => {
    if (!I.isRecurring(o.ev)) return 'all';
    const first = o.key === o.ev.start; const buttons = [{ label: 'Cancel', value: null }, { label: 'This Event', value: 'this' }];
    if (!first) buttons.push({ label: 'This and Future Events', value: 'future' });
    buttons.push({ label: 'All Events', value: 'all', primary: true });
    return await zk.sheet({ title: verb === 'Delete' ? 'Delete a repeating event' : 'This is a repeating event', message: verb === 'Delete' ? `“${title(o)}” repeats. What do you want to delete?` : `What do you want to ${verb.toLowerCase()}?`, buttons, width: 440 });
  };
  /** apply a field set to an occurrence (asks about scope), then re-render. Returns true when applied. */
  CAL.applyEdit = async (o, f, { copy = false, verb = 'Change', label = 'Edit Event' } = {}) => {
    let changes;
    if (copy) { const e = CAL.createFrom(f, o.ev.cal); changes = [CAL.put(e)]; label = 'Duplicate Event'; }
    else { const scope = await CAL.askScope(o, verb); if (!scope) { CAL.render({ anim: null }); return false; } changes = CAL.editOccurrence(o, f, scope); }
    CAL.commit(label, changes); const ev = changes[changes.length - 1].after; CAL.render({ anim: null }); if (ev) { const n = CAL.cur.occs.find((x) => x.ev.id === ev.id && Math.abs(x.s - I.base(S.ev.get(ev.id)).s) < 1) || CAL.cur.occs.find((x) => x.ev.id === ev.id); if (n) CAL.select(n.id); } return true;
  };
  CAL.deleteOcc = async (o) => {
    if (o.ro) return; const scope = await CAL.askScope(o, 'Delete'); if (!scope) return;
    CAL.commit('Delete Event', CAL.deleteOccurrence(o, scope)); S.sel = null; CAL.render({ anim: null }); zk.toast('Event deleted');
  };
  CAL.duplicateOcc = (o) => { const f = CAL.fieldsOfOcc(o); const e = CAL.createFrom(f, o.ev.cal); CAL.commit('Duplicate Event', [CAL.put(e)]); CAL.render({ anim: null }); const n = CAL.cur.occs.find((x) => x.ev.id === e.id); if (n) CAL.select(n.id); };
  CAL.copyOcc = (o) => { S.clip = CAL.fieldsOfOcc(o); S.clip.dur = o.e - o.s; zk.toast('Event copied'); };
  CAL.pasteAt = (when) => { // when: Date (timed) — keeps the copied event's length
    if (!S.clip) return; const f = Object.assign({}, S.clip); const dur = f.dur; delete f.dur; let at = when || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 9);
    if (f.allDay) { const span = Math.max(1, Math.round((T.dayNum(+f.end.slice(0, 4), +f.end.slice(5, 7), +f.end.slice(8, 10)) - T.dayNum(+f.start.slice(0, 4), +f.start.slice(5, 7), +f.start.slice(8, 10))))); f.start = ymd(at); f.end = ymd(CAL.addDays(at, span)); }
    else { f.tz = 'floating'; f.endTz = ''; f.start = T.epochToWall(at.getTime(), 'floating'); f.end = T.epochToWall(at.getTime() + dur, 'floating'); }
    const e = CAL.createFrom(f, f.cal); CAL.commit('Paste Event', [CAL.put(e)]); CAL.render({ anim: null }); const n = CAL.cur.occs.find((x) => x.ev.id === e.id); if (n) CAL.select(n.id);
  };

  // ------------------------------------------------------------------ geometry helpers (time grid)
  const grid = () => { const cols = $('.tg-cols'); if (!cols) return null; const r = cols.getBoundingClientRect(); const n = CAL.cur.days.length; return { r, n, colW: r.width / n, hh: S.set.hourH, scroll: $('.tg-scroll'), cols }; };
  const cellOf = (g, e) => ({ i: zk.clamp(Math.floor((e.clientX - g.r.left) / g.colW), 0, g.n - 1), m: zk.clamp(((e.clientY - g.r.top) / g.hh) * 60, 0, 1440) });
  const adRect = () => { const c = $('.tg-adc'); return c ? c.getBoundingClientRect() : null; };
  const monthCell = (e) => { for (const c of document.querySelectorAll('.mv-cell')) { const r = c.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return c; } return null; };
  const autoScroll = (g, getY) => { const sc = g.scroll; let t = setInterval(() => { const r = sc.getBoundingClientRect(); const y = getY(); if (y < r.top + 36) sc.scrollTop -= Math.min(18, (r.top + 36 - y) / 2 + 2); else if (y > r.bottom - 28) sc.scrollTop += Math.min(18, (y - r.bottom + 28) / 2 + 2); }, 24); return () => clearInterval(t); };

  // generic pointer tracker
  function track(e, h) {
    const v = view(); const sx = e.clientX, sy = e.clientY; let moved = false, done = false; const id = e.pointerId; try { v.setPointerCapture(id); } catch { /* ignore */ }
    const fin = (ev, cancelled) => { if (done) return; done = true; v.removeEventListener('pointermove', mv); v.removeEventListener('pointerup', up); v.removeEventListener('pointercancel', cn); removeEventListener('keydown', kd, true); document.body.classList.remove('dragging', 'copying'); try { v.releasePointerCapture(id); } catch { /* ignore */ } h.end && h.end(ev, moved, cancelled); };
    const mv = (ev) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; if (!moved) { moved = true; document.body.classList.add('dragging'); h.start && h.start(ev); } document.body.classList.toggle('copying', ev.altKey && h.copy); h.move(ev); };
    const up = (ev) => fin(ev, false), cn = (ev) => fin(ev, true); const kd = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fin(ev, true); } };
    v.addEventListener('pointermove', mv); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', cn); addEventListener('keydown', kd, true);
  }
  const ghostEl = (color, text) => el('.ev.ghost', { style: { '--c': color } }, el('.ev-t', text || 'New Event'), el('.ev-s'));

  // ------------------------------------------------------------------ pointer down router
  function onDown(e) {
    if (e.button !== 0 || e.target.closest('.mv-more, .mv-dn, .tg-dh, .tg-gut, .ag-more')) return;
    zk.closePop && void 0;
    const evEl = e.target.closest('.ev'); const rz = e.target.closest('.rz');
    if (evEl && evEl.classList.contains('ghost')) return;
    if (evEl) { const o = occOf(evEl); if (!o) return; CAL.select(o.id); if (o.ro) return; if (CAL.cur.view === 'agenda') return; if (rz) return startResize(e, evEl, o, rz); return startMove(e, evEl, o); }
    if (e.target.closest('.tg-col')) return startCreateTimed(e);
    if (e.target.closest('.tg-adc')) return startCreateAllDayRow(e);
    if (e.target.closest('.mv-cell, .mv-bars')) return startCreateMonth(e);
    if (!e.target.closest('.ag-row, .ym, .mini')) CAL.select(null);
  }

  // ------------------------------------------------------------------ create: timed
  function startCreateTimed(e) {
    const g = grid(); if (!g) return; CAL.select(null); const col = e.target.closest('.tg-col'); const i0 = +col.dataset.i; const m0 = cellOf(g, e).m; const cal = CAL.defaultCal(); if (!cal) return; let ghost, a = snap(m0, 'floor'), b = a + snapStep(); let stop;
    track(e, {
      start() { ghost = ghostEl(cal.color); col.append(ghost); stop = autoScroll(g, () => lastY); },
      move(ev) { lastY = ev.clientY; const g2 = grid(); const m = cellOf(g2, ev).m; let s = snap(m0, 'floor'), t = snap(m, 'ceil'); if (m < m0) { s = snap(m, 'floor'); t = snap(m0, 'ceil'); } if (t - s < snapStep()) t = s + snapStep(); a = s; b = Math.min(t, 1440); const h = ((b - a) / 60) * g.hh - 1; Object.assign(ghost.style, { top: (a / 60) * g.hh + 'px', height: Math.max(h, 12) + 'px', left: '2px', width: 'calc(100% - 4px)' }); ghost.lastChild.textContent = fmtM(a) + ' – ' + fmtM(b); },
      end(ev, moved, cancelled) { stop && stop(); if (!moved || cancelled) { ghost && ghost.remove(); return; } const day = CAL.cur.days[i0]; CAL.quickCreate({ start: atMin(day, a), end: atMin(day, b), allDay: false, anchor: ghost, onCancel: () => ghost.remove() }); },
    });
    let lastY = e.clientY;
  }
  const fmtM = (m) => CAL.fmtTime(atMin(new Date(2000, 0, 1), m));

  // ------------------------------------------------------------------ create: all-day (time grid row and month)
  function startCreateAllDayRow(e) {
    const adc = $('.tg-adc'); const n = CAL.cur.days.length; const r0 = adc.getBoundingClientRect(); const idx = (ev) => zk.clamp(Math.floor(((ev.clientX - r0.left) / r0.width) * n), 0, n - 1); const i0 = idx(e); let a = i0, b = i0, ghost; const cal = CAL.defaultCal(); if (!cal) return; CAL.select(null);
    track(e, { start() { ghost = el('.ev.bar.ghost', { style: { '--c': cal.color, top: '3px' } }, el('span.t', 'New Event')); adc.append(ghost); }, move(ev) { const i = idx(ev); a = Math.min(i0, i); b = Math.max(i0, i); Object.assign(ghost.style, { left: `calc(${(a / n) * 100}% + 2px)`, width: `calc(${((b - a + 1) / n) * 100}% - 4px)` }); },
      end(ev, moved, cancelled) { if (!moved || cancelled) { ghost && ghost.remove(); return; } CAL.quickCreate({ start: CAL.cur.days[a], end: CAL.addDays(CAL.cur.days[b], 1), allDay: true, anchor: ghost, onCancel: () => ghost.remove() }); } });
  }
  function startCreateMonth(e) {
    const c0 = monthCell(e); if (!c0) return; const k0 = +c0.dataset.day; const cal = CAL.defaultCal(); let a = k0, b = k0; const paint = () => document.querySelectorAll('.mv-cell').forEach((c) => c.classList.toggle('rng', +c.dataset.day >= a && +c.dataset.day <= b)); let ranged = false; if (e.target.closest('.ev')) return;
    track(e, { move(ev) { const c = monthCell(ev); if (!c || !cal) return; const k = +c.dataset.day; a = Math.min(k0, k); b = Math.max(k0, k); ranged = true; paint(); },
      end(ev, moved, cancelled) { document.querySelectorAll('.mv-cell.rng').forEach((c) => c.classList.remove('rng')); if (!moved || cancelled) { if (!cancelled) { CAL.select(null); CAL.focusDay(dayFromKey(k0)); } return; } if (!ranged || !cal) return; const first = $(`.mv-cell[data-day="${a}"]`); CAL.quickCreate({ start: dayFromKey(a), end: CAL.addDays(dayFromKey(b), 1), allDay: true, anchor: first || c0 }); } });
  }
  function onDbl(e) {
    if (e.target.closest('.rz')) return; const evEl = e.target.closest('.ev, .ag-row');
    if (evEl) { const o = occOf(evEl); if (o) { if (o.ro) CAL.showInfo(o); else CAL.openEditor(o); } return; }
    const cal = CAL.defaultCal(); if (!cal && !CAL.writableCals().length) return;
    const col = e.target.closest('.tg-col'); if (col) { const g = grid(); const c = cellOf(g, e); const a = snap(c.m, 'floor'); const day = CAL.cur.days[+col.dataset.i]; CAL.quickCreate({ start: atMin(day, a), end: atMin(day, a + (S.set.defaultDur || 60)), allDay: false, anchorPoint: { x: e.clientX, y: e.clientY } }); return; }
    if (e.target.closest('.tg-adc')) { const adc = $('.tg-adc'); const r = adc.getBoundingClientRect(); const i = zk.clamp(Math.floor(((e.clientX - r.left) / r.width) * CAL.cur.days.length), 0, CAL.cur.days.length - 1); const d = CAL.cur.days[i]; CAL.quickCreate({ start: d, end: CAL.addDays(d, 1), allDay: true, anchorPoint: { x: e.clientX, y: e.clientY } }); return; }
    const cell = e.target.closest('.mv-cell') || monthCell(e); if (cell && !e.target.closest('.mv-more')) { const d = dayFromKey(+cell.dataset.day); CAL.quickCreate({ start: d, end: CAL.addDays(d, 1), allDay: true, anchor: cell }); }
  }

  // ------------------------------------------------------------------ move
  function startMove(e, evEl, o) {
    const kind = evEl.classList.contains('chip') ? 'chip' : evEl.classList.contains('bar') ? 'bar' : 'timed'; const inMonth = CAL.cur.view === 'month'; const g = kind === 'timed' ? grid() : CAL.cur.view === 'month' ? null : grid(); const f0 = CAL.fieldsOfOcc(o);
    let ghost = null, target = null, stop; let lastY = e.clientY; const startMs = o.s, endMs = o.e;
    // anchor for timed: minute offset inside the dragged segment, and the segment's local start
    let segStart = null, grab = 0, segDayIdx = 0;
    if (kind === 'timed') { const col = evEl.closest('.tg-col'); segDayIdx = +col.dataset.i; const segMin = (parseFloat(evEl.style.top) / g.hh) * 60; segStart = atMin(CAL.cur.days[segDayIdx], segMin); grab = cellOf(g, e).m - segMin; }
    const grabCell = inMonth ? monthCell(e) : null; const grabK = grabCell ? +grabCell.dataset.day : null; const adRow = !inMonth ? $('.tg-adc') : null; const grabAd = kind === 'bar' && adRow ? zk.clamp(Math.floor(((e.clientX - adRow.getBoundingClientRect().left) / adRow.getBoundingClientRect().width) * CAL.cur.days.length), 0, CAL.cur.days.length - 1) : 0;
    const apply = (ev) => { // compute target times from pointer
      if (inMonth) { const c = monthCell(ev); if (!c) return; const dd = Math.round((dayFromKey(+c.dataset.day) - dayFromKey(grabK)) / DAY); const ns = shiftDays(o, dd); target = { s: ns.s, e: ns.e, allDay: o.allDay, dd }; document.querySelectorAll('.mv-cell').forEach((x) => x.classList.remove('rng')); const sd = CAL.day0(new Date(ns.s)); const ed = CAL.day0(new Date(Math.max(ns.s, ns.e - 1))); document.querySelectorAll('.mv-cell').forEach((x) => { const k = +x.dataset.day; x.classList.toggle('rng', k >= T.dayKey(sd) && k <= T.dayKey(ed)); }); evEl.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy}px)`; return; }
      const g2 = grid(); const ar = adRect(); const inAd = ar && ev.clientY < ar.bottom && ev.clientY >= ar.top - 2; const c = cellOf(g2, ev);
      if (inAd || (kind === 'bar' && ev.clientY < g2.r.top)) { // all-day target
        const i = zk.clamp(Math.floor(((ev.clientX - ar.left) / ar.width) * g2.n), 0, g2.n - 1); let ns, ne; if (kind === 'bar') { const dd = i - grabAd; const sh = shiftDays(o, dd); ns = sh.s; ne = sh.e; target = { s: ns, e: ne, allDay: o.allDay, dd, bar: true }; } else { const d = CAL.cur.days[i]; ns = d.getTime(); ne = CAL.addDays(d, 1).getTime(); target = { s: ns, e: ne, allDay: true, toAllDay: true }; }
        showGhost('bar', i, kind === 'bar' ? Math.round((target.e - target.s) / DAY) || 1 : 1); return;
      }
      if (kind === 'timed') { const m = snap(c.m - grab, 'round'); const ms = Math.max(0, Math.min(m, 1440 - snapStep())); const ns = atMin(CAL.cur.days[c.i], ms); const dl = ns.getTime() - segStart.getTime(); target = { s: startMs + dl, e: endMs + dl, allDay: false }; showGhost('timed', c.i, ms, (endMs - startMs) / MIN); }
      else { const m = snap(c.m, 'floor'); const ns = atMin(CAL.cur.days[c.i], zk.clamp(m, 0, 1440 - snapStep())); const dur = o.allDay ? S.set.defaultDur || 60 : endMs - startMs; target = { s: ns.getTime(), e: ns.getTime() + (o.allDay ? dur * MIN : dur), allDay: false, toTimed: true }; showGhost('timed', c.i, atM(ns), (target.e - target.s) / MIN); }
    };
    const atM = (d) => d.getHours() * 60 + d.getMinutes();
    const showGhost = (type, i, a, dur) => {
      if (!ghost) { ghost = ghostEl(o.color, title(o)); ghost.classList.add('drag'); } const g2 = grid();
      if (type === 'bar') { const adc = $('.tg-adc'); if (ghost.parentNode !== adc) { ghost.className = 'ev bar ghost drag'; adc.append(ghost); } const n = g2.n; Object.assign(ghost.style, { top: '3px', height: '', left: `calc(${(i / n) * 100}% + 2px)`, width: `calc(${(Math.min(a, n - i) / n) * 100}% - 4px)`, '--c': o.color }); ghost.firstChild.textContent = title(o); ghost.lastChild.textContent = ''; return; }
      const col = document.querySelector(`.tg-col[data-i="${i}"]`); if (ghost.parentNode !== col) { ghost.className = 'ev ghost drag'; col.append(ghost); } const end = Math.min(a + dur, 1440);
      Object.assign(ghost.style, { top: (a / 60) * g2.hh + 'px', height: Math.max(((end - a) / 60) * g2.hh - 1, 14) + 'px', left: '2px', width: 'calc(100% - 4px)' }); ghost.firstChild.textContent = title(o); ghost.lastChild.textContent = fmtM(a) + ' – ' + fmtM(Math.min(a + dur, 1440));
    };
    const sx = e.clientX, sy = e.clientY;
    track(e, { copy: true,
      start() { evEl.classList.add('dragging'); document.querySelectorAll(`[data-id="${CSS.escape(o.id)}"]`).forEach((x) => x.classList.add('dragging')); if (g) stop = autoScroll(g, () => lastY); },
      move(ev) { lastY = ev.clientY; apply(ev); },
      async end(ev, moved, cancelled) {
        stop && stop(); document.querySelectorAll('.mv-cell.rng').forEach((x) => x.classList.remove('rng')); evEl.style.transform = ''; ghost && ghost.remove(); document.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
        if (!moved || cancelled || !target) return; if (target.s === o.s && target.e === o.e && target.allDay === o.allDay && !ev.altKey) return;
        const f = Object.assign({}, f0); let ns = target.s, ne = target.e;
        if (target.allDay) { f.allDay = true; f.tz = 'floating'; f.endTz = ''; const sd = CAL.day0(new Date(ns)); let ed = CAL.day0(new Date(Math.max(ns, ne - 1))); f.start = ymd(sd); f.end = ymd(CAL.addDays(ed, 1)); if (target.toAllDay) f.end = ymd(CAL.addDays(sd, 1)); }
        else { f.allDay = false; if (o.allDay) { f.tz = 'floating'; f.endTz = ''; } f.start = T.epochToWall(ns, f.tz || 'floating'); f.end = T.epochToWall(ne, f.endTz || f.tz || 'floating'); }
        await CAL.applyEdit(o, f, { copy: ev.altKey, verb: 'Change', label: 'Move Event' });
      } });
  }
  /** shift an occurrence by whole local days keeping its wall-clock time; returns {s,e} epoch */
  function shiftDays(o, dd) { const s = new Date(o.s); const ns = new Date(s.getFullYear(), s.getMonth(), s.getDate() + dd, s.getHours(), s.getMinutes(), s.getSeconds()).getTime(); if (o.allDay) { const e = new Date(o.e); const ne = new Date(e.getFullYear(), e.getMonth(), e.getDate() + dd).getTime(); return { s: ns, e: ne }; } const e = new Date(o.e); return { s: ns, e: new Date(e.getFullYear(), e.getMonth(), e.getDate() + dd, e.getHours(), e.getMinutes(), e.getSeconds()).getTime() }; }

  // ------------------------------------------------------------------ resize
  function startResize(e, evEl, o, rz) {
    const side = ['rt', 'rb', 'rl', 'rr'].find((c) => rz.classList.contains(c)); const f0 = CAL.fieldsOfOcc(o); let ns = o.s, ne = o.e, changed = false; let lastY = e.clientY, stop;
    const g = side === 'rt' || side === 'rb' ? grid() : null; const col = evEl.closest('.tg-col'); const di = col ? +col.dataset.i : 0; const origTop = evEl.style.top, origH = evEl.style.height; const inMonth = CAL.cur.view === 'month';
    const adc = $('.tg-adc'); const ar = adc && adc.getBoundingClientRect(); const n = CAL.cur.days.length;
    track(e, { start() { evEl.classList.add('resizing'); if (g) stop = autoScroll(g, () => lastY); },
      move(ev) {
        lastY = ev.clientY;
        if (g) { const g2 = grid(); const m = snap(cellOf(g2, ev).m, 'round'); const day = CAL.cur.days[di]; const top0 = parseFloat(origTop), bot0 = top0 + parseFloat(origH) + 1; if (side === 'rb') { const em = Math.max(m, snap((top0 / g2.hh) * 60, 'floor') + snapStep()); ne = atMin(day, Math.min(em, 1440)).getTime(); evEl.style.height = ((Math.min(em, 1440) / 60) * g2.hh - top0 - 1) + 'px'; } else { const sm = Math.min(m, snap((bot0 / g2.hh) * 60, 'ceil') - snapStep()); ns = atMin(day, Math.max(sm, 0)).getTime(); evEl.style.top = (Math.max(sm, 0) / 60) * g2.hh + 'px'; evEl.style.height = (bot0 - (Math.max(sm, 0) / 60) * g2.hh - 1) + 'px'; } evEl.querySelector('.ev-s').textContent = fmtM(new Date(ns).getHours() * 60 + new Date(ns).getMinutes()) + ' – ' + fmtM(side === 'rb' ? atM2(new Date(ne)) : atM2(new Date(o.e))); changed = true; return; }
        let k; if (inMonth) { const c = monthCell(ev); if (!c) return; k = dayFromKey(+c.dataset.day); } else { const i = zk.clamp(Math.floor(((ev.clientX - ar.left) / ar.width) * n), 0, n - 1); k = CAL.cur.days[i]; }
        const sD = CAL.day0(new Date(o.s)), eD = CAL.day0(new Date(Math.max(o.s, o.e - 1)));
        if (side === 'rr') { const nd = k < sD ? sD : k; const e0 = new Date(o.e); ne = o.allDay ? CAL.addDays(nd, 1).getTime() : new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), e0.getHours(), e0.getMinutes()).getTime(); if (!o.allDay && ne <= o.s) ne = o.e; ns = o.s; } else { const nd = k > eD ? eD : k; const s0 = new Date(o.s); ns = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), s0.getHours(), s0.getMinutes()).getTime(); ne = o.e; }
        changed = true; const a = T.dayKey(CAL.day0(new Date(ns))), b = T.dayKey(CAL.day0(new Date(Math.max(ns, ne - 1)))); if (inMonth) document.querySelectorAll('.mv-cell').forEach((x) => x.classList.toggle('rng', +x.dataset.day >= a && +x.dataset.day <= b)); else evEl.style.opacity = '.5';
      },
      async end(ev, moved, cancelled) { stop && stop(); evEl.classList.remove('resizing'); evEl.style.opacity = ''; document.querySelectorAll('.mv-cell.rng').forEach((x) => x.classList.remove('rng')); if (!moved || cancelled || !changed || (ns === o.s && ne === o.e)) { if (g) { evEl.style.top = origTop; evEl.style.height = origH; } if (cancelled || !changed) { CAL.render({ anim: null }); } return; }
        const f = Object.assign({}, f0); if (o.allDay) { f.start = ymd(CAL.day0(new Date(ns))); f.end = ymd(CAL.day0(new Date(ne))); } else { f.start = T.epochToWall(ns, f.tz || 'floating'); f.end = T.epochToWall(ne, f.endTz || f.tz || 'floating'); }
        await CAL.applyEdit(o, f, { verb: 'Change', label: 'Resize Event' }); } });
  }
  const atM2 = (d) => d.getHours() * 60 + d.getMinutes() + (d.getHours() === 0 && d.getMinutes() === 0 ? 1440 : 0);

  // ------------------------------------------------------------------ context menus
  function onCtx(e) {
    const evEl = e.target.closest('.ev, .ag-row'); const o = evEl && occOf(evEl);
    if (o) { CAL.select(o.id); return zk.contextMenu(e, eventMenu(o)); }
    const col = e.target.closest('.tg-col'); let when = null, allDay = false, day = null;
    if (col) { const g = grid(); const m = snap(cellOf(g, e).m, 'floor'); day = CAL.cur.days[+col.dataset.i]; when = atMin(day, m); }
    else { const cell = e.target.closest('.mv-cell') || (CAL.cur.view === 'month' ? monthCell(e) : null); if (cell) { day = dayFromKey(+cell.dataset.day); when = day; allDay = true; } else if (e.target.closest('.tg-adc')) { const adc = $('.tg-adc'); const r = adc.getBoundingClientRect(); day = CAL.cur.days[zk.clamp(Math.floor(((e.clientX - r.left) / r.width) * CAL.cur.days.length), 0, CAL.cur.days.length - 1)]; when = day; allDay = true; } }
    if (!when) return; const items = [{ label: 'New Event', run: () => CAL.quickCreate({ start: when, end: allDay ? CAL.addDays(when, 1) : new Date(when.getTime() + (S.set.defaultDur || 60) * MIN), allDay, anchorPoint: { x: e.clientX, y: e.clientY } }) }, { label: 'New All-Day Event', run: () => CAL.quickCreate({ start: day, end: CAL.addDays(day, 1), allDay: true, anchorPoint: { x: e.clientX, y: e.clientY } }) }, { label: 'Paste Event', enabled: !!S.clip, accel: 'CmdOrCtrl+V', run: () => CAL.pasteAt(allDay ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9) : when) }, { separator: true }, { label: 'Go to This Day', run: () => { S.date = CAL.day0(day); CAL.setView('day'); } }];
    zk.contextMenu(e, items);
  }
  const eventMenu = (o) => {
    const cals = CAL.writableCals();
    if (o.ro) return [{ label: 'Show Info', run: () => CAL.showInfo(o) }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => CAL.copyOcc(o) }];
    return [{ label: 'Edit…', accel: 'Enter', run: () => CAL.openEditor(o) }, { separator: true }, { label: 'Duplicate', accel: 'CmdOrCtrl+D', run: () => CAL.duplicateOcc(o) }, { label: 'Copy', accel: 'CmdOrCtrl+C', run: () => CAL.copyOcc(o) }, { label: 'Delete', run: () => CAL.deleteOcc(o) }, { separator: true },
      { label: 'Calendar', submenu: cals.map((c) => ({ label: c.name, checked: c.id === o.ev.cal, run: () => { const ev = o.ev; const b = CAL.clone(ev); ev.cal = c.id; CAL.commit('Move to Calendar', [{ ...CAL.put(ev), before: b }]); CAL.render({ anim: null }); } })) },
      { label: 'Availability', submenu: [['busy', 'Busy'], ['free', 'Free'], ['tentative', 'Tentative'], ['oof', 'Out of Office']].map(([v, l]) => ({ label: l, checked: (I.F(o, 'avail') || 'busy') === v, run: async () => { const f = CAL.fieldsOfOcc(o); f.avail = v; await CAL.applyEdit(o, f, { label: 'Change Availability' }); } })) },
      { label: 'Colour', submenu: [{ label: 'Calendar Colour', checked: !I.F(o, 'color'), run: async () => { const f = CAL.fieldsOfOcc(o); f.color = ''; await CAL.applyEdit(o, f, { label: 'Change Colour' }); } }, ...CAL.PALETTE.map((c, i) => ({ label: ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray'][i], checked: I.F(o, 'color') === c, run: async () => { const f = CAL.fieldsOfOcc(o); f.color = c; await CAL.applyEdit(o, f, { label: 'Change Colour' }); } }))] }];
  };
  CAL.eventMenu = eventMenu;

  // ------------------------------------------------------------------ wheel / trackpad swipe + key modifiers
  let acc = 0, wheelT = 0, cool = 0;
  function onWheel(e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || e.target.closest('.zk-pop')) return; e.preventDefault(); if (performance.now() < cool) return; acc += e.deltaX; clearTimeout(wheelT); wheelT = setTimeout(() => { acc = 0; }, 160);
    if (Math.abs(acc) > 90) { const dir = acc > 0 ? 1 : -1; acc = 0; cool = performance.now() + 450; CAL.nav(dir); }
  }
  function onClickBits(e) {
    const dn = e.target.closest('.mv-dn'); if (dn) { const c = dn.closest('.mv-cell'); const d = dayFromKey(+c.dataset.day); S.date = d; CAL.setView('day'); return; }
    const row = e.target.closest('.ag-row'); if (row && row.dataset.id) { const o = occOf(row); if (o) CAL.select(o.id); }
  }
  CAL.initInteract = () => { const v = view(); v.addEventListener('pointerdown', onDown); v.addEventListener('dblclick', onDbl); v.addEventListener('contextmenu', onCtx); v.addEventListener('click', onClickBits); v.addEventListener('wheel', onWheel, { passive: false }); };
})();
