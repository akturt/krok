import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { REPO, makeProject, put, git, SPEC, ADR, INVARIANTS } from './fixture.mjs';
import * as core from '../index.mjs';

const MAIN = join(REPO, 'core', 'control', 'cli', 'main.mjs');
const WRAPPER = join(REPO, 'core', 'bin', 'underboss');
const P = (p) => p.split('\\').join('/');

function cli(args, { cwd = REPO, env = {}, main = MAIN } = {}) {
  const r = spawnSync('node', [main, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
}

const A = ['--actor', 'human:test'];
const SOP = ['--sop', 'new-feature'];

function createUnit(root) {
  const r = cli(['execution', 'create', 'spec-x', ...SOP, ...A, '--project', root, '--json']);
  assert.equal(r.code, 0, r.err + r.out);
  return r.json().unit.id;
}

function exec(root, ...args) {
  return cli([...args, '--project', root]);
}

// ---------- usage ----------

test('usage: no arguments is a usage error; --help lists the approved surface', () => {
  const none = cli([]);
  assert.equal(none.code, 2);
  assert.match(none.err, /usage: underboss/);
  const help = cli(['--help']);
  assert.equal(help.code, 0);
  for (const c of ['status', 'attention', 'execution list', 'execution show', 'execution create', 'execution ready', 'execution start', 'execution verify',
    'execution complete', 'execution cancel', 'execution record', 'escalation list', 'escalation show', 'escalation open', 'escalation resolve']) {
    assert.match(help.out, new RegExp(`underboss ${c}`), c);
  }
});

test('usage: there is no decision command, no resume, no redesign, no backlog (Phase 3)', () => {
  for (const c of [['decision'], ['decision', 'resolve'], ['execution', 'resume', 'x'], ['execution', 'redesign', 'x'], ['backlog', 'status'], ['nope']]) {
    const r = cli(c);
    assert.equal(r.code, 2, c.join(' '));
    assert.match(r.err, /unknown command/);
  }
  assert.doesNotMatch(cli(['--help']).out, /decision|resume|redesign|backlog/);
});

test('usage: argument errors exit 2 and name the problem', () => {
  const root = makeProject();
  const bad = (args, re) => {
    const r = exec(root, ...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, re);
  };
  bad(['execution', 'create', 'spec-x', ...A], /missing flag --sop/);
  bad(['execution', 'create', 'spec-x', ...SOP], /missing flag --actor/);
  bad(['execution', 'create', ...SOP, ...A], /missing argument <spec-id>/);
  bad(['execution', 'create', 'spec-x', ...SOP, ...A, '--bogus', '1'], /unknown flag --bogus/);
  bad(['execution', 'show'], /missing argument <execution-id>/);
  bad(['execution', 'show', 'a', 'b'], /unexpected argument 'b'/);
  bad(['status', '--sop'], /needs a value/);
  bad(['execution', 'record', 'execution-001', 'verification', ...A], /missing flag --criterion/);
  bad(['execution', 'create', 'spec-x', ...SOP, ...SOP, ...A], /given twice/);
});

test('usage: with --json an error is a JSON object', () => {
  const r = cli(['nope', '--json']);
  assert.equal(r.code, 2);
  assert.deepEqual(r.json(), { ok: false, code: 2, error: "unknown command 'nope'" });
  assert.equal(r.err, '');
});

// ---------- project root: explicit and implicit, no fallback ----------

test('project: explicit --project works from any working directory', () => {
  const root = makeProject();
  const other = mkdtempSync(join(tmpdir(), 'underboss-cwd-'));
  const r = cli(['status', '--project', root, '--json'], { cwd: other });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.json(), { units: [], counts: { DESIGN: 0, READY: 0, EXECUTING: 0, VERIFYING: 0, BLOCKED: 0, DONE: 0, CANCELLED: 0 }, open_escalations: 0 });
});

test('project: without --project the git top-level of the current directory is used', () => {
  const root = makeProject();
  put(root, 'docs/deep/er/x.txt', 'x');
  const r = cli(['status'], { cwd: join(root, 'docs', 'deep', 'er') });
  assert.equal(r.code, 0, r.err);
  const id = createUnit(root);
  assert.match(cli(['execution', 'list'], { cwd: join(root, 'docs', 'deep') }).out, new RegExp(id));
});

test('project: not a git repository, not a directory, no project.yml are explicit errors (exit 3)', () => {
  const plain = mkdtempSync(join(tmpdir(), 'underboss-plain-'));
  const a = cli(['status'], { cwd: plain });
  assert.equal(a.code, 3);
  assert.match(a.err, /not inside a git repository/);

  const root = makeProject();
  const b = cli(['status', '--project', join(root, 'does-not-exist')]);
  assert.equal(b.code, 3);
  assert.match(b.err, /is not a directory/);

  const noCtx = makeProject();
  git(noCtx, 'rm', '-q', '-r', '-f', '.context');
  const c = cli(['status', '--project', noCtx]);
  assert.equal(c.code, 3);
  assert.match(c.err, /no \.context\/project\.yml/);
  const d = cli(['status'], { cwd: noCtx });
  assert.equal(d.code, 3);

  // a non-git directory holding .context is still not a project without --project: no fallback
  const ctxOnly = mkdtempSync(join(tmpdir(), 'underboss-ctxonly-'));
  put(ctxOnly, '.context/project.yml', 'name: x\n');
  assert.equal(cli(['status'], { cwd: ctxOnly }).code, 3);
  assert.equal(cli(['status', '--project', ctxOnly]).code, 0);
});

// ---------- execution ----------

test('execution create/list/show: human output, --json, ids, missing unit', () => {
  const root = makeProject();
  const first = exec(root, 'execution', 'create', 'spec-x', ...SOP, ...A, '--scope', 'AC-001,AC-002');
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /^created execution-001   DESIGN$/m);
  assert.equal(createUnit(root), 'execution-002');

  const list = exec(root, 'execution', 'list');
  assert.match(list.out, /^EXECUTION\s+STATE\s+SPEC\s+SCOPE$/m);
  assert.match(list.out, /execution-001\s+DESIGN\s+spec-x\s+AC-001,AC-002/);
  assert.match(list.out, /execution-002\s+DESIGN\s+spec-x\s+all/);

  const show = exec(root, 'execution', 'show', 'execution-001');
  assert.match(show.out, /^execution-001   DESIGN$/m);
  assert.match(show.out, /sop:\s+new-feature v1/);
  assert.match(show.out, /^\s+1\s+\d{4}-\d{2}-\d{2}T\S+Z\s+transition\s+human:test$/m);

  const js = exec(root, 'execution', 'show', 'execution-001', '--json').json();
  assert.equal(js.unit.id, 'execution-001');
  assert.deepEqual(js.unit.scope, ['AC-001', 'AC-002']);
  assert.equal(js.stale, false);
  assert.equal(js.records.length, 1);

  const missing = exec(root, 'execution', 'show', 'execution-099');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /unit 'execution-099' not found/);
  assert.equal(exec(root, 'execution', 'list').code, 0);
});

test('execution create: unknown SOP and invalid scope are refused, nothing is written', () => {
  const root = makeProject();
  const a = exec(root, 'execution', 'create', 'spec-x', '--sop', 'no-such-sop', ...A);
  assert.equal(a.code, 1);
  assert.match(a.err, /not registered/);
  const b = exec(root, 'execution', 'create', 'spec-x', ...SOP, ...A, '--scope', 'AC-1');
  assert.equal(b.code, 1);
  assert.match(b.err, /invalid unit/);
  assert.deepEqual(core.listUnitIds(root), []);
});

test('execution: invalid transitions are refused by the Core (exit 1)', () => {
  const root = makeProject();
  const id = createUnit(root);
  for (const c of ['start', 'verify', 'complete']) {
    const r = exec(root, 'execution', c, id, ...A);
    assert.equal(r.code, 1, c);
    assert.match(r.err, /illegal transition/);
  }
  assert.equal(core.readUnit(root, id).state, 'DESIGN');
  assert.equal(exec(root, 'execution', 'cancel', id, '--reason', 'not wanted', ...A).code, 0);
  const again = exec(root, 'execution', 'cancel', id, '--reason', 'again', ...A);
  assert.equal(again.code, 1);
  assert.match(again.err, /terminal state/);
  assert.equal(exec(root, 'execution', 'ready', id, ...A).code, 1);
});

test('execution ready/start/stale: findings exit 1; stale READY is shown in status; start revalidates', () => {
  const root = makeProject();
  const id = createUnit(root);
  const ok = exec(root, 'execution', 'ready', id, ...A);
  assert.equal(ok.code, 0, ok.out + ok.err);
  assert.match(ok.out, /^ready: ok   execution-001 is READY$/m);
  assert.match(exec(root, 'status').out, /execution-001\s+READY\s+spec-x\s+0/);

  put(root, 'docs/adr/001-x.md', ADR.replace('accepted', 'deprecated'));
  const status = exec(root, 'status');
  assert.match(status.out, /execution-001\s+READY \(stale\)/);
  assert.equal(exec(root, 'status', '--json').json().units[0].stale, true);
  assert.match(exec(root, 'execution', 'list').out, /READY \(stale\)/);
  assert.match(exec(root, 'execution', 'show', id).out, /^execution-001   READY \(stale\)$/m);

  const start = exec(root, 'execution', 'start', id, ...A);
  assert.equal(start.code, 1);
  assert.match(start.out, /start: refused   execution-001 is DESIGN/);
  assert.match(start.out, /\[check 2\] ADR 'adr-001-x' is 'deprecated', not accepted/);
  assert.equal(core.readUnit(root, id).state, 'DESIGN');
  const js = exec(root, 'execution', 'start', id, ...A, '--json');
  assert.equal(js.code, 1); // READY no longer: start is refused as an illegal transition
});

test('open escalation: attention, escalation list/show/resolve with an ADR link', () => {
  const root = makeProject();
  const id = createUnit(root);
  assert.equal(exec(root, 'execution', 'ready', id, ...A).code, 0);
  put(root, 'docs/specs/approved/x.md', SPEC.replace('### Excluded', '### Other'));
  const start = exec(root, 'execution', 'start', id, ...A);
  assert.equal(start.code, 1);
  assert.match(start.out, /\[check 3, scope\]/);

  const att = exec(root, 'attention');
  assert.equal(att.code, 0);
  assert.match(att.out, /^execution-001:\d+  scope  \(age \d+[smhd]\)$/m);
  assert.match(att.out, /question: .*Scope -> Excluded/);
  assert.match(att.out, /impact:   the Execution Unit cannot start/);
  assert.match(att.out, /affects:  spec-x/);
  const attJson = exec(root, 'attention', '--json').json();
  assert.equal(attJson.attention.length, 1);
  assert.equal(attJson.attention[0].kind, 'scope');
  assert.ok(!('age' in attJson.attention[0]), 'JSON carries opened_at, not a clock-relative age');
  const escId = attJson.attention[0].id;

  assert.match(exec(root, 'escalation', 'list').out, new RegExp(`${escId}\\s+scope\\s+open`));
  assert.match(exec(root, 'escalation', 'list', '--execution', id).out, new RegExp(escId));
  assert.equal(exec(root, 'escalation', 'list', '--execution', 'execution-099').out.trim(), 'no escalations');
  const show = exec(root, 'escalation', 'show', escId);
  assert.match(show.out, new RegExp(`^${escId}   open$`, 'm'));

  const res = exec(root, 'escalation', 'resolve', escId, '--resolution', 'Spec amended', '--adr', 'adr-009-x', ...A);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, /stays DESIGN/);
  assert.equal(exec(root, 'attention').out.trim(), 'nothing needs attention');
  const shown = exec(root, 'escalation', 'show', escId, '--json').json().escalation;
  assert.equal(shown.status, 'resolved');
  assert.equal(shown.links.adr, 'adr-009-x');
  assert.equal(exec(root, 'escalation', 'resolve', escId, '--resolution', 'again', ...A).code, 1);
  assert.equal(exec(root, 'escalation', 'resolve', 'execution-001:99', '--resolution', 'x', ...A).code, 1);
  assert.equal(exec(root, 'escalation', 'show', 'execution-001:99').code, 1);
  assert.equal(exec(root, 'escalation', 'show', 'nonsense').code, 1);
  assert.equal(core.readUnit(root, id).state, 'DESIGN');
  assert.deepEqual(core.checkExecution(root), []);
});

test('escalation open: kinds are the nine; EXECUTING becomes BLOCKED', () => {
  const root = makeProject();
  const id = createUnit(root);
  assert.equal(exec(root, 'execution', 'ready', id, ...A).code, 0);
  assert.equal(exec(root, 'execution', 'start', id, ...A).code, 0);
  const bad = exec(root, 'escalation', 'open', id, '--kind', 'conflict', '--question', 'q', '--impact', 'i', ...A);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /invalid record/);
  const ok = exec(root, 'escalation', 'open', id, '--kind', 'security', '--question', 'auth?', '--impact', 'high', '--affected', 'spec-x,docs/a.md', ...A);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /opened execution-001:\d+   execution-001 is BLOCKED/);
  assert.equal(core.readUnit(root, id).state, 'BLOCKED');
  assert.match(exec(root, 'status').out, /execution-001\s+BLOCKED\s+spec-x\s+1/);
});

test('execution: the full path through the CLI ends in DONE with evidence; record errors', () => {
  const root = makeProject();
  const id = createUnit(root);
  for (const step of ['ready', 'start', 'verify']) assert.equal(exec(root, 'execution', step, id, ...A).code, 0, step);
  assert.equal(core.readUnit(root, id).state, 'VERIFYING');

  const noEvidence = exec(root, 'execution', 'complete', id, ...A);
  assert.equal(noEvidence.code, 1);
  assert.match(noEvidence.out, /AC-001 has no verification record/);

  const rec = (c, extra = []) => exec(root, 'execution', 'record', id, 'verification', '--criterion', c, '--result', 'pass', '--detail', 'ok',
    '--evidence-class', 'EVIDENCED', '--evidence-source', 'CI run 1', ...A, ...extra);
  assert.match(rec('AC-001').out, /record: ok   execution-001 #\d+ verification AC-001 pass/);
  assert.equal(rec('AC-009').code, 1);
  assert.equal(exec(root, 'execution', 'record', id, 'transition', '--criterion', 'AC-001', '--result', 'pass', '--detail', 'x', '--evidence-class', 'OBSERVED', '--evidence-source', 's', ...A).code, 1);
  assert.equal(exec(root, 'execution', 'record', id, 'verification', '--criterion', 'AC-002', '--result', 'maybe', '--detail', 'x', '--evidence-class', 'OBSERVED', '--evidence-source', 's', ...A).code, 1);
  assert.equal(exec(root, 'execution', 'record', id, 'verification', '--criterion', 'AC-002', '--result', 'pass', '--detail', 'x', '--evidence-class', 'GUESSED', '--evidence-source', 's', ...A).code, 1);
  rec('AC-002', ['--commit', 'abc123']);

  const done = exec(root, 'execution', 'complete', id, ...A);
  assert.equal(done.code, 0, done.out + done.err);
  assert.match(done.out, /complete: ok   execution-001 is DONE/);
  assert.match(exec(root, 'status').out, /DONE 1/);
  assert.deepEqual(core.checkExecution(root), []);
});

// ---------- projections are the Core projections; output is deterministic ----------

test('projection: --json equals the Core projection; repeated runs are byte-identical', () => {
  const root = makeProject();
  const id = createUnit(root);
  exec(root, 'execution', 'ready', id, ...A);
  const noDrift = () => [];
  const status1 = exec(root, 'status', '--json');
  const status2 = exec(root, 'status', '--json');
  assert.equal(status1.out, status2.out);
  assert.deepEqual(status1.json(), core.projectStatus(root, { reality: noDrift }));
  const show1 = exec(root, 'execution', 'show', id, '--json');
  assert.equal(show1.out, exec(root, 'execution', 'show', id, '--json').out);
  assert.deepEqual(show1.json(), JSON.parse(JSON.stringify(core.unitView(root, id, { reality: noDrift }))));
  assert.equal(exec(root, 'status').out, exec(root, 'status').out);
  assert.deepEqual(exec(root, 'execution', 'list', '--json').json().executions, JSON.parse(JSON.stringify(core.projectExecutions(root, { reality: noDrift }))));
  assert.deepEqual(exec(root, 'attention', '--json').json(), { attention: core.projectAttention(root) });
});

test('projection: nothing is stored; the execution directory holds only units', () => {
  const root = makeProject();
  const id = createUnit(root);
  exec(root, 'status');
  exec(root, 'attention');
  exec(root, 'execution', 'list');
  assert.deepEqual(readdirSync(join(root, '.context', 'execution')), [id]);
  assert.deepEqual(readdirSync(join(root, '.context')).sort(), ['boundaries.yml', 'execution', 'project.yml']);
});

// ---------- the CLI holds no business logic ----------

test('the CLI is an adapter: it imports only the Core SDK index and its own modules', () => {
  const dir = join(REPO, 'core', 'control', 'cli');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      assert.match(m[1], /^(node:[a-z_:]+|\.\/[a-z]+\.mjs|\.\.\/index\.mjs)$/, `${f} imports ${m[1]}`);
    }
    assert.doesNotMatch(src, /appendRecord|transitionUnit|canTransition|validateUnit|validateRecord|writeFileSync|createHash|computeFingerprint/, f);
    assert.doesNotMatch(src, /decision/i, f);
    assert.doesNotMatch(src, /\b(DESIGN|READY|EXECUTING|VERIFYING|BLOCKED)\b.*->/, `${f} must not encode transitions`);
  }
  assert.match(readFileSync(WRAPPER, 'utf8'), /exec node "\$\{BIN_DIR\}\/\.\.\/control\/cli\/main\.mjs"/);
  assert.ok(readFileSync(WRAPPER, 'utf8').split('\n').length < 20);
});

test('the Registry registers the CLI entrypoint', () => {
  assert.equal(core.loadRegistry().entrypoints.cli, 'core/bin/underboss');
});

// ---------- installed control layer against a consumer project ----------

function consumer() {
  const proj = mkdtempSync(join(tmpdir(), 'underboss-consumer-'));
  const control = join(proj, 'docs', '.control');
  for (const d of ['core', 'bootstrap', 'documentation', 'engine', 'agents', 'knowledge', 'sops', 'playbook']) cpSync(join(REPO, d), join(control, d), { recursive: true });
  git(proj, 'init', '-q', '-b', 'main', '.');
  git(proj, 'remote', 'add', 'origin', 'https://example.com/acme/shop.git');
  const boot = spawnSync('bash', ['docs/.control/bootstrap/bootstrap.sh', '--target', P(proj)], { cwd: proj, encoding: 'utf8' });
  assert.equal(boot.status, 0, boot.stderr);
  writeFileSync(join(proj, '.context', 'project.yml'), 'name: shop\nrepository:\n  name: shop\n');
  put(proj, 'docs/specs/approved/x.md', SPEC);
  put(proj, 'docs/adr/001-x.md', ADR);
  put(proj, 'docs/architecture/invariants.md', INVARIANTS);
  put(proj, 'docs/architecture/entity-catalog.md', '---\nschema: 1\nid: entity-catalog\ntype: architecture\nstatus: active\ndate: 2026-10-04\nowners: [t]\n---\n\n- **core**: the core\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'consumer');
  return { proj, control };
}

test('consumer: the installed control layer drives a consumer project from any directory', () => {
  const { proj, control } = consumer();
  const bin = join(control, 'core', 'bin', 'underboss');
  const other = mkdtempSync(join(tmpdir(), 'underboss-elsewhere-'));
  const run = (...args) => spawnSync('bash', [P(bin), ...args, '--project', P(proj)], { cwd: other, encoding: 'utf8' });

  const create = run('execution', 'create', 'spec-x', ...SOP, ...A, '--json');
  assert.equal(create.status, 0, create.stderr);
  const id = JSON.parse(create.stdout).unit.id;
  const ready = run('execution', 'ready', id, ...A);
  assert.equal(ready.status, 0, ready.stdout + ready.stderr);
  const start = run('execution', 'start', id, ...A);
  assert.equal(start.status, 0, start.stdout + start.stderr);
  assert.match(run('status').stdout, /execution-001\s+EXECUTING\s+spec-x/);

  // state lives in the consumer project, not in the control layer
  assert.ok(readdirSync(join(proj, '.context', 'execution')).includes(id));
  assert.ok(!readdirSync(control).includes('.context'));
  const validated = spawnSync('node', [join(control, 'documentation', 'validation', 'validate-execution.mjs'), proj], { encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stdout);

  // without --project the consumer is found through git, from inside it
  const inside = spawnSync('bash', [P(bin), 'status'], { cwd: join(proj, 'docs'), encoding: 'utf8' });
  assert.equal(inside.status, 0, inside.stderr);
  assert.match(inside.stdout, /execution-001\s+EXECUTING/);
});

test('CONTROL_ROOT: the environment override selects the control installation (Registry, SOPs)', () => {
  const { control } = consumer();
  const sop = join(control, 'sops', 'new-feature.yaml');
  writeFileSync(sop, readFileSync(sop, 'utf8').replace(/^version: 1/m, 'version: 2'));
  const root = makeProject();
  const r = cli(['execution', 'create', 'spec-x', ...SOP, ...A, '--project', root, '--json'], { env: { CONTROL_ROOT: control } });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().unit.sop.version, 2);
});
