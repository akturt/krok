---
schema: 1
id: backlog-active
type: backlog
status: active
date: 2026-10-26
owners: [krok-team]

entity_refs: []
touches: [agents, core, documentation]
depends_on: []
tags: [backlog, agents, registry, spec-lifecycle]
priority: P2
---

# Backlog: active

Open actionable work only. A finished, cancelled, deferred, dropped or superseded item moves to `archive.md`.

Deferred to the next Krok update package; not started. Source: the U1 Hiring project (2026-10-26). Full prompt with evidence, acceptance criteria and the appendix: [`docs/proposals/PROMPT-krok-agent-registry-and-spec-reopen.md`](../proposals/PROMPT-krok-agent-registry-and-spec-reopen.md).

- [ ] Commit A, agent registry: add `name` and `description` to all roles so Claude Code registers them as subagents (currently they do not resolve)
- [ ] Commit A: add a generic `frontend-contract-auditor` (claude-code and opencode), capability `review-frontend-contracts`, registry entries
- [ ] Commit A: bring `core/registry.yaml` `components.agents` in line with the files; add the reverse check file → registry in `validate-integrity.sh`
- [ ] Commit A: validators and tests for agents: no BOM, `name` equals the file name, non-empty `description` (`agents.test.mjs`)
- [ ] Commit A: update `agents/README.md`: registration, how a project agent gets into Krok, copying without BOM
- [ ] Commit B, spec reopen: ADR-008 (proposed): `approved → draft` allowed; editing the body of an `approved` spec is a WARNING, not an ERROR; `implemented` and `superseded` stay immutable
- [ ] Commit B: change `validate-lifecycle.mjs` (transitions, `BASE_REF` severity), tests, playbook and entity-catalog; check Execution Units behaviour when a spec is reopened
- [ ] Resolve the open questions of section 5 of the prompt: `tools:` for read-only roles, a `krok agents install` command, an agent template, a `strict` option for the approved-spec gate
