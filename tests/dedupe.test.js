'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, findDuplicate, fingerprint } = require('../src/lib/dedupe');

test('normalizeUrl strips tracking, www, fragments and trailing slashes', () => {
  assert.equal(normalizeUrl('https://www.Example.org/grants/?utm_source=x&id=2#top'), 'example.org/grants?id=2');
  assert.equal(normalizeUrl('not a url'), null);
});

const existing = [{ id: '1', title: 'Digital Skills Innovation Grant', funder: { name: 'Example Foundation' }, officialUrl: 'https://example.org/grants/digital' }];

test('detects same URL with tracking parameters', () => {
  const r = findDuplicate({ title: 'Totally different', funder: { name: 'Other' }, officialUrl: 'https://www.example.org/grants/digital/?utm_campaign=a', sourceUrls: [] }, existing);
  assert.equal(r.isDuplicate, true);
});

test('detects similar title with the same funder', () => {
  const r = findDuplicate({ title: 'Digital Skills Innovation Grant 2027', funder: { name: 'Example Foundation' }, officialUrl: null, sourceUrls: ['https://other.example.org/x'] }, existing, { threshold: 0.7 });
  assert.equal(r.isDuplicate, true);
  assert.equal(r.reason, 'similar_title_same_funder');
});

test('does not flag unrelated opportunities', () => {
  const r = findDuplicate({ title: 'Youth Hackathon', funder: { name: 'Another Org' }, officialUrl: 'https://another.example.org/hack', sourceUrls: [] }, existing);
  assert.equal(r.isDuplicate, false);
});

test('fingerprint is stable', () => {
  const o = { title: 'A', funder: { name: 'B' }, officialUrl: 'https://example.org/a' };
  assert.equal(fingerprint(o), fingerprint({ ...o }));
});
