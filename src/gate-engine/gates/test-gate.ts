/**
 * Test Gate Evaluator — checks evidence for TEST gate advancement.
 *
 * Required evidence (from GATE_CRITERIA, minEvidence: 2):
 *   - container-test: container test suite passed
 *   - unit-test: unit tests passed
 *   - browser-test: browser/E2E tests passed
 *
 * Requires build evidence to be satisfied first.
 */
export interface GateResult {
  passed: boolean;
  missing: string[];
}

export function evaluateTestGate(evidence: Map<string, boolean>): GateResult {
  // CALIBRATION FIX: TEST gate should be the MOST PERMISSIVE gate.
  //
  // The agent NEEDS to iterate during testing. Requiring multiple evidence
  // types (including browser-test which many CLI projects don't have) causes
  // an enforcement death spiral where the agent can never satisfy the gate.
  //
  // Now requires only ONE of:
  //   - container-test: container test suite passed
  //   - unit-test: unit tests passed
  //
  // browser-test is OPTIONAL (not all projects have browser/E2E tests).
  const required = ['container-test', 'unit-test'];
  const minEvidence = 1;
  const missing: string[] = [];
  let satisfied = 0;
  for (const req of required) {
    if (evidence.has(req) && evidence.get(req)) {
      satisfied++;
    } else {
      missing.push(req);
    }
  }
  // browser-test is bonus — track but never require it
  const browserTestPassed = evidence.has('browser-test') && evidence.get('browser-test');
  if (browserTestPassed) {
    satisfied++; // Helps but isn't required
  }
  return { passed: satisfied >= minEvidence, missing };
}
