/* Import / export: iCalendar (VTODO), CSV, Markdown checklists.
   Reminder objects use the app model: {id,list,parent,title,notes,url,due,time,repeat,early,priority,flag,tags,done,doneAt,created,order}.
   Parsers return {items:[{uid,parentUid,listName,...}], colors:{listName:'#rrggbb'}} (see each fromX). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'), require('./recur.js'), require('./parser.js'));
  else (root.ZR = root.ZR || {}).io = factory(root.ZR.dates, root.ZR.recur, root.ZR.parser);
})(this, function (D, R, P) {
  const p2 = D.p2;
  // ============ iCalendar ============
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const unesc = (s) => s.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
  const fold = (line) => {
    const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
    const out = []; let cur = ''; let bytes = 0; let limit = 75;
    for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; } cur += ch; bytes += b; }
    out.push(cur); return out.join('\r\n');
  };
  const icsDate = (d) => d.replace(/-/g, '');
  const icsDT = (d, t) => icsDate(d) + 'T' + t.replace(':', '') + '00';
  const utcStamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`; };
  const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  function rruleString(rule, hasTime) {
    const r = R.norm(rule); if (!r) return null; const p = ['FREQ=' + r.freq.toUpperCase()];
    if (r.interval > 1) p.push('INTERVAL=' + r.interval);
    if (r.byday) p.push('BYDAY=' + r.byday.join(',')); if (r.bymonthday) p.push('BYMONTHDAY=' + r.bymonthday.join(',')); if (r.bymonth) p.push('BYMONTH=' + r.bymonth);
    if (r.until) p.push('UNTIL=' + icsDate(r.until) + (hasTime ? 'T235959' : '')); if (r.count) p.push('COUNT=' + r.count);
    return p.join(';');
  }
  function parseRRule(s) {
    const kv = {}; String(s).split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) kv[p.slice(0, i).toUpperCase()] = p.slice(i + 1); });
    const f = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[(kv.FREQ || '').toUpperCase()]; if (!f) return null;
    const r = { freq: f, interval: Math.max(1, parseInt(kv.INTERVAL, 10) || 1) };
    if (kv.BYDAY) { let days = kv.BYDAY.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[+-]?\d?(SU|MO|TU|WE|TH|FR|SA)$/.test(x)).map((x) => x.replace('+', '')); if (kv.BYSETPOS && days.length === 1 && !/\d/.test(days[0]) && f === 'monthly') days = [parseInt(kv.BYSETPOS, 10) + days[0]]; if (days.length) r.byday = days; }
    if (kv.BYMONTHDAY) { const a = kv.BYMONTHDAY.split(',').map(Number).filter((n) => n && Math.abs(n) <= 31); if (a.length) r.bymonthday = a; }
    if (kv.BYMONTH && !kv.BYMONTH.includes(',')) r.bymonth = +kv.BYMONTH;
    if (kv.COUNT) r.count = +kv.COUNT;
    if (kv.UNTIL) { const d = icsParseDT(kv.UNTIL, {}); if (d) r.until = d.date; }
    return R.norm(r);
  }
  const alarmTrigger = (m) => (m % 1440 === 0 && m ? `-P${m / 1440}D` : m % 60 === 0 && m ? `-PT${m / 60}H` : `-PT${m}M`);
  function toICS({ lists, reminders }, { calName } = {}) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZengSuite//ZengTodo//EN', 'CALSCALE:GREGORIAN'];
    if (calName) L.push('X-WR-CALNAME:' + esc(calName));
    const byId = new Map(reminders.map((r) => [r.id, r])); const lname = new Map(lists.map((l) => [l.id, l.name])); const lcol = new Map(lists.map((l) => [l.id, l.color]));
    const stamp = utcStamp(Date.now());
    for (const r of reminders) {
      L.push('BEGIN:VTODO', `UID:${r.id}@zengreminders`, `DTSTAMP:${stamp}`);
      if (r.created) L.push('CREATED:' + utcStamp(r.created)); if (r.modified) L.push('LAST-MODIFIED:' + utcStamp(r.modified));
      L.push('SUMMARY:' + esc(r.title)); if (r.notes) L.push('DESCRIPTION:' + esc(r.notes)); if (r.url) L.push('URL:' + r.url.replace(/[\r\n]/g, ''));
      if (r.due) L.push(r.time ? `DUE:${icsDT(r.due, r.time)}` : `DUE;VALUE=DATE:${icsDate(r.due)}`);
      if (r.due && r.repeat) { const s = rruleString(r.repeat, !!r.time); s && L.push('RRULE:' + s); }
      if (r.priority) L.push('PRIORITY:' + { 3: 1, 2: 5, 1: 9 }[r.priority]);
      if (r.tags && r.tags.length) L.push('CATEGORIES:' + r.tags.map(esc).join(','));
      L.push('STATUS:' + (r.done ? 'COMPLETED' : 'NEEDS-ACTION'));
      if (r.done) { L.push('PERCENT-COMPLETE:100'); L.push('COMPLETED:' + utcStamp(r.doneAt || r.modified || Date.now())); }
      if (r.parent && byId.has(r.parent)) L.push(`RELATED-TO;RELTYPE=PARENT:${r.parent}@zengreminders`);
      if (r.flag) L.push('X-ZENG-FLAGGED:TRUE');
      if (lname.has(r.list)) { L.push('X-ZENG-LIST:' + esc(lname.get(r.list))); if (lcol.get(r.list)) L.push('X-ZENG-LISTCOLOR:' + lcol.get(r.list)); }
      if (r.due && r.time) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(r.title), 'TRIGGER;RELATED=END:PT0S', 'END:VALARM');
      if (r.due && r.early) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(r.title), `TRIGGER;RELATED=END:${alarmTrigger(r.early)}`, 'END:VALARM');
      L.push('END:VTODO');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function icsParseDT(v, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec((v || '').trim()); if (!m) return null;
    if (m[4] == null || (params.VALUE || '').toUpperCase() === 'DATE') return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
    if (m[7]) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))); return { date: D.fromDate(d), time: p2(d.getHours()) + ':' + p2(d.getMinutes()), ms: d.getTime() }; }
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, ms: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() };
  }
  function triggerMinutes(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim()); if (!m) return null;
    const mins = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0)) + Math.round(+(m[6] || 0) / 60);
    return m[1] === '-' ? mins : -mins; // positive = minutes before
  }
  function parseICSLines(text) {
    const raw = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'); const lines = [];
    for (const l of raw) { if ((l[0] === ' ' || l[0] === '\t') && lines.length) lines[lines.length - 1] += l.slice(1); else if (l.trim()) lines.push(l); }
    return lines.map((l) => {
      let q = false, i = -1; for (let k = 0; k < l.length; k++) { const c = l[k]; if (c === '"') q = !q; else if (c === ':' && !q) { i = k; break; } }
      if (i < 0) return null; const head = l.slice(0, i), value = l.slice(i + 1); const parts = []; let cur = '', qq = false;
      for (const c of head) { if (c === '"') { qq = !qq; cur += c; } else if (c === ';' && !qq) { parts.push(cur); cur = ''; } else cur += c; } parts.push(cur);
      const name = parts.shift().toUpperCase(); const params = {}; parts.forEach((p) => { const e = p.indexOf('='); if (e > 0) params[p.slice(0, e).toUpperCase()] = p.slice(e + 1).replace(/^"|"$/g, ''); });
      return { name, params, value };
    }).filter(Boolean);
  }
  function fromICS(text, { defaultList = 'Tasks' } = {}) {
    if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VTODO/i.test(text)) throw new Error('This file is not an iCalendar (.ics) file.');
    const lines = parseICSLines(text); const items = []; const colors = {}; let calName = null, calColor = null; let cur = null, alarm = null, depth = [];
    for (const ln of lines) {
      if (ln.name === 'BEGIN') {
        depth.push(ln.value.toUpperCase());
        if (ln.value.toUpperCase() === 'VTODO') cur = { uid: null, parentUid: null, listName: null, title: '', notes: '', url: '', due: null, time: null, repeat: null, early: null, priority: 0, flag: false, tags: [], done: false, doneAt: null, created: null, alarms: [] };
        else if (ln.value.toUpperCase() === 'VALARM' && cur) alarm = {};
        continue;
      }
      if (ln.name === 'END') { const t = depth.pop(); if (t === 'VALARM' && cur && alarm) { cur.alarms.push(alarm); alarm = null; } else if (t === 'VTODO' && cur) { finish(cur); items.push(cur); cur = null; } continue; }
      if (!cur) { if (ln.name === 'X-WR-CALNAME') calName = unesc(ln.value); if (ln.name === 'X-APPLE-CALENDAR-COLOR') calColor = ln.value; continue; }
      if (alarm) { if (ln.name === 'TRIGGER') alarm.trigger = ln; continue; }
      if (depth[depth.length - 1] !== 'VTODO') continue;
      const v = ln.value;
      switch (ln.name) {
        case 'UID': cur.uid = v.trim(); break;
        case 'SUMMARY': cur.title = unesc(v); break;
        case 'DESCRIPTION': cur.notes = unesc(v); break;
        case 'URL': cur.url = v.trim(); break;
        case 'DUE': { const d = icsParseDT(v, ln.params); if (d) { cur.due = d.date; cur.time = d.time; cur._dueMs = d.ms; } break; }
        case 'DTSTART': { const d = icsParseDT(v, ln.params); if (d) cur._start = d; break; }
        case 'RRULE': cur.repeat = parseRRule(v); break;
        case 'PRIORITY': { const n = parseInt(v, 10); cur.priority = n >= 1 && n <= 4 ? 3 : n === 5 ? 2 : n >= 6 && n <= 9 ? 1 : 0; break; }
        case 'CATEGORIES': cur.tags.push(...v.split(/(?<!\\),/).map((x) => unesc(x).trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean)); break;
        case 'STATUS': if (/^COMPLETED$/i.test(v.trim())) cur.done = true; break;
        case 'PERCENT-COMPLETE': if (+v === 100) cur.done = true; break;
        case 'COMPLETED': { const d = icsParseDT(v, ln.params); if (d) { cur.done = true; cur.doneAt = d.ms || null; } break; }
        case 'CREATED': { const d = icsParseDT(v, ln.params); if (d && d.ms) cur.created = d.ms; break; }
        case 'RELATED-TO': if (!ln.params.RELTYPE || /^PARENT$/i.test(ln.params.RELTYPE)) cur.parentUid = v.trim(); break;
        case 'X-ZENG-FLAGGED': cur.flag = /^TRUE$/i.test(v.trim()); break;
        case 'X-APPLE-FLAGGED': cur.flag = /^(TRUE|1)$/i.test(v.trim()); break;
        case 'X-ZENG-LIST': cur.listName = unesc(v); break;
        case 'X-ZENG-LISTCOLOR': cur._color = v.trim(); break;
        case 'CATEGORIES;': break;
        default: break;
      }
    }
    function finish(it) {
      if (!it.due && it._start) { it.due = it._start.date; it.time = it._start.time; it._dueMs = it._start.ms; }
      if (!it.due) it.repeat = null;
      for (const a of it.alarms) {
        if (!a.trigger) continue; const tv = a.trigger.value;
        if ((a.trigger.params.VALUE || '').toUpperCase() === 'DATE-TIME' || /^\d{8}T/.test(tv)) { const d = icsParseDT(tv, {}); if (d && it._dueMs && d.ms < it._dueMs) it.early = it.early || Math.round((it._dueMs - d.ms) / 60000); }
        else { const m = triggerMinutes(tv); if (m && m > 0 && it.early == null) it.early = m; }
      }
      if (it.early && !it.due) it.early = null; if (it.due && it.early && !it.time) { /* all-day early alarm kept as minutes before default time */ }
      it.listName = it.listName || calName || defaultList; if (it._color) colors[it.listName] = it._color; else if (calColor && it.listName === calName) colors[it.listName] = calColor.slice(0, 7);
      delete it.alarms; delete it._dueMs; delete it._start; delete it._color; it.title = it.title || 'Untitled';
      it.tags = [...new Set(it.tags)];
    }
    return { items, colors };
  }

  // ============ CSV ============
  function csvParse(text) {
    text = text.replace(/^\uFEFF/, ''); const first = text.split(/\r?\n/, 1)[0] || ''; const cnt = (c) => first.split(c).length - 1;
    const delim = cnt(';') > cnt(',') && cnt(';') >= cnt('\t') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';
    const rows = []; let row = [], f = '', q = false, i = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }
  const csvCell = (s) => { s = s == null ? '' : String(s); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csvStringify = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const CSV_HEAD = ['ID', 'Parent ID', 'Title', 'Notes', 'URL', 'List', 'Due Date', 'Due Time', 'Repeat', 'Early Reminder (min)', 'Priority', 'Flagged', 'Tags', 'Status', 'Completed Date', 'Created'];
  const PRI_NAME = ['None', 'Low', 'Medium', 'High'];
  function toCSV({ lists, reminders }) {
    const lname = new Map(lists.map((l) => [l.id, l.name])); const rows = [CSV_HEAD];
    for (const r of reminders) rows.push([r.id, r.parent || '', r.title, r.notes || '', r.url || '', lname.get(r.list) || '', r.due || '', r.time || '', r.repeat && r.due ? rruleString(r.repeat, !!r.time) : '', r.early ?? '', PRI_NAME[r.priority || 0], r.flag ? 'Yes' : 'No', (r.tags || []).join(','), r.done ? 'Completed' : 'Not Started', r.done && r.doneAt ? new Date(r.doneAt).toISOString() : '', r.created ? new Date(r.created).toISOString() : '']);
    return csvStringify(rows);
  }
  const HEAD_MAP = {
    id: ['id', 'task id', 'taskid', 'uid'], parent: ['parent id', 'parent', 'parent_id', 'parentid'], title: ['title', 'subject', 'name', 'task', 'content', 'summary', 'text', 'task name', 'reminder'],
    notes: ['notes', 'note', 'description', 'body', 'details', 'comments'], url: ['url', 'link'], list: ['list', 'list name', 'project', 'folder', 'calendar', 'category list'],
    due: ['due date', 'due', 'date', 'deadline', 'due_date', 'duedate', 'start date'], time: ['due time', 'time'], repeat: ['repeat', 'recurrence', 'rrule', 'recurring'], early: ['early reminder (min)', 'early reminder'],
    priority: ['priority', 'importance'], flag: ['flagged', 'flag', 'starred', 'important'], tags: ['tags', 'categories', 'labels', 'label'], status: ['status', 'completed', 'done', 'is completed', 'complete', 'state'],
    doneDate: ['completed date', 'date completed', 'completed at', 'completed_at', 'completion date', 'completed on'], created: ['created', 'created at', 'created date', 'created_at', 'date created'],
    indent: ['indent'], type: ['type'], remDate: ['reminder date', 'reminder on date'], remTime: ['reminder time'],
  };
  const truthy = (v) => /^(completed|complete|done|true|yes|y|1|x|closed|finished)$/i.test((v || '').trim());
  function cellDate(str, now) {
    str = (str || '').trim(); if (!str) return {};
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(str); if (m) return { due: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?$/i.exec(str);
    if (m) { let a = +m[1], b = +m[2]; if (a > 12 && b <= 12) [a, b] = [b, a]; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; if (!D.valid(y, a, b)) return {}; let t = null; if (m[4]) { let h = +m[4]; if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0); t = p2(h) + ':' + m[5]; } return { due: D.fmt(y, a, b), time: t }; }
    const r = P.parse(str, { now }); return { due: r.due, time: r.time, repeat: r.repeat };
  }
  function fromCSV(text, { now = new Date() } = {}) {
    const rows = csvParse(text); if (rows.length < 1) throw new Error('The CSV file is empty.');
    const head = rows[0].map((h) => h.trim().toLowerCase()); const col = {}; for (const k in HEAD_MAP) { for (const alias of HEAD_MAP[k]) { const i = head.indexOf(alias); if (i >= 0) { col[k] = i; break; } } }
    if (col.title == null) throw new Error('No title column found. Expected a header such as “Title”, “Subject” or “Content”.');
    const todoist = col.type != null && head.includes('content'); const items = []; const stack = [];
    const get = (r, k) => (col[k] != null ? (r[col[k]] ?? '').trim() : '');
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (todoist) { const ty = get(r, 'type').toLowerCase(); if (ty && ty !== 'task') continue; }
      const title = get(r, 'title'); if (!title) continue;
      const it = { uid: get(r, 'id') || 'row' + i, parentUid: get(r, 'parent') || null, listName: get(r, 'list') || null, title, notes: r[col.notes] ?? '', url: get(r, 'url'), due: null, time: null, repeat: null, early: null, priority: 0, flag: false, tags: [], done: false, doneAt: null, created: null };
      const d = cellDate(get(r, 'due'), now); it.due = d.due || null; it.time = d.time || null; if (d.repeat) it.repeat = d.repeat;
      const tm = get(r, 'time'); if (tm) { const tt = P.parse(tm, { now }); if (tt.time) it.time = tt.time; }
      if (!it.time && get(r, 'remTime')) { const tt = P.parse(get(r, 'remTime'), { now }); if (tt.time && it.due) it.time = tt.time; }
      if (!it.due && get(r, 'remDate')) { const d2 = cellDate(get(r, 'remDate'), now); it.due = d2.due || null; if (!it.time && d2.time) it.time = d2.time; }
      const rp = get(r, 'repeat'); if (rp) { const rr = /FREQ=/i.test(rp) ? parseRRule(rp.replace(/^RRULE:/i, '')) : P.parse(rp, { now }).repeat; if (rr) it.repeat = rr; }
      if (!it.due) it.repeat = null;
      const e = parseInt(get(r, 'early'), 10); if (e > 0 && it.due) it.early = e;
      const pr = get(r, 'priority').toLowerCase(); if (pr) it.priority = /^(high|urgent|important|3|!!!)$/.test(pr) ? 3 : /^(medium|med|normal|2|!!)$/.test(pr) && !/^normal$/.test(pr) ? 2 : /^(low|1|!)$/.test(pr) ? (todoist && pr === '1' ? 3 : 1) : 0;
      if (pr && /^[1-4]$/.test(pr) && (todoist || col.type != null)) it.priority = { 1: 3, 2: 2, 3: 1, 4: 0 }[pr];
      if (/^normal$/.test(pr)) it.priority = 0;
      it.flag = truthy(get(r, 'flag')); it.tags = get(r, 'tags').split(/[,;]/).map((x) => x.trim().replace(/^[#@]/, '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
      const st = get(r, 'status'); it.done = truthy(st) || /^(completed|done)$/i.test(st) || !!get(r, 'doneDate');
      const dd = get(r, 'doneDate'); if (dd) { const t = Date.parse(dd); if (!isNaN(t)) it.doneAt = t; }
      const cr = get(r, 'created'); if (cr) { const t = Date.parse(cr); if (!isNaN(t)) it.created = t; }
      if (col.indent != null) { const ind = parseInt(get(r, 'indent'), 10) || 1; stack.length = Math.max(0, Math.min(stack.length, ind - 1)); if (ind > 1 && stack[ind - 2]) it.parentUid = stack[ind - 2]; stack[ind - 1] = it.uid; if (ind === 1) stack.length = 1; }
      items.push(it);
    }
    return { items, colors: {} };
  }

  // ============ Markdown ============
  const WD3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const ORDN = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };
  function repeatPhrase(rule) {
    const r = R.norm(rule); if (!r) return ''; const iv = r.interval; const cd = (s) => { const { n, wd } = R.splitDay(s); return { n, name: WD3[wd] }; };
    if (r.freq === 'daily') return iv === 1 ? 'every day' : `every ${iv} days`;
    let s;
    if (r.freq === 'weekly') {
      if (r.byday && iv === 1 && r.byday.length === 5 && R.WEEKDAYS.every((d) => r.byday.includes(d))) s = 'every weekday';
      else if (r.byday) s = iv === 1 ? 'every ' + r.byday.map((d) => cd(d).name).join(', ') : `every ${iv} weeks on ` + r.byday.map((d) => cd(d).name).join(', ');
      else s = iv === 1 ? 'every week' : `every ${iv} weeks`;
    } else if (r.freq === 'monthly') {
      if (r.byday && iv === 1) s = 'every ' + r.byday.map((d) => { const { n, name } = cd(d); return (ORDN[n] || 'first') + ' ' + name; })[0];
      else if (r.bymonthday && r.bymonthday.length === 1 && r.bymonthday[0] === -1) s = 'every last day of the month';
      else if (r.bymonthday && iv === 1 && r.bymonthday.every((d) => d > 0)) s = 'every ' + r.bymonthday.map(D.ord).join(' and ');
      else if (r.bymonthday && r.bymonthday[0] > 0) s = `every ${iv} months on the ${D.ord(r.bymonthday[0])}`;
      else s = iv === 1 ? 'every month' : `every ${iv} months`;
    } else {
      if (r.bymonth && r.bymonthday && iv === 1) s = `every ${D.MON[r.bymonth - 1].toLowerCase()} ${r.bymonthday[0]}`;
      else s = iv === 1 ? 'every year' : `every ${iv} years`;
    }
    if (r.until) s += ' until ' + r.until; if (r.count) s += ' x' + r.count;
    return s;
  }
  const earlyPhrase = (m) => (m % 1440 === 0 ? `${m / 1440} day${m / 1440 > 1 ? 's' : ''}` : m % 60 === 0 ? `${m / 60} hour${m / 60 > 1 ? 's' : ''}` : `${m} min`) + ' before';
  function mdLine(r) {
    const bits = []; if (r.due) bits.push(r.due + (r.time ? ' ' + r.time : '')); if (r.repeat && r.due) bits.push(repeatPhrase(r.repeat));
    if (r.early && r.due) bits.push(earlyPhrase(r.early)); if (r.priority) bits.push('!'.repeat(r.priority)); (r.tags || []).forEach((t) => bits.push('#' + t)); if (r.flag) bits.push('🚩');
    return bits.length ? r.title + ' — ' + bits.join(' ') : r.title;
  }
  function toMarkdown({ lists, reminders }) {
    const out = [];
    for (const l of lists) {
      const rs = reminders.filter((r) => r.list === l.id); out.push('# ' + l.name, '');
      const kids = new Map(); rs.forEach((r) => { if (r.parent) (kids.get(r.parent) || kids.set(r.parent, []).get(r.parent)).push(r); });
      const emit = (r, ind) => {
        out.push(`${ind}- [${r.done ? 'x' : ' '}] ${mdLine(r)}`); if (r.notes) r.notes.split('\n').forEach((n) => out.push(`${ind}  > ${n}`));
        (kids.get(r.id) || []).forEach((k) => emit(k, ind + '  '));
      };
      rs.filter((r) => !r.parent || !rs.some((x) => x.id === r.parent)).forEach((r) => emit(r, '')); out.push('');
    }
    return out.join('\n').replace(/\n+$/, '\n');
  }
  function fromMarkdown(text, { now = new Date(), lists = [], defaultList = 'Tasks' } = {}) {
    const items = []; let listName = null; const stack = []; let last = null; let n = 0;
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      let m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line); if (m) { listName = m[1].trim(); stack.length = 0; last = null; continue; }
      m = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*\S)\s*$/.exec(line);
      if (m) {
        const ind = m[1].replace(/\t/g, '    ').length; let p; const cut = m[3].lastIndexOf(' — '); // "Title — date repeat !!! #tag" keeps the title literal
        if (cut > 0) { const meta = P.parse(m[3].slice(cut + 3), { now, lists: [] }); if (!meta.title) p = { ...meta, title: m[3].slice(0, cut).trim() }; }
        if (!p) p = P.parse(m[3], { now, lists: [] }); if (!m[2] && !p.title) continue;
        const it = { uid: 'md' + ++n, parentUid: null, listName: listName || defaultList, title: p.title || m[3], notes: '', url: '', due: p.due, time: p.time, repeat: p.repeat, early: p.early, priority: p.priority, flag: p.flag, tags: p.tags, done: !!m[2] && m[2] !== ' ', doneAt: null, created: null };
        while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop(); if (stack.length) it.parentUid = stack[stack.length - 1].uid; stack.push({ ind, uid: it.uid }); items.push(it); last = it; continue;
      }
      m = /^\s*>\s?(.*)$/.exec(line); if (m && last) { last.notes += (last.notes ? '\n' : '') + m[1]; continue; }
    }
    return { items, colors: {} };
  }
  return { toICS, fromICS, toCSV, fromCSV, csvParse, csvStringify, toMarkdown, fromMarkdown, parseRRule, rruleString, repeatPhrase, parseICSLines, CSV_HEAD };
});
