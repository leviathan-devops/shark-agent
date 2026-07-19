import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect wrong container commands — using `opencode container run` instead
 * of `opencode run`.
 *
 * Migrated from WRONG_CONTAINER_PATTERNS (command-execute-hook.ts lines 92-97).
 * Original handler: BLOCK — [ANTI-SLOP L4]
 */
export const detectWrongContainer: DeterministicRule = {
  id: 'DETECT-WRONG-CONTAINER',
  name: 'Wrong Container Command',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original WRONG_CONTAINER_PATTERNS
    const patterns: RegExp[] = [
      /opencode\s+container\s+run/i,
      /opencode\s+container\s+start/i,
      /opencode\s+container\s+exec/i,
      /opencode\s+run\s+/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Wrong container command detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — use opencode run, not opencode container run`,
        });
      }
    }

    return violations;
  },
};
