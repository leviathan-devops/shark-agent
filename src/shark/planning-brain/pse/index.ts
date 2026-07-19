/**
 * PSE Behavioral Loop Engine — Barrel Export
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md
 *
 * Public API for the Behavioral Loop Engine (Lobe 6).
 *
 * Architecture:
 *   behavioral-loop-engine.ts  — Main engine orchestrator
 *   pse-types.ts              — All type definitions + config
 *   tool-record-capture.ts    — Tool call capture + hashing
 *   loop-classifier.ts        — 6 loop type classifiers
 *   intervention-selector.ts  — Intervention selection + escalation
 *   progress-tracker.ts       — Filesystem progress measurement
 *   session-memory.ts         — Session pattern memory persistence
 *   psm-activation.ts         — PSM activation criteria
 */

// ─── Main Engine ───
export { ProblemSolvingEngine, createProblemSolvingEngine } from './behavioral-loop-engine.js';

// ─── Types ───
export type {
  ToolCategory,
  ToolCallRecord,
  LoopType,
  EscalationLevel,
  InterventionAction,
  Intervention,
  LoopTracker,
  InterventionRecord,
  SessionPatternMemory,
  ProgressSnapshot,
  ProgressDelta,
  LoopClassificationResult,
  ProblemSolvingEngineState,
  SerializedSessionMemory,
  ProblemSolvingEngineConfig,
} from './pse-types.js';

export { LOOP_TYPE_PRIORITY, DEFAULT_CONFIG, createConfig } from './pse-types.js';

// ─── Tool Record Capture ───
export {
  createToolCallRecord,
  categorizeToolForPSE,
  hashArgs,
  hashOutput,
  hashString,
  extractFilesTouched,
  extractPrimaryFilePath,
  estimateBytesWritten,
  detectOutputError,
  extractErrorSignature,
  hasCompletionClaim,
} from './tool-record-capture.js';

// ─── Loop Classifier (6 classifiers) ───
export {
  classifyExactRepeat,
  classifySemanticRepeat,
  classifyFailedApproachCycle,
  classifyScopeExpansion,
  classifyClaimWithoutProgress,
  classifyContextLoss,
  classifyAll,
} from './loop-classifier.js';

// ─── Intervention Selector ───
export {
  selectIntervention,
  generateInterventionMessage,
  generateRecommendedAction,
  computeEscalation,
  escalationToAction,
  dedupKey,
  hasBeenApplied,
  markApplied,
} from './intervention-selector.js';

// ─── Progress Tracker ───
export {
  ProgressTracker,
  extractTestPassRate,
  extractTodoCompleted,
  extractGateTransition,
} from './progress-tracker.js';

// ─── Session Memory ───
export {
  createSessionMemory,
  trackOccurrence,
  trackIntervention,
  markInterventionEffective,
  checkResolution,
  getLoopCounts,
  getInterventionHistory,
  wasEffective,
  getInterventionEffectiveness,
  serializeSessionMemory,
  deserializeSessionMemory,
  replaySessionMemory,
  persistSessionMemory,
} from './session-memory.js';

// ─── PSM Activation ───
export type { PSMActivationResult } from './psm-activation.js';
export {
  checkPSMActivation,
  generatePSMMessage,
  generateHardBlockMessage,
} from './psm-activation.js';
