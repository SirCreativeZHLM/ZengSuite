/* ZC.csv — Outlook-style CSV calendar import/export (English headers). */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const T = ZC.time || (require('./zc-time.js'), ZC.time); const I = ZC.ical || (require('./zc-ical.js'), ZC.ical);
  const C = (ZC.csv = {});
  C.parse = (text) => {
    const rows = []; let row = [], cur = '', q = false; text = String(text).replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows;
  };
  C.stringify = (rows) => rows.map((r) => r.map((v) => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n') + '\r\n';
  const HEAD = ['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All day event', 'Reminder on/off', 'Reminder Date', 'Reminder Time', 'Meeting Organizer', 'Required Attendees', 'Optional Attendees', 'Meeting Resources', 'Billing Information', 'Categories', 'Description', 'Location', 'Mileage', 'Priority', 'Private', 'Sensitivity', 'Show time as'];
  C.headers = HEAD;
  const parseTime = (s) => { s = (s || '').trim(); if (!s) return null; const m = /^(\d{1,2})[:.](\d\d)(?:[:.](\d\d))?\s*([ap]\.?m\.?)?$/i.exec(s); if (!m) return null; let h = +m[1]; const ap = m[4] && m[4][0].toLowerCase(); if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; return [h, +m[2], +(m[3] || 0)]; };
  const detectOrder = (rows, col) => {
    let dmy = false, ymd = false; for (const r of rows) { const v = (r[col] || '').trim(); if (/^\d{4}[-/.]\d/.test(v)) { ymd = true; break; } const p = v.split(/[/.\-]/).map(Number); if (p.length === 3) { if (p[0] > 12) dmy = true; } }
    return ymd ? 'ymd' : dmy ? 'dmy' : 'mdy';
  };
  const parseDate = (s, order) => { s = (s || '').trim(); if (!s) return null; const p = s.split(/[/.\-]/).map(Number); if (p.length !== 3 || p.some(isNaN)) return null; let y, m, d; if (order === 'ymd' || p[0] > 31) [y, m, d] = p; else if (order === 'dmy') [d, m, y] = p; else [m, d, y] = p; if (y < 100) y += 2000; if (m < 1 || m > 12 || d < 1 || d > 31) return null; return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
  /** rows -> events (floating). Returns {events, warnings}. */
  C.toEvents = (text, opts = {}) => {
    const rows = C.parse(text); if (rows.length < 2) throw new Error('This CSV file has no events.');
    const head = rows[0].map((h) => h.trim().toLowerCase()); const col = (n) => head.indexOf(n.toLowerCase());
    const cS = col('Subject'), cSD = col('Start Date'); if (cS < 0 || cSD < 0) throw new Error('Not an Outlook calendar CSV: expected “Subject” and “Start Date” columns.');
    const cST = col('Start Time'), cED = col('End Date'), cET = col('End Time'), cAD = col('All day event'), cRO = col('Reminder on/off'), cRD = col('Reminder Date'), cRT = col('Reminder Time'), cReq = col('Required Attendees'), cOpt = col('Optional Attendees'), cCat = col('Categories'), cDesc = col('Description'), cLoc = col('Location'), cShow = col('Show time as'), cOrg = col('Meeting Organizer');
    const body = rows.slice(1); const order = opts.dateOrder || detectOrder(body, cSD); const events = [], warnings = []; const g = (r, c) => (c < 0 ? '' : (r[c] || '').trim());
    body.forEach((r, i) => {
      const sd = parseDate(g(r, cSD), order); if (!sd) { warnings.push('Row ' + (i + 2) + ': invalid start date'); return; }
      const allDay = /^(true|yes|1|wahr)$/i.test(g(r, cAD)); const ed = parseDate(g(r, cED), order) || sd; const st = parseTime(g(r, cST)), et = parseTime(g(r, cET));
      const ev = I.newEvent({ title: g(r, cS), loc: g(r, cLoc), notes: (r[cDesc] || '').replace(/\r\n?/g, '\n'), allDay, tz: 'floating', uid: I.uid() }); ev.id = ev.uid;
      if (allDay || (!st && !et)) { ev.allDay = true; ev.start = sd; ev.end = T.addDays(ed < sd ? sd : ed, 1); }
      else { const p = (n) => String(n).padStart(2, '0'); const t1 = st || [0, 0, 0], t2 = et || t1; ev.start = `${sd}T${p(t1[0])}:${p(t1[1])}:${p(t1[2])}`; ev.end = `${ed}T${p(t2[0])}:${p(t2[1])}:${p(t2[2])}`; if (ev.end < ev.start) ev.end = ev.start; }
      ev.categories = g(r, cCat).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      const people = (s) => s.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const m = /^(.*?)\s*<([^>]+)>$/.exec(x); if (m) return { name: m[1], email: m[2] }; return /@/.test(x) ? { name: '', email: x } : { name: x, email: '' }; });
      ev.attendees = [...people(g(r, cReq)).map((a) => ({ ...a, role: 'REQ-PARTICIPANT' })), ...people(g(r, cOpt)).map((a) => ({ ...a, role: 'OPT-PARTICIPANT' }))];
      const show = g(r, cShow).toLowerCase(); ev.avail = show === 'free' ? 'free' : show === 'tentative' ? 'tentative' : /out of office/.test(show) ? 'oof' : 'busy';
      if (/^(true|yes|1)$/i.test(g(r, cRO)) && cRD >= 0) { const rd = parseDate(g(r, cRD), order), rt = parseTime(g(r, cRT)); if (rd) { const s = I.base(ev).s; const rEp = T.wallToEpoch(`${rd}T${String((rt || [0])[0]).padStart(2, '0')}:${String((rt || [0, 0])[1]).padStart(2, '0')}:00`, 'floating'); const m = Math.round((s - rEp) / 60000); if (m >= 0 && m < 60 * 24 * 60) ev.alarms = [{ m, action: 'DISPLAY' }]; } }
      void cOrg; events.push(ev);
    });
    return { events, warnings, order };
  };
  const p2 = (n) => String(n).padStart(2, '0');
  const dstr = (w) => `${+w.slice(5, 7)}/${+w.slice(8, 10)}/${w.slice(0, 4)}`;
  const tstr = (w) => { let h = +w.slice(11, 13); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${w.slice(14, 16)}:${w.slice(17, 19) || '00'} ${ap}`; };
  /** occurrences [{ev,s,e,allDay,...}] -> CSV text (times in the viewer's local zone, like Outlook) */
  C.fromOccurrences = (occs) => {
    const rows = [HEAD];
    for (const o of occs) {
      const f = (k) => I.F(o, k); let sw, ew;
      if (o.allDay) { sw = o.wallStart.slice(0, 10); ew = T.addDays(o.wallEnd.slice(0, 10), -1); if (ew < sw) ew = sw; rows.push([f('title'), dstr(sw), '', dstr(ew), '', 'True']); }
      else { sw = T.epochToWall(o.s, 'floating'); ew = T.epochToWall(o.e, 'floating'); rows.push([f('title'), dstr(sw), tstr(sw), dstr(ew), tstr(ew), 'False']); }
      const r = rows[rows.length - 1]; const al = (f('alarms') || [])[0];
      if (al && !al.abs) { const rem = T.epochToWall(o.s - al.m * 60000, 'floating'); r.push('True', dstr(rem), tstr(rem)); } else r.push('False', '', '');
      const att = f('attendees') || [], fmt = (a) => (a.name && a.email ? `${a.name} <${a.email}>` : a.email || a.name);
      r.push('', att.filter((a) => a.role !== 'OPT-PARTICIPANT').map(fmt).join('; '), att.filter((a) => a.role === 'OPT-PARTICIPANT').map(fmt).join('; '), '', '', (f('categories') || []).join(';'), f('notes'), f('loc'), '', 'Normal', 'False', 'Normal', { free: 'Free', tentative: 'Tentative', oof: 'Out of Office', busy: 'Busy' }[f('avail') || 'busy']);
    }
    return C.stringify(rows);
  };
  void p2;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZC;
})(typeof window !== 'undefined' ? window : globalThis);
