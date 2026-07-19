import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';
import { isLegitimate } from './detect-legitimate.js';

/**
 * Detect theatrical verification — commands that count output
 * instead of actually running/verifying code.
 *
 * Migrated from THEATRICAL_PATTERNS (command-execute-hook.ts lines 41-56).
 * Original handler: BLOCK — [ANTI-SLOP L1]
 *
 * Uses isLegitimate() as a whitelist guard, matching original behavior
 * where LEGITIMATE_PATTERNS were checked first to skip false positives.
 */
export const detectTheatrical: DeterministicRule = {
  id: 'DETECT-THEATRICAL',
  name: 'Theatrical Verification (Counting Theater)',
  severity: 'CRITICAL',
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const text = context.thoughtStream || '';

    // Whitelist guard — skip if text is a legitimate command
    if (isLegitimate(text)) {
      return violations;
    }

    // Patterns from original THEATRICAL_PATTERNS
    const patterns: RegExp[] = [
      /\|.*wc\s+-l/i,                    // ANY pipe to wc -l (counting)
      /wc\s+-l.*\|/i,                    // wc -l | (counting output)
      /cat\s+.*\|.*wc/i,                 // cat ... | wc (counting cat output)
      /grep\s+.*\|.*wc/i,                // grep ... | wc (counting grep output)
      /echo\s+.*\|.*wc/i,                // echo ... | wc (counting echo)
      /ls\s+.*\|.*wc/i,                  // ls | wc (counting ls)
      /wc\s+-l.*dist\//i,                // wc -l dist/ (build verification)
      /wc\s+-l.*src\//i,                 // wc -l src/ (source verification)
      /wc\s+-l.*build\//i,               // wc -l build/ (build verification)
      /\|.*tee/i,                        // pipe to tee (theater)
      /\|.*>.*\./i,                      // pipe to file (saving verification)
      /grep.*setCurrentAgent.*src/i,     // searching for brain patterns
      /grep.*isSharkAgent.*src/i,        // searching for agent patterns
      /grep.*guardian.*src/i,            // searching for guardian patterns
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Theatrical verification detected: ${pattern.source}`,
          evidence: `Pattern matched in ${context.toolName} execution — counting output is not verification`,
        });
      }
    }

    return violations;
  },
};
