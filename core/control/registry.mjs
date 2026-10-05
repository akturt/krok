// core/control/registry.mjs — reads the Registry (core/registry.yaml), the SSOT
// for vocabulary lists. The Escalation vocabulary is defined only there.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './yaml.mjs';

// CONTROL_ROOT is where Krok itself lives (the Registry, SOPs, the Reality Engine):
// the product repository, or docs/.control/ in a consumer. It is derived from this file,
// like core/lib/api.sh does. The project root is a separate argument of the SDK functions.
export const CONTROL_ROOT = process.env.CONTROL_ROOT
  ? resolve(process.env.CONTROL_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const cache = new Map();

export function loadRegistry() {
  const file = join(CONTROL_ROOT, 'core', 'registry.yaml');
  if (!existsSync(file)) throw new Error(`registry not found: ${file}`);
  const text = readFileSync(file, 'utf8');
  const hit = cache.get(file);
  if (hit && hit.text === text) return hit.value;
  const value = parse(text);
  cache.set(file, { text, value });
  return value;
}

export function escalationKinds() {
  const kinds = loadRegistry()?.vocabularies?.escalation_kinds;
  if (!Array.isArray(kinds) || kinds.length === 0) throw new Error('registry: vocabularies.escalation_kinds is missing');
  return kinds;
}

// A SOP resolves when the Registry lists its name and the SOP file carries the version.
export function resolveSop(name, version) {
  const names = loadRegistry()?.components?.sops || [];
  if (!names.includes(name)) return { ok: false, reason: `SOP '${name}' is not registered` };
  const file = join(CONTROL_ROOT, 'sops', `${name}.yaml`);
  if (!existsSync(file)) return { ok: false, reason: `SOP file sops/${name}.yaml not found` };
  const sop = parse(readFileSync(file, 'utf8'));
  if (sop.version !== version) return { ok: false, reason: `SOP '${name}' has version ${sop.version}, unit requires ${version}` };
  return { ok: true, sop };
}

// The version a registered SOP carries.
export function sopVersion(name) {
  const names = loadRegistry()?.components?.sops || [];
  if (!names.includes(name)) throw new Error(`SOP '${name}' is not registered`);
  const file = join(CONTROL_ROOT, 'sops', `${name}.yaml`);
  if (!existsSync(file)) throw new Error(`SOP file sops/${name}.yaml not found`);
  const v = parse(readFileSync(file, 'utf8')).version;
  if (!Number.isInteger(v)) throw new Error(`SOP '${name}' has no integer version`);
  return v;
}
