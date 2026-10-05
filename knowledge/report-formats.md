---
schema: 1
id: knowledge-report-formats
type: guide
kind: index
status: active
date: 2026-07-08
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [knowledge, report, format, output]
priority: P1
---

# Report Formats

Output formats for 4 reviewers. Roles use as output template.

## Architecture Review

```
## Architecture Review

Verdict: APPROVED | REQUEST_CHANGES | REJECTED

### Findings
[F-01] (severity: high|medium|low)
File: path/to/file.md:LINE
Issue: <what's wrong>
Recommendation: <how to fix>
Evidence: <file path / line / diff snippet>

### Invariants verified
- INV-N: PASS/FAIL (one line per critical invariant)

### Must-do before merge
- [ ] (only if REQUEST_CHANGES / REJECTED)

### Architectural context read
- ADR-NUM: understood
- INV-N: verified
- module-index: confirmed up to date
```

## Reality Audit

```
## Reality Audit — Current State Report

### Feature Inventory
| Feature | Status | Evidence | Class |
|---------|--------|----------|-------|
| <name>  | exists/missing/drift | <evidence> | OBSERVED/EVIDENCED/INFERRED |

### Drift Analysis
| Expected (docs) | Actual (code) | Delta | Severity |
|-----------------|---------------|-------|----------|
| <doc claim>     | <observation> | <diff> | high/medium/low |

### Architecture Extraction
| Module | Responsibility | Dependencies | Owner |
|--------|---------------|--------------|-------|
| <name> | <desc>        | <list>       | <who> |

### Confidence Summary
- OBSERVED: N facts
- EVIDENCED: N facts
- INFERRED: N facts
- CLAIMED: N facts

### Open Questions
- <unresolved items with INSUFFICIENT_EVIDENCE>
```

## Adversary Report

```
## Adversary Validation Report

### Verdict Summary
| Finding | Verdict | Confidence | Evidence Chain |
|---------|---------|------------|----------------|
| F-01    | SUSTAINED/WEAKENED/REFUTED/INSUFFICIENT | HIGH/MEDIUM/LOW | <sources> |

### Per-Finding Detail
#### F-01: <finding title>
- **Claim**: <decomposed claim>
- **Evidence found**: <level + source>
- **Verdict**: <verdict>
- **Confidence**: <level>
- **Reasoning**: <how evidence leads to verdict>

### Contradictions
- <any conflicting evidence between findings>

### Open Questions
- <INSUFFICIENT_EVIDENCE items requiring human review>

### Aggregate
- Total findings: N
- SUSTAINED: N | WEAKENED: N | REFUTED: N | INSUFFICIENT: N
```

## Forensic Report

```
## Forensic Audit Report

### 1. Control Objects Identification
<entities × capabilities matrix with evidence>

### 2. Actual Control Plane Entity
<answer + mechanisms + code_refs + confidence>

### 3. Signal Inventory
<external/internal signals × granularity/attribution>

### 4. Attribution Analysis
<per-source attribution: hard/probabilistic/impossible>

### 5. Multi-Binding Reality Check
<verdict + evidence + contradictions>

### 6. Runtime Ownership Analysis
<runtime_owner + per-attribute owner + conflict_behavior>

### 7. Reputation Layer Design
<layer_responsibilities + unified_identity_exists?>

### 8. Final Recommendation
<adr_recommendation + risk_register + open_questions>
```

### Terminal Artifact
The forensic report is saved as `docs/audits/YYYY-MM-DD-forensic-<topic>.md`.

## Universal Forensic Report

Output format for the `forensic-auditor` role (single-agent, layer-agnostic forensic audit). Save as `docs/audits/YYYY-MM-DD-forensic-<layer>-<topic>.md` with canonical frontmatter: `type: audit`, `status: completed`, `entity_refs: [<layer-id>]`, `scope:` (perimeter), `trigger:` (why audit run), `tags: [forensic, audit, <layer>]`.

```
# FORENSIC AUDIT REPORT — <layer>

Audit subject:        <layer> / <target_section>
Project:              <project_path>
Date:                 <YYYY-MM-DD>
Depth:                <shallow|normal|deep>
Baseline data access: <yes|no|insufficient>

---

## 0. Scope & Boundaries
<perimeter, production baseline, explicit exclusions>

## 1. As-Is Mapping
<reconstructed entities; alignment table: documentation ↔ code ↔ data;

 every row carries an evidence class OBSERVED|EVIDENCED|INFERRED|CLAIMED|INSUFFICIENT>

## 2. Drift, God-Object, Legacy
<drift inventory: each finding with {class (DRIFT_* family), origin, code_ref,
 data_ref (if any), classification token}; legacy terminology inventory seed>

## 3. To-Be Target Model
<invariants INV-<LAYER>-1..N (description, rationale, verification, affected
 components); normalized entities with multi-level unique identity; orthogonal axes;
 single source of truth per data class; backward-compat strategy; package roadmap>

## 4. Manifest (single SSOT)
<draft path + code sketch of app/seeds/<layer>_manifest.py; helper functions
 (_ic_for / _ir_for / equivalents); manifest signature (counts + sorted hashes)>

## 5. Models with Constraints
<ORM classes sketch; column-naming convention (sa_column / <fkfield>_); CHECK
 constraints chk_<table>_<field> sourced from the manifest enum; model registration>

## 6. Migration: DDL + seed + in-migration validations
<phased upgrade(): create tables (FK-order) → indexes → bulk-insert from manifest →
 sequential invariant-validations (each fails-fast naming the invariant);
 downgrade(): reverse order, never delete the manifest module>

## 7. Invariant Test Coverage
<one test file per INV-<LAYER>-N (static + dynamic); one per requirement;
 parameterized coverage meta-test asserting file existence; grep-prevention tests
 against forbidden patterns post-migration>

## 8. Legacy Terminology Inventory Document
<legacy → target multi-level identity mapping; drift origin per row;
 3-phase migration plan (coexistence → new-writes → legacy removal)>

## 9. Invariants Registry & Architecture Doc
<fenced sketches of docs/architecture/invariants.md (INV-<LAYER>-1..N entries) and
 docs/architecture/<layer>.md (textual ER diagram + entity responsibilities + ortho axes)>

## 10. Commit, Deploy, Validate — Runbook
<human-gated checklist: local pytest --collect-only + statics; selective git add
 (never -A); commit template; 60s pause; push via project secret wrapper;
 CI watch (./scripts/run gh run list); prod SSH: logs + alembic current + row counts
 vs manifest + status enums; on red CI/prod → new commit, never amend>

## 11. Handoff to the Next Package
<state: completed / active / blocking / next; dependency check on the next package>

## Validation Summary
| Phase | Status | Evidence class used | Findings | Retries |
|-------|--------|--------------------|----------|---------|
| 0     | PASSED | OBSERVED           | —        | 0       |
| 1     | PASSED | OBSERVED+EVIDENCED | 4 drift  | 0       |
| 2     | PASSED | OBSERVED+INFERRED  | 12 clsd  | 0       |
| ...

## Open Questions / INSUFFICIENT_EVIDENCE
- <item + what evidence would resolve it>

## Metadata
- Audit timestamp:        <now>
- Analysis depth:         <depth>
- Code files examined:    <count>
- Migrations examined:   <count>
- Production queries run: <count, 0 if no access>
- Tool calls made:        <rough estimate>
- Produced artifacts:     <list of side-artifacts written, if any>
```

### Anti-hallucination guardrails (self-enforced)
1. Every `code_ref` resolves to an actual file:line read during the audit.
2. Counts come from real queries (SQL / git / grep); the query string stated.
3. `HYPOTHESIS` only at `depth=deep`, explicitly tagged with rationale + refutation recipe.
4. Every Phase-3 invariant has an index-aligned Phase-7 test sketch.
5. Every Phase-3 normalized entity has an index-aligned Phase-4 manifest list.
6. Every Phase-6 migration validation names the invariant it enforces.
7. If production data access was `INSUFFICIENT`, never report row counts as `OBSERVED`.
8. No claim without a class; no class without a reference.

## Pipeline Archaeology Report

Output format for the `pipeline-archaeologist` role (3-layer progressive
forensic reconstruction of a multi-hop data pipeline). One report per layer,
saved as `docs/audits/YYYY-MM-DD-<pipeline>-<layer>-archaeology-audit.md`
with canonical frontmatter: `type: audit`, `status: completed`,
`depends_on: [<previous-layer-audit-id>]`, `entity_refs: [<pipeline-related-entities>]`,
`scope:` (perimeter), `trigger:` (why this audit ran), `tags: [pipeline,
archaeology, <layer>]`.

```
# <Layer> Archaeology — <pipeline>

## Summary
<1-3 sentences: what was reconstructed, what the headline findings are>

## <Layer-specific structural section(s)>
<Layer 1: prose model of dispatch strategies, checkpoint/watermark, dedup,
 recovery mechanisms>
<Layer 2: full node table
 | node | family/group | strategy | producer | consumer | handler/adapter | legacy fallback | status |
 + orphan list with evidence + bypass-pattern list + ownership matrix>
<Layer 3: one subsection per node — sections -> transform (file:line) ->
 target table; what's ignored/dropped with confidence tier per claim
 (fixture-confirmed / plugin-corroborated / code-only); field-level dead
 code; cross-cutting hidden dependencies>
<Coverage Matrix (only after Layers 1-3, own step but usually embedded in
 the Layer 3 or a final synthesis report):
 | node | handler exists | wired to runtime | payload composition known | real sample available | parity proven | ready for downstream work |>

## Findings
| # | Severity | Finding | Evidence | Recommendation |
|---|----------|---------|----------|----------------|
| <layer-prefix>-01 | ... | ... | ... | ... |

## Conflicts
<explicit corrections to a prior status:completed audit for this or another
 pipeline — never edit the prior document's body; reference the original
 finding by id>

## Resolution
<what's settled; what's an open question requiring a human decision — list
 every Critical/High finding needing a decision explicitly, never auto-fixed>

## Delta
<what this layer adds relative to prior layers/audits of the same pipeline>
```

### Anti-hallucination guardrails (self-enforced)
1. Every claim resolves to an actual `file:line`, or (Layer 3 payload
   claims) a pointer to the specific real sample used.
2. Every Layer 3 claim carries an explicit sourcing tier
   (`fixture-confirmed` / `plugin-corroborated` / `code-only`) — never state
   a `code-only` claim in language that reads as `fixture-confirmed`.
3. "Confirmed empty in every sample checked" is never phrased as "confirmed
   irrelevant."
4. The Coverage Matrix is never produced before Layers 1-3 are complete
   (partial exception: `depth=shallow` runs, which must say so explicitly).
5. A finding outside the pipeline's own perimeter is flagged
   cross-cutting/out-of-scope-but-relevant, never silently folded into the
   pipeline's own findings table.
6. No claim without a class/tier; no class/tier without a reference.
