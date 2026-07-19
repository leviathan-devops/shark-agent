/**
 * T1 Candidate Generator — Phase 0 tip-of-spear.
 *
 * Converts T1 regex detectors from blocking to candidate-generating.
 * NEVER blocks. NEVER throws. Returns RegexCandidate[] for semantic confirmation.
 *
 * ARCHITECTURE:
 *   - Runs ALL existing T1 detector functions (detectAllViolations,
 *     detectAllTuiViolations, detectAdversarialViolations,
 *     detectContainerTestingViolations) against incoming content.
 *   - Converts each boolean match into a RegexCandidate object.
 *   - Maps each detector ID to its semantic confirmation target via
 *     T1_SEMANTIC_MAP.
 *   - Returns ALL candidates — the decision layer (Phase 2) decides which
 *     candidates to confirm, block, flag, or drop.
 *
 * DESIGN PRINCIPLE: Phase 0 is a regex tip-of-spear. It generates
 * candidates. It does NOT enforce. Enforcement happens only when a
 * candidate is CONFIRMED by a semantic engine in Phase 1.
 */

import {
  detectAllViolations,
  type CodeContext,
} from './t1-runtime-grade-engineering.js';
import { detectAllTuiViolations } from './t1-t2-tui-testing.js';
import { detectAdversarialViolations } from './t1-adversarial-pressure.js';
import { detectContainerTestingViolations } from './t1-container-testing.js';
import type { RegexCandidate } from '../pipeline/regex-candidate.js';
import { logInfo } from '../shark-logger.js';
// Single source of truth for T1 → owning-engine mapping (see rule-ownership-matrix.ts).
import { T1_TO_OWNER } from '../rule-ownership-matrix.js';

// ═══════════════════════════════════════════════
// T1_SEMANTIC_MAP — Maps each T1 rule to its semantic confirmation target.
// ═══════════════════════════════════════════════

type SemanticAction = 'block' | 'flag' | 'escalate' | 'drop';

interface SemanticMapping {
  semanticRule?: string;
  enforcementAction: SemanticAction;
}

/**
 * Runtime-grade engineering rules (P1-P12) mapped to their AST equivalents.
 *
 * Rules with a `semanticRule` get confirmed by semantic engines in Phase 1:
 *   - P2, P3, P4, P7, P9, P12 → SF (SemanticFirewall) AST rules
 *   - P11 → SRE:S1 (Honesty Engine — theatrical return detection)
 *   - P1, P10 → RGE (RuntimeGradeEngineering) AST rules
 *   - P5, P6, P8 → flag only (no AST equivalent, behavioral signal)
 *
 * Rules with enforcementAction 'block' will BLOCK the write if confirmed.
 * Rules with enforcementAction 'flag' will WARN if confirmed.
 */
const RUNTIME_SEMANTIC_MAP: Record<string, SemanticMapping> = {
  // ── Rules that map to SF AST rules (confirmed by SemanticFirewall) ──
  // P11 mapped to SRE:S1 — see rule-ownership-matrix.ts
  // semanticRule values are sourced from the canonical T1_TO_OWNER map so that
  // rule ownership has a single source of truth. P5/P6/P8 stay behavioral-only
  // (no semanticRule) by design — they have no AST confirmation target.
  P2: { semanticRule: T1_TO_OWNER['P2'], enforcementAction: 'block' },
  P3: { semanticRule: T1_TO_OWNER['P3'], enforcementAction: 'block' },
  P4: { semanticRule: T1_TO_OWNER['P4'], enforcementAction: 'block' },
  P7: { semanticRule: T1_TO_OWNER['P7'], enforcementAction: 'block' },
  P9: { semanticRule: T1_TO_OWNER['P9'], enforcementAction: 'block' },
  P11: { semanticRule: T1_TO_OWNER['P11'], enforcementAction: 'block' },  // SRE owns theatrical return — not SF
  P12: { semanticRule: T1_TO_OWNER['P12'], enforcementAction: 'flag' },

  // ── Rules that map to RGE AST rules ──
  P1: { semanticRule: T1_TO_OWNER['P1'], enforcementAction: 'flag' },
  P10: { semanticRule: T1_TO_OWNER['P10'], enforcementAction: 'flag' },

  // ── Behavioral-only rules (no AST equivalent, flagged if regex detects) ──
  P5: { enforcementAction: 'flag' },
  P6: { enforcementAction: 'flag' },
  P8: { enforcementAction: 'flag' },
};

/**
 * Look up the semantic mapping for a given rule ID.
 *
 * Runtime rules (P1-P12) are checked against RUNTIME_SEMANTIC_MAP.
 * Behavioral rules (TUI-*, ADV-*, CT-*) default to 'drop' — they have no
 * AST equivalent and will be dropped by the decision layer unless
 * independently confirmed by other means.
 *
 * Unknown rule IDs default to 'drop' (safe default — never blocks).
 */
function lookupSemanticMapping(ruleId: string): SemanticMapping {
  // Runtime rules — explicit map lookup
  if (RUNTIME_SEMANTIC_MAP[ruleId]) {
    return RUNTIME_SEMANTIC_MAP[ruleId];
  }

  // Behavioral rules — no AST equivalent, always drop
  if (
    ruleId.startsWith('TUI-') ||
    ruleId.startsWith('ADV-') ||
    ruleId.startsWith('CT-')
  ) {
    return { enforcementAction: 'drop' };
  }

  // Unknown rule — safe default, never blocks
  return { enforcementAction: 'drop' };
}

// ═══════════════════════════════════════════════
// CANDIDATE FACTORY
// ═══════════════════════════════════════════════

/**
 * Convert detector severity (lowercase) to candidate severity (uppercase).
 */
function toCandidateSeverity(
  severity: 'critical' | 'high' | 'medium',
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (severity) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

/**
 * Create a RegexCandidate from a matched detector.
 *
 * @param ruleId       - Detector ID (e.g., 'P3', 'TUI-05', 'ADV-10')
 * @param category     - Detector category (e.g., 'error-handling')
 * @param severity     - Detector severity ('critical' | 'high' | 'medium')
 * @param description  - Human-readable violation description
 * @param fix          - Fix suggestion from detector
 * @param content      - File content (for match snippet extraction)
 * @param source       - Source module name (e.g., 't1-runtime-grade-engineering')
 */
function createCandidate(
  ruleId: string,
  category: string,
  severity: 'critical' | 'high' | 'medium',
  description: string,
  fix: string,
  content: string,
  source: string,
): RegexCandidate {
  const mapping = lookupSemanticMapping(ruleId);

  // Extract a short match snippet for debugging.
  // Uses the first 80 chars of content near the rule signature if possible.
  let matchSnippet = `[${ruleId}: ${description.substring(0, 60)}]`;
  try {
    // Try to find the rule ID in the content as a heuristic for snippet
    const idx = content.indexOf(ruleId);
    if (idx >= 0) {
      matchSnippet = content.substring(idx, Math.min(idx + 80, content.length));
    }
  } catch {
    // Keep default snippet
  }

  return {
    ruleId,
    category,
    severity: toCandidateSeverity(severity),
    // Regex candidates carry raw action from semantic map. 'block' actions
    // require AST confirmation before the decision layer elevates them to blocks.
    enforcementAction: mapping.enforcementAction,  // Keep raw action; AST confirmation required for blocks
    semanticRule: mapping.semanticRule,
    match: matchSnippet,
    line: 0, // Boolean detectors don't return line numbers; semantic engines find exact lines in Phase 1
    correction: fix,
    source,
  };
}

// ═══════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════

/**
 * Generate regex candidates from ALL T1 detectors — Phase 0 tip-of-spear.
 *
 * This function runs every T1 regex detector against the content and
 * converts each match into a RegexCandidate for semantic confirmation.
 * It NEVER blocks and NEVER throws.
 *
 * @param content  - The file content being analyzed
 * @param fileName - The file path (used to build CodeContext for detectors)
 * @param context  - Optional context with gate phase and agent name
 * @returns Array of RegexCandidate for Phase 1 semantic confirmation
 */
export function generateCandidates(
  content: string,
  fileName: string,
  context?: { gate?: string; agent?: string },
): RegexCandidate[] {
  const candidates: RegexCandidate[] = [];

  // Build CodeContext required by the existing T1 detectors.
  // The detectors use filePath for language gating and gate for phase-specific logic.
  const codeContext: CodeContext = {
    filePath: fileName,
    toolName: '',
    gate: context?.gate ?? '',
    surroundingCode: content,
  };

  // ── Run T1 runtime-grade-engineering detectors (P1-P12) ──
  try {
    const violations = detectAllViolations(content, codeContext);
    for (const { detector } of violations) {
      candidates.push(
        createCandidate(
          detector.id,
          detector.category,
          detector.severity,
          detector.description,
          detector.fix,
          content,
          't1-runtime-grade-engineering',
        ),
      );
    }
  } catch (e) {
    logInfo(
      `candidate-generator: detectAllViolations failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Run T1 TUI testing detectors (TUI-01 to TUI-17) ──
  // Behavioral rules — enforcementAction is 'drop'. These generate candidates
  // that will be dropped by the decision layer unless independently confirmed.
  try {
    const violations = detectAllTuiViolations(content, codeContext);
    for (const { detector } of violations) {
      candidates.push(
        createCandidate(
          detector.id,
          detector.category,
          detector.severity,
          detector.description,
          detector.fix,
          content,
          't1-t2-tui-testing',
        ),
      );
    }
  } catch (e) {
    logInfo(
      `candidate-generator: detectAllTuiViolations failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Run T1 adversarial pressure detectors (ADV-01 to ADV-16) ──
  // Behavioral rules — enforcementAction is 'drop'.
  // Note: detectAdversarialViolations returns an AdversarialValidationResult
  // with a .violations[] array, not a detector/rule pair array.
  try {
    const result = detectAdversarialViolations(content, codeContext);
    for (const v of result.violations) {
      candidates.push(
        createCandidate(
          v.detectorId,
          v.category,
          v.severity,
          v.description,
          v.fix,
          content,
          't1-adversarial-pressure',
        ),
      );
    }
  } catch (e) {
    logInfo(
      `candidate-generator: detectAdversarialViolations failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Run T1 container testing detectors (CT-01 to CT-16) ──
  // Behavioral rules — enforcementAction is 'drop'.
  // Note: detectContainerTestingViolations returns a ContainerTestingValidationResult
  // with a .violations[] array, not a detector/rule pair array.
  try {
    const result = detectContainerTestingViolations(content, codeContext);
    for (const v of result.violations) {
      candidates.push(
        createCandidate(
          v.detectorId,
          v.category,
          v.severity,
          v.description,
          v.fix,
          content,
          't1-container-testing',
        ),
      );
    }
  } catch (e) {
    logInfo(
      `candidate-generator: detectContainerTestingViolations failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return candidates;
}

// ═══════════════════════════════════════════════
// DIAGNOSTIC EXPORTS
// ═══════════════════════════════════════════════

/**
 * Get the semantic mapping for a rule ID (for diagnostics/debugging).
 */
export function getSemanticMapping(ruleId: string): SemanticMapping {
  return lookupSemanticMapping(ruleId);
}

/**
 * Get the full runtime semantic map (for diagnostics/debugging).
 */
export function getRuntimeSemanticMap(): Readonly<Record<string, SemanticMapping>> {
  return RUNTIME_SEMANTIC_MAP;
}
