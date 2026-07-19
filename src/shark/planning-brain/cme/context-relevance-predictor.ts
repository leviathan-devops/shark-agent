/**
 * context-relevance-predictor.ts — T-2: Context Relevance Prediction (Order 2)
 *
 * Answers: "Based on the current tool category + gate + task phase, which
 * context documents does the agent need RIGHT NOW?"
 *
 * Goal: PRECISION INJECTION. Inject only the documents the agent needs at
 * this moment, not everything. This prevents context flooding (wasting
 * tokens on irrelevant docs) and context starvation (omitting a needed doc).
 *
 * The prediction is determined by WHAT the agent is doing (tool category) and
 * WHERE in the workflow it is (gate), refined by the task phase. A
 * suppression list explicitly marks docs NOT to inject at a key, overriding
 * any "inject everything" default.
 */
import type {
  ContextPrediction,
  ContextPredictionKey,
  GateName,
  RequiredDoc,
  SemanticCategory,
  TaskPhase,
  TaskQueueSnapshot,
} from './cme-types.js';

type TableEntry = RequiredDoc[];

/**
 * Key helper: gate and category combine into a stable lookup string.
 */
function k(gate: GateName, cat: SemanticCategory): string {
  return `${gate}:${cat}`;
}

/**
 * The context relevance prediction table.
 *
 * Examples:
 *   (BUILD, CREATE) -> BUILD_STATE.md, TASK_QUEUE.md, EngineeringChecklist.json
 *   (TEST, TEST)    -> ContainerTestResult.json template, container config
 *   (PLAN, EXPLORE) -> SPEC.md, architecture docs
 */
const PREDICTION_TABLE: Map<string, TableEntry> = new Map<string, TableEntry>();

// --- PLAN gate ---
PREDICTION_TABLE.set(k('PLAN', 'EXPLORE'), [
  { doc: 'SPEC.md', reason: 'source of truth for requirements', priority: 'CRITICAL' },
  { doc: 'architecture/overview.md', reason: 'system shape to plan against', priority: 'IMPORTANT' },
  { doc: 'TASK_QUEUE.md', reason: 'decompose against existing tasks', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('PLAN', 'CREATE'), [
  { doc: 'BUILD_STATE.md', reason: 'plan output target format', priority: 'CRITICAL' },
  { doc: 'TASK_QUEUE.md', reason: 'populate task decomposition', priority: 'CRITICAL' },
  { doc: 'SPEC.md', reason: 'verify plan covers requirements', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('PLAN', 'NAVIGATE'), [
  { doc: 'TASK_QUEUE.md', reason: 'check task queue state', priority: 'IMPORTANT' },
]);

// --- BUILD gate ---
PREDICTION_TABLE.set(k('BUILD', 'CREATE'), [
  { doc: 'BUILD_STATE.md', reason: 'what has been built so far', priority: 'CRITICAL' },
  { doc: 'TASK_QUEUE.md', reason: 'which task is being implemented', priority: 'CRITICAL' },
  { doc: 'EngineeringChecklist.json', reason: 'engineering constraints to satisfy', priority: 'CRITICAL' },
  { doc: 'patterns/known-good.md', reason: 'proven patterns to reuse', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('BUILD', 'MODIFY'), [
  { doc: 'BUILD_STATE.md', reason: 'file being modified state', priority: 'CRITICAL' },
  { doc: 'TASK_QUEUE.md', reason: 'task ownership of file', priority: 'CRITICAL' },
  { doc: 'patterns/known-good.md', reason: 'refactor patterns', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('BUILD', 'EXPLORE'), [
  { doc: 'BUILD_STATE.md', reason: 'understand current build state', priority: 'IMPORTANT' },
  { doc: 'patterns/known-good.md', reason: 'patterns to mirror', priority: 'IMPORTANT' },
  { doc: 'failures/known-bad.md', reason: 'anti-patterns to avoid', priority: 'OPTIONAL' },
]);
PREDICTION_TABLE.set(k('BUILD', 'TEST'), [
  { doc: 'ContainerTestResult.json', reason: 'test result template', priority: 'IMPORTANT' },
  { doc: 'container-config.md', reason: 'container test harness config', priority: 'IMPORTANT' },
]);

// --- VERIFY gate ---
PREDICTION_TABLE.set(k('VERIFY', 'VERIFY'), [
  { doc: 'TridentReview.json', reason: 'audit result schema', priority: 'CRITICAL' },
  { doc: 'TRIDENT_CODE_REVIEW', reason: 'expected audit artifact', priority: 'CRITICAL' },
  { doc: 'BUILD_STATE.md', reason: 'what was built, to verify', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('VERIFY', 'EXPLORE'), [
  { doc: 'BUILD_STATE.md', reason: 'review build output', priority: 'IMPORTANT' },
  { doc: 'evidence/chain', reason: 'verify evidence integrity', priority: 'IMPORTANT' },
]);

// --- TEST gate ---
PREDICTION_TABLE.set(k('TEST', 'TEST'), [
  { doc: 'ContainerTestResult.json', reason: 'container test result template', priority: 'CRITICAL' },
  { doc: 'container-config.md', reason: 'container harness configuration', priority: 'CRITICAL' },
  { doc: 'BUILD_STATE.md', reason: 'what to test', priority: 'IMPORTANT' },
]);
PREDICTION_TABLE.set(k('TEST', 'MODIFY'), [
  { doc: 'ContainerTestResult.json', reason: 'last test failures to fix', priority: 'CRITICAL' },
  { doc: 'BUILD_STATE.md', reason: 'file under test', priority: 'IMPORTANT' },
]);

// --- AUDIT gate ---
PREDICTION_TABLE.set(k('AUDIT', 'VERIFY'), [
  { doc: 'TridentReview.json', reason: 'audit artifact', priority: 'CRITICAL' },
  { doc: 'SpecAlignmentReport.json', reason: 'spec compliance', priority: 'CRITICAL' },
  { doc: 'TestAuthenticityReport.json', reason: 'test authenticity', priority: 'CRITICAL' },
]);
PREDICTION_TABLE.set(k('AUDIT', 'CLAIM'), [
  { doc: 'evidence/chain', reason: 'Merkle chain to submit', priority: 'CRITICAL' },
  { doc: 'DeliveryReport.json', reason: 'delivery summary', priority: 'IMPORTANT' },
]);

// --- DELIVERY gate ---
PREDICTION_TABLE.set(k('DELIVERY', 'CLAIM'), [
  { doc: 'DeliveryReport.json', reason: 'final delivery artifact', priority: 'CRITICAL' },
  { doc: 'evidence/chain', reason: 'complete evidence chain', priority: 'CRITICAL' },
]);
PREDICTION_TABLE.set(k('DELIVERY', 'VERIFY'), [
  { doc: 'DeliveryReport.json', reason: 'verify before delivery', priority: 'CRITICAL' },
]);

/**
 * Documents that should NEVER be injected at a given key (suppress flooding).
 */
const SUPPRESSION_TABLE: Map<string, string[]> = new Map<string, string[]>();
SUPPRESSION_TABLE.set(k('DELIVERY', 'CLAIM'), [
  'SPEC.md',
  'architecture/overview.md', // not needed at delivery
]);
SUPPRESSION_TABLE.set(k('TEST', 'TEST'), [
  'SPEC.md', // testing doesn't need the spec
]);

export function lookupPrediction(
  gate: GateName,
  category: SemanticCategory,
): { required: TableEntry; suppressed: string[] } {
  const required = PREDICTION_TABLE.get(k(gate, category)) ?? [];
  const suppressed = SUPPRESSION_TABLE.get(k(gate, category)) ?? [];
  return { required, suppressed };
}

export class ContextRelevancePredictor {
  /**
   * Predict which context documents the agent needs.
   *
   *   required = PREDICTION_TABLE[gate:category] or empty
   *   taskPhase = deriveTaskPhase(taskQueue)
   *   refined = required
   *     + troubleshooting docs if BLOCKED
   *     + delivery docs if NEAR_COMPLETION
   *   refined = dedupe(refined)
   *   confidence = required non-empty ? 0.85-0.95 : 0.40
   */
  predict(
    gate: GateName,
    category: SemanticCategory,
    taskQueue: TaskQueueSnapshot,
  ): ContextPrediction {
    const { required, suppressed } = lookupPrediction(gate, category);
    const taskPhase = this.deriveTaskPhase(taskQueue);

    // Refine: if BLOCKED, add troubleshooting docs.
    let refined = [...required];
    if (taskPhase === 'BLOCKED') {
      refined.push(
        {
          doc: 'failures/known-bad.md',
          reason: 'agent is blocked; consult failures',
          priority: 'CRITICAL',
        },
        {
          doc: 'crash-recovery.md',
          reason: 'blocked agents may need recovery playbook',
          priority: 'IMPORTANT',
        },
      );
    }
    if (taskPhase === 'NEAR_COMPLETION') {
      refined.push({
        doc: 'DeliveryReport.json',
        reason: 'approaching delivery',
        priority: 'IMPORTANT',
      });
    }

    // Deduplicate by doc name (later wins).
    refined = this.dedupe(refined);

    // Confidence: high on a direct table hit; lower when only refinements apply.
    const confidence =
      required.length > 0
        ? taskPhase === 'IN_PROGRESS'
          ? 0.95
          : 0.85
        : 0.4;

    const key: ContextPredictionKey = { gate, toolCategory: category, taskPhase };

    return {
      key,
      requiredDocs: refined,
      suppressedDocs: suppressed,
      confidence,
    };
  }

  /**
   * Derive the task phase from the task queue snapshot.
   *   no pending + has completed -> NEAR_COMPLETION
   *   no pending + none completed -> STARTING
   *   otherwise -> IN_PROGRESS
   */
  private deriveTaskPhase(q: TaskQueueSnapshot): TaskPhase {
    if (q.pendingTasks.length === 0 && q.completedTasks.length > 0) {
      return 'NEAR_COMPLETION';
    }
    if (q.pendingTasks.length === 0) return 'STARTING';
    return 'IN_PROGRESS';
  }

  private dedupe(docs: RequiredDoc[]): RequiredDoc[] {
    const seen = new Map<string, RequiredDoc>();
    for (const d of docs) seen.set(d.doc, d);
    return Array.from(seen.values());
  }
}
