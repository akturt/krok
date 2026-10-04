#!/bin/bash
# core/lib/registry.sh — Registry API (SSOT reader)
#
# All Underboss components read from registry through this API.
# No awk/grep/sed — uses yaml.sh for all parsing.
#
# Requires: core/lib/yaml.sh

# Lazy computation — CONTROL_REGISTRY computed on first use
CONTROL_REGISTRY=""

_registry_init() {
  if [ -z "$CONTROL_REGISTRY" ]; then
    CONTROL_REGISTRY="${CONTROL_ROOT}/core/registry.yaml"
  fi
}

registry_exists() {
  _registry_init
  [ -n "$CONTROL_REGISTRY" ] && [ -f "$CONTROL_REGISTRY" ]
}

# --- Scalar accessors ---

registry_name() {
  _registry_init
  yaml_get "$CONTROL_REGISTRY" "control.name"
}

registry_version() {
  _registry_init
  yaml_get "$CONTROL_REGISTRY" "control.version"
}

registry_codename() {
  _registry_init
  yaml_get "$CONTROL_REGISTRY" "control.codename"
}

registry_bootstrap_version() {
  _registry_init
  yaml_get "$CONTROL_REGISTRY" "bootstrap.engine_version"
}

registry_schema_version() {
  _registry_init
  yaml_get "$CONTROL_REGISTRY" "schema.version"
}

# --- Entrypoints ---

registry_entrypoint() {
  _registry_init
  local name="$1"
  yaml_get "$CONTROL_REGISTRY" "entrypoints.${name}"
}

# --- Component lists ---

registry_list_agents() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "components.agents"
}

registry_list_knowledge() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "components.knowledge"
}

registry_list_sops() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "components.sops"
}

registry_list_contracts() {
  _registry_init
  local level="$1"
  yaml_get_deep_list "$CONTROL_REGISTRY" "components.contracts.${level}"
}

registry_list_templates() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "templates"
}

registry_list_validators() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "validators"
}

registry_list_detectors() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "detectors"
}

registry_list_generators() {
  _registry_init
  yaml_get_list "$CONTROL_REGISTRY" "generators"
}

# --- Path accessors ---

registry_get_template_path() {
  _registry_init
  local name="$1"
  yaml_get_map_field "$CONTROL_REGISTRY" "templates" "$name" "path"
}

registry_get_detector_path() {
  _registry_init
  local name="$1"
  yaml_get_map_field "$CONTROL_REGISTRY" "detectors" "$name" "path"
}

registry_get_generator_path() {
  _registry_init
  local name="$1"
  yaml_get_map_field "$CONTROL_REGISTRY" "generators" "$name" "path"
}

registry_get_generator_entry() {
  _registry_init
  local name="$1"
  yaml_get_map_field "$CONTROL_REGISTRY" "generators" "$name" "entry"
}

registry_get_validator_path() {
  _registry_init
  local name="$1"
  yaml_get_map_field "$CONTROL_REGISTRY" "validators" "$name" "path"
}

# --- Directories ---

registry_list_directories() {
  _registry_init
  local scope="$1"
  awk -v scope="$scope" '
BEGIN { in_dirs=0; in_scope=0 }
/^[[:space:]]*directories:/ { in_dirs=1; next }
in_dirs && /^[a-z]/ { in_dirs=0; in_scope=0; next }
in_dirs && $0 ~ "^[[:space:]]*" scope ":" { in_scope=1; next }
in_scope && /^(  [a-z]|[a-z])/ { in_scope=0; next }
in_scope && /^[[:space:]]*-[[:space:]]*path:[[:space:]]*/ {
  v=$0; sub(/^[[:space:]]*-[[:space:]]*path:[[:space:]]*/, "", v)
  gsub(/^"/, "", v); gsub(/"$/, "", v)
  print v; next
}
in_scope && /^[[:space:]]*-[[:space:]]*/ {
  v=$0; sub(/^[[:space:]]*-[[:space:]]*/, "", v)
  sub(/^path:[[:space:]]*/, "", v)
  gsub(/^"/, "", v); gsub(/"$/, "", v)
  print v
}
' "$CONTROL_REGISTRY"
}

# --- Maps ---

registry_get_generators_map() {
  _registry_init
  yaml_get_map "$CONTROL_REGISTRY" "generators"
}

registry_get_detectors_map() {
  _registry_init
  yaml_get_map "$CONTROL_REGISTRY" "detectors"
}

# --- Engine components ---

registry_list_engine() {
  _registry_init
  local type="$1"
  yaml_get_deep_list "$CONTROL_REGISTRY" "components.engine.${type}"
}

