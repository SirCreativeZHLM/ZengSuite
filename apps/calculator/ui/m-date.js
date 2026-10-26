/* Date calculation: difference between two dates, and add/subtract. Civil-calendar math, no time zones. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const todayISO = () => { const d = new Date(); return C.toISO({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }); };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  window.ZM.date = function (H, root) {
    root.classList.add('zc-date'); root.replaceChildren();
    let mode = 'diff'; const t = todayISO();
    const d1 = zk.el('input.zc-input', { type: 'date', value: t, 'aria-label': 'From date' }), d2 = zk.el('input.zc-input', { type: 'date', value: t, 'aria-label': 'To date' });
    const seg = zk.el('.zk-seg', { role: 'group', 'aria-label': 'Calculation type' }, ...[['diff', 'Difference'], ['add', 'Add or Subtract']].map(([id, n]) => zk.el('button', { type: 'button', 'data-m': id, onclick: () => { mode = id; render(); } }, n)));
    const body = zk.el('.zc-panel', { style: 'padding-top:.5rem' }); const out = zk.el('.zc-card', { role: 'status', 'aria-live': 'polite' });
    const op = zk.el('.zk-seg', { role: 'group', 'aria-label': 'Add or subtract' }, zk.el('button', { type: 'button', 'data-s': '1', onclick: () => { sign = 1; render(); } }, 'Add'), zk.el('button', { type: 'button', 'data-s': '-1', onclick: () => { sign = -1; render(); } }, 'Subtract'));
    let sign = 1; const num = (label) => { const i = zk.el('input.zc-input', { type: 'number', min: 0, step: 1, value: 0, 'aria-label': label, style: 'width:100%' }); i.addEventListener('input', calc); return i; };
    const yy = num('Years'), mm = num('Months'), ww = num('Weeks'), dd = num('Days'); const wk = zk.el('input.zk-check', { type: 'checkbox', 'aria-label': 'Count weekdays only', onchange: calc }); const useToday = zk.el('button.zc-btn', { type: 'button', onclick: () => { d1.value = t; calc(); } }, 'Today');
    [d1, d2].forEach((i) => i.addEventListener('input', calc));
    root.append(zk.el('.zc-panel', { style: 'padding-bottom:0;align-items:flex-start' }, seg), body);
    function row(label, ...kids) { return zk.el('.zc-card', zk.el('.zc-label', label), ...kids); }
    function render() {
      seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      op.querySelectorAll('button').forEach((b) => { const on = +b.dataset.s === sign; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      body.replaceChildren();
      if (mode === 'diff') body.append(row('From', d1), row('To', d2), out);
      else body.append(row('Start date', zk.el('.zc-row', d1, useToday)), zk.el('.zc-row', op), zk.el('.zc-card', zk.el('.zc-row', { style: 'flex-wrap:nowrap' },
        ...[['Years', yy], ['Months', mm], ['Weeks', ww], ['Days', dd]].map(([l, i]) => zk.el('label', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:.2rem' }, zk.el('.zc-label', l), i))),
        zk.el('label.zc-row', { style: 'gap:.4rem;font-size:.85rem' }, wk, 'Count days as weekdays only (skips Saturday and Sunday)')), out);
      calc(); persist();
    }
    function parse(i) { try { return C.parseISO(i.value); } catch (e) { return null; } }
    const fullDate = (o) => `${DAYS[C.weekday(o)]}, ${MONTHS[o.m - 1]} ${o.d}, ${o.y}`;
    function calc() {
      out.replaceChildren(); const a = parse(d1);
      if (!a) { out.append(zk.el('.zc-note', 'Choose a valid start date.')); return; }
      if (mode === 'diff') {
        const b = parse(d2); if (!b) { out.append(zk.el('.zc-note', 'Choose a valid end date.')); return; }
        const r = C.diffDates(a, b); const parts = [];
        if (r.years) parts.push(plural(r.years, 'year')); if (r.months) parts.push(plural(r.months, 'month')); if (r.days || !parts.length) parts.push(plural(r.days, 'day'));
        out.append(zk.el('.zc-label', r.totalDays === 0 ? 'Same date' : r.negative ? 'The end date is before the start date' : 'Difference'), zk.el('.zc-field.out.selectable', { style: 'font-size:1.5rem;white-space:normal' }, r.totalDays === 0 ? '0 days' : parts.join(', ')),
          zk.el('table.zc-table', zk.el('tbody', ...[['Total days', H.fmt(C.Dec.of(r.totalDays))], ['Weeks and days', `${plural(r.weeks, 'week')}, ${plural(r.remDays, 'day')}`], ['Weekdays (Mon to Fri)', H.fmt(C.Dec.of(r.weekdays))], ['Start', fullDate(a)], ['End', fullDate(b)]].map(([k, v]) => zk.el('tr', zk.el('td', k), zk.el('td.selectable', v))))));
        lastText = `${parts.join(', ')} (${r.totalDays} days)`;
      } else {
        const delta = { years: +yy.value || 0, months: +mm.value || 0, weeks: +ww.value || 0, days: +dd.value || 0 };
        let res; if (wk.checked) res = C.addWeekdays(C.addToDate(a, { years: delta.years, months: delta.months }, sign), sign * (delta.weeks * 5 + delta.days)); else res = C.addToDate(a, delta, sign);
        out.append(zk.el('.zc-label', (sign > 0 ? 'Date after' : 'Date before')), zk.el('.zc-field.out.selectable', { style: 'font-size:1.5rem;white-space:normal' }, fullDate(res)), zk.el('.zc-note', C.toISO(res)));
        lastText = C.toISO(res);
      }
    }
    let lastText = ''; function persist() { H.save('date', { mode, sign }); }
    const ready = (async () => { const s = await H.load('date', null); if (s) { mode = s.mode || 'diff'; sign = s.sign || 1; } render(); })();
    return { el: root, ready, show: calc, refresh: calc, copyText: () => lastText, paste(tx) { const m = /\d{4}-\d{2}-\d{2}/.exec(tx); if (m) { d1.value = m[0]; calc(); } } };
  };
})();
