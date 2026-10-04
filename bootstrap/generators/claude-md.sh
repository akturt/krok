#!/bin/bash
# bootstrap/generators/claude-md.sh — Generate CLAUDE.md snippet
#
# API: generate TARGET REGISTRY

generate() {
  local target_dir="$1" registry="$2"

  if [ -f "${target_dir}/CLAUDE.md" ]; then
    echo "  → CLAUDE.md already exists, skipping."
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
HEREDOC
  echo "  → CLAUDE.md snippet created."
}
