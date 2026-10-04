#!/bin/bash
# engine/reality-engine/reporters/reality-report.sh
#
# Real reality report: aggregates collectors (architecture inventory,
# dependency graph, entity inventory) and analyzers (adr / documentation /
# spec drift), and compares actual structure against the Registry SSOT.
#
# Usage:
#   bash engine/reality-engine/reporters/reality-report.sh [project-root]
#
# Output: reality-report.md (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

ENGINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COLLECT="$ENGINE_ROOT/collectors"
ANALYZE="$ENGINE_ROOT/analyzers"

# Core SDK (Registry SSOT for expected structure)
CONTROL_ROOT="$(cd "$ENGINE_ROOT/../.." && pwd)"
if [ -f "${CONTROL_ROOT}/core/lib/api.sh" ]; then
  # shellcheck disable=SC1090
  source "${CONTROL_ROOT}/core/lib/api.sh"
fi

# --- JSON helpers (python3 preferred) ---
jget() {
  local json="$1" key="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$json" "$key" <<'PY'
import json,sys
p,key=sys.argv[1],sys.argv[2]
try: d=json.load(open(p))
except Exception: print(""); sys.exit(0)
cur=d
for part in key.split('.'):
    if isinstance(cur,dict) and part in cur: cur=cur[part]
    else: cur=""; break
print(cur if isinstance(cur,(str,int,float)) else json.dumps(cur))
PY
  else
    grep -oE "\"$key\"[[:space:]]*:[[:space:]]*\"?[^\",}]*" "$json" 2>/dev/null | head -1 | sed -E "s/.*:[[:space:]]*\"?//; s/\"?$//"
  fi
}
jarr() {
  local json="$1" arr="$2" sub="$3"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$json" "$arr" "$sub" <<'PY'
import json,sys
p,arr,sub=sys.argv[1],sys.argv[2],sys.argv[3]
try: d=json.load(open(p))
except Exception: sys.exit(0)
for item in d.get(arr,[]):
    if isinstance(item,dict) and sub in item: print(item[sub])
    elif isinstance(item,str): print(item)
PY
  fi
}
jdumparr() {
  local json="$1" arr="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$json" "$arr" <<'PY'
import json,sys
p,arr=sys.argv[1],sys.argv[2]
try: d=json.load(open(p))
except Exception: sys.exit(0)
for it in d.get(arr,[]):
    if isinstance(it,dict):
        t=it.get("type","?")
        extra={k:v for k,v in it.items() if k!="type"}
        print(f"  - {t}: {extra}")
    else:
        print(f"  - {it}")
PY
  fi
}

# --- run collectors ---
INV="$(bash "$COLLECT/architecture-inventory.sh" "$PROJECT_ROOT")"
DEP="$(bash "$COLLECT/dependency-graph.sh" "$PROJECT_ROOT")"
ENT="$(bash "$COLLECT/entity-inventory.sh" "$PROJECT_ROOT")"
INV_F=$(mktemp); DEP_F=$(mktemp); ENT_F=$(mktemp)
printf '%s\n' "$INV" > "$INV_F"
printf '%s\n' "$DEP" > "$DEP_F"
printf '%s\n' "$ENT" > "$ENT_F"

# --- run analyzers ---
ADR="$(bash "$ANALYZE/adr-drift.sh" "$PROJECT_ROOT" "$INV_F")"
DOC="$(bash "$ANALYZE/documentation-drift.sh" "$PROJECT_ROOT" "$INV_F")"
SPEC="$(bash "$ANALYZE/spec-drift.sh" "$PROJECT_ROOT" "$INV_F")"
ADR_F=$(mktemp); DOC_F=$(mktemp); SPEC_F=$(mktemp)
printf '%s\n' "$ADR" > "$ADR_F"
printf '%s\n' "$DOC" > "$DOC_F"
printf '%s\n' "$SPEC" > "$SPEC_F"

# --- extract summary values ---
name=$(jget "$INV_F" project_name)
backend=$(jget "$INV_F" "stack.backend")
database=$(jget "$INV_F" "stack.database")
infra=$(jget "$INV_F" "stack.infrastructure")
total=$(jget "$INV_F" total_files)
ts=$(jget "$INV_F" timestamp)
nodes=$(jarr "$DEP_F" nodes id | wc -l | tr -d ' ')
edges=$(jarr "$DEP_F" edges from | wc -l | tr -d ' ')
entity_count=$(jget "$ENT_F" entity_count)
unresolved=$(jget "$ENT_F" unresolved_count)
adr_drift=$(jdumparr "$ADR_F" adr_drift_items | wc -l | tr -d ' ')
doc_drift=$(jdumparr "$DOC_F" drift_items | wc -l | tr -d ' ')
spec_drift=$(jdumparr "$SPEC_F" spec_drift_items | wc -l | tr -d ' ')

# --- actual top-level directories ---
mapfile -t actual_top < <(jarr "$INV_F" directories path | while IFS= read -r p; do
  [[ "$p" =~ ^/[^/]+$ ]] && echo "${p#/}"
done | sort -u)

# --- expected top-level (Registry SSOT) ---
expected_top=()
if declare -f registry_list_directories >/dev/null 2>&1; then
  for grp in docs context; do
    if registry_list_directories "$grp" | grep -q .; then
      if [ "$grp" = "context" ]; then expected_top+=(".context"); else expected_top+=("$grp"); fi
    fi
  done
fi

missing=(); extra=()
for e in "${expected_top[@]:-}"; do
  [ -z "$e" ] && continue
  printf '%s\n' "${actual_top[@]}" | grep -qx "$e" || missing+=("$e")
done
for a in "${actual_top[@]:-}"; do
  [ -z "$a" ] && continue
  printf '%s\n' "${expected_top[@]}" | grep -qx "$a" || extra+=("$a")
done

# --- architecture catalog check (INFO only, never an error) ---
arch_dir="$PROJECT_ROOT/docs/architecture"
arch_readme="missing";  [ -f "$arch_dir/README.md" ] && arch_readme="present"
arch_entity="missing";  [ -f "$arch_dir/entity-catalog.md" ] && arch_entity="present"
arch_inv="missing";     [ -f "$arch_dir/invariants.md" ] && arch_inv="present"

# --- emit report ---
cat <<EOF
# Reality Report — ${name}

**Generated:** ${ts}
**Project:** ${PROJECT_ROOT}
**Stack:** ${backend} / ${database} / ${infra}
**Total files:** ${total}

## Directory Inventory (top level)

EOF
for d in "${actual_top[@]:-}"; do
  [ -z "$d" ] && continue
  echo "- \`$d\`"
done

total_drift=$(( adr_drift + doc_drift + spec_drift ))
struct_status="OK"; [ ${#missing[@]} -gt 0 ] && struct_status="DRIFT"
drift_status="OK"; [ "$total_drift" -gt 0 ] && drift_status="DRIFT"

cat <<EOF

## Dependency Graph

- Nodes (docs): ${nodes}
- Edges (references): ${edges}

## Entity Inventory

- Referenced entities: ${entity_count}
- Unresolved: ${unresolved}

## Architecture Catalog

- README: ${arch_readme} $( [ "$arch_readme" = "present" ] && echo "✓" || echo "⚠ missing" )
- Entity Catalog: ${arch_entity} $( [ "$arch_entity" = "present" ] && echo "✓" || echo "⚠ missing" )
- Invariants: ${arch_inv} $( [ "$arch_inv" = "present" ] && echo "✓" || echo "⚠ missing" )

## Structure Drift (vs Registry SSOT)

- Expected top-level: $(IFS=', '; echo "${expected_top[*]:-none}")
- Status: **${struct_status}**
EOF
[ ${#missing[@]} -gt 0 ] && { echo "- Missing (expected but absent):"; for m in "${missing[@]}"; do echo "  - \`$m\`"; done; }
[ ${#extra[@]} -gt 0 ] && { echo "- Extra (present, not in SSOT — informational):"; for x in "${extra[@]}"; do echo "  - \`$x\`"; done; }

cat <<EOF

## Drift Analysis

- ADR drift items: ${adr_drift}
- Documentation drift items: ${doc_drift}
- Spec drift items: ${spec_drift}
- **Status: ${drift_status}**
EOF
[ "$adr_drift" -gt 0 ] && { echo; echo "### ADR drift"; jdumparr "$ADR_F" adr_drift_items; }
[ "$doc_drift" -gt 0 ] && { echo; echo "### Documentation drift"; jdumparr "$DOC_F" drift_items; }
[ "$spec_drift" -gt 0 ] && { echo; echo "### Spec drift"; jdumparr "$SPEC_F" spec_drift_items; }

cat <<EOF

## Status

Reality Engine: full pipeline executed (inventory → graph → entities → drift
analysis). Review the drift items above for architecture breakage.
EOF

rm -f "$INV_F" "$DEP_F" "$ENT_F" "$ADR_F" "$DOC_F" "$SPEC_F"
