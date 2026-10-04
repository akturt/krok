// core/control/ready.mjs — READY validation, fingerprint and the transitions that
// depend on a fresh validation (v3 Spec §4.4–4.8).
//
// READY is a validation snapshot (validated_at + fingerprint), never a permanent
// flag. `start` and `resume` always validate again. The Reality Engine stays the
// only source of reconstructed reality: drift comes from its analyzers.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from './yaml.mjs';
import { escalationKinds, resolveSop, CONTROL_ROOT } from './registry.mjs';
import { validateUnit } from './schema.mjs';
import { findDocById, allDocIds, acceptanceCriteria, hasExcludedScope, invariantText } from './spec.mjs';
import { readUnit, listRecords, appendRecord, transitionUnit, saveUnit, utc, DEFAULT_EVIDENCE } from './store.mjs';
import { openEscalation, openEscalations } from './escalation.mjs';

const TOOLS = ['git', 'node', 'bash'];

// ---------- Execution Environment (§4.7): execution-scoped, never stored in project.yml ----------

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function discoverEnvironment(root, { agentPlatform = null } = {}) {
  return {
    host: hostname(),
    os: platform(),
    path: root.replace(/\\/g, '/'),
    head: run('git', ['rev-parse', 'HEAD'], root),
    tools: TOOLS.filter((t) => spawnSync(t, ['--version'], { encoding: 'utf8' }).status === 0).sort(),
    agent_platform: agentPlatform,
  };
}

function repositoryIdentity(root) {
  const file = join(root, '.context', 'project.yml');
  if (!existsSync(file)) return null;
  try { return parse(readFileSync(file, 'utf8'))?.repository?.name ?? null; } catch { return null; }
}

// ---------- Reality Engine drift (§4.4 check 8) ----------

export function realityDrift(root) {
  const items = [];
  for (const name of ['adr-drift', 'documentation-drift', 'spec-drift']) {
    const script = join(CONTROL_ROOT, 'engine', 'reality-engine', 'analyzers', `${name}.sh`);
    const r = spawnSync('bash', [script, root], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Reality Engine analyzer ${name} failed: ${(r.stderr || '').trim()}`);
    const json = JSON.parse(r.stdout);
    for (const key of Object.keys(json)) if (key.endsWith('drift_items') && Array.isArray(json[key])) items.push(...json[key]);
  }
  return items;
}

// A drift item matches a Spec when it mentions the Spec id, one of its entity_refs or touches.
export function matchingDrift(items, specFm) {
  const tokens = [specFm.id, ...(specFm.entity_refs || []), ...(specFm.touches || [])].filter((t) => typeof t === 'string' && t);
  return items.map((i) => JSON.stringify(i)).filter((s) => tokens.some((t) => s.includes(`"${t}"`))).sort();
}

// ---------- Validation (§4.4) ----------

function adrIds(specFm) {
  return [...new Set([...(specFm.implements || []), ...(specFm.depends_on || [])])].filter((x) => typeof x === 'string' && x.startsWith('adr-')).sort();
}

function fingerprintOf(inputs) {
  const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(inputs))).digest('hex')}`;
}

function normalizeText(t) {
  return t.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
}

export function computeFingerprint(root, unit, { reality = realityDrift } = {}) {
  const spec = findDocById(root, 'specs', unit.spec);
  const adrs = {};
  if (spec) for (const id of adrIds(spec.fm)) adrs[id] = findDocById(root, 'adr', id)?.fm.status ?? null;
  const invariants = {};
  for (const id of unit.constraints) invariants[id] = invariantText(root, id);
  const boundariesFile = join(root, '.context', 'boundaries.yml');
  const { state, validated_at, fingerprint, ...definition } = unit;
  void state; void validated_at; void fingerprint;
  return fingerprintOf({
    spec: spec ? { text: normalizeText(spec.text), path_status: spec.dir } : null,
    adrs,
    invariants,
    boundaries: existsSync(boundariesFile) ? normalizeText(readFileSync(boundariesFile, 'utf8')) : null,
    unit: definition,
    drift: spec ? matchingDrift(reality(root), spec.fm) : [],
  });
}

function autonomyFindings(unit, specBody, root) {
  const out = [];
  const kinds = escalationKinds();
  const missing = kinds.filter((k) => !unit.autonomy.escalate_on.includes(k));
  for (const k of missing) {
    const line = new RegExp(`^\\s*(?:[-*]\\s*)?Autonomy:\\s*.*\\b${k}\\b`, 'm');
    if (!specBody || !line.test(specBody)) {
      out.push({ check: 6, message: `'${k}' is removed from escalate_on without an explicit "Autonomy: ${k}" statement in the approved Spec`, kind: null });
    }
  }
  return out;
}

export function validateReady(root, unit, { reality = realityDrift, agentPlatform = null } = {}) {
  const findings = [];
  const add = (check, message, kind = null) => findings.push({ check, message, kind });
  const environment = discoverEnvironment(root, { agentPlatform });

  const defErrors = validateUnit(unit);
  for (const e of defErrors) add(6, `unit definition: ${e}`);

  // 1. Spec exists and is in approved/
  const spec = findDocById(root, 'specs', unit.spec);
  if (!spec) add(1, `Spec '${unit.spec}' not found`);
  else if (spec.dir !== 'approved' || spec.fm.status !== 'approved') add(1, `Spec '${unit.spec}' is not approved (directory '${spec.dir}', status '${spec.fm.status}')`);

  if (spec) {
    // 2. referenced ADRs are accepted
    for (const id of adrIds(spec.fm)) {
      const adr = findDocById(root, 'adr', id);
      if (!adr) add(2, `ADR '${id}' referenced by the Spec does not exist`);
      else if (adr.fm.status !== 'accepted') add(2, `ADR '${id}' is '${adr.fm.status}', not accepted`);
    }
    // 3. scope ids exist; Spec has Scope -> Excluded
    const acs = acceptanceCriteria(spec.body) || [];
    if (unit.scope !== 'all') for (const id of unit.scope) if (!acs.includes(id)) add(3, `scope ${id} is not an Acceptance criterion of the Spec`, 'scope');
    if (unit.scope === 'all' && acs.length === 0) add(3, 'the Spec has no Acceptance criteria', 'scope');
    if (!hasExcludedScope(spec.body)) add(3, 'the Spec has no "Scope -> Excluded" section', 'scope');
  }

  // 4. constraints exist in the invariants document
  for (const id of unit.constraints) if (invariantText(root, id) === null) add(4, `constraint ${id} is not defined in docs/architecture/invariants.md`, 'invariant');

  // 5. SOP resolves
  const sop = resolveSop(unit.sop.name, unit.sop.version);
  if (!sop.ok) add(5, sop.reason);

  // 6. autonomy policy
  findings.push(...autonomyFindings(unit, spec?.body, root));

  // 7. environment
  const identity = repositoryIdentity(root);
  const remote = run('git', ['remote', 'get-url', 'origin'], root);
  if (!environment.head) add(7, 'the project root is not a git checkout with a commit');
  else if (!identity) add(7, 'repository identity is missing in .context/project.yml');
  else if (!remote) add(7, 'repository identity cannot be observed: no "origin" remote');
  else if (basename(remote).replace(/\.git$/, '') !== identity) add(7, `checkout '${remote}' does not match repository identity '${identity}'`);
  for (const t of ['git', 'node']) if (!environment.tools.includes(t)) add(7, `required tool '${t}' is not available`);
  if (sop.ok) {
    const required = [...new Set((sop.sop.steps || []).map((s) => s.platform).filter((p) => p && p !== 'any'))];
    if (required.length && !required.includes(agentPlatform)) add(7, `SOP steps require platform ${required.join('|')}, agent platform is '${agentPlatform ?? 'unknown'}'`);
  }

  // 8. Reality drift matching the Spec; 9. context sufficiency
  if (spec) {
    let items = [];
    try { items = matchingDrift(reality(root), spec.fm); } catch (e) { add(8, `Reality Engine unavailable: ${e.message}`, 'context-gap'); }
    for (const i of items) add(8, `Reality drift: ${i}`, 'context-gap');
    const known = allDocIds(root);
    for (const ref of spec.fm.entity_refs || []) if (!known.has(ref)) add(9, `entity ref '${ref}' of the Spec does not resolve`, 'context-gap');
  }

  const ok = findings.length === 0;
  return {
    ok,
    findings,
    fingerprint: ok ? computeFingerprint(root, unit, { reality }) : null,
    base_commit: environment.head,
    environment,
  };
}

function validationRecord(root, id, purpose, result, actor, now) {
  return appendRecord(root, id, {
    type: 'validation', actor, at: now(),
    evidence: { class: 'OBSERVED', source: 'core/control/ready' },
    payload: {
      result: result.ok ? 'pass' : 'fail', purpose, fingerprint: result.fingerprint, base_commit: result.base_commit,
      findings: result.findings, environment: result.environment,
    },
  });
}

// ---------- transitions that need validation ----------

// DESIGN -> READY
export function ready(root, id, { actor, now = utc, reality = realityDrift, agentPlatform = null }) {
  const unit = readUnit(root, id);
  if (unit.state !== 'DESIGN') throw new Error(`illegal transition ${unit.state} -> READY`);
  const result = validateReady(root, unit, { reality, agentPlatform });
  const rec = validationRecord(root, id, 'ready', result, actor, now);
  if (!result.ok) return { ok: false, findings: result.findings, unit };
  const next = transitionUnit(root, id, 'READY', { actor, reason: 'validation passed', now, snapshot: { validated_at: rec.at, fingerprint: result.fingerprint } });
  return { ok: true, findings: [], unit: next };
}

// READY -> EXECUTING, after a fresh validation. A failure sends the unit back to DESIGN
// and opens an Escalation for each finding kind that needs a human.
export function start(root, id, { actor, now = utc, reality = realityDrift, agentPlatform = null }) {
  const unit = readUnit(root, id);
  if (unit.state !== 'READY') throw new Error(`illegal transition ${unit.state} -> EXECUTING`);
  const result = validateReady(root, unit, { reality, agentPlatform });
  validationRecord(root, id, 'start', result, actor, now);
  if (result.ok) return { ok: true, findings: [], unit: transitionUnit(root, id, 'EXECUTING', { actor, reason: 'fresh validation passed', now }) };
  let next = transitionUnit(root, id, 'DESIGN', { actor, reason: 'start validation failed', now });
  for (const kind of [...new Set(result.findings.map((f) => f.kind).filter(Boolean))]) {
    const own = result.findings.filter((f) => f.kind === kind);
    next = openEscalation(root, id, {
      kind, actor, now,
      question: own.map((f) => f.message).join('; '),
      impact: 'the Execution Unit cannot start',
      affected_artifacts: [unit.spec],
      evidence: { class: 'OBSERVED', source: 'core/control/ready' },
    }).unit;
  }
  return { ok: false, findings: result.findings, unit: next };
}

// BLOCKED -> EXECUTING: every Escalation resolved and a fresh validation passes.
export function resume(root, id, { actor, now = utc, reality = realityDrift, agentPlatform = null }) {
  const unit = readUnit(root, id);
  if (unit.state !== 'BLOCKED') throw new Error(`illegal transition ${unit.state} -> EXECUTING`);
  const open = openEscalations(root, id);
  if (open.length) return { ok: false, findings: open.map((e) => ({ check: 9, message: `Escalation ${e.id} is open`, kind: e.kind })), unit };
  const result = validateReady(root, unit, { reality, agentPlatform });
  validationRecord(root, id, 'resume', result, actor, now);
  if (!result.ok) return { ok: false, findings: result.findings, unit };
  return { ok: true, findings: [], unit: transitionUnit(root, id, 'EXECUTING', { actor, reason: 'resolution recorded and revalidation passed', now }) };
}

// READY displays as stale when the recomputed fingerprint differs. Computed, never stored.
export function isStale(root, id, { reality = realityDrift } = {}) {
  const unit = readUnit(root, id);
  if (unit.state !== 'READY') return false;
  return computeFingerprint(root, unit, { reality }) !== unit.fingerprint;
}

// ---------- verification and completion ----------

export function verifyStart(root, id, { actor, now = utc }) {
  return transitionUnit(root, id, 'VERIFYING', { actor, reason: 'completion claimed', now });
}

export function recordVerification(root, id, { actor, criterion, result, detail, commit = null, evidence, now = utc }) {
  const unit = readUnit(root, id);
  if (unit.state !== 'VERIFYING') throw new Error(`verification records are written in VERIFYING, unit is ${unit.state}`);
  const spec = findDocById(root, 'specs', unit.spec);
  const scope = unit.scope === 'all' ? (spec ? acceptanceCriteria(spec.body) || [] : []) : unit.scope;
  if (!scope.includes(criterion)) throw new Error(`${criterion} is not in the scope of ${id}`);
  return appendRecord(root, id, { type: 'verification', actor, evidence, at: now(), payload: { criterion, result, commit, detail } });
}

// VERIFYING -> DONE only with evidence: each criterion in scope has a passing verification
// record (OBSERVED or EVIDENCED) written after the unit entered VERIFYING, and Reality
// reports no drift matching the Spec.
export function complete(root, id, { actor, now = utc, reality = realityDrift }) {
  const unit = readUnit(root, id);
  if (unit.state !== 'VERIFYING') throw new Error(`illegal transition ${unit.state} -> DONE`);
  const spec = findDocById(root, 'specs', unit.spec);
  const findings = [];
  const scope = unit.scope === 'all' ? (spec ? acceptanceCriteria(spec.body) || [] : []) : unit.scope;
  const recs = listRecords(root, id).map((x) => x.record);
  const entered = [...recs].reverse().find((r) => r.type === 'transition' && r.payload.to === 'VERIFYING');
  const latest = new Map();
  for (const r of recs) if (r.type === 'verification' && r.seq > (entered?.seq ?? 0)) latest.set(r.payload.criterion, r);
  for (const c of scope) {
    const r = latest.get(c);
    if (!r) findings.push({ check: 9, message: `${c} has no verification record`, kind: null });
    else if (r.payload.result !== 'pass') findings.push({ check: 9, message: `${c} verification failed`, kind: null });
    else if (!['OBSERVED', 'EVIDENCED'].includes(r.evidence.class)) findings.push({ check: 9, message: `${c} is supported only by ${r.evidence.class} evidence`, kind: null });
  }
  if (spec) {
    try { for (const i of matchingDrift(reality(root), spec.fm)) findings.push({ check: 8, message: `Reality drift: ${i}`, kind: 'context-gap' }); }
    catch (e) { findings.push({ check: 8, message: `Reality Engine unavailable: ${e.message}`, kind: 'context-gap' }); }
  } else findings.push({ check: 1, message: `Spec '${unit.spec}' not found`, kind: null });
  const result = { ok: findings.length === 0, findings, fingerprint: null, base_commit: run('git', ['rev-parse', 'HEAD'], root), environment: discoverEnvironment(root) };
  validationRecord(root, id, 'complete', result, actor, now);
  if (!result.ok) return { ok: false, findings, unit };
  return { ok: true, findings: [], unit: transitionUnit(root, id, 'DONE', { actor, reason: 'required verification passed', now }) };
}

export function cancel(root, id, { actor, reason, now = utc }) {
  return transitionUnit(root, id, 'CANCELLED', { actor, reason, now });
}

// BLOCKED -> DESIGN: the context is no longer valid.
export function redesign(root, id, { actor, reason, now = utc }) {
  return transitionUnit(root, id, 'DESIGN', { actor, reason, now });
}

// Editing the definition (scope, sop, constraints, autonomy) is allowed in DESIGN and READY;
// a READY unit goes back to DESIGN, because its snapshot no longer describes the definition.
export function updateDefinition(root, id, patch, { actor, now = utc }) {
  let unit = readUnit(root, id);
  if (unit.state === 'READY') unit = transitionUnit(root, id, 'DESIGN', { actor, reason: 'definition edited', now });
  if (unit.state !== 'DESIGN') throw new Error(`the definition of a ${unit.state} unit cannot be edited`);
  const allowed = ['scope', 'sop', 'constraints', 'autonomy'];
  for (const k of Object.keys(patch)) if (!allowed.includes(k)) throw new Error(`'${k}' is not part of the editable definition`);
  const next = { ...unit, ...patch };
  saveUnit(root, next);
  return readUnit(root, id);
}

export { DEFAULT_EVIDENCE };
