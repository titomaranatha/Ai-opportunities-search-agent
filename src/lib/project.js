'use strict';
/** Shared helpers for the validation scripts. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function readJson(rel, report) {
  try {
    return JSON.parse(readText(rel));
  } catch (err) {
    if (report) report.error(`${rel}: ${err.message}`);
    return null;
  }
}

function listFiles(rel, ext) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !ext || f.endsWith(ext)).sort();
}

function walk(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function parseEnvExample() {
  return new Set(
    readText('.env.example')
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/))
      .filter(Boolean)
      .map((m) => m[1])
  );
}

function createReport(title) {
  const errors = [];
  const warnings = [];
  return {
    error: (m) => errors.push(m),
    warn: (m) => warnings.push(m),
    errors,
    warnings,
    finish() {
      warnings.forEach((w) => console.warn(`  warn  ${w}`));
      errors.forEach((e) => console.error(`  FAIL  ${e}`));
      console.log(`${errors.length ? 'FAILED' : 'PASSED'}  ${title}  (${errors.length} errors, ${warnings.length} warnings)`);
      return errors.length ? 1 : 0;
    }
  };
}

module.exports = { ROOT, readText, readJson, exists, listFiles, walk, parseEnvExample, createReport };
