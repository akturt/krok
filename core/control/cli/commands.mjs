// core/control/cli/commands.mjs — the Control Plane adapter: command -> Core SDK call.
//
// This file holds no rules. Transitions, validation, READY, fingerprints, Escalations
// and persistence all live in core/control/index.mjs. A command parses its arguments,
// calls the SDK, and returns { ok, data, text }; `data` is the --json projection.
import * as core from '../index.mjs';
import * as render from './render.mjs';
import { Refused } from './args.mjs';

const actor = { required: true };

function asScope(flags) {
  return flags.scope ? flags.scope : 'all';
}

export const COMMANDS = {
  status: {
    summary: 'states, stale READY, open escalations',
    run: ({ root }) => {
      const data = core.projectStatus(root);
      return { ok: true, data, text: render.status(data) };
    },
  },

  attention: {
    summary: 'open Escalations only',
    run: ({ root }) => {
      const items = core.projectAttention(root);
      return { ok: true, data: { attention: items }, text: render.attention(items) };
    },
  },

  'execution list': {
    summary: 'list Execution Units',
    run: ({ root }) => {
      const items = core.projectExecutions(root);
      return { ok: true, data: { executions: items }, text: render.executionList(items) };
    },
  },

  'execution show': {
    summary: 'show one Execution Unit',
    args: ['execution-id'],
    run: ({ root, args }) => {
      const data = core.unitView(root, args[0]);
      return { ok: true, data, text: render.executionShow(data) };
    },
  },

  'execution create': {
    summary: 'create an Execution Unit from an approved Spec id',
    args: ['spec-id'],
    flags: { scope: { list: true }, sop: { required: true }, actor },
    run: ({ root, args, flags }) => {
      const unit = core.createExecution(root, { spec: args[0], scope: asScope(flags), sop: flags.sop, actor: flags.actor });
      return { ok: true, data: { unit }, text: `created ${unit.id}   ${unit.state}` };
    },
  },

  'execution ready': {
    summary: 'validate the unit and mark it READY, or list findings',
    args: ['execution-id'],
    flags: { actor, 'agent-platform': {} },
    run: ({ root, args, flags }) => {
      const r = core.ready(root, args[0], { actor: flags.actor, agentPlatform: flags['agent-platform'] ?? null });
      return { ok: r.ok, data: r, text: render.findings(r, 'ready') };
    },
  },

  'execution start': {
    summary: 'revalidate, then start the unit',
    args: ['execution-id'],
    flags: { actor, 'agent-platform': {} },
    run: ({ root, args, flags }) => {
      const r = core.start(root, args[0], { actor: flags.actor, agentPlatform: flags['agent-platform'] ?? null });
      return { ok: r.ok, data: r, text: render.findings(r, 'start') };
    },
  },

  'execution verify': {
    summary: 'begin verification and run the acceptance and Reality checks',
    args: ['execution-id'],
    flags: { actor },
    run: ({ root, args, flags }) => {
      const r = core.verify(root, args[0], { actor: flags.actor });
      return { ok: r.ok, data: r, text: render.verification(r) };
    },
  },

  'execution complete': {
    summary: 'complete the unit, only with evidence',
    args: ['execution-id'],
    flags: { actor },
    run: ({ root, args, flags }) => {
      const r = core.complete(root, args[0], { actor: flags.actor });
      return { ok: r.ok, data: r, text: render.findings(r, 'complete') };
    },
  },

  'execution cancel': {
    summary: 'cancel an Execution Unit',
    args: ['execution-id'],
    flags: { reason: { required: true }, actor },
    run: ({ root, args, flags }) => {
      const unit = core.cancel(root, args[0], { actor: flags.actor, reason: flags.reason });
      return { ok: true, data: { unit }, text: `cancel: ok   ${unit.id} is ${unit.state}` };
    },
  },

  'execution record': {
    summary: 'append a verification record',
    args: ['execution-id', 'type'],
    flags: {
      criterion: { required: true }, result: { required: true }, detail: { required: true }, commit: {},
      'evidence-class': { required: true }, 'evidence-source': { required: true }, actor,
    },
    run: ({ root, args, flags }) => {
      if (args[1] !== 'verification') throw new Refused(`only 'verification' records are appended directly; '${args[1]}' is written by its own command`);
      const record = core.recordVerification(root, args[0], {
        actor: flags.actor, criterion: flags.criterion, result: flags.result, detail: flags.detail, commit: flags.commit ?? null,
        evidence: { class: flags['evidence-class'], source: flags['evidence-source'] },
      });
      return { ok: true, data: { record }, text: `record: ok   ${args[0]} #${record.seq} verification ${record.payload.criterion} ${record.payload.result}` };
    },
  },

  'escalation list': {
    summary: 'list Escalations',
    flags: { execution: {} },
    run: ({ root, flags }) => {
      const items = core.allEscalations(root, flags.execution ?? null);
      return { ok: true, data: { escalations: items }, text: render.escalationList(items) };
    },
  },

  'escalation show': {
    summary: 'show one Escalation',
    args: ['escalation-id'],
    run: ({ root, args }) => {
      const e = core.findEscalation(root, args[0]);
      if (!e) throw new Refused(`Escalation ${args[0]} not found`);
      return { ok: true, data: { escalation: e }, text: render.escalationShow(e) };
    },
  },

  'escalation open': {
    summary: 'open an Escalation',
    args: ['execution-id'],
    flags: { kind: { required: true }, question: { required: true }, impact: { required: true }, affected: { list: true }, actor },
    run: ({ root, args, flags }) => {
      const r = core.openEscalation(root, args[0], {
        kind: flags.kind, question: flags.question, impact: flags.impact, affected_artifacts: flags.affected ?? [], actor: flags.actor,
      });
      return { ok: true, data: r, text: `opened ${r.id}   ${args[0]} is ${r.unit.state}` };
    },
  },

  'escalation resolve': {
    summary: 'resolve an Escalation (optionally linking an ADR or Spec)',
    args: ['escalation-id'],
    flags: { resolution: { required: true }, adr: {}, spec: {}, actor },
    run: ({ root, args, flags }) => {
      const found = core.findEscalation(root, args[0]);
      if (!found) throw new Refused(`Escalation ${args[0]} not found`);
      const unit = core.resolveEscalation(root, found.execution, {
        escalationId: args[0], resolution: flags.resolution, links: { adr: flags.adr ?? null, spec: flags.spec ?? null }, actor: flags.actor,
      });
      return { ok: true, data: { escalation: core.findEscalation(root, args[0]), unit }, text: `resolved ${args[0]}   ${found.execution} stays ${unit.state}` };
    },
  },
};
