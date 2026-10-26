/* Canvas renderer: per-object drawing, stroke outlines, backgrounds, layer cache, overlay. */
(() => {
  'use strict';
  const f2 = (n) => Math.round(n * 100) / 100;
  const bb0 = FF.bb;
  FF.bb = (o) => { if (o.type === 'conn' && !o._geo) FF.connGeo(o); return bb0(o); };

  // ---------- media ----------
  FF.getImg = (id) => {
    const m = FF.media.get(id); if (!m) return null;
    if (m.img) return m.img.complete && m.img.naturalWidth ? m.img : null;
    const im = new Image(); m.img = im; m.url ||= URL.createObjectURL(new Blob([m.bytes], { type: m.mime })); im.onload = () => { FF.rev++; FF.R && FF.R.invalidate(); }; im.src = m.url; return null;
  };

  // ---------- strokes ----------
  const outline = (P, bw, round) => {
    const n = P.length / 3; if (!n) return '';
    if (n === 1) { const r = Math.max(0.4, (bw * P[2]) / 2), x = P[0], y = P[1]; return `M${f2(x - r)} ${f2(y)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r)} 0Z`; }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const pi = i > 0 ? i - 1 : i, ni = i < n - 1 ? i + 1 : i; let tx = P[ni * 3] - P[pi * 3], ty = P[ni * 3 + 1] - P[pi * 3 + 1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const hw = Math.max(0.35, (bw * P[i * 3 + 2]) / 2), x = P[i * 3], y = P[i * 3 + 1]; L.push([x - ty * hw, y + tx * hw, hw]); R.push([x + ty * hw, y - tx * hw, hw]);
    }
    const side = (A) => { let d = ''; for (let i = 1; i < A.length - 1; i++) { const mx = (A[i][0] + A[i + 1][0]) / 2, my = (A[i][1] + A[i + 1][1]) / 2; d += `Q${f2(A[i][0])} ${f2(A[i][1])} ${f2(mx)} ${f2(my)}`; } return d + `L${f2(A[A.length - 1][0])} ${f2(A[A.length - 1][1])}`; };
    const Rr = R.slice().reverse(); const he = L[n - 1][2], hs = L[0][2];
    let d = `M${f2(L[0][0])} ${f2(L[0][1])}` + (n > 2 ? side(L) : `L${f2(L[n - 1][0])} ${f2(L[n - 1][1])}`);
    d += round ? `A${f2(he)} ${f2(he)} 0 0 0 ${f2(R[n - 1][0])} ${f2(R[n - 1][1])}` : `L${f2(R[n - 1][0])} ${f2(R[n - 1][1])}`;
    d += n > 2 ? side(Rr) : `L${f2(R[0][0])} ${f2(R[0][1])}`;
    d += round ? `A${f2(hs)} ${f2(hs)} 0 0 0 ${f2(L[0][0])} ${f2(L[0][1])}Z` : 'Z';
    return d;
  };
  FF.strokePath = (o) => {
    const key = o.pts.length + '|' + o.s.sw + '|' + o.s.tool; if (o._sp && o._sp.key === key) return o._sp;
    const d = outline(o.pts, o.s.sw, o.s.tool !== 'hl'); return (o._sp = { key, d, p: new Path2D(d) });
  };
  FF.strokeBounds = (pts, sw) => { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (let i = 0; i < pts.length; i += 3) { const r = (sw * pts[i + 2]) / 2; x0 = Math.min(x0, pts[i] - r); y0 = Math.min(y0, pts[i + 1] - r); x1 = Math.max(x1, pts[i] + r); y1 = Math.max(y1, pts[i + 1] + r); } return [x0, y0, x1, y1]; };
  // build a stroke object from world-space points [x,y,w,...]
  FF.makeStroke = (wp, s) => {
    const b = FF.strokeBounds(wp, s.sw); const pts = new Array(wp.length);
    for (let i = 0; i < wp.length; i += 3) { pts[i] = f2(wp[i] - b[0]); pts[i + 1] = f2(wp[i + 1] - b[1]); pts[i + 2] = f2(wp[i + 2]); }
    return FF.make('stroke', { x: b[0], y: b[1], w: Math.max(1, b[2] - b[0]), h: Math.max(1, b[3] - b[1]), pts, s });
  };
  // re-fit a stroke's box to its points (after pts edit)
  FF.refitStroke = (o) => { const b = FF.strokeBounds(o.pts, o.s.sw); const P = new Array(o.pts.length); for (let i = 0; i < P.length; i += 3) { P[i] = f2(o.pts[i] - b[0]); P[i + 1] = f2(o.pts[i + 1] - b[1]); P[i + 2] = o.pts[i + 2]; } o.x += b[0]; o.y += b[1]; o.w = Math.max(1, b[2] - b[0]); o.h = Math.max(1, b[3] - b[1]); o.pts = P; FF.touch(o); };
  // world-space polyline of a stroke (for hit tests / erasing)
  FF.strokeWorld = (o) => { const out = []; const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), cx = o.x + o.w / 2, cy = o.y + o.h / 2; for (let i = 0; i < o.pts.length; i += 3) { const dx = o.pts[i] - o.w / 2, dy = o.pts[i + 1] - o.h / 2; out.push([cx + dx * c - dy * s, cy + dx * s + dy * c, o.pts[i + 2]]); } return out; };

  // ---------- text colour ----------
  const autoCol = (o, dark) => {
    const fill = o.s.fill; if (!fill || fill === 'none' || fill === 'paper' || FF.translucent(fill)) return FF.col('ink', dark);
    return FF.lum(fill) < 0.5 ? '#ffffff' : '#1d1d1f';
  };
  FF.autoCol = autoCol;
  const dashOf = (s) => (s.dash === 'dash' ? [s.sw * 3.2, s.sw * 2.2] : s.dash === 'dot' ? [0.01, s.sw * 2.4] : []);
  FF.dashOf = dashOf;

  function drawText(ctx, o, box, rc) {
    if (!FF.hasText(o)) return; if (rc.skipText === o.id) return;
    if (rc.z * (o.s.fs || 16) < 3.2) { // LOD: grey bar instead of glyphs
      const L = FF.objLayout(o, box.w, box.h); ctx.globalAlpha *= 0.35; ctx.fillStyle = autoCol(o, rc.dark); const ty = box.y + (o.s.va === 'middle' ? (box.h - L.h) / 2 : o.s.va === 'bottom' ? box.h - L.h : 0); for (const ln of L.lines.slice(0, 6)) ctx.fillRect(box.x, ty + ln.y + ln.h * 0.35, Math.min(ln.w, box.w), Math.max(1 / rc.z, ln.h * 0.3)); ctx.globalAlpha /= 0.35; return;
    }
    const L = FF.objLayout(o, o.type === 'text' && o.autoW ? 1e9 : box.w, box.h), s = o.s;
    let ty = box.y; if (s.va === 'middle') ty += (box.h - L.h) / 2; else if (s.va === 'bottom') ty += box.h - L.h;
    ctx.textBaseline = 'alphabetic'; ctx.save(); if (o.type !== 'text') { ctx.beginPath(); ctx.rect(box.x - 2, box.y - 2, box.w + 4, box.h + 4); ctx.clip(); }
    const auto = autoCol(o, rc.dark);
    for (const ln of L.lines) {
      let ox = box.x; if (s.ta === 'center') ox += (box.w - ln.w) / 2; else if (s.ta === 'right') ox += box.w - ln.w;
      const base = ty + ln.y + ln.h * 0.5 + ln.asc * 0.36;
      for (const it of ln.items) {
        if (!it.t.trim() && !it.u && !it.st) continue;
        ctx.font = it.font; const c = it.c === 'ink' ? auto : FF.col(it.c, rc.dark); ctx.fillStyle = c; ctx.fillText(it.t, ox + it.x, base);
        if (it.u) ctx.fillRect(ox + it.x, base + it.sz * 0.1, it.w, Math.max(1, it.sz / 14));
        if (it.st) ctx.fillRect(ox + it.x, base - it.sz * 0.3, it.w, Math.max(1, it.sz / 14));
      }
    }
    ctx.restore();
  }

  function drawHead(ctx, kind, x, y, ang, s, col, sw) {
    if (!kind || kind === 'none') return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.setLineDash([]); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = sw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    if (kind === 'arrow') { ctx.moveTo(-s, -s * 0.55); ctx.lineTo(0, 0); ctx.lineTo(-s, s * 0.55); ctx.stroke(); }
    else if (kind === 'tri') { ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 0.5); ctx.lineTo(-s, s * 0.5); ctx.closePath(); ctx.fill(); }
    else if (kind === 'circle') { ctx.arc(-s * 0.4, 0, s * 0.4, 0, 6.2832); ctx.fill(); }
    else if (kind === 'diamond') { ctx.moveTo(0, 0); ctx.lineTo(-s * 0.6, -s * 0.4); ctx.lineTo(-s * 1.2, 0); ctx.lineTo(-s * 0.6, s * 0.4); ctx.closePath(); ctx.fill(); }
    else if (kind === 'bar') { ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.5); ctx.stroke(); }
    ctx.restore();
  }
  FF.headSize = (sw) => 9 + sw * 2.5;

  FF.titleSize = (o, z) => Math.min(Math.max(o.s.fs || 16, 12 / z), (o.s.fs || 16) * 6);

  function drawObj(ctx, o, rc) {
    const s = o.s, t = o.type, dark = rc.dark;
    ctx.save();
    ctx.globalAlpha = s.op == null ? 1 : s.op;
    if (t === 'conn') {
      const g = FF.connGeo(o), col = FF.col(s.stroke, dark), sw = s.sw || 2;
      ctx.strokeStyle = col; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dashOf(s)); ctx.stroke(g.p); ctx.setLineDash([]);
      const hs = FF.headSize(sw); drawHead(ctx, o.ha, g.A.x, g.A.y, g.angA, hs, col, sw); drawHead(ctx, o.hb, g.B.x, g.B.y, g.angB, hs, col, sw);
      if (FF.hasText(o) && rc.skipText !== o.id) {
        const L = FF.layout(o, 220, 1); const w = L.w + 14, h = L.h + 6; ctx.fillStyle = rc.bgCol; ctx.beginPath(); ctx.roundRect(g.mid[0] - w / 2, g.mid[1] - h / 2, w, h, 6); ctx.fill();
        const tmp = { ...o, s: { ...s, ta: 'center', va: 'middle', fill: 'none' }, _lay: null }; drawText(ctx, { ...tmp, id: o.id, _lay: { key: 'x', lines: L.lines, w: L.w, h: L.h, mul: 1 } }, { x: g.mid[0] - w / 2 + 7, y: g.mid[1] - h / 2 + 3, w: L.w, h: L.h }, rc);
      }
      ctx.restore(); return;
    }
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.rot) { ctx.translate(cx, cy); ctx.rotate(o.rot); ctx.translate(-o.w / 2, -o.h / 2); } else ctx.translate(o.x, o.y);
    const w = o.w, h = o.h;
    const shadow = s.shadow && rc.z > 0.25;
    if (shadow) { ctx.shadowColor = rc.dark ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.22)'; ctx.shadowBlur = 14 * rc.sc; ctx.shadowOffsetY = 4 * rc.sc; }
    switch (t) {
      case 'stroke': {
        const sp = FF.strokePath(o), col = FF.col(s.stroke, dark), tool = s.tool;
        if (tool === 'hl') { ctx.globalAlpha *= 0.4; if (!dark) ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = col; ctx.fill(sp.p); }
        else if (tool === 'pencil') { ctx.globalAlpha *= 0.82; ctx.fillStyle = col; ctx.fill(sp.p); if (rc.z > 0.3) { ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, s.sw * 0.35); ctx.setLineDash([0.8, 1.7]); ctx.lineCap = 'butt'; ctx.stroke(sp.p); } }
        else { ctx.fillStyle = col; ctx.fill(sp.p); }
        break;
      }
      case 'shape': case 'sticky': {
        let p, p2 = null;
        if (t === 'sticky') { p = o._pth && o._pth.key === 'st' + w + h ? o._pth.p : (o._pth = { key: 'st' + w + h, p: new Path2D(FF.stickyD(w, h)) }).p; }
        else { const sp = FF.shapePath(o); p = sp.p; p2 = sp.p2; }
        if (s.fill && s.fill !== 'none') { ctx.fillStyle = FF.col(s.fill, dark); ctx.fill(p); }
        ctx.shadowColor = 'transparent';
        if (t === 'sticky') { const f = FF.foldSize(w, h); ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.moveTo(w - f, h); ctx.lineTo(w, h - f); ctx.lineTo(w - f, h - f); ctx.closePath(); ctx.fill(); }
        if (s.sw > 0 && s.stroke && s.stroke !== 'none') { ctx.strokeStyle = FF.col(s.stroke, dark); ctx.lineWidth = s.sw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dashOf(s)); ctx.stroke(p); if (p2) ctx.stroke(p2); ctx.setLineDash([]); }
        drawText(ctx, o, FF.textBox(o), rc);
        break;
      }
      case 'text': drawText(ctx, o, { x: 0, y: 0, w, h }, rc); break;
      case 'image': {
        const im = FF.getImg(o.media);
        if (im) ctx.drawImage(im, 0, 0, w, h); else { ctx.fillStyle = 'rgba(128,128,128,.2)'; ctx.fillRect(0, 0, w, h); }
        if (s.sw > 0 && s.stroke !== 'none') { ctx.shadowColor = 'transparent'; ctx.strokeStyle = FF.col(s.stroke, dark); ctx.lineWidth = s.sw; ctx.strokeRect(0, 0, w, h); }
        break;
      }
      case 'stamp': { ctx.font = `${Math.min(w, h) * 0.82}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.ch || '⭐', w / 2, h / 2 + h * 0.04); ctx.textAlign = 'start'; break; }
      case 'frame': {
        const col = FF.col(s.stroke, dark);
        if (s.fill && s.fill !== 'none') { ctx.fillStyle = FF.col(s.fill, dark); ctx.fillRect(0, 0, w, h); } else { ctx.fillStyle = dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.025)'; ctx.fillRect(0, 0, w, h); }
        ctx.strokeStyle = col; ctx.globalAlpha *= 0.55; ctx.lineWidth = Math.max(1, 1 / rc.z); ctx.strokeRect(0, 0, w, h); ctx.globalAlpha = 1;
        if (rc.skipText !== o.id) { const fs = FF.titleSize(o, rc.z); ctx.font = FF.fontStr(s.font, fs, true, false); ctx.fillStyle = FF.col('ink', dark); ctx.globalAlpha = 0.75; ctx.textBaseline = 'alphabetic'; let title = o.title || 'Frame'; const maxw = Math.max(40, w); while (title.length > 1 && ctx.measureText(title).width > maxw) title = title.slice(0, -2) + '…'; ctx.fillText(title, 0, -fs * 0.35); }
        break;
      }
      case 'card': {
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 12); ctx.fillStyle = FF.col(s.fill, dark); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ff375f'; ctx.beginPath(); ctx.roundRect(12, 12, h - 24, h - 24, 9); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; const q = h - 24, bx = 12 + q / 2, by = 12 + q / 2; ctx.beginPath(); ctx.moveTo(bx - q * 0.18, by + q * 0.18); ctx.lineTo(bx + q * 0.18, by - q * 0.18); ctx.moveTo(bx - q * 0.02, by - q * 0.2); ctx.lineTo(bx + q * 0.2, by - q * 0.2); ctx.lineTo(bx + q * 0.2, by + q * 0.02); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.rect(h, 0, w - h - 8, h); ctx.clip(); ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = FF.col('ink', dark); ctx.font = FF.fontStr(s.font, s.fs, true, false); ctx.fillText(o.title || 'Link', h, h / 2 - 4);
        ctx.globalAlpha *= 0.55; ctx.font = FF.fontStr(s.font, s.fs - 3, false, false); ctx.fillText(o.url || '', h, h / 2 + s.fs * 0.9); ctx.restore(); break;
      }
      case 'table': {
        ctx.fillStyle = FF.col(s.fill, dark); ctx.fillRect(0, 0, w, h);
        const line = dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.3)';
        let y = 0; const lay = (o._lay ||= {});
        for (let r = 0; r < o.rows; r++) {
          let x = 0; if (o.hdr && r === 0) { ctx.fillStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.06)'; ctx.fillRect(0, 0, w, o.rh[0]); }
          for (let c = 0; c < o.cols; c++) {
            const txt = (o.cells[r] && o.cells[r][c]) || '';
            if (txt && !(rc.skipText === o.id && rc.cell && rc.cell[0] === r && rc.cell[1] === c)) {
              const key = r + ',' + c, cw = o.cw[c] - 12, k2 = txt + '|' + cw + '|' + s.fs + (o.hdr && r === 0 ? 'b' : '');
              let co = lay[key]; if (!co || co.k !== k2) co = lay[key] = { k: k2, o: { t: FF.plainToRuns(txt), s: { ...s, b: o.hdr && r === 0 ? 1 : 0 }, id: o.id }, L: null };
              drawText(ctx, co.o, { x: x + 6, y: y + 5, w: cw, h: o.rh[r] - 8 }, { ...rc, skipText: null });
            }
            x += o.cw[c];
          }
          y += o.rh[r];
        }
        ctx.shadowColor = 'transparent'; ctx.strokeStyle = line; ctx.lineWidth = s.sw || 1; ctx.beginPath(); let xx = 0, yy = 0;
        for (let c = 0; c <= o.cols; c++) { ctx.moveTo(xx, 0); ctx.lineTo(xx, h); xx += o.cw[c] || 0; } for (let r = 0; r <= o.rows; r++) { ctx.moveTo(0, yy); ctx.lineTo(w, yy); yy += o.rh[r] || 0; } ctx.stroke(); break;
      }
      case 'path': {
        const key = w + '|' + h; if (!o._pth || o._pth.key !== key) { const base = new Path2D(o.d), p = new Path2D(), vb = o.vb; p.addPath(base, new DOMMatrix().scale(w / (vb[2] || 1), h / (vb[3] || 1)).translate(-vb[0], -vb[1])); o._pth = { key, p }; }
        if (s.fill && s.fill !== 'none') { ctx.fillStyle = FF.col(s.fill, dark); ctx.fill(o._pth.p, o.evenodd ? 'evenodd' : 'nonzero'); }
        if (s.sw > 0 && s.stroke !== 'none') { ctx.strokeStyle = FF.col(s.stroke, dark); ctx.lineWidth = s.sw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dashOf(s)); ctx.stroke(o._pth.p); }
        break;
      }
    }
    ctx.restore();
  }
  FF.drawObj = drawObj;

  // draw many objects with culling + LOD. rc: {z, dark, vb:[x0,y0,x1,y1], skip:Set, skipText, sc, bgCol}
  FF.paintObjs = (ctx, objs, rc) => {
    const [vx0, vy0, vx1, vy1] = rc.vb; let n = 0; const pad = 14 / rc.z;
    for (const o of objs) {
      if (rc.skip && rc.skip.has(o.id)) continue; if (o.hidden) continue;
      const b = FF.bb(o); const m = (o.s.sw || 0) + pad + (o.s.shadow ? 24 / rc.z : 0) + (o.type === 'frame' ? 60 : 0);
      if (b[2] + m < vx0 || b[0] - m > vx1 || b[3] + m < vy0 || b[1] - m > vy1) continue;
      const sz = Math.max(b[2] - b[0], b[3] - b[1]) * rc.z;
      if (sz < 1.2 && o.type !== 'frame') { // LOD: speck
        ctx.fillStyle = o.type === 'stroke' ? FF.col(o.s.stroke, rc.dark) : FF.col(o.s.fill && o.s.fill !== 'none' ? o.s.fill : o.s.stroke, rc.dark); ctx.globalAlpha = 0.6; ctx.fillRect(b[0], b[1], Math.max(1 / rc.z, b[2] - b[0]), Math.max(1 / rc.z, b[3] - b[1])); ctx.globalAlpha = 1; n++; continue;
      }
      drawObj(ctx, o, rc); n++;
    }
    return n;
  };

  // ---------- backgrounds ----------
  const tileCache = {};
  const bgTile = (kind, px, dark) => {
    const key = kind + '|' + px.toFixed(2) + '|' + dark; if (tileCache[key]) return tileCache[key];
    const cells = kind === 'grid' ? 5 : 1, size = Math.max(2, Math.round(px * cells)), c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    const ink = dark ? '255,255,255' : '0,0,0';
    if (kind === 'dot') { g.fillStyle = `rgba(${ink},${dark ? 0.2 : 0.2})`; g.beginPath(); g.arc(size / 2, size / 2, Math.max(0.9, Math.min(1.6, px / 14)), 0, 6.3); g.fill(); }
    else { const st = size / cells; for (let i = 0; i < cells; i++) { g.fillStyle = `rgba(${ink},${i === 0 ? 0.13 : 0.06})`; g.fillRect(Math.round(i * st), 0, 1, size); g.fillRect(0, Math.round(i * st), size, 1); } }
    const keys = Object.keys(tileCache); if (keys.length > 12) delete tileCache[keys[0]];
    return (tileCache[key] = { c, size, scale: (px * cells) / size });
  };
  FF.boardColor = (B, dark) => B.color && B.color !== 'auto' ? B.color : dark ? '#1b1b1d' : '#fbfbfc';
  FF.drawBG = (ctx, B, view, W, H, dpr, dark, transparent) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (transparent) ctx.clearRect(0, 0, W * dpr, H * dpr); else { ctx.fillStyle = FF.boardColor(B, dark); ctx.fillRect(0, 0, W * dpr, H * dpr); }
    if (B.bg === 'none' || !B.bg) return;
    let sp = 24; while (sp * view.z < 14) sp *= B.bg === 'grid' ? 5 : 2;
    const px = sp * view.z * dpr, t = bgTile(B.bg, px, dark), cells = B.bg === 'grid' ? 5 : 1;
    const pat = ctx.createPattern(t.c, 'repeat'); const ox = (-view.x * view.z * dpr) % (px * cells), oy = (-view.y * view.z * dpr) % (px * cells);
    pat.setTransform(new DOMMatrix().translate(ox, oy).scale(t.scale)); ctx.fillStyle = pat; ctx.fillRect(0, 0, W * dpr, H * dpr);
  };

  // ---------- renderer with layer cache ----------
  class Renderer {
    constructor(main, over) { this.main = main; this.over = over; this.mc = main.getContext('2d', { alpha: false }); this.oc = over.getContext('2d'); this.W = 1; this.H = 1; this.dpr = 1; this.view = { x: 0, y: 0, z: 1 }; this.cache = null; this.heavy = false; this.frozen = null; this.zoomActive = 0; this.dirty = true; this.dirtyO = true; this.raf = 0; this.stats = { frames: 0, times: [], lastDraw: 0 }; this.rcExtra = {}; this.onOverlay = null; this.settleT = 0; }
    resize(W, H, dpr) { this.W = W; this.H = H; this.dpr = dpr; for (const c of [this.main, this.over]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; } this.cache = null; this.invalidate(); }
    invalidate() { this.dirty = this.dirtyO = true; this.schedule(); }
    invalidateOverlay() { this.dirtyO = true; this.schedule(); }
    schedule() { if (!this.raf) this.raf = requestAnimationFrame((t) => { this.raf = 0; this.frame(t); }); }
    rc(vb) { const v = this.view; return { z: v.z, dark: this.dark, vb, sc: v.z * this.dpr, bgCol: FF.boardColor(FF.B, this.dark), ...this.rcExtra, skip: this.frozen ? this.frozen.skip : null }; }
    freeze(ids) { // render everything except `ids` (+ their connectors) into a cache; those draw live on top
      const skip = new Set(ids); for (const c of FF.connsOf(skip)) skip.add(c.id);
      this.frozen = { skip, live: FF.B.objs.filter((o) => skip.has(o.id)) }; this.cache = null; this.invalidate();
    }
    unfreeze() { this.frozen = null; this.cache = null; this.invalidate(); }
    buildCache() {
      const v = this.view, B = FF.B, dpr = this.dpr; const mx = this.W / v.z * 0.3, my = this.H / v.z * 0.3;
      let wpx = (this.W * 1.6) * dpr, hpx = (this.H * 1.6) * dpr, k = Math.min(1, 4096 / wpx, 4096 / hpx);
      const cz = v.z * k; let cw = Math.ceil(wpx * k), ch = Math.ceil(hpx * k);
      const wwW = (this.W * 1.6) / v.z, wwH = (this.H * 1.6) / v.z; const ox = v.x - mx, oy = v.y - my;
      let c = this.cache; if (!c) { c = this.cache = { cv: document.createElement('canvas') }; } c.cv.width = cw; c.cv.height = ch;
      const g = c.cv.getContext('2d'); g.setTransform(cz * dpr / dpr * 1, 0, 0, cz * dpr / dpr * 1, 0, 0); // pixels per world unit = cz(*dpr folded in k)
      const ppu = (cw / wwW); g.setTransform(ppu, 0, 0, ppu, -ox * ppu, -oy * ppu);
      Object.assign(c, { ox, oy, ww: wwW, wh: wwH, z: v.z, ppu, rev: FF.rev, dark: this.dark });
      const rc = { z: v.z, dark: this.dark, vb: [ox, oy, ox + wwW, oy + wwH], sc: ppu, bgCol: FF.boardColor(B, this.dark), ...this.rcExtra, skip: this.frozen ? this.frozen.skip : null };
      const n = FF.paintObjs(g, B.objs, rc); this.heavy = n > (this.heavy ? 120 : 260); c.n = n;
    }
    frame(now) {
      const t0 = performance.now(), v = this.view, B = FF.B, dpr = this.dpr, W = this.W, H = this.H;
      if (this.dirty) {
        const vb = [v.x, v.y, v.x + W / v.z, v.y + H / v.z];
        const useCache = this.heavy || this.frozen;
        if (!useCache) {
          FF.drawBG(this.mc, B, v, W, H, dpr, this.dark); const ctx = this.mc; ctx.setTransform(v.z * dpr, 0, 0, v.z * dpr, -v.x * v.z * dpr, -v.y * v.z * dpr);
          const n = FF.paintObjs(ctx, B.objs, this.rc(vb)); if (n > 260) this.heavy = true;
        } else {
          let c = this.cache; const out = !c || vb[0] < c.ox || vb[1] < c.oy || vb[2] > c.ox + c.ww || vb[3] > c.oy + c.wh;
          const zoomed = c && Math.abs(v.z / c.z - 1) > 0.002; const stale = c && !this.frozen && (c.rev !== FF.rev || c.dark !== this.dark);
          if (!c || out || stale || (zoomed && !this.zoomActive)) { this.buildCache(); c = this.cache; }
          else if (zoomed && !this.settleT) { this.settleT = setTimeout(() => { this.settleT = 0; this.zoomActive = 0; this.cache = null; this.invalidate(); }, 140); }
          FF.drawBG(this.mc, B, v, W, H, dpr, this.dark);
          const s = v.z / c.z, ctx = this.mc; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(c.cv, (c.ox - v.x) * v.z * dpr, (c.oy - v.y) * v.z * dpr, c.ww * v.z * dpr, c.wh * v.z * dpr);
          if (this.frozen) { ctx.setTransform(v.z * dpr, 0, 0, v.z * dpr, -v.x * v.z * dpr, -v.y * v.z * dpr); const rc = this.rc(vb); rc.skip = null; FF.paintObjs(ctx, this.frozen.live, rc); }
        }
        this.dirty = false; this.lastMs = performance.now() - t0;
      }
      if (this.dirtyO) { this.dirtyO = false; const o = this.oc; o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, this.over.width, this.over.height); o.setTransform(v.z * dpr, 0, 0, v.z * dpr, -v.x * v.z * dpr, -v.y * v.z * dpr); this.onOverlay && this.onOverlay(o, v, dpr); }
      this.stats.frames++; this.stats.lastDraw = performance.now() - t0;
      if (this.onFrame) this.onFrame();
    }
  }
  FF.Renderer = Renderer;
})();
