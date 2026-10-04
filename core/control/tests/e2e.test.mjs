// End-to-end scenarios of the Control Plane against a consumer project that has the
// control layer installed as a real git submodule at docs/.control/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { REPO, put, git, SPEC, ADR, INVARIANTS } from './fixture.mjs';
import * as core from '../index.mjs';

const P = (p) => p.split('\\').join('/');
const A = ['--actor', 'human:e2e'];
const ID = 'execution-001';

// ---------- a product repository and a consumer with the submodule installed ----------

let productRepo = null;
function product() {
  if (productRepo) return productRepo;
  const dir = mkdtempSync(join(tmpdir(), 'underboss-product-'));
  const files = spawnSync('git', ['ls-files', '-c'], { cwd: REPO, encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  for (const f of files) {
    if (!existsSync(join(REPO, f))) continue;
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(REPO, f), join(dir, f));
  }
  git(dir, 'init', '-q', '-b', 'master', '.');
  git(dir, 'add', '-A');
  git(dir, 'update-index', '--chmod=+x', 'core/bin/underboss');
  git(dir, 'commit', '-q', '-m', 'product');
  productRepo = dir;
  return dir;
}

function consumer() {
  const proj = mkdtempSync(join(tmpdir(), 'underboss-shop-'));
  git(proj, 'init', '-q', '-b', 'main', '.');
  git(proj, 'remote', 'add', 'origin', 'https://example.com/acme/shop.git');
  put(proj, 'README.md', '# shop\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'init');
  git(proj, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', P(product()), 'docs/.control');
  const boot = spawnSync('bash', ['docs/.control/bootstrap/bootstrap.sh', '--target', P(proj)], { cwd: proj, encoding: 'utf8' });
  assert.equal(boot.status, 0, boot.stderr);
  writeFileSync(join(proj, '.context', 'project.yml'), 'name: shop\nrepository:\n  name: shop\n');
  put(proj, 'docs/specs/approved/x.md', SPEC);
  put(proj, 'docs/adr/001-x.md', ADR);
  put(proj, 'docs/architecture/invariants.md', INVARIANTS);
  put(proj, 'docs/architecture/entity-catalog.md', '---\nschema: 1\nid: entity-catalog\ntype: architecture\nstatus: active\ndate: 2026-10-04\nowners: [t]\n---\n\n- **core**: the core\n');
  put(proj, 'docs/backlog/active.md', '---\nschema: 1\nid: backlog-active\ntype: backlog\nstatus: active\ndate: 2026-10-04\nowners: [t]\n---\n\n- [ ] first\n- [ ] second\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'consumer');
  const bin = join(proj, 'docs', '.control', 'core', 'bin', 'underboss');
  const other = mkdtempSync(join(tmpdir(), 'underboss-away-'));
  const run = (...args) => {
    const r = spawnSync('bash', [P(bin), ...args, '--project', P(proj)], { cwd: other, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  return { proj, run, state: () => core.readUnit(proj, ID).state };
}

const evidence = ['--evidence-class', 'EVIDENCED', '--evidence-source', 'CI run 7'];
const record = (c, criterion, result = 'pass', extra = evidence) => c.run('execution', 'record', ID, 'verification', '--criterion', criterion, '--result', result, '--detail', 'checked', ...extra, ...A);

function toExecuting(c) {
  assert.equal(c.run('execution', 'create', 'spec-x', '--sop', 'new-feature', ...A).code, 0);
  assert.equal(c.run('execution', 'ready', ID, ...A).code, 0);
  const s = c.run('execution', 'start', ID, ...A);
  assert.equal(s.code, 0, s.out + s.err);
}

// ---------- installation ----------

test('installation: the CLI is available from the installed control layer, registered and executable', () => {
  const c = consumer();
  const control = join(c.proj, 'docs', '.control');
  assert.equal(core.loadRegistry().entrypoints.cli, 'core/bin/underboss');
  const registry = readFileSync(join(control, 'core', 'registry.yaml'), 'utf8');
  assert.match(registry, /^  cli: core\/bin\/underboss$/m);
  assert.ok(existsSync(join(control, 'core', 'bin', 'underboss')));
  assert.match(spawnSync('git', ['ls-files', '-s', 'core/bin/underboss'], { cwd: control, encoding: 'utf8' }).stdout, /^100755/);
  assert.ok(existsSync(join(control, 'core', 'registry.yaml')));
  assert.deepEqual(readdirSync(c.proj).filter((d) => !d.startsWith('.') && !['docs', 'README.md', 'CLAUDE.md'].includes(d)), []);
  // the consumer repository tracks the control layer as a submodule, not as files
  assert.match(spawnSync('git', ['ls-files', '-s', 'docs/.control'], { cwd: c.proj, encoding: 'utf8' }).stdout, /^160000/);
  const direct = spawnSync(P(join(control, 'core', 'bin', 'underboss')), ['status', '--project', P(c.proj)], { encoding: 'utf8', shell: false });
  if (direct.error === undefined) assert.equal(direct.status, 0, direct.stderr);
  assert.match(c.run('status').out, /executions: 0/);
});

// ---------- happy path ----------

test('e2e happy path: create -> ready -> start -> verify -> record -> verify -> complete', () => {
  const c = consumer();
  const created = c.run('execution', 'create', 'spec-x', '--sop', 'new-feature', ...A, '--json');
  assert.equal(created.code, 0, created.err);
  assert.equal(created.json().unit.id, ID);
  assert.equal(c.run('status', '--json').json().backlog.active, 2);
  assert.match(c.run('status').out, /backlog: 2 open/);

  const ready = c.run('execution', 'ready', ID, ...A, '--json');
  assert.equal(ready.code, 0, ready.out + ready.err);
  assert.equal(ready.json().unit.state, 'READY');
  assert.match(c.run('status').out, /execution-001\s+READY\s+spec-x/);

  const start = c.run('execution', 'start', ID, ...A, '--json');
  assert.equal(start.code, 0, start.out + start.err);
  assert.equal(start.json().unit.state, 'EXECUTING');

  const verify1 = c.run('execution', 'verify', ID, ...A, '--json').json();
  assert.equal(verify1.ok, true);
  assert.equal(verify1.unit.state, 'VERIFYING');
  assert.deepEqual(verify1.acceptance.map((a) => [a.criterion, a.status]), [['AC-001', 'pending'], ['AC-002', 'pending']]);

  assert.equal(c.run('execution', 'complete', ID, ...A).code, 1); // nothing verified yet
  assert.equal(record(c, 'AC-001').code, 0);
  assert.equal(record(c, 'AC-002').code, 0);

  const verify2 = c.run('execution', 'verify', ID, ...A);
  assert.equal(verify2.code, 0, verify2.out);
  assert.match(verify2.out, /^verify: ok   execution-001 is VERIFYING$/m);
  assert.match(verify2.out, /AC-001  pass/);
  assert.match(verify2.out, /AC-002  pass/);

  const done = c.run('execution', 'complete', ID, ...A, '--json');
  assert.equal(done.code, 0, done.out + done.err);
  assert.equal(done.json().unit.state, 'DONE');
  assert.match(c.run('status').out, /execution-001\s+DONE\s+spec-x/);
  assert.equal(c.run('execution', 'cancel', ID, '--reason', 'late', ...A).code, 1);

  // state lives in the consumer; the submodule is untouched; consistency holds
  const control = join(c.proj, 'docs', '.control');
  const validated = spawnSync('node', [join(control, 'documentation', 'validation', 'validate-execution.mjs'), c.proj], { encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stdout);
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: control, encoding: 'utf8' }).stdout.trim(), '');
  const types = core.listRecords(c.proj, ID).map((x) => `${x.record.type}${x.record.payload.purpose ? `:${x.record.payload.purpose}` : ''}`);
  assert.ok(types.includes('validation:verify') && types.includes('validation:complete'));
});

// ---------- escalation path ----------

test('e2e escalation path: start -> escalation -> BLOCKED -> resolution -> resume -> verify -> complete', () => {
  const c = consumer();
  toExecuting(c);
  const open = c.run('escalation', 'open', ID, '--kind', 'architecture', '--question', 'new queue?', '--impact', 'topology', '--affected', 'spec-x', ...A, '--json');
  assert.equal(open.code, 0, open.out + open.err);
  const escId = open.json().id;
  assert.equal(c.state(), 'BLOCKED');
  assert.match(c.run('attention').out, new RegExp(`${escId}  architecture`));
  assert.equal(c.run('status', '--json').json().open_escalations, 1);
  // start, verify and rework do not apply to BLOCKED
  for (const cmd of ['start', 'verify', 'rework']) assert.equal(c.run('execution', cmd, ID, ...A).code, 1, cmd);

  // an unresolved Escalation refuses resume and writes nothing
  const before = core.listRecords(c.proj, ID).length;
  const refused = c.run('execution', 'resume', ID, ...A, '--json');
  assert.equal(refused.code, 1);
  assert.equal(refused.json().ok, false);
  assert.match(refused.json().findings[0].message, /is open/);
  assert.equal(core.listRecords(c.proj, ID).length, before);
  assert.equal(c.state(), 'BLOCKED');

  const resolved = c.run('escalation', 'resolve', escId, '--resolution', 'ADR accepted', '--adr', 'adr-007-queue', ...A);
  assert.equal(resolved.code, 0, resolved.err);
  assert.equal(c.state(), 'BLOCKED'); // resolution never changes the state by itself
  assert.equal(c.run('attention').out.trim(), 'nothing needs attention');

  const resumed = c.run('execution', 'resume', ID, ...A, '--json');
  assert.equal(resumed.code, 0, resumed.out + resumed.err);
  assert.equal(resumed.json().unit.state, 'EXECUTING');
  assert.equal(c.state(), 'EXECUTING');
  const tail = core.listRecords(c.proj, ID).slice(before).map((x) => `${x.record.type}:${x.record.payload.purpose || x.record.payload.to}`);
  assert.deepEqual(tail, ['escalation-resolved:undefined', 'validation:resume', 'transition:EXECUTING']);
  // resume is not accepted outside BLOCKED, and start did not change meaning
  assert.equal(c.run('execution', 'resume', ID, ...A).code, 1);

  assert.equal(c.run('execution', 'verify', ID, ...A).code, 0);
  assert.equal(record(c, 'AC-001').code, 0);
  assert.equal(record(c, 'AC-002').code, 0);
  assert.equal(c.run('execution', 'complete', ID, ...A).code, 0);
  assert.equal(c.state(), 'DONE');
  assert.deepEqual(core.checkExecution(c.proj), []);
});

// ---------- failure paths ----------

test('failure: stale READY is shown and start refuses; findings are machine-readable', () => {
  const c = consumer();
  assert.equal(c.run('execution', 'create', 'spec-x', '--sop', 'new-feature', ...A).code, 0);
  assert.equal(c.run('execution', 'ready', ID, ...A).code, 0);
  put(c.proj, 'docs/adr/001-x.md', ADR.replace('accepted', 'deprecated'));
  const status = c.run('status', '--json').json();
  assert.equal(status.units[0].stale, true);
  assert.match(c.run('status').out, /READY \(stale\)/);
  const start = c.run('execution', 'start', ID, ...A, '--json');
  assert.equal(start.code, 1);
  const body = start.json();
  assert.equal(body.ok, false);
  assert.equal(body.unit.state, 'DESIGN');
  assert.ok(body.findings.some((f) => f.check === 2));
  assert.equal(c.state(), 'DESIGN');
});

test('failure: invalid transition, invalid SOP, invalid Spec, missing project, invalid root', () => {
  const c = consumer();
  assert.equal(c.run('execution', 'create', 'spec-x', '--sop', 'new-feature', ...A).code, 0);
  const complete = c.run('execution', 'complete', ID, ...A, '--json');
  assert.equal(complete.code, 1);
  assert.deepEqual(complete.json(), { ok: false, code: 1, error: 'illegal transition DESIGN -> DONE' });

  const sop = c.run('execution', 'create', 'spec-x', '--sop', 'nonexistent', ...A, '--json');
  assert.equal(sop.code, 1);
  assert.match(sop.json().error, /not registered/);

  assert.equal(c.run('execution', 'create', 'no-such-spec', '--sop', 'new-feature', ...A).code, 0);
  const ready = c.run('execution', 'ready', 'execution-002', ...A, '--json');
  assert.equal(ready.code, 1);
  assert.ok(ready.json().findings.some((f) => f.check === 1 && /not found/.test(f.message)));

  const away = mkdtempSync(join(tmpdir(), 'underboss-noproj-'));
  const bin = join(c.proj, 'docs', '.control', 'core', 'bin', 'underboss');
  const none = spawnSync('bash', [P(bin), 'status', '--json'], { cwd: away, encoding: 'utf8' });
  assert.equal(none.status, 3);
  assert.equal(JSON.parse(none.stdout).code, 3);
  const bad = c.run('status', '--json');
  assert.equal(bad.code, 0);
  const root = spawnSync('bash', [P(bin), 'status', '--project', P(join(away, 'nope')), '--json'], { encoding: 'utf8' });
  assert.equal(root.status, 3);
  assert.match(JSON.parse(root.stdout).error, /is not a directory/);
  assert.equal(core.listUnitIds(c.proj).length, 2);
});

test('failure: a failed criterion and Reality drift fail verification; complete refuses', () => {
  const c = consumer();
  toExecuting(c);
  assert.equal(c.run('execution', 'verify', ID, ...A).code, 0);
  assert.equal(record(c, 'AC-001', 'fail', ['--evidence-class', 'OBSERVED', '--evidence-source', 'CI run 8']).code, 0);
  assert.equal(record(c, 'AC-002').code, 0);
  const verify = c.run('execution', 'verify', ID, ...A, '--json');
  assert.equal(verify.code, 1);
  const body = verify.json();
  assert.equal(body.ok, false);
  assert.deepEqual(body.acceptance.map((a) => a.status), ['fail', 'pass']);
  assert.ok(body.findings.some((f) => f.message === 'AC-001 verification failed'));
  const complete = c.run('execution', 'complete', ID, ...A);
  assert.equal(complete.code, 1);
  assert.match(complete.out, /AC-001 verification failed/);
  assert.equal(c.state(), 'VERIFYING');

  // Reality drift matching the Spec is a verification failure too (the Reality Engine decides)
  const d = consumer();
  toExecuting(d);
  put(d.proj, 'docs/specs/approved/x.md', SPEC.replace('status: approved', 'status: draft'));
  const drift = d.run('execution', 'verify', ID, ...A, '--json');
  assert.equal(drift.code, 1);
  assert.ok(drift.json().findings.some((f) => f.check === 8 && f.kind === 'context-gap'));
  assert.equal(d.state(), 'VERIFYING');
});

test('failure: a consistency failure is caught by the registered validator', () => {
  const c = consumer();
  toExecuting(c);
  const dir = join(core.unitDir(c.proj, ID), 'records');
  const files = readdirSync(dir).sort();
  unlinkSync(join(dir, files[1]));
  const control = join(c.proj, 'docs', '.control');
  const validated = spawnSync('node', [join(control, 'documentation', 'validation', 'validate-execution.mjs'), c.proj], { encoding: 'utf8' });
  assert.equal(validated.status, 1);
  assert.match(validated.stdout, /sequence gap|modified or removed/);
});

test('verify is only for EXECUTING or VERIFYING units', () => {
  const c = consumer();
  assert.equal(c.run('execution', 'create', 'spec-x', '--sop', 'new-feature', ...A).code, 0);
  const r = c.run('execution', 'verify', ID, ...A);
  assert.equal(r.code, 1);
  assert.match(r.err, /illegal transition DESIGN -> VERIFYING/);
});

test('resume: a failed revalidation records it, keeps the unit BLOCKED and returns the findings', () => {
  const c = consumer();
  toExecuting(c);
  const escId = c.run('escalation', 'open', ID, '--kind', 'scope', '--question', 'q', '--impact', 'i', ...A, '--json').json().id;
  assert.equal(c.run('escalation', 'resolve', escId, '--resolution', 'amended', ...A).code, 0);
  put(c.proj, 'docs/adr/001-x.md', ADR.replace('accepted', 'deprecated'));
  const r = c.run('execution', 'resume', ID, ...A, '--json');
  assert.equal(r.code, 1);
  assert.equal(r.json().ok, false);
  assert.ok(r.json().findings.some((f) => f.check === 2));
  assert.equal(c.state(), 'BLOCKED');
  const last = core.listRecords(c.proj, ID).pop().record;
  assert.equal(last.type, 'validation');
  assert.equal(last.payload.purpose, 'resume');
  assert.equal(last.payload.result, 'fail');
  assert.deepEqual(core.checkExecution(c.proj), []);
});

test('rework: VERIFYING -> EXECUTING only after a failed verification; then the unit completes', () => {
  const c = consumer();
  toExecuting(c);
  assert.equal(c.run('execution', 'rework', ID, ...A).code, 1); // not VERIFYING
  assert.equal(c.run('execution', 'verify', ID, ...A).code, 0);
  const count = core.listRecords(c.proj, ID).length;
  const early = c.run('execution', 'rework', ID, ...A, '--json');
  assert.equal(early.code, 1);
  assert.match(early.json().error, /rework requires a failed verification/);
  assert.equal(core.listRecords(c.proj, ID).length, count);

  assert.equal(record(c, 'AC-001', 'fail', ['--evidence-class', 'OBSERVED', '--evidence-source', 'CI run 9']).code, 0);
  const reworked = c.run('execution', 'rework', ID, ...A, '--json');
  assert.equal(reworked.code, 0, reworked.out + reworked.err);
  assert.equal(reworked.json().unit.state, 'EXECUTING');
  assert.equal(core.listRecords(c.proj, ID).pop().record.payload.to, 'EXECUTING');
  assert.equal(c.run('execution', 'rework', ID, ...A).code, 1); // already EXECUTING

  assert.equal(c.run('execution', 'verify', ID, ...A).code, 0);
  assert.equal(record(c, 'AC-001').code, 0);
  assert.equal(record(c, 'AC-002').code, 0);
  assert.equal(c.run('execution', 'complete', ID, ...A).code, 0);
  assert.equal(c.state(), 'DONE');
  assert.deepEqual(core.checkExecution(c.proj), []);
});

test('rework: a failed verify check (Reality drift) also allows it; start never accepts VERIFYING or BLOCKED', () => {
  const c = consumer();
  toExecuting(c);
  put(c.proj, 'docs/specs/approved/x.md', SPEC.replace('status: approved', 'status: draft'));
  assert.equal(c.run('execution', 'verify', ID, ...A).code, 1);
  assert.equal(c.state(), 'VERIFYING');
  assert.equal(c.run('execution', 'start', ID, ...A).code, 1);
  assert.equal(c.run('execution', 'rework', ID, ...A).code, 0);
  assert.equal(c.state(), 'EXECUTING');
});
