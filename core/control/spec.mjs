// core/control/spec.mjs — reading Spec/ADR documents and invariants.
// Shared by the control layer and the documentation validators.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './yaml.mjs';

export function parseDoc(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return { fm: {}, body: lines.join('\n') };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { fm: {}, body: lines.join('\n') };
  let fm = {};
  try { fm = parse(lines.slice(1, end).join('\n')); } catch { fm = {}; }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

export function acceptanceCriteria(body) {
  const m = /^## Acceptance criteria\s*$/m.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  return [...section.matchAll(/^\s*-\s+\*\*(AC-\d{3})\*\*/gm)].map((x) => x[1]);
}

export function hasExcludedScope(body) {
  return /^## Scope\s*$[\s\S]*?^### Excluded\s*$/m.test(body);
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

export function findDocById(root, subdir, id) {
  for (const file of walk(join(root, 'docs', subdir))) {
    const text = readFileSync(file, 'utf8');
    const doc = parseDoc(text);
    if (doc.fm.id === id) {
      const parts = file.replace(/\\/g, '/').split('/');
      return { file, dir: parts[parts.length - 2], text, ...doc };
    }
  }
  return null;
}

export function allDocIds(root) {
  const ids = new Set();
  for (const file of walk(join(root, 'docs'))) {
    const { fm } = parseDoc(readFileSync(file, 'utf8'));
    if (typeof fm.id === 'string') ids.add(fm.id);
  }
  const catalog = join(root, 'docs', 'architecture', 'entity-catalog.md');
  if (existsSync(catalog)) {
    for (const m of readFileSync(catalog, 'utf8').matchAll(/^- \*\*([a-z0-9][a-z0-9-]*)\*\*/gm)) ids.add(m[1]);
  }
  return ids;
}

// Text of an invariant: its `### INV-NNN` section.
export function invariantText(root, id) {
  const file = join(root, 'docs', 'architecture', 'invariants.md');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = new RegExp(`^### ${id}\\s*$`, 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index);
  const next = rest.slice(m[0].length).search(/^(### |## |---\s*$)/m);
  return (next >= 0 ? rest.slice(0, m[0].length + next) : rest).trim();
}
