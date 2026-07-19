/**
 * SRE Honesty Engine — Type Definitions (consolidated).
 *
 * All SRE types in one module: findings, the per-function CodeConstruct
 * envelope (Pillar 1), the Control Flow Graph (Pillar 2), the SREReport
 * output, the blind-spot record, and the HonestyRule contract. This is the
 * single source of truth for the SRE's data model.
 */

import type * as ts from 'typescript';

// ---------------------------------------------------------------------------
// FINDING TYPE (Section 3.1)
// ---------------------------------------------------------------------------

/**
 * Rule IDs. The SRE emits exactly these five.
 */
export type SREFindingId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

/**
 * Honesty categories. One per rule. The category is the honesty axis a
 * finding proves.
 */
export type HonestyCategory =
  | 'theatrical_return' // S1
  | 'fake_test' // S2
  | 'mock_in_production' // S3
  | 'ungrounded_claim' // S4
  | 'swallowed_error'; // S5

export type HonestySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

/**
 * A single machine-checkable predicate in a finding's evidence chain. Each
 * step must be true (or, for the root-cause step, must be the failed
 * predicate). This makes every finding auditable.
 */
export interface HonestyEvidenceStep {
  /** The step label, e.g. "enclosing function named 'validateBuild'". */
  claim: string;
  /** Whether this step held true (true) or failed (false -> root cause). */
  verified: boolean;
  /** The AST node text that supports this step, for auditability. */
  snippet?: string;
}

/**
 * A single honesty finding. Every field is populated by every rule — a
 * finding without a full evidence chain or false-positive guards is itself
 * theatrical.
 */
export interface SREFinding {
  /** Rule ID: S1 | S2 | S3 | S4 | S5. */
  ruleId: SREFindingId;
  /** Severity — SRE never emits LOW. Honesty violations are at least MEDIUM. */
  severity: HonestySeverity;
  /** Human-readable explanation naming the function and the honesty gap. */
  message: string;
  /** Absolute or workspace-relative file path. */
  file: string;
  /** 1-indexed line number of the offending node. */
  line: number;
  /** End line for multi-line spans (return object, catch block). */
  endLine?: number;
  /** The honesty category this finding proves. */
  category: HonestyCategory;
  /** Machine-checkable predicate chain — why the rule fired. Each MUST be true. */
  evidenceChain: HonestyEvidenceStep[];
  /** The suggested remediation (ACTIONABLE, not "fix this"). */
  remediation: string;
  /** False-positive guard data — what the rule verified to ensure this is NOT a false positive. */
  falsePositiveGuards: string[];
}

// ---------------------------------------------------------------------------
// CODE CONSTRUCT TREE — PILLAR 1 (Section 3.2)
// ---------------------------------------------------------------------------

/**
 * The category of a side-effect / real-work call expression, used by S1
 * (Condition C — real work) and S4 (evidence-producing API).
 */
export type SideEffectCategory =
  | 'filesystem'
  | 'process'
  | 'network'
  | 'database'
  | 'crypto'
  | 'await'
  | 'loop';

/**
 * A return statement record. Classifies whether the return carries a
 * success/failure claim and whether it is a failure path (Pillar 3 —
 * behavioral completeness).
 */
export interface ReturnRecord {
  /** The return statement node start position. */
  startPos: number;
  /** 1-indexed line number. */
  line: number;
  /** Whether the return carries a success/failure claim object. */
  hasClaimObject: boolean;
  /** Extracted claim properties: ['success', 'passed', ...]. */
  claimProperties: string[];
  /** Whether this return carries a FAILURE value (falsey claim / null / Error). */
  isFailurePath: boolean;
  /** The text of the returned expression (for evidence snippets). */
  expressionText: string;
}

/**
 * A side-effect / real-work call expression in a function body.
 */
export interface SideEffectCall {
  /** The callee text, e.g. "fs.writeFileSync", "execSync", "fetch". */
  callee: string;
  /** Category of real work. */
  category: SideEffectCategory;
  /** Start position — used for temporal ordering (Pillar 4). */
  startPos: number;
  /** 1-indexed line number. */
  line: number;
}

/**
 * A catch clause record (S5).
 */
export interface CatchClauseRecord {
  /** The catch clause node start position. */
  startPos: number;
  /** 1-indexed line number. */
  line: number;
  /** Number of statements in the catch block. */
  statementCount: number;
  /** Whether ALL statements are log-only (console.log/error/warn/logger.*). */
  isLogOnly: boolean;
  /** Whether the block is completely empty (zero statements). */
  isEmpty: boolean;
  /** The error binding name (the `e` in `catch (e)`), if any. */
  errorBinding: string | null;
  /** Whether the error binding is referenced anywhere in the block. */
  errorBindingUsed: boolean;
  /** Whether the block has any non-log statement (throw/return/recovery). */
  hasNonLogStatement: boolean;
  /** Whether the block has an explicit rethrow (throw; or throw new X(...)). */
  hasRethrow: boolean;
}

/**
 * A claim string found in the body (S4).
 */
export interface ClaimString {
  /** The claim phrase text. */
  text: string;
  /** Which claim category it matches. */
  category: ClaimCategory;
  /** Start position. */
  startPos: number;
  /** 1-indexed line number. */
  line: number;
  /** Name of the enclosing function, for evidence reporting. */
  inFunction: string;
}

export type ClaimCategory =
  | 'runtime_grade'
  | 'verified'
  | 'production_ready'
  | 'passed'
  | 'delivered';

/**
 * A mock call site (S3).
 */
export interface MockCall {
  /** The mock pattern matched, e.g. "jest.fn()", ".mockReturnValue()". */
  callee: string;
  /** Start position. */
  startPos: number;
  /** 1-indexed line number. */
  line: number;
  /** The chained methods on the mock, if any. */
  chainedMethods: string[];
}

/**
 * A CodeConstruct is the SRE's per-function semantic envelope (Pillar 1).
 * It bundles everything the rules need so they do not re-walk the AST.
 */
export interface CodeConstruct {
  /** Unique ID (fileName + ':' + startLine). */
  id: string;
  /** The kind of function-like construct. */
  kind: 'function' | 'method' | 'arrow' | 'function_expression';
  /** Function name, or 'anonymous' if unnamed. */
  name: string;
  /** Whether the name matches an enforcement keyword (validate, check, verify, ...). */
  isEnforcementNamed: boolean;
  /** The matched enforcement keyword, or null. */
  enforcementKeyword: string | null;
  /** ALL return statements in the function body (Pillar 3 — behavioral completeness). */
  returns: ReturnRecord[];
  /** ALL side-effect / real-work call expressions in the body. */
  sideEffectCalls: SideEffectCall[];
  /** The catch clauses in the body (S5). */
  catchClauses: CatchClauseRecord[];
  /** Claim strings found in the body (S4). */
  claimStrings: ClaimString[];
  /** Mock call sites (S3). */
  mockCalls: MockCall[];
  /** Count of throw statements in the body (counts as failure path for S1). */
  throwStatements: number;
  /** The CFG for this function (Pillar 2). May be null for trivial bodies. */
  cfg: FunctionCFG | null;
  /** 1-indexed source span. */
  startLine: number;
  endLine: number;
  sourceFile: string;
}

// ---------------------------------------------------------------------------
// CONTROL FLOW GRAPH — PILLAR 2 (Section 3.3)
// ---------------------------------------------------------------------------

export type CFGBlockKind =
  | 'entry'
  | 'linear'
  | 'branch'
  | 'loop'
  | 'try'
  | 'catch'
  | 'exit';

/**
 * A CFG block. Statement-level granularity optimized for reachability (S4)
 * and temporal ordering (S1) queries.
 */
export interface CFGBlock {
  id: number;
  kind: CFGBlockKind;
  /** Inclusive statement start/end positions in the source. */
  startPos: number;
  endPos: number;
  /** Successor block IDs. */
  successors: number[];
  /** Predecessor block IDs (for backward reachability). */
  predecessors: number[];
  /** Statement start positions contained in this block. */
  statementPositions: number[];
}

/**
 * The SRE's own CFG for a function. Intentionally NOT the RGE CFG. Answers
 * two questions RGE's CFG does not: reachability from entry to a target
 * node (S4) and relative ordering of two nodes (S1 temporal).
 */
export interface FunctionCFG {
  /** Function this CFG belongs to. */
  functionId: string;
  /** Entry block. */
  entry: CFGBlock;
  /** All blocks. */
  blocks: CFGBlock[];
  /** Exit blocks (return / throw / fall-through end). */
  exits: CFGBlock[];
}

// ---------------------------------------------------------------------------
// HONESTY REPORT — ENGINE OUTPUT (Section 3.4)
// ---------------------------------------------------------------------------

/**
 * Per-rule summary in the SREReport.
 */
export interface RuleVerdict {
  /** Passed iff zero CRITICAL findings (HIGH/MEDIUM warn but do not fail). */
  passed: boolean;
  /** Total findings for this rule. */
  findingCount: number;
  /** Number of CRITICAL findings. */
  criticalCount: number;
  /** Number of HIGH findings. */
  highCount: number;
  /** Number of MEDIUM findings. */
  mediumCount: number;
  /** Human-readable summary, e.g. "Found 2 theatrical return functions". */
  summary: string;
  /** The findings themselves. */
  findings: SREFinding[];
}

/**
 * Preflight grounding result — did claims have reachable producers?
 */
export interface GroundingReport {
  /** Total claim strings found. */
  claimsFound: number;
  /** Claims with a reachable evidence-producing API. */
  claimsGrounded: number;
  /** Claims with NO reachable producer -> ungrounded. */
  claimsUngrounded: number;
  /** List of ungrounded claim locations. */
  ungroundedClaims: Array<{ file: string; line: number; text: string }>;
}

/**
 * What the engine could NOT verify (Pillar 6). An honesty engine that never
 * admits its blind spots is itself dishonest.
 */
export interface BlindSpot {
  /** What the engine could not check. */
  area: string;
  /** Why (e.g. "TypeChecker resolution requires full project graph"). */
  description: string;
  /** Severity if this blind spot is exploited. */
  severity: HonestySeverity;
}

/**
 * The full SRE audit report. Machine-generated by SlopRemovalEngine and
 * written to .shark/sre-evidence/HONESTY_AUDIT_REPORT.json.
 */
export interface SREReport {
  /** Overall: passed iff zero CRITICAL findings. HIGH findings WARN but do not fail. */
  overallPassed: boolean;
  /** Fraction of rules that produced zero CRITICAL findings. */
  honestyScore: number;
  /** Per-rule summary. */
  rules: {
    S1: RuleVerdict;
    S2: RuleVerdict;
    S3: RuleVerdict;
    S4: RuleVerdict;
    S5: RuleVerdict;
  };
  /** All findings, flattened. */
  findings: SREFinding[];
  /** What the engine could NOT verify — Pillar 6. */
  blindSpots: BlindSpot[];
  /** Preflight grounding result. */
  grounding: GroundingReport;
  /** Files analyzed. */
  filesAnalyzed: number;
  /** Functions analyzed. */
  functionsAnalyzed: number;
  /** Evidence file path on disk (machine-generated, not hand-written). */
  evidencePath: string;
  /** ISO timestamp of analysis. */
  timestamp: string;
  /** Engine version. */
  engineVersion: string;
}

// ---------------------------------------------------------------------------
// HONESTY RULE CONTRACT (Section 3.5)
// ---------------------------------------------------------------------------

/**
 * The HonestyRule contract. Structurally parallel to RGE's SemanticRule but
 * operates on the CodeConstruct tree (Pillar 1), not raw AST nodes.
 *
 * Each rule receives:
 *   - constructs: the per-function semantic envelopes for the file
 *   - checker: the TypeChecker (for S2 SUT resolution, S3 import checks)
 *   - sourceFile: for line numbers and direct AST walks (S2/S3)
 *
 * Each rule returns SREFinding[] (may be empty).
 */
export interface HonestyRule {
  id: SREFindingId;
  description: string;
  category: HonestyCategory;
  /** Default severity; rules may emit per-finding severity. */
  defaultSeverity: HonestySeverity;
  check: (
    constructs: CodeConstruct[],
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile
  ) => SREFinding[];
}
