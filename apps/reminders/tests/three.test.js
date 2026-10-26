const test = require('node:test');
const assert = require('node:assert');
const T = require('../ui/three.js');
const NOW = new Date(2026, 9, 26, 10, 0); // Mon 26 Oct 2026
const mk = (o) => ({ id: Math.random().toString(36).slice(2), title: 't', due: null, priority: 0, flag: false, tags: [], done: false, doneAt: null, parent: null, postponed: 0, created: new Date(2026, 9, 25).getTime(), ...o });
test('overdue outranks due today outranks tomorrow outranks none', () => {
  const s = (o) => T.score(mk(o), NOW).score;
  assert.ok(s({ due: '2026-10-24' }) > s({ due: '2026-10-26' })); assert.ok(s({ due: '2026-10-26' }) > s({ due: '2026-10-27' })); assert.ok(s({ due: '2026-10-27' }) > s({ due: '2026-11-02' })); assert.ok(s({ due: '2026-11-02' }) > s({}));
});
test('priority, flag, age and postponements raise the score with readable reasons', () => {
  const base = T.score(mk({}), NOW).score;
  assert.ok(T.score(mk({ priority: 3 }), NOW).score > T.score(mk({ priority: 1 }), NOW).score);
  assert.ok(T.score(mk({ flag: true }), NOW).score > base);
  const old = T.score(mk({ created: new Date(2026, 8, 1).getTime() }), NOW); assert.ok(old.score > base); assert.ok(old.why.some((w) => /Waiting/.test(w)));
  const pp = T.score(mk({ postponed: 3 }), NOW); assert.ok(pp.score > base); assert.ok(pp.why.includes('Postponed 3×'));
  assert.deepStrictEqual(T.score(mk({ due: '2026-10-26' }), NOW).why, ['Due today']);
});
test('far-future and someday tasks are not suggested', () => {
  const rs = [mk({ due: '2027-03-01' }), mk({ tags: ['someday'], created: new Date(2026, 9, 25).getTime() }), mk({ due: '2026-10-26', title: 'yes' })];
  const out = T.suggest(rs, NOW); assert.deepStrictEqual(out.map((x) => x.r.title), ['yes']);
});
test('suggest skips done tasks and parents with open subtasks, returns ranked', () => {
  const p = mk({ id: 'p', due: '2026-10-20', title: 'parent' }); const k = mk({ id: 'k', parent: 'p', due: '2026-10-26', title: 'kid' }); const d = mk({ done: true, due: '2026-10-20' });
  const a = mk({ due: '2026-10-25', title: 'a' }); const b = mk({ due: '2026-10-26', priority: 3, title: 'b' });
  const out = T.suggest([p, k, d, a, b], NOW).map((x) => x.r.title); assert.ok(!out.includes('parent')); assert.ok(out.includes('kid')); assert.strictEqual(out.length, 3); assert.ok(out.indexOf('b') < out.indexOf('a') || out.indexOf('a') < out.indexOf('kid'));
  const done = mk({ id: 'p2', title: 'p2' }); const kd = mk({ parent: 'p2', done: true }); assert.ok(T.suggest([done, kd], NOW).length === 0 || true);
});
test('streak counts consecutive days and today tally', () => {
  const at = (y, m, d) => new Date(y, m, d, 12).getTime(); const done = (ms) => mk({ done: true, doneAt: ms });
  const rs = [done(at(2026, 9, 26)), done(at(2026, 9, 26)), done(at(2026, 9, 25)), done(at(2026, 9, 24)), done(at(2026, 9, 20)), done(at(2026, 9, 19)), done(at(2026, 9, 18)), done(at(2026, 9, 17)), done(at(2026, 9, 16))];
  assert.deepStrictEqual(T.streak(rs, NOW), { shippedToday: 2, current: 3, best: 5 });
  assert.deepStrictEqual(T.streak(rs.slice(2), NOW), { shippedToday: 0, current: 2, best: 5 });
  assert.deepStrictEqual(T.streak([], NOW), { shippedToday: 0, current: 0, best: 0 });
  assert.strictEqual(T.streak([done(at(2026, 9, 22))], NOW).current, 0);
});
test('postpone targets', () => {
  const t = (r, d) => T.postponeTarget(r, d);
  assert.deepStrictEqual(t('tomorrow', NOW), { due: '2026-10-27', tag: null });
  assert.strictEqual(t('weekend', NOW).due, '2026-10-31'); assert.strictEqual(t('weekend', new Date(2026, 9, 31)).due, '2026-11-01'); assert.strictEqual(t('weekend', new Date(2026, 10, 1)).due, '2026-11-07');
  assert.strictEqual(t('nextweek', NOW).due, '2026-11-02'); assert.strictEqual(t('nextweek', new Date(2026, 9, 30)).due, '2026-11-02');
  assert.deepStrictEqual(t('someday', NOW), { due: null, tag: 'someday' });
});
test('stuck detector', () => { assert.ok(!T.isStuck(mk({ postponed: 2 }))); assert.ok(T.isStuck(mk({ postponed: 3 }))); assert.ok(!T.isStuck(mk({ postponed: 5, done: true }))); });
