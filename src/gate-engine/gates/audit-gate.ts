/**
 * Audit Gate Evaluator — Phase 4: filesystem-based audit criteria.
 *
 * OLD behavior: required evidence IDs 'spec-alignment', 'test-authenticity',
 * 'theatrical-scan' that mapped to pre-generated report files
 * (SpecAlignmentReport.json, TestAuthenticityReport.json). These created a
 * circular dependency — audit failed because no reports existed, but no
 * reports existed because the agent couldn't create files.
 *
 * NEW behavior: checks FILESYSTEM REALITY via runAuditCriteriaAgainstWorkspace()
 * — source files exist, dist/ has content, tsc passes. These are achievable
 * without any pre-generated report files.
 */
import { runAuditCriteriaAgainstWorkspace } from '../../shared/gates.js';

export interface GateResult {
  passed: boolean;
  missing: string[];
}

export function evaluateAuditGate(_evidence: Map<string, boolean>): GateResult {
  // Phase 4: Audit criteria now check filesystem reality, not pre-generated
  // report files. The workspace is process.cwd() (consistent with the rest of
  // the gate engine, which operates on the current project).
  const { passed, results } = runAuditCriteriaAgainstWorkspace(process.cwd());
  const missing = results.filter(r => !r.met).map(r => r.reason);
  return { passed, missing };
}
