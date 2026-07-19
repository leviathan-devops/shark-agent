import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect mock/stub data usage — using fake data instead of real APIs.
 *
 * Migrated from MOCK_STUB_PATTERNS (command-execute-hook.ts lines 161-174).
 * Original handler: BLOCK (conditional on no container test evidence) — [ANTI-DERAILMENT L5.4]
 *
 * Note: The original handler checked hasContainerTestEvidence() and only blocked
 * if evidence was missing. In the deterministic rule system, this rule fires
 * whenever the pattern matches; the dispatcher/gate layer is responsible for
 * gating on evidence availability.
 */
export const detectMockStub: DeterministicRule = {
  id: 'DETECT-MOCK-STUB',
  name: 'Mock/Stub Data Usage',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original MOCK_STUB_PATTERNS
    const patterns: RegExp[] = [
      /mock.*data/i,
      /stub.*data/i,
      /fake.*data/i,
      /dummy.*data/i,
      /sample.*data/i,
      /test.*data.*only/i,
      /mocked.*response/i,
      /stubbed.*response/i,
      /fake.*api/i,
      /hardcoded.*response/i,
      /static.*json.*instead/i,
      /no.*real.*api/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Mock/stub data detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — real data + real execution required`,
        });
      }
    }

    return violations;
  },
};
