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
