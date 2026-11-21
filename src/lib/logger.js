'use strict';
/**
 * Minimal structured JSON logger with secret redaction.
 * Mirrors the WorkflowLog fields used by the workflow specifications.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACTIONS = [
  [/(api[_-]?key|secret|token|password|refresh[_-]?token)(["'\s:=]+)([^\s"',}]+)/gi, '$1$2[REDACTED]'],
  [/ya29\.[\w-]+/g, '[REDACTED]'],
  [/sk-[A-Za-z0-9]{16,}/g, '[REDACTED]']
];

function redact(text) {
  return REDACTIONS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), String(text));
}

function createLogger({ name = 'app', level = process.env.LOG_LEVEL || 'info', write } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const sink = write || ((line) => process.stderr.write(line + '\n'));
  const emit = (lvl, msg, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = { ts: new Date().toISOString(), level: lvl, name, msg, ...fields };
    sink(redact(JSON.stringify(entry)));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f)
  };
}

module.exports = { createLogger, redact, LEVELS };
