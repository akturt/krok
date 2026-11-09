// Tests of the agent registration checks: name + description for Claude Code, no BOM, Registry in both directions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, tmp } from './helpers.mjs';

const P = (p) => p.split('\\').join('/');

// A control root with the product directories; agents are replaced per test.
function control() {
  const root = tmp('krok-agents-');
  for (const d of ['core', 'documentation', 'knowledge', 'agents', 'sops', 'docs', 'engine', 'bootstrap', 'playbook']) {
    cpSync(join(REPO, d), join(root, d), { recursive: true });
  }
  return root;
}

const agentFile = (root, name) => join(root, 'agents', 'claude-code', `${name}.md`);
const rewrite = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
// the per-file agent checks only: fast, no registry
const files = (root) => {
  const r = spawnSync('node', [join(REPO, 'documentation', 'validation', 'integrity-docs.mjs'), root], { encoding: 'utf8', input: '' });
  return { status: /^ERROR: Agent /m.test(r.stdout) ? 1 : 0, stdout: r.stdout };
};
const integrity = (root) =>
  spawnSync('bash', [P(join(root, 'documentation', 'validation', 'validate-integrity.sh')), P(root)], { encoding: 'utf8' });

test('the product agents pass the registration checks', () => {
  const r = integrity(control());
  assert.equal(r.status, 0, r.stdout);
});

test('every Claude Code agent has name equal to its file, a description and no BOM', () => {
  const dir = join(REPO, 'agents', 'claude-code');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 7);
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.notEqual(text.charCodeAt(0), 0xfeff, `${f} starts with a BOM`);
    assert.match(text, new RegExp(`^name: ${f.slice(0, -3)}\\r?$`, 'm'), `${f} name`);
    assert.match(text, /^description: \S/m, `${f} description`);
  }
});

test('an agent without name is an error', () => {
  const root = control();
  rewrite(agentFile(root, 'reality-auditor'), (t) => t.replace(/^name: .*\r?\n/m, ''));
  const r = files(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Agent 'reality-auditor' has no name: field/);
});

test('an agent whose name differs from the file name is an error', () => {
  const root = control();
  rewrite(agentFile(root, 'reality-auditor'), (t) => t.replace(/^name: .*$/m, 'name: someone-else'));
  const r = files(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /name: 'someone-else' does not equal the file name/);
});

test('an empty description is an error, a quoted empty one too', () => {
  for (const empty of ['description:', 'description: ""']) {
    const root = control();
    rewrite(agentFile(root, 'reality-auditor'), (t) => t.replace(/^description: .*$/m, empty));
    const r = files(root);
    assert.equal(r.status, 1, empty);
    assert.match(r.stdout, /Agent 'reality-auditor' has no description/);
  }
});

test('a BOM before the frontmatter is an error', () => {
  const root = control();
  rewrite(agentFile(root, 'reality-auditor'), (t) => '\ufeff' + t);
  const r = files(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Agent 'reality-auditor' starts with a BOM/);
});

test('an agent file that is not in the Registry is an error, in both platforms', () => {
  const root = control();
  cpSync(agentFile(root, 'reality-auditor'), agentFile(root, 'stray-agent'));
  rewrite(agentFile(root, 'stray-agent'), (t) => t.replace(/^name: .*$/m, 'name: stray-agent'));
  cpSync(join(root, 'agents', 'opencode', 'reality-auditor.md'), join(root, 'agents', 'opencode', 'stray-too.md'));
  const r = integrity(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Agent file 'agents\/claude-code\/stray-agent\.md' is not in the Registry/);
  assert.match(r.stdout, /Agent file 'agents\/opencode\/stray-too\.md' is not in the Registry/);
});

test('removing an agent from the Registry fails the reverse check', () => {
  const root = control();
  rewrite(join(root, 'core', 'registry.yaml'), (t) => t.replace(/^ {4}- name: frontend-contract-auditor\r?\n/m, ''));
  const r = integrity(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Agent file 'agents\/claude-code\/frontend-contract-auditor\.md' is not in the Registry/);
});

test('the frontend-contract-auditor is read-only and has its capability', () => {
  const t = readFileSync(agentFile(REPO, 'frontend-contract-auditor'), 'utf8');
  assert.match(t, /^tools: Read, Grep, Glob, Bash\r?$/m);
  assert.match(t, /^capabilities: \[review-frontend-contracts\]/m);
  assert.match(readFileSync(join(REPO, 'knowledge', 'capabilities.md'), 'utf8'), /^## review-frontend-contracts/m);
  assert.doesNotMatch(t, /\bWrite\b|\bEdit\b.*tools/);
});
