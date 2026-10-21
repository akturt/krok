#!/usr/bin/env node
// documentation/validation/integrity-docs.mjs
//
// The document-reading checks of validate-integrity.sh, in one pass over the files:
//   3. every agent `capabilities:` entry exists in knowledge/capabilities.md
//   4. every agent `knowledge:` entry resolves to knowledge/<id>.md
//   7. every template has Schema v1 frontmatter with the mandatory fields
//   8. every `entity_refs:` entry resolves to an id (entity catalog, `id:` fields, Registry names)
// The Registry is parsed by the Core SDK (shell); its component names arrive on stdin, one per line.
//
// Usage: node integrity-docs.mjs <control-root> < registry-ids
// Output: one `ERROR: ...` line per finding. Exit 0 always; the caller counts the errors.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const errors = [];
const err = (m) => errors.push(m);

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);

function frontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  return lines.slice(1, end < 0 ? lines.length : end);
}

// `key: [a, b]` -> ['a', 'b'] (the first matching line; text after the closing bracket is ignored)
function list(fm, key) {
  const line = fm.find((l) => l.startsWith(`${key}:`));
  if (line === undefined) return [];
  return line.slice(key.length + 1).replace(/^\s*\[/, '').replace(/\].*$/, '').split(',').map((s) => s.trim()).filter(Boolean);
}

function walkMd(dir, out = []) {
  for (const e of ls(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkMd(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const capsFile = join(root, 'knowledge', 'capabilities.md');
const capHeadings = existsSync(capsFile)
  ? new Set(read(capsFile).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim().split(/\s/)[0]))
  : null;

// 3 and 4
for (const platform of ['claude-code', 'opencode']) {
  const dir = join(root, 'agents', platform);
  for (const f of ls(dir).filter((x) => x.endsWith('.md'))) {
    const name = f.slice(0, -3);
    const fm = frontmatter(read(join(dir, f)));
    if (capHeadings) {
      for (const cap of list(fm, 'capabilities')) {
        if (!capHeadings.has(cap)) err(`Agent '${name}' capability '${cap}' not found in knowledge/capabilities.md`);
      }
    }
    for (const k of list(fm, 'knowledge')) {
      if (!existsSync(join(root, 'knowledge', `${k}.md`))) err(`Agent '${name}' knowledge ref '${k}' does not resolve to knowledge/${k}.md`);
    }
  }
}

// 7
const tdir = join(root, 'documentation', 'templates');
for (const f of ls(tdir).filter((x) => x.endsWith('.md'))) {
  const fm = frontmatter(read(join(tdir, f)));
  if (fm.length === 0 || fm.join('\n').replace(/\n+$/, '') === '') { err(`Template '${f}' has no frontmatter`); continue; }
  if (!fm.some((l) => /^schema:\s*1\s*$/.test(l))) err(`Template '${f}' schema != 1`);
  for (const field of ['id', 'type', 'status', 'date', 'owners']) {
    if (!fm.some((l) => l.startsWith(`${field}:`))) err(`Template '${f}' missing mandatory field '${field}'`);
  }
}

// 8
const ids = new Set(read(0).split('\n').map((s) => s.trim()).filter(Boolean));
const catalog = join(root, 'docs', 'architecture', 'entity-catalog.md');
if (!existsSync(catalog)) err('docs/architecture/entity-catalog.md not found');
else for (const m of read(catalog).matchAll(/^- \*\*([a-z0-9][a-z0-9-]*)\*\*/gm)) ids.add(m[1]);

const files = ['docs', 'knowledge', 'documentation'].flatMap((d) => walkMd(join(root, d)));
const parsed = files.map((f) => ({ f, fm: frontmatter(read(f)) }));
for (const { fm } of parsed) {
  const l = fm.find((x) => x.startsWith('id:'));
  if (l !== undefined) ids.add(l.slice(3).trim());
}
for (const { f, fm } of parsed) {
  for (const ref of list(fm, 'entity_refs')) {
    if (!ids.has(ref)) err(`${f.slice(root.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')}: entity_ref '${ref}' does not resolve to any id: field or registry component`);
  }
}

for (const e of errors) console.log(`ERROR: ${e}`);
