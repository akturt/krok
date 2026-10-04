// core/control/store.mjs — persistence of Execution Units and Execution Records
// (v3 Spec §5, §7; ADR-006).
//
//   .context/execution/<id>/unit.yml                         current operational state
//   .context/execution/<id>/records/<seq>-<utc>-<type>.yml   immutable history
//
// A state change writes the record first, then updates unit.yml. unit.yml is
// authoritative for the current state, records are the history. This is not
// event sourcing: nothing is rebuilt from records.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from './yaml.mjs';
import { validateUnit, validateRecord, canonicalUnit, canonicalRecord } from './schema.mjs';
import { canTransition, isTerminal } from './states.mjs';

export const DEFAULT_EVIDENCE = { class: 'OBSERVED', source: 'core/control' };

export function executionRoot(root) {
  return join(root, '.context', 'execution');
}

export function unitDir(root, id) {
  return join(executionRoot(root), id);
}

export function utc(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function compactUtc(at) {
  return at.replace(/[-:]/g, '');
}

const RECORD_FILE = /^(\d{6})-(\d{8}T\d{6}Z)-([a-z-]+)\.yml$/;

export function recordFileName(seq, at, type) {
  return `${String(seq).padStart(6, '0')}-${compactUtc(at)}-${type}.yml`;
}

export function parseRecordFileName(name) {
  const m = RECORD_FILE.exec(name);
  return m ? { seq: Number(m[1]), utc: m[2], type: m[3] } : null;
}

export function readUnit(root, id) {
  const file = join(unitDir(root, id), 'unit.yml');
  if (!existsSync(file)) throw new Error(`unit '${id}' not found`);
  return parse(readFileSync(file, 'utf8'));
}

export function saveUnit(root, unit) {
  writeUnit(root, unit);
}

function writeUnit(root, unit) {
  const errs = validateUnit(unit);
  if (errs.length) throw new Error(`invalid unit: ${errs.join('; ')}`);
  const file = join(unitDir(root, unit.id), 'unit.yml');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, stringify(canonicalUnit(unit)));
  renameSync(tmp, file);
}

export function listRecords(root, id) {
  const dir = join(unitDir(root, id), 'records');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, meta: parseRecordFileName(name) }))
    .filter((x) => x.meta)
    .sort((a, b) => a.meta.seq - b.meta.seq)
    .map((x) => ({ name: x.name, record: parse(readFileSync(join(dir, x.name), 'utf8')) }));
}

export function nextSeq(root, id) {
  const recs = listRecords(root, id);
  return recs.length === 0 ? 1 : recs[recs.length - 1].record.seq + 1;
}

// Append-only: the file is created exclusively and never rewritten.
export function appendRecord(root, id, { type, actor, evidence = DEFAULT_EVIDENCE, payload, at = utc() }) {
  const seq = nextSeq(root, id);
  const record = canonicalRecord({ seq, at, type, actor, evidence, payload });
  const errs = validateRecord(record);
  if (errs.length) throw new Error(`invalid record: ${errs.join('; ')}`);
  const dir = join(unitDir(root, id), 'records');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, recordFileName(seq, at, type)), stringify(record), { flag: 'wx' });
  return record;
}

export function createUnit(root, def, { actor, now = utc } = {}) {
  const created_at = now();
  const unit = canonicalUnit({
    id: def.id, spec: def.spec, scope: def.scope ?? 'all', sop: def.sop, constraints: def.constraints ?? [],
    autonomy: def.autonomy, state: 'DESIGN', validated_at: null, fingerprint: null,
    created_at, started_at: null, completed_at: null,
  });
  const errs = validateUnit(unit);
  if (errs.length) throw new Error(`invalid unit: ${errs.join('; ')}`);
  if (existsSync(unitDir(root, unit.id))) throw new Error(`execution id '${unit.id}' already exists; ids are never reused`);
  mkdirSync(unitDir(root, unit.id), { recursive: true });
  appendRecord(root, unit.id, { type: 'transition', actor, at: created_at, payload: { from: null, to: 'DESIGN', reason: 'created' } });
  writeUnit(root, unit);
  return unit;
}

// The only way the state changes: record first, then unit.yml.
export function transitionUnit(root, id, to, { actor, reason, evidence = DEFAULT_EVIDENCE, snapshot = null, now = utc }) {
  const unit = readUnit(root, id);
  if (!canTransition(unit.state, to)) {
    throw new Error(`illegal transition ${unit.state} -> ${to}${isTerminal(unit.state) ? ' (terminal state)' : ''}`);
  }
  if (to === 'READY' && !snapshot) throw new Error('READY requires a validation snapshot');
  const at = now();
  appendRecord(root, id, { type: 'transition', actor, evidence, at, payload: { from: unit.state, to, reason } });
  const next = { ...unit, state: to, validated_at: null, fingerprint: null };
  if (to === 'READY') { next.validated_at = snapshot.validated_at; next.fingerprint = snapshot.fingerprint; }
  if (to === 'EXECUTING' && next.started_at === null) next.started_at = at;
  if (isTerminal(to)) next.completed_at = at;
  writeUnit(root, next);
  return next;
}
