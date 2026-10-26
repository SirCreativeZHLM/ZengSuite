/* ZC.ical — RFC 5545 parser/serializer, RRULE engine and occurrence expansion.
   Pure JS, no DOM; loads in the browser (window.ZC) and in node (globalThis.ZC) for the test harness.

   Event model (all fields always present):
   { id, uid, title, loc, notes, url, allDay, start, end, tz, endTz, rrule, exdates[], rdates[], overrides{key:patch},
     alarms[{m,rel?,abs?,action}], attendees[{name,email,role,partstat,rsvp}], organizer, categories[], travel, avail,
     color, status, created, modified, x[{n,p,v}] }
   start/end are wall strings in `tz` ("YYYY-MM-DDTHH:mm:ss"; all-day: "YYYY-MM-DD", end exclusive). tz is an IANA
   name, "UTC", "fixed:+0100" or "floating". An occurrence key is the original start wall string in the master's zone. */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const T = ZC.time || (typeof require !== 'undefined' ? (require('./zc-time.js'), ZC.time) : null);
  const DAY = T.DAY, pad = T.pad;
  const I = (ZC.ical = {});
  const PRODID = '-//ZengBot//ZengCalendar 0.1//EN';

  // ---------------------------------------------------------------- text layer
  I.escapeText = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
  I.unescapeText = (s) => String(s).replace(/\\([nN\\;,])|\\(.)/g, (m, a, b) => (a ? (a === 'n' || a === 'N' ? '\n' : a) : b));
  const splitUnescaped = (s, ch) => { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; } else if (s[i] === ch) { out.push(cur); cur = ''; } else cur += s[i]; } out.push(cur); return out; };
  const cpBytes = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);
  /** Fold one logical line to <=75 octets per physical line (never splitting a UTF-8 sequence). */
  I.fold = (line) => {
    let out = '', cur = '', bytes = 0, limit = 75;
    for (const ch of line) { const b = cpBytes(ch.codePointAt(0)); if (bytes + b > limit) { out += cur + '\r\n'; cur = ' '; bytes = 1; limit = 75; } cur += ch; bytes += b; }
    return out + cur + '\r\n';
  };
  I.unfold = (text) => String(text).replace(/^\uFEFF/, '').replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, '').split(/\r\n|\n|\r/);
  I.parseLine = (line) => {
    let i = 0; const n = line.length;
    while (i < n && line[i] !== ':' && line[i] !== ';') i++;
    const name = line.slice(0, i).toUpperCase(); const p = [];
    while (i < n && line[i] === ';') {
      i++; const s = i; let q = false;
      while (i < n) { const c = line[i]; if (c === '"') q = !q; else if (!q && (c === ':' || c === ';')) break; i++; }
      const seg = line.slice(s, i); const eq = seg.indexOf('='); if (eq > 0) p.push([seg.slice(0, eq).toUpperCase(), seg.slice(eq + 1)]);
    }
    if (line[i] !== ':' || !name) return null;
    return { n: name, p, v: line.slice(i + 1) };
  };
  const pget = (prop, k) => { const e = prop.p.find((x) => x[0] === k); return e ? e[1].replace(/^"|"$/g, '') : ''; };
  const qparam = (v) => { v = String(v).replace(/"/g, "'").replace(/[\u0000-\u001f]/g, ' '); return /[;:,]/.test(v) ? '"' + v + '"' : v; };
  const fmtProp = (n, p, v) => I.fold(n + p.map(([k, x]) => ';' + k + '=' + x).join('') + ':' + v);

  /** Lines -> component tree {name, props[], children[]}. Tolerates a truncated file. */
  I.parseTree = (text) => {
    const root = { name: 'ROOT', props: [], children: [] }; const stack = [root];
    for (const raw of I.unfold(text)) {
      if (!raw.trim()) continue; const pl = I.parseLine(raw); if (!pl) continue;
      if (pl.n === 'BEGIN') { const c = { name: pl.v.trim().toUpperCase(), props: [], children: [] }; stack[stack.length - 1].children.push(c); stack.push(c); }
      else if (pl.n === 'END') { if (stack.length > 1) stack.pop(); }
      else stack[stack.length - 1].props.push(pl);
    }
    return root;
  };

  // ---------------------------------------------------------------- values
  const durRe = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;
  I.parseDuration = (v) => { const m = durRe.exec(String(v).trim()); if (!m) return null; const s = (+(m[2] || 0) * 7 + +(m[3] || 0)) * 86400 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0); return m[1] === '-' ? -s : s; };
  I.fmtDuration = (sec) => {
    const neg = sec < 0; let s = Math.abs(Math.round(sec)); if (s === 0) return 'PT0S';
    let o = neg ? '-P' : 'P'; const d = Math.floor(s / 86400); s -= d * 86400; if (d) o += d + 'D';
    if (s) { o += 'T'; const h = Math.floor(s / 3600); s -= h * 3600; const mi = Math.floor(s / 60); s -= mi * 60; if (h) o += h + 'H'; if (mi) o += mi + 'M'; if (s) o += s + 'S'; }
    return o;
  };
  const icsDT = (w) => w.replace(/[-:]/g, ''); // wall string -> basic form
  const dtRe = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/i;
  const wallFrom = (m) => (m[4] == null ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`);

  const validIana = (id) => id && T.validZone(id);
  function resolveTz(tzid, vtz) {
    let id = String(tzid).replace(/^"|"$/g, '').trim(); if (!id) return 'floating';
    if (id.startsWith('/')) { const parts = id.split('/').filter(Boolean); for (const n of [2, 1]) { const c = parts.slice(-n).join('/'); if (validIana(c)) return c; } }
    if (/^(utc|gmt|z)$/i.test(id)) return 'UTC';
    if (validIana(id) && !/^[A-Z]{1,5}$/.test(id)) return id;
    if (T.WINDOWS[id] && validIana(T.WINDOWS[id])) return T.WINDOWS[id];
    const v = vtz && vtz[id]; if (v) { if (v.loc && validIana(v.loc)) return v.loc; if (v.fixed) return v.fixed; }
    if (validIana(id)) return id;
    return 'floating';
  }
  function collectVtz(root) {
    const map = {};
    for (const cal of root.children) for (const c of cal.children) if (c.name === 'VTIMEZONE') {
      const id = (c.props.find((p) => p.n === 'TZID') || {}).v; if (!id) continue; const loc = (c.props.find((p) => p.n === 'X-LIC-LOCATION') || {}).v;
      const sub = c.children.find((x) => x.name === 'STANDARD') || c.children[0]; let fixed = null;
      if (sub) { const to = (sub.props.find((p) => p.n === 'TZOFFSETTO') || {}).v; if (to && /^[+-]\d{4}(\d\d)?$/.test(to)) fixed = 'fixed:' + to.slice(0, 5); }
      map[id.replace(/^"|"$/g, '')] = { loc: loc && loc.trim(), fixed };
    }
    return map;
  }
  /** DTSTART/DTEND/EXDATE value -> {wall, tz, allDay} | null */
  function parseDT(prop, vtz) {
    const m = dtRe.exec(prop.v.trim()); if (!m) return null; const allDay = m[4] == null || pget(prop, 'VALUE').toUpperCase() === 'DATE';
    if (allDay) return { wall: `${m[1]}-${m[2]}-${m[3]}`, tz: 'floating', allDay: true };
    const tz = m[7] ? 'UTC' : pget(prop, 'TZID') ? resolveTz(pget(prop, 'TZID'), vtz) : 'floating';
    return { wall: wallFrom(m), tz, allDay: false };
  }
  // convert a wall string from zone a to zone b
  const convWall = (wall, a, b) => (a === b || wall.length === 10 ? wall : T.epochToWall(T.wallToEpoch(wall, a), b));

  // ---------------------------------------------------------------- RRULE
  const FREQS = ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']; const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ints = (v, lo, hi, nz) => v.split(',').map((x) => { const n = parseInt(x, 10); if (!isFinite(n) || n < lo || n > hi || (nz && n === 0)) throw new Error('bad ' + x); return n; });
  I.parseRRule = (str) => {
    try {
      const o = { freq: '', interval: 1, count: 0, until: '', byday: [], bymonthday: [], bymonth: [], byyearday: [], byweekno: [], bysetpos: [], byhour: [], byminute: [], bysecond: [], wkst: 'MO' };
      for (const part of String(str).split(';')) {
        if (!part) continue; const eq = part.indexOf('='); if (eq < 0) throw new Error('bad part'); const k = part.slice(0, eq).toUpperCase(), v = part.slice(eq + 1);
        switch (k) {
          case 'FREQ': if (!FREQS.includes(v.toUpperCase())) throw new Error('freq'); o.freq = v.toUpperCase(); break;
          case 'INTERVAL': o.interval = Math.max(1, parseInt(v, 10) || 1); break;
          case 'COUNT': o.count = Math.max(0, parseInt(v, 10) || 0); break;
          case 'UNTIL': if (!dtRe.test(v)) throw new Error('until'); o.until = v.toUpperCase(); break;
          case 'BYDAY': o.byday = v.split(',').map((x) => { const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim()); if (!m) throw new Error('byday'); return { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD.indexOf(m[2].toUpperCase()) }; }); break;
          case 'BYMONTHDAY': o.bymonthday = ints(v, -31, 31, true); break;
          case 'BYMONTH': o.bymonth = ints(v, 1, 12); break;
          case 'BYYEARDAY': o.byyearday = ints(v, -366, 366, true); break;
          case 'BYWEEKNO': o.byweekno = ints(v, -53, 53, true); break;
          case 'BYSETPOS': o.bysetpos = ints(v, -366, 366, true); break;
          case 'BYHOUR': o.byhour = ints(v, 0, 23); break;
          case 'BYMINUTE': o.byminute = ints(v, 0, 59); break;
          case 'BYSECOND': o.bysecond = ints(v, 0, 60); break;
          case 'WKST': if (!WD.includes(v.toUpperCase())) throw new Error('wkst'); o.wkst = v.toUpperCase(); break;
          default: break; // unknown parts dropped
        }
      }
      if (!o.freq) return null; return o;
    } catch { return null; }
  };
  I.stringifyRRule = (o) => {
    const p = ['FREQ=' + o.freq]; if (o.until) p.push('UNTIL=' + o.until); if (o.count) p.push('COUNT=' + o.count); if (o.interval > 1) p.push('INTERVAL=' + o.interval);
    if (o.bysecond.length) p.push('BYSECOND=' + o.bysecond.join(',')); if (o.byminute.length) p.push('BYMINUTE=' + o.byminute.join(',')); if (o.byhour.length) p.push('BYHOUR=' + o.byhour.join(','));
    if (o.byday.length) p.push('BYDAY=' + o.byday.map((d) => (d.n ? d.n : '') + WD[d.wd]).join(','));
    if (o.bymonthday.length) p.push('BYMONTHDAY=' + o.bymonthday.join(',')); if (o.byyearday.length) p.push('BYYEARDAY=' + o.byyearday.join(','));
    if (o.byweekno.length) p.push('BYWEEKNO=' + o.byweekno.join(',')); if (o.bymonth.length) p.push('BYMONTH=' + o.bymonth.join(',')); if (o.bysetpos.length) p.push('BYSETPOS=' + o.bysetpos.join(','));
    if (o.wkst !== 'MO') p.push('WKST=' + o.wkst); return p.join(';');
  };
  I.normRRule = (s) => { const o = I.parseRRule(s); return o ? I.stringifyRRule(o) : null; };
  const rrCache = new Map();
  const rrOf = (s) => { let r = rrCache.get(s); if (r === undefined) { r = I.parseRRule(s); rrCache.set(s, r); if (rrCache.size > 2000) rrCache.delete(rrCache.keys().next().value); } return r; };
  /** UNTIL string appropriate for the event (UTC for zoned timed events, date for all-day, floating for floating). */
  I.makeUntil = (ev, wall) => { // wall: wall string in ev.tz (inclusive last instant)
    if (ev.allDay) return icsDT(wall.slice(0, 10)); if (T.isFloating(ev.tz)) return icsDT(wall);
    return icsDT(T.epochToWall(T.wallToEpoch(wall, ev.tz), 'UTC')) + 'Z';
  };

  // ---------------------------------------------------------------- expansion
  const baseCache = new WeakMap();
  /** cached timing facts of the master event */
  I.base = (ev) => {
    const k = ev.start + '|' + ev.end + '|' + ev.tz + '|' + ev.endTz + '|' + ev.allDay;
    let b = baseCache.get(ev); if (b && b.k === k) return b;
    if (ev.allDay) {
      const sd = T.dayNum(+ev.start.slice(0, 4), +ev.start.slice(5, 7), +ev.start.slice(8, 10)); let ed = ev.end && ev.end.length >= 10 ? T.dayNum(+ev.end.slice(0, 4), +ev.end.slice(5, 7), +ev.end.slice(8, 10)) : sd + 1; if (ed <= sd) ed = sd + 1;
      b = { k, allDay: true, sday: sd, span: ed - sd, sod0: 0, s: localMid(sd), e: localMid(ed), d: 0 };
    } else {
      const s = T.wallToEpoch(ev.start, ev.tz); let e = ev.end ? T.wallToEpoch(ev.end, ev.endTz || ev.tz) : s; if (!(e >= s)) e = s;
      const w = T.parseWall(ev.start); b = { k, allDay: false, sday: T.dayNum(w.y, w.m, w.d), sod0: w.H * 3600 + w.M * 60 + w.S, s, e, d: e - s, span: 0 };
    }
    baseCache.set(ev, b); return b;
  };
  const localMid = (dn) => T.wToEpoch(dn * DAY, 'floating');
  const isRecurring = (ev) => !!(ev.rrule || (ev.rdates && ev.rdates.length));
  I.isRecurring = isRecurring;
  const wallOfDay = (dn, sod, date) => T.wToWall(dn * DAY + sod * 1000, date);

  function untilW(ev, rr) {
    if (!rr.until) return Infinity; const m = dtRe.exec(rr.until); if (!m) return Infinity;
    if (ev.allDay) return T.dayNum(+m[1], +m[2], +m[3]) * DAY;
    if (m[4] == null) return T.dayNum(+m[1], +m[2], +m[3]) * DAY + DAY - 1;
    const w = T.wallToW(wallFrom(m)); if (m[7]) return w + T.offset(w, ev.tz); return w;
  }
  const weekNoOf = (n, wkstIdx) => { // week number of day n within its (week-)year, weeks start on wkstIdx, week 1 has >=4 days
    const c = T.civil(n); const thu = n + ((wkstIdx + 3 - T.dow(n) + 7) % 7) - ((wkstIdx + 3) % 7 >= T.dow(n) ? 0 : 0);
    void thu; const jan4 = T.dayNum(c.y, 1, 4); const ws = (d) => d - ((T.dow(d) - wkstIdx + 7) % 7);
    let y = c.y; let w1 = ws(jan4); if (n < w1) { y--; w1 = ws(T.dayNum(y, 1, 4)); } else { const nx = ws(T.dayNum(c.y + 1, 1, 4)); if (n >= nx) { y = c.y + 1; w1 = nx; } }
    const wn = Math.floor((n - w1) / 7) + 1; const wy = Math.floor((ws(T.dayNum(y + 1, 1, 4)) - w1) / 7); return { wn, total: wy };
  };

  /** Calls cb(dayNum, secOfDay) for every rule occurrence with dayNum in [fromDay,toDay] (inclusive), in order. */
  function genWall(ev, rr, b, fromDay, toDay, cb) {
    const freq = rr.freq, iv = rr.interval, dn0 = b.sday, sod0 = b.sod0, c0 = T.civil(dn0);
    const until = untilW(ev, rr); const maxN = rr.count || Infinity; let n = 0;
    const take = (dn, sod) => { if (dn * DAY + sod * 1000 > until) return false; if (++n > maxN) return false; if (dn >= fromDay && dn <= toDay) cb(dn, sod); return true; };
    if (!take(dn0, sod0)) return;
    const wk = WD.indexOf(rr.wkst);
    if (freq === 'HOURLY' || freq === 'MINUTELY' || freq === 'SECONDLY') {
      const step = iv * (freq === 'HOURLY' ? 3600 : freq === 'MINUTELY' ? 60 : 1) * 1000; const W0 = dn0 * DAY + sod0 * 1000; let k0 = 1;
      if (!rr.count) k0 = Math.max(1, Math.floor((fromDay * DAY - W0) / step) - 1);
      for (let k = k0, guard = 0; guard < 400000; k++, guard++) {
        const W = W0 + k * step; const dn = Math.floor(W / DAY); if (dn > toDay) break; if (W > until) break;
        const sod = Math.round((W - dn * DAY) / 1000); const c = T.civil(dn);
        if (rr.bymonth.length && !rr.bymonth.includes(c.m)) continue;
        if (rr.bymonthday.length && !rr.bymonthday.some((x) => (x > 0 ? x === c.d : T.dim(c.y, c.m) + 1 + x === c.d))) continue;
        if (rr.byday.length && !rr.byday.some((x) => x.wd === T.dow(dn))) continue;
        if (rr.byhour.length && !rr.byhour.includes(Math.floor(sod / 3600))) continue;
        if (rr.byminute.length && !rr.byminute.includes(Math.floor((sod % 3600) / 60))) continue;
        if (rr.bysecond.length && !rr.bysecond.includes(sod % 60)) continue;
        if (++n > maxN) return; if (dn >= fromDay) cb(dn, sod);
      }
      return;
    }
    const hasBM = rr.bymonth.length > 0, hasMD = rr.bymonthday.length > 0, hasYD = rr.byyearday.length > 0, hasWN = rr.byweekno.length > 0, hasBD = rr.byday.length > 0;
    let defWd = -1, defMd = 0, defM = 0;
    if (freq === 'WEEKLY' && !hasBD) defWd = T.dow(dn0);
    if (freq === 'MONTHLY' && !hasBD && !hasMD && !hasYD) defMd = c0.d;
    if (freq === 'YEARLY') {
      if (!hasBM && !hasYD && !hasWN && (hasMD || !hasBD)) defM = c0.m;
      if (!hasMD && !hasBD && !hasYD && !hasWN) defMd = c0.d;
      if (hasWN && !hasBD && !hasMD && !hasYD) defWd = T.dow(dn0);
    }
    const hrs = rr.byhour.length ? rr.byhour : [Math.floor(sod0 / 3600)], mins = rr.byminute.length ? rr.byminute : [Math.floor((sod0 % 3600) / 60)], secs = rr.bysecond.length ? rr.bysecond : [sod0 % 60];
    const sods = []; if (b.allDay) sods.push(0); else for (const h of hrs) for (const mi of mins) for (const s of secs) sods.push(h * 3600 + mi * 60 + s); sods.sort((a, c) => a - c);
    const monthScope = freq === 'MONTHLY' || (freq === 'YEARLY' && hasBM);
    const dayOk = (nn, y, m, d) => {
      if (hasBM && !rr.bymonth.includes(m)) return false; if (defM && m !== defM) return false;
      if (hasMD) { const dm = T.dim(y, m); if (!rr.bymonthday.some((x) => (x > 0 ? x === d : dm + 1 + x === d))) return false; }
      if (defMd && d !== defMd) return false;
      const dw = T.dow(nn);
      if (hasYD) { const doy = nn - T.dayNum(y, 1, 1) + 1, len = T.isLeap(y) ? 366 : 365; if (!rr.byyearday.some((x) => (x > 0 ? x === doy : len + 1 + x === doy))) return false; }
      if (hasWN) { const w = weekNoOf(nn, wk); if (!rr.byweekno.some((x) => (x > 0 ? x === w.wn : w.total + 1 + x === w.wn))) return false; }
      if (defWd >= 0 && dw !== defWd) return false;
      if (hasBD) {
        let ok = false;
        for (const e of rr.byday) {
          if (e.wd !== dw) continue; if (!e.n || (freq !== 'MONTHLY' && freq !== 'YEARLY')) { ok = true; break; }
          let pos, len; if (monthScope) { pos = d; len = T.dim(y, m); } else { pos = nn - T.dayNum(y, 1, 1) + 1; len = T.isLeap(y) ? 366 : 365; }
          if (e.n === Math.floor((pos - 1) / 7) + 1 || e.n === -(Math.floor((len - pos) / 7) + 1)) { ok = true; break; }
        }
        if (!ok) return false;
      }
      return true;
    };
    // period skipping
    let k0 = 0; const f = T.civil(Math.max(fromDay, dn0));
    if (!rr.count && fromDay > dn0) {
      if (freq === 'DAILY') k0 = Math.floor((fromDay - dn0) / iv) - 1;
      else if (freq === 'WEEKLY') { const ws0 = dn0 - ((T.dow(dn0) - wk + 7) % 7); k0 = Math.floor((fromDay - ws0) / (7 * iv)) - 1; }
      else if (freq === 'MONTHLY') k0 = Math.floor((f.y * 12 + f.m - (c0.y * 12 + c0.m)) / iv) - 1;
      else k0 = Math.floor((f.y - c0.y) / iv) - 1; k0 = Math.max(0, k0);
    }
    const ws0 = dn0 - ((T.dow(dn0) - wk + 7) % 7);
    for (let k = k0, guard = 0; guard < 300000; k++, guard++) {
      const days = []; let pStart;
      if (freq === 'DAILY') { const nn = dn0 + k * iv; pStart = nn; const c = T.civil(nn); days.push([nn, c.y, c.m, c.d]); }
      else if (freq === 'WEEKLY') { const w = ws0 + 7 * iv * k; pStart = w; for (let i = 0; i < 7; i++) { const c = T.civil(w + i); days.push([w + i, c.y, c.m, c.d]); } }
      else if (freq === 'MONTHLY') { const mi = c0.y * 12 + (c0.m - 1) + k * iv; const y = Math.floor(mi / 12), m = (mi % 12) + 1; const first = T.dayNum(y, m, 1); pStart = first; const dm = T.dim(y, m); for (let d = 1; d <= dm; d++) days.push([first + d - 1, y, m, d]); }
      else { const y = c0.y + k * iv; const first = T.dayNum(y, 1, 1); pStart = first; for (let m = 1; m <= 12; m++) { const dm = T.dim(y, m), fm = T.dayNum(y, m, 1); for (let d = 1; d <= dm; d++) days.push([fm + d - 1, y, m, d]); } }
      if (pStart > toDay) break; if (pStart * DAY > until) break;
      let cands = [];
      for (const [nn, y, m, d] of days) if (dayOk(nn, y, m, d)) for (const s of sods) cands.push([nn, s]);
      if (rr.bysetpos.length && cands.length) { const pick = []; for (const sp of rr.bysetpos) { const idx = sp > 0 ? sp - 1 : cands.length + sp; if (idx >= 0 && idx < cands.length) pick.push(idx); } cands = [...new Set(pick)].sort((a, c) => a - c).map((i) => cands[i]); }
      for (const [nn, s] of cands) { if (nn < dn0 || (nn === dn0 && s <= sod0)) continue; if (!take(nn, s)) return; }
    }
  }

  const FIELDS = ['title', 'loc', 'notes', 'url', 'allDay', 'start', 'end', 'tz', 'endTz', 'categories', 'attendees', 'organizer', 'alarms', 'travel', 'avail', 'color', 'status'];
  I.FIELDS = FIELDS;
  /** occurrence field with override applied */
  I.F = (o, k) => (o.ov && k in o.ov ? o.ov[k] : o.ev[k]);
  I.merged = (o) => { const m = Object.assign({}, o.ev); if (o.ov) Object.assign(m, o.ov); m.start = o.wallStart; m.end = o.wallEnd; m.tz = o.tz; m.endTz = o.endTz; m.allDay = o.allDay; return m; };

  function mkOcc(ev, key, b, ov, s0) {
    // timing from master start wall `key`
    let allDay = ev.allDay, tz = ev.tz, endTz = ev.endTz, ws = key, we, s, e;
    const dur = b.allDay ? b.span : b.d;
    const keyDay = (() => { const w = T.parseWall(key); return T.dayNum(w.y, w.m, w.d); })();
    if (ov && ('start' in ov || 'end' in ov || 'allDay' in ov || 'tz' in ov || 'endTz' in ov)) {
      allDay = 'allDay' in ov ? ov.allDay : allDay; tz = 'tz' in ov ? ov.tz : tz; endTz = 'endTz' in ov ? ov.endTz : endTz; ws = 'start' in ov ? ov.start : key;
      if (allDay) { const sd = T.dayNum(+ws.slice(0, 4), +ws.slice(5, 7), +ws.slice(8, 10)); const ed = ov.end ? T.dayNum(+ov.end.slice(0, 4), +ov.end.slice(5, 7), +ov.end.slice(8, 10)) : sd + (b.allDay ? b.span : 1); s = localMid(sd); e = localMid(Math.max(sd + 1, ed)); we = T.dayNum && ov.end ? ov.end : T.dateStr(Math.max(sd + 1, ed)); ws = ws.slice(0, 10); }
      else { s = T.wallToEpoch(ws, tz); if (ov.end) { we = ov.end; e = T.wallToEpoch(we, endTz || tz); } else { e = s + (b.allDay ? DAY : b.d); we = T.epochToWall(e, endTz || tz); } if (e < s) e = s; }
    } else if (b.allDay) { s = localMid(keyDay); e = localMid(keyDay + b.span); we = T.dateStr(keyDay + b.span); }
    else { s = s0 != null ? s0 : T.wallToEpoch(key, tz); e = s + dur; we = T.epochToWall(e, endTz || tz); }
    void dur;
    return { ev, key, id: ev.id + '|' + key, s, e, allDay, tz, endTz, wallStart: ws, wallEnd: we, ov: ov || null };
  }
  I.occurrenceAt = (ev, key) => mkOcc(ev, key, I.base(ev), ev.overrides && ev.overrides[key]);

  /** Push every occurrence of `ev` overlapping [from,to) (epoch ms) onto `out`. */
  I.expand = (ev, from, to, out) => {
    const b = I.base(ev);
    if (!isRecurring(ev)) {
      if (b.s < to && (b.e > from || (b.e === b.s && b.s >= from))) out.push({ ev, key: ev.start, id: ev.id + '|' + ev.start, s: b.s, e: b.e, allDay: ev.allDay, tz: ev.tz, endTz: ev.endTz, wallStart: ev.start, wallEnd: ev.end, ov: null });
      return out;
    }
    const rr = ev.rrule ? rrOf(ev.rrule) : null; const ov = ev.overrides || {}; const hasOv = Object.keys(ov).length > 0;
    const ex = ev.exdates && ev.exdates.length ? new Set(ev.exdates) : null; const seen = new Set();
    const tz = ev.allDay ? 'floating' : ev.tz;
    const lead = (b.allDay ? b.span * DAY : b.d) + 2 * DAY; // wall/epoch skew + duration
    const fromDay = Math.floor((from - lead + T.offset(from, tz)) / DAY), toDay = Math.floor((to + DAY + T.offset(to, tz)) / DAY);
    const emit = (key, dn, sod) => {
      if (seen.has(key)) return; seen.add(key); if (ex && (ex.has(key) || ex.has(key.slice(0, 10)))) return; if (hasOv && ov[key]) return;
      const o = mkOcc(ev, key, b, null); if (o.s < to && (o.e > from || (o.e === o.s && o.s >= from))) out.push(o);
    };
    if (rr) genWall(ev, rr, b, fromDay, toDay, (dn, sod) => emit(wallOfDay(dn, sod, b.allDay), dn, sod));
    else emit(ev.start, b.sday, b.sod0);
    if (ev.rdates) for (const rd of ev.rdates) { const key = b.allDay ? rd.slice(0, 10) : rd; if (!seen.has(key)) { const w = T.parseWall(key); if (!w) continue; const dn = T.dayNum(w.y, w.m, w.d); if (dn >= fromDay && dn <= toDay) emit(key, dn, 0); } }
    if (hasOv) for (const key in ov) { if (ex && ex.has(key)) continue; const o = mkOcc(ev, key, b, ov[key]); if (o.s < to && (o.e > from || (o.e === o.s && o.s >= from))) out.push(o); }
    return out;
  };
  /** list occurrence keys (wall strings) in order, up to `limit`, from the start of the series until `toEpoch` */
  I.keys = (ev, toEpoch, limit = 100000) => {
    const out = []; const b = I.base(ev); if (!isRecurring(ev)) return [ev.start]; const rr = ev.rrule ? rrOf(ev.rrule) : null; const ex = ev.exdates && new Set(ev.exdates);
    const toDay = Math.floor((toEpoch + T.offset(toEpoch, ev.allDay ? 'floating' : ev.tz)) / DAY);
    if (rr) genWall(ev, rr, b, -1e9, toDay, (dn, sod) => { const k = wallOfDay(dn, sod, b.allDay); if (!(ex && (ex.has(k) || ex.has(k.slice(0, 10)))) && out.length < limit) out.push(k); }); else out.push(ev.start);
    return out;
  };
  /** number of rule occurrences strictly before `key` (used when splitting a COUNT-limited series) */
  I.countBefore = (ev, key) => { const rr = rrOf(ev.rrule); if (!rr) return 0; const b = I.base(ev); const kw = T.wallToW(key); let c = 0; const kd = Math.floor(kw / DAY); genWall(ev, Object.assign({}, rr, { count: 0, until: '' }), b, -1e9, kd, (dn, sod) => { if (dn * DAY + sod * 1000 < kw) c++; }); return c; };
  I.hasRule = (ev) => !!(ev.rrule && rrOf(ev.rrule));
  I.ruleOf = (ev) => (ev.rrule ? rrOf(ev.rrule) : null);

  // ---------------------------------------------------------------- model
  let uidSeq = 0;
  I.uid = () => { uidSeq++; return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + uidSeq.toString(36) + '@zengcalendar'; };
  I.newEvent = (p) => Object.assign({ id: '', uid: '', title: '', loc: '', notes: '', url: '', allDay: false, start: '', end: '', tz: 'floating', endTz: '', rrule: '', exdates: [], rdates: [], overrides: {}, alarms: [], attendees: [], organizer: null, categories: [], travel: 0, avail: 'busy', color: '', status: '', created: 0, modified: 0, x: [] }, p || {});
  I.clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------------------------------------------------------------- parse
  const calAddr = (prop) => { let v = prop.v.trim(); const email = /^mailto:/i.test(v) ? v.slice(7) : /^invalid:nomail$/i.test(v) ? '' : v; const o = { name: pget(prop, 'CN'), email }; for (const [k, key] of [['ROLE', 'role'], ['PARTSTAT', 'partstat'], ['RSVP', 'rsvp'], ['CUTYPE', 'cutype']]) { const x = pget(prop, k); if (x) o[key] = x; } return o; };
  const utcToMs = (v) => { const m = dtRe.exec(v.trim()); if (!m) return 0; const w = wallFrom(m); return m[7] || m[4] != null ? T.wallToEpoch(w.length === 10 ? w + 'T00:00:00' : w, m[7] ? 'UTC' : 'floating') : T.wallToEpoch(w + 'T00:00:00', 'UTC'); };
  const KNOWN = new Set(['UID', 'DTSTAMP', 'SEQUENCE', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'URL', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'EXDATE', 'RDATE', 'CATEGORIES', 'TRANSP', 'STATUS', 'ATTENDEE', 'ORGANIZER', 'CREATED', 'LAST-MODIFIED', 'RECURRENCE-ID', 'X-ZENG-COLOR', 'X-APPLE-TRAVEL-DURATION', 'X-MICROSOFT-CDO-BUSYSTATUS']);
  const CSS_COLORS = { red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', blue: '#007aff', purple: '#af52de', pink: '#ff2d55', brown: '#a2845e', gray: '#8e8e93', grey: '#8e8e93' };
  function parseAlarm(c) {
    const trig = c.props.find((p) => p.n === 'TRIGGER'); if (!trig) return null; const a = { m: 0, action: ((c.props.find((p) => p.n === 'ACTION') || {}).v || 'DISPLAY').toUpperCase() };
    if (pget(trig, 'VALUE').toUpperCase() === 'DATE-TIME') { const ms = utcToMs(trig.v); if (!ms) return null; a.abs = ms; a.m = 0; }
    else { const s = I.parseDuration(trig.v); if (s == null) return null; a.m = Math.round(-s / 60); if (pget(trig, 'RELATED').toUpperCase() === 'END') a.rel = 'END'; }
    return a;
  }
  function parseVEvent(c, vtz, warn) {
    const P = {}, multi = { EXDATE: [], RDATE: [], ATTENDEE: [], CATEGORIES: [] }; const x = [];
    for (const p of c.props) { if (multi[p.n]) multi[p.n].push(p); else if (!(p.n in P)) P[p.n] = p; if (!KNOWN.has(p.n) && !(p.n === 'X-ZENG-COLOR') ) x.push({ n: p.n, p: p.p, v: p.v }); }
    const ds = P.DTSTART && parseDT(P.DTSTART, vtz); if (!ds) { warn.push('Skipped an event without a valid DTSTART' + (P.SUMMARY ? ' (' + P.SUMMARY.v + ')' : '')); return null; }
    const ev = I.newEvent({ allDay: ds.allDay, tz: ds.tz, start: ds.wall });
    ev.uid = P.UID ? P.UID.v.trim() : I.uid(); ev.id = ev.uid;
    let end = null; if (P.DTEND) end = parseDT(P.DTEND, vtz);
    if (end) { ev.end = end.wall; if (!ds.allDay) { if (end.allDay) ev.end = end.wall + 'T00:00:00'; if (end.tz !== ds.tz) ev.endTz = end.tz; } else if (end.wall <= ev.start) ev.end = T.addDays(ev.start, 1); else if (!end.allDay) ev.end = end.wall.slice(0, 10); }
    else if (P.DURATION && I.parseDuration(P.DURATION.v) != null) { const sec = I.parseDuration(P.DURATION.v); ev.end = ds.allDay ? T.addDays(ev.start, Math.max(1, Math.round(sec / 86400))) : T.addWall(ev.start, sec * 1000); }
    else ev.end = ds.allDay ? T.addDays(ev.start, 1) : ev.start;
    if (ev.endTz === ev.tz) ev.endTz = '';
    if (ev.allDay) ev.tz = 'floating';
    const txt = (k) => (P[k] ? I.unescapeText(P[k].v) : '');
    ev.title = txt('SUMMARY'); ev.notes = txt('DESCRIPTION'); ev.loc = txt('LOCATION'); ev.url = P.URL ? P.URL.v.trim() : ''; ev.status = P.STATUS ? P.STATUS.v.trim().toUpperCase() : '';
    ev.sequence = P.SEQUENCE ? parseInt(P.SEQUENCE.v, 10) || 0 : 0; if (!ev.sequence) delete ev.sequence;
    if (P.CREATED) ev.created = utcToMs(P.CREATED.v); if (P['LAST-MODIFIED']) ev.modified = utcToMs(P['LAST-MODIFIED'].v);
    ev.categories = multi.CATEGORIES.flatMap((p) => splitUnescaped(p.v, ',').map((s) => I.unescapeText(s).trim()).filter(Boolean));
    ev.attendees = multi.ATTENDEE.map(calAddr); ev.organizer = P.ORGANIZER ? calAddr(P.ORGANIZER) : null;
    const busy = P['X-MICROSOFT-CDO-BUSYSTATUS'] ? P['X-MICROSOFT-CDO-BUSYSTATUS'].v.trim().toUpperCase() : '';
    ev.avail = busy === 'TENTATIVE' ? 'tentative' : busy === 'OOF' ? 'oof' : busy === 'FREE' ? 'free' : P.TRANSP && P.TRANSP.v.trim().toUpperCase() === 'TRANSPARENT' ? 'free' : 'busy';
    if (ev.status === 'TENTATIVE' && ev.avail === 'busy') ev.avail = 'tentative';
    if (P['X-APPLE-TRAVEL-DURATION']) { const s = I.parseDuration(P['X-APPLE-TRAVEL-DURATION'].v); if (s > 0) ev.travel = Math.round(s / 60); }
    const col = (P['X-ZENG-COLOR'] || {}).v; if (col && /^#[0-9a-f]{6}$/i.test(col.trim())) ev.color = col.trim().toLowerCase();
    ev.alarms = c.children.filter((k) => k.name === 'VALARM').map(parseAlarm).filter(Boolean);
    const toKey = (prop) => { const d = parseDT(prop, vtz); if (!d) return null; if (ev.allDay) return d.wall.slice(0, 10); if (d.allDay) return d.wall; return convWall(d.wall, d.tz, ev.tz); };
    if (P.RRULE) { const n = I.normRRule(P.RRULE.v); if (n) ev.rrule = n; else { warn.push('Unsupported RRULE ignored: ' + P.RRULE.v); x.push({ n: 'RRULE', p: [], v: P.RRULE.v }); } }
    for (const p of multi.EXDATE) for (const v of p.v.split(',')) { const k = toKey({ n: p.n, p: p.p, v }); if (k && !ev.exdates.includes(k)) ev.exdates.push(k); }
    for (const p of multi.RDATE) { if (pget(p, 'VALUE').toUpperCase() === 'PERIOD') { x.push({ n: 'RDATE', p: p.p, v: p.v }); continue; } for (const v of p.v.split(',')) { const k = toKey({ n: p.n, p: p.p, v }); if (k && !ev.rdates.includes(k)) ev.rdates.push(k); } }
    ev.x = x;
    ev._recId = P['RECURRENCE-ID'] ? toKey(P['RECURRENCE-ID']) : null; return ev;
  }
  /** Parse an iCalendar document. Returns {events, name, color, warnings}. */
  I.parse = (text) => {
    const root = I.parseTree(text); const warnings = []; const vtz = collectVtz(root); const out = { events: [], name: '', color: '', warnings };
    const cals = root.children.filter((c) => c.name === 'VCALENDAR'); if (!cals.length) throw new Error('This file is not an iCalendar (.ics) file.');
    const masters = new Map(), children = [];
    for (const cal of cals) {
      const gp = (n) => (cal.props.find((p) => p.n === n) || {}).v; if (!out.name && gp('X-WR-CALNAME')) out.name = I.unescapeText(gp('X-WR-CALNAME')); const cc = gp('X-APPLE-CALENDAR-COLOR') || gp('COLOR') || '';
      if (!out.color && cc) out.color = /^#[0-9a-f]{6}/i.test(cc) ? cc.slice(0, 7).toLowerCase() : CSS_COLORS[cc.toLowerCase()] || '';
      for (const c of cal.children) if (c.name === 'VEVENT') { const ev = parseVEvent(c, vtz, warnings); if (!ev) continue; if (ev._recId) children.push(ev); else { delete ev._recId; if (masters.has(ev.uid)) { ev.uid = I.uid(); ev.id = ev.uid; } masters.set(ev.uid, ev); out.events.push(ev); } }
    }
    for (const ch of children) {
      const m = masters.get(ch.uid); const key = ch._recId; delete ch._recId;
      if (!m || !isRecurring(m)) { ch.id = ch.uid + '#' + key; ch.uid = ch.uid; out.events.push(ch); continue; }
      const base = I.occurrenceAt(m, key); const patch = {};
      for (const f of FIELDS) { if (f === 'start' || f === 'end') continue; if (JSON.stringify(ch[f]) !== JSON.stringify(m[f])) patch[f] = ch[f]; }
      if (ch.start !== base.wallStart || 'tz' in patch || 'allDay' in patch) patch.start = ch.start;
      if (ch.end !== base.wallEnd || 'start' in patch) patch.end = ch.end;
      if (patch.start === base.wallStart && patch.end === base.wallEnd && !('tz' in patch) && !('endTz' in patch) && !('allDay' in patch)) { delete patch.start; delete patch.end; }
      m.overrides[key] = Object.fromEntries(FIELDS.filter((f) => f in patch).map((f) => [f, patch[f]]));
    }
    return out;
  };

  // ---------------------------------------------------------------- serialize
  const dtSpec = (tz, allDay) => (allDay ? { p: [['VALUE', 'DATE']], z: '' } : tz === 'UTC' ? { p: [], z: 'Z' } : T.isFloating(tz) ? { p: [], z: '' } : { p: [['TZID', tzidFor(tz)]], z: '' });
  const fmtDTProp = (name, wall, tz, allDay) => { const d = allDay || wall.length === 10; const sp = dtSpec(tz, d); return fmtProp(name, sp.p, icsDT(d ? wall.slice(0, 10) : wall) + sp.z); };
  const fmtDTList = (name, walls, tz, allDay) => { const sp = dtSpec(tz, allDay); return fmtProp(name, sp.p, walls.map((w) => icsDT(allDay ? w.slice(0, 10) : w) + sp.z).join(',')); };
  const tzidFor = (tz) => (/^fixed:/.test(tz) ? 'GMT' + tz.slice(6) : /[;:,]/.test(tz) ? '"' + tz + '"' : tz);
  const utcStamp = (ms) => icsDT(T.epochToWall(ms, 'UTC')) + 'Z';
  const offStr = (ms) => { const s = ms < 0 ? '-' : '+'; const m = Math.round(Math.abs(ms) / 60000); return s + pad(Math.floor(m / 60)) + pad(m % 60); };
  /** VTIMEZONE built from Intl transitions in [y0,y1] (explicit RDATE lists; valid per RFC 5545 3.6.5). */
  I.vtimezone = (tz, y0, y1) => {
    const lines = ['BEGIN:VTIMEZONE', 'TZID:' + tzidFor(tz)]; const start = Date.UTC(y0, 0, 1), end = Date.UTC(y1 + 1, 0, 1); const step = 7 * DAY / 1; const trans = [];
    let prev = T.offset(start, tz), pt = start;
    for (let t = start + step; t <= end + step; t += step) { const o = T.offset(t, tz); if (o !== prev) { let lo = pt, hi = t; while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (T.offset(mid, tz) === prev) lo = mid; else hi = mid; } trans.push({ at: hi, from: prev, to: o }); prev = o; } pt = t; }
    const sec = (kind, from, to, list, name) => { lines.push('BEGIN:' + kind); lines.push(...[fmtProp('DTSTART', [], icsDT(T.epochToWall(list[0] + from, 'UTC'))).trimEnd()]); lines.push('TZOFFSETFROM:' + offStr(from), 'TZOFFSETTO:' + offStr(to)); lines.push(I.fold('TZNAME:' + I.escapeText(name)).trimEnd()); for (const t of list.slice(1)) lines.push('RDATE:' + icsDT(T.epochToWall(t + from, 'UTC'))); lines.push('END:' + kind); };
    if (!trans.length) { const o = T.offset(start, tz); lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + offStr(o), 'TZOFFSETTO:' + offStr(o), I.fold('TZNAME:' + I.escapeText(T.zoneAbbr(start, tz))).trimEnd(), 'END:STANDARD'); }
    else { const groups = new Map(); for (const t of trans) { const k = t.from + '>' + t.to; if (!groups.has(k)) groups.set(k, { from: t.from, to: t.to, list: [] }); groups.get(k).list.push(t.at); }
      for (const gr of groups.values()) sec(gr.to > gr.from ? 'DAYLIGHT' : 'STANDARD', gr.from, gr.to, gr.list, T.zoneAbbr(gr.list[0] + 1000, tz)); }
    lines.push('END:VTIMEZONE'); return lines.map((l) => l.replace(/\r?\n$/, '')).join('\r\n') + '\r\n';
  };
  const alarmLines = (a, title) => {
    const l = ['BEGIN:VALARM', 'ACTION:' + (a.action || 'DISPLAY')];
    l.push(a.abs ? 'TRIGGER;VALUE=DATE-TIME:' + utcStamp(a.abs) : fmtProp('TRIGGER', a.rel === 'END' ? [['RELATED', 'END']] : [], I.fmtDuration(-a.m * 60)).trimEnd());
    l.push(I.fold('DESCRIPTION:' + I.escapeText(title || 'Reminder')).trimEnd(), 'END:VALARM'); return l.join('\r\n') + '\r\n';
  };
  const addrLine = (name, a) => { const p = []; if (a.name) p.push(['CN', qparam(a.name)]); if (name === 'ATTENDEE') { if (a.cutype) p.push(['CUTYPE', qparam(a.cutype)]); if (a.role) p.push(['ROLE', qparam(a.role)]); if (a.partstat) p.push(['PARTSTAT', qparam(a.partstat)]); if (a.rsvp) p.push(['RSVP', qparam(a.rsvp)]); } return fmtProp(name, p, a.email ? 'mailto:' + a.email : 'invalid:nomail'); };
  function veventLines(ev, now, patch, key) {
    const m = patch ? Object.assign({}, ev, patch) : ev; let o = 'BEGIN:VEVENT\r\n';
    let start = m.start, end = m.end, tz = m.allDay ? 'floating' : m.tz, endTz = m.endTz;
    if (patch) { const oc = I.occurrenceAt(ev, key); start = oc.wallStart; end = oc.wallEnd; tz = oc.allDay ? 'floating' : oc.tz; endTz = oc.endTz; m.allDay = oc.allDay; }
    o += fmtProp('UID', [], String(ev.uid || ev.id).replace(/[\r\n]/g, '')); o += 'DTSTAMP:' + utcStamp(ev.modified || ev.created || now) + '\r\n';
    if (ev.created) o += 'CREATED:' + utcStamp(ev.created) + '\r\n'; if (ev.modified) o += 'LAST-MODIFIED:' + utcStamp(ev.modified) + '\r\n'; if (ev.sequence) o += 'SEQUENCE:' + ev.sequence + '\r\n';
    if (patch) o += fmtDTProp('RECURRENCE-ID', key, ev.tz, ev.allDay);
    o += fmtDTProp('DTSTART', start, tz, m.allDay);
    if (end && (end !== start || m.allDay)) o += fmtDTProp('DTEND', end, m.allDay ? 'floating' : endTz || tz, m.allDay);
    if (!patch) {
      if (ev.rrule) o += fmtProp('RRULE', [], ev.rrule);
      if (ev.exdates.length) { const dates = ev.exdates.filter((d) => d.length === 10 || ev.allDay), tims = ev.exdates.filter((d) => d.length > 10 && !ev.allDay); if (dates.length) o += fmtDTList('EXDATE', dates, 'floating', true); if (tims.length) o += fmtDTList('EXDATE', tims, tz, false); }
      if (ev.rdates.length) o += fmtDTList('RDATE', ev.rdates, tz, !!ev.allDay);
    }
    o += fmtProp('SUMMARY', [], I.escapeText(m.title));
    if (m.loc) o += fmtProp('LOCATION', [], I.escapeText(m.loc)); if (m.notes) o += fmtProp('DESCRIPTION', [], I.escapeText(m.notes)); if (m.url) o += fmtProp('URL', [], m.url.replace(/[\r\n]/g, ''));
    if (m.categories.length) o += fmtProp('CATEGORIES', [], m.categories.map(I.escapeText).join(','));
    const st = m.status || (m.avail === 'tentative' ? 'TENTATIVE' : ''); if (st) o += 'STATUS:' + st + '\r\n';
    o += 'TRANSP:' + (m.avail === 'free' ? 'TRANSPARENT' : 'OPAQUE') + '\r\n';
    o += 'X-MICROSOFT-CDO-BUSYSTATUS:' + { free: 'FREE', tentative: 'TENTATIVE', oof: 'OOF', busy: 'BUSY' }[m.avail || 'busy'] + '\r\n';
    if (m.organizer) o += addrLine('ORGANIZER', m.organizer); for (const a of m.attendees) o += addrLine('ATTENDEE', a);
    if (m.color) o += 'X-ZENG-COLOR:' + m.color + '\r\n'; if (m.travel) o += fmtProp('X-APPLE-TRAVEL-DURATION', [['VALUE', 'DURATION']], I.fmtDuration(m.travel * 60));
    if (!patch) for (const x of ev.x) o += fmtProp(x.n, x.p, x.v);
    for (const a of m.alarms) o += alarmLines(a, m.title);
    return o + 'END:VEVENT\r\n';
  }
  /** Strict RFC 5545 output. opts: {name, color, now} */
  I.serialize = (events, opts = {}) => {
    const now = opts.now || Date.now(); let o = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:' + PRODID + '\r\nCALSCALE:GREGORIAN\r\n';
    if (opts.name) o += fmtProp('X-WR-CALNAME', [], I.escapeText(opts.name)); if (opts.color) o += 'X-APPLE-CALENDAR-COLOR:' + opts.color + '\r\n';
    const zones = new Map(); const note = (tz, y) => { if (!tz || T.isFloating(tz) || tz === 'UTC') return; const z = zones.get(tz) || [y, y]; z[0] = Math.min(z[0], y); z[1] = Math.max(z[1], y); zones.set(tz, z); };
    for (const ev of events) { const y = +(ev.start.slice(0, 4)) || new Date(now).getFullYear(); const inf = ev.rrule && !/(COUNT|UNTIL)=/.test(ev.rrule); let y2 = y; if (inf) y2 = y + 15; else if (/UNTIL=(\d{4})/.test(ev.rrule || '')) y2 = +/UNTIL=(\d{4})/.exec(ev.rrule)[1]; else if (ev.rrule) y2 = y + 15;
      if (!ev.allDay) { note(ev.tz, y - 1); note(ev.tz, Math.max(y2, y) + 1); if (ev.endTz) { note(ev.endTz, y - 1); note(ev.endTz, Math.max(y2, y) + 1); } } for (const k in ev.overrides) { const p = ev.overrides[k]; if (p.tz) { note(p.tz, y - 1); note(p.tz, y + 1); } if (p.endTz) note(p.endTz, y); } }
    for (const [tz, [a, b]] of zones) if (!/^fixed:/.test(tz) || true) o += I.vtimezone(tz, a, Math.min(b, a + 40));
    for (const ev of events) { o += veventLines(ev, now); for (const k of Object.keys(ev.overrides || {})) o += veventLines(ev, now, ev.overrides[k], k); }
    return o + 'END:VCALENDAR\r\n';
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZC;
})(typeof window !== 'undefined' ? window : globalThis);
