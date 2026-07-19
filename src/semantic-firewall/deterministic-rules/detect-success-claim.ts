import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect success claims without proof — asserting code works without
 * mechanical evidence.
 *
 * Migrated from SUCCESS_CLAIM_PATTERNS (command-execute-hook.ts lines 125-141).
 * Original handler: BLOCK (conditional on no container test evidence) — [ANTI-DERAILMENT L5.2]
 *
 * Note: The original handler checked hasContainerTestEvidence() and only blocked
 * if evidence was missing. In the deterministic rule system, this rule fires
 * whenever the pattern matches; the dispatcher/gate layer is responsible for
 * gating on evidence availability.
 */
export const detectSuccessClaim: DeterministicRule = {
  id: 'DETECT-SUCCESS-CLAIM',
  name: 'Success Claim Without Proof',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original SUCCESS_CLAIM_PATTERNS
    const patterns: RegExp[] = [
      /it.*works.*trust.*me/i,
      /trust.*me.*it.*works/i,
      /believe.*me.*it.*works/i,
      /already.*verified.*by.*myself/i,
      /already.*tested.*and.*works/i,
      /already.*proven.*to.*work/i,
      /obviously.*correct/i,
      /clearly.*works/i,
      /self.*evidently.*correct/i,
      /in.*my.*assessment.*it.*works/i,
      /in.*my.*experience.*it.*works/i,
      /based.*on.*my.*analysis.*works/i,
      /no.*need.*for.*test/i,
      /no.*need.*for.*verification/i,
      /no.*further.*test.*needed/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Success claim without proof detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — mechanical proof required`,
        });
      }
    }

    return violations;
  },
};
