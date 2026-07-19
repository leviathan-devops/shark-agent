/**
 * src/eie/index.ts — EIE Barrel Export
 *
 * The Engineering Intelligence Engine (EIE) — the 7th brain.
 * Exports the knowledge graph, core types, and (in later phases)
 * the context matcher, bullet generator, warhead generator, and
 * evidence verifier.
 */

// Core types
export type {
  KnowledgeCategory,
  AnalysisOrder,
  AuditLayer,
  Severity,
  MatchField,
  MatchOp,
  MatchCondition,
  AgentState,
  EngineFinding,
  EvidenceVerifyMethod,
  EvidenceSpec,
  EvidenceResult,
  KnowledgeSource,
  KnowledgeNode,
  WarheadPurpose,
  WarheadTriggerType,
  WarheadTrigger,
  EnforcementProfile,
  EnforcementConfig,
} from './types';

// Knowledge nodes
export {
  ALL_KNOWLEDGE_NODES,
  getNodeById,
  getNodesByCategory,
  getNodeCount,
} from './nodes';

// Re-export individual node arrays for targeted access
export { principles } from './nodes/principles';
export { ironLaws } from './nodes/iron-laws';
export { gateRequirements } from './nodes/gate-requirements';
export { antiPatterns } from './nodes/anti-patterns';

// ── Phase 2: Context Matcher + Progressive Disclosure + State Tracker ──

// Context Matcher (matchKnowledge, getNodesForGate — getNodeById and
// getNodesByCategory already exported from ./nodes above)
export { matchKnowledge, getNodesForGate } from './context-matcher';

// Progressive Disclosure
export {
  ProgressiveDisclosure,
  getProgressiveDisclosure,
  resetProgressiveDisclosure,
} from './progressive-disclosure';
export type { InjectionRecord, ProgressiveDisclosureState } from './progressive-disclosure';

// State Tracker
export { StateTracker, getStateTracker, resetStateTracker } from './state-tracker';

// ── Phase 3: Bullet Guidance System ────────────────────────────

// Bullet Generator (generateBullets, pushBulletsBeforeThrow, prepareBlockGuidance)
export {
  generateBullets,
  pushBulletsBeforeThrow,
  prepareBlockGuidance,
} from './bullet-generator';

// ── Phase 4: Warhead Guidance System ────────────────────────────

// Warhead Generator (generateWarhead, getLatestWarhead, cleanExpiredWarheads, estimateTokens)
export {
  generateWarhead,
  getLatestWarhead,
  cleanExpiredWarheads,
  estimateTokens,
} from './warhead-generator';

// ── Phase 5: Evidence Verifier ─────────────────────────────────

// Evidence Verifier (verifyEvidence, verifyEvidenceAsync)
export {
  verifyEvidence,
  verifyEvidenceAsync,
  detectEvidenceFromToolOutput,
} from './evidence-verifier';

// ── Phase 6: Gate Intelligence ─────────────────────────────────

// Gate Intelligence (gate entry/rejection warheads, evidence verification, bullets)
export {
  getGateEntryWarhead,
  generateGateRejectionWarhead,
  verifyGateEvidence,
  generateGateRejectionBullets,
} from './gate-intelligence';

// ── Phase 7: Intelligence Orchestrator ─────────────────────────

export {
  synthesize,
  generateTurnGuidance,
  buildCmeVerdict,
  IntelligenceOrchestrator,
  getIntelligenceOrchestrator,
  resetIntelligenceOrchestrator,
  wireBrainConsumer,
} from './intelligence-orchestrator';
export type { SynthesisInput, OrchestratorResult, CmeVerdict, OrchestratorState } from './intelligence-orchestrator';

// ── Phase 8: PSE Enhancement (Trident PSM + EIE) ──────────────

export {
  getLayerTemplate,
  validateLayerContent,
  createPSMState,
  advancePSMLayer,
  getPSMStatus,
  checkEvidenceValidity,
  shouldLockout,
  MAX_PSM_ITERATIONS,
} from './psm-pipeline';
export type { PSMState, PSMLayer, PSMLayerTemplate } from './psm-pipeline';

// ── Phase 9: Brain Coordination (FindingBus) ────────────────────

// Finding Bus — routes ALL engine findings to 4 consumers (Brain, Gate,
// KnowledgeGraph, SystemPrompt). SHA-256 dedup, severity promotion,
// 5000-finding capacity, Consumer Error Isolation.
export {
  FindingBus,
  getFindingBus,
  resetFindingBus,
  SEVERITY_RANK,
  MAX_FINDINGS,
} from './finding-bus';
export type {
  FindingSeverity,
  FindingEngine,
  FindingSource,
  FindingCategory,
  FindingEvidence,
  Finding,
  EmitInput,
  FindingConsumer,
  FindingBusState,
  ConsumerErrorRecord,
} from './finding-bus';

// ── Phase 10: Dynamic Guardrails + Claim-Reality + Derailment ──

export { computeEnforcementProfile, getConfig, shouldAnalyze } from './dynamic-guardrails';
export type { ProfileMetrics } from './dynamic-guardrails';
export { verifyClaimReality, snapshotDirectory } from './claim-reality';
export type { ClaimVerification } from './claim-reality';
export { detectDerailment, recoverFromDerailment } from './derailment-detector';
export type { DerailmentParams, DerailmentResult, RecoveryResult } from './derailment-detector';

// ── Phase 11: PSE Graduated Loop Escalation (spec §8) ─────────

export {
  trackPseOccurrence,
  getPseOccurrence,
  resetPseOccurrences,
  resetPseOccurrence,
  exportPseOccurrences,
  importPseOccurrences,
  mapLoopTypeToPatternId,
  getPatternName,
  generatePsmWarhead,
  applyPseGraduatedEscalation,
  getPseOccurrencesSnapshot,
} from './pse-loop-prevention';
export type { PseEscalationLevel, PseEscalationResult } from './pse-loop-prevention';

// eieBlock — canonical EIE block entry point
export { eieBlock } from './eie-block';
