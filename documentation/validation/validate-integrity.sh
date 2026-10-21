#!/bin/bash
# documentation/validation/validate-integrity.sh
#
# Validates the integrity of Krok itself as a complete dependency graph.
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

# ─── 3. Role → Capability and 4. Knowledge exists ────────────────────────────
# Checked together with 7 and 8 by integrity-docs.mjs (see below).

CAPABILITIES_FILE="$CONTROL_ROOT/knowledge/capabilities.md"


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

# ─── 7. Template conformance and 8. Internal links ───────────────────────────
# (together with 3 and 4 above: the document-reading checks run in one Node pass)

all_ids="$(registry_list_agents 2>/dev/null)
$(registry_list_knowledge 2>/dev/null)
$(registry_list_sops 2>/dev/null)
$(registry_list_templates 2>/dev/null)
$(registry_list_validators 2>/dev/null)"
for level in product consumer; do
  all_ids="$all_ids
$(registry_list_contracts "$level" 2>/dev/null)"
done
for component_type in collectors analyzers reporters; do
  all_ids="$all_ids
$(registry_list_engine "$component_type" 2>/dev/null)"
done

doc_findings=$(printf '%s\n' "$all_ids" | node "$(dirname "$0")/integrity-docs.mjs" "$CONTROL_ROOT")
if [ -n "$doc_findings" ]; then
  echo "$doc_findings"
  fail=1
fi
ok
ok
ok
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
