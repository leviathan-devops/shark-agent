/**
 * index.ts — Barrel export for the Context Management Engine (CME)
 *
 * Public API surface of Planning Brain Lobe 5's behavioral intelligence
 * engine. Importers should pull from this barrel; internal cross-module
 * imports use explicit relative paths.
 */

// Types & constants
export {
  ALIGNMENT_THRESHOLDS,
  ALIGNMENT_WEIGHTS,
  ALL_CATEGORIES,
  DRIFT_THRESHOLDS,
  FRESHNESS_HALFLIFE_MS,
  FRESHNESS_WINDOW_MS,
  PHASE_ORDER,
  STAGNATION_THRESHOLDS,
} from './cme-types.js';
export type {
  CategoryCount,
  CategoryDistribution,
  CompletedTask,
  ContextPrediction,
  ContextPredictionKey,
  DocPriority,
  DriftReport,
  FreshnessEntry,
  FreshnessVerdict,
  GateName,
  InterventionSeverity,
  InterventionType,
  PendingTask,
  ReferencePath,
  RequiredDoc,
  SemanticCategory,
  StagnationReport,
  TaskPhase,
  TaskQueueSnapshot,
  TrajectoryEdge,
  ContextManagementEngineState,
  TrajectoryIntervention,
  TrajectoryNode,
  TrajectoryVerdict,
  TransitionSummary,
  WorkflowAlignment,
} from './cme-types.js';

// Tip of the spear
export {
  ToolCategoryMapper,
  categorizeTool,
} from './tool-category-mapper.js';
export type { ToolCategoryMapperInput } from './tool-category-mapper.js';

// Graph
export {
  DEFAULT_TRANSITION_WEIGHT,
  TRANSITION_WEIGHTS,
  TrajectoryGraph,
} from './trajectory-graph.js';

// Rules
export { ContextRelevancePredictor, lookupPrediction } from './context-relevance-predictor.js';
export { DriftDetector, IMPLEMENTATION_CATEGORIES, WINDOW_SIZE as DRIFT_WINDOW_SIZE } from './drift-detector.js';
export { interveneOnDrift } from './drift-detector.js';
export { FreshnessChecker } from './freshness-checker.js';
export type { SerializedFreshnessEntry } from './freshness-checker.js';
export { StagnationDetector } from './stagnation-detector.js';
export {
  WorkflowAlignmentScorer,
  getReferencePath,
} from './workflow-alignment-scorer.js';

// Engine
import { ContextManagementEngine } from './trajectory-engine.js';
export { ContextManagementEngine } from './trajectory-engine.js';
export type { ObserveInput } from './trajectory-engine.js';

/**
 * Convenience factory: create a fully-wired ContextManagementEngine for a workspace.
 * The engine is stateful and ready to observe() immediately.
 */
export function createContextManagementEngine(workspacePath: string = process.cwd()): ContextManagementEngine {
  return new ContextManagementEngine(workspacePath);
}
