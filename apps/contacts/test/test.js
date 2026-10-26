// Node test harness for the vCard / CSV / model libraries:  node apps/contacts/test/test.js
const path = require('path'); const assert = require('assert');
const L = path.join(__dirname, '..', 'ui', 'lib');
const V = require(path.join(L, 'vcard.js')), C = require(path.join(L, 'csv.js')), M = require(path.join(L, 'model.js'));
let n = 0, failed = 0;
function ok(cond, msg) { n++; if (!cond) { failed++; console.log('FAIL: ' + msg); } }
function eq(a, b, msg) { n++; try { assert.deepStrictEqual(a, b); } catch (e) { failed++; console.log('FAIL: ' + msg + '\n  got ' + JSON.stringify(a) + '\n  exp ' + JSON.stringify(b)); } }
const p1 = (s) => V.parse(s).contacts[0];

// ---- Apple (3.0) ----
const APPLE = [
  'BEGIN:VCARD', 'VERSION:3.0', 'PRODID:-//Apple Inc.//iOS 17//EN', 'N:Appleseed;John;Q;Dr.;Jr.;', 'FN:Dr. John Q Appleseed Jr.', 'NICKNAME:Johnny', 'ORG:Acme Inc.;Sales Dept;', 'TITLE:VP Sales',
  'item1.EMAIL;type=INTERNET;type=pref:john@example.com', 'item1.X-ABLabel:_$!<Other>!$_',
  'EMAIL;type=INTERNET;type=HOME:john.home@example.com',
  'TEL;type=CELL;type=VOICE;type=pref:+1 (555) 123-4567', 'TEL;type=HOME;type=VOICE:555-0100', 'TEL;type=WORK;type=FAX:555-0199',
  'item2.TEL:555-7777', 'item2.X-ABLabel:Satellite',
  'item3.ADR;type=HOME;type=pref:;;1 Infinite Loop;Cupertino;CA;95014;United States', 'item3.X-ABADR:us',
  'item4.URL;type=pref:https://example.com', 'item4.X-ABLabel:_$!<HomePage>!$_',
  'BDAY:1985-04-12', 'item5.X-ABDATE;type=pref:2010-06-01', 'item5.X-ABLabel:_$!<Anniversary>!$_',
  'item6.X-ABRELATEDNAMES;type=pref:Jane Appleseed', 'item6.X-ABLabel:_$!<Spouse>!$_',
  'X-SOCIALPROFILE;type=twitter;x-user=johnny:http://twitter.com/johnny',
  'IMPP;X-SERVICE-TYPE=Skype:skype:john.skype',
  'NOTE:Line one\\nLine two\\, with comma\; and semi', 'CATEGORIES:Friends,Work', 'UID:ABC-123', 'REV:2023-05-01T10:20:30Z',
  'X-ABUID:ABC:ABPerson', 'X-CUSTOM-THING;FOO=bar:custom value', 'END:VCARD', ''].join('\r\n');
{
  const r = V.parse(APPLE); const c = r.contacts[0];
  eq(r.contacts.length, 1, 'apple count'); eq(r.version, '3.0', 'apple version');
  eq([c.prefix, c.first, c.middle, c.last, c.suffix], ['Dr.', 'John', 'Q', 'Appleseed', 'Jr.'], 'apple name parts');
  eq(c.nick, 'Johnny', 'nick'); eq(c.org, 'Acme Inc.', 'org'); eq(c.dept, 'Sales Dept', 'dept'); eq(c.title, 'VP Sales', 'title');
  eq(c.emails.map((e) => [e.l, e.v]), [['other', 'john@example.com'], ['home', 'john.home@example.com']], 'emails with X-ABLabel');
  eq(c.phones.map((e) => [e.l, e.v]), [['mobile', '+1 (555) 123-4567'], ['home', '555-0100'], ['work fax', '555-0199'], ['Satellite', '555-7777']], 'phones');
  eq(c.addrs.length, 1, 'addr count'); eq([c.addrs[0].l, c.addrs[0].street, c.addrs[0].city, c.addrs[0].state, c.addrs[0].zip, c.addrs[0].country], ['home', '1 Infinite Loop', 'Cupertino', 'CA', '95014', 'United States'], 'addr fields');
  ok(c.addrs[0].x && c.addrs[0].x[0].n === 'X-ABADR', 'X-ABADR attached to address');
  eq(c.urls, [{ l: 'homepage', v: 'https://example.com' }], 'url label'); eq(c.bday, '1985-04-12', 'bday');
  eq(c.dates, [{ l: 'Anniversary', v: '2010-06-01' }].map((d) => ({ l: 'anniversary', v: d.v })), 'date label'); eq(c.related, [{ l: 'spouse', v: 'Jane Appleseed' }], 'related');
  eq(c.social, [{ l: 'twitter', v: 'johnny' }], 'social'); eq(c.ims, [{ l: 'skype', v: 'john.skype' }], 'im');
  eq(c.notes, 'Line one\nLine two, with comma; and semi', 'note unescape'); eq(c.cats, ['Friends', 'Work'], 'categories'); eq(c.uid, 'ABC-123', 'uid');
  ok(c.rev === Date.UTC(2023, 4, 1, 10, 20, 30), 'rev'); ok(c.x.some((x) => x.n === 'X-ABUID'), 'x-abuid preserved'); ok(c.x.some((x) => x.n === 'X-CUSTOM-THING' && x.v === 'custom value' && x.p[0][0] === 'FOO'), 'custom x preserved with params');
  // roundtrip all versions
  for (const ver of ['2.1', '3.0', '4.0']) {
    const out = V.write([c], { version: ver }); const c2 = p1(out);
    ok(out.startsWith('BEGIN:VCARD\r\nVERSION:' + ver), 'write header ' + ver);
    ok(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 76 || /^PHOTO/.test(l)), 'folded <=75 ' + ver);
    for (const k of ['prefix', 'first', 'middle', 'last', 'suffix', 'nick', 'org', 'dept', 'title', 'bday', 'notes']) eq(c2[k], c[k], `roundtrip ${ver} ${k}`);
    eq(c2.phones.map((e) => e.v), c.phones.map((e) => e.v), 'roundtrip phones ' + ver); eq(c2.emails.map((e) => e.v), c.emails.map((e) => e.v), 'roundtrip emails ' + ver);
    eq(c2.addrs[0].street, c.addrs[0].street, 'roundtrip addr ' + ver); eq(c2.cats, c.cats, 'roundtrip cats ' + ver);
    eq(c2.related.map((r) => r.v), ['Jane Appleseed'], 'roundtrip related ' + ver); eq(c2.social[0].v, 'johnny', 'roundtrip social ' + ver); eq(c2.ims[0].v, 'john.skype', 'roundtrip im ' + ver);
    ok(c2.x.some((x) => x.n === 'X-CUSTOM-THING' && x.v === 'custom value'), 'roundtrip x prop ' + ver);
    eq(c2.dates.map((d) => d.v), ['2010-06-01'], 'roundtrip dates ' + ver);
  }
  const o3 = V.write([c], { version: '3.0' });
  ok(/item\d\.X-ABLabel:Satellite/.test(o3), 'custom label written as item group'); ok(/TEL;TYPE=CELL:/.test(o3), 'TYPE=CELL'); ok(/FN:Dr\. John Q Appleseed Jr\./.test(o3), 'FN written');
  ok(/NOTE:Line one\\nLine two\\, with comma\\; and semi/.test(o3), 'note escaped');
}

// ---- 2.1 with QP / charsets (Outlook, old Nokia) ----
const V21 = ['BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=B6rg;;;', 'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=B6rg M=C3=BCller',
  'ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9 Z=C3=BCrich;Entwicklung', 'TEL;WORK;VOICE:+49 30 1234567', 'TEL;CELL:+49 170 999', 'TEL;HOME;FAX:030 555', 'EMAIL;PREF;INTERNET:joerg@example.de',
  'ADR;WORK;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:;;Stra=C3=9Fe 5;Z=C3=BCrich;;8001;Schweiz',
  'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Zeile eins=0D=0AZeile zwei mit einem sehr langen Text der =\r\numgebrochen wird und =3D enth=C3=A4lt',
  'LABEL;WORK;ENCODING=QUOTED-PRINTABLE:Stra=DFe 5=0D=0A8001 Z=FCrich', 'X-MS-OL-DESIGN;CHARSET=utf-8:<x/>', 'END:VCARD', ''].join('\r\n');
{
  const c = p1(V21);
  eq([c.last, c.first], ['Müller', 'Jörg'], 'qp utf8 name'); eq(c.org, 'Café Zürich', 'qp org'); eq(c.dept, 'Entwicklung', 'qp dept');
  eq(c.phones.map((p) => p.l), ['work', 'mobile', 'home fax'], '2.1 bare type labels'); eq(c.emails[0].l, 'other', '2.1 email pref/internet ignored');
  eq(c.addrs[0].street, 'Straße 5', 'qp addr street'); eq(c.addrs[0].city, 'Zürich', 'qp addr city'); eq(c.addrs[0].l, 'work', 'addr bare type');
  eq(c.notes, 'Zeile eins\nZeile zwei mit einem sehr langen Text der umgebrochen wird und = enthält', 'qp soft break + =3D + CRLF decoded');
  ok(c.x.some((x) => x.n === 'LABEL'), 'LABEL preserved'); ok(c.x.some((x) => x.n === 'X-MS-OL-DESIGN'), 'X-MS-OL-DESIGN preserved');
  const w = V.write([c], { version: '2.1' });
  ok(/ENCODING=QUOTED-PRINTABLE/.test(w), '2.1 writer uses QP for non-ascii'); ok(!/[^\x00-\x7f]/.test(w.replace(/\r\n/g, '')), '2.1 output pure ASCII');
  const c2 = p1(w); eq([c2.last, c2.first, c2.org, c2.addrs[0].street, c2.notes], [c.last, c.first, c.org, c.addrs[0].street, c.notes], '2.1 roundtrip unicode');
  ok(w.split('\r\n').every((l) => l.length <= 76), '2.1 QP lines <= 76');
}
// latin1 charset in QP, and raw Latin-1 file bytes
eq(p1('BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Caf=E9;Ren=E9\nEND:VCARD').first, 'René', 'QP iso-8859-1');
{
  const bytes = Buffer.concat([Buffer.from('BEGIN:VCARD\r\nVERSION:2.1\r\nN:Fr'), Buffer.from([0xe9]), Buffer.from(';Jos'), Buffer.from([0xe9]), Buffer.from('\r\nEND:VCARD\r\n')]);
  const c = V.parse(bytes).contacts[0]; eq([c.last, c.first], ['Fré', 'José'], 'raw latin1 bytes fallback to windows-1252');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n', 'utf16le')]);
  eq(V.parse(u16).contacts[0].first, 'Zoë', 'utf-16 BOM file');
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('BEGIN:VCARD\nVERSION:3.0\nFN:Bom Test\nEND:VCARD')]);
  eq(V.parse(bom).contacts[0].last, 'Test', 'utf-8 BOM stripped');
}

// ---- Google export (3.0, item groups, X-ABLabel plain) ----
const GOOGLE = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Grace Hopper', 'N:Hopper;Grace;Brewster Murray;Rear Adm.;;', 'NICKNAME:Amazing Grace', 'EMAIL;TYPE=INTERNET:grace@navy.example', 'item1.EMAIL;TYPE=INTERNET:grace@home.example', 'item1.X-ABLabel:Personal',
  'TEL;TYPE=CELL:(555) 010-0001', 'TEL;TYPE=WORK:555-0002', 'item2.TEL:555-0003', 'item2.X-ABLabel:Lab',
  'ADR;TYPE=HOME:;;123 Compiler Way;Arlington;VA;22201;USA', 'ORG:US Navy;', 'TITLE:Rear Admiral', 'BDAY:1906-12-09', 'item3.URL:http://example.org/grace', 'item3.X-ABLabel:Profile',
  'item4.X-ABDATE:1930-06-15', 'item4.X-ABLabel:Wedding', 'X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Grandma;1;;;;;;;;;;;;;', 'CATEGORIES:myContacts,Starred in Android', 'END:VCARD', ''].join('\r\n');
{
  const c = p1(GOOGLE);
  eq(c.emails.map((e) => [e.l, e.v]), [['other', 'grace@navy.example'], ['Personal', 'grace@home.example']], 'google email custom label');
  eq(c.phones[2], { l: 'Lab', v: '555-0003' }, 'google custom phone label'); eq(c.middle, 'Brewster Murray', 'middle'); eq(c.prefix, 'Rear Adm.', 'prefix');
  eq(c.org, 'US Navy', 'org trailing semicolon'); eq(c.dept, '', 'no dept'); eq(c.urls[0], { l: 'Profile', v: 'http://example.org/grace' }, 'google URL label'); eq(c.dates[0], { l: 'Wedding', v: '1930-06-15' }, 'google date label');
  ok(c.x.some((x) => x.n === 'X-ANDROID-CUSTOM'), 'android custom preserved'); eq(c.cats, ['myContacts', 'Starred in Android'], 'google categories');
  const c2 = p1(V.write([c], { version: '3.0' })); eq(c2.phones.map((p) => p.l), c.phones.map((p) => p.l), 'google label roundtrip'); eq(c2.dates, c.dates, 'date label roundtrip'); eq(c2.urls, c.urls, 'url label roundtrip');
  ok(c2.x.some((x) => x.n === 'X-ANDROID-CUSTOM' && x.v.startsWith('vnd.android')), 'android custom roundtrip');
}

// ---- Outlook (2.1/3.0) ----
const OUT = ['BEGIN:VCARD', 'VERSION:2.1', 'N:Smith;Alice;;;', 'FN:Alice Smith', 'ORG:Contoso Ltd.;Finance', 'TITLE:Controller', 'TEL;WORK;VOICE:+1 425 555 0100', 'TEL;CELL;VOICE:+1 425 555 0101', 'TEL;WORK;FAX:+1 425 555 0102',
  'ADR;WORK;PREF:;;1 Microsoft Way;Redmond;WA;98052;United States of America', 'LABEL;WORK;PREF;ENCODING=QUOTED-PRINTABLE:1 Microsoft Way=0D=0ARedmond, WA 98052', 'EMAIL;PREF;INTERNET:alice@contoso.example', 'REV:20240102T030405Z', 'END:VCARD', ''].join('\r\n');
{
  const c = p1(OUT); eq(c.phones.map((p) => p.l), ['work', 'mobile', 'work fax'], 'outlook phone types'); eq(c.addrs[0].l, 'work', 'outlook addr work'); eq(c.addrs[0].country, 'United States of America', 'country');
  eq(c.rev, Date.UTC(2024, 0, 2, 3, 4, 5), 'compact REV'); ok(c.x.some((x) => x.n === 'LABEL' && x.v.includes('Redmond')), 'LABEL kept raw');
  const w = V.write([c], { version: '3.0' }); ok(/LABEL;[^:]*:/.test(w), 'LABEL rewritten');
  const w21 = V.write([c], { version: '2.1' }); const c2 = p1(w21); ok(c2.x.some((x) => x.n === 'LABEL' && /Redmond/.test(qpIfNeeded(x.v))), 'LABEL roundtrip 2.1 (QP)');
}
function qpIfNeeded(v) { return V.qpDecode(v); }

// ---- folding ----
{
  const long = 'x'.repeat(40) + ' ' + 'Ünïcödé '.repeat(30);
  const c = M.blank(); c.first = 'Fold'; c.notes = long;
  for (const ver of ['3.0', '4.0']) { const w = V.write([c], { version: ver }); const lines = w.split('\r\n'); ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), 'fold limit ' + ver); eq(p1(w).notes, long, 'fold roundtrip ' + ver); ok(!w.includes('�'), 'no split multibyte ' + ver); }
  eq(p1('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ann\r\n Marie Lee\r\nEND:VCARD').first, 'AnnMarie', 'unfold removes single space');
  eq(p1('BEGIN:VCARD\r\nVERSION:3.0\r\nNOTE:abc\r\n\tdef\r\nEND:VCARD').notes, 'abcdef', 'unfold tab');
  eq(V.fold('a'.repeat(200)).split('\r\n').map((l) => l.length), [75, 75, 52], 'fold 3 lines');
  ok(V.fold('a'.repeat(200)).split('\r\n').slice(1).every((l) => l.startsWith(' ') && l.length <= 75), 'continuation lines start with space');
}

// ---- photos ----
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
{
  const split = PX.match(/.{1,30}/g).map((s, i) => (i ? ' ' : '') + s).join('\r\n');
  const c3 = p1(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pic Three\r\nPHOTO;ENCODING=b;TYPE=PNG:${split}\r\nEND:VCARD`); eq(c3.photo, 'data:image/png;base64,' + PX, 'photo 3.0 folded base64');
  const c21 = p1(`BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Pic Two\r\nPHOTO;ENCODING=BASE64;PNG:\r\n ${PX.slice(0, 40)}\r\n ${PX.slice(40)}\r\n\r\nEND:VCARD`); eq(c21.photo, 'data:image/png;base64,' + PX, 'photo 2.1 base64 bare type');
  const c4 = p1(`BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Pic Four\r\nPHOTO:data:image/png;base64,${PX}\r\nEND:VCARD`); eq(c4.photo, 'data:image/png;base64,' + PX, 'photo 4.0 data uri');
  const cj = p1('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:J\r\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQEASABIAAD/2wBD\r\nEND:VCARD'); ok(cj.photo.startsWith('data:image/jpeg;base64,/9j/'), 'photo jpeg sniff');
  const cu = p1('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Remote\r\nPHOTO;VALUE=uri:http://example.com/a.jpg\r\nEND:VCARD'); eq(cu.photo, '', 'remote photo not fetched'); ok(cu.x.some((x) => x.n === 'PHOTO'), 'remote photo preserved raw');
  for (const ver of ['2.1', '3.0', '4.0']) { const w = V.write([c3], { version: ver }); eq(p1(w).photo, c3.photo, 'photo roundtrip ' + ver); }
  ok(/PHOTO;ENCODING=b;TYPE=PNG:/.test(V.write([c3], { version: '3.0' })), 'photo 3.0 params'); ok(/PHOTO:data:image\/png;base64,/.test(V.write([c3], { version: '4.0' })), 'photo 4.0 form');
}

// ---- multi cards, malformed ----
{
  const many = Array.from({ length: 50 }, (_, i) => `BEGIN:VCARD\nVERSION:3.0\nFN:Person ${i}\nTEL:555-${1000 + i}\nEND:VCARD`).join('\n\n');
  const r = V.parse(many); eq(r.contacts.length, 50, '50 cards in one file'); eq(r.contacts[49].phones[0].v, '555-1049', 'last card phone');
  eq(V.parse('junk before\nBEGIN:vcard\nversion:3.0\nfn:Lower Case\nend:vcard\ntrailing junk').contacts.length, 1, 'lowercase tags + junk');
  const t = V.parse('BEGIN:VCARD\nVERSION:3.0\nFN:No End'); eq(t.contacts.length, 1, 'missing END recovered'); ok(t.warnings.length === 1, 'warning for missing END');
  eq(V.parse('').contacts.length, 0, 'empty input'); eq(V.parse('not a vcard at all').contacts.length, 0, 'garbage input');
  eq(V.parse('BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD\nBEGIN:VCARD\nFN:B\nEND:VCARD').contacts.length, 2, 'two cards no blank');
  eq(p1('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Org Only\r\nORG:Org Only\r\nEND:VCARD').isOrg, true, 'FN==ORG => company');
  eq(p1('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Acme Corp\r\nORG:Acme Corp\r\nX-ABShowAs:COMPANY\r\nEND:VCARD').isOrg, true, 'X-ABShowAs company');
  eq(p1('BEGIN:VCARD\r\nVERSION:4.0\r\nKIND:org\r\nFN:Kind Org\r\nORG:Kind Org\r\nEND:VCARD').isOrg, true, '4.0 KIND org');
  const fnOnly = p1('BEGIN:VCARD\nVERSION:3.0\nFN:Mary Jane Watson\nEND:VCARD'); eq([fnOnly.first, fnOnly.last], ['Mary Jane', 'Watson'], 'FN only splits last token');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Cher\nEND:VCARD').first, 'Cher', 'single-word FN');
}

// ---- 4.0 specifics ----
{
  const v4 = ['BEGIN:VCARD', 'VERSION:4.0', 'FN:Ève Dubois', 'N:Dubois;Ève;;;', 'TEL;VALUE=uri;TYPE="work,voice";PREF=1:tel:+33-1-23-45-67-89', 'EMAIL;TYPE=work:eve@example.fr', 'ADR;TYPE=home:;;5 Rue de la Paix;Paris;;75002;France', 'BDAY:--0229', 'ANNIVERSARY:20100914', 'RELATED;TYPE=friend:Pierre', 'KIND:individual', 'END:VCARD', ''].join('\r\n');
  const c = p1(v4); eq(c.phones[0], { l: 'work', v: '+33-1-23-45-67-89' }, '4.0 tel uri + quoted types'); eq(c.bday, '--02-29', '4.0 yearless bday'); eq(c.dates, [{ l: 'anniversary', v: '2010-09-14' }], 'ANNIVERSARY'); eq(c.related, [{ l: 'friend', v: 'Pierre' }], '4.0 RELATED');
  ok(c.x.some((x) => x.n === 'KIND'), 'KIND individual preserved'); const w = V.write([c], { version: '4.0' }); ok(/BDAY:--0229/.test(w), '4.0 writes --MMDD'); eq(p1(w).bday, '--02-29', '4.0 bday roundtrip');
  const w3 = V.write([c], { version: '3.0' }); ok(/X-APPLE-OMIT-YEAR=1604/.test(w3), '3.0 yearless uses Apple convention'); eq(p1(w3).bday, '--02-29', '3.0 yearless roundtrip');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Y\nBDAY;X-APPLE-OMIT-YEAR=1604:1604-03-05\nEND:VCARD').bday, '--03-05', 'Apple omit-year parse');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Y\nBDAY:19850412\nEND:VCARD').bday, '1985-04-12', 'basic-format bday'); eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Y\nBDAY:1985-04-12T00:00:00Z\nEND:VCARD').bday, '1985-04-12', 'datetime bday');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Y\nBDAY:garbage\nEND:VCARD').bday, '', 'bad bday ignored');
  const org = M.blank(); org.org = 'Zeng Co'; org.isOrg = true; ok(/KIND:org/.test(V.write([org], { version: '4.0' })), '4.0 writes KIND org'); ok(/X-ABShowAs:COMPANY/.test(V.write([org], { version: '3.0' })), '3.0 writes ShowAs');
  eq(p1(V.write([org], { version: '3.0' })).isOrg, true, 'company roundtrip');
}

// ---- escaping edge cases ----
{
  const c = M.blank(); c.first = 'A;B'; c.last = 'C,D\\E'; c.notes = 'x\\ny\nz'; c.org = 'Semi;Colon, Inc'; c.emails = [{ l: 'work', v: 'a+b@example.com' }]; c.fav = true;
  for (const ver of ['2.1', '3.0', '4.0']) { const d = p1(V.write([c], { version: ver })); eq([d.first, d.last, d.notes, d.org], [c.first, c.last, c.notes, c.org], 'escape roundtrip ' + ver); eq(d.fav, true, 'fav roundtrip ' + ver); }
  const x = p1('BEGIN:VCARD\nVERSION:3.0\nN:Last\\;Name;First\\,Name;;;\nFN:x\nEND:VCARD'); eq([x.last, x.first], ['Last;Name', 'First,Name'], 'escaped separators in N');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:Q\nTEL;TYPE="x;y":123\nEND:VCARD').phones[0].v, '123', 'quoted param with semicolon');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:C\nURL:https://example.com/a:b?c=d\nEND:VCARD').urls[0].v, 'https://example.com/a:b?c=d', 'colon in value');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:T\nTEL;TYPE=CELL:tel:+15551234\nEND:VCARD').phones[0].v, '+15551234', 'tel: prefix stripped');
  eq(p1('BEGIN:VCARD\nVERSION:3.0\nFN:T\nEMAIL;TYPE=INTERNET:mailto:t@example.com\nEND:VCARD').emails[0].v, 't@example.com', 'mailto: prefix stripped');
}

// ---- IM / social variants ----
{
  const c = p1('BEGIN:VCARD\nVERSION:3.0\nFN:Im Test\nX-AIM:aimname\nX-JABBER:jid@example.org\nX-SKYPE:skypename\nX-MSN:m@example.com\nIMPP:xmpp:me@example.org\nEND:VCARD');
  eq(c.ims.map((i) => i.l + ':' + i.v), ['aim:aimname', 'jabber:jid@example.org', 'skype:skypename', 'msn:m@example.com', 'xmpp:me@example.org'], 'IM variants');
  const s = p1('BEGIN:VCARD\nVERSION:3.0\nFN:S\nX-SOCIALPROFILE;type=linkedin:https://linkedin.com/in/x\nEND:VCARD'); eq(s.social, [{ l: 'linkedin', v: 'https://linkedin.com/in/x' }], 'social url only');
  eq(p1(V.write([s], { version: '3.0' })).social, s.social, 'social url roundtrip');
}

// ---- CSV ----
{
  eq(C.parse('a,b,c\n1,"x,y",3\n'), [['a', 'b', 'c'], ['1', 'x,y', '3']], 'csv quoted comma'); eq(C.parse('a,b\r\n"line1\nline2","q""uote"\r\n'), [['a', 'b'], ['line1\nline2', 'q"uote']], 'csv multiline + escaped quote');
  eq(C.parse('﻿a;b\n1;2'), [['a', 'b'], ['1', '2']], 'csv BOM + semicolon delimiter'); eq(C.parse('a\tb\n1\t2'), [['a', 'b'], ['1', '2']], 'tab delimiter'); eq(C.parse('a,b\n1,\n,\n3,4'), [['a', 'b'], ['1', ''], ['', ''], ['3', '4']], 'csv empty fields rows kept');
  eq(C.parse('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'no trailing newline'); eq(C.parse(''), [], 'empty csv'); eq(C.parse('a,"b').length, 1, 'unterminated quote does not hang');
  const w = C.write([['a', 'b,c', 'd"e', ' pad']]); eq(C.parse(w), [['a', 'b,c', 'd"e', ' pad']], 'csv write/parse roundtrip');
  const G = 'First Name,Middle Name,Last Name,Phonetic First Name,Phonetic Middle Name,Phonetic Last Name,Name Prefix,Name Suffix,Nickname,File As,Organization Name,Organization Title,Organization Department,Birthday,Notes,Photo,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value,Address 1 - Label,Address 1 - Formatted,Address 1 - Street,Address 1 - City,Address 1 - PO Box,Address 1 - Region,Address 1 - Postal Code,Address 1 - Country,Address 1 - Extended Address,Website 1 - Label,Website 1 - Value\n' +
    'Linus,,Torvalds,,,,,,,,Linux Foundation,Fellow,,1969-12-28,"Kernel, guy",,* myContacts ::: Dev,Work,linus@example.org,Home ::: Other,l2@example.org,Mobile,+1 555 0100 ::: +1 555 0101,Home,"1 Main St\nPortland OR",1 Main St,Portland,,OR,97201,USA,,Blog,https://example.org';
  const rows = C.parse(G); eq(C.detectPreset(rows[0]), 'google', 'detect google'); const map = C.autoMap(rows[0]); const cs = C.toContacts(rows, map);
  eq(cs.length, 1, 'google import 1 contact'); const c = cs[0];
  eq([c.first, c.last, c.org, c.title, c.bday, c.notes], ['Linus', 'Torvalds', 'Linux Foundation', 'Fellow', '1969-12-28', 'Kernel, guy'], 'google fields');
  ok(c.emails.some((e) => e.l === 'work' && e.v === 'linus@example.org'), 'google email label'); ok(c.emails.some((e) => e.v === 'l2@example.org'), 'google email 2 (multi-label value)');
  eq(c.phones.map((p) => p.v), ['+1 555 0100', '+1 555 0101'], 'google ::: multi phones'); eq(c.phones[0].l, 'mobile', 'google phone label'); eq(c.addrs[0].city, 'Portland', 'google address city'); eq(c.addrs[0].state, 'OR', 'google region'); eq(c.addrs[0].l, 'home', 'google address label');
  eq(c.cats, ['Dev'], 'google labels (myContacts dropped)'); eq(c.urls, [{ l: 'blog', v: 'https://example.org' }], 'google website label');
  // export google then re-import
  const out = C.fromContacts([c], 'google'); const back = C.toContacts(C.parse(C.write(out)), C.autoMap(out[0]))[0];
  eq([back.first, back.last, back.org, back.bday], [c.first, c.last, c.org, c.bday], 'google export roundtrip names'); eq(back.phones.map((p) => p.v), c.phones.map((p) => p.v), 'google roundtrip phones'); eq(back.addrs[0].street, '1 Main St', 'google roundtrip addr'); eq(back.notes, c.notes, 'google roundtrip notes');
  const OL = 'First Name,Last Name,Title,E-mail Address,Mobile Phone,Business Phone,Company,Job Title,Business Street,Business City,Business State,Business Postal Code,Business Country/Region,Birthday,Notes,Categories\nAlice,Smith,Dr.,alice@contoso.example,425-555-0101,425-555-0100,Contoso,Controller,1 Microsoft Way,Redmond,WA,98052,USA,3/14/1980,Hello,Business;VIP\n,,,,,,Only Company,,,,,,,0/0/00,,';
  const orows = C.parse(OL); eq(C.detectPreset(orows[0]), 'outlook', 'detect outlook'); const ocs = C.toContacts(orows, C.autoMap(orows[0]));
  eq(ocs.length, 2, 'outlook rows'); eq([ocs[0].prefix, ocs[0].title, ocs[0].org], ['Dr.', 'Controller', 'Contoso'], 'outlook Title=prefix'); eq(ocs[0].bday, '1980-03-14', 'outlook US date'); eq(ocs[0].addrs[0].l, 'work', 'outlook business address'); eq(ocs[0].cats, ['Business', 'VIP'], 'outlook categories');
  eq(ocs[0].phones.map((p) => p.l).sort(), ['mobile', 'work'], 'outlook phones'); eq(ocs[1].isOrg, true, 'company-only row is org'); eq(ocs[1].bday, '', 'outlook 0/0/00 ignored');
  const oo = C.fromContacts(ocs, 'outlook'); const oback = C.toContacts(oo, C.autoMap(oo[0], 'outlook'), {})[0]; eq([oback.first, oback.org, oback.bday], ['Alice', 'Contoso', '1980-03-14'], 'outlook export roundtrip');
  eq(C.parseCsvDate('25/12/1999'), '1999-12-25', 'dd/mm when day>12'); eq(C.parseCsvDate('--12-25'), '--12-25', 'yearless csv date'); eq(C.parseCsvDate('nonsense'), '', 'csv date garbage');
  const gen = C.parse('Name,Email,Mobile\n"Smith, John",j@example.com,555 1234\nMadonna,m@example.com,'); const gcs = C.toContacts(gen, C.autoMap(gen[0])); eq([gcs[0].first, gcs[0].last], ['John', 'Smith'], 'generic "Last, First" name'); eq(gcs[1].first, 'Madonna', 'generic single name'); eq(gcs[0].phones[0].l, 'mobile', 'generic mobile col');
  eq(C.toContacts(C.parse('a,b\n,'), ['first', 'last']).length, 0, 'blank rows skipped');
  eq(C.toContacts([['x'], ['Jane']], ['first'], { header: true })[0].first, 'Jane', 'header skip');
}

// ---- model ----
{
  const mk = (o) => Object.assign(M.blank(), o);
  const a = mk({ first: 'José', last: 'Álvarez', phones: [{ l: 'mobile', v: '+1 (555) 234-5678' }], emails: [{ l: 'home', v: 'JA@Example.com' }], org: 'Café Co', notes: 'likes Zürich' });
  ok(M.matchQuery(a, 'jose'), 'search diacritics folded'); ok(M.matchQuery(a, 'alvarez jose'), 'search multi-token any order'); ok(M.matchQuery(a, '5552345678'), 'search phone digits'); ok(M.matchQuery(a, '(555) 234'), 'search phone formatted'); ok(M.matchQuery(a, 'ja@example'), 'search email'); ok(M.matchQuery(a, 'zurich'), 'search notes'); ok(M.matchQuery(a, 'cafe'), 'search org'); ok(!M.matchQuery(a, 'nobody'), 'search negative'); ok(M.matchQuery(a, ''), 'empty query matches');
  ok(!M.matchQuery(a, '99'), 'short digit query does not false-match');
  const l = [mk({ first: 'Zed', last: 'Alpha' }), mk({ first: 'amy', last: 'Zulu' }), mk({ org: 'Beta Corp', isOrg: true }), mk({ emails: [{ l: 'work', v: 'x@y.zz' }] }), mk({ first: 'Émile', last: 'Bravo' }), mk({ first: '1st', last: 'Number' })];
  eq(M.sortContacts(l, 'first').map((c) => M.displayName(c)), ['1st Number', 'amy Zulu', 'Beta Corp', 'Émile Bravo', 'Zed Alpha', 'x@y.zz'], 'sort by first, nameless last'); eq(M.sortContacts(l, 'last').map((c) => M.displayName(c)).slice(0, 3), ['Zed Alpha', 'Beta Corp', 'Émile Bravo'], 'sort by last');
  eq(M.sectionOf(l[4], 'first'), 'E', 'section letter folded'); eq(M.sectionOf(l[5], 'first'), '#', 'digit section #'); eq(M.sectionOf(l[3], 'first'), '#', 'nameless section #'); eq(M.sectionOf(l[2], 'last'), 'B', 'org section');
  eq(M.displayName(l[0], 'last'), 'Alpha, Zed', 'display last-first'); eq(M.initials(l[0]), 'ZA', 'initials'); eq(M.initials(l[2]), 'BE', 'org initials'); eq(M.initials(M.blank()), '?', 'empty initials');
  // birthdays
  const now = new Date(2025, 5, 10, 15).getTime(); eq(M.daysUntil('--06-10', now), 0, 'bday today'); eq(M.daysUntil('1990-06-11', now), 1, 'bday tomorrow'); eq(M.daysUntil('--06-09', now), 364, 'bday yesterday => next year'); eq(M.daysUntil('--12-31', now), 204, 'bday later'); eq(M.daysUntil('', now), null, 'no bday');
  eq(M.daysUntil('--02-29', new Date(2025, 0, 1).getTime()), 58, 'feb 29 on non-leap year -> feb 28');
  const b1 = mk({ first: 'A', bday: '--06-12' }), b2 = mk({ first: 'B', bday: '--07-01' }), b3 = mk({ first: 'C' }); eq(M.upcomingBirthdays([b2, b1, b3], 30, now).map((x) => x.c.first), ['A', 'B'], 'upcoming sorted'); eq(M.upcomingBirthdays([b2, b1], 10, now).length, 1, 'upcoming window');
  eq(M.turningAge('1990-06-12', now), 35, 'turning age'); eq(M.turningAge('--06-12', now), null, 'no age without year'); eq(M.fmtDate('1990-06-12'), 'June 12, 1990', 'fmt date'); eq(M.fmtDate('--06-12'), 'June 12', 'fmt yearless');
  // smart groups
  const sg = { match: 'all', rules: [{ f: 'org', op: 'contains', v: 'beta' }] }; ok(M.smartMatch(l[2], sg, now), 'smart company contains'); ok(!M.smartMatch(l[0], sg, now), 'smart negative');
  ok(M.smartMatch(b1, { rules: [{ f: 'birthday', op: 'this month' }] }, now), 'smart bday this month'); ok(!M.smartMatch(b2, { rules: [{ f: 'birthday', op: 'this month' }] }, now), 'smart bday not this month'); ok(M.smartMatch(b2, { rules: [{ f: 'birthday', op: 'next month' }] }, now), 'smart bday next month');
  ok(M.smartMatch(b2, { rules: [{ f: 'birthday', op: 'in next days', v: '30' }] }, now), 'smart bday in 30 days'); ok(M.smartMatch(b3, { rules: [{ f: 'birthday', op: 'is not set' }] }, now), 'smart no birthday');
  ok(M.smartMatch(a, { match: 'any', rules: [{ f: 'org', op: 'is', v: 'nope' }, { f: 'email', op: 'contains', v: 'example.com' }] }, now), 'smart any'); ok(!M.smartMatch(a, { match: 'all', rules: [{ f: 'org', op: 'is', v: 'nope' }, { f: 'email', op: 'contains', v: 'example.com' }] }, now), 'smart all');
  ok(M.smartMatch(a, { rules: [{ f: 'phone', op: 'is set' }] }, now), 'smart is set'); ok(M.smartMatch(a, { rules: [{ f: 'city', op: 'is not set' }] }, now), 'smart city not set'); ok(!M.smartMatch(a, { rules: [] }, now), 'empty rules match nothing');
  ok(M.smartMatch(Object.assign(M.blank(), { groups: ['g1'] }), { rules: [{ f: 'group', op: 'is member of', v: 'g1' }] }, now), 'smart group membership'); ok(M.smartMatch(Object.assign(M.blank(), { created: now - 86400000 }), { rules: [{ f: 'created', op: 'in last days', v: '7' }] }, now), 'smart added recently');
  // duplicates + merge
  const d1 = mk({ first: 'Sam', last: 'Lee', phones: [{ l: 'mobile', v: '555-123-4567' }], emails: [{ l: 'home', v: 'sam@x.com' }], org: 'A Co', created: 1 });
  const d2 = mk({ first: 'sam', last: 'LEE', phones: [{ l: 'work', v: '(555) 123 4567' }, { l: 'home', v: '555-999-0000' }], org: 'B Co', notes: 'second', title: 'CTO', groups: ['g2'], created: 2 });
  const d3 = mk({ first: 'Other', last: 'Person', emails: [{ l: 'work', v: 'SAM@x.com' }] }); const d4 = mk({ first: 'Unique', last: 'One', phones: [{ l: 'mobile', v: '111' }] });
  const dups = M.findDuplicates([d1, d2, d3, d4]); eq(dups.length, 1, 'one duplicate cluster'); eq(dups[0].contacts.length, 3, 'name+phone+email transitive cluster'); ok(dups[0].reasons.includes('same name') && dups[0].reasons.includes('same email'), 'duplicate reasons');
  eq(M.findDuplicates([d1, d4]).length, 0, 'no false dupes'); eq(M.findDuplicates([mk({ phones: [{ l: 'm', v: '123' }] }), mk({ phones: [{ l: 'm', v: '123' }] })]).length, 0, 'short phone not matched');
  const conf = M.mergeConflicts([d1, d2]); eq(conf.map((x) => x.field), ['org'], 'conflicts only org'); const m = M.mergeContacts([d1, d2], { org: 'B Co' });
  eq(m.id, d1.id, 'merge keeps oldest id'); eq(m.org, 'B Co', 'merge honours choice'); eq(m.title, 'CTO', 'merge fills missing'); eq(m.phones.map((p) => p.v), ['555-123-4567', '555-999-0000'], 'merge phones union deduped by digits'); eq(m.groups, ['g2'], 'merge groups union'); eq(m.notes, 'second', 'merge notes'); eq(M.mergeContacts([d1, d2]).org, 'A Co', 'merge default first non-empty');
  const n1 = mk({ first: 'N', notes: 'one' }), n2 = mk({ first: 'N', notes: 'two' }); eq(M.mergeContacts([n1, n2]).notes, 'one\n\ntwo', 'notes concatenated');
  // issues + sanitize
  eq(M.findIssues(M.blank()).map((i) => i.k), ['empty'], 'issue: empty'); ok(M.findIssues(mk({ first: 'X', emails: [{ l: 'a', v: 'bad@' }] })).some((i) => i.k === 'email'), 'issue: bad email'); ok(M.findIssues(mk({ first: 'X', phones: [{ l: 'a', v: '12' }] })).some((i) => i.k === 'phone'), 'issue: short phone'); eq(M.findIssues(a).map((i) => i.k), [], 'good card has no issues');
  const s = M.sanitize({ id: 5, first: 'Bad', phones: [{ v: 'x' }, null, 'str'], bday: 'xx', emails: 'nope', addrs: [{}], x: [{ n: 1 }], groups: [1, 'a'] });
  eq([s.first, s.phones.length, s.bday, s.emails, s.addrs, s.x, s.groups], ['Bad', 1, '', [], [], [], ['1', 'a']], 'sanitize garbage'); ok(typeof s.id === 'string' && s.id.length > 0, 'sanitize gives id'); ok(M.sanitize(null).phones.length === 0, 'sanitize null'); ok(M.sanitize('str').id, 'sanitize string');
  const sm = M.sampleContacts(); ok(sm.length >= 10 && sm.every((c) => c.emails.every((e) => e.v.endsWith('example.com'))), 'sample data uses example.com'); ok(new Set(sm.map((c) => c.id)).size === sm.length, 'sample ids unique');
  // full pipeline: sample -> vcf -> parse -> same count/names
  const vcf = V.write(sm, { version: '3.0' }); const back = V.parse(vcf).contacts; eq(back.length, sm.length, 'sample vcf roundtrip count'); eq(back.map((c) => M.displayName(M.sanitize(c))).sort(), sm.map((c) => M.displayName(c)).sort(), 'sample vcf roundtrip names');
  const vcf4 = V.write(sm, { version: '4.0' }); eq(V.parse(vcf4).contacts.length, sm.length, 'sample vcf4 roundtrip count'); eq(V.parse(V.write(sm, { version: '2.1' })).contacts.length, sm.length, 'sample vcf2.1 roundtrip count');
}

// ---- relationship rhythm ----
{
  const mk = (o) => Object.assign(M.blank(), o); const now = new Date(2025, 5, 10, 15).getTime(); const D = (y, m, d) => new Date(y, m - 1, d).getTime();
  eq(M.cadenceDays({ n: 2, u: 'month' }), 60.875, 'cadence days month'); eq(M.cadenceDays(null), 0, 'no cadence'); eq(M.cadenceLabel({ n: 2, u: 'month' }), 'Every 2 months', 'label plural'); eq(M.cadenceLabel({ n: 1, u: 'week' }), 'Every week', 'label singular'); eq(M.cadenceLabel(null), 'No reminder', 'label none');
  const a = mk({ cad: { n: 1, u: 'month' }, lc: '2025-04-01', created: D(2025, 1, 1) }); const da = M.dueInfo(a, now);
  eq(da.state, 'overdue', 'overdue state'); ok(da.over > 30 && da.over < 45, 'overdue days ' + da.over); ok(da.ratio > 1.5, 'ratio');
  const b = mk({ cad: { n: 3, u: 'month' }, lc: '2025-05-20' }); eq(M.dueInfo(b, now).state, 'ok', 'ok state'); ok(M.dueInfo(b, now).over < -50, 'days left');
  const c3 = mk({ cad: { n: 1, u: 'month' }, lc: '2025-05-15' }); eq(M.dueInfo(c3, now).state, 'soon', 'soon state'); eq(M.dueInfo(mk({}), now), null, 'no rhythm -> null');
  const nv = mk({ cad: { n: 1, u: 'week' }, created: D(2025, 5, 1) }); eq(M.dueInfo(nv, now).never, true, 'never contacted'); eq(M.dueInfo(nv, now).state, 'overdue', 'never contacted counts from added date');
  const today = mk({ cad: { n: 10, u: 'day' }, lc: '2025-05-31' }); eq(M.dueInfo(today, now).over, 0, 'due today exactly'); eq(M.dueText(M.dueInfo(today, now)), 'Due today', 'due today text');
  eq(M.dueText({ over: 1 }), '1 day overdue', 'text 1 day'); eq(M.dueText({ over: 21 }), '3 weeks overdue', 'text weeks'); eq(M.dueText({ over: 90 }), '3 months overdue', 'text months'); eq(M.dueText({ over: -5 }), 'Due in 5 days', 'text in days'); eq(M.dueText(null), '', 'text null');
  const list = M.dueList([a, b, c3, nv, mk({})], now); eq(list.length, 2, 'due list excludes ok, soon(>3d) and none'); ok(list[0].d.ratio >= list[1].d.ratio, 'due list sorted by overdue ratio'); eq(list[0].c, nv, 'most overdue first');
  eq(M.agoText(null), 'never', 'ago never'); eq(M.agoText(0), 'today', 'ago today'); eq(M.agoText(1), 'yesterday', 'ago yesterday'); eq(M.agoText(10), '10 days ago', 'ago days'); eq(M.agoText(30), '4 weeks ago', 'ago weeks'); eq(M.agoText(200), '7 months ago', 'ago months'); eq(M.agoText(800), '2 years ago', 'ago years');
  eq(M.daysSince(mk({ lc: '2025-06-05' }), now), 5, 'days since'); eq(M.daysSince(mk({}), now), null, 'days since never');
  const lg = M.logCatchup(a, '  Coffee  ', '2025-06-09'); eq(lg.lc, '2025-06-09', 'log sets last'); eq(lg.log.length, 1, 'log entry'); eq(lg.log[0].note, 'Coffee', 'note trimmed'); eq(lg.log[0].k, 'catchup', 'kind catchup'); eq(M.dueInfo(lg, now).state, 'ok', 'logging clears due'); eq(a.log.length, 0, 'original untouched');
  const lg2 = M.logCatchup(lg, 'older', '2025-01-01'); eq(lg2.lc, '2025-06-09', 'older catch-up does not move last back'); const nt = M.logCatchup(a, 'just a note', '', 'note'); eq(nt.lc, a.lc, 'note does not change last'); eq(nt.log[0].k, 'note', 'note kind');
  eq(M.sanitize({ cad: { n: 0, u: 'day' } }).cad, null, 'sanitize bad cadence'); eq(M.sanitize({ cad: { n: 2, u: 'fortnight' } }).cad, null, 'sanitize bad unit'); eq(M.sanitize({ cad: { n: '3', u: 'week' } }).cad, { n: 3, u: 'week' }, 'sanitize cadence'); eq(M.sanitize({ lc: 'yesterday' }).lc, '', 'sanitize bad lc'); eq(M.sanitize({ log: [{ t: 5, note: 'x' }, { t: 0 }, null, 'q'] }).log.length, 1, 'sanitize log');
  ok(M.smartMatch(a, { rules: [{ f: 'due', op: 'is due' }] }, now), 'smart is due'); ok(!M.smartMatch(b, { rules: [{ f: 'due', op: 'is due' }] }, now), 'smart not due'); ok(M.smartMatch(b, { rules: [{ f: 'due', op: 'has a rhythm' }] }, now), 'smart has rhythm');
  // vcard roundtrip of rhythm fields
  const rc = mk({ first: 'Rhy', last: 'Thm', cad: { n: 6, u: 'week' }, lc: '2025-05-01', log: [{ id: 'a', t: 1746000000000, k: 'catchup', note: 'Lunch; talked about, things\nsecond line' }, { id: 'b', t: 1747000000000, k: 'note', note: 'Likes tea' }] });
  for (const ver of ['2.1', '3.0', '4.0']) { const d = p1(V.write([rc], { version: ver })); eq(d.cad, { n: 6, u: 'week' }, 'vcf cadence ' + ver); eq(d.lc, '2025-05-01', 'vcf last ' + ver); eq(d.log.map((g) => [g.t, g.k, g.note]), rc.log.map((g) => [g.t, g.k, g.note]), 'vcf log ' + ver); eq(d.last, 'Thm', 'name still intact ' + ver); }
  // nudges
  const n1 = mk({ first: 'N1', bday: '--06-12' }), n2 = mk({ first: 'N2', dates: [{ l: 'anniversary', v: '2010-06-11' }] }), n3 = mk({ first: 'N3', dates: [{ l: 'other', v: '2010-06-11' }], bday: '--09-01' });
  const ns = M.nudges([n1, n2, n3], 7, now); eq(ns.map((x) => x.c.first + ':' + x.kind + ':' + x.in), ['N2:anniversary:1', 'N1:birthday:2'], 'nudges sorted, anniversaries only'); eq(M.nudges([n3], 7, now).length, 0, 'no nudge outside window');
  // clusters
  const g = [{ id: 'g1', name: 'Family' }]; const cl = M.clusters([mk({ org: 'Acme' }), mk({ org: ' acme ' }), mk({ org: 'Zed' }), mk({})], 'company', g); eq(cl.map((x) => x.name + x.items.length), ['Acme2', 'Zed1', 'No company1'], 'clusters by company'); const cg = M.clusters([mk({ groups: ['g1'] }), mk({ groups: ['g1'] }), mk({})], 'group', g); eq(cg.map((x) => x.name + x.items.length), ['Family2', 'No group1'], 'clusters by group');
  // merge keeps rhythm
  const m1 = mk({ first: 'M', cad: { n: 1, u: 'month' }, lc: '2025-01-01', log: [{ id: 'x', t: 1, k: 'note', note: 'a' }] }), m2 = mk({ first: 'M', lc: '2025-03-01', log: [{ id: 'y', t: 2, k: 'note', note: 'b' }, { id: 'x', t: 1, k: 'note', note: 'a' }] }); const mm = M.mergeContacts([m1, m2]); eq([mm.cad, mm.lc, mm.log.length], [{ n: 1, u: 'month' }, '2025-03-01', 2], 'merge rhythm');
}
console.log(`\n${n} assertions, ${failed} failed`); process.exit(failed ? 1 : 0);
