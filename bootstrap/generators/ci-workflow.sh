#!/bin/bash
# bootstrap/generators/ci-workflow.sh — Generate .github/workflows/docs-validate.yml
#
# API: generate TARGET REGISTRY

generate() {
  local target_dir="$1" registry="$2"

  local workflow_dir="${target_dir}/.github/workflows"
  mkdir -p "$workflow_dir"

  if [ -f "${workflow_dir}/docs-validate.yml" ]; then
    echo "  → .github/workflows/docs-validate.yml already exists, skipping."
    return
  fi

  cat > "${workflow_dir}/docs-validate.yml" << 'HEREDOC'
---
name: Documentation Validation

on:
  push:
    paths:
      - 'docs/**'
      - 'documentation/**'
      - 'agents/**'
      - 'knowledge/**'
      - 'sops/**'
      - 'bootstrap/**'
      - 'core/**'
      - 'engine/**'
  pull_request:
    paths:
      - 'docs/**'
      - 'documentation/**'
      - 'agents/**'
      - 'knowledge/**'
      - 'sops/**'
      - 'bootstrap/**'
      - 'core/**'
      - 'engine/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: true

      - name: Validate frontmatter
        run: bash docs/.control/documentation/validation/validate-frontmatter.sh

      - name: Validate lifecycle
        run: node docs/.control/documentation/validation/validate-lifecycle.mjs docs

      - name: Validate backlog
        run: node docs/.control/documentation/validation/validate-backlog.mjs docs

      - name: Validate integrity
        run: bash docs/.control/documentation/validation/validate-integrity.sh
HEREDOC
  echo "  → .github/workflows/docs-validate.yml created."
}
