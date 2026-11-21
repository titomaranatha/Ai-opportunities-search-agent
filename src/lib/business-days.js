'use strict';
/**
 * Business-day arithmetic used by the follow-up workflow (WF-08).
 * All dates are handled as UTC calendar dates (YYYY-MM-DD) to avoid DST/timezone drift.
 * Weekends are skipped; optional holidays (ISO date strings) are skipped as well.
 */
const DAY_MS = 86400000;

function toUTCDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const iso = (d) => d.toISOString().slice(0, 10);

function isBusinessDay(date, holidays = new Set()) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(iso(date));
}

/** Returns the ISO date that is `n` business days after `start`. */
function addBusinessDays(start, n, holidays = []) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
  const skip = new Set(holidays);
  let current = toUTCDate(start);
  let remaining = n;
  while (remaining > 0) {
    current = new Date(current.getTime() + DAY_MS);
    if (isBusinessDay(current, skip)) remaining -= 1;
  }
  return iso(current);
}

/** Signed number of business days from `from` to `to` (exclusive of start, inclusive of end). */
function businessDaysBetween(from, to, holidays = []) {
  const skip = new Set(holidays);
  let current = toUTCDate(from);
  const end = toUTCDate(to);
  let count = 0;
  const step = end >= current ? 1 : -1;
  while (iso(current) !== iso(end)) {
    current = new Date(current.getTime() + step * DAY_MS);
    if (isBusinessDay(current, skip)) count += step;
  }
  return count;
}

const DEFAULT_INTERVALS = { first: 5, second: 10, final: 15 };

/**
 * Date a given follow-up stage is due, relative to when the PREVIOUS message was actually sent.
 * first  -> 5 business days after the initial email
 * second -> 10 business days after the first follow-up
 * final  -> 15 business days after the second follow-up
 */
function nextFollowUpDate(stage, previousSentAt, intervals = DEFAULT_INTERVALS, holidays = []) {
  if (!(stage in intervals)) throw new RangeError(`Unknown follow-up stage: ${stage}`);
  return addBusinessDays(previousSentAt, intervals[stage], holidays);
}

/** Projected schedule (assumes each follow-up is sent on its due date). For display only. */
function projectFollowUpSchedule(initialSentAt, intervals = DEFAULT_INTERVALS, holidays = []) {
  const schedule = [];
  let anchor = initialSentAt;
  for (const stage of ['first', 'second', 'final']) {
    const dueDate = nextFollowUpDate(stage, anchor, intervals, holidays);
    schedule.push({ stage, dueDate, businessDaysAfterPrevious: intervals[stage] });
    anchor = dueDate;
  }
  return schedule;
}

module.exports = {
  addBusinessDays,
  businessDaysBetween,
  nextFollowUpDate,
  projectFollowUpSchedule,
  isBusinessDay,
  DEFAULT_INTERVALS
};
