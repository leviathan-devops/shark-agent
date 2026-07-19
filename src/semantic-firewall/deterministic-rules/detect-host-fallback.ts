import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Detect host fallback excuses — claiming host testing is sufficient
 * instead of running container tests.
 *
 * Migrated from HOST_FALLBACK_PATTERNS (command-execute-hook.ts lines 107-123).
 * Original handler: BLOCK — [ANTI-DERAILMENT L5.1]
 */
export const detectHostFallback: DeterministicRule = {
  id: 'DETECT-HOST-FALLBACK',
  name: 'Host Fallback Excuse',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Patterns from original HOST_FALLBACK_PATTERNS
    const patterns: RegExp[] = [
      /host.*testing.*already.*works/i,
      /fall.*back.*to.*host/i,
      /host.*already.*proves/i,
      /local.*works.*container.*not.*needed/i,
      /since.*host.*works/i,
      /skip.*container.*test/i,
      /container.*not.*necessary/i,
      /container.*not.*needed/i,
      /not.*need.*container/i,
      /skip.*container/i,
      /use.*host.*instead/i,
      /host.*prove.*it.*works/i,
      /already.*proven.*to.*work/i,
      /already.*verified.*on.*host/i,
      /already.*tested.*on.*local/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Host fallback detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — host testing is not container testing`,
        });
      }
    }

    return violations;
  },
};
