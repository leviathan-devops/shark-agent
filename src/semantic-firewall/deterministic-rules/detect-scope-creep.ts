import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect scope creep — adding unrelated work while in the middle of a task.
 *
 * Migrated from SCOPE_CREEP_PATTERNS (command-execute-hook.ts lines 205-218).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.7]
 */
export const detectScopeCreep: DeterministicRule = {
  id: 'DETECT-SCOPE-CREEP',
  name: 'Scope Creep',
  severity: 'MEDIUM',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original SCOPE_CREEP_PATTERNS
    const patterns: RegExp[] = [
      /while.*at.*it/i,
      /while.*we.*re.*at.*it/i,
      /at.*the.*same.*time/i,
      /also.*need.*to/i,
      /might.*as.*well/i,
      /顺便/i,
      /顺便说一下/i,
      /just.*to.*be.*thorough/i,
      /for.*completeness/i,
      /one.*more.*thing/i,
      /oh.*and.*also/i,
      /on.*the.*side/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Scope creep detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — stay on task, use separate tasks for new items`,
        });
      }
    }

    return violations;
  },
};
