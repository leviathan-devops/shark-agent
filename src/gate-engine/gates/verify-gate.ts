/**
 * Verify Gate Evaluator — checks evidence for VERIFY gate advancement.
 *
 * Required evidence (from GATE_CRITERIA):
 *   - trident-report: Trident code review completed
 *   - semantic-firewall-pass: semantic firewall passed
 *   - no-critical: no critical findings remain
 */
export interface GateResult {
  passed: boolean;
  missing: string[];
}

export function evaluateVerifyGate(evidence: Map<string, boolean>): GateResult {
  const required = ['trident-report', 'semantic-firewall-pass', 'no-critical'];
  const missing: string[] = [];
  for (const req of required) {
    if (!evidence.has(req) || !evidence.get(req)) {
      missing.push(req);
    }
  }
  return { passed: missing.length === 0, missing };
}
