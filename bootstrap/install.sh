#!/bin/bash
# bootstrap/install.sh
#
# One-liner installer for Krok.
# Uses the Core SDK (core/lib/api.sh) to read all paths and versions
# from registry.yaml — no grep/sed/awk parsing of the registry.
#
# Usage: bash <(curl -s https://raw.githubusercontent.com/akturt/krok/master/bootstrap/install.sh)

set -eu

REPO_URL="https://github.com/akturt/krok.git"

# Detect project root
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$PROJECT_ROOT" ]; then
  echo "ERROR: not inside a git repository. Run from your project root." >&2
  exit 1
fi

echo "→ Project: $PROJECT_ROOT"

# Krok submodule location
SUBMODULE_PATH="docs/.control"

# Load the unified Core SDK for a given Krok root.
load_api() {
  CONTROL_ROOT="$1"
  # shellcheck disable=SC1090
  source "${CONTROL_ROOT}/core/lib/api.sh"
}

CONTROL_DIR=""
if [ -f "$PROJECT_ROOT/$SUBMODULE_PATH/core/registry.yaml" ]; then
  CONTROL_DIR="$PROJECT_ROOT/$SUBMODULE_PATH"
fi

if [ -n "$CONTROL_DIR" ]; then
  load_api "$CONTROL_DIR"
  CONTROL_NAME=$(registry_name)
  VERSION=$(registry_version)
  BOOTSTRAP_PATH=$(registry_entrypoint "bootstrap")
  echo "→ ${CONTROL_NAME} v${VERSION} already installed. Running bootstrap..."
  bash "$CONTROL_DIR/$BOOTSTRAP_PATH" --target "$PROJECT_ROOT"
  exit 0
fi

# Fresh install
echo "→ Installing Krok..."

# Ensure docs/.control exists
mkdir -p "$PROJECT_ROOT/docs/.control"

if [ -d "$PROJECT_ROOT/$SUBMODULE_PATH" ]; then
  echo "→ Submodule directory exists. Updating..."
  cd "$PROJECT_ROOT"
  git submodule update --init --recursive
else
  echo "→ Adding submodule..."
  cd "$PROJECT_ROOT"
  git submodule add "$REPO_URL" "$SUBMODULE_PATH"
  git config -f .gitmodules submodule."$SUBMODULE_PATH".branch master
fi

# Read bootstrap entrypoint from the freshly installed registry via Core SDK
if [ ! -f "$PROJECT_ROOT/$SUBMODULE_PATH/core/registry.yaml" ]; then
  echo "ERROR: registry not found: $SUBMODULE_PATH/core/registry.yaml" >&2
  exit 1
fi
load_api "$PROJECT_ROOT/$SUBMODULE_PATH"
BOOTSTRAP_PATH=$(registry_entrypoint "bootstrap")

# Run bootstrap
echo "→ Running bootstrap..."
bash "$PROJECT_ROOT/$SUBMODULE_PATH/$BOOTSTRAP_PATH" --target "$PROJECT_ROOT"

echo ""
echo "✅ Installation complete."
echo ""
echo "Next steps:"
echo " 1. Fill .context/project.yml with your project metadata"
echo " 2. Complete docs/architecture/README.md"
echo " 3. Create your first ADR"
echo ""
echo "Commit with:"
echo " git add -A && git commit -m 'docs: install Krok'"
