// core/control/index.mjs — the Core SDK of the Control Plane (Execution Units and Records).
export { parse, stringify, YamlError } from './yaml.mjs';
export { STATES, TERMINAL, canTransition, legalTargets, isTerminal } from './states.mjs';
export { escalationKinds, resolveSop, sopVersion, loadRegistry, CONTROL_ROOT } from './registry.mjs';
export { validateUnit, validateRecord, RECORD_TYPES, EVIDENCE_CLASSES } from './schema.mjs';
export { createUnit, readUnit, listRecords, appendRecord, transitionUnit, executionRoot, unitDir, utc } from './store.mjs';
export {
  ready, start, resume, isStale, verifyStart, recordVerification, complete, cancel, redesign,
  updateDefinition, validateReady, computeFingerprint, discoverEnvironment, realityDrift, matchingDrift,
} from './ready.mjs';
export { openEscalation, resolveEscalation, escalations, openEscalations, defaultAutonomy, mustEscalate } from './escalation.mjs';
export { checkExecution, checkUnit, checkImmutability } from './consistency.mjs';
export { listUnitIds, unitView, projectStatus, projectExecutions, projectAttention, findEscalation, allEscalations } from './projection.mjs';
export { createExecution, nextExecutionId } from './execution.mjs';
