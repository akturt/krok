import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify, YamlError } from '../yaml.mjs';
import { STATES, TERMINAL, canTransition, legalTargets } from '../states.mjs';
import { validateUnit, validateRecord, canonicalRecord, canonicalUnit } from '../schema.mjs';
import { escalationKinds } from '../registry.mjs';
import { REPO, nineKinds } from './fixture.mjs';

// ---------- YAML subset ----------

test('yaml: block mappings, sequences, scalars, flow scalar lists', () => {
  const v = parse('a: 1\nb: text\nc: "q: x"\nd:\n  - x\n  - y\ne: [p, q]\nf:\n  - k: 1\n    l: 2\n  - k: 3\ng:\n  h: null\n  i: true\nj:\n');
  assert.deepEqual(v, { a: 1, b: 'text', c: 'q: x', d: ['x', 'y'], e: ['p', 'q'], f: [{ k: 1, l: 2 }, { k: 3 }], g: { h: null, i: true }, j: null });
});

test('yaml: unsupported constructs are errors, not tolerated', () => {
  assert.throws(() => parse('a:\n\tb: 1\n'), YamlError);
  assert.throws(() => parse('a: 1\na: 2\n'), /duplicate key/);
  assert.throws(() => parse('a: &x 1\n'), /anchors/);
  assert.throws(() => parse('a: {b: 1}\n'), /flow mappings/);
  assert.throws(() => parse('a: |\n  text\n'), /block scalars/);
  assert.throws(() => parse('a: "open\n'), YamlError);
  assert.throws(() => parse('a: 1\n   b: 2\n'), YamlError);
});

test('yaml: writer is deterministic, block style, and round-trips', () => {
  const o = { id: 'x', n: 7, s: '7', t: '2026-10-04T12:00:00Z', q: 'has: colon', e: '', z: null, l: ['a', 'b'], m: [{ a: 1, b: 'x y' }, { a: 2, b: null }], empty: [], nest: { k: 'v' } };
  const text = stringify(o);
  assert.equal(text, stringify(o));
  assert.doesNotMatch(text, /\[(?!\])|\{(?!\})/);
  assert.deepEqual(parse(text), o);
  assert.match(text, /^s: "7"$/m);
  assert.match(text, /^e: ""$/m);
  assert.match(text, /^z:$/m);
});

test('yaml: key order is the order of the object', () => {
  assert.equal(stringify({ b: 1, a: 2 }), 'b: 1\na: 2\n');
});

test('yaml: reads the Registry and every SOP', () => {
  const reg = parse(readFileSync(join(REPO, 'core', 'registry.yaml'), 'utf8'));
  assert.ok(Array.isArray(reg.directories.docs));
  for (const f of readdirSync(join(REPO, 'sops')).filter((x) => x.endsWith('.yaml'))) {
    const sop = parse(readFileSync(join(REPO, 'sops', f), 'utf8'));
    assert.equal(sop.version, 1, f);
    assert.ok(Array.isArray(sop.steps), f);
  }
});

test('yaml: the planner uses the shared reader (no second parser)', () => {
  const src = readFileSync(join(REPO, 'sops', 'planner.mjs'), 'utf8');
  assert.match(src, /from '\.\.\/core\/control\/yaml\.mjs'/);
  assert.doesNotMatch(src, /function parseYAML/);
});

// ---------- states ----------

const LEGAL = [
  ['DESIGN', 'READY'], ['READY', 'DESIGN'], ['READY', 'EXECUTING'], ['EXECUTING', 'VERIFYING'], ['VERIFYING', 'DONE'],
  ['VERIFYING', 'EXECUTING'], ['EXECUTING', 'BLOCKED'], ['VERIFYING', 'BLOCKED'], ['BLOCKED', 'EXECUTING'], ['BLOCKED', 'DESIGN'],
  ['DESIGN', 'CANCELLED'], ['READY', 'CANCELLED'], ['EXECUTING', 'CANCELLED'], ['VERIFYING', 'CANCELLED'], ['BLOCKED', 'CANCELLED'],
];

test('states: exactly the approved seven states', () => {
  assert.deepEqual(STATES, ['DESIGN', 'READY', 'EXECUTING', 'VERIFYING', 'BLOCKED', 'DONE', 'CANCELLED']);
  assert.deepEqual(TERMINAL, ['DONE', 'CANCELLED']);
});

test('states: every listed transition is legal and every other pair is rejected', () => {
  for (const from of STATES) {
    for (const to of STATES) {
      const expected = LEGAL.some(([a, b]) => a === from && b === to);
      assert.equal(canTransition(from, to), expected, `${from} -> ${to}`);
    }
  }
});

test('states: terminal states have no exit; VERIFYING -> DESIGN does not exist; BLOCKED only from started states', () => {
  assert.deepEqual(legalTargets('DONE'), []);
  assert.deepEqual(legalTargets('CANCELLED'), []);
  assert.equal(canTransition('VERIFYING', 'DESIGN'), false);
  const into = (t) => STATES.filter((s) => canTransition(s, t));
  assert.deepEqual(into('BLOCKED'), ['EXECUTING', 'VERIFYING']);
  assert.deepEqual(into('READY'), ['DESIGN']);
});

// ---------- schema ----------

const ROOT = REPO;
const unit = () => ({
  id: 'execution-001', spec: 'spec-x', scope: 'all', sop: { name: 'new-feature', version: 1 }, constraints: ['INV-001'],
  autonomy: { escalate_on: nineKinds() }, state: 'DESIGN', validated_at: null, fingerprint: null,
  created_at: '2026-10-04T12:00:00Z', started_at: null, completed_at: null,
});

test('schema: the nine Escalation kinds are defined once, in the Registry', () => {
  assert.deepEqual(escalationKinds(), ['protected-path', 'invariant', 'architecture', 'security', 'public-contract', 'domain-semantics', 'scope', 'manual-gate', 'context-gap']);
  for (const f of readdirSync(join(REPO, 'core', 'control')).filter((x) => x.endsWith('.mjs'))) {
    assert.doesNotMatch(readFileSync(join(REPO, 'core', 'control', f), 'utf8'), /protected-path|domain-semantics/, f);
  }
});

test('schema: a valid unit passes; canonical form keeps the key order', () => {
  assert.deepEqual(validateUnit(unit()), []);
  assert.deepEqual(Object.keys(canonicalUnit(unit())), ['id', 'spec', 'scope', 'sop', 'constraints', 'autonomy', 'state', 'validated_at', 'fingerprint', 'created_at', 'started_at', 'completed_at']);
});

test('schema: unit rejects unknown keys, bad scope, removed kinds, snapshot outside READY', () => {
  const bad = (patch) => validateUnit({ ...unit(), ...patch }).join('\n');
  assert.match(bad({ extra: 1 }), /unknown key 'extra'/);
  assert.match(bad({ scope: [] }), /scope/);
  assert.match(bad({ scope: ['AC-1'] }), /AC id/);
  assert.match(bad({ autonomy: { escalate_on: ['conflict'] } }), /not an Escalation kind/);
  assert.match(bad({ autonomy: { escalate_on: ['scope', 'scope'] } }), /duplicate/);
  assert.match(bad({ validated_at: '2026-10-04T12:00:00Z' }), /only set while READY/);
  assert.match(bad({ state: 'READY' }), /validated_at: required in READY/);
  assert.match(bad({ state: 'EXECUTING' }), /started_at: required/);
  assert.match(bad({ state: 'DONE', started_at: '2026-10-04T12:00:00Z' }), /completed_at: required/);
  assert.match(bad({ state: 'BOGUS' }), /not a state/);
  assert.match(bad({ spec: 'docs/specs/x.md' }), /not a path/);
  assert.match(bad({ constraints: ['INV-1'] }), /INV id/);
});

const rec = (type, payload, over = {}) => ({ seq: 2, at: '2026-10-04T12:00:01Z', type, actor: 'a', evidence: { class: 'OBSERVED', source: 's' }, payload, ...over });
const env = { host: 'h', os: 'linux', path: '/p', head: 'abc', tools: ['git'], agent_platform: null };

test('schema: every record type has a valid and an invalid form', () => {
  const ok = [
    rec('transition', { from: 'DESIGN', to: 'READY', reason: 'r' }),
    rec('validation', { result: 'pass', purpose: 'ready', fingerprint: `sha256:${'a'.repeat(64)}`, base_commit: 'abc', findings: [], environment: env }),
    rec('validation', { result: 'fail', purpose: 'start', fingerprint: null, base_commit: null, findings: [{ check: 8, message: 'm', kind: 'context-gap' }], environment: env }),
    rec('verification', { criterion: 'AC-001', result: 'pass', commit: null, detail: 'd' }),
    rec('escalation-opened', { id: 'execution-001:2', kind: 'scope', question: 'q', impact: 'i', affected_artifacts: ['spec-x'] }),
    rec('escalation-resolved', { id: 'execution-001:2', resolution: 'r', links: { adr: null, spec: 'spec-y' } }),
  ];
  for (const r of ok) assert.deepEqual(validateRecord(r), [], r.type);
  const bad = [
    rec('transition', { from: 'DESIGN', to: 'NOPE', reason: 'r' }),
    rec('transition', { from: null, to: 'DESIGN', reason: 'r' }), // empty from only at seq 1
    rec('validation', { result: 'pass', purpose: 'ready', fingerprint: null, base_commit: null, findings: [{ check: 1, message: 'm', kind: null }], environment: env }),
    rec('validation', { result: 'fail', purpose: 'ready', fingerprint: null, base_commit: null, findings: [], environment: env }),
    rec('verification', { criterion: 'AC-1', result: 'pass', commit: null, detail: 'd' }),
    rec('escalation-opened', { id: 'execution-001:9', kind: 'scope', question: 'q', impact: 'i', affected_artifacts: [] }),
    rec('escalation-opened', { id: 'execution-001:2', kind: 'conflict', question: 'q', impact: 'i', affected_artifacts: [] }),
    rec('escalation-resolved', { id: 'execution-001:2', resolution: 'r', links: { adr: null } }),
    rec('decision', {}),
    rec('transition', { from: 'DESIGN', to: 'READY', reason: 'r' }, { evidence: { class: 'GUESSED', source: 's' } }),
    rec('transition', { from: 'DESIGN', to: 'READY', reason: 'r' }, { extra: 1 }),
  ];
  for (const r of bad) assert.notDeepEqual(validateRecord(r), [], JSON.stringify(r).slice(0, 80));
});

test('schema: the evidence classes are exactly the existing four', () => {
  for (const c of ['OBSERVED', 'EVIDENCED', 'INFERRED', 'CLAIMED']) {
    assert.deepEqual(validateRecord(rec('verification', { criterion: 'AC-001', result: 'pass', commit: null, detail: 'd' }, { evidence: { class: c, source: 's' } })), []);
  }
});

test('schema: canonical record has a fixed order', () => {
  const c = canonicalRecord(rec('transition', { reason: 'r', to: 'READY', from: 'DESIGN' }));
  assert.deepEqual(Object.keys(c), ['seq', 'at', 'type', 'actor', 'evidence', 'payload']);
  assert.deepEqual(Object.keys(c.payload), ['from', 'to', 'reason']);
});
