import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect fake test runner invocations — tests run directly instead of
 * through OpenCode hooks.
 *
 * Migrated from FAKE_TEST_PATTERNS (command-execute-hook.ts lines 58-74).
 * Original handler: BLOCK — [ANTI-SLOP L2]
 */
export const detectFakeTest: DeterministicRule = {
  id: 'DETECT-FAKE-TEST',
  name: 'Fake Test Runner Invocation',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original FAKE_TEST_PATTERNS
    const patterns: RegExp[] = [
      /node\s+run-tests?\.js/i,
      /node\s+verify.*\.mjs/i,
      /npm\s+(run\s+)?test/i,
      /yarn\s+(run\s+)?test/i,
      /jest/i,
      /vitest/i,
      /mocha/i,
      /jasmine/i,
      /bun\s+test/i,
      /pytest/i,
      /python.*-m.*pytest/i,
      /go\s+test/i,
      /cargo\s+test/i,
      /ruby\s+-Itest/i,
      /rspec/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Fake test runner detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — tests must run via OpenCode hooks`,
        });
      }
    }

    return violations;
  },
};
