---
schema: 1
id: knowledge-audit-principles
type: guide
kind: index
status: active
date: 2026-07-08
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [knowledge, audit, validation, adversary, confidence]
priority: P1
---

# Audit Principles

5-Stage Validation Protocol, Verdict System, and Confidence Model for `adversary-checker`.

## 5-Stage Validation Protocol

Every claim from `architecture-findings` passes through 5 stages:

### Stage 1: Claim Decomposition
Break each finding into separate, verifiable claims:
- **Factual claim** — "file X exists / does not exist"
- **Causal claim** — "change Y led to Z"
- **Normative claim** — "X should be done" (only the factual part is verified)

### Stage 2: Evidence Hunt
For each claim, find corroborating or refuting data (canonical scale — see Evidence Level Ladder below):
- Level 1-2 evidence (verified/direct) — strongest
- Level 3-5 evidence (derived/inferred) — contextual
- Absence of evidence — is not evidence of absence

### Stage 3: Verdict Assignment
Each claim receives a verdict:

| Verdict | Definition |
|---------|------------|
| **SUSTAINED** | Claim confirmed by Level 1-2 evidence |
| **WEAKENED** | Claim partially confirmed, but there are Level 3-4 contradictions |
| **REFUTED** | Claim refuted by Level 1-3 evidence |
| **INSUFFICIENT_EVIDENCE** | Insufficient data for a verdict (Level 5-7) |

### Stage 4: Confidence Matrix
For each verdict — confidence level:

| Confidence | Criterion |
|------------|-----------|
| **HIGH** | Level 1-2 evidence, no contradictory data |
| **MEDIUM** | Level 3-4 evidence, minor contradictions |
| **LOW** | Mixed levels, significant gaps, or Level 5+ reliance |

### Stage 5: Synthesis
Combine individual verdicts into an overall report:
- Overall verdict per finding
- Confidence matrix (finding × verdict × confidence)
- Open questions (INSUFFICIENT_EVIDENCE items)
- Contradictions between findings

## Evidence Level Ladder

Canonical scale of evidence quality (Levels 1-7), referenced by the Verdict System and Confidence Matrix:

| Level | Name | Meaning | Report class |
|-------|------|---------|--------------|
| 1 | Direct observation | `file:line` read by the checker itself during this validation | OBSERVED |
| 2 | Mechanical verification | Machine check performed now: Grep hit on a concrete literal, validator/test output, recount over primary records | EVIDENCED |
| 3 | Derived from primary data | Aggregation/interpretation of Level 1-2 data (distributions, deltas) not independently recounted | INFERRED |
| 4 | Documentation | Statement in docs/specs/ADRs — describes intent, not state | INFERRED |
| 5 | Unverified claim | Author's assertion inside the source material; single uncorroborated mention | CLAIMED |
| 6 | Retelling | Secondhand — retelling of a retelling, summary without a primary source | CLAIMED |
| 7 | Unavailable | Outside the access of available tooling (not run, not initialized, no access) | INSUFFICIENT |

Boundaries used by the Verdict System: SUSTAINED requires Level 1-2; WEAKENED admits Level 3-4 contradictions; REFUTED requires Level 1-3 disproof; INSUFFICIENT_EVIDENCE = the claim rests on Level 5-7.

## Verdict System

### Per-Finding Verdict
Each finding from the architecture-review receives:
- **Verdict**: SUSTAINED / WEAKENED / REFUTED / INSUFFICIENT_EVIDENCE
- **Confidence**: HIGH / MEDIUM / LOW
- **Evidence chain**: sources used for this verdict
- **Evidence target**: "the artifact asserts P" (Level 1-2 from the artifact itself) is kept separate from "P is true in the external world" (requires an external snapshot); failure of the second does not cancel the first
- **Reasoning**: how the evidence leads to the verdict

### Aggregate Verdict
Evidence maturity and defect status are two independent axes; INSUFFICIENT never cancels a WEAKENED or REFUTED downgrade. Overall result of the adversary-check:
- **All SUSTAINED** → findings validated, proceed
- **Mixed** → `MIXED (N WEAKENED, M INSUFFICIENT)`, both axes visible; human decides
- **Any REFUTED** → findings need revision
- **Any INSUFFICIENT** → more data needed, listed separately from defect status

## Confidence Model

### Sources of Confidence
- **Evidence quality** (Level 1-2 = high, Level 5-7 = low)
- **Evidence quantity** (multiple independent sources = higher)
- **Consistency** (no contradictions = higher)
- **Recency** (current data = higher than stale)

### Confidence Degrades When:
- Claims rely on Level 5+ evidence
- Contradictory evidence exists
- Data is stale (>30 days for code, >7 days for config)
- Chain of reasoning is long (>3 hops)

## Behavioral Constraints

1. **No new claims** — the adversary-checker verifies others' claims, it does not generate new ones.
2. **No recommendations** — verdict + confidence, without suggestions for fixes.
3. **Read-only** — does not edit files, does not run commands (webfetch is allowed for fact-checking).
4. **Stalemate Protocol** — if the adversary-checker cannot determine a verdict (insufficient evidence), mark it as `INSUFFICIENT_EVIDENCE` and hand off to a human; do NOT guess.
5. **Proportional scrutiny** — high-impact findings are checked more strictly, low-impact ones faster.
6. **Source attribution** — every verdict points to specific evidence sources.
7. **No appeal to authority** — "the author said so" ≠ evidence. Data only.
