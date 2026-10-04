// core/control/execution.mjs — creating an Execution Unit from a Spec id.
// The id is allocated here (stable, never reused); the SOP version is the version
// the SOP file carries; autonomy defaults to every Escalation kind.
import { sopVersion } from './registry.mjs';
import { createUnit, utc } from './store.mjs';
import { listUnitIds } from './projection.mjs';
import { defaultAutonomy } from './escalation.mjs';

export function nextExecutionId(root) {
  const used = listUnitIds(root).map((id) => /^execution-(\d+)$/.exec(id)).filter(Boolean).map((m) => Number(m[1]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `execution-${String(next).padStart(3, '0')}`;
}

export function createExecution(root, { spec, scope = 'all', sop, actor, now = utc }) {
  return createUnit(root, {
    id: nextExecutionId(root),
    spec,
    scope,
    sop: { name: sop, version: sopVersion(sop) },
    constraints: [],
    autonomy: defaultAutonomy(),
  }, { actor, now });
}
