'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { contentHash, verifyApproval } = require('../src/lib/approval');

const draft = () => {
  const d = { status: 'approved', subject: 'Hello', to: ['a@example.org'], cc: [], bcc: [], htmlBody: '<p>x</p>', textBody: 'x', attachments: [] };
  d.approval = { approvedBy: 'boss@example.org', approvedAt: '2026-11-20T10:00:00Z', contentHash: contentHash(d) };
  return d;
};

test('valid approval passes', () => assert.equal(verifyApproval(draft(), { approvers: ['BOSS@example.org'] }).ok, true));

test('editing content after approval voids it', () => {
  const d = draft();
  d.subject = 'Changed';
  const r = verifyApproval(d);
  assert.equal(r.ok, false);
  assert.match(r.reason, /re-approval/);
});

test('adding a BCC recipient after approval voids it', () => {
  const d = draft();
  d.bcc = ['x@example.org'];
  assert.equal(verifyApproval(d).ok, false);
});

test('unauthorised approver is rejected', () => assert.equal(verifyApproval(draft(), { approvers: ['other@example.org'] }).ok, false));

test('non-approved status is rejected', () => {
  const d = draft();
  d.status = 'draft';
  assert.equal(verifyApproval(d).ok, false);
});

test('recipient order does not change the hash', () => {
  const a = { subject: 's', to: ['a@x.org', 'b@x.org'], htmlBody: 'h', textBody: 't' };
  const b = { ...a, to: ['b@x.org', 'a@x.org'] };
  assert.equal(contentHash(a), contentHash(b));
});
