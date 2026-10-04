#!/bin/bash
# bootstrap/generators/claude-md.sh — Generate CLAUDE.md snippet
#
# API: generate TARGET REGISTRY

generate() {
  local target_dir="$1" registry="$2"

  if [ -f "${target_dir}/CLAUDE.md" ]; then
    if grep -q 'docs/\.control/' "${target_dir}/CLAUDE.md"; then
      echo "  → CLAUDE.md already describes Underboss, skipping."
      return
    fi
    # An existing CLAUDE.md without Underboss rules gets the snippet prepended.
    local tmp="${target_dir}/CLAUDE.md.tmp"
    {
      cat << 'SNIPPET'
## Underboss

Underboss is connected as a Git Submodule: docs/.control/

Before any change to docs/:
1. Read docs/.control/playbook/playbook-v2.md (the protocol)
2. Use docs/.control/documentation/templates/ - do not copy templates into the project
3. Run docs/.control/documentation/validation/validate-frontmatter.sh before commit
4. Execution state is managed with docs/.control/core/bin/underboss (status, attention, execution, escalation)
5. To install, update or migrate Underboss follow docs/.control/INSTALL.md (the canonical runbook)

SNIPPET
      cat "${target_dir}/CLAUDE.md"
    } > "$tmp"
    mv "$tmp" "${target_dir}/CLAUDE.md"
    echo "  → Underboss snippet prepended to CLAUDE.md."
    return
  fi

  cat > "${target_dir}/CLAUDE.md" << HEREDOC
# CLAUDE.md — AI Agent Quickstart

## Project Identity

- Name: $(basename "$target_dir")
- Domain: unknown
- Stack: unknown
- Underboss: v$(registry_version)

## Documentation Layout

\`\`\`
docs/
  architecture/     # topology, domain model, invariants
  adr/              # Architecture Decision Records
  specs/            # specifications (draft → approved → implemented)
  audits/           # audit reports, reality checks
  backlog/          # backlog: active.md (open work), archive.md (everything else)
  api/              # API documentation
  .control/         # Underboss git submodule (do not edit directly)
    core/           # registry, installation state machine, contracts, Core SDK
    documentation/  # templates, validation, schemas
    agents/         # agent roles
    knowledge/      # knowledge base
    sops/           # standard operating procedures
    bootstrap/      # bootstrap scripts
    engine/         # reality engine
\`\`\`

## Before Writing Documentation

1. Read \`.context/boundaries.yml\` — know what you can touch
2. Read \`docs/.control/playbook/playbook-v2.md\` — understand the protocol
3. Check \`docs/.control/core/registry.yaml\` for available components

## Key Files

- \`.context/project.yml\` — project metadata
- \`.context/boundaries.yml\` — boundary rules
- \`.context/agent-entry.md\` — agent entry protocol
- \`docs/.control/core/installation-state-machine.yaml\` — valid states and transitions
- \`docs/.control/core/bin/underboss\` — Control Plane CLI: status, attention, execution, escalation
- \`docs/.control/INSTALL.md\` — canonical runbook: install, update, migrate
HEREDOC
  echo "  → CLAUDE.md snippet created."
}
