#!/bin/bash
# documentation/validation/validate-frontmatter.sh
#
# Validates that every .md file under docs/ has Canonical Schema v1 frontmatter.
# Frontmatter-only checks (no false positives on prose/code blocks).
# Based on schemas/frontmatter.schema.json. Every finding is an error.
#
# Exit codes:
#   0 — all OK
#   1 — at least one error
#
# Usage:
#   ./documentation/validation/validate-frontmatter.sh [docs-root]
#   ROOT=docs ./documentation/validation/validate-frontmatter.sh        # override default docs/ root

set -u

DOCS_ROOT="${1:-${ROOT:-docs}}"
fail=0

if [ ! -d "$DOCS_ROOT" ]; then
  echo "ERROR: docs root '$DOCS_ROOT' not found"
  exit 1
fi

err() {
  echo "ERROR: $1"
  fail=1
}

# extract_frontmatter <file>
# Prints only the YAML block between first and second '---' line. Empty if no FM.
extract_frontmatter() {
  awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f{print}' "$1"
}

# check_file <file>
check_file() {
  local f="$1"
  [ -f "$f" ] || return

  # FM present at all?
  local first
  first=$(awk 'NR==1{print; exit}' "$f")
  if [ "$first" != "---" ]; then
    err "$f: no frontmatter at all"
    return
  fi

  local fm
  fm=$(extract_frontmatter "$f")
  [ -n "$fm" ] || { err "$f: empty frontmatter"; return; }

  # 1. schema: 1 mandatory
  echo "$fm" | grep -qE "^schema:[[:space:]]*1[[:space:]]*$" || err "$f: schema != 1"

  # 2. mandatory base fields
  for field in id type status date owners; do
    echo "$fm" | grep -qE "^${field}:" || err "$f: missing mandatory field '$field'"
  done

  # 3. forbidden fields in frontmatter only
  for pat in "^lifecycle:" "^author:" "^title:" "^created:" "^supersedes_adr:" "^referenced_by:" "^excludes-from-scope:"; do
    if echo "$fm" | grep -qE "$pat"; then
      err "$f: forbidden field '$pat' in frontmatter"
    fi
  done

  local type status
  type=$(echo "$fm" | grep -m1 -E "^type:" | sed -E 's/^type:[[:space:]]*//')
  status=$(echo "$fm" | grep -m1 -E "^status:" | sed -E 's/^status:[[:space:]]*//')

  # 4. runbook must have kind:
  if [ "$type" = "runbook" ]; then
    echo "$fm" | grep -qE "^kind:" || err "$f: type runbook requires 'kind:'"
  fi

  # 5. api has exactly two statuses
  if [ "$type" = "api" ]; then
    case "$status" in
      active|deprecated) ;;
      *) err "$f: api status '$status' must be active or deprecated" ;;
    esac
  fi

  # 6. spec/audit must have non-empty entity_refs
  if [ "$type" = "spec" ] || [ "$type" = "audit" ]; then
    if ! echo "$fm" | grep -qE "^entity_refs:[[:space:]]*\[[^]]+\]"; then
      err "$f: $type requires non-empty entity_refs"
    fi
  fi
}

# Iterate over tracked .md files (or all .md if not in git)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r f; do
    check_file "$f"
  done < <(git ls-files -- "$DOCS_ROOT/**/*.md" "$DOCS_ROOT/*.md" 2>/dev/null || find "$DOCS_ROOT" -name "*.md" -type f)
else
  while IFS= read -r f; do
    check_file "$f"
  done < <(find "$DOCS_ROOT" -name "*.md" -type f)
fi

if [ "$fail" -ne 0 ]; then
  echo "::error::docs-validate failed (see errors above)"
  exit 1
fi

echo "docs-validate: OK"
exit 0
