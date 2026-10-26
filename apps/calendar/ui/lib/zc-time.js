/* ZC.time — wall-clock / time-zone arithmetic with Intl only (no tz database shipped).
   "Wall" values are strings "YYYY-MM-DDTHH:mm:ss" (timed) or "YYYY-MM-DD" (date). "W" is wall-as-UTC milliseconds. */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const T = (ZC.time = {});
  const DAY = 86400000;
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  T.DAY = DAY; T.pad = pad;

  // ---- civil day numbers (days since 1970-01-01) ----
  T.dayNum = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(0, 0, 0, 0); return Math.round(t.getTime() / DAY); };
  T.civil = (n) => { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  T.dow = (n) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday
  T.isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  T.dim = (y, m) => [31, T.isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  T.dateStr = (n) => { const c = T.civil(n); return pad(c.y, 4) + '-' + pad(c.m) + '-' + pad(c.d); };

  // ---- wall strings ----
  const RE = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?)?$/;
  T.parseWall = (s) => {
    const m = RE.exec(s || ''); if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], H: +(m[4] || 0), M: +(m[5] || 0), S: +(m[6] || 0), date: m[4] == null };
  };
  T.fmtWall = (w) => pad(w.y, 4) + '-' + pad(w.m) + '-' + pad(w.d) + (w.date ? '' : 'T' + pad(w.H) + ':' + pad(w.M) + ':' + pad(w.S));
  T.wallToW = (s) => { const w = typeof s === 'string' ? T.parseWall(s) : s; if (!w) return NaN; return T.dayNum(w.y, w.m, w.d) * DAY + ((w.H * 60 + w.M) * 60 + w.S) * 1000; };
  T.wToWall = (W, date) => { const n = Math.floor(W / DAY); const c = T.civil(n); const s = Math.round((W - n * DAY) / 1000); return T.fmtWall({ y: c.y, m: c.m, d: c.d, H: Math.floor(s / 3600), M: Math.floor((s % 3600) / 60), S: s % 60, date: !!date }); };
  T.addWall = (s, ms) => T.wToWall(T.wallToW(s) + ms, s.length === 10);
  T.addDays = (s, n) => T.addWall(s, n * DAY);

  // ---- time zones ----
  const fmtCache = new Map(); const validCache = new Map();
  T.isFloating = (tz) => !tz || tz === 'floating';
  T.validZone = (tz) => {
    if (T.isFloating(tz) || tz === 'UTC' || /^fixed:[+-]\d{4}$/.test(tz)) return true;
    if (validCache.has(tz)) return validCache.get(tz);
    let ok = false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); ok = true; } catch { ok = false; }
    validCache.set(tz, ok); return ok;
  };
  const fmtFor = (tz) => { let f = fmtCache.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); fmtCache.set(tz, f); } return f; };
  /** offset in ms (wall = epoch + offset) of zone `tz` at instant `epoch`. */
  T.offset = (epoch, tz) => {
    if (T.isFloating(tz)) return -new Date(epoch).getTimezoneOffset() * 60000;
    if (tz === 'UTC') return 0;
    if (tz.startsWith('fixed:')) { const s = tz[6] === '-' ? -1 : 1; return s * (+tz.slice(7, 9) * 60 + +tz.slice(9, 11)) * 60000; }
    const e = Math.floor(epoch / 1000) * 1000; const p = {};
    for (const x of fmtFor(tz).formatToParts(new Date(e))) if (x.type !== 'literal') p[x.type] = +x.value;
    const W = T.dayNum(p.year, p.month, p.day) * DAY + (p.hour * 3600 + p.minute * 60 + p.second) * 1000;
    return W - e;
  };
  /** wall-as-UTC ms -> epoch, in zone tz. Gaps use the pre-transition offset, overlaps the first occurrence. */
  T.wToEpoch = (W, tz) => {
    if (tz === 'UTC') return W;
    if (T.isFloating(tz)) { const c = T.civil(Math.floor(W / DAY)); const s = Math.round((W - Math.floor(W / DAY) * DAY) / 1000); const d = new Date(2000, 0, 1, 0, 0, 0); d.setFullYear(c.y, c.m - 1, c.d); d.setHours(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60, 0); return d.getTime(); }
    const o1 = T.offset(W - T.offset(W, tz), tz); const t1 = W - o1; const o2 = T.offset(t1, tz);
    if (o1 === o2) return t1;
    const c1 = W - o1, c2 = W - o2; const v1 = T.offset(c1, tz) === o1, v2 = T.offset(c2, tz) === o2;
    if (v1 && v2) return Math.min(c1, c2);
    if (v1) return c1; if (v2) return c2;
    return W - Math.min(o1, o2);
  };
  T.wallToEpoch = (s, tz) => T.wToEpoch(T.wallToW(s), tz);
  T.epochToWall = (epoch, tz, date) => T.wToWall(epoch + T.offset(epoch, tz), date);
  T.zoneAbbr = (epoch, tz, locale) => {
    try { if (T.isFloating(tz)) return ''; if (tz === 'UTC') return 'UTC'; if (tz.startsWith('fixed:')) return 'GMT' + tz.slice(6, 9) + ':' + tz.slice(9);
      const p = new Intl.DateTimeFormat(locale || 'en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(epoch)).find((x) => x.type === 'timeZoneName'); return p ? p.value : tz; } catch { return tz; }
  };
  T.systemZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

  // Windows (Outlook) zone names -> IANA
  T.WINDOWS = { 'Dateline Standard Time': 'Etc/GMT+12', 'UTC-11': 'Etc/GMT+11', 'Hawaiian Standard Time': 'Pacific/Honolulu', 'Alaskan Standard Time': 'America/Anchorage', 'Pacific Standard Time': 'America/Los_Angeles', 'Pacific Standard Time (Mexico)': 'America/Tijuana', 'US Mountain Standard Time': 'America/Phoenix', 'Mountain Standard Time': 'America/Denver', 'Central America Standard Time': 'America/Guatemala', 'Central Standard Time': 'America/Chicago', 'Central Standard Time (Mexico)': 'America/Mexico_City', 'Canada Central Standard Time': 'America/Regina', 'SA Pacific Standard Time': 'America/Bogota', 'Eastern Standard Time': 'America/New_York', 'US Eastern Standard Time': 'America/Indianapolis', 'Atlantic Standard Time': 'America/Halifax', 'Venezuela Standard Time': 'America/Caracas', 'SA Western Standard Time': 'America/La_Paz', 'Pacific SA Standard Time': 'America/Santiago', 'Newfoundland Standard Time': 'America/St_Johns', 'E. South America Standard Time': 'America/Sao_Paulo', 'Argentina Standard Time': 'America/Argentina/Buenos_Aires', 'SA Eastern Standard Time': 'America/Cayenne', 'Greenland Standard Time': 'America/Godthab', 'Mid-Atlantic Standard Time': 'Atlantic/South_Georgia', 'Azores Standard Time': 'Atlantic/Azores', 'Cape Verde Standard Time': 'Atlantic/Cape_Verde', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik', 'UTC': 'UTC', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'Romance Standard Time': 'Europe/Paris', 'Central European Standard Time': 'Europe/Warsaw', 'W. Central Africa Standard Time': 'Africa/Lagos', 'Namibia Standard Time': 'Africa/Windhoek', 'GTB Standard Time': 'Europe/Bucharest', 'Middle East Standard Time': 'Asia/Beirut', 'Egypt Standard Time': 'Africa/Cairo', 'Syria Standard Time': 'Asia/Damascus', 'South Africa Standard Time': 'Africa/Johannesburg', 'FLE Standard Time': 'Europe/Kiev', 'Turkey Standard Time': 'Europe/Istanbul', 'Israel Standard Time': 'Asia/Jerusalem', 'Arabic Standard Time': 'Asia/Baghdad', 'Arab Standard Time': 'Asia/Riyadh', 'Russian Standard Time': 'Europe/Moscow', 'E. Africa Standard Time': 'Africa/Nairobi', 'Iran Standard Time': 'Asia/Tehran', 'Arabian Standard Time': 'Asia/Dubai', 'Azerbaijan Standard Time': 'Asia/Baku', 'Mauritius Standard Time': 'Indian/Mauritius', 'Georgian Standard Time': 'Asia/Tbilisi', 'Caucasus Standard Time': 'Asia/Yerevan', 'Afghanistan Standard Time': 'Asia/Kabul', 'West Asia Standard Time': 'Asia/Tashkent', 'Pakistan Standard Time': 'Asia/Karachi', 'India Standard Time': 'Asia/Kolkata', 'Sri Lanka Standard Time': 'Asia/Colombo', 'Nepal Standard Time': 'Asia/Katmandu', 'Central Asia Standard Time': 'Asia/Almaty', 'Bangladesh Standard Time': 'Asia/Dhaka', 'Myanmar Standard Time': 'Asia/Rangoon', 'SE Asia Standard Time': 'Asia/Bangkok', 'N. Central Asia Standard Time': 'Asia/Novosibirsk', 'China Standard Time': 'Asia/Shanghai', 'North Asia Standard Time': 'Asia/Krasnoyarsk', 'Singapore Standard Time': 'Asia/Singapore', 'W. Australia Standard Time': 'Australia/Perth', 'Taipei Standard Time': 'Asia/Taipei', 'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar', 'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul', 'Yakutsk Standard Time': 'Asia/Yakutsk', 'Cen. Australia Standard Time': 'Australia/Adelaide', 'AUS Central Standard Time': 'Australia/Darwin', 'E. Australia Standard Time': 'Australia/Brisbane', 'AUS Eastern Standard Time': 'Australia/Sydney', 'West Pacific Standard Time': 'Pacific/Port_Moresby', 'Tasmania Standard Time': 'Australia/Hobart', 'Vladivostok Standard Time': 'Asia/Vladivostok', 'Central Pacific Standard Time': 'Pacific/Guadalcanal', 'New Zealand Standard Time': 'Pacific/Auckland', 'Fiji Standard Time': 'Pacific/Fiji', 'Tonga Standard Time': 'Pacific/Tongatapu', 'Samoa Standard Time': 'Pacific/Apia' };

  // ---- UI-side helpers for the viewer's local zone (JS Date) ----
  T.startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  T.addDaysLocal = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
  T.sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  T.dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  T.startOfWeek = (d, first) => { const x = T.startOfDay(d); return T.addDaysLocal(x, -((x.getDay() - first + 7) % 7)); };
  /** ISO-8601 week number when weeks start Monday; US-style (week with Jan 1 is week 1) otherwise. */
  T.weekNumber = (d, first) => {
    const x = T.startOfDay(d);
    if (first === 1) { const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }
    const ws = T.startOfWeek(x, first); const thursdayish = T.addDaysLocal(ws, 6); // week containing Jan 1 is week 1
    const jan1 = new Date(thursdayish.getFullYear(), 0, 1); const w1 = T.startOfWeek(jan1, first);
    if (thursdayish.getFullYear() !== ws.getFullYear()) return 1;
    return Math.round((ws - w1) / (7 * DAY)) + 1;
  };
})(typeof window !== 'undefined' ? window : globalThis);
