import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { validate } from '../validate-lifecycle.mjs';
import { tmp, put, doc, AC } from './helpers.mjs';

test('a spec whose status equals its directory passes (drafts -> draft)', () => {
  const r = tmp();
  put(r, 'specs/drafts/a.md', doc({ id: 'a', type: 'spec', status: 'draft', body: '# S' }));
  put(r, 'specs/approved/b.md', doc({ id: 'b', type: 'spec', status: 'approved', body: AC }));
  assert.deepEqual(validate(r, ''), []);
});

test('status != directory is an error', () => {
  const r = tmp();
  put(r, 'specs/drafts/a.md', doc({ id: 'a', type: 'spec', status: 'approved', body: AC }));
  assert.match(validate(r, '').join('\n'), /status 'approved' != path 'drafts'/);
});

test('the review directory and status do not exist', () => {
  const r = tmp();
  put(r, 'specs/review/a.md', doc({ id: 'a', type: 'spec', status: 'review', body: '# S' }));
  assert.match(validate(r, '').join('\n'), /not a Spec status directory/);
  const r2 = tmp();
  put(r2, 'specs/drafts/a.md', doc({ id: 'a', type: 'spec', status: 'review', body: '# S' }));
  assert.match(validate(r2, '').join('\n'), /is not draft\|approved\|implemented\|superseded/);
});

test('an approved spec requires Acceptance criteria with unique ids', () => {
  const r = tmp();
  put(r, 'specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', body: '# S\n\nno criteria' }));
  assert.match(validate(r, '').join('\n'), /requires '## Acceptance criteria'/);
  const r2 = tmp();
  put(r2, 'specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', body: `${AC}- **AC-001** again\n` }));
  assert.match(validate(r2, '').join('\n'), /duplicate Acceptance criteria/);
});

function repoWith(files) {
  const r = tmp('krok-git-');
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: r, stdio: 'ignore' });
  g('init', '-q', '.');
  for (const [p, c] of Object.entries(files)) put(r, p, c);
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  return { r, docs: join(r, 'docs') };
}

test('against a base ref: illegal transition, changed approved body, changed accepted ADR body', () => {
  const { r, docs } = repoWith({
    'docs/specs/approved/a.md': doc({ id: 'a', type: 'spec', status: 'approved', body: AC }),
    'docs/adr/001.md': doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nDecision.' }),
  });
  assert.deepEqual(validate(docs, 'HEAD'), []);

  put(r, 'docs/specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', body: AC.replace('works', 'changed') }));
  put(r, 'docs/adr/001.md', doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nChanged.' }));
  const out = validate(docs, 'HEAD').join('\n');
  assert.match(out, /body of a approved spec changed/);
  assert.match(out, /body of a accepted adr changed/);
});

test('against a base ref: status transitions and the Result section', () => {
  const { r, docs } = repoWith({
    'docs/specs/approved/a.md': doc({ id: 'a', type: 'spec', status: 'approved', body: `${AC}\n## Result\n` }),
    'docs/specs/implemented/z.md': doc({ id: 'z', type: 'spec', status: 'implemented', body: AC }),
  });
  // approved -> implemented, Result filled: legal
  put(r, 'docs/specs/implemented/a.md', doc({ id: 'a', type: 'spec', status: 'implemented', body: `${AC}\n## Result\ndone\n` }));
  execFileSync('git', ['rm', '-q', '-f', 'docs/specs/approved/a.md'], { cwd: r });
  // implemented -> draft: illegal
  put(r, 'docs/specs/drafts/z.md', doc({ id: 'z', type: 'spec', status: 'draft', body: AC }));
  execFileSync('git', ['rm', '-q', '-f', 'docs/specs/implemented/z.md'], { cwd: r });
  const out = validate(docs, 'HEAD').join('\n');
  assert.doesNotMatch(out, /transition approved -> implemented/);
  assert.match(out, /illegal spec transition implemented -> draft/);
});

test('an unresolvable base ref is an error', () => {
  const { docs } = repoWith({ 'docs/specs/drafts/a.md': doc({ id: 'a', type: 'spec', status: 'draft', body: '# S' }) });
  assert.match(validate(docs, 'no-such-ref').join('\n'), /cannot be resolved/);
});

test('track: an unknown value is an error; the default is code and needs nothing', () => {
  const r = tmp();
  put(r, 'specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', extra: 'track: prose\n', body: AC }));
  assert.match(validate(r, '').join('\n'), /track 'prose' is not code\|docs\|mixed/);
  const r2 = tmp();
  put(r2, 'specs/implemented/a.md', doc({ id: 'a', type: 'spec', status: 'implemented', body: AC }));
  assert.deepEqual(validate(r2, ''), []);
});

test('track docs: approved/implemented must name docs and carry no code', () => {
  const r = tmp();
  put(r, 'specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', extra: 'track: docs\n', body: AC }));
  assert.match(validate(r, '').join('\n'), /must name its documents in 'docs:'/);
  const r2 = tmp();
  put(r2, 'specs/approved/a.md', doc({ id: 'a', type: 'spec', status: 'approved', extra: 'track: docs\ndocs: [x.md]\ncode: [src/a.js]\n', body: AC }));
  assert.match(validate(r2, '').join('\n'), /a docs Spec has no 'code:'/);
});

test('track docs|mixed: implemented requires every named document to exist and reference the Spec id', () => {
  for (const track of ['docs', 'mixed']) {
    const r = tmp();
    const docs = join(r, 'docs');
    put(docs, 'specs/implemented/a.md', doc({ id: 'spec-a', type: 'spec', status: 'implemented', extra: `track: ${track}\ndocs: [docs/one.md, docs/two.md, docs/gone.md]\n`, body: AC }));
    put(docs, 'one.md', doc({ id: 'one', type: 'architecture', status: 'active', extra: 'refs: [spec-a]\n', body: '# one' }));
    put(docs, 'two.md', doc({ id: 'two', type: 'architecture', status: 'active', body: 'mentions spec-ab only' }));
    const out = validate(docs, '').join('\n');
    assert.doesNotMatch(out, /docs\/one\.md/);
    assert.match(out, /'docs\/two\.md' does not reference Spec id 'spec-a'/);
    assert.match(out, /'docs\/gone\.md' is not an existing file/);
  }
});

test('track docs: a fully propagated Spec passes in implemented/', () => {
  const r = tmp();
  const docs = join(r, 'docs');
  put(docs, 'specs/implemented/a.md', doc({ id: 'spec-a', type: 'spec', status: 'implemented', extra: 'track: docs\ndocs: [docs/one.md]\n', body: AC }));
  put(docs, 'one.md', doc({ id: 'one', type: 'architecture', status: 'active', extra: 'refs: [spec-a]\n', body: '# one' }));
  assert.deepEqual(validate(docs, ''), []);
});
