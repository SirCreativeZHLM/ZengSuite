/* Contact model helpers: UMD global ZModel. Pure functions, no DOM. Contacts are treated as immutable (copy on write). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ZModel = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const ARR = ['phones', 'emails', 'urls', 'addrs', 'dates', 'related', 'social', 'ims', 'cats', 'x', 'groups'];
  const STR = ['prefix', 'first', 'middle', 'last', 'suffix', 'nick', 'pFirst', 'pLast', 'org', 'dept', 'title', 'notes', 'photo', 'bday', 'uid'];
  const blank = () => { const c = { id: uid(), isOrg: false, fav: false, rev: 0, created: Date.now(), modified: Date.now(), cad: null, lc: '', log: [] }; STR.forEach((k) => (c[k] = '')); ARR.forEach((k) => (c[k] = [])); return c; };

  // Coerce anything (loaded JSON, parsed vCard) into a well-formed contact. Never throws.
  function sanitize(o) {
    const c = blank(); if (!o || typeof o !== 'object') return c;
    const s = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
    STR.forEach((k) => { c[k] = s(o[k]); });
    c.id = s(o.id) || c.id; c.isOrg = !!o.isOrg; c.fav = !!o.fav;
    c.created = +o.created || c.created; c.modified = +o.modified || +o.rev || c.modified; c.rev = +o.rev || 0;
    if (!/^(\d{4}-\d\d-\d\d|--\d\d-\d\d)$/.test(c.bday)) c.bday = '';
    const lv = (a) => (Array.isArray(a) ? a : []).filter((e) => e && typeof e === 'object').map((e) => { const r = { l: s(e.l) || 'other', v: s(e.v) }; if (Array.isArray(e.x)) r.x = e.x; return r; }).filter((e) => e.v);
    c.phones = lv(o.phones); c.emails = lv(o.emails); c.urls = lv(o.urls); c.related = lv(o.related); c.social = lv(o.social); c.ims = lv(o.ims);
    c.dates = lv(o.dates).filter((d) => /^(\d{4}-\d\d-\d\d|--\d\d-\d\d)$/.test(d.v));
    c.addrs = (Array.isArray(o.addrs) ? o.addrs : []).filter((a) => a && typeof a === 'object').map((a) => { const r = { l: s(a.l) || 'other', street: s(a.street), city: s(a.city), state: s(a.state), zip: s(a.zip), country: s(a.country), pobox: s(a.pobox), ext: s(a.ext) }; if (Array.isArray(a.x)) r.x = a.x; return r; }).filter((a) => a.street || a.city || a.state || a.zip || a.country || a.pobox || a.ext);
    c.cad = o.cad && typeof o.cad === 'object' && +o.cad.n > 0 && ['day', 'week', 'month', 'year'].includes(o.cad.u) ? { n: Math.min(999, Math.round(+o.cad.n)), u: o.cad.u } : null;
    c.lc = /^\d{4}-\d\d-\d\d$/.test(s(o.lc)) ? o.lc : '';
    c.log = (Array.isArray(o.log) ? o.log : []).filter((g) => g && +g.t > 0).map((g, i) => ({ id: s(g.id) || 'l' + i + (+g.t).toString(36), t: +g.t, k: g.k === 'note' ? 'note' : 'catchup', note: s(g.note) })).sort((a, b) => a.t - b.t);
    c.cats = (Array.isArray(o.cats) ? o.cats : []).map(s).filter(Boolean);
    c.groups = (Array.isArray(o.groups) ? o.groups : []).map(s).filter(Boolean);
    c.x = (Array.isArray(o.x) ? o.x : []).filter((e) => e && typeof e.n === 'string').map((e) => ({ ...(e.g ? { g: s(e.g) } : {}), n: e.n, p: Array.isArray(e.p) ? e.p.filter((q) => Array.isArray(q)).map((q) => [s(q[0]), s(q[1])]) : [], v: s(e.v) }));
    return c;
  }

  // ---------- names ----------
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function displayName(c, order) {
    if (c.isOrg && c.org) return c.org;
    const f = [c.first, c.middle].filter(Boolean).join(' ');
    let n;
    if (order === 'last') n = c.last && f ? `${c.last}, ${f}` : c.last || f; else n = [c.prefix, c.first, c.middle, c.last].filter(Boolean).join(' ');
    if (order !== 'last' && c.suffix && n) n += ' ' + c.suffix;
    if (n) return n;
    return c.org || (c.nick) || (c.emails[0] && c.emails[0].v) || (c.phones[0] && c.phones[0].v) || 'No Name';
  }
  const hasName = (c) => !!(c.first || c.last || c.middle || c.org || c.nick);
  function sortKey(c, by) {
    let parts;
    if (c.isOrg && c.org) parts = [c.org];
    else if (by === 'last') parts = [c.last || c.first || c.org, c.first, c.middle]; else parts = [c.first || c.last || c.org, c.last, c.middle];
    const k = fold(parts.filter(Boolean).join(' ')).trim();
    return k || '￿' + fold((c.emails[0] && c.emails[0].v) || (c.phones[0] && c.phones[0].v) || '');
  }
  const sectionOf = (c, by) => { const k = sortKey(c, by); if (!hasName(c)) return '#'; const ch = k[0]; return ch && /[a-z]/.test(ch) ? ch.toUpperCase() : '#'; };
  const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }) : null;
  function sortContacts(list, by) {
    const keyed = list.map((c) => [c, sortKey(c, by)]);
    keyed.sort((a, b) => { const an = a[1][0] === '￿', bn = b[1][0] === '￿'; if (an !== bn) return an ? 1 : -1; const r = collator ? collator.compare(a[1], b[1]) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; return r || (a[0].id < b[0].id ? -1 : 1); });
    return keyed.map((k) => k[0]);
  }
  function initials(c) {
    if (c.isOrg && c.org) return fold(c.org).replace(/[^a-z0-9]/g, '').slice(0, 2).toUpperCase() || '#';
    const a = [...(c.first || '')][0] || '', b = [...(c.last || '')][0] || '';
    const r = (a + b).toUpperCase(); if (r) return r;
    const o = [...(c.org || c.nick || '')][0]; return o ? o.toUpperCase() : '?';
  }
  const PALETTE = [['#ff9a8b', '#ff5e7e'], ['#ffb347', '#ff7a18'], ['#f9d423', '#f5a623'], ['#7ee08a', '#2fb36d'], ['#5fe3c0', '#13a8a0'], ['#6fd3ff', '#2f8cff'], ['#8fa7ff', '#5b5bf0'], ['#d28bff', '#a43cf0'], ['#ff8ad8', '#e5409a'], ['#b7c0cc', '#7b8794']];
  function hueFor(c) { let h = 7; const s = c.id || displayName(c); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return [8, 24, 38, 85, 140, 165, 190, 215, 245, 270, 295, 330][h % 12]; }
  function gradientFor(c) { let h = 0; const s = c.id || displayName(c); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }

  // ---------- phone / search ----------
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const phoneKey = (s) => { let d = digits(s); if (d.length > 10) d = d.slice(-10); return d; };
  const addrText = (a) => [a.street, a.city, a.state, a.zip, a.country, a.pobox].filter(Boolean).join(' ');
  const idx = new WeakMap();
  function haystack(c) {
    let h = idx.get(c); if (h) return h;
    const text = fold([c.prefix, c.first, c.middle, c.last, c.suffix, c.nick, c.pFirst, c.pLast, c.org, c.dept, c.title, c.notes, ...c.emails.map((e) => e.v), ...c.urls.map((e) => e.v), ...c.addrs.map(addrText), ...c.related.map((e) => e.v), ...c.social.map((e) => e.v), ...c.ims.map((e) => e.v), ...c.phones.map((p) => p.v)].join('\n'));
    h = { text, digits: c.phones.map((p) => digits(p.v)).join(' ') }; idx.set(c, h); return h;
  }
  function matchQuery(c, q) {
    const toks = fold(q).split(/\s+/).filter(Boolean); if (!toks.length) return true; const h = haystack(c);
    return toks.every((t) => { if (h.text.includes(t)) return true; const d = digits(t); return d.length >= 2 && d.length === t.replace(/[\s()+.-]/g, '').length && h.digits.includes(d); });
  }

  // ---------- birthdays ----------
  const mdOf = (d) => { if (!d) return null; const m = d.match(/^(?:\d{4}-|--)(\d\d)-(\d\d)$/); return m ? [+m[1], +m[2]] : null; };
  const yearOf = (d) => { const m = (d || '').match(/^(\d{4})-/); return m ? +m[1] : 0; };
  const startOfDay = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  // days from `now` until the next occurrence of the month/day (0 = today); null if none
  function daysUntil(d, now) {
    const md = mdOf(d); if (!md) return null; const today = startOfDay(now || Date.now());
    let y = today.getFullYear(); let t = new Date(y, md[0] - 1, md[1]);
    if (md[0] === 2 && md[1] === 29 && t.getMonth() !== 1) t = new Date(y, 1, 28);
    if (t < today) { y++; t = new Date(y, md[0] - 1, md[1]); if (t.getMonth() !== md[0] - 1) t = new Date(y, 1, 28); }
    return Math.round((t - today) / 86400000);
  }
  function turningAge(d, now) { const y = yearOf(d); if (!y || y === 1604) return null; const t = startOfDay(now || Date.now()); return t.getFullYear() - y + (daysUntil(d, t.getTime()) > 0 && new Date(t.getFullYear(), mdOf(d)[0] - 1, mdOf(d)[1]) < t ? 1 : 0); }
  function upcomingBirthdays(contacts, days, now) {
    return contacts.map((c) => ({ c, in: daysUntil(c.bday, now) })).filter((x) => x.in != null && x.in <= days).sort((a, b) => a.in - b.in || (a.c.id < b.c.id ? -1 : 1));
  }

  // ---------- smart groups ----------
  // rule: {f: field, op, v}. Fields and their operator sets are in FIELDS.
  const TEXT_OPS = ['contains', 'not contains', 'is', 'is not', 'begins with', 'ends with', 'is set', 'is not set'];
  const FIELDS = {
    name: { label: 'Name', type: 'text' }, org: { label: 'Company', type: 'text' }, title: { label: 'Job title', type: 'text' }, dept: { label: 'Department', type: 'text' },
    email: { label: 'Email', type: 'text' }, phone: { label: 'Phone', type: 'text' }, city: { label: 'City', type: 'text' }, state: { label: 'State', type: 'text' }, country: { label: 'Country', type: 'text' }, url: { label: 'Website', type: 'text' }, notes: { label: 'Notes', type: 'text' },
    birthday: { label: 'Birthday', type: 'date', ops: ['is set', 'is not set', 'this month', 'next month', 'in next days', 'is today'] },
    created: { label: 'Date added', type: 'recent', ops: ['in last days', 'before days ago'] },
    group: { label: 'Group', type: 'group', ops: ['is member of', 'is not member of'] },
    due: { label: 'Catch-up', type: 'flag', ops: ['is due', 'has a rhythm', 'has no rhythm'] },
    fav: { label: 'Favourite', type: 'flag', ops: ['is favourite', 'is not favourite'] },
    photo: { label: 'Photo', type: 'flag', ops: ['has photo', 'has no photo'] },
  };
  const opsFor = (f) => (FIELDS[f] && FIELDS[f].ops) || TEXT_OPS;
  const fieldValues = (c, f) => {
    switch (f) {
      case 'name': return [displayName(c), c.nick, c.pFirst, c.pLast];
      case 'org': return [c.org]; case 'title': return [c.title]; case 'dept': return [c.dept]; case 'notes': return [c.notes];
      case 'email': return c.emails.map((e) => e.v); case 'phone': return c.phones.map((e) => e.v); case 'url': return c.urls.map((e) => e.v);
      case 'city': return c.addrs.map((a) => a.city); case 'state': return c.addrs.map((a) => a.state); case 'country': return c.addrs.map((a) => a.country);
    } return [];
  };
  function ruleMatch(c, r, now) {
    const f = r.f, op = r.op, v = fold(r.v || '').trim();
    switch (f) {
      case 'birthday': { const n = daysUntil(c.bday, now); const md = mdOf(c.bday); const t = startOfDay(now || Date.now());
        if (op === 'is set') return !!md; if (op === 'is not set') return !md; if (!md) return false;
        if (op === 'this month') return md[0] === t.getMonth() + 1; if (op === 'next month') return md[0] === ((t.getMonth() + 1) % 12) + 1;
        if (op === 'is today') return n === 0; if (op === 'in next days') return n <= (parseInt(r.v, 10) || 30); return false; }
      case 'created': { const days = parseInt(r.v, 10) || 30; const age = ((now || Date.now()) - (c.created || 0)) / 86400000; return op === 'in last days' ? age <= days : age > days; }
      case 'group': { const has = c.groups.includes(r.v); return op === 'is member of' ? has : !has; }
      case 'due': return op === 'is due' ? isDue(c, now) : op === 'has a rhythm' ? !!c.cad : !c.cad;
      case 'fav': return op === 'is favourite' ? c.fav : !c.fav;
      case 'photo': return op === 'has photo' ? !!c.photo : !c.photo;
    }
    const vals = fieldValues(c, f).map(fold).filter((x) => x !== '');
    switch (op) {
      case 'is set': return vals.length > 0; case 'is not set': return vals.length === 0;
      case 'contains': return vals.some((x) => x.includes(v)); case 'not contains': return !vals.some((x) => x.includes(v));
      case 'is': return vals.some((x) => x === v); case 'is not': return !vals.some((x) => x === v);
      case 'begins with': return vals.some((x) => x.startsWith(v)); case 'ends with': return vals.some((x) => x.endsWith(v));
    } return false;
  }
  const smartMatch = (c, g, now) => { const rs = (g.rules || []).filter((r) => r && r.f); if (!rs.length) return false; return g.match === 'any' ? rs.some((r) => ruleMatch(c, r, now)) : rs.every((r) => ruleMatch(c, r, now)); };

  // ---------- duplicates ----------
  function findDuplicates(contacts) {
    const parent = new Map(contacts.map((c) => [c.id, c.id])); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const buckets = new Map(); const reasons = new Map();
    const put = (key, c, why) => { if (!key) return; const b = buckets.get(key) || []; b.push(c); buckets.set(key, b); reasons.set(key, why); };
    for (const c of contacts) {
      if (hasName(c) && !c.isOrg && (c.first || c.last)) put('n:' + fold(c.first + ' ' + c.last).replace(/\s+/g, ' ').trim(), c, 'same name');
      else if (c.isOrg && c.org) put('o:' + fold(c.org).trim(), c, 'same company');
      c.emails.forEach((e) => put('e:' + e.v.trim().toLowerCase(), c, 'same email'));
      c.phones.forEach((p) => { const k = phoneKey(p.v); if (k.length >= 7) put('p:' + k, c, 'same phone'); });
    }
    const why = new Map();
    for (const [k, list] of buckets) { const ids = [...new Set(list.map((c) => c.id))]; if (ids.length < 2) continue; ids.slice(1).forEach((i) => union(ids[0], i)); ids.forEach((i) => { (why.get(i) || why.set(i, new Set()).get(i)).add(reasons.get(k)); }); }
    const groups = new Map();
    for (const c of contacts) { const r = find(c.id); (groups.get(r) || groups.set(r, []).get(r)).push(c); }
    return [...groups.values()].filter((g) => g.length > 1).map((g) => ({ contacts: g, reasons: [...new Set(g.flatMap((c) => [...(why.get(c.id) || [])]))] }));
  }

  // ---------- merge ----------
  const SCALARS = ['prefix', 'first', 'middle', 'last', 'suffix', 'nick', 'pFirst', 'pLast', 'org', 'dept', 'title', 'bday', 'photo'];
  function mergeConflicts(list) {
    const out = [];
    for (const k of SCALARS) { const seen = new Set(); const vals = list.map((c) => c[k]).filter((v) => { const f = k === 'photo' ? v : fold(v).trim(); if (!v || seen.has(f)) return false; seen.add(f); return true; }); if (vals.length > 1) out.push({ field: k, values: vals }); }
    return out;
  }
  const keyOf = { phones: (e) => phoneKey(e.v) || e.v.toLowerCase(), emails: (e) => e.v.trim().toLowerCase(), urls: (e) => e.v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), related: (e) => e.v.toLowerCase(), social: (e) => (e.l + ':' + e.v).toLowerCase(), ims: (e) => (e.l + ':' + e.v).toLowerCase(), dates: (e) => e.l + e.v, addrs: (a) => fold(addrText(a)).replace(/\s+/g, ' ') };
  // choices: {field: value}; first contact wins unless chosen. Returns a new contact (id of the first / oldest).
  function mergeContacts(list, choices = {}) {
    const base = [...list].sort((a, b) => (a.created || 0) - (b.created || 0))[0];
    const m = blank(); m.id = base.id; m.created = Math.min(...list.map((c) => c.created || Date.now())); m.modified = Date.now(); m.uid = base.uid;
    for (const k of SCALARS) m[k] = choices[k] !== undefined ? choices[k] : (list.find((c) => c[k]) || {})[k] || '';
    m.isOrg = list.some((c) => c.isOrg) && !m.first && !m.last; m.fav = list.some((c) => c.fav);
    for (const k of Object.keys(keyOf)) { const seen = new Set(); m[k] = []; for (const c of list) for (const e of c[k]) { const key = keyOf[k](e); if (!key || seen.has(key)) continue; seen.add(key); m[k].push(JSON.parse(JSON.stringify(e))); } }
    m.cad = (list.find((c) => c.cad) || {}).cad || null; m.lc = list.map((c) => c.lc).filter(Boolean).sort().pop() || '';
    const lg = new Map(); list.forEach((c) => c.log.forEach((g) => lg.set(g.id, g))); m.log = [...lg.values()].sort((a, b) => a.t - b.t);
    m.groups = [...new Set(list.flatMap((c) => c.groups))]; m.cats = [...new Set(list.flatMap((c) => c.cats))];
    const notes = []; for (const c of list) { const n = (c.notes || '').trim(); if (n && !notes.some((x) => x.includes(n))) notes.push(n); } m.notes = choices.notes !== undefined ? choices.notes : notes.join('\n\n');
    const xs = new Set(); m.x = []; for (const c of list) for (const e of c.x) { const k = JSON.stringify(e); if (!xs.has(k)) { xs.add(k); m.x.push(e); } }
    return m;
  }

  // ---------- issues ----------
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function findIssues(c) {
    const out = [];
    if (!hasName(c) && !c.emails.length && !c.phones.length && !c.addrs.length && !c.notes) out.push({ k: 'empty', t: 'Empty card' });
    else if (!hasName(c)) out.push({ k: 'noname', t: 'No name' });
    c.emails.forEach((e) => { if (!EMAIL_RX.test(e.v.trim())) out.push({ k: 'email', t: 'Invalid email: ' + e.v }); });
    c.phones.forEach((p) => { const d = digits(p.v); if (d.length < 3 || d.length > 15) out.push({ k: 'phone', t: 'Suspicious phone number: ' + p.v }); });
    const m = mdOf(c.bday); if (c.bday && (!m || m[0] > 12 || m[1] > 31)) out.push({ k: 'bday', t: 'Invalid birthday' });
    if (hasName(c) && !c.emails.length && !c.phones.length && !c.addrs.length && !c.urls.length) out.push({ k: 'nodata', t: 'No phone, email or address' });
    if (c.first && c.first === c.first.toLowerCase() && /[a-z]/.test(c.first) && c.last && c.last === c.last.toLowerCase()) out.push({ k: 'case', t: 'Name is all lower case' });
    return out;
  }

  // ---------- formatting ----------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = (d, short) => { const md = mdOf(d); if (!md) return ''; const y = yearOf(d); const mn = short ? MONTHS[md[0] - 1].slice(0, 3) : MONTHS[md[0] - 1]; return `${mn} ${md[1]}${y && y !== 1604 ? ', ' + y : ''}`; };
  const addrLines = (a) => [[a.pobox, a.street, a.ext].filter(Boolean).join('\n'), [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), a.country].filter(Boolean).join('\n');
  const labelText = (l) => { l = l || 'other'; return l.charAt(0).toUpperCase() + l.slice(1); };

  // ---------- relationship rhythm ----------
  const DAY = 86400000; const UNIT_DAYS = { day: 1, week: 7, month: 30.4375, year: 365.25 };
  const cadenceDays = (cad) => (cad && cad.n ? cad.n * UNIT_DAYS[cad.u] : 0);
  const dateStr = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const parseLocal = (s) => { const m = String(s).match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0; };
  const cadenceLabel = (cad) => (!cad ? 'No reminder' : `Every ${cad.n === 1 ? '' : cad.n + ' '}${cad.u}${cad.n === 1 ? '' : 's'}`);
  const lastTs = (c) => (c.lc ? parseLocal(c.lc) : 0);
  // days since last contact (null if never)
  const daysSince = (c, now) => { const t = lastTs(c); return t ? Math.round((startOfDay(now || Date.now()) - t) / DAY) : null; };
  // {due: ts, over: days overdue (negative = days left), ratio: elapsed/cadence, state:'overdue'|'soon'|'ok'|'new'} or null without cadence
  function dueInfo(c, now) {
    const cd = cadenceDays(c.cad); if (!cd) return null; const today = startOfDay(now || Date.now()).getTime();
    const base = lastTs(c) || startOfDay(c.created || today).getTime(); const due = base + Math.round(cd) * DAY;
    const over = Math.round((today - due) / DAY); const ratio = (today - base) / (cd * DAY);
    return { due, over, ratio, never: !lastTs(c), state: over >= 0 ? 'overdue' : over >= -7 ? 'soon' : 'ok' };
  }
  const isDue = (c, now) => { const d = dueInfo(c, now); return !!d && d.over >= -3; };
  function dueList(contacts, now) { return contacts.map((c) => [c, dueInfo(c, now)]).filter(([, d]) => d && d.over >= -3).sort((a, b) => b[1].ratio - a[1].ratio || b[1].over - a[1].over).map(([c, d]) => ({ c, d })); }
  function dueText(d) { if (!d) return ''; const n = Math.abs(d.over); const span = n >= 60 ? Math.round(n / 30) + ' months' : n >= 14 ? Math.round(n / 7) + ' weeks' : n + (n === 1 ? ' day' : ' days'); return d.over === 0 ? 'Due today' : d.over > 0 ? span + ' overdue' : 'Due in ' + span; }
  function agoText(days) { if (days == null) return 'never'; if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 14) return days + ' days ago'; if (days < 60) return Math.round(days / 7) + ' weeks ago'; if (days < 700) return Math.round(days / 30.4) + ' months ago'; return Math.round(days / 365.25) + ' years ago'; }
  // new contact value with a catch-up logged (last = date, timeline entry)
  function logCatchup(c, note, whenStr, kind) {
    const ts = whenStr ? parseLocal(whenStr) + 12 * 3600000 : Date.now(); const k = kind === 'note' ? 'note' : 'catchup';
    const entry = { id: uid(), t: ts, k, note: (note || '').trim() }; const last = k === 'catchup' ? (whenStr || dateStr(Date.now())) : c.lc;
    return { ...c, lc: k === 'catchup' && c.lc && c.lc > last ? c.lc : last, log: [...c.log, entry].sort((a, b) => a.t - b.t), modified: Date.now() };
  }
  // birthdays and anniversaries within `days`
  function nudges(contacts, days, now) {
    const out = []; for (const c of contacts) { const b = daysUntil(c.bday, now); if (b != null && b <= days) out.push({ c, kind: 'birthday', in: b, label: 'Birthday', date: c.bday }); for (const d of c.dates) if (/anniv/i.test(d.l)) { const n = daysUntil(d.v, now); if (n != null && n <= days) out.push({ c, kind: 'anniversary', in: n, label: 'Anniversary', date: d.v }); } }
    return out.sort((a, b) => a.in - b.in || (a.c.id < b.c.id ? -1 : 1));
  }
  // clusters for the people map: [{key, name, items:[c]}] by 'company' or 'group'
  function clusters(contacts, by, groups) {
    const map = new Map(); const gname = (id) => (groups.find((g) => g.id === id) || {}).name;
    const put = (k, n, c) => { const e = map.get(k) || { key: k, name: n, items: [] }; e.items.push(c); map.set(k, e); };
    for (const c of contacts) { if (by === 'group') { const gs = c.groups.map(gname).filter(Boolean); if (gs.length) put('g:' + c.groups.find(gname), gs[0], c); else put('none', 'No group', c); } else { const o = (c.org || '').trim(); if (o) put('o:' + fold(o), o, c); else put('none', 'No company', c); } }
    return [...map.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.items.length - a.items.length || (a.name < b.name ? -1 : 1));
  }

  // ---------- sample data (fictional; example.com / 555 numbers) ----------
  function sampleContacts() {
    const mk = (o) => { const c = blank(); Object.assign(c, o); c.created = c.modified = Date.now(); return c; };
    const now = new Date(); const bd = (offsetDays, year) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays); return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const ago = (n) => dateStr(Date.now() - n * 86400000); const lgE = (n, note, k) => ({ id: uid(), t: Date.now() - n * 86400000, k: k || 'catchup', note });
    const list = [
      mk({ first: 'Ada', last: 'Okonkwo', org: 'Lumen Labs', title: 'Research Engineer', phones: [{ l: 'mobile', v: '+1 (555) 010-1001' }], emails: [{ l: 'work', v: 'ada@example.com' }], bday: bd(3, 1988), addrs: [{ l: 'work', street: '12 Harbour Street', city: 'Portland', state: 'OR', zip: '97201', country: 'USA', pobox: '', ext: '' }], fav: true, cad: { n: 1, u: 'month' }, lc: ago(45), log: [lgE(45, 'Coffee near the harbour. She is moving teams in spring.'), lgE(60, 'Likes single-origin beans', 'note')] }),
      mk({ first: 'Mateo', last: 'Silva', org: 'Casa Silva', title: 'Owner', phones: [{ l: 'work', v: '+34 555 010 202' }], emails: [{ l: 'work', v: 'mateo@example.com' }], urls: [{ l: 'work', v: 'https://example.com/casa' }], bday: '--07-19', cad: { n: 3, u: 'month' }, lc: ago(20) }),
      mk({ first: 'Mei', last: 'Tanaka', pFirst: 'メイ', pLast: 'タナカ', org: 'Northwind Studio', title: 'Designer', phones: [{ l: 'mobile', v: '555-010-1003' }], emails: [{ l: 'home', v: 'mei@example.com' }], bday: bd(20, 1992) }),
      mk({ first: 'Jonas', last: 'Berg', org: 'Fjord Freight', phones: [{ l: 'work', v: '555-010-1004' }, { l: 'mobile', v: '555-010-2004' }], emails: [{ l: 'work', v: 'jonas@example.com' }], notes: 'Met at the logistics meetup.', cad: { n: 2, u: 'month' }, lc: ago(100), log: [lgE(100, 'Phone call about the Q2 shipment')] }),
      mk({ first: 'Priya', last: 'Raman', org: 'Lumen Labs', title: 'Product Manager', phones: [{ l: 'mobile', v: '555-010-1005' }], emails: [{ l: 'work', v: 'priya@example.com' }], social: [{ l: 'github', v: 'priya-raman' }], cad: { n: 2, u: 'week' }, lc: ago(3) }),
      mk({ first: 'Lucas', last: 'Moreau', phones: [{ l: 'home', v: '555-010-1006' }], emails: [{ l: 'home', v: 'lucas@example.com' }], bday: bd(-5, 1979), related: [{ l: 'brother', v: 'Hugo Moreau' }] }),
      mk({ first: 'Sofia', last: 'Alvarez', org: 'Harbor Books', title: 'Buyer', emails: [{ l: 'work', v: 'sofia@example.com' }] }),
      mk({ first: 'Ibrahim', last: 'Haddad', org: 'Northwind Studio', title: 'Developer', phones: [{ l: 'mobile', v: '555-010-1008' }], emails: [{ l: 'work', v: 'ibrahim@example.com' }] }),
      mk({ first: 'Hannah', last: 'Weiss', phones: [{ l: 'mobile', v: '555-010-1009' }], bday: '--12-02', nick: 'Han', cad: { n: 1, u: 'month' }, dates: [{ l: 'anniversary', v: '2016-' + ago(-6).slice(5) }] }),
      mk({ first: 'Oskar', last: 'Lindqvist', org: 'Fjord Freight', title: 'Dispatcher', phones: [{ l: 'work', v: '555-010-1010' }] }),
      mk({ org: 'Riverside Dental', isOrg: true, phones: [{ l: 'main', v: '555-010-3000' }], urls: [{ l: 'work', v: 'https://example.com/dental' }], addrs: [{ l: 'work', street: '400 River Road', city: 'Austin', state: 'TX', zip: '78701', country: 'USA', pobox: '', ext: '' }] }),
      mk({ first: 'Zoe', last: 'Fitzgerald', emails: [{ l: 'home', v: 'zoe@example.com' }], phones: [{ l: 'mobile', v: '555-010-1012' }], cad: { n: 1, u: 'week' }, lc: ago(16) }),
    ];
    return list;
  }

  return { uid, blank, sanitize, fold, displayName, hasName, sortKey, sectionOf, sortContacts, initials, gradientFor, hueFor, PALETTE, digits, phoneKey, matchQuery, haystack, mdOf, yearOf, daysUntil, turningAge, upcomingBirthdays, FIELDS, opsFor, ruleMatch, smartMatch, findDuplicates, mergeConflicts, mergeContacts, findIssues, MONTHS, fmtDate, addrLines, addrText, labelText, sampleContacts, startOfDay, cadenceDays, cadenceLabel, dateStr, parseLocal, daysSince, dueInfo, isDue, dueList, dueText, agoText, logCatchup, nudges, clusters };
});
