#!/usr/bin/env node
// documentation/validation/validate-lifecycle.mjs
//
// Validates the Spec and ADR lifecycle.
//   - docs/specs/<dir>/ is one of drafts, approved, implemented, superseded
//   - a Spec status equals its directory (drafts -> draft)
//   - a Spec in approved/ has Acceptance criteria with unique AC-NNN ids
//   - `track` (code|docs|mixed, default code) names what a Spec delivers; a docs|mixed
//     Spec in approved/ or implemented/ names its documents in `docs:`, a docs Spec has
//     no `code:`, and a docs|mixed Spec in implemented/ is propagated: every document in
//     `docs:` exists and references the Spec id
//   - docs/decisions/*.md (type decision, ADR-009): status recorded|superseded; every `supersedes`
//     names an existing decision-record, not itself, without a cycle; a superseded record is named
//     by another record's `supersedes`; a different `depends_on` target is a warning
//   - with BASE_REF set: status transitions are legal, and the body of an
//     implemented/superseded Spec and of an accepted/superseded ADR is unchanged against
//     BASE_REF (a `## Result` section of a Spec is excluded). The body of an approved Spec
//     may be edited (ADR-008): while it stays approved this is a WARNING that tells to
//     reopen it as a draft; an approved -> draft move is silent.
//
// Usage: node validate-lifecycle.mjs [docs-root]      (BASE_REF=origin/master)
// Exit: 0 OK, 1 at least one error (warnings do not change the exit code). Zero dependencies.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acceptanceCriteria, parseDoc as parseDocYaml } from '../../core/control/spec.mjs';

export const SPEC_DIRS = { drafts: 'draft', approved: 'approved', implemented: 'implemented', superseded: 'superseded' };
export const SPEC_TRANSITIONS = {
  draft: ['draft', 'approved'],
  approved: ['approved', 'draft', 'implemented', 'superseded'],
  implemented: ['implemented', 'superseded'],
  superseded: ['superseded'],
};
export const DECISION_TRANSITIONS = {
  recorded: ['recorded', 'superseded'],
  superseded: ['superseded'],
};
export const SPEC_TRACKS = ['code', 'docs', 'mixed'];
export const ADR_TRANSITIONS = {
  proposed: ['proposed', 'accepted'],
  accepted: ['accepted', 'deprecated', 'superseded'],
  deprecated: ['deprecated'],
  superseded: ['superseded'],
};
const IMMUTABLE_SPEC = new Set(['approved', 'implemented', 'superseded']);
const IMMUTABLE_ADR = new Set(['accepted', 'superseded']);
const IMMUTABLE_DECISION = new Set(['recorded', 'superseded']);
// ADR-008: the immutability of an approved Spec body is a prescription, not a gate.
const SOFT_SPEC = new Set(['approved']);

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

// Returns the errors. Warnings are appended to `warnings` (an optional collector) and do not fail the check.
export function validate(docsRoot, baseRef, warnings = []) {
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
      checkTrack(f, dir, docsRoot, parseDocYaml(readFileSync(f, 'utf8')).fm, err);
      if (dir === 'approved') {
        const ids = acceptanceCriteria(body);
        if (!ids || ids.length === 0) err(`${f}: an approved Spec requires '## Acceptance criteria' with AC-NNN ids`);
        else if (new Set(ids).size !== ids.length) err(`${f}: duplicate Acceptance criteria ids`);
      }
    }
  }

  checkDecisions(docsRoot, err, (m) => warnings.push(m));
  if (baseRef) checkAgainstBase(docsRoot, baseRef, err, (m) => warnings.push(m));
  return errors;
}

// `[a, b]` -> ['a', 'b'] (an inline list; an absent field is empty)
const inlineList = (v) => (v ? v.replace(/^\[/, '').replace(/\].*$/, '').split(',').map((s) => s.trim()).filter(Boolean) : []);

// ADR-009: a decision-record is immutable and its history is the `supersedes` chain.
// The chain has to be whole: a missing, self or circular reference is an error. Which record is
// current is derived (nothing names it as superseded), so the status of an old record is optional
// to update: the new record is a pure addition.
function checkDecisions(docsRoot, err, warn) {
  const records = new Map();
  for (const f of walk(join(docsRoot, 'decisions'))) {
    const { fm } = parseDoc(readFileSync(f, 'utf8'));
    if (fm.type !== 'decision') continue;
    if (records.has(fm.id)) err(`${f}: duplicate decision id '${fm.id}'`);
    records.set(fm.id, { fm, f });
  }
  if (records.size === 0) return;
  const named = new Set();
  for (const [id, { fm, f }] of records) {
    for (const target of inlineList(fm.supersedes)) {
      named.add(target);
      const old = records.get(target);
      if (target === id) err(`${f}: decision '${id}' supersedes itself`);
      else if (!old) err(`${f}: supersedes '${target}', which is not a decision-record in decisions/`);
      else if (inlineList(old.fm.depends_on).join(',') !== inlineList(fm.depends_on).join(',')) {
        warn(`${f}: supersedes '${target}', which concerns another target (depends_on differs)`);
      }
    }
  }
  for (const [id, { fm, f }] of records) {
    if (fm.status === 'superseded' && !named.has(id)) err(`${f}: decision '${id}' is superseded but no decision-record lists it in 'supersedes'`);
    const seen = new Set([id]);
    let cur = id;
    for (;;) {
      const next = [...records.values()].find((r) => inlineList(r.fm.supersedes).includes(cur));
      if (!next) break;
      if (seen.has(next.fm.id)) { err(`${f}: the supersedes chain of '${id}' is circular`); break; }
      seen.add(next.fm.id);
      cur = next.fm.id;
    }
  }
}

// A Spec's deliverable is code, documents, or both. "implemented" for a docs|mixed Spec
// means its documents are propagated: each one named in `docs:` exists and references
// the Spec id. A code Spec (the default) is not checked here.
function checkTrack(f, dir, docsRoot, fm, err) {
  const track = fm.track === undefined ? 'code' : fm.track;
  if (!SPEC_TRACKS.includes(track)) { err(`${f}: track '${track}' is not code|docs|mixed`); return; }
  if (track === 'code' || (dir !== 'approved' && dir !== 'implemented')) return;
  const list = (v) => (Array.isArray(v) ? v : []);
  const docs = list(fm.docs);
  if (docs.length === 0) err(`${f}: a ${track} Spec in ${dir}/ must name its documents in 'docs:'`);
  if (track === 'docs' && list(fm.code).length > 0) err(`${f}: a docs Spec has no 'code:' (use track: mixed)`);
  if (dir !== 'implemented') return;
  const repoRoot = resolve(docsRoot, '..');
  const idRe = new RegExp(`(?<![a-z0-9-])${fm.id}(?![a-z0-9-])`); // ids are kebab-case (Schema v1): no escaping needed
  for (const d of docs) {
    const target = [resolve(repoRoot, d), resolve(dirname(f), d)].find((c) => existsSync(c) && statSync(c).isFile());
    if (!target) err(`${f}: docs entry '${d}' is not an existing file`);
    else if (!idRe.test(readFileSync(target, 'utf8'))) err(`${f}: docs entry '${d}' does not reference Spec id '${fm.id}'`);
  }
}

function checkAgainstBase(docsRoot, baseRef, err, warn) {
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
  const compare = (sub, type, transitions, immutable, cut, soft = new Set()) => {
    const base = loadBase(sub);
    for (const [id, now] of loadNow(sub)) {
      if (now.fm.type !== type) continue;
      const was = base.get(id);
      if (!was) continue;
      const from = was.fm.status, to = now.fm.status;
      if (transitions[from] && !transitions[from].includes(to)) err(`${now.f}: illegal ${type} transition ${from} -> ${to}`);
      if (immutable.has(from) && normalizeBody(was.body, cut) !== normalizeBody(now.body, cut)) {
        if (soft.has(from) && to === 'draft') continue; // reopened for editing: this is the prescribed path
        if (soft.has(from) && to === from) warn(`${now.f}: body of an ${from} ${type} changed against ${baseRef}; set it to draft (git mv to drafts/) while it is being edited, then re-approve (ADR-008)`);
        else err(`${now.f}: body of a ${from} ${type} changed against ${baseRef}`);
      }
    }
  };
  compare('specs', 'spec', SPEC_TRANSITIONS, IMMUTABLE_SPEC, true, SOFT_SPEC);
  compare('adr', 'adr', ADR_TRANSITIONS, IMMUTABLE_ADR, false);
  compare('decisions', 'decision', DECISION_TRANSITIONS, IMMUTABLE_DECISION, false);
}

if (process.argv[1] && basename(process.argv[1]) === 'validate-lifecycle.mjs') {
  const docsRoot = process.argv[2] || process.env.ROOT || 'docs';
  if (!existsSync(docsRoot)) { console.log(`ERROR: docs root '${docsRoot}' not found`); process.exit(1); }
  const warnings = [];
  const errors = validate(docsRoot, process.env.BASE_REF || '', warnings);
  for (const w of warnings) console.log(`WARNING: ${w}`);
  if (process.env.GITHUB_ACTIONS) for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) { console.log('::error::validate-lifecycle failed (see errors above)'); process.exit(1); }
  console.log('validate-lifecycle: OK');
}
