#!/usr/bin/env node
'use strict';
/** Validates config/*.json plus repository-wide safety checks (secrets, .env.example). */
const { readJson, exists, readText, walk, ROOT, createReport } = require('../src/lib/project');
const { totalPoints } = require('../src/lib/scoring');
const path = require('node:path');
const fs = require('node:fs');

const report = createReport('config validation');
const cfg = (n) => readJson(`config/${n}.json`, report);

const org = cfg('organisation-profile');
const cats = cfg('opportunity-categories');
const scoring = cfg('scoring-criteria');
const auto = cfg('automation-settings');

// ---- scoring model
if (scoring) {
  const expected = { organisational_eligibility: 25, mission_alignment: 20, financial_benefit: 15, geographic_eligibility: 15, application_feasibility: 10, strategic_growth_potential: 10, deadline_readiness: 5 };
  const sum = totalPoints(scoring);
  if (sum !== 100) report.error(`scoring-criteria: weights sum to ${sum}, expected 100`);
  if (scoring.totalPoints !== sum) report.error('scoring-criteria: totalPoints does not match the sum of criteria');
  for (const [key, max] of Object.entries(expected)) {
    const c = scoring.criteria.find((x) => x.key === key);
    if (!c) report.error(`scoring-criteria: missing criterion "${key}"`);
    else if (c.maxPoints !== max) report.error(`scoring-criteria: "${key}" should be ${max} points, found ${c.maxPoints}`);
  }
  if (scoring.criteria.length !== Object.keys(expected).length) report.error('scoring-criteria: unexpected number of criteria');
  const mins = scoring.bands.map((b) => b.min);
  if (!mins.includes(0)) report.error('scoring-criteria: bands must include a band starting at 0');
  if (new Set(mins).size !== mins.length) report.error('scoring-criteria: duplicate band thresholds');
}

// ---- categories
if (cats) {
  const ids = cats.categories.map((c) => c.id);
  if (new Set(ids).size !== ids.length) report.error('opportunity-categories: duplicate ids');
  cats.categories.forEach((c) => { if (!c.keywords || !c.keywords.length) report.error(`opportunity-categories: "${c.id}" has no keywords`); });
  const schema = readJson('schemas/opportunity.schema.json', report);
  if (schema) {
    const enumIds = schema.properties.category.enum;
    ids.filter((i) => !enumIds.includes(i)).forEach((i) => report.error(`category "${i}" missing from opportunity.schema.json enum`));
    enumIds.filter((i) => !ids.includes(i)).forEach((i) => report.error(`schema enum "${i}" missing from opportunity-categories.json`));
  }
}

// ---- automation settings
if (auto) {
  const iv = auto.followUps && auto.followUps.intervalsBusinessDays;
  if (!iv || iv.first !== 5 || iv.second !== 10 || iv.final !== 15) report.error('automation-settings: follow-up intervals must be 5 / 10 / 15 business days');
  const ap = auto.approvals || {};
  ['initialEmailRequiresApproval', 'externalSendRequiresApproval', 'applicationSubmissionRequiresApproval', 'approvalBoundToContentHash'].forEach((k) => {
    if (ap[k] !== true) report.error(`automation-settings: approvals.${k} must be true`);
  });
  if (ap.preAuthorisedFollowUpsAllowed !== false) report.warn('automation-settings: preAuthorisedFollowUpsAllowed is not false; follow-ups could be sent without per-message approval');
  if (auto.dryRunDefault !== true) report.warn('automation-settings: dryRunDefault is not true');
  for (const [name, s] of Object.entries(auto.schedules || {})) {
    if (String(s.cron).trim().split(/\s+/).length !== 5) report.error(`automation-settings: schedule "${name}" is not a 5-field cron`);
  }
  const sources = (auto.discovery && auto.discovery.initialSources) || [];
  if (!sources.some((s) => s.url === 'https://lnkd.in/p/gZ_53VQ4')) report.error('automation-settings: required LinkedIn source https://lnkd.in/p/gZ_53VQ4 is missing');
  const map = (auto.email && auto.email.emailTypeTemplates) || {};
  const emailSchema = readJson('schemas/email.schema.json', report);
  for (const [type, file] of Object.entries(map)) {
    if (!exists(`templates/${file}`)) report.error(`automation-settings: template templates/${file} (for ${type}) does not exist`);
  }
  if (emailSchema) {
    emailSchema.properties.type.enum.filter((t) => !map[t]).forEach((t) => report.error(`automation-settings: no template mapped for email type "${t}"`));
  }
  if (auto.email && !exists(`templates/${auto.email.signatureTemplate}`)) report.error('automation-settings: signature template missing');
  if (auto.email && !auto.email.tones.includes(auto.email.defaultTone)) report.error('automation-settings: defaultTone is not in tones');
}

// ---- organisation profile
if (org) {
  const schema = readJson('schemas/organisation.schema.json', report);
  if (!org.stats || !org.stats.partnerSchools || !org.stats.learnersTrained) report.error('organisation-profile: partnerSchools and learnersTrained stats are required');
  for (const [k, s] of Object.entries(org.stats || {})) {
    if (s.verified === false && s.source !== 'sample_data') report.warn(`organisation-profile: stat "${k}" is unverified but source is not "sample_data"`);
    if (s.verified === true && s.source === 'sample_data') report.error(`organisation-profile: stat "${k}" marked verified but sourced from sample data`);
  }
  if (org.registration && org.registration.verified && !org.registration.sourceDocumentId) report.error('organisation-profile: registration marked verified without a sourceDocumentId');
  if (org.registration && org.registration.registrationNumber && !org.registration.sourceDocumentId) report.warn('organisation-profile: registrationNumber present without a sourceDocumentId');
  if (!schema) report.warn('organisation schema unavailable; skipped structural check');
}

// ---- required files
['README.md', 'LICENSE', '.gitignore', '.env.example', 'package.json', 'BASE44_IMPLEMENTATION.md', 'funding-opportunities-workflow.json',
  'docs/system-architecture.md', 'docs/installation-guide.md', 'docs/workflow-documentation.md', 'docs/api-integrations.md', 'docs/email-design-system.md', 'docs/security-and-approval-policy.md',
  'assets/architecture-diagram.md', 'assets/screenshots/README.md',
  'examples/sample-opportunities.json', 'examples/sample-application.json', 'examples/sample-email.json']
  .forEach((f) => { if (!exists(f)) report.error(`required file missing: ${f}`); });

// ---- secret scan over every text file
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9]{20,}/, 'API key (sk-...)'],
  [/ya29\.[A-Za-z0-9_-]{20,}/, 'Google OAuth access token'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/xox[abp]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/(api[_-]?key|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9/+_-]{16,}["']/i, 'hard-coded credential assignment']
];
for (const file of walk()) {
  const rel = path.relative(ROOT, file);
  if (/\.(zip|png|jpg|jpeg|gif|ico)$/i.test(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) report.error(`possible ${label} in ${rel}`);
  if (/^\.env($|\.)/.test(path.basename(rel)) && path.basename(rel) !== '.env.example') report.error(`${rel}: environment file must not be committed`);
}

// ---- .env.example sanity: values must be empty or safe defaults
for (const line of readText('.env.example').split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && /KEY|SECRET|TOKEN|PASSWORD/.test(m[1]) && m[2].trim() !== '') report.error(`.env.example: ${m[1]} must be empty`);
}

process.exit(report.finish());
