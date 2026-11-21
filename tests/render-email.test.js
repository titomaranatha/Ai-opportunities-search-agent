'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { render, htmlToText, renderEmailFromFiles } = require('../src/lib/render-email');
const data = require('../examples/sample-template-data.json');

test('escapes double-brace values but not triple-brace', () => {
  const r = render('<p>{{a}}</p>{{{b}}}', { a: '<b>x</b>', b: '<i>ok</i>' });
  assert.equal(r.output, '<p>&lt;b&gt;x&lt;/b&gt;</p><i>ok</i>');
});

test('reports missing variables and supports strict mode', () => {
  assert.deepEqual(render('{{x}} {{y}}', { x: 1 }).missing, ['y']);
  assert.throws(() => render('{{y}}', {}, { strict: true }));
});

test('does not re-process placeholders inside injected values', () => {
  const r = render('{{{a}}}', { a: '{{b}}', b: 'LEAK' });
  assert.equal(r.output, '{{b}}');
});

test('htmlToText converts links and drops hidden preheader and styles', () => {
  const t = htmlToText('<style>p{}</style><div style="display:none">hidden</div><p>Hello <a href="https://example.org">site</a></p>');
  assert.equal(t, 'Hello site (https://example.org)');
});

test('every email template renders completely from sample data', () => {
  for (const f of ['grant-enquiry.html', 'grant-application.html', 'fellowship-enquiry.html', 'partnership-outreach.html', 'application-followup.html']) {
    const r = renderEmailFromFiles(path.join(__dirname, '..'), f, data);
    assert.deepEqual(r.missing, [], f);
    assert.ok(r.html.includes(data.org_name));
    assert.ok(r.text.includes('Kind regards'));
  }
});
