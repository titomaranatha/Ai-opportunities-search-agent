#!/usr/bin/env node
'use strict';
/** Validates the HTML email templates and checks they render completely with sample data. */
const { readText, readJson, listFiles, exists, createReport } = require('../src/lib/project');
const { listPlaceholders, renderEmailFromFiles } = require('../src/lib/render-email');
const { ROOT } = require('../src/lib/project');

const report = createReport('template validation');
const data = readJson('examples/sample-template-data.json', report) || {};
const files = listFiles('templates', '.html');
const required = ['grant-enquiry.html', 'grant-application.html', 'partnership-outreach.html', 'fellowship-enquiry.html', 'application-followup.html', 'professional-signature.html'];
required.filter((f) => !files.includes(f)).forEach((f) => report.error(`missing template: ${f}`));

const FULL_DOC = files.filter((f) => f !== 'professional-signature.html');
for (const f of files) {
  const html = readText(`templates/${f}`);
  const at = (m) => `templates/${f}: ${m}`;
  if (FULL_DOC.includes(f)) {
    if (!/^<!DOCTYPE html>/i.test(html)) report.error(at('missing DOCTYPE'));
    if (!/<html[^>]*lang=/i.test(html)) report.error(at('missing lang attribute'));
    if (!/<meta[^>]+name="viewport"/i.test(html)) report.error(at('missing viewport meta tag (needed for responsive layout)'));
    if (!/@media[^{]*max-width/i.test(html)) report.error(at('missing responsive @media query'));
    if (!/<title>\s*\{\{subject\}\}\s*<\/title>/.test(html)) report.error(at('<title> must be {{subject}}'));
    if (!/\{\{\{\s*signature_html\s*\}\}\}/.test(html)) report.error(at('must include the {{{signature_html}}} slot'));
    if (!/\{\{\{\s*body_paragraphs_html\s*\}\}\}/.test(html)) report.error(at('must include {{{body_paragraphs_html}}}'));
    if (!/\{\{\s*cta_url\s*\}\}/.test(html)) report.error(at('must include a call-to-action URL'));
    if (!/\{\{\s*preheader\s*\}\}/.test(html)) report.error(at('must include a preheader'));
    if (!/<\/html>\s*$/.test(html)) report.error(at('document is not closed with </html>'));
    if (!/background-color:\s*#FFFFFF/i.test(html)) report.error(at('white background not declared'));
    if (!/#4169E1/i.test(html)) report.error(at('Royal Blue accent (#4169E1) not used'));
  }
  if (/<script/i.test(html)) report.error(at('scripts are not allowed in emails'));
  if (/#(000000|000)\b|#(FFD700|D4AF37)\b/i.test(html)) report.error(at('black or gold colour found; the brand palette is Royal Blue and White'));
  if (/(src|href)="http:\/\//i.test(html)) report.error(at('insecure http:// link'));
  if (/<img[^>]+src="(?!\{\{)/i.test(html)) report.error(at('hard-coded image source'));
  const opens = (html.match(/<table\b/gi) || []).length;
  const closes = (html.match(/<\/table>/gi) || []).length;
  if (opens !== closes) report.error(at(`unbalanced <table> tags (${opens} open, ${closes} closed)`));
  for (const tag of ['tr', 'td', 'div', 'p', 'a']) {
    const o = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const c = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (o !== c) report.error(at(`unbalanced <${tag}> tags (${o} open, ${c} closed)`));
  }
  const missingData = listPlaceholders(html).filter((k) => k !== 'signature_html' && data[k] === undefined);
  if (missingData.length) report.error(at(`placeholders without sample data: ${missingData.join(', ')}`));
}

// every full template must render completely, with HTML and text output
for (const f of FULL_DOC) {
  const r = renderEmailFromFiles(ROOT, f, data);
  if (r.missing.length) report.error(`render of ${f}: unresolved variables ${r.missing.join(', ')}`);
  if (/\{\{|\}\}/.test(r.html)) report.error(`render of ${f}: unreplaced placeholder remains`);
  if (!r.text || r.text.length < 200) report.error(`render of ${f}: plain-text fallback is too short`);
  if (/<[a-z][^>]*>/i.test(r.text)) report.error(`render of ${f}: plain-text fallback still contains HTML tags`);
}

// escaping check: hostile input must not break out
const hostile = { ...data, greeting_name: '<script>alert(1)</script>', cta_url: 'https://example.org/?a=1&b="x"' };
const hr = renderEmailFromFiles(ROOT, 'grant-enquiry.html', hostile);
if (/<script>alert/i.test(hr.html)) report.error('escaping failure: script tag from greeting_name reached the HTML');

if (!exists('docs/email-design-system.md')) report.error('docs/email-design-system.md missing');
process.exit(report.finish());
