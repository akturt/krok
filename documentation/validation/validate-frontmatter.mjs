#!/usr/bin/env node
// documentation/validation/validate-frontmatter.mjs
//
// Validates that every .md file under docs/ has Canonical Schema v1 frontmatter.
// Frontmatter-only checks (no false positives on prose/code blocks).
// Based on schemas/frontmatter.schema.json. Every finding is an error.
// One process, one pass: the checks are per-file, so the cost is the file reads.
//
// Usage: node validate-frontmatter.mjs [docs-root] [--changed]      (ROOT=docs)
//   --changed  check only the .md files that differ from HEAD (modified, staged, untracked).
//              When git cannot tell (no repository, no HEAD) all files are checked and
//              the output says so; a changed-only run never reports OK for files it did not read.
// Exit: 0 OK, 1 at least one error. Zero dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const FORBIDDEN = ['lifecycle', 'author', 'title', 'created', 'supersedes_adr', 'referenced_by', 'excludes-from-scope'];
const MANDATORY = ['id', 'type', 'status', 'date', 'owners'];
const TRACKS = ['code', 'docs', 'mixed'];

// The YAML block between the first and second '---' line; null when the file has no frontmatter.
function frontmatterLines(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return lines.slice(1, end < 0 ? lines.length : end);
}

export function checkText(f, text) {
  const errors = [];
  const err = (m) => errors.push(`${f}: ${m}`);
  const lines = frontmatterLines(text);
  if (lines === null) { err('no frontmatter at all'); return errors; }
  if (lines.join('\n').replace(/\n+$/, '') === '') { err('empty frontmatter'); return errors; }

  const has = (re) => lines.some((l) => re.test(l));
  const value = (key) => {
    const l = lines.find((x) => x.startsWith(`${key}:`));
    return l === undefined ? '' : l.slice(key.length + 1).replace(/^\s+/, '');
  };

  if (!has(/^schema:\s*1\s*$/)) err('schema != 1');
  for (const field of MANDATORY) if (!has(new RegExp(`^${field}:`))) err(`missing mandatory field '${field}'`);
  for (const field of FORBIDDEN) if (has(new RegExp(`^${field}:`))) err(`forbidden field '^${field}:' in frontmatter`);

  const type = value('type');
  const status = value('status');
  if (type === 'runbook' && !has(/^kind:/)) err("type runbook requires 'kind:'");
  if (type === 'spec' && has(/^track:/)) {
    const track = value('track');
    if (!TRACKS.includes(track)) err(`spec track '${track}' must be code, docs or mixed`);
  }
  if (type === 'api' && status !== 'active' && status !== 'deprecated') err(`api status '${status}' must be active or deprecated`);
  if ((type === 'spec' || type === 'audit') && !has(/^entity_refs:\s*\[[^\]]+\]/)) err(`${type} requires non-empty entity_refs`);
  return errors;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
const nul = (s) => s.split('\0').filter(Boolean);
const isMd = (p) => p.endsWith('.md');

// Tracked .md files under the root (all files when there is no repository).
function listAll(root) {
  try { return nul(git(['ls-files', '-z', '--', root])).filter(isMd); } catch { return walk(root); }
}

// .md files under the root that differ from HEAD, or null when git cannot tell.
function listChanged(root) {
  try {
    git(['rev-parse', '--verify', '-q', 'HEAD']);
    const changed = nul(git(['diff', '--name-only', '--relative', '-z', '--diff-filter=d', 'HEAD', '--', root]));
    const fresh = nul(git(['ls-files', '-z', '--others', '--exclude-standard', '--', root]));
    return [...new Set([...changed, ...fresh])].filter(isMd);
  } catch { return null; }
}

export function run(root, changedOnly) {
  const errors = [];
  let files, mode = 'all';
  if (changedOnly) {
    files = listChanged(root);
    if (files === null) { files = listAll(root); console.log('validate-frontmatter: cannot determine the changed files, checking all'); }
    else mode = 'changed';
  } else files = listAll(root);
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) continue;
    errors.push(...checkText(f, readFileSync(f, 'utf8')));
  }
  return { errors, count: files.length, mode };
}

if (process.argv[1] && basename(process.argv[1]) === 'validate-frontmatter.mjs') {
  const args = process.argv.slice(2);
  const changedOnly = args.includes('--changed') || process.env.KROK_CHANGED === '1';
  const root = args.find((a) => !a.startsWith('--')) || process.env.ROOT || 'docs';
  if (!existsSync(root) || !statSync(root).isDirectory()) { console.log(`ERROR: docs root '${root}' not found`); process.exit(1); }
  const { errors, count, mode } = run(root, changedOnly);
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) { console.log('::error::docs-validate failed (see errors above)'); process.exit(1); }
  console.log(`docs-validate: OK${mode === 'changed' ? ` (${count} changed file${count === 1 ? '' : 's'}; run without --changed for the full check)` : ''}`);
}
