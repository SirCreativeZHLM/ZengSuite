// ZengCalendar core test harness. Run: node apps/calendar/test/run.mjs
// Independent of the UI: loads ui/lib/*.js into node and checks parse/serialize/expand against known answers
// (RFC 5545 section 3.8.5.3 examples, python-dateutil generated fixtures, strict RFC output validation).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const lib = (f) => require(path.join(dir, '../ui/lib', f));
['zc-time.js', 'zc-ical.js', 'zc-misc.js', 'zc-csv.js', 'zc-nlp.js', 'zc-balance.js'].forEach(lib);
const { time: T, ical: I, layout: L, free: FR, holidays: H, moon: M, csv: CSV, nlp: N, balance: BAL } = globalThis.ZC;

let pass = 0, fail = 0; const failures = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; failures.push(msg); } };
const eq = (a, b, msg) => { const A = String(JSON.stringify(a)), B = String(JSON.stringify(b)); if (A === B) pass++; else { fail++; let d = ''; if (a && b && typeof a === 'object' && typeof b === 'object') for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d += `\n    key ${k}: got ${JSON.stringify(a[k])} expected ${JSON.stringify(b[k])}`; failures.push(`${msg}${d || `\n    got      ${A.slice(0, 400)}\n    expected ${B.slice(0, 400)}`}`); } };
const section = (n) => console.log('· ' + n);
const mk = (o) => { const e = I.newEvent(o); e.id = e.uid = e.id || 'x'; return e; };
const keysOf = (ev, n = 1000, toYear = 2100) => I.keys(ev, Date.UTC(toYear, 0, 1), n);

// ------------------------------------------------------------------ time zones
section('time zones');
const NY = 'America/New_York';
eq(T.wallToEpoch('2026-07-01T12:00:00', NY), Date.UTC(2026, 6, 1, 16), 'NY summer = UTC-4');
eq(T.wallToEpoch('2026-01-15T12:00:00', NY), Date.UTC(2026, 0, 15, 17), 'NY winter = UTC-5');
eq(T.wallToEpoch('2026-03-08T02:30:00', NY), Date.UTC(2026, 2, 8, 7, 30), 'NY spring-forward gap uses pre-transition offset');
eq(T.wallToEpoch('2026-11-01T01:30:00', NY), Date.UTC(2026, 10, 1, 5, 30), 'NY fall-back overlap picks first occurrence');
eq(T.wallToEpoch('2026-11-01T03:00:00', NY), Date.UTC(2026, 10, 1, 8), 'NY after fall-back');
eq(T.epochToWall(Date.UTC(2026, 10, 1, 6, 30), NY), '2026-11-01T01:30:00', 'NY epoch->wall 2nd 01:30');
eq(T.wallToEpoch('2026-06-01T09:00:00', 'Asia/Kolkata'), Date.UTC(2026, 5, 1, 3, 30), 'Kolkata +5:30');
eq(T.wallToEpoch('2026-06-01T09:00:00', 'Asia/Kathmandu'), Date.UTC(2026, 5, 1, 3, 15), 'Kathmandu +5:45');
eq(T.wallToEpoch('2026-01-01T09:00:00', 'Australia/Sydney'), Date.UTC(2025, 11, 31, 22), 'Sydney summer +11');
eq(T.wallToEpoch('2026-01-01T09:00:00', 'Europe/London'), Date.UTC(2026, 0, 1, 9), 'London winter +0');
eq(T.wallToEpoch('2026-07-01T09:00:00', 'Europe/London'), Date.UTC(2026, 6, 1, 8), 'London summer +1');
eq(T.wallToEpoch('2026-07-01T09:00:00', 'UTC'), Date.UTC(2026, 6, 1, 9), 'UTC');
eq(T.wallToEpoch('2026-07-01T09:00:00', 'fixed:-0330'), Date.UTC(2026, 6, 1, 12, 30), 'fixed offset');
eq(T.epochToWall(T.wallToEpoch('1999-12-31T23:59:59', 'Pacific/Auckland'), 'Pacific/Auckland'), '1999-12-31T23:59:59', 'Auckland round trip');
eq(T.wallToEpoch('2026-07-01T09:00:00', 'floating'), new Date(2026, 6, 1, 9).getTime(), 'floating = system local');
ok(T.validZone('America/Los_Angeles') && !T.validZone('Mars/Olympus'), 'zone validity');
eq(T.addDays('2026-02-27', 3), '2026-03-02', 'addDays across month'); eq(T.addDays('2024-02-28', 2), '2024-03-01', 'addDays leap');
eq(T.addWall('2026-12-31T23:30:00', 3600000), '2027-01-01T00:30:00', 'addWall across year');
eq(T.dow(T.dayNum(2026, 10, 26)), 1, 'dow Monday'); eq(T.dateStr(T.dayNum(2000, 2, 29)), '2000-02-29', 'dateStr');
eq([T.weekNumber(new Date(2026, 0, 1), 1), T.weekNumber(new Date(2026, 11, 31), 1), T.weekNumber(new Date(2021, 0, 3), 1), T.weekNumber(new Date(2020, 11, 31), 1)], [1, 53, 53, 53], 'ISO week numbers');
eq([T.weekNumber(new Date(2026, 0, 1), 0), T.weekNumber(new Date(2026, 0, 4), 0), T.weekNumber(new Date(2026, 0, 3), 0)], [1, 2, 1], 'US week numbers');

// ------------------------------------------------------------------ text layer
section('text layer');
eq(I.escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne', 'escape'); eq(I.unescapeText('a\\,b\\;c\\\\d\\ne\\NF'), 'a,b;c\\d\ne\nF', 'unescape');
eq(I.unescapeText(I.escapeText('x\r\ny;z,\\')), 'x\ny;z,\\', 'escape round trip');
const long = 'DESCRIPTION:' + 'é'.repeat(100) + '日本語'.repeat(20) + '😀'.repeat(10);
const folded = I.fold(long); const physical = folded.split('\r\n').slice(0, -1);
ok(physical.every((l) => new TextEncoder().encode(l).length <= 75), 'folded lines <= 75 octets');
eq(I.unfold(folded)[0], long, 'fold/unfold identity incl. multibyte'); ok(!/�/.test(I.unfold(folded)[0]), 'no split surrogate');
eq(I.unfold('A:1\r\n 2\r\n\t3\nB:x').slice(0, 2), ['A:123', 'B:x'], 'unfold mixed CRLF/LF/tab');
const pl = I.parseLine('DTSTART;TZID="Custom:Zone";VALUE=DATE-TIME:20260101T100000'); eq([pl.n, pl.p, pl.v], ['DTSTART', [['TZID', '"Custom:Zone"'], ['VALUE', 'DATE-TIME']], '20260101T100000'], 'params with quoted colon');
eq(I.parseLine('summary:hello: world').v, 'hello: world', 'lowercase name + colon in value'); eq(I.parseLine('garbage'), null, 'garbage line');
eq([I.parseDuration('-PT15M'), I.parseDuration('P1DT2H'), I.parseDuration('P2W'), I.parseDuration('PT0S'), I.parseDuration('+P1D'), I.parseDuration('xx')], [-900, 93600, 1209600, 0, 86400, null], 'durations');
eq([I.fmtDuration(-900), I.fmtDuration(0), I.fmtDuration(86400), I.fmtDuration(5400), I.fmtDuration(-90000)], ['-PT15M', 'PT0S', 'P1D', 'PT1H30M', '-P1DT1H'], 'format durations');

// ------------------------------------------------------------------ RRULE parse/stringify
section('rrule');
eq(I.normRRule('freq=weekly;byday=mo,we;interval=2;count=5'), 'FREQ=WEEKLY;COUNT=5;INTERVAL=2;BYDAY=MO,WE', 'normalise'); ok(I.normRRule('FREQ=BOGUS') === null, 'bad freq rejected'); ok(I.normRRule('BYDAY=MO') === null, 'missing freq rejected');
ok(I.normRRule('FREQ=MONTHLY;BYDAY=2TU;BYSETPOS=-1') === 'FREQ=MONTHLY;BYDAY=2TU;BYSETPOS=-1', 'ordinal byday'); ok(I.normRRule('FREQ=DAILY;BYMONTHDAY=0') === null, 'zero monthday rejected');
eq(I.normRRule(I.normRRule('FREQ=YEARLY;UNTIL=20301231T000000Z;BYMONTH=3,1')), 'FREQ=YEARLY;UNTIL=20301231T000000Z;BYMONTH=3,1', 'idempotent normalisation');

// ------------------------------------------------------------------ RFC 5545 section 3.8.5.3 examples
section('RFC 5545 rrule examples');
const rfc = (start, rule, tz = NY) => keysOf(mk({ start, end: start, tz, rrule: I.normRRule(rule) }));
const d = (s) => s; // helper for readability
eq(rfc('1997-09-02T09:00:00', 'FREQ=DAILY;COUNT=10'), Array.from({ length: 10 }, (_, i) => T.addDays('1997-09-02T09:00:00', i)), 'daily x10');
{ const k = rfc('1997-09-02T09:00:00', 'FREQ=DAILY;UNTIL=19971224T000000Z'); eq([k.length, k.at(-1)], [113, '1997-12-23T09:00:00'], 'daily until 24 Dec (UTC until) = 113'); }
eq(rfc('1997-09-02T09:00:00', 'FREQ=DAILY;INTERVAL=2;COUNT=5'), ['1997-09-02', '1997-09-04', '1997-09-06', '1997-09-08', '1997-09-10'].map((x) => x + 'T09:00:00'), 'every other day');
eq(rfc('1997-09-02T09:00:00', 'FREQ=DAILY;INTERVAL=10;COUNT=5'), ['1997-09-02', '1997-09-12', '1997-09-22', '1997-10-02', '1997-10-12'].map((x) => x + 'T09:00:00'), 'every 10 days');
eq(rfc('1997-09-02T09:00:00', 'FREQ=WEEKLY;COUNT=10').map((x) => x.slice(5, 10)), ['09-02', '09-09', '09-16', '09-23', '09-30', '10-07', '10-14', '10-21', '10-28', '11-04'], 'weekly x10');
eq(rfc('1997-09-02T09:00:00', 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TU,TH;COUNT=8').map((x) => x.slice(5, 10)), ['09-02', '09-04', '09-16', '09-18', '09-30', '10-02', '10-14', '10-16'], 'every other week TU,TH WKST=SU');
eq(rfc('1997-09-05T09:00:00', 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR').map((x) => x.slice(0, 10)), ['1997-09-05', '1997-10-03', '1997-11-07', '1997-12-05', '1998-01-02', '1998-02-06', '1998-03-06', '1998-04-03', '1998-05-01', '1998-06-05'], 'first Friday monthly');
eq(rfc('1997-09-22T09:00:00', 'FREQ=MONTHLY;COUNT=6;BYDAY=-2MO').map((x) => x.slice(0, 10)), ['1997-09-22', '1997-10-20', '1997-11-17', '1997-12-22', '1998-01-19', '1998-02-16'], 'second-to-last Monday');
eq(rfc('1997-09-28T09:00:00', 'FREQ=MONTHLY;COUNT=6;BYMONTHDAY=-3').map((x) => x.slice(0, 10)), ['1997-09-28', '1997-10-29', '1997-11-28', '1997-12-29', '1998-01-29', '1998-02-26'], 'third-to-last day');
eq(rfc('1997-09-02T09:00:00', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15').map((x) => x.slice(0, 10)), ['1997-09-02', '1997-09-15', '1997-10-02', '1997-10-15', '1997-11-02', '1997-11-15', '1997-12-02', '1997-12-15', '1998-01-02', '1998-01-15'], 'the 2nd and 15th');
eq(rfc('1997-09-30T09:00:00', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1').map((x) => x.slice(0, 10)), ['1997-09-30', '1997-10-01', '1997-10-31', '1997-11-01', '1997-11-30', '1997-12-01', '1997-12-31', '1998-01-01', '1998-01-31', '1998-02-01'], 'first and last day');
eq(rfc('1997-06-10T09:00:00', 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7').map((x) => x.slice(0, 10)), ['1997-06-10', '1997-07-10', '1998-06-10', '1998-07-10', '1999-06-10', '1999-07-10', '2000-06-10', '2000-07-10', '2001-06-10', '2001-07-10'], 'yearly June/July');
eq(rfc('1997-03-10T09:00:00', 'FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3').map((x) => x.slice(0, 10)), ['1997-03-10', '1999-01-10', '1999-02-10', '1999-03-10', '2001-01-10', '2001-02-10', '2001-03-10', '2003-01-10', '2003-02-10', '2003-03-10'], 'every other year Jan-Mar');
eq(rfc('1997-09-04T09:00:00', 'FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3').map((x) => x.slice(0, 10)), ['1997-09-04', '1997-10-07', '1997-11-06'], 'BYSETPOS=3 of TU,WE,TH');
eq(rfc('1997-09-29T09:00:00', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=7').map((x) => x.slice(0, 10)), ['1997-09-29', '1997-10-30', '1997-11-27', '1997-12-30', '1998-01-29', '1998-02-26', '1998-03-30'], 'second-to-last weekday');
eq(rfc('1997-05-19T09:00:00', 'FREQ=YEARLY;BYDAY=20MO;COUNT=3').map((x) => x.slice(0, 10)), ['1997-05-19', '1998-05-18', '1999-05-17'], '20th Monday of the year');
eq(rfc('1997-05-12T09:00:00', 'FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO;COUNT=3').map((x) => x.slice(0, 10)), ['1997-05-12', '1998-05-11', '1999-05-17'], 'Monday of week 20');
eq(rfc('1997-03-13T09:00:00', 'FREQ=YEARLY;BYMONTH=3;BYDAY=TH;COUNT=11').map((x) => x.slice(0, 10)), ['1997-03-13', '1997-03-20', '1997-03-27', '1998-03-05', '1998-03-12', '1998-03-19', '1998-03-26', '1999-03-04', '1999-03-11', '1999-03-18', '1999-03-25'], 'Thursdays in March');
eq(rfc('1998-02-13T09:00:00', 'FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=5').map((x) => x.slice(0, 10)), ['1998-02-13', '1998-03-13', '1998-11-13', '1999-08-13', '2000-10-13'], 'Friday the 13th');
eq(rfc('2024-02-29T09:00:00', 'FREQ=YEARLY;COUNT=3', 'floating').map((x) => x.slice(0, 10)), ['2024-02-29', '2028-02-29', '2032-02-29'], 'Feb 29 yearly skips non-leap years');
eq(rfc('2026-01-31T09:00:00', 'FREQ=MONTHLY;COUNT=5', 'floating').map((x) => x.slice(0, 10)), ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31'], 'monthly on 31st skips short months');
eq(rfc('2026-10-25T09:00:00', 'FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU;COUNT=3', 'Europe/London').map((x) => x.slice(0, 10)), ['2026-10-25', '2027-10-31', '2028-10-29'], 'last Sunday of October');
eq(rfc('2026-01-01T00:00:00', 'FREQ=HOURLY;INTERVAL=3;COUNT=5', 'UTC').map((x) => x.slice(11, 16)), ['00:00', '03:00', '06:00', '09:00', '12:00'], 'hourly interval 3');
eq(rfc('2026-01-01T09:00:00', 'FREQ=MINUTELY;INTERVAL=45;COUNT=4', 'UTC').map((x) => x.slice(11, 16)), ['09:00', '09:45', '10:30', '11:15'], 'minutely');
eq(rfc('2026-01-01T09:00:00', 'FREQ=DAILY;BYHOUR=9,17;COUNT=4', 'UTC').map((x) => x.slice(5, 16)), ['01-01T09:00', '01-01T17:00', '01-02T09:00', '01-02T17:00'], 'daily BYHOUR');
eq(rfc('2026-01-05T09:00:00', 'FREQ=WEEKLY;BYDAY=MO,FR;COUNT=4', 'floating').map((x) => x.slice(5, 10)), ['01-05', '01-09', '01-12', '01-16'], 'weekly MO,FR');
eq(rfc('2026-01-07T09:00:00', 'FREQ=WEEKLY;BYDAY=MO;COUNT=3', 'floating').map((x) => x.slice(5, 10)), ['01-07', '01-12', '01-19'], 'DTSTART not matching rule is still the first instance (RFC 5545)');
eq(rfc('2026-01-01T09:00:00', 'FREQ=DAILY;UNTIL=20260103', 'floating').length, 3, 'date UNTIL inclusive for timed event');
eq(rfc('2026-01-01T09:00:00', 'FREQ=DAILY;UNTIL=20260103T090000', 'floating').length, 3, 'floating UNTIL inclusive');
eq(rfc('2026-01-01T09:00:00', 'FREQ=DAILY;UNTIL=20260103T085959', 'floating').length, 2, 'floating UNTIL exclusive of later');
eq(rfc('2026-01-01T09:00:00', 'FREQ=DAILY;COUNT=0;BYDAY=MO', 'floating').length > 40, true, 'COUNT=0 means unbounded');
ok(I.keys(mk({ start: '2026-01-01T09:00:00', end: '2026-01-01T10:00:00', tz: 'floating', rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }), Date.UTC(2040, 0, 1), 50).length === 1, 'impossible rule terminates (only DTSTART)');

// ------------------------------------------------------------------ dateutil fixtures
section('python-dateutil cross-check');
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/dateutil-cases.json'), 'utf8'));
let dmism = 0;
for (const c of cases) {
  const ev = mk({ start: c.dtstart, end: c.dtstart, tz: 'floating', rrule: I.normRRule(c.rule) });
  const got = keysOf(ev, c.expected.length, 2200); { const cm = /COUNT=(\d+)/.exec(c.rule); if (cm) { const n = I.keys(ev, Date.UTC(2300, 0, 1), 1000).length; ok(n === Math.min(+cm[1], 1000) || (c.expected.length < +cm[1] && n >= c.expected.length), 'COUNT length ' + c.rule); } } const same = JSON.stringify(got) === JSON.stringify(c.expected); if (!same) dmism++;
  ok(same, `dateutil ${c.dtstart} ${c.rule}\n    got      ${got.slice(0, 8)}\n    expected ${c.expected.slice(0, 8)}`);
}
console.log(`  ${cases.length} generated rules, ${dmism} mismatches`);
// windowed expansion must equal the filtered full expansion (skip-ahead correctness)
let wmis = 0;
for (const c of cases.filter((x) => !/COUNT/.test(x.rule)).slice(0, 60)) {
  const ev = mk({ start: c.dtstart, end: T.addWall(c.dtstart, 3600000), tz: 'floating', rrule: I.normRRule(c.rule) });
  const y = +c.dtstart.slice(0, 4); const from = new Date(y + 2, 2, 1).getTime(), to = new Date(y + 3, 8, 1).getTime();
  const win = I.expand(ev, from, to, []).map((o) => o.key); const full = I.expand(ev, new Date(y - 1, 0, 1).getTime(), new Date(y + 8, 0, 1).getTime(), []).filter((o) => o.s < to && o.e > from).map((o) => o.key);
  const same = JSON.stringify(win) === JSON.stringify(full); if (!same) wmis++; ok(same, `window vs full ${c.rule} ${c.dtstart}`);
}

// ------------------------------------------------------------------ expansion semantics
section('expansion');
const at = (s, tz = NY) => T.wallToEpoch(s, tz);
{ // DST: daily 09:00 New York keeps 09:00 wall time across fall-back
  const ev = mk({ start: '2026-10-30T09:00:00', end: '2026-10-30T10:00:00', tz: NY, rrule: 'FREQ=DAILY;COUNT=5' });
  const o = I.expand(ev, at('2026-10-29T00:00:00'), at('2026-11-10T00:00:00'), []);
  eq(o.map((x) => new Date(x.s).toISOString().slice(5, 16)), ['10-30T13:00', '10-31T13:00', '11-01T14:00', '11-02T14:00', '11-03T14:00'], 'wall time preserved across DST');
  eq(o.map((x) => (x.e - x.s) / 60000), [60, 60, 60, 60, 60], 'duration constant');
}
{ // exdates + overrides
  const ev = mk({ start: '2026-03-02T10:00:00', end: '2026-03-02T11:00:00', tz: NY, title: 'Standup', rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6', exdates: ['2026-03-09T10:00:00'], overrides: { '2026-03-16T10:00:00': { title: 'Moved', start: '2026-03-17T14:00:00', end: '2026-03-17T15:30:00' }, '2026-03-23T10:00:00': { title: 'Renamed' } } });
  const o = I.expand(ev, at('2026-03-01T00:00:00'), at('2026-05-01T00:00:00'), []).sort((a, b) => a.s - b.s);
  eq(o.map((x) => x.wallStart.slice(5, 16)), ['03-02T10:00', '03-17T14:00', '03-23T10:00', '03-30T10:00', '04-06T10:00'], 'exdate removed, override moved, 6 - 1 left');
  eq(o.map((x) => I.F(x, 'title')), ['Standup', 'Moved', 'Renamed', 'Standup', 'Standup'], 'override fields applied');
  eq((o[1].e - o[1].s) / 60000, 90, 'override duration'); eq(I.expand(ev, at('2026-03-17T13:00:00'), at('2026-03-17T13:30:00'), []).length, 0, 'moved occurrence not at its old slot / range before start');
  eq(I.expand(ev, at('2026-03-17T14:30:00'), at('2026-03-17T15:00:00'), []).length, 1, 'moved occurrence found in its new slot');
  eq(I.countBefore(ev, '2026-03-23T10:00:00'), 3, 'countBefore counts rule occurrences incl. excluded'); 
}
{ // rdate
  const ev = mk({ start: '2026-05-04T09:00:00', end: '2026-05-04T10:00:00', tz: 'floating', rrule: 'FREQ=WEEKLY;COUNT=2', rdates: ['2026-05-20T09:00:00', '2026-05-04T09:00:00'] });
  eq(keysOf(ev).length, 2, 'keys ignore rdate'); eq(I.expand(ev, new Date(2026, 4, 1).getTime(), new Date(2026, 5, 1).getTime(), []).map((o) => o.key.slice(5, 10)).sort(), ['05-04', '05-11', '05-20'], 'rdate added, duplicate collapsed');
}
{ // all-day
  const ev = mk({ allDay: true, start: '2026-12-24', end: '2026-12-27', rrule: 'FREQ=YEARLY;COUNT=3', exdates: ['2027-12-24'] });
  const o = I.expand(ev, new Date(2026, 0, 1).getTime(), new Date(2029, 0, 1).getTime(), []); eq(o.map((x) => x.wallStart), ['2026-12-24', '2028-12-24'], 'all-day yearly with date exdate');
  eq(o.map((x) => Math.round((x.e - x.s) / 864e5)), [3, 3], 'all-day span 3 days'); ok(I.expand(ev, new Date(2026, 11, 26, 12).getTime(), new Date(2026, 11, 26, 13).getTime(), []).length === 1, 'multi-day all-day overlaps its middle day'); ok(I.expand(ev, new Date(2026, 11, 27, 0, 0, 1).getTime(), new Date(2026, 11, 27, 5).getTime(), []).length === 0, 'all-day end is exclusive');
}
{ // midnight spanning
  const ev = mk({ start: '2026-06-10T22:00:00', end: '2026-06-11T02:00:00', tz: 'UTC' });
  eq(I.expand(ev, Date.UTC(2026, 5, 11), Date.UTC(2026, 5, 12), []).length, 1, 'event spanning midnight appears on second day'); eq(I.expand(ev, Date.UTC(2026, 5, 11, 2), Date.UTC(2026, 5, 12), []).length, 0, 'ends exactly at range start => excluded');
  eq(I.expand(mk({ start: '2026-06-10T12:00:00', end: '2026-06-10T12:00:00', tz: 'UTC' }), Date.UTC(2026, 5, 10, 12), Date.UTC(2026, 5, 10, 13), []).length, 1, 'zero-length event at range start included');
}
{ // performance: 5,000 events + 200 recurring series, month view
  const evs = []; for (let i = 0; i < 4800; i++) { const day = 1 + (i % 28), mo = 1 + ((i / 28) | 0) % 12; evs.push(mk({ id: 'p' + i, start: `2026-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}:00:00`, end: `2026-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(9 + (i % 9)).padStart(2, '0')}:00:00`, tz: i % 3 ? NY : 'floating' })); }
  for (let i = 0; i < 200; i++) evs.push(mk({ id: 'r' + i, start: `2021-0${1 + (i % 9)}-0${1 + (i % 7)}T09:00:00`, end: `2021-0${1 + (i % 9)}-0${1 + (i % 7)}T10:00:00`, tz: i % 2 ? 'Europe/Paris' : NY, rrule: ['FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,WE', 'FREQ=MONTHLY;BYDAY=2TU', 'FREQ=YEARLY'][i % 4], overrides: i % 5 === 0 ? { '2021-01-01T09:00:00': { title: 'x' } } : {} }));
  const run = () => { const out = []; const f = new Date(2026, 5, 1).getTime(), t = new Date(2026, 6, 13).getTime(); for (const e of evs) I.expand(e, f, t, out); return out; };
  run(); const t0 = performance.now(); const n = run().length; const ms = performance.now() - t0; console.log(`  month range: ${n} occurrences from 5,000 events in ${ms.toFixed(1)} ms (warm)`); ok(ms < 150, 'expansion of month range under 150 ms warm');
  const t1 = performance.now(); const cold = []; const bust = evs.map((e) => Object.assign({}, e, { start: e.start })); for (const e of bust) I.expand(e, new Date(2026, 8, 1).getTime(), new Date(2026, 9, 13).getTime(), cold); const ms2 = performance.now() - t1; console.log(`  cold (no cache): ${ms2.toFixed(1)} ms`); ok(ms2 < 800, 'cold expansion under 800 ms');
}

// ------------------------------------------------------------------ layout
section('layout');
{ const P = (a) => L.pack(a.map(([s, e]) => ({ s, e })));
  let r = P([[0, 60], [30, 90], [60, 120]]); eq(r.map((x) => [x.col, x.cols]), [[0, 2], [1, 2], [0, 2]], 'chain packs into 2 columns (3rd reuses col 0)');
  r = P([[0, 60], [60, 120]]); eq(r.map((x) => [x.col, x.cols, x.span]), [[0, 1, 1], [0, 1, 1]], 'back-to-back events do not overlap');
  r = P([[0, 180], [0, 60], [60, 120], [120, 180]]); eq(r.map((x) => [x.col, x.cols]), [[0, 2], [1, 2], [1, 2], [1, 2]], 'long event beside three short ones');
  r = P([[0, 100], [10, 50], [20, 60], [70, 90]]); eq(r.map((x) => x.col), [0, 1, 2, 1], 'greedy first-fit columns'); eq(r.map((x) => x.span), [1, 1, 1, 2], 'event expands into free neighbouring column');
  r = P([[0, 60], [200, 260], [210, 240]]); eq(r.map((x) => x.cols), [1, 2, 2], 'independent clusters sized separately');
  r = L.pack([{ s: 0, e: 5 }, { s: 6, e: 8 }], 30); eq(r.map((x) => x.cols), [2, 2], 'minLen makes short neighbours share columns');
  const big = []; for (let i = 0; i < 300; i++) big.push({ s: (i * 7) % 600, e: ((i * 7) % 600) + 45 }); const rr = L.pack(big); ok(rr.every((a) => rr.every((b) => a === b || a.col !== b.col || a.cols !== b.cols || a.e <= b.s || b.e <= a.s)), 'no two overlapping events share a column (300 events)');
  eq(L.lanes([{ a: 0, b: 2 }, { a: 1, b: 3 }, { a: 3, b: 4 }, { a: 0, b: 0 }]).map((x) => x.lane), [0, 1, 1, 0], 'lanes: sorted by start then longest first'); }
eq(L.lanes([{ a: 0, b: 2 }, { a: 1, b: 3 }, { a: 3, b: 4 }]).map((x) => x.lane), [0, 1, 0], 'bar lanes reuse freed lane');

// ------------------------------------------------------------------ free time
section('free time');
{ const day = (h, m = 0) => new Date(2026, 9, 26, h, m).getTime(); // Monday
  const w = FR.windows([[day(10), day(11)], [day(13), day(14)]], day(0), day(24), 60 * 60000, { workStart: 540, workEnd: 1020, days: [1] });
  eq(w.map((x) => [new Date(x.s).getHours(), new Date(x.e).getHours()]), [[9, 10], [11, 13], [14, 17]], 'free windows between meetings');
  eq(FR.windows([[day(9), day(17)]], day(0), day(24), 1800000, { days: [1] }).length, 0, 'fully booked day has no windows');
  eq(FR.windows([], day(0), day(24), 1800000, { days: [2] }).length, 0, 'non-working weekday skipped');
  eq(FR.windows([[day(8), day(9, 20)]], day(0), day(24), 3600000, { days: [1] }).map((x) => new Date(x.s).getMinutes() + ':' + new Date(x.s).getHours()), ['30:9'], 'start rounds up to 15-minute grid'); }

// ------------------------------------------------------------------ holidays & moon
section('holidays & moon');
const hd = (cc, y) => Object.fromEntries(H.forYear(cc, y).map((h) => [h.name, h.date]));
eq(T.dateStr(H.easter(2026)), '2026-04-05', 'Easter 2026'); eq(T.dateStr(H.easter(2027)), '2027-03-28', 'Easter 2027'); eq(T.dateStr(H.easter(2038)), '2038-04-25', 'Easter 2038 (latest)'); eq(T.dateStr(H.easter(1818)), '1818-03-22', 'Easter 1818 (earliest)');
eq(hd('US', 2026)['Thanksgiving'], '2026-11-26', 'US Thanksgiving'); eq(hd('US', 2027)['Thanksgiving'], '2027-11-25', 'US Thanksgiving 2027'); eq(hd('US', 2026)['Memorial Day'], '2026-05-25', 'Memorial Day'); eq(hd('US', 2026)['Independence Day (observed)'], '2026-07-03', 'US Saturday holiday observed Friday');
eq(hd('US', 2027)['Christmas Day (observed)'], '2027-12-24', 'Christmas 2027 observed Fri');
eq(hd('GB', 2026)['Good Friday'], '2026-04-03', 'UK Good Friday'); eq(hd('GB', 2026)['Boxing Day (observed)'], '2026-12-28', 'UK Boxing Day substitute'); eq(hd('GB', 2026)['Spring Bank Holiday'], '2026-05-25', 'UK spring bank'); eq(hd('GB', 2027)['Christmas Day (observed)'], '2027-12-27', 'UK Christmas Sat -> Mon'); eq(hd('GB', 2027)['Boxing Day (observed)'], '2027-12-28', 'UK Boxing Sun -> Tue');
eq(hd('CA', 2026)['Victoria Day'], '2026-05-18', 'Victoria Day'); eq(hd('CA', 2027)['Victoria Day'], '2027-05-24', 'Victoria Day 2027'); eq(hd('CA', 2026)['Thanksgiving'], '2026-10-12', 'Canadian Thanksgiving');
eq(hd('AU', 2026)['Anzac Day'], '2026-04-25', 'Anzac Day'); eq(hd('AU', 2026)['King’s Birthday'], '2026-06-08', 'King’s Birthday');
eq(hd('DE', 2026)['Christi Himmelfahrt'], '2026-05-14', 'Ascension'); eq(hd('DE', 2026)['Pfingstmontag'], '2026-05-25', 'Whit Monday'); eq(hd('FR', 2026)['Lundi de Pâques'], '2026-04-06', 'Lundi de Pâques'); eq(hd('FR', 2026)['Fête nationale'], '2026-07-14', 'Bastille day');
eq(hd('JP', 2026)['Vernal Equinox Day'], '2026-03-20', 'JP vernal equinox 2026'); eq(hd('JP', 2026)['Autumnal Equinox Day'], '2026-09-23', 'JP autumnal equinox 2026'); eq(hd('JP', 2026)['Marine Day'], '2026-07-20', 'Marine Day'); eq(hd('JP', 2026)['Constitution Memorial Day'], '2026-05-03', 'Constitution Day');
eq(hd('CN', 2026)['Spring Festival'], '2026-02-17', 'Chinese New Year 2026'); eq(hd('CN', 2027)['Spring Festival'], '2027-02-06', 'Chinese New Year 2027'); eq(hd('CN', 2026)['Mid-Autumn Festival'], '2026-09-25', 'Mid-Autumn 2026'); eq(hd('CN', 2026)['Dragon Boat Festival'], '2026-06-19', 'Dragon Boat 2026'); eq(hd('CN', 2026)['Qingming Festival'], '2026-04-05', 'Qingming 2026'); eq(hd('CN', 2025)['Qingming Festival'], '2025-04-04', 'Qingming 2025');
eq(hd('IN', 2026)['Republic Day'], '2026-01-26', 'Republic Day'); eq(hd('BR', 2026)['Carnival Tuesday'], '2026-02-17', 'Carnaval 2026'); eq(hd('BR', 2026)['Corpus Christi'], '2026-06-04', 'Corpus Christi');
eq(Object.keys(H.countries).sort(), ['AU', 'BR', 'CA', 'CN', 'DE', 'FR', 'GB', 'IN', 'JP', 'US'], 'ten countries');
ok(Object.keys(H.countries).every((c) => H.forYear(c, 2031).length >= 5 && H.forYear(c, 1999).length >= 5), 'every country has holidays for arbitrary years');
{ const ph = M.phases(Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1)); const full = ph.find((p) => p.name === 'Full Moon'); ok(Math.abs(full.at - Date.UTC(2026, 0, 3, 10, 3)) < 20 * 60000, 'Full moon 2026-01-03 10:03 UTC within 20 min'); ok(Math.abs(ph.find((p) => p.name === 'New Moon').at - Date.UTC(2026, 0, 18, 19, 52)) < 20 * 60000, 'New moon 2026-01-18'); eq(ph.map((p) => p.name), ['Full Moon', 'Last Quarter', 'New Moon', 'First Quarter'], 'phase sequence'); }

// ------------------------------------------------------------------ ICS parsing
section('ics parse');
const OUTLOOK = `BEGIN:VCALENDAR
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
VERSION:2.0
METHOD:PUBLISH
X-WR-CALNAME:Work
BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16011104T020000
RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010311T020000
RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
CLASS:PUBLIC
CREATED:20260105T120000Z
DESCRIPTION:Line one\\nLine two\\, with comma\; and semi
DTEND;TZID=Eastern Standard Time:20260112T110000
DTSTART;TZID=Eastern Standard Time:20260112T100000
LAST-MODIFIED:20260106T080000Z
LOCATION:Room 4\\, Building B
PRIORITY:5
RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO
EXDATE;TZID=Eastern Standard Time:20260119T100000
SUMMARY;LANGUAGE=en-us:Weekly sync
TRANSP:OPAQUE
UID:040000008200E00074C5B7101A82E008000000001
X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE
X-MICROSOFT-CDO-IMPORTANCE:1
ATTENDEE;CN="Doe, Jane";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:jane@example.com
ORGANIZER;CN=Boss:mailto:boss@example.com
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260303
SUMMARY:Conference
CATEGORIES:Work,Travel
CATEGORIES:Big\\, Important
END:VEVENT
END:VCALENDAR`;
{ const r = I.parse(OUTLOOK); eq(r.events.length, 2, 'two events'); eq(r.name, 'Work', 'X-WR-CALNAME');
  const e = r.events[0]; eq([e.tz, e.start, e.end], [NY, '2026-01-12T10:00:00', '2026-01-12T11:00:00'], 'Windows TZID mapped to IANA'); eq(e.notes, 'Line one\nLine two, with comma; and semi', 'description unescaped'); eq(e.loc, 'Room 4, Building B', 'location'); eq(e.title, 'Weekly sync', 'summary w/ param');
  eq(e.rrule, 'FREQ=WEEKLY;COUNT=4;BYDAY=MO', 'rrule normalised'); eq(e.exdates, ['2026-01-19T10:00:00'], 'exdate'); eq(e.alarms, [{ m: 15, action: 'DISPLAY' }], 'alarm'); eq(e.avail, 'tentative', 'busy status'); eq(e.attendees, [{ name: 'Doe, Jane', email: 'jane@example.com', role: 'REQ-PARTICIPANT', partstat: 'ACCEPTED' }], 'attendee'); eq(e.organizer.email, 'boss@example.com', 'organizer');
  eq(e.x.map((x) => x.n), ['CLASS', 'PRIORITY', 'X-MICROSOFT-CDO-IMPORTANCE'], 'unknown/X props preserved'); eq(e.created, Date.UTC(2026, 0, 5, 12), 'created');
  const a = r.events[1]; eq([a.allDay, a.start, a.end, a.tz], [true, '2026-03-01', '2026-03-03', 'floating'], 'all-day exclusive end'); eq(a.categories, ['Work', 'Travel', 'Big, Important'], 'categories split on unescaped commas');
  eq(I.expand(e, at('2026-01-01T00:00:00'), at('2026-03-01T00:00:00'), []).map((o) => o.wallStart.slice(5, 10)), ['01-12', '01-26', '02-02'], 'parsed series expands with exdate'); }
{ const r = I.parse('BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:a\nDTSTART:20260601T090000Z\nDURATION:PT90M\nSUMMARY:Utc one\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nDTSTART:20260601T090000\nSUMMARY:Floating no end\nEND:VEVENT\nBEGIN:VEVENT\nUID:c\nDTSTART;VALUE=DATE:20260601\nSUMMARY:Date no end\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:No dtstart\nEND:VEVENT\nBEGIN:VEVENT\nUID:e\nDTSTART;TZID=Nowhere/Land:20260601T090000\nDTEND;TZID=Asia/Tokyo:20260601T180000\nSUMMARY:Unknown tz');
  eq(r.events.length, 4, 'event w/o DTSTART skipped; truncated file tolerated'); eq(r.warnings.length, 1, 'warning for skipped'); eq([r.events[0].tz, r.events[0].end], ['UTC', '2026-06-01T10:30:00'], 'DURATION -> end'); eq([r.events[1].tz, r.events[1].end], ['floating', '2026-06-01T09:00:00'], 'no end => zero duration'); eq(r.events[2].end, '2026-06-02', 'date without end => one day'); eq([r.events[3].tz, r.events[3].endTz], ['floating', 'Asia/Tokyo'], 'unknown zone falls back to floating; separate end zone kept'); }
{ const r = I.parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Custom Zone\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0545\r\nTZOFFSETTO:+0545\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:z\r\nDTSTART;TZID=Custom Zone:20260601T090000\r\nSUMMARY:Fixed\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'); eq(r.events[0].tz, 'fixed:+0545', 'VTIMEZONE without IANA name -> fixed offset'); eq(I.base(r.events[0]).s, Date.UTC(2026, 5, 1, 3, 15), 'fixed offset arithmetic'); }
{ const r = I.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:m\nDTSTART;TZID=America/New_York:20260601T090000\nDTEND;TZID=America/New_York:20260601T100000\nRRULE:FREQ=DAILY;COUNT=3\nSUMMARY:Master\nEND:VEVENT\nBEGIN:VEVENT\nUID:m\nRECURRENCE-ID:20260602T130000Z\nDTSTART;TZID=America/New_York:20260602T150000\nDTEND;TZID=America/New_York:20260602T160000\nSUMMARY:Changed\nLOCATION:Elsewhere\nEND:VEVENT\nEND:VCALENDAR');
  eq(r.events.length, 1, 'override attached to master'); eq(Object.keys(r.events[0].overrides), ['2026-06-02T09:00:00'], 'RECURRENCE-ID in UTC converted to master zone key'); eq(r.events[0].overrides['2026-06-02T09:00:00'], { title: 'Changed', loc: 'Elsewhere', start: '2026-06-02T15:00:00', end: '2026-06-02T16:00:00' }, 'override stores only differing fields'); }
{ let threw = false; try { I.parse('hello world'); } catch (e) { threw = /iCalendar/.test(e.message); } ok(threw, 'non-ics throws a friendly error'); }
{ const r = I.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:t\nDTSTART:20260601T090000Z\nSUMMARY:Alarms\nBEGIN:VALARM\nTRIGGER;RELATED=END:PT0S\nACTION:AUDIO\nEND:VALARM\nBEGIN:VALARM\nTRIGGER;VALUE=DATE-TIME:20260601T080000Z\nACTION:DISPLAY\nEND:VALARM\nBEGIN:VALARM\nTRIGGER:-P1D\nEND:VALARM\nBEGIN:VALARM\nACTION:DISPLAY\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR'); eq(r.events[0].alarms.length, 3, 'valarms: end-related, absolute, day; broken skipped'); eq(r.events[0].alarms[0], { m: 0, action: 'AUDIO', rel: 'END' }, 'related END'); eq(r.events[0].alarms[1].abs, Date.UTC(2026, 5, 1, 8), 'absolute trigger'); eq(r.events[0].alarms[2].m, 1440, '-P1D = 1440 min'); }

// ------------------------------------------------------------------ strict RFC 5545 validator (independent of the serializer)
function validateICS(text) {
  const errs = []; const bytes = (s) => new TextEncoder().encode(s).length;
  if (!text.endsWith('\r\n')) errs.push('missing final CRLF'); if (/[^\r]\n/.test(text) || /\r(?!\n)/.test(text)) errs.push('bare CR or LF');
  const phys = text.split('\r\n'); phys.pop(); for (const l of phys) { if (bytes(l) > 75) errs.push('line > 75 octets: ' + l.slice(0, 40)); if (/[\u0000-\u0008\u000b-\u001f]/.test(l)) errs.push('control char'); }
  const lines = []; for (const l of phys) { if (/^[ \t]/.test(l)) { if (!lines.length) errs.push('continuation first'); else lines[lines.length - 1] += l.slice(1); } else lines.push(l); }
  const stack = []; const comps = []; let cur = null; const tzids = new Set(), usedTz = new Set();
  for (const l of lines) {
    const m = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):(.*)$/.exec(l); if (!m) { errs.push('malformed line: ' + l.slice(0, 60)); continue; }
    const [, name, params, val] = m; if (name === 'BEGIN') { cur = { name: val, props: [], parent: cur, kids: [] }; if (cur.parent) cur.parent.kids.push(cur); else comps.push(cur); stack.push(val); continue; }
    if (name === 'END') { if (stack.pop() !== val) errs.push('END mismatch ' + val); cur = cur && cur.parent; continue; } if (!cur) { errs.push('prop outside component'); continue; } cur.props.push({ name, params, val });
    const tz = /TZID=("[^"]*"|[^;:]*)/.exec(params); if (tz) usedTz.add(tz[1].replace(/"/g, ''));
    if (/\\/.test(val.replace(/\\[nN\\;,]/g, '')) && ['SUMMARY', 'DESCRIPTION', 'LOCATION', 'CATEGORIES'].includes(name)) errs.push('bad escape in ' + name + ': ' + val.slice(0, 80));
    if (['SUMMARY', 'DESCRIPTION', 'LOCATION'].includes(name) && /(^|[^\\])[;,]/.test(val.replace(/\\./g, ''))) errs.push('unescaped ; or , in ' + name);
  }
  if (stack.length) errs.push('unclosed ' + stack.join(','));
  const cal = comps[0]; if (!cal || cal.name !== 'VCALENDAR') errs.push('no VCALENDAR'); else { const has = (c, n) => c.props.some((p) => p.name === n); if (!has(cal, 'VERSION') || cal.props.find((p) => p.name === 'VERSION').val !== '2.0') errs.push('VERSION'); if (!has(cal, 'PRODID')) errs.push('PRODID');
    for (const c of cal.kids) { if (c.name === 'VTIMEZONE') { const id = c.props.find((p) => p.name === 'TZID'); if (!id) errs.push('VTIMEZONE no TZID'); else tzids.add(id.val.replace(/"/g, '')); if (!c.kids.some((k) => k.name === 'STANDARD' || k.name === 'DAYLIGHT')) errs.push('VTIMEZONE empty'); for (const k of c.kids) for (const n of ['DTSTART', 'TZOFFSETFROM', 'TZOFFSETTO']) if (!has(k, n)) errs.push('tz sub missing ' + n); }
      if (c.name === 'VEVENT') { for (const n of ['UID', 'DTSTAMP', 'DTSTART']) if (!has(c, n)) errs.push('VEVENT missing ' + n); const ds = c.props.find((p) => p.name === 'DTSTART'), de = c.props.find((p) => p.name === 'DTEND'); const isDate = (p) => /VALUE=DATE(?!-)/.test(p.params) || /^\d{8}$/.test(p.val);
        if (ds && !/^\d{8}(T\d{6}Z?)?$/.test(ds.val)) errs.push('DTSTART value ' + ds.val); if (ds && de && isDate(ds) !== isDate(de)) errs.push('DTSTART/DTEND type mismatch'); if (ds && de && ds.val.length === de.val.length && de.val < ds.val && !/TZID|Z$/.test(ds.params + ds.val)) errs.push('DTEND before DTSTART');
        if (de && has(c, 'DURATION')) errs.push('DTEND and DURATION both'); const dtstamp = c.props.find((p) => p.name === 'DTSTAMP'); if (dtstamp && !/^\d{8}T\d{6}Z$/.test(dtstamp.val)) errs.push('DTSTAMP must be UTC');
        const rr = c.props.find((p) => p.name === 'RRULE'); if (rr) { const parts = Object.fromEntries(rr.val.split(';').map((x) => x.split('='))); if (!parts.FREQ) errs.push('RRULE no FREQ'); if (parts.COUNT && parts.UNTIL) errs.push('COUNT and UNTIL'); if (parts.UNTIL && !isDate(ds) && /TZID/.test(ds.params) && !/Z$/.test(parts.UNTIL)) errs.push('UNTIL must be UTC for TZID DTSTART'); }
        for (const a of c.kids) { if (a.name !== 'VALARM') errs.push('unexpected child ' + a.name); else { for (const n of ['ACTION', 'TRIGGER']) if (!has(a, n)) errs.push('VALARM missing ' + n); if (a.props.find((p) => p.name === 'ACTION')?.val === 'DISPLAY' && !has(a, 'DESCRIPTION')) errs.push('DISPLAY alarm needs DESCRIPTION'); } }
        for (const p of c.props) if (p.name === 'ATTENDEE' && !/^(mailto:|invalid:)/.test(p.val)) errs.push('ATTENDEE not a URI'); } } }
  for (const z of usedTz) if (!tzids.has(z)) errs.push('TZID ' + z + ' has no VTIMEZONE');
  return errs;
}

section('ics serialize (strict) + round trips');
const now0 = Date.UTC(2026, 9, 26, 12);
const rich = () => { const e = mk({ id: 'u1@zc', uid: 'u1@zc', title: 'Quarterly review, "Q4"; planning', loc: 'Café Zürich, Room 5', notes: 'Agenda:\n1. Numbers; costs\n2. 日本語 and emoji 😀 ' + 'long '.repeat(40) + '\\ backslash', url: 'https://example.com/a?b=c;d', start: '2026-11-02T09:30:00', end: '2026-11-02T11:00:00', tz: NY, rrule: 'FREQ=MONTHLY;COUNT=6;BYDAY=1MO', exdates: ['2026-12-07T09:30:00'], rdates: ['2026-11-20T09:30:00'], categories: ['Work', 'Big, Important'], travel: 25, avail: 'free', color: '#30d158', alarms: [{ m: 15, action: 'DISPLAY' }, { m: 1440, action: 'DISPLAY' }, { m: -540, action: 'DISPLAY' }, { m: 0, action: 'DISPLAY', abs: Date.UTC(2026, 10, 1, 8) }], attendees: [{ name: 'Sam O’Neil', email: 'sam@example.com', role: 'REQ-PARTICIPANT', partstat: 'NEEDS-ACTION' }, { name: 'Just A Name', email: '' }, { name: 'Lee, Pat', email: 'pat@example.com', role: 'OPT-PARTICIPANT', partstat: 'ACCEPTED', rsvp: 'TRUE' }], organizer: { name: 'Me', email: 'me@example.com' }, created: Date.UTC(2026, 9, 1), modified: Date.UTC(2026, 9, 2), x: [{ n: 'X-CUSTOM', p: [['X-P', '"a:b"']], v: 'keep me' }, { n: 'PRIORITY', p: [], v: '3' }], overrides: { '2026-11-02T09:30:00': { title: 'Review (moved)', loc: 'Zoom', start: '2026-11-03T14:00:00', end: '2026-11-03T15:00:00' }, '2027-01-04T09:30:00': { alarms: [], travel: 0 } } }); return e; };
const evs = [rich(),
  mk({ id: 'u2', uid: 'u2', allDay: true, start: '2026-12-24', end: '2026-12-27', title: 'Holiday', rrule: 'FREQ=YEARLY', exdates: ['2027-12-24'], tz: 'floating' }),
  mk({ id: 'u3', uid: 'u3', title: 'UTC call', start: '2026-05-05T15:00:00', end: '2026-05-05T16:00:00', tz: 'UTC' }),
  mk({ id: 'u4', uid: 'u4', title: 'Floating', start: '2026-05-06T15:00:00', end: '2026-05-06T16:00:00', tz: 'floating' }),
  mk({ id: 'u5', uid: 'u5', title: 'Flight', start: '2026-05-07T22:00:00', end: '2026-05-08T06:30:00', tz: 'Asia/Tokyo', endTz: 'Europe/London' }),
  mk({ id: 'u6', uid: 'u6', title: 'Empty fields' }), mk({ id: 'u7', uid: 'u7', title: 'Fixed zone', start: '2026-05-06T09:00:00', end: '2026-05-06T10:00:00', tz: 'fixed:+0545' }),
  mk({ id: 'u8', uid: 'u8', title: 'Weekly until', start: '2026-05-04T09:00:00', end: '2026-05-04T09:30:00', tz: 'Australia/Sydney', rrule: 'FREQ=WEEKLY;UNTIL=20261231T000000Z;BYDAY=MO,TH', status: 'CONFIRMED' })];
evs[5].start = '2026-05-09'; evs[5].end = '2026-05-09'; evs[5].allDay = true; evs[5].end = '2026-05-10';
const ics = I.serialize(evs, { name: 'Test, "cal"', color: '#ff453a', now: now0 }); const icsU = ics.replace(/\r\n /g, '');
const verrs = validateICS(ics); eq(verrs, [], 'strict validator finds no problems in serialized output'); ok(ics.includes('BEGIN:VTIMEZONE\r\nTZID:America/New_York'), 'VTIMEZONE emitted for IANA zone'); ok(ics.includes('RECURRENCE-ID;TZID=America/New_York:20261102T093000'), 'RECURRENCE-ID emitted'); ok(!ics.includes('TZID=floating'), 'no TZID for floating');
ok(/X-CUSTOM;X-P="a:b":keep me/.test(ics.replace(/\r\n /g, '')), 'X- prop and its params round trip verbatim'); ok(/ATTENDEE;CN="Lee, Pat";/.test(icsU), 'attendee CN quoted'); ok(icsU.includes('invalid:nomail'), 'attendee without email uses a valid URI'); ok(/DTSTAMP:20261002T000000Z/.test(ics), 'DTSTAMP from modified');
ok(/EXDATE;VALUE=DATE:20271224/.test(ics), 'all-day exdate as DATE'); ok(/UNTIL=20261231T000000Z/.test(ics), 'UTC until kept'); ok(/TRIGGER:-PT15M/.test(ics) && /TRIGGER:-P1D/.test(ics) && /TRIGGER:PT9H/.test(ics), 'alarm triggers'); ok(/TRIGGER;VALUE=DATE-TIME:20261101T080000Z/.test(ics), 'absolute trigger'); ok(/X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT25M/.test(ics), 'travel time');
const back = I.parse(ics); eq(back.name, 'Test, "cal"', 'calendar name round trip'); eq(back.color, '#ff453a', 'calendar colour round trip'); eq(back.warnings, [], 'no warnings on own output');
const strip = (e) => { const o = JSON.parse(JSON.stringify(e)); return o; };
evs.forEach((e, i) => { const b = back.events.find((x) => x.uid === e.uid); const want = strip(e); const got = strip(b); if (e.tz === 'fixed:+0545') { eq(got.tz, 'fixed:+0545', 'fixed zone survives'); return; } delete want.id; delete got.id; if (want.allDay) want.tz = 'floating'; eq(got, want, `parse(serialize(e)) == e  [${e.title}]`); });
{ const ics2 = I.serialize(back.events, { name: back.name, color: back.color, now: now0 }); eq(ics2, ics, 'serialize is a fixed point: serialize(parse(serialize(x))) == serialize(x)'); const back2 = I.parse(ics2); eq(back2.events.map(strip), back.events.map(strip), 'second parse identical'); }
{ // same events -> same expansion
  const f = at('2026-10-01T00:00:00'), t = at('2028-03-01T00:00:00'); for (const e of evs) { const b = back.events.find((x) => x.uid === e.uid); if (e.tz === 'fixed:+0545') continue; const A = [], B = []; I.expand(e, f, t, A); I.expand(b, f, t, B); eq(B.map((o) => [o.key, o.s, o.e]), A.map((o) => [o.key, o.s, o.e]), `expansion identical after round trip [${e.title}]`); } }
{ const e = mk({ title: 'x'.repeat(300), notes: 'é'.repeat(500), start: '2026-01-01T00:00:00', end: '2026-01-01T01:00:00', tz: 'floating' }); eq(validateICS(I.serialize([e], { now: now0 })), [], 'very long lines fold safely'); }
{ const e = mk({ title: 'ctrl\u0001\u0007 chars\r\nwith newline', start: '2026-01-01T00:00:00', end: '2026-01-01T01:00:00', tz: 'floating' }); const s = I.serialize([e], { now: now0 }); eq(validateICS(s), [], 'control characters stripped'); eq(I.parse(s).events[0].title, 'ctrl chars\nwith newline', 'newline round trip'); }
eq(validateICS(I.serialize([], { now: now0 })), [], 'empty calendar is valid');
{ const dayTz = I.vtimezone(NY, 2026, 2027); ok(/BEGIN:DAYLIGHT[\s\S]*TZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400/.test(dayTz) && /BEGIN:STANDARD[\s\S]*TZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500/.test(dayTz), 'VTIMEZONE New York offsets'); ok(/DTSTART:20260308T020000/.test(dayTz) && /DTSTART:20261101T020000/.test(dayTz), 'VTIMEZONE transition local times (2026-03-08 02:00, 2026-11-01 02:00)'); ok(/RDATE:20270314T020000/.test(dayTz), 'RDATE second-year transition');
  const kolk = I.vtimezone('Asia/Kolkata', 2026, 2026); ok(/TZOFFSETTO:\+0530/.test(kolk) && !/DAYLIGHT/.test(kolk), 'VTIMEZONE Kolkata fixed +0530');
  const lh = I.vtimezone('Australia/Lord_Howe', 2026, 2026); ok(/TZOFFSETTO:\+1100/.test(lh) && /TZOFFSETTO:\+1030/.test(lh), 'VTIMEZONE Lord Howe half-hour DST'); }

// real-world style foreign output (Google/Apple shaped)
section('foreign ics shapes');
const GOOGLE = ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Fam', 'X-WR-TIMEZONE:Europe/Berlin', 'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Berlin:20260915T180000', 'DTEND;TZID=Europe/Berlin:20260915T190000', 'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261201T165959Z;BYDAY=TU', 'DTSTAMP:20261001T101010Z', 'UID:abc123@google.com', 'CREATED:20260901T000000Z', 'DESCRIPTION:Bring\\nshoes', 'LAST-MODIFIED:20260902T000000Z', 'LOCATION:Gym', 'SEQUENCE:2', 'STATUS:CONFIRMED', 'SUMMARY:Training', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
{ const r = I.parse(GOOGLE); const e = r.events[0]; eq(e.sequence, 2, 'sequence kept'); eq(e.rrule, 'FREQ=WEEKLY;UNTIL=20261201T165959Z;BYDAY=TU;WKST=SU', 'WKST kept'); const k = I.keys(e, Date.UTC(2027, 0, 1)); eq([k.length, k[0], k.at(-1)], [11, '2026-09-15T18:00:00', '2026-11-24T18:00:00'], 'google weekly series until (UNTIL is 1s before the 1 Dec start)');
  eq(validateICS(I.serialize(r.events, { now: now0 })), [], 'reserialized google event is strictly valid'); ok(I.serialize(r.events, { now: now0 }).includes('SEQUENCE:2'), 'SEQUENCE preserved'); }
{ const apple = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//macOS 15//EN\r\nBEGIN:VEVENT\r\nCREATED:20260101T000000Z\r\nDTEND;TZID=America/Los_Angeles:20260401T110000\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=America/Los_Angeles:20260401T100000\r\nLAST-MODIFIED:20260101T000000Z\r\nSEQUENCE:0\r\nSUMMARY:Apple style\r\nUID:E1B0\r\nX-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT1H\r\nX-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="1 Infinite Loop\\nCupertino":geo:37.33,-122.03\r\nBEGIN:VALARM\r\nACTION:AUDIO\r\nTRIGGER:-PT5M\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'; const e = I.parse(apple).events[0]; eq(e.travel, 60, 'apple travel duration'); eq(e.x.map((x) => x.n), ['X-APPLE-STRUCTURED-LOCATION'], 'apple structured location preserved as X prop'); ok(I.serialize([e], { now: now0 }).replace(/\r\n /g, '').includes('X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="1 Infinite Loop\\nCupertino":geo:37.33,-122.03'), 'structured location re-emitted verbatim'); }

// ------------------------------------------------------------------ CSV
section('outlook csv');
{ eq(CSV.parse('a,"b,c","d ""q""\nline",e\r\n1,2,3,4\r\n'), [['a', 'b,c', 'd "q"\nline', 'e'], ['1', '2', '3', '4']], 'csv quoting & newlines'); eq(CSV.stringify([['a', 'b,c', 'x"y', 'l1\nl2']]), 'a,"b,c","x""y","l1\nl2"\r\n', 'csv stringify');
  const csv = 'Subject,Start Date,Start Time,End Date,End Time,All day event,Reminder on/off,Reminder Date,Reminder Time,Categories,Description,Location,Required Attendees,Show time as\r\n"Team, sync",10/27/2026,10:00:00 AM,10/27/2026,11:30:00 AM,False,True,10/27/2026,9:45:00 AM,Work;Team,"Line1\nLine2",Room 1,Ann <ann@x.org>; Bob,Tentative\r\nHoliday,12/24/2026,,12/26/2026,,True,False,,,,,,,Free\r\n';
  const r = CSV.toEvents(csv); eq(r.events.length, 2, 'two csv rows'); const [a, b] = r.events; eq([a.title, a.start, a.end, a.alarms[0].m, a.categories, a.avail, a.notes], ['Team, sync', '2026-10-27T10:00:00', '2026-10-27T11:30:00', 15, ['Work', 'Team'], 'tentative', 'Line1\nLine2'], 'csv row fields'); eq(a.attendees.map((x) => x.email || x.name), ['ann@x.org', 'Bob'], 'csv attendees'); eq([b.allDay, b.start, b.end, b.avail], [true, '2026-12-24', '2026-12-27', 'free'], 'csv all-day inclusive end -> exclusive');
  eq(CSV.toEvents(csv.replace(/10\/27\/2026/g, '27/10/2026').replace(/12\/24\/2026/, '24/12/2026').replace(/12\/26\/2026/, '26/12/2026')).events[0].start, '2026-10-27T10:00:00', 'dd/mm/yyyy auto-detected'); eq(CSV.toEvents('Subject,Start Date\nx,2026-03-04').events[0].start, '2026-03-04', 'ISO dates');
  let threw = false; try { CSV.toEvents('foo,bar\n1,2'); } catch { threw = true; } ok(threw, 'non-calendar csv rejected');
  const occs = []; for (const e of r.events) I.expand(e, new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime(), occs); const out = CSV.fromOccurrences(occs); const again = CSV.toEvents(out).events; eq(again.map((e) => [e.title, e.start, e.end, e.allDay]), r.events.map((e) => [e.title, e.start, e.end, e.allDay]), 'csv export -> import round trip'); }

// ------------------------------------------------------------------ natural language
section('quick add');
{ const now = new Date(2026, 9, 26, 10, 0); const P = (t) => N.parse(t, now);
  let r = P('Lunch with Sam tomorrow 1pm for 1h at Café'); eq([r.title, r.loc, r.start, r.end], ['Lunch with Sam', 'Café', '2026-10-27T13:00:00', '2026-10-27T14:00:00'], 'spec example');
  r = P('Dentist next friday 3-4pm'); eq([r.start, r.end], ['2026-11-06T15:00:00', '2026-11-06T16:00:00'], 'next friday + range'); r = P('Team standup every weekday 9:30am'); eq([r.rrule, r.start], ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-10-27T09:30:00'], 'weekday repeat');
  r = P('Rent due Nov 1 all day'); eq([r.allDay, r.start, r.end, r.title], [true, '2026-11-01', '2026-11-02', 'Rent due'], 'all-day'); r = P('Call mom 7pm'); eq(r.start, '2026-10-26T19:00:00', 'time only, later today'); r = P('Call mom 9am'); eq(r.start, '2026-10-27T09:00:00', 'time only, already passed => tomorrow');
  r = P('Flight 12/15 at 6:45am for 5 hours'); eq([r.start, r.end], ['2026-12-15T06:45:00', '2026-12-15T11:45:00'], 'numeric date + hours'); r = P('Gym every monday and wednesday at 6pm'); eq(r.rrule, 'FREQ=WEEKLY;BYDAY=MO,WE', 'two weekdays'); r = P('Review 2pm remind me 15 min before'); eq(r.alarms, [15], 'alert phrase');
  r = P('Meeting 11-1pm'); eq([r.start, r.end], ['2026-10-26T11:00:00', '2026-10-26T13:00:00'], '11-1pm inference'); r = P('Dinner tonight at Luigi\'s'); eq([r.start, r.loc], ['2026-10-26T19:00:00', "Luigi's"], 'tonight'); r = P('Trip 3 Dec for 3 days'); eq([r.start, r.end], ['2026-12-03', '2026-12-06'], 'multi-day'); r = P('Coffee in 2 days at 10'); eq(r.start, '2026-10-28T10:00:00', 'in N days, bare hour');
  r = P('Lunch at noon'); eq(r.start, '2026-10-26T12:00:00', 'noon'); r = P('Pay rent every month'); eq(r.rrule, 'FREQ=MONTHLY', 'every month'); r = P('Sync every 2 weeks tuesday 4pm'); eq(r.rrule.startsWith('FREQ=WEEKLY;INTERVAL=2'), true, 'every 2 weeks'); r = P('   '); eq(r.title, 'New Event', 'empty title default'); r = P('Party on 2027-01-02 8pm'); eq(r.start, '2027-01-02T20:00:00', 'ISO date'); r = P('Visit Oct 3'); eq(r.start, '2027-10-03', 'past date rolls to next year'); r = P('Hike sat 8am for 90 min'); eq([r.start, r.end], ['2026-10-31T08:00:00', '2026-10-31T09:30:00'], 'weekday abbreviation + minutes'); }


// ------------------------------------------------------------------ time balance
section('time balance');
{ const H1 = 3600000; const d0 = new Date(2026, 9, 26).getTime(); // Monday
  const at = (day, h, m = 0) => new Date(2026, 9, 26 + day, h, m).getTime();
  const calA = { id: 'a', name: 'Work', color: '#00f' }, calB = { id: 'b', name: 'Home', color: '#f00' };
  const oc = (cal, s, e, ev = {}) => ({ cal, s, e, allDay: false, ev: Object.assign(I.newEvent({ id: 'e' + Math.random(), start: '2026-10-26T09:00:00', end: '2026-10-26T10:00:00' }), ev), ov: null });
  const occs = [
    oc(calA, at(0, 9), at(0, 10), { attendees: [{ name: 'x', email: '' }], categories: ['Meeting'] }), oc(calA, at(0, 9, 30), at(0, 11), { attendees: [{ name: 'y', email: '' }] }),   // overlapping meetings: union 9-11
    oc(calA, at(0, 13), at(0, 15), { categories: ['Deep work', 'Admin'] }), oc(calB, at(1, 18), at(1, 19)), oc(calA, at(2, 10), at(2, 12), { x: [{ n: 'X-ZENG-FOCUS', p: [], v: '1' }], categories: ['Focus'] }),
    oc(calA, at(3, 8), at(3, 9, 30), { avail: 'free' }), Object.assign(oc(calA, at(4, 0), at(5, 0)), { allDay: true }), oc(calA, at(4, 23), at(5, 2)) ];
  const r = BAL.compute(occs, at(0, 0), at(7, 0), { workStart: 540, workEnd: 1020, workDays: [1, 2, 3, 4, 5] });
  eq(r.days.length, 7, 'seven day rows'); eq(r.days.map((d) => d.work), [true, true, true, true, true, false, false], 'work days flagged');
  eq(r.byCal.map((c) => [c.name, c.ms / H1]), [['Work', 1 + 1.5 + 2 + 2 + 1.5 + 3], ['Home', 1]].map(([n, h]) => [n, h]), 'time by calendar (raw durations, all-day ignored, free events counted, midnight clip)');
  eq(r.totalMs / H1, 12, 'total hours = sum of timed durations clipped to range'); eq(Math.round(r.byCat.find((c) => c.name === 'Deep work').ms / H1 * 100) / 100, 1, 'multi-category split evenly'); eq(r.byCat.find((c) => c.name === 'Uncategorized').ms / H1 > 0, true, 'uncategorized bucket');
  eq(r.meetingMs / H1, 2, 'meeting load unions overlapping meetings (9-11 = 2h)'); eq(Math.round(r.load * 1000) / 1000, Math.round(2 / 40 * 1000) / 1000, 'load = meeting hours / working hours (40h)'); eq(r.workMs / H1, 40, 'work capacity 5 x 8h');
  eq(r.focusMs / H1, 2, 'focus time counted'); eq(r.days[0].busyMs / H1, 4, 'Monday busy within work hours (9-11, 13-15)'); eq(r.days[0].free.map((f) => [new Date(f[0]).getHours(), new Date(f[1]).getHours()]), [[11, 13], [15, 17]], 'free windows Monday'); eq(r.days[0].longest.map((x) => new Date(x).getHours()), [11, 13], 'longest free window (first of equals)');
  eq(r.days[3].busyMs, 0, 'free-marked and out-of-hours events do not make you busy'); eq(r.days[4].busyMs / H1, 0, 'Friday 23:00 event outside work hours'); eq(r.days[5].busy.length > 0, true, 'Saturday busy interval from spill-over event');
  eq(r.freeMs / H1, 40 - 4 - 2, 'free hours across week = capacity - busy (Mon 4h + Wed focus 2h)'); eq(BAL.meterLevel(0.1), 'light', 'meter light'); eq(BAL.meterLevel(0.3), 'moderate', 'meter moderate'); eq(BAL.meterLevel(0.55), 'heavy', 'meter heavy'); eq(BAL.meterLevel(0.9), 'overloaded', 'meter overloaded');
  eq(BAL.isFocus(occs[4].ev), true, 'focus marker recognised'); eq(BAL.isFocus(occs[0].ev), false, 'normal event not focus');
  eq(BAL.union([[5, 9], [1, 3], [2, 4], [9, 10]]), [[1, 4], [5, 10]], 'union merges touching/overlapping'); eq(BAL.subtract([0, 10], [[2, 3], [5, 7], [9, 12]]), [[0, 2], [3, 5], [7, 9]], 'subtract'); eq(BAL.intersect([[0, 5], [8, 12]], [[3, 9]]), [[3, 5], [8, 9]], 'intersect');
  eq(BAL.freeWindows(0, 100, [[10, 20], [95, 100]], 30), [[20, 95]], 'min length filters short gaps'); eq(BAL.freeWindows(0, 100, [[0, 100]], 1), [], 'fully booked -> none');
  const g1 = BAL.goal(5 * H1, 10, 7); eq([g1.pct, g1.met, g1.target / H1], [0.5, false, 10], 'goal 5/10h'); const g2 = BAL.goal(12 * H1, 10, 7); eq([g2.pct, g2.met], [1, true], 'goal met caps at 100%'); eq(BAL.goal(10 * H1, 10, 28).target / H1, 40, 'goal scales with period length'); eq(BAL.goal(0, 0, 7).pct, 0, 'no goal -> 0');
  // DST week still yields 7 day rows and sane capacity
  const dst = BAL.compute([], new Date(2026, 10, 1).getTime() - 7 * 86400000, new Date(2026, 10, 1).getTime() + 7 * 86400000, { workStart: 540, workEnd: 1020 }); eq([dst.days.length, dst.workMs / H1], [14, 80], 'DST period: 14 days, 80 work hours');
  // free time vs suggest-time helper agree on the same busy set
  const wins = FR.windows(occs.filter((o) => (I.F(o, 'avail') || 'busy') !== 'free').map((o) => [o.s, o.e]), at(0, 0), at(1, 0), 3600000, { days: [1] }); eq(wins.map((w) => [new Date(w.s).getHours(), new Date(w.e).getHours()]), r.days[0].free.map((f) => [new Date(f[0]).getHours(), new Date(f[1]).getHours()]), 'Time Balance free windows == Find Free Time windows'); }

// ------------------------------------------------------------------ summary
console.log(`\n${pass} assertions passed, ${fail} failed`);
if (fail) { for (const f of failures) console.log('FAIL ' + f); process.exit(1); }
