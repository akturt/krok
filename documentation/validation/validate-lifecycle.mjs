#!/usr/bin/env node
// documentation/validation/validate-lifecycle.mjs
//
// Validates the Spec and ADR lifecycle.
//   - docs/specs/<dir>/ is one of drafts, approved, implemented, superseded
//   - a Spec status equals its directory (drafts -> draft)
//   - a Spec in approved/ has Acceptance criteria with unique AC-NNN ids
//   - with BASE_REF set: status transitions are legal, and the body of an
//     approved/implemented/superseded Spec and of an accepted/superseded ADR
//     is unchanged against BASE_REF (a `## Result` section of a Spec is excluded)
//
// Usage: node validate-lifecycle.mjs [docs-root]      (BASE_REF=origin/master)
// Exit: 0 OK, 1 at least one error. Zero dependencies.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acceptanceCriteria } from '../../core/control/spec.mjs';

export const SPEC_DIRS = { drafts: 'draft', approved: 'approved', implemented: 'implemented', superseded: 'superseded' };
export const SPEC_TRANSITIONS = {
  draft: ['draft', 'approved'],
  approved: ['approved', 'implemented', 'superseded'],
  implemented: ['implemented', 'superseded'],
  superseded: ['superseded'],
};
export const ADR_TRANSITIONS = {
  proposed: ['proposed', 'accepted'],
  accepted: ['accepted', 'deprecated', 'superseded'],
  deprecated: ['deprecated'],
  superseded: ['superseded'],
};
const IMMUTABLE_SPEC = new Set(['approved', 'implemented', 'superseded']);
const IMMUTABLE_ADR = new Set(['accepted', 'superseded']);

export function parseDoc(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return { fm: {}, body: lines.join('\n') };
  let end = lines.indexOf('---', 1);
  if (end < 0) return { fm: {}, body: lines.join('\n') };
  const fm = {};
  for (const l of lines.slice(1, end)) {
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(l);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

export function normalizeBody(body, cutResult) {
  let b = body.replace(/\r\n/g, '\n');
  if (cutResult) {
    const i = b.search(/^## Result\b/m);
    if (i >= 0) b = b.slice(0, i);
  }
  return b.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function validate(docsRoot, baseRef) {
  const errors = [];
  const err = (m) => errors.push(m);
  const specsRoot = join(docsRoot, 'specs');

  if (existsSync(specsRoot)) {
    for (const e of readdirSync(specsRoot)) {
      const p = join(specsRoot, e);
      if (!statSync(p).isDirectory()) continue;
      if (!(e in SPEC_DIRS)) err(`${p}: directory '${e}' is not a Spec status directory (drafts|approved|implemented|superseded)`);
    }
    for (const f of walk(specsRoot)) {
      const dir = basename(join(f, '..'));
      if (!(dir in SPEC_DIRS)) continue;
      const { fm, body } = parseDoc(readFileSync(f, 'utf8'));
      if (fm.type !== 'spec') { err(`${f}: a file under docs/specs/ must have type spec`); continue; }
      if (!Object.values(SPEC_DIRS).includes(fm.status)) err(`${f}: status '${fm.status}' is not draft|approved|implemented|superseded`);
      else if (fm.status !== SPEC_DIRS[dir]) err(`${f}: status '${fm.status}' != path '${dir}' (expected '${SPEC_DIRS[dir]}')`);
      if (dir === 'approved') {
        const ids = acceptanceCriteria(body);
        if (!ids || ids.length === 0) err(`${f}: an approved Spec requires '## Acceptance criteria' with AC-NNN ids`);
        else if (new Set(ids).size !== ids.length) err(`${f}: duplicate Acceptance criteria ids`);
      }
    }
  }

  if (baseRef) checkAgainstBase(docsRoot, baseRef, err);
  return errors;
}

function checkAgainstBase(docsRoot, baseRef, err) {
  let top, prefix;
  try {
    top = git(['rev-parse', '--show-toplevel'], docsRoot).trim();
    prefix = git(['rev-parse', '--show-prefix'], docsRoot).trim();
    git(['rev-parse', '--verify', baseRef], top);
  } catch { err(`BASE_REF '${baseRef}' cannot be resolved`); return; }
  const loadBase = (sub) => {
    const map = new Map();
    let names = '';
    try { names = git(['ls-tree', '-r', '--name-only', baseRef, '--', `${prefix}${sub}`], top); } catch { return map; }
    for (const path of names.split(/\r?\n/).filter((x) => x.endsWith('.md'))) {
      const { fm, body } = parseDoc(git(['show', `${baseRef}:${path}`], top));
      if (fm.id) map.set(fm.id, { fm, body });
    }
    return map;
  };
  const loadNow = (sub) => {
    const map = new Map();
    for (const f of walk(join(docsRoot, sub))) {
      const { fm, body } = parseDoc(readFileSync(f, 'utf8'));
      if (fm.id) map.set(fm.id, { fm, body, f });
    }
    return map;
  };
  const compare = (sub, type, transitions, immutable, cut) => {
    const base = loadBase(sub);
    for (const [id, now] of loadNow(sub)) {
      if (now.fm.type !== type) continue;
      const was = base.get(id);
      if (!was) continue;
      const from = was.fm.status, to = now.fm.status;
      if (transitions[from] && !transitions[from].includes(to)) err(`${now.f}: illegal ${type} transition ${from} -> ${to}`);
      if (immutable.has(from) && normalizeBody(was.body, cut) !== normalizeBody(now.body, cut)) {
        err(`${now.f}: body of a ${from} ${type} changed against ${baseRef}`);
      }
    }
  };
  compare('specs', 'spec', SPEC_TRANSITIONS, IMMUTABLE_SPEC, true);
  compare('adr', 'adr', ADR_TRANSITIONS, IMMUTABLE_ADR, false);
}

if (process.argv[1] && basename(process.argv[1]) === 'validate-lifecycle.mjs') {
  const docsRoot = process.argv[2] || process.env.ROOT || 'docs';
  if (!existsSync(docsRoot)) { console.log(`ERROR: docs root '${docsRoot}' not found`); process.exit(1); }
  const errors = validate(docsRoot, process.env.BASE_REF || '');
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) { console.log('::error::validate-lifecycle failed (see errors above)'); process.exit(1); }
  console.log('validate-lifecycle: OK');
}
