#!/bin/bash
# documentation/validation/validate-integrity.sh
#
# Validates the integrity of Underboss itself as a complete dependency graph.
# Uses Core SDK (core/lib/) for all registry parsing.
#
# Exit codes:
#   0 — all OK
#   1 — at least one error
#
# Usage:
#   ./validation/validate-integrity.sh [root]

set -u

CONTROL_ROOT="${1:-${CONTROL_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}}"
fail=0
checked=0

if [ ! -d "$CONTROL_ROOT" ]; then
  echo "validate-integrity: root '$CONTROL_ROOT' not found"
  exit 1
fi

# Source Core SDK (unified internal SDK)
source "${CONTROL_ROOT}/core/lib/api.sh"

REGISTRY="$CONTROL_ROOT/core/registry.yaml"

error() {
  echo "ERROR: $1"
  fail=1
}

ok() {
  checked=$((checked + 1))
}

# ─── 1. Registry exists ──────────────────────────────────────────────────────

if [ ! -f "$REGISTRY" ]; then
  error "core/registry.yaml not found"
  exit 1
fi
ok

echo "validate-integrity: checking $CONTROL_ROOT"

# ─── 2. Registry consistency: every component has a matching file on disk ────

# Check agents
while IFS= read -r agent; do
  [ -z "$agent" ] && continue
  found=0
  for platform in claude-code opencode; do
    if [ -f "$CONTROL_ROOT/agents/$platform/$agent.md" ]; then
      found=1
      break
    fi
  done
  if [ "$found" -eq 0 ]; then
    error "Registry agent '$agent' has no matching file in agents/{claude-code,opencode}/"
  fi
done < <(registry_list_agents)
ok

# Check knowledge
while IFS= read -r k; do
  [ -z "$k" ] && continue
  if [ ! -f "$CONTROL_ROOT/knowledge/$k.md" ]; then
    error "Registry knowledge '$k' has no matching file knowledge/$k.md"
  fi
done < <(registry_list_knowledge)
ok

# Check SOPs
while IFS= read -r sop; do
  [ -z "$sop" ] && continue
  if [ ! -f "$CONTROL_ROOT/sops/$sop.yaml" ]; then
    error "Registry SOP '$sop' has no matching file sops/$sop.yaml"
  fi
done < <(registry_list_sops)
ok

# Check templates
while IFS= read -r tmpl; do
  [ -z "$tmpl" ] && continue
  tpath=$(registry_get_template_path "$tmpl")
  if [ -z "$tpath" ]; then
    error "Registry template '$tmpl' has no path"
  elif [ ! -f "$CONTROL_ROOT/$tpath" ]; then
    error "Registry template '$tmpl' path '$tpath' has no matching file"
  fi
done < <(registry_list_templates)
ok

# Check validators
while IFS= read -r val; do
  [ -z "$val" ] && continue
  vpath=$(registry_get_validator_path "$val")
  if [ -n "$vpath" ]; then
    if [ ! -f "$CONTROL_ROOT/$vpath" ]; then
      error "Registry validator '$val' path '$vpath' has no matching file"
    fi
  else
    if [ ! -f "$CONTROL_ROOT/documentation/validation/$val.sh" ]; then
      error "Registry validator '$val' has no matching file"
    fi
  fi
done < <(registry_list_validators)
ok

# Check engine components
for component_type in collectors analyzers reporters; do
  while IFS= read -r comp; do
    [ -z "$comp" ] && continue
    if [ ! -f "$CONTROL_ROOT/engine/reality-engine/$component_type/$comp.sh" ]; then
      error "Registry engine $component_type '$comp' has no matching file engine/reality-engine/$component_type/$comp.sh"
    fi
  done < <(registry_list_engine "$component_type")
done
ok

# Check generators
while IFS= read -r gen; do
  [ -z "$gen" ] && continue
  gpath=$(registry_get_generator_path "$gen")
  if [ -n "$gpath" ]; then
    if [ ! -f "$CONTROL_ROOT/$gpath" ]; then
      error "Registry generator '$gen' path '$gpath' has no matching file"
    fi
  else
    if [ ! -f "$CONTROL_ROOT/bootstrap/generators/$gen.sh" ]; then
      error "Registry generator '$gen' has no matching file"
    fi
  fi
done < <(registry_list_generators)
ok

# Check detectors
while IFS= read -r det; do
  [ -z "$det" ] && continue
  dpath=$(registry_get_detector_path "$det")
  if [ -n "$dpath" ]; then
    if [ ! -f "$CONTROL_ROOT/$dpath" ]; then
      error "Registry detector '$det' path '$dpath' has no matching file"
    fi
  else
    if [ ! -f "$CONTROL_ROOT/bootstrap/detectors/$det.sh" ]; then
      error "Registry detector '$det' has no matching file"
    fi
  fi
done < <(registry_list_detectors)
ok

# ─── 3. Role → Capability: every capabilities: entry exists in capabilities.md ─

CAPABILITIES_FILE="$CONTROL_ROOT/knowledge/capabilities.md"
if [ -f "$CAPABILITIES_FILE" ]; then
  for platform in claude-code opencode; do
    for agent_file in "$CONTROL_ROOT/agents/$platform/"*.md; do
      [ -f "$agent_file" ] || continue
      agent_name=$(basename "$agent_file" .md)

      fm=$(awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f{print}' "$agent_file")
      caps=$(echo "$fm" | grep -E "^capabilities:" | sed -E 's/^capabilities:[[:space:]]*\[//' | sed -E 's/\].*//' | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

      for cap in $caps; do
        [ -z "$cap" ] && continue
        if ! grep -qE "^## ${cap}[[:space:]]" "$CAPABILITIES_FILE" 2>/dev/null && \
           ! grep -qE "^## ${cap}$" "$CAPABILITIES_FILE" 2>/dev/null; then
          error "Agent '$agent_name' capability '$cap' not found in knowledge/capabilities.md"
        fi
      done
    done
  done
fi
ok

# ─── 4. Knowledge exists: every knowledge: short-id resolves to file ─────────

for platform in claude-code opencode; do
  for agent_file in "$CONTROL_ROOT/agents/$platform/"*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file" .md)

    fm=$(awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f{print}' "$agent_file")
    knowledge=$(echo "$fm" | grep -E "^knowledge:" | sed -E 's/^knowledge:[[:space:]]*\[//' | sed -E 's/\].*//' | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

    for k in $knowledge; do
      [ -z "$k" ] && continue
      if [ ! -f "$CONTROL_ROOT/knowledge/$k.md" ]; then
        error "Agent '$agent_name' knowledge ref '$k' does not resolve to knowledge/$k.md"
      fi
    done
  done
done
ok

# ─── 5. Contract consistency: contracts referenced by registry exist ─────────

for level in product consumer; do
  while IFS= read -r contract; do
    [ -z "$contract" ] && continue
    if [ ! -f "$CONTROL_ROOT/core/contracts/$level/$contract.yaml" ]; then
      error "Registry contract '$level/$contract' has no matching file core/contracts/$level/$contract.yaml"
    fi
  done < <(registry_list_contracts "$level")
done
ok

# ─── 6. Workflow consistency: every SOP role: has matching agent ─────────────

for sop_file in "$CONTROL_ROOT/sops/"*.yaml; do
  [ -f "$sop_file" ] || continue
  sop_name=$(basename "$sop_file" .yaml)

  roles=$(grep -E "^\s+role:" "$sop_file" | sed -E 's/^\s+role:[[:space:]]*//' | sort -u)

  for role in $roles; do
    [ -z "$role" ] && continue
    [ "$role" = "human" ] && continue
    found=0
    for platform in claude-code opencode; do
      if [ -f "$CONTROL_ROOT/agents/$platform/$role.md" ]; then
        found=1
        break
      fi
    done
    if [ "$found" -eq 0 ]; then
      error "SOP '$sop_name' references role '$role' but no matching agent found"
    fi
  done

  if [ -f "$CAPABILITIES_FILE" ]; then
    caps=$(grep -E "^\s+capability:" "$sop_file" | sed -E 's/^\s+capability:[[:space:]]*//' | sort -u)
    for cap in $caps; do
      [ -z "$cap" ] && continue
      if ! grep -qE "^## ${cap}[[:space:]]" "$CAPABILITIES_FILE" 2>/dev/null && \
         ! grep -qE "^## ${cap}$" "$CAPABILITIES_FILE" 2>/dev/null; then
        error "SOP '$sop_name' references capability '$cap' not found in knowledge/capabilities.md"
      fi
    done
  fi
done
ok

# ─── 7. Template conformance: every template has valid Schema v1 FM ──────────

for tmpl_file in "$CONTROL_ROOT/documentation/templates/"*.md; do
  [ -f "$tmpl_file" ] || continue
  tmpl_name=$(basename "$tmpl_file")

  fm=$(awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f{print}' "$tmpl_file")
  if [ -z "$fm" ]; then
    error "Template '$tmpl_name' has no frontmatter"
    continue
  fi

  echo "$fm" | grep -qE "^schema:[[:space:]]*1[[:space:]]*$" || error "Template '$tmpl_name' schema != 1"
  for field in id type status date owners; do
    echo "$fm" | grep -qE "^${field}:" || error "Template '$tmpl_name' missing mandatory field '$field'"
  done
done
ok

# ─── 8. Internal links: entity_refs resolve to existing id: fields ───────────

# Entity catalog: "- **<id>**: description" entries
ENTITY_CATALOG="$CONTROL_ROOT/docs/architecture/entity-catalog.md"
if [ ! -f "$ENTITY_CATALOG" ]; then
  error "docs/architecture/entity-catalog.md not found"
  all_ids=""
else
  all_ids=$(grep -oE '^- \*\*[a-z0-9][a-z0-9-]*\*\*' "$ENTITY_CATALOG" | sed -E 's/^- \*\*//; s/\*\*$//')
fi

all_ids="$all_ids
$(find "$CONTROL_ROOT/docs" "$CONTROL_ROOT/knowledge" "$CONTROL_ROOT/documentation" -name "*.md" -type f 2>/dev/null | while read -r f; do
  awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f && /^id:/{gsub(/^id:[[:space:]]*/, ""); print}' "$f"
done)"

# Registry component names
all_ids="$all_ids
$(registry_list_agents 2>/dev/null)"
all_ids="$all_ids
$(registry_list_knowledge 2>/dev/null)"
all_ids="$all_ids
$(registry_list_sops 2>/dev/null)"
all_ids="$all_ids
$(registry_list_templates 2>/dev/null)"
all_ids="$all_ids
$(registry_list_validators 2>/dev/null)"
for level in product consumer; do
  all_ids="$all_ids
$(registry_list_contracts "$level" 2>/dev/null)"
done
for component_type in collectors analyzers reporters; do
  all_ids="$all_ids
$(registry_list_engine "$component_type" 2>/dev/null)"
done

all_ids=$(echo "$all_ids" | sort -u)

while IFS= read -r f; do
  [ -f "$f" ] || continue
  fm=$(awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f{print}' "$f")
  refs=$(echo "$fm" | grep -E "^entity_refs:" | sed -E 's/^entity_refs:[[:space:]]*\[//' | sed -E 's/\].*//' | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

  for ref in $refs; do
    [ -z "$ref" ] && continue
    if ! echo "$all_ids" | grep -qFx "$ref"; then
      rel_path="${f#$CONTROL_ROOT/}"
      error "$rel_path: entity_ref '$ref' does not resolve to any id: field or registry component"
    fi
  done
done < <(find "$CONTROL_ROOT/docs" "$CONTROL_ROOT/knowledge" "$CONTROL_ROOT/documentation" -name "*.md" -type f 2>/dev/null)
ok

# ─── 9. Engine components: collectors/analyzers/reporters referenced by SOP exist ─

for sop_file in "$CONTROL_ROOT/sops/"*.yaml; do
  [ -f "$sop_file" ] || continue
  sop_name=$(basename "$sop_file" .yaml)

  if grep -qE "^engine:" "$sop_file"; then
    engine=$(grep -E "^engine:" "$sop_file" | sed -E 's/^engine:[[:space:]]*//')

    engine_steps=$(grep -E "^\s+engine_step:" "$sop_file" | sed -E 's/^\s+engine_step:[[:space:]]*//')
    for step_path in $engine_steps; do
      if [ ! -f "$CONTROL_ROOT/engine/$engine/$step_path" ]; then
        error "SOP '$sop_name' references engine component '$engine/$step_path' but file not found"
      fi
    done
  fi
done
ok

# ─── Result ──────────────────────────────────────────────────────────────────

if [ "$fail" -ne 0 ]; then
  echo "::error::validate-integrity failed (see errors above)"
  exit 1
fi

echo "validate-integrity: OK ($checked checks passed)"
exit 0
