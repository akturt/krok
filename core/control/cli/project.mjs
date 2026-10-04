// core/control/cli/project.mjs — resolving the project root. No fallback.
//
//   --project <path>   explicit project root
//   otherwise          git rev-parse --show-toplevel of the current directory
//   not a git checkout, or no .context/project.yml  -> explicit error
//
// CONTROL_ROOT (Registry, SOPs, Reality Engine) is a separate concern: it comes from
// where the control layer is installed, with an environment override.
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export class ProjectError extends Error {}

export function resolveProject({ project, cwd }) {
  let root;
  if (project) {
    root = resolve(cwd, project);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new ProjectError(`project root '${project}' is not a directory`);
  } else {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new ProjectError(`'${cwd}' is not inside a git repository; run from a project or pass --project <path>`);
    root = r.stdout.trim();
  }
  if (!existsSync(join(root, '.context', 'project.yml'))) throw new ProjectError(`'${root}' has no .context/project.yml`);
  return root;
}
