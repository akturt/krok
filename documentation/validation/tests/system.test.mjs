// Tests of the v3 vocabulary/compat removal against the real product files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, readFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, tmp, put } from './helpers.mjs';

const P = (p) => p.split('\\').join('/');
const bash = (script, cwd, env = {}) =>
  spawnSync('bash', ['-c', script], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

test('the old directory and file names no longer exist', () => {
  assert.ok(!existsSync(join(REPO, 'runtime')));
  assert.ok(existsSync(join(REPO, 'core', 'registry.yaml')));
  assert.ok(existsSync(join(REPO, 'core', 'installation-state-machine.yaml')));
  assert.ok(existsSync(join(REPO, 'core', 'contracts', 'product')));
  assert.ok(existsSync(join(REPO, 'documentation', 'validation', 'validate-integrity.sh')));
  assert.ok(!existsSync(join(REPO, 'documentation', 'validation', 'validate-runtime.sh')));
  assert.ok(!existsSync(join(REPO, 'documentation', 'templates', 'backlog.md')));
});

test('the Registry has the control key, no compatibility block, no review directory', () => {
  const reg = readFileSync(join(REPO, 'core', 'registry.yaml'), 'utf8');
  assert.match(reg, /^control:/m);
  assert.doesNotMatch(reg, /^runtime:/m);
  assert.doesNotMatch(reg, /^compatibility:/m);
  assert.doesNotMatch(reg, /specs\/review/);
});

test('the schema has no review status and no legacy kind', () => {
  const schema = JSON.parse(readFileSync(join(REPO, 'documentation', 'schemas', 'frontmatter.schema.json'), 'utf8'));
  const text = JSON.stringify(schema);
  assert.doesNotMatch(text, /"review"/);
  assert.doesNotMatch(text, /"legacy"/);
  const spec = schema.allOf.find((r) => r.if.properties.type.const === 'spec');
  assert.deepEqual(spec.then.properties.status.enum, ['draft', 'approved', 'implemented', 'superseded']);
  const api = schema.allOf.find((r) => r.if.properties.type.const === 'api');
  assert.deepEqual(api.then.properties.status.enum, ['active', 'deprecated']);
});

test('no product code names the old layout or a fallback', () => {
  const files = [...walk(join(REPO, 'core')), ...walk(join(REPO, 'bootstrap'))].filter((f) => /\.(sh|ps1|yaml)$/.test(f));
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /\.context[\\/]runtime/, f);
    assert.doesNotMatch(t, /DEGRADED|built-in fallback|WARN_ONLY/, f);
    assert.doesNotMatch(t, /\blegacy (layout|mode|state|path|v1)/i, f);
  }
});

test('bootstrap on a missing Registry fails with an explicit error', () => {
  const root = tmp('krok-nobreg-');
  cpSync(join(REPO, 'core', 'lib'), join(root, 'core', 'lib'), { recursive: true });
  cpSync(join(REPO, 'bootstrap'), join(root, 'bootstrap'), { recursive: true });
  const r = bash(`bash bootstrap/bootstrap.sh --target "${P(root)}/target"`, root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /registry not found/);
  assert.ok(!existsSync(join(root, 'target')));
});

test('detect_state knows exactly fresh, installed, partial', () => {
  const states = (setup) => {
    const root = tmp('krok-state-');
    const target = join(root, 't');
    mkdirSync(target, { recursive: true });
    cpSync(join(REPO, 'core', 'lib'), join(root, 'core', 'lib'), { recursive: true });
    setup(root, target);
    const r = bash(`export CONTROL_ROOT="${P(root)}" TARGET="${P(target)}"; source "${P(root)}/core/lib/api.sh"; detect_state`, root);
    return r.stdout.trim().split(' ')[0];
  };
  assert.equal(states(() => {}), 'fresh');
  assert.equal(states((root) => { copyReg(root); }), 'partial');
  assert.equal(states((root) => { copyReg(root); for (const d of ['bootstrap', 'documentation', 'agents', 'knowledge', 'sops']) mkdirSync(join(root, d)); }), 'installed');
  // an old layout is simply not special
  assert.equal(states((root, t) => { mkdirSync(join(t, '.context', 'runtime'), { recursive: true }); }), 'fresh');
});

function copyReg(root) {
  mkdirSync(join(root, 'core'), { recursive: true });
  copyFileSync(join(REPO, 'core', 'registry.yaml'), join(root, 'core', 'registry.yaml'));
}

test('directory scopes of the Registry do not leak into each other', () => {
  const r = bash(`export CONTROL_ROOT="${P(REPO)}"; source core/lib/api.sh; registry_list_directories docs; echo ---; registry_list_directories context`, REPO);
  const [docs, ctx] = r.stdout.split('---');
  assert.doesNotMatch(docs, /project\.yml|boundaries\.yml|agent-entry\.md/);
  assert.doesNotMatch(docs, /review/);
  assert.match(ctx, /project\.yml/);
});

test('bootstrap against a fresh project creates the registry layout without review', () => {
  const proj = tmp('krok-proj-');
  const control = join(proj, 'docs', '.control');
  for (const d of ['core', 'bootstrap', 'documentation', 'engine', 'agents', 'knowledge', 'sops', 'playbook']) {
    cpSync(join(REPO, d), join(control, d), { recursive: true });
  }
  const r = bash(`bash docs/.control/bootstrap/bootstrap.sh --target "${P(proj)}"`, proj);
  assert.equal(r.status, 0, r.stderr);
  for (const d of ['drafts', 'approved', 'implemented', 'superseded']) assert.ok(existsSync(join(proj, 'docs', 'specs', d)), d);
  assert.ok(!existsSync(join(proj, 'docs', 'specs', 'review')));
  assert.ok(!existsSync(join(proj, 'docs', 'project.yml')));
  const b = readFileSync(join(proj, '.context', 'boundaries.yml'), 'utf8');
  assert.match(b, /pristine:\n    - path: docs\/\.control\//);
  assert.doesNotMatch(b.split('editable:')[0], /path: (\/|docs\/)\s*\n/);
  assert.match(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), /docs\/\.control\/core\/registry\.yaml/);
  const ci = readFileSync(join(proj, '.github', 'workflows', 'docs-validate.yml'), 'utf8');
  assert.match(ci, /validate-lifecycle\.mjs/);
  assert.doesNotMatch(ci, /runtime|WARN_ONLY|if \[ -f/);
});

test('planner: gate: manual is a human step and role: human is not an alias', () => {
  const dir = tmp('krok-planner-');
  mkdirSync(join(dir, 'sops'), { recursive: true });
  mkdirSync(join(dir, 'core', 'control'), { recursive: true });
  copyFileSync(join(REPO, 'sops', 'planner.mjs'), join(dir, 'sops', 'planner.mjs'));
  copyFileSync(join(REPO, 'core', 'control', 'yaml.mjs'), join(dir, 'core', 'control', 'yaml.mjs'));
  put(dir, 'sops/x.yaml', 'name: x\ndescription: d\nsteps:\n  - id: 1\n    name: a\n    gate: manual\n    depends_on: []\n  - id: 2\n    name: b\n    role: human\n    depends_on: [1]\n');
  const out = execFileSync('node', [join(dir, 'sops', 'planner.mjs'), 'x'], { encoding: 'utf8' });
  assert.match(out, /\[1\] a\s+→\s+gate: manual/);
  assert.match(out, /\[2\] b\s+→\s+role: human/);
});

test('the real SOPs have no role: human and no review step', () => {
  for (const f of readdirSync(join(REPO, 'sops')).filter((x) => x.endsWith('.yaml'))) {
    const t = readFileSync(join(REPO, 'sops', f), 'utf8');
    assert.doesNotMatch(t, /role: human/, f);
    assert.doesNotMatch(t, /specs\/review|status=review/, f);
  }
  for (const s of ['new-feature', 'new-service']) {
    const out = execFileSync('node', [join(REPO, 'sops', 'planner.mjs'), s], { encoding: 'utf8' });
    assert.match(out, /Promote spec draft→approved\s+→\s+gate: manual/);
  }
});

test('spec-drift: a draft in drafts/ is not drift; a mismatch is', () => {
  const proj = tmp('krok-drift-');
  put(proj, 'docs/specs/drafts/a.md', '---\nid: a\ntype: spec\nstatus: draft\n---\n');
  put(proj, 'docs/specs/approved/b.md', '---\nid: b\ntype: spec\nstatus: draft\n---\n');
  const out = execFileSync('bash', [join(REPO, 'engine/reality-engine/analyzers/spec-drift.sh'), proj], { encoding: 'utf8' });
  assert.doesNotMatch(out, /"spec": "a"/);
  assert.match(out, /"spec": "b"/);
});

test('documentation-drift: statuses come from the schema, review is unknown', () => {
  const proj = tmp('krok-docdrift-');
  put(proj, 'docs/a.md', '---\nschema: 1\nid: a\ntype: spec\nstatus: review\n---\n');
  put(proj, 'docs/b.md', '---\nschema: 1\nid: b\ntype: spec\nstatus: approved\n---\n');
  put(proj, 'docs/c.md', '---\nschema: 1\nid: c\ntype: api\nstatus: approved\n---\n');
  const out = execFileSync('bash', [join(REPO, 'engine/reality-engine/analyzers/documentation-drift.sh'), proj], { encoding: 'utf8' });
  assert.match(out, /"file": "docs\/a\.md", "status": "review"/);
  assert.match(out, /"file": "docs\/c\.md", "status": "approved"/);
  assert.doesNotMatch(out, /docs\/b\.md/);
});

test('frontmatter validator: every finding is an error, no warn-only switch', () => {
  const proj = tmp('krok-fm-');
  put(proj, 'docs/a.md', '---\nschema: 1\nid: a\ntype: spec\nstatus: draft\ndate: 2026-10-04\nowners: [t]\nentity_refs: []\n---\n');
  const run = (env = {}) => spawnSync('bash', [join(REPO, 'documentation/validation/validate-frontmatter.sh'), join(proj, 'docs')], { encoding: 'utf8', cwd: proj, env: { ...process.env, ...env } });
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /spec requires non-empty entity_refs/);
  assert.equal(run({ WARN_ONLY: '1' }).status, 1);
  const missing = spawnSync('bash', [join(REPO, 'documentation/validation/validate-frontmatter.sh'), join(proj, 'nope')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
});

test('no fallback branches remain in the shell core, the validators and the generators', () => {
  const dirs = [join(REPO, 'core', 'lib'), join(REPO, 'documentation', 'validation'), join(REPO, 'bootstrap', 'generators')];
  for (const d of dirs) {
    for (const f of readdirSync(d).filter((x) => x.endsWith('.sh'))) {
      assert.doesNotMatch(readFileSync(join(d, f), 'utf8'), /fallback/i, `${d}/${f}`);
    }
  }
});

test('detect_all needs the Registry', () => {
  const root = tmp('krok-detect-');
  cpSync(join(REPO, 'core', 'lib'), join(root, 'core', 'lib'), { recursive: true });
  const r = bash(`export CONTROL_ROOT="${P(root)}"; source "${P(root)}/core/lib/api.sh"; detect_all "${P(root)}"; echo "status=$?"`, root);
  assert.match(r.stdout, /status=1/);
  assert.match(r.stderr, /registry not found/);
});

test('claude-md generator: an existing CLAUDE.md without Krok rules gets the snippet, one with them is left alone', () => {
  const run = (initial) => {
    const proj = tmp('krok-claude-');
    if (initial !== null) put(proj, 'CLAUDE.md', initial);
    const r = bash(`export CONTROL_ROOT="${P(REPO)}"; source "${P(REPO)}/core/lib/api.sh"; source "${P(REPO)}/bootstrap/generators/claude-md.sh"; generate "${P(proj)}" x; generate "${P(proj)}" x`, proj);
    assert.equal(r.status, 0, r.stderr);
    return readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
  };
  const user = run('# Mine\n\nnotes\n');
  assert.match(user, /^## Krok$/m);
  assert.match(user, /# Mine\n\nnotes\n$/);
  assert.equal(user.match(/^## Krok$/gm).length, 1); // the second run did not prepend again
  const own = '# Mine\n\nsee docs/.control/ for the rules\n';
  assert.equal(run(own), own);
  const fresh = run(null);
  assert.match(fresh, /^# CLAUDE\.md — AI Agent Quickstart/);
  assert.match(fresh, /core\/bin\/krok/);
});
