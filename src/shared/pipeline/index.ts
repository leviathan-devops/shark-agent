/**
 * Pipeline module — 3-phase semantic enforcement pipeline.
 *
 * Phase 0: scanRegexCandidates() — regex tip-of-spear, NEVER blocks
 * Phase 1: RGE.checkWriteTime + SRE.checkWriteTime + SF.analyzeInMemory (parallel)
 * Phase 2: applyDecisionLayer() — confirmed candidates get enforcementAction
 */

export { buildCandidatesFromDetectors, scanCandidates } from './regex-candidate.js';
export type { RegexCandidate, SemanticMapEntry } from './regex-candidate.js';
export type { SemanticAnalysisContext, PreflightResult, SemanticFinding } from './semantic-analysis-context.js';
export { fromRgeFinding, fromSfDiag } from './semantic-analysis-context.js';
export { shouldRunSemanticPipeline } from './cross-plugin-guard.js';
export { applyDecisionLayer } from './decision-layer.js';
export type { DecisionResult } from './decision-layer.js';
export { ProgramCache } from './program-cache.js';
export { stripComments, stripCommentsOnce } from './strip-comments.js';
export { detectEngineeringContext } from './engineering-context.js';
