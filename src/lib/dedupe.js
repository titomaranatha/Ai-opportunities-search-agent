'use strict';
/** Duplicate detection for discovered opportunities (WF-01, step detect-duplicates). */
const crypto = require('node:crypto');

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'of', 'and', 'in', 'to', 'on', 'programme', 'program', 'call', 'applications', 'open']);

function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    const qs = url.searchParams.toString();
    return `${host}${path}${qs ? '?' + qs : ''}`;
  } catch {
    return null;
  }
}

function tokens(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  const intersection = [...A].filter((x) => B.has(x)).length;
  return intersection / (A.size + B.size - intersection);
}

function primaryUrl(opp) {
  return opp.officialUrl || opp.applicationUrl || (opp.sourceUrls && opp.sourceUrls[0]) || null;
}

function fingerprint(opp) {
  const url = primaryUrl(opp) && normalizeUrl(primaryUrl(opp));
  const basis = url || `${tokens(opp.title).sort().join(' ')}|${tokens(opp.funder && opp.funder.name).sort().join(' ')}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

function findDuplicate(candidate, existing, { threshold = 0.8 } = {}) {
  const candFp = fingerprint(candidate);
  const candUrl = primaryUrl(candidate) && normalizeUrl(primaryUrl(candidate));
  for (const item of existing) {
    if (item.fingerprint === candFp || fingerprint(item) === candFp) {
      return { isDuplicate: true, match: item, reason: 'same_fingerprint', similarity: 1 };
    }
    const itemUrl = primaryUrl(item) && normalizeUrl(primaryUrl(item));
    if (candUrl && itemUrl && candUrl === itemUrl) {
      return { isDuplicate: true, match: item, reason: 'same_url', similarity: 1 };
    }
    const sameFunder =
      candidate.funder && item.funder &&
      tokens(candidate.funder.name).join(' ') === tokens(item.funder.name).join(' ');
    const similarity = jaccard(tokens(candidate.title), tokens(item.title));
    if (sameFunder && similarity >= threshold) {
      return { isDuplicate: true, match: item, reason: 'similar_title_same_funder', similarity };
    }
  }
  return { isDuplicate: false, match: null, reason: null, similarity: 0 };
}

module.exports = { normalizeUrl, fingerprint, findDuplicate, jaccard, tokens };
