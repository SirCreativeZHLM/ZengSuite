const test = require('node:test');
const assert = require('node:assert');
const R = require('../ui/recur.js');
test('daily/weekly/monthly/yearly stepping', () => {
  assert.strictEqual(R.next({ freq: 'daily', interval: 2 }, '2026-12-31'), '2027-01-02');
  assert.strictEqual(R.next({ freq: 'weekly', interval: 1 }, '2026-10-26'), '2026-11-02');
  assert.strictEqual(R.next({ freq: 'monthly', interval: 1, bymonthday: [31] }, '2026-01-31'), '2026-02-28');
  assert.strictEqual(R.next({ freq: 'monthly', interval: 1, bymonthday: [31] }, '2026-02-28'), '2026-03-31');
  assert.strictEqual(R.next({ freq: 'yearly', interval: 1 }, '2028-02-29'), '2029-02-28');
});
test('weekly with byday and interval', () => {
  assert.deepStrictEqual(R.occurrences({ freq: 'weekly', interval: 2, byday: ['MO', 'FR'] }, '2026-10-26', 5), ['2026-10-26', '2026-10-30', '2026-11-09', '2026-11-13', '2026-11-23']);
  assert.strictEqual(R.next({ freq: 'weekly', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }, '2026-10-30'), '2026-11-02');
});
test('nth weekday of month and last day', () => {
  assert.deepStrictEqual(R.occurrences({ freq: 'monthly', interval: 1, byday: ['-1FR'] }, '2026-10-30', 3), ['2026-10-30', '2026-11-27', '2026-12-25']);
  assert.deepStrictEqual(R.occurrences({ freq: 'monthly', interval: 1, byday: ['2TU'] }, '2026-10-13', 3), ['2026-10-13', '2026-11-10', '2026-12-08']);
  assert.deepStrictEqual(R.occurrences({ freq: 'monthly', interval: 1, bymonthday: [-1] }, '2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
test('until / notBefore / firstOn', () => {
  assert.strictEqual(R.next({ freq: 'daily', interval: 1, until: '2026-11-01' }, '2026-11-01'), null);
  assert.strictEqual(R.next({ freq: 'daily', interval: 1 }, '2026-10-01', '2026-10-26'), '2026-10-26');
  assert.strictEqual(R.firstOn({ freq: 'weekly', interval: 1, byday: ['TU'] }, '2026-10-26'), '2026-10-27');
  assert.strictEqual(R.firstOn({ freq: 'monthly', interval: 1, bymonthday: [26] }, '2026-10-26'), '2026-10-26');
});
test('labels and presets', () => {
  assert.strictEqual(R.label({ freq: 'weekly', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }), 'Weekdays');
  assert.strictEqual(R.label({ freq: 'weekly', interval: 2 }), 'Every 2 weeks');
  assert.strictEqual(R.presetOf({ freq: 'weekly', interval: 2, until: '2027-01-01' }), 'biweekly');
  assert.strictEqual(R.presetOf({ freq: 'weekly', interval: 1, byday: ['MO'] }), 'custom');
  assert.strictEqual(R.presetOf(null), 'none');
});
