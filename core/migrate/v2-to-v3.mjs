#!/usr/bin/env node
// core/migrate/v2-to-v3.mjs — the one-time migration of a consumer project from v2 to v3.
//
// This is the Migration Contract of core/contracts/product/migration.yaml, executed once.
// It is not a compatibility layer: nothing in the product reads the old layout, and a
// project that is already v3 (or is not a clean v2) is refused with an explicit error.
//
// Procedure for a consumer: update the submodule (still mounted at docs/.runtime/underboss)
// to the v3 release, then run this script from the mount:
//
//   node docs/.runtime/underboss/core/migrate/v2-to-v3.mjs [--project <path>]
//        [--implemented <spec-id,...>] [--dry-run]
//
// Every precondition and every transformation is planned before anything is written;
// a project that fails any check is left untouched. Zero dependencies.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmdirSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const OLD_MOUNT = 'docs/.runtime/underboss';
const NEW_MOUNT = 'docs/.control';
const ENTITY_IDS = { 'runtime-agentic-layer': 'agentic-layer', runtime: 'core', 'state-machine': 'installation-state-machine' };
const API_DIRS = ['drafts', 'review', 'approved', 'implemented', 'superseded'];
const API_STATUS = { draft: 'active', review: 'active', approved: 'active', implemented: 'active', superseded: 'deprecated', active: 'active', deprecated: 'deprecated' };
const REF_FIELDS = ['entity_refs', 'implements', 'depends_on'];

export class MigrationError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.errors = errors;
  }
}

const posix = (p) => p.split(sep).join('/');

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

// ---------- documents ----------

function splitDoc(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { nl, fm: null, body: lines };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { nl, fm: null, body: lines };
  return { nl, fm: lines.slice(1, end), body: lines.slice(end + 1) };
}

function joinDoc(d) {
  return ['---', ...d.fm, '---', ...d.body].join(d.nl);
}

function fmValue(d, key) {
  const line = (d.fm || []).find((l) => l.startsWith(`${key}:`));
  return line === undefined ? null : line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

function setFm(d, key, value) {
  const i = d.fm.findIndex((l) => l.startsWith(`${key}:`));
  if (i < 0) return false;
  d.fm[i] = `${key}: ${value}`;
  return true;
}

function rewriteRefs(d) {
  let changed = false;
  let current = null;
  d.fm = d.fm.map((line) => {
    const key = /^([A-Za-z_]+):/.exec(line);
    if (key) current = key[1];
    if (!REF_FIELDS.includes(current)) return line;
    const map = (tok) => (tok in ENTITY_IDS ? ENTITY_IDS[tok] : tok);
    const inline = /^([A-Za-z_]+:\s*\[)(.*)(\]\s*)$/.exec(line);
    if (inline) {
      const out = inline[2].split(',').map((t) => {
        const m = /^(\s*)(["']?)([^"']*?)(\2)(\s*)$/.exec(t);
        return m ? `${m[1]}${m[2]}${map(m[3])}${m[4]}${m[5]}` : t;
      }).join(',');
      if (out !== inline[2]) changed = true;
      return `${inline[1]}${out}${inline[3]}`;
    }
    const block = /^(\s+-\s+)(.+?)(\s*)$/.exec(line);
    if (block && map(block[2]) !== block[2]) { changed = true; return `${block[1]}${map(block[2])}${block[3]}`; }
    return line;
  });
  return changed;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------- backlog ----------

const ITEM = /^(\s*)- \[([ xX-])\]\s?(.*)$/;

export function splitBacklog(files) {
  // files: [{ path, text }] in processing order. Returns { open, closed, errors }.
  const open = [];
  const closed = [];
  const errors = [];
  for (const f of files) {
    let inDone = false;
    let inComment = false;
    let last = null;
    f.text.split(/\r?\n/).forEach((line, i) => {
      if (inComment) { if (line.includes('-->')) inComment = false; return; }
      const t = line.trim();
      if (t.startsWith('<!--')) { if (!t.includes('-->')) inComment = true; return; }
      if (t === '') return;
      const heading = /^#{1,6}\s+(.*)$/.exec(t);
      if (heading) { inDone = /^done\b/i.test(heading[1].replace(/<!--.*?-->/g, '').trim()); last = null; return; }
      const item = ITEM.exec(line);
      if (item) {
        const marker = item[2] === 'X' ? 'x' : item[2];
        const text = `- [${inDone && marker === ' ' ? 'x' : marker}] ${item[3]}`.trimEnd();
        last = { lines: [text] };
        (!inDone && marker === ' ' ? open : closed).push(last);
        return;
      }
      if (last && /^\s{2,}\S/.test(line)) { last.lines.push(line.replace(/\s+$/, '')); return; }
      errors.push(`${f.path}:${i + 1}: not a backlog item, heading or comment; move it out of the backlog first: ${t.slice(0, 60)}`);
    });
  }
  return { open, closed, errors };
}

function backlogDoc(d, id, title, intro, items) {
  const fm = d.fm.map((l) => (l.startsWith('id:') ? `id: ${id}` : l));
  return [['---', ...fm, '---'].join(d.nl), '', `# Backlog: ${title}`, '', intro, '', ...items.flatMap((x) => x.lines)].join(d.nl) + d.nl;
}

// ---------- the plan ----------

export function plan(project, { implemented = [] } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  const has = (rel) => existsSync(join(project, rel));
  const read = (rel) => readFileSync(join(project, rel), 'utf8');

  // source state: a clean v2 installation whose control layer is already the v3 release
  let top = null;
  try { top = resolve(git(project, ['rev-parse', '--show-toplevel']).trim()); } catch { err(`${project} is not a git checkout`); }
  if (top && resolve(project).toLowerCase() !== top.toLowerCase()) err(`${project} is not the root of its git checkout (${top})`);
  if (has(NEW_MOUNT) && !has('docs/.runtime')) err('already v3: docs/.control is mounted and there is no docs/.runtime; nothing to migrate');
  else if (has(NEW_MOUNT) && has('docs/.runtime')) err('inconsistent state: both docs/.control and docs/.runtime exist; resolve it by hand');
  else if (!has(OLD_MOUNT)) err(`not a v2 installation: ${OLD_MOUNT} does not exist`);
  if (has('.gitmodules') && !read('.gitmodules').includes(`path = ${OLD_MOUNT}`) && has(OLD_MOUNT)) err(`.gitmodules does not register ${OLD_MOUNT} as a submodule`);
  if (has(OLD_MOUNT)) {
    const reg = `${OLD_MOUNT}/core/registry.yaml`;
    if (!has(reg) || !/^control:/m.test(read(reg))) err(`the control layer mounted at ${OLD_MOUNT} is not the v3 release; update the submodule first`);
    if (!has(`${OLD_MOUNT}/bootstrap/bootstrap.sh`)) err(`${OLD_MOUNT}/bootstrap/bootstrap.sh is missing`);
  }
  if (!has('.context')) err('.context/ is missing: not a complete v2 installation');
  if (!has('docs')) err('docs/ is missing: not a complete v2 installation');
  if (top && spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: project, encoding: 'utf8' }).stdout.trim() !== '') err('the working tree has uncommitted changes to tracked files; commit or stash them first');
  if (errors.length) throw new MigrationError(errors);

  const writes = new Map(); // final relative path -> content
  const moves = []; // [from, to]
  const removes = [];
  const reached = new Set();

  const docs = walk(join(project, 'docs')).map((p) => posix(relative(project, p)))
    .filter((r) => r.endsWith('.md') && !r.startsWith('docs/.runtime/') && !r.startsWith('docs/.control/'));

  const stage = (rel, to, d) => {
    const dest = to || rel;
    if (reached.has(dest)) err(`two sources would become ${dest}`);
    reached.add(dest);
    if (to && to !== rel) {
      if (has(to)) err(`${to} already exists; cannot move ${rel} onto it`);
      moves.push([rel, to]);
    }
    writes.set(dest, joinDoc(d));
  };

  // spec review -> drafts; the owner's explicit list of realized specs -> implemented
  const implementedIds = new Set(implemented);
  const seenImplemented = new Set();
  for (const rel of docs) {
    const d = splitDoc(read(rel));
    let to = null;
    let changed = false;
    if (d.fm) {
      if (rewriteRefs(d)) changed = true;
      const type = fmValue(d, 'type');
      if (rel.startsWith('docs/specs/review/') && rel.split('/').length === 4) {
        if (!setFm(d, 'status', 'draft')) err(`${rel}: no status line to set to draft`);
        to = `docs/specs/drafts/${basename(rel)}`;
        changed = true;
      } else if (rel.startsWith('docs/specs/approved/') && implementedIds.has(fmValue(d, 'id'))) {
        setFm(d, 'status', 'implemented');
        to = `docs/specs/implemented/${basename(rel)}`;
        seenImplemented.add(fmValue(d, 'id'));
        changed = true;
      } else if (type === 'api') {
        const status = fmValue(d, 'status');
        if (!(status in API_STATUS)) err(`${rel}: api status '${status}' has no mapping`);
        else if (API_STATUS[status] !== status) { setFm(d, 'status', API_STATUS[status]); changed = true; }
        const parts = rel.split('/');
        if (parts.length >= 4 && parts[1] === 'api' && API_DIRS.includes(parts[2])) { to = `docs/api/${basename(rel)}`; changed = true; }
      }
    } else if (rel.startsWith('docs/specs/review/')) err(`${rel}: no frontmatter`);
    if (changed) stage(rel, to, d);
  }
  for (const id of implementedIds) if (!seenImplemented.has(id)) err(`--implemented ${id}: no such Spec in docs/specs/approved/`);
  if (has('docs/specs/review')) {
    for (const p of walk(join(project, 'docs', 'specs', 'review'))) {
      const rel = posix(relative(project, p));
      if (!rel.endsWith('.md') || rel.split('/').length !== 4) err(`${rel}: unexpected file under docs/specs/review/`);
    }
  }

  // backlog: open items -> active.md, everything else -> archive.md
  const blDir = join(project, 'docs', 'backlog');
  if (existsSync(blDir)) {
    const names = readdirSync(blDir).sort();
    for (const n of names) if (!n.endsWith('.md') && n !== '.gitkeep') err(`docs/backlog/${n}: only markdown backlog files can be migrated`);
    const mds = names.filter((n) => n.endsWith('.md'));
    const order = [...mds.filter((n) => n === 'active.md'), ...mds.filter((n) => n !== 'active.md')];
    if (order.length) {
      const sources = order.map((n) => {
        const d = splitDoc(read(`docs/backlog/${n}`));
        return { path: `docs/backlog/${n}`, text: d.body.join('\n') };
      });
      const { open, closed, errors: be } = splitBacklog(sources);
      be.forEach(err);
      const first = splitDoc(read(sources[0].path));
      if (!first.fm) err(`${sources[0].path}: no frontmatter`);
      else {
        writes.set('docs/backlog/active.md', backlogDoc(first, fmValue(first, 'id') || 'backlog-active', 'active',
          'Open actionable work only. A finished, cancelled, deferred, dropped or superseded item moves to `archive.md`.', open));
        writes.set('docs/backlog/archive.md', backlogDoc(first, 'backlog-archive', 'archive',
          'Everything that is not open work. `[x]` completed; `[-]` cancelled, deferred, dropped or superseded.', closed));
        for (const n of mds) if (n !== 'active.md' && n !== 'archive.md') removes.push(`docs/backlog/${n}`);
      }
    }
  }

  // generated files that name the old mount are regenerated by bootstrap
  const regen = [];
  if (has('.context/boundaries.yml')) regen.push('.context/boundaries.yml');
  if (has('.github/workflows/docs-validate.yml') && read('.github/workflows/docs-validate.yml').includes('docs/.runtime')) regen.push('.github/workflows/docs-validate.yml');
  const sectionEdits = [];
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    if (!has(f)) continue;
    const text = read(f);
    const lines = text.split(/\r?\n/);
    if (f === 'CLAUDE.md' && lines[0] === '# CLAUDE.md — AI Agent Quickstart') { regen.push(f); continue; }
    const start = lines.findIndex((l) => /^## Documentation Runtime\s*$/.test(l));
    if (start < 0) continue;
    let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
    if (end < 0) end = lines.length;
    const rest = [...lines.slice(0, start), ...lines.slice(end)].join(text.includes('\r\n') ? '\r\n' : '\n');
    if (rest.trim() === '') regen.push(f); else sectionEdits.push([f, rest.replace(/^\s+/, '')]);
  }

  if (errors.length) throw new MigrationError(errors);
  return { project, moves, writes, removes, regen, sectionEdits, mount: [OLD_MOUNT, NEW_MOUNT] };
}

export function describe(p) {
  const out = [`move ${OLD_MOUNT} -> ${NEW_MOUNT}`];
  for (const [a, b] of p.moves) out.push(`move ${a} -> ${b}`);
  for (const w of [...p.writes.keys()].sort()) out.push(`write ${w}`);
  for (const r of p.removes) out.push(`remove ${r}`);
  for (const r of p.regen) out.push(`regenerate ${r}`);
  for (const [f] of p.sectionEdits) out.push(`drop the generated section of ${f}`);
  out.push('run bootstrap');
  return out;
}

// ---------- apply ----------

export function apply(p) {
  const { project } = p;
  const abs = (rel) => join(project, rel);
  for (const [from, to] of p.moves) {
    mkdirSync(dirname(abs(to)), { recursive: true });
    git(project, ['mv', from, to]);
  }
  for (const [rel, content] of [...p.writes.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    mkdirSync(dirname(abs(rel)), { recursive: true });
    writeFileSync(abs(rel), content);
    git(project, ['add', '--', rel]);
  }
  for (const rel of p.removes) git(project, ['rm', '-q', '-f', '--', rel]);
  for (const [rel, content] of p.sectionEdits) { writeFileSync(abs(rel), content); git(project, ['add', '--', rel]); }
  for (const rel of p.regen) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: project, stdio: 'ignore' }).status === 0;
    if (tracked) git(project, ['rm', '-q', '-f', '--', rel]); else unlinkSync(abs(rel));
  }
  for (const lifecycle of API_DIRS) {
    const d = abs(`docs/api/${lifecycle}`);
    if (existsSync(d) && readdirSync(d).length === 0) rmdirSync(d);
  }
  const review = abs('docs/specs/review');
  if (existsSync(review) && readdirSync(review).length === 0) rmdirSync(review);

  git(project, ['mv', OLD_MOUNT, NEW_MOUNT]);
  const legacyDir = abs('docs/.runtime');
  if (existsSync(legacyDir) && readdirSync(legacyDir).length === 0) rmdirSync(legacyDir);

  const boot = spawnSync('bash', [posix(abs(`${NEW_MOUNT}/bootstrap/bootstrap.sh`)), '--target', posix(project)], { cwd: project, encoding: 'utf8' });
  if (boot.status !== 0) throw new Error(`bootstrap failed after the transformation: ${(boot.stderr || boot.stdout).trim()}`);
}

// ---------- checks after the transformation ----------

export function verifyResult(project) {
  const errors = [];
  const warnings = [];
  const has = (rel) => existsSync(join(project, rel));
  if (!has(`${NEW_MOUNT}/core/registry.yaml`)) errors.push(`${NEW_MOUNT}/core/registry.yaml is missing`);
  if (has('docs/.runtime')) errors.push('docs/.runtime still exists');
  if (has('docs/specs/review')) errors.push('docs/specs/review still exists');
  if (!/path = docs\/\.control/.test(has('.gitmodules') ? readFileSync(join(project, '.gitmodules'), 'utf8') : '')) errors.push('.gitmodules does not register docs/.control');
  if (!has('.context/boundaries.yml') || statSync(join(project, '.context', 'boundaries.yml')).size === 0) errors.push('.context/boundaries.yml was not regenerated');
  for (const p of walk(project)) {
    const rel = posix(relative(project, p));
    if (rel.startsWith('.git/') || rel.startsWith(`${NEW_MOUNT}/`) || rel === '.gitmodules' || !/\.(md|ya?ml|json|sh|mjs)$/.test(rel)) continue;
    if (readFileSync(p, 'utf8').includes('docs/.runtime')) warnings.push(`${rel} still names docs/.runtime`);
  }
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    if (has(f) && !/^## Underboss\s*$/m.test(readFileSync(join(project, f), 'utf8')) && !readFileSync(join(project, f), 'utf8').includes('AI Agent Quickstart')) warnings.push(`${f} has no Underboss section; add the snippet of bootstrap/generators/claude-md.sh`);
  }
  return { errors, warnings };
}

// ---------- command line ----------

function parse(argv) {
  const o = { project: null, implemented: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--project') o.project = argv[++i];
    else if (a === '--implemented') o.implemented = (argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else throw new MigrationError([`unknown argument '${a}'`]);
    if ((a === '--project' || a === '--implemented') && argv[i] === undefined) throw new MigrationError([`${a} needs a value`]);
  }
  return o;
}

export function main(argv, { cwd = process.cwd(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  try {
    const o = parse(argv);
    let project = o.project ? resolve(cwd, o.project) : null;
    if (!project) {
      const here = posix(dirname(fileURLToPath(import.meta.url)));
      if (!here.endsWith(`${OLD_MOUNT}/core/migrate`)) throw new MigrationError(['pass --project <path>: the script is not running from docs/.runtime/underboss']);
      project = resolve(here, '..', '..', '..', '..', '..');
    }
    const p = plan(project, { implemented: o.implemented });
    if (o.dryRun) { out(`${describe(p).join('\n')}\n`); return 0; }
    apply(p);
    const r = verifyResult(project);
    for (const w of r.warnings) err(`warning: ${w}\n`);
    if (r.errors.length) { err(`migration finished with errors:\n${r.errors.join('\n')}\n`); return 1; }
    out(`migrated to v3: ${describe(p).length} steps\nreview the staged changes and commit them\n`);
    return 0;
  } catch (e) {
    if (e instanceof MigrationError) { err(`v2-to-v3: refused, nothing was changed\n${e.errors.map((m) => `  ${m}`).join('\n')}\n`); return 1; }
    err(`v2-to-v3: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
