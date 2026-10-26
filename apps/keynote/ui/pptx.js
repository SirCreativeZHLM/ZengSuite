/* .pptx (OOXML) export and import, hand written. */
(() => {
  const K = (window.K = window.K || {});
  const EMU = 12700;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const e = (n) => Math.round(n * EMU);
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const hex6 = (deck, c) => K.hex(deck, c).replace('#', '').toUpperCase();
  const clr = (deck, c, a = 1) => `<a:srgbClr val="${hex6(deck, c)}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`;
  const solid = (deck, c, a) => `<a:solidFill>${clr(deck, c, a)}</a:solidFill>`;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  // =============== EXPORT ===============
  K.pptxExport = async (deck) => {
    const files = {}; const ct = { defaults: { rels: 'application/vnd.openxmlformats-package.relationships+xml', xml: 'application/xml' }, overrides: {} };
    const put = (path, text) => { files[path] = fflate.strToU8(text); };
    const W = deck.size.w, H = deck.size.h; const mediaMap = new Map(); let mediaN = 0; const mediaFiles = {};
    const addMedia = (bytes, ext, key) => { if (key && mediaMap.has(key)) return mediaMap.get(key); const name = `image${++mediaN}.${ext}`; mediaFiles['ppt/media/' + name] = [bytes, { level: 0 }]; ct.defaults[ext] = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }[ext] || 'application/octet-stream'; if (key) mediaMap.set(key, name); return name; };
    const mext = (m) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp' }[m.type] || 'png');
    const layouts = deck.layouts;

    // ---- text ----
    const bullet = (list) => ({ b: '<a:buFont typeface="Arial"/><a:buChar char="•"/>', d: '<a:buFont typeface="Arial"/><a:buChar char="–"/>', c: '<a:buFont typeface="Wingdings"/><a:buChar char="&#252;"/>', n: '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>', a: '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="alphaLcPeriod"/>', r: '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="romanLcPeriod"/>' }[list] || '<a:buNone/>');
    const runXml = (R, ts, r, ctxx) => {
      const sz = Math.round((r.sz || ts.sz) * 100); const b = r.b ?? ts.b, i = r.i ?? ts.i, u = r.u ?? ts.u, s = r.s ?? ts.s; const c = r.c || ts.c; const f = r.f || ts.f;
      let attr = `lang="en-US" sz="${sz}"${b ? ' b="1"' : ''}${i ? ' i="1"' : ''}${u ? ' u="sng"' : ''}${s ? ' strike="sngStrike"' : ''}${r.sup ? ' baseline="30000"' : r.sub ? ' baseline="-25000"' : ''}${ts.tr ? ` spc="${Math.round(ts.tr * 100)}"` : ''}${ts.up ? ' cap="all"' : ''} dirty="0"`;
      let inner = solid(deck, c); if (r.hl) inner += `<a:highlight>${clr(deck, r.hl)}</a:highlight>`; inner += `<a:latin typeface="${esc(K.fontName(deck, f))}"/>`;
      if (r.l) { if (/^#\d+$/.test(r.l)) { const rid = R.add('slide', `slide${r.l.slice(1)}.xml`); inner += `<a:hlinkClick r:id="${rid}" action="ppaction://hlinksldjump"/>`; } else { const rid = R.add('hyperlink', r.l, true); inner += `<a:hlinkClick r:id="${rid}"/>`; } }
      return `<a:rPr ${attr}>${inner}</a:rPr>`;
    };
    const parasXml = (R, paras, ts, idx) => {
      const out = []; const ind = Math.max(16, ts.sz * 0.85);
      for (const p of paras && paras.length ? paras : [{ runs: [{ t: '' }] }]) {
        const list = p.list ?? ts.list; const lv = p.lv || 0; const al = p.al || ts.al; const ls = p.ls || ts.ls || 1.15; const sa = p.sa ?? ts.sa ?? 0, sb = p.sb ?? ts.sb ?? 0;
        const has = list && list !== 'none'; const marL = has ? e(ind * (lv + 1)) : e(ind * lv), indent = has ? -e(ind) : 0;
        let ppr = `<a:pPr algn="${{ l: 'l', c: 'ctr', r: 'r', j: 'just' }[al] || 'l'}" marL="${marL}" indent="${indent}"${lv ? ` lvl="${lv}"` : ''}><a:lnSpc><a:spcPct val="${Math.round(ls * 100000)}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round(sb * 100)}"/></a:spcBef><a:spcAft><a:spcPts val="${Math.round(sa * 100)}"/></a:spcAft>${has ? bullet(list) : '<a:buNone/>'}</a:pPr>`;
        let body = ''; for (const r of p.runs) {
          if (r.field === 'slideno') { body += `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${runXml(R, ts, r)}<a:t>${idx + 1}</a:t></a:fld>`; continue; }
          const text = r.field ? K.fieldText(deck, r.field, { index: idx }) : r.t; if (!text) continue; const parts = text.split('\n'); parts.forEach((t, i) => { if (i) body += `<a:br>${runXml(R, ts, r)}</a:br>`; if (t) body += `<a:r>${runXml(R, ts, r)}<a:t>${esc(t)}</a:t></a:r>`; });
        }
        out.push(`<a:p>${ppr}${body}<a:endParaRPr lang="en-US" sz="${Math.round(ts.sz * 100)}" dirty="0"/></a:p>`);
      }
      return out.join('');
    };
    const bodyPr = (ts, o) => { const pad = e(ts.pad ?? 6); const anchor = { t: 't', m: 'ctr', b: 'b' }[ts.va || 't']; return `<a:bodyPr wrap="square" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" anchor="${anchor}"${ts.cols > 1 ? ` numCol="${ts.cols}" spcCol="${e(ts.gap ?? 24)}"` : ''} rtlCol="0">${ts.fit === 'shrink' ? '<a:normAutofit/>' : o && o.ah ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</a:bodyPr>`; };

    // ---- fills & lines ----
    const fillXml = async (R, f, o) => {
      if (!f || (f.t === 'none')) return '<a:noFill/>'; if (typeof f === 'string') f = { t: 'solid', c: f };
      if (f.t === 'solid') return solid(deck, f.c, f.a ?? 1);
      if (f.t === 'grad') { const gs = f.stops.map((s) => `<a:gs pos="${Math.round(s[0] * 100000)}">${clr(deck, s[1], s[2] ?? 1)}</a:gs>`).join(''); return f.kind === 'radial' ? `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>` : `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${Math.round((((f.ang ?? 180) - 90 + 360) % 360) * 60000)}" scaled="0"/></a:gradFill>`; }
      if (f.t === 'img') { const m = deck.media[f.m]; if (!m) return '<a:noFill/>'; const name = addMedia(m.data, mext(m), 'm' + f.m); const rid = R.add('image', '../media/' + name); return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/>${f.mode === 'tile' ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : '<a:stretch><a:fillRect/></a:stretch>'}</a:blipFill>`; }
      return '<a:noFill/>';
    };
    const dashOf = (l) => ({ dash: 'dash', dot: 'sysDot', dashdot: 'dashDot' }[l.dash] || 'solid');
    const headOf = (t) => ({ arrow: 'arrow', triangle: 'triangle', stealth: 'stealth', diamond: 'diamond', oval: 'oval' }[t]);
    const lnXml = (l, conn) => { if (!l || !l.c || l.w === 0) return '<a:ln><a:noFill/></a:ln>'; const hd = conn ? headOf(l.tail) : null, tl = conn ? headOf(l.head) : null; return `<a:ln w="${e(l.w || 1)}" cap="${l.dash === 'dot' ? 'rnd' : 'flat'}">${solid(deck, l.c, l.a ?? 1)}<a:prstDash val="${dashOf(l)}"/><a:round/>${hd ? `<a:headEnd type="${hd}" w="med" len="med"/>` : ''}${tl ? `<a:tailEnd type="${tl}" w="med" len="med"/>` : ''}</a:ln>`; };
    const fxXml = (o) => { if (!o.sh) return ''; const d = Math.hypot(o.sh.x, o.sh.y); const dir = ((Math.atan2(o.sh.y, o.sh.x) * 180) / Math.PI + 360) % 360; return `<a:effectLst><a:outerShdw blurRad="${e(o.sh.b)}" dist="${e(d)}" dir="${Math.round(dir * 60000)}" algn="ctr" rotWithShape="0">${clr(deck, o.sh.c, o.sh.a ?? 0.4)}</a:outerShdw></a:effectLst>`; };
    const SAFE = new Set(['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond']);
    const geomXml = (o, shape) => {
      const def = K.shapes[shape]; const a = o.adj && o.adj.length ? o.adj : def ? def.a : [];
      if (!o.path && SAFE.has(shape) && (shape === 'roundRect' ? true : shape === 'triangle' ? true : !a.length || a.every((v, i) => v == null || Math.abs(v - def.a[i]) < 1e-6))) { const av = shape === 'roundRect' ? `<a:gd name="adj" fmla="val ${Math.round((a[0] ?? 0.16) * 100000)}"/>` : shape === 'triangle' ? `<a:gd name="adj" fmla="val ${Math.round((a[0] ?? 0.5) * 100000)}"/>` : ''; return `<a:prstGeom prst="${shape}"><a:avLst>${av}</a:avLst></a:prstGeom>`; }
      const d = o.path || K.shapePath(shape, o.w, o.h, o.adj); const w = e(o.w), h = e(o.h); const f = (n) => Math.round(n * EMU); let p = '';
      const pt = (x, y) => `<a:pt x="${f(x)}" y="${f(y)}"/>`;
      for (const c of K.parsePath(d)) { const n = c.slice(1); if (c[0] === 'M') p += `<a:moveTo>${pt(n[0], n[1])}</a:moveTo>`; else if (c[0] === 'L') p += `<a:lnTo>${pt(n[0], n[1])}</a:lnTo>`; else if (c[0] === 'C') p += `<a:cubicBezTo>${pt(n[0], n[1])}${pt(n[2], n[3])}${pt(n[4], n[5])}</a:cubicBezTo>`; else if (c[0] === 'Q') p += `<a:quadBezTo>${pt(n[0], n[1])}${pt(n[2], n[3])}</a:quadBezTo>`; else if (c[0] === 'Z') p += '<a:close/>'; }
      return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}">${p}</a:path></a:pathLst></a:custGeom>`;
    };
    const xfrm = (o, tag = 'a:xfrm', extra = '') => `<${tag}${o.rot ? ` rot="${Math.round(o.rot * 60000)}"` : ''}${o.fh ? ' flipH="1"' : ''}${o.fv ? ' flipV="1"' : ''}${extra}><a:off x="${e(o.x)}" y="${e(o.y)}"/><a:ext cx="${Math.max(0, e(o.w))}" cy="${Math.max(0, e(o.h))}"/></${tag}>`;

    // ---- shapes ----
    const PH = { title: ['title', null], subtitle: ['subTitle', 1], body: [null, 1], body2: [null, 2], image: ['pic', 13], quote: [null, 14], attribution: [null, 15], fact: [null, 16], caption: [null, 17], slideno: ['sldNum', 12], date: ['dt', 10], footer: ['ftr', 11] };
    const phTag = (o, kind) => { if (!o.ph) return ''; let [t, i] = PH[o.ph] || [null, 20]; if (o.ph === 'title' && kind === 'title') t = 'ctrTitle'; return `<p:ph${t ? ` type="${t}"` : ''}${i != null ? ` idx="${i}"` : ''}/>`; };
    const mkIds = () => { let n = 1; const map = new Map(); return { next: () => ++n, map }; };
    const spXml = async (R, o, ids, idx, kind) => {
      const id = ids.next(); ids.map.set(o.id, id); const name = esc(o.name || K.defaultName(o) + ' ' + id);
      const isText = o.type === 'text'; const ts = K.tstyle(o); const shape = isText ? 'rect' : o.shape; const hasText = !K.isEmptyText(o) || isText;
      const fill = o.fill === undefined && (K.shapes[shape] || {}).open ? null : o.fill;
      const link = o.link ? (typeof o.link === 'string' ? o.link : o.link.url) : null; let hl = '';
      if (link) { if (/^#\d+$/.test(link)) hl = `<a:hlinkClick r:id="${R.add('slide', `slide${link.slice(1)}.xml`)}" action="ppaction://hlinksldjump"/>`; else hl = `<a:hlinkClick r:id="${R.add('hyperlink', link, true)}"/>`; }
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"${o.alt ? ` descr="${esc(o.alt)}"` : ''}>${hl}</p:cNvPr><p:cNvSpPr${isText && !o.ph ? ' txBox="1"' : ''}/><p:nvPr>${phTag(o, kind)}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(o)}${geomXml(o, shape)}${await fillXml(R, fill, o)}${lnXml(o.line)}${fxXml(o)}</p:spPr>${hasText ? `<p:txBody>${bodyPr(ts, o)}<a:lstStyle/>${parasXml(R, o.paras, ts, idx)}</p:txBody>` : ''}</p:sp>`;
    };
    const picXml = async (R, o, ids, bytesFn, name, descr) => {
      const id = ids.next(); ids.map.set(o.id, id); const { bytes, ext, key } = await bytesFn(); const file = addMedia(bytes, ext, key); const rid = R.add('image', '../media/' + file);
      const c = o.crop || { x: 0, y: 0, w: 1, h: 1 }; const pc = (v) => Math.round(v * 100000); const mask = o.mask && o.mask !== 'rect' ? o.mask : 'rect';
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name || o.name || 'Picture ' + id)}" descr="${esc(descr ?? o.alt ?? '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:srcRect l="${pc(c.x)}" t="${pc(c.y)}" r="${pc(1 - c.x - c.w)}" b="${pc(1 - c.y - c.h)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(o)}${mask === 'rect' ? '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' : geomXml({ ...o, path: null }, mask)}${o.line && o.line.c ? lnXml(o.line) : ''}${fxXml(o)}</p:spPr></p:pic>`;
    };
    const tableXml = async (R, o, ids, idx) => {
      const id = ids.next(); ids.map.set(o.id, id); const st = o.st || {}; const ts = K.tstyle(o); const hdrC = st.c || 'a1'; const hdrFg = K.lum(deck, hdrC) > 0.62 ? '#111111' : '#ffffff'; const line = '#7f7f7f';
      let grid = o.cw.map((w) => `<a:gridCol w="${e(w)}"/>`).join(''); let rows = '';
      for (let r = 0; r < o.cells.length; r++) { let tcs = ''; for (let c = 0; c < o.cells[r].length; c++) { const cell = o.cells[r][c]; const hdr = st.hdr && r === 0, band = st.band && !hdr && (r - (st.hdr ? 1 : 0)) % 2 === 1; const cts = Object.assign({}, ts, cell.ts || {}); if (hdr) { cts.b = true; if (!cell.ts || !cell.ts.c) cts.c = hdrFg; } if (cell.al) cts.al = cell.al;
          const fillX = cell.fill ? await fillXml(R, cell.fill) : hdr ? solid(deck, hdrC) : band ? solid(deck, hdrC, 0.1) : '<a:noFill/>'; const gr = st.grid || 'h'; const ln = (on, t) => (on ? `<a:${t} w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:${t}>` : `<a:${t} w="0"><a:noFill/></a:${t}>`);
          tcs += `<a:tc${cell.cs > 1 ? ` gridSpan="${cell.cs}"` : ''}${cell.rs > 1 ? ` rowSpan="${cell.rs}"` : ''}${cell.merged ? ' hMerge="1"' : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(R, cell.paras, cts, idx)}</a:txBody><a:tcPr marL="${e(8)}" marR="${e(8)}" marT="${e(6)}" marB="${e(6)}" anchor="${{ t: 't', m: 'ctr', b: 'b' }[cts.va || 'm']}">${ln(gr === 'all', 'lnL')}${ln(gr === 'all', 'lnR')}${ln(gr === 'all', 'lnT')}${ln(gr === 'all' || gr === 'h', 'lnB')}${fillX}</a:tcPr></a:tc>`; }
        rows += `<a:tr h="${e(o.rh[r])}">${tcs}</a:tr>`; }
      return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(o.name || 'Table ' + id)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${e(o.x)}" y="${e(o.y)}"/><a:ext cx="${e(o.w)}" cy="${e(o.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${st.hdr ? ' firstRow="1"' : ''}${st.band ? ' bandRow="1"' : ''}/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    };
    const cxnXml = (R, o, ids, objs) => {
      const id = ids.next(); K.connPath(o, objs); const a = o.a, b = o.b; const fh = a.x > b.x, fv = a.y > b.y; const prst = o.route === 'elbow' ? 'bentConnector3' : o.route === 'curve' ? 'curvedConnector3' : 'line'; const SITE = [0, 3, 2, 1];
      const st = a.id && ids.map.get(a.id) ? `<a:stCxn id="${ids.map.get(a.id)}" idx="${SITE[a.site || 0]}"/>` : '', en = b.id && ids.map.get(b.id) ? `<a:endCxn id="${ids.map.get(b.id)}" idx="${SITE[b.site || 0]}"/>` : '';
      return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Connector ' + id)}"/><p:cNvCxnSpPr>${st}${en}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${fh ? ' flipH="1"' : ''}${fv ? ' flipV="1"' : ''}><a:off x="${e(o.x)}" y="${e(o.y)}"/><a:ext cx="${e(o.w)}" cy="${e(o.h)}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${lnXml(o.line, true)}${fxXml(o)}</p:spPr></p:cxnSp>`;
    };
    const objXml = async (R, o, ids, idx, objs, kind) => {
      if (o.hid) return '';
      switch (o.type) {
        case 'text': case 'shape': if (o.ph && K.isEmptyText(o) && o.type !== 'image') return ''; return await spXml(R, o, ids, idx, kind);
        case 'image': { if (!o.m || !deck.media[o.m]) return ''; const m = deck.media[o.m]; const baked = o.adj && Object.keys(o.adj).length; return await picXml(R, o, ids, async () => { if (baked) { try { const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = K.mediaURL(deck, o.m); }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); const a = o.adj; const f = []; if (a.br) f.push(`brightness(${1 + a.br})`); if (a.co) f.push(`contrast(${1 + a.co})`); if (a.sa) f.push(`saturate(${1 + a.sa})`); if (a.hu) f.push(`hue-rotate(${a.hu}deg)`); if (a.gr) f.push(`grayscale(${a.gr})`); if (a.se) f.push(`sepia(${a.se})`); if ('filter' in g && f.length) g.filter = f.join(' '); g.drawImage(im, 0, 0); return { bytes: await K.canvasPNG(c), ext: 'png', key: null }; } catch { } } return { bytes: m.data, ext: mext(m), key: 'm' + o.m }; }); }
        case 'chart': { const c = await K.chartCanvas(deck, o, 2); return await picXml(R, { ...o, crop: null }, ids, async () => ({ bytes: await K.canvasPNG(c), ext: 'png', key: null }), o.name || 'Chart', 'ZS-CHART:' + JSON.stringify({ kind: o.kind, data: o.data, opt: o.opt })); }
        case 'table': return await tableXml(R, o, ids, idx);
        case 'conn': return cxnXml(R, o, ids, objs);
        case 'media': return await spXml(R, { ...o, type: 'shape', shape: 'roundRect', fill: { t: 'solid', c: '#222222' }, ts: { c: '#ffffff', al: 'c', va: 'm', sz: 16 }, paras: K.paras((o.kind === 'audio' ? 'Audio: ' : 'Movie: ') + (deck.media[o.m] ? deck.media[o.m].name : '')) }, ids, idx, kind);
        case 'group': { const id = ids.next(); const b = K.bbox(o.kids); let inner = ''; for (const k of o.kids) inner += await objXml(R, k, ids, idx, objs, kind); return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Group ' + id)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${e(b.x)}" y="${e(b.y)}"/><a:ext cx="${e(b.w)}" cy="${e(b.h)}"/><a:chOff x="${e(b.x)}" y="${e(b.y)}"/><a:chExt cx="${e(b.w)}" cy="${e(b.h)}"/></a:xfrm></p:grpSpPr>${inner}</p:grpSp>`; }
      }
      return '';
    };
    const treeHead = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const Rels = () => { const items = []; let n = 0; const m = new Map(); return { items, add(type, target, ext) { const k = type + '|' + target; if (m.has(k)) return m.get(k); const id = 'rId' + ++n; items.push({ id, type, target, ext }); m.set(k, id); return id; }, xml() { const T = { image: 'image', slide: 'slide', hyperlink: 'hyperlink', layout: 'slideLayout', master: 'slideMaster', theme: 'theme', notes: 'notesSlide', notesMaster: 'notesMaster', slideObj: 'slide' }; return XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map((i) => `<Relationship Id="${i.id}" Type="${REL}/${T[i.type] || i.type}" Target="${esc(i.target)}"${i.ext ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`; } }; };

    // ---- background ----
    const bgXml = async (R, f) => `<p:bg><p:bgPr>${await fillXml(R, f || { t: 'solid', c: 'bg' })}<a:effectLst/></p:bgPr></p:bg>`;
    const deckBg = () => deck.theme.bgFill || { t: 'solid', c: 'bg' };

    // ---- layouts ----
    const LTYPE = { title: 'title', titleContent: 'obj', twoContent: 'twoObj', section: 'secHead', photo: 'cust', photoLeft: 'picTx', quote: 'cust', bigFact: 'cust', titleOnly: 'titleOnly', blank: 'blank' };
    const layoutFiles = [];
    for (let li = 0; li < layouts.length; li++) {
      const L = layouts[li]; const R = Rels(); R.add('master', '../slideMasters/slideMaster1.xml'); const ids = mkIds(); let shapes = '';
      for (const o of L.objs) { if (o.ph && ['slideno', 'date', 'footer'].includes(o.ph)) { shapes += await spXml(R, { ...o, paras: o.ph === 'slideno' ? o.paras : [{ runs: [{ t: o.ph === 'footer' ? '' : '' }] }] }, ids, 0, L.kind); continue; } shapes += await objXml(R, o.ph ? { ...o, paras: undefined } : o, ids, 0, L.objs, L.kind); }
      const xml = XML + `<p:sldLayout ${NS} type="${LTYPE[L.kind] || 'cust'}" preserve="1"><p:cSld name="${esc(L.name)}">${L.bg ? await bgXml(R, L.bg) : ''}<p:spTree>${treeHead}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
      layoutFiles.push({ xml, rels: R.xml() });
    }
    // ---- slides ----
    const slideFiles = []; const notesFiles = [];
    const TRMAP = { dissolve: '<p:dissolve/>', fadeColor: '<p:fade thruBlk="1"/>', cube: '<p:fade/>', flip: '<p:fade/>', zoom: '<p:zoom dir="in"/>', magic: '<p:fade/>' };
    const DIRX = { l: 'r', r: 'l', u: 'd', d: 'u' };
    for (let i = 0; i < deck.slides.length; i++) {
      const s = deck.slides[i]; const R = Rels(); const li = Math.max(0, layouts.findIndex((l) => l.id === s.layout)); R.add('layout', `../slideLayouts/slideLayout${li + 1}.xml`); const ids = mkIds(); const kind = (layouts[li] || {}).kind; let shapes = '';
      for (const o of s.objs) shapes += await objXml(R, o, ids, i, s.objs, kind);
      const tr = s.tr || { type: 'none' }; let trXml = ''; const spd = (tr.dur || 0.8) > 1.2 ? 'slow' : (tr.dur || 0.8) < 0.6 ? 'fast' : 'med';
      const advAttr = s.adv ? ` advClick="0" advTm="${Math.round(s.adv * 1000)}"` : '';
      if (tr.type !== 'none') { const d = DIRX[tr.dir || 'l']; const inner = tr.type === 'push' ? `<p:push dir="${d}"/>` : tr.type === 'moveIn' ? `<p:cover dir="${d}"/>` : tr.type === 'reveal' ? `<p:pull dir="${d}"/>` : tr.type === 'wipe' ? `<p:wipe dir="${d}"/>` : TRMAP[tr.type] || '<p:fade/>'; trXml = `<p:transition spd="${spd}"${advAttr}>${inner}</p:transition>`; } else if (advAttr) trXml = `<p:transition${advAttr}/>`;
      if (s.notes) { const NR = Rels(); NR.add('notesMaster', '../notesMasters/notesMaster1.xml'); NR.add('slide', `../slides/slide${i + 1}.xml`); R.add('notes', `../notesSlides/notesSlide${i + 1}.xml`);
        const paras = s.notes.split('\n').map((t) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join('');
        notesFiles.push({ n: i + 1, xml: XML + `<p:notes ${NS}><p:cSld><p:spTree>${treeHead}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`, rels: NR.xml() }); }
      const xml = XML + `<p:sld ${NS}${s.skip ? ' show="0"' : ''}><p:cSld>${s.bg ? await bgXml(R, s.bg) : ''}<p:spTree>${treeHead}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${trXml}</p:sld>`;
      slideFiles.push({ xml, rels: R.xml() });
    }
    // ---- master / theme / presentation ----
    const pal = deck.theme.pal; const hx = (c) => hex6(deck, c); const mixh = (a, b, t) => { const A = K.hexToRgb(K.hex(deck, a)), B = K.hexToRgb(K.hex(deck, b)); return A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
    const themeXml = (name) => XML + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}"><a:dk1><a:srgbClr val="${hx('fg')}"/></a:dk1><a:lt1><a:srgbClr val="${hx('bg')}"/></a:lt1><a:dk2><a:srgbClr val="${hx('mut')}"/></a:dk2><a:lt2><a:srgbClr val="${mixh('bg', 'fg', 0.08)}"/></a:lt2>${[1, 2, 3, 4, 5, 6].map((n) => `<a:accent${n}><a:srgbClr val="${hx('a' + n)}"/></a:accent${n}>`).join('')}<a:hlink><a:srgbClr val="${hx('a1')}"/></a:hlink><a:folHlink><a:srgbClr val="${hx('a5')}"/></a:folHlink></a:clrScheme><a:fontScheme name="${esc(name)}"><a:majorFont><a:latin typeface="${esc(K.fontName(deck, 'head'))}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(K.fontName(deck, 'body'))}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const lvl = (sz, extra = '') => `<a:lvl1pPr marL="0" algn="l"><a:defRPr sz="${sz}" ${extra}><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>`;
    const mR = Rels(); layouts.forEach((l, i) => mR.add('layout', `../slideLayouts/slideLayout${i + 1}.xml`)); mR.add('theme', '../theme/theme1.xml');
    const ids0 = mkIds(); const mph = (n, type, idx, x, y, w, h, sz, bold) => `<p:sp><p:nvSpPr><p:cNvPr id="${ids0.next()}" name="${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${type ? ` type="${type}"` : ''}${idx != null ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(x)}" y="${e(y)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${n}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const master = XML + `<p:sldMaster ${NS}><p:cSld>${await bgXml(mR, deckBg())}<p:spTree>${treeHead}${mph('Title', 'title', null, W * 0.075, H * 0.1, W * 0.85, H * 0.17)}${mph('Text', null, 1, W * 0.075, H * 0.3, W * 0.85, H * 0.58)}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst>${layouts.map((l, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="${Math.round(40 * H / 54)}00" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle>${lvl(2800)}</p:bodyStyle><p:otherStyle>${lvl(1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;
    const nmR = Rels(); nmR.add('theme', '../theme/theme2.xml');
    const notesMaster = XML + `<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${treeHead}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle>${lvl(1200)}</p:notesStyle></p:notesMaster>`;
    const pR = Rels(); pR.add('master', 'slideMasters/slideMaster1.xml'); const slideRids = deck.slides.map((_, i) => pR.add('slide', `slides/slide${i + 1}.xml`)); const nmRid = pR.add('notesMaster', 'notesMasters/notesMaster1.xml'); pR.add('presProps', 'presProps.xml'); pR.add('viewProps', 'viewProps.xml'); pR.add('theme', 'theme/theme1.xml'); pR.add('tableStyles', 'tableStyles.xml');
    const pres = XML + `<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${nmRid}"/></p:notesMasterIdLst><p:sldIdLst>${slideRids.map((r, i) => `<p:sldId id="${256 + i}" r:id="${r}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${e(W)}" cy="${e(H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${lvl(1800)}</p:defaultTextStyle></p:presentation>`;
    put('ppt/presentation.xml', pres); put('ppt/_rels/presentation.xml.rels', pR.xml()); put('ppt/slideMasters/slideMaster1.xml', master); put('ppt/slideMasters/_rels/slideMaster1.xml.rels', mR.xml()); put('ppt/theme/theme1.xml', themeXml(deck.theme.name || 'Theme')); put('ppt/theme/theme2.xml', themeXml('Notes')); put('ppt/notesMasters/notesMaster1.xml', notesMaster); put('ppt/notesMasters/_rels/notesMaster1.xml.rels', nmR.xml());
    put('ppt/presProps.xml', XML + `<p:presentationPr ${NS}/>`); put('ppt/viewProps.xml', XML + `<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr></p:viewPr>`); put('ppt/tableStyles.xml', XML + '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>');
    layoutFiles.forEach((f, i) => { put(`ppt/slideLayouts/slideLayout${i + 1}.xml`, f.xml); put(`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`, f.rels); ct.overrides[`/ppt/slideLayouts/slideLayout${i + 1}.xml`] = 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'; });
    slideFiles.forEach((f, i) => { put(`ppt/slides/slide${i + 1}.xml`, f.xml); put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, f.rels); ct.overrides[`/ppt/slides/slide${i + 1}.xml`] = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'; });
    notesFiles.forEach((f) => { put(`ppt/notesSlides/notesSlide${f.n}.xml`, f.xml); put(`ppt/notesSlides/_rels/notesSlide${f.n}.xml.rels`, f.rels); ct.overrides[`/ppt/notesSlides/notesSlide${f.n}.xml`] = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'; });
    Object.assign(ct.overrides, { '/ppt/presentation.xml': 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', '/ppt/slideMasters/slideMaster1.xml': 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml', '/ppt/theme/theme1.xml': 'application/vnd.openxmlformats-officedocument.theme+xml', '/ppt/theme/theme2.xml': 'application/vnd.openxmlformats-officedocument.theme+xml', '/ppt/notesMasters/notesMaster1.xml': 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml', '/ppt/presProps.xml': 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml', '/ppt/viewProps.xml': 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml', '/ppt/tableStyles.xml': 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml', '/docProps/core.xml': 'application/vnd.openxmlformats-package.core-properties+xml', '/docProps/app.xml': 'application/vnd.openxmlformats-officedocument.extended-properties+xml' });
    put('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Object.entries(ct.defaults).map(([k, v]) => `<Default Extension="${k}" ContentType="${v}"/>`).join('')}${Object.entries(ct.overrides).map(([k, v]) => `<Override PartName="${k}" ContentType="${v}"/>`).join('')}</Types>`);
    put('_rels/.rels', XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    put('docProps/core.xml', XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Presentation</dc:title><dc:creator>Stage</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    put('docProps/app.xml', XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Stage</Application><Slides>${deck.slides.length}</Slides></Properties>`);
    const order = { '[Content_Types].xml': files['[Content_Types].xml'] }; delete files['[Content_Types].xml'];
    return fflate.zipSync({ ...order, ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 6 }]])), ...mediaFiles });
  };

  // =============== IMPORT ===============
  const qa = (n, name) => (n ? n.getElementsByTagNameNS('*', name) : []);
  const q1 = (n, name) => (n ? n.getElementsByTagNameNS('*', name)[0] || null : null);
  const kids = (n, name) => (n ? [...n.children].filter((c) => !name || c.localName === name) : []);
  const kid = (n, name) => kids(n, name)[0] || null;
  const at = (n, a, d) => (n && n.hasAttribute(a) ? n.getAttribute(a) : d);
  const num = (n, a, d = 0) => { const v = at(n, a); return v == null || v === '' ? d : +v; };
  const parseXml = (bytes, name) => { const d = new DOMParser().parseFromString(fflate.strFromU8(bytes), 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('Corrupt XML in ' + name); return d; };
  const rgb2hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
  const hsl2rgb = (h, s, l) => { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; };
  const PRST_CLR = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500' };

  K.pptxImport = async (bytes) => {
    let z; try { z = fflate.unzipSync(bytes); } catch { throw new Error('This file is not a valid .pptx archive.'); }
    const get = (p) => { p = p.replace(/^\//, ''); return z[p] || null; }; const doc = (p) => { const b = get(p); if (!b) return null; return parseXml(b, p); };
    const dir = (p) => p.slice(0, p.lastIndexOf('/') + 1); const norm = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = (dir(base) + t).split('/'); const out = []; for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.') out.push(s); } return out.join('/'); };
    const rels = (p) => { const rp = dir(p) + '_rels/' + p.split('/').pop() + '.rels'; const d = doc(rp); const m = {}; if (d) for (const r of qa(d, 'Relationship')) m[r.getAttribute('Id')] = { type: r.getAttribute('Type').split('/').pop(), target: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : norm(p, r.getAttribute('Target')), ext: r.getAttribute('TargetMode') === 'External' }; return m; };
    const pres = doc('ppt/presentation.xml'); if (!pres) throw new Error('Not a valid .pptx presentation (ppt/presentation.xml is missing).');
    const sz = q1(pres, 'sldSz'); const W = Math.round(num(sz, 'cx', 12192000) / EMU), H = Math.round(num(sz, 'cy', 6858000) / EMU);
    const pr = rels('ppt/presentation.xml'); const slidePaths = qa(pres, 'sldId').length ? [...qa(pres, 'sldId')].map((n) => pr[n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]).filter(Boolean).map((r) => r.target) : [];
    // theme
    const masterPath = Object.values(pr).find((r) => r.type === 'slideMaster').target; const mrels = rels(masterPath); const themePath = Object.values(mrels).find((r) => r.type === 'theme').target; const theme = doc(themePath);
    const sch = {}; const cs = q1(theme, 'clrScheme'); for (const c of kids(cs)) { const v = c.firstElementChild; sch[c.localName] = v ? (v.localName === 'sysClr' ? at(v, 'lastClr', '000000') : at(v, 'val', '000000')) : '000000'; }
    const master = doc(masterPath); const cm = q1(master, 'clrMap'); const mapC = (n) => { const m = { bg1: at(cm, 'bg1', 'lt1'), tx1: at(cm, 'tx1', 'dk1'), bg2: at(cm, 'bg2', 'lt2'), tx2: at(cm, 'tx2', 'dk2') }; return sch[m[n] || n] || sch[n]; };
    const fonts = { major: 'Calibri', minor: 'Calibri' }; const fs = q1(theme, 'fontScheme'); if (fs) { fonts.major = at(q1(kid(fs, 'majorFont'), 'latin'), 'typeface', 'Calibri'); fonts.minor = at(q1(kid(fs, 'minorFont'), 'latin'), 'typeface', 'Calibri'); }
    const hexC = (h) => '#' + h.toLowerCase();
    const bg = hexC(mapC('bg1') || 'FFFFFF'), fg = hexC(mapC('tx1') || '000000');
    const deck = K.newDeck('clean', { w: W, h: H }); deck.slides = []; deck.layouts = []; deck.media = {};
    deck.theme = { id: 'imported', name: at(theme.documentElement, 'name', 'Imported'), dark: K.lum(deck, bg) < 0.4, pal: { bg, fg, mut: hexC(mapC('tx2') || '666666'), a1: hexC(sch.accent1 || '4472C4'), a2: hexC(sch.accent2 || 'ED7D31'), a3: hexC(sch.accent3 || 'A5A5A5'), a4: hexC(sch.accent4 || 'FFC000'), a5: hexC(sch.accent5 || '5B9BD5'), a6: hexC(sch.accent6 || '70AD47') }, head: `"${fonts.major}", "Inter", sans-serif`, body: `"${fonts.minor}", "Inter", sans-serif`, hw: 700, bgFill: null, up: false, al: 'l' };
    const pal = deck.theme.pal;
    // colour parsing
    const parseColor = (n) => { if (!n) return null; const v = n.firstElementChild ? n : null; const cn = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(n.localName) ? n : kids(n).find((k) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(k.localName)); if (!cn) return null; let hx;
      switch (cn.localName) { case 'srgbClr': hx = at(cn, 'val', '000000'); break; case 'sysClr': hx = at(cn, 'lastClr', '000000'); break; case 'prstClr': hx = PRST_CLR[at(cn, 'val')] || '000000'; break; case 'schemeClr': { const v = at(cn, 'val'); hx = v === 'phClr' ? (parseColor.ph || '000000') : mapC(v) || '000000'; break; } default: hx = '000000'; }
      let [r, g, b] = K.hexToRgb('#' + hx); let a = 1;
      for (const m of kids(cn)) { const val = num(m, 'val') / 100000; if (m.localName === 'alpha') a = val; else if (['lumMod', 'lumOff', 'satMod', 'tint', 'shade'].includes(m.localName)) { let [h, s, l] = rgb2hsl(r, g, b); if (m.localName === 'lumMod') l = Math.min(1, l * val); else if (m.localName === 'lumOff') l = Math.min(1, l + val); else if (m.localName === 'satMod') s = Math.min(1, s * val); else if (m.localName === 'tint') l = l + (1 - l) * (1 - val); else l = l * val; [r, g, b] = hsl2rgb(h, s, l); } }
      return { c: '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''), a }; };
    // media
    const mediaCache = new Map(); const getMedia = async (path) => { if (mediaCache.has(path)) return mediaCache.get(path); const b = get(path); if (!b) return null; const name = path.split('/').pop(); const t = K.mimeOf(name); if (!t.startsWith('image/') || /\.(emf|wmf)$/i.test(name)) { mediaCache.set(path, null); return null; } const id = await K.addMedia(deck, b.slice(), name, t); mediaCache.set(path, id); return id; };

    // fills
    const fillOf = async (spPr, R, style) => {
      if (!spPr) return undefined; for (const c of kids(spPr)) {
        if (c.localName === 'noFill') return null; if (c.localName === 'solidFill') { const p = parseColor(c); return p ? { t: 'solid', c: p.c, a: p.a } : null; }
        if (c.localName === 'gradFill') { const stops = [...qa(c, 'gs')].map((g) => { const p = parseColor(g); return [num(g, 'pos') / 100000, p.c, p.a]; }); if (!stops.length) return null; const lin = q1(c, 'lin'); if (q1(c, 'path')) return { t: 'grad', kind: 'radial', ang: 0, stops }; return { t: 'grad', kind: 'linear', ang: ((lin ? num(lin, 'ang') / 60000 : 90) + 90) % 360, stops }; }
        if (c.localName === 'blipFill') { const rid = at(q1(c, 'blip'), 'r:embed') || (q1(c, 'blip') && q1(c, 'blip').getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')); const r = R[rid]; if (!r) return null; const id = await getMedia(r.target); return id ? { t: 'img', m: id, mode: q1(c, 'tile') ? 'tile' : 'fill' } : null; }
        if (c.localName === 'pattFill') { const p = parseColor(kid(c, 'fgClr')); return p ? { t: 'solid', c: p.c, a: p.a } : null; }
      } return undefined;
    };
    const lineOf = (spPr, style) => {
      const ln = kid(spPr, 'ln'); let l;
      if (ln) { if (kid(ln, 'noFill')) return null; const sf = kid(ln, 'solidFill'); const p = sf ? parseColor(sf) : null; l = { c: p ? p.c : null, w: ln.hasAttribute('w') ? num(ln, 'w') / EMU : null, a: p ? p.a : 1 }; const d = at(kid(ln, 'prstDash'), 'val'); if (d && d !== 'solid') l.dash = /sysDot|dot/.test(d) && !/dash/i.test(d) ? 'dot' : /dashDot|lgDashDot/.test(d) ? 'dashdot' : 'dash'; const he = kid(ln, 'headEnd'), te = kid(ln, 'tailEnd'); const mh = (n) => { const t = at(n, 'type', 'none'); return { triangle: 'triangle', arrow: 'arrow', stealth: 'stealth', diamond: 'diamond', oval: 'oval' }[t] || 'none'; }; l.tail = mh(he); l.head = mh(te); }
      const lr = style && kid(style, 'lnRef'); if ((!l || !l.c) && lr && num(lr, 'idx') > 0) { const p = parseColor(lr); if (p && (!l || !kid(ln, 'noFill'))) { l = Object.assign(l || {}, { c: l && l.c ? l.c : p.c, w: l && l.w != null ? l.w : 1.5 }); } }
      if (!l || !l.c) return l && l.c ? l : (l ? null : undefined); if (l.w == null) l.w = 1; return l;
    };
    const shadowOf = (spPr) => { const sh = q1(spPr, 'outerShdw'); if (!sh) return undefined; const p = parseColor(sh); const dist = num(sh, 'dist') / EMU, dir = (num(sh, 'dir') / 60000) * (Math.PI / 180); return { x: Math.round(dist * Math.cos(dir) * 10) / 10, y: Math.round(dist * Math.sin(dir) * 10) / 10, b: num(sh, 'blurRad') / EMU, c: p ? p.c : '#000000', a: p ? p.a : 0.4 }; };

    // text defaults from master styles
    const txStyle = (kind) => { const st = q1(master, 'txStyles'); const n = st && kid(st, kind === 'title' ? 'titleStyle' : kind === 'body' ? 'bodyStyle' : 'otherStyle'); return n; };
    const lvlDef = (styleNode, lv) => { const p = styleNode && kid(styleNode, 'lvl' + (lv + 1) + 'pPr'); if (!p) return {}; const d = kid(p, 'defRPr'); const o = {}; if (d) { if (d.hasAttribute('sz')) o.sz = num(d, 'sz') / 100; if (d.hasAttribute('b')) o.b = at(d, 'b') === '1'; if (d.hasAttribute('i')) o.i = at(d, 'i') === '1'; const sf = kid(d, 'solidFill'); if (sf) { const c = parseColor(sf); if (c) o.c = c.c; } const lt = kid(d, 'latin'); if (lt) o.f = at(lt, 'typeface'); } if (p.hasAttribute('algn')) o.al = { l: 'l', ctr: 'c', r: 'r', just: 'j' }[at(p, 'algn')]; const bu = kids(p).find((k) => /^bu(Char|AutoNum|None)$/.test(k.localName)); if (bu) o.bu = bu; return o; };
    const phLookup = (root, ph) => { if (!root || !ph) return null; const t = at(ph, 'type'), i = at(ph, 'idx'); for (const sp of qa(root, 'sp')) { const p = q1(q1(sp, 'nvPr'), 'ph'); if (!p) continue; if ((i != null && at(p, 'idx') === i) || (i == null && at(p, 'type') === t) || (t && at(p, 'type') === t && i == null)) return sp; } if (t) for (const sp of qa(root, 'sp')) { const p = q1(q1(sp, 'nvPr'), 'ph'); if (p && at(p, 'type') === t) return sp; } return null; };
    const fontOf = (tf) => { if (!tf) return undefined; if (tf === '+mj-lt') return 'head'; if (tf === '+mn-lt') return 'body'; if (tf.startsWith('+')) return 'body'; return tf; };

      const fs0 = (n) => (n ? n.textContent : '');
    const convChart = (cdoc, common) => {
      const plot = q1(cdoc, 'plotArea'); if (!plot) return null; const types = [['barChart', 'column'], ['bar3DChart', 'column'], ['lineChart', 'line'], ['line3DChart', 'line'], ['areaChart', 'area'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['doughnutChart', 'donut'], ['scatterChart', 'scatter']]; const found = types.find(([t]) => q1(plot, t)); if (!found) return null; const node = q1(plot, found[0]); let kind = found[1]; if (kind === 'column' && at(kid(node, 'barDir'), 'val') === 'bar') kind = 'bar';
      const sers = kids(node, 'ser'); const vals = (n) => [...qa(n, 'v')].map((v) => v.textContent); const cats = sers[0] ? vals(kid(sers[0], 'cat') || kid(sers[0], 'xVal') || sers[0]).slice(0, 200) : []; const series = sers.map((s, i) => { const tx = kid(s, 'tx'); const nm = tx ? vals(tx)[0] : 'Series ' + (i + 1); const v = kid(s, 'val') || kid(s, 'yVal'); return { name: nm || 'Series ' + (i + 1), vals: v ? vals(v).map((x) => +x || 0) : [] }; });
      const nCat = Math.max(cats.length, ...series.map((s) => s.vals.length)); const cc = cats.length ? cats : Array.from({ length: nCat }, (_, i) => String(i + 1)); series.forEach((s) => { while (s.vals.length < cc.length) s.vals.push(0); }); const gr = at(kid(node, 'grouping'), 'val');
      const title = q1(q1(cdoc, 'title'), 't') ? [...qa(q1(cdoc, 'title'), 't')].map((t) => t.textContent).join('') : '';
      return K.newObj('chart', { ...common, kind, data: { cats: cc, series: series.length ? series : [{ name: 'Series 1', vals: [] }] }, opt: { legend: !!q1(cdoc, 'legend'), grid: !!q1(plot, 'majorGridlines'), labels: !!q1(node, 'dLbls') && at(q1(q1(node, 'dLbls'), 'showVal'), 'val') === '1', stacked: gr === 'stacked' || gr === 'percentStacked', title } });
    }

    const layoutCache = new Map(); const slides = [];
    for (let si = 0; si < slidePaths.length; si++) {
      const sp = slidePaths[si]; const sdoc = doc(sp); const R = rels(sp); const layPath = Object.values(R).find((r) => r.type === 'slideLayout'); const lpath = layPath && layPath.target; const ldoc = lpath ? doc(lpath) : null; const LR = lpath ? rels(lpath) : {};
      const slide = { id: K.uid(), layout: 'blank', objs: [], notes: '', tr: { type: 'none' }, builds: [] }; const idMap = new Map(); const cxnFix = [];
      const showMaster = !ldoc || at(ldoc.documentElement, 'showMasterSp', '1') !== '0';
      // layout (decor objects) — built once per source layout
      if (lpath && !layoutCache.has(lpath)) {
        const lay = { id: 'L' + (layoutCache.size + 1), kind: 'custom', name: at(q1(ldoc, 'cSld'), 'name', 'Layout ' + (layoutCache.size + 1)), bg: null, objs: [] }; deck.layouts.push(lay); layoutCache.set(lpath, lay);
        const decor = async (root, RR, base) => { const tree = q1(root, 'spTree'); for (const c of kids(tree)) { if (c.localName === 'sp' && q1(q1(c, 'nvPr'), 'ph')) continue; const os = await convNode(c, RR, null, base, { ctxObjs: lay.objs, decor: true }); os.forEach((o) => { o.lock = true; lay.objs.push(o); }); } };
        if (showMaster) await decor(master, mrels, masterPath); await decor(ldoc, LR, lpath);
      }
      if (lpath) slide.layout = layoutCache.get(lpath).id; else { if (!deck.layouts.some((l) => l.id === 'blank')) deck.layouts.push({ id: 'blank', kind: 'blank', name: 'Blank', bg: null, objs: [] }); }
      // background: slide -> layout -> master
      const bgOf = async (root, RR) => { const b = q1(root, 'bg'); if (!b) return undefined; const pr = kid(b, 'bgPr'); if (pr) return await fillOf(pr, RR); const br = kid(b, 'bgRef'); if (br) { const p = parseColor(br); return p ? { t: 'solid', c: p.c } : undefined; } return undefined; };
      let bgf = await bgOf(sdoc, R); if (bgf === undefined && ldoc) bgf = await bgOf(ldoc, LR); if (bgf === undefined) bgf = await bgOf(master, mrels); slide.bg = bgf || { t: 'solid', c: bg };
      // text conversion helper needs layout placeholders for inheritance
      async function convNode(c, RR, parentXf, basePath, opt = {}) {
        const out = []; const ln = c.localName;
        const xfOf = (spPr) => { const xf = kid(spPr, 'xfrm'); if (!xf) return null; const off = kid(xf, 'off'), ext = kid(xf, 'ext'); if (!off || !ext) return null; return { x: num(off, 'x') / EMU, y: num(off, 'y') / EMU, w: num(ext, 'cx') / EMU, h: num(ext, 'cy') / EMU, rot: num(xf, 'rot') / 60000, fh: at(xf, 'flipH') === '1', fv: at(xf, 'flipV') === '1' }; };
        const tf = (g) => { if (!g || !parentXf) return g; return { ...g, x: parentXf.ox + (g.x - parentXf.cx) * parentXf.sx, y: parentXf.oy + (g.y - parentXf.cy) * parentXf.sy, w: g.w * parentXf.sx, h: g.h * parentXf.sy }; };
        if (ln === 'AlternateContent') { const ch = kid(c, 'Choice') || kid(c, 'Fallback'); for (const k of kids(ch)) out.push(...(await convNode(k, RR, parentXf, basePath, opt))); return out; }
        if (ln === 'grpSp') { const gp = kid(c, 'grpSpPr'); const xf = kid(gp, 'xfrm'); let px = null; if (xf) { const off = kid(xf, 'off'), ext = kid(xf, 'ext'), co = kid(xf, 'chOff'), ce = kid(xf, 'chExt'); const g = { x: num(off, 'x') / EMU, y: num(off, 'y') / EMU, w: num(ext, 'cx') / EMU, h: num(ext, 'cy') / EMU }; const cg = { x: num(co, 'x') / EMU, y: num(co, 'y') / EMU, w: num(ce, 'cx') / EMU || 1, h: num(ce, 'cy') / EMU || 1 }; const tg = tf(g); px = { ox: tg.x, oy: tg.y, cx: cg.x, cy: cg.y, sx: (tg.w / cg.w) || 1, sy: (tg.h / cg.h) || 1 }; }
          const gk = []; for (const k of kids(c)) { if (['nvGrpSpPr', 'grpSpPr'].includes(k.localName)) continue; gk.push(...(await convNode(k, RR, px || parentXf, basePath, opt))); } if (!gk.length) return out; const g = K.newObj('group', { kids: gk, name: at(q1(c, 'cNvPr'), 'name', 'Group') }); K.regroup(g); out.push(g); return out; }
        if (ln === 'sp' || ln === 'pic' || ln === 'cxnSp' || ln === 'graphicFrame') {
          const nv = q1(c, 'cNvPr'); const nid = at(nv, 'id'); const spPr = kid(c, 'spPr'); const style = kid(c, 'style'); const ph = q1(q1(c, 'nvPr'), 'ph');
          let g = xfOf(spPr); if (ln === 'graphicFrame') { const xf = kid(c, 'xfrm'); if (xf) { const off = kid(xf, 'off'), ext = kid(xf, 'ext'); g = { x: num(off, 'x') / EMU, y: num(off, 'y') / EMU, w: num(ext, 'cx') / EMU, h: num(ext, 'cy') / EMU, rot: 0, fh: false, fv: false }; } }
          let lph = null, mph = null; if (ph && !opt.decor) { lph = ldoc ? phLookup(ldoc, ph) : null; mph = phLookup(master, ph); if (!g) { g = (lph && xfOf(kid(lph, 'spPr'))) || (mph && xfOf(kid(mph, 'spPr'))); } }
          if (!g) return out; g = tf(g);
          const common = { name: at(nv, 'name', ''), x: g.x, y: g.y, w: Math.max(0.5, g.w), h: Math.max(0.5, g.h), rot: ((g.rot % 360) + 360) % 360 }; if (g.fh) common.fh = true; if (g.fv) common.fv = true; if (at(nv, 'hidden') === '1') common.hid = true; const descr = at(nv, 'descr'); if (descr) common.alt = descr;
          const hl = kid(nv, 'hlinkClick'); if (hl) { const rid = hl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rr = RR[rid]; if (rr) common.link = rr.type === 'slide' ? '#' + (slidePaths.indexOf(rr.target) + 1) : rr.target; }
          if (ln === 'cxnSp') { const prst = at(q1(spPr, 'prstGeom'), 'prst', 'line'); const a = { x: g.x + (g.fh ? g.w : 0), y: g.y + (g.fv ? g.h : 0) }, b = { x: g.x + (g.fh ? 0 : g.w), y: g.y + (g.fv ? 0 : g.h) }; const l = lineOf(spPr, style) || { c: '#000000', w: 1 }; if (!l.c) l.c = '#000000'; const o = K.newObj('conn', { ...common, a, b, route: /bent/.test(prst) ? 'elbow' : /curved/.test(prst) ? 'curve' : 'straight', line: l }); delete o.fh; delete o.fv; const sc = q1(c, 'stCxn'), ec = q1(c, 'endCxn'); if (sc || ec) cxnFix.push({ o, st: sc && [at(sc, 'id'), num(sc, 'idx')], en: ec && [at(ec, 'id'), num(ec, 'idx')] }); idMap.set(nid, o); out.push(o); return out; }
          if (ln === 'pic') {
            const blip = q1(c, 'blip'); const rid = blip && blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'); const rr = RR[rid]; if (descr && descr.startsWith('ZS-CHART:')) { try { const j = JSON.parse(descr.slice(9)); const o = K.newObj('chart', { ...common, kind: j.kind, data: j.data, opt: j.opt || {} }); o.alt = undefined; idMap.set(nid, o); out.push(o); return out; } catch { } }
            const mid = rr ? await getMedia(rr.target) : null; if (!mid) return out; const sr = q1(c, 'srcRect'); const pc = (a) => num(sr, a) / 100000; const crop = sr ? { x: pc('l'), y: pc('t'), w: Math.max(0.01, 1 - pc('l') - pc('r')), h: Math.max(0.01, 1 - pc('t') - pc('b')) } : { x: 0, y: 0, w: 1, h: 1 }; const prst = at(q1(spPr, 'prstGeom'), 'prst', 'rect'); const o = K.newObj('image', { ...common, m: mid, crop, mask: K.shapes[prst] && prst !== 'rect' ? prst : 'rect' }); const l = lineOf(spPr, null); if (l && l.c) o.line = l; const sh = shadowOf(spPr); if (sh) o.sh = sh; idMap.set(nid, o); out.push(o); return out;
          }
          if (ln === 'graphicFrame') {
            const tbl = q1(c, 'tbl'); if (tbl) {
              const cw = [...qa(tbl, 'gridCol')].map((n) => num(n, 'w') / EMU); const trs = [...qa(tbl, 'tr')]; const rh = trs.map((n) => num(n, 'h') / EMU); const tp = q1(tbl, 'tblPr');
              const o = K.newObj('table', { ...common, rows: trs.length, cols: cw.length, w: cw.reduce((a, b) => a + b, 0), h: rh.reduce((a, b) => a + b, 0) }); o.cw = cw; o.rh = rh; o.st = { hdr: at(tp, 'firstRow') === '1', band: at(tp, 'bandRow') === '1', c: 'a1', grid: 'h' }; o.cells = []; let fs0 = 0;
              for (const tr of trs) { const row = []; for (const tc of kids(tr, 'tc')) { const cell = {}; const tx = kid(tc, 'txBody'); const base = { sz: 18, c: pal.fg, f: 'body' }; const paras = await convText(tx, { ph: null, base }, RR); cell.paras = paras.paras; if (!fs0 && paras.base.sz) { fs0 = paras.base.sz; o.ts = { ...o.ts, sz: paras.base.sz }; } const tp2 = kid(tc, 'tcPr'); if (tp2) { const f = await fillOf(tp2, RR); if (f) cell.fill = f; else if (f === null) cell.fill = { t: 'none' }; const an = at(tp2, 'anchor'); if (an) cell.ts = { va: { t: 't', ctr: 'm', b: 'b' }[an] }; } if (at(tc, 'gridSpan')) cell.cs = num(tc, 'gridSpan'); if (at(tc, 'rowSpan')) cell.rs = num(tc, 'rowSpan'); if (at(tc, 'hMerge') === '1' || at(tc, 'vMerge') === '1') cell.merged = true; row.push(cell); } o.cells.push(row); }
              if (o.cells.some((r) => r.some((x) => x.fill))) o.st.hdr = o.st.hdr; idMap.set(nid, o); out.push(o); return out;
            }
            const ch = q1(c, 'chart'); if (ch) { const rid = ch.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rr = RR[rid]; const cdoc = rr && doc(rr.target); const o = cdoc && convChart(cdoc, common); if (o) { idMap.set(nid, o); out.push(o); } return out; }
            return out;
          }
          // sp
          const prst = at(q1(spPr, 'prstGeom'), 'prst'); const cust = q1(spPr, 'custGeom'); let shape = prst && K.shapes[prst] ? prst : (prst === 'line' || prst === 'straightConnector1' ? null : 'rect'); const txBody = kid(c, 'txBody');
          const o = K.newObj(txBody && !prst && !cust && !ph ? 'text' : 'shape', { ...common }); o.type = (!prst && !cust) || (prst === 'rect' && !kid(spPr, 'solidFill') && !kid(spPr, 'gradFill') && !kid(spPr, 'blipFill') && !(kid(spPr, 'ln') && !kid(kid(spPr, 'ln'), 'noFill') && kid(kid(spPr, 'ln'), 'solidFill')) && txBody && at(kid(c, 'nvSpPr') && q1(c, 'cNvSpPr'), 'txBox') === '1') ? 'text' : 'shape'; if (o.type === 'shape') o.shape = shape || 'rect';
          if (prst === 'line' || prst === 'straightConnector1') { const a = { x: g.x + (g.fh ? g.w : 0), y: g.y + (g.fv ? g.h : 0) }, b = { x: g.x + (g.fh ? 0 : g.w), y: g.y + (g.fv ? 0 : g.h) }; const l = lineOf(spPr, style) || { c: '#000000', w: 1 }; const co = K.newObj('conn', { ...common, a, b, route: 'straight', line: l }); delete co.fh; delete co.fv; out.push(co); idMap.set(nid, co); return out; }
          const fm = [...qa(q1(spPr, 'prstGeom'), 'gd')].map((gd) => +((at(gd, 'fmla', '') || '').replace('val ', '')) / 100000); if ((prst === 'roundRect' || prst === 'triangle') && fm.length) o.adj = [fm[0]];
          if (cust) { const pl = q1(cust, 'pathLst'); let d = ''; for (const p of kids(pl, 'path')) { const pw = num(p, 'w') || g.w * EMU, phh = num(p, 'h') || g.h * EMU; const sx = g.w / (pw / 1), sy = g.h / (phh / 1); const P = (n) => `${(num(n, 'x') * sx / EMU * EMU / 1).toFixed(2)} ${(num(n, 'y') * sy).toFixed(2)}`; const P2 = (n) => `${((num(n, 'x') / pw) * g.w).toFixed(2)} ${((num(n, 'y') / phh) * g.h).toFixed(2)}`; for (const s of kids(p)) { const pts = qa(s, 'pt'); if (s.localName === 'moveTo') d += 'M' + P2(pts[0]); else if (s.localName === 'lnTo') d += 'L' + P2(pts[0]); else if (s.localName === 'cubicBezTo') d += 'C' + [...pts].map(P2).join(' '); else if (s.localName === 'quadBezTo') d += 'Q' + [...pts].map(P2).join(' '); else if (s.localName === 'arcTo') { /* approximated: skip */ } else if (s.localName === 'close') d += 'Z'; } } if (d) { o.type = 'shape'; o.shape = 'rect'; o.path = d; } }
          let fill = await fillOf(spPr, RR); const fr = style && kid(style, 'fillRef'); if (fill === undefined && fr && num(fr, 'idx') > 0) { const p = parseColor(fr); fill = p ? { t: 'solid', c: p.c } : null; } if (fill === undefined) fill = null; o.fill = fill;
          const lnv = lineOf(spPr, style); o.line = lnv === undefined ? null : lnv; const sh = shadowOf(spPr); if (sh) o.sh = sh;
          // text
          const base = { sz: 18, c: ph ? pal.fg : pal.fg, f: 'body' }; let defNode = null; let kind = 'other';
          if (ph) { const t = at(ph, 'type', 'body'); kind = /title|ctrTitle/.test(t) ? 'title' : 'body'; }
          const pr = await convText(txBody, { ph, lph, mph, kind, spStyle: style }, RR); const ts = { ...pr.base };
          if (txBody) { const bp = kid(txBody, 'bodyPr'); const ins = (a, d) => (bp && bp.hasAttribute(a) ? num(bp, a) / EMU : d); ts.pad = Math.round(((ins('lIns', 7.2) + ins('tIns', 3.6)) / 2) * 10) / 10; const anc = at(bp, 'anchor') || (lph && at(kid(lph, 'txBody') && kid(kid(lph, 'txBody'), 'bodyPr'), 'anchor')) || (mph && at(kid(mph, 'txBody') && kid(kid(mph, 'txBody'), 'bodyPr'), 'anchor')); ts.va = { t: 't', ctr: 'm', b: 'b' }[anc || 't'] || 't'; if (at(bp, 'numCol') && num(bp, 'numCol') > 1) { ts.cols = num(bp, 'numCol'); ts.gap = num(bp, 'spcCol') / EMU; } const na = kid(bp, 'normAutofit'); if (na) { ts.fit = 'shrink'; const fsx = num(na, 'fontScale', 100000) / 100000; if (fsx < 1) { ts.sz = Math.round(ts.sz * fsx * 10) / 10; pr.paras.forEach((p) => p.runs.forEach((r) => { if (r.sz) r.sz = Math.round(r.sz * fsx * 10) / 10; })); } } if (kid(bp, 'spAutoFit') && o.type === 'text') o.ah = true; }
          o.ts = ts; o.paras = pr.paras; if (o.type === 'shape' && !txBody) o.paras = [{ runs: [{ t: '' }] }];
          if (ph && K.isEmptyText(o) && !opt.decor) return out; if (opt.decor && K.isEmptyText(o) && o.type === 'text') return out;
          idMap.set(nid, o); out.push(o); return out;
        }
        return out;
      }
      // text conversion
      async function convText(tx, ctxT, RR) {
        const { ph, lph, mph, kind = 'other', spStyle } = ctxT; const lsty = (n) => n && kid(n, 'lstStyle'); const levelDefs = (lv) => { const kindStyle = txStyle(kind === 'title' ? 'title' : ph ? 'body' : 'other'); const d0 = lvlDef(kindStyle, lv), d1 = mph ? lvlDef(lsty(kid(mph, 'txBody')), lv) : {}, d2 = lph ? lvlDef(lsty(kid(lph, 'txBody')), lv) : {}, d3 = lvlDef(lsty(tx), lv); return { ...d0, ...d1, ...d2, ...d3 }; };
        const baseD = levelDefs(0); const base = { f: baseD.f ? fontOf(baseD.f) : kind === 'title' ? 'head' : 'body', sz: baseD.sz || (kind === 'title' ? 44 : 18), c: baseD.c || (spStyle && parseColor(kid(spStyle, 'fontRef')) ? parseColor(kid(spStyle, 'fontRef')).c : pal.fg), al: baseD.al || (kind === 'title' ? 'l' : 'l'), b: !!baseD.b, i: !!baseD.i };
        const paras = []; if (!tx) return { paras: [{ runs: [{ t: '' }] }], base };
        for (const p of kids(tx, 'p')) {
          const pPr = kid(p, 'pPr'); const lv = pPr ? num(pPr, 'lvl') : 0; const D = levelDefs(lv); const para = { runs: [] };
          if (lv) para.lv = lv; const al = at(pPr, 'algn'); if (al) para.al = { l: 'l', ctr: 'c', r: 'r', just: 'j' }[al] || 'l';
          const sp = kid(kid(pPr, 'lnSpc'), 'spcPct'); if (sp) para.ls = num(sp, 'val') / 100000; const sb = kid(kid(pPr, 'spcBef'), 'spcPts'), sa = kid(kid(pPr, 'spcAft'), 'spcPts'); if (sb) para.sb = num(sb, 'val') / 100; if (sa) para.sa = num(sa, 'val') / 100;
          const bu = (pPr && kids(pPr).find((k) => /^bu(Char|AutoNum|None)$/.test(k.localName))) || D.bu;
          if (bu) { if (bu.localName === 'buNone') para.list = 'none'; else if (bu.localName === 'buChar') para.list = at(bu, 'char') === '–' || at(bu, 'char') === '-' ? 'd' : at(bu, 'char') === 'ü' ? 'c' : 'b'; else { const t = at(bu, 'type', 'arabicPeriod'); para.list = /alpha/i.test(t) ? 'a' : /roman/i.test(t) ? 'r' : 'n'; } } else para.list = 'none';
          if (!bu && ph && kind === 'body') para.list = D.bu ? undefined : 'none';
          for (const n of kids(p)) {
            if (!['r', 'fld', 'br'].includes(n.localName)) continue; const rPr = kid(n, 'rPr'); const run = { t: '' };
            if (n.localName === 'br') run.t = '\n'; else if (n.localName === 'fld') { const ty = at(n, 'type', ''); if (/slidenum/.test(ty)) run.field = 'slideno'; else if (/datetime/.test(ty)) run.field = 'date'; else run.t = fs0(kid(n, 't')); } else run.t = fs0(kid(n, 't'));
            if (rPr) { const sz = rPr.hasAttribute('sz') ? num(rPr, 'sz') / 100 : null; if (sz && sz !== (D.sz || base.sz)) run.sz = sz; else if (sz) run.sz = sz; if (rPr.hasAttribute('b')) run.b = at(rPr, 'b') === '1'; if (rPr.hasAttribute('i')) run.i = at(rPr, 'i') === '1'; const u = at(rPr, 'u'); if (u) run.u = u !== 'none'; const stk = at(rPr, 'strike'); if (stk) run.s = stk !== 'noStrike'; const bl = num(rPr, 'baseline'); if (bl > 0) run.sup = true; else if (bl < 0) run.sub = true; const sf = kid(rPr, 'solidFill'); if (sf) { const c = parseColor(sf); if (c) run.c = c.c; } const hlt = kid(rPr, 'highlight'); if (hlt) { const c = parseColor(hlt); if (c) run.hl = c.c; } const lt = kid(rPr, 'latin'); if (lt) run.f = fontOf(at(lt, 'typeface')); const hc = kid(rPr, 'hlinkClick'); if (hc) { const rid = hc.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rr = RR[rid]; if (rr) run.l = rr.type === 'slide' ? '#' + (slidePaths.indexOf(rr.target) + 1) : rr.target; } }
            // inherit level defaults when run has no explicit values
            if (run.sz == null && D.sz && D.sz !== base.sz) run.sz = D.sz; if (run.b === undefined && D.b != null && D.b !== base.b) run.b = D.b; if (run.c === undefined && D.c && D.c !== base.c) run.c = D.c;
            if (run.t || run.field) para.runs.push(run);
          }
          if (!para.runs.length) para.runs.push({ t: '' }); paras.push(para);
        }
        // pick base from first non-empty run to minimise per-run overrides
        const first = paras.flatMap((p) => p.runs).find((r) => r.t || r.field); if (first) { if (first.sz) base.sz = first.sz; if (first.c) base.c = first.c; if (first.b != null) base.b = first.b; if (first.i != null) base.i = first.i; if (first.f) base.f = first.f; }
        paras.forEach((p) => p.runs.forEach((r) => { if (r.sz === base.sz) delete r.sz; if (r.c === base.c) delete r.c; if (r.b === base.b) delete r.b; if (r.i === base.i) delete r.i; if (r.f === base.f) delete r.f; }));
        if (paras.length && paras.every((p) => p.al === paras[0].al) && paras[0].al) { base.al = paras[0].al; paras.forEach((p) => delete p.al); } else if (paras[0] && paras[0].al === undefined) { }
        return { paras, base };
      }
      const tree = q1(sdoc, 'spTree'); for (const c of kids(tree)) { if (['nvGrpSpPr', 'grpSpPr'].includes(c.localName)) continue; const os = await convNode(c, R, null, sp, {}); slide.objs.push(...os); }
      // connector attachments
      for (const f of cxnFix) { const att = (e2, end) => { if (!e2) return; const t = idMap.get(e2[0]); if (t && t.type !== 'conn') { const SITE = [0, 3, 2, 1]; f.o[end] = { x: f.o[end].x, y: f.o[end].y, id: t.id, site: SITE[e2[1]] ?? 0 }; } }; att(f.st, 'a'); att(f.en, 'b'); }
      // notes
      const nr = Object.values(R).find((r) => r.type === 'notesSlide'); if (nr) { const nd = doc(nr.target); if (nd) { for (const nsp of qa(nd, 'sp')) { const p = q1(q1(nsp, 'nvPr'), 'ph'); if (p && at(p, 'type') === 'body') { slide.notes = [...qa(nsp, 'p')].map((pp) => [...qa(pp, 't')].map((t) => t.textContent).join('')).join('\n').trim(); } } } }
      // transition
      const trn = q1(sdoc, 'transition'); if (trn) { const spd = at(trn, 'spd', 'med'); const dur = spd === 'slow' ? 1.4 : spd === 'fast' ? 0.4 : 0.8; const adv = at(trn, 'advTm'); if (adv) slide.adv = Math.max(0.5, +adv / 1000); const ch = kids(trn).find((k) => k.localName !== 'sndAc') || (kid(trn, 'AlternateContent') && kids(kid(kid(trn, 'AlternateContent'), 'Choice'))[0]); const IV = { l: 'r', r: 'l', u: 'd', d: 'u' }; if (ch) { const d = IV[at(ch, 'dir', 'l')] || 'l'; const n = ch.localName; const map = { fade: at(ch, 'thruBlk') === '1' ? ['fadeColor'] : ['dissolve'], dissolve: ['dissolve'], push: ['push', d], cover: ['moveIn', d], pull: ['reveal', d], wipe: ['wipe', d], zoom: ['zoom'], cube: ['cube', d], flip: ['flip', d], morph: ['magic'], randomBar: ['wipe', d] }; const m = map[n]; if (m) slide.tr = { type: m[0], dur, dir: m[1] || 'l', color: '#000000' }; } }
      if (at(sdoc.documentElement, 'show') === '0') slide.skip = true;
      slides.push(slide);
    }
    if (!deck.layouts.some((l) => l.id === 'blank')) deck.layouts.push({ id: 'blank', kind: 'blank', name: 'Blank', bg: null, objs: [] });
    deck.slides = slides.length ? slides : [K.newSlide(deck, 'blank')]; if (!deck.layouts.length) deck.layouts = K.makeLayouts(deck.theme, W, H);
    deck.opts.showNumbers = false; return deck;
  };
})();
