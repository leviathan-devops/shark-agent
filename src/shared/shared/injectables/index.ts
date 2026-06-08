import { RUNTIME_GRADE_ENFORCEMENT_RULES, type ViolationDetector, type EnforcementRule, type CodeContext, detectAllViolations, evaluateCodeAgainstChecklist, getDetectorById } from './t1-runtime-grade-engineering.js';
import { TUI_TESTING_ENFORCEMENT_RULES, validateTestingProtocol, detectAllTuiViolations } from './t1-t2-tui-testing.js';
import { ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES, detectAdversarialViolations } from './t1-adversarial-pressure.js';
import { CONTAINER_TESTING_ENFORCEMENT_RULES, detectContainerTestingViolations } from './t1-container-testing.js';

export type { ViolationDetector, EnforcementRule, CodeContext };

export const ALL_T1_RULES: EnforcementRule[] = [
  ...RUNTIME_GRADE_ENFORCEMENT_RULES,
  ...TUI_TESTING_ENFORCEMENT_RULES,
  ...ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES,
  ...CONTAINER_TESTING_ENFORCEMENT_RULES,
];

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
};
