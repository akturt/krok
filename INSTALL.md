---
schema: 1
id: install-krok
type: guide
kind: onboarding
status: active
date: 2026-10-04
owners: [krok-team]

entity_refs: [agentic-layer, schema-v1, canonical-frontmatter]
touches: [docs, .context, .gitmodules, CLAUDE.md, .github/workflows]
docs: [playbook/playbook-v2.md, playbook/migrate-legacy.md]
refs: []
depends_on: []
implements: []
supersedes: []
tags: [install, update, submodule, consumer, onboarding, v3]
priority: P0
---

# Installing and updating Krok

This is the **one canonical runbook** for a consumer repository. It covers two cases and tells you which one you are in:

| Case | Flow |
|---|---|
| Krok is not installed | [A. Install v3](#a-install-v3) |
| Krok v3 is installed | [B. Update v3](#b-update-v3) |

Everything is run **from the repository root** of the consumer project. Krok lives in the consumer as a git submodule at `docs/.control/` (v3). Requirements: `git` ≥ 2.20, `node` ≥ 18, `bash` (Git Bash on Windows).

## For an AI coding agent

You can choose the flow without asking the user, if the repository state allows it.

1. Go to the repository root: `cd "$(git rev-parse --show-toplevel)"`.
2. Look at the tree: `git status --porcelain --untracked-files=no`. It must be empty before any flow that changes the submodule. If it is not, stop and tell the user.
3. Run the detection below. It prints exactly one line.
4. Follow the flow that line names, step by step, in order. Do not skip checks.
5. There is no migration. A project that carries an installation of another layout is not updated: tell the user to remove it and install again (flow A). Anything else unexpected (a half-installed state) is a `STOP`.
6. Never edit files inside `docs/.control/`. The submodule is replaced as a whole, never patched.
7. Run the verification of the flow. A failed check is an error: stop and report it, do not work around it.
8. Commit the consumer changes as described in the flow. Do not push unless asked.
9. Report what was done and every manual action that remains.

```bash
bash <<'DETECT'
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "STOP not a git repository"; exit 0; }
cd "$ROOT" || exit 0
NEW=docs/.control
ver() { awk -v k="$2" '$0 ~ "^"k":" {f=1; next} f && /^[^ ]/ {exit} f && /^  version:/ {gsub(/"/, "", $2); print $2; exit}' "$1"; }
if [ -f "$NEW/core/registry.yaml" ]; then
  V=$(ver "$NEW/core/registry.yaml" control)
  case "$V" in
    3.*) echo "UPDATE $V" ;;
    *) echo "STOP docs/.control has an unexpected version '${V:-none}'" ;;
  esac
elif [ -e "$NEW" ]; then
  echo "STOP docs/.control exists without core/registry.yaml"
else
  echo "INSTALL"
fi
DETECT
```

| Output | Meaning | Do |
|---|---|---|
| `INSTALL` | no Krok | flow A |
| `UPDATE 3.x.y` | v3 installed | flow B |
| `STOP …` | broken or ambiguous | inspect, report to the user, change nothing |

Other stop conditions:

| State | Action |
|---|---|
| Dirty tracked tree before changing the submodule | stop |


## A. Install v3

Use this when the detection printed `INSTALL`. (`bash <(curl -s https://raw.githubusercontent.com/akturt/krok/master/bootstrap/install.sh)` performs steps 1 and 2 for a fresh install; the steps below are the same thing spelled out.)

1. **Mount the submodule** and pin the branch:

   ```bash
   git submodule add https://github.com/akturt/krok.git docs/.control
   git config -f .gitmodules submodule."docs/.control".branch master
   git add .gitmodules docs/.control
   git commit -m "chore: add Krok via submodule"
   ```

   To pin a revision instead of the branch tip: `git -C docs/.control checkout <sha>`, then `git add docs/.control` and commit.

2. **Run bootstrap** against the project (the target is explicit):

   ```bash
   bash docs/.control/bootstrap/bootstrap.sh --target "$(pwd)"
   ```

   On Windows without bash: `powershell -File docs\.control\bootstrap\bootstrap.ps1 -ProjectPath <repository root>`.

3. **Set the project identity.** Edit `.context/project.yml`: `name`, and `repository.name`, which must equal the repository name of the `origin` remote (`https://…/<name>.git`), because the Control Plane checks the checkout against it.

4. **Optional.** If `docs/` already holds Markdown that has no Schema v1 frontmatter, bring it to Schema v1 first with [`playbook/migrate-legacy.md`](playbook/migrate-legacy.md). That is the onboarding of foreign documentation, not part of installing Krok. For `entity_refs` in Specs, create `docs/architecture/entity-catalog.md` from `docs/.control/bootstrap/templates/entity-catalog.md`.

5. **Verify** (below) and commit:

   ```bash
   git add -A docs .context .github CLAUDE.md
   git status
   git commit -m "chore: install Krok"
   ```

What bootstrap created: the `docs/` directories listed in the Registry, `.context/{project.yml,boundaries.yml,agent-entry.md}`, `docs/architecture/{README.md,invariants.md}`, the Krok section of `CLAUDE.md`, `.github/workflows/docs-validate.yml`.

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
   git commit -m "chore: update Krok to $(git -C docs/.control rev-parse --short HEAD)"
   ```

What bootstrap does on an update: creates missing directories and missing generated files. What it does **not** do: it does not overwrite any existing file (so existing `project.yml`, `boundaries.yml`, `CLAUDE.md`, the CI workflow stay as they are), it does not touch your documents or `.context/execution/`, and it has no fallback. If a release changes a generated file and you want the new version, delete that file (only if you never edited it) and run bootstrap again; otherwise merge the change by hand.

Roll back an update: `git -C docs/.control checkout <previous sha>`, rerun the verification, commit the pointer.

Optional automation: Dependabot can open a pull request when the submodule moves. Add `.github/dependabot.yml` with `package-ecosystem: gitsubmodule`, `directory: "/"`, a weekly schedule. A person merges it; flow B is then steps 3–5.

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
bash docs/.control/core/bin/krok status
```

| Flow | Also check |
|---|---|
| A | `.context/project.yml` identity is set; `CLAUDE.md` has the Krok section; the CI workflow exists |
| B | the submodule points to the intended revision; no existing user file was overwritten (`git diff`) |

```text
Installation/update complete when:
[ ] the submodule points to the intended v3 revision
[ ] .context is valid (project.yml identity set, boundaries.yml generated)
[ ] docs/.control is valid and the Registry validates (validate-integrity)
[ ] the installation state is "installed 3.x.y"
[ ] frontmatter, lifecycle, backlog and execution validators pass
[ ] krok status runs
[ ] the git diff was reviewed
[ ] the consumer changes are committed
```

## Consumer rollout order

The order in which real projects move to v3. Each line is a step of the flow named in brackets; the commands are those of the flow, unchanged. Choose the list by the detection result.

**Existing v3 consumers** (`UPDATE`, flow B):

```text
1. clean consumer                      [B.1]
2. update submodule to v3 commit       [B.2]
3. run bootstrap/update flow           [B.3]
4. run verification                    [B.4, Verification]
5. review generated changes            [B.5]
6. commit consumer changes             [B.5]
```

**New consumers** (`INSTALL`, flow A):

```text
1. add v3 submodule at docs/.control   [A.1]
2. run bootstrap                       [A.2]
3. fill .context/project.yml           [A.3]
4. run verification                    [A.5, Verification]
5. commit                              [A.5]
```

## Using the Control Plane after installation

`bash docs/.control/core/bin/krok status` shows executions, stale READY and open Escalations; `attention` shows open Escalations only. Execution commands: `execution create | ready | start | verify | complete | cancel | record | resume | rework`, and `escalation list | show | open | resolve`; state-changing commands need `--actor <identity>`. All commands accept `--json` and `--project <path>`. Processes are described in `docs/.control/sops/`; run `node docs/.control/sops/planner.mjs <name>` to print a plan.

## Where things live

- **Product repository** (`https://github.com/akturt/krok`): `core/` (Registry, contracts, Core SDK, Control Plane), `bootstrap/`, `engine/` (Reality Engine), `documentation/` (templates, schemas, validators), `knowledge/`, `agents/`, `sops/`, `playbook/`.
- **Consumer repository**: only `docs/` and `.context/` plus the Krok section of `CLAUDE.md` and the CI workflow. The product is mounted read-only at `docs/.control/`.
- Krok never writes to `docs/.control/`; execution state lives in `.context/execution/` of the consumer.
- Documents are created from `docs/.control/documentation/templates/<type>.md` and follow [`playbook/playbook-v2.md`](playbook/playbook-v2.md).
