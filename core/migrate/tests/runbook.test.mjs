// Tests of the canonical runbook INSTALL.md: its detection snippet and its three flows are run
// as written, against real git repositories with the control layer as a real submodule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = (p) => p.split('\\').join('/');
const RUNBOOK = readFileSync(join(REPO, 'INSTALL.md'), 'utf8').split('\r\n').join('\n');
const URL = 'https://github.com/akturt/underboss.git';

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'protocol.file.allow', GIT_CONFIG_VALUE_0: 'always',
};

function sh(cwd, cmd) {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env: ENV });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function ok(cwd, cmd) {
  const r = sh(cwd, cmd);
  assert.equal(r.code, 0, `${cmd}\n${r.out}${r.err}`);
  return r.out;
}

function put(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// ---------- the runbook text ----------

function block(startMarker) {
  const i = RUNBOOK.indexOf(startMarker);
  assert.ok(i >= 0, `runbook has no ${startMarker}`);
  const open = RUNBOOK.indexOf('```bash\n', i);
  const rest = RUNBOOK.slice(open + 8);
  const close = rest.search(/\n[ ]*```/);
  return rest.slice(0, close);
}

const DETECT = (() => {
  const m = /bash <<'DETECT'\n([\s\S]*?)\nDETECT\n/.exec(RUNBOOK);
  assert.ok(m, 'runbook has no detection snippet');
  return m[1];
})();

function commands(snippet) {
  return snippet.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function has(cmd) {
  assert.ok(RUNBOOK.includes(cmd), `the runbook no longer contains: ${cmd}`);
}

function detect(cwd) {
  const r = spawnSync('bash', ['-s'], { cwd, input: DETECT, encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function repo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'underboss-rb-'));
  ok(dir, 'git init -q -b main .');
  put(dir, 'README.md', '# x\n');
  for (const [rel, c] of Object.entries(files)) put(dir, rel, c);
  ok(dir, 'git add -A && git commit -q -m init');
  return dir;
}

test('runbook: it is the one entry point, with the three flows and the agent section', () => {
  for (const h of ['## For an AI coding agent', '## A. Install v3', '## B. Update v3', '## C. Migrate v2 → v3', '## Verification']) assert.ok(RUNBOOK.includes(h), h);
  assert.ok(RUNBOOK.includes('Installation/update complete when:'));
  assert.match(RUNBOOK, /already v3/);
  assert.match(RUNBOOK, /--dry-run/);
  assert.match(RUNBOOK, /never guess/);
  assert.equal(existsSync(join(REPO, 'playbook', 'install-remote-prompt.md')), false, 'no competing installation prompt');
  assert.match(readFileSync(join(REPO, 'bootstrap', 'DEPLOY-PROMPT.md'), 'utf8'), /INSTALL\.md/);
});

test('detection: every repository state maps to exactly one verdict', () => {
  const notGit = mkdtempSync(join(tmpdir(), 'underboss-rb-nogit-'));
  assert.equal(detect(notGit), 'STOP not a git repository');
  assert.equal(detect(repo()), 'INSTALL');

  const v3 = (version) => repo({ 'docs/.control/core/registry.yaml': `control:\n  name: Underboss\n  version: "${version}"\n\nbootstrap:\n  engine_version: "2.0"\n` });
  assert.equal(detect(v3('3.0.0')), 'UPDATE 3.0.0');
  assert.equal(detect(v3('3.4.1')), 'UPDATE 3.4.1');
  assert.match(detect(v3('4.0.0')), /^STOP docs\/\.control has an unexpected version '4\.0\.0'/);
  assert.match(detect(v3('2.0.0')), /^STOP docs\/\.control has an unexpected version/);

  assert.match(detect(repo({ 'docs/.control/x': 'x' })), /^STOP docs\/\.control exists without core\/registry\.yaml/);
  assert.match(detect(repo({ 'docs/.control/core/registry.yaml': 'control:\n  version: "3.0.0"\n', 'docs/.runtime/x': 'x' })), /^STOP both/);

  assert.equal(detect(repo({ 'docs/.runtime/underboss/runtime/registry.yaml': 'runtime:\n  name: Underboss\n  version: "2.0.0"\n' })), 'MIGRATE v2 2.0.0 (update the submodule to v3 first)');
  assert.equal(detect(repo({ 'docs/.runtime/underboss/core/registry.yaml': 'control:\n  version: "3.0.0"\n' })), 'MIGRATE v2 (control layer already v3 code: run the migration)');
  assert.match(detect(repo({ 'docs/.runtime/underboss/x': 'x' })), /^STOP docs\/\.runtime\/underboss has no registry/);
  assert.match(detect(repo({ '.context/runtime/underboss/x': 'x' })), /^STOP unsupported layout/);
});

// ---------- a product repository with history ----------

function productRepo({ v2First = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'underboss-rbprod-'));
  const files = spawnSync('git', ['ls-files', '-c'], { cwd: REPO, encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  const copy = () => {
    for (const f of files) {
      if (!existsSync(join(REPO, f))) continue;
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(REPO, f), join(dir, f));
    }
  };
  ok(dir, 'git init -q -b master .');
  copy();
  if (v2First) {
    // the v2 product: the control layer lived in runtime/ and its Registry had the runtime: key
    renameSync(join(dir, 'core'), join(dir, 'runtime'));
    const reg = join(dir, 'runtime', 'registry.yaml');
    writeFileSync(reg, readFileSync(reg, 'utf8').replace(/^control:/m, 'runtime:').replace('version: "3.0.0"', 'version: "2.0.0"'));
  }
  ok(dir, `git add -A && git update-index --chmod=+x ${v2First ? 'runtime' : 'core'}/bin/underboss && git commit -q -m first`);
  const first = ok(dir, 'git rev-parse HEAD').trim();
  if (v2First) rmSync(join(dir, 'runtime'), { recursive: true, force: true });
  copy(); // second revision: the v3 control layer, plus one changed file
  put(dir, 'knowledge/CHANGELOG-test.md', '---\nschema: 1\nid: changelog-test\ntype: guide\nkind: index\nstatus: active\ndate: 2026-10-04\nowners: [t]\n---\n\n# t\n');
  ok(dir, 'git add -A && git commit -q -m second');
  return { dir, first };
}

const VERIFY = commands(block('Run from the repository root after any flow'));

function verify(proj) {
  const results = [];
  for (const cmd of VERIFY) {
    const r = sh(proj, cmd);
    results.push({ cmd, ...r });
    if (cmd.startsWith('git grep')) assert.equal(r.out.trim(), '', `leftover old paths: ${r.out}`);
    else assert.equal(r.code, 0, `${cmd}\n${r.out}${r.err}`);
  }
  assert.ok(results.some((r) => /installed 3\./.test(r.out)), 'installation state is installed 3.x');
  return results;
}

test('flow A then B: install from scratch, then update, exactly as the runbook says', () => {
  const product = productRepo();
  const proj = repo();
  ok(proj, 'git remote add origin https://example.com/acme/shop.git');
  assert.equal(detect(proj), 'INSTALL');

  // A. install (the runbook's commands, with the product URL pointing at the local product repository)
  const a = commands(block('Mount the submodule'));
  for (const c of a) has(c);
  ok(proj, a[0].replace(URL, P(product.dir)));
  ok(proj, `git -C docs/.control checkout -q ${product.first}`); // start from the older revision, so flow B has something to update to
  for (const c of a.slice(1)) ok(proj, c);
  const bootstrap = commands(block('Run bootstrap'))[0];
  has(bootstrap);
  ok(proj, bootstrap);
  writeFileSync(join(proj, '.context', 'project.yml'), 'name: shop\nrepository:\n  name: shop\n');
  assert.equal(detect(proj), 'UPDATE 3.0.0');
  verify(proj);
  ok(proj, 'git add -A docs .context .github CLAUDE.md && git commit -q -m "chore: install Underboss"');
  assert.match(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), /INSTALL\.md/);

  // B. update: a new revision of the product appears; the user's files must survive
  const owned = { project: readFileSync(join(proj, '.context', 'project.yml'), 'utf8'), claude: readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), boundaries: readFileSync(join(proj, '.context', 'boundaries.yml'), 'utf8') };
  const before = ok(proj, 'git -C docs/.control rev-parse HEAD').trim();
  assert.equal(ok(proj, 'git status --porcelain --untracked-files=no').trim(), '');
  const update = commands(block('Update the submodule'))[0];
  has(update);
  ok(proj, update);
  assert.notEqual(ok(proj, 'git -C docs/.control rev-parse HEAD').trim(), before);
  assert.match(ok(proj, 'git status --porcelain --untracked-files=no'), /docs\/\.control/);
  ok(proj, bootstrap);
  verify(proj);
  assert.equal(readFileSync(join(proj, '.context', 'project.yml'), 'utf8'), owned.project);
  assert.equal(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), owned.claude);
  assert.equal(readFileSync(join(proj, '.context', 'boundaries.yml'), 'utf8'), owned.boundaries);
  ok(proj, 'git add docs/.control && git commit -q -m "chore: update Underboss"');
  assert.equal(detect(proj), 'UPDATE 3.0.0');
});

test('flow C: v2 -> v3 exactly as the runbook says, from the real v2 state to a clean v3', () => {
  const product = productRepo({ v2First: true });
  const proj = repo();
  ok(proj, 'git remote add origin https://example.com/acme/shop.git');
  // the v2 consumer: control layer mounted at the old path, at the v2 revision
  ok(proj, `mkdir -p docs/.runtime && git submodule add -q ${P(product.dir)} docs/.runtime/underboss`);
  ok(proj, `git -C docs/.runtime/underboss checkout -q ${product.first}`);
  ok(proj, 'git config -f .gitmodules submodule."docs/.runtime/underboss".branch master');
  put(proj, '.context/project.yml', 'name: shop\nrepository:\n  name: shop\n');
  put(proj, '.context/boundaries.yml', 'pristine:\n  - /\n');
  put(proj, 'docs/architecture/README.md', '---\nschema: 1\nid: arch\ntype: architecture\nstatus: active\ndate: 2026-07-01\nowners: [t]\n---\n\n# A\n');
  put(proj, 'docs/specs/review/b.md', '---\nschema: 1\nid: spec-b\ntype: spec\nstatus: review\ndate: 2026-07-01\nowners: [t]\nentity_refs: [runtime]\n---\n\n# B\n');
  put(proj, 'docs/backlog/active.md', '---\nschema: 1\nid: backlog-active\ntype: backlog\nstatus: active\ndate: 2026-07-01\nowners: [t]\n---\n\n## Active\n- [ ] one\n## Done\n- [x] two\n');
  ok(proj, 'git add -A && git commit -q -m "v2 consumer"');

  assert.equal(detect(proj), 'MIGRATE v2 2.0.0 (update the submodule to v3 first)');

  // step 2: update the submodule to v3 and commit the pointer
  const step2 = commands(block('Update the submodule to v3'));
  for (const c of step2) has(c);
  for (const c of step2) ok(proj, c);
  assert.equal(detect(proj), 'MIGRATE v2 (control layer already v3 code: run the migration)');
  assert.equal(ok(proj, 'git status --porcelain --untracked-files=no').trim(), '');

  // step 3 and 4: dry run, then apply
  const dry = commands(block('Dry run'))[0];
  const apply = commands(block('**Apply.**'))[0];
  has(dry);
  has('node docs/.runtime/underboss/core/migrate/v2-to-v3.mjs [--implemented spec-id,spec-id]');
  const planned = ok(proj, dry);
  assert.match(planned, /move docs\/\.runtime\/underboss -> docs\/\.control/);
  assert.ok(existsSync(join(proj, 'docs', '.runtime', 'underboss')) && !existsSync(join(proj, 'docs', '.control')));
  const done = sh(proj, dry.replace(' --dry-run', ''));
  assert.equal(done.code, 0, done.out + done.err);
  assert.match(done.out, /migrated to v3/);
  assert.equal(done.err.trim(), ''); // no warnings: nothing user-owned names the old mount
  assert.ok(apply.length > 0);

  verify(proj);
  assert.equal(detect(proj), 'UPDATE 3.0.0');
  assert.ok(existsSync(join(proj, 'docs', 'specs', 'drafts', 'b.md')));
  assert.match(readFileSync(join(proj, 'docs', 'specs', 'drafts', 'b.md'), 'utf8'), /^entity_refs: \[core\]$/m);
  assert.match(readFileSync(join(proj, 'docs', 'backlog', 'archive.md'), 'utf8'), /- \[x\] two/);

  // step 7: review and commit; afterwards the migration is refused
  ok(proj, 'git add -A docs .context .github CLAUDE.md .gitmodules && git commit -q -m "chore: migrate Underboss v2 to v3"');
  const again = sh(proj, 'node docs/.control/core/migrate/v2-to-v3.mjs');
  assert.equal(again.code, 1);
  assert.match(again.err, /already v3/);
  assert.equal(ok(proj, 'git status --porcelain --untracked-files=no').trim(), '');
});
