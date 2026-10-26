/* Show Work panel: steps with precedence highlighting, evaluation tree, "what changed" editing, share as text or image card. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  const RANK_NAME = { 6: 'functions and parentheses', 5: 'postfix ! % °', 4: 'powers', 3: 'unary minus', 2: 'multiply, divide, mod', 1: 'add, subtract' };

  window.ZM.work = function (H) {
    const stage = document.getElementById('stage');
    const panel = zk.el('aside.zc-work', { hidden: true, role: 'dialog', 'aria-label': 'Show work' });
    stage.append(panel);
    let spring = null, isOpen = false, cfg = null, base = null, alt = null, diff = null, ov = {}, view = 'steps', whatText = '';

    const title = zk.el('strong', 'Show work');
    const closeBtn = zk.el('button.zk-btn.icon', { type: 'button', 'aria-label': 'Close Show work', title: 'Close', onclick: () => close() }, zk.icon('x'));
    const head = zk.el('header', zk.icon('list-tree'), title, zk.el('span.zk-spacer'), closeBtn);
    const body = zk.el('.zw-body');
    const foot = zk.el('footer');
    panel.append(head, body, foot);

    function open(c) {
      cfg = c; ov = {}; diff = null; whatText = '';
      if (c.model) { base = alt = c.model; } else {
        try { base = alt = C.explain(c.src, { vars: c.vars, varNames: c.varNames, units: c.units, angle: c.angle, fmt: H.fmtOpts() }); }
        catch (e) { H.toast('Cannot show work: ' + e.message); return; }
      }
      title.textContent = c.title || 'Show work'; view = 'steps'; render();
      panel.style.pointerEvents = ''; if (isOpen) return; isOpen = true; panel.hidden = false;
      if (spring) spring.stop(); const W = panel.offsetWidth || 400;
      spring = zk.spring({ from: parseFloat(panel.dataset.x || W), to: 0, response: 0.4, onUpdate: (x) => { panel.dataset.x = x; panel.style.transform = `translateX(${x}px)`; } });
      setTimeout(() => closeBtn.focus(), 60);
    }
    function close() {
      if (!isOpen) return; isOpen = false; panel.style.pointerEvents = 'none'; if (spring) spring.stop(); const W = panel.offsetWidth || 400;
      spring = zk.spring({ from: parseFloat(panel.dataset.x || 0), to: W, response: 0.28, eps: 0.5, onUpdate: (x) => { panel.dataset.x = x; panel.style.transform = `translateX(${x}px)`; }, onDone: () => { panel.hidden = true; } });
    }

    // ------------------------------------------------ segment rendering
    function segEls(segs, editable) {
      const out = []; let group = null;
      const push = (el, hl) => { if (hl) { if (!group) { group = zk.el('mark.zw-hl'); out.push(group); } group.append(el); } else { group = null; out.push(el); } };
      for (const s of segs) {
        let el;
        if (s.k === 'num' && editable) el = numButton(s);
        else if (s.k === 'op') { el = zk.el('span.zw-op.r' + (s.rank || 6), s.s); if (editable && s.order) el.append(zk.el('sup.zw-ord', String(s.order))); }
        else if (s.k === 'val') el = zk.el('span.zw-val', s.s);
        else if (s.k === 'var') { el = zk.el('span.zw-var', s.s); if (s.hint) el.title = s.hint; }
        else el = zk.el('span' + (s.k === 'num' ? '.zw-n' : ''), s.s);
        push(el, s.hl);
      }
      return out;
    }
    const curText = (id) => (ov[id] !== undefined ? ov[id] : (base.leaves.find((l) => l.id === id) || {}).text);
    function numButton(s) {
      const b = zk.el('button.zw-num', { type: 'button', 'data-id': s.id, 'aria-label': 'Number ' + s.s + '. Click to edit, drag sideways to scrub, arrow keys step.', title: 'Click to try another number, or drag sideways' }, s.s);
      if (ov[s.id] !== undefined) b.classList.add('edited');
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; e.preventDefault(); let v0 = null; try { v0 = C.Dec.parse(curText(s.id)); } catch (x) { /* not numeric */ }
        const step = v0 && !v0.isInt() ? Math.pow(10, v0.e) : (v0 && v0.abs().cmp(100) >= 0 ? Math.pow(10, Math.floor(Math.log10(v0.abs().toNumber())) - 1) : 1);
        scrub = { id: s.id, x: e.clientX, v0, step, moved: false, pid: e.pointerId }; body.setPointerCapture(e.pointerId);
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); try { setOverride(s.id, C.Dec.parse(curText(s.id)).add(e.key === 'ArrowUp' ? 1 : -1).toPlain(), true); } catch (x) { /* ignore */ } } });
      return b;
    }
    let scrub = null;
    body.addEventListener('pointermove', (e) => {
      if (!scrub || !scrub.v0) return; const dx = e.clientX - scrub.x; if (!scrub.moved && Math.abs(dx) < 4) return; scrub.moved = true;
      const n = Math.round(dx / 5); setOverride(scrub.id, scrub.v0.add(C.Dec.of(String(n)).mul(C.Dec.parse(String(scrub.step)))).toPlain(), true);
    });
    const endScrub = (e) => { if (!scrub) return; const sc = scrub; scrub = null; try { body.releasePointerCapture(sc.pid); } catch (x) { /* released */ } if (!sc.moved && e.type === 'pointerup') { const btn = body.querySelector(`.zw-num[data-id="${sc.id}"]`); if (btn) editNumber({ id: sc.id }, btn); } };
    body.addEventListener('pointerup', endScrub); body.addEventListener('pointercancel', endScrub);
    function editNumber(s, btn) {
      const cur = curText(s.id);
      const inp = zk.el('input.zw-edit', { value: cur, 'aria-label': 'New value', inputmode: 'decimal', size: Math.max(3, String(cur).length + 1) }); btn.replaceWith(inp); inp.focus(); inp.select();
      const done = (ok) => { if (inp._done) return; inp._done = true; if (ok) { const d = C.parseNumberText(inp.value, H.sep); if (d) { setOverride(s.id, d.toPlain()); return; } H.toast('Not a number'); } render(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
      inp.addEventListener('blur', () => done(true));
    }
    let pendingRaf = 0;
    function setOverride(id, value, live) {
      const orig = (base.leaves.find((l) => l.id === id) || {}).text; if (orig !== undefined && C.Dec.parse(orig).eq(C.Dec.parse(value))) delete ov[id]; else ov[id] = value;
      recompute(); if (live) { if (!pendingRaf) pendingRaf = requestAnimationFrame(() => { pendingRaf = 0; render(true); }); } else render();
    }
    function recompute() {
      if (!Object.keys(ov).length) { alt = base; diff = null; whatText = ''; return; }
      try { alt = C.explain(base.src, { vars: cfg.vars, varNames: cfg.varNames, units: cfg.units, angle: cfg.angle, fmt: H.fmtOpts(), overrides: ov }); diff = C.diffWork(base, alt); }
      catch (e) { alt = base; diff = null; }
      whatText = Object.keys(ov).map((id) => { const l = base.leaves.find((x) => x.id === +id); return `${l ? l.text : '?'} → ${ov[id]}`; }).join(', ');
    }

    // ------------------------------------------------ views
    function render(keepScroll) {
      const st = body.scrollTop; body.replaceChildren(); foot.replaceChildren();
      const m = alt;
      if (m.kind === 'expr') {
        const exprBox = zk.el('.zw-expr.selectable', { 'aria-label': 'Expression: ' + m.headerText }, ...segEls(m.header, true));
        body.append(exprBox);
        const res = zk.el('.zw-result', { role: 'status', 'aria-live': 'polite' }, zk.el('span.eq', '='), zk.el('span.v.selectable', m.resultText));
        if (diff && diff.changed) res.append(zk.el('span.zw-chg', `was ${diff.resultFrom}${diff.deltaText ? '  ' + diff.deltaText + (diff.pctText ? ' (' + diff.pctText + ')' : '') : ''}`));
        else if (diff) res.append(zk.el('span.zw-chg.same', 'no change'));
        body.append(res);
        if (Object.keys(ov).length) body.append(zk.el('.zw-whatif', zk.el('span', 'What if ' + whatText), zk.el('button.zk-btn', { type: 'button', onclick: () => { ov = {}; recompute(); render(); } }, 'Reset')));
        else if (m.leaves.length) body.append(zk.el('.zc-note', 'Click a number, or drag it sideways, to see what changes.'));
        const seg = zk.el('.zk-seg', { role: 'group', 'aria-label': 'View' }, ...[['steps', 'Steps'], ['tree', 'Tree']].map(([id, n]) => zk.el('button', { type: 'button', 'aria-pressed': view === id, class: view === id ? 'on' : '', onclick: () => { view = id; render(); } }, n)));
        body.append(zk.el('.zc-row', { style: 'justify-content:space-between' }, seg, legend(m)));
        if (view === 'steps') body.append(stepsList(m)); else body.append(treeView(m));
      } else {
        body.append(zk.el('.zw-expr.selectable', m.expr), zk.el('.zw-result', zk.el('span.eq', '='), zk.el('span.v.selectable', m.resultText)));
        body.append(m.steps.length ? genericSteps(m) : zk.el('.zc-note', 'Nothing to work out: the value is already the result.'));
      }
      const text = H.work.text();
      foot.append(zk.el('button.zc-btn', { type: 'button', onclick: () => H.copy(H.work.text()) }, 'Copy as text'), zk.el('button.zc-btn', { type: 'button', onclick: () => copyImage() }, 'Copy as image'),
        zk.el('button.zc-btn', { type: 'button', onclick: () => saveImage() }, 'Save image…'));
      if (keepScroll) body.scrollTop = st;
    }
    function legend(m) {
      const used = [...new Set(m.header.filter((s) => s.k === 'op').map((s) => s.rank))].sort((a, b) => b - a);
      const box = zk.el('.zw-legend', { 'aria-label': 'Order of operations legend' });
      used.forEach((r) => box.append(zk.el('span', zk.el('i.r' + r), RANK_NAME[r] || '')));
      return box;
    }
    function changedAt(i) { return diff && diff.steps.find((s) => s.i === i); }
    function stepsList(m) {
      if (!m.steps.length) return zk.el('.zc-note', 'Nothing to work out: it is already a single value.');
      const ol = zk.el('ol.zw-steps');
      m.steps.forEach((s) => {
        const ch = changedAt(s.i);
        const li = zk.el('li' + (ch ? '.chg' : ''), zk.el('span.zw-no', String(s.i)),
          zk.el('div.zw-line', zk.el('.zw-sx.selectable', ...segEls(s.segs.filter((x) => x.hl), false)), zk.el('span.zw-eq', '='), zk.el('span.zw-out.selectable', ch ? zk.el('s', ch.from) : '', ch ? ' ' : '', ch ? ch.to : s.valueText)),
          s.segs.length > s.segs.filter((x) => x.hl).length ? zk.el('.zw-ctx', ...segEls(s.segs, false)) : '', s.note ? zk.el('.zw-note', s.note) : '');
        ol.append(li);
      });
      return ol;
    }
    function genericSteps(m) { const ol = zk.el('ol.zw-steps'); m.steps.forEach((s, i) => ol.append(zk.el('li', zk.el('span.zw-no', String(i + 1)), zk.el('div.zw-line', zk.el('.zw-sx.selectable', s.plain)), s.note ? zk.el('.zw-note', s.note) : ''))); return ol; }
    function treeView(m) {
      const changedVals = new Map(); const bm = base;
      const baseVals = []; (function f(t) { baseVals.push(t.value); t.kids.forEach(f); })(bm.tree); let k = 0;
      const build = (t) => {
        const was = baseVals[k++]; const chg = diff && was !== t.value;
        const row = zk.el('.zw-trow' + (t.leaf ? '.leaf' : '') + (chg ? '.chg' : ''), t.order ? zk.el('span.zw-no.r' + t.rank, String(t.order)) : zk.el('span.zw-dot'), zk.el('span.zw-lab', t.label), zk.el('span.zw-tv.selectable', chg ? [zk.el('s', was), ' ', t.value] : t.value));
        const li = zk.el('li', row); if (t.kids.length) li.append(zk.el('ul', ...t.kids.map(build))); return li;
      };
      return zk.el('ul.zw-tree', { role: 'tree' }, build(m.tree));
    }

    // ------------------------------------------------ sharing
    function currentModel() { return alt; }
    function text() { return C.workText(alt, { diff, what: whatText }); }
    function cardCanvas() {
      const m = alt, css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), cs = getComputedStyle(document.body);
      const dark = matchMedia('(prefers-color-scheme: dark)').matches; const bg = dark ? '#121917' : '#f4f7f4', card = dark ? '#1b2522' : '#ffffff', fg = dark ? '#eef4f1' : '#14201d', sub = dark ? 'rgba(220,235,230,.62)' : 'rgba(30,50,45,.6)', acc = dark ? '#38d6bf' : '#0e8c7e', line = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.09)';
      const W = 760, pad = 36, font = (w, px) => `${w} ${px}px ${cs.fontFamily}`; const probe = document.createElement('canvas').getContext('2d');
      const wrap = (txt, f, maxW) => { probe.font = f; const words = txt.split(' '); const lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (probe.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; };
      const head = m.kind === 'expr' ? m.headerText : m.expr; const maxW = W - pad * 2;
      const hl = wrap(head, font(500, 30), maxW); const steps = m.steps.slice(0, 8);
      const stepLines = steps.map((s, i) => ({ t: `${i + 1}.  ${s.plain}`, n: s.note }));
      let y = pad + 20; const rows = []; // measure first
      let H0 = pad + 26 + hl.length * 40 + 14 + 54 + 20;
      stepLines.forEach((s) => { H0 += 30 + (s.n ? wrap(s.n, font(400, 15), maxW - 28).length * 20 : 0) + 6; });
      if (m.steps.length > 8) H0 += 26; if (diff && diff.changed) H0 += 44; H0 += 56;
      const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = Math.ceil(H0) * 2; const g = cv.getContext('2d'); g.scale(2, 2);
      g.fillStyle = bg; g.fillRect(0, 0, W, H0); g.fillStyle = card; rr(g, 12, 12, W - 24, H0 - 24, 22); g.fill(); g.strokeStyle = line; g.lineWidth = 1; g.stroke();
      g.textBaseline = 'alphabetic'; g.fillStyle = acc; rr(g, pad, pad - 4, 22, 22, 7); g.fill(); g.fillStyle = card; g.font = font(700, 14); g.fillText('=', pad + 6.5, pad + 12);
      g.fillStyle = sub; g.font = font(600, 14); g.fillText('Calc · Show work', pad + 32, pad + 12);
      y = pad + 26 + 30; g.fillStyle = fg; g.font = font(500, 30); hl.forEach((l) => { g.fillText(l, pad, y); y += 40; });
      y += 2; g.fillStyle = acc; g.font = font(700, 44); g.fillText('= ' + m.resultText, pad, y + 30); y += 54;
      if (diff && diff.changed) { g.fillStyle = sub; g.font = font(500, 15); g.fillText(`What if ${whatText}:  ${diff.resultFrom} → ${diff.resultTo}${diff.deltaText ? '  (' + diff.deltaText + (diff.pctText ? ', ' + diff.pctText : '') + ')' : ''}`, pad, y + 14); y += 44; }
      y += 8; g.strokeStyle = line; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); y += 28;
      stepLines.forEach((s) => { g.fillStyle = fg; g.font = font(500, 18); g.fillText(s.t, pad, y); y += 30; if (s.n) { g.fillStyle = sub; g.font = font(400, 15); wrap(s.n, font(400, 15), maxW - 28).forEach((l) => { g.fillText(l, pad + 28, y - 6); y += 20; }); y += 6; } });
      if (m.steps.length > 8) { g.fillStyle = sub; g.font = font(400, 15); g.fillText(`… and ${m.steps.length - 8} more steps`, pad, y); }
      g.fillStyle = sub; g.font = font(500, 13); g.textAlign = 'right'; g.fillText('Shown with Calc', W - pad, H0 - 30); g.textAlign = 'left';
      return cv;
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    const blobOf = () => new Promise((res) => cardCanvas().toBlob(res, 'image/png'));
    async function copyImage() {
      try { const b = await blobOf(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); zk.toast('Image copied', 1200); }
      catch (e) { saveImage(); }
    }
    async function saveImage() {
      try { const b = await blobOf(); const h = await zeng.files.saveAs(b, { name: 'Calc result.png', filters: [{ name: 'PNG image', exts: ['png'] }] }); if (h) zk.toast('Image saved', 1200); } catch (e) { zk.alert('Could not save image', e.message); }
    }
    const api = {
      open, close, isOpen: () => isOpen, text, cardCanvas, model: currentModel,
      openExpr: (c) => open(c), openModel: (model, c = {}) => open(Object.assign({ model }, c)),
      openEntry(e) {
        if (e.work) return open({ model: e.work, title: 'Show work' });
        if (e.ev) return open({ src: e.ev, angle: e.angle || 'deg', title: 'Show work' });
        H.toast('No steps were recorded for this result.');
      },
      setOverride: (id, v) => setOverride(id, v), overrides: () => ov, diff: () => diff,
    };
    return api;
  };
})();
