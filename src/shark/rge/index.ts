export { RuntimeGradeEngine } from './rge-engine.js';
export { createSemanticEngine, createInMemoryEngine } from './compiler-host.js';
export { RuleEngine } from './rules/rule-engine.js';
export { PatternDatabase } from './pattern-db.js';
export { RGEStateMachine } from './state-machine.js';
export { EvidenceValidator } from './evidence-validator.js';
export { ScaffoldGenerator } from './scaffold-generator.js';
// M3: CodeConstructTree — shared structural index of the analyzed sources
export { CodeConstructTree } from './construct-tree.js';
export type { CodeConstructNode, ConstructType } from './construct-tree.js';
// M5/M6: data-flow taint & CFG dead-code detectors
export { detectTaint } from './rules/r13-data-flow-taint.js';
export type { TaintFinding } from './rules/r13-data-flow-taint.js';
export { detectDeadCode } from './rules/r14-cfg-dead-code.js';
export type { DeadCodeFinding } from './rules/r14-cfg-dead-code.js';
export type { SemanticFinding, RGEAuditReport, RuleLayer, SideEffectRecord, BlindSpotReport } from './report-types.js';
