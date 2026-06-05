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
