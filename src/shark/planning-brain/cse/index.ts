/**
 * CSE (Common Sense Engine) — Barrel Export
 * File: src/shark/planning-brain/cse/index.ts
 *
 * Verification Engine for Shark Agent v5 — Behavioral Intelligence.
 * Implements V-1 through V-5 rules for claim-reality verification.
 *
 * Bible Principle: "Did you VERIFY what you claimed?"
 */

// Main engine
export { CommonSenseEngine } from './verification-engine.js';

// Sub-engines
export { EvidenceValidator } from './evidence-validator.js';
export { ClaimVerifier } from './claim-verifier.js';
export { PatternMemoryEngine } from './pattern-memory.js';
export { PreflightRunner } from './preflight-runner.js';
export { BlindSpotReporter } from './blind-spot-reporter.js';

// Types
export type {
  AgentClaim,
  CandidateClaim,
  ClaimType,
  ClaimSource,
  ClaimVerdict,
  ClaimVerification,
  GatePhase,
  SessionWindow,
  ToolCall,
  // Evidence types
  EvidenceVerification,
  EvidenceProvenance,
  ContentCheck,
  ContentCheckFailure,
  CheckResult,
  CheckSeverity,
  // Verification types
  VerificationFact,
  FactSupport,
  PreflightAlignment,
  PreflightEffect,
  VerificationPredicate,
  // Behavioral types
  PatternHistory,
  PatternEvidence,
  DetectedPattern,
  DerailmentMatch,
  DerailmentTemplate,
  BehavioralCondition,
  BehavioralConditionField,
  BehavioralConditionOperator,
  BehavioralAssessment,
  // Preflight types
  PreflightGrounding,
  BuildStatus,
  TscError,
  // Blind spot types
  BlindSpotReport,
  BiasWarning,
  BiasWarningType,
  ExpectedFile,
  // Verdict types
  VerificationVerdict,
  OverallVerdict,
  EnforcementAction,
} from './cse-types.js';

// Constants
export {
  CHECK_WEIGHTS,
  CHECK_SEVERITY,
  DEFAULT_STALENESS_TOLERANCE,
  PASS_RATE_THRESHOLD,
  MIN_VALID_CONFIDENCE,
  EXPECTED_EVIDENCE,
} from './cse-types.js';
