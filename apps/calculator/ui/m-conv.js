/* Converter mode. Currency uses rates the user types in; nothing is fetched. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const CAT_ORDER = ['length', 'area', 'volume', 'mass', 'temperature', 'speed', 'time', 'data', 'energy', 'pressure', 'angle', 'fuel', 'currency'];
  const DEFAULT_PAIR = { length: ['km', 'mi'], area: ['m2', 'ft2'], volume: ['L', 'gal'], mass: ['kg', 'lb'], temperature: ['C', 'F'], speed: ['kmh', 'mph'], time: ['h', 'min'], data: ['GB', 'MB'], energy: ['kcal', 'kJ'], pressure: ['bar', 'psi'], angle: ['deg', 'rad'], fuel: ['l100', 'mpg'], currency: ['USD', 'EUR'] };

  window.ZM.conv = function (H, root) {
    root.classList.add('zc-conv'); root.replaceChildren();
    let cat = 'length', from = 'km', to = 'mi', text = '1';
    const chips = zk.el('.zc-chips', { role: 'tablist', 'aria-label': 'Conversion categories' });
    const inEl = zk.el('input.zc-field.selectable', { type: 'text', inputmode: 'decimal', 'aria-label': 'Value to convert', autocomplete: 'off', spellcheck: 'false' });
    const outEl = zk.el('.zc-field.out', { role: 'status', 'aria-live': 'polite', 'aria-label': 'Converted value', tabindex: 0 });
    const fromSel = zk.el('select.zc-select', { 'aria-label': 'Convert from unit' }), toSel = zk.el('select.zc-select', { 'aria-label': 'Convert to unit' });
    const swapBtn = zk.el('button.zc-btn', { type: 'button', 'aria-label': 'Swap units', title: 'Swap units', onclick: () => { const o = outEl.dataset.ungrouped; [from, to] = [to, from]; if (o) inEl.value = o; fillSel(); update(); persist(); } }, zk.icon('arrow-up-down'));
    const copyBtn = zk.el('button.zc-btn', { type: 'button', onclick: () => { if (outEl.dataset.text) H.copy(outEl.dataset.ungrouped); } }, 'Copy');
    const errEl = zk.el('.zc-note', { role: 'alert' });
    const table = zk.el('table.zc-table'); const tableWrap = zk.el('.zc-card', { style: 'padding:.25rem .5rem;min-height:0;overflow:auto;flex:1' }, table);
    const ratesBox = zk.el('.zc-card');
    root.append(zk.el('.zc-panel', { style: 'flex:1;min-height:0' }, chips,
      zk.el('.zc-card', zk.el('.zc-label', 'From'), inEl, fromSel), zk.el('.zc-row', { style: 'justify-content:center' }, swapBtn),
      zk.el('.zc-card', zk.el('.zc-label', 'To'), outEl, zk.el('.zc-row', toSel, zk.el('span.zk-spacer'), copyBtn), errEl),
      ratesBox, zk.el('.zc-label', 'All units'), tableWrap));

    CAT_ORDER.forEach((c) => chips.append(zk.el('button.zc-chip', { type: 'button', role: 'tab', 'data-cat': c, onclick: () => setCat(c), onpointerdown: (e) => e.currentTarget.classList.add('down'), onpointerup: (e) => e.currentTarget.classList.remove('down'), onpointerleave: (e) => e.currentTarget.classList.remove('down') }, C.CATS[c].name)));

    const units = () => C.CATS[cat].units;
    const unitObj = (id) => units().find((u) => u.id === id) || units()[0];
    function fillSel() {
      for (const [sel, val] of [[fromSel, from], [toSel, to]]) { sel.replaceChildren(...units().map((u) => zk.el('option', { value: u.id }, u.label))); sel.value = val; }
      chips.querySelectorAll('.zc-chip').forEach((b) => { const on = b.dataset.cat === cat; b.setAttribute('aria-pressed', on); b.setAttribute('aria-selected', on); });
      renderRates();
    }
    function setCat(c) {
      cat = c; const us = units().map((u) => u.id); const pair = DEFAULT_PAIR[c];
      from = us.includes(pair[0]) ? pair[0] : us[0]; to = us.includes(pair[1]) ? pair[1] : us[1] || us[0]; fillSel(); update(); persist();
    }
    function parseInput(t) {
      let d = C.parseNumberText(t, H.sep); if (d) return d;
      if (!t.trim()) return null; try { return C.evaluate(t, { angle: 'deg' }); } catch (e) { return undefined; }
    }
    function update(commit) {
      errEl.textContent = ''; const v = parseInput(inEl.value); const a = unitObj(from), b = unitObj(to);
      table.replaceChildren();
      if (v == null || v === undefined) { outEl.textContent = '—'; outEl.dataset.text = ''; outEl.dataset.ungrouped = ''; if (v === undefined) errEl.textContent = 'Enter a number or a simple expression.'; return; }
      try {
        const r = C.convert(v, a, b); outEl.textContent = H.fmt(r); outEl.dataset.text = H.fmt(r); outEl.dataset.plain = r.toPlain(); outEl.dataset.ungrouped = C.format(r, { group: false, sep: H.sep });
        table.append(zk.el('thead', zk.el('tr', zk.el('th', 'Unit'), zk.el('th', 'Value'))));
        const tb = zk.el('tbody'); for (const u of units()) { let cell; try { cell = H.fmt(C.convert(v, a, u)); } catch (e) { cell = '—'; } const tr = zk.el('tr', { tabindex: 0, title: 'Click to convert to this unit', onclick: () => { to = u.id; toSel.value = u.id; update(); persist(); } }, zk.el('td', u.label), zk.el('td.selectable', cell)); if (u.id === to) tr.style.background = 'rgba(var(--accent-rgb),.14)'; tb.append(tr); } table.append(tb);
        if (commit) H.addHistory({ expr: `${H.fmt(v)} ${a.label.replace(/ \(.*\)/, '')} → ${b.label.replace(/ \(.*\)/, '')}`, result: r.toPlain(), kind: 'dec', mode: 'converter' });
      } catch (e) { outEl.textContent = '—'; outEl.dataset.text = ''; outEl.dataset.ungrouped = ''; errEl.textContent = e.message; for (const u of []) u; }
    }
    function persist() { H.save('conv', { cat, from, to, text: inEl.value }); }
    inEl.addEventListener('input', () => { update(); persist(); });
    inEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { update(true); e.preventDefault(); } });
    fromSel.onchange = () => { from = fromSel.value; update(); persist(); }; toSel.onchange = () => { to = toSel.value; update(); persist(); };

    function renderRates() {
      ratesBox.replaceChildren(); ratesBox.hidden = cat !== 'currency'; if (cat !== 'currency') return;
      ratesBox.append(zk.el('.zc-label', 'Exchange rates'), zk.el('.zc-note', 'Rates are entered by you, we don’t fetch anything. Type how many units of each currency equal one unit of your reference currency (the one set to 1).'));
      const grid = zk.el('div', { style: 'display:grid;grid-template-columns:3.5rem 1fr auto;gap:.3rem .5rem;align-items:center;max-height:9rem;overflow:auto' });
      const rates = H.settings.rates;
      Object.keys(rates).forEach((code) => {
        const inp = zk.el('input.zc-input', { value: rates[code] == null ? '' : rates[code], placeholder: 'rate', inputmode: 'decimal', 'aria-label': 'Rate for ' + code });
        inp.addEventListener('input', () => { rates[code] = inp.value.trim().replace(',', '.'); apply(); });
        grid.append(zk.el('span', { style: 'font-weight:600' }, code), inp, zk.el('button.zk-btn.icon', { 'aria-label': 'Remove ' + code, title: 'Remove', onclick: () => { delete rates[code]; apply(); setCat('currency'); } }, zk.icon('x')));
      });
      const add = zk.el('input.zc-input', { placeholder: 'Add code, e.g. SEK', maxlength: 5, 'aria-label': 'New currency code', style: 'width:9rem;text-transform:uppercase' });
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const c = add.value.trim().toUpperCase(); if (/^[A-Z]{2,5}$/.test(c) && !(c in rates)) { rates[c] = ''; apply(); setCat('currency'); } } });
      ratesBox.append(grid, add);
    }
    function apply() { C.setRates(H.settings.rates); H.saveSettings(); update(); }

    const ready = (async () => { const s = await H.load('conv', null); if (s) { cat = s.cat in C.CATS ? s.cat : 'length'; from = s.from; to = s.to; text = s.text ?? '1'; } inEl.value = text; fillSel(); if (!units().some((u) => u.id === from)) setCat(cat); else update(); })();
    return { el: root, ready, refresh: update, show() { update(); }, copyText: () => outEl.dataset.ungrouped || null, paste(t) { const d = C.parseNumberText(t, H.sep); if (d) { inEl.value = d.toPlain(); update(); persist(); } else zk.toast('Clipboard does not contain a number', 1500); }, onKey(e) { if (/^[0-9.]$/.test(e.key)) { inEl.focus(); return false; } return false; } };
  };
})();
