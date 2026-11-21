'use strict';
/**
 * Dependency-free renderer for the HTML email templates.
 *   {{name}}   -> HTML-escaped value
 *   {{{name}}} -> raw (pre-sanitised) HTML value
 * Missing variables are reported, never silently emitted.
 */
const fs = require('node:fs');
const path = require('node:path');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function lookup(data, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), data);
}

const TOKEN = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g;

function render(template, data, { strict = false } = {}) {
  const missing = new Set();
  const output = template.replace(TOKEN, (match, rawKey, escKey) => {
    const key = rawKey || escKey;
    const value = lookup(data, key);
    if (value === undefined || value === null) {
      missing.add(key);
      return '';
    }
    return rawKey ? String(value) : escapeHtml(value);
  });
  if (strict && missing.size) throw new Error(`Missing template variables: ${[...missing].join(', ')}`);
  return { output, missing: [...missing] };
}

function listPlaceholders(template) {
  const keys = new Set();
  for (const m of template.matchAll(TOKEN)) keys.add(m[1] || m[2]);
  return [...keys];
}

/** Plain-text fallback generated from the final HTML (multipart/alternative). */
function htmlToText(html) {
  const decoded = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
      const label = text.replace(/<[^>]+>/g, '').trim();
      return label && label !== href ? `${label} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => decoded[m])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Render a template file, injecting the shared signature partial first. */
function renderEmailFromFiles(root, templateFile, data, options = {}) {
  const dir = path.join(root, 'templates');
  const signature = render(fs.readFileSync(path.join(dir, 'professional-signature.html'), 'utf8'), data);
  const body = fs.readFileSync(path.join(dir, templateFile), 'utf8');
  const result = render(body, { ...data, signature_html: signature.output }, options);
  return {
    html: result.output,
    text: htmlToText(result.output),
    missing: [...new Set([...signature.missing, ...result.missing])]
  };
}

module.exports = { render, escapeHtml, listPlaceholders, htmlToText, renderEmailFromFiles };
