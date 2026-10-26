/* ZengGrid IO: .znumbers container, HTML/JSON export, clipboard helpers, open() dispatcher. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const IO = ZN.io || (ZN.io = {}); const U = IO._u; const FM = ZN.formula;
  const MAXR = ZN.MAXR, MAXC = ZN.MAXC;
  const MIME = 'application/vnd.zengbot.numbers+zip';

  // ===================== .znumbers =====================
  const README = [
    'ZengGrid workbook (.znumbers)', '================================', '',
    'This file is a standard ZIP archive. Contents:', '',
    '  mimetype       application/vnd.zengbot.numbers+zip (stored, first entry)',
    '  meta.json      {format:"znumbers", version, app, created, modified}',
    '  workbook.json  the whole workbook: styles table, defined names, sheets.',
    '                 Each sheet has "rows": {rowIndex: [[col, value, formula|null, styleIndex|null], ...]}',
    '                 plus sheet metadata (column widths, merges, freeze panes, conditional formats,',
    '                 data validation, tables, charts, sparklines). Indexes are 0-based.',
    '                 Error values are stored as {"e":"#DIV/0!"}; formulas are stored without "=".',
    '  thumbnail.png  optional preview image', '',
    'Any ZIP tool can open it; the JSON is plain UTF-8 text. Free and open (MIT) - https://zengbot.com/suite', ''].join('\n');
  const znumbers = IO.znumbers = {};
  znumbers.write = (wb, o = {}) => {
    const now = new Date().toISOString(); const created = (wb.props && wb.props.created) || now;
    const j = wb.toJSON(); j.props = Object.assign({}, j.props, { created, modified: now });
    const meta = { format: 'znumbers', version: 1, app: 'ZengGrid', created, modified: now };
    const f = { mimetype: [U.utf8Enc(MIME), { level: 0 }], 'meta.json': U.utf8Enc(JSON.stringify(meta, null, 2)), 'workbook.json': U.utf8Enc(JSON.stringify(j)), 'README.txt': U.utf8Enc(README) };
    let th = o.thumbnail; if (typeof th === 'string') { const m = /^data:image\/png;base64,(.*)$/.exec(th); th = m ? U.b64decode(m[1]) : null; }
    if (th instanceof Uint8Array) f['thumbnail.png'] = [th, { level: 0 }];
    return fflate.zipSync(f, { level: 6 });
  };
  znumbers.read = (input) => {
    let files; try { files = fflate.unzipSync(U.toU8(input)); } catch (e) { throw new Error('This is not a valid .znumbers file (not a zip archive): ' + (e && e.message || e)); }
    if (!files['workbook.json']) throw new Error('This is not a valid .znumbers file: workbook.json is missing');
    if (files.mimetype && U.utf8(files.mimetype).trim() !== MIME) throw new Error('Unexpected file type "' + U.utf8(files.mimetype).trim() + '" (expected ' + MIME + ')');
    if (files['meta.json']) { let m; try { m = JSON.parse(U.utf8(files['meta.json'])); } catch (e) { throw new Error('Corrupt meta.json: ' + e.message); } if (m.format !== 'znumbers') throw new Error('Not a ZengNumbers file (format "' + m.format + '")'); if (typeof m.version === 'number' && m.version > 1) throw new Error('This file was saved by a newer version of ZengNumbers (format version ' + m.version + '); please update the app'); }
    let j; try { j = JSON.parse(U.utf8(files['workbook.json'])); } catch (e) { throw new Error('Corrupt workbook.json: ' + e.message); }
    if (!j || !Array.isArray(j.sheets) || !j.sheets.length) throw new Error('Corrupt workbook.json: no sheets');
    if (j.format && j.format !== 'znumbers') throw new Error('Not a ZengGrid workbook (format "' + j.format + '")');
    if (typeof j.version === 'number' && j.version > 1) throw new Error('Unsupported workbook version ' + j.version);
    return ZN.Workbook.fromJSON(j);
  };

  // ===================== HTML table generation =====================
  const BW = { thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', hair: '1px dotted', mediumDashed: '2px dashed', dashDot: '1px dashed', mediumDashDot: '2px dashed', dashDotDot: '1px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed' };
  function cssOf(s, withBorders) {
    if (!s) return ''; const p = [];
    if (s.fn) p.push("font-family:'" + String(s.fn).replace(/['";<>]/g, '') + "'"); if (s.fs) p.push('font-size:' + s.fs + 'pt');
    if (s.b) p.push('font-weight:700'); if (s.i) p.push('font-style:italic');
    const td = []; if (s.u) td.push('underline'); if (s.k) td.push('line-through'); if (td.length) p.push('text-decoration:' + td.join(' '));
    if (/^#[0-9a-f]{6}$/i.test(s.fc || '')) p.push('color:' + s.fc); if (/^#[0-9a-f]{6}$/i.test(s.bg || '')) p.push('background:' + s.bg);
    if (s.ha) p.push('text-align:' + (s.ha === 'centerAcross' ? 'center' : s.ha === 'fill' ? 'left' : s.ha)); if (s.va) p.push('vertical-align:' + s.va); p.push(s.wr ? 'white-space:normal' : 'white-space:nowrap');
    if (s.ind) p.push('padding-left:' + (s.ind * 9 + 3) + 'px');
    if (withBorders !== false) for (const [k, side] of [['bl', 'left'], ['br', 'right'], ['bt', 'top'], ['bb', 'bottom']]) { if (!s[k]) continue; const m = /^(\w+)\s*(#[0-9a-fA-F]{6})?/.exec(s[k]); if (m && BW[m[1]]) p.push('border-' + side + ':' + BW[m[1]] + ' ' + (m[2] || '#000000')); }
    return p.join(';');
  }
  function tableHtml(sheet, r1, c1, r2, c2, o = {}) {
    const wb = sheet.wb; const merges = (sheet.merges || []); const skip = new Set(); const span = new Map();
    for (const m of merges) { if (m[0] > r2 || m[2] < r1 || m[1] > c2 || m[3] < c1) continue; const k = m[0] + ',' + m[1]; span.set(k, m); for (let r = m[0]; r <= m[2]; r++) for (let c = m[1]; c <= m[3]; c++) if (r !== m[0] || c !== m[1]) skip.add(r + ',' + c); }
    const cols = []; for (let c = c1; c <= c2; c++) if (!sheet.hiddenCols[c]) cols.push(c);
    let out = '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"' + (o.id ? ' data-sheet="' + U.escA(o.id) + '"' : '') + '>';
    if (o.widths !== false) out += '<colgroup>' + cols.map((c) => '<col style="width:' + Math.round(sheet.colWidth(c)) + 'px">').join('') + '</colgroup>';
    for (let r = r1; r <= r2; r++) {
      if (sheet.hiddenRows[r]) continue; const h = sheet.rowH[r]; out += '<tr' + (h ? ' style="height:' + Math.round(h * 0.75 * 100) / 100 + 'pt"' : '') + '>';
      for (const c of cols) {
        if (skip.has(r + ',' + c)) continue; const cell = sheet.getCell(r, c); const sid = sheet.styleId(r, c); const st = sid ? wb.style(sid) : null; const nf = st && st.nf;
        const m = span.get(r + ',' + c); let attrs = '';
        if (m) { const cs = cols.filter((x) => x >= m[1] && x <= m[3]).length; let rs = 0; for (let x = m[0]; x <= m[2]; x++) if (!sheet.hiddenRows[x]) rs++; if (cs > 1) attrs += ' colspan="' + cs + '"'; if (rs > 1) attrs += ' rowspan="' + rs + '"'; }
        let txt = '', v = cell ? cell.v : undefined;
        if (v !== undefined && v !== null) txt = U.fmtText(v, nf);
        if (o.excel && cell) { if (typeof v === 'number') attrs += ' x:num="' + v + '"'; else if (typeof v === 'boolean') attrs += ' x:bool="' + (v ? 'TRUE' : 'FALSE') + '"'; else if (v instanceof ZN.ZErr) attrs += ' x:err="' + v.code + '"'; if (cell.f !== undefined) attrs += ' x:fmla="=' + U.escA(cell.f) + '"'; }
        let css = cssOf(st, true); if (nf && nf !== 'General' && o.excel) css += (css ? ';' : '') + 'mso-number-format:' + '"' + String(nf).replace(/"/g, '\\0022') + '"';
        if (!st || !st.ha) { if (typeof v === 'number' || (v instanceof ZN.ZErr) || typeof v === 'boolean') css += (css ? ';' : '') + 'text-align:' + (typeof v === 'number' ? 'right' : 'center'); }
        out += '<td' + attrs + (css ? ' style="' + U.escA(css) + '"' : '') + '>' + U.esc(txt).replace(/\r?\n/g, '<br>') + '</td>';
      }
      out += '</tr>';
    }
    return out + '</table>';
  }
  const html = IO.html = {};
  html.write = (src, o = {}) => {
    const wb = src.sheets ? src : src.wb; const list = src.sheets ? (o.sheetIndex != null ? [wb.sheets[o.sheetIndex]] : wb.sheets) : [src];
    const title = (wb.props && wb.props.title) || 'Workbook';
    let body = '';
    for (const sh of list) {
      const rows = sh.maxRow(), cols = sh.maxCol(); if (list.length > 1) body += '<h2>' + U.esc(sh.name) + '</h2>';
      body += rows < 0 ? '<p><em>(empty sheet)</em></p>' : tableHtml(sh, 0, 0, rows, cols, { id: sh.name });
    }
    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>' + U.esc(title) + '</title><style>body{font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:24px;color:#111}h2{font-size:16px;margin:28px 0 8px}table{border-collapse:collapse}td{padding:2px 6px;border:1px solid #e1e1e1;height:20px}</style></head><body>\n' + body + '\n</body></html>\n';
  };

  // ===================== JSON =====================
  const json = IO.json = {};
  function sheetMatrix(sh, formatted) {
    const R = sh.maxRow(), C = sh.maxCol(); const out = [];
    for (let r = 0; r <= R; r++) { const row = []; for (let c = 0; c <= C; c++) { const x = sh.getCell(r, c); let v = x ? x.v : null; if (v === undefined) v = null; if (v instanceof ZN.ZErr) v = v.code; else if (formatted && v !== null) { const sid = sh.styleId(r, c); v = U.fmtText(v, sid ? sh.wb.style(sid).nf : null); } row.push(v); } out.push(row); }
    return out;
  }
  json.write = (wb, o = {}) => {
    const mode = o.mode || 'records'; const pretty = o.pretty === false ? 0 : 2; const f = !!o.formatted;
    const pick = () => (o.sheetIndex != null ? wb.sheets[o.sheetIndex] : wb.sheets[wb.active] || wb.sheets[0]);
    if (mode === 'workbook') { const sheets = {}; for (const sh of wb.sheets) sheets[sh.name] = sheetMatrix(sh, f); return JSON.stringify({ sheets }, null, pretty); }
    const m = sheetMatrix(pick(), f);
    if (mode === 'matrix') return JSON.stringify(m, null, pretty);
    if (!m.length) return '[]';
    const seen = new Map(); const keys = m[0].map((h, i) => { let k = h === null || h === '' ? 'Column ' + (i + 1) : String(h); const n = seen.get(k) || 0; seen.set(k, n + 1); return n ? k + '_' + (n + 1) : k; });
    return JSON.stringify(m.slice(1).map((row) => { const ob = {}; keys.forEach((k, i) => { ob[k] = row[i] === undefined ? null : row[i]; }); return ob; }), null, pretty);
  };

  // ===================== clipboard =====================
  const clip = IO.clip = {};
  const visCols = (sh, c1, c2) => { const o = []; for (let c = c1; c <= c2; c++) if (!sh.hiddenCols[c]) o.push(c); return o; };
  const clampRows = (sh, r1, r2) => (r2 - r1 > 200000 ? Math.max(r1, Math.min(r2, sh.maxRow())) : r2);
  clip.toTSV = (sh, r1, c1, r2, c2) => {
    r2 = clampRows(sh, r1, r2); const cols = visCols(sh, c1, c2); const lines = [];
    for (let r = r1; r <= r2; r++) {
      if (sh.hiddenRows[r]) continue; const parts = [];
      for (const c of cols) { const x = sh.getCell(r, c); let t = ''; if (x && x.v !== undefined && x.v !== null) { const sid = sh.styleId(r, c); t = U.fmtText(x.v, sid ? sh.wb.style(sid).nf : null); } parts.push(/[\t\r\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); }
      lines.push(parts.join('\t'));
    }
    return lines.join('\n');
  };
  clip.fromTSV = (text) => {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/\r?\n$/, '');
    if (text === '') return [['']];
    return IO.csv.parseText(text, '\t');
  };
  clip.toHTML = (sh, r1, c1, r2, c2) => {
    r2 = clampRows(sh, r1, r2);
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="Generator" content="ZengNumbers"></head><body><!--StartFragment-->' + tableHtml(sh, r1, c1, r2, c2, { excel: true }) + '<!--EndFragment--></body></html>';
  };

  // ---- HTML table scanner ----
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', euro: '€', pound: '£', yen: '¥', cent: '¢', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', times: '×', divide: '÷', plusmn: '±', middot: '·', bull: '•', trade: '™' };
  const decodeEnt = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (m, e) => { if (e[0] === '#') { try { return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)); } catch (x) { return ''; } } return NAMED[e] !== undefined ? NAMED[e] : NAMED[e.toLowerCase()] !== undefined ? NAMED[e.toLowerCase()] : m; }));
  function htmlAttrs(s) {
    const a = {}; const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g; let m;
    while ((m = re.exec(s))) a[m[1].toLowerCase()] = decodeEnt(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '');
    return a;
  }
  function decls(s) { const o = {}; if (!s) return o; for (const d of s.split(';')) { const k = d.indexOf(':'); if (k < 0) continue; o[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim(); } return o; }
  const NAMED_COLORS = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080', silver: '#c0c0c0', orange: '#ffa500', purple: '#800080', navy: '#000080', teal: '#008080', maroon: '#800000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', olive: '#808000', windowtext: '#000000', window: '#ffffff' };
  function cssColor(v) {
    if (!v) return null; v = v.trim().toLowerCase(); let m;
    if ((m = /^#([0-9a-f]{6})$/.exec(v))) return '#' + m[1]; if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v))) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if ((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v))) return '#' + [m[1], m[2], m[3]].map((x) => ('0' + Math.min(255, +x).toString(16)).slice(-2)).join('');
    return NAMED_COLORS[v] || null;
  }
  const toPx = (v) => { const m = /^(-?[\d.]+)(px|pt|em|cm|mm|in)?$/.exec((v || '').trim()); if (!m) return null; const n = +m[1]; switch (m[2]) { case 'pt': return n * 4 / 3; case 'cm': return n * 37.8; case 'mm': return n * 3.78; case 'in': return n * 96; case 'em': return n * 16; default: return n; } };
  function borderOf(v) {
    if (!v || /\bnone\b|\bhidden\b/.test(v)) return null; const parts = v.trim().split(/\s+(?![^(]*\))/); let w = 1, style = 'solid', color = '#000000';
    for (const p of parts) { if (/^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(p)) style = p; else if (/^(thin|medium|thick)$/.test(p)) w = p === 'thin' ? 1 : p === 'medium' ? 2 : 3; else { const px = toPx(p); if (px !== null) w = px; else { const c = cssColor(p); if (c) color = c; } } }
    let name = style === 'double' ? 'double' : style === 'dashed' ? (w >= 2 ? 'mediumDashed' : 'dashed') : style === 'dotted' ? 'dotted' : w <= 1.6 ? 'thin' : w <= 2.6 ? 'medium' : 'thick';
    return name + ' ' + color;
  }
  function decodeNf(v) {
    if (!v) return null; v = v.trim(); const named = { general: null, text: '@', 'short date': 'm/d/yyyy', 'long date': 'dddd, mmmm d, yyyy', fixed: '0.00', standard: '#,##0.00', percent: '0.00%', scientific: '0.00E+00', 'short time': 'h:mm', 'long time': 'h:mm:ss' }; const lk = v.replace(/^"|"$/g, '').toLowerCase(); if (lk in named) return named[lk];
    if (v[0] === '"' && v[v.length - 1] === '"' && v.length > 1) v = v.slice(1, -1); v = v.replace(/\\0022/g, '"').replace(/\\0027/g, "'").replace(/\\(.)/g, '$1'); return v === 'General' ? null : v;
  }
  function styleFrom(d, attrs) {
    const s = {}; const g = (k) => d[k];
    const fw = g('font-weight'); if (fw && (/bold/i.test(fw) || +fw >= 600)) s.b = 1; if (/italic|oblique/i.test(g('font-style') || '')) s.i = 1;
    const td = (g('text-decoration') || '') + ' ' + (g('text-decoration-line') || ''); if (/underline/.test(td)) s.u = /double/.test(td) ? 2 : 1; if (/line-through/.test(td)) s.k = 1;
    const fc = cssColor(g('color')); if (fc && fc !== '#000000') s.fc = fc;
    const bg = cssColor(g('background-color') || (g('background') || '').split(/\s+(?![^(]*\))/).map(cssColor).find(Boolean) || attrs.bgcolor); if (bg && !/transparent|none/.test(g('background-color') || '')) s.bg = bg;
    const ha = (g('text-align') || attrs.align || '').toLowerCase(); if (/^(left|center|right|justify)$/.test(ha)) s.ha = ha; const va = (g('vertical-align') || attrs.valign || '').toLowerCase(); if (va === 'top') s.va = 'top'; else if (va === 'middle' || va === 'center') s.va = 'middle';
    if (g('font-family')) { const fn = g('font-family').split(',')[0].replace(/["']/g, '').trim(); if (fn && !/^(inherit|sans-serif|serif|monospace)$/i.test(fn)) s.fn = fn; }
    if (g('font-size')) { const m = /^([\d.]+)(pt|px)$/.exec(g('font-size').trim()); if (m) { const pt = m[2] === 'px' ? +m[1] * 0.75 : +m[1]; if (pt > 0 && pt < 400) s.fs = Math.round(pt * 10) / 10; } }
    if (/^(normal|pre-wrap|pre-line|break-spaces)$/.test(g('white-space') || '')) s.wr = 1;
    const sides = { 'border-left': 'bl', 'border-right': 'br', 'border-top': 'bt', 'border-bottom': 'bb' };
    if (g('border')) { const b = borderOf(g('border')); if (b) s.bl = s.br = s.bt = s.bb = b; }
    for (const k in sides) if (g(k)) { const b = borderOf(g(k)); if (b) s[sides[k]] = b; else if (g(k)) delete s[sides[k]]; }
    return s;
  }
  function cellText(inner) {
    let t = inner.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\u0001').replace(/<\/(p|div|li|tr)>/gi, '\u0001').replace(/<[^>]*>/g, '');
    t = decodeEnt(t).replace(/[ \t\r\n ]+/g, ' '); t = t.replace(/ ?\u0001 ?/g, '\n').replace(/^\n+|\n+$/g, '').replace(/^ +| +$/g, ''); return t;
  }
  clip.fromHTML = (src) => {
    let h = String(src); const sf = h.indexOf('<!--StartFragment-->'); const ef = h.indexOf('<!--EndFragment-->');
    // class rules from <style>
    const rules = {}; const sre = /<style[^>]*>([\s\S]*?)<\/style>/gi; let sm;
    while ((sm = sre.exec(h))) { const css = sm[1].replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); const rre = /([^{}@]+)\{([^}]*)\}/g; let rm; while ((rm = rre.exec(css))) for (const sel of rm[1].split(',')) { const k = sel.trim().toLowerCase(); if (k) rules[k] = Object.assign(rules[k] || {}, decls(rm[2])); } }
    if (sf >= 0) h = h.slice(sf + 20, ef > sf ? ef : undefined);
    const rows = []; const tre = /<(\/?)(table|tr|td|th)\b([^>]*)>/gi; let m, depth = 0, row = null, cell = null, start = 0;
    const finish = (end) => {
      if (!cell) return; const inner = h.slice(start, end); const a = cell.attrs; const out = {};
      const d = Object.assign({}, rules.td, rules.th, a.class ? Object.assign({}, ...a.class.split(/\s+/).map((c) => Object.assign({}, rules['.' + c.toLowerCase()], rules['td.' + c.toLowerCase()]))) : {}, decls(a.style));
      const st = styleFrom(d, a); if (/<(b|strong)\b/i.test(inner) && !st.b) st.b = 1; if (/<(i|em)\b/i.test(inner) && !st.i) st.i = 1; if (/<u\b/i.test(inner) && !st.u) st.u = 1; if (/<(s|strike|del)\b/i.test(inner) && !st.k) st.k = 1;
      const fm = /<font\b[^>]*\bcolor\s*=\s*["']?([^"'\s>]+)/i.exec(inner); if (fm && !st.fc) { const c = cssColor(fm[1]); if (c && c !== '#000000') st.fc = c; }
      if (Object.keys(st).length) out.style = st;
      const nf = decodeNf(d['mso-number-format']); const txt = cellText(inner);
      if (a['x:fmla'] !== undefined && a['x:fmla'] !== '') out.f = a['x:fmla'].replace(/^=/, '');
      if ('x:num' in a) { const n = a['x:num'] !== '' ? +a['x:num'] : +txt.replace(/[^0-9.eE+-]/g, ''); if (n === n) out.v = n; else if (txt !== '') out.v = txt; }
      else if ('x:bool' in a) out.v = /^(true|1)$/i.test(a['x:bool'] || txt);
      else if ('x:err' in a) out.v = ZN.errFromCode(a['x:err']) || ZN.E.VALUE;
      else if ('x:str' in a) { out.v = a['x:str'] !== '' && a['x:str'] !== undefined ? a['x:str'] : txt; if (out.v === '') delete out.v; }
      else if (txt !== '') { const t = U.typed(txt); if (t) { out.v = t.v; if (t.nf && !nf) out.nf = t.nf; } else out.v = txt; }
      if (nf) out.nf = nf;
      const cs = parseInt(a.colspan, 10), rs = parseInt(a.rowspan, 10); if (cs > 1) out.colspan = cs; if (rs > 1) out.rowspan = rs;
      row.push(out); cell = null;
    };
    while ((m = tre.exec(h))) {
      const close = m[1] === '/'; const tag = m[2].toLowerCase();
      if (tag === 'table') { if (close) { if (depth === 1) { finish(m.index); row = null; } depth = Math.max(0, depth - 1); if (depth === 0 && rows.length) break; } else depth++; continue; }
      if (depth !== 1) continue;
      if (tag === 'tr') { finish(m.index); if (close) { if (row) { rows.push(row); row = null; } } else { if (row) rows.push(row); row = []; } continue; }
      // td / th
      if (close) { finish(m.index); continue; } finish(m.index); if (!row) row = []; cell = { attrs: htmlAttrs(m[3]) }; start = m.index + m[0].length;
    }
    finish(h.length); if (row && row.length) rows.push(row);
    return { rows };
  };

  // ---- internal clipboard ----
  clip.internal = (sh, r1, c1, r2, c2) => {
    const wb = sh.wb; r2 = clampRows(sh, r1, r2); const h = r2 - r1 + 1, w = c2 - c1 + 1; const styles = []; const sMap = new Map(); const cells = [];
    const loc = (sid) => { let i = sMap.get(sid); if (i === undefined) { i = styles.length; styles.push(Object.assign({}, wb.style(sid))); sMap.set(sid, i); } return i; };
    for (let i = 0; i < h; i++) {
      const row = new Array(w);
      for (let j = 0; j < w; j++) {
        const r = r1 + i, c = c1 + j; const x = sh.getCell(r, c); let out;
        if (x) {
          out = {};
          if (x.sp !== undefined) { const [sid, ar, ac] = ZN.unkey(x.sp); if (sid === sh.id && ar >= r1 && ar <= r2 && ac >= c1 && ac <= c2) { if (x.s !== undefined) out.s = loc(x.s); row[j] = x.s !== undefined ? out : undefined; continue; } }
          if (x.f !== undefined) out.f = x.f; if (x.v !== undefined) out.v = x.v;
          if (x.s !== undefined) out.s = loc(x.s); else { const d = sh.styleId(r, c); if (d) out.s = loc(d); }
          if (out.v === undefined && out.f === undefined && out.s === undefined) out = undefined;
        } else { const d = sh.styleId(r, c); if (d) out = { s: loc(d) }; }
        row[j] = out;
      }
      cells.push(row);
    }
    const merges = []; for (const m of sh.merges || []) if (m[0] >= r1 && m[2] <= r2 && m[1] >= c1 && m[3] <= c2) merges.push([m[0] - r1, m[1] - c1, m[2] - r1, m[3] - c1]);
    return { cells, styles, w, h, merges, src: { sheetId: sh.id, r1, c1 } };
  };
  const BORDER_KEYS = ['bl', 'br', 'bt', 'bb'];
  clip.pasteInternal = (wb, sh, r, c, p, o = {}) => {
    const mode = o.mode || 'all'; const transpose = !!o.transpose || mode === 'transpose'; const relative = o.relative !== false;
    const doContent = mode !== 'formats'; const valuesOnly = mode === 'values' || mode === 'valuesNf'; const doFmt = mode === 'all' || mode === 'formats' || mode === 'transpose' || mode === 'noBorders' || mode === 'valuesNf';
    const sMap = new Map(); const sid = (li) => { let v = sMap.get(li); if (v === undefined) { let st = p.styles[li] || {}; if (mode === 'noBorders') { st = Object.assign({}, st); for (const k of BORDER_KEYS) delete st[k]; } v = wb.internStyle(st); sMap.set(li, v); } return v; };
    const H = transpose ? p.w : p.h, W = transpose ? p.h : p.w; let ok = 0;
    for (let i = 0; i < p.h; i++) for (let j = 0; j < p.w; j++) {
      const rr = transpose ? r + j : r + i, cc = transpose ? c + i : c + j; if (rr >= MAXR || cc >= MAXC) continue;
      const src = p.cells[i] && p.cells[i][j]; if (!src && o.skipBlanks) continue;
      const prev = sh.getCell(rr, cc); let cell; let s = prev ? prev.s : undefined;
      if (doFmt) { if (mode === 'valuesNf') { const nf = src && src.s !== undefined ? (p.styles[src.s] || {}).nf : undefined; s = wb.mergeStyle(s || 0, { nf: nf || null }) || undefined; } else s = src && src.s !== undefined ? sid(src.s) : undefined; }
      if (!doContent) { if (!prev && s === undefined) continue; cell = prev ? Object.assign({}, prev) : { v: undefined }; if (s) cell.s = s; else delete cell.s; }
      else {
        if (!src || (src.v === undefined && src.f === undefined)) { cell = s ? { v: undefined, s } : undefined; if (!doFmt && prev && s === undefined) cell = undefined; if (o.op && prev) continue; }
        else if (valuesOnly || (src.f === undefined)) { cell = { v: src.v }; if (s) cell.s = s; }
        else {
          const dr = transpose ? (r + j) - (p.src.r1 + i) : r - p.src.r1, dc = transpose ? (c + i) - (p.src.c1 + j) : c - p.src.c1;
          cell = { v: undefined, f: relative && (dr || dc) ? FM.translate(src.f, dr, dc) : src.f }; if (s) cell.s = s;
        }
        if (o.op && cell && typeof cell.v === 'number' && prev && typeof prev.v === 'number' && prev.f === undefined) { const a = prev.v, b = cell.v; const res = o.op === 'add' ? a + b : o.op === 'sub' ? a - b : o.op === 'mul' ? a * b : o.op === 'div' ? (b === 0 ? ZN.E.DIV0 : a / b) : b; cell = { v: res }; if (prev.s) cell.s = prev.s; }
      }
      if (cell === undefined && !prev) continue; wb.put(sh, rr, cc, cell); ok++;
    }
    if ((mode === 'all' || mode === 'formats' || mode === 'transpose' || mode === 'noBorders') && (p.merges && p.merges.length || (sh.merges || []).length)) {
      const r2 = r + H - 1, c2 = c + W - 1; const kept = (sh.merges || []).filter((m) => m[0] > r2 || m[2] < r || m[1] > c2 || m[3] < c);
      const add = (p.merges || []).map((m) => (transpose ? [r + m[1], c + m[0], r + m[3], c + m[2]] : [r + m[0], c + m[1], r + m[2], c + m[3]]));
      if (add.length || kept.length !== (sh.merges || []).length) wb.setProp(sh, 'merges', kept.concat(add));
    }
    return { r1: r, c1: c, r2: r + H - 1, c2: c + W - 1, count: ok };
  };

  // ===================== open() dispatcher =====================
  IO.open = (input, name = '') => {
    const u8 = U.toU8(input); const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || ''; const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    if (u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4B) {
      let names; try { names = Object.keys(fflate.unzipSync(u8, { filter: (f) => f.name === 'mimetype' || f.name === 'workbook.json' || f.name === 'xl/workbook.xml' })); } catch (e) { throw new Error('This file is not a valid workbook (corrupt zip archive)'); }
      if (names.includes('workbook.json') && !names.includes('xl/workbook.xml')) return znumbers.read(u8);
      return IO.xlsx.read(u8);
    }
    if (/^(znumbers)$/i.test(ext)) return znumbers.read(u8);
    return IO.csv.toWorkbook(u8, { name: base || 'Sheet1', delimiter: /^tsv$/i.test(ext) ? '\t' : undefined });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
