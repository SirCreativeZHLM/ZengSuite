/* ZengCalendar views: toolbar, sidebar (mini month + calendar list), day/week/month/year/agenda renderers, alerts banners. */
(function () {
  'use strict';
  const { time: T, ical: I, layout: L } = ZC; const { S } = CAL; const el = zk.el; const DAY = T.DAY, MIN = 60000;
  const VIEWS = [['day', 'Day'], ['workweek', 'Work Week'], ['week', 'Week'], ['days', 'Days'], ['month', 'Month'], ['year', 'Year'], ['agenda', 'List']];
  CAL.VIEWS = VIEWS;
  const $ = (s, r = document) => r.querySelector(s);
  const cur = (CAL.cur = { view: '', days: [], occMap: new Map(), from: 0, to: 0 });
  let lastKey = '', lastView = '', lastDate = null, scrollTop = null;
  S.agendaDays = 30; S.miniDate = new Date(S.date.getFullYear(), S.date.getMonth(), 1);

  // ------------------------------------------------------------------ helpers
  const isToday = (d) => T.sameDay(d, new Date());
  const style = (o) => (o.ro ? ' ro' : '') + (I.F(o, 'avail') === 'free' ? ' free' : '') + (I.F(o, 'avail') === 'tentative' || I.F(o, 'status') === 'TENTATIVE' ? ' tent' : '') + (I.F(o, 'status') === 'CANCELLED' ? ' cancelled' : '') + (S.sel === o.id ? ' sel' : '');
  const title = (o) => I.F(o, 'title') || 'New Event';
  const dayIndex = (days, t) => { // index of local day containing epoch t, clamped (-1/ n)
    const d = new Date(t); const k = T.dayKey(d); for (let i = 0; i < days.length; i++) if (T.dayKey(days[i]) === k) return i; return d < days[0] ? -1 : days.length;
  };
  CAL.sameDayOcc = (o, d) => { const a = d.getTime(), b = CAL.addDays(d, 1).getTime(); return o.s < b && (o.e > a || (o.e === o.s && o.s >= a)); };
  const spansDays = (o) => { const s = new Date(o.s), e = new Date(o.e - 1); return !T.sameDay(s, e) && o.e > o.s; };
  const locLine = (o) => I.F(o, 'loc');
  CAL.viewTitle = () => {
    const d = S.date, v = S.set.view, [f, t] = CAL.periodRange(v, d);
    const mY = (x) => CAL.fmt('my', { month: 'long', year: 'numeric' }, x); const last = CAL.addDays(t, -1);
    switch (v) {
      case 'day': return { main: CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric' }, d), sub: String(d.getFullYear()) };
      case 'week': case 'workweek': case 'days': { const main = f.getMonth() === last.getMonth() ? mY(f) : CAL.fmt('mshort', { month: 'short' }, f) + ' – ' + CAL.fmt('mys', { month: 'short', year: 'numeric' }, last); return { main, sub: S.set.weekNumbers && v !== 'days' ? 'Week ' + T.weekNumber(f, CAL.firstDay()) : '' }; }
      case 'month': return { main: mY(d), sub: '' };
      case 'year': return { main: String(d.getFullYear()), sub: '' };
      default: return { main: 'Upcoming', sub: CAL.fmt('dmd', { month: 'short', day: 'numeric' }, d) + ' – ' + CAL.fmt('dmd', { month: 'short', day: 'numeric' }, CAL.addDays(d, S.agendaDays - 1)) };
    }
  };
  const dowOrder = () => { const f = CAL.firstDay(); return [...Array(7).keys()].map((i) => (f + i) % 7); };

  // ------------------------------------------------------------------ toolbar
  CAL.buildToolbar = () => {
    const tb = $('#tb'); tb.replaceChildren();
    const side = zk.btn({ icon: 'panel-left', title: 'Show/Hide Calendars', onClick: () => CAL.toggleSidebar() }); side.id = 'b-side';
    const prev = zk.btn({ icon: 'chevron-left', title: 'Previous', onClick: () => CAL.nav(-1) }), next = zk.btn({ icon: 'chevron-right', title: 'Next', onClick: () => CAL.nav(1) });
    const today = el('button.zk-btn.bordered', { type: 'button', title: 'Go to Today (T)', onclick: () => CAL.today() }, 'Today');
    const titleEl = el('.cal-title', { id: 'title', 'aria-live': 'polite' }, el('b'), el('span'));
    const seg = el('.zk-seg', { id: 'viewseg', role: 'tablist', 'aria-label': 'View' }, ['day', 'week', 'month', 'year'].map((v) => el('button', { type: 'button', role: 'tab', 'data-v': v, onclick: () => CAL.setView(v) }, VIEWS.find((x) => x[0] === v)[1])));
    const more = zk.btn({ icon: 'chevron-down', title: 'More Views', onClick: (e) => zk.menu(VIEWS.map(([v, l], i) => ({ label: l, accel: 'CmdOrCtrl+' + (i + 1), checked: S.set.view === v, run: () => CAL.setView(v) })), { anchor: e.currentTarget, align: 'end' }) });
    const q = el('input.zk-input.selectable', { id: 'q', type: 'search', placeholder: 'Search', 'aria-label': 'Search events', autocomplete: 'off', spellcheck: false });
    q.addEventListener('input', () => CAL.doSearch(q.value)); q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; CAL.doSearch(''); q.blur(); } });
    const qwrap = el('.cal-search', zk.icon('search'), q);
    const free = zk.btn({ icon: 'clock', title: 'Find Free Time…', onClick: () => CAL.suggestTime() });
    const add = zk.btn({ icon: 'plus', title: 'Quick Add Event (N)', cls: 'accentbtn', onClick: (e) => CAL.quickAdd(e.currentTarget) }); add.id = 'b-add';
    tb.append(side, el('.zk-group', prev, today, next), titleEl, el('.zk-spacer'), seg, more, qwrap, free, add);
  };
  CAL.updateToolbar = () => {
    const t = CAL.viewTitle(); const te = $('#title'); te.firstChild.textContent = t.main; te.lastChild.textContent = t.sub ? ' ' + t.sub : '';
    document.querySelectorAll('#viewseg button').forEach((b) => { const on = b.dataset.v === S.set.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const more = $('#viewseg + .zk-btn'); if (more) more.classList.toggle('on', !['day', 'week', 'month', 'year'].includes(S.set.view));
    $('#b-side').classList.toggle('on', S.set.sidebar);
  };

  // ------------------------------------------------------------------ navigation
  CAL.setView = (v) => { if (S.set.view === v) return; S.set.view = v; CAL.touchMeta(); CAL.render({ anim: 'zoom' }); zeng.refreshMenus && zeng.refreshMenus(); };
  CAL.goto = (d, anim) => { const prev = S.date; S.date = CAL.day0(d); S.miniDate = new Date(S.date.getFullYear(), S.date.getMonth(), 1); CAL.render({ anim: anim === undefined ? (S.date > prev ? 'next' : S.date < prev ? 'prev' : null) : anim }); };
  CAL.nav = (dir) => { const n = CAL.shift(S.set.view, S.date, dir); S.date = n; S.miniDate = new Date(n.getFullYear(), n.getMonth(), 1); CAL.render({ anim: dir > 0 ? 'next' : 'prev' }); };
  CAL.today = () => { const t = new Date(); const dir = CAL.day0(t) > S.date ? 'next' : CAL.day0(t) < S.date ? 'prev' : null; S.date = CAL.day0(t); S.miniDate = new Date(t.getFullYear(), t.getMonth(), 1); CAL.render({ anim: dir, scrollNow: true }); };
  CAL.toggleSidebar = () => { S.set.sidebar = !S.set.sidebar; CAL.touchMeta(); CAL.applyLayout(); CAL.updateToolbar(); };
  CAL.applyLayout = () => { const w = innerWidth; const show = S.set.sidebar && !(w < 860 && !S.sidebarForce); $('#side').classList.toggle('hidden', !show); document.documentElement.classList.toggle('narrow', w < 860); };

  // ------------------------------------------------------------------ master render
  CAL.render = (o = {}) => {
    const host = $('#view'); if (!host) return; const v = S.set.view; const [fromD, toD] = CAL.periodRange(v, S.date);
    const from = fromD.getTime(), to = toD.getTime(); const occs = CAL.occurrences(from, to);
    const prevScroll = host.querySelector('.tg-scroll'); if (prevScroll) scrollTop = prevScroll.scrollTop; if (o.scrollNow) scrollTop = null;
    cur.view = v; cur.from = from; cur.to = to; cur.occs = occs; cur.occMap = new Map(occs.map((x) => [x.id, x]));
    const node = el('.cal-page.v-' + v);
    host.replaceChildren(node); // old content is replaced immediately; the entering page animates in
    if (v === 'month') renderMonth(node, fromD, occs); else if (v === 'year') renderYear(node); else if (v === 'agenda') renderAgenda(node); else renderTimeGrid(node, v === 'day' ? [CAL.day0(S.date)] : daysOf(fromD, toD, v), occs);
    CAL.updateToolbar(); CAL.renderSide(); CAL.tickNow();
    if (S.sel && !cur.occMap.has(S.sel) && v !== 'year') { /* selected occurrence is outside the range */ }
    const anim = o.anim === undefined ? (lastView !== v ? 'zoom' : null) : o.anim; lastView = v;
    if (anim && !zk.reducedMotion() && node.animate) {
      const f = anim === 'next' ? [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }] : anim === 'prev' ? [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }];
      node.animate(f, { duration: anim === 'zoom' ? 260 : 230, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    document.dispatchEvent(new CustomEvent('cal-render'));
  };
  const daysOf = (f, t, v) => { const out = []; for (let d = f; d < t; d = CAL.addDays(d, 1)) { if (v === 'workweek' && !S.set.workDays.includes(d.getDay())) continue; out.push(d); } return out; };

  // ------------------------------------------------------------------ time grid (day / work week / week / N days)
  const evBox = (o, cls) => el('.ev' + cls, { 'data-id': o.id, style: { '--c': o.color }, role: 'button', tabindex: -1, 'aria-label': title(o) + ', ' + CAL.fmtWhen(o) });
  function renderTimeGrid(root, days, occs) {
    const n = days.length, hh = S.set.hourH, gut = 56; root.style.setProperty('--hh', hh + 'px'); root.style.setProperty('--n', n);
    const scroll = el('.tg-scroll'); const gcols = `${gut}px repeat(${n}, minmax(0,1fr))`;
    // header
    const wn = S.set.weekNumbers && n > 1 ? 'W' + T.weekNumber(days[0], CAL.firstDay()) : '';
    const head = el('.tg-head', { style: { gridTemplateColumns: gcols } }, el('.tg-gut.wn', wn ? { title: 'Week number' } : {}, wn));
    days.forEach((d, i) => { const h = el('button.tg-dh' + (isToday(d) ? '.today' : '') + (T.sameDay(d, S.date) && n > 1 ? '.focus' : ''), { type: 'button', 'data-i': i, 'aria-label': CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric' }, d), onclick: () => { if (n > 1 && S.set.view !== 'day') { S.date = CAL.day0(d); CAL.setView('day'); } } }, el('span.dw', CAL.weekdayName(d.getDay(), n > 3 ? 'short' : 'long')), el('span.dn', String(d.getDate()))); head.append(h); });
    // split occurrences
    const allday = [], timed = [];
    for (const o of occs) (o.allDay || o.e - o.s >= DAY ? allday : timed).push(o);
    // all-day row
    const bars = []; for (const o of allday) { const a = Math.max(0, dayIndex(days, o.s)), b = Math.min(n - 1, dayIndex(days, o.allDay ? o.e - 1 : o.e - 1)); if (dayIndex(days, o.s) > n - 1 || dayIndex(days, o.e - 1) < 0) continue; bars.push({ o, a, b: Math.max(a, b), cl: dayIndex(days, o.s) < 0, cr: dayIndex(days, o.e - 1) > n - 1 }); }
    L.lanes(bars); const lanes = bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
    const adc = el('.tg-adc', { style: { height: Math.max(26, lanes * 21 + 5) + 'px' } }, el('.tg-adcells', days.map(() => el('.tg-adcell'))));
    for (const b of bars) { const e = el('.ev.bar' + style(b.o) + (b.cl ? '.cl' : '') + (b.cr ? '.cr' : ''), { 'data-id': b.o.id, style: { '--c': b.o.color, left: `calc(${(b.a / n) * 100}% + 2px)`, width: `calc(${((b.b - b.a + 1) / n) * 100}% - 4px)`, top: 3 + b.lane * 21 + 'px' }, role: 'button', tabindex: -1, 'aria-label': title(b.o) + ', ' + CAL.fmtWhen(b.o) }, el('span.t', title(b.o))); if (!b.o.ro) { if (!b.cl) e.append(el('.rz.rl')); if (!b.cr) e.append(el('.rz.rr')); } adc.append(e); }
    const adRow = el('.tg-allday', { style: { gridTemplateColumns: gcols } }, el('.tg-gut.ad', 'all-day'), adc);
    // body
    const cols = el('.tg-cols', { style: { gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` } });
    const gutter = el('.tg-gut.hours'); for (let h = 1; h < 24; h++) gutter.append(el('span', { style: { top: h * hh + 'px' } }, CAL.fmtHour(h)));
    const minLen = Math.ceil((20 / hh) * 60);
    days.forEach((d, i) => {
      const col = el('.tg-col' + (isToday(d) ? '.today' : ''), { 'data-i': i, 'data-day': T.dayKey(d) });
      const work = S.set.workDays.includes(d.getDay()); if (!work) col.append(el('.tg-off', { style: { top: 0, height: 24 * hh + 'px' } })); else { if (S.set.workStart > 0) col.append(el('.tg-off', { style: { top: 0, height: (S.set.workStart / 60) * hh + 'px' } })); if (S.set.workEnd < 1440) col.append(el('.tg-off', { style: { top: (S.set.workEnd / 60) * hh + 'px', height: (24 - S.set.workEnd / 60) * hh + 'px' } })); }
      const dS = d.getTime(), dE = CAL.addDays(d, 1).getTime(); const segs = [];
      for (const o of timed) if (o.s < dE && (o.e > dS || (o.e === o.s && o.s >= dS))) { const st = o.s >= dS ? new Date(o.s) : d; const en = o.e <= dE ? new Date(o.e) : null; segs.push({ o, s: st.getHours() * 60 + st.getMinutes(), e: en ? en.getHours() * 60 + en.getMinutes() : 1440, first: o.s >= dS, last: o.e <= dE }); }
      L.pack(segs, minLen);
      for (const sg of segs) {
        const o = sg.o; const top = (sg.s / 60) * hh, h = Math.max(((sg.e - sg.s) / 60) * hh, 20) - 1; const w = (sg.span / sg.cols) * 100, l = (sg.col / sg.cols) * 100;
        const e = evBox(o, style(o) + (sg.first ? '' : ' cu') + (sg.last ? '' : ' cd') + (h < 36 ? ' sm' : '') + (h > 56 ? ' lg' : ''));
        Object.assign(e.style, { top: top + 'px', height: h + 'px', left: `calc(${l}% + 1px)`, width: `calc(${w}% - ${sg.col + sg.span < sg.cols ? 3 : 2}px)`, zIndex: 2 + sg.col });
        const tm = CAL.fmtTime(new Date(o.s)); e.append(el('.ev-t', title(o)), h < 36 ? el('.ev-s', tm) : el('.ev-s', CAL.fmtOccTime(o)), h >= 52 && locLine(o) ? el('.ev-l', locLine(o)) : null);
        if (!o.ro) { if (sg.first) e.append(el('.rz.rt')); if (sg.last) e.append(el('.rz.rb')); }
        const tr = I.F(o, 'travel'); if (tr && sg.first && S.set.travelShow) { const th = (tr / 60) * hh; col.append(el('.ev-travel', { style: { '--c': o.color, top: Math.max(0, top - th) + 'px', height: Math.min(th, top) + 'px', left: e.style.left, width: e.style.width } })); }
        col.append(e);
      }
      cols.append(col);
    });
    const body = el('.tg-body', { style: { gridTemplateColumns: `${gut}px 1fr` } }, gutter, cols); body.style.height = 24 * hh + 'px';
    scroll.append(head, adRow, body); root.append(scroll); cur.days = days;
    // scroll position
    requestAnimationFrame(() => { if (scrollTop == null) { const now = new Date(); const h = days.some(isToday) ? Math.max(0, now.getHours() - 1.5) : S.set.workStart / 60 - 0.5; scroll.scrollTop = Math.max(0, h * hh); scrollTop = scroll.scrollTop; } else scroll.scrollTop = scrollTop; });
    scroll.addEventListener('scroll', () => { scrollTop = scroll.scrollTop; }, { passive: true });
  }
  CAL.tickNow = () => {
    document.querySelectorAll('.now').forEach((x) => x.remove()); if (!['day', 'week', 'workweek', 'days'].includes(S.set.view)) return; const now = new Date();
    const col = document.querySelector(`.tg-col[data-day="${T.dayKey(now)}"]`); if (!col) return; const top = ((now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 60) * S.set.hourH;
    col.append(el('.now', { style: { top: top + 'px' } }, el('i'))); const g = document.querySelector('.tg-gut.hours'); if (g) { g.querySelectorAll('span').forEach((s) => { s.style.visibility = Math.abs(parseFloat(s.style.top) - top) < 9 ? 'hidden' : ''; }); const lab = el('.now', { style: { top: top + 'px' } }, el('em', CAL.fmtTime(now))); lab.classList.add('lab'); g.append(lab); }
  };

  // ------------------------------------------------------------------ month
  function renderMonth(root, fromD, occs) {
    const fd = CAL.firstDay(); const order = dowOrder(); const showWn = S.set.weekNumbers; const weeks = Math.round((cur.to - cur.from) / (7 * DAY) + 0.01) || 5; const month = S.date.getMonth();
    const gc = showWn ? '28px repeat(7, minmax(0,1fr))' : 'repeat(7, minmax(0,1fr))';
    root.append(el('.mv-head', { style: { gridTemplateColumns: gc } }, showWn ? el('span') : null, order.map((dw) => el('span', CAL.weekdayName(dw, innerWidth < 1000 ? 'short' : 'long')))));
    const grid = el('.mv-grid'); root.append(grid); const wk = [];
    for (let w = 0; w < weeks; w++) {
      const ws = CAL.addDays(fromD, w * 7); const row = el('.mv-week', { style: { gridTemplateColumns: gc }, 'data-w': w }); const cells = el('.mv-cells', { style: { gridColumn: showWn ? '2 / 9' : '1 / 8' } });
      if (showWn) row.append(el('.mv-wn', String(T.weekNumber(ws, fd))));
      for (let i = 0; i < 7; i++) { const d = CAL.addDays(ws, i); const first = d.getDate() === 1; cells.append(el('.mv-cell' + (d.getMonth() !== month ? '.other' : '') + (isToday(d) ? '.today' : '') + (T.sameDay(d, S.date) ? '.focus' : '') + (order[i] === 0 || order[i] === 6 ? '.we' : ''), { 'data-day': T.dayKey(d), 'data-i': i }, el('button.mv-dn', { type: 'button', tabindex: -1, 'aria-label': CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric' }, d) }, first ? CAL.monthName(d.getMonth(), 'short') + ' ' + d.getDate() : String(d.getDate())), el('.mv-more-slot'))); }
      row.append(cells, el('.mv-bars', { style: { gridColumn: showWn ? '2 / 9' : '1 / 8' } })); grid.append(row); wk.push({ row, ws });
    }
    requestAnimationFrame(() => fillMonth(wk, occs)); cur.weeks = wk; cur.fillMonth = () => fillMonth(wk, cur.occs);
  }
  function fillMonth(wk, occs) {
    for (const { row, ws } of wk) {
      const cells = row.querySelector('.mv-cells'), barsEl = row.querySelector('.mv-bars'); barsEl.replaceChildren(); cells.querySelectorAll('.mv-chip,.mv-more').forEach((x) => x.remove());
      const rowH = row.clientHeight; const LH = 18, top0 = 25; const cap = Math.max(1, Math.floor((rowH - top0 - 2) / LH)); const days = [...Array(7).keys()].map((i) => CAL.addDays(ws, i)); const wS = days[0].getTime(), wE = CAL.addDays(days[6], 1).getTime();
      const bars = [], chips = days.map(() => []);
      for (const o of occs) { if (o.s >= wE || (o.e <= wS && !(o.e === o.s && o.s >= wS))) continue; if (o.allDay || spansDays(o)) { const a = Math.max(0, dayIndex(days, o.s)), b = Math.min(6, dayIndex(days, Math.max(o.s, o.e - 1))); bars.push({ o, a, b: Math.max(a, b), cl: o.s < wS, cr: o.e > wE }); } else { const i = dayIndex(days, o.s); if (i >= 0 && i < 7) chips[i].push(o); } }
      L.lanes(bars); const lanesShown = Math.min(cap, bars.reduce((m, b) => Math.max(m, b.lane + 1), 0)); const hidden = days.map(() => 0);
      for (const b of bars) { if (b.lane >= cap) { for (let i = b.a; i <= b.b; i++) hidden[i]++; continue; } const e = el('.ev.bar' + style(b.o) + (b.cl ? '.cl' : '') + (b.cr ? '.cr' : ''), { 'data-id': b.o.id, style: { '--c': b.o.color, left: `calc(${(b.a / 7) * 100}% + 2px)`, width: `calc(${((b.b - b.a + 1) / 7) * 100}% - 4px)`, top: top0 + b.lane * LH + 'px' }, role: 'button', tabindex: -1, 'aria-label': title(b.o) + ', ' + CAL.fmtWhen(b.o) }, el('span.t', title(b.o))); if (!b.o.ro) { if (!b.cl) e.append(el('.rz.rl')); if (!b.cr) e.append(el('.rz.rr')); } barsEl.append(e); }
      days.forEach((d, i) => {
        const room = Math.max(0, cap - lanesShown); const list = chips[i]; const showN = list.length > room ? Math.max(0, room - 1) : list.length; const more = list.length - showN + hidden[i];
        list.slice(0, showN).forEach((o, k) => { const c = el('.ev.chip' + style(o), { 'data-id': o.id, style: { '--c': o.color, top: top0 + (lanesShown + k) * LH + 'px', left: `calc(${(i / 7) * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)` }, role: 'button', tabindex: -1, 'aria-label': title(o) + ', ' + CAL.fmtWhen(o) }, el('i.dot'), el('span.t', title(o)), el('span.tm', CAL.fmtTime(new Date(o.s)))); barsEl.append(c); });
        if (more > 0) barsEl.append(el('button.mv-more', { type: 'button', style: { top: top0 + Math.min(cap - 1, lanesShown + showN) * LH + 'px', left: `calc(${(i / 7) * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)` }, onclick: (e) => { e.stopPropagation(); CAL.dayPopover(d, e.currentTarget); } }, more + ' more'));
      });
    }
  }
  CAL.dayPopover = (d, anchor) => {
    const [a, b] = [d.getTime(), CAL.addDays(d, 1).getTime()]; const list = CAL.occurrences(a, b).filter((o) => CAL.sameDayOcc(o, d));
    const box = el('.dayflow', el('h3', CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric' }, d)), list.map((o) => el('.ag-row.compact', { 'data-id': o.id, onclick: () => { zk.closePop(); S.sel = o.id; CAL.render(); } }, el('i.dot', { style: { background: o.color } }), el('span.tm', CAL.fmtOccTime(o)), el('span.t', title(o)))));
    zk.popover(anchor, box, { cls: 'dayflow-pop' });
  };

  // ------------------------------------------------------------------ year
  function renderYear(root) {
    const y = S.date.getFullYear(); const fd = CAL.firstDay(); const order = dowOrder(); const occs = CAL.occurrences(new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime());
    const dots = new Map(); for (const o of occs) { for (let d = CAL.day0(new Date(o.s)); d.getTime() < o.e || (o.e === o.s && T.sameDay(d, new Date(o.s))); d = CAL.addDays(d, 1)) { const k = T.dayKey(d); const a = dots.get(k) || []; if (a.length < 3 && !a.includes(o.color)) a.push(o.color); dots.set(k, a); if (o.e <= o.s) break; } }
    const grid = el('.yv'); root.append(grid);
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1); const start = T.startOfWeek(first, fd); const mm = el('.ym', el('button.ym-t' + (m === new Date().getMonth() && y === new Date().getFullYear() ? '.today' : ''), { type: 'button', onclick: () => { S.date = new Date(y, m, 1); CAL.setView('month'); } }, CAL.monthName(m)));
      const g = el('.ym-g', { style: { gridTemplateColumns: (S.set.weekNumbers ? '16px ' : '') + 'repeat(7,1fr)' } }); if (S.set.weekNumbers) g.append(el('span'));
      order.forEach((dw) => g.append(el('span.ym-h', CAL.weekdayName(dw, 'narrow'))));
      for (let w = 0; w < 6; w++) { const ws = CAL.addDays(start, w * 7); if (S.set.weekNumbers) g.append(el('span.ym-wn', ws.getMonth() === m || CAL.addDays(ws, 6).getMonth() === m ? String(T.weekNumber(ws, fd)) : '')); for (let i = 0; i < 7; i++) { const d = CAL.addDays(ws, i); if (d.getMonth() !== m) { g.append(el('span')); continue; } const dt = dots.get(T.dayKey(d)); g.append(el('button.ym-d' + (isToday(d) ? '.today' : '') + (dt ? '.has' : ''), { type: 'button', 'aria-label': CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric' }, d), onclick: () => { S.date = d; CAL.setView('day'); }, title: dt ? dt.length + '+ events' : '' }, String(d.getDate()), dt ? el('span.ym-dots', dt.map((c) => el('i', { style: { background: c } }))) : null)); } }
      mm.append(g); grid.append(mm);
    }
  }

  // ------------------------------------------------------------------ agenda / list
  function renderAgenda(root) {
    const list = root.appendChild(el('.ag')); const occs = cur.occs; const byDay = new Map();
    for (const o of occs) for (let d = CAL.day0(new Date(Math.max(o.s, cur.from))); d.getTime() < Math.min(o.e, cur.to) || (o.e <= o.s && T.sameDay(d, new Date(o.s))); d = CAL.addDays(d, 1)) { const k = T.dayKey(d); if (!byDay.has(k)) byDay.set(k, { d, items: [] }); byDay.get(k).items.push(o); if (o.e <= o.s) break; }
    if (!byDay.size) list.append(el('.zk-empty', el('strong', 'No upcoming events'), el('span', 'Nothing scheduled in the next ' + S.agendaDays + ' days.')));
    for (const { d, items } of [...byDay.values()].sort((a, b) => a.d - b.d)) {
      list.append(el('.ag-day' + (isToday(d) ? '.today' : ''), el('span.n', String(d.getDate())), el('span', CAL.fmt('dwd', { weekday: 'long', month: 'long', year: 'numeric' }, d))));
      for (const o of items.sort((a, b) => (b.allDay - a.allDay) || a.s - b.s)) list.append(el('.ag-row' + style(o), { 'data-id': o.id, style: { '--c': o.color }, role: 'button', tabindex: 0 }, el('span.tm', o.allDay ? 'all-day' : CAL.fmtOccTime(o)), el('i.dot', { style: { background: o.color } }), el('span.t', title(o), locLine(o) ? el('em', locLine(o)) : null, o.ev.rrule ? zk.icon('repeat') : null), el('span.cn', o.cal.name)));
    }
    list.append(el('.ag-more', el('button.zk-btn.bordered', { type: 'button', onclick: () => { S.agendaDays += 30; CAL.render({ anim: null }); } }, 'Show 30 More Days')));
  }

  // ------------------------------------------------------------------ search results
  CAL.doSearch = (q) => {
    S.query = q; const box = $('#results'), view = $('#view'); if (!q.trim()) { box.classList.add('zk-hidden'); view.classList.remove('zk-hidden'); box.replaceChildren(); return; }
    const res = CAL.search(q); view.classList.add('zk-hidden'); box.classList.remove('zk-hidden'); box.replaceChildren();
    const head = el('.res-head', el('b', res.length ? res.length + (res.length >= 300 ? '+' : '') + ' result' + (res.length === 1 ? '' : 's') : 'No results'), el('span', ' for “' + q.trim() + '”'));
    box.append(head); const list = el('.ag.res'); box.append(list);
    const rx = new RegExp('(' + CAL.norm(q).split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    const hl = (txt) => { if (!txt) return ''; const n = CAL.norm(txt); if (n.length !== txt.length) return txt; const f = document.createDocumentFragment(); let last = 0; n.replace(rx, (m, _g, idx) => { f.append(txt.slice(last, idx), el('mark', txt.slice(idx, idx + m.length))); last = idx + m.length; return m; }); f.append(txt.slice(last)); return f; };
    for (const o of res) list.append(el('.ag-row' + style(o), { 'data-id': o.id, style: { '--c': o.color }, role: 'button', tabindex: 0, onclick: () => { document.querySelector('#q').value = ''; CAL.doSearch(''); S.sel = o.id; CAL.goto(new Date(o.s), 'zoom'); }, ondblclick: () => { if (!o.ro) CAL.openEditor(o); } }, el('span.tm', CAL.fmt('dsh', { month: 'short', day: 'numeric', year: 'numeric' }, new Date(o.s)), el('br'), o.allDay ? 'all-day' : CAL.fmtTime(new Date(o.s))), el('i.dot', { style: { background: o.color } }), el('span.t', hl(title(o)), locLine(o) ? el('em', hl(locLine(o))) : null, o.ev.rrule ? zk.icon('repeat') : null), el('span.cn', o.cal.name)));
    if (!res.length) list.append(el('.zk-empty', el('strong', 'No matching events'), el('span', 'Searches title, location, notes, attendees and categories.')));
  };

  // ------------------------------------------------------------------ sidebar
  CAL.renderSide = () => {
    const side = $('#side'); if (!side) return; const st = side.scrollTop; side.replaceChildren();
    // mini month
    const md = S.miniDate; const fd = CAL.firstDay(); const order = dowOrder(); const mini = el('.mini');
    const mh = el('.mini-h', el('b', CAL.fmt('my', { month: 'long', year: 'numeric' }, md)), el('span.sp'), zk.btn({ icon: 'chevron-left', title: 'Previous Month', onClick: () => { S.miniDate = new Date(md.getFullYear(), md.getMonth() - 1, 1); CAL.renderSide(); } }), zk.btn({ icon: 'chevron-right', title: 'Next Month', onClick: () => { S.miniDate = new Date(md.getFullYear(), md.getMonth() + 1, 1); CAL.renderSide(); } }));
    mh.firstChild.addEventListener('click', () => CAL.goto(new Date(md.getFullYear(), md.getMonth(), Math.min(S.date.getDate(), 28)), 'zoom'));
    const start = T.startOfWeek(md, fd); const end = CAL.addDays(start, 42); const occs = CAL.occurrences(start.getTime(), end.getTime()); const has = new Map();
    for (const o of occs) for (let d = CAL.day0(new Date(o.s)); d.getTime() < Math.max(o.e, o.s + 1) && d < end; d = CAL.addDays(d, 1)) has.set(T.dayKey(d), true);
    const [pf, pt] = CAL.periodRange(S.set.view === 'month' || S.set.view === 'year' || S.set.view === 'agenda' ? 'day' : S.set.view, S.date);
    const g = el('.mini-g', { style: { gridTemplateColumns: (S.set.weekNumbers ? '18px ' : '') + 'repeat(7,1fr)' } }); if (S.set.weekNumbers) g.append(el('span'));
    order.forEach((dw) => g.append(el('span.mh', CAL.weekdayName(dw, 'narrow'))));
    for (let w = 0; w < 6; w++) { const ws = CAL.addDays(start, w * 7); if (S.set.weekNumbers) g.append(el('span.mwn', String(T.weekNumber(ws, fd)))); for (let i = 0; i < 7; i++) { const d = CAL.addDays(ws, i); const inP = d >= pf && d < pt; g.append(el('button.md' + (d.getMonth() !== md.getMonth() ? '.other' : '') + (isToday(d) ? '.today' : '') + (inP ? '.inp' : '') + (T.sameDay(d, S.date) ? '.sel' : ''), { type: 'button', 'aria-label': CAL.fmt('dfull', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, d), onclick: () => CAL.goto(d), ondblclick: () => { S.date = CAL.day0(d); CAL.setView('day'); } }, String(d.getDate()), has.get(T.dayKey(d)) ? el('i') : null)); } }
    mini.append(mh, g); side.append(mini);
    // calendars
    const list = el('.cals'); const groups = CAL.groups(); S.collapsed = S.collapsed || {};
    for (const gname of groups) {
      const items = S.cals.filter((c) => (c.group || 'Other') === gname); const col = S.collapsed[gname];
      list.append(el('button.cg-h' + (col ? '.col' : ''), { type: 'button', 'aria-expanded': !col, onclick: () => { S.collapsed[gname] = !col; CAL.renderSide(); } }, zk.icon('chevron-down'), el('span', gname), el('span.cg-count', String(items.length))));
      if (col) continue;
      for (const c of items) {
        const row = el('.cal-row' + (c.visible ? '' : '.off'), { 'data-cal': c.id, tabindex: 0, role: 'checkbox', 'aria-checked': c.visible, 'aria-label': c.name, style: { '--c': c.color }, onclick: () => { c.visible = !c.visible; CAL.touchMeta(); CAL.render({ anim: null }); }, onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); row.click(); } }, ondblclick: (e) => { e.stopPropagation(); CAL.editCalendar(c); }, oncontextmenu: (e) => CAL.calendarMenu(e, c) },
          el('i.chk', c.visible ? zk.icon('check') : null), el('span.nm', c.name), c.sub ? el('span.ci', { title: 'Subscribed from file: ' + (c.sub.name || '') }, zk.icon('refresh-cw')) : c.readOnly ? el('span.ci', zk.icon('lock')) : null);
        list.append(row);
      }
    }
    const foot = el('.cal-foot', el('button.zk-btn', { type: 'button', onclick: (e) => zk.menu([{ label: 'New Calendar…', run: () => CAL.editCalendar(null) }, { label: 'Holiday Calendars…', run: () => CAL.holidayDialog() }, { label: 'Subscribe from File…', run: () => CAL.subscribeFromFile() }, { separator: true }, { label: 'Import Events…', run: () => CAL.importDialog() }], { anchor: e.currentTarget }) }, zk.icon('plus'), 'Calendar'));
    side.append(list, foot); side.scrollTop = st;
  };

  // ------------------------------------------------------------------ alert banners
  const live = new Map();
  CAL.showBanner = (a, opts = {}) => {
    const host = $('#alerts'); if (live.has(a.key)) return; const o = a.o; const when = o.s <= Date.now() ? 'Started ' + CAL.fmtTime(new Date(o.s)) : 'Today at ' + CAL.fmtTime(new Date(o.s));
    const closeIt = () => { const b = live.get(a.key); if (!b) return; live.delete(a.key); b.classList.add('out'); setTimeout(() => b.remove(), 180); };
    const b = el('.alert', { role: 'alert', style: { '--c': o.color } }, el('i.bar'), el('.at', el('b', title(o)), el('span', (T.sameDay(new Date(o.s), new Date()) ? when : CAL.fmtWhen(o)) + (locLine(o) ? ' · ' + locLine(o) : ''))), el('.aa',
      el('button.zk-btn.bordered', { type: 'button', onclick: (e) => zk.menu([{ label: '5 minutes', run: () => snooze(5) }, { label: '15 minutes', run: () => snooze(15) }, { label: '1 hour', run: () => snooze(60) }, { label: 'Until the event starts', run: () => snooze(Math.max(1, Math.round((o.s - Date.now()) / MIN))) }], { anchor: e.currentTarget }) }, 'Snooze'),
      el('button.zk-btn.bordered', { type: 'button', onclick: () => { CAL.dismissAlert(a.key); closeIt(); S.sel = o.id; CAL.goto(new Date(o.s), 'zoom'); } }, 'Show'), el('button.zk-btn.icon', { type: 'button', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: () => { CAL.dismissAlert(a.key); closeIt(); } }, zk.icon('x'))));
    const snooze = (m) => { S.alerts.snoozed[a.key] = Date.now() + m * MIN; CAL.persistAlerts(); closeIt(); };
    live.set(a.key, b); host.append(b); void opts;
  };
  CAL.dismissAlert = (key) => { S.alerts.dismissed[key] = Date.now(); delete S.alerts.snoozed[key]; S.alerts.missed = (S.alerts.missed || []).filter((m) => m.key !== key); CAL.persistAlerts(); };
  CAL.hasBanner = (key) => live.has(key);
})();
