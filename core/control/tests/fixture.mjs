// Fixture project for the control-layer tests: a git checkout with an approved Spec,
// an accepted ADR, invariants, a SOP and the real Registry.
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function git(root, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function put(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

export const SPEC = `---
schema: 1
id: spec-x
type: spec
status: approved
date: 2026-10-04
owners: [t]
entity_refs: [core]
touches: [subsys]
implements: [adr-001-x]
depends_on: []
---

# Spec: x

## Scope
### Included
- a
### Excluded
- b

## Acceptance criteria
- **AC-001** first
- **AC-002** second
`;

export const ADR = `---
schema: 1
id: adr-001-x
type: adr
status: accepted
date: 2026-10-04
owners: [t]
---

# ADR-001
`;

export const INVARIANTS = `# Invariants

### INV-001

Description: one.

---

### INV-002

Description: two.
`;

export function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'krok-ctl-'));
  put(root, 'docs/specs/approved/x.md', SPEC);
  put(root, 'docs/adr/001-x.md', ADR);
  put(root, 'docs/architecture/invariants.md', INVARIANTS);
  put(root, 'docs/architecture/entity-catalog.md', '---\nschema: 1\nid: entity-catalog\ntype: architecture\nstatus: active\ndate: 2026-10-04\nowners: [t]\n---\n\n- **core**: the core\n');
  put(root, '.context/project.yml', 'name: proj\nrepository:\n  name: proj\n');
  put(root, '.context/boundaries.yml', 'boundaries:\n  pristine:\n    - path: docs/.control/\n');
  git(root, 'init', '-q', '-b', 'main', '.');
  git(root, 'remote', 'add', 'origin', 'https://example.com/acme/proj.git');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

// Deterministic clock: one second per call.
export function clock(start = Date.parse('2026-10-04T12:00:00Z')) {
  let t = start - 1000;
  return () => new Date((t += 1000)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const noDrift = () => [];

export function definition(root, over = {}) {
  return {
    id: 'execution-001',
    spec: 'spec-x',
    scope: 'all',
    sop: { name: 'new-feature', version: 1 },
    constraints: ['INV-001'],
    autonomy: JSON.parse(JSON.stringify({ escalate_on: nineKinds() })),
    ...over,
  };
}

export function nineKinds() {
  const reg = readFileSync(join(REPO, 'core', 'registry.yaml'), 'utf8');
  const block = reg.split('escalation_kinds:')[1].split('\n\n')[0];
  return [...block.matchAll(/^\s+- ([a-z-]+)$/gm)].map((m) => m[1]);
}

export const A = { actor: 'agent:test' };
