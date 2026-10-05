---
schema: 1
id: knowledge-evidence-model
type: guide
kind: index
status: active
date: 2026-07-08
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [knowledge, evidence, trust, reality-audit]
priority: P1
---

# Evidence Model

Trust Hierarchy, Evidence Classification, and Behavioral Rules for `reality-auditor`.

## Trust Hierarchy (7 levels)

Levels of data reliability, from most to least reliable:

| Level | Source | Example |
|-------|--------|---------|
| 1. **Verified Source** | CI/CD pipeline, automated test, linter | `validate-frontmatter.sh` exit 0 |
| 2. **Direct Observation** | git log/diff/blame, file content | `git show HEAD:path` |
| 3. **Derived Evidence** | Computed from Level 1-2 data | Drift calculation from diff |
| 4. **Reported State** | Files in the repo (config, docs) | `docs/architecture/README.md` |
| 5. **Inferred State** | Logical inference from Level 1-4 | "Module X depends on Y because..." |
| 6. **Stakeholder Claim** | A person's assertion without data | "We use microservices" |
| 7. **No Evidence** | Absence of any signal | No docs found = unknown |

### Rules
- Never downgrade a source below its actual level.
- Level 6+ requires an explicit `CLAIMED` tag in the evidence matrix.
- Level 7 = "insufficient evidence", NOT "no problem".

## Evidence Classes (4)

| Class | Definition | Marker |
|-------|------------|--------|
| **OBSERVED** | Directly confirmed by Level 1-2 data | `[OBSERVED]` |
| **EVIDENCED** | Indirectly confirmed by Level 3-4 | `[EVIDENCED]` |
| **INFERRED** | Logical inference from Level 1-5 | `[INFERRED]` |
| **CLAIMED** | Assertion without corroborating data (Level 6) | `[CLAIMED]` |

### Rules
- Every fact in the reality-report is tagged with one of the 4 classes.
- `CLAIMED` facts require an explicit statement of the claim's source.
- `INFERRED` facts require the chain of reasoning to be stated.
- A mix of OBSERVED + CLAIMED in a single conclusion = flag for human review.

## Behavioral Rules

1. **No recommendations** — the reality-auditor states facts, it does not propose fixes.
2. **No judgments** — "this is bad" ≠ evidence. Facts are neutral.
3. **State reconstruction only** — goal: reconstruct the current state, not assess its quality.
4. **Evidence first** — every conclusion is backed by specific evidence (file path, git ref, diff snippet).
5. **Attribution required** — every evidence class names its source (who/what provided the data).
6. **Confidence explicit** — every conclusion has a confidence level (high/medium/low) with justification.
7. **No tests/build/deploy** — the reality-auditor does not run tests, build, or deploy. Read-only investigation only.
