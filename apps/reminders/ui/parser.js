/* Natural-language quick add parser.
   parse("Pay rent every 1st at 9am !!! #home", {now, lists:['Work'], weekStart:1})
   -> {title, due, time, repeat, priority, tags, list, flag, early, tokens:[{type,start,end,text,value}]}  */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'), require('./recur.js'));
  else (root.ZR = root.ZR || {}).parser = factory(root.ZR.dates, root.ZR.recur);
})(this, function (D, R) {
  const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const WDF = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
  const WDA = 'sun|mon|tues?|wed|thu(?:rs?)?|fri|sat';
  const WD1 = `(?:(?:${WDF})s?|${WDA})`;
  const WDLIST = `${WD1}(?:\\s*(?:,\\s*and|,|&|/|and)\\s*${WD1})*`;
  const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
  const NUM = '(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)';
  const num = (s) => (/^\d/.test(s) ? +s : NUMW[s.toLowerCase()]);
  const ORDW = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
  const WDI = (s) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(s.slice(0, 3).toLowerCase());
  const monI = (s) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()) + 1;
  const wdCodes = (list) => [...new Set(list.split(/\s*(?:,\s*and|,|&|\/|and)\s*/i).filter(Boolean).map((w) => R.CODES[WDI(w)]))];
  const PRE = '(?:(?:due(?:\\s+(?:on|by|before))?|on|by|before)\\s+)?';
  const TOD = '(?:\\s+(?:in\\s+the\\s+)?(morning|afternoon|evening|night))?';
  const TODT = { morning: 540, afternoon: 840, evening: 1080, night: 1260 };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ORDS = '\\d{1,2}(?:st|nd|rd|th)';

  function parse(text, opts = {}) {
    const now = opts.now || new Date(); const lists = (opts.lists || []).filter(Boolean); const ws = opts.weekStart ?? 1;
    const TODAY = D.today(now); const NOWMIN = D.nowMin(now);
    const claims = []; const out = { due: null, time: null, repeat: null, priority: 0, tags: [], list: null, flag: false, early: null };
    const free = (s, e) => !claims.some((c) => s < c.e && e > c.s);
    const claim = (s, e, type, value) => { claims.push({ s, e, type, value }); };
    const scan = (re, cb) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } const s = m.index, e = s + m[0].length; if (!free(s, e)) continue; cb(m, s, e); } };
    const sticky = (src) => new RegExp(src, 'iy');
    const at = (re, i) => { re.lastIndex = i; return re.exec(text); };
    const pend = {}; // end-of-repeat helpers resolved once due is known

    // ---- tags ----
    scan(/(?<![\w#&])#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/giu, (m, s, e) => { if (!/\p{L}/u.test(m[1])) return; const t = m[1].toLowerCase(); if (!out.tags.includes(t)) out.tags.push(t); claim(s, e, 'tag', t); });
    // ---- priority ----
    scan(/(?<![\w!])(!{1,3})(?![\w!])/g, (m, s, e) => { out.priority = Math.max(out.priority, m[1].length); claim(s, e, 'priority', m[1].length); });
    scan(/(?<!\w)!(high|medium|med|low)(?!\w)|(?<!\w)priority\s+(high|medium|med|low)(?!\w)/gi, (m, s, e) => { const w = (m[1] || m[2]).toLowerCase(); const v = w === 'high' ? 3 : w === 'low' ? 1 : 2; out.priority = Math.max(out.priority, v); claim(s, e, 'priority', v); });
    // ---- flag ----
    scan(/🚩|⚑|(?<!\w)!flag(?!\w)/gi, (m, s, e) => { out.flag = true; claim(s, e, 'flag', true); });
    // ---- early reminder ----
    const unitMin = (u) => { u = u.toLowerCase(); return /^(d|day)/.test(u) ? 1440 : /^(h)/.test(u) ? 60 : 1; };
    scan(new RegExp(`(?<!\\w)(?:remind(?:\\s+me)?|alert(?:\\s+me)?|notify(?:\\s+me)?)\\s+${NUM}\\s*(d(?:ays?)?|h(?:rs?|ours?)?|m(?:ins?|inutes?)?)\\s+(?:before|early|ahead|prior)(?!\\w)`, 'gi'), (m, s, e) => { out.early = num(m[1]) * unitMin(m[2]); claim(s, e, 'early', out.early); });
    scan(new RegExp(`(?<!\\w)${NUM}\\s*(d(?:ays?)?|h(?:rs?|ours?)?|m(?:ins?|inutes?)?)\\s+(?:before|early)(?!\\w)`, 'gi'), (m, s, e) => { out.early = num(m[1]) * unitMin(m[2]); claim(s, e, 'early', out.early); });
    // ---- list ----
    [...lists].sort((a, b) => b.length - a.length).forEach((name) => {
      if (out.list) return; const n = esc(name).replace(/\s+/g, '\\s+');
      scan(new RegExp(`(?:(?<!\\w)in(?:\\s+list)?\\s+|(?<!\\w)@)${n}(?!\\w)`, 'gi'), (m, s, e) => { if (out.list) return; out.list = name; claim(s, e, 'list', name); });
    });

    // ---- repeat ----
    const setRep = (s, e, rule) => { if (out.repeat) return; out.repeat = rule; claim(s, e, 'repeat', rule); };
    const rep = (freq, extra = {}) => ({ freq, interval: 1, ...extra });
    const OD = (s) => parseInt(s, 10);
    // optional trailing "on <weekdays>" / "on the 5th" after a unit repeat
    const extend = (e, r) => {
      let m = at(sticky(`\\s+on\\s+(${WDLIST})(?!\\w)`), e);
      if (m && r.freq === 'weekly') { r.byday = wdCodes(m[1]); return e + m[0].length; }
      m = at(sticky(`\\s+on\\s+the\\s+(${ORDS})(?!\\w)`), e);
      if (m && r.freq === 'monthly') { r.bymonthday = [OD(m[1])]; return e + m[0].length; }
      m = at(sticky(`\\s+on\\s+(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\w)`), e);
      if (m && r.freq === 'yearly') { r.bymonth = monI(m[1]); r.bymonthday = [+m[2]]; return e + m[0].length; }
      return e;
    };
    scan(new RegExp(`(?<!\\w)(?:every|each)\\s+other\\s+(day|week|month|year|${WD1})(?!\\w)`, 'gi'), (m, s, e) => {
      const u = m[1].toLowerCase(); const map = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };
      const r = map[u] ? { freq: map[u], interval: 2 } : { freq: 'weekly', interval: 2, byday: [R.CODES[WDI(u)]] }; setRep(s, map[u] ? extend(e, r) : e, r);
    });
    scan(new RegExp(`(?<!\\w)every\\s+${NUM}\\s+(day|week|month|year)s?(?!\\w)`, 'gi'), (m, s, e) => {
      const map = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }; const r = { freq: map[m[2].toLowerCase()], interval: num(m[1]) }; setRep(s, extend(e, r), r);
    });
    scan(/(?<!\w)(?:every|each)\s+(weekday|weekend)s?(?!\w)|(?<!\w)(?:on\s+)?(weekdays|weekends)(?!\w)/gi, (m, s, e) => { const w = (m[1] || m[2]).toLowerCase(); setRep(s, e, rep('weekly', { byday: w.startsWith('weekday') ? R.WEEKDAYS.slice() : ['SA', 'SU'] })); });
    scan(/(?<!\w)(?:every|each)\s+last\s+day(?:\s+of\s+(?:the|each|every)\s+month)?(?!\w)/gi, (m, s, e) => setRep(s, e, rep('monthly', { bymonthday: [-1] })));
    scan(new RegExp(`(?<!\\w)(?:every|each)\\s+(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\\s+(${WDF}|${WDA})(?:\\s+of\\s+(?:the|each|every)\\s+month)?(?!\\w)`, 'gi'), (m, s, e) => setRep(s, e, rep('monthly', { byday: [ORDW[m[1].toLowerCase()] + R.CODES[WDI(m[2])]] })));
    scan(new RegExp(`(?<!\\w)(?:every|each)\\s+(?:the\\s+)?(${ORDS}(?:\\s*(?:,\\s*and|,|and|&)\\s*${ORDS})*)(?:\\s+of\\s+(?:the|each|every)\\s+month)?(?!\\w)`, 'gi'), (m, s, e) => setRep(s, e, rep('monthly', { bymonthday: m[1].match(/\d+/g).map(Number) })));
    scan(new RegExp(`(?<!\\w)every\\s+(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d:]|\\s*[ap]\\.?m\\b)`, 'gi'), (m, s, e) => setRep(s, e, rep('yearly', { bymonth: monI(m[1]), bymonthday: [+m[2]] })));
    scan(new RegExp(`(?<!\\w)every\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})(?!\\w)`, 'gi'), (m, s, e) => setRep(s, e, rep('yearly', { bymonth: monI(m[2]), bymonthday: [+m[1]] })));
    scan(/(?<!\w)(?:every|each)\s+(day|week|month|year)(?!\w)/gi, (m, s, e) => { const map = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }; const r = rep(map[m[1].toLowerCase()]); setRep(s, extend(e, r), r); });
    scan(new RegExp(`(?<!\\w)(?:every|each)\\s+(${WDLIST})(?!\\w)`, 'gi'), (m, s, e) => setRep(s, e, rep('weekly', { byday: wdCodes(m[1]) })));
    scan(/(?<!\w)(?:on\s+)?(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)(?!\w)/gi, (m, s, e) => setRep(s, e, rep('weekly', { byday: [R.CODES[WDI(m[1])]] })));
    scan(/(?<!\w)(daily|weekly|monthly|yearly|annually|quarterly|bi-?weekly|fortnightly|every\s?day|every\s+fortnight)(?!\w)/gi, (m, s, e) => {
      const w = m[1].toLowerCase().replace(/\s+/g, ''); const r = /^(daily|everyday)$/.test(w) ? rep('daily') : /^(weekly)$/.test(w) ? rep('weekly') : /^(monthly)$/.test(w) ? rep('monthly') : /^(yearly|annually)$/.test(w) ? rep('yearly') : w === 'quarterly' ? { freq: 'monthly', interval: 3 } : { freq: 'weekly', interval: 2 };
      setRep(s, extend(e, r), r);
    });

    // ---- date matchers (sticky, tried at each word start) ----
    const yr = (y, m, d) => { let Y = y || +TODAY.slice(0, 4); let c = D.fmt(Y, m, d); if (!y && c < TODAY) { Y++; c = D.fmt(Y, m, d); } return D.valid(Y, m, d) ? c : null; };
    const wdDate = (prefix, wd) => {
      const t = TODAY, cur = D.dow(t); const p = (prefix || '').toLowerCase(); let d0 = (wd - cur + 7) % 7;
      if (p === 'this') return D.addDays(t, d0);
      if (d0 === 0) d0 = 7;
      if (p === 'next' && D.startOfWeek(D.addDays(t, d0), ws) === D.startOfWeek(t, ws)) d0 += 7;
      return D.addDays(t, d0);
    };
    const todOf = (w) => (w ? D.hhmm(TODT[w.toLowerCase()]) : undefined);
    const DEFS = [
      [`${PRE}(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})(?!\\d)`, (m) => ({ date: D.valid(+m[1], +m[2], +m[3]) ? D.fmt(+m[1], +m[2], +m[3]) : null })],
      [`${PRE}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})(?!\\d)`, (m) => ({ date: D.valid(+m[3], +m[2], +m[1]) ? D.fmt(+m[3], +m[2], +m[1]) : null })],
      [`${PRE}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?![\\d/:]|\\s*[ap]\\.?m\\b)`, (m) => { let a = +m[1], b = +m[2]; if (a > 12 && b <= 12) [a, b] = [b, a]; const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0; return { date: yr(y, a, b) }; }],
      [`${PRE}(${MON})\\.?\\s+(\\d{1,2})(?![\\d:]|\\s*[ap]\\.?m\\b)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4})(?!\\d))?`, (m) => ({ date: yr(m[3] ? +m[3] : 0, monI(m[1]), +m[2]) })],
      [`${PRE}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})(?!\\w)(?:,?\\s+(\\d{4})(?!\\d))?`, (m) => ({ date: yr(m[3] ? +m[3] : 0, monI(m[2]), +m[1]) })],
      [`(?:(?:(?:on|by|due|before)\\s+)?the\\s+|(?:on|by|due|before)\\s+)(\\d{1,2})(?:st|nd|rd|th)(?!\\w)`, (m) => { const d = +m[1]; const o = D.parse(TODAY); let y = o.y, mo = o.m; if (d < o.d) { mo++; if (mo > 12) { mo = 1; y++; } } return { date: D.valid(y, mo, d) ? D.fmt(y, mo, d) : null }; }],
      [`${PRE}(?:the\\s+)?day\\s+after\\s+tomorrow(?!\\w)|(?<!\\w)overmorrow(?!\\w)`, () => ({ date: D.addDays(TODAY, 2) })],
      [`${PRE}(today|tonight|tomorrow|tmrw|tmr|tomorow|yesterday)(?!\\w)${TOD}`, (m) => { const k = m[1].toLowerCase(); const date = k === 'today' ? TODAY : k === 'tonight' ? TODAY : k === 'yesterday' ? D.addDays(TODAY, -1) : D.addDays(TODAY, 1); return { date, time: todOf(m[2]) || (k === 'tonight' ? '20:00' : undefined) }; }],
      [`(?<!\\w)this\\s+(morning|afternoon|evening)(?!\\w)`, (m) => ({ date: TODAY, time: todOf(m[1]) })],
      [`(?<!\\w)in\\s+the\\s+(morning|afternoon|evening)(?!\\w)`, (m) => ({ time: todOf(m[1]) })],
      [`(?<!\\w)(?:eod|end\\s+of\\s+(?:the\\s+)?day)(?!\\w)`, () => ({ date: TODAY, time: '17:00' })],
      [`(?<!\\w)later\\s+today(?!\\w)`, () => ({ date: TODAY })],
      [`(?<!\\w)in\\s+half\\s+an?\\s+hour(?!\\w)`, () => relTime(30)],
      [`(?<!\\w)in\\s+${NUM}\\s*(h(?:rs?|ours?)?|m(?:ins?|inutes?)?)(?!\\w)`, (m) => relTime(num(m[1]) * (/^h/i.test(m[2]) ? 60 : 1))],
      [`(?<!\\w)in\\s+${NUM}\\s*(d(?:ays?)?|w(?:ks?|eeks?)?|mo(?:nths?)?|y(?:rs?|ears?)?)(?!\\w)`, (m) => relDate(num(m[1]), m[2])],
      [`(?<!\\w)${NUM}\\s+(days?|weeks?|months?|years?)\\s+(?:from\\s+now|later)(?!\\w)`, (m) => relDate(num(m[1]), m[2])],
      [`(?<!\\w)next\\s+(week|month|year)(?!\\w)`, (m) => { const k = m[1].toLowerCase(); const o = D.parse(TODAY); return { date: k === 'week' ? D.addDays(D.startOfWeek(TODAY, ws), 7) : k === 'month' ? D.fmt(o.m === 12 ? o.y + 1 : o.y, o.m === 12 ? 1 : o.m + 1, 1) : D.fmt(o.y + 1, 1, 1) }; }],
      [`(?<!\\w)(?:(?:this|next|on\\s+the|by\\s+the)\\s+)weekend(?!\\w)`, (m) => { const nx = /^next/i.test(m[0]); let d = wdDate('this', 6); if (nx) d = D.addDays(d, 7); return { date: d }; }],
      [`(?<!\\w)(?:end\\s+of\\s+(?:the\\s+)?(month|week|year)|(eom|eow|eoy))(?!\\w)`, (m) => { const k = (m[1] || m[2]).toLowerCase(); const o = D.parse(TODAY); if (/month|eom/.test(k)) return { date: D.fmt(o.y, o.m, D.dim(o.y, o.m)) }; if (/year|eoy/.test(k)) return { date: D.fmt(o.y, 12, 31) }; return { date: wdDate('this', 5) }; }],
      [`(?:due\\s+)?(?:(on|by|before|this|next|coming)\\s+)?(${WDF})(?!\\w)${TOD}`, (m) => ({ date: wdDate(m[1], WDI(m[2])), time: todOf(m[3]) })],
      [`(?:due\\s+)?(on|by|before|this|next|coming)\\s+(${WDA})(?!\\w)\\.?${TOD}`, (m) => ({ date: wdDate(m[1], WDI(m[2])), time: todOf(m[3]) })],
    ].map(([src, fn]) => [sticky(src), fn]);
    function relTime(mins) { const d = new Date(now.getTime() + mins * 60000); return { date: D.fromDate(d), time: D.p2(d.getHours()) + ':' + D.p2(d.getMinutes()) }; }
    function relDate(n, u) { u = u.toLowerCase(); return { date: /^d/.test(u) ? D.addDays(TODAY, n) : /^w/.test(u) ? D.addDays(TODAY, 7 * n) : /^mo/.test(u) ? D.addMonths(TODAY, n) : D.addYears(TODAY, n) }; }
    const isStart = (i) => i === 0 || !/\w/.test(text[i - 1]);
    const dateAt = (i) => { for (const [re, fn] of DEFS) { const m = at(re, i); if (m) { const r = fn(m); if (r && (r.date || r.time)) return { e: i + m[0].length, ...r }; } } return null; };

    // ---- until / count / for-N (only for repeating tasks) ----
    if (out.repeat) {
      for (let i = 0; i < text.length; i++) {
        const m = at(sticky('(?:until|till|through|ending(?:\\s+on)?)\\s+'), i); if (!m || !isStart(i)) continue;
        const r = dateAt(i + m[0].length); if (r && r.date && free(i, r.e)) { out.repeat.until = r.date; claim(i, r.e, 'end', r.date); break; }
      }
      scan(new RegExp(`(?<!\\w)for\\s+${NUM}\\s+(days?|weeks?|months?|years?)(?!\\w)`, 'gi'), (m, s, e) => { if (pend.span || out.repeat.until) return; pend.span = { n: num(m[1]), u: m[2].toLowerCase() }; claim(s, e, 'end', null); });
      scan(/(?<!\w)(?:for\s+)?(\d{1,3})\s*(?:times|x)(?!\w)|(?<!\w)x\s*(\d{1,3})(?!\w)/gi, (m, s, e) => { out.repeat.count = +(m[1] || m[2]); claim(s, e, 'end', out.repeat.count); });
    }

    // ---- dates ----
    let explicit = false;
    for (let i = 0; i < text.length; i++) {
      if (!isStart(i)) continue; const r = dateAt(i); if (!r || !free(i, r.e)) continue;
      if (r.date && !out.due) out.due = r.date; else if (r.date && out.due) continue;
      if (r.time && !out.time) out.time = r.time;
      claim(i, r.e, r.date ? 'date' : 'time', r.date || r.time); i = r.e - 1;
      if (r.date && out.due) { /* keep scanning for explicit time later */ }
    }
    // ---- times ----
    const clock = (h, mi, ap, lead0) => {
      if (mi > 59) return null;
      if (ap) { if (h < 1 || h > 12) return null; return D.hhmm((h % 12 + (ap === 'p' ? 12 : 0)) * 60 + mi); }
      if (h > 24 || (h === 24 && mi)) return null; if (h === 24) h = 0;
      if (lead0 || h === 0 || h > 12) return D.hhmm(h * 60 + mi);
      if (h === 12) return D.hhmm(720 + mi);
      return D.hhmm((h <= 6 ? h + 12 : h) * 60 + mi);
    };
    const TPRE = '(?:(?:at|@|by|around|before)\\s*)?';
    const TIMES = [
      [`${TPRE}(\\d{1,2}):(\\d{2})\\s*(?:([ap])\\.?m\\b\\.?)?(?![\\d:])`, (m) => clock(+m[1], +m[2], m[3] && m[3].toLowerCase(), m[1].length === 2 && m[1][0] === '0')],
      [`${TPRE}(\\d{1,2})\\.(\\d{2})\\s*([ap])\\.?m\\b\\.?`, (m) => clock(+m[1], +m[2], m[3].toLowerCase())],
      [`${TPRE}(\\d{1,2})\\s*([ap])\\.?m\\b\\.?`, (m) => clock(+m[1], 0, m[2].toLowerCase())],
      [`(?:at|@)\\s*(\\d{1,2})(?![\\d:.]|\\s*(?:st|nd|rd|th|%|\\$))(?:\\s*o'?clock)?`, (m) => clock(+m[1], 0, null)],
      [`(\\d{1,2})\\s*o'?clock(?!\\w)`, (m) => clock(+m[1], 0, null)],
      [`${TPRE}(noon|midday|midnight)(?!\\w)`, (m) => (/midnight/i.test(m[1]) ? '00:00' : '12:00')],
    ].map(([src, fn]) => [sticky(src), fn]);
    {
      for (let i = 0; i < text.length; i++) {
        if (!isStart(i)) continue;
        for (const [re, fn] of TIMES) { const m = at(re, i); if (!m) continue; const e = i + m[0].length; if (!free(i, e)) continue; const t = fn(m); if (!t) continue; if (explicit) continue; out.time = t; explicit = true; claim(i, e, 'time', t); i = e - 1; break; }
      }
      // explicit time wins over time-of-day words ("tomorrow morning at 8"): handled by overwrite above only if explicit clock found last
    }
    // explicit clock tokens override defaults from words; recompute: last explicit 'time' claim from TIMES is already stored in out.time.

    // ---- resolve defaults ----
    const t = out.time; const tmin = t ? D.minutes(t) : null;
    if (out.repeat) {
      if (!out.due) { out.due = R.firstOn(out.repeat, TODAY); if (t && out.due === TODAY && tmin <= NOWMIN) out.due = R.next(out.repeat, TODAY) || out.due; }
    } else if (t && !out.due) out.due = tmin > NOWMIN ? TODAY : D.addDays(TODAY, 1);
    if (pend.span && out.due) { const n = pend.span.n, u = pend.span.u; const end = /^d/.test(u) ? D.addDays(out.due, n) : /^w/.test(u) ? D.addDays(out.due, 7 * n) : /^m/.test(u) ? D.addMonths(out.due, n) : D.addYears(out.due, n); out.repeat.until = D.addDays(end, -1); }
    if (out.repeat) { out.repeat = R.norm(out.repeat); }
    if (!out.due) out.time = null;

    // ---- title ----
    claims.sort((a, b) => a.s - b.s);
    let title = ''; let pos = 0; for (const c of claims) { title += text.slice(pos, c.s) + ' '; pos = c.e; } title += text.slice(pos);
    title = title.replace(/\s+/g, ' ').trim().replace(/\s+([,;.])/g, '$1');
    const trimmed = text.replace(/\s+$/, ''); const last = claims[claims.length - 1], first = claims[0];
    if (last && last.e >= trimmed.length) title = title.replace(/(?:\s+(?:on|at|by|due|before|from|until|till|for|in|every|each|and|&|the|then)|\s*[,;:\-–—@])+$/i, '').trim();
    if (first && first.s === 0 || (first && !text.slice(0, first.s).trim())) title = title.replace(/^(?:(?:and|then|&)\s+|[,;:\-–—]\s*)+/i, '').trim();
    const tokens = claims.map((c) => ({ type: c.type, start: c.s, end: c.e, text: text.slice(c.s, c.e), value: c.value }));
    return { title, ...out, tokens };
  }
  return { parse };
});
