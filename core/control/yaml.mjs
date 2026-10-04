// core/control/yaml.mjs — restricted YAML subset: reader and deterministic writer.
//
// Grammar: block mappings, block sequences (of scalars or mappings), scalars,
// and flow sequences of scalars ([a, b]) / empty flow collections ([] and {}).
// No anchors, no multi-line scalars, no flow mappings with content, no
// trailing comments (a comment is a whole line starting with #).
// The reader is shared with sops/planner.mjs. The writer emits block style
// only, in the key order of the given object, so output is deterministic.
//
// Zero dependencies.

const KEY = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:\s+(.*))?$/;

export class YamlError extends Error {}

export function parse(text) {
  const lines = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '' || raw.trim().startsWith('#')) return;
    if (/^---\s*$/.test(raw)) return;
    if (/\t/.test(raw.slice(0, raw.search(/\S/)))) throw new YamlError(`line ${i + 1}: tab indentation`);
    lines.push({ n: i + 1, indent: raw.search(/\S/), text: raw.trim() });
  });
  if (lines.length === 0) return {};
  const ctx = { lines, pos: 0 };
  const value = block(ctx, lines[0].indent);
  if (ctx.pos < lines.length) throw new YamlError(`line ${lines[ctx.pos].n}: unexpected indentation`);
  return value;
}

function block(ctx, indent) {
  const first = ctx.lines[ctx.pos];
  return first.text === '-' || first.text.startsWith('- ') ? sequence(ctx, indent) : mapping(ctx, indent);
}

function mapping(ctx, indent, seed) {
  const obj = seed || {};
  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new YamlError(`line ${ln.n}: unexpected indentation`);
    if (ln.text === '-' || ln.text.startsWith('- ')) break;
    const m = KEY.exec(ln.text);
    if (!m) throw new YamlError(`line ${ln.n}: expected "key: value"`);
    const [, key, rest] = m;
    if (key in obj) throw new YamlError(`line ${ln.n}: duplicate key "${key}"`);
    ctx.pos++;
    if (rest !== undefined && rest !== '') {
      obj[key] = scalarOrFlow(rest, ln.n);
    } else {
      const next = ctx.lines[ctx.pos];
      if (next && (next.indent > indent || (next.indent === indent && (next.text === '-' || next.text.startsWith('- '))))) {
        obj[key] = block(ctx, next.indent);
      } else {
        obj[key] = null;
      }
    }
  }
  return obj;
}

function sequence(ctx, indent) {
  const arr = [];
  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new YamlError(`line ${ln.n}: unexpected indentation`);
    if (!(ln.text === '-' || ln.text.startsWith('- '))) break;
    const rest = ln.text === '-' ? '' : ln.text.slice(2).trim();
    ctx.pos++;
    const m = KEY.exec(rest);
    if (m && !/^["']/.test(rest)) {
      // inline mapping start; continuation keys sit at indent + 2
      const item = {};
      const [, key, val] = m;
      const itemIndent = indent + 2;
      if (val !== undefined && val !== '') item[key] = scalarOrFlow(val, ln.n);
      else {
        const next = ctx.lines[ctx.pos];
        item[key] = next && next.indent > itemIndent ? block(ctx, next.indent) : null;
      }
      arr.push(mapping(ctx, itemIndent, item));
    } else if (rest === '') {
      const next = ctx.lines[ctx.pos];
      arr.push(next && next.indent > indent ? block(ctx, next.indent) : null);
    } else {
      arr.push(scalarOrFlow(rest, ln.n));
    }
  }
  return arr;
}

function scalarOrFlow(v, n) {
  if (v === '[]') return [];
  if (v === '{}') return {};
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new YamlError(`line ${n}: unterminated flow sequence`);
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner, n).map((s) => scalar(s.trim(), n));
  }
  if (v.startsWith('{')) throw new YamlError(`line ${n}: flow mappings are not supported`);
  if (/^[&*!|>]/.test(v)) throw new YamlError(`line ${n}: anchors, tags and block scalars are not supported`);
  return scalar(v, n);
}

function splitFlow(s, n) {
  const out = [];
  let cur = '';
  let q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (q) throw new YamlError(`line ${n}: unterminated quote`);
  out.push(cur);
  return out;
}

function scalar(v, n) {
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new YamlError(`line ${n}: unterminated string`);
    return v.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', '\\': '\\', n: '\n', t: '\t' })[c]);
  }
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) throw new YamlError(`line ${n}: unterminated string`);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?(0|[1-9][0-9]*)$/.test(v)) return Number(v);
  return v;
}

// ---------- writer ----------

export function stringify(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new YamlError('the document root must be a mapping');
  }
  return emitMapping(value, 0).join('\n') + '\n';
}

function emitMapping(obj, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!KEY.test(`${k}:`)) throw new YamlError(`invalid key "${k}"`);
    if (v === undefined) throw new YamlError(`undefined value for key "${k}"`);
    if (v === null) out.push(`${pad}${k}:`);
    else if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${pad}${k}: []`);
      else { out.push(`${pad}${k}:`); out.push(...emitSequence(v, indent + 2)); }
    } else if (typeof v === 'object') {
      if (Object.keys(v).length === 0) out.push(`${pad}${k}: {}`);
      else { out.push(`${pad}${k}:`); out.push(...emitMapping(v, indent + 2)); }
    } else out.push(`${pad}${k}: ${emitScalar(v)}`);
  }
  return out;
}

function emitSequence(arr, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const v of arr) {
    if (v === null) out.push(`${pad}- null`);
    else if (Array.isArray(v)) throw new YamlError('nested sequences are not supported');
    else if (typeof v === 'object') {
      const entries = emitMapping(v, indent + 2);
      if (entries.length === 0) throw new YamlError('empty mapping in a sequence');
      entries[0] = `${pad}- ${entries[0].slice(indent + 2)}`;
      out.push(...entries);
    } else out.push(`${pad}- ${emitScalar(v)}`);
  }
  return out;
}

function emitScalar(v) {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new YamlError('only integers are supported');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v !== 'string') throw new YamlError(`unsupported scalar type ${typeof v}`);
  const reserved = /^(null|true|false|~|-?(0|[1-9][0-9]*))$/.test(v);
  if (!reserved && /^[A-Za-z0-9_./][A-Za-z0-9_./:+=@-]*$/.test(v) && !v.endsWith(':')) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}
