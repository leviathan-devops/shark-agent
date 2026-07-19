/**
 * CSE (Common Sense Engine) — Type System
 * File: src/shark/planning-brain/cse/cse-types.ts
 *
 * Behavioral intelligence type definitions for V-1 through V-5 rules.
 * This is NOT code intelligence (no AST, no TypeChecker). This operates
 * on filesystem state, JSON parsing, and tool call records.
 *
 * Bible Principle: "Did you VERIFY what you claimed?"
 */

// ===========================================================================
// GATE PHASES & CLAIM TAXONOMY
// ===========================================================================

export type GatePhase = 'PLAN' | 'BUILD' | 'VERIFY' | 'TEST' | 'AUDIT' | 'DELIVERY';

export type ClaimType =
  | 'BUILD_SUCCESS'
  | 'BUILD_RAN'
  | 'CONTAINER_TEST_RAN'
  | 'CONTAINER_TEST_PASSED'
  | 'EVIDENCE_ARCHIVED'
  | 'SPEC_WRITTEN'
  | 'CODE_REVIEWED'
  | 'AUDIT_PASSED'
  | 'BUILD_VERIFIED'
  | 'TESTS_PASS'
  | 'SHIP_PACKAGE_CREATED'
  | 'CHECKSUM_VERIFIED'
  | 'GATE_ADVANCED'
  | 'GATE_REQUIREMENTS_MET'
  | 'PREFLIGHT_PASSED'
  | 'EXPORTS_PRESENT'
  | 'MERKLE_CHAIN_VALID'
  | 'NO_THEATRICAL_CODE'
  | 'FUNCTION_IMPLEMENTED'
  | 'BUG_FIXED'
  | 'OTHER';

export type ClaimSource = 'chat' | 'tool_output' | 'gate_submission' | 'self_report';

// ===========================================================================
// AGENT CLAIM
// ===========================================================================

/**
 * A claim extracted from the agent's chat messages or tool output.
 * This is what the engine must verify against filesystem reality.
 */
export interface AgentClaim {
  /** Unique ID for this claim instance. */
  claimId: string;
  /** The session this claim was made in. */
  sessionId: string;
  /** Gate context when the claim was made. */
  gate: GatePhase;
  /** Timestamp the claim was uttered (ms epoch). */
  timestamp: number;
  /** Categorical type of the claim — maps to a verification predicate. */
  type: ClaimType;
  /** The literal text of the claim (for audit trail). */
  rawText: string;
  /** Where the claim was found. */
  source: ClaimSource;
  /** Confidence the claim-extractor has that this is a genuine claim (0–1). */
  extractionConfidence: number;
  /** The filesystem path this claim refers to (if applicable). */
  evidencePath?: string;
  /** Tool call ID that produced/contained this claim (traceability). */
  toolCallId?: string;
}

/**
 * A candidate produced by Phase 0 (prefilter). Not yet verified — this is
 * the regex/existence tip of the spear. Must be confirmed by L2+.
 */
export interface CandidateClaim {
  claim: AgentClaim;
  /** Why this candidate was generated (which prefilter triggered). */
  triggerSource: 'existence_check' | 'keyword_scan' | 'tool_requirement_map';
  /** Preliminary filesystem state at detection time. */
  fileExists: boolean;
  /** Path that was checked. */
  checkedPath: string;
}

// ===========================================================================
// SESSION WINDOW
// ===========================================================================

/**
 * Defines the bounds of "current" evidence.
 * Evidence timestamps outside this window are classified STALE.
 */
export interface SessionWindow {
  /** Session start (ms epoch). */
  start: number;
  /** Latest tool call timestamp (ms epoch). */
  latestActivity: number;
  /** Maximum staleness tolerance (ms). Evidence older than this is STALE. */
  stalenessTolerance: number;
}

// ===========================================================================
// TOOL CALL (lightweight representation for trajectory analysis)
// ===========================================================================

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
  result?: string;
  toolCallId?: string;
}

// ===========================================================================
// EVIDENCE CONTENT VALIDATION (V-1)
// ===========================================================================

export type EvidenceProvenance =
  | 'MACHINE_GENERATED'
  | 'LIKELY_MACHINE'
  | 'SUSPICIOUS'
  | 'STALE'
  | 'UNKNOWN';

export type CheckResult = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

/**
 * A single content-level check applied to an evidence file.
 */
export interface ContentCheck {
  /** Check identifier (e.g., 'V-1.1-timestamp-window'). */
  checkId: string;
  /** Human-readable name. */
  name: string;
  /** Pass / fail / could-not-run. */
  result: CheckResult;
  /** Detail message. */
  detail: string;
  /** Weight of this check in overall confidence (0–1). */
  weight: number;
}

export type CheckSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ContentCheckFailure {
  checkId: string;
  expected: string;
  actual: string;
  severity: CheckSeverity;
  hint: string;
}

/**
 * Result of validating a single evidence file's CONTENT (not just existence).
 */
export interface EvidenceVerification {
  /** Path that was validated. */
  filePath: string;
  /** Overall: did the content pass all content-level checks? */
  valid: boolean;
  /** Confidence in the validation result (0.0 – 1.0). */
  confidence: number;
  /** Individual check results. */
  checks: ContentCheck[];
  /** Specific failures (empty if valid). */
  failures: ContentCheckFailure[];
  /** The parsed JSON content (if parseable). */
  parsedContent?: unknown;
  /** Raw file size in bytes. */
  fileSize: number;
  /** File modification time (ms epoch). */
  fileMtime: number;
  /** How the file was created (best-effort heuristic). */
  creationProvenance: EvidenceProvenance;
}

// ===========================================================================
// CLAIM-REALITY VERIFICATION (V-2)
// ===========================================================================

export type ClaimVerdict =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'CONTRADICTED'
  | 'UNVERIFIABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'SUPPRESSED';

export type FactSupport = 'SUPPORTS' | 'REFUTES' | 'NEUTRAL';

export interface VerificationFact {
  /** What was checked (e.g., "dist/index.js exports"). */
  checked: string;
  /** What was found. */
  found: string;
  /** Whether this fact supports or refutes the claim. */
  supports: FactSupport;
  /** Source of this fact. */
  source: 'preflight' | 'evidence_file' | 'filesystem' | 'trajectory';
  /** Timestamp when this fact was established. */
  timestamp: number;
}

export type PreflightEffect = 'BOOST' | 'SUPPRESS' | 'NEUTRAL' | 'N_A';

export interface PreflightAlignment {
  /** Was preflight grounding available for this claim? */
  available: boolean;
  /** Does preflight support (×1.5) or suppress (×0.1) the claim? */
  effect: PreflightEffect;
  /** The preflight fact that drove the alignment. */
  groundingFact?: string;
}

/**
 * Result of verifying a single agent claim against filesystem reality.
 */
export interface ClaimVerification {
  /** The claim that was verified. */
  claim: AgentClaim;
  /** VERIFIED: reality matches claim. CONTRADICTED: reality refutes claim. */
  verdict: ClaimVerdict;
  /** Confidence in the verdict (0.0 – 1.0). */
  confidence: number;
  /** The evidence verification backing this verdict (if applicable). */
  evidence?: EvidenceVerification;
  /** Preflight grounding that informed this verdict. */
  preflightAlignment: PreflightAlignment;
  /** Human-readable explanation. */
  explanation: string;
  /** The filesystem facts that were checked. */
  facts: VerificationFact[];
}

// ===========================================================================
// BEHAVIORAL PATTERN MEMORY (V-3)
// ===========================================================================

export interface PatternEvidence {
  type: 'tool_call' | 'claim' | 'evidence_check';
  ref: string;
  detail: string;
}

export interface DetectedPattern {
  patternId: string;
  /** Optional short id for disk persistence. */
  id?: string;
  /** Optional content hash fingerprint for dedup/recall. */
  patternHash?: string;
  /** Pattern confidence (0–1), adjusted over time by the learning loop. */
  confidence?: number;
  /** Pattern template that matched. */
  template: string;
  /** How many times this pattern occurred. */
  occurrences: number;
  /** The tool calls / claims that constitute the pattern. */
  evidence: PatternEvidence[];
  /** Severity of this pattern for derailment risk. */
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  /** Correlation with known failure (0–1). */
  derailmentCorrelation: number;
}

export interface DerailmentMatch {
  templateId: string;
  templateName: string;
  /** How closely the session matches this template (0–1). */
  matchScore: number;
  /** The behavioral sequence that matched. */
  matchedSequence: string[];
  /** Recommended intervention. */
  intervention: string;
}

export type BehavioralConditionField =
  | 'claim_count'
  | 'evidence_present'
  | 'tool_category'
  | 'gate'
  | 'ratio';

export type BehavioralConditionOperator =
  | 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE' | 'IN' | 'NOT_IN';

export interface BehavioralCondition {
  field: BehavioralConditionField;
  operator: BehavioralConditionOperator;
  value: number | string | string[];
}

export interface DerailmentTemplate {
  templateId: string;
  name: string;
  /** The behavioral signature: a sequence of conditions. */
  signature: BehavioralCondition[];
  /** Historical correlation with actual failures. */
  failureCorrelation: number;
  /** Number of past sessions exhibiting this pattern. */
  observedCount: number;
  /** Intervention to inject when this pattern matches. */
  intervention: string;
}

/**
 * Accumulated behavioral history for a single session.
 */
export interface PatternHistory {
  sessionId: string;
  /** All claims made in the session. */
  claims: AgentClaim[];
  /** All verification results in the session. */
  verifications: ClaimVerification[];
  /** Detected behavioral patterns. */
  patterns: DetectedPattern[];
  /** Count of claims without supporting evidence. */
  claimsWithoutEvidence: number;
  /** Count of claims backed by stale evidence. */
  staleEvidenceClaims: number;
  /** Count of claims backed by theatrical evidence (content failed V-1). */
  theatricalEvidenceClaims: number;
  /** Read-to-write ratio in BUILD gate. */
  explorationRatio: number;
  /** Whether known derailment templates matched. */
  derailmentMatches: DerailmentMatch[];
  /** Session start time. */
  sessionStart: number;
  /** Last update time. */
  lastUpdate: number;
}

export interface BehavioralAssessment {
  /** Detected behavioral patterns. */
  patterns: DetectedPattern[];
  /** Derailment risk score (0.0 – 1.0). */
  derailmentRisk: number;
  /** Newly learned patterns (to persist). */
  learned: DerailmentTemplate[];
  /** Trajectory alignment with expected workflow (0-1). */
  workflowAlignment: number;
  /** Count of claims without evidence. */
  claimsWithoutEvidence: number;
  /** Count of stale evidence claims. */
  staleEvidenceClaims: number;
  /** Count of theatrical evidence claims. */
  theatricalEvidenceClaims: number;
  /** Exploration ratio. */
  explorationRatio: number;
  /** Derailment template matches. */
  derailmentMatches: DerailmentMatch[];
}

// ===========================================================================
// PREFLIGHT GROUNDING (V-4)
// ===========================================================================

export interface BuildStatus {
  ran: boolean;
  success: boolean;
  durationMs: number;
  output: string;
  errorMessage?: string;
}

export interface TscError {
  file: string;
  line: number;
  code: string;
  message: string;
}

/**
 * Result of running preflight (tsc + bun build) to ground claims in reality.
 * Cached per-gate to avoid re-running expensive build commands.
 */
export interface PreflightGrounding {
  /** Gate this grounding was computed for. */
  gate: GatePhase;
  /** When the grounding was computed (ms epoch). */
  computedAt: number;
  /** TypeScript compile status. */
  tscStatus: BuildStatus;
  /** Bun bundle status. */
  bundleStatus: BuildStatus;
  /** Whether preflight tools were available at all. */
  available: boolean;
  /** Exports found in dist/index.js (if bundle succeeded). */
  exports: string[];
  /** Hash of the bundle output (to detect unchanged builds). */
  bundleHash?: string;
  /** tsc errors (if any). */
  tscErrors: TscError[];
  /** Unavailability reasons (if not available). */
  unavailableReasons: string[];
}

// ===========================================================================
// BLIND SPOT REPORTING (V-5)
// ===========================================================================

export type BiasWarningType =
  | 'self_audit'
  | 'stale_grounding'
  | 'single_source'
  | 'no_cross_ref';

export interface BiasWarning {
  type: BiasWarningType;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ExpectedFile {
  path: string;
  required: boolean;
}

export interface BlindSpotReport {
  /** Fraction of expected evidence that was present. */
  evidenceCoverage: number;
  /** Present evidence files. */
  presentEvidence: string[];
  /** Missing expected evidence files. */
  missingEvidence: string[];
  /** Claims the engine had no predicate to verify. */
  unverifiableClaims: AgentClaim[];
  /** Preflight tools that were unavailable. */
  preflightUnavailable: string[];
  /** Bias risk warnings. */
  biasWarnings: BiasWarning[];
  /** Overall transparency statement. */
  statement: string;
}

// ===========================================================================
// AGGREGATE VERDICT
// ===========================================================================

export type OverallVerdict =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'FAILED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONTRADICTED';

export type EnforcementAction = 'PASS' | 'WARN' | 'BLOCK' | 'ESCALATE';

/**
 * The top-level output of a full verification cycle.
 */
export interface VerificationVerdict {
  /** Overall verification outcome. */
  overall: OverallVerdict;
  /** Aggregate confidence (0.0 – 1.0). */
  confidence: number;
  /** Gate evaluated. */
  gate: GatePhase;
  /** Timestamp of evaluation. */
  evaluatedAt: number;
  /** Per-claim verifications. */
  claimVerifications: ClaimVerification[];
  /** Per-file evidence checks. */
  evidenceChecks: EvidenceVerification[];
  /** Behavioral assessment. */
  behavioral: BehavioralAssessment;
  /** Blind spot report. */
  blindSpots: BlindSpotReport;
  /** Preflight grounding used. */
  preflightGrounding: PreflightGrounding;
  /** Enforcement action for the gate system. */
  enforcementAction: EnforcementAction;
  /** Summary for human/agent consumption. */
  summary: string;
}

// ===========================================================================
// VERIFICATION PREDICATE (V-2 mapping)
// ===========================================================================

export interface VerificationPredicate {
  claimType: ClaimType;
  /**
   * Evaluate the claim against reality. Returns facts that support or refute.
   */
  evaluate(
    claim: AgentClaim,
    grounding: PreflightGrounding,
    evidence: EvidenceVerification | undefined,
    window: SessionWindow,
    workspacePath: string,
  ): VerificationFact[];
}

// ===========================================================================
// CHECK WEIGHT TABLE (section 10.2 of spec)
// ===========================================================================

export const CHECK_WEIGHTS: Record<string, number> = {
  'V-1.1-timestamp-window': 1.0,
  'V-1.2-machine-generation': 1.0,
  'V-1.3-pass-fail-breakdown': 0.8,
  'V-1.4-exports-present': 0.6,
};

export const CHECK_SEVERITY: Record<string, CheckSeverity> = {
  'V-1.1-timestamp-window': 'CRITICAL',
  'V-1.2-machine-generation': 'CRITICAL',
  'V-1.3-pass-fail-breakdown': 'HIGH',
  'V-1.4-exports-present': 'HIGH',
};

/**
 * Default staleness tolerance: 24 hours.
 */
export const DEFAULT_STALENESS_TOLERANCE = 24 * 60 * 60 * 1000;

/**
 * Pass rate threshold for container tests.
 */
export const PASS_RATE_THRESHOLD = 0.90;

/**
 * Minimum valid confidence for evidence to be considered valid.
 */
export const MIN_VALID_CONFIDENCE = 0.7;

/**
 * Expected evidence files per gate (section 14.2 of spec).
 */
export const EXPECTED_EVIDENCE: Record<GatePhase, ExpectedFile[]> = {
  PLAN: [
    { path: '.shark/evidence/SpecAlignmentReport.json', required: true },
  ],
  BUILD: [
    { path: 'dist/index.js', required: true },
    { path: '.shark/evidence/BuildReport.json', required: false },
  ],
  VERIFY: [
    { path: '.shark/evidence/TridentReport.json', required: true },
  ],
  TEST: [
    { path: '.shark/evidence/ContainerTestResult.json', required: true },
    { path: '.shark/evidence/BrowserTestResult.json', required: false },
  ],
  AUDIT: [
    { path: '.shark/evidence/TestAuthenticityReport.json', required: true },
    { path: '.shark/evidence/SpecAlignmentReport.json', required: true },
  ],
  DELIVERY: [
    { path: '.shark/evidence/ContainerTestResult.json', required: true },
    { path: '.shark/evidence/TridentReport.json', required: true },
    { path: '.shark/evidence/TestAuthenticityReport.json', required: true },
  ],
};
