#!/usr/bin/env node
// documentation/validation/validate-vocabulary.mjs
//
// Rejects removed vocabulary in the Operational Model, checked per class
// (v3 Spec section 13.3). A file's class follows from what it is:
//   historical   type audit; implemented/superseded Spec; superseded/deprecated ADR
//   spec         Spec in drafts/ or approved/ (not scanned)
//   validator    this validator and its tests (they define the patterns)
//   code         .sh .ps1 .mjs .json .yaml .yml   -> forbidden vocabulary is an error
//   docs         .md                              -> forbidden vocabulary is an error
// Allowed in operational files: ordinary English "run time" and consumer-domain
// terms; structural id references in frontmatter (supersedes, depends_on,
// implements, entity_refs) are not vocabulary. Narrow exception: an ADR that explicitly defines the removal of a term
// may use it (only adr-004-spec-lifecycle, for the Spec status `review`).
//
// Usage: node validate-vocabulary.mjs [repo-root]
// Exit: 0 OK, 1 at least one violation. Zero dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const CODE_EXT = new Set(['.sh', '.ps1', '.mjs', '.json', '.yaml', '.yml']);
const DOC_EXT = new Set(['.md']);
// Not scanned: dependency lockfiles (third-party package names) and the consumer's append-only log.
// In a consumer repository (docs/.control is mounted) only the operational files are scanned.
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'composer.lock']);
const OPERATIONAL = [/^docs\//, /^\.context\//, /^\.claude\//, /^\.github\//, /^(CLAUDE|AGENTS)\.md$/];
export function skipped(path, consumer) {
  if (LOCKFILES.has(basename(path)) || path === 'docs/LOG.md') return true;
  return consumer && !OPERATIONAL.some((re) => re.test(path));
}

// term -> regex. `runtime` is checked after consumer-domain terms are masked.
const FORBIDDEN_IDENTIFIERS = [
  ['former mount path', /docs[\\/]\.runtime/],
  ['former variable', /\bRUNTIME_[A-Z]+\b/],
  ['former entity ref', /runtime-agentic-layer/],
  ['former layout', /\.context[\\/]runtime/],
];
const REVIEW_LIFECYCLE = [
  ['review lifecycle directory', /specs[\\/]review/],
  ['review lifecycle status', /\bstatus:\s*review\b/],
  ['review lifecycle transition', /\bdrafts?\s*(→|->)\s*review\b|\breview\s*(→|->)\s*(approved|implemented|superseded)\b/],
  ['review lifecycle enum', /["'|]\s*review\s*["'|,]/],
];
const DOMAIN_TERMS = [
  /runtime[- _]ownership/gi,
  /runtime_owner/gi,
  /runtime reality/gi,
  /runtime behavior/gi,
  /runtime path/gi,
  /(?:at|to) runtime/gi,
];
const EXCEPTIONS = {
  'adr-004-spec-lifecycle': new Set(['review']),
  'guide-move-from-underboss': new Set(['legacy', 'review']), // the guide for consumers of the old name must name the old layout
};

function listFiles(root) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
  } catch {
    const out = [];
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        if (e === '.git') continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p); else out.push(relative(root, p).replace(/\\/g, '/'));
      }
    };
    walk(root);
    return out;
  }
}

function frontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return {};
  const end = lines.indexOf('---', 1);
  const fm = {};
  for (const l of lines.slice(1, end < 0 ? 1 : end)) {
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(l);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

export function classify(path, text) {
  const ext = extname(path);
  if (path === 'documentation/validation/validate-vocabulary.mjs' || path.startsWith('documentation/validation/tests/')) return 'validator';
  if (DOC_EXT.has(ext)) {
    const fm = frontmatter(text);
    if (fm.type === 'audit') return 'historical';
    if (fm.type === 'spec') return ['implemented', 'superseded'].includes(fm.status) ? 'historical' : 'spec';
    if (fm.type === 'adr' && ['superseded', 'deprecated'].includes(fm.status)) return 'historical';
    return 'docs';
  }
  if (CODE_EXT.has(ext)) return 'code';
  return null;
}

export function scan(path, text, cls) {
  const findings = [];
  const fm = path.endsWith('.md') ? frontmatter(text) : {};
  const allowed = EXCEPTIONS[fm.id] || new Set();
  text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    if (/^(supersedes|depends_on|implements|entity_refs):/.test(line)) return; // structural id references
    const hit = (what) => findings.push({ path, line: i + 1, what, text: line.trim().slice(0, 140) });
    if (!allowed.has('legacy')) for (const [what, re] of FORBIDDEN_IDENTIFIERS) if (re.test(line)) hit(what);
    if (!allowed.has('review')) for (const [what, re] of REVIEW_LIFECYCLE) if (re.test(line)) hit(what);
    let masked = line;
    for (const re of DOMAIN_TERMS) masked = masked.replace(re, ' ');
    if (!allowed.has('legacy') && /\bruntime\b/i.test(masked)) hit('former product term "runtime"');
  });
  void cls;
  return findings;
}

export function run(root) {
  const byClass = {};
  const violations = [];
  const consumer = existsSync(join(root, 'docs', '.control', 'core', 'registry.yaml'));
  for (const path of listFiles(root)) {
    if (skipped(path, consumer)) continue;
    const abs = join(root, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const ext = extname(path);
    if (!CODE_EXT.has(ext) && !DOC_EXT.has(ext)) continue;
    const text = readFileSync(abs, 'utf8');
    const cls = classify(path, text);
    if (!cls) continue;
    byClass[cls] = (byClass[cls] || 0) + 1;
    if (cls === 'code' || cls === 'docs') violations.push(...scan(path, text, cls).map((f) => ({ ...f, cls })));
  }
  return { byClass, violations };
}

if (process.argv[1] && basename(process.argv[1]) === 'validate-vocabulary.mjs') {
  const root = process.argv[2] || '.';
  const { byClass, violations } = run(root);
  for (const c of ['code', 'docs', 'spec', 'historical', 'validator']) {
    const v = violations.filter((x) => x.cls === c).length;
    const scanned = c === 'code' || c === 'docs';
    console.log(`validate-vocabulary: ${c.padEnd(10)} files=${String(byClass[c] || 0).padStart(3)} ${scanned ? `violations=${v}` : 'not scanned (allowed by lexical policy)'}`);
  }
  for (const v of violations) console.log(`ERROR: ${v.path}:${v.line}: ${v.what}: ${v.text}`);
  if (violations.length) { console.log('::error::validate-vocabulary failed (see errors above)'); process.exit(1); }
  console.log('validate-vocabulary: OK');
}
