/* Conversion between the canonical note HTML and Markdown / HTML / text, plus importers (ENEX, Takeout JSON, docx, Word HTML).
   Canonical HTML (what is stored):
     blocks  p h1 h2 h3 ul(.dash|.check) ol li(data-done) blockquote pre.code[data-lang] table hr
             div.att[data-att,data-name,data-type,data-size] (.img|.file)  div.sketch[data-strokes,data-h]
     inline  b i u s code a[href] a[data-nt] br                                                                */
(() => {
  const U = N.u, esc = U.esc; const CV = (N.cv = {});
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  CV.attHtml = (a) => `<div class="att ${U.isImage(a.type) ? 'img' : 'file'}" data-att="${a.id}" data-name="${esc(a.name)}" data-type="${esc(a.type)}" data-size="${a.size | 0}"></div>`;

  // ---------------------------------------------------------------- sanitiser / normaliser
  const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'EN-CRYPT']);
  const BLOCKISH = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,pre,hr,img,section,article,figure,dl,dd,dt,center,header,footer,main,nav,aside';
  const hasBlock = (el) => !!el.querySelector(BLOCKISH);
  const safeHref = (h) => { h = (h || '').trim(); return /^(https?:|mailto:|tel:|zeng:|#)/i.test(h) ? h : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(h) ? 'https://' + h : ''; };
  const styleOf = (el) => (el.getAttribute && el.getAttribute('style') || '').toLowerCase();
  const cleanId = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);

  // o: { img(src, alt, el) -> html or '' }
  CV.clean = (input, o = {}) => {
    const root = typeof input === 'string' ? parse(input).body : input;
    const isCheckbox = (n) => !!n && n.nodeType === 1 && n.tagName === 'INPUT' && n.type === 'checkbox';
    const fmtWrap = (el, s) => {
      const st = styleOf(el); if (!s) return s;
      if (/font-weight:\s*(bold|[6-9]00)/.test(st)) s = `<b>${s}</b>`;
      if (/font-style:\s*italic/.test(st)) s = `<i>${s}</i>`;
      if (/text-decoration[^;]*underline/.test(st)) s = `<u>${s}</u>`;
      if (/text-decoration[^;]*line-through/.test(st)) s = `<s>${s}</s>`;
      if (/font-family:[^;]*(courier|mono|consolas|menlo)/.test(st)) s = `<code>${s}</code>`;
      return s;
    };
    function inl(n, pre) {
      if (n.nodeType === 3) { const t = n.nodeValue; return esc(pre ? t : o.raw ? t.replace(/\u00a0/g, ' ').replace(/\u200b/g, '') : t.replace(/[\s\u00a0]+/g, ' ')); }
      if (n.nodeType !== 1) return '';
      const tag = n.tagName; if (SKIP.has(tag)) return ''; if (/mso-list:\s*ignore/.test(styleOf(n))) return '';
      if (tag === 'INPUT') return '';
      const kids = () => { let s = ''; for (const c of n.childNodes) s += inl(c, pre); return s; };
      switch (tag) {
        case 'BR': return '<br>';
        case 'B': case 'STRONG': { const s = kids(); return s.trim() ? `<b>${s}</b>` : s; }
        case 'I': case 'EM': case 'CITE': case 'DFN': case 'VAR': { const s = kids(); return s.trim() ? `<i>${s}</i>` : s; }
        case 'U': case 'INS': { const s = kids(); return s.trim() ? `<u>${s}</u>` : s; }
        case 'S': case 'STRIKE': case 'DEL': { const s = kids(); return s.trim() ? `<s>${s}</s>` : s; }
        case 'CODE': case 'KBD': case 'SAMP': case 'TT': { const s = n.textContent; return s ? `<code>${esc(s)}</code>` : ''; }
        case 'A': {
          const s = kids(); if (n.dataset && n.dataset.nt) return `<a href="#" data-nt="${esc(n.dataset.nt)}"${n.dataset.note ? ` data-note="${esc(cleanId(n.dataset.note))}"` : ''}>${s}</a>`;
          const h = safeHref(n.getAttribute('href')); return h && s.trim() ? `<a href="${esc(h)}">${s}</a>` : s;
        }
        case 'IMG': return o.img ? o.img(n.getAttribute('src') || '', n.getAttribute('alt') || '', n) || '' : '';
        case 'P': case 'DIV': case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': case 'LI': case 'TR': case 'BLOCKQUOTE': case 'SECTION': case 'ARTICLE': case 'FIGURE': case 'FIGCAPTION': { const s = kids(); return s + (s && !/<br>$/.test(s) ? '<br>' : ''); }
        case 'TD': case 'TH': { const s = kids(); return s + ' '; }
        default: return fmtWrap(n, kids());
      }
    }
    const trimBr = o.raw ? (s) => s : (s) => s.replace(/^(\s|<br>)+/, '').replace(/(\s|<br>)+$/, '').replace(/(<br>\s*){3,}/g, '<br><br>');
    const para = (s) => { s = trimBr(s); return `<p>${s || '<br>'}</p>`; };
    const hasText = (s) => s.replace(/<(?!img|div)[^>]*>/g, '').trim() !== '' || /<div/.test(s);

    function listItems(el, kind) {
      let items = '';
      for (const li of el.children) {
        if (li.tagName !== 'LI') { if (li.tagName === 'UL' || li.tagName === 'OL') items += `<li>${list(li)}</li>`; continue; }
        let buf = '', nested = '', done = false, any = false;
        const cb = li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]');
        if (cb) { done = cb.checked; any = true; }
        if (li.dataset && 'checked' in li.dataset) { done = li.dataset.checked === 'true'; any = true; }
        if (li.dataset && li.dataset.done) { done = true; any = true; }
        if (/task-list-item|checklist|todo/i.test(li.className || '')) any = true;
        for (const c of li.childNodes) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested += list(c);
          else if (c.nodeType === 1 && (c.tagName === 'P' || c.tagName === 'DIV') && !hasBlock(c)) { const s = inl(c); buf += (buf && !/<br>$/.test(buf) ? '<br>' : '') + s; }
          else if (c.nodeType === 1 && (c.tagName === 'P' || c.tagName === 'DIV' || c.tagName === 'BLOCKQUOTE')) { for (const d of c.childNodes) { if (d.nodeType === 1 && (d.tagName === 'UL' || d.tagName === 'OL')) nested += list(d); else buf += inl(d); } }
          else buf += inl(c);
        }
        buf = trimBr(buf);
        items += `<li${any && done ? ' data-done="1"' : ''}${any ? ' data-t="1"' : ''}>${buf || '<br>'}${nested}</li>`;
      }
      return items;
    }
    function list(el) {
      const tag = el.tagName === 'OL' ? 'ol' : 'ul'; let items = listItems(el, tag);
      let cls = '';
      if (tag === 'ul') {
        const c = el.className || '';
        if (/\bcheck\b/.test(c) || /contains-task-list|checklist|todo/i.test(c) || / data-t="1"/.test(items)) cls = 'check'; else if (/\bdash\b/.test(c)) cls = 'dash';
      }
      items = items.replace(/ data-t="1"/g, '');
      return `<${tag}${cls ? ` class="${cls}"` : ''}>${items}</${tag}>`;
    }
    function table(el) {
      let rows = ''; let n = 0;
      for (const tr of el.querySelectorAll('tr')) {
        if (tr.closest('table') !== el) continue; let cells = '';
        for (const td of tr.children) { if (!/^T[DH]$/.test(td.tagName)) continue; const t = td.tagName.toLowerCase(); cells += `<${t}>${trimBr(Array.from(td.childNodes).map((c) => inl(c)).join('')) || '<br>'}</${t}>`; }
        if (cells) { rows += `<tr>${cells}</tr>`; n++; }
      }
      return n ? `<table><tbody>${rows}</tbody></table>` : '';
    }
    // Blocks of a container. Handles Word/ENEX list paragraphs by grouping.
    function flow(parent) {
      let out = '', buf = '', pend = null;
      const flushBuf = () => { if (hasText(buf) || /<br>/.test(buf)) out += para(buf); buf = ''; };
      const flushList = () => { if (pend) { const t = pend.kind === 'ol' ? 'ol' : 'ul'; out += `<${t}${pend.kind === 'check' ? ' class="check"' : ''}>${pend.items.join('')}</${t}>`; pend = null; } };
      const addItem = (kind, html, done) => { if (pend && pend.kind !== kind) flushList(); (pend ||= { kind, items: [] }).items.push(`<li${done ? ' data-done="1"' : ''}>${trimBr(html) || '<br>'}</li>`); };
      for (const c of parent.childNodes) {
        if (c.nodeType === 3) { if (!pend || c.nodeValue.trim()) { flushList(); buf += inl(c); } continue; }
        if (c.nodeType !== 1) continue; const tag = c.tagName; if (SKIP.has(tag)) continue;
        const st = styleOf(c);
        // Word list paragraph / ENEX todo paragraph
        if ((tag === 'P' || tag === 'DIV') && !c.querySelector('p,div,ul,ol,table,img')) {
          const first = c.firstElementChild; const firstText = c.firstChild;
          if (/mso-list/.test(st) || /MsoListParagraph/i.test(c.className || '')) {
            flushBuf(); let h = inl(c); const num = /^\s*(\d+|[a-zA-Z])[.)]\s/.test(c.textContent.trim()) && !/^\s*[·•o§Ø\-–]\s/.test(c.textContent.trim());
            h = h.replace(/^(\s|&nbsp;)*(\d+|[a-zA-Z])[.)](\s|&nbsp;)+/, '').replace(/^(\s|&nbsp;)*[·•§Ø\-–o](\s|&nbsp;)+/, ''); addItem(num ? 'ol' : 'ul', h); continue;
          }
          const cbEl = isCheckbox(first) ? first : isCheckbox(firstText) ? firstText : null;
          if (cbEl) { flushBuf(); const clone = c.cloneNode(true); clone.querySelector('input').remove(); addItem('check', inl(clone), cbEl.checked); continue; }
        }
        flushList();
        if (tag === 'LI') { flushBuf(); addItem('ul', inl(c)); continue; }
        if (/^H[1-6]$/.test(tag)) { flushBuf(); const lv = Math.min(3, +tag[1]); const s = trimBr(inl(c)); if (s) out += `<h${lv}>${s}</h${lv}>`; continue; }
        if (tag === 'UL' || tag === 'OL') { flushBuf(); out += list(c); continue; }
        if (tag === 'BLOCKQUOTE') { flushBuf(); const inner = flow(c); out += `<blockquote>${inner || '<p><br></p>'}</blockquote>`; continue; }
        if (tag === 'PRE') { flushBuf(); const code = c.querySelector('code'); const lang = ((code && /language-(\w+)/.exec(code.className || '')) || /lang(?:uage)?-(\w+)/.exec(c.className || '') || [])[1] || c.dataset.lang || ''; out += `<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}>${esc(c.textContent.replace(/\n$/, ''))}</pre>`; continue; }
        if (tag === 'TABLE') { flushBuf(); out += table(c); continue; }
        if (tag === 'HR') { flushBuf(); out += '<hr>'; continue; }
        if (tag === 'IMG') { flushBuf(); const s = o.img ? o.img(c.getAttribute('src') || '', c.getAttribute('alt') || '', c) : ''; if (s) out += s; continue; }
        if (tag === 'DIV' && c.classList.contains('att')) { flushBuf(); if (c.dataset.att) out += CV.attHtml({ id: cleanId(c.dataset.att), name: c.dataset.name || 'Attachment', type: c.dataset.type || '', size: +c.dataset.size || 0 }); continue; }
        if (tag === 'DIV' && c.classList.contains('sketch')) { flushBuf(); out += `<div class="sketch" data-h="${+c.dataset.h || 320}" data-strokes="${esc(c.dataset.strokes || '[]')}"></div>`; continue; }
        if (tag === 'BR') { buf += '<br>'; continue; }
        if (/^(P|DIV|SECTION|ARTICLE|FIGURE|FIGCAPTION|HEADER|FOOTER|MAIN|NAV|ASIDE|ADDRESS|CENTER|DL|DD|DT|DETAILS|SUMMARY|BODY|HTML|FONT|SPAN)$/.test(tag) && (tag === 'DIV' || tag === 'P' || tag === 'FIGURE' || tag === 'FIGCAPTION' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'CENTER' || tag === 'DD' || tag === 'DT' || tag === 'DL' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'MAIN' || tag === 'NAV' || tag === 'ASIDE' || tag === 'ADDRESS' || tag === 'DETAILS' || tag === 'SUMMARY' || tag === 'BODY' || tag === 'HTML')) {
          flushBuf();
          if (hasBlock(c)) out += flow(c); else { const s = inl(c); if (hasText(s) || /<br>/.test(s)) out += para(s); else if (tag === 'P' || tag === 'DIV') out += '<p><br></p>'; }
          continue;
        }
        if (hasBlock(c) && tag !== 'A') { flushBuf(); out += flow(c); continue; }
        buf += inl(c);
      }
      flushList(); flushBuf(); return out;
    }
    let html = flow(root);
    if (!o.raw) html = html.replace(/(<p><br><\/p>){2,}/g, '<p><br></p>');
    return html || '<p><br></p>';
  };

  // ---------------------------------------------------------------- text extraction
  const BLK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE', 'PRE', 'TR', 'UL', 'OL', 'TABLE', 'HR', 'BR']);
  CV.textOf = (root) => {
    let s = '';
    const walk = (n) => {
      if (n.nodeType === 3) { s += n.nodeValue; return; } if (n.nodeType !== 1) return;
      if (n.classList && (n.classList.contains('sketch') || n.classList.contains('sk-ui'))) { if (n.classList.contains('sketch')) s += '\n'; return; }
      if (n.classList && n.classList.contains('att')) { s += (n.dataset.name || '') + '\n'; return; }
      for (const c of n.childNodes) walk(c);
      if (n.tagName === 'TD' || n.tagName === 'TH') s += '\t'; else if (BLK.has(n.tagName) && !/\n$/.test(s)) s += '\n'; else if (n.tagName === 'BR') s += '\n';
    };
    walk(root); return s.replace(/\u200b/g, '').replace(/\n{3,}/g, '\n\n').trim();
  };
  CV.textOfHtml = (html) => CV.textOf(parse(html).body);
  CV.tagsOf = (text) => { const set = new Set(); const re = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu; let m; while ((m = re.exec(text))) { const t = m[2].replace(/[-/]+$/, ''); if (t && !/^\d+$/.test(t)) set.add(t.toLowerCase()); } return [...set]; };
  CV.linksOf = (root) => [...new Set([...root.querySelectorAll('a[data-nt]')].map((a) => a.dataset.nt.toLowerCase()))];
  CV.deriveTitle = (text) => { const l = (text || '').split('\n').map((x) => x.trim()).find(Boolean) || ''; return l.length > 80 ? l.slice(0, 80) : l; };

  // ---------------------------------------------------------------- Markdown -> canonical HTML
  const inlineMd = (src) => {
    const stash = []; const put = (h) => '\u0001' + (stash.push(h) - 1) + '\u0002';
    let s = src;
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, (_, c) => put(esc(c)));
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, a, c) => put(`<code>${esc(c.trim())}</code>`));
    s = s.replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, alt, url) => put(`<img src="${esc(url.replace(/^<|>$/g, ''))}" alt="${esc(alt)}">`));
    s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_, t) => put(`<a href="#" data-nt="${esc(t.split('|')[0].trim())}">${esc((t.split('|')[1] || t).trim())}</a>`));
    s = s.replace(/\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, t, url) => put(`<a href="${esc(url.replace(/^<|>$/g, ''))}">${inlineMd(t)}</a>`));
    s = s.replace(/<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/g, (_, u) => put(`<a href="${esc(u)}">${esc(u)}</a>`));
    s = s.replace(/<(br\s*\/?|u|\/u)>/gi, (_, t) => put('<' + t.toLowerCase().replace(/\s*\/?$/, '') + '>'));
    s = s.replace(/\bhttps?:\/\/[^\s<>\u0001]+[^\s<>.,;:!?)\]'"\u0001]/g, (u) => put(`<a href="${esc(u)}">${esc(u)}</a>`));
    s = esc(s);
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>').replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<b>$2</b>');
    s = s.replace(/(^|[^*\w])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|[^\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/g, '$1<i>$2</i>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    return s.replace(/\u0001(\d+)\u0002/g, (_, i) => stash[+i]);
  };
  CV.mdToHtml = (text) => {
    const L = text.replace(/\r\n?/g, '\n').split('\n'); let i = 0; const out = [];
    const indentOf = (l) => { const m = /^[ \t]*/.exec(l)[0].replace(/\t/g, '    ').length; return m; };
    const isHr = (l) => /^ {0,3}([-*_])( ?\1){2,}\s*$/.test(l);
    const listRe = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-') && (l.includes('|') || false);
    const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    function block(lines) {
      const o = []; let k = 0;
      const para = [];
      const flushP = () => { if (para.length) { o.push(`<p>${inlineMd(para.join('\n').replace(/ {2,}\n/g, '<br>\n').replace(/\\\n/g, '<br>\n').replace(/\n/g, ' ')).replace(/&lt;br&gt;/g, '<br>')}</p>`); para.length = 0; } };
      while (k < lines.length) {
        const l = lines[k];
        if (!l.trim()) { flushP(); k++; continue; }
        let m;
        if ((m = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/.exec(l))) {
          flushP(); const fence = m[1]; const body = []; k++;
          while (k < lines.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[k])) body.push(lines[k++]); k++;
          o.push(`<pre class="code"${m[2] ? ` data-lang="${esc(m[2])}"` : ''}>${esc(body.join('\n'))}</pre>`); continue;
        }
        if ((m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { flushP(); const lv = Math.min(3, m[1].length); o.push(`<h${lv}>${inlineMd(m[2])}</h${lv}>`); k++; continue; }
        if (para.length && /^ {0,3}(=+|-+)\s*$/.test(l) && !isHr(l) || (para.length === 1 && /^ {0,3}=+\s*$/.test(l))) { const lv = l.trim()[0] === '=' ? 1 : 2; const t = para.join(' '); para.length = 0; o.push(`<h${lv}>${inlineMd(t)}</h${lv}>`); k++; continue; }
        if (isHr(l)) { flushP(); o.push('<hr>'); k++; continue; }
        if (/^ {0,3}>/.test(l)) { flushP(); const q = []; while (k < lines.length && (/^ {0,3}>/.test(lines[k]) || (lines[k].trim() && q.length && !/^\s*(#|```|[-*+] |\d+[.)] )/.test(lines[k])))) q.push(lines[k++].replace(/^ {0,3}> ?/, '')); o.push(`<blockquote>${block(q)}</blockquote>`); continue; }
        if (l.includes('|') && k + 1 < lines.length && isTableSep(lines[k + 1])) {
          flushP(); const head = splitRow(l); k += 2; const rows = [];
          while (k < lines.length && lines[k].trim() && lines[k].includes('|')) rows.push(splitRow(lines[k++]));
          const w = head.length; const cell = (t, tg) => `<${tg}>${inlineMd(t || '') || '<br>'}</${tg}>`;
          o.push(`<table><tbody><tr>${head.map((c) => cell(c, 'th')).join('')}</tr>${rows.map((r) => `<tr>${Array.from({ length: w }, (_, j) => cell(r[j], 'td')).join('')}</tr>`).join('')}</tbody></table>`); continue;
        }
        if ((m = listRe.exec(l)) && !isHr(l)) { flushP(); const items = []; while (k < lines.length) { const mm = listRe.exec(lines[k]); if (mm && items.length && indentOf(lines[k]) === items[0].ind && /\d/.test(mm[2][0]) !== /\d/.test(items[0].mk[0])) break; if (mm) items.push({ ind: indentOf(lines[k]), mk: mm[2], text: mm[3], extra: [] }); else if (lines[k].trim() && /^\s{2,}\S/.test(lines[k]) && items.length) items[items.length - 1].extra.push(lines[k].trim()); else if (!lines[k].trim() && k + 1 < lines.length && listRe.test(lines[k + 1])) { /* loose list */ } else break; k++; } o.push(buildList(items)); continue; }
        if (/^<(div|p|span|br|img|table|h[1-6]|ul|ol|pre|blockquote)\b/i.test(l.trim())) { flushP(); const h = []; while (k < lines.length && lines[k].trim()) h.push(lines[k++]); o.push(h.join('\n')); continue; }
        para.push(l.trim()); k++;
      }
      flushP(); return o.join('');
    }
    function buildList(items) {
      let p = 0;
      const rec = (ind) => {
        const first = items[p]; const ord = /\d/.test(first.mk[0]); let li = ''; let check = false;
        while (p < items.length && items[p].ind >= ind) {
          if (items[p].ind > ind) { li = li.replace(/<\/li>$/, '') + rec(items[p].ind) + '</li>'; continue; }
          const it = items[p++]; let t = it.text; let done = false, task = false; let m;
          if ((m = /^\[( |x|X)\]\s+(.*)$/.exec(t))) { task = true; done = m[1] !== ' '; t = m[2]; check = true; }
          t = [t, ...it.extra].join(' ');
          li += `<li${task && done ? ' data-done="1"' : ''}>${inlineMd(t) || '<br>'}</li>`;
          if (p < items.length && items[p].ind > ind) { li = li.replace(/<\/li>$/, '') + rec(items[p].ind) + '</li>'; }
        }
        const dash = !ord && /^-/.test(first.mk) && !check && false;
        return `<${ord ? 'ol' : 'ul'}${check ? ' class="check"' : dash ? ' class="dash"' : ''}>${li}</${ord ? 'ol' : 'ul'}>`;
      };
      return rec(items[0].ind);
    }
    // front matter
    let lines = L; let meta = {};
    if (lines[0] === '---') { const e = lines.indexOf('---', 1); if (e > 0 && lines.slice(1, e).every((x) => /^[\w-]+\s*:/.test(x) || /^\s+/.test(x) || !x.trim())) { for (const x of lines.slice(1, e)) { const m = /^([\w-]+)\s*:\s*(.*)$/.exec(x); if (m) meta[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, ''); } lines = lines.slice(e + 1); } }
    CV.lastMeta = meta;
    return block(lines);
  };

  // ---------------------------------------------------------------- canonical -> Markdown / HTML / text
  // ctx.att(el) -> Promise-free sync lookup of exported path (preloaded)
  const mdEsc = (t) => t.replace(/([\\`*_])/g, '\\$1').replace(/</g, '\\<');
  CV.toMd = (html, ctx = {}) => {
    const body = typeof html === 'string' ? parse(html).body : html;
    const inline = (n) => {
      let s = '';
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { s += mdEsc(c.nodeValue.replace(/\u200b/g, '')); continue; } if (c.nodeType !== 1) continue;
        const t = c.tagName, inner = () => inline(c);
        const wrap = (m) => { const x = inner(); const lead = /^\s*/.exec(x)[0], trail = /\s*$/.exec(x)[0]; const core = x.trim(); return core ? lead + m + core + m + trail : x; };
        if (t === 'B' || t === 'STRONG') s += wrap('**'); else if (t === 'I' || t === 'EM') s += wrap('*'); else if (t === 'S' || t === 'STRIKE' || t === 'DEL') s += wrap('~~');
        else if (t === 'U') s += `<u>${inner()}</u>`; else if (t === 'CODE') { const x = c.textContent; s += x.includes('`') ? '`` ' + x + ' ``' : '`' + x + '`'; }
        else if (t === 'BR') s += '  \n'; else if (t === 'A') { if (c.dataset.nt) s += `[[${c.dataset.nt}]]`; else s += `[${inner()}](${c.getAttribute('href') || ''})`; }
        else s += inner();
      }
      return s;
    };
    const blocks = (parent, ind = '') => {
      const out = [];
      for (const c of parent.children) {
        const t = c.tagName; let s = '';
        if (/^H[1-3]$/.test(t)) s = '#'.repeat(+t[1]) + ' ' + inline(c);
        else if (t === 'P' || t === 'DIV' && !c.classList.contains('att') && !c.classList.contains('sketch')) { s = inline(c).replace(/^(\s*)([#>+-]|\d+[.)])(\s)/, '$1\\$2$3'); if (!s.trim()) { s = ''; } }
        else if (t === 'UL' || t === 'OL') s = list(c, ind);
        else if (t === 'BLOCKQUOTE') s = blocks(c).split('\n').map((l) => '> ' + l).join('\n');
        else if (t === 'PRE') { const code = c.textContent; const fence = code.includes('```') ? '~~~' : '```'; s = fence + (c.dataset.lang || '') + '\n' + code + '\n' + fence; }
        else if (t === 'HR') s = '---';
        else if (t === 'TABLE') {
          const rows = [...c.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => inline(td).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()));
          const w = Math.max(...rows.map((r) => r.length)); const pad = (r) => Array.from({ length: w }, (_, j) => r[j] || '');
          s = '| ' + pad(rows[0]).join(' | ') + ' |\n|' + ' --- |'.repeat(w) + rows.slice(1).map((r) => '\n| ' + pad(r).join(' | ') + ' |').join('');
        } else if (c.classList.contains('att')) { const p = ctx.att && ctx.att(c); const nm = c.dataset.name || 'attachment'; s = p ? (c.classList.contains('img') ? `![${nm}](${encodeURI(p)})` : `[${nm}](${encodeURI(p)})`) : `[${nm}]`; }
        else if (c.classList.contains('sketch')) { const p = ctx.att && ctx.att(c); s = p ? `![Sketch](${encodeURI(p)})` : ''; }
        out.push(s);
      }
      return out.join('\n\n').replace(/\n{3,}/g, '\n\n');
    };
    const list = (el, ind) => {
      const ord = el.tagName === 'OL'; const chk = el.classList.contains('check'); let n = 1; const lines = [];
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue; const clone = li.cloneNode(true); const nested = [...clone.querySelectorAll(':scope > ul, :scope > ol')]; nested.forEach((x) => x.remove());
        const mk = chk ? (li.hasAttribute('data-done') ? '- [x] ' : '- [ ] ') : ord ? n++ + '. ' : '- ';
        lines.push(ind + mk + inline(clone).replace(/\n/g, '\n' + ind + '  ').trim());
        for (const nl of nested) lines.push(list(nl, ind + (ord ? '   ' : '  ')));
      }
      return lines.join('\n');
    };
    return blocks(body).trim() + '\n';
  };

  CV.toText = (html) => {
    const body = typeof html === 'string' ? parse(html).body : html;
    const inline = (n) => CV.textOf(n).replace(/\n+/g, ' ');
    const blocks = (parent, ind = '') => {
      const out = [];
      for (const c of parent.children) {
        const t = c.tagName;
        if (t === 'UL' || t === 'OL') out.push(list(c, ind));
        else if (t === 'TABLE') out.push([...c.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).join('\t')).join('\n'));
        else if (t === 'BLOCKQUOTE') out.push(blocks(c).split('\n').map((l) => '  ' + l).join('\n'));
        else if (t === 'HR') out.push('----------');
        else if (t === 'PRE') out.push(c.textContent);
        else if (c.classList.contains('att')) out.push('[' + (c.dataset.name || 'attachment') + ']');
        else if (c.classList.contains('sketch')) out.push('[Sketch]');
        else out.push(CV.textOf(c));
      }
      return out.join('\n\n');
    };
    const list = (el, ind) => {
      const ord = el.tagName === 'OL'; const chk = el.classList.contains('check'); const dash = el.classList.contains('dash'); let n = 1; const lines = [];
      for (const li of el.children) {
        const clone = li.cloneNode(true); const nested = [...clone.querySelectorAll(':scope > ul, :scope > ol')]; nested.forEach((x) => x.remove());
        lines.push(ind + (chk ? (li.hasAttribute('data-done') ? '[x] ' : '[ ] ') : ord ? n++ + '. ' : dash ? '- ' : '• ') + CV.textOf(clone).replace(/\n+/g, ' '));
        for (const nl of nested) lines.push(list(nl, ind + '   '));
      }
      return lines.join('\n');
    };
    return blocks(body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };

  CV.CSS = `body{font:16px/1.55 Geist,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1d1d1f}h1.title{font-size:2em;margin:.2em 0 .6em}h1{font-size:1.6em}h2{font-size:1.3em}h3{font-size:1.1em}img{max-width:100%;border-radius:6px}pre{background:#f5f5f7;padding:12px 14px;border-radius:8px;overflow:auto;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap}code{font:.9em ui-monospace,Menlo,monospace;background:#f1f1f3;padding:1px 4px;border-radius:4px}pre code{background:none;padding:0}blockquote{margin:1em 0;padding-left:14px;border-left:3px solid #d0d0d5;color:#555}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #d0d0d5;padding:6px 10px;min-width:60px}th{background:#f5f5f7}hr{border:0;border-top:1px solid #d0d0d5;margin:1.5em 0}ul.check{list-style:none;padding-left:4px}ul.check li:before{content:"\\2610  "}ul.check li[data-done]:before{content:"\\2611  "}ul.check li[data-done]{color:#888;text-decoration:line-through}ul.dash{list-style:none}ul.dash li:before{content:"\\2013  ";margin-left:-1.1em}.tk-kw{color:#a626a4}.tk-str{color:#50a14f}.tk-com{color:#999;font-style:italic}.tk-num{color:#986801}.tk-fn{color:#4078f2}.att.file{display:inline-block;padding:6px 10px;border:1px solid #d0d0d5;border-radius:8px;margin:4px 0}`;
  // Build a self-contained HTML document. ctx.dataUrl(el) -> data URL or ''
  CV.toHtmlDoc = (title, html, ctx = {}) => {
    const body = typeof html === 'string' ? parse(html).body : html; const d = body.ownerDocument;
    for (const el of [...body.querySelectorAll('.att, .sketch')]) {
      if (el.classList.contains('sketch')) { const u = ctx.dataUrl && ctx.dataUrl(el); const im = d.createElement(u ? 'img' : 'span'); if (u) { im.src = u; im.alt = 'Sketch'; } el.replaceWith(im); continue; }
      const u = ctx.dataUrl && ctx.dataUrl(el);
      if (el.classList.contains('img') && u) { const im = d.createElement('img'); im.src = u; im.alt = el.dataset.name || ''; el.replaceWith(im); }
      else { const sp = d.createElement('div'); sp.className = 'att file'; sp.textContent = (el.dataset.name || 'Attachment') + (el.dataset.size ? ' (' + U.size(+el.dataset.size) + ')' : ''); if (u && ctx.linkFiles) { const a = d.createElement('a'); a.href = u; a.download = el.dataset.name || 'file'; a.textContent = sp.textContent; sp.textContent = ''; sp.append(a); } el.replaceWith(sp); }
    }
    for (const pre of body.querySelectorAll('pre.code')) { pre.innerHTML = N.hl.html(pre.textContent, pre.dataset.lang); }
    for (const li of body.querySelectorAll('li')) if (li.parentElement.tagName === 'UL' && !li.parentElement.classList.contains('check')) li.removeAttribute('data-done');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="generator" content="ZengNotes"><title>${esc(title)}</title><style>${CV.CSS}</style></head><body><h1 class="title">${esc(title)}</h1>${body.innerHTML}</body></html>`;
  };

  // ---------------------------------------------------------------- importers (return drafts)
  // draft: {title, html, created, modified, tags[], folder (name|null), pinned, files:[{id,name,type,bytes}]}
  const mkCtx = (resolve) => { const files = []; const byKey = new Map(); return { files, img: (src, alt) => {
    let f = null; if (/^data:/i.test(src)) { const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(src); if (m) { try { const bytes = m[2] ? U.unb64(m[3].replace(/\s/g, '')) : new TextEncoder().encode(decodeURIComponent(m[3])); const type = m[1] || 'image/png'; f = { name: (alt || 'image') + '.' + U.extOfMime(type), type, bytes }; } catch {} } }
    else if (resolve) f = resolve(src, alt);
    if (!f) return alt ? esc(alt) : '';
    const key = f.key || src; let a = byKey.get(key);
    if (!a) { a = { id: U.uid() + files.length, name: f.name, type: f.type || U.mimeOf(f.name), bytes: f.bytes }; files.push(a); byKey.set(key, a); }
    return CV.attHtml({ id: a.id, name: a.name, type: a.type, size: a.bytes.length });
  } }; };
  CV.mkCtx = mkCtx;

  CV.importMarkdown = (text, name, resolve) => {
    const ctx = mkCtx(resolve); let html = CV.mdToHtml(text); const meta = CV.lastMeta || {};
    let title = meta.title || '';
    html = CV.clean(html, { img: ctx.img });
    if (!title) { const m = /^<h1>(.*?)<\/h1>/.exec(html); if (m) { title = U.plain(m[1]); html = html.slice(m[0].length) || '<p><br></p>'; } }
    return { title: title || U.base(name), html, files: ctx.files, tags: meta.tags ? meta.tags.replace(/[\[\]]/g, '').split(/[,\s]+/).filter(Boolean) : [], created: Date.parse(meta.date || meta.created || '') || 0, modified: Date.parse(meta.updated || meta.modified || '') || 0 };
  };
  CV.importText = (text, name) => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n'); let title = ''; let i = 0; while (i < lines.length && !lines[i].trim()) i++;
    const html = lines.slice(i).map((l) => `<p>${l.trim() ? esc(l.replace(/\s+$/, '')) : '<br>'}</p>`).join('') || '<p><br></p>';
    title = U.base(name); return { title, html, files: [], tags: [] };
  };
  CV.importHtml = (text, name, resolve) => {
    const ctx = mkCtx(resolve); const d = parse(text); let title = (d.title || '').trim();
    d.querySelectorAll('o\\:p').forEach((e) => e.replaceWith(...e.childNodes));
    const html = CV.clean(d.body, { img: ctx.img });
    let t = title; let h = html; const m = /^<h1>(.*?)<\/h1>/.exec(h); if (!t && m) { t = U.plain(m[1]); h = h.slice(m[0].length) || '<p><br></p>'; } else if (t && m && U.plain(m[1]).trim() === t) h = h.slice(m[0].length) || '<p><br></p>';
    return { title: t || U.base(name), html: h, files: ctx.files, tags: [] };
  };

  const enTime = (s) => { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z?$/.exec((s || '').trim()); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; };
  CV.importEnex = (text) => {
    const x = new DOMParser().parseFromString(text, 'text/xml'); if (x.querySelector('parsererror') && !x.querySelector('note')) throw new Error('Not a valid ENEX file');
    const drafts = [];
    for (const n of x.getElementsByTagName('note')) {
      const g = (t) => { const e = [...n.children].find((c) => c.tagName === t); return e ? e.textContent : ''; };
      const res = []; for (const r of n.children) if (r.tagName === 'resource') {
        const d = [...r.children].find((c) => c.tagName === 'data'); if (!d) continue; let bytes; try { bytes = U.unb64(d.textContent.replace(/\s/g, '')); } catch { continue; }
        const mime = ([...r.children].find((c) => c.tagName === 'mime') || {}).textContent || 'application/octet-stream';
        const at = [...r.children].find((c) => c.tagName === 'resource-attributes'); const fn = at && [...at.children].find((c) => c.tagName === 'file-name');
        res.push({ bytes, name: (fn && fn.textContent) || 'attachment.' + U.extOfMime(mime), type: mime, hash: U.md5(bytes) });
      }
      let enml = g('content').replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/i, '');
      enml = enml.replace(/<en-todo\b([^>]*?)\/?>/g, (_, a) => `<input type="checkbox"${/checked\s*=\s*"true"/.test(a) ? ' checked' : ''}>`);
      let seq = 0; const used = new Set();
      enml = enml.replace(/<en-media\b([^>]*?)\/?>(\s*<\/en-media>)?/g, (_, a) => { const h = (/hash\s*=\s*"([0-9a-f]+)"/i.exec(a) || [])[1]; return `<img src="en-media:${h || ''}" alt="${seq++}">`; });
      const ctx = mkCtx((src, alt) => { const h = src.slice(9); let r = res.find((q) => q.hash === h) || res[+alt]; if (!r) return null; used.add(r); return { name: r.name, type: r.type, bytes: r.bytes, key: r.hash }; });
      const d = parse(enml); let html = CV.clean(d.body, { img: ctx.img });
      for (const r of res) if (!used.has(r)) html += ctx.img('en-media:' + r.hash, '') ;
      const tags = [...n.children].filter((c) => c.tagName === 'tag').map((c) => c.textContent.trim().replace(/\s+/g, '-')).filter(Boolean);
      drafts.push({ title: g('title').trim() || 'Untitled', html: html || '<p><br></p>', files: ctx.files, tags, created: enTime(g('created')), modified: enTime(g('updated')) });
    }
    return drafts;
  };

  CV.importKeep = (json, lookup) => {
    const j = typeof json === 'string' ? JSON.parse(json) : json; if (typeof j !== 'object' || !j || !('userEditedTimestampUsec' in j || 'textContent' in j || 'listContent' in j || 'title' in j)) throw new Error('Not a Takeout note file');
    const ctx = mkCtx((src) => lookup && lookup(src)); let html = '';
    if (Array.isArray(j.listContent) && j.listContent.length) html += `<ul class="check">${j.listContent.map((it) => `<li${it.isChecked ? ' data-done="1"' : ''}>${esc(it.text || '') || '<br>'}</li>`).join('')}</ul>`;
    if (j.textContent) html += j.textContent.split('\n').map((l) => `<p>${l.trim() ? esc(l) : '<br>'}</p>`).join('');
    for (const a of j.attachments || []) { const s = ctx.img(a.filePath || '', a.filePath || 'attachment'); if (s) html += s; }
    for (const a of j.annotations || []) if (a.url) html += `<p><a href="${esc(a.url)}">${esc(a.title || a.url)}</a></p>`;
    const tags = (j.labels || []).map((l) => (l.name || '').trim().replace(/\s+/g, '-')).filter(Boolean);
    return { title: j.title || '', html: html || '<p><br></p>', files: ctx.files, tags, created: Math.floor((j.createdTimestampUsec || 0) / 1000), modified: Math.floor((j.userEditedTimestampUsec || 0) / 1000), pinned: !!j.isPinned, trashed: !!j.isTrashed, archived: !!j.isArchived };
  };

  // .docx (Word export)  best effort
  CV.importDocx = (bytes, name) => {
    const z = fflate.unzipSync(bytes); const doc = z['word/document.xml']; if (!doc) throw new Error('Not a Word document');
    const rels = {}; const rx = z['word/_rels/document.xml.rels']; if (rx) { const rd = new DOMParser().parseFromString(fflate.strFromU8(rx), 'text/xml'); for (const r of rd.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') }; }
    const xd = new DOMParser().parseFromString(fflate.strFromU8(doc), 'text/xml'); const W = (n, t) => [...n.children].filter((c) => c.localName === t); const first = (n, t) => W(n, t)[0];
    const ctx = mkCtx(); const imgOf = (rid) => { const r = rels[rid]; if (!r) return ''; const p = r.target.replace(/^\//, ''); const f = z[p.startsWith('word/') ? p : 'word/' + p]; if (!f) return ''; const nm = p.split('/').pop(); return ctx.img('x:' + p, '', null) || ''; };
    // image resolver needs bytes: override
    const imgHtml = (rid) => { const r = rels[rid]; if (!r) return ''; const p = r.target.replace(/^\//, ''); const f = z[p.startsWith('word/') ? p : 'word/' + p]; if (!f) return ''; const nm = p.split('/').pop(); const type = U.mimeOf(nm); const id = U.uid() + ctx.files.length; ctx.files.push({ id, name: nm, type, bytes: f }); return CV.attHtml({ id, name: nm, type, size: f.length }); };
    const on = (n) => { const v = first(n, 'b'); return v && v.getAttribute('w:val') !== '0' && v.getAttribute('w:val') !== 'false'; };
    const flag = (rpr, t) => { if (!rpr) return false; const v = first(rpr, t); if (!v) return false; const val = v.getAttribute('w:val'); return val !== '0' && val !== 'false' && val !== 'none'; };
    function runs(p) {
      let s = '', imgs = '';
      const walk = (n) => { for (const c of n.children) {
        if (c.localName === 'r') {
          const rpr = first(c, 'rPr'); let t = '';
          for (const k of c.children) { if (k.localName === 't') t += esc(k.textContent); else if (k.localName === 'tab') t += ' '; else if (k.localName === 'br') t += '<br>'; else if (k.localName === 'drawing' || k.localName === 'pict') { const bl = k.getElementsByTagName('a:blip')[0] || [...k.getElementsByTagName('*')].find((e) => e.localName === 'blip'); if (bl) imgs += imgHtml(bl.getAttribute('r:embed')); } }
          if (t && rpr) { if (flag(rpr, 'b')) t = `<b>${t}</b>`; if (flag(rpr, 'i')) t = `<i>${t}</i>`; if (flag(rpr, 'u')) t = `<u>${t}</u>`; if (flag(rpr, 'strike')) t = `<s>${t}</s>`; const rf = first(rpr, 'rFonts'); if (rf && /courier|consolas|mono/i.test(rf.getAttribute('w:ascii') || '')) t = `<code>${t}</code>`; }
          s += t;
        } else if (c.localName === 'hyperlink') { const rid = c.getAttribute('r:id'); const inner = runs(c); const h = rid && rels[rid] ? safeHref(rels[rid].target) : ''; s += h ? `<a href="${esc(h)}">${inner.s}</a>` : inner.s; imgs += inner.imgs; }
        else if (c.localName === 'ins' || c.localName === 'smartTag' || c.localName === 'sdt' || c.localName === 'sdtContent') walk(c);
      } };
      walk(p); return { s, imgs };
    }
    let out = '', pend = null; const flush = () => { if (pend) { out += `<${pend.t}>${pend.items.join('')}</${pend.t}>`; pend = null; } };
    const body = [...xd.getElementsByTagName('*')].find((e) => e.localName === 'body');
    const doP = (p) => {
      const ppr = first(p, 'pPr'); const st = ppr && first(ppr, 'pStyle'); const sid = st ? st.getAttribute('w:val') : ''; const num = ppr && first(ppr, 'numPr');
      const { s, imgs } = runs(p);
      if (num && first(num, 'numId') && first(num, 'numId').getAttribute('w:val') !== '0') { const lvl = first(num, 'ilvl'); const nm = /number|decimal|\d/i.test(sid) ? 'ol' : 'ul'; if (pend && pend.t !== nm) flush(); (pend ||= { t: nm, items: [] }).items.push(`<li>${s || '<br>'}</li>`); out += ''; if (imgs) { flush(); out += imgs; } return; }
      flush();
      const hm = /^(?:Heading|heading)\s?(\d)$/.exec(sid) || (/^Title$/i.test(sid) ? [0, 1] : null);
      if (hm) { const lv = Math.min(3, +hm[1]); if (s.replace(/<[^>]+>/g, '').trim()) out += `<h${lv}>${s}</h${lv}>`; } else if (/quote/i.test(sid)) out += `<blockquote><p>${s}</p></blockquote>`; else out += (s.trim() || !imgs ? `<p>${s || '<br>'}</p>` : '');
      out += imgs;
    };
    const doTbl = (t) => { flush(); let rows = ''; for (const tr of W(t, 'tr')) { let cells = ''; for (const tc of W(tr, 'tc')) cells += `<td>${W(tc, 'p').map((p) => runs(p).s).join('<br>') || '<br>'}</td>`; rows += `<tr>${cells}</tr>`; } out += `<table><tbody>${rows}</tbody></table>`; };
    for (const n of body.children) { if (n.localName === 'p') doP(n); else if (n.localName === 'tbl') doTbl(n); }
    flush();
    let html = CV.clean(out, {}); let title = ''; const m = /^<h1>(.*?)<\/h1>/.exec(html); if (m) { title = U.plain(m[1]); html = html.slice(m[0].length) || '<p><br></p>'; }
    return { title: title || U.base(name), html, files: ctx.files, tags: [] };
  };
})();
