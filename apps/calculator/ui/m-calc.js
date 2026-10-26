/* Basic + Scientific calculator surface. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const ANGLES = ['deg', 'rad', 'grad'];

  // [id, label(html), aria, class, alt?]
  const k = (id, label, aria, cls = '', alt = null) => ({ id, label, aria, cls, alt });
  const NUM = (d) => k(d, d, d, 'num');
  const OPS = { add: k('add', '+', 'Add', 'op'), sub: k('sub', '−', 'Subtract', 'op'), mul: k('mul', '×', 'Multiply', 'op'), div: k('div', '÷', 'Divide', 'op') };
  const TRAY = [
    [k('clear', 'AC', 'All clear', ''), k('neg', '+/−', 'Change sign', ''), k('pct', '%', 'Percent', '')],
    [NUM('7'), NUM('8'), NUM('9')], [NUM('4'), NUM('5'), NUM('6')], [NUM('1'), NUM('2'), NUM('3')],
    [Object.assign(NUM('0'), { cls: 'num wide' }), k('.', '.', 'Decimal point', 'num')],
  ];
  const RAIL = [OPS.div, OPS.mul, OPS.sub, OPS.add, k('eq', '=', 'Equals', 'op eq')];
  const LEFT = [
    [k('sec', '2<sup>nd</sup>', 'Second function', 'toggle'), k('lp', '(', 'Open parenthesis'), k('rp', ')', 'Close parenthesis'), k('mc', 'mc', 'Memory clear'), k('mplus', 'm+', 'Memory add'), k('mminus', 'm−', 'Memory subtract'), k('mr', 'mr', 'Memory recall')],
    [k('sq', 'x<sup>2</sup>', 'x squared', '', k('cube', 'x<sup>3</sup>', 'x cubed')), k('sqrt', '<span class="it">√x</span>', 'Square root', '', k('cbrt', '<sup>3</sup>√x', 'Cube root')),
      k('pow', 'x<sup>y</sup>', 'x to the power y', '', k('yroot', '<sup>y</sup>√x', 'y-th root of x')), k('exp', 'e<sup>x</sup>', 'e to the power x', '', k('twox', '2<sup>x</sup>', '2 to the power x')),
      k('tenx', '10<sup>x</sup>', '10 to the power x'), k('inv', '1/x', 'Reciprocal'), k('fact', 'x!', 'Factorial')],
    [k('ln', 'ln', 'Natural logarithm', '', k('log2', 'log<sub>2</sub>', 'Base 2 logarithm')), k('log', 'log<sub>10</sub>', 'Base 10 logarithm', '', k('logy', 'log<sub>y</sub>', 'Logarithm with base y')),
      k('sin', 'sin', 'Sine'), k('cos', 'cos', 'Cosine'), k('tan', 'tan', 'Tangent'), k('hyp', 'hyp', 'Hyperbolic functions', 'toggle'), k('ee', 'EE', 'Exponent entry')],
    [k('pi', 'π', 'Pi'), k('e', '<span class="it">e</span>', 'Euler number'), k('rand', 'Rand', 'Random number'), k('abs', '|x|', 'Absolute value'), k('mod', 'mod', 'Modulo'), k('ncr', 'nCr', 'Combinations'), k('npr', 'nPr', 'Permutations')],
    [Object.assign(k('back', '⌫', 'Delete last digit'), { cls: 'wide' }), Object.assign(k('ans', 'Ans', 'Previous answer'), { cls: 'wide' }), Object.assign(k('angle', 'Deg', 'Angle unit'), { cls: 'wide' })],
  ];
  const TRIG = { sin: ['sin', 'asin', 'sinh', 'asinh'], cos: ['cos', 'acos', 'cosh', 'acosh'], tan: ['tan', 'atan', 'tanh', 'atanh'] };
  const TRIG_LABEL = { sin: 'sin', asin: 'sin<sup>−1</sup>', sinh: 'sinh', asinh: 'sinh<sup>−1</sup>', cos: 'cos', acos: 'cos<sup>−1</sup>', cosh: 'cosh', acosh: 'cosh<sup>−1</sup>', tan: 'tan', atan: 'tan<sup>−1</sup>', tanh: 'tanh', atanh: 'tanh<sup>−1</sup>' };
  const TRIG_ARIA = { sin: 'Sine', asin: 'Inverse sine', sinh: 'Hyperbolic sine', asinh: 'Inverse hyperbolic sine', cos: 'Cosine', acos: 'Inverse cosine', cosh: 'Hyperbolic cosine', acosh: 'Inverse hyperbolic cosine', tan: 'Tangent', atan: 'Inverse tangent', tanh: 'Hyperbolic tangent', atanh: 'Inverse hyperbolic tangent' };
  const BINARY_IDS = ['add', 'sub', 'mul', 'div', 'pow', 'yroot', 'logy', 'mod', 'ncr', 'npr'];

  window.ZM.calc = function (H, root, modeId) {
    const sci = modeId === 'scientific';
    const state = new C.CalcState({ angle: H.settings.angle, sep: H.sep, group: H.settings.group });
    root.classList.add('zc-calc', sci ? 'zc-sci' : 'zc-basic'); root.replaceChildren();
    const exprEl = zk.el('.zc-expr', { 'aria-hidden': 'true' });
    const mainEl = zk.el('.zc-main.selectable', { role: 'status', 'aria-live': 'polite', 'aria-label': 'Display', tabindex: 0 });
    const indEl = zk.el('.zc-ind');
    const workBtn = zk.el('button.zk-btn.zc-workbtn', { type: 'button', hidden: true, title: 'Show how this result was computed', 'aria-label': 'Show work', onclick: () => showWork() }, zk.icon('list-tree', 13), 'Show work');
    const display = zk.el('.zc-display', indEl, exprEl, mainEl, workBtn);
    const keys = zk.el('.zc-keys', { role: 'group', 'aria-label': 'Keys' });
    root.append(display, keys);
    let second = false, hyp = false; const btns = {}; let sizeKey = '';

    const press = (id) => {
      if (id === 'sec') { second = !second; return labels(); }
      if (id === 'hyp') { hyp = !hyp; return labels(); }
      if (id === 'angle') { return setAngle(ANGLES[(ANGLES.indexOf(state.angle) + 1) % 3]); }
      let realId = id; const b = btns[id];
      if (b && b._def) { realId = resolve(b._def); }
      const before = state.history.length; state.press(realId);
      if (state.history.length > before) { const e = state.history[0]; H.addHistory({ expr: e.expr, result: e.result, ev: e.ev, angle: e.angle, kind: 'dec', mode: modeId }); }
      if (second && ['sq', 'sqrt', 'pow', 'exp', 'ln', 'log', 'sin', 'cos', 'tan'].includes(id) && false) second = false;
      refresh();
    };
    const resolve = (def) => {
      if (TRIG[def.id]) return TRIG[def.id][(second ? 1 : 0) + (hyp ? 2 : 0)];
      return second && def.alt ? def.alt.id : def.id;
    };
    function makeKey(def) {
      const b = zk.el('button.zc-key' + (def.cls ? '.' + def.cls.split(' ').join('.') : ''), { type: 'button', 'aria-label': def.aria, 'data-id': def.id, title: def.aria });
      b.innerHTML = def.label; b._def = def; btns[def.id] = b; H.bindKey(b, () => press(def.id)); return b;
    }
    // ---- build keys: [scientific block] [number tray] [operator rail]
    const pad = zk.el('.zc-pad'); const tray = zk.el('.zc-tray'); const rail = zk.el('.zc-rail');
    if (!sci) {
      const mem = zk.el('.zc-memrow');
      for (const d of [k('mc', 'mc', 'Memory clear', 'sm'), k('mplus', 'm+', 'Memory add', 'sm'), k('mminus', 'm−', 'Memory subtract', 'sm'), k('mr', 'mr', 'Memory recall', 'sm'), k('back', '⌫', 'Delete last digit', 'sm')]) mem.append(makeKey(d));
      keys.append(mem);
    } else {
      const block = zk.el('.zc-sciblock');
      for (let r = 0; r < 5; r++) for (const d of LEFT[r]) { const b = makeKey(d); if (d.cls.includes('wide')) b.style.gridColumn = d.id === 'angle' ? 'span 3' : 'span 2'; if (['mc', 'mplus', 'mminus', 'mr'].includes(d.id)) b.classList.add('sm'); block.append(b); }
      pad.append(block);
    }
    for (const row of TRAY) for (const d of row) tray.append(makeKey(d));
    for (const d of RAIL) rail.append(makeKey(d));
    pad.append(tray, rail); keys.append(pad);

    function labels() {
      for (const id in btns) {
        const b = btns[id], d = b._def;
        if (TRIG[id]) { const r = TRIG[id][(second ? 1 : 0) + (hyp ? 2 : 0)]; b.innerHTML = TRIG_LABEL[r]; b.setAttribute('aria-label', TRIG_ARIA[r]); b.title = TRIG_ARIA[r]; }
        else if (d.alt) { const v = second ? d.alt : d; b.innerHTML = v.label; b.setAttribute('aria-label', v.aria); b.title = v.aria; }
      }
      if (btns.sec) { btns.sec.classList.toggle('on', second); btns.sec.setAttribute('aria-pressed', second); }
      if (btns.hyp) { btns.hyp.classList.toggle('on', hyp); btns.hyp.setAttribute('aria-pressed', hyp); }
      if (btns.angle) btns.angle.textContent = { deg: 'Degrees', rad: 'Radians', grad: 'Gradians' }[state.angle];
    }
    function fit() {
      const avail = display.clientWidth - 2 * parseFloat(getComputedStyle(display).paddingLeft); if (avail <= 0) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize); const max = (sci ? 3.2 : 3.6) * rem, min = 1.5 * rem;
      mainEl.style.fontSize = max + 'px'; const sw = mainEl.scrollWidth;
      if (sw > avail) mainEl.style.fontSize = Math.max(min, Math.floor(max * avail / sw)) + 'px';
      mainEl.scrollLeft = mainEl.scrollWidth; exprEl.scrollLeft = exprEl.scrollWidth;
    }
    function refresh() {
      const err = !!state.error; mainEl.textContent = state.displayText(); mainEl.classList.toggle('err', err);
      let ex = state.exprText(); if (!ex && state.fresh && state.history[0]) ex = state.history[0].expr + ' ='; exprEl.textContent = ex;
      indEl.textContent = (state.hasMemory ? 'M' : '') + (sci ? (state.hasMemory ? '  ' : '') + { deg: 'Deg', rad: 'Rad', grad: 'Grad' }[state.angle] : '');
      const lp = state.pieces[state.pieces.length - 1]; const active = lp && lp.k === 'o' && !state.entry ? lp.op : null;
      for (const id of BINARY_IDS) if (btns[id]) btns[id].classList.toggle('active', id === active);
      if (btns.clear) { const lbl = state.entry && !state.error ? 'C' : 'AC'; if (btns.clear.textContent !== lbl) { btns.clear.textContent = lbl; btns.clear.setAttribute('aria-label', lbl === 'C' ? 'Clear entry' : 'All clear'); } }
      for (const id of ['mc', 'mr']) if (btns[id]) btns[id].classList.toggle('has', state.hasMemory);
      const ws = workSource(); workBtn.hidden = !ws; fit();
    }
    function workSource() {
      if (state.error) return null;
      if (state.fresh && state.history[0]) { const e = state.history[0]; return e.ev ? { src: e.ev, angle: e.angle || state.angle } : null; }
      if (state.pieces.some((p) => p.k === 'o') && !state.entry) { const s = state.exprString(); return s && state.previewValue() ? { src: s, angle: state.angle } : null; }
      if (state.pieces.some((p) => p.k === 'o') && state.entry) { const keep = state.entry; try { state.commit(); const s = state.exprString(); state.pieces.pop(); state.entry = keep; return state.previewValue() ? { src: s, angle: state.angle } : null; } catch (e) { return null; } }
      return null;
    }
    function showWork() { const ws = workSource(); if (ws) H.work.openExpr({ src: ws.src, angle: ws.angle, title: 'Show work' }); else H.toast('Enter a calculation first'); }
    function setAngle(a) { state.angle = a; H.settings.angle = a; H.saveSettings(); labels(); refresh(); }

    // ---- keyboard
    const MAP = { '+': 'add', '-': 'sub', '*': 'mul', x: 'mul', X: 'mul', '/': 'div', '^': 'pow', '%': 'pct', Enter: 'eq', '=': 'eq', Backspace: 'back', Escape: 'clear', Delete: 'ac', c: 'clear', C: 'clear' };
    const SCI_MAP = { '(': 'lp', ')': 'rp', '!': 'fact', e: 'ee', p: 'pi', s: 'sin', o: 'cos', t: 'tan', l: 'log', n: 'ln', q: 'sq', '@': 'sqrt', r: 'inv', m: 'mod', '|': 'abs' };
    function onKey(e) {
      let id = null; const key = e.key;
      if (/^[0-9]$/.test(key)) id = key;
      else if (key === '.' || (key === ',' && H.sep.decimal === ',')) id = '.';
      else if (MAP[key]) id = MAP[key];
      else if (sci && SCI_MAP[key]) id = SCI_MAP[key];
      else if (key === ' ' && document.activeElement && document.activeElement.classList.contains('zc-key')) return false;
      if (!id) return false;
      if (id === 'ac') { H.flash(btns.clear); press('ac'); return true; }
      H.flash(btns[id]); press(id);
      return true;
    }
    function copyText() { if (state.error) return null; return C.format(state.displayValue(), { group: false, sep: H.sep, digits: 17 }); }
    function paste(text) {
      let d = C.parseNumberText(text, H.sep);
      if (!d) { try { d = C.evaluate(text.trim().replace(/,/g, ''), { angle: state.angle }); } catch (e) { d = null; } }
      if (!d) { zk.toast('Clipboard does not contain a number', 1500); return; }
      state.pasteValue(d); refresh();
    }
    const ro = new ResizeObserver(() => { const w = display.clientWidth; if (String(w) !== sizeKey) { sizeKey = String(w); fit(); } }); ro.observe(display);
    labels(); refresh();
    return {
      el: root, refresh: () => { state.group = H.settings.group; state.sep = H.sep; refresh(); }, resize: fit, show() { state.group = H.settings.group; labels(); refresh(); },
      onKey, copyText, paste, undo: () => press('back'), showWork, canShowWork: () => !!workSource(),
      useResult(e) { state.pasteValue(C.Dec.parse(e.result)); refresh(); }, useExpr(e) { state.loadExpr(e.expr.replace(/\s*=\s*$/, ''), C.Dec.parse(e.result)); refresh(); },
      angle: sci ? { get: () => state.angle, set: setAngle } : null,
      state,
    };
  };
})();
