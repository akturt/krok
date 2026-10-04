// core/control/cli/render.mjs — human-readable rendering of Core projections.
// Pure formatting: no rules, no reads. Output is deterministic for a given input
// (except `age`, which is relative to the clock and is shown only in human output).

const pad = (s, n) => String(s).padEnd(n);

function table(headers, rows) {
  if (rows.length === 0) return '';
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

export function age(openedAt, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - Date.parse(openedAt)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function status(v) {
  const head = `executions: ${v.units.length}   open escalations: ${v.open_escalations}`;
  const counts = Object.entries(v.counts).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join('   ');
  const rows = v.units.map((u) => [u.id, u.stale ? 'READY (stale)' : u.state, u.spec, u.open_escalations]);
  return [head, counts, table(['EXECUTION', 'STATE', 'SPEC', 'ESCALATIONS'], rows)].filter(Boolean).join('\n');
}

export function attention(items, now = Date.now()) {
  if (items.length === 0) return 'nothing needs attention';
  return items.map((e) => [
    `${e.id}  ${e.kind}  (age ${age(e.opened_at, now)})`,
    `  question: ${e.question}`,
    `  impact:   ${e.impact}`,
    `  affects:  ${e.affected_artifacts.join(', ') || '-'}`,
  ].join('\n')).join('\n\n');
}

export function executionList(items) {
  if (items.length === 0) return 'no executions';
  return table(['EXECUTION', 'STATE', 'SPEC', 'SCOPE'], items.map(({ unit: u, stale }) => [u.id, stale ? 'READY (stale)' : u.state, u.spec, u.scope === 'all' ? 'all' : u.scope.join(',')]));
}

export function executionShow(v) {
  const u = v.unit;
  const lines = [
    `${u.id}   ${v.stale ? 'READY (stale)' : u.state}`,
    `spec:        ${u.spec}`,
    `scope:       ${u.scope === 'all' ? 'all' : u.scope.join(', ')}`,
    `sop:         ${u.sop.name} v${u.sop.version}`,
    `constraints: ${u.constraints.join(', ') || '-'}`,
    `escalate_on: ${u.autonomy.escalate_on.join(', ')}`,
    `created:     ${u.created_at}`,
    `validated:   ${u.validated_at ?? '-'}`,
    `fingerprint: ${u.fingerprint ?? '-'}`,
    `started:     ${u.started_at ?? '-'}`,
    `completed:   ${u.completed_at ?? '-'}`,
    '',
    'escalations:',
    ...(v.escalations.length ? v.escalations.map((e) => `  ${e.id}  ${e.kind}  ${e.status}  ${e.question}`) : ['  -']),
    '',
    'records:',
    ...v.records.map((r) => `  ${String(r.seq).padStart(3)}  ${r.at}  ${r.type}  ${r.actor}`),
  ];
  return lines.join('\n');
}

export function findings(result, verb) {
  if (result.ok) return `${verb}: ok   ${result.unit.id} is ${result.unit.state}`;
  return [`${verb}: refused   ${result.unit.id} is ${result.unit.state}`, ...result.findings.map((f) => `  [check ${f.check}${f.kind ? `, ${f.kind}` : ''}] ${f.message}`)].join('\n');
}

export function escalationList(items) {
  if (items.length === 0) return 'no escalations';
  return table(['ESCALATION', 'KIND', 'STATUS', 'QUESTION'], items.map((e) => [e.id, e.kind, e.status, e.question]));
}

export function escalationShow(e) {
  return [
    `${e.id}   ${e.status}`,
    `kind:       ${e.kind}`,
    `question:   ${e.question}`,
    `impact:     ${e.impact}`,
    `affects:    ${e.affected_artifacts.join(', ') || '-'}`,
    `opened:     ${e.opened_at}`,
    `resolved:   ${e.resolved_at ?? '-'}`,
    `resolution: ${e.resolution ?? '-'}`,
    `links:      ${e.links ? `adr ${e.links.adr ?? '-'}, spec ${e.links.spec ?? '-'}` : '-'}`,
  ].join('\n');
}
