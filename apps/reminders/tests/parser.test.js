// Run: node --test apps/reminders/tests/
const test = require('node:test');
const assert = require('node:assert');
const { parse } = require('../ui/parser.js');
// Reference "now": Monday 26 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 26, 10, 0, 0);
const LISTS = ['Work', 'Home', 'Side Projects', 'Groceries'];
const P = (t, o = {}) => parse(t, { now: NOW, lists: LISTS, ...o });
const sub = (got, want, path = '') => {
  for (const k of Object.keys(want)) {
    const w = want[k], g = got[k];
    if (w && typeof w === 'object' && !Array.isArray(w)) sub(g || {}, w, path + k + '.');
    else assert.deepStrictEqual(g, w, `${path}${k}`);
  }
};
const C = (input, want, opts) => test(JSON.stringify(input), () => sub(P(input, opts), want));

// ---- plain titles stay untouched ----
C('Buy milk', { title: 'Buy milk', due: null, time: null, repeat: null, priority: 0, tags: [], list: null });
C('Read chapter 5', { title: 'Read chapter 5', due: null });
C('Pick up sun cream', { title: 'Pick up sun cream', due: null });
C('Hello!', { title: 'Hello!', priority: 0 });
C('Call 555-1234', { title: 'Call 555-1234', due: null });
C('Issue #12 review', { title: 'Issue #12 review', tags: [] });
C('Morning run', { title: 'Morning run', time: null });
C('Look at 3.5 options', { title: 'Look at 3.5 options', due: null });
C('Email a@b.com', { title: 'Email a@b.com', list: null });
C('', { title: '', due: null });

// ---- priority ----
C('Fix bug !', { title: 'Fix bug', priority: 1 });
C('Fix bug !!', { title: 'Fix bug', priority: 2 });
C('Fix bug !!!', { title: 'Fix bug', priority: 3 });
C('!!! Fix bug', { title: 'Fix bug', priority: 3 });
C('Fix !!! the bug', { title: 'Fix the bug', priority: 3 });
C('Fix bug !high', { title: 'Fix bug', priority: 3 });
C('Fix bug !medium', { title: 'Fix bug', priority: 2 });
C('Fix bug !low', { title: 'Fix bug', priority: 1 });
C('Fix bug priority high', { title: 'Fix bug', priority: 3 });
C('Fix bug !!!!', { priority: 0 });

// ---- tags ----
C('Buy milk #groceries', { title: 'Buy milk', tags: ['groceries'] });
C('#home Clean #chores', { title: 'Clean', tags: ['home', 'chores'] });
C('Task #Work-Stuff', { tags: ['work-stuff'] });
C('Task #a #a', { tags: ['a'] });
C('Task #über', { tags: ['über'], title: 'Task' });

// ---- flag ----
C('Call bank 🚩', { title: 'Call bank', flag: true });
C('Call bank !flag', { title: 'Call bank', flag: true });

// ---- simple dates ----
C('Call mom today', { title: 'Call mom', due: '2026-10-26', time: null });
C('Call mom tomorrow', { title: 'Call mom', due: '2026-10-27' });
C('Call mom tmr', { title: 'Call mom', due: '2026-10-27' });
C('Call mom tmrw', { due: '2026-10-27' });
C('Call mom yesterday', { due: '2026-10-25' });
C('Call mom day after tomorrow', { title: 'Call mom', due: '2026-10-28' });
C('tomorrow call mom', { title: 'call mom', due: '2026-10-27' });
C('Call mom due tomorrow', { title: 'Call mom', due: '2026-10-27' });
C('Call mom by tomorrow', { title: 'Call mom', due: '2026-10-27' });
C('Call mom on friday', { title: 'Call mom', due: '2026-10-30' });
C('Call mom friday', { due: '2026-10-30' });
C('Call mom monday', { due: '2026-11-02' });
C('Call mom this monday', { due: '2026-10-26' });
C('Call mom next monday', { due: '2026-11-02' });
C('Call mom next friday', { due: '2026-11-06' });
C('Call mom this friday', { due: '2026-10-30' });
C('Call mom on sat', { due: '2026-10-31' });
C('Call mom next wed', { due: '2026-11-04' });
C('Call mom by thu', { due: '2026-10-29' });
C('Call mom sunday', { due: '2026-11-01' });
C('next week review', { title: 'review', due: '2026-11-02' });
C('review next month', { title: 'review', due: '2026-11-01' });
C('review next year', { due: '2027-01-01' });
C('trip this weekend', { title: 'trip', due: '2026-10-31' });
C('trip next weekend', { due: '2026-11-07' });
C('report end of month', { title: 'report', due: '2026-10-31' });
C('report eom', { due: '2026-10-31' });
C('report end of week', { due: '2026-10-30' });
C('report end of year', { due: '2026-12-31' });
C('Finish eod', { title: 'Finish', due: '2026-10-26', time: '17:00' });
C('Pick up sun cream sat', { title: 'Pick up sun cream sat', due: null });

// ---- in N units ----
C('Check in 3 days', { title: 'Check', due: '2026-10-29' });
C('Check in 1 week', { due: '2026-11-02' });
C('Check in 2 weeks', { due: '2026-11-09' });
C('Check in a week', { due: '2026-11-02' });
C('Check in two days', { due: '2026-10-28' });
C('Check in 1 month', { due: '2026-11-26' });
C('Check in 1 year', { due: '2027-10-26' });
C('Check 3 days from now', { due: '2026-10-29', title: 'Check' });
C('Check in 2 hours', { title: 'Check', due: '2026-10-26', time: '12:00' });
C('Check in 90 minutes', { due: '2026-10-26', time: '11:30' });
C('Check in 30 min', { due: '2026-10-26', time: '10:30' });
C('Check in half an hour', { due: '2026-10-26', time: '10:30' });
C('Check in an hour', { due: '2026-10-26', time: '11:00' });
C('Check in 15 hours', { due: '2026-10-27', time: '01:00' });

// ---- explicit dates ----
C('Party oct 30', { title: 'Party', due: '2026-10-30' });
C('Party October 30th', { title: 'Party', due: '2026-10-30' });
C('Party on oct. 30', { due: '2026-10-30' });
C('Party 30 oct', { due: '2026-10-30' });
C('Party 30th of october', { title: 'Party', due: '2026-10-30' });
C('Party jan 5', { due: '2027-01-05' });
C('Party jan 5 2028', { due: '2028-01-05' });
C('Party jan 5, 2028', { due: '2028-01-05', title: 'Party' });
C('Party oct 20', { due: '2027-10-20' });
C('Party oct 26', { due: '2026-10-26' });
C('Party 2026-12-25', { due: '2026-12-25', title: 'Party' });
C('Party 2026/12/25', { due: '2026-12-25' });
C('Party 12/25', { due: '2026-12-25' });
C('Party 12/25/2026', { due: '2026-12-25' });
C('Party 12/25/27', { due: '2027-12-25' });
C('Party 25/12/2026', { due: '2026-12-25' });
C('Party 25.12.2026', { due: '2026-12-25' });
C('Party on the 28th', { title: 'Party', due: '2026-10-28' });
C('Party the 5th', { due: '2026-11-05' });
C('Party by the 26th', { due: '2026-10-26' });
C('Party feb 30', { due: null });
C('Party sept 9', { due: '2027-09-09' });
C('Party dec 25 at noon', { due: '2026-12-25', time: '12:00', title: 'Party' });

// ---- times ----
C('Gym at 6pm', { title: 'Gym', due: '2026-10-26', time: '18:00' });
C('Gym 6pm', { time: '18:00' });
C('Gym 6 pm', { time: '18:00' });
C('Gym at 6:30pm', { time: '18:30', due: '2026-10-26' });
C('Gym at 6:30 am', { time: '06:30', due: '2026-10-27' });
C('Gym 6.30pm', { time: '18:30' });
C('Gym at 18:00', { time: '18:00', title: 'Gym' });
C('Gym 18:45', { time: '18:45' });
C('Gym at 12am', { time: '00:00' });
C('Gym at 12pm', { time: '12:00' });
C('Gym at noon', { time: '12:00', due: '2026-10-26' });
C('Gym at midnight', { time: '00:00', due: '2026-10-27' });
C('Gym at 7', { time: '07:00' });
C('Gym at 5', { time: '17:00' });
C('Gym at 5 o\'clock', { time: '17:00' });
C('Gym 9 o\'clock', { time: '09:00' });
C('Gym at 09:00', { time: '09:00' });
C('Gym at 9:00', { time: '09:00' });
C('Gym at 5:30', { time: '17:30' });
C('Gym at 25', { time: null });
C('Gym at 13:75', { time: null });
C('Gym by 5pm', { time: '17:00', title: 'Gym' });
C('Gym at 9am today', { time: '09:00', due: '2026-10-26', title: 'Gym' });
C('Gym at 11am today', { time: '11:00', due: '2026-10-26' });
C('Gym tomorrow at 7am', { due: '2026-10-27', time: '07:00', title: 'Gym' });
C('Gym tomorrow 7:15pm', { due: '2026-10-27', time: '19:15' });
C('Gym friday at 5pm', { due: '2026-10-30', time: '17:00' });
C('Gym oct 30 9:30', { due: '2026-10-30', time: '09:30' });

// ---- time-of-day words ----
C('Gym tomorrow morning', { due: '2026-10-27', time: '09:00', title: 'Gym' });
C('Gym tomorrow afternoon', { due: '2026-10-27', time: '14:00' });
C('Gym tomorrow evening', { due: '2026-10-27', time: '18:00' });
C('Gym tomorrow night', { due: '2026-10-27', time: '21:00' });
C('Gym tonight', { due: '2026-10-26', time: '20:00', title: 'Gym' });
C('Gym this morning', { due: '2026-10-26', time: '09:00' });
C('Gym this evening', { due: '2026-10-26', time: '18:00' });
C('Gym friday morning', { due: '2026-10-30', time: '09:00' });
C('Gym tomorrow morning at 8', { due: '2026-10-27', time: '08:00', title: 'Gym' });
C('Gym in the evening', { time: '18:00', due: '2026-10-26' });

// ---- repeats ----
C('Pay rent every 1st at 9am !!! #home', { title: 'Pay rent', due: '2026-11-01', time: '09:00', repeat: { freq: 'monthly', interval: 1, bymonthday: [1] }, priority: 3, tags: ['home'] });
C('Water plants daily', { title: 'Water plants', repeat: { freq: 'daily', interval: 1 }, due: '2026-10-26' });
C('Water plants every day', { title: 'Water plants', repeat: { freq: 'daily', interval: 1 } });
C('Water plants everyday', { repeat: { freq: 'daily', interval: 1 } });
C('Water plants every day at 8am', { due: '2026-10-27', time: '08:00', repeat: { freq: 'daily' } });
C('Water plants every day at 11am', { due: '2026-10-26', time: '11:00' });
C('Water plants every 3 days', { repeat: { freq: 'daily', interval: 3 } });
C('Water plants every other day', { repeat: { freq: 'daily', interval: 2 } });
C('Water plants every weekday', { repeat: { freq: 'weekly', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }, due: '2026-10-26' });
C('Water plants weekdays', { repeat: { byday: ['MO', 'TU', 'WE', 'TH', 'FR'] } });
C('Water plants every weekend', { repeat: { freq: 'weekly', byday: ['SA', 'SU'] }, due: '2026-10-31' });
C('Water plants weekly', { repeat: { freq: 'weekly', interval: 1 } });
C('Water plants every week', { repeat: { freq: 'weekly', interval: 1 } });
C('Water plants biweekly', { repeat: { freq: 'weekly', interval: 2 } });
C('Water plants every other week', { repeat: { freq: 'weekly', interval: 2 } });
C('Water plants every 2 weeks', { repeat: { freq: 'weekly', interval: 2 } });
C('Water plants every two weeks', { repeat: { interval: 2 } });
C('Water plants fortnightly', { repeat: { freq: 'weekly', interval: 2 } });
C('Water plants monthly', { repeat: { freq: 'monthly', interval: 1 } });
C('Water plants every month', { repeat: { freq: 'monthly' } });
C('Water plants every 6 months', { repeat: { freq: 'monthly', interval: 6 } });
C('Water plants quarterly', { repeat: { freq: 'monthly', interval: 3 } });
C('Water plants yearly', { repeat: { freq: 'yearly' } });
C('Water plants annually', { repeat: { freq: 'yearly' } });
C('Water plants every year', { repeat: { freq: 'yearly' } });
C('Water plants every 2 years', { repeat: { freq: 'yearly', interval: 2 } });
C('Water plants every monday', { repeat: { freq: 'weekly', byday: ['MO'] }, due: '2026-10-26', title: 'Water plants' });
C('Water plants every tuesday', { repeat: { byday: ['TU'] }, due: '2026-10-27' });
C('Water plants every mon, wed and fri', { repeat: { byday: ['MO', 'WE', 'FR'] }, title: 'Water plants' });
C('Water plants every mon/wed/fri', { repeat: { byday: ['MO', 'WE', 'FR'] } });
C('Water plants every monday and thursday', { repeat: { byday: ['MO', 'TH'] } });
C('Water plants mondays', { repeat: { byday: ['MO'], freq: 'weekly' } });
C('Water plants every other monday', { repeat: { freq: 'weekly', interval: 2, byday: ['MO'] } });
C('Water plants every week on friday', { repeat: { freq: 'weekly', byday: ['FR'] }, due: '2026-10-30' });
C('Water plants every 15th', { repeat: { freq: 'monthly', bymonthday: [15] }, due: '2026-11-15' });
C('Water plants every 1st and 15th', { repeat: { bymonthday: [1, 15] }, due: '2026-11-01' });
C('Water plants every 26th', { due: '2026-10-26' });
C('Water plants every month on the 5th', { repeat: { freq: 'monthly', bymonthday: [5] }, due: '2026-11-05' });
C('Water plants every last day of the month', { repeat: { freq: 'monthly', bymonthday: [-1] }, due: '2026-10-31' });
C('Water plants every last friday', { repeat: { freq: 'monthly', byday: ['-1FR'] }, due: '2026-10-30' });
C('Water plants every first monday', { repeat: { freq: 'monthly', byday: ['1MO'] }, due: '2026-11-02' });
C('Water plants every 2nd tuesday of the month', { repeat: { byday: ['2TU'] }, due: '2026-11-10' });
C('Water plants every jan 5', { repeat: { freq: 'yearly', bymonth: 1, bymonthday: [5] }, due: '2027-01-05' });
C('Water plants every 25 dec', { repeat: { freq: 'yearly', bymonth: 12, bymonthday: [25] }, due: '2026-12-25' });
C('Water plants every weekday at 8:30am', { time: '08:30', repeat: { byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }, due: '2026-10-27' });
C('Water plants every day until dec 31', { repeat: { freq: 'daily', until: '2026-12-31' }, title: 'Water plants' });
C('Water plants every week until 2027-03-01', { repeat: { until: '2027-03-01' } });
C('Water plants every day for 3 weeks', { repeat: { freq: 'daily', until: '2026-11-15' }, title: 'Water plants' });
C('Water plants every day x5', { repeat: { count: 5 }, title: 'Water plants' });
C('Water plants every day for 10 times', { repeat: { count: 10 } });
C('Water plants every day 7 times', { repeat: { count: 7 } });
C('Weekly team sync', { title: 'team sync', repeat: { freq: 'weekly' } });
C('Water plants starting tomorrow every day', { due: '2026-10-27', repeat: { freq: 'daily' } });

// ---- early reminders ----
C('Flight friday 9am remind me 1 hour before', { early: 60, due: '2026-10-30', time: '09:00', title: 'Flight' });
C('Flight friday 9am remind me 30 minutes before', { early: 30 });
C('Flight friday 9am remind me 1 day before', { early: 1440 });
C('Flight friday 9am alert 2 days before', { early: 2880 });
C('Flight friday 9am 15 min before', { early: 15, title: 'Flight' });
C('Flight friday 9am 2h before', { early: 120 });

// ---- lists ----
C('Report in Work', { title: 'Report', list: 'Work' });
C('Report in work', { list: 'Work' });
C('Report in list Work', { list: 'Work', title: 'Report' });
C('Report @Home', { list: 'Home', title: 'Report' });
C('Report in Side Projects', { list: 'Side Projects', title: 'Report' });
C('Report in Nowhere', { list: null, title: 'Report in Nowhere' });
C('in Work Report tomorrow', { list: 'Work', title: 'Report', due: '2026-10-27' });
C('Report in Groceries !! #food', { list: 'Groceries', priority: 2, tags: ['food'], title: 'Report' });
C('Report in Work', { list: null, title: 'Report in Work' }, { lists: [] });

// ---- combos ----
C('Submit taxes oct 30 5pm !!! #money in Home', { title: 'Submit taxes', due: '2026-10-30', time: '17:00', priority: 3, tags: ['money'], list: 'Home' });
C('Dentist next tuesday at 2:30pm 🚩', { title: 'Dentist', due: '2026-11-03', time: '14:30', flag: true });
C('Call mom, tomorrow', { title: 'Call mom', due: '2026-10-27' });
C('Call mom - tomorrow at 5', { title: 'Call mom', due: '2026-10-27', time: '17:00' });
C('Take out trash every tuesday and friday at 7pm', { title: 'Take out trash', time: '19:00', repeat: { byday: ['TU', 'FR'] }, due: '2026-10-27' });

// ---- tokens ----
test('tokens expose ranges and types for highlighting', () => {
  const t = 'Pay rent every 1st at 9am !!! #home';
  const r = P(t);
  const kinds = r.tokens.map((k) => k.type);
  assert.deepStrictEqual(kinds.sort(), ['priority', 'repeat', 'tag', 'time']);
  for (const k of r.tokens) assert.strictEqual(t.slice(k.start, k.end), k.text);
  assert.strictEqual(r.tokens.find((k) => k.type === 'repeat').text, 'every 1st');
  assert.strictEqual(r.tokens.find((k) => k.type === 'time').text, 'at 9am');
});
test('tokens never overlap', () => {
  const r = P('Gym tomorrow morning at 8 every week until dec 31 !! #fit in Work remind me 5 minutes before');
  const s = [...r.tokens].sort((a, b) => a.start - b.start);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].start >= s[i - 1].end);
});
test('weekStart changes "next week"', () => {
  assert.strictEqual(P('x next week', { weekStart: 0 }).due, '2026-11-01');
  assert.strictEqual(P('x next week', { weekStart: 1 }).due, '2026-11-02');
});
test('parser is pure with respect to now', () => {
  assert.strictEqual(P('x tomorrow', { now: new Date(2028, 1, 28, 8, 0) }).due, '2028-02-29');
  assert.strictEqual(P('x in 1 month', { now: new Date(2026, 0, 31, 8, 0) }).due, '2026-02-28');
  assert.strictEqual(P('x at 9am', { now: new Date(2026, 11, 31, 10, 0) }).due, '2027-01-01');
});
