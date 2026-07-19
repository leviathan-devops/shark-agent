/**
 * ICE Intent Classification Engine — barrel exports.
 * =================================================================
 *
 * Public surface of the intent-engine module. Import everything from here:
 *
 *   import { IntentEngine } from './intent-engine/index.js';
 */

// ─── Engine ────────────────────────────────────────────────────────────────
export { IntentEngine } from './intent-engine.js';

// ─── Frame matcher + default frames ────────────────────────────────────────
export { FrameMatcher, buildDefaultFrames } from './frame-matcher.js';

// ─── Construct builder ─────────────────────────────────────────────────────
export { CodeConstructBuilder, ALL_KINDS } from './construct-builder.js';

// ─── Rules + confidence + blind spots ──────────────────────────────────────
export {
  IntentRuleEngine,
  ConfidenceCalculator,
  compileBlindSpots,
  detectGeneratedCode,
} from './intent-rules.js';
export type { RuleContext } from './intent-rules.js';

// ─── Types ─────────────────────────────────────────────────────────────────
export type {
  SemanticRole,
  GateType,
  IntentSeverity,
  IntentAction,
  DangerLevel,
  MatchQuality,
  AnalysisDepth,
  IntentCategory,
  OperationType,
  CodeConstructKind,
  ConstructProperties,
  CodeConstruct,
  FrameSlot,
  VerbFrame,
  FrameMatch,
  InferredIntent,
  IntentFinding,
  BlindSpotReport,
  IntentReport,
  ConfidenceInput,
} from './intent-types.js';
