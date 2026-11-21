# Workflow Documentation

All workflows are JSON specifications in `workflows/`, listed in order in `funding-opportunities-workflow.json`. They describe **what** each automation must do and which Base44 pieces it needs. They are not executed by this repository.

## Common structure

Every workflow contains:

| Key | Meaning |
|-----|---------|
| `id`, `name`, `version`, `description` | Identity (`WF-01` to `WF-10`) |
| `trigger` | `schedule`, `entity_event` or `manual_or_workflow` |
| `inputs[]` | Name, type, required, description |
| `steps[]` | Ordered processing steps (see below) |
| `aiInstructions` | System prompt, guardrails and output format, or `used: false` with a reason |
| `integrations[]` | External systems, Base44 mapping, environment variables |
| `output` | Format, description, `schemaRef`, optional `example` |
| `errorHandling` | Default retry policy, failure behaviour, idempotency, specific cases |
| `approval` | Whether a human gate applies and where |
| `logging` | Writes to `WorkflowLog`; fields; redaction rule |
| `handoff[]` | Next workflow and the condition |
| `base44` | Entities, backend functions, automation to create |

### Step types

`entity_read`, `entity_write`, `function`, `ai`, `integration`, `logic`, `approval`, `send_email`, `manual_task`, `notify`, `workflow_call`.

Each step has `id`, `name`, `type`, `description` and `next` (a step id, `END`, or a list of `{ when, goto }` branches). Optional fields: `uses` (for example `backend:computeScore`, `integration:Core.InvokeLLM`, `connector:gmail`), `entities`, `envVars`, `codeRef` (path to reference code), `responseSchemaRef`, `onError`, `setsStatus` and `alsoSetsStatuses`.

### Safety rule enforced by the validator

A `send_email` step must set `requiresApprovalFrom` to an **earlier** step whose id or name contains "approval", and its workflow must declare `approval.required: true`. This makes it structurally impossible to add an unapproved send path without the validator failing.

## Workflow summary

| ID | File | Trigger | Main output | Human gate |
|----|------|---------|-------------|-----------|
| WF-01 | `opportunity-discovery.json` | Daily 06:00 | `Opportunity` records, status `pending_verification` | None |
| WF-02 | `opportunity-verification.json` | Opportunity pending verification | Verification block, status `verified`, `needs_review` or `rejected` | Review queue for `needs_review` |
| WF-03 | `ai-scoring-and-ranking.json` | Opportunity verified | Score card (0 to 100), band, status `scored` | Pursue or archive decision |
| WF-04 | `application-preparation.json` | Opportunity `pursue_approved` | `Application` with grounded drafts and checklist | Human review before `ready_for_submission` |
| WF-05 | `email-generation.json` | Manual or workflow call | `EmailDraft` (HTML and text) | None (drafting only) |
| WF-06 | `email-preview-and-approval.json` | Draft saved | Approved draft with content hash | **Approval required** |
| WF-07 | `email-sending.json` | Draft approved | `SentEmail`, first `FollowUp` | Re-verifies approval; cannot create one |
| WF-08 | `follow-up-automation.json` | Weekdays 08:00 | Follow-up drafts routed to WF-06 | **Approval required** per message |
| WF-09 | `deadline-monitoring.json` | Daily 07:00 | Internal reminders, at-risk flags, expiries | None (internal) |
| WF-10 | `reporting-and-analytics.json` | Monday 07:30 and monthly | `Report` | None (internal) |

## Per-workflow notes

### WF-01 Opportunity Discovery
Builds queries from `config/opportunity-categories.json`, searches, fetches pages (https only, 10 s timeout, 200 KB cap, robots.txt honoured), classifies each source as official, aggregator, social or unknown, resolves an official URL where possible, extracts structured data with the AI, checks Nigeria and Africa eligibility, removes duplicates and saves. The LinkedIn research post `https://lnkd.in/p/gZ_53VQ4` is seeded as a source. If it cannot be read, a human is asked to paste the content.

Reference code: `src/lib/dedupe.js`.

### WF-02 Verification
Compares each recorded claim with the official page, checks open or closed status, screens for scam indicators (fees, requests for bank details or ID numbers, free-email contacts, mismatched funder names) and sets the status. A record with no official source cannot become `verified`.

### WF-03 Scoring
The AI proposes sub-scores. `src/lib/scoring.js` validates ranges, sums them, applies the disqualifier cap (39) and assigns a band: Priority (80+), Strong (65+), Moderate (50+), Low. The AI's own total is never used.

| Criterion | Points |
|-----------|-------:|
| Organisational eligibility | 25 |
| Mission alignment | 20 |
| Financial benefit | 15 |
| Geographic eligibility | 15 |
| Application feasibility | 10 |
| Strategic growth potential | 10 |
| Deadline readiness | 5 |
| **Total** | **100** |

### WF-04 Application Preparation
Uses uploaded documents as the only knowledge source. Components: grant proposal, application responses, organisation profile, project summary, impact statement, founder biography, project budget, cover letter and supporting-documents checklist. A second AI pass removes unsupported claims and inserts `[[NEEDS_INPUT: ...]]` markers. Portal submission is a manual task; the system records it.

### WF-05 Email Generation
Maps the email type to a template (`config/automation-settings.json#/email/emailTypeTemplates`), generates content in the chosen tone, sanitises and renders HTML, derives the plain-text fallback and runs quality checks (placeholders resolved, links on verified domains, no unsupported claims).

Supported types: grant enquiry, application submission, fellowship enquiry, scholarship enquiry, partnership proposal, accelerator application, follow-up, meeting request, thank-you.

### WF-06 Preview and Approval
The Email Studio renders the real HTML in sandboxed iframes (desktop 700 px, mobile 375 px). Editable: subject, to, cc, bcc, attachments, tone. Actions: regenerate with instruction, change tone, approve, reject. Approval stores `approvedBy`, `approvedAt` and a SHA-256 `contentHash` (`src/lib/approval.js`). Any later edit voids it.

### WF-07 Sending
Re-verifies approval and the hash, honours `DRY_RUN`, checks suppression and rate limits, sends `multipart/alternative` through Gmail, records `messageId` and `threadId`, updates the opportunity and creates the first follow-up.

### WF-08 Follow-ups

| Stage | Due |
|-------|-----|
| First | 5 business days after the initial email |
| Second | 10 business days after the first follow-up was sent |
| Final | 15 business days after the second follow-up was sent |

Stops on: reply received, opportunity closed, deadline passed, recipient suppressed, manual cancellation. Each follow-up is a draft that goes through WF-06 unless `preAuthorisedFollowUpsAllowed` is explicitly enabled (default `false`). Reference code: `src/lib/business-days.js`.

### WF-09 Deadline Monitoring
Reminders at 30, 14, 7, 3 and 1 days; at-risk flag when fewer than 7 days remain and the application is not in review; expired opportunities are closed. Notifications go to internal staff only.

### WF-10 Reporting
Metrics are computed in code. The AI narrative may use only those numbers; a verification step checks this. Amounts in different currencies are never added together.

## Extending

1. Copy an existing workflow file and change `id`, `name`, steps and `handoff`.
2. Add it to `pipeline` in the master file (with `handoffTo`), and add any new entities and statuses there.
3. Add any environment variables to `.env.example`.
4. Run `npm run validate:workflows` and fix reported issues.
