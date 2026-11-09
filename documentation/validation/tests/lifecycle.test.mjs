import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { validate } from '../validate-lifecycle.mjs';
import { tmp, put, doc, AC, REPO } from './helpers.mjs';

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

test('against a base ref: changed implemented body, changed accepted ADR body', () => {
  const { r, docs } = repoWith({
    'docs/specs/implemented/a.md': doc({ id: 'a', type: 'spec', status: 'implemented', body: AC }),
    'docs/adr/001.md': doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nDecision.' }),
  });
  assert.deepEqual(validate(docs, 'HEAD'), []);

  put(r, 'docs/specs/implemented/a.md', doc({ id: 'a', type: 'spec', status: 'implemented', body: AC.replace('works', 'changed') }));
  put(r, 'docs/adr/001.md', doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nChanged.' }));
  const out = validate(docs, 'HEAD').join('\n');
  assert.match(out, /body of a implemented spec changed/);
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

// ---------- ADR-008: an approved Spec may be edited; it is reopened as a draft meanwhile ----------

const APPROVED = (body = AC) => doc({ id: 'a', type: 'spec', status: 'approved', body });
const DRAFT = (body) => doc({ id: 'a', type: 'spec', status: 'draft', body });
const gitIn = (r, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: r, stdio: 'ignore' });

test('approved -> approved with a changed body: no error, one warning', () => {
  const { r, docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED() });
  put(r, 'docs/specs/approved/a.md', APPROVED(AC.replace('works', 'changed')));
  const warnings = [];
  assert.deepEqual(validate(docs, 'HEAD', warnings), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /body of an approved spec changed against HEAD; set it to draft/);
  assert.match(warnings[0], /ADR-008/);
});

test('approved -> approved unchanged: neither error nor warning; the collector is optional', () => {
  const { docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED() });
  const warnings = [];
  assert.deepEqual(validate(docs, 'HEAD', warnings), []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(validate(docs, 'HEAD'), []);
});

test('approved -> draft with a changed body: neither error nor warning, the transition is legal', () => {
  const { r, docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED() });
  gitIn(r, 'rm', '-q', '-f', 'docs/specs/approved/a.md');
  put(r, 'docs/specs/drafts/a.md', DRAFT(AC.replace('works', 'changed')));
  const warnings = [];
  assert.deepEqual(validate(docs, 'HEAD', warnings), []);
  assert.deepEqual(warnings, []);
});

test('draft -> approved after edits: Acceptance criteria are still required', () => {
  const { r, docs } = repoWith({ 'docs/specs/drafts/a.md': DRAFT('# S\n\nedited') });
  gitIn(r, 'rm', '-q', '-f', 'docs/specs/drafts/a.md');
  put(r, 'docs/specs/approved/a.md', APPROVED('# S\n\nedited'));
  assert.match(validate(docs, 'HEAD').join('\n'), /requires '## Acceptance criteria'/);
  put(r, 'docs/specs/approved/a.md', APPROVED(AC));
  assert.deepEqual(validate(docs, 'HEAD'), []);
});

test('the whole cycle against the original base: edited and re-approved is a warning, not an error', () => {
  const { r, docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED() });
  put(r, 'docs/specs/drafts/.gitkeep', '');
  gitIn(r, 'mv', 'docs/specs/approved/a.md', 'docs/specs/drafts/a.md');
  put(r, 'docs/specs/drafts/a.md', DRAFT(AC.replace('works', 'changed')));
  gitIn(r, 'add', '-A');
  gitIn(r, 'commit', '-q', '-m', 'reopen');
  put(r, 'docs/specs/approved/.gitkeep', '');
  gitIn(r, 'mv', 'docs/specs/drafts/a.md', 'docs/specs/approved/a.md');
  put(r, 'docs/specs/approved/a.md', APPROVED(AC.replace('works', 'changed')));
  const warnings = [];
  assert.deepEqual(validate(docs, 'HEAD~1', warnings), []);
  assert.equal(warnings.length, 1);
});

test('approved -> implemented: only the Result section is free, any other body change is an error', () => {
  const { r, docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED(`${AC}\n## Result\n`) });
  gitIn(r, 'rm', '-q', '-f', 'docs/specs/approved/a.md');
  const impl = (body) => doc({ id: 'a', type: 'spec', status: 'implemented', body });
  put(r, 'docs/specs/implemented/a.md', impl(`${AC}\n## Result\ndone\n`));
  assert.deepEqual(validate(docs, 'HEAD'), []);
  put(r, 'docs/specs/implemented/a.md', impl(`${AC.replace('works', 'changed')}\n## Result\ndone\n`));
  assert.match(validate(docs, 'HEAD').join('\n'), /body of a approved spec changed/);
});

test('implemented and superseded stay immutable', () => {
  const { r, docs } = repoWith({
    'docs/specs/implemented/i.md': doc({ id: 'i', type: 'spec', status: 'implemented', body: AC }),
    'docs/specs/superseded/s.md': doc({ id: 's', type: 'spec', status: 'superseded', body: AC }),
  });
  put(r, 'docs/specs/implemented/i.md', doc({ id: 'i', type: 'spec', status: 'implemented', body: AC.replace('works', 'x') }));
  put(r, 'docs/specs/superseded/s.md', doc({ id: 's', type: 'spec', status: 'superseded', body: AC.replace('works', 'x') }));
  const warnings = [];
  const out = validate(docs, 'HEAD', warnings).join('\n');
  assert.match(out, /body of a implemented spec changed/);
  assert.match(out, /body of a superseded spec changed/);
  assert.deepEqual(warnings, []);
});

test('implemented -> draft is still an illegal transition', () => {
  const { r, docs } = repoWith({ 'docs/specs/implemented/a.md': doc({ id: 'a', type: 'spec', status: 'implemented', body: AC }) });
  gitIn(r, 'rm', '-q', '-f', 'docs/specs/implemented/a.md');
  put(r, 'docs/specs/drafts/a.md', DRAFT(AC));
  assert.match(validate(docs, 'HEAD').join('\n'), /illegal spec transition implemented -> draft/);
});

test('an accepted ADR with a changed body is still an error, never a warning', () => {
  const { r, docs } = repoWith({ 'docs/adr/001.md': doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nDecision.' }) });
  put(r, 'docs/adr/001.md', doc({ id: 'adr-1', type: 'adr', status: 'accepted', body: '# ADR\n\nChanged.' }));
  const warnings = [];
  assert.match(validate(docs, 'HEAD', warnings).join('\n'), /body of a accepted adr changed/);
  assert.deepEqual(warnings, []);
});

test('the CLI prints WARNING (and ::warning:: in GitHub Actions) and still exits 0', () => {
  const { r, docs } = repoWith({ 'docs/specs/approved/a.md': APPROVED() });
  put(r, 'docs/specs/approved/a.md', APPROVED(AC.replace('works', 'changed')));
  const script = join(REPO, 'documentation', 'validation', 'validate-lifecycle.mjs');
  const run = (extra) => spawnSync('node', [script, docs], { encoding: 'utf8', env: { ...process.env, BASE_REF: 'HEAD', ...extra } });
  const plain = run({ GITHUB_ACTIONS: '' });
  assert.equal(plain.status, 0, plain.stdout);
  assert.match(plain.stdout, /^WARNING: .*body of an approved spec changed/m);
  assert.doesNotMatch(plain.stdout, /::warning::/);
  const ci = run({ GITHUB_ACTIONS: 'true' });
  assert.equal(ci.status, 0);
  assert.match(ci.stdout, /^::warning::.*body of an approved spec changed/m);
});
