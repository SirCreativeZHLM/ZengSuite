/* ZengCalendar editors: quick create popover, quick add (natural language), full event editor, info sheet, find free time. */
(function () {
  'use strict';
  const { time: T, ical: I, free: FREE, nlp: NLP } = ZC; const { S } = CAL; const el = zk.el; const MIN = 60000, DAY = T.DAY;
  const WD2 = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ymd = (d) => d.getFullYear() + '-' + T.pad(d.getMonth() + 1) + '-' + T.pad(d.getDate());
  const wallOf = (d) => ymd(d) + 'T' + T.pad(d.getHours()) + ':' + T.pad(d.getMinutes()) + ':00';
  const calSelect = (value, onChange) => { const s = el('select.zk-select', { 'aria-label': 'Calendar', onchange: () => onChange && onChange(s.value) }); for (const c of CAL.writableCals()) s.append(el('option', { value: c.id, selected: c.id === value }, c.name)); return s; };
  const tick = (c) => el('i.cdot', { style: { background: c } });

  // ------------------------------------------------------------------ build an event from a date range with defaults
  CAL.draftFor = (start, end, allDay, calId) => {
    const cal = CAL.calById(calId) || CAL.defaultCal(); if (!cal) { zk.alert('No calendar', 'Create a calendar first (Calendar menu).'); return null; }
    if (allDay) return CAL.newEventAt(ymd(start), ymd(end), true, cal);
    return CAL.newEventAt(wallOf(start), wallOf(end), false, cal);
  };
  const commitNew = (ev) => { CAL.commit('New Event', [CAL.put(ev)]); S.date = CAL.day0(new Date(I.base(ev).s)); CAL.render({ anim: null }); const n = CAL.cur.occs.find((x) => x.ev.id === ev.id); if (n) CAL.select(n.id); };

  // ------------------------------------------------------------------ quick create (popover next to the drag/click)
  CAL.quickCreate = ({ start, end, allDay, anchor, anchorPoint, onCancel }) => {
    const cal0 = CAL.defaultCal(); if (!cal0) { zk.alert('No calendar', 'Create a calendar first (Calendar menu).'); onCancel && onCancel(); return; }
    let added = false; const title = el('input.zk-input.selectable.qc-title', { placeholder: 'New Event', 'aria-label': 'Title', autocomplete: 'off', spellcheck: false });
    const where = el('input.zk-input.selectable', { placeholder: 'Add location', 'aria-label': 'Location', autocomplete: 'off' });
    const sel = calSelect(cal0.id); const when = el('.qc-when', whenText(start, end, allDay));
    const make = () => { const ev = CAL.draftFor(start, end, allDay, sel.value); if (!ev) return null; ev.title = title.value.trim() || 'New Event'; ev.loc = where.value.trim(); return ev; };
    const add = async () => { const ev = make(); if (!ev) return; if (!allDay && !(await CAL.checkFocus(start.getTime(), end.getTime()))) return; added = true; zk.closePop(); commitNew(ev); };
    const more = () => { const ev = make(); added = true; zk.closePop(); onCancel && onCancel(); CAL.openEditor(null, ev); };
    const body = el('.qc', title, where, el('.qc-row', tick(cal0.color), sel), when, el('.qc-actions', el('button.zk-btn.bordered', { type: 'button', onclick: more }, 'Details…'), el('button.zk-btn.primary', { type: 'button', onclick: add }, 'Add')));
    sel.addEventListener('change', () => { const c = CAL.calById(sel.value); body.querySelector('.cdot').style.background = c.color; });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const pop = anchor ? zk.popover(anchor, body, { cls: 'qc-pop', align: 'center', onClose: () => { if (!added) onCancel && onCancel(); } }) : zk.popover(null, body, { x: Math.min(anchorPoint.x + 8, innerWidth - 300), y: Math.min(anchorPoint.y, innerHeight - 220), cls: 'qc-pop', onClose: () => { if (!added) onCancel && onCancel(); } });
    void pop; setTimeout(() => title.focus(), 30);
  };
  const whenText = (s, e, allDay) => { const dd = (d) => CAL.fmt('dsh2', { weekday: 'short', month: 'short', day: 'numeric' }, d); if (allDay) { const last = CAL.addDays(e, -1); return 'all-day · ' + (T.sameDay(s, last) ? dd(s) : dd(s) + ' – ' + dd(last)); } return dd(s) + ' · ' + CAL.fmtTime(s) + ' – ' + CAL.fmtTime(e); };

  // ------------------------------------------------------------------ quick add: natural language
  CAL.quickAdd = (anchor) => {
    const input = el('input.zk-input.selectable.qa-in', { placeholder: 'Lunch with Sam tomorrow 1pm for 1h at Café', 'aria-label': 'Describe the event', autocomplete: 'off', spellcheck: false });
    const prev = el('.qa-prev'); const sel = calSelect((CAL.defaultCal() || {}).id); let parsed = null;
    const update = () => {
      prev.replaceChildren(); if (!input.value.trim()) { parsed = null; prev.append(el('.hint', 'Try “Dentist next Friday 3-4pm”, “Standup every weekday 9:30am”, “Rent due Nov 1”, “Flight 12/15 6:45am for 5 hours at SFO”.')); return; }
      parsed = NLP.parse(input.value, new Date(), { duration: S.set.defaultDur }); const p = parsed;
      const s = new Date(p.allDay ? p.start + 'T00:00:00' : p.start), e = new Date(p.allDay ? p.end + 'T00:00:00' : p.end);
      const clash = !p.allDay && CAL.focusConflicts(s.getTime(), e.getTime()); prev.append(...[el('b', p.title), el('span', whenText(s, e, p.allDay)), clash && clash.length ? el('span.warn', zk.icon('shield'), 'Overlaps focus block \u201c' + I.F(clash[0], 'title') + '\u201d') : null, p.loc ? el('span', zk.icon('map-pin'), p.loc) : null, p.rrule ? el('span', zk.icon('repeat'), describeRule(p.rrule)) : null, p.alarms.length ? el('span', zk.icon('bell'), p.alarms.map((m) => alertLabel(m)).join(', ')) : null].filter(Boolean));
    };
    const build = () => { if (!parsed) return null; const p = parsed; const cal = CAL.calById(sel.value); const ev = CAL.newEventAt(p.start, p.end, p.allDay, cal); ev.title = p.title; ev.loc = p.loc; if (p.rrule) ev.rrule = p.rrule; if (p.alarms.length) ev.alarms = p.alarms.map((m) => ({ m, action: 'DISPLAY' })); return ev; };
    const add = async () => { const ev = build(); if (!ev) return; if (!parsed.allDay && !(await CAL.checkFocus(I.base(ev).s, I.base(ev).e))) return; zk.closePop(); commitNew(ev); };
    const details = () => { const ev = build(); if (!ev) return; zk.closePop(); CAL.openEditor(null, ev); };
    input.addEventListener('input', update); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const body = el('.qa', input, prev, el('.qc-actions', el('span.qc-row', tick((CAL.defaultCal() || {}).color || '#888'), sel), el('span.zk-spacer'), el('button.zk-btn.bordered', { type: 'button', onclick: details }, 'Details…'), el('button.zk-btn.primary', { type: 'button', onclick: add }, 'Add')));
    sel.addEventListener('change', () => { body.querySelector('.cdot').style.background = CAL.calById(sel.value).color; });
    update(); zk.popover(anchor || document.querySelector('#b-add'), body, { cls: 'qa-pop', align: 'end' }); setTimeout(() => input.focus(), 30);
  };

  // ------------------------------------------------------------------ alerts catalogue
  const ALERTS = [[0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [2880, '2 days before'], [10080, '1 week before']];
  const ALERTS_AD = [[-540, 'On day of event (9:00)'], [900, '1 day before (9:00)'], [2340, '2 days before (9:00)'], [9540, '1 week before (9:00)']];
  const alertLabel = (m) => { const f = ALERTS.concat(ALERTS_AD).find((x) => x[0] === m); if (f) return f[1]; if (m < 0) return Math.abs(m) + ' minutes after'; if (m % 1440 === 0) return m / 1440 + ' days before'; if (m % 60 === 0) return m / 60 + ' hours before'; return m + ' minutes before'; };
  CAL.alertLabel = alertLabel;
  const describeRule = (str) => {
    const r = I.parseRRule(str); if (!r) return str; const u = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year', HOURLY: 'hour', MINUTELY: 'minute', SECONDLY: 'second' }[r.freq]; let t = r.interval > 1 ? `Every ${r.interval} ${u}s` : { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly', HOURLY: 'Hourly', MINUTELY: 'Every minute', SECONDLY: 'Every second' }[r.freq];
    if (r.byday.length) { const names = r.byday.map((d) => (d.n ? (d.n > 0 ? ordinal(d.n) + ' ' : d.n === -1 ? 'last ' : ordinal(-d.n) + ' to last ') : '') + CAL.weekdayName(d.wd, 'short')); t += ' on ' + names.join(', '); } if (r.bymonthday.length) t += ' on day ' + r.bymonthday.join(', '); if (r.bymonth.length) t += ' in ' + r.bymonth.map((m) => CAL.monthName(m - 1, 'short')).join(', ');
    if (r.count) t += `, ${r.count} times`; if (r.until) { const m = /^(\d{4})(\d\d)(\d\d)/.exec(r.until); t += ', until ' + CAL.fmt('dsh', { month: 'short', day: 'numeric', year: 'numeric' }, new Date(+m[1], +m[2] - 1, +m[3])); } return t;
  };
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);
  CAL.describeRule = describeRule;

  // ------------------------------------------------------------------ time zones
  let zones = null;
  const zoneList = () => { if (zones) return zones; let l = []; try { l = Intl.supportedValuesOf('timeZone'); } catch { l = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland']; } zones = l.filter((z) => z !== 'UTC'); return zones; };
  const zoneSelect = (value, onChange) => {
    const s = el('select.zk-select.tz', { 'aria-label': 'Time zone', onchange: () => onChange(s.value) }); const sys = T.systemZone();
    s.append(el('option', { value: 'floating' }, 'Floating (device time)'), el('option', { value: 'UTC' }, 'UTC'));
    const known = zoneList(); const groups = {}; for (const z of known) { const g = z.includes('/') ? z.split('/')[0] : 'Other'; (groups[g] ||= []).push(z); }
    s.append(el('optgroup', { label: 'This device' }, el('option', { value: sys }, sys.replace(/_/g, ' '))));
    for (const g of Object.keys(groups).sort()) { const og = el('optgroup', { label: g }); for (const z of groups[g]) og.append(el('option', { value: z }, z.slice(z.indexOf('/') + 1).replace(/_/g, ' '))); s.append(og); }
    if (value && ![...s.options].some((o) => o.value === value)) s.append(el('option', { value }, value));
    s.value = value || 'floating'; return s;
  };

  // ------------------------------------------------------------------ time text input
  const parseTimeText = (txt) => { const m = /^\s*(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap])?\.?(?:m\.?)?\s*$/i.exec(txt); if (!m) { if (/^\s*noon\s*$/i.test(txt)) return 720; if (/^\s*midnight\s*$/i.test(txt)) return 0; return null; } let h = +m[1]; const mi = +(m[2] || 0); const ap = m[3] && m[3].toLowerCase(); if (mi > 59) return null; if (ap) { if (h < 1 || h > 12) return null; if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; } else if (h > 23) return null; return h * 60 + mi; };
  const fmtMin = (m) => CAL.fmtTime(new Date(2000, 0, 1, Math.floor(m / 60), m % 60), { full: true });

  // ------------------------------------------------------------------ recurrence builder state <-> RRULE
  const NTH = [[1, 'first'], [2, 'second'], [3, 'third'], [4, 'fourth'], [-1, 'last'], [-2, 'second to last']];
  const rrDefaults = (startWall) => { const w = T.parseWall(startWall); const dn = T.dayNum(w.y, w.m, w.d); return { on: false, freq: 'WEEKLY', interval: 1, days: new Set([T.dow(dn)]), monthMode: 'dom', dom: String(w.d), nthN: Math.min(4, Math.ceil(w.d / 7)), nthWd: T.dow(dn), months: new Set([w.m]), end: { type: 'never', count: 10, until: '' }, raw: '' }; };
  const ruleToState = (rule, startWall) => {
    const st = rrDefaults(startWall); if (!rule) return st; const r = I.parseRRule(rule); st.raw = rule; if (!r || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) { st.on = true; st.rawOnly = true; return st; } st.on = true; st.freq = r.freq; st.interval = r.interval;
    if (r.count) st.end = { type: 'count', count: r.count, until: '' }; else if (r.until) { const m = /^(\d{4})(\d\d)(\d\d)/.exec(r.until); st.end = { type: 'until', count: 10, until: `${m[1]}-${m[2]}-${m[3]}` }; }
    if (r.freq === 'WEEKLY' && r.byday.length) st.days = new Set(r.byday.map((d) => d.wd));
    if (r.bymonth.length) st.months = new Set(r.bymonth);
    if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') { if (r.bymonthday.length) { st.monthMode = 'dom'; st.dom = r.bymonthday.join(','); } else if (r.byday.length === 1 && r.byday[0].n) { st.monthMode = 'nth'; st.nthN = r.byday[0].n; st.nthWd = r.byday[0].wd; } else if (r.byday.length && r.bysetpos.length === 1) { st.monthMode = 'nth'; st.nthN = r.bysetpos[0]; const set = r.byday.map((d) => d.wd).sort().join(); st.nthWd = set === '0,1,2,3,4,5,6' ? 'day' : set === '1,2,3,4,5' ? 'weekday' : set === '0,6' ? 'weekend' : 'x'; if (st.nthWd === 'x') st.rawOnly = true; } else if (r.byday.length) st.rawOnly = true; }
    if (r.byweekno.length || r.byyearday.length || r.byhour.length || r.byminute.length || r.bysecond.length || (r.freq === 'DAILY' && r.byday.length) || r.bysetpos.length > 1 || r.byday.some((d) => d.n && r.freq === 'WEEKLY')) st.rawOnly = true; return st;
  };
  const stateToRule = (st, ctx) => {
    if (!st.on) return ''; if (st.rawOnly && st.raw) return st.raw; const p = ['FREQ=' + st.freq]; const iv = Math.max(1, Math.floor(+st.interval) || 1);
    if (st.end.type === 'until' && st.end.until) { const w = st.end.until + 'T' + (ctx.allDay ? '00:00:00' : '23:59:59'); p.push('UNTIL=' + I.makeUntil({ allDay: ctx.allDay, tz: ctx.tz }, w)); } else if (st.end.type === 'count') p.push('COUNT=' + Math.max(1, Math.floor(+st.end.count) || 1));
    if (iv > 1) p.push('INTERVAL=' + iv);
    if (st.freq === 'WEEKLY') { const d = [...st.days].sort((a, b) => a - b); if (d.length) p.push('BYDAY=' + d.map((x) => WD2[x]).join(',')); }
    if (st.freq === 'MONTHLY' || st.freq === 'YEARLY') {
      if (st.monthMode === 'nth') { if (typeof st.nthWd === 'number') p.push('BYDAY=' + st.nthN + WD2[st.nthWd]); else { const set = st.nthWd === 'day' ? [0, 1, 2, 3, 4, 5, 6] : st.nthWd === 'weekday' ? [1, 2, 3, 4, 5] : [6, 0]; p.push('BYDAY=' + set.map((x) => WD2[x]).join(','), 'BYSETPOS=' + st.nthN); } }
      else { const list = String(st.dom).split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x && Math.abs(x) <= 31); if (list.length) p.push('BYMONTHDAY=' + list.join(',')); }
      if (st.freq === 'YEARLY' && st.months.size) p.push('BYMONTH=' + [...st.months].sort((a, b) => a - b).join(','));
    }
    return I.normRRule(p.join(';')) || p.join(';');
  };
  const PRESETS = [['', 'Never'], ['FREQ=DAILY', 'Every Day'], ['FREQ=WEEKLY', 'Every Week'], ['FREQ=WEEKLY;INTERVAL=2', 'Every 2 Weeks'], ['FREQ=MONTHLY', 'Every Month'], ['FREQ=YEARLY', 'Every Year'], ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Every Weekday'], ['custom', 'Custom…']];

  // ------------------------------------------------------------------ full editor
  /** o: occurrence to edit, or null for a new event with `draft` (an unsaved event from CAL.draftFor). */
  CAL.openEditor = (o, draft) => {
    zk.closePop(); const isNew = !o; const ev0 = o ? o.ev : draft; const m = o ? I.merged(o) : Object.assign({}, draft);
    const cal0 = CAL.calById(ev0.cal) || CAL.defaultCal(); if (!cal0) return Promise.resolve(null);
    const S0 = { // editable state
      title: m.title || '', loc: m.loc || '', notes: m.notes || '', url: m.url || '', allDay: !!m.allDay, tz: m.allDay ? 'floating' : m.tz || 'floating', endTz: m.endTz || '', cal: ev0.cal, avail: m.avail || 'busy', color: m.color || '', travel: m.travel || 0,
      categories: (m.categories || []).join(', '), attendees: (m.attendees || []).map(CAL.fmtAttendee).join('\n'), alarms: clone(m.alarms || []), exdates: (ev0.exdates || []).slice(),
    };
    const sw = m.allDay ? m.start.slice(0, 10) : m.start, ew = m.allDay ? T.addDays(m.end.slice(0, 10), -1) : m.end;
    S0.sd = sw.slice(0, 10); S0.ed = ew.slice(0, 10); S0.sm = m.allDay ? 540 : +sw.slice(11, 13) * 60 + +sw.slice(14, 16); S0.em = m.allDay ? 600 : +ew.slice(11, 13) * 60 + +ew.slice(14, 16); if (m.allDay && S0.ed < S0.sd) S0.ed = S0.sd;
    const rst = ruleToState(ev0.rrule || '', ev0.start); const recurringExisting = !isNew && I.isRecurring(ev0);
    const ctx = () => ({ allDay: S0.allDay, tz: S0.tz });
    // --- field widgets
    const title = el('input.zk-input.selectable.ed-title', { value: S0.title, placeholder: 'Title', 'aria-label': 'Title', autocomplete: 'off' }); const locIn = el('input.zk-input.selectable', { value: S0.loc, placeholder: 'Add location', 'aria-label': 'Location', autocomplete: 'off' });
    const sdIn = el('input.zk-input.d', { type: 'date', value: S0.sd, 'aria-label': 'Start date' }), edIn = el('input.zk-input.d', { type: 'date', value: S0.ed, 'aria-label': 'End date' });
    const stIn = el('input.zk-input.t.selectable', { value: fmtMin(S0.sm), 'aria-label': 'Start time', autocomplete: 'off' }), etIn = el('input.zk-input.t.selectable', { value: fmtMin(S0.em), 'aria-label': 'End time', autocomplete: 'off' });
    const allDay = el('input.zk-switch', { type: 'checkbox', checked: S0.allDay, 'aria-label': 'All-day' }); const tzSel = zoneSelect(S0.tz, () => { S0.tz = tzSel.value; if (!S0.endTz) tzHint(); }); const endTzSel = zoneSelect(S0.endTz || S0.tz, () => { S0.endTz = endTzSel.value; tzHint(); });
    const tzHintEl = el('span.hint');
    const tzHint = () => { const t = tzSel.value; const st = T.wallToEpoch(S0.sd + 'T' + T.pad(Math.floor(S0.sm / 60)) + ':' + T.pad(S0.sm % 60) + ':00', t); tzHintEl.textContent = t === 'floating' ? 'Stays at the same clock time anywhere' : T.zoneAbbr(st, t) + (t !== T.systemZone() ? ' · ' + CAL.fmtTime(new Date(st)) + ' your time' : ''); };
    const diffTz = el('button.zk-btn.link', { type: 'button', onclick: () => { S0.endTz = S0.endTz ? '' : tzSel.value; sync(); } }, 'End time zone');
    const durMs = () => (S0.allDay ? null : T.wallToEpoch(S0.ed + 'T' + T.pad(Math.floor(S0.em / 60)) + ':' + T.pad(S0.em % 60) + ':00', S0.endTz || S0.tz) - T.wallToEpoch(S0.sd + 'T' + T.pad(Math.floor(S0.sm / 60)) + ':' + T.pad(S0.sm % 60) + ':00', S0.tz));
    const moveEnd = (dur) => { if (S0.allDay) return; const s = T.wallToEpoch(S0.sd + 'T' + T.pad(Math.floor(S0.sm / 60)) + ':' + T.pad(S0.sm % 60) + ':00', S0.tz); const w = T.epochToWall(s + dur, S0.endTz || S0.tz); S0.ed = w.slice(0, 10); S0.em = +w.slice(11, 13) * 60 + +w.slice(14, 16); };
    const startChanged = () => { const dur = S0._dur; if (S0.allDay) { const span = T.dayNum(+S0.ed.slice(0, 4), +S0.ed.slice(5, 7), +S0.ed.slice(8, 10)) - T.dayNum(+S0._sd.slice(0, 4), +S0._sd.slice(5, 7), +S0._sd.slice(8, 10)); S0.ed = T.addDays(S0.sd, Math.max(0, span)); } else moveEnd(dur); sync(); };
    sdIn.addEventListener('focus', () => { S0._dur = durMs(); S0._sd = S0.sd; });
    sdIn.addEventListener('change', () => { if (!sdIn.value) { sdIn.value = S0.sd; return; } S0._dur = S0._dur ?? durMs(); S0._sd = S0._sd || S0.sd; S0.sd = sdIn.value; startChanged(); S0._dur = durMs(); S0._sd = S0.sd; });
    stIn.addEventListener('focus', () => { S0._dur = durMs(); });
    stIn.addEventListener('change', () => { const v = parseTimeText(stIn.value); if (v == null) { stIn.value = fmtMin(S0.sm); return; } const dur = S0._dur ?? durMs(); S0.sm = v; S0._dur = dur; moveEnd(dur); sync(); S0._dur = durMs(); });
    edIn.addEventListener('change', () => { if (!edIn.value) { edIn.value = S0.ed; return; } S0.ed = edIn.value; if (S0.ed < S0.sd) S0.ed = S0.sd; sync(); S0._dur = durMs(); });
    etIn.addEventListener('change', () => { const v = parseTimeText(etIn.value); if (v == null) { etIn.value = fmtMin(S0.em); return; } S0.em = v; if (durMs() < 0) { if (S0.ed === S0.sd) { S0.ed = T.addDays(S0.sd, 1); } } sync(); S0._dur = durMs(); });
    allDay.addEventListener('change', () => { S0.allDay = allDay.checked; if (!S0.allDay) { S0.sm = S0.sm || 540; S0.em = S0.sm + 60; S0.ed = S0.sd; if (S0.tz !== 'floating' && false) S0.tz = 'floating'; } sync(); S0._dur = durMs(); });
    const rowStart = el('.er', el('label', 'Starts'), el('.ctl', sdIn, stIn)), rowEnd = el('.er', el('label', 'Ends'), el('.ctl', edIn, etIn)), rowTz = el('.er', el('label', 'Time zone'), el('.ctl.col', el('.ctl', tzSel, diffTz), el('.ctl.endtz', el('span.hint', 'Ends in'), endTzSel), tzHintEl));
    const sync = () => { sdIn.value = S0.sd; edIn.value = S0.ed; stIn.value = fmtMin(S0.sm); etIn.value = fmtMin(S0.em); stIn.classList.toggle('zk-hidden', S0.allDay); etIn.classList.toggle('zk-hidden', S0.allDay); rowTz.classList.toggle('zk-hidden', S0.allDay); rowTz.querySelector('.endtz').classList.toggle('zk-hidden', !S0.endTz); diffTz.textContent = S0.endTz ? 'Same end zone' : 'End time zone'; if (S0.endTz) endTzSel.value = S0.endTz; tzHint(); const bad = !S0.allDay && durMs() < 0; rowEnd.classList.toggle('bad', bad); if (CAL._edRule) CAL._edRule(); };
    // --- repeat
    const presetSel = el('select.zk-select', { 'aria-label': 'Repeat' }); for (const [v, l] of PRESETS) presetSel.append(el('option', { value: v }, l));
    const rulePanel = el('.rule.zk-hidden'); const rawIn = el('input.zk-input.selectable.mono', { 'aria-label': 'Recurrence rule (RRULE)', spellcheck: false, placeholder: 'FREQ=WEEKLY;BYDAY=MO' });
    const presetOf = (rule) => { if (!rule) return ''; const n = I.normRRule(rule); const hit = PRESETS.find((p) => p[0] && p[0] !== 'custom' && I.normRRule(p[0]) === n); return hit ? hit[0] : 'custom'; };
    const rruleNow = () => stateToRule(rst, ctx());
    const renderRule = () => {
      const val = rruleNow(); rulePanel.replaceChildren(); rawIn.value = rst.rawOnly ? rst.raw : val; const custom = presetSel.value === 'custom';
      if (!rst.on) { rulePanel.classList.add('zk-hidden'); return; } rulePanel.classList.toggle('zk-hidden', !custom && !rst.rawOnly && false);
      const sum = el('.hint.sum', zk.icon('repeat'), describeRule(val || 'FREQ=DAILY')); const kids = [];
      if (custom && !rst.rawOnly) {
        const fSel = el('select.zk-select', { 'aria-label': 'Frequency', onchange: () => { rst.freq = fSel.value; renderRule(); } }, ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((f) => el('option', { value: f, selected: f === rst.freq }, { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' }[f])));
        const n = el('input.zk-input.num', { type: 'number', min: 1, max: 999, value: rst.interval, 'aria-label': 'Interval', onchange: () => { rst.interval = Math.max(1, +n.value || 1); renderRule(); } });
        kids.push(el('.er', el('label', 'Every'), el('.ctl', n, el('span', { DAILY: 'day(s)', WEEKLY: 'week(s)', MONTHLY: 'month(s)', YEARLY: 'year(s)' }[rst.freq]), el('span.sp'), fSel)));
        if (rst.freq === 'WEEKLY') { const order = [...Array(7).keys()].map((i) => (CAL.firstDay() + i) % 7); kids.push(el('.er', el('label', 'On'), el('.ctl.wk', order.map((d) => el('button.zk-btn.bordered.wd' + (rst.days.has(d) ? '.on' : ''), { type: 'button', 'aria-pressed': rst.days.has(d), title: CAL.weekdayName(d, 'long'), onclick: () => { if (rst.days.has(d)) { if (rst.days.size > 1) rst.days.delete(d); } else rst.days.add(d); renderRule(); } }, CAL.weekdayName(d, 'short'))))) ); }
        if (rst.freq === 'YEARLY') kids.push(el('.er', el('label', 'In'), el('.ctl.mo', [...Array(12).keys()].map((mi) => el('button.zk-btn.bordered.wd' + (rst.months.has(mi + 1) ? '.on' : ''), { type: 'button', 'aria-pressed': rst.months.has(mi + 1), onclick: () => { if (rst.months.has(mi + 1)) { if (rst.months.size > 1) rst.months.delete(mi + 1); } else rst.months.add(mi + 1); renderRule(); } }, CAL.monthName(mi, 'short'))))));
        if (rst.freq === 'MONTHLY' || rst.freq === 'YEARLY') {
          const dom = el('input.zk-input.selectable', { value: rst.dom, style: { width: '100px' }, 'aria-label': 'Days of month', placeholder: '15 or 1,15,-1', onchange: () => { rst.dom = dom.value; renderRule(); } });
          const nthN = el('select.zk-select', { 'aria-label': 'Which', onchange: () => { rst.nthN = +nthN.value; renderRule(); } }, NTH.map(([v, l]) => el('option', { value: v, selected: v === rst.nthN }, l)));
          const nthW = el('select.zk-select', { 'aria-label': 'Weekday', onchange: () => { rst.nthWd = /^\d$/.test(nthW.value) ? +nthW.value : nthW.value; renderRule(); } }, [...[...Array(7).keys()].map((d) => el('option', { value: d, selected: rst.nthWd === d }, CAL.weekdayName(d, 'long'))), ...[['day', 'day'], ['weekday', 'weekday'], ['weekend', 'weekend day']].map(([v, l]) => el('option', { value: v, selected: rst.nthWd === v }, l))]);
          const r1 = el('input.zk-radio', { type: 'radio', name: 'mm', checked: rst.monthMode === 'dom', 'aria-label': 'On day of month', onchange: () => { rst.monthMode = 'dom'; renderRule(); } }), r2 = el('input.zk-radio', { type: 'radio', name: 'mm', checked: rst.monthMode === 'nth', 'aria-label': 'On the nth weekday', onchange: () => { rst.monthMode = 'nth'; renderRule(); } });
          kids.push(el('.er', el('label', 'On'), el('.ctl.col', el('.ctl', r1, el('span', 'Day'), dom), el('.ctl', r2, el('span', 'The'), nthN, nthW))));
        }
      }
      const eSel = el('select.zk-select', { 'aria-label': 'End repeat', onchange: () => { rst.end.type = eSel.value; renderRule(); } }, [['never', 'Never'], ['count', 'After'], ['until', 'On date']].map(([v, l]) => el('option', { value: v, selected: rst.end.type === v }, l)));
      const eCount = el('input.zk-input.num', { type: 'number', min: 1, value: rst.end.count, 'aria-label': 'Occurrences', onchange: () => { rst.end.count = Math.max(1, +eCount.value || 1); renderRule(); } }); const eDate = el('input.zk-input.d', { type: 'date', value: rst.end.until || S0.sd, 'aria-label': 'Repeat until', onchange: () => { rst.end.until = eDate.value; renderRule(); } }); if (rst.end.type === 'until' && !rst.end.until) rst.end.until = S0.sd;
      if (!rst.rawOnly) kids.push(el('.er', el('label', 'End repeat'), el('.ctl', eSel, rst.end.type === 'count' ? [eCount, el('span', 'times')] : null, rst.end.type === 'until' ? eDate : null)));
      kids.push(el('.er', el('label', 'Rule'), el('.ctl.col', rawIn, sum, rst.rawOnly ? el('.hint', 'This rule uses advanced parts; edit it as text.') : null)));
      if (recurringExisting && S0.exdates.length) kids.push(el('.er', el('label', 'Exceptions'), el('.ctl.wrapx', S0.exdates.map((x) => el('span.chip', CAL.fmt('dsh', { month: 'short', day: 'numeric', year: 'numeric' }, new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10))), el('button', { type: 'button', 'aria-label': 'Remove exception', onclick: () => { S0.exdates = S0.exdates.filter((y) => y !== x); renderRule(); } }, zk.icon('x')))))));
      rulePanel.append(...kids);
    };
    CAL._edRule = () => { if (rst.on && rst.end.type === 'until') renderRule(); else { const sum = rulePanel.querySelector('.sum'); if (sum) sum.lastChild.textContent = describeRule(rruleNow() || 'FREQ=DAILY'); rawIn.value = rst.rawOnly ? rst.raw : rruleNow(); } };
    presetSel.value = presetOf(ev0.rrule || ''); if (rst.rawOnly) presetSel.value = 'custom';
    presetSel.addEventListener('change', () => { const v = presetSel.value; rst.rawOnly = false; if (!v) { rst.on = false; rst.raw = ''; } else { rst.on = true; if (v !== 'custom') { const r = I.parseRRule(v); rst.freq = r.freq; rst.interval = r.interval; rst.days = r.byday.length ? new Set(r.byday.map((d) => d.wd)) : new Set([T.dow(T.dayNum(+S0.sd.slice(0, 4), +S0.sd.slice(5, 7), +S0.sd.slice(8, 10)))]); rst.monthMode = 'dom'; const w = T.parseWall(S0.sd); rst.dom = String(w.d); rst.months = new Set([w.m]); } else if (!rst.on || rst.freq === undefined) rst.freq = 'WEEKLY'; if (v === 'custom' && rst.raw && !I.parseRRule(rst.raw)) rst.raw = ''; } renderRule(); });
    rawIn.addEventListener('change', () => { const v = rawIn.value.trim().replace(/^RRULE:/i, ''); if (!v) { rst.on = false; presetSel.value = ''; renderRule(); return; } const n = I.normRRule(v); if (!n) { rawIn.classList.add('bad'); zk.toast('That is not a valid recurrence rule'); return; } rawIn.classList.remove('bad'); const t = ruleToState(n, S0.sd + 'T00:00:00'); Object.assign(rst, t); rst.raw = n; presetSel.value = presetOf(n); renderRule(); });
    // --- alerts
    const alertsBox = el('.alerts-ed');
    const renderAlerts = () => {
      alertsBox.replaceChildren(); S0.alarms.forEach((a, i) => {
        const opts = (S0.allDay ? ALERTS_AD.concat(ALERTS) : ALERTS); const s = el('select.zk-select', { 'aria-label': 'Alert ' + (i + 1), onchange: () => { a.m = +s.value; } }); if (a.abs) s.append(el('option', { value: 'abs' }, 'At ' + CAL.fmt('dt', { dateStyle: 'medium', timeStyle: 'short' }, new Date(a.abs)))); else { for (const [v, l] of opts) s.append(el('option', { value: v }, l)); if (!opts.some((x) => x[0] === a.m)) s.append(el('option', { value: a.m }, alertLabel(a.m))); s.value = a.m; }
        alertsBox.append(el('.ctl', s, el('button.zk-btn.icon', { type: 'button', 'aria-label': 'Remove alert', title: 'Remove alert', onclick: () => { S0.alarms.splice(i, 1); renderAlerts(); } }, zk.icon('minus-circle'))));
      });
      alertsBox.append(el('button.zk-btn.link', { type: 'button', onclick: () => { S0.alarms.push({ m: S0.allDay ? -540 : 15, action: 'DISPLAY' }); renderAlerts(); } }, S0.alarms.length ? 'Add another alert' : 'Add alert'));
    };
    // --- others
    const calS = calSelect(S0.cal, (v) => { S0.cal = v; dot.style.background = (CAL.calById(v) || {}).color; }); const dot = tick(cal0.color); const availS = el('select.zk-select', { 'aria-label': 'Availability', onchange: () => { S0.avail = availS.value; } }, [['busy', 'Busy'], ['free', 'Free'], ['tentative', 'Tentative'], ['oof', 'Out of Office']].map(([v, l]) => el('option', { value: v, selected: v === S0.avail }, l)));
    const travelS = el('select.zk-select', { 'aria-label': 'Travel time', onchange: () => { S0.travel = +travelS.value; } }, [[0, 'None'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours']].map(([v, l]) => el('option', { value: v, selected: v === S0.travel }, l))); if (![0, 5, 10, 15, 30, 45, 60, 90, 120].includes(S0.travel)) travelS.append(el('option', { value: S0.travel, selected: true }, S0.travel + ' minutes'));
    const sw2 = el('.swatches'); const paint = () => { sw2.replaceChildren(el('button.zk-swatch.none' + (!S0.color ? '.sel' : ''), { type: 'button', title: 'Calendar colour', 'aria-label': 'Calendar colour', onclick: () => { S0.color = ''; paint(); } }), ...CAL.PALETTE.map((c) => el('button.zk-swatch' + (S0.color === c ? '.sel' : ''), { type: 'button', style: { background: c }, 'aria-label': c, onclick: () => { S0.color = c; paint(); } }))); }; paint();
    const url = el('input.zk-input.selectable', { value: S0.url, placeholder: 'https://', 'aria-label': 'URL', type: 'url' }); const cats = el('input.zk-input.selectable', { value: S0.categories, placeholder: 'Comma-separated', 'aria-label': 'Categories' });
    const att = el('textarea.zk-textarea.selectable', { rows: 2, placeholder: 'Names or emails, one per line', 'aria-label': 'Attendees' }, S0.attendees); const notes = el('textarea.zk-textarea.selectable', { rows: 4, placeholder: 'Notes', 'aria-label': 'Notes' }, S0.notes);
    const R = (label, ...kids) => el('.er', el('label', label), el('.ctl', ...kids));
    const body = el('.ed', el('.er.tt', title), R('Location', locIn), el('hr'), R('All-day', allDay), rowStart, rowEnd, rowTz, el('hr'), R('Repeat', presetSel), rulePanel, el('hr'), el('.er', el('label', 'Alert'), alertsBox), el('hr'),
      R('Calendar', dot, calS), R('Availability', availS), R('Travel time', travelS), el('.er', el('label', 'Colour'), sw2), el('hr'), R('URL', url), el('.er', el('label', 'Attendees'), el('.ctl.col', att, el('.hint', 'Saved with the event and exported in .ics. Invitations cannot be sent (no network).'))), R('Categories', cats), el('.er', el('label', 'Notes'), el('.ctl', notes)));
    sync(); renderRule(); renderAlerts(); if (rst.on) rulePanel.classList.toggle('zk-hidden', false);
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=date],input.t,select')) { /* let the sheet's default Enter (Save) run */ } });
    // --- collect + save
    const collect = () => {
      const f = {}; f.title = title.value.trim() || 'New Event'; f.loc = locIn.value.trim(); f.notes = notes.value.replace(/\r\n?/g, '\n'); f.url = url.value.trim(); f.allDay = S0.allDay; f.tz = S0.allDay ? 'floating' : S0.tz; f.endTz = S0.allDay ? '' : S0.endTz && S0.endTz !== S0.tz ? S0.endTz : '';
      if (S0.allDay) { f.start = S0.sd; f.end = T.addDays(S0.ed < S0.sd ? S0.sd : S0.ed, 1); } else { f.start = S0.sd + 'T' + T.pad(Math.floor(S0.sm / 60)) + ':' + T.pad(S0.sm % 60) + ':00'; f.end = S0.ed + 'T' + T.pad(Math.floor(S0.em / 60)) + ':' + T.pad(S0.em % 60) + ':00'; if (durMs() < 0) f.end = T.epochToWall(T.wallToEpoch(f.start, f.tz) + 3600000, f.endTz || f.tz); }
      f.categories = cats.value.split(',').map((x) => x.trim()).filter(Boolean); const prev = m.attendees || []; f.attendees = CAL.parseAttendees(att.value).map((a) => { const old = prev.find((p) => (a.email && p.email === a.email) || (!a.email && p.name === a.name)); return old ? Object.assign({}, old, a) : a; });
      f.organizer = m.organizer || null; f.alarms = S0.alarms.map((a) => a); f.travel = S0.travel; f.avail = S0.avail; f.color = S0.color; f.status = m.status || ''; f.cal = S0.cal; f.rrule = rruleNow(); f.exdates = S0.exdates; return f;
    };
    const buttons = [{ label: 'Cancel', value: null }];
    if (!isNew) buttons.push({ label: 'Delete', danger: true, value: 'del', onClick: async (sheet) => { sheet.close('del'); return false; } });
    buttons.push({ label: isNew ? 'Add' : 'Save', primary: true, value: 'ok', onClick: () => { if (rst.on && presetSel.value === 'custom' && rawIn.classList.contains('bad')) { zk.toast('Fix the recurrence rule first'); return false; } return true; } });
    const p = zk.sheet({ title: isNew ? 'New Event' : 'Edit Event', body, buttons, width: 580 }).then(async (r) => {
      CAL._edRule = null; if (r === 'del') { await CAL.deleteOcc(o); return 'del'; } if (r !== 'ok') return null; const f = collect(); if (!f.allDay && !(ev0.x && ev0.x.some((x) => x.n === 'X-ZENG-FOCUS'))) { const s = T.wallToEpoch(f.start, f.tz), e2 = T.wallToEpoch(f.end, f.endTz || f.tz); if (!(await CAL.checkFocus(s, e2, isNew ? '' : ev0.id))) return null; }
      if (isNew) { const ev = CAL.createFrom(f, f.cal); if (f.rrule) ev.rrule = f.rrule; ev.exdates = []; ev.organizer = null; commitNew(ev); return ev; }
      await CAL.applyEdit(o, f, { verb: 'Save', label: 'Edit Event' }); return o;
    });
    setTimeout(() => { title.focus(); title.select(); }, 40); return p;
  };
  const clone = CAL.clone;

  // ------------------------------------------------------------------ read-only info (holidays, moon phases, subscribed events)
  CAL.showInfo = (o) => {
    const rows = [el('div', el('b', I.F(o, 'title'))), el('div', CAL.fmtWhen(o)), el('div.hint', tick(o.color), ' ', o.cal.name + (o.cal.readOnly || o.ev.ro ? ' · read-only' : ''))]; const loc = I.F(o, 'loc'), notes = I.F(o, 'notes'); if (loc) rows.push(el('div', loc)); if (notes) rows.push(el('div.hint.selectable', notes));
    zk.sheet({ title: '', body: el('.info', rows), buttons: [{ label: 'OK', primary: true }], width: 380 });
  };

  // ------------------------------------------------------------------ find free time
  CAL.suggestTime = () => {
    const dur = el('select.zk-select', { 'aria-label': 'Duration' }, [15, 30, 45, 60, 90, 120, 180, 240].map((m) => el('option', { value: m, selected: m === 60 }, m < 60 ? m + ' minutes' : m === 60 ? '1 hour' : m % 60 ? m / 60 + ' hours' : m / 60 + ' hours')));
    const span = el('select.zk-select', { 'aria-label': 'Look ahead' }, [[7, 'next 7 days'], [14, 'next 14 days'], [30, 'next 30 days']].map(([v, l]) => el('option', { value: v }, l)));
    const allowFocus = el('input.zk-check', { type: 'checkbox', 'aria-label': 'Allow inside focus blocks' }); const list = el('.fl'); const wh = `${fmtMin(S.set.workStart)} – ${fmtMin(S.set.workEnd)}`;
    const calc = () => {
      list.replaceChildren(); const now = Date.now(); const to = now + +span.value * DAY; const busy = [];
      for (const o of CAL.occurrences(now - DAY, to + DAY)) { if (allowFocus.checked && ZC.balance.isFocus(o.ev)) continue; const av = I.F(o, 'avail') || 'busy'; if (o.allDay || av === 'free' || o.ro) continue; const tr = (I.F(o, 'travel') || 0) * MIN; busy.push([o.s - tr, o.e]); }
      const w = FREE.windows(busy, now, to, +dur.value * MIN, { workStart: S.set.workStart, workEnd: S.set.workEnd, days: S.set.workDays, step: S.set.snap }).slice(0, 60);
      if (!w.length) { list.append(el('.zk-empty', el('strong', 'No free time found'), el('span', 'Try a shorter duration or a longer range.'))); return; }
      let lastDay = '';
      for (const x of w) { const s = new Date(x.s); const dk = CAL.fmt('dwd2', { weekday: 'long', month: 'long', day: 'numeric' }, s); if (dk !== lastDay) { list.append(el('.fl-day', dk)); lastDay = dk; } list.append(el('.fl-row', el('span.tm', CAL.fmtTime(s) + ' – ' + CAL.fmtTime(new Date(x.e))), el('span.hint', CAL.fmtDur(x.e - x.s) + ' free'), el('button.zk-btn.bordered', { type: 'button', onclick: () => { sheetRef.close(null); S.date = CAL.day0(s); const ev = CAL.draftFor(s, new Date(x.s + +dur.value * MIN), false); CAL.render({ anim: null }); if (ev) CAL.openEditor(null, ev); } }, 'Schedule…'))); }
    };
    dur.onchange = span.onchange = allowFocus.onchange = calc;
    const body = el('.ft', el('.er', el('label', 'Duration'), el('.ctl', dur)), el('.er', el('label', 'Look in'), el('.ctl', span)), el('label.er', el('label', 'Focus blocks'), el('.ctl', allowFocus, el('span', 'Allow inside protected focus blocks'))), el('.hint', `Working hours ${wh}; checks visible calendars (all-day events and Free events are ignored). Change hours in Preferences.`), list);
    let sheetRef = null; const pr = zk.sheet({ title: 'Find Free Time', body, buttons: [{ label: 'Done', primary: true }], width: 460 }); setTimeout(() => { sheetRef = document.querySelector('.zk-scrim:last-of-type .zk-sheet'); calc(); }, 0); return pr;
  };
})();
