# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Krok is a control layer that consumer projects mount as a git submodule at `docs/.control/`. This repo is the product itself, not a consumer. It has no build step and no package.json; everything is Node ≥ 18 ESM (`.mjs`) plus bash. Its own `docs/` is both its documentation and the dogfooded example of what it enforces.

`AGENTS.md` and `INSTALL.md` are the canonical procedure for install/update/"update Underboss to Krok" requests (run the detection snippet in INSTALL.md first; verdict `MOVE` → `playbook/move-from-underboss.md`). On Windows use Git Bash, not the WSL `bash.exe`; commands can take minutes.

## Commands

CI (`.github/workflows/docs-validate.yml`) is the source of truth. Run from the repo root:

```bash
# all tests (the exact CI invocation)
node --test documentation/validation/tests/*.test.mjs core/control/tests/*.test.mjs bootstrap/tests/*.test.mjs engine/reality-engine/tests/*.test.mjs

# single test file / single test by name
node --test core/control/tests/e2e.test.mjs
node --test --test-name-pattern="<substring>" core/control/tests/cli.test.mjs

# validators (each is a CI step)
bash documentation/validation/validate-frontmatter.sh            # docs/ frontmatter (--changed: only files differing from HEAD)
ROOT=knowledge bash documentation/validation/validate-frontmatter.sh knowledge
node documentation/validation/validate-lifecycle.mjs docs        # Spec/ADR status transitions (BASE_REF=origin/master to diff against a base)
node documentation/validation/validate-backlog.mjs docs
bash documentation/validation/validate-integrity.sh              # dependency graph
node documentation/validation/validate-vocabulary.mjs .

# Control Plane CLI
core/bin/krok status            # also: attention, execution <list|show|create|ready|start|...>, escalation <list|show|open|resolve>
```

CI also checks every `documentation/templates/*.md` has `schema: 1` and `id/type/status/date/owners`.

## Architecture

Layers (ADR-005, which restates ADR-001/002/003 in one vocabulary):

- **Core** — Registry (`core/registry.yaml`, single source of truth for structure and vocabulary lists; paths are resolved through it, never hardcoded), Installation State Machine (`core/installation-state-machine.yaml`: `fresh|installed|partial|broken`), contracts (`core/contracts/{product,consumer}`), bash libs (`core/lib/`), bootstrap (`bootstrap/`: detectors per language, generators for `.context/*`, CI workflow, and a CLAUDE.md snippet in consumers), Reality Engine (`engine/reality-engine/`: collectors → analyzers → `reality-report.sh` produce drift reports).
- **Documentation Module** — `documentation/` (templates, JSON schema, validators), `knowledge/`, `agents/` (per-platform role prompts for `claude-code` and `opencode`), `sops/` (YAML procedures; `sops/planner.mjs`), `playbook/`.
- **Control Plane** (v3) — `core/control/`. `index.mjs` is the **Core SDK** and holds all rules: state transitions (`states.mjs`), READY validation and fingerprints (`ready.mjs`), Escalations (`escalation.mjs`), persistence (`store.mjs`, ADR-006), consistency/immutability checks, projections. `cli/commands.mjs` is a thin adapter that parses args and calls the SDK; **no rules belong in the CLI**. `core/bin/krok` just execs `cli/main.mjs`. `yaml.mjs` is a hand-rolled YAML parser (no dependencies — keep it that way).

Execution Units are created from an *approved* Spec, carry acceptance criteria by `AC-NNN` id, and move through states with human gates; the full model is in `docs/specs/approved/2026-10-04-krok-v3-control-plane-resume-rework.md`.

## Documentation rules enforced by validators

- Every doc under `docs/` has Canonical Schema v1 frontmatter (`schema: 1`, `id`, `type`, `status`, `date`, `owners`, …); use `documentation/templates/` as the starting point.
- Spec lifecycle: `draft → approved → implemented`, and `approved|implemented → superseded` (no `review` status). **Path equals status**: a Spec lives in `docs/specs/<status>/`. Approval is a human act, never automated. Approved Specs may be edited only by reopening as draft (ADR-008). Accepted ADR bodies are immutable; supersede with a new ADR. Owner decisions use the decision-record type (ADR-009).
- Backlog: `docs/backlog/active.md` holds open items only; finished/cancelled/dropped items move to `archive.md`.
- **No compatibility layers** (ADR-005, principle 15): no aliases, fallbacks, degraded modes or legacy enum values. A missing Registry or old layout is an explicit error.
- Never edit `docs/.control/` inside a consumer; the submodule is replaced whole.

## Gotchas

- Windows/CRLF: tests or readers that parse `core/registry.yaml` as text must not assume LF (see `docs/backlog/active.md`).
- `bootstrap/tests/runbook.test.mjs` copies files from the git index (`git ls-files -c`), so new files must be staged before running it or it goes falsely red.
- Naming: the product was renamed Underboss → Krok; the CLI/registry namespace is functional (`docs/.control/`, `CONTROL_ROOT`, registry key `control:`). Older docs still say Underboss and are historical.
