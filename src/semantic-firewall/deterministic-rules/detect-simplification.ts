import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect oversimplification — hand-waving complex aspects.
 *
 * Migrated from SIMPLIFICATION_PATTERNS (command-execute-hook.ts lines 176-188).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.5]
 */
export const detectSimplification: DeterministicRule = {
  id: 'DETECT-SIMPLIFICATION',
  name: 'Oversimplification / Hand-Waving',
  severity: 'MEDIUM',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original SIMPLIFICATION_PATTERNS
    const patterns: RegExp[] = [
      /over.*simplif/i,
      /overly.*simplif/i,
      /too.*simpl/i,
      /oversimplif/i,
      /hand.*wave/i,
      /handwave/i,
      / gloss.*over /i,
      /glossed.*over/i,
      /skip.*detail/i,
      /skip.*nuance/i,
      /oversimplif/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Oversimplification detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — nuance matters`,
        });
      }
    }

    return violations;
  },
};
