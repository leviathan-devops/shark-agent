import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect source inspection — writing/generating to src/ via shell commands
 * instead of using proper write tools.
 *
 * Migrated from SOURCE_INSPECTION_PATTERNS (command-execute-hook.ts lines 99-105).
 * Original handler: BLOCK — [ANTI-SLOP L3]
 */
export const detectSourceInspection: DeterministicRule = {
  id: 'DETECT-SOURCE-INSPECTION',
  name: 'Source Inspection via Shell',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original SOURCE_INSPECTION_PATTERNS
    const patterns: RegExp[] = [
      /^\s*(echo|cat|printf).*>.*src\//i,
      /^\s*sed\s+-i.*src\//i,
      /^\s*tee\s+.*src\//i,
      />\s*.*src\//i,
      /&\s*>>\s*.*src\//i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Source inspection detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — file existence is not runtime verification`,
        });
      }
    }

    return violations;
  },
};
