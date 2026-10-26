/* ZC.balance — "Time Balance": where the visible period's time goes, meeting load, free-time ribbon, focus goal.
   Pure functions over occurrences {s,e,allDay,ev,ov,cal}; no DOM. */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const I = ZC.ical || (require('./zc-ical.js'), ZC.ical);
  const MIN = 60000;
  const B = (ZC.balance = {});
  B.FOCUS_KEY = 'X-ZENG-FOCUS';
  B.isFocus = (ev) => !!(ev && ev.x && ev.x.some((x) => x.n === B.FOCUS_KEY));
  B.union = (iv) => { const a = iv.filter((x) => x[1] > x[0]).sort((p, q) => p[0] - q[0] || p[1] - q[1]); const out = []; for (const x of a) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); } return out; };
  B.intersect = (a, b) => { const out = []; let i = 0, j = 0; while (i < a.length && j < b.length) { const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]); if (e > s) out.push([s, e]); if (a[i][1] < b[j][1]) i++; else j++; } return out; };
  B.subtract = (win, busy) => { const out = []; let cur = win[0]; for (const [s, e] of busy) { if (e <= cur) continue; if (s >= win[1]) break; if (s > cur) out.push([cur, s]); cur = Math.max(cur, e); } if (cur < win[1]) out.push([cur, win[1]]); return out; };
  const sum = (iv) => iv.reduce((t, x) => t + (x[1] - x[0]), 0);
  B.sum = sum;
  /** free windows (>= minLen ms) inside [ws,we] given merged busy intervals */
  B.freeWindows = (ws, we, busy, minLen = 15 * MIN) => B.subtract([ws, we], busy).filter((x) => x[1] - x[0] >= minLen);
  B.isMeeting = (o) => { const at = I.F(o, 'attendees') || []; const cats = I.F(o, 'categories') || []; return !B.isFocus(o.ev) && (at.length > 0 || cats.some((c) => /^meetings?$/i.test(c))); };
  B.meterLevel = (load) => (load < 0.25 ? 'light' : load < 0.5 ? 'moderate' : load < 0.7 ? 'heavy' : 'overloaded');
  /** opt: {workStart, workEnd (minutes), workDays [0-6], minFree (ms)} */
  B.compute = (occs, from, to, opt) => {
    const ws = opt.workStart ?? 540, we = opt.workEnd ?? 1020, wd = opt.workDays || [1, 2, 3, 4, 5], minFree = opt.minFree || 15 * MIN;
    const byCal = new Map(), byCat = new Map(); let total = 0; const busyAll = [], meet = [], focus = [];
    for (const o of occs) {
      if (o.allDay) continue; const s = Math.max(o.s, from), e = Math.min(o.e, to); if (e <= s) continue; const ms = e - s; total += ms;
      const c = o.cal || { id: '?', name: 'Other', color: '#888' }; const r = byCal.get(c.id) || { id: c.id, name: c.name, color: c.color, ms: 0 }; r.ms += ms; byCal.set(c.id, r);
      const cats = (I.F(o, 'categories') || []).filter(Boolean); const names = cats.length ? cats : ['Uncategorized']; for (const n of names) byCat.set(n, (byCat.get(n) || 0) + ms / names.length);
      const av = I.F(o, 'avail') || 'busy'; if (av !== 'free') busyAll.push([s, e]); if (av !== 'free' && B.isMeeting(o)) meet.push([s, e]); if (B.isFocus(o.ev)) focus.push([s, e]);
    }
    const busyU = B.union(busyAll), meetU = B.union(meet), focusU = B.union(focus); const days = []; let workMs = 0, busyWork = 0, meetWork = 0;
    for (let d = new Date(from); d.getTime() < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); const de = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); const work = wd.includes(d.getDay());
      const wS = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, ws).getTime(), wE = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, we).getTime();
      const dayBusy = B.intersect(busyU, [[ds, de]]); const row = { start: ds, work, ws: wS, we: wE, busy: dayBusy, free: [], longest: null, busyMs: 0, freeMs: 0 };
      if (work && wE > wS) { const winBusy = B.intersect(dayBusy, [[wS, wE]]); row.busyMs = sum(winBusy); row.free = B.freeWindows(wS, wE, winBusy, minFree); row.freeMs = sum(row.free); row.longest = row.free.reduce((m, x) => (!m || x[1] - x[0] > m[1] - m[0] ? x : m), null); workMs += wE - wS; busyWork += row.busyMs; meetWork += sum(B.intersect(meetU, [[wS, wE]])); }
      days.push(row);
    }
    return { totalMs: total, byCal: [...byCal.values()].sort((a, b) => b.ms - a.ms), byCat: [...byCat].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms), busyMs: busyWork, workMs, freeMs: Math.max(0, workMs - busyWork), meetingMs: meetWork, load: workMs ? meetWork / workMs : 0, focusMs: sum(focusU), days };
  };
  /** weekly focus goal progress for a period of `days` days (goal is per 7 days) */
  B.goal = (focusMs, goalHours, days) => { const target = goalHours * 3600000 * (days / 7); return { target, done: focusMs, pct: target ? Math.min(1, focusMs / target) : 0, met: target > 0 && focusMs >= target }; };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZC;
})(typeof window !== 'undefined' ? window : globalThis);
