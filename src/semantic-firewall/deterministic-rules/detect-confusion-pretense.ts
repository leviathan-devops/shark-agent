import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect confusion pretense — claiming code "somewhat works" instead of
 * admitting uncertainty clearly.
 *
 * Migrated from CONFUSION_PRETENSE_PATTERNS (command-execute-hook.ts lines 190-203).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.6]
 */
export const detectConfusionPretense: DeterministicRule = {
  id: 'DETECT-CONFUSION-PRETENSE',
  name: 'Confusion Pretense (Somewhat Works)',
  severity: 'MEDIUM',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original CONFUSION_PRETENSE_PATTERNS
    const patterns: RegExp[] = [
      /it.*somewhat.*works/i,
      /sorta.*works/i,
      /kinda.*works/i,
      /more.*or.*less/i,
      / mostly .*works/i,
      /approximately.*correct/i,
      / basically .*correct/i,
      / essentially .*works/i,
      / nominally .*functional/i,
      / partially .*implemented/i,
      / partially .*working/i,
      /somewhat.*correct/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Confusion pretense detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — "somewhat works" is not an acceptable status`,
        });
      }
    }

    return violations;
  },
};
