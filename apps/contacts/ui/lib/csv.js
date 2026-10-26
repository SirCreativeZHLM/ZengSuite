/* CSV parse/write + contact field mapping (Google Contacts / Outlook presets). UMD: ZCSV. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ZCSV = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function detectDelimiter(text) {
    const head = text.slice(0, 4000).split(/\r?\n/)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 }; let q = false;
    for (const c of head) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  }
  function parse(text, delim) {
    text = text.replace(/^﻿/, ''); delim = delim || detectDelimiter(text);
    const rows = []; let row = [], f = '', q = false, i = 0, any = false;
    while (i < text.length) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; } f += c; i++; continue; }
      if (c === '"' && f === '') { q = true; any = true; i++; continue; }
      if (c === delim) { row.push(f); f = ''; any = true; i++; continue; }
      if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; i++; row.push(f); if (row.length > 1 || row[0] !== '' || any) rows.push(row); row = []; f = ''; any = false; continue; }
      f += c; i++; any = true;
    }
    if (f !== '' || row.length || any) { row.push(f); rows.push(row); }
    return rows;
  }
  const cell = (s) => { s = s == null ? '' : String(s); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const write = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

  // ---------- target fields ----------
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const T = {
    '': 'Do not import', name: 'Full name', first: 'First name', middle: 'Middle name', last: 'Last name', prefix: 'Name prefix', suffix: 'Name suffix', nick: 'Nickname', pFirst: 'Phonetic first name', pLast: 'Phonetic last name',
    org: 'Company', dept: 'Department', title: 'Job title', notes: 'Notes', bday: 'Birthday', groups: 'Groups / labels', fav: 'Favourite',
    label: 'Label for next field', phone: 'Phone', email: 'Email', url: 'Website', date: 'Date', related: 'Related name', social: 'Social profile', im: 'Instant message',
    'phone:mobile': 'Phone (mobile)', 'phone:home': 'Phone (home)', 'phone:work': 'Phone (work)', 'phone:main': 'Phone (main)', 'phone:fax': 'Phone (fax)', 'phone:pager': 'Phone (pager)', 'phone:other': 'Phone (other)',
    'email:home': 'Email (home)', 'email:work': 'Email (work)', 'email:other': 'Email (other)', 'url:home': 'Website (home)', 'url:work': 'Website (work)', 'url:other': 'Website (other)',
  };
  for (const l of ['home', 'work', 'other']) for (const [p, n] of [['street', 'street'], ['city', 'city'], ['state', 'state'], ['zip', 'postal code'], ['country', 'country']]) T[`adr:${l}:${p}`] = `Address (${l}) ${n}`;
  for (const p of ['street', 'city', 'state', 'zip', 'country', 'pobox', 'ext']) T['adr:*:' + p] = 'Address ' + p + ' (label from column)';
  T['adr:*:street'] = 'Address street (label from column)'; T['date:anniversary'] = 'Anniversary';

  // exact (normalised) header -> target
  const GOOGLE = { firstname: 'first', middlename: 'middle', lastname: 'last', phoneticfirstname: 'pFirst', phoneticlastname: 'pLast', nameprefix: 'prefix', namesuffix: 'suffix', nickname: 'nick', organizationname: 'org', organizationtitle: 'title', organizationdepartment: 'dept', birthday: 'bday', notes: 'notes', labels: 'groups', favorite: 'fav', 'name': 'name' };
  const GOOGLE_RX = [
    [/^(e-?mail|email) \d+ - label$/i, 'label'], [/^(e-?mail|email) \d+ - value$/i, 'email'], [/^phone \d+ - label$/i, 'label'], [/^phone \d+ - value$/i, 'phone'],
    [/^address \d+ - label$/i, 'label'], [/^address \d+ - street$/i, 'adr:*:street'], [/^address \d+ - city$/i, 'adr:*:city'], [/^address \d+ - region$/i, 'adr:*:state'], [/^address \d+ - postal code$/i, 'adr:*:zip'], [/^address \d+ - country$/i, 'adr:*:country'], [/^address \d+ - po box$/i, 'adr:*:pobox'], [/^address \d+ - extended address$/i, 'adr:*:ext'],
    [/^website \d+ - label$/i, 'label'], [/^website \d+ - value$/i, 'url'], [/^event \d+ - label$/i, 'label'], [/^event \d+ - value$/i, 'date'], [/^relation \d+ - label$/i, 'label'], [/^relation \d+ - value$/i, 'related'],
    [/^im \d+ - service$/i, 'label'], [/^im \d+ - value$/i, 'im'], [/^custom field \d+ - label$/i, 'label'],
  ];
  const OUTLOOK = {
    firstname: 'first', middlename: 'middle', lastname: 'last', title: 'prefix', suffix: 'suffix', nickname: 'nick', givenyomi: 'pFirst', surnameyomi: 'pLast',
    emailaddress: 'email:home', email2address: 'email:work', email3address: 'email:other', primaryemail: 'email:home',
    homephone: 'phone:home', homephone2: 'phone:home', businessphone: 'phone:work', businessphone2: 'phone:work', mobilephone: 'phone:mobile', carphone: 'phone:other', otherphone: 'phone:other', primaryphone: 'phone:main', pager: 'phone:pager', businessfax: 'phone:fax', homefax: 'phone:fax', otherfax: 'phone:fax', companymainphone: 'phone:main', assistantsphone: 'phone:other',
    company: 'org', department: 'dept', jobtitle: 'title',
    businessstreet: 'adr:work:street', businesscity: 'adr:work:city', businessstate: 'adr:work:state', businesspostalcode: 'adr:work:zip', businesscountryregion: 'adr:work:country',
    homestreet: 'adr:home:street', homecity: 'adr:home:city', homestate: 'adr:home:state', homepostalcode: 'adr:home:zip', homecountryregion: 'adr:home:country',
    otherstreet: 'adr:other:street', othercity: 'adr:other:city', otherstate: 'adr:other:state', otherpostalcode: 'adr:other:zip', othercountryregion: 'adr:other:country',
    birthday: 'bday', anniversary: 'date:anniversary', webpage: 'url:home', personalwebpage: 'url:home', businesswebpage: 'url:work', notes: 'notes', categories: 'groups',
    spouse: 'related', manager: 'related', assistantsname: 'related', children: 'related',
  };
  const GENERIC = {
    name: 'name', fullname: 'name', displayname: 'name', contactname: 'name', firstname: 'first', first: 'first', givenname: 'first', forename: 'first', middlename: 'middle', lastname: 'last', last: 'last', surname: 'last', familyname: 'last', prefix: 'prefix', nameprefix: 'prefix', suffix: 'suffix', namesuffix: 'suffix', nickname: 'nick',
    company: 'org', organization: 'org', organisation: 'org', org: 'org', employer: 'org', department: 'dept', jobtitle: 'title', position: 'title', role: 'title', title: 'title',
    email: 'email:home', emailaddress: 'email:home', mail: 'email:home', email1: 'email:home', homeemail: 'email:home', workemail: 'email:work', businessemail: 'email:work', email2: 'email:work', otheremail: 'email:other',
    phone: 'phone:other', telephone: 'phone:other', tel: 'phone:other', mobile: 'phone:mobile', mobilephone: 'phone:mobile', cell: 'phone:mobile', cellphone: 'phone:mobile', homephone: 'phone:home', workphone: 'phone:work', businessphone: 'phone:work', fax: 'phone:fax', pager: 'phone:pager',
    website: 'url:home', url: 'url:home', web: 'url:home', homepage: 'url:home', birthday: 'bday', birthdate: 'bday', dob: 'bday', dateofbirth: 'bday', notes: 'notes', note: 'notes', comments: 'notes', group: 'groups', groups: 'groups', labels: 'groups', categories: 'groups',
    street: 'adr:home:street', address: 'adr:home:street', city: 'adr:home:city', state: 'adr:home:state', province: 'adr:home:state', region: 'adr:home:state', zip: 'adr:home:zip', zipcode: 'adr:home:zip', postalcode: 'adr:home:zip', postcode: 'adr:home:zip', country: 'adr:home:country',
    homestreet: 'adr:home:street', homeaddress: 'adr:home:street', homecity: 'adr:home:city', homestate: 'adr:home:state', homezip: 'adr:home:zip', homepostalcode: 'adr:home:zip', homecountry: 'adr:home:country',
    workstreet: 'adr:work:street', workaddress: 'adr:work:street', workcity: 'adr:work:city', workstate: 'adr:work:state', workzip: 'adr:work:zip', workpostalcode: 'adr:work:zip', workcountry: 'adr:work:country',
  };

  function detectPreset(headers) {
    const h = headers.map((x) => String(x).trim());
    if (h.some((x) => /^phone \d+ - (label|value)$/i.test(x)) || h.some((x) => /^e-?mail \d+ - value$/i.test(x))) return 'google';
    const n = h.map(norm);
    if (n.includes('emailaddress') && (n.includes('businessphone') || n.includes('mobilephone') || n.includes('homephone') || n.includes('company'))) return 'outlook';
    return 'generic';
  }
  function autoMap(headers, preset) {
    preset = preset || detectPreset(headers);
    return headers.map((hd) => {
      const raw = String(hd).trim(), n = norm(raw);
      if (preset === 'google') { for (const [rx, t] of GOOGLE_RX) if (rx.test(raw)) return t; return GOOGLE[n] || ''; }
      if (preset === 'outlook') return OUTLOOK[n] || '';
      return GENERIC[n] || '';
    });
  }

  // ---------- date parsing for CSV ----------
  function parseCsvDate(s) {
    s = String(s || '').trim(); if (!s) return ''; let m;
    if ((m = s.match(/^--(\d\d)-(\d\d)$/))) return `--${m[1]}-${m[2]}`;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return +m[1] <= 1 ? '' : `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/))) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000; if (y <= 1 || (a === 0 && b === 0)) return '';
      if (a > 12) [a, b] = [b, a]; if (a < 1 || a > 12 || b < 1 || b > 31) return '';
      return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    return '';
  }
  const MULTI = / ::: |\s*;\s*(?=[+\d(])/;
  const trimLabel = (s) => String(s || '').replace(/^\*\s*/, '').trim();

  // ---------- rows -> contacts ----------
  function toContacts(rows, mapping, opts = {}) {
    const start = opts.header === false ? 0 : 1; const out = [];
    for (let r = start; r < rows.length; r++) {
      const row = rows[r]; if (!row || row.every((x) => !String(x).trim())) continue;
      const c = { id: '', prefix: '', first: '', middle: '', last: '', suffix: '', nick: '', pFirst: '', pLast: '', org: '', dept: '', title: '', isOrg: false, phones: [], emails: [], urls: [], addrs: [], bday: '', dates: [], related: [], social: [], ims: [], notes: '', photo: '', fav: false, cats: [], uid: '', rev: 0, x: [] };
      let label = '', adrKeyed = {}; let fullName = '';
      const addMulti = (arr, v, l) => { const ls = String(l || 'other').split(' ::: '); String(v).split(/ ::: /).map((s) => s.trim()).forEach((s, i) => { if (s) arr.push({ l: (ls[i] || ls[0] || 'other').trim().toLowerCase(), v: s }); }); };
      mapping.forEach((t, i) => {
        const v = row[i] == null ? '' : String(row[i]).trim(); if (!t) return;
        if (t === 'label') { label = trimLabel(v); return; }
        if (!v) return;
        const [k, a, b] = t.split(':');
        switch (k) {
          case 'name': fullName = v; break;
          case 'first': case 'middle': case 'last': case 'prefix': case 'suffix': case 'nick': case 'pFirst': case 'pLast': case 'org': case 'dept': case 'title': c[k] = c[k] ? c[k] + ' ' + v : v; break;
          case 'notes': c.notes = c.notes ? c.notes + '\n' + v : v; break;
          case 'bday': c.bday = parseCsvDate(v) || c.bday; break;
          case 'groups': v.split(/ ::: |;|,/).map((s) => trimLabel(s)).filter((s) => s && s !== 'myContacts' && s !== 'Starred in Android').forEach((s) => { if (!c.cats.includes(s)) c.cats.push(s); }); if (/(^|\s):::|\bstarred\b/i.test(v) && /starred/i.test(v)) c.fav = true; break;
          case 'fav': c.fav = /^(1|true|yes|y|x)$/i.test(v); break;
          case 'phone': if (a) addMulti(c.phones, v, a); else addMulti(c.phones, v, label || 'other'); break;
          case 'email': if (a) addMulti(c.emails, v, a); else addMulti(c.emails, v, label || 'other'); break;
          case 'url': if (a) addMulti(c.urls, v, a); else addMulti(c.urls, v, label || 'other'); break;
          case 'related': addMulti(c.related, v, a || label || 'other'); break;
          case 'social': addMulti(c.social, v, a || label || 'other'); break;
          case 'im': addMulti(c.ims, v, a || label || 'other'); break;
          case 'date': { const d = parseCsvDate(v); if (d) c.dates.push({ l: (a || label || 'other').toLowerCase(), v: d }); break; }
          case 'adr': { const lab = a === '*' ? (label || 'other') : a; const key = a === '*' ? 'col:' + label + ':' + (adrKeyed.__n || 0) : lab; let ad = adrKeyed[a === '*' ? '*' + label : lab]; if (!ad) { ad = adrKeyed[a === '*' ? '*' + label : lab] = { l: lab.toLowerCase(), street: '', city: '', state: '', zip: '', country: '', pobox: '', ext: '' }; c.addrs.push(ad); } ad[b] = v; void key; break; }
        }
      });
      if (fullName && !c.first && !c.last) { const parts = fullName.includes(',') ? fullName.split(',').map((s) => s.trim()).reverse() : null; if (parts) { c.first = parts[0]; c.last = parts.slice(1).join(' '); } else { const p = fullName.split(/\s+/); if (p.length > 1) { c.last = p.pop(); c.first = p.join(' '); } else c.first = fullName; } }
      c.phones = dedupe(c.phones); c.emails = dedupe(c.emails);
      if (!c.first && !c.last && c.org && !c.phones.length && !c.emails.length) c.isOrg = true;
      if (c.first || c.last || c.org || c.phones.length || c.emails.length || c.notes || c.addrs.length) out.push(c);
    }
    void MULTI;
    return out;
  }
  const dedupe = (arr) => { const seen = new Set(); return arr.filter((e) => { const k = e.v.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };

  // ---------- contacts -> rows ----------
  const lab = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  function fromContacts(contacts, preset, groupName) {
    groupName = groupName || (() => '');
    const find = (c, l) => (c.phones.find((p) => p.l === l) || {}).v || '';
    if (preset === 'outlook') {
      const H = ['First Name', 'Middle Name', 'Last Name', 'Title', 'Suffix', 'Nickname', 'Given Yomi', 'Surname Yomi', 'E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address', 'Home Phone', 'Home Phone 2', 'Business Phone', 'Business Phone 2', 'Mobile Phone', 'Car Phone', 'Other Phone', 'Primary Phone', 'Pager', 'Business Fax', 'Home Fax', 'Other Fax', 'Company', 'Department', 'Job Title', 'Business Street', 'Business City', 'Business State', 'Business Postal Code', 'Business Country/Region', 'Home Street', 'Home City', 'Home State', 'Home Postal Code', 'Home Country/Region', 'Other Street', 'Other City', 'Other State', 'Other Postal Code', 'Other Country/Region', 'Birthday', 'Anniversary', 'Web Page', 'Notes', 'Categories'];
      const od = (d) => { if (!d) return ''; if (d.startsWith('--')) return ''; const [y, m, dd] = d.split('-'); return `${+m}/${+dd}/${y}`; };
      const rows = contacts.map((c) => {
        const em = c.emails.map((e) => e.v); const ad = (l) => c.addrs.find((a) => a.l === l) || {};
        const w = ad('work'), h = ad('home'), o = c.addrs.find((a) => a.l !== 'work' && a.l !== 'home') || {};
        const ann = c.dates.find((d) => d.l === 'anniversary');
        const used = new Set();
        const ph = (l) => { const f = c.phones.find((p) => p.l === l && !used.has(p)); if (f) used.add(f); return f ? f.v : ''; };
        return [c.first, c.middle, c.last, c.prefix, c.suffix, c.nick, c.pFirst, c.pLast, em[0] || '', em[1] || '', em[2] || '', ph('home'), ph('home'), ph('work'), ph('work'), ph('mobile'), '', ph('other'), ph('main'), ph('pager'), ph('work fax') || ph('fax'), ph('home fax'), '', c.org, c.dept, c.title, w.street, w.city, w.state, w.zip, w.country, h.street, h.city, h.state, h.zip, h.country, o.street, o.city, o.state, o.zip, o.country, od(c.bday), od(ann && ann.v), (c.urls[0] || {}).v || '', c.notes, (c.cats || []).join(';')].map((x) => x || '');
      });
      void find;
      return [H, ...rows];
    }
    if (preset === 'generic') {
      const H = ['First Name', 'Last Name', 'Company', 'Job Title', 'Email', 'Phone', 'Mobile', 'Address', 'City', 'State', 'Postal Code', 'Country', 'Website', 'Birthday', 'Notes'];
      return [H, ...contacts.map((c) => { const a = c.addrs[0] || {}; return [c.first, c.last, c.org, c.title, (c.emails[0] || {}).v, (c.phones.find((p) => p.l !== 'mobile') || {}).v, find(c, 'mobile'), a.street, a.city, a.state, a.zip, a.country, (c.urls[0] || {}).v, c.bday && !c.bday.startsWith('--') ? c.bday : c.bday, c.notes].map((x) => x || ''); })];
    }
    // google
    const max = (f) => Math.max(1, ...contacts.map((c) => f(c).length));
    const nE = max((c) => c.emails), nP = max((c) => c.phones), nA = max((c) => c.addrs), nU = max((c) => c.urls);
    const H = ['First Name', 'Middle Name', 'Last Name', 'Phonetic First Name', 'Phonetic Middle Name', 'Phonetic Last Name', 'Name Prefix', 'Name Suffix', 'Nickname', 'File As', 'Organization Name', 'Organization Title', 'Organization Department', 'Birthday', 'Notes', 'Photo', 'Labels'];
    for (let i = 1; i <= nE; i++) H.push(`E-mail ${i} - Label`, `E-mail ${i} - Value`);
    for (let i = 1; i <= nP; i++) H.push(`Phone ${i} - Label`, `Phone ${i} - Value`);
    for (let i = 1; i <= nA; i++) H.push(`Address ${i} - Label`, `Address ${i} - Formatted`, `Address ${i} - Street`, `Address ${i} - City`, `Address ${i} - PO Box`, `Address ${i} - Region`, `Address ${i} - Postal Code`, `Address ${i} - Country`, `Address ${i} - Extended Address`);
    for (let i = 1; i <= nU; i++) H.push(`Website ${i} - Label`, `Website ${i} - Value`);
    const rows = contacts.map((c) => {
      const r = [c.first, c.middle, c.last, c.pFirst, '', c.pLast, c.prefix, c.suffix, c.nick, '', c.org, c.title, c.dept, c.bday, c.notes, '', [...(c.cats || []), ...(c.fav ? ['Starred'] : [])].join(' ::: ')];
      for (let i = 0; i < nE; i++) { const e = c.emails[i]; r.push(e ? lab(e.l) : '', e ? e.v : ''); }
      for (let i = 0; i < nP; i++) { const p = c.phones[i]; r.push(p ? lab(p.l) : '', p ? p.v : ''); }
      for (let i = 0; i < nA; i++) { const a = c.addrs[i]; r.push(a ? lab(a.l) : '', a ? [a.street, [a.city, a.state, a.zip].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n') : '', a ? a.street : '', a ? a.city : '', a ? a.pobox || '' : '', a ? a.state : '', a ? a.zip : '', a ? a.country : '', a ? a.ext || '' : ''); }
      for (let i = 0; i < nU; i++) { const u = c.urls[i]; r.push(u ? lab(u.l) : '', u ? u.v : ''); }
      return r.map((x) => x || '');
    });
    void groupName;
    return [H, ...rows];
  }

  return { parse, write, detectDelimiter, detectPreset, autoMap, toContacts, fromContacts, parseCsvDate, TARGETS: T };
});
