import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect self-reference claims — "I verified it works" without mechanical proof.
 *
 * Migrated from SELF_REFERENCE_PATTERNS (command-execute-hook.ts lines 249-261).
 * Original handler: BLOCK (conditional on no container test evidence) — [ANTI-DERAILMENT L5.10]
 *
 * Note: The original handler checked hasContainerTestEvidence() and only blocked
 * if evidence was missing. In the deterministic rule system, this rule fires
 * whenever the pattern matches; the dispatcher/gate layer is responsible for
 * gating on evidence availability.
 */
export const detectSelfReference: DeterministicRule = {
  id: 'DETECT-SELF-REFERENCE',
  name: 'Self-Reference Claim Without Proof',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original SELF_REFERENCE_PATTERNS
    const patterns: RegExp[] = [
      /i.*have.*verified.*that/i,
      /i.*verified.*it.*works/i,
      /my.*verification.*shows/i,
      /i.*tested.*it.*works/i,
      /i.*ran.*it.*and.*works/i,
      /my.*testing.*confirms/i,
      /i.*know.*it.*works/i,
      /i.*am.*certain.*it.*works/i,
      /my.*assessment.*is/i,
      /in.*my.*assessment/i,
      /my.*analysis.*shows/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Self-reference claim detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — self-verification is not mechanical proof`,
        });
      }
    }

    return violations;
  },
};
