/* vCard 2.1 / 3.0 / 4.0 parser + writer. UMD: browser global ZVCard, node module.exports.
   Contact shape (shared with model.js):
   {id,prefix,first,middle,last,suffix,nick,pFirst,pLast,org,dept,title,isOrg,
    phones:[{l,v,x?}],emails:[{l,v,x?}],urls:[{l,v,x?}],addrs:[{l,street,city,state,zip,country,pobox,ext,x?}],
    bday:'YYYY-MM-DD'|'--MM-DD'|'', dates:[{l,v}], related:[{l,v}], social:[{l,v}], ims:[{l,v}],
    notes, photo:dataURI|'', fav, cats:[names], uid, rev, x:[{g?,n,p:[[k,v]],v}]}   (x = preserved raw properties) */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ZVCard = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const enc = new TextEncoder();
  const utf8len = (s) => enc.encode(s).length;

  // ---------- low level ----------
  function decodeBytes(bytes, charset) {
    const cs = (charset || '').toLowerCase().replace(/^"|"$/g, '');
    const tryDec = (label, fatal) => { try { return new TextDecoder(label, { fatal }).decode(bytes); } catch { return null; } };
    if (cs && !/^utf-?8$/.test(cs)) { const r = tryDec(cs === 'latin1' ? 'iso-8859-1' : cs, false); if (r != null) return r; }
    const r = tryDec('utf-8', true); if (r != null) return r;
    return tryDec('windows-1252', false) ?? String.fromCharCode(...bytes);
  }
  function decodeBuffer(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    let s = decodeBytes(b, ''); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return s;
  }
  function qpBytes(s) {
    const out = []; for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else { const cp = s.codePointAt(i); if (cp > 0xffff) i++; if (cp < 128) out.push(cp); else out.push(...enc.encode(String.fromCodePoint(cp))); }
    }
    return new Uint8Array(out);
  }
  const qpDecode = (s, charset) => decodeBytes(qpBytes(s), charset).replace(/\r\n?/g, '\n');
  function qpEncode(s) {
    // returns a single logical string (no soft breaks); caller folds
    const bytes = enc.encode(s); let o = '';
    for (const b of bytes) { if (b === 10) o += '=0A'; else if (b === 13) o += '=0D'; else if ((b >= 33 && b <= 126 && b !== 61) || b === 32) o += String.fromCharCode(b); else o += '=' + b.toString(16).toUpperCase().padStart(2, '0'); }
    return o;
  }
  const unesc = (s) => s.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const escSemi = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;');
  function splitUnescaped(s, ch) { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; } else if (c === ch) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
  function splitQuoted(s, ch) { const out = []; let cur = '', q = false; for (const c of s) { if (c === '"') { q = !q; cur += c; } else if (c === ch && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }

  function unfold(text) {
    const lines = text.split(/\r\n|\n|\r/); const out = []; let cur = null;
    for (const line of lines) {
      if (cur) {
        if (cur.qp && cur.t.endsWith('=')) { cur.t = cur.t.slice(0, -1) + line; continue; }
        if (/^[ \t]/.test(line)) { cur.t += line.slice(1); continue; }
        out.push(cur.t);
      }
      cur = { t: line, qp: /^[^:]*;[^:]*QUOTED-PRINTABLE/i.test(line) };
    }
    if (cur) out.push(cur.t);
    return out.filter((l) => l.length);
  }
  function parseLine(line) {
    let q = false, idx = -1;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) { idx = i; break; } }
    if (idx < 0) return null;
    const head = splitQuoted(line.slice(0, idx), ';'); const raw = line.slice(idx + 1);
    let name = head[0].trim(), group = '';
    const dot = name.indexOf('.'); if (dot > 0) { group = name.slice(0, dot); name = name.slice(dot + 1); }
    const params = [];
    for (const p of head.slice(1)) {
      if (!p) continue; const eq = p.indexOf('=');
      if (eq < 0) { const u = p.trim().toUpperCase(); params.push([/^(QUOTED-PRINTABLE|BASE64|B|8BIT|7BIT)$/.test(u) ? 'ENCODING' : 'TYPE', p.trim()]); }
      else params.push([p.slice(0, eq).trim().toUpperCase(), p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')]);
    }
    return { g: group, n: name.toUpperCase(), p: params, raw };
  }
  const pget = (pr, k) => { const f = pr.p.find((x) => x[0] === k); return f ? f[1] : ''; };
  const types = (pr) => pr.p.filter((x) => x[0] === 'TYPE').flatMap((x) => x[1].split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isQP = (pr) => /QUOTED-PRINTABLE/i.test(pget(pr, 'ENCODING'));
  const isB64 = (pr) => /^(B|BASE64)$/i.test(pget(pr, 'ENCODING'));
  // component values: array of decoded strings
  function comps(pr, sep = ';') {
    if (isQP(pr)) return pr.raw.split(sep).map((c) => qpDecode(c, pget(pr, 'CHARSET')));
    return splitUnescaped(pr.raw, sep).map(unesc);
  }
  const text = (pr) => (isQP(pr) ? qpDecode(pr.raw, pget(pr, 'CHARSET')) : unesc(pr.raw));
  const cleanLabel = (s) => { s = String(s || '').trim(); const m = s.match(/^_\$!<(.*)>!\$_$/); return (m ? m[1] : s).trim(); };

  // ---------- labels ----------
  const STD = ['mobile', 'home', 'work', 'other', 'main', 'fax', 'pager', 'home fax', 'work fax', 'iphone', 'homepage', 'school'];
  const normLabel = (s) => { const sys = /^_\$!<.*>!\$_$/.test(String(s || '').trim()); s = cleanLabel(s); if (sys) s = s.toLowerCase(); const l = s.toLowerCase(); if (l === 'cell' || l === 'cellular') return 'mobile'; if (l === 'homepage' || l === 'home page') return 'homepage'; if (STD.includes(l)) return l; return s; };
  function labelFromTypes(prop, ts) {
    const t = ts.filter((x) => !['voice', 'pref', 'internet', 'x400', 'msg', 'text', 'textphone', 'x-inet', 'postal', 'parcel', 'dom', 'intl'].includes(x));
    if (prop === 'TEL') {
      if (t.includes('fax')) return t.includes('home') ? 'home fax' : t.includes('work') ? 'work fax' : 'fax';
      if (t.includes('iphone')) return 'iphone';
      if (t.includes('cell') || t.includes('mobile')) return 'mobile';
      for (const k of ['home', 'work', 'pager', 'main', 'car', 'video', 'bbs', 'modem', 'isdn']) if (t.includes(k)) return k;
      return 'other';
    }
    for (const k of ['home', 'work']) if (t.includes(k)) return k;
    return t[0] && !['pref'].includes(t[0]) ? normLabel(t[0]) : 'other';
  }
  const TEL_TYPES = { mobile: ['CELL'], home: ['HOME'], work: ['WORK'], fax: ['FAX'], 'home fax': ['HOME', 'FAX'], 'work fax': ['WORK', 'FAX'], pager: ['PAGER'], main: ['PREF'], iphone: ['IPHONE', 'CELL'] };
  const SIMPLE_TYPES = { home: ['HOME'], work: ['WORK'] };

  // ---------- date helpers ----------
  function parseDate(s) {
    s = String(s || '').trim(); if (!s) return '';
    let m;
    if ((m = s.match(/^--(\d\d)-?(\d\d)/))) return `--${m[1]}-${m[2]}`;
    if ((m = s.match(/^(\d{4})-?(\d\d)-?(\d\d)/))) return (m[1] === '1604' || m[1] === '0000' || m[1] === '1900' && false) ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }
  const tsFromRev = (s) => { const m = String(s).match(/^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d):?(\d\d):?(\d\d))?/); if (!m) return 0; return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); };
  const revFromTs = (t) => new Date(t || Date.now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

  // ---------- photos ----------
  function sniff(b64) { const h = b64.slice(0, 12); if (h.startsWith('/9j/')) return 'image/jpeg'; if (h.startsWith('iVBOR')) return 'image/png'; if (h.startsWith('R0lGOD')) return 'image/gif'; if (h.startsWith('UklGR')) return 'image/webp'; return ''; }
  const mimeOf = (t) => { t = (t || '').toLowerCase().replace(/^image\//, ''); return t === 'jpg' || t === 'jpeg' ? 'image/jpeg' : t === 'png' ? 'image/png' : t === 'gif' ? 'image/gif' : t === 'webp' ? 'image/webp' : ''; };
  function parsePhoto(pr) {
    let raw = pr.raw.trim();
    if (/^data:/i.test(raw)) { const m = raw.match(/^data:([^;,]*)(;[^,]*)?,(.*)$/is); if (!m) return ''; const b = /base64/i.test(m[2] || ''); const d = b ? m[3].replace(/\s+/g, '') : btoa(unescape(m[3])); return `data:${m[1] || sniff(d) || 'image/jpeg'};base64,${d}`; }
    if (/^https?:|^file:/i.test(raw)) return '';
    const t = types(pr)[0] || ''; const b64 = raw.replace(/\s+/g, '');
    if (!b64 || !/^[A-Za-z0-9+/=_-]+$/.test(b64)) return '';
    return `data:${sniff(b64) || mimeOf(t) || 'image/jpeg'};base64,${b64}`;
  }

  // ---------- IM ----------
  const IM_X = { 'X-AIM': 'aim', 'X-JABBER': 'jabber', 'X-YAHOO': 'yahoo', 'X-MSN': 'msn', 'X-ICQ': 'icq', 'X-SKYPE': 'skype', 'X-SKYPE-USERNAME': 'skype', 'X-GOOGLE-TALK': 'google talk', 'X-GADUGADU': 'gadu-gadu', 'X-GROUPWISE': 'groupwise', 'X-QQ': 'qq' };
  const BLANK = () => ({ id: '', prefix: '', first: '', middle: '', last: '', suffix: '', nick: '', pFirst: '', pLast: '', org: '', dept: '', title: '', isOrg: false, phones: [], emails: [], urls: [], addrs: [], bday: '', dates: [], related: [], social: [], ims: [], notes: '', photo: '', fav: false, cats: [], uid: '', rev: 0, x: [], cad: null, lc: '', log: [] });

  // ---------- parse ----------
  function parse(input) {
    const textIn = typeof input === 'string' ? input.replace(/^\ufeff/, '') : decodeBuffer(input);
    const lines = unfold(textIn); const contacts = [], warnings = []; let cur = null, nested = 0, version = '';
    for (const line of lines) {
      const pr = parseLine(line); if (!pr) continue;
      if (pr.n === 'BEGIN' && /^vcard$/i.test(pr.raw.trim())) { if (cur) { try { contacts.push(finish(cur)); } catch (e) { warnings.push(e.message); } } cur = []; continue; }
      if (pr.n === 'END' && /^vcard$/i.test(pr.raw.trim())) { if (cur) { try { contacts.push(finish(cur)); } catch (e) { warnings.push(e.message); } } cur = null; continue; }
      if (cur) { cur.push(pr); if (pr.n === 'VERSION') version = pr.raw.trim(); }
    }
    if (cur && cur.length) { warnings.push('Last card was missing END:VCARD'); try { contacts.push(finish(cur)); } catch (e) { warnings.push(e.message); } }
    return { contacts: contacts.filter(Boolean), warnings, version };
  }

  function finish(props) {
    const c = BLANK(); let fn = '', hasN = false; let showAsCompany = false;
    // group map: group -> {label, others:[props], main:[entries]}
    const groups = {};
    props.forEach((pr) => { if (pr.g) (groups[pr.g.toLowerCase()] ||= { label: '', props: [] }).props.push(pr); });
    for (const g of Object.values(groups)) { const l = g.props.find((p) => p.n === 'X-ABLABEL'); if (l) g.label = text(l).trim(); }
    const MAIN = new Set(['TEL', 'EMAIL', 'URL', 'ADR', 'X-ABDATE', 'X-ABRELATEDNAMES', 'RELATED', 'X-SOCIALPROFILE', 'IMPP']);
    const consumed = new Set();
    // attach extras of a group to its main property
    const extrasFor = (pr) => { if (!pr.g) return []; const g = groups[pr.g.toLowerCase()]; if (!g) return []; const out = []; for (const o of g.props) { if (o === pr || o.n === 'X-ABLABEL' || MAIN.has(o.n)) continue; if (!consumed.has(o)) { consumed.add(o); out.push({ n: o.n, p: o.p, v: o.raw }); } } return out; };
    const labelOf = (pr, def) => { const g = pr.g && groups[pr.g.toLowerCase()]; if (g && g.label) return normLabel(g.label); return def; };
    const add = (arr, e, pr) => { const x = extrasFor(pr); if (x.length) e.x = x; arr.push(e); };

    for (const pr of props) {
      const n = pr.n; const ts = types(pr);
      switch (n) {
        case 'VERSION': case 'PRODID': case 'X-ABLABEL': case 'BEGIN': case 'END': break;
        case 'N': { const p = comps(pr); hasN = p.some(Boolean); c.last = (p[0] || '').trim(); c.first = (p[1] || '').trim(); c.middle = (p[2] || '').trim(); c.prefix = (p[3] || '').trim(); c.suffix = (p[4] || '').trim(); break; }
        case 'FN': fn = text(pr).trim(); break;
        case 'NICKNAME': c.nick = comps(pr, ',').filter(Boolean).join(', '); break;
        case 'X-PHONETIC-FIRST-NAME': c.pFirst = text(pr); break;
        case 'X-PHONETIC-LAST-NAME': c.pLast = text(pr); break;
        case 'ORG': { const p = comps(pr); c.org = (p[0] || '').trim(); c.dept = p.slice(1).filter(Boolean).join(' / '); break; }
        case 'TITLE': c.title = text(pr).trim(); break;
        case 'ROLE': if (!c.title) c.title = text(pr).trim(); else c.x.push({ n, p: pr.p, v: pr.raw }); break;
        case 'NOTE': c.notes = c.notes ? c.notes + '\n' + text(pr) : text(pr); break;
        case 'PHOTO': { const ph = parsePhoto(pr); if (ph) c.photo = ph; else c.x.push({ n, p: pr.p, v: pr.raw }); break; }
        case 'BDAY': { const raw = text(pr); let d = parseDate(raw); if (pget(pr, 'X-APPLE-OMIT-YEAR') && d.length === 10) d = '--' + d.slice(5); c.bday = d; break; }
        case 'CATEGORIES': comps(pr, ',').forEach((s) => { s = s.trim(); if (s && !c.cats.includes(s)) c.cats.push(s); }); break;
        case 'UID': c.uid = text(pr).trim(); break;
        case 'REV': c.rev = tsFromRev(pr.raw); break;
        case 'KIND': if (/^org$/i.test(pr.raw.trim())) showAsCompany = true; else c.x.push({ n, p: pr.p, v: pr.raw }); break;
        case 'X-ABSHOWAS': if (/company/i.test(pr.raw)) showAsCompany = true; break;
        case 'X-ZENG-CADENCE': { const m = pr.raw.trim().match(/^(\d+)([DWMY])$/i); if (m) c.cad = { n: +m[1], u: { D: 'day', W: 'week', M: 'month', Y: 'year' }[m[2].toUpperCase()] }; break; }
        case 'X-ZENG-LAST': c.lc = parseDate(pr.raw).replace(/^--.*/, ''); break;
        case 'X-ZENG-LOG': { const p = comps(pr); const t = +p[0]; if (t) c.log.push({ id: 'l' + t.toString(36) + c.log.length, t, k: p[1] === 'note' ? 'note' : 'catchup', note: p[2] || '' }); break; }
        case 'X-ZENG-FAV': c.fav = /^(1|true)$/i.test(pr.raw.trim()); break;
        case 'TEL': add(c.phones, { l: labelOf(pr, labelFromTypes('TEL', ts)), v: text(pr).replace(/^tel:/i, '').trim() }, pr); break;
        case 'EMAIL': add(c.emails, { l: labelOf(pr, labelFromTypes('EMAIL', ts)), v: text(pr).replace(/^mailto:/i, '').trim() }, pr); break;
        case 'URL': add(c.urls, { l: labelOf(pr, labelFromTypes('URL', ts)), v: text(pr).trim() }, pr); break;
        case 'ADR': {
          const p = comps(pr); add(c.addrs, { l: labelOf(pr, labelFromTypes('ADR', ts)), pobox: p[0] || '', ext: p[1] || '', street: p[2] || '', city: p[3] || '', state: p[4] || '', zip: p[5] || '', country: p[6] || '' }, pr); break;
        }
        case 'X-ABDATE': { const d = parseDate(text(pr)); if (d) c.dates.push({ l: labelOf(pr, 'other') || 'other', v: d }); break; }
        case 'ANNIVERSARY': { const d = parseDate(text(pr)); if (d) c.dates.push({ l: 'anniversary', v: d }); break; }
        case 'X-ABRELATEDNAMES': c.related.push({ l: labelOf(pr, 'other'), v: text(pr).trim() }); break;
        case 'RELATED': c.related.push({ l: ts[0] || 'other', v: text(pr).replace(/^urn:uuid:/i, '').trim() }); break;
        case 'X-SOCIALPROFILE': { const u = pget(pr, 'X-USER'); c.social.push({ l: (ts[0] || labelOf(pr, 'other')).toLowerCase(), v: u || text(pr).trim() }); break; }
        case 'IMPP': { const raw = text(pr).trim(); const m = raw.match(/^([a-z][\w+.-]*):(.*)$/i); const svc = (pget(pr, 'X-SERVICE-TYPE') || (m ? m[1] : 'other')).toLowerCase(); c.ims.push({ l: svc, v: m ? m[2] : raw }); break; }
        default:
          if (IM_X[n]) { c.ims.push({ l: IM_X[n], v: text(pr).trim() }); break; }
          if (consumed.has(pr)) break;
          if (pr.g && groups[pr.g.toLowerCase()] && groups[pr.g.toLowerCase()].props.some((o) => MAIN.has(o.n))) break; // attached to its main prop
          c.x.push({ g: pr.g || undefined, n, p: pr.p, v: pr.raw });
      }
    }
    // groups whose main property was something we did not model keep their label prop
    for (const g of Object.values(groups)) if (g.label && !g.props.some((p) => MAIN.has(p.n))) { /* orphan label dropped */ }
    if (!hasN && fn) {
      if (showAsCompany || (c.org && c.org === fn)) { c.isOrg = true; if (!c.org) c.org = fn; }
      else { const parts = fn.split(/\s+/); if (parts.length > 1) { c.last = parts.pop(); c.first = parts.join(' '); } else c.first = fn; }
    }
    if (showAsCompany) c.isOrg = true;
    return c;
  }

  // ---------- write ----------
  function fold(line) {
    if (utf8len(line) <= 75) return line;
    let out = '', cur = '', len = 0, first = true;
    for (const ch of line) {
      const l = utf8len(ch); const max = first ? 75 : 74;
      if (len + l > max) { out += cur + '\r\n '; cur = ''; len = 0; first = false; }
      cur += ch; len += l;
    }
    return out + cur;
  }
  function qpFold(prefix, enc_) {
    // soft-wrap QP encoded text at 75 columns
    let out = prefix, col = prefix.length;
    for (let i = 0; i < enc_.length;) {
      const tok = enc_[i] === '=' ? enc_.substr(i, 3) : enc_[i];
      if (col + tok.length > 74) { out += '=\r\n'; col = 0; }
      out += tok; col += tok.length; i += tok.length;
    }
    return out;
  }

  function fullName(c) {
    const n = [c.prefix, c.first, c.middle, c.last, c.suffix].filter(Boolean).join(' ').trim();
    return n || c.org || (c.emails[0] && c.emails[0].v) || (c.phones[0] && c.phones[0].v) || 'No Name';
  }

  function write(contacts, opts = {}) {
    const ver = opts.version || '3.0'; const v2 = ver === '2.1', v4 = ver === '4.0'; const out = [];
    for (const c of contacts) out.push(writeOne(c, ver, v2, v4));
    return out.join('');
  }

  function writeOne(c, ver, v2, v4) {
    const lines = []; let itemN = 0;
    const needQP = (s) => v2 && /[^\x20-\x7e]/.test(s);
    // emit property: name, params array of strings, value parts (array = structured)
    const emit = (name, params, val, o = {}) => {
      const grp = o.group ? o.group + '.' : '';
      const structured = Array.isArray(val); const parts = structured ? val : [val];
      const qp = v2 && parts.some((p) => /[^\x20-\x7e]/.test(String(p)));
      const ps = params.slice(); if (qp) ps.push('ENCODING=QUOTED-PRINTABLE', 'CHARSET=UTF-8');
      const head = grp + name + (ps.length ? ';' + ps.join(';') : '') + ':';
      if (qp) { lines.push(qpFold(head, parts.map((p) => qpEncode(String(p)).replace(/;/g, '=3B')).join(structured ? ';' : ''))); return; }
      const e = o.raw ? (s) => s : structured ? (v2 ? escSemi : esc) : (v2 ? escSemi : esc);
      let value = structured ? parts.map((p) => (o.comma ? esc(p) : e(String(p)))).join(';') : e(String(parts[0]));
      lines.push(fold(head + value));
    };
    const typeParams = (list) => (!list.length ? [] : v2 ? list : [`TYPE=${(v4 ? list.map((s) => s.toLowerCase()) : list).join(',')}`]);
    const withLabel = (name, label, stdMap, val, extraParams = [], extras, o = {}) => {
      const l = (label || '').trim(); const lower = l.toLowerCase();
      const std = stdMap && stdMap[lower];
      let params = extraParams.slice(), group;
      if (std) params = params.concat(typeParams(std));
      else if (l && lower !== 'other') { if (v4) params = params.concat(typeParams([l.replace(/[,;:"]/g, '')])); else { group = 'item' + ++itemN; } }
      emit(name, params, val, { group, ...o });
      if (group) lines.push(fold(`${group}.X-ABLabel:${esc(l)}`));
      if (extras) for (const x of extras) writeX(x, group);
      else if (group === undefined) { /* nothing */ }
      return group;
    };
    const writeX = (x, group) => {
      const ps = x.p.map(([k, v]) => (k === 'ENCODING' && /QUOTED/i.test(v) ? null : `${k}=${/[;:,]/.test(v) ? '"' + v + '"' : v}`)).filter(Boolean);
      const qpOrig = x.p.some(([k, v]) => k === 'ENCODING' && /QUOTED/i.test(v));
      let val = x.v; if (qpOrig) { val = qpDecode(x.v); ps.push('ENCODING=QUOTED-PRINTABLE'); const encd = qpEncode(val); lines.push(qpFold((group || x.g ? (group || x.g) + '.' : '') + x.n + (ps.length ? ';' + ps.join(';') : '') + ':', encd)); return; }
      lines.push(fold((group || x.g ? (group || x.g) + '.' : '') + x.n + (ps.length ? ';' + ps.join(';') : '') + ':' + val));
    };

    lines.push('BEGIN:VCARD', 'VERSION:' + ver);
    if (!v2) lines.push('PRODID:-//ZengContacts//EN');
    emit('N', [], [c.last || '', c.first || '', c.middle || '', c.prefix || '', c.suffix || '']);
    emit('FN', [], fullName(c));
    if (c.nick) emit('NICKNAME', [], c.nick);
    if (c.pFirst) emit('X-PHONETIC-FIRST-NAME', [], c.pFirst);
    if (c.pLast) emit('X-PHONETIC-LAST-NAME', [], c.pLast);
    if (c.org || c.dept) emit('ORG', [], c.dept ? [c.org || '', c.dept] : [c.org || '']);
    if (c.title) emit('TITLE', [], c.title);
    if (c.isOrg) { if (v4) lines.push('KIND:org'); else lines.push('X-ABShowAs:COMPANY'); }
    if (c.photo) {
      const m = c.photo.match(/^data:([^;,]*);base64,(.*)$/s);
      if (m) {
        const sub = (m[1].split('/')[1] || 'jpeg').toUpperCase().replace('JPG', 'JPEG');
        if (v4) lines.push(fold(`PHOTO:data:${m[1]};base64,${m[2]}`));
        else if (v2) { lines.push(fold(`PHOTO;ENCODING=BASE64;${sub}:${m[2]}`), ''); }
        else lines.push(fold(`PHOTO;ENCODING=b;TYPE=${sub}:${m[2]}`));
      }
    }
    for (const p of c.phones) withLabel('TEL', p.l, TEL_TYPES, p.v, [], p.x);
    for (const e of c.emails) withLabel('EMAIL', e.l, SIMPLE_TYPES, e.v, v2 ? ['INTERNET'] : v4 ? [] : ['TYPE=INTERNET'], e.x);
    for (const a of c.addrs) withLabel('ADR', a.l, SIMPLE_TYPES, [a.pobox || '', a.ext || '', a.street || '', a.city || '', a.state || '', a.zip || '', a.country || ''], [], a.x);
    for (const u of c.urls) withLabel('URL', u.l, { home: ['HOME'], work: ['WORK'] }, u.v, [], u.x);
    if (c.bday) {
      if (/^--/.test(c.bday)) { if (v4) lines.push('BDAY:--' + c.bday.slice(2).replace('-', '')); else lines.push(`BDAY;X-APPLE-OMIT-YEAR=1604:1604-${c.bday.slice(2)}`); }
      else lines.push('BDAY:' + c.bday);
    }
    for (const d of c.dates) {
      const val = /^--/.test(d.v) ? (v4 ? '--' + d.v.slice(2).replace('-', '') : '1604-' + d.v.slice(2)) : d.v;
      const g = 'item' + ++itemN; lines.push(`${g}.X-ABDATE:${val}`, fold(`${g}.X-ABLabel:${esc(d.l || 'other')}`));
    }
    for (const r of c.related) { if (v4) emit('RELATED', r.l && r.l !== 'other' ? [`TYPE=${r.l.replace(/[,;:"\s]/g, '-').toLowerCase()}`] : [], r.v); else { const g = 'item' + ++itemN; emit('X-ABRELATEDNAMES', [], r.v, { group: g }); lines.push(fold(`${g}.X-ABLabel:${esc(r.l || 'other')}`)); } }
    const BASES = { twitter: 'https://twitter.com/', facebook: 'https://facebook.com/', linkedin: 'https://linkedin.com/in/', instagram: 'https://instagram.com/', github: 'https://github.com/', youtube: 'https://youtube.com/@' };
    for (const s of c.social) { const isUrl = /^https?:\/\//i.test(s.v); const l = (s.l || 'other').toLowerCase(); if (isUrl || !BASES[l]) emit('X-SOCIALPROFILE', [`TYPE=${l}`], s.v); else emit('X-SOCIALPROFILE', [`TYPE=${l}`, `X-USER=${s.v}`], BASES[l] + s.v); }
    for (const i of c.ims) emit('IMPP', [`X-SERVICE-TYPE=${(i.l || 'other').replace(/[;:,"]/g, '')}`], `${(i.l || 'x-apple').toLowerCase().replace(/[^a-z0-9+.-]/g, '')}:${i.v}`, { raw: false });
    if (c.notes) emit('NOTE', [], c.notes);
    if (c.cats && c.cats.length) { lines.push(fold('CATEGORIES:' + c.cats.map(esc).join(','))); }
    if (c.fav) lines.push('X-ZENG-FAV:1');
    if (c.cad && c.cad.n) lines.push('X-ZENG-CADENCE:' + c.cad.n + ({ day: 'D', week: 'W', month: 'M', year: 'Y' }[c.cad.u] || 'M'));
    if (c.lc) lines.push('X-ZENG-LAST:' + c.lc);
    for (const g of c.log || []) emit('X-ZENG-LOG', [], [String(g.t), g.k === 'note' ? 'note' : 'catchup', g.note || '']);
    lines.push('UID:' + (c.uid || c.id || ''));
    lines.push('REV:' + revFromTs(c.rev));
    for (const x of c.x || []) writeX(x, x.g ? 'x' + String(x.g).replace(/\W/g, '') : '');
    lines.push('END:VCARD');
    return lines.filter((l) => l !== undefined).join('\r\n') + '\r\n';
  }

  return { parse, write, unfold, parseLine, qpDecode, qpEncode, decodeBuffer, fold, parseDate, fullName, normLabel, BLANK };
});
