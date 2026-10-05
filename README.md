---
schema: 1
id: readme
type: guide
kind: index
status: active
date: 2026-07-10
updated: 2026-07-10
owners: [krok-team]

entity_refs: [agentic-layer, schema-v1, canonical-frontmatter]
touches: []
docs: [INSTALL.md, playbook/playbook-v2.md, playbook/migrate-legacy.md]
refs: []
depends_on: []
tags: [index, landing]
priority: P0
---

# Krok

**Engineering control plane for projects built with AI coding agents**

Krok keeps your project coherent during active development — architecture, ADRs,
specs, domain knowledge, and engineering context stay aligned with reality as the
project grows.

> **Proof:** the Kordon/MegaDelta project — 141 chaotic files → 40 canonical in
> 30 minutes and one prompt. Onboarding reduced from 2–5 days to 5 minutes, LLM context
> 73% lighter, prompt cost 80% lower. See `docs/audits/`.

> **To install:** give your AI agent the link to this repo
> (`https://github.com/akturt/krok`) and say:
> **"Install Krok."**
> The agent reads [`INSTALL.md`](INSTALL.md), the canonical runbook, and does everything automatically.
> To update an existing installation say **"Update Krok. Follow the canonical runbook."**
> A project that still runs Underboss: **"Update Underboss to Krok"** and the link to this repo. The runbook detects the old name and the agent follows [`playbook/move-from-underboss.md`](playbook/move-from-underboss.md) on its own.
> For a fresh install you can also run the one-liner:
> `bash <(curl -s https://raw.githubusercontent.com/akturt/krok/master/bootstrap/install.sh)`

---

## What is Krok?

Krok is an engineering control plane for projects built with AI coding agents.

Krok is an operational system for moving engineering work from its current state to a verified, canonical state.

Krok is also a verb: to krok something is to take the next meaningful step toward resolving it.

The name comes from the Belarusian word `крок`, "step".

```text
Krok the repo.
Krok the docs.
Krok this migration.
Krok this mess.
Krok it.
```

```text
Крокни репу.
Крокни доки.
Крокнем миграцию.
Крокай дальше.
```

### You say what, Krok works out how

You do not need to tell Krok every intermediate action. You tell it what needs to move. Krok determines the work required to move it correctly, from the project context, the documentation, the rules, the invariants, the acceptance criteria and the current state.

Depending on the task, one step can include:

```text
observe → recover context → inspect reality → understand the problem
→ determine the required work → perform it → verify the result
→ reconcile with canonical state → record → close or escalate
```

"Krok the docs" therefore means: find the actual state, find the canonical source, find what is stale, change only that, keep the invariants, verify, record. It does not mean "run one command".

A step is sized by its goal, not by the number of commands. It can be small, compound, investigative, corrective, documentary, architectural, an implementation, a verification or a closure.

### What Krok is not

Krok is not a blind executor. It does not do the first obvious thing: before acting it recovers the context and determines the state of the object. If a task needs investigation, it investigates first. If the evidence is insufficient, it names the missing evidence and escalates instead of guessing or filling gaps with assumptions. Krok does not replace engineering judgment.

The words above describe how you talk to Krok. The CLI keeps its explicit commands (`krok status`, `krok execution ...`, `krok attention`, `krok escalation ...`, see `krok --help`); they are the machinery behind the verb.

---

## Why Krok exists

Virtually every documentation system looks great before real development begins.

New requirements appear. Architectural decisions change. Constraints surface. Old
ideas get scrapped. New dependencies emerge. Within a few weeks, documentation
drifts from reality.

The result:

- architecture exists only "in people's heads";
- old decisions are forgotten;
- context cannot be recovered quickly;
- AI operates on outdated information;
- after a long break, the project has to be re-learned from scratch.

The bigger and more complex the project, the worse it gets.

This is especially acute for Infrastructure as Code, DevOps platforms, IDPs,
backend systems, DaaS/SaaS, complex monorepos, and projects where multiple AI
coding agents work simultaneously.

## What Krok does

Krok makes documentation a living part of the development process — not a
separate activity that rots.

It holds:

- architecture and invariants;
- ADRs (Architecture Decision Records);
- specifications with lifecycle from path;
- domain model;
- engineering knowledge and principles;
- standard operating procedures (SOPs);
- rules for AI agents.

Every document has a lifecycle, undergoes verification, and lands in the correct
location after approval. The project stays in a consistent state.

## How work actually flows

Development does not start with a giant prompt. It starts with a specification —
even a rough one, a few paragraphs in plain language.

From there, Krok:

- canonicalizes the document (Schema v1 frontmatter);
- places it in the correct directory by lifecycle;
- runs validators and checks;
- invokes specialized AI agents (architecture review, documentation review, adversarial check);
- verifies invariants;
- returns the document for revision if needed;
- after approval, moves it to implementation status.

When work is done, the documentation is automatically part of the project's
collective knowledge base.

## Why this matters for AI

Most AI coding workflows today revolve around ever-growing `CLAUDE.md`, `AGENTS.md`,
or system prompts. Over time they consume a huge amount of context — most of which
the agent doesn't actually need for the current task.

Krok takes a different approach:

- AI receives **only the engineering context relevant to the current task**;
- no scanning of hundreds of files;
- no outdated information;
- no bloated system prompts.

The agent knows the architecture, invariants, and rules because they are structured
and queryable — not buried in a growing markdown dump.

## What is included

- **Canonical Schema v1** — single frontmatter format for all `.md` in `docs/`
- **Lifecycle from path** — document status is computed from its directory
- **5-layer architecture** — Entry → Architecture → ADR → Spec → Operations
- **CI guard** — no `.md` without canonical frontmatter enters the repo
- **Reality Engine** — reconstructs project state, detects drift
- **Registry** — single source of truth for all Krok components
- **SOPs** — declarative process descriptions with DAG planner
- **AI Agent Roles** — architecture-reviewer, documentation-reviewer, reality-auditor, adversary-checker
- **Knowledge layer** — architecture-principles, evidence-model, audit-principles, report-formats, capabilities
- **Bootstrap** — one-command setup, idempotent, POSIX + Windows
- **Migration tools** — brownfield migration with legacy frontmatter conversion

---

## How to connect

### Option 1 — AI agent (recommended)

Give your AI agent the link to this repo and say:

> **"Install Krok."**

That's it. The agent reads [`INSTALL.md`](INSTALL.md), the single canonical runbook,
detects the current state (not installed / v3 installed), executes the
matching flow (install / update), runs all verifications,
and reports back.
Works with opencode, Claude Code, Cursor, and any other agent that can run shell commands.

### Option 2 — One-liner (fresh install)

```bash
bash <(curl -s https://raw.githubusercontent.com/akturt/krok/master/bootstrap/install.sh)
```

### Option 3 — Manual

```bash
# 1. Add submodule INSIDE docs/
mkdir -p docs/.control
git submodule add https://github.com/akturt/krok.git docs/.control
git config -f .gitmodules submodule."docs/.control".branch master
git commit -m "chore: add Krok via submodule"

# 2. Run bootstrap
bash docs/.control/bootstrap/bootstrap.sh

# 3. Fill in .context/project.yml and .context/boundaries.yml
```

**Repo whose `docs/` already has `.md` files without Schema v1 frontmatter?** Bring them to Schema v1 with [`playbook/migrate-legacy.md`](playbook/migrate-legacy.md) (onboarding of foreign documentation).

**Krok already installed?** Do not repeat the install: [`INSTALL.md`](INSTALL.md) decides between update (v3) and a fresh install.

Full details: [`INSTALL.md`](INSTALL.md).

---

## What is included

```text
krok/ ← product repo
├── README.md ← this file
├── INSTALL.md ← canonical install / update runbook
├── bootstrap/ ← Core: loader, install one-liner, deploy prompt
├── core/ ← Core: registry, installation state machine, contracts, Core SDK
├── engine/ ← Core: Reality Engine
├── documentation/ ← Documentation Module: templates, validation, schemas
├── knowledge/ ← Documentation Module: principles, capabilities
├── agents/ ← Documentation Module: claude-code + opencode roles
├── sops/ ← Documentation Module: YAML process descriptions
├── playbook/ ← Documentation Module: greenfield + brownfield guides
├── docs/ ← dogfood: Krok's own audits, ADRs, specs
└── .github/workflows/ ← CI guard
```

> **Note:** In consumer repos only `docs/` appears at the root.
> Everything else lives inside `docs/.control/` (git submodule).
> See the Two-repo model in [`INSTALL.md`](INSTALL.md).

---

## Updating

```bash
# Manually (five seconds, recommended)
git submodule update --remote --merge
git add docs/.control
git commit -m "chore: update Krok"
```

Or re-run bootstrap — it detects the current version and updates idempotently:

```bash
bash docs/.control/bootstrap/bootstrap.sh
```

Details: [`INSTALL.md`](INSTALL.md); the prompt to hand to an agent: [`bootstrap/DEPLOY-PROMPT.md`](bootstrap/DEPLOY-PROMPT.md).

---

## For which projects

Krok is built for projects that live for months or years:

- Infrastructure as Code
- DevOps platforms
- Internal Developer Platforms (IDP)
- Backend systems
- DaaS / SaaS
- Complex monorepos
- Projects with multiple AI coding agents working simultaneously

The longer the project lives, the more valuable Krok becomes.

---

## Changelog

- **2026-10-05** — **Krok rebrand**. The product is named Krok (CLI `krok`). Names only: architecture, contracts and CLI semantics are unchanged. Compatibility with earlier installations is removed: the v2 → v3 migration script and the old mount paths are gone, a project with an older layout installs again (INSTALL.md, flow A).
- **2026-10-04** — **v3.0.0 — Control Plane**. Execution Units with state, immutable records and Escalations; the `underboss` CLI; one Spec lifecycle; `core/` and `docs/.control/`; one-time migration `core/migrate/v2-to-v3.mjs`.
- **2026-07-10** — **v2.0.0 — Underboss rebrand + Registry SSOT**. Identity (name, version, codename) centralized in `core/registry.yaml`. All components read from registry API — zero hardcoded strings. Submodule path changed to `docs/.control`. Consumer upgrade prompt covers v1.0 → v2.0 migration.
- **2026-07-10** — **v1.9 — Bash prefix + registry bugfix**. Fixed `reality-report.sh` calling collectors/analyzers without `bash` prefix (Permission denied on Linux/macOS). Fixed `registry_list_directories` returning non-path YAML keys, which caused empty dirs in `docs/`.
- **2026-07-09** — **v1.8 — Architecture Invariants Support**.
- **2026-07-09** — **v1.6 — Core SDK & Orchestrator Maturity**.
- **2026-07-09** — **v1.5 — Module Decomposition + Registry SSOT**.
- **2026-07-08** — **v1.2 — Operating Platform**.
- **2026-07-08** — **v1.1 — Agentic Layer Separation**.
- **2026-07-07** — initial commit.

---

## Repository status

| Stage | State |
|------|-------|
| Krok v3.0.0 | ✅ implemented |
| Playbook v2 (greenfield model) | ✅ implemented |
| Migration Prompt (brownfield) | ✅ implemented |
| Bootstrap (idempotent, POSIX + Windows) | ✅ implemented |
| agents/ (claude-code, opencode: 4 roles) | ✅ implemented |
| SOPs (10 protocols + planner) | ✅ implemented |
| knowledge/ (5 files, capability catalog) | ✅ implemented |
| Reality Engine (collectors, analyzers, reporters) | ✅ implemented |
| CI guard (validate-frontmatter + validate-integrity) | ✅ implemented |
| Dogfooding on production projects | ✅ active |
