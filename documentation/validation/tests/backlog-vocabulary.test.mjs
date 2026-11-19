import test from 'node:test';
import assert from 'node:assert/strict';
import { validate as validateBacklog } from '../validate-backlog.mjs';
import { classify, scan, run, FORMER as W } from '../validate-vocabulary.mjs';
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
  assert.ok(hits('mount at docs/.' + W + '/x').includes('former mount path'));
  assert.ok(hits('export ' + W.toUpperCase() + '_ROOT=1').includes('former variable'));
  assert.ok(hits('entity_ref ' + W + '-agentic-layer').includes('former entity ref'));
  assert.ok(hits('the ' + W[0].toUpperCase() + W.slice(1) + ' API').includes('former product term "' + W + '"'));
  assert.ok(hits('status: review').includes('review lifecycle status'));
  assert.ok(hits('draft → review → approved').includes('review lifecycle transition'));
  assert.ok(hits('docs/specs/review/a.md').includes('review lifecycle directory'));
});

test('vocabulary: consumer-domain terms and ordinary review are allowed', () => {
  const hits = (t) => scan('f.md', t, 'docs');
  assert.equal(hits('produces: ' + W + '-ownership-report').length, 0);
  assert.equal(hits('reconstructs the ' + W + ' reality of a pipeline').length, 0);
  assert.equal(hits('architecture review → doc review → human').length, 0);
  assert.equal(hits('the code review of a PR').length, 0);
});

test('vocabulary: structural id references in frontmatter are not vocabulary', () => {
  assert.equal(scan('a.md', '---\nsupersedes: [adr-002-' + W + '-v1.2]\n---\n', 'docs').length, 0);
});

test('vocabulary: only adr-004-spec-lifecycle may use the removed review status', () => {
  const body = '---\nid: adr-004-spec-lifecycle\n---\nWas `draft → review → approved`.\n';
  assert.equal(scan('docs/adr/004.md', body, 'docs').length, 0);
  assert.equal(scan('docs/adr/009.md', body.replace('adr-004-spec-lifecycle', 'adr-009'), 'docs').length, 1);
});

test('vocabulary: run reports violations per class', () => {
  const r = tmp();
  put(r, 'core/a.sh', W.toUpperCase() + '_ROOT=1\n');
  put(r, 'README.md', doc({ id: 'readme', type: 'guide', status: 'active', body: 'fine' }));
  put(r, 'docs/audits/a.md', doc({ id: 'a', type: 'audit', status: 'completed', body: '' + W[0].toUpperCase() + W.slice(1) + ' was the old word' }));
  const { byClass, violations } = run(r);
  assert.equal(byClass.code, 1);
  assert.equal(byClass.historical, 1);
  assert.ok(violations.every((v) => v.cls === 'code'));
  assert.ok(violations.length >= 1);
});

test('vocabulary: no file may name the old layout; only the move guide may name the removed review status', () => {
  const body = 'mount at docs/.' + W + '/x and .context/' + W + ', the ' + W[0].toUpperCase() + W.slice(1) + ' API';
  const guide = scan('g.md', doc({ id: 'guide-move-from-underboss', type: 'guide', status: 'active' }) + body, 'docs');
  assert.ok(guide.length >= 3);
  const other = scan('g.md', doc({ id: 'guide-other', type: 'guide', status: 'active' }) + body, 'docs');
  assert.ok(other.length >= 3);
  const review = 'the status: review of a Spec';
  assert.deepEqual(scan('g.md', doc({ id: 'guide-move-from-underboss', type: 'guide', status: 'active' }) + review, 'docs'), []);
  assert.ok(scan('g.md', doc({ id: 'guide-other', type: 'guide', status: 'active' }) + review, 'docs').length >= 1);
});

test('vocabulary: lockfiles and the project log are not scanned; a consumer is scanned only in its operational files', () => {
  const r = tmp();
  put(r, 'package-lock.json', '{"@edge-' + W + '/vm": "1"}\n');
  put(r, 'docs/LOG.md', doc({ id: 'log', type: 'guide', status: 'active', body: 'docs/.' + W + '/underboss' }));
  assert.equal(run(r).violations.length, 0);
  put(r, 'docs/.control/core/registry.yaml', 'control:\n  version: "3.0.0"\n');
  put(r, 'vercel.json', '{"' + W + '": "nodejs"}\n');
  put(r, 'docs/a.md', doc({ id: 'a', type: 'guide', status: 'active', body: 'the ' + W + ' layer' }));
  assert.deepEqual(run(r).violations.map((x) => x.path), ['docs/a.md']);
});

test('vocabulary: consumer allow-list literals are masked before the word test', () => {
  const hits = (t) => scan('f.md', t, 'docs', [W + '.read', '*/' + W + '', '*/' + W + '/*']);
  assert.equal(hits('gated by ' + W + '.read only').length, 0);
  assert.equal(hits('gated by ' + W + '.read and ' + W + '.update').length, 1); // .update is not in the list
  assert.equal(hits(`find . -not -path '*/${W}' -not -path '*/${W}/*'`).length, 0);
});

test('vocabulary: consumer allow-list never whitelists the structural bans', () => {
  const hits = (t) => scan('f.md', t, 'docs', [W, 'review']).map((x) => x.what);
  assert.ok(hits('mount at docs/.' + W + '/x').includes('former mount path'));
  assert.ok(hits('status: review').includes('review lifecycle status'));
});

test('vocabulary: run() loads .context/vocabulary.yml and skips the file itself', () => {
  const r = tmp();
  put(r, '.context/vocabulary.yml', 'allow:\n  - "' + W + '.read"\n');
  put(r, 'CLAUDE.md', 'gated by ' + W + '.read\n');
  const { violations } = run(r);
  assert.equal(violations.length, 0);
  put(r, 'AGENTS.md', 'gated by ' + W + '.update\n');
  assert.equal(run(r).violations.length, 1);
});

test('vocabulary: decision-records hold the owner\'s exact words and are not scanned (ADR-009)', async () => {
  const { skipped } = await import('../validate-vocabulary.mjs');
  assert.equal(skipped('docs/decisions/dec-1.md', true), true);
  assert.equal(skipped('docs/decisions\\dec-1.md', false), true);
  assert.equal(skipped('docs/decisions-notes.md', true), false);
  assert.equal(skipped('docs/adr/001.md', true), false);
});
