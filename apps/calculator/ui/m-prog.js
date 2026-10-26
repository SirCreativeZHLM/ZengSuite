/* Programmer mode: base-synchronised display, bit grid, word size, signed/unsigned, bitwise keypad. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const BASES = [[16, 'HEX'], [10, 'DEC'], [8, 'OCT'], [2, 'BIN']];
  const WORDS = [[64, 'QWORD'], [32, 'DWORD'], [16, 'WORD'], [8, 'BYTE']];
  const k = (id, label, aria, cls = '', extra = {}) => Object.assign({ id, label, aria, cls }, extra);
  const NUM = (d) => k(d, d.toUpperCase(), d.toUpperCase(), 'num');
  const OP = (id, label, aria) => k(id, label, aria, 'op');
  const FNK = (id, label, aria) => k(id, label, aria, '');
  const LEFT = [
    [FNK('lp', '(', 'Open parenthesis'), FNK('rp', ')', 'Close parenthesis'), FNK('lsh', '&lt;&lt;', 'Left shift'), FNK('rsh', '&gt;&gt;', 'Right shift'), FNK('rol', 'RoL', 'Rotate left'), FNK('ror', 'RoR', 'Rotate right')],
    [NUM('a'), NUM('b'), NUM('c'), FNK('and', 'AND', 'Bitwise and'), FNK('or', 'OR', 'Bitwise or'), FNK('xor', 'XOR', 'Bitwise exclusive or')],
    [NUM('d'), NUM('e'), NUM('f'), FNK('nand', 'NAND', 'Bitwise not and'), FNK('nor', 'NOR', 'Bitwise not or'), FNK('not', 'NOT', 'Bitwise not')],
    [FNK('ac', 'AC', 'All clear'), FNK('back', '⌫', 'Delete last digit'), FNK('neg', '+/−', 'Change sign'), FNK('mod', 'Mod', 'Modulo'), FNK('ff', 'FF', 'Type FF'), FNK('00', '00', 'Type 00')],
  ];
  const RIGHT = [
    [NUM('7'), NUM('8'), NUM('9'), OP('div', '÷', 'Divide')], [NUM('4'), NUM('5'), NUM('6'), OP('mul', '×', 'Multiply')], [NUM('1'), NUM('2'), NUM('3'), OP('sub', '−', 'Subtract')],
    [Object.assign(NUM('0'), { cls: 'num wide' }), OP('eq', '=', 'Equals'), OP('add', '+', 'Add')],
  ];

  window.ZM.prog = function (H, root) {
    const st = new C.ProgState({ group: H.settings.group, sepChar: H.sep.group });
    root.classList.add('zc-prog'); root.replaceChildren();
    const exprEl = zk.el('.zc-expr', { 'aria-hidden': 'true' }), mainEl = zk.el('.zc-main.selectable', { role: 'status', 'aria-live': 'polite', 'aria-label': 'Display', tabindex: 0 }), indEl = zk.el('.zc-ind');
    const display = zk.el('.zc-display', { style: 'min-height:3.4rem' }, indEl, exprEl, mainEl);
    const basesEl = zk.el('.zc-bases', { role: 'group', 'aria-label': 'Number bases' });
    const bar = zk.el('.zc-bar'); const bitsEl = zk.el('.zc-bits-wrap', { style: 'display:flex;flex-direction:column;gap:2px' });
    const pkeys = zk.el('.zc-pkeys', { role: 'group', 'aria-label': 'Programmer keys' });
    root.append(display, basesEl, bar, bitsEl, pkeys);
    const baseRows = {}, btns = {};
    let ready;

    for (const [b, name] of BASES) {
      const row = zk.el('.zc-base', zk.el('button', { type: 'button', 'aria-label': name + ' value', onclick: () => setBase(b) }, zk.el('span.bl', name), zk.el('span.bv.selectable')));
      baseRows[b] = row; basesEl.append(row);
    }
    const seg = zk.el('.zk-seg', { role: 'group', 'aria-label': 'Word size' });
    for (const [n, name] of WORDS) seg.append(zk.el('button', { type: 'button', 'data-bits': n, onclick: () => { st.setBits(n); persist(); refresh(); } }, name));
    const signBtn = zk.el('button.zc-chip', { type: 'button', 'aria-label': 'Signed or unsigned', onclick: () => { st.setSigned(!st.signed); persist(); refresh(); } });
    bar.append(seg, signBtn, zk.el('span.zk-spacer'), zk.el('span.zc-note', { id: 'prog-hint' }, ''));

    const bitBtns = [];
    function buildBits() {
      bitsEl.replaceChildren(); bitBtns.length = 0; const rows = st.bits / 16 > 1 ? st.bits / 16 : 1; const per = Math.min(16, st.bits);
      for (let r = 0; r < rows; r++) {
        const idx = zk.el('.zc-bits', { 'aria-hidden': 'true', style: `padding-bottom:0;padding-top:0;grid-template-columns:repeat(${per},minmax(0,1fr))` }), row = zk.el('.zc-bits', { role: 'group', 'aria-label': 'Bits ' + (st.bits - 16 * r - 1) + ' to ' + (st.bits - 16 * r - per), style: `padding-top:0;padding-bottom:0;grid-template-columns:repeat(${per},minmax(0,1fr))` });
        for (let c = 0; c < per; c++) {
          const i = st.bits - 16 * r - 1 - c;
          idx.append(zk.el('.zc-bitidx' + (c % 4 === 0 ? '.gap' : ''), c % 4 === 0 ? String(i) : ''));
          const b = zk.el('button.zc-bit' + (c % 4 === 0 && c ? '.gap' : ''), { type: 'button', 'aria-label': 'Bit ' + i, 'data-i': i }); H.bindKey(b, () => { st.setValue(C.toggleBit(st.value(), i, st.bits)); refresh(); }); bitBtns[i] = b; row.append(b);
        }
        bitsEl.append(idx, row);
      }
    }
    function makeKey(d) {
      const b = zk.el('button.zc-key' + (d.cls ? '.' + d.cls.split(' ').join('.') : ''), { type: 'button', 'aria-label': d.aria, title: d.aria, 'data-id': d.id }); b.innerHTML = d.label; btns[d.id] = b;
      H.bindKey(b, () => press(d.id)); return b;
    }
    LEFT.forEach((r, ri) => r.forEach((d) => pkeys.append(makeKey(d)))); // placed by explicit grid areas below
    RIGHT.forEach((r) => r.forEach((d) => pkeys.append(makeKey(d))));
    // 10-column grid: left block columns 1-6, right block columns 7-10
    LEFT.forEach((r, ri) => r.forEach((d, ci) => { const b = btns[d.id]; b.style.gridColumn = String(ci + 1); b.style.gridRow = String(ri + 1); }));
    RIGHT.forEach((r, ri) => { let ci = 7; r.forEach((d) => { const b = btns[d.id]; b.style.gridColumn = ci + (d.cls.includes('wide') ? ' / span 2' : ''); b.style.gridRow = String(ri + 1); ci += d.cls.includes('wide') ? 2 : 1; }); btns['0'].style.paddingLeft = '1.2rem'; });
    btns['0'].style.justifyContent = 'flex-start';

    const KEYMAP = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '&': 'and', '|': 'or', '^': 'xor', '~': 'not', '<': 'lsh', '>': 'rsh', '(': 'lp', ')': 'rp', Enter: 'eq', '=': 'eq', Backspace: 'back', Escape: 'clear', Delete: 'ac' };
    function press(id) {
      const before = st.history.length;
      if (id === 'ff') { st.press('f'); st.press('f'); } else if (id === '00') { st.press('0'); st.press('0'); } else st.press(id);
      if (st.history.length > before) { const e = st.history[0]; H.addHistory({ expr: e.expr, result: e.result, raw: st.cur.toString(), bits: st.bits, kind: 'prog', mode: 'programmer' }); }
      refresh();
    }
    function setBase(b) { st.setBase(b); persist(); refresh(); }
    function onKey(e) {
      const key = e.key; let id = null;
      if (/^[0-9]$/.test(key)) id = key; else if (/^[a-fA-F]$/.test(key) && st.base === 16) id = key.toLowerCase();
      else if (KEYMAP[key]) id = KEYMAP[key];
      if (!id) return false;
      H.flash(btns[id === 'clear' ? 'ac' : id]); if (id === 'clear') { st.press('clear'); refresh(); return true; } press(id); return true;
    }
    function persist() { H.save('prog', { base: st.base, bits: st.bits, signed: st.signed }); }
    function refresh() {
      st.group = H.settings.group; st.sepChar = H.sep.group;
      mainEl.textContent = st.display(); mainEl.classList.toggle('err', !!st.error);
      exprEl.textContent = st.exprText();
      indEl.textContent = st.overflow ? 'Overflow' : '';
      const v = st.value();
      for (const [b] of BASES) { const row = baseRows[b]; row.classList.toggle('on', st.base === b); row.querySelector('.bv').textContent = C.formatBase(v, b, { bits: st.bits, signed: st.signed, group: st.group, sep: st.sepChar }); row.querySelector('button').setAttribute('aria-pressed', st.base === b); }
      seg.querySelectorAll('button').forEach((b) => { const on = +b.dataset.bits === st.bits; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      signBtn.textContent = st.signed ? 'Signed (two’s complement)' : 'Unsigned'; signBtn.setAttribute('aria-pressed', st.signed); signBtn.title = 'Toggle between signed two’s complement and unsigned';
      if (bitBtns.length !== st.bits) buildBits();
      for (let i = 0; i < st.bits; i++) { const one = C.bitAt(v, i); const b = bitBtns[i]; b.textContent = one ? '1' : '0'; b.classList.toggle('one', one); b.setAttribute('aria-pressed', one); }
      const digits = '0123456789abcdef';
      for (const d of digits) { const b = btns[d]; if (b) b.disabled = digits.indexOf(d) >= st.base; }
      fit();
    }
    function fit() {
      const avail = display.clientWidth - 2 * parseFloat(getComputedStyle(display).paddingLeft); if (avail <= 0) return; const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const max = 2.3 * rem; mainEl.style.fontSize = max + 'px'; const sw = mainEl.scrollWidth; if (sw > avail) mainEl.style.fontSize = Math.max(1.2 * rem, Math.floor(max * avail / sw)) + 'px'; mainEl.scrollLeft = mainEl.scrollWidth;
    }
    ready = (async () => { const p = await H.load('prog', null); if (p) { st.base = p.base || 10; st.bits = p.bits || 64; st.signed = p.signed !== false; } buildBits(); refresh(); })();
    new ResizeObserver(fit).observe(display);
    return {
      el: root, ready, refresh, resize: fit, show: refresh, onKey, undo: () => press('back'),
      copyText() { if (st.error) return null; return C.formatBase(st.value(), st.base, { bits: st.bits, signed: st.signed, group: false }); },
      paste(text) {
        try { const t = text.trim().replace(/[\s,_]/g, ''); const r = C.evalProg(/^[-+]?(0x|0b|0o)/i.test(t) || st.base !== 10 && /^[0-9a-f]+$/i.test(t) ? t : t.replace(/^\+/, ''), { bits: st.bits, signed: st.signed, base: /^[-+]?(0x|0b|0o)/i.test(t) ? 10 : st.base }); st.setValue(r.pattern); st.error = null; refresh(); }
        catch (e) { zk.toast('Clipboard does not contain a number', 1500); }
      },
      useResult(e) { if (e.kind === 'prog' && e.raw != null) st.setValue(BigInt(e.raw)); else { try { st.setValue(C.Dec.parse(e.result).trunc().toBigInt()); } catch (x) { return; } } refresh(); },
      state: st,
    };
  };
})();
