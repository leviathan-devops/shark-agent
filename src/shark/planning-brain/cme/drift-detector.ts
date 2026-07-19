/**
 * drift-detector.ts — T-4: Drift Detection (Order 2)
 *
 * Answers: "Has the agent drifted from the task queue?"
 *
 * Drift combines the pending task count with the implementation tool ratio
 * in the recent window. An agent with many pending tasks but a low
 * implementation ratio has drifted — it is busy but not productive.
 *
 *   implementationToolRatio = (CREATE + MODIFY calls) / total recent calls
 *   drift_score = pendingTaskCount * (1 - implementationToolRatio)
 *
 *   pendingTasks=3, ratio=0.0 -> score=3.0 (derailed)
 *   pendingTasks=3, ratio=0.8 -> score=0.6 (mild)
 *   pendingTasks=0           -> score=0.0 (nothing to drift from)
 *
 * Relationship to T-3: T-3 is about the QUALITY of exploration (are the
 * reads on-target?). T-4 is about the QUANTITY of implementation (is the
 * agent building?). An agent can be directed-but-drifting (reading the right
 * files but never writing) or stagnant-but-on-track.
 */
import { DRIFT_THRESHOLDS } from './cme-types.js';
import type {
  DriftReport,
  SemanticCategory,
  TaskQueueSnapshot,
} from './cme-types.js';
import type { TrajectoryGraph } from './trajectory-graph.js';

const WINDOW_SIZE = 10;

/** Categories that count as "implementation" (building/modifying). */
const IMPLEMENTATION_CATEGORIES: ReadonlySet<SemanticCategory> = new Set<
  SemanticCategory
>(['CREATE', 'MODIFY']);

export class DriftDetector {
  detect(graph: TrajectoryGraph, taskQueue: TaskQueueSnapshot): DriftReport {
    const recent = graph.recentNodes(WINDOW_SIZE);
    const total = recent.length;

    let implCount = 0;
    for (const n of recent) {
      if (IMPLEMENTATION_CATEGORIES.has(n.category)) implCount++;
    }

    const pendingTaskCount = taskQueue.pendingTasks.length;
    const implementationToolRatio = total > 0 ? implCount / total : 0;
    const score = pendingTaskCount * (1 - implementationToolRatio);

    let verdict: DriftReport['verdict'];
    if (score <= DRIFT_THRESHOLDS.ON_TRACK) verdict = 'ON_TRACK';
    else if (score <= DRIFT_THRESHOLDS.DRIFTING) verdict = 'DRIFTING';
    else verdict = 'DERAILED';

    return {
      score,
      verdict,
      pendingTaskCount,
      implementationToolRatio,
      recentImplementationCalls: implCount,
      totalRecentCalls: total,
      windowSize: WINDOW_SIZE,
      explanation: this.explain(verdict, score, pendingTaskCount, implCount, total),
    };
  }

  private explain(
    verdict: string,
    score: number,
    pending: number,
    impl: number,
    total: number,
  ): string {
    const ratio = total > 0 ? impl / total : 0;
    return `${verdict}: ${pending} pending tasks, ${impl}/${total} recent calls implementation (ratio ${ratio.toFixed(2)}), drift ${score.toFixed(2)}`;
  }
}

export { WINDOW_SIZE, IMPLEMENTATION_CATEGORIES };

// ===========================================================================
// T5: DRIFT INTERVENTION HOOK
// ===========================================================================

/**
 * Intervene when drift is detected.
 *
 * - If drift is not detected → NONE, reset count.
 * - If drift severity is CRITICAL (DERAILED) or HIGH (DRIFTING) →
 *     - First occurrence: WARN
 *     - Second+ consecutive: PSM_ACTIVATE (escalate to ProblemSolvingMode)
 * - MEDIUM / LOW drift → NONE (below intervention threshold).
 */
export function interveneOnDrift(
  driftReport: DriftReport,
  previousDriftCount: number,
): {
  action: 'WARN' | 'PSM_ACTIVATE' | 'NONE';
  message: string;
  updatedCount: number;
} {
  const driftDetected = driftReport.verdict !== 'ON_TRACK';
  const newCount = driftDetected ? previousDriftCount + 1 : 0;

  if (!driftDetected) {
    return { action: 'NONE', message: '', updatedCount: 0 };
  }

  const severity: DriftReport['severity'] =
    driftReport.verdict === 'DERAILED' ? 'CRITICAL' : 'MEDIUM';

  // Annotate the report so callers can inspect severity without re-deriving
  driftReport.driftDetected = true;
  driftReport.severity = severity;
  driftReport.driftScore = driftReport.score;

  if (severity === 'CRITICAL') {
    if (newCount >= 2) {
      return {
        action: 'PSM_ACTIVATE',
        message: `[T5] Persistent drift detected (${newCount} consecutive checks). Activating ProblemSolvingMode. Severity: ${severity}, Score: ${driftReport.score}`,
        updatedCount: newCount,
      };
    }
    return {
      action: 'WARN',
      message: `[T5] Drift detected. Severity: ${severity}, Score: ${driftReport.score}. If drift persists, ProblemSolvingMode will activate.`,
      updatedCount: newCount,
    };
  }

  return { action: 'NONE', message: '', updatedCount: newCount };
}
