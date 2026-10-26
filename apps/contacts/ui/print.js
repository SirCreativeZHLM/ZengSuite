/* Printing: lists, cards, envelopes, mailing labels (Avery 5160 / A4 3x7) through print CSS. */
(() => {
  'use strict';
  const ZC = window.ZC, S = ZC.S, M = ZC.M, el = zk.el;
  const LABELS = {
    avery5160: { name: 'Avery 5160 (US Letter, 30 per sheet)', page: '8.5in 11in', cols: 3, rows: 10, w: '2.625in', h: '1in', top: '0.5in', left: '0.1875in', gapX: '0.125in', gapY: '0in' },
    a4x7: { name: 'A4, 3 × 7 (63.5 × 38.1 mm, 21 per sheet)', page: '210mm 297mm', cols: 3, rows: 7, w: '63.5mm', h: '38.1mm', top: '15.15mm', left: '7.2mm', gapX: '2.5mm', gapY: '0mm' },
  };
  const ENV = { no10: { name: '#10 envelope (9.5 × 4.125 in)', w: '9.5in', h: '4.125in', toLeft: '3.9in', toTop: '1.7in' }, dl: { name: 'DL envelope (220 × 110 mm)', w: '220mm', h: '110mm', toLeft: '100mm', toTop: '44mm' } };
  const pickAddr = (c, pref) => { const a = pref === 'first' ? c.addrs[0] : c.addrs.find((x) => x.l === pref) || c.addrs[0]; return a; };
  const addrBlock = (c, a) => [M.displayName(c, 'first').replace(/^.*$/, (n) => (c.isOrg ? n : [c.prefix, c.first, c.middle, c.last, c.suffix].filter(Boolean).join(' ') || n)), c.org && !c.isOrg ? c.org : '', M.addrLines(a)].filter(Boolean).join('\n');
  const setPage = (css) => { let st = document.getElementById('print-page'); if (!st) { st = el('style', { id: 'print-page' }); document.head.append(st); } st.textContent = css; };

  function build(kind, list, o) {
    const root = document.getElementById('print-root'); root.replaceChildren(); let skipped = 0; const sortBy = S.prefs.sortBy;
    list = M.sortContacts(list, sortBy);
    if (kind === 'list') {
      setPage('@page { size: auto; margin: 0.6in; }');
      const cols = [['Name', (c) => ZC.name(c)], ['Phone', (c) => c.phones.map((p) => p.v).join('\n')], ['Email', (c) => c.emails.map((p) => p.v).join('\n')], ['Company', (c) => [c.org, c.title].filter(Boolean).join(', ')], ['Address', (c) => (c.addrs[0] ? M.addrLines(c.addrs[0]).replace(/\n/g, ', ') : '')], ['Birthday', (c) => (c.bday ? M.fmtDate(c.bday) : '')]].filter((x) => o.cols.includes(x[0]));
      const tb = el('tbody'); let last = '';
      for (const c of list) { const l = M.sectionOf(c, sortBy); if (o.letters && l !== last) { tb.append(el('tr.ltr', el('td', { colSpan: cols.length }, l))); last = l; } tb.append(el('tr', cols.map(([, f], i) => el('td', { style: { whiteSpace: 'pre-line', fontWeight: i === 0 ? 600 : 400 } }, f(c))))); }
      root.append(el('.pl', el('h1', o.title), el('table', el('thead', el('tr', cols.map(([n]) => el('th', n)))), tb)));
    } else if (kind === 'cards') {
      setPage('@page { size: auto; margin: 0.6in; }');
      root.append(el('.pl', el('h1', o.title)), el('.pc', list.map((c) => { const k = el('.c', el('h3', ZC.name(c)), c.org && !c.isOrg ? el('.o', [c.title, c.org].filter(Boolean).join(', ')) : c.title ? el('.o', c.title) : null);
        const f = (l, v) => v && k.append(el('div.f', el('i', l), v)); c.phones.forEach((p) => f(M.labelText(p.l), p.v)); c.emails.forEach((p) => f(M.labelText(p.l), p.v)); c.urls.forEach((p) => f('web', p.v)); c.addrs.forEach((a) => f(M.labelText(a.l), M.addrLines(a).replace(/\n/g, ', '))); if (c.bday) f('birthday', M.fmtDate(c.bday)); if (o.notes && c.notes) f('notes', c.notes); return k; })));
    } else if (kind === 'env') {
      const E = ENV[o.env]; setPage(`@page { size: ${E.w} ${E.h}; margin: 0; }`);
      for (const c of list) { const a = pickAddr(c, o.addr); if (!a) { skipped++; continue; } root.append(el('.env', { style: { width: E.w, height: E.h } }, o.ret ? el('.ret', o.ret) : null, el('.to', { style: { left: E.toLeft, top: E.toTop } }, addrBlock(c, a)))); }
    } else {
      const L = LABELS[o.label]; setPage(`@page { size: ${L.page}; margin: 0; }`); const per = L.cols * L.rows; const sheets = [];
      const items = Array(Math.max(0, o.start - 1)).fill(null);
      for (const c of list) { const a = pickAddr(c, o.addr); if (!a) { skipped++; continue; } items.push(addrBlock(c, a)); }
      for (let i = 0; i < items.length; i += per) sheets.push(items.slice(i, i + per));
      sheets.forEach((s, si) => root.append(el('.lbls', { style: { width: L.page.split(' ')[0], height: L.page.split(' ')[1], padding: `${L.top} 0 0 ${L.left}`, gridTemplateColumns: `repeat(${L.cols}, ${L.w})`, gridAutoRows: L.h, columnGap: L.gapX, rowGap: L.gapY, breakAfter: si < sheets.length - 1 ? 'page' : 'auto', fontSize: o.fs + 'pt' } }, s.map((t) => el('.lbl', t || '')))));
    }
    return skipped;
  }

  ZC.printDialog = async () => {
    const sel = ZC.selected(); const shown = ZC.order().map(ZC.get); if (!S.contacts.length) return zk.alert('Nothing to print', 'Your address book is empty.');
    const style = el('select.zk-select', [['list', 'Lists'], ['cards', 'Cards'], ['env', 'Envelopes'], ['labels', 'Mailing Labels']].map(([v, n]) => el('option', { value: v }, n)));
    const src = el('select.zk-select', [['selected', `Selected contacts (${sel.length})`, sel.length > 0], ['list', `${ZC.viewName()} (${shown.length})`, true], ['all', `All contacts (${S.contacts.length})`, true]].filter((x) => x[2]).map(([v, n]) => el('option', { value: v, selected: sel.length > 1 ? v === 'selected' : v === 'list' }, n)));
    const sub = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    const addrSel = el('select.zk-select', [['home', 'Home address'], ['work', 'Work address'], ['first', 'First address']].map(([v, n]) => el('option', { value: v }, n)));
    const labSel = el('select.zk-select', Object.entries(LABELS).map(([v, l]) => el('option', { value: v }, l.name))); const envSel = el('select.zk-select', Object.entries(ENV).map(([v, l]) => el('option', { value: v }, l.name)));
    const start = el('input.zk-input.num.selectable', { type: 'number', min: 1, max: 30, value: 1 }); const fs = el('input.zk-input.num.selectable', { type: 'number', min: 7, max: 16, value: 10 });
    const ret = el('textarea.zk-textarea.selectable', { rows: 3, placeholder: 'Return address (optional)', value: S.prefs.ret || '', style: { width: '100%' } });
    const colChecks = ['Name', 'Phone', 'Email', 'Company', 'Address', 'Birthday'].map((n) => { const c = el('input.zk-check', { type: 'checkbox', checked: ['Name', 'Phone', 'Email', 'Company'].includes(n) }); return { n, c, node: el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, c, n) }; });
    const letters = el('input.zk-check', { type: 'checkbox', checked: true }); const notes = el('input.zk-check', { type: 'checkbox' });
    const row = (l, n) => el('.opt', el('span', l), n);
    const refresh = () => { const k = style.value; sub.replaceChildren(...(k === 'list' ? [el('.seg2', colChecks.map((x) => x.node)), el('label.opt', el('span', 'Section letters'), letters)] : k === 'cards' ? [el('label.opt', el('span', 'Include notes'), notes)] : k === 'env' ? [row('Envelope', envSel), row('Address', addrSel), ret] : [row('Label sheet', labSel), row('Address', addrSel), row('Start at label', start), row('Font size (pt)', fs)])); };
    style.onchange = refresh; refresh();
    const r = await zk.sheet({ title: 'Print Contacts', body: el('.dlg', row('Style', style), row('Contacts', src), sub), buttons: [{ label: 'Cancel', value: null }, { label: 'Print…', primary: true, value: 'ok' }], width: 480 });
    if (r !== 'ok') return; const list = src.value === 'selected' ? sel : src.value === 'list' ? shown : S.contacts; if (!list.length) return zk.alert('Nothing to print', 'No contacts match that choice.');
    if (style.value === 'env') { S.prefs.ret = ret.value; ZC.prefsSave(); }
    const skipped = build(style.value, list, { title: src.value === 'all' ? 'All Contacts' : ZC.viewName(), cols: colChecks.filter((x) => x.c.checked).map((x) => x.n), letters: letters.checked, notes: notes.checked, env: envSel.value, addr: addrSel.value, ret: ret.value.trim(), label: labSel.value, start: Math.max(1, +start.value || 1), fs: zk.clamp(+fs.value || 10, 7, 16) });
    if (skipped && skipped === list.length) return zk.alert('No addresses', 'None of the chosen contacts has an address to print.');
    if (skipped) zk.toast(`${skipped} contact${skipped > 1 ? 's' : ''} without an address skipped`, 2600);
    setTimeout(() => zeng.print(), 120);
  };
  ZC._buildPrint = build;
})();
