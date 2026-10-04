#!/usr/bin/env node
// documentation/validation/validate-execution.mjs
//
// Validates Execution Units and Execution Records under .context/execution/
// (consistency between unit.yml and records; see core/control/consistency.mjs).
//
// Usage: node validate-execution.mjs [project-root]      (BASE_REF=origin/master)
// Exit: 0 OK, 1 at least one error. Zero dependencies.
import { basename, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

if (process.argv[1] && basename(process.argv[1]) === 'validate-execution.mjs') {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = process.argv[2] || '.';
  if (!existsSync(root)) { console.log(`ERROR: root '${root}' not found`); process.exit(1); }
  // Core SDK next to the validator (docs/.control/core in a consumer, core/ in the product repo).
  const { checkExecution } = await import(pathToFileURL(join(here, '..', '..', 'core', 'control', 'consistency.mjs')).href);
  const errors = checkExecution(root, { baseRef: process.env.BASE_REF || '' });
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) { console.log('::error::validate-execution failed (see errors above)'); process.exit(1); }
  console.log('validate-execution: OK');
}
