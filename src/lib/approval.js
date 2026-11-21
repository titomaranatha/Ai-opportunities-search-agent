'use strict';
/**
 * Approval integrity checks used by WF-06 and WF-07.
 * An approval is bound to a SHA-256 hash of everything that will leave the building.
 * If any of it changes after approval, the approval is void and the draft must be re-approved.
 */
const crypto = require('node:crypto');

function contentHash(draft) {
  const payload = JSON.stringify({
    subject: draft.subject,
    to: [...(draft.to || [])].sort(),
    cc: [...(draft.cc || [])].sort(),
    bcc: [...(draft.bcc || [])].sort(),
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    attachments: (draft.attachments || []).map((a) => a.fileId || a.name).sort()
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function verifyApproval(draft, { approvers = [] } = {}) {
  const a = draft.approval;
  if (draft.status !== 'approved') return { ok: false, reason: `Draft status is "${draft.status}", expected "approved"` };
  if (!a || !a.approvedBy || !a.approvedAt || !a.contentHash) return { ok: false, reason: 'Approval record is incomplete' };
  if (approvers.length && !approvers.map((x) => x.toLowerCase()).includes(a.approvedBy.toLowerCase())) {
    return { ok: false, reason: 'Approver is not in the authorised approver list' };
  }
  if (a.contentHash !== contentHash(draft)) return { ok: false, reason: 'Content changed after approval; re-approval required' };
  return { ok: true, reason: null };
}

module.exports = { contentHash, verifyApproval };
