---
schema: 1
id: install-remote-prompt
type: guide
kind: onboarding
status: active
date: 2026-07-08
owners: [underboss-team]

entity_refs: [schema-v1, canonical-frontmatter]
touches: [docs, .context, .gitmodules, CLAUDE.md, .github/workflows]
docs: [../INSTALL.md, playbook-v2.md, migrate-legacy.md]
refs: []
depends_on: []
tags: [install, remote, agent-prompt, ubuntu]
priority: P0
---

# Universal prompt for installing underboss as a Git Submodule on a remote host

> **Self-contained prompt** for an AI agent on a Linux server (Ubuntu) to connect the Underboss into an existing project repository. Run this prompt as-is.

---

## Agent role

You are a DevOps agent with access to the project's git repository on a remote Linux server. Your task is to connect the Underboss `underboss` as a Git Submodule and prepare the project structure for working with Documentation Schema v1.

Report at every checkpoint, and do not proceed to the next step without confirmation (if the specific step requires it). Copy bash commands verbatim, do not "rephrase" them.

## Preconditions

- The server has `git >= 2.20` and `node >= 18` installed (for `engine/scripts/migrate-legacy.mjs` and `sops/planner.mjs`).
- You have SSH access to the project repository (via `git@github.com:akturt/<project>.git` or equivalent) or an HTTPS PAT key.
- The working directory is the root of the project clone.

## Project variables

| Variable | Example | Replace with |
|---|---|---|
| `PROJECT_NAME` | `kordon` | Consumer project name (slug, lowercase) |
| `PROJECT_REPO_URL` | `git@github.com:akturt/kordon.git` | SSH or HTTPS URL of the repository |
| `PROJECT_REPOS_REMOTE` | `origin` | Standard remote name (usually `origin`) |
| `PROJECT_BRANCH` | `main` or `master` | Working branch on which we do the integration |
| `AI_PLATFORM` | `opencode` or `claude-code` | What is installed on the server (if both — `opencode` for Linux) |
| `TEAM_NAME` | `underboss-team` | Who will be the owner of documents in the frontmatter |

## Context URL (use for instructions inside SOPs and prompts)

Underboss submodule is mounted at `docs/.control/`. All further consumer-side paths are relative to it.

---

## Step 1 — Clone the project (if not yet cloned on the server)

```bash
cd ~                                          # or /opt / /srv — where the project should live
git clone <PROJECT_REPO_URL> <PROJECT_NAME>
cd <PROJECT_NAME>
git checkout <PROJECT_BRANCH>
git status                                     # confirm the branch is clean, no uncommitted
```

**Checkpoint 1:** report:
- path to the clone
- current branch
- presence of `docs/`, `.context/`, `CLAUDE.md`, `.github/workflows/` via `ls -la`

---

## Step 2 — Check brownfield vs greenfield

The installation system differs depending on whether `docs/` with `.md` already exists:

```bash
ls docs/ 2>/dev/null && echo "DOCS_EXISTS" || echo "NO_DOCS"
find docs/ -name "*.md" 2>/dev/null | wc -l
```

**Rule:**
- `NO_DOCS` or `0 .md files` → **Greenfield path** → go to Step 3.
- There are `.md` files in `docs/` → **Brownfield path** → go to Step 4.

Do not proceed further without operator confirmation if the `.md` count > 30 — there, most likely, is legacy documentation; migration is needed.

---

## Step 3 — Greenfield path: attach the submodule

Only if in Step 2 — `NO_DOCS` (no existing documentation).

```bash
mkdir -p docs/.control
git submodule add https://github.com/akturt/underboss.git docs/.control
git config -f .gitmodules submodule."docs/.control".branch master
git submodule update --init --recursive
ls -la docs/.control/        # should show Underboss contents
```

Bootstrap will create the skeleton + CLAUDE.md snippet + workflow:

```bash
bash docs/.control/bootstrap/bootstrap.sh
```
**What should appear:**

- `docs/{architecture,adr,specs:{drafts,approved,implemented,superseded},audits,backlog,api}/` — the 5-layer structure.
- `.context/{project.yml,boundaries.yml,agent-entry.md}` — stubs.
- `CLAUDE.md` — a 6-line snippet about the Underboss (appended to existing or created).
- `.github/workflows/docs-validate.yml` — the CI guard.

Proceed to Step 5.

---

## Step 4 — Brownfield path: attach the submodule without overwriting

Only if in Step 2 — an existing `docs/` with `.md`.

### 4a — Attach the submodule

```bash
mkdir -p docs/.control
git submodule add https://github.com/akturt/underboss.git docs/.control
git config -f .gitmodules submodule."docs/.control".branch master
git submodule update --init --recursive
```

### 4b — Generate only the .context/ stubs (DO NOT touch the existing docs/)

Bootstrap is idempotent: it does not overwrite existing files. But it is safer to explicitly copy the stubs separately, and then — if needed — edit them.

```bash
# Creating .context/ without calling bootstrap (to avoid touching existing .github/workflows/docs-validate.yml)
mkdir -p .context

# Creating stubs, not overwriting existing ones
[ -f .context/project.yml ] || cat > .context/project.yml << 'YML'
project:
  name: <PROJECT_NAME>
  description: "TODO: 1-sentence project description"
  domain: example.com
  maintainer: <TEAM_NAME>
  repository: <PROJECT_REPO_URL>

stack:
  backend: []
  database: []
  infrastructure: []

directories:
  key: {}
YML

[ -f .context/boundaries.yml ] || cat > .context/boundaries.yml << 'YML'
boundaries:
  pristine:
    - path: docs/.control/
      reason: "submodule, NEVER edit in-place"
  editable:
    - path: docs/
      reason: "documentation"
  generated: []
  secret: []
YML

[ -f .context/agent-entry.md ] || cp docs/.control/bootstrap/.context-agent-entry-template 2>/dev/null || cat > .context/agent-entry.md << 'MD'
# Agent Entry Protocol

Read in order:
1. .context/project.yml - what project this is
2. .context/boundaries.yml - what is editable / pristine / secret
3. docs/architecture/README.md - topology, invariants (create if missing)
4. CLAUDE.md - rules

Before creating any .md in docs/:
1. Identify `type` (spec|adr|audit|runbook|guide|api|architecture|backlog|prompt)
2. Copy template from Underboss: docs/.control/documentation/templates/<type>.md
3. Fill the 6 mandatory fields: schema, id, type, status, date, owners
4. Never add `lifecycle:` to frontmatter (a spec's position is its directory)
5. Never add legacy fields: author, title, created, referenced_by, supersedes_adr, excludes-from-scope
MD
```

### 4c — Check the legacy frontmatter state (without writing)

```bash
node docs/.control/engine/scripts/migrate-legacy.mjs --dry-run --owner <TEAM_NAME> 2>&1 | head -40
```

Save the output for the operator's report: how many `.md` would be changed, how many have `TODO_ENTITY_REF` (require manual review).

### 4d — Run the migration (only if the operator confirmed)

**Do not run without explicit confirmation.** The migration overwrites all `.md` in `docs/` to canonical Schema v1.

```bash
node docs/.control/engine/scripts/migrate-legacy.mjs --owner <TEAM_NAME>
```

**Exit codes:**
- `0` — migration completed cleanly.
- `1` — there are `TODO_ENTITY_REF` markers. Non-blocking, but requires manual review.
- `2` — `docs/` root not found (something is wrong).

### 4e — Create the CI guard (after the validators pass)

Run bootstrap, which creates `.github/workflows/docs-validate.yml` from the registry generator. Do not push it until Step 9 passes locally: there is no warn-only mode.

**Checkpoint 4:** report:
- how many files migrated
- how many `TODO_ENTITY_REF` markers remain
- that the warn-only CI configuration was created

---

## Step 5 — Fill in project.yml and boundaries.yml for the project

Edit `.context/project.yml` manually or via heredoc, substituting the real project stack:

```bash
cat > .context/project.yml << 'YML'
project:
  name: <PROJECT_NAME>
  description: "<read project README, write 1 sentence>"
  domain: example.com
  maintainer: <TEAM_NAME>
  repository: <PROJECT_REPO_URL>

stack:
  backend: [<read package.json / requirements.txt / go.mod — write languages and frameworks>]
  database: [<read migration configs / docker-compose / .env.example>]
  infrastructure: [<Docker Compose / Kubernetes / Terraform / Ansible>]

directories:
  key:
    src/: "Main source code"
    docs/: "Documentation"
    infra/: "Infrastructure"
YML
```

Expand `.context/boundaries.yml` to match the real project structure:

```bash
# Find directories with code, configs, secrets
ls -la
find . -maxdepth 2 -type d -not -path "./.git*" -not -path "./node_modules*"
```

Fill in `.context/boundaries.yml`:
- `pristine` — what NOT to touch (vendor/, third-party, docs/.control/).
- `editable` — where changes are allowed (src/, docs/, infra/).
- `generated` — what scripts create.
- `secret` — files containing secrets (.env, *.key, *.pem).

---

## Step 6 — CLAUDE.md snippet (for the AI agent)

If `CLAUDE.md` already exists — check for the presence of the "## Underboss" section:

```bash
if [ -f CLAUDE.md ]; then
  grep -q "## Underboss" CLAUDE.md && echo "SNIPPET_EXISTS" || echo "NEED_APPEND"
else
  echo "NEED_CREATE"
fi
```

For `NEED_APPEND` or `NEED_CREATE` — call bootstrap (it is idempotent, will not overwrite) or copy the snippet manually:

```bash
bash docs/.control/bootstrap/bootstrap.sh
```

If the stub files are created — `agent-entry.md` will be overwritten only if it does not already exist (verify idempotency via `bootstrap.sh`).

**Alternative for other AI entry-files:**

For opencode, create a symlink or a copy:
```bash
[ -f AGENTS.md ] || ln -s CLAUDE.md AGENTS.md 2>/dev/null || cp CLAUDE.md AGENTS.md
```

---

## Step 7 — Copy the agent roles for the server platform

Ignore if `<AI_PLATFORM>` is not set — skip this step.

### For `opencode`

```bash
mkdir -p .opencode/agents
cp docs/.control/agents/opencode/*.md .opencode/agents/
ls -la .opencode/agents/
# should show: architecture-reviewer.md, documentation-reviewer.md
```

### For `claude-code`

```bash
mkdir -p .claude/agents
cp docs/.control/agents/claude-code/*.md .claude/agents/
ls -la .claude/agents/
```

### For both platforms at once

Simply copy both sets. The `CLAUDE.md` snippet stays shared — both platforms read it.

---

## Step 8 — Create the first architecture document (optional, per operator instruction)

```bash
PROJECT_NAME_KEBAB=$(echo "<PROJECT_NAME>" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
cp docs/.control/documentation/templates/adr.md docs/adr/001-bootstrap-underboss.md
# Edit frontmatter (id, date, owners) and body (Context about integrating underboss, Decision regarding submodule+branch=master, Consequences)
$EDITOR docs/adr/001-bootstrap-underboss.md 2>/dev/null || true
```

Fill in the body minimally:
- **Context:** "Project <PROJECT_NAME> has no formalized documentation system. Documentation grows chaotically, and onboarding new agents and developers is hard."
- **Decision:** "Adopt underboss as the Underboss, connected as a Git Submodule, pinned to the master branch in .gitmodules."
- **Consequences:** "All .md in docs/ must conform to Canonical Schema v1. The CI guard watches. Development processes follow the declarative SOPs in sops/."
- **Status:** accepted

---

## Step 9 — Run the validator before committing

```bash
bash docs/.control/documentation/validation/validate-frontmatter.sh
node docs/.control/documentation/validation/validate-lifecycle.mjs docs
```

**Expected output:**
```
docs-validate: OK
```

If there are errors (`ERROR: <file>: ...`) — do not commit; report to the operator the list of files and exactly what is violated.

---

## Step 10 — Commit and push

```bash
git add -A
git status --short
git commit -m "chore: add Underboss as git submodule

Stage <PROJECT_NAME> for Canonical Schema v1 documentation:

- Add submodule docs/.control pinned to master branch
- Add .context/ stubs (project.yml, boundaries.yml, agent-entry.md)
- Add .github/workflows/docs-validate.yml calling documentation/validation/validate-frontmatter.sh
- Add CLAUDE.md snippet (6 rules: playbook→templates→schema→validator→migrate→sops)
- <GREENFIELD: 'Bootstrap created docs/ skeleton (5-layer architecture)'>
- <BROWNFIELD: 'Existing docs/ migrated to Schema v1; validators pass'>
- <IF ROLES COPIED: 'Add <AI_PLATFORM> reviewer roles from agents/<platform>/'>
- <IF FIRST ADR: 'Add ADR-001 recording this Underboss adoption decision'>"
git push <PROJECT_REPOS_REMOTE> <PROJECT_BRANCH>
```

---

## Step 11 — Final report to the operator

After the push, provide a summary:

```
## Connecting Underboss to <PROJECT_NAME>

Repository: <PROJECT_REPO_URL>
Branch: <PROJECT_BRANCH>
Path: docs/.control/ (submodule pinned to master)
Mode: GREENFIELD | BROWNFIELD (warn-only period for ~3-7 days)
Commit SHA: <git rev-parse HEAD>
Submodule SHA: <git -C docs/.control rev-parse HEAD>

Files created/changed:
- .gitmodules (new submodule entry, branch=master)
- docs/.control/ (submodule)
- .context/project.yml
- .context/boundaries.yml
- .context/agent-entry.md
- CLAUDE.md (Underboss snippet)
- .github/workflows/docs-validate.yml
- <IF GREENFIELD: 'docs/ skeleton (5-layer architecture)'>
- <IF AI_PLATFORM: '.<platform>/agents/{architecture-reviewer,documentation-reviewer}.md'>
- <IF FIRST ADR: 'docs/adr/001-bootstrap-underboss.md'>

Validator result: docs-validate: OK (or WARN count: <N> if brownfield warn-only)
Next steps for operator:
  1. Review .context/project.yml — replace TODOs with real stack
  2. Review .context/boundaries.yml — classify project files
  3. First SOP run: node docs/.control/sops/planner.mjs --list
  4. <IF BROWNFIELD> outline cleanup: ~<N> docs with TODO_ENTITY_REF need manual entity_refs
  5. <IF BROWNFIELD> push the CI workflow only after the validators pass locally
```

---

## Edge Cases

### Git-version < 2.20

`git submodule add --branch master <url> docs/.control` — supported, but if git is old, manually add `branch = master` to `.gitmodules` after `add`.

### Node.js not installed

Install via `apt-get install -y nodejs` or via nvm (`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash && nvm install --lts`). Without node — `engine/scripts/migrate-legacy.mjs` and `sops/planner.mjs` do not work. The Validator (`validate-frontmatter.sh`) — works (POSIX awk).

### Submodule not included in other contributors' clones

Tell them to use `git clone --recurse-submodules <url>` or `git submodule update --init --recursive` in the existing clone. This is a fix in .gitmodules, not on your side.

### `git submodule update --remote` does not pull master

Check that `.gitmodules` contains:
```
[submodule "docs/.control"]
    path = docs/.control
    url = https://github.com/akturt/underboss.git
    branch = master
```

If the `branch = master` line is missing — add it:
```bash
git config -f .gitmodules submodule."docs/.control".branch master
git add .gitmodules && git commit -m "chore: pin submodule to master branch"
```

### What NOT to do

- ❌ Do not edit files in `docs/.control/` in-place. It is a submodule.
- ❌ Do not run bootstrap twice on a brownfield with an existing `.github/workflows/docs-validate.yml` — bootstrap only creates it if the file is absent.
- ❌ Do not push the CI workflow on a brownfield before the validators pass locally.
- ❌ Do not create `.md` in `docs/` without `cp docs/.control/documentation/templates/<type>.md docs/<type>/...` — canonical frontmatter is hard to write "from memory".

---

## After connecting — how the operator will run the work

The connected consumer project starts using Underboss like this:

```bash
# List of available SOPs
node docs/.control/sops/planner.mjs --list

# Execution plan for new-feature (specifying platform)
node docs/.control/sops/planner.mjs new-feature --platform opencode

# Only what needs to invoke the agents (without manual human steps)
node docs/.control/sops/planner.mjs new-feature --hide-human

# Create a new document from template
cp docs/.control/documentation/templates/adr.md docs/adr/002-<decision>.md

# Run validator before committing
bash docs/.control/documentation/validation/validate-frontmatter.sh
```

Invoking agent roles (for opencode):
```
@architecture-reviewer review PR #123
@documentation-reviewer validate-PR #123
```

Invoking roles in Claude Code:
```
/architecture-reviewer
/documentation-reviewer
```

---

## Final note

If something goes wrong — stop and ask the operator. Do not improvise. It is better to leave something explicitly unfinished than to finish it incorrectly and leave drift behind.