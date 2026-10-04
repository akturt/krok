// core/control/escalation.mjs — Escalation as two Execution Record types (v3 Spec §6).
// There is no stored Escalation entity: status (open | resolved) is derived from the
// unit's records. Opening an Escalation moves EXECUTING|VERIFYING to BLOCKED and READY
// to DESIGN; DESIGN stays DESIGN. Resolving never changes the unit state.
import { escalationKinds } from './registry.mjs';
import { readUnit, listRecords, appendRecord, nextSeq, transitionUnit, utc, DEFAULT_EVIDENCE } from './store.mjs';
import { isTerminal } from './states.mjs';

// escalate_on defaults to every kind. It is a trigger to stop, not a permission list.
export function defaultAutonomy() {
  return { escalate_on: [...escalationKinds()] };
}

export function mustEscalate(unit, kind) {
  return unit.autonomy.escalate_on.includes(kind);
}

export function escalations(root, id) {
  const opened = new Map();
  for (const { record: r } of listRecords(root, id)) {
    if (r.type === 'escalation-opened') opened.set(r.payload.id, { ...r.payload, status: 'open', opened_at: r.at, resolved_at: null, resolution: null, links: null });
    if (r.type === 'escalation-resolved' && opened.has(r.payload.id)) {
      Object.assign(opened.get(r.payload.id), { status: 'resolved', resolved_at: r.at, resolution: r.payload.resolution, links: r.payload.links });
    }
  }
  return [...opened.values()];
}

export function openEscalations(root, id) {
  return escalations(root, id).filter((e) => e.status === 'open');
}

export function openEscalation(root, id, { kind, question, impact, affected_artifacts = [], actor, evidence = DEFAULT_EVIDENCE, now = utc }) {
  const unit = readUnit(root, id);
  if (isTerminal(unit.state)) throw new Error(`cannot open an Escalation on a ${unit.state} unit`);
  const seq = nextSeq(root, id);
  appendRecord(root, id, {
    type: 'escalation-opened', actor, evidence, at: now(),
    payload: { id: `${id}:${seq}`, kind, question, impact, affected_artifacts },
  });
  let next = unit;
  if (unit.state === 'EXECUTING' || unit.state === 'VERIFYING') next = transitionUnit(root, id, 'BLOCKED', { actor, reason: `escalation ${id}:${seq} opened (${kind})`, now });
  else if (unit.state === 'READY') next = transitionUnit(root, id, 'DESIGN', { actor, reason: `escalation ${id}:${seq} opened (${kind})`, now });
  return { id: `${id}:${seq}`, unit: next };
}

export function resolveEscalation(root, id, { escalationId, resolution, links = {}, actor, evidence = DEFAULT_EVIDENCE, now = utc }) {
  const found = escalations(root, id).find((e) => e.id === escalationId);
  if (!found) throw new Error(`Escalation ${escalationId} not found`);
  if (found.status === 'resolved') throw new Error(`Escalation ${escalationId} is already resolved`);
  appendRecord(root, id, {
    type: 'escalation-resolved', actor, evidence, at: now(),
    payload: { id: escalationId, resolution, links: { adr: links.adr ?? null, spec: links.spec ?? null } },
  });
  return readUnit(root, id);
}
