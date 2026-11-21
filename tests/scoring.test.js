'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeScore, totalPoints } = require('../src/lib/scoring');
const criteria = require('../config/scoring-criteria.json');

const perfect = { organisational_eligibility: 25, mission_alignment: 20, financial_benefit: 15, geographic_eligibility: 15, application_feasibility: 10, strategic_growth_potential: 10, deadline_readiness: 5 };

test('weights total 100', () => assert.equal(totalPoints(criteria), 100));

test('perfect score is 100 and Priority', () => {
  const r = computeScore(perfect, criteria);
  assert.equal(r.ok, true);
  assert.equal(r.total, 100);
  assert.equal(r.band, 'Priority');
});

test('rejects out-of-range and missing sub-scores', () => {
  const r = computeScore({ ...perfect, mission_alignment: 21, deadline_readiness: undefined }, criteria);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test('disqualifier caps the total at 39 and forces Low band', () => {
  const r = computeScore(perfect, criteria, { disqualifiers: ['Nigeria excluded'] });
  assert.equal(r.total, 39);
  assert.equal(r.capped, true);
  assert.equal(r.band, 'Low');
});

test('band thresholds', () => {
  // Build a score of exactly `total` by removing points from criteria in order.
  const bandFor = (total) => {
    let deficit = 100 - total;
    const sub = { ...perfect };
    for (const key of Object.keys(sub)) {
      const take = Math.min(sub[key], deficit);
      sub[key] -= take;
      deficit -= take;
    }
    const r = computeScore(sub, criteria);
    assert.equal(r.total, total);
    return r.band;
  };
  assert.equal(bandFor(80), 'Priority');
  assert.equal(bandFor(79), 'Strong');
  assert.equal(bandFor(65), 'Strong');
  assert.equal(bandFor(64), 'Moderate');
  assert.equal(bandFor(50), 'Moderate');
  assert.equal(bandFor(49), 'Low');
});
