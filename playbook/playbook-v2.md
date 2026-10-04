---
schema: 1
id: documentation-system-playbook-v2
type: spec
status: implemented
date: 2026-07-07
updated: 2026-07-08
owners: [underboss-team]

entity_refs: [schema-v1, canonical-frontmatter, agent-entry-protocol, lifecycle-spec, lifecycle-adr]
touches: [docs, .context, .claude/rules, .github/workflows]
code: [.github/workflows/docs-validate.yml, bootstrap/bootstrap.sh, bootstrap/bootstrap.ps1, documentation/validation/validate-frontmatter.sh, engine/scripts/migrate-legacy.mjs, documentation/schemas/frontmatter.schema.json, documentation/templates/architecture.md, documentation/templates/adr.md, documentation/templates/spec.md, documentation/templates/audit.md, documentation/templates/runbook.md, documentation/templates/backlog.md]
docs: [migrate-legacy.md]
refs: []
depends_on: [adr-001-tech-stack, adr-002-three-schema-db, adr-003-arq-workers]
implements: []
supersedes: []
tags: [documentation, playbook, greenfield, schema-v1]
priority: P0
---

# Documentation System Playbook v2 (Greenfield)

> Guide to adopting the documentation system on any IaC / backend / frontend project **from scratch**.
> Based on the underboss-infra architecture (2026-06–07).
> **Greenfield version 2 — Canonical Schema v1 from day one.**
>
> This playbook describes the **target greenfield model** of Documentation System v2.
> If the system is being adopted in an existing repository (brownfield), use
> [Migration Prompt](migrate-legacy.md) — a ready-made agent prompt for migrating legacy frontmatter to Canonical Schema v1.

---

## Why this is needed

Without a system, documentation dies within 2 weeks. AI agents cannot understand context. New developers spend days on onboarding. Architectural decisions are forgotten and repeated.

The goal of the system: **documentation = infrastructure**, not arbitrary text files.

**The v2 greenfield approach** means: no .md file in `docs/` is created without canonical Schema v1 frontmatter. No legacy fields (`author`, `title`, `created`, `lifecycle`, `referenced_by`, `supersedes_adr`). A new repository needs no migration script — bootstrap creates the structure directly in canonical form. For an existing repository see [Migration Prompt](migrate-legacy.md).

---

## Bootstrap (creating the structure)

Bootstrap is the single source of truth for creating the directory structure. The script lives in Underboss repository, not in the playbook itself:

```bash
# Linux / macOS / WSL
bash bootstrap/bootstrap.sh [project-name]

# Windows (PowerShell)
powershell -File bootstrap/bootstrap.ps1
```

Bootstrap is idempotent and minimal: it creates the `docs/` skeleton (5-layer architecture), `.context/` stubs (`project.yml`, `boundaries.yml`, `agent-entry.md`), a `CLAUDE.md` snippet, and the `docs-validate.yml` workflow. No magic that modifies existing files.

The full document templates (`.md`) live separately from bootstrap — see `documentation/templates/`, they are not embedded in the script. This eliminates drift between the playbook and the real artifacts.

**Bootstrap:** ~5 seconds vs 2–3 hours of manual creation.

---

---
---

## Canonical Schema v1 (Reference)

All .md files in `docs/` must have canonical frontmatter conforming to Schema v1. This is the **implicit rule of day-one greenfield rollout**: CI validates from the first commit.

### Base Schema (mandatory for all documents)

```yaml
---
schema: 1                          # mandatory — THIS schema version
id: <kebab-case>                   # mandatory — stable, never changes
type: <type-enum>                  # mandatory — per §Type enum
status: <per-type-enum>            # mandatory — per §Status enum
date: YYYY-MM-DD                   # mandatory — creation date (see §Semantics of date)
updated: YYYY-MM-DD                # optional — date of last change

owners: []                         # mandatory — teams/components owning document
entity_refs: []                    # optional — domain entities referenced
touches: []                        # optional — subsystems affected
code: []                           # optional — code files referenced
docs: []                           # optional — internal doc references
refs: []                           # optional — external URLs
depends_on: []                     # optional — IDs of docs this one depends on
implements: []                     # optional — IDs of ADRs this doc implements
supersedes: []                     # optional — IDs this doc supersedes
tags: []                           # optional — free-form tags
priority: P0 | P1 | P2 | P3        # optional
---
```

**15 fields.** Mandatory: `schema`, `id`, `type`, `status`, `date`, `owners`. The rest are optional.

> **Removed:** `excludes-from-scope: []` — an anti-pattern. It is better to say explicitly "about Y" than "not about Z". If needed, use `tags: [not-X]`.

### Semantics of the `date` field (per-type)

| Type | `date` means | Example |
|------|-----------------|--------|
| `spec` | Draft creation date | 2026-07-01 |
| `adr` | Decision acceptance date (not writing date) | 2026-07-05 |
| `audit` | Audit conduct date (not file creation date) | 2026-04-06 |
| `runbook` | Creation / last update date | 2026-07-07 |
| `architecture` | Creation / last update date | 2026-07-07 |
| `guide`, `backlog`, `prompt` | Creation / last update date | 2026-07-07 |

### The `updated` field (optional)

Filled in automatically on every content change (not frontmatter). Used to determine the document's "freshness":

```yaml
date: 2026-07-01       # when created
updated: 2026-07-07    # when last changed
```

**Rule:** if `updated` is not filled in, we assume the document has not changed since creation.

### Type enum

```
spec | adr | audit | runbook | guide | api | architecture | backlog | prompt
```

### Status enum (per-type)

| Type | Valid `status` |
|------|----------------|
| spec | draft, approved, implemented, superseded |
| api | active, deprecated |
| adr | proposed, accepted, deprecated, superseded |
| audit | draft, completed |
| architecture, runbook, guide, backlog, prompt | active, deprecated |

### Per-type Extensions

Optional extensions on top of Base. Base + Extension = the full schema for the type.

```yaml
audit:
  scope: "<brief description of what was checked>"   # optional, free-form
  trigger: "<why this audit was conducted>"            # optional, free-form

runbook:
  kind: deploy | cicd | ops | troubleshoot | edge-hub | secrets | integration  # optional

api:
  version: "<semantic version>"                 # optional

guide:
  kind: index | onboarding             # optional

architecture: {}                                 # no extensions
adr: {}                                          # no extensions
spec: {}                                         # no extensions
prompt: {}                                       # no extensions
backlog: {}                                      # no extensions
```

### The `lifecycle` field — **EXCLUDED**

`lifecycle` is not part of the canonical schema. A spec's lifecycle position is its directory:

```
docs/specs/drafts/*         → drafts
docs/specs/approved/*       → approved
docs/specs/implemented/*    → implemented
docs/specs/superseded/*     → superseded
otherwise → no lifecycle
```

CI/Portal computes lifecycle from the path. This removes drift between the path and the field. Never add `lifecycle:` to the frontmatter.

---

## Entity Refs Workflow

Rules for creating and using `entity_refs` in documentation.

### What is an entity_ref

A stable identifier of a project domain entity. Format: `kebab-case`, reflecting the essence, not the implementation.

**Examples:**
```yaml
entity_refs:
  - schema-v1                  # documentation system Schema
  - canonical-frontmatter      # Frontmatter format
  - agent-entry-protocol       # Agent Entry Protocol
  - lifecycle-spec             # Specification lifecycle
  - three-schema-db            # 3-schema database architecture
  - arq-workers                # ARQ workers
```

### Creation rules

1. **Stable ID:** an entity_ref never changes. If an entity is renamed, the old ref is deprecated and a new ref is added.

2. **Min 2 characters:** no single-letter refs.

3. **Kebab-case:** `schema-v1`, not `Schema V1` and not `schema_v1`.

4. **One ref = one entity:** do not duplicate `schema` and `schema-v1`.

5. **Where to define it:** in the root `docs/architecture/README.md` or in a dedicated `docs/architecture/entity-catalog.md`.

### Existence check

Before adding `entity_refs` to a document:

```bash
# Verify ref exists in the catalog
grep -r "schema-v1:" docs/architecture/
```

If the ref is not found:
- **First create the entity** (document, ADR, spec)
- **Then reference** it from other documents

### Usage in CI

```yaml
# entity_refs validation (optional, in docs-validate.yml)
- name: Verify entity_refs exist
  run: |
    set -e
    # Extract all entity_refs from the document
    refs=$(grep -A 100 "^entity_refs:" docs/specs/approved/*.md | grep "  - " | awk '{print $2}' | sort -u)
    for ref in $refs; do
      # Verify that ref is defined in catalog
      if ! grep -rq "id: $ref" docs/architecture/; then
        echo "WARNING: entity_ref '$ref' not found in architecture docs"
      fi
    done
```

### Usage rules

- **Minimum 1 ref** for spec and audit (the entities the document pertains to)
- **Maximum 10 refs** (otherwise the document is too "general")
- **Direct relation:** if a spec describes entity X → `entity_refs: [X]`
- **Indirect relation:** if a spec touches X but does not describe it → `touches: [X]` (not `entity_refs`)

---

## Lightweight Change Path (without a spec)

Not every change requires a spec. There is a lightweight path for small changes:

### When a spec is NOT needed

| Type of change | What to do |
|---------------|-----------|
| Bug fix | Commit message + PR description |
| Config change | Commit message + PR description |
| Documentation update | Commit message + PR description |
| Refactoring without behavior change | Commit message + PR description |
| Dependency update | Commit message + PR description |
| Hotfix to production | Commit message + PR description |

### When a spec IS needed

| Type of change | Why |
|---------------|--------|
| New API endpoint | Changes the contract for clients |
| New table/column | Changes the data model |
| New service | Changes the topology |
| ACL/RBAC change | Changes the security model |
| Pipeline change | Changes the data flow |
| Data migration | Potentially reversible, requires a plan |

### Lightweight change format

```markdown
## What
Bug fixed: invalid JSON in response.

## Why
Client received 500 instead of 400 on invalid JSON.

## Changed
- `app/api/v1/validators.py` — JSON validation added

## Testing
- Test added `tests/test_validators.py::test_invalid_json`
```

---

## Directories and their purpose

| Directory | Purpose | Rules |
|------------|-----------|---------|
| `.context/` | Project metadata for AI agents | Always read first |
| `docs/architecture/` | Living architecture (topology, data model, invariants) | Updated on every topology/schema change |
| `docs/adr/` | Architecture Decision Records | Body immutable after `accepted`. Frontmatter = metadata, may be updated |
| `docs/specs/` | Specification lifecycle | `drafts/ → approved/ → implemented/` (and `superseded/`) |
| `docs/audits/` | Audits and forensic reports | Body append-only, FM = metadata (mutable) |
| `docs/backlog/` | Backlog | `active.md`: open work; `archive.md`: everything else |
| `docs/prompts/` | AI context prompts | type: prompt — answered by the LLM, not a human |
| `docs/api/` | API specifications | type: api, versioned |
| `.claude/rules/` | Rules for the AI agent (Claude Code) | Tied to ADR and docs/ |
| `.ai/reports/` | AI audit reports | High-level summaries |

---

## Architecture Documentation

The architecture catalog lives in `docs/architecture/` and consists of three documents:

| Document | Answers the question | Required |
|----------|-------------------|------------|
| `README.md` | what exists (topology, module index) | yes |
| `entity-catalog.md` | what it is made of (domain entities) | yes |
| `invariants.md` | what must never be violated | yes |

- **README** — what exists.
- **Entity Catalog** — what it is made of.
- **System Invariants** — what must never be violated.

`Reality Report` checks the architecture catalog as a whole and reports missing documents as INFO (not as an error).

## Step-by-Step: Adoption from scratch (Greenfield)

### Phase 0: Preparation (30 minutes)

1. Identify the project stack
2. Run the bootstrap script:

```bash
./docs-bootstrap.sh my-project
```

3. Fill in `.context/project.yml` and `.context/boundaries.yml`

### Phase 1: Agent Entry Protocol (1–2 hours)

This is **the most important layer**. Without it AI agents do not know where to start.

#### 1.1 `.context/project.yml`

```yaml
project:
  name: my-project
  description: "What this project is (1 sentence)"
  domain: example.com
  maintainer: team-name
  repository: https://github.com/org/repo

stack:
  backend: [FastAPI, Python]
  database: [PostgreSQL 17]
  infrastructure: [Docker Compose, Traefik]

directories:
  key:
    app/: "Main source code"
    infra/: "Infrastructure"
    docs/: "Documentation"
```

#### 1.2 `.context/boundaries.yml`

```yaml
boundaries:
  pristine:    # DO NOT TOUCH (upstream, boilerplate)
    - path: vendor/
      reason: "third-party, tracked upstream"

  editable:    # CAN BE CHANGED
    - path: app/
      reason: "core application code"
    - path: docs/
      reason: "all documentation"
    - path: infra/
      reason: "infrastructure config"

  generated:   # CREATED BY SCRIPTS
    - path: .env
      source: .env.example
      reason: "created by bootstrap from template"

  secret:      # NEVER COMMIT
    - path: .env
      note: "passwords and tokens"
    - path: "*.key"
      note: "private keys"
```

#### 1.3 `.context/agent-entry.md`

```markdown
# Agent Entry Protocol

## 1. Read First (in this order)
1. `.context/project.yml` — what project this is
2. `.context/boundaries.yml` — what you can/cannot edit
3. `docs/architecture/README.md` — topology, data model, invariants
4. `CLAUDE.md` (or equivalent) — rules

## 2. Before Editing Any File
1. Check `.context/boundaries.yml`
2. If pristine → STOP, ask human
3. If generated → edit template, not output
4. If editable → proceed with existing patterns

## 3. Before Creating Any .md in docs/
1. Identify `type` (adr | spec | audit | runbook | architecture | backlog | prompt | guide | api)
2. `cp docs/<type>/_template.md <target-path>` (if template exists)
3. Fill in **minimum** 6 mandatory fields: `schema`, `id`, `type`, `status`, `date`, `owners`
4. Never add the `lifecycle:` field — it is computed from path
5. Never use legacy fields: `author`, `title`, `created`, `referenced_by`, `supersedes_adr`
```

#### 1.5 `CLAUDE.md` (or `AGENTS.md`, `.opencode/config`)

```markdown
# Project Name — Agent Rules

## Agent Entry Protocol
1. `docs/architecture/system-overview.md`
2. `docs/architecture/README.md`
3. `docs/adr/`
4. `docs/specs/approved/`

## Stack
[Brief stack description]

## Commands
[Key commands]

## Architectural Invariants
[Core rules that must never be broken]

## Documentation Invariants (Schema v1)
- All .md in docs/ MUST have canonical Schema v1 frontmatter
- 6 mandatory fields: schema, id, type, status, date, owners
- lifecycle is ALWAYS computed from path — no such field in FM
- legacy fields are forbidden: author, title, created, referenced_by, supersedes_adr
- type: prompt ≠ type: guide — prompts for LLMs, guides for humans
```

### Phase 2: Architecture Layer (2–4 hours)

#### 2.1 `docs/architecture/README.md` — module index

```markdown
---
schema: 1
id: architecture-readme
type: architecture
status: active
date: YYYY-MM-DD
owners: [underboss-team]
---

# Architecture Reference Index

## Critical Invariants (MUST verify before ANY change)
| ID | Rule | Where enforced |
|----|------|----------------|
| INV-1 | Never modify X | Validation code |
| INV-2 | Y must equal Z | API check |

## Module Index
| Topic | File | When to load |
|-------|------|--------------|
| Networks | topology.md | Adding service |
| Data Model | domain-model.md | Changing schema |
```

#### 2.2 `docs/architecture/system-overview.md` — AI-first overview

```markdown
---
schema: 1
id: architecture-system-overview
type: architecture
status: active
date: YYYY-MM-DD
owners: [underboss-team]
---

# System Overview

## What is this
[1 paragraph]

## Core Subsystems
| Subsystem | Components | Location |
|-----------|-----------|----------|

## Data Model
[5-layer model diagram or equivalent]

## Key Architecture Decisions
| Decision | Where documented |
|----------|-----------------|
```

#### 2.3 Detailed documents in `docs/architecture/`

Create as needed:
- `topology.md` (id: `architecture-topology`)
- `domain-model.md` (id: `architecture-domain-model`)
- `deploy-engine.md` (id: `architecture-deploy-engine`)
- `terminology.md` (id: `architecture-terminology`)

### Phase 3: ADR Layer (1–2 hours per ADR)

#### 3.1 Creating an ADR

```bash
cp docs/.control/documentation/templates/adr.md docs/adr/NNN-<slug>.md
# NN — next free number (zero-padded to 3 digits)
# slug — kebab-case, describes the decision (not the implementation)
```

Fill in:
- `id`: `adr-NNN-<slug>` (stable, never changes)
- `status`: `proposed` (after acceptance it changes to `accepted`, FM-only edit)
- `date`: the date the decision was accepted (not the date it was written)
- `owners`: the teams taking responsibility
- `supersedes`: if it replaces an old ADR — a list of IDs
- Body: `# ADR-NNN:`, Status, Context, Decision, Consequences, Related

#### 3.2 ADR rules

1. **Body is immutable after acceptance.** If the decision changes, create a new ADR with `supersedes: [adr-XXX]` and the body of the new decision. The old ADR's body **is not modified** — it is evidence of a past decision.

2. **Frontmatter = metadata.** Adding or changing frontmatter **does not count** as a change to the ADR's content and **does not violate** the immutability principle. Frontmatter is updated on lifecycle transitions:
   - `proposed → accepted` (on acceptance)
   - `accepted → deprecated` (when the decision is obsolete without replacement)
   - `accepted → superseded` (when replaced by a new ADR; at the same time the new ADR gets `supersedes: [<old-id>]`)

3. **No stubs.** An ADR is created only when the decision is fully written. `status: proposed` means complete (there is no draft).

4. **An ADR answers "Why?"**, not "What was built?" If you want to describe the implementation, that is a spec, not an ADR.

5. **Reference in specs:** every approved spec must reference the relevant ADR via `implements: [adr-XXX-foo]` (if the spec directly implements the ADR's decision) or `depends_on: [adr-XXX-foo]` (if the ADR is a prerequisite but not implemented).

### Phase 4: Spec Lifecycle (2–3 hours)

#### 4.1 Creating a spec

```bash
cp docs/.control/documentation/templates/spec.md docs/specs/drafts/YYYY-MM-DD-<slug>.md
# fill frontmatter: status: draft (must match the directory!)
# fill body: Goal, Context, Scope, Technical approach, Affected files, Open questions, Acceptance criteria
```

#### 4.2 Lifecycle

```
docs/specs/drafts/     → draft, WIP, status: draft
docs/specs/approved/   → approved by a human, ready for implementation, status: approved; Acceptance criteria (AC-NNN) required; semantic body immutable
docs/specs/implemented/ → archive (never delete), status: implemented
docs/specs/superseded/ → replaced by new (never delete), status: superseded
```

Promotion via `git mv` + `status` update in the frontmatter:

```bash
# draft → approved (a human act: review is what people do, approval is the transition)
git mv docs/specs/drafts/2026-07-06-feature.md docs/specs/approved/
# in file: status: draft -> status: approved

# approved -> implemented (after completion)
git mv docs/specs/approved/2026-07-06-feature.md docs/specs/implemented/
# in file: status: approved -> status: implemented
# fill the ## Result section

# approved -> superseded (if replaced)
git mv docs/specs/approved/2026-07-06-feature.md docs/specs/superseded/
# in file: status: approved -> status: superseded
# in the new spec: supersedes: [<old-id>]
```

**CI validates:** if a file is in `docs/specs/drafts/` ⇒ `status: draft` (otherwise it fails). The path and status must match. This is the source-of-truth lifecycle (D-4 Variant B).

#### 4.3 Rules

- **Creation:** `cp docs/.control/documentation/templates/spec.md docs/specs/drafts/YYYY-MM-DD-<slug>.md`
- **You cannot implement** a spec that is not in `approved/` (CI FAILS on a PR that changes code without the corresponding spec in `approved/`)
- **After implementation:** fill in `## Result`, move it to `implemented/`, `status: implemented`
- **Supersede:** if a new spec replaces an old one — move the old one to `superseded/` with `status: superseded`, and in the new one specify `supersedes: [<old-id>]`
- **Never delete** completed specs — they are the decision history

### Phase 5: Operations Docs (1–2 hours)

#### 5.1 Minimal set of runbooks

| File | type | kind | Purpose |
|------|------|------|-----------|
| `docs/deploy.md` | runbook | deploy | Bootstrap/deploy step by step |
| `docs/cicd.md` | runbook | cicd | CI/CD — canonical source |
| `docs/ops.md` | runbook | ops | Day-to-day operations |
| `docs/troubleshooting.md` | runbook | troubleshoot | Failure patterns and fixes |
| `docs/secrets.md` | runbook | secrets | Secret reference |

#### 5.2 Runbook template

```markdown
---
schema: 1
id: runbook-<slug>
type: runbook
status: active
date: YYYY-MM-DD
owners: [underboss-team]
kind: deploy | cicd | ops | troubleshoot | secrets | integration
---

# Topic

## When to use
[Situation description]

## Prerequisites
- [Requirement 1]
- [Requirement 2]

## Steps
1. Step 1
2. Step 2
3. Step 3

## Verification
[How to verify everything works]

## Rollback
[What to do if something went wrong]
```

### Phase 6: AI Agent Rules (1–2 hours)

#### `.claude/rules/` — contextual rules

| File | Purpose |
|------|-----------|
| `doc-update.md` | Protocol for updating docs after changes |
| `spec-workflow.md` | Spec lifecycle, issue creation, reference to Schema v1 |
| `audit-workflow.md` | Creating audits from the canonical template |
| `entity-workflow.md` | Rules for creating and using entity_refs |
| `new-service.md` | Checklist for adding a new service |
| `testing.md` | How to run tests |

#### 6.1 `.claude/rules/doc-update.md`

```markdown
---
# Applies always — no path restriction
---

# Doc Update Protocol

After completing any task and before asking for review:

1. Identify touched components from `git diff --stat`
2. Map components to docs:
   | Changed | Update |
   |---------|--------|
   | docker-compose.yml | docs/architecture/README.md |
   | .env.example | docs/secrets.md |
3. Ask user: "Update docs? Affected: [list]"
4. If yes: update only relevant sections (max 20 lines per file)
5. Update frontmatter `updated` if content changed
```

#### 6.2 `.claude/rules/spec-workflow.md`

```markdown
---
applies-to: path("docs/specs/**")
---

# Spec Workflow

Creation:

1. `cp docs/.control/documentation/templates/spec.md docs/specs/drafts/YYYY-MM-DD-<slug>.md`
2. fill FM:
   - `id`: `<slug>` (no date, stable)
   - `status`: `draft` (mandatory — matches the drafts/ directory)
   - `date`: creation date
   - `updated`: date of last change (optional)
   - `owners`: team
   - `touches`: subsystems
   - `entity_refs`: entities this spec is about
3. fill body: Goal, Context, Scope, Technical approach, Affected files, Open questions, Acceptance criteria

Lifecycle (path == status, no separate `lifecycle` field):

```
drafts/  (status: draft)    →  approved/    (status: approved)
approved/(status: approved) →  implemented/ (status: implemented)
approved/ | implemented/    →  superseded/  (status: superseded)
```

Each transition — git `mv` + update `status` in FM. CI validates path-status match.

**Forbidden:**
- implement a spec that is not in `approved/`
- leave the `lifecycle:` field (it was removed from Schema v1)
- delete specs — `implemented/` and `superseded/` are permanent
- create .md without `schema: 1` and `id:`
```

#### 6.3 `.claude/rules/audit-workflow.md`

```markdown
---
applies-to: path("docs/audits/**")
---

# Audit Workflow

When creating a new audit:

1. Copy `docs/.control/documentation/templates/audit.md` to `docs/audits/YYYY-MM-DD-<slug>.md`
2. Fill in frontmatter:
   - `id`: `audit-<slug>` (slug without date)
   - `status`: `draft` (if in progress) or `completed` (if done)
   - `date`: date conducted (not the file creation date)
   - `scope`: what was checked (one sentence, per-type extension)
   - `trigger`: why it was conducted (per-type extension)
   - `entity_refs`: entities affected by the audit
   - `touches`: subsystems affected
3. Fill in the body (canonical structure):
   - `# Audit: <title>` (no date in title — date lives in frontmatter)
   - Summary → Findings → Conflicts (optional) → Resolution → Delta

**Append-only rule:**
- Frontmatter = metadata (mutable: 'draft -> completed' transition is allowed)
- Body = content (immutable after `status: completed`)

**Never:**
- Do not edit the body of an existing audit after `status: completed`
- Do not create an audit without `id` or without `type: audit`
- Do not use inline `**Date:**` in the body — date lives in frontmatter
- New audit for a new date — do not edit old audits
```

#### 6.4 `.claude/rules/entity-workflow.md`

```markdown
---
# Applies always — no path restriction
---

# Entity Refs Workflow

## Definition

`entity_refs` — stable identifiers of project domain entities. Format: `kebab-case`.

## When to use

- **spec:** entity_refs contains entities the spec DESCRIBES (not just touches)
- **audit:** entity_refs contains entities the audit CHECKS
- **architecture:** entity_refs contains entities the document DESCRIBES
- **runbook:** entity_refs contains entities the runbook relates to
- **adr:** entity_refs empty (ADR describes a decision, not an entity)

## Rules

1. **Min 1 ref** for spec and audit
2. **Max 10 refs** (otherwise document is too "general")
3. **Direct relation:** spec describes X → `entity_refs: [X]`
4. **Indirect relation:** spec touches X but does not describe it → `touches: [X]`

## Creating a new ref

1. Create a document describing the entity (architecture, spec, ADR)
2. Define `id` in canonical format (kebab-case)
3. Add to `docs/architecture/entity-catalog.md` or the relevant architecture doc
4. Now can be referenced from other documents

## Verification

```bash
# Verify ref exists
grep -r "schema-v1:" docs/architecture/

# Verify all entity_refs in project are defined
grep -rh "entity_refs:" docs/ | grep -v "^\s*entity_refs: \[\]" | awk '{print $2}' | while read ref; do
  grep -rq "$ref" docs/architecture/ || echo "WARNING: $ref not defined"
done
```
```

#### 6.5 `.claude/rules/new-service.md`

```markdown
---
applies-to: path("**/{docker-compose*.yml,*.service.yml}")
---

# New Service Checklist

Before adding a new service:

1. Update `docs/architecture/README.md` Module Index
2. Update `docs/architecture/topology.md` (if network ports exist)
3. Create new `docs/<service>-deploy.md` (type: runbook, kind: deploy)
4. Add secrets to `docs/secrets.md`
5. Add service to `docs/ops.md` day-to-day operations
6. Create spec in `docs/specs/drafts/YYYY-MM-DD-<service>-integration.md`
```

---

## AI Agent: Context-loading protocol

When starting work on a repository, the agent loads:

```
1. .context/project.yml        — what this project is
2. .context/boundaries.yml     — what you can/cannot touch
3. docs/architecture/README.md  — topology, data model, invariants
4. CLAUDE.md                    — rules for working with the codebase
5. docs/adr/                    — accepted architectural decisions
6. docs/specs/approved/         — what to implement
```

---

## Canonical Source of Truth

| Topic | Canonical source |
|------|----------------------|
| CI/CD | `docs/cicd.md` (type: runbook, kind: cicd) |
| Service topology | `docs/architecture/README.md` |
| Data model | `docs/architecture/domain-model.md` |
| Secrets | `docs/secrets.md` (type: runbook, kind: secrets) |
| Active tasks | `docs/backlog/active.md` (type: backlog) |
| Agent rules | `CLAUDE.md` + `.claude/rules/` |
| Frontmatter schema | This playbook §"Canonical Schema v1" + templates |
| Audit workflow | `.claude/rules/audit-workflow.md` |
| Spec workflow | `.claude/rules/spec-workflow.md` |
| Entity refs | `.claude/rules/entity-workflow.md` |

In case of conflicting information, read the canonical source.

---

## Audits and snapshots

`docs/audits/` — **append-only body**, **mutable frontmatter**. Every new audit is created from the canonical template.

### Creating a new audit

1. `cp docs/.control/documentation/templates/audit.md docs/audits/YYYY-MM-DD-<slug>.md`
2. Fill in the frontmatter: `id`, `status: draft`, `date`, `scope`, `trigger`, `entity_refs`, `touches`
3. Fill in the body: `# Audit: <title>`, Summary, Findings, Conflicts (optional), Resolution, Delta
4. If the audit is complete — `status: completed` (terminal)

### Audit Frontmatter (canonical schema + audit per-type extension)

| Field | Type | Mandatory | Description |
|------|------|-----------|-------------|
| `schema` | int | yes | Schema version (`1`) |
| `id` | string | yes | Stable ID, `audit-<slug>` |
| `type` | enum | yes | `audit` (constant) |
| `status` | enum | yes | `draft` or `completed` |
| `date` | date | yes | Date the audit was conducted |
| `owners` | [] | yes | Teams/components |
| `updated` | date | no | Date of last change |
| `scope` | string | no | What was checked (per-type extension) |
| `trigger` | string | no | Why it was conducted (per-type extension) |
| `entity_refs` | [] | no | Entities affected by the audit |
| `touches` | [] | no | Subsystems affected |

### Audit Body structure (canonical)

```
# Audit: <title>

> Scope: <...>
> Trigger: <...>

## Summary
<!-- 1-2 sentences: what was checked, what was found -->

## Findings
| # | Severity | Finding | Evidence | Recommendation |
|---|----------|---------|----------|----------------|
| F-01 | ... | ... | ... | ... |

## Conflicts
<!-- contradictions between findings (if any) -->

## Resolution
<!-- how it was resolved or resolution plan -->

## Delta
<!-- what changed since this entity's previous audit -->
```

### Append-only rule

> **Frontmatter = metadata. Body = content.**
> The append-only rule applies to the audit **body**. Frontmatter may be updated (for example, `status: draft → completed`).

> The body is not edited after `status: completed`. A new audit = a new file with a new date.
---

## Backlog: active and archive

```
docs/backlog/active.md    ← open actionable work only: items `[ ]`
docs/backlog/archive.md   ← everything else: `[x]` completed, `[-]` cancelled, deferred, dropped or superseded
```

An item leaves `active.md` the moment it is no longer open work and moves to `archive.md`. Both files have canonical frontmatter (`type: backlog`, `status: active`); templates are `documentation/templates/backlog-active.md` and `backlog-archive.md`. `validate-backlog.mjs` fails on a `[x]` or `[-]` item in `active.md` and on a `[ ]` item in `archive.md`.
---

## Documentation quality metrics

Key indicators of documentation system health:

### Coverage Metrics

| Metric | Target | How to check |
|---------|------|---------------|
| % of documents with `entity_refs` | >80% | `grep -L "entity_refs" docs/**/*.md` |
| % of specs in `approved/` or `implemented/` | >50% | `ls docs/specs/{approved,implemented}/ | wc -l` |
| % of ADRs with `accepted` status | >90% | `grep -l "status: accepted" docs/adr/*.md` |
| % of documents without legacy fields | 100% | CI guard |

### Freshness Metrics

| Metric | Target | How to check |
|---------|------|---------------|
| % of documents updated in the last 90 days | >70% | `find docs/ -mtime -90 -name "*.md"` |
| % of specs without `updated` field | <20% | `grep -L "updated:" docs/specs/**/*.md` |
| % of documents older than 1 year without review | <10% | `find docs/ -mtime +365 -name "*.md"` |

### Quality Metrics

| Metric | Target | How to check |
|---------|------|---------------|
| All .md in `docs/` with `schema: 1` | 100% | CI guard |
| All .md without legacy fields | 100% | CI guard |
| All specs path-status match | 100% | CI guard |
| All runbooks with `kind:` field | 100% | `grep -L "kind:" docs/**/*.md` |

### Automatic checks

```bash
# Documentation health check script
#!/bin/bash
set -euo pipefail

echo "📊 Documentation Health Check"
echo "=============================="

# 1. Schema coverage
total=$(find docs/ -name "*.md" | wc -l)
with_schema=$(grep -rl "^schema: 1" docs/ | wc -l)
echo "Schema coverage: $with_schema/$total ($(echo "scale=1; $with_schema*100/$total" | bc)%)"

# 2. Entity refs coverage
with_refs=$(grep -rl "entity_refs:" docs/ | grep -v "\[\]" | wc -l)
echo "Entity refs: $with_refs/$total ($(echo "scale=1; $with_refs*100/$total" | bc)%)"

# 3. Legacy fields
legacy=0
for field in "lifecycle:" "^author:" "^title:" "^created:" "supersedes_adr:" "referenced_by:"; do
  count=$(grep -rl "$field" docs/ 2>/dev/null | wc -l)
  legacy=$((legacy + count))
done
echo "Legacy fields: $legacy (should be 0)"

# 4. Spec status distribution
echo ""
echo "Spec status distribution:"
for dir in drafts approved implemented superseded; do
  count=$(ls docs/specs/$dir/*.md 2>/dev/null | wc -l)
  echo "  $dir: $count"
done

# 5. ADR status distribution
echo ""
echo "ADR status distribution:"
for status in proposed accepted deprecated superseded; do
  count=$(grep -l "status: $status" docs/adr/*.md 2>/dev/null | wc -l)
  echo "  $status: $count"
done
```

---

## Cheat sheet: Document Lifecycle

| Document type | type | Valid status | Where stored | Rules |
|--------------|------|--------------|-------------|---------|
| ADR | `adr` | `proposed → accepted → deprecated → superseded` | `docs/adr/` | Body immutable after acceptance; FM = metadata |
| Spec | `spec` | `draft → approved → implemented`; `approved \| implemented → superseded` | `docs/specs/{drafts,approved,implemented,superseded}/` | Git mv + update `status`, never delete |
| Audit | `audit` | `draft → completed` | `docs/audits/` | Body never edit after completed; FM mutable |
| Runbook | `runbook` | `active → deprecated` | `docs/*.md` | Updated on changes; kind distinguishes |
| Architecture | `architecture` | `active → deprecated` | `docs/architecture/` | Updated on topology/schema changes |
| Guide | `guide` | `active → deprecated` | `docs/*.md` (index, README) | Navigation entrance |
| API | `api` | `active → deprecated` | `docs/api/` | Versioned spec |
| Backlog | `backlog` | `active → deprecated` | `docs/backlog/{active,archive}.md` | `active.md`: open `[ ]` items only; `archive.md`: `[x]` completed, `[-]` cancelled/deferred/dropped/superseded |
| Prompt | `prompt` | `active → deprecated` | `docs/prompts/` | Context for the LLM |

> **Note:** `lifecycle` is not a column in the table — a spec's position is its directory. For other types lifecycle = status (there is no separate directory).

---

## Common mistakes

| Mistake | Why it is bad | Solution |
|--------|-------------|---------|
| No entry point for AI | The agent does not know where to start | `.context/` + `docs/README.md` START HERE |
| ADR-like documents in audits/ | No formal status | Move to `docs/adr/` with a formal lifecycle |
| Specs with a `lifecycle:` field in the FM | Drift between path and field on `git mv` | Lifecycle **computed from path**, do not store it in the FM. CI validates `status` vs path |
| Frontmatter without `schema:` / `id:` / `type:` | The machine cannot distinguish canonical from legacy | All .md in `docs/` must have the 6 mandatory Schema v1 fields |
| `author:` / `title:` / `created:` / `referenced_by:` legacy fields | Conflicts with the canonical schema, breaks the Portal parser | Replace: `author` → `owners`, `title` → body `# H1`, `created` → `date`, `referenced_by` → computed by Portal |
| Inline `**Date:**` in audit/spec body | Conflicts with the frontmatter date | Do not use it; the date lives in the FM, the body contains only the `# H1` title |
| Duplication in .claude/rules/ | They fall out of sync | Thin pointers → canonical source in docs/ |
| Runbooks without `kind:` | Cannot distinguish deploy from troubleshoot | `type: runbook` always with `kind:` |
| ADR body modified when adding FM | Violates immutability | Carve-out rule: FM ≠ body. The body is left byte-for-byte untouched, any update is FM only |
| Audit without the canonical template | Body structure varies, hard to parse | Always `cp docs/.control/documentation/templates/audit.md ...` |
| Creating .md without a template | FM is not canonical, no `schema:`/`id` | Greenfield invariant: start from `cp <type>/_template.md`, not from an empty file |
| Deleting completed specs | Loss of decision history | Never delete, store in `implemented/` |
| `supersedes_adr:` instead of `supersedes:` | Legacy field, breaks the parser | `supersedes: [<id>]` — a list (may have several) |
| Using `excludes-from-scope` | Anti-pattern: better to say "about Y" than "not about Z" | Use `tags: [not-X]` if necessary |
| No `entity_refs` in spec/audit | Unclear which entities it relates to | Minimum 1 ref for spec and audit |

---

## Readiness metrics (Schema v1 greenfield)

Check that the system was adopted from day one:

- [ ] `.context/project.yml` exists and contains the stack
- [ ] `.context/boundaries.yml` classifies files
- [ ] `docs/architecture/README.md` exists, has canonical FM, contains invariants and module index
- [ ] `docs/.control/documentation/templates/spec.md` exists with the Canonical Schema v1 Base
- [ ] `docs/.control/documentation/templates/audit.md` exists with the audit extension (`scope`, `trigger`)
- [ ] `docs/.control/documentation/templates/adr.md` exists with the canonical ADR FM
- [ ] At least 1 ADR in `docs/adr/` with `accepted` status (or proposed)
- [ ] `docs/README.md` exists, has canonical FM (`type: guide, kind: index`), START HERE section
- [ ] `.claude/rules/doc-update.md` defines the doc-update protocol
- [ ] `.claude/rules/audit-workflow.md` defines audit creation
- [ ] `.claude/rules/spec-workflow.md` defines the spec lifecycle + path-status validation rule
- [ ] `.claude/rules/entity-workflow.md` defines the entity_refs workflow
- [ ] `docs/backlog/active.md` exists, has canonical FM (`type: backlog, status: active`)
- [ ] CI guard: PR fails if `docs/**/*.md` lacks the mandatory `schema: 1` fields
- [ ] Mass grep validation: `git grep "^schema: 1$" docs/` → matches all .md files
- [ ] Mass grep validation: `git grep "lifecycle:" docs/` → **0 matches**
- [ ] Mass grep validation: `git grep "^author:" docs/` → 0 matches
- [ ] Mass grep validation: `git grep "^title:" docs/` → 0 matches
- [ ] Mass grep validation: `git grep "supersedes_adr:" docs/` → 0 matches
- [ ] Mass grep validation: `git grep "referenced_by:" docs/` → 0 matches
- [ ] Mass grep validation: `git grep "excludes-from-scope:" docs/` → 0 matches

---

## Adoption time

| Phase | Time | Blocker |
|-------|-------|--------|
| Phase 0: Structure + templates | 5 min | None (bootstrap script) |
| Phase 1: Agent Entry | 1–2 h | None |
| Phase 2: Architecture | 2–4 h | Understanding of the current architecture |
| Phase 3: ADRs | 1–2 h per ADR | Decisions must be made |
| Phase 4: Spec Lifecycle | 2–3 h | Phase 0 |
| Phase 5: Operations | 1–2 h | Phase 0 |
| Phase 6: AI Rules | 1–2 h | Phase 1 |
| CI Schema v1 guard | 30 min | Phase 0 (add to `.github/workflows/docs-validate.yml`) |

**Total:** 8–17 hours for full adoption. Minimum: Phase 0 + 1 = 2–3 hours (including template creation).

> Greenfield savings vs migrating from v1: ~2x faster — no need to retrofit 155 .md files, no migration script, no 7 waves W0-W7, no manual review of ADR bodies for byte-for-byte preservation.

---

## CI Schema v1 Guard (enable from the first PR)

> **Principle of no false positives.** The guard checks **only the frontmatter** (YAML between the first and second `---`), not the whole file. Therefore mentions of legacy fields in prose, tables, and code blocks (for example, in this playbook or in the Migration Prompt) do not break CI. Lifecycle and legacy fields are forbidden specifically as **frontmatter keys**, and are checked only where they could be — in the FM.

`.github/workflows/docs-validate.yml`:

```yaml
name: docs-validate
on:
  pull_request:
    paths: ["docs/**"]

jobs:
  schema-v1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
      - name: Validate Canonical Schema v1 frontmatter
        run: |
          bash docs/.control/documentation/validation/validate-frontmatter.sh
```


**Why this way:**
- `awk` cuts only the FM block → legacy fields in the document body (prose/tables/code) do not cause false positives.
- Validation of `schema: 1` and the mandatory fields is performed on the FM, not on the whole file.

This guard is enabled from the first PR. There are no transition periods and no warn-only mode.

---

## Result

**status:** implemented

**changed (this refactor):**
- `playbook/playbook-v2.md` — this file (previously at the repo root, renamed and moved).
- `playbook/migrate-legacy.md` — agent prompt for brownfield migration (previously `docs/guides/legacy-migration.md`).
- `documentation/templates/architecture.md`, `documentation/templates/adr.md`, `documentation/templates/spec.md`, `documentation/templates/audit.md`, `documentation/templates/runbook.md`, `documentation/templates/backlog-active.md`, `documentation/templates/backlog-archive.md` — canonical templates, extracted from the playbook as standalone files.
- `documentation/schemas/frontmatter.schema.json` — JSON Schema for Canonical Schema v1 (base + per-type extensions + forbidden legacy fields).
- `documentation/validation/validate-frontmatter.sh` — frontmatter-only validator (all findings are errors; a `kind:` check for runbooks; the spec path-status match moved to `validate-lifecycle.mjs`).
- `bootstrap/bootstrap.sh`, `bootstrap/bootstrap.ps1` — minimal idempotent bootstrap (creates the `docs/` skeleton, `.context/` stubs, the `CLAUDE.md` snippet, and the `docs-validate.yml` workflow).
- `engine/scripts/migrate-legacy.mjs` — runnable brownfield migration (no external dependencies).
- `INSTALL.md` — consumer integration: submodule add, `.gitmodules` branch=master, CLAUDE.md snippet, manual update, Dependabot submodule.
- `README.md` — rewritten as Underboss Landing Page (not as the repository's canonical index).
- `.github/workflows/docs-validate.yml` — workflow that calls `documentation/validation/validate-frontmatter.sh` (locally; push awaits a new PAT with `workflow` scope).
- `agents/{claude-code,opencode}/` — `architecture-reviewer` and `documentation-reviewer` roles for both platforms.

**deviations (vs. the original v2 plan):**
- The layout is split into Core and Documentation Module: `engine/reality-engine/`, `engine/scripts/` (Core) → `documentation/` (templates, validation, schemas) + `knowledge/` + `agents/` + `sops/` + `playbook/` (Documentation Module). This eliminates the visual drift of a "jumble of directories at the root".
- `documentation/templates/` are extracted from the playbook as standalone canonical files — this eliminates drift between the documentation and the real artifacts.
- `bootstrap/` is minimized: it creates only `docs/` + `.context/` + the `CLAUDE.md` snippet + the workflow — no magic that modifies existing files.
- `validate-lifecycle.mjs` normalizes `drafts` → `draft` (directory plural, status singular).
- The CI guard calls `documentation/validation/validate-frontmatter.sh` and contains no inline checks — a single source of truth.
- The inline `docs/bootstrap script` in the playbook is removed — the playbook now references `bootstrap/bootstrap.sh`.
