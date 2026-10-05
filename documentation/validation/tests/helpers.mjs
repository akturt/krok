// Shared helpers for the validator tests. Zero dependencies (node:test).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function tmp(prefix = 'krok-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function put(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

export function doc({ id, type, status, extra = '', body = '' }) {
  return `---\nschema: 1\nid: ${id}\ntype: ${type}\nstatus: ${status}\ndate: 2026-10-04\nowners: [t]\nentity_refs: [x]\n${extra}---\n\n${body}\n`;
}

export const AC = '# S\n\n## Acceptance criteria\n- **AC-001** it works\n';
