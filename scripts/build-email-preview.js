#!/usr/bin/env node
'use strict';
/**
 * Builds a static Email Studio preview page that RENDERS the actual HTML email
 * (desktop 700 px and mobile 375 px sandboxed iframes) plus the plain-text fallback.
 *
 * Usage:
 *   node scripts/build-email-preview.js [template.html] [data.json]
 * Output: dist/email-preview-<template>.html
 */
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readJson, listFiles } = require('../src/lib/project');
const { renderEmailFromFiles, escapeHtml } = require('../src/lib/render-email');

const template = process.argv[2] || 'grant-enquiry.html';
const dataFile = process.argv[3] || 'examples/sample-template-data.json';

if (!listFiles('templates', '.html').includes(template)) {
  console.error(`Unknown template "${template}". Available: ${listFiles('templates', '.html').join(', ')}`);
  process.exit(1);
}
const data = readJson(dataFile);
if (!data) { console.error(`Could not read ${dataFile}`); process.exit(1); }

const { html, text, missing } = renderEmailFromFiles(ROOT, template, data);
if (missing.length) console.warn(`warning: unresolved variables: ${missing.join(', ')}`);

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email preview - ${escapeHtml(template)}</title>
<style>
  :root { --royal:#4169E1; --deep:#1E3A8A; --text:#334155; --muted:#64748B; --line:#E2E8F0; }
  body { margin:0; font-family:Helvetica, Arial, sans-serif; color:var(--text); background:#FFFFFF; }
  header { padding:16px 24px; border-bottom:4px solid var(--royal); }
  h1 { margin:0; font-size:18px; color:var(--deep); }
  p.note { margin:4px 0 0; font-size:13px; color:var(--muted); }
  .tabs { display:flex; gap:8px; padding:12px 24px; border-bottom:1px solid var(--line); }
  .tabs button { border:1px solid var(--royal); background:#FFFFFF; color:var(--royal); padding:8px 14px; border-radius:4px; cursor:pointer; font-size:14px; }
  .tabs button[aria-selected="true"] { background:var(--royal); color:#FFFFFF; }
  .panel { display:none; padding:24px; }
  .panel.active { display:block; }
  .frame-wrap { overflow-x:auto; }
  iframe { border:1px solid var(--line); background:#FFFFFF; display:block; margin:0 auto; }
  #desktop iframe { width:700px; height:900px; }
  #mobile iframe { width:375px; height:900px; }
  pre { white-space:pre-wrap; background:#EFF3FD; border-left:3px solid var(--royal); padding:16px; font-size:13px; line-height:1.5; }
</style>
</head>
<body>
<header>
  <h1>Email preview: ${escapeHtml(template)}</h1>
  <p class="note">Rendered HTML (not source). Frames are sandboxed: no scripts, no same-origin access.</p>
</header>
<div class="tabs" role="tablist">
  <button role="tab" aria-selected="true" data-tab="desktop">Desktop (700 px)</button>
  <button role="tab" aria-selected="false" data-tab="mobile">Mobile (375 px)</button>
  <button role="tab" aria-selected="false" data-tab="text">Plain text</button>
</div>
<section id="desktop" class="panel active"><div class="frame-wrap"><iframe title="Desktop preview" sandbox="" srcdoc="${attr(html)}"></iframe></div></section>
<section id="mobile" class="panel"><div class="frame-wrap"><iframe title="Mobile preview" sandbox="" srcdoc="${attr(html)}"></iframe></div></section>
<section id="text" class="panel"><pre>${escapeHtml(text)}</pre></section>
<script>
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === b.dataset.tab); });
    });
  });
</script>
</body>
</html>
`;

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `email-preview-${template.replace(/\.html$/, '')}.html`);
fs.writeFileSync(out, page);
console.log(`Preview written to ${path.relative(ROOT, out)}`);
