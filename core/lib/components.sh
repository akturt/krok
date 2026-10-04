#!/bin/bash
# core/lib/components.sh — Component operations
#
# Checks that registry-declared components exist on disk.
# Requires: core/lib/registry.sh

# components_verify — check all registry components exist
# Returns 0 if all OK, 1 if any missing
components_verify() {
  local all_ok=1

  # Agents
  while IFS= read -r agent; do
    [ -z "$agent" ] && continue
    local found=0
    for platform in claude-code opencode; do
      if [ -f "${CONTROL_ROOT}/agents/$platform/$agent.md" ]; then
        found=1
        break
      fi
    done
    if [ "$found" -eq 0 ]; then
      echo "  ✗ Agent '$agent' not found in agents/{claude-code,opencode}/"
      all_ok=1  # agents are optional in some contexts
    else
      echo "  ✓ Agent: $agent"
    fi
  done < <(registry_list_agents)

  # Knowledge
  while IFS= read -r k; do
    [ -z "$k" ] && continue
    if [ -f "${CONTROL_ROOT}/knowledge/$k.md" ]; then
      echo "  ✓ Knowledge: $k"
    else
      echo "  ✗ Knowledge '$k' not found"
      all_ok=0
    fi
  done < <(registry_list_knowledge)

  # SOPs
  while IFS= read -r sop; do
    [ -z "$sop" ] && continue
    if [ -f "${CONTROL_ROOT}/sops/$sop.yaml" ]; then
      echo "  ✓ SOP: $sop"
    else
      echo "  ✗ SOP '$sop' not found"
      all_ok=0
    fi
  done < <(registry_list_sops)

  # Templates
  while IFS= read -r tmpl; do
    [ -z "$tmpl" ] && continue
    local tpath
    tpath=$(registry_get_template_path "$tmpl")
    if [ -n "$tpath" ] && [ -f "${CONTROL_ROOT}/${tpath}" ]; then
      echo "  ✓ Template: $tmpl"
    else
      echo "  ✗ Template '$tmpl' not found"
      all_ok=0
    fi
  done < <(registry_list_templates)

  # Validators
  while IFS= read -r val; do
    [ -z "$val" ] && continue
    local vpath
    vpath=$(registry_get_validator_path "$val")
    if [ -n "$vpath" ] && [ -f "${CONTROL_ROOT}/${vpath}" ]; then
      echo "  ✓ Validator: $val"
    else
      echo "  ✗ Validator '$val' not found"
      all_ok=0
    fi
  done < <(registry_list_validators)

  # Contracts
  for level in product consumer; do
    while IFS= read -r contract; do
      [ -z "$contract" ] && continue
      if [ -f "${CONTROL_ROOT}/core/contracts/$level/$contract.yaml" ]; then
        echo "  ✓ Contract: $level/$contract"
      else
        echo "  ✗ Contract '$level/$contract' not found"
        all_ok=0
      fi
    done < <(registry_list_contracts "$level")
  done

  # Engine components
  for component_type in collectors analyzers reporters; do
    while IFS= read -r comp; do
      [ -z "$comp" ] && continue
      if [ -f "${CONTROL_ROOT}/engine/reality-engine/$component_type/$comp.sh" ]; then
        echo "  ✓ Engine: $component_type/$comp"
      else
        echo "  ✗ Engine component '$component_type/$comp' not found"
        all_ok=0
      fi
    done < <(registry_list_engine "$component_type")
  done

  # Generators
  while IFS= read -r gen; do
    [ -z "$gen" ] && continue
    local gpath
    gpath=$(registry_get_generator_path "$gen")
    if [ -n "$gpath" ] && [ -f "${CONTROL_ROOT}/${gpath}" ]; then
      echo "  ✓ Generator: $gen"
    else
      echo "  ✗ Generator '$gen' not found"
      all_ok=0
    fi
  done < <(registry_list_generators)

  # Detectors
  while IFS= read -r det; do
    [ -z "$det" ] && continue
    local dpath
    dpath=$(registry_get_detector_path "$det")
    if [ -n "$dpath" ] && [ -f "${CONTROL_ROOT}/${dpath}" ]; then
      echo "  ✓ Detector: $det"
    else
      echo "  ✗ Detector '$det' not found"
      all_ok=0
    fi
  done < <(registry_list_detectors)

  return $all_ok
}
