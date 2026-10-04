import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import {
  createUnit, readUnit, listRecords, transitionUnit, unitDir, ready, start, resume, isStale, verifyStart, recordVerification,
  complete, cancel, redesign, updateDefinition, computeFingerprint, openEscalation, resolveEscalation, escalations, openEscalations,
  defaultAutonomy, mustEscalate, checkExecution, validateReady,
} from '../index.mjs';
import { makeProject, put, git, clock, noDrift, definition, nineKinds, A, SPEC, ADR, INVARIANTS } from './fixture.mjs';

const ID = 'execution-001';
const evid = { class: 'OBSERVED', source: 'test' };

function unitInDesign(over = {}) {
  const root = makeProject();
  const now = clock();
  createUnit(root, definition(root, over), { ...A, now });
  return { root, now };
}

function toReady(over = {}) {
  const ctx = unitInDesign(over);
  const r = ready(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift });
  assert.ok(r.ok, JSON.stringify(r.findings));
  return ctx;
}

function toExecuting() {
  const ctx = toReady();
  assert.ok(start(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift }).ok);
  return ctx;
}

function toVerifying() {
  const ctx = toExecuting();
  verifyStart(ctx.root, ID, { ...A, now: ctx.now });
  return ctx;
}

const passAll = (ctx, criteria = ['AC-001', 'AC-002'], evidence = evid) => {
  for (const c of criteria) recordVerification(ctx.root, ID, { ...A, criterion: c, result: 'pass', detail: 'ok', evidence, now: ctx.now });
};

// ---------- persistence ----------

test('create: unit.yml in DESIGN plus the creation transition record', () => {
  const { root } = unitInDesign();
  const u = readUnit(root, ID);
  assert.equal(u.state, 'DESIGN');
  assert.deepEqual([u.validated_at, u.fingerprint, u.started_at, u.completed_at], [null, null, null, null]);
  const recs = listRecords(root, ID);
  assert.equal(recs.length, 1);
  assert.match(recs[0].name, /^000001-20261004T120000Z-transition\.yml$/);
  assert.deepEqual(recs[0].record.payload, { from: null, to: 'DESIGN', reason: 'created' });
  assert.deepEqual(checkExecution(root), []);
});

test('create: ids are never reused; invalid definitions are rejected', () => {
  const { root, now } = unitInDesign();
  assert.throws(() => createUnit(root, definition(root), { ...A, now }), /never reused/);
  assert.throws(() => createUnit(root, definition(root, { id: 'execution-002', scope: [] }), { ...A, now }), /invalid unit/);
  assert.ok(!existsSync(unitDir(root, 'execution-002')));
});

test('serialization is deterministic: the same operations give identical bytes', () => {
  const a = unitInDesign();
  const b = unitInDesign();
  const read = (root, rel) => readFileSync(join(unitDir(root, ID), rel), 'utf8');
  assert.equal(read(a.root, 'unit.yml'), read(b.root, 'unit.yml'));
  const name = readdirSync(join(unitDir(a.root, ID), 'records'))[0];
  assert.equal(read(a.root, `records/${name}`), read(b.root, `records/${name}`));
});

test('records are append-only with contiguous seq; the record is written before unit.yml', () => {
  const { root, now } = unitInDesign();
  // An invalid snapshot fails while updating unit.yml, after the record was written.
  assert.throws(() => transitionUnit(root, ID, 'READY', { ...A, reason: 'x', now, snapshot: { validated_at: 'bad', fingerprint: 'bad' } }), /invalid unit/);
  assert.equal(listRecords(root, ID).length, 2);
  assert.equal(readUnit(root, ID).state, 'DESIGN');
  // the consistency validator sees the disagreement
  assert.match(checkExecution(root).join('\n'), /disagrees with the latest transition record/);
});

// ---------- transitions ----------

test('illegal transitions are rejected and write nothing', () => {
  const { root, now } = unitInDesign();
  const before = listRecords(root, ID).length;
  for (const to of ['EXECUTING', 'VERIFYING', 'BLOCKED', 'DONE', 'DESIGN']) {
    assert.throws(() => transitionUnit(root, ID, to, { ...A, reason: 'x', now }), /illegal transition/, to);
  }
  assert.equal(listRecords(root, ID).length, before);
});

test('terminal states: DONE and CANCELLED accept nothing', () => {
  const c = unitInDesign();
  cancel(c.root, ID, { ...A, reason: 'no longer wanted', now: c.now });
  assert.equal(readUnit(c.root, ID).state, 'CANCELLED');
  assert.notEqual(readUnit(c.root, ID).completed_at, null);
  for (const to of ['DESIGN', 'READY', 'EXECUTING', 'CANCELLED']) assert.throws(() => transitionUnit(c.root, ID, to, { ...A, reason: 'x', now: c.now, snapshot: {} }), /terminal state|illegal/);
  assert.throws(() => openEscalation(c.root, ID, { ...A, kind: 'scope', question: 'q', impact: 'i' }), /CANCELLED/);

  const d = toVerifying();
  passAll(d);
  assert.ok(complete(d.root, ID, { ...A, now: d.now, reality: noDrift }).ok);
  assert.equal(readUnit(d.root, ID).state, 'DONE');
  assert.throws(() => cancel(d.root, ID, { ...A, reason: 'x', now: d.now }), /terminal state/);
  assert.deepEqual(checkExecution(d.root), []);
});

test('full path DESIGN -> READY -> EXECUTING -> VERIFYING -> EXECUTING -> VERIFYING -> DONE, consistent throughout', () => {
  const ctx = toVerifying();
  recordVerification(ctx.root, ID, { ...A, criterion: 'AC-001', result: 'fail', detail: 'red', evidence: evid, now: ctx.now });
  // VERIFYING -> EXECUTING is the ordinary rework loop, not an escalation
  transitionUnit(ctx.root, ID, 'EXECUTING', { ...A, reason: 'verification failed, rework', now: ctx.now });
  assert.equal(openEscalations(ctx.root, ID).length, 0);
  verifyStart(ctx.root, ID, { ...A, now: ctx.now });
  passAll(ctx);
  assert.ok(complete(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift }).ok);
  assert.deepEqual(checkExecution(ctx.root), []);
  const states = listRecords(ctx.root, ID).filter((x) => x.record.type === 'transition').map((x) => x.record.payload.to);
  assert.deepEqual(states, ['DESIGN', 'READY', 'EXECUTING', 'VERIFYING', 'EXECUTING', 'VERIFYING', 'DONE']);
});

test('VERIFYING -> DESIGN is impossible; the Spec changes via Escalation -> BLOCKED -> DESIGN', () => {
  const ctx = toVerifying();
  assert.throws(() => redesign(ctx.root, ID, { ...A, reason: 'x', now: ctx.now }), /illegal transition VERIFYING -> DESIGN/);
  openEscalation(ctx.root, ID, { ...A, kind: 'scope', question: 'spec must change', impact: 'blocked', affected_artifacts: ['spec-x'], now: ctx.now });
  assert.equal(readUnit(ctx.root, ID).state, 'BLOCKED');
  redesign(ctx.root, ID, { ...A, reason: 'context no longer valid', now: ctx.now });
  assert.equal(readUnit(ctx.root, ID).state, 'DESIGN');
  assert.deepEqual(checkExecution(ctx.root), []);
});

// ---------- READY ----------

test('ready: validation record, snapshot in unit.yml, state READY', () => {
  const { root } = toReady();
  const u = readUnit(root, ID);
  assert.equal(u.state, 'READY');
  assert.match(u.fingerprint, /^sha256:[0-9a-f]{64}$/);
  const recs = listRecords(root, ID).map((x) => x.record);
  const v = recs.find((r) => r.type === 'validation');
  assert.equal(v.payload.result, 'pass');
  assert.equal(v.payload.purpose, 'ready');
  assert.equal(v.at, u.validated_at);
  assert.equal(v.payload.fingerprint, u.fingerprint);
  assert.equal(v.payload.base_commit, git(root, 'rev-parse', 'HEAD').trim());
  assert.equal(v.evidence.class, 'OBSERVED');
  assert.deepEqual(checkExecution(root), []);
});

test('ready: every check fails on its own', () => {
  const fail = (setup, check, kind = null, over = {}) => {
    const ctx = unitInDesign(over);
    setup(ctx.root);
    const r = ready(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift });
    assert.equal(r.ok, false);
    assert.equal(readUnit(ctx.root, ID).state, 'DESIGN');
    const f = r.findings.find((x) => x.check === check);
    assert.ok(f, `check ${check}: ${JSON.stringify(r.findings)}`);
    assert.equal(f.kind, kind);
    const last = listRecords(ctx.root, ID).map((x) => x.record).pop();
    assert.equal(last.type, 'validation');
    assert.equal(last.payload.result, 'fail');
  };
  fail((r) => put(r, 'docs/specs/approved/x.md', SPEC.replace('status: approved', 'status: draft')), 1);
  fail((r) => put(r, 'docs/adr/001-x.md', ADR.replace('accepted', 'proposed')), 2);
  fail((r) => put(r, 'docs/specs/approved/x.md', SPEC.replace('### Excluded', '### Other')), 3, 'scope');
  fail(() => {}, 3, 'scope', { scope: ['AC-009'] });
  fail(() => {}, 4, 'invariant', { constraints: ['INV-099'] });
  fail(() => {}, 5, null, { sop: { name: 'new-feature', version: 2 } });
  fail(() => {}, 5, null, { sop: { name: 'nope', version: 1 } });
  fail((r) => git(r, 'remote', 'set-url', 'origin', 'https://example.com/acme/other.git'), 7);
  fail((r) => put(r, 'docs/specs/approved/x.md', SPEC.replace('entity_refs: [core]', 'entity_refs: [ghost]')), 9, 'context-gap');
});

test('ready: Reality drift matching the Spec fails validation; unrelated drift does not', () => {
  const a = unitInDesign();
  const r1 = ready(a.root, ID, { ...A, now: a.now, reality: () => [{ type: 'status_dir_mismatch', spec: 'spec-x' }] });
  assert.equal(r1.ok, false);
  assert.equal(r1.findings[0].check, 8);
  assert.equal(r1.findings[0].kind, 'context-gap');
  const b = unitInDesign();
  assert.ok(ready(b.root, ID, { ...A, now: b.now, reality: () => [{ type: 'broken_reference', from: 'other.md', adr: 'adr-x' }] }).ok);
});

test('ready: the real Reality Engine analyzers are consumed', () => {
  const { root } = unitInDesign();
  const r = validateReady(root, readUnit(root, ID));
  assert.equal(r.findings.filter((f) => f.check === 8).length, 0, JSON.stringify(r.findings));
});

test('ready: only DESIGN can become READY', () => {
  const { root, now } = toReady();
  assert.throws(() => ready(root, ID, { ...A, now, reality: noDrift }), /illegal transition READY -> READY/);
});

// ---------- fingerprint ----------

test('fingerprint: stable, and unchanged by a plain HEAD advance', () => {
  const { root } = toReady();
  const u = readUnit(root, ID);
  const f = computeFingerprint(root, u, { reality: noDrift });
  assert.equal(f, u.fingerprint);
  assert.equal(computeFingerprint(root, u, { reality: noDrift }), f);
  put(root, 'src/unrelated.txt', 'x');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'advance HEAD');
  assert.equal(computeFingerprint(root, u, { reality: noDrift }), f);
  assert.equal(isStale(root, ID, { reality: noDrift }), false);
});

test('fingerprint: changes with each relevant input', () => {
  const base = (setup) => {
    const { root } = toReady();
    const u = readUnit(root, ID);
    setup(root, u);
    return { root, u, changed: computeFingerprint(root, readUnit(root, ID), { reality: noDrift }) !== u.fingerprint };
  };
  assert.ok(base((r) => put(r, 'docs/specs/approved/x.md', SPEC + '\nmore\n')).changed, 'spec text');
  assert.ok(base((r) => put(r, 'docs/adr/001-x.md', ADR.replace('accepted', 'deprecated'))).changed, 'adr status');
  assert.ok(base((r) => put(r, 'docs/architecture/invariants.md', INVARIANTS.replace('one', 'ONE'))).changed, 'invariant text');
  assert.ok(base((r) => put(r, '.context/boundaries.yml', 'boundaries: {}\n')).changed, 'boundaries');
  const drift = toReady();
  const u = readUnit(drift.root, ID);
  assert.notEqual(computeFingerprint(drift.root, u, { reality: () => [{ spec: 'spec-x', type: 't' }] }), u.fingerprint, 'drift set');
  assert.notEqual(computeFingerprint(drift.root, { ...u, scope: ['AC-001'] }, { reality: noDrift }), u.fingerprint, 'unit definition');
});

test('fingerprint: insensitive to state, validated_at, fingerprint, line endings and trailing blanks', () => {
  const { root } = toReady();
  const u = readUnit(root, ID);
  const f = u.fingerprint;
  assert.equal(computeFingerprint(root, { ...u, state: 'DESIGN', validated_at: null, fingerprint: null }, { reality: noDrift }), f);
  put(root, 'docs/specs/approved/x.md', SPEC.replace(/\n/g, '\r\n') + '\r\n\r\n');
  assert.equal(computeFingerprint(root, u, { reality: noDrift }), f);
});

test('stale READY is computed, never stored', () => {
  const { root } = toReady();
  put(root, 'docs/adr/001-x.md', ADR.replace('accepted', 'deprecated'));
  assert.equal(isStale(root, ID, { reality: noDrift }), true);
  assert.equal(readUnit(root, ID).state, 'READY');
  assert.equal(JSON.stringify(readUnit(root, ID)).includes('stale'), false);
});

// ---------- start revalidates ----------

test('start: a fresh validation passes -> EXECUTING, with a validation record and started_at', () => {
  const { root, now } = toReady();
  const before = listRecords(root, ID).length;
  const r = start(root, ID, { ...A, now, reality: noDrift });
  assert.ok(r.ok);
  const u = readUnit(root, ID);
  assert.equal(u.state, 'EXECUTING');
  assert.notEqual(u.started_at, null);
  assert.deepEqual([u.validated_at, u.fingerprint], [null, null]);
  const added = listRecords(root, ID).slice(before).map((x) => `${x.record.type}:${x.record.payload.purpose || x.record.payload.to}`);
  assert.deepEqual(added, ['validation:start', 'transition:EXECUTING']);
  assert.deepEqual(checkExecution(root), []);
});

test('start: revalidates even when READY looks fine; a failure -> DESIGN + record + Escalation', () => {
  const { root, now } = toReady();
  put(root, 'docs/specs/approved/x.md', SPEC.replace('### Excluded', '### Other'));
  assert.equal(isStale(root, ID, { reality: noDrift }), true);
  const r = start(root, ID, { ...A, now, reality: noDrift });
  assert.equal(r.ok, false);
  const u = readUnit(root, ID);
  assert.equal(u.state, 'DESIGN');
  assert.deepEqual([u.validated_at, u.fingerprint], [null, null]);
  const recs = listRecords(root, ID).map((x) => x.record);
  const v = recs.filter((x) => x.type === 'validation').pop();
  assert.equal(v.payload.purpose, 'start');
  assert.equal(v.payload.result, 'fail');
  const esc = escalations(root, ID);
  assert.equal(esc.length, 1);
  assert.equal(esc[0].kind, 'scope');
  assert.equal(esc[0].status, 'open');
  assert.equal(u.state, 'DESIGN'); // DESIGN plus an open Escalation is valid, not BLOCKED
  assert.deepEqual(checkExecution(root), []);
});

test('start: only READY units start', () => {
  const { root, now } = unitInDesign();
  assert.throws(() => start(root, ID, { ...A, now, reality: noDrift }), /illegal transition DESIGN -> EXECUTING/);
});

test('start: a changed platform requirement is checked at start, not part of the fingerprint', () => {
  const { root, now } = toReady();
  const u = readUnit(root, ID);
  const f = computeFingerprint(root, u, { reality: noDrift });
  assert.equal(f, u.fingerprint);
  assert.ok(start(root, ID, { ...A, now, reality: noDrift, agentPlatform: 'claude-code' }).ok);
});

// ---------- escalation ----------

test('escalation: opening moves EXECUTING/VERIFYING -> BLOCKED, READY -> DESIGN, DESIGN stays', () => {
  const open = (ctx, kind = 'architecture') => openEscalation(ctx.root, ID, { ...A, kind, question: 'q', impact: 'i', affected_artifacts: ['spec-x'], now: ctx.now });
  const e = toExecuting();
  assert.equal(open(e).unit.state, 'BLOCKED');
  const v = toVerifying();
  assert.equal(open(v).unit.state, 'BLOCKED');
  const r = toReady();
  assert.equal(open(r).unit.state, 'DESIGN');
  const d = unitInDesign();
  assert.equal(open(d).unit.state, 'DESIGN');
  assert.deepEqual(checkExecution(d.root), []);
  assert.deepEqual(checkExecution(e.root), []);
});

test('escalation: ids, status open|resolved, resolution never moves the unit', () => {
  const ctx = toExecuting();
  const { id } = openEscalation(ctx.root, ID, { ...A, kind: 'security', question: 'auth?', impact: 'high', affected_artifacts: ['a', 'b'], now: ctx.now });
  assert.match(id, /^execution-001:\d+$/);
  assert.equal(escalations(ctx.root, ID)[0].status, 'open');
  resolveEscalation(ctx.root, ID, { ...A, escalationId: id, resolution: 'use OAuth', links: { adr: 'adr-007-auth' }, now: ctx.now });
  const e = escalations(ctx.root, ID)[0];
  assert.equal(e.status, 'resolved');
  assert.equal(e.links.adr, 'adr-007-auth');
  assert.equal(readUnit(ctx.root, ID).state, 'BLOCKED');
  assert.throws(() => resolveEscalation(ctx.root, ID, { ...A, escalationId: id, resolution: 'again', now: ctx.now }), /already resolved/);
  assert.throws(() => resolveEscalation(ctx.root, ID, { ...A, escalationId: `${ID}:99`, resolution: 'x', now: ctx.now }), /not found/);
  assert.deepEqual(checkExecution(ctx.root), []);
});

test('escalation: only the nine kinds; removed or invented kinds are rejected', () => {
  const ctx = toExecuting();
  for (const kind of nineKinds()) {
    openEscalation(ctx.root, ID, { ...A, kind, question: 'q', impact: 'i', now: ctx.now });
  }
  for (const kind of ['decision', 'approval', 'conflict', 'dependency', 'unknown']) {
    assert.throws(() => openEscalation(ctx.root, ID, { ...A, kind, question: 'q', impact: 'i', now: ctx.now }), /invalid record/, kind);
  }
  assert.equal(escalations(ctx.root, ID).length, 9);
});

test('escalation: an unresolved Escalation blocks resume; after resolution a fresh validation resumes', () => {
  const ctx = toExecuting();
  const { id } = openEscalation(ctx.root, ID, { ...A, kind: 'invariant', question: 'q', impact: 'i', now: ctx.now });
  const blocked = resume(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift });
  assert.equal(blocked.ok, false);
  assert.match(blocked.findings[0].message, /is open/);
  resolveEscalation(ctx.root, ID, { ...A, escalationId: id, resolution: 'accepted risk', now: ctx.now });
  assert.equal(readUnit(ctx.root, ID).state, 'BLOCKED');
  const before = listRecords(ctx.root, ID).length;
  assert.ok(resume(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift }).ok);
  const added = listRecords(ctx.root, ID).slice(before).map((x) => x.record.type);
  assert.deepEqual(added, ['validation', 'transition']);
  assert.equal(readUnit(ctx.root, ID).state, 'EXECUTING');
});

test('escalation: resume fails revalidation -> stays BLOCKED; redesign is the explicit way out', () => {
  const ctx = toExecuting();
  const { id } = openEscalation(ctx.root, ID, { ...A, kind: 'scope', question: 'q', impact: 'i', now: ctx.now });
  resolveEscalation(ctx.root, ID, { ...A, escalationId: id, resolution: 'spec edited', now: ctx.now });
  put(ctx.root, 'docs/specs/approved/x.md', SPEC.replace('status: approved', 'status: draft'));
  assert.equal(resume(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift }).ok, false);
  assert.equal(readUnit(ctx.root, ID).state, 'BLOCKED');
  redesign(ctx.root, ID, { ...A, reason: 'context is no longer valid', now: ctx.now });
  assert.equal(readUnit(ctx.root, ID).state, 'DESIGN');
});

// ---------- autonomy ----------

test('autonomy: escalate_on defaults to all nine kinds and is a trigger', () => {
  const { root } = unitInDesign();
  assert.deepEqual(defaultAutonomy(root).escalate_on, nineKinds());
  assert.equal(nineKinds().length, 9);
  const u = readUnit(root, ID);
  for (const k of nineKinds()) assert.equal(mustEscalate(u, k), true);
  assert.equal(mustEscalate({ autonomy: { escalate_on: ['scope'] } }, 'security'), false);
});

test('autonomy: removing a kind needs an explicit statement in the approved Spec', () => {
  const without = nineKinds().filter((k) => k !== 'architecture');
  const bad = unitInDesign({ autonomy: { escalate_on: without } });
  const r = ready(bad.root, ID, { ...A, now: bad.now, reality: noDrift });
  assert.equal(r.ok, false);
  assert.match(r.findings.find((f) => f.check === 6).message, /architecture.*Autonomy: architecture/);

  const good = unitInDesign({ autonomy: { escalate_on: without } });
  put(good.root, 'docs/specs/approved/x.md', SPEC.replace('## Acceptance criteria', 'Autonomy: architecture\n\n## Acceptance criteria'));
  assert.ok(ready(good.root, ID, { ...A, now: good.now, reality: noDrift }).ok);
});

test('autonomy: editing the definition sends READY back to DESIGN', () => {
  const { root, now } = toReady();
  const u = updateDefinition(root, ID, { scope: ['AC-001'] }, { ...A, now });
  assert.equal(u.state, 'DESIGN');
  assert.deepEqual(u.scope, ['AC-001']);
  assert.deepEqual([u.validated_at, u.fingerprint], [null, null]);
  assert.throws(() => updateDefinition(root, ID, { spec: 'other' }, { ...A, now }), /not part of the editable definition/);
  const ex = toExecuting();
  assert.throws(() => updateDefinition(ex.root, ID, { scope: ['AC-001'] }, { ...A, now: ex.now }), /cannot be edited/);
});

// ---------- completion needs evidence ----------

test('complete: rejected without verification, with failing or CLAIMED/INFERRED evidence', () => {
  const none = toVerifying();
  const r0 = complete(none.root, ID, { ...A, now: none.now, reality: noDrift });
  assert.equal(r0.ok, false);
  assert.equal(r0.findings.length, 2);
  assert.equal(readUnit(none.root, ID).state, 'VERIFYING');

  const claimed = toVerifying();
  passAll(claimed, ['AC-001', 'AC-002'], { class: 'CLAIMED', source: 'agent says so' });
  assert.match(complete(claimed.root, ID, { ...A, now: claimed.now, reality: noDrift }).findings[0].message, /only by CLAIMED/);

  const inferred = toVerifying();
  passAll(inferred, ['AC-001', 'AC-002'], { class: 'INFERRED', source: 'x' });
  assert.equal(complete(inferred.root, ID, { ...A, now: inferred.now, reality: noDrift }).ok, false);

  const failed = toVerifying();
  recordVerification(failed.root, ID, { ...A, criterion: 'AC-001', result: 'fail', detail: 'red', evidence: evid, now: failed.now });
  recordVerification(failed.root, ID, { ...A, criterion: 'AC-002', result: 'pass', detail: 'ok', evidence: evid, now: failed.now });
  assert.match(complete(failed.root, ID, { ...A, now: failed.now, reality: noDrift }).findings[0].message, /verification failed/);
});

test('complete: EVIDENCED passes; only the scoped criteria are required; Reality drift blocks', () => {
  const scoped = toReady({ scope: ['AC-001'] });
  start(scoped.root, ID, { ...A, now: scoped.now, reality: noDrift });
  verifyStart(scoped.root, ID, { ...A, now: scoped.now });
  assert.throws(() => recordVerification(scoped.root, ID, { ...A, criterion: 'AC-002', result: 'pass', detail: 'x', evidence: evid, now: scoped.now }), /not in the scope/);
  passAll(scoped, ['AC-001'], { class: 'EVIDENCED', source: 'CI run 42' });
  assert.ok(complete(scoped.root, ID, { ...A, now: scoped.now, reality: noDrift }).ok);

  const drift = toVerifying();
  passAll(drift);
  const r = complete(drift.root, ID, { ...A, now: drift.now, reality: () => [{ spec: 'spec-x' }] });
  assert.equal(r.ok, false);
  assert.equal(r.findings[0].check, 8);
  assert.equal(readUnit(drift.root, ID).state, 'VERIFYING');
});

test('complete: verification written before re-entering VERIFYING does not count', () => {
  const ctx = toVerifying();
  passAll(ctx);
  transitionUnit(ctx.root, ID, 'EXECUTING', { ...A, reason: 'rework', now: ctx.now });
  verifyStart(ctx.root, ID, { ...A, now: ctx.now });
  assert.equal(complete(ctx.root, ID, { ...A, now: ctx.now, reality: noDrift }).ok, false);
});

// ---------- consistency validator ----------

function commitAll(root) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'execution state');
}

const recFile = (root, i) => join(unitDir(root, ID), 'records', readdirSync(join(unitDir(root, ID), 'records')).sort()[i]);

test('consistency: a clean tree passes; no execution directory is fine', () => {
  assert.deepEqual(checkExecution(makeProject()), []);
  assert.deepEqual(checkExecution(toVerifying().root), []);
});

test('consistency: sequence gaps are errors', () => {
  const ctx = toReady();
  unlinkSync(recFile(ctx.root, 1));
  assert.match(checkExecution(ctx.root).join('\n'), /sequence gap/);
});

test('consistency: unit.yml state that disagrees with the latest transition is an error', () => {
  const ctx = toReady();
  const f = join(unitDir(ctx.root, ID), 'unit.yml');
  writeFileSync(f, readFileSync(f, 'utf8').replace('state: READY', 'state: DESIGN'));
  assert.match(checkExecution(ctx.root).join('\n'), /disagrees with the latest transition|only set while READY/);
});

test('consistency: a modified record is detected (git), also against a base ref', () => {
  const ctx = toReady();
  commitAll(ctx.root);
  assert.deepEqual(checkExecution(ctx.root), []);
  const f = recFile(ctx.root, 0);
  const text = readFileSync(f, 'utf8');
  writeFileSync(f, text.replace('reason: created', 'reason: edited'));
  assert.match(checkExecution(ctx.root).join('\n'), /modified or removed after creation/);
  git(ctx.root, 'add', '-A');
  git(ctx.root, 'commit', '-q', '-m', 'tamper');
  assert.deepEqual(checkExecution(ctx.root), []);
  assert.match(checkExecution(ctx.root, { baseRef: 'HEAD~1' }).join('\n'), /record changed since HEAD~1/);
});

test('consistency: a deleted committed record is detected', () => {
  const ctx = toReady();
  commitAll(ctx.root);
  unlinkSync(recFile(ctx.root, 2));
  assert.match(checkExecution(ctx.root).join('\n'), /modified or removed|sequence gap/);
});

test('consistency: file name must agree with seq, time and type; files must be canonical', () => {
  const ctx = toReady();
  const f = recFile(ctx.root, 0);
  renameSync(f, join(unitDir(ctx.root, ID), 'records', '000001-20261004T120000Z-validation.yml'));
  assert.match(checkExecution(ctx.root).join('\n'), /file type/);
  const c2 = toReady();
  const g = recFile(c2.root, 0);
  writeFileSync(g, readFileSync(g, 'utf8').replace('reason: created', 'reason:   created'));
  assert.match(checkExecution(c2.root).join('\n'), /not in canonical form/);
});

test('consistency: an illegal transition chain is an error', () => {
  const ctx = unitInDesign();
  // forge a DESIGN -> EXECUTING record through the low-level writer: schema-valid, chain-illegal
  const forged = readFileSync(recFile(ctx.root, 0), 'utf8')
    .replace('seq: 1', 'seq: 2').replace('2026-10-04T12:00:00Z', '2026-10-04T12:05:00Z')
    .replace('from:\n', 'from: DESIGN\n').replace('to: DESIGN', 'to: EXECUTING').replace('reason: created', 'reason: forged');
  writeFileSync(join(unitDir(ctx.root, ID), 'records', '000002-20261004T120500Z-transition.yml'), forged);
  assert.match(checkExecution(ctx.root).join('\n'), /illegal transition DESIGN -> EXECUTING/);
});

test('consistency: resolving an Escalation that was never opened is an error', () => {
  const ctx = unitInDesign();
  const body = `seq: 2\nat: 2026-10-04T12:01:00Z\ntype: escalation-resolved\nactor: a\nevidence:\n  class: OBSERVED\n  source: s\npayload:\n  id: ${ID}:7\n  resolution: r\n  links:\n    adr:\n    spec:\n`;
  writeFileSync(join(unitDir(ctx.root, ID), 'records', '000002-20261004T120100Z-escalation-resolved.yml'), body);
  assert.match(checkExecution(ctx.root).join('\n'), /was not opened before/);
});

test('consistency: READY snapshot must equal the latest passing validation record', () => {
  const ctx = toReady();
  const f = join(unitDir(ctx.root, ID), 'unit.yml');
  writeFileSync(f, readFileSync(f, 'utf8').replace(/fingerprint: sha256:[0-9a-f]{2}/, 'fingerprint: sha256:00'));
  assert.match(checkExecution(ctx.root).join('\n'), /READY snapshot does not match/);
});

test('consistency: no escalation entity file exists; the store holds only unit.yml and records', () => {
  const ctx = toExecuting();
  openEscalation(ctx.root, ID, { ...A, kind: 'scope', question: 'q', impact: 'i', now: ctx.now });
  assert.deepEqual(readdirSync(unitDir(ctx.root, ID)).sort(), ['records', 'unit.yml']);
});

// ---------- the registered validator ----------

test('validate-execution: exit codes follow the consistency checks', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = join(process.cwd(), 'documentation', 'validation', 'validate-execution.mjs');
  const ctx = toReady();
  const ok = spawnSync('node', [script, ctx.root], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /validate-execution: OK/);
  unlinkSync(recFile(ctx.root, 1));
  const bad = spawnSync('node', [script, ctx.root], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /sequence gap/);
});
