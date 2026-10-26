/* ZengWrite .docx: hand-written OOXML export + import (paragraphs, runs, styles, lists, tables, images, headers/footers,
   page setup, hyperlinks, footnotes, comments, tracked changes, equations). */
(() => {
  'use strict';
  const P = window.P, S = P.S, flow = P.flow;
  const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main', pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture', m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    w14: 'http://schemas.microsoft.com/office/word/2010/wordml', w15: 'http://schemas.microsoft.com/office/word/2012/wordml', mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  };
  const ROOT_NS = Object.entries(NS).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ') + ' mc:Ignorable="w14 w15"';
  const enc = (s) => new TextEncoder().encode(s), dec = (u) => new TextDecoder().decode(u);
  const xe = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tw = (px) => Math.round(px * 15), hp = (pt) => Math.round(pt * 2), emu = (px) => Math.round(px * 9525);
  const hex6 = (c) => { if (!c) return ''; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m) return m[4] !== undefined && +m[4] === 0 ? '' : [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c); if (!h) return ''; let v = h[1]; if (v.length === 3) v = [...v].map((x) => x + x).join(''); return v.toUpperCase(); };
  const NAMED = { white: 'FFFFFF', black: '000000', red: 'FF0000', yellow: 'FFFF00', green: '008000', blue: '0000FF', orange: 'FFA500', gray: '808080', grey: '808080', transparent: '' };
  const colorHex = (c) => (!c ? '' : NAMED[c.toLowerCase()] !== undefined ? NAMED[c.toLowerCase()] : hex6(c));
  const fontFirst = (f) => (f || '').split(',')[0].replace(/["']/g, '').trim();
  const STYLE_ID = (name) => ({ Body: 'Normal', Title: 'Title', Subtitle: 'Subtitle', 'Heading 1': 'Heading1', 'Heading 2': 'Heading2', 'Heading 3': 'Heading3', 'Heading 4': 'Heading4', Quote: 'Quote', Code: 'Code', Caption: 'Caption', 'TOC 1': 'TOC1', 'TOC 2': 'TOC2', 'TOC 3': 'TOC3', 'TOC Heading': 'TOCHeading', Footnote: 'FootnoteText' }[name] || 'S_' + name.replace(/[^A-Za-z0-9]/g, ''));
  const STYLE_NAME = (name) => ({ Body: 'Normal', 'Heading 1': 'heading 1', 'Heading 2': 'heading 2', 'Heading 3': 'heading 3', 'Heading 4': 'heading 4', 'TOC 1': 'toc 1', 'TOC 2': 'toc 2', 'TOC 3': 'toc 3', Footnote: 'footnote text', Code: 'Code' }[name] || name);

  /* ===================================================================== export ===================================================================== */
  const rasterShape = (el) => new Promise((res) => {
    const w = parseFloat(el.style.width) || 150, h = parseFloat(el.style.height) || 90; const svg = el.querySelector('svg'); if (!svg) return res(null);
    const s = new XMLSerializer().serializeToString(svg); const img = new Image(); const k = 2;
    img.onload = () => { const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(async (b) => res(b ? new Uint8Array(await b.arrayBuffer()) : null), 'image/png'); };
    img.onerror = () => res(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });

  P.exportDocx = async () => {
    P.endHF(); const g = P.geom(); const ctx = { rels: [], rid: 0, media: new Map(), files: {}, bm: 0, docPr: 1, fn: new Map(), fnXml: [], comments: [], cseen: new Map(), links: new Map(), numRuns: [], nums: new Map(), nextNum: 10, track: 0 };
    const addRel = (type, target, ext) => { const id = 'rId' + ++ctx.rid; ctx.rels.push({ id, type, target, ext }); return id; };
    ctx.addRel = addRel;
    const root = document.createElement('div'); root.innerHTML = P.cleanHTML().replace(/​/g, '');
    // images: map media ids to files
    const mediaFile = (id) => { if (ctx.media.has(id)) return ctx.media.get(id); const m = P.media.get(id); if (!m) return null; const ext = P.mediaExt(m.mime); const target = `media/image${ctx.media.size + 1}.${ext}`; ctx.files['word/' + target] = m.bytes; const rid = addRel('image', target); const r = { rid, m }; ctx.media.set(id, r); return r; };
    ctx.mediaFile = mediaFile;
    // shapes -> png
    const shapeMap = new Map(); for (const sh of flow.querySelectorAll('.shp')) { const bytes = await rasterShape(sh); if (bytes) shapeMap.set(sh.dataset.shape + '|' + sh.outerHTML, bytes); }
    ctx.shapeBytes = (el) => shapeMap.get(el.dataset.shape + '|' + el.outerHTML);
    // live shape elements and root clones are separate; rasterise by matching on outerHTML; fall back to svg serialisation
    for (const sh of root.querySelectorAll('.shp')) { if (!ctx.shapeBytes(sh)) { const live = [...flow.querySelectorAll('.shp')].find((x) => x.dataset.shape === sh.dataset.shape); if (live && shapeMap.has(live.dataset.shape + '|' + live.outerHTML)) shapeMap.set(sh.dataset.shape + '|' + sh.outerHTML, shapeMap.get(live.dataset.shape + '|' + live.outerHTML)); } }
    // footnote ids by reference order
    let fnc = 0; for (const ref of root.querySelectorAll('sup.fnr[data-fn]')) if (!ctx.fn.has(ref.dataset.fn)) ctx.fn.set(ref.dataset.fn, ++fnc);
    // comment anchors
    const cmts = S.comments; const cid = new Map(); let cc = 0; for (const c of cmts) { cid.set(c.id, cc++); for (const r of c.replies || []) { void r; cc++; } }
    // re-number: parent gets id, then replies get following ids
    { let n = 0; for (const c of cmts) { c._x = n++; c.replies.forEach((r) => (r._x = n++)); } }
    ctx.cmtTotal = new Map(); for (const sp of root.querySelectorAll('.cmt[data-cid]')) ctx.cmtTotal.set(sp.dataset.cid, (ctx.cmtTotal.get(sp.dataset.cid) || 0) + 1);
    ctx.cmtById = new Map(cmts.map((c) => [c.id, c]));
    ctx.nextId = 100;

    const body = []; let tocOpen = false; let lastListNum = null; let lastRun = null;
    const kids = [...root.children];
    const headIds = new Set(); for (const h of root.querySelectorAll('h1,h2,h3,h4,p[data-st="Title"]')) if (h.id) headIds.add(h.id);
    ctx.headIds = headIds;
    for (let bi = 0; bi < kids.length; bi++) {
      const el = kids[bi]; const t = el.tagName;
      if (el.classList.contains('pgbreak')) { body.push(`<w:p><w:r><w:br w:type="${el.hasAttribute('data-cb') ? 'column' : 'page'}"/></w:r></w:p>`); lastListNum = null; continue; }
      if (t === 'HR') continue; if (t === 'TABLE') { body.push(tableXml(el, ctx)); lastListNum = null; continue; }
      if (el.dataset.fnid) continue;
      if (el.hasAttribute('data-toc')) {
        const first = !(kids[bi - 1] && kids[bi - 1].hasAttribute('data-toc')); const last = !(kids[bi + 1] && kids[bi + 1].hasAttribute('data-toc')); const lvl = el.dataset.toc;
        if (lvl === '0') { body.push(`<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>${xe(el.textContent)}</w:t></w:r></w:p>`); continue; }
        const a = el.querySelector('a'); const pn = el.querySelector('.tocpn'); const anchor = a ? (a.getAttribute('href') || '').slice(1) : '';
        const begin = first ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '';
        const end = last ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
        const txt = `<w:r><w:t xml:space="preserve">${xe(a ? a.textContent : el.textContent)}</w:t></w:r>`; const link = anchor && ctx.headIds.has(anchor) ? `<w:hyperlink w:anchor="${xe(anchor)}" w:history="1">${txt}<w:r><w:tab/></w:r><w:r><w:t>${xe(pn ? pn.textContent : '')}</w:t></w:r></w:hyperlink>` : `${txt}<w:r><w:tab/></w:r><w:r><w:t>${xe(pn ? pn.textContent : '')}</w:t></w:r>`;
        body.push(`<w:p><w:pPr><w:pStyle w:val="TOC${lvl}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tw(g.cw)}"/></w:tabs></w:pPr>${begin}${link}${end}</w:p>`); continue;
      }
      // lists: assign numId
      let numId = null; const kind = el.getAttribute('data-list');
      if (kind) {
        if (kind === 'b') numId = 1; else if (kind === 'c') numId = el.hasAttribute('data-checked') ? 3 : 2;
        else {
          const abs = kind === 'm' ? 3 : 2; const prev = kids[bi - 1]; const adj = prev && prev.hasAttribute && prev.hasAttribute('data-list') && prev.getAttribute('data-list') === kind;
          if (adj && !el.hasAttribute('data-restart') && lastRun && lastRun.abs === abs) numId = lastRun.id;
          else if (el.hasAttribute('data-cont') && lastRun && lastRun.abs === abs) numId = lastRun.id;
          else { numId = ctx.nextNum++; lastRun = { id: numId, abs, over: el.hasAttribute('data-restart') ? { lv: +el.getAttribute('data-lv') || 0, start: +el.getAttribute('data-restart') } : null }; ctx.numRuns.push(lastRun); }
        }
      }
      body.push(paraXml(el, ctx, { numId }));
      void lastListNum;
    }
    void tocOpen;
    // section properties
    const sect = (hdrRefs) => {
      const cols = S.cols > 1 ? `<w:cols w:num="${S.cols}" w:space="${tw(S.colGap)}"/>` : '<w:cols w:space="720"/>';
      return `<w:sectPr>${hdrRefs}<w:pgSz w:w="${tw(g.w)}" w:h="${tw(g.h)}"${S.page.land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${tw(g.mt)}" w:right="${tw(g.mr)}" w:bottom="${tw(g.mb)}" w:left="${tw(g.ml)}" w:header="${tw(g.hd)}" w:footer="${tw(g.fd)}" w:gutter="0"/>${S.pageStart !== 1 ? `<w:pgNumType w:start="${S.pageStart}"/>` : ''}${cols}${S.diffFirst ? '<w:titlePg/>' : ''}</w:sectPr>`;
    };
    // headers / footers
    let hfRefs = ''; const hfParts = [];
    const mkHF = (kind, type, html) => {
      if (!html) return; const holder = document.createElement('div'); holder.innerHTML = html; const ps = [...holder.children].filter((c) => /^(P|H[1-4])$/.test(c.tagName)); if (!ps.length) return;
      const n = hfParts.length + 1; const file = `${kind}${n}.xml`; const xml = ps.map((p) => paraXml(p, ctx, { hf: true, style: kind === 'header' ? 'Header' : 'Footer' })).join('');
      hfParts.push({ file, kind, xml }); const rid = addRel(kind, file); hfRefs += `<w:${kind}Reference w:type="${type}" r:id="${rid}"/>`;
    };
    mkHF('header', 'default', S.hdr.def); if (S.diffFirst) mkHF('header', 'first', S.hdr.first); mkHF('footer', 'default', S.ftr.def); if (S.diffFirst) mkHF('footer', 'first', S.ftr.first);
    // footnotes
    const fnParas = []; for (const [id, num] of ctx.fn) { const p = root.querySelector(`p[data-fnid="${id}"]`); const inner = p ? paraXml(p, ctx, { fn: true, noStyle: true }) : '<w:p/>'; fnParas.push(`<w:footnote w:id="${num}">${inner.replace('<w:p>', '<w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>')}</w:footnote>`); }
    const hasFn = fnParas.length > 0;
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${ROOT_NS}><w:body>${body.join('')}${sect(hfRefs)}</w:body></w:document>`;
    const files = {};
    files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Default Extension="bmp" ContentType="image/bmp"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>${hasFn ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}${S.comments.length ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>' : ''}${hfParts.map((h) => `<Override PartName="/word/${h.file}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${h.kind}+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    files['_rels/.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files['docProps/core.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(P.docTitle())}</dc:title><dc:creator>${xe(S.author)}</dc:creator><cp:lastModifiedBy>${xe(S.author)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    const st = P.stats();
    files['docProps/app.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ZengWrite</Application><Pages>${st.pages}</Pages><Words>${st.words}</Words><Characters>${st.nospace}</Characters><CharactersWithSpaces>${st.chars}</CharactersWithSpaces></Properties>`);
    files['word/document.xml'] = enc(docXml);
    files['word/styles.xml'] = enc(stylesXml(g));
    files['word/numbering.xml'] = enc(numberingXml(ctx));
    files['word/settings.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${ROOT_NS}>${S.track ? '<w:trackRevisions/>' : ''}<w:defaultTabStop w:val="${tw(S.tab)}"/>${hasFn ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ''}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
    if (hasFn) { files['word/footnotes.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes ${ROOT_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${fnParas.join('')}</w:footnotes>`); addRel('footnotes', 'footnotes.xml'); }
    if (S.comments.length) {
      const cx = [], ex = []; let pid = 0x10000000;
      for (const c of S.comments) {
        const mkC = (x, author, date, text, parent, done) => { const paraId = (pid++).toString(16).toUpperCase().padStart(8, '0'); const paras = String(text).split('\n').map((l, i) => `<w:p ${i === String(text).split('\n').length - 1 ? `w14:paraId="${paraId}" ` : ''}><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>${i === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xe(l)}</w:t></w:r></w:p>`).join(''); cx.push(`<w:comment w:id="${x}" w:author="${xe(author)}" w:date="${(date || now).replace(/\.\d+Z$/, 'Z')}" w:initials="${xe((author || 'A').split(/\s+/).map((s) => s[0]).join('').slice(0, 3))}">${paras}</w:comment>`); ex.push(`<w15:commentEx w15:paraId="${paraId}"${parent ? ` w15:paraIdParent="${parent}"` : ''} w15:done="${done ? 1 : 0}"/>`); return paraId; };
        const par = mkC(c._x, c.author, c.date, c.text, null, c.resolved); c.replies.forEach((r) => mkC(r._x, r.author, r.date, r.text, par, c.resolved));
      }
      files['word/comments.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments ${ROOT_NS}>${cx.join('')}</w:comments>`);
      files['word/commentsExtended.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w15:commentsEx ${ROOT_NS}>${ex.join('')}</w15:commentsEx>`);
      addRel('comments', 'comments.xml'); ctx.rels.push({ id: 'rId' + ++ctx.rid, type: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', target: 'commentsExtended.xml', full: true });
    }
    for (const h of hfParts) files['word/' + h.file] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${h.kind === 'header' ? 'hdr' : 'ftr'} ${ROOT_NS}>${h.xml}</w:${h.kind === 'header' ? 'hdr' : 'ftr'}>`);
    const T = (n) => 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + n;
    const relXml = [{ id: 'rIdS', type: 'styles', target: 'styles.xml' }, { id: 'rIdN', type: 'numbering', target: 'numbering.xml' }, { id: 'rIdT', type: 'settings', target: 'settings.xml' }, ...ctx.rels].map((r) => `<Relationship Id="${r.id}" Type="${r.full ? r.type : T(r.type)}" Target="${xe(r.target)}"${r.ext ? ' TargetMode="External"' : ''}/>`).join('');
    files['word/_rels/document.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships>`);
    for (const [k, v] of Object.entries(ctx.files)) files[k] = v;
    return fflate.zipSync(files, { level: 6 });
  };

  /* ---------- run / paragraph builders ---------- */
  const rPrXml = (rp) => {
    let o = ''; if (rp.rStyle) o += `<w:rStyle w:val="${rp.rStyle}"/>`; if (rp.font) o += `<w:rFonts w:ascii="${xe(rp.font)}" w:hAnsi="${xe(rp.font)}" w:cs="${xe(rp.font)}" w:eastAsia="${xe(rp.font)}"/>`;
    if (rp.b) o += '<w:b/><w:bCs/>'; if (rp.i) o += '<w:i/><w:iCs/>'; if (rp.caps) o += '<w:caps/>'; if (rp.smallcaps) o += '<w:smallCaps/>'; if (rp.s) o += '<w:strike/>';
    if (rp.color) o += `<w:color w:val="${rp.color}"/>`; if (rp.spc) o += `<w:spacing w:val="${rp.spc}"/>`; if (rp.sz) o += `<w:sz w:val="${rp.sz}"/><w:szCs w:val="${rp.sz}"/>`;
    if (rp.u) o += '<w:u w:val="single"/>'; if (rp.shd) o += `<w:shd w:val="clear" w:color="auto" w:fill="${rp.shd}"/>`; if (rp.va) o += `<w:vertAlign w:val="${rp.va}"/>`;
    return o ? `<w:rPr>${o}</w:rPr>` : '';
  };
  const rpFromEl = (n, rp) => {
    const r = { ...rp }; const t = n.tagName; const st = n.style || {};
    if (t === 'B' || t === 'STRONG') r.b = 1; if (t === 'I' || t === 'EM') r.i = 1; if (t === 'U') r.u = 1; if (t === 'S' || t === 'STRIKE') r.s = 1; if (t === 'SUP') r.va = 'superscript'; if (t === 'SUB') r.va = 'subscript';
    if (t === 'A' && !r.rStyle) { r.rStyle = 'Hyperlink'; }
    if (st.fontWeight === 'bold' || +st.fontWeight >= 600) r.b = 1; if (st.fontStyle === 'italic') r.i = 1; const td = (st.textDecorationLine || st.textDecoration || ''); if (/underline/.test(td)) r.u = 1; if (/line-through/.test(td)) r.s = 1;
    if (st.verticalAlign === 'super') r.va = 'superscript'; if (st.verticalAlign === 'sub') r.va = 'subscript'; if (st.fontFamily) { const f = fontFirst(st.fontFamily); if (f && f !== 'system-ui') r.font = f; }
    if (st.fontSize && /pt$/.test(st.fontSize)) r.sz = hp(parseFloat(st.fontSize)); else if (st.fontSize && /px$/.test(st.fontSize)) r.sz = hp(P.px2pt(parseFloat(st.fontSize)));
    if (st.color) { const c = colorHex(st.color); if (c) r.color = c; } if (st.backgroundColor) { const c = colorHex(st.backgroundColor); if (c) r.shd = c; }
    if (/small-caps/.test(st.fontVariant || st.fontVariantCaps || '')) r.smallcaps = 1; if (st.textTransform === 'uppercase') r.caps = 1;
    if (st.letterSpacing && /pt|px/.test(st.letterSpacing)) r.spc = Math.round((/pt/.test(st.letterSpacing) ? parseFloat(st.letterSpacing) : P.px2pt(parseFloat(st.letterSpacing))) * 20);
    return r;
  };
  const textRuns = (text, rp, del) => {
    if (!text) return ''; const pr = rPrXml(rp); let out = ''; const tag = del ? 'w:delText' : 'w:t';
    for (const part of text.split(/(\t|\n)/)) { if (part === '\t') out += `<w:r>${pr}<w:tab/></w:r>`; else if (part === '\n') out += `<w:r>${pr}<w:br/></w:r>`; else if (part) out += `<w:r>${pr}<${tag} xml:space="preserve">${xe(part)}</${tag}></w:r>`; }
    return out;
  };
  const fieldRuns = (instr, result, rp) => { const pr = rPrXml(rp); return `<w:r>${pr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${pr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${pr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${pr}<w:t>${xe(result)}</w:t></w:r><w:r>${pr}<w:fldChar w:fldCharType="end"/></w:r>`; };
  const drawing = (ctx, rid, w, h, alt, wrap, name) => {
    const id = ctx.docPr++; const cx = emu(w), cy = emu(h); const gr = `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}"><pic:pic xmlns:pic="${NS.pic}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xe(name)}" descr="${xe(alt || '')}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
    if (wrap === 'left' || wrap === 'right' || wrap === 'break') {
      const hpos = wrap === 'break' ? 'center' : wrap; const wr = wrap === 'break' ? '<wp:wrapTopAndBottom/>' : '<wp:wrapSquare wrapText="bothSides"/>';
      return `<w:r><w:drawing><wp:anchor distT="45720" distB="45720" distL="${wrap === 'right' ? 144000 : 0}" distR="${wrap === 'left' ? 144000 : 0}" simplePos="0" relativeHeight="${251658240 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${hpos}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wr}<wp:docPr id="${id}" name="${xe(name)}" descr="${xe(alt || '')}"/><wp:cNvGraphicFramePr/>${gr}</wp:anchor></w:drawing></w:r>`;
    }
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${xe(name)}" descr="${xe(alt || '')}"/><wp:cNvGraphicFramePr/>${gr}</wp:inline></w:drawing></w:r>`;
  };
  const inl = (node, rp, ctx, o = {}) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += textRuns(n.nodeValue, rp, o.del); continue; } if (n.nodeType !== 1) continue; const t = n.tagName; const cl = n.classList;
      if (cl.contains('pgsp')) continue;
      if (t === 'BR') { out += `<w:r>${rPrXml(rp)}<w:br/></w:r>`; continue; }
      if (t === 'IMG') { const mf = n.dataset.m ? ctx.mediaFile(n.dataset.m) : null; if (mf) { const w = parseFloat(n.style.width) || 200, h = parseFloat(n.style.height) || 150; out += drawing(ctx, mf.rid, w, h, n.getAttribute('alt') || n.getAttribute('data-alt'), n.dataset.wrap, 'Picture ' + n.dataset.m); } continue; }
      if (cl.contains('shp')) { const bytes = ctx.shapeBytes && ctx.shapeBytes(n); if (bytes) { const key = 'shape' + ctx.docPr; const file = `media/${key}.png`; ctx.files['word/' + file] = bytes; const rid = ctx.addRel('image', file); out += drawing(ctx, rid, parseFloat(n.style.width) || 150, parseFloat(n.style.height) || 90, n.getAttribute('data-alt') || n.dataset.shape, n.dataset.wrap, 'Shape ' + ctx.docPr); } continue; }
      if (cl.contains('eq')) { const tex = n.getAttribute('data-tex') || ''; try { const om = P.tex.omml(tex); out += n.hasAttribute('data-disp') ? `<m:oMathPara><m:oMath>${om}</m:oMath></m:oMathPara>` : `<m:oMath>${om}</m:oMath>`; } catch { out += textRuns(P.tex.text(tex), rp); } continue; }
      if (t === 'SUP' && cl.contains('fnr')) { const num = ctx.fn.get(n.dataset.fn); if (num) out += `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${num}"/></w:r>`; continue; }
      if (cl.contains('bm')) { const id = ctx.bm++; out += `<w:bookmarkStart w:id="${id}" w:name="${xe(n.id || 'bm-' + id)}"/><w:bookmarkEnd w:id="${id}"/>`; continue; }
      if (cl.contains('fld')) { const f = n.dataset.f; out += fieldRuns({ page: 'PAGE', pages: 'NUMPAGES', date: 'DATE \\@ "MMMM d, yyyy"', title: 'TITLE' }[f] || 'PAGE', n.dataset.v || '1', rp); continue; }
      if (t === 'INS' && n.hasAttribute('data-tc')) { out += `<w:ins w:id="${ctx.nextId++}" w:author="${xe(n.dataset.a || S.author)}" w:date="${(n.dataset.d || new Date().toISOString()).replace(/\.\d+Z$/, 'Z')}">${inl(n, rp, ctx, o)}</w:ins>`; continue; }
      if (t === 'DEL' && n.hasAttribute('data-tc')) { out += `<w:del w:id="${ctx.nextId++}" w:author="${xe(n.dataset.a || S.author)}" w:date="${(n.dataset.d || new Date().toISOString()).replace(/\.\d+Z$/, 'Z')}">${inl(n, rp, ctx, { ...o, del: true })}</w:del>`; continue; }
      if (cl.contains('cmt') && n.dataset.cid) {
        const c = ctx.cmtById.get(n.dataset.cid); const seen = (ctx.cseen.get(n.dataset.cid) || 0) + 1; ctx.cseen.set(n.dataset.cid, seen); let pre = '', post = '';
        if (c && seen === 1) { pre = `<w:commentRangeStart w:id="${c._x}"/>` + c.replies.map((r) => `<w:commentRangeStart w:id="${r._x}"/>`).join(''); }
        if (c && seen === ctx.cmtTotal.get(n.dataset.cid)) { post = `<w:commentRangeEnd w:id="${c._x}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${c._x}"/></w:r>` + c.replies.map((r) => `<w:commentRangeEnd w:id="${r._x}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${r._x}"/></w:r>`).join(''); }
        out += pre + inl(n, rp, ctx, o) + post; continue;
      }
      if (t === 'A') {
        const href = n.getAttribute('href') || ''; const inner = inl(n, rpFromEl(n, rp), ctx, o);
        if (!href) { out += inner; continue; }
        if (href.startsWith('#')) out += `<w:hyperlink w:anchor="${xe(href.slice(1))}" w:history="1">${inner}</w:hyperlink>`;
        else { let rid = ctx.links.get(href); if (!rid) { rid = ctx.addRel('hyperlink', href, true); ctx.links.set(href, rid); } out += `<w:hyperlink r:id="${rid}" w:history="1">${inner}</w:hyperlink>`; }
        continue;
      }
      out += inl(n, rpFromEl(n, rp), ctx, o);
    }
    return out;
  };
  const paraXml = (el, ctx, o = {}) => {
    const st = el.style; const name = P.styleOfBlock(el); const sid = o.noStyle ? null : o.style || STYLE_ID(name); let pp = '';
    if (sid && sid !== 'Normal') pp += `<w:pStyle w:val="${sid}"/>`; if (el.hasAttribute('data-kwn')) pp += '<w:keepNext/>'; if (el.hasAttribute('data-pbb')) pp += '<w:pageBreakBefore/>';
    const lv = +el.getAttribute('data-lv') || 0; if (o.numId) pp += `<w:numPr><w:ilvl w:val="${Math.min(8, lv)}"/><w:numId w:val="${o.numId}"/></w:numPr>`;
    // borders / shading
    const bd = (side, css) => { const m = /^([\d.]+)px\s+solid\s+(.+)$/.exec(css || ''); return m ? `<w:${side} w:val="single" w:sz="${Math.max(2, Math.round(parseFloat(m[1]) * 6))}" w:space="4" w:color="${colorHex(m[2]) || 'auto'}"/>` : ''; };
    const bdx = bd('top', st.borderTop) + bd('left', st.borderLeft) + bd('bottom', st.borderBottom) + bd('right', st.borderRight); if (bdx) pp += `<w:pBdr>${bdx}</w:pBdr>`;
    const bgc = st.backgroundColor ? colorHex(st.backgroundColor) : ''; if (bgc) pp += `<w:shd w:val="clear" w:color="auto" w:fill="${bgc}"/>`;
    const v = (n) => st.getPropertyValue(n); const sb = v('--sb'), sa = v('--sa'), lh = v('--lh'); let sp = '';
    if (sb) sp += ` w:before="${tw(parseFloat(sb)) * 1}"`; if (sa) sp += ` w:after="${tw(parseFloat(sa))}"`;
    if (lh) { if (/pt$/.test(lh)) sp += ` w:line="${Math.round(parseFloat(lh) * 20)}" w:lineRule="exact"`; else sp += ` w:line="${Math.round(parseFloat(lh) * 240)}" w:lineRule="auto"`; }
    if (sp) pp += `<w:spacing${sp}/>`;
    const il = v('--il'), ir = v('--ir'), fi = v('--fi'); let ind = ''; if (il) ind += ` w:left="${tw(parseFloat(il))}"`; if (ir) ind += ` w:right="${tw(parseFloat(ir))}"`; if (fi) { const f = parseFloat(fi); ind += f >= 0 ? ` w:firstLine="${tw(f)}"` : ` w:hanging="${tw(-f)}"`; }
    if (ind) pp += `<w:ind${ind}/>`;
    const al = st.textAlign; if (al) pp += `<w:jc w:val="${{ left: 'left', center: 'center', right: 'right', justify: 'both' }[al] || 'left'}"/>`;
    // heading bookmark
    let pre = '', post = ''; if (el.id && ctx.headIds && ctx.headIds.has(el.id)) { const id = ctx.bm++; pre = `<w:bookmarkStart w:id="${id}" w:name="${xe(el.id)}"/>`; post = `<w:bookmarkEnd w:id="${id}"/>`; }
    let rp = {}; if (el.hasAttribute('data-list') && el.getAttribute('data-list') === 'c') rp = {};
    return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${pre}${inl(el, rp, ctx)}${post}</w:p>`;
  };
  const BORDER = (side, sz, color) => `<w:${side} w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/>`;
  const tableXml = (t, ctx) => {
    const G = P.tgrid(t); const cg = t.querySelector(':scope > colgroup'); const ws = G.ncols ? Array.from({ length: G.ncols }, (_, i) => (cg && cg.children[i] ? parseFloat(cg.children[i].style.width) || 80 : 80)) : [80];
    const ts = t.dataset.ts || 'grid'; const gc = 'B5B5BA'; const tot = ws.reduce((a, b) => a + b, 0);
    let borders = ''; if (ts === 'grid') borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => BORDER(s, 4, gc)).join(''); else if (ts === 'clean') borders = BORDER('top', 4, 'D1D1D6') + BORDER('bottom', 4, 'D1D1D6') + BORDER('insideH', 4, 'D1D1D6'); else if (ts === 'banded') borders = BORDER('top', 4, 'D1D1D6') + BORDER('bottom', 4, 'D1D1D6') + BORDER('insideH', 4, 'E5E5EA'); else if (ts === 'accent') borders = BORDER('bottom', 8, 'FF9F0A') + BORDER('insideH', 4, 'E5E5EA');
    const jc = t.getAttribute('data-ta'); let out = `<w:tbl><w:tblPr><w:tblW w:w="${tw(tot)}" w:type="dxa"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}${borders ? `<w:tblBorders>${borders}</w:tblBorders>` : ''}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>`;
    G.rows.forEach((tr, ri) => {
      const hdr = [...tr.cells].length && [...tr.cells].every((c) => c.tagName === 'TH'); out += `<w:tr>${hdr ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
      for (let c = 0; c < G.ncols; c++) {
        const cell = G.grid[ri] && G.grid[ri][c]; if (!cell) { out += '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p/></w:tc>'; continue; }
        if (cell._c !== c) continue; // covered by a colspan
        const cs = cell.colSpan || 1, rs = cell.rowSpan || 1; let w = 0; for (let k = 0; k < cs; k++) w += ws[c + k] || 80;
        if (cell._r !== ri) { out += `<w:tc><w:tcPr><w:tcW w:w="${tw(w)}" w:type="dxa"/>${cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`; continue; }
        let pr = `<w:tcW w:w="${tw(w)}" w:type="dxa"/>`; if (cs > 1) pr += `<w:gridSpan w:val="${cs}"/>`; if (rs > 1) pr += '<w:vMerge w:val="restart"/>';
        const cb = (side, css) => { if (!css) return ''; if (/hidden|none/.test(css)) return `<w:${side} w:val="nil"/>`; const m = /^([\d.]+)px\s+solid\s+(.+)$/.exec(css); return m ? BORDER(side, Math.max(2, Math.round(parseFloat(m[1]) * 6)), colorHex(m[2]) || 'auto') : ''; };
        const cst = cell.style; const bx = cb('top', cst.borderTop) + cb('left', cst.borderLeft) + cb('bottom', cst.borderBottom) + cb('right', cst.borderRight); if (bx) pr += `<w:tcBorders>${bx}</w:tcBorders>`;
        let fill = cst.backgroundColor ? colorHex(cst.backgroundColor) : ''; if (!fill) { if (ts === 'banded') fill = cell.tagName === 'TH' ? 'F2F2F7' : (ri % 2 === 0 && ri > 0 ? 'FAFAFC' : ''); else if (ts === 'accent' && cell.tagName === 'TH') fill = 'FF9F0A'; else if (cell.tagName === 'TH' && ts !== 'plain') fill = ts === 'grid' ? 'F2F2F7' : ''; }
        if (fill) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`; if (cst.verticalAlign && cst.verticalAlign !== 'top') pr += `<w:vAlign w:val="${cst.verticalAlign === 'middle' ? 'center' : cst.verticalAlign}"/>`;
        const ps = [...cell.children].filter((x) => /^(P|H[1-4])$/.test(x.tagName)); const th = cell.tagName === 'TH';
        let content = ps.map((p) => { let x = paraXml(p, ctx, { numId: null }); if (th && !/<w:b\/>/.test(x)) x = x.replace(/<w:r>(?!<w:rPr>)/g, '<w:r><w:rPr><w:b/><w:bCs/></w:rPr>').replace(/<w:r><w:rPr>(?![^]*?<w:b\/>)/g, '<w:r><w:rPr><w:b/><w:bCs/>'); return x; }).join(''); if (!content) content = '<w:p/>';
        out += `<w:tc><w:tcPr>${pr}</w:tcPr>${content}</w:tc>`;
      }
      out += '</w:tr>';
    });
    return out + '</w:tbl><w:p><w:pPr><w:spacing w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>';
  };

  /* ---------- styles.xml / numbering.xml ---------- */
  const stylesXml = (g) => {
    const B = S.styles.Body; const bf = B.font || 'Helvetica Neue';
    const pPr = (d, extra = '') => {
      let o = extra; const sp = `<w:spacing w:before="${Math.round((d.sb || 0) * 20)}" w:after="${Math.round((d.sa || 0) * 20)}" w:line="${Math.round((d.lh || 1.2) * 240)}" w:lineRule="auto"/>`; o += sp;
      if (d.il || d.ir || d.fi) o += `<w:ind w:left="${tw(d.il || 0)}" w:right="${tw(d.ir || 0)}"${d.fi ? (d.fi > 0 ? ` w:firstLine="${tw(d.fi)}"` : ` w:hanging="${tw(-d.fi)}"`) : ''}/>`;
      if (d.align && d.align !== 'left') o += `<w:jc w:val="${{ center: 'center', right: 'right', justify: 'both' }[d.align]}"/>`; return o ? `<w:pPr>${o}</w:pPr>` : '';
    };
    const rPr = (d, withFont) => { let o = ''; if (withFont && d.font) o += `<w:rFonts w:ascii="${xe(d.font)}" w:hAnsi="${xe(d.font)}" w:cs="${xe(d.font)}" w:eastAsia="${xe(d.font)}"/>`; if (d.bold) o += '<w:b/><w:bCs/>'; if (d.italic) o += '<w:i/><w:iCs/>'; if (d.caps) o += '<w:caps/>'; if (d.color) o += `<w:color w:val="${hex6(d.color) || '000000'}"/>`; if (d.ls) o += `<w:spacing w:val="${Math.round(d.ls * 20)}"/>`; if (d.size) o += `<w:sz w:val="${hp(d.size)}"/><w:szCs w:val="${hp(d.size)}"/>`; if (d.underline) o += '<w:u w:val="single"/>'; if (d.bg) o += `<w:shd w:val="clear" w:color="auto" w:fill="${hex6(d.bg)}"/>`; return o ? `<w:rPr>${o}</w:rPr>` : ''; };
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${ROOT_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${xe(bf)}" w:hAnsi="${xe(bf)}" w:cs="${xe(bf)}" w:eastAsia="${xe(bf)}"/><w:sz w:val="${hp(B.size)}"/><w:szCs w:val="${hp(B.size)}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${Math.round(B.sa * 20)}" w:line="${Math.round(B.lh * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`;
    x += `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${pPr({ ...B })}${rPr({ color: B.color, size: B.size })}</w:style>`;
    x += '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/></w:style>';
    let hi = 0;
    for (const [name, d0] of Object.entries(S.styles)) {
      if (name === 'Body') continue; const d = P.styleFull(name); const sid = STYLE_ID(name); const out = /^Heading (\d)$/.exec(name);
      const keep = d.keep || out ? '<w:keepNext/>' : ''; const next = d.next ? `<w:next w:val="${STYLE_ID(d.next)}"/>` : ''; const lvl = out ? `<w:outlineLvl w:val="${+out[1] - 1}"/>` : '';
      const bl = d.bl ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${hex6(d.bl) || 'auto'}"/></w:pBdr>` : '';
      const inner = pPr({ ...d }, keep + bl).replace('</w:pPr>', lvl + '</w:pPr>'); void d0; void hi;
      x += `<w:style w:type="paragraph" w:styleId="${sid}"><w:name w:val="${xe(STYLE_NAME(name))}"/><w:basedOn w:val="Normal"/>${next}<w:qFormat/>${inner}${rPr({ font: d.font !== B.font ? d.font : '', bold: d.bold, italic: d.italic, color: d.color, size: d.size, caps: d.caps, ls: d.ls, underline: d.underline, bg: d.bg }, true)}</w:style>`;
    }
    x += `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>`;
    x += `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style><w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>`;
    x += `<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>`;
    x += `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="${tw(g.cw / 2)}"/><w:tab w:val="right" w:pos="${tw(g.cw)}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="${tw(g.cw / 2)}"/><w:tab w:val="right" w:pos="${tw(g.cw)}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr></w:style>`;
    return x + '</w:styles>';
  };
  const numberingXml = (ctx) => {
    const lvls = (fn) => Array.from({ length: 9 }, (_, i) => fn(i)).join('');
    const ind = (i) => `<w:pPr><w:ind w:left="${(i + 1) * 540}" w:hanging="360"/></w:pPr>`;
    const bullet = (i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][i % 3]}"/><w:lvlJc w:val="left"/>${ind(i)}<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl>`;
    const chk = (ch) => (i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${ch}"/><w:lvlJc w:val="left"/>${ind(i)}<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:cs="Segoe UI Symbol" w:hint="default"/></w:rPr></w:lvl>`;
    const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
    const num = (i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmts[i % 3]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/>${ind(i)}</w:lvl>`;
    const multi = (i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="${Array.from({ length: i + 1 }, (_, k) => '%' + (k + 1)).join('.')}${i === 0 ? '.' : ''}"/><w:lvlJc w:val="left"/>${ind(i)}</w:lvl>`;
    const abs = [[0, bullet], [1, chk('☐')], [4, chk('☑')], [2, num], [3, multi]]; // abstract ids
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${ROOT_NS}>` + abs.map(([id, f]) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="${id === 2 || id === 3 ? 'multilevel' : 'hybridMultilevel'}"/>${lvls(f)}</w:abstractNum>`).join('');
    x += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="4"/></w:num>';
    for (const r of ctx.numRuns) x += `<w:num w:numId="${r.id}"><w:abstractNumId w:val="${r.abs}"/><w:lvlOverride w:ilvl="${r.over ? r.over.lv : 0}"><w:startOverride w:val="${r.over ? r.over.start : 1}"/></w:lvlOverride></w:num>`;
    return x + '</w:numbering>';
  };

  /* ===================================================================== import ===================================================================== */
  const xml = (u8) => { const d = new DOMParser().parseFromString(dec(u8).replace(/^﻿/, ''), 'application/xml'); if (d.querySelector('parsererror')) throw new Error('XML parse error'); return d; };
  const W = NS.w;
  const ln = (el) => el.localName;
  const kid = (el, name) => { if (!el) return null; for (const c of el.children) if (c.localName === name) return c; return null; };
  const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
  const wv = (el, a = 'val') => (el ? el.getAttributeNS(W, a) ?? el.getAttribute('w:' + a) : null);
  const on = (el) => { if (!el) return false; const v = wv(el); return !(v === '0' || v === 'false' || v === 'off'); };
  const px = (twips) => Math.round((twips / 15) * 100) / 100;
  const SIZES = [['letter', 12240, 15840], ['a4', 11906, 16838], ['legal', 12240, 20160], ['a5', 8392, 11906]];

  P.importDocx = async (u8) => {
    let z; try { z = fflate.unzipSync(u8); } catch { throw new Error('This file is not a valid .docx (not a zip archive).'); }
    const relsOf = (path) => { const dir = path.replace(/[^/]*$/, ''); const rp = dir + '_rels/' + path.split('/').pop() + '.rels'; const map = {}; if (z[rp]) { for (const r of xml(z[rp]).getElementsByTagName('Relationship')) map[r.getAttribute('Id')] = { type: r.getAttribute('Type').split('/').pop(), target: r.getAttribute('Target'), ext: r.getAttribute('TargetMode') === 'External', dir }; } return map; };
    let main = 'word/document.xml'; if (z['_rels/.rels']) { for (const r of xml(z['_rels/.rels']).getElementsByTagName('Relationship')) if (/officeDocument$/.test(r.getAttribute('Type'))) main = r.getAttribute('Target').replace(/^\//, ''); }
    if (!z[main]) throw new Error('This .docx has no main document part.');
    const doc = xml(z[main]); const rels = relsOf(main); const base = main.replace(/[^/]*$/, '');
    const resolve = (t, dir = base) => { if (t.startsWith('/')) return t.slice(1); const parts = (dir + t).split('/'); const out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); } return out.join('/'); };
    P.resetMedia(); P.resetDocSettings();
    const I = { z, rels, resolve, base, styles: {}, num: {}, abs: {}, nodes: [], fn: {}, fnUsed: [], comments: {}, cex: {}, themeFonts: {}, imgCache: {}, tocSeen: false, headingIds: new Map(), bmNames: new Set() };
    // theme fonts
    const themeRel = Object.values(rels).find((r) => r.type === 'theme'); if (themeRel && z[resolve(themeRel.target)]) { const th = xml(z[resolve(themeRel.target)]); const f = (tag) => { const e = th.getElementsByTagNameNS(NS.a, tag)[0]; const l = e && e.getElementsByTagNameNS(NS.a, 'latin')[0]; return l ? l.getAttribute('typeface') : ''; }; I.themeFonts = { major: f('majorFont'), minor: f('minorFont') }; }
    // styles
    const stylesRel = Object.values(rels).find((r) => r.type === 'styles'); let docDef = { rPr: null, pPr: null };
    if (stylesRel && z[resolve(stylesRel.target)]) {
      const sd = xml(z[resolve(stylesRel.target)]); const dd = sd.getElementsByTagNameNS(W, 'docDefaults')[0]; if (dd) docDef = { rPr: kid(kid(dd, 'rPrDefault'), 'rPr'), pPr: kid(kid(dd, 'pPrDefault'), 'pPr') };
      for (const s of sd.getElementsByTagNameNS(W, 'style')) { const id = wv(s, 'styleId'); I.styles[id] = { id, type: wv(s, 'type'), name: wv(kid(s, 'name')) || id, basedOn: wv(kid(s, 'basedOn')), next: wv(kid(s, 'next')), pPr: kid(s, 'pPr'), rPr: kid(s, 'rPr'), def: wv(s, 'default') === '1' }; }
    }
    // numbering
    const numRel = Object.values(rels).find((r) => r.type === 'numbering'); if (numRel && z[resolve(numRel.target)]) {
      const nd = xml(z[resolve(numRel.target)]);
      for (const a of nd.getElementsByTagNameNS(W, 'abstractNum')) { const lv = {}; for (const l of kids(a, 'lvl')) lv[wv(l, 'ilvl')] = { fmt: wv(kid(l, 'numFmt')), text: wv(kid(l, 'lvlText')), start: +(wv(kid(l, 'start')) || 1), ind: kid(kid(l, 'pPr'), 'ind') }; I.abs[wv(a, 'abstractNumId')] = lv; }
      for (const n of nd.getElementsByTagNameNS(W, 'num')) { const o = {}; for (const lo of kids(n, 'lvlOverride')) { const so = kid(lo, 'startOverride'); if (so) o[wv(lo, 'ilvl')] = +wv(so); } I.num[wv(n, 'numId')] = { abs: wv(kid(n, 'abstractNumId')), over: o }; }
    }
    // settings
    const setRel = Object.values(rels).find((r) => r.type === 'settings'); if (setRel && z[resolve(setRel.target)]) { const sd = xml(z[resolve(setRel.target)]); const dts = sd.getElementsByTagNameNS(W, 'defaultTabStop')[0]; if (dts) S.tab = Math.max(12, px(+wv(dts))); if (sd.getElementsByTagNameNS(W, 'trackRevisions')[0]) S.track = true; }
    // style resolution helpers
    const chain = (id) => { const out = []; let cur = I.styles[id]; let g = 0; while (cur && g++ < 20) { out.unshift(cur); cur = cur.basedOn ? I.styles[cur.basedOn] : null; } return out; };
    const fontOf = (rPr) => { const f = kid(rPr, 'rFonts'); if (!f) return ''; const th = f.getAttributeNS(W, 'asciiTheme') || f.getAttribute('w:asciiTheme'); if (th) return /major/i.test(th) ? I.themeFonts.major : I.themeFonts.minor; return f.getAttributeNS(W, 'ascii') || f.getAttribute('w:ascii') || f.getAttributeNS(W, 'hAnsi') || f.getAttribute('w:hAnsi') || ''; };
    const rprProps = (rPr) => { // -> plain object of char props
      const o = {}; if (!rPr) return o; const f = fontOf(rPr); if (f) o.font = f; const sz = kid(rPr, 'sz'); if (sz) o.size = +wv(sz) / 2; if (kid(rPr, 'b')) o.bold = on(kid(rPr, 'b')) ? 1 : 0; if (kid(rPr, 'i')) o.italic = on(kid(rPr, 'i')) ? 1 : 0;
      const u = kid(rPr, 'u'); if (u) o.underline = wv(u) && wv(u) !== 'none' ? 1 : 0; if (kid(rPr, 'strike')) o.strike = on(kid(rPr, 'strike')) ? 1 : 0; const c = kid(rPr, 'color'); if (c && wv(c) && wv(c) !== 'auto') o.color = '#' + wv(c);
      const shd = kid(rPr, 'shd'); if (shd && wv(shd, 'fill') && wv(shd, 'fill') !== 'auto') o.bg = '#' + wv(shd, 'fill'); const hl = kid(rPr, 'highlight'); if (hl && wv(hl) !== 'none') o.hl = wv(hl);
      const va = kid(rPr, 'vertAlign'); if (va) o.va = wv(va); if (kid(rPr, 'caps')) o.caps = on(kid(rPr, 'caps')) ? 1 : 0; if (kid(rPr, 'smallCaps')) o.smallcaps = on(kid(rPr, 'smallCaps')) ? 1 : 0; const sp = kid(rPr, 'spacing'); if (sp && wv(sp)) o.ls = +wv(sp) / 20; return o;
    };
    const pprProps = (pPr) => { const o = {}; if (!pPr) return o; const sp = kid(pPr, 'spacing'); if (sp) { if (wv(sp, 'before') !== null) o.sb = +wv(sp, 'before') / 20; if (wv(sp, 'after') !== null) o.sa = +wv(sp, 'after') / 20; if (wv(sp, 'beforeAutospacing') === '1') o.sb = 14 * 0.75; if (wv(sp, 'afterAutospacing') === '1') o.sa = 10; const ln_ = wv(sp, 'line'); if (ln_) { const rule = wv(sp, 'lineRule') || 'auto'; if (rule === 'auto') o.lh = +ln_ / 240; else o.lhPt = +ln_ / 20; } }
      const ind = kid(pPr, 'ind'); if (ind) { const l = wv(ind, 'left') ?? wv(ind, 'start'), r = wv(ind, 'right') ?? wv(ind, 'end'), fl = wv(ind, 'firstLine'), hg = wv(ind, 'hanging'); if (l !== null) o.il = px(+l); if (r !== null) o.ir = px(+r); if (fl) o.fi = px(+fl); if (hg) o.fi = -px(+hg); }
      const jc = kid(pPr, 'jc'); if (jc) o.align = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[wv(jc)] || 'left';
      if (kid(pPr, 'keepNext')) o.keep = on(kid(pPr, 'keepNext')) ? 1 : 0; if (kid(pPr, 'pageBreakBefore')) o.pbb = on(kid(pPr, 'pageBreakBefore')) ? 1 : 0;
      const shd = kid(pPr, 'shd'); if (shd && wv(shd, 'fill') && wv(shd, 'fill') !== 'auto') o.bg = '#' + wv(shd, 'fill'); const bd = kid(pPr, 'pBdr'); if (bd) { o.bd = {}; for (const s of bd.children) { const v = wv(s); if (v && v !== 'nil' && v !== 'none') o.bd[s.localName] = { color: wv(s, 'color') && wv(s, 'color') !== 'auto' ? '#' + wv(s, 'color') : '#8e8e93', w: Math.max(1, Math.round(+(wv(s, 'sz') || 4) / 6)) }; } }
      const nm = kid(pPr, 'numPr'); if (nm) { o.numId = wv(kid(nm, 'numId')); o.ilvl = +(wv(kid(nm, 'ilvl')) || 0); } const ol = kid(pPr, 'outlineLvl'); if (ol) o.outline = +wv(ol); return o;
    };
    const effective = (id) => { let p = {}, r = {}; r = { ...rprProps(docDef.rPr) }; p = { ...pprProps(docDef.pPr) }; for (const s of chain(id)) { Object.assign(p, pprProps(s.pPr)); Object.assign(r, rprProps(s.rPr)); } return { p, r }; };
    const stdName = (s) => {
      const n = (s.name || '').toLowerCase(); let m;
      if (s.id === 'Normal' || n === 'normal') return 'Body'; if ((m = /^heading (\d)$/.exec(n))) return 'Heading ' + Math.min(4, +m[1]); if (n === 'title') return 'Title'; if (n === 'subtitle') return 'Subtitle'; if (/^(quote|intense quote|block text)$/.test(n)) return 'Quote'; if (n === 'caption') return 'Caption';
      if (/^(code|source code|html code|html preformatted|preformatted text|macro text|plain text)$/.test(n)) return 'Code'; if ((m = /^toc (\d)$/.exec(n))) return 'TOC ' + Math.min(3, +m[1]); if (n === 'toc heading') return 'TOC Heading'; if (n === 'footnote text') return 'Footnote';
      if (/^(list( \w+)*|body text( \d)?|default|normal \(web\)|no spacing|header|footer|annotation text|endnote text|table paragraph|compact|first paragraph)$/.test(n)) return n === 'no spacing' ? 'No Spacing' : 'Body'; return s.name;
    };
    // build S.styles from the document
    const bodyEff = effective('Normal'); const Bd = S.styles.Body;
    if (bodyEff.r.font) Bd.font = bodyEff.r.font; if (bodyEff.r.size) Bd.size = bodyEff.r.size; if (bodyEff.r.color) Bd.color = bodyEff.r.color; if (bodyEff.p.sa !== undefined) Bd.sa = bodyEff.p.sa; if (bodyEff.p.sb !== undefined) Bd.sb = bodyEff.p.sb; if (bodyEff.p.lh) Bd.lh = Math.round(bodyEff.p.lh * 100) / 100; if (bodyEff.p.align) Bd.align = bodyEff.p.align;
    const mapName = {}; // styleId -> our style name
    for (const s of Object.values(I.styles)) {
      if (s.type !== 'paragraph') continue; const nm = stdName(s); mapName[s.id] = nm; if (nm === 'Body' || nm === 'No Spacing') { if (nm === 'No Spacing') { /* treat as custom */ } else continue; }
      const { p, r } = effective(s.id); const def = {}; const tgt = S.styles[nm] || {};
      if (r.font && r.font !== Bd.font) def.font = r.font; if (r.size) def.size = r.size; def.bold = r.bold ? 1 : 0; def.italic = r.italic ? 1 : 0; if (r.underline) def.underline = 1; if (r.color) def.color = r.color; if (r.caps) def.caps = 1; if (r.ls) def.ls = r.ls; if (r.bg) def.bg = r.bg;
      def.sb = p.sb ?? 0; def.sa = p.sa ?? 0; if (p.lh) def.lh = Math.round(p.lh * 100) / 100; else if (p.lhPt) def.lh = Math.round(((p.lhPt / (r.size || Bd.size)) || 1.2) * 100) / 100; if (p.il) def.il = p.il; if (p.ir) def.ir = p.ir; if (p.fi) def.fi = p.fi; if (p.align) def.align = p.align; if (p.keep) def.keep = 1;
      if (p.bd && p.bd.left) def.bl = p.bd.left.color; if (!r.size) def.size = Bd.size; if (!def.color) def.color = Bd.color;
      const nx = s.next && mapName[s.next] !== undefined ? mapName[s.next] : (s.next && I.styles[s.next] ? stdName(I.styles[s.next]) : ''); if (nx && nx !== nm) def.next = nx;
      if (S.styles[nm]) { S.styles[nm] = { ...tgt, ...def }; if (/^Heading/.test(nm)) S.styles[nm].tag = tgt.tag; } else S.styles[nm] = def;
    }
    P.applyStyleCss();
    // ---------- document parse ----------
    const body = doc.getElementsByTagNameNS(W, 'body')[0]; if (!body) throw new Error('This .docx has no body.');
    const commentIds = new Set(); const activeC = []; const out = I.nodes; const hrefOfRid = (rid) => { const r = rels[rid]; return r && r.ext ? r.target : null; };
    // comments
    const cRel = Object.values(rels).find((r) => r.type === 'comments'); if (cRel && z[resolve(cRel.target)]) {
      const cd = xml(z[resolve(cRel.target)]); const exRel = Object.values(rels).find((r) => r.type === 'commentsExtended'); const ex = {}; if (exRel && z[resolve(exRel.target)]) for (const e of xml(z[resolve(exRel.target)]).getElementsByTagName('*')) if (e.localName === 'commentEx') ex[e.getAttribute('w15:paraId') || ''] = { parent: e.getAttribute('w15:paraIdParent'), done: e.getAttribute('w15:done') === '1' };
      const paraIdOf = {}; for (const c of cd.getElementsByTagNameNS(W, 'comment')) { const id = wv(c, 'id'); const ps = [...c.getElementsByTagNameNS(W, 'p')]; const text = ps.map((p) => [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('')).join('\n'); const last = ps[ps.length - 1]; const pid = last && (last.getAttribute('w14:paraId') || last.getAttributeNS(NS.w14, 'paraId')); const e = pid ? ex[pid] : null; I.comments[id] = { id: 'c' + P.uid(), wid: id, author: wv(c, 'author') || 'Author', date: wv(c, 'date') || new Date().toISOString(), text, resolved: !!(e && e.done), replies: [], parentPid: e && e.parent, pid, quote: '' }; if (pid) paraIdOf[pid] = id; }
      for (const c of Object.values(I.comments)) if (c.parentPid && paraIdOf[c.parentPid]) { c.isReply = true; I.comments[paraIdOf[c.parentPid]].replies.push({ author: c.author, date: c.date, text: c.text }); }
    }
    // footnotes
    const fRel = Object.values(rels).find((r) => r.type === 'footnotes' || r.type === 'endnotes'); const fnRels = Object.values(rels).filter((r) => r.type === 'footnotes' || r.type === 'endnotes');
    for (const fr of fnRels) { if (!z[resolve(fr.target)]) continue; const fd = xml(z[resolve(fr.target)]); for (const f of fd.getElementsByTagNameNS(W, fr.type === 'footnotes' ? 'footnote' : 'endnote')) { const t = wv(f, 'type'); if (t && t !== 'normal') continue; I.fn[(fr.type === 'footnotes' ? 'f' : 'e') + wv(f, 'id')] = f; } }
    void fRel;

    // image extraction
    const imageFromRid = (rid) => { const r = rels[rid]; if (!r || r.ext) return null; const path = resolve(r.target); if (I.imgCache[path]) return I.imgCache[path]; const bytes = z[path]; if (!bytes) return null; const ext = path.split('.').pop().toLowerCase(); if (!/^(png|jpe?g|gif|bmp|webp|svg)$/.test(ext)) return null; const m = P.addMedia(bytes, P.mimeOfExt(ext)); return (I.imgCache[path] = m); };
    const drawingToImg = (d) => {
      const blip = d.getElementsByTagNameNS(NS.a, 'blip')[0]; if (!blip) return null; const rid = blip.getAttributeNS(NS.r, 'embed') || blip.getAttribute('r:embed'); const m = imageFromRid(rid); if (!m) return null;
      const ext = d.getElementsByTagNameNS(NS.wp, 'extent')[0]; const img = document.createElement('img'); img.src = m.url; img.dataset.m = m.id; const dp = d.getElementsByTagNameNS(NS.wp, 'docPr')[0]; img.alt = dp ? dp.getAttribute('descr') || '' : '';
      const g = P.geom(); let w = ext ? +ext.getAttribute('cx') / 9525 : 200, h = ext ? +ext.getAttribute('cy') / 9525 : 150; if (w > g.cw) { h = (h * g.cw) / w; w = g.cw; } img.style.width = Math.round(w) + 'px'; img.style.height = Math.round(h) + 'px';
      let wrap = 'inline'; if (ln(d) === 'anchor') { if (d.getElementsByTagNameNS(NS.wp, 'wrapTopAndBottom')[0]) wrap = 'break'; else if (d.getElementsByTagNameNS(NS.wp, 'wrapSquare')[0] || d.getElementsByTagNameNS(NS.wp, 'wrapTight')[0] || d.getElementsByTagNameNS(NS.wp, 'wrapThrough')[0]) { const ph = d.getElementsByTagNameNS(NS.wp, 'positionH')[0]; const al = ph && ph.getElementsByTagNameNS(NS.wp, 'align')[0]; const off = ph && ph.getElementsByTagNameNS(NS.wp, 'posOffset')[0]; wrap = al ? (/right|outside/.test(al.textContent) ? 'right' : /center/.test(al.textContent) ? 'break' : 'left') : off ? (+off.textContent / 9525 > g.cw / 2 ? 'right' : 'left') : 'left'; } }
      img.dataset.wrap = wrap; return img;
    };
    // ---- run conversion ----
    const mkWrap = (inner, props) => {
      let node = inner; const wrap = (tag) => { const e = document.createElement(tag); e.append(node); node = e; };
      const css = []; if (props.font) css.push(`font-family:"${props.font}"`); if (props.size && Math.abs(props.size - Bd.size) > 0.01) css.push(`font-size:${props.size}pt`); if (props.color && props.color !== '#000000' && props.color.toLowerCase() !== (Bd.color || '').toLowerCase()) css.push(`color:${props.color}`);
      const bg = props.bg || (props.hl && ({ yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000' }[props.hl])); if (bg) css.push(`background-color:${bg}`);
      if (props.smallcaps) css.push('font-variant:small-caps'); if (props.caps) css.push('text-transform:uppercase'); if (props.ls) css.push(`letter-spacing:${props.ls}pt`);
      if (css.length) { const sp = document.createElement('span'); sp.setAttribute('style', css.join(';')); sp.append(node); node = sp; }
      if (props.bold) wrap('b'); if (props.italic) wrap('i'); if (props.underline) wrap('u'); if (props.strike) wrap('s'); if (props.va === 'superscript') wrap('sup'); else if (props.va === 'subscript') wrap('sub'); return node;
    };
    const runProps = (rPr, pStyleRun) => {
      const o = { ...pStyleRun }; const rs = kid(rPr, 'rStyle'); if (rs) { const sid = wv(rs); const s = I.styles[sid]; if (s) { if (/^hyperlink$/i.test(s.name)) o._link = 1; const e = effective(sid).r; for (const k of ['bold', 'italic', 'underline', 'strike', 'color', 'font', 'size', 'bg', 'va']) if (e[k] !== undefined && !(sid === 'DefaultParagraphFont')) { if (k === 'size' || k === 'font') continue; if (/^hyperlink$/i.test(s.name) && (k === 'color' || k === 'underline')) continue; o[k] = e[k]; } } }
      const d = rprProps(rPr); for (const k in d) o[k] = d[k]; return o;
    };
    const sectOf = (p) => kid(kid(p, 'pPr'), 'sectPr');
    const ctxStack = []; // field state per paragraph
    const instrKind = (s) => { const t = s.trim(); if (/^PAGE\b/i.test(t)) return 'page'; if (/^NUMPAGES\b/i.test(t)) return 'pages'; if (/^HYPERLINK\b/i.test(t)) return 'link'; if (/^DATE\b/i.test(t)) return 'date'; if (/^TOC\b/i.test(t)) return 'toc'; if (/^TITLE\b/i.test(t)) return 'title'; return 'other'; };
    // convert the children of a paragraph-ish element into inline nodes appended to `host`
    function inlineInto(host, parent, st, pRun, inHF) {
      let linkEl = null;
      const target = () => (st.link ? st.link.el : st.container || host);
      const push = (n) => { let t = target(); const act = st.cmt && st.cmt.length ? [...st.cmt].reverse().find((x) => !x.reply) : null; if (act) { const last = t.lastChild; if (last && last.nodeType === 1 && last.classList.contains('cmt') && last.dataset.cid === act.id) last.append(n); else { const sp = document.createElement('span'); sp.className = 'cmt'; sp.dataset.cid = act.id; sp.append(n); t.append(sp); } act.quote += n.textContent || ''; } else t.append(n); };
      const handleRun = (r) => {
        const rPr = kid(r, 'rPr'); const props = runProps(rPr, pRun); const track = st.track;
        for (const c of r.children) {
          const nm = c.localName;
          if (nm === 't' || nm === 'delText') { let txt = c.textContent; if (!txt) continue; if (st.field && st.field.phase === 'instr') continue; if (st.suppress) continue; const tn = document.createTextNode(txt); let n = mkWrap(tn, props); push(n); }
          else if (nm === 'tab' || nm === 'ptab') { if (st.suppress) continue; push(mkWrap(document.createTextNode('\t'), props)); }
          else if (nm === 'br' || nm === 'cr') { const ty = wv(c, 'type'); if (ty === 'page') { st.breaks.push('page'); st.pendingBreak = true; flushBreak(st); } else if (ty === 'column') { st.breaks.push('col'); flushBreak(st, true); } else push(document.createElement('br')); }
          else if (nm === 'noBreakHyphen') push(document.createTextNode('‑')); else if (nm === 'softHyphen') continue; else if (nm === 'sym') { const ch = parseInt(wv(c, 'char') || 'F0B7', 16); push(document.createTextNode(String.fromCharCode(ch > 0xf000 ? ch - 0xf000 : ch))); }
          else if (nm === 'drawing') { const d = c.getElementsByTagNameNS(NS.wp, 'inline')[0] || c.getElementsByTagNameNS(NS.wp, 'anchor')[0]; if (d) { const img = drawingToImg(d); if (img) push(img); else { const tb = c.getElementsByTagNameNS(W, 'txbxContent')[0]; if (tb) st.extraBlocks.push(tb); } } }
          else if (nm === 'pict' || nm === 'object') { const im = c.getElementsByTagName('*'); let done = false; for (const e of im) if (e.localName === 'imagedata') { const m = imageFromRid(e.getAttributeNS(NS.r, 'id') || e.getAttribute('r:id')); if (m) { const img = document.createElement('img'); img.src = m.url; img.dataset.m = m.id; img.dataset.wrap = 'inline'; const sty = (e.parentNode.getAttribute && e.parentNode.getAttribute('style')) || ''; const wm = /width:([\d.]+)(pt|px)/.exec(sty), hm = /height:([\d.]+)(pt|px)/.exec(sty); if (wm && hm) { const k = (u) => (u === 'pt' ? 4 / 3 : 1); img.style.width = Math.round(+wm[1] * k(wm[2])) + 'px'; img.style.height = Math.round(+hm[1] * k(hm[2])) + 'px'; } else { img.style.width = '200px'; img.style.height = 'auto'; } push(img); done = true; break; } } void done; }
          else if (nm === 'footnoteReference' || nm === 'endnoteReference') { const key = (nm === 'footnoteReference' ? 'f' : 'e') + wv(c, 'id'); if (I.fn[key]) { const id = key + '_' + P.uid(); const sup = document.createElement('sup'); sup.className = 'fnr'; sup.setAttribute('contenteditable', 'false'); sup.dataset.fn = id; I.fnUsed.push({ id, key }); push(sup); } }
          else if (nm === 'commentReference') continue;
          else if (nm === 'fldChar') { const ty = wv(c, 'fldCharType'); if (ty === 'begin') { st.fstack.push({ instr: '', phase: 'instr' }); st.field = st.fstack[st.fstack.length - 1]; } else if (ty === 'separate') { if (st.field) { st.field.phase = 'result'; endInstr(st); } } else if (ty === 'end') { finishField(st); } }
          else if (nm === 'instrText') { if (st.field) st.field.instr += c.textContent; }
          else if (nm === 'lastRenderedPageBreak' || nm === 'rPr' || nm === 'annotationRef' || nm === 'footnoteRef' || nm === 'separator' || nm === 'continuationSeparator') continue;
        }
        void track;
      };
      const endInstr = (st_) => {
        const f = st_.field; if (!f) return; const k = instrKind(f.instr); f.kind = k;
        if (k === 'page' || k === 'pages' || k === 'date' || k === 'title') { const sp = document.createElement('span'); sp.className = 'fld'; sp.setAttribute('data-f', k); sp.setAttribute('contenteditable', 'false'); target().append(sp); st_.suppress = true; f.sup = true; }
        else if (k === 'link') { const m = /HYPERLINK\s+(?:\\l\s+)?"([^"]*)"/i.exec(f.instr) || /HYPERLINK\s+(\S+)/i.exec(f.instr); const isL = /\\l\s/.test(f.instr); if (m) { const a = document.createElement('a'); a.setAttribute('href', (isL ? '#' : '') + m[1]); target().append(a); st_.link = { el: a }; f.link = true; } }
        else if (k === 'toc') { st_.toc = true; }
      };
      const finishField = (st_) => { const f = st_.fstack.pop(); st_.field = st_.fstack[st_.fstack.length - 1] || null; if (!f) return; if (f.sup) st_.suppress = st_.fstack.some((x) => x.sup); if (f.link) st_.link = null; };
      const walkEl = (el) => {
        for (const c of el.children) {
          const nm = c.localName;
          if (nm === 'r') handleRun(c);
          else if (nm === 'hyperlink') { const rid = c.getAttributeNS(NS.r, 'id') || c.getAttribute('r:id'); const anchor = wv(c, 'anchor'); const href = rid ? hrefOfRid(rid) : anchor ? '#' + anchor : null; if (href && /^(https?:|mailto:|tel:|#)/i.test(href)) { const a = document.createElement('a'); a.setAttribute('href', href); (st.link ? st.link.el : host).append(a); const prev = st.link; st.link = { el: a }; walkEl(c); st.link = prev; if (!a.firstChild) a.remove(); } else walkEl(c); }
          else if (nm === 'ins' || nm === 'del') { const e = document.createElement(nm); e.setAttribute('data-tc', '1'); e.setAttribute('data-a', wv(c, 'author') || 'Author'); e.setAttribute('data-d', wv(c, 'date') || ''); target().append(e); const prevC = st.container; st.container = e; walkEl(c); st.container = prevC; if (!e.firstChild) e.remove(); }
          else if (nm === 'fldSimple') { const k = instrKind(wv(c, 'instr') || ''); if (k === 'page' || k === 'pages' || k === 'date' || k === 'title') { const sp = document.createElement('span'); sp.className = 'fld'; sp.setAttribute('data-f', k); sp.setAttribute('contenteditable', 'false'); target().append(sp); } else walkEl(c); }
          else if (nm === 'bookmarkStart') { const name = wv(c, 'name') || ''; if (name && !/^_/.test(name)) { const sp = document.createElement('span'); sp.className = 'bm'; sp.dataset.bm = name; sp.id = 'bm-' + P.slug(name); sp.setAttribute('contenteditable', 'false'); target().append(sp); } if (name) st.bmStarts.push(name); }
          else if (nm === 'commentRangeStart') { const cm = I.comments[wv(c, 'id')]; if (cm) { (st.cmt ||= []).push({ id: cm.id, wid: cm.wid, reply: !!cm.isReply, quote: '', ref: cm }); } }
          else if (nm === 'commentRangeEnd') { const wid = wv(c, 'id'); if (st.cmt) { const k = st.cmt.findIndex((x) => x.wid === wid); if (k >= 0) { const a = st.cmt.splice(k, 1)[0]; if (!a.reply) a.ref.quote = (a.ref.quote || '') + a.quote; I.usedComments.add(a.wid); } } }
          else if (nm === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) walkEl(sc); } else if (nm === 'smartTag' || nm === 'customXml' || nm === 'sdtContent' || nm === 'fldData') walkEl(c);
          else if (nm === 'AlternateContent') { const ch = [...c.children].find((x) => x.localName === 'Choice') || [...c.children].find((x) => x.localName === 'Fallback'); if (ch) walkEl(ch); }
          else if (nm === 'oMath' || nm === 'oMathPara') { const tex = ommlToTex(c); if (tex.trim()) { const q = document.createElement('span'); q.className = 'eq'; q.setAttribute('contenteditable', 'false'); q.setAttribute('data-tex', tex); if (nm === 'oMathPara') q.setAttribute('data-disp', '1'); target().append(q); } }
          else if (nm === 'pPr' || nm === 'proofErr' || nm === 'bookmarkEnd' || nm === 'permStart' || nm === 'permEnd') continue;
        }
      };
      walkEl(parent);
      for (const a of host.querySelectorAll('a:empty')) a.remove();
    }
    I.usedComments = new Set();
    function flushBreak(st, col) { st.pageBreak = col ? 'col' : 'page'; st.cut = true; }
    // ---- OMML -> TeX ----
    const NARY = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap', '∐': '\\coprod' };
    const ACCM = { '̂': '\\hat', '^': '\\hat', '̃': '\\tilde', '~': '\\tilde', '̄': '\\bar', '¯': '\\bar', '‾': '\\overline', '→': '\\vec', '⃗': '\\vec', '˙': '\\dot', '̇': '\\dot', '¨': '\\ddot' };
    function ommlToTex(el) {
      const mv = (e, n) => { const c = [...(e ? e.children : [])].find((x) => x.localName === n); return c ? c.getAttribute('m:val') ?? c.getAttributeNS(NS.m, 'val') : null; };
      const sub = (e, n) => { const c = [...(e ? e.children : [])].find((x) => x.localName === n); return c ? kidsTex(c) : ''; };
      const kidsTex = (e) => [...e.children].map(node).join('');
      const g = (s) => (s.length === 1 || /^\\[a-zA-Z]+$/.test(s) ? s : `{${s}}`);
      function node(e) {
        const nm = e.localName;
        switch (nm) {
          case 'r': { const t = [...e.children].filter((c) => c.localName === 't').map((c) => c.textContent).join(''); const nor = e.getElementsByTagNameNS(NS.m, 'nor').length || mv(kid(e, 'rPr'), 'sty') === 'p'; return nor && /[a-zA-Z]{2,}/.test(t) ? `\\text{${t}}` : t.replace(/([\\{}])/g, '\\$1'); }
          case 'f': return `\\frac{${sub(e, 'num')}}{${sub(e, 'den')}}`;
          case 'rad': { const deg = sub(e, 'deg'); return deg ? `\\sqrt[${deg}]{${sub(e, 'e')}}` : `\\sqrt{${sub(e, 'e')}}`; }
          case 'sSup': return `${g(sub(e, 'e'))}^{${sub(e, 'sup')}}`; case 'sSub': return `${g(sub(e, 'e'))}_{${sub(e, 'sub')}}`; case 'sSubSup': return `${g(sub(e, 'e'))}_{${sub(e, 'sub')}}^{${sub(e, 'sup')}}`;
          case 'nary': { const pr = kid(e, 'naryPr'); const chr = mv(pr, 'chr') || '∫'; const s = sub(e, 'sub'), u = sub(e, 'sup'); return (NARY[chr] || chr) + (s ? `_{${s}}` : '') + (u ? `^{${u}}` : '') + ' ' + sub(e, 'e'); }
          case 'd': { const pr = kid(e, 'dPr'); const b = mv(pr, 'begChr') ?? '('; const en = mv(pr, 'endChr') ?? ')'; const sep = mv(pr, 'sepChr') ?? '|'; const parts = kids(e, 'e').map(kidsTex); const L = b === '{' ? '\\{' : b || '.', R = en === '}' ? '\\}' : en || '.'; return `\\left${L} ${parts.join(sep === '|' && parts.length > 1 ? ',' : sep)} \\right${R}`; }
          case 'm': return `\\begin{matrix} ${kids(e, 'mr').map((r) => kids(r, 'e').map(kidsTex).join(' & ')).join(' \\\\ ')} \\end{matrix}`;
          case 'acc': { const chr = mv(kid(e, 'accPr'), 'chr') || '^'; return `${ACCM[chr] || '\\hat'}{${sub(e, 'e')}}`; }
          case 'bar': return `\\overline{${sub(e, 'e')}}`; case 'func': return `${sub(e, 'fName')}\\,${sub(e, 'e')}`; case 'limLow': return `${sub(e, 'e')}_{${sub(e, 'lim')}}`; case 'limUpp': return `${sub(e, 'e')}^{${sub(e, 'lim')}}`;
          case 'eqArr': return kids(e, 'e').map(kidsTex).join(' \\\\ '); case 'box': case 'phant': case 'groupChr': case 'borderBox': return sub(e, 'e');
          case 'oMath': case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'lim': case 'deg': case 'fName': return kidsTex(e);
          default: return nm.endsWith('Pr') ? '' : kidsTex(e);
        }
      }
      return [...(el.localName === 'oMathPara' ? el.children : [el])].map((x) => (x.localName === 'oMath' ? kidsTex(x) : node(x))).join(' ').trim();
    }
    // ---- paragraph conversion ----
    const cutNodes = [];
    function convertParagraph(p, ctxOpts = {}) {
      const pPr = kid(p, 'pPr'); const direct = pprProps(pPr); const sid = wv(kid(pPr, 'pStyle')); const sty = sid ? I.styles[sid] : null; const stName = sty ? mapName[sid] || stdName(sty) : 'Body';
      const eff = sid ? effective(sid) : { p: {}, r: {} }; const styleRun = {}; // run props from style are already in CSS; direct only
      // numbering from style
      let numId = direct.numId, ilvl = direct.ilvl; if (numId === undefined && sty) { for (const s of chain(sid)) { const sp = pprProps(s.pPr); if (sp.numId !== undefined) { numId = sp.numId; if (sp.ilvl !== undefined) ilvl = sp.ilvl; } } }
      const st = { breaks: [], fstack: [], field: null, suppress: false, link: null, cmt: ctxOpts.cmt || [], extraBlocks: [], bmStarts: [], container: null };
      const blocks = []; let cur = null; const newBlock = () => { cur = document.createElement(/^Heading \d$/.test(stName) ? 'h' + stName.slice(-1) : 'p'); blocks.push(cur); return cur; };
      newBlock(); let first = cur;
      // page-break splitting: process runs, on a break create a pgbreak node and a fresh paragraph
      st.pendingBreak = false; st.cut = false;
      const hostProxy = { get append() { return cur.append.bind(cur); } };
      void hostProxy;
      const stHost = { el: cur };
      // custom loop to support page breaks
      const runLoop = () => {
        const sub = { ...st };
        const walkTop = (parent) => {
          for (const c of [...parent.children]) {
            // detect page break inside plain runs to split paragraph
            if (c.localName === 'r' && [...c.children].some((x) => x.localName === 'br' && wv(x, 'type') === 'page')) {
              // handle content before/after in order
              for (const x of c.children) {
                if (x.localName === 'br' && wv(x, 'type') === 'page') { const pb = document.createElement('div'); pb.className = 'pgbreak'; pb.setAttribute('contenteditable', 'false'); pb.setAttribute('data-label', 'Page Break'); const hadContent = cur.childNodes.length > 0; if (!hadContent && blocks.length === 1 && cur === first) { blocks.length = 0; } blocks.push(pb); newBlock(); cur._pgb = true; }
                else { const tmp = document.createElementNS(W, 'w:r'); const rp = kid(c, 'rPr'); if (rp) tmp.append(rp.cloneNode(true)); tmp.append(x.cloneNode(true)); const holder = document.createElementNS(W, 'w:p'); holder.append(tmp); inlineInto(cur, holder, st, { ...rprFromStyle(eff) }, false); }
              }
            } else { const holder = document.createElementNS(W, 'w:p'); holder.append(c.cloneNode(true)); inlineInto(cur, holder, st, rprFromStyle(eff), false); }
          }
        };
        walkTop(p);
        void sub;
      };
      const rprFromStyle = () => ({});
      runLoop(); void stHost;
      // post: attributes on each paragraph block (not pgbreak)
      const ps = blocks.filter((b) => b.tagName !== 'DIV');
      // drop trailing empty paragraph created after a page break when it has no content and paragraph is a pure break paragraph
      const out_ = [];
      blocks.forEach((b, i) => { if (b.tagName === 'DIV') { out_.push(b); return; } if (!b.childNodes.length && b._pgb && i === blocks.length - 1 && blocks.length > 1) { /* keep a trailing empty para only if nothing follows */ out_.push(b); b._trail = true; return; } out_.push(b); });
      for (const b of ps) {
        if (stName !== 'Body' && !/^Heading \d$/.test(stName)) b.setAttribute('data-st', stName);
        const sets = []; const d = direct;
        if (d.align && d.align !== (eff.p.align || 'left')) sets.push(`text-align:${d.align}`); else if (d.align && !sty) sets.push(`text-align:${d.align}`);
        const base = eff.p; const dflt = (k) => (stName === 'Body' ? Bd[{ il: 'il', ir: 'ir', fi: 'fi' }[k]] || 0 : 0); void dflt;
        if (d.il !== undefined && d.il !== (base.il || 0)) sets.push(`--il:${d.il}px`); if (d.ir !== undefined && d.ir !== (base.ir || 0)) sets.push(`--ir:${d.ir}px`); if (d.fi !== undefined && d.fi !== (base.fi || 0)) sets.push(`--fi:${d.fi}px`);
        if (d.sb !== undefined) sets.push(`--sb:${Math.round(d.sb * 4 / 3 * 100) / 100}px`); if (d.sa !== undefined) sets.push(`--sa:${Math.round(d.sa * 4 / 3 * 100) / 100}px`);
        if (d.lh) sets.push(`--lh:${Math.round(d.lh * 100) / 100}`); else if (d.lhPt) sets.push(`--lh:${d.lhPt}pt`);
        if (d.bg) sets.push(`background-color:${d.bg}`); if (d.bd) { const side = { top: 'border-top', bottom: 'border-bottom', left: 'border-left', right: 'border-right' }; let any = false; for (const k in d.bd) if (side[k]) { sets.push(`${side[k]}:${d.bd[k].w}px solid ${d.bd[k].color}`); any = true; } if (any) { sets.push('padding:4px 8px'); b.setAttribute('data-bd', Object.keys(d.bd).length > 2 ? 'box' : Object.keys(d.bd)[0]); } }
        if (sets.length) b.setAttribute('style', sets.join(';')); if (d.keep || (eff.p.keep && !/^Heading/.test(stName))) b.setAttribute('data-kwn', '1'); if (d.pbb) b.setAttribute('data-pbb', '1');
        if (numId !== undefined && numId !== '0') { const nd = I.num[numId]; const lv = nd && I.abs[nd.abs] ? I.abs[nd.abs][String(ilvl || 0)] : null; if (nd && lv) { let kind = 'n'; if (lv.fmt === 'bullet') { kind = /[☐□]/.test(lv.text || '') ? 'c' : /[☑☒✓✔]/.test(lv.text || '') ? 'c' : 'b'; if (/[☑☒✓✔]/.test(lv.text || '')) b.setAttribute('data-checked', '1'); } else if (lv.fmt === 'none') kind = ''; else if ((lv.text || '').split('%').length > 3) kind = 'm';
            if (kind) { b.setAttribute('data-list', kind); b.setAttribute('data-lv', String(Math.min(8, ilvl || 0))); b._numId = numId; b._ilvl = ilvl || 0; b._lvl = lv; if (nd.over[ilvl || 0] !== undefined) b._over = nd.over[ilvl || 0]; } } }
        // headings: ensure bookmark ids from `_Toc` bookmarks etc.
        if (/^H[1-4]$/.test(b.tagName) || b.getAttribute('data-st') === 'Title') for (const nm of st.bmStarts) { if (!I.headingIds.has(nm)) { b.id = 'h-' + P.slug(nm) + '-' + P.uid().slice(0, 3); I.headingIds.set(nm, b.id); } }
        if (!b.childNodes.length) b.append(document.createElement('br'));
      }
      // TOC paragraphs
      if (/^TOC [1-3]$/.test(stName) || stName === 'TOC Heading') { return [{ toc: stName, text: p.textContent }]; }
      // trailing break paragraph handling
      const res = [...out_]; if (res.length >= 2 && res[res.length - 1]._trail && res[res.length - 1].textContent === '' && !res[res.length - 1].querySelector('img,.eq')) { res.pop(); res.push(_deferredEmpty()); }
      if (sectOf(p)) { const sp = sectOf(p); const ty = wv(kid(sp, 'type')); lastSect = sp; if (ty !== 'continuous') { const pb = document.createElement('div'); pb.className = 'pgbreak'; pb.setAttribute('contenteditable', 'false'); pb.setAttribute('data-label', 'Page Break'); res.push(pb); } }
      for (const eb of st.extraBlocks) for (const c of eb.children) { if (c.localName === 'p') { const t = convertParagraph(c); res.push(...t.filter((x) => x.nodeType)); } }
      return res;
    }
    const _deferredEmpty = () => { const d = document.createElement('div'); d.className = 'pgtrail'; return d; };
    let lastSect = null;

    // ---- tables ----
    function convertTable(tbl) {
      const props = kid(tbl, 'tblPr'); const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => px(+wv(c, 'w')));
      const rows = kids(tbl, 'tr'); const t = document.createElement('table'); const g = P.geom();
      let ts = 'plain'; const bdr = kid(props, 'tblBorders'); const styleId = wv(kid(props, 'tblStyle')); const sname = ((I.styles[styleId] || {}).name || '').toLowerCase();
      if (bdr) { const vis = (n) => { const e = kid(bdr, n); return e && wv(e) && !/^(nil|none)$/.test(wv(e)); }; if (vis('left') || vis('insideV')) ts = 'grid'; else if (vis('insideH') || vis('bottom') || vis('top')) ts = 'clean'; }
      else if (/grid|table/.test(sname) && !/normal/.test(sname)) ts = 'grid'; else if (sname && !/normal/.test(sname)) { const st_ = I.styles[styleId]; const tb = st_ && kid(st_.pPr && st_.pPr.parentNode, 'tblPr'); void tb; ts = /grid|list|accent|light|medium|dark|colorful|plain/.test(sname) ? 'grid' : 'plain'; }
      t.dataset.ts = ts; const jc = kid(props, 'jc'); if (jc && /center|right/.test(wv(jc))) t.setAttribute('data-ta', wv(jc));
      let widths = grid.length ? grid : null; const matrix = []; const vOrigin = {};
      rows.forEach((tr, ri) => {
        const trEl = document.createElement('tr'); const isHdr = !!kid(kid(tr, 'trPr'), 'tblHeader'); let col = 0; matrix[ri] = matrix[ri] || [];
        for (const tc of kids(tr, 'tc')) {
          const tcPr = kid(tc, 'tcPr'); const span = +(wv(kid(tcPr, 'gridSpan')) || 1); const vm = kid(tcPr, 'vMerge'); const vmv = vm ? wv(vm) || 'continue' : null;
          while (matrix[ri][col]) col++;
          if (vmv === 'continue') { const o = vOrigin[col]; if (o) o.rowSpan = (o.rowSpan || 1) + 1; for (let k = 0; k < span; k++) matrix[ri][col + k] = true; col += span; continue; }
          const cell = document.createElement(isHdr ? 'th' : 'td'); if (span > 1) cell.colSpan = span; if (vmv === 'restart') vOrigin[col] = cell;
          const sets = []; const shd = kid(tcPr, 'shd'); if (shd && wv(shd, 'fill') && wv(shd, 'fill') !== 'auto') sets.push(`background-color:#${wv(shd, 'fill')}`); const va = kid(tcPr, 'vAlign'); if (va && wv(va) !== 'top') sets.push(`vertical-align:${wv(va) === 'center' ? 'middle' : wv(va)}`);
          const tb = kid(tcPr, 'tcBorders'); if (tb) for (const s of tb.children) { const m = { top: 'border-top', bottom: 'border-bottom', left: 'border-left', right: 'border-right' }[s.localName]; if (!m) continue; const v = wv(s); if (!v) continue; if (/^(nil|none)$/.test(v)) sets.push(`${m}:1px hidden transparent`); else sets.push(`${m}:${Math.max(1, Math.round(+(wv(s, 'sz') || 4) / 6))}px solid ${wv(s, 'color') && wv(s, 'color') !== 'auto' ? '#' + wv(s, 'color') : '#000'}`); }
          if (sets.length) cell.setAttribute('style', sets.join(';'));
          const blocks = convertBlocks(tc, true); for (const b of blocks) if (b.nodeType && b.tagName !== 'TABLE' && !b.classList.contains('pgbreak') && !b.classList.contains('pgtrail')) cell.append(b); else if (b.tagName === 'TABLE') { const pp = document.createElement('p'); pp.textContent = b.textContent; cell.append(pp); }
          if (!cell.firstChild) { const pp = document.createElement('p'); pp.append(document.createElement('br')); cell.append(pp); }
          if (isHdr) for (const pp of cell.querySelectorAll('p')) { /* header bold is via CSS */ }
          trEl.append(cell); for (let k = 0; k < span; k++) matrix[ri][col + k] = true; col += span;
        }
        t.append(trEl);
      });
      for (const c of t.querySelectorAll('td[rowspan],th[rowspan]')) if (+c.getAttribute('rowspan') <= 1) c.removeAttribute('rowspan');
      const ncols = Math.max(widths ? widths.length : 0, ...matrix.map((r) => r.length)); if (!widths) widths = Array(ncols).fill(Math.floor(g.cw / Math.max(1, ncols))); while (widths.length < ncols) widths.push(60);
      const tot = widths.reduce((a, b) => a + b, 0); const k = tot > g.cw ? g.cw / tot : 1; const cg = document.createElement('colgroup'); for (const w of widths) { const c = document.createElement('col'); c.style.width = Math.floor(w * k) + 'px'; cg.append(c); } t.prepend(cg); t.style.width = Math.floor(tot * k) + 'px';
      return t;
    }
    // ---- block-level loop ----
    function convertBlocks(parent, inCell = false) {
      const out_ = []; let tocMarker = null;
      const handle = (el) => {
        const nm = el.localName;
        if (nm === 'p' && out_.length && out_[out_.length - 1].tagName === 'TABLE' && !el.textContent && (() => { const sp = kid(kid(el, 'pPr'), 'spacing'); return sp && wv(sp, 'lineRule') === 'exact' && +wv(sp, 'line') <= 140; })()) return;
        if (nm === 'p') { const r = convertParagraph(el); for (const x of r) { if (x.toc) { if (!I.tocSeen) { I.tocSeen = true; tocMarker = document.createElement('p'); tocMarker.setAttribute('data-toc', 'import'); out_.push(tocMarker); } continue; } out_.push(x); } }
        else if (nm === 'tbl') { out_.push(convertTable(el)); } else if (nm === 'sdt') { const sc = kid(el, 'sdtContent'); if (sc) for (const c of sc.children) handle(c); } else if (nm === 'customXml' || nm === 'ins' || nm === 'del' || nm === 'smartTag') { for (const c of el.children) handle(c); }
        else if (nm === 'AlternateContent') { const ch = [...el.children].find((x) => x.localName === 'Choice') || el.children[0]; if (ch) for (const c of ch.children) handle(c); }
      };
      for (const el of parent.children) { if (el.localName === 'sectPr') { lastSect = el; continue; } handle(el); }
      return out_;
    }
    I.usedC = new Set();
    let nodes = convertBlocks(body);
    // finalise trailing marker nodes
    nodes = nodes.filter((n, i) => { if (n.classList && n.classList.contains('pgtrail')) { const nx = nodes[i + 1]; return false && nx; } return true; });
    // lists: restart / continue detection
    { const seenNum = new Map(); let prev = null; for (const n of nodes) { if (!n.getAttribute || !n.hasAttribute('data-list')) { prev = null; continue; } const id = n._numId; const lv = n._ilvl || 0; const kind = n.getAttribute('data-list');
        if (!prev || prev._numId !== id) { const last = seenNum.get(id); if (last && prev === null) n.setAttribute('data-cont', '1'); else if (prev && prev._numId !== id && kind !== 'b' && kind !== 'c') n.setAttribute('data-restart', String(n._over ?? (n._lvl ? n._lvl.start : 1))); if (!last && kind !== 'b' && kind !== 'c' && n._lvl && n._lvl.start !== 1 && !n.hasAttribute('data-restart')) n.setAttribute('data-restart', String(n._over ?? n._lvl.start)); if (!last && n._over !== undefined && n._over !== 1 && !n.hasAttribute('data-restart')) n.setAttribute('data-restart', String(n._over)); }
        seenNum.set(id, true); prev = n; void lv; } }
    // section
    const sp = lastSect || kid(body, 'sectPr') || [...body.children].reverse().find((c) => c.localName === 'sectPr');
    if (sp) {
      const pgSz = kid(sp, 'pgSz'), pgMar = kid(sp, 'pgMar'); const pg = S.page;
      if (pgSz) { let w = +wv(pgSz, 'w'), h = +wv(pgSz, 'h'); const land = wv(pgSz, 'orient') === 'landscape' || w > h; const pw = Math.min(w, h), ph = Math.max(w, h); pg.land = land; pg.pw = Math.round(pw / 15); pg.ph = Math.round(ph / 15); pg.size = 'custom'; for (const [k, sw, sh] of SIZES) if (Math.abs(pw - sw) < 60 && Math.abs(ph - sh) < 60) { pg.size = k; pg.pw = P.SIZES[k].w; pg.ph = P.SIZES[k].h; } }
      if (pgMar) { const m = (a) => px(+(wv(pgMar, a) || 1440)); Object.assign(pg, { mt: m('top'), mb: m('bottom'), ml: m('left'), mr: m('right'), hd: m('header') || 48, fd: m('footer') || 48 }); }
      const cols = kid(sp, 'cols'); if (cols) { S.cols = Math.max(1, Math.min(3, +(wv(cols, 'num') || 1))); if (wv(cols, 'space')) S.colGap = px(+wv(cols, 'space')); }
      S.diffFirst = !!kid(sp, 'titlePg'); const pn = kid(sp, 'pgNumType'); if (pn && wv(pn, 'start')) S.pageStart = +wv(pn, 'start');
      for (const ref of sp.children) { const kind = ref.localName === 'headerReference' ? 'hdr' : ref.localName === 'footerReference' ? 'ftr' : null; if (!kind) continue; const ty = wv(ref, 'type') || 'default'; if (ty === 'even') continue; const rid = ref.getAttributeNS(NS.r, 'id') || ref.getAttribute('r:id'); const r = rels[rid]; if (!r || !z[resolve(r.target)]) continue;
        const hd = xml(z[resolve(r.target)]); const hostDoc = hd.documentElement; const prevRels = rels; void prevRels; const html = []; for (const p of [...hostDoc.children].filter((c) => c.localName === 'p')) { const blocks = convertParagraph(p).filter((x) => x.nodeType && x.tagName !== 'DIV'); for (const b of blocks) { b.removeAttribute('data-st'); html.push(b.outerHTML); } }
        const joined = html.join(''); const empty = !/[^<>]*\S/.test(joined.replace(/<[^>]+>/g, '')) && !/class="fld"/.test(joined); S[kind][ty === 'first' ? 'first' : 'def'] = empty ? '' : joined; }
    }
    // comments list
    S.comments = []; for (const c of Object.values(I.comments)) { if (c.isReply) continue; if (!I.usedComments.has(c.wid)) continue; S.comments.push({ id: c.id, author: c.author, date: c.date, text: c.text, resolved: c.resolved, replies: c.replies, quote: (c.quote || '').slice(0, 120) }); }
    // footnotes section
    const holder = []; if (I.fnUsed.length) {
      const sep = document.createElement('hr'); sep.className = 'fnsep'; sep.setAttribute('contenteditable', 'false'); holder.push(sep);
      for (const u of I.fnUsed) { const f = I.fn[u.key]; const p = document.createElement('p'); p.dataset.st = 'Footnote'; p.dataset.fnid = u.id; let firstP = true; for (const fp of kids(f, 'p')) { if (!firstP) p.append(document.createElement('br')); firstP = false; const tmp = convertParagraph(fp).filter((x) => x.nodeType && x.tagName === 'P'); for (const b of tmp) { while (b.firstChild) p.append(b.firstChild); } }
        // strip leading footnote-ref marker space
        const fch = p.firstChild; if (fch && fch.nodeType === 3 && /^\s+/.test(fch.nodeValue)) fch.nodeValue = fch.nodeValue.replace(/^\s+/, ''); if (!p.childNodes.length) p.append(document.createElement('br')); holder.push(p); }
    }
    nodes = nodes.concat(holder);
    // pgtrail cleanup
    nodes = nodes.filter((n) => !(n.classList && n.classList.contains('pgtrail')));
    P.applyPageCss(); P.applyStyleCss();
    P.clearHistory(); flow.replaceChildren(...nodes); if (!flow.firstChild) flow.append(P.emptyP());
    // TOC placeholder -> rebuilt TOC
    P.afterLoad(); const ph = flow.querySelector('p[data-toc="import"]'); if (ph) { const frag = P.buildTOC(); ph.replaceWith(...frag); P.afterLoad(); P.refreshTOC(true); }
    for (const sp2 of flow.querySelectorAll('.eq')) P.renderEq(sp2);
    // internal link fixups: hyperlinks to document bookmarks (#_Toc...) map to headings
    for (const a of flow.querySelectorAll('a[href^="#"]')) { const nm = a.getAttribute('href').slice(1); if (I.headingIds.has(nm)) a.setAttribute('href', '#' + I.headingIds.get(nm)); }
    P.$('#scroll').scrollTop = 0; P.refreshSoon && P.refreshSoon();
  };
})();
