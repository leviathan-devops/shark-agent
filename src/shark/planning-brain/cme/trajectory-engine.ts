/**
 * trajectory-engine.ts — ContextManagementEngine (Order 2-3, behavioral intelligence)
 *
 * The behavioral intelligence engine for Planning Brain Lobe 5. Runs on every
 * tool call and produces a TrajectoryVerdict consumed by the orchestrator.
 *
 * LIFECYCLE per observation:
 *   1. observe(toolCall)
 *   2. node = categoryMapper.map(toolCall)
 *   3. graph.append(node)
 *   4. verdict = evaluate(node)
 *      - alignment   = T-1 WorkflowAlignmentScorer.score(graph, gate)
 *      - relevance   = T-2 ContextRelevancePredictor.predict(gate, category, queue)
 *      - stagnation  = T-3 StagnationDetector.detect(graph, queue)
 *      - drift       = T-4 DriftDetector.detect(graph, queue)
 *      - freshness   = node is write ? T-5 FreshnessChecker.check(filePath) : null
 *   5. health = weighted composite of the five outputs
 *   6. intervention = highest-priority action (T-5 BLOCK is absolute)
 *
 * STATEFUL: maintains the trajectory graph and freshness map across the
 * session. serialize()/restore() guarantee compaction survival.
 *
 * Health formula (EXACT):
 *   health = 0.30*(1-distance)
 *          + 0.25*(1-stagnation)
 *          + 0.20*(1-normalizedDrift)
 *          + 0.15*freshnessFactor
 *          + 0.10*requiredPresent
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContextRelevancePredictor } from './context-relevance-predictor.js';
import { DriftDetector, interveneOnDrift } from './drift-detector.js';
import { FreshnessChecker } from './freshness-checker.js';
import { StagnationDetector } from './stagnation-detector.js';
import { ToolCategoryMapper } from './tool-category-mapper.js';
import { TrajectoryGraph } from './trajectory-graph.js';
import { WorkflowAlignmentScorer } from './workflow-alignment-scorer.js';
import type {
  ContextPrediction,
  DriftReport,
  FreshnessVerdict,
  GateName,
  RequiredDoc,
  SemanticCategory,
  StagnationReport,
  TaskQueueSnapshot,
  ContextManagementEngineState,
  TrajectoryIntervention,
  TrajectoryNode,
  TrajectoryVerdict,
  WorkflowAlignment,
} from './cme-types.js';

/** Input shape accepted by observe(). Supports both rich and minimal forms. */
export interface ObserveInput {
  readonly sessionID?: string;
  readonly sessionId?: string;
  readonly toolName: string;
  readonly filePath?: string;
  readonly touchedPaths?: string[];
  readonly succeeded?: boolean;
  readonly tokenCost?: number;
  /** Raw command string (refines ambiguous tools like bash). */
  readonly command?: string;
  /** Optional gate override; otherwise the engine's current gate is used. */
  readonly gate?: string;
  /**
   * Task queue. May be a full TaskQueueSnapshot, or a minimal { pending: n }
   * form which is normalized into a snapshot with n placeholder pending
   * tasks.
   */
  readonly taskQueue?: TaskQueueSnapshot | { pending: number };
}

export class ContextManagementEngine {
  private readonly categoryMapper: ToolCategoryMapper;
  private readonly graph: TrajectoryGraph;
  private readonly alignmentScorer: WorkflowAlignmentScorer;
  private readonly relevancePredictor: ContextRelevancePredictor;
  private readonly stagnationDetector: StagnationDetector;
  private readonly driftDetector: DriftDetector;
  private readonly freshnessChecker: FreshnessChecker;

  private currentGate: GateName = 'UNKNOWN';
  private lastVerdict: TrajectoryVerdict | null = null;
  private readonly sessionID: string;
  private consecutiveDriftCount: number = 0; // T5: escalate persistent drift → PSM

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
    this.sessionID = `cme-${Date.now().toString(36)}`;
    this.categoryMapper = new ToolCategoryMapper();
    this.graph = new TrajectoryGraph();
    this.alignmentScorer = new WorkflowAlignmentScorer();
    this.relevancePredictor = new ContextRelevancePredictor();
    this.stagnationDetector = new StagnationDetector();
    this.driftDetector = new DriftDetector();
    this.freshnessChecker = new FreshnessChecker();
  }

  private workspacePath: string;

  /** Update the active gate (and the T-1 reference path source). */
  setGate(gate: GateName | string): void {
    const g = (typeof gate === 'string' ? gate : String(gate)) as GateName;
    this.currentGate = normalizeGate(g);
    this.alignmentScorer.setReferencePath(this.currentGate);
  }

  /** Current active gate. */
  getGate(): GateName {
    return this.currentGate;
  }

  /** Direct access for adapters / tests. */
  getGraph(): TrajectoryGraph {
    return this.graph;
  }

  /** @deprecated No external consumer reads the freshness checker directly. The engine uses `this.freshnessChecker` internally for record/check/serialize/restore. Retained for test injection. */
  getFreshnessChecker(): FreshnessChecker {
    return this.freshnessChecker;
  }

  /**
   * Observe a tool call — the primary entry point, called by hooks.
   * Returns the TrajectoryVerdict for this observation.
   */
  observe(input: ObserveInput): TrajectoryVerdict {
    // Gate override: if the caller passes a gate, honor it.
    if (input.gate) this.setGate(input.gate);
    const gate = this.currentGate;
    const sessionID = input.sessionID ?? input.sessionId ?? this.sessionID;

    // PHASE 0: Map raw tool to semantic category (tip of the spear).
    const node: TrajectoryNode = this.categoryMapper.map({
      sessionID,
      toolName: input.toolName,
      filePath: input.filePath,
      touchedPaths: input.touchedPaths,
      succeeded: input.succeeded,
      tokenCost: input.tokenCost,
      gate,
      sequence: this.graph.nextSequence(),
      command: input.command,
    });

    // PHASE 1: Append to trajectory graph.
    this.graph.append(node);

    // Update freshness map on reads (EXPLORE touches the freshness of the
    // files it reads, so subsequent writes to them are FRESH).
    if (node.category === 'EXPLORE') {
      if (node.filePath) this.freshnessChecker.recordRead(node.filePath, node.sequence);
      if (node.touchedPaths) {
        for (const p of node.touchedPaths) {
          this.freshnessChecker.recordRead(p, node.sequence);
        }
      }
    }

    // Normalize the task queue snapshot.
    const taskQueue = this.normalizeQueue(input.taskQueue);

    // PHASE 2: Run the five rules.
    const alignment: WorkflowAlignment = this.alignmentScorer.score(this.graph, gate);
    const relevance: ContextPrediction = this.relevancePredictor.predict(
      gate,
      node.category,
      taskQueue,
    );
    const stagnation: StagnationReport = this.stagnationDetector.detect(this.graph, taskQueue);
    const drift: DriftReport = this.driftDetector.detect(this.graph, taskQueue);
    const freshness: FreshnessVerdict | null =
      this.isWriteCategory(node.category) && node.filePath
        ? this.freshnessChecker.check(node.filePath)
        : null;

    // PHASE 3: Compose verdict + select intervention.
    const health = this.computeHealth(alignment, stagnation, drift, freshness);
    const intervention = this.selectIntervention(
      alignment,
      relevance,
      stagnation,
      drift,
      freshness,
    );

    const verdict: TrajectoryVerdict = {
      timestamp: node.timestamp,
      sessionID,
      gate,
      triggerNode: node,
      alignment,
      relevance,
      stagnation,
      drift,
      freshness,
      health,
      intervention: intervention ?? undefined,
    };

    this.lastVerdict = verdict;
    if (verdict.intervention) {
      this.writeEvidence(verdict);
    }
    return verdict;
  }

  /**
   * Write a trajectory verdict evidence artifact to disk (best-effort).
   * Only called when an intervention is triggered.
   */
  private writeEvidence(verdict: TrajectoryVerdict): void {
    try {
      const evidenceDir = path.join(
        this.workspacePath,
        '.shark',
        'cme-evidence',
      );
      fs.mkdirSync(evidenceDir, { recursive: true });
      const evidencePath = path.join(
        evidenceDir,
        `TRAJECTORY_VERDICT_${Date.now()}.json`,
      );
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            ...verdict,
            engineVersion: 'CME-v5.0',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } catch {
      // Evidence writing is best-effort
    }
  }

  /**
   * Health is a composite of the five rule outputs (EXACT formula):
   *   health = 0.30*(1-distance)
   *          + 0.25*(1-stagnation)
   *          + 0.20*(1-normalizedDrift)
   *          + 0.15*freshnessFactor
   *          + 0.10*requiredPresent
   *
   * normalizedDrift = min(score/2, 1)
   * freshnessFactor = PASS 1.0 | WARN 0.5 | BLOCK 0.0 | null 1.0
   * requiredPresent = requiredCategoryPresent ? 1.0 : 0.0
   */
  computeHealth(
    a: WorkflowAlignment,
    s: StagnationReport,
    d: DriftReport,
    f: FreshnessVerdict | null,
  ): number {
    const freshnessFactor = f
      ? f.action === 'PASS'
        ? 1.0
        : f.action === 'WARN'
          ? 0.5
          : 0.0
      : 1.0;
    const driftNorm = Math.min(d.score / 2.0, 1.0);
    const requiredPresent = a.requiredCategoryPresent ? 1.0 : 0.0;

    const health =
      0.3 * (1 - a.distance) +
      0.25 * (1 - s.score) +
      0.2 * (1 - driftNorm) +
      0.15 * freshnessFactor +
      0.1 * requiredPresent;
    return Math.max(0, Math.min(1, health));
  }

  /**
   * Select the highest-priority intervention. Priority order reflects which
   * failures are most actionable / non-negotiable:
   *   1. T-5 BLOCK (absolute; Bible §14)
   *   2. T-5 WARN (first time only)
   *   3. T-4 DERAILED
   *   4. T-3 STAGNANT
   *   5. T-1 MISALIGNED
   *   6. T-2 CRITICAL context injection
   */
  selectIntervention(
    a: WorkflowAlignment,
    r: ContextPrediction,
    s: StagnationReport,
    d: DriftReport,
    f: FreshnessVerdict | null,
  ): TrajectoryIntervention | null {
    // T-5 BLOCK takes absolute priority (Bible §14 is non-negotiable).
    if (f && f.action === 'BLOCK') {
      return {
        type: 'BLOCK_STALE_WRITE',
        severity: 'BLOCK',
        message: `Cannot write ${f.filePath}: ${f.reason}. Read it freshly first.`,
        data: { filePath: f.filePath, ageMs: f.ageMs },
      };
    }
    // T-5 WARN (once per file).
    if (f && f.action === 'WARN' && !f.alreadyWarned) {
      return {
        type: 'BLOCK_STALE_WRITE',
        severity: 'WARN',
        message: `Stale read on ${f.filePath} (age ${Math.round(f.ageMs / 1000)}s). Consider re-reading before write.`,
        data: { filePath: f.filePath, ageMs: f.ageMs },
      };
    }
    // T-4 DERAILED — use T5 interveneOnDrift for consecutive-count escalation.
    if (d.verdict === 'DERAILED') {
      const driftIntervention = interveneOnDrift(d, this.consecutiveDriftCount);
      this.consecutiveDriftCount = driftIntervention.updatedCount;
      if (driftIntervention.action === 'PSM_ACTIVATE') {
        return {
          type: 'WARN_DRIFT',
          severity: 'BLOCK',
          message: driftIntervention.message,
          data: { score: d.score, pendingTasks: d.pendingTaskCount, consecutive: this.consecutiveDriftCount },
        };
      }
      if (driftIntervention.action === 'WARN') {
        return {
          type: 'WARN_DRIFT',
          severity: 'WARN',
          message: driftIntervention.message,
          data: { score: d.score, pendingTasks: d.pendingTaskCount },
        };
      }
    } else {
      // Reset consecutive count when back on track
      this.consecutiveDriftCount = 0;
    }
    // T-3 STAGNANT.
    if (s.verdict === 'STAGNANT') {
      return {
        type: 'WARN_STAGNATION',
        severity: 'WARN',
        message: `Exploration without direction: ${s.irrelevantReads.length} reads were not on task-target files. Next: ${s.expectedNextReads.slice(0, 3).join(', ')}`,
        data: { score: s.score, irrelevant: s.irrelevantReads },
      };
    }
    // T-1 MISALIGNED.
    if (a.verdict === 'MISALIGNED') {
      return {
        type: 'WARN_MISALIGNED',
        severity: 'WARN',
        message: `Workflow misaligned at ${this.currentGate} gate: ${a.explanation}`,
        data: { distance: a.distance, gate: this.currentGate },
      };
    }
    // T-2 INJECT (always, if there are CRITICAL docs).
    if (r.requiredDocs.some((d: RequiredDoc) => d.priority === 'CRITICAL')) {
      return {
        type: 'INJECT_CONTEXT',
        severity: 'INFO',
        message: `Context prediction for ${r.key.gate}/${r.key.toolCategory}: ${r.requiredDocs.length} docs relevant.`,
        data: { docs: r.requiredDocs.map((d: RequiredDoc) => d.doc) },
      };
    }
    return null;
  }

  private isWriteCategory(c: SemanticCategory): boolean {
    return c === 'CREATE' || c === 'MODIFY';
  }

  /**
   * Normalize the task queue input. Accepts a full snapshot or a minimal
   * { pending: n } form (expanded into n placeholder pending tasks so the
   * drift/stagnation math still works).
   */
  private normalizeQueue(
    q: TaskQueueSnapshot | { pending: number } | undefined,
  ): TaskQueueSnapshot {
    if (!q) return { pendingTasks: [], completedTasks: [] };
    // Detect the minimal { pending } form.
    if (
      typeof q === 'object' &&
      !Array.isArray((q as TaskQueueSnapshot).pendingTasks) &&
      typeof (q as { pending: number }).pending === 'number'
    ) {
      const n = (q as { pending: number }).pending;
      return {
        pendingTasks: Array.from({ length: n }, (_, i) => ({
          id: `T${i + 1}`,
          description: `task ${i + 1}`,
          outputPaths: [`out${i}.ts`],
          gate: this.currentGate,
        })),
        completedTasks: [],
      };
    }
    const snap = q as TaskQueueSnapshot;
    return {
      pendingTasks: Array.isArray(snap.pendingTasks) ? snap.pendingTasks : [],
      completedTasks: Array.isArray(snap.completedTasks) ? snap.completedTasks : [],
    };
  }

  getLastVerdict(): TrajectoryVerdict | null {
    return this.lastVerdict;
  }

  /**
   * Serialize the engine state for compaction survival.
   * Returns a JSON string (per the engine contract) containing the graph,
   * freshness map, and current gate.
   */
  serialize(): string {
    const state: ContextManagementEngineState = {
      graph: this.graph.serialize(),
      freshness: this.freshnessChecker.serialize(),
      currentGate: this.currentGate,
    };
    return JSON.stringify(state);
  }

  /**
   * Structured serialization (returns the state object directly, useful for
   * integrations that handle their own JSON persistence).
   */
  serializeState(): ContextManagementEngineState {
    return {
      graph: this.graph.serialize(),
      freshness: this.freshnessChecker.serialize(),
      currentGate: this.currentGate,
    };
  }

  /** Restore the engine state from a serialized JSON string. */
  restore(data: string): void {
    if (!data) return;
    let parsed: ContextManagementEngineState;
    try {
      parsed = JSON.parse(data) as ContextManagementEngineState;
    } catch {
      return; // corrupt state — start fresh rather than crash
    }
    this.restoreState(parsed);
  }

  /** Restore from a structured state object. */
  restoreState(state: ContextManagementEngineState): void {
    if (!state) return;
    if (state.graph) {
      this.graph.restore(state.graph);
    }
    if (state.freshness) {
      this.freshnessChecker.restore(state.freshness);
    }
    if (state.currentGate) {
      this.setGate(state.currentGate);
    }
  }

  /** Workspace path the engine was constructed for. */
  getWorkspacePath(): string {
    return this.workspacePath;
  }
}

const VALID_GATES: ReadonlySet<string> = new Set([
  'PLAN',
  'BUILD',
  'VERIFY',
  'TEST',
  'AUDIT',
  'DELIVERY',
  'UNKNOWN',
]);

function normalizeGate(g: string): GateName {
  const upper = String(g).toUpperCase();
  return (VALID_GATES.has(upper) ? upper : 'UNKNOWN') as GateName;
}
