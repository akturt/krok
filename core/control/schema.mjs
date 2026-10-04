// core/control/schema.mjs — closed schemas for unit.yml and Execution Records
// (v3 Spec §4.2, §5, §6). Validators return a list of error strings; empty = valid.
import { STATES, TERMINAL } from './states.mjs';
import { escalationKinds } from './registry.mjs';

export const RECORD_TYPES = ['transition', 'validation', 'verification', 'escalation-opened', 'escalation-resolved'];
export const EVIDENCE_CLASSES = ['OBSERVED', 'EVIDENCED', 'INFERRED', 'CLAIMED'];
export const UNIT_KEYS = ['id', 'spec', 'scope', 'sop', 'constraints', 'autonomy', 'state', 'validated_at', 'fingerprint', 'created_at', 'started_at', 'completed_at'];
export const RECORD_KEYS = ['seq', 'at', 'type', 'actor', 'evidence', 'payload'];

const ID = /^[a-z0-9][a-z0-9-]*$/;
const AC = /^AC-\d{3}$/;
const INV = /^INV-\d{3}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

function closed(obj, keys, where, errs) {
  if (!isObj(obj)) { errs.push(`${where}: must be a mapping`); return false; }
  for (const k of Object.keys(obj)) if (!keys.includes(k)) errs.push(`${where}: unknown key '${k}'`);
  for (const k of keys) if (!(k in obj)) errs.push(`${where}: missing key '${k}'`);
  return true;
}

function uniqueList(v, re, where, errs, what) {
  if (!Array.isArray(v)) { errs.push(`${where}: must be a list`); return; }
  for (const x of v) if (typeof x !== 'string' || !re.test(x)) errs.push(`${where}: '${x}' is not a valid ${what}`);
  if (new Set(v).size !== v.length) errs.push(`${where}: duplicate entries`);
}

export function validateUnit(u) {
  const errs = [];
  if (!closed(u, UNIT_KEYS, 'unit', errs)) return errs;
  if (!(typeof u.id === 'string' && ID.test(u.id))) errs.push('unit.id: must be a kebab-case id');
  if (!(typeof u.spec === 'string' && ID.test(u.spec))) errs.push('unit.spec: must be a Spec frontmatter id, not a path');
  if (u.scope !== 'all') {
    if (!Array.isArray(u.scope) || u.scope.length === 0) errs.push('unit.scope: must be "all" or a non-empty list of AC ids');
    else uniqueList(u.scope, AC, 'unit.scope', errs, 'AC id');
  }
  if (closed(u.sop, ['name', 'version'], 'unit.sop', errs)) {
    if (!isStr(u.sop.name)) errs.push('unit.sop.name: must be a non-empty string');
    if (!(isInt(u.sop.version) && u.sop.version >= 1)) errs.push('unit.sop.version: must be an integer >= 1');
  }
  uniqueList(u.constraints, INV, 'unit.constraints', errs, 'INV id');
  if (closed(u.autonomy, ['escalate_on'], 'unit.autonomy', errs)) {
    const kinds = escalationKinds();
    if (!Array.isArray(u.autonomy.escalate_on)) errs.push('unit.autonomy.escalate_on: must be a list');
    else {
      for (const k of u.autonomy.escalate_on) if (!kinds.includes(k)) errs.push(`unit.autonomy.escalate_on: '${k}' is not an Escalation kind`);
      if (new Set(u.autonomy.escalate_on).size !== u.autonomy.escalate_on.length) errs.push('unit.autonomy.escalate_on: duplicate entries');
    }
  }
  if (!STATES.includes(u.state)) errs.push(`unit.state: '${u.state}' is not a state`);
  const ready = u.state === 'READY';
  if (ready && !(isStr(u.validated_at) && UTC.test(u.validated_at))) errs.push('unit.validated_at: required in READY (UTC)');
  if (ready && !(isStr(u.fingerprint) && FINGERPRINT.test(u.fingerprint))) errs.push('unit.fingerprint: required in READY (sha256:<hex>)');
  if (!ready && (u.validated_at !== null || u.fingerprint !== null)) errs.push('unit.validated_at/fingerprint: only set while READY');
  if (!(isStr(u.created_at) && UTC.test(u.created_at))) errs.push('unit.created_at: must be UTC');
  for (const k of ['started_at', 'completed_at']) {
    if (u[k] !== null && !(isStr(u[k]) && UTC.test(u[k]))) errs.push(`unit.${k}: must be UTC or empty`);
  }
  if (['EXECUTING', 'VERIFYING', 'BLOCKED', 'DONE'].includes(u.state) && u.started_at === null) errs.push(`unit.started_at: required in ${u.state}`);
  if (TERMINAL.includes(u.state) && u.completed_at === null) errs.push(`unit.completed_at: required in ${u.state}`);
  if (!TERMINAL.includes(u.state) && u.completed_at !== null) errs.push('unit.completed_at: only set in a terminal state');
  return errs;
}

export function validateRecord(r) {
  const errs = [];
  if (!closed(r, RECORD_KEYS, 'record', errs)) return errs;
  if (!(isInt(r.seq) && r.seq >= 1)) errs.push('record.seq: must be an integer >= 1');
  if (!(isStr(r.at) && UTC.test(r.at))) errs.push('record.at: must be UTC');
  if (!RECORD_TYPES.includes(r.type)) { errs.push(`record.type: '${r.type}' is not a record type`); return errs; }
  if (!isStr(r.actor)) errs.push('record.actor: must be a non-empty string');
  if (closed(r.evidence, ['class', 'source'], 'record.evidence', errs)) {
    if (!EVIDENCE_CLASSES.includes(r.evidence.class)) errs.push(`record.evidence.class: '${r.evidence.class}' is not an Evidence class`);
    if (!isStr(r.evidence.source)) errs.push('record.evidence.source: must be a non-empty string');
  }
  const p = r.payload;
  const w = `record(${r.type}).payload`;
  switch (r.type) {
    case 'transition':
      if (closed(p, ['from', 'to', 'reason'], w, errs)) {
        if (p.from !== null && !STATES.includes(p.from)) errs.push(`${w}.from: '${p.from}' is not a state`);
        if (!STATES.includes(p.to)) errs.push(`${w}.to: '${p.to}' is not a state`);
        if (p.from === null && !(p.to === 'DESIGN' && r.seq === 1)) errs.push(`${w}.from: empty only for the creation record (seq 1, to DESIGN)`);
        if (!isStr(p.reason)) errs.push(`${w}.reason: must be a non-empty string`);
      }
      break;
    case 'validation':
      if (closed(p, ['result', 'purpose', 'fingerprint', 'base_commit', 'findings', 'environment'], w, errs)) {
        if (!['pass', 'fail'].includes(p.result)) errs.push(`${w}.result: pass or fail`);
        if (!['ready', 'start', 'resume', 'complete'].includes(p.purpose)) errs.push(`${w}.purpose: ready, start, resume or complete`);
        if (p.fingerprint !== null && !(isStr(p.fingerprint) && FINGERPRINT.test(p.fingerprint))) errs.push(`${w}.fingerprint: sha256:<hex> or empty`);
        if (p.base_commit !== null && !isStr(p.base_commit)) errs.push(`${w}.base_commit: string or empty`);
        if (!Array.isArray(p.findings)) errs.push(`${w}.findings: must be a list`);
        else {
          const kinds = escalationKinds();
          p.findings.forEach((f, i) => {
            if (!closed(f, ['check', 'message', 'kind'], `${w}.findings[${i}]`, errs)) return;
            if (!(isInt(f.check) && f.check >= 1 && f.check <= 9)) errs.push(`${w}.findings[${i}].check: 1..9`);
            if (!isStr(f.message)) errs.push(`${w}.findings[${i}].message: non-empty string`);
            if (f.kind !== null && !kinds.includes(f.kind)) errs.push(`${w}.findings[${i}].kind: not an Escalation kind`);
          });
        }
        if (p.result === 'pass' && Array.isArray(p.findings) && p.findings.length) errs.push(`${w}: a passing validation has no findings`);
        if (p.result === 'fail' && Array.isArray(p.findings) && !p.findings.length) errs.push(`${w}: a failing validation lists findings`);
        if (closed(p.environment, ['host', 'os', 'path', 'head', 'tools', 'agent_platform'], `${w}.environment`, errs)) {
          for (const k of ['host', 'os', 'path']) if (!isStr(p.environment[k])) errs.push(`${w}.environment.${k}: non-empty string`);
          if (p.environment.head !== null && !isStr(p.environment.head)) errs.push(`${w}.environment.head: string or empty`);
          if (!Array.isArray(p.environment.tools)) errs.push(`${w}.environment.tools: list`);
          if (p.environment.agent_platform !== null && !isStr(p.environment.agent_platform)) errs.push(`${w}.environment.agent_platform: string or empty`);
        }
      }
      break;
    case 'verification':
      if (closed(p, ['criterion', 'result', 'commit', 'detail'], w, errs)) {
        if (!(typeof p.criterion === 'string' && AC.test(p.criterion))) errs.push(`${w}.criterion: AC id`);
        if (!['pass', 'fail'].includes(p.result)) errs.push(`${w}.result: pass or fail`);
        if (p.commit !== null && !isStr(p.commit)) errs.push(`${w}.commit: string or empty`);
        if (!isStr(p.detail)) errs.push(`${w}.detail: non-empty string`);
      }
      break;
    case 'escalation-opened':
      if (closed(p, ['id', 'kind', 'question', 'impact', 'affected_artifacts'], w, errs)) {
        if (!(isStr(p.id) && p.id.endsWith(`:${r.seq}`))) errs.push(`${w}.id: must be <execution-id>:<seq of this record>`);
        if (!escalationKinds().includes(p.kind)) errs.push(`${w}.kind: '${p.kind}' is not an Escalation kind`);
        if (!isStr(p.question)) errs.push(`${w}.question: non-empty string`);
        if (!isStr(p.impact)) errs.push(`${w}.impact: non-empty string`);
        if (!Array.isArray(p.affected_artifacts) || p.affected_artifacts.some((x) => !isStr(x))) errs.push(`${w}.affected_artifacts: list of strings`);
      }
      break;
    case 'escalation-resolved':
      if (closed(p, ['id', 'resolution', 'links'], w, errs)) {
        if (!isStr(p.id) || !/^[a-z0-9][a-z0-9-]*:\d+$/.test(p.id)) errs.push(`${w}.id: <execution-id>:<seq>`);
        if (!isStr(p.resolution)) errs.push(`${w}.resolution: non-empty string`);
        if (closed(p.links, ['adr', 'spec'], `${w}.links`, errs)) {
          for (const k of ['adr', 'spec']) if (p.links[k] !== null && !isStr(p.links[k])) errs.push(`${w}.links.${k}: id or empty`);
        }
      }
      break;
    default:
  }
  return errs;
}

// Fixed key order, so serialization is deterministic.
export function canonicalUnit(u) {
  const o = {};
  for (const k of UNIT_KEYS) o[k] = u[k];
  o.scope = u.scope === 'all' ? 'all' : [...u.scope];
  o.sop = { name: u.sop.name, version: u.sop.version };
  o.constraints = [...u.constraints];
  o.autonomy = { escalate_on: [...u.autonomy.escalate_on] };
  return o;
}

const PAYLOAD_ORDER = {
  transition: ['from', 'to', 'reason'],
  validation: ['result', 'purpose', 'fingerprint', 'base_commit', 'findings', 'environment'],
  verification: ['criterion', 'result', 'commit', 'detail'],
  'escalation-opened': ['id', 'kind', 'question', 'impact', 'affected_artifacts'],
  'escalation-resolved': ['id', 'resolution', 'links'],
};

export function canonicalRecord(r) {
  const payload = {};
  for (const k of PAYLOAD_ORDER[r.type]) payload[k] = r.payload[k];
  if (r.type === 'validation') {
    payload.findings = r.payload.findings.map((f) => ({ check: f.check, message: f.message, kind: f.kind }));
    const e = r.payload.environment;
    payload.environment = { host: e.host, os: e.os, path: e.path, head: e.head, tools: [...e.tools], agent_platform: e.agent_platform };
  }
  if (r.type === 'escalation-opened') payload.affected_artifacts = [...r.payload.affected_artifacts];
  if (r.type === 'escalation-resolved') payload.links = { adr: r.payload.links.adr, spec: r.payload.links.spec };
  return { seq: r.seq, at: r.at, type: r.type, actor: r.actor, evidence: { class: r.evidence.class, source: r.evidence.source }, payload };
}
