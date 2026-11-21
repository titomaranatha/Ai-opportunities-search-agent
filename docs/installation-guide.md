# Installation Guide

This guide sets up the repository locally so you can run the validators, tests and email preview. Building the Base44 application is covered in [BASE44_IMPLEMENTATION.md](../BASE44_IMPLEMENTATION.md).

## Prerequisites

- Node.js 20 or newer (`node --version`)
- npm (bundled with Node.js)
- Git (to publish to GitHub)

## 1. Get the project

```bash
unzip ai-funding-opportunities-agent.zip
cd ai-funding-opportunities-agent
```

Or clone your GitHub copy after you upload it.

## 2. Install dependencies

```bash
npm install
```

Runtime dependencies are `ajv` and `ajv-formats`, used by the schema validator. The reference code in `src/lib/` has no dependencies.

## 3. Configure the environment

```bash
cp .env.example .env
```

Fill in values only when you connect real services. Local validation needs **no** secrets. Leave `DRY_RUN=true` until you have tested the full send path.

| Variable | Needed for |
|----------|-----------|
| `BASE44_APP_ID`, `BASE44_API_KEY` | Scripts or functions calling the Base44 API |
| `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_ENDPOINT`, `WEB_SEARCH_API_KEY` | WF-01 and WF-02 web search |
| `AI_PROVIDER_API_KEY`, `AI_MODEL_NAME` | Only if you do not use Base44's built-in AI integration |
| `GMAIL_SENDER_ADDRESS` | WF-07, WF-08 |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Only if you do not use the Base44 Gmail connector |
| `APPROVER_EMAILS` | Comma-separated list of people allowed to approve outbound messages |
| `INTERNAL_NOTIFICATION_EMAIL` | Internal digests and alerts |
| `FOLLOWUP_ENABLED`, `HOLIDAY_DATES` | Follow-up behaviour |
| `ORG_TIMEZONE`, `LOG_LEVEL`, `DRY_RUN` | General behaviour |

Never commit `.env`. It is excluded by `.gitignore`, and `validate-config.js` fails if an environment file other than `.env.example` is present.

## 4. Run the checks

```bash
npm run validate
```

This runs, in order:

| Script | Checks |
|--------|--------|
| `scripts/validate-config.js` | Config files, scoring weights total 100, follow-up intervals 5/10/15, approval flags, required files, secret scan |
| `scripts/validate-schemas.js` | Schemas compile; config and examples conform; a negative test confirms the schema rejects bad data |
| `scripts/validate-workflows.js` | Required keys, unique and reachable steps, valid `next` targets, entity and env-var references, status values, file references, hand-offs, send-requires-approval rule |
| `scripts/validate-templates.js` | DOCTYPE, viewport, responsive CSS, balanced tags, palette rules, full render from sample data, plain-text fallback, HTML escaping |
| `npm test` | Unit tests for scoring, de-duplication, business days, rendering, approval hashing and log redaction |

Each script can be run on its own, for example `npm run validate:workflows`. A non-zero exit code means at least one check failed.

## 5. Preview an email

```bash
npm run preview                                   # grant-enquiry.html with sample data
node scripts/build-email-preview.js application-followup.html
```

Open the generated `dist/email-preview-<template>.html` in a browser. It shows the **rendered** email at desktop (700 px) and mobile (375 px) widths, and a plain-text tab. `dist/` is git-ignored.

## 6. Publish to GitHub

```bash
git init
git add .
git commit -m "Initial commit: AI funding opportunities agent"
git branch -M main
git remote add origin https://github.com/<your-account>/ai-funding-opportunities-agent.git
git push -u origin main
```

Before pushing, run `npm run validate` and confirm `git status` shows no `.env` file.

## 7. Replace the sample organisation data

`config/organisation-profile.json` contains **sample** values (15 partner schools, over 5,000 learners) flagged `verified: false`. To replace them:

1. Upload the pitch deck and CAC registration documents into your Base44 `OrganisationDocument` entity.
2. Run WF-04 step `ingest-organisation-documents` to extract facts.
3. Confirm each fact; set `verified: true` and `source` to the document ID.

The validator rejects a stat marked verified while its source is still `sample_data`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing dependencies. Run "npm install" first.` | Run `npm install` |
| `node --test` finds no tests | Run from the repository root |
| `FAIL ... possible API key in <file>` | Remove the value; use an environment variable |
| `FAIL ... status "x" is not valid for Opportunity` | Add the status to `statusModels` in the master file and the matching schema enum, or correct the step |
| Preview shows blank fields | A template variable has no value in the data file; check the console warning |
