import type { DeterministicRule, RuleContext, RuleViolation } from './index.js';

/**
 * Legitimate patterns whitelist — NOT a detection rule.
 *
 * Exports `isLegitimate(text)` for other rules (especially detect-theatrical)
 * to skip false positives on commands that are legitimate file operations.
 *
 * Patterns from original LEGITIMATE_PATTERNS array.
 */

const LEGITIMATE_PATTERNS: RegExp[] = [
  /mkdir\s+-p/i,                    // Creating directories
  /cp\s+-r/i,                       // Copying directories
  /mv\s+/i,                         // Moving files
  /cat\s+[^\|]+$/i,                 // cat file.js (no pipe = read)
  /cat\s+[^\|]+\s*\|?\s*grep/i,    // cat file | grep pattern (legitimate search)
  /head\s+-[0-9]+\s+/i,            // head -20 file (read)
  /tail\s+-[0-9]+\s+/i,            // tail -20 file (read)
  /grep\s+-[rEn]+.*[^\|]$/i,       // grep -r pattern dir (search without counting)
  /grep\s+[^\|]+$/i,               // grep pattern file (search without counting)
  /find\s+.*-name/i,                // find files
  /test\s+-d/i,                     // test directory
  /test\s+-x/i,                     // test executable
  /ls\s+-[la]/i,                    // ls -la (legitimate list)
];

/**
 * Check if text matches any legitimate pattern.
 * Used as a whitelist guard by other detection rules.
 */
export function isLegitimate(text: string): boolean {
  for (const pattern of LEGITIMATE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

// Also export as a no-op DeterministicRule for registry completeness
// (always returns zero violations — it's a whitelist, not a detector)
export const detectLegitimate: DeterministicRule = {
  id: 'DETECT-LEGITIMATE',
  name: 'Legitimate Command Whitelist',
  severity: 'LOW',
  evaluate(_context: RuleContext): RuleViolation[] {
    return [];
  },
};
