---
schema: 1
id: guide-move-from-underboss
type: guide
kind: onboarding
status: active
date: 2026-10-05
owners: [krok-team]

entity_refs: [agentic-layer, schema-v1, canonical-frontmatter]
touches: [docs, .context, .gitmodules, CLAUDE.md, .github/workflows]
docs: [INSTALL.md]
refs: []
depends_on: []
tags: [guide, rename, consumer, onboarding]
priority: P1
---

# Moving a consumer from Underboss to Krok

Krok is the new name of Underboss. There is **no migration and no compatibility layer**: Krok does not read, detect or convert an Underboss installation. A consumer either stays on its old pinned version or moves by following this guide. The canonical install and update procedure is [`INSTALL.md`](../INSTALL.md); this guide only lists what is different for a consumer that already has the old name.

Everything is run from the repository root. Work on a branch and start from a clean tracked tree: `git status --porcelain --untracked-files=no` must print nothing.

## 0. Which case are you in?

```bash
ls -d docs/.control docs/.runtime/underboss .context/runtime 2>/dev/null
```

| You have | Case |
|---|---|
| `docs/.control` | [1. v3 (control layer at `docs/.control`)](#1-v3-control-layer-at-docscontrol) |
| `docs/.runtime/underboss` | [2. v2](#2-v2-docsruntimeunderboss) |
| `.context/runtime` | v1: treat it as case 2 |

If you do not want to move now, do nothing: the submodule is pinned to a commit, and the old repository address redirects to the new one. You get no updates and no support from Krok.

## 1. v3, control layer at `docs/.control`

Follow flow B of `INSTALL.md`, plus the following.

1. **Submodule address.** The old address redirects, but change it:

   ```bash
   git submodule set-url docs/.control https://github.com/akturt/krok.git
   git submodule update --init --remote docs/.control
   ```

2. **Generated files.** Bootstrap never overwrites an existing file. Delete the ones you did not edit and bootstrap will create them again with the new name; merge by hand the ones you edited:
   - `.context/agent-entry.md`
   - `.context/boundaries.yml`
   - `.github/workflows/docs-validate.yml`
3. **The `## Underboss` section of `CLAUDE.md` and `AGENTS.md`.** Bootstrap looks for `## Krok` and adds a second section; it does not remove the old one. Delete the old section before running bootstrap.
4. **Run bootstrap and the verification** of `INSTALL.md`:

   ```bash
   bash docs/.control/bootstrap/bootstrap.sh --target "$(pwd)"
   ```

5. **CLI.** Replace `docs/.control/core/bin/underboss` with `docs/.control/core/bin/krok` in your scripts, CI and agent instructions. Commands and flags are unchanged.
6. **Names in your own files.** `name` in `.context/project.yml` and `owners: [underboss-team]` in your documents may stay; the validators do not require a change.

## 2. v2, `docs/.runtime/underboss`

Install Krok again and bring the documents to the v3 model by hand. The content of `docs/` stays.

1. **Remove the old installation:**

   ```bash
   git submodule deinit -f docs/.runtime/underboss
   git rm -f docs/.runtime/underboss
   rm -rf .git/modules/docs/.runtime/underboss
   ```

2. **Remove the generated files and the old section** of `CLAUDE.md` and `AGENTS.md`: `.context/agent-entry.md`, `.context/boundaries.yml`, `.github/workflows/docs-validate.yml`, and the `## Underboss` section. If `.context/project.yml` was never filled in, remove it too.
3. **Install Krok** with flow A of `INSTALL.md`: submodule at `docs/.control`, bootstrap, and `repository.name` in `.context/project.yml` equal to the name of the `origin` repository.
4. **Bring the documents to the v3 model.** The validators of the verification list what is left. The known differences:
   - Specs in `docs/specs/review/` move to `docs/specs/drafts/` with `status: draft`. Approval stays a human act.
   - `api` documents take the statuses `active` or `deprecated`; the old lifecycle subdirectories of `docs/api/` are removed.
   - Renamed ids in `entity_refs`, `implements`, `depends_on`: `runtime-agentic-layer` → `agentic-layer`, `runtime` → `core`, `state-machine` → `installation-state-machine`.
   - The backlog is split into `docs/backlog/active.md` (open items) and `docs/backlog/archive.md` (everything else).
5. **Verify** with the commands of the Verification section of `INSTALL.md`, review `git diff`, commit.

## Not supported

The one-time script that used to convert v2 to v3 is no longer part of Krok. It remains in the git history of this repository (commit `cd217ff`, `core/migrate/v2-to-v3.mjs`) and is not maintained. If you use it, run it only on a clean tree and review the diff.
