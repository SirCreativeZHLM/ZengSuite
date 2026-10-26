/* People map: an interactive constellation. Clusters by company or group; node size = recency of contact. */
(() => {
  'use strict';
  const ZC = window.ZC, S = ZC.S, M = ZC.M, el = zk.el;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]); kids.flat().forEach((c) => c && e.append(c)); return e; };
  const MAX_NODES = 700;
  const hueOf = (s) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return [8, 24, 38, 85, 140, 165, 190, 215, 245, 270, 295, 330][h % 12]; };
  const radiusFor = (days) => (days == null ? 5.5 : 6 + 10 * Math.exp(-Math.max(0, days) / 60));

  // Deterministic layout (also used by tests through ZC.mapLayout)
  ZC.mapLayout = (contacts, by, groups, now) => {
    let list = contacts; let trimmed = 0;
    if (list.length > MAX_NODES) { list = contacts.slice().sort((a, b) => (M.daysSince(a, now) ?? 1e9) - (M.daysSince(b, now) ?? 1e9)).slice(0, MAX_NODES); trimmed = contacts.length - MAX_NODES; }
    const cl = M.clusters(list, by, groups).map((g) => {
      const items = g.items.slice().sort((a, b) => (M.daysSince(a, now) ?? 1e9) - (M.daysSince(b, now) ?? 1e9) || (a.id < b.id ? -1 : 1));
      return { key: g.key, name: g.name, items, R: 22 + 17 * Math.sqrt(items.length), hue: g.key === 'none' ? 250 : hueOf(g.name) };
    });
    const placed = [];
    cl.forEach((g, i) => {
      if (!i) { g.x = 0; g.y = 0; placed.push(g); return; }
      for (let t = 0; ; t++) {
        const ang = t * 0.62, rad = 40 + t * 7; const x = Math.cos(ang) * rad * 1.15, y = Math.sin(ang) * rad;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.R + g.R + 16)) { g.x = x; g.y = y; placed.push(g); break; }
      }
    });
    const nodes = [];
    for (const g of cl) {
      const local = [];
      g.items.forEach((c, k) => {
        const a = k * 2.39996323 + g.hue, r = k === 0 && g.items.length === 1 ? 0 : 15.5 * Math.sqrt(k + 0.6);
        const days = M.daysSince(c, now); const n = { c, g, x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r, r: radiusFor(days), days, due: (M.dueInfo(c, now) || {}).state === 'overdue', edge: null };
        let best = null, bd = 1e9; for (const o of local) { const d = Math.hypot(o.x - n.x, o.y - n.y); if (d < bd) { bd = d; best = o; } } n.edge = best; local.push(n); nodes.push(n);
      });
    }
    return { clusters: cl, nodes, trimmed };
  };

  const view = { x: 0, y: 0, k: 1 };
  let anim = null;
  const apply = (g) => g.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);

  ZC.renderMap = (host) => {
    const by = S.mapBy || 'company'; const L = ZC.mapLayout(S.contacts, by, S.groups, Date.now());
    const wrap = el('.mapwrap');
    const seg = el('.zk-seg', [['company', 'Company'], ['group', 'Group']].map(([k, n]) => { const b = el('button', { type: 'button', 'aria-pressed': String(by === k) }, n); b.onclick = () => { S.mapBy = k; S.mapFit = true; ZC.renderCard(); }; return b; }));
    const bar = el('.mapbar', el('.mt', el('b', 'People map'), el('span', `${L.nodes.length} people in ${L.clusters.length} ${by === 'group' ? 'group' : 'compan'}${by === 'group' ? (L.clusters.length === 1 ? '' : 's') : (L.clusters.length === 1 ? 'y' : 'ies')}`)), seg, el('span', { style: { flex: 1 } }),
      el('span.legend', el('i.big'), 'recent', el('i.small'), 'long ago', el('i.ring'), 'due'),
      zk.btn({ icon: 'zoom-out', title: 'Zoom out', onClick: () => zoomBy(1 / 1.35) }), zk.btn({ icon: 'zoom-in', title: 'Zoom in', onClick: () => zoomBy(1.35) }), zk.btn({ icon: 'scan', title: 'Fit all', onClick: () => fit(true) }));
    if (!L.nodes.length) { wrap.append(bar, el('.empty', el('.big', zk.icon('share-2')), el('h2', 'No people to map yet'), el('p', 'Add contacts with a company or group and they appear here as a constellation, sized by how recently you caught up.'))); host.replaceChildren(wrap); return; }
    const svg = sv('svg', { class: 'mapsvg', role: 'group', 'aria-label': 'People map' }); const world = sv('g'); svg.append(world);
    for (const g of L.clusters) {
      const col = `hsl(${g.hue} 70% 55%)`;
      world.append(sv('circle', { cx: g.x, cy: g.y, r: g.R, class: 'pod', fill: `hsl(${g.hue} 70% 55% / .07)`, stroke: `hsl(${g.hue} 70% 55% / .35)` }),
        sv('text', { x: g.x, y: g.y - g.R - 7, class: 'podlbl', 'text-anchor': 'middle', fill: `hsl(${g.hue} 55% 45%)` }, `${g.name}${g.items.length > 1 ? ' · ' + g.items.length : ''}`));
    }
    const lines = sv('g', { class: 'edges' }); world.append(lines);
    const nodeLayer = sv('g'); world.append(nodeLayer);
    const tip = el('.maptip', { hidden: true }); const card = el('.mapcard', { hidden: true });
    const showCard = (n, cx, cy) => {
      const c = n.c; const di = M.dueInfo(c);
      card.replaceChildren(el('.mc-h', ZC.avatar(c, 36), el('div', el('b', ZC.name(c)), el('div.s', [c.title, c.org].filter(Boolean).join(' · ') || ' '))),
        el('.mc-r', c.lc ? `Caught up ${M.agoText(M.daysSince(c))}` : 'Not caught up yet', di ? el('span.rstat.' + di.state, M.dueText(di)) : null),
        el('.mc-b', el('button.zk-btn.bordered', { type: 'button', disabled: !c.emails.length, onclick: () => ZC.quickAction(c, 'mail') }, zk.icon('mail'), 'Email'), el('button.zk-btn.bordered', { type: 'button', disabled: !c.phones.length, onclick: () => ZC.quickAction(c, 'phone') }, zk.icon('phone'), 'Call'), el('button.zk-btn.bordered', { type: 'button', onclick: () => ZC.catchupDialog(c, 'catchup') }, zk.icon('check'), 'Log'), el('button.zk-btn.primary', { type: 'button', onclick: () => { ZC.setView('all'); ZC.select([c.id], c.id); } }, 'Open')));
      card.hidden = false; const w = wrap.getBoundingClientRect(); card.style.left = zk.clamp(cx - 130, 12, w.width - 272) + 'px'; card.style.top = zk.clamp(cy + 22, 52, w.height - 150) + 'px';
    };
    for (const n of L.nodes) if (n.edge) lines.append(sv('line', { x1: n.x, y1: n.y, x2: n.edge.x, y2: n.edge.y, stroke: `hsl(${n.g.hue} 60% 55% / .35)`, 'stroke-width': 1 }));
    for (const n of L.nodes) {
      const hue = n.g.hue; const age = n.days == null ? 0.5 : Math.max(0.45, 1 - n.days / 400);
      const g = sv('g', { class: 'node' + (n.due ? ' due' : '') + (S.mapSel === n.c.id ? ' sel' : ''), tabindex: 0, role: 'button', 'aria-label': `${ZC.name(n.c)}, ${n.days == null ? 'not caught up yet' : 'caught up ' + M.agoText(n.days)}`, transform: `translate(${n.x} ${n.y})` });
      if (n.due) g.append(sv('circle', { r: n.r + 4, class: 'pulse', fill: 'none', stroke: `hsl(${hue} 85% 55%)`, 'stroke-width': 1.5 }));
      g.append(sv('circle', { r: n.r, class: 'dot', fill: n.days == null ? 'var(--bg)' : `hsl(${hue} 70% 55% / ${age})`, stroke: `hsl(${hue} 70% 50%)`, 'stroke-width': n.days == null ? 1.5 : 1, 'stroke-dasharray': n.days == null ? '2.5 2' : null }));
      if (n.r >= 11) g.append(sv('text', { class: 'ini', 'text-anchor': 'middle', dy: '.35em', 'font-size': n.r * 0.7 }, M.initials(n.c)));
      const open = (ev) => { ev.stopPropagation(); S.mapSel = n.c.id; nodeLayer.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); g.classList.add('sel'); const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect(); showCard(n, r.left - w.left, r.bottom - w.top); tip.hidden = true; };
      g.addEventListener('click', open); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
      g.addEventListener('pointerenter', (e) => { const w = wrap.getBoundingClientRect(); tip.hidden = false; tip.replaceChildren(el('b', ZC.name(n.c)), el('span', n.days == null ? 'not caught up yet' : 'caught up ' + M.agoText(n.days))); tip.style.left = e.clientX - w.left + 12 + 'px'; tip.style.top = e.clientY - w.top + 12 + 'px'; });
      g.addEventListener('pointermove', (e) => { const w = wrap.getBoundingClientRect(); tip.style.left = e.clientX - w.left + 12 + 'px'; tip.style.top = e.clientY - w.top + 12 + 'px'; });
      g.addEventListener('pointerleave', () => (tip.hidden = true));
      nodeLayer.append(g);
    }
    if (L.trimmed) wrap.append(el('.maptrim', `Showing the ${MAX_NODES} most recent people (${L.trimmed} more not drawn).`));
    // view math
    const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 600, h: r.height || 400 }; };
    const bounds = () => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const g of L.clusters) { x0 = Math.min(x0, g.x - g.R); x1 = Math.max(x1, g.x + g.R); y0 = Math.min(y0, g.y - g.R - 22); y1 = Math.max(y1, g.y + g.R); } return { x0, y0, x1, y1 }; };
    const fitTarget = () => { const b = bounds(), s = size(); const k = zk.clamp(Math.min((s.w - 60) / (b.x1 - b.x0), (s.h - 110) / (b.y1 - b.y0)), 0.2, 1.6); return { k, x: s.w / 2 - ((b.x0 + b.x1) / 2) * k, y: s.h / 2 + 18 - ((b.y0 + b.y1) / 2) * k }; };
    const go = (t, animate) => {
      if (anim) anim.stop(); const f = { ...view };
      if (!animate) { Object.assign(view, t); apply(world); return; }
      anim = zk.spring({ from: 0, to: 1, response: 0.45, onUpdate: (p) => { view.k = f.k + (t.k - f.k) * p; view.x = f.x + (t.x - f.x) * p; view.y = f.y + (t.y - f.y) * p; apply(world); }, onDone: () => { Object.assign(view, t); apply(world); } });
    };
    const fit = (animate) => go(fitTarget(), animate);
    const zoomAt = (k2, px, py, animate) => { const k = zk.clamp(k2, 0.15, 5); const t = { k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k }; go(t, animate); };
    const zoomBy = (f) => { const s = size(); zoomAt(view.k * f, s.w / 2, s.h / 2, true); };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top, false); }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.node')) return; if (anim) anim.stop(); card.hidden = true; S.mapSel = null; nodeLayer.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      svg.setPointerCapture(e.pointerId); svg.classList.add('pan'); let x = e.clientX, y = e.clientY;
      const mv = (ev) => { view.x += ev.clientX - x; view.y += ev.clientY - y; x = ev.clientX; y = ev.clientY; apply(world); };
      const up = () => { svg.classList.remove('pan'); svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); };
      svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    });
    svg.addEventListener('dblclick', (e) => { if (!e.target.closest('.node')) fit(true); });
    wrap.append(bar, svg, tip, card); host.replaceChildren(wrap);
    if (S.mapFit !== false || !view.k) { S.mapFit = false; fit(false); } else apply(world);
    new ResizeObserver(() => { if (!view._manual) apply(world); }).observe(svg);
  };
})();
