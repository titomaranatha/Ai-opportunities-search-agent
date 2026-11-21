# API Integrations

This document defines the contract each external integration must satisfy. **None of these integrations is operational in this repository.** They are specifications to implement in Base44 backend functions or an equivalent runtime. Provider-specific details (endpoints, quotas, field names) change; confirm them in each provider's current documentation.

## Overview

| Integration | Used by | Credentials (env var) | Base44 mapping |
|-------------|---------|----------------------|----------------|
| Web search REST API | WF-01, WF-02 | `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_ENDPOINT`, `WEB_SEARCH_API_KEY` | Backend function with `fetch` and secrets |
| Page fetcher | WF-01, WF-02 | none | Backend function |
| LLM | WF-01 to WF-05, WF-08, WF-10 | Built in, or `AI_PROVIDER_API_KEY`, `AI_MODEL_NAME` | Base44 AI integration (`Core.InvokeLLM`) |
| File upload and extraction | WF-04, WF-01 (manual import) | none | `Core.UploadFile`, `Core.ExtractDataFromUploadedFile` |
| Gmail | WF-07, WF-08 | `GMAIL_*` or Base44 connector | Gmail connector or backend function |
| Internal email | WF-09, WF-10 | `INTERNAL_NOTIFICATION_EMAIL` | `Core.SendEmail` (internal recipients only) |

## 1. Web search

**Contract.** The backend function `searchWeb(query, { maxResults })` returns:

```json
{
  "query": "AI grant Nigeria open call 2026",
  "provider": "<WEB_SEARCH_PROVIDER>",
  "retrievedAt": "2026-11-20T06:00:12Z",
  "results": [
    { "title": "...", "url": "https://...", "snippet": "..." }
  ]
}
```

Rules:

- Use any provider with a REST API. Keep provider-specific parsing inside the function so workflows are provider-neutral.
- Pass the API key in a header from a secret. Never in a URL that is logged.
- Respect rate limits: on HTTP 429 back off exponentially and finish the run as "partial".
- Results come only from the API. The AI never invents or "recalls" results.
- Cap per run (`maxPagesFetchedPerRun`, default 150) to control cost.

## 2. Page fetching

`fetchPageText(url)` must:

- Accept `https` only, follow at most 3 redirects, time out at 10 s, cap the body at 200 KB.
- Honour `robots.txt`.
- Strip scripts, styles and navigation; return `{ url, finalUrl, status, text, contentHash, fetchedAt }`.
- Refuse private and loopback addresses (SSRF protection).
- Never send cookies or credentials.

Fetched text is **untrusted data** and is passed to the AI inside clearly delimited blocks.

## 3. LinkedIn research source

The initial source is `https://lnkd.in/p/gZ_53VQ4`. LinkedIn commonly requires login and restricts automated access, so:

1. WF-01 step `ingest-linkedin-source` resolves the short link and attempts a normal unauthenticated read.
2. If the response is a login wall, redirect to sign-in or 401/403/999, the source is set to `manual_import_required` and a Notification asks a person to paste the text or upload a screenshot or PDF.
3. The upload is processed with `Core.UploadFile` and `Core.ExtractDataFromUploadedFile`; each programme named becomes a candidate that follows the normal verification path.
4. Account credentials and session cookies are never used to scrape LinkedIn. Candidates found only on LinkedIn are not `verified` until an official source is located.

## 4. LLM

Use Base44's built-in AI integration where available, with a JSON response schema so outputs are machine-checkable.

Requirements for every AI call:

- The system prompt in the workflow's `aiInstructions` is used verbatim, with `{{organisation.*}}` values filled from the profile.
- Source material is delimited and labelled as untrusted.
- Output is validated against a schema; invalid output is retried once, then the step fails safely.
- Deterministic work (totals, dates, hashes, de-duplication) is done in code, not by the model.
- Prompts and outputs are logged as IDs and hashes, not full text, when they contain personal data.

## 4a. Document processing

`OrganisationDocument` records hold uploaded files (pitch deck, CAC registration, impact reports, CVs). Extraction output is stored with the document and each extracted fact keeps a `documentId` and locator so that application text can cite its source. If extraction fails, the document stays uploaded with `extractedAt: null` and the gap is flagged.

## 5. Gmail

Two supported options:

| Option | When to use |
|--------|-------------|
| Base44 Gmail connector (OAuth managed by the platform) | Preferred: no refresh token in your secrets |
| Gmail API directly with `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | If you need capabilities the connector lacks |

Send requirements:

- Build a `multipart/alternative` message: `text/plain` first, then `text/html`.
- Add a stable header, for example `X-Draft-Id: <draftId>`, so a retry can detect an already-sent message.
- Store `messageId`, `threadId` and `sentAt` in `SentEmail`.
- Use the narrowest OAuth scopes available. Sending needs a send scope; reply detection needs read access to threads. If your workspace's connector cannot read replies, WF-08 falls back to a human confirmation task.
- On 401/403, stop and alert internally; do not retry.
- Only the `sendApprovedEmail` function may call the send API.

## 6. Internal notifications

`Core.SendEmail` (or Gmail) to `INTERNAL_NOTIFICATION_EMAIL` only. WF-09 and WF-10 must never address external recipients.

## 7. Error taxonomy

| Class | Examples | Behaviour |
|-------|----------|-----------|
| Transient | 429, 5xx, timeout | Retry with exponential backoff (default 2 retries) |
| Auth | 401, 403 | Stop, alert internal address, no retry |
| Data | Invalid JSON from AI, missing variable | Regenerate once, otherwise fail the step safely |
| Safety | Hash mismatch, unauthorised approver, suppressed recipient | Abort, log, never send |
| Source | Blocked page, login wall | Skip source, create manual task |
