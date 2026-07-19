import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

interface ContextualPattern {
  label: string;
  pattern: RegExp;
  forbiddenIn: string[];
  allowedIn: string[];
  description: string;
}

// Migrated from guardian-hook.ts CONTEXTUAL_FIREWALL_RULES (lines 64-107)
const CONTEXTUAL_RULES: ContextualPattern[] = [
  {
    label: 'Theatrical Counting',
    pattern: /\|.*wc\s+-l/i,
    forbiddenIn: ['test', 'verify', 'audit', 'delivery'],
    allowedIn: ['plan', 'build'],
    description: 'Counting lines is theatrical during verification but legitimate during planning.'
  },
  {
    label: 'Fake Test Runner',
    pattern: /npm\s+(run\s+)?test|jest|vitest|mocha|jasmine/i,
    forbiddenIn: ['test', 'verify', 'audit', 'delivery'],
    allowedIn: ['plan', 'build'],
    description: 'Standard test runners are blocked during verification to force the use of the authenticated shark-test-runner.'
  },
  {
    label: 'Source Inspection',
    pattern: /test\s+-[fed]\s+.*|ls\s+-l.*(dist|src|build)\//i,
    forbiddenIn: ['verify', 'audit', 'delivery'],
    allowedIn: ['plan', 'build', 'test'],
    description: 'Checking for file existence is a proxy for success and is banned in the final gates.'
  },
  {
    label: 'Wrong Container',
    pattern: /opencode\s+container\s+(run|start|exec)/i,
    forbiddenIn: ['plan', 'build', 'test', 'verify', 'audit', 'delivery'],
    allowedIn: [],
    description: 'Direct container manipulation is always forbidden.'
  },
  {
    label: 'OpenCode Run Banned',
    pattern: /opencode\s+run\s+--agent\s+/i,
    forbiddenIn: ['plan', 'build', 'test', 'verify', 'audit', 'delivery'],
    allowedIn: [],
    description: 'CRITICAL: opencode run does NOT fire hooks. BANNED for all plugin testing. Use TUI via tmux + docker exec -it.'
  },
  {
    label: 'Theatrical Dist Verification',
    pattern: /grep.*dist\/index\.js|grep.*plugins\/.*dist/i,
    forbiddenIn: ['test', 'verify', 'audit', 'delivery'],
    allowedIn: ['plan', 'build'],
    description: 'Static grep/wc on dist files is NOT valid plugin testing. Test actual tool function in container TUI.'
  },
];

/**
 * Contextual Firewall Rules — gate-aware pattern enforcement.
 *
 * Migrated from guardian-hook.ts CONTEXTUAL_FIREWALL_RULES +
 * layerContextualFirewall() (lines 64-179).
 * Original handler: BLOCK via StructuredBlockError — [C-FIREWALL].
 *
 * Each rule defines a pattern that is forbidden in certain gates and
 * allowed in others. When a pattern matches and the current gate is in
 * the forbiddenIn list, a violation is emitted.
 */
export const detectContextualFirewall: DeterministicRule = {
  id: 'DETECT-CONTEXTUAL-FIREWALL',
  name: 'Contextual Firewall Rules',
  severity: 'HIGH',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const gate = context.gate.toLowerCase();
    const text = context.thoughtStream || '';

    for (const rule of CONTEXTUAL_RULES) {
      if (rule.pattern.test(text)) {
        if (rule.forbiddenIn.includes(gate)) {
          violations.push({
            ruleId: `CF-${rule.label.toUpperCase().replace(/\s/g, '-')}`,
            severity: this.severity,
            message: `${rule.label} forbidden in ${gate} gate. ${rule.description}`,
            evidence: `Pattern: ${rule.pattern.source}`,
          });
        }
      }
    }

    return violations;
  },
};
