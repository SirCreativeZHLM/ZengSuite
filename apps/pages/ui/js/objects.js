/* ZengWrite objects: images, shapes (with resize handles + wrap), equations (LaTeX-ish -> MathML / OMML). */
(() => {
  'use strict';
  const P = window.P, flow = P.flow, stack = P.$('#stack'), ov = P.$('#objsel');

  /* ================= images ================= */
  const shrink = async (bytes, mime) => {
    if (!/^image\/(png|jpeg)$/.test(mime) || bytes.length < 3e6) return bytes;
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: mime })); const max = 2400; const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); if (k >= 1) return bytes;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise((r) => c.toBlob(r, mime, 0.9)); return b ? new Uint8Array(await b.arrayBuffer()) : bytes;
    } catch { return bytes; }
  };
  P.makeImg = async (bytes, mime, alt = '') => {
    bytes = await shrink(bytes, mime); const m = P.addMedia(bytes, mime); const sz = await P.imgSize(m.url); const g = P.geom();
    let w = sz.w * 0.75 >= 60 ? Math.min(sz.w, g.cw * 0.8, 520) : sz.w; let h = (w * sz.h) / sz.w; if (h > g.hb * 0.8) { h = g.hb * 0.8; w = (h * sz.w) / sz.h; }
    const img = document.createElement('img'); img.src = m.url; img.dataset.m = m.id; img.dataset.wrap = 'inline'; img.alt = alt; img.style.width = Math.round(w) + 'px'; img.style.height = Math.round(h) + 'px'; return img;
  };
  P.insertImageBytes = async (bytes, mime, name) => { const img = await P.makeImg(bytes, mime, (name || '').replace(/\.[^.]+$/, '')); P.insertNodeAtCaret(img); P.selectObj(img); return img; };
  P.insertImageFile = async (file) => { const ext = (file.name || '').split('.').pop(); return P.insertImageBytes(new Uint8Array(await file.arrayBuffer()), file.type || P.mimeOfExt(ext), file.name); };
  P.insertImageDialog = async () => {
    const hs = await zeng.files.open({ filters: [{ name: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }], multiple: true });
    for (const h of hs || []) { try { const b = new Uint8Array(await zeng.files.read(h)); await P.insertImageBytes(b, P.mimeOfExt(zeng.files.ext(h.name)), h.name); } catch (e) { zk.alert('Can’t insert “' + h.name + '”', e.message); } }
  };
  P.absorbDataImages = () => {
    for (const img of flow.querySelectorAll('img[src^="data:"]')) {
      const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(img.getAttribute('src')); if (!m) { img.remove(); continue; }
      try { const bytes = m[2] ? P.b64ToU8(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3])); const med = P.addMedia(bytes, m[1]); img.src = med.url; img.dataset.m = med.id; if (!img.dataset.wrap) img.dataset.wrap = 'inline'; } catch { img.remove(); }
    }
  };

  /* ================= shapes ================= */
  P.renderShape = (el) => {
    const w = Math.max(2, parseFloat(el.style.width) || 160), h = Math.max(2, parseFloat(el.style.height) || 100); const d = el.dataset;
    const fill = d.fill || 'none', stroke = d.stroke || 'none', sw = +d.sw || 0, kind = d.shape || 'rect'; const hs = sw / 2; let body = '';
    const st = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
    if (kind === 'rect') body = `<rect x="${hs}" y="${hs}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="${+d.r || 0}" ${st}/>`;
    else if (kind === 'ellipse') body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - hs)}" ry="${Math.max(0, h / 2 - hs)}" ${st}/>`;
    else if (kind === 'tri') body = `<polygon points="${w / 2},${hs} ${w - hs},${h - hs} ${hs},${h - hs}" ${st}/>`;
    else { let x1 = hs, y1 = hs, x2 = w - hs, y2 = h - hs; if (h <= 10) { y1 = y2 = h / 2; } else if (w <= 10) { x1 = x2 = w / 2; } else if (d.flip) { y1 = h - hs; y2 = hs; }
      const c = stroke === 'none' ? '#1d1d1f' : stroke; body = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw || 2}" stroke-linecap="round"/>`;
      if (kind === 'arrow') { const ang = Math.atan2(y2 - y1, x2 - x1), L = 8 + (sw || 2) * 2, a = 0.45; const p = (t) => `${x2 - L * Math.cos(ang + t)},${y2 - L * Math.sin(ang + t)}`; body += `<polygon points="${x2},${y2} ${p(-a)} ${p(a)}" fill="${c}" stroke="${c}" stroke-width="1" stroke-linejoin="round"/>`; } }
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
  };
  P.renderShapes = () => { for (const s of flow.querySelectorAll('.shp')) P.renderShape(s); };
  P.insertShape = (kind) => {
    const s = document.createElement('span'); s.className = 'shp'; s.setAttribute('contenteditable', 'false'); s.dataset.shape = kind; s.dataset.wrap = 'inline';
    if (kind === 'line' || kind === 'arrow') { s.dataset.stroke = '#1d1d1f'; s.dataset.sw = '2'; s.style.width = '160px'; s.style.height = '8px'; }
    else { s.dataset.fill = '#ff9f0a'; s.dataset.stroke = '#c77700'; s.dataset.sw = '2'; s.style.width = '150px'; s.style.height = kind === 'ellipse' ? '100px' : '90px'; if (kind === 'rect') s.dataset.r = '8'; }
    P.renderShape(s); P.insertNodeAtCaret(s); P.selectObj(s);
  };

  /* ================= selection overlay ================= */
  P.selObj = null; let dragging = null;
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  HANDLES.forEach((h) => { const d = document.createElement('div'); d.className = 'oh oh-' + h; d.dataset.h = h; ov.append(d); });
  P.isObj = (n) => n && n.nodeType === 1 && (n.tagName === 'IMG' || n.classList.contains('shp')) && flow.contains(n);
  P.selectObj = (el) => {
    P.selObj = el; const r = document.createRange(); r.selectNode(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); P.updateObjSel(); P.refreshSoon(); P.hfActive && P.endHF();
  };
  P.updateObjSel = () => {
    const el = P.selObj; if (!el || !flow.contains(el)) { ov.classList.add('zk-hidden'); if (el && !flow.contains(el)) P.selObj = null; return; }
    const z = P.zoom, sr = stack.getBoundingClientRect(), r = el.getBoundingClientRect();
    Object.assign(ov.style, { left: (r.left - sr.left) / z + 'px', top: (r.top - sr.top) / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px' }); ov.style.setProperty('--iz', 1 / z); ov.classList.remove('zk-hidden');
  };
  P.deselectObj = () => { if (P.selObj) { P.selObj = null; ov.classList.add('zk-hidden'); P.refreshSoon(); } };
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0);
    if (!r.collapsed && r.startContainer === r.endContainer && r.endOffset - r.startOffset === 1) { const n = r.startContainer.childNodes[r.startOffset]; if (P.isObj(n)) { if (P.selObj !== n) { P.selObj = n; P.updateObjSel(); } return; } }
    if (P.selObj && !dragging) P.deselectObj();
  });
  P.P_updateOv = () => P.selObj && P.updateObjSel();
  P.$('#scroll').addEventListener('scroll', () => P.selObj && P.updateObjSel(), { passive: true });

  flow.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; const o = e.target.closest && e.target.closest('img,.shp'); if (!o || !P.isObj(o)) return;
    e.preventDefault(); P.focus(); const wasSel = P.selObj === o; P.selectObj(o);
    if (wasSel || true) startMove(e, o);
  });
  flow.addEventListener('mousedown', (e) => { const o = e.target.closest && e.target.closest('img,.shp'); if (o && P.isObj(o) && e.button === 0) e.preventDefault(); });
  flow.addEventListener('dblclick', (e) => {
    const o = e.target.closest && e.target.closest('img,.shp'); if (o) { P.selectObj(o); P.ui && P.ui.showTab && P.ui.showTab('object'); return; }
    const q = e.target.closest && e.target.closest('.eq'); if (q) P.editEquation(q);
  });
  // drag an object to a new place in the text
  const startMove = (e, el) => {
    const x0 = e.clientX, y0 = e.clientY; let active = false; const caret = document.createElement('div'); caret.className = 'dropcaret';
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; active = true; dragging = true; document.body.style.cursor = 'grabbing';
      const r = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (!r || !flow.contains(r.startContainer) || el.contains(r.startContainer)) { caret.remove(); return; }
      el._drop = r; const rc = r.getClientRects()[0] || r.startContainer.getBoundingClientRect?.(); if (!rc) return; const z = P.zoom, sr = stack.getBoundingClientRect();
      Object.assign(caret.style, { left: (rc.left - sr.left) / z + 'px', top: (rc.top - sr.top) / z + 'px', height: (rc.height || 18) / z + 'px' }); if (!caret.parentNode) stack.append(caret);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = ''; caret.remove();
      if (active && el._drop) { P.checkpoint(false); const r = el._drop; el._drop = null; r.collapse(true); const ghost = el; ghost.remove(); r.insertNode(ghost); P.changed(); P.markDirty(); P.selectObj(ghost); }
      setTimeout(() => (dragging = null), 0);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  // resize handles
  ov.addEventListener('pointerdown', (e) => {
    const h = e.target.dataset && e.target.dataset.h; const el = P.selObj; if (!h || !el) return; e.preventDefault(); e.stopPropagation(); P.checkpoint(false);
    const z = P.zoom; const w0 = el.getBoundingClientRect().width / z, h0 = el.getBoundingClientRect().height / z, x0 = e.clientX, y0 = e.clientY; const ar = w0 / h0; const g = P.geom();
    ov.setPointerCapture(e.pointerId); dragging = true; const isShape = el.classList.contains('shp');
    const move = (ev) => {
      let dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z; let w = w0, hh = h0; const sx = h.includes('w') ? -1 : h.includes('e') ? 1 : 0, sy = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
      const lock = (!isShape || ev.shiftKey) && !(isShape && ev.shiftKey && false);
      if (sx && sy) { if (lock) { const k = Math.max((w0 + sx * dx) / w0, (h0 + sy * dy) / h0); w = w0 * k; hh = h0 * k; } else { w = w0 + sx * dx; hh = h0 + sy * dy; } }
      else if (sx) { w = w0 + sx * dx; if (!isShape) hh = w / ar; } else if (sy) { hh = h0 + sy * dy; if (!isShape) w = hh * ar; }
      w = Math.max(12, Math.min(w, g.cw)); hh = Math.max(isShape && h0 < 12 ? 2 : 12, Math.min(hh, g.hb));
      el.style.width = Math.round(w) + 'px'; el.style.height = Math.round(hh) + 'px'; if (isShape) P.renderShape(el); P.updateObjSel(); P.ui && P.ui.syncObjSize && P.ui.syncObjSize();
    };
    const up = () => { ov.removeEventListener('pointermove', move); ov.removeEventListener('pointerup', up); dragging = null; P._forceFull = true; P.changed(); P.markDirty(); P.updateObjSel(); };
    ov.addEventListener('pointermove', move); ov.addEventListener('pointerup', up);
  });
  P.setObjSize = (w, h, lock) => { const el = P.selObj; if (!el) return; P.checkpoint(false); const r0 = el.getBoundingClientRect(); const ar = r0.width / r0.height; if (lock && w && !h) h = w / ar; if (lock && h && !w) w = h * ar; if (w) el.style.width = Math.round(w) + 'px'; if (h) el.style.height = Math.round(h) + 'px'; if (el.classList.contains('shp')) P.renderShape(el); P._forceFull = true; P.changed(); P.markDirty(); P.updateObjSel(); };
  P.resetObjSize = async () => { const el = P.selObj; if (!el || el.tagName !== 'IMG') return; const sz = await P.imgSize(el.src); P.setObjSize(sz.w, sz.h); };
  P.setWrap = (m) => { const el = P.selObj; if (!el) return; P.checkpoint(false); el.dataset.wrap = m; P._forceFull = true; P.changed(); P.markDirty(); setTimeout(P.updateObjSel, 30); };
  P.setAlt = (t) => { const el = P.selObj; if (!el) return; el.tagName === 'IMG' ? (el.alt = t) : el.setAttribute('aria-label', t); el.setAttribute('data-alt', t); P.markDirty(); };
  P.setShapeProp = (k, v) => { const el = P.selObj; if (!el || !el.classList.contains('shp')) return; P.checkpoint(false); v === '' || v == null ? delete el.dataset[k] : (el.dataset[k] = v); P.renderShape(el); P.markDirty(); };
  P.addCaption = () => {
    const el = P.selObj; const par = el ? P.paraOf(el) : P.paraOf(getSelection().anchorNode); if (!par) return; P.checkpoint(false);
    const n = [...flow.querySelectorAll('p[data-st="Caption"]')].filter((p) => /^Figure \d+/.test(p.textContent)).length + 1; const p = document.createElement('p'); p.setAttribute('data-st', 'Caption'); p.append('Figure ' + n + ': ');
    const host = par.closest('td,th') ? par : par; host.after(p); P.placeCaretIn(p, true); P.changed(); P.markDirty();
  };

  /* ================= equations ================= */
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
  const OPS = { times: '×', cdot: '⋅', pm: '±', mp: '∓', div: '÷', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', partial: '∂', nabla: '∇', ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱', angle: '∠', perp: '⊥', parallel: '∥', circ: '∘', bullet: '•', star: '⋆', ll: '≪', gg: '≫', prime: '′', degree: '°', hbar: 'ℏ', ell: 'ℓ', aleph: 'ℵ', therefore: '∴', because: '∵', oplus: '⊕', otimes: '⊗', setminus: '∖' };
  const BIG = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂', coprod: '∐' };
  const FUNCS = 'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lim max min sup inf det dim gcd arg mod Pr'.split(' ');
  const DELIM = { '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '', '\\{': '{', '\\}': '}', '\\langle': '⟨', '\\rangle': '⟩', '\\|': '‖', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '/': '/', '<': '⟨', '>': '⟩' };
  const ACC = { vec: '→', hat: '^', bar: '‾', overline: '‾', tilde: '~', dot: '˙', ddot: '¨', underline: '_' };
  const parseTex = (src) => {
    let i = 0; const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const cmdName = () => { let n = ''; if (/[a-zA-Z]/.test(src[i] || '')) { while (/[a-zA-Z]/.test(src[i] || '')) n += src[i++]; } else if (i < src.length) n = src[i++]; return n; };
    const arg = () => { ws(); if (src[i] === '{') { i++; const r = seq((c) => c === '}'); if (src[i] === '}') i++; return r; } const a = atom(); return a || { t: 'row', c: [] }; };
    const rawArg = () => { ws(); let out = ''; if (src[i] === '{') { i++; let d = 1; while (i < src.length && d) { const c = src[i++]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } out += c; } } else out = src[i++] || ''; return out; };
    const delim = () => { ws(); if (src[i] === '\\') { i++; const n = cmdName(); return DELIM['\\' + n] ?? OPS[n] ?? ''; } return DELIM[src[i]] !== undefined ? (i++, DELIM[src[i - 1]]) : (i++, src[i - 1] || ''); };
    const matrix = (env) => {
      const rows = []; let row = [], cell = []; const flush = () => { row.push({ t: 'row', c: cell }); cell = []; };
      while (i < src.length) {
        ws(); if (src.startsWith('\\end', i)) { i += 4; rawArg(); break; }
        if (src.startsWith('\\\\', i)) { i += 2; flush(); rows.push(row); row = []; continue; }
        if (src[i] === '&') { i++; flush(); continue; }
        const a = scripted(); if (!a) break; cell.push(a);
      }
      if (cell.length || row.length) { flush(); rows.push(row); }
      const [l, r] = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], matrix: ['', ''], cases: ['{', ''], array: ['', ''], align: ['', ''], aligned: ['', ''] }[env] || ['', ''];
      return { t: 'matrix', rows, l, r };
    };
    function atom() {
      ws(); if (i >= src.length) return null; const c = src[i];
      if (c === '{') { i++; const r = seq((x) => x === '}'); if (src[i] === '}') i++; return r; }
      if (c === '}' || c === '&') return null;
      if (/[0-9.]/.test(c)) { let n = ''; while (/[0-9.]/.test(src[i] || '')) n += src[i++]; return { t: 'n', v: n }; }
      if (/\p{L}/u.test(c)) { i++; return { t: 'i', v: c }; }
      if (c === '\\') {
        i++; const n = cmdName();
        if (n === 'frac' || n === 'dfrac' || n === 'tfrac') { const a = arg(), b = arg(); return { t: 'frac', a, b }; }
        if (n === 'binom') { const a = arg(), b = arg(); return { t: 'fenced', l: '(', r: ')', c: { t: 'matrix', rows: [[a], [b]], l: '', r: '' } }; }
        if (n === 'sqrt') { ws(); let idx = null; if (src[i] === '[') { i++; let s = ''; while (i < src.length && src[i] !== ']') s += src[i++]; i++; idx = parseTex(s); } return { t: 'sqrt', a: arg(), n: idx }; }
        if (n === 'text' || n === 'mathrm' || n === 'mbox' || n === 'operatorname' || n === 'textrm') return { t: 'text', v: rawArg() };
        if (/^(mathbf|boldsymbol|bm|mathit|mathbb|mathcal|mathfrak|mathsf|mathtt)$/.test(n)) return { t: 'style', k: n, a: arg() };
        if (ACC[n]) return { t: 'acc', k: n, ch: ACC[n], a: arg() };
        if (n === 'left') { const l = delim(); const c2 = seq((x, j) => src.startsWith('\\right', j)); let r = ''; if (src.startsWith('\\right', i)) { i += 6; r = delim(); } return { t: 'fenced', l, r, c: c2 }; }
        if (n === 'begin') { const env = rawArg(); return matrix(env); }
        if (n === 'end') { rawArg(); return null; }
        if (BIG[n]) return { t: 'big', v: BIG[n], n };
        if (GREEK[n]) return { t: 'i', v: GREEK[n], g: 1 };
        if (OPS[n]) return { t: 'o', v: OPS[n] };
        if (FUNCS.includes(n)) return { t: 'fn', v: n };
        if (n === ',' || n === ';' || n === ':' || n === ' ' || n === '!' || n === 'quad' || n === 'qquad' || n === 'enspace') return { t: 'sp', w: { ',': 0.17, ';': 0.28, ':': 0.22, ' ': 0.25, '!': -0.17, quad: 1, qquad: 2, enspace: 0.5 }[n] };
        if (n === '{' || n === '}') return { t: 'o', v: n };
        if (n === '|') return { t: 'o', v: '‖' }; if (n === '%' || n === '&' || n === '$' || n === '#' || n === '_') return { t: 'o', v: n };
        if (n === '\\') return { t: 'sp', w: 0 };
        return { t: 'text', v: n };
      }
      i++; if (c === '\'') return { t: 'o', v: '′' }; return { t: 'o', v: c };
    }
    function scripted() {
      const base = atom(); if (!base) return null; let sub = null, sup = null;
      for (;;) { ws(); if (src[i] === '^') { i++; sup = arg(); } else if (src[i] === '_') { i++; sub = arg(); } else if (src[i] === '\'') { i++; sup = sup || { t: 'o', v: '′' }; } else break; }
      if (!sub && !sup) return base;
      if (base.t === 'big') return { t: 'nary', v: base.v, n: base.n, sub, sup };
      if (base.t === 'fn' && /^(lim|max|min|sup|inf|Pr|gcd|det)$/.test(base.v) && sub && !sup) return { t: 'under', b: base, u: sub };
      if (sub && sup) return { t: 'subsup', b: base, l: sub, u: sup }; return sub ? { t: 'sub', b: base, e: sub } : { t: 'sup', b: base, e: sup };
    }
    function seq(stop) { const c = []; while (i < src.length) { ws(); if (i >= src.length || (stop && stop(src[i], i))) break; if (src[i] === '}' ) break; const a = scripted(); if (!a) break; c.push(a); } return { t: 'row', c }; }
    const r = seq(null); return r;
  };
  const e = P.esc;
  const spw = (w) => `<mspace width="${w}em"/>`;
  const toMathML = (n) => {
    const row = (c) => (c.length === 1 ? toMathML(c[0]) : `<mrow>${c.map(toMathML).join('')}</mrow>`);
    switch (n.t) {
      case 'row': return n.c.length === 1 ? toMathML(n.c[0]) : `<mrow>${n.c.map(toMathML).join('')}</mrow>`;
      case 'n': return `<mn>${n.v}</mn>`; case 'i': return `<mi>${e(n.v)}</mi>`; case 'o': return `<mo>${e(n.v)}</mo>`; case 'text': return `<mtext>${e(n.v)}</mtext>`; case 'fn': return `<mi mathvariant="normal">${n.v}</mi>`;
      case 'sp': return spw(n.w); case 'big': return `<mo largeop="true">${n.v}</mo>`;
      case 'frac': return `<mfrac>${toMathML(n.a)}${toMathML(n.b)}</mfrac>`;
      case 'sqrt': return n.n ? `<mroot>${toMathML(n.a)}${toMathML(n.n)}</mroot>` : `<msqrt>${toMathML(n.a)}</msqrt>`;
      case 'sup': return `<msup>${toMathML(n.b)}${toMathML(n.e)}</msup>`; case 'sub': return `<msub>${toMathML(n.b)}${toMathML(n.e)}</msub>`; case 'subsup': return `<msubsup>${toMathML(n.b)}${toMathML(n.l)}${toMathML(n.u)}</msubsup>`;
      case 'under': return `<munder>${toMathML(n.b)}${toMathML(n.u)}</munder>`;
      case 'nary': { const op = `<mo largeop="true">${n.v}</mo>`; const lim = /^(sum|prod|bigcup|bigcap|coprod)$/.test(n.n); const s = n.sub ? toMathML(n.sub) : '<mrow/>', u = n.sup ? toMathML(n.sup) : '<mrow/>'; if (lim) return n.sub && n.sup ? `<munderover>${op}${s}${u}</munderover>` : n.sub ? `<munder>${op}${s}</munder>` : `<mover>${op}${u}</mover>`; return n.sub && n.sup ? `<msubsup>${op}${s}${u}</msubsup>` : n.sub ? `<msub>${op}${s}</msub>` : `<msup>${op}${u}</msup>`; }
      case 'fenced': return `<mrow>${n.l ? `<mo fence="true" stretchy="true">${e(n.l)}</mo>` : ''}${toMathML(n.c)}${n.r ? `<mo fence="true" stretchy="true">${e(n.r)}</mo>` : ''}</mrow>`;
      case 'matrix': { const t = `<mtable>${n.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${toMathML(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`; return n.l || n.r ? `<mrow>${n.l ? `<mo>${e(n.l)}</mo>` : ''}${t}${n.r ? `<mo>${e(n.r)}</mo>` : ''}</mrow>` : t; }
      case 'acc': return n.k === 'underline' ? `<munder>${toMathML(n.a)}<mo>_</mo></munder>` : `<mover accent="true">${toMathML(n.a)}<mo>${n.ch}</mo></mover>`;
      case 'style': { const v = { mathbf: 'bold', boldsymbol: 'bold', bm: 'bold', mathit: 'italic', mathbb: 'double-struck', mathcal: 'script', mathfrak: 'fraktur', mathsf: 'sans-serif', mathtt: 'monospace' }[n.k]; return `<mstyle mathvariant="${v}">${toMathML(n.a)}</mstyle>`; }
    }
    void row; return '';
  };
  const toText = (n) => {
    switch (n.t) {
      case 'row': return n.c.map(toText).join(''); case 'n': case 'i': case 'o': case 'text': case 'fn': return n.v + (n.t === 'fn' ? ' ' : ''); case 'sp': return ' '; case 'big': return n.v;
      case 'frac': return `(${toText(n.a)})/(${toText(n.b)})`; case 'sqrt': return (n.n ? `ⁿ√` : '√') + `(${toText(n.a)})`;
      case 'sup': return toText(n.b) + '^' + (/^\w$/.test(toText(n.e)) ? toText(n.e) : `(${toText(n.e)})`); case 'sub': return toText(n.b) + '_' + (/^\w$/.test(toText(n.e)) ? toText(n.e) : `(${toText(n.e)})`);
      case 'subsup': return toText(n.b) + `_(${toText(n.l)})^(${toText(n.u)})`; case 'under': return toText(n.b) + `_(${toText(n.u)})`; case 'nary': return n.v + (n.sub ? `_(${toText(n.sub)})` : '') + (n.sup ? `^(${toText(n.sup)})` : '');
      case 'fenced': return n.l + toText(n.c) + n.r; case 'matrix': return n.l + n.rows.map((r) => r.map(toText).join(', ')).join('; ') + n.r; case 'acc': return toText(n.a) + n.ch; case 'style': return toText(n.a);
    } return '';
  };
  const mr = (t, nor) => `<m:r>${nor ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${e(t)}</m:t></m:r>`;
  const toOmml = (n) => {
    const E = (x) => `<m:e>${toOmml(x)}</m:e>`;
    switch (n.t) {
      case 'row': return n.c.map(toOmml).join(''); case 'n': case 'i': case 'o': return mr(n.v); case 'text': return mr(n.v, true); case 'fn': return mr(n.v, true); case 'sp': return mr(' '); case 'big': return mr(n.v);
      case 'frac': return `<m:f><m:num>${toOmml(n.a)}</m:num><m:den>${toOmml(n.b)}</m:den></m:f>`;
      case 'sqrt': return `<m:rad><m:radPr>${n.n ? '' : '<m:degHide m:val="1"/>'}</m:radPr><m:deg>${n.n ? toOmml(n.n) : ''}</m:deg>${E(n.a)}</m:rad>`;
      case 'sup': return `<m:sSup><m:sSupPr/>${E(n.b)}<m:sup>${toOmml(n.e)}</m:sup></m:sSup>`; case 'sub': return `<m:sSub><m:sSubPr/>${E(n.b)}<m:sub>${toOmml(n.e)}</m:sub></m:sSub>`;
      case 'subsup': return `<m:sSubSup><m:sSubSupPr/>${E(n.b)}<m:sub>${toOmml(n.l)}</m:sub><m:sup>${toOmml(n.u)}</m:sup></m:sSubSup>`;
      case 'under': return `<m:limLow><m:limLowPr/>${E(n.b)}<m:lim>${toOmml(n.u)}</m:lim></m:limLow>`;
      case 'nary': return `<m:nary><m:naryPr><m:chr m:val="${n.v}"/><m:limLoc m:val="${/^(sum|prod|bigcup|bigcap|coprod)$/.test(n.n) ? 'undOvr' : 'subSup'}"/>${n.sub ? '' : '<m:subHide m:val="1"/>'}${n.sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr><m:sub>${n.sub ? toOmml(n.sub) : ''}</m:sub><m:sup>${n.sup ? toOmml(n.sup) : ''}</m:sup><m:e/></m:nary>`;
      case 'fenced': return `<m:d><m:dPr><m:begChr m:val="${e(n.l)}"/><m:endChr m:val="${e(n.r)}"/></m:dPr>${E(n.c)}</m:d>`;
      case 'matrix': { const m = `<m:m>${n.rows.map((r) => `<m:mr>${r.map((c) => `<m:e>${toOmml(c)}</m:e>`).join('')}</m:mr>`).join('')}</m:m>`; return n.l || n.r ? `<m:d><m:dPr><m:begChr m:val="${e(n.l)}"/><m:endChr m:val="${e(n.r)}"/></m:dPr><m:e>${m}</m:e></m:d>` : m; }
      case 'acc': return `<m:acc><m:accPr><m:chr m:val="${n.ch}"/></m:accPr>${E(n.a)}</m:acc>`; case 'style': return toOmml(n.a);
    } return '';
  };
  P.tex = { parse: parseTex, mathml: (s) => toMathML(parseTex(s)), text: (s) => toText(parseTex(s)), omml: (s) => toOmml(parseTex(s)) };
  P.renderEq = (el) => {
    const tex = el.getAttribute('data-tex') || '';
    try { const disp = el.hasAttribute('data-disp'); el.innerHTML = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${disp ? 'block' : 'inline'}">${toMathML(parseTex(tex))}</math>`; el.title = tex; } catch { el.textContent = tex; }
  };
  P.renderEquations = () => { for (const q of flow.querySelectorAll('.eq')) P.renderEq(q); P.renderShapes(); };
  P.editEquation = async (el) => {
    const ta = zk.el('textarea.zk-textarea.selectable', { rows: 3, style: { width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12.5px' }, placeholder: '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' }); ta.value = el ? el.getAttribute('data-tex') : '';
    const prev = zk.el('.eqprev'); const disp = zk.el('input.zk-check', { type: 'checkbox', checked: el ? el.hasAttribute('data-disp') : false });
    const upd = () => { const t = zk.el('span.eq'); t.setAttribute('data-tex', ta.value); P.renderEq(t); prev.replaceChildren(t); }; ta.oninput = upd; upd();
    const body = zk.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, zk.el('p', 'LaTeX-style syntax: \\frac{a}{b}, \\sqrt{x}, x^2, x_i, \\sum_{i=1}^{n}, \\int_a^b, Greek letters (\\alpha), \\begin{pmatrix}…\\end{pmatrix}.'), ta, prev, zk.el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, disp, 'Display on its own line'));
    const r = await zk.sheet({ title: el ? 'Edit Equation' : 'Insert Equation', body, width: 480, buttons: [{ label: 'Cancel', value: null }, { label: el ? 'Update' : 'Insert', primary: true, value: 'ok' }] });
    if (r !== 'ok' || !ta.value.trim()) return;
    if (el) { P.checkpoint(false); el.setAttribute('data-tex', ta.value); disp.checked ? el.setAttribute('data-disp', '1') : el.removeAttribute('data-disp'); P.renderEq(el); P.changed(); P.markDirty(); return; }
    const q = document.createElement('span'); q.className = 'eq'; q.setAttribute('contenteditable', 'false'); q.setAttribute('data-tex', ta.value); if (disp.checked) q.setAttribute('data-disp', '1'); P.renderEq(q); P.insertNodeAtCaret(q);
  };
})();
