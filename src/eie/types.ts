/**
 * src/eie/types.ts — Core EIE Type Definitions
 *
 * The Engineering Intelligence Engine (EIE) is the 7th brain.
 * These types define the knowledge graph, context matcher,
 * bullet guidance, warhead guidance, and evidence verification
 * subsystems.
 *
 * Distilled from EIE_DESIGN_SPEC.md and 67,400+ lines of
 * warhead-grade engineering knowledge across 3 libraries.
 */

// ── Knowledge Node Categories ───────────────────────────────────

export type KnowledgeCategory =
  | 'analysis-order'
  | 'iron-law'
  | 'principle'
  | 'gate-requirement'
  | 'failure-pattern'
  | 'anti-pattern'
  | 'fix-pattern'
  | 'enforcement'
  | 'testing'
  | 'architecture'
  | 'typescript'
  | 'concurrency'
  | 'async-concurrency'
  | 'persistence'
  | 'security'
  | 'build-order'
  | 'nlp-component'
  | 'gate-knowledge'
  | 'error-recovery'
  | 'domain-specific'
  | 'data-validation'
  | 'docker-container'
  | 'ci-cd-pipeline'
  | 'llm-agent-runtime';

/** Analysis Order (from the Runtime Grade Bible §1) — 0 through 5. */
export type AnalysisOrder = 0 | 1 | 2 | 3 | 4 | 5;

/** Audit Pipeline Layer (L0-L5). */
export type AuditLayer = 0 | 1 | 2 | 3 | 4 | 5;

/** Severity classification for enforcement decisions. */
export type Severity = 'block' | 'warn' | 'guide';

// ── Context Matcher ─────────────────────────────────────────────

/** Match field identifier for the context matcher condition graph. */
export type MatchField =
  | 'gate'
  | 'toolName'
  | 'fileType'
  | 'codePattern'
  | 'engine'
  | 'loopType'
  | 'driftLevel'
  | 'evidenceId'
  | 'errorPattern'
  | 'gateTransition'
  | 'phase'
  | 'codeConstruct';

/** Match operator for the condition graph. */
export type MatchOp =
  | 'equals'
  | 'in'
  | 'exists'
  | 'matches'
  | 'code-path';

/** A single match condition evaluated against AgentState. */
export interface MatchCondition {
  field: MatchField;
  op: MatchOp;
  value: unknown;
}

/** Agent state observed by the context matcher on every tool call. */
export interface AgentState {
  gate: string;
  toolName: string;
  filePath?: string;
  fileType?: 'ts' | 'js' | 'md' | 'json' | 'other';
  engineFindings: EngineFinding[];
  loopType?: string;
  driftLevel?: number;
  evidenceRegistered: string[];
  errorPattern?: string;
  gateTransition?: string;
  phase: 'pre-execution' | 'post-execution' | 'gate-evaluation';
  currentFunction?: string;
  currentLine?: number;
  retryCount?: number;
  successRate?: number;
}

/** A finding from one of the 6 brains (SF, SRE, RGE, CSE, CME, PSE, ICE). */
export interface EngineFinding {
  engine: 'SRE' | 'ICE' | 'RGE' | 'CSE' | 'CME' | 'PSE' | 'SF' | 'NLP';
  ruleId: string;
  severity: string;
  message: string;
  file?: string;
  line?: number;
}

// ── Evidence Verification ───────────────────────────────────────

/** The 11 evidence verification methods (EIE §7). */
export type EvidenceVerifyMethod =
  | 'exec-tsc'
  | 'exec-build'
  | 'rge-audit'
  | 'sre-audit'
  | 'fs-check'
  | 'spec-read'
  | 'test-run'
  | 'gate-chain'
  | 'diff-check'
  | 'container-tui-test'
  | 'claim-reality';

/** Specification for how evidence should be verified. */
export interface EvidenceSpec {
  id: string;
  verify: EvidenceVerifyMethod;
  params?: Record<string, unknown>;
  minQuality: number;
}

/** Result from evidence verification. */
export interface EvidenceResult {
  passed: boolean;
  quality: number;
  reason: string;
  evidence?: Record<string, unknown>;
}

// ── Knowledge Node ──────────────────────────────────────────────

/** The knowledge source library. */
export type KnowledgeSource = 'alg-sys' | 'rg-standards' | 'ts-deep';

/**
 * KnowledgeNode — the core data structure of the EIE knowledge graph.
 *
 * Each node carries COMPLETE distilled text (never summaries).
 * The graph is 1000+ nodes with full cross-reference topology.
 */
export interface KnowledgeNode {
  id: string;
  source: KnowledgeSource;
  sourceFile: string;
  category: KnowledgeCategory;
  ironLaw?: string;
  principle?: string;
  analysisOrder?: AnalysisOrder;
  rule: string;
  detectionMethod: string;
  fixTemplate: string;
  conditions: MatchCondition[];
  bulletTemplate: string;
  warheadTemplate: string;
  evidenceSpec?: EvidenceSpec;
  severity: Severity;
  layer: AuditLayer;
  links: string[];
  selfVerified: boolean;
}

// ── Warhead Guidance System ─────────────────────────────────────

/** Warhead purpose — triple duty. */
export type WarheadPurpose = 'thinking' | 'remembering' | 'orienting';

/** Trigger types that activate warhead generation. */
export type WarheadTriggerType =
  | 'gate-rejection'
  | 'gate-entry'
  | 'psm-activation'
  | 'enforcement-block'
  | 'error-encountered'
  | 'compaction-recovery'
  | 'drift-detected';

/** A trigger for warhead generation. */
export interface WarheadTrigger {
  type: WarheadTriggerType;
  gate?: string;
  missingEvidence?: string[];
  loopType?: string;
  errorPattern?: string;
}

// ── Dynamic Guardrails ──────────────────────────────────────────

/** Enforcement profile — adapts to agent performance. */
export type EnforcementProfile = 'trusted' | 'standard' | 'guided';

/**
 * Metrics snapshot embedded in EnforcementConfig for telemetry/logging.
 * Captured at the moment the profile is computed (spec GRR-09 §6.3).
 */
export interface EnforcementMetrics {
  successRate: number;
  violationRate: number;
  pseLoopCount: number;
  guidanceFollowRate: number;
  totalCalls: number;
  gate: string;
}

/**
 * Configuration for dynamic guardrails.
 *
 * The four core dimensional fields control behavior; the extended fields
 * (optional for backward compatibility) carry telemetry context used by
 * downstream consumers (spec GRR-09 §6).
 */
export interface EnforcementConfig {
  preWriteAnalysis: 'every' | 'sampled' | 'skip';
  evidenceVerification: 'strict' | 'standard' | 'trust';
  guidanceFrequency: 'minimal' | 'normal' | 'high';
  profile: EnforcementProfile;
  /** Why this profile was selected (for logging/telemetry). */
  triggerReason?: string;
  /** Metrics snapshot at the time of profile computation. */
  metrics?: EnforcementMetrics;
  /** Sampling interval for 'sampled' preWriteAnalysis (1=every, 5=every 5th). */
  samplingInterval?: number;
  /** Whether a warhead should be injected on every turn (GUIDED mode). */
  warheadPerTurn?: boolean;
}
