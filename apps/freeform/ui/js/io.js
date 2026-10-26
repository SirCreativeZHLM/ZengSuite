/* Canvas I/O: .zfree zip, JSON, raster/SVG/PDF export, SVG import. */
(() => {
  'use strict';
  const R = FF.R, S = FF.S, f2 = (n) => Math.round(n * 100) / 100;
  const ext = (m) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif' }[m] || 'bin');
  const usedMedia = () => { const ids = new Set(); for (const b of FF.boards) for (const o of b.objs) if (o.type === 'image' && o.media) ids.add(o.media); return ids; };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

  // ---------- .zfree ----------
  FF.docJSON = (inline) => {
    const media = {}; for (const id of usedMedia()) { const m = FF.media.get(id); if (!m) continue; media[id] = inline ? { mime: m.mime, b64: b64(m.bytes) } : { mime: m.mime, file: `media/${id}.${ext(m.mime)}` }; }
    FF.boards.forEach((b) => (b.view = { ...b.view }));
    return { format: 'zengcanvas', version: 1, active: Math.max(0, FF.boards.indexOf(FF.B)), boards: FF.boards.map(FF.serializeBoard), media };
  };
  FF.saveZip = async () => {
    const j = FF.docJSON(false); const files = { 'board.json': fflate.strToU8(JSON.stringify(j)) };
    for (const [id, m] of Object.entries(j.media)) files[m.file] = [FF.media.get(id).bytes, { level: 0 }];
    try { const c = await FF.renderBounds(null, { scale: 1, maxSide: 360 }); if (c) { const blob = await new Promise((r) => c.toBlob(r, 'image/png')); files['preview.png'] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; } } catch {}
    return fflate.zipSync(files, { level: 6 });
  };
  FF.loadDoc = (j, files) => {
    if (!j || (j.format !== 'zengcanvas' && j.format !== 'zengfreeform') || !Array.isArray(j.boards) || !j.boards.length) throw new Error('This file is not a Canvas board.');
    const media = new Map();
    for (const [id, m] of Object.entries(j.media || {})) { let bytes = null; if (m.file && files) { const f = files[m.file]; if (f) bytes = f; } else if (m.b64) bytes = unb64(m.b64); if (bytes) media.set(id, { id, mime: m.mime, bytes }); }
    FF.media.forEach((m) => m.url && URL.revokeObjectURL(m.url)); FF.media = media;
    const boards = j.boards.map(FF.boardFromJSON); FF.boards = boards; FF.B = boards[Math.min(j.active || 0, boards.length - 1)]; S.sel.clear();
    FF.emit('board'); FF.emit('change', 'load'); FF.rev++;
  };
  FF.openBytes = (buf, name) => {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) { let files; try { files = fflate.unzipSync(u8); } catch { throw new Error('The file is damaged and could not be unzipped.'); } if (!files['board.json']) throw new Error('board.json is missing from this file.'); FF.loadDoc(JSON.parse(fflate.strFromU8(files['board.json'])), files); }
    else FF.loadDoc(JSON.parse(new TextDecoder().decode(u8)), null);
  };
  FF.newDoc = () => { FF.media.clear(); FF.boards = [FF.newBoard('Board 1')]; FF.B = FF.boards[0]; S.sel.clear(); FF.emit('board'); FF.emit('change', 'load'); };

  // ---------- raster export ----------
  FF.exportObjs = (scope) => { // scope: 'board' | 'selection' | {frame: id}
    const B = FF.B;
    if (scope && scope.frame) { const fr = B.map.get(scope.frame); return { objs: B.objs, bounds: [fr.x, fr.y, fr.x + fr.w, fr.y + fr.h], clip: true }; }
    if (scope === 'selection') { const o = FF.selObjs(); if (!o.length) return null; const b = FF.unionBB(o); const pad = 16; return { objs: o, bounds: [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad] }; }
    const objs = B.objs.filter((o) => !o.hidden); if (!objs.length) return null; const b = FF.unionBB(objs); const pad = 40; return { objs, bounds: [b[0] - pad, b[1] - pad - 14, b[2] + pad, b[3] + pad] };
  };
  FF.renderBounds = async (scope, { scale = 1, transparent = false, dark = false, jpeg = false, maxSide = 0 } = {}) => {
    const ex = FF.exportObjs(scope || 'board'); if (!ex) return null; const b = ex.bounds; let w = b[2] - b[0], h = b[3] - b[1];
    if (maxSide) scale = Math.min(scale, maxSide / Math.max(w, h));
    let W = Math.ceil(w * scale), H = Math.ceil(h * scale);
    if (W > 16384 || H > 16384 || W * H > 80e6) throw new Error(`The image would be ${W}×${H} pixels, which is too large. Choose a smaller scale or export as SVG.`);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    if (!transparent || jpeg) { g.fillStyle = FF.boardColor(FF.B, dark); g.fillRect(0, 0, W, H); }
    const sc = W / w; g.setTransform(sc, 0, 0, sc, -b[0] * sc, -b[1] * sc);
    if (ex.clip) { g.beginPath(); g.rect(b[0], b[1], w, h); g.clip(); }
    // make sure all images are decoded
    await Promise.all(ex.objs.filter((o) => o.type === 'image').map(async (o) => { const m = FF.media.get(o.media); if (m && !m.img) { FF.getImg(o.media); } if (m && m.img && !m.img.complete) await m.img.decode().catch(() => {}); }));
    FF.paintObjs(g, ex.objs, { z: sc, dark, vb: b, sc, bgCol: FF.boardColor(FF.B, dark) });
    return c;
  };
  FF.exportRaster = async (scope, opts) => {
    const c = await FF.renderBounds(scope, opts); if (!c) throw new Error('There is nothing to export.');
    const blob = await new Promise((r) => c.toBlob(r, opts.jpeg ? 'image/jpeg' : 'image/png', 0.92)); return blob;
  };
  FF.copyPNG = async (scope) => {
    try { const blob = await FF.exportRaster(scope, { scale: 2, transparent: false, dark: FF.dark }); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); zk.toast('Copied as PNG'); }
    catch (e) { zk.alert('Couldn’t copy as PNG', (e && e.message) || 'The system clipboard refused the image. Export it as a file instead.'); }
  };

  // ---------- SVG export ----------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const headD = (kind, x, y, ang, s) => {
    const P = (px, py) => { const c = Math.cos(ang), n = Math.sin(ang); return f2(x + px * c - py * n) + ' ' + f2(y + px * n + py * c); };
    if (kind === 'arrow') return { d: `M${P(-s, -s * 0.55)}L${P(0, 0)}L${P(-s, s * 0.55)}`, fill: false };
    if (kind === 'tri') return { d: `M${P(0, 0)}L${P(-s, -s * 0.5)}L${P(-s, s * 0.5)}Z`, fill: true };
    if (kind === 'circle') { const r = s * 0.4; return { d: `M${P(-s * 0.4 - r, 0)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r * Math.cos(ang))} ${f2(2 * r * Math.sin(ang))}a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r * Math.cos(ang))} ${f2(-2 * r * Math.sin(ang))}Z`, fill: true }; }
    if (kind === 'diamond') return { d: `M${P(0, 0)}L${P(-s * 0.6, -s * 0.4)}L${P(-s * 1.2, 0)}L${P(-s * 0.6, s * 0.4)}Z`, fill: true };
    if (kind === 'bar') return { d: `M${P(0, -s * 0.5)}L${P(0, s * 0.5)}`, fill: false };
    return null;
  };
  const textSVG = (o, box, dark, mulOverride) => {
    if (!FF.hasText(o)) return ''; const L = FF.objLayout(o, o.type === 'text' && o.autoW ? 1e9 : box.w, box.h), s = o.s, auto = FF.autoCol(o, dark); let out = '';
    let ty = box.y; if (s.va === 'middle') ty += (box.h - L.h) / 2; else if (s.va === 'bottom') ty += box.h - L.h;
    for (const ln of L.lines) { let ox = box.x; if (s.ta === 'center') ox += (box.w - ln.w) / 2; else if (s.ta === 'right') ox += box.w - ln.w; const base = ty + ln.y + ln.h * 0.5 + ln.asc * 0.36;
      for (const it of ln.items) { if (!it.t.trim() && !it.u && !it.st) continue; const c = it.c === 'ink' ? auto : FF.col(it.c, dark); const deco = [it.u && 'underline', it.st && 'line-through'].filter(Boolean).join(' ');
        out += `<text x="${f2(ox + it.x)}" y="${f2(base)}" font-family="${esc(FF.FAMS[s.font] || FF.FAMS.sans)}" font-size="${f2(it.sz)}"${/^(italic)/.test(it.font) ? ' font-style="italic"' : ''}${/ 600 /.test(' ' + it.font) ? ' font-weight="600"' : ''} fill="${c}"${deco ? ` text-decoration="${deco}"` : ''} xml:space="preserve">${esc(it.t)}</text>`; } }
    return out;
  };
  FF.objSVG = (o, dark) => {
    const s = o.s, op = s.op != null && s.op !== 1 ? ` opacity="${s.op}"` : '', col = (c) => FF.col(c, dark);
    const dash = s.dash === 'dash' ? ` stroke-dasharray="${f2(s.sw * 3.2)} ${f2(s.sw * 2.2)}"` : s.dash === 'dot' ? ` stroke-dasharray="0.01 ${f2(s.sw * 2.4)}" stroke-linecap="round"` : '';
    const sh = s.shadow ? ' filter="url(#zsh)"' : '';
    if (o.type === 'conn') {
      const g = FF.connGeo(o), c = col(s.stroke), sw = s.sw || 2; let out = `<g${op}><path d="${g.d}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
      for (const [k, A, ang] of [[o.ha, g.A, g.angA], [o.hb, g.B, g.angB]]) { const h = headD(k, A.x, A.y, ang, FF.headSize(sw)); if (h) out += `<path d="${h.d}" fill="${h.fill ? c : 'none'}" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`; }
      if (FF.hasText(o)) { const L = FF.layout(o, 220, 1), w = L.w + 14, h = L.h + 6; out += `<rect x="${f2(g.mid[0] - w / 2)}" y="${f2(g.mid[1] - h / 2)}" width="${f2(w)}" height="${f2(h)}" rx="6" fill="${FF.boardColor(FF.B, dark)}"/>` + textSVG({ ...o, id: o.id, s: { ...s, ta: 'center', va: 'middle', fill: 'none' }, _lay: null }, { x: g.mid[0] - w / 2 + 7, y: g.mid[1] - h / 2 + 3, w: L.w, h: L.h }, dark); }
      return out + '</g>';
    }
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, tf = ` transform="translate(${f2(cx)} ${f2(cy)})${o.rot ? ` rotate(${f2((o.rot * 180) / Math.PI)})` : ''} translate(${f2(-o.w / 2)} ${f2(-o.h / 2)})"`;
    const st = s.sw > 0 && s.stroke && s.stroke !== 'none' ? ` stroke="${col(s.stroke)}" stroke-width="${s.sw}" stroke-linejoin="round"${dash}` : ' stroke="none"';
    const fl = s.fill && s.fill !== 'none' ? col(s.fill) : 'none';
    switch (o.type) {
      case 'stroke': { const sp = FF.strokePath(o), c = col(s.stroke); const a = s.tool === 'hl' ? 0.4 : s.tool === 'pencil' ? 0.82 : 1; return `<path${tf} d="${sp.d}" fill="${c}"${a !== 1 ? ` fill-opacity="${a * (s.op != null ? s.op : 1)}"` : op}${s.tool === 'hl' && !dark ? ' style="mix-blend-mode:multiply"' : ''}/>`; }
      case 'shape': { const sp = FF.shapePath(o); return `<g${tf}${op}${sh}><path d="${sp.d}" fill="${fl}"${st}/>${sp.d2 ? `<path d="${sp.d2}" fill="none"${st}/>` : ''}${textSVG(o, FF.textBox(o), dark)}</g>`; }
      case 'sticky': { const f = FF.foldSize(o.w, o.h); return `<g${tf}${op}${sh}><path d="${FF.stickyD(o.w, o.h)}" fill="${fl}"/><path d="M${f2(o.w - f)} ${f2(o.h)}L${f2(o.w)} ${f2(o.h - f)}L${f2(o.w - f)} ${f2(o.h - f)}Z" fill="#000" fill-opacity=".16"/>${textSVG(o, FF.textBox(o), dark)}</g>`; }
      case 'text': return `<g${tf}${op}>${textSVG(o, { x: 0, y: 0, w: o.w, h: o.h }, dark)}</g>`;
      case 'image': { const m = FF.media.get(o.media); if (!m) return ''; return `<image${tf}${op} width="${f2(o.w)}" height="${f2(o.h)}" preserveAspectRatio="none" href="data:${m.mime};base64,${b64(m.bytes)}"/>`; }
      case 'stamp': return `<text${tf}${op} x="${f2(o.w / 2)}" y="${f2(o.h / 2 + o.h * 0.3)}" text-anchor="middle" font-size="${f2(Math.min(o.w, o.h) * 0.82)}" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${esc(o.ch || '')}</text>`;
      case 'frame': { const fs = Math.max(s.fs || 16, 16); return `<g${tf}${op}><rect width="${f2(o.w)}" height="${f2(o.h)}" fill="${s.fill && s.fill !== 'none' ? col(s.fill) : dark ? '#ffffff08' : '#00000008'}" stroke="${col(s.stroke)}" stroke-opacity=".55" stroke-width="1"/><text x="0" y="${f2(-fs * 0.35)}" font-size="${fs}" font-weight="600" fill="${col('ink')}" fill-opacity=".75" font-family="${esc(FF.FAMS[s.font] || FF.FAMS.sans)}">${esc(o.title || 'Frame')}</text></g>`; }
      case 'card': return `<g${tf}${op}${sh}><rect width="${f2(o.w)}" height="${f2(o.h)}" rx="12" fill="${fl}" stroke="${dark ? '#ffffff24' : '#00000024'}"/><rect x="12" y="12" width="${f2(o.h - 24)}" height="${f2(o.h - 24)}" rx="9" fill="#ff375f"/><text x="${f2(o.h)}" y="${f2(o.h / 2 - 4)}" font-size="${s.fs}" font-weight="600" fill="${col('ink')}" font-family="${esc(FF.FAMS[s.font])}">${esc(o.title || '')}</text><text x="${f2(o.h)}" y="${f2(o.h / 2 + s.fs * 0.9)}" font-size="${s.fs - 3}" fill="${col('ink')}" fill-opacity=".55" font-family="${esc(FF.FAMS[s.font])}">${esc(o.url || '')}</text></g>`;
      case 'table': { let out = `<g${tf}${op}><rect width="${f2(o.w)}" height="${f2(o.h)}" fill="${fl}"/>`; let y = 0; for (let r = 0; r < o.rows; r++) { let x = 0; if (o.hdr && r === 0) out += `<rect width="${f2(o.w)}" height="${f2(o.rh[0])}" fill="${dark ? '#ffffff1a' : '#0000000f'}"/>`; for (let c = 0; c < o.cols; c++) { const txt = (o.cells[r] && o.cells[r][c]) || ''; if (txt) out += textSVG({ t: FF.plainToRuns(txt), s: { ...s, b: o.hdr && r === 0 ? 1 : 0 }, id: o.id }, { x: x + 6, y: y + 5, w: o.cw[c] - 12, h: o.rh[r] - 8 }, dark); x += o.cw[c]; } y += o.rh[r]; }
        let d = '', xx = 0, yy = 0; for (let c = 0; c <= o.cols; c++) { d += `M${f2(xx)} 0V${f2(o.h)}`; xx += o.cw[c] || 0; } for (let r = 0; r <= o.rows; r++) { d += `M0 ${f2(yy)}H${f2(o.w)}`; yy += o.rh[r] || 0; } return out + `<path d="${d}" stroke="${dark ? '#ffffff47' : '#0000004d'}" stroke-width="${s.sw || 1}" fill="none"/></g>`; }
      case 'path': { const vb = o.vb; return `<path${op} transform="translate(${f2(cx)} ${f2(cy)})${o.rot ? ` rotate(${f2((o.rot * 180) / Math.PI)})` : ''} translate(${f2(-o.w / 2)} ${f2(-o.h / 2)}) scale(${f2(o.w / (vb[2] || 1))} ${f2(o.h / (vb[3] || 1))}) translate(${f2(-vb[0])} ${f2(-vb[1])})" d="${esc(o.d)}" fill="${fl}"${st.replace(/stroke-width="[^"]+"/, `stroke-width="${s.sw}"`)}${o.evenodd ? ' fill-rule="evenodd"' : ''}/>`; }
    }
    return '';
  };
  FF.toSVG = (scope, { dark = false, transparent = false } = {}) => {
    const ex = FF.exportObjs(scope || 'board'); if (!ex) return null; const b = ex.bounds, w = b[2] - b[0], h = b[3] - b[1];
    let body = ''; for (const o of ex.objs) { if (o.hidden) continue; const q = FF.bb(o); if (ex.clip && (q[2] < b[0] || q[0] > b[2] || q[3] < b[1] || q[1] > b[3])) continue; body += FF.objSVG(o, dark); }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}" height="${f2(h)}" viewBox="${f2(b[0])} ${f2(b[1])} ${f2(w)} ${f2(h)}"><defs><filter id="zsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="${dark ? 0.55 : 0.22}"/></filter>${ex.clip ? `<clipPath id="zclip"><rect x="${f2(b[0])}" y="${f2(b[1])}" width="${f2(w)}" height="${f2(h)}"/></clipPath>` : ''}</defs>${transparent ? '' : `<rect x="${f2(b[0])}" y="${f2(b[1])}" width="${f2(w)}" height="${f2(h)}" fill="${FF.boardColor(FF.B, dark)}"/>`}<g${ex.clip ? ' clip-path="url(#zclip)"' : ''}>${body}</g></svg>\n`;
  };

  // ---------- PDF via the print path ----------
  FF.buildPrint = (scopes, { dark = false } = {}) => {
    let root = document.getElementById('printroot'); if (!root) { root = document.createElement('div'); root.id = 'printroot'; document.body.append(root); }
    let first = null; const parts = [];
    for (const sc of scopes) { const svg = FF.toSVG(sc, { dark }); if (!svg) continue; const ex = FF.exportObjs(sc), w = ex.bounds[2] - ex.bounds[0], h = ex.bounds[3] - ex.bounds[1]; first ||= [w, h]; parts.push(svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')); }
    if (!parts.length) return false;
    const pw = Math.min(first[0], 3000), ph = first[1] * (pw / first[0]);
    root.innerHTML = parts.map((p) => `<div class="pp">${p}</div>`).join('');
    let st = document.getElementById('pagestyle'); if (!st) { st = document.createElement('style'); st.id = 'pagestyle'; document.head.append(st); }
    st.textContent = `@page{size:${Math.round(pw)}px ${Math.round(ph)}px;margin:0}@media print{#printroot .pp{width:${Math.round(pw)}px;height:${Math.round(ph)}px}}`;
    document.documentElement.classList.add('printing'); return true;
  };
  FF.clearPrint = () => { const r = document.getElementById('printroot'); if (r) r.innerHTML = ''; document.documentElement.classList.remove('printing'); };
  FF.printPDF = (scopes, opts) => { if (!FF.buildPrint(scopes, opts)) return zk.alert('Nothing to print', 'The board is empty.'); setTimeout(() => { try { zeng.print(); } finally { setTimeout(FF.clearPrint, 1500); } }, 80); };

  // ---------- SVG import ----------
  FF.importSVGText = (text, at) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'); const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('This is not a valid SVG file.');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none'; document.body.append(host);
    const live = document.importNode(svg, true); host.append(live);
    try {
      const vb = (live.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat); let W = parseFloat(live.getAttribute('width')), H = parseFloat(live.getAttribute('height'));
      if (!isFinite(W) || !isFinite(H)) { if (vb.length === 4) { W = vb[2]; H = vb[3]; } else { W = 800; H = 600; } } live.setAttribute('width', W); live.setAttribute('height', H);
      const objs = []; const g = FF.id(); const skip = 'defs,clipPath,mask,marker,pattern,symbol,linearGradient,radialGradient,filter';
      const els = [...live.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,image')].filter((e) => !e.closest(skip)).slice(0, 5000);
      const colorOf = (v) => { if (!v || v === 'none') return 'none'; const m = /url\(["']?#([^)"']+)/.exec(v); if (m) { const gr = live.querySelector('#' + CSS.escape(m[1])); const stop = gr && gr.querySelector('stop'); return stop ? getComputedStyle(stop).stopColor || '#999999' : '#999999'; } return v; };
      for (const el of els) {
        const cs = getComputedStyle(el), M = el.getCTM ? el.getCTM() : null; if (!M) continue; let bb; try { bb = el.getBBox(); } catch { continue; }
        const sx = Math.hypot(M.a, M.b) || 1, sy = Math.hypot(M.c, M.d) || 1, rot = Math.atan2(M.b, M.a), tag = el.tagName.toLowerCase();
        const cx = M.a * (bb.x + bb.width / 2) + M.c * (bb.y + bb.height / 2) + M.e, cy = M.b * (bb.x + bb.width / 2) + M.d * (bb.y + bb.height / 2) + M.f; const w = Math.max(0.5, bb.width * sx), h = Math.max(0.5, bb.height * sy);
        const base = { x: cx - w / 2, y: cy - h / 2, w, h, rot, g }; const swv = parseFloat(cs.strokeWidth) * (sx + sy) / 2 || 0; const fill = colorOf(cs.fill), stroke = colorOf(cs.stroke); const opv = parseFloat(cs.opacity); const style = { fill, stroke, sw: stroke === 'none' ? 0 : swv, op: isFinite(opv) ? opv : 1 };
        if (tag === 'text') { const fs = (parseFloat(cs.fontSize) || 16) * sy; const o = FF.make('text', { ...base, autoW: true, t: FF.plainToRuns(el.textContent.trim()), s: { fs, tc: fill === 'none' ? 'ink' : fill, font: /mono|courier/i.test(cs.fontFamily) ? 'mono' : /serif/i.test(cs.fontFamily) && !/sans/i.test(cs.fontFamily) ? 'serif' : 'sans', b: +cs.fontWeight >= 600 ? 1 : 0 } }); FF.fitText(o); o.x = cx - o.w / 2; o.y = cy - o.h / 2; objs.push(o); continue; }
        if (tag === 'image') { const href = el.getAttribute('href') || el.getAttribute('xlink:href') || ''; const m = /^data:([^;,]+);base64,(.*)$/s.exec(href); if (!m) continue; objs.push({ __img: { mime: m[1], bytes: unb64(m[2]) }, base: { ...base, type: 'image' } }); continue; }
        let o;
        if (tag === 'rect' && !M.b && !M.c) { const rx = parseFloat(el.getAttribute('rx')) || 0; o = FF.make('shape', { ...base, kind: rx > 0 ? 'round' : 'rect', s: style }); }
        else if ((tag === 'circle' || tag === 'ellipse') && !M.b && !M.c) o = FF.make('shape', { ...base, kind: 'ellipse', s: style });
        else { let d = el.getAttribute('d'); if (tag === 'line') d = `M${el.getAttribute('x1') || 0} ${el.getAttribute('y1') || 0}L${el.getAttribute('x2') || 0} ${el.getAttribute('y2') || 0}`; else if (tag === 'polyline' || tag === 'polygon') { const p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat); d = 'M' + p.reduce((s, v, i) => s + (i % 2 ? ' ' : i ? 'L' : '') + v, '') + (tag === 'polygon' ? 'Z' : ''); } else if (tag === 'rect') { const x = bb.x, y = bb.y; d = `M${x} ${y}h${bb.width}v${bb.height}h${-bb.width}Z`; } else if (tag === 'circle' || tag === 'ellipse') { const rx = bb.width / 2, ry = bb.height / 2; d = `M${bb.x} ${bb.y + ry}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`; } if (!d) continue;
          o = FF.make('path', { ...base, d, vb: [bb.x, bb.y, bb.width || 1, bb.height || 1], evenodd: cs.fillRule === 'evenodd', s: style }); }
        objs.push(o);
      }
      const finals = []; for (const o of objs) { if (o.__img) { const bb = o.base; try { const m = FF.media; const id = FF.id(); FF.media.set(id, { id, mime: o.__img.mime, bytes: o.__img.bytes }); finals.push(FF.make('image', { ...bb, media: id })); } catch {} } else finals.push(o); }
      if (!finals.length) throw new Error('This SVG has no shapes Canvas can import.');
      const bbx = FF.unionBB(finals); const scale = Math.min(1, 900 / (bbx[2] - bbx[0]), 700 / (bbx[3] - bbx[1])); const c0 = [(bbx[0] + bbx[2]) / 2, (bbx[1] + bbx[3]) / 2]; const c = at || FF.viewCenter();
      for (const o of finals) { const ox = o.x + o.w / 2, oy = o.y + o.h / 2; o.w *= scale; o.h *= scale; if (o.s.sw) o.s.sw *= scale; if (o.type === 'text') { o.s.fs *= scale; FF.fitText(o); } o.x = c[0] + (ox - c0[0]) * scale - o.w / 2; o.y = c[1] + (oy - c0[1]) * scale - o.h / 2; FF.touch(o); }
      if (finals.length === 1) delete finals[0].g;
      const t = FF.tx('Import SVG'); finals.forEach((o) => t.add(o)); t.end(); FF.select(finals); R.invalidate(); FF.emit('xform'); return finals;
    } finally { host.remove(); }
  };
})();
