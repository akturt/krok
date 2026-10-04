#!/bin/bash
# bootstrap/generators/architecture-readme.sh — Auto-generate docs/architecture/README.md
#
# API: generate TARGET REGISTRY

generate() {
  local target_dir="$1" registry="$2"

  mkdir -p "${target_dir}/docs/architecture"

  if [ -f "${target_dir}/docs/architecture/README.md" ]; then
    echo "  → docs/architecture/README.md already exists, skipping."
    return
  fi

  # Read stack info from core/lib if available
  local stack="" domain="" name="" backend="" database="" infrastructure=""
  name=$(basename "$target_dir")

  cat > "${target_dir}/docs/architecture/README.md" << HEREDOC
---
schema: 1
id: architecture-readme
type: architecture
status: active
date: $(date +%Y-%m-%d)
owners: [project-team]
---

# Architecture Overview

## Project Identity

- Name: ${name}
- Domain: ${domain:-TBD}
- Stack: ${stack:-TBD}

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | ${backend:-TBD} |
| Database | ${database:-TBD} |
| Infrastructure | ${infrastructure:-TBD} |

## Project Layout

\`\`\`
${name}/
  docs/
    architecture/     # topology, domain model, invariants
    adr/              # Architecture Decision Records
    specs/            # specifications (draft → approved → implemented)
    audits/           # audit reports, reality checks
    backlog/          # backlog: active.md (open work), archive.md (everything else)
    api/              # API documentation
  src/                # application source code
  tests/              # tests
  .context/           # agent entry metadata
\`\`\`

## Boundaries

See \`.context/boundaries.yml\` for detailed boundary definitions.

## See Also

- [ADR](../adr/) — Architecture Decision Records
- [Backlog](../backlog/) — active and archive
- [Boundaries](../../.context/boundaries.yml) — Boundary definitions
HEREDOC
  echo "  → docs/architecture/README.md created."
}
