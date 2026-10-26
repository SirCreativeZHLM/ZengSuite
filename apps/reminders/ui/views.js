/* Pure view logic: smart lists, filtering, sorting, grouping, counts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'));
  else (root.ZR = root.ZR || {}).views = factory(root.ZR.dates);
})(this, function (D) {
  const SMART = [
    { id: 'today', name: 'Today', icon: 'calendar', color: '#1f9bd1' },
    { id: 'scheduled', name: 'Scheduled', icon: 'calendar-days', color: '#e8604c' },
    { id: 'all', name: 'All', icon: 'inbox', color: '#6b7686' },
    { id: 'flagged', name: 'Flagged', icon: 'flag', color: '#e5973a' },
    { id: 'completed', name: 'Completed', icon: 'check', color: '#4f9d7a' },
    { id: 'unscheduled', name: 'No Date', icon: 'calendar-plus', color: '#8a6fd1' },
  ];
  const SMART_BY = Object.fromEntries(SMART.map((s) => [s.id, s]));
  const isOverdue = (r, now = new Date()) => !r.done && !!r.due && (r.time ? D.at(r.due, r.time) < now : r.due < D.today(now));
  const smartMatch = (id, r, now) => {
    const t = D.today(now);
    switch (id) { case 'today': return !r.done && !!r.due && r.due <= t; case 'scheduled': return !r.done && !!r.due; case 'all': return !r.done; case 'flagged': return !r.done && r.flag; case 'completed': return r.done; case 'unscheduled': return !r.done && !r.due; }
    return false;
  };
  function counts(S, now = new Date()) {
    const c = { smart: { today: 0, scheduled: 0, all: 0, flagged: 0, completed: 0, unscheduled: 0 }, lists: {}, tags: {}, overdue: 0 };
    for (const id in S.reminders) {
      const r = S.reminders[id];
      for (const s of SMART) if (smartMatch(s.id, r, now)) c.smart[s.id]++;
      if (!r.done) { c.lists[r.list] = (c.lists[r.list] || 0) + 1; (r.tags || []).forEach((t) => (c.tags[t] = (c.tags[t] || 0) + 1)); if (isOverdue(r, now)) c.overdue++; }
    }
    return c;
  }
  const DEFAULT_PREFS = {
    today: { sort: 'due', dir: 'asc', group: 'time', showDone: false }, scheduled: { sort: 'due', dir: 'asc', group: 'due', showDone: false },
    all: { sort: 'manual', dir: 'asc', group: 'list', showDone: false }, flagged: { sort: 'due', dir: 'asc', group: 'list', showDone: false },
    completed: { sort: 'done', dir: 'desc', group: 'none', showDone: true }, unscheduled: { sort: 'manual', dir: 'asc', group: 'list', showDone: false },
    list: { sort: 'manual', dir: 'asc', group: 'none', showDone: false }, tag: { sort: 'due', dir: 'asc', group: 'list', showDone: false }, search: { sort: 'due', dir: 'asc', group: 'list', showDone: true },
  };
  const viewKey = (v) => (v.k === 'smart' ? 'smart:' + v.id : v.k === 'list' ? 'list:' + v.id : v.k);
  const getPrefs = (S, v) => ({ ...DEFAULT_PREFS[v.k === 'smart' ? v.id : v.k], ...((S.prefs.views || {})[viewKey(v)] || {}) });
  const PRI_NAME = ['None', 'Low', 'Medium', 'High'];
  const timeBucket = (t) => { if (!t) return 'none'; const m = D.minutes(t); return m < 720 ? 'morning' : m < 1020 ? 'afternoon' : m < 1200 ? 'evening' : 'tonight'; };
  const BUCKET_TITLE = { overdue: 'Overdue', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', tonight: 'Tonight', none: 'No Time' };

  function search(r, q, S) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return true;
    const hay = (r.title + ' ' + (r.notes || '') + ' ' + (r.url || '') + ' ' + (r.tags || []).map((t) => '#' + t).join(' ')).toLowerCase();
    return toks.every((t) => (t.startsWith('#') && t.length > 1 ? (r.tags || []).some((x) => x.startsWith(t.slice(1))) : t === 'is:flagged' ? r.flag : t === 'is:done' ? r.done : t === 'is:open' ? !r.done : hay.includes(t)));
  }
  const cmpDue = (a, b) => { if (!a.due && !b.due) return 0; if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : a.due > b.due ? 1 : (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0; };
  function sorter(S, sort, dir) {
    const lo = Object.fromEntries(flatLists(S).map((l, i) => [l.id, i]));
    const tie = (a, b) => (lo[a.list] ?? 0) - (lo[b.list] ?? 0) || a.order - b.order || a.created - b.created;
    const base = { manual: tie, due: (a, b) => cmpDue(a, b) || tie(a, b), priority: (a, b) => b.priority - a.priority || tie(a, b), title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || tie(a, b), created: (a, b) => a.created - b.created || tie(a, b), done: (a, b) => (a.doneAt || 0) - (b.doneAt || 0) || tie(a, b) }[sort] || tie;
    // "none last" for due/priority-none must stay last when reversed
    return dir === 'desc' ? (a, b) => (sort === 'due' && (!a.due || !b.due) ? base(a, b) : -base(a, b)) : base;
  }
  function flatLists(S) { // lists in sidebar order
    const byId = Object.fromEntries(S.lists.map((l) => [l.id, l])); const out = []; const seen = new Set();
    for (const k of S.side) { if (k[0] === 'l') { const l = byId[k.slice(2)]; if (l && !seen.has(l.id)) { out.push(l); seen.add(l.id); } } else { const g = S.groups.find((x) => x.id === k.slice(2)); if (g) g.lists.forEach((id) => { const l = byId[id]; if (l && !seen.has(id)) { out.push(l); seen.add(id); } }); } }
    S.lists.forEach((l) => { if (!seen.has(l.id)) out.push(l); }); return out;
  }
  const dueBucket = (r, now, ws) => {
    const t = D.today(now); if (!r.due) return { key: 'z-none', title: 'No Date' };
    if (isOverdue(r, now)) return { key: 'a-overdue', title: 'Overdue', red: true };
    const n = D.diffDays(r.due, t); if (n <= 0) return { key: 'b-today', title: 'Today' }; if (n === 1) return { key: 'c-tomorrow', title: 'Tomorrow' };
    if (n <= 7) return { key: 'd-' + r.due, title: D.WDL[D.dow(r.due)] + ', ' + D.MON[+r.due.slice(5, 7) - 1] + ' ' + +r.due.slice(8) };
    const o = D.parse(r.due); return { key: 'e-' + r.due.slice(0, 7), title: D.MONL[o.m - 1] + (o.y !== now.getFullYear() ? ' ' + o.y : '') };
  };
  // Build the rendered structure.
  function build(S, view, now = new Date(), { lingering = new Set(), ws = 1 } = {}) {
    const prefs = getPrefs(S, view); const all = Object.values(S.reminders);
    let inc = all.filter((r) => {
      if (lingering.has(r.id)) return view.k !== 'smart' || view.id !== 'completed' ? true : true;
      if (view.k === 'smart') return smartMatch(view.id, r, now);
      if (view.k === 'list') return r.list === view.id && (prefs.showDone || !r.done);
      if (view.k === 'tag') return view.tags.every((t) => (r.tags || []).includes(t)) && (prefs.showDone || !r.done);
      if (view.k === 'search') return search(r, view.q || '', S);
      return false;
    });
    if (view.k === 'search' && !prefs.showDone) inc = inc.filter((r) => !r.done || lingering.has(r.id));
    const M = new Set(inc.map((r) => r.id)); const kids = new Map(); const top = [];
    const cmpKid = (a, b) => a.order - b.order || a.created - b.created;
    for (const r of inc) { if (r.parent && M.has(r.parent)) { (kids.get(r.parent) || kids.set(r.parent, []).get(r.parent)).push(r); } else top.push(r); }
    kids.forEach((a) => a.sort(cmpKid));
    const sf = sorter(S, prefs.sort, prefs.dir); top.sort(sf);
    const node = (r) => { const n = { r, kids: (kids.get(r.id) || []).map((k) => ({ r: k, kids: [] })) }; if (r.parent && !M.has(r.parent)) { const p = S.reminders[r.parent]; n.parentTitle = p ? p.title : null; } return n; };
    const listsById = Object.fromEntries(S.lists.map((l) => [l.id, l])); const lo = flatLists(S);
    let sections = [];
    const push = (key, title, nodes, extra = {}) => { if (nodes.length || extra.always) sections.push({ key, title, nodes, ...extra }); };
    const nodes = top.map(node);
    // Completed items at the bottom of list/tag views (except those still lingering)
    let doneNodes = [];
    let group = prefs.group;
    if (view.k !== 'smart' || view.id !== 'completed') {
      if (view.k === 'list' || view.k === 'tag') { doneNodes = nodes.filter((n) => n.r.done && !lingering.has(n.r.id)); }
    }
    const live = doneNodes.length ? nodes.filter((n) => !doneNodes.includes(n)) : nodes;
    if (group === 'none') push('all', null, live);
    else if (group === 'list') lo.forEach((l) => push('list:' + l.id, l.name, live.filter((n) => n.r.list === l.id), { color: l.color, listId: l.id }));
    else if (group === 'due') { const m = new Map(); live.forEach((n) => { const b = dueBucket(n.r, now, ws); (m.get(b.key) || m.set(b.key, { b, nodes: [] }).get(b.key)).nodes.push(n); }); [...m.keys()].sort().forEach((k) => push('due:' + k, m.get(k).b.title, m.get(k).nodes, { red: m.get(k).b.red })); }
    else if (group === 'priority') [3, 2, 1, 0].forEach((p) => push('pri:' + p, p ? PRI_NAME[p] + ' Priority' : 'No Priority', live.filter((n) => n.r.priority === p)));
    else if (group === 'tag') { const m = new Map(); live.forEach((n) => { const t = (n.r.tags || [])[0] || ''; (m.get(t) || m.set(t, []).get(t)).push(n); }); [...m.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).forEach((t) => push('tag:' + t, t ? '#' + t : 'No Tag', m.get(t))); }
    else if (group === 'time') {
      const m = { overdue: [], morning: [], afternoon: [], evening: [], tonight: [], none: [] };
      live.forEach((n) => { m[isOverdue(n.r, now) ? 'overdue' : timeBucket(n.r.time)].push(n); });
      m.overdue.sort((a, b) => cmpDue(a.r, b.r)); ['overdue', 'morning', 'afternoon', 'evening', 'tonight', 'none'].forEach((k) => push('time:' + k, BUCKET_TITLE[k], m[k], { red: k === 'overdue' }));
    }
    if (doneNodes.length) push('done', 'Completed', doneNodes, { muted: true, collapsible: true });
    // lists header color for list-grouped sections when a list view has a single list
    const total = inc.length; const topCount = nodes.length;
    // overdue section for list views when not grouped by due: flag is shown inline instead
    return { sections, prefs, total, topCount, listsById };
  }
  return { SMART, SMART_BY, isOverdue, smartMatch, counts, build, getPrefs, viewKey, flatLists, search, timeBucket, DEFAULT_PREFS, PRI_NAME, cmpDue, dueBucket };
});
