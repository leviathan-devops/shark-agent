/**
 * PSE Types — Behavioral Loop Engine type definitions
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §3-§10
 *
 * This is PLANNING BRAIN behavioral intelligence. NO TypeScript compiler.
 * All types are structural — used by the 6 loop classifiers and intervention
 * selector to answer: "Is the agent STUCK, and if so, WHY?"
 */

// ─── B-1: Tool Categorization ───────────────────────────────────────────────

/**
 * Six behavioral categories for tool classification.
 * Maps every tool call into one of six behavioral archetypes.
 */
export type ToolCategory =
  | 'EXECUTE'    // Run commands: bash, build, runners
  | 'EXPLORE'    // Read information: read, glob, grep
  | 'ANALYZE'    // Examine state: gate evaluation, audit
  | 'CREATE'     // Write new content: write, mkdir
  | 'MODIFY'     // Change existing: edit, patch
  | 'VERIFY';    // Check correctness: gate evaluation, lint

// ─── Tool Call Record ───────────────────────────────────────────────────────

/**
 * A single tool call observation, captured for behavioral analysis.
 * This is the atomic unit of the sliding window.
 */
export interface ToolCallRecord {
  /** Unique sequential ID within the session */
  id: number;
  /** Wall-clock timestamp */
  timestamp: number;
  /** Raw tool name (e.g., 'read', 'write', 'bash') */
  toolName: string;
  /** Behavioral category of this tool */
  category: ToolCategory;
  /** SHA-256 of JSON.stringify(args), truncated to 16 hex chars */
  argsHash: string;
  /** SHA-256 of stringified output, truncated to 16 hex chars */
  outputHash: string;
  /** Whether the tool reported success */
  success: boolean;
  /** Whether the output contained error patterns */
  outputHadError: boolean;
  /** Whether the output contained a completion claim */
  outputHadCompletionClaim: boolean;
  /** Gate phase at time of execution (or null if no gate context) */
  gateAtExecution: string | null;
  /** File paths extracted from args (filePath, path, file, etc.) */
  filesTouched: string[];
  /** Bytes written if this was a write/edit tool, else 0 */
  bytesWritten: number;
  /** Primary file path (first filesTouched entry, or args.filePath) */
  primaryFilePath?: string | null;
  /** Normalized error signature (TS_ERROR:2305, IMPORT_ERROR, etc.) or null */
  errorSignature?: string | null;
  /**
   * Whether this tool call was blocked by the enforcement pipeline
   * (StructuredBlockError / Firewalk layer / Guardian hook) rather than the
   * agent voluntarily choosing to retry. Set by the behavioral loop engine
   * after capture; consumed by TYPE_5 classification to distinguish
   * enforcement-caused stalls from genuinely theatrical agent loops.
   */
  enforcementBlocked?: boolean;
}

// ─── Loop Types ──────────────────────────────────────────────────────────────

/**
 * Six behavioral loop types, ordered by detection priority.
 *
 * Priority: TYPE_5 > TYPE_3 > TYPE_1 > TYPE_4 > TYPE_2 > TYPE_6
 */
export type LoopType =
  | 'TYPE_1_EXACT_REPEAT'           // Same tool + same args + same output, consecutively
  | 'TYPE_2_SEMANTIC_REPEAT'        // Passive exploration without progression
  | 'TYPE_3_FAILED_APPROACH_CYCLE'  // CREATE -> EXECUTE -> READ(error) repeating
  | 'TYPE_4_SCOPE_EXPANSION'        // Creating many files without finishing any
  | 'TYPE_5_CLAIM_WITHOUT_PROGRESS' // Completion claims with no filesystem change (HIGHEST PRIORITY)
  | 'TYPE_6_CONTEXT_LOSS';          // Re-reading recently-read files

/**
 * Numeric priority values for comparison.
 * Lower number = higher priority (wins on ties).
 */
export const LOOP_TYPE_PRIORITY: Record<LoopType, number> = {
  TYPE_5_CLAIM_WITHOUT_PROGRESS: 1,
  TYPE_3_FAILED_APPROACH_CYCLE: 2,
  TYPE_1_EXACT_REPEAT: 3,
  TYPE_4_SCOPE_EXPANSION: 4,
  TYPE_2_SEMANTIC_REPEAT: 5,
  TYPE_6_CONTEXT_LOSS: 6,
};

// ─── Escalation Levels ───────────────────────────────────────────────────────

/**
 * Intervention escalation levels.
 *   0 = no intervention (pass)
 *   1 = soft nudge
 *   2 = strong injection
 *   3 = PSM activation
 *   4 = hard block (StructuredBlockError)
 */
export type EscalationLevel = 0 | 1 | 2 | 3 | 4;

export type InterventionAction = 'pass' | 'inject-soft' | 'inject-strong' | 'activate-psm' | 'block-hard';

// ─── Intervention ─────────────────────────────────────────────────────────────

/**
 * The engine's response when a loop is detected.
 * Returned by onBeforeExecution and onAfterExecution.
 */
export interface Intervention {
  /** What action to take */
  action: InterventionAction;
  /** Specific, contextual message including tool name, count, file name */
  message: string;
  /** Which loop type triggered this intervention */
  loopType: LoopType | null;
  /** Escalation level 0-4 */
  escalation: EscalationLevel;
  /** How many times this loop type has occurred this session */
  occurrenceCount: number;
  /** Which intervention attempt this is for this loop type */
  interventionAttempt: number;
  /** Human-readable description of the detected pattern */
  detectedPattern: string;
  /** Recommended corrective action */
  recommendedAction: string;
  /** Whether this message was deduplicated (previously applied) */
  deduplicated: boolean;
}

// ─── Session Pattern Memory ──────────────────────────────────────────────────

/**
 * Per-loop-type tracker within session memory.
 */
export interface LoopTracker {
  /** How many times this loop type was detected */
  count: number;
  /** Timestamp of last occurrence */
  lastOccurrence: number;
  /** How many interventions resolved this loop type */
  resolutionRate: number;
  /** Total occurrences (lifetime, for resolution calc) */
  totalOccurrences: number;
  /** Whether this loop was resolved (10+ non-looping calls) */
  resolved: boolean;
  /** How the loop was resolved (escalation level + action) */
  resolvedBy: string | null;
  /** Number of calls since last occurrence (for resolution detection) */
  callsSinceLastOccurrence: number;
  /** Intervention history for this loop type */
  interventions: InterventionRecord[];
}

/**
 * A recorded intervention application.
 */
export interface InterventionRecord {
  timestamp: number;
  action: InterventionAction;
  escalation: EscalationLevel;
  message: string;
  effective: boolean;
}

/**
 * Session-level pattern memory.
 * Tracks loop statistics across an entire session for PSM activation
 * decisions and cross-session learning (Phase 2).
 */
export interface SessionPatternMemory {
  /** Unique session identifier */
  sessionId: string;
  /** Session start timestamp */
  sessionStart: number;
  /** Per-loop-type tracking */
  loopTrackers: Map<LoopType, LoopTracker>;
  /** Total loops detected across all types */
  totalLoopsDetected: number;
  /** Total interventions applied */
  totalInterventionsApplied: number;
  /** Fraction of loops that were resolved */
  resolutionRate: number;
  /** The most frequently occurring loop type */
  dominantLoopType: LoopType | null;
  /** Set of dedup keys for already-applied interventions */
  exhaustedInterventions: Set<string>;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ─── Progress Tracking ────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of the workspace state.
 */
export interface ProgressSnapshot {
  /** Set of all known file paths (relative) */
  fileSet: Set<string>;
  /** Map of file path to mtime (ms) */
  fileMtimes: Map<string, number>;
  /** Map of file path to size (bytes) */
  fileSizes: Map<string, number>;
  /** Total bytes across all tracked files */
  totalBytes: number;
  /** Current pass rate (0-1) or null if unknown */
  testPassRate: number | null;
  /** Number of completed TODO items */
  todoCompleted: number;
  /** Number of gate transitions since last snapshot */
  gateTransitions: number;
  /** Current gate phase */
  currentGate: string | null;
  /** Call index when snapshot was taken */
  callIndex: number;
}

/**
 * The difference between two ProgressSnapshots.
 */
export interface ProgressDelta {
  /** Files created since last snapshot */
  filesCreated: string[];
  /** Files modified since last snapshot */
  filesModified: string[];
  /** Change in total bytes */
  byteDelta: number;
  /** Change in pass rate */
  testPassRateDelta: number;
  /** Change in completed TODOs */
  todosCompletedDelta: number;
  /** Change in gate transitions */
  gateTransitionsDelta: number;
  /** Whether this represents meaningful progress */
  status: 'MEANINGFUL_PROGRESS' | 'NO_PROGRESS' | 'REGRESSION';
  /** Calls since last meaningful progress */
  callsSinceProgress: number;
}

// ─── Classification Result ───────────────────────────────────────────────────

/**
 * Result of running all 6 classifiers against the sliding window.
 */
export interface LoopClassificationResult {
  /** Whether any loop was detected */
  loopDetected: boolean;
  /** Type of loop detected (highest priority + confidence) */
  loopType: LoopType | null;
  /** Detection confidence 0-1 */
  confidence: number;
  /** Human-readable pattern description */
  patternDescription: string | null;
  /** IDs of records that triggered the detection */
  triggeringRecords: number[] | null;
  /** Number of cycle repetitions detected */
  cycleCount: number | null;
  /** The window state at time of classification */
  windowState: ToolCallRecord[];
  /** Whether this loop was caused by enforcement blocking writes (not agent behavior).
   *  Set by TYPE_5 classifier; consumed by intervention-selector for enforcement-aware messaging. */
  enforcementCaused?: boolean;
}

// ─── Engine State (for serialization) ─────────────────────────────────────────

/**
 * Serialized form of ProgressSnapshot (Sets/Maps → arrays for JSON compatibility).
 */
export interface SerializedProgressSnapshot {
  fileSet: string[];
  fileMtimes: [string, number][];
  fileSizes: [string, number][];
  totalBytes: number;
  testPassRate: number | null;
  todoCompleted: number;
  gateTransitions: number;
  currentGate: string | null;
  callIndex: number;
}

/**
 * Serializable engine state for compaction survival.
 */
export interface ProblemSolvingEngineState {
  window: ToolCallRecord[];
  callIndex: number;
  callsSinceProgress: number;
  sessionMemory: SerializedSessionMemory;
  lastProgressSnapshot: SerializedProgressSnapshot | null;
}

/**
 * Serializable form of SessionPatternMemory (Maps/Sets to arrays/objects).
 */
export interface SerializedSessionMemory {
  sessionId: string;
  sessionStart: number;
  loopTrackers: Record<string, {
    count: number;
    lastOccurrence: number;
    resolutionRate: number;
    totalOccurrences: number;
    resolved: boolean;
    resolvedBy: string | null;
    callsSinceLastOccurrence: number;
    interventions: InterventionRecord[];
  }>;
  totalLoopsDetected: number;
  totalInterventionsApplied: number;
  resolutionRate: number;
  dominantLoopType: LoopType | null;
  exhaustedInterventions: string[];
  lastUpdated: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * All configurable thresholds for the Behavioral Loop Engine.
 * Every threshold can be overridden via env vars or Partial<Config>.
 */
export interface ProblemSolvingEngineConfig {
  // Window
  windowSize: number;                       // 50 — sliding window capacity

  // TYPE_1: Exact Repeat
  type1_exactRepeatMinCount: number;        // 3 — min consecutive identical calls
  type1_hashTruncateLength: number;         // 16 — hash truncation length

  // TYPE_2: Semantic Repeat
  type2_sameCategoryRunLength: number;      // 5 — min same-category passive run
  type2_exploreStuckMin: number;            // 7 — min explore calls without action

  // TYPE_3: Failed Approach Cycle
  type3_cycleMinRepetitions: number;        // 2 — min CREATE-EXEC-READ(err) cycles
  type3_cycleWindowScan: number;            // 15 — window scan length

  // TYPE_4: Scope Expansion
  type4_distinctFilesMin: number;           // 4 — min distinct files
  type4_consecutiveCreatesMin: number;      // 3 — min consecutive CREATE calls

  // TYPE_5: Claim Without Progress
  // CALIBRATION FIX: Raised thresholds to stop false-positive blocks on legitimate work.
  // type5_maxClaimsWithoutChange: 2 → 10 (need 10+ claims-without-change before triggering)
  // type5_callsSinceFSCheck: 5 → 15 (wider window so 10 claims can accumulate)
  type5_maxClaimsWithoutChange: number;     // 10 — max claims without FS change (was 2)
  type5_callsSinceFSCheck: number;          // 15 — calls to check for FS change (was 5)

  // TYPE_6: Context Loss
  type6_recentReadWindow: number;           // 10 — window for re-read detection
  type6_minRereadCount: number;             // 2 — min re-reads to flag

  // Progress Tracking
  progress_maxCallsWithoutProgress: number; // 8 — max calls without progress
  progress_regressionThreshold: number;     // -500 — byte delta for regression

  // PSM Activation
  psm_totalLoopThreshold: number;           // 3 — total loops for PSM
  psm_failedApproachThreshold: number;      // 2 — failed approach cycles for PSM
  psm_claimWithoutProgressThreshold: number;// 1 — claims for PSM
  psm_cooldownMs: number;                   // 60000 — cooldown between activations
  psm_hardBlockRepeatCount: number;         // 3 — loop count for hard block (graduated: 1/2/3)

  // Filesystem Scanning
  fs_scanIntervalCalls: number;             // 10 — full scan interval
  fs_maxFilesToTrack: number;               // 500 — max tracked files
  fs_ignorePatterns: string[];              // node_modules, .git, dist, etc.

  // Escalation
  escalate_repeatInterventionCount: number; // 3 — repeat count for escalation

  // Completion Claim Keywords
  completionClaimKeywords: string[];

  // Paths
  basePath: string;
  contextDir: string;
  evidenceDir: string;
}

/**
 * Default configuration values — matches spec §20.1.
 */
export const DEFAULT_CONFIG: ProblemSolvingEngineConfig = {
  windowSize: 50,

  type1_exactRepeatMinCount: 3,
  type1_hashTruncateLength: 16,

  type2_sameCategoryRunLength: 5,
  type2_exploreStuckMin: 7,

  type3_cycleMinRepetitions: 2,
  type3_cycleWindowScan: 15,

  type4_distinctFilesMin: 4,
  type4_consecutiveCreatesMin: 3,

  // CALIBRATION FIX: Raised from 2→10 and 5→15 to stop false-positive TYPE_5 blocks
  type5_maxClaimsWithoutChange: 10,
  type5_callsSinceFSCheck: 15,

  type6_recentReadWindow: 10,
  type6_minRereadCount: 2,

  progress_maxCallsWithoutProgress: 8,
  progress_regressionThreshold: -500,

  psm_totalLoopThreshold: 3,
  psm_failedApproachThreshold: 2,
  psm_claimWithoutProgressThreshold: 1,
  psm_cooldownMs: 60000,
  psm_hardBlockRepeatCount: 3,

  fs_scanIntervalCalls: 10,
  fs_maxFilesToTrack: 500,
  fs_ignorePatterns: [
    'node_modules', '.git', 'dist', '.shark', '.trident',
    '*.lock', 'package-lock.json', 'pnpm-lock.yaml',
  ],

  escalate_repeatInterventionCount: 3,

  completionClaimKeywords: [
    'done', 'complete', 'completed', 'verified',
    'implemented', 'fixed', 'success', 'passed', 'finished',
  ],

  basePath: process.cwd(),
  contextDir: '',
  evidenceDir: '',
};

/**
 * Merge partial config with defaults and load env overrides.
 */
export function createConfig(
  overrides?: Partial<ProblemSolvingEngineConfig>
): ProblemSolvingEngineConfig {
  const env = process.env;
  const envOverrides: Partial<ProblemSolvingEngineConfig> = {};

  if (env.BLE_WINDOW_SIZE) envOverrides.windowSize = parseInt(env.BLE_WINDOW_SIZE, 10);
  if (env.BLE_TYPE1_MIN) envOverrides.type1_exactRepeatMinCount = parseInt(env.BLE_TYPE1_MIN, 10);
  if (env.BLE_TYPE1_HASH_LEN) envOverrides.type1_hashTruncateLength = parseInt(env.BLE_TYPE1_HASH_LEN, 10);
  if (env.BLE_TYPE2_RUN) envOverrides.type2_sameCategoryRunLength = parseInt(env.BLE_TYPE2_RUN, 10);
  if (env.BLE_TYPE2_EXPLORE) envOverrides.type2_exploreStuckMin = parseInt(env.BLE_TYPE2_EXPLORE, 10);
  if (env.BLE_TYPE3_MIN) envOverrides.type3_cycleMinRepetitions = parseInt(env.BLE_TYPE3_MIN, 10);
  if (env.BLE_TYPE3_SCAN) envOverrides.type3_cycleWindowScan = parseInt(env.BLE_TYPE3_SCAN, 10);
  if (env.BLE_TYPE4_FILES) envOverrides.type4_distinctFilesMin = parseInt(env.BLE_TYPE4_FILES, 10);
  if (env.BLE_TYPE4_CREATES) envOverrides.type4_consecutiveCreatesMin = parseInt(env.BLE_TYPE4_CREATES, 10);
  if (env.BLE_TYPE5_CLAIMS) envOverrides.type5_maxClaimsWithoutChange = parseInt(env.BLE_TYPE5_CLAIMS, 10);
  if (env.BLE_TYPE5_CHECK) envOverrides.type5_callsSinceFSCheck = parseInt(env.BLE_TYPE5_CHECK, 10);
  if (env.BLE_TYPE6_WINDOW) envOverrides.type6_recentReadWindow = parseInt(env.BLE_TYPE6_WINDOW, 10);
  if (env.BLE_TYPE6_MIN) envOverrides.type6_minRereadCount = parseInt(env.BLE_TYPE6_MIN, 10);
  if (env.BLE_PROGRESS_MAX) envOverrides.progress_maxCallsWithoutProgress = parseInt(env.BLE_PROGRESS_MAX, 10);
  if (env.BLE_PROGRESS_REGRESS) envOverrides.progress_regressionThreshold = parseInt(env.BLE_PROGRESS_REGRESS, 10);
  if (env.BLE_PSM_TOTAL) envOverrides.psm_totalLoopThreshold = parseInt(env.BLE_PSM_TOTAL, 10);
  if (env.BLE_PSM_FAILED) envOverrides.psm_failedApproachThreshold = parseInt(env.BLE_PSM_FAILED, 10);
  if (env.BLE_PSM_CLAIM) envOverrides.psm_claimWithoutProgressThreshold = parseInt(env.BLE_PSM_CLAIM, 10);
  if (env.BLE_PSM_COOLDOWN) envOverrides.psm_cooldownMs = parseInt(env.BLE_PSM_COOLDOWN, 10);
  if (env.BLE_PSM_BLOCK) envOverrides.psm_hardBlockRepeatCount = parseInt(env.BLE_PSM_BLOCK, 10);
  if (env.BLE_FS_INTERVAL) envOverrides.fs_scanIntervalCalls = parseInt(env.BLE_FS_INTERVAL, 10);
  if (env.BLE_FS_MAX) envOverrides.fs_maxFilesToTrack = parseInt(env.BLE_FS_MAX, 10);
  if (env.BLE_ESCALATE) envOverrides.escalate_repeatInterventionCount = parseInt(env.BLE_ESCALATE, 10);

  const merged = { ...DEFAULT_CONFIG, ...envOverrides, ...overrides };

  // Ensure derived paths are set
  if (!merged.contextDir) {
    merged.contextDir = `${merged.basePath}/.shark/context`;
  }
  if (!merged.evidenceDir) {
    merged.evidenceDir = `${merged.basePath}/.shark/evidence/behavioral`;
  }

  return merged;
}
