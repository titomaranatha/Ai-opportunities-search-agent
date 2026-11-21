# Security and Approval Policy

## 1. Principles

1. **No unauthorised external communication.** Nothing leaves the organisation (email, application, form) without a recorded human approval.
2. **No invented facts.** Applications and emails use only the organisation's verified documents and verified opportunity records.
3. **No secrets in the repository.** Credentials live in environment variables or Base44 secrets.
4. **Least privilege.** Request the narrowest OAuth scopes and give each function only the entities it needs.
5. **Everything is auditable.** Every run, decision and send is recorded in `WorkflowLog`.

## 2. Approval policy

| Action | Approval | Enforced by |
|--------|----------|-------------|
| Initial outreach email | Required, every message | WF-06, re-verified by WF-07 |
| Application submission (email) | Required | WF-04 review and WF-06 approval |
| Application submission (portal) | Required; performed by a human | WF-04 `human-review`, `record-submission` |
| Follow-up email | Required per message by default | WF-08 routes drafts to WF-06 |
| Pursue or archive an opportunity | Human decision (internal) | WF-03 |
| Internal digests and alerts | Not required (internal only) | WF-09, WF-10 |

### Approval record

An approval stores `approvedBy`, `approvedAt` and `contentHash`: a SHA-256 of subject, sorted recipients (to, cc, bcc), HTML body, text body and attachment identifiers (`src/lib/approval.js`).

The sending function must:

1. Confirm the draft status is `approved`.
2. Confirm `approvedBy` is in `APPROVER_EMAILS` (checked server-side).
3. Recompute the hash and compare. **Any difference voids the approval**: the draft returns to `pending_approval`.
4. Refuse to proceed if `DRY_RUN` is true.

Changing a recipient, a BCC, an attachment or a single character after approval therefore requires re-approval. Unit tests in `tests/approval.test.js` cover these cases.

### Follow-ups

`preAuthorisedFollowUpsAllowed` is `false`. If you enable it, you are authorising future messages in advance; do so only for pre-approved templates, record who authorised it and when, and keep the three-message cap and stop conditions. `validate-config.js` warns if it is turned on.

### Dry run

`DRY_RUN=true` is the default. In this mode WF-07 logs the would-be send and stops. Switch to `false` only after testing the full path with test recipients you control.

## 3. Secrets management

- `.env.example` contains names only; secret-like variables must be empty (checked).
- `.gitignore` excludes `.env` and `.env.*` except the example.
- `validate-config.js` scans every text file for common credential patterns (API keys, OAuth tokens, private keys, hard-coded credential assignments).
- The logger redacts values that look like credentials (`src/lib/logger.js`).
- Rotate keys immediately if one is ever committed; removing it from a later commit does not remove it from history.

## 4. Prompt injection and untrusted content

Web pages, social posts and email replies are data. Mitigations specified in the workflows:

- Prompts state that instructions inside supplied content must be ignored.
- AI output is constrained to a JSON schema and validated.
- AI cannot call tools that send, delete or approve; those are separate, deterministic functions.
- Suspected injection adds the red flag `prompt_injection_suspected` and routes the record to `needs_review`.
- Links in generated emails must point to domains recorded as official for that opportunity.

## 5. Fraud and scam screening

WF-02 flags: application or processing fees, early requests for bank details or ID numbers, free-email contacts for large funders, newly registered domains, mismatched funder names, urgency pressure. Any flag prevents automatic verification.

## 6. Data protection

The system handles organisational documents and contact details of external people (funder contacts). Recommended controls:

- Restrict access to the Base44 app and entities to named staff.
- Store only the contact data needed for outreach; honour removal requests via `SuppressionList`.
- Do not upload personal data of learners or beneficiaries to the knowledge base unless necessary and permitted.
- Nigerian data-protection law (including the Nigeria Data Protection Act 2023) may apply to personal data you process. Obtain legal advice on notices, lawful basis and retention for your situation; this repository does not provide legal advice.
- Logs retain IDs and hashes rather than full message bodies; default retention is 180 days (`automation-settings.json`).

## 7. Access control

| Role | Capabilities |
|------|--------------|
| Viewer | Read pipeline and reports |
| Editor | Edit drafts and applications; cannot approve |
| Approver (in `APPROVER_EMAILS`) | Approve or reject outgoing messages and applications |
| Admin | Manage settings, sources and secrets |

Approval must be verified in a backend function from the authenticated user's identity, never from a client-supplied flag.

## 8. Incident response

If a message was sent in error: pause automations, mark affected drafts `cancelled`, add recipients to the suppression list if requested, record the incident in `WorkflowLog`, and review the approval record for the message. If a secret was exposed: revoke it, rotate it, and check provider logs.

## 9. Review checklist before going live

- [ ] `npm run validate` passes
- [ ] Organisation profile facts confirmed against uploaded documents
- [ ] `APPROVER_EMAILS` contains only current authorised staff
- [ ] Gmail connector authorised with the intended sender account
- [ ] Test sends completed to controlled addresses with `DRY_RUN=false`
- [ ] Suppression list and unsubscribe handling confirmed
- [ ] Legal review of data-protection obligations completed
