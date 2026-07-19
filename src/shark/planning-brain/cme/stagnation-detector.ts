/**
 * stagnation-detector.ts — T-3: Stagnation Detection (Order 2-3)
 *
 * Answers: "Is the agent exploring without direction?"
 *
 * The key insight: stagnation is NOT "same tool 3 times". The agent could
 * call many DIFFERENT read/grep/glob tools on many DIFFERENT files and STILL
 * be stagnant, because none of those files are the target of any pending
 * task. This is "exploration without direction" — the signature failure mode
 * the L1 lobe cannot detect.
 *
 * Algorithm:
 *   1. Identify the current explore streak: the maximal suffix of recent
 *      nodes that are all EXPLORE category.
 *   2. Collect all distinct file paths touched in the streak.
 *   3. Compute the relevant path set: pending task outputPaths + inferred
 *      input dirs + always-relevant context docs (SPEC, BUILD_STATE,
 *      TASK_QUEUE).
 *   4. Partition touched paths into relevantReads / irrelevantReads.
 *   5. score = irrelevantReads / touchedPaths  (0 if empty).
 *   6. Apply thresholds; require MIN_EXPLORE_STREAK (4) before firing.
 */
import { STAGNATION_THRESHOLDS } from './cme-types.js';
import type {
  PendingTask,
  StagnationReport,
  TaskQueueSnapshot,
  TrajectoryNode,
} from './cme-types.js';
import type { TrajectoryGraph } from './trajectory-graph.js';

export class StagnationDetector {
  /** Number of recent nodes the detector inspects. */
  private readonly windowSize = 20;

  detect(graph: TrajectoryGraph, taskQueue: TaskQueueSnapshot): StagnationReport {
    const recent = graph.recentNodes(this.windowSize);

    // 1. Find explore streak (maximal EXPLORE suffix).
    let streakStart = recent.length;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].category === 'EXPLORE') {
        streakStart = i;
      } else {
        // streak broken by a non-EXPLORE call
        break;
      }
    }
    const exploreStreak = recent.length - streakStart;

    // Collect touched paths in the streak.
    const streakNodes = recent.slice(streakStart);
    const touchedPaths = this.collectPaths(streakNodes);

    // 2. Compute the relevant path set.
    const relevantSet = this.computeRelevantSet(taskQueue);

    // 3. Partition touched paths into relevant / irrelevant.
    const relevantReads: string[] = [];
    const irrelevantReads: string[] = [];
    for (const p of touchedPaths) {
      if (this.isRelevant(p, relevantSet)) relevantReads.push(p);
      else irrelevantReads.push(p);
    }

    // 4. Score.
    const total = touchedPaths.length;
    const score = total > 0 ? irrelevantReads.length / total : 0;

    // 5. Verdict (require min streak to avoid false positives).
    let verdict: StagnationReport['verdict'];
    if (exploreStreak < STAGNATION_THRESHOLDS.MIN_EXPLORE_STREAK) {
      verdict = 'DIRECTED'; // too short to call stagnant
    } else if (score <= STAGNATION_THRESHOLDS.DIRECTED) {
      verdict = 'DIRECTED';
    } else if (score <= STAGNATION_THRESHOLDS.WANDERING) {
      verdict = 'WANDERING';
    } else {
      verdict = 'STAGNANT';
    }

    // 6. Expected next reads = pending task outputPaths not yet read.
    const readSet = new Set(touchedPaths);
    const expectedNextReads = taskQueue.pendingTasks
      .flatMap((t: PendingTask) => t.outputPaths)
      .filter((p: string) => !readSet.has(p));

    return {
      score,
      verdict,
      relevantReads,
      irrelevantReads,
      expectedNextReads,
      exploreStreak,
      explanation: this.explain(
        verdict,
        score,
        exploreStreak,
        relevantReads.length,
        irrelevantReads.length,
      ),
    };
  }

  /** Collect all distinct, normalized file paths touched by EXPLORE nodes. */
  private collectPaths(nodes: TrajectoryNode[]): string[] {
    const paths = new Set<string>();
    for (const n of nodes) {
      if (n.filePath) paths.add(this.normalize(n.filePath));
      if (n.touchedPaths) {
        for (const p of n.touchedPaths) paths.add(this.normalize(p));
      }
    }
    return Array.from(paths);
  }

  /**
   * Compute the set of paths relevant to the task queue.
   * = pending task outputPaths + inferred input dirs + always-relevant docs.
   */
  private computeRelevantSet(taskQueue: TaskQueueSnapshot): Set<string> {
    const relevant = new Set<string>();
    for (const task of taskQueue.pendingTasks) {
      for (const p of task.outputPaths) {
        relevant.add(this.normalize(p));
        // Infer: sibling files in the same directory are likely inputs.
        const dir = this.dirname(p);
        relevant.add(this.normalize(dir));
      }
    }
    // Always-relevant context docs.
    relevant.add('SPEC.md');
    relevant.add('BUILD_STATE.md');
    relevant.add('TASK_QUEUE.md');
    return relevant;
  }

  /**
   * Is a path relevant? A path is relevant if:
   *   - it exactly matches a relevant path, OR
   *   - it is a child of a relevant directory, OR
   *   - its dirname is a prefix of a relevant path (same dir as relevant), OR
   *   - its basename matches a relevant basename (loose match for renames)
   */
  private isRelevant(path: string, relevantSet: Set<string>): boolean {
    const norm = this.normalize(path);
    if (relevantSet.has(norm)) return true;
    const dir = this.dirname(norm);
    const base = this.basename(norm);
    for (const r of relevantSet) {
      if (norm.startsWith(r + '/')) return true; // child of relevant dir
      if (r.startsWith(dir + '/')) return true; // same dir as relevant
      if (this.basename(r) === base) return true; // loose basename
    }
    return false;
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  private dirname(p: string): string {
    const n = this.normalize(p);
    const i = n.lastIndexOf('/');
    return i > 0 ? n.slice(0, i) : '.';
  }

  private basename(p: string): string {
    const n = this.normalize(p);
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
  }

  private explain(
    verdict: string,
    score: number,
    streak: number,
    relevant: number,
    irrelevant: number,
  ): string {
    if (verdict === 'DIRECTED') {
      return `directed exploration (${relevant} relevant, streak ${streak})`;
    }
    if (verdict === 'WANDERING') {
      return `wandering: ${irrelevant}/${relevant + irrelevant} reads off-target (score ${score.toFixed(2)})`;
    }
    return `STAGNANT: ${irrelevant}/${relevant + irrelevant} reads off-target, streak ${streak} (score ${score.toFixed(2)})`;
  }
}
