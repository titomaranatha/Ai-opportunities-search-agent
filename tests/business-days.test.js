'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { addBusinessDays, businessDaysBetween, nextFollowUpDate, projectFollowUpSchedule } = require('../src/lib/business-days');

test('adds business days skipping weekends', () => {
  assert.equal(addBusinessDays('2026-12-01', 5), '2026-12-08'); // Tue -> next Tue
  assert.equal(addBusinessDays('2026-11-27', 1), '2026-11-30'); // Fri -> Mon
});

test('skips supplied holidays', () => {
  assert.equal(addBusinessDays('2026-12-24', 1, ['2026-12-25']), '2026-12-28');
});

test('zero days returns the same date', () => {
  assert.equal(addBusinessDays('2026-12-01', 0), '2026-12-01');
});

test('rejects invalid input', () => {
  assert.throws(() => addBusinessDays('not-a-date', 1), TypeError);
  assert.throws(() => addBusinessDays('2026-12-01', -1), RangeError);
});

test('follow-up schedule is 5, 10 and 15 business days, each after the previous message', () => {
  const s = projectFollowUpSchedule('2026-12-01');
  assert.deepEqual(s.map((x) => x.stage), ['first', 'second', 'final']);
  assert.equal(s[0].dueDate, '2026-12-08');
  assert.equal(s[1].dueDate, addBusinessDays('2026-12-08', 10));
  assert.equal(s[2].dueDate, addBusinessDays(s[1].dueDate, 15));
});

test('later stages anchor on the actual send date', () => {
  assert.equal(nextFollowUpDate('second', '2026-12-10'), addBusinessDays('2026-12-10', 10));
  assert.throws(() => nextFollowUpDate('fourth', '2026-12-10'), RangeError);
});

test('businessDaysBetween counts signed weekdays', () => {
  assert.equal(businessDaysBetween('2026-12-01', '2026-12-08'), 5);
  assert.equal(businessDaysBetween('2026-12-08', '2026-12-01'), -5);
});
