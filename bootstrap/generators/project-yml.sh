#!/bin/bash
# bootstrap/generators/project-yml.sh — Auto-generate .context/project.yml
#
# API: generate TARGET REGISTRY

generate() {
  local target_dir="$1" registry="$2"

  mkdir -p "${target_dir}/.context"

  if [ -s "${target_dir}/.context/project.yml" ]; then
    echo "  → .context/project.yml already exists, skipping."
    return
  fi

  local name
  name=$(basename "$target_dir")

  cat > "${target_dir}/.context/project.yml" << HEREDOC
---
name: ${name}
domain: unknown
stack: unknown
backend: unknown
database: unknown
infrastructure: unknown
maintainer: ${GIT_COMMITTER_NAME:-$(git -C "$target_dir" config user.name 2>/dev/null || echo "unknown")}

repository:
  owner: ${GIT_REPOSITORY_OWNER:-owner}
  name: ${name}
  branch: ${GIT_DEFAULT_BRANCH:-main}

HEREDOC

  echo "  → .context/project.yml created."
}
