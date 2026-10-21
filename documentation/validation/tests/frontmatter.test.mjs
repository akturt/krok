import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkText, run } from '../validate-frontmatter.mjs';
import { tmp, put } from './helpers.mjs';

const FM = (extra = '', type = 'architecture') => `---\nschema: 1\nid: a\ntype: ${type}\nstatus: active\ndate: 2026-10-04\nowners: [t]\n${extra}---\n# a\n`;

test('checkText: a valid document has no findings; CRLF is accepted', () => {
  assert.deepEqual(checkText('a.md', FM()), []);
  assert.deepEqual(checkText('a.md', FM().replace(/\n/g, '\r\n')), []);
});

test('checkText: no / empty frontmatter, schema, mandatory and forbidden fields', () => {
  assert.match(checkText('a.md', '# x')[0], /no frontmatter at all/);
  assert.match(checkText('a.md', '---\n---\n')[0], /empty frontmatter/);
  const out = checkText('a.md', '---\nschema: 2\nid: a\ntitle: x\n---\n').join('\n');
  assert.match(out, /schema != 1/);
  assert.match(out, /missing mandatory field 'type'/);
  assert.match(out, /missing mandatory field 'owners'/);
  assert.match(out, /forbidden field '\^title:'/);
});

test('checkText: per-type rules (runbook kind, api status, spec track, spec/audit entity_refs)', () => {
  assert.match(checkText('a.md', FM('', 'runbook')).join('\n'), /runbook requires 'kind:'/);
  assert.deepEqual(checkText('a.md', FM('kind: ops\n', 'runbook')), []);
  assert.match(checkText('a.md', FM('', 'api').replace('active', 'draft')).join('\n'), /api status 'draft'/);
  assert.match(checkText('a.md', FM('entity_refs: []\n', 'spec')).join('\n'), /spec requires non-empty entity_refs/);
  assert.match(checkText('a.md', FM('', 'audit')).join('\n'), /audit requires non-empty entity_refs/);
  assert.match(checkText('a.md', FM('entity_refs: [x]\ntrack: prose\n', 'spec')).join('\n'), /track 'prose' must be code, docs or mixed/);
  assert.deepEqual(checkText('a.md', FM('entity_refs: [x]\ntrack: docs\n', 'spec')), []);
});

function repo(files) {
  const r = tmp('krok-fm-git-');
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: r, stdio: 'ignore' });
  g('init', '-q', '.');
  for (const [p, c] of Object.entries(files)) put(r, p, c);
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  return r;
}

test('--changed: only modified, staged and untracked documents are read; deletions are skipped', () => {
  const r = repo({ 'docs/ok.md': FM(), 'docs/bad.md': '# no frontmatter', 'docs/gone.md': FM() });
  const cwd = process.cwd();
  process.chdir(r);
  try {
    // nothing changed: the broken committed file is outside the scope of a changed-only run
    let res = run('docs', true);
    assert.equal(res.mode, 'changed');
    assert.deepEqual(res.errors, []);
    assert.equal(run('docs', false).errors.length, 1);

    put(r, 'docs/ok.md', '# broken now');                      // modified
    put(r, 'docs/new.md', FM().replace('schema: 1', 'schema: 2')); // untracked
    rmSync(join(r, 'docs/gone.md'));                            // deleted
    res = run('docs', true);
    const out = res.errors.join('\n');
    assert.match(out, /docs\/ok\.md: no frontmatter/);
    assert.match(out, /docs\/new\.md: schema != 1/);
    assert.doesNotMatch(out, /bad\.md|gone\.md/);
    assert.equal(res.count, 2);
  } finally { process.chdir(cwd); }
});

test('--changed without a repository checks everything instead of reporting a false OK', () => {
  const r = tmp('krok-fm-nogit-');
  put(r, 'docs/bad.md', '# no frontmatter');
  const cwd = process.cwd();
  process.chdir(r);
  try {
    const res = run('docs', true);
    assert.equal(res.mode, 'all');
    assert.match(res.errors.join('\n'), /bad\.md: no frontmatter/);
  } finally { process.chdir(cwd); }
});
