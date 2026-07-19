import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect model restriction excuses — claiming model limitations justify
 * skipping quality gates.
 *
 * Migrated from MODEL_RESTRICTION_PATTERNS (command-execute-hook.ts lines 143-159).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.3]
 */
export const detectModelRestriction: DeterministicRule = {
  id: 'DETECT-MODEL-RESTRICTION',
  name: 'Model Restriction Excuse',
  severity: 'MEDIUM',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original MODEL_RESTRICTION_PATTERNS
    const patterns: RegExp[] = [
      /only.*gpt/i,
      /only.*claude/i,
      /only.*gemini/i,
      /only.*llama/i,
      /must.*use.*gpt/i,
      /must.*use.*claude/i,
      /restricted.*to.*model/i,
      /model.*quota/i,
      /model.*limit/i,
      /rate.*limit.*excuse/i,
      /api.*key.*issue/i,
      /can't.*afford.*model/i,
      /too.*expensive.*model/i,
      /model.*cost.*too.*high/i,
      /switch.*model.*理由/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Model restriction excuse detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — quality gates apply regardless of model choice`,
        });
      }
    }

    return violations;
  },
};
