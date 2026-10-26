/* Slideshow engine: transitions, object builds, magic move, presenter view, overview, laser, rehearsal.
   Used by the editor (full-screen overlay) and by the exported self-contained HTML viewer. */
(() => {
  const K = (window.K = window.K || {});
  const E = { ease: 'cubic-bezier(.4,0,.2,1)', out: 'cubic-bezier(.16,.84,.3,1)', in: 'cubic-bezier(.5,0,1,1)', linear: 'linear', spring: 'cubic-bezier(.34,1.45,.64,1)' };
  const div = (cls, css) => { const d = document.createElement('div'); if (cls) d.className = cls; if (css) d.style.cssText = css; return d; };
  const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- build effects ----------
  // returns keyframes for an "in" effect; "out" plays the same reversed
  const buildKeyframes = (b, el, o, deck) => {
    const W = deck.size.w, H = deck.size.h; const base = el.style.transform && el.style.transform !== 'none' ? el.style.transform : ''; const T = (pre, post = '') => `${pre} ${base} ${post}`.trim();
    const bx = o ? o.x : 0, by = o ? o.y : 0, bw = o ? o.w : 100, bh = o ? o.h : 100; const dir = b.dir || 'l';
    const off = { l: [-(bx + bw + 20), 0], r: [W - bx + 20, 0], u: [0, -(by + bh + 20)], d: [0, H - by + 20] }[dir];
    switch (b.fx) {
      case 'appear': return [{ opacity: 0 }, { opacity: 1 }];
      case 'fade': return [{ opacity: 0 }, { opacity: 1 }];
      case 'fly': return [{ transform: T(`translate(${off[0]}px,${off[1]}px)`) }, { transform: T('translate(0,0)') }];
      case 'scale': return [{ opacity: 0, transform: T('', 'scale(.4)') }, { opacity: 1, transform: T('', 'scale(1)') }];
      case 'spin': return [{ opacity: 0, transform: T('', 'rotate(-200deg) scale(.2)') }, { opacity: 1, transform: T('', 'rotate(0) scale(1)') }];
      case 'wipe': { const c = { l: 'inset(0 100% 0 0)', r: 'inset(0 0 0 100%)', u: 'inset(0 0 100% 0)', d: 'inset(100% 0 0 0)' }[dir]; return [{ clipPath: c }, { clipPath: 'inset(0 0 0 0)' }]; }
      case 'blur': return [{ opacity: 0, filter: 'blur(24px)' }, { opacity: 1, filter: 'blur(0)' }];
      case 'bounce': return [{ opacity: 0, transform: T(`translateY(${-H * 0.35}px)`), offset: 0 }, { opacity: 1, transform: T('translateY(0)'), offset: 0.5 }, { transform: T('translateY(-28px)'), offset: 0.7 }, { transform: T('translateY(0)'), offset: 0.85 }, { transform: T('translateY(-8px)'), offset: 0.93 }, { transform: T('translateY(0)'), offset: 1 }];
      case 'drop': return [{ opacity: 0, transform: T(`translateY(${-by - bh}px)`, 'rotate(-6deg)') }, { opacity: 1, transform: T('translateY(0)', 'rotate(0)') }];
      // actions (emphasis)
      case 'pulse': return [{ transform: T('', 'scale(1)') }, { transform: T('', 'scale(1.14)') }, { transform: T('', 'scale(1)') }];
      case 'grow': return [{ transform: T('', 'scale(1)') }, { transform: T('', 'scale(1.35)') }];
      case 'shrink': return [{ transform: T('', 'scale(1)') }, { transform: T('', 'scale(.7)') }];
      case 'spin360': return [{ transform: T('', 'rotate(0)') }, { transform: T('', 'rotate(360deg)') }];
      case 'wiggle': return [{ transform: T('', 'rotate(0)') }, { transform: T('', 'rotate(-7deg)') }, { transform: T('', 'rotate(6deg)') }, { transform: T('', 'rotate(-4deg)') }, { transform: T('', 'rotate(3deg)') }, { transform: T('', 'rotate(0)') }];
      case 'flash': return [{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }];
      case 'path': return [{ transform: T('translate(0,0)') }, { transform: T(`translate(${b.dx ?? 200}px,${b.dy ?? 0}px)`) }];
    }
    return [{ opacity: 0 }, { opacity: 1 }];
  };
  const PERSIST = new Set(['grow', 'shrink', 'path', 'spin360']);

  // ---------- Player ----------
  K.player = (deck, host, opts = {}) => {
    const W = deck.size.w, H = deck.size.h; const slides = deck.slides; const order = slides.map((s, i) => i).filter((i) => !slides[i].skip || opts.includeSkipped);
    const P = { deck, order, cur: -1, step: 0, layer: null, black: null, dead: false }; let sc = 1; let anims = new Set(); let transAnims = []; let transBusy = false; let autoT = 0; let slideStart = performance.now(); P.times = [];
    const frame = div('pframe'); host.append(frame); let fw = 0, fh = 0;
    const size = () => { const r = host.getBoundingClientRect(); sc = Math.max(0.05, Math.min(r.width / W, r.height / H)); fw = W * sc; fh = H * sc; frame.style.width = fw + 'px'; frame.style.height = fh + 'px'; frame.style.left = (r.width - fw) / 2 + 'px'; frame.style.top = (r.height - fh) / 2 + 'px'; frame.style.setProperty('--sc', sc); [...frame.children].forEach((l) => { l.style.width = fw + 'px'; l.style.height = fh + 'px'; if (l._pk) l._pk.style.transform = `scale(${sc})`; }); };
    P.resize = size;
    const ro = new ResizeObserver(size); ro.observe(host);

    const makeLayer = (i, { builds = true } = {}) => {
      const s = slides[i]; const l = div('pl'); l.style.width = fw + 'px'; l.style.height = fh + 'px'; const ks = K.renderSlide(deck, s, { index: i, edit: false }); ks.style.transform = `scale(${sc})`; l._pk = ks; l.append(ks); l.slide = s; l.idx = i; l.steps = []; l.map = ks._map;
      // links and media
      ks.querySelectorAll('[data-link]').forEach((e) => { e.style.cursor = 'pointer'; });
      return l;
    };
    const compile = (l) => {
      const s = l.slide; const steps = []; let curStep = null;
      for (const b of s.builds || []) {
        const el = l.map.get(b.obj); if (!el) continue; const o = K.findObj(s.objs, b.obj); if (!o) continue;
        if (o.type === 'group' || o.type === 'conn') { const bb = K.bbox(o.type === 'group' ? o.kids : [o]); el.style.transformOrigin = `${bb.x + bb.w / 2}px ${bb.y + bb.h / 2}px`; }
        let targets = [el]; let ptype = false;
        if (b.para && (o.type === 'text' || o.type === 'shape') && b.kind !== 'action') { const ps = [...el.querySelectorAll(':scope > .tx .tb > p')]; if (ps.length > 1) { targets = ps; ptype = true; } }
        targets.forEach((t, ti) => { const trig = ti === 0 ? b.trig : 'click'; const nb = { ...b, el: t, o, trig, isPara: ptype }; if (trig === 'click' || !curStep) { curStep = []; steps.push(curStep); } curStep.push(nb); });
      }
      l.steps = steps;
    };
    const finalize = (b) => { const el = b.el; if (b.kind === 'in') el.style.visibility = ''; else if (b.kind === 'out') el.style.visibility = 'hidden'; else { const kf = buildKeyframes(b, el, b.o, deck); const a = el.animate(kf, { duration: 1, fill: 'forwards' }); a.finish(); if (!PERSIST.has(b.fx)) a.cancel(); else l_anims(el, a); } };
    const l_anims = (el, a) => { (el._a ||= []).push(a); };
    const clearEl = (el) => { (el._a || []).forEach((a) => { try { a.cancel(); } catch { } }); el._a = []; };
    const setState = (l, k) => {
      const seen = new Map(); l.steps.flat().forEach((b) => { if (!seen.has(b.el)) seen.set(b.el, b); });
      l.steps.flat().forEach((b) => { clearEl(b.el); b.el.style.visibility = ''; });
      for (const [el, b] of seen) if (b.kind === 'in') el.style.visibility = 'hidden';
      for (let s = 0; s < k; s++) l.steps[s].forEach(finalize);
    };
    const finishAll = () => { [...anims].forEach((a) => { try { a.finish(); } catch { } }); anims.clear(); transAnims.forEach((a) => { try { a.finish(); } catch { } }); };
    P.busy = () => anims.size > 0 || transBusy;

    const runStep = (l, k) => {
      const group = l.steps[k]; if (!group) return; let prevStart = 0, prevEnd = 0, maxEnd = 0; let n = 0;
      group.forEach((b, i) => {
        const dur = Math.max(0.01, b.fx === 'appear' ? 0.01 : b.dur || 0.6); let start = i === 0 ? 0 : b.trig === 'with' ? prevStart : prevEnd; // 'click' leftovers (paragraphs) in same group never happen
        const delay = start + (b.delay || 0); prevStart = start; prevEnd = delay + dur; maxEnd = Math.max(maxEnd, prevEnd);
        let kf = buildKeyframes(b, b.el, b.o, deck); if (b.kind === 'out') kf = kf.slice().reverse().map((f, ii, arr) => (f.offset != null ? { ...f, offset: 1 - f.offset } : f));
        if (b.kind === 'in') b.el.style.visibility = '';
        const a = b.el.animate(kf, { duration: dur * 1000, delay: delay * 1000, fill: 'both', easing: b.fx === 'bounce' ? 'linear' : E[b.ease || 'ease'] || E.ease, iterations: 1 }); anims.add(a); n++;
        a.onfinish = () => { anims.delete(a); if (b.kind === 'in') { a.cancel(); } else if (b.kind === 'out') { b.el.style.visibility = 'hidden'; a.cancel(); } else if (PERSIST.has(b.fx)) l_anims(b.el, a); else a.cancel(); if (!anims.size) { arm(); P.onBuild && P.onBuild(); } };
      });
    };

    // ---------- transitions ----------
    const runTransition = (oldL, newL, tr, back) => {
      const dur = (tr.dur || 0.8) * 1000; const dir = back ? ({ l: 'r', r: 'l', u: 'd', d: 'u' }[tr.dir || 'l']) : tr.dir || 'l'; const type = tr.type;
      transBusy = true; transAnims = []; const done = () => { transBusy = false; transAnims = []; frame.classList.remove('persp'); oldL && oldL.remove(); newL.style.cssText = `width:${fw}px;height:${fh}px`; newL.querySelectorAll('.cubeface').length && 0; arm(); P.onBuild && P.onBuild(); };
      const A = (el, kf, o = {}) => { const a = el.animate(kf, { duration: dur, fill: 'both', easing: E.ease, ...o }); transAnims.push(a); return a; };
      const mv = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[dir]; const px = (f) => `translate(${mv[0] * f * fw}px,${mv[1] * f * fh}px)`;
      // direction semantic: 'l' means content moves left (new arrives from right)
      const arrive = (f) => `translate(${-mv[0] * f * fw}px,${-mv[1] * f * fh}px)`;
      let last;
      if (!oldL || type === 'none') { done(); return; }
      switch (type) {
        case 'dissolve': newL.style.zIndex = 2; last = A(newL, [{ opacity: 0 }, { opacity: 1 }], { easing: 'linear' }); break;
        case 'fadeColor': { const c = K.col(deck, tr.color || '#000000'); const cv = div('pcolor'); cv.style.background = c; cv.style.zIndex = 5; frame.append(cv); newL.style.opacity = 0; newL.style.zIndex = 2; A(cv, [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { easing: 'linear' }); A(oldL, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.51 }, { opacity: 0 }], { easing: 'linear' }); last = A(newL, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.51 }, { opacity: 1 }], { easing: 'linear' }); last.addEventListener('finish', () => cv.remove()); break; }
        case 'push': A(oldL, [{ transform: 'none' }, { transform: `translate(${mv[0] * fw}px,${mv[1] * fh}px)` }]); last = A(newL, [{ transform: `translate(${-mv[0] * fw}px,${-mv[1] * fh}px)` }, { transform: 'none' }]); break;
        case 'moveIn': newL.style.zIndex = 2; last = A(newL, [{ transform: `translate(${-mv[0] * fw}px,${-mv[1] * fh}px)` }, { transform: 'none' }]); A(oldL, [{ filter: 'brightness(1)' }, { filter: 'brightness(.7)' }]); break;
        case 'reveal': oldL.style.zIndex = 2; last = A(oldL, [{ transform: 'none' }, { transform: `translate(${mv[0] * fw}px,${mv[1] * fh}px)` }]); break;
        case 'wipe': { newL.style.zIndex = 2; const c = { l: 'inset(0 0 0 100%)', r: 'inset(0 100% 0 0)', u: 'inset(100% 0 0 0)', d: 'inset(0 0 100% 0)' }[dir]; last = A(newL, [{ clipPath: c }, { clipPath: 'inset(0 0 0 0)' }]); break; }
        case 'cube': { frame.classList.add('persp'); frame.style.setProperty('--persp', Math.max(fw, fh) * 2.2 + 'px'); const horiz = dir === 'l' || dir === 'r'; const depth = horiz ? fw : fh; const R = horiz ? (dir === 'l' ? -90 : 90) : (dir === 'u' ? 90 : -90); const rot = (a) => `rotate${horiz ? 'Y' : 'X'}(${a}deg)`;
          const wrap = div('pcube'); wrap.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d;'; frame.append(wrap); wrap.append(oldL, newL);
          oldL.style.cssText += `;backface-visibility:hidden;transform:translateZ(${depth / 2}px)`; newL.style.cssText += `;backface-visibility:hidden;transform:${rot(-R)} translateZ(${depth / 2}px)`;
          last = wrap.animate([{ transform: `translateZ(${-depth / 2}px) ${rot(0)}` }, { transform: `translateZ(${-depth / 2}px) ${rot(R)}` }], { duration: dur, fill: 'both', easing: E.ease }); transAnims.push(last); last.addEventListener('finish', () => { frame.append(newL); wrap.remove(); }); break; }
        case 'flip': { frame.classList.add('persp'); frame.style.setProperty('--persp', Math.max(fw, fh) * 2 + 'px'); const ax = dir === 'l' || dir === 'r' ? 'Y' : 'X'; const s = dir === 'l' || dir === 'u' ? -1 : 1; oldL.style.backfaceVisibility = 'hidden'; newL.style.backfaceVisibility = 'hidden'; A(oldL, [{ transform: `rotate${ax}(0)` }, { transform: `rotate${ax}(${s * 180}deg)` }]); last = A(newL, [{ transform: `rotate${ax}(${-s * 180}deg)` }, { transform: `rotate${ax}(0)` }]); break; }
        case 'zoom': newL.style.zIndex = 2; A(oldL, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }]); last = A(newL, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]); break;
        case 'magic': last = magic(oldL, newL, A, dur); break;
        default: done(); return;
      }
      if (last) last.addEventListener('finish', done); else setTimeout(done, dur);
    };
    const magic = (oldL, newL, A, dur) => {
      const os = oldL.slide, ns = newL.slide; const oldBy = new Map(); (os.objs || []).forEach((o) => oldBy.set(o.name || '\u0000' + o.id, o)); let last; const matched = new Set();
      newL.style.zIndex = 2; newL.style.background = 'none'; const bgA = A(newL._pk, [{ opacity: 1 }, { opacity: 1 }]); // keep
      // crossfade backgrounds: new layer background fades in under moving objects
      const bgNew = div('pbg'); bgNew.style.cssText = `position:absolute;inset:0;background:${K.slideBgCSS(deck, ns, K.layoutOf(deck, ns))}`; newL.insertBefore(bgNew, newL.firstChild); newL._pk.style.background = 'none'; bgNew.style.transform = ''; A(bgNew, [{ opacity: 0 }, { opacity: 1 }], { easing: 'linear' });
      const layerNew = newL._pk.querySelector('.lay'); if (layerNew) A(layerNew, [{ opacity: 0 }, { opacity: 1 }], { easing: 'linear' });
      for (const o of ns.objs) { const el = newL.map.get(o.id); if (!el) continue; const key = o.name || '\u0000' + o.id; const po = o.name ? oldBy.get(key) : null; const oel = po && oldL.map.get(po.id);
        if (po && oel && po.type === o.type && o.type !== 'conn' && o.type !== 'group') { matched.add(po.id); oel.style.visibility = 'hidden';
          const from = { left: po.x + 'px', top: po.y + 'px', width: po.w + 'px', height: po.h + 'px', transform: `rotate(${po.rot || 0}deg)`, opacity: po.op ?? 1 }; const to = { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px', transform: `rotate(${o.rot || 0}deg)`, opacity: o.op ?? 1 };
          if (po.ts && o.ts && po.ts.sz !== o.ts.sz && el.querySelector('.tx')) { const tx = el.querySelector('.tx'); transAnimsPush(tx.animate([{ fontSize: (po.ts.sz) + 'px' }, { fontSize: (o.ts.sz) + 'px' }], { duration: dur, fill: 'both', easing: E.ease })); }
          last = A(el, [from, to]); }
        else if (!(o.type === 'conn')) last = A(el, [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: o.op ?? 1 }]);
      }
      for (const o of os.objs) if (!matched.has(o.id)) { const el = oldL.map.get(o.id); if (el) A(el, [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { easing: 'linear' }); }
      A(oldL, [{ opacity: 1 }, { opacity: 1, offset: 0.99 }, { opacity: 0 }], { easing: 'linear' });
      return last || bgA;
    };
    const transAnimsPush = (a) => transAnims.push(a);

    // ---------- navigation ----------
    const stopMedia = (l) => l && l.querySelectorAll('video,audio').forEach((m) => { try { m.pause(); } catch { } });
    const playMedia = (l) => l && l.querySelectorAll('video[data-auto="1"],audio[data-auto="1"]').forEach((m) => { try { m.currentTime = 0; const p = m.play(); p && p.catch && p.catch(() => { }); } catch { } });
    const arm = () => { clearTimeout(autoT); if (P.dead || P.paused) return; const l = P.layer; if (!l) return; const s = l.slide; const secs = s.adv || (deck.opts.advance > 0 ? deck.opts.advance : 0); if (!secs) return; autoT = setTimeout(() => { if (P.busy()) { arm(); return; } P.next(true); }, secs * 1000); };
    P.goto = (k, how = 'forward', { instant, built } = {}) => {
      if (P.dead) return; k = Math.max(0, Math.min(order.length - 1, k)); const i = order[k]; finishAll(); const old = P.layer;
      if (old) { P.times[old.idx] = (P.times[old.idx] || 0) + (performance.now() - slideStart) / 1000; stopMedia(old); }
      slideStart = performance.now(); const l = makeLayer(i); frame.append(l); compile(l); P.cur = k; P.layer = l; P.step = 0; setState(l, built ? l.steps.length : 0); if (built) P.step = l.steps.length;
      const tr = slides[i].tr || { type: 'none' }; const back = how === 'back';
      K.fit(l); frame.querySelectorAll('.pl').forEach((x) => { if (x !== l && x !== old) x.remove(); });
      if (old && !instant) { if (back) runTransition(old, l, { type: tr.type === 'none' ? 'none' : 'dissolve', dur: 0.35 }, true); else runTransition(old, l, tr, false); } else { old && old.remove(); arm(); }
      playMedia(l); P.onSlide && P.onSlide(k, i); return l;
    };
    P.next = (auto) => {
      if (P.black) { P.setBlack(null); return; }
      if (P.busy()) { finishAll(); if (!auto) return; }
      const l = P.layer; if (l && P.step < l.steps.length) { runStep(l, P.step++); if (!l.steps[P.step - 1].some((b) => b.dur > 0)) { } return; }
      if (P.cur + 1 < order.length) P.goto(P.cur + 1, 'forward'); else if (deck.opts.loop) P.goto(0, 'forward'); else { P.onEnd && P.onEnd(); }
    };
    P.prev = () => { if (P.black) { P.setBlack(null); return; } finishAll(); const l = P.layer; if (P.step > 0) { P.step--; setState(l, P.step); arm(); return; } if (P.cur > 0) P.goto(P.cur - 1, 'back', { built: true }); };
    P.setBlack = (c) => { P.black = c; let b = frame.parentElement.querySelector('.pblack'); if (!c) { b && b.remove(); arm(); return; } if (!b) { b = div('pblack'); host.append(b); } b.style.background = c; clearTimeout(autoT); };
    P.destroy = () => { P.dead = true; clearTimeout(autoT); ro.disconnect(); finishAll(); stopMedia(P.layer); frame.remove(); const b = host.querySelector('.pblack'); b && b.remove(); };
    size(); return P;
  };

  // ---------- presentation shell (fullscreen overlay + presenter/rehearse) ----------
  K.present = (deck, o = {}) => {
    const root = div('pres'); document.body.append(root); const mode = o.mode || 'normal'; const presenter = mode === 'presenter' || mode === 'rehearse';
    const wasNative = !!window.zeng && zeng.isNative; try { zeng.fullscreen(true); } catch { }
    document.body.classList.add('presenting'); const prevFocus = document.activeElement; prevFocus && prevFocus.blur && prevFocus.blur();
    let startK = Math.max(0, o.start || 0); const vis = deck.slides.map((s, i) => i).filter((i) => !deck.slides[i].skip); let k0 = vis.indexOf(startK); if (k0 < 0) k0 = vis.findIndex((i) => i >= startK); if (k0 < 0) k0 = 0;
    let stageHost, nextHost = null, notesEl = null, timerEl, clockEl, countEl, P, laser = false, overview = null, jump = '', jumpHud = null, t0 = Date.now(), tick, helpEl = null;
    const t00 = performance.now();
    if (presenter) {
      root.classList.add('presenter'); const left = div('pp-left'); stageHost = div('pp-cur'); left.append(stageHost); const bar = div('pp-bar'); timerEl = div('pp-timer'); clockEl = div('pp-clock'); countEl = div('pp-count'); const mkb = (t, f, title) => { const b = document.createElement('button'); b.textContent = t; b.title = title || t; b.onclick = (e) => { e.stopPropagation(); f(); }; return b; };
      bar.append(timerEl, countEl, clockEl, div('pp-sp'), mkb('◀', () => P.prev(), 'Previous'), mkb('▶', () => P.next(), 'Next'), mkb('Black', () => P.setBlack(P.black ? null : '#000')), mkb('Overview', () => toggleOverview()), mkb('End', () => exit())); left.append(bar);
      const right = div('pp-right'); const nl = div('pp-lbl'); nl.textContent = 'NEXT'; nextHost = div('pp-next'); const nn = div('pp-lbl'); nn.textContent = 'NOTES'; const nbar = div('pp-nbar'); const ab = (t, d) => { const b = document.createElement('button'); b.textContent = t; b.onclick = (e) => { e.stopPropagation(); fs = Math.max(12, Math.min(48, fs + d)); notesEl.style.fontSize = fs + 'px'; }; return b; }; let fs = 20; nbar.append(nn, div('pp-sp'), ab('A−', -2), ab('A+', 2)); notesEl = div('pp-notes'); notesEl.style.fontSize = fs + 'px'; right.append(nl, nextHost, nbar, notesEl); root.append(left, right);
      if (mode === 'rehearse') { const badge = div('pp-rehearse'); badge.textContent = 'REHEARSING'; bar.insertBefore(badge, timerEl); }
    } else { stageHost = div('pstage'); root.append(stageHost); }
    P = K.player(deck, stageHost, {});
    let nextPlayer = null; const renderNext = (k) => { if (!nextHost) return; nextHost.replaceChildren(); const nk = k + 1; if (nk >= vis.length) { const e = div('pp-end'); e.textContent = 'End of slideshow'; nextHost.append(e); return; } const fr = div('pframe'); nextHost.append(fr); const r = nextHost.getBoundingClientRect(); const sc = Math.min(r.width / deck.size.w, r.height / deck.size.h); fr.style.cssText = `width:${deck.size.w * sc}px;height:${deck.size.h * sc}px;left:${(r.width - deck.size.w * sc) / 2}px;top:${(r.height - deck.size.h * sc) / 2}px`; const ks = K.renderSlide(deck, deck.slides[vis[nk]], { index: vis[nk] }); ks.style.transform = `scale(${sc})`; fr.append(ks); K.fit(ks); };
    const total = vis.length;
    P.onSlide = (k, i) => { if (countEl) countEl.textContent = `${k + 1} / ${total}`; if (notesEl) { const n = deck.slides[i].notes; notesEl.textContent = n || ''; notesEl.classList.toggle('empty', !n); if (!n) notesEl.textContent = 'No notes for this slide.'; } renderNext(k); if (o.preview != null && !o._prev) { o._prev = true; setTimeout(() => P.goto(vis.indexOf(o.preview), 'forward'), 250); } o.onSlideChange && o.onSlideChange(i); };
    P.onEnd = () => { if (o.single) { return; } showEnd(); };
    const showEnd = () => { if (root.querySelector('.pend')) return; const e = div('pend'); e.textContent = o.embedded ? 'End of presentation — click to restart' : 'End of slideshow — click or press Esc to exit'; stageHost.append(e); e.onclick = (ev) => { ev.stopPropagation(); if (o.embedded) { e.remove(); P.paused = false; P.goto(0, 'back', { instant: true }); } else exit(); }; P.paused = true; };
    P.goto(k0, 'forward', { instant: true });
    if (o.preview != null) { /* transition preview handled in onSlide */ }
    const upd = () => { if (timerEl) { const el = (Date.now() - t0) / 1000; const lim = (deck.opts.timer || 0) * 60; if (lim) { const rem = lim - el; timerEl.textContent = (rem < 0 ? '−' : '') + fmtTime(Math.abs(rem)); timerEl.classList.toggle('over', rem < 0); } else timerEl.textContent = fmtTime(el); } if (clockEl) clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    if (presenter) { upd(); tick = setInterval(upd, 250); }

    // laser
    const dot = div('laser'); dot.style.setProperty('--laser', deck.opts.laser || '#ff3b30'); root.append(dot);
    const setLaser = (on) => { laser = on; root.classList.toggle('laser-on', on); dot.style.display = on ? 'block' : 'none'; };
    root.addEventListener('pointermove', (e) => { if (laser) { dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; } root.classList.remove('idle'); clearTimeout(root._idle); root._idle = setTimeout(() => root.classList.add('idle'), 1800); });
    // overview
    const toggleOverview = (on = !overview) => {
      if (!on) { overview && overview.remove(); overview = null; return; } overview = div('pover'); const g = div('pgrid'); const cols = Math.ceil(Math.sqrt(vis.length * 1.6)); g.style.gridTemplateColumns = `repeat(${Math.min(cols, 6)}, 1fr)`; const tw = Math.max(120, Math.min(300, (innerWidth - 80) / Math.min(cols, 6) - 20)); const sc = tw / deck.size.w;
      vis.forEach((si, k) => { const c = div('pthumb' + (k === P.cur ? ' cur' : '')); c.style.width = tw + 'px'; c.style.height = deck.size.h * sc + 'px'; const ks = K.renderSlide(deck, deck.slides[si], { index: si }); ks.style.transform = `scale(${sc})`; c.append(ks); const n = div('pn'); n.textContent = si + 1; c.append(n); c.onclick = (e) => { e.stopPropagation(); toggleOverview(false); P.goto(k, 'forward', { instant: true }); }; g.append(c); setTimeout(() => K.fit(ks), 0); });
      overview.append(g); overview.onclick = () => toggleOverview(false); root.append(overview);
    };
    // jump
    const showJump = () => { if (!jumpHud) { jumpHud = div('pjump'); root.append(jumpHud); } jumpHud.textContent = 'Go to slide: ' + jump; };
    const exit = () => { if (exit.done) return; exit.done = true; if (o.rehearse !== false && mode === 'rehearse') finishRehearsal(); clearInterval(tick); clearTimeout(root._idle); document.removeEventListener('keydown', key, true); P.destroy(); root.remove(); document.body.classList.remove('presenting'); try { zeng.fullscreen(false); } catch { } if (o.embedded) { } o.onExit && o.onExit(P.layer ? P.layer.idx : vis[P.cur]); };
    const finishRehearsal = async () => { P.times[P.layer.idx] = (P.times[P.layer.idx] || 0) + (performance.now() - 0) * 0; const tot = (Date.now() - t0) / 1000; const secs = vis.map((i) => Math.max(1, Math.round(P.times[i] || 0))); const ok = await zk.confirm('Save rehearsal timings?', `Total time ${fmtTime(tot)}. Each slide will advance after the time you spent on it when Auto-advance is used.`, 'Save'); if (ok) { vis.forEach((i, k) => (deck.slides[i].adv = secs[k])); deck.opts.timer = Math.round(tot / 60) || 1; window.A && A.commit('Rehearsal Timings'); window.A && A.emit('edited'); } };
    const goTo = (n) => { const k = vis.findIndex((i) => i + 1 === n); if (k >= 0) P.goto(k, k < P.cur ? 'back' : 'forward', { instant: true }); };
    const key = (e) => {
      if (document.querySelector('.zk-scrim')) return; const k = e.key; let used = true;
      if (/^[0-9]$/.test(k)) { jump += k; showJump(); }
      else if (k === 'Enter' && jump) { goTo(+jump); jump = ''; jumpHud && jumpHud.remove(); jumpHud = null; }
      else if (k === 'Escape') { if (jump) { jump = ''; jumpHud && jumpHud.remove(); jumpHud = null; } else if (overview) toggleOverview(false); else if (helpEl) { helpEl.remove(); helpEl = null; } else if (!o.embedded) exit(); }
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n', 'N'].includes(k)) { if (overview) { used = false; } else P.next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) P.prev();
      else if (k === 'Home') P.goto(0, 'back', { instant: true }); else if (k === 'End') P.goto(vis.length - 1, 'forward', { instant: true });
      else if (k === 'b' || k === 'B' || k === '.') P.setBlack(P.black === '#000' ? null : '#000'); else if (k === 'w' || k === 'W' || k === ',') P.setBlack(P.black === '#fff' ? null : '#fff');
      else if (k === 'l' || k === 'L') setLaser(!laser); else if (k === 'o' || k === 'O' || k === 'Tab') toggleOverview(); else if (k === '?' || k === 'h') { if (helpEl) { helpEl.remove(); helpEl = null; } else { helpEl = div('phelp'); helpEl.innerHTML = '<b>Slideshow shortcuts</b><br>→ ↓ Space  next &nbsp; ← ↑  previous<br>B black &nbsp; W white &nbsp; L laser<br>O overview &nbsp; 12 ⏎ go to slide 12<br>Esc exit'; root.append(helpEl); } }
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', key, true);
    // pointer: click advance, swipe, links
    let down = null; stageHost.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    stageHost.addEventListener('pointerup', (e) => {
      if (!down || e.button !== 0) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; const d = down; down = null; if (overview) return;
      const lk = e.target.closest && e.target.closest('[data-link]'); const media = e.target.closest && e.target.closest('.ko.media');
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? P.next() : P.prev(); return; } if (Math.hypot(dx, dy) > 8) return;
      if (lk) { const u = lk.dataset.link; if (/^#\d+$/.test(u)) goTo(+u.slice(1)); else if (u) window.open(u, '_blank'); return; }
      if (media) { const m = media.querySelector('video,audio'); if (m) { m.paused ? m.play() : m.pause(); return; } }
      P.next();
    });
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); P.prev(); });
    if (mode === 'rehearse') { /* timings recorded in P.times */ }
    o.handle = { exit, P };
    return o.handle;
  };
})();
