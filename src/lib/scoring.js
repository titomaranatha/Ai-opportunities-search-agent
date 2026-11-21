'use strict';
/**
 * Deterministic scoring used by WF-03. The AI proposes per-criterion sub-scores;
 * this module validates them against config/scoring-criteria.json and computes the
 * total, so the model's own arithmetic is never trusted.
 */

function computeScore(subScores, criteriaConfig, { disqualifiers = [] } = {}) {
  const errors = [];
  const breakdown = {};
  let total = 0;

  for (const criterion of criteriaConfig.criteria) {
    const value = subScores ? subScores[criterion.key] : undefined;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`Missing or non-numeric score for "${criterion.key}"`);
      continue;
    }
    if (value < 0 || value > criterion.maxPoints) {
      errors.push(`Score for "${criterion.key}" must be between 0 and ${criterion.maxPoints} (got ${value})`);
      continue;
    }
    breakdown[criterion.key] = { score: value, max: criterion.maxPoints };
    total += value;
  }

  if (errors.length) return { ok: false, errors, total: null, band: null, breakdown };

  let capped = false;
  const cap = criteriaConfig.disqualifierCap;
  if (disqualifiers.length > 0 && typeof cap === 'number' && total > cap) {
    total = cap;
    capped = true;
  }
  total = Math.round(total * 10) / 10;

  const band = [...criteriaConfig.bands].sort((a, b) => b.min - a.min).find((b) => total >= b.min);
  return {
    ok: true,
    errors: [],
    total,
    capped,
    band: band.label,
    recommendedAction: band.action,
    breakdown
  };
}

function totalPoints(criteriaConfig) {
  return criteriaConfig.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
}

module.exports = { computeScore, totalPoints };
