/* ZengCalendar core: state, persistence (zeng.store), calendars, event operations with undo, occurrence queries,
   formatting, alert engine. UI lives in views.js / interact.js / editor.js / io.js; boot in app.js. */
(function () {
  'use strict';
  const { time: T, ical: I, holidays: H, moon: M } = ZC;
  const CAL = (window.CAL = {});
  const DAY = T.DAY, MIN = 60000;
  const S = (CAL.S = {
    cals: [], ev: new Map(), date: new Date(), sel: null, rev: 0, hist: [], redo: [], missed: [], clip: null, query: '',
    set: { view: 'week', nDays: 4, firstDay: null, clock: 'auto', weekNumbers: true, snap: 15, workStart: 540, workEnd: 1020, workDays: [1, 2, 3, 4, 5], defaultCal: '', defaultDur: 60, defaultAlert: null, hourH: 48, sidebar: true, locale: '', travelShow: true, miniMonth: true },
    alerts: { lastCheck: 0, dismissed: {}, snoozed: {}, missed: [] },
  });
  CAL.PALETTE = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#40c8e0', '#0a84ff', '#bf5af2', '#ff375f', '#ac8e68', '#8e8e93'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  CAL.clone = clone;

  // ------------------------------------------------------------------ formatting
  const fcache = new Map();
  const loc = () => S.set.locale || navigator.language || 'en-US'; CAL.locale = loc;
  const h12 = () => (S.set.clock === '12' ? true : S.set.clock === '24' ? false : new Intl.DateTimeFormat(loc(), { hour: 'numeric' }).resolvedOptions().hour12);
  CAL.h12 = h12;
  const fmt = (key, opts) => { const k = loc() + '|' + key; let f = fcache.get(k); if (!f) { f = new Intl.DateTimeFormat(loc(), opts); fcache.set(k, f); } return f; };
  CAL.resetFormats = () => fcache.clear();
  CAL.fmtTime = (d, o = {}) => { const mins = d.getMinutes(); const hour12 = h12(); if (hour12 && mins === 0 && !o.full) return fmt('h12h', { hour: 'numeric', hour12 }).format(d); return fmt('hm' + hour12, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 }).format(d); };
  CAL.fmtHour = (h) => { const d = new Date(2000, 0, 1, h, 0); return h12() ? fmt('h12h', { hour: 'numeric', hour12: true }).format(d) : fmt('hm24', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
  CAL.fmt = (key, opts, d) => fmt(key + JSON.stringify(opts), opts).format(d);
  CAL.weekdayName = (dow, style = 'short') => fmt('wd' + style, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow)));
  CAL.monthName = (m, style = 'long') => fmt('mo' + style, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, m, 1)));
  CAL.firstDay = () => { if (S.set.firstDay != null) return S.set.firstDay; try { const l = new Intl.Locale(loc()); const wi = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo; if (wi) return wi.firstDay % 7; } catch { /* fall through */ } return /^en-(US|CA)|^ja|^pt-BR|^zh-TW|^he|^ko/i.test(loc()) ? 0 : 1; };
  CAL.fmtDur = (ms) => { const m = Math.round(ms / MIN); if (m < 60) return m + ' min'; if (m < 1440) return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); const d = Math.floor(m / 1440); return d + (d === 1 ? ' day' : ' days'); };
  CAL.dateKey = T.dayKey;
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()); CAL.day0 = day0;
  const addDays = T.addDaysLocal; CAL.addDays = addDays;
  CAL.fmtOccTime = (o) => { // "10:00 – 11:00" or "all-day"
    if (o.allDay) return 'all-day'; const s = new Date(o.s), e = new Date(o.e); if (o.e <= o.s) return CAL.fmtTime(s);
    return CAL.fmtTime(s) + ' – ' + CAL.fmtTime(e);
  };
  CAL.fmtWhen = (o) => { // long, for popovers/search
    const s = new Date(o.s); const dd = fmt('dlong', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (o.allDay) { const last = new Date(o.e - 1); return T.sameDay(s, last) ? dd.format(s) : dd.format(s) + ' – ' + dd.format(last); }
    const e = new Date(o.e); return T.sameDay(s, e) ? dd.format(s) + ', ' + CAL.fmtOccTime(o) : dd.format(s) + ' ' + CAL.fmtTime(s) + ' – ' + dd.format(e) + ' ' + CAL.fmtTime(e);
  };

  // ------------------------------------------------------------------ persistence
  const dirtyCals = new Set(); let metaDirty = false, flushT = 0;
  const save = () => { clearTimeout(flushT); flushT = setTimeout(CAL.flush, 150); };
  CAL.flush = async () => {
    clearTimeout(flushT); const ids = [...dirtyCals]; dirtyCals.clear();
    for (const id of ids) { const c = S.cals.find((x) => x.id === id); if (!c || c.kind !== 'local') continue; await zeng.store.set('cal-ev-' + id, [...S.ev.values()].filter((e) => e.cal === id)); }
    if (metaDirty) { metaDirty = false; await zeng.store.set('cal-meta', { v: 1, cals: S.cals, set: S.set, alerts: S.alerts }); }
  };
  CAL.touchCal = (id) => { dirtyCals.add(id); S.rev++; save(); };
  CAL.touchMeta = () => { metaDirty = true; S.rev++; save(); };
  CAL.persistAlerts = () => { metaDirty = true; save(); };
  const defaultCals = () => [{ id: 'c-home', name: 'Home', color: '#ff9f0a', group: 'On My Computer', visible: true, kind: 'local' }, { id: 'c-work', name: 'Work', color: '#0a84ff', group: 'On My Computer', visible: true, kind: 'local' }];
  CAL.regionCountry = () => { const m = /[-_]([A-Za-z]{2})\b/.exec(navigator.language || ''); const r = m && m[1].toUpperCase(); return r === 'UK' ? 'GB' : r; };
  CAL.holidayCal = (cc) => ({ id: 'hol-' + cc, name: H.countries[cc] + ' Holidays', color: '#ff9f0a', group: 'Holidays', visible: true, kind: 'holiday', country: cc, readOnly: true });
  CAL.load = async () => {
    const meta = await zeng.store.get('cal-meta', null);
    if (meta && Array.isArray(meta.cals)) { S.cals = meta.cals; Object.assign(S.set, meta.set || {}); Object.assign(S.alerts, meta.alerts || {}); }
    else { S.cals = defaultCals(); const cc = CAL.regionCountry(); if (cc && H.countries[cc]) S.cals.push(CAL.holidayCal(cc)); S.set.defaultCal = 'c-home'; metaDirty = true; }
    for (const c of S.cals) if (c.kind === 'local') { const arr = await zeng.store.get('cal-ev-' + c.id, []); for (const e of arr || []) { e.cal = c.id; if (!e.overrides) e.overrides = {}; S.ev.set(e.id, e); } }
    if (!S.cals.some((c) => c.id === S.set.defaultCal && c.kind === 'local' && !c.readOnly)) S.set.defaultCal = (S.cals.find((c) => c.kind === 'local' && !c.readOnly) || {}).id || '';
    S.rev++;
  };
  CAL.calById = (id) => S.cals.find((c) => c.id === id);
  CAL.writableCals = () => S.cals.filter((c) => c.kind === 'local' && !c.readOnly);
  CAL.defaultCal = () => CAL.calById(S.set.defaultCal) || CAL.writableCals()[0] || null;
  CAL.groups = () => { const g = []; for (const c of S.cals) if (!g.includes(c.group || 'Other')) g.push(c.group || 'Other'); return g; };

  // ------------------------------------------------------------------ calendars
  CAL.addCalendar = (o) => { const c = Object.assign({ id: 'c-' + zk.uid(), name: 'New Calendar', color: CAL.PALETTE[S.cals.filter((x) => x.kind === 'local').length % CAL.PALETTE.length], group: 'On My Computer', visible: true, kind: 'local' }, o); S.cals.push(c); if (!CAL.defaultCal() && !c.readOnly) S.set.defaultCal = c.id; CAL.touchMeta(); dirtyCals.add(c.id); return c; };
  CAL.updateCalendar = (c, p) => { Object.assign(c, p); CAL.touchMeta(); };
  CAL.deleteCalendar = (c) => {
    const evs = [...S.ev.values()].filter((e) => e.cal === c.id); const changes = evs.map((e) => ({ before: clone(e), after: null }));
    for (const e of evs) S.ev.delete(e.id); S.cals = S.cals.filter((x) => x !== c);
    if (S.set.defaultCal === c.id) S.set.defaultCal = (CAL.writableCals()[0] || {}).id || '';
    if (c.kind === 'local') zeng.store.set('cal-ev-' + c.id, []); dirtyCals.delete(c.id); CAL.touchMeta();
    pushHist('Delete Calendar', [{ calDelete: clone(c), changes }]);
  };
  CAL.eventsOf = (calId) => [...S.ev.values()].filter((e) => e.cal === calId);

  // ------------------------------------------------------------------ undo / redo
  const MAXH = 100;
  function pushHist(label, items) { S.hist.push({ label, items }); if (S.hist.length > MAXH) S.hist.shift(); S.redo.length = 0; CAL.onHistory && CAL.onHistory(); }
  const applyChange = (ch, dir) => { // dir: 'undo' -> restore before; 'redo' -> restore after
    const to = dir === 'undo' ? ch.before : ch.after, from = dir === 'undo' ? ch.after : ch.before;
    if (from) { const cur = S.ev.get(from.id); if (cur) dirtyCals.add(cur.cal); S.ev.delete(from.id); }
    if (to) { const e = clone(to); S.ev.set(e.id, e); dirtyCals.add(e.cal); }
  };
  /** changes: [{before: event|null, after: event|null}] (already applied to S.ev by caller via CAL.put/remove) */
  CAL.commit = (label, changes) => { changes = changes.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after)); if (!changes.length) return; pushHist(label, [{ changes }]); S.rev++; save(); };
  CAL.undo = () => {
    const h = S.hist.pop(); if (!h) return false; S.redo.push(h);
    for (const it of [...h.items].reverse()) { if (it.calDelete) { S.cals.push(clone(it.calDelete)); metaDirty = true; } for (const ch of it.changes) applyChange(ch, 'undo'); if (it.calDelete) dirtyCals.add(it.calDelete.id); }
    S.rev++; save(); CAL.onHistory && CAL.onHistory(); return h.label;
  };
  CAL.redo = () => {
    const h = S.redo.pop(); if (!h) return false; S.hist.push(h);
    for (const it of h.items) { for (const ch of it.changes) applyChange(ch, 'redo'); if (it.calDelete) { S.cals = S.cals.filter((c) => c.id !== it.calDelete.id); metaDirty = true; } }
    S.rev++; save(); CAL.onHistory && CAL.onHistory(); return h.label;
  };

  // ------------------------------------------------------------------ events
  CAL.blank = (o) => { const e = I.newEvent(o); if (!e.uid) e.uid = I.uid(); e.id = e.uid; return e; };
  /** store an event (insert/replace); returns change record. */
  CAL.put = (e) => { const before = S.ev.get(e.id); const b = before ? clone(before) : null; e.modified = Date.now(); if (!e.created) e.created = e.modified; S.ev.set(e.id, e); dirtyCals.add(e.cal); if (b && b.cal !== e.cal) dirtyCals.add(b.cal); return { before: b, after: clone(e) }; };
  CAL.remove = (e) => { const b = clone(e); S.ev.delete(e.id); dirtyCals.add(e.cal); return { before: b, after: null }; };
  const alertsFor = (cal, allDay) => { const m = cal && cal.alert != null ? cal.alert : S.set.defaultAlert; if (m == null || m === '') return []; return [{ m: allDay && +m >= 0 && +m < 1440 && cal.alert == null && S.set.defaultAlert != null ? +m : +m, action: 'DISPLAY' }]; };
  CAL.newEventAt = (startWall, endWall, allDay, cal) => { cal = cal || CAL.defaultCal(); const tz = allDay ? 'floating' : 'floating'; return CAL.blank({ cal: cal ? cal.id : '', start: startWall, end: endWall, allDay, tz, alarms: alertsFor(cal, allDay) }); };

  // field sets that may differ per occurrence
  const FIELDS = I.FIELDS;
  const fieldsOf = (m) => { const o = {}; for (const f of FIELDS) o[f] = clone(m[f] === undefined ? null : m[f]); return o; };
  CAL.fieldsOfOcc = (o) => { const m = I.merged(o); const f = fieldsOf(m); f.rrule = o.ev.rrule; f.cal = o.ev.cal; f.exdates = o.ev.exdates.slice(); return f; };
  const wallDeltaMs = (a, b) => T.wallToW(a) - T.wallToW(b);
  const isSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** Duration in ms of an edited field set (exact, honouring different end zone) */
  const durOf = (f) => { if (f.allDay) return null; return T.wallToEpoch(f.end, f.endTz || f.tz) - T.wallToEpoch(f.start, f.tz); };
  const applyFieldsToMaster = (ev, f, o) => {
    // shift schedule of master by the delta between edited occurrence and its original start (so "all events" keeps pattern)
    const oldStart = ev.start, wasRule = ev.rrule;
    const dayDelta = T.dayNum(+f.start.slice(0, 4), +f.start.slice(5, 7), +f.start.slice(8, 10)) - T.dayNum(+o.wallStart.slice(0, 4), +o.wallStart.slice(5, 7), +o.wallStart.slice(8, 10));
    const msd = T.parseWall(ev.start); const newDay = T.dayNum(msd.y, msd.m, msd.d) + dayDelta;
    for (const k of ['title', 'loc', 'notes', 'url', 'categories', 'attendees', 'organizer', 'alarms', 'travel', 'avail', 'color', 'status']) if (k in f) ev[k] = clone(f[k]);
    ev.allDay = !!f.allDay; ev.tz = f.allDay ? 'floating' : f.tz; ev.endTz = f.allDay ? '' : f.endTz && f.endTz !== f.tz ? f.endTz : '';
    if (f.allDay) { const span = Math.max(1, T.dayNum(+f.end.slice(0, 4), +f.end.slice(5, 7), +f.end.slice(8, 10)) - T.dayNum(+f.start.slice(0, 4), +f.start.slice(5, 7), +f.start.slice(8, 10))); ev.start = T.dateStr(newDay); ev.end = T.dateStr(newDay + span); }
    else { ev.start = T.dateStr(newDay) + f.start.slice(10); const d = durOf(f); ev.end = T.epochToWall(T.wallToEpoch(ev.start, ev.tz) + Math.max(0, d), ev.endTz || ev.tz); }
    const rr = f.rrule == null ? ev.rrule : f.rrule; const ruleChanged = rr !== wasRule; ev.rrule = rr; if (f.exdates && !ruleChanged) ev.exdates = f.exdates.slice();
    if (ruleChanged || !rr) { ev.overrides = {}; ev.exdates = []; ev.rdates = []; }
    else if (ev.start !== oldStart) { // shift exceptions with the series
      const dm = wallDeltaMs(ev.start, oldStart); const sh = (k) => T.addWall(k, dm); const no = {};
      for (const k in ev.overrides) { const p = clone(ev.overrides[k]); if (p.start) p.start = sh(p.start); if (p.end) p.end = sh(p.end); no[sh(k)] = p; } ev.overrides = no; ev.exdates = ev.exdates.map(sh); ev.rdates = ev.rdates.map(sh);
    }
    if (f.cal && f.cal !== ev.cal && CAL.calById(f.cal)) ev.cal = f.cal;
    return ev;
  };
  const overrideFrom = (ev, key, f) => {
    const base = I.occurrenceAt(ev, key); const p = {};
    for (const k of FIELDS) { if (k === 'start' || k === 'end') continue; if (k in f && !isSame(f[k], ev[k] === undefined ? null : ev[k])) p[k] = clone(f[k]); }
    if (f.allDay !== ev.allDay) p.allDay = f.allDay;
    const start = f.allDay ? f.start.slice(0, 10) : f.start, end = f.allDay ? f.end.slice(0, 10) : f.end;
    if (start !== base.wallStart || end !== base.wallEnd || 'tz' in p || 'endTz' in p || 'allDay' in p) { p.start = start; p.end = end; if (!f.allDay) { p.tz = f.tz; p.endTz = f.endTz && f.endTz !== f.tz ? f.endTz : ''; } }
    return Object.fromEntries(FIELDS.filter((k) => k in p).map((k) => [k, p[k]]));
  };
  CAL.untilBefore = (ev, key) => { // UNTIL value 1 second before occurrence `key`
    const w = ev.allDay ? T.addDays(key.slice(0, 10), -1) : T.addWall(key, -1000); return I.makeUntil(ev, w);
  };
  const withUntil = (rule, until) => { const r = I.parseRRule(rule); r.count = 0; r.until = until; return I.stringifyRRule(r); };

  /** Edit one occurrence with field set `f` (see fieldsOfOcc). scope: 'this' | 'future' | 'all'. Returns change list. */
  CAL.editOccurrence = (o, f, scope) => {
    const ev = o.ev; const recurring = I.isRecurring(ev); const changes = [];
    if (!recurring || scope === 'all' || (scope === 'future' && o.key === ev.start)) {
      applyFieldsToMaster(ev, f, o); changes.push(CAL.put(ev)); return changes;
    }
    if (scope === 'this') {
      const p = overrideFrom(ev, o.key, f); if (Object.keys(p).length) ev.overrides[o.key] = p; else delete ev.overrides[o.key];
      changes.push(CAL.put(ev)); return changes;
    }
    // future: split the series at o.key; the tail becomes a new series carrying the edit
    const rr = I.ruleOf(ev); const before = rr && rr.count ? I.countBefore(ev, o.key) : 0;
    const bs = I.base(ev); const tail = clone(ev); tail.uid = I.uid(); tail.id = tail.uid; tail.created = 0; delete tail.sequence; tail.x = [];
    tail.start = bs.allDay ? o.key.slice(0, 10) : o.key; tail.end = bs.allDay ? T.addDays(tail.start, bs.span) : T.epochToWall(T.wallToEpoch(o.key, ev.tz) + bs.d, ev.endTz || ev.tz);
    tail.overrides = {}; tail.exdates = []; tail.rdates = [];
    for (const k in ev.overrides) if (k > o.key) tail.overrides[k] = clone(ev.overrides[k]);
    for (const k of ev.exdates) if (k > o.key) tail.exdates.push(k);
    if (rr && rr.count) tail.rrule = withCount(ev.rrule, Math.max(1, rr.count - before));
    const f2 = Object.assign({}, f); f2.rrule = f.rrule == null || f.rrule === ev.rrule ? tail.rrule : f.rrule;
    applyFieldsToMaster(tail, f2, { wallStart: tail.start, ev: tail });
    ev.rrule = withUntil(ev.rrule, CAL.untilBefore(ev, o.key));
    for (const k of Object.keys(ev.overrides)) if (k >= o.key) delete ev.overrides[k]; ev.exdates = ev.exdates.filter((k) => k < o.key); ev.rdates = ev.rdates.filter((k) => k < o.key);
    changes.push(CAL.put(ev), CAL.put(tail)); return changes;
  };
  const withCount = (rule, n) => { const r = I.parseRRule(rule); r.count = n; r.until = ''; return I.stringifyRRule(r); };
  CAL.deleteOccurrence = (o, scope) => {
    const ev = o.ev; const changes = [];
    if (!I.isRecurring(ev) || scope === 'all' || (scope === 'future' && o.key === ev.start)) { changes.push(CAL.remove(ev)); }
    else if (scope === 'this') { if (!ev.exdates.includes(o.key)) ev.exdates.push(o.key); delete ev.overrides[o.key]; changes.push(CAL.put(ev)); }
    else { ev.rrule = withUntil(ev.rrule, CAL.untilBefore(ev, o.key)); for (const k of Object.keys(ev.overrides)) if (k >= o.key) delete ev.overrides[k]; ev.exdates = ev.exdates.filter((k) => k < o.key); changes.push(CAL.put(ev)); }
    return changes;
  };
  /** new standalone event from an occurrence field set (duplicate / paste) */
  CAL.createFrom = (f, calId) => { const e = CAL.blank({}); for (const k of FIELDS) if (k in f && f[k] !== null) e[k] = clone(f[k]); e.cal = calId || f.cal || (CAL.defaultCal() || {}).id; e.tz = f.allDay ? 'floating' : f.tz || 'floating'; e.allDay = !!f.allDay; e.rrule = ''; e.exdates = []; e.rdates = []; e.overrides = {}; e.x = []; return e; };
  CAL.moveToCal = (e, calId) => { const b = clone(e); e.cal = calId; return CAL.put(e) && { before: b, after: clone(e) }; };

  // ------------------------------------------------------------------ occurrence queries
  const hcache = new Map();
  const pseudo = (cal, id, title, date, notes) => { let e = hcache.get(id); if (!e) { e = I.newEvent({ id, uid: id, title, allDay: true, start: date, end: T.addDays(date, 1), tz: 'floating', cal: cal.id, ro: true, notes: notes || '' }); hcache.set(id, e); if (hcache.size > 6000) hcache.delete(hcache.keys().next().value); } return e; };
  const specialOccs = (c, from, to, out) => {
    const y0 = new Date(from).getFullYear() - 1, y1 = new Date(to).getFullYear() + 1;
    if (c.kind === 'holiday') { for (const h of H.range(c.country, y0, y1)) { const n = T.dayNum(+h.date.slice(0, 4), +h.date.slice(5, 7), +h.date.slice(8, 10)); const s = T.wToEpoch(n * DAY, 'floating'); if (s < to && s + DAY > from) I.expand(pseudo(c, 'h:' + c.id + ':' + h.date, h.name, h.date), from, to, out); } }
    else if (c.kind === 'moon') { for (const p of M.phases(from - 2 * DAY, to + DAY)) { const d = new Date(p.at); const ds = d.getFullYear() + '-' + T.pad(d.getMonth() + 1) + '-' + T.pad(d.getDate()); const sym = { 'New Moon': '●', 'First Quarter': '◑', 'Full Moon': '○', 'Last Quarter': '◐' }[p.name]; I.expand(pseudo(c, 'm:' + ds + p.name, sym + ' ' + p.name, ds, p.name + ' at ' + CAL.fmtTime(d, { full: true }) + ' (approximate)'), from, to, out); } }
  };
  let qcache = [];
  /** occurrences overlapping [from,to) for visible calendars (or all when opts.all). */
  CAL.occurrences = (from, to, opts = {}) => {
    const sig = S.cals.map((c) => (c.visible || opts.all ? 1 : 0)).join('') + S.cals.length; const key = S.rev + '|' + from + '|' + to + '|' + sig + (opts.all ? 'a' : '');
    const hit = qcache.find((q) => q.key === key); if (hit) return hit.occs;
    const calMap = new Map(S.cals.map((c) => [c.id, c])); const out = [];
    for (const e of S.ev.values()) { const c = calMap.get(e.cal); if (!c || !(c.visible || opts.all)) continue; const n = out.length; I.expand(e, from, to, out); for (let i = n; i < out.length; i++) { out[i].cal = c; } }
    for (const c of S.cals) if ((c.visible || opts.all) && c.kind !== 'local') { const n = out.length; specialOccs(c, from, to, out); for (let i = n; i < out.length; i++) out[i].cal = c; }
    for (const o of out) { o.color = I.F(o, 'color') || o.cal.color; o.ro = !!o.ev.ro || !!o.cal.readOnly; }
    out.sort((a, b) => a.s - b.s || b.e - a.e || (I.F(a, 'title') || '').localeCompare(I.F(b, 'title') || ''));
    qcache.unshift({ key, occs: out }); qcache.length = Math.min(qcache.length, 6); return out;
  };
  CAL.occById = (id, near) => { // locate an occurrence again after a re-render
    const [eid, key] = [id.slice(0, id.indexOf('|')), id.slice(id.indexOf('|') + 1)]; const ev = S.ev.get(eid) || hcache.get(eid); if (!ev) return null; const o = I.occurrenceAt(ev, key); o.cal = CAL.calById(ev.cal); if (!o.cal) return null; o.color = I.F(o, 'color') || o.cal.color; o.ro = !!ev.ro || !!o.cal.readOnly; return o;
  };
  /** the first occurrence of ev on or after `from` (epoch) */
  CAL.nextOcc = (ev, from) => { const out = []; I.expand(ev, from, from + 800 * DAY, out); out.sort((a, b) => a.s - b.s); if (out[0]) return out[0]; I.expand(ev, from - 800 * DAY, from, out); out.sort((a, b) => b.s - a.s); return out[0] || null; };

  // ------------------------------------------------------------------ search
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  CAL.norm = norm;
  let hay = { rev: -1, map: new Map() };
  CAL.search = (q, limit = 300) => {
    q = norm(q.trim()); if (!q) return []; if (hay.rev !== S.rev) hay = { rev: S.rev, map: new Map() }; const terms = q.split(/\s+/); const res = [];
    const calMap = new Map(S.cals.map((c) => [c.id, c])); const now = Date.now();
    const consider = (e) => { let h = hay.map.get(e.id); if (h === undefined) { h = norm([e.title, e.loc, e.notes, e.url, (e.categories || []).join(' '), (e.attendees || []).map((a) => a.name + ' ' + a.email).join(' ')].join('\n')); hay.map.set(e.id, h); } if (terms.every((t) => h.includes(t))) { const c = calMap.get(e.cal); if (!c) return; const o = CAL.nextOcc(e, now - DAY); if (o) { o.cal = c; o.color = I.F(o, 'color') || c.color; o.ro = !!e.ro || !!c.readOnly; res.push(o); } } };
    for (const e of S.ev.values()) consider(e);
    for (const c of S.cals) if (c.kind !== 'local' && c.visible) { const out = []; specialOccs(c, now - 400 * DAY, now + 800 * DAY, out); for (const o of out) { if (terms.every((t) => norm(o.ev.title).includes(t))) { o.cal = c; o.color = c.color; o.ro = true; res.push(o); } } }
    const t0 = new Date(now).setHours(0, 0, 0, 0); res.sort((a, b) => { const au = a.s >= t0, bu = b.s >= t0; if (au !== bu) return au ? -1 : 1; return au ? a.s - b.s : b.s - a.s; }); return res.slice(0, limit);
  };

  // ------------------------------------------------------------------ alerts (engine only; banners are drawn by views.js)
  const alarmLead = () => { let m = 0; for (const e of S.ev.values()) for (const a of e.alarms || []) m = Math.max(m, a.m || 0); for (const e of S.ev.values()) for (const k in e.overrides || {}) for (const a of (e.overrides[k].alarms || [])) m = Math.max(m, a.m || 0); return m; };
  /** alerts whose trigger time lies in (from, to]; each {key, o, at, m} */
  CAL.alertsBetween = (from, to) => {
    const lead = alarmLead() * MIN + DAY; const out = []; const occs = [];
    for (const e of S.ev.values()) { if (!(e.alarms && e.alarms.length) && !Object.values(e.overrides || {}).some((p) => p.alarms)) continue; I.expand(e, from - DAY * 2, to + lead, occs); }
    for (const o of occs) { const als = I.F(o, 'alarms') || []; als.forEach((a, i) => { const at = a.abs ? a.abs : (a.rel === 'END' ? o.e : o.s) - a.m * MIN; if (at > from && at <= to) { o.cal = CAL.calById(o.ev.cal); if (!o.cal) return; o.color = I.F(o, 'color') || o.cal.color; out.push({ key: o.id + '#' + i, o, at, m: a.m, abs: !!a.abs }); } }); }
    return out.sort((a, b) => a.at - b.at);
  };
  CAL.pruneAlertState = () => { const cut = Date.now() - 45 * DAY; for (const k of Object.keys(S.alerts.dismissed)) if (S.alerts.dismissed[k] < cut) delete S.alerts.dismissed[k]; for (const k of Object.keys(S.alerts.snoozed)) if (S.alerts.snoozed[k] < cut) delete S.alerts.snoozed[k]; };

  // ------------------------------------------------------------------ misc helpers shared by UI files
  CAL.periodRange = (view, date) => { // [from,to) as Date objects for the visible period
    const d = day0(date); const fd = CAL.firstDay();
    switch (view) {
      case 'day': return [d, addDays(d, 1)];
      case 'week': { const s = T.startOfWeek(d, fd); return [s, addDays(s, 7)]; }
      case 'workweek': { const s = T.startOfWeek(d, fd); const days = S.set.workDays.length ? S.set.workDays : [1, 2, 3, 4, 5]; const first = [...Array(7).keys()].map((i) => addDays(s, i)).filter((x) => days.includes(x.getDay())); return [first[0] || s, addDays(first[first.length - 1] || s, 1)]; }
      case 'days': return [d, addDays(d, S.set.nDays)];
      case 'month': { const first = new Date(d.getFullYear(), d.getMonth(), 1); const s = T.startOfWeek(first, fd); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); const e = addDays(T.startOfWeek(last, fd), 7); return [s, e]; }
      case 'year': return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1)];
      default: return [d, addDays(d, S.agendaDays || 30)];
    }
  };
  CAL.shift = (view, date, dir) => {
    const d = day0(date);
    switch (view) {
      case 'day': return addDays(d, dir); case 'week': case 'workweek': return addDays(d, 7 * dir); case 'days': return addDays(d, S.set.nDays * dir);
      case 'month': { const t = new Date(d.getFullYear(), d.getMonth() + dir, 1); t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return t; }
      case 'year': return new Date(d.getFullYear() + dir, Math.min(d.getMonth(), 11), Math.min(d.getDate(), 28));
      default: return addDays(d, 7 * dir);
    }
  };
  /** parse "name <email>" / "email" / "name" lines into attendee objects */
  CAL.parseAttendees = (txt) => txt.split(/[\n;]+|,(?=\s*[^,<]*<)|,(?=\s*[^\s,@]+@)/).map((s) => s.trim()).filter(Boolean).map((s) => { const m = /^(.*?)\s*<([^>]+)>$/.exec(s); if (m) return { name: m[1].replace(/^"|"$/g, ''), email: m[2].trim() }; return /^[^\s@]+@[^\s@]+$/.test(s) ? { name: '', email: s } : { name: s, email: '' }; });
  CAL.fmtAttendee = (a) => (a.name && a.email ? `${a.name} <${a.email}>` : a.email || a.name);
  CAL.colorOf = (o) => o.color;
})();
