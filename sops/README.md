# sops/ — Standard Operating Procedures

> Declarative descriptions of development processes. Not execution — description. The orchestrator is a human or a simple planner script.

## What this is

A SOP is a YAML description of a standard development process (New Feature, Bugfix, Release, Architecture Review...) consisting of:
1. **Input** — which documents/artifacts must exist before starting.
2. **Steps** — a sequence of steps, each assigned a role from `agents/` or `gate: manual`.
3. **Output** — the artifacts that should appear upon completion.

A SOP describes **orchestration**, not validation logic. Validation is the responsibility of the role.

## Layout

```
sops/
├── README.md ← this file
├── planner.mjs            ← prints DAG (parallel groups, capabilities, artifacts)
├── new-feature.yaml       ← v1.0
├── bugfix.yaml            ← v1.0
├── new-service.yaml       ← v1.0
├── architecture-change.yaml ← v1.0
├── audit.yaml             ← v1.0
├── release.yaml           ← v1.0
├── incident.yaml          ← v1.0
├── architecture-review.yaml ← v1.1: sequential review pipeline
├── forensic-audit.yaml    ← v1.1: 8-step forensic pipeline (domain-specific)
├── forensic-layer-audit.yaml ← v1.2: 11-phase single-agent layer-agnostic forensic audit
└── pipeline-topology-audit.yaml ← v1.0: 3-layer progressive pipeline-agnostic forensic audit (Execution/Structural/Content Topology)
```

## Available SOPs

| SOP | Purpose | Steps | Role |
|-----|---------|-------|------|
| `new-feature` | New feature lifecycle (spec → approval → implementation) | 3 | mixed |
| `bugfix` | Bug fix with documentation update | 3 | mixed |
| `new-service` | New service with ADR + architecture docs | 4 | mixed |
| `architecture-change` | Architecture change with ADR + review | 4 | mixed |
| `audit` | Documentation audit | 2 | mixed |
| `release` | Release with changelog + version bump | 3 | mixed |
| `incident` | Incident response with post-mortem | 8 | mixed |
| **`architecture-review`** | Sequential review: Reality → Arch → Doc → Adversary → Human | 5 | multi-role |
| **`forensic-audit`** | 8-step forensic audit pipeline (domain-specific) | 8 | multi-role |
| **`forensic-layer-audit`** | 11-phase single-agent forensic audit of any layer/section/subsystem | 11 | `forensic-auditor` only |
| **`pipeline-topology-audit`** | 3-layer progressive reconstruction of a multi-hop data pipeline's runtime reality (Execution → Structural → Content Topology) before any coverage matrix is built | 6 | `pipeline-archaeologist` only |

## Artifact Contracts (v1.1)

SOP steps declare **data flow** via `consumes:` / `produces:` and **control flow** via `depends_on:`:

```yaml
- id: 2
  name: Architecture review
  capability: review-spec
  role: architecture-reviewer
  consumes: [reality-report, subject-spec]   # data flow: what we receive
  produces: architecture-findings            # data flow: what we produce
  depends_on: [1]                            # control flow: after which step
```

`consumes:` and `depends_on:` are usually isomorphic but represent different intents:
- `depends_on:` = control flow (sequential execution order)
- `consumes:` = data flow (which artifacts are consumed as input)

## gate: manual (v1.1)

Human steps use `gate: manual`, not `role: human`. Human is not an agent role:

```yaml
- id: 5
  name: Human decision gate
  gate: manual
  consumes: [architecture-findings, documentation-report]
  depends_on: [3]
```

## Parametrized Input (v1.1)

Some SOPs accept parameterized input. Example — `forensic-audit.yaml`:

```yaml
input:
  required:
    - type: spec|adr|audit
      path: <target subject document>
      artifact: subject-document
    - type: list
      name: entities       # domain entities of consumer
    - type: list
      name: mechanisms     # control mechanisms for audit
```

The `entities` and `mechanisms` are NOT hardcoded in SOP — consumer provides them at invocation time.

The newer `forensic-layer-audit.yaml` (v1.2) parameterizes differently — by **scope**, not by domain entity list:

```yaml
input:
  required:
    - type: project-root
      path: "."
      artifact: project-root
    - type: string
      name: layer          # stable name of the audited layer/section/subsystem
    - type: string
      name: target_section # optional narrower scope within the layer
  optional:
    - type: string
      name: hint           # free-form clue (suspect God-Object, baseline access, alembic tracks)
    - type: string
      name: commit_range
      default: "last 40"
    - type: enum
      name: depth          # shallow | normal | deep (shallow skips Phases 4-7)
      default: normal
    - type: string
      name: output_path
```

This keeps `forensic-layer-audit` layer-agnostic — the same SOP is reusable across `control-plane`, `raw-ingestion`, `billing`, `frontend-auth`, infra, etc.

## Usage

```bash
node sops/planner.mjs --list                    # list available SOPs
node sops/planner.mjs architecture-review       # print DAG
node sops/planner.mjs forensic-audit --platform opencode  # platform-specific
node sops/planner.mjs incident --hide-human     # hide manual gates
```

## Extension

Add a new SOP — create `sops/<name>.yaml`. The planner will pick it up automatically.

## What is NOT included (intentionally)

- **No execution state in a SOP.** A SOP does not store progress between runs.
- **No execution engine.** Not Temporal, not Airflow. YAML + planner.
- **No built-in validators.** Validation logic is the responsibility of the role (D-3).
