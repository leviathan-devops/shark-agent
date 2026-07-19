/**
 * SemanticAnalysisContext — canonical argument to every semantic engine's audit method.
 * Passed to RGE.checkWriteTime, SRE.checkWriteTime, SF.analyze in Phase 1.
 */

import type { RegexCandidate } from './regex-candidate.js';
import type { NLPAnalysis } from '../../nlp-pipeline/statistical-nlp-engine.js';

export interface PreflightResult {
  tscExitCode: number | null;
  buildExitCode: number | null;
  tscOutput?: string;
  buildOutput?: string;
  durationMs?: number;
  spawnError?: string;
}

export interface SemanticAnalysisContext {
  content: string;              // File content being analyzed
  filePath: string;             // File path
  candidates: RegexCandidate[]; // Phase 0 candidates for confirmation
  gate?: string;                // Current gate phase
  agent?: string;               // Agent name
  crossFile?: boolean;          // Cross-file analysis (post-write only)
  engineeringContext?: boolean; // True when running build/tsc/eslint
  isSelfAudit?: boolean;        // True when agent is auditing own code
  severityOverrides?: Record<string, 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>;
  preflight?: PreflightResult;  // tsc --noEmit + bun build results
  correlationId?: string;       // For tracing through pipeline
  nlpAnalysis?: NLPAnalysis;    // Phase 0 StatisticalNLP analysis — consumed by Phase 1 engines
}

/**
 * SemanticFinding — output of a semantic engine in Phase 1.
 * This is a CONFIRMED finding, not a candidate.
 *
 * Compatible with RGE's SemanticFinding (report-types.ts) — all RGE
 * fields are present. Engine-specific fields are added.
 */
export interface SemanticFinding {
  ruleId: string;               // e.g., "SF:no-empty-catch"
  engine: 'RGE' | 'SRE' | 'SF' | 'ICE' | 'NLP';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop';
  message: string;
  file: string;
  line: number;
  endLine?: number;
  column?: number;
  fixSuggestion?: string;
  confirmedCandidate?: string;  // RuleId of the RegexCandidate this confirms
  confidence?: number;          // 0.0-1.0
}

/**
 * Convert an RGE-style SemanticFinding (report-types.ts) to a pipeline
 * SemanticFinding with engine metadata.
 */
export function fromRgeFinding(
  finding: { ruleId: string; severity: string; message: string; file: string; line: number },
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop',
): SemanticFinding {
  return {
    ruleId: finding.ruleId,
    engine: 'RGE',
    severity: (finding.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'),
    enforcementAction,
    message: finding.message,
    file: finding.file,
    line: finding.line,
  };
}

/**
 * Convert a SemanticFirewall FirewallDiag to a pipeline SemanticFinding.
 */
export function fromSfDiag(
  diag: { rule: string; severity: string; file: string; line: number; column?: number; message: string },
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop',
): SemanticFinding {
  return {
    ruleId: 'SF:' + diag.rule,
    engine: 'SF',
    severity: (diag.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'),
    enforcementAction,
    message: diag.message,
    file: diag.file,
    line: diag.line,
    column: diag.column,
  };
}
