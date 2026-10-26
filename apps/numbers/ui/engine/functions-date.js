/* ZengNumbers date & time functions (Excel 1900 date system incl. the 1900 leap-year bug). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E } = ZN; const F = ZN.F; const { isErr, toNum, scalar } = F; const D = ZN.date;
  const reg = (names, min, max, impl, hint, desc, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: 'Date & Time', hint, desc, lift: true }, opts));
  const MAXSERIAL = 2958465;
  const ymd = (n) => D.toYMD(Math.floor(n));
  const dim = (y, m) => (y === 1900 && m === 2 ? 29 : D.daysInMonth(y, m));
  // DATE(y, m, d) -> serial | ZErr
  function mkSerial(y, m, d) {
    y = Math.trunc(y); m = Math.trunc(m); d = Math.trunc(d);
    if (y < 0 || y > 9999) return E.NUM; if (y < 1900) y += 1900;
    y += Math.floor((m - 1) / 12); m = (((m - 1) % 12) + 12) % 12 + 1;
    if (y < 1900 || y > 9999) return E.NUM;
    if (y === 1900 && m <= 2) { const s = (m === 1 ? 0 : 31) + d; return s < 0 || s > MAXSERIAL ? E.NUM : s; }
    const n = D.fromYMD(y, m, d); return n < 0 || n > MAXSERIAL ? E.NUM : n;
  }
  ZN.dateSerial = mkSerial;
  const ser = (v) => { const n = toNum(v); if (isErr(n)) return n; return n < 0 || n > MAXSERIAL + 1 ? E.NUM : n; };
  const isDateNf = (nf) => !!nf && ZN.fmt.isDate(nf);
  const lastFeb = (n) => { const a = ymd(n), b = ymd(n + 1); return a.m === 2 && b && b.m === 3; };

  reg('DATE', 3, 3, (y, m, d) => { const a = toNum(y), b = toNum(m), c = toNum(d); if (isErr(a)) return a; if (isErr(b)) return b; if (isErr(c)) return c; return mkSerial(a, b, c); }, 'DATE(year, month, day)', 'Builds a date serial number from year, month and day.');
  reg('TIME', 3, 3, (h, m, s) => { const a = toNum(h), b = toNum(m), c = toNum(s); if (isErr(a)) return a; if (isErr(b)) return b; if (isErr(c)) return c; if (a < 0 || a > 32767 || b < 0 || b > 32767 || c < 0 || c > 32767) { if (Math.trunc(a) < 0 || Math.trunc(a) > 32767) return E.NUM; } const t = Math.trunc(a) * 3600 + Math.trunc(b) * 60 + Math.trunc(c); if (t < 0) return E.NUM; return (t % 86400) / 86400; }, 'TIME(hour, minute, second)', 'Builds a time fraction from hour, minute and second.');
  reg('DATEVALUE', 1, 1, (t) => { if (typeof t !== 'string') return E.VALUE; const p = ZN.parseValue(t.trim()); if (!p || typeof p.v !== 'number' || !isDateNf(p.nf)) return E.VALUE; return Math.floor(p.v); }, 'DATEVALUE(date_text)', 'Converts a date in text form to a serial number.');
  reg('TIMEVALUE', 1, 1, (t) => { if (typeof t !== 'string') return E.VALUE; const p = ZN.parseValue(t.trim()); if (!p || typeof p.v !== 'number' || !isDateNf(p.nf)) return E.VALUE; return p.v - Math.floor(p.v); }, 'TIMEVALUE(time_text)', 'Converts a time in text form to a fraction of a day.');
  reg('NOW', 0, 0, () => D.now(), 'NOW()', 'Returns the current date and time.', { volatile: true, lift: false });
  reg('TODAY', 0, 0, () => Math.floor(D.now()), 'TODAY()', 'Returns the current date.', { volatile: true, lift: false });
  reg('YEAR', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : ymd(n).y; }, 'YEAR(serial_number)', 'Returns the year of a date.');
  reg('MONTH', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : ymd(n).m; }, 'MONTH(serial_number)', 'Returns the month of a date (1-12).');
  reg('DAY', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : ymd(n).d; }, 'DAY(serial_number)', 'Returns the day of the month.');
  reg('HOUR', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : D.hms(n).h; }, 'HOUR(serial_number)', 'Returns the hour of a time (0-23).');
  reg('MINUTE', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : D.hms(n).m; }, 'MINUTE(serial_number)', 'Returns the minute of a time (0-59).');
  reg('SECOND', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : D.hms(n).s; }, 'SECOND(serial_number)', 'Returns the second of a time (0-59).');

  const WSTART = { 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };
  reg('WEEKDAY', 1, 2, (v, t) => {
    const n = ser(v); if (isErr(n)) return n; const k = t === undefined ? 1 : toNum(t); if (isErr(k)) return k; const ty = Math.trunc(k); const wd = D.weekday(n);
    if (ty === 3) return (wd + 6) % 7; if (!(ty in WSTART)) return E.NUM; return ((wd - WSTART[ty] + 7) % 7) + 1;
  }, 'WEEKDAY(serial_number, [return_type])', 'Returns the day of the week as a number.');
  const isoWeek = (n) => { const wd = D.weekday(n); const thu = Math.floor(n) + 3 - ((wd + 6) % 7); const y = ymd(thu).y; return Math.floor((thu - mkSerial(y, 1, 1)) / 7) + 1; };
  reg('WEEKNUM', 1, 2, (v, t) => {
    const n = ser(v); if (isErr(n)) return n; const k = t === undefined ? 1 : toNum(t); if (isErr(k)) return k; const ty = Math.trunc(k);
    if (ty === 21) return isoWeek(n); if (!(ty in WSTART)) return E.NUM;
    const y = ymd(n).y; const jan1 = mkSerial(y, 1, 1); const off = (D.weekday(jan1) - WSTART[ty] + 7) % 7; return Math.floor((Math.floor(n) - jan1 + off) / 7) + 1;
  }, 'WEEKNUM(serial_number, [return_type])', 'Returns the week number of the year.');
  reg('ISOWEEKNUM', 1, 1, (v) => { const n = ser(v); return isErr(n) ? n : isoWeek(n); }, 'ISOWEEKNUM(date)', 'Returns the ISO week number of the year.');

  const addMonths = (s, mo, eom) => {
    const n = ser(s); if (isErr(n)) return n; const k = toNum(mo); if (isErr(k)) return k; const p = ymd(n); const t = p.y * 12 + (p.m - 1) + Math.trunc(k); const ny = Math.floor(t / 12), nm = t % 12 + 1;
    if (ny < 1900) return E.NUM; const dm = dim(ny, nm);
    if (eom) return ny === 1900 && nm === 2 ? 60 : mkSerial(ny, nm, dm);
    return mkSerial(ny, nm, Math.min(p.d, D.daysInMonth(ny, nm)));
  };
  reg('EDATE', 2, 2, (s, m) => addMonths(s, m, false), 'EDATE(start_date, months)', 'Returns the date a number of months before or after a date.');
  reg('EOMONTH', 2, 2, (s, m) => addMonths(s, m, true), 'EOMONTH(start_date, months)', 'Returns the last day of the month before or after a date.');
  reg('DATEDIF', 3, 3, (a, b, u) => {
    const s = ser(a), e = ser(b); if (isErr(s)) return s; if (isErr(e)) return e; const unit = String(u).toUpperCase(); if (Math.floor(s) > Math.floor(e)) return E.NUM;
    const p = ymd(s), q = ymd(e); const months = (q.y - p.y) * 12 + (q.m - p.m) - (q.d < p.d ? 1 : 0);
    switch (unit) {
      case 'Y': return Math.floor(months / 12);
      case 'M': return months;
      case 'D': return Math.floor(e) - Math.floor(s);
      case 'MD': { if (q.d >= p.d) return q.d - p.d; const pm = q.m === 1 ? 12 : q.m - 1, py = q.m === 1 ? q.y - 1 : q.y; return q.d + D.daysInMonth(py, pm) - p.d; }
      case 'YM': return ((months % 12) + 12) % 12;
      case 'YD': { let st = mkSerial(q.y, p.m, p.d); if (isErr(st)) return st; if (st > Math.floor(e)) st = mkSerial(q.y - 1, p.m, p.d); return Math.floor(e) - st; }
    }
    return E.NUM;
  }, 'DATEDIF(start_date, end_date, unit)', 'Counts days, months or years between two dates (Y, M, D, MD, YM, YD).');
  reg('DAYS', 2, 2, (e, s) => { const a = ser(e), b = ser(s); if (isErr(a)) return a; if (isErr(b)) return b; return Math.floor(a) - Math.floor(b); }, 'DAYS(end_date, start_date)', 'Returns the number of days between two dates.');
  const days360 = (s, e, euro, full) => {
    const p = ymd(s), q = ymd(e); let d1 = p.d, d2 = q.d;
    if (euro) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; } else if (full) { if (lastFeb(Math.floor(s)) && lastFeb(Math.floor(e))) d2 = 30; if (lastFeb(Math.floor(s))) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; if (d1 === 31) d1 = 30; }
    else { if (d1 === 31 || lastFeb(Math.floor(s))) d1 = 30; if (d2 === 31 && d1 === 30) d2 = 30; }
    return (q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1);
  };
  reg('DAYS360', 2, 3, (a, b, m) => { const s = ser(a), e = ser(b); if (isErr(s)) return s; if (isErr(e)) return e; const eu = m === undefined ? false : F.toBool(m); if (isErr(eu)) return eu; return days360(s, e, eu, false); }, 'DAYS360(start_date, end_date, [method])', 'Days between dates on a 360-day year.');
  reg('YEARFRAC', 2, 3, (a, b, bs) => {
    let s = ser(a), e = ser(b); if (isErr(s)) return s; if (isErr(e)) return e; const basis = bs === undefined ? 0 : Math.trunc(toNum(bs)); if (isErr(basis)) return basis; if (basis < 0 || basis > 4 || isNaN(basis)) return E.NUM;
    s = Math.floor(s); e = Math.floor(e); if (s > e) [s, e] = [e, s]; if (s === e) return 0;
    if (basis === 0) return days360(s, e, false, true) / 360; if (basis === 4) return days360(s, e, true) / 360; if (basis === 2) return (e - s) / 360; if (basis === 3) return (e - s) / 365;
    const p = ymd(s), q = ymd(e); let denom;
    if (p.y === q.y) denom = D.isLeap(p.y) ? 366 : 365;
    else if (q.y === p.y + 1 && (q.m < p.m || (q.m === p.m && q.d <= p.d))) denom = (D.isLeap(p.y) && s <= mkSerial(p.y, 2, 29)) || (D.isLeap(q.y) && e >= mkSerial(q.y, 2, 29)) ? 366 : 365;
    else { let tot = 0; for (let y = p.y; y <= q.y; y++) tot += D.isLeap(y) ? 366 : 365; denom = tot / (q.y - p.y + 1); }
    return (e - s) / denom;
  }, 'YEARFRAC(start_date, end_date, [basis])', 'Returns the fraction of a year between two dates.');

  // ---- working days
  const WEEKEND = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6], 11: [0], 12: [1], 13: [2], 14: [3], 15: [4], 16: [5], 17: [6] };
  function maskOf(w) {
    const mask = [false, false, false, false, false, false, false];
    if (w === undefined || w === null) { mask[6] = mask[0] = true; return mask; }
    if (typeof w === 'string' && /^[01]{7}$/.test(w)) { for (let i = 0; i < 7; i++) if (w[i] === '1') mask[(i + 1) % 7] = true; return mask.every(Boolean) ? E.VALUE : mask; }
    const n = toNum(w); if (isErr(n)) return E.VALUE; const k = Math.trunc(n); if (!WEEKEND[k]) return E.NUM; for (const d of WEEKEND[k]) mask[d] = true; return mask;
  }
  function holidays(h) {
    const set = new Set(); if (h === undefined) return set;
    for (const v of F.flat(h)) { if (v == null) continue; if (isErr(v)) return v; const n = toNum(v); if (isErr(n)) return E.VALUE; set.add(Math.floor(n)); }
    return set;
  }
  function netDays(a, b, w, h) {
    let s = ser(a), e = ser(b); if (isErr(s)) return s; if (isErr(e)) return e; const mask = maskOf(w); if (isErr(mask)) return mask; const hs = holidays(h); if (isErr(hs)) return hs;
    s = Math.floor(s); e = Math.floor(e); let sign = 1; if (s > e) { [s, e] = [e, s]; sign = -1; }
    const wk = mask.filter((x) => !x).length; const total = e - s + 1; const full = Math.floor(total / 7); let count = full * wk;
    for (let d = s + full * 7; d <= e; d++) if (!mask[D.weekday(d)]) count++;
    for (const x of hs) if (x >= s && x <= e && !mask[D.weekday(x)]) count--;
    return sign * count;
  }
  function workDay(a, days, w, h) {
    const s = ser(a); if (isErr(s)) return s; const k = toNum(days); if (isErr(k)) return k; const mask = maskOf(w); if (isErr(mask)) return mask; const hs = holidays(h); if (isErr(hs)) return hs;
    if (mask.every(Boolean)) return E.VALUE; let d = Math.floor(s); let rem = Math.abs(Math.trunc(k)); const step = k < 0 ? -1 : 1; let guard = 0;
    while (rem > 0) { d += step; if (!mask[D.weekday(d)] && !hs.has(d)) rem--; if (++guard > 20000000 || d < 0) return E.NUM; }
    return d < 0 || d > MAXSERIAL ? E.NUM : d;
  }
  reg('NETWORKDAYS', 2, 3, (a, b, h) => netDays(a, b, undefined, h), 'NETWORKDAYS(start_date, end_date, [holidays])', 'Counts whole working days between two dates.', { raw: [2] });
  reg('NETWORKDAYS.INTL', 2, 4, (a, b, w, h) => netDays(a, b, w, h), 'NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])', 'Counts working days with custom weekend days.', { raw: [3] });
  reg('WORKDAY', 2, 3, (a, d, h) => workDay(a, d, undefined, h), 'WORKDAY(start_date, days, [holidays])', 'Returns the date a number of working days away.', { raw: [2] });
  reg('WORKDAY.INTL', 2, 4, (a, d, w, h) => workDay(a, d, w, h), 'WORKDAY.INTL(start_date, days, [weekend], [holidays])', 'Returns the working date with custom weekend days.', { raw: [3] });
})(typeof globalThis !== 'undefined' ? globalThis : this);
