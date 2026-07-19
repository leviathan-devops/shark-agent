/**
 * workflow-alignment-scorer.ts — T-1: Semantic Trajectory Analysis (Order 2-3)
 *
 * Answers: "Does the actual tool sequence match the expected workflow for the
 * current gate?"
 *
 * Algorithm (EXACT — do not approximate):
 *   1. Build the actual category distribution from the last 20 nodes.
 *   2. Compute Total Variation Distance (TVD):
 *        TVD = 0.5 * Σ_c |actual_fraction_c - expected_fraction_c|   ∈ [0, 1]
 *   3. Compute ordering penalty: fraction of backward phase transitions
 *      (TEST->MODIFY debug loop is exempted).
 *   4. Compute required penalty: 0 if required category present at minCount,
 *      0.5 if absent.
 *   5. distance = 0.45*TVD + 0.30*orderingPenalty + 0.25*requiredPenalty
 *      clamped to [0, 1].
 *   6. verdict: distance <= 0.30 ALIGNED; <= 0.60 DRIFTING; > 0.60 MISALIGNED.
 *
 * TVD is used (not KL-divergence or chi-squared) because it is symmetric,
 * bounded, and handles zero-probability categories gracefully (no division
 * by zero).
 */
import {
  ALIGNMENT_THRESHOLDS,
  ALIGNMENT_WEIGHTS,
  ALL_CATEGORIES,
  PHASE_ORDER,
} from './cme-types.js';
import type {
  CategoryCount,
  CategoryDistribution,
  GateName,
  ReferencePath,
  SemanticCategory,
  TrajectoryNode,
  TransitionSummary,
  WorkflowAlignment,
} from './cme-types.js';
import type { TrajectoryGraph } from './trajectory-graph.js';

/**
 * Reference paths encode the EXPECTED workflow shape per gate.
 *
 * These are NOT regex. They are domain knowledge: "at the BUILD gate, the
 * agent should be predominantly writing/creating, with some reading, and
 * must have at least minCount CREATE calls."
 */
const REFERENCE_PATHS: Record<GateName, ReferencePath> = {
  PLAN: {
    gate: 'PLAN',
    description: 'Plan gate: agent should explore the spec and write a plan.',
    requiredCategory: 'CREATE',
    expected: [
      { category: 'EXPLORE', fraction: 0.55, minCount: 3 },
      { category: 'CREATE', fraction: 0.25, minCount: 1 },
      { category: 'NAVIGATE', fraction: 0.1, minCount: 0 },
      { category: 'MODIFY', fraction: 0.05, minCount: 0 },
      { category: 'TEST', fraction: 0.0, minCount: 0 },
      { category: 'VERIFY', fraction: 0.0, minCount: 0 },
      { category: 'CLAIM', fraction: 0.05, minCount: 0 },
    ],
  },
  BUILD: {
    gate: 'BUILD',
    description: 'Build gate: agent should be predominantly creating/modifying code.',
    requiredCategory: 'CREATE',
    expected: [
      { category: 'EXPLORE', fraction: 0.2, minCount: 1 },
      { category: 'CREATE', fraction: 0.4, minCount: 2 },
      { category: 'MODIFY', fraction: 0.25, minCount: 1 },
      { category: 'NAVIGATE', fraction: 0.05, minCount: 0 },
      { category: 'TEST', fraction: 0.05, minCount: 0 },
      { category: 'VERIFY', fraction: 0.0, minCount: 0 },
      { category: 'CLAIM', fraction: 0.05, minCount: 0 },
    ],
  },
  VERIFY: {
    gate: 'VERIFY',
    description: 'Verify gate: agent should run audits and read evidence.',
    requiredCategory: 'VERIFY',
    expected: [
      { category: 'EXPLORE', fraction: 0.25, minCount: 1 },
      { category: 'CREATE', fraction: 0.05, minCount: 0 },
      { category: 'MODIFY', fraction: 0.15, minCount: 0 },
      { category: 'VERIFY', fraction: 0.4, minCount: 1 },
      { category: 'TEST', fraction: 0.05, minCount: 0 },
      { category: 'NAVIGATE', fraction: 0.05, minCount: 0 },
      { category: 'CLAIM', fraction: 0.05, minCount: 0 },
    ],
  },
  TEST: {
    gate: 'TEST',
    description: 'Test gate: agent should run mechanical tests.',
    requiredCategory: 'TEST',
    expected: [
      { category: 'EXPLORE', fraction: 0.2, minCount: 1 },
      { category: 'TEST', fraction: 0.45, minCount: 1 },
      { category: 'MODIFY', fraction: 0.15, minCount: 0 },
      { category: 'VERIFY', fraction: 0.1, minCount: 0 },
      { category: 'CREATE', fraction: 0.05, minCount: 0 },
      { category: 'NAVIGATE', fraction: 0.05, minCount: 0 },
    ],
  },
  AUDIT: {
    gate: 'AUDIT',
    description: 'Audit gate: agent should run audits and submit evidence.',
    requiredCategory: 'VERIFY',
    expected: [
      { category: 'VERIFY', fraction: 0.35, minCount: 1 },
      { category: 'EXPLORE', fraction: 0.25, minCount: 1 },
      { category: 'CLAIM', fraction: 0.2, minCount: 1 },
      { category: 'MODIFY', fraction: 0.1, minCount: 0 },
      { category: 'TEST', fraction: 0.05, minCount: 0 },
      { category: 'NAVIGATE', fraction: 0.05, minCount: 0 },
    ],
  },
  DELIVERY: {
    gate: 'DELIVERY',
    description: 'Delivery gate: agent should submit final evidence.',
    requiredCategory: 'CLAIM',
    expected: [
      { category: 'CLAIM', fraction: 0.4, minCount: 1 },
      { category: 'VERIFY', fraction: 0.25, minCount: 0 },
      { category: 'EXPLORE', fraction: 0.2, minCount: 0 },
      { category: 'MODIFY', fraction: 0.1, minCount: 0 },
      { category: 'NAVIGATE', fraction: 0.05, minCount: 0 },
    ],
  },
  UNKNOWN: {
    gate: 'UNKNOWN',
    description: 'Gate unknown: no reference path. Always ALIGNED.',
    requiredCategory: 'EXPLORE',
    expected: [],
  },
};

export function getReferencePath(gate: GateName): ReferencePath {
  return REFERENCE_PATHS[gate] ?? REFERENCE_PATHS.UNKNOWN;
}

export class WorkflowAlignmentScorer {
  private referencePath: ReferencePath;

  /** Number of recent nodes the alignment is scored over. */
  private readonly windowSize = 20;

  constructor() {
    this.referencePath = getReferencePath('UNKNOWN');
  }

  /** Update the reference path source (called on gate transitions). */
  setReferencePath(gate: GateName): void {
    this.referencePath = getReferencePath(gate);
  }

  /**
   * Score the workflow alignment of the current trajectory graph.
   *
   * distance = w_tvd * TVD + w_order * orderingPenalty + w_req * requiredPenalty
   *
   * Each component ∈ [0,1]; weights sum to 1.0; result clamped to [0,1].
   */
  score(graph: TrajectoryGraph, gate: GateName): WorkflowAlignment {
    const reference = getReferencePath(gate);
    const nodes = graph.recentNodes(this.windowSize);

    // Trivial aligned when there is nothing to score or no reference path.
    if (nodes.length === 0 || reference.expected.length === 0) {
      return this.trivialAligned(gate, reference);
    }

    // 1. Actual category distribution (fractions over the window).
    const actualDistribution = this.computeDistribution(nodes);

    // 2. Category distribution distance (Total Variation Distance).
    const tvd = this.distributionDistance(actualDistribution, reference.expected);

    // 3. Ordering penalty: backward phase transitions / comparable transitions.
    const orderingPenalty = this.orderingPenalty(nodes);

    // 4. Required category presence.
    const requiredCount =
      actualDistribution.find((c: CategoryCount) => c.category === reference.requiredCategory)
        ?.count ?? 0;
    const requiredMinCount =
      reference.expected.find((c: CategoryDistribution) => c.category === reference.requiredCategory)
        ?.minCount ?? 1;
    const requiredCategoryPresent = requiredCount >= requiredMinCount;
    const requiredPenalty = requiredCategoryPresent ? 0.0 : 0.5;

    // 5. Weighted combination, clamped to [0, 1].
    const distance = clamp01(
      ALIGNMENT_WEIGHTS.TVD * tvd +
        ALIGNMENT_WEIGHTS.ORDERING * orderingPenalty +
        ALIGNMENT_WEIGHTS.REQUIRED * requiredPenalty,
    );

    // 6. Transitions summary from the actual graph.
    const transitions = this.summarizeTransitions(graph);

    // 7. Verdict.
    const verdict: WorkflowAlignment['verdict'] =
      distance <= ALIGNMENT_THRESHOLDS.ALIGNED
        ? 'ALIGNED'
        : distance <= ALIGNMENT_THRESHOLDS.DRIFTING
          ? 'DRIFTING'
          : 'MISALIGNED';

    return {
      distance,
      verdict,
      actualDistribution,
      expectedDistribution: reference.expected,
      requiredCategoryPresent,
      transitions,
      explanation: this.explain(distance, tvd, orderingPenalty, requiredPenalty, reference),
    };
  }

  /**
   * Compute the category distribution (counts + fractions) of a node list.
   * Every category is present in the result (zero count if absent) so the
   * TVD sweep over ALL_CATEGORIES is exhaustive.
   */
  private computeDistribution(nodes: TrajectoryNode[]): CategoryCount[] {
    const counts = new Map<SemanticCategory, number>();
    for (const cat of ALL_CATEGORIES) counts.set(cat, 0);
    for (const n of nodes) {
      counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
    }
    const total = nodes.length;
    return ALL_CATEGORIES.map((cat: SemanticCategory) => ({
      category: cat,
      count: counts.get(cat) ?? 0,
      fraction: total > 0 ? (counts.get(cat) ?? 0) / total : 0,
    }));
  }

  /**
   * Distribution distance using Total Variation Distance (a proper metric).
   *
   *     TVD(P, Q) = 0.5 * Σ_c |P(c) - Q(c)|
   *
   * Range [0, 1]: 0 = identical distributions, 1 = disjoint. TVD is
   * symmetric, bounded, and never divides by zero (unlike KL-divergence).
   */
  private distributionDistance(
    actual: CategoryCount[],
    expected: CategoryDistribution[],
  ): number {
    let sum = 0;
    for (const cat of ALL_CATEGORIES) {
      const a = actual.find((c: CategoryCount) => c.category === cat)?.fraction ?? 0;
      const e = expected.find((c: CategoryDistribution) => c.category === cat)?.fraction ?? 0;
      sum += Math.abs(a - e);
    }
    return Math.min(1, 0.5 * sum);
  }

  /**
   * Ordering penalty: fraction of transitions that go backward in the phase
   * order. A backward transition (later -> earlier phase) is out of order
   * UNLESS it is a legitimate TEST->MODIFY debug loop.
   */
  private orderingPenalty(nodes: TrajectoryNode[]): number {
    let outOfOrder = 0;
    let comparableTransitions = 0;
    for (let i = 1; i < nodes.length; i++) {
      const prevPhase = PHASE_ORDER[nodes[i - 1].category];
      const currPhase = PHASE_ORDER[nodes[i].category];
      const isLegitDebugBack =
        nodes[i - 1].category === 'TEST' && nodes[i].category === 'MODIFY';
      if (currPhase < prevPhase && !isLegitDebugBack) {
        outOfOrder++;
      }
      if (currPhase !== prevPhase) comparableTransitions++;
    }
    if (comparableTransitions === 0) return 0;
    return Math.min(1, outOfOrder / comparableTransitions);
  }

  /** Summarize transition types observed in the recent window. */
  private summarizeTransitions(graph: TrajectoryGraph): TransitionSummary[] {
    const edges = graph.recentEdges(this.windowSize - 1);
    const byTransition = new Map<string, { count: number; weightSum: number }>();
    for (const e of edges) {
      const entry = byTransition.get(e.transition) ?? {
        count: 0,
        weightSum: 0,
      };
      entry.count++;
      entry.weightSum += e.weight;
      byTransition.set(e.transition, entry);
    }
    return Array.from(byTransition.entries()).map(([transition, v]: [string, { count: number; weightSum: number }]) => ({
      transition,
      count: v.count,
      averageWeight: v.count > 0 ? v.weightSum / v.count : 0,
    }));
  }

  private explain(
    distance: number,
    dist: number,
    order: number,
    required: number,
    reference: ReferencePath,
  ): string {
    const parts: string[] = [];
    if (dist > 0.3)
      parts.push(`category distribution off (TVD=${dist.toFixed(2)})`);
    if (order > 0.3) parts.push(`ordering wrong (penalty=${order.toFixed(2)})`);
    if (required > 0)
      parts.push(`required category ${reference.requiredCategory} missing`);
    if (parts.length === 0) return `aligned (distance=${distance.toFixed(2)})`;
    return parts.join('; ');
  }

  private trivialAligned(
    gate: GateName,
    reference: ReferencePath,
  ): WorkflowAlignment {
    return {
      distance: 0,
      verdict: 'ALIGNED',
      actualDistribution: [],
      expectedDistribution: reference.expected,
      requiredCategoryPresent: true,
      transitions: [],
      explanation: 'insufficient trajectory or no reference path',
    };
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
