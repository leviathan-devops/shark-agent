import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect impatience — wanting to skip verification and ship prematurely.
 *
 * Migrated from IMPATIENCE_PATTERNS (command-execute-hook.ts lines 235-247).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.9]
 */
export const detectImpatience: DeterministicRule = {
  id: 'DETECT-IMPATIENCE',
  name: 'Impatience / Premature Shipping',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original IMPATIENCE_PATTERNS
    const patterns: RegExp[] = [
      /let's.*just.*move.*on/i,
      /let's.*skip.*to.*the.*end/i,
      /just.*ship.*it/i,
      /good.*enough/i,
      /close.*enough/i,
      /ship.*it/i,
      /just.*deploy/i,
      /fuck.*it/i,
      / ship .*now/i,
      / deploy .*now/i,
      /let's.*hurry/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Impatience detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — proper verification takes time`,
        });
      }
    }

    return violations;
  },
};
