#!/usr/bin/env node
// documentation/validation/validate-backlog.mjs
//
// Validates the backlog: docs/backlog/active.md holds only open items `[ ]`;
// docs/backlog/archive.md holds only `[x]` (completed) and `[-]` (cancelled,
// deferred, dropped, superseded). No other file lives in docs/backlog/.
//
// Usage: node validate-backlog.mjs [docs-root]
// Exit: 0 OK, 1 at least one error. Zero dependencies.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export function validate(docsRoot) {
  const errors = [];
  const dir = join(docsRoot, 'backlog');
  if (!existsSync(dir)) return errors;

  for (const e of readdirSync(dir)) {
    if (e === '.gitkeep' || e === 'active.md' || e === 'archive.md') continue;
    errors.push(`${join(dir, e)}: only active.md and archive.md belong in docs/backlog/`);
  }

  const allowed = { 'active.md': [' '], 'archive.md': ['x', '-'] };
  for (const [name, marks] of Object.entries(allowed)) {
    const f = join(dir, name);
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
    let inFence = false;
    lines.forEach((l, i) => {
      if (/^\s*```/.test(l)) inFence = !inFence;
      if (inFence) return;
      const m = /^\s*-\s+\[(.)\]/.exec(l);
      if (!m) return;
      if (!marks.includes(m[1])) {
        errors.push(`${f}:${i + 1}: item marker [${m[1]}] is not allowed in ${name} (allowed: ${marks.map((x) => `[${x}]`).join(' ')})`);
      }
    });
  }
  return errors;
}

if (process.argv[1] && basename(process.argv[1]) === 'validate-backlog.mjs') {
  const docsRoot = process.argv[2] || process.env.ROOT || 'docs';
  if (!existsSync(docsRoot)) { console.log(`ERROR: docs root '${docsRoot}' not found`); process.exit(1); }
  const errors = validate(docsRoot);
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) { console.log('::error::validate-backlog failed (see errors above)'); process.exit(1); }
  console.log('validate-backlog: OK');
}
