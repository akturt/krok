#!/bin/bash
# core/lib/api.sh — Unified Core SDK (internal SDK)
#
# Single entrypoint that loads the entire Core SDK. Every tool inside
# Underboss (bootstrap, install, validators, future migrate) sources THIS file
# instead of the individual lib modules, so they all behave identically:
#
#   source "${CONTROL_ROOT}/core/lib/api.sh"
#
# Provides: yaml, registry, state, detectors, generators, components.
#
# The caller may pre-set CONTROL_ROOT; otherwise it is derived from this file.

CONTROL_ROOT="${CONTROL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

source "${CONTROL_ROOT}/core/lib/yaml.sh"
source "${CONTROL_ROOT}/core/lib/registry.sh"
source "${CONTROL_ROOT}/core/lib/state.sh"
source "${CONTROL_ROOT}/core/lib/detectors.sh"
source "${CONTROL_ROOT}/core/lib/generators.sh"
source "${CONTROL_ROOT}/core/lib/components.sh"
