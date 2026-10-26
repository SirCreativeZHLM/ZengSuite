/* ZC.layout / ZC.free / ZC.holidays / ZC.moon — pure helpers, no DOM. */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const T = ZC.time || (require('./zc-time.js'), ZC.time);

  // ------------------------------------------------------------ overlap layout (column packing)
  /** items: [{s,e}] numbers. Adds .col (0-based), .cols (columns in its cluster) and .span (columns it may occupy).
      minLen keeps very short events from being packed on top of each other visually. */
  ZC.layout = {
    pack(items, minLen = 0) {
      const list = items.slice().sort((a, b) => a.s - b.s || b.e - a.e);
      const E = (it) => Math.max(it.e, it.s + minLen);
      let cluster = [], cEnd = -Infinity;
      const flush = () => {
        if (!cluster.length) return; const cols = [];
        for (const it of cluster) { let c = cols.findIndex((col) => E(col[col.length - 1]) <= it.s); if (c < 0) { c = cols.length; cols.push([]); } cols[c].push(it); it.col = c; }
        for (const it of cluster) { it.cols = cols.length; let span = 1; for (let c = it.col + 1; c < cols.length; c++) { if (cols[c].some((o) => o.s < E(it) && E(o) > it.s)) break; span++; } it.span = span; }
        cluster = [];
      };
      for (const it of list) { if (it.s >= cEnd) { flush(); cEnd = -Infinity; } cluster.push(it); cEnd = Math.max(cEnd, E(it)); }
      flush(); return list;
    },
    /** lane packing for horizontal bars: items [{a,b}] day indexes inclusive. Adds .lane */
    lanes(items) {
      const list = items.slice().sort((x, y) => x.a - y.a || y.b - x.b); const ends = [];
      for (const it of list) { let l = ends.findIndex((e) => e < it.a); if (l < 0) { l = ends.length; ends.push(-Infinity); } ends[l] = it.b; it.lane = l; }
      return list;
    },
  };

  // ------------------------------------------------------------ free time
  /** busy: [[s,e]] epoch ms. Returns windows [{s,e}] (>= dur) inside working hours of allowed weekdays. */
  ZC.free = {
    windows(busy, from, to, dur, o = {}) {
      const ws = o.workStart ?? 540, we = o.workEnd ?? 1020, days = o.days || [1, 2, 3, 4, 5]; const bs = busy.filter((b) => b[1] > from && b[0] < to).sort((a, b) => a[0] - b[0]);
      const merged = []; for (const b of bs) { const l = merged[merged.length - 1]; if (l && b[0] <= l[1]) l[1] = Math.max(l[1], b[1]); else merged.push([b[0], b[1]]); }
      const out = []; const d0 = new Date(from); let d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
      for (let guard = 0; guard < 400 && d.getTime() < to; guard++, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        if (!days.includes(d.getDay())) continue;
        let a = Math.max(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, ws).getTime(), from), z = Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, we).getTime(), to);
        const step = (o.step || 15) * 60000; a = Math.ceil(a / step) * step; if (z - a < dur) continue;
        let cur = a; const push = (x, y) => { x = Math.ceil(x / step) * step; if (y - x >= dur) out.push({ s: x, e: y }); };
        for (const [bs0, be] of merged) { if (be <= cur || bs0 >= z) continue; if (bs0 > cur) push(cur, Math.min(bs0, z)); cur = Math.max(cur, be); if (cur >= z) break; }
        if (cur < z) push(cur, z);
      }
      return out;
    },
  };

  // ------------------------------------------------------------ holidays (computed by rule, no hard-coded years)
  const easter = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), gg = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - gg + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return T.dayNum(y, mo, da); };
  const nth = (y, m, wd, n) => { if (n > 0) { const f = T.dayNum(y, m, 1); return f + ((wd - T.dow(f) + 7) % 7) + (n - 1) * 7; } const l = T.dayNum(y, m, T.dim(y, m)); return l - ((T.dow(l) - wd + 7) % 7); };
  const onOrBefore = (y, m, d, wd) => { const n = T.dayNum(y, m, d); return n - ((T.dow(n) - wd + 7) % 7); };
  const lunarCache = new Map();
  const lunarDay = (y, lm, ld, from, to) => { // Gregorian day number of Chinese-calendar month/day within scan window
    const key = y + ':' + lm + ':' + ld; if (lunarCache.has(key)) return lunarCache.get(key);
    let r = null; try { const f = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' });
      for (let n = T.dayNum(y, from[0], from[1]); n <= T.dayNum(y, to[0], to[1]); n++) { const p = f.formatToParts(new Date(n * 86400000 + 4 * 3600000)); const m = p.find((x) => x.type === 'month').value, d = p.find((x) => x.type === 'day').value; if (+m === lm && +d === ld && !/bis|leap/i.test(m)) { r = n; break; } } } catch { r = null; }
    lunarCache.set(key, r); return r;
  };
  // Lunar New Year = CST date of the first new moon on/after 21 Jan (Meeus new-moon times; ICU can be a day off on edge cases)
  const cnNewYear = (y) => { const nm = ZC.moon.phases(Date.UTC(y, 0, 15), Date.UTC(y, 2, 1)).filter((p) => p.name === 'New Moon').map((p) => Math.floor((p.at + 8 * 3600000) / 86400000)); return nm.find((n) => n >= T.dayNum(y, 1, 21)) ?? null; };
  const jpEquinox = (y, autumn) => { const d = Math.floor((autumn ? 23.2488 : 20.8431) + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); return T.dayNum(y, autumn ? 9 : 3, d); };
  const qingming = (y) => { const yy = y % 100; return T.dayNum(y, 4, Math.floor(yy * 0.2422 + 4.81) - Math.floor((yy - 1) / 4)); };
  // rule kinds: f=fixed[m,d]  n=nth weekday[m,wd,n]  e=easter offset[off]  ob=weekday on/before[m,d,wd]  x=function
  const R = {
    US: [['New Year’s Day', 'f', 1, 1, 'wk'], ['Martin Luther King Jr. Day', 'n', 1, 1, 3], ['Presidents’ Day', 'n', 2, 1, 3], ['Memorial Day', 'n', 5, 1, -1], ['Juneteenth', 'f', 6, 19, 'wk'], ['Independence Day', 'f', 7, 4, 'wk'], ['Labor Day', 'n', 9, 1, 1], ['Columbus Day', 'n', 10, 1, 2], ['Veterans Day', 'f', 11, 11, 'wk'], ['Thanksgiving', 'n', 11, 4, 4], ['Christmas Day', 'f', 12, 25, 'wk']],
    GB: [['New Year’s Day', 'f', 1, 1, 'sub'], ['Good Friday', 'e', -2], ['Easter Monday', 'e', 1], ['Early May Bank Holiday', 'n', 5, 1, 1], ['Spring Bank Holiday', 'n', 5, 1, -1], ['Summer Bank Holiday', 'n', 8, 1, -1], ['Christmas Day', 'f', 12, 25, 'sub'], ['Boxing Day', 'f', 12, 26, 'sub']],
    CA: [['New Year’s Day', 'f', 1, 1], ['Good Friday', 'e', -2], ['Victoria Day', 'ob', 5, 24, 1], ['Canada Day', 'f', 7, 1], ['Labour Day', 'n', 9, 1, 1], ['Truth and Reconciliation Day', 'f', 9, 30], ['Thanksgiving', 'n', 10, 1, 2], ['Remembrance Day', 'f', 11, 11], ['Christmas Day', 'f', 12, 25], ['Boxing Day', 'f', 12, 26]],
    AU: [['New Year’s Day', 'f', 1, 1, 'sub'], ['Australia Day', 'f', 1, 26, 'sub'], ['Good Friday', 'e', -2], ['Easter Saturday', 'e', -1], ['Easter Sunday', 'e', 0], ['Easter Monday', 'e', 1], ['Anzac Day', 'f', 4, 25], ['King’s Birthday', 'n', 6, 1, 2], ['Christmas Day', 'f', 12, 25, 'sub'], ['Boxing Day', 'f', 12, 26, 'sub']],
    DE: [['Neujahr', 'f', 1, 1], ['Karfreitag', 'e', -2], ['Ostermontag', 'e', 1], ['Tag der Arbeit', 'f', 5, 1], ['Christi Himmelfahrt', 'e', 39], ['Pfingstmontag', 'e', 50], ['Tag der Deutschen Einheit', 'f', 10, 3], ['1. Weihnachtstag', 'f', 12, 25], ['2. Weihnachtstag', 'f', 12, 26]],
    FR: [['Jour de l’an', 'f', 1, 1], ['Lundi de Pâques', 'e', 1], ['Fête du Travail', 'f', 5, 1], ['Victoire 1945', 'f', 5, 8], ['Ascension', 'e', 39], ['Lundi de Pentecôte', 'e', 50], ['Fête nationale', 'f', 7, 14], ['Assomption', 'f', 8, 15], ['Toussaint', 'f', 11, 1], ['Armistice 1918', 'f', 11, 11], ['Noël', 'f', 12, 25]],
    JP: [['New Year’s Day', 'f', 1, 1], ['Coming of Age Day', 'n', 1, 1, 2], ['National Foundation Day', 'f', 2, 11, 'sunmon'], ['Emperor’s Birthday', 'f', 2, 23, 'sunmon'], ['Vernal Equinox Day', 'x', 'jpv', 'sunmon'], ['Shōwa Day', 'f', 4, 29, 'sunmon'], ['Constitution Memorial Day', 'f', 5, 3], ['Greenery Day', 'f', 5, 4], ['Children’s Day', 'f', 5, 5], ['Marine Day', 'n', 7, 1, 3], ['Mountain Day', 'f', 8, 11, 'sunmon'], ['Respect for the Aged Day', 'n', 9, 1, 3], ['Autumnal Equinox Day', 'x', 'jpa', 'sunmon'], ['Sports Day', 'n', 10, 1, 2], ['Culture Day', 'f', 11, 3, 'sunmon'], ['Labor Thanksgiving Day', 'f', 11, 23, 'sunmon']],
    CN: [['New Year’s Day', 'f', 1, 1], ['Spring Festival', 'x', 'cn11'], ['Qingming Festival', 'x', 'qm'], ['Labour Day', 'f', 5, 1], ['Dragon Boat Festival', 'x', 'cn55'], ['Mid-Autumn Festival', 'x', 'cn815'], ['National Day', 'f', 10, 1]],
    IN: [['Republic Day', 'f', 1, 26], ['Good Friday', 'e', -2], ['Independence Day', 'f', 8, 15], ['Gandhi Jayanti', 'f', 10, 2], ['Christmas Day', 'f', 12, 25]],
    BR: [['Confraternização Universal', 'f', 1, 1], ['Carnival Monday', 'e', -48], ['Carnival Tuesday', 'e', -47], ['Good Friday', 'e', -2], ['Tiradentes', 'f', 4, 21], ['Labour Day', 'f', 5, 1], ['Corpus Christi', 'e', 60], ['Independence Day', 'f', 9, 7], ['Our Lady of Aparecida', 'f', 10, 12], ['All Souls’ Day', 'f', 11, 2], ['Republic Proclamation Day', 'f', 11, 15], ['Black Consciousness Day', 'f', 11, 20], ['Christmas Day', 'f', 12, 25]],
  };
  const NAMES = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan', CN: 'China', IN: 'India', BR: 'Brazil' };
  const cache = new Map();
  const forYear = (cc, y) => {
    const key = cc + y; if (cache.has(key)) return cache.get(key); const rules = R[cc]; if (!rules) return []; const E = easter(y); const out = []; const taken = new Set();
    for (const r of rules) {
      let n = null; const k = r[1];
      if (k === 'f') n = T.dayNum(y, r[2], r[3]); else if (k === 'n') n = nth(y, r[2], r[3], r[4]); else if (k === 'e') n = E + r[2]; else if (k === 'ob') n = onOrBefore(y, r[2], r[3], r[4]);
      else if (k === 'x') { const f = r[2]; n = f === 'jpv' ? jpEquinox(y, false) : f === 'jpa' ? jpEquinox(y, true) : f === 'qm' ? qingming(y) : f === 'cn11' ? cnNewYear(y) : f === 'cn55' ? lunarDay(y, 5, 5, [5, 15], [7, 1]) : f === 'cn815' ? lunarDay(y, 8, 15, [8, 25], [10, 25]) : null; }
      if (n == null) continue; const rule = r[k === 'x' ? 3 : k === 'e' ? 3 : k === 'ob' ? 5 : 4]; out.push({ name: r[0], n, rule, sub: false });
    }
    for (const h of out) taken.add(h.n);
    for (const h of out) {
      const wd = T.dow(h.n); // weekend handling
      if (h.rule === 'wk') { if (wd === 6) { h.n -= 1; h.sub = true; } else if (wd === 0) { h.n += 1; h.sub = true; } }          // US federal observed
      else if (h.rule === 'sub' || h.rule === 'sunmon') { if ((h.rule === 'sub' && (wd === 6 || wd === 0)) || (h.rule === 'sunmon' && wd === 0)) { let n = h.n + 1; while (T.dow(n) === 6 || T.dow(n) === 0 || (taken.has(n) && n !== h.n)) n++; taken.add(n); h.n = n; h.sub = true; } }
    }
    const res = out.map((h) => ({ name: h.name + (h.sub ? ' (observed)' : ''), date: T.dateStr(h.n), n: h.n })).sort((a, b) => a.n - b.n); cache.set(key, res); return res;
  };
  ZC.holidays = { countries: NAMES, forYear, easter, range(cc, y0, y1) { const o = []; for (let y = y0; y <= y1; y++) o.push(...forYear(cc, y)); return o; } };

  // ------------------------------------------------------------ moon phases (Meeus ch. 49, main terms; ~minutes accurate)
  const rad = Math.PI / 180;
  const phaseJDE = (k) => {
    const t = k / 1236.85; let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t * t - 0.00000015 * t * t * t + 0.00000000073 * t ** 4;
    const E = 1 - 0.002516 * t - 0.0000074 * t * t; const M = (2.5534 + 29.1053567 * k) * rad, Mp = (201.5643 + 385.81693528 * k) * rad, F = (160.7108 + 390.67050284 * k) * rad; const ph = Math.round((k % 1 + 1) % 1 * 4);
    const s = Math.sin, c = Math.cos; let corr;
    if (ph === 0) corr = -0.4072 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M) - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M);
    else if (ph === 2) corr = -0.40614 * s(Mp) + 0.17302 * E * s(M) + 0.01614 * s(2 * Mp) + 0.01043 * s(2 * F) + 0.00734 * E * s(Mp - M) - 0.00515 * E * s(Mp + M) + 0.00209 * E * E * s(2 * M);
    else { corr = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F) + 0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M); const w = 0.00306 - 0.00038 * E * c(M) + 0.00026 * c(Mp) - 0.00002 * c(Mp - M) + 0.00002 * c(Mp + M) + 0.00002 * c(2 * F); corr += ph === 1 ? w : -w; }
    return jde + corr;
  };
  const PH = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];
  ZC.moon = { phases(from, to) { // epoch ms range -> [{name, at}]
    const out = []; const jd0 = from / 86400000 + 2440587.5; let k = Math.floor((jd0 - 2451550.09766) / 29.530588861) - 1;
    for (let guard = 0; guard < 4000; k += 0.25, guard++) { const kk = Math.round(k * 4) / 4; const jde = phaseJDE(kk); const at = (jde - 2440587.5) * 86400000 - 69000; if (at > to) break; if (at >= from) out.push({ name: PH[Math.round(((kk % 1) + 1) % 1 * 4) % 4], at }); }
    return out; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZC;
})(typeof window !== 'undefined' ? window : globalThis);
