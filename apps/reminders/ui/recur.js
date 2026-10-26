/* Recurrence rules.  rule = {freq:'daily'|'weekly'|'monthly'|'yearly', interval, byday?:['MO','1TU','-1FR'], bymonthday?:[1,-1], bymonth?:n, until?:'YYYY-MM-DD', count?:n} */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'));
  else (root.ZR = root.ZR || {}).recur = factory(root.ZR.dates);
})(this, function (D) {
  const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR'];
  const splitDay = (s) => { const m = /^([+-]?\d)?([A-Z]{2})$/.exec(s); return { n: m && m[1] ? +m[1] : 0, wd: CODES.indexOf(m ? m[2] : s) }; };
  const nthWeekday = (y, m, n, wd) => { // n>0: nth, n<0: from end; returns day-of-month or null
    const len = D.dim(y, m);
    if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7; return d <= len ? d : null; }
    const last = new Date(Date.UTC(y, m - 1, len)).getUTCDay(); const d = len - ((last - wd + 7) % 7) + (n + 1) * 7; return d >= 1 ? d : null;
  };
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const norm = (r) => { if (!r) return null; const o = { freq: r.freq, interval: Math.max(1, r.interval | 0 || 1) }; if (r.byday && r.byday.length) o.byday = r.byday.slice(); if (r.bymonthday != null) { const a = [].concat(r.bymonthday); if (a.length) o.bymonthday = a; } if (r.bymonth) o.bymonth = r.bymonth; if (r.until) o.until = r.until; if (r.count) o.count = r.count; return o; };

  // next occurrence strictly after `from` (YYYY-MM-DD), or null. notBefore: skip occurrences earlier than this date.
  function next(rule, from, notBefore) {
    const r = norm(rule); if (!r) return null; let cur = from; let guard = 0;
    for (;;) {
      const n = step(r, cur); if (!n) return null; if (r.until && n > r.until) return null;
      if (!notBefore || n >= notBefore) return n; cur = n; if (++guard > 4000) return null;
    }
  }
  function step(r, from) {
    const o = D.parse(from), iv = r.interval;
    if (r.freq === 'daily') return D.addDays(from, iv);
    if (r.freq === 'weekly') {
      if (!r.byday) return D.addDays(from, 7 * iv);
      const days = r.byday.map((s) => splitDay(s).wd); const w0 = D.mondayOf(from);
      for (let i = 1; i <= 7 * iv + 7; i++) { const d = D.addDays(from, i); if (!days.includes(D.dow(d))) continue; const wk = D.diffDays(D.mondayOf(d), w0) / 7; if (wk % iv === 0) return d; }
      return null;
    }
    if (r.freq === 'monthly') {
      for (let k = 0; k < 400; k++) {
        const t = o.y * 12 + (o.m - 1) + k * iv, y = Math.floor(t / 12), m = (t % 12) + 1, len = D.dim(y, m); const c = [];
        if (r.byday) r.byday.forEach((s) => { const { n, wd } = splitDay(s); if (n) { const d = nthWeekday(y, m, n, wd); d && c.push(d); } else for (let d = 1; d <= len; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) c.push(d); });
        else (r.bymonthday || [o.d]).forEach((d) => c.push(d < 0 ? len + 1 + d : Math.min(d, len)));
        const res = [...new Set(c)].filter((d) => d >= 1 && d <= len).sort((a, b) => a - b).map((d) => D.fmt(y, m, d)).filter((s) => s > from);
        if (res.length) return res[0];
      }
      return null;
    }
    if (r.freq === 'yearly') {
      const m = r.bymonth || o.m, ds = r.bymonthday || [o.d];
      for (let k = 0; k < 60; k++) { const y = o.y + k * iv; const c = ds.map((d) => { const len = D.dim(y, m); return D.fmt(y, m, d < 0 ? len + 1 + d : Math.min(d, len)); }).filter((s) => s > from).sort(); if (c.length) return c[0]; }
    }
    return null;
  }
  // first date >= start matching the rule's constraints (used for "every monday" with no explicit start)
  function firstOn(rule, start) {
    const r = norm(rule); if (!r) return start; const prev = D.addDays(start, -1);
    if (r.freq === 'weekly' && r.byday) { const days = r.byday.map((s) => splitDay(s).wd); for (let i = 0; i < 7; i++) { const d = D.addDays(start, i); if (days.includes(D.dow(d))) return d; } }
    if (r.freq === 'monthly' && (r.byday || r.bymonthday)) return step({ ...r, interval: 1 }, prev) || start;
    if (r.freq === 'yearly' && (r.bymonth || r.bymonthday)) return step({ ...r, interval: 1 }, prev) || start;
    return start;
  }
  function occurrences(rule, start, n) { const out = [start]; let c = start; while (out.length < n) { c = next(rule, c); if (!c) break; out.push(c); } return out; }
  const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

  function label(rule) {
    const r = norm(rule); if (!r) return 'Never'; const iv = r.interval; const wdn = (s) => { const { n, wd } = splitDay(s); return (n ? (n === -1 ? 'last ' : D.ord(n) + ' ') : '') + D.WDL[wd]; };
    let s;
    if (r.freq === 'daily') s = iv === 1 ? 'Daily' : `Every ${iv} days`;
    else if (r.freq === 'weekly') {
      if (r.byday && sameSet(r.byday, WEEKDAYS) && iv === 1) s = 'Weekdays';
      else if (r.byday && sameSet(r.byday, ['SA', 'SU']) && iv === 1) s = 'Weekends';
      else if (r.byday) s = (iv === 1 ? 'Every ' : `Every ${iv} weeks on `) + r.byday.map((d) => D.WD[splitDay(d).wd]).join(', ');
      else s = iv === 1 ? 'Weekly' : iv === 2 ? 'Every 2 weeks' : `Every ${iv} weeks`;
    } else if (r.freq === 'monthly') {
      if (r.byday) s = `Every ${iv === 1 ? '' : iv + ' months on '}${r.byday.map(wdn).join(', ')}`.replace('Every  ', 'Every ');
      else if (r.bymonthday) s = (iv === 1 ? 'Monthly on ' : `Every ${iv} months on `) + r.bymonthday.map((d) => (d === -1 ? 'the last day' : D.ord(d))).join(', ');
      else s = iv === 1 ? 'Monthly' : `Every ${iv} months`;
    } else s = iv === 1 ? 'Yearly' : `Every ${iv} years`;
    if (r.until) s += ` until ${r.until}`; if (r.count) s += `, ${r.count} times`;
    return s;
  }
  // presets used by UI
  const PRESETS = {
    daily: { freq: 'daily', interval: 1 }, weekdays: { freq: 'weekly', interval: 1, byday: WEEKDAYS.slice() },
    weekly: { freq: 'weekly', interval: 1 }, biweekly: { freq: 'weekly', interval: 2 }, monthly: { freq: 'monthly', interval: 1 }, yearly: { freq: 'yearly', interval: 1 },
  };
  function presetOf(rule) { const r = norm(rule); if (!r) return 'none'; const b = { ...r }; delete b.until; delete b.count; for (const k in PRESETS) if (same(b, PRESETS[k])) return k; return 'custom'; }
  return { next, firstOn, occurrences, label, norm, same, PRESETS, presetOf, splitDay, CODES, WEEKDAYS, nthWeekday };
});
