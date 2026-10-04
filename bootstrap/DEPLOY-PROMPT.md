---
schema: 1
id: underboss-deploy-prompt
type: guide
kind: onboarding
status: active
date: 2026-10-04
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [bootstrap, deploy, prompt, agent, onboarding, underboss]
priority: P0
---

# Deploy Prompt for AI Agent — Underboss

> Give this entire document to an AI agent (opencode, Claude Code, Cursor, etc.)
> and say: **"Install Underboss."**
> The agent detects the current state, installs or updates, verifies everything,
> and reports back. No questions asked.

---

## Prompt

```
You are installing Underboss on this project.
Underboss is an engineering control plane for projects built with AI coding agents:
it knows the architecture, rules, processes, invariants, and context of the project.
Documentation is one of its modules — not the whole system.

Work autonomously — detect the current state, choose the correct path, execute it,
verify the result, commit locally, and report. Do NOT ask the user clarifying
questions; if something is ambiguous, pick the safest path and note it in the report.

═════════════════════════════════════════════════════════════
STEP 0 — Detect current state
═════════════════════════════════════════════════════════════

Run these commands from the current working directory:

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "NOT_A_GIT_REPO")
echo "Project root: $PROJECT_ROOT"

echo "=== .gitmodules ==="
cat "$PROJECT_ROOT/.gitmodules" 2>/dev/null || echo "none"

echo "=== existing docs/ ==="
ls "$PROJECT_ROOT/docs/" 2>/dev/null | head -10 || echo "no docs/"

echo "=== Underboss (if already installed) ==="
if [ -f "$PROJECT_ROOT/docs/.control/core/registry.yaml" ]; then
  grep -E '^  version:' "$PROJECT_ROOT/docs/.control/core/registry.yaml" | head -1
  grep -E '^  name:' "$PROJECT_ROOT/docs/.control/core/registry.yaml" | head -1
else
  echo "not installed"
fi

Based on the results, choose ONE path:

┌─ What you found ─────────────────────────────────────────┬─ Path ───────────────┐
│ No docs/.control/                                         │ Fresh install (A)    │
│ docs/.control/core/registry.yaml exists                   │ Update in place (B)  │
│ anything else (a different mount path, a missing          │ STOP and report      │
│ registry)                                                 │                      │
└───────────────────────────────────────────────────────────┴──────────────────────┘

Do NOT ask the user which path to take. Decide and proceed.
An installation from an earlier version is converted once by the migration of the
release, never by this prompt.

═════════════════════════════════════════════════════════════
STEP A — Fresh install
═════════════════════════════════════════════════════════════

cd "$PROJECT_ROOT"
mkdir -p docs/.control
git submodule add https://github.com/akturt/underboss.git docs/.control
git config -f .gitmodules submodule."docs/.control".branch master
git commit -m "chore: add Underboss via submodule"
bash docs/.control/bootstrap/bootstrap.sh --target "$PROJECT_ROOT"

═════════════════════════════════════════════════════════════
STEP B — Update an existing installation
═════════════════════════════════════════════════════════════

Do NOT reinstall. Pull the latest and re-run idempotent bootstrap:

cd "$PROJECT_ROOT"
git submodule update --remote --merge docs/.control
bash docs/.control/bootstrap/bootstrap.sh --target "$PROJECT_ROOT"

If bootstrap reports a missing registry — stop and surface it as an error.

═════════════════════════════════════════════════════════════
STEP 4 — Post-install verification
═════════════════════════════════════════════════════════════

── 4.1 CRITICAL: Underboss directories must NOT leak to project root ──

These directories live ONLY inside docs/.control/.
If any of them exists at the repo root, the previous install was broken — remove them.

FAIL=0
for d in agents knowledge sops engine documentation bootstrap playbook core; do
  [ -d "$PROJECT_ROOT/$d" ] && echo "FAIL: $PROJECT_ROOT/$d leaked to root" && FAIL=1 || echo "OK: no $PROJECT_ROOT/$d"
done
[ $FAIL -eq 1 ] && echo "ABORT: fix root leakage before continuing" || echo "PASS"

── 4.2 Required structure ──────────────────────────────────────

[ -f "$PROJECT_ROOT/docs/.control/bootstrap/bootstrap.sh" ] || { echo "FAIL"; exit 1; }
[ -f "$PROJECT_ROOT/docs/.control/core/registry.yaml" ] || { echo "FAIL"; exit 1; }

── 4.3 Empty-dir check after bootstrap ──────────────────────────

find "$PROJECT_ROOT/docs/" -type d -empty | grep -v "^$PROJECT_ROOT/docs/$"
# Any output here means there are empty directories in docs/.
# Pre-existing empty dirs are legitimate — verify against
# docs/.control/core/registry.yaml before deleting.

── 4.4 Validators ───────────────────────────────────────────────

cd "$PROJECT_ROOT"
bash docs/.control/documentation/validation/validate-frontmatter.sh
node docs/.control/documentation/validation/validate-lifecycle.mjs docs
node docs/.control/documentation/validation/validate-backlog.mjs docs
bash docs/.control/documentation/validation/validate-integrity.sh

All must pass. If any reports errors — stop and report.

── 4.5 Reality Engine report (post-install drift check) ─────────

Run the Reality Engine to find architecture breakage points:

cd "$PROJECT_ROOT"
bash docs/.control/engine/reality-engine/reporters/reality-report.sh "$PROJECT_ROOT"

python3 is preferred for full drift parsing; without it the report falls back
to a limited grep view but still produces useful output.

Read the report. Report these to the user explicitly:

* ADR drift — docs reference an ADR id that does not exist
* Documentation drift — docs missing required frontmatter (schema/id/type)
* Spec drift — spec status does not match its directory
* Structure drift — expected top-level dirs (docs/, .context/) missing

List each item as "architecture breakage point" with the file path and issue.
Do NOT silently fix drift items — surface them so the user decides.

═════════════════════════════════════════════════════════════
STEP 5 — Commit and report
═════════════════════════════════════════════════════════════

cd "$PROJECT_ROOT"
git add -A
git status --short
git diff --cached --stat
git commit -m "docs: Underboss installed" || echo "nothing to commit"

Do NOT push.

Report to the user:
1. Project path and git remote
2. Action taken (fresh install / updated)
3. Verification results (4.1 root check, 4.2 structure, 4.4 validators)
4. Post-install drift findings (ADR / documentation / spec / structure breakage points)
5. Next steps for the user:
   - Fill in .context/project.yml (project metadata)
   - Fill in .context/boundaries.yml (boundary definitions)
   - Create the first ADR from documentation/templates/adr.md
   - Resolve any reported drift items

═════════════════════════════════════════════════════════════
RULES (hard — do not violate)
═════════════════════════════════════════════════════════════

· NEVER create agents/, knowledge/, sops/, engine/, documentation/,
bootstrap/, playbook/, core/ at the project root.
They live ONLY inside docs/.control/.

· NEVER edit files inside docs/.control/.
It is a git submodule (pristine zone). Update it only via
`git submodule update --remote --merge` as a whole.

· NEVER copy templates from documentation/templates/ into the consumer
project and keep local duplicates. Use `cp` to create a new file
from the template once — the template itself is the source of truth
and lives in the submodule.

· The docs/ directory at the project root is for the CONSUMER'S content.
The only system-owned subdirectory is docs/.control/.
Everything else in docs/ (architecture/, adr/, specs/, audits/, etc.)
belongs to the project and bootstrap / Reality Engine will never touch it.

· All .md files in docs/ must have Canonical Schema v1 frontmatter
(6 mandatory fields: schema, id, type, status, date, owners).

· If bootstrap reports a missing registry — STOP immediately and report.
Do not guess.

· If anything fails — STOP and report the exact error and the step
where it happened. Do not silently skip steps or continue in an
unknown state.
```
