/* ZC.nlp — natural-language quick add: "Lunch with Sam tomorrow 1pm for 1h at Café". English. */
(function (g) {
  'use strict';
  const ZC = (g.ZC = g.ZC || {});
  const T = ZC.time || (require('./zc-time.js'), ZC.time);
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; const WDC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MON3 = MONTHS.map((m) => m.slice(0, 3));
  const wdIndex = (s) => { s = s.toLowerCase().replace(/s$/, ''); let i = DAYS.indexOf(s); if (i < 0) i = DAYS3.indexOf(s.slice(0, 3)); if (i < 0 && s === 'tues') i = 2; if (i < 0 && s === 'thur') i = 4; return i; };
  const monIndex = (s) => { s = s.toLowerCase().replace(/\.$/, ''); let i = MONTHS.indexOf(s); if (i < 0) i = MON3.indexOf(s.slice(0, 3)); if (s === 'sept') i = 8; return i; };
  const WDPAT = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\\.?';
  const MONPAT = '(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\\.?';
  const p2 = (n) => String(n).padStart(2, '0');
  const dstr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  /** parse(text, now=Date, {duration:60}) -> {title, loc, allDay, start, end, rrule, alarms[], found:{date,time}} (wall strings, floating) */
  function parse(text, now = new Date(), o = {}) {
    let s = ' ' + String(text).trim() + ' '; const res = { title: '', loc: '', allDay: false, start: '', end: '', rrule: '', alarms: [], found: { date: false, time: false, duration: false, repeat: false } };
    const take = (re, fn) => { const m = re.exec(s); if (!m) return false; const r = fn(m); if (r === false) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true; };
    let durMin = null, spanDays = 0;
    // alarm
    take(/\s(?:remind(?:\s+me)?|alert|alarm)\s+(?:me\s+)?(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|m|h(?:ou)?rs?|hours?|days?|d)\s+(?:before|ahead|early)\s/i, (m) => { const n = parseFloat(m[1]), u = m[2][0].toLowerCase(); res.alarms.push(Math.round(n * (u === 'd' ? 1440 : u === 'h' ? 60 : 1))); });
    // repeat
    const RW = '(?:every|each)';
    if (!take(new RegExp(`\\s${RW}\\s+(?:other|(\\d+)(?:st|nd|rd|th)?)\\s+(day|week|month|year)s?\\s`, 'i'), (m) => { const iv = /other/i.test(m[0]) ? 2 : +m[1]; res.rrule = `FREQ=${{ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[m[2].toLowerCase()]}${iv > 1 ? ';INTERVAL=' + iv : ''}`; }))
      if (!take(new RegExp(`\\s${RW}\\s+((?:${WDPAT})(?:\\s*(?:,|and|&)\\s*(?:${WDPAT}))*)\\s`, 'i'), (m) => { const ds = m[1].split(/\s*(?:,|and|&)\s*/i).map((x) => wdIndex(x.replace('.', ''))).filter((i) => i >= 0); if (!ds.length) return false; res.rrule = 'FREQ=WEEKLY;BYDAY=' + ds.map((i) => WDC[i]).join(','); res.repWd = ds[0]; }))
        if (!take(new RegExp(`\\s${RW}\\s+(weekdays?|work\\s?days?)\\s`, 'i'), () => { res.rrule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'; }))
          if (!take(new RegExp(`\\s(?:${RW}\\s+(day|week|month|year)|(daily|weekly|monthly|yearly|annually))\\s`, 'i'), (m) => { const w = (m[1] || m[2]).toLowerCase(); res.rrule = 'FREQ=' + (w.startsWith('day') || w === 'daily' ? 'DAILY' : w.startsWith('week') ? 'WEEKLY' : w.startsWith('month') ? 'MONTHLY' : 'YEARLY'); })) { /* none */ }
    if (res.rrule) res.found.repeat = true;
    // duration
    take(/\s(?:for|lasting)\s+(?:(an?|half\s+an?|\d+(?:\.\d+)?)\s*(h(?:ou)?rs?|hours?|h|min(?:ute)?s?|m|days?|d|weeks?|w)\b)\s/i, (m) => {
      const q = m[1].toLowerCase(); let n = /^half/.test(q) ? 0.5 : /^an?$/.test(q) ? 1 : parseFloat(q); const u = m[2].toLowerCase();
      if (/^d/.test(u)) { spanDays = Math.max(1, Math.round(n)); } else if (/^w/.test(u)) { spanDays = Math.max(1, Math.round(n * 7)); } else durMin = Math.round(n * (/^h/.test(u) ? 60 : 1)); res.found.duration = true; });
    take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(hrs?|hours?)\s+(\d+)\s*(?:min|minutes?)\s/i, (m) => { durMin = Math.round(+m[1] * 60 + +m[3]); res.found.duration = true; });
    // all day
    if (take(/\sall[\s-]day\s/i, () => true)) res.allDay = true;
    // time range
    let st = null, en = null;
    const meridiem = (h, ap) => { if (!ap) return h; ap = ap[0].toLowerCase(); if (ap === 'p' && h < 12) return h + 12; if (ap === 'a' && h === 12) return 0; return h; };
    take(/\s(?:from\s+|between\s+|at\s+)?(\d{1,2})(?::(\d\d))?\s*([ap]\.?m\.?)?\s*(?:-|–|—|to|until|till|and)\s*(\d{1,2})(?::(\d\d))?\s*([ap]\.?m\.?)?(?=\s|,|$)/i, (m) => {
      const hasAp = m[3] || m[6]; const colon = m[2] || m[5]; const prefixed = /^\s(?:from|between)/i.test(m[0]); if (!hasAp && !colon && !prefixed) return false;
      let h1 = +m[1], h2 = +m[4]; if (h1 > 23 || h2 > 23) return false; const a1 = m[3], a2 = m[6];
      if (a2 && !a1) { let t1 = meridiem(h1, a2); if (t1 > meridiem(h2, a2) || (h1 === 12 && /^a/i.test(a2))) t1 = meridiem(h1, /^p/i.test(a2) ? 'am' : 'pm'); if (h1 === 12 && /^p/i.test(a2)) t1 = 12; h1 = t1; h2 = meridiem(h2, a2); }
      else if (a1 && !a2) { h1 = meridiem(h1, a1); h2 = meridiem(h2, a1); if (h2 <= h1) h2 = h2 + 12 < 24 ? h2 + 12 : h2; }
      else { h1 = meridiem(h1, a1); h2 = meridiem(h2, a2); }
      st = [h1, +(m[2] || 0)]; en = [h2, +(m[5] || 0)];
    });
    if (!st) {
      if (take(/\s(?:at\s+|@\s*)?(noon|midday)\s/i, () => true)) st = [12, 0];
      else if (take(/\s(?:at\s+)?midnight\s/i, () => true)) st = [0, 0];
      else if (!take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d\d))?\s*([ap]\.?m\.?)\s/i, (m) => { const h = +m[1]; if (h > 12 || h < 1 && !/^0/.test(m[1])) return false; st = [meridiem(h, m[3]), +(m[2] || 0)]; }))
        if (!take(/\s(?:at\s+|@\s*)?([01]?\d|2[0-3]):([0-5]\d)\s/i, (m) => { st = [+m[1], +m[2]]; }))
          take(/\s(?:at|@)\s*(\d{1,2})\s(?!\s*(?:am|pm|st|nd|rd|th|of|people|persons))/i, (m) => { let h = +m[1]; if (h < 1 || h > 23) return false; if (h >= 1 && h <= 7) h += 12; st = [h, 0]; });
    }
    if (st) res.found.time = true;
    // date
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let date = null; let tonight = false;
    const setD = (d) => { date = d; };
    if (take(/\s(?:the\s+)?day\s+after\s+tomorrow\s/i, () => true)) setD(addD(today, 2));
    else if (take(/\s(?:tomorrow|tmrw|tmr|tom)\s/i, () => true)) setD(addD(today, 1));
    else if (take(/\s(tonight|today|tod)\s/i, (m) => { if (/tonight/i.test(m[1])) tonight = true; })) setD(today);
    else if (take(/\syesterday\s/i, () => true)) setD(addD(today, -1));
    else if (take(/\sin\s+(\d+|a|an|one|two|three|four|five|six)\s+(day|week|month|year)s?\s/i, (m) => { const n = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[m[1].toLowerCase()] || +m[1]; const u = m[2].toLowerCase(); setD(u === 'day' ? addD(today, n) : u === 'week' ? addD(today, 7 * n) : u === 'month' ? new Date(today.getFullYear(), today.getMonth() + n, today.getDate()) : new Date(today.getFullYear() + n, today.getMonth(), today.getDate())); }));
    else if (take(/\s(\d{4})-(\d\d)-(\d\d)\s/, (m) => { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (d.getMonth() !== +m[2] - 1) return false; setD(d); }));
    else if (take(new RegExp(`\\s(?:on\\s+|the\\s+)?(?:${WDPAT},?\\s+)?(${MONPAT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s|,|$)`, 'i'), (m) => { const mi = monIndex(m[1].replace('.', '')); if (mi < 0 || +m[2] < 1 || +m[2] > 31) return false; let y = m[3] ? +m[3] : today.getFullYear(); let d = new Date(y, mi, +m[2]); if (!m[3] && d < today) d = new Date(y + 1, mi, +m[2]); setD(d); }));
    else if (take(new RegExp(`\\s(?:on\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONPAT})(?:,?\\s+(\\d{4}))?(?=\\s|,|$)`, 'i'), (m) => { const mi = monIndex(m[2].replace('.', '')); if (mi < 0 || +m[1] < 1 || +m[1] > 31) return false; let y = m[3] ? +m[3] : today.getFullYear(); let d = new Date(y, mi, +m[1]); if (!m[3] && d < today) d = new Date(y + 1, mi, +m[1]); setD(d); }));
    else if (take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => { const mo = +m[1], da = +m[2]; if (mo < 1 || mo > 12 || da < 1 || da > 31) return false; let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : today.getFullYear(); let d = new Date(y, mo - 1, da); if (!m[3] && d < today) d = new Date(y + 1, mo - 1, da); setD(d); }));
    else if (take(/\s(?:this|next)\s+weekend\s/i, () => true)) { const d = addD(today, (6 - today.getDay() + 7) % 7); setD(d); }
    else if (take(/\snext\s+week\s/i, () => true)) setD(addD(today, 7));
    else if (take(new RegExp(`\\s(?:(next|this|on|coming|upcoming)\\s+)?(${WDPAT})(?=\\s|,|$)`, 'i'), (m) => {
      const wd = wdIndex(m[2].replace('.', '')); if (wd < 0) return false; if (m[2].length < 3) return false; const kind = (m[1] || '').toLowerCase();
      let delta = (wd - today.getDay() + 7) % 7;
      if (delta === 0 && kind !== 'this' && st) { const t = new Date(now); t.setHours(st[0], st[1], 0, 0); if (t <= now) delta = 7; } else if (delta === 0 && kind !== 'this' && !st && kind === 'next') delta = 7;
      if (kind === 'next') { const monThis = addD(today, -((today.getDay() + 6) % 7)); if (addD(today, delta) < addD(monThis, 7)) delta += 7; }
      setD(addD(today, delta)); }));
    if (date) res.found.date = true;
    // location: what follows "at"/"@" in the remainder
    take(/\s(?:at|@|in)\s+(?!the\s+(?:morning|evening|afternoon))([^\s].*?)\s*$/i, (m) => { const l = m[1].trim().replace(/[.,;]+$/, ''); if (!l) return false; if (/^(?:in|on|at)\s/i.test(l)) return false; res.loc = l.replace(/^\w/, (c) => c); });
    // title
    let title = s.replace(/\s+/g, ' ').trim().replace(/^(?:at|on|from|for|to|until|till|-|–|,|@|the|every|each)\s+/i, '').replace(/\s+(?:at|on|from|for|to|until|till|-|–|,|@|in|every|each)$/i, '').trim();
    title = title.replace(/\s+(?:at|on|from|for|to|until|till|-|–|,|@|in)$/i, '').trim();
    res.title = title ? title[0].toUpperCase() + title.slice(1) : 'New Event';
    // resolve start/end
    if (!date) { if (st) { const t = new Date(now); t.setHours(st[0], st[1], 0, 0); date = t > now ? today : addD(today, 1); } else if (res.found.repeat && res.repWd != null) { date = addD(today, (res.repWd - today.getDay() + 7) % 7); } else date = today; }
    if (tonight && !st) { st = [19, 0]; res.found.time = true; }
    if (!st && !res.found.date && !res.found.repeat && !res.allDay) { /* nothing recognised: all-day today */ }
    if (res.allDay || (!st && !en)) { res.allDay = true; res.start = dstr(date); res.end = dstr(addD(date, Math.max(1, spanDays || 1))); }
    else {
      const sd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), st[0], st[1]); let ed;
      if (en) { ed = new Date(date.getFullYear(), date.getMonth(), date.getDate(), en[0], en[1]); if (ed <= sd) ed = new Date(ed.getTime() + 86400000); }
      else if (spanDays) ed = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + spanDays, sd.getHours(), sd.getMinutes());
      else ed = new Date(sd.getTime() + (durMin ?? o.duration ?? 60) * 60000);
      const w = (d) => `${dstr(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`; res.start = w(sd); res.end = w(ed);
    }
    delete res.repWd; return res;
  }
  ZC.nlp = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZC;
})(typeof window !== 'undefined' ? window : globalThis);
