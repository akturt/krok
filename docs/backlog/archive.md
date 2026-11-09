---
schema: 1
id: backlog-archive
type: backlog
status: active
date: 2026-11-10
owners: [krok-team]

entity_refs: []
touches: [agents, core, documentation]
depends_on: []
tags: [backlog, archive]
priority: P3
---

# Backlog: archive

Everything that is not open work. `[x]` completed; `[-]` cancelled, deferred, dropped or superseded.

Source of the first package below: the U1 Hiring project (2026-10-26), [prompt](../prompts/2026-10-26-krok-agent-registry-and-spec-reopen.md).

- [x] Agent registry: `name` and `description` in every Claude Code role, `tools` for the roles whose text forbids writing
- [x] Generic `frontend-contract-auditor` for claude-code and opencode, capability `review-frontend-contracts`
- [x] `core/registry.yaml` lists every agent file; reverse check file → Registry in `validate-integrity.sh`
- [x] Validators and tests for agents: no BOM, `name` equals the file name, non-empty `description` (`agents.test.mjs`)
- [x] `agents/README.md`: registration, copying without a BOM, contributing a project-born agent
- [x] Spec reopen → ADR-008 (proposed): `approved → draft`; a body change of an approved Spec is a WARNING; `implemented` and `superseded` stay immutable
- [x] `validate-lifecycle`: transitions, warnings collector, tests; Execution Units behaviour with a reopened Spec fixed by tests
- [x] Open questions of the prompt: `tools:` only for roles whose text forbids writing; no `krok agents install` (copy with `cp`); no agent template (the README procedure); no `strict` option for the approved-spec warning
- [x] Decision-record (request of the TPO session) → ADR-009 (proposed): type `decision`, template, Registry, lifecycle and frontmatter checks, vocabulary exemption, READY fingerprint
