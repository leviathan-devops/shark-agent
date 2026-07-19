/**
 * Build Gate Evaluator — checks evidence for BUILD gate advancement.
 *
 * Required evidence (from GATE_CRITERIA):
 *   - compiled: project builds successfully
 *   - source-verified: source code verified against spec
 *   - deps-installed: dependencies installed
 */
export interface GateResult {
  passed: boolean;
  missing: string[];
}

export function evaluateBuildGate(evidence: Map<string, boolean>): GateResult {
  const required = ['compiled', 'source-verified', 'deps-installed'];
  const missing: string[] = [];
  for (const req of required) {
    if (!evidence.has(req) || !evidence.get(req)) {
      missing.push(req);
    }
  }
  return { passed: missing.length === 0, missing };
}
