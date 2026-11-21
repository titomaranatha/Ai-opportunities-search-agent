'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, redact } = require('../src/lib/logger');

test('redacts credentials in log output', () => {
  const lines = [];
  const log = createLogger({ level: 'info', write: (l) => lines.push(l) });
  // Fake values are assembled at runtime so the repository secret scan stays clean.
  const fakeKey = 'abcdef1234' + '567890FAKEVALUE';
  const fakeToken = 'ya29.' + 'abcdefghijklmnop';
  log.info('call', { api_key: fakeKey, note: 'token=' + fakeToken });
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes(fakeKey));
  assert.ok(!lines[0].includes(fakeToken));
});

test('respects the level threshold', () => {
  const lines = [];
  const log = createLogger({ level: 'warn', write: (l) => lines.push(l) });
  log.info('quiet');
  log.error('loud');
  assert.equal(lines.length, 1);
});

test('redact handles plain strings', () => assert.equal(redact('password: ' + 'hunter2hunter2'), 'password: [REDACTED]'));
