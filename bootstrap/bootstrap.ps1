# bootstrap/bootstrap.ps1
#
# Minimal Underboss bootstrap (Windows / PowerShell).
# Creates docs/ skeleton + .context/ stubs + drops CLAUDE.md snippet into the
# consumer repository. Idempotent. Mirrors bootstrap.sh.
#
# Usage:
#   powershell -File docs\.control\bootstrap\bootstrap.ps1
#   powershell -File docs\.control\bootstrap\bootstrap.ps1 -ProjectPath C:\path\to\project

[CmdletBinding()]
param(
  [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

if (-not $ProjectPath) {
  try {
    $ProjectPath = (git rev-parse --show-toplevel 2>$null | Out-String).Trim()
  } catch {}
  if (-not $ProjectPath) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectPath = (Resolve-Path (Join-Path $ScriptDir "..\..\..")).Path
  }
}

$ControlRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "-> Target project:  $ProjectPath"
Write-Host "-> Underboss root:  $ControlRoot"
Write-Host ""

function Get-RegistryDirectories($scope) {
  $reg = Join-Path $ControlRoot "core\registry.yaml"
  if (-not (Test-Path $reg)) { throw "registry not found: $reg" }
  $lines = Get-Content -Path $reg
  $inDirs = $false; $inScope = $false; $result = @()
  foreach ($line in $lines) {
    if ($line -match '^directories:') { $inDirs = $true; continue }
    if ($inDirs -and $line -match '^[a-z]') { $inDirs = $false; $inScope = $false; continue }
    if ($inDirs -and $line -match ('^  ' + $scope + '\s*:')) { $inScope = $true; continue }
    if ($inScope -and $line -match '^(  )?[a-z]') { $inScope = $false; continue }
    if ($inScope -and $line -match '^\s*- path:\s*(.+?)\s*$') { $result += $Matches[1] }
  }
  return $result
}
$dirs = Get-RegistryDirectories "docs"
foreach ($d in $dirs) {
  $d = "docs\" + ($d -replace '/', '\')
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectPath $d) | Out-Null
}
foreach ($keep in @("docs\architecture","docs\adr","docs\audits","docs\backlog","docs\api")) {
  $p = Join-Path $ProjectPath (Join-Path $keep ".gitkeep")
  if (-not (Test-Path $p)) { New-Item -ItemType File -Path $p | Out-Null }
}

$ctx = Join-Path $ProjectPath ".context"
New-Item -ItemType Directory -Force -Path $ctx | Out-Null

function Write-StubIfMissing($path, $lines) {
  if (-not (Test-Path $path)) {
    $lines | Set-Content -Path $path -Encoding utf8
  }
}

$projectYml = @(
  'project:',
  '  name: TODO-project-name',
  '  description: "TODO: 1-sentence project description"',
  '  domain: example.com',
  '  maintainer: team-name',
  '  repository: TODO',
  '',
  'stack:',
  '  backend: []',
  '  database: []',
  '  infrastructure: []',
  '',
  'directories:',
  '  key: {}'
)
Write-StubIfMissing (Join-Path $ctx 'project.yml') $projectYml

$boundariesYml = @(
  'boundaries:',
  '  pristine:',
  '    - path: docs/.control/',
  '      reason: "Underboss submodule (managed by git submodule update --remote)"',
  '  editable:',
  '    - path: docs/',
  '      reason: "all user-authored documentation"',
  '  generated: []',
  '  secret: []'
)
Write-StubIfMissing (Join-Path $ctx 'boundaries.yml') $boundariesYml

$agentEntry = @(
  '# Agent Entry Protocol',
  '',
  'Read in order:',
  '1. `.context/project.yml` - what project this is',
  '2. `.context/boundaries.yml` - what is editable / pristine / secret',
  '3. `docs/architecture/README.md` - topology, invariants (create if missing)',
  '4. `CLAUDE.md` - rules',
  '',
  'Before creating any .md in docs/:',
  '1. Identify `type` (spec|adr|audit|runbook|guide|api|architecture|backlog|prompt)',
  '2. Copy template from Underboss: `docs/.control/documentation/templates/<type>.md`',
  '3. Fill the 6 mandatory fields: schema, id, type, status, date, owners',
  '4. Never add `lifecycle:` to frontmatter (a spec position is its directory)',
  '5. Never add legacy fields: author, title, created, referenced_by, supersedes_adr, excludes-from-scope'
)
Write-StubIfMissing (Join-Path $ctx "agent-entry.md") $agentEntry

$snippet = @(
  '## Underboss',
  '',
  'Underboss is connected as a Git Submodule:',
  '',
  '    docs/.control/',
  '',
  'Before any change to `docs/`:',
  '1. Study `docs/.control/playbook/playbook-v2.md` (target model)',
  '2. Use `docs/.control/documentation/templates/` - do NOT copy templates into the project',
  '3. Follow `docs/.control/documentation/schemas/frontmatter.schema.json`',
  '4. Run `docs/.control/documentation/validation/validate-frontmatter.sh` before commit',
  '5. For brownfield migration, follow `docs/.control/playbook/migrate-legacy.md`',
  '6. For typical processes, pick a SOP in `docs/.control/sops/` and run `node docs/.control/sops/planner.mjs <name>` - call roles by name',
  '7. If task involves architectural review - see `docs/.control/sops/architecture-review.yaml`; foundation is `reality-auditor` BEFORE `architecture-reviewer`.',
  '8. Execution state is managed with `docs/.control/core/bin/underboss` (status, attention, execution, escalation).',
  '9. To install, update or migrate Underboss follow `docs/.control/INSTALL.md` (the canonical runbook).',
  '10. Common knowledge bases live in `docs/.control/knowledge/` (`architecture-principles`, `evidence-model`, `audit-principles`, `report-formats`, `capabilities`) - roles reference them by short-id, not inline.'
)

$claude = Join-Path $ProjectPath "CLAUDE.md"
if (Test-Path $claude) {
  $existing = Get-Content -Path $claude -Raw -ErrorAction SilentlyContinue
  if ($existing -notmatch "## Underboss") {
    $newContent = ($snippet -join "`n") + "`n`n" + $existing
    $newContent | Set-Content -Path $claude -Encoding utf8
    Write-Host "-> Prepended 'Underboss' section to existing CLAUDE.md"
  } else {
    Write-Host "-> CLAUDE.md already has 'Underboss' section, skipped"
  }
} else {
  $snippet | Set-Content -Path $claude -Encoding utf8
  Write-Host "-> Created CLAUDE.md with Underboss snippet"
}

# AGENTS.md — same content, only if the file already exists (Cursor, Windsurf, etc.)
$agents = Join-Path $ProjectPath "AGENTS.md"
if (Test-Path $agents) {
  $existing = Get-Content -Path $agents -Raw -ErrorAction SilentlyContinue
  if ($existing -notmatch "## Underboss") {
    $newContent = ($snippet -join "`n") + "`n`n" + $existing
    $newContent | Set-Content -Path $agents -Encoding utf8
    Write-Host "-> Prepended 'Underboss' section to existing AGENTS.md"
  } else {
    Write-Host "-> AGENTS.md already has 'Underboss' section, skipped"
  }
}

$wfDir = Join-Path $ProjectPath ".github\workflows"
New-Item -ItemType Directory -Force -Path $wfDir | Out-Null
$wf = Join-Path $wfDir "docs-validate.yml"
if (-not (Test-Path $wf)) {
  $wfContent = @(
    "name: docs-validate",
    "on:",
    "  pull_request:",
    '    paths: ["docs/**"]',
    "jobs:",
    "  schema-v1:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          submodules: true",
    "      - name: Validate Canonical Schema v1 frontmatter (docs/)",
    "        run: |",
    "          bash docs/.control/documentation/validation/validate-frontmatter.sh",
    "      - name: Validate lifecycle",
    "        run: node docs/.control/documentation/validation/validate-lifecycle.mjs docs",
    "      - name: Validate backlog",
    "        run: node docs/.control/documentation/validation/validate-backlog.mjs docs",
    "      - name: Validate integrity",
    "        run: bash docs/.control/documentation/validation/validate-integrity.sh"
  )
  $wfContent | Set-Content -Path $wf -Encoding utf8
  Write-Host "-> Created .github/workflows/docs-validate.yml"
} else {
  Write-Host "-> .github/workflows/docs-validate.yml exists, skipped (inspect manually if needed)"
}

Write-Host ""
Write-Host "OK Bootstrap complete."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Fill .context/project.yml with project-specific stack and metadata"
Write-Host "  2. Edit .context/boundaries.yml for pristine/secret paths of THIS project"
Write-Host "  3. Copy template to create first ADR: copy docs/.control/documentation/templates/adr.md to docs/adr/001-<slug>.md"
Write-Host "  4. Create docs/architecture/README.md (topology + invariants)"
Write-Host "  5. Commit the new structure"
