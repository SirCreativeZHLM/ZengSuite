/* ZengNumbers XLSX reader/writer (ZN.io.xlsx). Hand-written OOXML; no DOM, no eval. Uses global fflate. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const IO = ZN.io || (ZN.io = {}); const U = IO._u; const FM = ZN.formula;
  const xlsx = IO.xlsx = {};
  const MAXR = ZN.MAXR, MAXC = ZN.MAXC;

  // ===================== XML helpers =====================
  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function unesc(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
      if (e.charCodeAt(0) === 35) { const cp = e.charCodeAt(1) === 120 ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch (x) { return ''; } }
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }
  function unescX(s) { // also _xHHHH_ escapes used by Excel for control chars
    s = unesc(s);
    return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function parseAttrs(s, a) { // s: attribute section of a tag
    const n = s.length; let i = 0;
    while (i < n) {
      while (i < n && s.charCodeAt(i) <= 32) i++;
      let j = i; while (j < n) { const c = s.charCodeAt(j); if (c === 61 || c <= 32 || c === 47 || c === 62) break; j++; }
      if (j === i) { i++; continue; }
      const name = s.slice(i, j); i = j; while (i < n && s.charCodeAt(i) <= 32) i++;
      if (s.charCodeAt(i) !== 61) { continue; }
      i++; while (i < n && s.charCodeAt(i) <= 32) i++;
      const q = s.charCodeAt(i); if (q !== 34 && q !== 39) continue;
      const e = s.indexOf(q === 34 ? '"' : "'", i + 1); if (e < 0) break;
      a[name] = unesc(s.slice(i + 1, e)); i = e + 1;
    }
    return a;
  }
  const localName = (n) => { const k = n.indexOf(':'); return k < 0 ? n : n.slice(k + 1); };
  // Tree parser for small parts. node = {n, a, c:[], t}
  function parseXml(src) {
    const root = { n: '#root', a: {}, c: [], t: '' }; const stack = [root]; const n = src.length; let i = 0;
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { if (stack.length > 1) throw new Error('Malformed XML: unexpected end of data'); break; }
      if (lt > i) { const top = stack[stack.length - 1]; const tx = src.slice(i, lt); if (tx.trim() !== '' || top.c.length === 0) top.t += tx; }
      const c1 = src.charCodeAt(lt + 1);
      if (c1 === 63) { const e = src.indexOf('?>', lt); if (e < 0) throw new Error('Malformed XML: bad declaration'); i = e + 2; continue; }
      if (c1 === 33) {
        if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); if (e < 0) throw new Error('Malformed XML: unterminated comment'); i = e + 3; continue; }
        if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); if (e < 0) throw new Error('Malformed XML: unterminated CDATA'); stack[stack.length - 1].t += src.slice(lt + 9, e).replace(/&/g, '&amp;').replace(/</g, '&lt;'); i = e + 3; continue; }
        const e = src.indexOf('>', lt); if (e < 0) throw new Error('Malformed XML'); i = e + 1; continue;
      }
      // find end of tag respecting quotes
      let j = lt + 1, q = 0; for (; j < n; j++) { const c = src.charCodeAt(j); if (q) { if (c === q) q = 0; } else if (c === 34 || c === 39) q = c; else if (c === 62) break; }
      if (j >= n) throw new Error('Malformed XML: unterminated tag');
      if (c1 === 47) { const nm = localName(src.slice(lt + 2, j).trim()); const top = stack.pop(); if (!top || stack.length === 0 || top.n !== nm) throw new Error('Malformed XML: mismatched </' + nm + '>'); i = j + 1; continue; }
      const self = src.charCodeAt(j - 1) === 47; const body = src.slice(lt + 1, self ? j - 1 : j);
      let k = 0; while (k < body.length && body.charCodeAt(k) > 32) k++;
      const node = { n: localName(body.slice(0, k)), a: k < body.length ? parseAttrs(body.slice(k), {}) : {}, c: [], t: '' };
      stack[stack.length - 1].c.push(node); if (!self) stack.push(node); i = j + 1;
    }
    if (stack.length !== 1) throw new Error('Malformed XML: unclosed <' + stack[stack.length - 1].n + '>');
    return root.c[0] || root;
  }
  const kids = (nd, name) => { const o = []; if (nd) for (const k of nd.c) if (k.n === name) o.push(k); return o; };
  const kid = (nd, name) => { if (nd) for (const k of nd.c) if (k.n === name) return k; return null; };
  const text = (nd) => (nd ? unescX(nd.t) : '');
  const tryParse = (s) => { try { return parseXml(s); } catch (e) { return null; } };

  // ===================== colours =====================
  const INDEXED = '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'.split(' ');
  const DEF_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72']; // index order as used by theme="n"
  function hls(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
    return [h, l, s];
  }
  function fromHls(h, l, s) {
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    let r, g, b; if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return [r, g, b].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  }
  const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
  function applyTint(hex, tint) {
    if (!tint) return hex; const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    let [h, l, s] = hls(r, g, b); l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint; const o = fromHls(h, l, s); return hex2(o[0]) + hex2(o[1]) + hex2(o[2]);
  }
  function makeColorResolver(theme, indexedOverride) {
    return (nd) => { // colour element -> '#rrggbb' | null ; null also means "automatic"
      if (!nd) return null; const a = nd.a;
      if (a.rgb) { const h = a.rgb.length === 8 ? a.rgb.slice(2) : a.rgb.slice(-6); return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toLowerCase() : null; }
      if (a.theme !== undefined) { const t = +a.theme; const base = theme[t]; if (!base) return null; return '#' + applyTint(base, a.tint ? +a.tint : 0).toLowerCase(); }
      if (a.indexed !== undefined) { const i = +a.indexed; if (i === 64 || i === 65) return null; const x = (indexedOverride && indexedOverride[i]) || INDEXED[i]; return x ? '#' + x.toLowerCase() : null; }
      return null;
    };
  }
  function readTheme(xml) {
    const out = DEF_THEME.slice(); if (!xml) return out; const root = tryParse(xml); if (!root) return out;
    const cs = kid(kid(kid(root, 'themeElements'), 'clrScheme') || { c: [] }, 'dk1') ? kid(kid(root, 'themeElements'), 'clrScheme') : null; if (!cs) return out;
    const get = (nm) => { const e = kid(cs, nm); const c = e && e.c[0]; if (!c) return null; return c.a.val || c.a.lastClr || null; };
    const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    order.forEach((nm, i) => { const v = get(nm); if (v && /^[0-9a-fA-F]{6}$/.test(v)) out[i] = v.toUpperCase(); });
    return out;
  }

  // ===================== number formats =====================
  const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '"$"#,##0_);\\("$"#,##0\\)', 6: '"$"#,##0_);[Red]\\("$"#,##0\\)', 7: '"$"#,##0.00_);\\("$"#,##0.00\\)', 8: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm', 37: '#,##0_);(#,##0)', 38: '#,##0_);[Red](#,##0)', 39: '#,##0.00_);(#,##0.00)', 40: '#,##0.00_);[Red](#,##0.00)', 41: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)', 43: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@' };
  xlsx.BUILTIN_NF = BUILTIN;
  const builtinNf = (id) => { const b = ZN.fmt && ZN.fmt.builtinById; if (b) { try { const x = typeof b === 'function' ? b(id) : b[id]; if (typeof x === 'string') return x; } catch (e) { /* use table */ } } return BUILTIN[id]; };
  const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  function isDateCode(code) {
    if (!code || code === 'General') return false;
    const sec = code.split(';')[0].replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, (m) => (/^\[(h|m|s)+\]$/i.test(m) ? 'h' : '')).replace(/_./g, '').replace(/\*./g, '');
    return /[ymdhs]/i.test(sec) && !/^[^ymdhs]*$/i.test(sec);
  }

  // ===================== paths / refs =====================
  function resolvePath(base, target) {
    if (target.charCodeAt(0) === 47) return target.slice(1);
    const parts = base.split('/'); parts.pop();
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.' && seg !== '') parts.push(seg); }
    return parts.join('/');
  }
  function readRels(files, partPath) {
    const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1); const nm = partPath.slice(dir.length);
    const f = files[dir + '_rels/' + nm + '.rels']; const out = {}; if (!f) return out;
    const root = tryParse(U.utf8(f)); if (!root) return out;
    for (const r of kids(root, 'Relationship')) { if (r.a.TargetMode === 'External') { out[r.a.Id] = { type: r.a.Type || '', target: r.a.Target, external: true }; continue; } out[r.a.Id] = { type: r.a.Type || '', target: resolvePath(partPath, r.a.Target || '') }; }
    return out;
  }
  const rid = (a) => { if (a['r:id'] !== undefined) return a['r:id']; for (const k in a) if (k.endsWith(':id')) return a[k]; return a.id; };
  function parseCellRef(s) { // 'A1' / '$A$1' -> [r, c] or null
    let i = 0, c = 0; const n = s.length; if (s.charCodeAt(0) === 36) i++;
    let k = 0; for (; i < n; i++) { const x = s.charCodeAt(i) & ~32; if (x >= 65 && x <= 90) { c = c * 26 + (x - 64); k++; } else break; }
    if (!k) return null; if (s.charCodeAt(i) === 36) i++; let r = 0, d = 0; for (; i < n; i++) { const x = s.charCodeAt(i); if (x >= 48 && x <= 57) { r = r * 10 + x - 48; d++; } else return null; }
    if (!d) return [null, c - 1]; return [r - 1, c - 1];
  }
  function parseRange(s) { // 'A1:B5' | 'A1' | 'A:A' | '1:3' -> [r1,c1,r2,c2]
    s = s.replace(/\$/g, ''); const k = s.indexOf(':'); const a = parseCellRef(k < 0 ? s : s.slice(0, k)); if (!a) return null; const b = k < 0 ? a : parseCellRef(s.slice(k + 1)); if (!b) return null;
    let r1 = a[0], r2 = b[0], c1 = a[1], c2 = b[1];
    if (/^\d+:\d+$/.test(s)) { const m = s.split(':'); return [+m[0] - 1, 0, +m[1] - 1, MAXC - 1]; }
    if (r1 === null || r2 === null) { r1 = 0; r2 = MAXR - 1; }
    return [Math.min(r1, r2), Math.min(c1, c2), Math.max(r1, r2), Math.max(c1, c2)];
  }
  const parseSqref = (s) => { const o = []; for (const p of (s || '').split(/\s+/)) if (p) { const r = parseRange(p); if (r) o.push(r); } return o; };
  const cleanF = (f) => (f.indexOf('_xl') < 0 ? f : f.replace(/_xl(?:fn|ws|pm)\./g, ''));
  const colPx = (w) => Math.trunc((256 * w + Math.trunc(128 / 7)) / 256 * 7);
  const MAXFILL = 16384;

  // ===================== styles =====================
  const BSTYLES = { thin: 1, medium: 1, thick: 1, dashed: 1, dotted: 1, double: 1, hair: 1, mediumDashed: 1, dashDot: 1, mediumDashDot: 1, dashDotDot: 1, mediumDashDotDot: 1, slantDashDot: 1 };
  function readStyles(xml, theme, wb) {
    const out = { xfs: [], dxfs: [], numFmts: {}, date: [] };
    const root = parseXml(xml); const ix = kid(kid(root, 'colors'), 'indexedColors'); let indexed = null;
    if (ix) { indexed = []; for (const c of kids(ix, 'rgbColor')) indexed.push((c.a.rgb || '').slice(-6)); }
    const col = makeColorResolver(theme, indexed);
    const nfs = out.numFmts; for (const n of kids(kid(root, 'numFmts'), 'numFmt')) nfs[n.a.numFmtId] = n.a.formatCode;
    const fonts = kids(kid(root, 'fonts'), 'font'); const fills = kids(kid(root, 'fills'), 'fill'); const borders = kids(kid(root, 'borders'), 'border');
    const fontObj = (f) => {
      const o = {}; if (!f) return o;
      const nm = kid(f, 'name'); if (nm && nm.a.val) o.fn = nm.a.val; const sz = kid(f, 'sz'); if (sz && sz.a.val) o.fs = +sz.a.val;
      const flag = (n) => { const e = kid(f, n); return e && e.a.val !== '0' && e.a.val !== 'false'; };
      if (flag('b')) o.b = 1; if (flag('i')) o.i = 1; if (flag('strike')) o.k = 1;
      const u = kid(f, 'u'); if (u && u.a.val !== 'none') o.u = u.a.val === 'double' || u.a.val === 'doubleAccounting' ? 2 : 1;
      const c = kid(f, 'color'); if (c && !(c.a.theme === '1' && !c.a.tint) && c.a.auto !== '1') { const h = col(c); if (h) o.fc = h; }
      return o;
    };
    const base = fontObj(fonts[0]);
    const fillColor = (f) => {
      if (!f) return null; const p = kid(f, 'patternFill');
      if (p) { if (p.a.patternType !== 'solid') return null; return col(kid(p, 'fgColor')); }
      const g = kid(f, 'gradientFill'); if (g) { const st = kid(g, 'stop'); return st ? col(kid(st, 'color')) : null; }
      return null;
    };
    const borderObj = (b) => {
      const o = {}; if (!b) return o;
      for (const [side, key, alt] of [['left', 'bl', 'start'], ['right', 'br', 'end'], ['top', 'bt'], ['bottom', 'bb']]) {
        const e = kid(b, side) || (alt && kid(b, alt)); if (!e || !e.a.style || !BSTYLES[e.a.style]) continue;
        o[key] = e.a.style + ' ' + (col(kid(e, 'color')) || '#000000');
      }
      return o;
    };
    const HA = { left: 'left', center: 'center', right: 'right', justify: 'justify', fill: 'fill', centerContinuous: 'centerAcross', distributed: 'justify' };
    const VA = { top: 'top', center: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' };
    const xfList = kids(kid(root, 'cellXfs'), 'xf');
    for (const x of xfList) {
      const s = {}; const a = x.a; const nid = +(a.numFmtId || 0);
      const code = nfs[nid] !== undefined ? nfs[nid] : builtinNf(nid);
      if (code && code !== 'General') s.nf = code;
      const f = fontObj(fonts[+(a.fontId || 0)]);
      if (f.fn && f.fn !== base.fn) s.fn = f.fn; if (f.fs && f.fs !== base.fs) s.fs = f.fs;
      for (const k of ['b', 'i', 'u', 'k', 'fc']) if (f[k] !== undefined) s[k] = f[k];
      const bg = fillColor(fills[+(a.fillId || 0)]); if (bg) s.bg = bg;
      Object.assign(s, borderObj(borders[+(a.borderId || 0)]));
      const al = kid(x, 'alignment');
      if (al) {
        const q = al.a; if (q.horizontal && HA[q.horizontal]) s.ha = HA[q.horizontal]; if (q.vertical && VA[q.vertical] && q.vertical !== 'bottom') s.va = VA[q.vertical];
        if (q.wrapText === '1' || q.wrapText === 'true') s.wr = 1; if (q.indent && +q.indent > 0) s.ind = +q.indent;
        if (q.textRotation) { const t = +q.textRotation; if (t === 255) s.rot = 255; else if (t > 90 && t <= 180) s.rot = 90 - t; else if (t > 0) s.rot = t; }
        if (q.shrinkToFit === '1' || q.shrinkToFit === 'true') s.shr = 1;
      }
      const pr = kid(x, 'protection'); if (pr) { if (pr.a.locked === '0' || pr.a.locked === 'false') s.lock = 0; if (pr.a.hidden === '1' || pr.a.hidden === 'true') s.hid = 1; }
      out.xfs.push(s); out.date.push(DATE_IDS.has(nid) || (nfs[nid] !== undefined && isDateCode(nfs[nid])) || (nid >= 164 && s.nf && isDateCode(s.nf)));
    }
    for (const d of kids(kid(root, 'dxfs'), 'dxf')) {
      const o = {}; const f = kid(d, 'font');
      if (f) { const fo = fontObj(f); const c = kid(f, 'color'); if (c) { const h = col(c); if (h) o.fc = h; } if (fo.b) o.b = 1; if (fo.i) o.i = 1; if (fo.u) o.u = fo.u === 2 ? 2 : 1; if (fo.k) o.k = 1; }
      const fl = kid(d, 'fill'); if (fl) { const p = kid(fl, 'patternFill'); if (p) { const c = col(kid(p, 'bgColor')) || col(kid(p, 'fgColor')); if (c) o.bg = c; } }
      const nf = kid(d, 'numFmt'); if (nf && nf.a.formatCode) o.nf = nf.a.formatCode;
      out.dxfs.push(o);
    }
    return out;
  }

  // ===================== conditional formatting =====================
  const CF_OP = { greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le', equal: 'eq', notEqual: 'ne', between: 'between', notBetween: 'notBetween' };
  const ICON_MAP = { '3TrafficLights1': '3TrafficLights', '3TrafficLights2': '3TrafficLights', '3Symbols2': '3Symbols', '4RedToBlack': '4TrafficLights', '4TrafficLights': '4TrafficLights' };
  const TIMEP = { today: 'today', yesterday: 'yesterday', tomorrow: 'tomorrow', last7Days: 'last7', thisWeek: 'thisweek', lastWeek: 'lastweek', nextWeek: 'nextweek', thisMonth: 'thismonth', lastMonth: 'lastmonth', nextMonth: 'nextmonth' };
  function cfValue(t) { // formula text -> number | string | '=formula'
    t = cleanF(unesc(t || '')).trim(); if (t === '') return '';
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return +t;
    if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' && t.indexOf('"', 1) === t.length - 1 || (/^"([^"]|"")*"$/.test(t))) return t.slice(1, -1).replace(/""/g, '"');
    return '=' + t;
  }
  function readCfvo(nd, col) {
    const a = nd.a; const t = a.type; const o = { type: t === 'percent' || t === 'percentile' || t === 'min' || t === 'max' || t === 'formula' ? t : 'num' };
    if (a.val !== undefined && o.type !== 'min' && o.type !== 'max') o.v = o.type === 'formula' ? '=' + cleanF(a.val) : (isFinite(+a.val) ? +a.val : a.val);
    return o;
  }
  let cfSeq = 0;
  function readCf(blocks, dxfs, col) {
    const out = [];
    for (const b of blocks) {
      const ranges = parseSqref(b.a.sqref); if (!ranges.length) continue;
      for (const r of kids(b, 'cfRule')) {
        try {
          const a = r.a; const rule = { id: 'cf' + (++cfSeq), ranges, priority: a.priority ? +a.priority : out.length + 1 }; if (a.stopIfTrue === '1') rule.stop = true;
          const dx = a.dxfId !== undefined ? dxfs[+a.dxfId] : null; if (dx && Object.keys(dx).length) rule.style = dx;
          const fs = kids(r, 'formula'); const f0 = fs[0] ? text(fs[0]) : '', f1 = fs[1] ? text(fs[1]) : '';
          switch (a.type) {
            case 'cellIs': rule.type = 'cell'; rule.op = CF_OP[a.operator] || 'eq'; rule.v1 = cfValue(f0); if (rule.op === 'between' || rule.op === 'notBetween') rule.v2 = cfValue(f1); break;
            case 'expression': rule.type = 'formula'; rule.formula = cleanF(f0); break;
            case 'containsText': rule.type = 'text'; rule.textOp = 'contains'; rule.text = a.text || ''; break;
            case 'notContainsText': rule.type = 'text'; rule.textOp = 'notContains'; rule.text = a.text || ''; break;
            case 'beginsWith': rule.type = 'text'; rule.textOp = 'begins'; rule.text = a.text || ''; break;
            case 'endsWith': rule.type = 'text'; rule.textOp = 'ends'; rule.text = a.text || ''; break;
            case 'top10': rule.type = 'top'; rule.n = a.rank ? +a.rank : 10; if (a.bottom === '1') rule.bottom = true; if (a.percent === '1') rule.pct = true; break;
            case 'aboveAverage': rule.type = 'avg'; rule.above = a.aboveAverage !== '0'; if (a.equalAverage === '1') rule.equal = true; break;
            case 'duplicateValues': rule.type = 'dupes'; break;
            case 'uniqueValues': rule.type = 'dupes'; rule.unique = true; break;
            case 'containsBlanks': rule.type = 'blanks'; break;
            case 'notContainsBlanks': rule.type = 'noblanks'; break;
            case 'containsErrors': rule.type = 'errors'; break;
            case 'notContainsErrors': rule.type = 'noerrors'; break;
            case 'timePeriod': if (!TIMEP[a.timePeriod]) continue; rule.type = 'date'; rule.when = TIMEP[a.timePeriod]; break;
            case 'colorScale': {
              const cs = kid(r, 'colorScale'); if (!cs) continue; const vs = kids(cs, 'cfvo'), cl = kids(cs, 'color'); rule.type = 'colorScale';
              rule.stops = vs.map((v, i) => Object.assign(readCfvo(v), { color: col(cl[i]) || '#ffffff' })); break;
            }
            case 'dataBar': {
              const db = kid(r, 'dataBar'); if (!db) continue; const vs = kids(db, 'cfvo'); rule.type = 'dataBar';
              rule.color = col(kid(db, 'color')) || '#638ec6'; rule.min = vs[0] ? readCfvo(vs[0]) : { type: 'min' }; rule.max = vs[1] ? readCfvo(vs[1]) : { type: 'max' }; rule.gradient = true; rule.showValue = db.a.showValue !== '0'; break;
            }
            case 'iconSet': {
              const is = kid(r, 'iconSet'); if (!is) continue; const nm = is.a.iconSet || '3TrafficLights1'; const vs = kids(is, 'cfvo'); rule.type = 'iconSet';
              rule.name = ICON_MAP[nm] || nm; rule.thresholds = vs.slice(1).map((v) => { const o = readCfvo(v); if (o.type === 'min' || o.type === 'max') o.type = 'num'; o.gte = v.a.gte !== '0'; return o; });
              if (is.a.reverse === '1') rule.reverse = true; rule.showValue = is.a.showValue !== '0'; break;
            }
            default: continue;
          }
          out.push(rule);
        } catch (e) { /* skip unknown rule */ }
      }
    }
    return out;
  }

  // ===================== data validation =====================
  const DV_TYPE = { whole: 'whole', decimal: 'decimal', list: 'list', date: 'date', time: 'time', textLength: 'length', custom: 'custom' };
  let dvSeq = 0;
  function readDv(nd) {
    const out = [];
    for (const d of kids(nd, 'dataValidation')) {
      const a = d.a; const type = DV_TYPE[a.type]; if (!type) continue; const ranges = parseSqref(a.sqref); if (!ranges.length) continue;
      const dv = { id: 'dv' + (++dvSeq), ranges, type, allowBlank: a.allowBlank === '1' || a.allowBlank === 'true', dropdown: a.showDropDown !== '1' };
      const f1 = kid(d, 'formula1'), f2 = kid(d, 'formula2'); const t1 = f1 ? cleanF(text(f1)).trim() : '', t2 = f2 ? cleanF(text(f2)).trim() : '';
      if (type === 'list') { if (/^"([^"]|"")*"$/.test(t1)) dv.list = t1.slice(1, -1).replace(/""/g, '"').split(','); else dv.source = '=' + t1; }
      else if (type === 'custom') dv.formula = t1;
      else { dv.op = a.operator ? (CF_OP[a.operator] || 'between') : 'between'; dv.v1 = cfValue(t1); if (dv.op === 'between' || dv.op === 'notBetween') dv.v2 = cfValue(t2); }
      dv.errStyle = a.errorStyle || 'stop'; if (a.errorTitle) dv.errTitle = a.errorTitle; if (a.error) dv.errMsg = a.error; if (a.promptTitle) dv.promptTitle = a.promptTitle; if (a.prompt) dv.prompt = a.prompt;
      dv.showPrompt = a.showInputMessage === '1'; dv.showError = a.showErrorMessage === '1';
      out.push(dv);
    }
    return out;
  }

  // ===================== tables =====================
  function readTable(xml) {
    const t = parseXml(xml); const a = t.a; const rg = parseRange(a.ref || ''); if (!rg) return null;
    const cols = kids(kid(t, 'tableColumns'), 'tableColumn'); const si = kid(t, 'tableStyleInfo');
    const o = { name: a.displayName || a.name || 'Table', r1: rg[0], c1: rg[1], r2: rg[2], c2: rg[3], header: a.headerRowCount !== '0', total: +(a.totalsRowCount || 0) > 0, cols: cols.map((c) => c.a.name || ''), style: 'medium2', banded: true, bandedCols: false, firstCol: false, lastCol: false, filter: !!kid(t, 'autoFilter') };
    if (si) {
      const m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(si.a.name || ''); o.style = m ? m[1].toLowerCase() + m[2] : (si.a.name || 'none'); o.banded = si.a.showRowStripes === '1'; o.bandedCols = si.a.showColumnStripes === '1'; o.firstCol = si.a.showFirstColumn === '1'; o.lastCol = si.a.showLastColumn === '1';
    } else { o.style = 'none'; o.banded = false; }
    const TF = { sum: 'sum', average: 'average', count: 'count', countNums: 'countNums', max: 'max', min: 'min', stdDev: 'stdDev', var: 'var' };
    for (const c of cols) if (c.a.totalsRowFunction && TF[c.a.totalsRowFunction]) (o.totals || (o.totals = {}))[c.a.name] = TF[c.a.totalsRowFunction];
    return o;
  }

  // ===================== shared strings =====================
  function readSst(xml) {
    const out = []; let i = 0; const n = xml.length;
    for (;;) {
      let s = xml.indexOf('<si', i); if (s < 0) break; const c = xml.charCodeAt(s + 3);
      if (c !== 62 && c !== 32 && c !== 47) { i = s + 3; continue; }
      const gt = xml.indexOf('>', s); if (gt < 0) break;
      if (xml.charCodeAt(gt - 1) === 47) { out.push(''); i = gt + 1; continue; }
      const e = xml.indexOf('</si>', gt); if (e < 0) break;
      let body = xml.slice(gt + 1, e); i = e + 5;
      if (body.indexOf('<rPh') >= 0) body = body.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
      if (body.indexOf('<r>') < 0 && body.indexOf('<r ') < 0 && body.charCodeAt(0) === 60 && body.startsWith('<t')) {
        const a = body.indexOf('>'); const b = body.lastIndexOf('</t>'); if (a >= 0 && b > a && body.indexOf('<t', a) < 0) { out.push(unescX(body.slice(a + 1, b))); continue; }
      }
      let str = '', k = 0;
      for (;;) {
        const t = body.indexOf('<t', k); if (t < 0) break; const cc = body.charCodeAt(t + 2); if (cc !== 62 && cc !== 32 && cc !== 47) { k = t + 2; continue; }
        const g = body.indexOf('>', t); if (g < 0) break; if (body.charCodeAt(g - 1) === 47) { k = g + 1; continue; }
        const e2 = body.indexOf('</t>', g); if (e2 < 0) break; str += unescX(body.slice(g + 1, e2)); k = e2 + 4;
      }
      out.push(str);
    }
    return out;
  }

  // ===================== worksheet =====================
  function isoToSerial(t) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d(?:\.\d+)?))?)?/.exec(t); if (!m) return null;
    return ZN.date.fromYMD(+m[1], +m[2], +m[3]) + (m[4] ? (+m[4] * 3600 + +m[5] * 60 + (m[6] ? +m[6] : 0)) / 86400 : 0);
  }
  function attrOf(tag, name) { // fast single attribute lookup in a tag string (name must be preceded by a space)
    let k = tag.indexOf(' ' + name + '="'); if (k >= 0) { k += name.length + 3; return tag.slice(k, tag.indexOf('"', k)); }
    k = tag.indexOf(' ' + name + "='"); if (k >= 0) { k += name.length + 3; return tag.slice(k, tag.indexOf("'", k)); }
    return undefined;
  }
  function readSheet(sh, xml, ctx) {
    const wb = sh.wb; const { styles, sst, xfSid, date1904 } = ctx;
    if (/^\s*<[\w:]*worksheet/.test(xml) === false && xml.indexOf('worksheet') < 0) throw new Error('Not a worksheet part');
    const sd = xml.indexOf('<sheetData'); let head, tail, data = '';
    if (sd < 0) { head = xml; tail = ''; } else {
      const gt = xml.indexOf('>', sd); head = xml.slice(0, sd);
      if (xml.charCodeAt(gt - 1) === 47) tail = xml.slice(gt + 1); else { const e = xml.indexOf('</sheetData>', gt); if (e < 0) throw new Error('Corrupt worksheet: unterminated sheetData'); data = xml.slice(gt + 1, e); tail = xml.slice(e + 12); }
    }
    const rootOpen = (/<([\w:]*)worksheet[^>]*>/.exec(head) || [])[0];
    const hroot = tryParse(rootOpen && head.indexOf('</worksheet>') < 0 ? head + '</' + rootOpen.slice(1).split(/[\s>]/)[0] + '>' : head);
    const troot = tail ? tryParse('<w>' + tail.replace(/<\/[\w:]*worksheet>\s*$/, '') + '</w>') : null;
    if (!hroot) throw new Error('Corrupt worksheet XML');
    const sections = [hroot, troot].filter(Boolean); const pick = (nm) => { for (const s of sections) { const k = kid(s, nm); if (k) return k; } return null; };
    const pickAll = (nm) => { const o = []; for (const s of sections) o.push(...kids(s, nm)); return o; };
    // sheetPr/tabColor
    const spr = pick('sheetPr'); if (spr) { const tc = kid(spr, 'tabColor'); if (tc) { const c = ctx.col(tc); if (c) sh.color = c; } }
    const sfp = pick('sheetFormatPr');
    sh.defColW = 64; sh.defRowH = 20;
    if (sfp) {
      if (sfp.a.defaultColWidth) sh.defColW = colPx(+sfp.a.defaultColWidth); else if (sfp.a.baseColWidth) sh.defColW = Math.trunc(((+sfp.a.baseColWidth) * 7 + 5));
      if (sfp.a.defaultRowHeight) sh.defRowH = Math.round(+sfp.a.defaultRowHeight * 400 / 3) / 100;
    }
    // views
    const svs = pick('sheetViews'); const sv = svs && kid(svs, 'sheetView');
    if (sv) {
      if (sv.a.showGridLines === '0') sh.grid = false; if (sv.a.zoomScale) sh.zoom = Math.max(0.1, Math.min(4, +sv.a.zoomScale / 100));
      const pane = kid(sv, 'pane'); if (pane && (pane.a.state === 'frozen' || pane.a.state === 'frozenSplit')) { const r = Math.trunc(+pane.a.ySplit || 0), c = Math.trunc(+pane.a.xSplit || 0); if (r > 0 || c > 0) sh.freeze = { r, c }; }
      if (sv.a.tabSelected === '1') ctx.selected = true;
    }
    // columns
    const colsN = pick('cols');
    if (colsN) for (const c of kids(colsN, 'col')) {
      const a = c.a; const mn = Math.max(1, +a.min || 1) - 1, mx = Math.min(MAXC, +a.max || mn + 1) - 1; if (!(mx >= mn)) continue;
      const w = a.width !== undefined ? colPx(+a.width) : undefined; const hid = a.hidden === '1' || a.hidden === 'true'; const xf = a.style ? xfSid(+a.style) : 0;
      if (mx - mn >= 1000 && w !== undefined && !hid && !xf) { sh.defColW = w; continue; }
      for (let i = mn; i <= mx && i - mn < MAXFILL; i++) { if (w !== undefined) sh.colW[i] = w; if (hid) sh.hiddenCols[i] = 1; if (xf) sh.colS[i] = xf; }
    }
    // sheetData
    const sharedF = new Map(); const arrays = []; let seqR = -1;
    const cellsIn = (cellRec) => cellRec;
    let p = 0; const dn = data.length;
    for (;;) {
      const rs = data.indexOf('<row', p); if (rs < 0) break; const c4 = data.charCodeAt(rs + 4); if (c4 !== 32 && c4 !== 62 && c4 !== 47) { p = rs + 4; continue; }
      const rg = data.indexOf('>', rs); if (rg < 0) break; const rtag = data.slice(rs, rg); const rself = data.charCodeAt(rg - 1) === 47;
      let r; const ra = attrOf(rtag, 'r'); r = ra !== undefined ? +ra - 1 : seqR + 1; if (!(r >= 0 && r < MAXR)) { p = rg + 1; continue; } seqR = r;
      const ht = attrOf(rtag, 'ht'); if (ht !== undefined && (attrOf(rtag, 'customHeight') === '1' || true)) { const px = Math.round(+ht * 400 / 3) / 100; if (px > 0 && Math.abs(px - sh.defRowH) > 0.001) sh.rowH[r] = px; }
      const hd = attrOf(rtag, 'hidden'); if (hd === '1' || hd === 'true') sh.hiddenRows[r] = 1;
      const rsx = attrOf(rtag, 's'); if (rsx !== undefined && attrOf(rtag, 'customFormat') !== '0' && (attrOf(rtag, 'customFormat') === '1' || attrOf(rtag, 'customFormat') === 'true')) { const id = xfSid(+rsx); if (id) sh.rowS[r] = id; }
      if (rself) { p = rg + 1; continue; }
      const re = data.indexOf('</row>', rg); const rowEnd = re < 0 ? dn : re; p = re < 0 ? dn : re + 6;
      let q = rg + 1, seqC = -1;
      for (;;) {
        const cs = data.indexOf('<c', q); if (cs < 0 || cs >= rowEnd) break; const c2 = data.charCodeAt(cs + 2); if (c2 !== 32 && c2 !== 62 && c2 !== 47) { q = cs + 2; continue; }
        const cg = data.indexOf('>', cs); const ctag = data.slice(cs, cg); const cself = data.charCodeAt(cg - 1) === 47;
        let c; const ca = attrOf(ctag, 'r'); if (ca !== undefined) { const pr = parseCellRef(ca); c = pr ? pr[1] : seqC + 1; } else c = seqC + 1; seqC = c;
        const sa = attrOf(ctag, 's'); const sid = sa !== undefined ? xfSid(+sa) : 0; const t = attrOf(ctag, 't');
        let content = ''; if (cself) q = cg + 1; else { const ce = data.indexOf('</c>', cg); const end = ce < 0 ? rowEnd : ce; content = data.slice(cg + 1, end); q = ce < 0 ? rowEnd : ce + 4; }
        if (c < 0 || c >= MAXC) continue;
        let cell;
        if (content === '') { if (!sid) continue; cell = { v: undefined, s: sid }; sh.setRaw(r, c, cell); continue; }
        // pieces
        let v, f, fAttrs = null, fIsEmpty = false;
        const fs = content.indexOf('<f');
        if (fs >= 0 && (content.charCodeAt(fs + 2) === 62 || content.charCodeAt(fs + 2) === 32 || content.charCodeAt(fs + 2) === 47)) {
          const fg = content.indexOf('>', fs); const selfF = content.charCodeAt(fg - 1) === 47;
          if (fg > fs + 2) fAttrs = content.slice(fs + 2, selfF ? fg - 1 : fg);
          if (selfF) { f = ''; fIsEmpty = true; } else { const fe = content.indexOf('</f>', fg); f = unesc(content.slice(fg + 1, fe < 0 ? undefined : fe)); }
        }
        const vs = content.indexOf('<v>'); let vtxt;
        if (vs >= 0) { const ve = content.indexOf('</v>', vs); vtxt = ve < 0 ? undefined : content.slice(vs + 3, ve); } else { const v2 = content.indexOf('<v '); if (v2 >= 0) { const g = content.indexOf('>', v2); const ve = content.indexOf('</v>', g); if (ve > 0) vtxt = content.slice(g + 1, ve); } }
        if (t === 's') v = vtxt !== undefined ? sst[+vtxt] : undefined;
        else if (t === 'str') v = vtxt !== undefined ? unescX(vtxt) : '';
        else if (t === 'inlineStr') { let str = '', k = 0; for (;;) { const ts = content.indexOf('<t', k); if (ts < 0) break; const cc = content.charCodeAt(ts + 2); if (cc !== 62 && cc !== 32 && cc !== 47) { k = ts + 2; continue; } const g = content.indexOf('>', ts); if (content.charCodeAt(g - 1) === 47) { k = g + 1; continue; } const te = content.indexOf('</t>', g); str += unescX(content.slice(g + 1, te)); k = te + 4; } v = str; }
        else if (t === 'b') v = vtxt === '1' || vtxt === 'true';
        else if (t === 'e') v = vtxt !== undefined ? (ZN.errFromCode(unesc(vtxt)) || ZN.E.VALUE) : ZN.E.VALUE;
        else if (t === 'd') { const x = vtxt !== undefined ? isoToSerial(vtxt) : null; v = x === null ? vtxt : x; }
        else if (vtxt !== undefined) { const nv = +vtxt; v = vtxt === '' || nv !== nv ? undefined : nv; if (date1904 && v !== undefined && ctx.styles.date[sa !== undefined ? +sa : 0]) v += 1462; }
        if (f !== undefined && f !== null && fAttrs !== null && /\bt="shared"/.test(fAttrs)) {
          const si = /\bsi="(\d+)"/.exec(fAttrs); if (si) {
            if (!fIsEmpty && f !== '') { sharedF.set(si[1], { f: cleanF(f), r, c }); }
            else { const m = sharedF.get(si[1]); if (m) { f = FM.translate(m.f, r - m.r, c - m.c); } else f = ''; }
          }
        } else if (f !== undefined && f !== '') f = cleanF(f);
        if (f !== undefined && fAttrs !== null && /\bt="array"/.test(fAttrs)) { const ref = /\bref="([^"]+)"/.exec(fAttrs); if (ref) { const g = parseRange(ref[1]); if (g && (g[2] > g[0] || g[3] > g[1])) arrays.push(g); } }
        if (f) { cell = { v: v === undefined ? null : v, f }; if (v === undefined) delete cell.v; if (sid) cell.s = sid; if (cell.v === undefined) cell.v = undefined; }
        else { if (v === undefined && !sid) continue; cell = { v }; if (sid) cell.s = sid; }
        sh.setRaw(r, c, cell);
      }
    }
    // clear interior cells of multi-cell array formulas (the anchor re-spills on recalc)
    for (const g of arrays) for (let r = g[0]; r <= g[2]; r++) for (let c = g[1]; c <= g[3]; c++) { if (r === g[0] && c === g[1]) continue; const x = sh.getCell(r, c); if (x && x.f === undefined) sh.setRaw(r, c, x.s !== undefined ? { v: undefined, s: x.s } : undefined); }
    // merges
    const mcs = pick('mergeCells'); if (mcs) for (const m of kids(mcs, 'mergeCell')) { const g = parseRange(m.a.ref || ''); if (g && (g[0] !== g[2] || g[1] !== g[3])) sh.merges.push(g); }
    // protection
    const pr = pick('sheetProtection'); if (pr && (pr.a.sheet === '1' || pr.a.sheet === 'true')) sh.protect = true;
    // CF / DV
    try { sh.cf = readCf(pickAll('conditionalFormatting'), styles.dxfs, ctx.col); } catch (e) { sh.cf = []; }
    try { const dvs = pick('dataValidations'); if (dvs) sh.dv = readDv(dvs); } catch (e) { sh.dv = []; }
    // tables
    const tps = pick('tableParts');
    if (tps && ctx.rels) for (const tp of kids(tps, 'tablePart')) {
      const rel = ctx.rels[rid(tp.a)]; if (!rel || !ctx.files[rel.target]) continue;
      try { const t = readTable(U.utf8(ctx.files[rel.target])); if (t) sh.tables.push(t); } catch (e) { /* skip bad table */ }
    }
  }

  // ===================== reader =====================
  xlsx.read = (input) => {
    const u8 = U.toU8(input); let files;
    try { files = fflate.unzipSync(u8, { filter: (f) => /\.(xml|rels|vml)$/i.test(f.name) || f.name === '[Content_Types].xml' }); }
    catch (e) { throw new Error('This file is not a valid .xlsx workbook (the zip archive is corrupt or not a zip): ' + (e && e.message || e)); }
    const ftext = (p) => (files[p] ? U.utf8(files[p]) : null);
    let wbPath = 'xl/workbook.xml';
    const rr = ftext('_rels/.rels'); if (rr) { const root = tryParse(rr); if (root) for (const r of kids(root, 'Relationship')) if (/officeDocument$/.test(r.a.Type || '') && r.a.Target) wbPath = resolvePath('_rels/.rels'.replace('_rels/', ''), r.a.Target.replace(/^\//, '')); }
    if (!files[wbPath]) { if (files['xl/workbook.xml']) wbPath = 'xl/workbook.xml'; else throw new Error('This file is not a valid .xlsx workbook: xl/workbook.xml is missing'); }
    let wroot; try { wroot = parseXml(ftext(wbPath)); } catch (e) { throw new Error('Corrupt workbook.xml: ' + e.message); }
    const wrels = readRels(files, wbPath);
    const dir = wbPath.slice(0, wbPath.lastIndexOf('/') + 1);
    // theme
    let themeXml = null; for (const k in wrels) if (/theme$/.test(wrels[k].type)) themeXml = ftext(wrels[k].target); if (!themeXml) themeXml = ftext(dir + 'theme/theme1.xml');
    const theme = readTheme(themeXml); const colRes = makeColorResolver(theme, null);
    // styles
    let styles = { xfs: [{}], dxfs: [], numFmts: {}, date: [false] }; let stylesPath = null; for (const k in wrels) if (/styles$/.test(wrels[k].type)) stylesPath = wrels[k].target; stylesPath = stylesPath || dir + 'styles.xml';
    let col = colRes;
    if (files[stylesPath]) { try { styles = readStyles(ftext(stylesPath), theme); const ix = kid(kid(parseXml(ftext(stylesPath)), 'colors'), 'indexedColors'); if (ix) { const ov = kids(ix, 'rgbColor').map((c) => (c.a.rgb || '').slice(-6)); col = makeColorResolver(theme, ov); } } catch (e) { throw new Error('Corrupt styles.xml: ' + e.message); } }
    // shared strings
    let sst = []; let sstPath = null; for (const k in wrels) if (/sharedStrings$/.test(wrels[k].type)) sstPath = wrels[k].target; sstPath = sstPath || dir + 'sharedStrings.xml'; if (files[sstPath]) sst = readSst(ftext(sstPath));
    const wb = new ZN.Workbook();
    const sidCache = []; const xfSid = (i) => { let s = sidCache[i]; if (s === undefined) { const x = styles.xfs[i]; s = x && Object.keys(x).length ? wb.internStyle(x) : 0; sidCache[i] = s; } return s; };
    const bv = kid(kid(wroot, 'bookViews'), 'workbookView'); const wpr = kid(wroot, 'workbookPr'); const cpr = kid(wroot, 'calcPr');
    const date1904 = !!(wpr && (wpr.a.date1904 === '1' || wpr.a.date1904 === 'true'));
    if (date1904) wb.props.date1904 = true;
    const sheetNodes = kids(kid(wroot, 'sheets'), 'sheet'); if (!sheetNodes.length) throw new Error('This workbook contains no sheets');
    const sheetMap = []; let active = bv && bv.a.activeTab ? +bv.a.activeTab : 0;
    for (let i = 0; i < sheetNodes.length; i++) {
      const sn = sheetNodes[i]; const rel = wrels[rid(sn.a)]; let name = (sn.a.name || 'Sheet' + (i + 1)).slice(0, 255); if (wb.sheetByName(name)) name = wb.uniqueName(name);
      const sh = wb.addSheetRaw(name); if (sn.a.state === 'hidden' || sn.a.state === 'veryHidden') sh.hidden = sn.a.state === 'veryHidden' ? 'very' : true;
      sheetMap.push(sh);
      if (!rel || !files[rel.target]) continue; // chartsheets / missing parts: empty sheet
      if (!/worksheet$/.test(rel.type) && rel.type) { continue; }
      const ctx = { styles, sst, xfSid, date1904, col, files, rels: readRels(files, rel.target), selected: false };
      try { readSheet(sh, ftext(rel.target), ctx); } catch (e) { throw new Error('Corrupt worksheet "' + name + '": ' + e.message); }
    }
    if (active >= wb.sheets.length || active < 0) active = 0; wb.active = active;
    // defined names
    for (const dn of kids(kid(wroot, 'definedNames'), 'definedName')) {
      const nm = dn.a.name; if (!nm || /^_xlnm\./.test(nm) || dn.a.hidden === '1' && /^_xlnm/.test(nm)) continue;
      const ref = cleanF(text(dn)).trim(); if (!ref) continue; const sc = dn.a.localSheetId !== undefined ? sheetMap[+dn.a.localSheetId] : null;
      wb.names.set(wb.nameKey(nm, sc || null), { name: nm, ref, scope: sc ? sc.id : null });
    }
    wb.finish();
    return wb;
  };
  xlsx._x = { parseXml, parseRange, unesc, applyTint, parseSqref };

  // ===================================================================
  // ===================== WRITER =====================================
  // ===================================================================
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/g;
  const hex4 = (c) => '_x' + ('0000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4) + '_';
  function xe(s) { s = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return CTRL.test(s) ? (CTRL.lastIndex = 0, s.replace(CTRL, hex4)) : s; }
  const xa = (s) => xe(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
  const xt = (s) => { // <t> element with preserve when needed; also protect literal _xHHHH_
    s = String(s); if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_');
    return '<t' + (/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : '') + '>' + xe(s) + '</t>';
  };
  const hexOk = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const argb = (c) => 'FF' + c.slice(1).toUpperCase();
  const colorEl = (tag, c) => '<' + tag + ' rgb="' + argb(c) + '"/>';

  const FUT = new Set(('IFNA IFS SWITCH MAXIFS MINIFS CONCAT TEXTJOIN XLOOKUP XMATCH FILTER SORT SORTBY UNIQUE SEQUENCE RANDARRAY LET LAMBDA XOR DAYS ISOWEEKNUM STDEV.S STDEV.P VAR.S VAR.P MODE.SNGL MODE.MULT PERCENTILE.INC PERCENTILE.EXC PERCENTRANK.INC PERCENTRANK.EXC QUARTILE.INC QUARTILE.EXC RANK.EQ RANK.AVG NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV T.DIST T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST BINOM.DIST BINOM.INV EXPON.DIST GAMMA.DIST GAMMA.INV GAMMALN.PRECISE LOGNORM.DIST LOGNORM.INV POISSON.DIST WEIBULL.DIST Z.TEST COVARIANCE.P COVARIANCE.S CONFIDENCE.NORM CONFIDENCE.T CEILING.MATH FLOOR.MATH CEILING.PRECISE FLOOR.PRECISE TEXTBEFORE TEXTAFTER TEXTSPLIT VSTACK HSTACK TOCOL TOROW WRAPROWS WRAPCOLS TAKE DROP CHOOSEROWS CHOOSECOLS EXPAND MAP REDUCE SCAN BYROW BYCOL MAKEARRAY ARRAYTOTEXT VALUETOTEXT FORMULATEXT ISFORMULA SHEET SHEETS NUMBERVALUE UNICODE UNICHAR BITAND BITOR BITXOR BITLSHIFT BITRSHIFT DECIMAL ARABIC BASE COMBINA GAMMA GAUSS PHI PDURATION RRI SKEW.P ENCODEURL').split(' '));
  const WS = new Set(['FILTER', 'SORT']);
  function fOut(f) {
    return f.replace(/"(?:[^"]|"")*"|([A-Za-z][A-Za-z0-9.]*)\(/g, (m, fn) => { if (!fn) return m; const u = fn.toUpperCase(); return FUT.has(u) ? (WS.has(u) ? '_xlfn._xlws.' : '_xlfn.') + m : m; });
  }
  const NF_ID = {}; for (const k of Object.keys(BUILTIN)) { if (+k === 0) continue; if (NF_ID[BUILTIN[k]] === undefined) NF_ID[BUILTIN[k]] = +k; }

  class StyleReg {
    constructor() {
      this.fonts = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>']; this.fontIdx = new Map();
      this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']; this.fillIdx = new Map();
      this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']; this.borderIdx = new Map();
      this.nfs = new Map(); this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.xfIdx = new Map(); this.byStyle = new Map([[0, 0]]);
      this.dxfs = []; this.dxfIdx = new Map();
    }
    intern(list, idx, xml) { let i = idx.get(xml); if (i === undefined) { i = list.length; list.push(xml); idx.set(xml, i); } return i; }
    xf(wb, sid) {
      let r = this.byStyle.get(sid); if (r !== undefined) return r; const s = wb.style(sid);
      let font = 0; if (s.fn || s.fs || s.b || s.i || s.u || s.k || s.fc) {
        font = this.intern(this.fonts, this.fontIdx, '<font>' + (s.b ? '<b/>' : '') + (s.i ? '<i/>' : '') + (s.k ? '<strike/>' : '') + (s.u ? (+s.u === 2 ? '<u val="double"/>' : '<u/>') : '') + '<sz val="' + (s.fs || 11) + '"/>' + (hexOk(s.fc) ? colorEl('color', s.fc) : '<color theme="1"/>') + '<name val="' + xa(s.fn || 'Calibri') + '"/><family val="2"/></font>');
      }
      let fill = 0; if (hexOk(s.bg)) fill = this.intern(this.fills, this.fillIdx, '<fill><patternFill patternType="solid">' + colorEl('fgColor', s.bg) + '<bgColor indexed="64"/></patternFill></fill>');
      let border = 0; if (s.bl || s.br || s.bt || s.bb) {
        const side = (tag, v) => { if (!v) return '<' + tag + '/>'; const m = /^(\w+)\s*(#[0-9a-fA-F]{6})?$/.exec(v); if (!m || !BSTYLES[m[1]]) return '<' + tag + '/>'; return '<' + tag + ' style="' + m[1] + '">' + (m[2] ? colorEl('color', m[2]) : '<color auto="1"/>') + '</' + tag + '>'; };
        border = this.intern(this.borders, this.borderIdx, '<border>' + side('left', s.bl) + side('right', s.br) + side('top', s.bt) + side('bottom', s.bb) + '<diagonal/></border>');
      }
      let nfId = 0; if (s.nf && s.nf !== 'General') { const bid = NF_ID[s.nf] !== undefined ? NF_ID[s.nf] : (ZN.fmt && ZN.fmt.idByBuiltin && ZN.fmt.idByBuiltin[s.nf]); if (bid) nfId = bid; else { nfId = this.nfs.get(s.nf); if (nfId === undefined) { nfId = 164 + this.nfs.size; this.nfs.set(s.nf, nfId); } } }
      let al = ''; { const a = []; if (s.ha) a.push('horizontal="' + (s.ha === 'centerAcross' ? 'centerContinuous' : s.ha) + '"'); if (s.va) a.push('vertical="' + (s.va === 'middle' ? 'center' : s.va) + '"'); if (s.wr) a.push('wrapText="1"'); if (s.ind) a.push('indent="' + (s.ind | 0) + '"'); if (s.rot) { const t = s.rot === 255 ? 255 : s.rot < 0 ? 90 - s.rot : s.rot; a.push('textRotation="' + t + '"'); } if (s.shr) a.push('shrinkToFit="1"'); if (a.length) al = '<alignment ' + a.join(' ') + '/>'; }
      let pr = ''; if (s.lock === 0 || s.hid) pr = '<protection locked="' + (s.lock === 0 ? 0 : 1) + '" hidden="' + (s.hid ? 1 : 0) + '"/>';
      const xml = '<xf numFmtId="' + nfId + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0"' + (nfId ? ' applyNumberFormat="1"' : '') + (font ? ' applyFont="1"' : '') + (fill ? ' applyFill="1"' : '') + (border ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"' : '') + (pr ? ' applyProtection="1"' : '') + (al || pr ? '>' + al + pr + '</xf>' : '/>');
      r = this.intern(this.xfs, this.xfIdx, xml); this.byStyle.set(sid, r); return r;
    }
    dxf(st) {
      if (!st) return undefined; let f = '';
      if (st.b || st.i || st.u || st.k || hexOk(st.fc)) f = '<font>' + (st.b ? '<b/>' : '') + (st.i ? '<i/>' : '') + (st.k ? '<strike/>' : '') + (st.u ? (+st.u === 2 ? '<u val="double"/>' : '<u/>') : '') + (hexOk(st.fc) ? colorEl('color', st.fc) : '') + '</font>';
      const nf = st.nf && st.nf !== 'General' ? '<numFmt numFmtId="' + (NF_ID[st.nf] !== undefined ? NF_ID[st.nf] : 164 + (this.nfs.has(st.nf) ? this.nfs.size - 1 : (this.nfs.set(st.nf, 164 + this.nfs.size), this.nfs.size - 1))) + '" formatCode="' + xa(st.nf) + '"/>' : '';
      const fl = hexOk(st.bg) ? '<fill><patternFill patternType="solid">' + colorEl('fgColor', st.bg) + colorEl('bgColor', st.bg) + '</patternFill></fill>' : '';
      const xml = '<dxf>' + f + nf + fl + '</dxf>'; if (xml === '<dxf></dxf>') return undefined; return this.intern(this.dxfs, this.dxfIdx, xml);
    }
    xml() {
      const nfs = [...this.nfs].map(([code, id]) => '<numFmt numFmtId="' + id + '" formatCode="' + xa(code) + '"/>').join('');
      return XMLH + '<styleSheet xmlns="' + NS_MAIN + '">' + (nfs ? '<numFmts count="' + this.nfs.size + '">' + nfs + '</numFmts>' : '') +
        '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts><fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills><borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '<dxfs count="' + this.dxfs.length + '">' + this.dxfs.join('') + '</dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
    }
  }

  // ---- CF / DV writers ----
  const OPW = { gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual', eq: 'equal', ne: 'notEqual', between: 'between', notBetween: 'notBetween' };
  const ICON_W = { '3Stars': '3Symbols2', '3Triangles': '3Arrows', '5Boxes': '5Quarters', '3TrafficLights': '3TrafficLights1' };
  const valF = (v) => (v === undefined || v === null ? '' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'string' && v[0] === '=' ? fOut(v.slice(1)) : '"' + String(v).replace(/"/g, '""') + '"');
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  function cfvoXml(o, dflt) {
    o = o || { type: dflt }; const t = o.type === 'num' || o.type === 'percent' || o.type === 'percentile' || o.type === 'formula' || o.type === 'min' || o.type === 'max' ? o.type : 'num';
    const hasV = t !== 'min' && t !== 'max' && o.v !== undefined; let v = o.v; if (t === 'formula' && typeof v === 'string' && v[0] === '=') v = v.slice(1);
    return '<cfvo type="' + t + '"' + (hasV ? ' val="' + xa(v) + '"' : '') + (o.gte === false ? ' gte="0"' : '') + '/>';
  }
  function cfXml(sheet, reg) {
    const out = []; const rules = sheet.cf.slice().sort((a, b) => (a.priority || 0) - (b.priority || 0)); let pr = 0;
    for (const r of rules) {
      if (!r.ranges || !r.ranges.length) continue; const rg = r.ranges[0]; const tl = ZN.addr(rg[0], rg[1]); const sq = r.ranges.map((g) => ZN.rangeAddr(g[0], g[1], g[2], g[3])).join(' ');
      const dx = reg.dxf(r.style); const at = ' priority="' + (++pr) + '"' + (dx !== undefined ? ' dxfId="' + dx + '"' : '') + (r.stop ? ' stopIfTrue="1"' : ''); let x = '';
      switch (r.type) {
        case 'cell': x = '<cfRule type="cellIs"' + at + ' operator="' + (OPW[r.op] || 'equal') + '"><formula>' + xe(valF(r.v1)) + '</formula>' + (r.op === 'between' || r.op === 'notBetween' ? '<formula>' + xe(valF(r.v2)) + '</formula>' : '') + '</cfRule>'; break;
        case 'text': { const t = r.text || ''; const m = { contains: ['containsText', 'containsText', 'NOT(ISERROR(SEARCH(' + q(t) + ',' + tl + ')))'], notContains: ['notContainsText', 'notContains', 'ISERROR(SEARCH(' + q(t) + ',' + tl + '))'], begins: ['beginsWith', 'beginsWith', 'LEFT(' + tl + ',LEN(' + q(t) + '))=' + q(t)], ends: ['endsWith', 'endsWith', 'RIGHT(' + tl + ',LEN(' + q(t) + '))=' + q(t)] }[r.textOp || 'contains']; x = '<cfRule type="' + m[0] + '"' + at + ' operator="' + m[1] + '" text="' + xa(t) + '"><formula>' + xe(m[2]) + '</formula></cfRule>'; break; }
        case 'top': x = '<cfRule type="top10"' + at + (r.pct ? ' percent="1"' : '') + (r.bottom ? ' bottom="1"' : '') + ' rank="' + (r.n || 10) + '"/>'; break;
        case 'avg': x = '<cfRule type="aboveAverage"' + at + (r.above === false ? ' aboveAverage="0"' : '') + (r.equal ? ' equalAverage="1"' : '') + '/>'; break;
        case 'dupes': x = '<cfRule type="' + (r.unique ? 'uniqueValues' : 'duplicateValues') + '"' + at + '/>'; break;
        case 'blanks': x = '<cfRule type="containsBlanks"' + at + '><formula>LEN(TRIM(' + tl + '))=0</formula></cfRule>'; break;
        case 'noblanks': x = '<cfRule type="notContainsBlanks"' + at + '><formula>LEN(TRIM(' + tl + '))&gt;0</formula></cfRule>'; break;
        case 'errors': x = '<cfRule type="containsErrors"' + at + '><formula>ISERROR(' + tl + ')</formula></cfRule>'; break;
        case 'noerrors': x = '<cfRule type="notContainsErrors"' + at + '><formula>NOT(ISERROR(' + tl + '))</formula></cfRule>'; break;
        case 'date': {
          const TP = { today: ['today', 'FLOOR(' + tl + ',1)=TODAY()'], yesterday: ['yesterday', 'FLOOR(' + tl + ',1)=TODAY()-1'], tomorrow: ['tomorrow', 'FLOOR(' + tl + ',1)=TODAY()+1'], last7: ['last7Days', 'AND(TODAY()-FLOOR(' + tl + ',1)<=6,FLOOR(' + tl + ',1)<=TODAY())'], thismonth: ['thisMonth', 'AND(MONTH(' + tl + ')=MONTH(TODAY()),YEAR(' + tl + ')=YEAR(TODAY()))'], thisweek: ['thisWeek'], lastweek: ['lastWeek'], nextweek: ['nextWeek'], lastmonth: ['lastMonth'], nextmonth: ['nextMonth'] }[r.when];
          if (!TP) continue; x = '<cfRule type="timePeriod"' + at + ' timePeriod="' + TP[0] + '">' + (TP[1] ? '<formula>' + xe(TP[1]) + '</formula>' : '') + '</cfRule>'; break;
        }
        case 'formula': x = '<cfRule type="expression"' + at + '><formula>' + xe(fOut(String(r.formula || 'FALSE').replace(/^=/, ''))) + '</formula></cfRule>'; break;
        case 'colorScale': { const st = (r.stops || []).filter(Boolean); if (st.length < 2) continue; x = '<cfRule type="colorScale"' + at + '><colorScale>' + st.map((s) => cfvoXml(s)).join('') + st.map((s) => colorEl('color', hexOk(s.color) ? s.color : '#ffffff')).join('') + '</colorScale></cfRule>'; break; }
        case 'dataBar': x = '<cfRule type="dataBar"' + at + '><dataBar' + (r.showValue === false ? ' showValue="0"' : '') + '>' + cfvoXml(r.min, 'min') + cfvoXml(r.max, 'max') + colorEl('color', hexOk(r.color) ? r.color : '#638ec6') + '</dataBar></cfRule>'; break;
        case 'iconSet': { const th = r.thresholds || []; x = '<cfRule type="iconSet"' + at + '><iconSet iconSet="' + (ICON_W[r.name] || r.name || '3TrafficLights1') + '"' + (r.showValue === false ? ' showValue="0"' : '') + (r.reverse ? ' reverse="1"' : '') + '><cfvo type="percent" val="0"/>' + th.map((t) => cfvoXml(t)).join('') + '</iconSet></cfRule>'; break; }
        default: continue;
      }
      out.push('<conditionalFormatting sqref="' + sq + '">' + x + '</conditionalFormatting>');
    }
    return out.join('');
  }
  function dvXml(sheet) {
    const items = [];
    for (const d of sheet.dv) {
      if (!d.ranges || !d.ranges.length) continue; const t = { whole: 'whole', decimal: 'decimal', list: 'list', date: 'date', time: 'time', length: 'textLength', custom: 'custom' }[d.type]; if (!t) continue;
      let f1 = '', f2 = '';
      if (d.type === 'list') { if (d.list) f1 = '"' + d.list.map((s) => String(s).replace(/"/g, '""')).join(',') + '"'; else if (d.source) f1 = fOut(String(d.source).replace(/^=/, '')); else continue; }
      else if (d.type === 'custom') f1 = fOut(String(d.formula || d.v1 || 'TRUE').replace(/^=/, ''));
      else { f1 = valF(d.v1); if (f1 === '') f1 = '0'; if (d.op === 'between' || d.op === 'notBetween' || !d.op) f2 = valF(d.v2 === undefined ? d.v1 : d.v2); }
      const a = ['type="' + t + '"'];
      if (d.errStyle && d.errStyle !== 'stop') a.push('errorStyle="' + d.errStyle + '"');
      if (d.op && d.op !== 'between' && d.type !== 'list' && d.type !== 'custom') a.push('operator="' + (OPW[d.op] || 'equal') + '"');
      if (d.op === 'notBetween' && d.type !== 'list' && d.type !== 'custom') a.push('operator="notBetween"');
      if (d.allowBlank !== false) a.push('allowBlank="1"'); if (d.type === 'list' && d.dropdown === false) a.push('showDropDown="1"');
      if (d.showPrompt !== false && (d.prompt || d.promptTitle)) a.push('showInputMessage="1"'); if (d.showError !== false) a.push('showErrorMessage="1"');
      if (d.errTitle) a.push('errorTitle="' + xa(String(d.errTitle).slice(0, 32)) + '"'); if (d.errMsg) a.push('error="' + xa(String(d.errMsg).slice(0, 255)) + '"');
      if (d.promptTitle) a.push('promptTitle="' + xa(String(d.promptTitle).slice(0, 32)) + '"'); if (d.prompt) a.push('prompt="' + xa(String(d.prompt).slice(0, 255)) + '"');
      a.push('sqref="' + d.ranges.map((g) => ZN.rangeAddr(g[0], g[1], g[2], g[3])).join(' ') + '"');
      items.push('<dataValidation ' + [...new Set(a)].join(' ') + '><formula1>' + xe(f1) + '</formula1>' + (f2 ? '<formula2>' + xe(f2) + '</formula2>' : '') + '</dataValidation>');
    }
    return items.length ? '<dataValidations count="' + items.length + '">' + items.join('') + '</dataValidations>' : '';
  }

  // ---- charts ----
  const PALETTE = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '264478', '9E480E'];
  const CNS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '"';
  const REF_RE = /^(?:'((?:[^']|'')+)'|([^'!]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)$/;
  function refVals(wb, ref) {
    const m = REF_RE.exec(String(ref || '').trim()); if (!m) return null; const sh = wb.sheetByName((m[1] || m[2]).replace(/''/g, "'")); const g = parseRange(m[3]); if (!sh || !g) return null; const out = [];
    for (let c = g[1]; c <= g[3]; c++) for (let r = g[0]; r <= g[2]; r++) out.push(sh.getValue(r, c)); // note: column-major, fine for 1-D series
    const rowMajor = []; for (let r = g[0]; r <= g[2]; r++) for (let c = g[1]; c <= g[3]; c++) rowMajor.push(sh.getValue(r, c)); return rowMajor;
  }
  const isRef = (s) => REF_RE.test(String(s || '').trim());
  const refEl = (kind, wb, ref, fix) => { // kind 'num'|'str'
    const vals = refVals(wb, ref) || []; const f = xe(fix(ref));
    const pts = vals.map((v, i) => (v === null || v === undefined ? '' : '<c:pt idx="' + i + '"><c:v>' + xe(v instanceof ZN.ZErr ? v.code : kind === 'num' ? (typeof v === 'number' ? v : '') : U.rawText(v)) + '</c:v></c:pt>')).join('');
    if (kind === 'num') return '<c:numRef><c:f>' + f + '</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + vals.length + '"/>' + pts + '</c:numCache></c:numRef>';
    return '<c:strRef><c:f>' + f + '</c:f><c:strCache><c:ptCount val="' + vals.length + '"/>' + pts + '</c:strCache></c:strRef>';
  };
  const txRich = (t, sz, bold) => '<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '" b="' + (bold ? 1 : 0) + '"/></a:pPr><a:r><a:rPr lang="en-US" sz="' + sz + '" b="' + (bold ? 1 : 0) + '"/><a:t>' + xe(t) + '</a:t></a:r></a:p></c:rich></c:tx>';
  function chartXml(wb, ch, fix) {
    const type = ch.type || 'column'; const series = (ch.series || []).filter((s) => s && s.ref);
    const grp = ch.grouping === 'stacked' ? 'stacked' : ch.grouping === 'percent' ? 'percentStacked' : 'clustered';
    const sers = series.map((s, i) => ({ s, i, t: type === 'combo' ? (s.type || 'column') : type, ax: s.axis === 'secondary' ? 2 : 1 }));
    const col = (s, i) => { const c = hexOk(s.color) ? s.color.slice(1).toUpperCase() : PALETTE[i % PALETTE.length]; return c; };
    const serXml = (o, kind) => {
      const { s, i } = o; const c = col(s, i); let x = '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>';
      if (s.name) x += isRef(s.name) ? '<c:tx>' + refEl('str', wb, s.name, fix).replace(/^/, '') + '</c:tx>' : '<c:tx><c:v>' + xe(s.name) + '</c:v></c:tx>';
      if (kind === 'line' || kind === 'scatter') x += '<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill><a:round/></a:ln></c:spPr>' + (s.marker === false || (kind === 'scatter' && s.marker === false) ? '<c:marker><c:symbol val="none"/></c:marker>' : '<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill></c:spPr></c:marker>');
      else if (kind !== 'pie' && kind !== 'donut') x += '<c:spPr><a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill></c:spPr>' + (kind === 'column' || kind === 'bar' ? '<c:invertIfNegative val="0"/>' : '');
      if (s.labels || ch.labels) x += '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
      if (s.trend && kind !== 'pie' && kind !== 'donut') x += '<c:trendline><c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>';
      if (kind === 'scatter') { x += '<c:xVal>' + refEl('num', wb, s.xref || ch.cats, fix) + '</c:xVal><c:yVal>' + refEl('num', wb, s.ref, fix) + '</c:yVal><c:smooth val="' + (s.smooth ? 1 : 0) + '"/>'; }
      else { const cats = ch.cats && isRef(ch.cats) ? '<c:cat>' + refEl('str', wb, ch.cats, fix) + '</c:cat>' : ''; x += cats + '<c:val>' + refEl('num', wb, s.ref, fix) + '</c:val>' + (kind === 'line' ? '<c:smooth val="' + (s.smooth ? 1 : 0) + '"/>' : ''); }
      return x + '</c:ser>';
    };
    let plot = '<c:layout/>'; const axPairs = [];
    const kinds = ['column', 'bar', 'line', 'area', 'scatter', 'pie', 'donut'];
    for (const ax of [1, 2]) {
      const sub = sers.filter((o) => o.ax === ax); if (!sub.length) continue; const ids = ax === 1 ? [111, 112] : [113, 114]; let used = false;
      for (const k of kinds) {
        const ss = sub.filter((o) => o.t === k); if (!ss.length) continue; used = true; const ax2 = '<c:axId val="' + ids[0] + '"/><c:axId val="' + ids[1] + '"/>';
        if (k === 'column' || k === 'bar') plot += '<c:barChart><c:barDir val="' + (k === 'bar' ? 'bar' : 'col') + '"/><c:grouping val="' + grp + '"/><c:varyColors val="0"/>' + ss.map((o) => serXml(o, k)).join('') + '<c:gapWidth val="150"/>' + (grp !== 'clustered' ? '<c:overlap val="100"/>' : '') + ax2 + '</c:barChart>';
        else if (k === 'line') plot += '<c:lineChart><c:grouping val="' + (grp === 'clustered' ? 'standard' : grp) + '"/><c:varyColors val="0"/>' + ss.map((o) => serXml(o, k)).join('') + '<c:marker val="1"/>' + ax2 + '</c:lineChart>';
        else if (k === 'area') plot += '<c:areaChart><c:grouping val="' + (grp === 'clustered' ? 'standard' : grp) + '"/><c:varyColors val="0"/>' + ss.map((o) => serXml(o, k)).join('') + ax2 + '</c:areaChart>';
        else if (k === 'scatter') plot += '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' + ss.map((o) => serXml(o, k)).join('') + ax2 + '</c:scatterChart>';
        else if (k === 'pie') plot += '<c:pieChart><c:varyColors val="1"/>' + serXml(ss[0], 'pie') + '<c:firstSliceAng val="0"/></c:pieChart>';
        else if (k === 'donut') plot += '<c:doughnutChart><c:varyColors val="1"/>' + serXml(ss[0], 'donut') + '<c:firstSliceAng val="0"/><c:holeSize val="' + Math.round((ch.donutHole || 0.6) * 100) + '"/></c:doughnutChart>';
      }
      if (used && !sub.every((o) => o.t === 'pie' || o.t === 'donut')) axPairs.push({ ids, ax, scatter: sub.some((o) => o.t === 'scatter'), horiz: sub.some((o) => o.t === 'bar') });
    }
    for (const p of axPairs) {
      const sec = p.ax === 2; const catPos = p.horiz ? 'l' : 'b', valPos = p.horiz ? 'b' : 'l';
      const scaling = (min, max) => '<c:scaling><c:orientation val="minMax"/>' + (max !== undefined && max !== null && max !== '' ? '<c:max val="' + +max + '"/>' : '') + (min !== undefined && min !== null && min !== '' ? '<c:min val="' + +min + '"/>' : '') + '</c:scaling>';
      const title = (t, rot) => (t ? '<c:title>' + txRich(t, 1000, false).replace('<a:bodyPr/>', rot ? '<a:bodyPr rot="-5400000" vert="horz"/>' : '<a:bodyPr/>') + '<c:overlay val="0"/></c:title>' : '');
      if (p.scatter) plot += '<c:valAx><c:axId val="' + p.ids[0] + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="' + (sec ? 1 : 0) + '"/><c:axPos val="b"/>' + title(ch.xTitle) + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + p.ids[1] + '"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>';
      else plot += '<c:catAx><c:axId val="' + p.ids[0] + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="' + (sec ? 1 : 0) + '"/><c:axPos val="' + catPos + '"/>' + (sec ? '' : title(ch.xTitle)) + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + p.ids[1] + '"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
      plot += '<c:valAx><c:axId val="' + p.ids[1] + '"/>' + scaling(sec ? undefined : ch.ymin, sec ? undefined : ch.ymax) + '<c:delete val="0"/><c:axPos val="' + (sec ? 'r' : valPos) + '"/>' + (ch.gridlines !== false && !sec ? '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : '') + title(sec ? ch.y2Title : ch.yTitle, true) + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + p.ids[0] + '"/><c:crosses val="' + (sec ? 'max' : 'autoZero') + '"/><c:crossBetween val="' + (p.scatter ? 'midCat' : 'between') + '"/></c:valAx>';
    }
    const LP = { right: 'r', left: 'l', top: 't', bottom: 'b' };
    return XMLH + '<c:chartSpace ' + CNS + '><c:roundedCorners val="0"/><c:chart>' + (ch.title ? '<c:title>' + txRich(ch.title, 1400, true) + '<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>' : '<c:autoTitleDeleted val="1"/>') +
      '<c:plotArea>' + plot + '</c:plotArea>' + (ch.legend && ch.legend !== 'none' ? '<c:legend><c:legendPos val="' + (LP[ch.legend] || 'r') + '"/><c:overlay val="0"/></c:legend>' : '') + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }
  function posOf(sheet, x, y) { // px -> {idx, off(EMU)}
    const f = (pos, size, max) => { let acc = 0, i = 0; for (; i < max; i++) { const s = size(i); if (acc + s > pos) break; acc += s; } return { i, off: Math.round(Math.max(0, pos - acc) * 9525) }; };
    const c = f(x, (i) => sheet.colWidth(i), 16384), r = f(y, (i) => sheet.rowHeight(i), 1048576); return { c: c.i, co: c.off, r: r.i, ro: r.off };
  }

  // ---- worksheet writer ----
  function sheetXml(wb, sh, idx, reg, sst, o) {
    const rowsArr = []; let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
    sh.eachCellObj((cell, r, c) => {
      if (cell.v === undefined && cell.f === undefined && cell.s === undefined) return;
      (rowsArr[r] || (rowsArr[r] = [])).push(c, cell); if (r < minR) minR = r; if (r > maxR) maxR = r; if (c < minC) minC = c; if (c > maxC) maxC = c;
    });
    const parts = [XMLH, '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">'];
    if (sh.color && hexOk(sh.color)) parts.push('<sheetPr>' + colorEl('tabColor', sh.color) + '</sheetPr>');
    parts.push('<dimension ref="' + (maxR < 0 ? 'A1' : ZN.rangeAddr(minR, minC, maxR, maxC)) + '"/>');
    let sv = '<sheetView' + (sh.grid === false ? ' showGridLines="0"' : '') + (idx === wb.active ? ' tabSelected="1"' : '') + (sh.zoom && sh.zoom !== 1 ? ' zoomScale="' + Math.round(sh.zoom * 100) + '" zoomScaleNormal="' + Math.round(sh.zoom * 100) + '"' : '') + ' workbookViewId="0"';
    const fz = sh.freeze || { r: 0, c: 0 };
    if (fz.r > 0 || fz.c > 0) { const pane = fz.r > 0 && fz.c > 0 ? 'bottomRight' : fz.r > 0 ? 'bottomLeft' : 'topRight'; sv += '><pane' + (fz.c > 0 ? ' xSplit="' + fz.c + '"' : '') + (fz.r > 0 ? ' ySplit="' + fz.r + '"' : '') + ' topLeftCell="' + ZN.addr(fz.r, fz.c) + '" activePane="' + pane + '" state="frozen"/><selection pane="' + pane + '"/></sheetView>'; } else sv += '/>';
    parts.push('<sheetViews>' + sv + '</sheetViews>');
    const defW = sh.defColW || 64, defH = sh.defRowH || 20;
    parts.push('<sheetFormatPr defaultRowHeight="' + +(defH * 0.75).toFixed(2) + '"' + (Math.abs(defH - 20) > 0.01 ? ' customHeight="1"' : '') + ' defaultColWidth="' + (Math.trunc(defW / 7 * 256) / 256) + '"/>');
    // cols
    const colIdx = new Set([...Object.keys(sh.colW), ...Object.keys(sh.hiddenCols), ...Object.keys(sh.colS)].map(Number)); const cl = [...colIdx].filter((c) => c >= 0 && c < MAXC).sort((a, b) => a - b); const runs = [];
    for (const c of cl) {
      const w = sh.colW[c] !== undefined ? sh.colW[c] : defW, h = sh.hiddenCols[c] ? 1 : 0, st = sh.colS[c] ? reg.xf(wb, sh.colS[c]) : 0; const last = runs[runs.length - 1];
      if (last && last.max === c - 1 && last.w === w && last.h === h && last.st === st) last.max = c; else runs.push({ min: c, max: c, w, h, st });
    }
    if (runs.length) parts.push('<cols>' + runs.map((x) => '<col min="' + (x.min + 1) + '" max="' + (x.max + 1) + '" width="' + (Math.trunc(x.w / 7 * 256) / 256) + '" customWidth="1"' + (x.h ? ' hidden="1"' : '') + (x.st ? ' style="' + x.st + '"' : '') + '/>').join('') + '</cols>');
    // rows
    const extra = new Set([...Object.keys(sh.rowH), ...Object.keys(sh.hiddenRows), ...Object.keys(sh.rowS)].map(Number));
    const rowKeys = new Set(); rowsArr.forEach((_, r) => rowKeys.add(r)); for (const r of extra) if (r >= 0 && r < MAXR) rowKeys.add(r);
    parts.push('<sheetData>');
    for (const r of [...rowKeys].sort((a, b) => a - b)) {
      let at = ' r="' + (r + 1) + '"'; if (sh.rowS[r]) at += ' s="' + reg.xf(wb, sh.rowS[r]) + '" customFormat="1"'; if (sh.rowH[r] !== undefined) at += ' ht="' + +(sh.rowH[r] * 0.75).toFixed(2) + '" customHeight="1"'; if (sh.hiddenRows[r]) at += ' hidden="1"';
      const row = rowsArr[r]; if (!row) { parts.push('<row' + at + '/>'); continue; }
      const cs = []; const rn = r + 1;
      for (let k = 0; k < row.length; k += 2) {
        const c = row[k], cell = row[k + 1]; const ref = ZN.colName(c) + rn; const sa = cell.s ? ' s="' + reg.xf(wb, cell.s) + '"' : ''; const v = cell.v;
        if (cell.f !== undefined && cell.sp === undefined) {
          const sp = cell.spill; const fa = sp ? '<f t="array" ref="' + ZN.rangeAddr(r, c, sp.r2, sp.c2) + '">' : '<f>'; const ftxt = fa + xe(fOut(o.fixSheet(cell.f))) + '</f>';
          if (typeof v === 'number') cs.push('<c r="' + ref + '"' + sa + '>' + ftxt + (isFinite(v) ? '<v>' + v + '</v>' : '') + '</c>');
          else if (typeof v === 'string') cs.push('<c r="' + ref + '"' + sa + ' t="str">' + ftxt + '<v>' + xe(v) + '</v></c>');
          else if (typeof v === 'boolean') cs.push('<c r="' + ref + '"' + sa + ' t="b">' + ftxt + '<v>' + (v ? 1 : 0) + '</v></c>');
          else if (v instanceof ZN.ZErr) { const ec = errCode(v); cs.push(ec === null ? '<c r="' + ref + '"' + sa + '>' + ftxt + '<v>0</v></c>' : '<c r="' + ref + '"' + sa + ' t="e">' + ftxt + '<v>' + xe(ec) + '</v></c>'); }
          else cs.push('<c r="' + ref + '"' + sa + '>' + ftxt + '</c>');
          continue;
        }
        if (typeof v === 'number') { if (isFinite(v)) cs.push('<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>'); else cs.push('<c r="' + ref + '"' + sa + ' t="e"><v>#NUM!</v></c>'); }
        else if (typeof v === 'string') { let i = sst.map.get(v); if (i === undefined) { i = sst.list.length; sst.list.push(v); sst.map.set(v, i); } sst.count++; cs.push('<c r="' + ref + '"' + sa + ' t="s"><v>' + i + '</v></c>'); }
        else if (typeof v === 'boolean') cs.push('<c r="' + ref + '"' + sa + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>');
        else if (v instanceof ZN.ZErr) { const ec = errCode(v); cs.push(ec === null ? '<c r="' + ref + '"' + sa + '><v>0</v></c>' : '<c r="' + ref + '"' + sa + ' t="e"><v>' + xe(ec) + '</v></c>'); }
        else if (sa) cs.push('<c r="' + ref + '"' + sa + '/>');
      }
      parts.push('<row' + at + '>' + cs.join('') + '</row>');
    }
    parts.push('</sheetData>');
    if (sh.protect) parts.push('<sheetProtection sheet="1" objects="1" scenarios="1"/>');
    const mg = (sh.merges || []).filter((m) => m && (m[0] !== m[2] || m[1] !== m[3])); if (mg.length) parts.push('<mergeCells count="' + mg.length + '">' + mg.map((m) => '<mergeCell ref="' + ZN.rangeAddr(m[0], m[1], m[2], m[3]) + '"/>').join('') + '</mergeCells>');
    if (sh.cf && sh.cf.length) parts.push(cfXml(sh, reg));
    if (sh.dv && sh.dv.length) parts.push(dvXml(sh));
    parts.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
    if (o.drawingRid) parts.push('<drawing r:id="' + o.drawingRid + '"/>');
    if (o.tableRids && o.tableRids.length) parts.push('<tableParts count="' + o.tableRids.length + '">' + o.tableRids.map((x) => '<tablePart r:id="' + x + '"/>').join('') + '</tableParts>');
    parts.push('</worksheet>');
    return parts.join('');
  }
  function errCode(e) { const c = e.code; if (c === '#CIRC!') return null; if (c === '#GETTING_DATA') return '#N/A'; return c; }
  const TFN = { sum: 'sum', average: 'average', count: 'count', countNums: 'countNums', max: 'max', min: 'min', stdDev: 'stdDev', var: 'var' };
  function tableXml(t, id) {
    const hdr = t.header !== false; const tot = !!t.total; const ref = ZN.rangeAddr(t.r1, t.c1, t.r2, t.c2); const af = ZN.rangeAddr(t.r1, t.c1, tot ? t.r2 - 1 : t.r2, t.c2);
    const n = t.c2 - t.c1 + 1; const names = []; const seen = new Set();
    for (let i = 0; i < n; i++) { let nm = (t.cols && t.cols[i]) || 'Column' + (i + 1); while (seen.has(nm.toLowerCase())) nm += '_'; seen.add(nm.toLowerCase()); names.push(nm); }
    const sm = /^(light|medium|dark)(\d+)$/.exec(t.style || ''); const sname = sm ? 'TableStyle' + sm[1][0].toUpperCase() + sm[1].slice(1) + sm[2] : (t.style && t.style !== 'none' ? t.style : '');
    return XMLH + '<table xmlns="' + NS_MAIN + '" id="' + id + '" name="' + xa(t.name) + '" displayName="' + xa(t.name) + '" ref="' + ref + '"' + (hdr ? '' : ' headerRowCount="0"') + (tot ? ' totalsRowCount="1"' : ' totalsRowShown="0"') + '>' + (hdr && t.filter !== false ? '<autoFilter ref="' + af + '"/>' : '') +
      '<tableColumns count="' + n + '">' + names.map((nm, i) => '<tableColumn id="' + (i + 1) + '" name="' + xa(nm) + '"' + (tot && t.totals && TFN[t.totals[nm]] ? ' totalsRowFunction="' + TFN[t.totals[nm]] + '"' : '') + '/>').join('') + '</tableColumns>' +
      (sname || t.banded ? '<tableStyleInfo' + (sname ? ' name="' + sname + '"' : '') + ' showFirstColumn="' + (t.firstCol ? 1 : 0) + '" showLastColumn="' + (t.lastCol ? 1 : 0) + '" showRowStripes="' + (t.banded ? 1 : 0) + '" showColumnStripes="' + (t.bandedCols ? 1 : 0) + '"/>' : '') + '</table>';
  }

  xlsx.write = (wb) => {
    const files = {}; const put = (p, s) => { files[p] = U.utf8Enc(s); };
    const reg = new StyleReg(); const sst = { list: [], map: new Map(), count: 0 };
    // sheet names
    const used = new Set(); const names = wb.sheets.map((sh) => { let n = String(sh.name || 'Sheet').replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet'; let k = n, i = 2; while (used.has(k.toLowerCase())) { const sfx = ' ' + i++; k = n.slice(0, 31 - sfx.length) + sfx; } used.add(k.toLowerCase()); return k; });
    const renames = wb.sheets.map((sh, i) => [sh.name, names[i]]).filter(([a, b]) => a !== b);
    const fixSheet = (f) => { for (const [a, b] of renames) f = FM.renameSheet(f, a, b); return f; };
    const ct = []; const wrels = []; const sheetFiles = []; let tableId = 0, chartId = 0, drawId = 0; const usedTn = new Set();
    wb.sheets.forEach((sh, i) => {
      const n = i + 1; const rels = []; const o = { fixSheet: renames.length ? fixSheet : (f) => f, tableRids: [], drawingRid: null };
      for (const t of sh.tables || []) {
        let nm = String(t.name || 'Table').replace(/[^\w.\u0080-￿]/g, '_'); if (/^\d/.test(nm)) nm = '_' + nm; while (usedTn.has(nm.toLowerCase())) nm += '_'; usedTn.add(nm.toLowerCase()); const id = ++tableId;
        put('xl/tables/table' + id + '.xml', tableXml(Object.assign({}, t, { name: nm }), id)); const rid2 = 'rId' + (rels.length + 1); rels.push('<Relationship Id="' + rid2 + '" Type="' + REL + 'table" Target="../tables/table' + id + '.xml"/>'); o.tableRids.push(rid2);
        ct.push('<Override PartName="/xl/tables/table' + id + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>');
      }
      const charts = (sh.charts || []).filter((c) => c && c.series && c.series.length);
      if (charts.length) {
        const did = ++drawId; const drels = []; let dx = '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">';
        charts.forEach((ch, k) => {
          const cid = ++chartId; put('xl/charts/chart' + cid + '.xml', chartXml(wb, ch, (r) => fixSheet(r))); ct.push('<Override PartName="/xl/charts/chart' + cid + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
          drels.push('<Relationship Id="rId' + (k + 1) + '" Type="' + REL + 'chart" Target="../charts/chart' + cid + '.xml"/>');
          const p = posOf(sh, ch.x || 0, ch.y || 0); const cx = Math.round((ch.w || 480) * 9525), cy = Math.round((ch.h || 288) * 9525);
          dx += '<xdr:oneCellAnchor><xdr:from><xdr:col>' + p.c + '</xdr:col><xdr:colOff>' + p.co + '</xdr:colOff><xdr:row>' + p.r + '</xdr:row><xdr:rowOff>' + p.ro + '</xdr:rowOff></xdr:from><xdr:ext cx="' + cx + '" cy="' + cy + '"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (k + 2) + '" name="Chart ' + (k + 1) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId' + (k + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>';
        });
        put('xl/drawings/drawing' + did + '.xml', XMLH + dx + '</xdr:wsDr>'); put('xl/drawings/_rels/drawing' + did + '.xml.rels', XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drels.join('') + '</Relationships>');
        ct.push('<Override PartName="/xl/drawings/drawing' + did + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
        o.drawingRid = 'rId' + (rels.length + 1); rels.push('<Relationship Id="' + o.drawingRid + '" Type="' + REL + 'drawing" Target="../drawings/drawing' + did + '.xml"/>');
      }
      put('xl/worksheets/sheet' + n + '.xml', sheetXml(wb, sh, i, reg, sst, o));
      if (rels.length) put('xl/worksheets/_rels/sheet' + n + '.xml.rels', XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
      ct.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      wrels.push('<Relationship Id="rId' + n + '" Type="' + REL + 'worksheet" Target="worksheets/sheet' + n + '.xml"/>');
      sheetFiles.push(n);
    });
    const N = wb.sheets.length;
    // workbook.xml
    const dn = [];
    for (const nm of wb.names.values()) {
      if (!/^[A-Za-z_\\\u0080-￿][\w.\\\u0080-￿]*$/.test(nm.name) || /^[A-Za-z]{1,3}\d+$/i.test(nm.name) || /^[RrCc]$/.test(nm.name)) continue;
      const sc = nm.scope ? wb.sheets.findIndex((s) => s.id === nm.scope) : -1; dn.push('<definedName name="' + xa(nm.name) + '"' + (sc >= 0 ? ' localSheetId="' + sc + '"' : '') + '>' + xe(fOut(fixSheet(String(nm.ref).replace(/^=/, '')))) + '</definedName>');
    }
    const visible = wb.sheets.findIndex((s) => !s.hidden);
    put('xl/workbook.xml', XMLH + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><workbookPr defaultThemeVersion="124226"/><bookViews><workbookView activeTab="' + Math.min(Math.max(wb.active || 0, 0), N - 1) + '"' + (visible > 0 && wb.sheets[wb.active || 0] && wb.sheets[wb.active || 0].hidden ? ' firstSheet="' + visible + '"' : '') + '/></bookViews><sheets>' +
      wb.sheets.map((sh, i) => '<sheet name="' + xa(names[i]) + '" sheetId="' + (i + 1) + '"' + (sh.hidden ? ' state="' + (sh.hidden === 'very' ? 'veryHidden' : 'hidden') + '"' : '') + ' r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' + (dn.length ? '<definedNames>' + dn.join('') + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    wrels.push('<Relationship Id="rId' + (N + 1) + '" Type="' + REL + 'styles" Target="styles.xml"/>', '<Relationship Id="rId' + (N + 2) + '" Type="' + REL + 'sharedStrings" Target="sharedStrings.xml"/>');
    put('xl/_rels/workbook.xml.rels', XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wrels.join('') + '</Relationships>');
    put('xl/styles.xml', reg.xml());
    put('xl/sharedStrings.xml', XMLH + '<sst xmlns="' + NS_MAIN + '" count="' + sst.count + '" uniqueCount="' + sst.list.length + '">' + sst.list.map((s) => '<si>' + xt(s) + '</si>').join('') + '</sst>');
    put('_rels/.rels', XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    put('docProps/app.xml', XMLH + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ZengNumbers</Application></Properties>');
    put('docProps/core.xml', XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + (wb.props && wb.props.title ? '<dc:title>' + xe(wb.props.title) + '</dc:title>' : '') + '<dc:creator>' + xe((wb.props && wb.props.author) || 'ZengNumbers') + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>');
    put('[Content_Types].xml', XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ct.join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    // [Content_Types].xml first
    const ordered = { '[Content_Types].xml': files['[Content_Types].xml'] }; for (const k of Object.keys(files)) if (k !== '[Content_Types].xml') ordered[k] = files[k];
    return fflate.zipSync(ordered, { level: 6 });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
