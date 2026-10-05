import test from 'node:test';
import assert from 'node:assert/strict';
import { validate as validateBacklog } from '../validate-backlog.mjs';
import { classify, scan, run } from '../validate-vocabulary.mjs';
import { tmp, put, doc } from './helpers.mjs';

test('backlog: active.md only [ ], archive.md only [x] and [-]', () => {
  const r = tmp();
  put(r, 'backlog/active.md', '# a\n- [ ] open\n');
  put(r, 'backlog/archive.md', '# b\n- [x] done\n- [-] dropped\n');
  assert.deepEqual(validateBacklog(r), []);
});

test('backlog: a completed item in active.md and an open item in archive.md fail', () => {
  const r = tmp();
  put(r, 'backlog/active.md', '- [ ] open\n- [x] done\n- [-] dropped\n');
  put(r, 'backlog/archive.md', '- [ ] open\n');
  const out = validateBacklog(r).join('\n');
  assert.match(out, /active\.md:2: item marker \[x\]/);
  assert.match(out, /active\.md:3: item marker \[-\]/);
  assert.match(out, /archive\.md:1: item marker \[ \]/);
});

test('backlog: no other file and no check inside code fences', () => {
  const r = tmp();
  put(r, 'backlog/ideas.md', '- [ ] x\n');
  put(r, 'backlog/active.md', '```\n- [x] example\n```\n');
  const out = validateBacklog(r).join('\n');
  assert.match(out, /only active\.md and archive\.md/);
  assert.doesNotMatch(out, /active\.md:2/);
});

test('backlog: a missing backlog directory is not an error', () => {
  assert.deepEqual(validateBacklog(tmp()), []);
});

test('vocabulary: classes follow what a file is', () => {
  assert.equal(classify('x.md', doc({ id: 'a', type: 'audit', status: 'completed' })), 'historical');
  assert.equal(classify('x.md', doc({ id: 'a', type: 'spec', status: 'implemented' })), 'historical');
  assert.equal(classify('x.md', doc({ id: 'a', type: 'spec', status: 'approved' })), 'spec');
  assert.equal(classify('x.md', doc({ id: 'a', type: 'adr', status: 'superseded' })), 'historical');
  assert.equal(classify('x.md', doc({ id: 'a', type: 'adr', status: 'accepted' })), 'docs');
  assert.equal(classify('core/lib/a.sh', ''), 'code');
});

test('vocabulary: forbidden identifiers and the former product term are found', () => {
  const hits = (t) => scan('f.md', t, 'docs').map((x) => x.what);
  assert.ok(hits('mount at docs/.runtime/x').includes('former mount path'));
  assert.ok(hits('export RUNTIME_ROOT=1').includes('former variable'));
  assert.ok(hits('entity_ref runtime-agentic-layer').includes('former entity ref'));
  assert.ok(hits('the Runtime API').includes('former product term "runtime"'));
  assert.ok(hits('status: review').includes('review lifecycle status'));
  assert.ok(hits('draft → review → approved').includes('review lifecycle transition'));
  assert.ok(hits('docs/specs/review/a.md').includes('review lifecycle directory'));
});

test('vocabulary: consumer-domain terms and ordinary review are allowed', () => {
  const hits = (t) => scan('f.md', t, 'docs');
  assert.equal(hits('produces: runtime-ownership-report').length, 0);
  assert.equal(hits('reconstructs the runtime reality of a pipeline').length, 0);
  assert.equal(hits('architecture review → doc review → human').length, 0);
  assert.equal(hits('the code review of a PR').length, 0);
});

test('vocabulary: structural id references in frontmatter are not vocabulary', () => {
  assert.equal(scan('a.md', '---\nsupersedes: [adr-002-runtime-v1.2]\n---\n', 'docs').length, 0);
});

test('vocabulary: only adr-004-spec-lifecycle may use the removed review status', () => {
  const body = '---\nid: adr-004-spec-lifecycle\n---\nWas `draft → review → approved`.\n';
  assert.equal(scan('docs/adr/004.md', body, 'docs').length, 0);
  assert.equal(scan('docs/adr/009.md', body.replace('adr-004-spec-lifecycle', 'adr-009'), 'docs').length, 1);
});

test('vocabulary: run reports violations per class', () => {
  const r = tmp();
  put(r, 'core/a.sh', 'RUNTIME_ROOT=1\n');
  put(r, 'README.md', doc({ id: 'readme', type: 'guide', status: 'active', body: 'fine' }));
  put(r, 'docs/audits/a.md', doc({ id: 'a', type: 'audit', status: 'completed', body: 'Runtime was the old word' }));
  const { byClass, violations } = run(r);
  assert.equal(byClass.code, 1);
  assert.equal(byClass.historical, 1);
  assert.ok(violations.every((v) => v.cls === 'code'));
  assert.ok(violations.length >= 1);
});
