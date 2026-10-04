// core/control/states.mjs — Execution Unit states and transitions (v3 Spec §4.3).

export const STATES = ['DESIGN', 'READY', 'EXECUTING', 'VERIFYING', 'BLOCKED', 'DONE', 'CANCELLED'];
export const TERMINAL = ['DONE', 'CANCELLED'];

const EDGES = {
  DESIGN: ['READY'],
  READY: ['DESIGN', 'EXECUTING'],
  EXECUTING: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['DONE', 'EXECUTING', 'BLOCKED'],
  BLOCKED: ['EXECUTING', 'DESIGN'],
  DONE: [],
  CANCELLED: [],
};
// any non-terminal -> CANCELLED
for (const s of STATES) if (!TERMINAL.includes(s)) EDGES[s] = [...EDGES[s], 'CANCELLED'];

export function legalTargets(from) {
  return EDGES[from] ? [...EDGES[from]] : [];
}

export function canTransition(from, to) {
  return legalTargets(from).includes(to);
}

export function isTerminal(state) {
  return TERMINAL.includes(state);
}
