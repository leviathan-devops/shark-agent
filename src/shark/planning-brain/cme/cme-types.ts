/**
 * cme-types.ts — Core Type Definitions for the Context Management Engine (CME)
 *
 * The CME is the BEHAVIORAL INTELLIGENCE engine for Planning Brain Lobe 5.
 * It answers: "Is the agent on the RIGHT TRACK?" using semantic trajectory
 * analysis of tool call sequences. This is PROCESS intelligence — it operates
 * on tool call sequences, filesystem state, and trajectory graphs. There is
 * NO TypeScript compiler API here.
 *
 * Authority: CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md
 * Rules Implemented: T-1 (alignment), T-2 (relevance), T-3 (stagnation),
 *                    T-4 (drift), T-5 (freshness).
 *
 * IRON LAW: Two tools with the same SemanticCategory are treated as
 * semantically equivalent for alignment purposes. This is what makes the
 * engine semantic rather than syntactic.
 */

// ============================================================================
// Gate Names
// ============================================================================

/**
 * The gate pipeline phases the engine knows about. Each gate has an expected
 * workflow shape (reference path) used by T-1 alignment scoring.
 */
export type GateName =
  | 'PLAN'
  | 'BUILD'
  | 'VERIFY'
  | 'TEST'
  | 'AUDIT'
  | 'DELIVERY'
  | 'UNKNOWN';

// ============================================================================
// Semantic Category System (the unit of trajectory comparison)
// ============================================================================

/**
 * Semantic category of a tool call. This is the UNIT of trajectory comparison.
 *
 * Raw tool names are mapped to these categories by ToolCategoryMapper. The
 * category is what the T-1 through T-5 rules operate on — never the raw
 * tool name.
 *
 *   EXPLORE   — information gathering (read, glob, grep, ls, webfetch)
 *   CREATE    — bringing something into existence (write new, mkdir)
 *   MODIFY    — changing existing file (edit, write-overwrite)
 *   TEST      — mechanical verification (test runners)
 *   VERIFY    — quality enforcement (audits, reviews)
 *   CLAIM     — completion assertion (gate advance, evidence submit)
 *   NAVIGATE  — movement with no content change (status checks, ambiguous bash)
 */
export type SemanticCategory =
  | 'EXPLORE'
  | 'CREATE'
  | 'MODIFY'
  | 'TEST'
  | 'VERIFY'
  | 'CLAIM'
  | 'NAVIGATE';

/** Canonical ordered list of all categories (used for distribution sweeps). */
export const ALL_CATEGORIES: readonly SemanticCategory[] = [
  'EXPLORE',
  'CREATE',
  'MODIFY',
  'TEST',
  'VERIFY',
  'CLAIM',
  'NAVIGATE',
] as const;

/**
 * Phase ordering for the T-1 ordering penalty. Categories are grouped into
 * phases; a transition to an EARLIER phase (backward move) is penalized.
 *
 * Note: EXPLORE and NAVIGATE share phase 0 (informational), CREATE and
 * MODIFY share phase 1 (implementation). The TEST->MODIFY transition is a
 * legitimate debug loop and is exempted from the penalty.
 */
export const PHASE_ORDER: Readonly<Record<SemanticCategory, number>> = {
  EXPLORE: 0,
  NAVIGATE: 0,
  CREATE: 1,
  MODIFY: 1,
  TEST: 2,
  VERIFY: 3,
  CLAIM: 4,
};

// ============================================================================
// Trajectory Graph Types
// ============================================================================

/**
 * A single node in the trajectory graph.
 * Represents ONE tool call annotated with semantic metadata.
 */
export interface TrajectoryNode {
  /** Monotonic sequence number within the session. */
  readonly sequence: number;
  /** Raw tool name as called (e.g., "write", "shark-test-runner"). */
  readonly toolName: string;
  /** Semantic category derived from toolName via ToolCategoryMapper. */
  readonly category: SemanticCategory;
  /** Primary file path the tool operates on, if any. */
  readonly filePath?: string;
  /** Secondary file paths (e.g., glob matches, grep hits). */
  readonly touchedPaths?: string[];
  /** ISO timestamp of the call. */
  readonly timestamp: string;
  /** Gate active when the call was made. */
  readonly gate: GateName;
  /** Whether the call succeeded (post-execute). Undefined pre-execute. */
  readonly succeeded?: boolean;
  /** Token cost of the call (for budget-aware stagnation). */
  readonly tokenCost?: number;
}

/**
 * A directed edge between two consecutive trajectory nodes.
 * Weight encodes the semantic "goodness" of the transition:
 *   1.0 = ideal progression (e.g., EXPLORE -> CREATE)
 *   0.5 = neutral momentum (e.g., EXPLORE -> EXPLORE)
 *   0.0 = suspicious/wasteful (e.g., CLAIM -> EXPLORE: red flag)
 */
export interface TrajectoryEdge {
  /** Source node sequence. */
  readonly from: number;
  /** Target node sequence. */
  readonly to: number;
  /** Transition weight in [0, 1]. */
  readonly weight: number;
  /** The transition type, e.g., "EXPLORE->CREATE". */
  readonly transition: string;
}

/**
 * A reference (expected) workflow path for a given gate.
 * Produced by the reference-path definitions used by T-1.
 */
export interface ReferencePath {
  readonly gate: GateName;
  /** Ordered list of expected category distributions. */
  readonly expected: CategoryDistribution[];
  /** Category that, if absent, signals severe misalignment. */
  readonly requiredCategory?: SemanticCategory;
  /** Human-readable description of what the gate expects. */
  readonly description: string;
}

/**
 * Distribution of a category expected at a gate.
 * fraction is the expected fraction of calls (0.0-1.0); minCount is the
 * minimum number of calls expected in this category (used for the required
 * category penalty and general presence checks).
 */
export interface CategoryDistribution {
  readonly category: SemanticCategory;
  /** Expected fraction of calls in this category (0.0-1.0). */
  readonly fraction: number;
  /** Minimum number of calls expected in this category. */
  readonly minCount: number;
}

/** Actual observed distribution of a category in a node window. */
export interface CategoryCount {
  readonly category: SemanticCategory;
  readonly count: number;
  readonly fraction: number;
}

/** Summary of a transition type across the recent window. */
export interface TransitionSummary {
  readonly transition: string; // e.g., "EXPLORE->CREATE"
  readonly count: number;
  readonly averageWeight: number;
}

// ============================================================================
// T-1: Workflow Alignment Types
// ============================================================================

/**
 * Result of comparing the actual trajectory to the expected workflow.
 *
 * distance = 0.0 means PERFECT alignment; 1.0 means COMPLETE misalignment.
 * It is a weighted combination of:
 *   - Category distribution distance (TVD)
 *   - Ordering penalty (backward phase transitions)
 *   - Required category presence (must-have category present?)
 */
export interface WorkflowAlignment {
  /** Overall distance metric: 0.0 (perfect) to 1.0 (complete misalignment). */
  readonly distance: number;
  /** Verdict derived from the distance thresholds. */
  readonly verdict: 'ALIGNED' | 'DRIFTING' | 'MISALIGNED';
  /** Actual category distribution observed. */
  readonly actualDistribution: CategoryCount[];
  /** Expected category distribution from ReferencePath. */
  readonly expectedDistribution: CategoryDistribution[];
  /** Was the required category present in the actual trajectory? */
  readonly requiredCategoryPresent: boolean;
  /** Pairwise transition weights from the actual graph. */
  readonly transitions: TransitionSummary[];
  /** Human-readable explanation of the distance score. */
  readonly explanation: string;
}

/**
 * Distance thresholds for the T-1 verdict.
 *   distance <= ALIGNED   -> ALIGNED
 *   distance <= DRIFTING  -> DRIFTING
 *   distance >  DRIFTING  -> MISALIGNED
 */
export const ALIGNMENT_THRESHOLDS = {
  ALIGNED: 0.3,
  DRIFTING: 0.6,
} as const;

/** Weights for the three distance components. MUST sum to 1.0. */
export const ALIGNMENT_WEIGHTS = {
  TVD: 0.45,
  ORDERING: 0.3,
  REQUIRED: 0.25,
} as const;

// ============================================================================
// T-2: Context Relevance Prediction Types
// ============================================================================

export type TaskPhase = 'STARTING' | 'IN_PROGRESS' | 'NEAR_COMPLETION' | 'BLOCKED';

export type DocPriority = 'CRITICAL' | 'IMPORTANT' | 'OPTIONAL';

/** A document the agent needs injected at a given moment. */
export interface RequiredDoc {
  /** Document path or identifier. */
  readonly doc: string;
  /** Why this doc is needed (for audit trail). */
  readonly reason: string;
  /** Priority: CRITICAL always injected; OPTIONAL only if budget allows. */
  readonly priority: DocPriority;
}

/** Key used to look up a context prediction. */
export interface ContextPredictionKey {
  readonly gate: GateName;
  readonly toolCategory: SemanticCategory;
  readonly taskPhase?: TaskPhase;
}

/**
 * A prediction of which context documents the agent needs RIGHT NOW,
 * based on the current tool category + gate + task queue state.
 */
export interface ContextPrediction {
  /** The key used to look up the prediction. */
  readonly key: ContextPredictionKey;
  /** Documents the agent needs injected. */
  readonly requiredDocs: RequiredDoc[];
  /** Documents explicitly NOT needed (to suppress flooding). */
  readonly suppressedDocs: string[];
  /** Confidence in the prediction (0.0-1.0). */
  readonly confidence: number;
}

// ============================================================================
// T-3: Stagnation Types
// ============================================================================

/**
 * Detection of "exploration without direction" — the agent is reading files
 * but NONE of them are the files the task queue says it needs to write.
 *
 * This is fundamentally different from "same tool 3 times". The agent could
 * call 12 DIFFERENT read tools on 12 DIFFERENT files and still be stagnant,
 * because none of those files are the target of any pending task.
 */
export interface StagnationReport {
  /** Stagnation score: 0.0 (totally directed) to 1.0 (totally stagnant). */
  readonly score: number;
  readonly verdict: 'DIRECTED' | 'WANDERING' | 'STAGNANT';
  /** Files read that ARE relevant to the task queue. */
  readonly relevantReads: string[];
  /** Files read that are NOT relevant to any pending task. */
  readonly irrelevantReads: string[];
  /** Files the agent SHOULD read next (from task queue outputs). */
  readonly expectedNextReads: string[];
  /** Consecutive EXPLORE calls without a CREATE/MODIFY. */
  readonly exploreStreak: number;
  readonly explanation: string;
}

export const STAGNATION_THRESHOLDS = {
  DIRECTED: 0.3,
  WANDERING: 0.65,
  /** Minimum explore streak before stagnation can fire (avoids false positives). */
  MIN_EXPLORE_STREAK: 4,
} as const;

// ============================================================================
// T-4: Drift Types
// ============================================================================

/**
 * Drift = the agent has drifted from the task queue. It has pending tasks
 * but its recent tool trajectory is all exploration/navigation, not
 * implementation.
 *
 * drift_score = pendingTaskCount * (1 - implementationToolRatio)
 *
 * implementationToolRatio = (CREATE + MODIFY calls) / total recent calls.
 *
 * If pendingTasks=3 and ratio=0.0 -> score=3.0 (derailed).
 * If pendingTasks=3 and ratio=0.8 -> score=0.6 (mild).
 */
export interface DriftReport {
  readonly score: number;
  readonly verdict: 'ON_TRACK' | 'DRIFTING' | 'DERAILED';
  readonly pendingTaskCount: number;
  readonly implementationToolRatio: number;
  readonly recentImplementationCalls: number;
  readonly totalRecentCalls: number;
  readonly windowSize: number;
  readonly explanation: string;
  /** Whether drift was detected (verdict !== ON_TRACK). Set by interveneOnDrift. */
  driftDetected?: boolean;
  /** Drift severity mapped from verdict. */
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Alias for score — used by T5 intervention hook. */
  driftScore?: number;
}

export const DRIFT_THRESHOLDS = {
  ON_TRACK: 0.7, // score <= 0.7 -> ON_TRACK
  DRIFTING: 1.5, // 0.7 < score <= 1.5 -> DRIFTING
  // score > 1.5 -> DERAILED
  WARN_THRESHOLD: 0.7,
} as const;

// ============================================================================
// T-5: Read-Before-Write Freshness Types (Bible §14)
// ============================================================================

/**
 * Three-layer per-file freshness state.
 *
 *   NEVER_READ — file not read in last FRESHNESS_WINDOW_MS -> BLOCK
 *   STALE      — file read but beyond half-life -> WARN (once per file)
 *   FRESH      — file read within window -> PASS
 *
 * Per Bible §14: an agent must not write a file it has not freshly read,
 * because the file may have changed since the read, making the write
 * operate on a stale model.
 */
export interface FreshnessVerdict {
  readonly state: 'NEVER_READ' | 'STALE' | 'FRESH';
  readonly action: 'BLOCK' | 'WARN' | 'PASS';
  readonly filePath: string;
  readonly lastReadTimestamp?: string;
  readonly ageMs: number;
  readonly reason: string;
  /** If WARN, has this file already been warned about? (one warning per file). */
  readonly alreadyWarned: boolean;
}

/** Internal freshness bookkeeping entry. */
export interface FreshnessEntry {
  readonly filePath: string;
  readonly lastReadTimestamp: string;
  readonly lastReadSequence: number;
  /** Has a STALE warning already been emitted since last read? */
  warnedStale: boolean;
}

/**
 * Freshness window: 5 minutes (300000 ms). A read older than this is
 * treated as NEVER_READ (untrustworthy).
 */
export const FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 300000
/** Half-life: reads older than this are STALE (warn) but not yet NEVER_READ. */
export const FRESHNESS_HALFLIFE_MS = 2.5 * 60 * 1000; // 150000

// ============================================================================
// Task Queue Snapshot Types
// ============================================================================

export interface PendingTask {
  readonly id: string;
  readonly description: string;
  /** Output file paths this task will produce. */
  readonly outputPaths: string[];
  readonly gate: GateName;
}

export interface CompletedTask {
  readonly id: string;
  readonly outputPath: string;
}

export interface TaskQueueSnapshot {
  readonly pendingTasks: PendingTask[];
  readonly completedTasks: CompletedTask[];
}

// ============================================================================
// Aggregate Verdict + Interventions
// ============================================================================

export type InterventionType =
  | 'INJECT_CONTEXT' // T-2: inject required docs
  | 'WARN_STAGNATION' // T-3: agent is wandering
  | 'WARN_DRIFT' // T-4: agent drifted from tasks
  | 'BLOCK_STALE_WRITE' // T-5: never-read or warn-stale
  | 'WARN_MISALIGNED'; // T-1: wrong workflow shape

export type InterventionSeverity = 'INFO' | 'WARN' | 'BLOCK';

export interface TrajectoryIntervention {
  readonly type: InterventionType;
  readonly severity: InterventionSeverity;
  readonly message: string;
  readonly data: Record<string, unknown>;
}

/**
 * The complete trajectory verdict emitted on every tool call.
 * Composes the outputs of all five rules plus a composite health score.
 */
export interface TrajectoryVerdict {
  readonly timestamp: string;
  readonly sessionID: string;
  readonly gate: GateName;
  /** The node that triggered this evaluation. */
  readonly triggerNode: TrajectoryNode;
  readonly alignment: WorkflowAlignment; // T-1
  readonly relevance: ContextPrediction; // T-2
  readonly stagnation: StagnationReport; // T-3
  readonly drift: DriftReport; // T-4
  /** T-5 (null if the trigger was not a write). */
  readonly freshness: FreshnessVerdict | null;
  /** Composite health: 0.0 (critical) to 1.0 (healthy). */
  readonly health: number;
  /** Recommended intervention, if any. */
  readonly intervention?: TrajectoryIntervention;
}

/** Serialized engine state for compaction survival. */
export interface ContextManagementEngineState {
  readonly graph: {
    readonly nodes: TrajectoryNode[];
    readonly edges: TrajectoryEdge[];
    readonly sequenceCounter: number;
  };
  readonly freshness: FreshnessEntry[];
  readonly currentGate: GateName;
}

/** Input passed to ContextManagementEngine.observe(). */
export interface ToolCallObservation {
  readonly sessionID: string;
  readonly toolName: string;
  readonly filePath?: string;
  readonly touchedPaths?: string[];
  readonly succeeded?: boolean;
  readonly tokenCost?: number;
  /** Raw command string (used to refine ambiguous tools like bash). */
  readonly command?: string;
  readonly taskQueue: TaskQueueSnapshot;
}
