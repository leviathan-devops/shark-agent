export interface SemanticFinding {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  file: string;
  line: number;
}

export interface RuleLayer {
  passed: boolean;
  findings: string[];
}

/**
 * M4: BlindSpotReport — mandatory honesty field on every RGE audit.
 * Declares what the engine CANNOT see so downstream consumers never
 * mistake an incomplete scan for a clean bill of health.
 */
export interface BlindSpotReport {
  callGraphCoverage: number;    // 0.0-1.0 — fraction of functions analyzed
  typeCheckerAvailable: boolean; // Was TypeChecker functional?
  isSelfAudit: boolean;         // Is the agent auditing its own code?
  preflightAvailable: boolean;  // Was preflight (tsc + bun build) run?
  limitations: string[];        // What the engine CANNOT see
}

export interface RGEAuditReport {
  overallPassed: boolean;
  passRate: number;
  layers: {
    l0_syntactic: RuleLayer;
    l1_type_contract: RuleLayer;
    l2_control_flow: RuleLayer;
    l3_architecture: RuleLayer;
    l4_side_effect_truth: RuleLayer;
    l5_pattern_db: RuleLayer;
  };
  semanticFindings: SemanticFinding[];
  returnTo: 'coder' | 'reviewer' | 'test_engineer';
  fixInstructions: string[];
  evidencePath: string;
  blindSpots: BlindSpotReport;  // M4: MANDATORY on every report
}

export interface SourcePresenceResult {
  allFilesPresent: boolean;
  missing: string[];
}

export interface SideEffectRecord {
  hasSideEffect: boolean;
  effectType: string | null;
  effectLocation: string | null;
}
