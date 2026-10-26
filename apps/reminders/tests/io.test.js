const test = require('node:test');
const assert = require('node:assert');
const IO = require('../ui/io.js');
const R = require('../ui/recur.js');
const NOW = new Date(2026, 9, 26, 10, 0);
const lists = [{ id: 'L1', name: 'Home', color: '#32ade6' }, { id: 'L2', name: 'Work, Inc', color: '#ff9500' }];
const base = { notes: '', url: '', due: null, time: null, repeat: null, early: null, priority: 0, flag: false, tags: [], done: false, doneAt: null, created: 1700000000000, order: 1, parent: null };
const reminders = [
  { ...base, id: 'a1', list: 'L1', title: 'Pay rent; "monthly", ok', notes: 'line one\nline two, with comma;', due: '2026-11-01', time: '09:00', repeat: { freq: 'monthly', interval: 1, bymonthday: [1] }, priority: 3, flag: true, tags: ['home', 'money'], early: 60, url: 'https://example.com/a?b=1' },
  { ...base, id: 'a2', list: 'L1', title: 'Sub task', parent: 'a1', done: true, doneAt: 1730000000000 },
  { ...base, id: 'a3', list: 'L2', title: 'Standup — café ☕ ' + 'x'.repeat(90), due: '2026-10-27', repeat: { freq: 'weekly', interval: 2, byday: ['MO', 'WE'], until: '2027-01-31' }, priority: 1 },
  { ...base, id: 'a4', list: 'L2', title: 'Last Friday', due: '2026-10-30', time: '17:30', repeat: { freq: 'monthly', interval: 1, byday: ['-1FR'], count: 4 }, early: 1440, priority: 2 },
];
const strip = (it) => ({ title: it.title, notes: it.notes, url: it.url, due: it.due, time: it.time, repeat: it.repeat, early: it.early, priority: it.priority, flag: it.flag, tags: it.tags, done: it.done });
const orig = reminders.map(strip);

test('ICS export is well-formed and round-trips', () => {
  const ics = IO.toICS({ lists, reminders });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.strictEqual((ics.match(/BEGIN:VTODO/g) || []).length, 4);
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=1/); assert.match(ics, /PRIORITY:1/); assert.match(ics, /STATUS:COMPLETED/);
  assert.match(ics, /RELATED-TO;RELTYPE=PARENT:a1@zengreminders/); assert.match(ics, /BEGIN:VALARM/); assert.match(ics, /TRIGGER;RELATED=END:-PT1H/); assert.match(ics, /TRIGGER;RELATED=END:-P1D/);
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, 'folded line too long: ' + l);
  const back = IO.fromICS(ics);
  assert.strictEqual(back.items.length, 4);
  assert.deepStrictEqual(back.items.map(strip), orig);
  assert.strictEqual(back.items[1].parentUid, 'a1@zengreminders'); assert.strictEqual(back.items[0].uid, 'a1@zengreminders');
  assert.deepStrictEqual(back.items.map((i) => i.listName), ['Home', 'Home', 'Work, Inc', 'Work, Inc']);
  assert.strictEqual(back.colors['Home'], '#32ade6');
});
test('ICS import: Apple-style export (UTC due, TZID, VALUE=DATE, alarms, priority)', () => {
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Groceries', 'X-APPLE-CALENDAR-COLOR:#1BADF8FF', 'BEGIN:VTODO', 'UID:ABC', 'SUMMARY:Milk', 'DESCRIPTION:2% fat\\, organic', 'DUE;TZID=Europe/Berlin:20261105T083000', 'PRIORITY:5', 'STATUS:NEEDS-ACTION', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VTODO',
    'BEGIN:VTODO', 'UID:DEF', 'SUMMARY:Bread', 'DUE;VALUE=DATE:20261106', 'PERCENT-COMPLETE:100', 'COMPLETED:20261101T100000Z', 'RELATED-TO:ABC', 'PRIORITY:9', 'CATEGORIES:food,Bulk Buy', 'END:VTODO',
    'BEGIN:VEVENT', 'SUMMARY:ignore me', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const { items, colors } = IO.fromICS(ics);
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual({ t: items[0].title, n: items[0].notes, d: items[0].due, tm: items[0].time, p: items[0].priority, e: items[0].early, l: items[0].listName }, { t: 'Milk', n: '2% fat, organic', d: '2026-11-05', tm: '08:30', p: 2, e: 15, l: 'Groceries' });
  assert.deepStrictEqual(items[0].repeat, { freq: 'weekly', interval: 1, byday: ['TU', 'TH'], count: 10 });
  assert.strictEqual(items[1].done, true); assert.strictEqual(items[1].parentUid, 'ABC'); assert.strictEqual(items[1].priority, 1); assert.deepStrictEqual(items[1].tags, ['food', 'bulk-buy']); assert.strictEqual(items[1].time, null);
  assert.strictEqual(colors.Groceries, '#1BADF8');
});
test('ICS import rejects non-calendar files; handles folded lines and absolute alarms', () => {
  assert.throws(() => IO.fromICS('hello world'));
  const { items } = IO.fromICS('BEGIN:VCALENDAR\nBEGIN:VTODO\nSUMMARY:Long \n title here\nDUE:20261105T100000\nBEGIN:VALARM\nTRIGGER;VALUE=DATE-TIME:20261105T090000\nEND:VALARM\nEND:VTODO\nEND:VCALENDAR');
  assert.strictEqual(items[0].title, 'Long title here'); assert.strictEqual(items[0].early, 60);
});
test('RRULE parsing: BYSETPOS and unsupported frequencies', () => {
  assert.deepStrictEqual(IO.parseRRule('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1'), { freq: 'monthly', interval: 1, byday: ['-1FR'] });
  assert.strictEqual(IO.parseRRule('FREQ=HOURLY'), null);
  assert.deepStrictEqual(IO.parseRRule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14;UNTIL=20300101'), { freq: 'yearly', interval: 1, bymonth: 3, bymonthday: [14], until: '2030-01-01' });
});
test('CSV export/import round trip incl. quotes, commas, newlines and parents', () => {
  const csv = IO.toCSV({ lists, reminders });
  const rows = IO.csvParse(csv); assert.strictEqual(rows.length, 5); assert.strictEqual(rows[1][2], 'Pay rent; "monthly", ok'); assert.strictEqual(rows[1][3], 'line one\nline two, with comma;');
  const { items } = IO.fromCSV(csv, { now: NOW });
  assert.deepStrictEqual(items.map(strip), orig); assert.strictEqual(items[1].parentUid, 'a1'); assert.strictEqual(items[0].listName, 'Home'); assert.strictEqual(items[2].listName, 'Work, Inc');
});
test('CSV import: CSV with TYPE/CONTENT columns (TYPE/CONTENT/INDENT/DATE)', () => {
  const csv = 'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\r\ntask,Plan trip,"Book, pay",1,1,,,every monday at 9am,en,\r\ntask,Book flights,,2,2,,,2026-12-01,en,\r\nsection,Ignored,,,,,,,,\r\ntask,Pack,,4,1,,,tomorrow,en,\r\n';
  const { items } = IO.fromCSV(csv, { now: NOW });
  assert.strictEqual(items.length, 3); assert.strictEqual(items[0].priority, 3); assert.strictEqual(items[0].notes, 'Book, pay'); assert.deepStrictEqual(items[0].repeat, { freq: 'weekly', interval: 1, byday: ['MO'] }); assert.strictEqual(items[0].time, '09:00');
  assert.strictEqual(items[1].parentUid, items[0].uid); assert.strictEqual(items[1].due, '2026-12-01'); assert.strictEqual(items[1].priority, 2);
  assert.strictEqual(items[2].parentUid, null); assert.strictEqual(items[2].due, '2026-10-27'); assert.strictEqual(items[2].priority, 0);
});
test('CSV import: Microsoft-style headers, semicolons, US dates, statuses', () => {
  const csv = 'Subject;Start Date;Due Date;Status;Priority;Notes;Categories\n"Send report";10/20/2026;10/30/2026;Not Started;High;"see\nattached";Work; Q4\nFile taxes;;11/15/2026;Completed;Normal;;\n';
  const { items } = IO.fromCSV(csv, { now: NOW });
  assert.strictEqual(items.length, 2); assert.strictEqual(items[0].due, '2026-10-30'); assert.strictEqual(items[0].priority, 3); assert.strictEqual(items[0].notes, 'see\nattached'); assert.strictEqual(items[0].done, false);
  assert.strictEqual(items[1].done, true); assert.strictEqual(items[1].priority, 0); assert.strictEqual(items[1].due, '2026-11-15');
  assert.throws(() => IO.fromCSV('foo,bar\n1,2'));
});
test('Markdown export/import round trip', () => {
  const md = IO.toMarkdown({ lists, reminders });
  assert.match(md, /^# Home\n\n- \[ \] Pay rent/); assert.match(md, /  - \[x\] Sub task/); assert.match(md, /  > line one/);
  const { items } = IO.fromMarkdown(md, { now: NOW });
  assert.strictEqual(items.length, 4);
  const a = items[0]; assert.deepStrictEqual({ d: a.due, t: a.time, r: a.repeat, p: a.priority, f: a.flag, tags: a.tags, e: a.early, n: a.notes }, { d: '2026-11-01', t: '09:00', r: { freq: 'monthly', interval: 1, bymonthday: [1] }, p: 3, f: true, tags: ['home', 'money'], e: 60, n: 'line one\nline two, with comma;' });
  assert.strictEqual(items[1].parentUid, a.uid); assert.strictEqual(items[1].done, true); assert.strictEqual(items[2].listName, 'Work, Inc');
  assert.deepStrictEqual(items[2].repeat, reminders[2].repeat); assert.deepStrictEqual(items[3].repeat, reminders[3].repeat); assert.strictEqual(items[3].early, 1440);
});
test('Markdown import: plain bullets, numbered lists and no heading', () => {
  const { items } = IO.fromMarkdown('- milk\n- [x] eggs tomorrow\n1. bread\n\t- [ ] sub', { now: NOW, defaultList: 'Inbox' });
  assert.deepStrictEqual(items.map((i) => [i.title, i.listName, i.done]), [['milk', 'Inbox', false], ['eggs', 'Inbox', true], ['bread', 'Inbox', false], ['sub', 'Inbox', false]]);
  assert.strictEqual(items[1].due, '2026-10-27'); assert.strictEqual(items[3].parentUid, items[2].uid);
});
test('repeatPhrase re-parses to the same rule', () => {
  const P = require('../ui/parser.js');
  const rules = [{ freq: 'daily', interval: 3 }, { freq: 'weekly', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }, { freq: 'weekly', interval: 2, byday: ['TU'] }, { freq: 'monthly', interval: 1, bymonthday: [1, 15] }, { freq: 'monthly', interval: 1, bymonthday: [-1] }, { freq: 'monthly', interval: 1, byday: ['2TU'] }, { freq: 'yearly', interval: 1, bymonth: 3, bymonthday: [14] }, { freq: 'monthly', interval: 2, bymonthday: [5], until: '2027-05-01' }, { freq: 'weekly', interval: 1, count: 5 }];
  for (const r of rules) { const got = P.parse('x ' + IO.repeatPhrase(r), { now: NOW }).repeat; assert.deepStrictEqual(got, R.norm(r), IO.repeatPhrase(r)); }
});
