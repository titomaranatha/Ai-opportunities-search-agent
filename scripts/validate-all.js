#!/usr/bin/env node
'use strict';
/** Runs every validator and the unit tests; exits non-zero if any fail. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const steps = [
  ['validate-config.js'],
  ['validate-schemas.js'],
  ['validate-workflows.js'],
  ['validate-templates.js']
];
let failed = 0;
for (const [script] of steps) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}
const t = spawnSync(process.execPath, ['--test'], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
if (t.status !== 0) failed += 1;

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
