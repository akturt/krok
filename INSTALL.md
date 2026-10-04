---
schema: 1
id: install-underboss
type: guide
kind: onboarding
status: active
date: 2026-10-04
owners: [underboss-team]

entity_refs: [agentic-layer, schema-v1, canonical-frontmatter]
touches: [docs, .context, .gitmodules, CLAUDE.md, .github/workflows]
docs: [playbook/playbook-v2.md, playbook/migrate-legacy.md]
refs: []
depends_on: []
implements: []
supersedes: []
tags: [install, update, migration, submodule, consumer, onboarding, v3]
priority: P0
---

# Installing, updating and migrating Underboss

This is the **one canonical runbook** for a consumer repository. It covers three cases and tells you which one you are in:

| Case | Flow |
|---|---|
| Underboss is not installed | [A. Install v3](#a-install-v3) |
| Underboss v3 is installed | [B. Update v3](#b-update-v3) |
| Underboss v2 is installed | [C. Migrate v2 → v3](#c-migrate-v2--v3) |

Everything is run **from the repository root** of the consumer project. Underboss lives in the consumer as a git submodule at `docs/.control/` (v3). Requirements: `git` ≥ 2.20, `node` ≥ 18, `bash` (Git Bash on Windows).

<!-- migration-source:start -->
## For an AI coding agent

You can choose the flow without asking the user, if the repository state allows it.

1. Go to the repository root: `cd "$(git rev-parse --show-toplevel)"`.
2. Look at the tree: `git status --porcelain --untracked-files=no`. It must be empty before any flow that changes the submodule. If it is not, stop and tell the user.
3. Run the detection below. It prints exactly one line.
4. Follow the flow that line names, step by step, in order. Do not skip checks.
5. Do not invent a migration path. There is exactly one: v2 → v3, flow C. Anything else (a v1.x layout, a half-installed state, both mounts) is a `STOP`.
6. Never edit files inside `docs/.control/` (or `docs/.runtime/underboss/`). The submodule is replaced as a whole, never patched.
7. Never fill `--implemented` yourself: it needs a list of Spec ids the owner gave you.
8. Run the verification of the flow. A failed check is an error: stop and report it, do not work around it.
9. Commit the consumer changes as described in the flow. Do not push unless asked.
10. Report what was done and every manual action that remains.

```bash
bash <<'DETECT'
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "STOP not a git repository"; exit 0; }
cd "$ROOT" || exit 0
NEW=docs/.control
OLD=docs/.runtime/underboss
ver() { awk -v k="$2" '$0 ~ "^"k":" {f=1; next} f && /^[^ ]/ {exit} f && /^  version:/ {gsub(/"/, "", $2); print $2; exit}' "$1"; }
if [ -e "$NEW" ] && [ -e docs/.runtime ]; then
  echo "STOP both docs/.control and docs/.runtime exist"
elif [ -f "$NEW/core/registry.yaml" ]; then
  V=$(ver "$NEW/core/registry.yaml" control)
  case "$V" in
    3.*) echo "UPDATE $V" ;;
    *) echo "STOP docs/.control has an unexpected version '${V:-none}'" ;;
  esac
elif [ -e "$NEW" ]; then
  echo "STOP docs/.control exists without core/registry.yaml"
elif [ -d "$OLD" ]; then
  if [ -f "$OLD/core/registry.yaml" ]; then
    echo "MIGRATE v2 (control layer already v3 code: run the migration)"
  elif [ -f "$OLD/runtime/registry.yaml" ]; then
    echo "MIGRATE v2 $(ver "$OLD/runtime/registry.yaml" runtime) (update the submodule to v3 first)"
  else
    echo "STOP $OLD has no registry"
  fi
elif [ -e .context/runtime ]; then
  echo "STOP unsupported layout .context/runtime (v1.x): only v2 -> v3 is migrated"
else
  echo "INSTALL"
fi
DETECT
```

| Output | Meaning | Do |
|---|---|---|
| `INSTALL` | no Underboss | flow A |
| `UPDATE 3.x.y` | v3 installed | flow B |
| `MIGRATE v2 …` | v2 installed (mounted at `docs/.runtime/underboss`) | flow C |
| `STOP …` | broken, ambiguous or unsupported | inspect, report to the user, change nothing |

Other stop conditions:

| State | Action |
|---|---|
| Dirty tracked tree before changing the submodule or migrating | stop |
| Migration invoked on a project that is already v3 | the script refuses (`exit 1`, `already v3`); this is intended, change nothing |
| The migration script refuses (`exit 1`, `refused, nothing was changed`) | read the reasons, fix the cause (usually a dirty tree or a backlog line that is not an item), run again |
| The migration fails while applying (`failed and rolled back`) | the project is as it was; report the error text |

<!-- migration-source:end -->

## A. Install v3

Use this when the detection printed `INSTALL`. (`bash <(curl -s https://raw.githubusercontent.com/akturt/underboss/master/bootstrap/install.sh)` performs steps 1 and 2 for a fresh install; the steps below are the same thing spelled out.)

1. **Mount the submodule** and pin the branch:

   ```bash
   git submodule add https://github.com/akturt/underboss.git docs/.control
   git config -f .gitmodules submodule."docs/.control".branch master
   git add .gitmodules docs/.control
   git commit -m "chore: add Underboss via submodule"
   ```

   To pin a revision instead of the branch tip: `git -C docs/.control checkout <sha>`, then `git add docs/.control` and commit.

2. **Run bootstrap** against the project (the target is explicit):

   ```bash
   bash docs/.control/bootstrap/bootstrap.sh --target "$(pwd)"
   ```

   On Windows without bash: `powershell -File docs\.control\bootstrap\bootstrap.ps1 -ProjectPath <repository root>`.

3. **Set the project identity.** Edit `.context/project.yml`: `name`, and `repository.name`, which must equal the repository name of the `origin` remote (`https://…/<name>.git`), because the Control Plane checks the checkout against it.

4. **Optional.** If `docs/` already holds Markdown that has no Schema v1 frontmatter, bring it to Schema v1 first with [`playbook/migrate-legacy.md`](playbook/migrate-legacy.md). That is the onboarding of foreign documentation; it is not the Underboss update and not the v2 migration. For `entity_refs` in Specs, create `docs/architecture/entity-catalog.md` from `docs/.control/bootstrap/templates/entity-catalog.md`.

5. **Verify** (below) and commit:

   ```bash
   git add -A docs .context .github CLAUDE.md
   git status
   git commit -m "chore: install Underboss"
   ```

What bootstrap created: the `docs/` directories listed in the Registry, `.context/{project.yml,boundaries.yml,agent-entry.md}`, `docs/architecture/{README.md,invariants.md}`, the Underboss section of `CLAUDE.md`, `.github/workflows/docs-validate.yml`.

## B. Update v3

Use this when the detection printed `UPDATE 3.x.y`.

1. **Clean tree.** `git status --porcelain --untracked-files=no` must be empty. If not, stop (commit or stash the user's work first, or ask).
2. **Update the submodule** to the branch tip, or to a revision the user named:

   ```bash
   git submodule update --init --remote docs/.control
   # or, for a given revision:
   # git -C docs/.control fetch origin && git -C docs/.control checkout <sha>
   ```

   Read the new version: `grep -A3 '^control:' docs/.control/core/registry.yaml`. If it is not `3.x`, stop: this runbook only updates within v3.
3. **Run bootstrap** again. It is idempotent:

   ```bash
   bash docs/.control/bootstrap/bootstrap.sh --target "$(pwd)"
   ```

4. **Verify** (below).
5. **Review** what changed: `git status` and `git diff`. Then record the new submodule revision and commit:

   ```bash
   git add docs/.control
   git add -A docs .context .github CLAUDE.md   # only what the review accepted
   git commit -m "chore: update Underboss to $(git -C docs/.control rev-parse --short HEAD)"
   ```

What bootstrap does on an update: creates missing directories and missing generated files. What it does **not** do: it does not overwrite any existing file (so existing `project.yml`, `boundaries.yml`, `CLAUDE.md`, the CI workflow stay as they are), it does not touch your documents or `.context/execution/`, and it does not migrate anything; there is no automatic migration and no fallback. If a release changes a generated file and you want the new version, delete that file (only if you never edited it) and run bootstrap again; otherwise merge the change by hand.

Roll back an update: `git -C docs/.control checkout <previous sha>`, rerun the verification, commit the pointer.

Optional automation: Dependabot can open a pull request when the submodule moves. Add `.github/dependabot.yml` with `package-ecosystem: gitsubmodule`, `directory: "/"`, a weekly schedule. A person merges it; flow B is then steps 3–5.

<!-- migration-source:start -->
## C. Migrate v2 → v3

Use this when the detection printed `MIGRATE v2 …`. The migration is **one-time, explicit and separate from bootstrap**. Nothing runs it automatically; bootstrap does not call it and does not detect the old layout.

What it does (the Migration Contract, `core/contracts/product/migration.yaml`): moves the submodule from `docs/.runtime/underboss` to `docs/.control`; moves Specs from `specs/review/` to `specs/drafts/` as `draft`; gives `api` documents the statuses `active | deprecated` and removes their lifecycle directories; rewrites the renamed ids (`runtime-agentic-layer` → `agentic-layer`, `runtime` → `core`, `state-machine` → `installation-state-machine`) in frontmatter; splits the backlog into `active.md` (open items) and `archive.md` (everything else); removes generated files that name the old mount and lets bootstrap regenerate them; moves the Specs you list with `--implemented` to `implemented/`.

Preconditions the script checks itself: a git checkout at the project root; the control layer mounted at `docs/.runtime/underboss` and already v3; `.context/` and `docs/` present; **a clean tracked tree**. Anything else is refused before a single file is written. A failure while applying rolls the project back, so the consumer is either migrated or unchanged.

1. **Clean tree.** `git status --porcelain --untracked-files=no` must be empty.
2. **Update the submodule to v3** (still at the old path) **and commit that pointer**. The script requires a clean tree, and a moved submodule pointer is a change:

   ```bash
   git submodule update --init --remote docs/.runtime/underboss
   test -f docs/.runtime/underboss/core/registry.yaml && grep -q '^control:' docs/.runtime/underboss/core/registry.yaml
   git add docs/.runtime/underboss
   git commit -m "chore: update Underboss to v3 (before the migration)"
   ```

   If the last `grep` fails, the submodule is not v3: stop. If `git submodule update --remote` fetches nothing, check that `.gitmodules` has `branch = master` for that submodule.
3. **Dry run.** Prints the plan and changes nothing:

   ```bash
   node docs/.runtime/underboss/core/migrate/v2-to-v3.mjs --dry-run
   ```

   The project is derived from the script location; to run it from elsewhere add `--project <repository root>`. If a `--implemented` list was given to you, add it here too.
4. **Apply.** Run the same command without `--dry-run`:

   ```bash
   node docs/.runtime/underboss/core/migrate/v2-to-v3.mjs [--implemented spec-id,spec-id]
   ```

   `--implemented` moves Specs from `approved/` to `implemented/` and is for Specs whose work is already delivered. **Pass it only with the ids the owner gave you; never guess.** Without it, approved Specs stay approved, which is safe.

   Expected: `migrated to v3: N steps` and `review the staged changes and commit them`, exit 0. The script has moved the mount to `docs/.control` and run `docs/.control/bootstrap/bootstrap.sh` itself.
5. **Warnings.** Lines starting with `warning:` name **user-owned** files the migration may not change (for example your own notes that still mention `docs/.runtime`). Show them to the user and fix them only if asked. A generated file that still names the old mount is not a warning: it is an error and the migration rolls back.
6. **Verify** (below).
7. **Review and commit.** The script stages its changes; files created by bootstrap are not staged:

   ```bash
   git status
   git diff --cached --stat
   git add -A docs .context .github CLAUDE.md .gitmodules   # only what the review accepted
   git commit -m "chore: migrate Underboss v2 to v3"
   ```

Running the script again on a migrated project ends with `exit 1` and `already v3` and changes nothing. That is intended. The submodule section name in `.gitmodules` may still read `docs/.runtime/underboss`: it is only git's internal name; the `path` is `docs/.control`, which is what counts.

## Verification

Run from the repository root after any flow. Every command must succeed.

```bash
# the control layer
test -f docs/.control/core/registry.yaml && grep -A3 '^control:' docs/.control/core/registry.yaml   # version 3.x
bash docs/.control/documentation/validation/validate-integrity.sh
CONTROL_ROOT="$PWD/docs/.control" TARGET="$PWD" bash -c 'source "$CONTROL_ROOT/core/lib/api.sh"; detect_state'   # installed 3.x.y

# the project
bash docs/.control/documentation/validation/validate-frontmatter.sh
node docs/.control/documentation/validation/validate-lifecycle.mjs docs
node docs/.control/documentation/validation/validate-backlog.mjs docs
node docs/.control/documentation/validation/validate-execution.mjs .
bash docs/.control/core/bin/underboss status

# nothing of v2 left in the project, except user-owned notes the migration reported
git grep -n 'docs/\.runtime' -- . ':!docs/.control' ':!.gitmodules'
```

The last command must print nothing for flows A and B. After flow C it may list only the user-owned files the script warned about. `.gitmodules` is excluded on purpose: its section name may still read `docs/.runtime/underboss`, which is only git's internal name for the submodule (its `path` is `docs/.control`).

| Flow | Also check |
|---|---|
| A | `.context/project.yml` identity is set; `CLAUDE.md` has the Underboss section; the CI workflow exists |
| B | the submodule points to the intended revision; no existing user file was overwritten (`git diff`) |
| C | `docs/.runtime` is gone; `docs/specs/review/` is gone; `docs/backlog/` holds only `active.md` and `archive.md`; `.context/boundaries.yml` has `pristine:` → `docs/.control/` only |

```text
Installation/update complete when:
[ ] the submodule points to the intended v3 revision
[ ] .context is valid (project.yml identity set, boundaries.yml generated)
[ ] docs/.control is valid and the Registry validates (validate-integrity)
[ ] the installation state is "installed 3.x.y"
[ ] frontmatter, lifecycle, backlog and execution validators pass
[ ] underboss status runs
[ ] no docs/.runtime path remains in operational files
[ ] the git diff was reviewed
[ ] the consumer changes are committed
```

<!-- migration-source:end -->

## Using the Control Plane after installation

`bash docs/.control/core/bin/underboss status` shows executions, stale READY and open Escalations; `attention` shows open Escalations only. Execution commands: `execution create | ready | start | verify | complete | cancel | record | resume | rework`, and `escalation list | show | open | resolve`; state-changing commands need `--actor <identity>`. All commands accept `--json` and `--project <path>`. Processes are described in `docs/.control/sops/`; run `node docs/.control/sops/planner.mjs <name>` to print a plan.

## Where things live

- **Product repository** (`https://github.com/akturt/underboss`): `core/` (Registry, contracts, Core SDK, Control Plane, migration), `bootstrap/`, `engine/` (Reality Engine), `documentation/` (templates, schemas, validators), `knowledge/`, `agents/`, `sops/`, `playbook/`.
- **Consumer repository**: only `docs/` and `.context/` plus the Underboss section of `CLAUDE.md` and the CI workflow. The product is mounted read-only at `docs/.control/`.
- Underboss never writes to `docs/.control/`; execution state lives in `.context/execution/` of the consumer.
- Documents are created from `docs/.control/documentation/templates/<type>.md` and follow [`playbook/playbook-v2.md`](playbook/playbook-v2.md).
