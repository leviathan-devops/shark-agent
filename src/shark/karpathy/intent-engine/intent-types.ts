/**
 * ICE Intent Classification Engine — Type Definitions
 * ===================================================
 *
 * Defines all types for the Intent Engine: the agent answers
 * "What is the agent TRYING to do, and is this action APPROPRIATE for the
 * current gate?"
 *
 * This module wires up the semantic-role/frame concepts from the existing
 * verb-frame-lexicon.ts (SemanticRole) while providing the richer slot/freeze
 * data the new engine needs (filled/value/source, matchQuality, gateCompliant).
 *
 * Pure type declarations — zero runtime cost, zero dependencies beyond the
 * re-exported SemanticRole.
 */

// ─── SemanticRole (aligned with the spec's uppercase role vocabulary) ──────
// The existing verb-frame-lexicon.ts defines lowercase roles ('agent', ...);
// the ICE spec (Appendix A) uses uppercase roles (AGENT, PATIENT, ...). This
// new engine adopts the spec's uppercase vocabulary so frame slots match the
// documented ARG_TO_ROLE mapping exactly. The concept is wired up here.

export type SemanticRole =
  | 'AGENT' | 'PATIENT' | 'INSTRUMENT' | 'DESTINATION'
  | 'SOURCE' | 'PURPOSE' | 'MANNER' | 'CAUSE' | 'THEME';

// ─── Gate + severity vocabulary ────────────────────────────────────────────

export type GateType =
  | 'PLAN' | 'BUILD' | 'VERIFY' | 'TEST' | 'AUDIT' | 'DELIVERY' | 'IDLE';

export type IntentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type IntentAction = 'ALLOW' | 'ALLOW_WITH_WARNING' | 'BLOCK' | 'ESCALATE';

export type DangerLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type MatchQuality = 'exact' | 'strong' | 'partial' | 'weak' | 'no_match';

export type AnalysisDepth =
  | 'regex_only'
  | 'ast_surface'
  | 'ast_with_typechecker'
  | 'ast_with_preflight';

// ─── IntentCategory: 18 tool-anchored types ────────────────────────────────
//
// These categories are anchored on the OPERATION the agent is attempting,
// derived from the tool under evaluation. They are the vocabulary the engine
// reasons in.

export type IntentCategory =
  | 'WRITE_FILE'
  | 'EDIT_FILE'
  | 'BASH'
  | 'TEST'
  | 'BUILD'
  | 'VERIFY'
  | 'GATE_ADVANCE'
  | 'CONTAINER_SPAWN'
  | 'EXTERNAL_AUDIT'
  | 'BROWSER_ACTION'
  | 'VISION_CHECK'
  | 'READ_EXPLORE'
  | 'WEB_FETCH'
  | 'CHECKPOINT'
  | 'EVIDENCE_QUERY'
  | 'TASK_DISPATCH'
  | 'COMPACT'
  | 'UNKNOWN';

/** Operation type carried for backward compat with legacy OperationType enum. */
export type OperationType =
  | 'WRITE' | 'READ' | 'EXECUTE' | 'VERIFY' | 'MANAGE' | 'UNKNOWN';

// ─── CodeConstruct: 17 kinds, derived from real TypeScript AST ─────────────

export type CodeConstructKind =
  | 'function'
  | 'class'
  | 'import'
  | 'export'
  | 'call_expression'
  | 'return_statement'
  | 'catch_clause'
  | 'if_statement'
  | 'assignment'
  | 'cast_expression'
  | 'variable_declaration'
  | 'loop'
  | 'await_expression'
  | 'new_expression'
  | 'binary_expression'
  | 'property_access'
  | 'string_literal';

/**
 * Properties extracted from a single AST node. Every field is optional so the
 * shape stays flat across all 17 construct kinds (only relevant fields set).
 */
export interface ConstructProperties {
  /** Construct is named after an enforcement keyword (validate/check/...). */
  isNamedAfterKeyword?: boolean;
  /** Construct has a structurally observable failure path (throw/reject/false). */
  canFail?: boolean;
  /** Explicit: function body contains a reject() call (feeds canFail). */
  rejectFound?: boolean;
  /** Explicit: function body contains an assert() call (feeds canFail). */
  assertFound?: boolean;
  /** Construct (or its body) contains at least one return statement. */
  hasReturnStatement?: boolean;
  /** Number of parameters (functions/methods). */
  parameterCount?: number;
  /** McCabe cyclomatic complexity (functions/methods). 1 + decision points. */
  cyclomaticComplexity?: number;
  /** Module specifier for import/export declarations. */
  importSource?: string;
  /** True when importing a known test framework (jest/vitest/mocha/node:test). */
  isTestImport?: boolean;
  /** Names exported by an export declaration. */
  exportedNames?: string[];
  /** Name of the callee for call/new expressions. */
  calleeName?: string;
  /** True when this is a filesystem write call (fs.writeFileSync / write). */
  isFileWrite?: boolean;
  /** True when a return statement returns an object literal containing `passed: true`. */
  returnsPassedTrue?: boolean;
  /** True when the TypeChecker resolved the return type to include success/passed/true. */
  returnsSuccessType?: boolean;
  /** The TypeChecker-resolved return type string (functions/methods only). */
  returnTypeString?: string;
  /** True when a catch clause body is empty or only logs. */
  catchIsEmpty?: boolean;
  /** Text of a string literal. */
  stringValue?: string;
  /** Left-hand operator for binary expressions. */
  operator?: string;
}

/**
 * A single AST node mapped into the engine's construct tree.
 * Children preserve parent/child nesting for context-aware rules.
 */
export interface CodeConstruct {
  readonly kind: CodeConstructKind;
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly properties: ConstructProperties;
  readonly children: CodeConstruct[];
}

// ─── Frame + slot types (richer than legacy for slot filling) ──────────────

/**
 * A single slot requirement for a verb frame, plus the live fill state.
 * `argMapping` names the tool argument that satisfies this role.
 */
export interface FrameSlot {
  readonly role: SemanticRole;
  readonly required: boolean;
  readonly acceptsType: string;
  readonly argMapping?: string;
  /** Live fill state — set by FrameMatcher.fillSlots(). */
  filled: boolean;
  value?: unknown;
  source?: string;
}

/**
 * A verb frame: the semantic template for a tool action.
 */
export interface VerbFrame {
  readonly verb: string;
  readonly intent: IntentCategory;
  readonly senses: ReadonlyArray<{ mode: string; description: string }>;
  readonly dangerLevel: DangerLevel;
  readonly allowedGates: ReadonlyArray<GateType>;
  readonly slots: ReadonlyArray<FrameSlot>;
  readonly examples: ReadonlyArray<string>;
}

/**
 * Result of matching a tool call against the frame lexicon.
 * Carries the slot-fill evidence chain and the match quality verdict.
 */
export interface FrameMatch {
  readonly frame: VerbFrame | null;
  readonly slots: FrameSlot[];
  readonly confidence: number;
  readonly adjustedConfidence: number;
  readonly evidence: string[];
  readonly gateCompliant: boolean;
  readonly matchQuality: MatchQuality;
  /** Explicit consumption of slot-fill analysis for evidence reporting. */
  readonly slotStats?: { requiredSlots: number; filledRequired: number; filledAll: boolean };
}

// ─── Inferred intent ───────────────────────────────────────────────────────

/**
 * What the agent is inferred to be trying to do.
 */
export interface InferredIntent {
  category: IntentCategory;
  operationType: OperationType;
  description: string;
  targetFile?: string;
  targetSymbol?: string;
  gateContext: GateType;
  isSourceCode: boolean;
  isTestFile: boolean;
  isSpecFile: boolean;
  isEvidenceFile: boolean;
}

// ─── Findings + report ─────────────────────────────────────────────────────

/**
 * A single rule finding produced by I-1 through I-5.
 */
export interface IntentFinding {
  readonly ruleId: string;
  readonly severity: IntentSeverity;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly fixSuggestion: string;
  readonly intentCategory: IntentCategory;
  readonly gateContext: GateType;
  readonly constructKind?: CodeConstructKind;
  readonly confidence: number;
}

/**
 * Blind-spot transparency report (Bible Pillar 5).
 */
export interface BlindSpotReport {
  readonly typeCheckerAvailable: boolean;
  readonly callGraphCoverage: number;
  readonly analysisDepth: AnalysisDepth;
  readonly unresolvedImports: string[];
  readonly externalModules: string[];
  readonly limitations: string[];
  readonly dynamicCode: boolean;
  readonly generatedCode: boolean;
}

/**
 * The final intent report emitted by IntentEngine.auditInMemory().
 */
export interface IntentReport {
  overallPassed: boolean;
  confidence: number;
  intent: InferredIntent;
  frameMatch: FrameMatch;
  gateCompliant: boolean;
  gateViolations: IntentFinding[];
  findings: IntentFinding[];
  blindSpots: BlindSpotReport;
  action: IntentAction;
  analyzedAt: string;
  totalConstructsAnalyzed: number;
}

/** Input contract for ConfidenceCalculator (rule I-4). */
export interface ConfidenceInput {
  frameMatch: FrameMatch;
  inferredIntent: InferredIntent;
  gateFindings: IntentFinding[];
  typeCheckerAvailable: boolean;
  constructCount: number;
}
