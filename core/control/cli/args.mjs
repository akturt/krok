// core/control/cli/args.mjs — argument parsing only. No framework, no dependencies.

export class UsageError extends Error {}

// An operation the command refuses on its own terms (not found, unsupported record type).
export class Refused extends Error {}

// A command declares its positional arguments and flags:
//   flags: { name: { required?: true, list?: true } }
// Global flags: --project <path>, --json. Every other flag must be declared.
export function parseArgs(argv, spec) {
  const out = { positional: [], flags: {}, json: false, project: null };
  const declared = spec.flags || {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`flag --${name} needs a value`);
      if (name === 'project') { out.project = value; continue; }
      if (!(name in declared)) throw new UsageError(`unknown flag --${name}`);
      if (name in out.flags) throw new UsageError(`flag --${name} given twice`);
      out.flags[name] = declared[name].list ? value.split(',').map((x) => x.trim()).filter(Boolean) : value;
      continue;
    }
    out.positional.push(a);
  }
  const names = spec.args || [];
  if (out.positional.length < names.length) throw new UsageError(`missing argument <${names[out.positional.length]}>`);
  if (out.positional.length > names.length) throw new UsageError(`unexpected argument '${out.positional[names.length]}'`);
  for (const [name, f] of Object.entries(declared)) if (f.required && !(name in out.flags)) throw new UsageError(`missing flag --${name}`);
  return out;
}
