import { RUNTIME_GRADE_ENFORCEMENT_RULES, type ViolationDetector, type EnforcementRule, type CodeContext, detectAllViolations, evaluateCodeAgainstChecklist, getDetectorById, isTypeScriptFile } from './t1-runtime-grade-engineering.js';
import { TUI_TESTING_ENFORCEMENT_RULES, validateTestingProtocol, detectAllTuiViolations } from './t1-t2-tui-testing.js';
import { ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES, detectAdversarialViolations } from './t1-adversarial-pressure.js';
import { CONTAINER_TESTING_ENFORCEMENT_RULES, detectContainerTestingViolations } from './t1-container-testing.js';
import { buildCandidatesFromDetectors, type RegexCandidate } from '../pipeline/regex-candidate.js';
import { generateCandidates, getSemanticMapping, getRuntimeSemanticMap } from './candidate-generator.js';

export type { ViolationDetector, EnforcementRule, CodeContext };

export const ALL_T1_RULES: EnforcementRule[] = [
  ...RUNTIME_GRADE_ENFORCEMENT_RULES,
  ...TUI_TESTING_ENFORCEMENT_RULES,
  ...ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES,
  ...CONTAINER_TESTING_ENFORCEMENT_RULES,
];

/**
 * Semantic rule mapping — maps each runtime-grade detector (P1-P12) to its
 * corresponding semantic engine rule. Candidates from regex are confirmed by
 * these semantic rules in Phase 1.
 */
const RUNTIME_SEMANTIC_MAP: Record<string, { semanticRule?: string; enforcementAction: 'block' | 'flag' | 'escalate' | 'drop' }> = {
  'P3': { semanticRule: 'SF:no-empty-catch', enforcementAction: 'block' },
  'P2': { semanticRule: 'SF:no-unsafe-cast', enforcementAction: 'block' },
  'P9': { semanticRule: 'SF:no-floating-promises', enforcementAction: 'block' },
  'P7': { semanticRule: 'SF:no-hardcoded-paths', enforcementAction: 'block' },
  'P11': { semanticRule: 'SRE:S1', enforcementAction: 'block' },  // SRE owns theatrical return — not SF
  'P4': { semanticRule: 'SF:cleanup-paired-intervals', enforcementAction: 'block' },
  'P12': { semanticRule: 'SF:handle-zero-length', enforcementAction: 'flag' },
  'P1': { semanticRule: 'RGE:P1', enforcementAction: 'flag' },
  'P10': { semanticRule: 'RGE:P10', enforcementAction: 'flag' },
  'P6': { enforcementAction: 'flag' },
  'P5': { enforcementAction: 'flag' },
  'P8': { enforcementAction: 'flag' },
};

/**
 * Behavioral detectors (TUI, adversarial, container testing) have no AST
 * equivalent — they get 'drop' enforcementAction so they will be dropped
 * by the decision layer unless independently confirmed.
 */
const BEHAVIORAL_SEMANTIC_MAP: Record<string, { semanticRule?: string; enforcementAction: 'block' | 'flag' | 'escalate' | 'drop' }> = {};

/**
 * scanRegexCandidates — Phase 0 tip-of-spear.
 *
 * Scans content with ALL T1 regex detectors and returns candidates ONLY.
 * NEVER blocks. NEVER throws.
 *
 * @param content - The file content being written
 * @param context - Code context (filePath, toolName, gate, surroundingCode)
 * @returns Array of RegexCandidate for semantic confirmation in Phase 1
 */
export function scanRegexCandidates(content: string, context: CodeContext): RegexCandidate[] {
  const allCandidates: RegexCandidate[] = [];

  // Runtime-grade engineering detectors (P1-P12)
  allCandidates.push(
    ...buildCandidatesFromDetectors(
      RUNTIME_GRADE_ENFORCEMENT_RULES,
      content,
      context,
      't1-runtime-grade-engineering',
      RUNTIME_SEMANTIC_MAP,
    ),
  );

  // TUI testing detectors — behavioral, likely dropped without confirmation
  allCandidates.push(
    ...buildCandidatesFromDetectors(
      TUI_TESTING_ENFORCEMENT_RULES,
      content,
      context,
      't1-t2-tui-testing',
      BEHAVIORAL_SEMANTIC_MAP,
    ),
  );

  // Adversarial pressure detectors — behavioral
  allCandidates.push(
    ...buildCandidatesFromDetectors(
      ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES,
      content,
      context,
      't1-adversarial-pressure',
      BEHAVIORAL_SEMANTIC_MAP,
    ),
  );

  // Container testing detectors — behavioral
  allCandidates.push(
    ...buildCandidatesFromDetectors(
      CONTAINER_TESTING_ENFORCEMENT_RULES,
      content,
      context,
      't1-container-testing',
      BEHAVIORAL_SEMANTIC_MAP,
    ),
  );

  return allCandidates;
}

/**
 * @deprecated Use generateCandidates() or scanRegexCandidates() instead.
 * This function is retained for backward compatibility with code that
 * expects EnforcementRule[] output. It does NOT cause blocks — the calling
 * code should be migrated to use the 3-phase pipeline.
 *
 * Prefer generateCandidates(content, fileName, context) which has a simpler
 * signature and wraps ALL T1 detectors (runtime + TUI + adversarial + container).
 */
export function detectAllT1Violations(code: string, context: CodeContext): EnforcementRule[] {
  return ALL_T1_RULES.filter(rule => rule.detector.detect(code, context));
}

export {
  RUNTIME_GRADE_ENFORCEMENT_RULES,
  TUI_TESTING_ENFORCEMENT_RULES,
  ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES,
  CONTAINER_TESTING_ENFORCEMENT_RULES,
  detectAllViolations,
  evaluateCodeAgainstChecklist,
  getDetectorById,
  validateTestingProtocol,
  detectAllTuiViolations,
  detectAdversarialViolations,
  detectContainerTestingViolations,
  isTypeScriptFile,
  // scanRegexCandidates is already exported via `export function` above
  // ── Candidate Generator (Phase 0 tip-of-spear) ──
  // generateCandidates() runs ALL T1 detectors and returns candidates ONLY.
  // It NEVER blocks. Use this for the 3-phase semantic enforcement pipeline.
  generateCandidates,
  getSemanticMapping,
  getRuntimeSemanticMap,
};
