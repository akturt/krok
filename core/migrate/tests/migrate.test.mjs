// Tests of the one-time v2 -> v3 migration (core/migrate/v2-to-v3.mjs).
// The v2 fixture is a consumer project whose control layer is mounted at the old path
// (docs/.runtime/underboss) and whose documents, generated files and backlog are in the v2 shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitBacklog } from '../v2-to-v3.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = (p) => p.split('\\').join('/');
const OLD = 'docs/.runtime/underboss';

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'protocol.file.allow=always', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

function put(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const products = new Map();
function product(variant = 'v3') {
  if (products.has(variant)) return products.get(variant);
  const dir = mkdtempSync(join(tmpdir(), `underboss-prod-${variant}-`));
  const files = spawnSync('git', ['ls-files', '-c'], { cwd: REPO, encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  for (const f of files) {
    if (!existsSync(join(REPO, f))) continue;
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(REPO, f), join(dir, f));
  }
  if (variant === 'v2-code') {
    const reg = join(dir, 'core', 'registry.yaml');
    writeFileSync(reg, readFileSync(reg, 'utf8').replace(/^control:/m, 'runtime:'));
  }
  git(dir, 'init', '-q', '-b', 'master', '.');
  git(dir, 'add', '-A');
  git(dir, 'update-index', '--chmod=+x', 'core/bin/underboss');
  git(dir, 'commit', '-q', '-m', 'product');
  products.set(variant, dir);
  return dir;
}

const doc = (o) => `---\nschema: 1\nid: ${o.id}\ntype: ${o.type}\nstatus: ${o.status}\ndate: 2026-07-01\nowners: [t]\n${o.extra || ''}---\n\n${o.body || '# T'}\n`;
const AC = '# S\n\n## Acceptance criteria\n- **AC-001** works\n';

const V2_BACKLOG = `---
schema: 1
id: backlog-active
type: backlog
status: active
date: 2026-07-01
owners: [t]
---

# Backlog: shop

## Active
<!-- Freeform: ideas, TODOs, open questions. -->
- [ ] add search
  with filters
- [x] ship checkout

## In Progress
- [ ] migrate db — @ann

## Done
<!-- Archive of completed ideas. -->
- [x] set up CI → Issue #1
- [ ] stale idea listed under Done
- [-] dropped idea
`;

const V2_CLAUDE = `# Mine

My own notes.

## Documentation Runtime

Documentation Runtime is connected as a Git Submodule: docs/.runtime/underboss

## Other

keep this
`;

function v2Consumer({ variant = 'v3', tweak = () => {}, after = () => {} } = {}) {
  const proj = mkdtempSync(join(tmpdir(), 'underboss-v2-'));
  git(proj, 'init', '-q', '-b', 'main', '.');
  git(proj, 'remote', 'add', 'origin', 'https://example.com/acme/shop.git');
  put(proj, 'README.md', '# shop\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'init');
  mkdirSync(join(proj, 'docs', '.runtime'), { recursive: true });
  git(proj, 'submodule', 'add', '-q', P(product(variant)), OLD);

  put(proj, '.context/project.yml', 'name: shop\nrepository:\n  name: shop\n');
  put(proj, '.context/boundaries.yml', 'pristine:\n  - /\n  - /docs/\n');
  put(proj, '.context/agent-entry.md', 'Underboss lives in docs/.runtime/underboss\n');
  put(proj, '.github/workflows/docs-validate.yml', `name: docs\njobs:\n  v:\n    steps:\n      - run: bash docs/.runtime/underboss/documentation/validation/validate-frontmatter.sh\n`);
  put(proj, 'CLAUDE.md', V2_CLAUDE);
  put(proj, 'docs/architecture/README.md', doc({ id: 'arch', type: 'architecture', status: 'active' }));
  put(proj, 'docs/adr/001-x.md', doc({ id: 'adr-001-x', type: 'adr', status: 'accepted', extra: 'entity_refs: [runtime-agentic-layer, state-machine]\n' }));
  put(proj, 'docs/specs/drafts/a.md', doc({ id: 'spec-a', type: 'spec', status: 'draft', extra: 'entity_refs: [runtime-agentic-layer]\n' }));
  put(proj, 'docs/specs/review/b.md', doc({ id: 'spec-b', type: 'spec', status: 'review', extra: 'entity_refs: [runtime, registry]\nimplements: [adr-001-x]\n' }));
  put(proj, 'docs/specs/approved/c.md', doc({ id: 'spec-c', type: 'spec', status: 'approved', extra: 'entity_refs: [registry]\n', body: AC }));
  put(proj, 'docs/specs/approved/d.md', doc({ id: 'spec-d', type: 'spec', status: 'approved', extra: 'entity_refs: [registry]\n', body: AC }));
  put(proj, 'docs/api/approved/pay.md', doc({ id: 'api-pay', type: 'api', status: 'approved' }));
  put(proj, 'docs/api/superseded/old.md', doc({ id: 'api-old', type: 'api', status: 'superseded' }));
  put(proj, 'docs/api/plain.md', doc({ id: 'api-plain', type: 'api', status: 'active' }));
  put(proj, 'docs/backlog/active.md', V2_BACKLOG);
  tweak(proj);
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'v2 consumer');
  after(proj);
  return proj;
}

function migrate(proj, ...args) {
  const mount = existsSync(join(proj, OLD)) ? OLD : 'docs/.control';
  const r = spawnSync('node', [join(proj, mount, 'core', 'migrate', 'v2-to-v3.mjs'), ...args], { cwd: proj, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const read = (proj, rel) => readFileSync(join(proj, rel), 'utf8');
const fmStatus = (proj, rel) => /^status: (.*)$/m.exec(read(proj, rel))[1].trim();

function snapshot(proj) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      const rel = P(relative(proj, p));
      if (rel === '.git' || rel === '.gitmodules' || rel.startsWith('docs/.control') || rel.startsWith(OLD)) continue;
      // line endings are normalized: git may check files out with CRLF (core.autocrlf)
      if (statSync(p).isDirectory()) walk(p); else out[rel] = readFileSync(p, 'utf8').split('\r\n').join('\n');
    }
  };
  walk(proj);
  return out;
}

function untouched(proj, run, label = '') {
  const head = git(proj, 'rev-parse', 'HEAD');
  const status = git(proj, 'status', '--porcelain');
  const before = snapshot(proj);
  const r = run();
  assert.equal(r.code, 1, `${label}: ${r.out}${r.err}`);
  assert.match(r.err, /refused, nothing was changed/);
  assert.equal(git(proj, 'rev-parse', 'HEAD'), head);
  assert.equal(git(proj, 'status', '--porcelain'), status);
  assert.deepEqual(snapshot(proj), before);
  assert.ok(existsSync(join(proj, OLD)) && !existsSync(join(proj, 'docs', '.control')));
  return r;
}

// ---------- the backlog rule ----------

test('backlog: open items to active, everything else to archive; prose is refused', () => {
  const { open, closed, errors } = splitBacklog([{ path: 'a.md', text: V2_BACKLOG.split('---\n\n')[1] }]);
  assert.deepEqual(open.map((x) => x.lines[0]), ['- [ ] add search', '- [ ] migrate db — @ann']);
  assert.deepEqual(open[0].lines, ['- [ ] add search', '  with filters']);
  assert.deepEqual(closed.map((x) => x.lines[0]), ['- [x] ship checkout', '- [x] set up CI → Issue #1', '- [x] stale idea listed under Done', '- [-] dropped idea']);
  assert.deepEqual(errors, []);
  assert.match(splitBacklog([{ path: 'b.md', text: '# t\nsome prose\n' }]).errors[0], /b\.md:2: not a backlog item/);
});

// ---------- refusals leave the project untouched ----------

test('refusal: dry run prints the plan and changes nothing', () => {
  const proj = v2Consumer();
  const head = git(proj, 'rev-parse', 'HEAD');
  const before = snapshot(proj);
  const r = migrate(proj, '--dry-run', '--implemented', 'spec-c');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^move docs\/\.runtime\/underboss -> docs\/\.control$/m);
  assert.match(r.out, /^move docs\/specs\/review\/b\.md -> docs\/specs\/drafts\/b\.md$/m);
  assert.match(r.out, /^move docs\/api\/approved\/pay\.md -> docs\/api\/pay\.md$/m);
  assert.match(r.out, /^regenerate \.context\/boundaries\.yml$/m);
  assert.equal(git(proj, 'rev-parse', 'HEAD'), head);
  assert.equal(git(proj, 'status', '--porcelain').trim(), '');
  assert.deepEqual(snapshot(proj), before);
});

test('refusal: a dirty working tree, a v2 control layer, a missing .context, an unknown spec, prose in the backlog, a collision, an unmapped api status', () => {
  const dirty = v2Consumer();
  writeFileSync(join(dirty, 'README.md'), '# changed\n');
  assert.match(untouched(dirty, () => migrate(dirty), 'dirty').err, /uncommitted changes/);

  const old = v2Consumer({ variant: 'v2-code' });
  assert.match(untouched(old, () => migrate(old, '--project', old), 'old').err, /not the v3 release/);

  const noCtx = v2Consumer({ tweak: (p) => rmSync(join(p, '.context'), { recursive: true, force: true }) });
  assert.match(untouched(noCtx, () => migrate(noCtx), 'noCtx').err, /\.context\/ is missing/);

  const unknown = v2Consumer();
  assert.match(untouched(unknown, () => migrate(unknown, '--implemented', 'spec-zzz'), 'unknown').err, /no such Spec/);

  const prose = v2Consumer({ tweak: (p) => put(p, 'docs/backlog/active.md', `${V2_BACKLOG}\nfree prose that is no item\n`) });
  assert.match(untouched(prose, () => migrate(prose), 'prose').err, /not a backlog item/);

  const clash = v2Consumer({ tweak: (p) => put(p, 'docs/specs/drafts/b.md', doc({ id: 'spec-b2', type: 'spec', status: 'draft', extra: 'entity_refs: [registry]\n' })) });
  assert.match(untouched(clash, () => migrate(clash), 'clash').err, /already exists/);

  const api = v2Consumer({ tweak: (p) => put(p, 'docs/api/odd.md', doc({ id: 'api-odd', type: 'api', status: 'proposed' })) });
  assert.match(untouched(api, () => migrate(api), 'api').err, /api status 'proposed' has no mapping/);

  const argument = v2Consumer();
  assert.match(untouched(argument, () => migrate(argument, '--bogus'), 'argument').err, /unknown argument/);
});

test('refusal: both mounts, and no installation at all', () => {
  const both = v2Consumer({ tweak: (p) => { mkdirSync(join(p, 'docs', '.control'), { recursive: true }); put(p, 'docs/.control/x', 'x'); } });
  const r = migrate(both);
  assert.equal(r.code, 1);
  assert.match(r.err, /both docs\/\.control and docs\/\.runtime exist/);

  const none = mkdtempSync(join(tmpdir(), 'underboss-none-'));
  git(none, 'init', '-q', '-b', 'main', '.');
  const n = spawnSync('node', [join(REPO, 'core', 'migrate', 'v2-to-v3.mjs'), '--project', none], { encoding: 'utf8' });
  assert.equal(n.status, 1);
  assert.match(n.stderr, /not a v2 installation/);
  const notGit = mkdtempSync(join(tmpdir(), 'underboss-notgit-'));
  const g = spawnSync('node', [join(REPO, 'core', 'migrate', 'v2-to-v3.mjs'), '--project', notGit], { encoding: 'utf8' });
  assert.equal(g.status, 1);
  assert.match(g.stderr, /not a git checkout/);
  const lost = spawnSync('node', [join(REPO, 'core', 'migrate', 'v2-to-v3.mjs')], { encoding: 'utf8' });
  assert.equal(lost.status, 1);
  assert.match(lost.stderr, /pass --project/);
});

// ---------- the migration ----------

test('migration: v2 becomes v3 exactly as the Migration Contract says; a second run is refused', () => {
  const proj = v2Consumer();
  const r = migrate(proj, '--implemented', 'spec-c');
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /migrated to v3/);

  // mount: .control and core/, no old layout
  assert.ok(existsSync(join(proj, 'docs', '.control', 'core', 'registry.yaml')));
  assert.ok(!existsSync(join(proj, 'docs', '.runtime')));
  assert.match(read(proj, '.gitmodules'), /path = docs\/\.control/);
  assert.doesNotMatch(read(proj, '.gitmodules'), /path = docs\/\.runtime/);
  assert.match(git(proj, 'submodule', 'status'), /docs\/\.control/);
  assert.match(git(proj, 'ls-files', '-s', 'docs/.control'), /^160000/);

  // spec review -> drafts (status draft, never approved); owner's list -> implemented
  assert.ok(!existsSync(join(proj, 'docs', 'specs', 'review')));
  assert.equal(fmStatus(proj, 'docs/specs/drafts/b.md'), 'draft');
  assert.equal(fmStatus(proj, 'docs/specs/drafts/a.md'), 'draft');
  assert.equal(fmStatus(proj, 'docs/specs/implemented/c.md'), 'implemented');
  assert.equal(fmStatus(proj, 'docs/specs/approved/d.md'), 'approved');

  // api: two statuses, no lifecycle directories
  assert.deepEqual(readdirSync(join(proj, 'docs', 'api')).sort(), ['old.md', 'pay.md', 'plain.md']);
  assert.equal(fmStatus(proj, 'docs/api/pay.md'), 'active');
  assert.equal(fmStatus(proj, 'docs/api/old.md'), 'deprecated');
  assert.equal(fmStatus(proj, 'docs/api/plain.md'), 'active');

  // renamed ids rewritten
  assert.match(read(proj, 'docs/adr/001-x.md'), /^entity_refs: \[agentic-layer, installation-state-machine\]$/m);
  assert.match(read(proj, 'docs/specs/drafts/b.md'), /^entity_refs: \[core, registry\]$/m);
  assert.match(read(proj, 'docs/specs/drafts/a.md'), /^entity_refs: \[agentic-layer\]$/m);

  // backlog
  const active = read(proj, 'docs/backlog/active.md');
  const archive = read(proj, 'docs/backlog/archive.md');
  assert.deepEqual(active.match(/^- \[.\]/gm), ['- [ ]', '- [ ]']);
  assert.match(active, /- \[ \] add search\n  with filters/);
  assert.match(active, /- \[ \] migrate db — @ann/);
  assert.deepEqual(archive.match(/^- \[.\]/gm), ['- [x]', '- [x]', '- [x]', '- [-]']);
  assert.match(archive, /^id: backlog-archive$/m);

  // generated files regenerated by bootstrap from the v3 generators
  const boundaries = read(proj, '.context/boundaries.yml');
  assert.match(boundaries, /pristine:\n    - path: docs\/\.control\//);
  assert.doesNotMatch(boundaries, /^\s*- \/\s*$/m);
  const ci = read(proj, '.github/workflows/docs-validate.yml');
  assert.match(ci, /docs\/\.control\/documentation\/validation\/validate-lifecycle\.mjs/);
  assert.doesNotMatch(ci, /docs\/\.runtime/);
  const claude = read(proj, 'CLAUDE.md');
  assert.doesNotMatch(claude, /Documentation Runtime/);
  assert.match(claude, /# Mine\n\nMy own notes\./);
  assert.match(claude, /## Other\n\nkeep this/);
  assert.equal(r.err, ''); // no warnings: every v2 remnant in a generated file is gone
  assert.match(read(proj, '.context/agent-entry.md'), /docs\/\.control/);
  assert.doesNotMatch(read(proj, '.context/agent-entry.md'), /docs\/\.runtime/);
  assert.match(claude, /^## Underboss$/m);
  assert.match(claude, /docs\/\.control\/core\/bin\/underboss/);

  // the validators of the new mount pass on the migrated project
  const ctl = join(proj, 'docs', '.control', 'documentation', 'validation');
  const sh = (cmd, args) => spawnSync(cmd, args, { cwd: proj, encoding: 'utf8' });
  assert.equal(sh('bash', [P(join(ctl, 'validate-frontmatter.sh')), 'docs']).status, 0, sh('bash', [P(join(ctl, 'validate-frontmatter.sh')), 'docs']).stdout);
  assert.equal(sh('node', [join(ctl, 'validate-lifecycle.mjs'), 'docs']).status, 0, sh('node', [join(ctl, 'validate-lifecycle.mjs'), 'docs']).stdout);
  assert.equal(sh('node', [join(ctl, 'validate-backlog.mjs'), 'docs']).status, 0);
  assert.equal(sh('node', [join(ctl, 'validate-execution.mjs'), proj]).status, 0);

  // installation state is v3 and the Control Plane CLI runs against the project
  const state = sh('bash', ['-c', `export CONTROL_ROOT="${P(join(proj, 'docs', '.control'))}" TARGET="${P(proj)}"; source "$CONTROL_ROOT/core/lib/api.sh"; detect_state`]);
  assert.match(state.stdout.trim(), /^installed /);
  const status = sh('bash', [P(join(proj, 'docs', '.control', 'core', 'bin', 'underboss')), 'status', '--json']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).backlog.active, 2);

  // no file of the project names the old mount
  for (const [rel, text] of Object.entries(snapshot(proj))) assert.doesNotMatch(text, /docs\/\.runtime/, rel);

  // a project that is already v3 is refused, not "helped"
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'migrated');
  const after = snapshot(proj);
  const again = migrate(proj, '--project', proj);
  assert.equal(again.code, 1);
  assert.match(again.err, /already v3/);
  assert.deepEqual(snapshot(proj), after);
  assert.equal(git(proj, 'status', '--porcelain').trim(), '');
});

test('migration: deterministic - two identical v2 projects give identical v3 projects', () => {
  const a = v2Consumer();
  const b = v2Consumer();
  assert.equal(migrate(a, '--implemented', 'spec-c').code, 0);
  assert.equal(migrate(b, '--implemented', 'spec-c').code, 0);
  assert.deepEqual(snapshot(a), snapshot(b));
});

test('all or nothing: a failure while applying rolls everything back, including untracked files', () => {
  const proj = v2Consumer({
    // an untracked Spec in review/ passes the plan but cannot be moved by git: the failure
    // happens after other files were already moved
    after: (p) => {
      put(p, 'docs/specs/review/loose.md', doc({ id: 'spec-loose', type: 'spec', status: 'review', extra: 'entity_refs: [registry]\n' }));
      put(p, 'scratch.txt', 'mine\n');
    },
  });
  const head = git(proj, 'rev-parse', 'HEAD');
  const status = git(proj, 'status', '--porcelain');
  const submodules = git(proj, 'submodule', 'status');
  const gitmodules = read(proj, '.gitmodules');
  const before = snapshot(proj);
  const r = migrate(proj);
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.err, /failed and rolled back; the project is as it was before/);
  assert.equal(git(proj, 'rev-parse', 'HEAD'), head);
  assert.equal(git(proj, 'status', '--porcelain'), status);
  assert.equal(git(proj, 'submodule', 'status'), submodules);
  assert.equal(read(proj, '.gitmodules'), gitmodules);
  assert.deepEqual(snapshot(proj), before);
  assert.ok(existsSync(join(proj, OLD, 'core', 'registry.yaml')));
  assert.ok(!existsSync(join(proj, 'docs', '.control')));
  assert.equal(git(join(proj, OLD), 'rev-parse', 'HEAD').trim().length, 40); // the submodule is intact
  assert.ok(existsSync(join(proj, 'docs', 'api', 'approved', 'pay.md')) && !existsSync(join(proj, 'docs', 'api', 'pay.md')));
  assert.equal(read(proj, 'scratch.txt'), 'mine\n');
});
