#!/bin/bash
# engine/reality-engine/collectors/module-inventory.sh
#
# Inventories modules and their dependencies.
# Scans for imports, includes, and cross-module references.
#
# Usage:
#   bash engine/reality-engine/collectors/module-inventory.sh [project-root]
#
# Output: module-inventory.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "ERROR: project root '$PROJECT_ROOT' not found" >&2
  exit 1
fi

echo "{"
echo '  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
echo '  "project_root": "'"$PROJECT_ROOT"'",'

# Count modules by directory (depth 1)
echo '  "modules": ['
first=true
for dir in "$PROJECT_ROOT"/*/; do
  [ -d "$dir" ] || continue
  dirname=$(basename "$dir")
  [ "$dirname" = ".git" ] || [ "$dirname" = "node_modules" ] || [ "$dirname" = ".control" ] && continue
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  file_count=$(find "$dir" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | wc -l)
  printf '    {"name": "%s", "files": %d}' "$dirname" "$file_count"
done
echo ""
echo "  ],"

echo '  "status": "stub"'
echo "}"
