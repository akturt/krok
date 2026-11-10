---
schema: 1
id: backlog-active
type: backlog
status: active
date: 2026-11-10
owners: [krok-team]

entity_refs: []
touches: [agents, core, documentation]
depends_on: []
tags: [backlog, tests]
priority: P2
---

# Backlog: active

Open actionable work only. A finished, cancelled, deferred, dropped or superseded item moves to `archive.md`.

- [ ] Runbook test `flow A then B` (`bootstrap/tests/runbook.test.mjs`, `productRepo()`) copies files from `git ls-files -c` (the index), not from HEAD: a dirty tree gives a false red (seen when a new tracked file was not yet staged). Source: TPO session, 2026-11-10
- [ ] Tests that read `core/registry.yaml` as text should not assume LF; `fixture.mjs` was fixed, check the other readers (autocrlf on Windows)
