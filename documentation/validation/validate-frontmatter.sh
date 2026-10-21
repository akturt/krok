#!/bin/bash
# documentation/validation/validate-frontmatter.sh
#
# Validates that every .md file under docs/ has Canonical Schema v1 frontmatter.
# The checks live in validate-frontmatter.mjs (one process for all files; a shell
# version spawned a dozen processes per document, minutes on Windows).
#
# Exit codes:
#   0 — all OK
#   1 — at least one error
#
# Usage:
#   ./documentation/validation/validate-frontmatter.sh [docs-root] [--changed]
#   ROOT=docs ./documentation/validation/validate-frontmatter.sh        # override default docs/ root
#   --changed (or KROK_CHANGED=1) checks only files that differ from HEAD; CI runs without it.

exec node "$(dirname "$0")/validate-frontmatter.mjs" "$@"
