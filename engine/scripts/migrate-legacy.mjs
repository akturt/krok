#!/usr/bin/env node
// engine/scripts/migrate-legacy.mjs
//
// Migrate legacy .md frontmatter to Canonical Schema v1.
// Implements playbook/migrate-legacy.md.
//
// Run from the ROOT of the consumer project:
//   node docs/.control/engine/scripts/migrate-legacy.mjs
//   node docs/.control/engine/scripts/migrate-legacy.mjs --docs docs --dry-run
//   node docs/.control/engine/scripts/migrate-legacy.mjs --owner team-x
//
// What it does:
//   - For every .md in docs/:
//     * parse frontmatter (no external deps; minimal YAML scalar+list parser)
//     * add schema: 1, id (inferred from filename), type (from path), status (inferred),
//       date (from created/filename or today), owners (from author or --owner)
//     * add updated: <today> on all changed docs
//     * for spec/audit: ensure entity_refs non-empty (TODO_ENTITY_REF marker if unknown)
//     * delete legacy fields: author, title, created, lifecycle, referenced_by,
//       supersedes_adr, excludes-from-scope
//     * if legacy `title:` existed, prepend "# <title>" to body
//   - Idempotent: re-running on already-canonical docs is a no-op (only sets updated if changed).
//   - --dry-run: prints planned changes without writing.
//
// Exit code: 0 if all files migrated cleanly; 1 if any TODO/TODO_ENTITY_REF marker left.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';

const args = process.argv.slice(2);

function arg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx === -1 ? defaultValue : args[idx + 1];
}
const DRY = args.includes('--dry-run');
const DOCS_ROOT = arg('--docs', 'docs');
const DEFAULT_OWNER = arg('--owner', 'unassigned');
const QUIET = args.includes('--quiet');
const VERBOSE = args.includes('--verbose');

const TODAY = new Date().toISOString().slice(0, 10);

let todoMarkers = 0;

// ---------- minimal YAML frontmatter parser ----------

function parseFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const endIdx = text.indexOf('\n---', 4);
  if (endIdx === -1) return null;
  const body = text.slice(endIdx + 4).replace(/^\r?\n/, '');
  const fmRaw = text.slice(4, endIdx);
  const fm = {};
  let currentList = null;
  let lastKey = null;

  for (const rawLine of fmRaw.split(/\r?\n/)) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;
    const line = rawLine.replace(/\r$/, '');

    // list item: "  - foo"
    const listMatch = line.match(/^(\s{2,}|\t)-\s+(.+)$/);
    if (listMatch) {
      const value = stripListValue(listMatch[2]);
      if (currentList) {
        currentList.push(value);
      }
      continue;
    }

    // key: value
    const kvMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kvMatch) {
      const [, k, vRaw] = kvMatch;
      let v = vRaw.trim();
      if (v === '') {
        // could be inline empty list [], null, or block list starting next line
        currentList = [];
        fm[k] = currentList;
        lastKey = k;
      } else if (v === '[]') {
        fm[k] = [];
        currentList = null;
        lastKey = k;
      } else if (v === 'null' || v === '~' || v === '{}') {
        fm[k] = null;
        currentList = null;
        lastKey = k;
      } else {
        fm[k] = stripScalarValue(v);
        currentList = null;
        lastKey = k;
      }
      continue;
    }

    // continuation of value for `lastKey` (block scalar) — minimal handling
    if (lastKey && line.startsWith('  ') && typeof fm[lastKey] === 'string') {
      fm[lastKey] += '\n' + line.trim();
    }
  }

  return { fm, body };
}

function stripScalarValue(v) {
  // strip surrounding quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function stripListValue(v) {
  // list items can be quoted or unquoted
  return stripScalarValue(v.trim());
}

// ---------- frontmatter serializer ----------

function serializeFrontmatter(fm) {
  // stable key order: 6 mandatory first, then optional, then per-type extensions
  const MANDATORY = ['schema', 'id', 'type', 'status', 'date', 'updated', 'owners'];
  const OPTIONAL = [
    'entity_refs', 'touches', 'code', 'docs', 'refs',
    'depends_on', 'implements', 'supersedes', 'tags', 'priority',
    'kind', 'scope', 'trigger', 'version',
  ];
  const order = [...MANDATORY.filter((k) => k !== 'updated'), 'updated', ...OPTIONAL];
  const used = new Set();
  const lines = ['---'];
  for (const k of order) {
    if (k in fm) {
      lines.push(serializeEntry(k, fm[k]));
      used.add(k);
    }
  }
  for (const k of Object.keys(fm)) {
    if (!used.has(k) && !LEGACY_FIELDS.includes(k)) {
      lines.push(serializeEntry(k, fm[k]));
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function serializeEntry(k, v) {
  if (Array.isArray(v)) {
    if (v.length === 0) return `${k}: []`;
    return `${k}:\n${v.map((x) => `  - ${enc(x)}`).join('\n')}`;
  }
  return `${k}: ${enc(v)}`;
}

function enc(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') {
    if (v === '' || /^\s*$/.test(v)) return '""';
    // Quote if contains special chars or leading/trailing space
    if (/[:\[\]{}#'&*?|>%@`]/.test(v) || /^\s|\s$/.test(v) || /^["']/.test(v)) {
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}

const LEGACY_FIELDS = ['author', 'title', 'created', 'lifecycle', 'referenced_by', 'supersedes_adr', 'excludes-from-scope'];

// ---------- inference helpers ----------

function inferType(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('/adr/')) return 'adr';
  if (p.includes('/audits/')) return 'audit';
  if (p.includes('/specs/')) return 'spec';
  if (p.includes('/architecture/')) return 'architecture';
  if (p.includes('/backlog/')) return 'backlog';
  if (p.includes('/api/')) return 'api';
  // Heuristics from filename
  const fn = basename(relPath, '.md').toLowerCase();
  if (fn.startsWith('adr-') || /^\d{3}-/.test(fn)) return 'adr';
  if (fn.startsWith('audit-')) return 'audit';
  if (fn.startsWith('runbook-')) return 'runbook';
  if (fn === 'readme' || fn === 'index') return 'guide';
  return 'guide';
}

function inferId(filePath, fm) {
  if (fm.id && typeof fm.id === 'string' && fm.id !== '') return fm.id;
  return inferIdFromPath(filePath);
}

function inferIdFromPath(filePath) {
  const fn = basename(filePath, '.md').toLowerCase();
  // strip date prefix
  const withoutDate = fn.replace(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-/, '');
  if (inferType(filePath) === 'adr') {
    // keep numeric prefix if ADR-style
    const adrMatch = fn.match(/^(\d{3})-?(.+)$/);
    if (adrMatch) return `adr-${adrMatch[1]}-${adrMatch[2]}`;
  }
  return withoutDate;
}

function inferStatus(fmFromLegacy, type, relPath) {
  // for specs: infer from path (status is singular, directory is plural for drafts)
  const p = relPath.replace(/\\/g, '/');
  const specStatusMatch = p.match(/\/specs\/(drafts|approved|implemented|superseded)\//);
  if (specStatusMatch && type === 'spec') {
    return specStatusMatch[1] === 'drafts' ? 'draft' : specStatusMatch[1];
  }

  if (type === 'adr') {
    // Legacy ADRs may use 'status: accepted|proposed|...'
    if (fmFromLegacy.lifecycle === 'accepted' || fmFromLegacy.status === 'accepted') return 'accepted';
    if (fmFromLegacy.lifecycle === 'proposed' || fmFromLegacy.status === 'proposed') return 'proposed';
    if (fmFromLegacy.lifecycle === 'rejected' || fmFromLegacy.lifecycle === 'superseded') return 'deprecated';
    return 'proposed';
  }
  if (type === 'audit') {
    if (fmFromLegacy.status === 'completed') return 'completed';
    return 'draft';
  }
  return 'active';
}

function extractDateFromFilename(filePath) {
  const fn = basename(filePath, '.md');
  const m = fn.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  return m ? m[1] : null;
}

// ---------- migration per file ----------

function migrateFile(absPath, relPath) {
  const text = readFileSync(absPath, 'utf8');
  const parsed = parseFrontmatter(text);

  let fm, body;
  if (parsed) {
    fm = { ...parsed.fm };
    body = parsed.body;
  } else {
    fm = {};
    body = text;
  }

  const type = inferType(relPath);
  const status = inferStatus(fm, type, relPath);
  const id = inferId(absPath, fm);
  const date = fm.date || fm.created || extractDateFromFilename(absPath) || TODAY;
  const owners = (Array.isArray(fm.owners) && fm.owners.length > 0)
    ? fm.owners
    : [fm.author && typeof fm.author === 'string' ? fm.author : DEFAULT_OWNER];

  // Pull legacy title into body as H1
  if (fm.title && typeof fm.title === 'string') {
    if (!body.trimStart().startsWith('# ')) {
      body = `# ${fm.title}\n\n${body.replace(/^\s+/, '')}`;
    }
  }

  const newFm = { schema: 1, id, type, status, date, owners };
  newFm.updated = TODAY;

  // For runbook: kind
  if (type === 'runbook' && fm.kind) newFm.kind = fm.kind;
  else if (type === 'runbook') newFm.kind = 'ops';
  else if (type === 'guide' && fm.kind) newFm.kind = fm.kind;
  else if (type === 'audit') {
    newFm.scope = fm.scope || '';
    newFm.trigger = fm.trigger || '';
  }

  // Copy allowed optional fields (drop legacy)
  for (const k of ['entity_refs', 'touches', 'code', 'docs', 'refs', 'depends_on', 'implements', 'supersedes', 'tags', 'priority', 'version']) {
    if (k in fm && !LEGACY_FIELDS.includes(k)) {
      newFm[k] = fm[k];
    }
  }

  // entity_refs for spec/audit: min 1
  if (type === 'spec' || type === 'audit') {
    if (!Array.isArray(newFm.entity_refs) || newFm.entity_refs.length === 0) {
      newFm.entity_refs = ['TODO_ENTITY_REF'];
      todoMarkers++;
    }
  }

  const newText = serializeFrontmatter(newFm) + '\n\n' + body.replace(/^\s+/, '') + '\n';

  const changed = newText !== text;

  if (DRY) {
    console.log(`${changed ? 'WOULD' : 'skip' }: ${relPath} (type=${type}, status=${status}, id=${id})`);
    if (newFm.entity_refs && newFm.entity_refs.includes('TODO_ENTITY_REF')) {
      console.log(`  marker: TODO_ENTITY_REF`);
    }
    return changed;
  }

  if (changed) {
    writeFileSync(absPath, newText, 'utf8');
    if (!QUIET) console.log(`migrated: ${relPath}`);
    return true;
  }
  if (VERBOSE) console.log(`unchanged: ${relPath}`);
  return false;
}

// ---------- traversal ----------

function walkMd(root) {
  const out = [];
  function rec(dir) {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) rec(p);
      else if (extname(name) === '.md') out.push(p);
    }
  }
  rec(root);
  return out;
}

function main() {
  if (!existsSync(DOCS_ROOT)) {
    console.error(`migrate-legacy: docs root '${DOCS_ROOT}' not found.`);
    process.exit(2);
  }
  if (DRY) console.log(`DRY RUN on ${DOCS_ROOT}`);
  const files = walkMd(DOCS_ROOT);
  if (files.length === 0) {
    console.log('migrate-legacy: no .md files found.');
    process.exit(0);
  }
  let migrated = 0;
  for (const abs of files) {
    const rel = relative('.', abs).replace(/\\/g, '/');
    if (migrateFile(abs, rel)) migrated++;
  }
  console.log(`migrate-legacy: ${migrated} file(s) ${DRY ? 'would change' : 'changed'} of ${files.length} total.`);
  if (todoMarkers > 0) {
    console.error(`migrate-legacy: ${todoMarkers} file(s) contain TODO_ENTITY_REF — manual review required.`);
    process.exit(1);
  }
}

main();
