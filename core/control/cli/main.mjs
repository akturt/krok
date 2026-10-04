#!/usr/bin/env node
// core/control/cli/main.mjs — Control Plane CLI: parse, resolve the project, dispatch, render.
//
// Exit codes: 0 success; 1 the operation was refused or failed (findings, illegal
// transition, not found); 2 usage error; 3 project or environment error.
// Output: human-readable by default; --json prints the deterministic projection.
import { pathToFileURL } from 'node:url';
import { parseArgs, UsageError, Refused } from './args.mjs';
import { resolveProject, ProjectError } from './project.mjs';
import { COMMANDS } from './commands.mjs';

export function usage() {
  const rows = Object.entries(COMMANDS).map(([key, c]) => {
    const args = (c.args || []).map((a) => `<${a}>`).join(' ');
    return `  underboss ${key}${args ? ` ${args}` : ''}${Object.keys(c.flags || {}).length ? ' [flags]' : ''}`.padEnd(52) + c.summary;
  });
  return ['usage: underboss <command> [--project <path>] [--json]', '', ...rows, '', 'Every command that changes state requires --actor <identity>.'].join('\n');
}

function commandKey(argv) {
  const [a, b] = argv;
  if (a === 'execution' || a === 'escalation') return b && !b.startsWith('--') ? { key: `${a} ${b}`, rest: argv.slice(2) } : { key: a, rest: argv.slice(1) };
  return { key: a, rest: argv.slice(1) };
}

export function main(argv, { cwd = process.cwd(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const wantsJson = argv.includes('--json');
  const fail = (code, message) => {
    if (wantsJson) out(`${JSON.stringify({ ok: false, code, error: message }, null, 2)}\n`);
    else err(`underboss: ${message}\n`);
    return code;
  };

  if (argv.length === 0) { err(`${usage()}\n`); return 2; }
  if (argv[0] === '--help' || argv[0] === 'help') { out(`${usage()}\n`); return 0; }

  try {
    const { key, rest } = commandKey(argv);
    const command = COMMANDS[key];
    if (!command) throw new UsageError(`unknown command '${argv.filter((a) => !a.startsWith('--')).slice(0, 2).join(' ')}'`);
    const parsed = parseArgs(rest, command);
    const root = resolveProject({ project: parsed.project, cwd });
    const result = command.run({ root, args: parsed.positional, flags: parsed.flags });
    out(`${parsed.json ? JSON.stringify(result.data, null, 2) : result.text}\n`);
    return result.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) return fail(2, e.message);
    if (e instanceof ProjectError) return fail(3, e.message);
    if (e instanceof Refused) return fail(1, e.message);
    return fail(1, e.message);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
