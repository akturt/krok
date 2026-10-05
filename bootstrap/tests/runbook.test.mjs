// Tests of the canonical runbook INSTALL.md: its detection snippet and its two flows are run
// as written, against real git repositories with the control layer as a real submodule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (p) => p.split('\\').join('/');
const RUNBOOK = readFileSync(join(REPO, 'INSTALL.md'), 'utf8').split('\r\n').join('\n');
const URL = 'https://github.com/akturt/krok.git';

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
  const dir = mkdtempSync(join(tmpdir(), 'krok-rb-'));
  ok(dir, 'git init -q -b main .');
  put(dir, 'README.md', '# x\n');
  for (const [rel, c] of Object.entries(files)) put(dir, rel, c);
  ok(dir, 'git add -A && git commit -q -m init');
  return dir;
}

test('runbook: it is the one entry point, with the two flows and the agent section', () => {
  for (const h of ['## For an AI coding agent', '## A. Install v3', '## B. Update v3', '## Verification']) assert.ok(RUNBOOK.includes(h), h);
  assert.ok(RUNBOOK.includes('Installation/update complete when:'));
  assert.match(RUNBOOK, /There is no migration/);
  assert.doesNotMatch(RUNBOOK, /v2-to-v3|MIGRATE/);
  assert.equal(existsSync(join(REPO, 'playbook', 'install-remote-prompt.md')), false, 'no competing installation prompt');
  assert.match(readFileSync(join(REPO, 'bootstrap', 'DEPLOY-PROMPT.md'), 'utf8'), /INSTALL\.md/);
});

test('detection: every repository state maps to exactly one verdict', () => {
  const notGit = mkdtempSync(join(tmpdir(), 'krok-rb-nogit-'));
  assert.equal(detect(notGit), 'STOP not a git repository');
  assert.equal(detect(repo()), 'INSTALL');

  const v3 = (version) => repo({ 'docs/.control/core/registry.yaml': `control:\n  name: Krok\n  version: "${version}"\n\nbootstrap:\n  engine_version: "2.0"\n` });
  assert.equal(detect(v3('3.0.0')), 'UPDATE 3.0.0');
  assert.equal(detect(v3('3.4.1')), 'UPDATE 3.4.1');
  assert.match(detect(v3('4.0.0')), /^STOP docs\/\.control has an unexpected version '4\.0\.0'/);
  assert.match(detect(v3('2.0.0')), /^STOP docs\/\.control has an unexpected version/);

  // the old name routes to the guide, it is never converted
  assert.equal(detect(repo({ 'docs/.runtime/underboss/x': 'x' })), 'MOVE');
  assert.equal(detect(repo({ '.context/runtime/x': 'x' })), 'MOVE');
  assert.equal(detect(repo({ 'docs/.runtime/naprolom-docs/x': 'x' })), 'MOVE');
  assert.equal(detect(repo({ '.gitmodules': '[submodule "docs/.control"]\n\tpath = docs/.control\n\turl = https://github.com/akturt/naprolom-docs.git\n', 'docs/.control/core/registry.yaml': 'control:\n  name: Krok\n  version: "3.0.0"\n' })), 'MOVE');
  assert.equal(detect(repo({ 'docs/.control/core/registry.yaml': 'control:\n  name: Underboss\n  version: "3.0.0"\n' })), 'MOVE');
  assert.match(detect(repo({ 'docs/.control/x': 'x' })), /^STOP docs\/\.control exists without core\/registry\.yaml/);

});

// ---------- a product repository with history ----------

function productRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'krok-rbprod-'));
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
  ok(dir, `git add -A && git update-index --chmod=+x core/bin/krok && git commit -q -m first`);
  const first = ok(dir, 'git rev-parse HEAD').trim();
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
    assert.equal(r.code, 0, `${cmd}\n${r.out}${r.err}`);
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
  assert.match(readFileSync(join(proj, '.context', 'agent-entry.md'), 'utf8'), /Agent Entry Point/);
  writeFileSync(join(proj, '.context', 'project.yml'), 'name: shop\nrepository:\n  name: shop\n');
  assert.equal(detect(proj), 'UPDATE 3.0.0');
  verify(proj);
  ok(proj, 'git add -A docs .context .github CLAUDE.md && git commit -q -m "chore: install Krok"');
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
  ok(proj, 'git add docs/.control && git commit -q -m "chore: update Krok"');
  assert.equal(detect(proj), 'UPDATE 3.0.0');
});

