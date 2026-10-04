#!/usr/bin/env node
// sops/planner.mjs
//
// Reads YAML SOPs from sops/*.yaml, prints execution plan for a given SOP.
// Computes parallel groups automatically based on `depends_on` field.
//
// Usage (from the Underboss root, i.e. docs/.control/):
//   node sops/planner.mjs                       # list available SOPs
//   node sops/planner.mjs new-feature           # print plan for new-feature SOP
//   node sops/planner.mjs new-feature --platform claude-code
//   node sops/planner.mjs incident --hide-human # hide steps where gate: manual
//
// v1.1: reads capability:, consumes:, produces:, gate: from steps.
// D-HG: `gate: manual` = human step.
//
// No external deps. YAML is read by the shared subset reader core/control/yaml.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../core/control/yaml.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOPS_DIR = join(__dirname);
const args = process.argv.slice(2);

function arg(name) {
  const idx = args.indexOf(name);
  return idx === -1 ? null : args[idx + 1];
}

const LIST = args.includes('--list');
const HIDE_HUMAN = args.includes('--hide-human');
const PLATFORM = arg('--platform') || 'any';
const sopName = args.find(a => !a.startsWith('--'));

// ---------- YAML: the shared restricted-subset reader ----------

const parseYAML = parse;

// ---------- DAG computation ----------

// Group steps into parallel execution phases via topological levels.
function computeParallelGroups(steps) {
  const byId = new Map();
  for (const s of steps) byId.set(s.id, s);
  const groups = [];
  const done = new Set();

  let safety = steps.length + 5;
  while (done.size < steps.length && safety-- > 0) {
    const ready = steps.filter(s =>
      !done.has(s.id) &&
      (s.depends_on || []).every(d => done.has(d))
    );
    if (ready.length === 0) break;
    groups.push(ready);
    for (const s of ready) done.add(s.id);
  }
  return groups;
}

// ---------- main ----------

function listSops() {
  const files = readdirSync(SOPS_DIR).filter(f => f.endsWith('.yaml')).sort();
  if (files.length === 0) {
    console.log('(no SOPs found in ' + SOPS_DIR + ')');
    return;
  }
  console.log('Available SOPs:');
  for (const f of files) {
    const text = readFileSync(join(SOPS_DIR, f), 'utf8');
    const sop = parseYAML(text);
    console.log('  ' + sop.name + ' — ' + (sop.description || '(no description)'));
    if (Array.isArray(sop.triggers) && sop.triggers.length) {
      console.log('    triggers:');
      for (const t of sop.triggers) console.log('      - ' + t);
    }
  }
}

function printPlan(sopName) {
  const fname = sopName.endsWith('.yaml') ? sopName : sopName + '.yaml';
  const path = join(SOPS_DIR, fname);
  if (!existsSync(path)) {
    console.error('SOP not found: ' + sopName);
    console.error('Run with no args to list available SOPs.');
    process.exit(1);
  }
  const sop = parseYAML(readFileSync(path, 'utf8'));

  console.log('SOP: ' + sop.name);
  if (sop.description) console.log('Description: ' + sop.description);
  console.log('');

  if (Array.isArray(sop.triggers) && sop.triggers.length) {
    console.log('Triggers:');
    for (const t of sop.triggers) console.log('  - ' + t);
    console.log('');
  }

  if (sop.input && Array.isArray(sop.input.required)) {
    console.log('Input required:');
    for (const i of sop.input.required) {
      console.log('  - ' + (i.type || '?') + (i.path_pattern ? ('  at  ' + i.path_pattern) : ''));
      if (i.status) console.log('      frontmatter status=' + i.status);
      if (i.frontmatter_mandatory) console.log('      frontmatter mandatory=' + i.frontmatter_mandatory.join(','));
    }
    console.log('');
  }

  const steps = (sop.steps || []);
  const groups = computeParallelGroups(steps);

  // Optional: hide human-only steps from output (but keep their dependencies in DAG computation).
  // D-HG: `gate: manual` = human step.
  let groupIdx = 0;
  for (const group of groups) {
    const visibleGroup = HIDE_HUMAN
      ? group.filter(s => !s.gate)
      : group;
    if (visibleGroup.length === 0) continue;
    groupIdx++;
    const label = visibleGroup.length > 1 ? `Group ${groupIdx} (parallel)` : `Group ${groupIdx} (sequential or solo)`;
    console.log(label + ':');
    for (const s of visibleGroup) {
      const isGate = s.gate === 'manual';
      if (isGate) {
        console.log(`  [${s.id}] ${s.name}   →   gate: manual`);
      } else {
        if (!s.role && s.capability) {
          console.log(`  ⚠ WARNING: step ${s.id} declares capability without role — planner cannot resolve provider`);
        }
        const roleInfo = s.role ? `role: ${s.role} [${pickPlatform(s.platform)}]` : 'role: (unresolved)';
        const capInfo = s.capability ? `  cap: ${s.capability}` : '';
        const cond = s.condition ? '  (if ' + s.condition + ')' : '';
        console.log(`  [${s.id}] ${s.name}   →   ${roleInfo}${capInfo}${cond}`);
      }
      const consumeStr = Array.isArray(s.consumes) && s.consumes.length ? `consumes: [${s.consumes.join(', ')}]` : '';
      const produceStr = s.produces ? `produces: ${s.produces}` : '';
      if (consumeStr || produceStr) console.log(`        ${consumeStr}${consumeStr && produceStr ? ' → ' : ''}${produceStr}`);
    }
    console.log('');
  }

  if (Array.isArray(sop.output)) {
    console.log('Output:');
    for (const o of sop.output) {
      let line = '  - ' + (o.type || '?');
      if (o.final_path) line += '  →  ' + o.final_path;
      if (o.status) line += '  (status=' + o.status + ')';
      if (o.condition) line += '  if ' + o.condition;
      console.log(line);
    }
  }
}

function pickPlatform(spec) {
  if (!spec || spec === 'any') return `claude-code | opencode`;
  return spec;
}

if (LIST || !sopName) {
  listSops();
  process.exit(0);
}

printPlan(sopName);