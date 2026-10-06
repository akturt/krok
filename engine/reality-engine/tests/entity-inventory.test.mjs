// Regression tests of the Reality Engine collector entity-inventory.sh: resolution of an entity
// by a line `id: <name>` (end of line, trailing space, word boundary, regex metacharacters).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO, tmp, put } from '../../../documentation/validation/tests/helpers.mjs';

const SCRIPT = join(REPO, 'engine', 'reality-engine', 'collectors', 'entity-inventory.sh').split('\\').join('/');

function inventory(catalog, refs) {
  const dir = tmp('krok-ei-');
  put(dir, 'docs/architecture/entity-catalog.md', catalog);
  put(dir, 'docs/specs/drafts/a.md', `---\nschema: 1\nid: spec-a\ntype: spec\nstatus: draft\ndate: 2026-10-04\nowners: [t]\nentity_refs: [${refs.join(', ')}]\n---\n\n# A\n`);
  const r = spawnSync('bash', [SCRIPT, dir.split('\\').join('/')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  return { json, resolved: (id) => json.entities.find((e) => e.id === id).resolved };
}

test('entity-inventory: id at end of line resolves; unknown entity does not', () => {
  const { json, resolved } = inventory('# Catalog\n\n## person\nid: person\n', ['person', 'ghost-entity']);
  assert.equal(resolved('person'), true);
  assert.equal(resolved('ghost-entity'), false);
  assert.equal(json.unresolved_count, 1);
});

test('entity-inventory: id with a trailing space resolves', () => {
  const { resolved } = inventory('## person\nid: person \n', ['person']);
  assert.equal(resolved('person'), true);
});

test('entity-inventory: id with CRLF line ending resolves', () => {
  const { resolved } = inventory('## person\r\nid: person\r\n', ['person']);
  assert.equal(resolved('person'), true);
});

test('entity-inventory: id of another entity does not resolve a prefix (word boundary)', () => {
  const { json, resolved } = inventory('## x\nid: person-extra\n', ['person']);
  assert.equal(resolved('person'), false);
  assert.equal(json.unresolved_count, 1);
});

test('entity-inventory: regex metacharacters in an entity name are literal', () => {
  const { resolved } = inventory('## x\nid: a-b\n', ['a.b']);
  assert.equal(resolved('a.b'), false);
  const dotted = inventory('## x\nid: a.b\n', ['a.b']);
  assert.equal(dotted.resolved('a.b'), true);
});
