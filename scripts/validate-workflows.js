#!/usr/bin/env node
'use strict';
/** Validates the master workflow and every workflow specification, including cross-references. */
const { readJson, exists, listFiles, parseEnvExample, readText, createReport } = require('../src/lib/project');

const report = createReport('workflow validation');
const master = readJson('funding-opportunities-workflow.json', report);
if (!master) process.exit(report.finish());

const STEP_TYPES = new Set(['entity_read', 'entity_write', 'function', 'ai', 'integration', 'logic', 'approval', 'send_email', 'manual_task', 'notify', 'workflow_call']);
const TRIGGER_TYPES = new Set(['schedule', 'entity_event', 'manual_or_workflow']);
const REQUIRED_KEYS = ['id', 'name', 'version', 'description', 'trigger', 'inputs', 'steps', 'aiInstructions', 'integrations', 'output', 'errorHandling', 'approval', 'logging', 'handoff', 'base44'];
const envVars = parseEnvExample();
const entityNames = new Set((master.entities || []).map((e) => e.name));
const statusModels = master.statusModels || {};

// ---- master file
const pipeline = master.pipeline || [];
const ids = pipeline.map((p) => p.id);
if (new Set(ids).size !== ids.length) report.error('master: duplicate workflow ids in pipeline');
for (const [name, file] of Object.entries(master.config || {})) if (!exists(file)) report.error(`master: config "${name}" points to missing file ${file}`);
if (master.organisation && !exists(master.organisation.profile)) report.error('master: organisation.profile missing');
for (const e of master.entities || []) {
  if (e.schemaRef && !exists(e.schemaRef)) report.error(`master: entity ${e.name} schemaRef missing: ${e.schemaRef}`);
}
const onDisk = listFiles('workflows', '.json').map((f) => `workflows/${f}`);
onDisk.filter((f) => !pipeline.some((p) => p.file === f)).forEach((f) => report.error(`${f} is not listed in the master pipeline`));
pipeline.filter((p) => !onDisk.includes(p.file)).forEach((p) => report.error(`master pipeline file missing: ${p.file}`));
const required = ['opportunity-discovery', 'opportunity-verification', 'ai-scoring-and-ranking', 'application-preparation', 'email-generation', 'email-preview-and-approval', 'email-sending', 'follow-up-automation', 'deadline-monitoring', 'reporting-and-analytics'];
required.filter((n) => !onDisk.includes(`workflows/${n}.json`)).forEach((n) => report.error(`required workflow missing: workflows/${n}.json`));

const gp = master.globalPolicies || {};
['humanApprovalBeforeExternalCommunication', 'humanApprovalBeforeApplicationSubmission', 'dryRunDefault'].forEach((k) => { if (gp[k] !== true) report.error(`master: globalPolicies.${k} must be true`); });

const workflows = {};
for (const p of pipeline) {
  const wf = readJson(p.file, report);
  if (wf) workflows[p.id] = { wf, file: p.file };
}

for (const [id, { wf, file }] of Object.entries(workflows)) {
  const at = (m) => `${file}: ${m}`;
  REQUIRED_KEYS.forEach((k) => { if (wf[k] === undefined) report.error(at(`missing required key "${k}"`)); });
  if (wf.id !== id) report.error(at(`id "${wf.id}" does not match master pipeline id "${id}"`));
  if (!wf.trigger || !TRIGGER_TYPES.has(wf.trigger.type)) report.error(at(`unknown trigger type "${wf.trigger && wf.trigger.type}"`));
  if (!Array.isArray(wf.steps) || wf.steps.length < 3) { report.error(at('needs at least 3 steps')); continue; }
  if (!Array.isArray(wf.inputs) || !wf.inputs.length) report.error(at('inputs must not be empty'));
  (wf.inputs || []).forEach((i) => { if (!i.name || !i.type || !i.description) report.error(at(`input ${JSON.stringify(i.name)} needs name, type and description`)); });

  if (wf.aiInstructions && wf.aiInstructions.used === true && (!wf.aiInstructions.systemPrompt || !wf.aiInstructions.outputFormat)) report.error(at('AI workflow needs systemPrompt and outputFormat'));
  if (wf.aiInstructions && wf.aiInstructions.used === false && !wf.aiInstructions.reason) report.error(at('aiInstructions.used=false needs a reason'));
  if (wf.errorHandling && !(wf.errorHandling.specificCases || []).length) report.error(at('errorHandling.specificCases must not be empty'));
  if (wf.logging && wf.logging.entity !== 'WorkflowLog') report.error(at('logging.entity must be WorkflowLog'));
  if (wf.output && wf.output.schemaRef) {
    if (!exists(wf.output.schemaRef)) report.error(at(`output.schemaRef missing: ${wf.output.schemaRef}`));
  } else if (wf.output && wf.output.schemaRef === undefined) report.error(at('output.schemaRef must be present (or null)'));
  if (wf.output && wf.output.example && !exists(wf.output.example)) report.error(at(`output.example missing: ${wf.output.example}`));

  // steps
  const stepIds = wf.steps.map((s) => s.id);
  if (new Set(stepIds).size !== stepIds.length) report.error(at('duplicate step ids'));
  const order = Object.fromEntries(stepIds.map((s, i) => [s, i]));
  const scan = (value, label) => {
    // env vars named in text must exist in .env.example
    for (const m of String(value).matchAll(/env:([A-Z][A-Z0-9_]*)/g)) if (!envVars.has(m[1])) report.error(at(`${label} references unknown env var ${m[1]}`));
  };

  for (const s of wf.steps) {
    const sAt = (m) => at(`step "${s.id}": ${m}`);
    if (!STEP_TYPES.has(s.type)) report.error(sAt(`unknown type "${s.type}"`));
    if (!s.name || !s.description) report.error(sAt('needs name and description'));
    (s.envVars || []).forEach((v) => { if (!envVars.has(v)) report.error(sAt(`env var ${v} not in .env.example`)); });
    (s.entities || []).forEach((e) => { if (!entityNames.has(e)) report.error(sAt(`unknown entity "${e}"`)); });
    if (s.approver) scan(s.approver, `step "${s.id}" approver`);
    if (s.codeRef && !exists(s.codeRef)) report.error(sAt(`codeRef missing: ${s.codeRef}`));
    if (s.responseSchemaRef && !exists(s.responseSchemaRef)) report.error(sAt(`responseSchemaRef missing: ${s.responseSchemaRef}`));
    if (s.calls && !workflows[s.calls]) report.error(sAt(`calls unknown workflow ${s.calls}`));
    if (s.next === undefined) report.error(sAt('missing "next"'));
    const targets = Array.isArray(s.next) ? s.next.map((n) => n.goto) : [s.next];
    targets.forEach((t) => { if (t !== 'END' && !(t in order)) report.error(sAt(`next target "${t}" does not exist`)); });
    if (s.onError && s.onError.fallbackStep && !(s.onError.fallbackStep in order)) report.error(sAt(`fallbackStep "${s.onError.fallbackStep}" does not exist`));

    const statuses = [s.setsStatus, ...(s.alsoSetsStatuses || [])].filter(Boolean);
    for (const st of statuses) {
      if (!statusModels[st.entity]) report.error(sAt(`status model for ${st.entity} not defined in master`));
      else if (!statusModels[st.entity].includes(st.status)) report.error(sAt(`status "${st.status}" is not valid for ${st.entity}`));
    }

    // SAFETY: anything that sends externally must be preceded by an approval/verification step
    if (s.type === 'send_email') {
      const ref = s.requiresApprovalFrom;
      if (!ref || !(ref in order) || order[ref] >= order[s.id]) report.error(sAt('send_email must reference an EARLIER approval/verification step in requiresApprovalFrom'));
      else {
        const gate = wf.steps[order[ref]];
        if (!/approval/i.test(gate.id + gate.name)) report.error(sAt(`gate step "${ref}" is not an approval verification step`));
      }
      if (!wf.approval || wf.approval.required !== true) report.error(at('workflow with send_email must declare approval.required = true'));
    }
    if (s.type === 'approval') {
      if (!s.approver) report.error(sAt('approval step needs an approver'));
    }
  }

  // reachability: every step must be reachable from the first step
  const seen = new Set();
  const stack = [stepIds[0]];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur) || cur === 'END' || !(cur in order)) continue;
    seen.add(cur);
    const nx = wf.steps[order[cur]].next;
    (Array.isArray(nx) ? nx.map((n) => n.goto) : [nx]).forEach((t) => stack.push(t));
  }
  stepIds.filter((s) => !seen.has(s)).forEach((s) => report.error(at(`step "${s}" is unreachable`)));

  // approval consistency
  if (wf.approval && wf.approval.required && wf.approval.gate && !wf.steps.some((s) => s.id === wf.approval.gate) && !/^WF-\d+/.test(wf.approval.gate)) {
    report.error(at(`approval.gate "${wf.approval.gate}" is not a step id or workflow gate reference`));
  }

  // integrations env vars
  (wf.integrations || []).forEach((i) => (i.envVars || []).forEach((v) => { if (!envVars.has(v)) report.error(at(`integration "${i.name}" env var ${v} not in .env.example`)); }));
  (wf.base44 && wf.base44.entities || []).forEach((e) => { if (!entityNames.has(e)) report.error(at(`base44.entities lists unknown entity "${e}"`)); });

  // handoff
  (wf.handoff || []).forEach((h) => {
    if (!workflows[h.to]) report.error(at(`handoff.to unknown workflow ${h.to}`));
    else if (workflows[h.to].file !== h.file) report.error(at(`handoff file "${h.file}" does not match ${h.to} (${workflows[h.to].file})`));
    const entry = pipeline.find((p) => p.id === id);
    if (entry && !(entry.handoffTo || []).includes(h.to)) report.error(at(`handoff to ${h.to} is not declared in master pipeline.handoffTo`));
  });
  const entry = pipeline.find((p) => p.id === id);
  (entry.handoffTo || []).forEach((t) => { if (!(wf.handoff || []).some((h) => h.to === t)) report.error(at(`master declares handoff to ${t} but the workflow does not`)); });
}

// Email Studio must specify real HTML rendering in the preview workflow
const w6 = workflows['WF-06'];
if (w6) {
  const ui = w6.wf.uiRequirements || {};
  if (!/actual HTML/i.test(ui.previewRendering || '') || !/iframe/i.test(ui.previewRendering || '')) report.error('WF-06: previewRendering must require rendering the actual HTML in an iframe');
  if (!/375/.test(ui.previewRendering) || !/700/.test(ui.previewRendering)) report.error('WF-06: desktop (700) and mobile (375) preview widths must be specified');
}
// Follow-up intervals
const w8 = workflows['WF-08'];
if (w8) {
  const iv = (w8.wf.followUpPolicy || {}).intervalsBusinessDays || {};
  if (iv.first !== 5 || iv.second !== 10 || iv.final !== 15) report.error('WF-08: follow-up intervals must be 5/10/15');
}
// Scoring weights embedded in WF-03 must match config
const w3 = workflows['WF-03'];
const scoring = readJson('config/scoring-criteria.json');
if (w3 && scoring) {
  for (const c of scoring.criteria) if ((w3.wf.scoringModel || {}).weights[c.key] !== c.maxPoints) report.error(`WF-03: weight for ${c.key} differs from config/scoring-criteria.json`);
}

// README must mention every workflow file
const readme = exists('README.md') ? readText('README.md') : '';
onDisk.forEach((f) => { if (readme && !readme.includes(f.replace('workflows/', ''))) report.warn(`README.md does not mention ${f}`); });

process.exit(report.finish());
