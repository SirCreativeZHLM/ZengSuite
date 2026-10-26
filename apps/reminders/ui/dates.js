/* Date helpers on plain 'YYYY-MM-DD' strings (local calendar, no time zones involved). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.ZR = root.ZR || {}).dates = factory();
})(this, function () {
  const p2 = (n) => String(n).padStart(2, '0');
  const fmt = (y, m, d) => `${String(y).padStart(4, '0')}-${p2(m)}-${p2(d)}`;
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const fromDate = (dt) => fmt(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  const toUTC = (s) => { const o = parse(s); return Date.UTC(o.y, o.m - 1, o.d); };
  const fromUTC = (t) => { const d = new Date(t); return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
  const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);
  const dow = (s) => new Date(toUTC(s)).getUTCDay(); // 0=Sun
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const valid = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m);
  const addMonths = (s, n) => { const o = parse(s); let t = o.y * 12 + (o.m - 1) + n; const y = Math.floor(t / 12), m = (t % 12) + 1; return fmt(y, m, Math.min(o.d, dim(y, m))); };
  const addYears = (s, n) => addMonths(s, n * 12);
  const mondayOf = (s) => addDays(s, -((dow(s) + 6) % 7));
  const startOfWeek = (s, ws = 1) => addDays(s, -((dow(s) - ws + 7) % 7));
  const minutes = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const hhmm = (mins) => { mins = ((mins % 1440) + 1440) % 1440; return p2(Math.floor(mins / 60)) + ':' + p2(mins % 60); };
  const today = (now = new Date()) => fromDate(now);
  const nowMin = (now = new Date()) => now.getHours() * 60 + now.getMinutes();
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // local Date (ms) for a due date + optional time; date-only => given default minutes (e.g. 09:00)
  const at = (date, time, defMin = 540) => { const o = parse(date); const m = time ? minutes(time) : defMin; return new Date(o.y, o.m - 1, o.d, Math.floor(m / 60), m % 60, 0, 0); };
  const fmtTime = (t, h12) => { const m = minutes(t); if (m == null) return ''; const h = Math.floor(m / 60), mi = m % 60; if (h12 === false) return p2(h) + ':' + p2(mi); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 || 12}:${p2(mi)} ${ap}`; };
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10]);
  // "Today", "Tomorrow", "Yesterday", "Mon", "Oct 28", "Oct 28, 2027"
  const rel = (date, now = new Date()) => {
    const t = today(now), n = diffDays(date, t), o = parse(date);
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    if (n > 1 && n < 7) return `${WD[dow(date)]}, ${MON[o.m - 1]} ${o.d}`;
    return `${MON[o.m - 1]} ${o.d}` + (o.y !== now.getFullYear() ? `, ${o.y}` : '');
  };
  return { p2, fmt, parse, fromDate, addDays, diffDays, dow, dim, valid, addMonths, addYears, mondayOf, startOfWeek, minutes, hhmm, today, nowMin, MON, WD, WDL, MONL, at, fmtTime, ord, rel, toUTC, fromUTC };
});
