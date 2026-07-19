import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect undermining — arguing against quality gates with "not worth it" excuses.
 *
 * Migrated from UNDERMINING_PATTERNS (command-execute-hook.ts lines 220-233).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.8]
 */
export const detectUndermining: DeterministicRule = {
  id: 'DETECT-UNDERMINING',
  name: 'Quality Gate Undermining',
  severity: 'MEDIUM',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original UNDERMINING_PATTERNS
    const patterns: RegExp[] = [
      /not.*worth.*the.*effort/i,
      /too.*much.*work/i,
      /not.*worth.*it/i,
      /diminishing.*returns/i,
      / marginal .*benefit/i,
      / minimal .*gain/i,
      /savvy.*engineer.*would/i,
      /experienced.*developer.*would/i,
      /realistic.*timeline/i,
      /realistically/i,
      / practically .*impossible/i,
      / realistically .*impractical/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Undermining detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — quality gates exist for a reason`,
        });
      }
    }

    return violations;
  },
};
