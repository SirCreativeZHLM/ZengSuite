/* ZengWrite formats: native .zpages (zip), HTML, Markdown, plain text, RTF import/export. (.docx lives in docx.js) */
(() => {
  'use strict';
  const P = window.P, flow = P.flow, S = P.S;
  const esc = P.esc;
  const enc = (s) => new TextEncoder().encode(s), dec = (u) => new TextDecoder().decode(u);
  const mk = (t, cls) => { const e = document.createElement(t); if (cls) e.className = cls; return e; };

  P.defaultPageSize = () => { const l = (navigator.language || 'en-US').toUpperCase(); return /-(US|CA|MX|PH|CL|CO|VE|GT|CR|PR)$/.test(l) || l === 'EN' ? 'letter' : 'a4'; };
  P.resetDocSettings = () => {
    P.S.page = { size: 'letter', land: false, pw: 816, ph: 1056, mt: 96, mb: 96, ml: 96, mr: 96, hd: 48, fd: 48 };
    const sz = P.defaultPageSize(); if (sz === 'a4') Object.assign(P.S.page, { size: 'a4', pw: 794, ph: 1123 });
    Object.assign(P.S, { cols: 1, colGap: 36, diffFirst: false, pageStart: 1, tab: 48, hdr: { def: '', first: '' }, ftr: { def: '', first: '' }, styles: P.DEFAULT_STYLES(), comments: [], track: false });
    P.applyPageCss(); P.applyStyleCss();
  };
  /** replace the document body with a list of block nodes (fresh document state) */
  P.loadNodes = (nodes, { keepSettings = false } = {}) => {
    if (!keepSettings) P.resetDocSettings();
    P.clearHistory(); flow.replaceChildren(...nodes); if (!flow.firstChild) flow.append(P.emptyP()); P.afterLoad(); flow.scrollIntoView?.(); P.$('#scroll').scrollTop = 0;
  };

  /* ================= .zpages (zip: document.html + media/ + meta.json) ================= */
  P.zpagesBytes = (o = {}) => {
    if (!o.draft) P.endHF(); let html = P.cleanHTML().replace(/\u200b/g, ''); const files = {}; const media = {};
    const used = new Set(); for (const m of P.media.values()) if (html.includes(m.url)) { const f = `media/${m.id}.${P.mediaExt(m.mime)}`; html = html.split(m.url).join(f); files[f] = [m.bytes, { level: 0 }]; media[m.id] = { file: f, mime: m.mime }; used.add(m.id); }
    const d = JSON.parse(P.docJSON()); const now = new Date().toISOString();
    const meta = { format: 'zpages', version: 1, generator: 'ZengWrite ' + (zeng.info.version || ''), modified: now, created: P.S.created || now, ...d, media };
    files['document.html'] = enc(`<!doctype html>\n<meta charset="utf-8">\n<body>${html}</body>\n`); files['meta.json'] = enc(JSON.stringify(meta, null, 1));
    return fflate.zipSync(files, { level: 6 });
  };
  P.loadZpages = (buf) => {
    let z; try { z = fflate.unzipSync(new Uint8Array(buf)); } catch { throw new Error('This file is not a valid .zpages document (not a zip archive).'); }
    if (!z['document.html'] || !z['meta.json']) throw new Error('This .zpages file is missing document.html or meta.json.');
    const meta = JSON.parse(dec(z['meta.json'])); if (meta.format !== 'zpages') throw new Error('Unrecognised document format.');
    P.resetMedia(); let html = dec(z['document.html']); html = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
    for (const [id, m] of Object.entries(meta.media || {})) { const bytes = z[m.file]; if (!bytes) continue; const med = P.addMedia(bytes, m.mime, id); html = html.split(`media/${id}.`).length > 1 ? html.split(m.file).join(med.url) : html; }
    P.resetDocSettings(); P.applyDocJSON(meta); P.S.created = meta.created; P.clearHistory(); flow.innerHTML = P.sanitizeOwn(html); P.afterLoad(); P.$('#scroll').scrollTop = 0;
  };

  /* ================= plain text ================= */
  const blockText = (el) => {
    const c = el.cloneNode(true); for (const x of c.querySelectorAll('del[data-tc],.pgsp,.pgbreak')) x.remove(); for (const x of c.querySelectorAll('br')) x.replaceWith('\n'); for (const x of c.querySelectorAll('.eq')) x.replaceWith(P.tex.text(x.getAttribute('data-tex') || ''));
    for (const x of c.querySelectorAll('sup.fnr')) x.replaceWith('[' + (x.getAttribute('data-n') || '') + ']'); return c.textContent.replace(/\u200b/g, '');
  };
  P.exportTXT = () => {
    const out = [];
    for (const el of flow.children) {
      if (el.classList.contains('pgbreak')) { out.push('\f'); continue; } if (el.tagName === 'HR') { out.push('—'.repeat(10)); continue; }
      if (el.tagName === 'TABLE') { for (const r of el.rows) if (!r.classList.contains('pgsp')) out.push([...r.cells].map((c) => blockText(c).replace(/\n+/g, ' ').trim()).join('\t')); out.push(''); continue; }
      let t = blockText(el); if (el.hasAttribute('data-list')) t = '  '.repeat(+el.getAttribute('data-lv') || 0) + (el.getAttribute('data-mark') || '•') + ' ' + t; if (el.dataset.fnid) t = '[' + el.dataset.n + '] ' + t; out.push(t);
    }
    return out.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n';
  };
  P.importTXT = (text) => {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n'); const nodes = lines.map((l) => { const p = mk('p'); if (l) p.textContent = l.replace(/\f/g, ''); else p.append(document.createElement('br')); return p; });
    P.loadNodes(nodes);
  };

  /* ================= HTML ================= */
  const EXPORT_CSS = `body{margin:0;background:#fff;color:#1d1d1f}.pgdoc{max-width:${'7.5in'};margin:36px auto;padding:0 28px;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35}
.pgdoc p,.pgdoc h1,.pgdoc h2,.pgdoc h3,.pgdoc h4{margin:var(--sb,0) var(--ir,0) var(--sa,0) var(--il,0);white-space:pre-wrap;text-indent:var(--fi,0)}
.pgdoc table{border-collapse:collapse;margin:0 0 10px}.pgdoc td,.pgdoc th{border:1px solid #b5b5ba;padding:4px 8px;vertical-align:top}.pgdoc th{background:#f2f2f7}
.pgdoc ul,.pgdoc ol{margin:0 0 8px;padding-left:28px}.pgdoc img{max-width:100%}.pgdoc .fnsep{margin:24px 0 8px;width:30%}.pgdoc .cmt{background:#fff3cf}.pgdoc ins{color:#1a7f37}.pgdoc del{color:#cf222e}`;
  const listify = (clone) => {
    const out = document.createDocumentFragment(); let stack = [];
    const closeTo = (n) => { while (stack.length > n) { const t = stack.pop(); void t; } };
    const rootOf = () => (stack.length ? stack[stack.length - 1].li : out);
    for (const el of [...clone.children]) {
      const kind = el.getAttribute('data-list');
      if (!kind) { stack = []; out.append(el); continue; }
      const lv = Math.min(8, +el.getAttribute('data-lv') || 0); const tag = kind === 'n' || kind === 'm' ? 'ol' : 'ul';
      closeTo(lv + 1);
      while (stack.length < lv + 1) { const l = mk(tag); const parent = stack.length ? stack[stack.length - 1].li : null; if (parent) parent.append(l); else out.append(l); let li = null; if (stack.length < lv) { li = mk('li'); l.append(li); } stack.push({ list: l, li, tag }); }
      let top = stack[stack.length - 1]; if (top.tag !== tag) { const l = mk(tag); (stack.length > 1 ? stack[stack.length - 2].li : out).append(l); top = { list: l, li: null, tag }; stack[stack.length - 1] = top; }
      const li = mk('li'); if (kind === 'c') { const cb = mk('input'); cb.type = 'checkbox'; cb.disabled = true; if (el.hasAttribute('data-checked')) cb.checked = true; cb.setAttribute(el.hasAttribute('data-checked') ? 'checked' : 'data-u', ''); li.append(cb, ' '); li.style.listStyle = 'none'; }
      while (el.firstChild) li.append(el.firstChild); top.list.append(li); top.li = li;
      for (let k = stack.length; k-- > 0;) { /* keep parents */ }
    }
    void rootOf; return out;
  };
  P.exportHTML = () => {
    const wrap = document.createElement('div'); wrap.innerHTML = P.cleanHTML().replace(/\u200b/g, '');
    for (const m of P.media.values()) for (const img of wrap.querySelectorAll(`img[data-m="${m.id}"]`)) img.src = `data:${m.mime};base64,${P.u8ToB64(m.bytes)}`;
    for (const x of wrap.querySelectorAll('.pgbreak')) { const d = mk('div'); d.setAttribute('style', 'page-break-after:always;break-after:page'); x.replaceWith(d); }
    for (const x of wrap.querySelectorAll('.eq')) { x.removeAttribute('contenteditable'); }
    for (const x of wrap.querySelectorAll('[contenteditable]')) x.removeAttribute('contenteditable');
    for (const x of wrap.querySelectorAll('sup.fnr')) x.textContent = x.getAttribute('data-n') || '';
    for (const x of wrap.querySelectorAll('p[data-fnid]')) x.prepend((x.getAttribute('data-n') || '') + '. ');
    const body = listify(wrap); const holder = mk('div', 'pgdoc'); holder.append(body);
    const title = P.docTitle();
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="generator" content="ZengWrite"><title>${esc(title)}</title><style>${EXPORT_CSS}\n${P.genStyleCss()}</style></head><body>${holder.outerHTML}</body></html>\n`;
  };
  P.importHTML = (text) => {
    const nodes = P.sanitizeExternal(text); const doc = new DOMParser().parseFromString(text, 'text/html'); void doc; P.loadNodes(nodes.length ? nodes : [P.emptyP()]); P.absorbDataImages();
    P.afterLoad();
  };

  /* ================= Markdown ================= */
  const wrapMd = (m, s) => { const r = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return r[2] ? r[1] + m + r[2] + m + r[3] : s; };
  const mdInline = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\u200b/g, '').replace(/([\\`*_[\]~|])/g, '\\$1'); continue; }
      if (n.nodeType !== 1) continue; const t = n.tagName;
      if (t === 'BR') { out += '  \n'; continue; } if (t === 'IMG') { out += `![${(n.alt || '').replace(/[\[\]]/g, '')}](${n.getAttribute('src')})`; continue; }
      if (n.classList.contains('eq')) { out += '$' + (n.getAttribute('data-tex') || '') + '$'; continue; }
      if (t === 'SUP' && n.classList.contains('fnr')) { out += `[^${n.getAttribute('data-n') || n.dataset.fn}]`; continue; }
      if (t === 'DEL' && n.hasAttribute('data-tc')) continue; if (n.classList.contains('pgsp') || n.classList.contains('bm')) continue;
      let s = mdInline(n); const st = n.style || {};
      const bold = t === 'B' || t === 'STRONG' || /^(bold|[6-9]00)$/.test(st.fontWeight), it = t === 'I' || t === 'EM' || st.fontStyle === 'italic', strike = t === 'S' || t === 'STRIKE' || /line-through/.test(st.textDecoration || ''), ul = t === 'U' || /underline/.test(st.textDecoration || '') && t !== 'A';
      const code = /Menlo|Courier|Monaco|Consolas/i.test(st.fontFamily || '');
      if (t === 'A' && n.getAttribute('href')) s = `[${s}](${n.getAttribute('href')})`;
      if (code) s = '`' + n.textContent.replace(/`/g, "'") + '`'; else { if (bold) s = wrapMd('**', s); if (it) s = wrapMd('*', s); if (strike) s = wrapMd('~~', s); }
      if (ul) s = `<u>${s}</u>`; if (t === 'SUB') s = `<sub>${s}</sub>`; else if (t === 'SUP') s = `<sup>${s}</sup>`;
      out += s;
    }
    return out;
  };
  P.exportMD = () => {
    const wrap = document.createElement('div'); wrap.innerHTML = P.cleanHTML(); for (const m of P.media.values()) for (const img of wrap.querySelectorAll(`img[data-m="${m.id}"]`)) img.src = `data:${m.mime};base64,${P.u8ToB64(m.bytes)}`;
    const out = []; const notes = [];
    for (const el of wrap.children) {
      const t = el.tagName;
      if (el.classList.contains('pgbreak')) { out.push('<div style="page-break-after: always"></div>'); continue; }
      if (t === 'HR') continue;
      if (t === 'TABLE') {
        const G = P.tgrid(el); const rows = G.rows.map((r, ri) => Array.from({ length: G.ncols }, (_, ci) => { const c = G.grid[ri] && G.grid[ri][ci]; if (!c || c._r !== ri || c._c !== ci) return ' '; return mdInline(c).replace(/\n+/g, ' ').replace(/ {2,}\n?/g, ' ').replace(/\|/g, '\\|').trim() || ' '; }));
        const n = Math.max(...rows.map((r) => r.length)); rows.forEach((r) => { while (r.length < n) r.push(' '); });
        out.push('| ' + rows[0].join(' | ') + ' |', '| ' + rows[0].map(() => '---').join(' | ') + ' |', ...rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'), ''); continue;
      }
      const inner = [...el.querySelectorAll('p')].length && t !== 'P' ? '' : mdInline(el).replace(/\n{2,}/g, '\n').trimEnd();
      if (el.dataset.fnid) { notes.push(`[^${el.getAttribute('data-n') || el.dataset.fnid}]: ${inner}`); continue; }
      const st = el.getAttribute('data-st') || ''; const kind = el.getAttribute('data-list'); const lv = +el.getAttribute('data-lv') || 0;
      if (!kind && out.length && /^\s*(-|\d+\.)\s/.test(out[out.length - 1])) out.push('');
      if (/^H[1-4]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inner, '');
      else if (st === 'Title') out.push('# ' + inner, '');
      else if (st === 'Subtitle') out.push('*' + inner.replace(/\*/g, '') + '*', '');
      else if (st === 'Code') out.push('```', el.textContent.replace(/\u200b/g, ''), '```', '');
      else if (st === 'Quote') out.push('> ' + inner.replace(/\n/g, '\n> '), '');
      else if (kind) { const mm = /^(\d+)\./.exec(el.getAttribute('data-mark') || ''); const mark = kind === 'b' ? '-' : kind === 'c' ? (el.hasAttribute('data-checked') ? '- [x]' : '- [ ]') : (mm ? mm[1] + '.' : '1.'); out.push('    '.repeat(lv) + mark + ' ' + inner); }
      else { if (out.length && /^\s*(-|\d+\.)\s/.test(out[out.length - 1])) out.push(''); out.push(inner, ''); }
    }
    if (notes.length) out.push('', ...notes);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };
  const mdSpan = (s) => {
    const codes = []; s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0002'; });
    const maths = []; s = s.replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)/g, (m, a, t) => { maths.push(t); return a + '\u0003' + (maths.length - 1) + '\u0004'; });
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?(?:u|sub|sup|br))&gt;/g, '<$1>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, a, u) => `<img alt="${a.replace(/"/g, '')}" src="${u.replace(/&amp;/g, '&')}">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>');
    s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>');
    s = s.replace(/\[\^([^\]\s]+)\]/g, '<sup class="fnr" data-fn="$1"></sup>');
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => `<b>${a || b}</b>`).replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w|\*)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
    s = s.replace(/ {2,}\n|\\\n/g, '<br>').replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, '$1');
    s = s.replace(/\u0003(\d+)\u0004/g, (m, i) => `<span class="eq" data-tex="${maths[i].replace(/"/g, '&quot;')}"></span>`).replace(/\u0001(\d+)\u0002/g, (m, i) => `<span style="font-family:Menlo">${codes[i].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`);
    return s;
  };
  const mdToHtml = (md, notes) => {
    const L = md.replace(/\r\n?/g, '\n').split('\n'); let i = 0; const out = [];
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    const startsBlock = (l) => /^(#{1,6}\s|```|~~~|>|\s*([-*+]|\d+[.)])\s|\s*([-*_]\s*){3,}$|\[\^[^\]]+\]:)/.test(l);
    while (i < L.length) {
      const l = L[i]; if (!l.trim()) { i++; continue; }
      let m;
      if ((m = /^(```|~~~)/.exec(l))) { const fence = m[1]; i++; const buf = []; while (i < L.length && !L[i].startsWith(fence)) buf.push(L[i++]); i++; out.push('<pre>' + buf.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>'); continue; }
      if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { out.push(`<h${m[1].length}>${mdSpan(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*([-*_]\s*){3,}$/.test(l) && !/^\s*[-*+]\s+\S/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) { const buf = []; while (i < L.length && /^\s*>/.test(L[i])) buf.push(L[i++].replace(/^\s*> ?/, '')); out.push('<blockquote>' + mdToHtml(buf.join('\n'), notes) + '</blockquote>'); continue; }
      if (l.includes('|') && isTableSep(L[i + 1])) {
        const head = cells(l); i += 2; const rows = []; while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(cells(L[i++]));
        out.push('<table><tr>' + head.map((c) => `<th>${mdSpan(c)}</th>`).join('') + '</tr>' + rows.map((r) => '<tr>' + head.map((_, k) => `<td>${mdSpan(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</table>'); continue;
      }
      if ((m = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(l))) { let t = m[2]; i++; while (i < L.length && /^\s{2,}\S/.test(L[i])) t += ' ' + L[i++].trim(); notes.push([m[1], t]); continue; }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        const items = []; const ind = [];
        while (i < L.length && (/^\s*([-*+]|\d+[.)])\s+/.test(L[i]) || (L[i].trim() && /^\s{2,}\S/.test(L[i]) && items.length))) {
          const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(L[i]);
          if (!mm) { items[items.length - 1].text += ' ' + L[i].trim(); i++; continue; }
          const w = mm[1].replace(/\t/g, '    ').length; while (ind.length && w < ind[ind.length - 1]) ind.pop(); if (!ind.length || w > ind[ind.length - 1]) ind.push(w);
          let text = mm[3]; let task = null; const tm = /^\[( |x|X)\]\s+(.*)$/.exec(text); if (tm) { task = tm[1] !== ' '; text = tm[2]; }
          items.push({ lv: ind.length - 1, ord: /\d/.test(mm[2]), text, task }); i++;
        }
        let html = ''; const stack = [];
        for (const it of items) {
          while (stack.length > it.lv + 1) { html += `</li></${stack.pop()}>`; }
          if (stack.length === it.lv + 1) html += '</li>'; else while (stack.length < it.lv + 1) { const tag = it.ord ? 'ol' : 'ul'; html += `<${tag}>`; stack.push(tag); if (stack.length < it.lv + 1) html += '<li>'; }
          html += '<li>' + (it.task !== null ? `<input type="checkbox"${it.task ? ' checked' : ''}> ` : '') + mdSpan(it.text);
        }
        while (stack.length) html += `</li></${stack.pop()}>`; out.push(html); continue;
      }
      const buf = [l]; i++; while (i < L.length && L[i].trim() && !startsBlock(L[i]) && !(L[i].includes('|') && isTableSep(L[i + 1]))) buf.push(L[i++]);
      out.push('<p>' + mdSpan(buf.join('\n').replace(/([^ \\\n])\n/g, '$1 \n').replace(/ \n/g, ' \n').replace(/\n/g, ' ')) + '</p>');
    }
    return out.join('\n');
  };
  P.importMD = (text) => {
    const notes = []; const html = mdToHtml(text, notes); const nodes = P.sanitizeExternal('<body>' + html + '</body>');
    const fix = (ps) => ps; void fix;
    const holder = document.createElement('div'); nodes.forEach((n) => holder.append(n));
    if (notes.length) {
      const sep = mk('hr', 'fnsep'); sep.setAttribute('contenteditable', 'false'); holder.append(sep);
      for (const [id, t] of notes) { const p = mk('p'); p.dataset.st = 'Footnote'; p.dataset.fnid = id; const frag = P.sanitizeExternal('<body><p>' + mdSpan(t) + '</p></body>')[0]; if (frag) while (frag.firstChild) p.append(frag.firstChild); holder.append(p); }
    }
    P.loadNodes([...holder.childNodes]); P.absorbDataImages(); P.afterLoad();
  };

  /* ================= RTF ================= */
  const rtfEsc = (s) => { let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch; else if (ch === '\t') o += '\\tab '; else if (ch === '\n') o += '\\line '; else if (c > 126) { const u = c > 32767 ? c - 65536 : c; if (c > 0xffff) { const hi = 0xd800 + ((c - 0x10000) >> 10), lo = 0xdc00 + ((c - 0x10000) & 0x3ff); o += `\\u${hi - 65536}?\\u${lo - 65536}?`; } else o += `\\u${u}?`; } else if (c >= 32) o += ch; } return o; };
  P.exportRTF = () => {
    const fonts = []; const colors = ['']; const fid = (n) => { n = n || 'Helvetica Neue'; let i = fonts.indexOf(n); if (i < 0) { fonts.push(n); i = fonts.length - 1; } return i; }; const cid = (c) => { const h = hex(c); if (!h) return 0; let i = colors.indexOf(h); if (i < 0) { colors.push(h); i = colors.length - 1; } return i; };
    const hex = (c) => { if (!c) return ''; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m) return m[4] === '0' ? '' : [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join(''); const h = /^#([0-9a-f]{3,6})$/i.exec(c); if (!h) return ''; let v = h[1]; if (v.length === 3) v = [...v].map((x) => x + x).join(''); return v.toLowerCase(); };
    const rgb = (h) => { const n = parseInt(h, 16); return `\\red${(n >> 16) & 255}\\green${(n >> 8) & 255}\\blue${n & 255};`; };
    fid('Helvetica Neue');
    const runs = (node, base) => {
      let o = '';
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { o += rtfEsc(n.nodeValue.replace(/\u200b/g, '')); continue; } if (n.nodeType !== 1) continue; const t = n.tagName;
        if (t === 'BR') { o += '\\line '; continue; } if (n.classList.contains('pgsp') || (t === 'DEL' && n.hasAttribute('data-tc'))) continue;
        if (t === 'IMG') { const m = P.media.get(n.dataset.m); if (m && /png|jpeg/.test(m.mime)) { const w = parseFloat(n.style.width) || 200, h = parseFloat(n.style.height) || 150; o += `{\\pict${m.mime.includes('png') ? '\\pngblip' : '\\jpegblip'}\\picwgoal${Math.round(w * 15)}\\pichgoal${Math.round(h * 15)}\n${[...m.bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}}`; } continue; }
        if (n.classList.contains('eq')) { o += rtfEsc(P.tex.text(n.getAttribute('data-tex') || '')); continue; }
        if (t === 'SUP' && n.classList.contains('fnr')) { o += `{\\super ${n.getAttribute('data-n') || ''}}`; continue; }
        const st = n.style; let pre = '', post = '';
        if (t === 'B' || t === 'STRONG' || st.fontWeight >= 600 || st.fontWeight === 'bold') pre += '\\b '; if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') pre += '\\i '; if (t === 'U' || /underline/.test(st.textDecoration || '') && t !== 'A' || t === 'INS' || t === 'A') pre += '\\ul '; if (t === 'S' || t === 'STRIKE' || /line-through/.test(st.textDecoration || '')) pre += '\\strike '; if (t === 'SUP' || st.verticalAlign === 'super') pre += '\\super '; if (t === 'SUB' || st.verticalAlign === 'sub') pre += '\\sub ';
        if (st.fontFamily) pre += `\\f${fid(st.fontFamily.split(',')[0].replace(/["']/g, '').trim())} `; if (st.fontSize && /pt/.test(st.fontSize)) pre += `\\fs${Math.round(parseFloat(st.fontSize) * 2)} `; if (st.color) { const h = hex(st.color); if (h) pre += `\\cf${cid(st.color)} `; } if (st.backgroundColor) { const h = hex(st.backgroundColor); if (h) pre += `\\highlight${cid(st.backgroundColor)} `; }
        if (st.fontVariant === 'small-caps') pre += '\\scaps ';
        o += pre ? `{${pre}${runs(n, base)}}` : runs(n, base); void post;
      }
      return o;
    };
    const para = (el, extra = '') => {
      const al = { center: '\\qc', right: '\\qr', justify: '\\qj' }[el.style.textAlign] || ''; let pre = ''; const t = el.tagName; const st = el.getAttribute('data-st');
      let fmt = ''; if (/^H[1-4]$/.test(t)) fmt = `\\b\\fs${[0, 40, 32, 26, 22][+t[1]]} `; else if (st === 'Title') fmt = '\\b\\fs60 '; else if (st === 'Subtitle') fmt = '\\fs30 '; else if (st === 'Quote') fmt = '\\i '; else if (st === 'Code') fmt = `\\f${fid('Menlo')}\\fs19 `;
      const il = parseFloat(el.style.getPropertyValue('--il')) || 0; let li = Math.round(il * 15); if (el.hasAttribute('data-list')) { li += (((+el.getAttribute('data-lv') || 0) + 1) * 540); pre = rtfEsc((el.getAttribute('data-mark') || '•') + '\t'); }
      return `\\pard${al}${li ? `\\li${li}` : ''}${el.hasAttribute('data-list') ? '\\fi-360' : ''}\\sa${Math.round((parseFloat(el.style.getPropertyValue('--sa')) || P.pt2px(8)) * 15)}${extra} {${fmt}${pre}${runs(el)}}\\par\n`;
    };
    let body = '';
    for (const el of flow.children) {
      if (el.classList.contains('pgbreak')) { body += '\\page\n'; continue; } if (el.tagName === 'HR') continue;
      if (el.tagName === 'TABLE') {
        const G = P.tgrid(el); const cg = el.querySelector(':scope > colgroup'); const ws = cg ? [...cg.children].map((c) => parseFloat(c.style.width) || 80) : Array(G.ncols).fill(80); let x = 0; const edges = ws.map((w) => (x += Math.round(w * 15)));
        for (const tr of G.rows) { body += '\\trowd\\trgaph108\\trleft0'; for (const c of tr.cells) { const e = edges[Math.min(edges.length - 1, c._c + c.colSpan - 1)]; body += '\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs' + (c.style.backgroundColor && hex(c.style.backgroundColor) ? `\\clcbpat${cid(c.style.backgroundColor)}` : '') + `\\cellx${e}`; } body += '\n'; for (const c of tr.cells) { body += [...c.children].map((p) => para(p, '\\intbl').replace(/\\par\n$/, '')).join('\\line ') + '\\cell\n'; } body += '\\row\n'; } continue;
      }
      body += para(el);
    }
    const fontTbl = fonts.map((n, i) => `{\\f${i}\\fnil ${rtfEsc(n)};}`).join('');
    return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl${fontTbl}}{\\colortbl;${colors.slice(1).map(rgb).join('')}}{\\info{\\title ${rtfEsc(P.docTitle())}}{\\creatim\\yr${new Date().getFullYear()}}}\\paperw${Math.round(P.geom().w * 15)}\\paperh${Math.round(P.geom().h * 15)}\\margl${Math.round(S.page.ml * 15)}\\margr${Math.round(S.page.mr * 15)}\\margt${Math.round(S.page.mt * 15)}\\margb${Math.round(S.page.mb * 15)}\\f0\\fs22\n${body}}`;
  };
  const CP1252 = '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
  P.importRTF = (text) => {
    let i = 0; const n = text.length; const stack = []; let st = { b: 0, i: 0, ul: 0, strike: 0, sup: 0, sub: 0, fs: 0, f: -1, cf: 0, hl: 0, scaps: 0, skip: 0, uc: 1 };
    const fonts = {}, colors = [null]; const nodes = []; let para = null, align = '', li = 0, fi = 0, inRow = false, tableNode = null, row = null, cell = null, cellDefs = []; let curCellP = null; const pend = []; let picBuf = null; let dest = '';
    const newPara = () => { const p = mk('p'); if (align) p.style.textAlign = align; if (li > 0 || fi) { if (li > 0) p.style.setProperty('--il', Math.round(li / 15) + 'px'); } return p; };
    const target = () => { if (inRow) { if (!cell) { cell = mk('td'); } if (!curCellP) { curCellP = newPara(); cell.append(curCellP); } return curCellP; } if (!para) { para = newPara(); nodes.push(para); } return para; };
    const spanFor = (txt) => {
      const sp = mk('span'); const css = []; if (st.fs) css.push(`font-size:${st.fs / 2}pt`); if (st.f >= 0 && fonts[st.f]) css.push(`font-family:"${fonts[st.f]}"`); if (st.cf && colors[st.cf]) css.push(`color:${colors[st.cf]}`); if (st.hl && colors[st.hl]) css.push(`background-color:${colors[st.hl]}`); if (st.scaps) css.push('font-variant:small-caps'); sp.setAttribute('style', css.join(';'));
      let node = document.createTextNode(txt); let w = node; const wrap = (tag) => { const e = mk(tag); e.append(w); w = e; }; if (st.b) wrap('b'); if (st.i) wrap('i'); if (st.ul) wrap('u'); if (st.strike) wrap('s'); if (st.sup) wrap('sup'); if (st.sub) wrap('sub');
      if (css.length) { sp.append(w); return sp; } return w;
    };
    const emit = (txt) => { if (!txt || st.skip) return; if (picBuf) return; const tp = target(); tp._n = (tp._n || 0) + txt.length; if (st.b) tp._nb = (tp._nb || 0) + txt.length; if (st.fs) tp._fs = Math.max(tp._fs || 0, st.fs); tp.append(spanFor(txt)); };
    const flushPara = () => { if (inRow) { if (curCellP && !curCellP.textContent && !curCellP.childNodes.length) curCellP.append(document.createElement('br')); curCellP = null; } else { if (para && !para.childNodes.length) para.append(document.createElement('br')); if (!para) { const p = newPara(); p.append(document.createElement('br')); nodes.push(p); } para = null; } };
    while (i < n) {
      const c = text[i];
      if (c === '{') { stack.push({ ...st, dest }); i++; if (text[i] === '\\' && text[i + 1] === '*') { st.skip = 1; } continue; }
      if (c === '}') { const prev = stack.pop(); if (picBuf && dest === 'pict') { finishPic(); } if (prev) { st = prev; dest = prev.dest; } i++; continue; }
      if (c === '\\') {
        i++; const d = text[i];
        if (d === '\\' || d === '{' || d === '}') { emit(d); i++; continue; }
        if (d === "'") { const h = parseInt(text.substr(i + 1, 2), 16); const ch = h >= 0x80 && h < 0xa0 ? CP1252[h - 0x80] : String.fromCharCode(h); emit(ch); i += 3; continue; }
        if (d === '~') { emit('\u00a0'); i++; continue; } if (d === '-' || d === '_') { emit(d === '_' ? '\u2011' : ''); i++; continue; } if (d === '\n' || d === '\r') { flushPara(); i++; continue; }
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(text.slice(i, i + 40)); if (!m) { i++; continue; } i += m[0].length; const w = m[1], v = m[2] === undefined ? null : +m[2];
        switch (w) {
          case 'fonttbl': st.skip = st.skip; dest = 'fonttbl'; break; case 'colortbl': dest = 'colortbl'; colors.length = 1; break; case 'stylesheet': case 'info': case 'header': case 'footer': case 'footnote': case 'fldinst': case 'generator': case 'themedata': case 'latentstyles': case 'listtable': case 'listoverridetable': st.skip = 1; break;
          case 'pict': dest = 'pict'; picBuf = { hex: '', type: '', w: 0, h: 0 }; st.skip = 0; break; case 'pngblip': picBuf && (picBuf.type = 'image/png'); break; case 'jpegblip': picBuf && (picBuf.type = 'image/jpeg'); break; case 'picwgoal': picBuf && (picBuf.w = v / 15); break; case 'pichgoal': picBuf && (picBuf.h = v / 15); break;
          case 'f': if (dest === 'fonttbl') { st.cur = v; } else st.f = v; break;
          case 'red': st.r = v; break; case 'green': st.g = v; break; case 'blue': st.bl = v; break;
          case 'b': st.b = v === 0 ? 0 : 1; break; case 'i': st.i = v === 0 ? 0 : 1; break; case 'ul': st.ul = v === 0 ? 0 : 1; break; case 'ulnone': st.ul = 0; break; case 'strike': st.strike = v === 0 ? 0 : 1; break; case 'super': st.sup = v === 0 ? 0 : 1; st.sub = 0; break; case 'sub': st.sub = v === 0 ? 0 : 1; st.sup = 0; break; case 'nosupersub': st.sup = st.sub = 0; break; case 'scaps': st.scaps = v === 0 ? 0 : 1; break;
          case 'fs': st.fs = v; break; case 'cf': st.cf = v; break; case 'highlight': case 'cb': if (w === 'highlight') st.hl = v; break; case 'plain': st.b = st.i = st.ul = st.strike = st.sup = st.sub = st.scaps = 0; st.fs = 0; st.cf = 0; st.hl = 0; break;
          case 'uc': st.uc = v; break;
          case 'u': { let cp = v < 0 ? v + 65536 : v; emit(String.fromCharCode(cp)); let skip = st.uc; while (skip-- > 0 && i < n) { if (text[i] === '\\' && text[i + 1] === "'") i += 4; else i++; } break; }
          case 'par': case 'line': w === 'par' ? (flushPara(), (para = null)) : emit('\n');  break;
          case 'pard': align = ''; li = 0; fi = 0; if (!inRow) para = null; break; case 'qc': align = 'center'; break; case 'qr': align = 'right'; break; case 'qj': align = 'justify'; break; case 'ql': align = ''; break; case 'li': li = v; break; case 'fi': fi = v; break;
          case 'tab': emit('\t'); break; case 'emdash': emit('—'); break; case 'endash': emit('–'); break; case 'bullet': emit('•'); break; case 'lquote': emit('‘'); break; case 'rquote': emit('’'); break; case 'ldblquote': emit('“'); break; case 'rdblquote': emit('”'); break;
          case 'page': nodes.push(Object.assign(mk('div', 'pgbreak'), { contentEditable: 'false' })); para = null; break;
          case 'trowd': if (!tableNode || nodes[nodes.length - 1] !== tableNode) { tableNode = mk('table'); nodes.push(tableNode); } para = null; inRow = true; row = mk('tr'); cellDefs = []; cell = null; curCellP = null; break; case 'cellx': cellDefs.push(v); break;
          case 'cell': { if (!cell) cell = mk('td'); if (!cell.firstChild) { const p = newPara(); p.append(document.createElement('br')); cell.append(p); } row.append(cell); cell = null; curCellP = null; break; }
          case 'row': { if (tableNode && row) { tableNode.append(row); row = null; } inRow = false; break; }
          case 'paperw': if (v) S.page.pw = Math.round(v / 15); break; case 'paperh': if (v) S.page.ph = Math.round(v / 15); break;
          case 'margl': S.page.ml = Math.round(v / 15); break; case 'margr': S.page.mr = Math.round(v / 15); break; case 'margt': S.page.mt = Math.round(v / 15); break; case 'margb': S.page.mb = Math.round(v / 15); break;
          default: break;
        }
        if (dest === 'colortbl' && false) { /* handled at ';' */ }
        continue;
      }
      if (c === '\r' || c === '\n') { i++; continue; }
      if (dest === 'colortbl') { if (c === ';') { colors.push(st.r === undefined ? null : `rgb(${st.r},${st.g},${st.bl})`); st.r = st.g = st.bl = undefined; } i++; continue; }
      if (dest === 'fonttbl') { let name = ''; while (i < n && text[i] !== ';' && text[i] !== '}' && text[i] !== '\\') name += text[i++]; if (text[i] === ';') { fonts[st.cur] = (fonts[st.cur] || '') + name.trim(); i++; } else fonts[st.cur] = (fonts[st.cur] || '') + name.trim(); continue; }
      if (picBuf) { if (/[0-9a-fA-F]/.test(c)) picBuf.hex += c; i++; continue; }
      let j = i; while (j < n && !'\\{}\r\n'.includes(text[j])) j++; emit(text.slice(i, j)); i = j;
    }
    function finishPic() {
      const pb = picBuf; picBuf = null; if (!pb || !pb.type || pb.hex.length < 20) return; const bytes = new Uint8Array(pb.hex.length / 2); for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(pb.hex.substr(k * 2, 2), 16);
      const m = P.addMedia(bytes, pb.type); const img = mk('img'); img.src = m.url; img.dataset.m = m.id; img.dataset.wrap = 'inline'; if (pb.w) { img.style.width = pb.w + 'px'; img.style.height = pb.h + 'px'; } target().append(img);
    }
    
    // assemble tables: they were collected in `inTable` only when \trowd seen; we append them where encountered by order
    const assembled = []; let tbl = null; void tbl; void pend;
    const finalNodes = nodes.filter((x) => x.tagName !== 'TABLE' || x.rows.length);
    void assembled;
    // tables: rebuild properly: rows were appended to inTable, which is a single table (adjacent tables merge; acceptable for basic RTF)
    const tables = finalNodes.filter((x) => x.tagName === 'TABLE'); for (const t of tables) { const cols = Math.max(...[...t.rows].map((r) => r.cells.length)); const cg = mk('colgroup'); const w = Math.floor(P.geom().cw / cols); for (let k = 0; k < cols; k++) { const c = mk('col'); c.style.width = w + 'px'; cg.append(c); } t.prepend(cg); t.dataset.ts = 'grid'; t.style.width = w * cols + 'px'; }
    finalNodes.forEach((nd, idx) => { if (nd.tagName !== 'P' || !nd._n || nd._nb !== nd._n || !(nd._fs >= 26)) return; const fs = nd._fs / 2; const lvl = fs >= 28 ? 0 : fs >= 19 ? 1 : fs >= 15 ? 2 : 3; nd.querySelectorAll('[style*="font-size"]').forEach((x) => x.style.removeProperty('font-size')); nd.querySelectorAll('b').forEach((x) => { const pr = x.parentNode; while (x.firstChild) pr.insertBefore(x.firstChild, x); x.remove(); }); if (lvl === 0) nd.dataset.st = 'Title'; else { const h = mk('h' + lvl); while (nd.firstChild) h.append(nd.firstChild); finalNodes[idx] = h; } });
    P.resetDocSettings(); const keep = { ...S.page }; void keep;
    P.loadNodes(finalNodes.length ? finalNodes : [P.emptyP()], { keepSettings: true });
  };

  /* ================= dispatch ================= */
  P.saveAs = (ext) => {
    switch (ext) {
      case 'zpages': return P.zpagesBytes(); case 'docx': return P.exportDocx(); case 'html': case 'htm': return P.exportHTML(); case 'md': case 'markdown': return P.exportMD(); case 'txt': case 'text': return P.exportTXT(); case 'rtf': return P.exportRTF();
    }
    throw new Error('Unknown export format: ' + ext);
  };
  P.loadFile = async (buf, ext) => {
    const u8 = new Uint8Array(buf); const text = () => dec(u8);
    if (ext === 'zpages') { P.loadZpages(u8); return 'zpages'; }
    if (ext === 'docx') { await P.importDocx(u8); return 'docx'; }
    if (ext === 'html' || ext === 'htm') { P.resetMedia(); P.importHTML(text()); return ext; }
    if (ext === 'md' || ext === 'markdown') { P.resetMedia(); P.importMD(text()); return ext; }
    if (ext === 'rtf') { P.resetMedia(); P.importRTF(text()); return ext; }
    P.resetMedia(); P.importTXT(text()); return ext;
  };
})();
