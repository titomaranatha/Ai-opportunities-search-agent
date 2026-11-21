# Base44 Implementation Guide

## Read this first

Uploading this repository or its ZIP file to Base44 **does not** deploy the application. This repository is a specification and tooling package. You (or the Base44 builder, guided by these files) must create the entities, backend functions, automations, pages and connections described below, then test them.

Base44 features, integration names and limits change over time. Names used here (entities, backend functions, automations, `Core.InvokeLLM`, `Core.SendEmail`, `Core.UploadFile`, `Core.ExtractDataFromUploadedFile`, connectors) reflect Base44 concepts as commonly documented, but **verify each against the current Base44 documentation and your plan** before relying on it. Anything marked *unverified* needs a check in your workspace.

## What is what

| Kind | Files | Role in Base44 |
|------|-------|----------------|
| Workflow specifications | `workflows/*.json`, `funding-opportunities-workflow.json` | Requirements for what each automation must do. Read by humans and by the Base44 AI builder. Not executed. |
| Data contracts | `schemas/*.json` | Field definitions for entities and AI response schemas |
| Executable JavaScript | `src/lib/*.js`, `scripts/*.js` | Runs on Node.js. `src/lib` logic can be copied into Base44 backend functions (adapt imports); scripts validate this repo locally. |
| Email templates | `templates/*.html` | Stored as app assets or entity records; rendered by the backend function that builds drafts |
| Base44 implementation instructions | This file | The mapping and build order |

## Concept mapping

| Specification | Base44 concept |
|---------------|----------------|
| `entities` in master file | **Entities** (database tables) |
| `step.type = function` with `uses: backend:<name>` | **Backend function** named `<name>` |
| `trigger.type = schedule` | **Scheduled automation** calling a backend function |
| `trigger.type = entity_event` | **Entity automation** on create/update |
| `uses: integration:Core.InvokeLLM` | Base44 **AI integration** |
| `uses: connector:gmail` | **Gmail connector** (OAuth) or Gmail API in a backend function |
| `approval` steps and Email Studio | **Pages** (frontend) calling backend functions |
| `envVars` | **Secrets** / environment variables for backend functions |

## Build order

### Step 1: Entities

Create these entities. Field lists derive from the schemas; nested objects can be stored as JSON fields.

| Entity | Fields (summary) | Source |
|--------|------------------|--------|
| `Opportunity` | title, category, funder (json), officialUrl, applicationUrl, sourceUrls, deadline (json), benefits (json), eligibility (json), requiredDocuments, verification (json), score (json), status, fingerprint, discoveredAt, lastSeenAt | `schemas/opportunity.schema.json` |
| `Application` | opportunityId, status, components (json), budget (json), checklist (json), review (json), submission (json) | `schemas/application.schema.json` |
| `EmailDraft` / `SentEmail` | type, opportunityId, applicationId, tone, templateId, subject, to, cc, bcc, htmlBody, textBody, templateData, attachments, status, approval (json), gmail (json), generation (json) | `schemas/email.schema.json` |
| `FollowUp` | opportunityId, originalEmailId, threadId, stage, dueDate, status, draftEmailId, sentAt, cancelledReason, replyCheck | `schemas/followup.schema.json` |
| `OrganisationDocument` | type, fileUrl, extractedText, extractedFacts (json), uploadedAt, extractedAt | `schemas/organisation.schema.json#/properties/documents` |
| `DiscoverySource` | name, type, url, enabled, extractionMode, status, lastRunAt | master file |
| `OpportunityScore` | opportunityId, total, band, breakdown, assessment fields, scoredAt | WF-03 |
| `SuppressionList` | emailOrDomain, reason, addedAt | WF-06, WF-07 |
| `Notification`, `Report`, `WorkflowLog` | see master file notes | master file |

Use `SentEmail` as a separate entity or as `EmailDraft` records with status `sent`; the specifications accept either, but keep the same field names.

Seed `DiscoverySource` from `config/automation-settings.json#/discovery/initialSources` (includes `https://lnkd.in/p/gZ_53VQ4`).

### Step 2: Secrets

Add the variables from `.env.example` as Base44 secrets. Leave `DRY_RUN=true`. Set `APPROVER_EMAILS` to the real approvers.

### Step 3: Organisation knowledge base

1. Upload the pitch deck and CAC registration documents as `OrganisationDocument` records (`Core.UploadFile`).
2. Extract text and facts (`Core.ExtractDataFromUploadedFile` or an AI call with the file).
3. Review every extracted fact, then update `config/organisation-profile.json` values (or an equivalent `Organisation` record) with `verified: true` and `source: <documentId>`.

Until then the profile is marked `sample` and the system must treat its figures (15 schools, over 5,000 learners) as unconfirmed.

### Step 4: Backend functions

Create one function per `backend:` name. Priority order:

| Function | Workflow | Reference |
|----------|----------|-----------|
| `computeScore` | WF-03 | Port `src/lib/scoring.js` and load `config/scoring-criteria.json` |
| `detectDuplicates` | WF-01 | Port `src/lib/dedupe.js` |
| `renderEmail`, `htmlToText` | WF-05 | Port `src/lib/render-email.js`; load templates |
| `verifyApproval`, `contentHash` | WF-06, WF-07 | Port `src/lib/approval.js` |
| `scheduleFollowUp`, `scheduleNextFollowUp` | WF-07, WF-08 | Port `src/lib/business-days.js` |
| `fetchPageText`, `resolveOfficialSource`, `checkRegionalEligibility`, `scamScreen`, `checkOpenStatus` | WF-01, WF-02 | Implement from the step descriptions |
| `generateEmailContent`, `generateApplicationComponent` | WF-04, WF-05 | AI call using the workflow's `aiInstructions` |
| `sendApprovedEmail` | WF-07 | The only function allowed to send |
| `preSendChecklist`, `approveEmailDraft` | WF-06 | Verify caller identity server-side |
| `computeMetrics`, `verifyNarrativeNumbers` | WF-10 | Implement from step descriptions |

Illustrative shape of the guarded send function (pseudocode, **not tested against Base44**):

```js
// sendApprovedEmail: the ONLY code path that calls the Gmail send API.
async function sendApprovedEmail({ draftId }, ctx) {
  const draft = await ctx.entities.EmailDraft.get(draftId);

  const check = verifyApproval(draft, { approvers: ctx.env.APPROVER_EMAILS.split(',') });
  if (!check.ok) {
    await ctx.entities.EmailDraft.update(draftId, { status: 'pending_approval' });
    await log(ctx, 'send_blocked', { draftId, reason: check.reason });
    return { sent: false, reason: check.reason };
  }
  if (ctx.env.DRY_RUN !== 'false') {
    await log(ctx, 'dry_run_send_skipped', { draftId });
    return { sent: false, reason: 'DRY_RUN' };
  }
  // ...suppression and rate checks, then Gmail send (multipart/alternative)...
}
```

### Step 5: Automations

| Automation | Type | Schedule or event | Calls |
|------------|------|-------------------|-------|
| Daily discovery | Scheduled | `0 6 * * *`, Africa/Lagos | `runDiscovery` (WF-01) |
| Verify new opportunities | Entity | `Opportunity` created, status `pending_verification` | `verifyOpportunity` (WF-02) |
| Score verified opportunities | Entity | `Opportunity` updated, status `verified` | `scoreOpportunity` (WF-03) |
| Prepare application | Entity | `Opportunity` updated, status `pursue_approved` | WF-04 functions |
| Send approved email | Entity | `EmailDraft` updated, status `approved` | `sendApprovedEmail` (WF-07) |
| Follow-up check | Scheduled | `0 8 * * 1-5` | WF-08 functions |
| Deadline monitoring | Scheduled | `0 7 * * *` | `runDeadlineMonitoring` (WF-09) |
| Weekly report | Scheduled | `30 7 * * 1` | `runReporting` (WF-10) |
| Monthly report | Scheduled | `0 8 1 * *` | `runReporting` (WF-10) |

Cron expressions come from `config/automation-settings.json`. Confirm how your Base44 plan expresses time zones; if only UTC is available, convert (Africa/Lagos is UTC+1, so 06:00 local is 05:00 UTC).

### Step 6: Pages

1. **Pipeline:** ranked `Opportunity` list with score band, deadline, status, and a *Pursue / Archive* action (WF-03 decision).
2. **Application workspace:** components, checklist, `[[NEEDS_INPUT]]` highlights, review and approve (WF-04).
3. **Email Studio:** the WF-06 requirements.
4. **Approval queue:** drafts in `pending_approval` for approvers.
5. **Reports:** `Report` records.

Email Studio preview must render HTML. Illustrative React fragment (verify in your app):

```jsx
<iframe title="Desktop preview" sandbox="" srcDoc={draft.htmlBody}
        style={{ width: 700, height: 900, border: '1px solid #E2E8F0' }} />
<iframe title="Mobile preview" sandbox="" srcDoc={draft.htmlBody}
        style={{ width: 375, height: 900, border: '1px solid #E2E8F0' }} />
```

Never use `dangerouslySetInnerHTML` for email HTML in the app page. Use the sandboxed iframe.

### Step 7: Gmail

Connect the Gmail account that will send. Prefer the Base44 connector. Whether it can read replies (needed by WF-08 `check-for-reply`) is *unverified*; if not, keep the human "reply received?" confirmation path.

### Step 8: Test in DRY_RUN

1. Run discovery manually; confirm records appear as `pending_verification`.
2. Verify, score and approve one record end to end.
3. Generate each email type; check desktop and mobile previews.
4. Edit a draft after approval and confirm approval is voided.
5. Approve and send with `DRY_RUN=true`; confirm nothing is sent and a log entry exists.
6. Set `DRY_RUN=false`, send to an address you control, confirm `messageId` and a scheduled `FollowUp` 5 business days later.
7. Simulate a reply and confirm remaining follow-ups cancel.

### Step 9: Go live

Complete the checklist in `docs/security-and-approval-policy.md` section 9.

## Prompts you can give the Base44 builder

- "Create entities exactly as defined in `schemas/opportunity.schema.json` and `schemas/email.schema.json`, plus the entities listed in the `entities` array of `funding-opportunities-workflow.json`."
- "Implement the backend functions listed under `base44.backendFunctions` in `workflows/email-sending.json`. `sendApprovedEmail` must re-verify approval using the hash logic in `src/lib/approval.js` and must refuse to send when `DRY_RUN` is not `false`."
- "Create an Email Studio page that renders `htmlBody` in sandboxed iframes at 700 px and 375 px and lets approvers edit subject, to, cc, bcc and attachments, as specified in `workflows/email-preview-and-approval.json`."

Paste the relevant file contents; the builder cannot read files from your GitHub repository unless your plan supports that.

## Limitations to plan for

- Backend function runtime limits (execution time, memory) may require splitting WF-01 into smaller batches.
- Web search and AI usage costs scale with discovery volume; tune `maxPagesFetchedPerRun`.
- LinkedIn content may need manual import.
- Portal-based applications are submitted by a person; the system records the submission.
- The templates are not tested in specific email clients; send tests before use.
