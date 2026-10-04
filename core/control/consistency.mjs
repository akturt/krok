// core/control/consistency.mjs — consistency between unit.yml and the records
// (v3 Spec §7, ADR-006). Fails when:
//   - unit.yml or a record violates its schema, or is not in canonical form;
//   - seq has gaps, or a file name disagrees with seq, time or type of its record;
//   - the transition records are not a legal chain from DESIGN, or unit.yml.state
//     disagrees with the latest transition record;
//   - an Escalation is resolved without being opened, or resolved twice;
//   - a written record was modified after creation (git: modified/deleted relative
//     to HEAD; with BASE_REF: different from the base ref).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from './yaml.mjs';
import { validateUnit, validateRecord, canonicalUnit, canonicalRecord } from './schema.mjs';
import { canTransition } from './states.mjs';
import { executionRoot, parseRecordFileName, compactUtc } from './store.mjs';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

const norm = (t) => t.replace(/\r\n/g, '\n');

export function checkUnit(root, id) {
  const errs = [];
  const err = (m) => errs.push(`${id}: ${m}`);
  const dir = join(executionRoot(root), id);
  const unitFile = join(dir, 'unit.yml');
  if (!existsSync(unitFile)) return [`${id}: unit.yml is missing`];

  let unit;
  const unitText = norm(readFileSync(unitFile, 'utf8'));
  try { unit = parse(unitText); } catch (e) { return [`${id}: unit.yml: ${e.message}`]; }
  const unitErrs = validateUnit(unit);
  unitErrs.forEach(err);
  if (unit && unit.id !== id) err(`directory name does not equal unit id '${unit.id}'`);
  if (!unitErrs.length && stringify(canonicalUnit(unit)) !== unitText) err('unit.yml is not in canonical form');

  const recDir = join(dir, 'records');
  const files = existsSync(recDir) ? readdirSync(recDir) : [];
  const records = [];
  for (const name of files.sort()) {
    const meta = parseRecordFileName(name);
    if (!meta) { err(`records/${name}: unexpected file name`); continue; }
    const text = norm(readFileSync(join(recDir, name), 'utf8'));
    let rec;
    try { rec = parse(text); } catch (e) { err(`records/${name}: ${e.message}`); continue; }
    const recErrs = validateRecord(rec);
    recErrs.forEach((e) => err(`records/${name}: ${e}`));
    if (recErrs.length) continue;
    if (rec.seq !== meta.seq) err(`records/${name}: file seq ${meta.seq} != record seq ${rec.seq}`);
    if (rec.type !== meta.type) err(`records/${name}: file type '${meta.type}' != record type '${rec.type}'`);
    if (compactUtc(rec.at) !== meta.utc) err(`records/${name}: file time does not equal record time`);
    if (stringify(canonicalRecord(rec)) !== text) err(`records/${name}: not in canonical form`);
    records.push(rec);
  }
  records.sort((a, b) => a.seq - b.seq);
  records.forEach((r, i) => { if (r.seq !== i + 1) err(`sequence gap or duplicate: expected seq ${i + 1}, found ${r.seq}`); });
  if (!records.length) { err('no records'); return errs; }
  if (unitErrs.length) return errs;

  // transition chain
  const transitions = records.filter((r) => r.type === 'transition');
  if (!transitions.length || transitions[0].seq !== 1 || transitions[0].payload.from !== null || transitions[0].payload.to !== 'DESIGN') {
    err('the first record must be the creation transition (empty -> DESIGN)');
  } else {
    let state = 'DESIGN';
    for (const t of transitions.slice(1)) {
      if (t.payload.from !== state) err(`record ${t.seq}: transition starts at ${t.payload.from}, chain is at ${state}`);
      else if (!canTransition(t.payload.from, t.payload.to)) err(`record ${t.seq}: illegal transition ${t.payload.from} -> ${t.payload.to}`);
      state = t.payload.to;
    }
    if (state !== unit.state) err(`unit.yml state ${unit.state} disagrees with the latest transition record (${state})`);
    const firstExec = transitions.find((t) => t.payload.to === 'EXECUTING');
    if ((firstExec ? firstExec.at : null) !== unit.started_at) err('unit.started_at does not equal the first transition to EXECUTING');
    const last = transitions[transitions.length - 1];
    const doneAt = ['DONE', 'CANCELLED'].includes(last.payload.to) ? last.at : null;
    if (doneAt !== unit.completed_at) err('unit.completed_at does not equal the terminal transition');
    if (unit.state === 'READY') {
      const v = [...records].reverse().find((r) => r.type === 'validation' && r.payload.purpose === 'ready' && r.payload.result === 'pass');
      if (!v || v.at !== unit.validated_at || v.payload.fingerprint !== unit.fingerprint) err('READY snapshot does not match the latest passing validation record');
    }
  }

  // escalations
  const opened = new Set();
  const resolved = new Set();
  for (const r of records) {
    if (r.type === 'escalation-opened') {
      if (!r.payload.id.startsWith(`${id}:`)) err(`record ${r.seq}: Escalation id does not belong to ${id}`);
      opened.add(r.payload.id);
    }
    if (r.type === 'escalation-resolved') {
      if (!opened.has(r.payload.id)) err(`record ${r.seq}: resolves ${r.payload.id}, which was not opened before`);
      if (resolved.has(r.payload.id)) err(`record ${r.seq}: ${r.payload.id} is already resolved`);
      resolved.add(r.payload.id);
    }
  }
  return errs;
}

export function checkImmutability(root, baseRef) {
  const errs = [];
  const exec = executionRoot(root);
  if (!existsSync(exec)) return errs;
  let top;
  let prefix;
  try {
    top = git(['rev-parse', '--show-toplevel'], root).trim();
    prefix = git(['rev-parse', '--show-prefix'], root).trim();
  } catch { return errs; } // not a git checkout: nothing to compare against

  const status = git(['status', '--porcelain=v1', '--', '.context/execution'], root).split(/\r?\n/).filter(Boolean);
  for (const line of status) {
    const code = line.slice(0, 2);
    const path = line.slice(3);
    if (/\/records\//.test(path) && /[MDRT]/.test(code)) errs.push(`${path}: a written record was modified or removed after creation`);
  }
  if (baseRef) {
    let names;
    try { names = git(['ls-tree', '-r', '--name-only', baseRef, '--', `${prefix}.context/execution`], top).split(/\r?\n/).filter((n) => /\/records\/[^/]+\.yml$/.test(n)); }
    catch { return [...errs, `BASE_REF '${baseRef}' cannot be resolved`]; }
    for (const n of names) {
      const abs = join(top, n);
      if (!existsSync(abs)) { errs.push(`${n}: record removed since ${baseRef}`); continue; }
      if (norm(git(['show', `${baseRef}:${n}`], top)) !== norm(readFileSync(abs, 'utf8'))) errs.push(`${n}: record changed since ${baseRef}`);
    }
  }
  return errs;
}

export function checkExecution(root, { baseRef = '' } = {}) {
  const exec = executionRoot(root);
  if (!existsSync(exec)) return [];
  const errs = [];
  for (const id of readdirSync(exec).sort()) {
    if (!statSync(join(exec, id)).isDirectory()) { errs.push(`${id}: only unit directories belong in .context/execution/`); continue; }
    errs.push(...checkUnit(root, id));
  }
  errs.push(...checkImmutability(root, baseRef));
  return errs;
}
