#!/usr/bin/env node
'use strict';
/** Compiles every JSON Schema and validates config and example data against them. */
const { readJson, listFiles, createReport } = require('../src/lib/project');

let Ajv2020, addFormats;
try {
  Ajv2020 = require('ajv/dist/2020');
  addFormats = require('ajv-formats');
} catch {
  console.error('Missing dependencies. Run "npm install" first.');
  process.exit(2);
}

const report = createReport('schema validation');
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = {};
for (const file of listFiles('schemas', '.schema.json')) {
  const schema = readJson(`schemas/${file}`, report);
  if (!schema) continue;
  try {
    validators[file] = ajv.compile(schema);
  } catch (err) {
    report.error(`schemas/${file}: ${err.message}`);
  }
}

['opportunity', 'application', 'organisation', 'email', 'followup'].forEach((n) => {
  if (!validators[`${n}.schema.json`]) report.error(`schema missing or invalid: ${n}.schema.json`);
});

function check(dataFile, schemaFile, { asArray = false } = {}) {
  const data = readJson(dataFile, report);
  const validate = validators[schemaFile];
  if (!data || !validate) return;
  const items = asArray ? data : [data];
  if (asArray && !Array.isArray(data)) return report.error(`${dataFile}: expected an array`);
  items.forEach((item, i) => {
    if (!validate(item)) {
      validate.errors.forEach((e) => report.error(`${dataFile}${asArray ? `[${i}]` : ''} ${e.instancePath || '/'} ${e.message}`));
    }
  });
}

check('config/organisation-profile.json', 'organisation.schema.json');
check('examples/sample-opportunities.json', 'opportunity.schema.json', { asArray: true });
check('examples/sample-application.json', 'application.schema.json');
check('examples/sample-email.json', 'email.schema.json');
check('examples/sample-followup.json', 'followup.schema.json');

// every sample must be flagged as sample data
for (const f of ['examples/sample-application.json', 'examples/sample-email.json', 'examples/sample-followup.json']) {
  const d = readJson(f);
  if (d && d.isSample !== true) report.error(`${f}: must set "isSample": true`);
}
const opps = readJson('examples/sample-opportunities.json');
if (Array.isArray(opps)) opps.forEach((o) => { if (o.isSample !== true) report.error(`sample opportunity ${o.id} must set "isSample": true`); });

// negative test: the schemas must actually reject bad data
const bad = { id: 'x', title: 'x', category: 'not-a-category', sourceUrls: [], status: 'bogus', discoveredAt: 'yesterday' };
if (validators['opportunity.schema.json'] && validators['opportunity.schema.json'](bad)) report.error('opportunity schema accepted deliberately invalid data');

process.exit(report.finish());
