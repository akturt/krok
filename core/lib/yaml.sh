#!/bin/bash
# core/lib/yaml.sh — Minimal YAML parser for krok registry
#
# NOT a general YAML parser. Handles only the registry format.
# All functions take a file path as first argument.

# yaml_get <file> <key> — extract scalar value by key name (last component of path)
yaml_get() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  key=$(echo "$key" | sed 's/.*\.//')
  local line
  line=$(grep -E "^[[:space:]]*${key}:[[:space:]]" "$file" | head -1)
  [ -z "$line" ] && return 1
  local val
  val=$(echo "$line" | sed "s/^[[:space:]]*${key}:[[:space:]]*//" | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//')
  [ -z "$val" ] && return 1
  echo "$val"
}

# yaml_get_list <file> <section> — extract items from a section
# Works for: "detectors" (top-level) or "components.agents" (nested)
yaml_get_list() {
  local file="$1" section="$2"
  [ -f "$file" ] || return 1

  if [[ "$section" == *.* ]]; then
    # Nested: "components.agents" — one pass: the parent line, then the child line, then its items
    local parent="${section%%.*}" child="${section#*.}"
    awk -v par="^${parent}:" -v chd="^  ${child}:" '
      st == 0 && $0 ~ par { st = 1; next }
      st == 1 && $0 ~ chd { st = 2; found = 1; next }
      st == 2 && (/^[a-z]/ || /^  [a-z]/) { exit }
      st == 2 && /^    - name: / { sub(/^    - name: /, ""); print; next }
      st == 2 && /^    - / { sub(/^    - /, ""); print }
      END { exit found ? 0 : 1 }
    ' "$file"
  else
    # Top-level section
    awk -v sec="^${section}:" '
      BEGIN { found=0 }
      $0 ~ sec && /^[a-z]/ { found=1; next }
      found && /^[a-z]/ { exit }
      found && /^  - name: / { sub(/^  - name: /, ""); print }
      found && /^  - / && !/^  - name:/ { sub(/^  - /, ""); print }
    ' "$file"
  fi
}

# yaml_get_map_field <file> <section> <item_name> <field> — get field from named item
yaml_get_map_field() {
  local file="$1" section="$2" item_name="$3" field="$4"
  [ -f "$file" ] || return 1

  awk -v sec="^${section}:" -v nm="name: ${item_name}" -v fld="${field}:" '
    BEGIN { found=0; in_item=0; match_item=0 }
    $0 ~ sec && /^[a-z]/ { found=1; next }
    found && /^[a-z]/ { exit }
    found && /^  - name: / {
      in_item=1
      match_item = ($0 ~ nm) ? 1 : 0
      next
    }
    found && in_item && /^  - / { in_item=0 }
    found && in_item && match_item && $0 ~ "    " fld {
      val=$0
      sub("^    " fld "[[:space:]]*", "", val)
      gsub(/^"/, "", val); gsub(/"$/, "", val)
      gsub(/^'\''/, "", val); gsub(/'\''$/, "", val)
      print val
      exit
    }
  ' "$file"
}

# yaml_get_nested_list <file> <parent> <child> — list under nested section
#   contracts.product, components.agents, etc.
yaml_get_nested_list() {
  local file="$1" parent="$2" child="$3"
  [ -f "$file" ] || return 1

  # Find parent line number
  local parent_line
  parent_line=$(grep -n "^${parent}:" "$file" | head -1 | cut -d: -f1)
  [ -z "$parent_line" ] && return 1

  # Find child line number within parent
  local child_line
  child_line=$(awk -v pl="$parent_line" 'NR > pl && /^  '"${child}"':/ { print NR; exit }' "$file")
  [ -z "$child_line" ] && return 1

  # Find end of child section
  local end_line
  end_line=$(awk -v cl="$child_line" 'NR > cl && /^[a-z]/ || NR > cl && /^  [a-z]/ { print NR; exit } END { print NR+100 }' "$file")

  # Extract list items
  awk -v s="$child_line" -v e="$end_line" 'NR > s && NR < e && /^      - / { sub(/^      - /, ""); print }' "$file"
}

yaml_has_section() {
  local file="$1" path="$2"
  [ -f "$file" ] || return 1
  local key
  key=$(echo "$path" | sed 's/.*\.//')
  grep -qE "^[[:space:]]*${key}:" "$file"
}

yaml_get_version() {
  yaml_get "$1" "${2}.version"
}

# yaml_get_deep_list <file> <dotted.path> — extract list from deeply nested section
#   yaml_get_deep_list registry.yaml "components.contracts.product" → list
yaml_get_deep_list() {
  local file="$1" path="$2"
  [ -f "$file" ] || return 1

  # Split path into parts
  local IFS='.'
  local parts=($path)
  local depth=${#parts[@]}

  # Build section headers at each depth level
  local indent=""
  local target_key="${parts[$((depth-1))]}"
  local headers=()
  for ((i=0; i<depth-1; i++)); do
    headers+=("${indent}${parts[$i]}:")
    indent="${indent}  "
  done
  headers+=("${indent}${target_key}:")

  local item_indent=""
  for ((i=0; i<depth; i++)); do
    item_indent="${item_indent}  "
  done
  local sep=$'\034' joined="" hdr
  for hdr in "${headers[@]}"; do joined="${joined}${hdr}${sep}"; done

  # One pass: match the headers in sequence, then take the "- " items of the last section
  # until the first indented line that is not at the item indent.
  awk -v hs="${joined%"$sep"}" -v sep="$sep" -v prefix="${item_indent}" '
    BEGIN { n = split(hs, H, sep); i = 1 }
    i <= n { if ($0 == H[i]) i++; next }
    /^[[:space:]]/ && $0 !~ "^"prefix { exit }
    $0 ~ "^"prefix"- " {
      val=$0
      sub("^"prefix"- ", "", val)
      if (val ~ /^name: /) sub(/^name: /, "", val)
      print val
    }
    END { exit i > n ? 0 : 1 }
  ' "$file"
}

# yaml_get_map <file> <section> — map each item's name to its path
#   yaml_get_map registry.yaml "generators" → "architecture-readme bootstrap/generators/architecture-readme.sh"
#   Returns "name path" per item; path may be empty if the field is absent.
yaml_get_map() {
  local file="$1" section="$2"
  [ -f "$file" ] || return 1

  awk -v sec="^${section}:" '
    BEGIN { found=0; in_item=0; nm=""; pt="" }
    $0 ~ sec && /^[a-z]/ { found=1; next }
    found && /^[a-z]/ { exit }
    found && /^  - name: / {
      if (in_item && nm != "") print nm " " pt
      in_item=1; nm=$0; sub(/^  - name: /, "", nm)
      gsub(/^"/, "", nm); gsub(/"$/, "", nm)
      pt=""
      next
    }
    found && in_item && /^  - / { if (nm != "") print nm " " pt; in_item=0; nm=""; pt="" }
    found && in_item && /^[[:space:]]*path:[[:space:]]*/ {
      pt=$0; sub(/^[[:space:]]*path:[[:space:]]*/, "", pt)
      gsub(/^"/, "", pt); gsub(/"$/, "", pt)
    }
    END { if (in_item && nm != "") print nm " " pt }
  ' "$file"
}
