/* Today's Three: scoring, suggestions, streak tally and postponing rules. Pure, local, offline. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'));
  else (root.ZR = root.ZR || {}).three = factory(root.ZR.dates);
})(this, function (D) {
  const dayOf = (ms) => D.fromDate(new Date(ms));
  function score(r, now = new Date()) {
    const t = D.today(now); let s = 0; const why = [];
    if (r.due) {
      const n = D.diffDays(t, r.due); // >0 overdue
      if (n > 0) { s += 60 + Math.min(n, 14) * 3; why.push(n === 1 ? 'Overdue since yesterday' : `Overdue ${n} days`); }
      else if (n === 0) { s += 55; why.push('Due today'); }
      else if (n === -1) { s += 20; why.push('Due tomorrow'); }
      else if (n >= -7) { s += 12 + n; why.push(`Due in ${-n} days`); }
      else s -= 10;
    }
    if (r.priority) { s += { 3: 24, 2: 14, 1: 6 }[r.priority]; why.push(['', 'Low priority', 'Medium priority', 'High priority'][r.priority]); }
    if (r.flag) { s += 8; why.push('Flagged'); }
    const age = Math.max(0, D.diffDays(t, dayOf(r.created || now.getTime()))); if (age >= 7) { s += Math.min(age, 60) * 0.35; why.push(`Waiting ${age} days`); }
    const pp = r.postponed || 0; if (pp) { s += Math.min(pp, 6) * 7; why.push(`Postponed ${pp}×`); }
    if ((r.tags || []).includes('someday') && !r.due) s -= 40;
    return { score: Math.round(s * 10) / 10, why };
  }
  // ranked candidates: open tasks without open subtasks (their subtasks are suggested instead)
  function suggest(all, now = new Date(), n = 12) {
    const openParents = new Set(all.filter((r) => !r.done && r.parent).map((r) => r.parent));
    return all.filter((r) => !r.done && !openParents.has(r.id)).map((r) => ({ r, ...score(r, now) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (a.r.created || 0) - (b.r.created || 0)).slice(0, n);
  }
  function streak(all, now = new Date()) {
    const days = new Map(); for (const r of all) if (r.done && r.doneAt) { const d = dayOf(r.doneAt); days.set(d, (days.get(d) || 0) + 1); }
    const t = D.today(now); const shippedToday = days.get(t) || 0; let cur = 0; let d = shippedToday ? t : D.addDays(t, -1);
    while (days.has(d)) { cur++; d = D.addDays(d, -1); }
    let best = 0, run = 0, prev = null; for (const k of [...days.keys()].sort()) { run = prev && D.diffDays(k, prev) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k; }
    return { shippedToday, current: cur, best: Math.max(best, cur) };
  }
  // reason: 'tomorrow' | 'weekend' | 'nextweek' | 'someday'
  function postponeTarget(reason, now = new Date(), ws = 1) {
    const t = D.today(now);
    if (reason === 'tomorrow') return { due: D.addDays(t, 1), tag: null };
    if (reason === 'weekend') { const w = D.dow(t); return { due: D.addDays(t, w === 6 ? 1 : (6 - w + 7) % 7 || 7), tag: null }; }
    if (reason === 'nextweek') return { due: D.addDays(D.startOfWeek(t, ws), 7), tag: null };
    return { due: null, tag: 'someday' };
  }
  const REASONS = [['tomorrow', 'Tomorrow'], ['weekend', 'This weekend'], ['nextweek', 'Next week'], ['someday', 'Someday']];
  const isStuck = (r) => !r.done && (r.postponed || 0) >= 3;
  return { score, suggest, streak, postponeTarget, isStuck, REASONS };
});
