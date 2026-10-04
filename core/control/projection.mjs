// core/control/projection.mjs — read-only projections of Execution state (v3 Spec §8).
// Nothing is stored: every view is computed from unit.yml, the records and Reality output.
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATES } from './states.mjs';
import { executionRoot, readUnit, listRecords } from './store.mjs';
import { escalations } from './escalation.mjs';
import { computeFingerprint, realityDrift } from './ready.mjs';

// Open items of docs/backlog/active.md; a project without that file has none.
export function backlogActive(root) {
  const file = join(root, 'docs', 'backlog', 'active.md');
  if (!existsSync(file)) return 0;
  return (readFileSync(file, 'utf8').match(/^\s*-\s+\[ \]/gm) || []).length;
}

export function listUnitIds(root) {
  const dir = executionRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory()).sort();
}

// Reality drift is observed at most once per projection.
function once(reality) {
  let cache = null;
  return (root) => (cache ??= reality(root));
}

function staleOf(root, unit, reality) {
  if (unit.state !== 'READY') return false;
  return computeFingerprint(root, unit, { reality }) !== unit.fingerprint;
}

export function unitView(root, id, { reality = realityDrift } = {}) {
  const unit = readUnit(root, id);
  const records = listRecords(root, id).map((x) => x.record);
  return {
    unit,
    stale: staleOf(root, unit, once(reality)),
    escalations: escalations(root, id),
    records: records.map((r) => ({ seq: r.seq, at: r.at, type: r.type, actor: r.actor })),
  };
}

export function projectExecutions(root, { reality = realityDrift } = {}) {
  const drift = once(reality);
  return listUnitIds(root).map((id) => {
    const unit = readUnit(root, id);
    return { unit, stale: staleOf(root, unit, drift) };
  });
}

export function projectStatus(root, { reality = realityDrift } = {}) {
  const drift = once(reality);
  const units = listUnitIds(root).map((id) => {
    const unit = readUnit(root, id);
    const open = escalations(root, id).filter((e) => e.status === 'open').length;
    return { id, spec: unit.spec, state: unit.state, stale: staleOf(root, unit, drift), open_escalations: open };
  });
  const counts = Object.fromEntries(STATES.map((s) => [s, units.filter((u) => u.state === s).length]));
  return { units, counts, open_escalations: units.reduce((n, u) => n + u.open_escalations, 0), backlog: { active: backlogActive(root) } };
}

// attention: open Escalations only. It is never a task list.
export function projectAttention(root) {
  const out = [];
  for (const id of listUnitIds(root)) {
    for (const e of escalations(root, id)) {
      if (e.status !== 'open') continue;
      out.push({ id: e.id, execution: id, kind: e.kind, question: e.question, impact: e.impact, affected_artifacts: e.affected_artifacts, opened_at: e.opened_at });
    }
  }
  return out.sort((a, b) => (a.opened_at === b.opened_at ? (a.id < b.id ? -1 : 1) : a.opened_at < b.opened_at ? -1 : 1));
}

export function findEscalation(root, escalationId) {
  const unitId = escalationId.split(':')[0];
  if (!listUnitIds(root).includes(unitId)) return null;
  const e = escalations(root, unitId).find((x) => x.id === escalationId);
  return e ? { execution: unitId, ...e } : null;
}

export function allEscalations(root, executionId = null) {
  const ids = executionId ? [executionId] : listUnitIds(root);
  return ids.flatMap((id) => escalations(root, id).map((e) => ({ execution: id, ...e })));
}
