#!/bin/bash
# engine/reality-engine/collectors/dependency-graph.sh
#
# Real dependency graph of a project's documentation.
# Edges are derived from frontmatter (entity_refs, depends_on) and
# markdown cross-links between .md files.
#
# Usage:
#   bash engine/reality-engine/collectors/dependency-graph.sh [project-root]
#
# Output: dependency-graph.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Extract a YAML list field from a file's frontmatter.
# Handles both block form (field:\n  - x) and inline form (field: [x, y]).
collect_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    NR==1 && $0!="---" {exit}
    $0=="---" { if (fm==0) { fm=1; next } else { exit } }
    fm==1 {
      if ($0 ~ "^" f ":") {
        if ($0 ~ /\[.*\]/) {
          line=$0; sub(/^[^[]*\[/, "", line); sub(/\].*/, "", line)
          n=split(line, parts, ",")
          for (i=1; i<=n; i++) { v=parts[i]; gsub(/^[ "\047]+/, "", v); gsub(/[ "\047]+$/, "", v); if (v!="") print v }
          infm=0
        } else { infm=1 }
        next
      }
      if (infm==1) {
        if ($0 ~ /^  - /) { sub(/^  - /,""); gsub(/^["\047]|["\047]$/,""); print }
        else if ($0 ~ /^[^ ]/ && $0 !~ /^  /) { infm=0 }
      }
    }
  ' "$file"
}

nodes_json=""
edges_json=""
declare -A seen_node
first_n=1
first_e=1

emit_node() {
  local id="$1" type="$2"
  if [ -z "${seen_node[$id]:-}" ]; then
    seen_node[$id]=1
    local entry; entry=$(printf '    {"id": "%s", "type": "%s"}' "$id" "$type")
    if [ "$first_n" -eq 1 ]; then first_n=0; else entry=",$entry"; fi
    nodes_json="$nodes_json$entry"
  fi
}

emit_edge() {
  local from="$1" to="$2" etype="$3"
  local entry; entry=$(printf '    {"from": "%s", "to": "%s", "type": "%s"}' "$from" "$to" "$etype")
  if [ "$first_e" -eq 1 ]; then first_e=0; else entry=",$entry"; fi
  edges_json="$edges_json$entry"
  emit_node "$from" "doc"
  emit_node "$to" "doc"
}

# Iterate all markdown docs (exclude VCS, deps and the Krok mount)
while IFS= read -r f; do
  rel="${f#$PROJECT_ROOT/}"
  emit_node "$rel" "doc"

  # Frontmatter entity_refs / depends_on
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    emit_edge "$rel" "$ref" "entity_ref"
  done < <(collect_field "$f" "entity_refs")
  while IFS= read -r dep; do
    [ -z "$dep" ] && continue
    emit_edge "$rel" "$dep" "depends_on"
  done < <(collect_field "$f" "depends_on")

  # Markdown links to other .md files
  fdir="$(dirname "$f")"
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    # Resolve relative link to a real file under project root
    target="$fdir/$link"
    if [ -f "$target" ]; then
      trel="${target#$PROJECT_ROOT/}"
      emit_edge "$rel" "$trel" "link"
    fi
  done < <(grep -oE '\]\(([^)]+\.md)[^)]*\)' "$f" 2>/dev/null | sed -E 's/\]\(|\)//g; s/#.*$//')
done < <(find "$PROJECT_ROOT" -type f -name "*.md" \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" | sort)

cat <<EOF
{
  "timestamp": "$TS",
  "project_root": "$PROJECT_ROOT",
  "nodes": [
$nodes_json
  ],
  "edges": [
$edges_json
  ],
  "status": "ok"
}
EOF
